import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { NORMAL_ENEMY_APPEARANCES, STAGE_THREE_NORMAL_PASSIVES } from "./characters.js";
import { executeAttack, initializeBattle, simulateBattle } from "./battle.js";
import { chooseRoute, getRouteOptions, prepareBattle } from "./campaign.js";
import { createStageThreeTestCampaign } from "./dev/stage3-config.js";
import { CHARACTER_VISUALS, getAnimationFrameFootShift } from "./visualConfig.js";

const frontIds = ["bull_king", "headless_knight", "anubis", "loki", "medusa", "shiji"];
const enemy = (appearanceId) => ({ id: "guard", name: NORMAL_ENEMY_APPEARANCES[appearanceId].name,
  team: "enemy", row: "front", hp: 2400, maxHp: 2400, currentHp: 2400,
  atk: 250, def: 140, spd: 75, critChance: 0, normalPassiveId: appearanceId });
const hero = () => ({ id: "hero", team: "ally", row: "front", hp: 10000, atk: 1,
  def: 0, spd: 10, critChance: 0, normalDodgeRate: 0 });

test("stage-three front appearances have deployed art and passive descriptions", () => {
  for (const id of frontIds) {
    assert.ok(existsSync(new URL(`./${NORMAL_ENEMY_APPEARANCES[id].asset}`, import.meta.url)), id);
    assert.ok(STAGE_THREE_NORMAL_PASSIVES[id]?.description, id);
    assert.ok(CHARACTER_VISUALS[id]?.scale > 0, id);
  }
  const campaign = createStageThreeTestCampaign({ heroId: "naruto", partnerId: "eren", opponent: "normal-front" });
  const guard = prepareBattle(campaign).roster.find((unit) => unit.id === "guard");
  assert.deepEqual([guard.name, guard.appearanceId, guard.normalPassiveId], ["牛魔王", "bull_king", "bull_king"]);
});

test("third-stage route encounters draw all six new front enemies without changing the back pool", () => {
  const seenFront = new Set();
  for (let seed = 1; seed <= 120; seed += 1) {
    const campaign = createStageThreeTestCampaign({ heroId: "naruto", partnerId: "eren", opponent: "route", seed });
    const node = getRouteOptions(campaign).find((entry) => entry.type === "battle");
    const encounter = chooseRoute(campaign, node.id).battle;
    const frontId = encounter.enemyAppearanceIds.guard;
    const backId = encounter.enemyAppearanceIds.mage;
    if (frontId) { assert.ok(frontIds.includes(frontId)); seenFront.add(frontId); }
    if (backId) assert.ok(["jack", "teruhashi", "gollum"].includes(backId));
  }
  assert.deepEqual([...seenFront].sort(), [...frontIds].sort());
});

test("stage-three opening stat passives change battle copies once and leave templates untouched", () => {
  const expected = {
    bull_king: [2400, 250, 190], headless_knight: [2400, 350, 90],
    anubis: [2800, 250, 140], loki: [2400, 320, 140],
  };
  for (const [id, values] of Object.entries(expected)) {
    const source = enemy(id);
    const battle = initializeBattle([source, hero()]);
    const guard = battle.characters[0];
    assert.deepEqual([guard.maxHp, guard.atk, guard.def], values, id);
    assert.equal(guard.currentHp, guard.maxHp, id);
    assert.deepEqual([source.maxHp, source.atk, source.def], [2400, 250, 140], id);
    assert.deepEqual([initializeBattle([source, hero()]).characters[0].maxHp,
      initializeBattle([source, hero()]).characters[0].atk], values.slice(0, 2), id);
  }
});

test("Medusa's landed attack can stun once; dodge and failed roll cannot", () => {
  const state = initializeBattle([enemy("medusa"), hero()]);
  state.round = 1;
  const [medusa, target] = state.characters;
  const hit = executeAttack(state, medusa, target, () => 0.01, { skill: null });
  assert.equal(hit.stunApplied, true);
  assert.equal(target.stunNextAction, true);
  target.stunNextAction = false;
  assert.equal(executeAttack(state, medusa, target, () => .99, { skill: null }).stunApplied, false);
  target.normalDodgeRate = 1;
  assert.equal(executeAttack(state, medusa, target, () => 0.01, { skill: null }).stunApplied, false);
  assert.equal(target.stunNextAction, false);
});

test("Shiji's landed attack silences active skills without changing normal attacks", () => {
  const state = initializeBattle([enemy("shiji"), hero()]);
  state.round = 2;
  const [shiji, target] = state.characters;
  const hit = executeAttack(state, shiji, target, () => .01, { skill: null });
  assert.equal(hit.silenceUntilRound, 3);
  assert.equal(target.silencedThroughRound, 3);
  const missed = initializeBattle([enemy("shiji"), hero()]);
  missed.round = 2;
  assert.equal(executeAttack(missed, missed.characters[0], missed.characters[1], () => .99,
    { skill: null }).silenceUntilRound, null);
  const skilledHero = { ...hero(), atk: 100, spd: 100,
    skills: [{ id: "probe", name: "测试主动技", chance: 1, multiplier: 1, effectType: "damage" }] };
  const result = simulateBattle([enemy("shiji"), skilledHero], () => .1);
  const heroAttacks = result.events.filter((event) => event.type === "attack" && event.attackerId === "hero");
  assert.equal(heroAttacks[0].skillId, "probe");
  assert.equal(heroAttacks[1].skillId, null);
  assert.ok(result.events.some((event) => event.type === "attack" && event.silenceUntilRound));
});

test("Bomb Demon skill art faces left and keeps its foot shift in both encounters", () => {
  const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
  assert.match(css, /data-character="bomb-demon"[^\n]*data-frame-name="raise"[\s\S]*data-character="makima-bomb"[^\n]*data-frame-name="launch"[\s\S]*transform: scaleX\(-1\) scale\(var\(--action-frame-scale, 1\)\)/);
  assert.equal(getAnimationFrameFootShift({ id: "bomb-demon" }, "boom", "raise"), 20);
  assert.equal(getAnimationFrameFootShift({ id: "makima-bomb" }, "boom", "launch"), 22);
});
