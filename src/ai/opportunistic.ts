import type { AIPlayer, Assignment, ActionDecision, ResistDecision, AIDecisionLog } from "./base";
import type { GameState, EntityId, DieValue } from "../engine/types";
import type { Vec2 } from "../engine/types";
import { RULES } from "../config/rules";
import {
  evalSalvagePiece,
  findBestSlotForDie,
  getCrewPosition,
  getPlayerShipPos,
  getScoreGap,
} from "./heuristics";
import { distance, angleBetween } from "../engine/physics";

export class OpportunisticAI implements AIPlayer {
  personality = "opportunistic" as const;
  private lastLog: AIDecisionLog | null = null;

  private log(log: AIDecisionLog) { this.lastLog = log; }
  getLastDecisionLog() { return this.lastLog; }

  decideRerolls(state: GameState, playerId: string): string[] {
    const player = state.players[playerId];
    if (player.rerollsRemaining <= 0) return [];

    const gap = getScoreGap(state, playerId);

    // Behind: aggressive rerolls (1s, 2s). Ahead: conservative (only 1s)
    const threshold = gap < 0 ? 2 : 1;
    const toReroll = player.dice
      .filter((d) => d.state === "rolled" && d.value <= threshold)
      .slice(0, player.rerollsRemaining)
      .map((d) => d.id);

    this.log({
      type: "reroll",
      candidates: player.dice.map((d) => ({ option: `${d.id}(${d.value})`, score: d.value })),
      chosen: toReroll.join(","),
      reason: gap < 0 ? "Behind — aggressive rerolls" : "Ahead — conservative rerolls",
    });

    return toReroll;
  }

  decideAssignments(state: GameState, playerId: string): Assignment[] {
    const player = state.players[playerId];
    const assignments: Assignment[] = [];
    const gap = getScoreGap(state, playerId);
    const roundsLeft = RULES.rounds.total - state.meta.round;

    // Dynamic priorities based on game state
    let priorities: string[];
    if (gap < -2 && roundsLeft <= 2) {
      // Desperate: go aggressive
      priorities = [
        "grappler-locked", "breacher-locked",
        "burn-big", "burn-max", "launch",
        "cutter-locked", "grappler-generic-0",
        "burn-small", "stow", "scan",
      ];
    } else if (gap > 2) {
      // Winning: play safe
      priorities = [
        "stow", "recall", "scan",
        "hauler-generic-0", "cutter-generic-0",
        "burn-small", "launch",
        "breacher-generic-0", "grappler-generic-0",
      ];
    } else {
      // Balanced: efficient play
      priorities = [
        "stow", "launch", "burn-small",
        "cutter-locked", "grappler-locked",
        "hauler-generic-0", "scan",
        "burn-big", "recall",
        "breacher-locked",
      ];
    }

    // Mix of value-sorted dice
    const sortedDice = [...player.dice]
      .filter((d) => d.state === "rolled")
      .sort((a, b) => b.value - a.value);

    for (const die of sortedDice) {
      const slot = findBestSlotForDie(state, playerId, die.value, priorities);
      if (slot) {
        assignments.push({ dieId: die.id, unitId: slot.unitId, slotId: slot.slotId });
        markSlotTaken(state, playerId, slot.unitId, slot.slotId);
      }
    }

    this.log({
      type: "assign",
      candidates: assignments.map((a) => ({ option: `${a.dieId}→${a.slotId}`, score: 1 })),
      chosen: `${assignments.length} assignments`,
      reason: `Gap=${gap}, rounds left=${roundsLeft}`,
    });

    return assignments;
  }

  decideActivation(state: GameState, playerId: string): EntityId {
    const player = state.players[playerId];
    const gap = getScoreGap(state, playerId);

    // If winning: activate ship first (safe stow/recall)
    // If losing: activate crew first (aggressive plays)
    if (gap >= 0) {
      if (player.ship.slots.some((s) => s.assignedDieId)) return player.ship.id;
    }

    // Find crew with best opportunity
    let bestUnit: EntityId = player.ship.id;
    let bestScore = -Infinity;

    for (const crew of Object.values(player.crews)) {
      if (crew.state === "lost") continue;
      const diceCount = crew.slots.filter((s) => s.assignedDieId).length;
      if (diceCount === 0) continue;

      let score = diceCount;
      if (crew.role === "Grappler") score += 2; // High impact
      if (crew.role === "Cutter") score += 1.5;
      if (crew.carrying.length > 0) score += 1; // Get cargo home

      if (score > bestScore) {
        bestScore = score;
        bestUnit = crew.id;
      }
    }

    if (bestScore <= 0 && player.ship.slots.some((s) => s.assignedDieId)) {
      return player.ship.id;
    }

    return bestUnit;
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

    // Stow if possible
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

    // Burn toward best opportunity
    if (dieValue >= 5) {
      return { actionType: "burn-big", parameters: { direction: this.getSmartBurnDirection(state, playerId) } };
    }
    if (dieValue >= 3) {
      return { actionType: "burn-small", parameters: { direction: this.getSmartBurnDirection(state, playerId) } };
    }

    // Launch
    const embarked = Object.values(player.crews).find(
      (c) => c.position === "embarked" && c.state === "active"
    );
    if (embarked) {
      return {
        actionType: "launch",
        parameters: { crewId: embarked.id, direction: this.getSmartBurnDirection(state, playerId) },
      };
    }

    return { actionType: "scan", parameters: { targetId: this.findScanTarget(state, playerId) ?? "" } };
  }

  private decideCrewAction(state: GameState, playerId: string, crewId: EntityId, dieValue: DieValue): ActionDecision {
    const player = state.players[playerId];
    const crew = Object.values(player.crews).find((c) => c.id === crewId);
    if (!crew) return { actionType: "brace", parameters: {} };

    const crewPos = getCrewPosition(crew);
    if (!crewPos) return { actionType: "brace", parameters: {} };

    const gap = getScoreGap(state, playerId);

    // Winning and on own ship: embark for safety
    if (gap > 3 && crew.onTerrainId === player.ship.id) {
      return { actionType: "embark", parameters: {} };
    }

    // Losing: aggressive plays
    if (gap < -2) {
      if (crew.role === "Grappler" && dieValue >= 3) {
        const target = this.findBestGrappleTarget(state, playerId, crewPos);
        if (target) return { actionType: "grapple", parameters: { targetId: target.id, mode: target.mode } };
      }
      if (crew.role === "Breacher" && dieValue >= 5) {
        const target = this.findBreachTarget(state, playerId, crewPos);
        if (target) return { actionType: "breach", parameters: target };
      }
    }

    // Standard: cut available salvage
    if (crew.role === "Cutter" && dieValue >= 3) {
      const target = this.findCutTarget(state, crewPos);
      if (target) return { actionType: "cut", parameters: { targetType: "salvage", targetId: target } };
    }

    // Move toward ship if carrying
    if (crew.carrying.length > 0) {
      const dir = angleBetween(crewPos, player.ship.position);
      if (crew.onTerrainId && dieValue >= 2) return { actionType: "push-off", parameters: { direction: dir } };
      if (dieValue >= 4) return { actionType: "thruster-burn", parameters: { direction: dir } };
    }

    // Push off / thruster toward best target
    if (crew.onTerrainId && dieValue >= 2) {
      return { actionType: "push-off", parameters: { direction: this.getCrewDirection(state, playerId, crewPos) } };
    }
    if (dieValue >= 4) {
      return { actionType: "thruster-burn", parameters: { direction: this.getCrewDirection(state, playerId, crewPos) } };
    }

    if (crew.onTerrainId) {
      return { actionType: "crawl", parameters: { destination: crewPos } };
    }

    return { actionType: "brace", parameters: {} };
  }

  decideResist(
    state: GameState,
    playerId: string,
    targetCrewId: EntityId,
    attackerDieValue: DieValue
  ): ResistDecision {
    // Efficient resist: only spend if the expected value is good
    const player = state.players[playerId];
    const crew = Object.values(player.crews).find((c) => c.id === targetCrewId);
    if (!crew) return { resist: false };

    const eligibleDice = crew.slots
      .filter((s) => s.assignedDieId)
      .map((s) => player.dice.find((d) => d.id === s.assignedDieId))
      .filter((d) => d && d.state === "assigned" && d.value > attackerDieValue);

    if (eligibleDice.length === 0) return { resist: false };

    // Only resist if carrying valuable cargo or crew is crucial
    const isValuable = crew.carrying.length > 0 ||
      crew.role === "Cutter" || crew.role === "Grappler";

    if (isValuable) {
      const best = eligibleDice.sort((a, b) => a!.value - b!.value)[0]!;
      return { resist: true, dieId: best.id };
    }

    return { resist: false };
  }

  private getSmartBurnDirection(state: GameState, playerId: string): number {
    const shipPos = getPlayerShipPos(state, playerId);
    const gap = getScoreGap(state, playerId);

    // Behind: target richest unclaimed area
    // Ahead: move toward own crew with cargo
    let bestAngle = 0;
    let bestScore = -Infinity;

    for (const salvage of state.table.looseSalvage) {
      if (typeof salvage.position !== "object" || salvage.isAttached) continue;
      let score = evalSalvagePiece(state, salvage, playerId);
      if (gap < 0) score *= 1.5; // More aggressive when behind
      if (score > bestScore) {
        bestScore = score;
        bestAngle = angleBetween(shipPos, salvage.position as Vec2);
      }
    }

    return bestAngle;
  }

  private getCrewDirection(state: GameState, _playerId: string, from: Vec2): number {
    // Head toward nearest valuable target
    let bestAngle = 0;
    let bestScore = -Infinity;

    for (const salvage of state.table.looseSalvage) {
      if (typeof salvage.position !== "object" || salvage.isAttached) continue;
      const pos = salvage.position as Vec2;
      const dist = distance(from, pos);
      const score = salvage.vp / Math.max(1, dist * 0.3);
      if (score > bestScore) {
        bestScore = score;
        bestAngle = angleBetween(from, pos);
      }
    }

    return bestAngle;
  }

  private findBestGrappleTarget(state: GameState, playerId: string, crewPos: Vec2): { id: string; mode: string } | null {
    // Prefer yanking rival crew carrying cargo, else reel to salvage
    for (const p of Object.values(state.players)) {
      if (p.id === playerId) continue;
      for (const crew of Object.values(p.crews)) {
        if (crew.position === "embarked" || crew.state === "lost") continue;
        if (crew.carrying.length === 0) continue;
        const pos = crew.position as Vec2;
        if (distance(crewPos, pos) <= RULES.grapple.range) {
          return { id: crew.id, mode: "yank" };
        }
      }
    }

    for (const salvage of state.table.looseSalvage) {
      if (typeof salvage.position !== "object" || salvage.isAttached) continue;
      if (distance(crewPos, salvage.position as Vec2) <= RULES.grapple.range) {
        return { id: salvage.id, mode: "reel-in" };
      }
    }

    return null;
  }

  private findBreachTarget(state: GameState, _playerId: string, crewPos: Vec2): Record<string, unknown> | null {
    // Breach rival ship if adjacent
    for (const p of Object.values(state.players)) {
      if (p.id === _playerId) continue;
      if (p.ship.hold.length > 0 && distance(crewPos, p.ship.position) <= RULES.adjacency.distance + RULES.ship.baseSize.z / 2) {
        return { targetType: "ship", targetId: p.ship.id };
      }
    }

    // Breach wreck compartments
    for (const wreck of state.table.wrecks) {
      for (const comp of wreck.compartments) {
        if (!comp.isSealed) continue;
        if (distance(crewPos, wreck.position) <= RULES.adjacency.distance + 2) {
          return { targetType: "compartment", targetId: comp.id };
        }
      }
    }

    return null;
  }

  private findCutTarget(state: GameState, crewPos: Vec2): string | null {
    for (const salvage of state.table.looseSalvage) {
      if (!salvage.isAttached) continue;
      const wreck = state.table.wrecks.find((w) => w.id === salvage.containerId);
      if (wreck && distance(crewPos, wreck.position) <= RULES.adjacency.distance + 3) {
        return salvage.id;
      }
    }
    return null;
  }

  private findScanTarget(state: GameState, playerId: string): string | null {
    const shipPos = getPlayerShipPos(state, playerId);
    for (const salvage of state.table.looseSalvage) {
      if (salvage.isFaceDown && typeof salvage.position === "object") {
        if (distance(shipPos, salvage.position as Vec2) <= RULES.scan.range) return salvage.id;
      }
    }
    return null;
  }
}

function markSlotTaken(state: GameState, playerId: string, unitId: EntityId, slotId: string): void {
  const player = state.players[playerId];
  if (player.ship.id === unitId) {
    const slot = player.ship.slots.find((s) => s.id === slotId);
    if (slot) slot.assignedDieId = "pending";
  } else {
    for (const crew of Object.values(player.crews)) {
      if (crew.id === unitId) {
        const slot = crew.slots.find((s) => s.id === slotId);
        if (slot) slot.assignedDieId = "pending";
        break;
      }
    }
  }
}
