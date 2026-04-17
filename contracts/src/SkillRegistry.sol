// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Types} from "./Types.sol";

/// @title SkillRegistry
/// @notice Hard-coded metadata for the 9 MVP skills (3 sects × 3 skills).
/// @dev Pure view functions — can be used as a library by the engine without deployment,
///      but we also deploy a singleton so off-chain clients can read metadata via RPC.
contract SkillRegistry {
    using Types for Types.Skill;

    // ---------------------------------------------------------------------
    // Skill id layout:
    //   0  少林·金钟罩   (Buff)
    //   1  少林·易筋经   (Heal)
    //   2  少林·狮子吼   (Control, AoE)
    //   3  唐门·穿心刺   (Damage, single)
    //   4  唐门·暗器急雨 (Damage, AoE)
    //   5  唐门·毒针     (Dot, single)
    //   6  峨眉·慈航普渡 (Heal, AoE)
    //   7  峨眉·净心咒   (Buff cleanse, represented as Buff kind)
    //   8  峨眉·般若掌   (Damage + Control, single)
    // ---------------------------------------------------------------------
    uint8 public constant SKILL_COUNT = 9;

    /// @notice Return the full Skill record for a skill id.
    /// @param skillId 0..8 per layout above; reverts if out of range.
    function getSkill(uint8 skillId) external pure returns (Types.Skill memory) {
        return _skill(skillId);
    }

    /// @notice Skill ids belonging to a sect (always length 3).
    function sectSkills(Types.Sect sect) external pure returns (uint8[3] memory ids) {
        if (sect == Types.Sect.Shaolin) return [uint8(0), uint8(1), uint8(2)];
        if (sect == Types.Sect.Tangmen) return [uint8(3), uint8(4), uint8(5)];
        return [uint8(6), uint8(7), uint8(8)];
    }

    /// @notice Human-readable skill name (utf-8 bytes). Rendering is client-side.
    function skillName(uint8 skillId) external pure returns (string memory) {
        if (skillId == 0) return unicode"金钟罩";
        if (skillId == 1) return unicode"易筋经";
        if (skillId == 2) return unicode"狮子吼";
        if (skillId == 3) return unicode"穿心刺";
        if (skillId == 4) return unicode"暗器急雨";
        if (skillId == 5) return unicode"毒针";
        if (skillId == 6) return unicode"慈航普渡";
        if (skillId == 7) return unicode"净心咒";
        if (skillId == 8) return unicode"般若掌";
        revert("SkillRegistry: unknown skill");
    }

    // ---------------------------------------------------------------------
    // Internal: pure resolver reused by the engine
    // ---------------------------------------------------------------------

    /// @dev Must stay `pure` — BattleEngine depends on this being callable in library context.
    function _skill(uint8 skillId) internal pure returns (Types.Skill memory s) {
        // Shaolin
        if (skillId == 0) {
            // 金钟罩: self buff, +30% DEF for 2 rounds
            s.kind       = Types.SkillKind.Buff;
            s.multiplier = 3000; // +30% of current DEF (computed in engine)
            s.duration   = 2;
            s.nameHash   = keccak256(bytes(unicode"金钟罩"));
            s.aoe        = false;
            return s;
        }
        if (skillId == 1) {
            // 易筋经: self heal flat +30 HP
            s.kind       = Types.SkillKind.Heal;
            s.multiplier = 3000; // 30% of maxHp
            s.duration   = 0;
            s.nameHash   = keccak256(bytes(unicode"易筋经"));
            s.aoe        = false;
            return s;
        }
        if (skillId == 2) {
            // 狮子吼: AoE control 1 round
            s.kind       = Types.SkillKind.Control;
            s.multiplier = 0;
            s.duration   = 1;
            s.nameHash   = keccak256(bytes(unicode"狮子吼"));
            s.aoe        = true;
            return s;
        }
        // Tangmen
        if (skillId == 3) {
            // 穿心刺: single target 150% ATK
            s.kind       = Types.SkillKind.Damage;
            s.multiplier = 15000;
            s.duration   = 0;
            s.nameHash   = keccak256(bytes(unicode"穿心刺"));
            s.aoe        = false;
            return s;
        }
        if (skillId == 4) {
            // 暗器急雨: AoE 80% ATK
            s.kind       = Types.SkillKind.Damage;
            s.multiplier = 8000;
            s.duration   = 0;
            s.nameHash   = keccak256(bytes(unicode"暗器急雨"));
            s.aoe        = true;
            return s;
        }
        if (skillId == 5) {
            // 毒针: Dot 10% target.maxHp for 3 rounds
            s.kind       = Types.SkillKind.Dot;
            s.multiplier = 1000; // 10% of target.maxHp per tick
            s.duration   = 3;
            s.nameHash   = keccak256(bytes(unicode"毒针"));
            s.aoe        = false;
            return s;
        }
        // Emei
        if (skillId == 6) {
            // 慈航普渡: AoE heal, each ally +20% maxHp
            s.kind       = Types.SkillKind.Heal;
            s.multiplier = 2000;
            s.duration   = 0;
            s.nameHash   = keccak256(bytes(unicode"慈航普渡"));
            s.aoe        = true;
            return s;
        }
        if (skillId == 7) {
            // 净心咒: cleanse — represented as Buff with multiplier=0, engine clears debuffs
            s.kind       = Types.SkillKind.Buff;
            s.multiplier = 0;
            s.duration   = 0;
            s.nameHash   = keccak256(bytes(unicode"净心咒"));
            s.aoe        = true; // cleanses all allies
            return s;
        }
        if (skillId == 8) {
            // 般若掌: 120% ATK + silence 1 round
            s.kind       = Types.SkillKind.Damage;
            s.multiplier = 12000;
            s.duration   = 1; // also applies control
            s.nameHash   = keccak256(bytes(unicode"般若掌"));
            s.aoe        = false;
            return s;
        }
        revert("SkillRegistry: unknown skill");
    }
}

/// @notice Pure library variant that BattleEngine uses directly (no external call).
/// @dev Identical data as the `SkillRegistry` contract. Kept as a separate library
///      so simulate() stays `pure` without needing a deployed registry.
library SkillBook {
    function get(uint8 skillId) internal pure returns (Types.Skill memory s) {
        if (skillId == 0) {
            s.kind = Types.SkillKind.Buff;       s.multiplier = 3000;  s.duration = 2;
            s.nameHash = keccak256(bytes(unicode"金钟罩"));     s.aoe = false; return s;
        }
        if (skillId == 1) {
            s.kind = Types.SkillKind.Heal;       s.multiplier = 3000;  s.duration = 0;
            s.nameHash = keccak256(bytes(unicode"易筋经"));     s.aoe = false; return s;
        }
        if (skillId == 2) {
            s.kind = Types.SkillKind.Control;    s.multiplier = 0;     s.duration = 1;
            s.nameHash = keccak256(bytes(unicode"狮子吼"));     s.aoe = true;  return s;
        }
        if (skillId == 3) {
            s.kind = Types.SkillKind.Damage;     s.multiplier = 15000; s.duration = 0;
            s.nameHash = keccak256(bytes(unicode"穿心刺"));     s.aoe = false; return s;
        }
        if (skillId == 4) {
            s.kind = Types.SkillKind.Damage;     s.multiplier = 8000;  s.duration = 0;
            s.nameHash = keccak256(bytes(unicode"暗器急雨"));   s.aoe = true;  return s;
        }
        if (skillId == 5) {
            s.kind = Types.SkillKind.Dot;        s.multiplier = 1000;  s.duration = 3;
            s.nameHash = keccak256(bytes(unicode"毒针"));       s.aoe = false; return s;
        }
        if (skillId == 6) {
            s.kind = Types.SkillKind.Heal;       s.multiplier = 2000;  s.duration = 0;
            s.nameHash = keccak256(bytes(unicode"慈航普渡"));   s.aoe = true;  return s;
        }
        if (skillId == 7) {
            s.kind = Types.SkillKind.Buff;       s.multiplier = 0;     s.duration = 0;
            s.nameHash = keccak256(bytes(unicode"净心咒"));     s.aoe = true;  return s;
        }
        if (skillId == 8) {
            s.kind = Types.SkillKind.Damage;     s.multiplier = 12000; s.duration = 1;
            s.nameHash = keccak256(bytes(unicode"般若掌"));     s.aoe = false; return s;
        }
        revert("SkillBook: unknown skill");
    }
}
