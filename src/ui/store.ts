import { create } from "zustand";
import type { GameState, Action, EntityId, Phase, ActionType, Vec2, Velocity } from "../engine/types";
import { reduce } from "../engine/state";
import { setupGame } from "../engine/setup";

export interface TargetingMode {
  /** The action being targeted */
  actionType: ActionType;
  /** The unit performing the action */
  unitId: EntityId;
  /** The die being spent */
  dieId: string;
  /** The player */
  playerId: string;
  /** Unit's current position on the table */
  unitPosition: Vec2;
  /** Unit's current velocity (for vector preview) */
  currentVelocity: Velocity;
  /** What kind of targeting: direction (burns, push-off), point (grapple), entity (cut, breach) */
  targetKind: "direction" | "point" | "entity";
}

export interface UIState {
  // Game state
  game: GameState | null;
  isStarted: boolean;

  // UI selections
  selectedEntityId: EntityId | null;
  hoveredEntityId: EntityId | null;

  // Dice drag state (assign phase)
  draggingDieId: string | null;

  // Targeting mode (resolve phase — awaiting click on playfield)
  targeting: TargetingMode | null;
  /** Mouse position on the playfield during targeting (world coords) */
  targetingMousePos: Vec2 | null;

  // Debug
  showDebug: boolean;
  showGrid: boolean;

  // Actions
  startGame: (seed: string, playerCount: number, playerNames?: string[], aiConfig?: Array<{ isAI: boolean; personality?: string }>) => void;
  dispatch: (action: Action) => void;
  selectEntity: (id: EntityId | null) => void;
  hoverEntity: (id: EntityId | null) => void;
  setDraggingDie: (dieId: string | null) => void;
  toggleDebug: () => void;
  toggleGrid: () => void;

  // Targeting
  startTargeting: (mode: TargetingMode) => void;
  updateTargetingMouse: (pos: Vec2 | null) => void;
  confirmTargeting: (worldPos: Vec2) => void;
  cancelTargeting: () => void;

  // Convenience getters
  currentPhase: () => Phase | null;
  activePlayerId: () => string | null;
  currentPlayerCount: () => number;
}

export const useGameStore = create<UIState>((set, get) => ({
  game: null,
  isStarted: false,
  selectedEntityId: null,
  hoveredEntityId: null,
  draggingDieId: null,
  targeting: null,
  targetingMousePos: null,
  showDebug: false,
  showGrid: true,

  startGame: (seed, playerCount, playerNames, aiConfig) => {
    const game = setupGame(seed, playerCount, playerNames, aiConfig as Parameters<typeof setupGame>[3]);
    set({ game, isStarted: true, selectedEntityId: null });
  },

  dispatch: (action) => {
    const { game } = get();
    if (!game) return;
    try {
      const next = reduce(game, action);
      set({ game: next });
    } catch (e) {
      console.error("Action failed:", e);
    }
  },

  selectEntity: (id) => set({ selectedEntityId: id }),
  hoverEntity: (id) => set({ hoveredEntityId: id }),
  setDraggingDie: (dieId) => set({ draggingDieId: dieId }),
  toggleDebug: () => set((s) => ({ showDebug: !s.showDebug })),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),

  startTargeting: (mode) => set({ targeting: mode, targetingMousePos: null }),
  updateTargetingMouse: (pos) => set({ targetingMousePos: pos }),
  cancelTargeting: () => set({ targeting: null, targetingMousePos: null }),

  confirmTargeting: (worldPos) => {
    const { targeting, game, dispatch } = get();
    if (!targeting) return;

    if (game?.meta.phase === "deploy" && targeting.targetKind === "point") {
      // Deploy phase: place ship at clicked position
      dispatch({
        type: "PLACE_SHIP",
        playerId: targeting.playerId,
        position: worldPos,
      });
    } else {
      // Direction targeting: compute angle from unit to click point
      const dx = worldPos.x - targeting.unitPosition.x;
      const dz = worldPos.z - targeting.unitPosition.z;
      const direction = Math.atan2(dz, dx);

      dispatch({
        type: "RESOLVE_DIE",
        playerId: targeting.playerId,
        unitId: targeting.unitId,
        dieId: targeting.dieId,
        actionType: targeting.actionType,
        parameters: { direction },
      });
    }

    set({ targeting: null, targetingMousePos: null });
  },

  currentPhase: () => get().game?.meta.phase ?? null,
  activePlayerId: () => get().game?.meta.activePlayerId ?? null,
  currentPlayerCount: () => {
    const g = get().game;
    return g ? Object.keys(g.players).length : 0;
  },
}));
