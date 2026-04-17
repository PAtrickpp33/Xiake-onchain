// System prompts + prompt builders for the commentary agent ("说书人") and
// the AI-vs-AI decision agents.
//
// Authoritative reference: docs/TECHNICAL_DESIGN.md §4.5, §4.6
//
// Design notes:
//   • Prompts are pure strings — no side effects — so they can be unit tested
//     and snapshot-diffed cheaply.
//   • `buildCasterPrompt` takes the STRUCTURED battle events, not freeform
//     text, so the LLM never needs to parse our ASCII output.
//   • `buildDecisionPrompt` returns a compact JSON-ish view of the battlefield
//     plus a strict output schema — we want the LLM to emit JSON we can parse,
//     not prose.

import {
  FLAG_CRIT,
  FLAG_KILL,
  FLAG_MISS,
  SECT_NAMES,
  Sect,
  SkillKind,
  hasFlag,
  type AgentDecisionInput,
  type BattleEvent,
  type Hero,
  type HeroState,
} from "../types.js";

// ── Caster (commentator) ────────────────────────────────────────────────────

/**
 * System prompt for the commentary agent. The persona is deliberately
 * constrained to Jin Yong-flavoured wuxia narration — we don't want the LLM
 * to invent mechanics that don't exist in the contract (e.g. hidden buffs).
 */
export const CASTER_SYSTEM_PROMPT = `你是金庸风格的武侠说书人,名号"说书先生"。你的任务是把一场 3v3 侠客对战的事件流翻译成文采飞扬的对白与评书。

规矩:
1. 语言风格参考《笑傲江湖》《天龙八部》的叙事节奏,字句讲究对仗,善用"只见"、"说时迟那时快"、"登时"、"霎时"等衔接词。
2. 只能基于用户给出的事件数据进行描写,不得编造未发生的招式、伤害、buff 或结局。
3. 每一个事件输出 1-2 句话,首句描写招式施展,次句描写命中结果或状态变化。
4. 暴击以"一击入魂""雷霆一击""气贯长虹"等词突出;治疗用"内息流转""真气归源";控制用"身形一滞""穴位被封"。
5. 回合之间用空行分隔,便于玩家阅读;整场战斗最后用一两句话收束全场、点出胜者。
6. 不使用 emoji,不使用 markdown 标题,不复读原始数据字段(如 hpDelta 数值)。直接以说书人口吻输出纯文本段落。
7. 每次产出控制在 80-200 字之间,避免啰嗦。

记住:你是讲故事的人,不是播报员。`;

/**
 * Build the user message for `runCaster`. We pass a compact, typed summary of
 * the battle so the model doesn't have to reconstruct hero identities from
 * indices.
 */
export function buildCasterPrompt(params: {
  round: number;
  events: BattleEvent[];
  heroes: Hero[]; // length 6: [0..2]=A, [3..5]=B
  trashTalk?: { actorIdx: number; text: string }[];
  isFinalRound?: boolean;
  winner?: 0 | 1 | 2; // only meaningful when isFinalRound
}): string {
  const lines: string[] = [];
  lines.push(`【第 ${params.round} 回合】`);
  lines.push("本回合事件(按发生顺序):");

  for (const ev of params.events) {
    const actor = params.heroes[ev.actorIdx];
    const target = params.heroes[ev.targetIdx];
    if (!actor || !target) continue;
    const actorLabel = heroLabel(actor);
    const targetLabel = ev.actorIdx === ev.targetIdx ? "自身" : heroLabel(target);
    const skillInfo = `技能#${ev.skillId}`;

    const tags: string[] = [];
    if (hasFlag(ev.flags, FLAG_CRIT)) tags.push("暴击");
    if (hasFlag(ev.flags, FLAG_MISS)) tags.push("未命中");
    if (hasFlag(ev.flags, FLAG_KILL)) tags.push("击杀");

    let hpText = "";
    if (ev.hpDelta < 0) hpText = `对 ${targetLabel} 造成伤害 ${-ev.hpDelta}`;
    else if (ev.hpDelta > 0) hpText = `为 ${targetLabel} 回复 ${ev.hpDelta} 点气血`;
    else hpText = `对 ${targetLabel} 施加状态效果`;

    const tail = tags.length ? `【${tags.join("·")}】` : "";
    lines.push(`- ${actorLabel} 使用 ${skillInfo},${hpText}${tail}`);
  }

  if (params.trashTalk && params.trashTalk.length > 0) {
    lines.push("");
    lines.push("本回合侠客对白(可引用):");
    for (const t of params.trashTalk) {
      const speaker = params.heroes[t.actorIdx];
      if (!speaker) continue;
      lines.push(`- ${heroLabel(speaker)}:「${t.text}」`);
    }
  }

  if (params.isFinalRound) {
    lines.push("");
    const winText =
      params.winner === 0 ? "主队获胜" : params.winner === 1 ? "挑战方获胜" : "双方打成平手";
    lines.push(`【终局】${winText}。请以说书人口吻,用一两句话收束全场。`);
  }

  lines.push("");
  lines.push("请以说书人口吻讲述本回合。");
  return lines.join("\n");
}

// ── Decision agent (AI vs AI) ───────────────────────────────────────────────

/**
 * Two distinct personas for agent A / agent B so the fights have texture.
 * They operate on the same input / output schema, just with different
 * strategic dispositions.
 */
export const DECISION_SYSTEM_PROMPTS = {
  /** Aggressive glass-cannon playstyle. */
  raven: `你是江湖中一位化名"玄铁"的对战 AI。你指挥一支 3 人侠客队伍,风格激进、偏爱高伤害 combo。

决策原则:
1. 优先集火击杀敌方威胁最高的单位(ATK 最高 or HP 最低可斩杀)。
2. 己方角色 HP 低于 30% 时,若手上有治疗技能,优先自救。
3. 控制技能用于打断敌方即将释放的强力技能。
4. 回合轮到己方才出手,不要选已阵亡的角色。

你必须且只能输出合法 JSON,schema 如下(不要输出任何其它文字):
{
  "actorIdx": number,   // 你方出手角色的全局下标(0..2 为我方、3..5 为对方,不要选对方)
  "skillId":  number,   // 必须是该角色 skillIds 中的一个
  "targetIdx":number,   // 合法目标下标
  "trashTalk": string   // 10-25 字的武侠风格挑衅或战吼
}`,

  /** Defensive control-and-sustain playstyle. */
  phoenix: `你是江湖中一位化名"凌霄"的对战 AI。你指挥一支 3 人侠客队伍,风格稳重、擅长控制与续航。

决策原则:
1. 优先维持全队 HP 线,有角色低于 40% 立即治疗/护盾。
2. 对敌方高 SPD 单位施加控制,打乱其先手节奏。
3. 只有在场面稳住之后才主动进攻,优先攻击敌方治疗/辅助。
4. 回合轮到己方才出手,不要选已阵亡的角色。

你必须且只能输出合法 JSON,schema 如下(不要输出任何其它文字):
{
  "actorIdx": number,
  "skillId":  number,
  "targetIdx":number,
  "trashTalk": string
}`,
} as const;

export type DecisionPersona = keyof typeof DECISION_SYSTEM_PROMPTS;

/**
 * Build the user message for an agent's per-round decision call.
 *
 * We intentionally serialise `AgentDecisionInput` as human-readable JSON
 * (with deterministic key ordering) rather than a prose description — LLMs
 * parse JSON reliably, and it makes the prompt diffable.
 */
export function buildDecisionPrompt(input: AgentDecisionInput): string {
  const mySide = input.mySide.map(heroStateSummary);
  const enemySide = input.enemySide.map(heroStateSummary);

  const payload = {
    round: input.round,
    lastEnemyAction: input.lastEnemyAction
      ? {
          round: input.lastEnemyAction.round,
          actorIdx: input.lastEnemyAction.actorIdx,
          targetIdx: input.lastEnemyAction.targetIdx,
          skillId: input.lastEnemyAction.skillId,
          hpDelta: input.lastEnemyAction.hpDelta,
          crit: hasFlag(input.lastEnemyAction.flags, FLAG_CRIT),
          miss: hasFlag(input.lastEnemyAction.flags, FLAG_MISS),
          kill: hasFlag(input.lastEnemyAction.flags, FLAG_KILL),
        }
      : null,
    mySide,
    enemySide,
    sectChart: {
      [SECT_NAMES[Sect.Shaolin]]: { counters: SECT_NAMES[input.sectChart[Sect.Shaolin].counters], weakTo: SECT_NAMES[input.sectChart[Sect.Shaolin].weakTo] },
      [SECT_NAMES[Sect.Tangmen]]: { counters: SECT_NAMES[input.sectChart[Sect.Tangmen].counters], weakTo: SECT_NAMES[input.sectChart[Sect.Tangmen].weakTo] },
      [SECT_NAMES[Sect.Emei]]: { counters: SECT_NAMES[input.sectChart[Sect.Emei].counters], weakTo: SECT_NAMES[input.sectChart[Sect.Emei].weakTo] },
    },
  };

  return [
    "当前战场信息如下(JSON):",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
    "",
    "请基于此做出本回合决策,严格按照系统指令要求的 JSON schema 输出。",
  ].join("\n");
}

/**
 * Attempt to parse the LLM's JSON response into an `AgentDecisionOutput`.
 * Tolerant of markdown fences and leading/trailing whitespace. Throws on
 * anything that isn't valid JSON with the 4 required fields.
 */
export function parseDecision(raw: string): {
  actorIdx: number;
  skillId: number;
  targetIdx: number;
  trashTalk: string;
} {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Last-ditch: find first `{` and last `}` and try that substring.
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } else {
      throw new Error(`Decision agent did not return JSON: ${truncate(raw, 200)}`);
    }
  }
  const obj = parsed as Record<string, unknown>;
  const actorIdx = Number(obj.actorIdx);
  const skillId = Number(obj.skillId);
  const targetIdx = Number(obj.targetIdx);
  const trashTalk = typeof obj.trashTalk === "string" ? obj.trashTalk : "";
  if (!Number.isInteger(actorIdx) || !Number.isInteger(skillId) || !Number.isInteger(targetIdx)) {
    throw new Error(`Decision agent returned malformed JSON: ${truncate(raw, 200)}`);
  }
  return { actorIdx, skillId, targetIdx, trashTalk };
}

// ── private helpers ─────────────────────────────────────────────────────────

function heroLabel(h: Hero): string {
  return `${SECT_NAMES[h.sect]}·${h.name}`;
}

function heroStateSummary(s: HeroState) {
  return {
    tokenId: s.hero.tokenId.toString(),
    sect: SECT_NAMES[s.hero.sect],
    name: s.hero.name,
    hp: s.currentHp,
    maxHp: s.hero.hp,
    alive: s.alive,
    atk: s.hero.atk,
    def: s.hero.def,
    spd: s.hero.spd,
    critBps: s.hero.crit,
    skillIds: s.hero.skillIds,
    buffs: s.buffs.map((b) => ({ kind: SkillKind[b.kind], value: b.value, roundsLeft: b.roundsLeft })),
  };
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
