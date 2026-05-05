// ── Primitives ──────────────────────────────────────────────

export interface Vec2 {
  x: number;
  z: number;
}

export type EntityId = string; // UUID

export type Phase =
  | "roll"
  | "assign"
  | "reveal"
  | "resolve"
  | "drift"
  | "scoring"
  | "gameover";

export type Direction = "N" | "NE" | "SE" | "S" | "SW" | "NW";

// ── Velocity ────────────────────────────────────────────────

export type SpeedTier = 0 | 1 | 2 | 3; // 0=stopped, 1=Short, 2=Medium, 3=Long

export interface Velocity {
  direction: number; // radians, 0 = +x
  magnitude: SpeedTier;
}

export const ZERO_VELOCITY: Velocity = { direction: 0, magnitude: 0 };

// ── Dice ────────────────────────────────────────────────────

export type DieValue = 1 | 2 | 3 | 4 | 5 | 6;
export type DieState = "rolled" | "assigned" | "spent" | "forfeit";

export interface Die {
  id: string;
  value: DieValue;
  state: DieState;
  assignedTo?: EntityId; // unit ID this die is assigned to
}

export type DieRequirement = "any" | "1+" | "2+" | "3+" | "4+" | "5+" | "6";

// ── Ship ────────────────────────────────────────────────────

export type ShipSlotId =
  | "burn-small"
  | "burn-big"
  | "burn-max"
  | "launch"
  | "recall"
  | "stow"
  | "scan";

export interface ShipSlot {
  id: ShipSlotId;
  dieRequirement: DieRequirement;
}

export interface Anchor {
  id: string;
  positionOffset: Vec2; // relative to ship center
  inUse: boolean;
}

export interface Ship {
  id: EntityId;
  ownerId: string;
  position: Vec2;
  velocity: Velocity;
  hold: Salvage[];
  holdMass: number; // computed; max 6
  hullAnchors: Anchor[];
  slots: ShipSlot[]; // available actions + requirements
  dicePool: string[]; // die IDs assigned to this ship
}

// ── Crew ────────────────────────────────────────────────────

export type CrewRole = "Cutter" | "Grappler" | "Breacher" | "Hauler";
export type CrewState = "active" | "lost" | "grappled";

export interface CrewSlot {
  id: string;
  isRoleLocked: boolean;
  dieRequirement: DieRequirement;
}

export interface Crew {
  id: EntityId;
  ownerId: string;
  role: CrewRole;
  position: Vec2 | "embarked";
  velocity: Velocity;
  carrying: Salvage[];
  state: CrewState;
  grappledWithId?: EntityId;
  tetherIds: string[];
  slots: CrewSlot[]; // available actions + requirements
  dicePool: string[]; // die IDs assigned to this crew
  onTerrainId?: EntityId;
}

// ── Salvage ─────────────────────────────────────────────────

export type SalvageType = "scatter" | "wreck" | "premium";
export type SalvageMass = 1 | 2 | 3;
export type SalvagePosition = Vec2 | "in-hold" | "in-compartment" | "on-wreck";

export interface Salvage {
  id: EntityId;
  type: SalvageType;
  vp: number;
  mass: SalvageMass;
  position: SalvagePosition;
  containerId?: EntityId;
  isAttached: boolean;
  isFaceDown: boolean;
  scannedBy?: string[]; // player IDs who have scanned this (per-player visibility)
  velocity: Velocity;
}

// ── Wrecks & Terrain ────────────────────────────────────────

export type WreckRole = "jackpot" | "mid" | "bait";

export interface WreckShape {
  type: "freighter" | "station" | "carrier" | "broken";
  bounds: Vec2[];
  walkableSurface: Vec2[];
}

export interface Compartment {
  id: string;
  position: Vec2; // relative to wreck center
  isSealed: boolean;
  contentSalvageId?: EntityId;
  scannedBy?: string[]; // player IDs who have scanned this compartment
}

export interface Wreck {
  id: EntityId;
  position: Vec2;
  shape: WreckShape;
  role: WreckRole;
  isRoleRevealed: boolean;
  exteriorSalvageIds: EntityId[];
  compartments: Compartment[];
}

export interface Asteroid {
  id: EntityId;
  position: Vec2;
  bounds: Vec2[];
}

// ── Debris ──────────────────────────────────────────────────

export interface DebrisToken {
  id: EntityId;
  position: Vec2;
  velocity: Velocity;
  isFaceDown: boolean;
}

// ── Tethers ─────────────────────────────────────────────────

export type TetherLength = "short" | "medium" | "long";
export type TetherState = "slack" | "taut" | "snapped";

export interface TetherEndpoint {
  entityId: EntityId;
  anchorId?: string; // for ship hull anchors
}

export interface Tether {
  id: string;
  endpointA: TetherEndpoint;
  endpointB: TetherEndpoint;
  length: TetherLength;
  loadRating: number;
  isShipGrade: boolean;
  state: TetherState;
  isAnchorSwingTemp?: boolean;
}

// ── Players ─────────────────────────────────────────────────

export type AIPersonality = "aggressive" | "cautious" | "opportunistic";

export interface Player {
  id: string;
  name: string;
  isAI: boolean;
  aiPersonality?: AIPersonality;
  color: string; // hex
  ship: Ship;
  crews: Record<string, Crew>; // keyed by role
  dice: Die[];
  rerollsRemaining: number;
  score: number;
}

// ── Actions ─────────────────────────────────────────────────

export type ActionType =
  | "burn-small"
  | "burn-big"
  | "burn-max"
  | "launch"
  | "recall"
  | "stow"
  | "scan"
  | "cut"
  | "grapple"
  | "breach"
  | "heavy-haul"
  | "crawl"
  | "push-off"
  | "thruster-burn"
  | "haul"
  | "rig-tether"
  | "scavenge"
  | "brace"
  | "shove"
  | "tackle"
  | "embark"
  | "self-tether";

export interface PendingAction {
  id: string;
  playerId: string;
  unitId: EntityId;
  slotId: string;
  dieId: string;
  actionType: ActionType;
  parameters?: Record<string, unknown>;
}

// ── History / Telemetry ─────────────────────────────────────

export interface HistoryEntry {
  timestamp: number;
  round: number;
  phase: Phase;
  action: Action;
  stateHashBefore: string;
  stateHashAfter: string;
}

// ── Game State ──────────────────────────────────────────────

export interface GameState {
  meta: {
    seed: string;
    round: number;
    phase: Phase;
    activePlayerId: string;
    turnOrder: string[];
  };
  players: Record<string, Player>;
  table: {
    wrecks: Wreck[];
    asteroids: Asteroid[];
    looseSalvage: Salvage[];
    debris: DebrisToken[];
    debrisDriftDirection?: Direction;
  };
  tethers: Tether[];
  pendingActions: PendingAction[];
  velocityMap: Record<EntityId, Velocity>;
  history: HistoryEntry[];
}

// ── Reducer Actions ─────────────────────────────────────────

export type Action =
  | { type: "ROLL_DICE"; playerId: string }
  | { type: "REROLL"; playerId: string; dieIds: string[] }
  | {
      type: "ASSIGN_DIE";
      playerId: string;
      dieId: string;
      unitId: EntityId;
    }
  | { type: "UNASSIGN_DIE"; playerId: string; dieId: string }
  | { type: "REVEAL_ASSIGNMENTS" }
  | { type: "ACTIVATE_UNIT"; playerId: string; unitId: EntityId }
  | {
      type: "RESOLVE_DIE";
      playerId: string;
      unitId: EntityId;
      dieId: string;
      actionType: ActionType;
      parameters: Record<string, unknown>;
    }
  | {
      type: "RESIST";
      targetCrewId: EntityId;
      resistDieId: string;
      sourceActionId: string;
    }
  | { type: "ADVANCE_PHASE" }
  | { type: "RUN_DRIFT" }
  | { type: "END_GAME" };
