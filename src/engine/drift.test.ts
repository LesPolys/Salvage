import { describe, it, expect } from "vitest";
import { reduce, createInitialState } from "./state";
import type { GameState, Vec2 } from "./types";

function setupDriftState(overrides?: (state: GameState) => void): GameState {
  let state = createInitialState("drift-test", 2);
  state.players["player-0"].ship.position = { x: -10, z: 0 };
  state.players["player-1"].ship.position = { x: 10, z: 0 };
  state.meta.phase = "drift";

  if (overrides) overrides(state);
  return state;
}

describe("drift phase", () => {
  it("moves a ship according to its velocity", () => {
    const state = setupDriftState((s) => {
      s.players["player-0"].ship.velocity = { direction: 0, magnitude: 1 }; // Short east
    });

    const next = reduce(state, { type: "RUN_DRIFT" });
    const newPos = next.players["player-0"].ship.position;

    // Should have moved ~3 inches in x direction
    expect(newPos.x).toBeGreaterThan(state.players["player-0"].ship.position.x);
  });

  it("moves crew in space according to their velocity", () => {
    const state = setupDriftState((s) => {
      const cutter = s.players["player-0"].crews["Cutter"];
      cutter.position = { x: 0, z: 0 };
      cutter.velocity = { direction: 0, magnitude: 2 }; // Medium east
      cutter.onTerrainId = undefined;
    });

    const next = reduce(state, { type: "RUN_DRIFT" });
    const newPos = next.players["player-0"].crews["Cutter"].position as Vec2;

    expect(newPos.x).toBeGreaterThan(0);
  });

  it("marks crew as lost when they drift off table", () => {
    const state = setupDriftState((s) => {
      const cutter = s.players["player-0"].crews["Cutter"];
      cutter.position = { x: 17, z: 0 }; // Near edge
      cutter.velocity = { direction: 0, magnitude: 3 }; // Long east — will overshoot
      cutter.onTerrainId = undefined;
    });

    const next = reduce(state, { type: "RUN_DRIFT" });
    expect(next.players["player-0"].crews["Cutter"].state).toBe("lost");
  });

  it("debris drifts in rolled direction", () => {
    const state = setupDriftState((s) => {
      s.table.debris = [{
        id: "debris-0",
        position: { x: 0, z: 0 },
        velocity: { direction: 0, magnitude: 0 },
        isFaceDown: true,
      }];
    });

    const next = reduce(state, { type: "RUN_DRIFT" });
    // Debris should have moved from origin
    const debris = next.table.debris.find((d) => d.id === "debris-0");
    if (debris) {
      // It moved (or got removed if off-table, which is unlikely from center)
      const moved = debris.position.x !== 0 || debris.position.z !== 0;
      expect(moved).toBe(true);
    }
  });

  it("stationary entities don't move", () => {
    const state = setupDriftState(); // ships at rest

    const next = reduce(state, { type: "RUN_DRIFT" });
    expect(next.players["player-0"].ship.position).toEqual(state.players["player-0"].ship.position);
  });

  it("crew on ship hull moves with the ship", () => {
    const state = setupDriftState((s) => {
      s.players["player-0"].ship.velocity = { direction: 0, magnitude: 1 }; // Short east
      const cutter = s.players["player-0"].crews["Cutter"];
      cutter.position = { ...s.players["player-0"].ship.position };
      cutter.onTerrainId = s.players["player-0"].ship.id;
    });

    const next = reduce(state, { type: "RUN_DRIFT" });
    const shipPos = next.players["player-0"].ship.position;
    const crewPos = next.players["player-0"].crews["Cutter"].position as Vec2;

    // Crew should have moved with ship
    expect(crewPos.x).toBeCloseTo(shipPos.x, 0);
  });

  it("removes anchor swing temp tethers after drift", () => {
    const state = setupDriftState((s) => {
      s.tethers.push({
        id: "temp-1",
        endpointA: { entityId: "crew-player-0-Grappler" },
        endpointB: { entityId: "wreck-0" },
        length: "medium",
        loadRating: 3,
        isShipGrade: false,
        state: "taut",
        isAnchorSwingTemp: true,
      });
    });

    const next = reduce(state, { type: "RUN_DRIFT" });
    expect(next.tethers.find((t) => t.id === "temp-1")).toBeUndefined();
  });

  it("throws if not in drift phase", () => {
    const state = createInitialState("wrong", 2);
    expect(() => reduce(state, { type: "RUN_DRIFT" })).toThrow("Cannot run drift");
  });
});
