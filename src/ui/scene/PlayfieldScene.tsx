import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { useGameStore } from "../store";
import { renderEntities, cleanupEntities, getAnimator } from "./EntityRenderer";
import { VELOCITY_INCHES } from "../../config/rules";
import type { Vec2 } from "../../engine/types";
import { addVelocities, makeVelocity } from "../../engine/physics";
import type { SpeedTier } from "../../engine/types";
import { RULES } from "../../config/rules";

const TABLE_SIZE = 36;
const HALF = TABLE_SIZE / 2;
const ARROW_Y = 1.5; // height of vector preview arrows

export function PlayfieldScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    entityGroup: THREE.Group;
    previewGroup: THREE.Group;
    gridHelper: THREE.GridHelper;
    groundPlane: THREE.Mesh;
    animId: number;
  } | null>(null);

  const game = useGameStore((s) => s.game);
  const showGrid = useGameStore((s) => s.showGrid);
  const selectEntity = useGameStore((s) => s.selectEntity);
  const targeting = useGameStore((s) => s.targeting);
  const targetingMousePos = useGameStore((s) => s.targetingMousePos);

  // Raycast mouse to ground plane
  const raycastToGround = useCallback(
    (clientX: number, clientY: number): Vec2 | null => {
      const s = sceneRef.current;
      if (!s) return null;
      const rect = s.renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, s.camera);
      const hits = raycaster.intersectObject(s.groundPlane);
      if (hits.length > 0) {
        return { x: hits[0].point.x, z: hits[0].point.z };
      }
      return null;
    },
    []
  );

  // Init scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x0a0a1a);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0a1a, 0.008);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200);
    camera.position.set(0, 45, 35);
    camera.lookAt(0, 0, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.maxPolarAngle = Math.PI / 2.2;
    controls.minDistance = 15;
    controls.maxDistance = 80;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    controls.update();

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x334466, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffeedd, 1.0);
    dirLight.position.set(20, 40, 15);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 100;
    dirLight.shadow.camera.left = -HALF;
    dirLight.shadow.camera.right = HALF;
    dirLight.shadow.camera.top = HALF;
    dirLight.shadow.camera.bottom = -HALF;
    scene.add(dirLight);
    scene.add(new THREE.DirectionalLight(0x6688cc, 0.3).translateX(-15).translateY(20).translateZ(-10));

    // Ground plane (invisible but raycastable)
    const groundGeo = new THREE.PlaneGeometry(TABLE_SIZE + 20, TABLE_SIZE + 20);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x080818,
      roughness: 0.95,
      metalness: 0.1,
    });
    const groundPlane = new THREE.Mesh(groundGeo, groundMat);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.y = -0.05;
    groundPlane.receiveShadow = true;
    scene.add(groundPlane);

    // Border
    const borderGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-HALF, 0, -HALF),
      new THREE.Vector3(HALF, 0, -HALF),
      new THREE.Vector3(HALF, 0, HALF),
      new THREE.Vector3(-HALF, 0, HALF),
      new THREE.Vector3(-HALF, 0, -HALF),
    ]);
    scene.add(new THREE.Line(borderGeo, new THREE.LineBasicMaterial({ color: 0x334455 })));

    // Grid
    const gridHelper = new THREE.GridHelper(TABLE_SIZE, TABLE_SIZE, 0x1a1a2e, 0x111122);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    // Compass
    for (const [label, [x, z]] of Object.entries({
      N: [0, HALF + 1.5], S: [0, -HALF - 1.5], E: [HALF + 1.5, 0], W: [-HALF - 1.5, 0],
    })) {
      const sprite = makeTextSprite(label, 0x667788);
      sprite.position.set(x, 0.5, z);
      sprite.scale.set(2, 1, 1);
      scene.add(sprite);
    }

    const entityGroup = new THREE.Group();
    scene.add(entityGroup);

    const previewGroup = new THREE.Group();
    scene.add(previewGroup);

    // Click handler
    const raycaster = new THREE.Raycaster();
    const mouseVec = new THREE.Vector2();

    const onClick = (event: MouseEvent) => {
      // If targeting, left click confirms
      const store = useGameStore.getState();
      if (store.targeting) {
        const worldPos = raycastToGroundDirect(event.clientX, event.clientY, renderer, camera, groundPlane);
        if (worldPos) {
          store.confirmTargeting(worldPos);
        }
        return;
      }

      // Normal click: select entity
      const rect = renderer.domElement.getBoundingClientRect();
      mouseVec.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseVec.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouseVec, camera);
      const intersects = raycaster.intersectObjects(entityGroup.children, true);
      if (intersects.length > 0) {
        let obj: THREE.Object3D | null = intersects[0].object;
        while (obj && !obj.userData.entityId) obj = obj.parent;
        if (obj?.userData.entityId) {
          selectEntity(obj.userData.entityId);
          return;
        }
      }
      selectEntity(null);
    };

    const onMouseMove = (event: MouseEvent) => {
      const store = useGameStore.getState();
      if (!store.targeting) return;
      const worldPos = raycastToGroundDirect(event.clientX, event.clientY, renderer, camera, groundPlane);
      if (worldPos) {
        store.updateTargetingMouse(worldPos);
      }
    };

    const onContextMenu = (event: MouseEvent) => {
      const store = useGameStore.getState();
      if (store.targeting) {
        event.preventDefault();
        store.cancelTargeting();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        const store = useGameStore.getState();
        if (store.targeting) store.cancelTargeting();
      }
    };

    renderer.domElement.addEventListener("click", onClick);
    renderer.domElement.addEventListener("mousemove", onMouseMove);
    renderer.domElement.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown);

    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    let animId = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      controls.update();
      getAnimator().update(dt);
      renderer.render(scene, camera);
    };
    animate();

    sceneRef.current = { scene, camera, renderer, controls, entityGroup, previewGroup, gridHelper, groundPlane, animId };

    return () => {
      cancelAnimationFrame(animId);
      renderer.domElement.removeEventListener("click", onClick);
      renderer.domElement.removeEventListener("mousemove", onMouseMove);
      renderer.domElement.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [selectEntity, raycastToGround]);

  // Grid visibility
  useEffect(() => {
    if (sceneRef.current) sceneRef.current.gridHelper.visible = showGrid;
  }, [showGrid]);

  // Disable orbit panning during targeting (left click is for confirming)
  useEffect(() => {
    if (!sceneRef.current) return;
    const { controls } = sceneRef.current;
    if (targeting) {
      controls.mouseButtons = { LEFT: undefined as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    } else {
      controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    }
  }, [targeting]);

  const selectedEntityId = useGameStore((s) => s.selectedEntityId);

  // Render entities — capture old positions BEFORE cleanup
  useEffect(() => {
    if (!sceneRef.current || !game) return;
    const { entityGroup } = sceneRef.current;

    // Save current mesh positions before destroying them
    const oldPositions = new Map<string, { x: number; y: number; z: number; ry: number }>();
    entityGroup.traverse((child) => {
      if (child.userData.entityId) {
        oldPositions.set(child.userData.entityId, {
          x: child.position.x, y: child.position.y, z: child.position.z,
          ry: child.rotation.y,
        });
      }
    });

    cleanupEntities(entityGroup);
    renderEntities(game, entityGroup, selectedEntityId, oldPositions);
  }, [game, selectedEntityId]);

  // Render vector preview arrows during targeting
  useEffect(() => {
    if (!sceneRef.current) return;
    const { previewGroup } = sceneRef.current;

    // Clear previous preview
    while (previewGroup.children.length > 0) {
      const child = previewGroup.children[0];
      previewGroup.remove(child);
    }

    if (!targeting) return;

    // Deploy phase: highlight the nearest edge to the mouse
    if (targeting.targetKind === "point" && game?.meta.phase === "deploy") {
      const edgeBuf = 2;
      const dimMat = new THREE.MeshBasicMaterial({ color: 0x224433, transparent: true, opacity: 0.04, side: THREE.DoubleSide });
      const hotMat = new THREE.MeshBasicMaterial({ color: 0x22cc44, transparent: true, opacity: 0.15, side: THREE.DoubleSide });

      // Determine which edge the mouse is nearest to
      let nearestEdge: "top" | "bottom" | "left" | "right" | null = null;
      if (targetingMousePos) {
        const mx = targetingMousePos.x;
        const mz = targetingMousePos.z;
        const dists = {
          top: HALF - mz,
          bottom: mz + HALF,
          right: HALF - mx,
          left: mx + HALF,
        };
        nearestEdge = Object.entries(dists).sort((a, b) => a[1] - b[1])[0][0] as "top" | "bottom" | "left" | "right";
      }

      // Check which edges are allowed
      // First player: all 4 edges. After that: only the first edge and its opposite.
      const placedShips = Object.values(game.players).filter((p) => p.ship.placed && p.ship.deployEdge);
      let allowedEdges: Set<string> | null = null; // null = all allowed
      if (placedShips.length > 0) {
        const firstEdge = placedShips[0].ship.deployEdge!;
        const opposite: Record<string, string> = { top: "bottom", bottom: "top", left: "right", right: "left" };
        // Only the opposite edge is available (first edge is already taken)
        allowedEdges = new Set([opposite[firstEdge]]);
        // If same-edge allies exist (3-4 player), also allow first edge
        allowedEdges.add(firstEdge);
      }

      // Draw each edge zone
      const edges: Array<{ name: string; geo: THREE.PlaneGeometry; pos: [number, number, number] }> = [
        { name: "top", geo: new THREE.PlaneGeometry(TABLE_SIZE, edgeBuf), pos: [0, 0.03, HALF - edgeBuf / 2] },
        { name: "bottom", geo: new THREE.PlaneGeometry(TABLE_SIZE, edgeBuf), pos: [0, 0.03, -HALF + edgeBuf / 2] },
        { name: "left", geo: new THREE.PlaneGeometry(edgeBuf, TABLE_SIZE), pos: [-HALF + edgeBuf / 2, 0.03, 0] },
        { name: "right", geo: new THREE.PlaneGeometry(edgeBuf, TABLE_SIZE), pos: [HALF - edgeBuf / 2, 0.03, 0] },
      ];

      for (const e of edges) {
        const isNearest = e.name === nearestEdge;
        const isAllowed = !allowedEdges || allowedEdges.has(e.name);
        const mat = isNearest && isAllowed ? hotMat
          : isAllowed ? dimMat
          : new THREE.MeshBasicMaterial({ color: 0x442222, transparent: true, opacity: 0.04, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(e.geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(...e.pos);
        previewGroup.add(mesh);

        // Edge label
        if (isNearest && isAllowed) {
          const edgeBorder = new THREE.BufferGeometry().setFromPoints(
            e.name === "top" || e.name === "bottom"
              ? [new THREE.Vector3(-HALF, 0.06, e.pos[2]), new THREE.Vector3(HALF, 0.06, e.pos[2])]
              : [new THREE.Vector3(e.pos[0], 0.06, -HALF), new THREE.Vector3(e.pos[0], 0.06, HALF)]
          );
          previewGroup.add(new THREE.Line(edgeBorder, new THREE.LineBasicMaterial({ color: 0x44ff66 })));
        }
      }

      // Ship ghost at cursor position (snapped to nearest allowed edge)
      if (targetingMousePos && nearestEdge && (!allowedEdges || allowedEdges.has(nearestEdge))) {
        // Snap position to edge
        let snapPos = { x: targetingMousePos.x, z: targetingMousePos.z };
        switch (nearestEdge) {
          case "top": snapPos = { x: targetingMousePos.x, z: HALF - edgeBuf }; break;
          case "bottom": snapPos = { x: targetingMousePos.x, z: -HALF + edgeBuf }; break;
          case "left": snapPos = { x: -HALF + edgeBuf, z: targetingMousePos.z }; break;
          case "right": snapPos = { x: HALF - edgeBuf, z: targetingMousePos.z }; break;
        }

        // Ghost ship outline
        const ghostGeo = new THREE.BoxGeometry(
          RULES.ship.baseSize.x, 0.3, RULES.ship.baseSize.z
        );
        const ghostMat = new THREE.MeshBasicMaterial({
          color: 0x44cc44, transparent: true, opacity: 0.3, wireframe: true,
        });
        const ghost = new THREE.Mesh(ghostGeo, ghostMat);
        ghost.position.set(snapPos.x, 0.4, snapPos.z);

        // Rotate ghost to face inward
        const facingAngles: Record<string, number> = {
          top: -Math.PI / 2, bottom: Math.PI / 2, left: 0, right: Math.PI,
        };
        ghost.rotation.y = -(facingAngles[nearestEdge] + Math.PI / 2);
        previewGroup.add(ghost);

        // Front arrow on ghost
        const arrowDir = new THREE.Vector3(
          Math.cos(facingAngles[nearestEdge]), 0, Math.sin(facingAngles[nearestEdge])
        ).normalize();
        const arrow = new THREE.ArrowHelper(arrowDir, new THREE.Vector3(snapPos.x, 0.8, snapPos.z), 2, 0x44ff66, 0.6, 0.3);
        previewGroup.add(arrow);
      }

      return;
    }

    if (!targetingMousePos) return;

    const origin = new THREE.Vector3(targeting.unitPosition.x, ARROW_Y, targeting.unitPosition.z);
    const mouseWorld = targetingMousePos;

    // Compute thrust direction from unit to mouse
    const dx = mouseWorld.x - targeting.unitPosition.x;
    const dz = mouseWorld.z - targeting.unitPosition.z;
    const thrustDir = Math.atan2(dz, dx);

    // Determine thrust magnitude from the action type
    const thrustTier = getThrustTier(targeting.actionType, game);
    const thrustInches = VELOCITY_INCHES[thrustTier] ?? 0;

    if (thrustInches === 0) return;

    // 1. Current velocity arrow (blue, dimmer)
    const curVel = targeting.currentVelocity;
    if (curVel.magnitude > 0) {
      const curInches = VELOCITY_INCHES[curVel.magnitude] ?? 0;
      const curDir = new THREE.Vector3(Math.cos(curVel.direction), 0, Math.sin(curVel.direction)).normalize();
      const curArrow = new THREE.ArrowHelper(curDir, origin, curInches, 0x4466aa, curInches * 0.15, 0.25);
      previewGroup.add(curArrow);

      // Label
      const curLabel = makeTextSprite("drift", 0x4466aa);
      const curTip = origin.clone().add(curDir.clone().multiplyScalar(curInches / 2));
      curLabel.position.copy(curTip).add(new THREE.Vector3(0, 0.8, 0));
      curLabel.scale.set(1.5, 0.75, 1);
      previewGroup.add(curLabel);
    }

    // 2. Thrust arrow (green, follows mouse)
    const thrustDirVec = new THREE.Vector3(Math.cos(thrustDir), 0, Math.sin(thrustDir)).normalize();
    const thrustArrow = new THREE.ArrowHelper(thrustDirVec, origin, thrustInches, 0x44cc44, thrustInches * 0.15, 0.25);
    previewGroup.add(thrustArrow);

    const thrustLabel = makeTextSprite("thrust", 0x44cc44);
    const thrustMid = origin.clone().add(thrustDirVec.clone().multiplyScalar(thrustInches / 2));
    thrustLabel.position.copy(thrustMid).add(new THREE.Vector3(0, 0.8, 0));
    thrustLabel.scale.set(1.5, 0.75, 1);
    previewGroup.add(thrustLabel);

    // 3. Result arrow (yellow, tip-to-tail)
    const thrustVelocity = makeVelocity(thrustDir, thrustTier);
    const resultVelocity = addVelocities(curVel, thrustVelocity);

    if (resultVelocity.magnitude > 0) {
      const resInches = VELOCITY_INCHES[resultVelocity.magnitude] ?? 0;
      const resDir = new THREE.Vector3(
        Math.cos(resultVelocity.direction), 0, Math.sin(resultVelocity.direction)
      ).normalize();
      const resArrow = new THREE.ArrowHelper(resDir, origin.clone().add(new THREE.Vector3(0, 0.3, 0)), resInches, 0xffcc00, resInches * 0.15, 0.3);
      previewGroup.add(resArrow);

      const resLabel = makeTextSprite("result", 0xffcc00);
      const resTip = origin.clone().add(resDir.clone().multiplyScalar(resInches));
      resLabel.position.copy(resTip).add(new THREE.Vector3(0, 1.2, 0));
      resLabel.scale.set(1.5, 0.75, 1);
      previewGroup.add(resLabel);

      // Speed tier label
      const tierNames = ["", "Short", "Medium", "Long"];
      const tierLabel = makeTextSprite(tierNames[resultVelocity.magnitude] ?? "", 0xffcc00);
      tierLabel.position.copy(resTip).add(new THREE.Vector3(0, 0.5, 0));
      tierLabel.scale.set(2, 1, 1);
      previewGroup.add(tierLabel);
    }
  }, [targeting, targetingMousePos, game]);

  // Cursor style
  const cursorStyle = targeting ? "crosshair" : "default";

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        cursor: cursorStyle,
      }}
    >
      {targeting && (
        <div style={{
          position: "absolute",
          top: "8px",
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(10, 10, 26, 0.9)",
          border: "1px solid #334455",
          borderRadius: "4px",
          padding: "6px 14px",
          fontFamily: "monospace",
          fontSize: "12px",
          color: "#88cc88",
          pointerEvents: "none",
          zIndex: 10,
        }}>
          Click on the table to set direction — Right-click or Esc to cancel
        </div>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────

function raycastToGroundDirect(
  clientX: number,
  clientY: number,
  renderer: THREE.WebGLRenderer,
  camera: THREE.Camera,
  ground: THREE.Mesh
): Vec2 | null {
  const rect = renderer.domElement.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(ground);
  if (hits.length > 0) return { x: hits[0].point.x, z: hits[0].point.z };
  return null;
}

function getThrustTier(actionType: string, _game: GameState | null): SpeedTier {
  switch (actionType) {
    case "burn-small": return 1;
    case "burn-big": return 2;
    case "burn-max": return 3;
    case "push-off": return 1;
    case "thruster-burn": return 2; // Default to medium; actual depends on die value
    default: return 1;
  }
}

function makeTextSprite(text: string, color: number): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  ctx.font = "bold 20px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 64, 16);
  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  return new THREE.Sprite(mat);
}

// Need this import for getThrustTier's return type
import type { GameState } from "../../engine/types";
