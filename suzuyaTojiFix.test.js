import test from "node:test";
import assert from "node:assert/strict";
import { ELITE_ENEMY_DATA, EVENT_ENEMY_DATA } from "./characters.js";
import { executeAttack, initializeBattle, simulateBattle } from "./battle.js";
import { finishBattle, prepareBattle } from "./campaign.js";
import { createStageTwoTestCampaign } from "./dev/stage2-config.js";
import { healRunCharacter } from "./progression.js";
import { SKILL_DATA } from "./skills.js";

const unit = (id, team, values = {}) => ({ id, name: id, team, row: "front", hp: 2000,
  atk: 100, def: 0, spd: 50, critChance: 0, rosterOrder: team === "ally" ? 0 : 1, ...values });

test("Jason cuts max HP every third landed normal attack without a separate damage event", () => {
  const suzuya = unit("suzuya", "enemy", { ...EVENT_ENEMY_DATA.suzuya,
    hp: 10000, atk: 80, spd: 100, critChance: 0 });
  const ally = unit("naruto", "ally", { hp: 2000, currentHp: 1700, atk: 1, def: 1000, spd: 1 });
  const result = simulateBattle([ally, suzuya], () => .99);
  const proc = result.events.find((event) => event.type === "jason-max-hp");
  assert.ok(proc);
  assert.equal(proc.attackCount, 3);
  assert.deepEqual([proc.maxHpBefore, proc.maxHpAfter, proc.reduction], [2000, 1840, 160]);
  assert.equal(proc.hpAfter, proc.hpBefore, "current HP below the new cap is unchanged");
  assert.equal(proc.actualDamage, 0);
  assert.equal(result.events.some((event) => event.type === "jason-damage"), false);
  const capped = simulateBattle([unit("naruto", "ally", { hp: 2000, currentHp: 1900,
    atk: 1, def: 1000, spd: 1 }), suzuya], () => .99)
    .events.find((event) => event.type === "jason-max-hp");
  assert.ok(capped.hpBefore > capped.maxHpAfter);
  assert.equal(capped.hpAfter, capped.maxHpAfter, "current HP above the new cap is clamped");
});

test("Jason max HP reduction survives battle settlement and the next roster without double application", () => {
  const campaign = createStageTwoTestCampaign({ heroId: "naruto", partnerId: "eren", seed: 91 });
  const run = campaign.partyStates.naruto;
  const initial = run.maxHp;
  campaign.status = "combat";
  campaign.combatLaunched = true;
  campaign.currentBattle = { type: "normal", step: 1, enemies: ["guard"] };
  const loss = Math.floor(initial * .08);
  const event = { type: "jason-max-hp", targetId: "naruto", reduction: loss };
  const transition = finishBattle(campaign, "victory", initial - 100, [event, { type: "battle-end", round: 3 }],
    [{ id: "naruto", team: "ally", currentHp: initial - 100 }]);
  assert.ok(transition);
  assert.equal(run.maxHp, initial - loss);
  assert.equal(run.currentHp, Math.min(initial - 100, run.maxHp));
  assert.equal(finishBattle(campaign, "victory", run.currentHp, [event]), false);
  assert.equal(run.maxHp, initial - loss);
  healRunCharacter(run, 100000);
  assert.equal(run.maxHp, initial - loss, "ordinary healing does not restore the removed HP ceiling");
  assert.equal(run.currentHp, initial - loss);
  campaign.status = "combat";
  campaign.combatLaunched = false;
  const next = prepareBattle(campaign).roster.find((entry) => entry.id === "naruto");
  assert.equal(next.maxHp, initial - loss);
  assert.equal(createStageTwoTestCampaign({ heroId: "naruto", partnerId: "eren", seed: 92 }).partyStates.naruto.maxHp,
    initial, "a new run starts from its normal maximum HP");
});

test("Toji rests for exactly one action after every fatigued action", () => {
  const template = ELITE_ENEMY_DATA.find((entry) => entry.id === "toji");
  const result = simulateBattle([unit("hero", "ally", { hp: 10000, currentHp: 10000,
    atk: 100, def: 500, spd: 50 }), unit("toji", "enemy", { ...template,
    currentHp: template.hp, critChance: 0 })], () => .99);
  const fatigueIndex = result.events.findIndex((event) => event.type === "toji-fatigue");
  assert.ok(fatigueIndex >= 0);
  assert.equal(result.events[fatigueIndex - 1].segmentIndex, 3);
  assert.equal(result.events.some((event) => event.type === "toji-exhausted"), false);
  assert.ok(result.events.filter((event) => event.type === "attack" && event.attackerId === "toji")
    .every((event) => event.segmentCount <= 5));
  const skips = result.events.filter((event) => event.type === "toji-skip");
  assert.ok(skips.length >= 2);
  assert.equal(skips[0].round, result.events[fatigueIndex].round + 1);
  for (const skip of skips) {
    assert.equal(result.events.some((event) => event.type === "attack" && event.attackerId === "toji" && event.round === skip.round), false);
    const resume = result.events.find((event) => event.type === "toji-resume" && event.round === skip.round);
    assert.ok(resume, "rest status ends during the skipped round");
  }
  assert.ok(result.events.some((event) => event.type === "attack" && event.attackerId === "toji" && event.round === skips[0].round + 1),
    "Toji attacks at the next opportunity after one skipped round");
});

test("Toji fatigue does not amplify normal or true damage", () => {
  const tojiTemplate = ELITE_ENEMY_DATA.find((entry) => entry.id === "toji");
  const freeWill = { ...SKILL_DATA["eren-free-will"], ...SKILL_DATA["eren-free-will"].levels[4], level: 4 };
  const battle = initializeBattle([unit("eren", "ally", { atk: 100, def: 100, skills: [freeWill] }),
    unit("toji", "enemy", { ...tojiTemplate, currentHp: 2600, critChance: 0 })]);
  const [eren, toji] = battle.characters;
  battle.round = 1;
  toji.tojiFatigued = true;
  eren.freeWillTriggers = 2;
  const hit = executeAttack(battle, eren, toji, () => .99, { skill: freeWill });
  assert.equal(hit.damage, 45);
  assert.equal(hit.extraTrueDamage.requested, 125);
  assert.equal(hit.extraTrueDamage.actualDamage, 125);
  assert.equal(toji.def, 120);
});
