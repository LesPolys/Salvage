import { describe, it, expect } from "vitest";
import { reduce, createInitialState } from "./state";

describe("phase machine", () => {
  it("transitions roll → assign via ADVANCE_PHASE", () => {
    const state = createInitialState("phase", 2);
    const next = reduce(state, { type: "ADVANCE_PHASE" });
    expect(next.meta.phase).toBe("assign");
  });

  it("transitions assign → reveal via REVEAL_ASSIGNMENTS", () => {
    let state = createInitialState("phase", 2);
    state.meta.phase = "assign";
    state = reduce(state, { type: "REVEAL_ASSIGNMENTS" });
    expect(state.meta.phase).toBe("reveal");
  });

  it("transitions reveal → resolve via ADVANCE_PHASE", () => {
    let state = createInitialState("phase", 2);
    state.meta.phase = "reveal";
    state = reduce(state, { type: "ADVANCE_PHASE" });
    expect(state.meta.phase).toBe("resolve");
  });

  it("transitions resolve → drift via ADVANCE_PHASE", () => {
    let state = createInitialState("phase", 2);
    state.meta.phase = "resolve";
    state = reduce(state, { type: "ADVANCE_PHASE" });
    expect(state.meta.phase).toBe("drift");
  });

  it("transitions drift → roll (next round) via ADVANCE_PHASE", () => {
    let state = createInitialState("phase", 2);
    state.meta.phase = "drift";
    state.meta.round = 1;
    state = reduce(state, { type: "ADVANCE_PHASE" });
    expect(state.meta.phase).toBe("roll");
    expect(state.meta.round).toBe(2);
  });

  it("transitions drift → scoring on round 6 via ADVANCE_PHASE", () => {
    let state = createInitialState("phase", 2);
    state.meta.phase = "drift";
    state.meta.round = 6;
    state = reduce(state, { type: "ADVANCE_PHASE" });
    expect(state.meta.phase).toBe("scoring");
  });

  it("transitions scoring → gameover via ADVANCE_PHASE", () => {
    let state = createInitialState("phase", 2);
    state.meta.phase = "scoring";
    state = reduce(state, { type: "ADVANCE_PHASE" });
    expect(state.meta.phase).toBe("gameover");
  });

  it("throws on gameover ADVANCE_PHASE", () => {
    let state = createInitialState("phase", 2);
    state.meta.phase = "gameover";
    expect(() => reduce(state, { type: "ADVANCE_PHASE" })).toThrow("already over");
  });

  it("forfeits unassigned dice on reveal", () => {
    let state = createInitialState("forfeit", 2);
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
    let state = createInitialState("order", 3);
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
    let state = createInitialState("reset", 2);
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
    let state = createInitialState("assign-test", 2);
    state = reduce(state, { type: "ROLL_DICE", playerId: "player-0" });
    state = reduce(state, { type: "ROLL_DICE", playerId: "player-1" });
    state = reduce(state, { type: "ADVANCE_PHASE" }); // → assign
    return state;
  }

  it("assigns a die to a ship slot", () => {
    let state = rollAndAssignState();
    // Find a die that meets 1+ (any die works for scan)
    const die = state.players["player-0"].dice[0];
    state = reduce(state, {
      type: "ASSIGN_DIE",
      playerId: "player-0",
      dieId: die.id,
      slotId: "scan",
      unitId: `ship-player-0`,
    });

    expect(state.players["player-0"].dice[0].state).toBe("assigned");
    expect(state.players["player-0"].ship.slots.find((s) => s.id === "scan")!.assignedDieId).toBe(die.id);
  });

  it("assigns a die to a crew slot", () => {
    let state = rollAndAssignState();
    const die = state.players["player-0"].dice[0];
    state = reduce(state, {
      type: "ASSIGN_DIE",
      playerId: "player-0",
      dieId: die.id,
      slotId: "hauler-generic-0",
      unitId: `crew-player-0-Hauler`,
    });

    const hauler = state.players["player-0"].crews["Hauler"];
    const slot = hauler.slots.find((s) => s.id === "hauler-generic-0");
    expect(slot!.assignedDieId).toBe(die.id);
  });

  it("rejects die that doesn't meet slot requirement", () => {
    let state = rollAndAssignState();
    // Force a die to value 1 — it shouldn't fit burn-small (3+)
    state.players["player-0"].dice[0].value = 1;
    const die = state.players["player-0"].dice[0];

    expect(() =>
      reduce(state, {
        type: "ASSIGN_DIE",
        playerId: "player-0",
        dieId: die.id,
        slotId: "burn-small",
        unitId: `ship-player-0`,
      })
    ).toThrow("doesn't meet requirement");
  });

  it("rejects assigning to an already-occupied slot", () => {
    let state = rollAndAssignState();
    const die0 = state.players["player-0"].dice[0];
    const die1 = state.players["player-0"].dice[1];

    state = reduce(state, {
      type: "ASSIGN_DIE",
      playerId: "player-0",
      dieId: die0.id,
      slotId: "scan",
      unitId: `ship-player-0`,
    });

    expect(() =>
      reduce(state, {
        type: "ASSIGN_DIE",
        playerId: "player-0",
        dieId: die1.id,
        slotId: "scan",
        unitId: `ship-player-0`,
      })
    ).toThrow("already has a die");
  });

  it("rejects assignment outside assign phase", () => {
    let state = createInitialState("wrong-phase", 2);
    state = reduce(state, { type: "ROLL_DICE", playerId: "player-0" });
    const die = state.players["player-0"].dice[0];

    expect(() =>
      reduce(state, {
        type: "ASSIGN_DIE",
        playerId: "player-0",
        dieId: die.id,
        slotId: "scan",
        unitId: `ship-player-0`,
      })
    ).toThrow("Cannot assign");
  });
});
