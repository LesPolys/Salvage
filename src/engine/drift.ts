import type {
  GameState,
  EntityId,
  Vec2,
  Velocity,
  Direction,
  Tether,
} from "./types";
import { RULES } from "../config/rules";
import { RNG } from "./rng";
import {
  vec2,
  add,
  sub,
  scale,
  normalize,
  length,
  distance,
  velocityToVec2,
  vec2ToVelocity,
  isOnTable,
  pathIntersectsPolygon,
  fromAngle,
  perp,
  dot,
  angleBetween,
  lerp,
} from "./physics";

// ── Movable entity abstraction ──────────────────────────────

interface Movable {
  id: EntityId;
  kind: "ship" | "crew" | "salvage" | "debris";
  mass: number;
  position: Vec2;
  velocity: Velocity;
}

// ── Main drift phase ────────────────────────────────────────

export function runDriftPhase(state: GameState): GameState {
  // 1. Roll debris drift direction
  const rng = new RNG(state.meta.seed + `-drift-r${state.meta.round}`);
  state.table.debrisDriftDirection = rng.rollDirection();

  // 2. Apply debris drift velocity (Short in rolled direction)
  const dirAngle = directionToAngle(state.table.debrisDriftDirection);
  for (const debris of state.table.debris) {
    debris.velocity = { direction: dirAngle, magnitude: 1 };
  }

  // 3. Collect all movables sorted by mass descending (ships first)
  const movables = collectMovables(state);
  movables.sort((a, b) => b.mass - a.mass);

  // 4. Resolve drift for each entity
  for (const movable of movables) {
    state = resolveDriftFor(state, movable);
  }

  // 5. Cleanup: remove anchor swing temp tethers
  state.tethers = state.tethers.filter((t) => !t.isAnchorSwingTemp);

  // 6. Check for snapped tethers (load exceeded)
  state = checkTetherLoads(state);

  // 7. Check lost crew
  state = checkLostCrew(state);

  // 8. Reset debris velocities (they only drift once per round)
  for (const debris of state.table.debris) {
    debris.velocity = { direction: 0, magnitude: 0 };
  }

  return state;
}

// ── Collect movables ────────────────────────────────────────

function collectMovables(state: GameState): Movable[] {
  const movables: Movable[] = [];

  // Ships (mass 5)
  for (const player of Object.values(state.players)) {
    const ship = player.ship;
    if (ship.velocity.magnitude > 0) {
      movables.push({
        id: ship.id,
        kind: "ship",
        mass: 5,
        position: { ...ship.position },
        velocity: { ...ship.velocity },
      });
    }
  }

  // Crew (mass 1) — only those in space (not embarked, not lost)
  for (const player of Object.values(state.players)) {
    for (const crew of Object.values(player.crews)) {
      if (crew.position === "embarked" || crew.state === "lost") continue;
      // Crew on terrain that isn't a ship moves with terrain (handled by ship drift)
      // Crew on a ship hull moves with the ship
      if (crew.onTerrainId) {
        // If on a ship, they've already been moved with the ship
        // If on a wreck/asteroid (static), they stay put
        continue;
      }
      if (crew.velocity.magnitude > 0) {
        movables.push({
          id: crew.id,
          kind: "crew",
          mass: 1,
          position: crew.position as Vec2,
          velocity: { ...crew.velocity },
        });
      }
    }
  }

  // Loose salvage
  for (const salvage of state.table.looseSalvage) {
    if (typeof salvage.position !== "object") continue;
    if (salvage.isAttached) continue;
    if (salvage.velocity.magnitude > 0) {
      movables.push({
        id: salvage.id,
        kind: "salvage",
        mass: salvage.mass,
        position: salvage.position,
        velocity: { ...salvage.velocity },
      });
    }
  }

  // Debris
  for (const debris of state.table.debris) {
    if (debris.velocity.magnitude > 0) {
      movables.push({
        id: debris.id,
        kind: "debris",
        mass: 1,
        position: { ...debris.position },
        velocity: { ...debris.velocity },
      });
    }
  }

  return movables;
}

// ── Resolve drift for single entity ─────────────────────────

function resolveDriftFor(state: GameState, movable: Movable): GameState {
  const displacement = velocityToVec2(movable.velocity);
  let targetPos = add(movable.position, displacement);
  let finalVelocity = movable.velocity;
  let landedOnTerrain: EntityId | undefined;

  // 1. Check tether constraints
  const tether = findTetherFor(state, movable.id);
  if (tether) {
    const anchorId =
      tether.endpointA.entityId === movable.id
        ? tether.endpointB.entityId
        : tether.endpointA.entityId;
    const anchorPos = getEntityPosition(state, anchorId);

    if (anchorPos) {
      const tetherLen = tetherLengthInches(tether);
      const distFromAnchor = distance(targetPos, anchorPos);

      if (distFromAnchor > tetherLen) {
        // Tether catches — bend along arc
        const result = resolveTetherSwing(
          movable.position,
          displacement,
          anchorPos,
          tetherLen
        );
        targetPos = result.position;
        finalVelocity = result.velocity;
      }
    }
  }

  // 2. Check terrain collisions along the path
  const terrainHit = checkTerrainCollision(state, movable, movable.position, targetPos);
  if (terrainHit) {
    targetPos = terrainHit.contactPoint;
    finalVelocity = { direction: 0, magnitude: 0 };
    landedOnTerrain = terrainHit.terrainId;
  }

  // 2b. Check entity-to-entity collisions (only at endpoint per design doc)
  if (!landedOnTerrain) {
    const collision = checkEntityCollision(state, movable, targetPos);
    if (collision) {
      targetPos = collision.contactPos;
      finalVelocity = collision.resultVelocity;
      if (collision.landedOnTerrain) landedOnTerrain = collision.landedOnTerrain;
      applyCollisionEffects(state, movable, collision);
    }
  }

  // 3. Check if off table
  if (!isOnTable(targetPos)) {
    if (movable.kind === "crew") {
      markCrewLost(state, movable.id);
      return state;
    }
    if (movable.kind === "debris") {
      // Remove debris that goes off table
      state.table.debris = state.table.debris.filter((d) => d.id !== movable.id);
      return state;
    }
    // Salvage off table is just lost
    if (movable.kind === "salvage") {
      state.table.looseSalvage = state.table.looseSalvage.filter(
        (s) => s.id !== movable.id
      );
      return state;
    }
    // Ships can't go off table — clamp
    if (movable.kind === "ship") {
      targetPos = {
        x: Math.max(-18, Math.min(18, targetPos.x)),
        z: Math.max(-18, Math.min(18, targetPos.z)),
      };
      finalVelocity = { direction: 0, magnitude: 0 };
    }
  }

  // 4. Apply the movement
  applyMovement(state, movable.id, movable.kind, targetPos, finalVelocity, landedOnTerrain);

  // 5. Move crew on this ship's hull (if this is a ship)
  if (movable.kind === "ship") {
    const shipDisplacement = sub(targetPos, movable.position);
    moveCrewOnHull(state, movable.id, shipDisplacement);
  }

  return state;
}

// ── Tether swing resolution ─────────────────────────────────

function resolveTetherSwing(
  startPos: Vec2,
  displacement: Vec2,
  anchorPos: Vec2,
  tetherLength: number
): { position: Vec2; velocity: Velocity } {
  // Simple tether constraint: when entity would exceed tether length,
  // project it onto the circle of radius = tetherLength centered on anchor
  const targetPos = add(startPos, displacement);
  const toTarget = sub(targetPos, anchorPos);
  const dist = length(toTarget);

  if (dist <= tetherLength) {
    return { position: targetPos, velocity: vec2ToVelocity(displacement) };
  }

  // Constrain to circle
  const constrained = add(anchorPos, scale(normalize(toTarget), tetherLength));

  // Compute tangent velocity (perpendicular to radial direction)
  const radial = normalize(sub(constrained, anchorPos));
  const tangent = perp(radial);
  const tangentSpeed = dot(displacement, tangent);
  const tangentVel = scale(tangent, tangentSpeed);

  // Cap arc at 180°
  const startAngle = angleBetween(anchorPos, startPos);
  const endAngle = angleBetween(anchorPos, constrained);
  let arcDelta = endAngle - startAngle;
  // Normalize to [-PI, PI]
  while (arcDelta > Math.PI) arcDelta -= 2 * Math.PI;
  while (arcDelta < -Math.PI) arcDelta += 2 * Math.PI;

  if (Math.abs(arcDelta) > Math.PI) {
    // Cap at 180°
    const cappedAngle = startAngle + Math.sign(arcDelta) * Math.PI;
    const cappedPos = add(
      anchorPos,
      scale(fromAngle(cappedAngle), tetherLength)
    );
    return { position: cappedPos, velocity: vec2ToVelocity(tangentVel) };
  }

  return { position: constrained, velocity: vec2ToVelocity(tangentVel) };
}

// ── Terrain collision check ─────────────────────────────────

function checkTerrainCollision(
  state: GameState,
  movable: Movable,
  from: Vec2,
  to: Vec2
): { contactPoint: Vec2; terrainId: EntityId } | null {
  let closest: { contactPoint: Vec2; terrainId: EntityId; t: number } | null = null;

  // Check wrecks
  for (const wreck of state.table.wrecks) {
    const worldBounds = wreck.shape.bounds.map((b) =>
      add(wreck.position, b)
    );
    const hit = pathIntersectsPolygon(from, to, worldBounds);
    if (hit.hit && hit.t !== undefined && (!closest || hit.t < closest.t)) {
      closest = { contactPoint: hit.contactPoint!, terrainId: wreck.id, t: hit.t };
    }
  }

  // Check asteroids
  for (const asteroid of state.table.asteroids) {
    const worldBounds = asteroid.bounds.map((b) =>
      add(asteroid.position, b)
    );
    const hit = pathIntersectsPolygon(from, to, worldBounds);
    if (hit.hit && hit.t !== undefined && (!closest || hit.t < closest.t)) {
      closest = { contactPoint: hit.contactPoint!, terrainId: asteroid.id, t: hit.t };
    }
  }

  // Check ships (except self)
  for (const player of Object.values(state.players)) {
    const ship = player.ship;
    if (ship.id === movable.id) continue;
    const hw = RULES.ship.baseSize.x / 2;
    const hd = RULES.ship.baseSize.z / 2;
    const shipBounds = [
      add(ship.position, vec2(-hw, -hd)),
      add(ship.position, vec2(hw, -hd)),
      add(ship.position, vec2(hw, hd)),
      add(ship.position, vec2(-hw, hd)),
    ];
    const hit = pathIntersectsPolygon(from, to, shipBounds);
    if (hit.hit && hit.t !== undefined && (!closest || hit.t < closest.t)) {
      closest = { contactPoint: hit.contactPoint!, terrainId: ship.id, t: hit.t };
    }
  }

  return closest;
}

// ── Apply movement ──────────────────────────────────────────

function applyMovement(
  state: GameState,
  entityId: EntityId,
  kind: string,
  position: Vec2,
  velocity: Velocity,
  landedOnTerrain?: EntityId
): void {
  if (kind === "ship") {
    for (const player of Object.values(state.players)) {
      if (player.ship.id === entityId) {
        player.ship.position = position;
        player.ship.velocity = velocity;
        return;
      }
    }
  }
  if (kind === "crew") {
    for (const player of Object.values(state.players)) {
      for (const crew of Object.values(player.crews)) {
        if (crew.id === entityId) {
          crew.position = position;
          crew.velocity = velocity;
          if (landedOnTerrain) {
            crew.onTerrainId = landedOnTerrain;
          }
          return;
        }
      }
    }
  }
  if (kind === "salvage") {
    for (const salvage of state.table.looseSalvage) {
      if (salvage.id === entityId) {
        salvage.position = position;
        salvage.velocity = velocity;
        return;
      }
    }
  }
  if (kind === "debris") {
    for (const debris of state.table.debris) {
      if (debris.id === entityId) {
        debris.position = position;
        debris.velocity = velocity;
        return;
      }
    }
  }
}

// ── Move crew on a ship's hull ──────────────────────────────

function moveCrewOnHull(state: GameState, shipId: EntityId, displacement: Vec2): void {
  for (const player of Object.values(state.players)) {
    for (const crew of Object.values(player.crews)) {
      if (crew.onTerrainId === shipId && crew.position !== "embarked") {
        crew.position = add(crew.position as Vec2, displacement);
      }
    }
  }
}

// ── Check tether loads ──────────────────────────────────────

function checkTetherLoads(state: GameState): GameState {
  state.tethers = state.tethers.filter((tether) => {
    const totalMass = computeTetherLoad(state, tether);
    if (totalMass > tether.loadRating) {
      tether.state = "snapped";
      return false; // Remove snapped tether
    }
    return true;
  });
  return state;
}

function computeTetherLoad(state: GameState, tether: Tether): number {
  let mass = 0;
  for (const endpoint of [tether.endpointA, tether.endpointB]) {
    mass += getEntityMassForTether(state, endpoint.entityId);
  }
  return mass;
}

function getEntityMassForTether(state: GameState, entityId: EntityId): number {
  // Crew
  for (const player of Object.values(state.players)) {
    for (const crew of Object.values(player.crews)) {
      if (crew.id === entityId) return RULES.crew.mass;
    }
  }
  // Salvage
  for (const salvage of state.table.looseSalvage) {
    if (salvage.id === entityId) return salvage.mass;
  }
  // Ships and terrain have infinite mass for tether purposes (don't count)
  return 0;
}

// ── Check lost crew ─────────────────────────────────────────

function checkLostCrew(state: GameState): GameState {
  for (const player of Object.values(state.players)) {
    for (const crew of Object.values(player.crews)) {
      if (crew.state === "lost" || crew.position === "embarked") continue;
      const pos = crew.position as Vec2;
      if (!isOnTable(pos)) {
        markCrewLost(state, crew.id);
      }
    }
  }
  return state;
}

function markCrewLost(state: GameState, crewId: EntityId): void {
  for (const player of Object.values(state.players)) {
    for (const crew of Object.values(player.crews)) {
      if (crew.id === crewId) {
        crew.state = "lost";
        // Drop carried salvage
        for (const carried of crew.carrying) {
          if (typeof crew.position === "object") {
            carried.position = { ...(crew.position as Vec2) };
          }
          carried.velocity = { direction: 0, magnitude: 0 };
          state.table.looseSalvage.push(carried);
        }
        crew.carrying = [];
        // Remove tethers
        state.tethers = state.tethers.filter(
          (t) =>
            t.endpointA.entityId !== crewId &&
            t.endpointB.entityId !== crewId
        );
        // Update score
        player.score = computeLiveScore(state, player.id);
        return;
      }
    }
  }
}

function computeLiveScore(state: GameState, playerId: string): number {
  const player = state.players[playerId];
  let vp = 0;
  for (const piece of player.ship.hold) {
    vp += piece.vp;
  }
  const lostCount = Object.values(player.crews).filter(
    (c) => c.state === "lost"
  ).length;
  vp += lostCount * RULES.scoring.lostCrewPenalty;
  return vp;
}

// ── Entity-to-entity collision ──────────────────────────────

interface CollisionResult {
  contactPos: Vec2;
  resultVelocity: Velocity;
  landedOnTerrain?: EntityId;
  otherEntityId: EntityId;
  effect: "stop" | "half-stop" | "land" | "destroy-debris" | "pass";
}

function checkEntityCollision(
  state: GameState,
  movable: Movable,
  targetPos: Vec2
): CollisionResult | null {
  if (movable.kind === "ship") {
    return checkShipCollisions(state, movable, targetPos);
  }
  if (movable.kind === "crew") {
    return checkCrewCollisions(state, movable, targetPos);
  }
  if (movable.kind === "salvage") {
    return checkSalvageCollisions(state, movable, targetPos);
  }
  return null;
}

function checkShipCollisions(
  state: GameState,
  movable: Movable,
  targetPos: Vec2
): CollisionResult | null {
  // Ship vs other ship: both stop at contact, velocity = 0
  for (const player of Object.values(state.players)) {
    const ship = player.ship;
    if (ship.id === movable.id) continue;
    if (distance(targetPos, ship.position) < RULES.ship.baseSize.z) {
      return {
        contactPos: lerp(movable.position, targetPos, 0.5),
        resultVelocity: { direction: 0, magnitude: 0 },
        otherEntityId: ship.id,
        effect: "stop",
      };
    }
  }

  // Ship vs debris: debris destroyed, ship continues
  for (let i = state.table.debris.length - 1; i >= 0; i--) {
    const debris = state.table.debris[i];
    if (distance(targetPos, debris.position) < 1) {
      state.table.debris.splice(i, 1);
      // Ship continues — no collision result needed
    }
  }

  // Ship vs loose salvage: salvage stops at hull (stowable next round)
  for (const salvage of state.table.looseSalvage) {
    if (typeof salvage.position !== "object" || salvage.isAttached) continue;
    if (distance(targetPos, salvage.position as Vec2) < RULES.ship.baseSize.z / 2 + 0.5) {
      salvage.velocity = { direction: 0, magnitude: 0 };
      salvage.position = { ...targetPos };
    }
  }

  return null;
}

function checkCrewCollisions(
  state: GameState,
  movable: Movable,
  targetPos: Vec2
): CollisionResult | null {
  // Crew vs own crew: both stop, adjacent
  // Crew vs rival crew: both stop at half velocity, adjacent
  for (const player of Object.values(state.players)) {
    for (const crew of Object.values(player.crews)) {
      if (crew.id === movable.id) continue;
      if (crew.position === "embarked" || crew.state === "lost") continue;
      const crewPos = crew.position as Vec2;
      if (distance(targetPos, crewPos) < 1) {
        const isOwn = isOwnCrew(state, movable.id, crew.id);
        if (isOwn) {
          // Both stop, adjacent
          return {
            contactPos: lerp(movable.position, targetPos, 0.9),
            resultVelocity: { direction: 0, magnitude: 0 },
            otherEntityId: crew.id,
            effect: "stop",
          };
        } else {
          // Both stop at half velocity, adjacent
          const halfMag = Math.max(0, Math.floor(movable.velocity.magnitude / 2)) as 0 | 1 | 2 | 3;
          return {
            contactPos: lerp(movable.position, targetPos, 0.9),
            resultVelocity: { direction: movable.velocity.direction, magnitude: halfMag },
            otherEntityId: crew.id,
            effect: "half-stop",
          };
        }
      }
    }
  }

  return null;
}

function checkSalvageCollisions(
  state: GameState,
  _movable: Movable,
  targetPos: Vec2
): CollisionResult | null {
  // Loose salvage stops on contact with anything
  for (const player of Object.values(state.players)) {
    if (distance(targetPos, player.ship.position) < RULES.ship.baseSize.z / 2 + 0.5) {
      return {
        contactPos: targetPos,
        resultVelocity: { direction: 0, magnitude: 0 },
        otherEntityId: player.ship.id,
        effect: "stop",
      };
    }
    for (const crew of Object.values(player.crews)) {
      if (crew.position === "embarked" || crew.state === "lost") continue;
      if (distance(targetPos, crew.position as Vec2) < 1) {
        return {
          contactPos: targetPos,
          resultVelocity: { direction: 0, magnitude: 0 },
          otherEntityId: crew.id,
          effect: "stop",
        };
      }
    }
  }
  return null;
}

function applyCollisionEffects(
  state: GameState,
  movable: Movable,
  collision: CollisionResult
): void {
  if (collision.effect === "stop" || collision.effect === "half-stop") {
    // For crew-to-crew: also stop the other entity
    const otherIsCrewOrShip =
      collision.effect === "stop" || collision.effect === "half-stop";
    if (otherIsCrewOrShip) {
      for (const player of Object.values(state.players)) {
        for (const crew of Object.values(player.crews)) {
          if (crew.id === collision.otherEntityId && crew.position !== "embarked") {
            if (collision.effect === "half-stop") {
              const halfMag = Math.max(0, Math.floor(crew.velocity.magnitude / 2)) as 0 | 1 | 2 | 3;
              crew.velocity = { direction: crew.velocity.direction, magnitude: halfMag };
            } else {
              crew.velocity = { direction: 0, magnitude: 0 };
            }
          }
        }
        if (player.ship.id === collision.otherEntityId && movable.kind === "ship") {
          player.ship.velocity = { direction: 0, magnitude: 0 };
        }
      }
    }
  }
}

function isOwnCrew(state: GameState, entityAId: EntityId, entityBId: EntityId): boolean {
  for (const player of Object.values(state.players)) {
    const ids = [player.ship.id, ...Object.values(player.crews).map((c) => c.id)];
    if (ids.includes(entityAId) && ids.includes(entityBId)) return true;
  }
  return false;
}

// ── Tether helpers ──────────────────────────────────────────

function findTetherFor(state: GameState, entityId: EntityId): Tether | undefined {
  return state.tethers.find(
    (t) =>
      t.endpointA.entityId === entityId || t.endpointB.entityId === entityId
  );
}

function tetherLengthInches(tether: Tether): number {
  switch (tether.length) {
    case "short": return RULES.tethers.shortLength;
    case "medium": return RULES.tethers.mediumLength;
    case "long": return RULES.tethers.longLength;
  }
}

function getEntityPosition(state: GameState, entityId: EntityId): Vec2 | null {
  for (const player of Object.values(state.players)) {
    if (player.ship.id === entityId) return player.ship.position;
    for (const crew of Object.values(player.crews)) {
      if (crew.id === entityId) {
        if (crew.position === "embarked") return null;
        return crew.position as Vec2;
      }
    }
  }
  for (const wreck of state.table.wrecks) {
    if (wreck.id === entityId) return wreck.position;
  }
  for (const asteroid of state.table.asteroids) {
    if (asteroid.id === entityId) return asteroid.position;
  }
  for (const salvage of state.table.looseSalvage) {
    if (salvage.id === entityId && typeof salvage.position === "object")
      return salvage.position as Vec2;
  }
  return null;
}

// ── Direction helper ────────────────────────────────────────

function directionToAngle(dir: Direction): number {
  switch (dir) {
    case "N": return Math.PI / 2;
    case "NE": return Math.PI / 6;
    case "SE": return -Math.PI / 6;
    case "S": return -Math.PI / 2;
    case "SW": return -Math.PI + Math.PI / 6;
    case "NW": return Math.PI - Math.PI / 6;
  }
}
