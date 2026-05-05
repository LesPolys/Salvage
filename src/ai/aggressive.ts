import type { AIPlayer, Assignment, ActionDecision, ResistDecision, AIDecisionLog } from "./base";
import type { GameState, EntityId, DieValue, Vec2 } from "../engine/types";
import { RULES } from "../config/rules";
import {
  evalSalvagePiece,
  findBestSlotForDie,
  getCrewPosition,
  getPlayerShipPos,
} from "./heuristics";
import { distance, angleBetween } from "../engine/physics";

export class AggressiveAI implements AIPlayer {
  personality = "aggressive" as const;
  private lastLog: AIDecisionLog | null = null;

  private log(log: AIDecisionLog) { this.lastLog = log; }
  getLastDecisionLog() { return this.lastLog; }

  decideRerolls(state: GameState, playerId: string): string[] {
    const player = state.players[playerId];
    if (player.rerollsRemaining <= 0) return [];

    // Reroll all 1s and 2s — want high dice for disruption
    const toReroll = player.dice
      .filter((d) => d.state === "rolled" && d.value <= 2)
      .slice(0, player.rerollsRemaining)
      .map((d) => d.id);

    this.log({
      type: "reroll",
      candidates: player.dice.map((d) => ({ option: `${d.id}(${d.value})`, score: d.value })),
      chosen: toReroll.join(","),
      reason: "Reroll low dice for disruption potential",
    });

    return toReroll;
  }

  decideAssignments(state: GameState, playerId: string): Assignment[] {
    const player = state.players[playerId];
    const assignments: Assignment[] = [];

    // Priority order for aggressive: launch crew, burns, tackle/shove slots, cut, grapple
    const priorities = [
      "launch", "burn-small", "burn-big", "burn-max",
      "grappler-locked", "cutter-locked",
      "grappler-generic-0", "cutter-generic-0",
      "breacher-locked", "hauler-locked",
      "breacher-generic-0", "hauler-generic-0",
      "scan", "stow", "recall",
    ];

    // Sort dice by value descending — put best dice on most important slots
    const sortedDice = [...player.dice]
      .filter((d) => d.state === "rolled")
      .sort((a, b) => b.value - a.value);

    for (const die of sortedDice) {
      const slot = findBestSlotForDie(state, playerId, die.value, priorities);
      if (slot) {
        assignments.push({ dieId: die.id, unitId: slot.unitId, slotId: slot.slotId });
        // Mark slot as taken (mutating local search state)
        markSlotTaken(state, playerId, slot.unitId, slot.slotId);
      }
    }

    this.log({
      type: "assign",
      candidates: assignments.map((a) => ({ option: `${a.dieId}→${a.slotId}`, score: 1 })),
      chosen: `${assignments.length} assignments`,
      reason: "Prioritize launch, burns, and disruption slots",
    });

    return assignments;
  }

  decideActivation(state: GameState, playerId: string): EntityId {
    const player = state.players[playerId];

    // Activate the unit with the most dice first (maximize impact per activation)
    let bestUnit: EntityId = player.ship.id;
    let bestCount = player.ship.slots.filter((s) => s.assignedDieId).length;

    for (const crew of Object.values(player.crews)) {
      if (crew.state === "lost") continue;
      const count = crew.slots.filter((s) => s.assignedDieId).length;
      if (count > bestCount) {
        bestCount = count;
        bestUnit = crew.id;
      }
    }

    this.log({
      type: "activation",
      candidates: [{ option: bestUnit, score: bestCount }],
      chosen: bestUnit,
      reason: "Activate unit with most dice",
    });

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

    // Ship actions
    if (player.ship.id === unitId) {
      return this.decideShipAction(state, playerId, dieValue);
    }

    // Crew actions
    return this.decideCrewAction(state, playerId, unitId, dieValue);
  }

  private decideShipAction(state: GameState, playerId: string, dieValue: DieValue): ActionDecision {
    const player = state.players[playerId];

    // Aggressive: burn toward nearest unclaimed salvage or rival
    if (dieValue >= 5) {
      return { actionType: "burn-big", parameters: { direction: this.getBurnDirection(state, playerId) } };
    }
    if (dieValue >= 3) {
      return { actionType: "burn-small", parameters: { direction: this.getBurnDirection(state, playerId) } };
    }

    // Launch crew if any embarked
    const embarked = Object.values(player.crews).find(
      (c) => c.position === "embarked" && c.state === "active"
    );
    if (embarked) {
      return {
        actionType: "launch",
        parameters: { crewId: embarked.id, direction: this.getBurnDirection(state, playerId) },
      };
    }

    return { actionType: "scan", parameters: { targetId: this.findScanTarget(state, playerId) } };
  }

  private decideCrewAction(state: GameState, playerId: string, crewId: EntityId, dieValue: DieValue): ActionDecision {
    const player = state.players[playerId];
    const crew = Object.values(player.crews).find((c) => c.id === crewId);
    if (!crew) return { actionType: "brace", parameters: {} };

    const crewPos = getCrewPosition(crew);

    // If embarked, can't do much
    if (!crewPos) return { actionType: "brace", parameters: {} };

    // Role-specific aggressive plays
    if (crew.role === "Grappler" && dieValue >= 3) {
      const target = this.findGrappleTarget(state, playerId, crewPos);
      if (target) {
        return {
          actionType: "grapple",
          parameters: { targetId: target.id, mode: target.mode },
        };
      }
    }

    if (crew.role === "Cutter" && dieValue >= 3) {
      const cutTarget = this.findCutTarget(state, crewPos);
      if (cutTarget) {
        return {
          actionType: "cut",
          parameters: { targetType: "salvage", targetId: cutTarget },
        };
      }
    }

    // On terrain: push off toward action
    if (crew.onTerrainId && dieValue >= 2) {
      const dir = this.getAggressiveDirection(state, playerId, crewPos);
      return { actionType: "push-off", parameters: { direction: dir } };
    }

    // In space: thruster toward target
    if (dieValue >= 4) {
      const dir = this.getAggressiveDirection(state, playerId, crewPos);
      return { actionType: "thruster-burn", parameters: { direction: dir } };
    }

    // Crawl if on terrain
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
    // Aggressive rarely resists — prefers to keep dice for attacks
    // Only resist if we have a die clearly higher than the attacker
    const player = state.players[playerId];
    const crew = Object.values(player.crews).find((c) => c.id === targetCrewId);
    if (!crew) return { resist: false };

    const eligibleDice = crew.slots
      .filter((s) => s.assignedDieId)
      .map((s) => player.dice.find((d) => d.id === s.assignedDieId))
      .filter((d) => d && d.state === "assigned")
      .filter((d) => d!.value > attackerDieValue + 1); // Only resist if clearly winning

    if (eligibleDice.length > 0) {
      // Use the lowest qualifying die
      const best = eligibleDice.sort((a, b) => a!.value - b!.value)[0]!;
      return { resist: true, dieId: best.id };
    }

    return { resist: false };
  }

  // ── Targeting helpers ─────────────────────────────────────

  private getBurnDirection(state: GameState, playerId: string): number {
    const shipPos = getPlayerShipPos(state, playerId);
    // Burn toward nearest high-value salvage
    let bestTarget: { pos: Vec2; score: number } | null = null;
    for (const salvage of state.table.looseSalvage) {
      if (typeof salvage.position !== "object" || salvage.isAttached) continue;
      const score = evalSalvagePiece(state, salvage, playerId);
      if (!bestTarget || score > bestTarget.score) {
        bestTarget = { pos: salvage.position as Vec2, score };
      }
    }
    if (bestTarget) return angleBetween(shipPos, bestTarget.pos);
    return 0;
  }

  private getAggressiveDirection(state: GameState, playerId: string, from: Vec2): number {
    // Head toward nearest rival crew or high-value salvage
    let bestAngle = 0;
    let bestScore = -Infinity;

    for (const p of Object.values(state.players)) {
      if (p.id === playerId) continue;
      for (const crew of Object.values(p.crews)) {
        if (crew.position === "embarked" || crew.state === "lost") continue;
        const pos = crew.position as Vec2;
        const dist = distance(from, pos);
        const score = 10 - dist; // Closer = better
        if (score > bestScore) {
          bestScore = score;
          bestAngle = angleBetween(from, pos);
        }
      }
    }

    return bestAngle;
  }

  private findGrappleTarget(state: GameState, playerId: string, crewPos: Vec2): { id: string; mode: string } | null {
    // Try to yank rival crew or reel in toward valuable salvage
    for (const p of Object.values(state.players)) {
      if (p.id === playerId) continue;
      for (const crew of Object.values(p.crews)) {
        if (crew.position === "embarked" || crew.state === "lost") continue;
        const pos = crew.position as Vec2;
        if (distance(crewPos, pos) <= RULES.grapple.range) {
          return { id: crew.id, mode: "yank" };
        }
      }
    }

    // Reel in toward valuable salvage
    for (const salvage of state.table.looseSalvage) {
      if (typeof salvage.position !== "object" || salvage.isAttached) continue;
      if (distance(crewPos, salvage.position as Vec2) <= RULES.grapple.range) {
        return { id: salvage.id, mode: "reel-in" };
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

  private findScanTarget(state: GameState, playerId: string): string {
    const shipPos = getPlayerShipPos(state, playerId);
    for (const salvage of state.table.looseSalvage) {
      if (salvage.isFaceDown && typeof salvage.position === "object") {
        if (distance(shipPos, salvage.position as Vec2) <= RULES.scan.range) {
          return salvage.id;
        }
      }
    }
    // Fallback: any face-down salvage
    const faceDown = state.table.looseSalvage.find((s) => s.isFaceDown);
    return faceDown?.id ?? "";
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
