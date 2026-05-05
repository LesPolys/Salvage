import * as THREE from "three";
import type { GameState, Vec2, Velocity } from "../../engine/types";
import { RULES, VELOCITY_INCHES } from "../../config/rules";

// ── Color palette ───────────────────────────────────────────

const COLORS = {
  wreck: 0x665544,
  asteroid: 0x554433,
  salvageScatter: 0x44cc44,
  salvageWreck: 0xccaa22,
  salvagePremium: 0xff6644,
  debris: 0x555555,
  tether: 0x88aacc,
  tetherTaut: 0xff8866,
  velocityArrow: 0xffffff,
  selection: 0xffff00,
  gridLine: 0x222233,
};

const PLAYER_COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12];

// ── Main render function ────────────────────────────────────

export function renderEntities(
  game: GameState,
  group: THREE.Group,
  selectedId?: string | null
): void {
  renderWrecks(game, group);
  renderAsteroids(game, group);
  renderShips(game, group);
  renderCrew(game, group);
  renderLooseSalvage(game, group);
  renderDebris(game, group);
  renderTethers(game, group);
  renderVelocityArrows(game, group);

  if (selectedId) {
    applySelectionHighlight(group, selectedId);
  }
}

function applySelectionHighlight(group: THREE.Group, selectedId: string): void {
  group.traverse((obj) => {
    if (obj.userData.entityId === selectedId) {
      // Add glowing ring beneath the entity
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.6, 0.9, 24),
        new THREE.MeshBasicMaterial({
          color: COLORS.selection,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.7,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(obj.position);
      ring.position.y = 0.02;
      ring.userData._selectionRing = true;
      group.add(ring);

      // Tint the entity with emissive
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
        obj.material = obj.material.clone();
        obj.material.emissive.set(COLORS.selection);
        obj.material.emissiveIntensity = 0.15;
      }
    }
  });
}

export function cleanupEntities(group: THREE.Group): void {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else {
        child.material.dispose();
      }
    }
  }
}

// ── Wrecks ──────────────────────────────────────────────────

function renderWrecks(game: GameState, group: THREE.Group): void {
  for (const wreck of game.table.wrecks) {
    const mesh = new THREE.Group();
    mesh.userData.entityId = wreck.id;
    mesh.userData.entityType = "wreck";

    // Main body — irregular box based on shape type
    let width = 6, depth = 3, height = 1.5;
    if (wreck.shape.type === "station") { width = 4; depth = 4; height = 2; }
    else if (wreck.shape.type === "carrier") { width = 8; depth = 2; height = 1.2; }
    else if (wreck.shape.type === "broken") { width = 4; depth = 3; height = 1; }

    const bodyGeo = new THREE.BoxGeometry(width, height, depth);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: COLORS.wreck,
      roughness: 0.8,
      metalness: 0.3,
      flatShading: true,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    mesh.add(body);

    // Compartment hatches
    for (const comp of wreck.compartments) {
      const hatchGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.2, 8);
      const hatchMat = new THREE.MeshStandardMaterial({
        color: comp.isSealed ? 0xaa4444 : 0x44aa44,
        emissive: comp.isSealed ? 0x331111 : 0x113311,
      });
      const hatch = new THREE.Mesh(hatchGeo, hatchMat);
      hatch.position.set(comp.position.x, height + 0.1, comp.position.z);
      mesh.add(hatch);
    }

    // Exterior salvage attachment indicators
    for (let i = 0; i < wreck.exteriorSalvageIds.length; i++) {
      const angle = (i / wreck.exteriorSalvageIds.length) * Math.PI * 2;
      const markerGeo = new THREE.SphereGeometry(0.25, 6, 4);
      const markerMat = new THREE.MeshStandardMaterial({
        color: COLORS.salvageWreck,
        emissive: 0x332200,
      });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.position.set(
        Math.cos(angle) * (width / 2 + 0.3),
        height / 2,
        Math.sin(angle) * (depth / 2 + 0.3)
      );
      mesh.add(marker);
    }

    mesh.position.set(wreck.position.x, 0, wreck.position.z);
    group.add(mesh);
  }
}

// ── Asteroids ───────────────────────────────────────────────

function renderAsteroids(game: GameState, group: THREE.Group): void {
  for (const asteroid of game.table.asteroids) {
    const geo = new THREE.DodecahedronGeometry(2, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.asteroid,
      roughness: 0.9,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.entityId = asteroid.id;
    mesh.userData.entityType = "asteroid";
    mesh.position.set(asteroid.position.x, 1, asteroid.position.z);
    mesh.castShadow = true;
    group.add(mesh);
  }
}

// ── Ships ───────────────────────────────────────────────────

function renderShips(game: GameState, group: THREE.Group): void {
  const playerIds = Object.keys(game.players);
  for (let pi = 0; pi < playerIds.length; pi++) {
    const player = game.players[playerIds[pi]];
    const ship = player.ship;
    const color = PLAYER_COLORS[pi] ?? 0xcccccc;

    const shipGroup = new THREE.Group();
    shipGroup.userData.entityId = ship.id;
    shipGroup.userData.entityType = "ship";

    // Hull — elongated box
    const hullGeo = new THREE.BoxGeometry(
      RULES.ship.baseSize.x,
      0.8,
      RULES.ship.baseSize.z
    );
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x445566,
      roughness: 0.6,
      metalness: 0.5,
      flatShading: true,
    });
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.position.y = 0.4;
    hull.castShadow = true;
    shipGroup.add(hull);

    // Running lights (player color)
    const lightGeo = new THREE.SphereGeometry(0.15, 6, 4);
    const lightMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.8,
    });
    for (const xOff of [-0.8, 0.8]) {
      const light = new THREE.Mesh(lightGeo, lightMat);
      light.position.set(xOff, 0.8, -1.2);
      shipGroup.add(light);
    }

    // Thruster glow (rear)
    const thrusterGeo = new THREE.ConeGeometry(0.3, 0.5, 6);
    const thrusterMat = new THREE.MeshStandardMaterial({
      color: 0x4488ff,
      emissive: 0x2244aa,
      emissiveIntensity: ship.velocity.magnitude > 0 ? 1.0 : 0.1,
      transparent: true,
      opacity: 0.7,
    });
    const thruster = new THREE.Mesh(thrusterGeo, thrusterMat);
    thruster.rotation.x = Math.PI / 2;
    thruster.position.set(0, 0.4, 1.7);
    shipGroup.add(thruster);

    // Hull anchors
    for (const anchor of ship.hullAnchors) {
      const anchorGeo = new THREE.RingGeometry(0.15, 0.25, 8);
      const anchorMat = new THREE.MeshBasicMaterial({
        color: anchor.inUse ? 0xffaa00 : 0x445566,
        side: THREE.DoubleSide,
      });
      const anchorMesh = new THREE.Mesh(anchorGeo, anchorMat);
      anchorMesh.rotation.x = -Math.PI / 2;
      anchorMesh.position.set(
        anchor.positionOffset.x,
        0.85,
        anchor.positionOffset.z
      );
      shipGroup.add(anchorMesh);
    }

    shipGroup.position.set(ship.position.x, 0, ship.position.z);
    shipGroup.rotation.y = -ship.facing; // rotate to face deployment direction
    group.add(shipGroup);
  }
}

// ── Crew ────────────────────────────────────────────────────

const ROLE_SHAPES: Record<string, () => THREE.BufferGeometry> = {
  Cutter: () => new THREE.ConeGeometry(0.3, 1.0, 6),
  Grappler: () => new THREE.OctahedronGeometry(0.35, 0),
  Breacher: () => new THREE.BoxGeometry(0.5, 0.9, 0.5),
  Hauler: () => new THREE.CylinderGeometry(0.25, 0.4, 0.9, 6),
};

function renderCrew(game: GameState, group: THREE.Group): void {
  const playerIds = Object.keys(game.players);
  for (let pi = 0; pi < playerIds.length; pi++) {
    const player = game.players[playerIds[pi]];
    const color = PLAYER_COLORS[pi] ?? 0xcccccc;

    for (const crew of Object.values(player.crews)) {
      if (crew.position === "embarked" || crew.state === "lost") continue;
      const pos = crew.position as Vec2;

      const geoFactory = ROLE_SHAPES[crew.role] ?? (() => new THREE.SphereGeometry(0.3));
      const geo = geoFactory();
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.5,
        metalness: 0.3,
        flatShading: true,
        emissive: crew.state === "grappled" ? 0x442200 : 0x000000,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.entityId = crew.id;
      mesh.userData.entityType = "crew";
      mesh.userData.role = crew.role;
      mesh.position.set(pos.x, 0.5, pos.z);
      mesh.castShadow = true;
      group.add(mesh);

      // Carrying indicator
      if (crew.carrying.length > 0) {
        const carryGeo = new THREE.SphereGeometry(0.15, 4, 3);
        const carryMat = new THREE.MeshStandardMaterial({
          color: COLORS.salvageScatter,
          emissive: 0x113311,
        });
        const carry = new THREE.Mesh(carryGeo, carryMat);
        carry.position.set(pos.x + 0.4, 0.3, pos.z);
        group.add(carry);
      }
    }
  }
}

// ── Loose salvage ───────────────────────────────────────────

function renderLooseSalvage(game: GameState, group: THREE.Group): void {
  for (const salvage of game.table.looseSalvage) {
    if (typeof salvage.position !== "object") continue;
    if (salvage.isAttached) continue; // Still on wreck — rendered with wreck

    const pos = salvage.position as Vec2;
    let size = 0.25;
    let color = COLORS.salvageScatter;

    if (salvage.type === "wreck") { size = 0.4; color = COLORS.salvageWreck; }
    else if (salvage.type === "premium") { size = 0.55; color = COLORS.salvagePremium; }

    const geo = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.3,
      roughness: 0.4,
      metalness: 0.6,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.entityId = salvage.id;
    mesh.userData.entityType = "salvage";
    mesh.position.set(pos.x, size / 2 + 0.1, pos.z);
    mesh.rotation.y = Math.PI / 4;
    mesh.castShadow = true;
    group.add(mesh);

    // Face-down indicator
    if (salvage.isFaceDown) {
      const questionGeo = new THREE.RingGeometry(0.1, 0.2, 6);
      const questionMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.5,
      });
      const question = new THREE.Mesh(questionGeo, questionMat);
      question.rotation.x = -Math.PI / 2;
      question.position.set(pos.x, size + 0.3, pos.z);
      group.add(question);
    }
  }
}

// ── Debris ──────────────────────────────────────────────────

function renderDebris(game: GameState, group: THREE.Group): void {
  for (const debris of game.table.debris) {
    const geo = new THREE.TetrahedronGeometry(0.2, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.debris,
      roughness: 0.8,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.entityId = debris.id;
    mesh.userData.entityType = "debris";
    mesh.position.set(debris.position.x, 0.2, debris.position.z);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    group.add(mesh);
  }
}

// ── Tethers ─────────────────────────────────────────────────

function renderTethers(game: GameState, group: THREE.Group): void {
  for (const tether of game.table.wrecks.length === 0 ? [] : game.tethers) {
    const posA = getEntityWorldPos(game, tether.endpointA.entityId);
    const posB = getEntityWorldPos(game, tether.endpointB.entityId);
    if (!posA || !posB) continue;

    const points = [
      new THREE.Vector3(posA.x, 0.3, posA.z),
      new THREE.Vector3(posB.x, 0.3, posB.z),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: tether.state === "taut" ? COLORS.tetherTaut : COLORS.tether,
      linewidth: 1,
    });
    const line = new THREE.Line(geo, mat);
    line.userData.entityId = tether.id;
    line.userData.entityType = "tether";
    group.add(line);
  }
}

// ── Velocity arrows ─────────────────────────────────────────

function renderVelocityArrows(game: GameState, group: THREE.Group): void {
  // Ships
  for (const player of Object.values(game.players)) {
    const ship = player.ship;
    if (ship.velocity.magnitude > 0) {
      addVelocityArrow(group, ship.position, ship.velocity, parseInt(player.color.slice(1), 16));
    }
  }

  // Crew
  for (const player of Object.values(game.players)) {
    for (const crew of Object.values(player.crews)) {
      if (crew.position === "embarked" || crew.state === "lost") continue;
      if (crew.velocity.magnitude > 0) {
        addVelocityArrow(group, crew.position as Vec2, crew.velocity, parseInt(player.color.slice(1), 16));
      }
    }
  }
}

function addVelocityArrow(
  group: THREE.Group,
  pos: Vec2,
  vel: Velocity,
  color: number
): void {
  const inches = VELOCITY_INCHES[vel.magnitude] ?? 0;
  if (inches === 0) return;

  const dir = new THREE.Vector3(
    Math.cos(vel.direction),
    0,
    Math.sin(vel.direction)
  ).normalize();

  const origin = new THREE.Vector3(pos.x, 1.2, pos.z);
  const arrow = new THREE.ArrowHelper(
    dir,
    origin,
    inches,
    color,
    inches * 0.2,
    0.3
  );
  group.add(arrow);
}

// ── Helpers ─────────────────────────────────────────────────

function getEntityWorldPos(game: GameState, entityId: string): Vec2 | null {
  for (const player of Object.values(game.players)) {
    if (player.ship.id === entityId) return player.ship.position;
    for (const crew of Object.values(player.crews)) {
      if (crew.id === entityId && crew.position !== "embarked")
        return crew.position as Vec2;
    }
  }
  for (const wreck of game.table.wrecks) {
    if (wreck.id === entityId) return wreck.position;
  }
  for (const asteroid of game.table.asteroids) {
    if (asteroid.id === entityId) return asteroid.position;
  }
  for (const salvage of game.table.looseSalvage) {
    if (salvage.id === entityId && typeof salvage.position === "object")
      return salvage.position as Vec2;
  }
  return null;
}
