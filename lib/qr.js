'use strict';
/*
 * Tiny dependency-free QR code generator (byte mode, error level L, versions 1-10).
 * Enough for URLs up to ~270 characters. Returns a boolean matrix or an SVG string.
 */

// [total codewords, ec codewords per block, number of blocks]
const VERSIONS = [
  null,
  [26, 7, 1], [44, 10, 1], [70, 15, 1], [100, 20, 1], [134, 26, 1],
  [172, 18, 2], [196, 20, 2], [242, 24, 2], [292, 30, 2], [346, 18, 4],
];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

// ---- Galois field GF(256) helpers for Reed-Solomon ----
const EXP = new Array(512), LOG = new Array(256);
(function () {
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
function gmul(a, b) { return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]; }

function rsGenerator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gmul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly; // leading coefficient first
}
function rsRemainder(data, degree) {
  const gen = rsGenerator(degree);
  const res = data.concat(new Array(degree).fill(0));
  for (let i = 0; i < data.length; i++) {
    const f = res[i];
    if (f !== 0) for (let j = 1; j < gen.length; j++) res[i + j] ^= gmul(gen[j], f);
  }
  return res.slice(data.length);
}

function utf8(str) { return Array.from(Buffer.from(String(str), 'utf8')); }

function encodeData(text) {
  const bytes = utf8(text);
  let version = 0;
  for (let v = 1; v <= 10; v++) {
    const [total, ec, blocks] = VERSIONS[v];
    const capacityBits = (total - ec * blocks) * 8;
    const need = 4 + (v < 10 ? 8 : 16) + bytes.length * 8;
    if (need <= capacityBits) { version = v; break; }
  }
  if (!version) throw new Error('Text too long for QR code');
  const [total, ecLen, numBlocks] = VERSIONS[version];
  const dataLen = total - ecLen * numBlocks;

  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  push(4, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  bytes.forEach(b => push(b, 8));
  push(0, Math.min(4, dataLen * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    data.push(b);
  }
  for (let pad = 0xec; data.length < dataLen; pad ^= 0xec ^ 0x11) data.push(pad);

  // split into blocks, add error correction, interleave
  const shortLen = Math.floor(dataLen / numBlocks);
  const longBlocks = dataLen % numBlocks;
  const blocks = [], ecs = [];
  let k = 0;
  for (let b = 0; b < numBlocks; b++) {
    const len = shortLen + (b >= numBlocks - longBlocks ? 1 : 0);
    const blk = data.slice(k, k + len); k += len;
    blocks.push(blk); ecs.push(rsRemainder(blk, ecLen));
  }
  const out = [];
  for (let i = 0; i <= shortLen; i++) blocks.forEach(blk => { if (i < blk.length) out.push(blk[i]); });
  for (let i = 0; i < ecLen; i++) ecs.forEach(e => out.push(e[i]));
  return { version, codewords: out };
}

function matrix(text) {
  const { version, codewords } = encodeData(text);
  const size = version * 4 + 17;
  const m = [], fn = [];
  for (let i = 0; i < size; i++) { m.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
  const set = (x, y, dark) => { m[y][x] = dark; fn[y][x] = true; };

  // timing
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  // finders
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  // alignment
  const pos = ALIGN[version];
  for (const cy of pos) for (const cx of pos) {
    if ((cx === 6 && cy === 6) || (cx === 6 && cy === size - 7) || (cx === size - 7 && cy === 6)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
      set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  // format bits (level L = 1)
  const drawFormat = (mask) => {
    const data = (1 << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = i => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0);
  // version info
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3), b = Math.floor(i / 3);
      set(a, b, dark); set(b, a, dark);
    }
  }
  // data, zig-zag
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j;
      const upward = ((right + 1) & 2) === 0;
      const y = upward ? size - 1 - vert : vert;
      if (!fn[y][x] && i < codewords.length * 8) {
        m[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
        i++;
      }
    }
  }
  // masking: try all 8, keep the lowest penalty
  const maskFn = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
    (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0,
  ];
  const applyMask = (k) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++)
      if (!fn[y][x] && maskFn[k](x, y)) m[y][x] = !m[y][x];
  };
  const penalty = () => {
    let p = 0, dark = 0;
    for (let y = 0; y < size; y++) {
      let runR = 1, runC = 1;
      for (let x = 0; x < size; x++) {
        if (m[y][x]) dark++;
        if (x > 0) {
          if (m[y][x] === m[y][x - 1]) { runR++; if (runR === 5) p += 3; else if (runR > 5) p++; } else runR = 1;
          if (m[x][y] === m[x - 1][y]) { runC++; if (runC === 5) p += 3; else if (runC > 5) p++; } else runC = 1;
        }
        if (x < size - 1 && y < size - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
      }
    }
    const pat = [true, false, true, true, true, false, true];
    for (let y = 0; y < size; y++) for (let x = 0; x + 6 < size; x++) {
      let r = true, c = true;
      for (let k = 0; k < 7; k++) { if (m[y][x + k] !== pat[k]) r = false; if (m[x + k][y] !== pat[k]) c = false; }
      if (r) p += 40; if (c) p += 40;
    }
    p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return p;
  };
  let best = 0, bestP = Infinity;
  for (let k = 0; k < 8; k++) {
    applyMask(k); drawFormat(k);
    const p = penalty();
    if (p < bestP) { bestP = p; best = k; }
    applyMask(k);
  }
  applyMask(best); drawFormat(best);
  return m;
}

function svg(text, opts) {
  opts = opts || {};
  const m = matrix(text), n = m.length, q = 3; // quiet zone
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) d += `M${x + q} ${y + q}h1v1h-1z`;
  const s = n + q * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" shape-rendering="crispEdges">` +
    `<rect width="${s}" height="${s}" fill="${opts.light || '#fff'}"/><path d="${d}" fill="${opts.dark || '#000'}"/></svg>`;
}

module.exports = { matrix, svg };
