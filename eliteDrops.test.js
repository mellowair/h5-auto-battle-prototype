import test from "node:test";
import assert from "node:assert/strict";
import { STARTING_CHARACTERS } from "./characters.js";
import { advanceStageTransition, beginJourney, beginStageTwo, claimCampaignEliteDrop, claimCampaignReward,
  claimStageTwoStatReward, completeSettlement, createCampaign, finishBattle, getCampaignRewardOffer,
  getStageTransitionChoices, prepareBattle, selectStartingCharacter, startCampaign, startStageTwoDirectBattle } from "./campaign.js";

function startHero(seed = 91) {
  const campaign = createCampaign(() => .21, { seed });
  startCampaign(campaign);
  campaign.candidateIds = ["naruto", "eren"];
  selectStartingCharacter(campaign, "naruto", STARTING_CHARACTERS.find((entry) => entry.id === "naruto").activeSkills[0]);
  beginJourney(campaign);
  return campaign;
}

test("Mahito elite keeps stat reward, then grants Sukuna finger once without a skill upgrade", () => {
  const campaign = startHero();
  campaign.activeNode = { id: "test:mahito", type: "elite", status: "in_progress" };
  campaign.currentBattle = { id: "test:mahito", type: "elite", step: 3, enemies: ["mahito"] };
  campaign.status = "combat";
  assert.ok(prepareBattle(campaign));
  assert.equal(finishBattle(campaign, "victory", 1200).next, "reward");
  const offer = getCampaignRewardOffer(campaign);
  const stat = claimCampaignReward(campaign, offer.statChoices.slice(0, 2));
  assert.equal(stat.phase, "elite_drop");
  const before = { atk: campaign.runCharacterState.atk, maxHp: campaign.runCharacterState.maxHp,
    hp: campaign.runCharacterState.currentHp, skills: campaign.runCharacterState.learnedActiveSkills.length };
  assert.equal(claimCampaignEliteDrop(campaign, "eren"), false);
  assert.ok(claimCampaignEliteDrop(campaign, "naruto"));
  assert.equal(campaign.runCharacterState.atk, before.atk + 30);
  assert.equal(campaign.runCharacterState.maxHp, before.maxHp - 150);
  assert.equal(campaign.runCharacterState.currentHp, Math.min(before.hp, before.maxHp - 150));
  assert.equal(campaign.runCharacterState.learnedActiveSkills.length, before.skills);
  assert.equal(campaign.status, "route");
  assert.equal(claimCampaignEliteDrop(campaign, "naruto"), false);
});

function stageTwoRun() {
  const campaign = startHero(92);
  campaign.step = 11;
  campaign.status = "settlement";
  campaign.settlementNext = "victory";
  campaign.activeNode = campaign.routeMap.nodes.find((node) => node.type === "demon");
  assert.equal(completeSettlement(campaign), "stage_transition");
  while (campaign.stageTransition.phase !== "interlude") {
    const offer = getStageTransitionChoices(campaign);
    const choice = offer.skillIds?.[0] ?? offer.offer?.choices?.[0] ?? offer.candidateIds?.[0] ?? null;
    assert.ok(advanceStageTransition(campaign, choice));
  }
  assert.equal(beginStageTwo(campaign), "route");
  return campaign;
}

test("titan duo grants one spinal fluid to chosen party member after both stat rewards", () => {
  const campaign = stageTwoRun();
  assert.ok(startStageTwoDirectBattle(campaign, "titan-duo", 4));
  // Exercise the route reward pipeline; local direct battles normally stop at settlement.
  campaign.devBattleOnly = false;
  assert.ok(prepareBattle(campaign));
  assert.equal(finishBattle(campaign, "victory", campaign.playerHp).next, "reward");
  const offer = getCampaignRewardOffer(campaign);
  const [heroId, partnerId] = campaign.partyIds;
  assert.equal(claimStageTwoStatReward(campaign, heroId, offer.choices[0]).phase, "stat");
  assert.equal(claimStageTwoStatReward(campaign, partnerId, offer.choices[1]).phase, "elite_drop");
  const hero = campaign.partyStates[heroId], partner = campaign.partyStates[partnerId];
  const heroBefore = [hero.maxHp, hero.atk, hero.def];
  const partnerBefore = [partner.maxHp, partner.atk, partner.def, partner.currentHp];
  assert.ok(claimCampaignEliteDrop(campaign, partnerId));
  assert.deepEqual([hero.maxHp, hero.atk, hero.def], heroBefore);
  assert.deepEqual([partner.maxHp, partner.atk, partner.def, partner.currentHp],
    [partnerBefore[0] + 100, partnerBefore[1], partnerBefore[2] + 20, partnerBefore[3]]);
  assert.equal(partner.permanentEffects.filter((effect) => effect.id === "giant_spinal_fluid").length, 1);
  assert.equal(claimCampaignEliteDrop(campaign, partnerId), false);
  assert.equal(campaign.status, "route");
});
