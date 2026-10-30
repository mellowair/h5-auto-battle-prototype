import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { STARTING_CHARACTERS } from "./characters.js";
import { SKILL_DATA } from "./skills.js";
import { chooseTangSummon, tangSummonStats, tangSummonVisual, TANG_SUMMON_WEIGHTS } from "./tangSummons.js";
import { simulateBattle } from "./battle.js";
import { prepareBattle } from "./campaign.js";
import { createStageTwoDirectBattleCampaign, createStageTwoTestCampaign } from "./dev/stage2-config.js";

const tang = STARTING_CHARACTERS.find((unit) => unit.id === "tang");
const journey = (level) => ({ ...SKILL_DATA["journey-west"], ...SKILL_DATA["journey-west"].levels[level], level });
const enemy = (hp = 5000, atk = 1) => ({ id: "test-enemy", name: "测试敌人", team: "enemy", row: "front",
  hp, atk, def: 0, spd: 1, critChance: 0, normalDodgeRate: 0, skillDodgeRate: 0, rosterOrder: 1 });
const run = (level, roll = .9, options = {}) => simulateBattle([
  { ...tang, hp: 700, maxHp: 700, currentHp: options.hp ?? 700, passiveLevel: options.passiveLevel ?? 1,
    atk: options.atk ?? tang.atk, skills: [journey(level)], critChance: 0, rosterOrder: 0 },
  { ...enemy(options.enemyHp ?? 5000, options.enemyAtk ?? 1), def: options.enemyDef ?? 0 },
], () => roll);

test("Tang joins both selectable stages with the new landing frame and exact base stats", () => {
  assert.deepEqual([tang.hp, tang.atk, tang.def, tang.spd, tang.row], [700, 300, 30, 10, "back"]);
  for (const name of ["tang_landing", "tang_idle", "tang_meditate", "tang_skill1", "tang_death"])
    assert.ok(existsSync(new URL(`./assets/tang/${name}.png`, import.meta.url)));
  for (const kind of ["white-horse", "bajie", "shaseng", "wukong"])
    assert.ok(existsSync(new URL(`./${tangSummonVisual(kind).asset}`, import.meta.url)));
  const campaign = createStageTwoTestCampaign({ heroId: "tang", partnerId: "naruto", tangSkillLevel: 10, tangPassiveLevel: 2 });
  assert.equal(campaign.partyStates.tang.skillLevels["journey-west"], 10);
  assert.equal(campaign.partyStates.tang.passiveLevel, 2);
  assert.deepEqual(campaign.partyIds, ["tang", "naruto"]);
});

test("all ten summon weights, unique kinds, and only specified guarantees", () => {
  for (const [level, weights] of Object.entries(TANG_SUMMON_WEIGHTS)) {
    assert.equal(weights.reduce((a, b) => a + b, 0), 100, `level ${level}`);
    assert.equal(SKILL_DATA["journey-west"].levels[level].chance, 1);
    assert.equal(SKILL_DATA["journey-west"].levels[level].summonSkillChance, Number(level) / 10);
  }
  assert.deepEqual(TANG_SUMMON_WEIGHTS[10], [0, 30, 45, 25]);
  assert.equal(chooseTangSummon(2, ["white-horse"], () => .1), null);
  assert.equal(chooseTangSummon(2, ["white-horse"], () => .9), "bajie");
  assert.equal(chooseTangSummon(4, ["bajie"], () => .99), "white-horse");
  assert.equal(chooseTangSummon(7, ["shaseng"], () => .99), "bajie");
  assert.equal(chooseTangSummon(10, ["shaseng"], () => .5), null);
  assert.equal(chooseTangSummon(10, ["shaseng"], () => .95), "wukong");
});

test("summon stats use only retained run growth with the B+ inheritance caps", () => {
  const source = { maxHp: 700, currentHp: 100, atk: 300, def: 30, spd: 10 };
  assert.deepEqual(tangSummonStats("white-horse", source), { hp: 1050, atk: 150, def: 60, spd: 50 });
  assert.deepEqual(tangSummonStats("bajie", source), { hp: 2100, atk: 100, def: 75, spd: 20 });
  assert.deepEqual(tangSummonStats("shaseng", source), { hp: 1750, atk: 200, def: 90, spd: 30 });
  assert.deepEqual(tangSummonStats("wukong", source), { hp: 4300, atk: 500, def: 250, spd: 250 });
  const growthA = { maxHp: 300, atk: 100, def: 20, spd: 10 };
  const growthB = { maxHp: 800, atk: 250, def: 60, spd: 30 };
  assert.deepEqual(tangSummonStats("white-horse", { ...source, tangGrowth: growthA }), { hp: 1350, atk: 200, def: 80, spd: 60 });
  assert.deepEqual(tangSummonStats("bajie", { ...source, tangGrowth: growthA }), { hp: 2400, atk: 133, def: 95, spd: 30 });
  assert.deepEqual(tangSummonStats("shaseng", { ...source, tangGrowth: growthA }), { hp: 2050, atk: 266, def: 110, spd: 40 });
  assert.deepEqual(tangSummonStats("white-horse", { ...source, tangGrowth: growthB }), { hp: 1850, atk: 275, def: 120, spd: 80 });
  assert.deepEqual(tangSummonStats("bajie", { ...source, tangGrowth: growthB }), { hp: 2900, atk: 183, def: 135, spd: 50 });
  assert.deepEqual(tangSummonStats("shaseng", { ...source, tangGrowth: growthB }), { hp: 2550, atk: 366, def: 150, spd: 60 });
  assert.deepEqual(tangSummonStats("wukong", { ...source, tangGrowth: growthB }), { hp: 4300, atk: 500, def: 250, spd: 250 });
  assert.equal(tangSummonStats("bajie", { ...source, tangGrowth: growthA, defenseBuff: 20, currentRound: 2, shieldHp: 100 }).def, 95);
});

test("battle preparation excludes short combat buffs and current HP loss from Tang summon growth", () => {
  const campaign = createStageTwoDirectBattleCampaign({ heroId: "tang", partnerId: "naruto", encounterId: "boros" });
  const state = campaign.partyStates.tang;
  state.currentHp = 200;
  state.temporaryEffects.push({ sourceId: "test-def-buff", stat: "def", amount: 40, battlesRemaining: 1 });
  const rosterTang = prepareBattle(campaign).roster.find((unit) => unit.id === "tang");
  assert.deepEqual(rosterTang.tangGrowth, { maxHp: 500, atk: 50, def: 40, spd: 20 });
  assert.equal(rosterTang.currentHp, 200);
  assert.equal(rosterTang.def, 110);
  assert.deepEqual(tangSummonStats("white-horse", rosterTang), { hp: 1550, atk: 175, def: 100, spd: 70 });
});

test("successful summon meditates, acts independently from next speed order, and strikes every third later round", () => {
  const result = run(1);
  assert.equal(result.events.filter((event) => event.type === "summon").length, 1);
  const summon = result.events.find((event) => event.type === "summon");
  assert.equal(summon.character.name, "白龙马");
  assert.equal(summon.character.row, "front");
  assert.ok(result.events.some((event) => event.attackerId === summon.character.id && event.round === 2));
  const special = result.events.filter((event) => event.skillId === "tang-meditation-strike");
  assert.deepEqual(special.slice(0, 2).map((event) => event.round), [4, 7]);
  assert.ok(result.events.every((event) => event.type !== "attack" || event.attackerId !== "tang" || event.skillId === "tang-meditation-strike"));
});

test("Tang Flesh level two heals from actual summon damage and level one does not", () => {
  const level1 = run(1, .9, { hp: 200, enemyHp: 1000 });
  const level2 = run(1, .9, { hp: 200, enemyHp: 1000, passiveLevel: 2 });
  assert.ok(level1.events.filter((event) => event.attackerId?.startsWith("tang-white-horse") && event.type === "attack")
    .every((event) => event.summonerHealedAmount === 0));
  assert.ok(level2.events.some((event) => event.summonerHealedAmount > 0 && event.summonerId === "tang"));
  assert.ok(level2.finalCharacters.find((unit) => unit.id === "tang").currentHp <= 700);
});

test("Wukong charges, protects Tang for one round, then deals 0.9 times combined ATK as true damage", () => {
  const result = run(10, .95, { enemyHp: 4000 });
  assert.equal(result.events.find((event) => event.type === "summon")?.character.name, "孙悟空");
  assert.equal(result.events.find((event) => event.type === "summon")?.character.maxHp, 4300);
  assert.ok(result.events.some((event) => event.type === "wukong-charge" && event.round === 2 && event.reductionRound === 3
    && event.summonerId === "tang" && event.defenseBonus === 80 && event.defenseDurationRounds === 1 && event.defenseUntilRound === 2));
  assert.ok(result.events.some((event) => event.skillId === "wukong-fate" && event.round === 3 && event.trueDamage && event.damage === 720));
  assert.ok(run(10, .95, { enemyHp: 5000, atk: 420 }).events.some((event) => event.skillId === "wukong-fate" && event.damage === 828));
  assert.ok(run(10, .95, { enemyHp: 5000, enemyDef: 1000 }).events.some((event) => event.skillId === "wukong-fate" && event.trueDamage && event.damage === 720));
  assert.ok(result.events.some((event) => event.wukongTeleportAttack && event.skillId === "wukong-fate"));
  const frames = tangSummonVisual("wukong").animations;
  for (const path of [frames.charge.frames.charge, frames.skillAttack.frames.teleport, frames.skillAttack.frames.strike, frames.death.frames.down])
    assert.ok(existsSync(new URL(`./${path}`, import.meta.url)), path);
});

test("Wukong's Tang DEF buff affects only the charge round, then expires", () => {
  let rolls = 0;
  const result = simulateBattle([
    { ...tang, hp: 2000, maxHp: 2000, currentHp: 2000, row: "front", skills: [], skill: null,
      critChance: 0, normalDodgeRate: 0, rosterOrder: 0 },
    { id: "wukong-test", name: "孙悟空", team: "ally", row: "back", summonerId: "tang",
      tangSummonKind: "wukong", hp: 4300, atk: 500, def: 250, spd: 250, critChance: 0,
      skills: [{ ...SKILL_DATA["wukong-fate"], ...SKILL_DATA["wukong-fate"].levels[1], chance: .5, level: 1 }], rosterOrder: 1 },
    { ...enemy(10000, 260), def: 1000, rosterOrder: 2 },
  ], () => ++rolls === 1 ? 0 : .99);
  const hits = result.events.filter((event) => event.type === "attack" && event.attackerId === "test-enemy" && event.targetId === "tang");
  assert.deepEqual(hits.slice(0, 3).map((event) => [event.round, event.damage]), [[1, 98], [2, 160], [3, 160]]);
});
