// src/components/Workspace/Visualization/ScaleGraph3D/colors.js
// OKLCH-based maximally distinguishable 12-color palette for circle of fifths
// With yellow ridge rule and E/B/F# separation

export function mapValue(n, inMin, inMax, outMin, outMax) {
  return outMin + ((n - inMin) * (outMax - outMin)) / (inMax - inMin || 1);
}

// ============ OKLCH / OKLab Color Space Conversions ============

function oklabToLinearSrgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

function linearToSrgb(x) {
  if (x <= 0.0031308) {
    return 12.92 * x;
  }
  return 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

function oklchToOklab(L, C, h) {
  const hRad = (h * Math.PI) / 180;
  return [L, C * Math.cos(hRad), C * Math.sin(hRad)];
}

function oklchToSrgb(L, C, h) {
  const [labL, labA, labB] = oklchToOklab(L, C, h);
  const [linR, linG, linB] = oklabToLinearSrgb(labL, labA, labB);
  return [
    Math.round(Math.max(0, Math.min(1, linearToSrgb(linR))) * 255),
    Math.round(Math.max(0, Math.min(1, linearToSrgb(linG))) * 255),
    Math.round(Math.max(0, Math.min(1, linearToSrgb(linB))) * 255),
  ];
}

function rgbInGamut(linR, linG, linB) {
  return linR >= 0 && linR <= 1 && linG >= 0 && linG <= 1 && linB >= 0 && linB <= 1;
}

function maxChromaInGamut(L, h, cHi = 0.4, eps = 0.001) {
  let lo = 0;
  let hi = cHi;
  while (hi - lo > eps) {
    const mid = (lo + hi) / 2;
    const [labL, labA, labB] = oklchToOklab(L, mid, h);
    const [linR, linG, linB] = oklabToLinearSrgb(labL, labA, labB);
    if (rgbInGamut(linR, linG, linB)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return lo;
}

// ============ Circle of Fifths Mapping ============

function pitchClassToFifthsIndex(pc) {
  return (pc * 7) % 12;
}

function hueDistDeg(a, b) {
  let d = ((a - b + 180) % 360) - 180;
  if (d < -180) d += 360;
  return Math.abs(d);
}

function wrap360(h) {
  return ((h % 360) + 360) % 360;
}

// OKLab Euclidean distance
function oklabDistance(lab1, lab2) {
  const dL = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

function variance(arr) {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return arr.reduce((sum, x) => sum + (x - mean) ** 2, 0) / arr.length;
}

// ============ CONFIGURATION ============

// A) Hue-dependent lightness minimum
function L_min_by_hue(h) {
  if (h >= 70 && h <= 140) return 0.80;   // yellow - needs high L
  if (h > 140 && h <= 200) return 0.60;   // green/cyan
  if (h > 200 && h <= 280) return 0.52;   // blue
  return 0.55;                             // reds/magentas
}

// Yellow ridge parameters
const YELLOW_H_LO = 70;
const YELLOW_H_HI = 140;
const L_Y_LO = 0.80;
const L_Y_HI = 0.92;
const C_Y_CAP = 0.26;

// A) Yellow ridge: jointly pick (L, C) for yellow hues
function pickYellowRidge(h) {
  let best = null;
  const steps = 30;
  for (let i = 0; i <= steps; i++) {
    const L = L_Y_LO + (L_Y_HI - L_Y_LO) * (i / steps);
    const C_max = maxChromaInGamut(L, h);
    const C = Math.min(C_max, C_Y_CAP);
    if (C <= 0.001) continue;

    // Score: maximize chroma, prefer lemon (avoid greenish)
    let score = C;
    score -= 0.15 * Math.pow(hueDistDeg(h, 105) / 20, 2);

    if (best === null || score > best.score) {
      best = { L, C, score };
    }
  }
  return best ? { L: best.L, C: best.C } : { L: 0.85, C: 0.15 };
}

// B) Special indices for E/B/F# separation
const IDX_D = 2;
const IDX_A = 3;
const IDX_E = 4;
const IDX_B = 5;
const IDX_FS = 6;
const SPECIAL_MIN_DIST = 0.10;

// Neighbor contrast floor for D-A-E run (blue/purple region)
const NEIGH_MIN_DA_AE = 0.11;

// Minimum chroma for A and E (don't let them go dull)
const C_MIN_PAIR_AE = 0.14;

// Minimum L difference between A and E
const L_DIFF_MIN_AE = 0.06;

// C) C/G separation (targeted, minimal)
const IDX_C = 0;
const IDX_G = 1;
const CG_MIN = 0.10;

// General config
const C_MIN = 0.10;

// Anchors (only for h0 orientation)
const ANCHORS = [
  { pc: 3, targetHue: 100, weight: 1 },  // D#/Eb -> yellow
  { pc: 6, targetHue: 190, weight: 1 },  // F# -> teal
  { pc: 7, targetHue: 330, weight: 2 },  // G -> pink (stronger)
  { pc: 4, targetHue: 250, weight: 1 },  // E -> blue
  { pc: 5, targetHue: 55, weight: 2 },   // F -> orange
  { pc: 10, targetHue: 90, weight: 2 },  // Bb -> yellow/gold
];

// Pinned colors: override specific pitch classes with exact OKLCH values
// fifthsIndex -> { L, C, h }
const PINNED_COLORS = {
  11: { L: 0.71, C: 0.165, h: 52 },  // F (pc=5, k=11) -> orange rgb(238,122,60)
};

function anchorLoss(h0) {
  let loss = 0;
  for (const anchor of ANCHORS) {
    const fifthsIdx = pitchClassToFifthsIndex(anchor.pc);
    const hk = wrap360(h0 + 150 - (360 * fifthsIdx) / 12);
    const dist = hueDistDeg(hk, anchor.targetHue);
    loss += anchor.weight * dist * dist;
  }
  return loss;
}

function findOptimalH0() {
  let bestH0 = 0;
  let bestLoss = Infinity;
  for (let h0 = 0; h0 < 360; h0++) {
    const loss = anchorLoss(h0);
    if (loss < bestLoss) {
      bestLoss = loss;
      bestH0 = h0;
    }
  }
  return bestH0;
}

// ============ Palette Generation ============

function generatePalette(params) {
  const { h0, L0, A2, phi2, A3, phi3, C0, A_C, phi_C } = params;
  const N = 12;
  const colors = [];

  for (let k = 0; k < N; k++) {
    const t_k = (2 * Math.PI * k) / N;

    // Hue: linear in fifths index, rotated +150° and reversed
    let h_k = wrap360(h0 + 150 - (360 * k) / N);

    let L_k, C_k;

    // 0) Check for pinned color override
    if (PINNED_COLORS[k]) {
      const pinned = PINNED_COLORS[k];
      L_k = pinned.L;
      C_k = pinned.C;
      h_k = pinned.h;
    }
    // A) Yellow ridge rule
    else if (h_k >= YELLOW_H_LO && h_k <= YELLOW_H_HI) {
      const ridge = pickYellowRidge(h_k);
      L_k = ridge.L;
      C_k = ridge.C;
    } else {
      // B) Lightness with 2-lobe + 3-lobe for E/B/F# separation
      let L_base = L0 + A2 * Math.cos(2 * t_k + phi2) + A3 * Math.cos(3 * t_k + phi3);
      L_k = Math.max(L_min_by_hue(h_k), Math.min(0.95, L_base));

      // Chroma
      const C_target = C0 + A_C * Math.sin(2 * t_k + phi_C);
      const C_max = maxChromaInGamut(L_k, h_k);
      C_k = Math.min(C_target, C_max);
    }

    const [labL, labA, labB] = oklchToOklab(L_k, C_k, h_k);
    const [r, g, b] = oklchToSrgb(L_k, C_k, h_k);

    colors.push({
      fifthsIndex: k,
      h: h_k,
      L: L_k,
      C: C_k,
      lab: [labL, labA, labB],
      rgb: [r, g, b],
    });
  }

  return colors;
}

// ============ Scoring ============

function scorePalette(colors, params) {
  const N = colors.length;

  // Mean pairwise distance
  let totalDist = 0;
  let pairCount = 0;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      totalDist += oklabDistance(colors[i].lab, colors[j].lab);
      pairCount++;
    }
  }
  const meanDist = totalDist / pairCount;

  // Neighbor smoothness
  const neighborDists = [];
  for (let k = 0; k < N; k++) {
    const next = (k + 1) % N;
    neighborDists.push(oklabDistance(colors[k].lab, colors[next].lab));
  }
  const neighborVar = variance(neighborDists);

  // Anchor loss (only for h0)
  const anchLoss = anchorLoss(params.h0);

  // Chroma/lightness variance penalties
  const chromaVar = variance(colors.map(c => c.C));
  const lightnessVar = variance(colors.map(c => c.L));

  // B) E/B/F# spread bonus
  const spread =
    Math.pow(colors[IDX_E].L - colors[IDX_B].L, 2) +
    Math.pow(colors[IDX_B].L - colors[IDX_FS].L, 2) +
    Math.pow(colors[IDX_E].L - colors[IDX_FS].L, 2);

  // B2) D-A-E spread bonus (help separate A from E)
  const spreadDAE =
    Math.pow(colors[IDX_D].L - colors[IDX_A].L, 2) +
    Math.pow(colors[IDX_A].L - colors[IDX_E].L, 2) +
    Math.pow(colors[IDX_D].L - colors[IDX_E].L, 2);

  // C) Dull penalty
  let dullPenalty = 0;
  for (const c of colors) {
    if (c.C < 0.16) {
      dullPenalty += Math.pow(0.16 - c.C, 2);
    }
  }

  // Weights
  const w_neighbor = 0.3;
  const w_anchor = 0.0005;
  const w_chromaVar = 20;
  const w_lightnessVar = 15;
  const w_spread = 2.0;
  const w_spreadDAE = 1.5;
  const w_dull = 100;

  return meanDist
    - w_neighbor * neighborVar
    - w_anchor * anchLoss
    - w_chromaVar * chromaVar
    - w_lightnessVar * lightnessVar
    + w_spread * spread
    + w_spreadDAE * spreadDAE
    - w_dull * dullPenalty;
}

// ============ Optimization ============

function optimizePalette(iterations = 20000) {
  const ranges = {
    h0: [0, 360],
    L0: [0.65, 0.78],
    A2: [0.04, 0.10],
    phi2: [0, 2 * Math.PI],
    A3: [0.02, 0.06],
    phi3: [0, 2 * Math.PI],
    C0: [0.14, 0.20],
    A_C: [0.01, 0.04],
    phi_C: [0, 2 * Math.PI],
  };

  const optimalH0 = findOptimalH0();

  let bestParams = null;
  let bestScore = -Infinity;
  let bestColors = null;
  let accepted = 0;

  for (let i = 0; i < iterations; i++) {
    const params = {
      h0: i < iterations / 2
        ? optimalH0 + (Math.random() - 0.5) * 50
        : Math.random() * 360,
      L0: ranges.L0[0] + Math.random() * (ranges.L0[1] - ranges.L0[0]),
      A2: ranges.A2[0] + Math.random() * (ranges.A2[1] - ranges.A2[0]),
      phi2: Math.random() * 2 * Math.PI,
      A3: ranges.A3[0] + Math.random() * (ranges.A3[1] - ranges.A3[0]),
      phi3: Math.random() * 2 * Math.PI,
      C0: ranges.C0[0] + Math.random() * (ranges.C0[1] - ranges.C0[0]),
      A_C: ranges.A_C[0] + Math.random() * (ranges.A_C[1] - ranges.A_C[0]),
      phi_C: Math.random() * 2 * Math.PI,
    };
    params.h0 = wrap360(params.h0);

    const colors = generatePalette(params);

    // Hard constraints
    // 1) L floor by hue
    let valid = true;
    for (const c of colors) {
      if (c.L < L_min_by_hue(c.h) - 0.01) {
        valid = false;
        break;
      }
    }
    if (!valid) continue;

    // 2) C floor (soft - very low is rejected)
    if (colors.some(c => c.C < C_MIN * 0.6)) continue;

    // 3) B) E/B/F# special min distances
    const d_EB = oklabDistance(colors[IDX_E].lab, colors[IDX_B].lab);
    const d_BFS = oklabDistance(colors[IDX_B].lab, colors[IDX_FS].lab);
    const d_EFS = oklabDistance(colors[IDX_E].lab, colors[IDX_FS].lab);
    if (d_EB < SPECIAL_MIN_DIST || d_BFS < SPECIAL_MIN_DIST || d_EFS < SPECIAL_MIN_DIST) {
      continue;
    }

    // 4) D-A and A-E neighbor contrast floor
    const d_DA = oklabDistance(colors[IDX_D].lab, colors[IDX_A].lab);
    const d_AE = oklabDistance(colors[IDX_A].lab, colors[IDX_E].lab);
    if (d_DA < NEIGH_MIN_DA_AE || d_AE < NEIGH_MIN_DA_AE) {
      continue;
    }

    // 5) A and E chroma floor (don't let them go dull)
    if (colors[IDX_A].C < C_MIN_PAIR_AE || colors[IDX_E].C < C_MIN_PAIR_AE) {
      continue;
    }

    // 6) Minimum L difference between A and E
    if (Math.abs(colors[IDX_A].L - colors[IDX_E].L) < L_DIFF_MIN_AE) {
      continue;
    }

    // 7) C/G separation (targeted, minimal)
    const d_CG = oklabDistance(colors[IDX_C].lab, colors[IDX_G].lab);
    if (d_CG < CG_MIN) {
      continue;
    }

    accepted++;
    const score = scorePalette(colors, params);

    if (score > bestScore) {
      bestScore = score;
      bestParams = params;
      bestColors = colors;
    }
  }

  console.log(`[Optimizer] Accepted ${accepted}/${iterations} candidates`);

  // Fallback
  if (!bestColors) {
    console.warn('[Optimizer] Using fallback palette');
    const fallback = {
      h0: optimalH0,
      L0: 0.72,
      A2: 0.06,
      phi2: 0,
      A3: 0.03,
      phi3: Math.PI,
      C0: 0.16,
      A_C: 0.02,
      phi_C: 0,
    };
    bestParams = fallback;
    bestColors = generatePalette(fallback);
    bestScore = scorePalette(bestColors, fallback);
  }

  return { params: bestParams, colors: bestColors, score: bestScore };
}

// ============ Cache & Lookup ============

let cachedPalette = null;

function getOptimizedPalette() {
  if (!cachedPalette) {
    const result = optimizePalette(25000);
    cachedPalette = result.colors;
    console.log('OKLCH Palette optimized:', result.params);
    console.log('Score:', result.score);
    console.log('Colors:', cachedPalette.map(c => ({
      k: c.fifthsIndex,
      h: Math.round(c.h),
      L: c.L.toFixed(2),
      C: c.C.toFixed(3),
      rgb: c.rgb
    })));
  }
  return cachedPalette;
}

function buildPitchClassColorMap() {
  const palette = getOptimizedPalette();
  const map = {};
  for (const color of palette) {
    const pc = (color.fifthsIndex * 7) % 12;
    map[pc] = color.rgb;
  }
  // Hardcoded override: F (pc=5) -> exact rgb(238, 122, 60)
  map[5] = [238, 122, 60];
  return map;
}

let colorMap = null;

function getColorMap() {
  if (!colorMap) {
    colorMap = buildPitchClassColorMap();
  }
  return colorMap;
}

// ============ Public API ============

export function hsvToRgb(h, s, v) {
  let r, g, b;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q;
  }
  return [r * 255, g * 255, b * 255];
}

export function getNodeColor(root, scaleClass) {
  if (root == null) root = 0;
  let r, g, b;

  if (scaleClass === "whole_tone") {
    const v = mapValue(root % 2, 0, 1, 200, 150);
    r = g = b = v;
  } else if (scaleClass === "octatonic") {
    const v = mapValue(root % 3, 0, 2, 200, 133);
    r = g = b = v;
  } else if (scaleClass === "hexatonic") {
    const v = mapValue(root % 4, 0, 3, 200, 100);
    r = g = b = v;
  } else {
    const map = getColorMap();
    [r, g, b] = map[root % 12] || [200, 200, 200];
  }

  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

export function getNodeColorArray(root, scaleClass) {
  if (root == null) root = 0;

  if (scaleClass === "whole_tone") {
    const v = mapValue(root % 2, 0, 1, 200, 150);
    return [v, v, v];
  } else if (scaleClass === "octatonic") {
    const v = mapValue(root % 3, 0, 2, 200, 133);
    return [v, v, v];
  } else if (scaleClass === "hexatonic") {
    const v = mapValue(root % 4, 0, 3, 200, 100);
    return [v, v, v];
  } else {
    const map = getColorMap();
    return map[root % 12] || [200, 200, 200];
  }
}

export function getFullPalette() {
  return getOptimizedPalette();
}

export function getPaletteAsHex() {
  return getOptimizedPalette().map(c => {
    const [r, g, b] = c.rgb;
    return '#' + [r, g, b].map(x =>
      Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')
    ).join('');
  });
}
