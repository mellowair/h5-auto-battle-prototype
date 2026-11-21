import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { initializeBattle, executeAttack, simulateBattle } from "./battle.js";
import { beginArimaCampfireChallenge, beginHiddenBossChallenge, completeSettlement, createCampaign, finishBattle, finishPartyReplacement, prepareBattle,
  recruitPartyMember, resolveSlotMachineChoice } from "./campaign.js";
import { EVENT_ENEMY_DATA, RECRUIT_CHARACTERS, STARTING_CHARACTERS } from "./characters.js";
import { createAdventureEventResult, createRunCharacterState, getAvailableAdventureEventIds } from "./progression.js";
import { STAGE_FOUR_BOSS } from "./stageFour.js";
import { SKILL_DATA } from "./skills.js";
import { buyShopItem, refreshShopPrices } from "./shop.js";
import { migrateLegacyParty } from "./partyRecruitment.js";

function campaignFixture() {
  const campaign = createCampaign(() => .5);
  const [hero, partner] = STARTING_CHARACTERS;
  campaign.playerId = hero.id;
  campaign.partyIds = [hero.id, partner.id];
  campaign.partyStates = Object.fromEntries([hero, partner].map((unit) => [unit.id, createRunCharacterState(unit)]));
  campaign.runCharacterState = campaign.partyStates[hero.id];
  campaign.stageId = 3;
  campaign.stageStep = 1;
  return campaign;
}

test("three member limit requires an explicit partner replacement and preserves outgoing state", () => {
  const campaign = campaignFixture();
  const partnerId = campaign.partyIds[1];
  campaign.partyStates[partnerId].permanentEffects.push({ id: "saved-item" });
  assert.ok(recruitPartyMember(campaign, "gojo", "prison"));
  assert.equal(recruitPartyMember(campaign, "gun-devil-ally", "reward"), false);
  assert.equal(recruitPartyMember(campaign, "gun-devil-ally", "reward", campaign.playerId), false);
  assert.ok(recruitPartyMember(campaign, "gun-devil-ally", "reward", partnerId));
  assert.equal(campaign.partyIds.length, 3);
  assert.ok(!campaign.partyIds.includes(partnerId));
  assert.deepEqual(campaign.partyStates[partnerId].permanentEffects.at(-1), { id: "saved-item" });
  assert.ok(campaign.reservePartyIds.includes(partnerId));
});

test("legacy four-member save pauses for replacement while retaining every member state", () => {
  const campaign = campaignFixture();
  assert.ok(recruitPartyMember(campaign, "gun-devil-ally", "yoru"));
  const gojo = createRunCharacterState(RECRUIT_CHARACTERS.find((unit) => unit.id === "gojo"));
  campaign.partyStates.gojo = gojo;
  campaign.partyIds.push("gojo");
  campaign.status = "route";
  assert.equal(migrateLegacyParty(campaign), true);
  assert.equal(campaign.partyIds.length, 3);
  assert.equal(campaign.status, "party_replacement");
  assert.equal(finishPartyReplacement(campaign, campaign.partyIds[1]), "route");
  assert.equal(campaign.partyIds.length, 3);
  assert.equal(campaign.partyStates.gojo, gojo);
});

test("Yoru reward waits for replacement when three formal members are present", () => {
  const campaign = campaignFixture();
  assert.ok(recruitPartyMember(campaign, "gojo", "prison"));
  campaign.status = "settlement";
  campaign.settlementNext = "hidden_boss_win";
  campaign.currentBattle = { id: "yoru-test", hiddenBoss: true };
  assert.equal(completeSettlement(campaign), "party_replacement");
  assert.equal(campaign.partyIds.length, 3);
  assert.equal(finishPartyReplacement(campaign, campaign.playerId), false);
  assert.equal(finishPartyReplacement(campaign, campaign.partyIds[1]), "route");
  assert.equal(campaign.partyIds.length, 3);
  assert.ok(campaign.partyIds.includes("gun-devil-ally"));
});

test("Prison Realm purchase with a full party requires a chosen outgoing partner", () => {
  const campaign = campaignFixture();
  assert.ok(recruitPartyMember(campaign, "gun-devil-ally", "yoru"));
  const outgoingId = campaign.partyIds[1];
  campaign.status = "shop";
  campaign.activeNode = { id: "shop-full" };
  campaign.activeShop = { nodeId: "shop-full", slots: [{ index: 0, categoryId: "legendary",
    itemId: "prison_realm", available: true, purchased: false }], purchases: [] };
  campaign.essence = 200;
  refreshShopPrices(campaign);
  assert.equal(buyShopItem(campaign, 0, campaign.playerId), false);
  assert.equal(campaign.essence, 200);
  assert.ok(buyShopItem(campaign, 0, campaign.playerId, outgoingId));
  assert.equal(campaign.partyIds.length, 3);
  assert.equal(campaign.essence, 20);
  assert.ok(campaign.partyStates[outgoingId]);
  assert.ok(campaign.partyIds.includes("gojo"));
});

test("Tang high-HP reduction uses a strict 80 percent threshold for every ally", () => {
  const hitAt = (hp) => {
    const state = initializeBattle([
      { id: "tang", team: "ally", row: "front", hp: 1000, currentHp: hp, atk: 1, def: 0, spd: 1,
        passiveSkillId: "tang-compassion", critChance: 0 },
      { id: "partner", team: "ally", row: "front", hp: 1000, atk: 1, def: 0, spd: 1, critChance: 0 },
      { id: "foe", team: "enemy", row: "front", hp: 1000, atk: 100, def: 0, spd: 1, critChance: 0 },
    ]);
    state.round = 1;
    return executeAttack(state, state.characters[2], state.characters[1], () => .99, { skill: null }).actualDamage;
  };
  assert.equal(hitAt(800), 100);
  assert.equal(hitAt(801), 90);
});

function slotFixture(rolls, essence = 40) {
  const campaign = campaignFixture();
  campaign.essence = essence;
  campaign.random = () => rolls.shift() ?? .5;
  const node = campaign.routeMap.nodes.find((entry) => entry.type === "question");
  node.status = "in_progress";
  campaign.activeNode = node;
  campaign.activeEventType = "adventure";
  campaign.status = "event";
  campaign.pendingEvent = createAdventureEventResult(campaign.runCharacterState, node.id, "slot_machine", campaign.random,
    campaign.partyIds.map((id) => campaign.partyStates[id]), 3);
  return campaign;
}

test("slot machine appears from stage three, ties reroll without another stake, win doubles total", () => {
  const hakari = EVENT_ENEMY_DATA.hakari;
  assert.ok([hakari.asset, ...Object.values(hakari.animations).flatMap((animation) =>
    Object.values(animation.frames)), ...Object.values(hakari.passiveEffectAssets), hakari.coinEffectAsset]
    .every((path) => existsSync(new URL(path, import.meta.url))));
  const campaign = slotFixture([.1, .5, .1, .99]); // 4–4 tie, then 4–6 win.
  assert.ok(!getAvailableAdventureEventIds(campaign.runCharacterState, 1, [campaign.runCharacterState], 2).includes("slot_machine"));
  assert.ok(getAvailableAdventureEventIds(campaign.runCharacterState, 1, [campaign.runCharacterState], 3).includes("slot_machine"));
  assert.equal(resolveSlotMachineChoice(campaign, "slot_all_in").bet, 40);
  assert.equal(campaign.essence, 0);
  assert.equal(resolveSlotMachineChoice(campaign, "slot_roll").outcome, "tie");
  assert.equal(campaign.essence, 0);
  assert.equal(resolveSlotMachineChoice(campaign, "slot_roll").outcome, "win");
  assert.equal(campaign.essence, 80);
  assert.equal(resolveSlotMachineChoice(campaign, "slot_collect").essence, 80);
  assert.equal(campaign.eventResolved, true);
});

test("slot machine defeat restores prebattle HP and clears essence without Game Over", () => {
  const campaign = slotFixture([.99, 0]); // House 6, player 1.
  const originalHp = Object.fromEntries(campaign.partyIds.map((id) => [id, campaign.partyStates[id].currentHp]));
  resolveSlotMachineChoice(campaign, "slot_all_in");
  assert.equal(resolveSlotMachineChoice(campaign, "slot_roll").outcome, "loss");
  assert.equal(resolveSlotMachineChoice(campaign, "slot_fight").phase, "battle");
  campaign.nextAttackMultiplier = 1.25;
  const prepared = prepareBattle(campaign);
  assert.equal(prepared.roster.find((unit) => unit.id === "hakari").maxHp,
    Math.floor(campaign.partyIds.slice(0, 2).reduce((total, id) => total + campaign.partyStates[id].maxHp, 0) * .8));
  assert.equal(prepared.roster.find((unit) => unit.id === "hakari").atk,
    Math.floor(prepared.roster.filter((unit) => unit.team === "ally").slice(0, 2).reduce((total, unit) => total + unit.atk, 0) * .8));
  const transition = finishBattle(campaign, "defeat", 0, [], prepared.roster.map((unit) =>
    unit.team === "ally" ? { ...unit, currentHp: 0 } : unit));
  assert.deepEqual(transition, { status: "route", next: "slot_machine_failed" });
  assert.equal(campaign.essence, 0);
  for (const id of campaign.partyIds) assert.equal(campaign.partyStates[id].currentHp, originalHp[id]);
});

test("Hakari victory refunds a lost stake once and grants the extra 100 essence", () => {
  for (const [rolls, bet, expectedRefund, expectedTotal] of [
    [[.99, 0], 40, 40, 140],
    [[.1, .99], 100, 0, 300],
  ]) {
    const campaign = slotFixture(rolls, bet);
    assert.equal(resolveSlotMachineChoice(campaign, "slot_all_in").bet, bet);
    assert.equal(resolveSlotMachineChoice(campaign, "slot_roll").outcome,
      expectedRefund ? "loss" : "win");
    assert.equal(resolveSlotMachineChoice(campaign, "slot_fight").phase, "battle");
    const prepared = prepareBattle(campaign);
    assert.equal(finishBattle(campaign, "victory", campaign.playerHp, [], prepared.roster).next,
      "slot_machine_win");
    assert.equal(campaign.essence, expectedTotal);
    assert.equal(campaign.lastEssenceReward.stakeRefund, expectedRefund);
    assert.equal(campaign.essenceHistory.filter((entry) =>
      entry.reason === "slot_machine_stake_refund").reduce((sum, entry) => sum + entry.amount, 0), expectedRefund);
  }
});

test("Hakari rolls every three rounds, jackpot is 50 percent reduction and heals once per round", () => {
  const result = simulateBattle([
    { id: "hero", team: "ally", row: "front", hp: 100000, atk: 50, def: 0, spd: 10, critChance: 0 },
    { ...EVENT_ENEMY_DATA.hakari, hp: 100000, atk: 10, def: 0, spd: 5, critChance: 0 },
  ], () => .99, { playerId: "hero" });
  const rolls = result.events.filter((event) => event.type === "hakari-roll");
  assert.deepEqual(rolls.slice(0, 3).map((event) => [event.round, event.roll, event.damageReduction]),
    [[1, 6, .5], [4, 6, .5], [7, 6, .5]]);
  const heals = result.events.filter((event) => event.type === "hakari-heal");
  assert.equal(new Set(heals.map((event) => event.round)).size, heals.length);
  assert.ok(rolls.every((event) => event.atk === 40));
});

test("Hakari's six dice faces apply the correct independent passive tier", () => {
  for (let roll = 1; roll <= 6; roll += 1) {
    const result = simulateBattle([
      { id: "hero", team: "ally", row: "front", hp: 1000, atk: 10000, def: 0, spd: 1, critChance: 0 },
      { ...EVENT_ENEMY_DATA.hakari, hp: 100, atk: 10, def: 0, spd: 10, critChance: 0 },
    ], () => (roll - .5) / 6, { playerId: "hero" });
    const event = result.events.find((entry) => entry.type === "hakari-roll");
    assert.deepEqual([event.round, event.roll, event.attackBonus, event.damageReduction, event.jackpot],
      [1, roll, [2, 2, 5, 5, 15, 30][roll - 1], roll === 6 ? .5 : roll === 5 ? .25 : roll >= 3 ? .2 : 0, roll === 6]);
  }
});

test("Hakari battle with Gojo cannot lock synchronous battle startup", () => {
  const campaign = slotFixture([.99, 0]);
  assert.ok(recruitPartyMember(campaign, "gojo", "prison"));
  assert.equal(resolveSlotMachineChoice(campaign, "slot_all_in").phase, "dice");
  assert.equal(resolveSlotMachineChoice(campaign, "slot_roll").outcome, "loss");
  assert.equal(resolveSlotMachineChoice(campaign, "slot_fight").phase, "battle");
  const prepared = prepareBattle(campaign);
  const hakari = prepared.roster.find((unit) => unit.id === "hakari");
  const pair = prepared.roster.filter((unit) => unit.team === "ally").slice(0, 2);
  for (const stat of ["maxHp", "atk", "def", "spd"])
    assert.equal(hakari[stat], Math.floor(pair.reduce((total, unit) => total + unit[stat], 0) * .8));
  const result = simulateBattle(prepared.roster, () => .99, prepared.combatOptions);
  assert.equal(result.outcome, "defeat");
  assert.ok(result.rounds <= 81);
});

test("hidden challenge failure restores HP and returns to route", () => {
  const campaign = campaignFixture();
  campaign.status = "combat";
  campaign.currentBattle = { id: "guy-test", hiddenGuy: true, enemies: ["might-guy"] };
  campaign.guyChallenge = { attempted: true, unlocked: true };
  campaign.challengeHpSnapshot = Object.fromEntries(campaign.partyIds.map((id) => [id, campaign.partyStates[id].currentHp]));
  campaign.combatLaunched = true;
  const result = finishBattle(campaign, "defeat", 0, [], campaign.partyIds.map((id) =>
    ({ id, team: "ally", originalTeam: "ally", currentHp: 0 })));
  assert.equal(result.status, "route");
  assert.equal(campaign.guyChallenge.failed, true);
  assert.equal(campaign.playerHp, campaign.runCharacterState.maxHp);
});

test("Arima and Yoru failures each consume only their own hidden challenge", () => {
  const arima = campaignFixture();
  const campfire = arima.routeMap.nodes.find((node) => node.type === "campfire");
  campfire.status = "in_progress";
  arima.activeNode = campfire;
  arima.activeEventType = "campfire";
  arima.status = "event";
  arima.runCharacterState.eventSeries.anteiku = { chapter2Triggered: true };
  assert.ok(beginArimaCampfireChallenge(arima));
  assert.equal(arima.currentBattle.hiddenArima, true);
  assert.ok(prepareBattle(arima));
  assert.equal(finishBattle(arima, "defeat", 0, [], arima.partyIds.map((id) =>
    ({ id, team: "ally", originalTeam: "ally", currentHp: 0 }))).status, "route");
  assert.equal(arima.runCharacterState.eventSeries.anteiku.chapter3Failed, true);
  assert.equal(arima.guyChallenge?.failed, undefined);

  const yoru = campaignFixture();
  yoru.status = "hidden_boss_intro";
  yoru.hiddenBoss = { unlocked: true, storyShown: true, resolved: false, introPending: false };
  assert.ok(beginHiddenBossChallenge(yoru));
  assert.ok(prepareBattle(yoru));
  assert.equal(finishBattle(yoru, "defeat", 0, [], yoru.partyIds.map((id) =>
    ({ id, team: "ally", originalTeam: "ally", currentHp: 0 }))).status, "route");
  assert.equal(yoru.hiddenBoss.failed, true);
  assert.equal(yoru.runCharacterState.eventSeries.anteiku?.chapter3Failed, undefined);
});

test("Darkness Devil new panel and vanishing heal use 25 percent of missing HP", () => {
  assert.deepEqual([STAGE_FOUR_BOSS.hp, STAGE_FOUR_BOSS.atk, STAGE_FOUR_BOSS.def, STAGE_FOUR_BOSS.spd],
    [9999, 999, 555, 444]);
  const skill = { ...SKILL_DATA["darkness-sever"], ...SKILL_DATA["darkness-sever"].levels[1], level: 1 };
  const result = simulateBattle([
    { id: "hero", team: "ally", row: "front", hp: 90000, atk: 25000, def: 900, spd: 10, critChance: 0 },
    { ...STAGE_FOUR_BOSS, skills: [skill], skill, critChance: 0 },
  ], () => .99, { playerId: "hero" });
  for (const event of result.events.filter((entry) => entry.type === "darkness-vanish" && entry.round >= 5 && entry.round % 10 >= 5)) {
    const missingBefore = STAGE_FOUR_BOSS.hp - (event.hpAfter - event.healed);
    assert.equal(event.healed, Math.floor(missingBefore * .25));
  }
});
