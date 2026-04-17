// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test}    from "forge-std/Test.sol";
import {Types}   from "../src/Types.sol";
import {BattleEngine} from "../src/BattleEngine.sol";
import {SkillBook}    from "../src/SkillRegistry.sol";

/// @title BattleEngine unit tests
/// @notice One test per core branch: damage / heal / crit / control.
contract BattleEngineTest is Test {
    // Helpers --------------------------------------------------------------

    function _hero(
        uint256 tokenId, Types.Sect sect,
        uint16 hp, uint16 atk, uint16 def, uint16 spd, uint16 crit,
        uint8 s1, uint8 s2, uint8 s3
    ) internal pure returns (Types.Hero memory h) {
        uint8[] memory sk = new uint8[](3);
        sk[0] = s1; sk[1] = s2; sk[2] = s3;
        h = Types.Hero({
            tokenId: tokenId, sect: sect,
            hp: hp, atk: atk, def: def, spd: spd, crit: crit,
            skillIds: sk
        });
    }

    // Lock all three skill slots to a single id so the PRNG cannot deviate.
    function _singleSkillHero(
        uint256 tokenId, Types.Sect sect,
        uint16 hp, uint16 atk, uint16 def, uint16 spd, uint16 crit,
        uint8 skillId
    ) internal pure returns (Types.Hero memory) {
        return _hero(tokenId, sect, hp, atk, def, spd, crit, skillId, skillId, skillId);
    }

    function _zeroHero(uint256 tokenId) internal pure returns (Types.Hero memory) {
        return _singleSkillHero(tokenId, Types.Sect.Shaolin, 1, 1, 1, 1, 0, 0);
    }

    // ---------------------------------------------------------------------
    // 1. Direct damage: Tangmen 穿心刺 (skill 3)
    // ---------------------------------------------------------------------
    function testDirectDamage() public {
        Types.Hero[3] memory a;
        a[0] = _singleSkillHero(1, Types.Sect.Tangmen, 100, 100, 40, 100, 0, 3);
        a[1] = _zeroHero(2);
        a[2] = _zeroHero(3);

        Types.Hero[3] memory b;
        b[0] = _singleSkillHero(11, Types.Sect.Shaolin, 500, 10, 40, 10, 0, 3);
        b[1] = _zeroHero(12);
        b[2] = _zeroHero(13);

        (uint8 winner, Types.BattleEvent[] memory ev) = BattleEngine.simulate(a, b, 0xBEEF);

        // Attacker should win: huge DPS vs very low-hp decoys
        assertEq(winner, 0, "attacker wins");

        // Find at least one damage event (hpDelta < 0) inflicted by slot 0 on enemies
        bool sawDamage;
        for (uint256 i = 0; i < ev.length; i++) {
            if (ev[i].actorIdx == 0 && ev[i].hpDelta < 0 && ev[i].targetIdx >= 3) {
                sawDamage = true;
                break;
            }
        }
        assertTrue(sawDamage, "should record a damage event from slot 0");
    }

    // ---------------------------------------------------------------------
    // 2. Heal: Emei 慈航普渡 (skill 6, AoE heal)
    // ---------------------------------------------------------------------
    function testAoeHeal() public {
        // Side A: 3 heroes at low HP (maxHp 200, current 50) spamming 慈航普渡
        Types.Hero[3] memory a;
        a[0] = _singleSkillHero(1, Types.Sect.Emei,  200, 50, 50, 90, 0, 6);
        a[1] = _singleSkillHero(2, Types.Sect.Emei,  200, 50, 50, 90, 0, 6);
        a[2] = _singleSkillHero(3, Types.Sect.Emei,  200, 50, 50, 90, 0, 6);
        // We can't edit hp via the Hero struct (it's the max), so the heal cap test
        // proves no heal event exceeds (maxHp - startingHp). Starting hp == maxHp,
        // so heal clamps to 0 on first round for non-damaged heroes. Use a shaper:
        // shrink maxHp by setting low HP heroes → they'll start at full but heal 0.
        // Instead we verify heal events are recorded with hpDelta >= 0 when damage
        // has occurred.

        Types.Hero[3] memory b;
        b[0] = _singleSkillHero(11, Types.Sect.Tangmen, 100, 60, 40, 80, 0, 3);
        b[1] = _singleSkillHero(12, Types.Sect.Tangmen, 100, 60, 40, 80, 0, 3);
        b[2] = _singleSkillHero(13, Types.Sect.Tangmen, 100, 60, 40, 80, 0, 3);

        (, Types.BattleEvent[] memory ev) = BattleEngine.simulate(a, b, 0xCAFE);

        // Expect at least one heal event (flag FLAG_HEAL) after some damage has been taken.
        bool sawHeal;
        for (uint256 i = 0; i < ev.length; i++) {
            if (ev[i].flags & Types.FLAG_HEAL != 0 && ev[i].hpDelta > 0) {
                sawHeal = true;
                break;
            }
        }
        assertTrue(sawHeal, "should see at least one positive heal");
    }

    // ---------------------------------------------------------------------
    // 3. Crit: 100% crit rate must flag FLAG_CRIT on every damage dealt
    // ---------------------------------------------------------------------
    function testCrit() public {
        Types.Hero[3] memory a;
        a[0] = _singleSkillHero(1, Types.Sect.Tangmen, 100, 100, 40, 100, 10000, 3); // 100% crit
        a[1] = _zeroHero(2);
        a[2] = _zeroHero(3);

        Types.Hero[3] memory b;
        b[0] = _singleSkillHero(11, Types.Sect.Shaolin, 500, 10, 40, 10, 0, 3);
        b[1] = _zeroHero(12);
        b[2] = _zeroHero(13);

        (, Types.BattleEvent[] memory ev) = BattleEngine.simulate(a, b, 42);

        // Every damage dealt by slot 0 must carry FLAG_CRIT
        bool sawCrit;
        for (uint256 i = 0; i < ev.length; i++) {
            if (ev[i].actorIdx == 0 && ev[i].hpDelta < 0) {
                assertTrue(ev[i].flags & Types.FLAG_CRIT != 0, "damage must be crit");
                sawCrit = true;
            }
        }
        assertTrue(sawCrit, "at least one crit event");
    }

    // ---------------------------------------------------------------------
    // 4. Control: 狮子吼 (skill 2) silences enemies and produces FLAG_MISS
    //    on silenced enemies' turns.
    // ---------------------------------------------------------------------
    function testControl() public {
        // A = one Shaolin spammer of 狮子吼, two idle. High SPD so it goes first.
        Types.Hero[3] memory a;
        a[0] = _singleSkillHero(1, Types.Sect.Shaolin, 500, 50, 100, 120, 0, 2);
        a[1] = _singleSkillHero(2, Types.Sect.Shaolin, 500, 10, 100, 120, 0, 2);
        a[2] = _singleSkillHero(3, Types.Sect.Shaolin, 500, 10, 100, 120, 0, 2);

        Types.Hero[3] memory b;
        b[0] = _singleSkillHero(11, Types.Sect.Tangmen, 500, 60, 40, 50, 0, 3);
        b[1] = _singleSkillHero(12, Types.Sect.Tangmen, 500, 60, 40, 50, 0, 3);
        b[2] = _singleSkillHero(13, Types.Sect.Tangmen, 500, 60, 40, 50, 0, 3);

        (, Types.BattleEvent[] memory ev) = BattleEngine.simulate(a, b, 0xDEAD);

        // Must see at least one control event (actorIdx in {0..2}, skillId 2)
        bool sawControl;
        // And at least one miss-flagged skipped-turn (flags & FLAG_MISS, actor in {3..5})
        bool sawSilenced;

        for (uint256 i = 0; i < ev.length; i++) {
            Types.BattleEvent memory e = ev[i];
            if (e.skillId == 2 && e.actorIdx < 3 && (e.flags & Types.FLAG_CONTROL != 0)) {
                sawControl = true;
            }
            if (e.actorIdx >= 3 && (e.flags & Types.FLAG_MISS != 0)) {
                sawSilenced = true;
            }
        }
        assertTrue(sawControl, "should emit control event");
        assertTrue(sawSilenced, "silenced enemy should skip turn");
    }

    // ---------------------------------------------------------------------
    // 5. Invariant: simulate always terminates within 30 rounds
    // ---------------------------------------------------------------------
    function testTerminates() public {
        Types.Hero[3] memory a;
        a[0] = _singleSkillHero(1, Types.Sect.Shaolin, 200, 10, 100, 60, 0, 0);
        a[1] = _singleSkillHero(2, Types.Sect.Shaolin, 200, 10, 100, 60, 0, 0);
        a[2] = _singleSkillHero(3, Types.Sect.Shaolin, 200, 10, 100, 60, 0, 0);

        Types.Hero[3] memory b;
        b[0] = _singleSkillHero(11, Types.Sect.Shaolin, 200, 10, 100, 60, 0, 0);
        b[1] = _singleSkillHero(12, Types.Sect.Shaolin, 200, 10, 100, 60, 0, 0);
        b[2] = _singleSkillHero(13, Types.Sect.Shaolin, 200, 10, 100, 60, 0, 0);

        (uint8 winner, Types.BattleEvent[] memory ev) = BattleEngine.simulate(a, b, 1);
        assertTrue(winner <= 2, "winner valid");
        if (ev.length > 0) {
            assertLe(uint256(ev[ev.length - 1].round), uint256(BattleEngine.MAX_ROUNDS));
        }
    }

    // ---------------------------------------------------------------------
    // 6. computeDamage min-1 floor & crit multiplier
    // ---------------------------------------------------------------------
    function testComputeDamageFloor() public {
        // 10% ATK * 10 atk - 0.5 * 200 def = 1 - 100 → floored to 1
        uint16 dmg = BattleEngine.computeDamage(10, 200, 1000, 0, false);
        assertEq(uint256(dmg), 1);
    }

    function testComputeDamageCrit() public {
        uint16 normal = BattleEngine.computeDamage(100, 0, 10000, 0, false);
        uint16 crit   = BattleEngine.computeDamage(100, 0, 10000, 0, true);
        assertEq(uint256(normal), 100);
        assertEq(uint256(crit), 150); // 100 * 1.5
    }

    // ---------------------------------------------------------------------
    // 7. Determinism: same inputs => same event stream
    // ---------------------------------------------------------------------
    function testDeterministic() public {
        Types.Hero[3] memory a;
        a[0] = _singleSkillHero(1, Types.Sect.Tangmen, 150, 90, 50, 95, 1500, 3);
        a[1] = _singleSkillHero(2, Types.Sect.Emei,    180, 70, 60, 85, 1000, 6);
        a[2] = _singleSkillHero(3, Types.Sect.Shaolin, 220, 70, 100, 60, 500, 0);

        Types.Hero[3] memory b;
        b[0] = _singleSkillHero(11, Types.Sect.Tangmen, 140, 95, 50, 100, 2000, 3);
        b[1] = _singleSkillHero(12, Types.Sect.Emei,    170, 72, 55, 80, 1000, 6);
        b[2] = _singleSkillHero(13, Types.Sect.Shaolin, 210, 65, 105, 55, 0, 0);

        (uint8 w1, Types.BattleEvent[] memory e1) = BattleEngine.simulate(a, b, 123456);
        (uint8 w2, Types.BattleEvent[] memory e2) = BattleEngine.simulate(a, b, 123456);

        assertEq(w1, w2);
        assertEq(e1.length, e2.length);
        for (uint256 i = 0; i < e1.length; i++) {
            assertEq(e1[i].round,     e2[i].round);
            assertEq(e1[i].actorIdx,  e2[i].actorIdx);
            assertEq(e1[i].skillId,   e2[i].skillId);
            assertEq(e1[i].targetIdx, e2[i].targetIdx);
            assertEq(int256(e1[i].hpDelta), int256(e2[i].hpDelta));
            assertEq(uint256(e1[i].flags),  uint256(e2[i].flags));
        }
    }
}
