import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { PointerLockControls as ThreePointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { CSS3DObject, CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import * as THREE from "three";

const ROOM_SIZE = 20;
const WALL_HEIGHT = 8;
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.4;
const MOVE_SPEED = 4.5;
const SOFA_SPAWN: [number, number, number] = [-6.4, PLAYER_HEIGHT, -6.2];

const WALL_COLOR = "#EAECEE";

// ---------- Pearly white wall ----------
function Wall({
  position,
  rotation,
  width,
  height,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  width: number;
  height: number;
}) {
  return (
    <mesh position={position} rotation={rotation} receiveShadow>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial
        color={WALL_COLOR}
        roughness={0.2}
        metalness={0.1}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ---------- Ceiling ----------
function Ceiling() {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, WALL_HEIGHT, 0]} receiveShadow>
      <planeGeometry args={[ROOM_SIZE, ROOM_SIZE]} />
      <meshStandardMaterial color="#F0F0F0" roughness={0.3} metalness={0.1} />
    </mesh>
  );
}

// ---------- Floor with cyan neon grid ----------
function Floor() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[ROOM_SIZE, ROOM_SIZE]} />
        <meshStandardMaterial color="#1a1d24" roughness={0.4} metalness={0.3} />
      </mesh>
      <gridHelper args={[ROOM_SIZE, ROOM_SIZE, "#00ffff", "#00ffff"]} position={[0, 0.01, 0]} />
    </>
  );
}

// ---------- Room with 4 walls ----------
function Room() {
  const half = ROOM_SIZE / 2;
  const midY = WALL_HEIGHT / 2;
  return (
    <>
      <Floor />
      <Ceiling />
      <Wall position={[0, midY, -half]} rotation={[0, 0, 0]} width={ROOM_SIZE} height={WALL_HEIGHT} />
      <Wall position={[0, midY, half]} rotation={[0, Math.PI, 0]} width={ROOM_SIZE} height={WALL_HEIGHT} />
      <Wall
        position={[-half, midY, 0]}
        rotation={[0, Math.PI / 2, 0]}
        width={ROOM_SIZE}
        height={WALL_HEIGHT}
      />
      <Wall
        position={[half, midY, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        width={ROOM_SIZE}
        height={WALL_HEIGHT}
      />
    </>
  );
}

// ---------- Holographic neon screen (reusable on any wall) ----------
function HoloScreen({
  position,
  rotation,
  width = 8,
  height = 4.5,
  frameColor = "#00ffff",
  panelOpacity = 1,
  showMask = true,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  width?: number;
  height?: number;
  frameColor?: string;
  panelOpacity?: number;
  showMask?: boolean;
}) {
  const w = width;
  const h = height;
  const panelInset = 0.1;
  const frameInset = panelInset + 0.01;
  return (
    <group position={position} rotation={rotation}>
      {/* Solid black panel with thickness to block artifacts behind it */}
      <mesh position={[0, 0, panelInset]}>
        <boxGeometry args={[w, h, 0.12]} />
        <meshBasicMaterial color={0x000000} toneMapped={false} transparent opacity={panelOpacity} />
      </mesh>
      {showMask && (
        <mesh position={[0, 0, panelInset + 0.08]} renderOrder={2000}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial color={0x000000} toneMapped={false} depthTest={false} depthWrite={false} />
        </mesh>
      )}
      {/* Border lines using thin emissive planes */}
      {[
        { p: [0, h / 2, frameInset] as [number, number, number], s: [w, 0.04] as [number, number] },
        { p: [0, -h / 2, frameInset] as [number, number, number], s: [w, 0.04] as [number, number] },
        { p: [-w / 2, 0, frameInset] as [number, number, number], s: [0.04, h] as [number, number] },
        { p: [w / 2, 0, frameInset] as [number, number, number], s: [0.04, h] as [number, number] },
      ].map((b, i) => (
        <mesh key={i} position={b.p} renderOrder={2001}>
          <planeGeometry args={b.s} />
          <meshBasicMaterial color={frameColor} toneMapped={false} depthTest={false} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

type CssEmbed = {
  position: [number, number, number];
  rotation: [number, number, number];
  width: number;
  height: number;
  src: string;
  forwardOffset?: number;
  kind?: "media" | "browser";
  title?: string;
  isolateMouse?: boolean;
};

function ScreenEmbedsCss3D({
  embeds,
  onEmbedInteractionChange,
}: {
  embeds: CssEmbed[];
  onEmbedInteractionChange?: (active: boolean) => void;
}) {
  const { camera, gl, size } = useThree();
  const cssRendererRef = useRef<CSS3DRenderer | null>(null);
  const cssSceneRef = useRef<THREE.Scene>(new THREE.Scene());
  const cssObjectsRef = useRef<Array<{ obj: CSS3DObject; shell: HTMLDivElement; cleanup: () => void }>>([]);

  useEffect(() => {
    const host = gl.domElement.parentElement;
    if (!host) return;

    const renderer = new CSS3DRenderer();
    renderer.setSize(size.width, size.height);
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    // Avoid an invisible global blocker; only screen elements receive events.
    renderer.domElement.style.pointerEvents = "none";
    renderer.domElement.style.cursor = "default";
    renderer.domElement.style.zIndex = "20";
    host.appendChild(renderer.domElement);
    cssRendererRef.current = renderer;

    const unlockPointer = () => {
      if (document.pointerLockElement) {
        void document.exitPointerLock();
      }
    };
    cssObjectsRef.current = embeds.map((embed) => {
      const iframe = document.createElement("iframe");
      iframe.src = embed.src;
      iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      iframe.style.width = "100%";
      iframe.style.height = embed.kind === "browser" ? "calc(100% - 56px)" : "100%";
      iframe.style.border = "0";
      iframe.style.pointerEvents = "auto";
      iframe.style.cursor = "auto";

      const shell = document.createElement("div");
      shell.style.width = "1280px";
      shell.style.height = "720px";
      shell.style.background = "#000";
      shell.style.pointerEvents = "auto";
      shell.style.overflow = "hidden";
      shell.style.display = "flex";
      shell.style.flexDirection = "column";
      shell.tabIndex = 0;

      if (embed.kind === "browser") {
        const toolbar = document.createElement("div");
        toolbar.style.height = "56px";
        toolbar.style.display = "flex";
        toolbar.style.alignItems = "center";
        toolbar.style.gap = "10px";
        toolbar.style.padding = "0 12px";
        toolbar.style.background = "rgba(0,0,0,0.92)";
        toolbar.style.borderBottom = "1px solid rgba(0,255,255,0.35)";
        toolbar.style.pointerEvents = "auto";
        toolbar.style.flex = "0 0 56px";

        const mkBtn = (label: string) => {
          const btn = document.createElement("button");
          btn.textContent = label;
          btn.style.background = "rgba(0,255,255,0.12)";
          btn.style.color = "#9ffcff";
          btn.style.border = "1px solid rgba(0,255,255,0.45)";
          btn.style.borderRadius = "6px";
          btn.style.padding = "5px 10px";
          btn.style.fontSize = "13px";
          btn.style.cursor = "pointer";
          btn.style.pointerEvents = "auto";
          return btn;
        };

        const backBtn = mkBtn("Atras");
        const homeBtn = mkBtn("Home");
        const title = document.createElement("div");
        title.textContent = embed.title ?? "Navegador";
        title.style.marginLeft = "6px";
        title.style.color = "rgba(180,255,255,0.9)";
        title.style.font = "500 13px sans-serif";
        title.style.whiteSpace = "nowrap";
        title.style.overflow = "hidden";
        title.style.textOverflow = "ellipsis";

        backBtn.onclick = () => {
          try {
            iframe.contentWindow?.history.back();
          } catch {
            iframe.src = embed.src;
          }
        };
        homeBtn.onclick = () => {
          iframe.src = embed.src;
        };

        toolbar.appendChild(backBtn);
        toolbar.appendChild(homeBtn);
        toolbar.appendChild(title);
        shell.appendChild(toolbar);
      }

      shell.appendChild(iframe);

      const engageMouse = (event?: Event) => {
        if (event) {
          event.stopPropagation();
        }
        unlockPointer();
        iframe.focus();
        shell.focus();
        onEmbedInteractionChange?.(true);
        renderer.domElement.style.zIndex = "40";
        gl.domElement.style.pointerEvents = "none";
      };
      const releaseMouse = () => {
        onEmbedInteractionChange?.(false);
        renderer.domElement.style.zIndex = "20";
        gl.domElement.style.pointerEvents = "auto";
      };
      shell.addEventListener("mouseenter", engageMouse);
      shell.addEventListener("mousemove", engageMouse);
      shell.addEventListener("mousedown", engageMouse);
      shell.addEventListener("wheel", engageMouse, { passive: true });
      shell.addEventListener("mouseleave", releaseMouse);
      iframe.addEventListener("mouseenter", engageMouse);
      iframe.addEventListener("mousemove", engageMouse);
      iframe.addEventListener("mousedown", engageMouse);
      iframe.addEventListener("wheel", engageMouse, { passive: true });

      const obj = new CSS3DObject(shell);
      obj.element.style.pointerEvents = "auto";
      obj.scale.set(embed.width / 1280, embed.height / 720, 1);
      cssSceneRef.current.add(obj);
      return {
        obj,
        shell,
        cleanup: () => {
          shell.removeEventListener("mouseenter", engageMouse);
          shell.removeEventListener("mousemove", engageMouse);
          shell.removeEventListener("mousedown", engageMouse);
          shell.removeEventListener("wheel", engageMouse);
          shell.removeEventListener("mouseleave", releaseMouse);
          iframe.removeEventListener("mouseenter", engageMouse);
          iframe.removeEventListener("mousemove", engageMouse);
          iframe.removeEventListener("mousedown", engageMouse);
          iframe.removeEventListener("wheel", engageMouse);
        },
      };
    });

    return () => {
      onEmbedInteractionChange?.(false);
      for (const { obj, shell, cleanup } of cssObjectsRef.current) {
        cleanup();
        cssSceneRef.current.remove(obj);
        shell.remove();
      }
      cssObjectsRef.current = [];
      gl.domElement.style.pointerEvents = "auto";
      renderer.domElement.remove();
      cssRendererRef.current = null;
    };
  }, [embeds, gl, onEmbedInteractionChange, size.height, size.width]);

  useEffect(() => {
    cssRendererRef.current?.setSize(size.width, size.height);
  }, [size.height, size.width]);

  useFrame(() => {
    const renderer = cssRendererRef.current;
    if (!renderer) return;
    for (let i = 0; i < embeds.length; i += 1) {
      const entry = cssObjectsRef.current[i];
      const embed = embeds[i];
      if (!entry || !embed) continue;
      const { obj } = entry;
      obj.position.set(embed.position[0], embed.position[1], embed.position[2]);
      obj.rotation.set(embed.rotation[0], embed.rotation[1], embed.rotation[2]);
      const offset = embed.forwardOffset ?? 0.11;
      const forward = new THREE.Vector3(0, 0, offset).applyEuler(new THREE.Euler(...embed.rotation));
      obj.position.add(forward);
    }

    renderer.render(cssSceneRef.current, camera);
  });

  return null;
}

// ---------- 4 holographic screens, one centered on each wall ----------
function HoloScreens({
  onEmbedInteractionChange,
}: {
  onEmbedInteractionChange?: (active: boolean) => void;
}) {
  const half = ROOM_SIZE / 2;
  const y = WALL_HEIGHT / 2;
  const inset = 1.25;
  const panelWidth = 6.8;
  const panelHeight = 3.8;
  const screenEmbeds = useMemo<CssEmbed[]>(
    () => [
      {
        position: [0, y, half - inset],
        rotation: [0, Math.PI, 0],
        width: panelWidth * 0.95,
        height: panelHeight * 0.9,
        src: "https://www.youtube.com/embed/VOj_xsc-EBM?autoplay=1&mute=1&loop=1&playlist=VOj_xsc-EBM",
        forwardOffset: 0.01,
      },
      {
        position: [half - inset, y, 0],
        rotation: [0, -Math.PI / 2, 0],
        width: panelWidth * 0.95,
        height: panelHeight * 0.9,
        src: "https://www.youtube.com/embed/gL_rzDxgSw8?autoplay=1&mute=1&loop=1&playlist=gL_rzDxgSw8",
        forwardOffset: 0.01,
      },
      {
        // Pantalla 3 (lateral izquierda): navegador embebible
        position: [-half + inset, y, 0],
        rotation: [0, Math.PI / 2, 0],
        width: panelWidth * 0.95,
        height: panelHeight * 0.9,
        src: "https://www.facebook.com",
        forwardOffset: 0.02,
        kind: "browser",
        title: "Facebook",
      },
      {
        // Pantalla 4 (restante / trasera): Facebook login/home
        position: [0, y, -half + inset],
        rotation: [0, 0, 0],
        width: panelWidth * 0.95,
        height: panelHeight * 0.9,
        src: "https://www.google.com/search?igu=1",
        forwardOffset: 0.01,
        kind: "browser",
        title: "Chrome Virtual - Google",
      },
    ],
    [half, inset, panelHeight, panelWidth, y],
  );
  return (
    <>
      {/* Back wall (-Z) */}
      <HoloScreen
        position={[0, y, -half + inset]}
        rotation={[0, 0, 0]}
        width={panelWidth}
        height={panelHeight}
      />
      {/* Front wall (+Z) */}
      <HoloScreen
        position={[0, y, half - inset]}
        rotation={[0, Math.PI, 0]}
        width={panelWidth}
        height={panelHeight}
        panelOpacity={0.06}
        showMask={false}
      />
      {/* Left wall (-X) */}
      <HoloScreen
        position={[-half + inset, y, 0]}
        rotation={[0, Math.PI / 2, 0]}
        width={panelWidth}
        height={panelHeight}
      />
      {/* Right wall (+X) */}
      <HoloScreen
        position={[half - inset, y, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        width={panelWidth}
        height={panelHeight}
      />
      <ScreenEmbedsCss3D embeds={screenEmbeds} onEmbedInteractionChange={onEmbedInteractionChange} />
    </>
  );
}

function habitacionGlbUrl() {
  const base = import.meta.env.BASE_URL || "/";
  return base.endsWith("/") ? `${base}habitacion.glb` : `${base}/habitacion.glb`;
}

// ---------- Complemento decorativo: habitacion.glb ----------
function HabitacionComplement() {
  const [model, setModel] = useState<THREE.Group | null>(null);
  const [loadError, setLoadError] = useState(false);
  const frameNamePattern = /(picture|frame|cuadro|marco)/i;
  const lampNamePattern = /(lamp|light_fixture|fixture|lampara|l[a?]mpara|ceiling_light|sconce|bulb)/i;

  useEffect(() => {
    let cancelled = false;
    const loader = new GLTFLoader();

    setLoadError(false);
    loader.load(
      habitacionGlbUrl(),
      (gltf) => {
        if (cancelled) return;

        const root = gltf.scene.clone(true);
        const detectedFrames: THREE.Mesh[] = [];
        root.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;
          if (obj.name && lampNamePattern.test(obj.name)) {
            obj.visible = false;
            return;
          }
          obj.castShadow = true;
          obj.receiveShadow = true;
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) {
            if (m && "side" in m) (m as THREE.Material).side = THREE.DoubleSide;
          }
          if (obj.name && frameNamePattern.test(obj.name)) {
            detectedFrames.push(obj);
          }
        });

        // Add cyan translucent capture-panels over frame-like meshes.
        for (const frame of detectedFrames) {
          frame.geometry.computeBoundingBox();
          const bbox = frame.geometry.boundingBox;
          if (!bbox) continue;

          const size = new THREE.Vector3();
          const center = new THREE.Vector3();
          bbox.getSize(size);
          bbox.getCenter(center);

          // Treat smallest local dimension as depth and push panel 0.01 outward.
          const dims: Array<{ axis: "x" | "y" | "z"; value: number }> = [
            { axis: "x", value: Math.abs(size.x) },
            { axis: "y", value: Math.abs(size.y) },
            { axis: "z", value: Math.abs(size.z) },
          ] as const as Array<{ axis: "x" | "y" | "z"; value: number }>;
          dims.sort((a, b) => a.value - b.value);

          const depthAxis = dims[0]?.axis ?? "z";
          const widthAxis = dims[2]?.axis ?? "x";
          const heightAxis = dims[1]?.axis ?? "y";

          const axisSize = (v: THREE.Vector3, axis: "x" | "y" | "z") =>
            axis === "x" ? v.x : axis === "y" ? v.y : v.z;
          const panelWidth = Math.max(Math.abs(axisSize(size, widthAxis)), 0.05);
          const panelHeight = Math.max(Math.abs(axisSize(size, heightAxis)), 0.05);

          const panel = new THREE.Mesh(
            new THREE.PlaneGeometry(panelWidth, panelHeight),
            new THREE.MeshBasicMaterial({
              color: 0x00ffff,
              opacity: 0.3,
              transparent: true,
              side: THREE.DoubleSide,
              depthWrite: false,
            }),
          );

          panel.position.copy(center);
          const depthValue = depthAxis === "x" ? bbox.max.x : depthAxis === "y" ? bbox.max.y : bbox.max.z;
          if (depthAxis === "x") panel.position.x = depthValue + 0.01;
          if (depthAxis === "y") panel.position.y = depthValue + 0.01;
          if (depthAxis === "z") panel.position.z = depthValue + 0.01;
          panel.renderOrder = 10;

          // Orient plane so its normal matches the chosen depth axis.
          if (depthAxis === "x") panel.rotation.y = Math.PI / 2;
          if (depthAxis === "y") panel.rotation.x = -Math.PI / 2;

          frame.add(panel);
        }

        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        box.getSize(size);

        const minDim = 0.02;
        if (!Number.isFinite(size.x) || !Number.isFinite(size.y) || !Number.isFinite(size.z)) {
          setLoadError(true);
          return;
        }

        const sy = Math.max(size.y, minDim);
        // Uniform scale based on height so proportions remain intact.
        const uniformScale = WALL_HEIGHT / sy;
        root.scale.setScalar(uniformScale);
        // Force-fit width/depth to room size plus tiny overscan (no visible gaps).
        root.updateMatrixWorld(true);
        const fittedBox = new THREE.Box3().setFromObject(root);
        const fittedSize = new THREE.Vector3();
        fittedBox.getSize(fittedSize);
        const targetSpan = ROOM_SIZE + 0.6;
        root.scale.x *= targetSpan / Math.max(fittedSize.x, minDim);
        root.scale.z *= targetSpan / Math.max(fittedSize.z, minDim);

        root.updateMatrixWorld(true);
        const scaledBox = new THREE.Box3().setFromObject(root);
        const center = new THREE.Vector3();
        scaledBox.getCenter(center);

        if (!Number.isFinite(center.x) || !Number.isFinite(center.y) || !Number.isFinite(center.z)) {
          setLoadError(true);
          return;
        }

        // Center on X/Z and lift so model floor aligns with scene floor (y = 0).
        root.position.set(-center.x, -scaledBox.min.y, -center.z);
        setModel(root);
      },
      undefined,
      () => {
        if (!cancelled) setLoadError(true);
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  if (loadError) {
    return (
      <group>
        <lineSegments position={[0, WALL_HEIGHT / 2, 0]} renderOrder={1000}>
          <edgesGeometry args={[new THREE.BoxGeometry(ROOM_SIZE * 0.98, WALL_HEIGHT * 0.98, ROOM_SIZE * 0.98)]} />
          <lineBasicMaterial color="#00ffff" toneMapped={false} depthTest={false} />
        </lineSegments>
        <mesh position={[0, PLAYER_HEIGHT, -2]} renderOrder={1000}>
          <boxGeometry args={[0.6, 0.6, 0.6]} />
          <meshBasicMaterial color="#ff2bd6" toneMapped={false} depthTest={false} />
        </mesh>
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={999}>
          <planeGeometry args={[ROOM_SIZE * 0.98, ROOM_SIZE * 0.98]} />
          <meshBasicMaterial
            color="#00ffff"
            transparent
            opacity={0.08}
            depthWrite={false}
            depthTest={false}
            toneMapped={false}
          />
        </mesh>
      </group>
    );
  }

  return model ? <primitive object={model} /> : null;
}

// ---------- Modern lounge set in the back-left corner ----------
function LoungeSet() {
  const half = ROOM_SIZE / 2;
  // Anchor near back-left corner
  const cx = -half + 3.2;
  const cz = -half + 3.2;

  const sofaColor = "#1a1a1d"; // matte charcoal
  const cushionColor = "#26262b";
  const tableTop = "#0f0f12";
  const tableBase = "#2a2a2f";

  return (
    <group position={[cx, 0, cz]}>
      {/* Rug under the set */}
      <mesh position={[0.4, 0.005, 0.4]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[5.2, 5.2]} />
        <meshStandardMaterial color="#0c0c10" roughness={0.95} metalness={0} />
      </mesh>

      {/* L-Sofa: long segment along -Z (against back wall direction) */}
      <group position={[0, 0, -1.6]}>
        {/* Base */}
        <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
          <boxGeometry args={[3.2, 0.5, 1.0]} />
          <meshStandardMaterial color={sofaColor} roughness={0.6} metalness={0.05} />
        </mesh>
        {/* Backrest */}
        <mesh position={[0, 0.85, -0.4]} castShadow>
          <boxGeometry args={[3.2, 0.7, 0.2]} />
          <meshStandardMaterial color={sofaColor} roughness={0.6} metalness={0.05} />
        </mesh>
        {/* Cushions */}
        {[-1.0, 0, 1.0].map((x, i) => (
          <mesh key={i} position={[x, 0.6, 0.05]} castShadow>
            <boxGeometry args={[0.95, 0.25, 0.85]} />
            <meshStandardMaterial color={cushionColor} roughness={0.7} metalness={0.05} />
          </mesh>
        ))}
      </group>

      {/* L-Sofa: short segment along -X */}
      <group position={[-1.6, 0, 0]}>
        <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.0, 0.5, 2.4]} />
          <meshStandardMaterial color={sofaColor} roughness={0.6} metalness={0.05} />
        </mesh>
        <mesh position={[-0.4, 0.85, 0]} castShadow>
          <boxGeometry args={[0.2, 0.7, 2.4]} />
          <meshStandardMaterial color={sofaColor} roughness={0.6} metalness={0.05} />
        </mesh>
        {[-0.8, 0.2, 1.1].map((z, i) => (
          <mesh key={i} position={[0.05, 0.6, z]} castShadow>
            <boxGeometry args={[0.85, 0.25, 0.85]} />
            <meshStandardMaterial color={cushionColor} roughness={0.7} metalness={0.05} />
          </mesh>
        ))}
      </group>

      {/* Low coffee table */}
      <group position={[0.4, 0, 0.2]}>
        <mesh position={[0, 0.32, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.6, 0.08, 0.9]} />
          <meshStandardMaterial color={tableTop} roughness={0.25} metalness={0.6} />
        </mesh>
        <mesh position={[0, 0.16, 0]} castShadow>
          <boxGeometry args={[1.4, 0.24, 0.7]} />
          <meshStandardMaterial color={tableBase} roughness={0.5} metalness={0.3} />
        </mesh>
        {/* Subtle cyan underglow strip */}
        <mesh position={[0, 0.04, 0]}>
          <boxGeometry args={[1.5, 0.02, 0.8]} />
          <meshBasicMaterial color="#00ffff" toneMapped={false} />
        </mesh>
      </group>

      {/* Floor lamp accent (slim emissive pole) */}
      <group position={[1.7, 0, -1.7]}>
        <mesh position={[0, 1.1, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 2.2, 12]} />
          <meshStandardMaterial color="#1a1a1d" roughness={0.4} metalness={0.8} />
        </mesh>
        <mesh position={[0, 2.25, 0]}>
          <sphereGeometry args={[0.12, 16, 16]} />
          <meshStandardMaterial
            color="#ff2bd6"
            emissive="#ff2bd6"
            emissiveIntensity={3}
            toneMapped={false}
          />
        </mesh>
        <pointLight position={[0, 2.25, 0]} color="#ff2bd6" intensity={8} distance={6} decay={2} />
      </group>
    </group>
  );
}

// ---------- Spotlight that highlights the lounge set ----------
function LoungeSpotlight() {
  const half = ROOM_SIZE / 2;
  const target = useRef<THREE.Object3D>(new THREE.Object3D());
  const { scene } = useThree();

  useEffect(() => {
    target.current.position.set(-half + 3.6, 0.4, -half + 3.6);
    scene.add(target.current);
    return () => {
      scene.remove(target.current);
    };
  }, [scene, half]);

  return (
    <spotLight
      position={[-half + 3.6, WALL_HEIGHT - 0.5, -half + 3.6]}
      angle={0.55}
      penumbra={0.6}
      intensity={45}
      distance={14}
      decay={2}
      color="#ffffff"
      castShadow
      target={target.current}
    />
  );
}

// ---------- Neon accent lights that bounce off the pearly walls ----------
function NeonAccents({
  accentLightRefs,
}: {
  accentLightRefs: MutableRefObject<THREE.PointLight[]>;
}) {
  const half = ROOM_SIZE / 2 - 1.2;
  const y = WALL_HEIGHT - 1.2;
  const lights: { pos: [number, number, number]; color: string; intensity: number }[] = [
    { pos: [-half, y, -half], color: "#00ffff", intensity: 60 }, // cyan
    { pos: [half, y, half], color: "#ff2bd6", intensity: 55 }, // magenta
    { pos: [half, y, -half], color: "#9d4bff", intensity: 35 }, // violet accent
    { pos: [-half, y, half], color: "#00ffaa", intensity: 30 }, // mint accent
  ];

  return (
    <>
      {lights.map((l, i) => (
        <group key={i} position={l.pos}>
          <pointLight
            ref={(node) => {
              if (node) accentLightRefs.current[i] = node;
            }}
            color={l.color}
            intensity={l.intensity}
            distance={26}
            decay={2}
          />
          <mesh>
            <sphereGeometry args={[0.13, 16, 16]} />
            <meshStandardMaterial
              color={l.color}
              emissive={l.color}
              emissiveIntensity={4}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}

// ---------- Earth + Moon attached to the camera ----------
function EarthMoonAnchor() {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null!);
  const moonPivotRef = useRef<THREE.Group>(null!);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    camera.add(group);
    return () => {
      camera.remove(group);
    };
  }, [camera]);

  useFrame((_, delta) => {
    if (moonPivotRef.current) {
      moonPivotRef.current.rotation.y += delta * 0.8;
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, -5]}>
      {/* Earth */}
      <mesh>
        <sphereGeometry args={[0.7, 48, 48]} />
        <meshStandardMaterial
          color="#1e6fff"
          roughness={0.55}
          metalness={0.15}
          emissive="#0a2a6b"
          emissiveIntensity={0.4}
        />
      </mesh>

      {/* Soft halo to keep Earth readable against bright walls */}
      <mesh>
        <sphereGeometry args={[0.78, 32, 32]} />
        <meshBasicMaterial color="#3aa0ff" transparent opacity={0.12} />
      </mesh>

      {/* Key light at the Earth */}
      <pointLight color="#ffffff" intensity={3.2} distance={9} decay={2} />

      {/* Moon orbiting */}
      <group ref={moonPivotRef}>
        <mesh position={[1.6, 0.2, 0]}>
          <sphereGeometry args={[0.18, 32, 32]} />
          <meshStandardMaterial
            color="#ffffff"
            roughness={0.9}
            metalness={0}
            emissive="#bcd4ff"
            emissiveIntensity={0.15}
          />
        </mesh>
      </group>
    </group>
  );
}

// ---------- First Person Controller (WASD) ----------
function FirstPersonController({
  onLockChange,
}: {
  onLockChange: (value: boolean) => void;
}) {
  const { camera, gl } = useThree();
  const controlsRef = useRef<ThreePointerLockControls | null>(null);
  const moveState = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
  });
  const direction = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());

  useEffect(() => {
    camera.position.set(...SOFA_SPAWN);
  }, [camera]);

  useEffect(() => {
    const controls = new ThreePointerLockControls(camera, gl.domElement);
    controls.pointerSpeed = 1;
    controlsRef.current = controls;

    const handleLock = () => onLockChange(true);
    const handleUnlock = () => {
      onLockChange(false);
      moveState.current.forward = false;
      moveState.current.backward = false;
      moveState.current.left = false;
      moveState.current.right = false;
    };
    controls.addEventListener("lock", handleLock);
    controls.addEventListener("unlock", handleUnlock);

    return () => {
      controls.removeEventListener("lock", handleLock);
      controls.removeEventListener("unlock", handleUnlock);
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, gl, onLockChange]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "KeyM") {
        const controls = controlsRef.current;
        if (!controls) return;
        if (controls.isLocked) controls.unlock();
        else controls.lock();
        return;
      }
      if (e.code === "KeyW") moveState.current.forward = true;
      if (e.code === "KeyS") moveState.current.backward = true;
      if (e.code === "KeyA") moveState.current.left = true;
      if (e.code === "KeyD") moveState.current.right = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "KeyW") moveState.current.forward = false;
      if (e.code === "KeyS") moveState.current.backward = false;
      if (e.code === "KeyA") moveState.current.left = false;
      if (e.code === "KeyD") moveState.current.right = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls?.isLocked) return;

    const state = moveState.current;
    const forwardInput = (state.forward ? 1 : 0) - (state.backward ? 1 : 0);
    const strafeInput = (state.right ? 1 : 0) - (state.left ? 1 : 0);

    camera.getWorldDirection(direction.current);
    direction.current.y = 0;
    if (direction.current.lengthSq() > 0) direction.current.normalize();
    right.current.crossVectors(direction.current, camera.up).normalize();

    const distance = MOVE_SPEED * delta;
    camera.position.addScaledVector(direction.current, forwardInput * distance);
    camera.position.addScaledVector(right.current, strafeInput * distance);

    const limit = ROOM_SIZE / 2 - PLAYER_RADIUS;
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -limit, limit);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -limit, limit);
    camera.position.y = PLAYER_HEIGHT;
  });

  return null;
}

export default function NeonRoom() {
  const [locked, setLocked] = useState(false);
  const accentLightsRef = useRef<THREE.PointLight[]>([]);

  return (
    <div className="relative h-screen w-screen bg-black">
      <Canvas
        camera={{ fov: 75, near: 0.1, far: 200, position: [0, PLAYER_HEIGHT, 4] }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#050510"]} />

        {/* Background stars (still visible through the holographic window) */}
        <Stars radius={80} depth={50} count={4000} factor={4} saturation={0} fade speed={0.5} />

        {/* Soft fill so pearly walls read clean */}
        <ambientLight intensity={0.55} />
        {/* Subtle directional fill for depth on the white walls */}
        <directionalLight position={[5, 8, 5]} intensity={0.4} color="#ffffff" />

        <Room />
        <HoloScreens />
        <HabitacionComplement />
        <NeonAccents accentLightRefs={accentLightsRef} />
        <LoungeSet />
        <LoungeSpotlight />

        <EarthMoonAnchor />
        <FirstPersonController onLockChange={setLocked} />
      </Canvas>

      {!locked && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="pointer-events-none rounded-2xl border border-white/10 bg-black/70 px-8 py-6 text-center backdrop-blur-md">
            <h1 className="text-2xl font-bold tracking-tight text-white">Pearl Room</h1>
            <p className="mt-2 text-sm text-white/70">
              Press <span className="font-mono">M</span> to lock/unlock mouse -{" "}
              <span className="font-mono">WASD</span> to move - <span className="font-mono">ESC</span>{" "}
              to exit
            </p>
          </div>
        </div>
      )}

      {locked && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80 mix-blend-difference" />
      )}
    </div>
  );
}
