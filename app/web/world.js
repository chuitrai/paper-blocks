// Thế giới 3D Minecraft Voxel tích hợp GLSL Shaders & Real-Time Shadows (BSL / Complementary Shaders Style).
// Nâng cấp cảnh quan sinh thái tự nhiên:
// - Hai bên bờ sông uốn lượn có khúc quanh (Winding Riverbanks), địa hình nhấp nhô cao thấp đa tầng.
// - Mặt sông có bèo tấm (Duckweed clusters), lá súng nở hoa hồng/trắng (Flowering Water Lilies), lau sậy (Cattails & Reeds).
// - Đa dạng các loại Block: Đá tảng rêu phong (Mossy Boulders), Sỏi cuội (Gravel), Đất lá mục (Podzol),
//   Thùng gỗ (Barrels), Bí ngô (Pumpkins), Dưa hấu (Melons), Tổ ong (Beehives), Hàng rào gỗ, Nấm rừng.
// - Thảm thực vật phong phú: Cỏ cao đung đưa, dương xỉ, bụi quả mọng (Berry Bushes) và hàng trăm khóm hoa dại 6 màu.

import * as THREE from "./vendor/three.module.js";

function hash2(x, y, seed = 1) {
  let n = Math.imul(x * 374761393 + y * 668265263 + seed * 1442695041, 1274126177);
  n = (n ^ (n >>> 13)) >>> 0;
  return (n & 0xffff) / 0xffff;
}

function hexToRgb(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

function makePixelData(drawFn, aoStrength = 14) {
  const size = 16;
  const data = new Uint8Array(size * size * 4);
  const setPx = (x, y, hex, shade = 0, alpha = 255) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const [r, g, b] = hexToRgb(hex);
    const edgeDist = Math.min(x, y, size - 1 - x, size - 1 - y);
    const ao = edgeDist === 0 ? -aoStrength : edgeDist === 1 ? -aoStrength * 0.35 : 0;
    const idx = (y * size + x) * 4;
    data[idx] = clampByte(r + shade + ao);
    data[idx + 1] = clampByte(g + shade + ao);
    data[idx + 2] = clampByte(b + shade + ao);
    data[idx + 3] = alpha;
  };
  drawFn(setPx, size);
  return data;
}

function createShaderPackTextures() {
  const grass = makePixelData((px, s) => {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const n = (hash2(x, y, 11) - 0.5) * 18;
        const tuft = hash2(x, y, 19);
        const base = tuft > 0.9 ? 0x7fa352 : tuft < 0.16 ? 0x4f7036 : 0x638743;
        px(x, y, base, n);
      }
    }
  }, 12);

  // Khối Rêu Xanh Mướt (Moss Block)
  const moss = makePixelData((px, s) => {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const n = (hash2(x, y, 101) - 0.5) * 16;
        const base = hash2(x, y, 102) > 0.6 ? 0x597d35 : 0x4b6b2b;
        px(x, y, base, n);
      }
    }
  }, 10);

  // Đất Lá Mục Rừng Già (Podzol / Coarse Dirt)
  const podzol = makePixelData((px, s) => {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const r = hash2(x, y, 105);
        const base = r > 0.75 ? 0x6b4423 : r < 0.25 ? 0x472e17 : 0x593a1e;
        px(x, y, base, (hash2(x, y, 106) - 0.5) * 16);
      }
    }
  }, 14);

  const dirt = makePixelData((px, s) => {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const r = hash2(x, y, 2);
        const base = r > 0.85 ? 0x573f2c : r < 0.14 ? 0x7d5e46 : 0x6b4f39;
        px(x, y, base, (hash2(x, y, 3) - 0.5) * 16);
      }
    }
  }, 14);

  const sand = makePixelData((px, s) => {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const wave = Math.sin((x + y) * 0.5) * 5;
        px(x, y, 0xd8c7a3, (hash2(x, y, 15) - 0.5) * 10 + wave);
      }
    }
  }, 8);

  // Sỏi Cuội Bờ Sông (River Gravel)
  const gravel = makePixelData((px, s) => {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const r = hash2(x, y, 111);
        const base = r > 0.75 ? 0x968f87 : r < 0.25 ? 0x6e6862 : 0x827c75;
        px(x, y, base, (hash2(x, y, 112) - 0.5) * 20);
      }
    }
  }, 12);

  const stoneBrick = makePixelData((px, s) => {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const mortarH = y === 0 || y === 8;
        const mortarV = (y < 8 && x === 0) || (y >= 8 && x === 8);
        if (mortarH || mortarV) {
          const ms = hash2(x, y, 70) > 0.62;
          px(x, y, ms ? 0x536b42 : 0x4c4a46, (hash2(x, y, 71) - 0.5) * 8);
        } else {
          const cell = (y >> 3) * 2 + (x >> 3);
          const tone = cell === 0 ? 0x8a857d : cell === 1 ? 0x948f86 : cell === 2 ? 0x7e7971 : 0x8f8a81;
          const bevel = y === 1 || y === 9 ? 12 : y === 7 || y === 15 ? -12 : 0;
          px(x, y, tone, (hash2(x, y, 73) - 0.5) * 12 + bevel);
        }
      }
    }
  }, 14);

  const cobble = makePixelData((px, s) => {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const mortar = (x % 4 === 0 && y % 2 === 0) || (y % 4 === 0 && x % 2 === 1);
        const ms = mortar && hash2(x, y, 9) > 0.45;
        const base = ms ? 0x566e43 : mortar ? 0x4d4a45 : 0x7a756d;
        px(x, y, base, (hash2(x, y, 5) - 0.5) * 18);
      }
    }
  }, 14);

  const plank = makePixelData((px, s) => {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const seam = y % 4 === 0;
        const joint = (y >> 2) % 2 === 0 ? x === 7 : x === 13;
        const base = seam || joint ? 0x63452b : 0x966e49;
        px(x, y, base, (hash2(x, y, 17) - 0.5) * 12);
      }
    }
  }, 12);

  // Thùng Gỗ Đai Sắt (Wooden Barrel)
  const barrel = makePixelData((px, s) => {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const band = y === 3 || y === 12;
        const stave = x % 4 === 0;
        const base = band ? 0x3d4047 : stave ? 0x5c3e26 : 0x825b3a;
        px(x, y, base, (hash2(x, y, 118) - 0.5) * 12);
      }
    }
  }, 14);

  const log = makePixelData((px, s) => {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const streak = Math.sin(x * 1.4) * 8;
        px(x, y, 0x4a3423, (hash2(x, y, 12) - 0.5) * 12 + streak);
      }
    }
  }, 16);

  const stucco = makePixelData((px, s) => {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        px(x, y, 0xede3d2, (hash2(x, y, 51) - 0.5) * 10);
      }
    }
  }, 10);

  const roofTile = makePixelData((px, s) => {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const row = y % 4 === 0;
        const arch = (x + (y >> 2) * 2) % 4 === 0;
        const base = row ? 0x733526 : arch ? 0x8c4330 : 0x9e4f3a;
        px(x, y, base, (hash2(x, y, 63) - 0.5) * 12);
      }
    }
  }, 14);

  const slateRoof = makePixelData((px, s) => {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const row = y % 4 === 0;
        const base = row ? 0x333f4a : 0x465563;
        px(x, y, base, (hash2(x, y, 64) - 0.5) * 12);
      }
    }
  }, 14);

  const leaves = makePixelData((px, s) => {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const r = hash2(x, y, 23);
        const base = r > 0.7 ? 0x5d8243 : r < 0.25 ? 0x395428 : 0x4b6b35;
        px(x, y, base, (hash2(x, y, 29) - 0.5) * 16);
      }
    }
  }, 18);

  const autumn = makePixelData((px, s) => {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const r = hash2(x, y, 31);
        const base = r > 0.7 ? 0xe08e38 : r < 0.25 ? 0xa34e24 : 0xc46b2d;
        px(x, y, base, (hash2(x, y, 37) - 0.5) * 16);
      }
    }
  }, 18);

  const sakura = makePixelData((px, s) => {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const r = hash2(x, y, 39);
        const base = r > 0.7 ? 0xf2c2be : r < 0.25 ? 0xc48680 : 0xdca29c;
        px(x, y, base, (hash2(x, y, 40) - 0.5) * 14);
      }
    }
  }, 16);

  const bookshelf = makePixelData((px, s) => {
    const bookColors = [0x8c3b32, 0x3b5e78, 0x4d6b47, 0xb8863b, 0x694b73, 0x94523b];
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const frame = y < 2 || y === 7 || y === 8 || y >= 14 || x === 0 || x === 15;
        if (frame) {
          px(x, y, 0x6e4f35, (hash2(x, y, 43) - 0.5) * 10);
        } else {
          const row = y < 7 ? 0 : 1;
          const spine = Math.floor((x - 1) / 2) + row * 7;
          const col = bookColors[spine % bookColors.length];
          const topGap = y === 2 || y === 9;
          px(x, y, topGap ? 0x2b1e14 : col, (hash2(x, y, 47) - 0.5) * 12);
        }
      }
    }
  }, 12);

  const lamp = makePixelData((px, s) => {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const border = x === 0 || x === 15 || y === 0 || y === 15 || x === 7 || x === 8;
        const d = Math.hypot(x - 7.5, y - 7.5);
        const c = border ? 0x423020 : d < 4.5 ? 0xfff8de : d < 7 ? 0xffcf70 : 0xd99b38;
        px(x, y, c, 0);
      }
    }
  }, 0);

  const hay = makePixelData((px, s) => {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const rope = y === 4 || y === 11;
        const base = rope ? 0x8c5332 : (x + y) % 3 === 0 ? 0xe0b341 : 0xc99b2e;
        px(x, y, base, (hash2(x, y, 91) - 0.5) * 14);
      }
    }
  }, 14);

  // Bí Ngô Vàng Cam (Pumpkin Block)
  const pumpkin = makePixelData((px, s) => {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const rib = x % 4 === 0;
        const base = rib ? 0xb8561d : 0xd97328;
        px(x, y, base, (hash2(x, y, 121) - 0.5) * 12);
      }
    }
  }, 14);

  // Dưa Hấu Kẻ Sọc (Melon Block)
  const melon = makePixelData((px, s) => {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const stripe = x % 3 === 0;
        const base = stripe ? 0x3b6324 : 0x629638;
        px(x, y, base, (hash2(x, y, 122) - 0.5) * 12);
      }
    }
  }, 14);

  // Tổ Ong Gỗ (Beehive Block)
  const beehive = makePixelData((px, s) => {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const hole = y >= 7 && y <= 9 && x >= 6 && x <= 9;
        const honey = y === 10 && x >= 6 && x <= 9;
        const base = hole ? 0x261a0e : honey ? 0xf2b729 : y % 3 === 0 ? 0x9e743b : 0xc49552;
        px(x, y, base, (hash2(x, y, 125) - 0.5) * 10);
      }
    }
  }, 12);

  return {
    grass,
    moss,
    podzol,
    dirt,
    sand,
    gravel,
    stoneBrick,
    cobble,
    plank,
    barrel,
    log,
    stucco,
    roofTile,
    slateRoof,
    leaves,
    autumn,
    sakura,
    bookshelf,
    lamp,
    hay,
    pumpkin,
    melon,
    beehive,
  };
}

// Hàm toán học tạo khúc quanh uốn lượn tự nhiên của dòng sông theo toạ độ Z
function riverCurveX(z) {
  return Math.sin(z * 0.085) * 1.45 + Math.cos(z * 0.16) * 0.55;
}

// Hàm tạo độ rộng lòng sông thay đổi tự nhiên (chỗ phình rộng, chỗ thu hẹp)
function riverHalfWidth(z) {
  return 4.6 + Math.sin(z * 0.11 + 1.2) * 0.65;
}

// ---------------------------------------------------------------------------
// GLSL SHADER 1: BẦU TRỜI KHÍ QUYỂN, QUẦNG MẶT TRỜI & MÂY VOLUMETRIC
// ---------------------------------------------------------------------------
function createSkyShaderMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.45, 0.42, -0.78).normalize() },
      uZenithColor: { value: new THREE.Color(0x3a6ea5) },
      uHorizonColor: { value: new THREE.Color(0xe8d5b7) },
      uSunColor: { value: new THREE.Color(0xfff1c9) },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPos;
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uZenithColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uSunColor;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      float fbm(vec2 p) {
        float v = 0.0;
        v += 0.5 * noise(p); p *= 2.02;
        v += 0.25 * noise(p); p *= 2.03;
        v += 0.125 * noise(p);
        return v;
      }

      void main() {
        vec3 dir = normalize(vWorldPos);
        float y = clamp(dir.y, 0.0, 1.0);

        vec3 sky = mix(uHorizonColor, uZenithColor, pow(y, 0.55));

        float sunAmt = max(dot(dir, uSunDir), 0.0);
        sky += uSunColor * pow(sunAmt, 8.0) * 0.38;
        sky += uSunColor * smoothstep(0.996, 0.9995, sunAmt) * 1.4;

        if (dir.y > 0.06) {
          vec2 uv = dir.xz / (dir.y + 0.18) * 1.4 + vec2(uTime * 0.015, uTime * 0.008);
          float cl = fbm(uv);
          float cloudMask = smoothstep(0.48, 0.78, cl) * smoothstep(0.06, 0.28, dir.y);
          vec3 cloudCol = mix(uHorizonColor * 1.08, vec3(1.0, 0.98, 0.94), 0.65);
          sky = mix(sky, cloudCol, cloudMask * 0.55);
        }

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });
}

// ---------------------------------------------------------------------------
// GLSL SHADER 2: DÒNG SÔNG UỐN LƯỢN (FRESNEL + SUN SPECULAR + WINDING FOAM)
// ---------------------------------------------------------------------------
function createWaterShaderMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.45, 0.42, -0.78).normalize() },
      uSunColor: { value: new THREE.Color(0xffe8b3) },
      uSkyColor: { value: new THREE.Color(0x9bc4d9) },
      uDeepColor: { value: new THREE.Color(0x1f5666) },
      uShallowColor: { value: new THREE.Color(0x3f8896) },
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorldPos;
      varying float vWaveHeight;

      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        float w1 = sin(wp.z * 1.2 + uTime * 2.4 + wp.x * 0.8) * 0.045;
        float w2 = cos(wp.z * 2.5 + uTime * 3.1 - wp.x * 1.4) * 0.025;
        wp.y += w1 + w2;
        vWaveHeight = w1 + w2;
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uSkyColor;
      uniform vec3 uDeepColor;
      uniform vec3 uShallowColor;

      varying vec3 vWorldPos;
      varying float vWaveHeight;

      void main() {
        float nx = cos(vWorldPos.x * 2.6 + vWorldPos.z * 1.4 + uTime * 2.8) * 0.14
                 + sin(vWorldPos.x * 5.2 - vWorldPos.z * 3.1 + uTime * 3.6) * 0.07;
        float nz = sin(vWorldPos.z * 2.2 - vWorldPos.x * 1.2 + uTime * 2.5) * 0.14
                 + cos(vWorldPos.z * 4.8 + vWorldPos.x * 2.7 + uTime * 4.1) * 0.07;
        vec3 normal = normalize(vec3(nx, 1.0, nz));

        vec3 viewDir = normalize(cameraPosition - vWorldPos);

        float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);
        fresnel = clamp(fresnel * 0.75 + 0.12, 0.0, 1.0);

        // Tính khoảng cách tới tâm dòng sông uốn lượn
        float center = sin(vWorldPos.z * 0.085) * 1.45 + cos(vWorldPos.z * 0.16) * 0.55;
        float halfW = 4.6 + sin(vWorldPos.z * 0.11 + 1.2) * 0.65;
        float distFromCenter = abs(vWorldPos.x - center);

        float edgeFactor = smoothstep(halfW - 1.8, halfW - 0.1, distFromCenter);
        vec3 baseWater = mix(uDeepColor, uShallowColor, edgeFactor * 0.8 + vWaveHeight * 3.5);
        vec3 waterCol = mix(baseWater, uSkyColor, fresnel * 0.65);

        vec3 halfVec = normalize(uSunDir + viewDir);
        float spec = pow(max(dot(normal, halfVec), 0.0), 72.0);
        waterCol += uSunColor * spec * 1.35;

        float shoreFoam = smoothstep(halfW - 0.55, halfW - 0.05, distFromCenter);
        float waveCrest = smoothstep(0.048, 0.068, vWaveHeight + sin(vWorldPos.z * 3.0 + uTime * 3.0) * 0.015);
        waterCol = mix(waterCol, vec3(0.95, 0.98, 1.0), clamp(shoreFoam * 0.65 + waveCrest * 0.25, 0.0, 1.0));

        gl_FragColor = vec4(waterCol, 0.88);
      }
    `,
  });
}

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xd6cfc2, 0.0072);

  const camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.2, 240);

  const skyMat = createSkyShaderMaterial();
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(185, 32, 20), skyMat);
  scene.add(skyDome);

  const hemiLight = new THREE.HemisphereLight(0xfff5e4, 0x4a5d3f, 0.74);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xffe6bd, 1.35);
  sunLight.position.set(34, 48, -32);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 5;
  sunLight.shadow.camera.far = 160;
  sunLight.shadow.camera.left = -40;
  sunLight.shadow.camera.right = 40;
  sunLight.shadow.camera.top = 62;
  sunLight.shadow.camera.bottom = -62;
  sunLight.shadow.bias = -0.0008;
  scene.add(sunLight);

  const warmLanternLight = new THREE.PointLight(0xffaa44, 1.2, 34);
  warmLanternLight.position.set(0, 4.5, 0);
  scene.add(warmLanternLight);

  const rawData = createShaderPackTextures();
  const matCache = new Map();

  function getTiledMat(type, rx = 1, ry = 1, opts = {}) {
    const rxi = Math.max(1, Math.round(rx));
    const ryi = Math.max(1, Math.round(ry));
    const key = `${type}_${rxi}_${ryi}_${opts.basic ? 1 : 0}`;
    if (matCache.has(key)) return matCache.get(key);

    const tex = new THREE.DataTexture(rawData[type], 16, 16, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(rxi, ryi);
    tex.needsUpdate = true;

    const mat = opts.basic
      ? new THREE.MeshBasicMaterial({ map: tex })
      : new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.86,
          metalness: 0.04,
        });
    matCache.set(key, mat);
    return mat;
  }

  const solidMats = {
    darkWood: new THREE.MeshStandardMaterial({ color: 0x3d2b1d, roughness: 0.85 }),
    ironDark: new THREE.MeshStandardMaterial({ color: 0x3b3f46, roughness: 0.45, metalness: 0.6 }),
    ironBright: new THREE.MeshStandardMaterial({ color: 0x9aa2ad, roughness: 0.35, metalness: 0.7 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.7 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xd9a382, roughness: 0.75 }),
    shirtVintage: new THREE.MeshStandardMaterial({ color: 0x3b6978, roughness: 0.8 }),
    shirtSmith: new THREE.MeshStandardMaterial({ color: 0x8c3b2b, roughness: 0.8 }),
    apronLeather: new THREE.MeshStandardMaterial({ color: 0x4d3322, roughness: 0.85 }),
    shirtScholar: new THREE.MeshStandardMaterial({ color: 0x3d6647, roughness: 0.8 }),
    vestVintage: new THREE.MeshStandardMaterial({ color: 0x6e4e37, roughness: 0.85 }),
    pantsVintage: new THREE.MeshStandardMaterial({ color: 0x323b4a, roughness: 0.85 }),
    hairDark: new THREE.MeshStandardMaterial({ color: 0x2e1f14, roughness: 0.85 }),
    hairAuburn: new THREE.MeshStandardMaterial({ color: 0x7c3a21, roughness: 0.85 }),
    strawHat: new THREE.MeshStandardMaterial({ color: 0xdec078, roughness: 0.8 }),
    hatBand: new THREE.MeshStandardMaterial({ color: 0x943828, roughness: 0.8 }),
    bobberRed: new THREE.MeshBasicMaterial({ color: 0xd94632 }),
    duckBody: new THREE.MeshStandardMaterial({ color: 0xeae2ce, roughness: 0.7 }),
    duckHead: new THREE.MeshStandardMaterial({ color: 0x2f5c43, roughness: 0.7 }),
    duckBeak: new THREE.MeshStandardMaterial({ color: 0xe08e38, roughness: 0.6 }),
    fishSalmon: new THREE.MeshStandardMaterial({ color: 0xd96b54, roughness: 0.5 }),
    sheepWool: new THREE.MeshStandardMaterial({ color: 0xf0eadc, roughness: 0.9 }),
    cowBrown: new THREE.MeshStandardMaterial({ color: 0x593a27, roughness: 0.85 }),
    cowSpot: new THREE.MeshStandardMaterial({ color: 0xede6d8, roughness: 0.85 }),
    foxOrange: new THREE.MeshStandardMaterial({ color: 0xd96b27, roughness: 0.8 }),
    beeYellow: new THREE.MeshStandardMaterial({ color: 0xf2c12e, roughness: 0.6 }),
    // Màu thực vật: Bèo tấm, Lá súng, Hoa súng, Lau sậy, Cỏ cao & Hoa dại 6 màu
    lilyPad: new THREE.MeshStandardMaterial({ color: 0x3f6e2a, roughness: 0.8 }),
    duckweed1: new THREE.MeshStandardMaterial({ color: 0x598c36, roughness: 0.85 }),
    duckweed2: new THREE.MeshStandardMaterial({ color: 0x74a646, roughness: 0.85 }),
    lotusPink: new THREE.MeshStandardMaterial({ color: 0xf29bb2, roughness: 0.5 }),
    lotusWhite: new THREE.MeshStandardMaterial({ color: 0xfff5e6, roughness: 0.5 }),
    reedGreen: new THREE.MeshStandardMaterial({ color: 0x527a38, roughness: 0.8 }),
    cattailBrown: new THREE.MeshStandardMaterial({ color: 0x543822, roughness: 0.9 }),
    stemGreen: new THREE.MeshStandardMaterial({ color: 0x487332, roughness: 0.8 }),
    fernGreen: new THREE.MeshStandardMaterial({ color: 0x3b6329, roughness: 0.85 }),
    flowerRed: new THREE.MeshStandardMaterial({ color: 0xd93b30, roughness: 0.6 }),
    flowerYellow: new THREE.MeshStandardMaterial({ color: 0xf2c12e, roughness: 0.6 }),
    flowerBlue: new THREE.MeshStandardMaterial({ color: 0x4676c4, roughness: 0.6 }),
    flowerPurple: new THREE.MeshStandardMaterial({ color: 0x9b66c4, roughness: 0.6 }),
    flowerPink: new THREE.MeshStandardMaterial({ color: 0xe88ca5, roughness: 0.6 }),
    mushroomRed: new THREE.MeshStandardMaterial({ color: 0xc4362d, roughness: 0.7 }),
    mushroomBrown: new THREE.MeshStandardMaterial({ color: 0x825e42, roughness: 0.75 }),
    smoke: new THREE.MeshBasicMaterial({ color: 0xf2eee6, transparent: true, opacity: 0.48 }),
    firefly: new THREE.MeshBasicMaterial({ color: 0xffe885 }),
    spark: new THREE.MeshBasicMaterial({ color: 0xffaa00 }),
  };

  const unitBox = new THREE.BoxGeometry(1, 1, 1);

  function addTiledBox(parent, x, y, z, sx, sy, sz, texType, opts = {}) {
    const rx = Math.max(sx, sz);
    const ry = sy >= 1.5 ? sy : Math.min(sx, sz);
    const mat = getTiledMat(texType, rx, ry, opts);
    const m = new THREE.Mesh(unitBox, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    if (!opts.basic) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    parent.add(m);
    return m;
  }

  function addSolidBox(parent, x, y, z, sx, sy, sz, mat, cast = true) {
    const m = new THREE.Mesh(unitBox, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  const worldRoot = new THREE.Group();
  scene.add(worldRoot);

  // -------------------------------------------------------------------------
  // 1. DÒNG SÔNG UỐN LƯỢN & HAI BÊN BỜ CÓ KHÚC QUANH, CAO THẤP ĐA DẠNG BLOCK
  // -------------------------------------------------------------------------
  const waterGeo = new THREE.PlaneGeometry(16, 156, 48, 160);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = createWaterShaderMaterial();
  const riverMesh = new THREE.Mesh(waterGeo, waterMat);
  riverMesh.position.set(0, -0.18, -46);
  worldRoot.add(riverMesh);

  addTiledBox(worldRoot, 0, -1.2, -46, 18, 0.8, 156, "sand");

  // Xây dựng hai bờ sông theo từng lát cắt Z (từ z = +20 xuống z = -108)
  // tạo khúc quanh uốn lượn, độ cao thấp nhấp nhô và xen kẽ Cát, Sỏi, Đá Rêu, Đất Podzol & Cỏ
  const sliceLen = 3.6;
  for (let z = 20; z >= -108; z -= sliceLen) {
    const cx = riverCurveX(z);
    const hw = riverHalfWidth(z);
    const leftEdge = cx - hw;
    const rightEdge = cx + hw;

    // Độ cao bờ sông thay đổi tự nhiên (chỗ thoải xuống sát mặt nước, chỗ nhô cao thành bờ đá/gò cỏ)
    const leftBankH = 1.25 + Math.sin(z * 0.14) * 0.35 + Math.cos(z * 0.27) * 0.2;
    const rightBankH = 1.25 + Math.cos(z * 0.13) * 0.35 + Math.sin(z * 0.25) * 0.2;

    // Lựa chọn loại block bờ kè tự nhiên theo từng đoạn (Đá cuội rêu, Sỏi cuội, Cát vàng, Rêu xanh)
    const segHash = hash2(Math.round(z), 7, 19);
    const shoreTypeL = segHash > 0.65 ? "cobble" : segHash > 0.35 ? "gravel" : "sand";
    const shoreTypeR = segHash > 0.6 ? "gravel" : segHash > 0.3 ? "cobble" : "sand";

    // Bãi bồi / bờ kè sát mép nước
    addTiledBox(worldRoot, leftEdge - 0.6, -0.1 + (leftBankH - 1.1) * 0.3, z, 1.4, 0.95, sliceLen + 0.1, shoreTypeL);
    addTiledBox(worldRoot, rightEdge + 0.6, -0.1 + (rightBankH - 1.1) * 0.3, z, 1.4, 0.95, sliceLen + 0.1, shoreTypeR);

    // Thảm cỏ chính hai bên bờ uốn theo khúc quanh và nhấp nhô cao thấp
    const surfTypeL = hash2(Math.round(z), 1, 21) > 0.82 ? "moss" : hash2(Math.round(z), 2, 21) < 0.14 ? "podzol" : "grass";
    const surfTypeR = hash2(Math.round(z), 3, 21) > 0.82 ? "moss" : hash2(Math.round(z), 4, 21) < 0.14 ? "podzol" : "grass";

    addTiledBox(worldRoot, leftEdge - 9.5, leftBankH * 0.5 - 0.15, z, 17.0, leftBankH, sliceLen + 0.1, surfTypeL);
    addTiledBox(worldRoot, rightEdge + 9.5, rightBankH * 0.5 - 0.15, z, 17.0, rightBankH, sliceLen + 0.1, surfTypeR);

    // Các gò đồi nhỏ (Mounds / Terraces) nhô lên tạo địa hình cao thấp đa tầng
    if (hash2(Math.round(z), 5, 29) > 0.45) {
      const moundH = 0.7 + hash2(Math.round(z), 6, 29) * 0.9;
      addTiledBox(
        worldRoot,
        leftEdge - 6.8 - hash2(Math.round(z), 8, 29) * 2.5,
        leftBankH + moundH * 0.5 - 0.2,
        z,
        4.5,
        moundH,
        sliceLen * 1.15,
        "grass"
      );
    }
    if (hash2(Math.round(z), 9, 31) > 0.45) {
      const moundH = 0.7 + hash2(Math.round(z), 10, 31) * 0.9;
      addTiledBox(
        worldRoot,
        rightEdge + 6.8 + hash2(Math.round(z), 11, 31) * 2.5,
        rightBankH + moundH * 0.5 - 0.2,
        z,
        4.5,
        moundH,
        sliceLen * 1.15,
        "grass"
      );
    }

    // Đá tảng rêu phong (Mossy Boulders) nằm rải rác ở các khúc cua bờ sông
    if (hash2(Math.round(z), 12, 41) > 0.62) {
      const bx = leftEdge - 0.3;
      addTiledBox(worldRoot, bx, 0.45, z + 0.4, 1.1, 0.85, 1.2, "cobble");
      addTiledBox(worldRoot, bx - 0.3, 0.85, z + 0.2, 0.75, 0.5, 0.8, "moss");
    }
    if (hash2(Math.round(z), 13, 43) > 0.62) {
      const bx = rightEdge + 0.3;
      addTiledBox(worldRoot, bx, 0.45, z - 0.4, 1.2, 0.8, 1.1, "cobble");
      addTiledBox(worldRoot, bx + 0.3, 0.82, z - 0.2, 0.75, 0.48, 0.75, "moss");
    }
  }

  // Hai dãy đồi cao phía xa ôm trọn thung lũng
  addTiledBox(worldRoot, -23, 2.5, -46, 12, 2.4, 156, "grass");
  addTiledBox(worldRoot, 23, 2.5, -46, 12, 2.4, 156, "grass");
  addTiledBox(worldRoot, -27, 4.6, -46, 8, 2.6, 156, "grass");
  addTiledBox(worldRoot, 27, 4.6, -46, 8, 2.6, 156, "grass");

  // -------------------------------------------------------------------------
  // 2. BÈO TẤM, HOA SÚNG NỞ TRÊN MẶT NƯỚC & CÂY LAU SẬY VEN SÔNG
  // -------------------------------------------------------------------------
  const floatingFlora = [];
  const swayingReeds = [];

  for (let z = 17; z >= -96; z -= 2.2) {
    const cx = riverCurveX(z);
    const hw = riverHalfWidth(z);

    // Đám bèo tấm (Duckweed patches) trôi dập dềnh ở hai bên rìa sông & khúc quanh
    for (let k = 0; k < 3; k++) {
      const side = k % 2 === 0 ? -1 : 1;
      const dist = hw - 0.5 - hash2(Math.round(z * 2), k, 55) * 2.2;
      const bx = cx + side * dist;
      const bz = z + (hash2(k, Math.round(z), 56) - 0.5) * 1.6;

      const patch = new THREE.Group();
      patch.position.set(bx, -0.14, bz);
      const dwMat = (k + Math.round(z)) % 2 === 0 ? solidMats.duckweed1 : solidMats.duckweed2;
      // Cụm 3-4 lá bèo nhỏ ghép lại tự nhiên
      addSolidBox(patch, 0, 0, 0, 0.48, 0.04, 0.48, dwMat, false);
      addSolidBox(patch, 0.28, 0.01, 0.22, 0.34, 0.04, 0.34, solidMats.lilyPad, false);
      addSolidBox(patch, -0.24, 0.01, -0.18, 0.3, 0.04, 0.3, dwMat, false);
      worldRoot.add(patch);
      floatingFlora.push({ mesh: patch, phase: z * 0.4 + k });
    }

    // Lá súng lớn kèm Hoa súng hồng / trắng nở rộ trên mặt sông
    if (hash2(Math.round(z * 3), 1, 61) > 0.42) {
      const lx = cx + (hash2(Math.round(z), 2, 62) - 0.5) * (hw * 1.3);
      const lily = new THREE.Group();
      lily.position.set(lx, -0.13, z);
      addSolidBox(lily, 0, 0, 0, 0.82, 0.05, 0.82, solidMats.lilyPad, false);
      // 60% lá súng có hoa sen/súng nở bên trên
      if (hash2(Math.round(z), 3, 63) > 0.38) {
        const flMat = hash2(Math.round(z), 4, 64) > 0.5 ? solidMats.lotusPink : solidMats.lotusWhite;
        addSolidBox(lily, 0, 0.1, 0, 0.32, 0.16, 0.32, flMat, false);
        addSolidBox(lily, 0, 0.18, 0, 0.14, 0.08, 0.14, solidMats.flowerYellow, false);
      }
      worldRoot.add(lily);
      floatingFlora.push({ mesh: lily, phase: z * 0.7 });
    }

    // Bụi lau sậy / Bông lau (Cattails & River Reeds) mọc ven khúc cua bờ sông
    if (hash2(Math.round(z * 2), 5, 67) > 0.35) {
      for (const side of [-1, 1]) {
        if (hash2(Math.round(z), side + 2, 68) > 0.6) continue;
        const rx = cx + side * (hw - 0.25);
        const reedGroup = new THREE.Group();
        reedGroup.position.set(rx, -0.1, z);
        for (let r = 0; r < 3; r++) {
          const ox = (r - 1) * 0.22;
          const oz = ((r * 7) % 3 - 1) * 0.2;
          const h = 1.35 + (r % 2) * 0.4;
          addSolidBox(reedGroup, ox, h * 0.5, oz, 0.1, h, 0.1, solidMats.reedGreen);
          if (r !== 1) {
            addSolidBox(reedGroup, ox, h - 0.15, oz, 0.16, 0.38, 0.16, solidMats.cattailBrown);
          }
        }
        worldRoot.add(reedGroup);
        swayingReeds.push({ mesh: reedGroup, phase: z * 0.5 + side });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 3. CÂY CỐI, CỎ CAO, DƯƠNG XỈ, HOA DẠI 6 MÀU & CÁC KHỐI ĐA DẠNG TRÊN BỜ
  // -------------------------------------------------------------------------
  const swayingCanopies = [];
  function buildShaderTree(x, y, z, leafType = "leaves", scale = 1.0, phase = 0) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const trunkH = 3.6 * scale;
    addTiledBox(g, 0, trunkH / 2, 0, 0.85 * scale, trunkH, 0.85 * scale, "log");

    const canopy = new THREE.Group();
    canopy.position.set(0, trunkH, 0);
    addTiledBox(canopy, 0, 0.2, 0, 3.8 * scale, 1.4 * scale, 3.8 * scale, leafType);
    addTiledBox(canopy, 0, 1.3 * scale, 0, 3.0 * scale, 1.3 * scale, 3.0 * scale, leafType);
    addTiledBox(canopy, 0, 2.2 * scale, 0, 1.8 * scale, 1.0 * scale, 1.8 * scale, leafType);
    addTiledBox(canopy, 1.2 * scale, -0.2, 0.6 * scale, 1.6 * scale, 1.1 * scale, 1.6 * scale, leafType);
    addTiledBox(canopy, -1.1 * scale, 0, -0.5 * scale, 1.5 * scale, 1.1 * scale, 1.5 * scale, leafType);
    g.add(canopy);
    swayingCanopies.push({ mesh: canopy, phase });

    worldRoot.add(g);
  }

  const trees = [
    [-10.2, 1.3, 10.5, "autumn", 1.05, 0.2],
    [10.8, 1.3, 8.5, "sakura", 1.15, 1.1],
    [-16.2, 1.3, 1.5, "leaves", 1.2, 2.0],
    [14.8, 1.3, -1.5, "autumn", 1.05, 0.7],
    [-10.8, 1.3, -10.5, "sakura", 1.1, 1.8],
    [10.2, 1.3, -13.5, "leaves", 1.15, 2.9],
    [-18.2, 3.2, -19.0, "autumn", 1.25, 0.4],
    [18.2, 3.2, -21.0, "sakura", 1.2, 1.5],
    [-11.2, 1.3, -34.0, "leaves", 1.1, 2.4],
    [11.2, 1.3, -36.0, "autumn", 1.1, 3.1],
    [-18.2, 3.2, -46.0, "sakura", 1.2, 0.9],
    [18.2, 3.2, -48.0, "leaves", 1.25, 2.2],
    [-15.5, 1.3, -52.0, "autumn", 1.15, 1.3],
    [15.5, 1.3, -53.0, "sakura", 1.15, 2.7],
    [-10.5, 1.3, -63.0, "leaves", 1.1, 0.6],
    [10.5, 1.3, -64.0, "autumn", 1.15, 1.9],
    [-18.0, 3.2, -68.0, "autumn", 1.3, 2.5],
    [18.0, 3.2, -70.0, "sakura", 1.25, 0.8],
    [-11.0, 1.3, -78.0, "sakura", 1.15, 1.4],
    [11.0, 1.3, -79.0, "leaves", 1.2, 2.1],
    [-16.5, 1.3, -86.0, "autumn", 1.2, 0.3],
    [16.5, 1.3, -88.0, "sakura", 1.2, 1.7],
  ];
  for (const [tx, ty, tz, lt, sc, ph] of trees) {
    buildShaderTree(tx, ty, tz, lt, sc, ph);
  }

  // Trải thảm Hoa dại 6 màu, Cỏ cao, Dương xỉ, Bụi quả mọng & Nấm dọc hai bên bờ
  const flowerPalette = [
    solidMats.flowerRed,
    solidMats.flowerYellow,
    solidMats.flowerBlue,
    solidMats.flowerPurple,
    solidMats.flowerPink,
    solidMats.lotusWhite,
  ];

  for (let i = 0; i < 135; i++) {
    const z = 16 - (i / 135) * 108;
    const side = i % 2 === 0 ? -1 : 1;
    const cx = riverCurveX(z);
    const hw = riverHalfWidth(z);
    const offset = 1.2 + hash2(i, 1, 77) * 9.5;
    const x = cx + side * (hw + offset);
    const y = 1.15 + Math.sin(z * 0.14) * 0.25;

    const kind = i % 5;
    if (kind === 0 || kind === 1) {
      // Khóm hoa dại nhiều màu kèm cuống xanh
      const flGroup = new THREE.Group();
      flGroup.position.set(x, y, z);
      const fMat = flowerPalette[i % flowerPalette.length];
      addSolidBox(flGroup, 0, 0.2, 0, 0.08, 0.4, 0.08, solidMats.stemGreen, false);
      addSolidBox(flGroup, 0, 0.44, 0, 0.24, 0.2, 0.24, fMat, false);
      addSolidBox(flGroup, 0.28, 0.16, 0.18, 0.08, 0.32, 0.08, solidMats.stemGreen, false);
      addSolidBox(flGroup, 0.28, 0.36, 0.18, 0.22, 0.18, 0.22, fMat, false);
      worldRoot.add(flGroup);
      swayingReeds.push({ mesh: flGroup, phase: i * 0.3 });
    } else if (kind === 2) {
      // Bụi cỏ cao & dương xỉ (Tall Grass & Fern)
      const grGroup = new THREE.Group();
      grGroup.position.set(x, y, z);
      addSolidBox(grGroup, 0, 0.3, 0, 0.12, 0.6, 0.45, solidMats.fernGreen, false);
      addSolidBox(grGroup, 0, 0.28, 0, 0.45, 0.55, 0.12, solidMats.stemGreen, false);
      worldRoot.add(grGroup);
      swayingReeds.push({ mesh: grGroup, phase: i * 0.5 });
    } else if (kind === 3) {
      // Bụi cây lá xanh kết quả mọng đỏ (Sweet Berry Bush)
      const bush = new THREE.Group();
      bush.position.set(x, y, z);
      addTiledBox(bush, 0, 0.45, 0, 0.95, 0.85, 0.95, "leaves");
      addSolidBox(bush, 0.35, 0.55, 0.35, 0.16, 0.16, 0.16, solidMats.flowerRed, false);
      addSolidBox(bush, -0.3, 0.4, 0.38, 0.15, 0.15, 0.15, solidMats.flowerRed, false);
      worldRoot.add(bush);
    } else {
      // Khóm nấm rừng đỏ & nâu
      const mush = new THREE.Group();
      mush.position.set(x, y, z);
      addSolidBox(mush, 0, 0.15, 0, 0.12, 0.3, 0.12, solidMats.white, false);
      addSolidBox(
        mush,
        0,
        0.34,
        0,
        0.34,
        0.16,
        0.34,
        i % 2 === 0 ? solidMats.mushroomRed : solidMats.mushroomBrown,
        false
      );
      worldRoot.add(mush);
    }
  }

  // Các cụm Block trang trí đa dạng dọc hai bờ: Bí ngô, Dưa hấu, Thùng gỗ, Tổ ong & Hàng rào gỗ
  function addPumpkinPatch(x, y, z) {
    addTiledBox(worldRoot, x, y + 0.45, z, 0.85, 0.85, 0.85, "pumpkin");
    addTiledBox(worldRoot, x + 0.95, y + 0.4, z + 0.4, 0.78, 0.78, 0.78, "pumpkin");
    addTiledBox(worldRoot, x - 0.8, y + 0.42, z + 0.6, 0.82, 0.82, 0.82, "melon");
    addTiledBox(worldRoot, x + 0.2, y + 0.4, z - 0.85, 0.75, 0.75, 0.75, "melon");
  }
  addPumpkinPatch(-8.8, 1.15, 6.5);
  addPumpkinPatch(9.2, 1.15, -14.0);
  addPumpkinPatch(-9.0, 1.15, -44.0);
  addPumpkinPatch(9.2, 1.15, -62.0);

  // Cụm Tổ ong (Beehives) & Thùng gỗ (Barrels)
  function addApiaryAndBarrels(x, y, z) {
    addSolidBox(worldRoot, x, y + 0.25, z, 0.3, 0.5, 0.3, solidMats.darkWood);
    addTiledBox(worldRoot, x, y + 0.85, z, 0.9, 0.85, 0.9, "beehive");
    addTiledBox(worldRoot, x + 1.2, y + 0.5, z + 0.3, 0.85, 0.95, 0.85, "barrel");
    addTiledBox(worldRoot, x + 1.2, y + 0.5, z - 0.65, 0.85, 0.95, 0.85, "barrel");
  }
  addApiaryAndBarrels(8.5, 1.15, -52.5);
  addApiaryAndBarrels(-8.6, 1.15, -60.5);

  // Hàng rào gỗ mộc mạc dọc các lối mòn ven sông
  function buildWoodenFenceLine(x, y, zStart, count, spacing = 1.6) {
    for (let i = 0; i < count; i++) {
      const z = zStart - i * spacing;
      addSolidBox(worldRoot, x, y + 0.55, z, 0.22, 1.1, 0.22, solidMats.darkWood);
      if (i < count - 1) {
        addTiledBox(worldRoot, x, y + 0.85, z - spacing * 0.5, 0.12, 0.14, spacing, "plank");
        addTiledBox(worldRoot, x, y + 0.45, z - spacing * 0.5, 0.12, 0.14, spacing, "plank");
      }
    }
  }
  buildWoodenFenceLine(-7.2, 1.15, 11, 4);
  buildWoodenFenceLine(7.4, 1.15, -6, 5);
  buildWoodenFenceLine(-9.8, 1.15, -47, 5);
  buildWoodenFenceLine(9.8, 1.15, -47, 5);

  function buildVintageLampPost(x, y, z) {
    const p = new THREE.Group();
    p.position.set(x, y, z);
    addTiledBox(p, 0, 0.3, 0, 0.7, 0.6, 0.7, "stoneBrick");
    addSolidBox(p, 0, 1.8, 0, 0.26, 2.6, 0.26, solidMats.darkWood);
    addSolidBox(p, 0, 3.1, 0, 0.8, 0.22, 0.26, solidMats.darkWood);
    addTiledBox(p, 0, 2.75, 0, 0.55, 0.65, 0.55, "lamp", { basic: true });
    worldRoot.add(p);
  }
  for (let z = 10; z >= -86; z -= 12) {
    const cx = riverCurveX(z);
    const hw = riverHalfWidth(z);
    buildVintageLampPost(cx - hw - 1.1, 0.9, z);
    buildVintageLampPost(cx + hw + 1.1, 0.9, z - 6);
  }

  // -------------------------------------------------------------------------
  // 4. ĐẦU SÔNG: CẦU TÀU GỖ & STEVE ĐỘI MŨ RƠM NGỒI CÂU CÁ
  // -------------------------------------------------------------------------
  const pierGroup = new THREE.Group();
  pierGroup.position.set(-5.8, 1.05, 4.2);
  addTiledBox(pierGroup, 1.8, 0.2, 0, 4.8, 0.32, 2.6, "plank");
  addTiledBox(pierGroup, 0.4, 0.75, 0.85, 0.75, 0.8, 0.75, "barrel");
  for (const px of [0.2, 2.0, 3.8]) {
    addSolidBox(pierGroup, px, -0.75, -1.05, 0.32, 1.9, 0.32, solidMats.darkWood);
    addSolidBox(pierGroup, px, -0.75, 1.05, 0.32, 1.9, 0.32, solidMats.darkWood);
  }
  addSolidBox(pierGroup, 1.8, 0.85, -1.1, 3.8, 0.14, 0.14, solidMats.darkWood);
  addSolidBox(pierGroup, 3.8, 1.25, -1.05, 0.28, 2.1, 0.28, solidMats.darkWood);
  addTiledBox(pierGroup, 3.8, 2.1, -0.6, 0.5, 0.6, 0.5, "lamp", { basic: true });
  worldRoot.add(pierGroup);

  const steveGroup = new THREE.Group();
  steveGroup.position.set(-1.7, 1.48, 4.4);
  steveGroup.rotation.y = Math.PI / 2;
  worldRoot.add(steveGroup);

  const steveHead = new THREE.Group();
  steveHead.position.set(0, 1.02, 0);
  addSolidBox(steveHead, 0, 0.28, 0, 0.62, 0.62, 0.62, solidMats.skin);
  addSolidBox(steveHead, 0, 0.58, 0, 1.05, 0.12, 1.05, solidMats.strawHat);
  addSolidBox(steveHead, 0, 0.72, 0, 0.68, 0.24, 0.68, solidMats.strawHat);
  addSolidBox(steveHead, 0, 0.63, 0, 0.71, 0.08, 0.71, solidMats.hatBand);
  steveGroup.add(steveHead);

  addSolidBox(steveGroup, 0, 0.45, 0, 0.62, 0.82, 0.36, solidMats.shirtVintage);
  addSolidBox(steveGroup, 0, 0.45, 0.02, 0.65, 0.76, 0.38, solidMats.vestVintage);
  const steveLegL = addSolidBox(steveGroup, -0.17, -0.08, 0.34, 0.26, 0.62, 0.26, solidMats.pantsVintage);
  const steveLegR = addSolidBox(steveGroup, 0.17, -0.08, 0.34, 0.26, 0.62, 0.26, solidMats.pantsVintage);
  addSolidBox(steveGroup, 0.44, 0.44, 0.14, 0.24, 0.68, 0.24, solidMats.shirtVintage);

  const steveRightArm = new THREE.Group();
  steveRightArm.position.set(-0.44, 0.72, 0);
  addSolidBox(steveRightArm, 0, -0.24, 0.24, 0.24, 0.68, 0.24, solidMats.shirtVintage);
  const rodMesh = addSolidBox(steveRightArm, 0, 0.15, 1.4, 0.07, 0.07, 2.6, solidMats.darkWood);
  rodMesh.rotation.x = -0.35;
  steveGroup.add(steveRightArm);

  const bobberGroup = new THREE.Group();
  bobberGroup.position.set(0.85, -0.15, 4.4);
  addSolidBox(bobberGroup, 0, 0.11, 0, 0.24, 0.22, 0.24, solidMats.bobberRed, false);
  addSolidBox(bobberGroup, 0, -0.07, 0, 0.22, 0.18, 0.22, solidMats.white, false);
  worldRoot.add(bobberGroup);

  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.15, 2.55, 4.4),
    new THREE.Vector3(0.35, 0.95, 4.4),
    new THREE.Vector3(0.85, 0.0, 4.4),
  ]);
  const fishingLine = new THREE.Line(
    lineGeo,
    new THREE.LineBasicMaterial({ color: 0xf4efe6 })
  );
  worldRoot.add(fishingLine);

  // -------------------------------------------------------------------------
  // 5. KIẾN TRÚC ĐẦU, GIỮA & HAI BÊN CUỐI SÔNG
  // -------------------------------------------------------------------------
  const waterwheels = [];
  function buildVintageMillCottage(x, y, z, side = 1) {
    const c = new THREE.Group();
    c.position.set(x, y, z);
    addTiledBox(c, 0, 0.6, 0, 6.8, 1.2, 7.6, "cobble");
    addTiledBox(c, 0, 2.8, 0, 6.2, 3.4, 7.0, "stucco");
    for (const dx of [-3.1, 0, 3.1]) {
      for (const dz of [-3.5, 0, 3.5]) {
        if (dx === 0 && dz === 0) continue;
        addSolidBox(c, dx, 2.8, dz, 0.42, 3.5, 0.42, solidMats.darkWood);
      }
    }
    addSolidBox(c, 0, 4.4, 0, 6.5, 0.35, 7.3, solidMats.darkWood);
    addSolidBox(c, 0, 1.3, 0, 6.4, 0.3, 7.2, solidMats.darkWood);

    for (let i = 0; i < 5; i++) {
      addTiledBox(c, 0, 4.8 + i * 0.65, 0, 7.4 - i * 1.3, 0.7, 8.2, "roofTile");
    }

    addTiledBox(c, -2.4 * side, 5.2, -2.2, 1.2, 6.4, 1.2, "stoneBrick");
    addTiledBox(c, 3.15 * side, 2.8, 1.4, 0.2, 1.3, 1.5, "lamp", { basic: true });
    addTiledBox(c, 3.15 * side, 2.8, -1.4, 0.2, 1.3, 1.5, "lamp", { basic: true });

    const wheel = new THREE.Group();
    wheel.position.set(3.65 * side, 1.4, 0);
    addSolidBox(wheel, 0, 0, 0, 0.5, 3.6, 0.45, solidMats.darkWood);
    addSolidBox(wheel, 0, 0, 0, 0.5, 0.45, 3.6, solidMats.darkWood);
    for (let a = 0; a < 4; a++) {
      const spoke = new THREE.Group();
      spoke.rotation.x = (a * Math.PI) / 4;
      addTiledBox(spoke, 0, 1.7, 0, 0.6, 0.28, 0.9, "plank");
      addTiledBox(spoke, 0, -1.7, 0, 0.6, 0.28, 0.9, "plank");
      wheel.add(spoke);
    }
    c.add(wheel);
    waterwheels.push(wheel);
    worldRoot.add(c);
  }
  buildVintageMillCottage(-10.8, 1.2, 2, 1);

  function buildEastManor(x, y, z, side = -1) {
    const m = new THREE.Group();
    m.position.set(x, y, z);
    addTiledBox(m, 0, 0.8, 0, 6.4, 1.6, 6.4, "stoneBrick");
    addTiledBox(m, 0, 3.2, 0, 5.8, 3.4, 5.8, "stucco");
    for (let i = 0; i < 4; i++) {
      addTiledBox(m, 0, 5.2 + i * 0.7, 0, 6.8 - i * 1.4, 0.75, 6.8 - i * 1.4, "slateRoof");
    }
    addTiledBox(m, 2.95 * side, 3.2, 0, 0.2, 1.5, 2.2, "lamp", { basic: true });
    worldRoot.add(m);
  }
  buildEastManor(11.2, 1.2, 0, -1);

  function buildVintagePavilion(x, y, z, side) {
    const p = new THREE.Group();
    p.position.set(x, y, z);
    addTiledBox(p, 0, 0.6, 0, 7.0, 1.2, 12.0, "stoneBrick");
    addTiledBox(p, 0, 2.8, 0, 5.8, 3.4, 10.6, "bookshelf");
    for (let dz = -5; dz <= 5; dz += 5) {
      addTiledBox(p, side * 3.0, 2.8, dz, 0.9, 3.6, 0.9, "stoneBrick");
    }
    addTiledBox(p, 0, 5.0, 0, 7.2, 0.8, 12.2, "plank");
    addTiledBox(p, 0, 6.5, 0, 5.4, 2.4, 9.6, "stucco");
    addTiledBox(p, side * 2.75, 6.5, 0, 0.2, 1.4, 5.0, "lamp", { basic: true });
    for (let i = 0; i < 3; i++) {
      addTiledBox(p, 0, 8.0 + i * 0.7, 0, 6.6 - i * 1.6, 0.75, 11.0 - i * 1.2, "roofTile");
    }
    worldRoot.add(p);
  }
  buildVintagePavilion(-12.5, 1.2, -22, 1);
  buildVintagePavilion(12.5, 1.2, -22, -1);

  function buildStoneArchBridge(z) {
    const b = new THREE.Group();
    b.position.set(riverCurveX(z), 0, z);
    addTiledBox(b, -5.2, 1.8, 0, 2.4, 4.2, 3.8, "stoneBrick");
    addTiledBox(b, 5.2, 1.8, 0, 2.4, 4.2, 3.8, "stoneBrick");
    addTiledBox(b, -3.0, 3.4, 0, 2.6, 1.0, 3.6, "stoneBrick");
    addTiledBox(b, 3.0, 3.4, 0, 2.6, 1.0, 3.6, "stoneBrick");
    addTiledBox(b, 0, 3.9, 0, 4.2, 0.9, 3.6, "stoneBrick");
    addTiledBox(b, 0, 4.45, 0, 12.8, 0.3, 3.2, "plank");
    addTiledBox(b, 0, 4.9, -1.55, 12.8, 0.7, 0.4, "cobble");
    addTiledBox(b, 0, 4.9, 1.55, 12.8, 0.7, 0.4, "cobble");
    for (const bx of [-4.5, 4.5]) {
      for (const bz of [-1.55, 1.55]) {
        addSolidBox(b, bx, 5.8, bz, 0.25, 1.2, 0.25, solidMats.darkWood);
        addTiledBox(b, bx, 6.5, bz, 0.5, 0.55, 0.5, "lamp", { basic: true });
      }
    }
    worldRoot.add(b);
  }
  buildStoneArchBridge(-38);
  buildStoneArchBridge(-74);

  buildVintageMillCottage(-12.2, 1.2, -58, 1);
  buildEastManor(12.2, 1.2, -58, -1);
  buildVintageMillCottage(-11.8, 1.2, -82, 1);
  buildEastManor(11.8, 1.2, -82, -1);

  // Sân làm việc bên trái (z = -55, x = -7.6) & Nhân vật 1 đập búa rèn
  const leftWorkstation = new THREE.Group();
  leftWorkstation.position.set(-7.6, 1.3, -55.0);
  addTiledBox(leftWorkstation, 0, 0.15, 0, 4.2, 0.3, 5.6, "cobble");
  for (const pz of [-2.4, 2.4]) {
    addSolidBox(leftWorkstation, -1.6, 1.8, pz, 0.3, 3.2, 0.3, solidMats.darkWood);
    addSolidBox(leftWorkstation, 1.4, 1.8, pz, 0.3, 3.2, 0.3, solidMats.darkWood);
  }
  addTiledBox(leftWorkstation, -0.1, 3.5, 0, 3.8, 0.4, 5.6, "roofTile");
  addTiledBox(leftWorkstation, -1.1, 0.9, -1.4, 1.2, 1.2, 1.2, "stoneBrick");
  addTiledBox(leftWorkstation, -0.48, 0.8, -1.4, 0.1, 0.6, 0.6, "lamp", { basic: true });
  addTiledBox(leftWorkstation, -1.1, 0.75, 1.2, 1.0, 0.9, 1.0, "plank");
  addSolidBox(leftWorkstation, 0.45, 0.5, 0, 0.65, 0.4, 0.85, solidMats.ironDark);
  addSolidBox(leftWorkstation, 0.45, 0.85, 0, 0.55, 0.35, 1.05, solidMats.ironDark);
  addTiledBox(leftWorkstation, -0.8, 0.7, 3.4, 1.1, 1.0, 1.1, "hay");
  addTiledBox(leftWorkstation, 0.3, 0.7, 3.6, 1.1, 1.0, 1.1, "hay");
  addTiledBox(leftWorkstation, -0.3, 1.65, 3.5, 1.0, 0.95, 1.0, "hay");
  worldRoot.add(leftWorkstation);

  const workerLeft = new THREE.Group();
  workerLeft.position.set(-7.85, 1.6, -55.0);
  workerLeft.rotation.y = Math.PI / 2;
  worldRoot.add(workerLeft);

  const wlHead = new THREE.Group();
  wlHead.position.set(0, 1.45, 0);
  addSolidBox(wlHead, 0, 0.3, 0, 0.58, 0.58, 0.58, solidMats.skin);
  addSolidBox(wlHead, 0, 0.56, -0.02, 0.62, 0.22, 0.62, solidMats.hairDark);
  workerLeft.add(wlHead);

  addSolidBox(workerLeft, 0, 1.0, 0, 0.58, 0.78, 0.34, solidMats.shirtSmith);
  addSolidBox(workerLeft, 0, 0.95, 0.03, 0.6, 0.72, 0.36, solidMats.apronLeather);
  addSolidBox(workerLeft, -0.15, 0.32, 0, 0.25, 0.65, 0.25, solidMats.pantsVintage);
  addSolidBox(workerLeft, 0.15, 0.32, 0, 0.25, 0.65, 0.25, solidMats.pantsVintage);
  addSolidBox(workerLeft, 0.42, 1.02, 0.15, 0.22, 0.68, 0.22, solidMats.shirtSmith);

  const wlHammerArm = new THREE.Group();
  wlHammerArm.position.set(-0.42, 1.32, 0);
  addSolidBox(wlHammerArm, 0, -0.25, 0.15, 0.22, 0.68, 0.22, solidMats.shirtSmith);
  addSolidBox(wlHammerArm, 0, -0.45, 0.55, 0.08, 0.08, 0.75, solidMats.darkWood);
  addSolidBox(wlHammerArm, 0, -0.45, 0.88, 0.26, 0.42, 0.26, solidMats.ironBright);
  workerLeft.add(wlHammerArm);

  const anvilSparks = [];
  for (let i = 0; i < 6; i++) {
    const sp = addSolidBox(worldRoot, -7.15, 2.35, -55.0, 0.12, 0.12, 0.12, solidMats.spark, false);
    anvilSparks.push({
      mesh: sp,
      vx: (hash2(i, 1, 33) - 0.5) * 1.8,
      vz: (hash2(i, 2, 33) - 0.5) * 1.8,
      phase: i * 0.3,
    });
  }

  // Sân làm việc bên phải (z = -55, x = +7.6) & Nhân vật 2 đi lại chăm sóc / nghiên cứu
  const rightWorkstation = new THREE.Group();
  rightWorkstation.position.set(7.6, 1.3, -55.0);
  addTiledBox(rightWorkstation, 0, 0.15, 0, 4.2, 0.3, 6.2, "plank");
  for (const pz of [-2.7, 2.7]) {
    addSolidBox(rightWorkstation, -1.4, 1.8, pz, 0.3, 3.2, 0.3, solidMats.darkWood);
    addSolidBox(rightWorkstation, 1.6, 1.8, pz, 0.3, 3.2, 0.3, solidMats.darkWood);
  }
  addTiledBox(rightWorkstation, 0.1, 3.5, 0, 3.8, 0.4, 6.2, "slateRoof");
  addTiledBox(rightWorkstation, 1.1, 1.1, -1.5, 1.0, 1.8, 2.2, "bookshelf");
  addTiledBox(rightWorkstation, -0.5, 0.7, -1.2, 0.9, 0.8, 1.4, "plank");
  addTiledBox(rightWorkstation, -0.5, 1.3, -1.2, 0.45, 0.5, 0.45, "lamp", { basic: true });
  addTiledBox(rightWorkstation, 0.2, 0.55, 1.8, 2.2, 0.6, 1.6, "dirt");
  addTiledBox(rightWorkstation, 0.2, 1.05, 1.8, 1.8, 0.55, 1.2, "leaves");
  worldRoot.add(rightWorkstation);

  const workerRight = new THREE.Group();
  workerRight.position.set(7.2, 1.6, -55.0);
  worldRoot.add(workerRight);

  const wrHead = new THREE.Group();
  wrHead.position.set(0, 1.45, 0);
  addSolidBox(wrHead, 0, 0.3, 0, 0.58, 0.58, 0.58, solidMats.skin);
  addSolidBox(wrHead, 0, 0.56, 0, 0.62, 0.24, 0.62, solidMats.hairAuburn);
  workerRight.add(wrHead);

  addSolidBox(workerRight, 0, 1.0, 0, 0.56, 0.78, 0.34, solidMats.shirtScholar);
  addSolidBox(workerRight, 0, 0.98, 0.02, 0.58, 0.7, 0.36, solidMats.vestVintage);
  const wrLegL = addSolidBox(workerRight, -0.15, 0.32, 0, 0.24, 0.65, 0.24, solidMats.pantsVintage);
  const wrLegR = addSolidBox(workerRight, 0.15, 0.32, 0, 0.24, 0.65, 0.24, solidMats.pantsVintage);
  const wrArmL = addSolidBox(workerRight, -0.4, 1.02, 0, 0.22, 0.66, 0.22, solidMats.shirtScholar);
  const wrArmR = new THREE.Group();
  wrArmR.position.set(0.4, 1.3, 0);
  addSolidBox(wrArmR, 0, -0.25, 0.15, 0.22, 0.66, 0.22, solidMats.shirtScholar);
  addSolidBox(wrArmR, 0, -0.42, 0.45, 0.35, 0.12, 0.45, solidMats.hatBand);
  workerRight.add(wrArmR);

  // -------------------------------------------------------------------------
  // 6. ĐÀN ĐỘNG VẬT ĐI DẠO XUNG QUANH HAI BỜ
  // -------------------------------------------------------------------------
  const walkingAnimals = [];
  function spawnWalkingQuadruped(type, x, y, z, walkRadius, speed, phase) {
    const g = new THREE.Group();
    g.position.set(x, y, z);

    let legMat = solidMats.darkWood;
    if (type === "sheep") {
      addSolidBox(g, 0, 0.62, 0, 0.85, 0.7, 1.2, solidMats.sheepWool);
      addSolidBox(g, 0, 0.84, 0.62, 0.5, 0.5, 0.5, solidMats.skin);
    } else if (type === "cow") {
      addSolidBox(g, 0, 0.72, 0, 0.95, 0.82, 1.4, solidMats.cowBrown);
      addSolidBox(g, 0.02, 0.78, 0.1, 0.98, 0.5, 0.55, solidMats.cowSpot);
      addSolidBox(g, 0, 0.95, 0.78, 0.58, 0.58, 0.58, solidMats.cowBrown);
      addSolidBox(g, -0.32, 1.25, 0.8, 0.12, 0.24, 0.12, solidMats.white);
      addSolidBox(g, 0.32, 1.25, 0.8, 0.12, 0.24, 0.12, solidMats.white);
    } else if (type === "fox") {
      addSolidBox(g, 0, 0.45, 0, 0.55, 0.48, 0.95, solidMats.foxOrange);
      addSolidBox(g, 0, 0.62, 0.52, 0.48, 0.44, 0.48, solidMats.foxOrange);
      addSolidBox(g, 0, 0.52, 0.8, 0.24, 0.2, 0.28, solidMats.white);
      addSolidBox(g, -0.16, 0.88, 0.5, 0.14, 0.2, 0.1, solidMats.foxOrange);
      addSolidBox(g, 0.16, 0.88, 0.5, 0.14, 0.2, 0.1, solidMats.foxOrange);
      addSolidBox(g, 0, 0.45, -0.68, 0.32, 0.32, 0.55, solidMats.foxOrange);
      legMat = solidMats.apronLeather;
    }

    const legFL = addSolidBox(g, -0.24, 0.22, 0.38, 0.2, 0.44, 0.2, legMat);
    const legFR = addSolidBox(g, 0.24, 0.22, 0.38, 0.2, 0.44, 0.2, legMat);
    const legBL = addSolidBox(g, -0.24, 0.22, -0.38, 0.2, 0.44, 0.2, legMat);
    const legBR = addSolidBox(g, 0.24, 0.22, -0.38, 0.2, 0.44, 0.2, legMat);

    worldRoot.add(g);
    walkingAnimals.push({
      group: g,
      legs: [legFL, legFR, legBL, legBR],
      baseX: x,
      baseZ: z,
      walkRadius,
      speed,
      phase,
    });
  }

  spawnWalkingQuadruped("sheep", -8.0, 1.3, 8.2, 2.2, 0.7, 0.3);
  spawnWalkingQuadruped("sheep", 8.4, 1.3, -8.5, 2.5, 0.65, 1.9);
  spawnWalkingQuadruped("fox", -7.8, 1.3, -29.0, 3.2, 1.1, 0.8);
  spawnWalkingQuadruped("cow", 8.5, 1.3, -31.0, 2.4, 0.55, 2.4);
  spawnWalkingQuadruped("cow", -8.6, 1.3, -48.5, 2.8, 0.6, 0.5);
  spawnWalkingQuadruped("sheep", -7.5, 1.3, -63.0, 2.6, 0.75, 1.7);
  spawnWalkingQuadruped("fox", -8.4, 1.3, -70.0, 3.4, 1.15, 2.9);
  spawnWalkingQuadruped("sheep", 8.4, 1.3, -47.5, 2.6, 0.7, 1.2);
  spawnWalkingQuadruped("cow", 8.2, 1.3, -63.5, 2.8, 0.6, 3.1);
  spawnWalkingQuadruped("fox", 7.8, 1.3, -71.0, 3.2, 1.05, 0.4);

  const chickens = [];
  function spawnChicken(x, y, z, phase) {
    const ch = new THREE.Group();
    ch.position.set(x, y, z);
    addSolidBox(ch, 0, 0.28, 0, 0.42, 0.36, 0.52, solidMats.white);
    const head = new THREE.Group();
    head.position.set(0, 0.48, 0.22);
    addSolidBox(head, 0, 0.1, 0, 0.28, 0.3, 0.28, solidMats.white);
    addSolidBox(head, 0, 0.1, 0.2, 0.16, 0.1, 0.16, solidMats.duckBeak);
    addSolidBox(head, 0, 0.28, 0, 0.1, 0.12, 0.18, solidMats.bobberRed);
    ch.add(head);
    worldRoot.add(ch);
    chickens.push({ group: ch, head, baseX: x, baseZ: z, phase });
  }
  spawnChicken(-6.9, 1.3, -51.5, 0.2);
  spawnChicken(-8.8, 1.3, -59.5, 1.6);
  spawnChicken(6.9, 1.3, -51.0, 0.9);
  spawnChicken(8.7, 1.3, -60.0, 2.5);

  const bees = [];
  function spawnBee(x, y, z, phase) {
    const b = new THREE.Group();
    b.position.set(x, y, z);
    addSolidBox(b, 0, 0, 0, 0.32, 0.28, 0.42, solidMats.beeYellow, false);
    addSolidBox(b, 0, 0.01, 0, 0.34, 0.29, 0.14, solidMats.darkWood, false);
    addSolidBox(b, -0.22, 0.16, 0, 0.24, 0.04, 0.22, solidMats.white, false);
    addSolidBox(b, 0.22, 0.16, 0, 0.24, 0.04, 0.22, solidMats.white, false);
    worldRoot.add(b);
    bees.push({ group: b, baseX: x, baseY: y, baseZ: z, phase });
  }
  spawnBee(7.8, 2.8, -53.2, 0.0);
  spawnBee(8.5, 3.1, -56.5, 2.1);
  spawnBee(-7.8, 2.9, -62.0, 1.4);
  spawnBee(7.5, 2.7, -66.0, 3.5);

  const smokePuffs = [];
  for (let i = 0; i < 8; i++) {
    const s = addSolidBox(worldRoot, -13.2, 8.2 + i * 0.9, -0.2, 0.5, 0.5, 0.5, solidMats.smoke, false);
    smokePuffs.push({ mesh: s, offset: i * 0.8 });
  }

  const ducks = [];
  function spawnDuck(x, z, speed, phase) {
    const d = new THREE.Group();
    d.position.set(x, -0.08, z);
    addSolidBox(d, 0, 0.14, 0, 0.5, 0.32, 0.72, solidMats.duckBody);
    addSolidBox(d, 0, 0.4, 0.24, 0.34, 0.34, 0.34, solidMats.duckHead);
    addSolidBox(d, 0, 0.36, 0.46, 0.22, 0.12, 0.22, solidMats.duckBeak);
    worldRoot.add(d);
    ducks.push({ mesh: d, baseX: x, baseZ: z, speed, phase });
  }
  spawnDuck(-1.2, -3, 0.65, 0);
  spawnDuck(1.4, -15, 0.55, 2.1);
  spawnDuck(-1.0, -29, 0.6, 4.0);
  spawnDuck(1.5, -48, 0.58, 1.3);
  spawnDuck(-1.2, -58, 0.62, 2.8);
  spawnDuck(1.2, -68, 0.56, 0.9);

  const fishes = [];
  function spawnFish(x, z, phase) {
    const f = new THREE.Group();
    f.position.set(x, -0.5, z);
    addSolidBox(f, 0, 0, 0, 0.2, 0.26, 0.6, solidMats.fishSalmon);
    addSolidBox(f, 0, 0, -0.38, 0.1, 0.32, 0.22, solidMats.bobberRed);
    worldRoot.add(f);
    fishes.push({ mesh: f, baseX: x, baseZ: z, phase });
  }
  spawnFish(0.8, 2.2, 0.5);
  spawnFish(-1.4, -11, 2.2);
  spawnFish(0.5, -25, 4.1);
  spawnFish(-1.0, -54, 1.4);
  spawnFish(0.8, -64, 3.3);

  const sunMotes = [];
  for (let i = 0; i < 42; i++) {
    const fx = (hash2(i, 2, 15) - 0.5) * 24;
    const fy = 1.6 + hash2(i, 3, 15) * 5.5;
    const fz = 11 - hash2(i, 4, 15) * 92;
    const m = addSolidBox(worldRoot, fx, fy, fz, 0.14, 0.14, 0.14, solidMats.firefly, false);
    sunMotes.push({ mesh: m, baseX: fx, baseY: fy, phase: i * 0.7 });
  }

  // -------------------------------------------------------------------------
  // 7. CHUYỂN ĐỔI THỜI GIAN SHADER & VÒNG LẶP ANIMATION
  // -------------------------------------------------------------------------
  let timeMode = 0;
  function cycleTimeMode() {
    timeMode = (timeMode + 1) % 3;
    if (timeMode === 0) {
      skyMat.uniforms.uZenithColor.value.setHex(0x3a6ea5);
      skyMat.uniforms.uHorizonColor.value.setHex(0xe8d5b7);
      skyMat.uniforms.uSunColor.value.setHex(0xfff1c9);
      skyMat.uniforms.uSunDir.value.set(0.45, 0.42, -0.78).normalize();
      waterMat.uniforms.uSkyColor.value.setHex(0x9bc4d9);
      waterMat.uniforms.uSunColor.value.setHex(0xffe8b3);
      scene.fog.color.setHex(0xd6cfc2);
      hemiLight.intensity = 0.74;
      sunLight.intensity = 1.35;
      sunLight.color.setHex(0xffe6bd);
    } else if (timeMode === 1) {
      skyMat.uniforms.uZenithColor.value.setHex(0x2c365e);
      skyMat.uniforms.uHorizonColor.value.setHex(0xe88554);
      skyMat.uniforms.uSunColor.value.setHex(0xffb86c);
      skyMat.uniforms.uSunDir.value.set(0.25, 0.18, -0.95).normalize();
      waterMat.uniforms.uSkyColor.value.setHex(0xd98a6c);
      waterMat.uniforms.uSunColor.value.setHex(0xffae52);
      scene.fog.color.setHex(0xd49574);
      hemiLight.intensity = 0.55;
      sunLight.intensity = 1.15;
      sunLight.color.setHex(0xff9d5c);
    } else {
      skyMat.uniforms.uZenithColor.value.setHex(0x0b1326);
      skyMat.uniforms.uHorizonColor.value.setHex(0x1e3252);
      skyMat.uniforms.uSunColor.value.setHex(0x9ec5ff);
      skyMat.uniforms.uSunDir.value.set(-0.3, 0.5, -0.8).normalize();
      waterMat.uniforms.uSkyColor.value.setHex(0x1f3654);
      waterMat.uniforms.uSunColor.value.setHex(0x9ec5ff);
      scene.fog.color.setHex(0x16243b);
      hemiLight.intensity = 0.26;
      sunLight.intensity = 0.35;
      sunLight.color.setHex(0x7ca6e8);
    }
    return timeMode;
  }

  let pointerOffsetX = 0;
  let pointerOffsetY = 0;
  window.addEventListener(
    "pointermove",
    (e) => {
      pointerOffsetX = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      pointerOffsetY = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
    },
    { passive: true }
  );

  function resize() {
    const w = window.innerWidth || canvas.clientWidth || 1024;
    const h = window.innerHeight || canvas.clientHeight || 640;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  let paused = false;
  let smoothScroll = 0;
  let lastTime = performance.now();

  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    if (paused) return;

    const t = now * 0.001;
    skyMat.uniforms.uTime.value = t;
    waterMat.uniforms.uTime.value = t;

    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const targetScroll = Math.min(1, Math.max(0, window.scrollY / maxScroll));
    smoothScroll += (targetScroll - smoothScroll) * Math.min(1, dt * 5);

    const camZ = 13.5 - smoothScroll * 56.5;
    const camX = riverCurveX(camZ) * 0.65 + pointerOffsetX * 1.2;
    const camY = 5.2 + Math.sin(smoothScroll * Math.PI) * 1.8 - pointerOffsetY * 0.6;

    camera.position.set(camX, camY, camZ);
    camera.lookAt(
      riverCurveX(camZ - 14.5) * 0.55 + pointerOffsetX * 1.6,
      2.1 + Math.sin(smoothScroll * Math.PI) * 0.7 - pointerOffsetY * 0.8,
      camZ - 14.5
    );
    skyDome.position.copy(camera.position);
    warmLanternLight.position.set(0, 4.8, camZ - 11);

    for (const ww of waterwheels) {
      ww.rotation.x = t * 0.65;
    }

    for (const c of swayingCanopies) {
      c.mesh.rotation.z = Math.sin(t * 1.4 + c.phase) * 0.035;
      c.mesh.rotation.x = Math.cos(t * 1.1 + c.phase) * 0.025;
    }

    // Bèo tấm & Hoa súng nhấp nhô theo sóng nước
    for (const fl of floatingFlora) {
      fl.mesh.position.y = -0.14 + Math.sin(t * 2.2 + fl.phase) * 0.035;
    }

    // Lau sậy, cỏ cao & hoa dại đung đưa trong gió
    for (const sr of swayingReeds) {
      sr.mesh.rotation.z = Math.sin(t * 2.0 + sr.phase) * 0.07;
    }

    for (const sp of smokePuffs) {
      const cycle = (t * 0.7 + sp.offset) % 4.5;
      sp.mesh.position.y = 8.0 + cycle * 1.1;
      sp.mesh.position.x = -13.2 + Math.sin(t + sp.offset) * 0.35;
      const sc = 0.35 + cycle * 0.14;
      sp.mesh.scale.set(sc, sc, sc);
    }

    // Steve câu cá ở đầu sông
    steveHead.rotation.y = Math.sin(t * 0.8) * 0.18;
    steveLegL.rotation.x = Math.sin(t * 1.8) * 0.22;
    steveLegR.rotation.x = -Math.sin(t * 1.8) * 0.22;

    const biteCycle = Math.sin(t * 1.6) * Math.sin(t * 4.1);
    const isBite = biteCycle > 0.74;
    steveRightArm.rotation.x = isBite ? -0.28 : Math.sin(t * 1.5) * 0.06;
    const bobberY = -0.15 + Math.sin(t * 3.2) * 0.06 - (isBite ? 0.16 : 0);
    bobberGroup.position.y = bobberY;

    const posArr = fishingLine.geometry.attributes.position.array;
    posArr[7] = bobberY + 0.14;
    fishingLine.geometry.attributes.position.needsUpdate = true;

    // Nhân vật 1 đập búa rèn bên bờ trái cuối sông
    const hammerSwing = Math.sin(t * 6.5);
    wlHammerArm.rotation.x = -0.55 + hammerSwing * 0.65;
    wlHead.rotation.x = Math.max(0, hammerSwing) * 0.18;
    wlHead.rotation.y = Math.sin(t * 1.2) * 0.15;

    for (const sp of anvilSparks) {
      const sparkTime = (t * 2.2 + sp.phase) % 1.0;
      sp.mesh.position.set(
        -7.15 + sp.vx * sparkTime * 0.6,
        2.25 + Math.sin(sparkTime * Math.PI) * 0.75,
        -55.0 + sp.vz * sparkTime * 0.6
      );
      const sScale = (1.0 - sparkTime) * 0.16;
      sp.mesh.scale.set(sScale, sScale, sScale);
    }

    // Nhân vật 2 đi lại nghiên cứu & chăm sóc vườn bên bờ phải cuối sông
    const walkPhase = t * 1.4;
    const zOffset = Math.sin(walkPhase) * 1.6;
    const movingForward = Math.cos(walkPhase) >= 0;
    workerRight.position.z = -55.0 + zOffset;
    workerRight.rotation.y = movingForward ? -0.35 : Math.PI + 0.35;
    wrLegL.rotation.x = Math.sin(t * 5.0) * 0.45;
    wrLegR.rotation.x = -Math.sin(t * 5.0) * 0.45;
    wrArmL.rotation.x = -Math.sin(t * 5.0) * 0.35;
    wrArmR.rotation.x = -0.3 + Math.sin(t * 3.5) * 0.25;
    wrHead.rotation.y = Math.sin(t * 1.5) * 0.22;

    for (const a of walkingAnimals) {
      const wt = t * a.speed + a.phase;
      const dz = Math.sin(wt) * a.walkRadius;
      const dx = Math.cos(wt * 0.7) * (a.walkRadius * 0.32);
      a.group.position.z = a.baseZ + dz;
      a.group.position.x = a.baseX + dx;

      const vz = Math.cos(wt) * a.walkRadius;
      const vx = -Math.sin(wt * 0.7) * (a.walkRadius * 0.32 * 0.7);
      a.group.rotation.y = Math.atan2(vx, vz);

      const step = Math.sin(t * 5.5 + a.phase) * 0.42;
      a.legs[0].rotation.x = step;
      a.legs[1].rotation.x = -step;
      a.legs[2].rotation.x = -step;
      a.legs[3].rotation.x = step;
    }

    for (const ch of chickens) {
      const ct = t * 1.3 + ch.phase;
      ch.group.position.z = ch.baseZ + Math.sin(ct) * 1.2;
      ch.group.position.x = ch.baseX + Math.cos(ct * 1.4) * 0.8;
      ch.group.rotation.y = Math.cos(ct) > 0 ? 0.2 : Math.PI - 0.2;
      ch.head.rotation.x = Math.abs(Math.sin(t * 7.5 + ch.phase)) * 0.55;
    }

    for (const b of bees) {
      const bt = t * 2.2 + b.phase;
      b.group.position.x = b.baseX + Math.cos(bt) * 1.1;
      b.group.position.z = b.baseZ + Math.sin(bt) * 1.1;
      b.group.position.y = b.baseY + Math.sin(t * 4.5 + b.phase) * 0.25;
      b.group.rotation.y = -bt;
    }

    for (const d of ducks) {
      const zNow = d.baseZ + Math.sin(t * d.speed + d.phase) * 3.0;
      d.mesh.position.z = zNow;
      d.mesh.position.x = riverCurveX(zNow) + d.baseX + Math.cos(t * d.speed * 0.7 + d.phase) * 0.7;
      d.mesh.rotation.y = Math.cos(t * d.speed + d.phase) > 0 ? 0.2 : Math.PI - 0.2;
    }

    for (const f of fishes) {
      const jump = Math.sin(t * 2.0 + f.phase);
      if (jump > 0) {
        f.mesh.position.y = -0.2 + jump * 1.4;
        f.mesh.position.z = f.baseZ + Math.cos(t * 2.0 + f.phase) * 1.1;
        f.mesh.rotation.x = -Math.cos(t * 2.0 + f.phase) * 0.85;
      } else {
        f.mesh.position.y = -0.9;
      }
    }

    for (const m of sunMotes) {
      m.mesh.position.x = m.baseX + Math.sin(t * 1.2 + m.phase) * 0.8;
      m.mesh.position.y = m.baseY + Math.cos(t * 1.5 + m.phase) * 0.5;
    }

    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);

  return {
    setPapers() {},
    setPaused(v) {
      paused = !!v;
    },
    cycleTimeMode,
  };
}
