import test from "node:test";
import assert from "node:assert/strict";
import { executeAttack, getCritChance, initializeBattle } from "./battle.js";
import { STARTING_CHARACTERS } from "./characters.js";
import { createAdventureEventResult, createRunCharacterState, resolveAdventureEvent } from "./progression.js";
import { TREASURE_DATA } from "./skills.js";

const unit = (id, team, extra = {}) => ({ id, name: id, team, row: "front", hp: 1000,
  maxHp: 1000, currentHp: 1000, atk: 100, def: 0, spd: 0, critChance: 0, ...extra });

test("读万卷书扣除 25% 最大 HP，抽取现有传说宝物池", () => {
  const legendary = Object.values(TREASURE_DATA).filter((item) => item.grade === "legendary").map((item) => item.id);
  const seen = new Set();
  for (let i = 0; i < legendary.length; i += 1) {
    const run = createRunCharacterState(STARTING_CHARACTERS[0]);
    createAdventureEventResult(run, "chapter1", "death_note", () => .5);
    resolveAdventureEvent(run, "chapter1", "death_temptation", () => .5);
    createAdventureEventResult(run, "chapter2", "death_note_2", () => .5);
    const before = run.maxHp;
    const result = resolveAdventureEvent(run, "chapter2", "death_read", () => (i + .5) / legendary.length);
    assert.equal(result.result.maxHpLoss, before - Math.floor(before * .75));
    assert.equal(TREASURE_DATA[result.result.treasureId]?.grade, "legendary");
    assert.ok(run.currentHp <= run.maxHp);
    seen.add(result.result.treasureId);
  }
  assert.deepEqual([...seen].sort(), [...legendary].sort());
});

test("库因克格挡以 15% 概率减免普通攻击和主动技能的 80%，每战最多三次", () => {
  const state = initializeBattle([unit("hero", "ally"), unit("target", "enemy", { quinqueGuard: true })]);
  const [attacker, target] = state.characters;
  state.round = 1;
  const normal = executeAttack(state, attacker, target, () => .1);
  const active = executeAttack(state, attacker, target, () => .1,
    { skill: { id: "test-active", type: "active", effectType: "damage", multiplier: 1 } });
  const third = executeAttack(state, attacker, target, () => .1);
  for (const event of [normal, active, third]) {
    assert.equal(event.quinqueGuardTriggered, true);
    assert.ok(event.actualDamage > 0);
    assert.equal(event.actualDamage, Math.floor(event.calculatedDamage));
  }
  assert.equal(target.quinqueGuardUses, 3);
  const fourth = executeAttack(state, attacker, target, () => .1);
  assert.equal(fourth.quinqueGuardTriggered, false);
  assert.ok(fourth.actualDamage > 0);
  const nextBattle = initializeBattle([unit("hero", "ally"), unit("target", "enemy", { quinqueGuard: true })]);
  assert.equal(nextBattle.characters[1].quinqueGuardUses, 0);
  nextBattle.round = 1;
  assert.equal(executeAttack(nextBattle, nextBattle.characters[0], nextBattle.characters[1], () => .2).quinqueGuardTriggered, false);
});

test("库因克暴击仅在 HP 严格低于 60% 时增加暴击率和暴击倍率", () => {
  const high = initializeBattle([unit("hero", "ally", { critChance: .4, quinqueCrit: true, currentHp: 600 }),
    unit("target", "enemy")]);
  const low = initializeBattle([unit("hero", "ally", { critChance: .4, quinqueCrit: true, currentHp: 599 }),
    unit("target", "enemy")]);
  high.round = low.round = 1;
  assert.ok(Math.abs(getCritChance(low.characters[0]) - getCritChance(high.characters[0]) - .3) < 1e-9);
  const highHit = executeAttack(high, high.characters[0], high.characters[1], () => .3);
  const lowHit = executeAttack(low, low.characters[0], low.characters[1], () => .3);
  assert.equal(highHit.critical, true);
  assert.equal(lowHit.critical, true);
  assert.equal(highHit.actualDamage, 150);
  assert.equal(lowHit.actualDamage, 170);
});
