/**
 * Headless game simulation runner.
 * Runs full AI vs AI games without any UI/DOM for batch testing and telemetry.
 *
 * Usage (from code):
 *   import { runSimulation, runBatchSimulation } from './sim/headless';
 *   const result = runSimulation({ seed: 'test', playerCount: 4, personalities: [...] });
 *   const batch = runBatchSimulation({ games: 100, ... });
 */

import type { GameState, Action } from "../engine/types";
import { reduce } from "../engine/state";
import { setupGame } from "../engine/setup";
import type { AIPlayer } from "../ai/base";
import { AggressiveAI } from "../ai/aggressive";
import { CautiousAI } from "../ai/cautious";
import { OpportunisticAI } from "../ai/opportunistic";
import { TelemetryLogger } from "../telemetry/logger";
import type { GameSummary } from "../telemetry/logger";

export interface SimConfig {
  seed: string;
  playerCount: number;
  personalities: Array<"aggressive" | "cautious" | "opportunistic">;
  maxTurns?: number; // safety cap
}

export interface SimResult {
  summary: GameSummary;
  finalState: GameState;
  actions: Action[];
  durationMs: number;
}

export interface BatchConfig {
  games: number;
  playerCount: number;
  personalities: Array<"aggressive" | "cautious" | "opportunistic">;
  baseSeed?: string;
}

export interface BatchResult {
  results: SimResult[];
  winCounts: Record<string, number>;
  avgScores: Record<string, number>;
  personalityWinRates: Record<string, number>;
  totalDurationMs: number;
}

function createAI(personality: "aggressive" | "cautious" | "opportunistic"): AIPlayer {
  switch (personality) {
    case "aggressive": return new AggressiveAI();
    case "cautious": return new CautiousAI();
    case "opportunistic": return new OpportunisticAI();
  }
}

export function runSimulation(config: SimConfig): SimResult {
  const start = Date.now();
  const logger = new TelemetryLogger();
  const actions: Action[] = [];
  const maxTurns = config.maxTurns ?? 500;

  // Setup
  const playerNames = config.personalities.map((p, i) => `${p}-${i}`);
  let state = setupGame(
    config.seed,
    config.playerCount,
    playerNames,
    config.personalities.map((p) => ({ isAI: true, personality: p }))
  );

  const ais: Record<string, AIPlayer> = {};
  const playerIds = Object.keys(state.players);
  for (let i = 0; i < playerIds.length; i++) {
    ais[playerIds[i]] = createAI(config.personalities[i]);
  }

  let turnCount = 0;

  // Game loop
  while (state.meta.phase !== "gameover" && turnCount < maxTurns) {
    turnCount++;

    try {
      switch (state.meta.phase) {
        case "roll":
          state = runRollPhase(state, ais, actions, logger);
          break;
        case "assign":
          state = runAssignPhase(state, ais, actions, logger);
          break;
        case "reveal":
          state = advancePhase(state, actions, logger);
          break;
        case "resolve":
          state = runResolvePhase(state, ais, actions, logger);
          break;
        case "drift":
          state = runDriftPhase(state, actions, logger);
          break;
        case "scoring":
          state = endGame(state, actions, logger);
          break;
      }
    } catch (e) {
      console.error(`Sim error at turn ${turnCount}:`, e);
      break;
    }
  }

  // Force end if stuck
  if (state.meta.phase !== "gameover") {
    const action: Action = { type: "END_GAME" };
    const next = reduce(state, action);
    logger.logEvent(state, next, action);
    actions.push(action);
    state = next;
  }

  return {
    summary: logger.generateSummary(state),
    finalState: state,
    actions,
    durationMs: Date.now() - start,
  };
}

function runRollPhase(
  state: GameState,
  ais: Record<string, AIPlayer>,
  actions: Action[],
  logger: TelemetryLogger
): GameState {
  // Roll for all players
  for (const pid of Object.keys(state.players)) {
    if (state.players[pid].dice.length === 0) {
      const action: Action = { type: "ROLL_DICE", playerId: pid };
      const next = reduce(state, action);
      logger.logEvent(state, next, action);
      actions.push(action);
      state = next;
    }
  }

  // Reroll decisions
  for (const pid of Object.keys(state.players)) {
    const rerollIds = ais[pid].decideRerolls(state, pid);
    if (rerollIds.length > 0) {
      const action: Action = { type: "REROLL", playerId: pid, dieIds: rerollIds };
      const next = reduce(state, action);
      logger.logEvent(state, next, action);
      actions.push(action);
      state = next;
    }
  }

  // Advance to assign
  return advancePhase(state, actions, logger);
}

function runAssignPhase(
  state: GameState,
  ais: Record<string, AIPlayer>,
  actions: Action[],
  logger: TelemetryLogger
): GameState {
  // Each AI assigns dice
  for (const pid of Object.keys(state.players)) {
    const assignments = ais[pid].decideAssignments(JSON.parse(JSON.stringify(state)), pid);
    for (const assignment of assignments) {
      try {
        const action: Action = {
          type: "ASSIGN_DIE",
          playerId: pid,
          dieId: assignment.dieId,
          unitId: assignment.unitId,
        };
        const next = reduce(state, action);
        logger.logEvent(state, next, action);
        actions.push(action);
        state = next;
      } catch {
        // Skip invalid assignments
      }
    }
  }

  // Reveal
  const revealAction: Action = { type: "REVEAL_ASSIGNMENTS" };
  const next = reduce(state, revealAction);
  logger.logEvent(state, next, revealAction);
  actions.push(revealAction);
  state = next;

  // Advance to resolve
  return advancePhase(state, actions, logger);
}

function runResolvePhase(
  state: GameState,
  ais: Record<string, AIPlayer>,
  actions: Action[],
  logger: TelemetryLogger
): GameState {
  let safetyCount = 0;

  while (safetyCount < 50) {
    safetyCount++;
    const pid = state.meta.activePlayerId;
    const player = state.players[pid];

    // Find any assigned dice
    const assignedDie = player.dice.find((d) => d.state === "assigned");
    if (!assignedDie || assignedDie.assignedTo === undefined) {
      // No dice for this player — check if anyone else has dice
      let anyoneHasDice = false;
      for (const p of Object.values(state.players)) {
        if (p.dice.some((d) => d.state === "assigned")) {
          anyoneHasDice = true;
          break;
        }
      }
      if (!anyoneHasDice) break;

      // Advance to next player (cycle turn order)
      // Just forfeit remaining and break
      break;
    }

    // AI decides action
    const decision = ais[pid].decideAction(
      state,
      pid,
      assignedDie.assignedTo!,
      assignedDie.id,
      assignedDie.value
    );

    try {
      const action: Action = {
        type: "RESOLVE_DIE",
        playerId: pid,
        unitId: assignedDie.assignedTo!,
        dieId: assignedDie.id,
        actionType: decision.actionType,
        parameters: { ...decision.parameters },
      };
      const next = reduce(state, action);
      logger.logEvent(state, next, action);
      actions.push(action);
      state = next;
    } catch {
      // Action failed — mark die as spent manually
      assignedDie.state = "spent";
      removeDieFromPool(state, pid, assignedDie.id);
    }
  }

  // Advance to drift
  return advancePhase(state, actions, logger);
}

function runDriftPhase(
  state: GameState,
  actions: Action[],
  logger: TelemetryLogger
): GameState {
  const driftAction: Action = { type: "RUN_DRIFT" };
  const next = reduce(state, driftAction);
  logger.logEvent(state, next, driftAction);
  actions.push(driftAction);
  state = next;

  // Advance to next round or scoring
  return advancePhase(state, actions, logger);
}

function endGame(
  state: GameState,
  actions: Action[],
  logger: TelemetryLogger
): GameState {
  const action: Action = { type: "END_GAME" };
  const next = reduce(state, action);
  logger.logEvent(state, next, action);
  actions.push(action);
  return next;
}

function advancePhase(
  state: GameState,
  actions: Action[],
  logger: TelemetryLogger
): GameState {
  const action: Action = { type: "ADVANCE_PHASE" };
  try {
    const next = reduce(state, action);
    logger.logEvent(state, next, action);
    actions.push(action);
    return next;
  } catch {
    return state;
  }
}

function removeDieFromPool(state: GameState, playerId: string, dieId: string) {
  const player = state.players[playerId];
  player.ship.dicePool = player.ship.dicePool.filter((id) => id !== dieId);
  for (const crew of Object.values(player.crews)) {
    crew.dicePool = crew.dicePool.filter((id) => id !== dieId);
  }
}

// ── Batch simulation ────────────────────────────────────────

export function runBatchSimulation(config: BatchConfig): BatchResult {
  const start = Date.now();
  const results: SimResult[] = [];
  const winCounts: Record<string, number> = {};
  const totalScores: Record<string, number> = {};
  const personalityWins: Record<string, number> = {};
  const personalityGames: Record<string, number> = {};

  for (let i = 0; i < config.games; i++) {
    const seed = `${config.baseSeed ?? "batch"}-${i}`;
    const result = runSimulation({
      seed,
      playerCount: config.playerCount,
      personalities: config.personalities,
    });
    results.push(result);

    // Track wins and scores
    const scores = result.summary.finalScores;
    const entries = Object.entries(scores);
    entries.sort((a, b) => b[1] - a[1]);
    const winnerId = entries[0][0];

    winCounts[winnerId] = (winCounts[winnerId] ?? 0) + 1;
    const winnerPersonality = result.summary.personalities[winnerId];
    personalityWins[winnerPersonality] = (personalityWins[winnerPersonality] ?? 0) + 1;

    for (const [pid, score] of entries) {
      totalScores[pid] = (totalScores[pid] ?? 0) + score;
      const p = result.summary.personalities[pid];
      personalityGames[p] = (personalityGames[p] ?? 0) + 1;
    }
  }

  const avgScores: Record<string, number> = {};
  for (const [pid, total] of Object.entries(totalScores)) {
    avgScores[pid] = total / config.games;
  }

  const personalityWinRates: Record<string, number> = {};
  for (const [p, wins] of Object.entries(personalityWins)) {
    personalityWinRates[p] = wins / (personalityGames[p] ?? 1);
  }

  return {
    results,
    winCounts,
    avgScores,
    personalityWinRates,
    totalDurationMs: Date.now() - start,
  };
}
