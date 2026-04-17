// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test}    from "forge-std/Test.sol";
import {Vm}      from "forge-std/Vm.sol";

import {Types}         from "../src/Types.sol";
import {SkillRegistry} from "../src/SkillRegistry.sol";
import {HeroNFT}       from "../src/HeroNFT.sol";
import {Arena}         from "../src/Arena.sol";

/// @title Arena integration tests
/// @notice End-to-end path: mint -> setDefense -> challenge / startPve -> read report.
contract ArenaTest is Test {
    SkillRegistry registry;
    HeroNFT       nft;
    Arena         arena;

    address alice = address(0xA11CE);
    address bob   = address(0xB0B);

    function setUp() public {
        registry = new SkillRegistry();
        nft      = new HeroNFT(address(this), registry);
        arena    = new Arena(nft);

        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);
    }

    // ---------------------------------------------------------------------
    // Mint
    // ---------------------------------------------------------------------
    function testMintGenesis() public {
        vm.prank(alice);
        uint256[3] memory ids = nft.mintGenesis(alice);

        assertEq(ids[0], 1);
        assertEq(ids[1], 2);
        assertEq(ids[2], 3);
        assertEq(nft.ownerOf(1), alice);
        assertEq(nft.ownerOf(2), alice);
        assertEq(nft.ownerOf(3), alice);

        // Re-mint reverts
        vm.expectRevert(bytes("HeroNFT: already minted"));
        vm.prank(alice);
        nft.mintGenesis(alice);

        // Shape checks: one per sect
        Types.Hero memory h0 = nft.getHero(ids[0]);
        Types.Hero memory h1 = nft.getHero(ids[1]);
        Types.Hero memory h2 = nft.getHero(ids[2]);
        assertEq(uint8(h0.sect), uint8(Types.Sect.Shaolin));
        assertEq(uint8(h1.sect), uint8(Types.Sect.Tangmen));
        assertEq(uint8(h2.sect), uint8(Types.Sect.Emei));

        // Each hero has 3 skills
        assertEq(h0.skillIds.length, 3);
        assertEq(h1.skillIds.length, 3);
        assertEq(h2.skillIds.length, 3);
    }

    // ---------------------------------------------------------------------
    // PVE
    // ---------------------------------------------------------------------
    function testPveFlow() public {
        vm.prank(alice);
        uint256[3] memory ids = nft.mintGenesis(alice);

        vm.prank(alice);
        bytes32 battleId = arena.startPve(ids, 1);
        assertTrue(battleId != bytes32(0), "battleId set");

        Types.BattleReport memory report = arena.getBattleReport(battleId);
        assertEq(report.battleId, battleId);
        assertEq(report.attacker, alice);
        assertEq(report.defender, address(0));
        assertTrue(report.winner <= 2);
        assertTrue(report.events.length > 0, "events recorded");
        assertTrue(report.totalRounds > 0, "rounds recorded");
    }

    // ---------------------------------------------------------------------
    // PVP: mint -> setDefense -> challenge -> read
    // ---------------------------------------------------------------------
    function testPvpFlow() public {
        vm.prank(alice);
        uint256[3] memory aliceIds = nft.mintGenesis(alice);

        vm.prank(bob);
        uint256[3] memory bobIds = nft.mintGenesis(bob);

        vm.prank(alice);
        arena.setDefenseTeam(aliceIds);

        vm.prank(bob);
        arena.setDefenseTeam(bobIds);

        uint256[3] memory savedAlice = arena.getDefenseTeam(alice);
        assertEq(savedAlice[0], aliceIds[0]);
        assertEq(savedAlice[1], aliceIds[1]);
        assertEq(savedAlice[2], aliceIds[2]);

        vm.prank(alice);
        bytes32 battleId = arena.challenge(bob);

        Types.BattleReport memory rep = arena.getBattleReport(battleId);
        assertEq(rep.attacker, alice);
        assertEq(rep.defender, bob);
        assertTrue(rep.events.length > 0);
    }

    function testChallengeRequiresTeam() public {
        vm.prank(alice);
        uint256[3] memory aliceIds = nft.mintGenesis(alice);

        vm.prank(alice);
        arena.setDefenseTeam(aliceIds);

        // Bob never set team
        vm.prank(alice);
        vm.expectRevert(bytes("Arena: defender no team"));
        arena.challenge(bob);
    }

    function testSelfChallengeReverts() public {
        vm.prank(alice);
        uint256[3] memory ids = nft.mintGenesis(alice);

        vm.prank(alice);
        arena.setDefenseTeam(ids);

        vm.prank(alice);
        vm.expectRevert(bytes("Arena: self-challenge"));
        arena.challenge(alice);
    }

    // ---------------------------------------------------------------------
    // Defense ownership guard
    // ---------------------------------------------------------------------
    function testSetDefenseRequiresOwnership() public {
        vm.prank(alice);
        uint256[3] memory aliceIds = nft.mintGenesis(alice);

        // Bob tries to use alice's ids
        vm.prank(bob);
        vm.expectRevert(bytes("Arena: not owner"));
        arena.setDefenseTeam(aliceIds);
    }

    // ---------------------------------------------------------------------
    // Arena roster / listing
    // ---------------------------------------------------------------------
    function testListArena() public {
        vm.prank(alice);
        uint256[3] memory a = nft.mintGenesis(alice);
        vm.prank(bob);
        uint256[3] memory b = nft.mintGenesis(bob);

        vm.prank(alice); arena.setDefenseTeam(a);
        vm.prank(bob);   arena.setDefenseTeam(b);

        (address[] memory players, uint256[] memory powers) = arena.listArena(0, 10);
        assertEq(players.length, 2);
        assertEq(powers.length, 2);
        assertTrue(powers[0] > 0);
        assertTrue(powers[1] > 0);

        // Pagination: offset beyond length -> empty
        (address[] memory p2, ) = arena.listArena(100, 10);
        assertEq(p2.length, 0);
    }

    // ---------------------------------------------------------------------
    // EIP-712 relay signature
    // ---------------------------------------------------------------------
    function testChallengeRelay() public {
        uint256 aliceKey = 0xA11CE;
        address aliceAddr = vm.addr(aliceKey);

        // Fund + mint for signer
        vm.deal(aliceAddr, 1 ether);
        vm.prank(aliceAddr);
        uint256[3] memory aliceIds = nft.mintGenesis(aliceAddr);
        vm.prank(aliceAddr);
        arena.setDefenseTeam(aliceIds);

        vm.prank(bob);
        uint256[3] memory bobIds = nft.mintGenesis(bob);
        vm.prank(bob);
        arena.setDefenseTeam(bobIds);

        uint64 nonce = arena.playerNonce(aliceAddr);
        assertEq(nonce, 0);

        uint256 deadline = block.timestamp + 1 hours;
        bytes32 domainSep = arena.domainSeparator();

        bytes32 structHash = keccak256(abi.encode(
            arena.CHALLENGE_TYPEHASH(),
            aliceAddr,
            bob,
            nonce,
            deadline
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSep, structHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(aliceKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        // Relay from bob's address (paymaster-style)
        vm.prank(bob);
        bytes32 battleId = arena.challengeRelay(aliceAddr, bob, deadline, sig);

        assertEq(arena.playerNonce(aliceAddr), 1);
        Types.BattleReport memory rep = arena.getBattleReport(battleId);
        assertEq(rep.attacker, aliceAddr);
        assertEq(rep.defender, bob);
    }

    function testBadRelaySignatureReverts() public {
        uint256 aliceKey = 0xA11CE;
        uint256 eveKey   = 0xEEE;
        address aliceAddr = vm.addr(aliceKey);

        vm.prank(aliceAddr);
        uint256[3] memory aliceIds = nft.mintGenesis(aliceAddr);
        vm.prank(aliceAddr);
        arena.setDefenseTeam(aliceIds);

        vm.prank(bob);
        uint256[3] memory bobIds = nft.mintGenesis(bob);
        vm.prank(bob);
        arena.setDefenseTeam(bobIds);

        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(abi.encode(
            arena.CHALLENGE_TYPEHASH(),
            aliceAddr,
            bob,
            uint64(0),
            deadline
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", arena.domainSeparator(), structHash));

        // Sign with WRONG key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(eveKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.expectRevert(bytes("Arena: bad signature"));
        arena.challengeRelay(aliceAddr, bob, deadline, sig);
    }

    // ---------------------------------------------------------------------
    // BattleSettled event emitted
    // ---------------------------------------------------------------------
    function testBattleSettledEmitted() public {
        vm.prank(alice);
        uint256[3] memory ids = nft.mintGenesis(alice);

        vm.recordLogs();
        vm.prank(alice);
        arena.startPve(ids, 1);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 topic = keccak256("BattleSettled(bytes32,address,address,uint8,uint8,uint64)");
        bool found;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length > 0 && logs[i].topics[0] == topic) {
                found = true;
                break;
            }
        }
        assertTrue(found, "BattleSettled event missing");
    }
}
