# Jianghu Brawl · 江湖大乱斗

> **The first game built for AI, not humans.**
> 首款为 AI 而生的链游。

[![Build](https://img.shields.io/badge/build-pending-lightgrey)](#) [![MCP](https://img.shields.io/badge/MCP-compatible-blueviolet)](https://modelcontextprotocol.io) [![Base](https://img.shields.io/badge/Base-Sepolia-0052FF)](https://docs.base.org) [![OnchainOS](https://img.shields.io/badge/OnchainOS-Skill-00d1b2)](https://github.com/okx/onchainos-skills) [![License](https://img.shields.io/badge/license-MIT-green)](#license)

**Demo video:** `https://youtu.be/TBD` · **Live contracts (Base Sepolia):** see `.env.example` · **Skill on npm:** `npx wuxia-skill`

---

## 5-Second Hook

```
$ claude
> /wuxia-fight
⛩️  Welcome to Jianghu. You have no heroes yet.
    Mint three genesis heroes? (gas sponsored by the League)
> yes
✅ Minted: Shaolin-Yuanzhi · Tangmen-Feiyan · Emei-Jingyin
    tx 0xabc… on Base Sepolia
```

No website. No wallet extension. No app install. You play a **fully on-chain wuxia brawler** from inside Claude Code / Cursor / Codex — anywhere MCP runs.

> 不用打开网页,不用装钱包插件,不用下 App。在 Claude Code 里一句 `/wuxia-fight` 就能玩全链上武侠对战。

---

## Table of Contents

1. [Why this exists](#why-this-exists)
2. [Quick Start (2 minutes)](#quick-start-2-minutes)
3. [Architecture](#architecture)
4. [OnchainOS Integration](#onchainos-integration)
5. [Tool Reference](#tool-reference)
6. [AI vs AI Mode](#ai-vs-ai-mode)
7. [Repo Layout](#repo-layout)
8. [Development](#development)
9. [Security](#security)
10. [Roadmap](#roadmap)
11. [Team & License](#team--license)

---

## Why this exists

Web3 games die because they force humans into clunky browser dApps, seed phrases, and gas popups. Meanwhile, AI agents are becoming the **new dominant user** of the internet — they read docs, write code, and now hold wallets. We think the next killer chain-game is not another web app. It is a **skill** that agents invoke on the user's behalf.

**Jianghu Brawl** is a proof. It is:

- **Agent-native** — the UI is a terminal agent, not a React app.
- **Fully on-chain** — heroes are ERC-721, battles are deterministic Solidity simulations, reports are stored in contract storage.
- **Composable** — published as an OnchainOS Skill, it stacks with wallet / DEX / DeFi skills in the same agent session.
- **AI vs AI capable** — two agents can autonomously challenge each other while a caster-agent translates raw events into wuxia narration.

---

## Quick Start (2 minutes)

Prereqs: Node ≥ 20, Claude Code (or any MCP host), an Anthropic API key, and OnchainOS credentials from the OKX Dev Portal.

### 1. Install the skill

```bash
npm install -g wuxia-skill
# or just use npx in the mcp.json below — no install needed
```

### 2. Add to your MCP host

`~/.config/claude-code/mcp.json` (macOS/Linux) or `%APPDATA%\claude-code\mcp.json` (Windows):

```json
{
  "mcpServers": {
    "wuxia": {
      "command": "npx",
      "args": ["-y", "wuxia-skill"],
      "env": {
        "OKX_API_KEY": "...",
        "OKX_SECRET_KEY": "...",
        "OKX_PASSPHRASE": "...",
        "OKX_PROJECT_ID": "...",
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "BASE_SEPOLIA_RPC": "https://sepolia.base.org",
        "HERO_NFT_ADDRESS": "0x...",
        "ARENA_ADDRESS": "0x..."
      }
    }
  }
}
```

Copy `.env.example` for the full list of supported variables.

### 3. Play

Restart Claude Code. In any chat:

```
> Start a wuxia fight. Mint my heroes if I don't have any.
```

Claude will call `wuxia_init` → `wuxia_mint_hero` → `wuxia_start_pve` in sequence. Gas is fully sponsored by the OnchainOS Paymaster — **you never sign a transaction or see a seed phrase**.

### 4. (Optional) AI vs AI demo

```
> /wuxia_ai_vs_ai agentA=claude-sonnet agentB=claude-haiku caster=on
```

Two LLMs take control of the teams. A caster-agent streams wuxia commentary while the battle settles on-chain.

---

## Architecture

```
 ┌─────────────────────────────────────────────────────────┐
 │  Player: Claude Code / Cursor / Codex / OpenCode (MCP)  │
 └────────────────────────┬────────────────────────────────┘
                          │ stdio / JSON-RPC
                          ▼
 ┌─────────────────────────────────────────────────────────┐
 │     wuxia-skill  (MCP Server, TypeScript)               │
 │  ┌──────────┬──────────┬──────────┬──────────────────┐  │
 │  │  tools   │  state   │ renderer │ caster-agent     │  │
 │  │ (9)      │ (cache)  │ (ASCII)  │ (Claude stream)  │  │
 │  └──────────┴──────────┴──────────┴──────────────────┘  │
 └──────┬──────────────────────────────┬───────────────────┘
        │                              │
        ▼                              ▼
 ┌──────────────────┐          ┌─────────────────────────┐
 │  OnchainOS APIs  │          │   LLM API (caster)      │
 │ - Wallet (WaaS)  │          │ - Claude Haiku 4.5      │
 │ - Gateway (tx)   │          │ - Streaming output      │
 │ - Paymaster      │          └─────────────────────────┘
 │ - Security       │
 └────────┬─────────┘
          │ signAndSend
          ▼
 ┌──────────────────────────────────────────────────────┐
 │    Base Sepolia (Ethereum L2, chain id 84532)        │
 │  ┌──────────────┬──────────────┬──────────────────┐  │
 │  │  HeroNFT.sol │  Arena.sol   │ BattleEngine.sol │  │
 │  │  (ERC-721)   │  (PVE/PVP)   │ (pure library)   │  │
 │  └──────────────┴──────────────┴──────────────────┘  │
 └──────────────────────────────────────────────────────┘
```

See [`docs/TECHNICAL_DESIGN.md`](docs/TECHNICAL_DESIGN.md) for interface details, storage layout, gas budget and EIP-712 scheme.

---

## OnchainOS Integration

**Why it matters for the sponsor track:** we exercise **five** OnchainOS surfaces in one user session — not just a toy call.

| Surface | Endpoint / Product | Used for | Where in the code |
|---|---|---|---|
| Wallet-as-a-Service | `POST /api/v5/wallet/account/create-wallet-account` | First-time account provisioning inside `wuxia_init` (no seed phrase) | `skill/src/onchainos/wallet.ts` |
| Wallet balance | `GET  /api/v5/wallet/asset/balance` | Show ETH + NFT holdings in the status card | `skill/src/onchainos/wallet.ts` |
| Onchain Gateway | `POST /api/v5/onchain-gateway/tx/sign-and-send` | All `HeroNFT` / `Arena` writes (mint, PVE, challenge, set defense) | `skill/src/onchainos/gateway.ts` |
| Paymaster | Dev-portal policy | 100% gas sponsorship for the two game contracts — players are gas-free forever | `skill/src/onchainos/paymaster.ts` |
| Security | `POST /api/v5/security/scan` | Pre-flight every tx; refuse if flagged | `skill/src/onchainos/gateway.ts` (scan → sign) |

**Private keys never leave OnchainOS.** The skill builds calldata, hands it to the WaaS Gateway, and receives a `txHash`. This is load-bearing for the prompt-injection threat model — see [Security](#security).

> 为什么赞助商会喜欢这个集成:我们在同一次玩家会话中串起了 WaaS、Wallet、Gateway、Paymaster、Security 五个产品面,不是"调一个接口交差"。

---

## Tool Reference

All tools return Markdown, so the hosting agent can render inline. Full schemas live in `skill/src/tools/*.ts`.

| Tool | Input | What it does |
|---|---|---|
| `wuxia_init` | – | Checks wallet, creates one via WaaS if missing, prints status card |
| `wuxia_mint_hero` | – | Calls `HeroNFT.mintGenesis` through Paymaster; one-time per address |
| `wuxia_list_heroes` | – | ASCII hero cards for current account |
| `wuxia_start_pve` | `stageId?` | Runs a PVE stage against a hard-coded boss roster |
| `wuxia_set_defense_team` | `heroIds:[id,id,id]` | Registers your arena defense line-up |
| `wuxia_list_arena` | `limit?` | Lists current arena defenders by power |
| `wuxia_challenge` | `target: address` | 3v3 PVP against another player's defense |
| `wuxia_ai_vs_ai` | `agentA, agentB, caster?` | **Core demo** — two LLMs play each other with optional live narration |
| `wuxia_replay` | `battleId` | Fetches a stored `BattleReport` and re-renders it |

---

## AI vs AI Mode

Two agents, different system prompts (one aggressive "Dongxie" style, one defensive "Xidu"), receive full battle state each turn and output a structured decision:

```json
{ "actorIdx": 2, "skillId": 7, "targetIdx": 0, "trashTalk": "落英缤纷,接招!" }
```

A third **caster agent** consumes the raw `BattleEvent[]` stream and narrates it in wuxia prose — streamed token-by-token to the player's terminal.

We fight the "dice-roll LLM" failure mode by (a) feeding the sect-counter table every turn, (b) showing the opponent's last action, and (c) rejecting malformed outputs and re-prompting.

Full design: [`docs/TECHNICAL_DESIGN.md §4.6`](docs/TECHNICAL_DESIGN.md).

---

## Repo Layout

```
jianghu/
├── README.md                 ← you are here
├── .env.example              ← all required env vars
├── .gitignore
├── docs/
│   ├── PRD.md                ← product vision
│   └── TECHNICAL_DESIGN.md   ← deep technical doc
├── contracts/                ← Solidity + Foundry (HeroNFT, Arena, BattleEngine)
├── skill/                    ← TypeScript MCP server (wuxia-skill on npm)
├── scripts/
│   ├── setup.sh              ← one-shot install + deploy + configure
│   └── demo-ai-vs-ai.sh      ← demo day runner
└── demo/
    ├── ai-vs-ai.md           ← demo-day runbook + contingencies
    ├── pitch-deck.md         ← 10-slide outline
    └── demo-video-script.md  ← 3-minute video script
```

---

## Development

### Prereqs

- [Foundry](https://book.getfoundry.sh) (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)
- Node ≥ 20 and npm ≥ 10
- A funded Base Sepolia deployer key (get ETH from [coinbase faucet](https://www.coinbase.com/faucets/base-ethereum-goerli-faucet))
- OnchainOS dev-portal credentials

### One-shot setup

```bash
cp .env.example .env
# fill in the blanks
bash scripts/setup.sh
```

The script will: verify toolchain → build contracts → run Foundry tests → deploy to Base Sepolia → write addresses into `skill/.env` → build the skill → print a ready-to-paste `mcp.json` snippet.

### Run the AI vs AI demo

```bash
bash scripts/demo-ai-vs-ai.sh
```

Opens a tmux three-pane layout: left = Agent A, middle = Agent B, right = caster narration. See [`demo/ai-vs-ai.md`](demo/ai-vs-ai.md).

### Test

```bash
cd contracts && forge test -vv
cd ../skill && npm test
```

---

## Security

- **No private keys in the agent context.** Ever. Signing is delegated to OnchainOS WaaS + MPC. The skill refuses tool inputs that look like `0x[64 hex]`.
- **Strict Zod schemas** on every tool input; address regex, numeric bounds.
- **Pre-flight Security scan** before every `sign-and-send`.
- **EIP-712 with per-player nonce** in `Arena.sol` — no signature replay.
- **`.env` is git-ignored** and API keys are never logged.

Full threat model: [`docs/TECHNICAL_DESIGN.md §8`](docs/TECHNICAL_DESIGN.md).

---

## Roadmap

**Now (hackathon MVP):** 3 sects × 3 heroes, 1 PVE stage, PVP arena, AI vs AI + caster.

**+1 month:** 6 sects (Wudang / Gaibang / Mingjiao / Huashan), seasonal ladder, replay-sharing URLs.

**+3 months:** upstream PR into `okx/onchainos-skills`, npm-publish `wuxia-skill@1.0`, Pyth Entropy for fair randomness, mainnet Base launch.

**Beyond:** cross-skill combos (DEX skill sells hero loot, lending skill collateralizes rare heroes), community-submitted sects as plug-in skills.

---

## Team & License

Built for the **Anthropic MCP × OKX OnchainOS × ETHGlobal AI Agent** hackathon, April 2026.

License: MIT. See [`LICENSE`](LICENSE).

Questions, bugs, war stories — open an issue or ping us on X / Discord (links in `demo/pitch-deck.md`).

> 江湖路远,后会有期。
