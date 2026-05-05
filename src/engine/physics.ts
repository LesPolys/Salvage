import type { Vec2, Velocity, SpeedTier, EntityId, GameState } from "./types";
import { RULES, VELOCITY_INCHES } from "../config/rules";

// ── Vec2 operations ─────────────────────────────────────────

export function vec2(x: number, z: number): Vec2 {
  return { x, z };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, z: a.z + b.z };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, z: a.z - b.z };
}

export function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, z: v.z * s };
}

export function length(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.z * v.z);
}

export function distance(a: Vec2, b: Vec2): number {
  return length(sub(b, a));
}

export function normalize(v: Vec2): Vec2 {
  const len = length(v);
  if (len === 0) return { x: 0, z: 0 };
  return { x: v.x / len, z: v.z / len };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.z * b.z;
}

/** Perpendicular vector (rotate 90° CCW in xz plane) */
export function perp(v: Vec2): Vec2 {
  return { x: -v.z, z: v.x };
}

export function angleBetween(a: Vec2, b: Vec2): number {
  return Math.atan2(b.z - a.z, b.x - a.x);
}

export function fromAngle(radians: number): Vec2 {
  return { x: Math.cos(radians), z: Math.sin(radians) };
}

export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

export function equals(a: Vec2, b: Vec2, epsilon = 0.001): boolean {
  return Math.abs(a.x - b.x) < epsilon && Math.abs(a.z - b.z) < epsilon;
}

// ── Velocity operations ─────────────────────────────────────

/** Convert a Velocity to a displacement Vec2 (in inches) */
export function velocityToVec2(v: Velocity): Vec2 {
  const inches = VELOCITY_INCHES[v.magnitude] ?? 0;
  return scale(fromAngle(v.direction), inches);
}

/** Convert a displacement Vec2 to a Velocity (quantized to nearest speed tier) */
export function vec2ToVelocity(v: Vec2): Velocity {
  const mag = length(v);
  const dir = Math.atan2(v.z, v.x);

  let tier: SpeedTier;
  if (mag < 0.5) {
    tier = 0;
  } else if (mag <= (RULES.velocity.short + RULES.velocity.medium) / 2) {
    tier = 1;
  } else if (mag <= (RULES.velocity.medium + RULES.velocity.long) / 2) {
    tier = 2;
  } else {
    tier = 3;
  }

  return { direction: tier === 0 ? 0 : dir, magnitude: tier };
}

/** Vector-add two velocities (tip-to-tail), cap at Long */
export function addVelocities(a: Velocity, b: Velocity): Velocity {
  const va = velocityToVec2(a);
  const vb = velocityToVec2(b);
  const sum = add(va, vb);
  const result = vec2ToVelocity(sum);

  // Cap at Long
  if (result.magnitude > RULES.velocity.maxMagnitude) {
    return { direction: result.direction, magnitude: RULES.velocity.maxMagnitude as SpeedTier };
  }
  return result;
}

/** Create a velocity from a direction angle and speed tier */
export function makeVelocity(direction: number, magnitude: SpeedTier): Velocity {
  return { direction: magnitude === 0 ? 0 : direction, magnitude };
}

export const ZERO_VELOCITY: Velocity = { direction: 0, magnitude: 0 };

// ── Speed tier helpers ──────────────────────────────────────

/** Drop a speed tier by N steps (for mass penalty) */
export function dropSpeedTier(tier: SpeedTier, steps: number): SpeedTier {
  return Math.max(0, tier - steps) as SpeedTier;
}

/** Compute burn penalty steps based on hold mass */
export function burnPenaltySteps(holdMass: number): number {
  const [threshold1, threshold2] = RULES.ship.massPenaltyThresholds;
  if (holdMass >= threshold2) return 2;
  if (holdMass >= threshold1) return 1;
  return 0;
}

// ── Adjacency & range checks ────────────────────────────────

export function isAdjacent(a: Vec2, b: Vec2): boolean {
  return distance(a, b) <= RULES.adjacency.distance;
}

export function isWithinRange(a: Vec2, b: Vec2, range: number): boolean {
  return distance(a, b) <= range;
}

// ── Line of sight ───────────────────────────────────────────

/** Check if a line segment from A to B intersects a convex polygon */
function segmentIntersectsPolygon(a: Vec2, b: Vec2, polygon: Vec2[]): boolean {
  if (polygon.length < 3) return false;

  const d = sub(b, a);

  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    const edge = sub(p2, p1);
    const toP1 = sub(p1, a);

    const cross = d.x * edge.z - d.z * edge.x;
    if (Math.abs(cross) < 0.0001) continue; // parallel

    const t = (toP1.x * edge.z - toP1.z * edge.x) / cross;
    const u = (toP1.x * d.z - toP1.z * d.x) / cross;

    if (t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999) {
      return true;
    }
  }

  return false;
}

/**
 * Check line of sight between two points.
 * Anything with mass blocks LoS — wrecks, asteroids, ships, crew, salvage, debris.
 * Tethers don't block.
 */
export function hasLineOfSight(
  state: GameState,
  from: Vec2,
  to: Vec2,
  excludeIds: Set<EntityId> = new Set()
): boolean {
  // Check wrecks
  for (const wreck of state.table.wrecks) {
    if (excludeIds.has(wreck.id)) continue;
    if (wreck.shape.bounds.length >= 3) {
      // Translate bounds to world space
      const worldBounds = wreck.shape.bounds.map((b) =>
        add(wreck.position, b)
      );
      if (segmentIntersectsPolygon(from, to, worldBounds)) return false;
    }
  }

  // Check asteroids
  for (const asteroid of state.table.asteroids) {
    if (excludeIds.has(asteroid.id)) continue;
    if (asteroid.bounds.length >= 3) {
      const worldBounds = asteroid.bounds.map((b) =>
        add(asteroid.position, b)
      );
      if (segmentIntersectsPolygon(from, to, worldBounds)) return false;
    }
  }

  // Check ships (approximate as rectangles)
  for (const player of Object.values(state.players)) {
    const ship = player.ship;
    if (excludeIds.has(ship.id)) continue;
    const hw = RULES.ship.baseSize.x / 2;
    const hd = RULES.ship.baseSize.z / 2;
    const shipBounds = [
      add(ship.position, vec2(-hw, -hd)),
      add(ship.position, vec2(hw, -hd)),
      add(ship.position, vec2(hw, hd)),
      add(ship.position, vec2(-hw, hd)),
    ];
    if (segmentIntersectsPolygon(from, to, shipBounds)) return false;
  }

  // Check crew (approximate as point with small radius — treat as 0.5" circle)
  for (const player of Object.values(state.players)) {
    for (const crew of Object.values(player.crews)) {
      if (excludeIds.has(crew.id)) continue;
      if (crew.position === "embarked" || crew.state === "lost") continue;
      const crewPos = crew.position as Vec2;
      // Check if the line passes within 0.5" of the crew
      if (pointToSegmentDistance(crewPos, from, to) < 0.5) return false;
    }
  }

  // Check loose salvage
  for (const salvage of state.table.looseSalvage) {
    if (excludeIds.has(salvage.id)) continue;
    if (typeof salvage.position !== "object") continue;
    if (pointToSegmentDistance(salvage.position, from, to) < 0.5) return false;
  }

  // Check debris
  for (const debris of state.table.debris) {
    if (excludeIds.has(debris.id)) continue;
    if (pointToSegmentDistance(debris.position, from, to) < 0.25) return false;
  }

  return true;
}

/** Distance from point P to the closest point on segment AB */
export function pointToSegmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const ap = sub(p, a);
  const lenSq = ab.x * ab.x + ab.z * ab.z;
  if (lenSq === 0) return distance(p, a);

  let t = dot(ap, ab) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const closest = add(a, scale(ab, t));
  return distance(p, closest);
}

// ── Table bounds ────────────────────────────────────────────

const HALF_TABLE = RULES.table.sizeInches / 2;

export function isOnTable(pos: Vec2): boolean {
  return (
    pos.x >= -HALF_TABLE &&
    pos.x <= HALF_TABLE &&
    pos.z >= -HALF_TABLE &&
    pos.z <= HALF_TABLE
  );
}

export function clampToTable(pos: Vec2): Vec2 {
  return {
    x: Math.max(-HALF_TABLE, Math.min(HALF_TABLE, pos.x)),
    z: Math.max(-HALF_TABLE, Math.min(HALF_TABLE, pos.z)),
  };
}

// ── Collision helpers ───────────────────────────────────────

/** Check if a moving entity's path (from → from+velocity) intersects a polygon */
export function pathIntersectsPolygon(
  from: Vec2,
  to: Vec2,
  polygon: Vec2[]
): { hit: boolean; contactPoint?: Vec2; t?: number } {
  if (polygon.length < 3) return { hit: false };

  const d = sub(to, from);

  let closestT = Infinity;
  let closestPoint: Vec2 | undefined;

  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    const edge = sub(p2, p1);
    const toP1 = sub(p1, from);

    const cross = d.x * edge.z - d.z * edge.x;
    if (Math.abs(cross) < 0.0001) continue;

    const t = (toP1.x * edge.z - toP1.z * edge.x) / cross;
    const u = (toP1.x * d.z - toP1.z * d.x) / cross;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && t < closestT) {
      closestT = t;
      closestPoint = add(from, scale(d, t));
    }
  }

  if (closestPoint) {
    return { hit: true, contactPoint: closestPoint, t: closestT };
  }
  return { hit: false };
}

/** Get the mass of an entity for drift ordering */
export function getEntityMass(
  state: GameState,
  entityId: EntityId
): number {
  // Ships
  for (const player of Object.values(state.players)) {
    if (player.ship.id === entityId) return 5;
  }
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
  // Debris
  for (const debris of state.table.debris) {
    if (debris.id === entityId) return 1;
  }
  return 0;
}
