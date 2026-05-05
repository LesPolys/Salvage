import { describe, it, expect } from "vitest";
import { runSimulation, runBatchSimulation } from "./headless";

describe("headless simulation", () => {
  it("completes a 2-player game", () => {
    const result = runSimulation({
      seed: "test-2p",
      playerCount: 2,
      personalities: ["aggressive", "cautious"],
    });

    expect(result.finalState.meta.phase).toBe("gameover");
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.summary.playerCount).toBe(2);
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it("completes a 4-player game", () => {
    const result = runSimulation({
      seed: "test-4p",
      playerCount: 4,
      personalities: ["aggressive", "cautious", "opportunistic", "aggressive"],
    });

    expect(result.finalState.meta.phase).toBe("gameover");
    expect(result.summary.playerCount).toBe(4);
  });

  it("is deterministic with same seed", () => {
    const r1 = runSimulation({
      seed: "determinism",
      playerCount: 2,
      personalities: ["aggressive", "cautious"],
    });
    const r2 = runSimulation({
      seed: "determinism",
      playerCount: 2,
      personalities: ["aggressive", "cautious"],
    });

    expect(r1.summary.finalScores).toEqual(r2.summary.finalScores);
    expect(r1.actions.length).toBe(r2.actions.length);
  });

  it("runs a small batch simulation", () => {
    const result = runBatchSimulation({
      games: 3,
      playerCount: 2,
      personalities: ["aggressive", "cautious"],
      baseSeed: "batch",
    });

    expect(result.results).toHaveLength(3);
    expect(result.totalDurationMs).toBeGreaterThan(0);
    expect(Object.keys(result.winCounts).length).toBeGreaterThan(0);
  });
});
