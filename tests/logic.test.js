import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeProblem, rangeFor, OP_KEYS } from '../js/generator.js';
import { Session, sanitize, configKey } from '../js/session.js';

function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const base = { mode: 'time', amount: 30, ops: [...OP_KEYS], addDigits: 2, mulDigits: 1, negatives: false };

test('ranges', () => {
  assert.deepEqual(rangeFor(1, 2), [2, 9]);
  assert.deepEqual(rangeFor(2, 1), [10, 99]);
  assert.deepEqual(rangeFor(3, 1), [100, 999]);
});

test('every problem is correct and within its digit range', () => {
  const rng = seeded(42);
  for (const addDigits of [1, 2, 3, 4]) {
    for (const mulDigits of [1, 2, 3]) {
      for (const negatives of [false, true]) {
        const cfg = { ...base, addDigits, mulDigits, negatives };
        for (let i = 0; i < 2000; i++) {
          const p = makeProblem(cfg, rng);
          const [alo, ahi] = rangeFor(addDigits, 1);
          const [mlo, mhi] = rangeFor(mulDigits, 2);
          switch (p.op) {
            case 'add':
              assert.equal(p.answer, p.a + p.b);
              assert.ok(p.a >= alo && p.a <= ahi && p.b >= alo && p.b <= ahi, p.text);
              break;
            case 'sub':
              assert.equal(p.answer, p.a - p.b);
              assert.notEqual(p.a, p.b);
              if (!negatives) assert.ok(p.answer > 0, p.text);
              assert.ok(p.a >= alo && p.a <= ahi && p.b >= alo && p.b <= ahi, p.text);
              break;
            case 'mul':
              assert.equal(p.answer, p.a * p.b);
              assert.ok(p.a >= mlo && p.a <= mhi && p.b >= mlo && p.b <= mhi, p.text);
              break;
            case 'div':
              assert.equal(p.a / p.b, p.answer);
              assert.ok(Number.isInteger(p.answer));
              assert.ok(p.answer >= mlo && p.answer <= mhi && p.b >= mlo && p.b <= mhi, p.text);
              break;
          }
        }
      }
    }
  }
});

test('only selected ops appear, and no immediate repeats', () => {
  const rng = seeded(7);
  const cfg = { ...base, ops: ['mul'], mulDigits: 1 };
  let prev = null;
  for (let i = 0; i < 500; i++) {
    const p = makeProblem(cfg, rng, prev);
    assert.equal(p.op, 'mul');
    if (prev) assert.notEqual(p.text, prev.text);
    prev = p;
  }
});

test('sanitize', () => {
  assert.equal(sanitize('12a3'), '123');
  assert.equal(sanitize('-4'), '-4');
  assert.equal(sanitize('4-'), '4');
  assert.equal(sanitize(' 1 2 '), '12');
  assert.equal(sanitize(''), '');
});

test('configKey ignores irrelevant digits', () => {
  assert.equal(
    configKey({ ...base, ops: ['mul'], addDigits: 4 }),
    configKey({ ...base, ops: ['mul'], addDigits: 1 }),
  );
  assert.notEqual(configKey({ ...base, amount: 15 }), configKey({ ...base, amount: 30 }));
});

// Type an answer one character at a time, like a person would.
function typeAnswer(s, text, t) {
  let r;
  for (let i = 1; i <= text.length; i++) r = s.setInput(text.slice(0, i), t);
  return r;
}

test('time mode: timer starts on first key, correct answers advance, ends on time', () => {
  const s = new Session({ ...base, amount: 15 }, seeded(3));
  assert.equal(s.state, 'idle');
  let t = 1000;
  for (let i = 0; i < 10; i++) {
    t += 1000;
    const ans = String(s.current.answer);
    assert.equal(typeAnswer(s, ans, t), 'correct');
  }
  assert.equal(s.startedAt, 2000);
  assert.equal(s.solved, 10);
  assert.equal(s.errors, 0);
  assert.equal(s.tick(2000 + 14999), false);
  assert.equal(s.tick(2000 + 15000), true);
  assert.equal(s.state, 'done');
  const r = s.result();
  assert.equal(r.elapsed, 15000);
  assert.equal(r.correct, 10);
  assert.equal(r.ppm, 40);
  assert.equal(r.acc, 100);
  // typing after the end is ignored
  assert.equal(s.setInput('5', 99999), 'ignored');
});

test('wrong keystrokes count as errors and lower accuracy', () => {
  const s = new Session({ ...base, mode: 'problems', amount: 2 }, seeded(5));
  const ans = String(s.current.answer);
  const wrongDigit = ans[0] === '9' ? '8' : '9';
  assert.equal(s.setInput(wrongDigit, 0), 'error');
  assert.equal(s.errors, 1);
  assert.equal(s.setInput('', 10), 'ok'); // backspace
  assert.equal(typeAnswer(s, ans, 500), 'correct');
  assert.equal(s.problems[0].errors, 1);
  const ans2 = String(s.current.answer);
  assert.equal(typeAnswer(s, ans2, 1500), 'done');
  const r = s.result();
  assert.equal(r.correct, 2);
  assert.equal(r.keystrokes, 1 + ans.length + ans2.length);
  assert.ok(r.acc < 100);
});

test('a pasted/multi-char insert counts only the wrong part', () => {
  const s = new Session({ ...base, ops: ['mul'], mulDigits: 2 }, seeded(4));
  const ans = String(s.current.answer); // at least 3 digits
  const wrong = ans[0] + (ans[1] === '9' ? '8' : '9') + '0';
  assert.equal(s.setInput(wrong, 0), 'error');
  assert.equal(s.errors, 2);
  assert.equal(s.keystrokes, 3);
});

test('skip records the problem as skipped and moves on', () => {
  const s = new Session({ ...base, mode: 'problems', amount: 3 }, seeded(9));
  const first = s.current.text;
  assert.equal(s.skip(0), 'ignored'); // can't skip before starting
  s.start(0);
  assert.equal(s.skip(100), 'skipped');
  assert.equal(s.problems[0].text, first);
  assert.equal(s.problems[0].skipped, true);
  assert.equal(s.skippedCount, 1);
});

test('negative answers can be typed', () => {
  const cfg = { ...base, ops: ['sub'], negatives: true };
  const rng = seeded(11);
  let s;
  for (let i = 0; i < 100; i++) {
    s = new Session(cfg, rng);
    if (s.current.answer < 0) break;
  }
  assert.ok(s.current.answer < 0);
  assert.equal(typeAnswer(s, String(s.current.answer), 10), 'correct');
});

test('drill mode plays a fixed queue and ends', () => {
  const queue = [
    { op: 'mul', text: '7 × 8', answer: 56 },
    { op: 'add', text: '47 + 38', answer: 85 },
  ];
  const s = new Session(base, seeded(1), queue);
  assert.equal(s.current.text, '7 × 8');
  assert.equal(s.next.text, '47 + 38');
  assert.equal(typeAnswer(s, '56', 100), 'correct');
  assert.equal(s.next, null);
  assert.equal(typeAnswer(s, '85', 200), 'done');
  const r = s.result();
  assert.equal(r.drill, true);
  assert.equal(r.key, 'drill');
});

test('zen mode only ends when told to', () => {
  const s = new Session({ ...base, mode: 'zen' }, seeded(2));
  typeAnswer(s, String(s.current.answer), 0);
  assert.equal(s.tick(10 ** 9), false);
  s.end(60000);
  const r = s.result();
  assert.equal(r.mode, 'zen');
  assert.equal(r.amount, null);
  assert.equal(r.correct, 1);
  assert.equal(r.ppm, 1);
});
