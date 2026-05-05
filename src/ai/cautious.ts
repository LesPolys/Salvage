import type { AIPlayer, Assignment, ActionDecision, ResistDecision, AIDecisionLog } from "./base";
import type { GameState, EntityId, DieValue } from "../engine/types";
import type { Vec2 } from "../engine/types";
import { RULES } from "../config/rules";
import {
  evalSalvagePiece,
  findBestSlotForDie,
  getCrewPosition,
  getPlayerShipPos,
} from "./heuristics";
import { distance, angleBetween } from "../engine/physics";

export class CautiousAI implements AIPlayer {
  personality = "cautious" as const;
  private lastLog: AIDecisionLog | null = null;

  private log(log: AIDecisionLog) { this.lastLog = log; }
  getLastDecisionLog() { return this.lastLog; }

  decideRerolls(state: GameState, playerId: string): string[] {
    const player = state.players[playerId];
    if (player.rerollsRemaining <= 0) return [];

    // Only reroll obvious mismatches (1s when we need 3+)
    const toReroll = player.dice
      .filter((d) => d.state === "rolled" && d.value === 1)
      .slice(0, player.rerollsRemaining)
      .map((d) => d.id);

    this.log({
      type: "reroll",
      candidates: player.dice.map((d) => ({ option: `${d.id}(${d.value})`, score: d.value })),
      chosen: toReroll.join(","),
      reason: "Conservative reroll — only reroll 1s",
    });

    return toReroll;
  }

  decideAssignments(state: GameState, playerId: string): Assignment[] {
    const player = state.players[playerId];
    const assignments: Assignment[] = [];

    // Cautious priorities: stow, recall, scan, defensive crew slots, burns last
    const priorities = [
      "stow", "recall", "scan",
      "hauler-generic-0", "hauler-locked",
      "cutter-generic-0", "cutter-locked",
      "breacher-generic-0", "breacher-locked",
      "grappler-generic-0", "grappler-locked",
      "launch",
      "burn-small", "burn-big", "burn-max",
    ];

    const sortedDice = [...player.dice]
      .filter((d) => d.state === "rolled")
      .sort((a, b) => a.value - b.value); // Low dice first — save high dice for resist

    for (const die of sortedDice) {
      const slot = findBestSlotForDie(state, playerId, die.value, priorities);
      if (slot) {
        assignments.push({ dieId: die.id, unitId: slot.unitId });
        markSlotTaken(state, playerId, slot.unitId);
      }
    }

    this.log({
      type: "assign",
      candidates: assignments.map((a) => ({ option: `${a.dieId}→${a.unitId}`, score: 1 })),
      chosen: `${assignments.length} assignments`,
      reason: "Prioritize stow/recall/scan, save high dice for resist",
    });

    return assignments;
  }

  decideActivation(state: GameState, playerId: string): EntityId {
    const player = state.players[playerId];

    // Activate ship first (stow/recall are valuable and safe)
    if (player.ship.dicePool.length > 0) {
      return player.ship.id;
    }

    // Then hauler (closest to ship duties)
    for (const role of ["Hauler", "Cutter", "Breacher", "Grappler"]) {
      const crew = player.crews[role];
      if (crew && crew.state !== "lost" && crew.dicePool.length > 0) {
        return crew.id;
      }
    }

    return player.ship.id;
  }

  decideAction(
    state: GameState,
    playerId: string,
    unitId: EntityId,
    _dieId: string,
    dieValue: DieValue
  ): ActionDecision {
    const player = state.players[playerId];

    if (player.ship.id === unitId) {
      return this.decideShipAction(state, playerId, dieValue);
    }

    return this.decideCrewAction(state, playerId, unitId, dieValue);
  }

  private decideShipAction(state: GameState, playerId: string, dieValue: DieValue): ActionDecision {
    const player = state.players[playerId];

    // Stow if salvage nearby
    const nearbySalvage = state.table.looseSalvage.find(
      (s) =>
        typeof s.position === "object" &&
        !s.isAttached &&
        distance(s.position as Vec2, player.ship.position) <=
          RULES.adjacency.distance + RULES.ship.baseSize.z / 2
    );
    if (nearbySalvage && player.ship.holdMass + nearbySalvage.mass <= RULES.ship.holdCapacity) {
      return { actionType: "stow", parameters: { salvageId: nearbySalvage.id, ejectIds: [] } };
    }

    // Scan
    if (dieValue >= 1) {
      const target = this.findScanTarget(state, playerId);
      if (target) return { actionType: "scan", parameters: { targetId: target } };
    }

    // Conservative burn toward nearest salvage cluster
    if (dieValue >= 3) {
      return { actionType: "burn-small", parameters: { direction: this.getSafeBurnDirection(state, playerId) } };
    }

    // Launch only if all salvage is far
    const embarked = Object.values(player.crews).find(
      (c) => c.position === "embarked" && c.state === "active"
    );
    if (embarked) {
      return {
        actionType: "launch",
        parameters: { crewId: embarked.id, direction: this.getSafeBurnDirection(state, playerId) },
      };
    }

    return { actionType: "scan", parameters: { targetId: "" } };
  }

  private decideCrewAction(state: GameState, playerId: string, crewId: EntityId, dieValue: DieValue): ActionDecision {
    const player = state.players[playerId];
    const crew = Object.values(player.crews).find((c) => c.id === crewId);
    if (!crew) return { actionType: "brace", parameters: {} };

    const crewPos = getCrewPosition(crew);
    if (!crewPos) return { actionType: "brace", parameters: {} };

    // If on own ship hull, embark if threatened
    if (crew.onTerrainId === player.ship.id) {
      const rivalNearby = this.isRivalNearby(state, playerId, crewPos, 8);
      if (rivalNearby) {
        return { actionType: "embark", parameters: {} };
      }
    }

    // Hauler: haul salvage home
    if (crew.role === "Hauler" && crew.carrying.length > 0) {
      // Head toward ship
      const dir = angleBetween(crewPos, player.ship.position);
      if (crew.onTerrainId && dieValue >= 2) {
        return { actionType: "push-off", parameters: { direction: dir } };
      }
      if (dieValue >= 4) {
        return { actionType: "thruster-burn", parameters: { direction: dir } };
      }
    }

    // Cutter: cut nearby salvage
    if (crew.role === "Cutter" && dieValue >= 3) {
      const target = this.findNearbyCutTarget(state, crewPos);
      if (target) {
        return { actionType: "cut", parameters: { targetType: "salvage", targetId: target } };
      }
    }

    // On terrain: crawl toward useful position
    if (crew.onTerrainId) {
      return { actionType: "crawl", parameters: { destination: crewPos } };
    }

    // Default: brace (defensive)
    return { actionType: "brace", parameters: {} };
  }

  decideResist(
    state: GameState,
    playerId: string,
    targetCrewId: EntityId,
    attackerDieValue: DieValue
  ): ResistDecision {
    // Cautious resists almost always
    const player = state.players[playerId];
    const crew = Object.values(player.crews).find((c) => c.id === targetCrewId);
    if (!crew) return { resist: false };

    const eligibleDice = crew.dicePool
      .map((dieId) => player.dice.find((d) => d.id === dieId))
      .filter((d) => d && d.state === "assigned" && d.value > attackerDieValue);

    if (eligibleDice.length > 0) {
      // Use lowest qualifying die
      const best = eligibleDice.sort((a, b) => a!.value - b!.value)[0]!;
      return { resist: true, dieId: best.id };
    }

    return { resist: false };
  }

  private getSafeBurnDirection(state: GameState, playerId: string): number {
    const shipPos = getPlayerShipPos(state, playerId);
    // Burn toward nearest safe salvage (close, low contest)
    let bestTarget: { pos: Vec2; score: number } | null = null;
    for (const salvage of state.table.looseSalvage) {
      if (typeof salvage.position !== "object" || salvage.isAttached) continue;
      const score = evalSalvagePiece(state, salvage, playerId);
      const dist = distance(shipPos, salvage.position as Vec2);
      const safeScore = score - dist * 0.1; // Prefer closer
      if (!bestTarget || safeScore > bestTarget.score) {
        bestTarget = { pos: salvage.position as Vec2, score: safeScore };
      }
    }
    if (bestTarget) return angleBetween(shipPos, bestTarget.pos);
    return 0;
  }

  private findScanTarget(state: GameState, playerId: string): string | null {
    const shipPos = getPlayerShipPos(state, playerId);
    for (const salvage of state.table.looseSalvage) {
      if (salvage.isFaceDown && typeof salvage.position === "object") {
        if (distance(shipPos, salvage.position as Vec2) <= RULES.scan.range) {
          return salvage.id;
        }
      }
    }
    return null;
  }

  private findNearbyCutTarget(state: GameState, crewPos: Vec2): string | null {
    for (const salvage of state.table.looseSalvage) {
      if (!salvage.isAttached) continue;
      const wreck = state.table.wrecks.find((w) => w.id === salvage.containerId);
      if (wreck && distance(crewPos, wreck.position) <= RULES.adjacency.distance + 3) {
        return salvage.id;
      }
    }
    return null;
  }

  private isRivalNearby(state: GameState, playerId: string, pos: Vec2, range: number): boolean {
    for (const p of Object.values(state.players)) {
      if (p.id === playerId) continue;
      for (const crew of Object.values(p.crews)) {
        if (crew.position === "embarked" || crew.state === "lost") continue;
        if (distance(pos, crew.position as Vec2) <= range) return true;
      }
    }
    return false;
  }
}

function markSlotTaken(state: GameState, playerId: string, unitId: EntityId): void {
  const player = state.players[playerId];
  if (player.ship.id === unitId) {
    player.ship.dicePool.push("pending");
  } else {
    for (const crew of Object.values(player.crews)) {
      if (crew.id === unitId) {
        crew.dicePool.push("pending");
        break;
      }
    }
  }
}
