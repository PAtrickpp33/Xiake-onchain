// Session-level in-memory cache. The MCP server process is the session; data
// evaporates when the client disconnects, which is fine because all truth is
// on chain.

import type { Hero, BattleReport } from "../types.js";

interface SkillState {
  currentPlayer?: { address: `0x${string}`; nickname?: string };
  heroCache: Map<string, Hero>; // key = tokenId.toString()
  lastBattleId?: `0x${string}`;
  reportCache: Map<string, BattleReport>; // key = battleId
}

const state: SkillState = {
  heroCache: new Map(),
  reportCache: new Map(),
};

export function setCurrentPlayer(address: `0x${string}`, nickname?: string): void {
  state.currentPlayer = { address, nickname };
}

export function getCurrentPlayer(): SkillState["currentPlayer"] {
  return state.currentPlayer;
}

export function cacheHero(hero: Hero): void {
  state.heroCache.set(hero.tokenId.toString(), hero);
}

export function cacheHeroes(heroes: Hero[]): void {
  for (const h of heroes) cacheHero(h);
}

export function getCachedHero(tokenId: bigint): Hero | undefined {
  return state.heroCache.get(tokenId.toString());
}

export function setLastBattleId(id: `0x${string}`): void {
  state.lastBattleId = id;
}

export function getLastBattleId(): `0x${string}` | undefined {
  return state.lastBattleId;
}

export function cacheReport(report: BattleReport): void {
  state.reportCache.set(report.battleId, report);
}

export function getCachedReport(battleId: `0x${string}`): BattleReport | undefined {
  return state.reportCache.get(battleId);
}

export function resetState(): void {
  state.currentPlayer = undefined;
  state.heroCache.clear();
  state.reportCache.clear();
  state.lastBattleId = undefined;
}
