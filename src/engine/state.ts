import type { GameState, Action, Die, Player, DieValue } from "./types";
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
      phase: "roll",
      activePlayerId: playerIds[0],
      turnOrder: [...playerIds],
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
