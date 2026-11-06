import test from "node:test";
import assert from "node:assert/strict";
import { AUTO_SPEED_LOG_THRESHOLD, battlePlaybackMultiplier, isAutoSpeedActive } from "./battlePlaybackSpeed.js";

test("a battle gains one extra 2x speed layer only after its 100th log", () => {
  assert.equal(AUTO_SPEED_LOG_THRESHOLD, 100);
  assert.equal(isAutoSpeedActive(100), false);
  assert.equal(isAutoSpeedActive(101), true);
  assert.equal(battlePlaybackMultiplier(100, false), 1);
  assert.equal(battlePlaybackMultiplier(101, false), 2);
  assert.equal(battlePlaybackMultiplier(100, true), 2);
  assert.equal(battlePlaybackMultiplier(101, true), 4);
  assert.equal(battlePlaybackMultiplier(0, true), 2, "a new battle loses only its automatic layer");
});
