// Everything lives in this browser's localStorage. No account, no server.
// Every access is wrapped: storage can be blocked (private mode, etc.).

const KEY_CONFIG = 'ezmathz.config';
const KEY_SETTINGS = 'ezmathz.settings';
const KEY_HISTORY = 'ezmathz.history';
const MAX_HISTORY = 2000;

export const DEFAULT_CONFIG = {
  mode: 'time',
  amount: 30,
  ops: ['add', 'sub', 'mul'],
  addDigits: 2,
  mulDigits: 1,
  negatives: false,
};

export const DEFAULT_SETTINGS = {
  theme: 'ink',
  showNext: true,
  liveStats: true,
  revealOnSkip: true,
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadConfig() {
  const c = { ...DEFAULT_CONFIG, ...read(KEY_CONFIG, {}) };
  if (!Array.isArray(c.ops) || !c.ops.length) c.ops = [...DEFAULT_CONFIG.ops];
  return c;
}
export const saveConfig = (c) => write(KEY_CONFIG, c);

export const loadSettings = () => ({ ...DEFAULT_SETTINGS, ...read(KEY_SETTINGS, {}) });
export const saveSettings = (s) => write(KEY_SETTINGS, s);

export function loadHistory() {
  const h = read(KEY_HISTORY, []);
  return Array.isArray(h) ? h : [];
}

// Store a finished test (without the bulky per-problem detail).
export function addResult(result) {
  const { curve, problems, ...slim } = result;
  const h = loadHistory();
  h.push(slim);
  while (h.length > MAX_HISTORY) h.shift();
  write(KEY_HISTORY, h);
  return h;
}

export function clearHistory() {
  write(KEY_HISTORY, []);
}

export function exportData() {
  return JSON.stringify(
    { app: 'ezmathz', v: 1, config: loadConfig(), settings: loadSettings(), history: loadHistory() },
    null,
    1,
  );
}

export function importData(text) {
  const data = JSON.parse(text);
  if (!data || data.app !== 'ezmathz' || !Array.isArray(data.history)) {
    throw new Error('not an ezmathz export');
  }
  const known = new Set(loadHistory().map((r) => r.id));
  const merged = [...loadHistory(), ...data.history.filter((r) => r && r.id && !known.has(r.id))];
  merged.sort((a, b) => a.ts - b.ts);
  write(KEY_HISTORY, merged.slice(-MAX_HISTORY));
  return merged.length - known.size;
}

// Best ppm per config key, from a history array.
export function personalBests(history) {
  const best = {};
  for (const r of history) {
    if (!best[r.key] || r.ppm > best[r.key].ppm) best[r.key] = r;
  }
  return best;
}
