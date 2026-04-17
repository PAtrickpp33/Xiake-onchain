// Convenience wrappers around viem readContract calls. These keep tool
// handlers readable and push ABI knowledge down into the chain/ boundary.

import type { Address } from "viem";
import { getPublicClient, getAddresses } from "./client.js";
import { heroNftAbi, arenaAbi } from "./abi.js";
import { decodeHero, decodeBattleReport } from "./decode.js";
import type { Hero, BattleReport } from "../types.js";

export async function fetchOwnedHeroIds(owner: Address): Promise<bigint[]> {
  const { hero } = getAddresses();
  const client = getPublicClient();

  const balance = (await client.readContract({
    address: hero,
    abi: heroNftAbi,
    functionName: "balanceOf",
    args: [owner],
  })) as bigint;

  if (balance === 0n) return [];

  const calls = Array.from({ length: Number(balance) }, (_, i) =>
    client.readContract({
      address: hero,
      abi: heroNftAbi,
      functionName: "tokenOfOwnerByIndex",
      args: [owner, BigInt(i)],
    }),
  );
  const ids = (await Promise.all(calls)) as bigint[];
  return ids;
}

export async function fetchHasMintedGenesis(owner: Address): Promise<boolean> {
  const { hero } = getAddresses();
  const client = getPublicClient();
  return (await client.readContract({
    address: hero,
    abi: heroNftAbi,
    functionName: "hasMintedGenesis",
    args: [owner],
  })) as boolean;
}

export async function fetchHero(tokenId: bigint): Promise<Hero> {
  const { hero } = getAddresses();
  const client = getPublicClient();
  const raw = (await client.readContract({
    address: hero,
    abi: heroNftAbi,
    functionName: "getHero",
    args: [tokenId],
  })) as Parameters<typeof decodeHero>[0];
  return decodeHero(raw);
}

export async function fetchHeroes(ids: bigint[]): Promise<Hero[]> {
  if (ids.length === 0) return [];
  const { hero } = getAddresses();
  const client = getPublicClient();
  const raws = (await client.readContract({
    address: hero,
    abi: heroNftAbi,
    functionName: "getHeroes",
    args: [ids],
  })) as Parameters<typeof decodeHero>[0][];
  return raws.map(decodeHero);
}

export async function fetchDefenseTeam(player: Address): Promise<[bigint, bigint, bigint]> {
  const { arena } = getAddresses();
  const client = getPublicClient();
  return (await client.readContract({
    address: arena,
    abi: arenaAbi,
    functionName: "getDefenseTeam",
    args: [player],
  })) as [bigint, bigint, bigint];
}

export async function fetchArenaList(
  offset: bigint,
  limit: bigint,
): Promise<{ players: Address[]; powers: bigint[] }> {
  const { arena } = getAddresses();
  const client = getPublicClient();
  const [players, powers] = (await client.readContract({
    address: arena,
    abi: arenaAbi,
    functionName: "listArena",
    args: [offset, limit],
  })) as [readonly Address[], readonly bigint[]];
  return { players: [...players], powers: [...powers] };
}

export async function fetchBattleReport(
  battleId: `0x${string}`,
  teams?: { attackerTeam: Hero[]; defenderTeam: Hero[] },
  txHash?: `0x${string}`,
): Promise<BattleReport> {
  const { arena } = getAddresses();
  const client = getPublicClient();
  const raw = (await client.readContract({
    address: arena,
    abi: arenaAbi,
    functionName: "getBattleReport",
    args: [battleId],
  })) as Parameters<typeof decodeBattleReport>[0];
  return decodeBattleReport(
    raw,
    teams?.attackerTeam ?? [],
    teams?.defenderTeam ?? [],
    txHash,
  );
}
