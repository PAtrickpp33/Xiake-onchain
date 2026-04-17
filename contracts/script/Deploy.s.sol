// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {SkillRegistry} from "../src/SkillRegistry.sol";
import {HeroNFT}       from "../src/HeroNFT.sol";
import {Arena}         from "../src/Arena.sol";

/// @title Deploy
/// @notice Deploys the Jianghu contract stack to Base Sepolia (or any EVM chain).
/// @dev    Env:
///           DEPLOYER_PK         — deployer private key
///           BASE_SEPOLIA_RPC    — RPC url (or BASE_RPC for mainnet)
///           BASESCAN_KEY        — for `--verify` via Etherscan-compatible API
///         Run:
///           forge script script/Deploy.s.sol \
///             --rpc-url $BASE_SEPOLIA_RPC \
///             --private-key $DEPLOYER_PK \
///             --broadcast --verify -vvv
contract Deploy is Script {
    function run() external returns (
        SkillRegistry registry,
        HeroNFT nft,
        Arena arena
    ) {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address deployer = vm.addr(pk);

        console2.log("Deployer:", deployer);
        console2.log("ChainId:", block.chainid);

        vm.startBroadcast(pk);

        registry = new SkillRegistry();
        console2.log("SkillRegistry:", address(registry));

        nft = new HeroNFT(deployer, registry);
        console2.log("HeroNFT:", address(nft));

        arena = new Arena(nft);
        console2.log("Arena:", address(arena));

        vm.stopBroadcast();

        // Small human-readable summary for the skill package.
        console2.log("---");
        console2.log("Copy into skill/src/chain/contracts.ts:");
        console2.log("  registry =", address(registry));
        console2.log("  heroNft  =", address(nft));
        console2.log("  arena    =", address(arena));
    }
}
