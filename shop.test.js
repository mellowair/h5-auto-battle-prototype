import test from "node:test";
import assert from "node:assert/strict";
import { STARTING_CHARACTERS } from "./characters.js";
import { executeAttack, initializeBattle, simulateBattle } from "./battle.js";
import { beginJourney, buyShopItem, chooseRoute, claimFateReward, createCampaign, finishBattle, getRouteOptions, getShopRouteOptions, leaveShop, prepareBattle, selectStartingCharacter, startCampaign } from "./campaign.js";
import { createRunCharacterState, grantGiantSpinalFluid, upgradePassiveSkill } from "./progression.js";
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

test("seven independent slots are deterministic and obey stage medicine prices", () => {
  for (const stageId of [1, 2, 3]) {
    const a = generateShopInventory("fixed-map:shop-1", stageId);
    assert.deepEqual(a, generateShopInventory("fixed-map:shop-1", stageId));
    assert.equal(a.length, SHOP_RULES.slots);
    assert.ok(a.every((slot) => slot.available && slot.price > 0));
    assert.ok(a.filter((slot) => slot.categoryId === "medicine").every((slot) => slot.price === stageId));
    assert.ok(a.filter((slot) => slot.categoryId === "common").every((slot) => slot.price === 15));
    assert.ok(a.filter((slot) => slot.categoryId === "book").every((slot) => [30, 40].includes(slot.price)));
    assert.ok(a.filter((slot) => slot.categoryId === "rare").every((slot) => slot.price === 20));
    assert.ok(a.filter((slot) => slot.categoryId === "legendary").every((slot) => slot.price === 40));
  }
});

test("one hundred shop rolls each contain seven distinct item IDs, even when a category runs out", () => {
  let newBookSeen = false;
  for (const stageId of [1, 2, 3]) for (let seed = 0; seed < 100; seed += 1) {
    const slots = generateShopInventory(`unique:${seed}`, stageId);
    assert.equal(slots.length, 7);
    assert.equal(new Set(slots.map((slot) => slot.itemId)).size, 7);
    assert.ok(slots.every((slot) => slot.available && slot.itemId));
    newBookSeen ||= slots.some((slot) => ["mirror_flower_book", "byakugan_book"].includes(slot.itemId) && slot.price === 30);
  }
  assert.equal(newBookSeen, true);
  const campaign = shopFixture(1);
  const savedSlots = structuredClone(campaign.activeShop.slots);
  refreshShopPrices(campaign);
  assert.deepEqual(campaign.activeShop.slots.map((slot) => slot.itemId), savedSlots.map((slot) => slot.itemId));
});

test("shop category weights split higher treasures into rare and legendary pools", () => {
  assert.equal(SHOP_RULES.slots, 7);
  assert.deepEqual(Object.fromEntries(SHOP_RULES.categories.map(({ id, weight }) => [id, weight])),
    { common: 30, medicine: 30, rare: 10, legendary: 10, book: 20 });
  const stock = SHOP_RULES.categories;
  assert.ok(stock.find((entry) => entry.id === "common").ids.includes("drip_coffee"));
  for (const id of ["quinque_crit", "quinque_guard"])
    assert.ok(stock.find((entry) => entry.id === "legendary").ids.includes(id));
  const campaign = shopFixture(2);
  campaign.essence = 100;
  for (const [index, [id, category, price]] of [["quinque_crit", "legendary", 40],
    ["quinque_guard", "legendary", 40], ["drip_coffee", "common", 15]].entries()) {
    const slot = campaign.activeShop.slots[index];
    Object.assign(slot, { categoryId: category, itemId: id, price: 1, available: true, purchased: false });
    refreshShopPrices(campaign);
    assert.equal(slot.price, price);
    assert.ok(slot.image?.endsWith(".png"));
    assert.equal(buyShopItem(campaign, index).id, id);
    assert.equal(campaign.runCharacterState.permanentEffects.at(-1).id, id);
  }
});

test("essence rewards give special enemies precedence and leave unconfigured events at zero", () => {
  for (const [type, amount] of [["normal", 2], ["elite", 4], ["boss", 7]])
    assert.equal(essenceRewardForBattle({ type, enemies: ["guard"] }).amount, amount);
  for (const [id, amount] of [["dina", 4], ["arima", 4], ["six_ear", 4], ["gilgamesh", 7]])
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
    assert.equal(campaign.essence, outcome === "victory" ? 2 : 0);
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
  assert.deepEqual([first.def, first.maxHp, first.stageId], [10, 100, 3]);
  assert.deepEqual([member.def - before.def, member.maxHp - before.hp, member.currentHp - before.currentHp], [10, 100, 100]);
  assert.equal(campaign.essence, 40);
  assert.equal(buyShopItem(campaign, slot.index), false);
  assert.equal(campaign.essence, 40);
  grantGiantSpinalFluid(member, "event:other", 2);
  const next = { ...slot, index: 1, purchased: false };
  campaign.activeShop.slots[1] = next;
  const secondShop = buyShopItem(campaign, 1);
  assert.deepEqual([secondShop.def, secondShop.maxHp], [14, 140]);
  assert.equal(member.permanentEffects[0].def, 10, "historical benefit stays fixed");
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

test("a partner's purchased skill book reaches combat and reflects actual damage", () => {
  const campaign = shopFixture();
  const partner = createRunCharacterState(STARTING_CHARACTERS.find((entry) => entry.id === "eren"));
  partner.def = 300;
  campaign.partyIds.push("eren");
  campaign.partyStates.eren = partner;
  campaign.essence = 40;
  replaceSlot(campaign, "book", "iron_bell_book", 40);
  assert.ok(buyShopItem(campaign, 0, "eren"));
  assert.equal(campaign.runCharacterState.extraPassiveSkillIds?.includes("iron-bell") ?? false, false);
  campaign.currentBattle = { type: "normal", step: 1, enemies: ["guard"], enemyNames: { guard: "守卫" } };
  campaign.status = "combat";
  const eren = prepareBattle(campaign).roster.find((unit) => unit.id === "eren");
  assert.ok(eren.extraPassiveSkillIds.includes("iron-bell"));
  const enemy = { id: "book-test-enemy", name: "测试敌人", team: "enemy", row: "front", position: "front",
    hp: 1000, atk: 500, def: 50, spd: 200, critChance: 0 };
  const result = simulateBattle([eren, enemy], () => .99);
  const hit = result.events.find((event) => event.type === "attack" && event.attackerId === enemy.id && event.actualDamage > 0);
  const reflected = result.events.find((event) => event.skillId === "iron-bell");
  assert.ok(hit && reflected);
  assert.equal(reflected.requested, Math.floor(hit.actualDamage * .5));
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
  assert.equal(reflection.calculatedDamage, reflection.requested);
  assert.equal(reflection.actualDamage, reflection.calculatedDamage);
  const blocked = simulateBattle([fighter("enemy", "enemy", 350), fighter("hero", "ally", 300, true)], () => .99);
  assert.equal(blocked.events.some((event) => event.skillId === "iron-bell"), false);
  const equal = simulateBattle([fighter("enemy", "enemy", 330), fighter("hero", "ally", 300, true)], () => .99);
  assert.equal(equal.events.some((event) => event.skillId === "iron-bell"), false);
  assert.equal(result.events.filter((event) => event.skillId === "iron-bell").length,
    result.events.filter((event) => event.type === "attack" && event.attackerId === "enemy" && event.actualDamage > 0).length);
});

test("Tang cannot obtain Heavenly Restriction from either the shop or a Fate book reward", () => {
  const campaign = shopFixture();
  const tang = createRunCharacterState(STARTING_CHARACTERS.find((entry) => entry.id === "tang"));
  campaign.playerId = "tang";
  campaign.partyIds = ["tang"];
  campaign.partyStates = { tang };
  campaign.runCharacterState = tang;
  campaign.essence = 100;
  const slot = replaceSlot(campaign, "book", "heavenly_restriction_book", 40);
  assert.equal(previewShopItem(campaign, slot, "tang").recipientIneligible, true);
  assert.equal(buyShopItem(campaign, slot.index, "tang"), false);
  assert.equal(tang.extraPassiveSkillIds?.includes("heavenly-restriction-book") ?? false, false);
  campaign.pendingFateReward = { type: "long", bookId: "heavenly_restriction_book", sourceId: "fate-book" };
  assert.equal(claimFateReward(campaign, "tang"), false);
  assert.equal(tang.extraPassiveSkillIds?.includes("heavenly-restriction-book") ?? false, false);
});

test("iron bell grants no skill defense penetration", () => {
  const skill = { id: "test-skill", name: "测试技能", type: "active", multiplier: 1.5 };
  const fighter = (books) => ({ id: "hero", name: "主角", team: "ally", row: "front", position: "front",
    hp: 1000, atk: 100, def: 300, spd: 30, critChance: 0, extraPassiveSkillIds: books });
  const target = { id: "foe", name: "敌人", team: "enemy", row: "front", position: "front",
    hp: 1000, atk: 1, def: 100, spd: 1, critChance: 0 };
  const attack = (books) => {
    const state = initializeBattle([fighter(books), target]);
    state.round = 1;
    return executeAttack(state, state.characters[0], state.characters[1], () => .99, { skill }).actualDamage;
  };
  assert.equal(attack(["iron-bell"]), attack([]));
});

test("passive upgrade uses the existing Lv2 effect exactly once and never changes active levels", () => {
  const eren = createRunCharacterState(STARTING_CHARACTERS.find((entry) => entry.id === "eren"));
  const initialActiveLevels = structuredClone(eren.skillLevels);
  const oldMaxHp = eren.maxHp;
  assert.deepEqual(upgradePassiveSkill(eren, "test:fireworks"),
    { skillId: "eren-2000-years", level: 2, maxHpBonus: 400 });
  assert.equal(eren.maxHp, oldMaxHp + 400);
  assert.equal(eren.passiveLevel, 2);
  assert.deepEqual(eren.skillLevels, initialActiveLevels);
  assert.equal(upgradePassiveSkill(eren, "test:fireworks"), false);
  assert.equal(upgradePassiveSkill(eren, "test:fireworks-again"), false);
  const noLevelTwo = createRunCharacterState(STARTING_CHARACTERS.find((entry) => entry.id === "naruto"));
  noLevelTwo.passiveSkillId = "ninja-instinct";
  assert.equal(upgradePassiveSkill(noLevelTwo, "test:unavailable"), false);
});

test("passive-upgrade book no longer appears in shop inventory", () => {
  assert.equal(SHOP_RULES.books.some((book) => book.skillType === "passive-upgrade"), false);
  for (let seed = 0; seed < 100; seed += 1)
    assert.equal(generateShopInventory(`removed-passive:${seed}`, 2)
      .some((slot) => slot.itemId === "lonelier_than_fireworks_book"), false);
  const oldSave = shopFixture(2);
  Object.assign(oldSave.activeShop.slots[0], { categoryId: "book", itemId: "lonelier_than_fireworks_book",
    name: "比烟花还寂寞", price: 30 });
  refreshShopPrices(oldSave);
  const ids = oldSave.activeShop.slots.map((slot) => slot.itemId);
  assert.equal(ids.includes("lonelier_than_fireworks_book"), false);
  assert.equal(new Set(ids).size, SHOP_RULES.slots);
  assert.ok(SHOP_RULES.books.some((book) => book.id === ids[0]));
});

test("Mirror Flower uses a skill book icon in shops and keeps its opening effect", () => {
  const book = SHOP_RULES.books.find((entry) => entry.id === "mirror_flower_book");
  assert.equal(book.image, "assets/shop/skill-book.png");
  assert.equal(book.effectImage, "assets/shop/mirror-flower-effect.png");
});
