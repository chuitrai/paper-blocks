// Cảnh nền Khoa học Tương tác (Phương án 3):
// Interactive Knowledge Graph, Cloud-Native Topology & Aurora Wave Shader (2D Canvas 60fps).
// Biểu diễn trực quan 3 hướng nghiên cứu của Vũ Đình Ngọc Bảo:
//   1. Medical Graph RAG & Privacy Controls (GraphRAG, LightRAG, P2q, P4, ACIIDS 2027)
//   2. CI/CD Egress Security & Network Measurement (EgressGap, GitHub Actions, IEEE ICC 2027)
//   3. Cloud-Native & DevSecOps Architecture (Kubernetes, Helm, ArgoCD, Go 1.24, Prometheus)
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

  // ----- 3 chế độ màu sắc bầu trời / không gian khoa học -----
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
        { hex: "#38bdf8", rgb: "56, 189, 248" },  // Cloud & K8s (Sky Cyan)
        { hex: "#fbbf24", rgb: "251, 191, 36" },  // CI/CD Security (Amber)
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

  // ----- Danh mục thực thể (Hubs) trong Đồ thị Tri thức & Hạ tầng -----
  const CORE_CONCEPTS = [
    // Cluster 0: Graph RAG & AI Research
    { label: "GraphRAG", cluster: 0, hub: true },
    { label: "LightRAG", cluster: 0, hub: true },
    { label: "P2q Filter", cluster: 0, hub: true },
    { label: "P4 Provenance", cluster: 0, hub: true },
    { label: "ACIIDS '27", cluster: 0, hub: true },
    { label: "FAISS · TransNet", cluster: 0, hub: false },
    { label: "PII Privacy", cluster: 0, hub: false },
    { label: "Knowledge Graph", cluster: 0, hub: false },

    // Cluster 1: Cloud-Native & Kubernetes
    { label: "Kubernetes", cluster: 1, hub: true },
    { label: "ArgoCD GitOps", cluster: 1, hub: true },
    { label: "Helm Chart", cluster: 1, hub: true },
    { label: "Go 1.24 API", cluster: 1, hub: true },
    { label: "Prometheus · EFK", cluster: 1, hub: false },
    { label: "AWS · GCP", cluster: 1, hub: false },
    { label: "Docker · Ansible", cluster: 1, hub: false },
    { label: "AquaSafe GIS", cluster: 1, hub: false },

    // Cluster 2: CI/CD Security & EgressGap
    { label: "EgressGap", cluster: 2, hub: true },
    { label: "IEEE ICC '27", cluster: 2, hub: true },
    { label: "GitHub Actions", cluster: 2, hub: true },
    { label: "Egress Allowlist", cluster: 2, hub: true },
    { label: "Harden-Runner", cluster: 2, hub: false },
    { label: "SNI Co-Tenancy", cluster: 2, hub: false },
    { label: "DNS Audit Log", cluster: 2, hub: false },
    { label: "CCU Taiwan Lab", cluster: 2, hub: false },
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

  // ----- Khởi tạo các Node (Hubs + Satellites) -----
  const NODE_COUNT = 46;
  const nodes = [];

  function initNodes() {
    nodes.length = 0;
    for (let i = 0; i < NODE_COUNT; i++) {
      const concept = i < CORE_CONCEPTS.length ? CORE_CONCEPTS[i] : null;
      const cluster = concept ? concept.cluster : i % 3;
      const isHub = concept ? concept.hub : false;
      const z = isHub ? 0.85 + (i % 3) * 0.14 : 0.45 + (i % 5) * 0.12;
      // Phân bố đều trên không gian ảo rộng hơn màn hình một chút để cuộn parallax tự nhiên
      const gx = ((i * 0.61803398875) % 1) * 0.88 + 0.06;
      const gy = ((i * 0.38196601125 + (i / NODE_COUNT) * 0.5) % 1) * 1.15 - 0.05;

      nodes.push({
        id: i,
        label: concept ? concept.label : "",
        cluster,
        isHub,
        z,
        x: gx * width,
        y: gy * height,
        vx: (Math.cos(i * 2.3) * 0.22 + (i % 2 === 0 ? 0.08 : -0.08)) * z,
        vy: (Math.sin(i * 1.7) * 0.18 + (i % 3 === 0 ? 0.06 : -0.06)) * z,
        radius: isHub ? 4.8 : concept ? 3.4 : 2.1,
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

  // ----- Luồng gói tin / xung tri thức chạy trên các cạnh (Data Packets) -----
  const packets = [];
  const MAX_PACKETS = 18;

  function spawnPacket(a, b) {
    if (packets.length >= MAX_PACKETS) return;
    packets.push({
      from: a,
      to: b,
      t: 0,
      speed: 0.008 + Math.random() * 0.011,
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
      // Tạo sóng truy vấn lan toả khi click ra vùng nền hoặc thẻ
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

  // ----- Vẽ lưới chấm toạ độ khoa học (Blueprint Dot Matrix) -----
  function drawGrid(theme, scrollOffset) {
    const step = 44;
    const offsetY = -((scrollOffset * 0.22) % step);
    ctx.fillStyle = theme.gridDot;
    for (let x = 22; x < width; x += step) {
      for (let y = offsetY + 22; y < height; y += step) {
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    }
  }

  // ----- Vẽ dải sóng Aurora / Dòng chảy tri thức mềm mại -----
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

  // ----- Vòng lặp Render 60fps -----
  let paused = false;
  let lastTime = performance.now();

  function renderFrame(now) {
    const dt = Math.min((now - lastTime) * 0.001, 0.05);
    lastTime = now;
    const t = now * 0.001;

    smoothScrollY += (targetScrollY - smoothScrollY) * Math.min(1, dt * 10);
    const theme = THEMES[timeMode];

    // 1. Nền Gradient không gian khoa học
    const bgGrad = ctx.createLinearGradient(0, 0, width * 0.35, height);
    bgGrad.addColorStop(0, theme.bgTop);
    bgGrad.addColorStop(0.52, theme.bgMid);
    bgGrad.addColorStop(1, theme.bgBot);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Dải sóng Aurora & Lưới toạ độ
    drawAurora(theme, t, smoothScrollY);
    drawGrid(theme, smoothScrollY);

    // 3. Cập nhật toạ độ hiển thị của từng Node (kèm Parallax theo chiều sâu z)
    const linkDist = Math.min(width, height) < 640 ? 135 : 178;
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

      // Toạ độ thực tế trên màn hình sau khi tính Parallax cuộn trang
      const parallaxY = ((n.y - smoothScrollY * (0.18 * n.z)) % wrapH + wrapH) % wrapH - 80;
      n.sx = n.x;
      n.sy = parallaxY;
      n.energy = Math.max(0, n.energy - dt * 1.4);

      // Tương tác nhẹ với con trỏ chuột
      if (pointer.active) {
        const dx = pointer.x - n.sx;
        const dy = pointer.y - n.sy;
        const dSq = dx * dx + dy * dy;
        if (dSq < 42000 && dSq > 4) {
          const d = Math.sqrt(dSq);
          const pull = (1 - d / 205) * 0.35;
          n.sx += (dx / d) * pull * 14;
          n.sy += (dy / d) * pull * 14;
          n.energy = Math.max(n.energy, 1 - d / 205);
        }
      }
    }

    // 4. Cập nhật & vẽ sóng truy vấn (Click Ripples)
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.r += dt * 360;
      rp.alpha = Math.max(0, 0.65 * (1 - rp.r / rp.maxR));

      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${theme.cursorRgb}, ${rp.alpha.toFixed(3)})`;
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Kích hoạt năng lượng cho các Node mà sóng đi qua
      for (const n of nodes) {
        const d = Math.hypot(n.sx - rp.x, n.sy - rp.y);
        if (Math.abs(d - rp.r) < 28) {
          n.energy = 1;
        }
      }

      if (rp.r >= rp.maxR) ripples.splice(i, 1);
    }

    // 5. Vẽ các cạnh nối (Knowledge Graph Edges) & sinh luồng gói tin
    ctx.lineWidth = 1;
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

          // Ngẫu nhiên phát gói tin chạy giữa 2 node gần nhau
          if (!noMotion && Math.random() < 0.0012 && (a.isHub || b.isHub)) {
            spawnPacket(a, b);
          }
        }
      }
    }

    // 6. Vẽ kết nối tương tác từ con trỏ chuột tới các Node gần nhất
    if (pointer.active) {
      const glow = ctx.createRadialGradient(pointer.x, pointer.y, 4, pointer.x, pointer.y, 190);
      glow.addColorStop(0, `rgba(${theme.cursorRgb}, 0.11)`);
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(pointer.x, pointer.y, 190, 0, Math.PI * 2);
      ctx.fill();

      for (const n of nodes) {
        const d = Math.hypot(pointer.x - n.sx, pointer.y - n.sy);
        if (d < 175) {
          const alpha = (1 - d / 175) * 0.38;
          ctx.strokeStyle = `rgba(${theme.cursorRgb}, ${alpha.toFixed(3)})`;
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(pointer.x, pointer.y);
          ctx.lineTo(n.sx, n.sy);
          ctx.stroke();
        }
      }
    }

    // 7. Vẽ các gói tin / xung dữ liệu đang di chuyển trên cạnh
    for (let i = packets.length - 1; i >= 0; i--) {
      const pk = packets[i];
      pk.t += pk.speed * (dt * 60);
      if (pk.t >= 1) {
        pk.to.energy = Math.min(1, pk.to.energy + 0.55);
        packets.splice(i, 1);
        continue;
      }
      const px = pk.from.sx + (pk.to.sx - pk.from.sx) * pk.t;
      const py = pk.from.sy + (pk.to.sy - pk.from.sy) * pk.t;
      const cRgb = theme.clusters[pk.cluster].rgb;

      ctx.beginPath();
      ctx.arc(px, py, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${cRgb}, 0.95)`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(px, py, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${cRgb}, 0.22)`;
      ctx.fill();
    }

    // 8. Vẽ các Node & Nhãn Khái niệm Khoa học (Hubs & Satellites)
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.textBaseline = "middle";

    for (const n of nodes) {
      const c = theme.clusters[n.cluster];
      const pulse = 1 + Math.sin(t * 2.2 + n.phase) * 0.14 + n.energy * 0.35;
      const r = n.radius * pulse;

      // Vòng hào quang (Halo) quanh Hub hoặc Node đang sáng
      if (n.isHub || n.energy > 0.15) {
        const haloR = r * (n.isHub ? 3.2 : 2.5);
        const haloAlpha = n.isHub ? 0.18 + n.energy * 0.22 : n.energy * 0.25;
        ctx.beginPath();
        ctx.arc(n.sx, n.sy, haloR, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${c.rgb}, ${haloAlpha.toFixed(3)})`;
        ctx.fill();
      }

      // Nhân Node
      ctx.beginPath();
      ctx.arc(n.sx, n.sy, r, 0, Math.PI * 2);
      ctx.fillStyle = c.hex;
      ctx.fill();

      // Nhãn văn bản cho các Hub (hoặc Node phụ khi rê chuột tới gần)
      if (n.label && (n.isHub || n.energy > 0.25)) {
        const labelAlpha = n.isHub ? 0.78 + n.energy * 0.22 : n.energy * 0.85;
        const tx = n.sx + r + 7;
        const ty = n.sy;
        ctx.fillStyle = `rgba(226, 232, 240, ${labelAlpha.toFixed(3)})`;
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

  // Vẽ ngay frame đầu tiên
  renderFrame(performance.now());
  if (!noMotion) {
    requestAnimationFrame(loop);
  }

  return {
    // Đồng bộ từ khoá công bố khoa học vào các Node trên đồ thị
    setPapers(papers = []) {
      const dynamicTags = [];
      for (const p of papers) {
        for (const tag of p.tags || []) {
          if (!dynamicTags.includes(tag)) dynamicTags.push(tag);
        }
      }
      // Cập nhật một số node phụ bằng tag thực tế từ danh sách paper
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
