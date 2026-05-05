import { create } from "zustand";
import type { GameState, Action, EntityId, Phase } from "../engine/types";
import { reduce } from "../engine/state";
import { setupGame } from "../engine/setup";

export interface UIState {
  // Game state
  game: GameState | null;
  isStarted: boolean;

  // UI selections
  selectedEntityId: EntityId | null;
  hoveredEntityId: EntityId | null;

  // Dice drag state (assign phase)
  draggingDieId: string | null;

  // Debug
  showDebug: boolean;
  showGrid: boolean;

  // Actions
  startGame: (seed: string, playerCount: number, playerNames?: string[]) => void;
  dispatch: (action: Action) => void;
  selectEntity: (id: EntityId | null) => void;
  hoverEntity: (id: EntityId | null) => void;
  setDraggingDie: (dieId: string | null) => void;
  toggleDebug: () => void;
  toggleGrid: () => void;

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
  showDebug: false,
  showGrid: true,

  startGame: (seed, playerCount, playerNames) => {
    const game = setupGame(seed, playerCount, playerNames);
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

  currentPhase: () => get().game?.meta.phase ?? null,
  activePlayerId: () => get().game?.meta.activePlayerId ?? null,
  currentPlayerCount: () => {
    const g = get().game;
    return g ? Object.keys(g.players).length : 0;
  },
}));
