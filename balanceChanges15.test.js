import test from "node:test";
import assert from "node:assert/strict";
import { STARTING_CHARACTERS } from "./characters.js";
import { initializeBattle, executeAttack, simulateBattle } from "./battle.js";
import { createRunCharacterState } from "./progression.js";
import { evolveTrialParty } from "./evolution.js";
import { SKILL_DATA } from "./skills.js";

const skill = (id, level = 1) => ({ ...SKILL_DATA[id], ...SKILL_DATA[id].levels[level], level });
const unit = (id, team, props = {}) => ({ id, name: id, team, row: "front", hp: 1000,
  currentHp: 1000, maxHp: 1000, atk: 100, def: 0, spd: 10, critChance: 0,
  normalDodgeRate: 0, skillDodgeRate: 0, ...props });

test("Eren gains Coordinate HP once, heals on every third Hardening, and keeps Warhammer DEF", () => {
  const eren = createRunCharacterState(STARTING_CHARACTERS.find((entry) => entry.id === "eren"));
  const originalMaxHp = eren.maxHp;
  const campaign = { trialCompleted: true, evolutionPending: true, playerId: "eren", partyIds: ["eren"], partyStates: { eren } };
  assert.equal(evolveTrialParty(campaign), true);
  assert.equal(eren.maxHp, Math.floor(originalMaxHp * 1.1) + 1000);
  assert.deepEqual(eren.extraPassiveSkillIds, ["eren-coordinate"]);
  assert.equal(evolveTrialParty(campaign), false);
  const state = initializeBattle([unit("eren", "ally", { currentHp: 500, def: 100 }), unit("foe", "enemy", { maxHp: 10000, currentHp: 10000 })]);
  state.round = 1;
  const [hero, foe] = state.characters;
  const hardening = skill("eren-hardening", 1);
  const casts = Array.from({ length: 3 }, () => executeAttack(state, hero, foe, () => .99, { skill: hardening }));
  assert.deepEqual(casts.map((event) => event.healedAmount), [0, 0, 100]);
  assert.equal(hero.currentHp, 600);
  executeAttack(state, hero, foe, () => .99, { skill: skill("eren-warhammer", 1) });
  assert.equal(hero.def, 100);
});

test("Nine Tails thresholds, lifesteal, shields, and dead teammate bonus are dynamic", () => {
  const state = initializeBattle([unit("naruto", "ally", { currentHp: 500, atk: 100,
    passiveSkillId: "naruto-nine-tails-bond", extraPassiveSkillIds: ["naruto-chakra-clones"] }),
  unit("partner", "ally", { currentHp: 400 }), unit("foe", "enemy", { maxHp: 10000, currentHp: 10000 })]);
  state.round = 1;
  const [naruto, partner, foe] = state.characters;
  const first = executeAttack(state, naruto, foe, () => .99, { skill: null });
  assert.equal(naruto.atk, 150);
  assert.equal(first.actualDamage, 150);
  assert.equal(first.nineTailsLifesteal, 37);
  assert.equal(partner.shieldHp, 30);
  partner.currentHp = 600;
  naruto.currentHp = 600;
  executeAttack(state, naruto, foe, () => .99, { skill: null });
  assert.equal(naruto.atk, 100);
  assert.equal(partner.shieldHp, 30);
  partner.currentHp = 0;
  partner.alive = false;
  executeAttack(state, naruto, foe, () => .99, { skill: null });
  assert.equal(naruto.atk, 120);
  assert.equal(partner.shieldHp, 30, "a dead teammate cannot receive a new shield or revive");
});

test("Tang protects summons after own DEF, and a summon protects low-HP evolved Tang without looping", () => {
  const state = initializeBattle([unit("tang", "ally", { def: 100, passiveSkillId: "tang-flesh" }),
    unit("summon", "ally", { summonerId: "tang" }), unit("foe", "enemy", { atk: 1000 })]);
  state.round = 1;
  const [tang, summon, foe] = state.characters;
  const hit = executeAttack(state, foe, summon, () => .99, { skill: null });
  assert.equal(hit.actualDamage, 900);
  assert.equal(summon.currentHp, 100);
  assert.equal(tang.currentHp, 950);
  assert.deepEqual([hit.trialDamage.sharedDamage.kind, hit.trialDamage.sharedDamage.amount], ["summon-protection", 50]);

  const evolved = initializeBattle([unit("tang", "ally", { currentHp: 100, passiveSkillId: "tang-compassion" }),
    unit("partner", "ally", { currentHp: 0 }), unit("summon", "ally", { summonerId: "tang" }),
    unit("foe", "enemy", { atk: 100 })]);
  evolved.round = 1;
  const [buddha, , protector, enemy] = evolved.characters;
  const lowHit = executeAttack(evolved, enemy, buddha, () => .99, { skill: null });
  assert.equal(buddha.currentHp, 100);
  assert.equal(protector.currentHp, 880);
  assert.deepEqual([lowHit.trialDamage.sharedDamage.kind, lowHit.trialDamage.sharedDamage.amount], ["compassion", 120]);
});

test("Compassion reduces partner damage and Dharma shields living allies at 70% current ATK", () => {
  const state = initializeBattle([unit("tang", "ally", { passiveSkillId: "tang-compassion" }),
    unit("partner", "ally"), unit("foe", "enemy", { atk: 100 })]);
  state.round = 1;
  const hit = executeAttack(state, state.characters[2], state.characters[1], () => .99, { skill: null });
  assert.equal(hit.actualDamage, 90);

  const battle = simulateBattle([unit("tang", "ally", { hp: 4000, maxHp: 4000, currentHp: 4000, atk: 100, spd: 100,
    passiveSkillId: "tang-compassion", skills: [skill("journey-west", 1), skill("tang-boundless-dharma", 4)] }),
    unit("partner", "ally", { hp: 4000, maxHp: 4000, currentHp: 4000, atk: 1 }),
    unit("foe", "enemy", { hp: 1500, maxHp: 1500, currentHp: 1500, atk: 1, def: 300, spd: 1 })], () => .5);
  const dharma = battle.events.find((event) => event.type === "evolution-dharma");
  assert.ok(dharma);
  const tangAtDharma = dharma.changes.find((entry) => entry.targetId === "tang" && Number.isFinite(entry.shieldHp));
  const partnerAtDharma = dharma.changes.find((entry) => entry.targetId === "partner" && Number.isFinite(entry.shieldHp));
  assert.equal(tangAtDharma.shieldHp, 77);
  assert.equal(partnerAtDharma.shieldHp, 77);
});
