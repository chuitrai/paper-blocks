// Living 3D Minecraft BSL/Complementary Shader World + 60fps Isometric Block Knowledge Graph
// + Frame Hover "Voxel Block & Wildflower Bloom" Overlay Engine (#fx-canvas).
//
// Features:
//   1. Real-time River Water Refraction, Waterwheel Splash, Chimney Smoke, Flickering Lanterns,
//      Volumetric Sunbeams, Voxel Leaves & Fireflies over ./assets/mc-shader-bg.jpg.
//   2. 60fps Interactive Knowledge Graph with pre-rendered Isometric Minecraft Block sprites.
//   3. Frame Hover Bloom (#fx-canvas): hovering any section or card (.frosted-section, .card,
//      .academic-row, .media-card, .cv-item, .portrait-frame, .s-link) triggers an elastic
//      bloom of pixel-art Minecraft wildflowers, popping isometric blocks, and a glowing
//      border garden around the active frame.
//
// Preserves API contract: createWorld(canvas) -> { setPapers(list), setPaused(flag), cycleTimeMode() }

export function createWorld(canvas) {
  const noMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!canvas) {
    return { setPapers() {}, setPaused() {}, cycleTimeMode() { return 0; } };
  }

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) {
    return { setPapers() {}, setPaused() {}, cycleTimeMode() { return 0; } };
  }

  // Foreground FX Canvas for Frame Hover Block & Flower Bloom
  const fxCanvas = document.getElementById("fx-canvas");
  const fxCtx = fxCanvas ? fxCanvas.getContext("2d", { alpha: true }) : null;

  // ----- Load 3D Minecraft Shader Wallpaper + Optional Video Loop -----
  const bgImg = new Image();
  let bgImgLoaded = false;
  bgImg.onload = () => {
    bgImgLoaded = true;
  };
  bgImg.src = "./assets/mc-shader-bg.jpg";

  let bgVideo = null;
  let bgVideoReady = false;
  const customVideoUrl = canvas.dataset?.video || window.MC_BG_VIDEO || "";
  if (customVideoUrl) {
    bgVideo = document.createElement("video");
    bgVideo.src = customVideoUrl;
    bgVideo.muted = true;
    bgVideo.loop = true;
    bgVideo.playsInline = true;
    bgVideo.autoplay = true;
    bgVideo.addEventListener("canplay", () => {
      bgVideoReady = true;
      bgVideo.play().catch(() => {});
    });
  }

  // ----- 3 Shader Lighting Themes (Daylight / Sunset / Firefly Night) -----
  const THEMES = [
    {
      name: "Daylight Shader",
      tintTop: "rgba(10, 22, 40, 0.12)",
      tintBot: "rgba(8, 18, 32, 0.28)",
      sunbeam: "rgba(254, 243, 199, 0.14)",
      waterGlint: "rgba(255, 251, 235, 0.72)",
      lanternGlow: "251, 191, 36",
      fireflyRgb: "254, 240, 138",
      clusters: [
        { hex: "#34d399", rgb: "52, 211, 153" },
        { hex: "#38bdf8", rgb: "56, 189, 248" },
        { hex: "#fbbf24", rgb: "251, 191, 36" },
      ],
      edgeRgb: "226, 232, 240",
      cursorRgb: "254, 240, 138",
    },
    {
      name: "Sunset Shader",
      tintTop: "rgba(67, 20, 48, 0.30)",
      tintBot: "rgba(28, 16, 38, 0.46)",
      sunbeam: "rgba(251, 146, 60, 0.19)",
      waterGlint: "rgba(253, 186, 116, 0.78)",
      lanternGlow: "249, 115, 22",
      fireflyRgb: "251, 191, 36",
      clusters: [
        { hex: "#f59e0b", rgb: "245, 158, 11" },
        { hex: "#c084fc", rgb: "192, 132, 252" },
        { hex: "#fb7185", rgb: "251, 113, 133" },
      ],
      edgeRgb: "254, 215, 170",
      cursorRgb: "251, 146, 60",
    },
    {
      name: "Firefly Night",
      tintTop: "rgba(3, 10, 28, 0.56)",
      tintBot: "rgba(4, 12, 30, 0.70)",
      sunbeam: "rgba(56, 189, 248, 0.09)",
      waterGlint: "rgba(125, 211, 252, 0.65)",
      lanternGlow: "253, 224, 71",
      fireflyRgb: "110, 231, 183",
      clusters: [
        { hex: "#22d3ee", rgb: "34, 211, 238" },
        { hex: "#10b981", rgb: "16, 185, 129" },
        { hex: "#818cf8", rgb: "129, 140, 248" },
      ],
      edgeRgb: "148, 163, 184",
      cursorRgb: "52, 211, 153",
    },
  ];

  let timeMode = 0;

  // =========================================================================
  // 1. PRE-RENDERED ISOMETRIC MINECRAFT BLOCK SPRITES (8x8x8)
  // =========================================================================
  function shadeHex(hex, factor) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * factor)));
    const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * factor)));
    const b = Math.min(255, Math.max(0, Math.round((n & 255) * factor)));
    return `rgb(${r},${g},${b})`;
  }

  function pHash(x, y, seed) {
    const h = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return h - Math.floor(h);
  }

  const BLOCK_DEFS = {
    grass: {
      top: (u, v, r) => (r > 0.65 ? "#65a30d" : r < 0.25 ? "#4d7c0f" : "#579211"),
      side: (u, v, r) => (v < 2 || (v === 2 && u % 2 === 0) ? "#579211" : r > 0.6 ? "#854d0e" : r < 0.25 ? "#5c3409" : "#713f12"),
    },
    bookshelf: {
      top: (u, v, r) => (r > 0.5 ? "#b45309" : "#92400e"),
      side: (u, v) => {
        if (v === 0 || v === 3 || v === 4 || v === 7) return "#92400e";
        const bookColors = ["#dc2626", "#2563eb", "#16a34a", "#d97706", "#9333ea", "#0891b2"];
        return bookColors[(u + v * 3) % bookColors.length];
      },
    },
    enchant: {
      top: (u, v) => (u === 0 || u === 7 || v === 0 || v === 7 ? "#38bdf8" : (u + v) % 2 === 0 ? "#dc2626" : "#991b1b"),
      side: (u, v, r) => (v < 2 ? "#dc2626" : (u === 1 || u === 6) && v < 5 ? "#38bdf8" : r > 0.5 ? "#1e1b4b" : "#0f172a"),
    },
    emerald: {
      top: (u, v, r) => (u === 0 || u === 7 || v === 0 || v === 7 ? "#059669" : u >= 2 && u <= 5 && v >= 2 && v <= 5 ? "#6ee7b7" : r > 0.5 ? "#10b981" : "#34d399"),
      side: (u, v, r) => (u === 0 || u === 7 || v === 0 || v === 7 ? "#059669" : r > 0.5 ? "#10b981" : "#34d399"),
    },
    diamond: {
      top: (u, v, r) => (u === 0 || u === 7 || v === 0 || v === 7 ? "#0284c7" : u >= 2 && u <= 5 && v >= 2 && v <= 5 ? "#bae6fd" : r > 0.5 ? "#38bdf8" : "#0ea5e9"),
      side: (u, v, r) => (u === 0 || u === 7 || v === 0 || v === 7 ? "#0284c7" : r > 0.5 ? "#38bdf8" : "#7dd3fc"),
    },
    beacon: {
      top: (u, v) => (u === 0 || u === 7 || v === 0 || v === 7 ? "#0284c7" : "#e0f2fe"),
      side: (u, v) => (v >= 6 ? "#1e1b4b" : u === 0 || u === 7 || v === 0 ? "#0ea5e9" : u >= 2 && u <= 5 && v >= 2 && v <= 4 ? "#fef08a" : "#7dd3fc"),
    },
    glowstone: {
      top: (u, v, r) => (r > 0.72 ? "#fef08a" : r > 0.4 ? "#f59e0b" : r > 0.18 ? "#d97706" : "#78350f"),
      side: (u, v, r) => (r > 0.72 ? "#fef08a" : r > 0.4 ? "#f59e0b" : r > 0.18 ? "#d97706" : "#78350f"),
    },
    redstone_lamp: {
      top: (u, v) => (u === 0 || u === 7 || v === 0 || v === 7 || u === v ? "#451a03" : u >= 2 && u <= 5 && v >= 2 && v <= 5 ? "#fde047" : "#f97316"),
      side: (u, v) => (u === 0 || u === 7 || v === 0 || v === 7 ? "#451a03" : u >= 2 && u <= 5 && v >= 2 && v <= 5 ? "#fef08a" : "#ea580c"),
    },
    amethyst: {
      top: (u, v, r) => (r > 0.7 ? "#e9d5ff" : r > 0.35 ? "#a855f7" : "#7e22ce"),
      side: (u, v, r) => (r > 0.7 ? "#d8b4fe" : r > 0.35 ? "#9333ea" : "#6b21a8"),
    },
    crafting: {
      top: (u, v) => (u === 0 || u === 7 || v === 0 || v === 7 ? "#78350f" : u % 2 === 0 || v % 2 === 0 ? "#b45309" : "#d97706"),
      side: (u, v, r) => (v < 2 ? "#78350f" : (u === 2 || u === 5) && v > 2 ? "#475569" : r > 0.5 ? "#b45309" : "#92400e"),
    },
    command: {
      top: (u, v) => (u === 0 || u === 7 || v === 0 || v === 7 ? "#475569" : u >= 3 && u <= 4 && v >= 3 && v <= 4 ? "#38bdf8" : "#c27849"),
      side: (u, v) => (u === 0 || u === 7 || v === 0 || v === 7 ? "#334155" : u >= 2 && u <= 5 && v >= 2 && v <= 5 ? ((u + v) % 2 === 0 ? "#34d399" : "#fbbf24") : "#a3623a"),
    },
    chest: {
      top: (u, v) => (u === 0 || u === 7 || v === 0 || v === 7 ? "#451a03" : "#d97706"),
      side: (u, v) => (v === 3 ? "#1e293b" : u >= 3 && u <= 4 && v >= 2 && v <= 4 ? "#facc15" : u === 0 || u === 7 || v === 0 || v === 7 ? "#78350f" : "#b45309"),
    },
  };

  const BLOCK_KEYS = Object.keys(BLOCK_DEFS);
  const blockSprites = {};

  function buildIsometricBlockSprite(key) {
    const def = BLOCK_DEFS[key] || BLOCK_DEFS.grass;
    const size = 72;
    const off = document.createElement("canvas");
    off.width = size;
    off.height = size;
    const c = off.getContext("2d");

    const N = 8;
    const stepX = 3.2;
    const stepY = 1.6;
    const stepZ = 3.3;
    const cx = size / 2;
    const cy = 11;

    const iso = (u, v, w) => ({
      x: cx + (u - v) * stepX,
      y: cy + (u + v) * stepY + w * stepZ,
    });

    const fillQuad = (p0, p1, p2, p3, color) => {
      c.fillStyle = color;
      c.beginPath();
      c.moveTo(p0.x, p0.y);
      c.lineTo(p1.x, p1.y);
      c.lineTo(p2.x, p2.y);
      c.lineTo(p3.x, p3.y);
      c.closePath();
      c.fill();
    };

    for (let u = 0; u < N; u++) {
      for (let v = 0; v < N; v++) {
        const r = pHash(u, v, 1);
        const col = shadeHex(def.top(u, v, r), 1.05);
        fillQuad(iso(u, v, 0), iso(u + 1, v, 0), iso(u + 1, v + 1, 0), iso(u, v + 1, 0), col);
      }
    }

    for (let v = 0; v < N; v++) {
      for (let w = 0; w < N; w++) {
        const r = pHash(v, w, 2);
        const col = shadeHex(def.side(v, w, r), 0.80);
        fillQuad(iso(N, v, w), iso(N, v + 1, w), iso(N, v + 1, w + 1), iso(N, v, w + 1), col);
      }
    }

    for (let u = 0; u < N; u++) {
      for (let w = 0; w < N; w++) {
        const r = pHash(u, w, 3);
        const col = shadeHex(def.side(u, w, r), 0.60);
        fillQuad(iso(u, N, w), iso(u + 1, N, w), iso(u + 1, N, w + 1), iso(u, N, w + 1), col);
      }
    }

    const pTop = iso(0, 0, 0);
    const pRight = iso(N, 0, 0);
    const pCenter = iso(N, N, 0);
    const pLeft = iso(0, N, 0);
    const pBotRight = iso(N, 0, N);
    const pBotCenter = iso(N, N, N);
    const pBotLeft = iso(0, N, N);

    c.strokeStyle = "rgba(2, 6, 23, 0.82)";
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(pTop.x, pTop.y);
    c.lineTo(pRight.x, pRight.y);
    c.lineTo(pBotRight.x, pBotRight.y);
    c.lineTo(pBotCenter.x, pBotCenter.y);
    c.lineTo(pBotLeft.x, pBotLeft.y);
    c.lineTo(pLeft.x, pLeft.y);
    c.closePath();
    c.stroke();

    c.strokeStyle = "rgba(255, 255, 255, 0.35)";
    c.lineWidth = 1.1;
    c.beginPath();
    c.moveTo(pLeft.x, pLeft.y);
    c.lineTo(pCenter.x, pCenter.y);
    c.lineTo(pRight.x, pRight.y);
    c.moveTo(pCenter.x, pCenter.y);
    c.lineTo(pBotCenter.x, pBotCenter.y);
    c.stroke();

    return off;
  }

  for (const k of BLOCK_KEYS) {
    blockSprites[k] = buildIsometricBlockSprite(k);
  }

  // =========================================================================
  // 2. PRE-RENDERED PIXEL-ART MINECRAFT WILDFLOWER SPRITES (6 VARIETIES)
  // =========================================================================
  const FLOWER_PALETTES = [
    { outer: "#ef4444", inner: "#dc2626", core: "#fde047" }, // Poppy Red
    { outer: "#fde047", inner: "#f59e0b", core: "#78350f" }, // Dandelion Gold
    { outer: "#38bdf8", inner: "#0284c7", core: "#fef08a" }, // Blue Orchid
    { outer: "#c084fc", inner: "#9333ea", core: "#fdf4ff" }, // Allium Lavender
    { outer: "#f472b6", inner: "#db2777", core: "#fef08a" }, // Sakura Pink
    { outer: "#f8fafc", inner: "#cbd5e1", core: "#facc15" }, // Oxeye Daisy
  ];

  const flowerSprites = FLOWER_PALETTES.map((pal) => {
    const off = document.createElement("canvas");
    off.width = 36;
    off.height = 36;
    const c = off.getContext("2d");
    const p = 3; // size of 1 pixel block

    // Pixel stem & leaves
    c.fillStyle = "#15803d";
    c.fillRect(5 * p, 7 * p, 2 * p, 4 * p);
    c.fillStyle = "#22c55e";
    c.fillRect(3 * p, 8 * p, 2 * p, p);
    c.fillRect(7 * p, 9 * p, 2 * p, p);

    // Outer petals (pixel cross + diagonals)
    c.fillStyle = pal.outer;
    c.fillRect(4 * p, 1 * p, 4 * p, 2 * p);
    c.fillRect(4 * p, 7 * p, 4 * p, 2 * p);
    c.fillRect(1 * p, 4 * p, 2 * p, 4 * p);
    c.fillRect(9 * p, 4 * p, 2 * p, 4 * p);
    c.fillRect(2 * p, 2 * p, 2 * p, 2 * p);
    c.fillRect(8 * p, 2 * p, 2 * p, 2 * p);
    c.fillRect(2 * p, 6 * p, 2 * p, 2 * p);
    c.fillRect(8 * p, 6 * p, 2 * p, 2 * p);

    // Inner ring
    c.fillStyle = pal.inner;
    c.fillRect(3 * p, 3 * p, 6 * p, 4 * p);

    // Flower center
    c.fillStyle = pal.core;
    c.fillRect(4.5 * p, 4 * p, 3 * p, 2 * p);

    return off;
  });

  const CORE_CONCEPTS = [
    { label: "GraphRAG", cluster: 0, hub: true, block: "enchant" },
    { label: "LightRAG", cluster: 0, hub: true, block: "emerald" },
    { label: "P2q Filter", cluster: 0, hub: true, block: "bookshelf" },
    { label: "P4 Provenance", cluster: 0, hub: true, block: "amethyst" },
    { label: "ACIIDS '27", cluster: 0, hub: true, block: "emerald" },
    { label: "FAISS · TransNet", cluster: 0, hub: false, block: "bookshelf" },
    { label: "PII Privacy", cluster: 0, hub: false, block: "amethyst" },

    { label: "Kubernetes", cluster: 1, hub: true, block: "beacon" },
    { label: "ArgoCD GitOps", cluster: 1, hub: true, block: "diamond" },
    { label: "Helm Chart", cluster: 1, hub: true, block: "crafting" },
    { label: "Go 1.24 API", cluster: 1, hub: true, block: "command" },
    { label: "Prometheus · EFK", cluster: 1, hub: false, block: "beacon" },
    { label: "AWS · GCP", cluster: 1, hub: false, block: "diamond" },
    { label: "AquaSafe GIS", cluster: 1, hub: false, block: "grass" },

    { label: "EgressGap", cluster: 2, hub: true, block: "redstone_lamp" },
    { label: "IEEE ICC '27", cluster: 2, hub: true, block: "glowstone" },
    { label: "GitHub Actions", cluster: 2, hub: true, block: "command" },
    { label: "Egress Allowlist", cluster: 2, hub: true, block: "chest" },
    { label: "Harden-Runner", cluster: 2, hub: false, block: "redstone_lamp" },
    { label: "SNI Co-Tenancy", cluster: 2, hub: false, block: "glowstone" },
    { label: "CCU Taiwan Lab", cluster: 2, hub: false, block: "bookshelf" },
  ];

  let width = window.innerWidth;
  let height = window.innerHeight;
  let dpr = Math.min(window.devicePixelRatio || 1, 1.75);

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (fxCanvas && fxCtx) {
      fxCanvas.width = Math.floor(width * dpr);
      fxCanvas.height = Math.floor(height * dpr);
      fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  const NODE_COUNT = 26;
  const nodes = [];
  const fireflies = [];
  const fallingLeaves = [];
  const chimneySmoke = [];
  const wheelSplashes = [];
  const waterSparkles = [];

  const LANTERN_SPOTS = [
    { u: 0.149, v: 0.625, r: 28, phase: 0.2 },
    { u: 0.217, v: 0.627, r: 28, phase: 1.5 },
    { u: 0.223, v: 0.592, r: 24, phase: 2.8 },
    { u: 0.296, v: 0.572, r: 34, phase: 0.9 },
    { u: 0.365, v: 0.565, r: 30, phase: 2.1 },
  ];

  function initEntities() {
    nodes.length = 0;
    for (let i = 0; i < NODE_COUNT; i++) {
      const concept = i < CORE_CONCEPTS.length ? CORE_CONCEPTS[i] : null;
      const cluster = concept ? concept.cluster : i % 3;
      const isHub = concept ? concept.hub : false;
      const block = concept ? concept.block : BLOCK_KEYS[i % BLOCK_KEYS.length];
      const z = isHub ? 0.88 + (i % 3) * 0.14 : 0.52 + (i % 4) * 0.11;
      const gx = ((i * 0.61803398875) % 1) * 0.88 + 0.06;
      const gy = ((i * 0.38196601125 + (i / NODE_COUNT) * 0.5) % 1) * 1.15 - 0.05;

      nodes.push({
        id: i,
        label: concept ? concept.label : "",
        cluster,
        isHub,
        block,
        z,
        x: gx * width,
        y: gy * height,
        vx: (Math.cos(i * 2.3) * 0.18 + (i % 2 === 0 ? 0.06 : -0.06)) * z,
        vy: (Math.sin(i * 1.7) * 0.14 + (i % 3 === 0 ? 0.05 : -0.05)) * z,
        size: isHub ? 32 : concept ? 25 : 20,
        phase: i * 0.9,
        energy: 0,
      });
    }

    fireflies.length = 0;
    for (let i = 0; i < 24; i++) {
      fireflies.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -0.18 - Math.random() * 0.25,
        size: 2.2 + (i % 3),
        phase: Math.random() * Math.PI * 2,
      });
    }

    fallingLeaves.length = 0;
    const leafColors = ["#84cc16", "#65a30d", "#f59e0b", "#fb7185", "#fde047"];
    for (let i = 0; i < 18; i++) {
      fallingLeaves.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: 0.45 + Math.random() * 0.55,
        vy: 0.35 + Math.random() * 0.45,
        size: 3 + (i % 3),
        color: leafColors[i % leafColors.length],
        phase: Math.random() * Math.PI * 2,
      });
    }

    chimneySmoke.length = 0;
    for (let i = 0; i < 14; i++) {
      chimneySmoke.push({
        age: i / 14,
        seed: i * 1.37,
      });
    }

    wheelSplashes.length = 0;
    for (let i = 0; i < 16; i++) {
      wheelSplashes.push({
        age: i / 16,
        offsetX: (Math.random() - 0.5) * 0.032,
        speed: 0.6 + Math.random() * 0.5,
      });
    }

    waterSparkles.length = 0;
    for (let i = 0; i < 32; i++) {
      const v = 0.58 + Math.random() * 0.40;
      const riverCenterU = 0.61 - (v - 0.58) * 0.16;
      const halfWidthU = 0.06 + (v - 0.58) * 0.36;
      waterSparkles.push({
        u: riverCenterU + (Math.random() - 0.5) * 2 * halfWidthU,
        v,
        w: 8 + Math.random() * 18,
        phase: Math.random() * Math.PI * 2,
        speed: 2.2 + Math.random() * 2.5,
      });
    }
  }

  resize();
  initEntities();

  window.addEventListener("resize", () => {
    const oldW = width || 1;
    const oldH = height || 1;
    resize();
    for (const n of nodes) {
      n.x = (n.x / oldW) * width;
      n.y = (n.y / oldH) * height;
    }
  });

  // =========================================================================
  // 3. FRAME HOVER "VOXEL BLOCK & WILDFLOWER BLOOM" ENGINE (#fx-canvas)
  // =========================================================================
  const bloomParticles = []; // Bursting blocks, blooming flowers & pixel petals
  const frameGarden = [];    // Persistent flowers & mini-blocks growing along hovered card border
  let hoveredEl = null;
  let hoverProgress = 0;

  const HOVER_SELECTOR = ".card, .academic-row, .media-card, .cv-item, .portrait-frame, .s-link, .frosted-section";

  // Elastic spring ease-out curve for flower/block blooming (0 -> 1.24 -> 1.0)
  function easeOutBack(x) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  }

  function spawnBloomBurst(x, y, count = 8) {
    if (noMotion) return;
    for (let i = 0; i < count; i++) {
      const isBlock = i % 2 === 0;
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 1.1 + Math.random() * 2.4;
      bloomParticles.push({
        kind: isBlock ? "block" : "flower",
        sprite: isBlock
          ? blockSprites[BLOCK_KEYS[Math.floor(Math.random() * BLOCK_KEYS.length)]]
          : flowerSprites[Math.floor(Math.random() * flowerSprites.length)],
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.2,
        size: isBlock ? 17 + Math.random() * 8 : 16 + Math.random() * 8,
        age: 0,
        life: 0.75 + Math.random() * 0.45,
        rot: (Math.random() - 0.5) * 0.4,
        vRot: (Math.random() - 0.5) * 1.6,
      });
    }
    if (bloomParticles.length > 90) {
      bloomParticles.splice(0, bloomParticles.length - 90);
    }
  }

  function buildFrameGardenFor(el) {
    frameGarden.length = 0;
    if (!el) return;
    const isLargeSection = el.classList.contains("frosted-section");
    const count = isLargeSection ? 12 : 8;
    for (let i = 0; i < count; i++) {
      const isBlock = i % 2 === 1;
      // Place along top edge (60%) and left/right upper corners (40%)
      const edge = i < Math.ceil(count * 0.65) ? "top" : i % 2 === 0 ? "left" : "right";
      const t = edge === "top" ? (i + 0.6) / Math.ceil(count * 0.65) : 0.18 + ((i * 0.37) % 0.65);
      frameGarden.push({
        edge,
        t: Math.min(0.94, Math.max(0.06, t)),
        kind: isBlock ? "block" : "flower",
        sprite: isBlock
          ? blockSprites[BLOCK_KEYS[(i * 3) % BLOCK_KEYS.length]]
          : flowerSprites[i % flowerSprites.length],
        size: isBlock ? 21 : 20,
        delay: i * 0.045,
        phase: i * 1.3,
      });
    }
  }

  document.addEventListener(
    "pointerover",
    (e) => {
      if (noMotion || document.body.classList.contains("scenic-mode")) return;
      const target = e.target.closest?.(HOVER_SELECTOR);
      if (!target || target === hoveredEl) return;

      hoveredEl = target;
      hoverProgress = 0;
      buildFrameGardenFor(target);

      const rect = target.getBoundingClientRect();
      // Spawn sprout burst at cursor entry point (or card corner)
      const bx = e.clientX > 0 ? e.clientX : rect.left + rect.width * 0.5;
      const by = e.clientY > 0 ? e.clientY : rect.top;
      spawnBloomBurst(bx, by, target.classList.contains("frosted-section") ? 7 : 10);

      // Also pop 2 corner blooms on the card
      spawnBloomBurst(rect.left + 14, rect.top + 8, 3);
      spawnBloomBurst(rect.right - 14, rect.top + 8, 3);
    },
    { passive: true }
  );

  document.addEventListener(
    "pointerout",
    (e) => {
      if (!hoveredEl) return;
      const next = e.relatedTarget?.closest?.(HOVER_SELECTOR);
      if (next !== hoveredEl) {
        hoveredEl = next || null;
        if (hoveredEl) {
          hoverProgress = 0;
          buildFrameGardenFor(hoveredEl);
        }
      }
    },
    { passive: true }
  );

  function renderFrameBloomFX(dt, t) {
    if (!fxCtx) return;
    fxCtx.clearRect(0, 0, width, height);
    if (document.body.classList.contains("scenic-mode")) return;

    // 1. Render Active Hovered Frame's Blooming Border Garden (Flowers & Mini-Blocks)
    if (hoveredEl && document.body.contains(hoveredEl)) {
      hoverProgress = Math.min(1, hoverProgress + dt * 2.8);
      const rect = hoveredEl.getBoundingClientRect();

      if (rect.bottom > 0 && rect.top < height) {
        // Subtle glowing voxel highlight trace gliding along top border
        const traceW = Math.min(140, rect.width * 0.35);
        const traceX = rect.left + ((t * 180) % Math.max(1, rect.width - traceW));
        const grad = fxCtx.createLinearGradient(traceX, rect.top, traceX + traceW, rect.top);
        grad.addColorStop(0, "rgba(52, 211, 153, 0)");
        grad.addColorStop(0.5, "rgba(110, 231, 183, 0.75)");
        grad.addColorStop(1, "rgba(56, 189, 248, 0)");
        fxCtx.fillStyle = grad;
        fxCtx.fillRect(traceX, rect.top - 1.5, traceW, 3);

        // Sprout & bob the anchored wildflowers & isometric blocks along the frame edge
        for (const item of frameGarden) {
          const localP = Math.max(0, Math.min(1, (hoverProgress - item.delay) / 0.55));
          if (localP <= 0) continue;
          const bloomScale = easeOutBack(localP);

          let gx = rect.left;
          let gy = rect.top;
          if (item.edge === "top") {
            gx = rect.left + rect.width * item.t;
            gy = rect.top - 4;
          } else if (item.edge === "left") {
            gx = rect.left - 4;
            gy = rect.top + rect.height * item.t;
          } else {
            gx = rect.right + 4;
            gy = rect.top + rect.height * item.t;
          }

          const bob = Math.sin(t * 3.4 + item.phase) * 2.5;
          const sway = Math.cos(t * 2.6 + item.phase) * 0.14;
          const sz = item.size * bloomScale;

          fxCtx.save();
          fxCtx.translate(gx, gy + bob);
          fxCtx.rotate(sway);
          fxCtx.drawImage(item.sprite, -sz * 0.5, -sz * 0.5, sz, sz);
          fxCtx.restore();
        }
      }
    }

    // 2. Render Bursting Voxel Blocks & Blooming Wildflowers
    for (let i = bloomParticles.length - 1; i >= 0; i--) {
      const bp = bloomParticles[i];
      bp.age += dt;
      if (bp.age >= bp.life) {
        bloomParticles.splice(i, 1);
        continue;
      }

      const prog = bp.age / bp.life;
      bp.x += bp.vx * (dt * 60);
      bp.y += bp.vy * (dt * 60);
      bp.vy += 0.055 * (dt * 60); // gentle float-arc gravity
      bp.rot += bp.vRot * dt;

      // Elastic bloom open in first 35%, hold, then fade smoothly
      const popScale = prog < 0.35 ? easeOutBack(prog / 0.35) : 1 - (prog - 0.35) * 0.45;
      const alpha = prog > 0.65 ? Math.max(0, 1 - (prog - 0.65) / 0.35) : 1;
      const sz = bp.size * Math.max(0.1, popScale);

      fxCtx.save();
      fxCtx.globalAlpha = alpha;
      fxCtx.translate(bp.x, bp.y);
      fxCtx.rotate(bp.rot);
      fxCtx.drawImage(bp.sprite, -sz * 0.5, -sz * 0.5, sz, sz);

      // Tiny golden pixel pollen / enchantment spark next to blooming item
      if (prog < 0.6) {
        fxCtx.fillStyle = "#fef08a";
        fxCtx.fillRect(sz * 0.45, -sz * 0.45, 2.5, 2.5);
      }
      fxCtx.restore();
    }
  }

  // ----- Knowledge Graph Data Packets -----
  const packets = [];
  const MAX_PACKETS = 14;

  function spawnPacket(a, b) {
    if (packets.length >= MAX_PACKETS) return;
    packets.push({
      from: a,
      to: b,
      t: 0,
      speed: 0.008 + Math.random() * 0.010,
      cluster: a.cluster,
    });
  }

  const pointer = { x: width * 0.5, y: height * 0.5, active: false };
  const ripples = [];

  window.addEventListener(
    "pointermove",
    (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = true;
    },
    { passive: true }
  );

  window.addEventListener(
    "pointerleave",
    () => {
      pointer.active = false;
    },
    { passive: true }
  );

  window.addEventListener(
    "pointerdown",
    (e) => {
      ripples.push({
        x: e.clientX,
        y: e.clientY,
        r: 8,
        maxR: Math.min(width, height) * 0.45,
        alpha: 0.65,
      });
      if (ripples.length > 4) ripples.shift();
      spawnBloomBurst(e.clientX, e.clientY, 10);
    },
    { passive: true }
  );

  let targetScrollY = window.scrollY || 0;
  let smoothScrollY = targetScrollY;
  window.addEventListener(
    "scroll",
    () => {
      targetScrollY = window.scrollY || 0;
    },
    { passive: true }
  );

  // =========================================================================
  // 4. LIVING 3D MINECRAFT SHADER WORLD (RIVER REFRACTION, SMOKE, SPLASH)
  // =========================================================================
  function drawAnimatedMinecraftWorld(theme, t, dt, scrollOffset) {
    const media = bgVideoReady ? bgVideo : bgImgLoaded ? bgImg : null;
    const mediaW = bgVideoReady ? bgVideo.videoWidth || 1920 : bgImg.naturalWidth || 1920;
    const mediaH = bgVideoReady ? bgVideo.videoHeight || 1080 : bgImg.naturalHeight || 1080;

    if (media) {
      const zoom = 1.11 + Math.sin(t * 0.28) * 0.022;
      const coverScale = Math.max(width / mediaW, height / mediaH) * zoom;
      const drawW = mediaW * coverScale;
      const drawH = mediaH * coverScale;

      const maxPanX = (drawW - width) * 0.5;
      const maxPanY = (drawH - height) * 0.5;

      const autoPanX = Math.sin(t * 0.22) * Math.min(22, maxPanX * 0.45);
      const autoPanY = Math.cos(t * 0.17) * Math.min(12, maxPanY * 0.30);

      const mouseNormX = pointer.active ? (pointer.x / Math.max(1, width) - 0.5) * 2 : 0;
      const mouseNormY = pointer.active ? (pointer.y / Math.max(1, height) - 0.5) * 2 : 0;
      const scrollNorm = Math.min(1, Math.max(-1, (scrollOffset % 2400) / 1200 - 0.5));

      const panX = autoPanX - mouseNormX * Math.min(26, maxPanX * 0.55);
      const panY = autoPanY - scrollNorm * Math.min(44, maxPanY * 0.72) - mouseNormY * Math.min(14, maxPanY * 0.25);

      const dx = (width - drawW) * 0.5 + panX;
      const dy = (height - drawH) * 0.5 + panY;

      ctx.drawImage(media, dx, dy, drawW, drawH);

      // Real-time River Water Refraction
      if (!noMotion && !bgVideoReady) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(dx + 0.57 * drawW, dy + 0.575 * drawH);
        ctx.lineTo(dx + 0.68 * drawW, dy + 0.575 * drawH);
        ctx.lineTo(dx + 0.73 * drawW, dy + 0.76 * drawH);
        ctx.lineTo(dx + 0.78 * drawW, dy + 1.0 * drawH);
        ctx.lineTo(dx + 0.31 * drawW, dy + 1.0 * drawH);
        ctx.lineTo(dx + 0.40 * drawW, dy + 0.73 * drawH);
        ctx.lineTo(dx + 0.53 * drawW, dy + 0.63 * drawH);
        ctx.closePath();
        ctx.clip();

        const STRIPS = 34;
        const vStart = 0.575;
        const vEnd = 1.0;
        const vStep = (vEnd - vStart) / STRIPS;

        for (let i = 0; i < STRIPS; i++) {
          const v0 = vStart + i * vStep;
          const depthFactor = (v0 - vStart) / (vEnd - vStart);
          const waveX = Math.sin(t * 3.6 - i * 0.58) * (1.8 + depthFactor * 5.2);
          const waveY = Math.cos(t * 2.8 - i * 0.45) * (0.4 + depthFactor * 1.4);

          const sy = v0 * mediaH;
          const sh = Math.ceil(vStep * mediaH) + 2;
          const targetY = dy + v0 * drawH;
          const targetH = Math.ceil(vStep * drawH) + 2;

          ctx.drawImage(media, 0, sy, mediaW, sh, dx + waveX, targetY + waveY, drawW, targetH);
        }
        ctx.restore();
      }

      // Waterwheel Foam Splash
      const wheelX = dx + 0.402 * drawW;
      const wheelBaseY = dy + 0.728 * drawH;
      for (const sp of wheelSplashes) {
        if (!noMotion) {
          sp.age = (sp.age + dt * sp.speed) % 1;
        }
        const sx = wheelX + sp.offsetX * drawW + Math.sin(t * 4 + sp.age * 6) * 5;
        const sy = wheelBaseY - Math.sin(sp.age * Math.PI) * 11 + sp.age * 8;
        const alpha = (1 - sp.age) * 0.75;
        const sz = 2.5 + (1 - sp.age) * 3;
        ctx.fillStyle = `rgba(240, 249, 255, ${alpha.toFixed(3)})`;
        ctx.fillRect(sx, sy, sz, sz);
      }

      // Cottage Chimney Smoke Puffs
      const chimX = dx + 0.300 * drawW;
      const chimY = dy + 0.332 * drawH;
      for (const sm of chimneySmoke) {
        if (!noMotion) {
          sm.age = (sm.age + dt * 0.22) % 1;
        }
        const rise = sm.age * 78;
        const sway = Math.sin(t * 1.4 + sm.seed + sm.age * 4.5) * (6 + sm.age * 18) + sm.age * 14;
        const sz = 6 + sm.age * 16;
        const alpha = Math.sin(sm.age * Math.PI) * 0.34;
        ctx.fillStyle = `rgba(241, 245, 249, ${alpha.toFixed(3)})`;
        ctx.fillRect(chimX + sway - sz * 0.5, chimY - rise - sz * 0.5, sz, sz);
      }

      // Warm Flickering Lanterns & Windows
      for (const lt of LANTERN_SPOTS) {
        const lx = dx + lt.u * drawW;
        const ly = dy + lt.v * drawH;
        const flicker = 0.75 + Math.sin(t * 6.5 + lt.phase) * 0.15 + Math.cos(t * 11.2 + lt.phase) * 0.10;
        const rad = lt.r * (0.9 + flicker * 0.25);
        const lGrad = ctx.createRadialGradient(lx, ly, 2, lx, ly, rad);
        lGrad.addColorStop(0, `rgba(${theme.lanternGlow}, ${(0.42 * flicker).toFixed(3)})`);
        lGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = lGrad;
        ctx.beginPath();
        ctx.arc(lx, ly, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      // Flowing River Sun Glints
      ctx.fillStyle = theme.waterGlint;
      for (const sp of waterSparkles) {
        if (!noMotion) {
          sp.v += dt * 0.022;
          if (sp.v > 0.98) {
            sp.v = 0.58;
          }
        }
        const pulse = Math.sin(t * sp.speed + sp.phase);
        if (pulse > 0.05) {
          const sx = dx + sp.u * drawW + Math.sin(t * 2.5 + sp.phase) * 8;
          const sy = dy + sp.v * drawH;
          const sw = sp.w * pulse;
          ctx.fillRect(sx - sw * 0.5, sy, sw, 2.2);
        }
      }
    } else {
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, "#0c192c");
      bgGrad.addColorStop(1, "#112233");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);
    }

    const tintGrad = ctx.createLinearGradient(0, 0, 0, height);
    tintGrad.addColorStop(0, theme.tintTop);
    tintGrad.addColorStop(1, theme.tintBot);
    ctx.fillStyle = tintGrad;
    ctx.fillRect(0, 0, width, height);

    const sunPulse = 0.85 + Math.sin(t * 0.9) * 0.15;
    const sunGrad = ctx.createRadialGradient(
      width * 0.90,
      height * 0.10,
      10,
      width * 0.90,
      height * 0.10,
      Math.max(width, height) * 0.78 * sunPulse
    );
    sunGrad.addColorStop(0, theme.sunbeam);
    sunGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, width, height);

    for (const lf of fallingLeaves) {
      if (!noMotion) {
        lf.x += lf.vx + Math.sin(t * 1.6 + lf.phase) * 0.35;
        lf.y += lf.vy + Math.cos(t * 1.2 + lf.phase) * 0.18;
        if (lf.x > width + 15) lf.x = -15;
        if (lf.y > height + 15) lf.y = -15;
      }
      ctx.fillStyle = lf.color;
      ctx.fillRect(lf.x, lf.y, lf.size, lf.size);
    }

    for (const f of fireflies) {
      if (!noMotion) {
        f.x += f.vx + Math.sin(t * 1.3 + f.phase) * 0.22;
        f.y += f.vy;
        if (f.y < -10) f.y = height + 10;
        if (f.x < -10) f.x = width + 10;
        else if (f.x > width + 10) f.x = -10;
      }
      const glowAlpha = 0.42 + Math.sin(t * 3.0 + f.phase) * 0.35;
      ctx.fillStyle = `rgba(${theme.fireflyRgb}, ${Math.max(0.1, glowAlpha).toFixed(3)})`;
      ctx.fillRect(f.x, f.y, f.size, f.size);
    }
  }

  let paused = false;
  let lastTime = performance.now();

  function renderFrame(now) {
    const dt = Math.min((now - lastTime) * 0.001, 0.05);
    lastTime = now;
    const t = now * 0.001;

    smoothScrollY += (targetScrollY - smoothScrollY) * Math.min(1, dt * 10);
    const theme = THEMES[timeMode];

    // 1. Living 3D Minecraft Shader Background
    drawAnimatedMinecraftWorld(theme, t, dt, smoothScrollY);

    // 2. Update Isometric Minecraft Block Knowledge Graph Nodes
    const linkDist = Math.min(width, height) < 640 ? 145 : 195;
    const linkDistSq = linkDist * linkDist;
    const wrapH = height + 160;

    for (const n of nodes) {
      if (!noMotion) {
        n.x += n.vx * (dt * 60);
        n.y += n.vy * (dt * 60);

        if (n.x < -60) n.x = width + 60;
        else if (n.x > width + 60) n.x = -60;
        if (n.y < -80) n.y += wrapH;
        else if (n.y > height + 80) n.y -= wrapH;
      }

      const bobOffset = Math.sin(t * 2.0 + n.phase) * 3.5;
      const parallaxY = ((n.y - smoothScrollY * (0.18 * n.z)) % wrapH + wrapH) % wrapH - 80 + bobOffset;
      n.sx = n.x;
      n.sy = parallaxY;
      n.energy = Math.max(0, n.energy - dt * 1.4);

      if (pointer.active) {
        const dx = pointer.x - n.sx;
        const dy = pointer.y - n.sy;
        const dSq = dx * dx + dy * dy;
        if (dSq < 44000 && dSq > 4) {
          const d = Math.sqrt(dSq);
          const pull = (1 - d / 210) * 0.35;
          n.sx += (dx / d) * pull * 14;
          n.sy += (dy / d) * pull * 14;
          n.energy = Math.max(n.energy, 1 - d / 210);
        }
      }
    }

    // 3. Click Ripples
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.r += dt * 360;
      rp.alpha = Math.max(0, 0.65 * (1 - rp.r / rp.maxR));

      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${theme.cursorRgb}, ${rp.alpha.toFixed(3)})`;
      ctx.lineWidth = 1.6;
      ctx.stroke();

      for (const n of nodes) {
        const d = Math.hypot(n.sx - rp.x, n.sy - rp.y);
        if (Math.abs(d - rp.r) < 30) {
          n.energy = 1;
        }
      }

      if (rp.r >= rp.maxR) ripples.splice(i, 1);
    }

    // 4. Graph Edges
    ctx.lineWidth = 1.15;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.sx - b.sx;
        const dy = a.sy - b.sy;
        const dSq = dx * dx + dy * dy;
        if (dSq < linkDistSq) {
          const d = Math.sqrt(dSq);
          const ratio = 1 - d / linkDist;
          const sameCluster = a.cluster === b.cluster;
          const boost = Math.max(a.energy, b.energy) * 0.35;
          const alpha = Math.min(0.60, ratio * (sameCluster ? 0.36 : 0.18) + boost);

          const rgb = sameCluster ? theme.clusters[a.cluster].rgb : theme.edgeRgb;
          ctx.strokeStyle = `rgba(${rgb}, ${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a.sx, a.sy);
          ctx.lineTo(b.sx, b.sy);
          ctx.stroke();

          if (!noMotion && Math.random() < 0.0018 && (a.isHub || b.isHub)) {
            spawnPacket(a, b);
          }
        }
      }
    }

    // 5. Pointer Links
    if (pointer.active) {
      for (const n of nodes) {
        const d = Math.hypot(pointer.x - n.sx, pointer.y - n.sy);
        if (d < 185) {
          const alpha = (1 - d / 185) * 0.45;
          ctx.strokeStyle = `rgba(${theme.cursorRgb}, ${alpha.toFixed(3)})`;
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          ctx.moveTo(pointer.x, pointer.y);
          ctx.lineTo(n.sx, n.sy);
          ctx.stroke();
        }
      }
    }

    // 6. XP Orb / Redstone Packets along Edges
    for (let i = packets.length - 1; i >= 0; i--) {
      const pk = packets[i];
      pk.t += pk.speed * (dt * 60);
      if (pk.t >= 1) {
        pk.to.energy = Math.min(1, pk.to.energy + 0.6);
        packets.splice(i, 1);
        continue;
      }
      const px = pk.from.sx + (pk.to.sx - pk.from.sx) * pk.t;
      const py = pk.from.sy + (pk.to.sy - pk.from.sy) * pk.t;
      const cRgb = theme.clusters[pk.cluster].rgb;

      ctx.fillStyle = `rgba(${cRgb}, 0.28)`;
      ctx.fillRect(px - 5, py - 5, 10, 10);
      ctx.fillStyle = `rgba(${cRgb}, 0.98)`;
      ctx.fillRect(px - 2.5, py - 2.5, 5, 5);
    }

    // 7. Isometric Minecraft Blocks + Concept Labels
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.textBaseline = "middle";

    for (const n of nodes) {
      const c = theme.clusters[n.cluster];
      const scale = 1 + n.energy * 0.24;
      const drawSize = n.size * scale;

      if (n.isHub || n.energy > 0.12) {
        const haloR = drawSize * 0.72;
        const haloAlpha = n.isHub ? 0.22 + n.energy * 0.24 : n.energy * 0.28;
        ctx.beginPath();
        ctx.arc(n.sx, n.sy, haloR, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${c.rgb}, ${haloAlpha.toFixed(3)})`;
        ctx.fill();
      }

      const sprite = blockSprites[n.block] || blockSprites.grass;
      ctx.drawImage(sprite, n.sx - drawSize * 0.5, n.sy - drawSize * 0.5, drawSize, drawSize);

      if (n.energy > 0.25) {
        const spX = n.sx + Math.cos(t * 5 + n.phase) * (drawSize * 0.58);
        const spY = n.sy + Math.sin(t * 6 + n.phase) * (drawSize * 0.58);
        ctx.fillStyle = "#fef08a";
        ctx.fillRect(spX - 1.5, spY - 1.5, 3, 3);
      }

      if (n.label && (n.isHub || n.energy > 0.22)) {
        const labelAlpha = n.isHub ? 0.92 : Math.min(0.95, n.energy);
        const tx = n.sx + drawSize * 0.52 + 5;
        const ty = n.sy;
        ctx.fillStyle = `rgba(2, 6, 23, ${(labelAlpha * 0.82).toFixed(3)})`;
        ctx.fillText(n.label, tx + 1.2, ty + 1.2);
        ctx.fillStyle = `rgba(255, 255, 255, ${labelAlpha.toFixed(3)})`;
        ctx.fillText(n.label, tx, ty);
      }
    }

    // 8. Foreground Frame Hover Bloom FX (Voxel Flowers & Isometric Blocks)
    renderFrameBloomFX(dt, t);
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (paused || document.hidden) {
      lastTime = now;
      return;
    }
    renderFrame(now);
  }

  renderFrame(performance.now());
  if (!noMotion) {
    requestAnimationFrame(loop);
  }

  return {
    setPapers(papers = []) {
      const dynamicTags = [];
      for (const p of papers) {
        for (const tag of p.tags || []) {
          if (!dynamicTags.includes(tag)) dynamicTags.push(tag);
        }
      }
      let tagIdx = 0;
      for (let i = CORE_CONCEPTS.length; i < nodes.length && tagIdx < dynamicTags.length; i++) {
        nodes[i].label = dynamicTags[tagIdx++];
      }
      if (noMotion) renderFrame(performance.now());
    },
    setPaused(p) {
      paused = !!p;
      if (bgVideoReady && bgVideo) {
        if (paused) bgVideo.pause();
        else bgVideo.play().catch(() => {});
      }
    },
    cycleTimeMode() {
      timeMode = (timeMode + 1) % THEMES.length;
      if (noMotion || paused) renderFrame(performance.now());
      return timeMode;
    },
  };
}
