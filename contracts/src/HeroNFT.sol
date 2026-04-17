// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

import {Types} from "./Types.sol";
import {SkillRegistry} from "./SkillRegistry.sol";

/// @title HeroNFT
/// @notice ERC-721 of Jianghu heroes. One `mintGenesis` per address which
///         forges three heroes (one per sect) with attributes derived from
///         tokenId + a light on-chain entropy blob.
/// @dev Attribute formulas are intentionally simple and reproducible off-chain.
contract HeroNFT is ERC721, Ownable {
    using Strings for uint256;

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @notice Next token id to mint. Starts at 1 so #0 is "empty / invalid".
    uint256 public nextTokenId = 1;

    /// @notice Each player may only call `mintGenesis` once.
    mapping(address => bool) public hasGenesisMinted;

    /// @notice On-chain hero record keyed by tokenId.
    mapping(uint256 => Types.Hero) private _heroes;

    /// @notice Optional metadata base URI (skill reads this to hint OpenSea render).
    string private _baseTokenURI;

    /// @notice Read-only registry so wallets can resolve skill metadata without bundling ABI.
    SkillRegistry public immutable registry;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event GenesisMinted(address indexed to, uint256[3] tokenIds);
    event BaseURIUpdated(string newBaseURI);

    // ---------------------------------------------------------------------
    // Construction
    // ---------------------------------------------------------------------

    constructor(address initialOwner, SkillRegistry registry_)
        ERC721(unicode"江湖侠客", "JHHERO")
        Ownable(initialOwner)
    {
        registry = registry_;
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setBaseURI(string calldata uri) external onlyOwner {
        _baseTokenURI = uri;
        emit BaseURIUpdated(uri);
    }

    // ---------------------------------------------------------------------
    // Public mint
    // ---------------------------------------------------------------------

    /// @notice Free one-shot mint: 3 heroes, one per sect. Paymaster-friendly.
    /// @param to  Recipient. Typically the MPC wallet address from OnchainOS WaaS.
    /// @return tokenIds The three newly minted token ids (sect order: Shaolin, Tangmen, Emei).
    function mintGenesis(address to)
        external
        returns (uint256[3] memory tokenIds)
    {
        require(to != address(0), "HeroNFT: zero recipient");
        require(!hasGenesisMinted[to], "HeroNFT: already minted");
        hasGenesisMinted[to] = true;

        for (uint8 i = 0; i < 3; i++) {
            Types.Sect sect = Types.Sect(i);
            uint256 id = nextTokenId++;
            tokenIds[i] = id;

            _heroes[id] = _generateHero(id, sect, to);
            _safeMint(to, id);
        }

        emit GenesisMinted(to, tokenIds);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Full Hero record for a tokenId. Reverts if not minted.
    function getHero(uint256 tokenId) external view returns (Types.Hero memory) {
        _requireOwned(tokenId);
        return _heroes[tokenId];
    }

    /// @notice Batch lookup used by the skill to hydrate a roster in one RPC call.
    function getHeroes(uint256[] calldata ids) external view returns (Types.Hero[] memory out) {
        out = new Types.Hero[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            _requireOwned(ids[i]);
            out[i] = _heroes[ids[i]];
        }
    }

    /// @notice Fetch an entire team as a fixed-size array (for BattleEngine input shape).
    /// @dev Reverts unless caller passes exactly 3 ids; each must be minted.
    function getTeam(uint256[3] calldata ids) external view returns (Types.Hero[3] memory out) {
        for (uint256 i = 0; i < 3; i++) {
            _requireOwned(ids[i]);
            out[i] = _heroes[ids[i]];
        }
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        if (bytes(_baseTokenURI).length == 0) return "";
        return string.concat(_baseTokenURI, tokenId.toString());
    }

    // ---------------------------------------------------------------------
    // Internal: attribute generation
    // ---------------------------------------------------------------------

    /// @dev Deterministic-enough per-hero stats based on (tokenId, sect, owner, prevrandao).
    ///      Ranges follow PRD §5.2. Sect biases the rolls.
    function _generateHero(uint256 tokenId, Types.Sect sect, address owner_)
        internal
        view
        returns (Types.Hero memory h)
    {
        uint256 seed = uint256(keccak256(
            abi.encode(tokenId, sect, owner_, block.prevrandao, block.chainid)
        ));

        // Base random rolls
        uint16 hpRoll   = uint16(seed % 101);              // 0..100
        uint16 atkRoll  = uint16((seed >> 16) % 41);       // 0..40
        uint16 defRoll  = uint16((seed >> 32) % 61);       // 0..60
        uint16 spdRoll  = uint16((seed >> 48) % 51);       // 0..50
        uint16 critRoll = uint16((seed >> 64) % 3001);     // 0..30.00%

        uint16 hp;  uint16 atk;  uint16 def;  uint16 spd;  uint16 crit;

        if (sect == Types.Sect.Shaolin) {
            hp   = 150 + hpRoll;      // 150..250 (tanky)
            atk  = 60  + atkRoll;     // 60..100
            def  = 80  + defRoll;     // 80..140
            spd  = 50  + spdRoll / 2; // 50..75   (slow)
            crit = critRoll / 3;      // 0..10%
        } else if (sect == Types.Sect.Tangmen) {
            hp   = 100 + hpRoll / 2;  // 100..150 (frail)
            atk  = 80  + atkRoll;     // 80..120
            def  = 40  + defRoll / 2; // 40..70
            spd  = 80  + spdRoll / 2; // 80..105
            crit = 500 + critRoll;    // 5..35%
        } else {
            // Emei — balanced / fast utility
            hp   = 120 + hpRoll * 2 / 3;
            atk  = 70  + atkRoll;
            def  = 50  + defRoll / 2;
            spd  = 75  + spdRoll / 2;
            crit = critRoll / 2;      // 0..15%
        }

        uint8[3] memory skillIds = registry.sectSkills(sect);
        uint8[] memory skills = new uint8[](3);
        skills[0] = skillIds[0];
        skills[1] = skillIds[1];
        skills[2] = skillIds[2];

        h = Types.Hero({
            tokenId: tokenId,
            sect:    sect,
            hp:      hp,
            atk:     atk,
            def:     def,
            spd:     spd,
            crit:    crit,
            skillIds: skills
        });
    }
}
