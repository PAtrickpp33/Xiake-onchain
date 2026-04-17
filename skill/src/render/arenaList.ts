// Adapter over `render/arena.ts` to match the signature expected by
// `tools/listArena.ts`: `renderArenaList({ offset, entries: { address, power }[] })`.
//
// The underlying `renderArena` renderer takes richer per-row data
// (rank/nickname/wins/losses). We fill in defaults and compute rank from offset.

import { renderArena, type ArenaEntry, type RenderArenaOptions } from "./arena.js";

export interface ArenaListInput {
  offset: number;
  entries: Array<{
    address: `0x${string}`;
    power: bigint | number;
  }>;
  total?: number;
  selfAddress?: `0x${string}`;
}

export function renderArenaList(input: ArenaListInput): string {
  const { offset, entries, total, selfAddress } = input;

  const adapted: ArenaEntry[] = entries.map((e, i) => ({
    rank: offset + i + 1,
    address: e.address,
    power: typeof e.power === "bigint" ? Number(e.power) : e.power,
    isSelf: selfAddress?.toLowerCase() === e.address.toLowerCase(),
  }));

  const opts: RenderArenaOptions = { offset, total };
  return renderArena(adapted, opts);
}
