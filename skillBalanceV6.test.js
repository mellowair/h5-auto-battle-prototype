import test from "node:test";
import assert from "node:assert/strict";
import { chooseTarget, executeAttack, getCritChance, initializeBattle } from "./battle.js";
import { getStageTwoNormalEnemyStats } from "./campaign.js";
import { SKILL_DATA } from "./skills.js";

const unit = (id, team, extra = {}) => ({ id, team, row: "front", atk: 100, def: 0,
  spd: 50, maxHp: 10000, currentHp: 10000, critChance: 0, ...extra });

test("Tatakae redirects next-round single-target attacks and expires after that round", () => {
  const skill = { ...SKILL_DATA["eren-tatakae"], ...SKILL_DATA["eren-tatakae"].levels[1], level: 1 };
  const battle = initializeBattle([unit("eren", "ally", { row: "back", skills: [skill] }),
    unit("partner", "ally"), unit("foe", "enemy")]);
  const [eren, partner, foe] = battle.characters;
  battle.round = 1;
  assert.equal(chooseTarget(battle, foe, () => .99), partner);
  executeAttack(battle, eren, foe, () => .99, { skill });
  battle.round = 2;
  assert.equal(chooseTarget(battle, foe, () => .99), eren);
  executeAttack(battle, eren, foe, () => .99, { skill });
  assert.deepEqual(eren.tauntRounds, [2, 3]);
  battle.round = 3;
  assert.equal(chooseTarget(battle, foe, () => .99), eren);
  battle.round = 4;
  assert.equal(chooseTarget(battle, foe, () => .99), partner);
  eren.currentHp = 0; eren.alive = false;
  battle.round = 3;
  assert.equal(chooseTarget(battle, foe, () => .99), partner);
});

test("One Eye level two increases crit multiplier additively while retaining 40% crit healing", () => {
  const battle = initializeBattle([unit("kaneki", "ally", { passiveSkillId: "kaneki-one-eye", passiveLevel: 2,
    critChance: .9, critMultiplier: 1.5, currentHp: 100 }), unit("foe", "enemy")]);
  const [kaneki, foe] = battle.characters;
  battle.round = 1;
  assert.equal(getCritChance(kaneki), 1);
  const critical = executeAttack(battle, kaneki, foe, () => .99, { skill: null });
  assert.equal(critical.critical, true);
  assert.equal(critical.calculatedDamage, 170);
  assert.equal(critical.oneEyeHealedAmount, 68);
  assert.equal(kaneki.currentHp, 168);
});

test("Jinchuriki level two removes its combat ATK bonus when lifesteal reaches half HP", () => {
  const battle = initializeBattle([unit("naruto", "ally", { atk: 170, maxHp: 1000, currentHp: 490,
    passiveSkillId: "jinchuriki", passiveLevel: 2 }), unit("foe", "enemy")]);
  const [naruto, foe] = battle.characters;
  battle.round = 1;
  const first = executeAttack(battle, naruto, foe, () => .99, { skill: null });
  assert.equal(first.jinchurikiTriggered.effectiveAtk, 221);
  assert.equal(first.jinchurikiLifesteal, 44);
  assert.equal(naruto.currentHp, 534);
  assert.equal(naruto.atk, 170);
  assert.equal(naruto.jinchurikiActive, false);
  const second = executeAttack(battle, naruto, foe, () => .99, { skill: null });
  assert.equal(second.jinchurikiLifesteal, 0);
});

test("second-stage final normal stats use local steps 1-5, 6-10, and 11 onward", () => {
  const expected = [
    [1, [1500, 130, 90, 60], [1200, 160, 50, 30]],
    [5, [1500, 130, 90, 60], [1200, 160, 50, 30]],
    [6, [1800, 150, 100, 65], [1400, 180, 60, 40]],
    [10, [1800, 150, 100, 65], [1400, 180, 60, 40]],
    [11, [1900, 160, 110, 70], [1500, 200, 70, 50]],
    [15, [1900, 160, 110, 70], [1500, 200, 70, 50]],
  ];
  for (const [step, guard, mage] of expected) {
    const values = (id) => { const { hp, atk, def, spd } = getStageTwoNormalEnemyStats(id, step); return [hp, atk, def, spd]; };
    assert.deepEqual(values("guard"), guard, `front at local step ${step}`);
    assert.deepEqual(values("mage"), mage, `back at local step ${step}`);
  }
});
