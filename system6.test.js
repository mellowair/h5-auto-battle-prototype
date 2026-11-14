import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { chooseRoute, claimCampaignQuinque, createCampaign, finishBattle, prepareBattle, selectStartingCharacter, startCampaign } from "./campaign.js";
import { STARTING_CHARACTERS } from "./characters.js";
import { getAvailableAdventureEventIds } from "./progression.js";
import { GIANT_SPINAL_FLUID, GUN_DEVIL_FRAGMENT, TREASURE_DATA } from "./skills.js";

test("the first campfire after Anteiku 2 immediately starts Arima once", () => {
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
  const campfire = campaign.routeMap.nodes.find((entry) => entry.type === "campfire");
  const parent = campaign.routeMap.nodes.find((entry) => entry.nextNodeIds.includes(campfire.id));
  campaign.routeMap.currentNodeId = parent.id;
  campfire.status = "pending";
  const encounter = chooseRoute(campaign, campfire.id);
  assert.equal(encounter.type, "battle");
  assert.deepEqual(encounter.battle.enemies, ["arima"]);
  assert.equal(campaign.runCharacterState.eventResults[campfire.id].status, "in_battle");
  assert.equal(campaign.runCharacterState.eventSeries.anteiku.arimaCampfireConsumed, true);
  assert.equal(chooseRoute(campaign, campfire.id), null);
  assert.ok(prepareBattle(campaign));
  assert.equal(finishBattle(campaign, "victory", campaign.playerHp).status, "reward");
  assert.equal(campaign.rewardPhase, "quinque");
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
