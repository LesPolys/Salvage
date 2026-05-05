import { describe, it, expect } from "vitest";
import {
  vec2,
  add,
  sub,
  scale,
  normalize,
  length,
  distance,
  isAdjacent,
  addVelocities,
  makeVelocity,
  burnPenaltySteps,
  dropSpeedTier,
  isOnTable,
  pointToSegmentDistance,
} from "./physics";

describe("Vec2 operations", () => {
  it("adds vectors", () => {
    expect(add(vec2(1, 2), vec2(3, 4))).toEqual({ x: 4, z: 6 });
  });

  it("subtracts vectors", () => {
    expect(sub(vec2(5, 7), vec2(2, 3))).toEqual({ x: 3, z: 4 });
  });

  it("scales vectors", () => {
    expect(scale(vec2(3, 4), 2)).toEqual({ x: 6, z: 8 });
  });

  it("computes length", () => {
    expect(length(vec2(3, 4))).toBeCloseTo(5);
  });

  it("computes distance", () => {
    expect(distance(vec2(0, 0), vec2(3, 4))).toBeCloseTo(5);
  });

  it("normalizes vectors", () => {
    const n = normalize(vec2(3, 4));
    expect(length(n)).toBeCloseTo(1);
  });

  it("normalizes zero vector to zero", () => {
    const n = normalize(vec2(0, 0));
    expect(n).toEqual({ x: 0, z: 0 });
  });
});

describe("adjacency", () => {
  it("objects within 1 inch are adjacent", () => {
    expect(isAdjacent(vec2(0, 0), vec2(0.5, 0.5))).toBe(true);
  });

  it("objects beyond 1 inch are not adjacent", () => {
    expect(isAdjacent(vec2(0, 0), vec2(2, 0))).toBe(false);
  });
});

describe("velocity operations", () => {
  it("adds velocities via vector add", () => {
    const v1 = makeVelocity(0, 1); // Short east
    const v2 = makeVelocity(0, 1); // Short east
    const sum = addVelocities(v1, v2);
    expect(sum.magnitude).toBe(2); // Medium
  });

  it("caps velocity at Long", () => {
    const v1 = makeVelocity(0, 3); // Long east
    const v2 = makeVelocity(0, 2); // Medium east
    const sum = addVelocities(v1, v2);
    expect(sum.magnitude).toBeLessThanOrEqual(3);
  });

  it("opposing velocities cancel out", () => {
    const v1 = makeVelocity(0, 1);        // Short east
    const v2 = makeVelocity(Math.PI, 1);  // Short west
    const sum = addVelocities(v1, v2);
    expect(sum.magnitude).toBe(0);
  });
});

describe("burn penalty", () => {
  it("no penalty for light cargo", () => {
    expect(burnPenaltySteps(0)).toBe(0);
    expect(burnPenaltySteps(2)).toBe(0);
  });

  it("1 step penalty at 3-5 mass", () => {
    expect(burnPenaltySteps(3)).toBe(1);
    expect(burnPenaltySteps(5)).toBe(1);
  });

  it("2 step penalty at 6 mass", () => {
    expect(burnPenaltySteps(6)).toBe(2);
  });

  it("dropSpeedTier works correctly", () => {
    expect(dropSpeedTier(3, 1)).toBe(2);
    expect(dropSpeedTier(2, 2)).toBe(0);
    expect(dropSpeedTier(1, 3)).toBe(0); // can't go below 0
  });
});

describe("table bounds", () => {
  it("center is on table", () => {
    expect(isOnTable(vec2(0, 0))).toBe(true);
  });

  it("edge is on table", () => {
    expect(isOnTable(vec2(18, 18))).toBe(true);
  });

  it("beyond edge is off table", () => {
    expect(isOnTable(vec2(19, 0))).toBe(false);
  });
});

describe("pointToSegmentDistance", () => {
  it("computes distance to segment midpoint", () => {
    const dist = pointToSegmentDistance(vec2(0, 1), vec2(-1, 0), vec2(1, 0));
    expect(dist).toBeCloseTo(1);
  });

  it("computes distance to segment endpoint", () => {
    const dist = pointToSegmentDistance(vec2(2, 0), vec2(0, 0), vec2(1, 0));
    expect(dist).toBeCloseTo(1);
  });
});
