import type {
  GameState,
  EntityId,
  Vec2,
  Crew,
  Ship,
  Salvage,
  DieRequirement,
  DieValue,
  SpeedTier,
  Velocity,
  ActionType,
} from "./types";
import { RULES } from "../config/rules";
import {
  distance,
  isAdjacent,
  isWithinRange,
  addVelocities,
  makeVelocity,
  burnPenaltySteps,
  dropSpeedTier,
  hasLineOfSight,
  angleBetween,
  add,
  sub,
  normalize,
  scale,
} from "./physics";
import { RNG } from "./rng";

// ── Helpers ─────────────────────────────────────────────────

export function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state));
}

function findPlayer(state: GameState, playerId: string) {
  const p = state.players[playerId];
  if (!p) throw new Error(`Unknown player: ${playerId}`);
  return p;
}

function requireRole(state: GameState, unitId: EntityId, role: string): void {
  const result = findCrewById(state, unitId);
  if (!result) throw new Error(`Unit ${unitId} is not a crew`);
  if (result.crew.role !== role) {
    throw new Error(`${role} action requires ${role} role, but unit is ${result.crew.role}`);
  }
}

function findCrewById(state: GameState, crewId: EntityId): { crew: Crew; player: typeof state.players[string] } | null {
  for (const player of Object.values(state.players)) {
    for (const crew of Object.values(player.crews)) {
      if (crew.id === crewId) return { crew, player };
    }
  }
  return null;
}

function findShipById(state: GameState, shipId: EntityId): { ship: Ship; player: typeof state.players[string] } | null {
  for (const player of Object.values(state.players)) {
    if (player.ship.id === shipId) return { ship: player.ship, player };
  }
  return null;
}

function getCrewPosition(crew: Crew): Vec2 | null {
  if (crew.position === "embarked") return null;
  return crew.position;
}

export function meetsRequirement(value: DieValue, req: DieRequirement): boolean {
  switch (req) {
    case "any": return true;
    case "1+": return value >= 1;
    case "2+": return value >= 2;
    case "3+": return value >= 3;
    case "4+": return value >= 4;
    case "5+": return value >= 5;
    case "6": return value === 6;
  }
}

function severTethersOnSalvage(state: GameState, salvageId: EntityId): GameState {
  state.tethers = state.tethers.filter(
    (t) =>
      t.endpointA.entityId !== salvageId && t.endpointB.entityId !== salvageId
  );
  // Also clean up tetherIds on crew/anchors referencing these tethers
  return state;
}

// ── ASSIGN_DIE (dice-as-resource: assign to unit pool, not action slot) ──

export function reduceAssignDie(
  state: GameState,
  playerId: string,
  dieId: string,
  unitId: EntityId
): GameState {
  if (state.meta.phase !== "assign")
    throw new Error(`Cannot assign dice in phase: ${state.meta.phase}`);

  const next = cloneState(state);
  const player = findPlayer(next, playerId);

  const die = player.dice.find((d) => d.id === dieId);
  if (!die) throw new Error(`Unknown die: ${dieId}`);
  if (die.state !== "rolled") throw new Error(`Die ${dieId} is not in rolled state`);

  // Validate unit belongs to player
  let unitFound = false;
  if (player.ship.id === unitId) {
    player.ship.dicePool.push(dieId);
    unitFound = true;
  } else {
    for (const crew of Object.values(player.crews)) {
      if (crew.id === unitId) {
        if (crew.state === "lost") throw new Error(`Cannot assign to lost crew`);
        crew.dicePool.push(dieId);
        unitFound = true;
        break;
      }
    }
  }

  if (!unitFound) throw new Error(`Unit ${unitId} not found for player ${playerId}`);

  die.state = "assigned";
  die.assignedTo = unitId;

  return next;
}

// ── UNASSIGN_DIE (move die back to pool) ────────────────────

export function reduceUnassignDie(
  state: GameState,
  playerId: string,
  dieId: string
): GameState {
  if (state.meta.phase !== "assign")
    throw new Error(`Cannot unassign dice in phase: ${state.meta.phase}`);

  const next = cloneState(state);
  const player = findPlayer(next, playerId);

  const die = player.dice.find((d) => d.id === dieId);
  if (!die) throw new Error(`Unknown die: ${dieId}`);
  if (die.state !== "assigned") throw new Error(`Die ${dieId} is not assigned`);

  // Remove from unit's pool
  const unitId = die.assignedTo;
  if (unitId) {
    if (player.ship.id === unitId) {
      player.ship.dicePool = player.ship.dicePool.filter((id) => id !== dieId);
    } else {
      for (const crew of Object.values(player.crews)) {
        if (crew.id === unitId) {
          crew.dicePool = crew.dicePool.filter((id) => id !== dieId);
          break;
        }
      }
    }
  }

  die.state = "rolled";
  die.assignedTo = undefined;

  return next;
}

// ── REVEAL_ASSIGNMENTS ──────────────────────────────────────

export function reduceRevealAssignments(state: GameState): GameState {
  if (state.meta.phase !== "assign")
    throw new Error(`Cannot reveal in phase: ${state.meta.phase}`);

  const next = cloneState(state);
  next.meta.phase = "reveal";

  // Forfeit any unassigned dice
  for (const player of Object.values(next.players)) {
    for (const die of player.dice) {
      if (die.state === "rolled") {
        die.state = "forfeit";
      }
    }
  }

  return next;
}

// ── ADVANCE_PHASE ───────────────────────────────────────────

export function reduceAdvancePhase(state: GameState): GameState {
  const next = cloneState(state);

  switch (next.meta.phase) {
    case "roll":
      next.meta.phase = "assign";
      break;

    case "assign":
      // Should use REVEAL_ASSIGNMENTS instead
      throw new Error("Use REVEAL_ASSIGNMENTS to move from assign to reveal");

    case "reveal":
      next.meta.phase = "resolve";
      // Compute turn order: lowest score first
      next.meta.turnOrder = computeTurnOrder(next);
      next.meta.activePlayerId = next.meta.turnOrder[0];
      break;

    case "resolve":
      next.meta.phase = "drift";
      break;

    case "drift":
      if (next.meta.round >= RULES.rounds.total) {
        next.meta.phase = "scoring";
      } else {
        // Next round
        next.meta.round += 1;
        next.meta.phase = "roll";
        // Reset all dice and slots
        resetForNewRound(next);
      }
      break;

    case "scoring":
      next.meta.phase = "gameover";
      break;

    case "gameover":
      throw new Error("Game is already over");
  }

  return next;
}

function computeTurnOrder(state: GameState): string[] {
  const playerIds = Object.keys(state.players);
  return playerIds.sort((a, b) => {
    const scoreA = state.players[a].score;
    const scoreB = state.players[b].score;
    if (scoreA !== scoreB) return scoreA - scoreB; // lowest first
    // Ties: maintain existing order (seating order)
    return playerIds.indexOf(a) - playerIds.indexOf(b);
  });
}

function resetForNewRound(state: GameState): void {
  for (const player of Object.values(state.players)) {
    player.dice = [];
    player.rerollsRemaining = 0;

    // Clear dice pools
    player.ship.dicePool = [];
    for (const crew of Object.values(player.crews)) {
      crew.dicePool = [];
    }
  }

  state.pendingActions = [];
}

// ── ACTIVATE_UNIT ───────────────────────────────────────────

export interface ActivationState {
  unitId: EntityId;
  playerId: string;
  diceToResolve: string[]; // die IDs in order
  resolved: Set<string>;
}

export function reduceActivateUnit(
  state: GameState,
  playerId: string,
  unitId: EntityId
): GameState {
  if (state.meta.phase !== "resolve")
    throw new Error(`Cannot activate in phase: ${state.meta.phase}`);
  if (state.meta.activePlayerId !== playerId)
    throw new Error(`Not ${playerId}'s turn to activate`);

  const next = cloneState(state);
  const player = findPlayer(next, playerId);

  // Find the unit and its assigned dice
  let hasDice = false;

  if (player.ship.id === unitId) {
    hasDice = player.ship.dicePool.length > 0;
  } else {
    for (const crew of Object.values(player.crews)) {
      if (crew.id === unitId) {
        if (crew.state === "lost") throw new Error("Cannot activate lost crew");
        hasDice = crew.dicePool.length > 0;
        break;
      }
    }
  }

  if (!hasDice) throw new Error(`Unit ${unitId} has no dice to resolve`);

  return next;
}

// ── Advance active player ───────────────────────────────────

export function advanceActivePlayer(state: GameState): GameState {
  const next = cloneState(state);
  const order = next.meta.turnOrder;
  const currentIdx = order.indexOf(next.meta.activePlayerId);

  // Find next player with unactivated units that have dice
  for (let i = 1; i <= order.length; i++) {
    const idx = (currentIdx + i) % order.length;
    const pid = order[idx];
    if (playerHasUnactivatedDice(next, pid)) {
      next.meta.activePlayerId = pid;
      return next;
    }
  }

  // Check if current player still has unactivated dice
  if (playerHasUnactivatedDice(next, next.meta.activePlayerId)) {
    return next;
  }

  // No one has dice left — resolve phase is done
  return next;
}

function playerHasUnactivatedDice(state: GameState, playerId: string): boolean {
  const player = state.players[playerId];

  // Check ship dice pool
  if (player.ship.dicePool.length > 0) return true;

  // Check crew dice pools
  for (const crew of Object.values(player.crews)) {
    if (crew.state === "lost") continue;
    if (crew.dicePool.length > 0) return true;
  }

  return false;
}

export function anyPlayerHasUnactivatedDice(state: GameState): boolean {
  return Object.keys(state.players).some((pid) =>
    playerHasUnactivatedDice(state, pid)
  );
}

// ── RESOLVE_DIE (master dispatch) ───────────────────────────

export function reduceResolveDie(
  state: GameState,
  playerId: string,
  unitId: EntityId,
  dieId: string,
  actionType: ActionType,
  parameters: Record<string, unknown>
): GameState {
  if (state.meta.phase !== "resolve")
    throw new Error(`Cannot resolve die in phase: ${state.meta.phase}`);

  const next = cloneState(state);
  const player = findPlayer(next, playerId);

  // Find the die
  const die = player.dice.find((d) => d.id === dieId);
  if (!die) throw new Error(`Unknown die: ${dieId}`);
  if (die.state !== "assigned") throw new Error(`Die ${dieId} is not in assigned state`);
  if (die.assignedTo !== unitId)
    throw new Error(`Die ${dieId} is not assigned to unit ${unitId}`);

  // Validate die meets requirement for the chosen action
  const slot = getActionSlot(next, playerId, unitId, actionType);
  if (slot && !meetsRequirement(die.value, slot.dieRequirement)) {
    throw new Error(`Die value ${die.value} doesn't meet requirement ${slot.dieRequirement} for ${actionType}`);
  }

  // Mark die as spent and remove from unit pool
  die.state = "spent";
  removeFromDicePool(next, playerId, unitId, dieId);

  // Dispatch to action resolver
  return resolveAction(next, playerId, unitId, "", die.value as DieValue, actionType as string, parameters);
}

/** Find the slot definition for an action to check die requirements */
function getActionSlot(
  state: GameState,
  playerId: string,
  unitId: EntityId,
  actionType: ActionType
): { dieRequirement: DieRequirement } | null {
  const player = state.players[playerId];

  // Ship actions have explicit slots
  if (player.ship.id === unitId) {
    const slot = player.ship.slots.find((s) => s.id === actionType);
    if (slot) return slot;
  }

  // Crew: check role-locked and generic action requirements
  for (const crew of Object.values(player.crews)) {
    if (crew.id !== unitId) continue;
    // Role-locked actions
    const roleActions: Record<string, DieRequirement> = {
      "cut": "3+", "grapple": "3+", "breach": "5+", "heavy-haul": "any",
    };
    if (actionType in roleActions) return { dieRequirement: roleActions[actionType] };
    // Generic crew actions
    const genericActions: Record<string, DieRequirement> = {
      "crawl": "any", "push-off": "2+", "thruster-burn": "4+", "haul": "any",
      "rig-tether": "any", "scavenge": "1+", "brace": "any", "shove": "any",
      "tackle": "3+", "embark": "any", "self-tether": "any",
    };
    if (actionType in genericActions) return { dieRequirement: genericActions[actionType] };
  }

  return null;
}

function removeFromDicePool(state: GameState, playerId: string, unitId: EntityId, dieId: string): void {
  const player = state.players[playerId];
  if (player.ship.id === unitId) {
    player.ship.dicePool = player.ship.dicePool.filter((id) => id !== dieId);
  } else {
    for (const crew of Object.values(player.crews)) {
      if (crew.id === unitId) {
        crew.dicePool = crew.dicePool.filter((id) => id !== dieId);
        break;
      }
    }
  }
}

// ── Action dispatch ─────────────────────────────────────────

function resolveAction(
  state: GameState,
  playerId: string,
  unitId: EntityId,
  _slotId: string,
  dieValue: DieValue,
  actionType: string,
  params: Record<string, unknown>
): GameState {
  switch (actionType) {
    // Ship actions
    case "burn-small":
      return resolveBurn(state, playerId, 1 as SpeedTier, dieValue, params);
    case "burn-big":
      return resolveBurn(state, playerId, 2 as SpeedTier, dieValue, params);
    case "burn-max":
      return resolveBurn(state, playerId, 3 as SpeedTier, dieValue, params);
    case "launch":
      return resolveLaunch(state, playerId, params);
    case "recall":
      return resolveRecall(state, playerId, params);
    case "stow":
      return resolveStow(state, playerId, params);
    case "scan":
      return resolveScan(state, playerId, params);

    // Crew role-locked (require correct specialist)
    case "cut":
      requireRole(state, unitId, "Cutter");
      return resolveCut(state, playerId, unitId, params);
    case "grapple":
      requireRole(state, unitId, "Grappler");
      return resolveGrapple(state, playerId, unitId, dieValue, params);
    case "breach":
      requireRole(state, unitId, "Breacher");
      return resolveBreach(state, playerId, unitId, params);
    case "heavy-haul":
      requireRole(state, unitId, "Hauler");
      return resolveHaul(state, playerId, unitId, true);

    // Crew generic
    case "crawl":
      return resolveCrawl(state, playerId, unitId, dieValue, params);
    case "push-off":
      return resolvePushOff(state, playerId, unitId, params);
    case "thruster-burn":
      return resolveThrusterBurn(state, playerId, unitId, dieValue, params);
    case "haul":
      return resolveHaul(state, playerId, unitId, false);
    case "rig-tether":
      return resolveRigTether(state, playerId, unitId, params);
    case "scavenge":
      return resolveScavenge(state, playerId, unitId, params);
    case "brace":
      return resolveBrace(state, playerId, unitId);
    case "shove":
      return resolveShove(state, playerId, unitId, dieValue, params);
    case "tackle":
      return resolveTackle(state, playerId, unitId, dieValue, params);
    case "embark":
      return resolveEmbark(state, playerId, unitId);

    default:
      throw new Error(`Unknown action type: ${actionType}`);
  }
}

// ── Ship action resolvers ───────────────────────────────────

function resolveBurn(
  state: GameState,
  playerId: string,
  baseTier: SpeedTier,
  _dieValue: DieValue,
  params: Record<string, unknown>
): GameState {
  const player = state.players[playerId];
  const ship = player.ship;

  // Apply mass penalty
  const penalty = burnPenaltySteps(ship.holdMass);
  const effectiveTier = dropSpeedTier(baseTier, penalty);

  if (effectiveTier === 0) return state; // penalty killed the burn

  // Direction from params, fallback to current velocity direction
  const burnDirection = typeof params.direction === "number"
    ? params.direction
    : (ship.velocity.magnitude > 0 ? ship.velocity.direction : 0);

  const burnVelocity = makeVelocity(burnDirection, effectiveTier);
  ship.velocity = addVelocities(ship.velocity, burnVelocity);

  return state;
}

function resolveLaunch(
  state: GameState,
  playerId: string,
  params: Record<string, unknown>
): GameState {
  const player = state.players[playerId];
  const crewId = params.crewId as string;
  const direction = params.direction as number;

  const crew = Object.values(player.crews).find((c) => c.id === crewId);
  if (!crew) throw new Error(`Unknown crew: ${crewId}`);
  if (crew.position !== "embarked") throw new Error("Crew is not embarked");

  // Place crew at ship hull with Short velocity in chosen direction
  crew.position = { ...player.ship.position };
  crew.velocity = makeVelocity(direction, 1);
  crew.onTerrainId = undefined;

  return state;
}

function resolveRecall(
  state: GameState,
  playerId: string,
  params: Record<string, unknown>
): GameState {
  const player = state.players[playerId];
  const crewId = params.crewId as string;

  const crew = Object.values(player.crews).find((c) => c.id === crewId);
  if (!crew) throw new Error(`Unknown crew: ${crewId}`);

  // Verify crew is tethered to ship hull anchor
  const tether = state.tethers.find(
    (t) =>
      (t.endpointA.entityId === crewId &&
        t.endpointB.entityId === player.ship.id) ||
      (t.endpointB.entityId === crewId &&
        t.endpointA.entityId === player.ship.id)
  );
  if (!tether) throw new Error("Crew is not tethered to ship");

  // Check load
  const totalMass = 1 + crew.carrying.reduce((sum, s) => sum + s.mass, 0);
  if (totalMass > tether.loadRating) throw new Error("Tether load exceeded");

  crew.position = { ...player.ship.position };
  crew.velocity = { direction: 0, magnitude: 0 };
  crew.onTerrainId = player.ship.id;

  return state;
}

function resolveStow(
  state: GameState,
  playerId: string,
  params: Record<string, unknown>
): GameState {
  const player = state.players[playerId];
  const salvageId = params.salvageId as string;
  const ejectIds = (params.ejectIds as string[]) ?? [];

  // Find the salvage piece
  const salvageIdx = state.table.looseSalvage.findIndex(
    (s) => s.id === salvageId
  );
  if (salvageIdx === -1) throw new Error("Salvage not found in loose salvage");

  const salvage = state.table.looseSalvage[salvageIdx];
  if (typeof salvage.position !== "object")
    throw new Error("Salvage is not at a position");

  // Check adjacency to ship hull
  if (!isWithinRange(salvage.position as Vec2, player.ship.position, RULES.adjacency.distance + RULES.ship.baseSize.z / 2))
    throw new Error("Salvage is not adjacent to ship");

  // Eject first (committed)
  for (const eid of ejectIds) {
    const ejectIdx = player.ship.hold.findIndex((s) => s.id === eid);
    if (ejectIdx === -1) throw new Error(`Cannot eject: ${eid} not in hold`);
    const ejected = player.ship.hold.splice(ejectIdx, 1)[0];
    ejected.position = { ...player.ship.position };
    ejected.velocity = { direction: 0, magnitude: 0 };
    ejected.isAttached = false;
    state.table.looseSalvage.push(ejected);
    player.ship.holdMass -= ejected.mass;
  }

  // Check capacity
  if (player.ship.holdMass + salvage.mass > RULES.ship.holdCapacity)
    throw new Error("Hold lacks capacity");

  // Stow
  salvage.position = "in-hold";
  salvage.containerId = player.ship.id;
  salvage.isAttached = false;
  salvage.isFaceDown = false;
  player.ship.hold.push(salvage);
  player.ship.holdMass += salvage.mass;
  state.table.looseSalvage.splice(salvageIdx, 1);

  // Sever any tethers on stowed piece
  severTethersOnSalvage(state, salvageId);

  // Update score
  player.score = computePlayerScore(state, playerId);

  return state;
}

function resolveScan(
  state: GameState,
  playerId: string,
  params: Record<string, unknown>
): GameState {
  const player = state.players[playerId];
  const targetId = params.targetId as string;

  // Check if it's a salvage token
  const salvage = state.table.looseSalvage.find((s) => s.id === targetId);
  if (salvage) {
    if (typeof salvage.position === "object") {
      if (!isWithinRange(salvage.position, player.ship.position, RULES.scan.range))
        throw new Error("Target out of scan range");
    }
    // Per-player visibility: add to scannedBy rather than globally revealing
    if (!salvage.scannedBy) salvage.scannedBy = [];
    if (!salvage.scannedBy.includes(playerId)) salvage.scannedBy.push(playerId);
    return state;
  }

  // Check if it's a compartment
  for (const wreck of state.table.wrecks) {
    if (!isWithinRange(wreck.position, player.ship.position, RULES.scan.range))
      continue;
    const comp = wreck.compartments.find((c) => c.id === targetId);
    if (comp && comp.isSealed) {
      // Per-player visibility on compartment
      if (!comp.scannedBy) comp.scannedBy = [];
      if (!comp.scannedBy.includes(playerId)) comp.scannedBy.push(playerId);
      // Also mark the content salvage as scanned by this player
      if (comp.contentSalvageId) {
        const contentSalvage = state.table.looseSalvage.find(
          (s) => s.id === comp.contentSalvageId
        );
        if (contentSalvage) {
          if (!contentSalvage.scannedBy) contentSalvage.scannedBy = [];
          if (!contentSalvage.scannedBy.includes(playerId))
            contentSalvage.scannedBy.push(playerId);
        }
      }
      return state;
    }
  }

  throw new Error("Scan target not found");
}

// ── Crew action resolvers ───────────────────────────────────

function resolveCut(
  state: GameState,
  _playerId: string,
  crewId: EntityId,
  params: Record<string, unknown>
): GameState {
  const result = findCrewById(state, crewId);
  if (!result) throw new Error(`Unknown crew: ${crewId}`);
  const { crew } = result;
  const crewPos = getCrewPosition(crew);
  if (!crewPos) throw new Error("Crew is embarked");

  const targetType = params.targetType as string; // "salvage" or "tether"
  const targetId = params.targetId as string;

  if (targetType === "salvage") {
    // Find salvage on wreck
    const salvage = state.table.looseSalvage.find(
      (s) => s.id === targetId && s.isAttached
    );
    if (!salvage) throw new Error("Salvage not found or already cut");

    // Check adjacency: crew must be adjacent to the wreck the salvage is on
    const wreck = state.table.wrecks.find(
      (w) => w.id === salvage.containerId
    );
    if (!wreck) throw new Error("Wreck not found");
    if (!isWithinRange(crewPos, wreck.position, RULES.adjacency.distance + 3))
      throw new Error("Not adjacent to wreck");

    // Cut: detach from wreck, place at wreck position, velocity 0
    salvage.isAttached = false;
    salvage.position = { ...wreck.position };
    salvage.containerId = undefined;
    salvage.velocity = { direction: 0, magnitude: 0 };
  } else if (targetType === "tether") {
    const tetherIdx = state.tethers.findIndex((t) => t.id === targetId);
    if (tetherIdx === -1) throw new Error("Tether not found");
    // Check adjacency to tether (crew must be adjacent to either endpoint)
    // Remove the tether — taut/slack velocity effects are handled by existing velocity state
    state.tethers.splice(tetherIdx, 1);

    // If taut: both endpoints fly with tangent velocity
    // If slack: both endpoints maintain current velocity
    // (Velocity effects handled by existing velocity state — taut cut just means
    //  the tether no longer constrains, so entities keep their current velocities)
  } else {
    throw new Error(`Unknown cut target type: ${targetType}`);
  }

  return state;
}

function resolveGrapple(
  state: GameState,
  _playerId: string,
  crewId: EntityId,
  _dieValue: DieValue,
  params: Record<string, unknown>
): GameState {
  const result = findCrewById(state, crewId);
  if (!result) throw new Error(`Unknown crew: ${crewId}`);
  const { crew } = result;
  const crewPos = getCrewPosition(crew);
  if (!crewPos) throw new Error("Crew is embarked");

  const mode = params.mode as string; // "reel-in" | "yank" | "anchor-swing"
  const targetId = params.targetId as string;
  const targetPos = getTargetPosition(state, targetId);
  if (!targetPos) throw new Error("Target has no position");

  // Validate range and LoS
  if (!isWithinRange(crewPos, targetPos, RULES.grapple.range))
    throw new Error("Target out of grapple range");
  if (!hasLineOfSight(state, crewPos, targetPos, new Set([crewId, targetId])))
    throw new Error("No line of sight to target");

  switch (mode) {
    case "reel-in": {
      // Grappler gains Medium velocity toward target
      const dir = angleBetween(crewPos, targetPos);
      const reelVel = makeVelocity(dir, RULES.grapple.reelInVelocity as SpeedTier);
      crew.velocity = addVelocities(crew.velocity, reelVel);
      break;
    }
    case "yank": {
      // Find target entity
      const targetMass = getTargetMass(state, targetId);
      if (targetMass > 2) throw new Error("Cannot yank mass > 2");

      // Check if target is tethered
      const isTethered = state.tethers.some(
        (t) =>
          t.endpointA.entityId === targetId ||
          t.endpointB.entityId === targetId
      );
      if (isTethered) throw new Error("Cannot yank tethered target");

      // Check if target is a ship
      if (findShipById(state, targetId)) throw new Error("Cannot yank ships");

      // Check if target has an active brace
      if (consumeBrace(state, targetId)) break; // force absorbed

      // Apply velocity to target
      const dirToGrappler = angleBetween(targetPos, crewPos);
      applyVelocityToEntity(state, targetId, makeVelocity(dirToGrappler, 1));

      // Recoil for mass-2 targets if grappler not on terrain
      if (targetMass === 2 && !crew.onTerrainId) {
        const dirToTarget = angleBetween(crewPos, targetPos);
        crew.velocity = addVelocities(crew.velocity, makeVelocity(dirToTarget, 1));
      }
      break;
    }
    case "anchor-swing": {
      // Target must be terrain
      const isTerrainTarget =
        state.table.wrecks.some((w) => w.id === targetId) ||
        state.table.asteroids.some((a) => a.id === targetId) ||
        Object.values(state.players).some((p) => p.ship.id === targetId);
      if (!isTerrainTarget) throw new Error("Anchor swing requires terrain target");

      // Create temporary tether
      const dist = distance(crewPos, targetPos);
      state.tethers.push({
        id: `anchor-swing-${crewId}-${Date.now()}`,
        endpointA: { entityId: crewId },
        endpointB: { entityId: targetId },
        length: dist <= 3 ? "short" : dist <= 6 ? "medium" : "long",
        loadRating: RULES.tethers.defaultLoad,
        isShipGrade: false,
        state: "taut",
        isAnchorSwingTemp: true,
      });
      break;
    }
    default:
      throw new Error(`Unknown grapple mode: ${mode}`);
  }

  return state;
}

function resolveBreach(
  state: GameState,
  playerId: string,
  crewId: EntityId,
  params: Record<string, unknown>
): GameState {
  const result = findCrewById(state, crewId);
  if (!result) throw new Error(`Unknown crew: ${crewId}`);
  const { crew } = result;
  const crewPos = getCrewPosition(crew);
  if (!crewPos) throw new Error("Crew is embarked");

  const targetType = params.targetType as string; // "compartment" or "ship"
  const targetId = params.targetId as string;

  if (targetType === "compartment") {
    // Find compartment on adjacent wreck
    for (const wreck of state.table.wrecks) {
      const comp = wreck.compartments.find((c) => c.id === targetId);
      if (comp) {
        if (!comp.isSealed) throw new Error("Compartment already open");
        if (!isWithinRange(crewPos, add(wreck.position, comp.position), RULES.adjacency.distance + 2))
          throw new Error("Not adjacent to compartment");

        comp.isSealed = false;

        // Reveal contents
        if (comp.contentSalvageId) {
          const salvage = state.table.looseSalvage.find(
            (s) => s.id === comp.contentSalvageId
          );
          if (salvage) {
            salvage.isFaceDown = false;
            // Salvage is now exposed but still attached to wreck (needs Cut)
          }
        }
        return state;
      }
    }
    throw new Error("Compartment not found");
  } else if (targetType === "ship") {
    // Breach rival ship's hold
    const shipResult = findShipById(state, targetId);
    if (!shipResult) throw new Error("Ship not found");
    if (shipResult.player.id === playerId) throw new Error("Cannot breach own ship");
    if (!isWithinRange(crewPos, shipResult.ship.position, RULES.adjacency.distance + RULES.ship.baseSize.z / 2))
      throw new Error("Not adjacent to ship");

    const hold = shipResult.ship.hold;
    if (hold.length === 0) return state; // fizzle

    // Draw random piece
    const rng = new RNG(state.meta.seed + `-breach-${crewId}-${state.meta.round}`);
    const idx = rng.nextInt(0, hold.length - 1);
    const spilled = hold.splice(idx, 1)[0];
    shipResult.ship.holdMass -= spilled.mass;

    // Place adjacent to rival ship as loose salvage
    spilled.position = { ...shipResult.ship.position };
    spilled.velocity = { direction: 0, magnitude: 0 };
    spilled.containerId = undefined;
    spilled.isAttached = false;
    spilled.isFaceDown = false;
    state.table.looseSalvage.push(spilled);

    // Update rival score
    shipResult.player.score = computePlayerScore(state, shipResult.player.id);

    return state;
  }

  throw new Error(`Unknown breach target type: ${targetType}`);
}

function resolveCrawl(
  state: GameState,
  _playerId: string,
  crewId: EntityId,
  dieValue: DieValue,
  params: Record<string, unknown>
): GameState {
  const result = findCrewById(state, crewId);
  if (!result) throw new Error(`Unknown crew: ${crewId}`);
  const { crew } = result;
  if (!crew.onTerrainId) throw new Error("Crew must be on terrain to crawl");

  const destination = params.destination as Vec2;
  const crewPos = getCrewPosition(crew);
  if (!crewPos) throw new Error("Crew is embarked");

  // Distance based on die value: 1-2=Short, 3-4=Medium, 5-6=Long
  let maxDist: number;
  if (dieValue <= 2) maxDist = RULES.velocity.short;
  else if (dieValue <= 4) maxDist = RULES.velocity.medium;
  else maxDist = RULES.velocity.long;

  const dist = distance(crewPos, destination);
  if (dist > maxDist) throw new Error("Destination too far for crawl");

  // Validate destination is on the same terrain piece
  if (!isPointOnTerrain(state, destination, crew.onTerrainId)) {
    throw new Error("Crawl destination must be on the same terrain piece");
  }

  // Move immediately (Crawl is the exception to "actions modify velocity")
  crew.position = { ...destination };
  // Velocity stays 0

  // Free action: pick up adjacent salvage if specified
  tryCarryPickup(state, crewId, params.pickupId as string | undefined);

  return state;
}

function resolvePushOff(
  state: GameState,
  _playerId: string,
  crewId: EntityId,
  params: Record<string, unknown>
): GameState {
  const result = findCrewById(state, crewId);
  if (!result) throw new Error(`Unknown crew: ${crewId}`);
  const { crew } = result;
  if (!crew.onTerrainId) throw new Error("Crew must be on terrain to push off");

  const direction = params.direction as number;

  // If on a moving ship's hull, inherit ship velocity
  const shipResult = findShipById(state, crew.onTerrainId);
  if (shipResult) {
    const shipVel = shipResult.ship.velocity;
    const pushVel = makeVelocity(direction, 1);
    crew.velocity = addVelocities(shipVel, pushVel);
  } else {
    crew.velocity = makeVelocity(direction, 1);
  }

  crew.onTerrainId = undefined;

  return state;
}

function resolveThrusterBurn(
  state: GameState,
  _playerId: string,
  crewId: EntityId,
  dieValue: DieValue,
  params: Record<string, unknown>
): GameState {
  const result = findCrewById(state, crewId);
  if (!result) throw new Error(`Unknown crew: ${crewId}`);
  const { crew } = result;

  const direction = params.direction as number;

  // 4=Short, 5=Medium, 6=Long
  let tier: SpeedTier;
  if (dieValue === 4) tier = 1;
  else if (dieValue === 5) tier = 2;
  else tier = 3; // 6

  const thrustVel = makeVelocity(direction, tier);
  crew.velocity = addVelocities(crew.velocity, thrustVel);

  return state;
}

function resolveHaul(
  state: GameState,
  _playerId: string,
  crewId: EntityId,
  isHeavy: boolean
): GameState {
  const result = findCrewById(state, crewId);
  if (!result) throw new Error(`Unknown crew: ${crewId}`);
  const { crew } = result;

  // Find tether the crew is on
  const tether = state.tethers.find(
    (t) =>
      t.endpointA.entityId === crewId || t.endpointB.entityId === crewId
  );
  if (!tether) throw new Error("Crew has no tether to haul along");

  // Check mass cap: find what's on the other end
  const otherEndpointId =
    tether.endpointA.entityId === crewId
      ? tether.endpointB.entityId
      : tether.endpointA.entityId;
  const otherMass = getTargetMass(state, otherEndpointId);
  if (otherMass >= 3 && !isHeavy) {
    throw new Error("Mass-3 salvage requires Heavy Haul (Hauler only)");
  }

  const otherPos = getTargetPosition(state, otherEndpointId);
  if (!otherPos) throw new Error("Tether endpoint has no position");

  const crewPos = getCrewPosition(crew);
  if (!crewPos) throw new Error("Crew is embarked");

  // Move crew along tether toward the other endpoint
  const tetherLengthInches =
    tether.length === "short"
      ? RULES.tethers.shortLength
      : tether.length === "medium"
      ? RULES.tethers.mediumLength
      : RULES.tethers.longLength;

  const dist = distance(crewPos, otherPos);
  const moveAmount = Math.min(dist, tetherLengthInches);

  const offset = scale(normalize(sub(otherPos, crewPos)), moveAmount);
  crew.position = add(crewPos, offset);

  return state;
}

function resolveRigTether(
  state: GameState,
  _playerId: string,
  crewId: EntityId,
  params: Record<string, unknown>
): GameState {
  const result = findCrewById(state, crewId);
  if (!result) throw new Error(`Unknown crew: ${crewId}`);
  const { crew } = result;
  const crewPos = getCrewPosition(crew);
  if (!crewPos) throw new Error("Crew is embarked");

  const endpointAId = params.endpointAId as string;
  const endpointBId = params.endpointBId as string;
  const tetherLength = (params.tetherLength as "short" | "medium" | "long") ?? "medium";

  if (endpointAId === crewId || endpointBId === crewId)
    throw new Error("Rig Tether endpoints cannot be the rigging crew");

  const posA = getTargetPosition(state, endpointAId);
  const posB = getTargetPosition(state, endpointBId);
  if (!posA || !posB) throw new Error("Endpoint has no position");

  // Both endpoints must be within 1" of crew
  if (!isWithinRange(crewPos, posA, RULES.adjacency.distance))
    throw new Error("Endpoint A not adjacent to crew");
  if (!isWithinRange(crewPos, posB, RULES.adjacency.distance))
    throw new Error("Endpoint B not adjacent to crew");

  // Endpoints must be within tether length of each other
  const maxLen =
    tetherLength === "short"
      ? RULES.tethers.shortLength
      : tetherLength === "medium"
      ? RULES.tethers.mediumLength
      : RULES.tethers.longLength;
  if (distance(posA, posB) > maxLen)
    throw new Error("Endpoints too far apart for tether length");

  state.tethers.push({
    id: `tether-${state.tethers.length}`,
    endpointA: { entityId: endpointAId },
    endpointB: { entityId: endpointBId },
    length: tetherLength,
    loadRating: RULES.tethers.defaultLoad,
    isShipGrade: false,
    state: "slack",
  });

  return state;
}

function resolveScavenge(
  state: GameState,
  _playerId: string,
  crewId: EntityId,
  params: Record<string, unknown>
): GameState {
  const result = findCrewById(state, crewId);
  if (!result) throw new Error(`Unknown crew: ${crewId}`);
  const { crew } = result;
  const crewPos = getCrewPosition(crew);
  if (!crewPos) throw new Error("Crew is embarked");

  const debrisId = params.debrisId as string;
  const debrisIdx = state.table.debris.findIndex((d) => d.id === debrisId);
  if (debrisIdx === -1) throw new Error("Debris not found");

  const debris = state.table.debris[debrisIdx];
  if (!isAdjacent(crewPos, debris.position))
    throw new Error("Debris not adjacent");

  // Check carry cap
  const currentCarryMass = crew.carrying.reduce((sum, s) => sum + s.mass, 0);
  const carryCap =
    crew.role === "Hauler"
      ? RULES.crew.haulerCarryCap
      : RULES.crew.standardCarryCap;
  if (currentCarryMass + 1 > carryCap)
    throw new Error("Carry capacity exceeded");

  // Pick up debris as scatter salvage
  const salvage: Salvage = {
    id: debris.id,
    type: "scatter",
    vp: RULES.salvage.scatter.vp,
    mass: RULES.salvage.scatter.mass,
    position: crewPos,
    isAttached: false,
    isFaceDown: false,
    velocity: { ...crew.velocity },
  };
  crew.carrying.push(salvage);
  state.table.debris.splice(debrisIdx, 1);

  return state;
}

function resolveBrace(
  state: GameState,
  _playerId: string,
  crewId: EntityId
): GameState {
  // Set a brace flag — we'll use pendingActions to track this
  state.pendingActions.push({
    id: `brace-${crewId}`,
    playerId: _playerId,
    unitId: crewId,
    slotId: "",
    dieId: "",
    actionType: "brace",
  });
  return state;
}

/** Check if a crew has an active brace. If so, consume it and return true (force is ignored). */
function consumeBrace(state: GameState, targetCrewId: EntityId): boolean {
  const braceIdx = state.pendingActions.findIndex(
    (a) => a.actionType === "brace" && a.unitId === targetCrewId
  );
  if (braceIdx !== -1) {
    state.pendingActions.splice(braceIdx, 1);
    return true; // force is absorbed
  }
  return false;
}

function resolveShove(
  state: GameState,
  _playerId: string,
  crewId: EntityId,
  _dieValue: DieValue,
  params: Record<string, unknown>
): GameState {
  const result = findCrewById(state, crewId);
  if (!result) throw new Error(`Unknown crew: ${crewId}`);
  const { crew } = result;
  const crewPos = getCrewPosition(crew);
  if (!crewPos) throw new Error("Crew is embarked");

  const targetId = params.targetId as string;
  const direction = params.direction as number;
  const targetPos = getTargetPosition(state, targetId);
  if (!targetPos) throw new Error("Target has no position");
  if (!isAdjacent(crewPos, targetPos)) throw new Error("Target not adjacent");

  // Check if target has an active brace
  if (consumeBrace(state, targetId)) return state; // force absorbed

  const targetMass = getTargetMass(state, targetId);

  // Mass-1=Long, Mass-2=Medium, Mass-3=Short
  let tier: SpeedTier;
  if (targetMass <= 1) tier = 3;
  else if (targetMass === 2) tier = 2;
  else tier = 1;

  const shoveVel = makeVelocity(direction, tier);
  applyVelocityToEntity(state, targetId, shoveVel);

  return state;
}

function resolveTackle(
  state: GameState,
  playerId: string,
  crewId: EntityId,
  _dieValue: DieValue,
  params: Record<string, unknown>
): GameState {
  const result = findCrewById(state, crewId);
  if (!result) throw new Error(`Unknown crew: ${crewId}`);
  const { crew } = result;
  const crewPos = getCrewPosition(crew);
  if (!crewPos) throw new Error("Crew is embarked");

  const targetId = params.targetId as string;
  const stayAnchored = params.stayAnchored as boolean | undefined;

  const targetResult = findCrewById(state, targetId);
  if (!targetResult) throw new Error("Target crew not found");
  const { crew: targetCrew, player: targetPlayer } = targetResult;
  if (targetPlayer.id === playerId) throw new Error("Cannot tackle own crew");

  // Check if target has an active brace
  if (consumeBrace(state, targetId)) return state; // force absorbed

  const targetPos = getCrewPosition(targetCrew);
  if (!targetPos) throw new Error("Target is embarked");
  if (!isAdjacent(crewPos, targetPos)) throw new Error("Target not adjacent");

  // Tackle succeeds (resist would have been handled before this)
  // Rival drops carried salvage
  for (const carried of targetCrew.carrying) {
    carried.position = { ...targetPos };
    carried.velocity = { direction: 0, magnitude: 0 };
    state.table.looseSalvage.push(carried);
  }
  targetCrew.carrying = [];

  // Both become grappled
  crew.state = "grappled";
  crew.grappledWithId = targetId;
  targetCrew.state = "grappled";
  targetCrew.grappledWithId = crewId;

  if (crew.onTerrainId && stayAnchored) {
    // Stay anchored: rival held adjacent, neither drifts
    targetCrew.position = { ...crewPos };
    targetCrew.velocity = { direction: 0, magnitude: 0 };
    targetCrew.onTerrainId = crew.onTerrainId;
  } else {
    // Both drift with vector sum
    const combined = addVelocities(crew.velocity, targetCrew.velocity);
    crew.velocity = { ...combined };
    targetCrew.velocity = { ...combined };
    crew.onTerrainId = undefined;
    targetCrew.onTerrainId = undefined;
  }

  return state;
}

function resolveEmbark(
  state: GameState,
  playerId: string,
  crewId: EntityId
): GameState {
  const result = findCrewById(state, crewId);
  if (!result) throw new Error(`Unknown crew: ${crewId}`);
  const { crew } = result;

  // Must be on own ship's hull
  const player = state.players[playerId];
  if (crew.onTerrainId !== player.ship.id)
    throw new Error("Crew must be on own ship hull to embark");

  crew.position = "embarked";
  crew.velocity = { direction: 0, magnitude: 0 };
  crew.onTerrainId = undefined;

  // Drop any carried salvage
  for (const carried of crew.carrying) {
    carried.position = { ...player.ship.position };
    carried.velocity = { direction: 0, magnitude: 0 };
    state.table.looseSalvage.push(carried);
  }
  crew.carrying = [];

  // Forfeit remaining dice in this crew's pool
  for (const dieId of crew.dicePool) {
    const die = player.dice.find((d) => d.id === dieId);
    if (die && die.state === "assigned") {
      die.state = "forfeit";
    }
  }
  crew.dicePool = [];

  return state;
}

// ── RESIST ──────────────────────────────────────────────────

export function reduceResist(
  state: GameState,
  targetCrewId: EntityId,
  resistDieId: string,
  _sourceActionDieValue: DieValue
): GameState {
  const next = cloneState(state);

  const result = findCrewById(next, targetCrewId);
  if (!result) throw new Error("Target crew not found");
  const { crew, player } = result;

  // Find the resist die
  const resistDie = player.dice.find((d) => d.id === resistDieId);
  if (!resistDie) throw new Error("Resist die not found");
  if (resistDie.state !== "assigned") throw new Error("Resist die not assigned");

  // Spend the resist die regardless of outcome
  resistDie.state = "spent";
  // Remove from crew's dice pool
  crew.dicePool = crew.dicePool.filter((id) => id !== resistDieId);

  // Resist succeeds if resist value > attacker value (ties go to attacker)
  // The caller checks the return state to determine if the action proceeds
  // We return whether resist succeeded via the resist die still having assigned state or not
  // (it's already spent above; caller compares die values directly)
  return next;
}

// ── Scoring ─────────────────────────────────────────────────

export function computePlayerScore(state: GameState, playerId: string): number {
  const player = state.players[playerId];
  let vp = 0;
  for (const piece of player.ship.hold) {
    vp += piece.vp;
  }
  const lostCount = Object.values(player.crews).filter(
    (c) => c.state === "lost"
  ).length;
  vp += lostCount * RULES.scoring.lostCrewPenalty;
  return vp;
}

// ── Entity lookup helpers ───────────────────────────────────

function getTargetPosition(state: GameState, entityId: EntityId): Vec2 | null {
  // Check ships
  for (const player of Object.values(state.players)) {
    if (player.ship.id === entityId) return player.ship.position;
  }
  // Check crew
  for (const player of Object.values(state.players)) {
    for (const crew of Object.values(player.crews)) {
      if (crew.id === entityId) return getCrewPosition(crew);
    }
  }
  // Check loose salvage
  for (const salvage of state.table.looseSalvage) {
    if (salvage.id === entityId && typeof salvage.position === "object")
      return salvage.position as Vec2;
  }
  // Check debris
  for (const debris of state.table.debris) {
    if (debris.id === entityId) return debris.position;
  }
  // Check wrecks
  for (const wreck of state.table.wrecks) {
    if (wreck.id === entityId) return wreck.position;
  }
  // Check asteroids
  for (const asteroid of state.table.asteroids) {
    if (asteroid.id === entityId) return asteroid.position;
  }
  return null;
}

function getTargetMass(state: GameState, entityId: EntityId): number {
  for (const player of Object.values(state.players)) {
    if (player.ship.id === entityId) return 5;
    for (const crew of Object.values(player.crews)) {
      if (crew.id === entityId) return RULES.crew.mass;
    }
  }
  for (const salvage of state.table.looseSalvage) {
    if (salvage.id === entityId) return salvage.mass;
  }
  for (const debris of state.table.debris) {
    if (debris.id === entityId) return 1;
  }
  return 0;
}

/**
 * Self-tether: free action. Crew clips a tether from their harness to an adjacent entity
 * (terrain, salvage, ship anchor, or another crew). Crew must have a free harness anchor
 * (max 1 tether). Called explicitly or triggered on auto-land.
 */
export function resolveSelfTether(
  state: GameState,
  crewId: EntityId,
  targetId: EntityId,
  tetherLength: "short" | "medium" | "long" = "short"
): GameState {
  const result = findCrewById(state, crewId);
  if (!result) throw new Error(`Unknown crew: ${crewId}`);
  const { crew } = result;

  // Crew can only have 1 harness tether
  const existingTether = state.tethers.find(
    (t) => t.endpointA.entityId === crewId || t.endpointB.entityId === crewId
  );
  if (existingTether) throw new Error("Crew harness already in use");

  const crewPos = getCrewPosition(crew);
  if (!crewPos) throw new Error("Crew is embarked");

  const targetPos = getTargetPosition(state, targetId);
  if (!targetPos) throw new Error("Target has no position");

  // Must be adjacent
  if (!isAdjacent(crewPos, targetPos)) throw new Error("Target not adjacent for self-tether");

  // Create tether
  state.tethers.push({
    id: `self-tether-${crewId}-${state.tethers.length}`,
    endpointA: { entityId: crewId },
    endpointB: { entityId: targetId },
    length: tetherLength,
    loadRating: crew.role === "Hauler" ? RULES.tethers.haulerHarnessLoad : RULES.tethers.defaultLoad,
    isShipGrade: false,
    state: "slack",
  });

  crew.tetherIds.push(state.tethers[state.tethers.length - 1].id);

  return state;
}

function isPointOnTerrain(state: GameState, point: Vec2, terrainId: EntityId): boolean {
  // Check wrecks — point must be within wreck bounds + walkable margin
  for (const wreck of state.table.wrecks) {
    if (wreck.id === terrainId) {
      // Check if point is within wreck bounds (generous margin for walkable surface)
      const maxBound = Math.max(
        ...wreck.shape.bounds.map((b) =>
          distance({ x: 0, z: 0 }, b)
        )
      );
      return distance(point, wreck.position) <= maxBound + 1;
    }
  }
  // Check asteroids
  for (const asteroid of state.table.asteroids) {
    if (asteroid.id === terrainId) {
      const maxBound = Math.max(
        ...asteroid.bounds.map((b) =>
          distance({ x: 0, z: 0 }, b)
        )
      );
      return distance(point, asteroid.position) <= maxBound + 1;
    }
  }
  // Check ships
  for (const player of Object.values(state.players)) {
    if (player.ship.id === terrainId) {
      const hw = RULES.ship.baseSize.x / 2 + 0.5;
      const hd = RULES.ship.baseSize.z / 2 + 0.5;
      const rel = sub(point, player.ship.position);
      return Math.abs(rel.x) <= hw && Math.abs(rel.z) <= hd;
    }
  }
  return false;
}

/**
 * Free action: crew picks up an adjacent salvage piece during a movement action.
 * Subject to carry caps. Only loose, unattached salvage with position on the table.
 * Called with an explicit pickupId from params, or skipped if not present.
 */
function tryCarryPickup(
  state: GameState,
  crewId: EntityId,
  pickupId?: string
): void {
  if (!pickupId) return;

  const result = findCrewById(state, crewId);
  if (!result) return;
  const { crew } = result;
  const crewPos = getCrewPosition(crew);
  if (!crewPos) return;

  const salvageIdx = state.table.looseSalvage.findIndex(
    (s) => s.id === pickupId && typeof s.position === "object" && !s.isAttached
  );
  if (salvageIdx === -1) return;

  const salvage = state.table.looseSalvage[salvageIdx];
  if (!isAdjacent(crewPos, salvage.position as Vec2)) return;

  // Check carry cap
  const currentCarryMass = crew.carrying.reduce((sum, s) => sum + s.mass, 0);
  const maxCarryMass = crew.role === "Hauler" ? RULES.crew.haulerCarryCap : RULES.crew.standardCarryCap;
  if (currentCarryMass + salvage.mass > maxCarryMass) return;

  // Mass-3 cannot be carried by anyone
  if (salvage.mass >= 3) return;

  // Regular crew can only carry Mass-1
  if (crew.role !== "Hauler" && salvage.mass > 1) return;

  // Pick up
  salvage.position = crewPos;
  salvage.velocity = { ...crew.velocity };
  crew.carrying.push(salvage);
  state.table.looseSalvage.splice(salvageIdx, 1);
}

function applyVelocityToEntity(
  state: GameState,
  entityId: EntityId,
  velocity: Velocity
): void {
  // Crew
  for (const player of Object.values(state.players)) {
    for (const crew of Object.values(player.crews)) {
      if (crew.id === entityId) {
        crew.velocity = addVelocities(crew.velocity, velocity);
        return;
      }
    }
  }
  // Salvage
  for (const salvage of state.table.looseSalvage) {
    if (salvage.id === entityId) {
      salvage.velocity = addVelocities(salvage.velocity, velocity);
      return;
    }
  }
  // Debris
  for (const debris of state.table.debris) {
    if (debris.id === entityId) {
      debris.velocity = addVelocities(debris.velocity, velocity);
      return;
    }
  }
}
