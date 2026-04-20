// Uniform tx-hash rendering for on-chain actions.
//
// Every `signAndSend` that lands a real tx should route its hash through
// `formatTxLine` so the player sees a consistent "🔗 <label> · tx 0xabc…def ·
// https://sepolia.basescan.org/tx/0x…" line with a clickable BaseScan link.
//
// Chain explorer is chosen by XIAKE_CHAIN (defaults to base-sepolia). Mainnet
// will switch to basescan.org once the contracts are deployed there.

export type ExplorerChain = "sepolia" | "mainnet";

function getExplorerChain(): ExplorerChain {
  const raw = (process.env.XIAKE_CHAIN ?? "").toLowerCase();
  if (raw === "base" || raw === "base-mainnet" || raw === "mainnet" || raw === "8453") {
    return "mainnet";
  }
  return "sepolia";
}

export function explorerBaseUrl(chain: ExplorerChain = getExplorerChain()): string {
  return chain === "mainnet"
    ? "https://basescan.org"
    : "https://sepolia.basescan.org";
}

export function txUrl(hash: string, chain: ExplorerChain = getExplorerChain()): string {
  return `${explorerBaseUrl(chain)}/tx/${hash}`;
}

/**
 * Render one tx line. Emoji + short hash + full explorer URL — designed
 * to look sensible both as a single-line log entry and when copy-pasted
 * into a Claude Code chat transcript.
 *
 * Example output:
 *   🔗 startPve(1-1) · tx 0x9100f8…34be · https://sepolia.basescan.org/tx/0x9100f839...
 */
export function formatTxLine(label: string, hash: string, chain?: ExplorerChain): string {
  const short = `${hash.slice(0, 8)}…${hash.slice(-4)}`;
  return `🔗 ${label} · tx ${short} · ${txUrl(hash, chain)}`;
}

/** Shorter variant for dense sections (e.g. tight battle-report footers). */
export function formatTxLineCompact(label: string, hash: string): string {
  return `🔗 ${label} · ${txUrl(hash)}`;
}
