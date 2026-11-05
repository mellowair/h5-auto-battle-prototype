import test from "node:test";
import assert from "node:assert/strict";
import { simulateBattle } from "./battle.js";
import { SKILL_DATA } from "./skills.js";
import { generateRouteMap, validateRouteMap } from "./routeGraph.js";
import { tangSummonStats } from "./tangSummons.js";
import { CHARACTER_DATA, STARTING_CHARACTERS } from "./characters.js";

const unit = (id, team, extra = {}) => ({ id, name: id, team, row: "front", hp: 1000, atk: 100,
  def: 0, spd: 50, critChance: 0, normalDodgeRate: 0, skillDodgeRate: 0,
  rosterOrder: team === "ally" ? 0 : 2, ...extra });

test("C0 detonates against each surviving ally once and checks victory after the blast", () => {
  const result = simulateBattle([
    unit("hero", "ally", { hp: 500, atk: 1200, spd: 50 }),
    unit("partner", "ally", { hp: 50, atk: 1, spd: 1, rosterOrder: 1 }),
    unit("deidara", "enemy", { hp: 500, atk: 1, spd: 100, c0DamagePerRound: 100 }),
  ], () => .99, { playerId: "hero" });
  const blast = result.events.find((event) => event.type === "c0-detonate");
  assert.ok(blast);
  assert.equal(blast.damage, 100);
  assert.deepEqual(blast.targets.map((target) => target.targetId), ["hero", "partner"]);
  assert.deepEqual(blast.targets.map((target) => target.hpAfter), [400, 0]);
  assert.equal(result.outcome, "victory");
});

test("C0 true damage is absorbed by an existing shield for each ally", () => {
  const tatakae = { ...SKILL_DATA["eren-tatakae"], ...SKILL_DATA["eren-tatakae"].levels[4], chance: 1, level: 4 };
  const result = simulateBattle([
    unit("eren", "ally", { hp: 1000, atk: 1, spd: 90, skills: [tatakae] }),
    unit("partner", "ally", { hp: 1000, atk: 2000, spd: 80, rosterOrder: 1 }),
    unit("deidara", "enemy", { hp: 1000, atk: 1, spd: 100, c0DamagePerRound: 100 }),
  ], () => .99, { playerId: "eren" });
  const blast = result.events.find((event) => event.type === "c0-detonate");
  assert.ok(blast);
  assert.deepEqual(blast.targets.map((target) => target.shieldAbsorbed), [100, 100]);
  assert.ok(blast.targets.every((target) => target.hpAfter === target.hpBefore));
});

test("Lv4 clone splash returns to the sole surviving target", () => {
  const clone = { ...SKILL_DATA["shadow-clone-rush"], ...SKILL_DATA["shadow-clone-rush"].levels[4], chance: 1, level: 4 };
  const result = simulateBattle([unit("naruto", "ally", { hp: 5000, atk: 100, skills: [clone], spd: 200 }),
    unit("foe", "enemy", { hp: 10000, atk: 1 })], () => .99);
  const primary = result.events.find((event) => event.skillId === clone.id && !event.splash);
  const extra = result.events.find((event) => event.skillId === clone.id && event.splash);
  assert.ok(primary && extra);
  assert.equal(extra.targetId, primary.targetId);
  assert.equal(extra.attackerId, primary.attackerId);
});

test("Tang's successful Wukong sequence persists across battles but squabble stats do not", () => {
  const tang = STARTING_CHARACTERS.find((entry) => entry.id === "tang");
  const skill = { ...SKILL_DATA["journey-west"], ...SKILL_DATA["journey-west"].levels[10], level: 10 };
  const run = { characterId: "tang" };
  const battle = () => {
    let rolls = 0;
    return simulateBattle([unit("tang", "ally", { ...tang, hp: 900, maxHp: 900, currentHp: 900,
      skills: [skill], atk: 300, spd: 10 }), unit("foe", "enemy", { hp: 5000, atk: 1, spd: 1 })],
    () => rolls++ < 2 ? .95 : .99, { runCharacterState: run });
  };
  const first = battle();
  assert.equal(first.events.find((event) => event.type === "summon")?.repeatedWukong, false);
  assert.equal(run.lastSuccessfulTangSummonKind, "wukong");
  const second = battle();
  const summon = second.events.find((event) => event.type === "summon");
  assert.equal(summon.repeatedWukong, true);
  assert.equal(summon.character.maxHp, 3000);
  assert.equal(summon.character.currentHp, 1500);
  assert.equal(summon.tangAtkBonus, 30);
  assert.equal(second.finalCharacters.find((entry) => entry.id === "tang").atk, 300);
});

test("ordinary enemies have no skills; Tang's base summon HP uses 900", () => {
  assert.deepEqual(CHARACTER_DATA.filter((entry) => entry.team === "enemy").map((entry) => entry.activeSkills), [[], []]);
  assert.deepEqual(["white-horse", "bajie", "shaseng", "wukong"].map((kind) => tangSummonStats(kind, {}).hp),
    [1350, 2700, 2250, 3000]);
});

test("generated paths have at least two elites and can contain consecutive fights", () => {
  let consecutive = 0;
  for (const stageId of [1, 2]) for (let seed = 0; seed < 200; seed++) {
    const map = generateRouteMap(`nov04-${stageId}-${seed}`, { stageId });
    assert.equal(validateRouteMap(map), true);
    const byId = new Map(map.nodes.map((entry) => [entry.id, entry]));
    const walk = (id, eliteCount, previousType) => {
      const node = byId.get(id);
      const next = eliteCount + (node.type === "elite" ? 1 : 0);
      if (previousType === "elite" && node.type === "elite") consecutive++;
      if (id === map.bossNodeId) { assert.ok(next >= 2); return; }
      node.nextNodeIds.forEach((child) => walk(child, next, node.type));
    };
    walk(map.startNodeId, 0, null);
  }
  assert.ok(consecutive > 0);
});
