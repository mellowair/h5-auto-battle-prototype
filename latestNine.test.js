import test from "node:test";
import assert from "node:assert/strict";
import { STARTING_CHARACTERS, ELITE_ENEMY_DATA, TRIAL_ENEMY_DATA } from "./characters.js";
import { createCampaign, startCampaign, selectStartingCharacter, chooseRoute, resolveCampaignEvent,
  prepareBattle, startCampaignEventBattle, finishBattle, getFateReward, claimFateReward, getRouteOptions } from "./campaign.js";
import { createAdventureEventResult, getAvailableAdventureEventIds, getTemporaryCombatModifiers } from "./progression.js";
import { activateVipCard, buyShopItem, generateShopInventory, registerShopEntry } from "./shop.js";
import { SHOP_RULES } from "./shopConfig.js";
import { TREASURE_DATA } from "./skills.js";
import { executeAttack, initializeBattle } from "./battle.js";

const elite = (id) => ELITE_ENEMY_DATA.find((entry) => entry.id === id);
function campaignFixture(stageId = 1, random = () => .99) {
  const campaign = createCampaign(random, { seed: 83 });
  startCampaign(campaign);
  campaign.candidateIds = ["naruto"];
  selectStartingCharacter(campaign, "naruto", STARTING_CHARACTERS.find((entry) => entry.id === "naruto").activeSkills[0]);
  campaign.stageId = stageId;
  campaign.stageStep = 8;
  return campaign;
}
function setEvent(campaign, eventId, stageId = campaign.stageId) {
  const node = { id: `event:${eventId}`, type: "question", status: "in_progress" };
  campaign.activeNode = node;
  campaign.pendingEvent = createAdventureEventResult(campaign.runCharacterState, node.id, eventId,
    campaign.random, [campaign.runCharacterState], stageId);
  campaign.status = "event";
  campaign.eventResolved = false;
  campaign.activeEventType = "adventure";
  return campaign.pendingEvent;
}

test("latest elite panels and Eternity threshold use the new values", () => {
  assert.equal(elite("eternity-devil").def, 50);
  assert.equal(elite("falling-devil").def, 180);
  assert.equal(TRIAL_ENEMY_DATA.odin.def, 120);
  assert.equal(TRIAL_ENEMY_DATA.heracles.def, 180);
});

test("found money's second choice forces the third actual stage-two question and marks Gilgamesh only", () => {
  const campaign = campaignFixture(1);
  setEvent(campaign, "found_money");
  resolveCampaignEvent(campaign, "money_leave");
  assert.equal(campaign.runCharacterState.eventSeries.foundMoneyTreasury.pending, true);
  campaign.stageId = 2;
  campaign.stage2AdventureCount = 2;
  campaign.status = "route";
  const start = { id: "start", type: "start", status: "completed", nextNodeIds: ["question"] };
  const question = { id: "question", type: "question", status: "pending", nextNodeIds: [] };
  campaign.routeMap = { currentNodeId: "start", nodes: [start, question], visitedEdges: [], seed: "test" };
  const entered = chooseRoute(campaign, "question");
  assert.equal(entered.event.eventId, "kings_treasury");
  assert.equal(entered.event.data.moneyBuff, true);
  assert.equal(campaign.stage2AdventureCount, 3);
  resolveCampaignEvent(campaign, "treasury_advance");
  startCampaignEventBattle(campaign);
  const prepared = prepareBattle(campaign);
  assert.equal(prepared.roster[0].damageTakenMultiplier, .8);
  assert.equal(prepared.roster[0].damageDealtMultiplier, 1.2);
  const make = (reduction) => initializeBattle([
    { id: "hero", team: "ally", row: "front", hp: 2000, atk: 100, def: 0, spd: 1,
      damageTakenMultiplier: reduction },
    { id: "foe", team: "enemy", row: "front", hp: 2000, atk: 500, def: 0, spd: 1, critChance: 0 },
  ]);
  const baseline = make(1), buffed = make(.8);
  const plain = executeAttack(baseline, baseline.characters[1], baseline.characters[0], () => .99);
  const reduced = executeAttack(buffed, buffed.characters[1], buffed.characters[0], () => .99);
  assert.equal(reduced.actualDamage, Math.floor(plain.actualDamage * .8));
});

test("death note sequel is gated and light reduces current-stage elite HP while blocking essence", () => {
  const campaign = campaignFixture(3);
  assert.ok(getAvailableAdventureEventIds(campaign.runCharacterState, 12, [campaign.runCharacterState], 3).includes("death_note"));
  assert.ok(!getAvailableAdventureEventIds(campaign.runCharacterState, 12, [campaign.runCharacterState], 3).includes("death_note_2"));
  setEvent(campaign, "death_note");
  resolveCampaignEvent(campaign, "death_temptation");
  assert.ok(getAvailableAdventureEventIds(campaign.runCharacterState, 12, [campaign.runCharacterState], 3).includes("death_note_2"));
  campaign.activeNode = null;
  setEvent(campaign, "death_note_2");
  resolveCampaignEvent(campaign, "death_light");
  assert.equal(campaign.runCharacterState.essenceBlockedBattles, 3);
  campaign.status = "combat";
  campaign.currentBattle = { id: "elite", type: "elite", enemies: ["falling-devil"], enemyGrowthExemptIds: ["falling-devil"] };
  const prepared = prepareBattle(campaign);
  assert.equal(prepared.roster.find((entry) => entry.id === "falling-devil").maxHp, 4725);
  const essenceBefore = campaign.essence;
  finishBattle(campaign, "victory", campaign.runCharacterState.currentHp);
  assert.equal(campaign.essence, essenceBefore);
  assert.equal(campaign.runCharacterState.essenceBlockedBattles, 2);
});

test("death note's reading choice deducts exactly 25% max HP before awarding one legendary treasure", () => {
  const campaign = campaignFixture();
  setEvent(campaign, "death_note");
  resolveCampaignEvent(campaign, "death_temptation");
  setEvent(campaign, "death_note_2");
  const before = campaign.runCharacterState.maxHp;
  const result = resolveCampaignEvent(campaign, "death_read");
  assert.equal(result.result.maxHpLoss, before - Math.floor(before * .75));
  assert.equal(campaign.runCharacterState.permanentEffects.length, 1);
  assert.equal(TREASURE_DATA[campaign.runCharacterState.permanentEffects[0].id].grade, "legendary");
  assert.equal(campaign.shopDiscount?.type, "premium_vip_card");
  assert.ok(campaign.runCharacterState.currentHp <= campaign.runCharacterState.maxHp);
});

test("fate experiment actually lowers ATK, counts completed battles, then offers the specified reward", () => {
  const campaign = campaignFixture(1);
  setEvent(campaign, "fate_gate");
  const result = resolveCampaignEvent(campaign, "fate_experiment");
  assert.equal(result.result.type, "short");
  assert.equal(getTemporaryCombatModifiers(campaign.runCharacterState).atkMultiplier, .95);
  for (let i = 0; i < 3; i += 1) {
    campaign.currentBattle = { id: `normal-${i}`, type: "normal", enemies: ["guard"] };
    campaign.status = "combat";
    campaign.combatLaunched = true;
    finishBattle(campaign, "victory", campaign.runCharacterState.currentHp);
  }
  const reward = getFateReward(campaign);
  assert.equal(reward.type, "short");
  assert.equal(TREASURE_DATA[reward.treasureId].grade, "common");
  assert.equal(getTemporaryCombatModifiers(campaign.runCharacterState).atkMultiplier, 1);
});

test("fate sequel reveals only the other two outcomes and VIP ticket applies to the next shop", () => {
  const campaign = campaignFixture();
  const first = setEvent(campaign, "fate_gate");
  assert.equal(first.data.experiment, "short");
  resolveCampaignEvent(campaign, "fate_continue");
  assert.ok(getAvailableAdventureEventIds(campaign.runCharacterState, 1, [campaign.runCharacterState], 1).includes("fate_gate_2"));
  setEvent(campaign, "fate_gate_2");
  assert.equal(resolveCampaignEvent(campaign, "fate_choose").data.phase, "select");
  assert.equal(resolveCampaignEvent(campaign, "fate_experiment|short"), false);
  assert.equal(resolveCampaignEvent(campaign, "fate_experiment|long").result.battlesRemaining, 7);
  const another = campaignFixture();
  setEvent(another, "fate_gate");
  resolveCampaignEvent(another, "fate_continue");
  setEvent(another, "fate_gate_2");
  assert.ok(resolveCampaignEvent(another, "fate_vip").result.vipTicket);
  another.status = "shop";
  another.activeShop = { nodeId: "next-shop", slots: [{ index: 0, categoryId: "common", itemId: "magic_conch", available: true, purchased: false }], purchases: [] };
  another.activeNode = { id: "next-shop" };
  another.essence = 100;
  registerShopEntry(another, "next-shop");
  assert.equal(another.activeShop.slots[0].price, 9);
  assert.ok(buyShopItem(another, 0, another.playerId));
  assert.equal(another.activeShop.purchases[0].price, 9);
  assert.equal(another.vipTrialTicket.used, true);
});

test("completed Fate rewards settle exactly once through the existing treasure and skill book systems", () => {
  const long = campaignFixture();
  long.runCharacterState.fateExperiment = { type: "long", battlesRemaining: 0, rewardClaimed: false };
  long.pendingFateReward = { type: "long", sourceId: "fate-long", bookId: "armament_haki_book" };
  assert.ok(claimFateReward(long, long.playerId));
  assert.ok(long.runCharacterState.extraPassiveSkillIds.includes("armament-haki"));
  assert.equal(claimFateReward(long, long.playerId), false);
  const medium = campaignFixture(2);
  medium.runCharacterState.fateExperiment = { type: "medium", battlesRemaining: 0, rewardClaimed: false };
  medium.pendingFateReward = { type: "medium", sourceId: "fate-medium",
    choices: ["giant_spinal_fluid", "gun_devil_fragment", "sukuna_finger"] };
  assert.ok(claimFateReward(medium, medium.playerId, "gun_devil_fragment"));
  assert.equal(medium.runCharacterState.permanentEffects.at(-1).maxHp, 240);
  assert.equal(claimFateReward(medium, medium.playerId, "giant_spinal_fluid"), false);
});

test("stage three begins with both route choices available while its first question remains the trial", () => {
  const campaign = campaignFixture(3);
  const start = { id: "start", type: "start", status: "completed", nextNodeIds: ["battle", "question"] };
  const battle = { id: "battle", type: "battle", status: "pending", nextNodeIds: [] };
  const question = { id: "question", type: "question", status: "pending", nextNodeIds: [] };
  campaign.routeMap = { currentNodeId: "start", nodes: [start, battle, question], visitedEdges: [], seed: "trial" };
  campaign.status = "route";
  assert.deepEqual(getRouteOptions(campaign).map((node) => node.id), ["battle", "question"]);
  assert.equal(chooseRoute(campaign, "question").event.eventId, "trial_land");
});

test("shop uses separate common, rare and legendary pools and VIP prices refresh in the same shop", () => {
  assert.deepEqual(Object.fromEntries(SHOP_RULES.categories.map(({ id, weight }) => [id, weight])),
    { common: 30, medicine: 30, rare: 10, legendary: 10, book: 20 });
  for (let i = 0; i < 100; i += 1) {
    const slots = generateShopInventory(`latest-${i}`, 2);
    assert.equal(slots.length, 7);
    assert.equal(new Set(slots.map((slot) => slot.itemId)).size, 7);
    for (const slot of slots.filter((entry) => ["common", "rare", "legendary"].includes(entry.categoryId)))
      assert.ok(TREASURE_DATA[slot.itemId]?.grade === slot.categoryId ||
        slot.categoryId === "legendary" && TREASURE_DATA[slot.itemId]?.grade === "superlegendary" ||
        slot.categoryId === "rare" && !TREASURE_DATA[slot.itemId]);
  }
  const campaign = campaignFixture();
  campaign.status = "shop";
  campaign.activeNode = { id: "shop-A" };
  campaign.activeShop = { nodeId: "shop-A", slots: [
    { index: 0, categoryId: "common", itemId: "vip_card", available: true, purchased: false },
    { index: 1, categoryId: "common", itemId: "magic_conch", available: true, purchased: false },
  ], purchases: [] };
  campaign.essence = 100;
  assert.ok(buyShopItem(campaign, 0, campaign.playerId));
  assert.equal(campaign.activeShop.purchases[0].price, 15);
  assert.equal(campaign.activeShop.slots[1].price, 12);
  assert.ok(buyShopItem(campaign, 1, campaign.playerId));
  assert.equal(campaign.activeShop.purchases[1].price, 12);
  registerShopEntry(campaign, "shop-B");
  registerShopEntry(campaign, "shop-B");
  assert.equal(campaign.shopDiscount.enteredShops, 1);
  registerShopEntry(campaign, "shop-C");
  assert.equal(campaign.shopDiscount.expired, true);
  activateVipCard(campaign, "premium_vip_card");
  assert.equal(campaign.shopDiscount.multiplier, .6);
});
