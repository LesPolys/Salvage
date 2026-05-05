import { describe, it, expect } from "vitest";
import { setupGame } from "./setup";
import { RULES } from "../config/rules";

describe("setupGame", () => {
  it("creates a valid 4-player game", () => {
    const state = setupGame("test-4p", 4);
    expect(Object.keys(state.players)).toHaveLength(4);
    expect(state.table.wrecks).toHaveLength(4);
    expect(state.table.debris).toHaveLength(RULES.setup.debrisCount);
  });

  it("creates a valid 2-player game", () => {
    const state = setupGame("test-2p", 2);
    expect(Object.keys(state.players)).toHaveLength(2);
    expect(state.table.wrecks).toHaveLength(3);
  });

  it("creates a valid 3-player game", () => {
    const state = setupGame("test-3p", 3);
    expect(Object.keys(state.players)).toHaveLength(3);
    expect(state.table.wrecks).toHaveLength(3);
  });

  it("assigns correct wreck roles for 4 players", () => {
    const state = setupGame("roles-4p", 4);
    const roles = state.table.wrecks.map((w) => w.role);
    expect(roles.filter((r) => r === "jackpot")).toHaveLength(1);
    expect(roles.filter((r) => r === "mid")).toHaveLength(2);
    expect(roles.filter((r) => r === "bait")).toHaveLength(1);
  });

  it("populates wreck salvage correctly", () => {
    const state = setupGame("salvage-pop", 4);
    for (const wreck of state.table.wrecks) {
      // Each wreck should have 3 exterior salvage
      expect(wreck.exteriorSalvageIds).toHaveLength(3);
      // Each wreck should have 2 compartments
      expect(wreck.compartments).toHaveLength(2);
    }
  });

  it("jackpot wreck has 2 premium in compartments", () => {
    const state = setupGame("jackpot-check", 4);
    const jackpot = state.table.wrecks.find((w) => w.role === "jackpot")!;
    const compartmentSalvageIds = jackpot.compartments
      .map((c) => c.contentSalvageId)
      .filter(Boolean);
    expect(compartmentSalvageIds).toHaveLength(2);

    for (const sid of compartmentSalvageIds) {
      const salvage = state.table.looseSalvage.find((s) => s.id === sid);
      expect(salvage).toBeDefined();
      expect(salvage!.type).toBe("premium");
    }
  });

  it("bait wreck has empty compartments", () => {
    const state = setupGame("bait-check", 4);
    const bait = state.table.wrecks.find((w) => w.role === "bait")!;
    for (const comp of bait.compartments) {
      expect(comp.contentSalvageId).toBeUndefined();
    }
  });

  it("wrecks are spaced at least 8 inches apart", () => {
    const state = setupGame("spacing", 4);
    for (let i = 0; i < state.table.wrecks.length; i++) {
      for (let j = i + 1; j < state.table.wrecks.length; j++) {
        const dx = state.table.wrecks[i].position.x - state.table.wrecks[j].position.x;
        const dz = state.table.wrecks[i].position.z - state.table.wrecks[j].position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        expect(dist).toBeGreaterThanOrEqual(RULES.table.minWreckSpacing);
      }
    }
  });

  it("ships start unplaced during deploy phase", () => {
    const state = setupGame("ship-edges", 4);
    for (const player of Object.values(state.players)) {
      expect(player.ship.placed).toBe(false);
    }
  });

  it("is deterministic with same seed", () => {
    const s1 = setupGame("determinism", 4);
    const s2 = setupGame("determinism", 4);

    expect(s1.table.wrecks.map((w) => w.position)).toEqual(
      s2.table.wrecks.map((w) => w.position)
    );
    expect(s1.table.wrecks.map((w) => w.role)).toEqual(
      s2.table.wrecks.map((w) => w.role)
    );
  });

  it("throws for invalid player count", () => {
    expect(() => setupGame("err", 1)).toThrow();
    expect(() => setupGame("err", 5)).toThrow();
  });

  it("applies player names and AI config", () => {
    const state = setupGame("names", 2, ["Alice", "Bob"], [
      { isAI: false },
      { isAI: true, personality: "aggressive" },
    ]);
    expect(state.players["player-0"].name).toBe("Alice");
    expect(state.players["player-1"].name).toBe("Bob");
    expect(state.players["player-1"].isAI).toBe(true);
    expect(state.players["player-1"].aiPersonality).toBe("aggressive");
  });
});
