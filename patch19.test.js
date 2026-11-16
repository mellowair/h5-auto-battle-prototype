import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { STARTING_CHARACTERS } from "./characters.js";
import { executeAttack, initializeBattle, simulateBattle } from "./battle.js";
import { applyRadarEssenceGrowth, createCampaign, finishBattle, prepareBattle, selectStartingCharacter, startCampaign } from "./campaign.js";
import { claimTreasure, createRunCharacterState, resolveCampfire } from "./progression.js";
import { SHOP_RULES } from "./shopConfig.js";
import { GIANT_SPINAL_FLUID, GUN_DEVIL_FRAGMENT, SKILL_DATA, TREASURE_DATA } from "./skills.js";
import { YORU } from "./hiddenBoss.js";
import { evolveTrialParty } from "./evolution.js";

const unit = (id, team, extras = {}) => ({ id, team, name: id, row: "front", position: "front",
  hp: 1000, maxHp: 1000, currentHp: 1000, atk: 100, def: 0, spd: 100, critChance: 0,
  skills: [], ...extras });

test("passive skill books have battle artwork, battle-start presentation, and their own shop prices", () => {
  const books = SHOP_RULES.books.filter((book) => book.skillType === "passive");
  assert.deepEqual(books.map((book) => book.price), [40, 30, 40, 40, 30, 40, 30]);
  for (const book of books) assert.ok(existsSync(book.effectImage), book.name);
  const ally = unit("hero", "ally", { extraPassiveSkillIds: books.map((book) => book.skillId) });
  const result = simulateBattle([ally, unit("foe", "enemy", { currentHp: 1, maxHp: 1, hp: 1 })], () => .99);
  const openings = result.events.filter((event) => event.type === "skill-book-opening");
  assert.deepEqual(openings.map((event) => event.skillName), books.map((book) => book.name));
  assert.ok(openings.every((event) => event.asset && existsSync(event.asset)));
});

test("heavenly restriction disables active skills once and retains Kaneki's second skill", () => {
  const first = { ...SKILL_DATA["kaneki-glutton"], ...SKILL_DATA["kaneki-glutton"].levels[4], level: 4 };
  const second = { ...SKILL_DATA["kaneki-2000-14"], ...SKILL_DATA["kaneki-2000-14"].levels[2], level: 2 };
  const state = initializeBattle([unit("kaneki", "ally", { extraPassiveSkillIds: ["heavenly-restriction-book"],
    skills: [first, second] }), unit("foe", "enemy")]);
  const kaneki = state.characters[0];
  assert.deepEqual(kaneki.heavenlyDisabledSkillIds, ["kaneki-glutton"]);
  assert.equal(kaneki.atk, 160);
  assert.deepEqual(kaneki.skills.map((skill) => skill.id), ["kaneki-2000-14"]);
});

test("heavenly restriction reaches four hits then alternates one action and one rest", () => {
  const hero = unit("hero", "ally", { hp: 100000, maxHp: 100000, currentHp: 100000,
    spd: 200, extraPassiveSkillIds: ["heavenly-restriction-book"] });
  const foe = unit("foe", "enemy", { hp: 20000, maxHp: 20000, currentHp: 20000, atk: 1, spd: 1 });
  const result = simulateBattle([hero, foe], () => .99);
  const hits = (round) => result.events.filter((event) => event.type === "attack" && event.attackerId === "hero" && event.round === round).length;
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(hits), [2, 3, 4, 0, 4, 0]);
  assert.deepEqual(result.events.filter((event) => event.type === "heavenly-rest").slice(0, 2).map((event) => event.round), [4, 6]);
});

test("armament makes ordinary damage independent of target defense", () => {
  const actor = unit("hero", "ally", { extraPassiveSkillIds: ["armament-haki"], atk: 200 });
  const low = initializeBattle([actor, unit("foe", "enemy", { def: 0 })]);
  const high = initializeBattle([actor, unit("foe", "enemy", { def: 1000 })]);
  low.round = high.round = 1;
  const a = executeAttack(low, low.characters[0], low.characters[1], () => .99);
  const b = executeAttack(high, high.characters[0], high.characters[1], () => .99);
  assert.equal(a.damage, b.damage);
  assert.equal(b.armamentTrueDamage, true);
});

test("undying prevents one fatal hit while leaving non-lifesteal action healing intact", () => {
  const healSkill = { ...SKILL_DATA["eren-free-will"], ...SKILL_DATA["eren-free-will"].levels[1], level: 1 };
  const state = initializeBattle([unit("eren", "ally", { currentHp: 40, maxHp: 1000,
    extraPassiveSkillIds: ["undying-subspecies"], skills: [healSkill] }),
  unit("foe", "enemy", { atk: 1000, spd: 1 })]);
  const [eren, foe] = state.characters;
  state.round = 1;
  const fatal = executeAttack(state, foe, eren, () => .99);
  assert.equal(fatal.trialDamage.undyingTriggered, true);
  assert.equal(eren.currentHp, 1);
  for (const round of [1, 2, 3]) {
    state.round = round;
    const cast = executeAttack(state, eren, foe, () => .99, { skill: healSkill });
    if (round === 3) assert.ok(cast.healedAmount > 0);
  }
  state.round = 4;
  for (let index = 0; index < 3; index += 1) executeAttack(state, eren, foe, () => .99, { skill: healSkill });
  assert.ok(eren.currentHp > 1);
});

test("capsule restores HP only after an actual campfire skill upgrade", () => {
  const naruto = STARTING_CHARACTERS.find((entry) => entry.id === "naruto");
  const run = createRunCharacterState(naruto);
  run.currentHp = 100;
  run.permanentEffects.push({ id: "universal_capsule", name: "万能胶囊" });
  const result = resolveCampfire(run, "camp-1", "skill_upgrade", run.learnedActiveSkills[0]);
  assert.equal(result.capsuleRestored, Math.floor(run.maxHp * .2));
  assert.equal(run.currentHp, 100 + result.capsuleRestored);
  assert.equal(resolveCampfire(run, "camp-1", "skill_upgrade", run.learnedActiveSkills[0]), false);
});

test("weight acquisition applies 10% current speed loss", () => {
  const naruto = STARTING_CHARACTERS.find((entry) => entry.id === "naruto");
  const run = createRunCharacterState(naruto);
  run.spd = 125;
  run.eventResults.box = { eventId: "kings_treasury", status: "awaiting_treasure", data: {
    stageId: 1, treasureOffer: { tier: "small", choices: ["rock_lee_weights", "magic_conch"], claimed: false } } };
  assert.ok(claimTreasure(run, "box", "rock_lee_weights", run, "naruto"));
  assert.equal(run.spd, 112);
  assert.equal(run.permanentEffects.at(-1).weightInitialSpdLoss, 13);
});

test("weight counts each victory once while radar grants rare treasures for new essence", () => {
  const campaign = createCampaign(() => .2, { seed: 77 });
  startCampaign(campaign);
  campaign.candidateIds = ["naruto"];
  selectStartingCharacter(campaign, "naruto", "shadow-clone-rush");
  const run = campaign.runCharacterState;
  run.permanentEffects.push({ id: "rock_lee_weights", name: "洛克李的负重", sourceId: "test-weight", weightVictorySpdGain: 0 });
  const radar = { id: "dragon_radar", name: "龙珠雷达", sourceId: "test-radar", essenceProgress: 0 };
  run.permanentEffects.push(radar);
  const initialSpd = run.spd;
  for (let index = 1; index <= 7; index += 1) {
    campaign.status = "combat";
    campaign.combatLaunched = true;
    campaign.devBattleOnly = true;
    campaign.currentBattle = { id: `test-win-${index}`, type: "boss", enemies: ["guard"] };
    assert.equal(finishBattle(campaign, "victory", run.currentHp, [], [{ id: "naruto", team: "ally", currentHp: run.currentHp }]).status, "settlement");
  }
  assert.equal(run.spd, initialSpd + 70);
  assert.equal(radar.essenceProgress, 9);
  assert.equal(radar.essenceRewardsGranted, 2);
  assert.equal(run.permanentEffects.filter((effect) => effect.sourceLabel === "龙珠雷达精华奖励").length, 2);
  assert.ok(run.permanentEffects.filter((effect) => effect.sourceLabel === "龙珠雷达精华奖励")
    .every((effect) => [GIANT_SPINAL_FLUID.id, GUN_DEVIL_FRAGMENT.id, ...Object.values(TREASURE_DATA)
      .filter((item) => item.grade === "rare").map((item) => item.id)].includes(effect.id)));
  const beforeEssence = campaign.essence;
  const rewards = applyRadarEssenceGrowth(campaign, 45);
  assert.equal(rewards.length, 2);
  assert.equal(radar.essenceProgress, 14);
  assert.equal(campaign.essence, beforeEssence);
});

test("Shikon converts only excess healing into a battle shield", () => {
  const skill = { ...SKILL_DATA["eren-free-will"], ...SKILL_DATA["eren-free-will"].levels[1], level: 1 };
  const state = initializeBattle([unit("eren", "ally", { currentHp: 980, maxHp: 1000,
    shikonOverhealShield: true, skills: [skill] }), unit("foe", "enemy", { currentHp: 10000, maxHp: 10000, hp: 10000 })]);
  state.round = 1;
  const [eren, foe] = state.characters;
  const events = Array.from({ length: 3 }, () => executeAttack(state, eren, foe, () => .99, { skill }));
  assert.equal(events[2].healedAmount, 20);
  assert.equal(eren.currentHp, 1000);
  assert.equal(eren.shieldHp, Math.floor(1000 * skill.healMaxHpFraction) - 20);
});

test("Yoru's 60% guard prevents 600 of a 1000 hit for a partner attacker", () => {
  const state = initializeBattle([unit("hero", "ally", { atk: 1000, spd: 150 }),
    unit(YORU.id, "enemy", { hp: 2000, maxHp: 2000, currentHp: 2000, def: 0, spd: 1, normalDodgeRate: 0 })],
  { playerId: "someone-else" });
  state.round = 1;
  const [hero, yoru] = state.characters;
  const hit = executeAttack(state, hero, yoru, () => 0);
  assert.equal(hit.yoruCounterTriggered, true);
  assert.equal(hit.yoruCounterPreventedDamage, 600);
  assert.equal(hit.actualDamage, 400);
  assert.equal(yoru.currentHp, 1600);
});

test("Yoru's ordinary sword cast hits every living opponent and heals from HP damage", () => {
  const yoru = unit(YORU.id, "enemy", { atk: 100, spd: 200, currentHp: 500, maxHp: 1000, hp: 1000 });
  const result = simulateBattle([unit("hero", "ally", { atk: 1, spd: 1 }),
    unit("partner", "ally", { atk: 1, spd: 1 }), yoru], () => .99);
  const opening = result.events.filter((event) => event.type === "attack" && event.attackerId === YORU.id && event.round === 1);
  assert.deepEqual(opening.map((event) => event.targetId), ["hero", "partner"]);
  assert.ok(opening.every((event) => event.yoruAoeCastId === opening[0].yoruAoeCastId));
  assert.equal(opening[0].yoruLifesteal, Math.floor(opening[0].actualDamage * .7));
  assert.equal(opening[1].yoruLifesteal, Math.floor(opening[1].actualDamage * .7));
});

test("Warhammer penetration uses the fixed entry DEF snapshot", () => {
  const skill = { ...SKILL_DATA["eren-warhammer"], ...SKILL_DATA["eren-warhammer"].levels[4], level: 4 };
  const state = initializeBattle([unit("eren", "ally", { atk: 100, def: 300, skills: [skill] }),
    unit("foe", "enemy", { def: 200, maxHp: 5000, currentHp: 5000, hp: 5000 })]);
  const [eren, foe] = state.characters;
  state.round = 1;
  eren.def = 600;
  const hit = executeAttack(state, eren, foe, () => .99, { skill });
  assert.equal(eren.entryDef, 300);
  assert.equal(hit.skillAttackPower, 420);
  assert.equal(hit.damage, Math.floor(420 * 1.9 * 100 / (100 + 80)));
});

test("Hogyoku grants one whole-party attribute reward per elite win and caps at ten", () => {
  const campaign = createCampaign(() => .01, { seed: 78 });
  startCampaign(campaign);
  campaign.candidateIds = ["naruto"];
  selectStartingCharacter(campaign, "naruto", "shadow-clone-rush");
  const run = campaign.runCharacterState;
  const effect = { id: "hogyoku_fragment", name: "崩玉碎片", sourceId: "test-hogyoku", eliteTriggers: 0 };
  run.permanentEffects.push(effect);
  const partner = createRunCharacterState(STARTING_CHARACTERS.find((entry) => entry.id === "eren"));
  campaign.partyIds.push("eren");
  campaign.partyStates.eren = partner;
  const beforeMaxHp = run.maxHp;
  const partnerBeforeMaxHp = partner.maxHp;
  for (let index = 1; index <= 12; index += 1) {
    campaign.status = "combat";
    campaign.combatLaunched = true;
    campaign.devBattleOnly = true;
    campaign.currentBattle = { id: `elite-${index}`, type: "elite", title: "精英", enemies: ["guard"] };
    assert.equal(finishBattle(campaign, "victory", run.currentHp, [], [{ id: "naruto", team: "ally", currentHp: run.currentHp }]).status, "settlement");
  }
  assert.equal(effect.eliteTriggers, 10);
  assert.equal(run.maxHp, beforeMaxHp + 1000);
  assert.equal(partner.maxHp, partnerBeforeMaxHp + 1000);
  assert.equal(run.permanentEffects.filter((item) => item.id === "hogyoku_growth").length, 10);
});

test("White Kaneki's baseline DEF survives evolution, panel state, and battle preparation", () => {
  const campaign = createCampaign(() => .1, { seed: 79 });
  startCampaign(campaign);
  campaign.candidateIds = ["kaneki"];
  selectStartingCharacter(campaign, "kaneki", "kaneki-predator");
  assert.equal(campaign.runCharacterState.def, 40);
  campaign.trialCompleted = true;
  campaign.evolutionPending = true;
  campaign.status = "trial_result";
  assert.ok(evolveTrialParty(campaign));
  assert.equal(campaign.runCharacterState.def, 44);
  campaign.status = "combat";
  campaign.currentBattle = { id: "kaneki-defense-check", type: "normal", step: 1, enemies: ["guard"] };
  const prepared = prepareBattle(campaign);
  assert.equal(prepared.roster.find((entry) => entry.id === "kaneki").def, 44);
});
