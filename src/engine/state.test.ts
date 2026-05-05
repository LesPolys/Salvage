import { describe, it, expect } from "vitest";
import { reduce, createInitialState } from "./state";
import type { GameState } from "./types";
import { RULES } from "../config/rules";

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

describe("createInitialState", () => {
  it("creates correct number of players", () => {
    const state = createInitialState("test", 4);
    expect(Object.keys(state.players)).toHaveLength(4);
  });

  it("starts at round 1, deploy phase", () => {
    const state = createInitialState("test", 2);
    expect(state.meta.round).toBe(1);
    expect(state.meta.phase).toBe("deploy");
  });

  it("each player has 4 crew with correct roles", () => {
    const state = createInitialState("test", 2);
    const player = state.players["player-0"];
    const roles = Object.keys(player.crews);
    expect(roles).toContain("Cutter");
    expect(roles).toContain("Grappler");
    expect(roles).toContain("Breacher");
    expect(roles).toContain("Hauler");
  });

  it("each player has a ship with correct slots", () => {
    const state = createInitialState("test", 2);
    const ship = state.players["player-0"].ship;
    expect(ship.slots).toHaveLength(7);
    expect(ship.hullAnchors).toHaveLength(RULES.ship.hullAnchors);
    expect(ship.holdMass).toBe(0);
  });

  it("all crew start embarked", () => {
    const state = createInitialState("test", 2);
    for (const player of Object.values(state.players)) {
      for (const crew of Object.values(player.crews)) {
        expect(crew.position).toBe("embarked");
      }
    }
  });

  it("ships start unplaced", () => {
    const state = createInitialState("test", 2);
    for (const player of Object.values(state.players)) {
      expect(player.ship.placed).toBe(false);
    }
  });
});

describe("reduce - ROLL_DICE", () => {
  it("gives player 5 dice with values 1-6", () => {
    const state = createReadyState("test-seed", 2);
    const next = reduce(state, { type: "ROLL_DICE", playerId: "player-0" });

    expect(next.players["player-0"].dice).toHaveLength(5);
    for (const die of next.players["player-0"].dice) {
      expect(die.value).toBeGreaterThanOrEqual(1);
      expect(die.value).toBeLessThanOrEqual(6);
      expect(die.state).toBe("rolled");
    }
  });

  it("produces deterministic results from same seed", () => {
    const s1 = createReadyState("determinism", 2);
    const s2 = createReadyState("determinism", 2);

    const r1 = reduce(s1, { type: "ROLL_DICE", playerId: "player-0" });
    const r2 = reduce(s2, { type: "ROLL_DICE", playerId: "player-0" });

    const v1 = r1.players["player-0"].dice.map((d) => d.value);
    const v2 = r2.players["player-0"].dice.map((d) => d.value);
    expect(v1).toEqual(v2);
  });

  it("does not mutate the original state", () => {
    const state = createReadyState("immutable", 2);
    const originalDice = state.players["player-0"].dice;

    reduce(state, { type: "ROLL_DICE", playerId: "player-0" });

    // Original should be unchanged
    expect(state.players["player-0"].dice).toBe(originalDice);
    expect(state.players["player-0"].dice).toHaveLength(0);
  });

  it("sets rerollsRemaining based on round number", () => {
    const state = createReadyState("rerolls", 2);
    const next = reduce(state, { type: "ROLL_DICE", playerId: "player-0" });
    // Round 1 = 0 rerolls
    expect(next.players["player-0"].rerollsRemaining).toBe(0);
  });

  it("throws for unknown player", () => {
    const state = createReadyState("err", 2);
    expect(() =>
      reduce(state, { type: "ROLL_DICE", playerId: "ghost" })
    ).toThrow("Unknown player");
  });

  it("throws if not in roll phase", () => {
    const state = createReadyState("phase-err", 2);
    state.meta.phase = "assign";
    expect(() =>
      reduce(state, { type: "ROLL_DICE", playerId: "player-0" })
    ).toThrow("Cannot roll dice");
  });
});

describe("reduce - REROLL", () => {
  it("rerolls selected dice deterministically", () => {
    const state = createReadyState("reroll-test", 2);
    // Set round to 3 so we get 2 rerolls
    state.meta.round = 3;
    const rolled = reduce(state, { type: "ROLL_DICE", playerId: "player-0" });

    const dieIds = rolled.players["player-0"].dice
      .slice(0, 2)
      .map((d) => d.id);
    const rerolled = reduce(rolled, {
      type: "REROLL",
      playerId: "player-0",
      dieIds,
    });

    expect(rerolled.players["player-0"].rerollsRemaining).toBe(0);
    // Dice should still be valid
    for (const die of rerolled.players["player-0"].dice) {
      expect(die.value).toBeGreaterThanOrEqual(1);
      expect(die.value).toBeLessThanOrEqual(6);
    }
  });

  it("throws if rerolling more dice than allowed", () => {
    const state = createReadyState("too-many", 2);
    const rolled = reduce(state, { type: "ROLL_DICE", playerId: "player-0" });
    // Round 1 = 0 rerolls
    expect(() =>
      reduce(rolled, {
        type: "REROLL",
        playerId: "player-0",
        dieIds: [rolled.players["player-0"].dice[0].id],
      })
    ).toThrow("Cannot reroll");
  });
});
