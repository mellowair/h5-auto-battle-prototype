import assert from "node:assert/strict";
import { test } from "node:test";
import { executeAttack, initializeBattle, simulateBattle, triggeredSkill } from "./battle.js";
import { ELITE_ENEMY_DATA, TRIAL_ENEMY_DATA } from "./characters.js";
import { eliteDropId } from "./campaign.js";
import { GUN_DEVIL, YORU } from "./hiddenBoss.js";
import { SKILL_DATA } from "./skills.js";

const enemy = (id) => ({ ...ELITE_ENEMY_DATA.find((entry) => entry.id === id), team: "enemy" });
const ally = (overrides = {}) => ({ id: "hero", name: "主角", team: "ally", type: "player",
  row: "front", position: "front", hp: 2000, atk: 1, def: 0, spd: 1, ...overrides });

test("new stage-one elites, hidden bosses, and Heracles use the requested panel stats", () => {
  assert.deepEqual([enemy("swamp-giant").hp, enemy("swamp-giant").atk,
    enemy("swamp-giant").def, enemy("swamp-giant").spd], [1300, 80, 60, 30]);
  assert.deepEqual([enemy("eternity-devil").hp, enemy("eternity-devil").atk,
    enemy("eternity-devil").def, enemy("eternity-devil").spd], [1900, 40, 50, 20]);
  assert.ok(["swamp-giant", "eternity-devil"].every((id) => enemy(id).row === "front"));
  assert.deepEqual([GUN_DEVIL.hp, GUN_DEVIL.atk, GUN_DEVIL.def, GUN_DEVIL.spd], [4500, 999, 220, 300]);
  assert.deepEqual([YORU.hp, YORU.atk, YORU.def, YORU.spd], [5500, 1444, 230, 250]);
  assert.deepEqual([TRIAL_ENEMY_DATA.heracles.atk, TRIAL_ENEMY_DATA.heracles.def], [420, 180]);
  assert.equal(eliteDropId({ currentBattle: { type: "elite", enemies: ["swamp-giant"] } }), "giant_spinal_fluid");
});

test("poison flask rolls at 70%, stacks on all living allies, and ticks once per round", () => {
  const skill = SKILL_DATA["swamp-poison-flask"];
  const flask = { ...skill, ...skill.levels[1], level: 1 };
  const swamp = { ...enemy("swamp-giant"), skills: [flask], skill: flask };
  assert.equal(triggeredSkill(swamp, () => .69)?.id, flask.id);
  assert.equal(triggeredSkill(swamp, () => .70), null);
  const result = simulateBattle([ally(), ally({ id: "partner", name: "伙伴" }), swamp], () => .5);
  const casts = result.events.filter((event) => event.type === "swamp-poison");
  assert.ok(casts.length >= 2);
  assert.deepEqual(casts[0].targets.map((entry) => entry.stacks), [1, 1]);
  assert.deepEqual(casts[1].targets.map((entry) => entry.stacks), [2, 2]);
  const poisonTicks = result.events.filter((event) => event.type === "trial-dot" && event.name === "中毒" && event.targetId === "hero");
  assert.deepEqual(poisonTicks.slice(0, 2).map((event) => [event.round, event.stacks, event.damage]),
    [[1, 1, 20], [2, 2, 40]]);
  assert.equal(poisonTicks.filter((event) => event.round === 2).length, 1);
});

test("poison reduces combat ATK and DEF by two percent per layer", () => {
  const foe = { id: "foe", name: "敌人", team: "enemy", row: "front", position: "front",
    hp: 3000, atk: 100, def: 100, spd: 1 };
  const baseline = initializeBattle([ally({ atk: 100, def: 100 }), foe]);
  baseline.round = 1;
  const baseHit = executeAttack(baseline, baseline.characters[0], baseline.characters[1], () => .99);
  const poisonedAttacker = initializeBattle([ally({ atk: 100, def: 100, poisonStacks: 10 }), foe]);
  poisonedAttacker.round = 1;
  const weakHit = executeAttack(poisonedAttacker, poisonedAttacker.characters[0], poisonedAttacker.characters[1], () => .99);
  assert.ok(weakHit.actualDamage < baseHit.actualDamage);
  const poisonedDefender = initializeBattle([ally({ atk: 100 }), { ...foe, poisonStacks: 10 }]);
  poisonedDefender.round = 1;
  const strongerHit = executeAttack(poisonedDefender, poisonedDefender.characters[0], poisonedDefender.characters[1], () => .99);
  assert.ok(strongerHit.actualDamage > baseHit.actualDamage);
});

test("Eternity grows through round eight and applies suffocation from round five", () => {
  const result = simulateBattle([ally({ def: 50 }), enemy("eternity-devil")], () => .99);
  const growth = result.events.filter((event) => event.type === "eternity-growth");
  assert.deepEqual(growth.map((event) => event.round), [2, 3, 4, 5, 6, 7, 8]);
  assert.ok(Math.abs(growth.at(-1).scaleFactor - 3.1) < 1e-9);
  assert.equal(result.events.filter((event) => event.type === "eternity-suffocation").length, 1);
  const awakening = result.events.find((event) => event.type === "eternity-suffocation");
  assert.deepEqual([awakening.round, awakening.attackBonus, awakening.effectiveAtk], [5, 50, 90]);
  assert.equal(result.finalCharacters.find((unit) => unit.id === "eternity-devil").atk, 90,
    "the awakening ATK bonus applies only once");
  const state = initializeBattle([ally({ def: 0 }), enemy("eternity-devil")]);
  state.round = 8;
  state.characters[0].suffocating = true;
  const hit = executeAttack(state, state.characters[1], state.characters[0], () => .99);
  assert.equal(2000 - state.characters[0].maxHp, hit.actualDamage);
  assert.equal(state.characters[0].currentHp, state.characters[0].maxHp);
});
