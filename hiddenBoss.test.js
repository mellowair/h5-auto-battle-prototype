import assert from "node:assert/strict";
import { test } from "node:test";
import { simulateBattle } from "./battle.js";
import { beginHiddenBossChallenge, completeSettlement, createCampaign, deferHiddenBossChallenge,
  finishBattle, prepareBattle, queueHiddenBossIntro, resumeHiddenBossAtCampfire } from "./campaign.js";
import { STARTING_CHARACTERS } from "./characters.js";
import { fragmentCount, GUN_DEVIL, HIDDEN_BOSS_RULES, YORU } from "./hiddenBoss.js";
import { createRunCharacterState } from "./progression.js";

function campaignAtMakima() {
  const campaign = createCampaign(() => .5);
  const [hero, partner] = STARTING_CHARACTERS;
  const main = createRunCharacterState(hero, null);
  const teammate = createRunCharacterState(partner, null);
  campaign.playerId = hero.id;
  campaign.partyIds = [hero.id, partner.id];
  campaign.runCharacterState = main;
  campaign.partyStates = { [hero.id]: main, [partner.id]: teammate };
  campaign.stageId = 3;
  campaign.status = "settlement";
  campaign.settlementNext = "victory";
  campaign.currentBattle = { id: "makima-test", type: "boss", enemies: ["makima"] };
  return campaign;
}

test("Makima completion grants only missing fragments and opens the one-choice story", () => {
  const campaign = campaignAtMakima();
  campaign.partyStates[campaign.partyIds[1]].permanentEffects.push(
    { id: "gun_devil_fragment" }, { id: "gun_devil_fragment" });
  assert.equal(completeSettlement(campaign), "hidden_boss_intro");
  assert.equal(fragmentCount(campaign), HIDDEN_BOSS_RULES.fragmentGoal);
  assert.equal(campaign.runCharacterState.permanentEffects.filter((item) => item.id === "gun_devil_fragment").length, 3);
  assert.equal(completeSettlement(campaign), null);
  assert.equal(fragmentCount(campaign), HIDDEN_BOSS_RULES.fragmentGoal);
  assert.equal(campaign.hiddenBoss.storyShown, true);
});

test("five recorded fragments unlock the story once", () => {
  const campaign = campaignAtMakima();
  campaign.status = "route";
  campaign.runCharacterState.permanentEffects.push(...Array.from({ length: 5 }, () => ({ id: "gun_devil_fragment" })));
  assert.equal(queueHiddenBossIntro(campaign), true);
  assert.equal(campaign.status, "hidden_boss_intro");
  campaign.status = "route";
  assert.equal(queueHiddenBossIntro(campaign), false);
});

test("later chapters may defer a challenge to a campfire without repeating its story", () => {
  const campaign = campaignAtMakima();
  campaign.stageId = 4;
  campaign.status = "route";
  campaign.runCharacterState.permanentEffects.push(...Array.from({ length: 5 }, () => ({ id: "gun_devil_fragment" })));
  assert.equal(queueHiddenBossIntro(campaign), true);
  assert.equal(deferHiddenBossChallenge(campaign), true);
  assert.equal(queueHiddenBossIntro(campaign), false);
  campaign.status = "event";
  campaign.activeEventType = "campfire";
  campaign.activeNode = { id: "future-campfire", type: "campfire" };
  assert.equal(resumeHiddenBossAtCampfire(campaign), true);
  assert.equal(campaign.status, "hidden_boss_intro");
  assert.equal(campaign.history.at(-1).resolution, "hidden-boss");
  assert.equal(resumeHiddenBossAtCampfire(campaign), false);
});

test("one continuous battle carries bullet holes into Yoru and absorbs partner stats once", () => {
  const campaign = campaignAtMakima();
  assert.equal(completeSettlement(campaign), "hidden_boss_intro");
  campaign.runCharacterState.maxHp = 100000;
  campaign.runCharacterState.currentHp = 95000;
  campaign.runCharacterState.atk = 900;
  campaign.runCharacterState.def = 180;
  campaign.partyStates[campaign.partyIds[1]].maxHp = 4000;
  campaign.partyStates[campaign.partyIds[1]].currentHp = 3200;
  campaign.partyStates[campaign.partyIds[1]].atk = 400;
  campaign.partyStates[campaign.partyIds[1]].def = 100;
  campaign.partyStates[campaign.partyIds[1]].spd = 160;
  assert.equal(beginHiddenBossChallenge(campaign), true);
  const prepared = prepareBattle(campaign);
  const gun = prepared.roster.find((unit) => unit.id === GUN_DEVIL.id);
  assert.deepEqual([gun.hp, gun.atk, gun.def, gun.spd], [3500, 800, 120, 300]);
  assert.equal(prepared.roster.find((unit) => unit.id === campaign.playerId).currentHp, 100000);
  const result = simulateBattle(prepared.roster, () => .5, prepared.combatOptions);
  const phases = result.events.filter((event) => event.type === "hidden-boss-phase");
  assert.equal(phases.length, 1);
  assert.equal(phases[0].partnerId, campaign.partyIds[1]);
  assert.deepEqual(phases[0].absorbed, { maxHp: 2000, atk: 200, def: 50, spd: 80 });
  assert.deepEqual([phases[0].yoru.maxHp, phases[0].yoru.atk, phases[0].yoru.def, phases[0].yoru.spd],
    [YORU.hp + 2000, YORU.atk + 200, YORU.def + 50, YORU.spd + 80]);
  assert.ok(result.events.findIndex((event) => event.type === "hidden-boss-phase") >
    result.events.findIndex((event) => event.type === "attack" && event.targetId === GUN_DEVIL.id && event.targetDied));
  assert.ok(result.events.some((event) => event.bulletHoleStacks > 0));
  const gunSkills = result.events.filter((event) => event.attackerId === GUN_DEVIL.id && event.skillId === "gun-devil-charged-shot");
  assert.ok(gunSkills.length > 0);
  assert.ok(gunSkills.every((event) => event.round % 2 === 0));
  const yoruAttacks = result.events.filter((event) => event.type === "attack" && event.attackerId === YORU.id);
  assert.ok(yoruAttacks.length > 0);
  assert.equal(yoruAttacks[0].round, phases[0].round + 1);
  assert.equal(yoruAttacks[0].skilled, false);
  assert.equal(yoruAttacks[1].skilled, true);
  assert.ok(result.events.some((event) => event.type === "hidden-boss-counter"));
  assert.equal(result.events.filter((event) => event.type === "battle-end").length, 1);
  assert.equal(result.outcome, "victory");
  const partnerHp = campaign.partyStates[campaign.partyIds[1]].currentHp;
  const player = result.finalCharacters.find((unit) => unit.id === campaign.playerId);
  assert.equal(finishBattle(campaign, result.outcome, player.currentHp, result.events, result.finalCharacters).status, "settlement");
  assert.equal(campaign.partyStates[campaign.partyIds[1]].currentHp, partnerHp);
  assert.equal(campaign.lastEssenceReward.amount, 20);
  assert.equal(campaign.essenceHistory.filter((entry) => entry.reason === "hidden_boss").length, 1);
  assert.equal(completeSettlement(campaign), "victory");
  assert.equal(completeSettlement(campaign), null);
});
