import test from "node:test";
import assert from "node:assert/strict";
import { STARTING_CHARACTERS } from "./characters.js";
import { resolveCampaignEvent } from "./campaign.js";
import { createStageTwoTestCampaign } from "./dev/stage2-config.js";
import { createAdventureEventResult, createRunCharacterState, getAvailableAdventureEventIds,
  resolveAdventureEvent } from "./progression.js";

const make = (id) => createRunCharacterState(STARTING_CHARACTERS.find((entry) => entry.id === id));
const rolls = (...values) => () => values.shift() ?? 0;

test("gamble appears at most twice, in different stages", () => {
  const hero = make("naruto");
  assert.ok(getAvailableAdventureEventIds(hero, 1, [hero], 1).includes("gamble"));
  assert.equal(getAvailableAdventureEventIds(hero, 1, [hero], 1).includes("gamble_2"), false);
  createAdventureEventResult(hero, "first", "gamble", () => 0, [hero], 1);
  resolveAdventureEvent(hero, "first", `gamble_recipient|${hero.characterId}`, () => 0, hero);
  resolveAdventureEvent(hero, "first", "gamble_quit", () => 0, hero);
  assert.equal(getAvailableAdventureEventIds(hero, 1, [hero], 1).includes("gamble_2"), false);
  assert.equal(createAdventureEventResult(hero, "same-stage", "gamble_2", () => 0, [hero], 1), null);
  assert.ok(getAvailableAdventureEventIds(hero, 1, [hero], 2).includes("gamble_2"));
  createAdventureEventResult(hero, "second", "gamble_2", () => 0, [hero], 2);
  resolveAdventureEvent(hero, "second", `gamble_recipient|${hero.characterId}`, () => 0, hero);
  resolveAdventureEvent(hero, "second", "gamble_quit", () => 0, hero);
  assert.equal(getAvailableAdventureEventIds(hero, 1, [hero], 3).includes("gamble_2"), false);
});

test("three locked coin outcomes award one treasure pair to the selected member", () => {
  const hero = make("naruto");
  const partner = make("eren");
  const heroStats = [hero.maxHp, hero.atk, hero.def, hero.currentHp];
  const partnerAttack = partner.atk;
  createAdventureEventResult(hero, "bet", "gamble", () => 0, [hero, partner], 2);
  resolveAdventureEvent(hero, "bet", "gamble_recipient|eren", () => 0, partner);
  for (let round = 1; round <= 3; round += 1) {
    const flip = resolveAdventureEvent(hero, "bet", "gamble_play", rolls(0.4, 0), partner);
    assert.deepEqual([flip.result.type, flip.result.success, flip.result.round], ["atk", true, round]);
    assert.equal(partner.atk, partnerAttack + [0, 20, 40][round - 1], "no effect before coin settlement");
    assert.equal(resolveAdventureEvent(hero, "bet", "gamble_play", () => 0, partner), false);
    const settled = resolveAdventureEvent(hero, "bet", "gamble_settle", () => 0, partner);
    assert.ok(settled);
    if (round < 3) resolveAdventureEvent(hero, "bet", "gamble_next", () => 0, partner);
    else {
      assert.equal(settled.status, "completed");
      assert.equal(settled.result.successCount, 3);
      assert.deepEqual(settled.result.treasures.map((item) => item.id), ["giant_spinal_fluid", "odm_gear"]);
    }
  }
  assert.deepEqual([hero.maxHp, hero.atk, hero.def, hero.currentHp], heroStats);
  assert.equal(resolveAdventureEvent(hero, "bet", "gamble_settle", () => 0, partner), false);
});

test("failed skill bet stops at one HP and a capped skill is removed from later draws", () => {
  const hero = make("naruto");
  hero.currentHp = 300;
  createAdventureEventResult(hero, "risk", "gamble", () => 0, [hero], 1);
  resolveAdventureEvent(hero, "risk", "gamble_recipient|naruto", () => 0, hero);
  const flip = resolveAdventureEvent(hero, "risk", "gamble_play", rolls(0, .99), hero);
  assert.deepEqual([flip.result.type, flip.result.success], ["skill", false]);
  assert.equal(hero.currentHp, 300);
  const settled = resolveAdventureEvent(hero, "risk", "gamble_settle", () => 0, hero);
  assert.deepEqual([settled.result.settled.change.hpLoss, hero.currentHp], [299, 1]);
  hero.skillLevels[hero.learnedActiveSkills[0]] = 4;
  resolveAdventureEvent(hero, "risk", "gamble_next", () => 0, hero);
  const second = resolveAdventureEvent(hero, "risk", "gamble_play", rolls(0, 0), hero);
  assert.equal(second.result.type, "atk");
});

test("coin thresholds use the same cached roll shown before settlement", () => {
  for (const [chanceRoll, expected] of [[.599999, true], [.6, false]]) {
    const hero = make("naruto");
    createAdventureEventResult(hero, `first-${chanceRoll}`, "gamble", () => 0, [hero], 1);
    resolveAdventureEvent(hero, `first-${chanceRoll}`, "gamble_recipient|naruto", () => 0, hero);
    const coin = resolveAdventureEvent(hero, `first-${chanceRoll}`, "gamble_play", rolls(.4, chanceRoll), hero);
    assert.equal(coin.result.success, expected);
    assert.equal(resolveAdventureEvent(hero, `first-${chanceRoll}`, "gamble_settle", () => .99, hero).result.settled.success, expected);
  }
  for (const [chanceRoll, expected] of [[.499999, true], [.5, false]]) {
    const hero = make("naruto");
    createAdventureEventResult(hero, `second-${chanceRoll}`, "gamble", () => 0, [hero], 1);
    resolveAdventureEvent(hero, `second-${chanceRoll}`, "gamble_recipient|naruto", () => 0, hero);
    resolveAdventureEvent(hero, `second-${chanceRoll}`, "gamble_play", rolls(.4, 0), hero);
    resolveAdventureEvent(hero, `second-${chanceRoll}`, "gamble_settle", () => 0, hero);
    resolveAdventureEvent(hero, `second-${chanceRoll}`, "gamble_next", () => 0, hero);
    const coin = resolveAdventureEvent(hero, `second-${chanceRoll}`, "gamble_play", rolls(.4, chanceRoll), hero);
    assert.equal(coin.result.success, expected);
  }
});

test("only two or more wins across all three played rounds grant a pair", () => {
  for (const [outcomes, rewarded] of [[[true, true, false], true], [[true, false, false], false]]) {
    const hero = make("naruto");
    createAdventureEventResult(hero, "gating", "gamble", () => 0, [hero], 2);
    resolveAdventureEvent(hero, "gating", "gamble_recipient|naruto", () => 0, hero);
    let final;
    for (let round = 0; round < 3; round += 1) {
      resolveAdventureEvent(hero, "gating", "gamble_play", rolls(.4, outcomes[round] ? 0 : .99), hero);
      final = resolveAdventureEvent(hero, "gating", "gamble_settle", () => 0, hero);
      if (round < 2) resolveAdventureEvent(hero, "gating", "gamble_next", () => 0, hero);
    }
    assert.equal(final.result.treasures.length === 2, rewarded);
    assert.equal(final.result.successCount, outcomes.filter(Boolean).length);
  }
});

test("campaign keeps the selected partner through coin settlement and marks the event resolved only on exit", () => {
  const campaign = createStageTwoTestCampaign({ heroId: "naruto", partnerId: "eren", seed: 36 });
  campaign.status = "event";
  campaign.activeEventType = "adventure";
  campaign.activeNode = { id: "gamble-node" };
  campaign.eventResolved = false;
  campaign.pendingEvent = createAdventureEventResult(campaign.runCharacterState, "gamble-node", "gamble", () => 0,
    campaign.partyIds.map((id) => campaign.partyStates[id]), 2);
  const hero = campaign.partyStates.naruto;
  const partner = campaign.partyStates.eren;
  const heroAttack = hero.atk;
  const partnerAttack = partner.atk;
  assert.ok(resolveCampaignEvent(campaign, "gamble_recipient|eren"));
  assert.equal(campaign.eventResolved, false);
  campaign.random = rolls(.4, 0);
  assert.equal(resolveCampaignEvent(campaign, "gamble_play").result.coinPending, true);
  assert.equal(partner.atk, partnerAttack);
  assert.equal(resolveCampaignEvent(campaign, "gamble_settle").result.gambleResult, true);
  assert.equal(partner.atk, partnerAttack + 20);
  assert.equal(hero.atk, heroAttack);
  resolveCampaignEvent(campaign, "gamble_next");
  assert.ok(resolveCampaignEvent(campaign, "gamble_quit"));
  assert.equal(campaign.eventResolved, true);
  assert.equal(resolveCampaignEvent(campaign, "gamble_quit"), false);
});

const playRound = (run, sourceId, typeRoll, success) => {
  resolveAdventureEvent(run, sourceId, "gamble_play", rolls(typeRoll, success ? 0 : .99), run);
  const result = resolveAdventureEvent(run, sourceId, "gamble_settle", () => .4, run);
  if (run.eventResults[sourceId].status === "pending")
    resolveAdventureEvent(run, sourceId, "gamble_next", () => 0, run);
  return result;
};

test("third-round loss revokes two earlier stat wins but keeps its penalty and two-win reward", () => {
  const run = make("naruto");
  const before = { atk: run.atk, def: run.def };
  createAdventureEventResult(run, "reverse-stats", "gamble", () => 0, [run], 1);
  resolveAdventureEvent(run, "reverse-stats", "gamble_recipient|naruto", () => 0, run);
  playRound(run, "reverse-stats", .4, true);
  playRound(run, "reverse-stats", .9, true);
  const final = playRound(run, "reverse-stats", .4, false);
  assert.equal(final.result.successCount, 2);
  assert.equal(final.result.treasures.length, 2);
  assert.deepEqual(final.result.settled.revoked.map((entry) => [entry.round, entry.stat, entry.amount]),
    [[1, "atk", 20], [2, "def", 20]]);
  assert.equal(final.result.treasures[0].id, "sukuna_finger");
  assert.equal(run.atk, before.atk + 30, "the separate treasure reward remains");
  assert.equal(run.def, before.def - 20);
});

test("third-round loss restores only skill levels earned in this gamble", () => {
  const run = make("naruto");
  const skillId = run.learnedActiveSkills[0];
  const initialLevel = run.skillLevels[skillId];
  const baseAtk = run.atk;
  const baseDef = run.def;
  createAdventureEventResult(run, "reverse-skill", "gamble", () => 0, [run], 1);
  resolveAdventureEvent(run, "reverse-skill", "gamble_recipient|naruto", () => 0, run);
  playRound(run, "reverse-skill", 0, true);
  assert.equal(run.skillLevels[skillId], initialLevel + 1);
  playRound(run, "reverse-skill", .4, false);
  const final = playRound(run, "reverse-skill", .9, false);
  assert.equal(run.skillLevels[skillId], initialLevel);
  assert.equal(run.atk, baseAtk - 20);
  assert.equal(run.def, baseDef - 20);
  assert.deepEqual(final.result.settled.revoked.map((entry) => entry.skillId), [skillId]);
  assert.equal(run.skillHistory.some((entry) => entry.sourceId === "reverse-skill:round:1"), false);
  assert.equal(final.result.successCount, 1);
});

test("third-round loss with no earlier win keeps every prior penalty", () => {
  const run = make("naruto");
  const baseAtk = run.atk;
  const baseDef = run.def;
  run.currentHp = 300;
  createAdventureEventResult(run, "all-loss", "gamble", () => 0, [run], 1);
  resolveAdventureEvent(run, "all-loss", "gamble_recipient|naruto", () => 0, run);
  playRound(run, "all-loss", 0, false);
  const hpAfterFirst = run.currentHp;
  playRound(run, "all-loss", .4, false);
  const final = playRound(run, "all-loss", .9, false);
  assert.equal(run.currentHp, hpAfterFirst);
  assert.equal(run.atk, baseAtk - 20);
  assert.equal(run.def, baseDef - 20);
  assert.deepEqual(final.result.settled.revoked, []);
  assert.equal(final.result.successCount, 0);
});

test("stage-three event pool excludes three old encounters but keeps gamble", () => {
  const run = make("naruto");
  const pool = getAvailableAdventureEventIds(run, 9, [run], 3);
  assert.ok(pool.includes("gamble"));
  for (const id of ["death_note", "fate_gate", "giant_encirclement"])
    assert.equal(pool.includes(id), false);
  const stageOne = getAvailableAdventureEventIds(run, 9, [run], 1);
  for (const id of ["gamble", "death_note", "fate_gate", "giant_encirclement"])
    assert.ok(stageOne.includes(id));
});

test("two upgrades of one skill are both undone in reverse order", () => {
  const run = make("naruto");
  const skillId = run.learnedActiveSkills[0];
  const startingLevel = run.skillLevels[skillId];
  createAdventureEventResult(run, "double-skill", "gamble", () => 0, [run], 1);
  resolveAdventureEvent(run, "double-skill", "gamble_recipient|naruto", () => 0, run);
  playRound(run, "double-skill", 0, true);
  playRound(run, "double-skill", 0, true);
  assert.equal(run.skillLevels[skillId], startingLevel + 2);
  const result = playRound(run, "double-skill", .4, false);
  assert.equal(run.skillLevels[skillId], startingLevel);
  assert.deepEqual(result.result.settled.revoked.map((entry) => entry.round), [1, 2]);
  assert.equal(run.skillHistory.some((entry) => entry.sourceId.startsWith("double-skill:round:")), false);
  assert.equal(result.result.successCount, 2);
});

test("rolled-back Journey West upgrade also removes its intrinsic attack gain", () => {
  const run = make("tang");
  run.evolution = { phase: 2 };
  run.skillLevels["journey-west"] = 10;
  const baseAtk = run.atk;
  createAdventureEventResult(run, "journey-risk", "gamble", () => 0, [run], 2);
  resolveAdventureEvent(run, "journey-risk", "gamble_recipient|tang", () => 0, run);
  playRound(run, "journey-risk", 0, true);
  assert.equal(run.skillLevels["journey-west"], 11);
  assert.equal(run.atk, baseAtk + 100);
  playRound(run, "journey-risk", .9, false);
  const final = playRound(run, "journey-risk", .9, false);
  assert.equal(run.skillLevels["journey-west"], 10);
  assert.equal(run.atk, baseAtk - 40);
  assert.equal(final.result.settled.revoked[0].attackGain, 100);
});
