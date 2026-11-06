import { CHARACTER_DATA, COMBAT_RULES, STAGE_THREE_MINIONS } from "./characters.js";
import { evaluatePassive } from "./progression.js";
import { SKILL_DATA } from "./skills.js";
import { chooseTangSummon, tangSummonStats, tangSummonVisual } from "./tangSummons.js";

const MAHITO_ATTACK_BONUS = SKILL_DATA["mahito-domain"].levels[1].attackBonusPerRound;

export function initializeBattle(config = CHARACTER_DATA, options = {}) {
  const characters = config.map((character) => {
    const normalBonus = {
      bull_king: { def: 50 }, headless_knight: { atk: 100, def: -50 },
      anubis: { hp: 400 }, loki: { atk: 70 },
    }[character.normalPassiveId] ?? {};
    const maxHp = (character.maxHp ?? character.hp) + (normalBonus.hp ?? 0);
    const currentHp = Math.max(0, Math.min(maxHp, (character.currentHp ?? character.hp) + (normalBonus.hp ?? 0)));
    return { ...character, atk: character.atk + (normalBonus.atk ?? 0), def: character.def + (normalBonus.def ?? 0), originalTeam: character.team, skill: character.skill ? { ...character.skill } : null, skills: character.skills?.map((skill) => ({ ...skill })) ?? character.skills, maxHp, currentHp, alive: currentHp > 0, elitePassiveActive: false, elitePassiveLastRound: 0, freeWillTriggers: 0, damageTakenHits: 0, critRateBonus: (character.critRateBonus ?? 0) + (character.passiveSkillId === "kaneki-one-eye" && character.passiveLevel >= 2 ? 0.10 : 0), dodgeRateBonus: character.dodgeRateBonus ?? 0, baseDodgeRateBonus: character.dodgeRateBonus ?? 0, battleAttackBonus: 0, shieldHp: 0, tauntRounds: [], jinchurikiActive: false, jinchurikiAttackBonus: 0,
      evolutionBaseAtk: character.atk, pathsImmuneRemaining: character.passiveSkillId === "eren-paths" ? 1 : 0,
      pathsEmergencyUsed: false, oneEyeKingEmergencyUsed: false, oneEyeKingUntilRound: 0,
      nineTailsLowHpActive: false, nineTailsLowHpBonus: 0, nineTailsTeammateBonus: 0,
      nineTailsTriggeredIds: [], chakraClones: character.extraPassiveSkillIds?.includes("naruto-chakra-clones") ? 2 : 0,
      chakra: 0, hardeningStacks: 0, reflectStartRound: 0, reflectUntilRound: 0,
      meditationDharmaRounds: 0, dharmaAllyAttackBonus: 0, dharmaEnemyAttackPenalty: 0,
      reactiveAttackHits: 0, attackActionHits: 0,
      ...(character.phaseSkills ? { borosPhase: 1, borosEnteredRound: 0, borosLastGrowthRound: 0, meteorCasts: 0 } : {}),
      ...(character.id === "eren" ? { freeWillDefenseStacks: 0 } : {}),
      ...(character.elitePassiveId === "toji-heavenly-restriction" ? { fasterActions: 0, tojiExhausted: false } : {}),
      ...(["shin", "noi"].includes(character.id) ? { bereavementActive: false, bereavementAttackBonus: 0 } : {}),
      ...(character.elitePassiveId === "killer-queen" ? { hpSnapshots: [], bitesDustNextAvailableRound: 1 } : {}),
      ...(character.id === "armored-titan" ? { armorReductionStartRound: null, armorReductionUntilRound: null } : {}),
      ...(character.periodicPassive?.id === "colossal-steam-wave" ? { lastSteamRound: 0 } : {}),
      ...(character.id === "gilgamesh" ? { gilgameshCasts: 0 } : {}) };
  });
  const c0Boss = characters.find((character) => Number.isFinite(character.c0DamagePerRound));
  const state = {
    characters,
    round: 0,
    status: "ready",
    runCharacterState: options.runCharacterState ?? null,
    runCharacterStates: options.runCharacterStates ?? (options.runCharacterState ? { [options.runCharacterState.characterId]: options.runCharacterState } : {}),
    playerId: options.playerId ?? options.runCharacterState?.characterId ?? null,
    battleId: options.battleId ?? null,
    battleStartEffects: options.battleStartEffects?.map((effect) => ({ ...effect })) ?? [],
    c0: c0Boss ? { bossId: c0Boss.id, damagePerRound: c0Boss.c0DamagePerRound, completedRounds: 0, detonated: false, currentRound: 0, playerActionDone: false, bossActionDone: false } : null,
    bombs: [], nextBombId: 1,
    makima: characters.some((unit) => unit.id === "makima") ? { controlledOnce: false, controlledId: null, controlEndsAtRound: null, secondWave: false,
      deadMinions: [], nextBangRound: 4, lastBangRound: 0 } : null,
    gravityHealEvents: [],
    random: Math.random,
  };
  const fallingDevil = characters.find((unit) => unit.id === "falling-devil" && unit.team === "enemy");
  if (fallingDevil) for (const unit of characters.filter((entry) => entry.team === "ally" && !entry.summonerId)) {
    unit.entryPanelSpd = unit.spd;
    unit.gravityStacks = 0;
    unit.gravityHealProgress = 0;
    unit.spd = 1;
    let hp = unit.currentHp;
    Object.defineProperty(unit, "currentHp", { enumerable: true, configurable: true,
      get() { return hp; },
      set(next) {
        const restored = Math.max(0, Math.min(unit.maxHp, next) - Math.min(unit.maxHp, hp));
        hp = next;
        if (restored > 0 && fallingDevil.alive && unit.gravityStacks > 0) {
          const total = unit.gravityHealProgress + restored;
          const layersRemoved = Math.min(unit.gravityStacks, Math.floor(total / 500));
          unit.gravityStacks -= layersRemoved;
          unit.gravityHealProgress = unit.gravityStacks > 0 ? total - layersRemoved * 500 : 0;
          state.gravityHealEvents.push({ type: "gravity-heal", round: state.round,
            targetId: unit.id, restored, layersRemoved, stacks: unit.gravityStacks,
            healingProgress: unit.gravityHealProgress });
        }
      },
    });
  }
  if (state.battleId) for (const player of state.characters.filter((character) => character.team === "ally"))
    player.jinchurikiTriggered = false;
  return state;
}

export function getActionOrder(state) {
  return state.characters.filter((c) => c.alive && c.currentHp > 0)
    .sort((a, b) => b.spd - a.spd || a.rosterOrder - b.rosterOrder);
}

export function chooseTarget(state, attacker, random = Math.random) {
  const candidates = state.characters.filter((c) => c.team !== attacker.team && c.alive && c.currentHp > 0);
  if (attacker.team === "enemy") {
    const taunter = candidates.find((c) => c.id === "eren" && c.tauntRounds?.includes(state.round));
    if (taunter) return taunter;
  }
  const frontRow = candidates.filter((c) => c.row === "front");
  const pool = frontRow.length ? frontRow : candidates;
  return pool.length ? pool[Math.floor(random() * pool.length)] : null;
}

export function skillTriggers(character, random = Math.random) {
  const skills = (character.skills?.length ? character.skills : character.skill ? [character.skill] : []).filter((skill) => skill.triggerType !== "on_damage");
  return skills.some((skill) => random() < skill.chance);
}

function triggeredSkill(character, random, round = 0) {
  if (character.id === "kira" && round <= 4) return null;
  const phaseSkillId = character.phaseSkills?.[character.borosPhase];
  if (character.phaseSkills) {
    const config = SKILL_DATA[phaseSkillId];
    const skill = config?.levels?.[1] ? { ...config, ...config.levels[1], level: 1 } : null;
    return skill && random() < skill.chance ? skill : null;
  }
  const skills = (character.skills?.length ? character.skills : character.skill ? [character.skill] : []).filter((skill) => skill.triggerType !== "on_damage");
  for (const skill of skills) {
    if (skill.id === "bites-the-dust" && round < (character.bitesDustNextAvailableRound ?? 1)) continue;
    if (random() < skill.chance) return skill;
  }
  return null;
}

export function calculateDamage(attacker, target, multiplier = 1) {
  // Negative DEF is permitted by battle debuffs; keep the divisor finite.
  const effectiveDef = Number.isFinite(target.def) ? Math.max(-99, target.def) : 0;
  const base = (attacker.atk * 100) / (100 + effectiveDef);
  return Math.max(1, Math.floor(base * multiplier));
}

function applyTojiExhaustion(target, damage) {
  return target.tojiExhausted && damage > 0 ? Math.floor(damage * 1.5) : damage;
}

function applyNormalDamageReduction(target, damage) {
  if (damage <= 0) return 0;
  return Math.max(1, Math.floor(damage * (1 - Math.min(.99, target.damageReductionBonus ?? 0))));
}

function combatDefense(character, round) {
  return character.def
    + ((character.defenseBuffUntilRound ?? -1) >= round ? character.defenseBuff ?? 0 : 0)
    + ((character.wukongDefenseBuffUntilRound ?? -1) >= round ? character.wukongDefenseBuff ?? 0 : 0);
}

export function getDodgeChance(character) {
  const normal = Number.isFinite(character.normalDodgeRate) ? character.normalDodgeRate
    : COMBAT_RULES.baseDodgeChance + character.spd * COMBAT_RULES.dodgePerSpeed + (character.dodgeRateBonus ?? 0);
  return Math.max(0, Math.min(COMBAT_RULES.maxDodgeChance, normal));
}

export function getSkillDodgeChance(character) {
  const skill = Number.isFinite(character.skillDodgeRate) ? character.skillDodgeRate
    : (COMBAT_RULES.baseDodgeChance + character.spd * COMBAT_RULES.dodgePerSpeed) * COMBAT_RULES.skillDodgeFactor
      + (character.skillDodgeRateBonus ?? 0);
  return Math.max(0, Math.min(COMBAT_RULES.skillDodgeChanceCap, skill));
}

export function getCritChance(character) {
  const conditional = (character.stageThreeKind === "arima" || character.quinqueCrit) && character.currentHp < character.maxHp * .6 ? .3 : 0;
  return Math.max(0, Math.min(COMBAT_RULES.maxCritChance, (character.critChance ?? COMBAT_RULES.baseCritChance) + (character.critRateBonus ?? 0) + conditional));
}

export function handleDeath(character) {
  if (character.currentHp <= 0) {
    character.currentHp = 0;
    character.alive = false;
    if (character.id === "armored-titan") {
      character.armorReductionStartRound = null;
      character.armorReductionUntilRound = null;
    }
    return true;
  }
  return false;
}

function applyTrialDamage(state, target, requested, kind = "attack") {
  let amount = Math.max(0, Math.floor(requested));
  if (!amount || !target.alive) return { dealt: 0 };
  let odinReduction = null;
  let odinReductionVisual = false;
  if (target.trialPassive === "odin") {
    const cycleRound = (Math.max(1, state.round) - 1) % 10;
    odinReduction = (10 - cycleRound) / 10;
    odinReductionVisual = target.odinReductionVisualRound !== state.round;
    target.odinReductionVisualRound = state.round;
    amount = Math.floor(amount * cycleRound / 10);
    if (!amount) return { dealt: 0, odinImmune: cycleRound === 0, odinReduction,
      odinReductionVisual, damageAdjusted: true };
  }
  if (target.trialPassive === "hidan" && kind !== "due") {
    target.delayedDamage ??= [];
    target.delayedDamage.push({ amount, dueRound: state.round + 3 });
    return { dealt: 0, delayedDamage: amount, dueRound: state.round + 3 };
  }
  if (target.trialPassive === "heracles" && target.heraclesTrialsActive) {
    if (kind === "attack" && target.heraclesHitsRemaining > 0) {
      target.heraclesHitsRemaining -= 1;
      return { dealt: 0, heraclesHitsRemaining: target.heraclesHitsRemaining };
    }
    if (kind !== "attack") return { dealt: 0, heraclesHitsRemaining: target.heraclesHitsRemaining };
  }
  const before = target.currentHp;
  const tang = state.characters.find((unit) => unit.id === "tang" && unit.team === target.team && unit.alive && unit.passiveSkillId === "tang-compassion");
  if (tang && tang.currentHp > tang.maxHp * .8) amount = Math.max(1, Math.floor(amount * .9));
  if (target.pathsImmuneRemaining > 0) {
    target.pathsImmuneRemaining -= 1;
    return { dealt: 0, pathsImmune: true };
  }
  const naruto = state.characters.find((unit) => unit.id === "naruto" && unit.team === target.team && unit.alive && unit.chakraClones > 0);
  const clonePassive = SKILL_DATA["naruto-chakra-clones"].levels[1];
  let cloneSpent = false;
  if (kind === "attack" && naruto && target.id !== naruto.id && target.originalTeam === "ally" &&
      !target.summonerId && target.currentHp <= target.maxHp * clonePassive.teammateHpThreshold) {
    naruto.chakraClones -= 1;
    amount = Math.max(1, Math.floor(amount * (1 - clonePassive.reduction)));
    cloneSpent = true;
  }
  let sharedDamage = null;
  if (kind !== "shared" && target === tang && tang.currentHp < tang.maxHp * .2) {
    const partner = state.characters.find((unit) => unit.team === tang.team && unit.id !== tang.id &&
      !unit.tangSummonKind && unit.alive && unit.currentHp > 0);
    if (partner) {
      const share = Math.floor(amount * .4);
      amount -= share;
      const shareResult = applyTrialDamage(state, partner, share, "shared");
      handleDeath(partner);
      sharedDamage = { targetId: partner.id, amount: shareResult.dealt, currentHp: partner.currentHp };
    }
  }
  target.currentHp = Math.max(0, before - amount);
  if (target.trialPassive === "heracles" && !target.heraclesTrialsActive && target.currentHp === 0) {
    target.currentHp = 1;
    target.heraclesTrialsActive = true;
    target.heraclesHitsRemaining = 12;
    return { dealt: before - 1, heraclesAwakened: true, heraclesHitsRemaining: 12 };
  }
  let emergencyHeal = 0;
  if (target.passiveSkillId === "eren-paths" && !target.pathsEmergencyUsed && !target.healingBlocked &&
      target.currentHp < target.maxHp * .2) {
    target.pathsEmergencyUsed = true;
    emergencyHeal = Math.min(target.maxHp - target.currentHp, Math.floor(target.maxHp * .4));
    target.currentHp += emergencyHeal;
    target.alive = target.currentHp > 0;
  }
  if (target.passiveSkillId === "kaneki-one-eye-king" && !target.oneEyeKingEmergencyUsed && target.currentHp < target.maxHp * .4) {
    target.oneEyeKingEmergencyUsed = true;
    target.oneEyeKingUntilRound = state.round + 2;
  }
  const nineTails = state.characters.find((unit) => unit.id === "naruto" && unit.team === target.team && unit.alive &&
    unit.passiveSkillId === "naruto-nine-tails-bond");
  if (nineTails && target.id !== nineTails.id && !target.tangSummonKind && target.currentHp > 0 &&
      target.currentHp < target.maxHp * .15 && !nineTails.nineTailsTriggeredIds.includes(target.id)) {
    nineTails.nineTailsTriggeredIds.push(target.id);
    if (!nineTails.nineTailsTeammateBonus) {
      nineTails.nineTailsTeammateBonus = Math.floor(nineTails.evolutionBaseAtk * .3);
      nineTails.atk += nineTails.nineTailsTeammateBonus;
    }
  }
  return { dealt: before - Math.max(0, before - amount), emergencyHeal, cloneSpent, odinReduction, odinReductionVisual,
    clonesRemaining: cloneSpent ? naruto.chakraClones : null, sharedDamage,
    damageAdjusted: amount !== Math.floor(requested) };
}

function syncNineTailsPassive(unit) {
  if (unit.passiveSkillId !== "naruto-nine-tails-bond") return;
  const low = unit.currentHp > 0 && unit.currentHp < unit.maxHp * .5;
  if (low === unit.nineTailsLowHpActive) return;
  if (low) {
    unit.nineTailsLowHpBonus = Math.floor(unit.evolutionBaseAtk * .3);
    unit.atk += unit.nineTailsLowHpBonus;
  } else {
    unit.atk -= unit.nineTailsLowHpBonus;
    unit.nineTailsLowHpBonus = 0;
  }
  unit.nineTailsLowHpActive = low;
}

function healScorpionAllies(state, target, actualDamage) {
  const healed = [];
  if (actualDamage <= 0 || target.trialPassive !== "scorpion_lailai") return healed;
  const amount = Math.floor(actualDamage * .3);
  for (const ally of state.characters.filter((unit) => unit.team === target.team && unit.alive && unit.currentHp > 0 && !unit.healingBlocked)) {
    const restored = Math.max(0, Math.min(ally.maxHp - ally.currentHp, amount));
    ally.currentHp += restored;
    if (restored) healed.push({ targetId: ally.id, amount: restored, currentHp: ally.currentHp });
  }
  return healed;
}

export function isBattleOver(state) {
  if (state.forcedOutcome) return state.forcedOutcome;
  const livingTeams = new Set(state.characters.filter((c) => c.alive && c.currentHp > 0).map((c) => c.team));
  if (!livingTeams.has("ally")) return "defeat";
  const makima = state.characters.find((c) => c.id === "makima");
  if (makima && !makima.alive) return "victory";
  if (!livingTeams.has("enemy")) return "victory";
  return null;
}

export function resolveFallingRoundEnd(state) {
  const devil = state.characters.find((unit) => unit.id === "falling-devil" && unit.team === "enemy" && unit.alive);
  if (!devil || state.round < 3 || state.round % 3 !== 0) return [];
  const hits = [];
  const executions = [];
  for (const target of state.characters.filter((unit) => unit.originalTeam === "ally" && !unit.summonerId && unit.alive && unit.currentHp > 0)) {
    const baseDamage = target.entryPanelSpd * 4 + 250;
    const afterDefense = calculateDamage({ atk: baseDamage }, { def: combatDefense(target, state.round) });
    let reduced = afterDefense;
    if (target.id === "tang" && state.characters.some((unit) => unit.summonerId === "tang" && unit.alive && unit.currentHp > 0))
      reduced = Math.max(1, Math.floor(reduced * .8));
    if (target.damageTakenMultiplier > 1) reduced = Math.floor(reduced * target.damageTakenMultiplier);
    reduced = applyNormalDamageReduction(target, reduced);
    const shieldAbsorbed = Math.min(reduced, target.shieldHp ?? 0);
    target.shieldHp = Math.max(0, (target.shieldHp ?? 0) - shieldAbsorbed);
    const before = target.currentHp;
    const protection = applyTrialDamage(state, target, reduced - shieldAbsorbed, "attached");
    const actualDamage = Math.max(0, before - target.currentHp);
    const fellDead = handleDeath(target);
    const hpAfterFall = target.currentHp;
    if (!fellDead) {
      target.gravityStacks += 1;
      if (target.gravityStacks >= 5) {
        target.currentHp = 0;
        target.alive = false;
        executions.push({ type: "gravity-execution", round: state.round, attackerId: devil.id,
          targetId: target.id, stacks: target.gravityStacks, hpAfter: 0 });
      }
    }
    hits.push({ targetId: target.id, entryPanelSpd: target.entryPanelSpd, baseDamage,
      afterDefense, actualDamage, shieldAbsorbed, shieldHp: target.shieldHp,
      hpAfter: hpAfterFall,
      stacks: target.gravityStacks, fellDead, protection });
  }
  return [...state.gravityHealEvents.splice(0),
    { type: "gravity-fall", round: state.round, attackerId: devil.id, hits }, ...executions];
}

function summonMakimaMinion(state, id, events) {
  if (state.characters.some((unit) => unit.id === id)) return;
  const template = STAGE_THREE_MINIONS[id];
  const skills = (template.activeSkills ?? []).map((skillId) => {
    const config = SKILL_DATA[skillId];
    return { ...config, ...config.levels[1], level: 1 };
  });
  const summoned = { ...template, maxHp: template.hp, currentHp: template.hp, alive: true,
    originalTeam: "enemy", rosterOrder: state.characters.length + 1, skills, skill: skills[0] ?? null };
  state.characters.push(summoned);
  events.push({ type: "summon", round: state.round, summonerId: "makima", passiveName: "武器人", character: { ...summoned } });
}

function syncShinNoiBereavement(state, events) {
  const shin = state.characters.find((unit) => unit.id === "shin");
  const noi = state.characters.find((unit) => unit.id === "noi");
  if (!shin || !noi) return;
  if (!shin.alive && !noi.alive) {
    shin.reviveAtRound = null;
    noi.reviveAtRound = null;
  }
  for (const [unit, partner] of [[shin, noi], [noi, shin]]) {
    const active = unit.alive && !partner.alive && partner.reviveAtRound != null;
    if (active && !unit.bereavementActive) {
      unit.bereavementAttackBonus = unit.atk;
      unit.atk += unit.bereavementAttackBonus;
      unit.bereavementActive = true;
      events.push({ type: "stage3-bereavement", round: state.round, attackerId: unit.id,
        attackBonus: unit.bereavementAttackBonus, currentAtk: unit.atk });
    } else if (!active && unit.bereavementActive) {
      unit.atk -= unit.bereavementAttackBonus;
      unit.bereavementAttackBonus = 0;
      unit.bereavementActive = false;
      events.push({ type: "stage3-bereavement-end", round: state.round, attackerId: unit.id, currentAtk: unit.atk });
    }
  }
}

export function resolveStageThreeDeaths(state, events = []) {
  const makima = state.characters.find((unit) => unit.id === "makima");
  if (makima && !makima.alive) {
    for (const unit of state.characters.filter((entry) => entry.stageThreeMinion && entry.alive)) {
      unit.currentHp = 0; unit.alive = false; unit.stageThreeDismissed = true;
      events.push({ type: "summon-dismissed", round: state.round, targetId: unit.id, summonerId: makima.id });
    }
  }
  for (const unit of state.characters.filter((entry) => entry.stageThreeMinion && !entry.alive && !entry.stageThreeDismissed)) {
    if (state.makima?.deadMinions.includes(unit.id)) continue;
    state.makima?.deadMinions.push(unit.id);
    if (makima?.alive) {
      makima.atk += 100;
      events.push({ type: "stage3-minion-death", round: state.round, targetId: unit.id,
        attackerId: makima.id, attackBonus: 100, currentAtk: makima.atk });
      if (state.makima.deadMinions.length === 4) {
        makima.lifesteal = (makima.lifesteal ?? 0) + .1;
        events.push({ type: "stage3-lifesteal", round: state.round, attackerId: makima.id, lifesteal: .1 });
      }
      state.makima.nextBangRound = Math.min(state.makima.nextBangRound,
        state.round + Math.max(1, 5 - state.makima.deadMinions.length));
    }
  }
  if (makima?.alive && !state.makima.secondWave && makima.currentHp < makima.maxHp * .5) {
    state.makima.secondWave = true;
    summonMakimaMinion(state, "katana-devil", events);
    summonMakimaMinion(state, "quanxi", events);
  }
  for (const id of ["shin", "noi"]) {
    const unit = state.characters.find((entry) => entry.id === id);
    const partner = state.characters.find((entry) => entry.id === (id === "shin" ? "noi" : "shin"));
    if (unit && partner && !unit.alive && unit.reviveAtRound == null && !unit.reviveDeathProcessed) {
      unit.reviveDeathProcessed = true;
      if (partner.alive) {
        unit.reviveAtRound = state.round + 4;
        events.push({ type: "stage3-revive-pending", round: state.round, targetId: id, reviveAtRound: unit.reviveAtRound });
      }
    }
  }
  syncShinNoiBereavement(state, events);
  return events;
}

function clearSkillBuffs(unit) {
  const cleared = [];
  for (const [field, counter] of [["jinchurikiAttackBonus", "atk"], ["nineTailsLowHpBonus", "atk"],
    ["nineTailsTeammateBonus", "atk"], ["dharmaAllyAttackBonus", "atk"], ["battleAttackBonus", "atk"]]) {
    if (unit[field] > 0) { unit[counter] -= unit[field]; cleared.push(field); unit[field] = 0; }
  }
  if (unit.defenseBuff) { unit.defenseBuff = 0; unit.defenseBuffUntilRound = -1; cleared.push("defenseBuff"); }
  if (unit.wukongDefenseBuff) { unit.wukongDefenseBuff = 0; unit.wukongDefenseBuffUntilRound = -1; cleared.push("wukongDefenseBuff"); }
  if (unit.shieldHp) { unit.shieldHp = 0; cleared.push("shieldHp"); }
  if (unit.critRateBonus) { unit.critRateBonus = 0; cleared.push("critRateBonus"); }
  if (unit.dodgeRateBonus !== unit.baseDodgeRateBonus) { unit.dodgeRateBonus = unit.baseDodgeRateBonus; cleared.push("skillDodgeBonus"); }
  unit.jinchurikiActive = false;
  unit.nineTailsLowHpActive = false;
  unit.reflectStartRound = 0; unit.reflectUntilRound = 0;
  unit.tauntRounds = [];
  return cleared;
}

export function stageThreeRoundStart(state, random = Math.random) {
  const events = [];
  for (const unit of state.characters.filter((entry) => ["shin", "noi"].includes(entry.id) && !entry.alive &&
      entry.reviveAtRound != null && entry.reviveAtRound <= state.round)) {
    const partner = state.characters.find((entry) => entry.id === (unit.id === "shin" ? "noi" : "shin"));
    if (!partner?.alive) { unit.reviveAtRound = null; continue; }
    unit.currentHp = Math.max(1, Math.floor(unit.maxHp * .4));
    unit.alive = true; unit.reviveAtRound = null; unit.reviveDeathProcessed = false;
    syncShinNoiBereavement(state, events);
    events.push({ type: "stage3-revive", round: state.round, targetId: unit.id,
      hpAfter: unit.currentHp, maxHp: unit.maxHp });
  }
  const makima = state.characters.find((unit) => unit.id === "makima" && unit.alive);
  if (!makima || !state.makima) return events;
  const controlled = state.characters.find((unit) => unit.id === state.makima.controlledId);
  if (controlled && (!controlled.alive || state.round >= state.makima.controlEndsAtRound)) {
    controlled.team = "ally";
    controlled.controlledByMakima = false;
    for (const summon of state.characters.filter((unit) => unit.summonerId === controlled.id)) {
      summon.team = "ally"; summon.controlledByMakima = false;
    }
    state.makima.controlledId = null;
    state.makima.controlEndsAtRound = null;
    events.push({ type: "stage3-control-end", round: state.round, targetId: controlled.id });
  } else if (state.round >= 2 && !state.makima.controlledOnce) {
    const partner = state.characters.find((unit) => unit.originalTeam === "ally" && unit.id !== state.playerId &&
      !unit.summonerId && unit.alive);
    if (partner && random() < .25) {
      partner.team = "enemy";
      partner.controlledByMakima = true;
      for (const summon of state.characters.filter((unit) => unit.summonerId === partner.id)) {
        summon.team = "enemy"; summon.controlledByMakima = true;
      }
      state.makima.controlledOnce = true;
      state.makima.controlledId = partner.id;
      state.makima.controlEndsAtRound = state.round + 2;
      events.push({ type: "stage3-control", round: state.round, attackerId: makima.id, targetId: partner.id });
    }
  }
  if (state.round >= 3 && (state.round - 3) % 4 === 0) {
    for (const unit of state.characters.filter((entry) => entry.team !== makima.team && entry.alive)) {
      const cleared = clearSkillBuffs(unit);
      events.push({ type: "stage3-buff-clear", round: state.round, attackerId: makima.id, targetId: unit.id, cleared });
    }
  }
  if (state.round >= state.makima.nextBangRound) {
    const target = chooseTarget(state, makima, random);
    state.makima.lastBangRound = state.round;
    state.makima.nextBangRound = state.round + Math.max(1, 5 - state.makima.deadMinions.length);
    if (target) {
      const baseDamage = Math.max(1, Math.floor(makima.atk * state.round / 10));
      let damage = calculateDamage({ atk: baseDamage }, { def: combatDefense(target, state.round) });
      damage = applyTojiExhaustion(target, applyNormalDamageReduction(target, damage));
      const absorbed = Math.min(damage, target.shieldHp ?? 0);
      target.shieldHp = Math.max(0, (target.shieldHp ?? 0) - absorbed);
      const before = target.currentHp;
      applyTrialDamage(state, target, damage - absorbed);
      const died = handleDeath(target);
      events.push({ type: "attack", attackerId: makima.id, attackerTeam: makima.team, targetId: target.id,
        round: state.round, skillId: "makima-bang", skillName: "砰！", skilled: true, attackKind: "skill", attackType: "ranged",
        damage: before - target.currentHp, actualDamage: before - target.currentHp, targetHp: target.currentHp,
        targetMaxHp: target.maxHp, targetDied: died, attackerHp: makima.currentHp,
        deadMinions: state.makima.deadMinions.length, bangBaseDamage: baseDamage, nextBangRound: state.makima.nextBangRound });
      resolveStageThreeDeaths(state, events);
    }
  }
  return events;
}

export function summonAtRoundStart(state) {
  const summonedEvents = [];
  for (const summoner of [...state.characters]) {
    const passive = summoner.summonPassive;
    if (!summoner.alive || !passive?.unit || state.round < passive.firstRound
      || (state.round - passive.firstRound) % passive.everyRounds !== 0
      || summoner.lastSummonedRound === state.round) continue;
    const unit = passive.unit;
    const summoned = {
      ...unit, id: `${summoner.id}-summon-${state.round}`, name: unit.name,
      maxHp: unit.maxHp ?? unit.hp, currentHp: unit.maxHp ?? unit.hp,
      alive: true, team: summoner.team, row: "front", position: "front",
      skill: unit.skill ? { ...unit.skill } : null,
    };
    summoner.lastSummonedRound = state.round;
    state.characters.push(summoned);
    summonedEvents.push({ type: "summon", round: state.round, summonerId: summoner.id,
      passiveName: passive.name, character: { ...summoned } });
  }
  if (!state.forcedOutcome && state.characters.some((unit) => unit.id === "dina") &&
    state.characters.filter((unit) => unit.id.startsWith("dina-summon-") && unit.alive && unit.currentHp > 0).length >= 4) {
    state.forcedOutcome = "defeat";
    summonedEvents.push({ type: "giant-overrun", round: state.round, text: "你被巨人淹没了...." });
  }
  return summonedEvents;
}

// Periodic passives use the global round counter, independent of SPD and action order.
// True damage follows C0 precedence: no DEF, dodge, crit, or normal damage modifiers.
export function triggerSteamWaveAtRoundStart(state) {
  const giant = state.characters.find((character) => character.periodicPassive?.id === "colossal-steam-wave");
  const passive = giant?.periodicPassive;
  if (!giant?.alive || giant.currentHp <= 0 || !passive || state.round < 1
    || state.round % passive.everyRounds !== 0 || giant.lastSteamRound === state.round) return null;
  giant.lastSteamRound = state.round;
  const targets = state.characters.filter((character) => character.alive && character.currentHp > 0 &&
    (character.team === "ally" || character.id === "armored-titan"));
  const hits = [];
  for (const target of targets) {
    const hpBefore = target.currentHp;
    const damage = target.id === "armored-titan" ? passive.armoredDamage : passive.allyDamage;
    target.currentHp = Math.max(0, hpBefore - damage);
    const actualDamage = hpBefore - target.currentHp;
    accumulateBombDamage(state, target.id, actualDamage);
    const targetDied = handleDeath(target);
    if (targetDied) state.bombs = state.bombs.filter((bomb) => bomb.targetId !== target.id);
    hits.push({ targetId: target.id, damage, actualDamage, hpBefore, hpAfter: target.currentHp, targetDied });
  }
  return { type: "steam-wave", skillId: passive.id, skillName: passive.name, attackerId: giant.id,
    round: state.round, trueDamage: true, hits };
}

export function expireArmoredShieldAtRoundEnd(state) {
  const armored = state.characters.find((character) => character.id === "armored-titan");
  if (!armored?.alive || armored.armorReductionUntilRound == null || armored.armorReductionUntilRound > state.round) return null;
  armored.armorReductionStartRound = null;
  armored.armorReductionUntilRound = null;
  return { type: "armor-shield-expired", targetId: armored.id, round: state.round };
}

export function changeBorosPhase(state, character) {
  if (!character.phaseSkills || character.currentHp <= 0) return null;
  const next = character.currentHp <= 1600 ? 3 : character.currentHp <= 4000 ? 2 : 1;
  if (next <= character.borosPhase) return null;
  character.borosPhase = next;
  character.borosEnteredRound = state.round;
  if (next === 3) {
    character.atk += 80;
    character.def -= 40;
    character.spd += 100;
    character.lifesteal = (character.lifesteal ?? 0) + .10;
  }
  return { phase: next, atk: character.atk, def: character.def, spd: character.spd, lifesteal: character.lifesteal ?? 0 };
}

function accumulateBombDamage(state, targetId, actualDamage) {
  if (actualDamage <= 0) return;
  for (const bomb of state.bombs ?? []) if (bomb.targetId === targetId) bomb.accumulatedDamage += actualDamage;
}

function attachBomb(state, attacker, target) {
  state.bombs ??= [];
  state.nextBombId ??= 1;
  const bomb = { id: `bomb-${state.nextBombId++}`, attackerId: attacker.id, targetId: target.id,
    attachedRound: state.round, dueRound: state.round + 3, accumulatedDamage: 0 };
  state.bombs.push(bomb);
  return { id: bomb.id, targetId: target.id, attachedRound: bomb.attachedRound, dueRound: bomb.dueRound };
}

export function detonateDueBombs(state) {
  const events = [];
  // Stable order also applies when Bites the Dust makes several bombs due together.
  const due = state.bombs.filter((bomb) => bomb.dueRound <= state.round)
    .sort((a, b) => a.attachedRound - b.attachedRound || Number(a.id.slice(5)) - Number(b.id.slice(5)));
  for (const bomb of due) {
    if (!state.bombs.includes(bomb)) continue;
    state.bombs.splice(state.bombs.indexOf(bomb), 1);
    const primary = state.characters.find((entry) => entry.id === bomb.targetId);
    if (!primary?.alive || primary.currentHp <= 0) continue;
    const targets = state.characters.filter((entry) => entry.team === primary.team && entry.alive && entry.currentHp > 0);
    for (const target of targets) {
      const hpBefore = target.currentHp;
      const defense = combatDefense(target, state.round);
      const damage = bomb.accumulatedDamage > 0
        ? applyNormalDamageReduction(target, calculateDamage({ atk: bomb.accumulatedDamage }, { def: defense * .6 })) : 0;
      target.currentHp = Math.max(0, hpBefore - damage);
      const actualDamage = hpBefore - target.currentHp;
      // This bomb is already removed, so its explosion only feeds other bombs.
      accumulateBombDamage(state, target.id, actualDamage);
      const died = handleDeath(target);
      if (died) state.bombs = state.bombs.filter((entry) => entry.targetId !== target.id);
      events.push({ type: "bomb-explode", round: state.round, bombId: bomb.id, targetId: target.id,
        damage, accumulatedDamage: bomb.accumulatedDamage, actualDamage, hpBefore, hpAfter: target.currentHp, targetDied: died });
    }
  }
  return events;
}

export function resolveBitesDust(state, attacker) {
  attacker.bitesDustNextAvailableRound = state.round + 6;
  const snapshot = attacker.hpSnapshots.find((entry) => entry.round === state.round - 2);
  const hpBefore = attacker.currentHp;
  attacker.currentHp = Math.max(0, Math.min(attacker.maxHp, snapshot?.hp ?? attacker.currentHp));
  const died = handleDeath(attacker);
  for (const bomb of state.bombs) bomb.dueRound -= 1;
  return [{ type: "bites-dust", round: state.round, attackerId: attacker.id, skillName: "败者食尘",
    hpBefore, hpAfter: attacker.currentHp, snapshotRound: snapshot?.round ?? null,
    fallback: !snapshot, targetDied: died, bombsAdvanced: state.bombs.length }, ...detonateDueBombs(state)];
}

export function executeAttack(state, attacker, target, random = Math.random, attackOptions = {}) {
  if (!attacker?.alive || attacker.currentHp <= 0 || !target?.alive || target.currentHp <= 0) return null;
  let elitePassiveTriggered = null;
  if (attacker.elitePassiveId === "mahito-domain" && !attacker.elitePassiveActive && attacker.currentHp < attacker.maxHp * 0.5) {
    attacker.elitePassiveActive = true;
    attacker.elitePassiveLastRound = state.round ?? 1;
    attacker.atk += MAHITO_ATTACK_BONUS;
    elitePassiveTriggered = { skillId: "mahito-domain", skillName: "自闭圆顿裹", attackBonus: MAHITO_ATTACK_BONUS, effectiveAtk: attacker.atk, round: state.round ?? 1 };
  }
  let jinchurikiTriggered = null;
  const attackerRun = state.runCharacterStates?.[attacker.id] ?? (attacker.id === state.playerId ? state.runCharacterState : null);
  const targetRun = state.runCharacterStates?.[target.id] ?? (target.id === state.playerId ? state.runCharacterState : null);
  const jinchurikiLevel = attacker.passiveLevel ?? attackerRun?.passiveLevel ?? 1;
  const isJinchuriki = (attacker.passiveSkillId ?? attackerRun?.passiveSkillId) === "jinchuriki";
  if (isJinchuriki && jinchurikiLevel >= 2) {
    const belowHalf = attacker.currentHp < attacker.maxHp * .5;
    if (belowHalf && !attacker.jinchurikiActive) {
      const originalAtk = attacker.atk;
      attacker.jinchurikiAttackBonus = Math.floor(originalAtk * SKILL_DATA.jinchuriki.levels[2].attackBonus);
      attacker.atk += attacker.jinchurikiAttackBonus;
      attacker.jinchurikiActive = true;
      jinchurikiTriggered = { skillId: "jinchuriki", skillName: "人柱力", originalAtk, effectiveAtk: attacker.atk,
        attackBonus: SKILL_DATA.jinchuriki.levels[2].attackBonus };
    } else if (!belowHalf && attacker.jinchurikiActive) {
      attacker.atk -= attacker.jinchurikiAttackBonus;
      attacker.jinchurikiAttackBonus = 0;
      attacker.jinchurikiActive = false;
    }
  } else if (attackerRun && state.battleId && !attacker.jinchurikiTriggered) {
    const passive = evaluatePassive(attackerRun, "before_attack", { battleId: state.battleId, currentHp: attacker.currentHp, maxHp: attacker.maxHp });
    if (passive?.skillId === "jinchuriki") {
      const originalAtk = attacker.atk;
      attacker.atk = passive.rounding === "floor" ? Math.floor(originalAtk * (1 + passive.attackBonus)) : originalAtk * (1 + passive.attackBonus);
      attacker.jinchurikiTriggered = true;
      jinchurikiTriggered = { ...passive, originalAtk, effectiveAtk: attacker.atk };
    }
  }
  const skill = Object.hasOwn(attackOptions, "skill") ? attackOptions.skill : triggeredSkill(attacker, random, state.round);
  const isNormalAttack = !skill || skill.normalAttack;
  const deepSeaDefenseGain = attacker.normalPassiveId === "deep_sea_king" && isNormalAttack ? 5 : 0;
  if (attacker.normalPassiveId === "jack" && isNormalAttack)
    attacker.normalPassiveAttackCount = (attacker.normalPassiveAttackCount ?? 0) + 1;
  const edwardTrueDamage = attacker.normalPassiveId === "jack" && isNormalAttack && attacker.normalPassiveAttackCount % 3 === 0;
  if (skill?.effectType === "next-round-reduction") {
    const activeNow = attacker.armorReductionStartRound != null && attacker.armorReductionStartRound <= state.round
      && attacker.armorReductionUntilRound >= state.round;
    attacker.armorReductionStartRound = activeNow ? attacker.armorReductionStartRound : state.round + 1;
    attacker.armorReductionUntilRound = Math.max(attacker.armorReductionUntilRound ?? 0, state.round + 1);
    return { type: "skill", attackerId: attacker.id, targetId: attacker.id, skillId: skill.id,
      skillName: skill.name, skillLevel: skill.level, effectType: skill.effectType,
      reduction: skill.reduction, effectiveFromRound: attacker.armorReductionStartRound,
      effectiveUntilRound: attacker.armorReductionUntilRound };
  }
  if (skill?.effectType === "buff") {
    const duration = Math.max(1, Math.floor(skill.durationTurns ?? 1));
    attacker.defenseBuff = Math.max(attacker.defenseBuff ?? 0, skill.defenseBonus ?? 0);
    attacker.defenseBuffUntilRound = (state.round ?? 1) + duration - 1;
    return {
      type: "skill", attackerId: attacker.id, skillName: skill.name, skillId: skill.id,
      skillLevel: skill.level, effectType: "buff", defenseBonus: skill.defenseBonus ?? 0,
      targetId: attacker.id, targetHp: attacker.currentHp, targetMaxHp: attacker.maxHp,
    };
  }
  if (skill?.id === "eren-hardening") {
    const applied = attacker.hardeningStacks < skill.maxDefenseStacks ? skill.defenseBonus : 0;
    if (applied) {
      attacker.defenseBuff = (attacker.defenseBuff ?? 0) + applied;
      attacker.defenseBuffUntilRound = Infinity;
      attacker.hardeningStacks += 1;
    }
    attacker.reflectStartRound = state.round + 1;
    attacker.reflectUntilRound = state.round + skill.reflectTurns;
    attacker.reflectMultiplier = skill.reflectMultiplier;
    if (skill.taunt) attacker.tauntRounds.push(state.round + 1, state.round + 2);
    return { type: "skill", attackerId: attacker.id, targetId: attacker.id, skillId: skill.id,
      skillName: skill.name, skillLevel: skill.level, effectType: "hardening",
      defenseBonus: applied, defenseStacks: attacker.hardeningStacks,
      reflectUntilRound: attacker.reflectUntilRound, targetHp: attacker.currentHp, targetMaxHp: attacker.maxHp };
  }
  const defenseBonusApplied = skill?.defenseBonus && skill.stackDefenseBonus
    && (attacker.freeWillDefenseStacks ?? 0) < (skill.maxDefenseStacks ?? Infinity) ? skill.defenseBonus : 0;
  if (defenseBonusApplied) {
    attacker.defenseBuff = (attacker.defenseBuff ?? 0) + skill.defenseBonus;
    attacker.defenseBuffUntilRound = skill.defenseDuration === "battle" ? Number.POSITIVE_INFINITY : (state.round ?? 1);
    if (skill.id === "eren-free-will") attacker.freeWillDefenseStacks = (attacker.freeWillDefenseStacks ?? 0) + 1;
  }
  let healedAmount = 0;
  if (skill?.id === "eren-free-will") {
    attacker.freeWillTriggers = (attacker.freeWillTriggers ?? 0) + 1;
    if (!attacker.healingBlocked && attacker.freeWillTriggers % skill.healEveryTriggers === 0) {
      const requested = Math.floor(attacker.maxHp * skill.healMaxHpFraction);
      healedAmount = Math.max(0, Math.min(requested, attacker.maxHp - attacker.currentHp));
      attacker.currentHp += healedAmount;
    }
  }
  if (skill?.tauntNextRound) {
    attacker.tauntRounds ??= [];
    if (!attacker.tauntRounds.includes((state.round ?? 0) + 1)) attacker.tauntRounds.push((state.round ?? 0) + 1);
  }
  const shieldsGranted = [];
  if (skill?.teamShield) for (const ally of state.characters.filter((unit) => unit.team === attacker.team && unit.alive && unit.currentHp > 0)) {
    const previous = ally.shieldHp ?? 0;
    ally.shieldHp = Math.max(previous, skill.teamShield);
    shieldsGranted.push({ targetId: ally.id, amount: ally.shieldHp - previous, total: ally.shieldHp, cap: skill.teamShield });
  }
  const directDamageSkill = skill && !skill.normalAttack && (skill.effectType ?? "damage") === "damage";
  const dodgeChance = directDamageSkill ? getSkillDodgeChance(target) : getDodgeChance(target);
  const dodged = !(attacker.unavoidableAttack || skill?.unavoidable) && random() < dodgeChance;
  const targetHpBefore = target.currentHp;
  const critChance = skill?.guaranteedCritBelowHpRatio != null && targetHpBefore < target.maxHp * skill.guaranteedCritBelowHpRatio
    ? 1 : getCritChance(attacker);
  const critical = !dodged && random() < critChance;
  const formula = skill?.multiplierFormula;
  const skillMultiplier = !skill ? 1 : formula
    ? (formula.base ?? 0) + (attacker[formula.stat] ?? 0) * (formula.coefficient ?? 0)
    : skill.multiplier ?? 1;
  const currentDefenseBonus = (attacker.defenseBuffUntilRound ?? -1) >= (state.round ?? 1) ? attacker.defenseBuff ?? 0 : 0;
  let skillAttackPower = skill?.attackFormula === "atk_plus_current_def"
    ? attacker.atk + attacker.def + currentDefenseBonus
    : skill?.attackFormula === "atk_plus_spd" ? attacker.atk + attacker.spd
    : skill?.attackFormula === "atk_plus_current_hp_fraction" ? attacker.atk + Math.floor(attacker.currentHp * skill.hpFraction) : attacker.atk;
  if (attacker.normalPassiveId === "lubu" && state.round === 1 && isNormalAttack) skillAttackPower *= 2;
  if (attacker.stageThreeKind === "quanxi") skillAttackPower += Math.floor((target.maxHp - target.currentHp) * .5);
  const targetEffectiveDef = edwardTrueDamage ? 0 : combatDefense(target, state.round ?? 1);
  const ignoredDef = skill?.ignoreDefenseFromOwnDef
    ? Math.floor((attacker.def + currentDefenseBonus) * skill.ignoreDefenseFromOwnDef) : 0;
  const critMultiplier = (attacker.critMultiplier ?? COMBAT_RULES.critMultiplier)
    + (attacker.passiveSkillId === "kaneki-one-eye" && attacker.passiveLevel >= 2 ? SKILL_DATA["kaneki-one-eye"].levels[2].critDamageBonus : 0)
    + (attacker.passiveSkillId === "kaneki-one-eye-king" && state.round <= attacker.oneEyeKingUntilRound ? .4 : 0)
    + (attacker.reactiveCritDamageBonus ?? 0);
  let damage = dodged ? 0 : calculateDamage({ ...attacker, atk: skillAttackPower },
    { ...target, def: skill?.ignoreDefenseFromOwnDef ? Math.max(0, targetEffectiveDef - ignoredDef)
      : targetEffectiveDef * (1 - (attacker.stageThreeKind === "arima" && (attacker.arimaHits?.[target.id] ?? 0) >= 3 ? .8 : skill?.ignoreDefenseFraction ?? 0)) },
    skillMultiplier * (critical ? critMultiplier : 1));
  if (damage > 0 && Number.isInteger(attacker.weaknessRound) && attacker.weaknessRound === state.round)
    damage = Math.max(1, Math.floor(damage * .5));
  if (!dodged && attacker.damageDealtMultiplier > 1) damage = Math.floor(damage * attacker.damageDealtMultiplier);
  let passiveTriggered = null;
  if (!dodged && state.battleId) {
    if (attackerRun) {
      const passive = evaluatePassive(attackerRun, "before_attack", { battleId: state.battleId, damage });
      if (passive) damage = Math.max(1, passive.finalDamage ?? damage);
    }
    if (targetRun) {
      passiveTriggered = evaluatePassive(targetRun, "before_damage", { battleId: state.battleId, damage });
      if (passiveTriggered) damage = passiveTriggered.damageImmune ? 0 : Math.max(1, passiveTriggered.finalDamage ?? damage);
    }
  }
  if (!dodged && target.damageTakenMultiplier > 1) damage = Math.floor(damage * target.damageTakenMultiplier);
  if (damage > 0 && target.borosPhase === 1) damage = Math.max(1, Math.floor(damage * .9));
  if (damage > 0 && target.id === "tang" && state.characters.some((unit) => unit.summonerId === "tang" && unit.alive && unit.currentHp > 0))
    damage = Math.max(1, Math.floor(damage * .8));
  if (damage > 0 && target.tangSummonKind === "wukong" && target.wukongReductionRound === state.round)
    damage = Math.max(1, Math.floor(damage * (1 - SKILL_DATA["wukong-fate"].levels[1].damageResistance)));
  const armorReductionApplied = damage > 0 && target.id === "armored-titan"
    && target.armorReductionStartRound != null && state.round >= target.armorReductionStartRound
    && state.round <= target.armorReductionUntilRound;
  if (armorReductionApplied) damage = Math.max(1, Math.floor(damage * (1 - SKILL_DATA["reiner-sat-down"].levels[1].reduction)));
  damage = applyNormalDamageReduction(target, damage);
  damage = applyTojiExhaustion(target, damage);
  const attackGuard = !dodged && damage > 0 && !directDamageSkill &&
    (target.stageThreeKind === "arima" || target.quinqueGuard) && random() < .5;
  if (attackGuard) damage = Math.max(1, Math.floor(damage * .5));
  const shieldAbsorbed = Math.min(damage, target.shieldHp ?? 0);
  target.shieldHp = Math.max(0, (target.shieldHp ?? 0) - shieldAbsorbed);
  damage -= shieldAbsorbed;
  const trialDamage = applyTrialDamage(state, target, damage);
  if (trialDamage.odinImmune || trialDamage.delayedDamage || trialDamage.heraclesHitsRemaining != null ||
      trialDamage.pathsImmune || trialDamage.cloneSpent || trialDamage.damageAdjusted) damage = trialDamage.dealt;
  const actualDamage = trialDamage.emergencyHeal ? trialDamage.dealt : targetHpBefore - target.currentHp;
  let summonerHealedAmount = 0;
  const summoner = attacker.summonerId && state.characters.find((unit) => unit.id === attacker.summonerId);
  if (summoner?.alive && !summoner.healingBlocked && summoner.passiveSkillId === "tang-flesh" && (summoner.passiveLevel ?? 1) >= 2 && damage > 0) {
    summonerHealedAmount = Math.min(summoner.maxHp - summoner.currentHp, Math.floor(actualDamage * .2));
    summoner.currentHp += summonerHealedAmount;
  }
  accumulateBombDamage(state, target.id, actualDamage);
  const oneEyeTriggered = damage > 0 && actualDamage > 0 && critical &&
    ["kaneki-one-eye", "kaneki-one-eye-king"].includes(attacker.passiveSkillId);
  let oneEyeHealedAmount = 0;
  if (oneEyeTriggered && !attacker.healingBlocked) {
    const ratio = attacker.passiveSkillId === "kaneki-one-eye-king" ? .3
      : SKILL_DATA["kaneki-one-eye"].levels[attacker.passiveLevel ?? 1].healFromCalculatedDamage;
    oneEyeHealedAmount = Math.max(0, Math.min(attacker.maxHp - attacker.currentHp,
      Math.floor((attacker.passiveSkillId === "kaneki-one-eye-king" ? actualDamage : damage) * ratio)));
    attacker.currentHp += oneEyeHealedAmount;
    healedAmount += oneEyeHealedAmount;
  }
  let damageSkillTriggered = null;
  const reactiveSkill = target.skills?.find((entry) => ["kaneki-1000-7", "kaneki-2000-14"].includes(entry.id))
    ?? (target.skill?.id === "kaneki-1000-7" ? target.skill : null);
  if (actualDamage > 0 && reactiveSkill) {
    target.damageTakenHits = (target.damageTakenHits ?? 0) + 1;
    if (target.damageTakenHits % reactiveSkill.hitsPerTrigger === 0) {
      target.critRateBonus = (target.critRateBonus ?? 0) + reactiveSkill.critRateBonus;
      target.dodgeRateBonus = (target.dodgeRateBonus ?? 0) + reactiveSkill.dodgeRateBonus;
      target.battleAttackBonus = (target.battleAttackBonus ?? 0) + (reactiveSkill.attackBonus ?? 0);
      target.atk += reactiveSkill.attackBonus ?? 0;
      damageSkillTriggered = {
        skillId: reactiveSkill.id, skillName: reactiveSkill.name, hits: target.damageTakenHits,
        critRateGain: reactiveSkill.critRateBonus, dodgeRateGain: reactiveSkill.dodgeRateBonus,
        critRateBonus: target.critRateBonus, dodgeRateBonus: target.dodgeRateBonus,
        attackGain: reactiveSkill.attackBonus ?? 0, effectiveAtk: target.atk,
      };
    }
  }
  if (skill?.id === "eren-warhammer") attacker.def = Math.max(0, attacker.def - skill.defenseCost);
  let died = !dodged && handleDeath(target);
  const burnStacksBefore = target.burnStacks ?? 0;
  const bleedStacksBefore = target.bleedStacks ?? 0;
  if (actualDamage > 0 && attacker.trialPassive === "jogo" && target.team !== attacker.team)
    target.burnStacks = (target.burnStacks ?? 0) + 5;
  if (actualDamage > 0 && attacker.trialPassive === "heracles" && !skill && target.team !== attacker.team)
    target.bleedStacks = (target.bleedStacks ?? 0) + 1;
  if (actualDamage > 0 && attacker.stageThreeKind === "burn") {
    target.burnStacks = (target.burnStacks ?? 0) + 1;
    target.stageThreeDot = true;
  }
  if (actualDamage > 0 && attacker.stageThreeKind === "bleed") {
    target.bleedStacks = (target.bleedStacks ?? 0) + 1;
    target.stageThreeDot = true;
  }
  if (actualDamage > 0 && attacker.stageThreeKind === "arima") {
    attacker.arimaHits ??= {};
    attacker.arimaHits[target.id] = (attacker.arimaHits[target.id] ?? 0) + 1;
  }
  const arimaHitCount = attacker.stageThreeKind === "arima" ? attacker.arimaHits?.[target.id] ?? 0 : null;
  const arimaWeaknessRevealed = actualDamage > 0 && arimaHitCount === 3 && target.alive;
  const arimaCritAwakened = target.stageThreeKind === "arima" && target.alive
    && targetHpBefore >= target.maxHp * .6 && target.currentHp < target.maxHp * .6;
  const medusaStun = actualDamage > 0 && !died && attacker.normalPassiveId === "medusa" && random() < .2;
  const shijiSilence = actualDamage > 0 && !died && attacker.normalPassiveId === "shiji" && random() < .4;
  if (actualDamage > 0 && skill?.id === "arima-pierce" || shijiSilence) target.silencedThroughRound = state.round + 1;
  if (actualDamage > 0 && skill?.id === "odin-gungnir" && target.team !== attacker.team || medusaStun)
    target.stunNextAction = true;
  const scorpionHeals = healScorpionAllies(state, target, actualDamage);
  if (skill?.id === "gilgamesh-enuma-elish" && attackOptions.gilgameshCast === 1 && !dodged && actualDamage > 0 && !died)
    target.weaknessRound = state.round + 1;
  const phaseChange = !died ? changeBorosPhase(state, target) : null;
  if (died && state.bombs) state.bombs = state.bombs.filter((bomb) => bomb.targetId !== target.id);
  const bombAttached = actualDamage > 0 && !died && attacker.elitePassiveId === "killer-queen"
    ? attachBomb(state, attacker, target) : null;
  const defenseFloor = Number.isFinite(skill?.defenseFloor) ? skill.defenseFloor : 0;
  const nextDefense = !dodged && !died && (skill?.defenseReduction ?? 0) > 0
    ? Math.max(defenseFloor, target.def - skill.defenseReduction)
    : target.def;
  const defenseReduced = target.def - nextDefense;
  if (defenseReduced > 0) target.def = nextDefense;
  let extraTrueDamage = null;
  if (skill?.id === "eren-free-will" && skill.extraTrueDamageEvery && attacker.freeWillTriggers % skill.extraTrueDamageEvery === 0 && target.alive) {
    const requested = Math.max(0, Math.floor((attacker.def + currentDefenseBonus) * skill.extraTrueDamageDefRatio));
    const hpBefore = target.currentHp;
    const exhaustedDamage = applyTojiExhaustion(target, requested);
    const absorbed = Math.min(exhaustedDamage, target.shieldHp ?? 0);
    target.shieldHp -= absorbed;
    const trialExtra = applyTrialDamage(state, target, exhaustedDamage - absorbed, "attached");
    const actual = hpBefore - target.currentHp;
    accumulateBombDamage(state, target.id, actual);
    extraTrueDamage = { requested, actualDamage: actual, shieldAbsorbed: absorbed, hpBefore,
      hpAfter: target.currentHp, targetDied: handleDeath(target), trialDamage: trialExtra,
      scorpionHeals: healScorpionAllies(state, target, actual) };
    if (extraTrueDamage.targetDied) { died = true; state.bombs = state.bombs.filter((bomb) => bomb.targetId !== target.id); }
  }
  const predatorKillBonus = ["kaneki-predator", "kaneki-glutton"].includes(skill?.id) && skill.killMaxHpBonus && !dodged && target.currentHp <= 0
    ? skill.killMaxHpBonus : 0;
  if (predatorKillBonus) {
    attacker.maxHp += predatorKillBonus;
    if (attackerRun) attackerRun.maxHp += predatorKillBonus;
  }
  let oneEyeKingAttackBonus = 0;
  if (died && attacker.passiveSkillId === "kaneki-one-eye-king" && state.round <= attacker.oneEyeKingUntilRound) {
    oneEyeKingAttackBonus = 10;
    attacker.atk += oneEyeKingAttackBonus;
    if (attackerRun) attackerRun.atk += oneEyeKingAttackBonus;
  }
  const evolutionHeals = [];
  const tangCompassion = state.characters.find((unit) => unit.team === attacker.team && unit.id === "tang" &&
    unit.alive && unit.passiveSkillId === "tang-compassion" && unit.currentHp < unit.maxHp * .6);
  if (tangCompassion && actualDamage > 0 && !tangCompassion.healingBlocked) {
    const amount = Math.min(tangCompassion.maxHp - tangCompassion.currentHp, Math.floor(actualDamage * .2));
    tangCompassion.currentHp += amount;
    if (amount) evolutionHeals.push({ targetId: tangCompassion.id, amount, currentHp: tangCompassion.currentHp });
  }
  const shieldNaruto = state.characters.find((unit) => unit.team === attacker.team && unit.id === "naruto" &&
    unit.passiveSkillId === "naruto-nine-tails-bond" && unit.nineTailsTriggeredIds.length && unit.alive);
  if (shieldNaruto && attacker.id === shieldNaruto.id && actualDamage > 0) {
    const amount = Math.floor(actualDamage * .1);
    for (const teammateId of shieldNaruto.nineTailsTriggeredIds) {
      const teammate = state.characters.find((unit) => unit.id === teammateId && unit.alive);
      if (teammate && amount > 0) {
        teammate.shieldHp += amount;
        shieldsGranted.push({ targetId: teammate.id, amount, total: teammate.shieldHp });
      }
    }
  }
  const jinchurikiLifesteal = !attacker.healingBlocked && isJinchuriki && jinchurikiLevel >= 2 && attacker.jinchurikiActive && actualDamage > 0
    ? Math.min(attacker.maxHp - attacker.currentHp, Math.floor(actualDamage * (SKILL_DATA.jinchuriki.levels[2].lifesteal ?? 0))) : 0;
  if (jinchurikiLifesteal) { attacker.currentHp += jinchurikiLifesteal; healedAmount += jinchurikiLifesteal; }
  const treasureLifesteal = !attacker.healingBlocked && actualDamage > 0 && attacker.lifesteal > 0
    ? Math.min(attacker.maxHp - attacker.currentHp, Math.floor(actualDamage * attacker.lifesteal)) : 0;
  if (treasureLifesteal) { attacker.currentHp += treasureLifesteal; healedAmount += treasureLifesteal; }
  const nineTailsLifesteal = !attacker.healingBlocked && actualDamage > 0 && attacker.nineTailsLowHpActive
    ? Math.min(attacker.maxHp - attacker.currentHp, Math.floor(actualDamage * .2)) : 0;
  if (nineTailsLifesteal) { attacker.currentHp += nineTailsLifesteal; healedAmount += nineTailsLifesteal; }
  syncNineTailsPassive(attacker);
  // An attack attempt grants armor even when the target dodges; one action grants one stack.
  if (deepSeaDefenseGain) attacker.def += deepSeaDefenseGain;
  const jinchurikiExpired = attacker.jinchurikiActive && attacker.currentHp >= attacker.maxHp * .5;
  if (jinchurikiExpired) {
    attacker.atk -= attacker.jinchurikiAttackBonus;
    attacker.jinchurikiAttackBonus = 0;
    attacker.jinchurikiActive = false;
  }
  return {
    type: "attack", attackerId: attacker.id, targetId: target.id, damage, dodged,
    hit: !dodged, dodgeChance, critical, critChance, skilled: Boolean(skill),
    attackKind: directDamageSkill ? "skill" : "normal",
    attackType: skill?.attackType || attacker.attackType || "melee",
    skillId: skill?.id ?? null, skillLevel: skill?.level ?? null,
    skillName: skill?.name ?? null,
    normalPassiveId: attacker.normalPassiveId ?? null, edwardTrueDamage, deepSeaDefenseGain,
    attackerDef: deepSeaDefenseGain ? attacker.def : null,
    skillCastId: skill ? [state.battleId ?? "battle", state.round, attacker.id].join(":") : null,
    skillMultiplier: skill ? skillMultiplier : null,
    skillAttackPower: skill?.attackFormula ? skillAttackPower : null,
    skillCloneCount: skill?.cloneCount ?? null,
    defenseBonusApplied,
    freeWillDefenseStacks: skill?.id === "eren-free-will" ? attacker.freeWillDefenseStacks : null,
    freeWillTriggerCount: skill?.id === "eren-free-will" ? attacker.freeWillTriggers : null,
    healedAmount, oneEyeTriggered, oneEyeHealedAmount, treasureLifesteal, actualDamage, calculatedDamage: damage, attackerHp: attacker.currentHp, damageSkillTriggered,
    evolutionHeals, oneEyeKingAttackBonus, nineTailsLifesteal,
    warhammerDefenseCost: skill?.id === "eren-warhammer" ? skill.defenseCost : 0,
    summonerId: summoner?.id ?? null, summonerHealedAmount, summonerHp: summoner?.currentHp ?? null,
    hpBefore: targetHpBefore,
    shieldAbsorbed, targetShield: target.shieldHp, shieldsGranted, weaknessApplied: target.weaknessRound === state.round + 1,
    extraTrueDamage, predatorKillBonus, jinchurikiLifesteal,
    trialDamage, burnStacks: target.burnStacks ?? 0, bleedStacks: target.bleedStacks ?? 0,
    burnStacksApplied: (target.burnStacks ?? 0) - burnStacksBefore,
    bleedStacksApplied: (target.bleedStacks ?? 0) - bleedStacksBefore,
    stunApplied: actualDamage > 0 && skill?.id === "odin-gungnir" || medusaStun, scorpionHeals,
    tauntApplied: Boolean(skill?.tauntNextRound), jinchurikiExpired,
    jinchurikiTriggered,
    elitePassiveTriggered,
    passiveTriggered: passiveTriggered ? { skillId: passiveTriggered.skillId, damageImmune: Boolean(passiveTriggered.damageImmune) } : null,
    defenseReduced, armorReductionApplied, attackGuard, arimaHitCount, arimaWeaknessRevealed, arimaCritAwakened,
    silenceUntilRound: skill?.id === "arima-pierce" && actualDamage > 0 || shijiSilence ? target.silencedThroughRound : null,
    phaseChange, bombAttached, segmentIndex: attackOptions.segmentIndex ?? null,
    segmentCount: attackOptions.segmentCount ?? null, skillCastNumber: attackOptions.skillCastNumber ?? null,
    targetDef: target.def,
    attackerTeam: attacker.team,
    targetHp: target.currentHp, targetMaxHp: target.maxHp, targetDied: died,
  };
}

function recordC0Action(state, event) {
  const c0 = state.c0;
  if (!c0 || c0.detonated || event.type !== "attack") return null;
  if (c0.currentRound !== state.round) {
    c0.currentRound = state.round;
    c0.playerActionDone = false;
    c0.bossActionDone = false;
  }
  const actor = state.characters.find((character) => character.id === event.attackerId);
  if (actor?.team === "ally") c0.playerActionDone = true;
  if (actor?.id === c0.bossId) c0.bossActionDone = true;
  if (!c0.playerActionDone || !c0.bossActionDone) return null;
  c0.completedRounds += 1;
  c0.playerActionDone = false;
  c0.bossActionDone = false;
  return { type: "c0-charge", bossId: c0.bossId, completedRounds: c0.completedRounds, accumulatedDamage: c0.completedRounds * c0.damagePerRound };
}

function resolveTrueDamageSkill(state, attacker, target, skill, amount) {
  const hpBefore = target.currentHp;
  const reduced = target.tangSummonKind === "wukong" && target.wukongReductionRound === state.round
    ? Math.floor(amount * (1 - SKILL_DATA["wukong-fate"].levels[1].damageResistance)) : amount;
  const amplified = applyTojiExhaustion(target, reduced);
  const shieldAbsorbed = Math.min(amplified, target.shieldHp ?? 0);
  target.shieldHp = Math.max(0, (target.shieldHp ?? 0) - shieldAbsorbed);
  let damage = amplified - shieldAbsorbed;
  const trialDamage = applyTrialDamage(state, target, damage);
  if (trialDamage.odinImmune || trialDamage.delayedDamage || trialDamage.heraclesHitsRemaining != null ||
      trialDamage.pathsImmune || trialDamage.cloneSpent || trialDamage.damageAdjusted) damage = trialDamage.dealt;
  const actualDamage = trialDamage.emergencyHeal ? trialDamage.dealt : hpBefore - target.currentHp;
  accumulateBombDamage(state, target.id, actualDamage);
  const targetDied = handleDeath(target);
  const scorpionHeals = healScorpionAllies(state, target, actualDamage);
  const summoner = attacker.summonerId && state.characters.find((unit) => unit.id === attacker.summonerId);
  const summonerHealedAmount = summoner?.alive && !summoner.healingBlocked && (summoner.passiveLevel ?? 1) >= 2
    ? Math.min(summoner.maxHp - summoner.currentHp, Math.floor(actualDamage * .2)) : 0;
  if (summonerHealedAmount) summoner.currentHp += summonerHealedAmount;
  return { type: "attack", attackerId: attacker.id, attackerTeam: attacker.team, targetId: target.id,
    skillId: skill.id, skillName: skill.name, skillLevel: skill.level, skilled: true, attackKind: "skill",
    attackType: "magic", trueDamage: true, damage, actualDamage, calculatedDamage: damage,
    dodged: false, hit: true, critical: false, shieldAbsorbed, targetShield: target.shieldHp, trialDamage, scorpionHeals,
    targetHp: target.currentHp, targetMaxHp: target.maxHp, targetDied, attackerHp: attacker.currentHp,
    summonerId: summoner?.id ?? null, summonerHealedAmount, summonerHp: summoner?.currentHp ?? null };
}

function resolveCloneSplash(state, attacker, primary, skill, random) {
  const splash = [];
  const base = Math.floor(primary.calculatedDamage * skill.splashRatio);
  const otherTargets = state.characters.filter((unit) => unit.team !== attacker.team && unit.id !== primary.targetId && unit.alive && unit.currentHp > 0);
  const primaryTarget = state.characters.find((unit) => unit.id === primary.targetId);
  const splashTargets = otherTargets.length ? otherTargets : primaryTarget?.alive && primaryTarget.currentHp > 0 ? [primaryTarget] : [];
  for (const target of splashTargets) {
    const dodged = !attacker.unavoidableAttack && random() < getSkillDodgeChance(target);
    let damage = dodged ? 0 : applyTojiExhaustion(target, applyNormalDamageReduction(target, calculateDamage({ atk: base }, { def: combatDefense(target, state.round) })));
    const shieldAbsorbed = Math.min(damage, target.shieldHp ?? 0);
    target.shieldHp = Math.max(0, (target.shieldHp ?? 0) - shieldAbsorbed);
    damage -= shieldAbsorbed;
    const hpBefore = target.currentHp;
    const trialDamage = applyTrialDamage(state, target, damage, target.id === primary.targetId ? "attached" : "attack");
    if (trialDamage.odinImmune || trialDamage.delayedDamage || trialDamage.heraclesHitsRemaining != null || trialDamage.damageAdjusted) damage = trialDamage.dealt;
    const actualDamage = hpBefore - target.currentHp;
    accumulateBombDamage(state, target.id, actualDamage);
    const targetDied = handleDeath(target);
    const scorpionHeals = healScorpionAllies(state, target, actualDamage);
    splash.push({ type: "attack", attackerId: attacker.id, attackerTeam: attacker.team, targetId: target.id,
      skillId: skill.id, skillName: skill.name, skillLevel: skill.level, skilled: true, splash: true,
      attackKind: "skill", attackType: "magic", damage, actualDamage, calculatedDamage: damage,
      dodged, hit: !dodged, critical: false, shieldAbsorbed, targetShield: target.shieldHp, trialDamage, scorpionHeals,
      targetHp: target.currentHp, targetMaxHp: target.maxHp, targetDied, attackerHp: attacker.currentHp, round: state.round });
  }
  return splash;
}

function resolveChakraBurst(state, attacker, target, skill, random) {
  if (!target?.alive) return null;
  const clones = Math.max(0, attacker.chakraClones ?? 0);
  const power = Math.floor(clones * .5 * attacker.atk);
  if (power <= 0) return null;
  const before = target.currentHp;
  const requested = applyNormalDamageReduction(target, applyTojiExhaustion(target,
    calculateDamage({ atk: Math.max(1, power) }, { def: combatDefense(target, state.round) })));
  const shieldAbsorbed = Math.min(requested, target.shieldHp ?? 0);
  target.shieldHp -= shieldAbsorbed;
  const trialDamage = applyTrialDamage(state, target, requested - shieldAbsorbed, "attached");
  const actualDamage = before - target.currentHp;
  const targetDied = handleDeath(target);
  if (actualDamage > 0 && !targetDied && random() < .25) target.stunNextAction = true;
  return { type: "attack", attackerId: attacker.id, attackerTeam: attacker.team, targetId: target.id,
    skillId: skill.id, skillName: "超大玉螺旋丸", skillLevel: skill.level, skilled: true,
    attackKind: "skill", attackType: "melee", chakraBurst: true, damage: trialDamage.dealt,
    actualDamage, calculatedDamage: requested - shieldAbsorbed, shieldAbsorbed,
    targetShield: target.shieldHp, targetHp: target.currentHp, targetMaxHp: target.maxHp,
    targetDied, attackerHp: attacker.currentHp, trialDamage,
    stunApplied: actualDamage > 0 && !targetDied && target.stunNextAction };
}

function createTangSummon(state, summoner, skill, random) {
  const seen = summoner.tangSummonedKinds ??= [];
  const kind = chooseTangSummon(skill.level, seen, random);
  if (!kind) return { type: "summon-failed", round: state.round, summonerId: summoner.id,
    skillName: skill.name, reason: "本场已召唤过该种类" };
  const visual = tangSummonVisual(kind);
  const stats = tangSummonStats(kind, { ...summoner, currentRound: state.round });
  const skillConfig = SKILL_DATA[visual.skillId];
  const summoned = { ...visual, ...stats, id: `tang-${kind}-${state.round}`, tangSummonKind: kind,
    summonerId: summoner.id, team: summoner.team, originalTeam: summoner.originalTeam ?? summoner.team,
    controlledByMakima: Boolean(summoner.controlledByMakima), row: "front", position: "front", rosterOrder: 10,
    maxHp: stats.hp, currentHp: stats.hp, alive: true, critChance: summoner.critChance ?? COMBAT_RULES.baseCritChance,
    critMultiplier: summoner.critMultiplier ?? COMBAT_RULES.critMultiplier,
    skills: [{ ...skillConfig, ...skillConfig.levels[1], chance: skill.summonSkillChance, level: 1 }] };
  if (summoner.tangSummonHpBonus) {
    summoned.maxHp += summoner.tangSummonHpBonus;
    summoned.hp = summoned.maxHp;
    summoned.currentHp = summoned.maxHp;
  }
  summoned.healingBlocked = Boolean(summoner.healingBlocked);
  if (summoner.odinMimirStat) {
    const stat = summoner.odinMimirStat;
    summoned.odinMimirStat = stat;
    summoned[stat] = Math.max(stat === "maxHp" ? 1 : 0, Math.floor(summoned[stat] * .5));
    if (stat === "maxHp") { summoned.hp = summoned.maxHp; summoned.currentHp = summoned.maxHp; }
  }
  state.characters.push(summoned);
  seen.push(kind);
  const tangRun = state.runCharacterStates?.[summoner.id]
    ?? (state.runCharacterState?.characterId === summoner.id ? state.runCharacterState : null);
  const repeatedWukong = kind === "wukong" && !summoner.tangWukongReconciled &&
    tangRun?.lastSuccessfulTangSummonKind === "wukong";
  if (tangRun) tangRun.lastSuccessfulTangSummonKind = kind;
  if (repeatedWukong) {
    summoned.currentHp = Math.max(1, Math.floor(summoned.maxHp * 0.5));
    summoner.tangRepeatedWukongAtkBonus = Math.floor(summoner.atk * 0.1);
    summoner.atk += summoner.tangRepeatedWukongAtkBonus;
  }
  summoner.tangActiveSummonId = summoned.id;
  summoner.tangMeditating = true;
  summoner.tangMeditationRounds = 0;
  summoner.tangSummonStartRound = state.round;
  return { type: "summon", round: state.round, summonerId: summoner.id,
    skillName: skill.name, character: { ...summoned }, repeatedWukong,
    tangAtkBonus: summoner.tangRepeatedWukongAtkBonus ?? 0 };
}

function syncTangSummons(state, events) {
  const tang = state.characters.find((unit) => unit.id === "tang");
  if (!tang) return;
  const summons = state.characters.filter((unit) => unit.summonerId === tang.id && unit.alive && unit.currentHp > 0);
  if (!tang.alive || tang.currentHp <= 0) {
    for (const summon of summons) {
      summon.currentHp = 0; summon.alive = false;
      events.push({ type: "summon-dismissed", targetId: summon.id, summonerId: tang.id, round: state.round });
    }
  }
  if (!tang.alive || !summons.length) {
    if (tang.tangRepeatedWukongAtkBonus) {
      tang.atk -= tang.tangRepeatedWukongAtkBonus;
      tang.tangRepeatedWukongAtkBonus = 0;
    }
    if (tang.tangMeditating) events.push({ type: "meditation-end", summonerId: tang.id, round: state.round });
    tang.tangMeditating = false; tang.tangActiveSummonId = null; tang.tangMeditationRounds = 0;
    tang.meditationDharmaRounds = 0;
  }
}

function resolveNichirinBonus(state, attacker, target, attack) {
  if (!attacker.normalAttackCurrentHpRatio || attack.skilled || attack.dodged || attack.actualDamage <= 0 ||
    !target.alive || target.currentHp <= 0) return null;
  const requested = Math.floor(attack.hpBefore * attacker.normalAttackCurrentHpRatio);
  if (requested <= 0) return null;
  const hpBefore = target.currentHp;
  const amplified = applyTojiExhaustion(target, requested);
  const shieldAbsorbed = Math.min(amplified, target.shieldHp ?? 0);
  target.shieldHp = Math.max(0, (target.shieldHp ?? 0) - shieldAbsorbed);
  let damage = amplified - shieldAbsorbed;
  const trialDamage = applyTrialDamage(state, target, damage, "attached");
  if (trialDamage.odinImmune || trialDamage.delayedDamage || trialDamage.heraclesHitsRemaining != null || trialDamage.damageAdjusted) damage = trialDamage.dealt;
  const actualDamage = hpBefore - target.currentHp;
  accumulateBombDamage(state, target.id, actualDamage);
  const targetDied = handleDeath(target);
  const scorpionHeals = healScorpionAllies(state, target, actualDamage);
  if (targetDied) state.bombs = state.bombs.filter((bomb) => bomb.targetId !== target.id);
  const phaseChange = targetDied ? null : changeBorosPhase(state, target);
  return { type: "treasure-damage", treasureId: "nichirin_blade", attackerId: attacker.id,
    targetId: target.id, round: state.round, basisHp: attack.hpBefore, requested,
    damage, actualDamage, shieldAbsorbed, targetShield: target.shieldHp, trialDamage, scorpionHeals,
    hpBefore, hpAfter: target.currentHp, targetDied, phaseChange };
}

function resolveJasonBonus(state, attacker, target, attack) {
  if (!attacker.everyThirdNormalAttack || attack.skilled) return null;
  attacker.normalAttackCount = (attacker.normalAttackCount ?? 0) + 1;
  if (attacker.normalAttackCount % 3 || attack.dodged || attack.actualDamage <= 0 || !target.alive) return null;
  const maxHpBefore = target.maxHp;
  const requested = Math.floor(maxHpBefore * attacker.everyThirdNormalAttack.maxHpRatio);
  const reduction = Math.min(requested, maxHpBefore - 1);
  if (reduction <= 0) return null;
  const hpBefore = target.currentHp;
  target.maxHp = maxHpBefore - reduction;
  target.currentHp = Math.min(hpBefore, target.maxHp);
  return { type: "jason-max-hp", attackerId: attacker.id, targetId: target.id, round: state.round,
    skillName: attacker.everyThirdNormalAttack.name, attackCount: attacker.normalAttackCount,
    requested, reduction, maxHpBefore, maxHpAfter: target.maxHp,
    hpBefore, hpAfter: target.currentHp, actualDamage: 0 };
}

function detonateC0(state) {
  const c0 = state.c0;
  if (!c0 || c0.detonated) return null;
  c0.detonated = true;
  const damage = c0.completedRounds * c0.damagePerRound;
  const targets = state.characters.filter((character) => character.team === "ally" && character.alive && character.currentHp > 0)
    .map((player) => {
      const hpBefore = player.currentHp;
      const shieldAbsorbed = Math.min(damage, player.shieldHp ?? 0);
      player.shieldHp = Math.max(0, (player.shieldHp ?? 0) - shieldAbsorbed);
      player.currentHp = Math.max(0, hpBefore - (damage - shieldAbsorbed));
      const died = handleDeath(player);
      return { targetId: player.id, hpBefore, hpAfter: player.currentHp, shieldAbsorbed,
        targetShield: player.shieldHp, actualDamage: hpBefore - player.currentHp, died };
    });
  return { type: "c0-detonate", bossId: c0.bossId, completedRounds: c0.completedRounds,
    damage, targets, trueDamage: true };
}

// Resolve the complete battle up front. The UI only replays these immutable results,
// so animation speed cannot affect random choices or apply damage twice.
function applyTrialBattleStart(state, events, random) {
  for (const odinTarget of state.characters.filter((unit) => unit.team === "ally" && unit.odinMimirStat))
    events.push({ type: "odin-mimir", targetId: odinTarget.id, stat: odinTarget.odinMimirStat,
      targetHp: odinTarget.currentHp, targetMaxHp: odinTarget.maxHp });
  for (const esdeath of state.characters.filter((unit) => unit.alive && unit.trialPassive === "esdeath")) {
    for (const target of state.characters.filter((unit) => unit.team !== esdeath.team && unit.alive)) {
      target.frozenThroughRound = 2;
      target.spd = Math.max(0, target.spd - 80);
      if (Number.isFinite(target.spdWithoutRoundEffects)) target.spdWithoutRoundEffects = Math.max(0, target.spdWithoutRoundEffects - 80);
      events.push({ type: "trial-freeze", attackerId: esdeath.id, targetId: target.id,
        throughRound: 2, speedLoss: 80, effectiveSpd: target.spd });
    }
  }
  for (const ahFu of state.characters.filter((unit) => unit.alive && unit.trialPassive === "ah_fu")) {
    const opponents = state.characters.filter((unit) => unit.team !== ahFu.team && unit.alive && unit.currentHp > 0);
    const target = opponents[Math.floor(Math.min(.999999999999, Math.max(0, Number(random()) || 0)) * opponents.length)];
    if (!target) continue;
    const amount = Math.min(60, Math.max(0, target.def));
    target.def -= amount;
    ahFu.def += amount;
    ahFu.stolenDefense = { targetId: target.id, amount, returned: false };
    events.push({ type: "ah-fu-steal", attackerId: ahFu.id, targetId: target.id,
      amount, targetDef: target.def, attackerDef: ahFu.def });
  }
}

function resolveAhFuDefeat(state, target, events) {
  if (target.trialPassive !== "ah_fu" || !target.stolenDefense || target.stolenDefense.returned) return;
  const stolen = target.stolenDefense;
  const victim = state.characters.find((unit) => unit.id === stolen.targetId);
  if (victim) victim.def += stolen.amount;
  stolen.returned = true;
  events.push({ type: "ah-fu-return", attackerId: target.id, targetId: stolen.targetId,
    amount: stolen.amount, targetDef: victim?.def ?? null, round: state.round });
}

function resolveTrialRoundEnd(state) {
  const events = [];
  for (const unit of state.characters) {
    if (!unit.alive || unit.currentHp <= 0) continue;
    const due = (unit.delayedDamage ?? []).filter((entry) => entry.dueRound <= state.round);
    unit.delayedDamage = (unit.delayedDamage ?? []).filter((entry) => entry.dueRound > state.round);
    for (const item of due) {
      const before = unit.currentHp;
      const effect = applyTrialDamage(state, unit, item.amount, "due");
      const died = handleDeath(unit);
      events.push({ type: "trial-delayed-hit", targetId: unit.id, round: state.round,
        requested: item.amount, damage: before - unit.currentHp, hpAfter: unit.currentHp, targetDied: died, effect });
      if (died) resolveAhFuDefeat(state, unit, events);
      if (died) break;
    }
    if (!unit.alive) continue;
    for (const [effect, stacks] of [["流血", unit.bleedStacks ?? 0], ["灼烧", unit.burnStacks ?? 0]]) {
      for (let index = 0; index < stacks && unit.alive; index += 1) {
        const before = unit.currentHp;
        const amount = Math.max(1, Math.floor((unit.stageThreeDot ? unit.maxHp : before) * .01));
        const result = applyTrialDamage(state, unit, amount, "dot");
        const died = handleDeath(unit);
        events.push({ type: "trial-dot", targetId: unit.id, round: state.round, name: effect,
          stack: index + 1, damage: before - unit.currentHp, hpAfter: unit.currentHp, targetDied: died, effect: result });
        if (died) resolveAhFuDefeat(state, unit, events);
      }
    }
  }
  if (state.round >= 5) for (const unit of state.characters.filter((item) => item.trialPassive === "ah_fu" && item.alive && item.currentHp > 0)) {
    unit.alive = false; unit.currentHp = 0;
    events.push({ type: "ah-fu-escape", attackerId: unit.id, round: state.round,
      targetId: unit.stolenDefense?.targetId, amount: unit.stolenDefense?.amount ?? 0 });
  }
  return events;
}

export function simulateBattle(config = CHARACTER_DATA, random = Math.random, options = {}) {
  if (typeof config === "function") {
    random = config;
    config = CHARACTER_DATA;
  }
  const state = initializeBattle(config, options);
  state.random = random;
  const events = state.battleStartEffects.map((effect) => ({ ...effect, attackerId: state.playerId }));
  applyTrialBattleStart(state, events, random);
  const fallingDevil = state.characters.find((unit) => unit.id === "falling-devil" && unit.alive);
  if (fallingDevil) events.push({ type: "gravity-domain", round: 0, attackerId: fallingDevil.id,
    targets: state.characters.filter((unit) => unit.originalTeam === "ally" && !unit.summonerId)
      .map((unit) => ({ targetId: unit.id, entryPanelSpd: unit.entryPanelSpd, battleSpd: 1 })) });
  let outcome = null;
  while (!outcome) {
    state.round += 1;
    for (const character of state.characters) if (character.elitePassiveId === "killer-queen" && character.alive)
      character.hpSnapshots.push({ round: state.round, hp: character.currentHp });
    // Summons join before this round's speed ordering and can act immediately.
    events.push(...summonAtRoundStart(state));
    events.push(...stageThreeRoundStart(state, random));
    if (state.forcedOutcome) { outcome = state.forcedOutcome; break; }
    const steamWave = triggerSteamWaveAtRoundStart(state);
    if (steamWave) events.push(steamWave);
    if (steamWave) syncTangSummons(state, events);
    outcome = isBattleOver(state);
    if (outcome) break;
    for (const character of state.characters) {
      if (character.roundLimitedSpdEffects?.length) {
        character.spd = Math.max(0, character.spdWithoutRoundEffects + character.roundLimitedSpdEffects
          .filter((effect) => state.round <= effect.roundsRemaining)
          .reduce((total, effect) => total + effect.amount, 0));
      }
      if (fallingDevil?.alive && character.originalTeam === "ally" && !character.summonerId) character.spd = 1;
    }
    for (const character of state.characters) {
      if (character.elitePassiveId === "mahito-domain" && character.elitePassiveActive && character.alive && character.elitePassiveLastRound < state.round) {
        character.atk += MAHITO_ATTACK_BONUS;
        character.elitePassiveLastRound = state.round;
        events.push({ type: "elite-passive-growth", attackerId: character.id, skillId: "mahito-domain", skillName: "自闭圆顿裹", attackBonus: MAHITO_ATTACK_BONUS, effectiveAtk: character.atk, round: state.round });
      }
    }
    for (const character of state.characters) {
      if ((character.defenseBuffUntilRound ?? -1) < state.round) character.defenseBuff = 0;
      if ((character.wukongDefenseBuffUntilRound ?? -1) < state.round) character.wukongDefenseBuff = 0;
    }
    for (const orderedActor of getActionOrder(state)) {
      const attacker = state.characters.find((c) => c.id === orderedActor.id);
      if (!attacker?.alive || attacker.currentHp <= 0) continue;
      syncNineTailsPassive(attacker);
      if ((attacker.frozenThroughRound ?? 0) >= state.round) {
        events.push({ type: "trial-control-skip", targetId: attacker.id, round: state.round, reason: "冻结" });
        continue;
      }
      if (attacker.stunNextAction) {
        attacker.stunNextAction = false;
        events.push({ type: "trial-control-skip", targetId: attacker.id, round: state.round, reason: "眩晕" });
        continue;
      }
      if (attacker.id === "tang" && attacker.tangMeditating) continue;
      if (attacker.periodicPassive?.onlyPeriodicActions) continue;
      const selectedSkill = (attacker.silencedThroughRound ?? 0) >= state.round ? null : triggeredSkill(attacker, random, state.round);
      if (selectedSkill?.id === "noi-heal") {
        const healed = [];
        for (const unit of state.characters.filter((entry) => entry.team === attacker.team && entry.alive && entry.currentHp > 0)) {
          const amount = Math.min(unit.maxHp - unit.currentHp, Math.floor((unit.maxHp - unit.currentHp) * selectedSkill.missingHpRatio));
          unit.currentHp += amount;
          healed.push({ targetId: unit.id, amount, hpAfter: unit.currentHp });
        }
        events.push({ type: "stage3-heal", round: state.round, attackerId: attacker.id, skillName: selectedSkill.name, healed });
        continue;
      }
      if (attacker.id === "tang" && selectedSkill?.id === "journey-west") {
        events.push(createTangSummon(state, attacker, selectedSkill, random));
        continue;
      }
      if (attacker.tangSummonKind === "wukong" && selectedSkill?.id === "wukong-fate") {
        attacker.wukongSkillCasts = (attacker.wukongSkillCasts ?? 0) + 1;
        if (attacker.wukongSkillCasts % 2) {
          attacker.wukongReductionRound = state.round + 1;
          const summoner = state.characters.find((unit) => unit.id === attacker.summonerId && unit.alive);
          if (summoner) {
            summoner.wukongDefenseBuff = selectedSkill.summonerDefenseBonus;
            summoner.wukongDefenseBuffUntilRound = state.round + selectedSkill.summonerDefenseDurationRounds - 1;
          }
          events.push({ type: "wukong-charge", attackerId: attacker.id, round: state.round,
            reductionRound: attacker.wukongReductionRound, skillName: "天命人",
            summonerId: summoner?.id ?? null, defenseBonus: summoner?.wukongDefenseBuff ?? 0,
            defenseDurationRounds: selectedSkill.summonerDefenseDurationRounds,
            defenseUntilRound: summoner?.wukongDefenseBuffUntilRound ?? null });
        } else {
          const victim = chooseTarget(state, attacker, random);
          if (victim) {
            const trueDamage = selectedSkill.trueDamage;
            const hit = resolveTrueDamageSkill(state, attacker, victim, selectedSkill, trueDamage);
            hit.round = state.round;
            hit.wukongTeleportAttack = true;
            events.push(hit);
            if (hit.targetDied) resolveAhFuDefeat(state, victim, events);
            syncTangSummons(state, events);
            outcome = isBattleOver(state);
          }
        }
        if (outcome) break;
        continue;
      }
      if (selectedSkill?.id === "zhang-jiao-lightning") {
        const candidates = state.characters.filter((unit) => unit.alive && unit.currentHp > 0);
        const victim = candidates[Math.floor(Math.min(.999999999999, Math.max(0, Number(random()) || 0)) * candidates.length)];
        if (victim) {
          const hit = resolveTrueDamageSkill(state, attacker, victim, selectedSkill, selectedSkill.trueDamage);
          hit.round = state.round;
          events.push(hit);
          if (hit.targetDied) resolveAhFuDefeat(state, victim, events);
          syncTangSummons(state, events);
          outcome = isBattleOver(state);
        }
        if (outcome) break;
        continue;
      }
      if (selectedSkill?.effectType === "rewind") {
        events.push(...resolveBitesDust(state, attacker));
        outcome = isBattleOver(state);
        if (outcome) break;
        continue;
      }
      let skill = selectedSkill;
      let skillCastNumber = null;
      let gilgameshCast = null;
      if (skill?.id === "gilgamesh-enuma-elish") {
        gilgameshCast = (++attacker.gilgameshCasts - 1) % 4 + 1;
        const phase = skill.castPhases[gilgameshCast];
        if (gilgameshCast === 3) {
          const hpBefore = attacker.currentHp;
          attacker.currentHp = Math.min(attacker.maxHp, hpBefore + phase.selfHeal);
          events.push({ type: "gilgamesh-heal", round: state.round, attackerId: attacker.id,
            skillName: skill.name, castNumber: gilgameshCast, hpBefore,
            hpAfter: attacker.currentHp, healedAmount: attacker.currentHp - hpBefore });
          continue;
        }
        skill = { ...skill, ...phase };
      }
      if (skill?.id === "boros-meteor-burst") {
        skillCastNumber = ++attacker.meteorCasts;
        if (skillCastNumber % 2 === 0) skill = { ...skill, multiplier: skill.alternatingMultiplier };
      }
      if (skill?.id === "heracles-nine-heads" && attacker.currentHp < 1000)
        skill = { ...skill, multiplier: skill.multiplier * 2 };
      const target = skill?.lowestDefenseTarget
        ? state.characters.filter((unit) => unit.team !== attacker.team && unit.alive && unit.currentHp > 0)
          .sort((a, b) => a.def - b.def || a.rosterOrder - b.rosterOrder)[0]
        : skill?.id === "odin-gungnir"
        ? (() => { const candidates = state.characters.filter((unit) => unit.team !== attacker.team && unit.alive && unit.currentHp > 0);
          return candidates[Math.floor(Math.min(.999999999999, Math.max(0, Number(random()) || 0)) * candidates.length)]; })()
        : chooseTarget(state, attacker, random);
      if (!target) break;
      if (skill?.id === "naruto-multi-clone" && skill.cloneGain) {
        attacker.chakraClones += skill.cloneGain;
        events.push({ type: "evolution-clone-gain", attackerId: attacker.id, round: state.round,
          count: attacker.chakraClones });
      }
      if (skill?.id === "naruto-giant-rasengan") {
        attacker.chakra += skill.chakraLevelGain + attacker.spd / 10;
        if (attacker.chakra >= skill.chakraThreshold) {
          attacker.chakra -= skill.chakraThreshold;
          skill = { ...skill, chakraBurst: true };
        }
      }
      const allTargets = gilgameshCast === 2 || skill?.targetRule === "all_living" ||
        (attacker.trialPassive === "heracles" && !skill) ||
        (skill?.id === "boros-meteor-burst" && skillCastNumber % 2 === 0);
      const targets = allTargets
        ? state.characters.filter((entry) => entry.team !== attacker.team && entry.alive && entry.currentHp > 0)
        : [gilgameshCast === 4 && !(attacker.team === "enemy" && target.id === "eren" && target.tauntRounds?.includes(state.round))
          ? state.characters.filter((entry) => entry.team !== attacker.team && entry.alive && entry.currentHp > 0)
            .sort((a, b) => a.currentHp - b.currentHp || a.rosterOrder - b.rosterOrder)[0]
          : target];
      const faster = attacker.elitePassiveId === "toji-heavenly-restriction" && attacker.spd > target.spd;
      if (faster) attacker.fasterActions += 1;
      const segmentCount = attacker.elitePassiveId === "toji-heavenly-restriction"
        ? faster ? 1 + attacker.fasterActions : 1 : targets.length;
      for (let index = 0; index < segmentCount; index += 1) {
        const struck = targets[attacker.elitePassiveId === "toji-heavenly-restriction" ? 0 : index];
        if (!struck?.alive || struck.currentHp <= 0) break;
        const event = gilgameshCast === 4
          ? resolveTrueDamageSkill(state, attacker, struck, skill, Math.floor(struck.maxHp * skill.trueDamageRatio))
          : executeAttack(state, attacker, struck, random, {
          skill: attacker.elitePassiveId === "toji-heavenly-restriction" ? null : skill,
          segmentIndex: index + 1, segmentCount, skillCastNumber, gilgameshCast,
        });
        if (!event) continue;
        event.round = state.round;
        if (skill?.id === "naruto-giant-rasengan" && skill.chakraBurst) event.chakraBurstVisual = true;
        if (gilgameshCast) event.gilgameshCast = gilgameshCast;
        if (event.jinchurikiTriggered) events.push({ type: "passive-trigger", ...event.jinchurikiTriggered, attackerId: attacker.id });
        if (event.elitePassiveTriggered) events.push({ type: "elite-passive-trigger", ...event.elitePassiveTriggered, attackerId: attacker.id });
        events.push(event);
        resolveStageThreeDeaths(state, events);
        if (event.type === "attack" && attacker.skills?.some((entry) => entry.id === "kaneki-2000-14")) {
          const reactive = attacker.skills.find((entry) => entry.id === "kaneki-2000-14");
          attacker.attackActionHits += 1;
          if (attacker.attackActionHits % reactive.attacksPerTrigger === 0)
            attacker.reactiveCritDamageBonus = (attacker.reactiveCritDamageBonus ?? 0) + reactive.critDamagePerAttack;
        }
        if (event.type === "attack" && skill?.id === "naruto-giant-rasengan" && skill.chakraBurst && !event.dodged) {
          const burst = resolveChakraBurst(state, attacker, struck, skill, random);
          if (burst) events.push(burst);
        }
        if (event.type === "attack" && struck.reflectStartRound <= state.round &&
            state.round <= struck.reflectUntilRound && event.actualDamage > 0 && attacker.alive) {
          const before = attacker.currentHp;
          const reflected = calculateDamage({ atk: Math.floor(combatDefense(struck, state.round) * struck.reflectMultiplier) },
            { def: combatDefense(attacker, state.round) });
          const shield = Math.min(reflected, attacker.shieldHp ?? 0);
          attacker.shieldHp -= shield;
          const reflection = applyTrialDamage(state, attacker, reflected - shield, "attached");
          const reflectedDeath = handleDeath(attacker);
          events.push({ type: "attack", attackerId: struck.id, attackerTeam: struck.team, targetId: attacker.id,
            skillId: "eren-hardening", skillName: "硬质化反伤", skilled: true, attackKind: "skill",
            damage: reflection.dealt, actualDamage: before - attacker.currentHp,
            targetHp: attacker.currentHp, targetMaxHp: attacker.maxHp, targetDied: reflectedDeath,
            targetShield: attacker.shieldHp, attackerHp: struck.currentHp, round: state.round });
        }
        if (event.type === "attack" && event.actualDamage > 0 && struck.alive && attacker.alive &&
            struck.normalPassiveId === "dementor") {
          const requested = Math.floor(event.actualDamage * .05);
          const before = attacker.currentHp;
          const shieldAbsorbed = Math.min(requested, attacker.shieldHp ?? 0);
          attacker.shieldHp = Math.max(0, (attacker.shieldHp ?? 0) - shieldAbsorbed);
          applyTrialDamage(state, attacker, requested - shieldAbsorbed, "attached");
          events.push({ type: "normal-passive-reflect", round: state.round, attackerId: struck.id,
            targetId: attacker.id, requested, actualDamage: before - attacker.currentHp,
            targetHp: attacker.currentHp, targetMaxHp: attacker.maxHp,
            targetShield: attacker.shieldHp, targetDied: handleDeath(attacker) });
        }
        if (event.type === "attack" && event.actualDamage > 0 && struck.alive && attacker.alive &&
            struck.normalPassiveId === "teruhashi" && random() < .2) {
          attacker.stunNextAction = true;
          events.push({ type: "normal-passive-stun", round: state.round, attackerId: struck.id,
            targetId: attacker.id });
        }
        if (event.type === "attack" && event.damageSkillTriggered && struck.alive) {
          const reactive = struck.skills?.find((entry) => entry.id === "kaneki-2000-14");
          if (reactive?.counterDamageEvery && struck.damageTakenHits % reactive.counterDamageEvery === 0) {
            const victim = chooseTarget(state, struck, random);
            if (victim) {
              const counter = executeAttack(state, struck, victim, random, { skill: {
                id: "kaneki-2000-14-counter", name: "2000-14", chance: 1, multiplier: 1,
                effectType: "damage", attackType: "melee" } });
              if (counter) { counter.round = state.round; events.push(counter); }
            }
          }
        }
        if (event.targetDied) resolveAhFuDefeat(state, struck, events);
        syncTangSummons(state, events);
        if (attacker.elitePassiveId === "toji-heavenly-restriction" && index + 1 === 5 && !attacker.tojiExhausted) {
          attacker.tojiExhausted = true;
          events.push({ type: "toji-exhausted", attackerId: attacker.id, round: state.round,
            name: "出拳太快有点累了", damageTakenMultiplier: 1.5 });
        }
        const jasonHit = event.type === "attack" ? resolveJasonBonus(state, attacker, struck, event) : null;
        if (jasonHit) events.push(jasonHit);
        const treasureHit = event.type === "attack" ? resolveNichirinBonus(state, attacker, struck, event) : null;
        if (treasureHit) events.push(treasureHit);
        if (["shadow-clone-rush", "naruto-multi-clone"].includes(skill?.id) && skill.splashRatio && !event.dodged) {
          for (const splash of resolveCloneSplash(state, attacker, event, skill, random)) {
            events.push(splash);
            if (splash.targetDied) {
              const defeated = state.characters.find((unit) => unit.id === splash.targetId);
              if (defeated) resolveAhFuDefeat(state, defeated, events);
            }
          }
        }
        const targetDied = event.targetDied || jasonHit?.targetDied || treasureHit?.targetDied;
        if (targetDied) resolveAhFuDefeat(state, struck, events);
        if (targetDied) resolveStageThreeDeaths(state, events);
        if (targetDied && state.characters.find((character) => character.id === event.targetId)?.escapeAsset) {
          const escaped = state.characters.find((character) => character.id === event.targetId);
          events.push({ type: "elite-escape", targetId: escaped.id, name: escaped.name, asset: escaped.escapeAsset, round: state.round });
        }
        const c0Charge = recordC0Action(state, event);
        if (c0Charge) events.push(c0Charge);
        if (targetDied && state.c0 && event.targetId === state.c0.bossId) {
          const c0Explosion = detonateC0(state);
          if (c0Explosion) events.push(c0Explosion);
        }
        outcome = isBattleOver(state);
        if (outcome || (attacker.elitePassiveId === "toji-heavenly-restriction" && targetDied)) break;
      }
      if (outcome) break;
    }
    if (outcome) break;
    const tang = state.characters.find((unit) => unit.id === "tang" && unit.team === "ally");
    if (tang?.alive && tang.tangMeditating) {
      const companion = state.characters.find((unit) => unit.id === tang.tangActiveSummonId && unit.alive);
      if (companion && state.round > (Number(tang.tangSummonStartRound) || 0)) {
        tang.tangMeditationRounds = (tang.tangMeditationRounds ?? 0) + 1;
        const dharma = tang.skills?.find((skill) => skill.id === "tang-boundless-dharma");
        if (dharma && tang.tangMeditationRounds % dharma.meditationRounds === 0) {
          const changes = [];
          for (const enemy of state.characters.filter((unit) => unit.team !== tang.team && unit.alive)) {
            const applied = Math.min(dharma.enemyAttackStep, dharma.attackCap - (enemy.dharmaEnemyAttackPenalty ?? 0), enemy.atk);
            enemy.atk -= applied;
            enemy.dharmaEnemyAttackPenalty = (enemy.dharmaEnemyAttackPenalty ?? 0) + applied;
            changes.push({ targetId: enemy.id, attackChange: -applied });
          }
          if (dharma.allyAttackStep) for (const ally of state.characters.filter((unit) => unit.team === tang.team && unit.alive)) {
            const applied = Math.min(dharma.allyAttackStep, dharma.attackCap - (ally.dharmaAllyAttackBonus ?? 0));
            ally.atk += applied;
            ally.dharmaAllyAttackBonus = (ally.dharmaAllyAttackBonus ?? 0) + applied;
            changes.push({ targetId: ally.id, attackChange: applied });
          }
          if (dharma.teamShield) for (const ally of state.characters.filter((unit) => unit.team === tang.team && unit.alive)) {
            ally.shieldHp = Math.max(ally.shieldHp ?? 0, tang.atk);
            changes.push({ targetId: ally.id, shieldHp: ally.shieldHp });
          }
          events.push({ type: "evolution-dharma", round: state.round, attackerId: tang.id,
            skillName: dharma.name, changes });
        }
        if (tang.tangMeditationRounds % 3 === 0) {
          const victim = chooseTarget(state, tang, random);
          if (victim) {
            const special = { ...SKILL_DATA["tang-meditation-strike"], ...SKILL_DATA["tang-meditation-strike"].levels[1], level: 1 };
            const hit = executeAttack(state, tang, victim, random, { skill: special });
            if (hit) { hit.round = state.round; events.push(hit); syncTangSummons(state, events); }
            outcome = isBattleOver(state);
            if (outcome) break;
          }
        }
      }
    }
    events.push(...detonateDueBombs(state));
    resolveStageThreeDeaths(state, events);
    syncTangSummons(state, events);
    outcome = isBattleOver(state);
    if (outcome) break;
    events.push(...resolveTrialRoundEnd(state));
    resolveStageThreeDeaths(state, events);
    syncTangSummons(state, events);
    outcome = isBattleOver(state);
    if (outcome) break;
    events.push(...state.gravityHealEvents.splice(0));
    events.push(...resolveFallingRoundEnd(state));
    syncTangSummons(state, events);
    outcome = isBattleOver(state);
    if (outcome) break;
    if (state.round === 5 && state.characters.some((unit) => unit.normalPassiveId === "gollum" && unit.alive)) {
      const targets = state.characters.filter((unit) => unit.team === "ally" && !unit.summonerId);
      for (const unit of targets) {
        unit.atk = Math.max(0, unit.atk - 5);
        unit.def = Math.max(0, unit.def - 5);
        unit.spd = Math.max(0, unit.spd - 5);
      }
      events.push({ type: "normal-passive-gollum", round: state.round,
        targets: targets.map((unit) => ({ targetId: unit.id, atk: unit.atk, def: unit.def, spd: unit.spd })) });
    }
    events.push(...advanceBorosRound(state));
    const expiredShield = expireArmoredShieldAtRoundEnd(state);
    if (expiredShield) events.push(expiredShield);
    for (const character of state.characters) if (character.tauntRounds?.length)
      character.tauntRounds = character.tauntRounds.filter((round) => round > state.round);
  }
  const tangAtEnd = state.characters.find((unit) => unit.id === "tang" && unit.team === "ally");
  for (const unit of state.characters.filter((entry) => entry.controlledByMakima)) {
    unit.team = unit.originalTeam;
    unit.controlledByMakima = false;
  }
  if (tangAtEnd?.tangRepeatedWukongAtkBonus) {
    tangAtEnd.atk -= tangAtEnd.tangRepeatedWukongAtkBonus;
    tangAtEnd.tangRepeatedWukongAtkBonus = 0;
  }
  events.push({ type: "battle-end", outcome, round: state.round, c0Damage: state.c0 ? state.c0.completedRounds * state.c0.damagePerRound : 0, c0Detonated: state.c0?.detonated ?? false });
  return { events, outcome, rounds: state.round, c0: state.c0 ? { ...state.c0 } : null, finalCharacters: state.characters.map((character) => ({ ...character })) };
}

export function advanceBorosRound(state) {
  const events = [];
  for (const character of state.characters) {
    if (!character.alive || !character.phaseSkills || state.round <= character.borosEnteredRound || state.round <= character.borosLastGrowthRound) continue;
    if (character.borosPhase === 2) {
      character.spd += 10;
      character.borosLastGrowthRound = state.round;
      events.push({ type: "boros-round-speed", round: state.round, targetId: character.id,
        speedBonus: 10, effectiveSpd: character.spd });
    } else if (character.borosPhase === 3) {
      character.atk += 30;
      character.borosLastGrowthRound = state.round;
      events.push({ type: "boros-round-growth", round: state.round, targetId: character.id,
        attackBonus: 30, effectiveAtk: character.atk });
    }
  }
  return events;
}

export function restartBattle() {
  return initializeBattle();
}
