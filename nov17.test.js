import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { executeAttack, getActionOrder, initializeBattle, simulateBattle } from "./battle.js";
import { advanceStageTransition, beginGuyCampfireChallenge, beginJourney, beginStageTwo,
  canChallengeGuyAtCampfire, chooseRoute, claimCampaignEliteDrop, claimEightGatesReward,
  claimMakimaPassiveReward, claimMakimaSkillReward, claimMakimaStatReward,
  claimMakimaTreasureReward, claimStageTwoStatReward, completeSettlement, createCampaign,
  finishBattle, finishGuyIntro, getCampaignRewardOffer, getMakimaRewardOffer,
  getStageTransitionChoices, prepareBattle, selectStartingCharacter, startCampaign } from "./campaign.js";
import { ELITE_ENEMY_DATA, STARTING_CHARACTERS } from "./characters.js";
import { createRunCharacterState } from "./progression.js";
import { SHOP_RULES } from "./shopConfig.js";
import { SKILL_DATA, TREASURE_DATA } from "./skills.js";

const unit = (id, team, extra = {}) => ({ id, name: id, team, row: "front", position: "front",
  hp: 10000, maxHp: 10000, currentHp: 10000, atk: 100, def: 100, spd: 100,
  rosterOrder: team === "ally" ? 0 : 1, skills: [], ...extra });

test("Might Guy uses his stage-two panel and actual supplied frames", () => {
  const guy = ELITE_ENEMY_DATA.find((entry) => entry.id === "might-guy");
  assert.deepEqual([guy.hp, guy.atk, guy.def, guy.spd], [3500, 320, 140, 300]);
  assert.ok(existsSync(guy.asset));
  assert.ok(existsSync(guy.animations.meleeAttack.frames.attack));
  assert.ok(existsSync(guy.animations.speedBoost.frames.cast));
  assert.ok(existsSync("assets/stage2-enemies/might-guy/night-entrance.png"));
  assert.ok(existsSync(guy.animations.nightIdle.frames.idle));
  assert.ok(existsSync(guy.animations.nightPassive.frames.cast));
  assert.ok(existsSync(guy.animations.nightReady.frames.ready));
  for (const frame of Object.values(guy.animations.nightStrike.frames)) assert.ok(existsSync(frame));
});

test("Night Guy flashes through three authored strikes in one round at triple SPD", () => {
  const hero = unit("hero", "ally", { hp: 20000, maxHp: 20000, currentHp: 20000,
    atk: 10, def: 100, spd: 100 });
  const guy = unit("might-guy", "enemy", { hp: 3000, maxHp: 3000, currentHp: 3000,
    atk: 280, def: 130, spd: 200, nightGuyActive: true });
  const result = simulateBattle([hero, guy], () => .99);
  const firstRound = result.events.filter((event) => event.type === "attack" && event.attackerId === "might-guy" && event.round === 1);
  assert.equal(firstRound.length, 3);
  assert.deepEqual(firstRound.map((event) => event.nightGuyStrikeIndex), [1, 2, 3]);
  assert.ok(firstRound.every((event) => event.nightGuyStrikeCount === 3));
  const slightlyFasterHero = unit("hero", "ally", { hp: 20000, maxHp: 20000, currentHp: 20000,
    atk: 10, def: 100, spd: 101 });
  const slowerResult = simulateBattle([slightlyFasterHero, guy], () => .99);
  assert.equal(slowerResult.events.filter((event) => event.type === "attack" && event.attackerId === "might-guy" && event.round === 1).length, 1);
});

test("Night Guy transforms once below 30 percent, pays one percent per attack and applies burn", () => {
  const hero = unit("hero", "ally", { hp: 12000, maxHp: 12000, currentHp: 12000, atk: 4000, spd: 1000 });
  const guy = unit("might-guy", "enemy", { hp: 3500, maxHp: 3500, currentHp: 3500,
    atk: 320, def: 140, spd: 300, nightGuyEligible: true });
  const result = simulateBattle([hero, guy], () => .99);
  const transformations = result.events.filter((event) => event.type === "night-guy-transform");
  assert.equal(transformations.length, 1);
  assert.equal(transformations[0].maxHp, 4000);
  assert.equal(transformations[0].currentHp, 4000);
  const costs = result.events.filter((event) => event.type === "night-guy-cost");
  assert.ok(costs.length > 0);
  assert.ok(costs.every((event) => event.amount === 40));
  assert.ok(result.events.some((event) => event.attackerId === "might-guy" && event.burnStacksApplied > 0 && event.nightGuyBurnStacks > 0));
  assert.ok(result.events.some((event) => event.type === "trial-dot" && event.name === "灼烧" && event.damage > 0));
});

test("Eight Gates grants a second complete action after its round-four speed check", () => {
  const hero = unit("hero", "ally", { hp: 4000, maxHp: 4000, currentHp: 4000,
    atk: 50, spd: 200, extraPassiveSkillIds: ["eight-gates"] });
  const enemy = unit("enemy", "enemy", { hp: 2000, maxHp: 2000, currentHp: 2000,
    atk: 30, spd: 60 });
  const result = simulateBattle([hero, enemy], () => .99);
  assert.deepEqual(result.events.filter((event) => event.type === "eight-gates-speed").map((event) => event.spd), [230, 260, 290]);
  assert.equal(result.events.find((event) => event.type === "eight-gates-check")?.extraAction, true);
  assert.equal(result.events.filter((event) => event.type === "attack" && event.attackerId === "hero" && event.round === 4).length, 2);
  const state = initializeBattle([hero, enemy]);
  state.characters[0].eightGatesExtraAction = true;
  assert.equal(getActionOrder(state).filter((entry) => entry.id === "hero").length, 2);
});

test("Makima is immune before all four minion deaths, including true-damage style calls", () => {
  const hero = unit("hero", "ally", { atk: 2000, spd: 1000 });
  const makima = unit("makima", "enemy", { hp: 3700, maxHp: 3700, currentHp: 3700, def: 160 });
  const state = initializeBattle([hero, makima]);
  const first = executeAttack(state, state.characters[0], state.characters[1], () => .99);
  assert.equal(first.actualDamage, 0);
  state.makima.deadMinions = ["makima-bomb", "flamethrower-devil", "katana-devil", "quanxi"];
  const next = executeAttack(state, state.characters[0], state.characters[1], () => .99);
  assert.ok(next.actualDamage > 0);
});

test("Naruto's over-ten-clone reduction applies once and switches off at ten", () => {
  const makeHit = (clones) => {
    const state = initializeBattle([
      unit("attacker", "enemy", { atk: 1000, def: 0 }),
      unit("naruto", "ally", { def: 0 }),
    ]);
    state.characters.find((member) => member.id === "naruto").chakraClones = clones;
    state.random = () => .99;
    const attack = executeAttack(state, state.characters[0], state.characters[1], () => .99);
    return attack.actualDamage;
  };
  const normal = makeHit(10);
  const reduced = makeHit(11);
  assert.equal(reduced, Math.floor(normal * .85));
});

test("new books and treasures use their configured pools and prices", () => {
  assert.equal(SHOP_RULES.books.find((book) => book.skillId === "daily-progress")?.price, 40);
  assert.equal(SHOP_RULES.books.some((book) => book.skillType === "passive-upgrade"), false);
  for (const [id, price] of [["mirror-flower", 30], ["byakugan", 30]]) {
    assert.equal(SHOP_RULES.books.find((book) => book.skillId === id)?.price, price);
    assert.ok(SKILL_DATA[id]);
  }
  for (const id of ["white_spirit_blessing", "oni_hammer"]) {
    assert.equal(TREASURE_DATA[id].grade, "legendary");
    assert.ok(SHOP_RULES.categories.find((category) => category.id === "legendary").ids.includes(id));
  }
  assert.ok(existsSync(TREASURE_DATA.white_spirit_blessing.image));
  assert.ok(SHOP_RULES.categories.find((category) => category.id === "common").ids.includes("ninja_footwear"));
  assert.equal(SHOP_RULES.books.some((book) => book.skillId === "eight-gates"), false);
});

test("new treasure combat effects give an entry shield and one bleed stack per damaging hit", () => {
  const hero = unit("hero", "ally", { atk: 250, def: 80, whiteSpiritBlessing: true, oniHammer: true });
  const enemy = unit("enemy", "enemy", { hp: 1000, maxHp: 1000, currentHp: 1000, def: 20 });
  const state = initializeBattle([hero, enemy]);
  assert.equal(state.characters[0].shieldHp, 160);
  const hit = executeAttack(state, state.characters[0], state.characters[1], () => .99);
  assert.ok(hit.actualDamage > 0);
  assert.equal(state.characters[1].bleedStacks, 1);
});

test("Makima's reward sequence grants one skill opportunity, two rare treasures, eight stat points and partner passive last", () => {
  const hero = createRunCharacterState(STARTING_CHARACTERS[0]);
  const partner = createRunCharacterState(STARTING_CHARACTERS[1]);
  const campaign = { status: "settlement", stageId: 3, playerId: hero.characterId,
    partyIds: [hero.characterId, partner.characterId],
    partyStates: { [hero.characterId]: hero, [partner.characterId]: partner },
    runCharacterState: hero, essence: 0, essenceHistory: [],
    currentBattle: { id: "makima-reward-test", enemies: ["makima"] }, random: () => .1,
    pendingMakimaReward: { phase: "skill", treasureClaims: [], statIndex: 0, treasureChoices: null } };
  let offer = getMakimaRewardOffer(campaign);
  assert.equal(offer.phase, "skill");
  assert.ok(claimMakimaSkillReward(campaign, offer.choices[0].recipientId, offer.choices[0].skillId));
  for (let i = 0; i < 2; i += 1) {
    offer = getMakimaRewardOffer(campaign);
    assert.equal(offer.phase, "treasure");
    assert.equal(offer.choices.length, 3);
    assert.ok(claimMakimaTreasureReward(campaign, hero.characterId, offer.choices[0]));
  }
  for (let i = 0; i < 8; i += 1) {
    offer = getMakimaRewardOffer(campaign);
    assert.equal(offer.recipientId, i < 3 ? hero.characterId : partner.characterId);
    assert.ok(claimMakimaStatReward(campaign, offer.recipientId, offer.choices[0].id));
    assert.equal(campaign.essence, i < 7 ? 0 : 10);
  }
  assert.equal(getMakimaRewardOffer(campaign).phase, "passive");
  assert.equal(campaign.essenceHistory.filter((entry) => entry.battleId === campaign.currentBattle.id).length, 1);
  assert.equal(claimMakimaStatReward(campaign, partner.characterId, "atk"), false);
  assert.ok(claimMakimaPassiveReward(campaign));
  assert.equal(campaign.pendingMakimaReward, null);
  assert.equal(campaign.makimaRewardClaimed, true);
});

test("Might Guy elite drop unlocks a one-time campfire challenge and Eight Gates reward", () => {
  const campaign = createCampaign(() => .21, { seed: 481 });
  startCampaign(campaign);
  campaign.candidateIds = ["naruto", "eren"];
  selectStartingCharacter(campaign, "naruto", STARTING_CHARACTERS.find((entry) => entry.id === "naruto").activeSkills[0]);
  beginJourney(campaign);
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
  const elite = campaign.routeMap.nodes.find((node) => node.type === "elite");
  const predecessor = campaign.routeMap.nodes.find((node) => node.nextNodeIds.includes(elite.id));
  campaign.routeMap.currentNodeId = predecessor.id;
  campaign.step = elite.step;
  campaign.stageStep = elite.step;
  campaign.routeOptions = [elite];
  elite.status = "pending";
  assert.ok(chooseRoute(campaign, elite.id));
  campaign.currentBattle.enemies = ["might-guy"];
  campaign.currentBattle.enemyNames = { "might-guy": "迈特凯" };
  const eliteGuy = prepareBattle(campaign).roster.find((member) => member.id === "might-guy");
  assert.equal(eliteGuy.nightGuyEligible, false);
  const ordinaryFight = simulateBattle([
    unit("hero", "ally", { hp: 12000, maxHp: 12000, currentHp: 12000, atk: 5000, spd: 1000 }),
    { ...eliteGuy, critChance: 0 },
  ], () => .99);
  assert.ok(ordinaryFight.events.some((event) => event.type === "might-guy-speed"));
  assert.equal(ordinaryFight.events.some((event) => event.type === "night-guy-transform"), false);
  assert.equal(finishBattle(campaign, "victory", campaign.playerHp).next, "reward");
  const offer = getCampaignRewardOffer(campaign);
  for (const [index, id] of campaign.partyIds.entries())
    assert.ok(claimStageTwoStatReward(campaign, id, offer.choices[index]));
  assert.equal(campaign.rewardPhase, "elite_drop");
  const recipientId = campaign.partyIds[0];
  const beforeSpd = campaign.partyStates[recipientId].spd;
  const claimed = claimCampaignEliteDrop(campaign, recipientId);
  assert.equal(claimed.effect.id, "ninja_footwear");
  assert.equal(claimed.effect.sourceId, elite.id);
  assert.equal(campaign.partyStates[recipientId].spd, beforeSpd + 30);
  assert.equal(claimed.status, "guy_intro");
  assert.equal(campaign.guyChallenge.unlocked, undefined);
  assert.equal(claimCampaignEliteDrop(campaign, recipientId), false);
  assert.ok(finishGuyIntro(campaign));
  assert.equal(campaign.guyChallenge.unlocked, true);
  const camp = campaign.routeMap.nodes.find((node) => node.type === "campfire");
  camp.status = "in_progress";
  campaign.status = "event";
  campaign.activeEventType = "campfire";
  campaign.activeNode = camp;
  campaign.eventResolved = false;
  assert.equal(canChallengeGuyAtCampfire(campaign), true);
  assert.ok(beginGuyCampfireChallenge(campaign));
  assert.equal(canChallengeGuyAtCampfire(campaign), false);
  const prepared = prepareBattle(campaign);
  assert.equal(prepared.roster.find((member) => member.id === "might-guy").nightGuyEligible, true);
  assert.equal(finishBattle(campaign, "victory", campaign.playerHp).next, "guy_win");
  assert.equal(completeSettlement(campaign), null);
  assert.ok(claimEightGatesReward(campaign, recipientId));
  assert.equal(claimEightGatesReward(campaign, recipientId), false);
  assert.equal(completeSettlement(campaign), "route");
  assert.equal(campaign.guyChallenge.resolved, true);
});
