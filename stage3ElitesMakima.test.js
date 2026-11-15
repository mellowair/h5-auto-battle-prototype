import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { executeAttack, initializeBattle, resolveAgingChoice, resolveStageThreeDeaths, simulateBattle } from "./battle.js";
import { beginJourney, chooseStartingSkill, createCampaign, eliteDropId, finishBattle, prepareBattle,
  selectStartingCharacter, startCampaign } from "./campaign.js";
import { ELITE_ENEMY_DATA, STARTING_CHARACTERS } from "./characters.js";
import { createStageThreeTestCampaign, STAGE_THREE_TEST_ELITES } from "./dev/stage3-config.js";
import { runBalanceTests } from "./dev/growth-simulator.js";
import { createRunCharacterState } from "./progression.js";
import { SKILL_DATA } from "./skills.js";
import { getCharacterVisual } from "./visualConfig.js";

const unit = (id, team, stats = {}) => ({ id, name: id, team, originalTeam: team,
  row: team === "ally" ? "front" : "back", rosterOrder: team === "ally" ? 0 : 1,
  hp: 10000, maxHp: 10000, currentHp: 10000, atk: 100, def: 0, spd: 100,
  skills: [], ...stats });

test("new stage-three elites use their documented panels, shared encounter and fixed drops", () => {
  const gold = ELITE_ENEMY_DATA.find((entry) => entry.id === "gold-king");
  const silver = ELITE_ENEMY_DATA.find((entry) => entry.id === "silver-king");
  const aging = ELITE_ENEMY_DATA.find((entry) => entry.id === "aging-devil");
  assert.deepEqual([gold.hp, gold.atk, gold.def, gold.spd, gold.row], [2300, 250, 180, 100, "back"]);
  assert.deepEqual([silver.hp, silver.atk, silver.def, silver.spd, silver.row], [1900, 280, 150, 100, "back"]);
  assert.equal(gold.eliteEncounterId, silver.eliteEncounterId);
  assert.deepEqual([aging.hp, aging.atk, aging.def, aging.spd, aging.row], [5000, 400, 160, 120, "back"]);
  for (const entry of [gold, silver, aging]) assert.equal(getCharacterVisual(entry).scale, 1.4);
  assert.ok(existsSync(new URL(aging.animations.agingPassive.frames.cast, import.meta.url)));
  assert.ok(existsSync(new URL(aging.passiveEffectAsset, import.meta.url)));
  assert.equal(eliteDropId({ currentBattle: { type: "elite", enemies: [gold.id, silver.id] }, stageId: 3 }), null);
  assert.equal(eliteDropId({ currentBattle: { type: "elite", enemies: ["kira"] }, stageId: 2 }), null);
  assert.equal(eliteDropId({ currentBattle: { type: "elite", enemies: [aging.id] }, stageId: 3 }), "gun_devil_fragment");
});

test("local stage-three test entry opens the new elite encounters with production panels", () => {
  for (const [opponent, expectedIds] of [["gold-silver-kings", ["gold-king", "silver-king"]],
    ["aging-devil", ["aging-devil"]]]) {
    assert.ok(STAGE_THREE_TEST_ELITES.some((entry) => entry.id === opponent));
    const campaign = createStageThreeTestCampaign({ heroId: "naruto", partnerId: "eren",
      opponent, localStep: 12 });
    assert.equal(campaign.currentBattle.type, "elite");
    assert.equal(campaign.currentBattle.eliteId, opponent);
    assert.deepEqual(campaign.currentBattle.enemies, expectedIds);
    const prepared = prepareBattle(campaign);
    assert.deepEqual(prepared.roster.filter((entry) => entry.team === "enemy").map((entry) => entry.id), expectedIds);
    for (const enemy of prepared.roster.filter((entry) => entry.team === "enemy")) {
      const base = ELITE_ENEMY_DATA.find((entry) => entry.id === enemy.id);
      assert.deepEqual([enemy.maxHp, enemy.atk, enemy.def, enemy.spd],
        [base.hp, base.atk, base.def, base.spd]);
    }
  }
});

test("local automatic balance test completes Aging Devil's interactive phases", () => {
  const campaign = createStageThreeTestCampaign({ heroId: "naruto", partnerId: "eren",
    opponent: "aging-devil", localStep: 12 });
  const sample = { playerId: campaign.playerId, partyIds: campaign.partyIds,
    partyStates: campaign.partyStates, seed: 11, ledger: [], battleCounts: { total: 0 },
    target: { stageId: 3, localStep: 12, opponent: "aging-devil" } };
  const report = runBalanceTests(sample, { battles: 1, seed: 11 });
  assert.equal(report.battles, 1);
  assert.ok(report.averageRounds >= 3);
  assert.ok(Number.isFinite(report.averageRemainingHpRatio));
});

test("Makima takes half damage while at least one minion lives, then full damage", () => {
  const hero = unit("hero", "ally", { atk: 1000 });
  const makima = unit("makima", "enemy", { hp: 10000, def: 0 });
  const minion = unit("makima-bomb", "enemy", { hp: 100, stageThreeMinion: true });
  const state = initializeBattle([hero, makima, minion]);
  state.round = 1;
  const first = executeAttack(state, state.characters[0], state.characters[1], () => .99);
  assert.equal(first.actualDamage, 500);
  state.characters[2].alive = false;
  const second = executeAttack(state, state.characters[0], state.characters[1], () => .99);
  assert.equal(second.actualDamage, 1000);
});

test("Makima summons her second wave when both first-wave minions die, and heals only after all four die", () => {
  const makima = { ...unit("makima", "enemy"), hp: 3700, currentHp: 3700, maxHp: 3700 };
  const bomb = unit("makima-bomb", "enemy", { stageThreeMinion: true, hp: 100, currentHp: 100 });
  const flame = unit("flamethrower-devil", "enemy", { stageThreeMinion: true, hp: 100, currentHp: 100 });
  const state = initializeBattle([unit("hero", "ally"), makima, bomb, flame]);
  state.round = 1;
  const events = [];
  state.characters.find((unit) => unit.id === "makima-bomb").alive = false;
  resolveStageThreeDeaths(state, events);
  assert.equal(events.filter((event) => event.type === "summon").length, 0);
  assert.equal(state.characters.find((unit) => unit.id === "makima").lifesteal ?? 0, 0);
  state.characters.find((unit) => unit.id === "flamethrower-devil").alive = false;
  resolveStageThreeDeaths(state, events);
  assert.deepEqual(events.filter((event) => event.type === "summon").map((event) => event.character.id), ["katana-devil", "quanxi"]);
  assert.equal(state.makima.secondWave, true);
  assert.equal(state.characters.find((unit) => unit.id === "makima").currentHp, 3700);
  assert.equal(state.characters.find((unit) => unit.id === "makima").lifesteal ?? 0, 0);
  resolveStageThreeDeaths(state, events);
  assert.equal(events.filter((event) => event.type === "summon").length, 2);
  for (const id of ["katana-devil", "quanxi"]) state.characters.find((unit) => unit.id === id).alive = false;
  resolveStageThreeDeaths(state, events);
  assert.equal(state.characters.find((unit) => unit.id === "makima").lifesteal, .25);
});

test("Gold King's gourd adds passive plus three burn stacks and ticks immediately", () => {
  const gold = { ...ELITE_ENEMY_DATA.find((entry) => entry.id === "gold-king"), hp: 10000, maxHp: 10000,
    currentHp: 10000, def: 0, atk: 0, skills: [{ ...SKILL_DATA["gold-king-gourd"],
      ...SKILL_DATA["gold-king-gourd"].levels[1], level: 1 }], rosterOrder: 1 };
  const result = simulateBattle([unit("hero", "ally", { atk: 5, hp: 1000, maxHp: 1000, currentHp: 1000 }), gold], () => 0);
  const first = result.events.find((event) => event.type === "gold-gourd");
  assert.ok(first);
  assert.equal(first.stacksApplied, 4);
  assert.equal(first.stacks, 4);
  assert.equal(first.requested, 40);
  assert.equal(first.actualDamage, 40);
});

test("stun doubles both immediate and end-of-round burn damage", () => {
  const gold = { ...ELITE_ENEMY_DATA.find((entry) => entry.id === "gold-king"), hp: 10000,
    maxHp: 10000, currentHp: 10000, def: 0, atk: 0, spd: 200,
    skills: [{ ...SKILL_DATA["gold-king-gourd"], ...SKILL_DATA["gold-king-gourd"].levels[1], level: 1 }] };
  const result = simulateBattle([unit("hero", "ally", { hp: 1000, maxHp: 1000,
    currentHp: 1000, atk: 5, stunNextAction: true }), gold], () => 0);
  assert.equal(result.events.find((event) => event.type === "gold-gourd").requested, 80);
  assert.equal(result.events.find((event) => event.type === "trial-dot" && event.name === "灼烧")?.stunnedBurn, true);
});

test("Silver King bottles the living ally with the highest actual damage at round four", () => {
  const silver = { ...ELITE_ENEMY_DATA.find((entry) => entry.id === "silver-king"),
    hp: 5000, maxHp: 5000, currentHp: 5000, def: 0, atk: 1, spd: 1, rosterOrder: 2 };
  const result = simulateBattle([
    unit("hero", "ally", { atk: 10, spd: 100, rosterOrder: 0 }),
    unit("partner", "ally", { atk: 1000, spd: 100, rosterOrder: 1 }), silver,
  ], () => .99, { playerId: "hero" });
  const bottles = result.events.filter((event) => event.type === "silver-bottle");
  assert.equal(bottles.length, 1);
  assert.equal(bottles[0].round, 4);
  assert.equal(bottles[0].targetId, "partner");
  assert.equal(result.finalCharacters.find((entry) => entry.id === "partner").absorbedByBottle, true);
});

test("Silver King can choose a summon independently without deleting its summoner", () => {
  const silver = { ...ELITE_ENEMY_DATA.find((entry) => entry.id === "silver-king"),
    hp: 5000, maxHp: 5000, currentHp: 5000, def: 0, atk: 1, spd: 1, rosterOrder: 2 };
  const result = simulateBattle([
    unit("tang", "ally", { atk: 10, rosterOrder: 0 }),
    unit("wukong", "ally", { atk: 1000, summonerId: "tang", rosterOrder: 1 }), silver,
  ], () => .99, { playerId: "tang" });
  assert.equal(result.events.find((event) => event.type === "silver-bottle")?.targetId, "wukong");
  assert.equal(result.finalCharacters.find((entry) => entry.id === "tang").alive, true);
});

test("bottling the main hero leaves the companion active and allows a rewarded victory", () => {
  const silver = { ...ELITE_ENEMY_DATA.find((entry) => entry.id === "silver-king"),
    hp: 3600, maxHp: 3600, currentHp: 3600, def: 0, atk: 1, spd: 1, rosterOrder: 2 };
  const result = simulateBattle([
    unit("naruto", "ally", { atk: 700, rosterOrder: 0 }),
    unit("eren", "ally", { atk: 200, rosterOrder: 1 }), silver,
  ], () => .99, { playerId: "naruto" });
  assert.equal(result.events.find((event) => event.type === "silver-bottle")?.targetId, "naruto");
  assert.equal(result.outcome, "victory");
  assert.equal(result.finalCharacters.find((entry) => entry.id === "naruto").alive, false);
  assert.equal(result.finalCharacters.find((entry) => entry.id === "eren").alive, true);
  assert.ok(result.events.some((event) => event.attackerId === "eren" && event.round > 4));
  assert.ok(result.events.some((event) => event.attackerId === "silver-king" && event.targetId === "eren" && event.round >= 4));
  assert.equal(result.events.filter((event) => event.attackerId === "naruto" && event.round >= 4).length, 0);
  const campaign = createStageThreeTestCampaign({ heroId: "naruto", partnerId: "eren",
    opponent: "gold-silver-kings" });
  campaign.devBattleOnly = false;
  prepareBattle(campaign);
  assert.ok(finishBattle(campaign, result.outcome,
    result.finalCharacters.find((entry) => entry.id === "naruto").currentHp,
    result.events, result.finalCharacters));
  assert.equal(campaign.status, "reward");
  assert.equal(campaign.rewardBattleType, "elite");
  assert.equal(campaign.lastEssenceReward.amount, 4);
});

test("bottling the last allied unit still ends in defeat", () => {
  const silver = { ...ELITE_ENEMY_DATA.find((entry) => entry.id === "silver-king"),
    hp: 5000, maxHp: 5000, currentHp: 5000, def: 0, atk: 1, spd: 1, rosterOrder: 1 };
  const result = simulateBattle([unit("hero", "ally", { atk: 100, rosterOrder: 0 }), silver],
    () => .99, { playerId: "hero" });
  assert.equal(result.events.find((event) => event.type === "silver-bottle")?.targetId, "hero");
  assert.equal(result.outcome, "defeat");
});

test("aging suppresses combat skill levels without changing the saved skill levels", () => {
  const skill = { ...SKILL_DATA["eren-free-will"], ...SKILL_DATA["eren-free-will"].levels[4], level: 4 };
  const state = initializeBattle([unit("eren", "ally", { passiveLevel: 2, skills: [skill] }),
    unit("aging-devil", "enemy")]);
  assert.equal(state.characters[0].skills[0].level, 1);
  assert.equal(state.characters[0].passiveLevel, 1);
  assert.equal(skill.level, 4);
});

test("aging suppresses Tang's permanent journey skill attack bonus for this battle only", () => {
  const campaign = createCampaign(() => 0, { seed: 743 });
  startCampaign(campaign);
  campaign.candidateIds = ["tang"];
  selectStartingCharacter(campaign, "tang");
  chooseStartingSkill(campaign, "journey-west");
  beginJourney(campaign);
  const run = campaign.runCharacterState;
  run.evolution = { phase: 2 };
  run.skillLevels["journey-west"] = 14;
  run.atk += 150;
  const savedAttack = run.atk;
  campaign.stageId = 3;
  campaign.currentBattle = { id: "aging-test", type: "elite", step: 3,
    enemies: ["aging-devil"], enemyNames: { "aging-devil": "衰老恶魔" } };
  campaign.status = "combat";
  const hero = prepareBattle(campaign).roster.find((entry) => entry.id === "tang");
  assert.equal(hero.atk, savedAttack - 150);
  assert.equal(hero.skills.find((skill) => skill.id === "journey-west").level, 1);
  assert.equal(run.atk, savedAttack);
  assert.equal(run.skillLevels["journey-west"], 14);
});

test("aging pauses before round three and persists only the selected permanent deduction", () => {
  const run = createRunCharacterState(STARTING_CHARACTERS.find((entry) => entry.id === "naruto"), "shadow-clone-rush");
  Object.assign(run, { maxHp: 10000, currentHp: 10000, atk: 100, def: 100, spd: 100 });
  const hero = unit("naruto", "ally", { atk: 100, def: 100 });
  const aging = unit("aging-devil", "enemy", { hp: 10000, maxHp: 10000, currentHp: 10000,
    atk: 1, spd: 1, def: 0 });
  const options = { playerId: "naruto", runCharacterState: run, runCharacterStates: { naruto: run } };
  const first = simulateBattle([hero, aging], () => .99, options);
  assert.equal(first.pendingChoice.round, 3);
  assert.equal(first.outcome, null);
  const second = simulateBattle(null, () => .99, { resumeState: first.resumeState,
    previousEvents: first.events, agingChoice: "permanent" });
  assert.equal(second.pendingChoice.round, 10);
  assert.equal(run.def, 82); // rounds 4 through 9, six times -3 DEF
  assert.equal(second.events.filter((event) => event.type === "aging-choice-result").length, 1);
  assert.equal(second.events.filter((event) => event.type === "aging-penalty" && event.phaseRound === 3).length, 6);
});

test("aging stages pause once each and a treasure sacrifice revokes its benefit", () => {
  const run = createRunCharacterState(STARTING_CHARACTERS.find((entry) => entry.id === "naruto"), "shadow-clone-rush");
  Object.assign(run, { maxHp: 10000, currentHp: 10000, atk: 100, def: 100, spd: 100 });
  run.permanentEffects.push({ id: "magic_conch", sourceId: "test-conch", damageReduction: .05 });
  const hero = unit("naruto", "ally", { atk: 100, def: 100, damageReductionBonus: .05 });
  const aging = unit("aging-devil", "enemy", { hp: 100000, maxHp: 100000, currentHp: 100000,
    atk: 1, spd: 1, def: 0 });
  const first = simulateBattle([hero, aging], () => .99,
    { playerId: "naruto", runCharacterState: run, runCharacterStates: { naruto: run } });
  assert.equal(first.pendingChoice.treasureAvailable, true);
  const second = simulateBattle(null, () => .99, { resumeState: first.resumeState,
    previousEvents: first.events, agingChoice: "treasure" });
  assert.equal(second.pendingChoice.round, 10);
  assert.equal(run.permanentEffects.length, 0);
  assert.equal(second.resumeState.characters.find((entry) => entry.id === "naruto").damageReductionBonus, 0);
  assert.equal(second.events.filter((event) => event.type === "aging-choice-result").length, 1);
  assert.equal(second.events.filter((event) => event.type === "aging-penalty").length, 0);
  const third = simulateBattle(null, () => .99, { resumeState: second.resumeState,
    previousEvents: second.events, agingChoice: "battle" });
  assert.equal(third.pendingChoice.round, 20);
  assert.equal(third.pendingChoice.treasureAvailable, false);
  assert.equal(resolveAgingChoice(third.resumeState, "treasure", () => 0), null);
  const finished = simulateBattle(null, () => .99, { resumeState: third.resumeState,
    previousEvents: third.events, agingChoice: "battle" });
  assert.ok(finished.outcome);
  assert.deepEqual(finished.events.filter((event) => event.type === "aging-choice-result")
    .map((event) => event.round), [3, 10, 20]);
});

test("aging battle-only penalties never change saved attributes, while later max HP penalties do", () => {
  const run = createRunCharacterState(STARTING_CHARACTERS.find((entry) => entry.id === "naruto"), "shadow-clone-rush");
  Object.assign(run, { maxHp: 10000, currentHp: 10000, atk: 100, def: 100, spd: 100 });
  const hero = unit("naruto", "ally", { atk: 100, def: 100 });
  const aging = unit("aging-devil", "enemy", { hp: 100000, maxHp: 100000, currentHp: 100000,
    atk: 1, spd: 1, def: 0 });
  const first = simulateBattle([hero, aging], () => .99,
    { playerId: "naruto", runCharacterState: run, runCharacterStates: { naruto: run } });
  const second = simulateBattle(null, () => .99, { resumeState: first.resumeState,
    previousEvents: first.events, agingChoice: "battle" });
  assert.equal(second.pendingChoice.round, 10);
  assert.equal(run.maxHp, 10000);
  assert.equal(run.currentHp, 10000);
  assert.equal(run.def, 100);
  assert.ok(second.resumeState.characters.find((entry) => entry.id === "naruto").currentHp < 10000);
  const third = simulateBattle(null, () => .99, { resumeState: second.resumeState,
    previousEvents: second.events, agingChoice: "permanent" });
  assert.equal(third.pendingChoice.round, 20);
  assert.ok(run.maxHp < 10000);
  assert.ok(run.currentHp <= run.maxHp);
});

test("rare treasure sacrifice removes its recorded HP gain", () => {
  const run = createRunCharacterState(STARTING_CHARACTERS.find((entry) => entry.id === "naruto"), "shadow-clone-rush");
  Object.assign(run, { maxHp: 1200, currentHp: 1200 });
  run.permanentEffects.push({ id: "gun_devil_fragment", maxHp: 200, sourceId: "elite:test" });
  const state = initializeBattle([unit("naruto", "ally", { hp: 1200, maxHp: 1200, currentHp: 1200 }),
    unit("aging-devil", "enemy")], { runCharacterState: run, runCharacterStates: { naruto: run } });
  state.round = 10;
  state.pendingAgingChoice = { round: 10, grade: "rare" };
  const result = resolveAgingChoice(state, "treasure", () => 0);
  assert.equal(result.removedTreasure.id, "gun_devil_fragment");
  assert.equal(run.maxHp, 1000);
  assert.equal(run.currentHp, 1000);
  assert.equal(state.characters[0].maxHp, 1000);
});

test("Hogyoku sacrifice revokes each recorded growth once", () => {
  const run = createRunCharacterState(STARTING_CHARACTERS.find((entry) => entry.id === "naruto"), "shadow-clone-rush");
  const partner = createRunCharacterState(STARTING_CHARACTERS.find((entry) => entry.id === "eren"), "eren-free-will");
  Object.assign(run, { atk: 110, maxHp: 1000, currentHp: 1000 });
  partner.atk = 210;
  run.permanentEffects.push({ id: "hogyoku_fragment", atk: 10, sourceId: "elite:source" },
    { id: "hogyoku_growth", atk: 10, sourceId: "hogyoku-elite:elite:source:battle-1" });
  partner.permanentEffects.push({ id: "hogyoku_growth", atk: 10,
    sourceId: "hogyoku-elite:elite:source:battle-1" });
  const state = initializeBattle([unit("naruto", "ally", { atk: 110, hp: 1000, maxHp: 1000, currentHp: 1000 }),
    unit("eren", "ally", { atk: 210, hp: 1000, maxHp: 1000, currentHp: 1000 }),
    unit("aging-devil", "enemy")], { runCharacterState: run, runCharacterStates: { naruto: run, eren: partner } });
  state.round = 20;
  state.pendingAgingChoice = { round: 20, grade: "legendary" };
  const result = resolveAgingChoice(state, "treasure", () => 0);
  assert.equal(result.removedTreasure.id, "hogyoku_fragment");
  assert.equal(run.atk, 100);
  assert.equal(partner.atk, 200);
  assert.equal(state.characters[0].atk, 100);
  assert.equal(state.characters[1].atk, 200);
  assert.equal(result.removedTreasure.affectedAllies.find((entry) => entry.targetId === "eren").combatStats.atk, 200);
  assert.equal(run.permanentEffects.length, 0);
  assert.equal(partner.permanentEffects.length, 0);
});

test("a saved aging pause resumes without replaying previous rounds", () => {
  const run = createRunCharacterState(STARTING_CHARACTERS.find((entry) => entry.id === "naruto"), "shadow-clone-rush");
  Object.assign(run, { maxHp: 10000, currentHp: 10000, atk: 100, def: 100, spd: 100 });
  const first = simulateBattle([unit("naruto", "ally", { atk: 100, def: 100 }),
    unit("aging-devil", "enemy", { hp: 100000, maxHp: 100000, currentHp: 100000, atk: 1, spd: 1 })],
  () => .99, { playerId: "naruto", runCharacterState: run, runCharacterStates: { naruto: run } });
  const saved = JSON.parse(JSON.stringify(first));
  saved.resumeState.runCharacterState = run;
  saved.resumeState.runCharacterStates = { naruto: run };
  const second = simulateBattle(null, () => .99, { resumeState: saved.resumeState,
    previousEvents: saved.events, agingChoice: "permanent" });
  assert.equal(second.pendingChoice.round, 10);
  assert.equal(second.events.filter((event) => event.type === "aging-suppression").length, 1);
  assert.equal(second.events.filter((event) => event.type === "aging-choice-result").length, 1);
});
