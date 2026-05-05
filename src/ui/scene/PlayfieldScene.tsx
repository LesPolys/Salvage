import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { useGameStore } from "../store";
import { renderEntities, cleanupEntities } from "./EntityRenderer";

const TABLE_SIZE = 36; // inches = world units
const HALF = TABLE_SIZE / 2;

export function PlayfieldScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    entityGroup: THREE.Group;
    gridHelper: THREE.GridHelper;
    animId: number;
  } | null>(null);

  const game = useGameStore((s) => s.game);
  const showGrid = useGameStore((s) => s.showGrid);
  const selectEntity = useGameStore((s) => s.selectEntity);

  // Init scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x0a0a1a);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0a1a, 0.008);

    // Camera — isometric-ish, ~30° down
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200);
    camera.position.set(0, 45, 35);
    camera.lookAt(0, 0, 0);

    // Controls
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

    const rimLight = new THREE.DirectionalLight(0x6688cc, 0.3);
    rimLight.position.set(-15, 20, -10);
    scene.add(rimLight);

    // Ground plane — dark space grid
    const groundGeo = new THREE.PlaneGeometry(TABLE_SIZE + 4, TABLE_SIZE + 4);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x080818,
      roughness: 0.95,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    scene.add(ground);

    // Table boundary lines
    const borderGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-HALF, 0, -HALF),
      new THREE.Vector3(HALF, 0, -HALF),
      new THREE.Vector3(HALF, 0, HALF),
      new THREE.Vector3(-HALF, 0, HALF),
      new THREE.Vector3(-HALF, 0, -HALF),
    ]);
    const borderMat = new THREE.LineBasicMaterial({ color: 0x334455, linewidth: 1 });
    scene.add(new THREE.Line(borderGeo, borderMat));

    // Grid
    const gridHelper = new THREE.GridHelper(TABLE_SIZE, TABLE_SIZE, 0x1a1a2e, 0x111122);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    // Compass (N/S/E/W markers)
    const compassFont = { N: [0, HALF + 1.5], S: [0, -HALF - 1.5], E: [HALF + 1.5, 0], W: [-HALF - 1.5, 0] };
    for (const [label, [x, z]] of Object.entries(compassFont)) {
      const sprite = makeTextSprite(label, 0x667788);
      sprite.position.set(x, 0.5, z);
      sprite.scale.set(2, 1, 1);
      scene.add(sprite);
    }

    // Entity group
    const entityGroup = new THREE.Group();
    scene.add(entityGroup);

    // Raycaster for click-to-select
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onClick = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(entityGroup.children, true);

      if (intersects.length > 0) {
        let obj: THREE.Object3D | null = intersects[0].object;
        while (obj && !obj.userData.entityId) {
          obj = obj.parent;
        }
        if (obj?.userData.entityId) {
          selectEntity(obj.userData.entityId);
          return;
        }
      }
      selectEntity(null);
    };
    renderer.domElement.addEventListener("click", onClick);

    // Resize
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    // Animate
    let animId = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    sceneRef.current = { scene, camera, renderer, controls, entityGroup, gridHelper, animId };

    return () => {
      cancelAnimationFrame(animId);
      renderer.domElement.removeEventListener("click", onClick);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [selectEntity]);

  // Update grid visibility
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.gridHelper.visible = showGrid;
    }
  }, [showGrid]);

  const selectedEntityId = useGameStore((s) => s.selectedEntityId);

  // Render entities when game state or selection changes
  useEffect(() => {
    if (!sceneRef.current || !game) return;
    const { entityGroup } = sceneRef.current;
    cleanupEntities(entityGroup);
    renderEntities(game, entityGroup, selectedEntityId);
  }, [game, selectedEntityId]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
      }}
    />
  );
}

function makeTextSprite(text: string, color: number): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  ctx.font = "bold 24px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 32, 16);

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  return new THREE.Sprite(mat);
}
