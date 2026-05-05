import { describe, it, expect } from "vitest";
import { reduce, createInitialState } from "./state";
import type { GameState, ActionType } from "./types";
import { computeFinalScores, markEndOfGameLostCrew } from "./scoring";
import { resolveSelfTether } from "./actions";

// Helper: set up a state in resolve phase with dice assigned
function setupResolve(overrides?: (s: GameState) => void): GameState {
  let state = createInitialState("fix-test", 2);
  state.players["player-0"].ship.position = { x: -10, z: 0 };
  state.players["player-1"].ship.position = { x: 10, z: 0 };
  if (overrides) overrides(state);
  state = reduce(state, { type: "ROLL_DICE", playerId: "player-0" });
  state = reduce(state, { type: "ROLL_DICE", playerId: "player-1" });
  state = reduce(state, { type: "ADVANCE_PHASE" }); // → assign
  return state;
}

describe("role-lock validation", () => {
  it("rejects Cut from non-Cutter crew", () => {
    let state = setupResolve((s) => {
      const grappler = s.players["player-0"].crews["Grappler"];
      grappler.position = { x: 0, z: 0 };
      grappler.onTerrainId = "wreck-0";
    });

    const player = state.players["player-0"];
    const grappler = player.crews["Grappler"];
    player.dice[0].value = 3;

    state = reduce(state, {
      type: "ASSIGN_DIE",
      playerId: "player-0",
      dieId: player.dice[0].id,
      unitId: grappler.id,
    });

    state = reduce(state, { type: "REVEAL_ASSIGNMENTS" });
    state = reduce(state, { type: "ADVANCE_PHASE" });

    expect(() =>
      reduce(state, {
        type: "RESOLVE_DIE",
        playerId: "player-0",
        unitId: grappler.id,
        dieId: player.dice[0].id,
        actionType: "cut" as ActionType,
        parameters: { targetType: "salvage", targetId: "s1" },
      })
    ).toThrow("Cutter");
  });

  it("rejects Breach from non-Breacher crew", () => {
    let state = setupResolve((s) => {
      const hauler = s.players["player-0"].crews["Hauler"];
      hauler.position = { x: 0, z: 0 };
    });

    const player = state.players["player-0"];
    const hauler = player.crews["Hauler"];
    player.dice[0].value = 5;

    state = reduce(state, {
      type: "ASSIGN_DIE",
      playerId: "player-0",
      dieId: player.dice[0].id,
      unitId: hauler.id,
    });

    state = reduce(state, { type: "REVEAL_ASSIGNMENTS" });
    state = reduce(state, { type: "ADVANCE_PHASE" });

    expect(() =>
      reduce(state, {
        type: "RESOLVE_DIE",
        playerId: "player-0",
        unitId: hauler.id,
        dieId: player.dice[0].id,
        actionType: "breach" as ActionType,
        parameters: { targetType: "compartment", targetId: "c1" },
      })
    ).toThrow("Breacher");
  });

  it("rejects Heavy Haul from non-Hauler crew", () => {
    let state = setupResolve((s) => {
      const cutter = s.players["player-0"].crews["Cutter"];
      cutter.position = { x: 0, z: 0 };
    });

    const player = state.players["player-0"];
    const cutter = player.crews["Cutter"];
    player.dice[0].value = 3;

    state = reduce(state, {
      type: "ASSIGN_DIE",
      playerId: "player-0",
      dieId: player.dice[0].id,
      unitId: cutter.id,
    });

    state = reduce(state, { type: "REVEAL_ASSIGNMENTS" });
    state = reduce(state, { type: "ADVANCE_PHASE" });

    expect(() =>
      reduce(state, {
        type: "RESOLVE_DIE",
        playerId: "player-0",
        unitId: cutter.id,
        dieId: player.dice[0].id,
        actionType: "heavy-haul" as ActionType,
        parameters: {},
      })
    ).toThrow("Hauler");
  });
});

describe("haul mass cap", () => {
  it("rejects regular haul of Mass-3 salvage", () => {
    let state = setupResolve((s) => {
      const cutter = s.players["player-0"].crews["Cutter"];
      cutter.position = { x: 0, z: 0 };
      // Create a tether from cutter to Mass-3 salvage
      s.table.looseSalvage.push({
        id: "heavy-loot",
        type: "premium",
        vp: 3,
        mass: 3,
        position: { x: 2, z: 0 },
        isAttached: false,
        isFaceDown: false,
        velocity: { direction: 0, magnitude: 0 },
      });
      s.tethers.push({
        id: "t1",
        endpointA: { entityId: cutter.id },
        endpointB: { entityId: "heavy-loot" },
        length: "short",
        loadRating: 3,
        isShipGrade: false,
        state: "slack",
      });
    });

    const player = state.players["player-0"];
    const cutter = player.crews["Cutter"];
    player.dice[0].value = 1;

    state = reduce(state, {
      type: "ASSIGN_DIE",
      playerId: "player-0",
      dieId: player.dice[0].id,
      unitId: cutter.id,
    });

    state = reduce(state, { type: "REVEAL_ASSIGNMENTS" });
    state = reduce(state, { type: "ADVANCE_PHASE" });

    expect(() =>
      reduce(state, {
        type: "RESOLVE_DIE",
        playerId: "player-0",
        unitId: cutter.id,
        dieId: player.dice[0].id,
        actionType: "haul" as ActionType,
        parameters: {},
      })
    ).toThrow("Mass-3");
  });
});

describe("end-of-game lost crew", () => {
  it("marks floating untethered crew as lost at end of game", () => {
    const state = createInitialState("eog-lost", 2);
    const cutter = state.players["player-0"].crews["Cutter"];
    cutter.position = { x: 5, z: 5 }; // floating in space
    cutter.onTerrainId = undefined;
    // No tethers

    markEndOfGameLostCrew(state);
    expect(state.players["player-0"].crews["Cutter"].state).toBe("lost");
  });

  it("does not mark tethered crew as lost", () => {
    const state = createInitialState("eog-tether", 2);
    const cutter = state.players["player-0"].crews["Cutter"];
    cutter.position = { x: 5, z: 5 };
    cutter.onTerrainId = undefined;
    state.tethers.push({
      id: "t-safe",
      endpointA: { entityId: cutter.id },
      endpointB: { entityId: "wreck-0" },
      length: "medium",
      loadRating: 3,
      isShipGrade: false,
      state: "taut",
    });

    markEndOfGameLostCrew(state);
    expect(state.players["player-0"].crews["Cutter"].state).toBe("active");
  });

  it("does not mark crew on terrain as lost", () => {
    const state = createInitialState("eog-terrain", 2);
    const cutter = state.players["player-0"].crews["Cutter"];
    cutter.position = { x: 5, z: 5 };
    cutter.onTerrainId = "wreck-0";

    markEndOfGameLostCrew(state);
    expect(state.players["player-0"].crews["Cutter"].state).toBe("active");
  });

  it("does not mark embarked crew as lost", () => {
    const state = createInitialState("eog-embarked", 2);
    // All crew start embarked
    markEndOfGameLostCrew(state);
    for (const crew of Object.values(state.players["player-0"].crews)) {
      expect(crew.state).toBe("active");
    }
  });

  it("end-of-game lost crew penalizes score", () => {
    const state = createInitialState("eog-score", 2);
    state.players["player-0"].ship.hold = [{
      id: "s1", type: "wreck", vp: 2, mass: 2,
      position: "in-hold", isAttached: false, isFaceDown: false,
      velocity: { direction: 0, magnitude: 0 },
    }];
    // Put a crew floating in space
    state.players["player-0"].crews["Cutter"].position = { x: 5, z: 5 };
    state.players["player-0"].crews["Cutter"].onTerrainId = undefined;

    const scores = computeFinalScores(state);
    expect(scores["player-0"]).toBe(1); // 2 VP - 1 lost = 1
  });
});

describe("burn direction from params", () => {
  it("uses direction from parameters", () => {
    let state = setupResolve();
    const player = state.players["player-0"];
    player.dice[0].value = 3;

    state = reduce(state, {
      type: "ASSIGN_DIE",
      playerId: "player-0",
      dieId: player.dice[0].id,
      unitId: player.ship.id,
    });

    state = reduce(state, { type: "REVEAL_ASSIGNMENTS" });
    state = reduce(state, { type: "ADVANCE_PHASE" });

    const direction = Math.PI / 4; // 45 degrees
    state = reduce(state, {
      type: "RESOLVE_DIE",
      playerId: "player-0",
      unitId: player.ship.id,
      dieId: player.dice[0].id,
      actionType: "burn-small" as ActionType,
      parameters: { direction },
    });

    const vel = state.players["player-0"].ship.velocity;
    expect(vel.magnitude).toBeGreaterThan(0);
    // Direction should be approximately PI/4
    expect(Math.abs(vel.direction - direction)).toBeLessThan(0.1);
  });
});

describe("collision resolution", () => {
  it("stops ship at table edge (clamp)", () => {
    let state = createInitialState("collision", 2);
    state.players["player-0"].ship.position = { x: 17, z: 0 };
    state.players["player-0"].ship.velocity = { direction: 0, magnitude: 3 }; // Long east
    state.players["player-1"].ship.position = { x: -10, z: 0 };
    state.meta.phase = "drift";

    state = reduce(state, { type: "RUN_DRIFT" });
    // Ship should be clamped at table edge (18)
    expect(state.players["player-0"].ship.position.x).toBeLessThanOrEqual(18);
  });
});

describe("brace consumption", () => {
  it("brace absorbs a shove", () => {
    let state = setupResolve((s) => {
      // Place two rival crew adjacent
      const p0cutter = s.players["player-0"].crews["Cutter"];
      p0cutter.position = { x: 0, z: 0 };
      p0cutter.onTerrainId = undefined;
      const p1hauler = s.players["player-1"].crews["Hauler"];
      p1hauler.position = { x: 0.5, z: 0 };
      p1hauler.onTerrainId = undefined;
    });

    // Brace p1's hauler
    const p1 = state.players["player-1"];
    p1.dice[0].value = 1;
    state = reduce(state, {
      type: "ASSIGN_DIE",
      playerId: "player-1",
      dieId: p1.dice[0].id,
      unitId: p1.crews["Hauler"].id,
    });

    // Assign a shove die to p0's cutter
    const p0 = state.players["player-0"];
    p0.dice[0].value = 1;
    state = reduce(state, {
      type: "ASSIGN_DIE",
      playerId: "player-0",
      dieId: p0.dice[0].id,
      unitId: p0.crews["Cutter"].id,
    });

    state = reduce(state, { type: "REVEAL_ASSIGNMENTS" });
    state = reduce(state, { type: "ADVANCE_PHASE" });

    // Resolve brace first
    state = reduce(state, {
      type: "RESOLVE_DIE",
      playerId: "player-1",
      unitId: p1.crews["Hauler"].id,
      dieId: p1.dice[0].id,
      actionType: "brace" as ActionType,
      parameters: {},
    });

    // Now shove — should be absorbed by brace
    state = reduce(state, {
      type: "RESOLVE_DIE",
      playerId: "player-0",
      unitId: p0.crews["Cutter"].id,
      dieId: p0.dice[0].id,
      actionType: "shove" as ActionType,
      parameters: { targetId: p1.crews["Hauler"].id, direction: 0 },
    });

    // Hauler should not have gained velocity
    expect(state.players["player-1"].crews["Hauler"].velocity.magnitude).toBe(0);
    // Brace should be consumed (no longer in pending)
    expect(state.pendingActions.find((a) => a.actionType === "brace")).toBeUndefined();
  });
});

describe("self-tether", () => {
  it("creates a tether from crew harness to adjacent entity", () => {
    const state = createInitialState("self-tether", 2);
    const cutter = state.players["player-0"].crews["Cutter"];
    cutter.position = { x: 0, z: 0 };

    // Add a wreck at adjacent position
    state.table.wrecks.push({
      id: "wreck-test",
      position: { x: 0.5, z: 0 },
      shape: { type: "freighter", bounds: [], walkableSurface: [] },
      role: "mid",
      isRoleRevealed: false,
      exteriorSalvageIds: [],
      compartments: [],
    });

    resolveSelfTether(state, cutter.id, "wreck-test", "short");
    expect(state.tethers).toHaveLength(1);
    expect(state.tethers[0].endpointA.entityId).toBe(cutter.id);
  });

  it("rejects self-tether if harness already in use", () => {
    const state = createInitialState("self-tether-dup", 2);
    const cutter = state.players["player-0"].crews["Cutter"];
    cutter.position = { x: 0, z: 0 };

    state.table.wrecks.push({
      id: "wreck-a",
      position: { x: 0.5, z: 0 },
      shape: { type: "freighter", bounds: [], walkableSurface: [] },
      role: "mid",
      isRoleRevealed: false,
      exteriorSalvageIds: [],
      compartments: [],
    });

    resolveSelfTether(state, cutter.id, "wreck-a", "short");

    // Second self-tether should fail
    expect(() => resolveSelfTether(state, cutter.id, "wreck-a", "short")).toThrow("harness already in use");
  });
});

describe("scan per-player visibility", () => {
  it("adds playerId to scannedBy instead of flipping isFaceDown", () => {
    let state = setupResolve((s) => {
      s.table.looseSalvage.push({
        id: "scan-target",
        type: "wreck",
        vp: 2,
        mass: 2,
        position: { x: -10, z: 0 }, // adjacent to player-0 ship at (-10,0)
        isAttached: false,
        isFaceDown: true,
        velocity: { direction: 0, magnitude: 0 },
      });
    });

    const p0 = state.players["player-0"];
    p0.dice[0].value = 1;
    state = reduce(state, {
      type: "ASSIGN_DIE",
      playerId: "player-0",
      dieId: p0.dice[0].id,
      unitId: p0.ship.id,
    });

    state = reduce(state, { type: "REVEAL_ASSIGNMENTS" });
    state = reduce(state, { type: "ADVANCE_PHASE" });

    state = reduce(state, {
      type: "RESOLVE_DIE",
      playerId: "player-0",
      unitId: p0.ship.id,
      dieId: p0.dice[0].id,
      actionType: "scan" as ActionType,
      parameters: { targetId: "scan-target" },
    });

    const scanned = state.table.looseSalvage.find((s) => s.id === "scan-target")!;
    // isFaceDown should still be true (not globally revealed)
    expect(scanned.isFaceDown).toBe(true);
    // But scannedBy should include player-0
    expect(scanned.scannedBy).toContain("player-0");
    // And not player-1
    expect(scanned.scannedBy).not.toContain("player-1");
  });
});
