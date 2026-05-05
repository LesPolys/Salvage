export const RULES = {
  table: {
    sizeInches: 36,
    edgeBuffer: 4, // min distance from wreck to table edge
    minWreckSpacing: 8,
    minShipSpacing: 6,
    shipEdgeBuffer: 2, // ships placed within 2" of table edge
  },
  rounds: {
    total: 6,
    diceCount: 5,
  },
  dice: {
    rerollFormula: (round: number) => round - 1, // round 1 = 0 rerolls
    sides: 6 as const,
  },
  velocity: {
    short: 3, // inches
    medium: 6,
    long: 10,
    maxMagnitude: 3 as const, // Long
  },
  ship: {
    holdCapacity: 6,
    hullAnchors: 3,
    massPenaltyThresholds: [3, 6] as const, // burn step drops at these masses
    baseSize: { x: 2, z: 3 },
    slotCount: 7,
  },
  crew: {
    mass: 1,
    countPerPlayer: 4,
    haulerCarryCap: 2, // mass units
    standardCarryCap: 1, // mass units (1x Mass-1 only)
    roles: ["Cutter", "Grappler", "Breacher", "Hauler"] as const,
  },
  tethers: {
    defaultLoad: 3,
    haulerHarnessLoad: 4,
    shipGradeLoad: 5,
    shortLength: 3, // inches
    mediumLength: 6,
    longLength: 10,
    swingArcCap: 180, // degrees
  },
  salvage: {
    scatter: { vp: 1, mass: 1 as const },
    wreck: { vp: 2, mass: 2 as const },
    premium: { vp: 3, mass: 3 as const },
  },
  wreckRoles: {
    jackpot: { wreckSalvage: 3, premium: 2 },
    mid: { wreckSalvage: 3, premium: 1, scatter: 1 }, // shuffled into hatches
    bait: { wreckSalvage: 3 },
  },
  wrecksByPlayerCount: {
    2: { total: 3, roles: { jackpot: 1, mid: 1, bait: 1 } },
    3: { total: 3, roles: { jackpot: 1, mid: 1, bait: 1 } },
    4: { total: 4, roles: { jackpot: 1, mid: 2, bait: 1 } },
  } as Record<number, { total: number; roles: Record<string, number> }>,
  setup: {
    debrisCount: 12,
    asteroidsRange: [1, 2] as const,
    compartmentsPerWreck: 2,
    exteriorSalvagePerWreck: 3,
  },
  scoring: {
    lostCrewPenalty: -1,
  },
  grapple: {
    range: 6, // inches
    reelInVelocity: 2 as const, // Medium
  },
  scan: {
    range: 4, // inches
  },
  adjacency: {
    distance: 1, // inches; base-to-base within 1"
  },
} as const;

// Speed tier to inches lookup
export const VELOCITY_INCHES: Record<number, number> = {
  0: 0,
  1: RULES.velocity.short,
  2: RULES.velocity.medium,
  3: RULES.velocity.long,
};
