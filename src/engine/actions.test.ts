import { describe, it, expect } from "vitest";
import { reduce, createInitialState } from "./state";
import type { GameState } from "./types";
import { meetsRequirement } from "./actions";

// Helper: get a state ready for resolve phase with a die assigned
function setupForResolve(
  overrides?: (state: GameState) => void
): GameState {
  let state = createInitialState("action-test", 2);

  // Place ships apart
  state.players["player-0"].ship.position = { x: -10, z: -15 };
  state.players["player-1"].ship.position = { x: 10, z: 15 };

  if (overrides) overrides(state);

  // Roll and assign phase
  state = reduce(state, { type: "ROLL_DICE", playerId: "player-0" });
  state = reduce(state, { type: "ROLL_DICE", playerId: "player-1" });
  state = reduce(state, { type: "ADVANCE_PHASE" }); // → assign

  return state;
}

describe("meetsRequirement", () => {
  it("any accepts all values", () => {
    for (let v = 1; v <= 6; v++) {
      expect(meetsRequirement(v as 1|2|3|4|5|6, "any")).toBe(true);
    }
  });

  it("3+ rejects 1 and 2", () => {
    expect(meetsRequirement(1, "3+")).toBe(false);
    expect(meetsRequirement(2, "3+")).toBe(false);
    expect(meetsRequirement(3, "3+")).toBe(true);
    expect(meetsRequirement(6, "3+")).toBe(true);
  });

  it("5+ rejects 1-4", () => {
    expect(meetsRequirement(4, "5+")).toBe(false);
    expect(meetsRequirement(5, "5+")).toBe(true);
  });

  it("6 only accepts 6", () => {
    expect(meetsRequirement(5, "6")).toBe(false);
    expect(meetsRequirement(6, "6")).toBe(true);
  });
});

describe("Burn actions", () => {
  it("burn-small adds Short velocity to ship", () => {
    let state = setupForResolve();
    const player = state.players["player-0"];

    // Force a die value of 3 for burn-small
    player.dice[0].value = 3;
    state = reduce(state, {
      type: "ASSIGN_DIE",
      playerId: "player-0",
      dieId: player.dice[0].id,
      slotId: "burn-small",
      unitId: player.ship.id,
    });

    // Move to resolve
    state = reduce(state, { type: "REVEAL_ASSIGNMENTS" });
    state = reduce(state, { type: "ADVANCE_PHASE" }); // → resolve

    state = reduce(state, {
      type: "RESOLVE_DIE",
      dieId: player.dice[0].id,
      parameters: { actionType: "burn-small" },
    });

    expect(state.players["player-0"].ship.velocity.magnitude).toBeGreaterThan(0);
  });

  it("burn drops a step with heavy cargo", () => {
    let state = setupForResolve((s) => {
      // Load up hold to 3 mass
      s.players["player-0"].ship.hold = [
        { id: "s1", type: "wreck", vp: 2, mass: 2, position: "in-hold", isAttached: false, isFaceDown: false, velocity: { direction: 0, magnitude: 0 } },
        { id: "s2", type: "scatter", vp: 1, mass: 1, position: "in-hold", isAttached: false, isFaceDown: false, velocity: { direction: 0, magnitude: 0 } },
      ];
      s.players["player-0"].ship.holdMass = 3;
    });

    const player = state.players["player-0"];
    player.dice[0].value = 5;
    state = reduce(state, {
      type: "ASSIGN_DIE",
      playerId: "player-0",
      dieId: player.dice[0].id,
      slotId: "burn-big",
      unitId: player.ship.id,
    });

    state = reduce(state, { type: "REVEAL_ASSIGNMENTS" });
    state = reduce(state, { type: "ADVANCE_PHASE" });

    state = reduce(state, {
      type: "RESOLVE_DIE",
      dieId: player.dice[0].id,
      parameters: { actionType: "burn-big" },
    });

    // burn-big is Medium, but mass penalty drops it to Short
    const vel = state.players["player-0"].ship.velocity;
    expect(vel.magnitude).toBe(1); // Short
  });
});

describe("Launch action", () => {
  it("deploys a crew from embarked to space", () => {
    let state = setupForResolve();
    const player = state.players["player-0"];
    const cutterCrew = player.crews["Cutter"];

    player.dice[0].value = 4;
    state = reduce(state, {
      type: "ASSIGN_DIE",
      playerId: "player-0",
      dieId: player.dice[0].id,
      slotId: "launch",
      unitId: player.ship.id,
    });

    state = reduce(state, { type: "REVEAL_ASSIGNMENTS" });
    state = reduce(state, { type: "ADVANCE_PHASE" });

    state = reduce(state, {
      type: "RESOLVE_DIE",
      dieId: player.dice[0].id,
      parameters: { actionType: "launch", crewId: cutterCrew.id, direction: 0 },
    });

    const launched = state.players["player-0"].crews["Cutter"];
    expect(launched.position).not.toBe("embarked");
    expect(launched.velocity.magnitude).toBe(1); // Short
  });
});

describe("Stow action", () => {
  it("stows adjacent salvage into hold", () => {
    let state = setupForResolve((s) => {
      // Place loose salvage near player-0's ship
      s.table.looseSalvage.push({
        id: "loot-1",
        type: "wreck",
        vp: 2,
        mass: 2,
        position: { x: -10, z: -15 },
        isAttached: false,
        isFaceDown: false,
        velocity: { direction: 0, magnitude: 0 },
      });
    });

    const player = state.players["player-0"];
    player.dice[0].value = 1;
    state = reduce(state, {
      type: "ASSIGN_DIE",
      playerId: "player-0",
      dieId: player.dice[0].id,
      slotId: "stow",
      unitId: player.ship.id,
    });

    state = reduce(state, { type: "REVEAL_ASSIGNMENTS" });
    state = reduce(state, { type: "ADVANCE_PHASE" });

    state = reduce(state, {
      type: "RESOLVE_DIE",
      dieId: player.dice[0].id,
      parameters: { actionType: "stow", salvageId: "loot-1", ejectIds: [] },
    });

    expect(state.players["player-0"].ship.hold).toHaveLength(1);
    expect(state.players["player-0"].ship.holdMass).toBe(2);
    expect(state.players["player-0"].score).toBe(2);
  });
});

describe("Embark action", () => {
  it("moves crew from own ship hull to embarked", () => {
    let state = setupForResolve((s) => {
      // Put Cutter on own ship hull
      const cutter = s.players["player-0"].crews["Cutter"];
      cutter.position = { ...s.players["player-0"].ship.position };
      cutter.onTerrainId = s.players["player-0"].ship.id;
    });

    const player = state.players["player-0"];
    const cutter = player.crews["Cutter"];
    player.dice[0].value = 1;

    state = reduce(state, {
      type: "ASSIGN_DIE",
      playerId: "player-0",
      dieId: player.dice[0].id,
      slotId: "cutter-generic-0",
      unitId: cutter.id,
    });

    state = reduce(state, { type: "REVEAL_ASSIGNMENTS" });
    state = reduce(state, { type: "ADVANCE_PHASE" });

    state = reduce(state, {
      type: "RESOLVE_DIE",
      dieId: player.dice[0].id,
      parameters: { actionType: "embark" },
    });

    expect(state.players["player-0"].crews["Cutter"].position).toBe("embarked");
  });
});

describe("Push Off action", () => {
  it("gives Short velocity when leaving terrain", () => {
    let state = setupForResolve((s) => {
      const cutter = s.players["player-0"].crews["Cutter"];
      cutter.position = { x: 0, z: 0 };
      cutter.onTerrainId = "wreck-0";
    });

    const player = state.players["player-0"];
    const cutter = player.crews["Cutter"];
    player.dice[0].value = 2;

    state = reduce(state, {
      type: "ASSIGN_DIE",
      playerId: "player-0",
      dieId: player.dice[0].id,
      slotId: "cutter-generic-0",
      unitId: cutter.id,
    });

    state = reduce(state, { type: "REVEAL_ASSIGNMENTS" });
    state = reduce(state, { type: "ADVANCE_PHASE" });

    state = reduce(state, {
      type: "RESOLVE_DIE",
      dieId: player.dice[0].id,
      parameters: { actionType: "push-off", direction: Math.PI / 2 },
    });

    const updated = state.players["player-0"].crews["Cutter"];
    expect(updated.velocity.magnitude).toBe(1); // Short
    expect(updated.onTerrainId).toBeUndefined();
  });
});

describe("Thruster Burn action", () => {
  it("adds velocity based on die value", () => {
    let state = setupForResolve((s) => {
      const cutter = s.players["player-0"].crews["Cutter"];
      cutter.position = { x: 0, z: 0 };
    });

    const player = state.players["player-0"];
    const cutter = player.crews["Cutter"];
    player.dice[0].value = 5;

    state = reduce(state, {
      type: "ASSIGN_DIE",
      playerId: "player-0",
      dieId: player.dice[0].id,
      slotId: "cutter-generic-0",
      unitId: cutter.id,
    });

    state = reduce(state, { type: "REVEAL_ASSIGNMENTS" });
    state = reduce(state, { type: "ADVANCE_PHASE" });

    state = reduce(state, {
      type: "RESOLVE_DIE",
      dieId: player.dice[0].id,
      parameters: { actionType: "thruster-burn", direction: 0 },
    });

    const updated = state.players["player-0"].crews["Cutter"];
    expect(updated.velocity.magnitude).toBe(2); // Medium for die value 5
  });
});
