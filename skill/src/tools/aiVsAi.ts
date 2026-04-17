// Tool: wuxia_ai_vs_ai (CORE demo)
// Delegates to ../caster/runAiVsAi — the orchestrator that runs two agent
// personas against each other, optionally with a streamed commentary layer.
// This handler is mostly input validation + error framing.

import { z } from "zod";
import { guard } from "./_util.js";
import { runAiVsAi } from "../caster/runAiVsAi.js";

const agentIdSchema = z.enum(["claude", "gpt", "mock", "tangmen", "shaolin", "emei"]);

export const inputSchema = z
  .object({
    agentA: agentIdSchema.default("claude"),
    agentB: agentIdSchema.default("gpt"),
    rounds: z.number().int().min(1).max(5).default(1),
    caster: z.boolean().default(true),
  })
  .strict();
export type Input = z.infer<typeof inputSchema>;

export const toolDef = {
  name: "wuxia_ai_vs_ai",
  description:
    "核心演示:让两个 LLM agent (A/B) 互相对战 N 局,可选开启解说 agent 实时翻译为武侠对白。",
  inputSchema: {
    type: "object",
    properties: {
      agentA: {
        type: "string",
        enum: ["claude", "gpt", "mock", "tangmen", "shaolin", "emei"],
        default: "claude",
        description: "A 方 agent 流派/模型。",
      },
      agentB: {
        type: "string",
        enum: ["claude", "gpt", "mock", "tangmen", "shaolin", "emei"],
        default: "gpt",
        description: "B 方 agent 流派/模型。",
      },
      rounds: {
        type: "integer",
        minimum: 1,
        maximum: 5,
        default: 1,
      },
      caster: {
        type: "boolean",
        default: true,
        description: "是否启用解说 agent(流式武侠对白)。",
      },
    },
    additionalProperties: false,
  },
} as const;

export async function handler(raw: unknown) {
  return guard(async () => {
    const input = inputSchema.parse(raw ?? {});
    return runAiVsAi({
      agentA: input.agentA,
      agentB: input.agentB,
      rounds: input.rounds,
      withCaster: input.caster,
    });
  });
}
