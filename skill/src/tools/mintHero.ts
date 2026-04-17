// Tool: wuxia_mint_hero
// Calls HeroNFT.mintGenesis via the OnchainOS gateway (paymaster-sponsored).
// Each address can only mint once; the contract will revert on repeat.

import { z } from "zod";
import { encodeFunctionData } from "viem";
import { guard, requirePlayer } from "./_util.js";
import { heroNftAbi } from "../chain/abi.js";
import { getAddresses, txUrl } from "../chain/client.js";
import { signAndSend } from "../onchainos/gateway.js";
import { getPublicClient } from "../chain/client.js";
import {
  getCurrentPlayer,
  cacheHeroes,
} from "../state/cache.js";
import { fetchHasMintedGenesis, fetchOwnedHeroIds, fetchHeroes } from "../chain/reads.js";
import { renderMintResult } from "../render/mintResult.js";

export const inputSchema = z.object({}).strict();
export type Input = z.infer<typeof inputSchema>;

export const toolDef = {
  name: "wuxia_mint_hero",
  description:
    "铸造三位 genesis 侠客 NFT (ERC-721)。由 OnchainOS paymaster 代付 gas,每个钱包仅可 mint 一次。",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
} as const;

export async function handler(raw: unknown) {
  return guard(async () => {
    inputSchema.parse(raw ?? {});
    const player = requirePlayer(getCurrentPlayer());

    if (await fetchHasMintedGenesis(player.address)) {
      throw new Error(
        "这个钱包已经领过 genesis 侠客了。使用 `wuxia_list_heroes` 查看现有阵容。",
      );
    }

    const { hero } = getAddresses();
    const data = encodeFunctionData({
      abi: heroNftAbi,
      functionName: "mintGenesis",
      args: [player.address],
    });

    const { txHash } = await signAndSend({
      to: hero,
      data,
      from: player.address,
    });
    await getPublicClient().waitForTransactionReceipt({ hash: txHash });

    const ownedIds = await fetchOwnedHeroIds(player.address);
    const heroes = await fetchHeroes(ownedIds);
    cacheHeroes(heroes);

    return renderMintResult({
      txHash,
      txUrl: txUrl(txHash),
      heroes,
    });
  });
}
