import { ADVENTURE_EVENTS, CAMPAIGN_BATTLES, CHARACTER_DATA, DEIDARA_ANIMATIONS, ELITE_ENEMY_DATA, EVENT_ENEMY_DATA, NORMAL_ENEMY_APPEARANCES, STAGE_TWO_BOSS_DATA, STAGE_TWO_NORMAL_ENEMY_TIERS, STAGE_THREE_BOSS_DATA, STAGE_THREE_MINIONS, STAGE_THREE_NORMAL_ENEMY_TIERS, STARTING_CHARACTERS, TRIAL_ENEMY_DATA } from "./characters.js";
import { evolvedBattlePresentation } from "./evolvedVisuals.js";
import { SKILL_DATA, TREASURE_DATA } from "./skills.js";
import { createSeededRandom, generateRouteMap, ROUTE_MAP_FINAL_STEP } from "./routeMap.js";
import {
  applyAdventureBattleBonusReward, applyAdventureBattleStatReward, applyBattleBonusReward,
  advanceTemporaryEffectsAfterBattle, applyAdventurePartyOutcome, applyBattleStatReward, chooseAdventureEventId, completeAdventureBattle, createAdventureEventResult,
  canDeclineNewSkill, createBattleRewardOffer, createRunCharacterState, getAvailableAdventureEventIds, getCampfireOptions, getSkillAtLevel,
  getTemporaryCombatModifiers, getTemporaryEffects, getTreasureCombatModifiers, getUnlearnedActiveSkills, getUpgradeableSkills, getSkillTrainingChoices, grantGiantSpinalFluid, grantEliteSukunaFinger, grantGunDevilFragment, grantAdventureSpecialReward, grantQuinque, claimTreasure, learnActiveSkill, upgradeActiveSkill,
  createStatUpgradeChoices, applyStatUpgrade, healRunCharacter, resolveAdventureEvent, resolveCampfire, startAdventureBattle, upgradePassiveSkill,
} from "./progression.js";
import { ATTRIBUTE_UPGRADES } from "./skills.js";
import { TRIAL_TASKS, TRIAL_RULES, createTrialState, startTrialTask, completeTrialTask, failTrial, pickTrialEnemies, odinWeakestPointStat } from "./trial.js";
import { evolveTrialParty, chooseEvolutionUpgrade, evolutionDisplayName } from "./evolution.js";
export { chooseEvolutionUpgrade };

const enemyTemplates = new Map(CHARACTER_DATA.filter((character) => character.team === "enemy").map((character) => [character.id, character]));
const ROUTE_LENGTH = ROUTE_MAP_FINAL_STEP;
export const STAGE_TWO_STAT_UPGRADES = Object.freeze([
  { id: "maxHp", name: "最大生命 +100", value: 100 },
  { id: "atk", name: "攻击 +10", value: 10 },
  { id: "def", name: "防御 +10", value: 10 },
  { id: "spd", name: "速度 +10", value: 10 },
]);

const ROUTE_ENEMY_GROWTH = {
  normal: [
    { minStep: 1, maxStep: 2, hp: 0.8, atk: 0.8, def: 0.8 },
    { minStep: 3, maxStep: 5, hp: 1, atk: 1, def: 1 },
    { minStep: 6, maxStep: 8, hp: 1.25, atk: 1.15, def: 1.1 },
    { minStep: 9, maxStep: Infinity, hp: 1.4, atk: 1.2, def: 1.15 },
  ],
  elite: [
    { minStep: 1, maxStep: 2, hp: 0.9, atk: 0.9, def: 0.9 },
    { minStep: 3, maxStep: 5, hp: 1, atk: 1, def: 1 },
    { minStep: 6, maxStep: 8, hp: 1.15, atk: 1.1, def: 1.05 },
    { minStep: 9, maxStep: Infinity, hp: 1.25, atk: 1.15, def: 1.1 },
  ],
};
// Stage two uses the same bands with a stage-local index. The final band caps
// later local steps, including 10–14, without inventing another multiplier.
export const STAGE_TWO_GROWTH = ROUTE_ENEMY_GROWTH;

export function getRouteEnemyGrowth(type, step, stageId = 1) {
  if (type === "boss") return { hp: 1, atk: 1, def: 1 };
  const tier = type === "elite" ? "elite" : "normal";
  const bands = ROUTE_ENEMY_GROWTH[tier];
  const band = bands.find((entry) => step >= entry.minStep && step <= entry.maxStep);
  if (!band) throw new RangeError(`No ${tier} enemy growth band for stage ${stageId}, local step ${step}`);
  return { hp: band.hp, atk: band.atk, def: band.def };
}

export function getStageTwoNormalEnemyStats(enemyId, localStep) {
  if (!Number.isInteger(localStep) || localStep < 1 || !["guard", "mage"].includes(enemyId))
    throw new RangeError(`Invalid stage-two normal enemy or local step: ${enemyId}, ${localStep}`);
  return STAGE_TWO_NORMAL_ENEMY_TIERS.find((tier) => localStep <= tier.maxStep)[enemyId];
}

export function getStageThreeNormalEnemyStats(enemyId, localStep) {
  if (!Number.isInteger(localStep) || localStep < 1 || !["guard", "mage"].includes(enemyId))
    throw new RangeError(`Invalid stage-three normal enemy or local step: ${enemyId}, ${localStep}`);
  return STAGE_THREE_NORMAL_ENEMY_TIERS.find((tier) => localStep <= tier.maxStep)[enemyId];
}

function legalChildren(campaign) {
  const current = campaign.routeMap.nodes.find((node) => node.id === campaign.routeMap.currentNodeId);
  if (!current) return [];
  const byId = new Map(campaign.routeMap.nodes.map((node) => [node.id, node]));
  const children = current.nextNodeIds.map((id) => byId.get(id)).filter(Boolean);
  return campaign.consecutiveWithoutBattle >= 2
    ? children.filter((node) => ["battle", "elite", "demon"].includes(node.type))
    : children;
}

function generateRouteOptions(campaign) {
  const children = legalChildren(campaign);
  if (campaign.runCharacterState && children.some((node) => node.type === "question") &&
    !(campaign.stageId === 3 && !campaign.chapter3FirstEncounterAssigned) &&
    !getAvailableAdventureEventIds(campaign.runCharacterState, campaign.step,
      campaign.partyIds.map((id) => campaign.partyStates[id]), campaign.stageId).length) {
    // A question node must never point to an exhausted event pool.
    for (const node of children) if (node.type === "question") node.type = "battle";
  }
  campaign.routeMap.nodes.forEach((node) => {
    if (node.status === "pending") node.status = "locked";
  });
  children.forEach((node) => {
    if (node.status === "locked") node.status = "pending";
  });
  campaign.routeOptions = children;
  campaign.status = "route";
}

function encounterFor(campaign, type, node, forcedEncounterId = null) {
  const step = campaign.step;
  if (type === "elite") {
    const pool = ELITE_ENEMY_DATA.filter((entry) => (entry.stageId ?? 1) === campaign.stageId);
    const encounterIds = [...new Set(pool.map((entry) => entry.eliteEncounterId ?? entry.id))];
    if (forcedEncounterId && !encounterIds.includes(forcedEncounterId)) throw new RangeError(`unknown stage-two elite: ${forcedEncounterId}`);
    const encounterId = forcedEncounterId ?? encounterIds[Math.min(encounterIds.length - 1, Math.floor(Math.max(0, Math.min(0.999999999, campaign.random())) * encounterIds.length))];
    const enemies = pool.filter((entry) => (entry.eliteEncounterId ?? entry.id) === encounterId);
    const title = enemies.map((entry) => entry.name).join(" + ");
    return {
      number: campaign.battleNumber + 1, step, type: "elite", eliteId: encounterId,
      title: `精英遭遇：${title}`, location: "精英遭遇地点", description: `${title}挡住了去路。`,
      enemies: enemies.map((entry) => entry.id),
      enemyNames: Object.fromEntries(enemies.map((entry) => [entry.id, entry.name])),
      enemyBaseStats: Object.fromEntries(enemies.map((entry) => [entry.id, { hp: entry.hp, atk: entry.atk, def: entry.def, spd: entry.spd }])),
      ...(campaign.stageId >= 2 ? { enemyGrowthExemptIds: enemies.map((entry) => entry.id) } : {}),
    };
  }
  if (campaign.stageId >= 2) {
    const random = createSeededRandom(`stage2-normal:${campaign.routeMap.seed}:${node.id}`);
    const frontPool = campaign.stageId === 3
      ? ["bull_king", "headless_knight", "anubis", "loki", "medusa", "shiji"]
      : ["lubu", "dementor", "deep_sea_king"];
    const backPool = ["jack", "teruhashi", "gollum"];
    const pick = (pool) => pool[Math.floor(random() * pool.length)];
    const single = campaign.stageStep <= 4;
    const useFront = !single || random() < .5;
    const useBack = !single || !useFront;
    const enemies = [...(useFront ? ["guard"] : []), ...(useBack ? ["mage"] : [])];
    const enemyAppearanceIds = { ...(useFront ? { guard: pick(frontPool) } : {}), ...(useBack ? { mage: pick(backPool) } : {}) };
    return { number: campaign.battleNumber + 1, step, stageStep: campaign.stageStep, type: "normal",
      title: "途中战斗", location: "探索遭遇地点", description: "敌人出现在前方。", enemies, enemyAppearanceIds,
      enemyNames: Object.fromEntries(enemies.map((id) => [id, NORMAL_ENEMY_APPEARANCES[enemyAppearanceIds[id]].name])) };
  }
  const candidate = CAMPAIGN_BATTLES[Math.min(2, (step - 1) % 3)];
  const enemies = step <= 6
    ? [candidate.enemies[Math.floor(createSeededRandom(`stage1-single:${campaign.routeMap.seed}:${node.id}`)() * candidate.enemies.length)]]
    : ["guard", "mage"];
  const frontAppearanceId = enemies.includes("guard")
    ? (createSeededRandom(`normal-appearance:${campaign.routeMap.seed}:${node.id}`)() < 0.5 ? "giant" : "slime")
    : null;
  const enemyAppearanceIds = {
    ...(frontAppearanceId ? { guard: frontAppearanceId } : {}),
    ...(enemies.includes("mage") ? { mage: "mage" } : {}),
  };
  return {
    ...candidate,
    enemies,
    enemyAppearanceIds,
    enemyNames: Object.fromEntries(enemies.map((enemyId) => [enemyId,
      NORMAL_ENEMY_APPEARANCES[enemyAppearanceIds[enemyId]]?.name ?? candidate.enemyNames?.[enemyId],
    ])),
    number: campaign.battleNumber + 1,
    step,
    type,
    title: type === "elite" ? "精英遭遇" : "途中战斗",
    location: type === "elite" ? "精英遭遇地点" : "探索遭遇地点",
    // Route growth is applied once, when building the combat copy in prepareBattle.
    description: type === "elite" ? "强敌拦住了去路。" : "敌人出现在前方。",
  };
}

function enterBattle(campaign, node, type, forcedEncounterId = null) {
  const kind = type === "boss" ? "boss" : type === "elite" ? "elite" : "normal";
  node.resolution = kind;
  node.battle = kind === "boss"
    ? campaign.stageId === 3
      ? { number: campaign.completedBattles + 1, step: campaign.step, type: "boss", title: "玛奇玛", location: "第三关终点", description: "击败玛奇玛。",
        enemies: [STAGE_THREE_BOSS_DATA.id], enemyNames: { [STAGE_THREE_BOSS_DATA.id]: STAGE_THREE_BOSS_DATA.name },
        enemyGrowthExemptIds: [STAGE_THREE_BOSS_DATA.id] }
      : campaign.stageId === 2
      ? { number: campaign.completedBattles + 1, step: campaign.step, type: "boss", title: "波罗斯", location: "龙级灾难降临", description: "击败波罗斯。",
        enemies: [STAGE_TWO_BOSS_DATA.id], enemyNames: { [STAGE_TWO_BOSS_DATA.id]: STAGE_TWO_BOSS_DATA.name },
        enemyGrowthExemptIds: [STAGE_TWO_BOSS_DATA.id] }
      : { ...CAMPAIGN_BATTLES.find((entry) => entry.type === "boss"), number: campaign.completedBattles + 1, step: campaign.step }
    : encounterFor(campaign, kind, node, forcedEncounterId);
  node.status = "in_progress";
  campaign.activeNode = node;
  campaign.currentBattle = node.battle;
  campaign.battleNumber = campaign.completedBattles + 1;
  campaign.consecutiveWithoutBattle = 0;
  campaign.status = "combat";
  campaign.combatLaunched = false;
  return { type: "battle", battle: campaign.currentBattle };
}

// Local fixture calls the same encounter builder and combat pipeline as route play.
export function startStageTwoDirectBattle(campaign, encounterId, localStep = campaign?.stageStep) {
  if (campaign?.stageId !== 2 || campaign.status !== "route" || !Number.isInteger(localStep) || localStep < 1 || localStep > 15) return false;
  const adventureEncounters = {
    gilgamesh: { eventId: "kings_treasury", choiceId: "treasury_advance" },
    suzuya: { eventId: "anteiku_2", choiceId: "anteiku_fight", series: "anteiku" },
    six_ear: { eventId: "giant_rock_2", choiceId: "rock_fight", series: "rock" },
  };
  const adventure = adventureEncounters[encounterId];
  const isBoss = encounterId === STAGE_TWO_BOSS_DATA.id;
  if (!adventure && !isBoss && !ELITE_ENEMY_DATA.some((entry) => entry.stageId === 2 && (entry.eliteEncounterId ?? entry.id) === encounterId)) return false;
  campaign.step += localStep - campaign.stageStep;
  campaign.stageStep = localStep;
  if (adventure) {
    // The local fixture enters the same event battle branch as route play.
    if (adventure.series) campaign.runCharacterState.eventSeries[adventure.series] = { chapter1Completed: true, chapter2Unlocked: true };
    campaign.activeNode = { id: `dev-direct:${encounterId}`, type: "question", status: "in_progress" };
    campaign.activeEventType = "adventure";
    campaign.status = "event";
    campaign.pendingEvent = createAdventureEventResult(campaign.runCharacterState, campaign.activeNode.id,
      adventure.eventId, campaign.random, campaign.partyIds.map((id) => campaign.partyStates[id]), campaign.stageId);
    if (!campaign.pendingEvent || !resolveCampaignEvent(campaign, adventure.choiceId)) return false;
    const started = startCampaignEventBattle(campaign);
    if (started) campaign.devBattleOnly = true;
    return started;
  }
  const node = { id: `dev-direct:${encounterId}`, type: isBoss ? "demon" : "elite", status: "pending" };
  const started = enterBattle(campaign, node, isBoss ? "boss" : "elite", isBoss ? null : encounterId);
  campaign.devBattleOnly = true;
  return started;
}

function completeActiveNode(campaign) {
  if (!campaign.activeNode || campaign.activeNode.status !== "in_progress") return false;
  campaign.activeNode.status = "completed";
  campaign.history.push({ id: campaign.activeNode.id, step: campaign.step, stageId: campaign.stageId, type: campaign.activeNode.type, resolution: campaign.activeNode.resolution, status: "completed" });
  campaign.activeNode = null;
  campaign.pendingEvent = null;
  campaign.activeEventType = null;
  campaign.routeMap.currentNodeId = campaign.history.at(-1).id;
  campaign.step += 1;
  campaign.stageStep += 1;
  generateRouteOptions(campaign);
  return true;
}

export function createCampaign(random = Math.random, options = {}) {
  const seed = options.seed ?? (random === Math.random ? Math.floor(Math.random() * 0x100000000) : 0);
  return {
    status: "intro", random, stageId: 1, step: 0, stageStep: 0, battleNumber: 0, completedBattles: 0,
    candidateIds: null, playerId: null, partyIds: [], partyStates: {}, playerHp: 0, playerMaxHp: 0, runCharacterState: null, nextAttackMultiplier: 1,
    consecutiveWithoutBattle: 0, routeMap: generateRouteMap(seed), routeOptions: [], history: [], activeNode: null,
    currentBattle: null, pendingEvent: null, resolvedEvents: [], eventResolved: false, combatLaunched: false,
    startingSkillSelected: false, activeEventType: null, eventBattleSourceId: null,
    rewardBattleId: null, rewardPhase: null, rewardBattleType: null, stageTransition: null, stageTwoReward: null,
    chapter3Entered: false, chapter3FirstEncounterAssigned: false, trialOffered: false,
    trialAccepted: false, trialDeclined: false, trialCompleted: false, evolutionPending: false,
    trialFailurePenaltyApplied: false, trial: null, trialBattle: null, evolutionRewards: null,
  };
}

export function startCampaign(campaign) {
  if (!campaign || campaign.status !== "intro") return false;
  const pool = STARTING_CHARACTERS.map((character) => character.id);
  // Keep the opening draw reproducible without consuming event or combat rolls.
  const candidateRandom = createSeededRandom(`starter-candidates:${campaign.routeMap.seed}`);
  campaign.candidateIds = [];
  for (let i = 0; i < 2; i += 1) {
    const roll = Math.max(0, Math.min(0.999999999999, Number(candidateRandom()) || 0));
    campaign.candidateIds.push(pool.splice(Math.floor(roll * pool.length), 1)[0]);
  }
  campaign.status = "character-select";
  return true;
}

export function selectStartingCharacter(campaign, characterId, activeSkillId) {
  if (!campaign || campaign.status !== "character-select") return false;
  const character = campaign.candidateIds?.includes(characterId)
    ? STARTING_CHARACTERS.find((entry) => entry.id === characterId)
    : null;
  if (!character) return false;
  let runCharacterState;
  try { runCharacterState = createRunCharacterState(character, activeSkillId); }
  catch { return false; }
  campaign.playerId = character.id;
  campaign.partyIds = [character.id];
  campaign.runCharacterState = runCharacterState;
  campaign.partyStates = { [character.id]: runCharacterState };
  campaign.startingSkillSelected = activeSkillId !== null || (character.activeSkills ?? []).length === 0;
  campaign.playerHp = runCharacterState.currentHp;
  campaign.playerMaxHp = runCharacterState.maxHp;
  campaign.status = "entry";
  return { ...character };
}

export function chooseStartingSkill(campaign, skillId) {
  if (!campaign || campaign.status !== "entry" || campaign.startingSkillSelected || !campaign.runCharacterState) return false;
  const learned = learnActiveSkill(campaign.runCharacterState, skillId, `starting:${campaign.playerId}`);
  if (!learned) return false;
  campaign.startingSkillSelected = true;
  return learned;
}

export function beginJourney(campaign) {
  if (!campaign || campaign.status !== "entry" || !campaign.playerId || !campaign.startingSkillSelected) return false;
  campaign.step = 1;
  campaign.stageStep = 1;
  generateRouteOptions(campaign);
  return campaign.status;
}

export function getBattleDefinition(battleNumber) {
  return CAMPAIGN_BATTLES.find((battle) => battle.number === battleNumber) ?? null;
}

export function prepareBattle(campaign) {
  if (!campaign || campaign.status !== "combat" || campaign.combatLaunched) return null;
  const battle = campaign.currentBattle ?? CAMPAIGN_BATTLES.find((entry) => entry.type === "boss");
  if (!battle) return null;
  const playerTemplate = STARTING_CHARACTERS.find((character) => character.id === campaign.playerId);
  if (!playerTemplate) return null;
  campaign.combatLaunched = true;
  const run = campaign.runCharacterState;
  if (!run || run.characterId !== playerTemplate.id) return null;
  const battleStartEffects = [];
  const routeStep = campaign.stageId >= 2 ? campaign.stageStep ?? battle.stageStep : battle.step;
  const routeGrowth = getRouteEnemyGrowth(battle.type, routeStep, campaign.stageId);
  const battleId = campaign.trialBattle?.id ?? (campaign.eventBattleSourceId
    ? `event:${campaign.eventBattleSourceId}` : campaign.activeNode?.id ?? `step-${campaign.step}-battle`);
  const allies = campaign.partyIds.map((id, index) => {
    const template = STARTING_CHARACTERS.find((entry) => entry.id === id);
    const state = campaign.partyStates?.[id] ?? (id === campaign.playerId ? run : null);
    if (!template || !state) throw new RangeError(`Missing party member state: ${id}`);
    let skillEffects = state.learnedActiveSkills.map((skillId) => getSkillAtLevel(state, skillId)).filter(Boolean);
    const guarantee = state.nextBattleSkillGuarantee;
    if (guarantee) {
      const eligible = skillEffects.filter((skill) => guarantee.skillIds.includes(skill.id) && Number.isFinite(skill.chance));
      if (eligible.length) {
        const selected = eligible[Math.min(eligible.length - 1, Math.floor(Math.max(0, Math.min(0.999999999, campaign.random())) * eligible.length))];
        skillEffects = skillEffects.map((skill) => skill.id === selected.id ? { ...skill, chance: 1 } : skill);
        battleStartEffects.push({ type: "skill-guarantee", characterId: id, skillId: selected.id, skillName: selected.name, sourceId: guarantee.sourceId });
      }
      state.nextBattleSkillGuarantee = null;
    }
    const temporaryModifiers = getTemporaryCombatModifiers(state);
    const treasureModifiers = getTreasureCombatModifiers(state);
    const roundLimitedSpdEffects = getTemporaryEffects(state)
      .filter((effect) => effect.stat === "spd" && effect.roundsRemaining > 0)
      .map(({ amount, roundsRemaining }) => ({ amount, roundsRemaining }));
    const roundLimitedSpdTotal = roundLimitedSpdEffects.reduce((sum, effect) => sum + effect.amount, 0);
    const ally = {
      ...template, name: evolutionDisplayName(id, state.evolution) ?? template.name,
      ...(state.evolution?.phase === 2 ? evolvedBattlePresentation(id) : {}),
      rosterOrder: index,
      hp: state.maxHp, maxHp: state.maxHp, currentHp: state.currentHp,
      ...(id === "tang" ? { tangGrowth: Object.fromEntries(["maxHp", "atk", "def", "spd"].map((stat) =>
        [stat, Math.max(0, state[stat] - template.baseStats[stat])])) } : {}),
      atk: Math.floor(state.atk * (id === campaign.playerId ? campaign.nextAttackMultiplier : 1)),
      def: Math.max(0, state.def + temporaryModifiers.def), spd: Math.max(0, state.spd + temporaryModifiers.spd),
      roundLimitedSpdEffects, spdWithoutRoundEffects: Math.max(0, state.spd + temporaryModifiers.spd - roundLimitedSpdTotal),
      damageTakenMultiplier: temporaryModifiers.damageTakenMultiplier, damageDealtMultiplier: temporaryModifiers.damageDealtMultiplier,
      damageReductionBonus: treasureModifiers.damageReduction, dodgeRateBonus: treasureModifiers.dodgeRateBonus,
      quinqueGuard: state.permanentEffects?.some((effect) => effect.id === "quinque_guard") ?? false,
      quinqueCrit: state.permanentEffects?.some((effect) => effect.id === "quinque_crit") ?? false,
      unavoidableAttack: treasureModifiers.unavoidableAttack,
      lifesteal: treasureModifiers.lifesteal, normalAttackCurrentHpRatio: treasureModifiers.normalAttackCurrentHpRatio,
      critChance: state.critRate, critMultiplier: state.critMultiplier,
      passiveSkillId: state.passiveSkillId, passiveLevel: state.passiveLevel ?? 1,
      extraPassiveSkillIds: state.extraPassiveSkillIds ?? [], evolutionPhase: state.evolution?.phase ?? 1,
      skills: skillEffects, skill: skillEffects[0] ?? null,
    };
    if (id === "tang" && state.evolution?.phase === 2) {
      const journey = skillEffects.find((skill) => skill.id === "journey-west");
      ally.tangSummonHpBonus = journey?.summonHpBonus ?? 0;
      ally.tangWukongReconciled = Boolean(journey?.reconcileWukong);
    }
    if (battle.enemies.includes("odin")) {
      const stat = odinWeakestPointStat(state.statPointChoices);
      ally.odinMimirStat = stat;
      if (stat) {
        if (stat === "maxHp") ally.odinMimirHpBefore = ally.currentHp;
        ally[stat] = Math.max(stat === "maxHp" ? 1 : 0, Math.floor(ally[stat] * .5));
        if (stat === "maxHp") {
          ally.hp = ally.maxHp;
          ally.currentHp = Math.min(ally.currentHp, ally.maxHp);
          ally.odinMimirBattleStartHp = ally.currentHp;
        }
      }
    }
    if (state.divinePunishment?.battlesLeft > 0) ally.healingBlocked = true;
    return ally;
  });
  campaign.nextAttackMultiplier = 1;
  const enemies = battle.enemies.map((enemyId) => {
    const template = enemyTemplates.get(enemyId) ?? ELITE_ENEMY_DATA.find((entry) => entry.id === enemyId) ??
      (enemyId === STAGE_TWO_BOSS_DATA.id ? STAGE_TWO_BOSS_DATA : null) ??
      (enemyId === STAGE_THREE_BOSS_DATA.id ? STAGE_THREE_BOSS_DATA : null) ?? EVENT_ENEMY_DATA[enemyId] ?? TRIAL_ENEMY_DATA[enemyId];
    if (!template) throw new RangeError(`Unknown battle enemy: ${enemyId}`);
    const appearanceId = battle.type === "normal"
      ? battle.enemyAppearanceIds?.[enemyId] ?? (enemyId === "guard" ? "giant" : enemyId === "mage" ? "mage" : null)
      : null;
    const appearance = appearanceId ? NORMAL_ENEMY_APPEARANCES[appearanceId] : null;
    const stageTwoNormal = campaign.stageId === 2 && battle.type === "normal";
    const stageThreeNormal = campaign.stageId === 3 && battle.type === "normal";
    const trialNormal = campaign.trialBattle && !["heracles", "odin"].includes(enemyId);
    const baseStats = trialNormal ? getStageThreeNormalEnemyStats(template.row === "front" ? "guard" : "mage", routeStep)
      : stageTwoNormal ? getStageTwoNormalEnemyStats(enemyId, routeStep)
      : stageThreeNormal ? getStageThreeNormalEnemyStats(enemyId, routeStep)
      : battle.enemyBaseStats?.[enemyId] ?? (campaign.stageId === 1 && battle.type === "normal"
        ? { ...template, atk: template.atk + 10 } : template);
    const baseHp = baseStats.hp ?? baseStats.maxHp;
    const enemyGrowth = stageTwoNormal || stageThreeNormal || (campaign.stageId >= 2 && battle.type === "elite") ||
      battle.enemyGrowthExemptIds?.includes(enemyId) ? { hp: 1, atk: 1, def: 1 } : routeGrowth;
    const maxHp = Math.max(1, Math.floor(baseHp * enemyGrowth.hp));
    const summonedGuard = template.summonPassive?.unitId === "guard" ? (() => {
      const guard = enemyTemplates.get("guard");
      const growth = getRouteEnemyGrowth("normal", routeStep, campaign.stageId);
      const hp = Math.max(1, Math.floor(guard.hp * growth.hp));
      return { ...guard, name: "普通巨人", asset: NORMAL_ENEMY_APPEARANCES.giant.asset,
        appearanceId: "giant", visualId: "giant", hp, maxHp: hp, currentHp: hp,
        atk: Math.max(1, Math.floor(guard.atk * growth.atk)),
        def: Math.max(1, Math.floor(guard.def * growth.def)), spd: guard.spd,
        skill: null, skills: [], rosterOrder: 1 };
    })() : null;
    const isDeidaraBoss = battle.type === "boss" && battle.enemyNames?.[enemyId] === "迪达拉";
    const bossSkillConfig = SKILL_DATA["c4-garuda"];
    const bossSkill = isDeidaraBoss ? { ...bossSkillConfig, ...bossSkillConfig.levels[1], level: 1 } : null;
    const eliteSkills = (template.activeSkills ?? []).map((skillId) => {
      const config = SKILL_DATA[skillId];
      return config?.levels?.[1] ? { ...config, ...config.levels[1], level: 1 } : null;
    }).filter(Boolean);
    const mimic = enemyId === "six_ear" ? allies.find((ally) => ally.id === campaign.playerId) : null;
    return {
      ...template, name: battle.enemyNames?.[enemyId] ?? appearance?.name ?? template.name,
      ...(mimic ? {
        mimicSourceId: mimic.id, animationTiming: mimic.animationTiming,
        asset: mimic.asset, animations: { ...mimic.animations, death: template.deathAnimation }, visualId: mimic.visualId ?? mimic.id,
        attackType: mimic.attackType, skillAnimationMap: mimic.skillAnimationMap,
        hp: mimic.maxHp, maxHp: mimic.maxHp, currentHp: mimic.currentHp,
        atk: mimic.atk, def: mimic.def, spd: mimic.spd,
        critChance: mimic.critChance, critMultiplier: mimic.critMultiplier,
        dodgeRateBonus: mimic.dodgeRateBonus, damageReductionBonus: mimic.damageReductionBonus,
        lifesteal: mimic.lifesteal, normalAttackCurrentHpRatio: mimic.normalAttackCurrentHpRatio,
        unavoidableAttack: mimic.unavoidableAttack, damageTakenMultiplier: mimic.damageTakenMultiplier,
        damageDealtMultiplier: mimic.damageDealtMultiplier,
        roundLimitedSpdEffects: mimic.roundLimitedSpdEffects?.map((effect) => ({ ...effect })),
        spdWithoutRoundEffects: mimic.spdWithoutRoundEffects,
        passiveSkillId: mimic.passiveSkillId, passiveLevel: mimic.passiveLevel,
        extraPassiveSkillIds: [...(mimic.extraPassiveSkillIds ?? [])],
        skills: mimic.skills.map((skill) => ({ ...skill })), skill: mimic.skill ? { ...mimic.skill } : null,
      } : {}),
      ...(appearance ? { asset: appearance.asset, appearanceId, visualId: appearanceId } : {}),
      ...((stageTwoNormal || stageThreeNormal) && appearanceId ? { normalPassiveId: appearanceId } : {}),
      ...(isDeidaraBoss ? {
        role: "爆破艺术家",
        visualId: "deidara",
        asset: "assets/deidara-v2/idle/idle_1.png",
        animations: DEIDARA_ANIMATIONS,
        attackAnimation: "attack",
        skillAnimationMap: { "c4-garuda": "skill1" },
      } : {}),
      hp: mimic?.maxHp ?? maxHp, maxHp: mimic?.maxHp ?? maxHp, currentHp: mimic?.currentHp ?? maxHp,
      atk: mimic?.atk ?? (baseStats.atk === 0 ? 0 : Math.max(1, Math.floor(baseStats.atk * enemyGrowth.atk))),
      def: mimic?.def ?? Math.max(1, Math.floor(baseStats.def * enemyGrowth.def)),
      spd: mimic?.spd ?? Math.max(1, baseStats.spd),
      ...(summonedGuard ? { summonPassive: { ...template.summonPassive, unit: summonedGuard } } : {}),
      ...(template.type === "elite" || template.activeSkills?.length ? {
        team: "enemy", row: template.row ?? "front", position: template.position ?? "front",
        skills: eliteSkills, skill: eliteSkills[0] ?? null,
        skillAnimationMap: template.skillAnimationMap ?? {},
      } : {}),
      ...(template.elitePassiveId ? { elitePassiveId: template.elitePassiveId } : {}),
      ...(template.escapeAsset ? { escapeAsset: template.escapeAsset } : {}),
      ...(isDeidaraBoss ? { skill: bossSkill, skills: [bossSkill], c0DamagePerRound: battle.enemyMechanics?.[enemyId]?.c0DamagePerRound ?? 100 } : {}),
    };
  });
  const combatRunStates = { ...campaign.partyStates };
  if (enemies.some((enemy) => enemy.id === "six_ear")) {
    const snapshot = JSON.parse(JSON.stringify(run));
    snapshot.characterId = "six_ear";
    snapshot.passiveUses = {};
    snapshot.battleStartPassiveChecks = {};
    combatRunStates.six_ear = snapshot;
  }
  campaign.currentBattle.id = battleId;
  if (battle.enemies.includes("makima")) {
    for (const id of ["makima-bomb", "flamethrower-devil"]) {
      const template = STAGE_THREE_MINIONS[id];
      const skills = (template.activeSkills ?? []).map((skillId) => {
        const config = SKILL_DATA[skillId];
        return { ...config, ...config.levels[1], level: 1 };
      });
      const source = id === "makima-bomb" ? ELITE_ENEMY_DATA.find((entry) => entry.id === "bomb-demon") : null;
      enemies.push({ ...template, maxHp: template.hp, currentHp: template.hp,
        ...(source ? { animations: { ...source.animations, ...template.animations }, skillAnimationMap: source.skillAnimationMap } : {}),
        rosterOrder: enemies.length + 1, skills, skill: skills[0] ?? null });
    }
  }
  return {
    battle: campaign.currentBattle, roster: [...allies, ...enemies],
    combatOptions: { runCharacterState: run, runCharacterStates: combatRunStates, playerId: campaign.playerId, battleId, battleStartEffects },
  };
}

export function finishBattle(campaign, outcome, playerHp, battleEvents = [], finalCharacters = null) {
  if (!campaign || campaign.status !== "combat" || !campaign.combatLaunched) return false;
  campaign.combatLaunched = false;
  campaign.lastBattleRecovery = [];
  // Jason changes the run's HP ceiling, not just this battle copy. Apply the
  // immutable precomputed events once, before clamping each member's HP.
  for (const event of battleEvents) {
    if (event?.type !== "jason-max-hp" || !campaign.partyIds.includes(event.targetId)) continue;
    const state = campaign.partyStates?.[event.targetId] ??
      (event.targetId === campaign.playerId ? campaign.runCharacterState : null);
    if (state) state.maxHp = Math.max(1, state.maxHp - event.reduction);
  }
  for (const event of battleEvents) {
    if (event?.type !== "normal-passive-gollum") continue;
    for (const { targetId } of event.targets ?? []) {
      if (!campaign.partyIds.includes(targetId)) continue;
      const state = campaign.partyStates?.[targetId];
      if (!state) continue;
      state.atk = Math.max(0, state.atk - 5);
      state.def = Math.max(0, state.def - 5);
      state.spd = Math.max(0, state.spd - 5);
    }
  }
  for (const event of battleEvents) {
    if (event?.type !== "ah-fu-escape" || !campaign.partyIds.includes(event.targetId) || event.amount <= 0) continue;
    const state = campaign.partyStates[event.targetId];
    const key = `ah-fu-stolen:${campaign.currentBattle?.id}:${event.targetId}`;
    if (!state || state.consumedActions.includes(key)) continue;
    state.def = Math.max(0, state.def - event.amount);
    state.permanentEffects.push({ id: "ah_fu_stolen_def", name: "娜美的窃取", sourceId: key,
      amount: event.amount, description: `娜美逃跑后，DEF 永久 -${event.amount}。` });
    state.consumedActions.push(key);
  }
  campaign.playerMaxHp = campaign.runCharacterState?.maxHp ?? campaign.playerMaxHp;
  campaign.playerHp = Math.max(0, Math.min(campaign.playerMaxHp, playerHp));
  for (const id of campaign.partyIds) {
    const state = campaign.partyStates?.[id] ?? (id === campaign.playerId ? campaign.runCharacterState : null);
    const finished = finalCharacters?.find((character) => character.id === id && character.team === "ally");
    if (state) {
      const finalHp = finished?.currentHp ?? (id === campaign.playerId ? campaign.playerHp : state.currentHp);
      const restoredOdinHp = finalHp > 0 && Number.isFinite(finished?.odinMimirHpBefore) &&
        Number.isFinite(finished?.odinMimirBattleStartHp)
        ? finished.odinMimirHpBefore + finalHp - finished.odinMimirBattleStartHp : finalHp;
      state.currentHp = Math.max(0, Math.min(state.maxHp, restoredOdinHp));
    }
  }
  const completedRounds = battleEvents.findLast((event) => event?.type === "battle-end")?.round ?? 1;
  for (const id of campaign.partyIds) {
    const state = campaign.partyStates?.[id] ?? (id === campaign.playerId ? campaign.runCharacterState : null);
    if (state) advanceTemporaryEffectsAfterBattle(state, completedRounds);
  }
  if (campaign.runCharacterState && Array.isArray(battleEvents)) {
    const casts = new Set(battleEvents.filter(event => ["rasengan", "naruto-giant-rasengan"].includes(event?.skillId) && event.targetDied).map(event => event.skillCastId || [campaign.currentBattle?.id, event.round, event.attackerId].join(":")));
    for (const castId of casts) { const key = "rasengan-kill:" + castId; if (!campaign.runCharacterState.consumedActions.includes(key)) { campaign.runCharacterState.spd += 5; campaign.runCharacterState.consumedActions.push(key); } }
  }
  if (campaign.trial && campaign.partyIds.some((id) => campaign.partyStates[id]?.divinePunishment?.battlesLeft > 0)) {
    advanceDivinePunishment(campaign);
    campaign.playerMaxHp = campaign.runCharacterState.maxHp;
  }
  if (campaign.trialBattle) {
    const result = settleTrialBattle(campaign, outcome);
    if (result?.status !== "trial_next_battle" &&
        (result?.trialOutcome === "active" || result?.trialOutcome === "completed")) {
      // One completed trial challenge restores 25% of each member's current
      // maximum HP. The three divine-punishment fights remain one challenge.
      for (const id of campaign.partyIds) {
        const state = campaign.partyStates[id];
        if (!state) continue;
        const before = state.currentHp;
        state.currentHp = Math.min(state.maxHp, before + Math.floor(state.maxHp * .25));
        campaign.lastBattleRecovery.push({ characterId: id, kind: "trial_quarter_heal", restored: state.currentHp - before, currentHp: state.currentHp });
      }
    }
    campaign.playerHp = campaign.runCharacterState.currentHp;
    campaign.playerMaxHp = campaign.runCharacterState.maxHp;
    return result;
  }
  if (outcome !== "victory" || !campaign.partyIds.some((id) => (campaign.partyStates?.[id]?.currentHp ?? 0) > 0)) {
    if (campaign.eventBattleSourceId) completeAdventureBattle(campaign.runCharacterState, campaign.eventBattleSourceId, "defeat", campaign.random);
    campaign.settlementNext = "defeat";
    campaign.status = "settlement";
    return { status: "settlement", next: "defeat" };
  }
  // Victory is already fixed by the precomputed battle outcome. Rejoin fallen
  // allies first, then apply treasure healing; neither can rescue a lost fight.
  if (campaign.stageId >= 2 && campaign.partyIds.length > 1) for (const id of campaign.partyIds) {
    const state = campaign.partyStates[id];
    if (state?.currentHp === 0) {
      state.currentHp = Math.max(1, Math.floor(state.maxHp * .05));
      campaign.lastBattleRecovery.push({ characterId: id, kind: "revive", restored: state.currentHp, currentHp: state.currentHp });
    }
  }
  for (const id of campaign.partyIds) {
    const state = campaign.partyStates[id];
    if (!state || state.currentHp <= 0 || !state.permanentEffects?.some((effect) => effect.id === "angel_breath")) continue;
    const before = state.currentHp;
    state.currentHp = Math.min(state.maxHp, before + Math.floor(state.maxHp * TREASURE_DATA.angel_breath.battleEndHealRatio));
    campaign.lastBattleRecovery.push({ characterId: id, kind: "angel_breath", restored: state.currentHp - before, currentHp: state.currentHp });
  }
  campaign.playerHp = campaign.runCharacterState.currentHp;
  campaign.completedBattles += 1;
  campaign.consecutiveWithoutBattle = 0;
  if (campaign.devBattleOnly) {
    campaign.settlementNext = "victory";
    campaign.status = "settlement";
    return { status: "settlement", next: "victory" };
  }
  if (campaign.currentBattle?.type === "boss" || campaign.activeNode?.type === "demon") {
    campaign.settlementNext = "victory";
    campaign.status = "settlement";
    return { status: "settlement", next: "victory" };
  }

  campaign.rewardBattleType = campaign.eventBattleSourceId
    ? campaign.runCharacterState.eventResults[campaign.eventBattleSourceId]?.data.battleType
    : campaign.currentBattle?.type === "elite" || campaign.activeNode?.resolution === "elite" ? "elite" : "normal";
  if (campaign.eventBattleSourceId) {
    const result = completeAdventureBattle(campaign.runCharacterState, campaign.eventBattleSourceId, "victory", campaign.random,
      { deferSpinalFluid: campaign.stageId === 2 });
    if (!result || result.status !== "awaiting_reward") return false;
    campaign.playerMaxHp = campaign.runCharacterState.maxHp;
    campaign.playerHp = campaign.runCharacterState.currentHp;
    campaign.rewardBattleId = campaign.runCharacterState.eventResults[campaign.eventBattleSourceId].data.rewardBattleId;
  } else {
    campaign.rewardBattleId = campaign.activeNode?.id ?? campaign.currentBattle?.id;
    if (campaign.stageId === 1) createBattleRewardOffer(campaign.runCharacterState, campaign.rewardBattleId, campaign.rewardBattleType, campaign.random);
  }
  const giantRecord = campaign.eventBattleSourceId && campaign.runCharacterState.eventResults[campaign.eventBattleSourceId];
  campaign.rewardPhase = campaign.stageId === 2 && giantRecord?.eventId === "giant_encirclement" &&
    giantRecord.data.choiceId === "giant_heart" ? "giant_recipient"
    : giantRecord?.eventId === "kings_treasury" ? "treasure"
      : giantRecord?.data.quinquePending ? "quinque"
      : giantRecord?.data.specialRewardId ? giantRecord.eventId === "anteiku_2" ? "event_epilogue" : "special_recipient" : "stat";
  campaign.status = "reward";
  if (campaign.activeNode) campaign.activeNode.rewardStatus = "pending";
  if (campaign.stageId >= 2) {
    const random = createSeededRandom(`stage2-reward:${campaign.routeMap.seed}:${campaign.rewardBattleId}`);
    const pool = STAGE_TWO_STAT_UPGRADES.map((upgrade) => upgrade.id);
    const choices = [];
    while (choices.length < 3) choices.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
    campaign.stageTwoReward = { battleId: campaign.rewardBattleId, choices, assignments: [], phase: "stat" };
  }
  return { status: "reward", next: "reward", battleType: campaign.rewardBattleType };
}

export function completeSettlement(campaign) {
  if (!campaign || campaign.status !== "settlement" || !campaign.settlementNext) return null;
  const next = campaign.settlementNext;
  campaign.settlementNext = null;
  if (next === "victory" && campaign.activeNode) {
    campaign.activeNode.status = "completed";
    campaign.history.push({ id: campaign.activeNode.id, step: campaign.step, stageId: campaign.stageId, type: campaign.activeNode.type, resolution: campaign.activeNode.resolution, status: "completed" });
    campaign.activeNode = null;
  }
  if (next === "victory" && campaign.stageId === 2 && campaign.currentBattle?.type === "boss" && !campaign.devBattleOnly) {
    campaign.step += 1;
    campaign.stageTransition = { phase: "stage2_skill", memberIndex: 0, statIndex: 0 };
    campaign.status = "stage_transition";
  } else if (next === "victory" && campaign.stageId === 1) {
    campaign.step += 1;
    campaign.stageTransition = { phase: "hero_skill", skillRemaining: 1, heroActiveSkillRemaining: 1, statRemaining: 3,
      candidateIds: [], partnerId: null, partnerStatRemaining: 5, partnerSkillRemaining: 1, offer: null };
    campaign.status = "stage_transition";
  } else campaign.status = next;
  return campaign.status;
}

function finishRewardAndAdvance(campaign) {
  campaign.playerHp = campaign.runCharacterState.currentHp;
  if (campaign.eventBattleSourceId) {
    const record = campaign.runCharacterState.eventResults[campaign.eventBattleSourceId];
    if (record?.eventId === "kings_treasury" && !record.data.treasureOffer?.claimed) return false;
    if (record?.data.quinquePending && !record.data.quinqueClaimed) return false;
    if (record?.data.specialRewardId && !record.data.specialRewardClaimed) return false;
    if (campaign.stageId >= 2 && record?.status === "awaiting_reward") {
      record.status = "completed";
      record.result = { stageTwoAssignments: [...(campaign.stageTwoReward?.assignments ?? [])] };
    }
    if (record?.status !== "completed") return false;
    campaign.eventResolved = true;
  }
  if (campaign.activeNode) campaign.activeNode.rewardStatus = "claimed";
  const completed = completeActiveNode(campaign);
  if (!completed) return false;
  campaign.currentBattle = null;
  campaign.rewardBattleId = null;
  campaign.rewardPhase = null;
  campaign.rewardBattleType = null;
  campaign.eventBattleSourceId = null;
  return campaign.status;
}

export function getCampaignRewardOffer(campaign) {
  if (!campaign?.runCharacterState || campaign.status !== "reward" || !campaign.rewardBattleId) return null;
  if (campaign.stageId >= 2 && campaign.stageTwoReward) return campaign.stageTwoReward;
  return campaign.runCharacterState.rewardOffers[campaign.rewardBattleId] ?? null;
}

function eliteDropId(campaign) {
  if (campaign?.currentBattle?.type !== "elite") return null;
  const enemies = campaign.currentBattle.enemies ?? [];
  if (enemies.includes("mahito")) return "sukuna_finger";
  if (enemies.includes("bomb-demon")) return "gun_devil_fragment";
  if (campaign.stageId === 2 && enemies.includes("armored-titan") && enemies.includes("colossal-titan"))
    return "giant_spinal_fluid";
  return null;
}

export function claimCampaignEliteDrop(campaign, recipientId) {
  const dropId = eliteDropId(campaign);
  if (!dropId || campaign?.status !== "reward" || campaign.rewardPhase !== "elite_drop" ||
    !campaign.partyIds.includes(recipientId) || campaign.eventBattleSourceId ||
    campaign.activeNode?.status !== "in_progress") return false;
  const sourceId = campaign.rewardBattleId;
  const recipient = campaign.partyStates[recipientId];
  if (!sourceId || !recipient || campaign.partyIds.some((id) => id !== recipientId &&
    campaign.partyStates[id]?.permanentEffects?.some((item) => item.id === dropId && item.sourceId === sourceId))) return false;
  // A failed route transition must be retryable without granting the item twice.
  const existing = recipient.permanentEffects?.find((item) => item.id === dropId && item.sourceId === sourceId);
  const effect = existing ?? (dropId === "giant_spinal_fluid"
    ? grantGiantSpinalFluid(recipient, sourceId)
    : dropId === "gun_devil_fragment"
      ? grantGunDevilFragment(recipient, sourceId)
      : grantEliteSukunaFinger(recipient, sourceId));
  if (!effect) return false;
  campaign.playerHp = campaign.runCharacterState.currentHp;
  campaign.playerMaxHp = campaign.runCharacterState.maxHp;
  const offer = campaign.runCharacterState.rewardOffers?.[sourceId];
  const status = finishRewardAndAdvance(campaign);
  if (!status) return false;
  if (offer?.status === "awaiting_bonus") offer.status = "applied";
  if (campaign.stageId >= 2) campaign.stageTwoReward = null;
  return { effect, recipientId, status };
}

export function getCampaignTreasureOffer(campaign) {
  if (!campaign || !["event", "reward"].includes(campaign.status)) return null;
  const sourceId = campaign.status === "reward" ? campaign.eventBattleSourceId : campaign.activeNode?.id;
  const record = sourceId && campaign.runCharacterState?.eventResults?.[sourceId];
  if (record?.eventId !== "kings_treasury" || !record.data.treasureOffer || record.data.treasureOffer.claimed) return null;
  return { sourceId, ...record.data.treasureOffer };
}

export function claimCampaignTreasure(campaign, treasureId, recipientId) {
  const offer = getCampaignTreasureOffer(campaign);
  if (!offer || !campaign.partyIds.includes(recipientId) ||
    (campaign.status === "reward" && campaign.rewardPhase !== "treasure") ||
    (campaign.status === "event" && campaign.eventResolved)) return false;
  const record = campaign.runCharacterState.eventResults[offer.sourceId];
  const effect = claimTreasure(campaign.runCharacterState, offer.sourceId, treasureId,
    campaign.partyStates[recipientId], recipientId);
  if (!effect) return false;
  campaign.playerHp = campaign.runCharacterState.currentHp;
  campaign.playerMaxHp = campaign.runCharacterState.maxHp;
  if (campaign.status === "reward") {
    campaign.rewardPhase = "stat";
    return { ...effect, next: "stat" };
  }
  campaign.eventResolved = true;
  record.result = { treasureId, recipientId, treasure: effect.name };
  campaign.pendingEvent = record;
  campaign.activeNode.resolutionResult = record.result;
  campaign.resolvedEvents.push({ id: offer.sourceId, title: record.name, result: record.result });
  return { ...effect, next: "route" };
}

export function advanceEventEpilogue(campaign) {
  const record = campaign?.eventBattleSourceId && campaign.runCharacterState?.eventResults?.[campaign.eventBattleSourceId];
  if (campaign?.status !== "reward" || campaign.rewardPhase !== "event_epilogue" ||
    record?.eventId !== "anteiku_2" || record.data.specialRewardClaimed) return false;
  campaign.rewardPhase = "special_recipient";
  return true;
}

export function claimCampaignSpecialReward(campaign, recipientId) {
  const record = campaign?.eventBattleSourceId && campaign.runCharacterState?.eventResults?.[campaign.eventBattleSourceId];
  if (campaign?.status !== "reward" || campaign.rewardPhase !== "special_recipient" ||
    !record?.data.specialRewardId || record.data.specialRewardClaimed || !campaign.partyIds.includes(recipientId)) return false;
  const reward = grantAdventureSpecialReward(campaign.partyStates[recipientId], record.sourceId, record.data.specialRewardId);
  if (!reward) return false;
  record.data.specialRewardClaimed = { recipientId, rewardId: reward.id };
  campaign.rewardPhase = "stat";
  return reward;
}

export function claimCampaignQuinque(campaign, recipientId, rewardId) {
  const record = campaign?.eventBattleSourceId && campaign.runCharacterState?.eventResults?.[campaign.eventBattleSourceId];
  if (campaign?.status !== "reward" || campaign.rewardPhase !== "quinque" ||
    record?.eventId !== "anteiku_3" || !record.data.quinquePending || record.data.quinqueClaimed ||
    !campaign.partyIds.includes(recipientId)) return false;
  const reward = grantQuinque(campaign.partyStates[recipientId], record.sourceId, rewardId);
  if (!reward) return false;
  record.data.quinqueClaimed = { recipientId, rewardId };
  campaign.rewardPhase = "stat";
  return reward;
}

export function claimStageTwoGiantRecipient(campaign, characterId) {
  if (campaign?.stageId !== 2 || campaign.status !== "reward" || campaign.rewardPhase !== "giant_recipient" ||
    !campaign.partyIds.includes(characterId) || !campaign.eventBattleSourceId) return false;
  const record = campaign.runCharacterState.eventResults[campaign.eventBattleSourceId];
  if (record?.eventId !== "giant_encirclement" || record.data.choiceId !== "giant_heart" ||
    record.status !== "awaiting_reward" || record.data.spinalFluidGranted) return false;
  const effect = grantGiantSpinalFluid(campaign.partyStates[characterId], record.sourceId);
  if (!effect) return false;
  record.data.spinalFluidGranted = true;
  record.data.spinalFluidRecipientId = characterId;
  campaign.rewardPhase = "stat";
  campaign.playerHp = campaign.runCharacterState.currentHp;
  campaign.playerMaxHp = campaign.runCharacterState.maxHp;
  return { characterId, effect };
}

export function claimStageTwoStatReward(campaign, characterId, statId) {
  const offer = getCampaignRewardOffer(campaign);
  const expectedCharacterId = offer?.assignments.length === 0
    ? campaign?.playerId
    : campaign?.partyIds.find((id) => id !== campaign.playerId);
  if (campaign?.stageId < 2 || campaign.status !== "reward" || campaign.rewardPhase !== "stat" ||
    !offer || offer.phase !== "stat" || characterId !== expectedCharacterId ||
    !offer.choices.includes(statId) || offer.assignments.some((item) => item.characterId === characterId || item.statId === statId)) return false;
  const state = campaign.partyStates[characterId];
  const upgrade = STAGE_TWO_STAT_UPGRADES.find((item) => item.id === statId);
  if (!state || !upgrade) return false;
  state[statId] += upgrade.value;
  state.statPointChoices ??= { maxHp: 0, atk: 0, def: 0, spd: 0 };
  state.statPointChoices[statId] = (state.statPointChoices[statId] ?? 0) + 1;
  state.currentHp = Math.min(state.maxHp, state.currentHp);
  offer.assignments.push({ characterId, statId });
  if (offer.assignments.length < 2) return { phase: "stat", remaining: 1 };
  offer.phase = "complete";
  if (eliteDropId(campaign)) {
    campaign.rewardPhase = "elite_drop";
    return { phase: "elite_drop" };
  }
  if (campaign.rewardBattleType === "elite") {
    campaign.rewardPhase = "bonus";
    offer.eliteAssignments ??= [];
    return { phase: "bonus" };
  }
  const status = finishRewardAndAdvance(campaign);
  campaign.stageTwoReward = null;
  return { phase: "complete", status };
}

export function claimStageTwoEliteSkill(campaign, characterId, skillId) {
  if (campaign?.stageId < 2 || campaign.status !== "reward" || campaign.rewardPhase !== "bonus" ||
    !campaign.stageTwoReward || !campaign.partyIds.includes(characterId)) return false;
  const offer = campaign.stageTwoReward;
  offer.eliteAssignments ??= [];
  if (offer.eliteAssignments.some((item) => item.characterId === characterId) ||
    campaign.partyIds[offer.eliteAssignments.length] !== characterId) return false;
  const state = campaign.partyStates[characterId];
  if (!getSkillTrainingChoices(state).includes(skillId)) return false;
  const sourceId = `stage2-elite:${campaign.rewardBattleId}:${characterId}`;
  const trained = getUpgradeableSkills(state).length
    ? upgradeActiveSkill(state, skillId, sourceId)
    : learnActiveSkill(state, skillId, sourceId);
  if (!trained) return false;
  offer.eliteAssignments.push({ characterId, skillId });
  if (offer.eliteAssignments.length < campaign.partyIds.length) return { phase: "bonus", remaining: campaign.partyIds.length - offer.eliteAssignments.length };
  const status = finishRewardAndAdvance(campaign);
  campaign.stageTwoReward = null;
  return { phase: "complete", status };
}

export function claimStageTwoEliteSkip(campaign, characterId = campaign?.partyIds?.[campaign?.stageTwoReward?.eliteAssignments?.length ?? 0]) {
  if (campaign?.stageId < 2 || campaign.status !== "reward" || campaign.rewardPhase !== "bonus" ||
    !campaign.stageTwoReward || campaign.partyIds[campaign.stageTwoReward.eliteAssignments?.length ?? 0] !== characterId ||
    (getSkillTrainingChoices(campaign.partyStates[characterId]).length && !canDeclineNewSkill(campaign.partyStates[characterId]))) return false;
  const offer = campaign.stageTwoReward;
  offer.eliteAssignments ??= [];
  offer.eliteAssignments.push({ characterId, skipped: true });
  if (offer.eliteAssignments.length < campaign.partyIds.length) return { phase: "bonus", remaining: campaign.partyIds.length - offer.eliteAssignments.length };
  const status = finishRewardAndAdvance(campaign);
  campaign.stageTwoReward = null;
  return { phase: "complete", status };
}

export function claimCampaignReward(campaign, choiceId, extraChoiceId = null, skillId = null) {
  if (!campaign || campaign.status !== "reward" || !campaign.runCharacterState || !campaign.rewardBattleId) return false;
  const offer = getCampaignRewardOffer(campaign);
  if (!offer) return false;
  if (campaign.rewardPhase === "stat") {
    const result = campaign.eventBattleSourceId
      ? applyAdventureBattleStatReward(campaign.runCharacterState, campaign.eventBattleSourceId, choiceId)
      : applyBattleStatReward(campaign.runCharacterState, campaign.rewardBattleId, choiceId);
    if (!result) return false;
    campaign.playerHp = campaign.runCharacterState.currentHp;
    campaign.playerMaxHp = campaign.runCharacterState.maxHp;
    if (result.status === "awaiting_bonus" || (result.status === "applied" && eliteDropId(campaign))) {
      campaign.rewardPhase = eliteDropId(campaign) ? "elite_drop" : "bonus";
      if (campaign.activeNode) campaign.activeNode.rewardStatus = campaign.rewardPhase;
      return { phase: campaign.rewardPhase, result };
    }
    if (result.status !== "applied" && result.status !== "completed") return { phase: "stat", result };
    if (campaign.activeNode) campaign.activeNode.rewardStatus = "claimed";
    return { phase: "complete", result, status: finishRewardAndAdvance(campaign) };
  }
  if (campaign.rewardPhase === "bonus") {
    const result = campaign.eventBattleSourceId
      ? applyAdventureBattleBonusReward(campaign.runCharacterState, campaign.eventBattleSourceId, choiceId, skillId)
      : applyBattleBonusReward(campaign.runCharacterState, campaign.rewardBattleId, choiceId, skillId);
    if (!result) return false;
    campaign.playerHp = campaign.runCharacterState.currentHp;
    campaign.playerMaxHp = campaign.runCharacterState.maxHp;
    if (campaign.activeNode) campaign.activeNode.rewardStatus = "claimed";
    return { phase: "complete", result, status: finishRewardAndAdvance(campaign) };
  }
  return false;
}

export function getRouteOptions(campaign) {
  return campaign?.status === "route" ? legalChildren(campaign).filter((node) => node.status === "pending" &&
    (campaign.stageId !== 3 || campaign.trialOffered || node.type === "question")) : [];
}

export function getRouteMap(campaign) {
  return campaign?.routeMap ?? null;
}

export function chooseRoute(campaign, nodeId) {
  if (!campaign || campaign.status !== "route") return null;
  const node = getRouteOptions(campaign).find((option) => option.id === nodeId && option.status === "pending");
  if (!node) return null;
  const current = campaign.routeMap.nodes.find((entry) => entry.id === campaign.routeMap.currentNodeId);
  if (!current || !current.nextNodeIds.includes(node.id)) return null;
  campaign.routeMap.visitedEdges.push({ from: current.id, to: node.id });
  node.status = "entered";
  campaign.activeNode = node;
  node.status = "in_progress";
  if (node.type === "battle") {
    return enterBattle(campaign, node, "normal");
  }
  if (node.type === "elite") return enterBattle(campaign, node, "elite");
  if (node.type === "demon") return enterBattle(campaign, node, "boss");

  if (node.type === "campfire") {
    node.resolution = "campfire";
    campaign.activeEventType = "campfire";
    campaign.pendingEvent = null;
  } else {
    campaign.activeEventType = "adventure";
    if (campaign.stageId === 3 && !campaign.chapter3FirstEncounterAssigned) {
      campaign.chapter3FirstEncounterAssigned = true;
      campaign.pendingEvent = { sourceId: node.id, eventId: "trial_land", name: "试炼之地",
        description: "道路上，是无尽的试炼", image: "assets/events/event_trial_land.png",
        status: "pending", type: "trial", data: { stageId: 3 } };
      campaign.runCharacterState.eventResults[node.id] = campaign.pendingEvent;
    } else {
      const partyStates = campaign.partyIds.map((id) => campaign.partyStates[id]);
      const eventId = chooseAdventureEventId(campaign.runCharacterState, campaign.random, campaign.step, partyStates, campaign.stageId);
      campaign.pendingEvent = createAdventureEventResult(campaign.runCharacterState, node.id, eventId, campaign.random, partyStates, campaign.stageId);
    }
    node.resolution = campaign.pendingEvent.eventId;
  }
  campaign.eventResolved = false;
  campaign.status = "event";
  return { type: "event", event: campaign.pendingEvent, symbol: node.type === "question" ? "?" : "campfire" };
}

export function resolveRouteEvent(campaign) {
  if (!campaign || campaign.status !== "event" || campaign.eventResolved) return null;
  if (campaign.activeEventType === "campfire") return false;
  const record = campaign.pendingEvent;
  if (record?.containsBattle) return false;
  const choices = record?.data?.statChoices ?? record?.data?.skillChoices ?? [];
  const result = resolveCampaignEvent(campaign, choices[0] ?? null);
  return result ? { event: record, result: record.result, playerHp: campaign.playerHp } : null;
}

export function resolveCampaignEvent(campaign, choiceId = null, skillId = null) {
  if (!campaign || campaign.status !== "event" || campaign.eventResolved || !campaign.activeNode) return false;
  let result;
  if (campaign.activeEventType === "campfire") {
    result = resolveCampfire(campaign.runCharacterState, campaign.activeNode.id, choiceId, skillId);
  } else {
    const record = campaign.runCharacterState.eventResults[campaign.activeNode.id];
    if (record?.eventId === "scroll" && choiceId === "scroll_follow" && record.status === "pending" && record.data.scrollPhase === "intro") {
      record.data.scrollPhase = campaign.partyIds.length > 1 ? "recipient" : "skill";
      campaign.pendingEvent = record;
      return { ...record, result: { continued: true } };
    }
    if (["scroll", "old_scroll_2"].includes(record?.eventId) && typeof choiceId === "string" &&
      choiceId.startsWith("scroll_recipient|")) {
      const recipientId = choiceId.split("|")[1];
      const recipient = campaign.partyStates[recipientId];
      if (!campaign.partyIds.includes(recipientId) || record.status !== "pending" || record.data.recipientId ||
        !recipient || (record.eventId === "scroll" ? !getUnlearnedActiveSkills(recipient).length :
          !recipient.learnedActiveSkills.length)) return false;
      record.data.recipientId = recipientId;
      if (record.eventId === "scroll") {
        record.data.skillChoices = getUnlearnedActiveSkills(recipient);
        record.data.scrollPhase = "skill";
      }
      campaign.pendingEvent = record;
      if (record.eventId === "scroll") return { ...record, result: { continued: true } };
      choiceId = "scroll_mountain";
    }
    if (record?.eventId === "old_scroll_2" && choiceId === "scroll_mountain" && !record.data.recipientId) {
      record.data.awaitingRecipient = true;
      campaign.pendingEvent = record;
      return { ...record, result: { continued: true } };
    }
    if (campaign.stageId >= 2 && record?.eventId === "scroll" && choiceId !== "scroll_leave" && !record.data.recipientId) return false;
    if (record?.eventId === "old_scroll_2" && choiceId === "scroll_mountain" && !record.data.recipientId) return false;
    const seaRecipientId = record?.eventId === "sea_beyond" && choiceId?.startsWith("sea_recipient|")
      ? choiceId.split("|")[1] : record?.eventId === "sea_beyond_2" && choiceId === "sea_stay"
        ? campaign.runCharacterState.eventSeries.sea?.recipientId : record?.eventId === "sea_beyond"
          ? record.data.recipientId : null;
    if (seaRecipientId && !campaign.partyIds.includes(seaRecipientId)) return false;
    const recipient = seaRecipientId ? campaign.partyStates[seaRecipientId]
      : ["scroll", "old_scroll_2"].includes(record?.eventId) && record.data.recipientId
        ? campaign.partyStates[record.data.recipientId] : campaign.runCharacterState;
    result = resolveAdventureEvent(campaign.runCharacterState, campaign.activeNode.id, choiceId, campaign.random, recipient);
  }
  if (!result) return false;
  campaign.pendingEvent = campaign.runCharacterState.eventResults[campaign.activeNode.id] ?? campaign.pendingEvent;
  campaign.playerHp = campaign.runCharacterState.currentHp;
  campaign.playerMaxHp = campaign.runCharacterState.maxHp;
  const eventRecord = campaign.runCharacterState.eventResults[campaign.activeNode.id];
  if (campaign.activeEventType === "adventure" && ["pending", "pending_battle", "awaiting_treasure"].includes(eventRecord?.status)) return result;
  if (campaign.stageId >= 2 && campaign.activeEventType === "adventure" && eventRecord?.status === "completed") {
    const appliedTo = [];
    for (const id of campaign.partyIds) {
      if (id !== campaign.playerId && applyAdventurePartyOutcome(campaign.partyStates[id], eventRecord)) appliedTo.push(id);
    }
    if (appliedTo.length) eventRecord.data.sharedWith = appliedTo;
  }
  campaign.eventResolved = true;
  campaign.activeNode.resolutionResult = result;
  campaign.resolvedEvents.push({ id: campaign.activeNode.id, title: campaign.activeEventType === "campfire" ? "篝火" : campaign.pendingEvent?.name, result });
  return result;
}

export function getActiveCampfireOptions(campaign) {
  if (!campaign || campaign.status !== "event" || campaign.activeEventType !== "campfire") return null;
  return getCampfireOptions(campaign.runCharacterState);
}

export function getStageTwoCampfireOptions(campaign) {
  if (campaign?.stageId < 2 || campaign.status !== "event" || campaign.activeEventType !== "campfire") return null;
  return campaign.partyIds.map((id) => ({ characterId: id, ...{ options: getCampfireOptions(campaign.partyStates[id]) } }));
}

export function resolveStageTwoCampfire(campaign, choiceId, skillChoices = {}) {
  if (campaign?.stageId < 2 || campaign.status !== "event" || campaign.activeEventType !== "campfire" || campaign.eventResolved) return false;
  const sourceId = campaign.activeNode?.id;
  const members = getStageTwoCampfireOptions(campaign);
  if (!sourceId || !members || !["rest", "skill_upgrade"].includes(choiceId)) return false;
  if (choiceId === "skill_upgrade" && members.some(({ characterId, options }) =>
    options[1].enabled && skillChoices[characterId] !== "__skip_new_skill__" &&
      !options[1].skills.some((entry) => entry.skillId === skillChoices[characterId]))) return false;
  if (choiceId === "skill_upgrade" && members.some(({ characterId, options }) =>
    options[1].enabled && skillChoices[characterId] === "__skip_new_skill__" &&
      !canDeclineNewSkill(campaign.partyStates[characterId]))) return false;
  const results = [];
  for (const { characterId, options } of members) {
    const state = campaign.partyStates[characterId];
    if (choiceId === "skill_upgrade" && !options[1].enabled) continue;
    const result = resolveCampfire(state, sourceId, choiceId, skillChoices[characterId] ?? null);
    if (!result) return false;
    results.push({ characterId, result });
  }
  campaign.eventResolved = true;
  campaign.activeNode.resolutionResult = { choiceId, results };
  campaign.resolvedEvents.push({ id: sourceId, title: "篝火", result: campaign.activeNode.resolutionResult });
  return campaign.activeNode.resolutionResult;
}

export function startCampaignEventBattle(campaign) {
  if (!campaign || campaign.status !== "event" || campaign.eventResolved || campaign.activeEventType !== "adventure" || !campaign.pendingEvent?.containsBattle || !campaign.activeNode) return false;
  const started = startAdventureBattle(campaign.runCharacterState, campaign.activeNode.id);
  if (!started) return false;
  campaign.eventBattleSourceId = campaign.activeNode.id;
  campaign.activeNode.resolution = started.battleType;
  campaign.currentBattle = campaign.pendingEvent.eventId === "giant_encirclement"
    ? {
      number: campaign.completedBattles + 1, step: campaign.step, type: "event",
      title: "戴娜", location: "巨人包围之地", description: "击败戴娜和她召唤的巨人。",
      enemies: ["dina"], enemyNames: { dina: "戴娜" }, enemyGrowthExemptIds: ["dina"],
    }
    : campaign.pendingEvent.eventId === "kings_treasury"
      ? { number: campaign.completedBattles + 1, step: campaign.step, type: "event",
        title: "吉尔伽美什", location: "王之宝库", description: "击败吉尔伽美什。",
        enemies: ["gilgamesh"], enemyNames: { gilgamesh: "吉尔伽美什" }, enemyGrowthExemptIds: ["gilgamesh"] }
      : campaign.pendingEvent.eventId === "anteiku_2"
        ? { number: campaign.completedBattles + 1, step: campaign.step, type: "event",
          title: "铃屋什造", location: "封锁的安定区", description: "击败铃屋什造。",
          enemies: ["suzuya"], enemyNames: { suzuya: "铃屋什造" }, enemyGrowthExemptIds: ["suzuya"] }
      : campaign.pendingEvent.eventId === "anteiku_3"
        ? { number: campaign.completedBattles + 1, step: campaign.step, type: "event",
          title: "有马贵将", location: "安定区", description: "迎战白色死神。",
          enemies: ["arima"], enemyNames: { arima: "有马贵将" }, enemyGrowthExemptIds: ["arima"] }
      : campaign.pendingEvent.eventId === "giant_rock_2"
        ? { number: campaign.completedBattles + 1, step: campaign.step, type: "event",
          title: "六耳猕猴", location: "巨石之下", description: "击败模仿主角的六耳猕猴。",
          enemies: ["six_ear"], enemyNames: { six_ear: "六耳猕猴" }, enemyGrowthExemptIds: ["six_ear"] }
      : encounterFor(campaign, started.battleType, campaign.activeNode);
  campaign.currentBattle.id = `event:${campaign.activeNode.id}`;
  campaign.battleNumber = campaign.completedBattles + 1;
  campaign.consecutiveWithoutBattle = 0;
  campaign.status = "combat";
  campaign.combatLaunched = false;
  return { type: "battle", battle: campaign.currentBattle };
}

export function completeLocation(campaign) {
  if (!campaign || campaign.status !== "event" || !campaign.eventResolved) return null;
  campaign.consecutiveWithoutBattle += 1;
  completeActiveNode(campaign);
  return campaign.status;
}

function stageOffer(campaign, state, key) {
  const offerId = `stage-transition:${key}`;
  return createStatUpgradeChoices(state, offerId, campaign.random, 1);
}

export function getStageTransitionChoices(campaign) {
  if (campaign?.status !== "stage_transition") return null;
  const flow = campaign.stageTransition;
  const partner = campaign.partyStates?.[flow.partnerId];
  if (flow.phase === "stage2_skill") {
    const characterId = campaign.partyIds[flow.memberIndex];
    const state = campaign.partyStates[characterId];
    return { phase: flow.phase, characterId, skillIds: getSkillTrainingChoices(state), canDecline: canDeclineNewSkill(state) };
  }
  if (flow.phase === "stage2_stat") {
    const characterId = campaign.partyIds[flow.memberIndex];
    const state = campaign.partyStates[characterId];
    return { phase: flow.phase, characterId, remaining: 3 - flow.statIndex,
      offer: createStatUpgradeChoices(state, `stage2-clear:${characterId}:stat-${flow.statIndex}`, campaign.random, 1) };
  }
  switch (flow.phase) {
    case "hero_skill":
      return { phase: flow.phase, remaining: flow.skillRemaining, passiveId: campaign.runCharacterState.passiveSkillId };
    case "hero_active_skill":
      return { phase: flow.phase, remaining: flow.heroActiveSkillRemaining ?? 1,
        skillIds: getSkillTrainingChoices(campaign.runCharacterState), canDecline: canDeclineNewSkill(campaign.runCharacterState) };
    case "hero_stat":
      return { phase: flow.phase, remaining: flow.statRemaining,
        offer: stageOffer(campaign, campaign.runCharacterState, `hero-stat-${3 - flow.statRemaining}`) };
    case "recruit":
      if (!flow.candidateIds.length) {
        const pool = STARTING_CHARACTERS.map((character) => character.id).filter((id) => !campaign.partyIds.includes(id));
        const random = createSeededRandom(`recruit:${campaign.routeMap.seed}`);
        while (pool.length && flow.candidateIds.length < 2) flow.candidateIds.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
      }
      return { phase: flow.phase, candidateIds: [...flow.candidateIds] };
    case "partner_skill":
      return { phase: flow.phase, partnerId: flow.partnerId, skillIds: [...(partner?.activeSkillPool ?? [])] };
    case "partner_stat":
      return { phase: flow.phase, partnerId: flow.partnerId, remaining: flow.partnerStatRemaining,
        offer: stageOffer(campaign, partner, `partner-stat-${5 - flow.partnerStatRemaining}`) };
    case "partner_upgrade":
      return { phase: flow.phase, partnerId: flow.partnerId, remaining: flow.partnerSkillRemaining,
        skillIds: getUpgradeableSkills(partner) };
    default: return { phase: flow.phase };
  }
}

export function advanceStageTransition(campaign, choiceId = null) {
  if (campaign?.status !== "stage_transition" || !campaign.stageTransition) return false;
  const flow = campaign.stageTransition;
  const phase = flow.phase;
  const partner = campaign.partyStates?.[flow.partnerId];
  if (phase === "stage2_skill") {
    const characterId = campaign.partyIds[flow.memberIndex];
    const state = campaign.partyStates[characterId];
    const choices = getSkillTrainingChoices(state);
    if (choices.length) {
      if (choiceId === "__skip_new_skill__" && canDeclineNewSkill(state)) { /* intentionally declined */ }
      else if (!choices.includes(choiceId)) return false;
      else {
        const sourceId = `stage2-clear-skill:${characterId}`;
        const trained = getUpgradeableSkills(state).length ? upgradeActiveSkill(state, choiceId, sourceId)
          : learnActiveSkill(state, choiceId, sourceId);
        if (!trained) return false;
      }
    } else if (choiceId != null) return false;
    flow.memberIndex += 1;
    if (flow.memberIndex >= campaign.partyIds.length) { flow.phase = "stage2_stat"; flow.memberIndex = 0; }
    return { previousPhase: phase, phase: flow.phase };
  }
  if (phase === "stage2_stat") {
    const characterId = campaign.partyIds[flow.memberIndex];
    if (!applyStatUpgrade(campaign.partyStates[characterId], `stage2-clear:${characterId}:stat-${flow.statIndex}`, choiceId)) return false;
    flow.statIndex += 1;
    if (flow.statIndex >= 3) { flow.statIndex = 0; flow.memberIndex += 1; }
    if (flow.memberIndex >= campaign.partyIds.length) flow.phase = "stage2_interlude";
    campaign.playerHp = campaign.runCharacterState.currentHp;
    campaign.playerMaxHp = campaign.runCharacterState.maxHp;
    return { previousPhase: phase, phase: flow.phase };
  }
  if (phase === "hero_skill") {
    if ((campaign.runCharacterState.passiveLevel ?? 1) < 2 &&
      !upgradePassiveSkill(campaign.runCharacterState, `stage1-boss:${campaign.playerId}`)) return false;
    flow.skillRemaining -= 1;
    if (flow.skillRemaining <= 0) flow.phase = "hero_active_skill";
  } else if (phase === "hero_active_skill") {
    const state = campaign.runCharacterState;
    const choices = getSkillTrainingChoices(state);
    if (choices.length) {
      if (choiceId === "__skip_new_skill__" && canDeclineNewSkill(state)) {
        // The player may decline a new skill when the learned skill is maxed.
      } else if (!choices.includes(choiceId)) return false;
      else {
        const sourceId = `stage1-clear-active:${campaign.playerId}`;
        const upgraded = getUpgradeableSkills(state).length
          ? upgradeActiveSkill(state, choiceId, sourceId) : learnActiveSkill(state, choiceId, sourceId);
        if (!upgraded) return false;
      }
    } else if (choiceId != null) return false;
    flow.heroActiveSkillRemaining = (flow.heroActiveSkillRemaining ?? 1) - 1;
    if (flow.heroActiveSkillRemaining <= 0) flow.phase = "hero_stat";
  } else if (phase === "hero_stat" || phase === "partner_stat") {
    const isPartner = phase === "partner_stat";
    const state = isPartner ? partner : campaign.runCharacterState;
    const remaining = isPartner ? flow.partnerStatRemaining : flow.statRemaining;
    if (!applyStatUpgrade(state, `stage-transition:${isPartner ? "partner-stat-" + (5 - remaining) : "hero-stat-" + (3 - remaining)}`, choiceId)) return false;
    if (isPartner) {
      flow.partnerStatRemaining -= 1;
      if (flow.partnerStatRemaining <= 0) flow.phase = "partner_upgrade";
    } else {
      flow.statRemaining -= 1;
      if (flow.statRemaining <= 0) flow.phase = "recruit";
    }
  } else if (phase === "recruit") {
    const options = getStageTransitionChoices(campaign).candidateIds;
    if (!options.includes(choiceId) || campaign.partyIds.includes(choiceId)) return false;
    const template = STARTING_CHARACTERS.find((character) => character.id === choiceId);
    if (!template) return false;
    flow.partnerId = choiceId;
    campaign.partyIds.push(choiceId);
    campaign.partyStates[choiceId] = createRunCharacterState(template, null);
    flow.phase = "partner_skill";
  } else if (phase === "partner_skill") {
    if (!partner?.activeSkillPool.includes(choiceId) ||
      !learnActiveSkill(partner, choiceId, `stage2-partner:${flow.partnerId}`)) return false;
    flow.phase = "partner_stat";
  } else if (phase === "partner_upgrade") {
    const skills = getUpgradeableSkills(partner);
    if (skills.length && (!skills.includes(choiceId) ||
      !upgradeActiveSkill(partner, choiceId, `stage2-partner-upgrade-${1 - flow.partnerSkillRemaining}`))) return false;
    flow.partnerSkillRemaining -= 1;
    if (flow.partnerSkillRemaining <= 0) flow.phase = "interlude";
  } else return false;
  campaign.playerHp = campaign.runCharacterState.currentHp;
  campaign.playerMaxHp = campaign.runCharacterState.maxHp;
  return { previousPhase: phase, phase: flow.phase };
}

export function beginStageTwo(campaign) {
  if (campaign?.status !== "stage_transition" || campaign.stageTransition?.phase !== "interlude" ||
    campaign.partyIds.length !== 2) return false;
  restorePartyHealthForStage(campaign, 2);
  campaign.stageId = 2;
  campaign.stageStep = 1;
  campaign.routeMap = generateRouteMap(`stage2:${campaign.routeMap.seed}`, { stageId: 2 });
  campaign.activeNode = null;
  campaign.currentBattle = null;
  campaign.pendingEvent = null;
  campaign.eventBattleSourceId = null;
  campaign.consecutiveWithoutBattle = 0;
  generateRouteOptions(campaign);
  return campaign.status;
}

export function beginStageThree(campaign) {
  if (campaign?.status !== "stage_transition" || campaign.stageTransition?.phase !== "stage2_interlude" ||
      campaign.stageId !== 2 || campaign.partyIds.length !== 2) return false;
  restorePartyHealthForStage(campaign, 3);
  campaign.stageId = 3;
  campaign.chapter3Entered = true;
  campaign.stageStep = 1;
  campaign.routeMap = generateRouteMap(`stage3:${campaign.routeMap.seed}`, { stageId: 3 });
  // Guarantee a trial event at the stage entrance while preserving the normal route.
  const start = campaign.routeMap.nodes.find((node) => node.id === campaign.routeMap.startNodeId);
  const firstRooms = start?.nextNodeIds.map((id) => campaign.routeMap.nodes.find((node) => node.id === id)).filter(Boolean) ?? [];
  if (!firstRooms.some((node) => node.type === "question") && firstRooms.length) firstRooms[0].type = "question";
  campaign.activeNode = null;
  campaign.currentBattle = null;
  campaign.pendingEvent = null;
  campaign.eventBattleSourceId = null;
  campaign.consecutiveWithoutBattle = 0;
  generateRouteOptions(campaign);
  return campaign.status;
}

export function restorePartyHealthForStage(campaign, nextStageId) {
  if (!campaign || !Number.isInteger(nextStageId) || nextStageId <= campaign.stageId ||
    campaign.lastFullHealStageId === nextStageId) return false;
  for (const characterId of campaign.partyIds ?? []) {
    const state = campaign.partyStates?.[characterId];
    if (state) state.currentHp = state.maxHp;
  }
  campaign.playerHp = campaign.partyStates?.[campaign.playerId]?.currentHp ?? campaign.playerHp;
  campaign.playerMaxHp = campaign.partyStates?.[campaign.playerId]?.maxHp ?? campaign.playerMaxHp;
  campaign.lastFullHealStageId = nextStageId;
  return true;
}

export function resolveTrialOffer(campaign, choiceId) {
  if (campaign?.stageId !== 3 || campaign.status !== "event" || campaign.pendingEvent?.eventId !== "trial_land" ||
      campaign.eventResolved || !["trial_accept", "trial_decline"].includes(choiceId)) return false;
  const accepted = choiceId === "trial_accept";
  campaign.trialOffered = true;
  campaign.trialAccepted = accepted;
  campaign.trialDeclined = !accepted;
  campaign.pendingEvent.status = "completed";
  campaign.pendingEvent.data.choiceId = choiceId;
  campaign.activeNode.resolutionResult = { choiceId };
  campaign.eventResolved = true;
  completeActiveNode(campaign);
  if (accepted) {
    campaign.trial = createTrialState(campaign.random);
    campaign.trial.entryHp = Object.fromEntries(campaign.partyIds.map((id) => [id, campaign.partyStates[id].currentHp]));
    campaign.status = "trial_intro";
  }
  return { accepted, status: campaign.status };
}

export function enterTrialMap(campaign) {
  if (campaign?.status !== "trial_intro" || campaign.trial?.status !== "active") return false;
  campaign.status = "trial_route";
  return true;
}

function beginTrialBattle(campaign, taskId) {
  const trial = campaign.trial;
  if (trial?.status !== "active" || trial.currentTask !== taskId || campaign.trialBattle) return false;
  let enemies;
  if (taskId === "strength") enemies = ["heracles"];
  else if (taskId === "wisdom") enemies = ["odin"];
  else {
    const front = pickTrialEnemies(["jogo", "hidan", "scorpion_lailai"], 1, trial.priorBattleEnemies, campaign.random);
    const back = pickTrialEnemies(["esdeath", "zhang_jiao", "nami"], 1, trial.priorBattleEnemies, campaign.random);
    enemies = [...front, ...back];
    trial.currentBattleEnemies = [...enemies];
    trial.priorBattleEnemies = [...enemies];
  }
  const title = enemies.map((id) => TRIAL_ENEMY_DATA[id]?.name ?? EVENT_ENEMY_DATA[id]?.name ?? id).join(" + ");
  const number = campaign.completedBattles + 1;
  campaign.trialBattle = { taskId, battleIndex: taskId === "will" ? trial.battleIndex + 1 : 1, id: `trial:${trial.index}:${taskId}:${trial.battleIndex + 1}` };
  campaign.currentBattle = { id: campaign.trialBattle.id, number, step: campaign.step,
    type: taskId === "will" ? "event" : "elite", title, location: "试炼之地", description: "完成诸神试炼。",
    enemies, enemyNames: Object.fromEntries(enemies.map((id) => [id, TRIAL_ENEMY_DATA[id]?.name ?? EVENT_ENEMY_DATA[id]?.name ?? id])),
    enemyGrowthExemptIds: [...enemies] };
  campaign.battleNumber = number;
  campaign.status = "combat";
  campaign.combatLaunched = false;
  return { type: "battle", battle: campaign.currentBattle };
}

export function chooseTrialNode(campaign, selectedTaskId = null) {
  if (campaign?.status !== "trial_route" || campaign.trial?.status !== "active") return false;
  const taskId = startTrialTask(campaign.trial, selectedTaskId);
  if (!taskId) return false;
  if (taskId === "will") {
    campaign.status = "trial_event";
    return { type: "event", taskId };
  }
  return beginTrialBattle(campaign, taskId);
}

export function resolveTrialWill(campaign, choiceId) {
  if (campaign?.status !== "trial_event" || campaign.trial?.currentTask !== "will" ||
      !["will_accept", "will_leave"].includes(choiceId)) return false;
  if (choiceId === "will_leave") {
    const result = completeTrialTask(campaign.trial, "will", "declined");
    campaign.status = result.status === "active" ? "trial_route" : "trial_result";
    return { ...result, declined: true };
  }
  for (const id of campaign.partyIds) {
    const state = campaign.partyStates[id];
    if (state.divinePunishment?.battlesLeft > 0) continue;
    const reduction = Math.min(state.maxHp - 1, Math.floor(state.maxHp * TRIAL_RULES.divinePunishmentHpFraction));
    state.maxHp -= reduction;
    state.currentHp = Math.min(state.currentHp, state.maxHp);
    state.divinePunishment = { reduction, battlesLeft: TRIAL_RULES.divinePunishmentBattles };
  }
  campaign.trial.divinePunishmentBattlesLeft = TRIAL_RULES.divinePunishmentBattles;
  campaign.playerHp = campaign.runCharacterState.currentHp;
  campaign.playerMaxHp = campaign.runCharacterState.maxHp;
  return beginTrialBattle(campaign, "will");
}

function advanceDivinePunishment(campaign) {
  for (const id of campaign.partyIds) {
    const state = campaign.partyStates[id];
    const effect = state?.divinePunishment;
    if (!effect || effect.battlesLeft <= 0) continue;
    effect.battlesLeft -= 1;
    if (effect.battlesLeft === 0) {
      state.maxHp += effect.reduction;
      state.divinePunishment = null;
    }
  }
  campaign.trial.divinePunishmentBattlesLeft = campaign.runCharacterState.divinePunishment?.battlesLeft ?? 0;
}

function applyTrialFailurePenalty(campaign) {
  if (campaign.trialFailurePenaltyApplied) return false;
  for (const id of campaign.partyIds) {
    const state = campaign.partyStates[id];
    const divine = state.divinePunishment;
    const permanentMaxHp = state.maxHp + (divine?.reduction ?? 0);
    const penalizedMaxHp = Math.max(1, Math.floor(permanentMaxHp * (1 - TRIAL_RULES.failureMaxHpFraction)));
    if (divine?.battlesLeft > 0) {
      divine.reduction = Math.min(penalizedMaxHp - 1, Math.floor(penalizedMaxHp * TRIAL_RULES.divinePunishmentHpFraction));
    }
    state.maxHp = Math.max(1, penalizedMaxHp - (divine?.reduction ?? 0));
    state.spd = Math.max(0, Math.floor(state.spd * (1 - TRIAL_RULES.failureSpeedFraction)));
    state.currentHp = Math.max(0, Math.min(state.maxHp, campaign.trial.entryHp?.[id] ?? state.currentHp));
    state.trialFailurePenalty = { maxHpFraction: TRIAL_RULES.failureMaxHpFraction, speedFraction: TRIAL_RULES.failureSpeedFraction };
  }
  campaign.trialFailurePenaltyApplied = true;
  campaign.trial.failurePenaltyApplied = true;
  campaign.playerHp = campaign.runCharacterState.currentHp;
  campaign.playerMaxHp = campaign.runCharacterState.maxHp;
  return true;
}

export function settleTrialBattle(campaign, outcome) {
  if (campaign?.trial?.status !== "active" || !campaign.trialBattle || !["victory", "defeat"].includes(outcome)) return false;
  const { taskId } = campaign.trialBattle;
  campaign.trialBattle = null;
  campaign.currentBattle = null;
  if (outcome === "defeat") {
    failTrial(campaign.trial);
    applyTrialFailurePenalty(campaign);
    campaign.status = "trial_result";
    return { status: campaign.status, trialOutcome: "failed" };
  }
  campaign.completedBattles += 1;
  if (taskId === "will") {
    campaign.trial.battleIndex += 1;
    if (campaign.trial.battleIndex < TRIAL_RULES.divinePunishmentBattles) {
      return { status: "trial_next_battle", trialOutcome: "active", next: beginTrialBattle(campaign, "will") };
    }
  }
  const result = completeTrialTask(campaign.trial, taskId);
  if (result.status === "completed") {
    campaign.trialCompleted = true;
    campaign.evolutionPending = true;
    campaign.status = "trial_result";
  } else campaign.status = "trial_route";
  return { status: campaign.status, trialOutcome: result.status, completedCount: result.completedCount };
}

export function finishTrialResult(campaign) {
  if (campaign?.status !== "trial_result" || !["completed", "failed"].includes(campaign.trial?.status)) return false;
  if (campaign.trial.status === "completed") return evolveTrialParty(campaign);
  campaign.status = "route";
  return true;
}

export function restartCampaign(random = Math.random) { return createCampaign(random); }

export const CAMPAIGN_ROUTE_LENGTH = ROUTE_LENGTH;
