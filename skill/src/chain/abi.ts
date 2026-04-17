// Viem ABI constants for HeroNFT and Arena contracts.
// Authoritative reference: docs/TECHNICAL_DESIGN.md §3.3-§3.5
//
// Struct layouts mirror Types.sol exactly so `viem` can decode returned tuples
// via `parseAbi`-friendly fully-qualified signatures. We use the inline JSON
// ABI form here (not the human-readable parseAbi shorthand) because our
// structs include dynamic arrays which are clearer as explicit tuple components.

export const heroNftAbi = [
  {
    type: "function",
    name: "mintGenesis",
    stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }],
    outputs: [{ name: "tokenIds", type: "uint256[3]" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "tokenOfOwnerByIndex",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "hasMintedGenesis",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "getHero",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      {
        name: "hero",
        type: "tuple",
        components: [
          { name: "tokenId", type: "uint256" },
          { name: "sect", type: "uint8" },
          { name: "hp", type: "uint16" },
          { name: "atk", type: "uint16" },
          { name: "def", type: "uint16" },
          { name: "spd", type: "uint16" },
          { name: "crit", type: "uint16" },
          { name: "skillIds", type: "uint8[]" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getHeroes",
    stateMutability: "view",
    inputs: [{ name: "ids", type: "uint256[]" }],
    outputs: [
      {
        name: "heroes",
        type: "tuple[]",
        components: [
          { name: "tokenId", type: "uint256" },
          { name: "sect", type: "uint8" },
          { name: "hp", type: "uint16" },
          { name: "atk", type: "uint16" },
          { name: "def", type: "uint16" },
          { name: "spd", type: "uint16" },
          { name: "crit", type: "uint16" },
          { name: "skillIds", type: "uint8[]" },
        ],
      },
    ],
  },
] as const;

const battleEventTuple = {
  name: "events",
  type: "tuple[]",
  components: [
    { name: "round", type: "uint8" },
    { name: "actorIdx", type: "uint8" },
    { name: "skillId", type: "uint8" },
    { name: "targetIdx", type: "uint8" },
    { name: "hpDelta", type: "int16" },
    { name: "flags", type: "uint8" },
  ],
} as const;

const battleReportTuple = {
  name: "report",
  type: "tuple",
  components: [
    { name: "battleId", type: "bytes32" },
    { name: "attacker", type: "address" },
    { name: "defender", type: "address" },
    { name: "winner", type: "uint8" },
    { name: "timestamp", type: "uint64" },
    battleEventTuple,
  ],
} as const;

export const arenaAbi = [
  {
    type: "function",
    name: "startPve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "heroIds", type: "uint256[3]" },
      { name: "stageId", type: "uint8" },
    ],
    outputs: [{ name: "battleId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "challenge",
    stateMutability: "nonpayable",
    inputs: [{ name: "defender", type: "address" }],
    outputs: [{ name: "battleId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "setDefenseTeam",
    stateMutability: "nonpayable",
    inputs: [{ name: "heroIds", type: "uint256[3]" }],
    outputs: [],
  },
  {
    type: "function",
    name: "challengeRelay",
    stateMutability: "nonpayable",
    inputs: [
      { name: "attacker", type: "address" },
      { name: "defender", type: "address" },
      { name: "attackerSig", type: "bytes" },
      { name: "defenderSig", type: "bytes" },
    ],
    outputs: [{ name: "battleId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "getBattleReport",
    stateMutability: "view",
    inputs: [{ name: "battleId", type: "bytes32" }],
    outputs: [battleReportTuple],
  },
  {
    type: "function",
    name: "getDefenseTeam",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "", type: "uint256[3]" }],
  },
  {
    type: "function",
    name: "listArena",
    stateMutability: "view",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [
      { name: "players", type: "address[]" },
      { name: "powers", type: "uint256[]" },
    ],
  },
  {
    type: "event",
    name: "BattleSettled",
    inputs: [
      { name: "battleId", type: "bytes32", indexed: true },
      { name: "attacker", type: "address", indexed: true },
      { name: "defender", type: "address", indexed: true },
      { name: "winner", type: "uint8", indexed: false },
    ],
  },
] as const;
