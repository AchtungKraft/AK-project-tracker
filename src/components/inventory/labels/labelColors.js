// Storage label colors: presets, HEX validation and print-contrast darkening.
export const PRESET_COLORS = [
  { name: 'Blue', hex: '#2563eb' },
  { name: 'Purple', hex: '#7c3aed' },
  { name: 'Green', hex: '#16a34a' },
  { name: 'Red', hex: '#dc2626' },
  { name: 'Orange', hex: '#ea580c' },
  { name: 'Gray', hex: '#6b7280' },
  { name: 'Teal', hex: '#0d9488' },
  { name: 'Pink', hex: '#db2777' },
  { name: 'Yellow', hex: '#ca8a04' },
  { name: 'Brown', hex: '#92400e' },
];

/** Minimum contrast against white: panel/header text, and QR modules on white. */
export const PANEL_MIN_CONTRAST = 4.5;
export const QR_MIN_CONTRAST = 7;

export function normalizeHex(value) {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(value || '').trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  return '#' + h.toLowerCase();
}

const toRgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');

function luminance(hex) {
  const [r, g, b] = toRgb(hex).map(v => v / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const contrastWithWhite = (hex) => 1.05 / (luminance(hex) + 0.05);

/** Darken a color (keeping its hue) until it reaches minRatio contrast against white. */
export function inkFor(hex, minRatio) {
  let h = normalizeHex(hex) || '#6b7280';
  let rgb = toRgb(h);
  for (let i = 0; i < 60 && contrastWithWhite(h) < minRatio; i++) {
    rgb = rgb.map(v => Math.floor(v * 0.93));
    h = toHex(rgb);
  }
  return h;
}