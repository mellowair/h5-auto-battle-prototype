import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { ELITE_ENEMY_DATA, EVENT_ENEMY_DATA, STAGE_THREE_BOSS_DATA, STAGE_THREE_MINIONS, STARTING_CHARACTERS } from "./characters.js";
import { executeAttack, getCritChance, initializeBattle, isBattleOver, resolveStageThreeDeaths, simulateBattle, stageThreeRoundStart } from "./battle.js";
import { getStageThreeNormalEnemyStats, prepareBattle } from "./campaign.js";
import { createStageThreeTestCampaign } from "./dev/stage3-config.js";
import { applyAdventurePartyOutcome, createAdventureEventResult, createRunCharacterState, getAvailableAdventureEventIds, grantQuinque, resolveAdventureEvent } from "./progression.js";
import { SKILL_DATA } from "./skills.js";

const hero = (id = "hero") => ({ id, name: id, team: "ally", row: "front", hp: 2000, atk: 200, def: 100,
  spd: 100, rosterOrder: id === "hero" ? 0 : 1 });
const elite = (id) => ({ ...ELITE_ENEMY_DATA.find((unit) => unit.id === id), rosterOrder: id === "shin" ? 2 : 3 });

test("Shin and Noi have their own transparent fallen frames", () => {
  for (const id of ["shin", "noi"]) {
    const unit = elite(id);
    const fallen = unit.animations.fallen.frames.down;
    assert.ok(existsSync(new URL(fallen, import.meta.url)), fallen);
    assert.notEqual(fallen, unit.asset);
  }
});

test("Makima and follower panels use the updated base DEF in both summon waves", () => {
  const expected = {
    "makima-bomb": [1900, 135], "flamethrower-devil": [2500, 135],
    "katana-devil": [2400, 155], quanxi: [2400, 105],
  };
  for (const [id, stats] of Object.entries(expected))
    assert.deepEqual([STAGE_THREE_MINIONS[id].hp, STAGE_THREE_MINIONS[id].def], stats);
  assert.equal(STAGE_THREE_BOSS_DATA.hp, 3700);
  assert.equal(STAGE_THREE_BOSS_DATA.def, 160);
  assert.deepEqual([elite("shin").hp, elite("shin").atk, elite("shin").def], [2500, 600, 160]);
  assert.deepEqual([elite("noi").hp, elite("noi").atk, elite("noi").def], [3000, 260, 160]);
  const campaign = createStageThreeTestCampaign({ heroId: "naruto", partnerId: "eren", opponent: "makima" });
  const prepared = prepareBattle(campaign);
  for (const id of ["makima-bomb", "flamethrower-devil"]) {
    const unit = prepared.roster.find((entry) => entry.id === id);
    assert.deepEqual([unit.maxHp, unit.currentHp, unit.def], [expected[id][0], expected[id][0], expected[id][1]]);
  }
  const state = initializeBattle(prepared.roster, prepared.combatOptions);
  const boss = state.characters.find((unit) => unit.id === "makima");
  boss.currentHp = Math.floor(boss.maxHp / 2) - 1;
  const summons = resolveStageThreeDeaths(state, []).filter((event) => event.type === "summon");
  assert.deepEqual(summons.map((event) => event.character.id), ["katana-devil", "quanxi"]);
  for (const { character } of summons)
    assert.deepEqual([character.maxHp, character.currentHp, character.def],
      [expected[character.id][0], expected[character.id][0], expected[character.id][1]]);
});

test("third-stage ordinary stats use local 1/7/13 tiers without route growth", () => {
  assert.deepEqual(getStageThreeNormalEnemyStats("guard", 1), { hp: 2400, atk: 250, def: 140, spd: 75 });
  assert.deepEqual(getStageThreeNormalEnemyStats("mage", 7), { hp: 2100, atk: 390, def: 120, spd: 100 });
  assert.deepEqual(getStageThreeNormalEnemyStats("guard", 13), { hp: 3200, atk: 370, def: 180, spd: 95 });
  assert.deepEqual(getStageThreeNormalEnemyStats("mage", 13), { hp: 2400, atk: 460, def: 140, spd: 110 });
});

test("Makima's fire and katana followers add one status stack per landed hit", () => {
  const state = initializeBattle([hero(), STAGE_THREE_MINIONS["flamethrower-devil"], STAGE_THREE_MINIONS["katana-devil"]]);
  state.round = 1;
  const target = state.characters.find((unit) => unit.id === "hero");
  const fire = state.characters.find((unit) => unit.id === "flamethrower-devil");
  const katana = state.characters.find((unit) => unit.id === "katana-devil");
  for (const stacks of [1, 2]) {
    const hit = executeAttack(state, fire, target, () => .99, { skill: null });
    assert.ok(hit.actualDamage > 0);
    assert.equal(hit.burnStacksApplied, 1);
    assert.equal(hit.bleedStacksApplied, 0);
    assert.equal(target.burnStacks, stacks);
  }
  for (const stacks of [1, 2]) {
    const hit = executeAttack(state, katana, target, () => .99, { skill: null });
    assert.ok(hit.actualDamage > 0);
    assert.equal(hit.burnStacksApplied, 0);
    assert.equal(hit.bleedStacksApplied, 1);
    assert.equal(target.burnStacks, 2);
    assert.equal(target.bleedStacks, stacks);
  }
});

test("Makima summons once below half, counts true deaths, controls only partner once, and fires Bang on round four", () => {
  const state = initializeBattle([hero(), hero("partner"), STAGE_THREE_BOSS_DATA,
    ...["makima-bomb", "flamethrower-devil"].map((id) => STAGE_THREE_MINIONS[id])], { playerId: "hero" });
  state.round = 2;
  const boss = state.characters.find((unit) => unit.id === "makima");
  boss.currentHp = 1850;
  assert.equal(resolveStageThreeDeaths(state, []).length, 0);
  boss.currentHp = 1849;
  const summoned = resolveStageThreeDeaths(state, []);
  assert.deepEqual(summoned.map((event) => event.character.id), ["katana-devil", "quanxi"]);
  assert.equal(resolveStageThreeDeaths(state, []).length, 0);
  const control = stageThreeRoundStart(state, () => 0);
  assert.equal(control.find((event) => event.type === "stage3-control")?.targetId, "partner");
  assert.equal(state.characters.find((unit) => unit.id === "partner").team, "enemy");
  state.round = 3;
  assert.equal(stageThreeRoundStart(state, () => 0).some((event) => event.type === "stage3-control-end"), false);
  assert.equal(state.characters.find((unit) => unit.id === "partner").team, "enemy");
  const minion = state.characters.find((unit) => unit.id === "makima-bomb");
  minion.currentHp = 0; minion.alive = false;
  assert.equal(resolveStageThreeDeaths(state, []).filter((event) => event.type === "stage3-minion-death").length, 1);
  assert.equal(boss.atk, 400);
  assert.equal(resolveStageThreeDeaths(state, []).length, 0);
  state.round = 4;
  const roundFour = stageThreeRoundStart(state, () => .99);
  assert.equal(roundFour.filter((event) => event.type === "stage3-control-end").length, 1);
  assert.equal(state.characters.find((unit) => unit.id === "partner").team, "ally");
  assert.equal(roundFour.filter((event) => event.type === "stage3-control").length, 0);
  const bang = roundFour.find((event) => event.skillId === "makima-bang");
  assert.equal(bang.round, 4);
  assert.equal(bang.bangBaseDamage, 160);
  assert.ok(bang.actualDamage > 0);
  for (const id of ["flamethrower-devil", "katana-devil", "quanxi"]) {
    const unit = state.characters.find((entry) => entry.id === id);
    unit.currentHp = 0; unit.alive = false;
  }
  const deaths = resolveStageThreeDeaths(state, []);
  assert.equal(deaths.filter((event) => event.type === "stage3-minion-death").length, 3);
  assert.equal(deaths.filter((event) => event.type === "stage3-lifesteal").length, 1);
  assert.equal(deaths.filter((event) => event.type === "stage3-minion-wipe-stun").length, 1);
  assert.deepEqual(deaths.find((event) => event.type === "stage3-minion-wipe-stun").targetIds, ["hero", "partner"]);
  assert.equal(state.characters.find((unit) => unit.id === "hero").stunNextAction, true);
  assert.equal(state.characters.find((unit) => unit.id === "partner").stunNextAction, true);
  assert.equal(boss.atk, 850);
  assert.equal(boss.lifesteal, .25);
  assert.equal(resolveStageThreeDeaths(state, []).some((event) => event.type === "stage3-minion-wipe-stun"), false);
  state.round = 5;
  assert.equal(stageThreeRoundStart(state, () => .99).find((event) => event.skillId === "makima-bang")?.bangBaseDamage, 425);
});

test("Makima's dismissed minions do not grant attack, and control never selects a summoned ally", () => {
  const state = initializeBattle([hero(), { ...hero("partner"), currentHp: 0 },
    { ...hero("ally-summon"), summonerId: "hero", rosterOrder: 2 },
    STAGE_THREE_BOSS_DATA, STAGE_THREE_MINIONS["makima-bomb"]], { playerId: "hero" });
  state.round = 2;
  assert.equal(stageThreeRoundStart(state, () => 0).some((event) => event.type === "stage3-control"), false);
  const boss = state.characters.find((unit) => unit.id === "makima");
  boss.currentHp = 0; boss.alive = false;
  const events = resolveStageThreeDeaths(state, []);
  assert.equal(events.filter((event) => event.type === "summon-dismissed").length, 1);
  assert.equal(events.some((event) => event.type === "stage3-minion-death"), false);
  assert.equal(state.makima.deadMinions.length, 0);
  assert.equal(boss.atk, 250);
});

test("Makima's angel clears active skill buffs without removing a permanent reward", () => {
  const state = initializeBattle([{ ...hero(), quinqueGuard: true, defenseBuff: 30, defenseBuffUntilRound: 5,
    dodgeRateBonus: .05 }, hero("partner"), STAGE_THREE_BOSS_DATA], { playerId: "hero" });
  state.round = 3;
  const events = stageThreeRoundStart(state, () => .99);
  const target = state.characters.find((unit) => unit.id === "hero");
  assert.ok(events.some((event) => event.type === "stage3-buff-clear" && event.targetId === "hero"));
  assert.equal(target.defenseBuff, 0);
  assert.equal(target.quinqueGuard, true);
  assert.equal(target.dodgeRateBonus, .05);
});

test("a complete Makima battle ends when the Boss falls and dismisses remaining followers", () => {
  const strong = (id) => ({ ...hero(id), hp: 12000, atk: 5000, def: 1000, spd: 1000 });
  const result = simulateBattle([strong("hero"), strong("partner"), STAGE_THREE_BOSS_DATA,
    STAGE_THREE_MINIONS["makima-bomb"], STAGE_THREE_MINIONS["flamethrower-devil"]], () => .99,
  { playerId: "hero" });
  assert.equal(result.outcome, "victory");
  assert.equal(result.finalCharacters.find((unit) => unit.id === "makima").alive, false);
  assert.equal(result.finalCharacters.filter((unit) => unit.stageThreeMinion && unit.alive).length, 0);
  assert.equal(result.events.filter((event) => event.type === "battle-end").length, 1);
});

test("Shin and Noi each revive once after four rounds regardless of the partner's state", () => {
  const state = initializeBattle([hero(), elite("shin"), elite("noi")]);
  state.round = 2;
  const shin = state.characters.find((unit) => unit.id === "shin");
  const noi = state.characters.find((unit) => unit.id === "noi");
  shin.currentHp = 0; shin.alive = false;
  const pending = resolveStageThreeDeaths(state, []);
  assert.equal(pending[0].reviveAtRound, 6);
  assert.equal(noi.atk, elite("noi").atk * 2);
  assert.equal(noi.def, elite("noi").def + 100);
  assert.equal(noi.bereavementActive, true);
  assert.equal(noi.bereavementSourceId, "shin");
  assert.equal(resolveStageThreeDeaths(state, []).filter((event) => event.type === "stage3-bereavement").length, 0);
  state.round = 3;
  assert.equal(stageThreeRoundStart(state).some((event) => event.type === "stage3-revive"), false);
  state.round = 5;
  assert.equal(stageThreeRoundStart(state).some((event) => event.type === "stage3-revive"), false);
  state.round = 6;
  assert.equal(stageThreeRoundStart(state).find((event) => event.type === "stage3-revive").hpAfter, 1000);
  assert.equal(noi.atk, elite("noi").atk);
  assert.equal(noi.def, elite("noi").def);
  assert.equal(noi.bereavementActive, false);
  assert.equal(noi.bereavementSourceId, null);
  const again = (() => { shin.currentHp = 0; shin.alive = false; return resolveStageThreeDeaths(state, []); })();
  assert.equal(again.some((event) => event.type === "stage3-revive-pending"), false);
  assert.equal(noi.def, elite("noi").def);
  noi.currentHp = 0; noi.alive = false;
  const noiPending = resolveStageThreeDeaths(state, []);
  assert.equal(shin.reviveAtRound, null);
  assert.equal(noiPending.find((event) => event.type === "stage3-revive-pending")?.reviveAtRound, 10);
  assert.equal(isBattleOver(state), null);
  state.round = 10;
  assert.equal(stageThreeRoundStart(state).find((event) => event.type === "stage3-revive")?.hpAfter, 1200);
  noi.currentHp = 0; noi.alive = false;
  assert.equal(resolveStageThreeDeaths(state, []).some((event) => event.type === "stage3-revive-pending"), false);
  assert.equal(isBattleOver(state), "victory");
  const reverse = initializeBattle([hero(), elite("shin"), elite("noi")]);
  reverse.round = 2;
  const reverseShin = reverse.characters.find((unit) => unit.id === "shin");
  const reverseNoi = reverse.characters.find((unit) => unit.id === "noi");
  reverseNoi.currentHp = 0; reverseNoi.alive = false;
  resolveStageThreeDeaths(reverse, []);
  assert.equal(reverseShin.atk, elite("shin").atk * 2);
  assert.equal(reverseShin.def, elite("shin").def + 100);
  const battle = simulateBattle([{ ...hero(), atk: 10000, spd: 1000 }, elite("shin"), elite("noi")], () => .99);
  assert.equal(battle.outcome, "victory");
});

test("Shin and Noi still revive when both fall in the same round", () => {
  const state = initializeBattle([hero(), elite("shin"), elite("noi")]);
  state.round = 2;
  for (const unit of state.characters.filter((entry) => ["shin", "noi"].includes(entry.id))) {
    unit.currentHp = 0;
    unit.alive = false;
  }
  const pending = resolveStageThreeDeaths(state, []);
  assert.deepEqual(pending.filter((event) => event.type === "stage3-revive-pending").map((event) => event.targetId), ["shin", "noi"]);
  assert.equal(isBattleOver(state), null);
  state.round = 6;
  assert.deepEqual(stageThreeRoundStart(state).filter((event) => event.type === "stage3-revive").map((event) => event.targetId), ["shin", "noi"]);
  for (const unit of state.characters.filter((entry) => ["shin", "noi"].includes(entry.id))) {
    unit.currentHp = 0;
    unit.alive = false;
  }
  assert.equal(resolveStageThreeDeaths(state, []).some((event) => event.type === "stage3-revive-pending"), false);
  assert.equal(isBattleOver(state), "victory");
});

test("Arima counts separate landed hits, pierces after three, and Quinque blocks only normal attacks", () => {
  const state = initializeBattle([hero(), { ...hero("partner"), row: "back" }, EVENT_ENEMY_DATA.arima]);
  state.round = 1;
  const arima = state.characters.find((unit) => unit.id === "arima");
  const target = state.characters.find((unit) => unit.id === "hero");
  const first = executeAttack(state, arima, target, () => .99);
  assert.equal(first.damage, 250);
  assert.equal(first.arimaHitCount, 1);
  executeAttack(state, arima, target, () => .99);
  const third = executeAttack(state, arima, target, () => .99);
  assert.equal(third.arimaHitCount, 3);
  assert.equal(third.arimaWeaknessRevealed, true);
  target.currentHp = target.maxHp;
  const fourth = executeAttack(state, arima, target, () => .99);
  assert.equal(fourth.damage, 416);
  assert.equal(fourth.arimaHitCount, 4);
  assert.equal(fourth.arimaWeaknessRevealed, false);
  assert.equal(arima.arimaHits.partner, undefined);
  arima.currentHp = 2000;
  assert.equal(getCritChance(arima), .35);
  assert.equal(SKILL_DATA["arima-pierce"].levels[1].chance, .4);
  const guarded = initializeBattle([{ ...hero(), quinqueGuard: true }, { ...elite("shin"), skills: [], skill: null }]);
  const rolls = [.99, .99, 0];
  const hit = executeAttack(guarded, guarded.characters[1], guarded.characters[0], () => rolls.shift() ?? .99);
  assert.equal(hit.attackGuard, true);
  assert.ok(hit.damage > 0);
  const awakening = initializeBattle([{ ...hero(), atk: 200 }, EVENT_ENEMY_DATA.arima]);
  awakening.round = 1;
  const awakenedArima = awakening.characters[1];
  awakenedArima.currentHp = Math.ceil(awakenedArima.maxHp * .6) + 1;
  const thresholdHit = executeAttack(awakening, awakening.characters[0], awakenedArima, () => .99);
  assert.equal(thresholdHit.arimaCritAwakened, true);
  assert.equal(executeAttack(awakening, awakening.characters[0], awakenedArima, () => .99).arimaCritAwakened, false);
});

test("Anteiku final stays in stage three, applies one shared run penalty and grants one Quinque", () => {
  const template = STARTING_CHARACTERS.find((unit) => unit.id === "naruto");
  const lead = createRunCharacterState(template, template.activeSkills[0]);
  const partner = createRunCharacterState(STARTING_CHARACTERS.find((unit) => unit.id === "eren"), "eren-free-will");
  lead.eventSeries.anteiku = { chapter1Completed: true, chapter2Completed: true };
  assert.equal(getAvailableAdventureEventIds(lead, 12, [lead, partner], 2).includes("anteiku_3"), false);
  assert.equal(getAvailableAdventureEventIds(lead, 12, [lead, partner], 3).includes("anteiku_3"), true);
  createAdventureEventResult(lead, "third-cafe", "anteiku_3", () => .5, [lead, partner], 3);
  const before = { leadHp: lead.maxHp, leadAtk: lead.atk, partnerHp: partner.maxHp, partnerAtk: partner.atk };
  const result = resolveAdventureEvent(lead, "third-cafe", "anteiku_weapon");
  assert.equal(result.result.weaponPenalty, true);
  assert.equal(applyAdventurePartyOutcome(partner, lead.eventResults["third-cafe"]), true);
  assert.equal(lead.maxHp, Math.floor(before.leadHp * .7));
  assert.equal(lead.atk, Math.floor(before.leadAtk * .7));
  assert.equal(partner.maxHp, Math.floor(before.partnerHp * .7));
  assert.equal(partner.atk, Math.floor(before.partnerAtk * .7));
  assert.equal(applyAdventurePartyOutcome(partner, lead.eventResults["third-cafe"]), false);
  assert.equal(grantQuinque(partner, "arima-win", "quinque_crit")?.id, "quinque_crit");
  assert.equal(grantQuinque(partner, "arima-win", "quinque_guard"), false);
});

test("angel clears actual skill bonuses at rounds 3, 7, 11 while preserving permanent stats", () => {
  const state = initializeBattle([{ ...hero("kaneki"), hp: 2500, maxHp: 2500, currentHp: 2500,
    atk: 200, def: 100, critRateBonus: .05, dodgeRateBonus: .04,
    lifesteal: .2, damageReductionBonus: .1, passiveSkillId: "kaneki-one-eye-king" },
    STAGE_THREE_BOSS_DATA], { playerId: "kaneki" });
  state.makima.controlledOnce = true;
  state.makima.nextBangRound = 99;
  const target = state.characters[0];
  const grantSkillBonuses = () => {
    target.atk += 50; target.battleAttackBonus += 50;
    target.defenseBuff = 30; target.defenseBuffUntilRound = Infinity;
    target.critRateBonus += .6; target.oneEyeKingCritRateBonus = .6;
    target.oneEyeKingEmergencyUsed = true; target.oneEyeKingUntilRound = 15;
    target.reactiveCritDamageBonus = .08; target.shieldHp = 100;
  };
  grantSkillBonuses();
  for (const round of [2, 3, 6, 7, 11]) {
    state.round = round;
    const result = stageThreeRoundStart(state, () => .99);
    const clear = result.find((event) => event.type === "stage3-buff-clear" && event.targetId === "kaneki");
    if (round === 2 || round === 6) {
      assert.equal(clear, undefined);
      assert.equal(target.atk, 250);
    } else {
      assert.ok(clear);
      assert.deepEqual([target.atk, target.def, target.maxHp, target.defenseBuff,
        target.critRateBonus, target.reactiveCritDamageBonus, target.shieldHp],
      [200, 100, 2500, 0, .05, 0, 0]);
      assert.deepEqual([target.dodgeRateBonus, target.lifesteal, target.damageReductionBonus], [.04, .2, .1]);
      assert.equal(target.oneEyeKingEmergencyUsed, true, "once-per-battle activation remains consumed");
      assert.equal(clear.buffState.atk, 200);
      if (round < 11) grantSkillBonuses();
    }
  }
});

test("angel also clears buffs from a controlled ally and a player summon", () => {
  const controlled = { ...hero("partner"), atk: 250, battleAttackBonus: 50 };
  const summon = { ...hero("summon"), summonerId: "partner", originalTeam: "ally", atk: 230,
    battleAttackBonus: 30 };
  const state = initializeBattle([hero(), controlled, summon, STAGE_THREE_BOSS_DATA], { playerId: "hero" });
  state.makima.controlledOnce = true;
  state.makima.controlledId = "partner";
  state.makima.controlEndsAtRound = 9;
  state.makima.nextBangRound = 99;
  for (const unit of state.characters.filter((entry) => ["partner", "summon"].includes(entry.id))) {
    unit.team = "enemy"; unit.controlledByMakima = true;
    unit.battleAttackBonus = unit.id === "partner" ? 50 : 30;
  }
  state.round = 3;
  const events = stageThreeRoundStart(state, () => .99);
  assert.deepEqual(events.filter((event) => event.type === "stage3-buff-clear").map((event) => event.targetId),
    ["hero", "partner", "summon"]);
  assert.equal(state.characters.find((unit) => unit.id === "partner").atk, 200);
  assert.equal(state.characters.find((unit) => unit.id === "summon").atk, 200);
  assert.equal(state.characters.find((unit) => unit.id === "partner").team, "enemy");
});
