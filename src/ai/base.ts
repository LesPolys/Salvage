import type {
  GameState,
  EntityId,
  ActionType,
  DieValue,
} from "../engine/types";

export interface Assignment {
  dieId: string;
  unitId: EntityId;
}

export interface ActionDecision {
  actionType: ActionType;
  parameters: Record<string, unknown>;
}

export interface ResistDecision {
  resist: boolean;
  dieId?: string;
}

export interface AIDecisionLog {
  type: string;
  candidates: Array<{ option: string; score: number }>;
  chosen: string;
  reason: string;
}

export interface AIPlayer {
  personality: "aggressive" | "cautious" | "opportunistic";

  decideRerolls(state: GameState, playerId: string): string[];
  decideAssignments(state: GameState, playerId: string): Assignment[];
  decideActivation(state: GameState, playerId: string): EntityId;
  decideAction(
    state: GameState,
    playerId: string,
    unitId: EntityId,
    dieId: string,
    dieValue: DieValue
  ): ActionDecision;
  decideResist(
    state: GameState,
    playerId: string,
    targetCrewId: EntityId,
    attackerDieValue: DieValue
  ): ResistDecision;

  getLastDecisionLog(): AIDecisionLog | null;
}
