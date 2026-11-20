// One test run. Pure logic driven by explicit timestamps (ms), so it can be
// tested without a browser — see tests/session.test.js.

import { makeProblem, OP_KEYS } from './generator.js';

export const MODES = {
  time: [15, 30, 60, 120],
  problems: [10, 25, 50, 100],
  zen: [],
};

// Strip anything that is not a digit; keep a single leading minus.
export function sanitize(raw) {
  const s = String(raw ?? '');
  const neg = s.trimStart().startsWith('-');
  const digits = s.replace(/\D/g, '');
  return (neg ? '-' : '') + digits;
}

// Key that identifies "the same kind of test" for personal bests.
export function configKey(cfg) {
  const ops = OP_KEYS.filter((o) => cfg.ops.includes(o));
  const parts = [cfg.mode === 'zen' ? 'zen' : `${cfg.mode}${cfg.amount}`, ops.join('+')];
  if (ops.includes('add') || ops.includes('sub')) parts.push(`a${cfg.addDigits}`);
  if (ops.includes('mul') || ops.includes('div')) parts.push(`m${cfg.mulDigits}`);
  if (ops.includes('sub') && cfg.negatives) parts.push('neg');
  return parts.join('|');
}

export class Session {
  // `queue` (optional): a fixed list of problems to drill, in order.
  constructor(cfg, rng = Math.random, queue = null) {
    this.cfg = { ...cfg, ops: [...cfg.ops] };
    this.rng = rng;
    this.queue = queue ? queue.map((p) => ({ ...p })) : null;
    if (this.queue) {
      this.cfg.mode = 'problems';
      this.cfg.amount = this.queue.length;
      this.cfg.drill = true;
    }
    this.state = 'idle'; // idle → running → done
    this.startedAt = null;
    this.endedAt = null;
    this.input = '';
    this.keystrokes = 0;
    this.errors = 0;
    this.problems = []; // finished problems
    this.timeline = []; // per-second buckets {correct, errors}
    this.current = this.draw(null);
    this.next = this.draw(this.current);
    this.currentShownAt = null;
    this.currentErrors = 0;
  }

  draw(prev) {
    if (this.queue) return this.queue.shift() ?? null;
    return makeProblem(this.cfg, this.rng, prev);
  }

  get solved() {
    return this.problems.filter((p) => !p.skipped).length;
  }

  get skippedCount() {
    return this.problems.filter((p) => p.skipped).length;
  }

  elapsed(t) {
    if (this.startedAt === null) return 0;
    const end = this.endedAt ?? t;
    return Math.max(0, end - this.startedAt);
  }

  // Seconds left in time mode, problems left in problems mode, elapsed in zen.
  progress(t) {
    const { mode, amount } = this.cfg;
    if (mode === 'time') return Math.max(0, amount - this.elapsed(t) / 1000);
    if (mode === 'problems') return this.problems.length;
    return this.elapsed(t) / 1000;
  }

  start(t) {
    if (this.state !== 'idle') return;
    this.state = 'running';
    this.startedAt = t;
    this.currentShownAt = t;
  }

  bucket(t) {
    const i = Math.max(0, Math.floor((t - this.startedAt) / 1000));
    while (this.timeline.length <= i) this.timeline.push({ correct: 0, errors: 0 });
    return this.timeline[i];
  }

  // Feed the full current value of the answer box. Returns one of:
  // 'ignored' | 'ok' (valid prefix) | 'error' | 'correct' | 'done'
  setInput(raw, t) {
    if (this.state === 'done') return 'ignored';
    if (this.tick(t)) return 'done';
    const value = sanitize(raw);
    if (value === this.input) return 'ignored';
    if (this.state === 'idle') this.start(t);

    const prev = this.input;
    const added = Math.max(0, value.length - prev.length);
    this.input = value;
    this.keystrokes += added;

    const answer = String(this.current.answer);
    if (value === answer) {
      this.finishCurrent(t, false);
      return this.state === 'done' ? 'done' : 'correct';
    }
    if (value === '' || answer.startsWith(value)) return 'ok';
    if (added > 0) {
      // Count only the inserted characters from the first wrong one onward
      // ("3" then "9" for 35 is one mistake, not two).
      let bad = added;
      if (value.startsWith(prev)) {
        let ok = prev.length;
        while (ok < value.length && answer.startsWith(value.slice(0, ok + 1))) ok++;
        bad = value.length - ok;
      }
      this.errors += bad;
      this.currentErrors += bad;
      this.bucket(t).errors += bad;
    }
    return 'error';
  }

  skip(t) {
    if (this.state !== 'running') return 'ignored';
    if (this.tick(t)) return 'done';
    this.finishCurrent(t, true);
    return this.state === 'done' ? 'done' : 'skipped';
  }

  finishCurrent(t, skipped) {
    const ms = t - this.currentShownAt;
    this.problems.push({
      text: this.current.text,
      op: this.current.op,
      answer: this.current.answer,
      ms,
      errors: this.currentErrors,
      skipped,
    });
    if (!skipped) this.bucket(t).correct += 1;
    this.current = this.next;
    this.next = this.draw(this.current);
    this.currentShownAt = t;
    this.currentErrors = 0;
    this.input = '';
    if (this.cfg.mode === 'problems' && this.problems.length >= this.cfg.amount) {
      this.end(t);
    }
  }

  // Ends a timed test when its time is up. Returns true if the test is over.
  tick(t) {
    if (this.state === 'done') return true;
    if (this.state !== 'running') return false;
    if (this.cfg.mode === 'time' && t - this.startedAt >= this.cfg.amount * 1000) {
      this.end(this.startedAt + this.cfg.amount * 1000);
      return true;
    }
    return false;
  }

  end(t) {
    if (this.state === 'done') return;
    if (this.state === 'idle') this.startedAt = t;
    this.state = 'done';
    this.endedAt = t;
  }

  result() {
    return summarize(this);
  }
}

function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function summarize(s) {
  const elapsed = s.elapsed(s.endedAt ?? 0);
  const solved = s.problems.filter((p) => !p.skipped);
  const minutes = elapsed / 60000;
  const ppm = minutes > 0 ? solved.length / minutes : 0;
  const acc = s.keystrokes > 0 ? ((s.keystrokes - s.errors) / s.keystrokes) * 100 : 0;
  const times = solved.map((p) => p.ms);
  const avgMs = mean(times);
  const sd = Math.sqrt(mean(times.map((x) => (x - avgMs) ** 2)));
  // Map the coefficient of variation of solve times to 0–100 smoothly
  // (cv 0 → 100%, cv 0.5 → ~52%, cv 1 → ~13%).
  const cv = avgMs > 0 ? sd / avgMs : 0;
  const consistency = times.length ? 100 * (1 - Math.tanh(cv + cv ** 3 / 3 + cv ** 5 / 5)) : 0;

  const byOp = {};
  for (const p of s.problems) {
    const o = (byOp[p.op] ??= { n: 0, ms: 0, errors: 0, skipped: 0 });
    if (p.skipped) o.skipped += 1;
    else {
      o.n += 1;
      o.ms += p.ms;
    }
    o.errors += p.errors;
  }

  // Cumulative ppm at the end of each second, for the results chart.
  const curve = [];
  let cum = 0;
  const secondsTotal = Math.ceil(elapsed / 1000 - 1e-9);
  const timeline = [...s.timeline];
  while (timeline.length < secondsTotal) timeline.push({ correct: 0, errors: 0 });
  timeline.forEach((b, i) => {
    cum += b.correct;
    const secs = Math.min(i + 1, elapsed / 1000);
    curve.push({ t: i + 1, ppm: secs > 0 ? (cum / secs) * 60 : 0, correct: b.correct, errors: b.errors });
  });

  return {
    v: 1,
    id: `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
    ts: Date.now(),
    mode: s.cfg.mode,
    amount: s.cfg.mode === 'zen' ? null : s.cfg.amount,
    ops: OP_KEYS.filter((o) => s.cfg.ops.includes(o)),
    addDigits: s.cfg.addDigits,
    mulDigits: s.cfg.mulDigits,
    negatives: !!s.cfg.negatives,
    key: s.cfg.drill ? 'drill' : configKey(s.cfg),
    drill: !!s.cfg.drill,
    elapsed: Math.round(elapsed),
    correct: solved.length,
    skipped: s.problems.length - solved.length,
    keystrokes: s.keystrokes,
    errors: s.errors,
    ppm: round1(ppm),
    acc: round1(acc),
    avgMs: Math.round(avgMs),
    consistency: round1(consistency),
    byOp,
    // Not persisted in history (too big), only used on the results screen:
    curve,
    problems: s.problems,
  };
}

function round1(x) {
  return Math.round(x * 10) / 10;
}
