import * as THREE from "three";
import type { Vec2 } from "../../engine/types";

interface EntityTarget {
  position: THREE.Vector3;
  rotationY: number;
  scale: THREE.Vector3;
}

const LERP_SPEED = 6; // Higher = faster interpolation

/**
 * Tracks entity meshes and smoothly interpolates their positions/rotations
 * toward target values each frame.
 */
export class Animator {
  private targets = new Map<string, EntityTarget>();
  private meshes = new Map<string, THREE.Object3D>();

  /** Register a mesh for animation tracking */
  register(entityId: string, mesh: THREE.Object3D): void {
    this.meshes.set(entityId, mesh);
    // Initialize target to current position
    this.targets.set(entityId, {
      position: mesh.position.clone(),
      rotationY: mesh.rotation.y,
      scale: mesh.scale.clone(),
    });
  }

  /** Set where an entity should move/rotate to */
  setTarget(entityId: string, position: Vec2, rotationY: number, y?: number): void {
    const existing = this.targets.get(entityId);
    this.targets.set(entityId, {
      position: new THREE.Vector3(position.x, y ?? existing?.position.y ?? 0, position.z),
      rotationY,
      scale: existing?.scale ?? new THREE.Vector3(1, 1, 1),
    });
  }

  /** Remove an entity from tracking */
  remove(entityId: string): void {
    this.targets.delete(entityId);
    this.meshes.delete(entityId);
  }

  /** Call every frame in the animation loop */
  update(deltaTime: number): void {
    const t = Math.min(1, LERP_SPEED * deltaTime);

    for (const [id, target] of this.targets) {
      const mesh = this.meshes.get(id);
      if (!mesh) continue;

      // Lerp position
      mesh.position.lerp(target.position, t);

      // Lerp rotation (shortest path)
      let angleDiff = target.rotationY - mesh.rotation.y;
      // Normalize to [-PI, PI]
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      mesh.rotation.y += angleDiff * t;
    }
  }

  /** Snap all entities to their targets immediately (no lerp) */
  snapAll(): void {
    for (const [id, target] of this.targets) {
      const mesh = this.meshes.get(id);
      if (!mesh) continue;
      mesh.position.copy(target.position);
      mesh.rotation.y = target.rotationY;
    }
  }

  /** Clear all tracking */
  clear(): void {
    this.targets.clear();
    this.meshes.clear();
  }

  getMesh(entityId: string): THREE.Object3D | undefined {
    return this.meshes.get(entityId);
  }
}
