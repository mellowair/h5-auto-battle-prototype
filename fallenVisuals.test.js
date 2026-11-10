import test from "node:test";
import assert from "node:assert/strict";
import { shouldHideFallenUnit } from "./visualConfig.js";

test("fallen summons and Makima minions leave the arena after three complete rounds", () => {
  for (const unit of [{ summonerId: "tang", alive: false }, { stageThreeMinion: true, alive: false }]) {
    assert.equal(shouldHideFallenUnit(unit, 2, 5), false);
    assert.equal(shouldHideFallenUnit(unit, 2, 6), true);
    assert.equal(shouldHideFallenUnit({ ...unit, alive: true }, 2, 6), false);
  }
  assert.equal(shouldHideFallenUnit({ id: "shin", alive: false }, 2, 10), false);
  assert.equal(shouldHideFallenUnit({ id: "eren", alive: false }, 2, 10), false);
});
