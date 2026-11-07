import test from "node:test";
import assert from "node:assert/strict";
import { STARTING_CHARACTERS, TRIAL_ENEMY_DATA } from "./characters.js";
import { executeAttack, initializeBattle, simulateBattle } from "./battle.js";
import { advanceStageTransition, beginJourney, beginStageThree, chooseRoute, chooseTrialNode, createCampaign,
  enterTrialMap, finishBattle, getRouteOptions, getStageTransitionChoices, getStageThreeNormalEnemyStats, prepareBattle, resolveTrialOffer,
  resolveTrialWill, selectStartingCharacter, startCampaign } from "./campaign.js";
import { createRunCharacterState } from "./progression.js";
import { completeTrialTask, createTrialState, odinWeakestPointStat, pickTrialEnemies, startTrialTask } from "./trial.js";

function stageThree(seed = 19) {
  const campaign = createCampaign(() => .3, { seed });
  startCampaign(campaign);
  const hero = STARTING_CHARACTERS.find((entry) => entry.id === "naruto");
  const partner = STARTING_CHARACTERS.find((entry) => entry.id === "eren");
  campaign.candidateIds = [hero.id, partner.id];
  assert.ok(selectStartingCharacter(campaign, hero.id, hero.activeSkills[0]));
  beginJourney(campaign);
  campaign.partyIds = [hero.id, partner.id];
  campaign.partyStates[partner.id] = createRunCharacterState(partner, partner.activeSkills[0]);
  campaign.stageId = 2;
  campaign.status = "stage_transition";
  campaign.stageTransition = { phase: "stage2_interlude" };
  assert.equal(beginStageThree(campaign), "route");
  return campaign;
}

function enterTrial(campaign, order = ["will", "strength", "wisdom"]) {
  const first = getRouteOptions(campaign);
  assert.ok(first.some((node) => node.type === "question"));
  assert.ok(first.every((node) => node.type === "question"), "ordinary stage-three combat is not open yet");
  const question = first.find((node) => node.type === "question");
  assert.equal(chooseRoute(campaign, question.id).event.eventId, "trial_land");
  assert.equal(resolveTrialOffer(campaign, "trial_accept").status, "trial_intro");
  campaign.trial.order = [...order];
  assert.equal(enterTrialMap(campaign), true);
}

test("Odin ties use HP, ATK, DEF, SPD choice order, not gained values", () => {
  assert.equal(odinWeakestPointStat({ maxHp: 2, atk: 2, def: 2, spd: 2 }), "maxHp");
  assert.equal(odinWeakestPointStat({ maxHp: 0, atk: 3, def: 3, spd: 3 }), "atk");
  assert.equal(odinWeakestPointStat({ maxHp: 0, atk: 0, def: 4, spd: 4 }), "def");
  assert.equal(odinWeakestPointStat({ maxHp: 0, atk: 0, def: 0, spd: 1 }), "spd");
});

test("first stage-three playable room forces trial, then decline opens the normal route", () => {
  for (let seed = 0; seed < 100; seed += 1) {
    const campaign = stageThree(seed);
    const options = getRouteOptions(campaign);
    assert.ok(options.length > 0, `seed ${seed} has a trial entry`);
    assert.ok(options.every((node) => node.type === "question"));
    assert.equal(chooseRoute(campaign, options[0].id).event.eventId, "trial_land");
    assert.equal(resolveTrialOffer(campaign, "trial_decline").status, "route");
    assert.ok(getRouteOptions(campaign).length > 0);
    assert.ok(getRouteOptions(campaign).every((node) => node.status === "pending"));
  }
});

test("trial map keeps a stable display order and finishes after two wins", () => {
  const orders = new Set();
  for (const first of [0, .4, .8]) for (const second of [0, .8]) {
    const rolls = [first, second];
    const trial = createTrialState(() => rolls.shift() ?? 0);
    orders.add(trial.order.join(","));
    assert.equal(new Set(trial.order).size, 3);
    assert.equal(startTrialTask(trial), trial.order[0]);
    assert.equal(completeTrialTask(trial, trial.order[0]).status, "active");
    assert.equal(startTrialTask(trial), trial.order[1]);
    assert.equal(completeTrialTask(trial, trial.order[1]).status, "completed");
    assert.equal(startTrialTask(trial), null);
  }
  assert.equal(orders.size, 6);
});

test("the player may select any pending trial next and cannot start one twice", () => {
  const campaign = stageThree();
  enterTrial(campaign, ["will", "strength", "wisdom"]);
  assert.equal(chooseTrialNode(campaign, "wisdom").battle.enemies[0], "odin");
  const first = prepareBattle(campaign);
  const allies = first.roster.filter((unit) => unit.team === "ally");
  finishBattle(campaign, "victory", allies[0].currentHp, [], allies);
  assert.equal(campaign.status, "trial_route");
  assert.equal(chooseTrialNode(campaign, "wisdom"), false);
  assert.equal(chooseTrialNode(campaign, "strength").battle.enemies[0], "heracles");
  const second = prepareBattle(campaign);
  const survivors = second.roster.filter((unit) => unit.team === "ally");
  finishBattle(campaign, "victory", survivors[0].currentHp, [], survivors);
  assert.equal(campaign.trial.status, "completed");
  assert.deepEqual([campaign.trial.tasks.wisdom, campaign.trial.tasks.strength, campaign.trial.tasks.will],
    ["completed", "completed", "pending"]);
});

test("stage-two clear grants each party member one skill choice and three stat point choices", () => {
  const campaign = stageThree();
  campaign.stageId = 2;
  campaign.status = "stage_transition";
  campaign.stageTransition = { phase: "stage2_skill", memberIndex: 0, statIndex: 0 };
  for (const id of campaign.partyIds) {
    const offer = getStageTransitionChoices(campaign);
    assert.equal(offer.characterId, id);
    assert.ok(advanceStageTransition(campaign, offer.skillIds[0]));
  }
  assert.equal(campaign.stageTransition.phase, "stage2_stat");
  for (const id of campaign.partyIds) {
    for (let point = 0; point < 3; point += 1) {
      const offer = getStageTransitionChoices(campaign);
      assert.equal(offer.characterId, id);
      assert.ok(advanceStageTransition(campaign, offer.offer.choices[0]));
    }
    assert.equal(Object.values(campaign.partyStates[id].statPointChoices).reduce((sum, count) => sum + count, 0), 3);
  }
  assert.equal(campaign.stageTransition.phase, "stage2_interlude");
});

test("two completed trial bosses exit immediately, leaving the third node untouched", () => {
  const campaign = stageThree();
  enterTrial(campaign, ["strength", "wisdom", "will"]);
  const routeNodeId = campaign.routeMap.currentNodeId;
  assert.deepEqual(JSON.parse(JSON.stringify(campaign.trial)).order, ["strength", "wisdom", "will"]);
  for (const taskId of ["strength", "wisdom"]) {
    assert.equal(chooseTrialNode(campaign).battle.enemies[0], taskId === "strength" ? "heracles" : "odin");
    const prepared = prepareBattle(campaign);
    const allies = prepared.roster.filter((unit) => unit.team === "ally");
    finishBattle(campaign, "victory", allies[0].currentHp, [], allies);
  }
  assert.equal(campaign.trial.status, "completed");
  assert.equal(campaign.trial.completedCount, 2);
  assert.equal(campaign.trial.tasks.will, "pending");
  assert.equal(campaign.status, "trial_result");
  assert.equal(campaign.trialCompleted, true);
  assert.equal(campaign.evolutionPending, true);
  assert.equal(campaign.routeMap.currentNodeId, routeNodeId);
  assert.equal(chooseTrialNode(campaign), false);
});

test("a completed trial challenge heals each member by 25% max HP before the next challenge", () => {
  const campaign = stageThree();
  enterTrial(campaign, ["strength", "wisdom", "will"]);
  chooseTrialNode(campaign);
  const prepared = prepareBattle(campaign);
  const allies = prepared.roster.filter((unit) => unit.team === "ally").map((unit, index) => ({
    ...unit, currentHp: index === 0 ? 1 : 0, alive: index === 0,
  }));
  const result = finishBattle(campaign, "victory", 1, [], allies);
  assert.equal(result.status, "trial_route");
  for (const [index, id] of campaign.partyIds.entries()) {
    assert.equal(campaign.partyStates[id].currentHp, (index === 0 ? 1 : 0) + Math.floor(campaign.partyStates[id].maxHp * .25));
    assert.equal(campaign.lastBattleRecovery.find((item) => item.characterId === id)?.kind, "trial_quarter_heal");
  }
  assert.equal(finishBattle(campaign, "victory", 1, [], allies), false);
  chooseTrialNode(campaign);
  const next = prepareBattle(campaign);
  assert.deepEqual(next.roster.filter((unit) => unit.team === "ally").map((unit) => unit.currentHp),
    campaign.partyIds.map((id) => campaign.partyStates[id].currentHp));
});

test("each eternal-shackles battle draws one front and one back enemy at 80% of stage-three row stats", () => {
  const campaign = stageThree();
  enterTrial(campaign);
  assert.equal(chooseTrialNode(campaign).taskId, "will");
  assert.equal(resolveTrialWill(campaign, "will_accept").type, "battle");
  const previous = [];
  for (let battle = 0; battle < 3; battle += 1) {
    const prepared = prepareBattle(campaign);
    const enemies = prepared.roster.filter((unit) => unit.team === "enemy");
    assert.equal(enemies.length, 2);
    assert.ok(["jogo", "hidan", "scorpion_lailai"].includes(enemies[0].id));
    assert.ok(["esdeath", "zhang_jiao", "nami"].includes(enemies[1].id));
    assert.ok(enemies.every((unit) => !previous.includes(unit.id)));
    assert.equal(prepared.battle.title, enemies.map((unit) => unit.name).join(" + "));
    for (const enemy of enemies) {
      assert.equal(enemy.name, TRIAL_ENEMY_DATA[enemy.id].name);
      const rowTemplate = getStageThreeNormalEnemyStats(enemy.row === "front" ? "guard" : "mage", campaign.stageStep);
      assert.deepEqual([enemy.maxHp, enemy.atk, enemy.def, enemy.spd],
        [rowTemplate.hp, rowTemplate.atk, rowTemplate.def, rowTemplate.spd].map((value) => Math.max(1, Math.floor(value * .8))));
    }
    assert.equal(prepared.battle.id, prepared.combatOptions.battleId);
    previous.splice(0, previous.length, ...enemies.map((unit) => unit.id));
    const allies = prepared.roster.filter((unit) => unit.team === "ally");
    finishBattle(campaign, "victory", allies[0].currentHp, [], allies);
  }
  assert.equal(pickTrialEnemies(["a", "b", "c"], 1, ["a"], () => 0)[0], "b");
});

test("one trial challenge defeat heals half HP and a second defeat applies the trial penalty once", () => {
  const campaign = stageThree();
  campaign.partyStates.eren.currentHp = 250;
  const before = Object.fromEntries(campaign.partyIds.map((id) => [id, campaign.partyStates[id].currentHp]));
  enterTrial(campaign, ["strength", "wisdom", "will"]);
  chooseTrialNode(campaign);
  const prepared = prepareBattle(campaign);
  const final = prepared.roster.map((unit) => unit.team === "ally" ? { ...unit, currentHp: 0, alive: false } : unit);
  const result = finishBattle(campaign, "defeat", 0, [], final);
  assert.equal(result.trialOutcome, "retry");
  assert.equal(campaign.status, "trial_route");
  assert.equal(campaign.trial.failedCount, 1);
  assert.equal(campaign.trial.completedCount, 0);
  for (const id of campaign.partyIds) {
    const state = campaign.partyStates[id];
    assert.equal(state.currentHp, Math.floor(state.maxHp * .5));
    assert.equal(campaign.lastBattleRecovery.find((item) => item.characterId === id)?.kind, "trial_failure_heal");
  }
  assert.equal(finishBattle(campaign, "defeat", 0, [], final), false);
  assert.ok(chooseTrialNode(campaign, "wisdom"));
  const second = prepareBattle(campaign);
  const secondFinal = second.roster.map((unit) => unit.team === "ally" ? { ...unit, currentHp: 0, alive: false } : unit);
  const failed = finishBattle(campaign, "defeat", 0, [], secondFinal);
  assert.equal(failed.trialOutcome, "failed");
  assert.equal(campaign.status, "trial_result");
  for (const id of campaign.partyIds) {
    const state = campaign.partyStates[id];
    assert.equal(state.currentHp, Math.min(before[id], state.maxHp));
    assert.equal(state.maxHp, Math.floor(STARTING_CHARACTERS.find((hero) => hero.id === id).baseStats.maxHp * .6));
    assert.equal(state.spd, Math.floor(STARTING_CHARACTERS.find((hero) => hero.id === id).baseStats.spd * .6));
  }
  assert.equal(finishBattle(campaign, "defeat", 0, [], secondFinal), false);
});

test("trial succeeds after one failed challenge followed by two successful challenges", () => {
  const campaign = stageThree();
  enterTrial(campaign, ["will", "strength", "wisdom"]);
  assert.ok(chooseTrialNode(campaign, "will"));
  assert.ok(resolveTrialWill(campaign, "will_accept"));
  const first = prepareBattle(campaign);
  const fallen = first.roster.map((unit) => unit.team === "ally" ? { ...unit, currentHp: 0, alive: false } : unit);
  assert.equal(finishBattle(campaign, "defeat", 0, [], fallen).trialOutcome, "retry");
  assert.equal(campaign.trial.tasks.will, "failed");
  for (const id of ["strength", "wisdom"]) {
    assert.ok(chooseTrialNode(campaign, id));
    const prepared = prepareBattle(campaign);
    const allies = prepared.roster.filter((unit) => unit.team === "ally");
    const result = finishBattle(campaign, "victory", allies[0].currentHp, [], allies);
    assert.equal(result.trialOutcome, id === "wisdom" ? "completed" : "active");
  }
  assert.equal(campaign.trial.completedCount, 2);
  assert.equal(campaign.trial.failedCount, 1);
  assert.equal(campaign.status, "trial_result");
  assert.equal(campaign.evolutionPending, true);
});

test("ordinary trial enemies expose their actual active and passive skills in battle copies", () => {
  const campaign = stageThree();
  enterTrial(campaign, ["will", "strength", "wisdom"]);
  assert.ok(chooseTrialNode(campaign, "will"));
  assert.ok(resolveTrialWill(campaign, "will_accept"));
  campaign.currentBattle.enemies = ["zhang_jiao", "hidan"];
  const roster = prepareBattle(campaign).roster;
  const zhang = roster.find((unit) => unit.id === "zhang_jiao");
  const hidan = roster.find((unit) => unit.id === "hidan");
  assert.equal(zhang.skills[0].id, "zhang-jiao-lightning");
  assert.ok(zhang.skills[0].description);
  assert.match(hidan.trialPassiveSkill.description, /3 个战斗回合/);
});

test("a failed will challenge clears its temporary HP restriction before another trial", () => {
  const campaign = stageThree();
  const originalMax = campaign.runCharacterState.maxHp;
  enterTrial(campaign);
  chooseTrialNode(campaign);
  resolveTrialWill(campaign, "will_accept");
  const prepared = prepareBattle(campaign);
  const final = prepared.roster.map((unit) => unit.team === "ally" ? { ...unit, currentHp: 0, alive: false } : unit);
  finishBattle(campaign, "defeat", 0, [], final);
  assert.equal(campaign.status, "trial_route");
  assert.equal(campaign.runCharacterState.maxHp, originalMax);
  assert.equal(campaign.runCharacterState.currentHp, Math.floor(originalMax * .5));
  assert.equal(campaign.runCharacterState.divinePunishment, null);
});

test("the three divine-punishment fights form one challenge and refill HP only after the third win", () => {
  const campaign = stageThree();
  enterTrial(campaign);
  chooseTrialNode(campaign);
  const originalMax = campaign.runCharacterState.maxHp;
  resolveTrialWill(campaign, "will_accept");
  assert.equal(campaign.runCharacterState.divinePunishment.battlesLeft, 3);
  assert.equal(campaign.runCharacterState.maxHp, originalMax - Math.floor(originalMax * .2));
  for (let battle = 1; battle <= 3; battle += 1) {
    const prepared = prepareBattle(campaign);
    assert.ok(prepared.roster.filter((unit) => unit.team === "ally").every((unit) => unit.healingBlocked));
    const allies = prepared.roster.filter((unit) => unit.team === "ally").map((unit) => ({ ...unit,
      currentHp: Math.max(1, unit.currentHp - 10) }));
    const result = finishBattle(campaign, "victory", allies[0].currentHp, [], allies);
    if (battle < 3) {
      assert.equal(campaign.lastBattleRecovery.length, 0);
      assert.equal(campaign.runCharacterState.currentHp,
        originalMax - Math.floor(originalMax * .2) - battle * 10);
    } else {
      assert.equal(campaign.lastBattleRecovery.length, campaign.partyIds.length);
      for (const id of campaign.partyIds) assert.equal(campaign.partyStates[id].currentHp, campaign.partyStates[id].maxHp);
    }
    assert.equal(campaign.trial.divinePunishmentBattlesLeft, 3 - battle);
    if (battle < 3) assert.equal(result.status, "trial_next_battle");
    else assert.equal(result.status, "trial_route");
  }
  assert.equal(campaign.runCharacterState.maxHp, originalMax);
  assert.equal(campaign.runCharacterState.currentHp, originalMax);
  assert.equal(campaign.runCharacterState.divinePunishment, null);
});

test("the integrated will challenge runs three real battles without adjacent enemy repeats", () => {
  const campaign = stageThree();
  for (const id of campaign.partyIds) {
    const state = campaign.partyStates[id];
    state.maxHp = 10000; state.currentHp = 10000; state.atk = 5000;
  }
  enterTrial(campaign);
  chooseTrialNode(campaign);
  resolveTrialWill(campaign, "will_accept");
  const encountered = [];
  for (let battle = 0; battle < 3; battle += 1) {
    const prepared = prepareBattle(campaign);
    encountered.push(prepared.battle.enemies);
    const result = simulateBattle(prepared.roster, () => .999, prepared.combatOptions);
    assert.equal(result.outcome, "victory");
    const player = result.finalCharacters.find((unit) => unit.id === campaign.playerId);
    finishBattle(campaign, result.outcome, player.currentHp, result.events, result.finalCharacters);
  }
  assert.ok(encountered.every((ids, index) => index === 0 || ids.every((id) => !encountered[index - 1].includes(id))));
  assert.equal(campaign.trial.tasks.will, "completed");
  assert.equal(campaign.status, "trial_route");
  assert.equal(campaign.trial.battleIndex, 3);
});

test("Heracles survives the first lethal blow and falls on the sixth further effective hit", () => {
  const state = initializeBattle([
    { id: "hero", team: "ally", row: "front", hp: 1000, atk: 10000, def: 0, spd: 100, rosterOrder: 0 },
    { id: "heracles", team: "enemy", row: "front", hp: 100, atk: 1, def: 0, spd: 1,
      trialPassive: "heracles", rosterOrder: 1 },
  ]);
  state.round = 1;
  const [hero, boss] = state.characters;
  const first = executeAttack(state, hero, boss, () => .999);
  assert.equal(first.trialDamage.heraclesAwakened, true);
  assert.equal(boss.currentHp, 1);
  for (let hit = 0; hit < 5; hit += 1) {
    const event = executeAttack(state, hero, boss, () => .999);
    assert.equal(event.targetDied, false);
    assert.equal(boss.currentHp, 1);
    assert.equal(event.trialDamage.heraclesHitsRemaining, 5 - hit);
  }
  const sixth = executeAttack(state, hero, boss, () => .999);
  assert.equal(sixth.trialDamage.heraclesHitsRemaining, 0);
  assert.equal(sixth.targetDied, true);
  assert.equal(boss.currentHp, 0);
});

test("a second damage number from the same skill cast does not spend another Heracles life", () => {
  const result = simulateBattle([
    { id: "hero", team: "ally", row: "front", hp: 5000, atk: 1000, def: 0, spd: 100,
      rosterOrder: 0, skill: { id: "shadow-clone-rush", name: "影分身", chance: 1,
        multiplier: 1, splashRatio: .5 } },
    { id: "heracles", team: "enemy", row: "front", hp: 100, atk: 1, def: 0, spd: 1,
      rosterOrder: 1, trialPassive: "heracles" },
  ], () => .999);
  const first = result.events.find((event) => event.type === "attack" && !event.splash);
  const attached = result.events.find((event) => event.type === "attack" && event.splash);
  assert.equal(first.trialDamage.heraclesHitsRemaining, 6);
  assert.equal(attached.trialDamage.heraclesHitsRemaining, 6);
});

test("Odin reduces every hit by 50, 40, 30, 20, 0 percent across five-round cycles", () => {
  const state = initializeBattle([
    { id: "hero", team: "ally", row: "front", hp: 1000, atk: 100, def: 0, spd: 100, rosterOrder: 0 },
    { id: "odin", team: "enemy", row: "back", hp: 10000, atk: 1, def: 0, spd: 1,
      trialPassive: "odin", rosterOrder: 1 },
  ]);
  const [hero, boss] = state.characters;
  for (const [round, reduction, damage] of [[1,.5,50],[2,.4,60],[3,.3,70],[4,.2,80],[5,0,100],
    [6,.5,50],[7,.4,60],[8,.3,70],[9,.2,80],[10,0,100],[11,.5,50]]) {
    state.round = round;
    for (let hit = 0; hit < 2; hit += 1) {
      const result = executeAttack(state, hero, boss, () => .999);
      assert.equal(result.trialDamage.odinReduction, reduction);
      assert.equal(result.actualDamage, damage);
    }
  }
});

test("Odin's max HP choice penalty is battle-only and does not erase uninjured run HP", () => {
  const campaign = stageThree();
  campaign.partyStates.naruto.statPointChoices.maxHp = 2;
  campaign.partyStates.eren.statPointChoices.atk = 2;
  const before = campaign.partyStates.naruto.currentHp;
  enterTrial(campaign, ["wisdom", "strength", "will"]);
  chooseTrialNode(campaign);
  const prepared = prepareBattle(campaign);
  const hero = prepared.roster.find((unit) => unit.id === "naruto");
  const partner = prepared.roster.find((unit) => unit.id === "eren");
  assert.equal(hero.maxHp, Math.floor(campaign.partyStates.naruto.maxHp * .5));
  assert.equal(partner.atk, Math.floor(campaign.partyStates.eren.atk * .5));
  const allies = prepared.roster.filter((unit) => unit.team === "ally");
  finishBattle(campaign, "victory", hero.currentHp, [], allies);
  assert.equal(campaign.partyStates.naruto.currentHp, before);
  assert.equal(campaign.partyStates.naruto.maxHp, before);
  assert.equal(campaign.partyStates.eren.atk, STARTING_CHARACTERS.find((entry) => entry.id === "eren").baseStats.atk);
});

test("a Tang summon inherits Odin's chosen weakness exactly once", () => {
  const result = simulateBattle([
    { id: "tang", team: "ally", row: "back", hp: 1000, atk: 100, def: 100, spd: 300,
      rosterOrder: 0, odinMimirStat: "atk", tangGrowth: { maxHp: 0, atk: 0, def: 0, spd: 0 },
      skill: { id: "journey-west", name: "西游", chance: 1, level: 1, summonSkillChance: 0 } },
    { id: "hero", team: "ally", row: "front", hp: 1000, atk: 1000, def: 0, spd: 100, rosterOrder: 1 },
    { id: "odin", team: "enemy", row: "back", hp: 100, atk: 1, def: 0, spd: 1,
      rosterOrder: 2, trialPassive: "odin" },
  ], () => .999);
  const summon = result.events.find((event) => event.type === "summon");
  assert.ok(summon);
  assert.equal(summon.character.odinMimirStat, "atk");
  assert.equal(summon.character.atk, 75); // White Horse's base 150 ATK, halved once.
});

test("Zhang Jiao can target himself, Esdeath freezes two turns, and Hidan settles delayed damage", () => {
  const hero = { id: "hero", team: "ally", row: "front", hp: 5000, atk: 1000, def: 100,
    spd: 1, rosterOrder: 0 };
  const zhang = simulateBattle([hero, { id: "zhang_jiao", team: "enemy", row: "back", hp: 200,
    atk: 1, def: 0, spd: 100, rosterOrder: 1,
    skill: { id: "zhang-jiao-lightning", name: "雷击", chance: 1, trueDamage: 300 } }], () => .999);
  assert.equal(zhang.outcome, "victory");
  assert.ok(zhang.events.some((event) => event.skillId === "zhang-jiao-lightning" && event.targetId === "zhang_jiao"));

  const frozen = simulateBattle([hero, { id: "esdeath", team: "enemy", row: "back", hp: 100,
    atk: 1, def: 0, spd: 100, rosterOrder: 1, trialPassive: "esdeath" }], () => .999);
  assert.deepEqual(frozen.events.filter((event) => event.type === "trial-control-skip" && event.targetId === "hero")
    .map((event) => event.round), [1, 2]);
  assert.equal(frozen.events.find((event) => event.type === "trial-freeze").speedLoss, 80);

  const delayed = simulateBattle([hero, { id: "hidan", team: "enemy", row: "front", hp: 500,
    atk: 1, def: 0, spd: 1, rosterOrder: 1, trialPassive: "hidan" }], () => .999);
  assert.equal(delayed.events.find((event) => event.type === "attack" && event.targetId === "hidan").actualDamage, 0);
  assert.ok(delayed.events.some((event) => event.type === "trial-delayed-hit" && event.round === 4 && event.damage > 0));
});

test("Jogo burn stacks, Nami escape, and Scorpion healing use real battle state", () => {
  const hero = { id: "hero", team: "ally", row: "front", hp: 5000, atk: 300, def: 100,
    spd: 1, rosterOrder: 0 };
  const burn = simulateBattle([hero, { id: "jogo", team: "enemy", row: "back", hp: 1000,
    atk: 100, def: 0, spd: 100, rosterOrder: 1, trialPassive: "jogo" }], () => .999);
  assert.ok(burn.events.some((event) => event.type === "attack" && event.targetId === "hero" && event.burnStacks === 5));
  assert.ok(burn.events.some((event) => event.type === "trial-dot" && event.name === "灼烧" && event.damage > 0));

  const escaped = simulateBattle([{ ...hero, atk: 1 }, { id: "nami", team: "enemy", row: "front", hp: 5000,
    atk: 1, def: 0, spd: 100, rosterOrder: 1, trialPassive: "ah_fu" }], () => .999);
  assert.equal(escaped.events.filter((event) => event.type === "ah-fu-steal").length, 1);
  assert.equal(escaped.events.find((event) => event.type === "ah-fu-escape").round, 5);
  assert.equal(escaped.finalCharacters.find((unit) => unit.id === "hero").def, 40);

  const state = initializeBattle([
    { ...hero, atk: 100, spd: 100 },
    { id: "scorpion_lailai", team: "enemy", row: "front", hp: 300, atk: 1, def: 0,
      spd: 1, rosterOrder: 1, trialPassive: "scorpion_lailai" },
    { id: "friend", team: "enemy", row: "back", hp: 300, currentHp: 100, atk: 1, def: 0,
      spd: 1, rosterOrder: 2 },
  ]);
  state.round = 1;
  const hit = executeAttack(state, state.characters[0], state.characters[1], () => .999);
  assert.ok(hit.scorpionHeals.some((heal) => heal.targetId === "friend" && heal.amount === 30));
  assert.equal(state.characters[2].currentHp, 130);
});

test("Heracles normal attacks hit both allies and Odin's spear can stun the back row", () => {
  const party = [
    { id: "front", team: "ally", row: "front", hp: 5000, atk: 1000, def: 0,
      spd: 100, rosterOrder: 0 },
    { id: "back", team: "ally", row: "back", hp: 5000, atk: 1000, def: 0,
      spd: 90, rosterOrder: 1 },
  ];
  const heracles = simulateBattle([...party, { id: "heracles", team: "enemy", row: "front",
    hp: 100, atk: 100, def: 0, spd: 200, rosterOrder: 2, trialPassive: "heracles" }], () => .999);
  const firstRound = heracles.events.filter((event) => event.type === "attack" && event.attackerId === "heracles" && event.round === 1);
  assert.deepEqual(firstRound.map((event) => event.targetId), ["front", "back"]);
  assert.ok(firstRound.every((event) => event.bleedStacks === 1));
  assert.ok(heracles.events.some((event) => event.type === "trial-dot" && event.name === "流血"));

  const odin = simulateBattle([...party, { id: "odin", team: "enemy", row: "back",
    hp: 10000, atk: 50, def: 0, spd: 200, rosterOrder: 2, trialPassive: "odin",
    skill: { id: "odin-gungnir", name: "冈格尼尔", chance: 1, multiplier: 1.4 } }], () => .999);
  assert.ok(odin.events.some((event) => event.type === "attack" && event.skillId === "odin-gungnir" && event.targetId === "back" && event.stunApplied));
  assert.ok(odin.events.some((event) => event.type === "trial-control-skip" && event.targetId === "back" && event.reason === "眩晕"));
});
