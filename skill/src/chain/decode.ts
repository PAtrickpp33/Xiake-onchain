// Helpers to turn raw viem tuple outputs into the rich domain types defined
// in ../types.ts. Kept in the `chain/` boundary because it is coupled to the
// ABI shape in ./abi.ts.

import type { Hero, BattleReport, BattleEvent } from "../types.js";
import { SECT_NAMES, Sect } from "../types.js";

type RawHero = {
  tokenId: bigint;
  sect: number;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  crit: number;
  skillIds: readonly number[];
};

type RawBattleEvent = {
  round: number;
  actorIdx: number;
  skillId: number;
  targetIdx: number;
  hpDelta: number;
  flags: number;
};

type RawBattleReport = {
  battleId: `0x${string}`;
  attacker: `0x${string}`;
  defender: `0x${string}`;
  winner: number;
  timestamp: bigint;
  events: readonly RawBattleEvent[];
};

/** Deterministic placeholder name until we have on-chain metadata. */
function heroName(tokenId: bigint, sect: Sect): string {
  const sectName = SECT_NAMES[sect] ?? "江湖";
  return `${sectName}·#${tokenId.toString()}`;
}

export function decodeHero(raw: RawHero): Hero {
  const sect = raw.sect as Sect;
  return {
    tokenId: raw.tokenId,
    sect,
    name: heroName(raw.tokenId, sect),
    hp: raw.hp,
    atk: raw.atk,
    def: raw.def,
    spd: raw.spd,
    crit: raw.crit,
    skillIds: [...raw.skillIds],
  };
}

export function decodeBattleEvent(raw: RawBattleEvent): BattleEvent {
  return {
    round: raw.round,
    actorIdx: raw.actorIdx,
    skillId: raw.skillId,
    targetIdx: raw.targetIdx,
    hpDelta: raw.hpDelta,
    flags: raw.flags,
  };
}

export function decodeBattleReport(
  raw: RawBattleReport,
  attackerTeam: Hero[],
  defenderTeam: Hero[],
  txHash?: `0x${string}`,
): BattleReport {
  const winner = raw.winner as 0 | 1 | 2;
  return {
    battleId: raw.battleId,
    attacker: raw.attacker,
    defender: raw.defender,
    winner,
    timestamp: Number(raw.timestamp),
    attackerTeam,
    defenderTeam,
    events: raw.events.map(decodeBattleEvent),
    txHash,
  };
}
