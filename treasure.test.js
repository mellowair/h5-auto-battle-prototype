import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { STARTING_CHARACTERS } from "./characters.js";
import { executeAttack, getCritChance, getDodgeChance, initializeBattle, simulateBattle } from "./battle.js";
import { chooseRoute, claimCampaignTreasure, completeLocation, finishBattle, getCampaignTreasureOffer, getRouteOptions, prepareBattle, resolveCampaignEvent, resolveStageTwoCampfire, restorePartyHealthForStage, startCampaignEventBattle } from "./campaign.js";
import { claimTreasure, createAdventureEventResult, createRunCharacterState, createTreasureOffer, getCampfireOptions, getTreasureCombatModifiers, grantEliteSukunaFinger, grantEventTreasure, grantGiantSpinalFluid, grantGunDevilFragment, healRunCharacter, resolveAdventureEvent, resolveCampfire } from "./progression.js";
import { TREASURE_DATA } from "./skills.js";
import { createStageTwoDirectBattleCampaign, createStageTwoTestCampaign } from "./dev/stage2-config.js";

const hero = STARTING_CHARACTERS.find((entry) => entry.id === "naruto");
const eren = STARTING_CHARACTERS.find((entry) => entry.id === "eren");

function offerFor(treasureId, recipient = hero) {
  const owner = createRunCharacterState(hero);
  const member = recipient === hero ? owner : createRunCharacterState(recipient);
  const sourceId = `treasure-${treasureId}`;
  createAdventureEventResult(owner, sourceId, "kings_treasury");
  const record = owner.eventResults[sourceId];
  record.status = "awaiting_treasure";
  const tier = TREASURE_DATA[treasureId].grade === "legendary" ? "royal" : "small";
  const alternative = tier === "small"
    ? treasureId === "magic_conch" ? "odm_gear" : "magic_conch"
    : treasureId === "angel_breath" ? "stone_mask" : "angel_breath";
  record.data.treasureOffer = { tier, choices: [treasureId, alternative], claimed: false };
  return { owner, member, sourceId };
}

test("treasures have separate common, rare and legendary grades with linked artwork", () => {
  assert.deepEqual(Object.values(TREASURE_DATA).filter((item) => item.grade === "common").map((item) => item.id),
    ["magic_conch", "odm_gear", "universal_capsule", "rock_lee_weights", "drip_coffee", "ninja_footwear", "vip_card"]);
  assert.deepEqual(Object.values(TREASURE_DATA).filter((item) => item.grade === "rare").map((item) => item.id), ["sukuna_finger"]);
  assert.deepEqual(Object.values(TREASURE_DATA).filter((item) => item.grade === "legendary").map((item) => item.id),
    ["angel_breath", "stone_mask", "nichirin_blade", "dragon_radar", "hogyoku_fragment", "shikon_fragment", "quinque_crit", "quinque_guard", "white_spirit_blessing", "oni_hammer", "premium_vip_card"]);
  assert.ok(Object.values(TREASURE_DATA).every((item) => item.name && item.description && (!item.image || existsSync(item.image))));
  assert.ok(["universal_capsule", "rock_lee_weights", "dragon_radar", "hogyoku_fragment", "shikon_fragment", "drip_coffee", "quinque_guard", "quinque_crit"].every((id) => TREASURE_DATA[id].image && existsSync(TREASURE_DATA[id].image)));
});

test("every registered legendary treasure can appear in Gilgamesh's third-option offer and be claimed", () => {
  const legendary = Object.values(TREASURE_DATA).filter((item) => item.grade === "legendary");
  for (const [index, item] of legendary.entries()) {
    const member = createRunCharacterState(hero);
    const sourceId = `royal-${index}`;
    createAdventureEventResult(member, sourceId, "kings_treasury");
    member.eventResults[sourceId].status = "awaiting_treasure";
    const offer = createTreasureOffer(member, sourceId, "royal", () => index / legendary.length);
    assert.ok(offer.choices.includes(item.id), `${item.name} should enter the legendary pool`);
    assert.ok(claimTreasure(member, sourceId, item.id, member, member.characterId));
    assert.ok(member.permanentEffects.some((effect) => effect.id === item.id));
  }
});

test("small treasure modifies only its recipient and a second claim is rejected", () => {
  const { owner, member, sourceId } = offerFor("magic_conch", eren);
  assert.ok(claimTreasure(owner, sourceId, "magic_conch", member, member.characterId));
  assert.equal(getTreasureCombatModifiers(member).damageReduction, .05);
  assert.equal(getTreasureCombatModifiers(owner).damageReduction, 0);
  assert.equal(claimTreasure(owner, sourceId, "magic_conch", member, member.characterId), false);
  assert.equal(member.permanentEffects.length, 1);
  const battle = initializeBattle([
    { id: "foe", team: "enemy", row: "front", hp: 1000, atk: 100, def: 0, spd: 10, critChance: 0 },
    { id: "member", team: "ally", row: "front", hp: 1000, atk: 10, def: 0, spd: 10, critChance: 0, damageReductionBonus: .05 },
  ]);
  assert.equal(executeAttack(battle, battle.characters[0], battle.characters[1], () => .99).damage, 95);
});

test("Sukuna finger clamps HP, while ODM gear raises actual dodge and crit chances", () => {
  const finger = createRunCharacterState(hero);
  finger.maxHp = 1600; finger.currentHp = 1500;
  const oldAtk = finger.atk;
  assert.ok(grantEliteSukunaFinger(finger, "mahito"));
  assert.deepEqual([finger.maxHp, finger.currentHp, finger.atk], [1450, 1450, oldAtk + 25]);
  const gear = offerFor("odm_gear");
  const oldCrit = gear.member.critRate;
  assert.ok(claimTreasure(gear.owner, gear.sourceId, "odm_gear", gear.member, gear.member.characterId));
  assert.equal(gear.member.critRate, oldCrit + .05);
  assert.equal(getTreasureCombatModifiers(gear.member).dodgeRateBonus, .05);
  assert.ok(Math.abs(getDodgeChance({ spd: 50, dodgeRateBonus: .05 }) - getDodgeChance({ spd: 50 }) - .05) < 1e-12);
  assert.equal(getCritChance({ critChance: gear.member.critRate }), oldCrit + .05);
});

test("stone mask gives 25% lifesteal but blocks its holder's campfire healing", () => {
  const mask = offerFor("stone_mask", eren);
  mask.member.currentHp = 500;
  assert.ok(claimTreasure(mask.owner, mask.sourceId, "stone_mask", mask.member, mask.member.characterId));
  assert.equal(getTreasureCombatModifiers(mask.member).lifesteal, .25);
  assert.equal(getCampfireOptions(mask.member)[0].healAmount, 0);
  assert.equal(resolveCampfire(mask.member, "camp-a", "rest").restored, 0);
  assert.equal(mask.member.currentHp, 500);
  mask.owner.currentHp = 500;
  assert.ok(resolveCampfire(mask.owner, "camp-a", "rest").restored > 0);
  const battle = initializeBattle([
    { id: "holder", team: "ally", row: "front", hp: 1000, currentHp: 500, atk: 100, def: 0, spd: 100, critChance: 0, lifesteal: .25, stoneMaskHealingBlocked: true },
    { id: "foe", team: "enemy", row: "front", hp: 1000, atk: 10, def: 0, spd: 10, critChance: 0 },
  ]);
  const event = executeAttack(battle, battle.characters[0], battle.characters[1], () => .99);
  assert.equal(event.actualDamage, 100);
  assert.equal(event.treasureLifesteal, 25);
  assert.equal(battle.characters[0].currentHp, 525);
});

test("formal battle roster carries treasure modifiers, and stage-two campfire still heals the unmasked partner", () => {
  const campaign = createStageTwoDirectBattleCampaign({ heroId: "naruto", partnerId: "eren", encounterId: "toji", localStep: 6, seed: 83 });
  campaign.partyStates.naruto.permanentEffects.push({ id: "magic_conch" }, { id: "odm_gear" }, { id: "nichirin_blade" });
  campaign.partyStates.eren.permanentEffects.push({ id: "stone_mask" });
  const roster = prepareBattle(campaign).roster;
  const main = roster.find((unit) => unit.id === "naruto");
  const partner = roster.find((unit) => unit.id === "eren");
  assert.deepEqual([main.damageReductionBonus, main.dodgeRateBonus, main.normalAttackCurrentHpRatio], [.05, .05, .1]);
  assert.equal(partner.lifesteal, .25);
  assert.equal(partner.stoneMaskHealingBlocked, true);
  const rest = createStageTwoTestCampaign({ heroId: "naruto", partnerId: "eren", seed: 72 });
  rest.partyStates.naruto.currentHp = 500;
  rest.partyStates.eren.currentHp = 500;
  rest.partyStates.eren.permanentEffects.push({ id: "stone_mask" });
  rest.status = "event";
  rest.activeEventType = "campfire";
  rest.activeNode = { id: "camp-test", resolution: "campfire" };
  rest.eventResolved = false;
  const resolved = resolveStageTwoCampfire(rest, "rest");
  assert.ok(resolved);
  assert.ok(rest.partyStates.naruto.currentHp > 500);
  assert.equal(rest.partyStates.eren.currentHp, 500);
});

test("stone mask blocks direct healing, growing treasure healing, angel breath and stage transitions", () => {
  const holder = createRunCharacterState(eren);
  holder.currentHp = 500;
  holder.permanentEffects.push({ id: "stone_mask", lifesteal: .4 });
  assert.equal(getTreasureCombatModifiers(holder).lifesteal, .25);
  assert.equal(holder.permanentEffects[0].lifesteal, .25);
  assert.equal(healRunCharacter(holder, 300, "heal-test").restored, 0);
  assert.equal(grantGiantSpinalFluid(holder, "fluid-test", 2).restoredHp, 0);
  assert.equal(grantGunDevilFragment(holder, "fragment-test", 2).restoredHp, 0);
  const angel = offerFor("angel_breath");
  assert.ok(claimTreasure(angel.owner, angel.sourceId, "angel_breath", holder, holder.characterId));
  assert.equal(holder.currentHp, 500);
  const campaign = createStageTwoTestCampaign({ heroId: "naruto", partnerId: "eren", seed: 74 });
  campaign.partyStates.eren = holder;
  campaign.partyStates.naruto.currentHp = 500;
  assert.equal(restorePartyHealthForStage(campaign, 3), true);
  assert.equal(holder.currentHp, 500);
  assert.equal(campaign.partyStates.naruto.currentHp, campaign.partyStates.naruto.maxHp);
});

test("Nichirin Blade creates a separate DEF-free hit based on remaining HP after normal or skill hits", () => {
  const actor = { id: "holder", team: "ally", row: "front", hp: 5000, atk: 300, def: 0, spd: 100, critChance: 0, normalAttackCurrentHpRatio: .1 };
  const target = { id: "foe", team: "enemy", row: "front", hp: 2000, atk: 1, def: 0, spd: 1, critChance: 0 };
  const result = simulateBattle([actor, target], () => .99);
  const first = result.events.find((event) => event.type === "attack" && event.attackerId === "holder");
  const bonus = result.events.find((event) => event.type === "treasure-damage");
  assert.equal(first.damage, 300);
  assert.equal(first.hpBefore, 2000);
  assert.deepEqual([bonus.basisHp, bonus.requested, bonus.damage, bonus.hpBefore, bonus.hpAfter], [1700, 170, 170, 1700, 1530]);
  assert.ok(result.events.filter((event) => event.type === "treasure-damage").every((event) => event.basisHp === event.hpBefore));
  let rolls = 0;
  const dodge = simulateBattle([actor, target], () => rolls++ < 2 ? 0 : .99);
  const firstAttackIndex = dodge.events.findIndex((event) => event.type === "attack" && event.attackerId === "holder");
  assert.equal(dodge.events[firstAttackIndex].dodged, true);
  assert.notEqual(dodge.events[firstAttackIndex + 1]?.type, "treasure-damage");
  const skill = { id: "test-active", name: "技能", chance: 1, multiplier: 1.3 };
  const active = simulateBattle([{ ...actor, skills: [skill], skill }, target], () => .99);
  assert.ok(active.events.filter((event) => event.type === "treasure-damage").length > 0);
});

test("angel breath grows maximum HP and restores 30% after each battle exactly once", () => {
  const angel = offerFor("angel_breath");
  angel.member.currentHp = 200;
  assert.ok(claimTreasure(angel.owner, angel.sourceId, "angel_breath", angel.member, angel.member.characterId));
  assert.equal(angel.member.currentHp, 200);
  assert.equal(angel.member.maxHp, 1600);
  const campaign = createStageTwoDirectBattleCampaign({ heroId: "naruto", partnerId: "eren", encounterId: "toji", localStep: 6, seed: 83 });
  campaign.partyStates.naruto.permanentEffects.push({ id: "angel_breath", sourceId: "event:old" });
  prepareBattle(campaign);
  const maxHp = campaign.partyStates.naruto.maxHp;
  const result = finishBattle(campaign, "victory", 0, [], [
    { id: "naruto", team: "ally", currentHp: 0 }, { id: "eren", team: "ally", currentHp: 400 },
  ]);
  assert.equal(result.next, "victory");
  assert.equal(campaign.partyStates.naruto.currentHp, Math.max(1, Math.floor(maxHp * .05)) + Math.floor((maxHp + 50) * .30));
  assert.equal(campaign.partyStates.naruto.maxHp, maxHp + 50);
  assert.equal(campaign.partyStates.eren.currentHp, 400);
  assert.deepEqual(campaign.lastBattleRecovery.map((entry) => entry.kind), ["revive", "angel_breath"]);
  assert.equal(finishBattle(campaign, "victory", 0, [], []), false);
});

test("repeat angel-breath pickups grant no immediate max HP", () => {
  const member = createRunCharacterState(hero);
  const originalMax = member.maxHp;
  for (const number of [1, 2]) {
    const sourceId = `angel-repeat-${number}`;
    assert.ok(grantEventTreasure(member, sourceId, "angel_breath", 1, "测试奖励"));
  }
  assert.deepEqual(member.permanentEffects.filter((effect) => effect.id === "angel_breath").map((effect) => effect.maxHp), [undefined, undefined]);
  assert.equal(member.maxHp, originalMax);
});

test("team defeat grants no revival; event battle reward tier follows its original option", () => {
  const defeated = createStageTwoDirectBattleCampaign({ heroId: "naruto", partnerId: "eren", encounterId: "toji", localStep: 6, seed: 83 });
  prepareBattle(defeated);
  assert.equal(finishBattle(defeated, "defeat", 0, [], [
    { id: "naruto", team: "ally", currentHp: 0 }, { id: "eren", team: "ally", currentHp: 0 },
  ]).next, "defeat");
  assert.deepEqual(defeated.lastBattleRecovery, []);
  const lostTreasury = createStageTwoTestCampaign({ heroId: "naruto", partnerId: "eren", seed: 72 });
  const lostNode = getRouteOptions(lostTreasury).find((node) => node.type === "question");
  chooseRoute(lostTreasury, lostNode.id);
  delete lostTreasury.runCharacterState.eventResults[lostNode.id];
  lostTreasury.pendingEvent = createAdventureEventResult(lostTreasury.runCharacterState, lostNode.id, "kings_treasury");
  assert.equal(resolveCampaignEvent(lostTreasury, "treasury_advance").result.pendingBattle, true);
  assert.ok(startCampaignEventBattle(lostTreasury));
  prepareBattle(lostTreasury);
  assert.equal(finishBattle(lostTreasury, "defeat", 0, [], [
    { id: "naruto", team: "ally", currentHp: 0 }, { id: "eren", team: "ally", currentHp: 0 },
  ]).next, "defeat");
  assert.equal(getCampaignTreasureOffer(lostTreasury), null);
  assert.equal(lostTreasury.runCharacterState.eventResults[lostNode.id].status, "failed");
  for (const [choice, randomValue, tier] of [["treasury_steal", .95, "small"], ["treasury_advance", .95, "royal"]]) {
    const campaign = createStageTwoTestCampaign({ heroId: "naruto", partnerId: "eren", seed: 72 });
    const question = getRouteOptions(campaign).find((node) => node.type === "question");
    chooseRoute(campaign, question.id);
    delete campaign.runCharacterState.eventResults[question.id];
    campaign.pendingEvent = createAdventureEventResult(campaign.runCharacterState, question.id, "kings_treasury");
    campaign.random = () => randomValue;
    assert.equal(resolveCampaignEvent(campaign, choice).result.pendingBattle, true);
    assert.ok(startCampaignEventBattle(campaign));
    prepareBattle(campaign);
    assert.equal(finishBattle(campaign, "victory", campaign.playerHp).next, "reward");
    const offer = getCampaignTreasureOffer(campaign);
    assert.equal(offer.tier, tier);
    assert.equal(new Set(offer.choices).size, 2);
    assert.ok(claimCampaignTreasure(campaign, offer.choices[0], campaign.partyIds[1]));
    assert.equal(claimCampaignTreasure(campaign, offer.choices[1], campaign.partyIds[0]), false);
  }
});

test("direct 80% theft keeps the cached offer on the event node until one recipient claims", () => {
  const campaign = createStageTwoTestCampaign({ heroId: "naruto", partnerId: "eren", seed: 72 });
  const question = getRouteOptions(campaign).find((node) => node.type === "question");
  chooseRoute(campaign, question.id);
  delete campaign.runCharacterState.eventResults[question.id];
  campaign.pendingEvent = createAdventureEventResult(campaign.runCharacterState, question.id, "kings_treasury");
  campaign.random = () => .1;
  assert.equal(resolveCampaignEvent(campaign, "treasury_steal").result.treasureOffer, "small");
  assert.equal(campaign.status, "event");
  assert.equal(campaign.eventResolved, false);
  const offer = getCampaignTreasureOffer(campaign);
  assert.equal(new Set(offer.choices).size, 2);
  assert.deepEqual(getCampaignTreasureOffer(campaign), offer);
  assert.ok(claimCampaignTreasure(campaign, offer.choices[0], campaign.partyIds[0]));
  assert.equal(campaign.eventResolved, true);
  assert.equal(getCampaignTreasureOffer(campaign), null);
  assert.equal(claimCampaignTreasure(campaign, offer.choices[1], campaign.partyIds[1]), false);
});

test("treasury theft advances once for one- or two-person parties and returns to the route", () => {
  for (const partySize of [1, 2]) {
    const campaign = createStageTwoTestCampaign({ heroId: "naruto", partnerId: "eren", seed: 72 });
    if (partySize === 1) campaign.partyIds = [campaign.playerId];
    const question = getRouteOptions(campaign).find((node) => node.type === "question");
    chooseRoute(campaign, question.id);
    delete campaign.runCharacterState.eventResults[question.id];
    campaign.pendingEvent = createAdventureEventResult(campaign.runCharacterState, question.id, "kings_treasury");
    campaign.random = () => .1;
    assert.equal(resolveCampaignEvent(campaign, "treasury_steal").result.treasureOffer, "small");
    assert.equal(resolveCampaignEvent(campaign, "treasury_steal"), false);
    const offer = getCampaignTreasureOffer(campaign);
    assert.equal(offer.choices.length, 2);
    assert.ok(claimCampaignTreasure(campaign, offer.choices[0], campaign.playerId));
    assert.equal(claimCampaignTreasure(campaign, offer.choices[0], campaign.playerId), false);
    assert.equal(completeLocation(campaign), "route");
    assert.equal(campaign.activeNode, null);
    assert.equal(campaign.step, 13);
    assert.equal(getRouteOptions(campaign).length > 0, true);
  }
});
