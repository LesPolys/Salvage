import type { GameState, Action, Die, Player, DieValue, Vec2 } from "./types";
import { ZERO_VELOCITY } from "./types";
import { RNG } from "./rng";
import { RULES } from "../config/rules";
import {
  reduceAssignDie,
  reduceUnassignDie,
  reduceRevealAssignments,
  reduceAdvancePhase,
  reduceActivateUnit,
  reduceResolveDie,
  reduceResist,
  cloneState,
} from "./actions";
import { runDriftPhase } from "./drift";
import { computeFinalScores } from "./scoring";

/** Create a fresh die with a rolled value */
function makeDie(id: string, value: DieValue): Die {
  return { id, value, state: "rolled" };
}

/**
 * Pure, deterministic reducer.
 * Given a state and an action, returns a new state. Throws on invalid action.
 */
export function reduce(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "PLACE_SHIP":
      return reducePlaceShip(state, action.playerId, action.position);

    case "ROLL_DICE":
      return reduceRollDice(state, action.playerId);

    case "REROLL":
      return reduceReroll(state, action.playerId, action.dieIds);

    case "ASSIGN_DIE":
      return reduceAssignDie(
        state,
        action.playerId,
        action.dieId,
        action.unitId
      );

    case "UNASSIGN_DIE":
      return reduceUnassignDie(state, action.playerId, action.dieId);

    case "REVEAL_ASSIGNMENTS":
      return reduceRevealAssignments(state);

    case "ACTIVATE_UNIT":
      return reduceActivateUnit(state, action.playerId, action.unitId);

    case "RESOLVE_DIE":
      return reduceResolveDie(
        state,
        action.playerId,
        action.unitId,
        action.dieId,
        action.actionType,
        action.parameters
      );

    case "RESIST":
      // Find the source action's die value for comparison
      return reduceResist(
        state,
        action.targetCrewId,
        action.resistDieId,
        1 as DieValue // placeholder — caller should pass actual value
      );

    case "ADVANCE_PHASE":
      return reduceAdvancePhase(state);

    case "RUN_DRIFT": {
      if (state.meta.phase !== "drift")
        throw new Error(`Cannot run drift in phase: ${state.meta.phase}`);
      const next = cloneState(state);
      return runDriftPhase(next);
    }

    case "END_GAME": {
      const next = cloneState(state);
      const scores = computeFinalScores(next);
      for (const [pid, score] of Object.entries(scores)) {
        next.players[pid].score = score;
      }
      next.meta.phase = "gameover";
      return next;
    }

    default: {
      const _exhaustive: never = action;
      throw new Error(`Unknown action type: ${(_exhaustive as Action).type}`);
    }
  }
}

import type { TableEdge } from "./types";

const OPPOSITE_EDGE: Record<TableEdge, TableEdge> = {
  top: "bottom", bottom: "top", left: "right", right: "left",
};

const EDGE_FACING: Record<TableEdge, number> = {
  top: -Math.PI / 2,    // face south (inward)
  bottom: Math.PI / 2,  // face north (inward)
  left: 0,              // face east (inward)
  right: Math.PI,       // face west (inward)
};

function detectEdge(position: Vec2, halfTable: number, edgeBuf: number): TableEdge | null {
  if (position.z >= halfTable - edgeBuf) return "top";
  if (position.z <= -halfTable + edgeBuf) return "bottom";
  if (position.x >= halfTable - edgeBuf) return "right";
  if (position.x <= -halfTable + edgeBuf) return "left";
  return null;
}

function reducePlaceShip(state: GameState, playerId: string, position: Vec2): GameState {
  if (state.meta.phase !== "deploy")
    throw new Error(`Cannot place ship in phase: ${state.meta.phase}`);
  if (state.meta.activePlayerId !== playerId)
    throw new Error(`Not ${playerId}'s turn to place`);

  const next = cloneState(state);
  const player = next.players[playerId];
  if (!player) throw new Error(`Unknown player: ${playerId}`);
  if (player.ship.placed) throw new Error("Ship already placed");

  const halfTable = RULES.table.sizeInches / 2;
  const edgeBuf = RULES.table.shipEdgeBuffer;

  // Validate: on the table
  if (Math.abs(position.x) > halfTable || Math.abs(position.z) > halfTable)
    throw new Error("Ship must be on the table");

  // Detect which edge
  const edge = detectEdge(position, halfTable, edgeBuf);
  if (!edge) throw new Error("Ship must be placed within 2\" of a table edge");

  // Enforce opposite-edge rule: if any ship is already placed, this player
  // must use the opposite edge of the first-placed ship
  const placedShips = Object.values(next.players)
    .filter((p) => p.ship.placed && p.ship.deployEdge);
  if (placedShips.length > 0) {
    const firstEdge = placedShips[0].ship.deployEdge!;
    const allowedEdge = OPPOSITE_EDGE[firstEdge];
    if (edge !== firstEdge && edge !== allowedEdge) {
      throw new Error(`Must place on ${firstEdge} or ${allowedEdge} edge (opposite sides)`);
    }
    // If first player took an edge, opponent must take opposite
    if (placedShips.some((p) => p.ship.deployEdge === edge && p.id !== playerId)) {
      // Same edge is ok for teammates in 3-4p, but opponent must be opposite
      // For simplicity: just enforce that you can't be on the same edge as anyone else
      // unless it's a teammate (not tracked yet). Allow same edge for now.
    }
  }

  // Validate: ≥6" from any other placed ship
  // Validate: ≥6" from any other placed ship
  for (const p of Object.values(next.players)) {
    if (p.id === playerId) continue;
    if (!p.ship.placed) continue;
    const dx = p.ship.position.x - position.x;
    const dz = p.ship.position.z - position.z;
    if (Math.sqrt(dx * dx + dz * dz) < RULES.table.minShipSpacing)
      throw new Error("Too close to another ship (min 6\" apart)");
  }

  // Validate: not colliding with wrecks or asteroids
  const shipRadius = Math.max(RULES.ship.baseSize.x, RULES.ship.baseSize.z) / 2 + 0.5;
  for (const wreck of next.table.wrecks) {
    const dx = wreck.position.x - position.x;
    const dz = wreck.position.z - position.z;
    if (Math.sqrt(dx * dx + dz * dz) < shipRadius + 4) // wreck radius ~4
      throw new Error("Cannot place ship on top of a wreck");
  }
  for (const asteroid of next.table.asteroids) {
    const dx = asteroid.position.x - position.x;
    const dz = asteroid.position.z - position.z;
    if (Math.sqrt(dx * dx + dz * dz) < shipRadius + 3)
      throw new Error("Cannot place ship on top of an asteroid");
  }

  player.ship.position = { ...position };
  player.ship.velocity = { direction: 0, magnitude: 0 };
  player.ship.facing = EDGE_FACING[edge];
  player.ship.deployEdge = edge;
  player.ship.placed = true;

  // Advance to next player who hasn't placed, or finish deploy
  const turnOrder = next.meta.turnOrder;
  const allPlaced = turnOrder.every((pid) => next.players[pid].ship.placed);

  if (allPlaced) {
    const normalOrder = Object.keys(next.players);
    next.meta.turnOrder = normalOrder;
    next.meta.activePlayerId = normalOrder[0];
    next.meta.phase = "roll";
  } else {
    const currentIdx = turnOrder.indexOf(playerId);
    for (let i = 1; i <= turnOrder.length; i++) {
      const nextIdx = (currentIdx + i) % turnOrder.length;
      const nextPid = turnOrder[nextIdx];
      if (!next.players[nextPid].ship.placed) {
        next.meta.activePlayerId = nextPid;
        break;
      }
    }
  }

  return next;
}

function reduceRollDice(state: GameState, playerId: string): GameState {
  const player = state.players[playerId];
  if (!player) throw new Error(`Unknown player: ${playerId}`);
  if (state.meta.phase !== "roll") throw new Error(`Cannot roll dice in phase: ${state.meta.phase}`);

  const next = cloneState(state);
  const rng = new RNG(state.meta.seed + `-r${state.meta.round}-${playerId}`);

  const values = rng.rollDice(RULES.rounds.diceCount);
  const dice: Die[] = values.map((v, i) => makeDie(`${playerId}-d${i}`, v));

  const nextPlayer = next.players[playerId];
  nextPlayer.dice = dice;
  nextPlayer.rerollsRemaining = RULES.dice.rerollFormula(state.meta.round);

  return next;
}

function reduceReroll(
  state: GameState,
  playerId: string,
  dieIds: string[]
): GameState {
  const player = state.players[playerId];
  if (!player) throw new Error(`Unknown player: ${playerId}`);
  if (state.meta.phase !== "roll") throw new Error(`Cannot reroll in phase: ${state.meta.phase}`);
  if (dieIds.length > player.rerollsRemaining) {
    throw new Error(
      `Cannot reroll ${dieIds.length} dice; only ${player.rerollsRemaining} rerolls remaining`
    );
  }

  const next = cloneState(state);
  const nextPlayer = next.players[playerId];

  for (const dieId of dieIds) {
    const die = nextPlayer.dice.find((d) => d.id === dieId);
    if (!die) throw new Error(`Unknown die: ${dieId}`);
    if (die.state !== "rolled") throw new Error(`Die ${dieId} is not in rolled state`);
  }

  const rng = new RNG(
    state.meta.seed + `-r${state.meta.round}-${playerId}-reroll`
  );

  for (const dieId of dieIds) {
    const die = nextPlayer.dice.find((d) => d.id === dieId)!;
    die.value = rng.rollD6();
  }

  nextPlayer.rerollsRemaining = 0;

  return next;
}

/** Create a minimal initial game state (for testing / setup) */
export function createInitialState(seed: string, playerCount: number): GameState {
  const playerIds = Array.from({ length: playerCount }, (_, i) => `player-${i}`);
  const colors = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12"];

  const players: Record<string, Player> = {};
  for (let i = 0; i < playerCount; i++) {
    const pid = playerIds[i];
    players[pid] = {
      id: pid,
      name: `Player ${i + 1}`,
      isAI: false,
      color: colors[i],
      ship: {
        id: `ship-${pid}`,
        ownerId: pid,
        position: { x: 0, z: 0 },
        facing: 0,
        velocity: { ...ZERO_VELOCITY },
        hold: [],
        holdMass: 0,
        hullAnchors: Array.from({ length: RULES.ship.hullAnchors }, (_, j) => ({
          id: `anchor-${pid}-${j}`,
          positionOffset: { x: 0, z: 0 },
          inUse: false,
        })),
        slots: [
          { id: "burn-small", dieRequirement: "3+" },
          { id: "burn-big", dieRequirement: "5+" },
          { id: "burn-max", dieRequirement: "6" },
          { id: "launch", dieRequirement: "any" },
          { id: "recall", dieRequirement: "any" },
          { id: "stow", dieRequirement: "any" },
          { id: "scan", dieRequirement: "1+" },
        ],
        dicePool: [],
        placed: false,
      },
      crews: Object.fromEntries(
        RULES.crew.roles.map((role) => [
          role,
          {
            id: `crew-${pid}-${role}`,
            ownerId: pid,
            role,
            position: "embarked" as const,
            velocity: { ...ZERO_VELOCITY },
            carrying: [],
            state: "active" as const,
            tetherIds: [],
            slots: [
              {
                id: `${role.toLowerCase()}-locked`,
                isRoleLocked: true,
                dieRequirement: getRoleLockedRequirement(role),
              },
              {
                id: `${role.toLowerCase()}-generic`,
                isRoleLocked: false,
                dieRequirement: "any" as const,
              },
            ],
            dicePool: [],
            onTerrainId: undefined,
          },
        ])
      ),
      dice: [],
      rerollsRemaining: 0,
      score: 0,
    };
  }

  return {
    meta: {
      seed,
      round: 1,
      phase: "deploy",
      activePlayerId: playerIds[playerIds.length - 1], // reverse turn order: last player first
      turnOrder: [...playerIds].reverse(), // reverse for deployment
    },
    players,
    table: {
      wrecks: [],
      asteroids: [],
      looseSalvage: [],
      debris: [],
    },
    tethers: [],
    pendingActions: [],
    velocityMap: {},
    history: [],
  };
}

function getRoleLockedRequirement(
  role: string
): "any" | "1+" | "2+" | "3+" | "4+" | "5+" | "6" {
  switch (role) {
    case "Cutter":
      return "3+";
    case "Grappler":
      return "3+";
    case "Breacher":
      return "5+";
    case "Hauler":
      return "any";
    default:
      return "any";
  }
}
