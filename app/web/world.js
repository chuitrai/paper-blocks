// Thế giới khối hộp 3D góc nhìn thứ nhất (three.js, bản vendor trong ./vendor, không tải từ CDN).
// Mọi texture được SINH bằng mã (nhiễu có hạt giống), không dùng ảnh/tài nguyên của ai.
// Mỗi paper là một toà nhà; nhìn vào biển tên rồi bấm E (hoặc click) để mở.
import * as THREE from "./vendor/three.module.js";

const SPACING = 18; // khoảng cách tâm hai toà nhà
const COLS = 3;
const BW = 8; // rộng (trục x)
const BD = 7; // sâu (trục z)
const WALL_H = 4;
const EYE = 1.62;
const PH = 1.8; // chiều cao người chơi
const PR = 0.3; // nửa bề rộng
const WALK = 4.3;
const SPRINT = 6.6;
const GRAV = 26;
const JUMP = 8.6;
const REACH = 11;
const SENS = 0.0022;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tex(palette, seed, opts = {}) {
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  const x = c.getContext("2d");
  const r = rng(seed);
  for (let py = 0; py < 16; py++) {
    for (let px = 0; px < 16; px++) {
      x.fillStyle = palette[Math.floor(r() * palette.length)];
      x.fillRect(px, py, 1, 1);
    }
  }
  if (opts.lines) {
    x.fillStyle = opts.lines;
    for (let py = 3; py < 16; py += 4) x.fillRect(0, py, 16, 1);
  }
  if (opts.edge) {
    x.fillStyle = opts.edge;
    x.fillRect(0, 0, 16, 1);
    x.fillRect(0, 15, 16, 1);
    x.fillRect(0, 0, 1, 16);
    x.fillRect(15, 0, 1, 16);
  }
  if (opts.topGreen) {
    const gr = rng(seed + 100);
    for (let px = 0; px < 16; px++) {
      const h = 3 + Math.floor(gr() * 3);
      for (let py = 0; py < h; py++) {
        x.fillStyle = ["#5da130", "#6bb83a", "#4f8f27"][Math.floor(gr() * 3)];
        x.fillRect(px, py, 1, 1);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const DIRT = ["#7a5230", "#6f4a2b", "#85593a", "#664426"];
const GRASS = ["#5da130", "#6bb83a", "#4f8f27", "#64ad34"];

function makeMaterials() {
  const m = (map, extra = {}) => new THREE.MeshLambertMaterial({ map, ...extra });
  const dirt = tex(DIRT, 1);
  const wallTex = [
    tex(["#b48a50", "#a97f46", "#bf9660"], 4, { lines: "#8a6531" }),
    tex(["#c9c2b0", "#bcb59f", "#d3ccba"], 10, { lines: "#9a937f" }),
    tex(["#7b8aa0", "#707f95", "#8796ac"], 11, { lines: "#56647a" }),
  ];
  const roofTex = [
    tex(["#a33b32", "#932f27", "#b3463c"], 9, { lines: "#6e1f19" }),
    tex(["#3a5fa8", "#31548f", "#4569b4"], 12, { lines: "#243e70" }),
    tex(["#6e4aa3", "#5f3f91", "#7c58b3"], 13, { lines: "#44296d" }),
  ];
  const log = tex(["#5b3f22", "#4d351c", "#654626"], 5, { lines: "#3a2813" });
  const mats = {
    // thứ tự mặt của BoxGeometry: +x, -x, +y, -y, +z, -z
    grass: [m(tex(DIRT, 2, { topGreen: true })), m(tex(DIRT, 2, { topGreen: true })), m(tex(GRASS, 3)), m(dirt), m(tex(DIRT, 2, { topGreen: true })), m(tex(DIRT, 2, { topGreen: true }))],
    log: [m(log), m(log), m(tex(["#8a6a3a", "#7d5f33", "#957444"], 14)), m(log), m(log), m(log)],
    leaves: m(tex(["#2f7d32", "#3b8f3e", "#276b2a"], 6)),
    plank: m(tex(["#9a7440", "#8c6838", "#a67f48"], 15, { lines: "#6e5028" })),
    glass: m(tex(["#bfe6f5", "#a9d8ee", "#d3f0fb"], 7, { edge: "#6aa7c2" }), { transparent: true, opacity: 0.55 }),
    lamp: new THREE.MeshBasicMaterial({ map: tex(["#ffe9a0", "#fff1be", "#ffdf80"], 16, { edge: "#c9a030" }) }),
  };
  wallTex.forEach((t, i) => (mats["wall" + i] = m(t)));
  roofTex.forEach((t, i) => (mats["roof" + i] = m(t)));
  return mats;
}

function signTexture(paper) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const x = c.getContext("2d");
  x.fillStyle = "#3b2a17";
  x.fillRect(0, 0, 256, 64);
  x.fillStyle = "#5b4020";
  x.fillRect(4, 4, 248, 56);
  x.fillStyle = "#fff";
  x.font = "bold 20px monospace";
  x.textBaseline = "middle";
  let t = paper.title;
  while (t.length > 1 && x.measureText(t).width > 236) t = t.slice(0, -1);
  if (t !== paper.title) t += "…";
  x.fillText(t, 10, 24);
  const icons = [
    [paper.has_pdf, "#f4f1e8"],
    [paper.repo_url, "#2b2f36"],
    [paper.video_url, "#d94141"],
    [paper.demo_url, "#4cc35a"],
  ].filter((i) => i[0]);
  icons.forEach((ic, i) => {
    x.fillStyle = "#000";
    x.fillRect(10 + i * 22, 40, 16, 14);
    x.fillStyle = ic[1];
    x.fillRect(12 + i * 22, 42, 12, 10);
  });
  const t2 = new THREE.CanvasTexture(c);
  t2.magFilter = THREE.NearestFilter;
  t2.minFilter = THREE.NearestFilter;
  t2.colorSpace = THREE.SRGBColorSpace;
  return t2;
}

export function createWorld(canvas, { onEnter }) {
  const stage = canvas.parentElement;
  const overlay = stage.querySelector("#overlay");
  const prompt = stage.querySelector("#prompt");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const SKY = 0x8fc8f5;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 35, 95);
  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 200);
  camera.rotation.order = "YXZ";
  scene.add(new THREE.HemisphereLight(0xdff0ff, 0x6b5a3a, 1.35));
  const sun = new THREE.DirectionalLight(0xfff2cc, 1.4);
  sun.position.set(30, 60, 20);
  scene.add(sun);

  const mats = makeMaterials();
  const box = new THREE.BoxGeometry(1, 1, 1);
  let dyn = null; // nhóm đối tượng được dựng lại khi danh sách paper thay đổi
  let solid = new Set();
  let signs = [];
  let half = 40;
  let papers = [];
  const clouds = [];

  // ----- người chơi -----
  const p = { x: 0, y: 0.5, z: 9, vy: 0, yaw: 0, pitch: 0, ground: true };
  const keys = new Set();
  let locked = false;
  let paused = false;

  const K = (x, y, z) => x + "," + y + "," + z;
  const isSolid = (cx, cy, cz) => cy <= 0 || solid.has(K(cx, cy, cz));
  const cell = (v) => Math.floor(v + 0.5);

  function collides(x, y, z) {
    const x0 = cell(x - PR), x1 = cell(x + PR);
    const y0 = cell(y), y1 = cell(y + PH - 0.001);
    const z0 = cell(z - PR), z1 = cell(z + PR);
    for (let ix = x0; ix <= x1; ix++)
      for (let iy = y0; iy <= y1; iy++)
        for (let iz = z0; iz <= z1; iz++) if (isSolid(ix, iy, iz)) return true;
    return false;
  }

  // ----- dựng thế giới -----
  function clearDyn() {
    if (!dyn) return;
    dyn.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      if (o.material?.map && o.userData.sign) o.material.map.dispose();
    });
    scene.remove(dyn);
    dyn = null;
  }

  function build() {
    clearDyn();
    dyn = new THREE.Group();
    scene.add(dyn);
    solid = new Set();
    signs = [];
    const blocks = {}; // loại -> danh sách [x,y,z]
    const put = (type, x, y, z, isSol = true) => {
      (blocks[type] ||= []).push([x, y, z]);
      if (isSol) solid.add(K(x, y, z));
    };

    const rows = Math.max(1, Math.ceil(papers.length / COLS));
    half = Math.max(40, 18 + rows * SPACING);
    blocks.grass = [];
    for (let x = -half; x <= half; x++) for (let z = -half; z <= half; z++) blocks.grass.push([x, 0, z]);

    const footprints = [];
    papers.forEach((paper, i) => {
      const c = i % COLS;
      const r = Math.floor(i / COLS);
      const cx = Math.round((c - (Math.min(COLS, papers.length) - 1) / 2) * SPACING);
      const cz = -12 - r * SPACING;
      const x0 = cx - Math.floor(BW / 2);
      const z0 = cz - Math.floor(BD / 2);
      footprints.push([x0 - 3, z0 - 3, x0 + BW + 3, z0 + BD + 3]);
      const wall = "wall" + (paper.id % 3);
      const roof = "roof" + (paper.id % 3);
      const doorX = x0 + Math.floor(BW / 2) - 1; // cửa rộng 2 ô: doorX, doorX+1
      const front = z0 + BD - 1; // hàng khối mặt trước (hướng +z)

      // sàn ván phủ lên lớp cỏ (chỉ là mặt phẳng hiển thị, phần rắn vẫn là lớp cỏ bên dưới)
      for (let x = 0; x < BW; x++) for (let z = 0; z < BD; z++) put("plank", x0 + x, 0, z0 + z, false);
      for (let y = 1; y <= WALL_H; y++) {
        for (let x = 0; x < BW; x++) {
          for (let z = 0; z < BD; z++) {
            const edge = x === 0 || x === BW - 1 || z === 0 || z === BD - 1;
            if (!edge) continue;
            const gx = x0 + x, gz = z0 + z;
            const isFront = z === BD - 1;
            if (isFront && (gx === doorX || gx === doorX + 1) && y <= 3) continue; // cửa
            if (isFront && (x === 1 || x === BW - 2) && (y === 2 || y === 3)) {
              put("glass", gx, y, gz);
              continue;
            }
            put(wall, gx, y, gz);
          }
        }
      }
      // mái hai tầng
      for (let x = -1; x <= BW; x++) for (let z = -1; z <= BD; z++) put(roof, x0 + x, WALL_H + 1, z0 + z);
      for (let x = 1; x < BW - 1; x++) for (let z = 1; z < BD - 1; z++) put(roof, x0 + x, WALL_H + 2, z0 + z);
      // đèn trong nhà
      put("lamp", x0 + 1, WALL_H, z0 + 1, true);
      put("lamp", x0 + BW - 2, WALL_H, z0 + 1, true);

      // biển tên phía trên cửa
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: signTexture(paper) }));
      sign.position.set(doorX + 0.5, WALL_H, front + 0.5 + 0.02);
      sign.userData = { paper, sign: true };
      dyn.add(sign);
      signs.push(sign);
    });

    // cây rải rác, tránh khu vực toà nhà và điểm xuất phát
    const tr = rng(77);
    const treeCount = Math.floor(half * 0.9);
    for (let i = 0; i < treeCount; i++) {
      const tx = Math.floor((tr() * 2 - 1) * (half - 3));
      const tz = Math.floor((tr() * 2 - 1) * (half - 3));
      if (footprints.some((f) => tx >= f[0] && tx <= f[2] && tz >= f[1] && tz <= f[3])) continue;
      if (Math.abs(tx) < 4 && tz > 3) continue;
      const h = 3 + Math.floor(tr() * 2);
      for (let y = 1; y <= h; y++) put("log", tx, y, tz);
      for (let dx = -2; dx <= 2; dx++)
        for (let dz = -2; dz <= 2; dz++)
          for (let dy = h - 1; dy <= h + 1; dy++) {
            const corner = Math.abs(dx) === 2 && Math.abs(dz) === 2;
            const top = dy === h + 1 && (Math.abs(dx) > 1 || Math.abs(dz) > 1);
            if (corner || top || (dx === 0 && dz === 0 && dy < h + 1)) continue;
            put("leaves", tx + dx, dy, tz + dz);
          }
    }

    // gom thành InstancedMesh theo loại
    const m4 = new THREE.Matrix4();
    for (const [type, list] of Object.entries(blocks)) {
      if (type === "plank") continue; // sàn: xử lý riêng bên dưới
      const mesh = new THREE.InstancedMesh(box, mats[type], list.length);
      list.forEach(([x, y, z], i) => mesh.setMatrixAt(i, m4.makeTranslation(x, y, z)));
      mesh.instanceMatrix.needsUpdate = true;
      dyn.add(mesh);
    }
    // sàn ván nằm đè lên lớp cỏ trong nhà (cao hơn 0.01 để không bị z-fighting)
    if (blocks.plank) {
      const floor = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mats.plank, blocks.plank.length);
      blocks.plank.forEach(([x, , z], i) => floor.setMatrixAt(i, m4.makeTranslation(x, 0.505, z)));
      floor.instanceMatrix.needsUpdate = true;
      dyn.add(floor);
    }

    // mặt đất vô tận phía ngoài để không thấy "mép thế giới" lơ lửng
    const far = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x4f8f27 }));
    far.position.y = 0.45;
    dyn.add(far);

    // mặt trời vuông + mây
    const sunMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 2), new THREE.MeshBasicMaterial({ color: 0xffe066, fog: false }));
    sunMesh.position.set(60, 90, -120);
    sunMesh.lookAt(0, 0, 0);
    dyn.add(sunMesh);
    clouds.length = 0;
    const cr = rng(5);
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Group();
      const n = 3 + Math.floor(cr() * 4);
      for (let k = 0; k < n; k++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(5 + cr() * 5, 1.6, 4 + cr() * 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, fog: false }));
        b.position.set(k * 5 - n * 2.5, cr() * 0.6, (cr() - 0.5) * 4);
        g.add(b);
      }
      g.position.set((cr() * 2 - 1) * 130, 38 + cr() * 8, (cr() * 2 - 1) * 130);
      dyn.add(g);
      clouds.push(g);
    }
  }

  // ----- vào toà nhà -----
  const ray = new THREE.Raycaster();
  ray.far = REACH;
  let target = null;
  function enter(paper) {
    onEnter(paper);
  }

  // ----- điều khiển -----
  const typing = () => ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
  function onKeyDown(e) {
    if (paused || !locked || typing() || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.code;
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight"].includes(k)) {
      keys.add(k);
      e.preventDefault();
    } else if (k === "KeyE" && target) {
      enter(target.paper);
    }
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }
  function onMouseMove(e) {
    if (!locked || paused) return;
    p.yaw -= e.movementX * SENS;
    p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch - e.movementY * SENS));
  }
  function onCanvasClick() {
    if (paused) return;
    if (!locked) {
      canvas.requestPointerLock?.();
    } else if (target) {
      enter(target.paper);
    }
  }
  function onLockChange() {
    locked = document.pointerLockElement === canvas;
    if (!locked) keys.clear();
    if (overlay) overlay.hidden = locked || paused;
    if (prompt && !locked) prompt.hidden = true;
  }
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("pointerlockchange", onLockChange);
  canvas.addEventListener("click", onCanvasClick);
  overlay?.addEventListener("click", onCanvasClick);

  function resize() {
    const w = canvas.clientWidth || 640;
    const h = canvas.clientHeight || 360;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // ----- vòng lặp -----
  const dirV = new THREE.Vector3();
  function update(dt) {
    if (!paused && locked) {
      const f = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
      const s = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
      const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? SPRINT : WALK;
      let dx = -Math.sin(p.yaw) * f + Math.cos(p.yaw) * s;
      let dz = -Math.cos(p.yaw) * f - Math.sin(p.yaw) * s;
      const len = Math.hypot(dx, dz);
      if (len > 0) {
        dx = (dx / len) * speed * dt;
        dz = (dz / len) * speed * dt;
      }
      if (keys.has("Space") && p.ground) {
        p.vy = JUMP;
        p.ground = false;
      }
      // từng trục một để trượt dọc tường
      if (!collides(p.x + dx, p.y, p.z)) p.x += dx;
      if (!collides(p.x, p.y, p.z + dz)) p.z += dz;
      p.vy -= GRAV * dt;
      const ny = p.y + p.vy * dt;
      if (!collides(p.x, ny, p.z)) {
        p.y = ny;
        p.ground = false;
      } else {
        if (p.vy < 0) {
          p.y = cell(ny) + 0.5; // đặt chân đúng lên mặt khối
          p.ground = true;
        }
        p.vy = 0;
      }
      p.x = Math.max(-half + 1, Math.min(half - 1, p.x));
      p.z = Math.max(-half + 1, Math.min(half - 1, p.z));
    }
    camera.position.set(p.x, p.y + EYE, p.z);
    camera.rotation.set(p.pitch, p.yaw, 0);

    if (!reduceMotion) for (const c of clouds) c.position.x = c.position.x > 150 ? -150 : c.position.x + dt * 1.2;

    // nhắm vào biển tên?
    target = null;
    if (locked && !paused && signs.length) {
      camera.updateMatrixWorld();
      ray.setFromCamera({ x: 0, y: 0 }, camera);
      const hit = ray.intersectObjects(signs, false)[0];
      if (hit) target = hit.object.userData;
    }
    if (prompt) {
      prompt.hidden = !target;
      if (target) prompt.textContent = "[E] Mở: " + target.paper.title;
    }
  }

  let last = performance.now();
  let raf = requestAnimationFrame(function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  });

  build();

  return {
    setPapers(list) {
      papers = list;
      build();
    },
    setPaused(v) {
      paused = v;
      if (v) {
        keys.clear();
        if (document.pointerLockElement) document.exitPointerLock();
        if (prompt) prompt.hidden = true;
      }
      if (overlay) overlay.hidden = locked || v;
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", onLockChange);
      canvas.removeEventListener("click", onCanvasClick);
      renderer.dispose();
    },
  };
}
