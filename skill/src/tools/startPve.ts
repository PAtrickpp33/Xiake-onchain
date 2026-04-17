// Tool: wuxia_start_pve
// Sends Arena.startPve via the gateway, polls the receipt, decodes the
// BattleSettled event to obtain the battleId, then fetches and renders the
// BattleReport.

import { z } from "zod";
import { encodeFunctionData, decodeEventLog, type Log } from "viem";
import { guard, requirePlayer } from "./_util.js";
import { arenaAbi } from "../chain/abi.js";
import { getAddresses, txUrl } from "../chain/client.js";
import { signAndSend } from "../onchainos/gateway.js";
import { getPublicClient } from "../chain/client.js";
import {
  fetchOwnedHeroIds,
  fetchHeroes,
  fetchBattleReport,
} from "../chain/reads.js";
import {
  getCurrentPlayer,
  cacheHeroes,
  cacheReport,
  setLastBattleId,
} from "../state/cache.js";
import { renderBattleReport } from "../render/battleReport.js";

export const inputSchema = z
  .object({
    stageId: z.number().int().min(0).max(255).default(0),
    heroIds: z
      .array(z.union([z.string(), z.number()]))
      .length(3)
      .optional(),
  })
  .strict();
export type Input = z.infer<typeof inputSchema>;

export const toolDef = {
  name: "wuxia_start_pve",
  description:
    "向 PVE BOSS 关卡发起挑战。可指定出战的 3 个 heroId,不填则取当前钱包的前三个侠客。",
  inputSchema: {
    type: "object",
    properties: {
      stageId: {
        type: "integer",
        minimum: 0,
        maximum: 255,
        default: 0,
        description: "关卡编号,0 为新手关。",
      },
      heroIds: {
        type: "array",
        items: { type: ["string", "number"] },
        minItems: 3,
        maxItems: 3,
        description: "出战的 3 个侠客 tokenId。",
      },
    },
    additionalProperties: false,
  },
} as const;

function toBigIntTuple(arr: Array<string | number>): [bigint, bigint, bigint] {
  const [a, b, c] = arr.map((v) => BigInt(v));
  return [a!, b!, c!];
}

export async function handler(raw: unknown) {
  return guard(async () => {
    const input = inputSchema.parse(raw ?? {});
    const player = requirePlayer(getCurrentPlayer());

    let team: [bigint, bigint, bigint];
    if (input.heroIds) {
      team = toBigIntTuple(input.heroIds);
    } else {
      const owned = await fetchOwnedHeroIds(player.address);
      if (owned.length < 3) {
        throw new Error("你至少需要 3 位侠客才能出战,先调用 `wuxia_mint_hero`。");
      }
      team = [owned[0]!, owned[1]!, owned[2]!];
    }

    const { arena } = getAddresses();
    const data = encodeFunctionData({
      abi: arenaAbi,
      functionName: "startPve",
      args: [team, input.stageId],
    });

    const { txHash } = await signAndSend({
      to: arena,
      data,
      from: player.address,
    });

    const receipt = await getPublicClient().waitForTransactionReceipt({ hash: txHash });
    const battleId = extractBattleId(receipt.logs, arena);

    const attackerTeam = await fetchHeroes([...team]);
    cacheHeroes(attackerTeam);
    const report = await fetchBattleReport(
      battleId,
      { attackerTeam, defenderTeam: [] }, // PVE boss team materialised on-chain only
      txHash,
    );
    cacheReport(report);
    setLastBattleId(battleId);

    return renderBattleReport(report, {
      title: `⚔️ PVE 第 ${input.stageId} 关`,
      txUrl: txUrl(txHash),
    });
  });
}

function extractBattleId(logs: readonly Log[], arenaAddr: `0x${string}`): `0x${string}` {
  for (const log of logs) {
    if (log.address.toLowerCase() !== arenaAddr.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: arenaAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "BattleSettled") {
        return (decoded.args as { battleId: `0x${string}` }).battleId;
      }
    } catch {
      /* not the event we want */
    }
  }
  throw new Error("未能从交易收据中解析到 BattleSettled 事件。");
}
