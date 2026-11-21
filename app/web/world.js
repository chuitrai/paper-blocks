// Cảnh nền Khoa học Tương tác x Minecraft Isometric Blocks (Canvas 2D 60fps):
// Kết hợp Đồ thị Tri thức (Knowledge Graph & Cloud Topology) với các khối Isometric Minecraft
// được pre-render sắc nét trên Offscreen Canvas (0.2ms/frame, mượt 60-120fps trên mọi thiết bị).
//
// Giữ nguyên hợp đồng API: createWorld(canvas) -> { setPapers(list), setPaused(flag), cycleTimeMode() }

export function createWorld(canvas) {
  const noMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!canvas) {
    return { setPapers() {}, setPaused() {}, cycleTimeMode() { return 0; } };
  }

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) {
    return { setPapers() {}, setPaused() {}, cycleTimeMode() { return 0; } };
  }

  // ----- 3 chế độ màu sắc không gian -----
  const THEMES = [
    {
      name: "Research Slate",
      bgTop: "#06101e",
      bgMid: "#0b1a2e",
      bgBot: "#0f233c",
      gridDot: "rgba(148, 163, 184, 0.13)",
      aurora: [
        { color: "rgba(16, 185, 129, 0.13)", yFrac: 0.24, amp: 48, speed: 0.42 },
        { color: "rgba(56, 189, 248, 0.14)", yFrac: 0.52, amp: 62, speed: -0.35 },
        { color: "rgba(99, 102, 241, 0.11)", yFrac: 0.78, amp: 52, speed: 0.28 },
      ],
      clusters: [
        { hex: "#34d399", rgb: "52, 211, 153" },  // Graph RAG & AI (Emerald)
        { hex: "#38bdf8", rgb: "56, 189, 248" },  // Cloud & K8s (Diamond/Beacon)
        { hex: "#fbbf24", rgb: "251, 191, 36" },  // CI/CD Security (Glowstone/Redstone)
      ],
      edgeRgb: "148, 163, 184",
      cursorRgb: "56, 189, 248",
    },
    {
      name: "Twilight Horizon",
      bgTop: "#110d20",
      bgMid: "#1c1430",
      bgBot: "#271a38",
      gridDot: "rgba(216, 180, 254, 0.12)",
      aurora: [
        { color: "rgba(245, 158, 11, 0.14)", yFrac: 0.26, amp: 52, speed: 0.38 },
        { color: "rgba(244, 63, 94, 0.12)", yFrac: 0.54, amp: 58, speed: -0.32 },
        { color: "rgba(168, 85, 247, 0.14)", yFrac: 0.80, amp: 46, speed: 0.30 },
      ],
      clusters: [
        { hex: "#f59e0b", rgb: "245, 158, 11" },
        { hex: "#c084fc", rgb: "192, 132, 252" },
        { hex: "#fb7185", rgb: "251, 113, 133" },
      ],
      edgeRgb: "203, 213, 225",
      cursorRgb: "245, 158, 11",
    },
    {
      name: "Cyber Midnight",
      bgTop: "#030711",
      bgMid: "#060e1d",
      bgBot: "#091528",
      gridDot: "rgba(56, 189, 248, 0.12)",
      aurora: [
        { color: "rgba(34, 211, 238, 0.14)", yFrac: 0.22, amp: 55, speed: 0.45 },
        { color: "rgba(16, 185, 129, 0.13)", yFrac: 0.50, amp: 64, speed: -0.36 },
        { color: "rgba(59, 130, 246, 0.12)", yFrac: 0.78, amp: 50, speed: 0.31 },
      ],
      clusters: [
        { hex: "#22d3ee", rgb: "34, 211, 238" },
        { hex: "#10b981", rgb: "16, 185, 129" },
        { hex: "#818cf8", rgb: "129, 140, 248" },
      ],
      edgeRgb: "100, 116, 139",
      cursorRgb: "34, 211, 238",
    },
  ];

  let timeMode = 0;

  // =========================================================================
  // BỘ TẠO SPRITE KHỐI ISOMETRIC MINECRAFT (PRE-RENDERED PIXEL ART 8x8x8)
  // =========================================================================
  function shadeHex(hex, factor) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * factor)));
    const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * factor)));
    const b = Math.min(255, Math.max(0, Math.round((n & 255) * factor)));
    return `rgb(${r},${g},${b})`;
  }

  // Hàm băm tất định cho pixel noise
  function pHash(x, y, seed) {
    const h = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return h - Math.floor(h);
  }

  // Định nghĩa 12 loại khối Minecraft đặc trưng
  const BLOCK_DEFS = {
    grass: {
      top: (u, v, r) => (r > 0.65 ? "#65a30d" : r < 0.25 ? "#4d7c0f" : "#579211"),
      side: (u, v, r) => (v < 2 || (v === 2 && (u % 2 === 0)) ? "#579211" : r > 0.6 ? "#854d0e" : r < 0.25 ? "#5c3409" : "#713f12"),
    },
    bookshelf: {
      top: (u, v, r) => (r > 0.5 ? "#b45309" : "#92400e"),
      side: (u, v, r) => {
        if (v === 0 || v === 3 || v === 4 || v === 7) return "#92400e";
        const bookColors = ["#dc2626", "#2563eb", "#16a34a", "#d97706", "#9333ea", "#0891b2"];
        return bookColors[(u + v * 3) % bookColors.length];
      },
    },
    enchant: {
      top: (u, v) => ((u === 0 || u === 7 || v === 0 || v === 7) ? "#38bdf8" : (u + v) % 2 === 0 ? "#dc2626" : "#991b1b"),
      side: (u, v, r) => (v < 2 ? "#dc2626" : (u === 1 || u === 6) && v < 5 ? "#38bdf8" : r > 0.5 ? "#1e1b4b" : "#0f172a"),
    },
    emerald: {
      top: (u, v, r) => ((u === 0 || u === 7 || v === 0 || v === 7) ? "#059669" : (u >= 2 && u <= 5 && v >= 2 && v <= 5) ? "#6ee7b7" : r > 0.5 ? "#10b981" : "#34d399"),
      side: (u, v, r) => ((u === 0 || u === 7 || v === 0 || v === 7) ? "#059669" : r > 0.5 ? "#10b981" : "#34d399"),
    },
    diamond: {
      top: (u, v, r) => ((u === 0 || u === 7 || v === 0 || v === 7) ? "#0284c7" : (u >= 2 && u <= 5 && v >= 2 && v <= 5) ? "#bae6fd" : r > 0.5 ? "#38bdf8" : "#0ea5e9"),
      side: (u, v, r) => ((u === 0 || u === 7 || v === 0 || v === 7) ? "#0284c7" : r > 0.5 ? "#38bdf8" : "#7dd3fc"),
    },
    beacon: {
      top: (u, v) => ((u === 0 || u === 7 || v === 0 || v === 7) ? "#0284c7" : "#e0f2fe"),
      side: (u, v) => (v >= 6 ? "#1e1b4b" : (u === 0 || u === 7 || v === 0) ? "#0ea5e9" : (u >= 2 && u <= 5 && v >= 2 && v <= 4) ? "#fef08a" : "#7dd3fc"),
    },
    glowstone: {
      top: (u, v, r) => (r > 0.72 ? "#fef08a" : r > 0.4 ? "#f59e0b" : r > 0.18 ? "#d97706" : "#78350f"),
      side: (u, v, r) => (r > 0.72 ? "#fef08a" : r > 0.4 ? "#f59e0b" : r > 0.18 ? "#d97706" : "#78350f"),
    },
    redstone_lamp: {
      top: (u, v) => ((u === 0 || u === 7 || v === 0 || v === 7 || u === v) ? "#451a03" : (u >= 2 && u <= 5 && v >= 2 && v <= 5) ? "#fde047" : "#f97316"),
      side: (u, v) => ((u === 0 || u === 7 || v === 0 || v === 7) ? "#451a03" : (u >= 2 && u <= 5 && v >= 2 && v <= 5) ? "#fef08a" : "#ea580c"),
    },
    amethyst: {
      top: (u, v, r) => (r > 0.7 ? "#e9d5ff" : r > 0.35 ? "#a855f7" : "#7e22ce"),
      side: (u, v, r) => (r > 0.7 ? "#d8b4fe" : r > 0.35 ? "#9333ea" : "#6b21a8"),
    },
    crafting: {
      top: (u, v) => ((u === 0 || u === 7 || v === 0 || v === 7) ? "#78350f" : (u % 2 === 0 || v % 2 === 0) ? "#b45309" : "#d97706"),
      side: (u, v, r) => (v < 2 ? "#78350f" : (u === 2 || u === 5) && v > 2 ? "#475569" : r > 0.5 ? "#b45309" : "#92400e"),
    },
    command: {
      top: (u, v) => ((u === 0 || u === 7 || v === 0 || v === 7) ? "#475569" : (u >= 3 && u <= 4 && v >= 3 && v <= 4) ? "#38bdf8" : "#c27849"),
      side: (u, v) => ((u === 0 || u === 7 || v === 0 || v === 7) ? "#334155" : (u >= 2 && u <= 5 && v >= 2 && v <= 5) ? ((u + v) % 2 === 0 ? "#34d399" : "#fbbf24") : "#a3623a"),
    },
    chest: {
      top: (u, v) => ((u === 0 || u === 7 || v === 0 || v === 7) ? "#451a03" : "#d97706"),
      side: (u, v) => (v === 3 ? "#1e293b" : (u >= 3 && u <= 4 && v >= 2 && v <= 4) ? "#facc15" : (u === 0 || u === 7 || v === 0 || v === 7) ? "#78350f" : "#b45309"),
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
    const stepX = 3.2;   // bề ngang nửa viên gạch isometric
    const stepY = 1.6;   // độ dốc nửa viên gạch isometric
    const stepZ = 3.3;   // chiều cao 1 tầng pixel
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

    // 1. Mặt Trên (Top Face: w = 0)
    for (let u = 0; u < N; u++) {
      for (let v = 0; v < N; v++) {
        const r = pHash(u, v, 1);
        const col = shadeHex(def.top(u, v, r), 1.05);
        fillQuad(iso(u, v, 0), iso(u + 1, v, 0), iso(u + 1, v + 1, 0), iso(u, v + 1, 0), col);
      }
    }

    // 2. Mặt Trái (Left Face: u = N, v = 0..N-1, w = 0..N-1)
    for (let v = 0; v < N; v++) {
      for (let w = 0; w < N; w++) {
        const r = pHash(v, w, 2);
        const col = shadeHex(def.side(v, w, r), 0.80);
        fillQuad(iso(N, v, w), iso(N, v + 1, w), iso(N, v + 1, w + 1), iso(N, v, w + 1), col);
      }
    }

    // 3. Mặt Phải (Right Face: v = N, u = 0..N-1, w = 0..N-1)
    for (let u = 0; u < N; u++) {
      for (let w = 0; w < N; w++) {
        const r = pHash(u, w, 3);
        const col = shadeHex(def.side(u, w, r), 0.60);
        fillQuad(iso(u, N, w), iso(u + 1, N, w), iso(u + 1, N, w + 1), iso(u, N, w + 1), col);
      }
    }

    // 4. Viền cạnh sắc nét (Voxel Edge Highlight & Outline)
    const pTop = iso(0, 0, 0);
    const pRight = iso(N, 0, 0);
    const pCenter = iso(N, N, 0);
    const pLeft = iso(0, N, 0);
    const pBotRight = iso(N, 0, N);
    const pBotCenter = iso(N, N, N);
    const pBotLeft = iso(0, N, N);

    // Viền ngoài tối
    c.strokeStyle = "rgba(2, 6, 23, 0.78)";
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

    // Đường sống sáng giữa 3 mặt (Inner Voxel Crease)
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

  // ----- Danh mục thực thể (Hubs) gắn với từng khối Minecraft -----
  const CORE_CONCEPTS = [
    // Cluster 0: Graph RAG & AI Research
    { label: "GraphRAG", cluster: 0, hub: true, block: "enchant" },
    { label: "LightRAG", cluster: 0, hub: true, block: "emerald" },
    { label: "P2q Filter", cluster: 0, hub: true, block: "bookshelf" },
    { label: "P4 Provenance", cluster: 0, hub: true, block: "amethyst" },
    { label: "ACIIDS '27", cluster: 0, hub: true, block: "emerald" },
    { label: "FAISS · TransNet", cluster: 0, hub: false, block: "bookshelf" },
    { label: "PII Privacy", cluster: 0, hub: false, block: "amethyst" },
    { label: "Knowledge Graph", cluster: 0, hub: false, block: "enchant" },

    // Cluster 1: Cloud-Native & Kubernetes
    { label: "Kubernetes", cluster: 1, hub: true, block: "beacon" },
    { label: "ArgoCD GitOps", cluster: 1, hub: true, block: "diamond" },
    { label: "Helm Chart", cluster: 1, hub: true, block: "crafting" },
    { label: "Go 1.24 API", cluster: 1, hub: true, block: "command" },
    { label: "Prometheus · EFK", cluster: 1, hub: false, block: "beacon" },
    { label: "AWS · GCP", cluster: 1, hub: false, block: "diamond" },
    { label: "Docker · Ansible", cluster: 1, hub: false, block: "grass" },
    { label: "AquaSafe GIS", cluster: 1, hub: false, block: "grass" },

    // Cluster 2: CI/CD Security & EgressGap
    { label: "EgressGap", cluster: 2, hub: true, block: "redstone_lamp" },
    { label: "IEEE ICC '27", cluster: 2, hub: true, block: "glowstone" },
    { label: "GitHub Actions", cluster: 2, hub: true, block: "command" },
    { label: "Egress Allowlist", cluster: 2, hub: true, block: "chest" },
    { label: "Harden-Runner", cluster: 2, hub: false, block: "redstone_lamp" },
    { label: "SNI Co-Tenancy", cluster: 2, hub: false, block: "glowstone" },
    { label: "DNS Audit Log", cluster: 2, hub: false, block: "chest" },
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
  }

  // ----- Khởi tạo các Khối Node (Hubs + Satellites) -----
  const NODE_COUNT = 42;
  const nodes = [];

  function initNodes() {
    nodes.length = 0;
    for (let i = 0; i < NODE_COUNT; i++) {
      const concept = i < CORE_CONCEPTS.length ? CORE_CONCEPTS[i] : null;
      const cluster = concept ? concept.cluster : i % 3;
      const isHub = concept ? concept.hub : false;
      const block = concept ? concept.block : BLOCK_KEYS[i % BLOCK_KEYS.length];
      const z = isHub ? 0.88 + (i % 3) * 0.14 : 0.48 + (i % 5) * 0.11;
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
        vx: (Math.cos(i * 2.3) * 0.20 + (i % 2 === 0 ? 0.07 : -0.07)) * z,
        vy: (Math.sin(i * 1.7) * 0.16 + (i % 3 === 0 ? 0.05 : -0.05)) * z,
        size: isHub ? 32 : concept ? 25 : 19,
        phase: i * 0.9,
        energy: 0,
      });
    }
  }

  resize();
  initNodes();

  window.addEventListener("resize", () => {
    const oldW = width || 1;
    const oldH = height || 1;
    resize();
    for (const n of nodes) {
      n.x = (n.x / oldW) * width;
      n.y = (n.y / oldH) * height;
    }
  });

  // ----- Luồng XP Orbs / Redstone Packets chạy trên các cạnh -----
  const packets = [];
  const MAX_PACKETS = 18;

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

  // ----- Tương tác chuột & Sóng xung truy vấn (Click Ripple) -----
  const pointer = { x: -9999, y: -9999, active: false };
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
    },
    { passive: true }
  );

  // ----- Theo dõi vị trí cuộn trang mượt mà (Smooth Scroll Parallax) -----
  let targetScrollY = window.scrollY || 0;
  let smoothScrollY = targetScrollY;
  window.addEventListener(
    "scroll",
    () => {
      targetScrollY = window.scrollY || 0;
    },
    { passive: true }
  );

  function drawGrid(theme, scrollOffset) {
    const step = 44;
    const offsetY = -((scrollOffset * 0.22) % step);
    ctx.fillStyle = theme.gridDot;
    for (let x = 22; x < width; x += step) {
      for (let y = offsetY + 22; y < height; y += step) {
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }

  function drawAurora(theme, time, scrollOffset) {
    for (let i = 0; i < theme.aurora.length; i++) {
      const band = theme.aurora[i];
      const baseY =
        ((band.yFrac * height - scrollOffset * (0.1 + i * 0.04)) % (height + 240) +
          (height + 240)) %
          (height + 240) -
        120;

      ctx.beginPath();
      const segs = 12;
      for (let s = 0; s <= segs; s++) {
        const x = (s / segs) * width;
        const wave1 = Math.sin(s * 0.55 + time * band.speed + i * 1.7) * band.amp;
        const wave2 = Math.cos(s * 0.9 - time * band.speed * 0.7) * (band.amp * 0.45);
        const y = baseY + wave1 + wave2;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineTo(width, baseY + 220);
      ctx.lineTo(0, baseY + 220);
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, baseY - band.amp, 0, baseY + 200);
      grad.addColorStop(0, "rgba(0, 0, 0, 0)");
      grad.addColorStop(0.35, band.color);
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = grad;
      ctx.fill();
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

    // 1. Nền Gradient
    const bgGrad = ctx.createLinearGradient(0, 0, width * 0.35, height);
    bgGrad.addColorStop(0, theme.bgTop);
    bgGrad.addColorStop(0.52, theme.bgMid);
    bgGrad.addColorStop(1, theme.bgBot);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Dải sóng Aurora & Lưới toạ độ
    drawAurora(theme, t, smoothScrollY);
    drawGrid(theme, smoothScrollY);

    // 3. Cập nhật vị trí các Khối Block
    const linkDist = Math.min(width, height) < 640 ? 140 : 185;
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

      // Nhịp nhấp nhô (floating bobbing) kiểu vật phẩm Minecraft
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

    // 4. Vẽ sóng truy vấn (Click Ripples)
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

    // 5. Vẽ các cạnh nối giữa các Khối Block
    ctx.lineWidth = 1.1;
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
          const alpha = Math.min(0.55, ratio * (sameCluster ? 0.32 : 0.16) + boost);

          const rgb = sameCluster ? theme.clusters[a.cluster].rgb : theme.edgeRgb;
          ctx.strokeStyle = `rgba(${rgb}, ${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a.sx, a.sy);
          ctx.lineTo(b.sx, b.sy);
          ctx.stroke();

          if (!noMotion && Math.random() < 0.0013 && (a.isHub || b.isHub)) {
            spawnPacket(a, b);
          }
        }
      }
    }

    // 6. Vẽ tia kết nối từ con trỏ chuột tới các Khối Block gần nhất
    if (pointer.active) {
      const glow = ctx.createRadialGradient(pointer.x, pointer.y, 4, pointer.x, pointer.y, 195);
      glow.addColorStop(0, `rgba(${theme.cursorRgb}, 0.11)`);
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(pointer.x, pointer.y, 195, 0, Math.PI * 2);
      ctx.fill();

      for (const n of nodes) {
        const d = Math.hypot(pointer.x - n.sx, pointer.y - n.sy);
        if (d < 180) {
          const alpha = (1 - d / 180) * 0.40;
          ctx.strokeStyle = `rgba(${theme.cursorRgb}, ${alpha.toFixed(3)})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(pointer.x, pointer.y);
          ctx.lineTo(n.sx, n.sy);
          ctx.stroke();
        }
      }
    }

    // 7. Vẽ các hạt XP Orb / Redstone Packet vuông chạy trên cạnh
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

      ctx.fillStyle = `rgba(${cRgb}, 0.25)`;
      ctx.fillRect(px - 5, py - 5, 10, 10);
      ctx.fillStyle = `rgba(${cRgb}, 0.98)`;
      ctx.fillRect(px - 2.5, py - 2.5, 5, 5);
    }

    // 8. Vẽ các Khối Isometric Minecraft Block + Nhãn Khái niệm
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.textBaseline = "middle";

    for (const n of nodes) {
      const c = theme.clusters[n.cluster];
      const scale = 1 + n.energy * 0.24;
      const drawSize = n.size * scale;

      // Vòng sáng Enchantment / Beacon dưới chân khối
      if (n.isHub || n.energy > 0.12) {
        const haloR = drawSize * 0.72;
        const haloAlpha = n.isHub ? 0.18 + n.energy * 0.24 : n.energy * 0.26;
        ctx.beginPath();
        ctx.arc(n.sx, n.sy, haloR, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${c.rgb}, ${haloAlpha.toFixed(3)})`;
        ctx.fill();
      }

      // Vẽ Sprite khối Minecraft Isometric đã pre-render
      const sprite = blockSprites[n.block] || blockSprites.grass;
      ctx.drawImage(sprite, n.sx - drawSize * 0.5, n.sy - drawSize * 0.5, drawSize, drawSize);

      // Hiệu ứng hạt lấp lánh (Enchantment Pixel Sparkles) khi khối đang được kích hoạt
      if (n.energy > 0.25) {
        const spX = n.sx + Math.cos(t * 5 + n.phase) * (drawSize * 0.58);
        const spY = n.sy + Math.sin(t * 6 + n.phase) * (drawSize * 0.58);
        ctx.fillStyle = "#fef08a";
        ctx.fillRect(spX - 1.5, spY - 1.5, 3, 3);
      }

      // Nhãn văn bản bên cạnh khối
      if (n.label && (n.isHub || n.energy > 0.22)) {
        const labelAlpha = n.isHub ? 0.85 + n.energy * 0.15 : n.energy * 0.9;
        const tx = n.sx + drawSize * 0.52 + 4;
        const ty = n.sy;
        ctx.fillStyle = `rgba(2, 6, 23, ${(labelAlpha * 0.65).toFixed(3)})`;
        ctx.fillText(n.label, tx + 1, ty + 1);
        ctx.fillStyle = `rgba(241, 245, 249, ${labelAlpha.toFixed(3)})`;
        ctx.fillText(n.label, tx, ty);
      }
    }
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
    },
    cycleTimeMode() {
      timeMode = (timeMode + 1) % THEMES.length;
      if (noMotion || paused) renderFrame(performance.now());
      return timeMode;
    },
  };
}
