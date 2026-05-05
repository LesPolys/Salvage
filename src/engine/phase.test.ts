import { describe, it, expect } from "vitest";
import { reduce, createInitialState } from "./state";
import type { GameState } from "./types";

/** Skip deploy: mark all ships placed and set phase to roll */
function createReadyState(seed: string, playerCount: number): GameState {
  const state = createInitialState(seed, playerCount);
  for (const player of Object.values(state.players)) {
    player.ship.placed = true;
    player.ship.position = { x: (Math.random() - 0.5) * 20, z: 16 };
  }
  state.meta.phase = "roll";
  state.meta.turnOrder = Object.keys(state.players);
  state.meta.activePlayerId = state.meta.turnOrder[0];
  return state;
}

describe("phase machine", () => {
  it("transitions roll → assign via ADVANCE_PHASE", () => {
    const state = createReadyState("phase", 2);
    const next = reduce(state, { type: "ADVANCE_PHASE" });
    expect(next.meta.phase).toBe("assign");
  });

  it("transitions assign → reveal via REVEAL_ASSIGNMENTS", () => {
    let state = createReadyState("phase", 2);
    state.meta.phase = "assign";
    state = reduce(state, { type: "REVEAL_ASSIGNMENTS" });
    expect(state.meta.phase).toBe("reveal");
  });

  it("transitions reveal → resolve via ADVANCE_PHASE", () => {
    let state = createReadyState("phase", 2);
    state.meta.phase = "reveal";
    state = reduce(state, { type: "ADVANCE_PHASE" });
    expect(state.meta.phase).toBe("resolve");
  });

  it("transitions resolve → drift via ADVANCE_PHASE", () => {
    let state = createReadyState("phase", 2);
    state.meta.phase = "resolve";
    state = reduce(state, { type: "ADVANCE_PHASE" });
    expect(state.meta.phase).toBe("drift");
  });

  it("transitions drift → roll (next round) via ADVANCE_PHASE", () => {
    let state = createReadyState("phase", 2);
    state.meta.phase = "drift";
    state.meta.round = 1;
    state = reduce(state, { type: "ADVANCE_PHASE" });
    expect(state.meta.phase).toBe("roll");
    expect(state.meta.round).toBe(2);
  });

  it("transitions drift → scoring on round 6 via ADVANCE_PHASE", () => {
    let state = createReadyState("phase", 2);
    state.meta.phase = "drift";
    state.meta.round = 6;
    state = reduce(state, { type: "ADVANCE_PHASE" });
    expect(state.meta.phase).toBe("scoring");
  });

  it("transitions scoring → gameover via ADVANCE_PHASE", () => {
    let state = createReadyState("phase", 2);
    state.meta.phase = "scoring";
    state = reduce(state, { type: "ADVANCE_PHASE" });
    expect(state.meta.phase).toBe("gameover");
  });

  it("throws on gameover ADVANCE_PHASE", () => {
    let state = createReadyState("phase", 2);
    state.meta.phase = "gameover";
    expect(() => reduce(state, { type: "ADVANCE_PHASE" })).toThrow("already over");
  });

  it("forfeits unassigned dice on reveal", () => {
    let state = createReadyState("forfeit", 2);
    // Roll dice
    state = reduce(state, { type: "ROLL_DICE", playerId: "player-0" });
    state = reduce(state, { type: "ROLL_DICE", playerId: "player-1" });
    // Advance to assign
    state = reduce(state, { type: "ADVANCE_PHASE" });
    // Reveal without assigning
    state = reduce(state, { type: "REVEAL_ASSIGNMENTS" });

    for (const player of Object.values(state.players)) {
      for (const die of player.dice) {
        expect(die.state).toBe("forfeit");
      }
    }
  });

  it("computes turn order by score (lowest first)", () => {
    let state = createReadyState("order", 3);
    state.players["player-0"].score = 5;
    state.players["player-1"].score = 2;
    state.players["player-2"].score = 8;

    state.meta.phase = "reveal";
    state = reduce(state, { type: "ADVANCE_PHASE" });

    expect(state.meta.turnOrder[0]).toBe("player-1"); // score 2
    expect(state.meta.turnOrder[1]).toBe("player-0"); // score 5
    expect(state.meta.turnOrder[2]).toBe("player-2"); // score 8
  });

  it("resets dice and slots between rounds", () => {
    let state = createReadyState("reset", 2);
    state = reduce(state, { type: "ROLL_DICE", playerId: "player-0" });
    state = reduce(state, { type: "ROLL_DICE", playerId: "player-1" });
    expect(state.players["player-0"].dice).toHaveLength(5);

    state.meta.phase = "drift";
    state.meta.round = 1;
    state = reduce(state, { type: "ADVANCE_PHASE" });

    expect(state.meta.round).toBe(2);
    expect(state.players["player-0"].dice).toHaveLength(0);
    expect(state.players["player-1"].dice).toHaveLength(0);
  });
});

describe("ASSIGN_DIE", () => {
  function rollAndAssignState() {
    let state = createReadyState("assign-test", 2);
    state = reduce(state, { type: "ROLL_DICE", playerId: "player-0" });
    state = reduce(state, { type: "ROLL_DICE", playerId: "player-1" });
    state = reduce(state, { type: "ADVANCE_PHASE" }); // → assign
    return state;
  }

  it("assigns a die to a ship", () => {
    let state = rollAndAssignState();
    const die = state.players["player-0"].dice[0];
    state = reduce(state, {
      type: "ASSIGN_DIE",
      playerId: "player-0",
      dieId: die.id,
      unitId: `ship-player-0`,
    });

    expect(state.players["player-0"].dice[0].state).toBe("assigned");
    expect(state.players["player-0"].ship.dicePool).toContain(die.id);
  });

  it("assigns a die to a crew", () => {
    let state = rollAndAssignState();
    const die = state.players["player-0"].dice[0];
    state = reduce(state, {
      type: "ASSIGN_DIE",
      playerId: "player-0",
      dieId: die.id,
      unitId: `crew-player-0-Hauler`,
    });

    const hauler = state.players["player-0"].crews["Hauler"];
    expect(hauler.dicePool).toContain(die.id);
  });

  it("rejects assignment outside assign phase", () => {
    let state = createReadyState("wrong-phase", 2);
    state = reduce(state, { type: "ROLL_DICE", playerId: "player-0" });
    const die = state.players["player-0"].dice[0];

    expect(() =>
      reduce(state, {
        type: "ASSIGN_DIE",
        playerId: "player-0",
        dieId: die.id,
        unitId: `ship-player-0`,
      })
    ).toThrow("Cannot assign");
  });
});
