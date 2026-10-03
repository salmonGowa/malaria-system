import * as THREE from "three";

/**
 * Procedural female Anopheles mosquito for the landing-page hero: spotted
 * iridescent wings, palps as long as the proboscis, hind legs held up.
 * Built from primitives (no model file). Body axis runs along +x (head).
 *
 * Mounts a canvas into `container`. Returns `setTheme` (retunes lights and
 * dust for a light or dark page without a remount) and `dispose`, which
 * frees every GPU resource. Loaded with a dynamic import so three.js stays
 * out of the main app bundle.
 */
export type SceneTheme = "light" | "dark";

export function mountMosquito(
  container: HTMLElement,
  opts: { reduceMotion: boolean; theme: SceneTheme },
): { setTheme: (theme: SceneTheme) => void; dispose: () => void } {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

  const hemi = new THREE.HemisphereLight(0x9a8cd0, 0x0a0812, 0.7);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffb59a, 2.4);
  key.position.set(3, 4, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x6d8cff, 0.6);
  fill.position.set(-4, -2, 3);
  scene.add(fill);
  const rimA = new THREE.PointLight(0x7c5cff, 45, 20);
  rimA.position.set(-3, 1.5, -3);
  scene.add(rimA);
  const rimB = new THREE.PointLight(0xff9e7a, 22, 20);
  rimB.position.set(3, -1, -2.5);
  scene.add(rimB);

  // ---- materials ---------------------------------------------------------
  const chitin = new THREE.MeshPhysicalMaterial({
    color: 0x5a4436,
    roughness: 0.55,
    metalness: 0.05,
    clearcoat: 0.4,
    clearcoatRoughness: 0.5,
    sheen: 0.6,
    sheenColor: new THREE.Color(0xa78bfa),
    sheenRoughness: 0.5,
  });
  const abdomenMat = chitin.clone();
  abdomenMat.map = segmentTexture();
  abdomenMat.color.set(0xffffff);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x3a2c25, roughness: 0.55, metalness: 0.05 });
  const eyeMat = new THREE.MeshPhysicalMaterial({
    color: 0x1a0d10,
    roughness: 0.15,
    clearcoat: 1,
    iridescence: 0.8,
    iridescenceIOR: 1.6,
  });
  const wingMat = new THREE.MeshPhysicalMaterial({
    map: wingTexture(),
    transparent: true,
    side: THREE.DoubleSide,
    roughness: 0.15,
    metalness: 0,
    iridescence: 1,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [200, 650],
    depthWrite: false,
  });

  const mosquito = new THREE.Group();
  mosquito.scale.setScalar(1.45);
  scene.add(mosquito);

  // ---- body --------------------------------------------------------------
  const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.3, 48, 32), chitin);
  thorax.scale.set(1.2, 0.92, 0.8);
  thorax.rotation.z = -0.25; // humped forward, as in profile
  mosquito.add(thorax);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 40, 28), eyeMat);
  head.position.set(0.4, -0.06, 0);
  head.scale.set(0.95, 1, 1.05);
  mosquito.add(head);

  // Abdomen: a lathe around +y, then swung to trail behind along -x.
  const profile: THREE.Vector2[] = [];
  const L = 1.45;
  for (let i = 0; i <= 64; i++) {
    const t = i / 64;
    const ridge = 1 - 0.07 * Math.abs(Math.sin(Math.PI * 8 * t));
    const r = (0.02 + 0.15 * Math.pow(Math.sin(Math.PI * (0.1 + 0.88 * t)), 0.8) * (1 - 0.35 * t)) * ridge;
    profile.push(new THREE.Vector2(r, -t * L));
  }
  const abdomen = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), abdomenMat);
  abdomen.position.set(-0.22, -0.02, 0);
  abdomen.rotation.z = -Math.PI / 2 + 0.12;
  mosquito.add(abdomen);

  // Proboscis + palps (Anopheles: palps about as long as the proboscis).
  const mouthDir = new THREE.Vector3(Math.cos(-0.4), Math.sin(-0.4), 0);
  const addStraw = (len: number, r0: number, r1: number, zOff: number) => {
    const geo = new THREE.CylinderGeometry(r1, r0, len, 10);
    geo.translate(0, len / 2, 0);
    const m = new THREE.Mesh(geo, legMat);
    m.position.set(0.52, -0.12, zOff);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), mouthDir);
    mosquito.add(m);
  };
  addStraw(1.0, 0.018, 0.008, 0);
  addStraw(0.9, 0.012, 0.009, 0.035);
  addStraw(0.9, 0.012, 0.009, -0.035);

  const tube = (pts: [number, number, number][], radius: number, mat: THREE.Material) =>
    new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z))), 48, radius, 6),
      mat,
    );

  for (const s of [1, -1]) {
    mosquito.add(tube([[0.5, 0.02, 0.05 * s], [0.7, 0.18, 0.12 * s], [0.9, 0.3, 0.24 * s]], 0.007, legMat));
  }

  // Halteres.
  for (const s of [1, -1]) {
    const stalk = tube([[-0.12, 0.12, 0.2 * s], [-0.22, 0.2, 0.3 * s]], 0.008, legMat);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), chitin);
    knob.position.set(-0.22, 0.2, 0.3 * s);
    mosquito.add(stalk, knob);
  }

  // ---- legs (pivot at the coxa so they can sway) -------------------------
  const legDefs: [number, number, number][][] = [
    // front: reaching forward
    [[0, 0, 0], [0.17, 0.15, 0.27], [0.57, -0.35, 0.47], [0.87, -1.05, 0.52]],
    // middle: out to the side
    [[0, 0, 0], [0.03, 0.19, 0.4], [-0.02, -0.36, 0.75], [-0.12, -1.11, 0.85]],
    // hind: back and raised, the Anopheles signature
    [[0, 0, 0], [-0.18, 0.15, 0.37], [-0.78, -0.25, 0.57], [-1.48, 0.0, 0.62]],
  ];
  const legRoots: [number, number][] = [
    [0.18, -0.2],
    [0.02, -0.24],
    [-0.12, -0.2],
  ];
  const legs: { pivot: THREE.Group; phase: number }[] = [];
  legDefs.forEach((def, i) => {
    for (const s of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(legRoots[i][0], legRoots[i][1], 0.08 * s);
      const pts = def.map(([x, y, z]) => [x, y, z * s] as [number, number, number]);
      pivot.add(tube(pts, 0.012, legMat));
      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), legMat);
      knee.position.set(...pts[1]);
      pivot.add(knee);
      mosquito.add(pivot);
      legs.push({ pivot, phase: i * 1.3 + (s > 0 ? 0 : 0.7) });
    }
  });

  // ---- wings -------------------------------------------------------------
  const wingGeo = new THREE.PlaneGeometry(0.5, 1.75);
  wingGeo.translate(0, 0.875, 0);
  const wings = [1, -1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.02, 0.22, 0.1 * s);
    const mesh = new THREE.Mesh(wingGeo, wingMat);
    mesh.rotation.x = (s * Math.PI) / 2; // length → ±z
    pivot.add(mesh);
    mosquito.add(pivot);
    return { pivot, s };
  });

  // ---- floating dust -----------------------------------------------------
  const DUST = 420;
  const dustPos = new Float32Array(DUST * 3);
  const dustCol = new Float32Array(DUST * 3);
  const peach = new THREE.Color(0xff9e7a);
  const violet = new THREE.Color(0xa78bfa);
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 9;
    dustPos[i * 3 + 1] = (Math.random() - 0.5) * 6;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1;
    const c = violet.clone().lerp(peach, Math.random());
    dustCol.set([c.r, c.g, c.b], i * 3);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute("color", new THREE.BufferAttribute(dustCol, 3));
  const dustMat = new THREE.PointsMaterial({
    size: 0.045,
    map: dotTexture(),
    vertexColors: true,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  scene.add(new THREE.Points(dustGeo, dustMat));

  // ---- interaction + loop ------------------------------------------------
  const BASE_YAW = -0.55;
  let targetYaw = BASE_YAW;
  let targetPitch = 0;
  const onPointer = (e: PointerEvent) => {
    const r = container.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * 2 - 1;
    const py = ((e.clientY - r.top) / r.height) * 2 - 1;
    targetYaw = BASE_YAW + Math.max(-1.5, Math.min(1.5, px)) * 0.7;
    targetPitch = Math.max(-1, Math.min(1, py)) * 0.3;
    if (opts.reduceMotion) {
      mosquito.rotation.set(targetPitch, targetYaw, 0);
      render();
    }
  };
  window.addEventListener("pointermove", onPointer, { passive: true });

  const pose = (t: number) => {
    const flap = opts.reduceMotion ? 0.35 : 0.2 + 0.85 * Math.sin(t * Math.PI * 2 * 9);
    for (const w of wings) {
      w.pivot.rotation.set(-w.s * flap, w.s * -0.38, 0);
    }
    for (const l of legs) {
      l.pivot.rotation.z = opts.reduceMotion ? 0 : Math.sin(t * 1.4 + l.phase) * 0.05;
      l.pivot.rotation.x = opts.reduceMotion ? 0 : Math.sin(t * 1.1 + l.phase) * 0.04;
    }
  };

  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.set(0, 0.35, 8 * Math.max(1, 1.15 / camera.aspect));
    camera.lookAt(0, -0.25, 0);
    camera.updateProjectionMatrix();
    if (opts.reduceMotion) render();
  };

  const render = () => renderer.render(scene, camera);

  // Dark page: additive glow and strong violet rims. Light page: additive
  // dust would vanish into white, so it blends normally, and more ambient
  // light keeps the body from reading as a flat silhouette.
  const setTheme = (theme: SceneTheme) => {
    const light = theme === "light";
    hemi.intensity = light ? 1.3 : 0.7;
    hemi.groundColor.set(light ? 0x6b5a70 : 0x0a0812);
    key.intensity = light ? 2.8 : 2.4;
    rimA.intensity = light ? 22 : 45;
    rimB.intensity = light ? 12 : 22;
    renderer.toneMappingExposure = light ? 1.0 : 1.15;
    dustMat.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
    dustMat.opacity = light ? 0.4 : 0.7;
    dustMat.size = light ? 0.035 : 0.045;
    dustMat.needsUpdate = true;
    if (opts.reduceMotion) render();
  };

  mosquito.rotation.set(0, BASE_YAW, 0);
  pose(0);
  setTheme(opts.theme);

  let raf = 0;
  let visible = true;
  const clock = new THREE.Clock();
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (!visible || document.hidden) return;
    const t = clock.getElapsedTime();
    pose(t);
    mosquito.position.set(Math.sin(t * 0.5) * 0.1, Math.sin(t * 1.2) * 0.12, 0);
    mosquito.rotation.x += (targetPitch - mosquito.rotation.x) * 0.05;
    mosquito.rotation.y += (targetYaw + Math.sin(t * 0.35) * 0.15 - mosquito.rotation.y) * 0.05;
    mosquito.rotation.z = Math.sin(t * 1.2 + 0.6) * 0.05;
    for (let i = 0; i < DUST; i++) {
      const y = dustPos[i * 3 + 1] + 0.0025;
      dustPos[i * 3 + 1] = y > 3 ? -3 : y;
    }
    dustGeo.attributes.position.needsUpdate = true;
    render();
  };

  const ro = new ResizeObserver(resize);
  ro.observe(container);
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
  });
  io.observe(container);
  resize();
  if (opts.reduceMotion) render();
  else loop();

  const dispose = () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    window.removeEventListener("pointermove", onPointer);
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m: THREE.Material & { map?: THREE.Texture | null }) => {
          m.map?.dispose();
          m.dispose();
        });
      }
    });
    renderer.dispose();
    renderer.domElement.remove();
  };

  return { setTheme, dispose };
}

/** Translucent wing with veins, a fringed trailing edge, and the dark
 * leading-edge spots that mark Anopheles wings. Length runs along v. */
function wingTexture(): THREE.CanvasTexture {
  const W = 128;
  const H = 448;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  // Drawn spots-left; mirrored so they land on the leading (+x) edge.
  g.translate(W, 0);
  g.scale(-1, 1);
  const outline = new Path2D();
  // root at the bottom (v=0 → canvas bottom), tip at the top
  outline.moveTo(W * 0.5, H - 4);
  outline.bezierCurveTo(W * 0.05, H * 0.75, W * 0.12, H * 0.12, W * 0.45, 8);
  outline.bezierCurveTo(W * 0.75, 4, W * 0.98, H * 0.3, W * 0.85, H * 0.7);
  outline.bezierCurveTo(W * 0.78, H * 0.9, W * 0.6, H - 6, W * 0.5, H - 4);
  g.fillStyle = "rgba(225,215,255,0.22)";
  g.fill(outline);
  g.save();
  g.clip(outline);
  g.strokeStyle = "rgba(60,45,50,0.75)";
  g.lineWidth = 1.6;
  for (const x of [0.2, 0.36, 0.5, 0.62, 0.76]) {
    g.beginPath();
    g.moveTo(W * 0.5, H);
    g.quadraticCurveTo(W * x, H * 0.5, W * (x * 0.9 + 0.05), 0);
    g.stroke();
  }
  g.fillStyle = "rgba(35,22,22,0.85)";
  for (let i = 0; i < 6; i++) {
    g.fillRect(W * 0.14, H * (0.12 + i * 0.13), W * 0.12, H * 0.05);
  }
  g.restore();
  g.strokeStyle = "rgba(200,190,230,0.35)";
  g.lineWidth = 1;
  for (let y = 20; y < H - 30; y += 5) {
    g.beginPath();
    g.moveTo(W * 0.86 - (Math.abs(y - H * 0.4) / H) * W * 0.2, y);
    g.lineTo(W * 0.96 - (Math.abs(y - H * 0.4) / H) * W * 0.2, y + 3);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Banded abdomen: darker tergites with paler joints. */
function segmentTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const g = c.getContext("2d")!;
  for (let y = 0; y < 256; y++) {
    const band = (Math.sin((y / 256) * Math.PI * 16) + 1) / 2;
    const l = 22 + band * 16;
    g.fillStyle = `hsl(20, 22%, ${l}%)`;
    g.fillRect(0, y, 4, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function dotTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
