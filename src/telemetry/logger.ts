import type { GameState, Phase, Action } from "../engine/types";

export interface TelemetryEvent {
  timestamp: number;
  gameSeed: string;
  round: number;
  phase: Phase;
  eventType:
    | "dice-rolled"
    | "rerolled"
    | "assigned"
    | "revealed"
    | "activated"
    | "action-resolved"
    | "resisted"
    | "drift-resolved"
    | "salvage-stowed"
    | "crew-lost"
    | "scored"
    | "game-ended";
  playerId?: string;
  data: Record<string, unknown>;
  stateHashBefore: string;
  stateHashAfter: string;
}

export interface GameSummary {
  seed: string;
  playerCount: number;
  totalRounds: number;
  finalScores: Record<string, number>;
  personalities: Record<string, string>;
  salvageStowed: Record<string, { count: number; vp: number }>;
  crewLost: Record<string, number>;
  actionCounts: Record<string, Record<string, number>>;
  resistStats: { attempted: number; successful: number };
  totalEvents: number;
}

export class TelemetryLogger {
  private events: TelemetryEvent[] = [];
  private actionCounts: Record<string, Record<string, number>> = {};
  private resistAttempted = 0;
  private resistSuccessful = 0;

  logEvent(
    stateBefore: GameState,
    stateAfter: GameState,
    action: Action
  ): void {
    const event: TelemetryEvent = {
      timestamp: Date.now(),
      gameSeed: stateBefore.meta.seed,
      round: stateBefore.meta.round,
      phase: stateBefore.meta.phase,
      eventType: actionToEventType(action),
      playerId: "playerId" in action ? (action as { playerId: string }).playerId : undefined,
      data: { action },
      stateHashBefore: simpleHash(stateBefore),
      stateHashAfter: simpleHash(stateAfter),
    };

    this.events.push(event);

    // Track action counts per player
    if (event.playerId) {
      if (!this.actionCounts[event.playerId]) {
        this.actionCounts[event.playerId] = {};
      }
      const type = action.type;
      this.actionCounts[event.playerId][type] =
        (this.actionCounts[event.playerId][type] ?? 0) + 1;
    }

    if (action.type === "RESIST") {
      this.resistAttempted++;
    }
  }

  logResistOutcome(success: boolean): void {
    if (success) this.resistSuccessful++;
  }

  getEvents(): TelemetryEvent[] {
    return [...this.events];
  }

  generateSummary(finalState: GameState): GameSummary {
    const players = Object.values(finalState.players);

    return {
      seed: finalState.meta.seed,
      playerCount: players.length,
      totalRounds: finalState.meta.round,
      finalScores: Object.fromEntries(players.map((p) => [p.id, p.score])),
      personalities: Object.fromEntries(
        players.map((p) => [p.id, p.aiPersonality ?? "human"])
      ),
      salvageStowed: Object.fromEntries(
        players.map((p) => [
          p.id,
          {
            count: p.ship.hold.length,
            vp: p.ship.hold.reduce((sum, s) => sum + s.vp, 0),
          },
        ])
      ),
      crewLost: Object.fromEntries(
        players.map((p) => [
          p.id,
          Object.values(p.crews).filter((c) => c.state === "lost").length,
        ])
      ),
      actionCounts: { ...this.actionCounts },
      resistStats: {
        attempted: this.resistAttempted,
        successful: this.resistSuccessful,
      },
      totalEvents: this.events.length,
    };
  }

  exportJSON(finalState: GameState): string {
    return JSON.stringify(
      {
        summary: this.generateSummary(finalState),
        events: this.events,
      },
      null,
      2
    );
  }

  clear(): void {
    this.events = [];
    this.actionCounts = {};
    this.resistAttempted = 0;
    this.resistSuccessful = 0;
  }
}

function actionToEventType(action: Action): TelemetryEvent["eventType"] {
  switch (action.type) {
    case "PLACE_SHIP": return "assigned";
    case "ROLL_DICE": return "dice-rolled";
    case "REROLL": return "rerolled";
    case "ASSIGN_DIE": return "assigned";
    case "UNASSIGN_DIE": return "assigned";
    case "REVEAL_ASSIGNMENTS": return "revealed";
    case "ACTIVATE_UNIT": return "activated";
    case "RESOLVE_DIE": return "action-resolved";
    case "RESIST": return "resisted";
    case "RUN_DRIFT": return "drift-resolved";
    case "ADVANCE_PHASE": return "scored";
    case "END_GAME": return "game-ended";
  }
}

function simpleHash(state: GameState): string {
  const str = JSON.stringify({
    round: state.meta.round,
    phase: state.meta.phase,
    scores: Object.fromEntries(
      Object.values(state.players).map((p) => [p.id, p.score])
    ),
  });
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(16);
}
