// Tool: wuxia_init
// Looks up the OnchainOS-managed wallet for the user, checks genesis mint
// status, and prints a status card.

import { z } from "zod";
import { createHash } from "node:crypto";
import { guard } from "./_util.js";
import { createWalletAccount, getWalletAccount } from "../onchainos/wallet.js";
import { fetchHasMintedGenesis, fetchOwnedHeroIds } from "../chain/reads.js";
import { setCurrentPlayer } from "../state/cache.js";
import { renderStatusCard } from "../render/statusCard.js";

/**
 * Derive a stable accountId for the current MCP session. OnchainOS
 * `createWalletAccount` is idempotent when the same accountId is reused, so we
 * key off an env-configurable nickname (falling back to a hash of the process
 * PID + hostname so dev sessions don't clash with each other).
 */
function sessionAccountId(): string {
  if (process.env.WUXIA_PLAYER_ID) return process.env.WUXIA_PLAYER_ID;
  const seed = `${process.pid}:${process.env.HOSTNAME ?? "local"}`;
  return `wuxia-${createHash("sha256").update(seed).digest("hex").slice(0, 16)}`;
}

export const inputSchema = z.object({}).strict();
export type Input = z.infer<typeof inputSchema>;

export const toolDef = {
  name: "wuxia_init",
  description:
    "初始化江湖之旅:查询 OnchainOS 托管钱包、判断 genesis 侠客是否已 mint,并输出状态卡。",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
} as const;

export async function handler(raw: unknown) {
  return guard(async () => {
    inputSchema.parse(raw ?? {});
    const accountId = sessionAccountId();

    // OnchainOS createWalletAccount is idempotent for a reused accountId, but
    // we still try the GET first to avoid an unnecessary POST in the common
    // (returning player) case.
    const existing = await getWalletAccount(accountId).catch(() => null);
    const account = existing ?? (await createWalletAccount({ accountId }));
    setCurrentPlayer(account.address);

    const [hasMinted, ownedIds] = await Promise.all([
      fetchHasMintedGenesis(account.address),
      fetchOwnedHeroIds(account.address),
    ]);

    return renderStatusCard({
      address: account.address,
      hasMintedGenesis: hasMinted,
      heroCount: ownedIds.length,
      chain: "base-sepolia",
    });
  });
}
