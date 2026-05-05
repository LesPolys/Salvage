import { describe, it, expect } from "vitest";
import { computeFinalScores, determineWinner } from "./scoring";
import { createInitialState, reduce } from "./state";
import type { Salvage } from "./types";
import { RULES } from "../config/rules";

function makeSalvage(id: string, type: "scatter" | "wreck" | "premium"): Salvage {
  const config = RULES.salvage[type];
  return {
    id,
    type,
    vp: config.vp,
    mass: config.mass,
    position: "in-hold",
    isAttached: false,
    isFaceDown: false,
    velocity: { direction: 0, magnitude: 0 },
  };
}

describe("scoring", () => {
  it("scores VP from stowed salvage", () => {
    const state = createInitialState("score", 2);
    state.players["player-0"].ship.hold = [
      makeSalvage("s1", "wreck"),    // 2 VP
      makeSalvage("s2", "premium"),  // 3 VP
    ];

    const scores = computeFinalScores(state);
    expect(scores["player-0"]).toBe(5);
    expect(scores["player-1"]).toBe(0);
  });

  it("penalizes lost crew", () => {
    const state = createInitialState("lost", 2);
    state.players["player-0"].ship.hold = [makeSalvage("s1", "wreck")]; // 2 VP
    state.players["player-0"].crews["Cutter"].state = "lost";
    state.players["player-0"].crews["Grappler"].state = "lost";

    const scores = computeFinalScores(state);
    expect(scores["player-0"]).toBe(0); // 2 - 2 = 0
  });

  it("score can go negative from lost crew", () => {
    const state = createInitialState("negative", 2);
    state.players["player-0"].crews["Cutter"].state = "lost";
    state.players["player-0"].crews["Grappler"].state = "lost";
    state.players["player-0"].crews["Breacher"].state = "lost";

    const scores = computeFinalScores(state);
    expect(scores["player-0"]).toBe(-3);
  });

  it("determines winner by highest score", () => {
    const state = createInitialState("winner", 3);
    const scores = { "player-0": 5, "player-1": 8, "player-2": 3 };
    const result = determineWinner(scores, state);
    expect(result.winnerId).toBe("player-1");
    expect(result.tied).toBe(false);
  });

  it("breaks ties by most pieces stowed", () => {
    const state = createInitialState("tie", 2);
    state.players["player-0"].ship.hold = [
      makeSalvage("s1", "premium"), // 3 VP, 1 piece
    ];
    state.players["player-1"].ship.hold = [
      makeSalvage("s2", "wreck"),   // 2 VP
      makeSalvage("s3", "scatter"), // 1 VP — total 3 VP, 2 pieces
    ];

    const scores = { "player-0": 3, "player-1": 3 };
    const result = determineWinner(scores, state);
    expect(result.winnerId).toBe("player-1"); // more pieces
    expect(result.tied).toBe(true);
  });
});

describe("END_GAME action", () => {
  it("computes final scores and sets gameover", () => {
    const state = createInitialState("endgame", 2);
    state.players["player-0"].ship.hold = [
      makeSalvage("s1", "premium"),
      makeSalvage("s2", "wreck"),
    ];
    state.players["player-1"].ship.hold = [
      makeSalvage("s3", "scatter"),
    ];

    const next = reduce(state, { type: "END_GAME" });

    expect(next.meta.phase).toBe("gameover");
    expect(next.players["player-0"].score).toBe(5); // 3 + 2
    expect(next.players["player-1"].score).toBe(1);
  });
});
