import test from "node:test";
import assert from "node:assert/strict";
import { executeAttack, getCritChance, getDodgeChance, getSkillDodgeChance, initializeBattle, simulateBattle } from "./battle.js";
import { STARTING_CHARACTERS } from "./characters.js";
import { createRunCharacterState, getTreasureCombatModifiers, grantAdventureSpecialReward } from "./progression.js";
import { SKILL_DATA } from "./skills.js";

const unit = (id, team, extras = {}) => ({ id, team, name: id, row: "front", position: "front",
  hp: 10000, maxHp: 10000, currentHp: 10000, atk: 100, def: 0, spd: 0,
  critChance: 0, normalDodgeRate: 0, skills: [], ...extras });

test("Quinque combination increases low-HP critical stats and guard uses only when both are owned", () => {
  const low = { currentHp: 500, maxHp: 1000, critChance: .05, quinqueCrit: true };
  assert.equal(getCritChance(low), .35);
  assert.equal(getCritChance({ ...low, quinqueGuard: true }), .55);
  const attacker = unit("attacker", "enemy");
  const guard = unit("guard", "ally", { quinqueGuard: true, quinqueCrit: true });
  const state = initializeBattle([attacker, guard]);
  state.round = 1;
  for (let i = 0; i < 3; i++)
    assert.equal(executeAttack(state, state.characters[0], state.characters[1], () => 0).quinqueGuardTriggered, true);
  assert.equal(state.characters[1].quinqueGuardUses, 3);
  assert.equal(executeAttack(state, state.characters[0], state.characters[1], () => 0).quinqueGuardTriggered, false);
});

test("White Kaneki dodge doubles only below forty percent and direct skill bonuses are added afterward", () => {
  const kaneki = { id: "kaneki", evolutionPhase: 2, maxHp: 1000, currentHp: 400,
    spd: 0, normalDodgeRate: .15, skillDodgeRateBonus: .02 };
  assert.equal(getDodgeChance(kaneki), .15);
  assert.ok(Math.abs(getSkillDodgeChance(kaneki) - .07) < 1e-12);
  kaneki.currentHp = 399;
  assert.equal(getDodgeChance(kaneki), .30);
  assert.ok(Math.abs(getSkillDodgeChance(kaneki) - .14) < 1e-12);
  const run = createRunCharacterState(STARTING_CHARACTERS[0]);
  assert.ok(grantAdventureSpecialReward(run, "six-ear-reward", "six_ear_true_form"));
  const modifiers = getTreasureCombatModifiers(run);
  assert.equal(modifiers.skillDodgeRateBonus, .05);
  assert.ok(Math.abs(getSkillDodgeChance({ spd: 0, ...modifiers }) - (.02 / 3 + .05)) < 1e-12);
});

test("Armament Haki heals from HP damage after its true-damage normal hit", () => {
  const state = initializeBattle([unit("hero", "ally", { currentHp: 500,
    extraPassiveSkillIds: ["armament-haki"] }), unit("foe", "enemy", { def: 1000 })]);
  state.round = 1;
  const [hero, foe] = state.characters;
  const hit = executeAttack(state, hero, foe, () => .99);
  assert.equal(hit.armamentTrueDamage, true);
  assert.equal(hit.actualDamage, 110);
  assert.equal(hit.armamentHeal, 11);
  assert.equal(hero.currentHp, 511);
});

test("Heavenly Restriction damage reduction uses four punches and protects against later hits", () => {
  const target = unit("hero", "ally", { def: 0, heavenlyDamageReduction: true });
  const attacker = unit("foe", "enemy", { atk: 200 });
  const state = initializeBattle([attacker, target]);
  state.round = 1;
  state.characters[1].heavenlyDamageReduction = true;
  const hit = executeAttack(state, state.characters[0], state.characters[1], () => .99);
  assert.equal(hit.actualDamage, 180);
});

test("each Journey West summon kill grants its level-gated permanent growth to Tang", () => {
  const tangTemplate = STARTING_CHARACTERS.find((entry) => entry.id === "tang");
  for (const [kind, level, expected] of [
    ["white-horse", 3, { spd: 5 }], ["bajie", 5, { maxHp: 50 }],
    ["shaseng", 7, { def: 5 }], ["wukong", 10, { atk: 5, def: 5, spd: 5, maxHp: 50 }],
  ]) {
    const run = createRunCharacterState(tangTemplate);
    const before = Object.fromEntries(Object.keys(expected).map((stat) => [stat, run[stat]]));
    const journey = { ...SKILL_DATA["journey-west"], ...SKILL_DATA["journey-west"].levels[level], level };
    const tang = unit("tang", "ally", { atk: 1, spd: 0, skills: [journey] });
    const summon = unit(`tang-${kind}`, "ally", { tangSummonKind: kind, summonerId: "tang", atk: 500, spd: 100 });
    const foe = unit("foe", "enemy", { hp: 100, maxHp: 100, currentHp: 100, spd: 0 });
    const result = simulateBattle([tang, summon, foe], () => .99, { runCharacterState: run });
    const hit = result.events.find((event) => event.attackerId === summon.id && event.targetDied);
    assert.deepEqual(hit?.tangSummonGrowth, { recipientId: "tang", ...expected }, kind);
    for (const [stat, amount] of Object.entries(expected)) assert.equal(run[stat], before[stat] + amount, kind);
  }
});

test("Wukong AOE counts two defeated enemies as two permanent growth triggers", () => {
  const run = createRunCharacterState(STARTING_CHARACTERS.find((entry) => entry.id === "tang"));
  const before = { atk: run.atk, def: run.def, spd: run.spd, maxHp: run.maxHp };
  const journey = { ...SKILL_DATA["journey-west"], ...SKILL_DATA["journey-west"].levels[10], level: 10 };
  const fate = { ...SKILL_DATA["wukong-fate"], ...SKILL_DATA["wukong-fate"].levels[1], level: 1, chance: 1 };
  const result = simulateBattle([
    unit("tang", "ally", { atk: 1, spd: 0, skills: [journey] }),
    unit("tang-wukong", "ally", { tangSummonKind: "wukong", summonerId: "tang", atk: 500,
      spd: 100, wukongSkillCasts: 1, skills: [fate] }),
    unit("foe-a", "enemy", { hp: 100, maxHp: 100, currentHp: 100 }),
    unit("foe-b", "enemy", { hp: 100, maxHp: 100, currentHp: 100 }),
  ], () => 0, { runCharacterState: run });
  assert.equal(result.events.filter((event) => event.wukongTeleportAttack && event.targetDied && event.tangSummonGrowth).length, 2);
  for (const stat of ["atk", "def", "spd"]) assert.equal(run[stat], before[stat] + 10);
  assert.equal(run.maxHp, before.maxHp + 100);
});
