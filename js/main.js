import { OPS, OP_KEYS } from './generator.js';
import { Session, MODES, sanitize } from './session.js';
import { lineChart } from './chart.js';
import * as store from './storage.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const now = () => performance.now();

const el = {
  config: $('#config'),
  config2: $('#config2'),
  amounts: $('#amounts'),
  stage: $('#stage'),
  problem: $('#problem'),
  answer: $('#answer'),
  next: $('#next'),
  reveal: $('#reveal'),
  liveProgress: $('#live-progress'),
  livePpm: $('#live-ppm'),
  finish: $('#btn-finish'),
  toast: $('#toast'),
};

let config = store.loadConfig();
let settings = store.loadSettings();
let history = store.loadHistory();
let session = null;
let lastResult = null;
let ticker = null;
let revealTimer = null;
let showingResult = false;
let route = 'test';

// ---------- helpers ----------

function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.remove('hidden');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.toast.classList.add('hidden'), 2200);
}

function fmtMs(ms) {
  return ms >= 10000 ? `${(ms / 1000).toFixed(0)}s` : `${(ms / 1000).toFixed(2)}s`;
}

function fmtDuration(ms) {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Human label for a config or a saved result.
function describe(r) {
  if (r.drill) return 'drill';
  const ops = OP_KEYS.filter((o) => r.ops.includes(o));
  const parts = [r.mode === 'zen' ? 'zen' : `${r.mode} ${r.amount}`, ops.map((o) => OPS[o].symbol).join(' ')];
  if (ops.includes('add') || ops.includes('sub')) parts.push(`+− ${r.addDigits}d`);
  if (ops.includes('mul') || ops.includes('div')) parts.push(`×÷ ${r.mulDigits}d`);
  if (ops.includes('sub') && r.negatives) parts.push('neg');
  return parts.join(' · ');
}

// ---------- theme & settings ----------

function applySettings() {
  document.documentElement.dataset.theme = settings.theme;
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  $$('[data-theme-btn]').forEach((b) => b.classList.toggle('on', b.dataset.themeBtn === settings.theme));
  $$('[data-toggle]').forEach((b) => {
    const on = !!settings[b.dataset.toggle];
    b.classList.toggle('on', on);
    b.textContent = on ? 'on' : 'off';
  });
  el.livePpm.classList.toggle('hidden', !settings.liveStats);
  if (session) renderProblem();
}

// ---------- config bar ----------

function renderConfig() {
  $$('[data-op]', el.config).forEach((b) => b.classList.toggle('on', config.ops.includes(b.dataset.op)));
  $$('[data-mode]', el.config).forEach((b) => b.classList.toggle('on', b.dataset.mode === config.mode));

  const amounts = MODES[config.mode];
  el.amounts.innerHTML = amounts
    .map((a) => `<button data-amount="${a}" class="${a === config.amount ? 'on' : ''}">${a}</button>`)
    .join('');
  el.amounts.classList.toggle('hidden', !amounts.length);
  el.amounts.previousElementSibling.classList.toggle('hidden', !amounts.length);

  $$('[data-add-digits]').forEach((b) => b.classList.toggle('on', +b.dataset.addDigits === config.addDigits));
  $$('[data-mul-digits]').forEach((b) => b.classList.toggle('on', +b.dataset.mulDigits === config.mulDigits));
  $('[data-neg]').classList.toggle('on', !!config.negatives);

  const hasAdd = config.ops.includes('add') || config.ops.includes('sub');
  const hasMul = config.ops.includes('mul') || config.ops.includes('div');
  const hasSub = config.ops.includes('sub');
  $$('[data-for="add"]', el.config2).forEach((n) => n.classList.toggle('hidden', !hasAdd));
  $$('[data-for="mul"]', el.config2).forEach((n) => n.classList.toggle('hidden', !hasMul));
  $$('[data-for="both"]', el.config2).forEach((n) => n.classList.toggle('hidden', !(hasAdd && hasMul)));
  $$('[data-for="sub"]', el.config2).forEach((n) => n.classList.toggle('hidden', !hasSub));

  $('.zen-only').classList.toggle('hidden', config.mode !== 'zen');
}

function changeConfig(patch) {
  config = { ...config, ...patch };
  if (patch.mode && patch.mode !== 'zen' && !MODES[patch.mode].includes(config.amount)) {
    config.amount = patch.mode === 'time' ? 30 : 25;
  }
  store.saveConfig(config);
  renderConfig();
  newTest();
}

el.config.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.op) {
    const op = b.dataset.op;
    let ops = config.ops.includes(op) ? config.ops.filter((o) => o !== op) : [...config.ops, op];
    if (!ops.length) {
      toast('keep at least one operation');
      return;
    }
    ops = OP_KEYS.filter((o) => ops.includes(o));
    changeConfig({ ops });
  } else if (b.dataset.mode) {
    changeConfig({ mode: b.dataset.mode });
  } else if (b.dataset.amount) {
    changeConfig({ amount: +b.dataset.amount });
  }
});

el.config2.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.addDigits) changeConfig({ addDigits: +b.dataset.addDigits });
  else if (b.dataset.mulDigits) changeConfig({ mulDigits: +b.dataset.mulDigits });
  else if ('neg' in b.dataset) changeConfig({ negatives: !config.negatives });
});

// ---------- the test ----------

function newTest(queue = null) {
  clearInterval(ticker);
  ticker = null;
  clearTimeout(revealTimer);
  session = new Session(config, Math.random, queue);
  showingResult = false;
  document.body.classList.remove('typing');
  el.answer.value = '';
  el.answer.classList.remove('wrong');
  el.reveal.textContent = queue ? `drill: ${queue.length} problems to review` : '';
  el.stage.classList.add('idle');
  el.finish.classList.toggle('hidden', session.cfg.mode !== 'zen');
  el.answer.setAttribute('inputmode', config.negatives && config.ops.includes('sub') ? 'text' : 'numeric');
  renderProblem();
  renderLive();
  if (route === 'test') {
    showSection('test');
    focusAnswer();
  }
}

function focusAnswer() {
  // Don't pop the on-screen keyboard on page load for touch devices until they tap.
  el.answer.focus({ preventScroll: true });
}

function renderProblem() {
  if (!session || !session.current) return;
  el.problem.textContent = session.current.text;
  el.next.textContent = settings.showNext && session.next ? session.next.text : '';
  const len = String(session.current.answer).length;
  el.answer.style.width = `${Math.max(3, len + 1.5)}ch`;
}

function renderLive() {
  if (!session) return;
  const t = now();
  const { mode, amount } = session.cfg;
  if (mode === 'time') {
    el.liveProgress.textContent = Math.ceil(session.progress(t) - 1e-9);
  } else if (mode === 'problems') {
    el.liveProgress.textContent = `${session.problems.length}/${amount}`;
  } else {
    el.liveProgress.textContent = session.state === 'idle' ? 'zen' : fmtDuration(session.elapsed(t));
  }
  const secs = session.elapsed(t) / 1000;
  el.livePpm.textContent =
    settings.liveStats && session.state === 'running' && secs >= 3
      ? `${Math.round((session.solved / secs) * 60)} ppm`
      : '';
}

function startTicker() {
  if (ticker) return;
  document.body.classList.add('typing');
  ticker = setInterval(() => {
    if (!session) return;
    if (session.tick(now())) finishTest();
    else renderLive();
  }, 100);
}

function flashOk() {
  el.stage.classList.add('flash-ok');
  requestAnimationFrame(() => requestAnimationFrame(() => el.stage.classList.remove('flash-ok')));
}

// The first problem stays hidden until a key is pressed; that key starts the
// clock and is not part of the answer, so problem one is timed fairly.
function begin() {
  if (!session || session.state !== 'idle') return;
  session.start(now());
  el.answer.value = '';
  el.stage.classList.remove('idle');
  el.reveal.textContent = '';
  startTicker();
  renderLive();
}

el.answer.addEventListener('input', () => {
  if (!session || showingResult) return;
  if (session.state === 'idle') {
    begin(); // mobile keyboards often send no usable keydown
    return;
  }
  const res = session.setInput(el.answer.value, now());
  if (res === 'done') {
    finishTest();
    return;
  }
  if (res === 'correct') {
    el.answer.value = '';
    el.answer.classList.remove('wrong');
    flashOk();
    renderProblem();
    renderLive();
    return;
  }
  // keep the box in sync with what the session accepted (strips letters etc.)
  if (el.answer.value !== session.input) el.answer.value = session.input;
  if (res === 'error') {
    el.answer.classList.add('wrong');
    el.answer.classList.remove('shake');
    void el.answer.offsetWidth;
    el.answer.classList.add('shake');
  } else if (res === 'ok') {
    el.answer.classList.remove('wrong');
  }
});

function skip() {
  if (!session || session.state !== 'running') return;
  const p = session.current;
  const res = session.skip(now());
  if (res === 'done') {
    finishTest();
    return;
  }
  if (res !== 'skipped') return;
  el.answer.value = '';
  el.answer.classList.remove('wrong');
  if (settings.revealOnSkip) {
    el.reveal.textContent = `${p.text} = ${p.answer}`;
    clearTimeout(revealTimer);
    revealTimer = setTimeout(() => (el.reveal.textContent = ''), 1400);
  }
  renderProblem();
  renderLive();
}

function finishZen() {
  if (!session || session.state !== 'running') return;
  session.end(now());
  finishTest();
}

function finishTest() {
  clearInterval(ticker);
  ticker = null;
  document.body.classList.remove('typing');
  if (!session || showingResult) return;
  if (session.state !== 'done') session.end(now());
  const result = session.result();
  lastResult = result;

  let isPb = false;
  if (!result.drill && result.correct >= 1) {
    const prev = store.personalBests(history)[result.key];
    isPb = !!prev && result.ppm > prev.ppm;
    history = store.addResult(result);
  }
  showingResult = true;
  renderResult(result, isPb);
  showSection('result');
  el.answer.blur();
}

// ---------- results ----------

function slowThreshold(problems) {
  const times = problems.filter((p) => !p.skipped).map((p) => p.ms).sort((a, b) => a - b);
  if (times.length < 4) return Infinity;
  return times[Math.floor(times.length * 0.8)];
}

function drillQueue(problems) {
  const slow = slowThreshold(problems);
  const pick = problems
    .filter((p) => p.skipped || p.errors > 0 || p.ms >= slow)
    .sort((a, b) => (b.skipped - a.skipped) || (b.errors - a.errors) || (b.ms - a.ms));
  const seen = new Set();
  const out = [];
  for (const p of pick) {
    if (seen.has(p.text)) continue;
    seen.add(p.text);
    out.push({ op: p.op, text: p.text, answer: p.answer });
    if (out.length >= 15) break;
  }
  return out;
}

function stat(k, v, title = '', cls = '') {
  return `<div class="stat ${cls}" title="${escapeHtml(title)}"><div class="k">${k}</div><div class="v">${v}</div></div>`;
}

function opCards(byOp) {
  return OP_KEYS.filter((o) => byOp[o])
    .map((o) => {
      const s = byOp[o];
      const avg = s.n ? fmtMs(s.ms / s.n) : '–';
      return `<div class="op-card">
        <div><span class="sym">${OPS[o].symbol}</span><span class="name">${OPS[o].label}</span></div>
        <div class="row"><span>solved</span><b>${s.n}</b></div>
        <div class="row"><span>avg time</span><b>${avg}</b></div>
        <div class="row"><span>mistakes</span><b>${s.errors}</b></div>
        ${s.skipped ? `<div class="row"><span>skipped</span><b>${s.skipped}</b></div>` : ''}
      </div>`;
    })
    .join('');
}

function renderResult(r, isPb) {
  $('#r-ppm').textContent = Math.round(r.ppm);
  $('#r-ppm').title = `${r.ppm} problems per minute`;
  $('#r-acc').textContent = `${Math.round(r.acc)}%`;
  $('#r-acc').title = `${r.acc}% (${r.keystrokes - r.errors}/${r.keystrokes} keystrokes)`;
  $('#r-pb').classList.toggle('hidden', !isPb);

  drawResultChart();

  const notSaved = r.drill ? 'drill · not saved' : r.correct < 1 ? 'not saved (nothing solved)' : describe(r);
  $('#r-small').innerHTML = [
    stat('test', `<small>${escapeHtml(notSaved)}</small>`, '', 'wide'),
    stat('solved', r.correct),
    r.skipped ? stat('skipped', r.skipped) : '',
    stat('mistakes', r.errors, 'wrong keystrokes'),
    stat('avg time', r.correct ? fmtMs(r.avgMs) : '–', 'average time per solved problem'),
    stat('consistency', `${Math.round(r.consistency)}%`, 'how even your solve times were'),
    stat('time', fmtDuration(r.elapsed)),
  ].join('');

  $('#r-ops').innerHTML = opCards(r.byOp);

  const slow = slowThreshold(r.problems);
  $('#r-log').innerHTML = r.problems.length
    ? r.problems
        .map((p) => {
          const cls = ['log-item', p.skipped ? 'skipped' : '', !p.skipped && p.ms >= slow ? 'slow' : ''].join(' ');
          return `<div class="${cls}"><span class="p">${escapeHtml(p.text)} = ${p.answer}</span>
            <span>${p.errors ? `<span class="e">${p.errors}✗</span> ` : ''}<span class="t">${p.skipped ? 'skip' : fmtMs(p.ms)}</span></span></div>`;
        })
        .join('')
    : '<div class="empty">no problems answered</div>';

  const q = drillQueue(r.problems);
  const retry = $('#btn-retry-slow');
  retry.classList.toggle('hidden', !q.length);
  retry.title = `drill the ${q.length} problem${q.length === 1 ? '' : 's'} you missed or were slowest at`;
  retry.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v4l3 2"/><circle cx="12" cy="12" r="9"/></svg> review ${q.length}`;
}

function drawResultChart() {
  if (!lastResult) return;
  const box = $('#r-chart');
  const r = lastResult;
  box.innerHTML = lineChart({
    points: r.curve.map((c) => ({ x: c.t, y: c.ppm, label: `${c.t}s: ${Math.round(c.ppm)} ppm` })),
    marks: r.curve.map((c) => ({ x: c.t, n: c.errors })),
    width: box.clientWidth || 600,
    height: 190,
    yLabel: 'ppm',
    xFormat: (x) => `${x}s`,
  });
}

$('#btn-next').addEventListener('click', () => newTest());
$('#btn-retry-slow').addEventListener('click', () => {
  if (lastResult) newTest(drillQueue(lastResult.problems));
});
$('#btn-restart').addEventListener('click', () => newTest());
el.finish.addEventListener('click', finishZen);

// ---------- stats page ----------

let statsFilter = 'all';

function renderStats() {
  history = store.loadHistory();
  const h = history;
  const totalMs = h.reduce((a, r) => a + r.elapsed, 0);
  const solved = h.reduce((a, r) => a + r.correct, 0);
  const last10 = h.slice(-10);
  const avg = (xs, f) => (xs.length ? xs.reduce((a, r) => a + f(r), 0) / xs.length : 0);
  const best = h.reduce((m, r) => Math.max(m, r.ppm), 0);

  $('#s-summary').innerHTML = [
    stat('tests completed', h.length),
    stat('time practicing', fmtDuration(totalMs)),
    stat('problems solved', solved),
    stat('highest ppm', Math.round(best)),
    stat('avg ppm <small>(last 10)</small>', h.length ? Math.round(avg(last10, (r) => r.ppm)) : '–'),
    stat('avg acc <small>(last 10)</small>', h.length ? `${Math.round(avg(last10, (r) => r.acc))}%` : '–'),
  ].join('');

  const pbs = Object.values(store.personalBests(h)).sort((a, b) => {
    const order = { time: 0, problems: 1, zen: 2 };
    return order[a.mode] - order[b.mode] || (a.amount ?? 0) - (b.amount ?? 0) || b.ppm - a.ppm;
  });
  $('#s-pbs').innerHTML = pbs.length
    ? pbs
        .map(
          (r) => `<div class="pb"><div class="pb-k">${escapeHtml(describe(r))}</div>
          <div class="pb-v">${Math.round(r.ppm)} <small>ppm · ${Math.round(r.acc)}% acc</small></div>
          <div class="pb-k">${fmtDate(r.ts)}</div></div>`,
        )
        .join('')
    : '<div class="empty">finish a test to set your first personal best.</div>';

  const keys = [...new Set(h.map((r) => r.key))];
  if (statsFilter !== 'all' && !keys.includes(statsFilter)) statsFilter = 'all';
  const labelFor = Object.fromEntries(h.map((r) => [r.key, describe(r)]));
  $('#s-filter').innerHTML = h.length
    ? `<select id="s-filter-select" aria-label="filter by test type">
        <option value="all">all tests</option>
        ${keys.map((k) => `<option value="${escapeHtml(k)}" ${k === statsFilter ? 'selected' : ''}>${escapeHtml(labelFor[k])}</option>`).join('')}
      </select>`
    : '';
  drawStatsChart();

  const byOp = {};
  for (const r of h) {
    for (const [o, s] of Object.entries(r.byOp || {})) {
      const t = (byOp[o] ??= { n: 0, ms: 0, errors: 0, skipped: 0 });
      t.n += s.n; t.ms += s.ms; t.errors += s.errors; t.skipped += s.skipped;
    }
  }
  $('#s-ops').innerHTML = Object.keys(byOp).length ? opCards(byOp) : '<div class="empty">no data yet.</div>';

  const recent = h.slice(-25).reverse();
  $('#s-recent').innerHTML = recent.length
    ? `<table><thead><tr><th>date</th><th>test</th><th>ppm</th><th>acc</th><th>solved</th><th>mistakes</th><th>time</th></tr></thead><tbody>
      ${recent
        .map(
          (r) => `<tr><td class="mut">${fmtDate(r.ts)}</td><td>${escapeHtml(describe(r))}</td>
          <td class="num">${Math.round(r.ppm)}</td><td>${Math.round(r.acc)}%</td><td>${r.correct}</td>
          <td>${r.errors}</td><td class="mut">${fmtDuration(r.elapsed)}</td></tr>`,
        )
        .join('')}</tbody></table>`
    : '<div class="empty">no tests yet.</div>';
}

function drawStatsChart() {
  const box = $('#s-chart');
  const rows = history.filter((r) => statsFilter === 'all' || r.key === statsFilter);
  box.innerHTML = lineChart({
    points: rows.map((r, i) => ({ x: i + 1, y: r.ppm, label: `#${i + 1} · ${describe(r)} · ${Math.round(r.ppm)} ppm · ${fmtDate(r.ts)}` })),
    width: box.clientWidth || 600,
    height: 200,
    yLabel: 'ppm',
    xFormat: (x) => `#${x}`,
  });
}

$('#s-filter').addEventListener('change', (e) => {
  if (e.target.id === 's-filter-select') {
    statsFilter = e.target.value;
    drawStatsChart();
  }
});

// ---------- settings page ----------

$('#view-settings').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.themeBtn) {
    settings.theme = b.dataset.themeBtn;
  } else if (b.dataset.toggle) {
    settings[b.dataset.toggle] = !settings[b.dataset.toggle];
  } else if (b.id === 'btn-export') {
    const blob = new Blob([store.exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ezmathz-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return;
  } else if (b.id === 'btn-import') {
    $('#import-file').click();
    return;
  } else if (b.id === 'btn-reset') {
    if (confirm('Delete all saved results from this browser? This cannot be undone.')) {
      store.clearHistory();
      history = [];
      toast('results deleted');
    }
    return;
  } else return;
  store.saveSettings(settings);
  applySettings();
});

$('#import-file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const added = store.importData(await f.text());
    history = store.loadHistory();
    toast(`imported ${added} result${added === 1 ? '' : 's'}`);
  } catch (err) {
    toast(`import failed: ${err.message}`);
  }
});

// ---------- routing ----------

function showSection(name) {
  for (const v of ['test', 'result', 'stats', 'settings']) {
    $(`#view-${v}`).classList.toggle('hidden', v !== name);
  }
  $$('[data-nav]').forEach((a) =>
    a.classList.toggle('active', a.dataset.nav === (name === 'result' ? 'test' : name)),
  );
  $('#keys').classList.toggle('hidden', name === 'stats' || name === 'settings');
  if (name === 'result') drawResultChart();
}

function onRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  route = ['stats', 'settings'].includes(hash) ? hash : 'test';
  if (route === 'test') {
    newTest();
  } else {
    if (session && session.state === 'running') newTest();
    clearInterval(ticker);
    ticker = null;
    document.body.classList.remove('typing');
    showSection(route);
    if (route === 'stats') renderStats();
  }
}
window.addEventListener('hashchange', onRoute);
// Clicking the logo or the practice icon while already on the test page restarts.
$$('.logo, [data-nav="test"]').forEach((a) =>
  a.addEventListener('click', () => {
    if (route === 'test') newTest();
  }),
);

// ---------- keyboard & focus ----------

document.addEventListener('keydown', (e) => {
  if (route !== 'test') return;
  if (e.key === 'Tab' || e.key === 'Escape') {
    e.preventDefault();
    newTest();
    return;
  }
  if (showingResult) {
    if (e.key === 'Enter') {
      e.preventDefault();
      newTest();
    }
    return;
  }
  if (session?.state === 'idle' && (e.key.length === 1 || e.key === 'Enter') && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    focusAnswer();
    begin();
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    if (e.shiftKey && session?.cfg.mode === 'zen') finishZen();
    else skip();
    return;
  }
  if (document.activeElement !== el.answer && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    focusAnswer();
  }
});

const coarse = matchMedia('(pointer: coarse)').matches;
if (coarse) $('#start-hint').textContent = 'tap to start';
el.stage.addEventListener('pointerdown', (e) => {
  if ((e.pointerType === 'touch' || coarse) && session?.state === 'idle') {
    focusAnswer();
    begin();
  }
});
$('#btn-skip').addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the answer box
$('#btn-skip').addEventListener('click', () => {
  skip();
  focusAnswer();
});

el.stage.addEventListener('mousedown', (e) => {
  if (e.target !== el.answer) {
    e.preventDefault();
    focusAnswer();
  }
});
el.answer.addEventListener('blur', () => el.stage.classList.add('blurred'));
el.answer.addEventListener('focus', () => el.stage.classList.remove('blurred'));

let resizeRaf = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => {
    if (showingResult && route === 'test') drawResultChart();
    if (route === 'stats') drawStatsChart();
  });
});

// ---------- boot ----------

applySettings();
renderConfig();
onRoute();
if (document.activeElement !== el.answer) el.stage.classList.add('blurred');
// Exposed for debugging in the console.
window.ezmathz = { get session() { return session; }, sanitize };
