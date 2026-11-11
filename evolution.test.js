import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STARTING_CHARACTERS } from "./characters.js";
import { createRunCharacterState, getSkillAtLevel, getUpgradeableSkills } from "./progression.js";
import { chooseEvolutionUpgrade, evolveTrialParty } from "./evolution.js";
import { executeAttack, initializeBattle, simulateBattle, triggeredSkill } from "./battle.js";
import { SKILL_DATA } from "./skills.js";
import { TANG_SUMMON_WEIGHTS } from "./tangSummons.js";
import { evolvedBattlePresentation } from "./evolvedVisuals.js";
import { getAnimationFrameVisualScale } from "./visualConfig.js";

test("Eren's evolved run frames are individual sprites at one visual scale", () => {
  const eren = evolvedBattlePresentation("eren");
  for (const frame of ["run_1", "run_2"]) {
    const asset = eren.animations.run.frames[frame];
    const png = readFileSync(new URL(asset, import.meta.url));
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    assert.ok(width / height < 1.4, `${frame} must not contain two side-by-side poses`);
    assert.equal(getAnimationFrameVisualScale(eren, "run", frame), 1);
  }
});

test("Naruto's clone protection uses the supplied transparent passive artwork", () => {
  const asset = evolvedBattlePresentation("naruto").passiveProtectionAsset;
  const png = readFileSync(new URL(asset, import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), 1312);
  assert.equal(png.readUInt32BE(20), 1199);
  assert.equal(png[25], 6, "the artwork keeps its RGBA transparency");
});

const starter = (id) => STARTING_CHARACTERS.find((character) => character.id === id);
const effect = (id, level = 1) => ({ ...SKILL_DATA[id], ...SKILL_DATA[id].levels[level], level });
const testUnit = (id, team, props = {}) => ({ id, name: id, team, row: "front", rosterOrder: team === "ally" ? 0 : 1,
  hp: 3000, maxHp: 3000, currentHp: 3000, atk: 100, def: 0, spd: 10, critChance: 0,
  normalDodgeRate: 0, skillDodgeRate: 0, ...props });

test("trial completion evolves only the opening hero and grants its aura to the partner", () => {
  const eren = createRunCharacterState(starter("eren"));
  const kaneki = createRunCharacterState(starter("kaneki"));
  eren.atk = 200; kaneki.atk = 100;
  eren.currentHp = 500;
  const campaign = { trialCompleted: true, evolutionPending: true, status: "trial_result", playerId: "eren", partyIds: ["eren", "kaneki"],
    partyStates: { eren, kaneki } };
  assert.equal(evolveTrialParty(campaign), true);
  assert.equal(evolveTrialParty(campaign), false);
  assert.equal(eren.atk, 220);
  assert.equal(kaneki.atk, 100 + 22);
  assert.equal(eren.currentHp, 500, "raising max HP must not heal");
  assert.deepEqual(eren.learnedActiveSkills, ["eren-hardening", "eren-warhammer"]);
  assert.equal(kaneki.evolution, undefined);
  assert.equal(kaneki.evolutionAuraSources[0].sourceId, "eren");
  assert.equal(eren.passiveSkillId, "eren-paths");
  assert.equal(campaign.status, "evolution_reward");
  assert.deepEqual(campaign.evolutionRewards.order, ["eren"]);
  for (let index = 0; index < 4; index += 1) {
    const id = campaign.evolutionRewards.order[campaign.evolutionRewards.index];
    const skillId = getUpgradeableSkills(campaign.partyStates[id])[0];
    assert.ok(chooseEvolutionUpgrade(campaign, skillId));
  }
  assert.equal(campaign.status, "route");
  assert.equal(chooseEvolutionUpgrade(campaign, "eren-warhammer"), false);
});

test("Tang inherits journey level minus two, keeps level fourteen distribution and independent summon skill chance", () => {
  const tang = createRunCharacterState(starter("tang"));
  tang.skillLevels["journey-west"] = 10;
  const campaign = { trialCompleted: true, evolutionPending: true, partyIds: ["tang"], partyStates: { tang } };
  assert.equal(evolveTrialParty(campaign), true);
  assert.equal(tang.skillLevels["journey-west"], 8);
  assert.equal(tang.learnedActiveSkills.includes("tang-boundless-dharma"), true);
  assert.deepEqual(TANG_SUMMON_WEIGHTS[14], [0, 10, 10, 80]);
  assert.equal(TANG_SUMMON_WEIGHTS[14].reduce((sum, value) => sum + value, 0), 100);
  assert.ok(Math.abs(SKILL_DATA["journey-west"].levels[14].summonSkillChance - .98) < 1e-12);
  assert.equal(SKILL_DATA["journey-west"].levels[14].attackBonus, 150);
  assert.equal(SKILL_DATA["journey-west"].levels[14].summonHpBonus, 1500);
  assert.equal(getSkillAtLevel(tang, "journey-west").level, 8);
});

test("Eren's paths immune counter and emergency heal are separate battle state", () => {
  const roster = [testUnit("eren", "ally", { hp: 1000, maxHp: 1000, currentHp: 500, passiveSkillId: "eren-paths" }),
    testUnit("foe", "enemy", { atk: 400 })];
  const state = initializeBattle(roster);
  state.round = 1;
  const [eren, foe] = state.characters;
  const first = executeAttack(state, foe, eren, () => .99, { skill: null });
  assert.equal(first.trialDamage.pathsImmune, true);
  assert.equal(eren.currentHp, 500);
  const second = executeAttack(state, foe, eren, () => .99, { skill: null });
  assert.equal(second.trialDamage.emergencyHeal, 500);
  assert.equal(eren.currentHp, 600);
  assert.equal(eren.pathsImmuneRemaining, 0);
  assert.equal(eren.pathsEmergencyUsed, true);
});

test("hardening caps DEF at four casts; warhammer retains own DEF", () => {
  const state = initializeBattle([testUnit("eren", "ally", { def: 300 }), testUnit("foe", "enemy", { def: 300 })]);
  state.round = 1;
  const [eren, foe] = state.characters;
  for (let index = 0; index < 6; index += 1) executeAttack(state, eren, foe, () => .99, { skill: effect("eren-hardening", 4) });
  assert.equal(eren.hardeningStacks, 4);
  assert.equal(eren.defenseBuff, 100);
  const hit = executeAttack(state, eren, foe, () => .99, { skill: effect("eren-warhammer", 3) });
  assert.equal(hit.damage > 0, true);
  assert.equal(eren.def, 300);
  assert.equal(hit.skillAttackPower, 500);
});

test("both base and evolved Eren and Naruto roll each action skill independently", () => {
  for (const [id, firstId, secondId] of [
    ["eren", "eren-free-will", "eren-tatakae"],
    ["naruto", "shadow-clone-rush", "rasengan"],
    ["eren", "eren-hardening", "eren-warhammer"],
    ["naruto", "naruto-multi-clone", "naruto-giant-rasengan"],
  ]) {
    const character = { id, skills: [effect(firstId, 4), effect(secondId, 4)] };
    const roll = (...values) => { let index = 0; return () => values[index++]; };
    assert.equal(triggeredSkill(character, roll(.1, .1, .9))?.id, secondId);
    assert.equal(triggeredSkill(character, roll(.1, .1, .1))?.id, firstId);
    assert.equal(triggeredSkill(character, roll(.99, .1))?.id, secondId);
    assert.equal(triggeredSkill(character, roll(.1, .99))?.id, firstId);
  }
});

test("future two-skill characters use the same rolls while special triggers stay separate", () => {
  const character = { id: "future-hero", bitesDustNextAvailableRound: 5, skills: [
    { id: "first", chance: 1, triggerType: "on_action" },
    { id: "second", chance: 1, triggerType: "on_action" },
    { id: "meditation", chance: 1, triggerType: "on_meditation" },
    { id: "retaliation", chance: 1, triggerType: "on_damage" },
  ] };
  const roll = (...values) => { let index = 0; return () => values[index++]; };
  assert.equal(triggeredSkill(character, roll(0, 0, .9))?.id, "second");
  assert.equal(triggeredSkill(character, roll(0, 0, .1))?.id, "first");
  character.skills[0] = { id: "bites-the-dust", chance: 1, triggerType: "on_action" };
  assert.equal(triggeredSkill(character, roll(0), 4)?.id, "second");
  assert.equal(triggeredSkill(character, roll(0, 0, .1), 5)?.id, "bites-the-dust");
});

test("warhammer vulnerability raises incoming HP damage through the next round and then expires", () => {
  const state = initializeBattle([testUnit("eren", "ally", { evolutionPhase: 2, def: 100, hp: 3000, maxHp: 3000, currentHp: 3000 }),
    testUnit("foe", "enemy", { atk: 400, hp: 10000, maxHp: 10000, currentHp: 10000 })]);
  const [eren, foe] = state.characters;
  state.round = 2;
  const cast = executeAttack(state, eren, foe, () => .99, { skill: effect("eren-warhammer", 4) });
  assert.equal(cast.warhammerVulnerableUntilRound, 3);
  const expectedBase = 200;
  for (const [round, expected] of [[2, 240], [3, 240], [4, expectedBase]]) {
    state.round = round;
    eren.currentHp = eren.maxHp;
    const hit = executeAttack(state, foe, eren, () => .99, { skill: null });
    assert.equal(hit.actualDamage, expected);
  }
});

test("Kaneki glutton kills raise max HP by 50 at Lv1-3 and 100 at Lv4", () => {
  for (const level of [1, 2, 3]) assert.equal(effect("kaneki-glutton", level).killMaxHpBonus, 50);
  const run = createRunCharacterState(starter("kaneki"));
  run.maxHp = 1000;
  const state = initializeBattle([testUnit("kaneki", "ally", { hp: 1000, maxHp: 1000, currentHp: 500,
    atk: 200, spd: 100, passiveSkillId: "kaneki-one-eye-king" }),
    testUnit("foe", "enemy", { hp: 100, maxHp: 100, currentHp: 100 })],
    { runCharacterStates: { kaneki: run }, playerId: "kaneki" });
  state.round = 1;
  const [kaneki, foe] = state.characters;
  const hit = executeAttack(state, kaneki, foe, () => .99, { skill: effect("kaneki-glutton", 4) });
  assert.equal(hit.predatorKillBonus, 100);
  assert.equal(run.maxHp, 1100);
  assert.equal(kaneki.maxHp, 1100);
  assert.equal(hit.oneEyeTriggered, false);
});

test("Naruto starts with two clones, gains one on each Lv4 multi-clone cast, and gains chakra", () => {
  const result = simulateBattle([
    testUnit("naruto", "ally", { atk: 200, spd: 100, hp: 5000, maxHp: 5000, currentHp: 5000,
      passiveSkillId: "naruto-nine-tails-bond", extraPassiveSkillIds: ["naruto-chakra-clones"],
      skills: [effect("naruto-multi-clone", 4), effect("naruto-giant-rasengan", 4)] }),
    testUnit("foe", "enemy", { hp: 5000, maxHp: 5000, currentHp: 5000, atk: 1, def: 200 })
  ], () => .49);
  assert.equal(result.outcome, "victory");
  assert.ok(result.events.some((event) => event.type === "evolution-clone-gain"));
  assert.ok(result.finalCharacters.find((unit) => unit.id === "naruto").chakraClones > 2);
});

test("Tang's boundless dharma triggers each fourth meditation round while his three-round strike continues", () => {
  const result = simulateBattle([
    testUnit("tang", "ally", { hp: 4000, maxHp: 4000, currentHp: 4000, atk: 100, spd: 100,
      passiveSkillId: "tang-compassion", skills: [effect("journey-west", 1), effect("tang-boundless-dharma", 4)] }),
    testUnit("foe", "enemy", { hp: 1500, maxHp: 1500, currentHp: 1500, atk: 10, def: 300, spd: 1 })
  ], () => .5);
  assert.equal(result.outcome, "victory");
  assert.ok(result.events.some((event) => event.type === "evolution-dharma" && event.round === 5));
  assert.ok(result.events.some((event) => event.skillId === "tang-meditation-strike"));
});

test("Kaneki's 2000-14 tracks incoming hits and outgoing attacks, with a repeatable ten-hit counter", () => {
  const result = simulateBattle([
    testUnit("kaneki", "ally", { hp: 4500, maxHp: 4500, currentHp: 4500, atk: 1, spd: 10,
      skills: [effect("kaneki-2000-14", 4)] }),
    testUnit("foe", "enemy", { hp: 20000, maxHp: 20000, currentHp: 20000, atk: 100, spd: 20 })
  ], () => .5);
  const kaneki = result.finalCharacters.find((unit) => unit.id === "kaneki");
  assert.ok(kaneki.damageTakenHits >= 10);
  assert.ok(kaneki.attackActionHits >= 10);
  assert.ok(result.events.filter((event) => event.skillId === "kaneki-2000-14-counter").length >= 1);
  assert.ok(kaneki.reactiveCritDamageBonus > 0);
});

test("Naruto's chakra clone protects a critically injured teammate, while Tang shares damage with the player partner", () => {
  const state = initializeBattle([
    testUnit("naruto", "ally", { hp: 2000, maxHp: 2000, currentHp: 2000,
      passiveSkillId: "naruto-nine-tails-bond", extraPassiveSkillIds: ["naruto-chakra-clones"] }),
    testUnit("tang", "ally", { hp: 1000, maxHp: 1000, currentHp: 100,
      passiveSkillId: "tang-compassion" }),
    testUnit("foe", "enemy", { atk: 400 })]);
  state.round = 1;
  state.random = () => 0;
  const [naruto, tang, foe] = state.characters;
  executeAttack(state, foe, naruto, () => .99, { skill: null });
  assert.equal(naruto.chakraClones, 2, "Naruto's own hit does not spend a protective clone");
  foe.atk = 500;
  const hit = executeAttack(state, foe, tang, () => .99, { skill: null });
  assert.equal(naruto.chakraClones, 1);
  assert.equal(hit.trialDamage.cloneSpent, true);
  assert.equal(hit.trialDamage.clonesRemaining, 1);
  assert.equal(hit.trialDamage.sharedDamage.targetId, "naruto");
  assert.ok(hit.trialDamage.sharedDamage.amount > 0);
});

test("chakra clone protection starts below 50% pre-hit HP and consumes one clone per attack", () => {
  const state = initializeBattle([
    testUnit("naruto", "ally", { hp: 2000, maxHp: 2000, currentHp: 2000,
      extraPassiveSkillIds: ["naruto-chakra-clones"] }),
    testUnit("eren", "ally", { hp: 1000, maxHp: 1000, currentHp: 500 }),
    testUnit("foe", "enemy", { atk: 80 })]);
  state.round = 1;
  const [naruto, teammate, foe] = state.characters;
  let hit = executeAttack(state, foe, teammate, () => .99, { skill: null });
  assert.equal(hit.trialDamage.cloneSpent, false);
  assert.equal(naruto.chakraClones, 2);
  teammate.currentHp = 499;
  hit = executeAttack(state, foe, teammate, () => .99, { skill: null });
  assert.equal(hit.trialDamage.cloneSpent, true);
  assert.equal(hit.damage, 56);
  assert.equal(naruto.chakraClones, 1);
  hit = executeAttack(state, foe, teammate, () => .99, { skill: null });
  assert.equal(hit.trialDamage.cloneSpent, true);
  assert.equal(naruto.chakraClones, 0);
  hit = executeAttack(state, foe, teammate, () => .99, { skill: null });
  assert.equal(hit.trialDamage.cloneSpent, false);
});

test("giant Rasengan bursts on every third cast without chakra", () => {
  const giant = { ...effect("naruto-giant-rasengan", 4), chance: 1 };
  const result = simulateBattle([
    testUnit("naruto", "ally", { hp: 5000, maxHp: 5000, currentHp: 5000, atk: 100, spd: 1000,
      extraPassiveSkillIds: ["naruto-chakra-clones"], skills: [giant] }),
    testUnit("foe", "enemy", { hp: 10000, maxHp: 10000, currentHp: 10000, atk: 1, def: 100 })
  ], () => .5);
  const casts = result.events.filter((event) => event.type === "attack" && event.skillId === "naruto-giant-rasengan");
  assert.ok(casts.length >= 3);
  assert.deepEqual(casts.slice(0, 3).map((event) => Boolean(event.chakraBurstVisual)), [false, false, true]);
  assert.equal(result.finalCharacters.find((unit) => unit.id === "naruto").chakra, undefined);
});

test("new descriptions and enemy squad use level buttons and portrait cards", () => {
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(app, /add\("释放概率"/);
  assert.match(app, /add\("技能描述"/);
  assert.match(app, /add\(`Lv\.\$\{selectedLevel\} 效果`/);
  assert.match(app, /portrait\.src = enemy\.asset/);
  assert.doesNotMatch(app, /lines\[1\]\.textContent = `ATK/);
});

test("Attack Titan coordinate adds damage from missing HP after landed normal attacks", () => {
  const result = simulateBattle([
    testUnit("eren", "ally", { hp: 1000, maxHp: 1000, currentHp: 500, atk: 100,
      spd: 100, evolutionPhase: 2, passiveSkillId: "eren-paths" }),
    testUnit("foe", "enemy", { hp: 5000, maxHp: 5000, currentHp: 5000, atk: 2000, spd: 1 })
  ], () => .99);
  const primary = result.events.find((event) => event.type === "attack" && event.attackerId === "eren");
  const extra = result.events.find((event) => event.type === "attack-titan-hp-damage");
  assert.ok(primary.actualDamage > 0);
  assert.deepEqual([extra.hpSnapshot, extra.power, extra.actualDamage], [500, 100, 100]);
  assert.equal(result.events.indexOf(extra), result.events.indexOf(primary) + 1);
});

test("Attack Titan coordinate uses max HP for skills and triggers once per successful hit", () => {
  const warhammer = { ...effect("eren-warhammer"), chance: 1 };
  const result = simulateBattle([
    testUnit("eren", "ally", { hp: 1000, maxHp: 1000, currentHp: 800, atk: 100, def: 100,
      spd: 100, evolutionPhase: 2, passiveSkillId: "eren-paths", skills: [warhammer] }),
    testUnit("foe", "enemy", { hp: 10000, maxHp: 10000, currentHp: 10000, atk: 1, spd: 1 }),
  ], () => .99);
  const primary = result.events.find((event) => event.type === "attack" && event.attackerId === "eren");
  const extra = result.events.find((event) => event.type === "attack-titan-hp-damage");
  assert.equal(primary.skillId, "eren-warhammer");
  assert.deepEqual([extra.attackKind, extra.power, extra.actualDamage], ["skill", 100, 100]);
  assert.equal(result.events.indexOf(extra), result.events.indexOf(primary) + 1);
  assert.equal(result.events.filter((event) => event.type === "attack-titan-hp-damage").length,
    result.events.filter((event) => event.type === "attack" && event.attackerId === "eren" && event.actualDamage > 0 && !event.targetDied).length);
});

test("One Eye King keeps its crit rate for the battle and crit damage for five rounds", () => {
  const state = initializeBattle([
    testUnit("kaneki", "ally", { hp: 1000, maxHp: 1000, currentHp: 410, atk: 100,
      passiveSkillId: "kaneki-one-eye-king" }),
    testUnit("foe", "enemy", { hp: 5000, maxHp: 5000, currentHp: 5000, atk: 100 })]);
  const [kaneki, foe] = state.characters;
  state.round = 2;
  const hit = executeAttack(state, foe, kaneki, () => .99, { skill: null });
  assert.equal(hit.trialDamage.oneEyeKingTriggered, true);
  assert.equal(kaneki.oneEyeKingUntilRound, 6);
  assert.equal(getCritChanceForTest(kaneki), .6);
  state.round = 6;
  const active = executeAttack(state, kaneki, foe, (() => { const rolls = [.99, .5]; return () => rolls.shift() ?? .99; })(), { skill: null });
  state.round = 7;
  const expired = executeAttack(state, kaneki, foe, (() => { const rolls = [.99, .5]; return () => rolls.shift() ?? .99; })(), { skill: null });
  assert.equal(active.critical, true);
  assert.equal(expired.critical, true);
  assert.ok(active.calculatedDamage > expired.calculatedDamage);
  assert.equal(getCritChanceForTest(kaneki), .6);
  foe.currentHp = 1; foe.alive = true;
  const lateKill = executeAttack(state, kaneki, foe, () => .99, { skill: null });
  assert.equal(lateKill.oneEyeKingAttackBonus, 0);
});

const getCritChanceForTest = (unit) => Math.min(1, (unit.critChance ?? 0) + (unit.critRateBonus ?? 0));

test("Nine Tails clone skill has the requested four levels and gains clones only on cast", () => {
  const expected = [[.5, 1.5, 1], [.6, 1.8, 1], [.7, 2.1, 1], [.7, 2.5, 2]];
  for (const [index, [chance, multiplier, cloneGain]] of expected.entries()) {
    const skill = effect("naruto-multi-clone", index + 1);
    assert.deepEqual([skill.chance, skill.multiplier, skill.splashRatio,
      skill.singleTargetSplashRatio, skill.cloneGain], [chance, multiplier, .75, .5, cloneGain]);
    const result = simulateBattle([
      testUnit("naruto", "ally", { atk: 100, spd: 100, hp: 1000, currentHp: 1000,
        extraPassiveSkillIds: ["naruto-chakra-clones"], skills: [skill] }),
      testUnit("foe", "enemy", { hp: 1000, currentHp: 1000, atk: 2000, spd: 1 })], () => 0);
    const gain = result.events.find((event) => event.type === "evolution-clone-gain");
    assert.equal(gain.count, 2 + cloneGain);
    assert.ok(result.events.some((event) => event.skillId === "naruto-multi-clone" && event.splash));
  }
  const failed = simulateBattle([
    testUnit("naruto", "ally", { atk: 100, spd: 100,
      extraPassiveSkillIds: ["naruto-chakra-clones"], skills: [effect("naruto-multi-clone", 1)] }),
    testUnit("foe", "enemy", { hp: 500, currentHp: 500, atk: 2000, spd: 1 })], () => .99);
  assert.equal(failed.events.some((event) => event.type === "evolution-clone-gain"), false);
});
