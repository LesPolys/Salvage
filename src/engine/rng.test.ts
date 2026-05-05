import { describe, it, expect } from "vitest";
import { RNG } from "./rng";

describe("RNG", () => {
  it("produces reproducible sequences from the same seed", () => {
    const rng1 = new RNG("test-seed");
    const rng2 = new RNG("test-seed");

    const seq1 = Array.from({ length: 20 }, () => rng1.next());
    const seq2 = Array.from({ length: 20 }, () => rng2.next());

    expect(seq1).toEqual(seq2);
  });

  it("produces different sequences from different seeds", () => {
    const rng1 = new RNG("seed-a");
    const rng2 = new RNG("seed-b");

    const seq1 = Array.from({ length: 10 }, () => rng1.next());
    const seq2 = Array.from({ length: 10 }, () => rng2.next());

    expect(seq1).not.toEqual(seq2);
  });

  it("generates values in [0, 1)", () => {
    const rng = new RNG("bounds-test");
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("rollD6 returns values 1-6", () => {
    const rng = new RNG("d6-test");
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = rng.rollD6();
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    // With 1000 rolls, we should see all 6 values
    expect(seen.size).toBe(6);
  });

  it("rollDice returns the correct count", () => {
    const rng = new RNG("multi-roll");
    const results = rng.rollDice(5);
    expect(results).toHaveLength(5);
    for (const v of results) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
    }
  });

  it("shuffle is deterministic with same seed", () => {
    const arr1 = [1, 2, 3, 4, 5, 6, 7, 8];
    const arr2 = [1, 2, 3, 4, 5, 6, 7, 8];

    new RNG("shuffle-seed").shuffle(arr1);
    new RNG("shuffle-seed").shuffle(arr2);

    expect(arr1).toEqual(arr2);
  });

  it("can serialize and restore state", () => {
    const rng1 = new RNG("serialize-test");
    // Advance the state a bit
    for (let i = 0; i < 10; i++) rng1.next();

    const savedState = rng1.getState();
    const rng2 = RNG.fromState(savedState);

    const seq1 = Array.from({ length: 10 }, () => rng1.next());
    const seq2 = Array.from({ length: 10 }, () => rng2.next());

    expect(seq1).toEqual(seq2);
  });

  it("rollDirection returns valid directions", () => {
    const rng = new RNG("direction-test");
    const validDirs = new Set(["N", "NE", "SE", "S", "SW", "NW"]);
    for (let i = 0; i < 100; i++) {
      expect(validDirs.has(rng.rollDirection())).toBe(true);
    }
  });
});
