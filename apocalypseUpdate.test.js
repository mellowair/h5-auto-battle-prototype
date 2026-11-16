import test from "node:test";
import assert from "node:assert/strict";
import { executeAttack, initializeBattle, isBattleOver, simulateBattle } from "./battle.js";
import { claimApocalypseReward, createCampaign, getApocalypseUpgradeOffer, resolveStageTwoCampfire, upgradeApocalypseAtCampfire } from "./campaign.js";
import { STARTING_CHARACTERS } from "./characters.js";
import { applyPassiveBookStats, createAdventureEventResult, createRunCharacterState, resolveCampfire } from "./progression.js";
import { SHOP_RULES } from "./shopConfig.js";
import { SKILL_DATA } from "./skills.js";

const fighter = (id, team, extra = {}) => ({ id, name: id, team, row: "front", rosterOrder: 1,
  hp: 1000, maxHp: 1000, currentHp: 1000, atk: 100, def: 50, spd: 50,
  critChance: 0, skills: [], extraPassiveSkillIds: [], ...extra });

test("天启骑士 Lv1 uses entry stats, keeps the partner alive and restricts attacks", () => {
  const state = initializeBattle([
    fighter("hero", "ally", { atk: 200, extraPassiveSkillIds: ["apocalypse-knight"],
      apocalypseKnightLevel: 1 }),
    fighter("partner", "ally", { rosterOrder: 2, currentHp: 300,
      skills: [{ id: "some-skill", type: "active", chance: 1 }] }),
    fighter("foe", "enemy"),
  ]);
  state.round = 2;
  state.eventSink = [];
  state.characters[0].atk = 900;
  state.characters[0].currentHp = 0;
  state.characters[0].alive = false;
  assert.equal(isBattleOver(state), null);
  const partner = state.characters[1];
  assert.equal(state.eventSink.length, 1);
  assert.equal(state.eventSink[0].absorbed.atk, 100);
  assert.equal(partner.atk, 200);
  assert.equal(partner.maxHp, 1500);
  assert.equal(partner.currentHp, 800);
  assert.equal(partner.apocalypseSwordOnly, true);
  assert.deepEqual(partner.skills, []);
  assert.equal(isBattleOver(state), null);
  assert.equal(state.eventSink.length, 1);
});

test("天启骑士 Lv2 converts a fallen partner and preserves holder skills", () => {
  const state = initializeBattle([
    fighter("hero", "ally", { currentHp: 200, extraPassiveSkillIds: ["apocalypse-knight"],
      apocalypseKnightLevel: 2, skills: [{ id: "some-skill", type: "active", chance: 1 }] }),
    fighter("partner", "ally", { rosterOrder: 2, atk: 300 }), fighter("foe", "enemy"),
  ]);
  state.eventSink = [];
  state.characters[1].currentHp = 0;
  state.characters[1].alive = false;
  assert.equal(isBattleOver(state), null);
  assert.equal(state.characters[0].atk, 220);
  assert.equal(state.characters[0].currentHp, 600);
  assert.equal(state.characters[0].skills.length, 1);
  assert.equal(state.characters[1].apocalypseSwordConverted, true);
});

test("a partner can finish a real battle after the Apocalypse holder falls", () => {
  const result = simulateBattle([
    fighter("hero", "ally", { hp: 50, maxHp: 50, currentHp: 50, atk: 1,
      extraPassiveSkillIds: ["apocalypse-knight"], apocalypseKnightLevel: 1, spd: 1 }),
    fighter("partner", "ally", { row: "back", rosterOrder: 2, atk: 1000, spd: 10 }),
    fighter("foe", "enemy", { hp: 400, maxHp: 400, currentHp: 400, atk: 1000, spd: 100 }),
  ], () => .99, { playerId: "hero" });
  assert.equal(result.outcome, "victory");
  assert.equal(result.events.filter((event) => event.type === "apocalypse-sword").length, 1);
  assert.equal(result.finalCharacters.find((unit) => unit.id === "partner").alive, true);
});

test("Yoru reward is chosen once, excluded from shop, then four fragments remove their true gains", () => {
  const campaign = createCampaign(() => .5);
  const [hero, partner] = STARTING_CHARACTERS;
  const main = createRunCharacterState(hero);
  const ally = createRunCharacterState(partner);
  campaign.playerId = hero.id;
  campaign.partyIds = [hero.id, partner.id];
  campaign.runCharacterState = main;
  campaign.partyStates = { [hero.id]: main, [partner.id]: ally };
  campaign.hiddenBoss = { rewarded: true };
  campaign.status = "settlement";
  campaign.settlementNext = "hidden_boss_win";
  campaign.currentBattle = { id: "yoru" };
  campaign.pendingApocalypseReward = true;
  assert.equal(SHOP_RULES.books.some((book) => book.skillId === "apocalypse-knight"), false);
  assert.equal(claimApocalypseReward(campaign, partner.id).level, 1);
  assert.equal(claimApocalypseReward(campaign, hero.id), false);
  for (const [member, gains] of [[main, [200, 400]], [ally, [600, 800]]]) for (const maxHp of gains) {
    member.maxHp += maxHp;
    member.permanentEffects.push({ id: "gun_devil_fragment", sourceId: `test:${maxHp}`, maxHp });
  }
  campaign.status = "event";
  campaign.activeEventType = "campfire";
  campaign.activeNode = { id: "campfire:upgrade", type: "campfire" };
  campaign.eventResolved = false;
  assert.equal(getApocalypseUpgradeOffer(campaign).fragments, 4);
  const original = [main.maxHp, ally.maxHp];
  const upgraded = upgradeApocalypseAtCampfire(campaign);
  assert.equal(upgraded.level, 2);
  assert.equal(upgraded.sacrifices.length, 4);
  assert.equal(main.maxHp, original[0] - 600);
  assert.equal(ally.maxHp, original[1] - 1400);
  assert.equal(ally.skillLevels["apocalypse-knight"], 2);
  assert.equal(getApocalypseUpgradeOffer(campaign), null);
});

test("new books and adjusted passives apply once at the correct scope", () => {
  assert.equal(SHOP_RULES.books.find((book) => book.skillId === "brick-force").price, 30);
  assert.equal(SHOP_RULES.books.find((book) => book.skillId === "three-teachers").price, 40);
  const run = createRunCharacterState(STARTING_CHARACTERS[0]);
  const before = [run.atk, run.def];
  run.extraPassiveSkillIds = ["iron-bell", "armament-haki"];
  applyPassiveBookStats(run);
  applyPassiveBookStats(run);
  assert.deepEqual([run.atk, run.def], [before[0] + 10, before[1] + 30]);
  const learned = initializeBattle([fighter("learned", "ally", { atk: run.atk, def: run.def,
    extraPassiveSkillIds: [...run.extraPassiveSkillIds], bookStatAppliedIds: [...run.bookStatAppliedIds] })]).characters[0];
  assert.deepEqual([learned.atk, learned.def], [run.atk, run.def]);
  const unit = initializeBattle([fighter("hero", "ally", { atk: 100, def: 200,
    extraPassiveSkillIds: ["brick-force"] })]).characters[0];
  assert.equal(unit.def, 0);
  assert.equal(unit.atk, 400);
});

test("coffee grows max HP only when rest is selected; Fate Gate samples all three outcomes", () => {
  const run = createRunCharacterState(STARTING_CHARACTERS[0]);
  run.permanentEffects.push({ id: "drip_coffee" }, { id: "drip_coffee" });
  const hp = run.maxHp;
  assert.equal(resolveCampfire(run, "rest:1", "rest").coffeeMaxHpGain, 300);
  assert.equal(run.maxHp, hp + 300);
  assert.equal(resolveCampfire(run, "rest:1", "rest"), false);
  const counts = { long: 0, medium: 0, short: 0 };
  for (let i = 0; i < 999; i += 1) {
    const sample = createRunCharacterState(STARTING_CHARACTERS[0]);
    const event = createAdventureEventResult(sample, `fate:${i}`, "fate_gate", () => (i + .5) / 999);
    counts[event.data.experiment] += 1;
  }
  for (const count of Object.values(counts)) assert.ok(count > 320 && count < 345);
  assert.equal(SKILL_DATA["undying-subspecies"].description.includes("吸血效果减半"), true);
});

test("two coffee copies grow both party members at a stage-two campfire", () => {
  const campaign = createCampaign(() => .5);
  const [hero, partner] = STARTING_CHARACTERS;
  const main = createRunCharacterState(hero);
  const ally = createRunCharacterState(partner);
  main.permanentEffects.push({ id: "drip_coffee" }, { id: "drip_coffee" });
  campaign.playerId = hero.id;
  campaign.partyIds = [hero.id, partner.id];
  campaign.runCharacterState = main;
  campaign.partyStates = { [hero.id]: main, [partner.id]: ally };
  campaign.stageId = 2;
  campaign.status = "event";
  campaign.activeEventType = "campfire";
  campaign.activeNode = { id: "coffee-campfire", type: "campfire" };
  const before = [main.maxHp, ally.maxHp];
  const result = resolveStageTwoCampfire(campaign, "rest");
  assert.equal(result.results.length, 2);
  assert.equal(main.maxHp, before[0] + 300);
  assert.equal(ally.maxHp, before[1] + 300);
  assert.equal(resolveStageTwoCampfire(campaign, "rest"), false);
});

test("undying halves lifesteal for three rounds and leaves ordinary healing available", () => {
  const state = initializeBattle([fighter("hero", "ally", { currentHp: 100, atk: 100, lifesteal: .4,
    extraPassiveSkillIds: ["undying-subspecies"] }), fighter("foe", "enemy", { hp: 10000,
    maxHp: 10000, currentHp: 10000, atk: 0, spd: 1 })]);
  const [hero, foe] = state.characters;
  hero.undyingUsed = true;
  hero.undyingActionHealUntilRound = 3;
  state.round = 1;
  const first = executeAttack(state, hero, foe, () => .99);
  assert.equal(first.healedAmount, Math.floor(first.actualDamage * .2));
  state.round = 4;
  const later = executeAttack(state, hero, foe, () => .99);
  assert.equal(later.healedAmount, Math.floor(later.actualDamage * .4));
});

test("three teachers counts living summons and reacts only to another ally's normal attack", () => {
  const state = initializeBattle([
    fighter("owner", "ally", { extraPassiveSkillIds: ["three-teachers"], spd: 1 }),
    fighter("partner", "ally", { rosterOrder: 2 }),
    fighter("summon", "ally", { rosterOrder: 3, summonerId: "partner" }),
    fighter("foe", "enemy", { currentHp: 10000, maxHp: 10000, hp: 10000 }),
  ]);
  state.round = 1;
  const [owner, partner, summon, foe] = state.characters;
  const first = executeAttack(state, partner, foe, () => .99);
  assert.equal(first.teacherBuffs[0].attackGain, 5);
  assert.equal(owner.atk, 105);
  executeAttack(state, owner, foe, () => .99);
  assert.equal(owner.atk, 105);
  const skill = { id: "sample", type: "active", effectType: "damage", multiplier: 1 };
  executeAttack(state, partner, foe, () => .99, { skill });
  assert.equal(owner.atk, 105);
  summon.alive = false;
  executeAttack(state, partner, foe, () => .99);
  assert.equal(owner.atk, 105);
});

test("Wukong's second fate cast damages every living enemy", () => {
  const skill = { ...SKILL_DATA["wukong-fate"], ...SKILL_DATA["wukong-fate"].levels[1], level: 1, chance: 1 };
  const result = simulateBattle([
    fighter("tang", "ally", { atk: 100, spd: 10 }),
    fighter("wukong", "ally", { tangSummonKind: "wukong", summonerId: "tang", rosterOrder: 2,
      atk: 100, spd: 100, skill, skills: [skill] }),
    fighter("enemy-a", "enemy", { hp: 5000, maxHp: 5000, currentHp: 5000, atk: 1, spd: 1 }),
    fighter("enemy-b", "enemy", { hp: 5000, maxHp: 5000, currentHp: 5000, atk: 1, spd: 1 }),
  ], () => .99);
  const hits = result.events.filter((event) => event.wukongTeleportAttack);
  assert.ok(hits.some((event) => event.targetId === "enemy-a"));
  assert.ok(hits.some((event) => event.targetId === "enemy-b"));
});
