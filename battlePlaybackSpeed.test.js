import test from "node:test";
import assert from "node:assert/strict";
import { battlePlaybackMultiplier, nextPlaybackSpeed } from "./battlePlaybackSpeed.js";

test("battle speed cycles through normal, double, triple and normal again", () => {
  assert.deepEqual([1, 2, 3, 4].reduce((result) => {
    result.push(nextPlaybackSpeed(result.at(-1)));
    return result;
  }, [1]), [1, 2, 3, 1, 2]);
  assert.deepEqual([battlePlaybackMultiplier(1), battlePlaybackMultiplier(2), battlePlaybackMultiplier(3)], [1, 2, 3]);
  assert.equal(battlePlaybackMultiplier(4), 1);
});
