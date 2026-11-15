import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { beginArimaCampfireChallenge, canChallengeArimaAtCampfire, chooseRoute, claimCampaignQuinque,
  completeLocation, createCampaign, finishBattle, prepareBattle, resolveCampaignEvent,
  selectStartingCharacter, startCampaign } from "./campaign.js";
import { STARTING_CHARACTERS } from "./characters.js";
import { getAvailableAdventureEventIds } from "./progression.js";
import { GIANT_SPINAL_FLUID, GUN_DEVIL_FRAGMENT, TREASURE_DATA } from "./skills.js";

test("Arima remains an optional campfire challenge until victory", () => {
  const campaign = createCampaign(() => 0, { seed: 42 });
  startCampaign(campaign);
  const hero = STARTING_CHARACTERS.find((entry) => entry.id === "naruto");
  campaign.candidateIds = [hero.id];
  selectStartingCharacter(campaign, hero.id, hero.activeSkills[0]);
  campaign.stageId = 2;
  campaign.stageStep = 1;
  campaign.status = "route";
  campaign.runCharacterState.eventSeries.anteiku = {
    chapter1Completed: true, chapter2Unlocked: true, chapter2Completed: true, chapter2Triggered: true,
  };
  assert.equal(getAvailableAdventureEventIds(campaign.runCharacterState, 5, [campaign.runCharacterState], 3).includes("anteiku_3"), false);
  const campfires = campaign.routeMap.nodes.filter((entry) => entry.type === "campfire");
  for (const campfire of campfires.slice(0, 2)) {
    const parent = campaign.routeMap.nodes.find((entry) => entry.nextNodeIds.includes(campfire.id));
    campaign.routeMap.currentNodeId = parent.id;
    campfire.status = "pending";
    const encounter = chooseRoute(campaign, campfire.id);
    assert.equal(encounter.type, "event");
    assert.equal(campaign.activeEventType, "campfire");
    assert.equal(canChallengeArimaAtCampfire(campaign), true);
    if (campfire === campfires[0]) {
      assert.ok(resolveCampaignEvent(campaign, "rest"));
      assert.equal(completeLocation(campaign), "route");
      assert.equal(campaign.runCharacterState.eventSeries.anteiku.chapter3Completed, undefined);
    }
  }
  const encounter = beginArimaCampfireChallenge(campaign);
  assert.equal(encounter.type, "battle");
  assert.deepEqual(encounter.battle.enemies, ["arima"]);
  assert.equal(campaign.runCharacterState.eventResults[campfires[1].id].status, "in_battle");
  assert.equal(campaign.runCharacterState.eventSeries.anteiku.chapter3Completed, undefined);
  assert.equal(beginArimaCampfireChallenge(campaign), false);
  assert.ok(prepareBattle(campaign));
  assert.equal(finishBattle(campaign, "victory", campaign.playerHp).status, "reward");
  assert.equal(campaign.rewardPhase, "quinque");
  assert.equal(campaign.runCharacterState.eventSeries.anteiku.chapter3Completed, true);
  const reward = claimCampaignQuinque(campaign, campaign.playerId, "quinque_guard");
  assert.equal(reward.id, "quinque_guard");
  assert.equal(reward.image, TREASURE_DATA.quinque_guard.image);
  assert.equal(claimCampaignQuinque(campaign, campaign.playerId, "quinque_crit"), false);
});

test("every configured treasure image resolves by its ID", () => {
  const treasures = [...Object.values(TREASURE_DATA), GIANT_SPINAL_FLUID, GUN_DEVIL_FRAGMENT];
  const missing = treasures.filter((item) => !item.image || !existsSync(new URL(item.image, import.meta.url)));
  assert.deepEqual(missing.map((item) => item.id), []);
});
