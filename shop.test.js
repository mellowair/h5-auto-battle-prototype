import test from "node:test";
import assert from "node:assert/strict";
import { STARTING_CHARACTERS } from "./characters.js";
import { simulateBattle } from "./battle.js";
import { beginJourney, buyShopItem, chooseRoute, createCampaign, finishBattle, getRouteOptions, getShopRouteOptions, leaveShop, prepareBattle, selectStartingCharacter, startCampaign } from "./campaign.js";
import { createRunCharacterState, grantGiantSpinalFluid } from "./progression.js";
import { analyzeRouteMap, generateRouteMap, validateRouteMap } from "./routeMap.js";
import { essenceRewardForBattle, generateShopInventory, previewShopItem, refreshShopPrices } from "./shop.js";
import { SHOP_RULES } from "./shopConfig.js";

function shopFixture(stageId = 3) {
  const campaign = createCampaign(() => 0, { seed: 42 });
  startCampaign(campaign);
  campaign.candidateIds = ["naruto"];
  selectStartingCharacter(campaign, "naruto", STARTING_CHARACTERS.find((entry) => entry.id === "naruto").activeSkills[0]);
  campaign.stageId = stageId;
  campaign.stageStep = 1;
  campaign.trialOffered = true;
  campaign.status = "route";
  const shop = campaign.routeMap.nodes.find((entry) => entry.type === "shop");
  const parent = campaign.routeMap.nodes.find((entry) => entry.nextNodeIds.includes(shop.id));
  campaign.routeMap.currentNodeId = parent.id;
  shop.status = "pending";
  assert.equal(chooseRoute(campaign, shop.id).type, "shop");
  return campaign;
}

function replaceSlot(campaign, categoryId, itemId, price) {
  const slot = campaign.activeShop.slots[0];
  Object.assign(slot, { categoryId, itemId, price, available: true, purchased: false });
  return slot;
}

test("each seeded stage map has exactly two shops on shorter lanes with legal path gaps", () => {
  for (const stageId of [1, 2, 3]) for (let seed = 0; seed < 150; seed += 1) {
    const map = generateRouteMap(seed, { stageId });
    const stats = analyzeRouteMap(map);
    assert.equal(validateRouteMap(map), true);
    assert.equal(stats.shops.length, 2);
    assert.equal(stats.invalidPaths, 0);
    assert.equal(stats.shortest, 13);
    assert.equal(stats.longest, 15);
  }
});

test("five independent slots are deterministic and obey stage medicine prices", () => {
  for (const stageId of [1, 2, 3]) {
    const a = generateShopInventory("fixed-map:shop-1", stageId);
    assert.deepEqual(a, generateShopInventory("fixed-map:shop-1", stageId));
    assert.equal(a.length, SHOP_RULES.slots);
    assert.ok(a.every((slot) => slot.available && slot.price > 0));
    assert.ok(a.filter((slot) => slot.categoryId === "medicine").every((slot) => slot.price === stageId));
    for (const [category, price] of [["common", 15], ["growing", 20], ["book", 40], ["rare", 40]])
      assert.ok(a.filter((slot) => slot.categoryId === category).every((slot) => slot.price === price));
  }
});

test("essence rewards give special enemies precedence and leave unconfigured events at zero", () => {
  for (const [type, amount] of [["normal", 1], ["elite", 3], ["boss", 5]])
    assert.equal(essenceRewardForBattle({ type, enemies: ["guard"] }).amount, amount);
  for (const [id, amount] of [["dina", 3], ["arima", 3], ["six_ear", 3], ["gilgamesh", 5]])
    assert.equal(essenceRewardForBattle({ type: "event", enemies: [id] }).amount, amount);
  assert.equal(essenceRewardForBattle({ type: "event", enemies: ["suzuya"] }).amount, 0);
});

test("a real victory credits essence once and a defeat credits none", () => {
  for (const outcome of ["victory", "defeat"]) {
    const campaign = createCampaign(() => 0, { seed: 42 });
    startCampaign(campaign);
    campaign.candidateIds = ["naruto"];
    selectStartingCharacter(campaign, "naruto", STARTING_CHARACTERS.find((entry) => entry.id === "naruto").activeSkills[0]);
    beginJourney(campaign);
    const battleNode = getRouteOptions(campaign).find((node) => node.type === "battle");
    assert.ok(chooseRoute(campaign, battleNode.id));
    assert.ok(prepareBattle(campaign));
    const result = finishBattle(campaign, outcome, outcome === "victory" ? campaign.playerHp : 0);
    assert.ok(result);
    assert.equal(campaign.essence, outcome === "victory" ? 1 : 0);
    assert.equal(finishBattle(campaign, outcome, campaign.playerHp), false);
    assert.equal(campaign.essenceHistory.length, outcome === "victory" ? 1 : 0);
  }
});

test("shop purchase uses first-stage growth, all-source repeat count, and consumes one slot once", () => {
  const campaign = shopFixture();
  const member = campaign.runCharacterState;
  const slot = replaceSlot(campaign, "growing", "giant_spinal_fluid", 10);
  campaign.essence = 60;
  const before = { def: member.def, hp: member.maxHp, currentHp: member.currentHp };
  const first = buyShopItem(campaign, slot.index);
  assert.deepEqual([first.def, first.maxHp, first.stageId], [20, 150, 3]);
  assert.deepEqual([member.def - before.def, member.maxHp - before.hp, member.currentHp - before.currentHp], [20, 150, 150]);
  assert.equal(campaign.essence, 40);
  assert.equal(buyShopItem(campaign, slot.index), false);
  assert.equal(campaign.essence, 40);
  grantGiantSpinalFluid(member, "event:other", 2);
  const next = { ...slot, index: 1, purchased: false };
  campaign.activeShop.slots[1] = next;
  const secondShop = buyShopItem(campaign, 1);
  assert.deepEqual([secondShop.def, secondShop.maxHp], [28, 210]);
  assert.equal(member.permanentEffects[0].def, 20, "historical benefit stays fixed");
  assert.equal(campaign.essence, 20);
  assert.equal(leaveShop(campaign), true);
  assert.equal(leaveShop(campaign), false);
  assert.equal(campaign.shopHistory[0].purchases.length, 2);
  assert.equal(getShopRouteOptions(campaign).length, 0);
});

test("existing shop stock receives updated prices and official item art", () => {
  const campaign = shopFixture(2);
  const samples = [
    ["common", "magic_conch", 15, "assets/treasures/magic-conch.png"],
    ["growing", "gun_devil_fragment", 20, "assets/treasures/gun-devil-fragment.png"],
    ["book", "iron_bell_book", 40, "assets/shop/skill-book.png"],
    ["rare", "angel_breath", 40, "assets/treasures/angel-breath.png"],
    ["medicine", "medicine_atk_2", 2, "assets/shop/potion.png"],
  ];
  campaign.activeShop.slots = samples.map(([categoryId, itemId], index) => ({
    index, categoryId, itemId, price: 1, image: "assets/shop/skill-book.svg", available: true, purchased: false,
  }));
  refreshShopPrices(campaign);
  assert.deepEqual(campaign.activeShop.slots.map((slot) => [slot.price, slot.image]),
    samples.map(([, , price, image]) => [price, image]));
});

test("shop purchase assigns the chosen partner and leaves the main character unchanged", () => {
  const campaign = shopFixture(2);
  const partner = createRunCharacterState(STARTING_CHARACTERS.find((entry) => entry.id === "eren"));
  campaign.partyIds.push("eren");
  campaign.partyStates.eren = partner;
  campaign.essence = 20;
  replaceSlot(campaign, "growing", "gun_devil_fragment", 10);
  const mainHp = campaign.runCharacterState.maxHp;
  const partnerHp = partner.maxHp;
  assert.ok(buyShopItem(campaign, 0, "eren"));
  assert.equal(campaign.essence, 0);
  assert.equal(campaign.runCharacterState.maxHp, mainHp);
  assert.equal(partner.maxHp, partnerHp + 200);
  assert.equal(campaign.activeShop.purchases[0].recipientId, "eren");
});

test("shop medicine affects only the next battle and blocks a duplicate purchase for the same character", () => {
  const campaign = shopFixture(1);
  campaign.essence = 10;
  replaceSlot(campaign, "medicine", "medicine_atk_1", 1);
  assert.ok(buyShopItem(campaign, 0));
  campaign.activeShop.slots[1] = { ...campaign.activeShop.slots[0], index: 1, purchased: false };
  assert.equal(previewShopItem(campaign, campaign.activeShop.slots[1]).alreadyOwned, true);
  assert.equal(buyShopItem(campaign, 1), false);
  assert.equal(campaign.activeShop.slots[1].purchased, false);
  assert.equal(campaign.essence, 9);
  const permanentAtk = campaign.runCharacterState.atk;
  campaign.currentBattle = { type: "normal", step: 1, enemies: ["guard"], enemyNames: { guard: "守卫" } };
  campaign.status = "combat";
  const battle = prepareBattle(campaign);
  assert.equal(battle.roster.find((unit) => unit.id === campaign.playerId).atk, permanentAtk + 20);
  assert.equal(campaign.runCharacterState.atk, permanentAtk);
  // The duration is consumed by the actual campaign settlement, not preparation.
  assert.equal(campaign.shopMedicines.length, 1);
  assert.equal(finishBattle(campaign, "victory", campaign.playerHp).status, "reward");
  assert.equal(campaign.shopMedicines.length, 0);
  campaign.currentBattle = { type: "normal", step: 2, enemies: ["guard"], enemyNames: { guard: "守卫" } };
  campaign.status = "combat";
  assert.equal(prepareBattle(campaign).roster.find((unit) => unit.id === campaign.playerId).atk, permanentAtk);
});

test("the same medicine may be bought for a different party member", () => {
  const campaign = shopFixture(2);
  campaign.essence = 10;
  campaign.partyIds.push("eren");
  campaign.partyStates.eren = createRunCharacterState(STARTING_CHARACTERS.find((entry) => entry.id === "eren"));
  replaceSlot(campaign, "medicine", "medicine_def_2", 2);
  assert.ok(buyShopItem(campaign, 0, "naruto"));
  campaign.activeShop.slots[1] = { ...campaign.activeShop.slots[0], index: 1, purchased: false };
  assert.equal(previewShopItem(campaign, campaign.activeShop.slots[1], "eren").alreadyOwned, false);
  assert.ok(buyShopItem(campaign, 1, "eren"));
  assert.equal(campaign.shopMedicines.length, 2);
  assert.equal(campaign.essence, 6);
});

test("generic medicine framework also supports a future two-battle duration", () => {
  const campaign = shopFixture(2);
  const baseDef = campaign.runCharacterState.def;
  campaign.shopMedicines.push({ id: "test-two-battle", recipientId: campaign.playerId,
    battlesLeft: 2, modifiers: { def: 30 } });
  for (let index = 0; index < 2; index += 1) {
    campaign.currentBattle = { type: "normal", step: index + 1, enemies: ["guard"], enemyNames: { guard: "守卫" } };
    campaign.status = "combat";
    assert.equal(prepareBattle(campaign).roster.find((unit) => unit.id === campaign.playerId).def, baseDef + 30);
    assert.equal(finishBattle(campaign, "victory", campaign.playerHp).status, "reward");
    assert.equal(campaign.shopMedicines.length, index === 0 ? 1 : 0);
  }
  assert.equal(campaign.runCharacterState.def, baseDef);
});

test("skill book teaches one passive without replacing the hero's innate passive", () => {
  const campaign = shopFixture();
  campaign.essence = 40;
  replaceSlot(campaign, "book", "iron_bell_book", 20);
  const innate = campaign.runCharacterState.passiveSkillId;
  assert.ok(buyShopItem(campaign, 0));
  assert.equal(campaign.runCharacterState.passiveSkillId, innate);
  assert.ok(campaign.runCharacterState.extraPassiveSkillIds.includes("iron-bell"));
  assert.equal(buyShopItem(campaign, 0), false);
  assert.equal(campaign.essence, 0);
});

test("a pre-shop save without essence cannot buy an item for free", () => {
  const campaign = shopFixture();
  replaceSlot(campaign, "common", "magic_conch", 5);
  delete campaign.essence;
  assert.equal(buyShopItem(campaign, 0), false);
  assert.equal(campaign.activeShop.slots[0].purchased, false);
});

test("iron bell reflects half the actual damage only against a lower-defense source", () => {
  const fighter = (id, team, def, passive = false) => ({ id, name: id, team, row: "front", position: "front",
    hp: 900, maxHp: 900, currentHp: 900, atk: team === "enemy" ? 400 : 40, def, spd: team === "enemy" ? 80 : 10,
    critChance: 0, extraPassiveSkillIds: passive ? ["iron-bell"] : [] });
  const result = simulateBattle([fighter("enemy", "enemy", 50), fighter("hero", "ally", 300, true)], () => .99);
  const hit = result.events.find((event) => event.type === "attack" && event.attackerId === "enemy" && event.actualDamage > 0);
  const reflection = result.events.find((event) => event.skillId === "iron-bell");
  assert.ok(hit && reflection);
  assert.equal(reflection.requested, Math.floor(hit.actualDamage * .5));
  const blocked = simulateBattle([fighter("enemy", "enemy", 350), fighter("hero", "ally", 300, true)], () => .99);
  assert.equal(blocked.events.some((event) => event.skillId === "iron-bell"), false);
});
