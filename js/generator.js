// Problem generation. Pure functions, no DOM — tested in tests/generator.test.js.

export const OPS = {
  add: { symbol: '+', label: 'add' },
  sub: { symbol: '−', label: 'sub' },
  mul: { symbol: '×', label: 'mul' },
  div: { symbol: '÷', label: 'div' },
};

export const OP_KEYS = Object.keys(OPS);

export function randInt(min, max, rng = Math.random) {
  return min + Math.floor(rng() * (max - min + 1));
}

// Operand range for a number of digits. One-digit operands skip the trivial
// values (0 and 1 for × and ÷, 0 for + and −).
export function rangeFor(digits, oneDigitMin) {
  if (digits <= 1) return [oneDigitMin, 9];
  return [10 ** (digits - 1), 10 ** digits - 1];
}

function build(op, a, b, answer) {
  return { op, a, b, answer, text: `${a} ${OPS[op].symbol} ${b}` };
}

function makeOne(op, cfg, rng) {
  switch (op) {
    case 'add': {
      const [lo, hi] = rangeFor(cfg.addDigits, 1);
      const a = randInt(lo, hi, rng);
      const b = randInt(lo, hi, rng);
      return build(op, a, b, a + b);
    }
    case 'sub': {
      const [lo, hi] = rangeFor(cfg.addDigits, 1);
      let a = randInt(lo, hi, rng);
      let b = randInt(lo, hi, rng);
      if (a === b) b = b === lo ? b + 1 : b - 1; // never "x − x"
      if (!cfg.negatives && a < b) [a, b] = [b, a];
      return build(op, a, b, a - b);
    }
    case 'mul': {
      const [lo, hi] = rangeFor(cfg.mulDigits, 2);
      const a = randInt(lo, hi, rng);
      const b = randInt(lo, hi, rng);
      return build(op, a, b, a * b);
    }
    case 'div': {
      // Always exact: pick the quotient and divisor, show their product.
      const [lo, hi] = rangeFor(cfg.mulDigits, 2);
      const q = randInt(lo, hi, rng);
      const d = randInt(lo, hi, rng);
      return build(op, q * d, d, q);
    }
    default:
      throw new Error(`unknown op ${op}`);
  }
}

// Make a problem for the given config, avoiding an exact repeat of `prev`.
export function makeProblem(cfg, rng = Math.random, prev = null) {
  const ops = cfg.ops && cfg.ops.length ? cfg.ops : OP_KEYS;
  let p;
  for (let i = 0; i < 20; i++) {
    const op = ops[Math.floor(rng() * ops.length)];
    p = makeOne(op, cfg, rng);
    if (!prev || p.text !== prev.text) break;
  }
  return p;
}
