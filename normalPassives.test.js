import test from "node:test";
import assert from "node:assert/strict";
import { executeAttack, initializeBattle, simulateBattle } from "./battle.js";
import { finishBattle, prepareBattle } from "./campaign.js";
import { createStageTwoDirectBattleCampaign } from "./dev/stage2-config.js";

const fighter = (id, team, options = {}) => ({ id, team, row: "front", hp: 5000,
  atk: 100, def: 0, spd: 10, critChance: 0, normalDodgeRate: 0, ...options });

test("Lu Bu doubles only his first-round ordinary attack", () => {
  const state = initializeBattle([fighter("guard", "enemy", { normalPassiveId: "lubu" }), fighter("hero", "ally")]);
  state.round = 1;
  assert.equal(executeAttack(state, state.characters[0], state.characters[1], () => .99, { skill: null }).damage, 200);
  state.round = 2;
  assert.equal(executeAttack(state, state.characters[0], state.characters[1], () => .99, { skill: null }).damage, 100);
  assert.equal(state.characters[0].atk, 100);
});

test("Edward's third ordinary attack ignores DEF without adding another hit", () => {
  const state = initializeBattle([fighter("mage", "enemy", { normalPassiveId: "jack" }), fighter("hero", "ally", { def: 100 })]);
  state.round = 1;
  const hits = [1, 2, 3, 4].map(() => executeAttack(state, state.characters[0], state.characters[1], () => .99, { skill: null }));
  assert.deepEqual(hits.map((hit) => [hit.damage, hit.edwardTrueDamage]), [[50, false], [50, false], [100, true], [50, false]]);
});

test("Deep Sea King gains 5 DEF after each ordinary attack, including a dodge, only for this battle", () => {
  const source = fighter("guard", "enemy", { normalPassiveId: "deep_sea_king", def: 40 });
  const state = initializeBattle([source, fighter("hero", "ally", { normalDodgeRate: 1 })]);
  state.round = 1;
  const [king, hero] = state.characters;
  const first = executeAttack(state, king, hero, () => .5, { skill: null });
  assert.equal(first.dodged, true);
  assert.deepEqual([first.deepSeaDefenseGain, first.attackerDef, king.def], [5, 45, 45]);
  hero.normalDodgeRate = 0;
  const second = executeAttack(state, king, hero, () => .99, { skill: null });
  assert.deepEqual([second.deepSeaDefenseGain, second.attackerDef, king.def], [5, 50, 50]);
  assert.equal(initializeBattle([source, fighter("hero", "ally")]).characters[0].def, 40);
});

test("Dementor reflects five percent of actual received damage once per hit", () => {
  const result = simulateBattle([fighter("hero", "ally", { atk: 1000, spd: 100 }),
    fighter("guard", "enemy", { hp: 3000, atk: 1, normalPassiveId: "dementor" })], () => .99);
  const firstHit = result.events.find((event) => event.type === "attack" && event.attackerId === "hero");
  const reflect = result.events.find((event) => event.type === "normal-passive-reflect");
  assert.equal(firstHit.actualDamage, 1000);
  assert.equal(reflect.actualDamage, 50);
  assert.equal(reflect.targetId, "hero");
});

test("Teruhashi's reaction stuns the attacker for one action", () => {
  const result = simulateBattle([fighter("hero", "ally", { atk: 100, spd: 100 }),
    fighter("mage", "enemy", { hp: 1000, atk: 1, normalPassiveId: "teruhashi" })], () => .1);
  const stun = result.events.find((event) => event.type === "normal-passive-stun");
  assert.ok(stun);
  assert.ok(result.events.some((event) => event.type === "trial-control-skip" && event.targetId === "hero" && event.reason === "眩晕"));
});

test("a Gollum surviving five rounds penalizes both party members once and persists", () => {
  const result = simulateBattle([fighter("hero", "ally", { hp: 10000, atk: 100, spd: 100 }),
    fighter("friend", "ally", { hp: 10000, atk: 100, spd: 90 }),
    fighter("mage", "enemy", { hp: 2000, atk: 1, normalPassiveId: "gollum" })], () => .99);
  const penalties = result.events.filter((event) => event.type === "normal-passive-gollum");
  assert.equal(penalties.length, 1);
  assert.equal(penalties[0].round, 5);
  assert.deepEqual(penalties[0].targets.map((target) => [target.atk, target.def, target.spd]),
    [[95, 0, 95], [95, 0, 85]]);
  assert.deepEqual(result.finalCharacters.filter((unit) => unit.team === "ally").map((unit) => unit.maxHp), [10000, 10000]);

  const campaign = createStageTwoDirectBattleCampaign({ heroId: "naruto", partnerId: "eren", encounterId: "toji", localStep: 6, seed: 83 });
  prepareBattle(campaign);
  const before = campaign.partyIds.map((id) => ({ ...campaign.partyStates[id] }));
  const event = { type: "normal-passive-gollum", targets: campaign.partyIds.map((targetId) => ({ targetId })) };
  finishBattle(campaign, "victory", before[0].currentHp, [event], campaign.partyIds.map((id) => ({
    id, team: "ally", currentHp: campaign.partyStates[id].currentHp,
  })));
  for (const [index, id] of campaign.partyIds.entries()) {
    assert.equal(campaign.partyStates[id].maxHp, before[index].maxHp);
    assert.equal(campaign.partyStates[id].currentHp, before[index].currentHp);
    assert.equal(campaign.partyStates[id].atk, before[index].atk - 5);
    assert.equal(campaign.partyStates[id].def, before[index].def - 5);
    assert.equal(campaign.partyStates[id].spd, before[index].spd - 5);
  }
});

test("formal stage-two ordinary roster binds passives to appearances only", () => {
  const campaign = createStageTwoDirectBattleCampaign({ heroId: "naruto", partnerId: "eren", encounterId: "toji", localStep: 6, seed: 83 });
  campaign.currentBattle = { id: "appearance-passives", type: "normal", enemies: ["guard", "mage"],
    enemyAppearanceIds: { guard: "lubu", mage: "jack" } };
  const roster = prepareBattle(campaign).roster;
  assert.equal(roster.find((unit) => unit.id === "guard").normalPassiveId, "lubu");
  assert.equal(roster.find((unit) => unit.id === "mage").normalPassiveId, "jack");
  assert.ok(roster.filter((unit) => unit.team === "ally").every((unit) => !unit.normalPassiveId));
});
