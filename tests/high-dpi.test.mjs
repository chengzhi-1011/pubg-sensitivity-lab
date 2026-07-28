import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const htmlPath = path.resolve("public/pubg-sensitivity.html");
const html = fs.readFileSync(htmlPath, "utf8");
const match = html.match(
  /\/\/ SENSITIVITY_CORE_START([\s\S]*?)\/\/ SENSITIVITY_CORE_END/,
);

assert.ok(match, "HTML must expose a testable sensitivity core block");

const context = {};
vm.createContext(context);
vm.runInContext(
  `${match[1]}\nglobalThis.__SENSITIVITY_CORE__ = SENSITIVITY_CORE;`,
  context,
);
const core = context.__SENSITIVITY_CORE__;

test("3200 DPI can represent a 40 cm/360 target", () => {
  const result = core.solveSensitivity(3200, 40, 103);

  assert.equal(result.feasible, true);
  assert.equal(result.gameSensitivity, 5);
  assert.ok(Math.abs(result.actualCm - 39.67) < 0.1);
  assert.ok(Math.abs(result.errorPct) < 2);
});

test("6400 DPI reports a 40 cm/360 target as infeasible instead of silently pretending", () => {
  const result = core.solveSensitivity(6400, 40, 103);

  assert.equal(result.feasible, false);
  assert.equal(result.gameSensitivity, 1);
  assert.ok(result.rawSensitivity < 1);
  assert.ok(Math.abs(result.actualCm - 23.85) < 0.1);
  assert.ok(Math.abs(result.errorPct) > 35);
});

test("high-DPI recommendation exposes the nearest realizable value and a compatible DPI", () => {
  const result = core.recommendSettings({
    current: {
      dpi: 6400,
      currentSens: 1,
      padWidth: 45,
      fov: 103,
      grip: "mixed",
      style: "balanced",
      recoil: "neutral",
    },
    tracking: {
      accuracy: 75,
      averageXError: 18,
      averageYError: 18,
    },
    flick: {
      hits: 12,
      averageReaction: 520,
      pathEfficiency: 0.76,
    },
    turn: {
      cm360: 23.85,
      purity: 88,
    },
  });

  assert.equal(result.feasibility.status, "dpi-limited");
  assert.equal(result.general, 1);
  assert.ok(result.desiredCm > result.actualCm + 8);
  assert.ok(result.compatibleDpi <= 3200);
  assert.ok(result.actualCm < 24);
});

test("mouse-pad limit cannot be overwritten by the grip lower bound", () => {
  const result = core.recommendSettings({
    current: {
      dpi: 1600,
      currentSens: 20,
      padWidth: 18,
      fov: 103,
      grip: "arm",
      style: "control",
      recoil: "neutral",
    },
    tracking: {
      accuracy: 55,
      averageXError: 20,
      averageYError: 22,
    },
    flick: {
      hits: 7,
      averageReaction: 700,
      pathEfficiency: 0.58,
    },
    turn: {
      cm360: 39.8,
      purity: 70,
    },
  });

  assert.ok(result.appliedTargetCm <= 18 * 1.22 + 0.01);
  assert.equal(result.feasibility.padLimited, true);
});

test("no-click browser scores only make a capped adjustment", () => {
  const worst = core.browserTestFactor(
    { accuracy: 0 },
    { hits: 0, averageReaction: 10_000, pathEfficiency: 0 },
    { purity: 0 },
  );
  const best = core.browserTestFactor(
    { accuracy: 100 },
    { hits: 30, averageReaction: 100, pathEfficiency: 1 },
    { purity: 100 },
  );

  assert.ok(worst <= 1.06);
  assert.ok(best >= 0.94);
  assert.ok(worst > best);
});

test("results UI explains DPI limits instead of presenting a silent clamp", () => {
  for (const id of [
    "feasibility-card",
    "feasibility-title",
    "out-desired-cm",
    "out-actual-cm",
    "out-compatible-solution",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.match(html, /function renderFeasibility\(settings, current\)/);
  assert.match(html, /当前 DPI 已触及游戏最低刻度/);
  assert.match(html, /可实现性 · 受限/);
  assert.match(html, /settings\.actualCm - data\.turn\.cm360/);
});

test("all supported DPI and profile combinations stay inside PUBG input ranges", () => {
  for (const dpi of [100, 400, 800, 1600, 3200, 6400, 12800, 32000]) {
    for (const grip of ["wrist", "mixed", "arm"]) {
      for (const style of ["control", "balanced", "speed"]) {
        for (const padWidth of [18, 45, 100]) {
          const result = core.recommendSettings({
            current: {
              dpi,
              currentSens: 38,
              padWidth,
              fov: 103,
              grip,
              style,
              recoil: "neutral",
            },
            tracking: {
              accuracy: 65,
              averageXError: 20,
              averageYError: 20,
            },
            flick: {
              hits: 10,
              averageReaction: 600,
              pathEfficiency: 0.7,
            },
            turn: {
              cm360: core.pubgCm360(dpi, 38, 103),
              purity: 80,
            },
          });

          const integerValues = [
            result.general,
            result.aim,
            result.ads,
            ...Object.values(result.scopes),
          ];
          assert.ok(
            integerValues.every(
              (value) => Number.isInteger(value) && value >= 1 && value <= 100,
            ),
          );
          assert.ok(result.vertical >= 0.8 && result.vertical <= 1.22);

          if (result.feasibility.dpiLimited) {
            const fallback = core.solveSensitivity(
              result.compatibleDpi,
              result.desiredCm,
              103,
            );
            assert.equal(fallback.feasible, true);
          }
        }
      }
    }
  }
});
