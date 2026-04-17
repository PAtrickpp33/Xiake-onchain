// Commentary + decision agent layer, built on top of the Anthropic SDK.
//
// Authoritative reference: docs/TECHNICAL_DESIGN.md §4.5, §4.6
//
// Two distinct concerns live here:
//
//   1. `createCaster(...)`   — an object with `.narrateRound(...)` that streams
//                              wuxia-style commentary into an async iterator.
//   2. `createDecisionAgent` — wraps one persona-flavoured Claude call and
//                              returns parsed `AgentDecisionOutput`s round
//                              after round.
//
// Both use `claude-haiku-4-5` for latency + cost. Caster uses streaming
// (messages.stream); decision agent uses a single non-streaming `messages.create`
// because we need to parse the full JSON before returning.
//
// The exports are *factory functions* — we never keep a module-level SDK
// instance, so unit tests can inject a mock client.

import Anthropic from "@anthropic-ai/sdk";
import {
  CASTER_SYSTEM_PROMPT,
  DECISION_SYSTEM_PROMPTS,
  buildCasterPrompt,
  buildDecisionPrompt,
  parseDecision,
  type DecisionPersona,
} from "./prompts.js";
import type {
  AgentDecisionInput,
  AgentDecisionOutput,
  BattleEvent,
  Hero,
} from "../types.js";

/** Default model — pinned in one place so we can bump versions from a single line. */
export const CASTER_MODEL = "claude-haiku-4-5";

export interface CasterOptions {
  /** Pass a preconstructed Anthropic client (e.g. for testing). */
  client?: Anthropic;
  /** Model id override. Defaults to `claude-haiku-4-5`. */
  model?: string;
  /** Max tokens per round. Keeps latency + cost bounded. */
  maxTokens?: number;
  /** Sampling temperature, 0.7 gives enough flair without breaking the persona. */
  temperature?: number;
}

/**
 * Yields commentary for a single round. The caller is expected to collect the
 * stream chunk-by-chunk (or `for await` it into the stdout).
 */
export interface Caster {
  narrateRound(input: NarrateRoundInput): AsyncGenerator<string, void, void>;
  narrateIntro(input: IntroInput): AsyncGenerator<string, void, void>;
  narrateClosing(input: ClosingInput): AsyncGenerator<string, void, void>;
}

export interface NarrateRoundInput {
  round: number;
  events: BattleEvent[];
  heroes: Hero[];
  trashTalk?: { actorIdx: number; text: string }[];
  isFinalRound?: boolean;
  winner?: 0 | 1 | 2;
}

export interface IntroInput {
  attackerTeam: Hero[];
  defenderTeam: Hero[];
  attackerLabel?: string; // e.g. "玄铁"
  defenderLabel?: string; // e.g. "凌霄"
}

export interface ClosingInput {
  winner: 0 | 1 | 2;
  attackerTeam: Hero[];
  defenderTeam: Hero[];
  totalRounds: number;
}

/**
 * Factory for the commentary agent. The returned object is stateless between
 * rounds — each `narrateRound` call is an independent Claude invocation.
 */
export function createCaster(opts: CasterOptions = {}): Caster {
  const client = opts.client ?? makeAnthropicClient();
  const model = opts.model ?? CASTER_MODEL;
  const maxTokens = opts.maxTokens ?? 600;
  const temperature = opts.temperature ?? 0.7;

  async function* streamFromClaude(userMsg: string): AsyncGenerator<string, void, void> {
    const stream = await client.messages.stream({
      model,
      system: CASTER_SYSTEM_PROMPT,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: "user", content: userMsg }],
    });
    // The SDK emits 'text' events for incremental content. We iterate the
    // low-level event stream so we can surface network errors promptly.
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }
  }

  return {
    narrateRound(input) {
      return streamFromClaude(buildCasterPrompt(input));
    },

    narrateIntro(input) {
      const prompt = [
        "一场 3v3 侠客对决即将开始。",
        `攻方【${input.attackerLabel ?? "攻方"}】:${input.attackerTeam.map(heroLine).join("、")}。`,
        `守方【${input.defenderLabel ?? "守方"}】:${input.defenderTeam.map(heroLine).join("、")}。`,
        "请以说书人口吻,用一小段开场白(60-120 字)烘托气氛,不要给出胜负预测。",
      ].join("\n");
      return streamFromClaude(prompt);
    },

    narrateClosing(input) {
      const winText =
        input.winner === 0 ? "攻方获胜" : input.winner === 1 ? "守方获胜" : "双方平手";
      const prompt = [
        `全场战斗已结束,共 ${input.totalRounds} 回合,${winText}。`,
        `攻方:${input.attackerTeam.map(heroLine).join("、")}。`,
        `守方:${input.defenderTeam.map(heroLine).join("、")}。`,
        "请以说书人口吻作收场白(80-150 字),点评胜负之由,不要编造新事件。",
      ].join("\n");
      return streamFromClaude(prompt);
    },
  };
}

// ── Decision agent ──────────────────────────────────────────────────────────

export interface DecisionAgentOptions extends CasterOptions {
  persona: DecisionPersona;
}

export interface DecisionAgent {
  readonly persona: DecisionPersona;
  decide(input: AgentDecisionInput): Promise<AgentDecisionOutput>;
}

/**
 * Factory for a persona-flavoured decision agent. Each call is non-streaming
 * because we need the full JSON before we can validate + hand it to the
 * battle simulator.
 */
export function createDecisionAgent(opts: DecisionAgentOptions): DecisionAgent {
  const client = opts.client ?? makeAnthropicClient();
  const model = opts.model ?? CASTER_MODEL;
  const maxTokens = opts.maxTokens ?? 400;
  const temperature = opts.temperature ?? 0.4;
  const persona = opts.persona;
  const system = DECISION_SYSTEM_PROMPTS[persona];

  return {
    persona,
    async decide(input) {
      const resp = await client.messages.create({
        model,
        system,
        max_tokens: maxTokens,
        temperature,
        messages: [{ role: "user", content: buildDecisionPrompt(input) }],
      });
      const text = extractText(resp);
      const parsed = parseDecision(text);
      const validated = validateDecision(parsed, input, persona);
      return validated;
    },
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────

function makeAnthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY not set — caster / decision agent requires an Anthropic API key.",
    );
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function extractText(resp: Anthropic.Messages.Message): string {
  return resp.content
    .filter((c): c is Anthropic.Messages.TextBlock => c.type === "text")
    .map((c) => c.text)
    .join("");
}

/**
 * Guard against hallucinated indices / skill ids. If the agent picked a dead
 * actor, a missing skill or the wrong side, we fall back to the first legal
 * action for the first alive hero. This keeps the battle progressing even
 * when the LLM is misbehaving.
 */
function validateDecision(
  out: { actorIdx: number; skillId: number; targetIdx: number; trashTalk: string },
  input: AgentDecisionInput,
  persona: DecisionPersona,
): AgentDecisionOutput {
  const aliveMine = input.mySide
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h.alive);
  if (aliveMine.length === 0) {
    throw new Error(`decision agent ${persona} called with no living units`);
  }

  const pickedMine = aliveMine.find(({ i }) => i === out.actorIdx);
  const actor = pickedMine ?? aliveMine[0];
  const skillId = actor.h.hero.skillIds.includes(out.skillId) ? out.skillId : actor.h.hero.skillIds[0];

  // For target validation we allow any index 0..5 — the simulator will clamp
  // Heal to ally side and Damage to enemy side. We just make sure the index
  // is in range and the unit is alive.
  const allStates = [...input.mySide, ...input.enemySide];
  const inRange = out.targetIdx >= 0 && out.targetIdx < allStates.length;
  const targetAlive = inRange && allStates[out.targetIdx].alive;
  const defaultTarget = input.enemySide.findIndex((e) => e.alive);
  const targetIdx = targetAlive
    ? out.targetIdx
    : defaultTarget >= 0
    ? input.mySide.length + defaultTarget
    : 0;

  return {
    actorIdx: actor.i,
    skillId,
    targetIdx,
    trashTalk: (out.trashTalk ?? "").slice(0, 80),
  };
}

function heroLine(h: Hero): string {
  return `${h.name}(${sectText(h.sect)})`;
}

function sectText(s: number): string {
  return ["少林", "唐门", "峨眉"][s] ?? "无门";
}
