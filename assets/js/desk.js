/* ============================================================
   3D desk scene (Three.js). Objects on the desk are hotspots:
   hover to highlight, click to fly the camera in and open a
   content panel. Drag to orbit. Esc / "back" returns to overview.
   All copy comes from window.SITE (see content.js).
   ============================================================ */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/RoundedBoxGeometry.js";

const SITE = window.SITE;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isTouch = window.matchMedia("(hover: none)").matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const stage = $("#desk-stage");
const canvas = $("#desk-canvas");
if (!stage || !canvas) throw new Error("desk stage missing");

const lang = () => document.documentElement.lang.startsWith("zh") ? "zh" : "en";
const T = () => SITE[lang()];
const theme = () => document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";

/* ---------- palette ---------- */
const PAL = {
  dark:  { bg: 0x070b12, wall: 0x101a2b, wallLow: 0x0c1420, floor: 0x0a0f18, desk: 0x7a5236, deskEdge: 0x5b3c27, hemiSky: 0x9fb8ff, hemiGround: 0x1a1410, keyI: 2.6, fillI: 0.9 },
  light: { bg: 0xf4f7fb, wall: 0xe4ebf4, wallLow: 0xd6dfeb, floor: 0xcfd8e4, desk: 0xc9996a, deskEdge: 0xa87c52, hemiSky: 0xffffff, hemiGround: 0x9aa4b0, keyI: 2.2, fillI: 1.2 }
};
const C = { white: 0xeef1f5, black: 0x1b1f27, metal: 0x2b3038, cyan: 0x22d3ee, mint: 0x2ee6a6, amber: 0xf5b84b, violet: 0xa78bfa, rose: 0xfb6f92, duck: 0xffd23f, orange: 0xff8a3d, leaf: 0x3fa860, pot: 0xb3543a, paper: 0xf6f3ea, blue: 0x3b82f6 };

/* ---------- renderer / scene ---------- */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
} catch (e) {
  failGracefully(); throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 40);
const world = new THREE.Group();
scene.add(world);

/* ---------- helpers ---------- */
const mat = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.62, metalness: 0.06 }, o));
const rbox = (w, h, d, r = 0.02, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, r);
function mesh(geo, material, { pos = [0, 0, 0], rot = [0, 0, 0], cast = true, receive = true, parent = world } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos); m.rotation.set(...rot);
  m.castShadow = cast; m.receiveShadow = receive;
  parent.add(m);
  return m;
}
function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
let running = false, raf = 0, inView = true, visible = !document.hidden, userPaused = false;
const themeMats = [];   // { m, key } materials recolored on theme change
function themed(key, o = {}) { const m = mat(PAL[theme()][key], o); themeMats.push({ m, key }); return m; }

/* ---------- room ---------- */
const floor = mesh(new THREE.PlaneGeometry(40, 40), themed("floor", { roughness: 0.9 }), { pos: [0, -0.78, 8], rot: [-Math.PI / 2, 0, 0], cast: false });
const wall = mesh(new THREE.PlaneGeometry(40, 12), themed("wall", { roughness: 0.95 }), { pos: [0, 5.2, -1.05], cast: false });
const skirting = mesh(new THREE.BoxGeometry(40, 0.12, 0.03), themed("wallLow", { roughness: 0.9 }), { pos: [0, -0.72, -1.03], cast: false });
scene.fog = new THREE.Fog(PAL.dark.bg, 4.5, 11);

/* ---------- lights ---------- */
const hemi = new THREE.HemisphereLight(PAL.dark.hemiSky, PAL.dark.hemiGround, 0.55);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, PAL.dark.keyI);
key.position.set(-2.2, 4.2, 2.8);
key.castShadow = true;
key.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
key.shadow.camera.near = 0.5; key.shadow.camera.far = 12;
key.shadow.camera.left = -2.6; key.shadow.camera.right = 2.6; key.shadow.camera.top = 2.6; key.shadow.camera.bottom = -2.6;
key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02; key.shadow.radius = 4;
scene.add(key);
const fill = new THREE.DirectionalLight(0xbfd8ff, PAL.dark.fillI);
fill.position.set(3, 2.5, 1.5);
scene.add(fill);
const screenGlow = new THREE.PointLight(0x22d3ee, 1.6, 2.4, 2);
screenGlow.position.set(0, 0.55, -0.15);
scene.add(screenGlow);
const lampLight = new THREE.PointLight(0xffc37a, 3.0, 2.8, 2);
lampLight.position.set(1.3, 0.62, -0.55);
scene.add(lampLight);

/* ---------- desk ---------- */
const DESK_W = 3.4, DESK_D = 1.5;
mesh(rbox(DESK_W, 0.07, DESK_D, 0.02), themed("desk", { roughness: 0.55 }), { pos: [0, -0.035, 0] });
const legMat = mat(C.metal, { metalness: 0.5, roughness: 0.4 });
for (const sx of [-1, 1]) {
  mesh(new THREE.BoxGeometry(0.06, 0.72, 1.2), legMat, { pos: [sx * (DESK_W / 2 - 0.12), -0.43, 0] });
  mesh(new THREE.BoxGeometry(0.06, 0.04, 1.2), legMat, { pos: [sx * (DESK_W / 2 - 0.12), -0.77, 0], cast: false });
}
mesh(new THREE.BoxGeometry(DESK_W - 0.4, 0.05, 0.05), legMat, { pos: [0, -0.7, -0.5], cast: false });
// drawer block on the right
const drawer = mesh(rbox(0.5, 0.5, 1.1, 0.02), themed("deskEdge", { roughness: 0.6 }), { pos: [1.15, -0.33, 0] });
for (const y of [-0.22, -0.4]) mesh(rbox(0.36, 0.02, 0.02, 0.008), legMat, { pos: [1.15, y, 0.56] });

/* ---------- hotspots registry ---------- */
const hotspots = {};           // key -> { group, meshes, cfg, glow }
const pickMeshes = [];         // flat list for raycasting
function register(key, group, cfg) {
  const meshes = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    // give every hotspot mesh its own material so the hover glow does not leak to shared decor
    o.material = Array.isArray(o.material) ? o.material.map((m) => (m.isMeshStandardMaterial ? m.clone() : m)) : (o.material.isMeshStandardMaterial ? o.material.clone() : o.material);
    o.userData.hotspot = key; meshes.push(o); pickMeshes.push(o);
  });
  group.userData.baseScale = group.scale.clone();
  hotspots[key] = { group, meshes, cfg, glow: 0 };
  return group;
}

/* ---------- monitor (videos) ---------- */
const monitor = new THREE.Group();
monitor.position.set(0, 0, -0.42);
world.add(monitor);
mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.03, 32), legMat, { pos: [0, 0.015, 0.02], parent: monitor });
mesh(rbox(0.07, 0.34, 0.05, 0.01), legMat, { pos: [0, 0.2, -0.02], parent: monitor });
const screenW = 1.24, screenH = 0.72;
const frame = mesh(rbox(screenW + 0.06, screenH + 0.06, 0.045, 0.012), mat(C.black, { roughness: 0.4, metalness: 0.3 }), { pos: [0, 0.62, 0], rot: [-0.06, 0, 0], parent: monitor });
const standbyTex = canvasTexture(1024, 600, (g, w, h) => {
  const grd = g.createLinearGradient(0, 0, w, h); grd.addColorStop(0, "#0b1524"); grd.addColorStop(1, "#08111c");
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.strokeStyle = "rgba(34,211,238,.18)"; g.lineWidth = 2;
  for (let x = 0; x < w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y < h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.fillStyle = "#22d3ee"; g.font = "700 64px 'Space Grotesk', 'Noto Sans SC', sans-serif"; g.textAlign = "center";
  g.fillText("ROBOT DEMOS", w / 2, h / 2 - 10);
  g.fillStyle = "#9aa8bd"; g.font = "500 30px 'JetBrains Mono', monospace";
  g.fillText("loading video…", w / 2, h / 2 + 50);
});
const screenMat = new THREE.MeshBasicMaterial({ map: standbyTex, toneMapped: false });
const screen = new THREE.Mesh(new THREE.PlaneGeometry(screenW, screenH), screenMat);
screen.position.set(0, 0, 0.024); frame.add(screen);
mesh(rbox(0.5, 0.05, 0.03, 0.01), mat(C.metal), { pos: [0, -screenH / 2 - 0.03 + 0.62, 0.0], parent: monitor, cast: false });
register("monitor", monitor, { look: [0, 0.6, -0.42], dir: [0, 0.06, 1], fitW: 1.36, minDist: 0.8, accent: C.cyan });

/* ---------- keyboard + mouse (decor) ---------- */
const kb = new THREE.Group(); kb.position.set(0.12, 0, 0.22); world.add(kb);
mesh(rbox(0.92, 0.03, 0.31, 0.01), mat(C.metal, { roughness: 0.5 }), { pos: [0, 0.015, 0], parent: kb });
{
  const keyGeo = new RoundedBoxGeometry(0.048, 0.014, 0.048, 2, 0.006);
  const keyMat = mat(0x3a4150, { roughness: 0.55 });
  const cols = 15, rows = 5;
  const inst = new THREE.InstancedMesh(keyGeo, keyMat, cols * rows + 1);
  const d = new THREE.Object3D(); let i = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (r === 4 && c > 3 && c < 11) continue;
    d.position.set(-0.41 + c * 0.058, 0.035, -0.12 + r * 0.058); d.updateMatrix(); inst.setMatrixAt(i++, d.matrix);
  }
  d.position.set(0.02, 0.035, 0.112); d.scale.set(7, 1, 1); d.updateMatrix(); inst.setMatrixAt(i++, d.matrix);
  inst.count = i; inst.castShadow = true; inst.receiveShadow = true; kb.add(inst);
}
mesh(rbox(0.11, 0.05, 0.17, 0.03, 4), mat(C.metal, { roughness: 0.4, metalness: 0.2 }), { pos: [0.8, 0.025, 0.24] });

/* ---------- laptop (projects) ---------- */
const laptop = new THREE.Group();
laptop.position.set(-0.9, 0, 0.02); laptop.rotation.y = 0.45;
world.add(laptop);
const lapBody = mat(0xd9dde3, { roughness: 0.35, metalness: 0.55 });
mesh(rbox(0.64, 0.024, 0.42, 0.012), lapBody, { pos: [0, 0.012, 0], parent: laptop });
mesh(rbox(0.5, 0.004, 0.19, 0.004), mat(C.black, { roughness: 0.7 }), { pos: [0, 0.026, 0.0], parent: laptop, cast: false });
mesh(rbox(0.16, 0.003, 0.1, 0.004), mat(0x9aa2ad, { roughness: 0.4 }), { pos: [0, 0.026, 0.14], parent: laptop, cast: false });
const lid = new THREE.Group(); lid.position.set(0, 0.02, -0.21); lid.rotation.x = -0.2; laptop.add(lid);
mesh(rbox(0.64, 0.42, 0.016, 0.012), lapBody, { pos: [0, 0.21, 0], parent: lid });
const lapTex = canvasTexture(1024, 640, (g, w, h) => {
  g.fillStyle = "#0b1220"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#101a2b"; g.fillRect(0, 0, w, 64);
  g.fillStyle = "#22d3ee"; g.font = "600 30px 'JetBrains Mono', monospace"; g.textAlign = "left";
  g.fillText("~/research  ▸  vla_eval.py", 28, 42);
  const lines = ["IROS 2026  ·  vision–tactile mass priors + PINN grip", "LeRobot × Open-PI  ·  instruction-conditioned VLA", "Isaac Sim benchmark  ·  success / latency / trajectory", "SuperAgent  ·  plan → execute → evaluate → reflect", "Faxingbao  ·  SFT / RLHF / hybrid RAG"];
  g.font = "500 30px 'JetBrains Mono', monospace";
  lines.forEach((l, i) => { g.fillStyle = i % 2 ? "#9aa8bd" : "#e8edf5"; g.fillText("›  " + l, 40, 130 + i * 58); });
  // bar chart
  const bx = 60, by = 470, bw = 900, bh = 130;
  g.strokeStyle = "rgba(154,168,189,.35)"; g.strokeRect(bx, by, bw, bh);
  const vals = [0.86, 0.72, 0.63, 0.77, 0.55, 0.81, 0.68, 0.9];
  vals.forEach((v, i) => { g.fillStyle = i === 7 ? "#2ee6a6" : "#22d3ee"; const x = bx + 30 + i * 108; g.fillRect(x, by + bh - v * (bh - 20) - 4, 60, v * (bh - 20)); });
  g.fillStyle = "#5f6d83"; g.font = "500 22px 'JetBrains Mono', monospace"; g.fillText("success rate by task  ·  86.3% ours", bx + 6, by - 12);
});
const lapScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.36), new THREE.MeshBasicMaterial({ map: lapTex, toneMapped: false }));
lapScreen.position.set(0, 0.21, 0.009); lid.add(lapScreen);
register("laptop", laptop, { look: [-0.95, 0.2, -0.06], dir: [0.45, 0.42, 0.9], fitW: 0.95, minDist: 0.6, accent: C.violet });

/* ---------- robot arm (delivery loop / embodied) ---------- */
const arm = new THREE.Group(); arm.position.set(1.0, 0, -0.38); world.add(arm);
const armWhite = mat(C.white, { roughness: 0.45 }), armDark = mat(C.black, { roughness: 0.5, metalness: 0.2 });
mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.05, 32), armDark, { pos: [0, 0.025, 0], parent: arm });
const shoulder = new THREE.Group(); shoulder.position.set(0, 0.05, 0); arm.add(shoulder);
mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.09, 24), armWhite, { pos: [0, 0.045, 0], parent: shoulder });
const upper = new THREE.Group(); upper.position.set(0, 0.09, 0); shoulder.add(upper);
mesh(new THREE.SphereGeometry(0.058, 20, 16), armDark, { parent: upper });
mesh(new THREE.CapsuleGeometry(0.038, 0.3, 6, 16), armWhite, { pos: [0, 0.17, 0], parent: upper });
const fore = new THREE.Group(); fore.position.set(0, 0.34, 0); upper.add(fore);
mesh(new THREE.SphereGeometry(0.05, 20, 16), armDark, { parent: fore });
mesh(new THREE.CapsuleGeometry(0.032, 0.26, 6, 16), armWhite, { pos: [0, 0.15, 0], parent: fore });
const wrist = new THREE.Group(); wrist.position.set(0, 0.3, 0); fore.add(wrist);
mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 20), armDark, { parent: wrist });
mesh(rbox(0.06, 0.05, 0.05, 0.01), armDark, { pos: [0, 0.05, 0], parent: wrist });
const fingerL = mesh(rbox(0.014, 0.07, 0.03, 0.004), mat(0x9aa2ad, { metalness: 0.5, roughness: 0.4 }), { pos: [-0.025, 0.1, 0], parent: wrist });
const fingerR = mesh(rbox(0.014, 0.07, 0.03, 0.004), mat(0x9aa2ad, { metalness: 0.5, roughness: 0.4 }), { pos: [0.025, 0.1, 0], parent: wrist });
mesh(new THREE.SphereGeometry(0.012, 12, 10), mat(C.cyan, { emissive: C.cyan, emissiveIntensity: 1.2 }), { pos: [0, 0.075, 0.045], parent: wrist, cast: false });
register("arm", arm, { look: [1.0, 0.42, -0.38], dir: [-0.5, 0.55, 1], fitW: 1.25, minDist: 0.8, accent: C.cyan });

/* ---------- MicroDuck (startup) ---------- */
const duck = new THREE.Group(); duck.position.set(1.0, 0, 0.4); duck.rotation.y = -0.6; world.add(duck);
const duckMat = mat(C.duck, { roughness: 0.5 });
const duckBody = mesh(new THREE.SphereGeometry(0.11, 28, 20), duckMat, { pos: [0, 0.12, 0], parent: duck });
duckBody.scale.set(1, 0.8, 1.25);
const duckHead = new THREE.Group(); duckHead.position.set(0, 0.24, 0.09); duck.add(duckHead);
mesh(new THREE.SphereGeometry(0.075, 24, 18), duckMat, { parent: duckHead });
mesh(new THREE.ConeGeometry(0.03, 0.07, 16), mat(C.orange, { roughness: 0.5 }), { pos: [0, -0.01, 0.09], rot: [Math.PI / 2, 0, 0], parent: duckHead });
for (const sx of [-1, 1]) mesh(new THREE.SphereGeometry(0.012, 10, 8), mat(C.black), { pos: [sx * 0.035, 0.02, 0.06], parent: duckHead, cast: false });
mesh(new THREE.SphereGeometry(0.02, 12, 10), mat(C.cyan, { emissive: C.cyan, emissiveIntensity: 0.8 }), { pos: [0, 0.075, 0], parent: duckHead, cast: false });
for (const sx of [-1, 1]) {
  const w = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.025, 20), armDark, { pos: [sx * 0.11, 0.045, -0.02], rot: [0, 0, Math.PI / 2], parent: duck });
  w.userData.wheel = true;
}
mesh(rbox(0.12, 0.02, 0.06, 0.006), mat(C.mint, { emissive: C.mint, emissiveIntensity: 0.25 }), { pos: [0, 0.2, -0.06], rot: [-0.5, 0, 0], parent: duck, cast: false });
register("duck", duck, { look: [1.0, 0.14, 0.4], dir: [-0.35, 0.55, 1], fitW: 0.6, minDist: 0.45, accent: C.mint });

/* ---------- notebook / résumé (experience) ---------- */
const notebook = new THREE.Group(); notebook.position.set(-0.5, 0, 0.44); notebook.rotation.y = -0.15; world.add(notebook);
const coverTex = canvasTexture(512, 700, (g, w, h) => {
  g.fillStyle = "#0f1622"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#22d3ee"; g.fillRect(0, 0, 26, h);
  g.fillStyle = "#e8edf5"; g.textAlign = "left";
  g.font = "700 64px 'Space Grotesk', 'Noto Sans SC', sans-serif"; g.fillText("RESUME", 70, 130);
  g.font = "500 44px 'Noto Sans SC', sans-serif"; g.fillText("马沁桢 · Qinzhen Ma", 70, 200);
  g.fillStyle = "#9aa8bd"; g.font = "500 28px 'JetBrains Mono', monospace";
  ["Lightwheel · Embodied AI Lead", "Baidu · LLM 0→1", "Rice · Kavraki / RobotΠ Lab"].forEach((l, i) => g.fillText(l, 70, 290 + i * 52));
  g.strokeStyle = "rgba(34,211,238,.4)"; g.lineWidth = 3; g.strokeRect(48, 470, w - 100, 160);
  g.fillStyle = "#2ee6a6"; g.font = "600 30px 'JetBrains Mono', monospace"; g.fillText("EXPERIENCE  ▸", 70, 560);
});
const nbMats = [mat(0x0f1622, { roughness: 0.7 }), mat(0x0f1622), mat(0x0f1622, { map: coverTex, roughness: 0.6 }), mat(C.paper, { roughness: 0.9 }), mat(0x0f1622), mat(0x0f1622)];
const nb = mesh(new THREE.BoxGeometry(0.34, 0.032, 0.46), nbMats, { pos: [0, 0.016, 0], parent: notebook });
mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.16, 12), mat(C.metal, { metalness: 0.6, roughness: 0.3 }), { pos: [0.23, 0.007, 0.05], rot: [Math.PI / 2, 0, 0.3], parent: notebook });
mesh(new THREE.ConeGeometry(0.007, 0.02, 12), mat(C.black), { pos: [0.203, 0.007, 0.132], rot: [Math.PI / 2, 0, 0.3], parent: notebook, cast: false });
register("notebook", notebook, { look: [-0.5, 0.02, 0.44], dir: [0.12, 1.15, 0.7], fitW: 0.62, minDist: 0.5, accent: C.amber });

/* ---------- phone (contact) ---------- */
const phone = new THREE.Group(); phone.position.set(0.5, 0, 0.55); phone.rotation.y = 0.25; world.add(phone);
mesh(rbox(0.092, 0.012, 0.19, 0.008), mat(C.black, { roughness: 0.35, metalness: 0.4 }), { pos: [0, 0.006, 0], parent: phone });
const phoneTex = canvasTexture(256, 512, (g, w, h) => {
  const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, "#1d2b44"); grd.addColorStop(1, "#0b1220");
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.fillStyle = "#e8edf5"; g.textAlign = "center"; g.font = "700 60px 'Space Grotesk', sans-serif"; g.fillText("10:24", w / 2, 110);
  g.fillStyle = "#9aa8bd"; g.font = "500 22px 'JetBrains Mono', monospace"; g.fillText("qm18@rice.edu", w / 2, 150);
  const cols = ["#22d3ee", "#2ee6a6", "#f5b84b", "#a78bfa", "#fb6f92", "#3b82f6", "#22d3ee", "#2ee6a6"];
  cols.forEach((c, i) => { g.fillStyle = c; const x = 36 + (i % 4) * 52, y = 220 + Math.floor(i / 4) * 64; g.beginPath(); g.roundRect(x, y, 40, 40, 10); g.fill(); });
  g.fillStyle = "rgba(255,255,255,.12)"; g.beginPath(); g.roundRect(24, 400, w - 48, 70, 18); g.fill();
});
const phoneScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.082, 0.178), new THREE.MeshBasicMaterial({ map: phoneTex, toneMapped: false }));
phoneScreen.rotation.x = -Math.PI / 2; phoneScreen.position.set(0, 0.0125, 0); phone.add(phoneScreen);
register("phone", phone, { look: [0.5, 0.01, 0.55], dir: [0.05, 1.25, 0.55], fitW: 0.3, minDist: 0.3, accent: C.rose });

/* ---------- books + graduation cap (education) ---------- */
const books = new THREE.Group(); books.position.set(1.45, 0, 0.0); books.rotation.y = -0.2; world.add(books);
const bookCols = [C.blue, C.rose, C.amber];
let by = 0;
bookCols.forEach((c, i) => {
  const h = 0.05 + i * 0.008;
  const b = mesh(rbox(0.36 - i * 0.03, h, 0.26, 0.006), mat(c, { roughness: 0.75 }), { pos: [0, by + h / 2, 0], rot: [0, (i - 1) * 0.16, 0], parent: books });
  mesh(new THREE.BoxGeometry(0.34 - i * 0.03, h - 0.012, 0.24), mat(C.paper, { roughness: 0.95 }), { pos: [0, by + h / 2, 0.012], rot: [0, (i - 1) * 0.16, 0], parent: books, cast: false });
  by += h;
});
const cap = new THREE.Group(); cap.position.set(0, by, 0); books.add(cap);
mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.06, 24), mat(C.black, { roughness: 0.6 }), { pos: [0, 0.03, 0], parent: cap });
mesh(rbox(0.3, 0.014, 0.3, 0.004), mat(C.black, { roughness: 0.6 }), { pos: [0, 0.067, 0], rot: [0, 0.35, 0], parent: cap });
mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 8), mat(C.amber), { pos: [0.12, 0.0, 0.1], rot: [0.2, 0, 0.15], parent: cap, cast: false });
mesh(new THREE.SphereGeometry(0.012, 10, 8), mat(C.amber), { pos: [0.135, -0.075, 0.115], parent: cap, cast: false });
register("books", books, { look: [1.45, 0.16, 0.0], dir: [-0.3, 0.7, 1], fitW: 0.7, minDist: 0.55, accent: C.blue });

/* ---------- decor: mug, plant, lamp, sticky notes, wall posters ---------- */
const mug = new THREE.Group(); mug.position.set(0.74, 0, -0.06); world.add(mug);
mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.11, 24), mat(C.white, { roughness: 0.35 }), { pos: [0, 0.055, 0], parent: mug });
mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.004, 24), mat(0x3b2a1e, { roughness: 0.3 }), { pos: [0, 0.108, 0], parent: mug, cast: false });
mesh(new THREE.TorusGeometry(0.03, 0.008, 10, 24, Math.PI), mat(C.white, { roughness: 0.35 }), { pos: [0.05, 0.06, 0], rot: [0, 0, -Math.PI / 2], parent: mug });

const plant = new THREE.Group(); plant.position.set(-1.45, 0, -0.5); world.add(plant);
mesh(new THREE.CylinderGeometry(0.1, 0.075, 0.17, 24), mat(C.pot, { roughness: 0.8 }), { pos: [0, 0.085, 0], parent: plant });
mesh(new THREE.CylinderGeometry(0.092, 0.092, 0.012, 24), mat(0x3a2a1c, { roughness: 1 }), { pos: [0, 0.17, 0], parent: plant, cast: false });
for (let i = 0; i < 9; i++) {
  const a = (i / 9) * Math.PI * 2, r = 0.05 + (i % 3) * 0.03;
  const leaf = mesh(new THREE.SphereGeometry(0.06, 14, 10), mat(C.leaf, { roughness: 0.7 }), { pos: [Math.cos(a) * r, 0.24 + (i % 2) * 0.05, Math.sin(a) * r], parent: plant });
  leaf.scale.set(1, 1.6 + (i % 3) * 0.3, 0.55); leaf.rotation.set(Math.cos(a) * 0.5, a, Math.sin(a) * 0.5);
}

const lamp = new THREE.Group(); lamp.position.set(1.48, 0, -0.58); world.add(lamp);
mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.02, 24), armDark, { pos: [0, 0.01, 0], parent: lamp });
mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 10), armDark, { pos: [0, 0.22, 0], parent: lamp });
mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.38, 10), armDark, { pos: [-0.1, 0.55, 0.05], rot: [0, 0, 0.9], parent: lamp });
const lampHead = mesh(new THREE.ConeGeometry(0.1, 0.13, 24, 1, true), mat(C.metal, { side: THREE.DoubleSide, metalness: 0.4, roughness: 0.4 }), { pos: [-0.25, 0.64, 0.09], rot: [0.5, 0, 0.55], parent: lamp });
mesh(new THREE.SphereGeometry(0.035, 12, 10), mat(0xffe3b0, { emissive: 0xffc37a, emissiveIntensity: 2.2 }), { pos: [-0.27, 0.6, 0.1], parent: lamp, cast: false });
lampLight.position.set(1.48 - 0.27, 0.58, -0.58 + 0.1);

const noteMat = (c) => mat(c, { roughness: 0.9 });
mesh(rbox(0.13, 0.004, 0.13, 0.002), noteMat(0xfff176), { pos: [-0.32, 0.002, -0.42], rot: [0, 0.3, 0], cast: false });
mesh(rbox(0.13, 0.004, 0.13, 0.002), noteMat(0x7ff0c8), { pos: [-0.2, 0.002, -0.55], rot: [0, -0.2, 0], cast: false });

function poster(x, y, w, h, draw) {
  const tex = canvasTexture(Math.round(w * 800), Math.round(h * 800), draw);
  mesh(rbox(w + 0.04, h + 0.04, 0.025, 0.006), mat(C.black, { roughness: 0.5 }), { pos: [x, y, -1.03], cast: false });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
  p.position.set(x, y, -1.016); p.receiveShadow = true; world.add(p);
}
poster(1.05, 1.15, 0.9, 0.6, (g, w, h) => {
  g.fillStyle = "#0f1622"; g.fillRect(0, 0, w, h);
  g.strokeStyle = "#22d3ee"; g.lineWidth = 6; g.beginPath(); g.arc(w / 2, h / 2 + 10, 150, 0, Math.PI * 2); g.stroke();
  g.setLineDash([10, 16]); g.strokeStyle = "#2ee6a6"; g.beginPath(); g.arc(w / 2, h / 2 + 10, 122, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  g.fillStyle = "#e8edf5"; g.textAlign = "center"; g.font = "700 40px 'Space Grotesk', sans-serif";
  [["DATA", 0], ["TRAIN", 1], ["EVAL", 2], ["DEPLOY", 3]].forEach(([t, i]) => { const a = -Math.PI / 2 + i * Math.PI / 2; g.fillStyle = "#0f1622"; g.beginPath(); g.roundRect(w / 2 + Math.cos(a) * 150 - 80, h / 2 + 10 + Math.sin(a) * 150 - 26, 160, 52, 12); g.fill(); g.strokeStyle = "#22d3ee"; g.lineWidth = 3; g.stroke(); g.fillStyle = "#e8edf5"; g.fillText(t, w / 2 + Math.cos(a) * 150, h / 2 + 24 + Math.sin(a) * 150); });
  g.fillStyle = "#22d3ee"; g.font = "600 26px 'JetBrains Mono', monospace"; g.fillText("CLOSED LOOP", w / 2, h / 2 + 20);
});
poster(-1.05, 1.2, 0.7, 0.5, (g, w, h) => {
  g.fillStyle = "#10261f"; g.fillRect(0, 0, w, h);
  g.strokeStyle = "#2ee6a6"; g.lineWidth = 5; g.beginPath(); g.arc(w / 2, 150, 70, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(w / 2, 150, 22, 0, Math.PI * 2); g.fillStyle = "#2ee6a6"; g.fill();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * 30, 150 + Math.sin(a) * 30); g.lineTo(w / 2 + Math.cos(a) * 60, 150 + Math.sin(a) * 60); g.stroke(); }
  g.fillStyle = "#e8edf5"; g.textAlign = "center"; g.font = "700 62px 'Space Grotesk', sans-serif"; g.fillText("OriginX", w / 2, 300);
  g.fillStyle = "#2ee6a6"; g.font = "500 26px 'JetBrains Mono', monospace"; g.fillText("PHYSICAL AI FOR THE HOME", w / 2, 345);
});

/* ---------- videos on the monitor ---------- */
const videoEls = {}, videoTex = {};
const videoHost = $("#desk-videos");
let activeVideo = null;
function buildVideos() {
  for (const v of SITE.videos) {
    const el = document.createElement("video");
    el.muted = true; el.loop = true; el.playsInline = true; el.setAttribute("playsinline", ""); el.crossOrigin = "anonymous";
    el.preload = v.id === SITE.defaultVideo ? "auto" : "metadata";
    el.src = v.file; el.poster = v.poster || "";
    videoHost.appendChild(el);
    videoEls[v.id] = el;
    const tex = new THREE.VideoTexture(el);
    tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    videoTex[v.id] = tex;
  }
}
function setVideo(id, play = true) {
  if (!videoEls[id]) return;
  if (activeVideo && activeVideo !== id) { videoEls[activeVideo].pause(); }
  activeVideo = id;
  const el = videoEls[id];
  const swap = () => { if (activeVideo !== id) return; screenMat.map = videoTex[id]; screenMat.needsUpdate = true; };
  if (el.readyState >= 2) swap(); else el.addEventListener("loadeddata", swap, { once: true });
  if (play && running) el.play().catch(() => { /* autoplay blocked; retried on user gesture */ });
  updatePanelVideoState();
}
function pauseVideos() { Object.values(videoEls).forEach((v) => v.pause()); }
function resumeVideo() { if (activeVideo && running && !userPaused) videoEls[activeVideo].play().catch(() => {}); }
buildVideos();
setVideo(SITE.defaultVideo, true);

/* ---------- camera control ---------- */
const OVERVIEW_TARGET = new THREE.Vector3(0, 0.32, -0.12);
const overviewTarget = new THREE.Vector3();
const cam = {
  mode: "overview", focusKey: null,
  pos: new THREE.Vector3(0, 1.6, 2.3), look: OVERVIEW_TARGET.clone(),
  wantPos: new THREE.Vector3(), wantLook: new THREE.Vector3(),
  az: 0, pol: 1.02, radius: 2.6, dragAz: 0, dragPol: 0, par: { x: 0, y: 0 }
};
function viewport() { const w = stage.clientWidth || 1, h = stage.clientHeight || 1; return { w, h, aspect: w / h, narrow: w < 760 }; }
function hFovHalfTan() { return Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect; }
function overviewSpherical() {
  const { aspect, narrow } = viewport();
  const portrait = aspect < 0.95;
  camera.fov = portrait ? 52 : 45; camera.updateProjectionMatrix();
  const shift = (!portrait && !narrow) ? 0.3 * Math.min(1, (aspect - 0.95) / 0.6) : 0;
  const r = portrait ? 4.1 : clamp((1.7 + shift) / hFovHalfTan() + 0.5, 2.6, 6);
  cam.radius = r; cam.polBase = portrait ? 0.86 : 1.0;
  cam.narrow = narrow;
  overviewTarget.copy(OVERVIEW_TARGET); overviewTarget.x = -shift;
}
function overviewPose(out) {
  const az = cam.az + cam.dragAz + cam.par.x * 0.12 + (reduced ? 0 : Math.sin(clock.t * 0.25) * 0.02);
  const pol = clamp(cam.polBase + cam.dragPol - cam.par.y * 0.06, 0.62, 1.32);
  const r = cam.radius;
  out.pos.set(Math.sin(az) * Math.sin(pol) * r, Math.cos(pol) * r, Math.cos(az) * Math.sin(pol) * r).add(overviewTarget);
  out.pos.y += reduced ? 0 : Math.sin(clock.t * 0.5) * 0.015;
  out.look.copy(overviewTarget);
}
const _tmp = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
const _dir = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function focusPose(key, out) {
  const cfg = hotspots[key].cfg;
  const look = new THREE.Vector3(...cfg.look);
  _dir.set(...cfg.dir).normalize();
  const { narrow } = viewport();
  const halfW = hFovHalfTan(), halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  let dist, shift;
  _right.crossVectors(_up, _dir).normalize();
  if (narrow) {
    // panel is a bottom sheet (52%): fit into the top 48% of the view, centred 26% above the middle
    dist = Math.max(cfg.minDist, (cfg.fitW / 2) / halfW * 1.15, (cfg.fitW * 0.36) / (0.48 * halfH) * 1.15);
    shift = 0.52 * dist * halfH;
    out.pos.copy(look).addScaledVector(_dir, dist);
    out.look.copy(look).addScaledVector(_up, -shift); out.pos.addScaledVector(_up, -shift);
  } else {
    // panel covers the right 32%: fit into the left 68%, centred 16% left of the middle
    dist = Math.max(cfg.minDist, (cfg.fitW / 2) / (0.68 * halfW) * 1.15);
    shift = 0.32 * dist * halfW;
    out.pos.copy(look).addScaledVector(_dir, dist);
    out.look.copy(look).addScaledVector(_right, shift); out.pos.addScaledVector(_right, shift);
  }
  // tiny parallax while focused
  out.pos.addScaledVector(_right, cam.par.x * 0.03).addScaledVector(_up, -cam.par.y * 0.02);
}
function updateCamera(dt) {
  if (cam.mode === "overview") overviewPose(_tmp); else focusPose(cam.focusKey, _tmp);
  const k = reduced ? 1 : 1 - Math.exp(-dt * (cam.mode === "overview" ? 4.5 : 3.6));
  cam.pos.lerp(_tmp.pos, k); cam.look.lerp(_tmp.look, k);
  camera.position.copy(cam.pos); camera.lookAt(cam.look);
}

/* ---------- interaction ---------- */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let hovered = null, pointer = { x: 0, y: 0, down: false, sx: 0, sy: 0, moved: false, id: null }, needPick = false;
const tip = $("#desk-tip");
function setHover(key, ev) {
  if (hovered !== key) {
    hovered = key;
    canvas.style.cursor = key ? "pointer" : (pointer.down ? "grabbing" : "grab");
    if (key && cam.mode === "overview") { tip.textContent = T().desk.hotspots[key].label; tip.hidden = false; } else tip.hidden = true;
  }
  if (key && ev && !tip.hidden) { tip.style.left = (ev.clientX - stage.getBoundingClientRect().left + 14) + "px"; tip.style.top = (ev.clientY - stage.getBoundingClientRect().top - 10) + "px"; }
}
function pick(ev) {
  const r = stage.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(pickMeshes, false)[0];
  return hit ? hit.object.userData.hotspot : null;
}
canvas.addEventListener("pointerdown", (ev) => {
  if (ev.button !== undefined && ev.button !== 0) return;
  pointer.down = true; pointer.moved = false; pointer.sx = ev.clientX; pointer.sy = ev.clientY; pointer.id = ev.pointerId;
  canvas.setPointerCapture?.(ev.pointerId);
  if (!hovered) canvas.style.cursor = "grabbing";
});
canvas.addEventListener("pointermove", (ev) => {
  const r = stage.getBoundingClientRect();
  cam.par.x = ((ev.clientX - r.left) / r.width - 0.5) * 2;
  cam.par.y = ((ev.clientY - r.top) / r.height - 0.5) * 2;
  if (pointer.down) {
    const dx = ev.clientX - pointer.sx, dy = ev.clientY - pointer.sy;
    if (!pointer.moved && Math.hypot(dx, dy) > 5) pointer.moved = true;
    if (pointer.moved && cam.mode === "overview") {
      cam.dragAz = clamp(cam.dragAz - (ev.movementX || 0) * 0.0045, -0.75, 0.75);
      cam.dragPol = clamp(cam.dragPol - (ev.movementY || 0) * 0.003, -0.25, 0.22);
      setHover(null);
      return;
    }
  }
  if (!isTouch) { const k = pick(ev); setHover(k, ev); }
});
function endPointer(ev) {
  if (!pointer.down) return;
  pointer.down = false;
  canvas.style.cursor = hovered ? "pointer" : "grab";
  if (pointer.moved) return;
  const k = pick(ev);
  if (k) focus(k); else if (cam.mode === "focus") unfocus();
}
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", () => { pointer.down = false; });
canvas.addEventListener("pointerleave", () => { if (!pointer.down) { setHover(null); cam.par.x = cam.par.y = 0; } });
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && cam.mode === "focus") unfocus(); });

/* ---------- focus / panel ---------- */
const panel = $("#desk-panel"), panelBody = $("#desk-panel-content"), backBtn = $("#desk-back");
function focus(key) {
  if (!hotspots[key]) return;
  cam.mode = "focus"; cam.focusKey = key; cam.dragAz = cam.dragPol = 0;
  stage.classList.add("focused");
  stage.dataset.focus = key;
  setHover(null);
  renderPanel(key);
  panel.hidden = false; requestAnimationFrame(() => panel.classList.add("open"));
  $$("#desk-legend button").forEach((b) => b.classList.toggle("on", b.dataset.key === key));
  if (key === "monitor") resumeVideo();
  backBtn.focus({ preventScroll: true });
}
function unfocus() {
  cam.mode = "overview"; cam.focusKey = null;
  stage.classList.remove("focused"); delete stage.dataset.focus;
  panel.classList.remove("open"); setTimeout(() => { if (cam.mode === "overview") panel.hidden = true; }, 350);
  $$("#desk-legend button").forEach((b) => b.classList.remove("on"));
  if (activeVideo) videoEls[activeVideo].muted = true;
  updatePanelVideoState();
}
backBtn.addEventListener("click", unfocus);

function link(id, text) { return `<a class="dp-more" href="#${id}">${esc(text)} ↓</a>`; }
function renderPanel(key) {
  const t = T(), D = t.desk, H = D.hotspots[key], L = SITE.links;
  let body = "";
  if (key === "monitor") {
    body = `<div class="dp-videos">${SITE.videos.map((v) => {
      const vt = D.videos[v.id];
      return `<button type="button" class="dp-video ${v.id === activeVideo ? "on" : ""}" data-video="${v.id}"><img src="${v.poster}" alt="" loading="lazy"><span><b>${esc(vt.title)}</b><small>${esc(vt.desc)}</small></span></button>`;
    }).join("")}</div>
    <div class="dp-controls"><button type="button" class="dp-btn" id="dp-play"></button><button type="button" class="dp-btn" id="dp-mute"></button></div>
    <p class="dp-note">${esc(D.videoNote)}</p>${link("projects", D.scrollMore)}`;
  } else if (key === "laptop") {
    body = `<ul class="dp-list">${t.projects.items.map((p) => `<li><span class="badge badge-${p.accent === "mint" ? "mint" : p.accent === "amber" ? "amber" : p.accent === "violet" ? "violet" : "cyan"}">${esc(p.badge)}</span><b>${esc(p.title)}</b></li>`).join("")}</ul>${link("projects", D.scrollMore)}`;
  } else if (key === "arm") {
    body = `<ol class="dp-steps">${t.loop.nodes.map((n) => `<li><div><b>${esc(n.short)}</b><span>${esc(n.title)}</span></div></li>`).join("")}</ol>
    <div class="chips">${t.skills.groups[0].items.map(([n]) => `<span class="chip cyan">${esc(n)}</span>`).join("")}</div>${link("loop", D.scrollMore)}`;
  } else if (key === "duck") {
    const S = t.startup;
    body = `<div class="dp-brand"><b>${esc(S.brand)}</b><small>${esc(S.tagline)}</small></div><h4>${esc(S.headline)}</h4><p>${esc(S.desc)}</p>
    <a class="btn btn-primary" href="${lang() === "en" ? L.startupEn : L.startup}" target="_blank" rel="noopener">${esc(S.cta)} ↗</a>${link("startup", D.scrollMore)}`;
  } else if (key === "notebook") {
    const E = t.experience, Hh = t.hero;
    body = `<div class="dp-me"><img src="${L.avatar}" alt=""><div><b>${esc(Hh.name)}</b><small>${esc(Hh.roles[0])}</small></div></div>
    <ul class="dp-list">${E.items.map((it) => `<li><small class="mono">${esc(it.date)}</small><b>${esc(it.role)}</b><span>${esc(it.org)}</span></li>`).join("")}</ul>
    <a class="btn btn-amber" href="${L.resume}" download>${esc(Hh.ctaTertiary)}</a>${link("experience", D.scrollMore)}`;
  } else if (key === "phone") {
    const Ct = t.contact;
    const row = (lbl, val, act) => `<div class="crow"><div class="l"><div class="lbl">${esc(lbl)}</div><div class="val">${esc(val)}</div></div>${act}</div>`;
    body = `<div class="dp-contact">${row(Ct.email, L.email, `<button class="act" type="button" data-copy="${esc(L.email)}">${esc(Ct.copy)}</button>`)}${row(Ct.wechat, L.wechat, `<button class="act" type="button" data-copy="${esc(L.wechat)}">${esc(Ct.copy)}</button>`)}${row(Ct.phoneUS, L.phoneUS, `<a class="act" href="tel:${L.phoneUS.replace(/\s/g, "")}">${esc(Ct.open)}</a>`)}${row(Ct.linkedin, "linkedin.com/in/qinzhen-ma", `<a class="act" href="${L.linkedin}" target="_blank" rel="noopener">${esc(Ct.open)} ↗</a>`)}${row(Ct.github, "github.com/quinn-ma", `<a class="act" href="${L.github}" target="_blank" rel="noopener">${esc(Ct.open)} ↗</a>`)}</div>${link("contact", D.scrollMore)}`;
  } else if (key === "books") {
    const Ed = t.education;
    body = `<ul class="dp-list">${Ed.items.map((e) => `<li><small class="mono">${esc(e.date)}</small><b>${esc(e.school)}</b><span>${esc(e.degree)}</span></li>`).join("")}<li><small class="mono">HONOR</small><b>${esc(Ed.honors[0][0])}</b><span>${esc(Ed.honors[0][1])}</span></li></ul>${link("education", D.scrollMore)}`;
  }
  panelBody.innerHTML = `<div class="dp-k">${esc(H.label)}</div><h3>${esc(H.title)}</h3><p class="dp-lead">${esc(H.desc)}</p>${body}`;
  // bindings
  $$("[data-video]", panelBody).forEach((b) => b.addEventListener("click", () => { userPaused = false; setVideo(b.dataset.video, true); $$("[data-video]", panelBody).forEach((x) => x.classList.toggle("on", x === b)); }));
  $("#dp-play", panelBody)?.addEventListener("click", () => { const v = videoEls[activeVideo]; if (v.paused) { userPaused = false; v.play().catch(() => {}); } else { userPaused = true; v.pause(); } updatePanelVideoState(); });
  $("#dp-mute", panelBody)?.addEventListener("click", () => { const v = videoEls[activeVideo]; v.muted = !v.muted; updatePanelVideoState(); });
  $$("[data-copy]", panelBody).forEach((b) => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); } catch (e) { /* ignore */ }
    window.siteToast?.(`${T().contact.copied}: ${b.dataset.copy}`);
  }));
  $$("a.dp-more", panelBody).forEach((a) => a.addEventListener("click", () => setTimeout(unfocus, 50)));
  updatePanelVideoState();
}
function updatePanelVideoState() {
  const D = T().desk, v = activeVideo && videoEls[activeVideo];
  const play = $("#dp-play"), mute = $("#dp-mute");
  if (play && v) play.textContent = v.paused ? "▶ " + D.play : "❚❚ " + D.pause;
  if (mute && v) mute.textContent = v.muted ? "🔇 " + D.unmute : "🔊 " + D.mute;
}

/* ---------- legend / hint / i18n ---------- */
const legend = $("#desk-legend"), hint = $("#desk-hint");
const ORDER = ["monitor", "duck", "arm", "laptop", "notebook", "books", "phone"];
function renderChrome() {
  const D = T().desk;
  legend.innerHTML = ORDER.map((k) => `<button type="button" data-key="${k}" class="${cam.focusKey === k ? "on" : ""}">${esc(D.hotspots[k].label)}</button>`).join("");
  $$("button", legend).forEach((b) => b.addEventListener("click", () => (cam.focusKey === b.dataset.key ? unfocus() : focus(b.dataset.key))));
  hint.textContent = isTouch ? D.hintTouch : D.hint;
  backBtn.textContent = "← " + D.back;
  if (cam.mode === "focus") renderPanel(cam.focusKey);
}
window.addEventListener("site:lang", renderChrome);
window.addEventListener("site:theme", () => applyTheme());
function applyTheme() {
  const p = PAL[theme()];
  themeMats.forEach(({ m, key: k }) => m.color.setHex(p[k]));
  hemi.color.setHex(p.hemiSky); hemi.groundColor.setHex(p.hemiGround);
  key.intensity = p.keyI; fill.intensity = p.fillI;
  scene.background = new THREE.Color(p.bg);
  scene.fog.color.setHex(p.bg);
}

/* ---------- idle animation ---------- */
const clock = { t: 0, last: performance.now() };
function animate(dt) {
  if (reduced) return;
  const t = clock.t;
  shoulder.rotation.y = Math.sin(t * 0.45) * 0.7 - 0.3;
  upper.rotation.x = -0.35 + Math.sin(t * 0.6) * 0.22;
  fore.rotation.x = 0.9 + Math.sin(t * 0.6 + 1.2) * 0.35;
  wrist.rotation.x = -0.4 + Math.sin(t * 0.6 + 2) * 0.2;
  const g = 0.012 + (Math.sin(t * 1.2) > 0.6 ? 0.0 : 0.014);
  fingerL.position.x = -0.011 - g; fingerR.position.x = 0.011 + g;
  duck.position.y = Math.abs(Math.sin(t * 2.2)) * 0.012;
  duckHead.rotation.y = Math.sin(t * 0.8) * 0.5; duckHead.rotation.z = Math.sin(t * 1.7) * 0.08;
  duck.traverse((o) => { if (o.userData.wheel) o.rotation.x += dt * 1.5; });
  screenGlow.intensity = 1.0 + Math.sin(t * 7.3) * 0.08 + Math.sin(t * 2.1) * 0.12;
  // hover / focus glow + scale
  for (const k in hotspots) {
    const h = hotspots[k];
    const want = (k === hovered || k === cam.focusKey) ? 1 : 0;
    h.glow += (want - h.glow) * Math.min(1, dt * 9);
    const s = 1 + h.glow * (k === cam.focusKey ? 0 : 0.045);
    h.group.scale.set(s, s, s);
    if (h.glow > 0.001 || h._wasGlow) {
      h.meshes.forEach((m) => { (Array.isArray(m.material) ? m.material : [m.material]).forEach((mm) => { if (mm && mm.emissive && !mm.userData.keep) { mm.emissive.setHex(h.cfg.accent); mm.emissiveIntensity = h.glow * 0.28; } }); });
      h._wasGlow = h.glow > 0.001;
    }
  }
}
// keep the arm's own LED and duck LEDs from being overridden by glow
[arm, duck].forEach((g) => g.traverse((o) => { if (o.isMesh && o.material.emissiveIntensity > 0.5) o.material.userData.keep = true; }));

/* ---------- loop / lifecycle ---------- */
function tick(now) {
  if (!running) return;
  raf = requestAnimationFrame(tick);
  const dt = Math.min(0.05, (now - clock.last) / 1000); clock.last = now; clock.t += dt;
  animate(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
}
function start() { if (running) return; running = true; clock.last = performance.now(); raf = requestAnimationFrame(tick); resumeVideo(); }
function stop() { running = false; cancelAnimationFrame(raf); pauseVideos(); }
function syncRunning() { if (inView && visible) start(); else stop(); }
new IntersectionObserver((ents) => { inView = ents[0].isIntersecting; syncRunning(); }, { threshold: 0.05 }).observe(stage);
document.addEventListener("visibilitychange", () => { visible = !document.hidden; syncRunning(); });
function resize() {
  const { w, h } = viewport();
  renderer.setSize(w, h, false);
  camera.aspect = w / h; overviewSpherical();
}
new ResizeObserver(resize).observe(stage);
// retry autoplay on the first user gesture (some browsers block muted autoplay in low-power mode)
const gesture = () => { resumeVideo(); window.removeEventListener("pointerdown", gesture); window.removeEventListener("keydown", gesture); };
window.addEventListener("pointerdown", gesture); window.addEventListener("keydown", gesture);

function failGracefully() {
  stage.classList.add("no-webgl");
  const l = $("#desk-loading"); if (l) l.textContent = (window.SITE && SITE[document.documentElement.lang.startsWith("zh") ? "zh" : "en"].desk.unsupported) || "3D unavailable";
}

/* ---------- boot ---------- */
function boot() {
  applyTheme(); resize(); renderChrome();
  cam.pos.set(0, 2.3, 3.7); // fly in from a little further away
  renderer.compile(scene, camera);
  start();
  stage.classList.add("ready");
  $("#desk-loading")?.remove();
  // deep link: ?focus=monitor|duck|arm|laptop|notebook|books|phone
  const f = new URLSearchParams(location.search).get("focus");
  if (f && hotspots[f]) setTimeout(() => focus(f), 400);
}
canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); stop(); }, false);
canvas.addEventListener("webglcontextrestored", () => start(), false);
if (window.SITE_READY) boot(); else window.addEventListener("site:ready", boot, { once: true });
