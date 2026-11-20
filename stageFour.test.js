import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { initializeBattle, executeAttack, simulateBattle } from "./battle.js";
import { beginStageFour, claimCampaignEliteDrop, claimStageTwoStatReward, completeSettlement, createCampaign, finishPartyReplacement,
  finishBattle, prepareBattle, recruitPartyMember } from "./campaign.js";
import { ELITE_ENEMY_DATA, RECRUIT_CHARACTERS, STARTING_CHARACTERS } from "./characters.js";
import { GUN_DEVIL } from "./hiddenBoss.js";
import { createRunCharacterState } from "./progression.js";
import { refreshShopPrices, buyShopItem } from "./shop.js";
import { ADVENTURE_EVENT_DATA, SKILL_DATA, TREASURE_DATA } from "./skills.js";
import { STAGE_FOUR_BOSS, STAGE_FOUR_UNITS, getStageFourUnit, stageFourBattle } from "./stageFour.js";

test("Gojo's two combat forms, execution portrait and new book effects have assets", () => {
  const gojo = RECRUIT_CHARACTERS.find((entry) => entry.id === "gojo");
  const paths = [gojo.asset, ...Object.values(gojo.animations).flatMap((animation) => Object.values(animation.frames)),
    "assets/gojo/skill-effect.png", "assets/gojo/domain-skill-effect.png",
    "assets/gojo/domain-entrance.png", "assets/gojo/execution-closeup.png",
    SKILL_DATA["mirror-flower"].battleEffectAsset, SKILL_DATA["eight-gates"].battleEffectAsset,
    TREASURE_DATA.oni_hammer.image];
  assert.ok(paths.every((path) => existsSync(path)));
});

test("Prison Realm and slot machine use supplied images", () => {
  for (const path of [TREASURE_DATA.prison_realm.image, ADVENTURE_EVENT_DATA.slot_machine.image]) {
    assert.match(path, /\.png$/);
    assert.ok(existsSync(new URL(path, import.meta.url)));
  }
  const icon = readFileSync(new URL(TREASURE_DATA.prison_realm.image, import.meta.url));
  assert.equal(icon[25], 6); // RGBA, with transparent pixels around the art.
});

test("Darkness Devil uses supplied combat poses and a transparent idle cutout", () => {
  const paths = [STAGE_FOUR_BOSS.asset,
    ...Object.values(STAGE_FOUR_BOSS.animations).flatMap((animation) => Object.values(animation.frames)),
    "assets/stage4-darkness/entrance.png", "assets/stage4-darkness/background.png",
    "assets/stage4-darkness/slash.png"];
  assert.ok(paths.every((path) => existsSync(new URL(path, import.meta.url))));
  assert.equal(readFileSync(new URL(STAGE_FOUR_BOSS.asset, import.meta.url))[25], 6);
});

function fixture() {
  const campaign = createCampaign(() => .5);
  const [hero, partner] = STARTING_CHARACTERS;
  campaign.playerId = hero.id;
  campaign.partyIds = [hero.id, partner.id];
  campaign.partyStates = Object.fromEntries([hero, partner].map((unit) => [unit.id, createRunCharacterState(unit, null)]));
  campaign.runCharacterState = campaign.partyStates[hero.id];
  campaign.stageId = 3;
  return campaign;
}

test("stage four groups duo encounters and isolates its panel overrides", () => {
  const ids = STAGE_FOUR_UNITS.flatMap((unit) => unit.enemies);
  assert.deepEqual([...ids].sort(), ELITE_ENEMY_DATA.map((unit) => unit.id).sort());
  assert.equal(getStageFourUnit("titan-duo").row, "front");
  assert.equal(getStageFourUnit("shin-noi").row, "front");
  assert.equal(getStageFourUnit("gold-silver-kings").row, "back");
  const encounter = stageFourBattle([getStageFourUnit("titan-duo"), getStageFourUnit("gold-silver-kings")], "elite", 1, 1);
  assert.equal(encounter.stageFourUnitIds.length, 2);
  assert.equal(encounter.enemies.length, 4);
  assert.equal(encounter.enemyBaseStats["gold-king"].hp, 3700);
  assert.equal(encounter.enemyBaseStats["silver-king"].hp, 3300);
  assert.equal(ELITE_ENEMY_DATA.find((unit) => unit.id === "gold-king").hp, 2700);
  assert.deepEqual([STAGE_FOUR_BOSS.hp, STAGE_FOUR_BOSS.atk, STAGE_FOUR_BOSS.def, STAGE_FOUR_BOSS.spd], [9999, 999, 555, 444]);
  assert.equal(encounter.enemyBaseStats["gold-king"].def, 210);
  assert.equal(encounter.enemyBaseStats["silver-king"].def, 180);
  assert.ok(existsSync(new URL("./assets/stage4-background.png", import.meta.url)));
});

test("Makima victory enters stage four and a prepared duo uses stage-four stats", () => {
  const campaign = fixture();
  campaign.status = "settlement";
  campaign.settlementNext = "victory";
  campaign.currentBattle = { type: "boss", enemies: ["makima"] };
  assert.equal(completeSettlement(campaign), "stage_transition");
  assert.equal(beginStageFour(campaign), "route");
  assert.equal(campaign.stageId, 4);
  campaign.status = "combat";
  campaign.currentBattle = stageFourBattle([getStageFourUnit("titan-duo"), getStageFourUnit("gold-silver-kings")], "elite", 1, 1);
  const battle = prepareBattle(campaign);
  assert.ok(battle);
  assert.equal(battle.roster.find((unit) => unit.id === "armored-titan").maxHp, 3000);
  assert.equal(battle.roster.find((unit) => unit.id === "gold-king").maxHp, 3700);
});

test("Prison Realm stays at 180 essence under VIP and recruits Gojo", () => {
  const campaign = fixture();
  campaign.status = "shop";
  campaign.activeNode = { id: "stage4-shop" };
  campaign.activeShop = { nodeId: "stage4-shop", slots: [{ index: 0, categoryId: "legendary", itemId: "prison_realm", available: true, purchased: false }], purchases: [] };
  campaign.essence = 200;
  campaign.shopDiscount = { type: "premium_vip_card", multiplier: .6, usedPurchases: 0, enteredShops: 0, countedShopIds: [], expired: false };
  refreshShopPrices(campaign);
  assert.equal(campaign.activeShop.slots[0].price, 180);
  assert.ok(buyShopItem(campaign, 0, campaign.playerId));
  assert.equal(campaign.essence, 20);
  assert.ok(campaign.partyIds.includes("gojo"));
  assert.equal(campaign.partyStates.gojo.maxHp, 3500);
  assert.equal(TREASURE_DATA.prison_realm.grade, "superlegendary");
});

test("Yoru victory recruits Gun Devil as a formal third member", () => {
  const campaign = fixture();
  campaign.status = "settlement";
  campaign.settlementNext = "hidden_boss_win";
  campaign.currentBattle = { id: "yoru-test", hiddenBoss: true };
  assert.equal(completeSettlement(campaign), "route");
  assert.equal(campaign.partyIds.length, 3);
  assert.deepEqual([campaign.partyStates["gun-devil-ally"].maxHp, campaign.partyStates["gun-devil-ally"].atk], [3300, 600]);
  assert.equal(recruitPartyMember(campaign, "gun-devil-ally", "again"), false);
  assert.equal(RECRUIT_CHARACTERS.length, 2);
});

test("three formal allies receive one stat point each and an elite duo gives two unit drops", () => {
  const campaign = fixture();
  campaign.status = "stage_transition";
  campaign.stageTransition = { phase: "stage3_interlude" };
  assert.equal(beginStageFour(campaign), "route");
  assert.ok(recruitPartyMember(campaign, "gun-devil-ally", "test"));
  assert.equal(recruitPartyMember(campaign, "gojo", "test"), false);
  const node = campaign.routeMap.nodes.find((entry) => entry.type === "elite");
  node.status = "in_progress";
  campaign.activeNode = node;
  campaign.currentBattle = stageFourBattle([getStageFourUnit("mahito"), getStageFourUnit("toji")], "elite", 1, 1);
  campaign.status = "combat";
  assert.ok(prepareBattle(campaign));
  assert.equal(finishBattle(campaign, "victory", campaign.runCharacterState.currentHp).status, "reward");
  const offer = campaign.stageTwoReward;
  assert.deepEqual(offer.recipientIds, campaign.partyIds);
  for (const id of campaign.partyIds) assert.ok(claimStageTwoStatReward(campaign, id, offer.choices[0]));
  assert.equal(campaign.rewardPhase, "elite_drop");
  const first = claimCampaignEliteDrop(campaign, campaign.playerId);
  assert.equal(first.effect.id, "sukuna_finger");
  assert.equal(first.remaining, 1);
  const second = claimCampaignEliteDrop(campaign, campaign.playerId);
  assert.equal(second.effect.id, "sukuna_finger");
  assert.equal(campaign.partyStates[campaign.playerId].permanentEffects.filter((item) => item.id === "sukuna_finger").length, 2);
  assert.equal(claimCampaignEliteDrop(campaign, campaign.playerId), false);
});

test("Gojo ignores only ordinary damage and domain executes under ten percent", () => {
  const normal = initializeBattle([
    { id: "foe", team: "enemy", row: "front", hp: 2000, atk: 100, def: 0, spd: 10, critChance: 0 },
    { id: "gojo", team: "ally", row: "back", hp: 1000, atk: 100, def: 0, spd: 200, passiveSkillId: "gojo-infinity", critChance: 0 },
  ]);
  assert.equal(executeAttack(normal, normal.characters[0], normal.characters[1], () => .99, { skill: null }).actualDamage, 0);
  assert.ok(executeAttack(normal, normal.characters[0], normal.characters[1], () => .99,
    { skill: { id: "test", name: "技能", effectType: "damage", multiplier: 1 } }).actualDamage > 0);
  const skill = { ...SKILL_DATA["gojo-hollow"], ...SKILL_DATA["gojo-hollow"].levels[4], level: 4, chance: 1 };
  const result = simulateBattle([
    { id: "gojo", team: "ally", row: "back", hp: 10000, atk: 400, def: 200, spd: 200,
      passiveSkillId: "gojo-infinity", skills: [skill], skill, unavoidableAttack: true, critChance: 0 },
    { id: "foe", team: "enemy", row: "front", hp: 5600, atk: 1, def: 0, spd: 1, critChance: 0 },
  ], () => .99);
  assert.equal(result.events.filter((event) => event.type === "gojo-domain").length, 1);
  assert.ok(result.events.some((event) => event.type === "gojo-domain-execute"));
});

test("Gojo expands his domain after the third skill at any level, after its attack animation", () => {
  const skill = { ...SKILL_DATA["gojo-hollow"], ...SKILL_DATA["gojo-hollow"].levels[1], level: 1, chance: 1 };
  const result = simulateBattle([
    { ...RECRUIT_CHARACTERS.find((unit) => unit.id === "gojo"), hp: 10000, atk: 200,
      skills: [skill], skill, critChance: 0 },
    { id: "foe", team: "enemy", row: "front", hp: 5000, atk: 1, def: 0, spd: 1, critChance: 0 },
  ], () => .99);
  const castIndexes = result.events.flatMap((event, index) =>
    event.type === "attack" && event.attackerId === "gojo" && event.skillId === "gojo-hollow" ? [index] : []);
  const domainIndexes = result.events.flatMap((event, index) => event.type === "gojo-domain" ? [index] : []);
  assert.ok(castIndexes.length >= 3);
  assert.equal(domainIndexes.length, 1);
  assert.ok(castIndexes[2] < domainIndexes[0]);
  assert.ok(domainIndexes[0] < castIndexes[3]);
  assert.equal(RECRUIT_CHARACTERS.find((unit) => unit.id === "gojo").row, "back");
});

test("Gojo's ordinary and active-skill kills before domain are not executions", () => {
  const gojo = RECRUIT_CHARACTERS.find((unit) => unit.id === "gojo");
  const skill = { ...SKILL_DATA["gojo-hollow"], ...SKILL_DATA["gojo-hollow"].levels[1], level: 1, chance: 1 };
  for (const skills of [[], [skill]]) {
    const result = simulateBattle([
      { ...gojo, hp: 1000, atk: 200, skills, skill: skills[0] ?? null, critChance: 0 },
      { id: "foe", team: "enemy", row: "front", hp: 50, atk: 1, def: 0, spd: 1, critChance: 0 },
    ], () => .99);
    const kill = result.events.find((event) => event.type === "attack" && event.attackerId === "gojo" && event.targetDied);
    assert.ok(kill);
    assert.equal(kill.skilled, skills.length > 0);
    assert.ok(!result.events.some((event) => event.type === "gojo-domain" || event.type === "gojo-domain-execute"));
  }
});

test("allied Gun Devil fires on his first turn and ordinary hits stack bleed instead of bullet holes", () => {
  const template = RECRUIT_CHARACTERS.find((unit) => unit.id === "gun-devil-ally");
  const skill = { ...SKILL_DATA["gun-devil-charged-shot"], ...SKILL_DATA["gun-devil-charged-shot"].levels[1], level: 1 };
  const result = simulateBattle([
    { ...template, hp: 10000, atk: 100, skills: [skill], skill, critChance: 0 },
    { id: "foe", team: "enemy", row: "front", hp: 10000, atk: 1, def: 0, spd: 1, critChance: 0 },
  ], () => .99);
  const attacks = result.events.filter((event) => event.type === "attack" && event.attackerId === template.id);
  assert.deepEqual(attacks.slice(0, 3).map((event) => [event.round, event.skillId]),
    [[1, "gun-devil-charged-shot"], [2, null], [3, "gun-devil-charged-shot"]]);
  assert.equal(attacks[1].bleedStacksApplied, 1);
  assert.equal(attacks[1].gunDevilBleedStacks, 1);
  assert.equal(attacks[1].bulletHoleStacks, null);
  assert.equal(template.passiveSkillId, "gun-devil-ally-bleed");
  const bossState = initializeBattle([
    { ...GUN_DEVIL, hp: 10000 },
    { id: "hero", team: "ally", row: "front", hp: 10000, atk: 1, def: 0, spd: 1, critChance: 0 },
  ]);
  const bossHit = executeAttack(bossState, bossState.characters[0], bossState.characters[1], () => .99);
  assert.equal(bossHit.bulletHoleStacks, 1);
  assert.equal(bossHit.bleedStacksApplied, 0);
});

test("Darkness Devil uses five full rounds per phase and vanishing replaces its attack", () => {
  const skill = { ...SKILL_DATA["darkness-sever"], ...SKILL_DATA["darkness-sever"].levels[1], level: 1 };
  assert.equal(STAGE_FOUR_BOSS.attackType, "ranged");
  assert.equal(skill.attackType, "ranged");
  const result = simulateBattle([
    { id: "hero", team: "ally", row: "front", hp: 50000, atk: 12000, def: 1000, spd: 10,
      critChance: 0, unavoidableAttack: true },
    { ...STAGE_FOUR_BOSS, skills: [skill], skill, critChance: 0 },
  ], () => .99);
  const phase = result.events.filter((event) => event.type === "darkness-phase");
  assert.deepEqual(phase.slice(0, 1).map((event) => [event.round, event.active, event.atk]),
    [[5, true, 2497]]);
  assert.ok(result.events.some((event) => event.type === "darkness-vanish" && event.round === 5));
  assert.ok(!result.events.some((event) => event.type === "attack" && event.attackerId === STAGE_FOUR_BOSS.id));
  const skillResult = simulateBattle([
    { id: "hero", team: "ally", row: "front", hp: 50000, atk: 50000, def: 1000, spd: 10, critChance: 0,
      unavoidableAttack: true },
    { ...STAGE_FOUR_BOSS, skills: [skill], skill, critChance: 0 },
  ], () => 0);
  const attacks = skillResult.events.filter((event) => event.type === "attack" && event.attackerId === STAGE_FOUR_BOSS.id);
  assert.ok(attacks.length > 0);
  assert.ok(attacks.every((event) => event.skillId === "darkness-sever" && event.attackType === "ranged"));
  assert.ok(!skillResult.events.some((event) => event.type === "darkness-vanish"));
});
