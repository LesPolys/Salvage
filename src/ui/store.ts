import { create } from "zustand";
import type { GameState, Action, EntityId, Phase, ActionType, Vec2, Velocity } from "../engine/types";
import { reduce } from "../engine/state";
import { setupGame } from "../engine/setup";
import { RULES } from "../config/rules";
import { RNG } from "../engine/rng";
import type { AIPlayer } from "../ai/base";
import { AggressiveAI } from "../ai/aggressive";
import { CautiousAI } from "../ai/cautious";
import { OpportunisticAI } from "../ai/opportunistic";

function createAI(personality: string): AIPlayer {
  switch (personality) {
    case "aggressive": return new AggressiveAI();
    case "cautious": return new CautiousAI();
    default: return new OpportunisticAI();
  }
}

/**
 * After any state change, run all AI actions until it's a human's turn.
 * Handles deploy, roll, assign, resolve phases automatically for AI players.
 */
function runAITurns(state: GameState): GameState {
  let safety = 200;
  while (safety-- > 0) {
    const phase = state.meta.phase;
    if (phase === "gameover") break;

    // Deploy: auto-place AI ships
    if (phase === "deploy") {
      const active = state.players[state.meta.activePlayerId];
      if (!active?.isAI) break;
      state = autoPlaceOneAI(state);
      continue;
    }

    // Roll: auto-roll for all AI players who haven't rolled
    if (phase === "roll") {
      let rolled = false;
      for (const p of Object.values(state.players)) {
        if (p.isAI && p.dice.length === 0) {
          state = reduce(state, { type: "ROLL_DICE", playerId: p.id });
          rolled = true;
        }
      }
      // Also handle AI rerolls
      if (!rolled) {
        for (const p of Object.values(state.players)) {
          if (p.isAI && p.rerollsRemaining > 0) {
            const ai = createAI(p.aiPersonality ?? "opportunistic");
            const rerollIds = ai.decideRerolls(state, p.id);
            if (rerollIds.length > 0) {
              state = reduce(state, { type: "REROLL", playerId: p.id, dieIds: rerollIds });
            }
          }
        }
      }
      // Check if all players have rolled — if so, a human needs to advance or we do
      const allRolled = Object.values(state.players).every((p) => p.dice.length > 0);
      if (allRolled) {
        // If ALL players are AI, advance automatically
        const anyHuman = Object.values(state.players).some((p) => !p.isAI);
        if (!anyHuman) {
          state = reduce(state, { type: "ADVANCE_PHASE" });
          continue;
        }
      }
      break; // Wait for human to roll or advance
    }

    // Assign: auto-assign for all AI players
    if (phase === "assign") {
      for (const p of Object.values(state.players)) {
        if (!p.isAI) continue;
        const ai = createAI(p.aiPersonality ?? "opportunistic");
        const assignments = ai.decideAssignments(JSON.parse(JSON.stringify(state)), p.id);
        for (const a of assignments) {
          try {
            state = reduce(state, { type: "ASSIGN_DIE", playerId: p.id, dieId: a.dieId, unitId: a.unitId });
          } catch { /* skip invalid */ }
        }
      }
      // If all players are AI, reveal + advance
      const anyHuman = Object.values(state.players).some((p) => !p.isAI);
      if (!anyHuman) {
        state = reduce(state, { type: "REVEAL_ASSIGNMENTS" });
        state = reduce(state, { type: "ADVANCE_PHASE" });
        continue;
      }
      break; // Wait for human to assign and reveal
    }

    // Reveal: auto-advance
    if (phase === "reveal") {
      state = reduce(state, { type: "ADVANCE_PHASE" });
      continue;
    }

    // Resolve: auto-resolve AI units
    if (phase === "resolve") {
      const active = state.players[state.meta.activePlayerId];
      if (!active?.isAI) break; // Human's turn

      // Resolve all AI dice
      const assignedDice = active.dice.filter((d) => d.state === "assigned");
      if (assignedDice.length === 0) {
        // No dice left — advance to next player or drift
        const anyDiceLeft = Object.values(state.players).some((p) =>
          p.dice.some((d) => d.state === "assigned")
        );
        if (!anyDiceLeft) {
          state = reduce(state, { type: "ADVANCE_PHASE" });
        } else {
          // Cycle to next player with dice
          // The engine should handle this but we need to advance active player
          // For now just break — the phase controls will handle it
          break;
        }
        continue;
      }

      const die = assignedDice[0];
      const ai = createAI(active.aiPersonality ?? "opportunistic");
      const decision = ai.decideAction(state, active.id, die.assignedTo!, die.id, die.value);
      try {
        state = reduce(state, {
          type: "RESOLVE_DIE",
          playerId: active.id,
          unitId: die.assignedTo!,
          dieId: die.id,
          actionType: decision.actionType,
          parameters: decision.parameters,
        });
      } catch {
        // Action failed — forfeit die
        const idx = active.dice.findIndex((d) => d.id === die.id);
        if (idx !== -1) active.dice[idx].state = "spent";
        // Remove from pool
        for (const crew of Object.values(active.crews)) {
          crew.dicePool = crew.dicePool.filter((id) => id !== die.id);
        }
        active.ship.dicePool = active.ship.dicePool.filter((id) => id !== die.id);
      }
      continue;
    }

    // Drift: auto-run
    if (phase === "drift") {
      state = reduce(state, { type: "RUN_DRIFT" });
      state = reduce(state, { type: "ADVANCE_PHASE" });
      continue;
    }

    // Scoring: auto-end
    if (phase === "scoring") {
      state = reduce(state, { type: "END_GAME" });
      continue;
    }

    break;
  }
  return state;
}

/** Auto-place one AI ship on the opposite edge from whoever placed first */
function autoPlaceOneAI(state: GameState): GameState {
  if (state.meta.phase !== "deploy") return state;
  const activePlayer = state.players[state.meta.activePlayerId];
  if (!activePlayer?.isAI) return state;

  const halfTable = RULES.table.sizeInches / 2;
  const edgeBuf = RULES.table.shipEdgeBuffer;
  const rng = new RNG(state.meta.seed + `-ai-deploy-${activePlayer.id}`);

  // Determine edge: opposite of first-placed ship, or random if first
  const placedShips = Object.values(state.players).filter((p) => p.ship.placed && p.ship.deployEdge);
  let targetEdge: "top" | "bottom" | "left" | "right";

  if (placedShips.length > 0) {
    const firstEdge = placedShips[0].ship.deployEdge!;
    const oppositeEdges: Record<string, string> = { top: "bottom", bottom: "top", left: "right", right: "left" };
    targetEdge = oppositeEdges[firstEdge] as typeof targetEdge;
  } else {
    const edges: Array<typeof targetEdge> = ["top", "bottom", "left", "right"];
    targetEdge = edges[rng.nextInt(0, 3)];
  }

  const spread = halfTable - 4;
  for (let attempt = 0; attempt < 20; attempt++) {
    let pos: Vec2;
    switch (targetEdge) {
      case "top": pos = { x: rng.nextInt(-spread, spread), z: halfTable - edgeBuf }; break;
      case "bottom": pos = { x: rng.nextInt(-spread, spread), z: -halfTable + edgeBuf }; break;
      case "right": pos = { x: halfTable - edgeBuf, z: rng.nextInt(-spread, spread) }; break;
      case "left": pos = { x: -halfTable + edgeBuf, z: rng.nextInt(-spread, spread) }; break;
    }
    try {
      return reduce(state, { type: "PLACE_SHIP", playerId: activePlayer.id, position: pos });
    } catch {
      continue;
    }
  }
  return state;
}

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
    let game = setupGame(seed, playerCount, playerNames, aiConfig as Parameters<typeof setupGame>[3]);
    game = runAITurns(game);
    set({ game, isStarted: true, selectedEntityId: null });
  },

  dispatch: (action) => {
    const { game } = get();
    if (!game) return;
    try {
      let next = reduce(game, action);
      next = runAITurns(next);
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
      // Deploy phase: snap to nearest edge
      const ht = RULES.table.sizeInches / 2;
      const eb = RULES.table.shipEdgeBuffer;
      const dists = {
        top: ht - worldPos.z,
        bottom: worldPos.z + ht,
        right: ht - worldPos.x,
        left: worldPos.x + ht,
      };
      const nearest = Object.entries(dists).sort((a, b) => a[1] - b[1])[0][0];
      let snapped: Vec2;
      switch (nearest) {
        case "top": snapped = { x: worldPos.x, z: ht - eb }; break;
        case "bottom": snapped = { x: worldPos.x, z: -ht + eb }; break;
        case "left": snapped = { x: -ht + eb, z: worldPos.z }; break;
        case "right": snapped = { x: ht - eb, z: worldPos.z }; break;
        default: snapped = worldPos;
      }

      dispatch({
        type: "PLACE_SHIP",
        playerId: targeting.playerId,
        position: snapped,
      });
    } else {
      // Direction targeting: compute angle from unit to click point
      const dx = worldPos.x - targeting.unitPosition.x;
      const dz = worldPos.z - targeting.unitPosition.z;
      const direction = Math.atan2(dz, dx);

      const extraParams: Record<string, unknown> = { direction };
      // Include crewId for launch actions
      const storeState = get() as any;
      if (targeting.actionType === "launch" && storeState._launchCrewId) {
        extraParams.crewId = storeState._launchCrewId;
        set({ _launchCrewId: undefined } as any);
      }

      dispatch({
        type: "RESOLVE_DIE",
        playerId: targeting.playerId,
        unitId: targeting.unitId,
        dieId: targeting.dieId,
        actionType: targeting.actionType,
        parameters: extraParams,
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
