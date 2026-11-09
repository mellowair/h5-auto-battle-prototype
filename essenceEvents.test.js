import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { STARTING_CHARACTERS } from "./characters.js";
import { createCampaign, resolveCampaignEvent, selectStartingCharacter, startCampaign } from "./campaign.js";
import { createAdventureEventResult, getAvailableAdventureEventIds, resolveAdventureEvent } from "./progression.js";
import { ADVENTURE_EVENT_DATA } from "./skills.js";

function eventFixture(eventId, stageId = 1) {
  const campaign = createCampaign(() => .5, { seed: 8 });
  startCampaign(campaign);
  campaign.candidateIds = ["naruto"];
  selectStartingCharacter(campaign, "naruto", STARTING_CHARACTERS.find((entry) => entry.id === "naruto").activeSkills[0]);
  campaign.stageId = stageId;
  campaign.activeNode = { id: `event:${stageId}:${eventId}`, type: "question", status: "in_progress" };
  campaign.pendingEvent = createAdventureEventResult(campaign.runCharacterState, campaign.activeNode.id, eventId,
    () => .5, [campaign.runCharacterState], stageId);
  campaign.status = "event";
  campaign.activeEventType = "adventure";
  return campaign;
}

test("both currency events are available in all stages, use real images, and disappear after one appearance", () => {
  for (const eventId of ["found_money", "devil_bargain"]) {
    const image = ADVENTURE_EVENT_DATA[eventId].image;
    assert.ok(existsSync(new URL(`./${image}`, import.meta.url)));
    assert.equal(readFileSync(new URL(`./${image}`, import.meta.url)).toString("ascii", 1, 4), "PNG");
    for (const stageId of [1, 2, 3]) {
      const campaign = eventFixture(eventId, stageId);
      assert.ok(getAvailableAdventureEventIds(campaign.runCharacterState, 1, [campaign.runCharacterState], stageId)
        .every((id) => id !== eventId), "an already drawn once-per-run event is removed");
      assert.equal(createAdventureEventResult(campaign.runCharacterState, "another-node", eventId,
        () => .5, [campaign.runCharacterState], stageId), null);
    }
  }
});

test("found money grants five essence once, or leaves without a reward", () => {
  const take = eventFixture("found_money");
  assert.equal(resolveCampaignEvent(take, "wrong-choice"), false);
  assert.equal(resolveCampaignEvent(take, "money_take").result.essenceGain, 5);
  assert.equal(take.essence, 5);
  assert.equal(resolveCampaignEvent(take, "money_take"), false);
  assert.equal(take.essenceHistory.length, 1);
  const leave = eventFixture("found_money");
  assert.equal(resolveCampaignEvent(leave, "money_leave").result.essenceGain, 0);
  assert.equal(leave.essence, 0);
});

test("devil bargain deducts current HP by half max HP, keeps maximum unchanged and at least one HP", () => {
  const trade = eventFixture("devil_bargain", 3);
  trade.runCharacterState.currentHp = 1000;
  const result = resolveCampaignEvent(trade, "devil_trade");
  assert.deepEqual([result.result.hpLoss, trade.runCharacterState.currentHp, trade.runCharacterState.maxHp,
    trade.essence], [800, 200, 1600, 5]);
  assert.equal(resolveCampaignEvent(trade, "devil_trade"), false);
  const low = eventFixture("devil_bargain");
  low.runCharacterState.currentHp = 200;
  assert.equal(resolveCampaignEvent(low, "devil_trade").result.hpLoss, 199);
  assert.equal(low.runCharacterState.currentHp, 1);
  const leave = eventFixture("devil_bargain");
  assert.equal(resolveCampaignEvent(leave, "devil_leave").result.essenceGain, 1);
  assert.equal(leave.runCharacterState.currentHp, 1600);
  assert.equal(leave.essence, 1);
});

test("event UI hides found money outcome and previews both devil bargain consequences", () => {
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(app, /money_take", "天上掉馅饼", ""/);
  assert.match(app, /money_leave", "不是我的不能拿", ""/);
  assert.match(app, /record\.eventId !== "devil_bargain"\) for \(const choice of choices\) choice\.description = ""/);
  assert.match(app, /devil_trade"[^\n]*50%/);
  assert.match(app, /devil_leave"[^\n]*1 点精华/);
});
