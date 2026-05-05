import type {
  GameState,
  Wreck,
  WreckRole,
  Salvage,
  DebrisToken,
  Vec2,
  WreckShape,
} from "./types";
import { ZERO_VELOCITY } from "./types";
import { RNG } from "./rng";
import { RULES } from "../config/rules";
import { distance, vec2 } from "./physics";
import { createInitialState } from "./state";

// ── Wreck shape templates ───────────────────────────────────

const WRECK_SHAPES: WreckShape[] = [
  {
    type: "freighter",
    bounds: [vec2(-3, -1.5), vec2(3, -1.5), vec2(3, 1.5), vec2(-3, 1.5)],
    walkableSurface: [vec2(-2, 0), vec2(0, 0), vec2(2, 0)],
  },
  {
    type: "station",
    bounds: [vec2(-2, -2), vec2(2, -2), vec2(2, 2), vec2(-2, 2)],
    walkableSurface: [vec2(-1, -1), vec2(1, -1), vec2(1, 1), vec2(-1, 1)],
  },
  {
    type: "carrier",
    bounds: [vec2(-4, -1), vec2(4, -1), vec2(4, 1), vec2(-4, 1)],
    walkableSurface: [vec2(-3, 0), vec2(-1, 0), vec2(1, 0), vec2(3, 0)],
  },
  {
    type: "broken",
    bounds: [vec2(-2, -1.5), vec2(2, -1.5), vec2(1.5, 1.5), vec2(-2.5, 1.5)],
    walkableSurface: [vec2(-1, 0), vec2(0.5, 0)],
  },
];

const HALF_TABLE = RULES.table.sizeInches / 2;

// ── Main setup function ─────────────────────────────────────

export function setupGame(
  seed: string,
  playerCount: number,
  playerNames?: string[],
  aiConfig?: Array<{ isAI: boolean; personality?: "aggressive" | "cautious" | "opportunistic" }>
): GameState {
  if (playerCount < 2 || playerCount > 4) {
    throw new Error(`Player count must be 2-4, got ${playerCount}`);
  }

  const rng = new RNG(seed + "-setup");
  let state = createInitialState(seed, playerCount);

  // Apply player names and AI config
  const playerIds = Object.keys(state.players);
  for (let i = 0; i < playerCount; i++) {
    const player = state.players[playerIds[i]];
    if (playerNames?.[i]) player.name = playerNames[i];
    if (aiConfig?.[i]) {
      player.isAI = aiConfig[i].isAI;
      player.aiPersonality = aiConfig[i].personality;
    }
  }

  // 1. Place wrecks
  state = placeWrecks(state, rng, playerCount);

  // 2. Assign wreck roles and populate
  state = assignWreckRoles(state, rng, playerCount);
  state = populateWrecks(state, rng);

  // 3. Scatter debris
  state = scatterDebris(state, rng);

  // 4. Place ships (reverse turn order)
  state = placeShips(state, rng);

  return state;
}

// ── Wreck placement ─────────────────────────────────────────

function placeWrecks(state: GameState, rng: RNG, playerCount: number): GameState {
  const config = RULES.wrecksByPlayerCount[playerCount];
  const wreckCount = config.total;
  const wrecks: Wreck[] = [];

  const shapePool = rng.shuffle([...WRECK_SHAPES]);

  for (let i = 0; i < wreckCount; i++) {
    const pos = findValidWreckPosition(wrecks, rng);
    const shape = shapePool[i % shapePool.length];

    wrecks.push({
      id: `wreck-${i}`,
      position: pos,
      shape: { ...shape },
      role: "mid", // placeholder, assigned below
      isRoleRevealed: false,
      exteriorSalvageIds: [],
      compartments: [
        { id: `wreck-${i}-hatch-0`, position: vec2(-1, 0), isSealed: true },
        { id: `wreck-${i}-hatch-1`, position: vec2(1, 0), isSealed: true },
      ],
    });
  }

  return { ...state, table: { ...state.table, wrecks } };
}

function findValidWreckPosition(existing: Wreck[], rng: RNG): Vec2 {
  const margin = RULES.table.edgeBuffer;
  const minSpacing = RULES.table.minWreckSpacing;
  const maxX = HALF_TABLE - margin;
  const maxZ = HALF_TABLE - margin;

  for (let attempt = 0; attempt < 100; attempt++) {
    let pos: Vec2;
    if (existing.length === 0) {
      // First wreck near center
      pos = vec2(
        rng.nextInt(-4, 4),
        rng.nextInt(-4, 4)
      );
    } else {
      pos = vec2(
        rng.nextInt(-maxX, maxX),
        rng.nextInt(-maxZ, maxZ)
      );
    }

    const valid = existing.every((w) => distance(w.position, pos) >= minSpacing);
    if (valid) return pos;
  }

  throw new Error("Failed to place wreck after 100 attempts");
}

// ── Wreck role assignment ───────────────────────────────────

function assignWreckRoles(state: GameState, rng: RNG, playerCount: number): GameState {
  const config = RULES.wrecksByPlayerCount[playerCount];
  const roles: WreckRole[] = [];

  for (const [role, count] of Object.entries(config.roles)) {
    for (let i = 0; i < count; i++) {
      roles.push(role as WreckRole);
    }
  }

  rng.shuffle(roles);

  const wrecks = state.table.wrecks.map((w, i) => ({
    ...w,
    role: roles[i],
  }));

  return { ...state, table: { ...state.table, wrecks } };
}

// ── Populate wrecks with salvage ────────────────────────────

function populateWrecks(state: GameState, rng: RNG): GameState {
  let salvageCounter = 0;
  const allSalvage: Salvage[] = [];
  const wrecks = state.table.wrecks.map((wreck) => {
    const updatedWreck = { ...wreck };

    // Exterior salvage: 3 wreck salvage tokens per wreck
    const exteriorIds: string[] = [];
    for (let i = 0; i < RULES.setup.exteriorSalvagePerWreck; i++) {
      const id = `salvage-${salvageCounter++}`;
      exteriorIds.push(id);
      allSalvage.push({
        id,
        type: "wreck",
        vp: RULES.salvage.wreck.vp,
        mass: RULES.salvage.wreck.mass,
        position: "on-wreck",
        containerId: wreck.id,
        isAttached: true,
        isFaceDown: true,
        velocity: { ...ZERO_VELOCITY },
      });
    }
    updatedWreck.exteriorSalvageIds = exteriorIds;

    // Compartment contents based on role
    const compartments = [...wreck.compartments];
    if (wreck.role === "jackpot") {
      // Both hatches have premium
      for (let i = 0; i < 2; i++) {
        const id = `salvage-${salvageCounter++}`;
        compartments[i] = { ...compartments[i], contentSalvageId: id };
        allSalvage.push({
          id,
          type: "premium",
          vp: RULES.salvage.premium.vp,
          mass: RULES.salvage.premium.mass,
          position: "in-compartment",
          containerId: wreck.id,
          isAttached: true,
          isFaceDown: true,
          velocity: { ...ZERO_VELOCITY },
        });
      }
    } else if (wreck.role === "mid") {
      // Shuffle 1 premium + 1 scatter into two hatches
      const contents: Array<{ type: "premium" | "scatter" }> = [
        { type: "premium" },
        { type: "scatter" },
      ];
      rng.shuffle(contents);
      for (let i = 0; i < 2; i++) {
        const id = `salvage-${salvageCounter++}`;
        const c = contents[i];
        compartments[i] = { ...compartments[i], contentSalvageId: id };
        allSalvage.push({
          id,
          type: c.type,
          vp: c.type === "premium" ? RULES.salvage.premium.vp : RULES.salvage.scatter.vp,
          mass: c.type === "premium" ? RULES.salvage.premium.mass : RULES.salvage.scatter.mass,
          position: "in-compartment",
          containerId: wreck.id,
          isAttached: true,
          isFaceDown: true,
          velocity: { ...ZERO_VELOCITY },
        });
      }
    }
    // bait: compartments are empty (no contentSalvageId)

    updatedWreck.compartments = compartments;
    return updatedWreck;
  });

  // Salvage tokens that are on wrecks don't go into looseSalvage
  return {
    ...state,
    table: {
      ...state.table,
      wrecks,
      looseSalvage: [...state.table.looseSalvage, ...allSalvage],
    },
  };
}

// ── Scatter debris ──────────────────────────────────────────

function scatterDebris(state: GameState, rng: RNG): GameState {
  const debris: DebrisToken[] = [];
  const margin = RULES.table.edgeBuffer;
  const maxCoord = HALF_TABLE - margin;

  for (let i = 0; i < RULES.setup.debrisCount; i++) {
    debris.push({
      id: `debris-${i}`,
      position: vec2(
        rng.nextInt(-maxCoord, maxCoord),
        rng.nextInt(-maxCoord, maxCoord)
      ),
      velocity: { ...ZERO_VELOCITY },
      isFaceDown: true,
    });
  }

  return { ...state, table: { ...state.table, debris } };
}

// ── Ship placement ──────────────────────────────────────────

function placeShips(state: GameState, rng: RNG): GameState {
  const playerIds = state.meta.turnOrder;
  const players = { ...state.players };
  const placedPositions: Vec2[] = [];

  // Reverse turn order for placement
  const placementOrder = [...playerIds].reverse();

  for (const pid of placementOrder) {
    const pos = findValidShipPosition(placedPositions, rng);
    placedPositions.push(pos);

    players[pid] = {
      ...players[pid],
      ship: {
        ...players[pid].ship,
        position: pos,
        velocity: { ...ZERO_VELOCITY },
      },
    };
  }

  return { ...state, players };
}

function findValidShipPosition(existing: Vec2[], rng: RNG): Vec2 {
  const edgeBuf = RULES.ship.baseSize.z; // within ~2-3" of edge
  const minSpacing = RULES.table.minShipSpacing;

  for (let attempt = 0; attempt < 100; attempt++) {
    // Pick a random edge (0=top, 1=right, 2=bottom, 3=left)
    const edge = rng.nextInt(0, 3);
    let pos: Vec2;

    switch (edge) {
      case 0: // top
        pos = vec2(rng.nextInt(-HALF_TABLE + 4, HALF_TABLE - 4), HALF_TABLE - edgeBuf);
        break;
      case 1: // right
        pos = vec2(HALF_TABLE - edgeBuf, rng.nextInt(-HALF_TABLE + 4, HALF_TABLE - 4));
        break;
      case 2: // bottom
        pos = vec2(rng.nextInt(-HALF_TABLE + 4, HALF_TABLE - 4), -HALF_TABLE + edgeBuf);
        break;
      case 3: // left
        pos = vec2(-HALF_TABLE + edgeBuf, rng.nextInt(-HALF_TABLE + 4, HALF_TABLE - 4));
        break;
      default:
        pos = vec2(0, HALF_TABLE - edgeBuf);
    }

    const valid = existing.every((p) => distance(p, pos) >= minSpacing);
    if (valid) return pos;
  }

  throw new Error("Failed to place ship after 100 attempts");
}
