import React, { useMemo } from "react";

/**
 * Minimal QR Code SVG generator — fully local, no external dependencies.
 * Implements a simplified QR encoding sufficient for short text payloads
 * (location IDs, short URLs). Uses Mode Byte, ECC Level L, versions 1-6.
 */

// GF(256) math for Reed-Solomon
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x = x << 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGenPoly(nsym) {
  let g = [1];
  for (let i = 0; i < nsym; i++) {
    const ng = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      ng[j] ^= g[j];
      ng[j + 1] ^= gfMul(g[j], GF_EXP[i]);
    }
    g = ng;
  }
  return g;
}

function rsEncode(data, nsym) {
  const gen = rsGenPoly(nsym);
  const out = new Uint8Array(data.length + nsym);
  out.set(data);
  for (let i = 0; i < data.length; i++) {
    const coef = out[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        out[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return out.slice(data.length);
}

// QR version capacities for byte mode, ECC L
const VERSION_CAPS = [0, 17, 32, 53, 78, 106, 134];
const ECC_CODEWORDS = [0, 7, 10, 15, 20, 26, 36];
const DATA_CODEWORDS = [0, 19, 34, 55, 80, 108, 136];

function getVersion(len) {
  for (let v = 1; v <= 6; v++) {
    if (len <= VERSION_CAPS[v]) return v;
  }
  return 6; // clamp
}

function encodeData(text) {
  const bytes = new TextEncoder().encode(text);
  const version = getVersion(bytes.length);
  const totalDataCW = DATA_CODEWORDS[version];
  const eccCW = ECC_CODEWORDS[version];
  const size = version * 4 + 17;

  // Build data bits: mode(4) + count(8) + data + terminator + padding
  const bits = [];
  const pushBits = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  pushBits(0b0100, 4); // byte mode
  pushBits(bytes.length, 8);
  bytes.forEach(b => pushBits(b, 8));
  // terminator
  const totalBits = totalDataCW * 8;
  const termLen = Math.min(4, totalBits - bits.length);
  for (let i = 0; i < termLen; i++) bits.push(0);
  // align to byte
  while (bits.length % 8 !== 0) bits.push(0);
  // pad
  const pads = [0xEC, 0x11];
  let pi = 0;
  while (bits.length < totalBits) {
    pushBits(pads[pi % 2], 8);
    pi++;
  }

  // Convert to codewords
  const dataCW = new Uint8Array(totalDataCW);
  for (let i = 0; i < totalDataCW; i++) {
    let val = 0;
    for (let b = 0; b < 8; b++) val = (val << 1) | (bits[i * 8 + b] || 0);
    dataCW[i] = val;
  }

  const ecc = rsEncode(dataCW, eccCW);
  return { version, size, dataCW, ecc };
}

function createMatrix(size) {
  return Array.from({ length: size }, () => ({ val: 0, fixed: false }));
}

function placeFinderPattern(grid, size, row, col) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r, cc = col + c;
      if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
      const idx = rr * size + cc;
      if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[idx].val = (isBorder || isInner) ? 1 : 0;
        grid[idx].fixed = true;
      } else {
        grid[idx].val = 0;
        grid[idx].fixed = true;
      }
    }
  }
}

function placeTimingPatterns(grid, size) {
  for (let i = 8; i < size - 8; i++) {
    const hIdx = 6 * size + i;
    if (!grid[hIdx].fixed) { grid[hIdx].val = i % 2 === 0 ? 1 : 0; grid[hIdx].fixed = true; }
    const vIdx = i * size + 6;
    if (!grid[vIdx].fixed) { grid[vIdx].val = i % 2 === 0 ? 1 : 0; grid[vIdx].fixed = true; }
  }
}

function reserveFormatInfo(grid, size) {
  // Row 8
  for (let c = 0; c <= 8; c++) {
    const idx = 8 * size + c;
    if (!grid[idx].fixed) grid[idx].fixed = true;
  }
  for (let c = size - 8; c < size; c++) {
    const idx = 8 * size + c;
    if (!grid[idx].fixed) grid[idx].fixed = true;
  }
  // Col 8
  for (let r = 0; r <= 8; r++) {
    const idx = r * size + 8;
    if (!grid[idx].fixed) grid[idx].fixed = true;
  }
  for (let r = size - 7; r < size; r++) {
    const idx = r * size + 8;
    if (!grid[idx].fixed) grid[idx].fixed = true;
  }
  // Dark module
  grid[(size - 8) * size + 8].val = 1;
  grid[(size - 8) * size + 8].fixed = true;
}

const ALIGNMENT_POSITIONS = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]];

function placeAlignmentPatterns(grid, size, version) {
  if (version < 2) return;
  const positions = ALIGNMENT_POSITIONS[version];
  for (const row of positions) {
    for (const col of positions) {
      // Skip if overlaps with finder patterns
      if (row <= 8 && col <= 8) continue;
      if (row <= 8 && col >= size - 8) continue;
      if (row >= size - 8 && col <= 8) continue;
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const idx = (row + r) * size + (col + c);
          const isBorder = r === -2 || r === 2 || c === -2 || c === 2;
          const isCenter = r === 0 && c === 0;
          grid[idx].val = (isBorder || isCenter) ? 1 : 0;
          grid[idx].fixed = true;
        }
      }
    }
  }
}

function placeData(grid, size, dataCW, ecc) {
  const allBytes = [...dataCW, ...ecc];
  const allBits = [];
  allBytes.forEach(b => { for (let i = 7; i >= 0; i--) allBits.push((b >> i) & 1); });

  let bitIdx = 0;
  let upward = true;
  for (let col = size - 1; col >= 0; col -= 2) {
    if (col === 6) col = 5; // skip timing column
    const rows = upward ? Array.from({ length: size }, (_, i) => size - 1 - i) : Array.from({ length: size }, (_, i) => i);
    for (const row of rows) {
      for (const dc of [0, -1]) {
        const c = col + dc;
        if (c < 0) continue;
        const idx = row * size + c;
        if (grid[idx].fixed) continue;
        grid[idx].val = bitIdx < allBits.length ? allBits[bitIdx] : 0;
        bitIdx++;
      }
    }
    upward = !upward;
  }
}

// Apply mask 0 (checkerboard) and format info for mask 0, ECC L
function applyMaskAndFormat(grid, size) {
  // Apply mask 0: (row + col) % 2 === 0
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const idx = r * size + c;
      if (!grid[idx].fixed && (r + c) % 2 === 0) {
        grid[idx].val ^= 1;
      }
    }
  }

  // Format info for ECC L (01), mask 0 (000) = 0b01000
  // After BCH and XOR mask: 0x77C0... precomputed:
  const FORMAT_BITS = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0];
  
  // Place around top-left finder
  const formatPositions1 = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
  ];
  formatPositions1.forEach(([r, c], i) => {
    grid[r * size + c].val = FORMAT_BITS[i];
  });

  // Place around other finders
  const formatPositions2 = [
    [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8],
    [size - 5, 8], [size - 6, 8], [size - 7, 8],
    [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5],
    [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1]
  ];
  formatPositions2.forEach(([r, c], i) => {
    grid[r * size + c].val = FORMAT_BITS[i];
  });
}

function generateQRMatrix(text) {
  const { version, size, dataCW, ecc } = encodeData(text);
  const grid = createMatrix(size * size);

  placeFinderPattern(grid, size, 0, 0);
  placeFinderPattern(grid, size, 0, size - 7);
  placeFinderPattern(grid, size, size - 7, 0);
  placeAlignmentPatterns(grid, size, version);
  placeTimingPatterns(grid, size);
  reserveFormatInfo(grid, size);
  placeData(grid, size, dataCW, ecc);
  applyMaskAndFormat(grid, size);

  const matrix = [];
  for (let r = 0; r < size; r++) {
    const row = [];
    for (let c = 0; c < size; c++) {
      row.push(grid[r * size + c].val);
    }
    matrix.push(row);
  }
  return { matrix, size };
}

export default function QRCodeSVG({ value, size = 120, className = "" }) {
  const qr = useMemo(() => {
    if (!value) return null;
    return generateQRMatrix(value);
  }, [value]);

  if (!qr) return null;

  const cellSize = size / (qr.size + 8); // 4-module quiet zone on each side
  const offset = cellSize * 4;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width={size} height={size} fill="white" />
      {qr.matrix.map((row, r) =>
        row.map((cell, c) =>
          cell ? (
            <rect
              key={`${r}-${c}`}
              x={offset + c * cellSize}
              y={offset + r * cellSize}
              width={cellSize}
              height={cellSize}
              fill="black"
            />
          ) : null
        )
      )}
    </svg>
  );
}

/** Render QR as an SVG string (for print windows) */
export function renderQRSVGString(value, size = 120) {
  if (!value) return '';
  const qr = generateQRMatrix(value);
  const cellSize = size / (qr.size + 8);
  const offset = cellSize * 4;
  let rects = '';
  qr.matrix.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell) {
        rects += `<rect x="${offset + c * cellSize}" y="${offset + r * cellSize}" width="${cellSize}" height="${cellSize}" fill="black"/>`;
      }
    });
  });
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" fill="white"/>${rects}</svg>`;
}