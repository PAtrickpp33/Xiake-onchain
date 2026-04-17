// Shared types across the wuxia-skill codebase.
// Authoritative reference: docs/TECHNICAL_DESIGN.md §3.2

export enum Sect {
  Shaolin = 0,
  Tangmen = 1,
  Emei = 2,
}

export const SECT_NAMES: Record<Sect, string> = {
  [Sect.Shaolin]: "少林",
  [Sect.Tangmen]: "唐门",
  [Sect.Emei]: "峨眉",
};

export enum SkillKind {
  Damage = 0,
  Heal = 1,
  Buff = 2,
  Control = 3,
  Dot = 4,
}

export interface Hero {
  tokenId: bigint;
  sect: Sect;
  name: string;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  crit: number; // basis points, 0..10000
  skillIds: number[];
}

export interface SkillDef {
  id: number;
  name: string;
  kind: SkillKind;
  multiplier: number; // bps, 10000 = 100%
  duration: number;   // rounds for buff/debuff/dot
  description: string;
}

export interface BattleEvent {
  round: number;
  actorIdx: number;      // 0..5 (0..2 = side A, 3..5 = side B)
  skillId: number;
  targetIdx: number;
  hpDelta: number;       // negative for damage, positive for heal
  flags: number;         // bit0=crit, bit1=miss, bit2=kill
}

export interface BattleReport {
  battleId: `0x${string}`;
  attacker: `0x${string}`;
  defender: `0x${string}`;
  winner: 0 | 1 | 2;     // 0=attacker, 1=defender, 2=draw
  timestamp: number;
  attackerTeam: Hero[];
  defenderTeam: Hero[];
  events: BattleEvent[];
  txHash?: `0x${string}`;
}

export interface HeroState {
  hero: Hero;
  currentHp: number;
  buffs: Array<{ kind: SkillKind; value: number; roundsLeft: number }>;
  alive: boolean;
}

export interface AgentDecisionInput {
  mySide: HeroState[];
  enemySide: HeroState[];
  lastEnemyAction: BattleEvent | null;
  round: number;
  sectChart: Record<Sect, { counters: Sect; weakTo: Sect }>;
}

export interface AgentDecisionOutput {
  actorIdx: number;
  skillId: number;
  targetIdx: number;
  trashTalk: string;
}

// Flag helpers
export const FLAG_CRIT = 1 << 0;
export const FLAG_MISS = 1 << 1;
export const FLAG_KILL = 1 << 2;

export function hasFlag(flags: number, flag: number): boolean {
  return (flags & flag) !== 0;
}
