// Tiny dependency-free SVG line chart. Colors come from CSS variables so it
// follows the theme.

// Round max so that 4 grid steps land on round numbers (step is 1/2/5 × 10^k).
function niceMax(v) {
  if (v <= 0) return 4;
  const raw = v / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return Math.max(4, m * p * 4);
  return 40 * p;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * points: [{x, y, label?}]  — the main line
 * marks:  [{x, n, label?}]  — optional error marks drawn as small crosses at the bottom band
 */
export function lineChart({ points, marks = [], width, height = 200, yLabel = '', xFormat = (x) => x }) {
  const padL = 40, padR = 12, padT = 12, padB = 26;
  const w = Math.max(200, width);
  const iw = w - padL - padR;
  const ih = height - padT - padB;
  if (!points.length) {
    return `<svg width="${w}" height="${height}" role="img" aria-label="no data"><text x="${w / 2}" y="${height / 2}" text-anchor="middle" class="chart-empty">no data yet</text></svg>`;
  }
  const xs = points.map((p) => p.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const maxY = niceMax(Math.max(...points.map((p) => p.y)) * 1.05);
  const sx = (x) => padL + (maxX === minX ? iw / 2 : ((x - minX) / (maxX - minX)) * iw);
  const sy = (y) => padT + ih - (y / maxY) * ih;

  let grid = '';
  for (let i = 0; i <= 4; i++) {
    const v = (maxY / 4) * i;
    const y = sy(v);
    grid += `<line x1="${padL}" x2="${w - padR}" y1="${y}" y2="${y}" class="chart-grid"/>`;
    grid += `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" class="chart-tick">${Math.round(v)}</text>`;
  }
  // Evenly spaced x labels; the last point always gets one, right-aligned.
  const maxTicks = Math.max(2, Math.floor(iw / 60));
  const step = Math.max(1, Math.ceil(points.length / maxTicks));
  const idxs = [];
  for (let i = 0; i < points.length; i += step) idxs.push(i);
  const last = points.length - 1;
  if (idxs.at(-1) !== last) {
    if (last - idxs.at(-1) < step / 2 && idxs.length > 1) idxs.pop();
    idxs.push(last);
  }
  for (const idx of idxs) {
    const p = points[idx];
    const anchor = idx === last && points.length > 1 ? 'end' : idx === 0 && points.length > 1 ? 'start' : 'middle';
    grid += `<text x="${sx(p.x)}" y="${height - 6}" text-anchor="${anchor}" class="chart-tick">${esc(xFormat(p.x))}</text>`;
  }

  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
  const area = `${d}L${sx(points.at(-1).x).toFixed(1)},${sy(0)}L${sx(points[0].x).toFixed(1)},${sy(0)}Z`;
  const dots = points
    .map((p) => `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="${points.length > 60 ? 0 : 3}" class="chart-dot"><title>${esc(p.label ?? `${xFormat(p.x)}: ${Math.round(p.y)}`)}</title></circle>`)
    .join('');
  const crosses = marks
    .filter((m) => m.n > 0)
    .map((m) => {
      const x = sx(m.x), y = padT + ih - 6, r = 3.5;
      return `<g class="chart-err"><path d="M${x - r},${y - r}L${x + r},${y + r}M${x + r},${y - r}L${x - r},${y + r}"/><title>${esc(m.label ?? `${m.n} error${m.n > 1 ? 's' : ''}`)}</title></g>`;
    })
    .join('');
  const ylab = yLabel
    ? `<text transform="translate(11 ${padT + ih / 2}) rotate(-90)" text-anchor="middle" class="chart-tick">${esc(yLabel)}</text>`
    : '';

  return `<svg width="${w}" height="${height}" viewBox="0 0 ${w} ${height}" role="img" aria-label="${esc(yLabel)} chart">
${grid}${ylab}
<path d="${area}" class="chart-area"/>
<path d="${d}" class="chart-line"/>
${dots}${crosses}
</svg>`;
}
