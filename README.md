# ezmathz

A minimal, fast **mental math trainer**, inspired by the feel of typing tests: pick a test, type
answers as fast as you can, and see your speed, accuracy and progress over time.

## Features

- **Operations:** addition, subtraction, multiplication, division — any combination.
- **Difficulty:** 1–4 digit operands for + −, 1–3 digit operands for × ÷ (one-digit × skips the
  trivial 0 and 1, so it drills the times tables). Optional negative results for subtraction.
  Division is always exact.
- **Modes:** `time` (15 / 30 / 60 / 120 s), `problems` (10 / 25 / 50 / 100), and `zen` (no limit).
- **No enter key:** an answer is accepted the instant it is right. Wrong digits turn red and count
  as mistakes. `enter` skips (and briefly shows the answer).
- **Fair timing:** the first problem is hidden until you press a key, so its thinking time counts.
- **Results:** problems per minute (ppm), accuracy, consistency, a ppm-over-time chart with
  mistakes marked, a per-operation breakdown, and a full problem log.
- **Review drill:** replays the problems you skipped, got wrong, or were slowest at.
- **Stats page:** personal bests per test type, ppm history, totals, per-operation averages,
  recent tests.
- **Themes:** ink, paper, matcha, dusk. Works on phones.
- **Your data stays yours:** everything is stored in the browser (localStorage). Export/import a
  JSON backup from settings.

## Keys

| key | action |
| --- | --- |
| any key | start |
| `tab` / `esc` | restart |
| `enter` | skip problem (next test, on the results screen) |
| `shift` + `enter` | finish a zen test |

## Run locally

It is a static site with no build step and no dependencies.

```bash
npm run dev      # python3 -m http.server 5173 → http://localhost:5173
npm test         # unit tests for the problem generator and scoring (node --test)
```

## Layout

```
index.html         the whole UI (test, results, stats, settings views)
css/style.css      styles + themes
js/generator.js    problem generation (pure)
js/session.js      one test run: input handling, timing, scoring (pure)
js/storage.js      localStorage: config, settings, history, personal bests
js/chart.js        tiny SVG line chart
js/main.js         UI controller
tests/             node:test unit tests
```

The original 2022 PHP version is kept at the `legacy-php` tag.
