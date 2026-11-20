import test from "node:test";
import assert from "node:assert/strict";
import { executeAttack, initializeBattle, simulateBattle } from "./battle.js";
import { beginArimaCampfireChallenge, beginGuyCampfireChallenge, canChallengeArimaAtCampfire,
  createCampaign, finishBattle, ownedTreasureCount, prepareBattle } from "./campaign.js";
import { STARTING_CHARACTERS } from "./characters.js";
import { createRunCharacterState } from "./progression.js";
import { generateShopInventory } from "./shop.js";
import { SHOP_RULES } from "./shopConfig.js";
import { recruitPartyMember } from "./partyRecruitment.js";

function party() {
  const campaign = createCampaign(() => .5);
  const [hero, partner] = STARTING_CHARACTERS;
  campaign.playerId = hero.id;
  campaign.partyIds = [hero.id, partner.id];
  campaign.partyStates = Object.fromEntries([hero, partner].map((unit) => [unit.id, createRunCharacterState(unit)]));
  campaign.runCharacterState = campaign.partyStates[hero.id];
  campaign.stageId = 3;
  return campaign;
}

test("Hakari book is locked until victory and uses a separate battle-opening roll", () => {
  assert.equal(SHOP_RULES.books.find((book) => book.id === "hakari_book")?.price, 100);
  for (let seed = 0; seed < 100; seed += 1)
    assert.ok(!generateShopInventory(`locked-${seed}`, 3).some((slot) => slot.itemId === "hakari_book"));
  assert.ok(Array.from({ length: 200 }, (_, seed) => generateShopInventory(`unlocked-${seed}`, 3,
    { hakariBookUnlocked: true })).some((slots) => slots.some((slot) => slot.itemId === "hakari_book")));
  for (let roll = 1; roll <= 6; roll += 1) {
    let first = true;
    const result = simulateBattle([
      { id: "hero", team: "ally", row: "front", hp: 1000, atk: 1000, def: 0, spd: 100,
        critChance: 0, extraPassiveSkillIds: ["hakari-book"] },
      { id: "foe", team: "enemy", row: "front", hp: 1, atk: 0, def: 0, spd: 1, critChance: 0 },
    ], () => { if (first) { first = false; return (roll - .5) / 6; } return .99; });
    assert.equal(result.events.filter((event) => event.type === "hakari-book-roll").length, 1);
    const buff = result.events.find((event) => event.type === "hakari-book-roll");
    assert.equal(buff.roll, roll);
    assert.equal(buff.atk, [1050, 1050, 1050, 1050, 1100, 1200][roll - 1]);
    assert.equal(buff.damageReduction, [0, 0, .05, .05, .05, .1][roll - 1]);
    assert.equal(buff.healRatio, [0, 0, 0, .01, .02, .03][roll - 1]);
    assert.equal(buff.lifesteal, [0, 0, 0, 0, .1, .15][roll - 1]);
    assert.equal(result.outcome, "victory");
  }
});

test("Hakari book six-point victory grants ten essence once", () => {
  const campaign = party();
  campaign.status = "combat";
  campaign.currentBattle = { id: "book-test", type: "normal", enemies: ["slime"] };
  campaign.devBattleOnly = true;
  campaign.combatLaunched = true;
  const before = campaign.essence;
  const finalCharacters = campaign.partyIds.map((id) => ({ id, team: "ally", originalTeam: "ally",
    currentHp: campaign.partyStates[id].currentHp }));
  const result = finishBattle(campaign, "victory", campaign.runCharacterState.currentHp,
    [{ type: "hakari-book-roll", roll: 6, targetId: campaign.playerId }], finalCharacters);
  assert.equal(result.status, "settlement");
  assert.equal(campaign.essence, before + 12);
  assert.equal(campaign.lastHakariBookEssence, 10);
});

test("campfire Guy challenge temporarily enters at full HP and restores pre-challenge HP on victory", () => {
  const campaign = party();
  const campfire = campaign.routeMap.nodes.find((node) => node.type === "campfire");
  campfire.status = "in_progress";
  campaign.activeNode = campfire;
  campaign.activeEventType = "campfire";
  campaign.status = "event";
  campaign.guyChallenge = { unlocked: true, attempted: false };
  const before = campaign.partyIds.map((id, index) => {
    const member = campaign.partyStates[id];
    member.currentHp = index ? 300 : 120;
    return member.currentHp;
  });
  assert.ok(beginGuyCampfireChallenge(campaign));
  const prepared = prepareBattle(campaign);
  assert.deepEqual(prepared.roster.filter((unit) => unit.team === "ally")
    .map((unit) => unit.currentHp), prepared.roster.filter((unit) => unit.team === "ally").map((unit) => unit.maxHp));
  const finals = prepared.roster.filter((unit) => unit.team === "ally")
    .map((unit) => ({ ...unit, currentHp: 5 }));
  assert.equal(finishBattle(campaign, "victory", 5, [], finals).status, "settlement");
  assert.deepEqual(campaign.partyIds.map((id) => campaign.partyStates[id].currentHp), before);
});

test("eight owned treasures unlock Arima without Anteiku chapter two", () => {
  const campaign = party();
  campaign.partyStates[campaign.playerId].permanentEffects.push(...Array.from({ length: 8 }, (_, index) =>
    ({ id: "magic_conch", sourceId: `test-${index}` })));
  assert.equal(ownedTreasureCount(campaign), 8);
  const campfire = campaign.routeMap.nodes.find((node) => node.type === "campfire");
  campfire.status = "in_progress";
  campaign.activeNode = campfire;
  campaign.activeEventType = "campfire";
  campaign.status = "event";
  assert.equal(canChallengeArimaAtCampfire(campaign), true);
  assert.ok(beginArimaCampfireChallenge(campaign));
  assert.equal(campaign.currentBattle.hiddenArima, true);
});

test("new Gojo and Gun Devil recruits start their active skills at level one", () => {
  for (const characterId of ["gojo", "gun-devil-ally"]) {
    const campaign = party();
    const state = recruitPartyMember(campaign, characterId, "test-recruitment");
    assert.ok(state);
    for (const skillId of state.learnedActiveSkills) assert.equal(state.skillLevels[skillId], 1);
  }
});

test("three teachers ignores summon attacks but accepts another formal ally", () => {
  const unit = (id, team, extras = {}) => ({ id, team, row: "front", hp: 1000, atk: 100, def: 0,
    spd: 10, critChance: 0, ...extras });
  const state = initializeBattle([
    unit("teacher", "ally", { extraPassiveSkillIds: ["three-teachers"] }),
    unit("partner", "ally"),
    unit("summon", "ally", { summonerId: "teacher" }),
    unit("foe", "enemy", { hp: 10000 }),
  ]);
  state.round = 1;
  executeAttack(state, state.characters[2], state.characters[3], () => .99);
  assert.equal(state.characters[0].teacherAttackGained ?? 0, 0);
  executeAttack(state, state.characters[1], state.characters[3], () => .99);
  assert.equal(state.characters[0].teacherAttackGained, 5);
});
