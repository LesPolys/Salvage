import type {
  GameState,
  EntityId,
  Vec2,
  Salvage,
  Crew,
} from "../engine/types";
import { RULES } from "../config/rules";
import { distance } from "../engine/physics";

// ── Salvage evaluation ──────────────────────────────────────

export function evalSalvagePiece(
  state: GameState,
  piece: Salvage,
  playerId: string
): number {
  const baseValue = piece.vp;
  const risk = estimatedRiskOfLoss(state, piece, playerId);
  const timeCost = timeToStow(state, piece, playerId);

  // Value = VP weighted by accessibility and risk
  return baseValue * 1.0 - risk * 0.5 - timeCost * 0.3;
}

export function estimatedRiskOfLoss(
  state: GameState,
  piece: Salvage,
  playerId: string
): number {
  if (typeof piece.position !== "object") return 0;
  const pos = piece.position as Vec2;

  // Risk factors: distance from own ship, proximity to rivals, near table edge
  const player = state.players[playerId];
  const distToShip = distance(pos, player.ship.position);

  let nearestRival = Infinity;
  for (const p of Object.values(state.players)) {
    if (p.id === playerId) continue;
    nearestRival = Math.min(nearestRival, distance(pos, p.ship.position));
  }

  const halfTable = RULES.table.sizeInches / 2;
  const edgeDist = Math.min(
    halfTable - Math.abs(pos.x),
    halfTable - Math.abs(pos.z)
  );

  let risk = 0;
  if (distToShip > 15) risk += 0.3;
  if (nearestRival < 8) risk += 0.4;
  if (edgeDist < 4) risk += 0.2;

  return Math.min(1, risk);
}

export function timeToStow(
  state: GameState,
  piece: Salvage,
  playerId: string
): number {
  if (typeof piece.position !== "object") return 10;
  const pos = piece.position as Vec2;
  const player = state.players[playerId];
  const dist = distance(pos, player.ship.position);

  // Rough estimate: 1 round per 6 inches + 1 round for cut + 1 for stow
  const moveRounds = Math.ceil(dist / RULES.velocity.medium);
  const actionRounds = piece.isAttached ? 2 : 1; // cut + stow, or just stow

  return moveRounds + actionRounds;
}

// ── Position evaluation ─────────────────────────────────────

export function strandingRisk(
  state: GameState,
  _crew: Crew,
  destination: Vec2
): number {
  const halfTable = RULES.table.sizeInches / 2;
  const edgeDist = Math.min(
    halfTable - Math.abs(destination.x),
    halfTable - Math.abs(destination.z)
  );

  // Near edge = high stranding risk
  if (edgeDist < 3) return 0.9;
  if (edgeDist < 6) return 0.5;

  // Check if there's terrain nearby to land on
  let nearestTerrain = Infinity;
  for (const wreck of state.table.wrecks) {
    nearestTerrain = Math.min(nearestTerrain, distance(destination, wreck.position));
  }
  for (const player of Object.values(state.players)) {
    nearestTerrain = Math.min(nearestTerrain, distance(destination, player.ship.position));
  }

  if (nearestTerrain > 12) return 0.7;
  if (nearestTerrain > 8) return 0.3;
  return 0.1;
}

// ── Threat assessment ───────────────────────────────────────

export function nearestRivalDistance(
  state: GameState,
  pos: Vec2,
  playerId: string
): number {
  let nearest = Infinity;
  for (const player of Object.values(state.players)) {
    if (player.id === playerId) continue;
    for (const crew of Object.values(player.crews)) {
      if (crew.position === "embarked" || crew.state === "lost") continue;
      nearest = Math.min(nearest, distance(pos, crew.position as Vec2));
    }
    nearest = Math.min(nearest, distance(pos, player.ship.position));
  }
  return nearest;
}

export function countAvailableSalvage(state: GameState): number {
  return state.table.looseSalvage.filter(
    (s) => typeof s.position === "object" && !s.isAttached
  ).length;
}

// ── Crew utility ────────────────────────────────────────────

export function getCrewPosition(crew: Crew): Vec2 | null {
  if (crew.position === "embarked") return null;
  return crew.position as Vec2;
}

export function countActiveCrewInSpace(
  state: GameState,
  playerId: string
): number {
  const player = state.players[playerId];
  return Object.values(player.crews).filter(
    (c) => c.state === "active" && c.position !== "embarked"
  ).length;
}

export function getPlayerShipPos(state: GameState, playerId: string): Vec2 {
  return state.players[playerId].ship.position;
}

// ── Scoring helpers ─────────────────────────────────────────

export function getPlayerRank(state: GameState, playerId: string): number {
  const scores = Object.values(state.players)
    .map((p) => ({ id: p.id, score: p.score }))
    .sort((a, b) => b.score - a.score);
  return scores.findIndex((s) => s.id === playerId) + 1;
}

export function getScoreGap(state: GameState, playerId: string): number {
  const player = state.players[playerId];
  const others = Object.values(state.players).filter((p) => p.id !== playerId);
  const topRival = Math.max(...others.map((p) => p.score));
  return player.score - topRival;
}

// ── Slot matching ───────────────────────────────────────────

export function findBestSlotForDie(
  state: GameState,
  playerId: string,
  dieValue: number,
  priorityActions: string[]
): { unitId: EntityId; slotId: string } | null {
  const player = state.players[playerId];

  // Try priority actions first
  for (const actionPref of priorityActions) {
    // Check ship slots
    for (const slot of player.ship.slots) {
      if (slot.assignedDieId) continue;
      if (slot.id === actionPref && meetsReq(dieValue, slot.dieRequirement)) {
        return { unitId: player.ship.id, slotId: slot.id };
      }
    }
    // Check crew slots
    for (const crew of Object.values(player.crews)) {
      if (crew.state === "lost") continue;
      for (const slot of crew.slots) {
        if (slot.assignedDieId) continue;
        if (matchesAction(slot.id, actionPref) && meetsReq(dieValue, slot.dieRequirement)) {
          return { unitId: crew.id, slotId: slot.id };
        }
      }
    }
  }

  // Fallback: any open slot
  for (const slot of player.ship.slots) {
    if (!slot.assignedDieId && meetsReq(dieValue, slot.dieRequirement)) {
      return { unitId: player.ship.id, slotId: slot.id };
    }
  }
  for (const crew of Object.values(player.crews)) {
    if (crew.state === "lost") continue;
    for (const slot of crew.slots) {
      if (!slot.assignedDieId && meetsReq(dieValue, slot.dieRequirement)) {
        return { unitId: crew.id, slotId: slot.id };
      }
    }
  }

  return null;
}

function meetsReq(value: number, req: string): boolean {
  switch (req) {
    case "any": return true;
    case "1+": return value >= 1;
    case "2+": return value >= 2;
    case "3+": return value >= 3;
    case "4+": return value >= 4;
    case "5+": return value >= 5;
    case "6": return value === 6;
    default: return true;
  }
}

function matchesAction(slotId: string, action: string): boolean {
  if (slotId === action) return true;
  if (slotId.includes("generic") && ["crawl", "push-off", "thruster-burn", "haul", "rig-tether", "scavenge", "brace", "shove", "tackle", "embark"].includes(action)) return true;
  if (slotId.includes("locked") && ["cut", "grapple", "breach", "heavy-haul"].includes(action)) return true;
  return false;
}
