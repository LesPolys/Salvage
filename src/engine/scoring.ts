import type { GameState } from "./types";
import { RULES } from "../config/rules";

/**
 * Mark crew as Lost at end of game if they are:
 * - Not embarked
 * - Not on terrain (wreck, asteroid, ship hull)
 * - Not tethered to anything
 * This runs after the final drift phase, before scoring.
 */
export function markEndOfGameLostCrew(state: GameState): GameState {
  for (const player of Object.values(state.players)) {
    for (const crew of Object.values(player.crews)) {
      if (crew.state === "lost") continue;
      if (crew.position === "embarked") continue;

      // On terrain = safe
      if (crew.onTerrainId) continue;

      // Tethered = safe
      const isTethered = state.tethers.some(
        (t) =>
          t.endpointA.entityId === crew.id ||
          t.endpointB.entityId === crew.id
      );
      if (isTethered) continue;

      // Floating in space untethered, off terrain — Lost
      crew.state = "lost";
    }
  }
  return state;
}

export function computeFinalScores(state: GameState): Record<string, number> {
  // First mark stranded crew as lost
  markEndOfGameLostCrew(state);

  const scores: Record<string, number> = {};
  for (const player of Object.values(state.players)) {
    scores[player.id] = computePlayerFinalScore(state, player.id);
  }
  return scores;
}

export function computePlayerFinalScore(state: GameState, playerId: string): number {
  const player = state.players[playerId];
  let vp = 0;

  // VP from stowed salvage
  for (const piece of player.ship.hold) {
    vp += piece.vp;
  }

  // Penalty for lost crew
  const lostCount = Object.values(player.crews).filter(
    (c) => c.state === "lost"
  ).length;
  vp += lostCount * RULES.scoring.lostCrewPenalty;

  return vp;
}

export function determineWinner(
  scores: Record<string, number>,
  state: GameState
): { winnerId: string; tied: boolean } {
  const entries = Object.entries(scores);
  entries.sort((a, b) => b[1] - a[1]);

  const topScore = entries[0][1];
  const tiedPlayers = entries.filter(([_, s]) => s === topScore);

  if (tiedPlayers.length === 1) {
    return { winnerId: tiedPlayers[0][0], tied: false };
  }

  // Tiebreaker: most salvage pieces stowed
  let bestId = tiedPlayers[0][0];
  let bestCount = state.players[bestId].ship.hold.length;

  for (const [pid] of tiedPlayers.slice(1)) {
    const count = state.players[pid].ship.hold.length;
    if (count > bestCount) {
      bestCount = count;
      bestId = pid;
    }
  }

  return { winnerId: bestId, tied: tiedPlayers.length > 1 };
}
