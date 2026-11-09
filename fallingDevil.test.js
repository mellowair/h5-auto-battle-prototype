import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { ELITE_ENEMY_DATA } from "./characters.js";
import { executeAttack, initializeBattle, resolveFallingRoundEnd, simulateBattle, summonAtRoundStart } from "./battle.js";
import { prepareBattle } from "./campaign.js";
import { createStageThreeTestCampaign } from "./dev/stage3-config.js";
import { getCharacterVisual, getGravityLiftPixels } from "./visualConfig.js";

const devil = ELITE_ENEMY_DATA.find((unit) => unit.id === "falling-devil");
const ally = (id, spd = 100, def = 100) => ({ id, name: id, team: "ally", row: "front",
  hp: 30000, currentHp: 30000, atk: 1, def, spd, critChance: 0, normalDodgeRate: 0 });

test("falling devil joins the stage-three elite registry with all eight real art files", () => {
  assert.deepEqual([devil.stageId, devil.row, devil.hp, devil.atk, devil.def, devil.spd], [3, "back", 5300, 250, 130, 140]);
  for (const path of [devil.asset, devil.gravityCircleAsset, devil.dishAsset,
    ...Object.values(devil.animations).flatMap((animation) => Object.values(animation.frames))])
    assert.ok(existsSync(new URL(`./${path}`, import.meta.url)), path);
  const campaign = createStageThreeTestCampaign({ heroId: "naruto", partnerId: "eren", opponent: "falling-devil" });
  const enemy = prepareBattle(campaign).roster.find((unit) => unit.id === "falling-devil");
  assert.equal(campaign.currentBattle.type, "elite");
  assert.deepEqual([enemy.maxHp, enemy.atk, enemy.def, enemy.spd], [5300, 250, 130, 140]);
});

test("falling devil heals 15% of missing HP once after lifting living opponents", () => {
  const state = initializeBattle([ally("hero"), ally("summon"), devil]);
  const enemy = state.characters[2];
  enemy.currentHp = 1000;
  state.round = 3;
  const [fall] = resolveFallingRoundEnd(state);
  assert.equal(fall.type, "gravity-fall");
  assert.equal(fall.hits.length, 2);
  assert.equal(fall.healedAmount, 645);
  assert.equal(fall.devilHpAfter, 1645);
  assert.equal(enemy.currentHp, 1645);
  enemy.currentHp = 5290;
  state.round = 6;
  assert.equal(resolveFallingRoundEnd(state)[0].healedAmount, 1);
  assert.equal(enemy.currentHp, 5291);
  state.characters[0].alive = false;
  state.characters[1].alive = false;
  enemy.currentHp = 1000;
  state.round = 9;
  assert.equal(resolveFallingRoundEnd(state)[0].healedAmount, 0);
  assert.equal(enemy.currentHp, 1000);
  assert.equal(getCharacterVisual(devil).scale, 1.6);
});

test("gravity fixes combat speed at one without changing individual entry speed snapshots", () => {
  assert.ok(getGravityLiftPixels(200) > getGravityLiftPixels(100));
  assert.ok(getGravityLiftPixels(500) > getGravityLiftPixels(200));
  const source = [ally("fast", 200), ally("slow", 50), devil];
  const state = initializeBattle(source);
  assert.deepEqual(state.characters.slice(0, 2).map((unit) => [unit.spd, unit.entryPanelSpd]), [[1, 200], [1, 50]]);
  assert.deepEqual(source.slice(0, 2).map((unit) => unit.spd), [200, 50]);
  state.round = 3;
  const [fall] = resolveFallingRoundEnd(state);
  assert.deepEqual(fall.hits.map((hit) => [hit.baseDamage, hit.afterDefense, hit.actualDamage, hit.stacks]),
    [[1050, 525, 525, 1], [450, 225, 225, 1]]);
});

test("falling happens only every third completed round and stops after the devil dies", () => {
  const state = initializeBattle([ally("hero"), devil]);
  for (const round of [1, 2, 4, 5, 7, 8]) { state.round = round; assert.deepEqual(resolveFallingRoundEnd(state), []); }
  for (const round of [3, 6, 9, 12]) { state.round = round; assert.equal(resolveFallingRoundEnd(state)[0].type, "gravity-fall"); }
  state.characters[1].alive = false;
  state.round = 15;
  assert.deepEqual(resolveFallingRoundEnd(state), []);
});

test("each target clears one gravity stack per 300 actual HP restored", () => {
  const state = initializeBattle([ally("hero"), ally("friend"), devil]);
  const [hero, friend] = state.characters;
  hero.gravityStacks = 4; friend.gravityStacks = 2;
  hero.currentHp -= 2000;
  hero.currentHp += 299;
  assert.deepEqual([hero.gravityStacks, hero.gravityHealProgress], [4, 299]);
  hero.currentHp += 1;
  assert.deepEqual([hero.gravityStacks, hero.gravityHealProgress], [3, 0]);
  hero.currentHp += 650;
  assert.deepEqual([hero.gravityStacks, hero.gravityHealProgress], [1, 50]);
  hero.currentHp += 249;
  assert.deepEqual([hero.gravityStacks, hero.gravityHealProgress], [1, 299]);
  hero.currentHp += 1;
  assert.deepEqual([hero.gravityStacks, hero.gravityHealProgress], [0, 0]);
  hero.currentHp += 200;
  assert.deepEqual([hero.gravityStacks, hero.gravityHealProgress], [0, 0]);
  assert.deepEqual(state.gravityHealEvents.map((event) => [event.targetId, event.layersRemoved]),
    [["hero", 0], ["hero", 1], ["hero", 2], ["hero", 0], ["hero", 1]]);
  friend.currentHp -= 400;
  friend.currentHp += 299;
  assert.deepEqual([friend.gravityStacks, friend.gravityHealProgress], [2, 299]);
  friend.currentHp += 1;
  assert.deepEqual([friend.gravityStacks, friend.gravityHealProgress], [1, 0]);
  friend.currentHp = friend.maxHp + 100;
  assert.deepEqual([friend.gravityStacks, friend.gravityHealProgress], [1, 100]);
  friend.currentHp = friend.maxHp + 200;
  assert.deepEqual([friend.gravityStacks, friend.gravityHealProgress], [1, 100]);
  hero.currentHp -= 500;
  hero.currentHp += 500;
  assert.deepEqual([hero.gravityStacks, hero.gravityHealProgress], [0, 0]);
});

test("a summon created during battle keeps its own 300 HP healing progress", () => {
  const summoner = { ...ally("summoner"), summonPassive: { name: "召唤", firstRound: 1,
    everyRounds: 3, unit: { id: "guard", name: "守卫", team: "ally", hp: 1000,
      atk: 50, def: 100, spd: 80 } } };
  const state = initializeBattle([summoner, devil]);
  state.round = 1;
  const [event] = summonAtRoundStart(state);
  const guard = state.characters.find((unit) => unit.id === event.character.id);
  assert.deepEqual([guard.entryPanelSpd, guard.spd], [80, 1]);
  guard.gravityStacks = 2;
  guard.currentHp -= 600;
  guard.currentHp += 299;
  assert.deepEqual([guard.gravityStacks, guard.gravityHealProgress], [2, 299]);
  guard.currentHp += 301;
  assert.deepEqual([guard.gravityStacks, guard.gravityHealProgress], [0, 0]);
  assert.equal(state.characters[0].gravityStacks, 0);
});

test("critical healing and treasure lifesteal share the 300 HP recovery counter", () => {
  const kaneki = { ...ally("kaneki"), atk: 5000, critChance: 1, passiveSkillId: "kaneki-one-eye",
    passiveLevel: 1, lifesteal: .25 };
  const state = initializeBattle([kaneki, devil]);
  const [hero, enemy] = state.characters;
  state.round = 1;
  hero.currentHp -= 2000;
  hero.gravityStacks = 3;
  const hit = executeAttack(state, hero, enemy, () => .99, { skill: null });
  assert.ok(hit.oneEyeHealedAmount > 0);
  assert.ok(hit.treasureLifesteal > 0);
  const totalRestored = hit.oneEyeHealedAmount + hit.treasureLifesteal;
  const layersRemoved = Math.min(3, Math.floor(totalRestored / 300));
  assert.equal(hero.gravityStacks, 3 - layersRemoved);
  assert.equal(hero.gravityHealProgress, layersRemoved === 3 ? 0 : totalRestored - layersRemoved * 300);
  assert.deepEqual(state.gravityHealEvents.map((event) => event.restored),
    [hit.oneEyeHealedAmount, hit.treasureLifesteal]);
});

test("the fourth fall executes only surviving four-stack targets regardless of remaining HP", () => {
  const state = initializeBattle([ally("hero", 100, 100), ally("friend", 50, 100), devil]);
  state.round = 15;
  state.characters[0].gravityStacks = 3;
  state.characters[1].gravityStacks = 2;
  const events = resolveFallingRoundEnd(state);
  assert.deepEqual(events.map((event) => event.type), ["gravity-fall", "gravity-execution"]);
  assert.equal(events[1].targetId, "hero");
  assert.deepEqual(state.characters.slice(0, 2).map((unit) => [unit.currentHp > 0, unit.alive, unit.gravityStacks]),
    [[false, false, 4], [true, true, 3]]);
  const victim = initializeBattle([ally("fragile", 300, 0), devil]);
  victim.round = 3; victim.characters[0].currentHp = 10;
  const fall = resolveFallingRoundEnd(victim);
  assert.equal(fall[0].hits[0].fellDead, true);
  assert.equal(fall[0].hits[0].stacks, 0);
  assert.equal(fall.some((event) => event.type === "gravity-execution"), false);
});

test("main course executes at 260 defense and deals true damage above 260", () => {
  const boundary = initializeBattle([ally("boundary", 100, 260), devil]);
  boundary.round = 15;
  boundary.characters[0].gravityStacks = 3;
  const boundaryEvents = resolveFallingRoundEnd(boundary);
  assert.deepEqual(boundaryEvents.map((event) => event.type), ["gravity-fall", "gravity-execution"]);
  assert.equal(boundary.characters[0].alive, false);

  const resistant = initializeBattle([ally("resistant", 100, 261), devil]);
  resistant.round = 15;
  resistant.characters[0].gravityStacks = 3;
  const events = resolveFallingRoundEnd(resistant);
  assert.deepEqual(events.map((event) => event.type), ["gravity-fall", "gravity-main-course-damage"]);
  assert.equal(events[1].defenseAtTrigger, 261);
  assert.equal(events[1].requestedDamage, 800);
  assert.equal(events[1].actualDamage, 800);
  assert.equal(events[1].targetDied, false);
  assert.equal(resistant.characters[0].currentHp, events[0].hits[0].hpAfter - 800);
  assert.equal(resistant.characters[0].gravityStacks, 4);
});

test("main course checks current combat defense and applies shield rules", () => {
  const state = initializeBattle([ally("buffed", 100, 250), devil]);
  state.round = 15;
  const target = state.characters[0];
  target.gravityStacks = 3;
  target.defenseBuff = 20;
  target.defenseBuffUntilRound = 15;
  target.shieldHp = 500;
  const events = resolveFallingRoundEnd(state);
  const fall = events[0].hits[0];
  const mainCourse = events[1];
  assert.equal(mainCourse.type, "gravity-main-course-damage");
  assert.equal(mainCourse.defenseAtTrigger, 270);
  assert.equal(mainCourse.shieldAbsorbed, fall.shieldHp);
  assert.equal(mainCourse.actualDamage, 800 - fall.shieldHp);
  assert.equal(target.currentHp, fall.hpAfter - mainCourse.actualDamage);
});

test("main course treats a summon separately from the hero", () => {
  const summon = { ...ally("summon", 120, 300), hp: 900, currentHp: 900,
    originalTeam: "ally", tangSummonKind: "bajie" };
  const state = initializeBattle([ally("hero"), summon, devil]);
  state.round = 15;
  const hero = state.characters[0];
  const summoned = state.characters[1];
  summoned.gravityStacks = 3;
  const events = resolveFallingRoundEnd(state);
  assert.equal(events[1].type, "gravity-main-course-damage");
  assert.equal(events[1].targetId, "summon");
  assert.equal(events[1].targetDied, true);
  assert.equal(summoned.alive, false);
  assert.equal(hero.alive, true);
  assert.equal(hero.gravityStacks, 1);
  assert.equal(events.some((event) => event.type === "gravity-execution"), false);
});

test("full simulation keeps the three-round schedule and normal ranged attacks", () => {
  const result = simulateBattle([ally("hero", 100, 100), devil], () => .99);
  const falls = result.events.filter((event) => event.type === "gravity-fall");
  assert.deepEqual(falls.map((event) => event.round), [3, 6, 9, 12]);
  assert.equal(result.events.filter((event) => event.type === "gravity-execution").length, 1);
  assert.ok(result.events.some((event) => event.type === "attack" && event.attackerId === devil.id && !event.skilled));
  assert.equal(result.outcome, "defeat");
  const early = simulateBattle([{ ...ally("hero"), atk: 100000, spd: 200 }, devil], () => .99);
  assert.equal(early.outcome, "victory");
  assert.equal(early.events.some((event) => event.type === "gravity-fall"), false);
});
