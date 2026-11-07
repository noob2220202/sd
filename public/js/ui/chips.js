// 칩 더미 / 칩 스택 SVG 그래픽. 금액에 따라 칩 개수와 색을 달리한다.
import { svgEl } from './dom.js';

// 칩 단위별 색 (큰 단위부터)
const DENOMS = [
  [1_000_000, '#2b2b2b', '#d4af37'],
  [100_000, '#5e2a84', '#e9d7ff'],
  [10_000, '#1f5fa8', '#dbe9ff'],
  [1_000, '#b3261e', '#ffd9d6'],
  [100, '#2e7d4f', '#dcf5e3'],
  [1, '#e8e2d2', '#7a6f55'],
];

function denomOf(amount) {
  for (const d of DENOMS) if (amount >= d[0]) return d;
  return DENOMS[DENOMS.length - 1];
}

function chipSvg(cx, cy, r, fill, edge) {
  const ry = r * 0.42;
  return `<g>
    <ellipse cx="${cx}" cy="${cy + r * 0.26}" rx="${r}" ry="${ry}" fill="${shade(fill)}"/>
    <rect x="${cx - r}" y="${cy}" width="${r * 2}" height="${r * 0.26}" fill="${shade(fill)}"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${ry}" fill="${fill}" stroke="${edge}" stroke-width="${r * 0.08}" stroke-dasharray="${r * 0.45} ${r * 0.35}"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${r * 0.55}" ry="${ry * 0.55}" fill="none" stroke="${edge}" stroke-width="${r * 0.06}" opacity="0.8"/>
  </g>`;
}

function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 255) - 40);
  const g = Math.max(0, ((n >> 8) & 255) - 40);
  const b = Math.max(0, (n & 255) - 40);
  return `rgb(${r},${g},${b})`;
}

/**
 * 좌석 앞 베팅 칩 스택. amount 에 비례해 1~6개.
 */
export function chipStack(amount, base = 10_000) {
  const n = amount <= 0 ? 0 : Math.max(1, Math.min(6, Math.round(Math.log2(amount / base + 1)) + 1));
  const [, fill, edge] = denomOf(amount);
  const r = 11;
  let g = '';
  for (let i = 0; i < n; i++) g += chipSvg(14, 34 - i * 4, r, fill, edge);
  return svgEl(`<svg class="chip-stack" viewBox="0 0 28 44" width="28" height="44" aria-hidden="true">${g}</svg>`);
}

/**
 * 테이블 중앙 판돈 더미. 금액에 따라 스택 수(1~5)와 높이가 늘어난다.
 */
export function chipPile(amount, startChips = 1_000_000) {
  if (amount <= 0) return svgEl('<svg class="chip-pile" viewBox="0 0 160 70" width="160" height="70" aria-hidden="true"></svg>');
  const ratio = amount / Math.max(1, startChips);
  const stacks = Math.max(1, Math.min(5, Math.ceil(ratio * 4)));
  const perStack = Math.max(2, Math.min(9, Math.round(2 + ratio * 8)));
  const xs = [80, 52, 108, 30, 130];
  const palette = [DENOMS[0], DENOMS[1], DENOMS[2], DENOMS[3], DENOMS[4]];
  let g = '';
  // 뒤쪽 스택부터 그려 앞이 덮이게
  const order = [...Array(stacks).keys()].sort((a, b) => (b % 2) - (a % 2));
  for (const s of order) {
    const [, fill, edge] = palette[(s + 1) % palette.length];
    const n = Math.max(2, perStack - (s % 3));
    for (let i = 0; i < n; i++) g += chipSvg(xs[s], 56 - i * 3.6 - (s % 2) * 4, 13, fill, edge);
  }
  return svgEl(`<svg class="chip-pile" viewBox="0 0 160 70" width="160" height="70" aria-hidden="true">${g}</svg>`);
}

/** 날아가는 칩 1개 (결과 애니메이션용) */
export function flyingChip() {
  const [, fill, edge] = DENOMS[0];
  return svgEl(`<svg class="fly-chip" viewBox="0 0 28 28" width="22" height="22" aria-hidden="true">
    <circle cx="14" cy="14" r="12" fill="${fill}" stroke="${edge}" stroke-width="1.5" stroke-dasharray="5 4"/>
    <circle cx="14" cy="14" r="6" fill="none" stroke="${edge}" stroke-width="1.2"/></svg>`);
}
