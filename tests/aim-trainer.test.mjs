import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const htmlPath = path.resolve("public/aim-trainer.html");
const html = fs.readFileSync(htmlPath, "utf8");
const match = html.match(
  /\/\/ AIM_TRAINER_CORE_START([\s\S]*?)\/\/ AIM_TRAINER_CORE_END/,
);

assert.ok(match, "HTML must expose a testable aim trainer core");

const context = {};
vm.createContext(context);
vm.runInContext(
  `${match[1]}\nglobalThis.__AIM_TRAINER_CORE__ = AIM_TRAINER_CORE;`,
  context,
);
const core = context.__AIM_TRAINER_CORE__;

test("countdown is derived from real elapsed time and never becomes negative", () => {
  assert.equal(core.remainingMs(1_000, 3_500, 10_000), 7_500);
  assert.equal(core.remainingMs(1_000, 12_000, 10_000), 0);
  assert.equal(core.remainingMs(5_000, 4_000, 10_000), 10_000);
});

test("targets stay inside the arena and respect minimum travel", () => {
  const values = [0.5, 0.5, 0.95, 0.95];
  let index = 0;
  const target = core.chooseTarget({
    width: 900,
    height: 520,
    targetSize: 40,
    previous: { x: 450, y: 260 },
    minTravelRatio: 0.35,
    rng: () => values[index++] ?? 0.95,
  });

  assert.ok(target.x >= 44 && target.x <= 856);
  assert.ok(target.y >= 44 && target.y <= 476);
  assert.ok(Math.hypot(target.x - 450, target.y - 260) >= 182);
});

test("every training mode uses a strict small target", () => {
  const sizes = Object.values(core.MODES).map((mode) => mode.targetSize);
  assert.deepEqual([...sizes].sort((a, b) => a - b), [12, 18, 24]);
  assert.ok(sizes.every((size) => size <= 24));
});

test("hit testing uses exactly the visible circle with no hidden tolerance", () => {
  const center = { x: 100, y: 100 };
  assert.equal(
    core.isInsideVisibleTarget({ x: 112, y: 100 }, center, 24),
    true,
  );
  assert.equal(
    core.isInsideVisibleTarget({ x: 112.01, y: 100 }, center, 24),
    false,
  );
  assert.equal(
    core.isInsideVisibleTarget({ x: 106, y: 100 }, center, 12),
    true,
  );
  assert.equal(
    core.isInsideVisibleTarget({ x: 106.01, y: 100 }, center, 12),
    false,
  );
});

test("arena coordinates exclude the visible border from their origin", () => {
  const point = core.toArenaPoint(
    { x: 213.5, y: 327.25 },
    {
      left: 100,
      top: 200,
      clientLeft: 1,
      clientTop: 1,
      clientWidth: 900,
      clientHeight: 520,
    },
  );
  assert.equal(point.x, 112.5);
  assert.equal(point.y, 126.25);
});

test("a shot at or after the deadline cannot be scored", () => {
  assert.equal(core.hasSessionExpired(9_999.99, 10_000), false);
  assert.equal(core.hasSessionExpired(10_000, 10_000), true);
  assert.equal(core.hasSessionExpired(10_000.01, 10_000), true);
});

test("session metrics report reaction, path efficiency, pace and score", () => {
  const metrics = core.computeMetrics({
    hits: 12,
    shots: 15,
    reactions: [420, 480, 510],
    efficiencies: [0.8, 0.7, 0.9],
    durationMs: 20_000,
    maxCombo: 5,
    modeMultiplier: 1,
  });

  assert.equal(metrics.averageReaction, 470);
  assert.equal(metrics.pathEfficiency, 80);
  assert.equal(metrics.hitsPerMinute, 36);
  assert.equal(metrics.accuracy, 80);
  assert.ok(metrics.score > 0);
  assert.match(core.rankFor(metrics.score), /^[SABCD]$/);
});

test("only a primary mouse left press is accepted as a scored shot", () => {
  assert.equal(
    core.isMouseShot({ isPrimary: true, pointerType: "mouse", button: 0 }),
    true,
  );
  assert.equal(
    core.isMouseShot({ isPrimary: true, pointerType: "touch", button: 0 }),
    false,
  );
  assert.equal(
    core.isMouseShot({ isPrimary: true, pointerType: "mouse", button: 2 }),
    false,
  );
});

test("practice page requires click-to-hit and exposes required readouts", () => {
  for (const id of [
    "trainer-arena",
    "start-gate",
    "trainer-target",
    "crosshair",
    "timer",
    "hits",
    "reaction",
    "accuracy",
    "efficiency",
    "combo",
    "results-overlay",
    "retest-gate",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.match(html, /addEventListener\("pointermove"/);
  assert.match(html, /addEventListener\("pointerdown"/);
  assert.match(html, /function handleShot/);
  assert.match(html, /state\.shots \+= 1/);
  assert.match(html, /requestAnimationFrame/);
  assert.doesNotMatch(html, /animation:\s*target-in/);
  assert.match(
    html,
    /pointermove", \(event\) => \{\s*if \(event\.pointerType !== "mouse"\) return;/,
  );
  assert.match(html, /touch-action:\s*pan-y/);
});

test("sensitivity page links to the positioning trainer", () => {
  const sensitivityHtml = fs.readFileSync(
    path.resolve("public/pubg-sensitivity.html"),
    "utf8",
  );
  assert.match(sensitivityHtml, /href="\.\/aim-trainer\.html"/);
});
