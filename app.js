import { ANIMATION_TIMING, CHARACTER_DATA, COMBAT_RULES, STAGE_TWO_NORMAL_PASSIVES, STAGE_THREE_NORMAL_PASSIVES, STARTING_CHARACTERS } from "./characters.js";
import { advanceEventEpilogue, advanceStageTransition, beginJourney, beginStageTwo, beginStageThree, buyShopItem, chooseEvolutionUpgrade, chooseRoute, chooseTrialNode, chooseStartingSkill, claimCampaignEliteDrop, claimCampaignReward, claimCampaignSpecialReward, claimCampaignQuinque, claimCampaignTreasure, claimStageTwoEliteSkill, claimStageTwoEliteSkip, claimStageTwoGiantRecipient, claimStageTwoStatReward, completeLocation, completeSettlement, createCampaign, enterTrialMap, finishBattle, finishTrialResult, getActiveCampfireOptions, getCampaignRewardOffer, getCampaignTreasureOffer, getRouteMap, getRouteOptions, getShopRouteOptions, getStageTransitionChoices, getStageTwoCampfireOptions, leaveShop, prepareBattle, previewShopItem, resolveCampaignEvent, resolveStageTwoCampfire, resolveTrialOffer, resolveTrialWill, selectStartingCharacter, startCampaign, startCampaignEventBattle, STAGE_TWO_STAT_UPGRADES } from "./campaign.js";
import { getCritChance, getDodgeChance, getSkillDodgeChance, initializeBattle, simulateBattle } from "./battle.js";
import { canDeclineNewSkill, getSeaBeyondOfferDetails, getSkillAtLevel, getSkillTrainingChoices, getTemporaryCombatModifiers, getTemporaryEffectDisplayRows, getTreasureCombatModifiers, getUnlearnedActiveSkills, previewGrowingDrop } from "./progression.js";
import { ATTRIBUTE_UPGRADES, ELITE_BONUS_REWARDS, GIANT_SPINAL_FLUID, GUN_DEVIL_FRAGMENT, SKILL_DATA, TREASURE_DATA } from "./skills.js";
import { orderRouteOptionsByPosition, shortestRemainingRouteLength, ROUTE_MAP_FINAL_STEP } from "./routeMap.js";
import { getAnimationFrameFootShift, getAnimationFrameVisualScale, getAnimationVisualOffset, getBorosBeamGeometry, getCharacterVisual, getGravityLiftPixels, shouldHideFallenUnit } from "./visualConfig.js";
import { battlePlaybackMultiplier, isAutoSpeedActive } from "./battlePlaybackSpeed.js";
import { createMusicController, musicTracks } from "./music.js";
import { createEntranceCompletion, ENEMY_ENTRANCE_DURATION_MS, getEnemyEntrance } from "./enemyEntrance.js";
import { TANG_SUMMON_WEIGHTS } from "./tangSummons.js";
import { TRIAL_TASKS } from "./trial.js";
import { refreshShopPrices } from "./shop.js";
import { evolvedBattlePresentation } from "./evolvedVisuals.js";
import { evolutionDisplayName } from "./evolution.js";

const $ = (selector) => document.querySelector(selector);
const log = $("#battle-log");
const logPanel = $(".log-panel");
const logToggle = $("#battle-log-toggle");
const statusLabel = $("#battle-status");
const speedButton = $("#speed-btn");
const restartRunButton = $("#restart-run-btn");
const characterDialog = $("#character-dialog");
let campaign = null;
function partyPresentation(id) {
  const base = STARTING_CHARACTERS.find((character) => character.id === id);
  if (!base) return null;
  const evolution = campaign?.partyStates?.[id]?.evolution;
  return evolution?.phase === 2
    ? { ...base, ...evolvedBattlePresentation(id), name: evolutionDisplayName(id, evolution) }
    : base;
}
let lastPreparedBattle = null;
let restoredBattle = null;
// The local-only test page uses the same game UI and rules with a separate save.
// A public Pages hostname cannot enable this branch through a query string.
const localStageTwoTest = (() => {
  try {
    return ["127.0.0.1", "localhost", "::1"].includes(window.location.hostname) &&
      new URLSearchParams(window.location.search).get("stage2-dev") === "1" &&
      window.sessionStorage.getItem("shanshuo-stage2-dev-session") === "1";
  } catch { return false; }
})();
const RUN_SAVE_KEY = localStageTwoTest ? "shanshuo-stage2-dev-run-v1" : "shanshuo-stage2-run-v1";
const SAVE_OWNER_KEY = `${RUN_SAVE_KEY}:owner`;
const saveOwnerId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
let viewState = initializeBattle([]);
let squadSide = "ally";
let playback = null;
let timer = null;
let effectTimer = null;
let generation = 0;
let fast = false;
let displayedEvents = 0;
function playbackRate() {
  return battlePlaybackMultiplier(displayedEvents, fast, ANIMATION_TIMING.attack.fastPlaybackMultiplier);
}
function playbackDelay(normalMs, manualFastMs = normalMs / ANIMATION_TIMING.attack.fastPlaybackMultiplier) {
  return Math.max(40, Math.round((fast ? manualFastMs : normalMs) / (isAutoSpeedActive(displayedEvents) ? 2 : 1)));
}
function cinematicTimeline(timeline, timeFields) {
  if (!timeline || !isAutoSpeedActive(displayedEvents)) return timeline;
  return { ...timeline, ...Object.fromEntries(timeFields.map((key) => [key, playbackDelay(timeline[key], timeline[key])])) };
}
function updateSpeedControl() {
  const automatic = isAutoSpeedActive(displayedEvents);
  speedButton.classList.toggle("is-active", fast || automatic);
  $("#speed-label").textContent = automatic ? `×${playbackRate()}` : fast ? "开" : "关";
  speedButton.title = automatic ? `战斗记录超过 100 条，当前 ${playbackRate()} 倍速` : "切换手动 2 倍速";
}
let pendingResult = null;
let eventResultShown = false;
let playbackPaused = false;
let battleLogExpanded = false;
let pausedContinuation = null;
let selectedCandidateId = null;
let selectedDecisionId = null;
let decisionHandler = null;
let decisionBusy = false;
let decisionRevision = 0;
let introTimer = null;
let entryTimer = null;
let entryAnimationToken = 0;
let attackTimer = null;
let animationStageTimer = null;
let birdProjectileTimer = null;
const borosVisualTimers = new Set();
let lastBorosVisualCastId = null;
let lastGilgameshVisualCastId = null;
const spriteFrameTimers = new Map();
const spriteFrameLayers = new WeakMap();
const summonFramePreloads = new Map();
const summonPortalTimers = new Set();
const passiveVisualPreloads = new Map();
let targetHitTimer = null;
let entranceTimer = null;
let entrancePreloadTimer = null;
let entranceImages = [];
let entranceOverlay = null;
let entranceCompletion = null;
let battleStartPhase = "idle";
let battleStartedToken = -1;
let openingSeenThisPage = false;
let detailCharacterId = null;
let selectedStatusId = null;
let battleStatusState = { jinchuriki: null, c0: null, borosPhase: null, bombs: [], armoredShield: null, tojiExhausted: false, currentRound: 0 };
let selectedDecisionIds = [];
let decisionSelection = { multiple: false, required: 1 };
const OPENING_SESSION_KEY = "pixel-battle-opening-seen";
// Keep one decoded image alive across the first-stage ending and the stage-two
// map/battle screens. The CSS URL resolves to the same resource and reuses cache.
let stageTwoBackgroundImage = null;
let stageTwoBackgroundPreload = null;
function preloadStageTwoBackground() {
  if (stageTwoBackgroundPreload) return stageTwoBackgroundPreload;
  stageTwoBackgroundImage = new Image();
  stageTwoBackgroundImage.decoding = "async";
  stageTwoBackgroundPreload = new Promise((resolve) => {
    stageTwoBackgroundImage.onload = async () => {
      try { await stageTwoBackgroundImage.decode?.(); } catch { /* CSS can still display the loaded image. */ }
      resolve(true);
    };
    stageTwoBackgroundImage.onerror = () => resolve(false);
    stageTwoBackgroundImage.src = new URL("./assets/stage2-golden-tree.png", import.meta.url).href;
  });
  return stageTwoBackgroundPreload;
}

function decisionChoice(id, title, description, disabled = false, image = null) {
  return { id, title, description, disabled, image };
}

function renderDecisionScreen(title, description, choices, confirmText, onConfirm, kicker = "ACT 01 · GROWTH", image = null, selection = {}) {
  decisionRevision += 1;
  decisionBusy = false;
  selectedDecisionId = null;
  selectedDecisionIds = [];
  decisionSelection = { multiple: Boolean(selection.multiple), required: Math.max(1, Math.floor(selection.required ?? 1)),
    autoConfirm: Boolean(selection.autoConfirm), autoConfirmChoiceIds: selection.autoConfirmChoiceIds ?? [] };
  $("#decision-screen").classList.toggle("is-dark-epilogue", Boolean(selection.darkScene));
  decisionHandler = onConfirm;
  $("#decision-kicker").textContent = kicker;
  $("#decision-title").textContent = title;
  $("#decision-copy").textContent = description;
  const eventImage = $("#decision-event-image");
  eventImage.hidden = !image;
  eventImage.src = image ?? "";
  eventImage.alt = image ? title : "";
  $("#decision-step").textContent = campaign?.status === "reward" ? `第 ${campaign.step} 步结算` : `第 ${campaign?.step || 0} 步`;
  const list = $("#decision-options");
  list.classList.toggle("reward-portrait-cards", Boolean(selection.portraitCards));
  list.replaceChildren();
  const revision = decisionRevision;
  for (const choice of choices) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "decision-choice";
    button.dataset.choiceId = choice.id;
    button.disabled = Boolean(choice.disabled);
    button.setAttribute("aria-pressed", "false");
    const name = document.createElement("b");
    name.textContent = choice.title;
    const detail = document.createElement("span");
    detail.textContent = choice.description ?? "";
    if (choice.image) {
      const icon = document.createElement("img");
      icon.className = "decision-choice-image";
      icon.src = choice.image;
      icon.alt = "";
      button.append(icon);
    }
    button.append(name, detail);
    button.addEventListener("click", () => {
      if (decisionBusy || revision !== decisionRevision || button.disabled) return;
      if (decisionSelection.multiple) {
        selectedDecisionIds = selectedDecisionIds.includes(choice.id)
          ? selectedDecisionIds.filter((id) => id !== choice.id)
          : [...selectedDecisionIds, choice.id];
        list.querySelectorAll(".decision-choice").forEach((candidate) => {
          const selected = selectedDecisionIds.includes(candidate.dataset.choiceId);
          candidate.classList.toggle("selected", selected);
          candidate.setAttribute("aria-pressed", String(selected));
        });
        $("#decision-confirm").disabled = selectedDecisionIds.length !== decisionSelection.required;
        if (decisionSelection.autoConfirm && selectedDecisionIds.length === decisionSelection.required) confirmDecision();
        return;
      }
      selectedDecisionId = choice.id;
      list.querySelectorAll(".decision-choice").forEach((candidate) => {
        candidate.classList.toggle("selected", candidate === button);
        candidate.setAttribute("aria-pressed", String(candidate === button));
      });
      $("#decision-confirm").disabled = false;
      if (decisionSelection.autoConfirm || decisionSelection.autoConfirmChoiceIds.includes(choice.id)) confirmDecision();
    });
    list.append(button);
  }
  const confirm = $("#decision-confirm");
  confirm.textContent = confirmText;
  confirm.disabled = true;
  confirm.hidden = decisionSelection.autoConfirm;
  setScreen("decision-screen");
}

function confirmDecision() {
  const hasSelection = decisionSelection.multiple
    ? selectedDecisionIds.length === decisionSelection.required
    : selectedDecisionId !== null;
  if (decisionBusy || !hasSelection || typeof decisionHandler !== "function") return;
  decisionBusy = true;
  const revision = decisionRevision;
  const choiceId = decisionSelection.multiple ? [...selectedDecisionIds] : selectedDecisionId;
  let ok;
  try {
    ok = decisionHandler(choiceId);
  } catch (error) {
    console.error("选项结算失败", error);
    decisionBusy = false;
    if (campaign?.status === "event" && campaign.pendingEvent?.eventId === "kings_treasury") {
      try {
        renderCampaignEvent();
        $("#decision-copy").textContent += " 操作未完成，请重试。";
        return;
      } catch (renderError) { console.error("王之宝库界面恢复失败", renderError); }
    }
    $("#decision-confirm").disabled = false;
    $("#decision-copy").textContent = `${$("#decision-copy").textContent} 操作未完成，请重试。`;
    return;
  }
  if (ok === false && revision === decisionRevision) {
    decisionBusy = false;
    $("#decision-confirm").disabled = false;
  } else if (revision === decisionRevision) {
    decisionBusy = false;
    decisionHandler = null;
  }
}

function displaySkillEffect(skill, context = {}) {
  const chance = Number.isFinite(skill?.chance) ? `触发率 ${Math.round(skill.chance * 100)}%` : "自动生效";
  if (skill?.id === "kaneki-predator") return `${chance} · (ATK + SPD) × ${skill.multiplier ?? 1} · 目标 HP 严格低于 ${Math.round(skill.guaranteedCritBelowHpRatio * 100)}% 时命中必定暴击`;
  if (["kaneki-1000-7", "kaneki-2000-14"].includes(skill?.id)) return `每受到 ${skill.hitsPerTrigger} 次有效伤害：本场 ATK +${skill.attackBonus ?? 0}；每攻击 ${skill.attacksPerTrigger} 次暴击伤害 +${Math.round(skill.critDamagePerAttack * 100)}%${skill.counterDamageEvery ? `；每累计受击 ${skill.counterDamageEvery} 次追加反击` : ""}`;
  if (skill?.id === "eren-free-will") return `${chance} · (当前 ATK + 当前 DEF)×${skill.multiplier} 伤害 · DEF +${skill.defenseBonus ?? 0}（本场最多 ${skill.maxDefenseStacks} 层） · 每触发 ${skill.healEveryTriggers} 次恢复最大 HP 的 ${Math.round(skill.healMaxHpFraction * 100)}%${skill.extraTrueDamageEvery ? ` · 每第 ${skill.extraTrueDamageEvery} 次释放追加当前 DEF×${skill.extraTrueDamageDefRatio} 真实伤害` : ""}`;
  if (skill?.id === "eren-tatakae") return `${chance} · 当前 DEF×${skill.defenseScale}×${skill.multiplier ?? 1} 伤害 · 下回合嘲讽敌方单体攻击${skill.teamShield ? ` · 每名存活队友护盾刷新至最多 ${skill.teamShield} 点（不叠加）` : ""}`;
  if (skill?.id === "eren-2000-years") return "Lv.1 每场免疫首次受击；Lv.2 每场免疫前两次受击，并一次性增加最大 HP 400。";
  if (skill?.id === "journey-west") {
    const [horse, bajie, shaseng, wukong] = TANG_SUMMON_WEIGHTS[skill.level ?? 1];
    return `必定尝试召唤 · 白龙马 ${horse}% / 八戒 ${bajie}% / 沙僧 ${shaseng}% / 孙悟空 ${wukong}% · 召唤物技能触发率 ${Math.round((skill.summonSkillChance ?? (skill.level ?? 1) * 0.07) * 100)}%`;
  }
  if (skill?.id === "tang-flesh") return "替召唤物承担 10% 伤害（按唐僧 DEF 结算）；有存活召唤物时受到伤害减少 20%；Lv.2 召唤物按实际造成伤害的 20% 治疗唐僧。";
  if (skill?.id === "horse-hoof") return `${chance} · 以 ATK + SPD 造成 1 倍伤害`;
  if (skill?.id === "bajie-rake") return `${chance} · 以 ATK + 当前 HP 的 20% 造成 1 倍伤害`;
  if (skill?.id === "shaseng-staff") return `${chance} · 以 ATK + 当前 DEF 造成 1.5 倍伤害，攻击敌方全体`;
  if (skill?.id === "wukong-fate") return `${chance} · 成功释放时交替发动：首次蓄力，下回合受到的伤害减少 ${Math.round(skill.damageResistance * 100)}%，唐僧 DEF +${skill.summonerDefenseBonus}（持续 ${skill.summonerDefenseDurationRounds} 回合）；再次瞬移到目标面前，造成 ${skill.trueDamageBase} + 唐僧当前 ATK×${skill.summonerAttackRatio} 的真实伤害`;
  if (skill?.effectType === "buff") return `${chance} · 防御 +${skill.defenseBonus ?? 0}，持续 ${skill.durationTurns ?? 1} 回合`;
  if (skill?.id === "naruto-multi-clone") return `${chance} · 主目标 ${skill.multiplier}× ATK · 其他敌人 75% / 单目标追加 50% · 分身 +${skill.cloneGain}`;
  if (skill?.id === "shadow-clone-rush") return `影分身 ${skill.cloneCount ?? skill.level ?? 1} 个 · 伤害倍率 ${skill.multiplier ?? 1}× · ${chance}`;
  if (skill?.id === "rasengan" || skill?.multiplierFormula) {
    const formula = skill.multiplierFormula;
    if (formula) {
      const spd = Number.isFinite(context.spd) ? context.spd : (Number.isFinite(skill.currentSpeed) ? skill.currentSpeed : null);
      const multiplier = spd === null ? null : formula.base + spd * formula.coefficient;
      const coefficient = Number(formula.coefficient).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
      return `伤害倍率：1 + SPD × ${coefficient}${multiplier === null ? "" : ` · 当前 SPD ${spd} → ${multiplier.toFixed(2)}×`} · ${chance} · 施放击杀敌人，本局 SPD +5`;
    }
  }
  return `${chance} · 伤害倍率 ${skill?.multiplier ?? 1}×`;
}

function shortSkillEffect(skill) {
  if (skill?.passive || skill?.type === "passive") return "被动 · 满足条件时触发";
  const chance = Number.isFinite(skill?.chance) ? `${Math.round(skill.chance * 100)}% 触发` : "条件触发";
  if (skill?.id === "journey-west") return `${chance} · 召唤队友`;
  if (skill?.id === "wukong-fate") return `${chance} · 蓄力减伤 / 真实伤害`;
  if (skill?.id === "gilgamesh-enuma-elish") return `${chance} · 四次循环：单体／全体／回血／真实伤害`;
  if (["kaneki-1000-7", "kaneki-2000-14"].includes(skill?.id)) return `受击 ${skill.hitsPerTrigger} 次 ATK +${skill.attackBonus}；攻击 ${skill.attacksPerTrigger} 次暴伤 +${Math.round(skill.critDamagePerAttack * 100)}%`;
  if (skill?.id === "eren-free-will") return `${chance} · 攻击并叠加防御`;
  if (skill?.id === "naruto-multi-clone") return `${chance} · 主目标 ${skill.multiplier}×，群体 75%，单体追加 50%，分身 +${skill.cloneGain}`;
  if (skill?.id === "shadow-clone-rush") return `${chance} · ${skill.cloneCount} 个分身攻击`;
  if (skill?.id === "rasengan") return `${chance} · 伤害受 SPD 加成`;
  if (skill?.attackFormula === "atk_plus_spd") return `${chance} · 伤害来自 ATK + SPD`;
  if (skill?.trueDamage || skill?.trueDamageRatio) return `${chance} · 真实伤害`;
  if (skill?.effectType === "rewind") return `${chance} · 生命回溯与炸弹引爆`;
  if (skill?.effectType === "next-round-reduction") return `${chance} · 下回合减伤`;
  if (skill?.effectType === "damage") return `${chance} · ${skill.multiplier ?? 1}× ATK 伤害`;
  return `${chance} · ${skill?.description ?? "技能效果"}`;
}

let detailSkillEntries = [];
let detailProfileMarkup = "";
function installSkillDetails(skills) {
  detailSkillEntries = skills.filter(Boolean);
  if (!detailSkillEntries.length) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "skill-detail-link";
  button.dataset.showSkillDetails = "true";
  button.textContent = "查看技能详情";
  $("#character-detail").append(button);
}

function renderSkillDetailView(skillIndex = 0, level = null) {
  const skill = detailSkillEntries[skillIndex];
  if (!skill) return;
  const config = SKILL_DATA[skill.id] ?? skill;
  const levels = Object.keys(config.levels ?? { [skill.level ?? 1]: skill }).map(Number).sort((a, b) => a - b);
  const selectedLevel = levels.includes(level) ? level : (skill.level ?? levels[0]);
  const effect = { ...config, ...(config.levels?.[selectedLevel] ?? skill), level: selectedLevel };
  const root = $("#character-detail");
  root.replaceChildren();
  const back = document.createElement("button");
  back.type = "button"; back.className = "skill-detail-link"; back.dataset.skillBack = "true"; back.textContent = "← 返回人物属性";
  const heading = document.createElement("h3"); heading.textContent = `${skill.name} · Lv.${selectedLevel}`;
  const nav = document.createElement("div"); nav.className = "skill-detail-nav";
  detailSkillEntries.forEach((entry, index) => {
    const button = document.createElement("button"); button.type = "button";
    button.dataset.skillIndex = String(index); button.textContent = entry.name;
    if (index === skillIndex) button.classList.add("is-active");
    nav.append(button);
  });
  const levelNav = document.createElement("div"); levelNav.className = "skill-detail-nav";
  levels.forEach((number) => {
    const button = document.createElement("button"); button.type = "button";
    button.dataset.skillLevel = String(number); button.dataset.skillIndex = String(skillIndex);
    button.textContent = `Lv.${number}`;
    if (number === selectedLevel) button.classList.add("is-active");
    levelNav.append(button);
  });
  const body = document.createElement("section"); body.className = "detail-skill";
  const add = (label, value, parent = body) => { const row = document.createElement("p"); row.textContent = `${label}：${value}`; parent.append(row); };
  const passive = config.type === "passive" || config.passive;
  add("释放概率", passive ? "被动／条件触发" : Number.isFinite(effect.chance) ? `${Math.round(effect.chance * 100)}%` : "持续生效");
  // The introduction describes the skill once; level-specific values belong below.
  const generalDescriptions = {
    jinchuriki: "生命值低于半血时获得攻击强化，进阶可吸血。",
    "eren-2000-years": "每场战斗开始时获得伤害免疫，进阶可提高生命上限。",
  };
  const introduction = (generalDescriptions[config.id] ?? config.description ?? skill.description ?? "按技能条件生效")
    .split(/(?:[；。，]\s*)?Lv\.\d+/)[0].replace(/[；。，\s]+$/, "");
  add("技能描述", introduction || "随等级提升获得不同效果");
  const details = [];
  if (effect.attackFormula) details.push(`伤害来源 ${({ atk_plus_spd: "ATK + SPD", atk_plus_current_def: "ATK + 当前 DEF", atk_plus_scaled_def: `ATK + 当前 DEF×${effect.defenseScale}`, scaled_def: `当前 DEF×${effect.defenseScale}` })[effect.attackFormula] ?? effect.attackFormula}`);
  if (Number.isFinite(effect.multiplier)) details.push(`伤害 ${effect.multiplier}×`);
  if (Number.isFinite(effect.guaranteedCritBelowHpRatio)) details.push(`目标 HP 低于 ${Math.round(effect.guaranteedCritBelowHpRatio * 100)}% 时必暴击`);
  if (effect.killMaxHpBonus) details.push(`击杀后本局最大 HP +${effect.killMaxHpBonus}`);
  if (effect.defenseBonus) details.push(`DEF +${effect.defenseBonus}${effect.maxDefenseStacks ? `，最多 ${effect.maxDefenseStacks} 层` : ""}`);
  if (effect.healEveryTriggers) details.push(`每 ${effect.healEveryTriggers} 次释放恢复 ${Math.round(effect.healMaxHpFraction * 100)}% 最大 HP`);
  if (effect.healEveryCasts) details.push(`每 ${effect.healEveryCasts} 次释放恢复 ${Math.round(effect.healMaxHpRatio * 100)}% 最大 HP`);
  if (effect.splashRatio) details.push(["shadow-clone-rush", "naruto-multi-clone"].includes(skill?.id)
    ? `其他目标受到 ${Math.round(effect.splashRatio * 100)}% 附加伤害；仅一名敌人时该目标再受一次附加伤害`
    : `其余目标受到 ${Math.round(effect.splashRatio * 100)}% 附加伤害`);
  if (effect.cloneCount) details.push(`${effect.cloneCount} 个影分身`);
  if (effect.summonSkillChance) details.push(`召唤物技能概率 ${Math.round(effect.summonSkillChance * 100)}%`);
  if (config.id === "journey-west" && TANG_SUMMON_WEIGHTS[selectedLevel]) {
    const [horse, bajie, shaseng, wukong] = TANG_SUMMON_WEIGHTS[selectedLevel];
    details.push(`召唤分布：白龙马 ${horse}%／八戒 ${bajie}%／沙僧 ${shaseng}%／悟空 ${wukong}%`);
  }
  if (effect.hitsPerTrigger) details.push(`每受伤 ${effect.hitsPerTrigger} 次：暴击率 +${Math.round(effect.critRateBonus * 100)}%、ATK +${effect.attackBonus}${effect.dodgeRateBonus ? `、闪避率 +${Math.round(effect.dodgeRateBonus * 100)}%` : ""}`);
  if (effect.attacksPerTrigger) details.push(`每攻击 ${effect.attacksPerTrigger} 次：暴击伤害 +${Math.round(effect.critDamagePerAttack * 100)}%`);
  if (effect.counterDamageEvery) details.push(`每受伤 ${effect.counterDamageEvery} 次反击当前 ATK 伤害`);
  if (effect.healFromCalculatedDamage) details.push(`暴击吸血 ${Math.round(effect.healFromCalculatedDamage * 100)}%`);
  if (effect.immuneHits) details.push(`每场免疫前 ${effect.immuneHits} 次受到的伤害`);
  if (effect.damageReduction) details.push(`受到伤害减免 ${Math.round(effect.damageReduction * 100)}%`);
  if (effect.summonHealRatio) details.push(`召唤物伤害的 ${Math.round(effect.summonHealRatio * 100)}% 治疗唐僧`);
  if (config.id === "tang-flesh" && effect.reduction) details.push(`召唤物存活时减伤 ${Math.round(effect.reduction * 100)}%`);
  if (effect.currentHpRatioBelow && effect.attackBonus > 0 && effect.attackBonus < 1)
    details.push(`HP 低于 ${Math.round(effect.currentHpRatioBelow * 100)}% 时 ATK +${Math.round(effect.attackBonus * 100)}%`);
  if (effect.lifesteal) details.push(`吸血 ${Math.round(effect.lifesteal * 100)}%`);
  if (effect.critRateBonus && !effect.hitsPerTrigger) details.push(`暴击率 +${Math.round(effect.critRateBonus * 100)}%`);
  if (effect.critDamageBonus) details.push(`暴击伤害 +${Math.round(effect.critDamageBonus * 100)}%`);
  if (effect.trueDamage) details.push(`真实伤害 ${effect.trueDamage}`);
  if (effect.reduction) details.push(`下回合减伤 ${Math.round(effect.reduction * 100)}%`);
  if (effect.extraTrueDamageEvery) details.push(`每第 ${effect.extraTrueDamageEvery} 次释放追加真实伤害`);
  if (effect.defenseReduction) details.push(`命中后目标 DEF -${effect.defenseReduction}`);
  if (effect.ignoreDefenseFromOwnDef) details.push(`无视自身 DEF 的 ${Math.round(effect.ignoreDefenseFromOwnDef * 100)}%`);
  if (effect.reflectMultiplier) details.push(`反伤 当前 DEF ×${effect.reflectMultiplier}，持续 2 回合`);
  if (effect.taunt) details.push("接下来两回合嘲讽敌人");
  if (effect.cloneGain) details.push(`每次成功释放获得 ${effect.cloneGain} 个影分身`);
  if (effect.burstEveryCasts) details.push(`每第 ${effect.burstEveryCasts} 次释放强化为超大玉螺旋丸`);
  if (effect.meditationRounds) details.push(`每打坐 ${effect.meditationRounds} 回合：敌方 ATK -${effect.enemyAttackStep}${effect.allyAttackStep ? `，己方 ATK +${effect.allyAttackStep}` : ""}，上限 ${effect.attackCap}${effect.teamShield ? "，提供全队护盾" : ""}`);
  if (effect.maxHpBonus) details.push(`最大 HP +${effect.maxHpBonus}`);
  if (effect.summonHpBonus) details.push(`召唤物 HP +${effect.summonHpBonus}`);
  if (effect.attackBonus >= 1) details.push(`ATK +${effect.attackBonus}`);
  if (config.castPhases) for (const [number, phase] of Object.entries(config.castPhases)) details.push(`第 ${number} 次：${phase.selfHeal ? `恢复 ${phase.selfHeal} HP` : phase.trueDamageRatio ? `目标最大 HP ×${Math.round(phase.trueDamageRatio * 100)}% 真实伤害` : `${phase.multiplier}×伤害${phase.ignoreDefenseFraction ? `，无视 ${Math.round(phase.ignoreDefenseFraction * 100)}% DEF` : ""}`}`);
  if (!details.length && effect.multiplierFormula) details.push(`伤害倍率 1 + SPD × ${effect.multiplierFormula.coefficient}`);
  if (!details.length && effect.effectType === "buff") details.push(`DEF +${effect.defenseBonus ?? 0}，持续 ${effect.durationTurns ?? 1} 回合`);
  if (!details.length && !passive) details.push("按技能描述生效");
  const levelBody = document.createElement("section"); levelBody.className = "detail-skill";
  add(`Lv.${selectedLevel} 效果`, details.join("；") || "按技能描述生效", levelBody);
  root.append(back, heading, nav, body);
  if (details.length || levels.length > 1) root.append(levelNav, levelBody);
}

function displayUpgrade(upgradeId) {
  const upgrade = ATTRIBUTE_UPGRADES.find((item) => item.id === upgradeId);
  return upgrade ? `${upgrade.name}：${upgrade.description}` : upgradeId;
}

function describeEventResult(result) {
  result = result?.result ?? result;
  if (!result) return "事件已完成。";
  if (Number.isFinite(result.essenceGain)) return `${result.hpLoss ? `主角当前 HP -${result.hpLoss}，剩余 ${result.currentHp}/${result.maxHp}；` : ""}${result.essenceGain ? `精华 +${result.essenceGain}，当前精华 ×${campaign.essence}。` : "你选择离开。"}`;
  if (result.gambleFinished) return `已完成 ${result.rounds.length} 轮，成功 ${result.successCount} 次。${result.treasures?.length ? `额外获得：${result.treasures.map((item) => `${item.name}（${item.description}）`).join("、")}。` : "没有额外宝物。"}`;
  if (result.escape === "success") return `逃跑成功！本局速度 -10，当前 SPD ${result.currentSpd}。`;
  if (result.escape === "failed") return "逃跑失败！戴娜挡住了去路。确认后开始战斗。";
  if (result.weaponPenalty) return "主角和伙伴的最大 HP 与 ATK 均降低 30%，持续本局。";
  if (result.treasure) return `获得「${result.treasure}」，由${partyPresentation(result.recipientId)?.name ?? "指定队员"}领取；效果持续至本局结束。`;
  if (Number.isFinite(result.spdGain)) return `${partyPresentation(result.recipientId)?.name ?? "角色"}本局速度 +${result.spdGain}。`;
  if (Number.isFinite(result.maxHpGain)) return `最大生命值 +${result.maxHpGain}，当前生命值保持不变。`;
  if (result.gains?.length && !Number.isFinite(result.hpLoss)) return `${partyPresentation(result.recipientId)?.name ?? "角色"}本局额外获得：${result.gains.map(({ stat, amount }) => `${({ atk: "攻击", def: "防御", spd: "速度" })[stat]} +${amount}`).join("、")}，本次未扣除生命值。`;
  if (result.blessing === "player_damage_increased") return "厄运降临：接下来两场战斗中，你受到的伤害为 1.5 倍。";
  if (result.blessing === "enemy_damage_doubled") return "力量降临：接下来两场战斗中，敌人受到的伤害翻倍。";
  if (result.effect?.stat || result.healFraction) return `${result.restored ? `立即恢复 ${result.restored} HP；` : ""}${result.effect?.stat ? `下一场战斗${result.effect.stat.toUpperCase()} ${result.effect.amount > 0 ? "+" : ""}${result.effect.amount}。` : ""}`;
  if (result.skipped) return result.exhausted ? "这条道路已无法再带来新力量，你选择离开。" : "你选择离开，没有发生其他变化。";
  if (result.stage && Number.isFinite(result.critRateGain)) {
    if (result.stage === 3) return `暴击率 +${Math.round(result.critRateGain * 100)} 个百分点，当前暴击率 ${(result.critRate * 100).toFixed(1)}%。`;
    const attackText = result.stage === 2 ? `；攻击 +${result.attackGain}，当前 ATK ${result.atk}` : "";
    return `最大生命上限降至 ${result.maxHp}，当前 HP ${result.currentHp}${attackText}。`;
  }
  if (Number.isFinite(result.hpLoss)) {
    const gains = result.gains?.map(gain => `${({atk:"攻击",def:"防御",spd:"速度"})[gain.stat]} +${gain.amount}`).join("、")
      ?? `${({atk:"攻击",def:"防御",spd:"速度"})[result.stat]} +${result.amount}`;
    const loss = Number.isFinite(result.hpLossPercent) ? `-${result.hpLossPercent}%（${result.hpLoss}）` : `-${result.hpLoss}`;
    return `${partyPresentation(result.recipientId)?.name ?? "角色"}最大生命上限 ${loss}；获得${gains}。当前 HP ${result.currentHp}/${result.maxHp}。`;
  }
  if (result.blessing === "player_damage_increased") return "厄运降临：接下来两场战斗中，你受到的伤害为 1.5 倍。";
  if (result.blessing === "enemy_damage_doubled") return "力量降临：接下来两场战斗中，敌人受到的伤害翻倍。";
  if (result.deferred) return "命运回档暂未启用，本次安全离开。";
  if (result.guaranteeArmed) return `下一场战斗中，${result.skillCount > 1 ? "随机一个已学习技能" : "已学习技能"}的触发率提升至 100%；该效果在战斗后清除。`;
  if (result.noEligibleSkills) return "当前没有已学习且可在战斗中触发的技能，奇遇正常结束，没有生成临时效果。";
  if (Number.isFinite(result.restored)) return `恢复 ${result.restored} 点生命，当前 ${result.currentHp}/${result.maxHp}。`;
  if (Number.isFinite(result.hpCost)) return `支付 ${result.hpCost} 点生命，获得${displayUpgrade(result.stat?.id)}；当前生命 ${result.currentHp}。`;
  if (result.stat) return `获得${displayUpgrade(result.stat.id)}。`;
  if (result.skill?.name) return `技能「${result.skill.name}」提升至 Lv.${result.skill.level}。`;
  if (result.name && result.level) return `学会技能「${result.name}」Lv.${result.level}。`;
  if (result.variant === "heal" || result.heal) return `恢复生命至 ${campaign.playerHp}/${campaign.playerMaxHp}。`;
  return "事件效果已生效。";
}

function applyAnimationTiming() {
  const root = document.documentElement;
  root.style.setProperty("--opening-reveal-duration", `${ANIMATION_TIMING.opening.cityRevealMs}ms`);
  root.style.setProperty("--opening-warning-blink-duration", `${ANIMATION_TIMING.opening.warningBlinkMs}ms`);
  root.style.setProperty("--opening-red-duration", `${ANIMATION_TIMING.opening.skyRedMs}ms`);
  root.style.setProperty("--entry-drop-duration", `${ANIMATION_TIMING.entryDropMs}ms`);
  root.style.setProperty("--entry-dust-delay", `${ANIMATION_TIMING.entryDustDelayMs}ms`);
  root.style.setProperty("--attack-event-gap", `${ANIMATION_TIMING.attack.eventGapMs}ms`);
}

function applySpriteFrame(node, character, animationName, frameName) {
  const animation = character?.animations?.[animationName];
  if (!node) return false;
  const frame = animation?.frames?.[frameName];
  if (animation?.type === "frames") {
    if (typeof frame !== "string") return false;
    let layers = spriteFrameLayers.get(node);
    if (!layers) {
      layers = new Map();
      spriteFrameLayers.set(node, layers);
    }
    let frameImage = layers.get(frame);
    if (!frameImage) {
      frameImage = document.createElement("img");
      frameImage.className = "sprite-action-frame";
      frameImage.alt = "";
      frameImage.draggable = false;
      frameImage.src = frame;
      node.append(frameImage);
      layers.set(frame, frameImage);
    }
    frameImage.dataset.frameName = frameName;
    node.dataset.requestedFrame = frame;
    const reveal = () => {
      if (node.dataset.requestedFrame !== frame || !frameImage.isConnected) return;
      for (const layer of layers.values()) layer.classList.toggle("is-current", layer === frameImage);
      node.dataset.framePending = "false";
      node.classList.add("active");
      node.closest(".fighter")?.classList.add("has-action-sprite");
    };
    if (frameImage.complete && frameImage.naturalWidth > 0) reveal();
    else if (!frameImage.complete) node.dataset.framePending = "true";
    else node.dataset.framePending = "false";
    if ((!frameImage.complete || frameImage.naturalWidth === 0) && !frameImage.dataset.frameHandlers) {
      frameImage.dataset.frameHandlers = "1";
      frameImage.addEventListener("load", reveal);
      frameImage.addEventListener("error", () => {
        frameImage.remove(); layers.delete(frame);
        const hasLoadedFrame = [...layers.values()].some(image => image.complete && image.naturalWidth > 0 && image.classList.contains("is-current"));
        if (!hasLoadedFrame) { node.dataset.framePending = "false"; node.classList.remove("active"); node.closest(".fighter")?.classList.remove("has-action-sprite"); }
      }, { once: true });
    }
    if (!frameImage.complete || frameImage.naturalWidth === 0) return true;
    return true;
  }
  if (animation?.type !== "spritesheet") return false;
  if (!Number.isInteger(frame)) return false;
  const columns = animation.columns ?? 1;
  const rows = animation.rows ?? 1;
  const column = frame % columns;
  const row = Math.floor(frame / columns);
  const x = columns > 1 ? (column / (columns - 1)) * 100 : 0;
  const y = rows > 1 ? (row / (rows - 1)) * 100 : 0;
  node.style.backgroundImage = `url("${animation.asset}")`;
  node.style.backgroundSize = `${columns * 100}% ${rows * 100}%`;
  node.style.backgroundPosition = `${x}% ${y}%`;
  node.classList.add("active");
  return true;
}

function showFighterFrame(fighter, character, animationName, frameName) {
  const node = fighter?.querySelector(".sprite-action");
  if (!applySpriteFrame(node, character, animationName, frameName)) return false;
  const offset = getAnimationVisualOffset(character, animationName);
  const visualLayer = fighter.querySelector(".sprite-visual");
  visualLayer?.style.setProperty("--visual-action-offset-x", `${offset.offsetX ?? 0}px`);
  visualLayer?.style.setProperty("--visual-action-offset-y", `${offset.offsetY ?? 0}px`);
  node.style.setProperty("--action-frame-scale", getAnimationFrameVisualScale(character, animationName, frameName));
  node.style.setProperty("--action-frame-foot-shift", `${fighter.closest(".battle-screen.stage-two") || ["tang-shaseng", "bomb-demon", "shin", "noi"].includes(character.visualId ?? character.id) ? getAnimationFrameFootShift(character, animationName, frameName) : 0}px`);
  const hasLoadedCurrent = [...(spriteFrameLayers.get(node)?.values() ?? [])].some(image => image.complete && image.naturalWidth > 0 && image.classList.contains("is-current"));
  if (hasLoadedCurrent || node?.dataset.framePending !== "true") fighter.classList.add("has-action-sprite");
  return true;
}

function applyFighterVisual(fighter, character) {
  const visual = getCharacterVisual(character);
  let layer = fighter.querySelector(".sprite-visual");
  if (!layer) {
    const sprite = fighter.querySelector(".sprite");
    const action = fighter.querySelector(".sprite-action");
    if (!sprite || !action) return;
    layer = document.createElement("span");
    layer.className = "sprite-visual";
    sprite.before(layer);
    layer.append(sprite, action);
  }
  layer.style.setProperty("--visual-scale", visual.scale);
  layer.style.setProperty("--visual-offset-x", `${visual.offsetX}px`);
  layer.style.setProperty("--visual-offset-y", `${visual.offsetY}px`);
  layer.style.setProperty("--visual-stage-foot-offset-y", `${fighter.closest(".battle-screen.stage-two") ? visual.stageTwoFootOffsetY ?? 0 : 0}px`);
  layer.style.setProperty("--visual-frame-width", `${visual.frameWidth}px`);
  layer.style.setProperty("--visual-frame-height", `${visual.frameHeight}px`);
  layer.style.setProperty("--visual-action-offset-x", "0px");
  layer.style.setProperty("--visual-action-offset-y", "0px");
}

function positionMeleeImpact(burst, attackerEl, targetEl) {
  const attackerSprite = attackerEl?.querySelector(".sprite-wrap");
  const targetSprite = targetEl?.querySelector(".sprite-wrap");
  if (!burst || !attackerSprite || !targetSprite) return false;
  const attackerRect = attackerSprite.getBoundingClientRect();
  const targetRect = targetSprite.getBoundingClientRect();
  const fromRight = attackerRect.left + attackerRect.width / 2 > targetRect.left + targetRect.width / 2;
  const contactX = fromRight
    ? targetRect.left + targetRect.width * 0.68
    : targetRect.left + targetRect.width * 0.32;
  const contactY = targetRect.top + targetRect.height * 0.62;
  burst.style.left = `${contactX - targetRect.left}px`;
  burst.style.top = `${contactY - targetRect.top}px`;
  return fromRight;
}

function launchDeidaraBirdProjectile(attackerEl, targetEl, durationMs) {
  const arena = document.querySelector(".arena");
  const attackerSprite = attackerEl?.querySelector(".sprite-wrap");
  const targetSprite = targetEl?.querySelector(".sprite-wrap");
  if (!arena || !attackerSprite || !targetSprite) return null;
  const arenaRect = arena.getBoundingClientRect();
  const attackerRect = attackerSprite.getBoundingClientRect();
  const targetRect = targetSprite.getBoundingClientRect();
  const bird = document.createElement("span");
  const width = 32;
  const height = 30;
  const left = attackerRect.left - arenaRect.left + 3;
  const top = attackerRect.top - arenaRect.top + 37;
  const targetX = targetRect.left - arenaRect.left + targetRect.width * 0.68;
  const targetY = targetRect.top - arenaRect.top + targetRect.height * 0.56;
  bird.className = "deidara-bird-projectile";
  bird.setAttribute("aria-hidden", "true");
  bird.style.left = `${left}px`;
  bird.style.top = `${top}px`;
  bird.style.setProperty("--bird-flight-x", `${targetX - left - width}px`);
  bird.style.setProperty("--bird-flight-y", `${targetY - top - height / 2}px`);
  bird.style.setProperty("--bird-flight-duration", `${durationMs}ms`);
  bird.addEventListener("animationend", () => bird.remove(), { once: true });
  arena.append(bird);
  return bird;
}

function launchTrialProjectile(attackerEl, targetEl, asset, durationMs) {
  const arena = document.querySelector(".arena");
  const source = attackerEl?.querySelector(".sprite-visual")?.getBoundingClientRect();
  const target = targetEl?.querySelector(".sprite-visual")?.getBoundingClientRect();
  if (!arena || !source || !target || !asset) return null;
  const bounds = arena.getBoundingClientRect();
  const projectile = document.createElement("img");
  projectile.className = "trial-projectile";
  projectile.src = asset;
  projectile.alt = "";
  projectile.setAttribute("aria-hidden", "true");
  const startX = source.left + source.width * .25 - bounds.left;
  const startY = source.top + source.height * .3 - bounds.top;
  const endX = target.left + target.width * .5 - bounds.left;
  const endY = target.top + target.height * .45 - bounds.top;
  projectile.style.left = `${startX}px`;
  projectile.style.top = `${startY}px`;
  arena.append(projectile);
  projectile.animate([
    { translate: "0 0", opacity: 1 },
    { translate: `${endX - startX}px ${endY - startY}px`, opacity: 1 },
  ], { duration: durationMs, easing: "ease-in", fill: "forwards" }).onfinish = () => projectile.remove();
  return projectile;
}

function launchShinHammer(attackerEl, targetEl, asset, durationMs) {
  const arena = document.querySelector(".arena");
  const source = attackerEl?.querySelector(".sprite-visual")?.getBoundingClientRect();
  const target = targetEl?.querySelector(".sprite-visual")?.getBoundingClientRect();
  if (!arena || !source || !target || !asset) return null;
  const bounds = arena.getBoundingClientRect();
  const hammer = document.createElement("img");
  hammer.className = "shin-hammer-projectile";
  hammer.src = asset;
  hammer.alt = "";
  hammer.setAttribute("aria-hidden", "true");
  const width = Math.min(210, Math.max(150, window.innerWidth * .2));
  const height = width * 1024 / 1536;
  const startX = source.left + source.width * .4 - bounds.left;
  const startY = source.top + source.height * .38 - bounds.top;
  const endX = target.left + target.width * .5 - bounds.left;
  const endY = target.top + target.height * .55 - bounds.top;
  hammer.style.left = `${startX - width * .5}px`;
  hammer.style.top = `${startY - height * .5}px`;
  arena.append(hammer);
  const flight = hammer.animate([
    { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
    { transform: `translate(${(endX - startX) * .5}px, ${(endY - startY) * .5 - 24}px) rotate(540deg)`, opacity: 1 },
    { transform: `translate(${endX - startX}px, ${endY - startY}px) rotate(1080deg)`, opacity: 1 },
  ], { duration: durationMs, easing: "ease-in", fill: "forwards" });
  flight.onfinish = () => hammer.remove();
  return hammer;
}

function showErenWarhammerStrike(targetEl, attacker) {
  const arena = document.querySelector(".arena");
  const target = targetEl?.querySelector(".sprite-visual")?.getBoundingClientRect();
  const asset = attacker.animations?.warhammer?.frames?.strike;
  if (!arena || !target || !asset) return null;
  const bounds = arena.getBoundingClientRect();
  const visual = getCharacterVisual(attacker);
  const width = visual.frameWidth * visual.scale;
  const height = visual.frameHeight * visual.scale;
  const strike = document.createElement("img");
  strike.className = "eren-warhammer-strike";
  strike.src = asset;
  strike.alt = "";
  strike.setAttribute("aria-hidden", "true");
  strike.style.left = `${target.left + target.width / 2 - bounds.left - width / 2}px`;
  strike.style.top = `${target.bottom - bounds.top - height}px`;
  strike.style.width = `${width}px`;
  strike.style.height = `${height}px`;
  arena.append(strike);
  return strike;
}

function launchKiraStand(attackerEl, targetEl, attacker, durationMs) {
  const arena = $("#arena") ?? document.querySelector(".arena");
  const source = attackerEl.querySelector(".sprite-visual")?.getBoundingClientRect();
  const target = targetEl.querySelector(".sprite-visual")?.getBoundingClientRect();
  if (!arena || !source || !target) return null;
  const arenaRect = arena.getBoundingClientRect();
  const visual = getCharacterVisual(attacker);
  const width = visual.frameWidth * visual.scale;
  const height = visual.frameHeight * visual.scale;
  const startX = source.left + source.width * .2 - width / 2;
  const startY = source.bottom - height;
  // The substitute stops on the attacker's side of the target, never crossing it.
  const endX = target.right + width * .05;
  const endY = target.bottom - height;
  const stand = document.createElement("img");
  stand.className = "kira-stand";
  stand.src = attacker.animations.meleeAttack.frames.stand;
  stand.alt = "";
  stand.setAttribute("aria-hidden", "true");
  stand.style.left = `${startX - arenaRect.left}px`;
  stand.style.top = `${startY - arenaRect.top}px`;
  stand.style.width = `${width}px`;
  stand.style.height = `${height}px`;
  stand.style.setProperty("--kira-stand-x", `${endX - startX}px`);
  stand.style.setProperty("--kira-stand-y", `${endY - startY}px`);
  stand.style.setProperty("--kira-stand-duration", `${durationMs}ms`);
  arena.append(stand);
  return stand;
}

function startGilgameshVisual(fighter, actor, timeline) {
  const arena = document.querySelector(".arena");
  if (!arena) return;
  showFighterFrame(fighter, actor, "enuma", "raise");
  scheduleBorosVisual(() => {
    const image = fighter.querySelector('.sprite-action-frame.is-current');
    const box = image?.getBoundingClientRect() ?? fighter.getBoundingClientRect();
    const bounds = arena.getBoundingClientRect();
    const ratio = image?.naturalWidth && image?.naturalHeight ? image.naturalWidth / image.naturalHeight : 1;
    const artWidth = Math.min(box.width, box.height * ratio);
    const artHeight = artWidth / ratio;
    const left = box.left + (box.width - artWidth) / 2 + artWidth * timeline.beamOriginX - bounds.left;
    const top = box.bottom - artHeight * (1 - timeline.beamOriginY) - bounds.top;
    const beam = document.createElement("img");
    beam.className = "gilgamesh-visual gilgamesh-launch-beam";
    beam.src = timeline.effect;
    beam.alt = "";
    beam.style.left = `${left}px`;
    beam.style.top = `${top}px`;
    beam.style.width = `${Math.max(bounds.width * .75, 300) * timeline.beamScale}px`;
    beam.style.setProperty("--gil-angle", `${timeline.beamAngle}deg`);
    beam.style.setProperty("--gil-launch-ms", `${timeline.launchMs}ms`);
    arena.append(beam);
  }, timeline.chargeMs);
  scheduleBorosVisual(() => {
    arena.querySelector(".gilgamesh-launch-beam")?.remove();
    const allies = [...arena.querySelectorAll('.fighter[data-team="ally"]:not(.is-dead)')];
    const bounds = arena.getBoundingClientRect();
    const centers = allies.map((node) => { const box = node.getBoundingClientRect(); return box.left + box.width / 2; });
    const center = centers.length ? centers.reduce((sum, x) => sum + x, 0) / centers.length - bounds.left : bounds.width * .3;
    const beam = document.createElement("img");
    beam.className = "gilgamesh-visual gilgamesh-falling-beam";
    beam.src = timeline.effect;
    beam.alt = "";
    beam.style.left = `${center}px`;
    beam.style.width = `${Math.min(bounds.width * .8, 500) * timeline.fallScale}px`;
    beam.style.setProperty("--gil-fall-ms", `${timeline.fallMs}ms`);
    arena.append(beam);
  }, timeline.chargeMs + timeline.launchMs);
  scheduleBorosVisual(() => arena.querySelectorAll(".gilgamesh-visual").forEach((node) => node.remove()), timeline.totalMs);
}

function scheduleBorosVisual(callback, delay) {
  const token = generation;
  const timerId = window.setTimeout(() => {
    borosVisualTimers.delete(timerId);
    if (token === generation) callback();
  }, delay);
  borosVisualTimers.add(timerId);
}

function clearBorosVisuals(fighter = null) {
  document.querySelectorAll(".boros-skill-effect").forEach((effect) => effect.remove());
  for (const actor of fighter ? [fighter] : document.querySelectorAll(".fighter")) {
    actor.classList.remove("is-boros-flying", "is-boros-dashing", "is-boros-slamming", "is-boros-returning", "is-boros-charging");
    for (const property of ["--boros-lift", "--boros-dash-x", "--boros-takeoff-duration", "--boros-dash-duration", "--boros-slam-duration", "--boros-return-duration"]) actor.style.removeProperty(property);
  }
}

function startBorosSkillVisual(sourceEl, targetEl, attacker, animationName, timeline, scaled) {
  const arena = $("#arena") ?? document.querySelector(".arena");
  if (!arena) return;
  const sourceRect = sourceEl.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();
  if (animationName === "meteor") {
    const visual = sourceEl.querySelector(".sprite-visual")?.getBoundingClientRect() ?? sourceRect;
    const lift = Math.max(65, Math.round(visual.height * .95));
    const direction = Math.sign(targetRect.left + targetRect.width / 2 - sourceRect.left - sourceRect.width / 2);
    const travel = Math.max(0, Math.abs(targetRect.left + targetRect.width / 2 - sourceRect.left - sourceRect.width / 2) - (sourceRect.width + targetRect.width) * .48);
    sourceEl.style.setProperty("--boros-lift", `${lift}px`);
    sourceEl.style.setProperty("--boros-dash-x", `${direction * travel}px`);
    sourceEl.style.setProperty("--boros-takeoff-duration", `${scaled(timeline.takeoffMs)}ms`);
    sourceEl.style.setProperty("--boros-dash-duration", `${scaled(timeline.dashMs)}ms`);
    sourceEl.style.setProperty("--boros-slam-duration", `${scaled(timeline.slamMs)}ms`);
    sourceEl.style.setProperty("--boros-return-duration", `${scaled(timeline.returnMs)}ms`);
    showFighterFrame(sourceEl, attacker, "meteor", "fly");
    sourceEl.classList.add("is-boros-flying");
    scheduleBorosVisual(() => {
      sourceEl.classList.remove("is-boros-flying");
      showFighterFrame(sourceEl, attacker, "meteor", "dash");
      sourceEl.classList.add("is-boros-dashing");
    }, scaled(timeline.takeoffMs));
    scheduleBorosVisual(() => {
      sourceEl.classList.remove("is-boros-dashing");
      sourceEl.classList.add("is-boros-slamming");
      const opponents = viewState.characters.filter((unit) => unit.team !== attacker.team && unit.alive);
      const opponentRects = opponents.map((unit) => document.querySelector(`[data-character="${unit.id}"] .sprite-visual`)?.getBoundingClientRect()).filter(Boolean);
      const targets = opponentRects.length ? opponentRects : [targetRect];
      const arenaRect = arena.getBoundingClientRect();
      const left = Math.min(...targets.map((rect) => rect.left));
      const right = Math.max(...targets.map((rect) => rect.right));
      const bottom = Math.max(...targets.map((rect) => rect.bottom));
      const width = Math.min(arenaRect.width * .78, Math.max(190, right - left + 95));
      const effect = document.createElement("img");
      effect.className = "boros-skill-effect boros-meteor-impact";
      effect.src = timeline.effect;
      effect.alt = "";
      effect.style.left = `${(left + right) / 2 - arenaRect.left}px`;
      effect.style.top = `${bottom - arenaRect.top}px`;
      effect.style.width = `${width}px`;
      effect.style.height = `${width * 1.18}px`;
      effect.style.setProperty("--meteor-drop", `${arenaRect.height + width * 1.18}px`);
      effect.style.setProperty("--meteor-fall-duration", `${scaled(timeline.impactMs - timeline.takeoffMs - timeline.dashMs)}ms`);
      arena.append(effect);
    }, scaled(timeline.takeoffMs + timeline.dashMs));
    scheduleBorosVisual(() => arena.querySelector(".boros-meteor-impact")?.remove(), scaled(timeline.impactMs + 160));
    scheduleBorosVisual(() => {
      sourceEl.classList.remove("is-boros-slamming");
      sourceEl.classList.add("is-boros-returning");
    }, scaled(timeline.takeoffMs + timeline.dashMs + timeline.slamMs));
  } else if (animationName === "cannon") {
    showFighterFrame(sourceEl, attacker, "cannon", "charge");
    sourceEl.classList.add("is-boros-charging");
    scheduleBorosVisual(() => {
      const chargeImage = sourceEl.querySelector(".sprite-action-frame.is-current");
      const chargeFrame = chargeImage?.getBoundingClientRect()
        ?? sourceEl.querySelector(".sprite-visual")?.getBoundingClientRect() ?? sourceRect;
      const aspect = chargeImage?.naturalWidth && chargeImage?.naturalHeight
        ? chargeImage.naturalWidth / chargeImage.naturalHeight : chargeFrame.width / chargeFrame.height;
      const artWidth = Math.min(chargeFrame.width, chargeFrame.height * aspect);
      const artHeight = artWidth / aspect;
      const headX = chargeFrame.left + (chargeFrame.width - artWidth) / 2 + artWidth * timeline.headAnchor.x;
      const headY = chargeFrame.bottom - artHeight * (1 - timeline.headAnchor.y);
      const allies = viewState.characters.filter((unit) => unit.team === "ally" && unit.alive);
      const alliedRects = allies.map((unit) => document.querySelector(`[data-character="${unit.id}"]`)?.getBoundingClientRect()).filter(Boolean);
      const aimX = alliedRects.length ? alliedRects.reduce((sum, rect) => sum + rect.left + rect.width / 2, 0) / alliedRects.length : targetRect.left + targetRect.width / 2;
      const arenaRect = arena.getBoundingClientRect();
      const beam = getBorosBeamGeometry(arenaRect.left, arenaRect.right, headX, aimX);
      const height = Math.max(72, Math.min(160, beam.width / 3));
      const effect = document.createElement("img");
      effect.className = "boros-skill-effect boros-cannon-beam";
      effect.src = timeline.effect;
      effect.alt = "";
      effect.style.left = `${beam.left}px`;
      effect.style.top = `${headY - arenaRect.top - height / 2}px`;
      effect.style.width = `${beam.width}px`;
      effect.style.height = `${height}px`;
      if (beam.flip) effect.style.transform = "scaleX(-1)";
      arena.append(effect);
    }, timeline.chargeMs);
  }
}

function stopSpriteFrameCycle(actor) {
  const timerId = spriteFrameTimers.get(actor);
  if (timerId) window.clearTimeout(timerId);
  spriteFrameTimers.delete(actor);
}

function clearAllSpriteFrameCycles() {
  for (const timerId of spriteFrameTimers.values()) window.clearTimeout(timerId);
  spriteFrameTimers.clear();
}

function clearSpriteFrame(actor) {
  if (!actor) return;
  stopSpriteFrameCycle(actor);
  actor.classList.remove("has-action-sprite");
  actor.querySelector(".sprite-visual")?.style.setProperty("--visual-action-offset-x", "0px");
  actor.querySelector(".sprite-visual")?.style.setProperty("--visual-action-offset-y", "0px");
  const frame = actor.querySelector(".sprite-action");
  if (!frame) return;
  frame.dataset.requestedFrame = "";
  frame.dataset.framePending = "false";
  frame.classList.remove("active");
  frame.style.removeProperty("background-image");
  frame.style.removeProperty("background-size");
  frame.style.removeProperty("background-position");
  frame.style.removeProperty("--action-frame-scale");
  frame.style.removeProperty("--action-frame-foot-shift");
}

function startFrameCycle(fighter, character, animationName, frameNames, frameDuration, loop = true, durationScale = 1, durationIndexes = null) {
  stopSpriteFrameCycle(fighter);
  const animation = character?.animations?.[animationName];
  const validFrames = frameNames.filter((name) => typeof animation?.frames?.[name] === "string");
  if (!validFrames.length) return false;
  let index = 0;
  showFighterFrame(fighter, character, animationName, validFrames[index]);
  if (validFrames.length === 1) return true;
  const scheduleNextFrame = () => {
    const authoredDuration = animation?.durationsMs?.[durationIndexes?.[index] ?? index];
    const duration = Number.isFinite(authoredDuration) ? authoredDuration : frameDuration;
    const timerId = window.setTimeout(() => {
      if (index >= validFrames.length - 1) {
        if (!loop) {
          spriteFrameTimers.delete(fighter);
          return;
        }
        index = 0;
      } else index += 1;
      showFighterFrame(fighter, character, animationName, validFrames[index]);
      scheduleNextFrame();
    }, Math.max(40, Math.round(duration / durationScale)));
    spriteFrameTimers.set(fighter, timerId);
  };
  scheduleNextFrame();
  return true;
}

function animationFrameNames(character, animationName, prefix = null) {
  const frames = Object.keys(character?.animations?.[animationName]?.frames ?? {});
  return prefix ? frames.filter((name) => name.startsWith(prefix)) : frames;
}

function startRunCycle(fighter, character, frameDuration, durationScale = 1) {
  const frames = animationFrameNames(character, "run");
  if (frames.length) startFrameCycle(fighter, character, "run", frames, frameDuration, true, durationScale);
}

function startIdleCycle(fighter, character) {
  if (!fighter || !character?.alive || character.currentHp <= 0) return;
  if (character.id === "makima" && character.makimaGrounded) {
    showFighterFrame(fighter, character, "groundIdle", "stand");
    return;
  }
  if (character.id === "tang" && character.visualMeditating) {
    showFighterFrame(fighter, character, "meditate", "sit");
    return;
  }
  if (character.id === "armored-titan" && Number(fighter.dataset.armorPoseRound) === battleStatusState.currentRound && fighter.dataset.armorPoseRound) {
    showFighterFrame(fighter, character, "skill1", "hold");
    return;
  }
  if (character?.elitePassiveId === "mahito-domain" && character.visualDomainActive) {
    showFighterFrame(fighter, character, "domain", "domain");
    return;
  }
  const idleAnimation = character.phaseIdleAnimations?.[character.borosPhase ?? 1] ?? "idle";
  const frames = animationFrameNames(character, idleAnimation);
  if (!frames.length) return;
  if (character?.animations?.[idleAnimation]?.loop && frames.length > 1) {
    startFrameCycle(fighter, character, idleAnimation, frames, 360, true);
    return;
  }
  // Keep the authored idle pose stable for characters without authored idle loops.
  showFighterFrame(fighter, character, idleAnimation, frames[0]);
}

function hasOpeningPlayed() {
  if (openingSeenThisPage) return true;
  try { return sessionStorage.getItem(OPENING_SESSION_KEY) === "yes"; }
  catch { return false; }
}

function markOpeningPlayed() {
  openingSeenThisPage = true;
  try { sessionStorage.setItem(OPENING_SESSION_KEY, "yes"); }
  catch { /* The in-memory flag still prevents repeats until this page closes. */ }
}

function mountFighter(character) {
  let fighter = character.team === "ally"
    ? document.querySelector(`[data-character="${character.id}"]`)
    : document.querySelector(`[data-character="${character.id}"]`);
  if (!fighter && character.team === "ally") {
    const template = document.querySelector("#hero-fighter");
    const arena = document.querySelector(".arena");
    if (template && arena) {
      fighter = template.cloneNode(true);
      fighter.querySelectorAll(".sprite-action-frame").forEach((frame) => frame.remove());
      fighter.querySelector(".sprite-action")?.classList.remove("active");
      fighter.classList.remove("has-action-sprite");
      fighter.removeAttribute("id");
      fighter.dataset.character = character.id;
      fighter.classList.remove("fighter-naruto");
      fighter.classList.add("fighter-partner");
      arena.append(fighter);
    }
  }
  if (!fighter && character.team === "enemy") {
    const template = document.querySelector('[data-character="guard"]');
    const arena = document.querySelector(".arena");
    if (template && arena) {
      fighter = template.cloneNode(true);
      fighter.querySelectorAll(".sprite-action-frame").forEach((frame) => frame.remove());
      fighter.querySelector(".sprite-action")?.classList.remove("active");
      fighter.classList.remove("has-action-sprite");
      fighter.hidden = true;
      fighter.removeAttribute("id");
      fighter.dataset.character = character.id;
      fighter.classList.remove("fighter-guard");
      fighter.classList.add("fighter-elite");
      arena.append(fighter);
    }
  }
  if (!fighter) return null;
  fighter.dataset.character = character.id;
  fighter.dataset.team = character.team;
  if (character.controlledByMakima) fighter.dataset.controlledByMakima = "true";
  else delete fighter.dataset.controlledByMakima;
  fighter.dataset.row = character.row;
  fighter.dataset.evolution = String(character.evolutionPhase ?? 1);
  if (character.appearanceId) fighter.dataset.appearance = character.appearanceId;
  else delete fighter.dataset.appearance;
  if (character.mimicSourceId) fighter.dataset.mimic = character.mimicSourceId;
  else delete fighter.dataset.mimic;
  fighter.hidden = false;
  delete fighter.dataset.deathRound;
  fighter.classList.toggle("is-dead", !character.alive || character.currentHp <= 0);
  fighter.dataset.deathPose = character.deathPose || "default";
  fighter.classList.toggle("is-deidara", character.name === "迪达拉");
  fighter.classList.toggle("has-authored-hit", Boolean(character.animations?.hit?.frames));
  fighter.classList.toggle("is-elite", character.type === "elite");
  applyFighterVisual(fighter, character);
  delete character.visualDomainActive;
  fighter.classList.remove("is-elite-escape", "has-escaped", "is-domain-active");
  fighter.querySelector(".fighter-name").textContent = character.name;
  fighter.querySelector(".sprite").src = character.asset;
  fighter.querySelector(".sprite").alt = `像素${character.name}`;
  fighter.querySelector(".evolution-aura")?.remove();
  clearSpriteFrame(fighter);
  return fighter;
}

// The visual reveal never creates a battle unit; simulation has already recorded the summon.
function playSummonPortal(fighter, auraAsset, kind, onComplete) {
  if (!fighter || !auraAsset) { onComplete(); return; }
  const portal = document.createElement("img");
  portal.className = "summon-portal";
  portal.dataset.kind = kind;
  portal.src = new URL(`./${auraAsset}`, import.meta.url).href;
  portal.alt = "";
  portal.setAttribute("aria-hidden", "true");
  fighter.prepend(portal);
  fighter.classList.add("is-portal-pending");
  const schedule = (callback, delay) => {
    const id = window.setTimeout(() => { summonPortalTimers.delete(id); callback(); }, delay);
    summonPortalTimers.add(id);
  };
  schedule(() => {
    fighter.classList.remove("is-portal-pending");
    fighter.classList.add("is-portal-rising");
    fighter.style.setProperty("--summon-rise-duration", "750ms");
    schedule(() => {
      portal.remove();
      fighter.classList.remove("is-portal-rising");
      fighter.style.removeProperty("--summon-rise-duration");
      onComplete();
    }, 750);
  }, 1000);
}

function layoutBattleFormation(characters) {
  const arena = document.querySelector(".arena");
  const allies = characters.filter((character) => character.team === "ally" && !character.tangSummonKind);
  arena?.classList.toggle("ally-duo", allies.length === 2);
  arena?.classList.toggle("ally-mixed-rows", allies.some((unit) => unit.row === "front") && allies.some((unit) => unit.row === "back"));
  const makimaBattle = characters.some((character) => character.id === "makima" && character.team === "enemy");
  const shinNoiBattle = characters.some((character) => character.id === "shin" && character.team === "enemy") &&
    characters.some((character) => character.id === "noi" && character.team === "enemy");
  for (const team of ["ally", "enemy"]) {
    for (const row of ["front", "back"]) {
      const group = characters.filter((character) => character.team === team && character.row === row);
      const spacing = makimaBattle && team === "enemy" && row === "front"
        ? group.length <= 2 ? 22 : group.length === 3 ? 17 : 13
        : shinNoiBattle && team === "enemy" && row === "front" ? 18
        : 8;
      group.forEach((character, index) => {
        const fighter = document.querySelector(`[data-character="${character.id}"]`);
        if (fighter) fighter.style.setProperty("--formation-offset", `${(index - (group.length - 1) / 2) * spacing}%`);
      });
    }
  }
}

function buildHealthRows(characters) {
  const allies = characters.filter((c) => c.team === "ally");
  const enemies = characters.filter((c) => c.team === "enemy");
  const render = (chars) => chars.map((c) => `<div class="health-row" data-health="${c.id}">
    <span class="health-name">${c.name}</span>
    <span class="health-track"><i class="health-fill ${c.team === "ally" ? "ally-fill" : "enemy-fill"}"></i></span>
    <span class="health-value"><b class="current-hp">${c.currentHp ?? c.hp}</b><small>/${c.maxHp ?? c.hp}</small></span>
  </div>`).join("");
  $("#health-bars").innerHTML = render(allies);
  $("#enemy-health-bars").innerHTML = render(enemies);
  for (const character of characters) mountFighter(character);
  layoutBattleFormation(characters);
  document.querySelectorAll(".fighter[data-character]").forEach((fighter) => {
    fighter.hidden = !characters.some((character) => character.id === fighter.dataset.character);
  });
  // Initialize both the numeric label and bar width from persistent HP before playback starts.
  characters.forEach(updateHealth);
}

function updateHealth(character) {
  const row = document.querySelector(`[data-health="${character.id}"]`);
  if (!row) return;
  row.querySelector(".current-hp").textContent = character.currentHp;
  row.querySelector(".health-value small").textContent = `/${character.maxHp}`;
  row.querySelector(".health-fill").style.width = `${(character.currentHp / character.maxHp) * 100}%`;
  let shieldChip = row.querySelector(".shield-chip");
  if ((character.shieldHp ?? 0) > 0) {
    if (!shieldChip) { shieldChip = document.createElement("span"); shieldChip.className = "shield-chip"; row.append(shieldChip); }
    shieldChip.textContent = `护盾 ${character.shieldHp}`;
  } else shieldChip?.remove();
  let weaknessChip = row.querySelector(".weakness-chip");
  if (character.alive && Number.isInteger(character.weaknessRound) && battleStatusState.currentRound <= character.weaknessRound) {
    if (!weaknessChip) { weaknessChip = document.createElement("span"); weaknessChip.className = "weakness-chip"; row.append(weaknessChip); }
    weaknessChip.textContent = `虚弱 · R${character.weaknessRound} 伤害 -50%`;
  } else weaknessChip?.remove();
  row.classList.toggle("is-dead", !character.alive);
  const fighter = document.querySelector(`[data-character="${character.id}"]`);
  fighter?.classList.toggle("is-dead", !character.alive);
  if (fighter && (character.summonerId || character.stageThreeMinion)) {
    if (!character.alive) fighter.dataset.deathRound ??= String(battleStatusState.currentRound);
    else { delete fighter.dataset.deathRound; fighter.hidden = false; }
  }
  if (fighter && ["shin", "noi"].includes(character.id)) {
    if (!character.alive && !fighter.classList.contains("has-shin-noi-fall")) {
      clearSpriteFrame(fighter);
      fighter.classList.remove("is-melee-running", "is-melee-returning", "is-melee-rushing", "is-attacking", "is-casting");
      fighter.classList.add("has-shin-noi-fall");
      showFighterFrame(fighter, character, "fallen", "down");
    } else if (character.alive && fighter.classList.contains("has-shin-noi-fall")) {
      fighter.classList.remove("has-shin-noi-fall");
      clearSpriteFrame(fighter);
      startIdleCycle(fighter, character);
    }
  }
  // The evolved Naruto death pose also covers damage-over-time and other
  // non-attack deaths, whose event handlers do not play a death animation.
  const narutoDeathAsset = character.id === "naruto" && character.evolutionPhase === 2
    ? character.animations?.death?.frames?.down : null;
  if (fighter && narutoDeathAsset) {
    const sprite = fighter.querySelector(".sprite");
    if (!character.alive && !fighter.classList.contains("has-authored-death")) {
      fighter.classList.add("has-authored-death");
      if (sprite) sprite.src = narutoDeathAsset;
      clearSpriteFrame(fighter);
      showFighterFrame(fighter, character, "death", "down");
    } else if (character.alive && fighter.classList.contains("has-authored-death")) {
      fighter.classList.remove("has-authored-death");
      if (sprite) sprite.src = character.asset;
      clearSpriteFrame(fighter);
      startIdleCycle(fighter, character);
    }
  }
  if (!character.alive) fighter?.querySelector(".cannot-act-effect")?.remove();
  if (squadSide === "enemy" || character.tangSummonKind) renderSquad();
}

function hideExpiredFallenUnits() {
  for (const character of viewState?.characters ?? []) {
    const fighter = document.querySelector(`[data-character="${character.id}"]`);
    if (fighter?.dataset.deathRound != null && shouldHideFallenUnit(character,
      Number(fighter.dataset.deathRound), battleStatusState.currentRound)) fighter.hidden = true;
  }
}

function syncCannotActVisual(unit) {
  const fighter = document.querySelector(`[data-character="${unit.id}"]`);
  const visual = fighter?.querySelector(".sprite-visual");
  const active = unit.alive && (unit.stunNextAction || unit.tojiRestPending || unit.tojiResting ||
    (Number.isInteger(unit.frozenThroughRound) && unit.frozenThroughRound > 0 && unit.frozenThroughRound >= battleStatusState.currentRound));
  const effect = visual?.querySelector(".cannot-act-effect");
  if (!active) { effect?.remove(); return; }
  if (effect || !visual) return;
  const image = document.createElement("img");
  image.className = "cannot-act-effect";
  image.src = "assets/status-cannot-act.png";
  image.alt = "";
  image.setAttribute("aria-hidden", "true");
  visual.append(image);
}

function renderAllyStatusIcons() {
  const allyContainer = $("#ally-status-icons");
  const allyDetail = $("#ally-status-detail");
  const enemyContainer = $("#enemy-status-icons");
  const enemyDetail = $("#enemy-status-detail");
  const treasureContainer = $("#squad-treasure-icons");
  const treasureDetail = $("#squad-treasure-detail");
  if (!allyContainer || !allyDetail || !enemyContainer || !enemyDetail || !treasureContainer || !treasureDetail) return;

  const allyStatuses = [];
  const enemyStatuses = [];
  const treasureStatuses = [];
  for (const unit of viewState?.characters ?? []) {
    syncCannotActVisual(unit);
    if (!unit.alive) continue;
    const statuses = unit.team === "ally" ? allyStatuses : enemyStatuses;
    const frozen = Number.isInteger(unit.frozenThroughRound) && unit.frozenThroughRound > 0 &&
      unit.frozenThroughRound >= battleStatusState.currentRound;
    if (frozen || unit.stunNextAction || unit.tojiRestPending || unit.tojiResting) {
      statuses.push({ id: `cannot-act-${unit.id}`, name: `${unit.name} · 无法行动`,
        image: "assets/status-cannot-act.png", tone: "debuff",
        description: frozen ? `${unit.name} 受到冰冻，第 ${unit.frozenThroughRound} 回合结束前无法行动。`
          : unit.tojiRestPending || unit.tojiResting ? `${unit.name} 因疲劳休息，跳过一次行动。`
            : `${unit.name} 受到眩晕，将跳过下一次行动。` });
    }
    if ((unit.silencedThroughRound ?? 0) >= battleStatusState.currentRound && unit.silencedThroughRound > 0)
      statuses.push({ id: `silence-${unit.id}`, name: `${unit.name} · 沉默`, image: "assets/status-cannot-act.png", tone: "debuff",
        description: `${unit.name} 至第 ${unit.silencedThroughRound} 回合结束前无法释放主动技能，仍可普通攻击。` });
    if (unit.passiveSkillId === "kaneki-one-eye-king" && unit.oneEyeKingCritRateBonus > 0) {
      statuses.push({ id: `one-eye-crit-rate-${unit.id}`, name: `${unit.name} · 独眼暴击率`,
        image: unit.asset, tone: "buff", description: `${unit.name} 的独眼之王：本场战斗暴击率 +60 个百分点。` });
      if (battleStatusState.currentRound <= unit.oneEyeKingUntilRound)
        statuses.push({ id: `one-eye-crit-damage-${unit.id}`, name: `${unit.name} · 独眼暴伤`,
          image: unit.asset, tone: "buff", description: `${unit.name} 的独眼之王：暴击伤害 +40%，持续至第 ${unit.oneEyeKingUntilRound} 回合结束；期间击杀永久 ATK +10。` });
    }
    if (unit.gravityStacks > 0) statuses.push({ id: `gravity-${unit.id}`, name: `失去引力 ×${unit.gravityStacks}`,
      image: "assets/stage3-elites/falling/gravity-circle.png", tone: "debuff",
      description: `${unit.name}：失去引力 ${unit.gravityStacks}/4 层；累计实际恢复 300 HP 消除 1 层（当前 ${unit.gravityHealProgress ?? 0}/300）；达到 4 层时，战斗 DEF 高于 260 改受 800 点真实伤害，否则立即被处决。` });
    if (unit.bereavementActive && unit.bereavementDefenseBonus > 0)
      statuses.push({ id: `bereavement-${unit.id}`, name: `${unit.name} · 同伴倒地`, image: unit.asset, tone: "buff",
        description: `${unit.name} 因${unit.bereavementSourceId === "shin" ? "心" : "能井"}倒地，当前 ATK 翻倍、DEF +${unit.bereavementDefenseBonus}；同伴复活后移除。` });
    if (unit.burnStacks > 0) statuses.push({ id: `burn-${unit.id}`, name: "烧伤", image: "assets/status-burn.svg", tone: "danger",
      description: `${unit.name}：${unit.burnStacks} 层烧伤，每层在完整战斗回合结束时结算持续伤害。` });
    if (unit.bleedStacks > 0) statuses.push({ id: `bleed-${unit.id}`, name: "流血", image: "assets/status-bleed.svg", tone: "danger",
      description: `${unit.name}：${unit.bleedStacks} 层流血，每层在完整战斗回合结束时结算持续伤害。` });
  }
  if (campaign?.trial?.divinePunishmentBattlesLeft > 0) {
    allyStatuses.push({ id: "divine-punishment", name: "神罚", image: "assets/route-signs/question.png", tone: "danger",
      description: `全队最大 HP 临时 -20%，连续三场战斗中无法恢复生命；完成这一小关后回满 HP。还需完成 ${campaign.trial.divinePunishmentBattlesLeft} 场战斗。` });
  }
  const heracles = viewState?.characters?.find((unit) => unit.id === "heracles" && unit.alive);
  if (heracles?.heraclesTrialsActive) {
    enemyStatuses.push({ id: "heracles-twelve-trials", name: "十二试炼", image: heracles.asset, tone: "passive",
      description: `赫拉克勒斯还需受到 ${heracles.heraclesHitsRemaining} 次有效攻击命中；最后一次命中后倒下。` });
  }
  if (viewState?.characters?.some((unit) => unit.id === "tang" && unit.alive && unit.visualMeditating))
    allyStatuses.push({ id: "tang-meditate", name: "唐僧打坐", image: "assets/tang/tang_meditate.png", tone: "passive",
      description: "召唤物存活期间唐僧停止普通行动；每三个完整战斗回合发动一次诵经冲击。" });
  const temporaryEffects = campaign?.runCharacterState ? getTemporaryEffectDisplayRows(campaign.runCharacterState) : [];
  for (const effect of temporaryEffects) {
    const isCafe = ["coffee_shop", "coffee_help", "anteiku_2"].includes(effect.id);
    const isDeathNote = effect.id === "death_note";
    allyStatuses.push({
      id: effect.id ?? effect.name,
      name: isDeathNote ? "死亡笔记" : isCafe ? "安定区" : "路遇巨石",
      image: isDeathNote ? "assets/events/event_death_note.png" : isCafe ? "assets/events/event_coffee_shop.png" : "assets/events/event_big_rock.png",
      tone: effect.polarity,
      description: `${effect.statName} ${effect.amountText} · ${effect.durationText}`,
    });
  }
  const ownedTreasures = (campaign?.partyIds ?? []).flatMap((ownerId) =>
    (campaign.partyStates?.[ownerId]?.permanentEffects ?? [])
      .filter((effect) => TREASURE_DATA[effect.id] || [GIANT_SPINAL_FLUID.id, "gun_devil_fragment", "drip_coffee", "six_ear_true_form", "quinque_guard", "quinque_crit", "anteiku_weapon"].includes(effect.id))
      .map((effect) => ({ effect, ownerId })));
  const treasureGroups = Object.values(ownedTreasures.reduce((map, entry) => {
    (map[entry.effect.id] ??= []).push(entry);
    return map;
  }, {}));
  for (const entries of treasureGroups) {
    const item = entries[0].effect;
    const gain = entries.reduce((sum, { effect }) => { for (const key of ["atk", "def", "maxHp"]) sum[key] = (sum[key] ?? 0) + (effect[key] ?? 0); return sum; }, {});
    const gains = Object.entries(gain).filter(([, value]) => value).map(([key, value]) => `${key.toUpperCase()} ${value > 0 ? "+" : ""}${value}`).join("、");
    const history = entries.map(({ effect, ownerId }, index) => `${partyPresentation(ownerId)?.name ?? ownerId}第 ${effect.acquisitionCount ?? index + 1} 次：第 ${effect.stageId ?? "未知"} 关，来源 ${effect.sourceLabel ?? effect.sourceId ?? "未知"}，${Object.entries(effect).filter(([key, value]) => ["atk", "def", "maxHp"].includes(key) && value).map(([key, value]) => `${key.toUpperCase()} ${value > 0 ? "+" : ""}${value}`).join("、") || effect.description || "特殊效果"}`).join("；");
    treasureStatuses.push({ id: `treasure-${item.id}`, name: `${item.name} ×${entries.length}`, image: item.image ?? TREASURE_DATA[item.id]?.image ?? (item.id === GIANT_SPINAL_FLUID.id ? GIANT_SPINAL_FLUID.image : ""), tone: "buff", description: `${gains ? `累计 ${gains}。` : "特殊效果保留原说明。"}${history}` });
  }
  if (battleStatusState.jinchuriki) {
    const passive = battleStatusState.jinchuriki;
    allyStatuses.push({
      id: "jinchuriki", name: "人柱力", image: "assets/jinchuriki-status.svg", tone: "passive",
      description: passive.attackBonus === .30
        ? `当前 HP 低于最大 HP 的 50%：ATK +30%（${passive.originalAtk} → ${passive.effectiveAtk}）、吸血 +20%；恢复到半血及以上时移除。`
        : `本场战斗已触发：ATK +25%（${passive.originalAtk} → ${passive.effectiveAtk}）。开战时 HP 低于最大 HP 的 50%。`,
    });
  }
  if (battleStatusState.c0) {
    const c0 = battleStatusState.c0;
    enemyStatuses.push({
      id: "c0-art", name: "C0 终极艺术", image: "assets/c0-art-status.svg", tone: "danger",
      description: c0.detonated
        ? `已引爆：造成 ${c0.accumulatedDamage} 点真实伤害（${c0.completedRounds} 个完整行动回合）。`
        : `迪达拉每完成一个双方行动回合积累 ${c0.damagePerRound} 点真实伤害；当前 ${c0.accumulatedDamage} 点（${c0.completedRounds} 回合），迪达拉被击败时引爆。`,
    });
  }
  if (battleStatusState.borosPhase) {
    enemyStatuses.push({ id: "boros-phase", name: "宇宙霸主", image: "assets/stage2-enemies/boros/stage1.png", tone: "danger",
      description: `波罗斯当前为阶段${["", "一 · 铠甲", "二 · 能量释放", "三 · 最终形态"][battleStatusState.borosPhase]}。${battleStatusState.borosPhase === 3 ? "本阶段吸血 +10%。" : ""}` });
  }
  if (battleStatusState.armoredShield) {
    const shield = battleStatusState.armoredShield;
    enemyStatuses.push({ id: "armored-shield", name: "莱纳我坐了", image: "assets/stage2-enemies/armored-titan-placeholder.svg", tone: "buff",
      description: battleStatusState.currentRound < shield.startRound
        ? `第 ${shield.startRound} 回合开始，铠之巨人受到的普通伤害减少 25%。`
        : `铠之巨人受到的普通伤害减少 25%，持续至第 ${shield.untilRound} 回合结束。` });
  }
  const toji = viewState?.characters?.find((unit) => unit.id === "toji" && unit.alive);
  if (toji?.tojiFatigued) enemyStatuses.push({ id: "toji-fatigue", name: "出拳太快有点累了",
    image: "assets/status-cannot-act.png", tone: "debuff",
    description: "出拳达到 3 次后，行动一次、休息一次。" });
  for (const bomb of battleStatusState.bombs ?? []) {
    allyStatuses.push({ id: bomb.id, name: "杀手皇后炸弹", image: "assets/stage2-enemies/kira/idle.png", tone: "danger",
      description: `${bomb.targetName}身上已附着炸弹；剩余 ${Math.max(0, bomb.dueRound - battleStatusState.currentRound)} 个完整回合（第 ${bomb.dueRound} 回合引爆）。` });
  }

  const renderButtons = (container, statuses) => {
    container.replaceChildren(...statuses.map((status) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `ally-status-icon is-${status.tone}${selectedStatusId === status.id ? " is-selected" : ""}`;
      button.dataset.statusId = status.id;
      button.setAttribute("aria-label", `${status.name}：${status.description}`);
      button.setAttribute("aria-expanded", String(selectedStatusId === status.id));
      const image = document.createElement("img");
      image.src = status.image;
      image.alt = "";
      image.draggable = false;
      button.append(image);
      return button;
    }));
    container.hidden = statuses.length === 0;
  };
  const renderDetail = (detail, selected) => {
    detail.hidden = !selected;
    if (!selected) { detail.replaceChildren(); return; }
    detail.replaceChildren();
    const title = document.createElement("b");
    title.textContent = selected.name;
    const copy = document.createElement("span");
    copy.textContent = selected.description;
    detail.append(title, copy);
  };

  renderButtons(allyContainer, allyStatuses);
  renderButtons(enemyContainer, enemyStatuses);
  renderButtons(treasureContainer, treasureStatuses);
  const selected = [...allyStatuses, ...enemyStatuses, ...treasureStatuses].find((status) => status.id === selectedStatusId);
  if (!selected) selectedStatusId = null;
  renderDetail(allyDetail, selected && allyStatuses.includes(selected) ? selected : null);
  renderDetail(enemyDetail, selected && enemyStatuses.includes(selected) ? selected : null);
  renderDetail(treasureDetail, selected && treasureStatuses.includes(selected) && squadSide === "ally" ? selected : null);
}
function openTangSummonDetail(unit) {
  detailCharacterId = unit.id;
  const skill = unit.skills?.[0];
  const skillMarkup = skill
    ? `<div class="detail-skill-row"><div class="detail-skill-icon">技</div><div class="detail-skill-copy"><b>${skill.name}</b><p>${shortSkillEffect(skill)}</p></div></div>`
    : "";
  $("#character-detail").innerHTML =
    `<div class="detail-profile"><div class="detail-portrait"><img src="${unit.asset}" alt="${unit.name}"></div>` +
    `<div class="detail-name"><h3>${unit.name}</h3><p>唐僧召唤物 · 前排</p><span class="detail-team ally">${unit.alive ? "战斗中" : "已倒地"}</span></div></div>` +
    `<div class="detail-stats" aria-label="召唤物属性">` +
    `<div class="stat-card"><span>生命 HP</span><b>${unit.currentHp} / ${unit.maxHp}</b></div>` +
    `<div class="stat-card"><span>攻击 ATK</span><b>${unit.atk}</b></div>` +
    `<div class="stat-card"><span>防御 DEF</span><b>${unit.def}</b></div>` +
    `<div class="stat-card"><span>速度 SPD</span><b>${unit.spd}</b></div>` +
    `<div class="stat-card"><span>闪避率</span><b>${(getDodgeChance(unit) * 100).toFixed(1)}%</b></div>` +
    `<div class="stat-card"><span>技能闪避率</span><b>${(getSkillDodgeChance(unit) * 100).toFixed(1)}%</b></div>` +
    `<div class="stat-card"><span>暴击率</span><b>${(getCritChance(unit) * 100).toFixed(1)}%</b></div>` +
    `<div class="stat-card"><span>暴击倍率</span><b>${(unit.critMultiplier ?? COMBAT_RULES.critMultiplier).toFixed(1)}×</b></div></div>` +
    `<section class="detail-skill"><h3>召唤物技能</h3>${skillMarkup}</section>`;
  installSkillDetails(skill ? [skill] : []);
  if (!characterDialog.open) {
    if (typeof characterDialog.showModal === "function") characterDialog.showModal();
    else characterDialog.setAttribute("open", "");
  }
}

function openEnemyDetail(unit) {
  detailCharacterId = unit.id;
  const skillMap = new Map();
  for (const skill of unit.skills?.length ? unit.skills : unit.skill ? [unit.skill] : []) skillMap.set(skill.id, skill);
  const phaseSkillId = unit.phaseSkills?.[unit.borosPhase];
  if (phaseSkillId && SKILL_DATA[phaseSkillId]) {
    const config = SKILL_DATA[phaseSkillId];
    skillMap.set(phaseSkillId, { ...config, ...config.levels[1], level: 1 });
  }
  const passiveIds = [unit.passiveSkillId, unit.elitePassiveId, unit.periodicPassive?.id, unit.normalPassiveId,
    ...(unit.extraPassiveSkillIds ?? [])].filter(Boolean);
  const skillRows = [...skillMap.values()].map((skill) =>
    `<div class="detail-skill-row"><div class="detail-skill-icon">技</div><div class="detail-skill-copy"><b>${skill.name}</b><p>${shortSkillEffect(skill)}</p></div></div>`).join("");
  const passiveRows = [...new Set(passiveIds)].map((id) => {
    const passive = SKILL_DATA[id] ?? STAGE_TWO_NORMAL_PASSIVES[id] ?? STAGE_THREE_NORMAL_PASSIVES[id] ?? unit.periodicPassive;
    return passive ? `<div class="detail-skill-row"><div class="detail-skill-icon quiet">被</div><div class="detail-skill-copy"><b>${passive.name}</b><p>${shortSkillEffect({ ...passive, passive: true })}</p></div></div>` : "";
  }).join("");
  const suzuyaPassiveRow = unit.everyThirdNormalAttack
    ? `<div class="detail-skill-row"><div class="detail-skill-icon quiet">被</div><div class="detail-skill-copy"><b>${unit.everyThirdNormalAttack.name}</b><p>${unit.everyThirdNormalAttack.description}</p></div></div>` : "";
  const trialPassiveRow = unit.trialPassiveSkill
    ? `<div class="detail-skill-row"><div class="detail-skill-icon quiet">被</div><div class="detail-skill-copy"><b>${unit.trialPassiveSkill.name}</b><p>${unit.trialPassiveSkill.description}</p></div></div>` : "";
  const summonRow = unit.summonPassive
    ? `<div class="detail-skill-row"><div class="detail-skill-icon quiet">被</div><div class="detail-skill-copy"><b>${unit.summonPassive.name}</b><p>第 ${unit.summonPassive.firstRound} 回合开始，每隔 ${unit.summonPassive.everyRounds} 回合召唤一名普通巨人。</p></div></div>` : "";
  const c0Row = Number.isFinite(unit.c0DamagePerRound)
    ? `<div class="detail-skill-row"><div class="detail-skill-icon quiet">被</div><div class="detail-skill-copy"><b>C0</b><p>每个完整战斗回合累计 ${unit.c0DamagePerRound} 点真实伤害。</p></div></div>` : "";
  $("#character-detail").innerHTML =
    `<div class="detail-profile"><div class="detail-portrait"><img src="${unit.asset}" alt="${unit.name}"></div>` +
    `<div class="detail-name"><h3>${unit.name}</h3><p>${unit.role ?? "敌方单位"} · ${unit.row === "back" ? "后排" : "前排"}</p><span class="detail-team enemy">${unit.alive ? "敌方角色" : "已倒地"}</span></div></div>` +
    `<div class="detail-stats" aria-label="敌方属性">` +
    `<div class="stat-card"><span>生命 HP</span><b>${unit.currentHp} / ${unit.maxHp}</b></div>` +
    `<div class="stat-card"><span>攻击 ATK</span><b>${unit.atk}</b></div>` +
    `<div class="stat-card"><span>防御 DEF</span><b>${unit.def}</b></div>` +
    `<div class="stat-card"><span>速度 SPD</span><b>${unit.spd}</b></div>` +
    `<div class="stat-card"><span>闪避率</span><b>${(getDodgeChance(unit) * 100).toFixed(1)}%</b></div>` +
    `<div class="stat-card"><span>技能闪避率</span><b>${(getSkillDodgeChance(unit) * 100).toFixed(1)}%</b></div>` +
    `<div class="stat-card"><span>暴击率</span><b>${(getCritChance(unit) * 100).toFixed(1)}%</b></div>` +
    `<div class="stat-card"><span>暴击倍率</span><b>${(unit.critMultiplier ?? COMBAT_RULES.critMultiplier).toFixed(1)}×</b></div></div>` +
    (skillRows || passiveRows || suzuyaPassiveRow || trialPassiveRow || summonRow || c0Row ? `<section class="detail-skill"><h3>敌方技能</h3>${skillRows + passiveRows + suzuyaPassiveRow + trialPassiveRow + summonRow + c0Row}</section>` : "");
  installSkillDetails([...skillMap.values(), ...[...new Set(passiveIds)].map((id) => SKILL_DATA[id] ?? STAGE_TWO_NORMAL_PASSIVES[id] ?? STAGE_THREE_NORMAL_PASSIVES[id] ?? unit.periodicPassive),
    ...(unit.everyThirdNormalAttack ? [{ ...unit.everyThirdNormalAttack, passive: true, type: "passive", levels: { 1: { description: unit.everyThirdNormalAttack.description } } }] : []),
    ...(unit.trialPassiveSkill ? [{ ...unit.trialPassiveSkill, id: `trial-${unit.trialPassive}`, passive: true }] : []),
    ...(unit.summonPassive ? [{ ...unit.summonPassive, id: "summon-passive", passive: true,
      description: `第 ${unit.summonPassive.firstRound} 回合开始，每隔 ${unit.summonPassive.everyRounds} 回合召唤一名普通巨人。` }] : []),
    ...(Number.isFinite(unit.c0DamagePerRound) ? [{ id: "c0", name: "C0 终极艺术", passive: true,
      description: `每完整回合累积 ${unit.c0DamagePerRound} 点真实伤害，死亡时对所有存活敌人引爆。` }] : [])]);
  if (!characterDialog.open) {
    if (typeof characterDialog.showModal === "function") characterDialog.showModal();
    else characterDialog.setAttribute("open", "");
  }
}

function openCharacterDetail(characterId) {
  const enemy = campaign?.status === "combat"
    ? viewState.characters.find((unit) => unit.id === characterId && unit.team === "enemy") : null;
  if (enemy) return openEnemyDetail(enemy);
  const summon = campaign?.status === "combat"
    ? viewState.characters.find((unit) => unit.id === characterId && unit.team === "ally" && unit.tangSummonKind) : null;
  if (summon) return openTangSummonDetail(summon);
  const character = partyPresentation(characterId) ?? CHARACTER_DATA.find((entry) => entry.id === characterId);
  if (!character) return;

  const run = campaign?.partyStates?.[characterId] ?? null;
  detailCharacterId = characterId;
  const stats = run ? { ...run, critChance: run.critRate } : { currentHp: character.currentHp ?? character.hp, maxHp: character.maxHp ?? character.hp, atk: character.atk, def: character.def, spd: character.spd, critChance: character.critChance };
  const temporaryModifiers = run ? getTemporaryCombatModifiers(run) : { def: 0, spd: 0 };
  const treasureModifiers = run ? getTreasureCombatModifiers(run) : { dodgeRateBonus: 0 };
  const effectiveStats = { ...stats, def: Math.max(0, stats.def + temporaryModifiers.def), spd: Math.max(0, stats.spd + temporaryModifiers.spd) };
  const battleUnit = campaign?.status === "combat" && campaign.partyIds.includes(characterId)
    ? viewState.characters.find((unit) => unit.id === characterId) : null;
  if (battleUnit) {
    stats.maxHp = battleUnit.maxHp;
    stats.currentHp = battleUnit.currentHp;
  }
  const probabilityStats = battleUnit ?? { ...effectiveStats, critChance: stats.critChance,
    critRateBonus: run?.passiveSkillId === "kaneki-one-eye" && run.passiveLevel >= 2 ? .10 : 0,
    dodgeRateBonus: treasureModifiers.dodgeRateBonus };
  const rowName = character.row === "front" ? "前排" : "后排";
  const learned = run ? run.learnedActiveSkills.map((id) => getSkillAtLevel(run, id)).filter(Boolean) : character.skill ? [character.skill] : [];
  const skillMarkup = learned.length
    ? learned.map((skill) => '<div class="detail-skill-row"><div class="detail-skill-icon">技</div><div class="detail-skill-copy"><b>' + skill.name + ' · Lv.' + skill.level + '</b><p>' + shortSkillEffect(skill) + '</p></div></div>').join("")
    : '<div class="detail-skill-row"><div class="detail-skill-icon quiet">—</div><div class="detail-skill-copy"><b>尚未选择主动技能</b><p>完成开局技能选择后参与战斗。</p></div></div>';
  const unlearned = run ? getUnlearnedActiveSkills(run) : [];
  const lockedMarkup = unlearned.map((id) => '<div class="detail-skill-row locked-skill"><div class="detail-skill-icon quiet">技</div><div class="detail-skill-copy"><b>' + SKILL_DATA[id].name + ' · 未学习</b><p>' + shortSkillEffect({ ...SKILL_DATA[id], ...SKILL_DATA[id].levels[1] }) + '</p></div></div>').join("");
  const passive = SKILL_DATA[run?.passiveSkillId ?? character.passiveSkillId];
  const extraPassives = (run?.extraPassiveSkillIds ?? []).map((id) => SKILL_DATA[id]).filter(Boolean);
  const passiveLevel = run?.passiveLevel ?? 1;
  const passiveDescription = passive?.id === "jinchuriki" && passiveLevel >= 2
    ? "当前 HP 严格低于最大 HP 的 50% 时 ATK +30%、吸血 +20%；恢复到半血及以上即移除。"
    : passive?.id === "eren-2000-years" && passiveLevel >= 2
      ? "每场战斗免疫前两次受到的攻击；升级时最大 HP 一次性 +400。"
      : passive?.id === "kaneki-one-eye" && passiveLevel >= 2
        ? "暴击按最终计算伤害恢复 40% HP，暴击率 +10 个百分点，暴击伤害 +20 个百分点。"
        : passive?.description ?? "";
  const ownedTreasures = run?.permanentEffects?.filter((effect) => TREASURE_DATA[effect.id] ||
    ["gun_devil_fragment", "drip_coffee", "six_ear_true_form", "quinque_guard", "quinque_crit", "anteiku_weapon"].includes(effect.id)) ?? [];
  const treasureGroups = Object.values(ownedTreasures.reduce((groups, effect) => {
    (groups[effect.id] ??= []).push(effect); return groups;
  }, {}));
  const treasureMarkup = treasureGroups.length
    ? '<section class="detail-skill"><h3>本局宝物</h3>' + treasureGroups.map((items) => {
      const effect = items[0];
      const totals = items.reduce((sum, item) => { for (const key of ["atk", "def", "maxHp"]) sum[key] = (sum[key] ?? 0) + (item[key] ?? 0); return sum; }, {});
      const totalText = Object.entries(totals).filter(([, value]) => value).map(([key, value]) => key.toUpperCase() + ' ' + (value > 0 ? '+' : '') + value).join(' · ');
      const history = items.map((item, index) => '<p>第 ' + (item.acquisitionCount ?? index + 1) + ' 次 · 第 ' + (item.stageId ?? '—') + ' 关 · 来源 ' + (item.sourceId ?? '记录缺失') + ' · ' + (item.description ?? '') + '</p>').join('');
      return '<div class="detail-skill-row"><div class="detail-skill-icon"><img src="' + (effect.image ?? TREASURE_DATA[effect.id]?.image ?? '') + '" alt=""></div><div class="detail-skill-copy"><b>' + effect.name + ' ×' + items.length + '</b><p>' + (TREASURE_DATA[effect.id]?.description ?? effect.description ?? '') + '</p><p>累计属性：' + (totalText || '无固定属性收益') + '</p>' + history + '</div></div>';
    }).join("") + '</section>'
    : '';
  $("#character-detail").innerHTML =
    '<div class="detail-profile"><div class="detail-portrait"><img src="' + character.asset +
    '" alt="' + character.name + '"></div><div class="detail-name"><h3>' + character.name +
    '</h3><p>' + character.role + ' · ' + rowName + '</p><span class="detail-team ' +
    character.team + '">' + (character.team === "ally" ? "己方角色" : "敌方角色") +
    '</span></div></div>' +
    '<div class="detail-stats" aria-label="角色属性">' +
    '<div class="stat-card"><span>生命 HP</span><b>' + stats.currentHp + ' / ' + stats.maxHp + '</b></div>' +
    '<div class="stat-card"><span>攻击 ATK</span><b>' + stats.atk + '</b></div>' +
    '<div class="stat-card"><span>防御 DEF</span><b>' + effectiveStats.def + (temporaryModifiers.def ? '<small>' + stats.def + (temporaryModifiers.def > 0 ? ' + ' : ' − ') + Math.abs(temporaryModifiers.def) + '</small>' : '') + '</b></div>' +
    '<div class="stat-card"><span>速度 SPD</span><b>' + effectiveStats.spd + (temporaryModifiers.spd ? '<small>' + stats.spd + (temporaryModifiers.spd > 0 ? ' + ' : ' − ') + Math.abs(temporaryModifiers.spd) + '</small>' : '') + '</b></div>' +
    '<div class="stat-card"><span>闪避率</span><b>' + (getDodgeChance(probabilityStats) * 100).toFixed(1) + '%</b></div>' +
    '<div class="stat-card"><span>技能闪避率</span><b>' + (getSkillDodgeChance(probabilityStats) * 100).toFixed(1) + '%</b></div>' +
    '<div class="stat-card"><span>暴击率</span><b>' + (getCritChance(probabilityStats) * 100).toFixed(1) + '%</b></div>' +
    '<div class="stat-card"><span>暴击倍率</span><b>' + ((stats.critMultiplier ?? COMBAT_RULES.critMultiplier) + (run?.passiveSkillId === "kaneki-one-eye" && run.passiveLevel >= 2 ? SKILL_DATA["kaneki-one-eye"].levels[2].critDamageBonus : 0)).toFixed(1) + '×</b></div></div>' +
    '<section class="detail-skill"><h3>主动技能</h3>' + skillMarkup + lockedMarkup +
    '<div class="detail-skill-row"><div class="detail-skill-icon quiet">被</div><div class="detail-skill-copy"><b>' + (passive?.name ?? "暂无被动技能") + ' · Lv.' + passiveLevel + '</b><p>' + passiveDescription + '</p></div></div>' +
    extraPassives.map((entry) => `<div class="detail-skill-row"><div class="detail-skill-icon quiet">被</div><div class="detail-skill-copy"><b>${entry.name} · Lv.1</b><p>${entry.description}</p></div></div>`).join("") + '</section>' + treasureMarkup;

  installSkillDetails([...learned, ...unlearned.map((id) => ({ ...SKILL_DATA[id], ...SKILL_DATA[id].levels[1], level: 1 })),
    ...(passive ? [{ ...passive, ...passive.levels[passiveLevel], level: passiveLevel }] : []),
    ...extraPassives.map((entry) => ({ ...entry, ...entry.levels[1], level: 1 }))]);

  if (!characterDialog.open) {
    if (typeof characterDialog.showModal === "function") characterDialog.showModal();
    else characterDialog.setAttribute("open", "");
  }
}
function addLog(text, kind = "") {
  const item = document.createElement("li");
  item.className = `log-entry ${kind}`;
  item.innerHTML = text;
  log.append(item);
  log.scrollTop = log.scrollHeight;
  displayedEvents += 1;
  $("#log-count").textContent = playbackPaused ? `已暂停 · ${displayedEvents} 条记录` : `${displayedEvents} 条记录`;
  if (displayedEvents === 101) updateSpeedControl();
}

function setStatus(text, state = "") {
  statusLabel.textContent = text;
  statusLabel.parentElement.classList.toggle("is-fighting", state === "fighting");
  statusLabel.parentElement.classList.toggle("is-finished", state === "finished");
}

function setScreen(id) {
  if (id !== "battle-screen" && entranceCompletion) cancelEnemyEntrance();
  document.querySelectorAll(".flow-screen").forEach((screen) => {
    screen.hidden = screen.id !== id;
  });
  const essenceHud = $("#essence-hud");
  essenceHud.hidden = !campaign?.playerId || id === "battle-screen";
  $("#essence-count").textContent = String(campaign?.essence ?? 0);
  updateBossProgress();
  renderTrialProgress();
  window.scrollTo(0, 0);
}

function renderTrialProgress() {
  const panel = $("#trial-progress-panel");
  if (!panel) return;
  const trial = campaign?.trial;
  panel.hidden = !trial || trial.status !== "active" ||
    !["trial_intro", "trial_route", "trial_event", "combat"].includes(campaign.status);
  if (panel.hidden) return;
  $("#trial-panel-count").textContent = `${trial.completedCount}/2`;
  $("#trial-panel-tasks").replaceChildren(...trial.order.map((id) => {
    const row = document.createElement("li");
    row.textContent = `${TRIAL_TASKS[id].kind} · ${TRIAL_TASKS[id].name}：${({ pending: "未开始", active: "进行中", completed: "已完成", declined: "已放弃", failed: "失败" })[trial.tasks[id]]}`;
    return row;
  }));
  $("#trial-punishment-note").textContent = trial.divinePunishmentBattlesLeft > 0
    ? `神罚：剩余 ${trial.divinePunishmentBattlesLeft} 场战斗，最大 HP -20%，连续战斗中无法恢复生命；三场全胜后回满。` : "";
}

function updateBossProgress() {
  const panel = $("#boss-distance");
  if (!panel) return;
  const visible = campaign?.stageId === 1 && ["event", "combat", "settlement"].includes(campaign.status);
  panel.hidden = !visible;
  if (!visible) return;
  const completed = campaign.history.length;
  const remaining = shortestRemainingRouteLength(campaign.routeMap);
  const progress = Math.max(0, Math.min(1, completed / Math.max(1, completed + remaining)));
  $("#boss-distance-fill").style.width = (progress * 100) + "%";
  const characterId = campaign.runCharacterState?.characterId ?? campaign.playerId;
  const character = partyPresentation(characterId);
  const portrait = $("#boss-distance-player");
  if (character && portrait) {
    portrait.src = character.asset;
    portrait.alt = character.name;
    portrait.style.left = `clamp(10px, ${progress * 100}%, calc(100% - 10px))`;
  }
}

function setBattleControls(fighting) {
  speedButton.disabled = !fighting;
}

function updateBattleLogPanel() {
  logPanel.classList.toggle("is-expanded", battleLogExpanded);
  logToggle.setAttribute("aria-expanded", String(battleLogExpanded));
  logToggle.textContent = playbackPaused ? "继续战斗" : battleLogExpanded ? "收起记录" : "暂停并查看";
}

function pauseForBattleLog() {
  if (!playback || playbackPaused) return;
  playbackPaused = true;
  battleLogExpanded = true;
  setBattleControls(false);
  updateBattleLogPanel();
  $("#log-count").textContent = `已暂停 · ${displayedEvents} 条记录`;
}

function toggleBattleLog() {
  if (playbackPaused) {
    playbackPaused = false;
    battleLogExpanded = false;
    updateBattleLogPanel();
    setBattleControls(Boolean(playback && campaign?.status === "combat"));
    $("#log-count").textContent = `${displayedEvents} 条记录`;
    const continuation = pausedContinuation;
    pausedContinuation = null;
    if (continuation) continuation();
    else if (playback) playNext(generation);
    return;
  }
  if (playback) pauseForBattleLog();
  else {
    battleLogExpanded = !battleLogExpanded;
    updateBattleLogPanel();
  }
}

function clearEffects() {
  cancelEnemyEntrance();
  window.clearTimeout(timer);
  window.clearTimeout(effectTimer);
  window.clearTimeout(attackTimer);
  window.clearTimeout(animationStageTimer);
  window.clearTimeout(birdProjectileTimer);
  window.clearTimeout(targetHitTimer);
  for (const visualTimer of borosVisualTimers) window.clearTimeout(visualTimer);
  borosVisualTimers.clear();
  for (const portalTimer of summonPortalTimers) window.clearTimeout(portalTimer);
  summonPortalTimers.clear();
  clearBorosVisuals();
  lastBorosVisualCastId = null;
  lastGilgameshVisualCastId = null;
  document.querySelectorAll(".colossal-battle-smoke, .gilgamesh-visual, .trial-projectile, .shin-hammer-projectile, .eren-warhammer-strike, .evolution-entrance, .clone-protect-effect, .summon-portal, .arima-weakpoint, .cannot-act-effect, .gravity-circle, .gravity-dish").forEach((node) => node.remove());
  clearAllSpriteFrameCycles();
  timer = null;
  effectTimer = null;
  attackTimer = null;
  animationStageTimer = null;
  birdProjectileTimer = null;
  targetHitTimer = null;
  document.querySelectorAll(".elite-domain-banner").forEach((banner) => banner.remove());
  document.querySelectorAll(".kira-stand").forEach((stand) => stand.remove());
  document.querySelectorAll(".fighter").forEach((fighter) => {
    delete fighter.dataset.armorPoseRound;
    fighter.classList.remove("is-portal-pending", "is-portal-rising");
    fighter.style.removeProperty("--summon-rise-duration");
    fighter.classList.remove("is-attacking", "is-melee-rushing", "is-clone-melee-approaching", "is-kaneki-glutton-approaching", "is-clone-melee-returning", "is-melee-at-target", "is-melee-returning", "is-melee-running", "is-quanxi-hidden", "is-quanxi-behind", "is-makima-landing", "is-toji-approaching", "is-toji-at-target", "is-toji-returning", "is-skill-posing", "is-punching", "is-hit", "is-hit-stun", "is-hit-recoil", "is-casting", "is-dodging", "is-critical", "is-impact", "is-magic-attacking", "is-ranged-attacking", "is-elite-escape", "is-domain-active", "is-kaneki-normal-approach", "is-kaneki-normal-at-target", "is-kaneki-predator-launch", "is-kaneki-predator-strike", "is-kaneki-predator-hold", "is-kaneki-predator-return", "is-kaneki-reactive", "is-steam-casting", "gravity-lift", "gravity-hover", "gravity-drop", "is-gravity-dish");
    fighter.style.removeProperty("--quanxi-behind-x");
    fighter.style.removeProperty("--kaneki-arc-mid-x");
    fighter.style.removeProperty("--makima-landing-duration");
    fighter.querySelector(".impact-burst")?.classList.remove("play");
    fighter.querySelector(".impact-burst")?.classList.remove("melee-impact", "melee-from-right", "makima-impact");
    fighter.querySelector(".impact-burst")?.style.removeProperty("left");
    fighter.querySelector(".impact-burst")?.style.removeProperty("top");
    fighter.style.removeProperty("--melee-x");
    fighter.classList.remove("is-boros-punch-approaching", "is-boros-punch-at-target", "is-boros-punch-returning");
    fighter.style.removeProperty("--boros-punch-x");
    fighter.style.removeProperty("--boros-punch-approach-duration");
    fighter.style.removeProperty("--boros-punch-return-duration");
    fighter.style.removeProperty("--kaneki-launch-x");
    fighter.style.removeProperty("--kaneki-nudge");
    fighter.style.removeProperty("--kaneki-launch-duration");
    fighter.style.removeProperty("--kaneki-approach-duration");
    fighter.style.removeProperty("--kaneki-hold-duration");
    fighter.style.removeProperty("--kaneki-return-duration");
    fighter.style.removeProperty("--kaneki-normal-duration");
    fighter.style.removeProperty("--kaneki-normal-approach-duration");
    fighter.style.removeProperty("--kaneki-normal-return-duration");
    fighter.style.removeProperty("--attack-duration");
    fighter.style.removeProperty("--approach-duration");
    fighter.style.removeProperty("--return-duration");
    fighter.style.removeProperty("--impact-duration");
    fighter.style.removeProperty("--skill-duration");
    fighter.style.removeProperty("--elite-escape-duration");
    fighter.style.removeProperty("--hit-duration");
    fighter.style.removeProperty("--hit-shake-duration");
    fighter.style.removeProperty("--dodge-duration");
    fighter.style.removeProperty("--impact-fx-duration");
    fighter.style.removeProperty("--death-duration");
    fighter.style.removeProperty("--steam-duration");
    fighter.style.removeProperty("--formation-offset");
    clearSpriteFrame(fighter);
    const damage = fighter.querySelector(".damage-number");
    if (damage) {
      damage.textContent = "";
      damage.classList.remove("pop");
    }
  });
  document.querySelectorAll(".deidara-bird-projectile").forEach((projectile) => projectile.remove());
  document.querySelectorAll(".c0-explosion-overlay").forEach((overlay) => overlay.remove());
  $("#battle-stamp").className = "battle-stamp";
  $("#battle-stamp").textContent = "";
  battleStatusState = { jinchuriki: null, c0: null, borosPhase: null, bombs: [], armoredShield: null, tojiExhausted: false, currentRound: 0 };
  playbackPaused = false;
  battleLogExpanded = false;
  pausedContinuation = null;
  updateBattleLogPanel();
  selectedStatusId = null;
  renderAllyStatusIcons();
}

function playEvent(event, finish) {
  if (Number.isFinite(event.round) && event.round !== battleStatusState.currentRound) {
    battleStatusState.currentRound = event.round;
    hideExpiredFallenUnits();
    viewState?.characters?.forEach((character) => {
      if ((character.wukongDefenseBuffUntilRound ?? -1) < event.round) character.wukongDefenseBuff = 0;
    });
    const armor = document.querySelector('[data-character="armored-titan"]');
    if (armor?.dataset.armorPoseRound && Number(armor.dataset.armorPoseRound) < event.round) {
      delete armor.dataset.armorPoseRound;
      const actor = viewState.characters.find((unit) => unit.id === "armored-titan");
      if (actor?.alive) startIdleCycle(armor, actor);
    }
    renderAllyStatusIcons();
    viewState?.characters?.forEach((character) => { if (Number.isInteger(character.weaknessRound)) updateHealth(character); });
  }
  if (event.type === "gravity-domain") {
    for (const entry of event.targets) {
      const target = viewState.characters.find((unit) => unit.id === entry.targetId);
      if (target) { target.entryPanelSpd = entry.entryPanelSpd; target.spd = 1; target.gravityStacks = 0; target.gravityHealProgress = 0; }
    }
    addLog("<b>下落恶魔</b> 展开重力领域：我方实际战斗 SPD 固定为 1；失重仍按入场面板 SPD 计算。", "log-enemy");
    renderSquad();
    return finish();
  }
  if (event.type === "gravity-heal") {
    const target = viewState.characters.find((unit) => unit.id === event.targetId);
    if (target) { target.gravityStacks = event.stacks; target.gravityHealProgress = event.healingProgress; renderAllyStatusIcons(); }
    addLog(`<b>${target?.name ?? "角色"}</b> 恢复 ${event.restored} HP${event.layersRemoved ? `，失去引力减少 ${event.layersRemoved} 层，剩余 ${event.stacks} 层` : ""}${event.stacks ? `；当前治疗进度 ${event.healingProgress}/300 HP` : ""}。`, "log-skill");
    return finish();
  }
  if (event.type === "gravity-fall") {
    const devil = viewState.characters.find((unit) => unit.id === event.attackerId);
    const source = document.querySelector(`[data-character="${event.attackerId}"]`);
    if (!devil || !source) return finish();
    showFighterFrame(source, devil, "gravity", "charge");
    addLog(`<span class="round-label">R${event.round}</span> <b>下落恶魔</b> 发动失重。`, "log-enemy");
    timer = window.setTimeout(() => {
      timer = null;
      showFighterFrame(source, devil, "gravity", "release");
      const circles = [];
      const riseMs = Math.max(600, playbackDelay(1100, 850));
      const hoverMs = Math.max(280, playbackDelay(500, 350));
      const dropMs = Math.max(240, playbackDelay(360, 300));
      for (const hit of event.hits) {
        const fighter = document.querySelector(`[data-character="${hit.targetId}"]`);
        if (!fighter) continue;
        fighter.style.setProperty("--gravity-rise", `${getGravityLiftPixels(hit.entryPanelSpd)}px`);
        fighter.style.setProperty("--gravity-lift-duration", `${riseMs}ms`);
        fighter.style.setProperty("--gravity-drop-duration", `${dropMs}ms`);
        const circle = document.createElement("img");
        circle.className = "gravity-circle"; circle.src = new URL(`./${devil.gravityCircleAsset}`, import.meta.url).href;
        circle.alt = ""; circle.setAttribute("aria-hidden", "true");
        fighter.append(circle); circles.push(circle);
        fighter.classList.add("gravity-lift");
      }
      timer = window.setTimeout(() => {
        timer = null;
        for (const hit of event.hits) {
          const fighter = document.querySelector(`[data-character="${hit.targetId}"]`);
          fighter?.classList.remove("gravity-lift"); fighter?.classList.add("gravity-hover");
        }
        if (event.hits.length) {
          devil.currentHp = event.devilHpAfter;
          updateHealth(devil);
          if (event.healedAmount > 0) {
            const number = source.querySelector(".damage-number");
            if (number) {
              number.textContent = `+${event.healedAmount}`;
              number.classList.add("is-heal"); number.classList.remove("pop");
              void number.offsetWidth; number.classList.add("pop");
            }
            addLog(`<b>下落恶魔</b> 抬起对方后恢复已损失 HP 的 15%，实际恢复 ${event.healedAmount} HP。`, "log-enemy");
          }
          renderSquad();
        }
        timer = window.setTimeout(() => {
          timer = null;
          for (const hit of event.hits) {
            const fighter = document.querySelector(`[data-character="${hit.targetId}"]`);
            fighter?.classList.remove("gravity-hover"); fighter?.classList.add("gravity-drop");
          }
          timer = window.setTimeout(() => {
            timer = null;
            for (const hit of event.hits) {
              const target = viewState.characters.find((unit) => unit.id === hit.targetId);
              const fighter = document.querySelector(`[data-character="${hit.targetId}"]`);
              if (!target) continue;
              target.currentHp = hit.hpAfter; target.alive = !hit.fellDead;
              target.shieldHp = hit.shieldHp; target.gravityStacks = hit.stacks;
              updateHealth(target);
              const number = fighter?.querySelector(".damage-number");
              if (number) { number.textContent = `-${hit.actualDamage}`; number.classList.remove("is-heal", "pop");
                void number.offsetWidth; number.classList.add("pop"); }
              if (hit.fellDead) fighter?.classList.add("is-dead");
              fighter?.classList.remove("gravity-drop");
              addLog(`<b>${target.name}</b> 坠落：入场 SPD ${hit.entryPanelSpd}，基础 ${hit.baseDamage}，实际失去 ${hit.actualDamage} HP${hit.fellDead ? "，倒地" : `；失去引力 ${hit.stacks}/4 层`}。`, "log-enemy");
            }
            circles.forEach((circle) => circle.remove());
            startIdleCycle(source, devil);
            renderAllyStatusIcons(); renderSquad();
            if (playbackPaused) pausedContinuation = finish; else finish();
          }, dropMs);
        }, hoverMs);
      }, riseMs);
    }, playbackDelay(500, 240));
    return;
  }
  if (event.type === "attack-titan-hp-damage") {
    const target = viewState.characters.find((unit) => unit.id === event.targetId);
    const fighter = document.querySelector(`[data-character="${event.targetId}"]`);
    if (target) {
      target.currentHp = event.targetHp;
      target.shieldHp = event.targetShield;
      target.alive = !event.targetDied;
      if (event.trialDamage?.heraclesHitsRemaining != null) {
        target.heraclesTrialsActive = true;
        target.heraclesHitsRemaining = event.trialDamage.heraclesHitsRemaining;
      }
      updateHealth(target);
      if (event.targetDied) fighter?.classList.add("is-dead");
      renderAllyStatusIcons(); renderSquad();
    }
    for (const heal of event.scorpionHeals ?? []) {
      const ally = viewState.characters.find((unit) => unit.id === heal.targetId);
      if (!ally) continue;
      ally.currentHp = heal.currentHp;
      updateHealth(ally);
      addLog(`<b>蝎子莱莱</b> 受伤后使 ${ally.name} 恢复 ${heal.amount} HP。`, "log-skill");
    }
    addLog(`<b>进击巨人</b> 坐标：${event.attackKind === "skill" ? "主动技能按最大 HP 10%" : "普通攻击按已损失 HP 20%"}追加攻击（${event.power} 基础伤害），实际造成 ${event.actualDamage} 伤害。`, "log-skill");
    return finish();
  }
  if (event.type === "gravity-main-course-damage") {
    const devil = viewState.characters.find((unit) => unit.id === event.attackerId);
    const target = viewState.characters.find((unit) => unit.id === event.targetId);
    const source = document.querySelector('[data-character="' + event.attackerId + '"]');
    const fighter = document.querySelector('[data-character="' + event.targetId + '"]');
    if (!devil || !target || !source || !fighter) return finish();
    showFighterFrame(source, devil, "execution", "cast");
    addLog("<b>下落恶魔</b> 的「主菜」命中 <b>" + target.name + "</b>：战斗 DEF " +
      event.defenseAtTrigger + " 高于 260，改为 800 点真实伤害；实际失去 " +
      event.actualDamage + " HP" + (event.targetDied ? "，倒地。" : "。"), "log-enemy");
    timer = window.setTimeout(() => {
      timer = null;
      target.currentHp = event.hpAfter; target.alive = !event.targetDied;
      target.shieldHp = event.shieldHp; target.gravityStacks = event.stacks;
      updateHealth(target);
      const number = fighter.querySelector(".damage-number");
      if (number && event.actualDamage > 0) {
        number.textContent = "-" + event.actualDamage;
        number.classList.remove("is-heal", "pop");
        void number.offsetWidth;
        number.classList.add("pop");
      }
      if (event.targetDied) fighter.classList.add("is-dead");
      renderAllyStatusIcons(); renderSquad();
      timer = window.setTimeout(() => {
        timer = null; startIdleCycle(source, devil);
        if (playbackPaused) pausedContinuation = finish; else finish();
      }, playbackDelay(650, 300));
    }, playbackDelay(500, 240));
    return;
  }
  if (event.type === "gravity-execution") {
    const devil = viewState.characters.find((unit) => unit.id === event.attackerId);
    const target = viewState.characters.find((unit) => unit.id === event.targetId);
    const source = document.querySelector(`[data-character="${event.attackerId}"]`);
    const fighter = document.querySelector(`[data-character="${event.targetId}"]`);
    if (!devil || !target || !source || !fighter) return finish();
    showFighterFrame(source, devil, "execution", "cast");
    addLog(`<b>下落恶魔</b> 的「主菜」处决 ${target.name}：失去引力达到 ${event.stacks} 层。`, "log-death");
    timer = window.setTimeout(() => {
      timer = null;
      target.currentHp = 0; target.alive = false; target.gravityStacks = event.stacks;
      updateHealth(target);
      fighter.classList.add("is-dead", "is-gravity-dish");
      const dish = document.createElement("img");
      dish.className = "gravity-dish"; dish.src = devil.dishAsset;
      dish.alt = ""; dish.setAttribute("aria-hidden", "true"); fighter.append(dish);
      renderAllyStatusIcons(); renderSquad();
      timer = window.setTimeout(() => {
        timer = null; startIdleCycle(source, devil);
        if (playbackPaused) pausedContinuation = finish; else finish();
      }, playbackDelay(650, 300));
    }, playbackDelay(500, 240));
    return;
  }
  if (event.type === "toji-fatigue") {
    const toji = viewState.characters.find((unit) => unit.id === event.attackerId);
    if (toji) toji.tojiFatigued = true;
    renderAllyStatusIcons();
    addLog(`<b>${toji?.name ?? "伏黑甚尔"}</b> 连续出拳 3 次，进入疲劳状态：行动一次、休息一次。`, "log-skill");
    return finish();
  }
  if (event.type === "toji-rest-ready") {
    const toji = viewState.characters.find((unit) => unit.id === event.attackerId);
    if (toji) toji.tojiRestPending = true;
    renderAllyStatusIcons();
    return finish();
  }
  if (event.type === "toji-skip") {
    const toji = viewState.characters.find((unit) => unit.id === event.attackerId);
    if (toji) { toji.tojiRestPending = false; toji.tojiResting = true; }
    renderAllyStatusIcons();
    addLog(`<span class="round-label">R${event.round}</span> <b>伏黑甚尔</b> 太累了，休息一次。`, "log-enemy");
    return window.setTimeout(finish, playbackDelay(500, 220));
  }
  if (event.type === "toji-resume") {
    const toji = viewState.characters.find((unit) => unit.id === event.attackerId);
    if (toji) toji.tojiResting = false;
    renderAllyStatusIcons();
    return finish();
  }
  if (event.type === "jason-max-hp") {
    const target = viewState.characters.find((unit) => unit.id === event.targetId);
    if (target) {
      target.maxHp = event.maxHpAfter;
      target.currentHp = event.hpAfter;
      updateHealth(target);
    }
    addLog(`<b>铃屋什造</b> 的「杰森！」使 <b>${target?.name ?? "目标"}</b> 最大 HP ${event.maxHpBefore} → ${event.maxHpAfter}（永久降低 ${event.reduction}，不造成额外伤害）。`, "log-skill");
    return finish();
  }
  if (event.type === "normal-passive-reflect") {
    const target = viewState.characters.find((unit) => unit.id === event.targetId);
    if (target) {
      target.currentHp = event.targetHp;
      target.shieldHp = event.targetShield;
      target.alive = !event.targetDied;
      updateHealth(target);
      const fighter = document.querySelector(`[data-character="${target.id}"]`);
      const number = fighter?.querySelector(".damage-number");
      if (number && event.actualDamage > 0) {
        number.textContent = `-${event.actualDamage}`;
        number.classList.remove("pop");
        void number.offsetWidth;
        number.classList.add("pop");
      }
      if (event.targetDied && fighter) {
        clearSpriteFrame(fighter);
        fighter.classList.add("is-dead");
        const frames = animationFrameNames(target, "death");
        if (frames.length) startFrameCycle(fighter, target, "death", frames, ANIMATION_TIMING.attack.deathMs / frames.length, false);
      }
    }
    addLog(`<b>${event.skillName ?? "摄魂怪"}</b> 反弹 ${event.actualDamage} 点伤害。`, "log-skill");
    return finish();
  }
  if (event.type === "normal-passive-stun") {
    const target = viewState.characters.find((unit) => unit.id === event.targetId);
    if (target?.alive) { target.stunNextAction = true; renderAllyStatusIcons(); }
    addLog(`<b>照桥心美</b> 使 <b>${target?.name ?? "攻击者"}</b> 眩晕，跳过下一次行动。`, "log-enemy");
    return finish();
  }
  if (event.type === "normal-passive-gollum") {
    addLog(`<b>咕噜</b> 存活 5 回合：偷取 ${Math.min(campaign?.essence ?? 0, event.amount ?? 5)} 点精华。`, "log-enemy");
    return finish();
  }
  if (event.type === "giant-overrun") {
    addLog(`<b>${event.text}</b>`, "log-death");
    const stamp = $("#battle-stamp");
    stamp.textContent = event.text;
    stamp.className = "battle-stamp skill-stamp show";
    timer = window.setTimeout(() => { stamp.classList.remove("show"); timer = null; finish(); }, playbackDelay(1200, 600));
    return;
  }
  if (event.type === "gilgamesh-heal") {
    const actor = viewState.characters.find((character) => character.id === event.attackerId);
    if (actor) { actor.currentHp = event.hpAfter; updateHealth(actor); }
    const fighter = actor && document.querySelector(`[data-character="${actor.id}"]`);
    const number = fighter?.querySelector(".damage-number");
    if (number && event.healedAmount > 0) {
      number.textContent = `+${event.healedAmount}`;
      number.classList.remove("pop"); number.classList.add("is-heal");
      void number.offsetWidth; number.classList.add("pop");
    }
    addLog(`<b>吉尔伽美什</b> 天地乖离第三式：恢复 ${event.healedAmount} HP。`, "log-enemy");
    timer = window.setTimeout(() => { timer = null; finish(); }, playbackDelay(440, 260));
    return;
  }
  if (event.type === "stage3-control" || event.type === "stage3-control-end") {
    const unit = viewState.characters.find((entry) => entry.id === event.targetId);
    if (unit) {
      unit.team = event.type === "stage3-control" ? "enemy" : "ally";
      unit.controlledByMakima = event.type === "stage3-control";
      for (const summon of viewState.characters.filter((entry) => entry.summonerId === unit.id)) {
        summon.team = unit.team;
        summon.controlledByMakima = unit.controlledByMakima;
      }
      buildHealthRows(viewState.characters);
      renderSquad();
      addLog(`<span class="round-label">R${event.round}</span> <b>${unit.name}</b>${event.type === "stage3-control" ? "受到玛奇玛支配，转向我方" : "摆脱支配，回到队伍"}。`, "log-skill");
    }
    return finish();
  }
  if (event.type === "stage3-revive") {
    const unit = viewState.characters.find((entry) => entry.id === event.targetId);
    if (unit) {
      unit.currentHp = event.hpAfter; unit.alive = true;
      const fighter = mountFighter(unit);
      if (fighter) { fighter.classList.remove("is-dead", "has-shin-noi-fall"); clearSpriteFrame(fighter); startIdleCycle(fighter, unit); }
      updateHealth(unit);
      addLog(`<span class="round-label">R${event.round}</span> <b>${unit.name}</b> 复活，恢复至 ${event.hpAfter} HP。`, "log-skill");
    }
    return finish();
  }
  if (event.type === "stage3-bereavement" || event.type === "stage3-bereavement-end") {
    const survivor = viewState.characters.find((entry) => entry.id === event.attackerId);
    if (survivor) {
      survivor.atk = event.currentAtk;
      survivor.def = event.currentDef;
      survivor.bereavementActive = event.type === "stage3-bereavement";
      survivor.bereavementDefenseBonus = event.defenseBonus ?? 0;
      survivor.bereavementSourceId = event.sourceId ?? null;
      if (squadSide === "enemy") renderSquad();
      addLog(`<span class="round-label">R${event.round}</span> <b>${survivor.name}</b>${event.type === "stage3-bereavement"
        ? `因同伴倒地，ATK 翻倍至 ${event.currentAtk}，DEF +${event.defenseBonus}（当前 ${event.currentDef}）`
        : `因同伴复活，ATK 恢复至 ${event.currentAtk}，DEF 恢复至 ${event.currentDef}`}。`, "log-skill");
      renderAllyStatusIcons();
    }
    return finish();
  }
  if (event.type === "stage3-heal") {
    for (const healed of event.healed) {
      const unit = viewState.characters.find((entry) => entry.id === healed.targetId);
      if (unit) {
        unit.currentHp = healed.hpAfter; updateHealth(unit);
        const number = document.querySelector(`[data-character="${unit.id}"] .damage-number`);
        if (number && healed.amount > 0) {
          number.textContent = `+${healed.amount}`;
          number.classList.add("is-heal"); number.classList.remove("pop");
          void number.offsetWidth; number.classList.add("pop");
        }
      }
    }
    addLog(`<span class="round-label">R${event.round}</span> <b>能井</b> 治疗队友：${event.healed.map((item) => `${viewState.characters.find((unit) => unit.id === item.targetId)?.name ?? item.targetId} +${item.amount}`).join("，")}。`, "log-skill");
    const healer = viewState.characters.find((unit) => unit.id === event.attackerId);
    const fighter = healer && document.querySelector(`[data-character="${healer.id}"]`);
    if (!fighter || !showFighterFrame(fighter, healer, "heal", "cast")) return finish();
    timer = window.setTimeout(() => {
      timer = null;
      startIdleCycle(fighter, healer);
      if (playbackPaused) pausedContinuation = finish;
      else finish();
    }, playbackDelay(700, 350));
    return;
  }
  if (["stage3-revive-pending", "stage3-minion-death", "stage3-lifesteal", "stage3-buff-clear"].includes(event.type)) {
    const target = viewState.characters.find((entry) => entry.id === event.targetId);
    if (event.type === "stage3-minion-death") {
      const boss = viewState.characters.find((entry) => entry.id === event.attackerId);
      if (boss) { boss.atk = event.currentAtk; if (squadSide === "enemy") renderSquad(); }
    }
    if (event.type === "stage3-buff-clear" && target) {
      Object.assign(target, event.buffState);
      updateHealth(target);
      renderAllyStatusIcons();
      renderSquad();
    }
    const message = event.type === "stage3-revive-pending" ? `${target?.name ?? event.targetId}将在第 ${event.reviveAtRound} 回合复活。`
      : event.type === "stage3-minion-death" ? `玛奇玛的眷属阵亡，ATK +150（当前 ${event.currentAtk}）。`
      : event.type === "stage3-lifesteal" ? "四名眷属全部阵亡，玛奇玛获得 25% 吸血。"
      : `天使恶魔抹除 ${target?.name ?? event.targetId} 的当前技能增益${event.cleared.length ? `：${event.cleared.join("、")}` : ""}。`;
    addLog(`<span class="round-label">R${event.round}</span> ${message}`, "log-skill");
    if (event.type === "stage3-lifesteal") {
      const makima = viewState.characters.find((unit) => unit.id === "makima");
      if (makima) makima.lifesteal = (makima.lifesteal ?? 0) + event.lifesteal;
      const fighter = makima && document.querySelector('[data-character="makima"]');
      if (makima && fighter) {
        makima.makimaGrounded = true;
        fighter.style.setProperty("--visual-offset-y", "0px");
        fighter.style.setProperty("--makima-landing-duration", `${playbackDelay(1000, 500)}ms`);
        fighter.classList.add("is-makima-landing");
        showFighterFrame(fighter, makima, "landing", "land");
        timer = window.setTimeout(() => {
          timer = null;
          const complete = () => {
            fighter.classList.remove("is-makima-landing");
            fighter.style.removeProperty("--makima-landing-duration");
            makima.asset = makima.animations.groundIdle.frames.stand;
            fighter.querySelector(".sprite").src = makima.asset;
            startIdleCycle(fighter, makima);
            if (squadSide === "enemy") renderSquad();
            finish();
          };
          if (playbackPaused) pausedContinuation = complete;
          else complete();
        }, playbackDelay(1000, 500));
        return;
      }
    }
    return finish();
  }
  if (event.type === "stage3-minion-wipe-stun") {
    for (const id of event.targetIds) {
      const unit = viewState.characters.find((entry) => entry.id === id);
      if (unit?.alive) unit.stunNextAction = true;
    }
    renderAllyStatusIcons();
    addLog(`<span class="round-label">R${event.round}</span> <b>玛奇玛</b> 的四名眷属全部倒下，使玩家阵营存活单位眩晕一次行动。`, "log-enemy");
    return finish();
  }
  if (event.type === "steam-wave") {
    const giant = viewState.characters.find((character) => character.id === event.attackerId);
    const fighter = giant && document.querySelector(`[data-character="${giant.id}"]`);
    fighter?.style.setProperty("--steam-duration", `${playbackDelay(650, 325)}ms`);
    fighter?.classList.add("is-steam-casting");
    $("#battle-stamp").textContent = "蒸汽波！";
    $("#battle-stamp").className = "battle-stamp skill-stamp show";
    addLog(`<span class="round-label">R${event.round}</span> <b>超大型巨人</b> 释放 <span class="skill-name">蒸汽波</span>！`, "log-enemy");
    const completeWave = () => {
      for (const hit of event.hits) {
        const target = viewState.characters.find((character) => character.id === hit.targetId);
        if (!target) continue;
        target.currentHp = hit.hpAfter;
        target.alive = hit.hpAfter > 0;
        updateHealth(target);
        const targetEl = document.querySelector(`[data-character="${target.id}"]`);
        const number = targetEl?.querySelector(".damage-number");
        if (number) { number.textContent = `-${hit.actualDamage}`; number.classList.remove("pop"); void number.offsetWidth; number.classList.add("pop"); }
        if (hit.targetDied) {
          battleStatusState.bombs = battleStatusState.bombs.filter((bomb) => bomb.targetId !== target.id);
          if (target.id === "armored-titan") battleStatusState.armoredShield = null;
          targetEl?.classList.add("is-dead");
          const deathFrames = animationFrameNames(target, "death");
          if (targetEl && deathFrames.length) startFrameCycle(targetEl, target, "death", deathFrames, ANIMATION_TIMING.attack.deathMs / deathFrames.length, false);
        }
        addLog(`<b>${target.name}</b> 受到 ${hit.actualDamage} 点真实伤害${hit.targetDied ? "，倒下了" : ""}。`, hit.targetDied ? "log-death" : "log-enemy");
      }
      fighter?.classList.remove("is-steam-casting");
      fighter?.style.removeProperty("--steam-duration");
      $("#battle-stamp").classList.remove("show");
      renderAllyStatusIcons();
      finish();
    };
    timer = window.setTimeout(() => {
      timer = null;
      if (playbackPaused) pausedContinuation = completeWave;
      else completeWave();
    }, playbackDelay(650, 325));
    return;
  }
  if (event.type === "armor-shield-expired") {
    battleStatusState.armoredShield = null;
    renderAllyStatusIcons();
    addLog("<b>铠之巨人</b> 的减伤状态结束。", "log-enemy");
    return finish();
  }
  if (event.type === "bites-dust") {
    const actor = viewState.characters.find((character) => character.id === event.attackerId);
    if (actor) { actor.currentHp = event.hpAfter; actor.alive = event.hpAfter > 0; updateHealth(actor); }
    for (const bomb of battleStatusState.bombs) bomb.dueRound -= 1;
    renderAllyStatusIcons();
    addLog(`<b>${actor?.name ?? "吉良吉影"}</b> 使用 <span class="skill-name">败者食尘</span>：HP ${event.hpBefore} → ${event.hpAfter}${event.fallback ? "（暂无两回合前快照，保持当前 HP）" : `（回溯至第 ${event.snapshotRound} 回合）`}；${event.bombsAdvanced} 枚炸弹提前一回合。`, "log-enemy");
    const fighter = actor && document.querySelector(`[data-character="${actor.id}"]`);
    if (fighter && actor?.alive) showFighterFrame(fighter, actor, "skill1", "cast");
    timer = window.setTimeout(() => {
      timer = null;
      const complete = () => {
        if (fighter?.isConnected && actor?.alive) startIdleCycle(fighter, actor);
        finish();
      };
      if (playbackPaused) pausedContinuation = complete;
      else complete();
    }, 1000);
    return;
  }
  if (event.type === "bomb-explode") {
    const target = viewState.characters.find((character) => character.id === event.targetId);
    if (target) {
      target.currentHp = event.hpAfter; target.alive = event.hpAfter > 0;
      updateHealth(target);
      const fighter = document.querySelector(`[data-character="${target.id}"]`);
      const number = fighter?.querySelector(".damage-number");
      if (number) { number.textContent = `-${event.actualDamage}`; number.classList.remove("pop"); void number.offsetWidth; number.classList.add("pop"); }
      const burst = fighter?.querySelector(".impact-burst");
      if (burst) { burst.classList.remove("play", "melee-impact", "melee-from-right"); void burst.offsetWidth; burst.classList.add("play"); }
      if (event.targetDied && fighter) {
        clearSpriteFrame(fighter);
        fighter.classList.add("is-dead");
        const deathFrames = animationFrameNames(target, "death");
        if (deathFrames.length) startFrameCycle(fighter, target, "death", deathFrames, ANIMATION_TIMING.attack.deathMs / deathFrames.length, false);
      }
    }
    battleStatusState.bombs = battleStatusState.bombs.filter((bomb) => bomb.id !== event.bombId && (target?.alive || bomb.targetId !== event.targetId));
    renderAllyStatusIcons();
    addLog(`<b>杀手皇后</b> 炸弹 ${event.bombId} 引爆：${target?.name ?? event.targetId} 受到 ${event.actualDamage} 点伤害（本次无视 40% DEF）。`, "log-enemy");
    return finish();
  }
  if (event.type === "treasure-damage") {
    const target = viewState.characters.find((character) => character.id === event.targetId);
    const attacker = viewState.characters.find((character) => character.id === event.attackerId);
    if (target) {
      target.currentHp = event.hpAfter;
      target.alive = event.hpAfter > 0;
      target.shieldHp = event.targetShield;
      if (event.phaseChange) {
        target.borosPhase = event.phaseChange.phase;
        target.atk = event.phaseChange.atk;
        target.def = event.phaseChange.def;
        target.spd = event.phaseChange.spd;
        target.lifesteal = event.phaseChange.lifesteal;
        if (target.phaseAssets?.[target.borosPhase]) {
          target.asset = target.phaseAssets[target.borosPhase];
          document.querySelector(`[data-character="${target.id}"] .sprite`)?.setAttribute("src", target.asset);
        }
        battleStatusState.borosPhase = event.phaseChange.phase;
      }
      updateHealth(target);
      const fighter = document.querySelector(`[data-character="${target.id}"]`);
      const number = fighter?.querySelector(".damage-number");
      if (number && event.actualDamage > 0) {
        number.textContent = `-${event.actualDamage}`;
        number.classList.remove("is-heal", "pop");
        void number.offsetWidth;
        number.classList.add("pop");
      }
      if (event.targetDied && fighter) {
        window.clearTimeout(targetHitTimer);
        targetHitTimer = null;
        clearSpriteFrame(fighter);
        fighter.classList.remove("is-hit", "is-impact", "is-hit-stun", "is-hit-recoil");
        fighter.classList.add("is-dead");
        const frames = animationFrameNames(target, "death");
        if (frames.length) startFrameCycle(fighter, target, "death", frames, ANIMATION_TIMING.attack.deathMs / frames.length, false);
      }
      if (squadSide === "enemy") renderSquad();
      renderAllyStatusIcons();
    }
    addLog(`<b>${attacker?.name ?? "角色"}</b> 的日轮刀：以目标攻击前 ${event.basisHp} HP 计算，额外扣除 <b>${event.actualDamage}</b> HP（无视 DEF）${event.targetDied ? "，目标倒下" : ""}。`, "log-skill");
    timer = window.setTimeout(() => { timer = null; finish(); }, playbackDelay(280, 140));
    return;
  }
  if (event.type === "boros-round-speed" || event.type === "boros-round-growth") {
    const boss = viewState.characters.find((character) => character.id === event.targetId);
    if (boss && event.type === "boros-round-speed") boss.spd = event.effectiveSpd;
    if (boss && event.type === "boros-round-growth") boss.atk = event.effectiveAtk;
    if (squadSide === "enemy") renderSquad();
    addLog(event.type === "boros-round-speed"
      ? `<b>波罗斯</b> 阶段二每个完整回合 SPD +${event.speedBonus}（当前 ${event.effectiveSpd}）。`
      : `<b>波罗斯</b> 最终形态每回合 ATK +${event.attackBonus}（当前 ${event.effectiveAtk}）。`, "log-enemy");
    return finish();
  }
  if (event.type === "summon") {
    const summoned = { ...event.character };
    if (viewState.characters.some((character) => character.id === summoned.id)) return finish();
    if (summoned.tangSummonKind === "wukong") {
      for (const path of [summoned.animations?.charge?.frames?.charge,
        ...Object.values(summoned.animations?.skillAttack?.frames ?? {}),
        summoned.animations?.death?.frames?.down].filter(Boolean)) {
        if (summonFramePreloads.has(path)) continue;
        const image = new Image();
        image.decoding = "async";
        image.src = new URL(`./${path}`, import.meta.url).href;
        summonFramePreloads.set(path, image);
      }
    }
    viewState.characters.push(summoned);
    if (summoned.team === "enemy" && squadSide === "enemy") renderSquad();
    const row = document.createElement("div");
    row.className = "health-row";
    row.dataset.health = summoned.id;
    row.innerHTML = `<span class="health-name"></span><span class="health-track"><i class="health-fill ${summoned.team === "ally" ? "ally-fill" : "enemy-fill"}"></i></span><span class="health-value"><b class="current-hp"></b><small></small></span>`;
    row.querySelector(".health-name").textContent = summoned.name;
    row.querySelector(".health-value small").textContent = `/${summoned.maxHp}`;
    $(summoned.team === "ally" ? "#health-bars" : "#enemy-health-bars").append(row);
    const owner = viewState.characters.find((unit) => unit.id === event.summonerId);
    if (owner && event.tangAtkBonus) {
      owner.atk += event.tangAtkBonus;
      owner.tangRepeatedWukongAtkBonus = event.tangAtkBonus;
    }
    const ownerFighter = owner && document.querySelector(`[data-character="${owner.id}"]`);
    if (owner?.id === "makima" && ownerFighter) showFighterFrame(ownerFighter, owner, "hoverAttack", "cast");
    if (owner?.id === "tang") {
      showFighterFrame(ownerFighter, owner, "skill1", "cast");
      owner.visualMeditating = true;
      renderAllyStatusIcons();
    }
    const fighter = mountFighter(summoned);
    layoutBattleFormation(viewState.characters);
    updateHealth(summoned);
    const summonAura = owner?.id === "makima" || owner?.id === "tang" && summoned.tangSummonKind === "wukong"
      ? owner.summonAuraAsset : null;
    const duration = playbackDelay(950, 475);
    if (fighter && !summonAura) {
      fighter.style.setProperty("--summon-duration", `${duration}ms`);
      fighter.classList.add("is-summoning");
    }
    addLog(summoned.team === "ally"
      ? `<b>唐僧</b> 使用 <span class="skill-name">${event.skillName}</span>：召唤 ${summoned.name}。`
      : `<b>${owner?.name ?? "敌人"}</b> 触发被动 <span class="skill-name">${event.passiveName}</span>：第 ${event.round} 回合召唤 ${summoned.name}。`, summoned.team === "ally" ? "log-skill" : "log-enemy");
    const completeSummon = () => {
      if (fighter) {
        fighter.classList.remove("is-summoning");
        fighter.style.removeProperty("--summon-duration");
        startIdleCycle(fighter, summoned);
        if (owner?.id === "tang") startIdleCycle(ownerFighter, owner);
        if (owner?.id === "makima") startIdleCycle(ownerFighter, owner);
      }
      finish();
    };
    const advanceAfterSummon = () => {
      if (playbackPaused) pausedContinuation = completeSummon;
      else completeSummon();
    };
    if (summonAura) playSummonPortal(fighter, summonAura, summoned.tangSummonKind === "wukong" ? "wukong" : "makima", advanceAfterSummon);
    else timer = window.setTimeout(() => { timer = null; advanceAfterSummon(); }, duration);
    return;
  }
  if (event.type === "summon-failed") {
    const tang = viewState.characters.find((unit) => unit.id === event.summonerId);
    const fighter = tang && document.querySelector(`[data-character="${tang.id}"]`);
    if (fighter) showFighterFrame(fighter, tang, "skill1", "cast");
    addLog(`<b>唐僧</b> 尝试「取经之路」：${event.reason}，召唤失败。`, "log-skill");
    timer = window.setTimeout(() => { if (fighter) startIdleCycle(fighter, tang); timer = null; finish(); }, playbackDelay(440, 220));
    return;
  }
  if (event.type === "meditation-end" || event.type === "summon-dismissed") {
    const tang = viewState.characters.find((unit) => unit.id === event.summonerId);
    if (event.type === "meditation-end" && tang) {
      if (tang.tangRepeatedWukongAtkBonus) tang.atk -= tang.tangRepeatedWukongAtkBonus;
      tang.tangRepeatedWukongAtkBonus = 0;
      tang.visualMeditating = false;
      startIdleCycle(document.querySelector(`[data-character="${tang.id}"]`), tang);
      renderAllyStatusIcons();
    }
    if (event.type === "summon-dismissed") {
      const summon = viewState.characters.find((unit) => unit.id === event.targetId);
      if (summon) { summon.currentHp = 0; summon.alive = false; updateHealth(summon); }
      document.querySelector(`[data-character="${event.targetId}"]`)?.classList.add("is-dead");
    }
    return finish();
  }
  if (event.type === "wukong-charge") {
    addLog(`<b>孙悟空</b> 使用「天命人」蓄力：下个完整回合受到伤害减少 20%；唐僧 DEF +${event.defenseBonus}，持续 ${event.defenseDurationRounds} 回合。`, "log-skill");
    const summoner = viewState.characters.find((unit) => unit.id === event.summonerId);
    if (summoner) {
      summoner.wukongDefenseBuff = event.defenseBonus;
      summoner.wukongDefenseBuffUntilRound = event.defenseUntilRound;
    }
    const actor = viewState.characters.find((unit) => unit.id === event.attackerId);
    const fighter = document.querySelector(`[data-character="${event.attackerId}"]`);
    if (fighter && actor) showFighterFrame(fighter, actor, "charge", "charge");
    timer = window.setTimeout(() => {
      timer = null;
      if (fighter && actor?.alive) { clearSpriteFrame(fighter); startIdleCycle(fighter, actor); }
      if (playbackPaused) pausedContinuation = finish;
      else finish();
    }, playbackDelay(500, 250));
    return;
  }
  if (event.type === "skill-guarantee") {
    addLog(`<b>命运石之门</b>：下一场战斗中技能 <span class="skill-name">${event.skillName}</span> 的触发率提升至 100%。`, "log-skill");
    return finish();
  }
  if (event.type === "elite-passive-trigger") {
    const actor = viewState.characters.find((character) => character.id === event.attackerId);
    const fighter = actor && document.querySelector(`[data-character="${actor.id}"]`);
    const banner = document.createElement("div");
    banner.className = "elite-domain-banner";
    banner.setAttribute("aria-hidden", "true");
    banner.textContent = "领域展开";
    document.querySelector(".arena")?.append(banner);
    if (fighter) {
      // Hold the authored first form briefly, then reveal the domain form.
      clearSpriteFrame(fighter);
      showFighterFrame(fighter, actor, "idle", "idle");
    }
    addLog(`<b>${actor?.name ?? "真人"}</b> 被动 <span class="skill-name">自闭圆顿裹</span>触发：领域展开！本回合 ATK +${event.attackBonus}（当前 ${event.effectiveAtk}）。`, "log-enemy");
    const domainDuration = playbackDelay(ANIMATION_TIMING.elite.domainDurationMs);
    const revealDelay = playbackDelay(ANIMATION_TIMING.elite.domainRevealDelayMs);
    banner.style.setProperty("--domain-banner-duration", `${domainDuration}ms`);
    if (fighter) {
      animationStageTimer = window.setTimeout(() => {
        animationStageTimer = null;
        fighter.classList.add("is-domain-active");
        showFighterFrame(fighter, actor, "domain", "domain");
      }, revealDelay);
    }
    const completeDomain = () => {
      banner.remove();
      if (fighter) {
        fighter.classList.remove("is-domain-active");
        const domainAsset = actor.animations?.domain?.frames?.domain;
        if (domainAsset) {
          actor.visualDomainActive = true;
          actor.asset = domainAsset;
          const baseSprite = fighter.querySelector(".sprite");
          if (baseSprite) {
            baseSprite.src = domainAsset;
            baseSprite.alt = `像素${actor.name}领域形态`;
          }
          showFighterFrame(fighter, actor, "domain", "domain");
        }
      }
      finish();
    };
    timer = window.setTimeout(() => {
      timer = null;
      if (playbackPaused) pausedContinuation = completeDomain;
      else completeDomain();
    }, domainDuration);
    return;
  }
  if (event.type === "elite-passive-growth") {
    const actor = viewState.characters.find((character) => character.id === event.attackerId);
    if (actor) actor.atk = event.effectiveAtk;
    if (squadSide === "enemy") renderSquad();
    addLog(`<b>${actor?.name ?? "真人"}</b> 的自闭圆顿裹持续增强：本回合 ATK +${event.attackBonus}（当前 ${event.effectiveAtk}）。`, "log-enemy");
    return finish();
  }
  if (event.type === "elite-escape") {
    const target = viewState.characters.find((character) => character.id === event.targetId);
    const fighter = target && document.querySelector(`[data-character="${target.id}"]`);
    if (fighter && target) {
      startFrameCycle(fighter, target, "death", ["escape"], 0, false);
      fighter.style.setProperty("--elite-escape-duration", `${ANIMATION_TIMING.elite.bombEscapeDurationMs}ms`);
      fighter.classList.add("is-elite-escape");
    }
    addLog(`<b>${event.name}</b> 化作残影，从战场右侧逃离。`, "log-death");
    const finishEscape = () => {
      if (fighter) {
        fighter.classList.remove("is-elite-escape");
        fighter.classList.add("has-escaped");
        fighter.style.removeProperty("--elite-escape-duration");
      }
      finish();
    };
    timer = window.setTimeout(() => {
      timer = null;
      if (playbackPaused) pausedContinuation = finishEscape;
      else finishEscape();
    }, ANIMATION_TIMING.elite.bombEscapeDurationMs);
    return;
  }
  if (event.type === "c0-charge") {
    if (battleStatusState.c0) {
      battleStatusState.c0.completedRounds = event.completedRounds;
      battleStatusState.c0.accumulatedDamage = event.accumulatedDamage;
      renderAllyStatusIcons();
    }
    addLog(`<b>迪达拉</b> 的 C0 正在蓄积：已完成 ${event.completedRounds} 个完整行动回合，累计 ${event.accumulatedDamage} 点真实伤害。`, "log-enemy");
    return finish();
  }
  if (event.type === "c0-detonate") {
    if (battleStatusState.c0) {
      battleStatusState.c0.completedRounds = event.completedRounds;
      battleStatusState.c0.accumulatedDamage = event.damage;
      battleStatusState.c0.warning = true;
      renderAllyStatusIcons();
    }
    $("#battle-stamp").textContent = "迪达拉倒下了！C0 终极艺术即将引爆！";
    $("#battle-stamp").className = "battle-stamp skill-stamp c0-warning show";
    const deidara = viewState.characters.find((character) => character.name === "迪达拉");
    const deidaraEl = deidara && document.querySelector(`[data-character="${deidara.id}"]`);
    const c0Frames = animationFrameNames(deidara, "skill2");
    if (deidaraEl && c0Frames.length) {
      deidaraEl.classList.add("is-c0-detonating");
      const warningDuration = playbackDelay(ANIMATION_TIMING.boss.c0WarningMs);
      startFrameCycle(deidaraEl, deidara, "skill2", c0Frames, warningDuration / c0Frames.length, false);
    }
    addLog(`<b>迪达拉倒下了，但遗留的 C0 正在引爆！</b> 即将受到 ${event.damage} 点真实伤害，请留意最终结算。`, "log-enemy");
    const resolveDetonation = () => {
      if (battleStatusState.c0) {
        battleStatusState.c0.warning = false;
        battleStatusState.c0.detonated = true;
        renderAllyStatusIcons();
      }
      const explosion = document.createElement("div");
      explosion.className = "c0-explosion-overlay";
      explosion.setAttribute("aria-hidden", "true");
      ["skill2_3.png", "skill2_4.png"].forEach((frame, index) => {
        const image = document.createElement("img");
        image.className = `c0-explosion-frame ${index === 0 ? "frame-three" : "frame-four"}`;
        image.alt = "";
        image.src = `assets/deidara-v2/skill2/${frame}`;
        explosion.append(image);
      });
      const title = document.createElement("div");
      title.className = "c0-explosion-title";
      title.textContent = "C0 · 终极艺术";
      explosion.append(title);
      document.body.append(explosion);
      const completeExplosion = () => {
        explosion.remove();
        for (const result of event.targets ?? []) {
          const target = viewState.characters.find((character) => character.id === result.targetId);
          if (!target) continue;
          if (result.hpAfter <= 0) document.querySelector(`[data-character="${target.id}"]`)?.style.setProperty("--death-duration", `${ANIMATION_TIMING.boss.defeatFallMs}ms`);
          target.currentHp = result.hpAfter;
          target.shieldHp = result.targetShield;
          target.alive = result.hpAfter > 0;
          updateHealth(target);
          const fighter = document.querySelector(`[data-character="${target.id}"]`);
          const number = fighter?.querySelector(".damage-number");
          if (number && (result.actualDamage > 0 || result.shieldAbsorbed > 0)) {
            number.textContent = result.actualDamage > 0 ? `-${result.actualDamage}` : `护盾 -${result.shieldAbsorbed}`;
            number.classList.remove("is-heal", "pop");
            void number.offsetWidth;
            number.classList.add("pop");
          }
          const burst = fighter?.querySelector(".impact-burst");
          if (burst && (result.actualDamage > 0 || result.shieldAbsorbed > 0)) {
            burst.classList.remove("play");
            void burst.offsetWidth;
            burst.classList.add("play");
          }
        }
        $("#battle-stamp").textContent = "C0 引爆！";
        $("#battle-stamp").className = "battle-stamp skill-stamp show";
        addLog(`<b>C0 终极艺术引爆！</b> 每名存活角色承受 ${event.damage} 点真实伤害（${event.completedRounds} 个完整回合）。${(event.targets ?? []).map((result) => `${viewState.characters.find((unit) => unit.id === result.targetId)?.name ?? result.targetId} HP ${result.hpBefore} → ${result.hpAfter}${result.shieldAbsorbed ? `（护盾吸收 ${result.shieldAbsorbed}）` : ""}`).join("；")}。`, "log-death");
        finish();
      };
      timer = window.setTimeout(() => {
        timer = null;
        if (playbackPaused) pausedContinuation = completeExplosion;
        else completeExplosion();
      }, ANIMATION_TIMING.boss.c0ExplosionMs);
    };
    timer = window.setTimeout(() => {
      timer = null;
      if (playbackPaused) pausedContinuation = resolveDetonation;
      else resolveDetonation();
    }, playbackDelay(ANIMATION_TIMING.boss.c0WarningMs));
    return;
  }
  if (event.type === "battle-end") {
    document.querySelectorAll(".colossal-battle-smoke, .gilgamesh-visual").forEach((node) => node.remove());
    const win = event.outcome === "victory";
    const player = pendingResult.finalCharacters.find((character) => character.team === "ally");
    const speedBeforeSettlement = campaign.runCharacterState?.spd ?? 0;
    const transition = finishBattle(campaign, pendingResult.outcome, player.currentHp, pendingResult.events, pendingResult.finalCharacters);
    if (!transition) return finish();
    if (campaign.lastEssenceReward?.amount) addLog(`精华 +${campaign.lastEssenceReward.amount} · 当前 ×${campaign.essence}`, "log-win");
    for (const recovery of campaign.lastBattleRecovery ?? []) {
      const unit = viewState.characters.find((character) => character.id === recovery.characterId && character.team === "ally");
      if (unit) {
        unit.currentHp = recovery.currentHp;
        unit.alive = recovery.currentHp > 0;
        updateHealth(unit);
        const fighter = document.querySelector(`[data-character="${unit.id}"]`);
        if (fighter && unit.alive) {
          fighter.classList.remove("is-dead");
          clearSpriteFrame(fighter);
          startIdleCycle(fighter, unit);
        }
      }
      if (recovery.restored > 0) addLog(`<b>${unit?.name ?? recovery.characterId}</b> ${recovery.kind === "revive" ? "战后重新站起" : recovery.kind === "trial_quarter_heal" ? "试炼小关完成" : recovery.kind === "trial_failure_heal" ? "试炼小关失败后恢复" : "大天使的气息"}：HP +${recovery.restored}。`, "log-skill");
    }
    const rasenganSpeedGain = (campaign.runCharacterState?.spd ?? speedBeforeSettlement) - speedBeforeSettlement;
    if (rasenganSpeedGain > 0) addLog(`螺旋丸击杀 · <b>本局 SPD +${rasenganSpeedGain}</b>`, "log-skill");
    updateProgressionDisplays();
    setStatus(win ? "战斗胜利" : transition?.trialOutcome === "failed" ? "试炼失败" : transition?.trialOutcome === "retry" ? "试炼小关失败，继续挑战" : "战斗失败", "finished");
    setBattleControls(false);
    $("#battle-stamp").textContent = win ? "胜利！" : transition?.trialOutcome === "retry" ? "小关失败" : "战斗失败";
    $("#battle-stamp").classList.add("show", win ? "stamp-win" : "stamp-lose");
    addLog(win ? `第 ${campaign.battleNumber} 场 · <b>胜利</b>` : transition?.trialOutcome === "failed"
      ? `第 ${campaign.battleNumber} 场 · <b>试炼失败，返回第三关</b>`
      : transition?.trialOutcome === "retry"
        ? `第 ${campaign.battleNumber} 场 · <b>小关失败，队伍恢复 50% 最大 HP，继续选择剩余试炼</b>`
        : `第 ${campaign.battleNumber} 场 · <b>战败，本局结束</b>`, win ? "log-win" : "log-death");
    const normalHoldMs = playbackDelay(ANIMATION_TIMING.attack.resultHoldMs);
    const defeatHoldMs = playbackDelay(ANIMATION_TIMING.boss.defeatHoldMs);
    if (!win) {
      const deidara = viewState.characters.find((character) => character.name === "迪达拉" && character.alive);
      const deidaraEl = deidara && document.querySelector(`[data-character="${deidara.id}"]`);
      const victoryFrames = animationFrameNames(deidara, "victory");
      if (deidaraEl && victoryFrames.length) startFrameCycle(deidaraEl, deidara, "victory", victoryFrames, defeatHoldMs / victoryFrames.length, false);
    }
    let transitionApplied = false;
    const applyBattleTransition = () => {
      if (transitionApplied || !transition || !["settlement", "reward", "trial_next_battle", "trial_route", "trial_result"].includes(transition.status)) return;
      transitionApplied = true;
      playback = null;
      pendingResult = null;
      battleStartPhase = "idle";
      setBattleControls(false);
      if (transition.status === "trial_next_battle") beginBattle();
      else if (transition.status === "trial_route") renderTrialMap();
      else if (transition.status === "trial_result") renderTrialResult();
      else if (transition.status === "reward") renderBattleReward();
      else {
        completeSettlement(campaign);
        if (campaign.status === "stage_transition") renderStageTransition();
        else renderEnding();
      }
    };
    timer = window.setTimeout(() => {
      timer = null;
      if (playbackPaused) pausedContinuation = applyBattleTransition;
      else applyBattleTransition();
    }, win ? normalHoldMs : defeatHoldMs);
    return;
  }
  if (event.type === "skill") {
    const actor = viewState.characters.find((character) => character.id === event.attackerId);
    if (event.effectType === "next-round-reduction") {
      battleStatusState.armoredShield = { startRound: event.effectiveFromRound, untilRound: event.effectiveUntilRound };
      const fighter = document.querySelector('[data-character="armored-titan"]');
      if (fighter) { fighter.dataset.armorPoseRound = String(event.round); showFighterFrame(fighter, actor, "skill1", "hold"); }
      renderAllyStatusIcons();
      addLog(`<b>${actor?.name ?? "铠之巨人"}</b> 释放 <span class="skill-name">${event.skillName}</span>：第 ${event.effectiveFromRound}–${event.effectiveUntilRound} 回合减伤 25%。`, "log-skill");
      timer = window.setTimeout(() => {
        timer = null;
        if (playbackPaused) pausedContinuation = finish;
        else finish();
      }, playbackDelay(640, 320));
      return;
    }
    if (event.effectType === "hardening") {
      if (actor) { actor.defenseBuff = (actor.defenseBuff ?? 0) + event.defenseBonus; actor.currentHp = event.targetHp; updateHealth(actor); }
      addLog(`<b>${actor?.name ?? "艾伦"}</b> 硬质化：DEF +${event.defenseBonus}（${event.defenseStacks}/4 层），接下来两回合反伤${event.healedAmount ? `；恢复 ${event.healedAmount} HP` : ""}。`, "log-skill");
      if (actor?.evolutionPhase === 2) {
        const fighter = document.querySelector(`[data-character="${actor.id}"]`);
        if (fighter) showFighterFrame(fighter, actor, "hardening", "cast");
        timer = window.setTimeout(() => { timer = null; if (fighter) startIdleCycle(fighter, actor); finish(); }, playbackDelay(650, 325));
        return;
      }
    } else addLog(`<b>${actor?.name ?? "角色"}</b> 触发 <span class="skill-name">${event.skillName}</span>，防御提高 ${event.defenseBonus}。`, "log-skill");
    return finish();
  }
  if (event.type === "evolution-clone-gain") {
    const actor = viewState.characters.find((unit) => unit.id === event.attackerId);
    if (actor) actor.chakraClones = event.count;
    addLog(`<b>${actor?.name ?? "鸣人"}</b> 获得 ${event.gained ?? 1} 个影分身，当前 ${event.count} 个。`, "log-skill");
    return finish();
  }
  if (event.type === "evolution-dharma") {
    for (const change of event.changes) {
      const unit = viewState.characters.find((item) => item.id === change.targetId);
      if (!unit) continue;
      unit.atk += change.attackChange ?? 0;
      if (Number.isFinite(change.shieldHp)) unit.shieldHp = change.shieldHp;
      updateHealth(unit);
    }
    addLog(`<b>唐僧</b> 打坐满四回合，发动 <span class="skill-name">无量佛法</span>。`, "log-skill");
    const tang = viewState.characters.find((unit) => unit.id === event.attackerId);
    const fighter = tang && document.querySelector(`[data-character="${tang.id}"]`);
    if (fighter && tang?.evolutionPhase === 2) {
      showFighterFrame(fighter, tang, "skill1", "cast");
      timer = window.setTimeout(() => { timer = null; startIdleCycle(fighter, tang); finish(); }, playbackDelay(520, 260));
      return;
    }
    return finish();
  }
  if (event.type === "passive-trigger") {
    const actor = viewState.characters.find((character) => character.id === event.attackerId);
    if (event.skillId === "jinchuriki") {
      battleStatusState.jinchuriki = { originalAtk: event.originalAtk, effectiveAtk: event.effectiveAtk, attackBonus: event.attackBonus };
      renderAllyStatusIcons();
    }
    addLog(`<b>${actor?.name ?? "角色"}</b> 被动 <span class="skill-name">${event.skillName}</span> 生效：ATK ${event.originalAtk} → ${event.effectiveAtk}（+${Math.round((event.attackBonus ?? .25) * 100)}%）。`, "log-skill");
    return finish();
  }
  if (["odin-mimir", "trial-freeze", "trial-control-skip", "trial-delayed-hit", "trial-dot",
       "ah-fu-steal", "ah-fu-return", "ah-fu-escape"].includes(event.type)) {
    const target = viewState.characters.find((unit) => unit.id === event.targetId);
    const actor = viewState.characters.find((unit) => unit.id === event.attackerId)
      ?? (event.type === "odin-mimir" ? viewState.characters.find((unit) => unit.id === "odin") : null);
    if (event.type === "odin-mimir") {
      const label = { maxHp: "最大 HP", atk: "ATK", def: "DEF", spd: "SPD" }[event.stat] ?? event.stat;
      addLog(`<b>奥丁</b> 看穿了 ${target?.name ?? "目标"}：选择最多的加点属性 ${label} 在本场减半。`, "log-enemy");
      const fighter = document.querySelector('[data-character="odin"]');
      if (fighter && actor) {
        showFighterFrame(fighter, actor, "passive1", "trigger");
        timer = window.setTimeout(() => { timer = null; startIdleCycle(fighter, actor); finish(); }, playbackDelay(700, 350));
        return;
      }
    } else if (event.type === "trial-freeze") {
      if (target) { target.spd = event.effectiveSpd; target.frozenThroughRound = event.throughRound; updateHealth(target); renderAllyStatusIcons(); }
      addLog(`<b>艾斯德斯</b> 冻结 ${target?.name ?? "目标"} 两回合，SPD -${event.speedLoss}。`, "log-enemy");
    } else if (event.type === "trial-control-skip") {
      if (target && event.reason === "眩晕") { target.stunNextAction = false; renderAllyStatusIcons(); }
      addLog(`<span class="round-label">R${event.round}</span> <b>${target?.name ?? "目标"}</b> 因${event.reason}无法行动。`, "log-enemy");
    } else if (event.type === "ah-fu-steal" || event.type === "ah-fu-return") {
      if (target && Number.isFinite(event.targetDef)) { target.def = event.targetDef; updateHealth(target); }
      if (actor && Number.isFinite(event.attackerDef)) { actor.def = event.attackerDef; updateHealth(actor); }
      addLog(event.type === "ah-fu-steal"
        ? `<b>娜美</b> 偷走 ${target?.name ?? "目标"} ${event.amount} 点 DEF。`
        : `<b>娜美</b> 被击败，归还 ${target?.name ?? "目标"} ${event.amount} 点 DEF。`, "log-enemy");
    } else if (event.type === "ah-fu-escape") {
      if (actor) { actor.currentHp = 0; actor.alive = false; updateHealth(actor); }
      document.querySelector(`[data-character="${event.attackerId}"]`)?.classList.add("is-dead");
      addLog(`<b>娜美</b> 逃离战斗；偷走的 ${event.amount} 点 DEF 不再归还。`, "log-enemy");
    } else if (target) {
      target.currentHp = event.hpAfter;
      target.alive = event.hpAfter > 0;
      updateHealth(target);
      const fighter = document.querySelector(`[data-character="${target.id}"]`);
      const number = fighter?.querySelector(".damage-number");
      if (number && event.damage > 0) {
        number.textContent = `-${event.damage}`;
        number.classList.remove("is-heal", "pop");
        void number.offsetWidth;
        number.classList.add("pop");
      }
      if (event.targetDied) fighter?.classList.add("is-dead");
      if (event.type === "trial-dot") renderAllyStatusIcons();
      addLog(`<span class="round-label">R${event.round}</span> <b>${target.name}</b> ${event.type === "trial-dot" ? event.name : "延迟伤害"}：HP -${event.damage}。`, "log-enemy");
    }
    return finish();
  }
  if (event.type !== "attack") return finish();
  if (event.type === "attack" && (event.splash || event.chakraBurst)) {
    const splashTarget = viewState.characters.find((unit) => unit.id === event.targetId);
    if (splashTarget) {
      splashTarget.currentHp = event.targetHp;
      splashTarget.alive = event.targetHp > 0;
      updateHealth(splashTarget);
      const fighter = document.querySelector(`[data-character="${splashTarget.id}"]`);
      const number = fighter?.querySelector(".damage-number");
      if (number) { number.textContent = event.dodged ? "闪避" : `-${event.actualDamage}`; number.classList.remove("pop"); void number.offsetWidth; number.classList.add("pop"); }
      if (event.targetDied) fighter?.classList.add("is-dead");
      addLog(event.chakraBurst
        ? `<b>超大玉螺旋丸</b> 追加命中 ${splashTarget.name}，造成 ${event.actualDamage} 点伤害${event.stunApplied ? "并使其眩晕" : ""}。`
        : `<b>影分身</b> 扩散命中 ${splashTarget.name}${event.dodged ? "，被闪避" : `，造成 ${event.actualDamage} 点伤害`}。`, "log-skill");
      for (const heal of event.scorpionHeals ?? []) {
        const ally = viewState.characters.find((unit) => unit.id === heal.targetId);
        if (ally) { ally.currentHp = heal.currentHp; updateHealth(ally); }
      }
    }
    timer = window.setTimeout(() => { timer = null; finish(); }, playbackDelay(220, 120));
    return;
  }
  const attacker = viewState.characters.find((c) => c.id === event.attackerId);
  const target = viewState.characters.find((c) => c.id === event.targetId);
  if (!attacker || !target) return finish();
  const sourceEl = document.querySelector(`[data-character="${attacker.id}"]`);
  const targetEl = document.querySelector(`[data-character="${target.id}"]`);
  if (!sourceEl || !targetEl) return finish();
  const sourceSide = attacker.team === "ally" ? "ally" : "enemy";
  const cloneText = event.skillId === "shadow-clone-rush" ? ` Lv.${event.skillLevel}（${event.skillCloneCount} 个分身，${event.skillMultiplier.toFixed(1)}×）` : "";
  const actionText = event.skilled ? `<span class="skill-name">${event.skillName}${cloneText}</span>` : "普通攻击";
  const resultText = event.dodged ? '<span class="dodge-text">闪避</span>' : event.trialDamage?.pathsImmune ? '<span class="dodge-text">道路免疫首次伤害</span>' : event.trialDamage?.delayedDamage ? '<span class="skill-name">伤害延迟三回合</span>' : event.passiveTriggered?.damageImmune ? '<span class="dodge-text">被动免疫</span>' : `${event.critical ? '<b class="critical-text">暴击</b> ' : ""}<span class="damage-text">-${event.damage}</span>${event.trialDamage?.odinReduction != null ? ` <span class="skill-name">福金与雾尼减伤 ${Math.round(event.trialDamage.odinReduction * 100)}%</span>` : ""}`;
  const timings = ANIMATION_TIMING.attack;
  const playbackMultiplier = playbackRate();
  const scaled = (ms) => Math.max(40, Math.round(ms / playbackMultiplier));
  sourceEl.style.setProperty("--skill-duration", `${scaled(560)}ms`);
  targetEl.style.setProperty("--hit-duration", `${scaled(380)}ms`);
  targetEl.style.setProperty("--hit-shake-duration", `${scaled(110)}ms`);
  targetEl.style.setProperty("--dodge-duration", `${scaled(300)}ms`);
  targetEl.style.setProperty("--impact-fx-duration", `${scaled(event.attackType === "melee" ? 260 : 340)}ms`);
  if (event.skilled) {
    sourceEl.classList.add("is-casting");
    const stamp = $("#battle-stamp");
    stamp.textContent = event.skillName;
    stamp.className = "battle-stamp skill-stamp show";
    window.clearTimeout(effectTimer);
    effectTimer = window.setTimeout(() => {
      stamp.classList.remove("show");
      effectTimer = null;
    }, scaled(520));
  }

  const isBorosPunch = attacker.id === "boros" && attacker.borosPhase === 1 && !event.skilled;
  const isKiraPunch = attacker.id === "kira" && !event.skilled;
  const presentationId = attacker.mimicSourceId ?? attacker.id;
  const isErenWarhammer = presentationId === "eren" && attacker.evolutionPhase === 2 && event.skillId === "eren-warhammer";
  const isShinHammer = attacker.id === "shin" && event.skillId === "shin-strike";
  const isDefaultFrontApproach = attacker.team === "enemy" && attacker.row === "front" && !event.skilled && !isBorosPunch && !isKiraPunch;
  const isMelee = !isErenWarhammer && !isShinHammer && ((event.attackType === "melee" && !(attacker.team === "enemy" && attacker.row === "back")) || isDefaultFrontApproach);
  const actionTiming = isMelee ? timings.melee : event.attackType === "magic" ? timings.magic : timings.ranged;
  const skillAnimationName = event.skilled ? attacker.skillAnimationMap?.[event.skillId] : null;
  const skillAnimationFrames = skillAnimationName ? animationFrameNames(attacker, skillAnimationName) : [];
  const borosTimeline = attacker.id === "boros"
    ? cinematicTimeline(attacker.skillVisualTimelines?.[skillAnimationName], skillAnimationName === "cannon"
      ? ["chargeMs", "beamMs", "impactMs", "totalMs"] : []) : null;
  const gilTimeline = attacker.id === "gilgamesh" && event.gilgameshCast !== 3
    ? cinematicTimeline(attacker.skillVisualTimelines?.[skillAnimationName], ["chargeMs", "launchMs", "fallMs", "impactMs", "totalMs"]) : null;
  const firstGilVisual = !!gilTimeline && event.skillCastId !== lastGilgameshVisualCastId;
  if (firstGilVisual) lastGilgameshVisualCastId = event.skillCastId;
  const firstBorosVisual = !!borosTimeline && event.skillCastId !== lastBorosVisualCastId;
  if (firstBorosVisual) lastBorosVisualCastId = event.skillCastId;
  const authoredSkillDurations = attacker.animations?.[skillAnimationName]?.durationsMs;
  const isBombDemonSkill = event.skillId === "bomb-demon-boom";
  const isCloneTechnique = isMelee && event.skillId === "shadow-clone-rush" && skillAnimationFrames.length > 1;
  const isErenSkill = isMelee && presentationId === "eren" && ["eren-free-will", "eren-tatakae"].includes(event.skillId) && skillAnimationFrames.length > 1;
  const isKanekiPredator = isMelee && presentationId === "kaneki" && event.skillId === "kaneki-predator" && skillAnimationFrames.length === 3;
  const isKanekiNormal = isMelee && presentationId === "kaneki" && attacker.evolutionPhase !== 2 && !event.skilled;
  const isQuanxiStrike = isMelee && attacker.id === "quanxi";
  const authoredDash = isMelee && ({
    "naruto-multi-clone": { cast: "first", second: "second", move: "rush", hit: "rush" },
    "naruto-giant-rasengan": { cast: "charge", move: "approach", hit: "impact" },
    "kaneki-glutton": { cast: "cast", move: "dash", hit: "dash" },
    "heracles-nine-heads": { cast: "charge", move: "charge", hit: "strike" },
    "arima-pierce": { cast: "charge", move: "thrust", hit: "thrust" },
  })[event.skillId];
  const dashTimeline = authoredDash ? attacker.skillVisualTimelines?.[event.skillId] : null;
  const isOdinProjectile = attacker.id === "odin" && event.skillId === "odin-gungnir";
  const dashCastMs = dashTimeline?.castMs ?? 350;
  const dashSecondFrameMs = dashTimeline?.secondFrameMs ?? 180;
  const dashMoveMs = dashTimeline?.moveMs ?? 450;
  const dashHoldMs = dashTimeline?.holdMs ?? 270;
  const dashReturnMs = dashTimeline?.returnMs ?? actionTiming.recoveryMs;
  const isTojiCombo = isMelee && attacker.id === "toji" && event.segmentCount > 1;
  const tojiFirst = isTojiCombo && event.segmentIndex === 1;
  const tojiLast = isTojiCombo && (event.segmentIndex === event.segmentCount || event.targetDied);
  const tojiRushMs = 430;
  const tojiSegmentMs = isTojiCombo ? 1000 / event.segmentCount : 470;
  const tojiWindupMs = Math.round(tojiSegmentMs / 2);
  const tojiPunchMs = tojiSegmentMs - tojiWindupMs;
  const tojiReturnMs = 390;
  const kanekiTiming = attacker.animationTiming;
  if (isErenSkill) sourceEl.classList.add("is-skill-posing");
  const isDeidaraBirdSkill = event.skillId === "c4-garuda" && skillAnimationFrames.length > 2;
  const skillSlowdown = isBombDemonSkill ? 1 : timings.skillAnimationSlowdownMultiplier;
  const cloneSealMs = isCloneTechnique && Array.isArray(authoredSkillDurations)
    ? authoredSkillDurations[0] * skillSlowdown
    : 0;
  const cloneApproachMs = isCloneTechnique && Array.isArray(authoredSkillDurations)
    ? authoredSkillDurations.slice(1, skillAnimationFrames.length).reduce((total, duration) => total + duration, 0) * skillSlowdown
    : 0;
  const skillActionMs = skillAnimationFrames.length
    ? (Array.isArray(authoredSkillDurations)
      ? authoredSkillDurations.slice(0, skillAnimationFrames.length).reduce((total, duration) => total + duration, 0) * (isKanekiPredator ? 1 : timings.skillAnimationSlowdownMultiplier)
      : actionTiming.actionMs * skillSlowdown)
    : 0;
  const erenWindupMs = isErenSkill && Array.isArray(authoredSkillDurations) ? authoredSkillDurations[0] * skillSlowdown : 0;
  const erenFollowThroughMs = isErenSkill && Array.isArray(authoredSkillDurations) ? authoredSkillDurations.slice(1).reduce((total, durationMs) => total + durationMs, 0) * skillSlowdown : 0;
  const meleePunchMs = skillActionMs || actionTiming.punchMs;
  const actionDuration = isMelee
    ? isQuanxiStrike ? 850 : authoredDash ? dashCastMs + dashMoveMs + (dashTimeline ? 70 : authoredDash.second ? 70 : 0) + dashHoldMs + dashReturnMs
    : isTojiCombo
      ? (tojiFirst ? tojiRushMs : 0) + tojiWindupMs + tojiPunchMs + (tojiLast ? tojiReturnMs : 0)
    : isKanekiPredator
      ? kanekiTiming.predator.launchMs + kanekiTiming.predator.strikeMs + kanekiTiming.predator.retreatMs
      : isKanekiNormal
        ? kanekiTiming.normalAttack.approachMs + kanekiTiming.normalAttack.totalMs + kanekiTiming.normalAttack.returnMs
      : isCloneTechnique
      ? cloneSealMs + cloneApproachMs + actionTiming.punchMs + actionTiming.recoveryMs
      : isErenSkill
        ? erenWindupMs + actionTiming.rushMs + erenFollowThroughMs + actionTiming.recoveryMs
      : actionTiming.rushMs + meleePunchMs + actionTiming.recoveryMs
    : isErenWarhammer ? 1050 : isShinHammer ? 1180 : isOdinProjectile ? 920 : event.skilled && skillAnimationFrames.length ? skillActionMs : actionTiming.actionMs;
  const borosVisualDuration = skillAnimationName === "meteor"
    ? borosTimeline?.takeoffMs + borosTimeline?.dashMs + borosTimeline?.slamMs + borosTimeline?.returnMs
    : borosTimeline?.totalMs;
  const duration = event.wukongTeleportAttack ? scaled(650) : gilTimeline ? firstGilVisual ? gilTimeline.totalMs : 0 : isBorosPunch ? scaled(1500) : isKiraPunch ? scaled(700) : borosTimeline ? firstBorosVisual
    ? skillAnimationName === "cannon" ? borosVisualDuration : scaled(borosVisualDuration)
    : 0 : scaled(actionDuration);
  const impactDelay = isQuanxiStrike ? scaled(450) : authoredDash ? scaled(dashCastMs + dashMoveMs + 70) : isErenWarhammer ? scaled(680) : isShinHammer ? scaled(1020) : isOdinProjectile ? scaled(780) : event.wukongTeleportAttack ? scaled(340) : gilTimeline ? firstGilVisual ? gilTimeline.impactMs : 0 : isBorosPunch ? scaled(650) : isKiraPunch ? scaled(360) : isTojiCombo ? scaled((tojiFirst ? tojiRushMs : 0) + tojiWindupMs) : borosTimeline ? firstBorosVisual
    ? skillAnimationName === "cannon" ? borosTimeline.impactMs : scaled(borosTimeline.impactMs)
    : 0 : scaled(isCloneTechnique
    ? cloneSealMs + cloneApproachMs
    : isKanekiPredator ? kanekiTiming.predator.impactMs
    : isKanekiNormal ? kanekiTiming.normalAttack.approachMs + kanekiTiming.normalAttack.impactMs
    : isErenSkill ? erenWindupMs + actionTiming.rushMs + erenFollowThroughMs
      : isBombDemonSkill ? skillActionMs
      : isDeidaraBirdSkill ? skillActionMs * 0.5 + 800
      : isMelee ? actionTiming.rushMs : Math.round(actionTiming.actionMs * 0.48));
  const eventGap = borosTimeline || isTojiCombo ? 0 : scaled(timings.eventGapMs);
  sourceEl.style.setProperty("--attack-duration", `${duration}ms`);
  sourceEl.style.setProperty("--impact-duration", `${scaled(isMelee ? meleePunchMs : actionTiming.actionMs * 0.5)}ms`);
  let kiraStand = null;
  let trialProjectile = null;
  let shinHammer = null;
  let warhammerStrike = null;
  if (isQuanxiStrike) {
    showFighterFrame(sourceEl, attacker, "meleeAttack", "flash");
  } else if (authoredDash) {
    showFighterFrame(sourceEl, attacker, skillAnimationName, authoredDash.cast);
    if (authoredDash.second) scheduleBorosVisual(() =>
      showFighterFrame(sourceEl, attacker, skillAnimationName, authoredDash.second), scaled(dashSecondFrameMs));
  } else if (isKanekiPredator) {
    showFighterFrame(sourceEl, attacker, "predator", "launch");
  } else if (isKanekiNormal) {
    startRunCycle(sourceEl, attacker, 120, playbackMultiplier);
  } else if (isCloneTechnique) {
    showFighterFrame(sourceEl, attacker, skillAnimationName, skillAnimationFrames[0]);
  } else if (isErenSkill) {
    showFighterFrame(sourceEl, attacker, skillAnimationName, skillAnimationFrames[0]);
  } else if (isMelee && (!isTojiCombo || tojiFirst)) {
    startRunCycle(sourceEl, attacker, actionTiming.runFrameMs, playbackMultiplier);
  }
  if (isMelee) {
    const sourceBox = sourceEl.getBoundingClientRect();
    const targetBox = targetEl.getBoundingClientRect();
    const delta = targetBox.left + targetBox.width / 2 - (sourceBox.left + sourceBox.width / 2);
    const stopGap = (sourceBox.width + targetBox.width) * 0.5;
    const lungeDistance = Math.max(0, Math.abs(delta) - stopGap);
    const lunge = Math.sign(delta) * lungeDistance;
    if (!isTojiCombo || tojiFirst) sourceEl.style.setProperty("--melee-x", `${lunge}px`);
    if (isQuanxiStrike) {
      const behind = delta + Math.sign(delta) * targetBox.width * .55;
      sourceEl.style.setProperty("--quanxi-behind-x", `${behind}px`);
      scheduleBorosVisual(() => sourceEl.classList.add("is-quanxi-hidden"), scaled(220));
      scheduleBorosVisual(() => {
        sourceEl.classList.add("is-quanxi-behind");
        sourceEl.classList.remove("is-quanxi-hidden");
        showFighterFrame(sourceEl, attacker, "meleeAttack", "strike");
      }, scaled(300));
      scheduleBorosVisual(() => sourceEl.classList.add("is-quanxi-hidden"), scaled(700));
    } else if (authoredDash) {
      sourceEl.style.setProperty("--approach-duration", `${scaled(dashMoveMs)}ms`);
      sourceEl.style.setProperty("--return-duration", `${scaled(dashReturnMs)}ms`);
      animationStageTimer = window.setTimeout(() => {
        animationStageTimer = null;
        showFighterFrame(sourceEl, attacker, skillAnimationName, authoredDash.move);
        if (event.skillId === "kaneki-glutton") {
          sourceEl.style.setProperty("--kaneki-arc-mid-x", `${lunge * .46}px`);
          sourceEl.classList.add("is-kaneki-glutton-approaching", "is-melee-running");
        } else sourceEl.classList.add("is-clone-melee-approaching", "is-melee-running");
        animationStageTimer = window.setTimeout(() => {
          animationStageTimer = null;
          sourceEl.classList.remove("is-melee-running");
          sourceEl.classList.add("is-melee-at-target");
          if (event.chakraBurstVisual || authoredDash.hit !== authoredDash.move) showFighterFrame(sourceEl, attacker,
            event.chakraBurstVisual ? "giantRasenganBurst" : skillAnimationName, authoredDash.hit);
        }, scaled(dashMoveMs));
      }, scaled(dashCastMs));
    } else if (isTojiCombo) {
      sourceEl.style.setProperty("--toji-rush-duration", `${scaled(tojiRushMs)}ms`);
      sourceEl.style.setProperty("--toji-return-duration", `${scaled(tojiReturnMs)}ms`);
      if (tojiFirst) {
        sourceEl.classList.add("is-toji-approaching", "is-melee-running");
        animationStageTimer = window.setTimeout(() => {
          sourceEl.classList.remove("is-toji-approaching", "is-melee-running");
          sourceEl.classList.add("is-toji-at-target");
          stopSpriteFrameCycle(sourceEl);
          showFighterFrame(sourceEl, attacker, "meleeAttack", "punch_1");
          animationStageTimer = null;
        }, scaled(tojiRushMs));
      }
    } else if (isKanekiPredator) {
      const launch = Math.sign(delta) * Math.min(Math.abs(lunge), sourceBox.width * 0.5);
      sourceEl.style.setProperty("--kaneki-launch-x", `${launch}px`);
      sourceEl.style.setProperty("--kaneki-launch-duration", `${scaled(kanekiTiming.predator.launchMs)}ms`);
      sourceEl.style.setProperty("--kaneki-approach-duration", `${scaled(400)}ms`);
      sourceEl.style.setProperty("--kaneki-hold-duration", `${scaled(kanekiTiming.predator.strikeMs - 400)}ms`);
      sourceEl.style.setProperty("--kaneki-return-duration", `${scaled(kanekiTiming.predator.retreatMs)}ms`);
      sourceEl.classList.add("is-kaneki-predator-launch");
      animationStageTimer = window.setTimeout(() => {
        sourceEl.classList.remove("is-kaneki-predator-launch");
        sourceEl.classList.add("is-kaneki-predator-strike");
        startRunCycle(sourceEl, attacker, 120, playbackMultiplier);
        animationStageTimer = window.setTimeout(() => {
          sourceEl.classList.remove("is-kaneki-predator-strike");
          sourceEl.classList.add("is-kaneki-predator-hold");
          stopSpriteFrameCycle(sourceEl);
          showFighterFrame(sourceEl, attacker, "predator", "strike");
          animationStageTimer = window.setTimeout(() => {
            sourceEl.classList.remove("is-kaneki-predator-hold");
            sourceEl.classList.add("is-kaneki-predator-return");
            showFighterFrame(sourceEl, attacker, "predator", "retreat");
            animationStageTimer = null;
          }, scaled(kanekiTiming.predator.strikeMs - 400));
        }, scaled(400));
      }, scaled(kanekiTiming.predator.launchMs));
    } else if (isKanekiNormal) {
      sourceEl.style.setProperty("--kaneki-normal-approach-duration", `${scaled(kanekiTiming.normalAttack.approachMs)}ms`);
      sourceEl.style.setProperty("--kaneki-normal-return-duration", `${scaled(kanekiTiming.normalAttack.returnMs)}ms`);
      sourceEl.classList.add("is-kaneki-normal-approach", "is-attacking");
      animationStageTimer = window.setTimeout(() => {
        sourceEl.classList.remove("is-kaneki-normal-approach");
        sourceEl.classList.add("is-kaneki-normal-at-target");
        stopSpriteFrameCycle(sourceEl);
        showFighterFrame(sourceEl, attacker, "meleeAttack", "charge");
        animationStageTimer = window.setTimeout(() => {
          showFighterFrame(sourceEl, attacker, "meleeAttack", "punch");
          animationStageTimer = window.setTimeout(() => {
            sourceEl.classList.remove("is-kaneki-normal-at-target");
            sourceEl.classList.add("is-kaneki-normal-return");
            startRunCycle(sourceEl, attacker, 120, playbackMultiplier);
            animationStageTimer = null;
          }, scaled(kanekiTiming.normalAttack.totalMs - kanekiTiming.normalAttack.chargeMs));
        }, scaled(kanekiTiming.normalAttack.chargeMs));
      }, scaled(kanekiTiming.normalAttack.approachMs));
    } else if (isErenSkill) {
      sourceEl.style.setProperty("--approach-duration", `${scaled(actionTiming.rushMs)}ms`);
      sourceEl.style.setProperty("--return-duration", `${scaled(actionTiming.recoveryMs)}ms`);
      animationStageTimer = window.setTimeout(() => {
        animationStageTimer = null;
        sourceEl.classList.remove("is-skill-posing");
        startRunCycle(sourceEl, attacker, actionTiming.runFrameMs, playbackMultiplier);
        sourceEl.classList.add("is-clone-melee-approaching", "is-melee-running");
        animationStageTimer = window.setTimeout(() => {
          animationStageTimer = null;
          sourceEl.classList.remove("is-melee-running");
          sourceEl.classList.add("is-melee-at-target", "is-skill-posing");
          stopSpriteFrameCycle(sourceEl);
          startFrameCycle(
            sourceEl,
            attacker,
            skillAnimationName,
            skillAnimationFrames.slice(1),
            0,
            false,
            playbackMultiplier / skillSlowdown,
            skillAnimationFrames.slice(1).map((_, index) => index + 1),
          );
          sourceEl.classList.add("is-punching");
        }, scaled(actionTiming.rushMs));
      }, scaled(erenWindupMs));
    } else if (isCloneTechnique) {
      sourceEl.style.setProperty("--approach-duration", `${scaled(cloneApproachMs)}ms`);
      sourceEl.style.setProperty("--return-duration", `${scaled(actionTiming.recoveryMs)}ms`);
      animationStageTimer = window.setTimeout(() => {
        animationStageTimer = null;
        startFrameCycle(
          sourceEl,
          attacker,
          skillAnimationName,
          skillAnimationFrames.slice(1),
          0,
          false,
          playbackMultiplier / skillSlowdown,
          skillAnimationFrames.slice(1).map((_, index) => index + 1),
        );
        sourceEl.classList.add("is-clone-melee-approaching", "is-melee-running");
      }, scaled(cloneSealMs));
    } else {
      sourceEl.classList.add("is-melee-rushing", "is-melee-running");
    }
  } else {
    sourceEl.classList.add("is-attacking");
    if (!isErenWarhammer && !isShinHammer && !borosTimeline && !isBorosPunch && !isKiraPunch && !event.wukongTeleportAttack) sourceEl.classList.add(event.attackType === "magic" ? "is-magic-attacking" : "is-ranged-attacking");
    const configuredAnimation = attacker.id === "makima"
      ? attacker.makimaGrounded ? "groundAttack" : "hoverAttack"
      : event.skilled ? attacker.skillAnimationMap?.[event.skillId] : attacker.attackAnimation;
    const animationName = configuredAnimation ?? attacker.attackAnimation;
    const rangedFrames = animationFrameNames(attacker, animationName);
    if (isErenWarhammer) {
      showFighterFrame(sourceEl, attacker, "warhammer", "charge");
      animationStageTimer = window.setTimeout(() => {
        animationStageTimer = null;
        if (sourceEl.isConnected && targetEl.isConnected) warhammerStrike = showErenWarhammerStrike(targetEl, attacker);
      }, scaled(550));
    } else if (event.wukongTeleportAttack) {
      const sourceBox = sourceEl.getBoundingClientRect();
      const targetBox = targetEl.getBoundingClientRect();
      const delta = targetBox.left + targetBox.width / 2 - sourceBox.left - sourceBox.width / 2;
      const stopGap = (sourceBox.width + targetBox.width) * .5;
      sourceEl.style.translate = `${Math.sign(delta) * Math.max(0, Math.abs(delta) - stopGap)}px 0`;
      sourceEl.classList.add("is-wukong-teleport");
      showFighterFrame(sourceEl, attacker, "skillAttack", "teleport");
      animationStageTimer = window.setTimeout(() => {
        animationStageTimer = null;
        showFighterFrame(sourceEl, attacker, "skillAttack", "strike");
      }, scaled(180));
    } else if (isBorosPunch) {
      const sourceBox = sourceEl.getBoundingClientRect();
      const targetBox = targetEl.getBoundingClientRect();
      const delta = targetBox.left + targetBox.width / 2 - (sourceBox.left + sourceBox.width / 2);
      const stopGap = (sourceBox.width + targetBox.width) * .5;
      sourceEl.style.setProperty("--boros-punch-x", `${Math.sign(delta) * Math.max(0, Math.abs(delta) - stopGap)}px`);
      sourceEl.style.setProperty("--boros-punch-approach-duration", `${scaled(500)}ms`);
      sourceEl.style.setProperty("--boros-punch-return-duration", `${scaled(520)}ms`);
      sourceEl.classList.add("is-boros-punch-approaching");
      showFighterFrame(sourceEl, attacker, "meleeAttack", "windup");
      scheduleBorosVisual(() => {
        sourceEl.classList.remove("is-boros-punch-approaching");
        sourceEl.classList.add("is-boros-punch-at-target");
        showFighterFrame(sourceEl, attacker, "meleeAttack", "punch");
      }, scaled(500));
      scheduleBorosVisual(() => {
        sourceEl.classList.remove("is-boros-punch-at-target");
        sourceEl.classList.add("is-boros-punch-returning");
        showFighterFrame(sourceEl, attacker, "idle", "stage1");
      }, scaled(980));
    } else if (isKiraPunch) {
      showFighterFrame(sourceEl, attacker, "meleeAttack", "punch_1");
      scheduleBorosVisual(() => {
        if (sourceEl.isConnected && targetEl.isConnected && target.alive) {
          kiraStand = launchKiraStand(sourceEl, targetEl, attacker, scaled(210));
        }
      }, scaled(140));
    } else if (isShinHammer) {
      showFighterFrame(sourceEl, attacker, "hammerThrow", "charge");
      animationStageTimer = window.setTimeout(() => {
        animationStageTimer = null;
        showFighterFrame(sourceEl, attacker, "hammerThrow", "throw");
        animationStageTimer = window.setTimeout(() => {
          animationStageTimer = null;
          if (sourceEl.isConnected && targetEl.isConnected) shinHammer = launchShinHammer(sourceEl, targetEl, attacker.projectileAsset, scaled(440));
        }, scaled(260));
      }, scaled(320));
    } else if (isOdinProjectile) {
      showFighterFrame(sourceEl, attacker, "gungnir", "cast");
      animationStageTimer = window.setTimeout(() => {
        animationStageTimer = null;
        trialProjectile = launchTrialProjectile(sourceEl, targetEl, attacker.projectileAsset, scaled(560));
      }, scaled(220));
    } else if (gilTimeline) {
      if (firstGilVisual) startGilgameshVisual(sourceEl, attacker, gilTimeline);
    } else if (borosTimeline) {
      if (firstBorosVisual) startBorosSkillVisual(sourceEl, targetEl, attacker, skillAnimationName, borosTimeline, skillAnimationName === "cannon" ? (ms) => ms : scaled);
    } else if (animationName && rangedFrames.length) {
      const frameSetDuration = event.skilled && skillAnimationFrames.length ? skillActionMs : actionTiming.actionMs;
      const frameDurationScale = isBombDemonSkill
        ? playbackMultiplier
        : 1;
      startFrameCycle(sourceEl, attacker, animationName, rangedFrames, scaled(frameSetDuration / rangedFrames.length), false, frameDurationScale);
    }
  }

  let birdProjectile = null;
  if (isDeidaraBirdSkill) {
    birdProjectileTimer = window.setTimeout(() => {
      birdProjectileTimer = null;
      birdProjectile = launchDeidaraBirdProjectile(sourceEl, targetEl, scaled(800));
    }, scaled(skillActionMs * 0.5));
  }

  attackTimer = window.setTimeout(() => {
    attackTimer = null;
    if (event.trialDamage?.cloneSpent) {
      const protector = viewState.characters.find((unit) => unit.id === "naruto" && unit.team === target.team);
      if (protector) protector.chakraClones = event.trialDamage.clonesRemaining;
      if (protector?.passiveProtectionAsset) {
        const protection = document.createElement("img");
        protection.className = "clone-protect-effect";
        protection.src = new URL(`./${protector.passiveProtectionAsset}`, import.meta.url).href;
        protection.alt = "";
        protection.setAttribute("aria-hidden", "true");
        protection.style.setProperty("--clone-protect-duration", `${scaled(650)}ms`);
        targetEl.append(protection);
      }
    }
    if (kiraStand) scheduleBorosVisual(() => { kiraStand?.remove(); kiraStand = null; }, scaled(130));
    target.currentHp = event.targetHp;
    target.alive = event.targetHp > 0;
    target.burnStacks = event.burnStacks ?? target.burnStacks ?? 0;
    target.bleedStacks = event.bleedStacks ?? target.bleedStacks ?? 0;
    if (event.stunApplied && !event.targetDied) target.stunNextAction = true;
    if (event.silenceUntilRound && !event.targetDied) target.silencedThroughRound = event.silenceUntilRound;
    if (event.burnStacks > 0 || event.bleedStacks > 0 || event.targetDied || event.stunApplied || event.silenceUntilRound) renderAllyStatusIcons();
    if (event.phaseChange) {
      target.borosPhase = event.phaseChange.phase;
      if (target.phaseAssets?.[target.borosPhase]) {
        target.asset = target.phaseAssets[target.borosPhase];
        targetEl.querySelector(".sprite").src = target.asset;
      }
      target.atk = event.phaseChange.atk;
      target.def = event.phaseChange.def;
      target.spd = event.phaseChange.spd;
      target.lifesteal = event.phaseChange.lifesteal;
      battleStatusState.borosPhase = event.phaseChange.phase;
      renderAllyStatusIcons();
      addLog(`<b>波罗斯</b> 进入阶段${event.phaseChange.phase === 2 ? "二 · 能量释放" : "三 · 最终形态"}！ATK ${target.atk}、DEF ${target.def}、SPD ${target.spd}${event.phaseChange.phase === 3 ? "、吸血 +10%" : ""}。`, "log-enemy");
    }
    if (event.bombAttached) {
      battleStatusState.bombs.push({ ...event.bombAttached, targetName: target.name });
      renderAllyStatusIcons();
      addLog(`<b>杀手皇后</b> 在 ${target.name} 身上附加炸弹 ${event.bombAttached.id}，第 ${event.bombAttached.dueRound} 回合引爆。`, "log-enemy");
    }
    if (event.trialDamage?.oneEyeKingTriggered) {
      target.oneEyeKingEmergencyUsed = true;
      target.oneEyeKingUntilRound = event.trialDamage.oneEyeKingUntilRound;
      target.oneEyeKingCritRateBonus = event.trialDamage.oneEyeKingCritRateBonus;
      target.critRateBonus = (target.critRateBonus ?? 0) + target.oneEyeKingCritRateBonus;
      renderAllyStatusIcons();
      addLog(`<b>${target.name}</b> 独眼之王触发：暴击率 +60 个百分点持续本场，暴击伤害 +40% 持续 5 回合。`, "log-skill");
    }
    if (event.damageSkillTriggered) {
      target.damageTakenHits = event.damageSkillTriggered.hits;
      target.atk = event.damageSkillTriggered.effectiveAtk;
    }
    if (isMelee) {
      if (isTojiCombo) {
        stopSpriteFrameCycle(sourceEl);
        sourceEl.classList.add("is-toji-at-target", "is-punching");
        showFighterFrame(sourceEl, attacker, "meleeAttack", "punch_2");
      } else if (isQuanxiStrike || authoredDash || isKanekiPredator || isKanekiNormal) {
        // These two actions are fully staged before the precomputed hit event.
      } else if (isCloneTechnique || isErenSkill) {
        // The hand-seal and clone frames already played before impact and during the approach.
      } else {
        sourceEl.classList.remove("is-melee-running");
        stopSpriteFrameCycle(sourceEl);
      }
      if (isTojiCombo) {
        if (tojiLast) animationStageTimer = window.setTimeout(() => {
          sourceEl.classList.remove("is-punching", "is-toji-at-target");
          sourceEl.classList.add("is-toji-returning", "is-melee-running");
          startRunCycle(sourceEl, attacker, actionTiming.runFrameMs, playbackMultiplier);
          animationStageTimer = null;
        }, scaled(tojiPunchMs));
      } else if (isQuanxiStrike) {
        // The authored strike is already visible behind the target.
      } else if (authoredDash) {
        animationStageTimer = window.setTimeout(() => {
          animationStageTimer = null;
          sourceEl.classList.remove("is-clone-melee-approaching", "is-kaneki-glutton-approaching", "is-melee-at-target");
          sourceEl.classList.add("is-clone-melee-returning", "is-melee-running", "is-melee-returning");
          if (attacker.id === "arima") showFighterFrame(sourceEl, attacker, "idle", "idle");
          else startRunCycle(sourceEl, attacker, actionTiming.runFrameMs, playbackMultiplier);
        }, scaled(dashHoldMs));
      } else if (isKanekiPredator || isKanekiNormal) {
        // Keep the authored strike frame until the configured retreat/recovery ends.
      } else if (isErenSkill) {
        sourceEl.classList.remove("is-clone-melee-approaching", "is-melee-at-target", "is-skill-posing", "is-punching", "is-melee-running");
        stopSpriteFrameCycle(sourceEl);
        sourceEl.classList.add("is-clone-melee-returning", "is-melee-running", "is-melee-returning");
        startRunCycle(sourceEl, attacker, actionTiming.runFrameMs, playbackMultiplier);
      } else if (!isCloneTechnique && skillAnimationFrames.length) {
        const skillPlaybackMultiplier = playbackMultiplier / timings.skillAnimationSlowdownMultiplier;
        startFrameCycle(sourceEl, attacker, skillAnimationName, skillAnimationFrames, 0, false, skillPlaybackMultiplier);
      } else if (!isCloneTechnique) {
        sourceEl.classList.add("is-punching");
        const punchFrames = attacker.animations?.meleeAttack?.impactFrames ?? animationFrameNames(attacker, "meleeAttack", "punch_");
        if (punchFrames.length) startFrameCycle(sourceEl, attacker, "meleeAttack", punchFrames, actionTiming.punchMs / punchFrames.length, false, playbackMultiplier);
      }
      if (!isQuanxiStrike && !authoredDash && !isTojiCombo && !isErenSkill && !isKanekiPredator && !isKanekiNormal) animationStageTimer = window.setTimeout(() => {
        sourceEl.classList.remove("is-punching");
        if (isCloneTechnique) {
          sourceEl.classList.remove("is-clone-melee-approaching");
          sourceEl.classList.add("is-clone-melee-returning", "is-melee-running");
          startRunCycle(sourceEl, attacker, actionTiming.runFrameMs, playbackMultiplier);
        } else {
          startRunCycle(sourceEl, attacker, actionTiming.runFrameMs, playbackMultiplier);
          sourceEl.classList.add("is-melee-running", "is-melee-returning");
        }
        animationStageTimer = null;
      }, scaled(isCloneTechnique ? actionTiming.punchMs : meleePunchMs));
    }
    const damage = targetEl.querySelector(".damage-number");
    damage.classList.remove("is-heal");
    damage.textContent = event.dodged ? "闪避" : event.trialDamage?.odinImmune || event.trialDamage?.pathsImmune ? "免疫" : event.trialDamage?.delayedDamage ? "延迟" : event.critical ? `暴击 -${event.damage}` : `-${event.damage}`;
    damage.style.setProperty("--damage-duration", `${Math.max(280, duration)}ms`);
    damage.classList.remove("pop");
    void damage.offsetWidth;
    damage.classList.add("pop");
    if (event.dodged) {
      targetEl.classList.add("is-dodging");
      const dodgeFrames = animationFrameNames(target, "dodge");
      if (dodgeFrames.length) startFrameCycle(targetEl, target, "dodge", dodgeFrames, scaled(300 / dodgeFrames.length), false);
    }
    else {
      const stunned = Math.random() < 0.5;
      targetEl.classList.add("is-hit", "is-impact", stunned ? "is-hit-stun" : "is-hit-recoil");
      if (event.trialDamage?.odinReductionVisual && target.id === "odin") showFighterFrame(targetEl, target, "passive2", "trigger");
      const hitFrames = target.animations?.hit?.frames;
      if (hitFrames && !event.damageSkillTriggered) {
        const sequence = [stunned ? "dizzy" : "hurt", "recover"].filter((name) => typeof hitFrames[name] === "string");
        if (sequence.length) startFrameCycle(targetEl, target, "hit", sequence, scaled(180), false);
      }
      if (target.id === "arima" && event.attackGuard) showFighterFrame(targetEl, target, "passive3", "block");
      if (target.id === "arima" && event.arimaCritAwakened) {
        if (event.attackGuard) scheduleBorosVisual(() => {
          if (targetEl.isConnected && target.alive) showFighterFrame(targetEl, target, "passive2", "trigger");
        }, scaled(250));
        else showFighterFrame(targetEl, target, "passive2", "trigger");
      }
      if (event.critical) targetEl.classList.add("is-critical");
      const burst = targetEl.querySelector(".impact-burst");
      if (burst) {
        burst.classList.remove("play", "melee-impact", "melee-from-right", "makima-impact");
        burst.style.removeProperty("left");
        burst.style.removeProperty("top");
        if (event.attackerId === "makima") burst.classList.add("makima-impact");
        else if (event.attackType === "melee") {
          burst.classList.add("melee-impact");
          if (positionMeleeImpact(burst, sourceEl, targetEl)) burst.classList.add("melee-from-right");
        }
        void burst.offsetWidth;
        burst.classList.add("play");
      }
    }
    if (Number.isFinite(event.targetDef)) target.def = event.targetDef;
    if (attacker.id === "arima" && event.arimaHitCount >= 3 && !event.targetDied && attacker.weaknessAsset
      && !targetEl.querySelector(".arima-weakpoint")) {
      const marker = document.createElement("img");
      marker.className = "arima-weakpoint";
      marker.src = new URL(`./${attacker.weaknessAsset}`, import.meta.url).href;
      marker.alt = "";
      marker.setAttribute("aria-hidden", "true");
      targetEl.querySelector(".sprite-wrap")?.append(marker);
    }
    if (event.trialDamage?.heraclesHitsRemaining != null) {
      target.heraclesTrialsActive = true;
      target.heraclesHitsRemaining = event.trialDamage.heraclesHitsRemaining;
      renderAllyStatusIcons();
    }
    if (event.trialDamage?.heraclesAwakened && target.id === "heracles") {
      window.clearTimeout(targetHitTimer);
      targetHitTimer = null;
      targetEl.classList.remove("is-hit", "is-impact", "is-hit-stun", "is-hit-recoil", "is-critical");
      showFighterFrame(targetEl, target, "fallen", "down");
      scheduleBorosVisual(() => {
        if (targetEl.isConnected && target.alive) showFighterFrame(targetEl, target, "invincible", "awaken");
      }, scaled(2000));
      scheduleBorosVisual(() => {
        if (!targetEl.isConnected || !target.alive) return;
        target.animations = { ...target.animations, idle: target.animations.phase2Idle,
          meleeAttack: target.animations.phase2MeleeAttack };
        target.asset = target.animations.phase2Idle.frames.idle;
        targetEl.querySelector(".sprite").src = target.asset;
        startIdleCycle(targetEl, target);
        renderAllyStatusIcons();
      }, scaled(4000));
    }
    if (event.deepSeaDefenseGain) { attacker.def = event.attackerDef; updateHealth(attacker); }
    if (Number.isFinite(event.predatorKillBonus) && event.predatorKillBonus > 0) {
      attacker.maxHp += event.predatorKillBonus;
      updateHealth(attacker);
      addLog(`<b>${attacker.name}</b> 捕食者击杀：本局最大 HP +${event.predatorKillBonus}。`, "log-skill");
    }
    for (const granted of event.shieldsGranted ?? []) {
      const ally = viewState.characters.find((unit) => unit.id === granted.targetId);
      if (ally) { ally.shieldHp = granted.total; updateHealth(ally); }
    }
    if (Number.isFinite(event.targetShield)) { target.shieldHp = event.targetShield; updateHealth(target); }
    if (event.shieldsGranted?.length) addLog(event.shieldsGranted[0].cap != null
      ? `<b>${attacker.name}</b> 将存活队友护盾刷新至最多 ${event.shieldsGranted[0].cap} 点。`
      : `<b>${attacker.name}</b> 九尾羁绊为队友提供护盾。`, "log-skill");
    if (event.oneEyeKingAttackBonus) { attacker.atk += event.oneEyeKingAttackBonus; addLog(`<b>${attacker.name}</b> 独眼之王击杀：本局 ATK +${event.oneEyeKingAttackBonus}。`, "log-skill"); }
    if (event.trialDamage?.sharedDamage) {
      const shared = event.trialDamage.sharedDamage;
      const partner = viewState.characters.find((unit) => unit.id === shared.targetId);
      if (partner) { partner.currentHp = shared.currentHp; partner.shieldHp = shared.shieldHp; partner.alive = shared.currentHp > 0; updateHealth(partner); }
      addLog(shared.kind === "summon-protection" ? `<b>唐僧</b>替召唤物承担 ${shared.amount} 点伤害。` : `<b>慈悲为怀</b>：${partner?.name ?? "队友"} 分担 ${shared.amount} 点伤害。`, "log-skill");
    }
    if (event.trialDamage?.emergencyHeal) addLog(`<b>${target.name}</b> 道路触发：恢复 ${event.trialDamage.emergencyHeal} HP。`, "log-skill");
    for (const heal of event.evolutionHeals ?? []) {
      const ally = viewState.characters.find((unit) => unit.id === heal.targetId);
      if (ally) { ally.currentHp = heal.currentHp; updateHealth(ally); }
    }
    if (event.shieldAbsorbed) addLog(`<b>${target.name}</b> 的护盾吸收 ${event.shieldAbsorbed} 点伤害。`, "log-skill");
    if (event.extraTrueDamage) addLog(`<b>${attacker.name}</b> 自由意志追加 ${event.extraTrueDamage.actualDamage} 点真实伤害。`, "log-skill");
    if (event.weaknessApplied) {
      target.weaknessRound = event.round + 1;
      updateHealth(target);
      addLog(`<b>${target.name}</b> 下回合造成的伤害降低 50%。`, "log-enemy");
    }
    if (squadSide === "enemy") renderSquad();
    if (event.healedAmount > 0) {
      attacker.currentHp = event.attackerHp;
      updateHealth(attacker);
      const healingNumber = sourceEl.querySelector(".damage-number");
      if (healingNumber) {
        healingNumber.textContent = `+${event.healedAmount}`;
        healingNumber.style.setProperty("--damage-duration", `${Math.max(280, duration)}ms`);
        healingNumber.classList.remove("pop");
        healingNumber.classList.add("is-heal");
        void healingNumber.offsetWidth;
        healingNumber.classList.add("pop");
      }
    }
    if (event.summonerHealedAmount > 0) {
      const summoner = viewState.characters.find((unit) => unit.id === event.summonerId);
      if (summoner) {
        summoner.currentHp = event.summonerHp;
        updateHealth(summoner);
        const number = document.querySelector(`[data-character="${summoner.id}"] .damage-number`);
        if (number) { number.textContent = `+${event.summonerHealedAmount}`; number.classList.add("is-heal");
          number.classList.remove("pop"); void number.offsetWidth; number.classList.add("pop"); }
        addLog(`<b>唐僧肉</b>：${attacker.name} 造成伤害，唐僧恢复 ${event.summonerHealedAmount} HP。`, "log-skill");
      }
    }
    for (const heal of event.scorpionHeals ?? []) {
      const ally = viewState.characters.find((unit) => unit.id === heal.targetId);
      if (!ally) continue;
      ally.currentHp = heal.currentHp;
      updateHealth(ally);
      const number = document.querySelector(`[data-character="${ally.id}"] .damage-number`);
      if (number) { number.textContent = `+${heal.amount}`; number.classList.add("is-heal"); number.classList.remove("pop"); void number.offsetWidth; number.classList.add("pop"); }
      addLog(`<b>蝎子莱莱</b> 受伤后使 ${ally.name} 恢复 ${heal.amount} HP。`, "log-skill");
    }
    if (event.jinchurikiExpired) {
      battleStatusState.jinchuriki = null;
      renderAllyStatusIcons();
    }
    const extraEffectText = [
      event.edwardTrueDamage ? '<span class="skill-name">剪刀穿刺：本次无视 DEF</span>' : "",
      event.deepSeaDefenseGain ? `<span class="skill-name">深海护甲：DEF +${event.deepSeaDefenseGain}（当前 ${event.attackerDef}）</span>` : "",
      event.normalPassiveId === "lubu" && event.round === 1 ? '<span class="skill-name">无双：首回合 ATK +100%</span>' : "",
      event.defenseReduced > 0 ? `<span class="skill-name">DEF -${event.defenseReduced}</span>` : "",
      event.defenseBonusApplied > 0 ? `<span class="skill-name">DEF +${event.defenseBonusApplied}</span>` : "",
      event.oneEyeTriggered ? `<span class="skill-name">独眼触发：${event.oneEyeHealedAmount > 0 ? `HP +${event.oneEyeHealedAmount}` : "生命值已满"}</span>` : event.healedAmount > 0 ? `<span class="skill-name">HP +${event.healedAmount}</span>` : "",
      event.damageSkillTriggered ? `<span class="skill-name">${event.damageSkillTriggered.skillName} 生效：ATK +${event.damageSkillTriggered.attackGain ?? 0}</span>` : "",
      event.tauntApplied ? '<span class="skill-name">下回合嘲讽敌方单体攻击</span>' : "",
      event.passiveTriggered?.damageImmune ? `<span class="skill-name">${event.passiveTriggered.skillId === "eren-2000-years" ? "2000年后的你免疫了这次攻击" : "被动免疫"}</span>` : "",
      event.jinchurikiExpired ? '<span class="skill-name">人柱力半血增益结束</span>' : "",
      event.armorReductionApplied ? '<span class="skill-name">铠甲减伤 25%</span>' : "",
      event.trialDamage?.heraclesAwakened ? '<span class="skill-name">十二试炼觉醒：还需命中 6 次</span>' : "",
      event.trialDamage?.heraclesHitsRemaining != null && !event.trialDamage.heraclesAwakened ? `<span class="skill-name">十二试炼还需命中 ${event.trialDamage.heraclesHitsRemaining} 次</span>` : "",
      event.burnStacksApplied > 0 ? `<span class="skill-name">灼烧 +${event.burnStacksApplied} 层（共 ${event.burnStacks} 层）</span>` : "",
      event.bleedStacksApplied > 0 ? `<span class="skill-name">流血 +${event.bleedStacksApplied} 层（共 ${event.bleedStacks} 层）</span>` : "",
      event.stunApplied ? '<span class="skill-name">下一次行动眩晕</span>' : "",
      event.trialDamage?.cloneSpent ? `<span class="skill-name">查克拉影分身保护：伤害减半，剩余 ${event.trialDamage.clonesRemaining} 个</span>` : "",
      event.arimaWeaknessRevealed ? '<span class="skill-name">弱点洞察：后续攻击无视该目标 80% 防御</span>' : "",
      event.attackGuard && target.id === "arima" ? '<span class="skill-name">库因克格挡：伤害减半</span>' : "",
      event.arimaCritAwakened ? '<span class="skill-name">濒危暴击：暴击率 +30 个百分点</span>' : "",
      event.silenceUntilRound ? `<span class="skill-name">沉默至第 ${event.silenceUntilRound} 回合结束</span>` : "",
    ].filter(Boolean).join(" ");
    const segmentText = event.segmentCount > 1 && attacker.id === "toji" ? ` 第 ${event.segmentIndex}/${event.segmentCount} 段` : "";
    addLog(`<span class="round-label">R${event.round}</span> <b>${attacker.name}</b> ${actionText}${segmentText} → <b>${target.name}</b> ${resultText}${extraEffectText}`, event.skilled ? "log-skill" : sourceSide === "enemy" ? "log-enemy" : "");
    if (event.skillId === "makima-bang") addLog(`砰！回合 ${event.round}，已阵亡眷属 ${event.deadMinions} 名，玛奇玛 ATK ${attacker.atk}，技能基础攻击值 ${event.bangBaseDamage}，下次第 ${event.nextBangRound} 回合。`, "log-enemy");
    updateHealth(target);
    if (event.dodged) addLog(`<b>${target.name}</b> 闪开了攻击`, "log-dodge");
    if (event.targetDied) {
      targetEl.querySelector(".arima-weakpoint")?.remove();
      if (target.id === "arima") document.querySelectorAll(".arima-weakpoint").forEach((marker) => marker.remove());
      if (target.id === "armored-titan") battleStatusState.armoredShield = null;
      if (target.id === "toji") battleStatusState.tojiExhausted = false;
      battleStatusState.bombs = battleStatusState.bombs.filter((bomb) => bomb.targetId !== target.id);
      renderAllyStatusIcons();
      window.clearTimeout(targetHitTimer);
      targetHitTimer = null;
      clearSpriteFrame(targetEl);
      targetEl.classList.remove("is-hit", "is-dodging", "is-critical", "is-impact");
      targetEl.classList.remove("is-hit-stun", "is-hit-recoil");
      const deathDuration = target.id === "six_ear" ? 1000 : target.team === "ally" ? Math.max(scaled(timings.deathMs), scaled(ANIMATION_TIMING.boss.defeatFallMs)) : scaled(timings.deathMs);
      targetEl.style.setProperty("--death-duration", `${deathDuration}ms`);
      targetEl.classList.add("is-dead");
      const deathFrames = animationFrameNames(target, "death");
      if (["shin", "noi"].includes(target.id)) {
        targetEl.classList.add("has-shin-noi-fall");
        showFighterFrame(targetEl, target, "fallen", "down");
      } else if (deathFrames.length) startFrameCycle(targetEl, target, "death", deathFrames, deathDuration / deathFrames.length, false);
      addLog(`<b>${target.name}</b> 倒下了`, "log-death");
    } else if (!event.dodged && !event.trialDamage?.heraclesAwakened) {
      window.clearTimeout(targetHitTimer);
      const reactiveMs = event.damageSkillTriggered && (target.mimicSourceId ?? target.id) === "kaneki"
        ? target.animationTiming?.thousandSevenMs ?? 1000 : event.arimaCritAwakened ? 800 : event.attackGuard && target.id === "arima" ? 550 : 380;
      if (event.damageSkillTriggered && (target.mimicSourceId ?? target.id) === "kaneki") {
        targetEl.classList.add("is-kaneki-reactive");
        showFighterFrame(targetEl, target, "thousandSeven", "burst");
        if (target.evolutionPhase === 2 && target.auraAsset && !targetEl.querySelector(".evolution-aura")) {
          const aura = document.createElement("img");
          aura.className = "evolution-aura";
          aura.src = target.auraAsset;
          aura.alt = "";
          aura.setAttribute("aria-hidden", "true");
          targetEl.querySelector(".sprite-visual")?.prepend(aura);
        }
      }
      targetHitTimer = window.setTimeout(() => {
        clearSpriteFrame(targetEl);
        targetEl.classList.remove("is-hit", "is-impact", "is-critical", "is-hit-stun", "is-hit-recoil", "is-kaneki-reactive");
        startIdleCycle(targetEl, target);
        targetHitTimer = null;
      }, scaled(reactiveMs));
    }
  }, impactDelay);

  const reactiveHoldMs = event.damageSkillTriggered && (target.mimicSourceId ?? target.id) === "kaneki" && !event.targetDied
    ? scaled(target.animationTiming?.thousandSevenMs ?? 1000) : 0;
  const delay = Math.max(duration + eventGap, impactDelay + reactiveHoldMs + eventGap,
    event.trialDamage?.heraclesAwakened ? impactDelay + scaled(4000) + eventGap : 0,
    event.trialDamage?.cloneSpent ? impactDelay + scaled(650) : 0,
    event.targetDied && target.id === "six_ear" ? impactDelay + 1000 : 0);
  timer = window.setTimeout(() => {
    targetEl.querySelectorAll(".clone-protect-effect").forEach((node) => node.remove());
    if (birdProjectileTimer) window.clearTimeout(birdProjectileTimer);
    birdProjectileTimer = null;
    birdProjectile?.remove();
    birdProjectile = null;
    trialProjectile?.remove();
    trialProjectile = null;
    shinHammer?.remove();
    shinHammer = null;
    warhammerStrike?.remove();
    warhammerStrike = null;
    kiraStand?.remove();
    kiraStand = null;
    if (gilTimeline && firstGilVisual) {
      for (const visualTimer of borosVisualTimers) window.clearTimeout(visualTimer);
      borosVisualTimers.clear();
      document.querySelectorAll(".gilgamesh-visual").forEach((node) => node.remove());
    }
    if (borosTimeline && firstBorosVisual) {
      for (const visualTimer of borosVisualTimers) window.clearTimeout(visualTimer);
      borosVisualTimers.clear();
      clearBorosVisuals(sourceEl);
    }
    sourceEl.classList.remove("is-boros-punch-approaching", "is-boros-punch-at-target", "is-boros-punch-returning");
    if (event.wukongTeleportAttack) { sourceEl.style.removeProperty("translate"); sourceEl.classList.remove("is-wukong-teleport"); }
    sourceEl.style.removeProperty("--boros-punch-x");
    sourceEl.style.removeProperty("--boros-punch-approach-duration");
    sourceEl.style.removeProperty("--boros-punch-return-duration");
    sourceEl.classList.remove("is-attacking", "is-melee-rushing", "is-clone-melee-approaching", "is-kaneki-glutton-approaching", "is-clone-melee-returning", "is-melee-at-target", "is-melee-returning", "is-melee-running", "is-quanxi-hidden", "is-quanxi-behind", "is-skill-posing", "is-punching", "is-casting", "is-magic-attacking", "is-ranged-attacking", "is-kaneki-normal-approach", "is-kaneki-normal-at-target", "is-kaneki-normal-return", "is-kaneki-predator-launch", "is-kaneki-predator-strike", "is-kaneki-predator-hold", "is-kaneki-predator-return");
    sourceEl.style.removeProperty("--quanxi-behind-x");
    sourceEl.style.removeProperty("--kaneki-arc-mid-x");
    if (!isTojiCombo || tojiLast) sourceEl.classList.remove("is-toji-approaching", "is-toji-at-target", "is-toji-returning");
    targetEl.classList.remove("is-hit", "is-dodging", "is-critical", "is-impact", "is-hit-stun", "is-hit-recoil", "is-kaneki-reactive");
    if (!isTojiCombo || tojiLast) sourceEl.style.removeProperty("--melee-x");
    sourceEl.style.removeProperty("--kaneki-launch-x");
    sourceEl.style.removeProperty("--kaneki-nudge");
    sourceEl.style.removeProperty("--kaneki-launch-duration");
    sourceEl.style.removeProperty("--kaneki-approach-duration");
    sourceEl.style.removeProperty("--kaneki-hold-duration");
    sourceEl.style.removeProperty("--kaneki-return-duration");
    sourceEl.style.removeProperty("--kaneki-normal-duration");
    sourceEl.style.removeProperty("--kaneki-normal-approach-duration");
    sourceEl.style.removeProperty("--kaneki-normal-return-duration");
    sourceEl.style.removeProperty("--attack-duration");
    sourceEl.style.removeProperty("--approach-duration");
    sourceEl.style.removeProperty("--return-duration");
    sourceEl.style.removeProperty("--impact-duration");
    sourceEl.style.removeProperty("--skill-duration");
    targetEl.style.removeProperty("--hit-duration");
    targetEl.style.removeProperty("--hit-shake-duration");
    targetEl.style.removeProperty("--dodge-duration");
    targetEl.style.removeProperty("--impact-fx-duration");
    const burst = targetEl.querySelector(".impact-burst");
    burst?.classList.remove("play");
    burst?.classList.remove("melee-impact", "melee-from-right", "makima-impact");
    burst?.style.removeProperty("left");
    burst?.style.removeProperty("top");
    if (!event.targetDied) {
      clearSpriteFrame(targetEl);
      startIdleCycle(targetEl, target);
    }
    if (event.attackType === "melee") sourceEl.classList.remove("is-casting");
    clearSpriteFrame(sourceEl);
    if ((!isTojiCombo || tojiLast) && attacker.alive) startIdleCycle(sourceEl, attacker);
    animationStageTimer = null;
    finish();
  }, delay);
}

function playNext(token) {
  if (token !== generation || !playback || playbackPaused) return;
  if (playback.index >= playback.events.length) {
    playback = null;
    setBattleControls(false);
    return;
  }
  const event = playback.events[playback.index++];
  playEvent(event, () => playNext(token));
}

function removeEnemyEntranceVisuals() {
  window.clearTimeout(entranceTimer);
  window.clearTimeout(entrancePreloadTimer);
  entranceTimer = null;
  entrancePreloadTimer = null;
  for (const image of entranceImages) { image.onload = null; image.onerror = null; }
  entranceImages = [];
  entranceOverlay?.remove();
  entranceOverlay = null;
  $("#battle-screen")?.classList.remove("is-enemy-entrance-shaking");
}

function cancelEnemyEntrance() {
  entranceCompletion?.cancel();
  entranceCompletion = null;
  removeEnemyEntranceVisuals();
  battleStartPhase = "idle";
}

function playEnemyEntrance(entrance, token, onComplete) {
  const screen = $("#battle-screen");
  const arena = $(".arena");
  if (!screen || !arena) return onComplete();
  battleStartPhase = "entrance";
  const completion = createEntranceCompletion(onComplete);
  entranceCompletion = completion;
  const actors = entrance.actors ?? [entrance.actor];
  const assets = actors.map((actor) => Object.values(actor.animations?.idle?.frames ?? {})[0] ?? actor.asset);
  let revealed = false;
  const reveal = () => {
    if (revealed || completion.state !== "pending" || token !== generation || campaign?.status !== "combat") return;
    revealed = true;
    window.clearTimeout(entrancePreloadTimer);
    entrancePreloadTimer = null;
    const arenaRect = arena.getBoundingClientRect();
    const screenRect = screen.getBoundingClientRect();
    const portraitSizes = actors.map((actor) => {
      const visual = getCharacterVisual(actor);
      const rowScale = actor.row === "back" ? .86 : 1;
      return { width: visual.frameWidth * visual.scale * rowScale,
        height: visual.frameHeight * visual.scale * rowScale };
    });
    const portraitWidth = portraitSizes.reduce((sum, size) => sum + size.width, 0) + Math.max(0, actors.length - 1) * 10;
    const groupScale = Math.min(1, (arenaRect.width - 36) / portraitWidth);
    const titleSize = Math.min(40, Math.max(26, Math.floor((arenaRect.width - 28) / (entrance.title.length * 1.15))));
    const overlay = document.createElement("div");
    overlay.className = "enemy-entrance";
    overlay.setAttribute("role", "img");
    const displayName = actors.map((actor) => actor.name).join(" · ");
    overlay.setAttribute("aria-label", `${entrance.title}，${displayName}登场`);
    overlay.style.setProperty("--entrance-center-x", `${arenaRect.left - screenRect.left + arenaRect.width / 2}px`);
    overlay.style.setProperty("--entrance-center-y", `${arenaRect.top - screenRect.top + arenaRect.height * .44}px`);
    overlay.style.setProperty("--entrance-slide", `${arenaRect.width}px`);
    overlay.style.setProperty("--entrance-title-size", `${titleSize}px`);
    overlay.style.setProperty("--entrance-name-size", `${Math.max(14, Math.min(18, Math.round(titleSize * .45)))}px`);
    overlay.style.setProperty("--entrance-title-color", entrance.titleColor);
    overlay.style.setProperty("--entrance-outline-color", entrance.titleOutline);
    overlay.style.setProperty("--entrance-group-scale", String(groupScale));
    const scrim = document.createElement("div");
    scrim.className = "enemy-entrance-scrim";
    const flash = document.createElement("div");
    flash.className = "enemy-entrance-flash";
    const portraits = document.createElement("div");
    portraits.className = "enemy-entrance-portraits";
    actors.forEach((actor, index) => {
      const portrait = document.createElement("img");
      const visual = getCharacterVisual(actor);
      portrait.src = assets[index];
      portrait.alt = "";
      portrait.style.width = `${portraitSizes[index].width}px`;
      portrait.style.height = `${portraitSizes[index].height}px`;
      portrait.style.translate = `${visual.offsetX ?? 0}px ${visual.offsetY ?? 0}px`;
      portraits.append(portrait);
    });
    const title = document.createElement("strong");
    title.className = "enemy-entrance-title";
    title.textContent = entrance.title;
    const name = document.createElement("span");
    name.className = "enemy-entrance-name";
    name.textContent = displayName;
    overlay.append(scrim, flash, portraits, title, name);
    entranceOverlay = overlay;
    screen.append(overlay);
    screen.classList.add("is-enemy-entrance-shaking");
    entranceTimer = window.setTimeout(() => {
      if (token !== generation || campaign?.status !== "combat" || completion.state !== "pending") return cancelEnemyEntrance();
      removeEnemyEntranceVisuals();
      entranceCompletion = null;
      battleStartPhase = "fighting";
      completion.complete();
    }, ENEMY_ENTRANCE_DURATION_MS);
  };
  let remaining = assets.length;
  entranceImages = assets.map((asset) => {
    const image = new Image();
    let settledOnce = false;
    const settled = () => {
      if (settledOnce) return;
      settledOnce = true;
      remaining -= 1;
      if (remaining === 0) reveal();
    };
    image.onload = settled;
    image.onerror = settled;
    image.src = asset;
    if (image.complete) queueMicrotask(settled);
    return image;
  });
  entrancePreloadTimer = window.setTimeout(reveal, 1200);
}

function beginBattle() {
  if (battleStartPhase !== "idle" || playback || !campaign || campaign.status !== "combat") return false;
  $("#battle-screen").classList.toggle("stage-two", campaign.stageId >= 2);
  $("#battle-screen").classList.toggle("stage-three", campaign.stageId === 3);
  $("#battle-screen").classList.toggle("trial-battle", Boolean(campaign.trialBattle));
  $("#battle-screen .brand-copy .eyebrow").textContent = `PIXEL ROGUELIKE · ACT 0${campaign.stageId}`;
  const prepared = restoredBattle?.prepared ?? prepareBattle(campaign);
  if (!prepared) return false;
  const initialMakimaSummons = restoredBattle?.result ? [] : prepared.roster.filter((unit) => unit.stageThreeMinion && unit.team === "enemy");
  if (restoredBattle) campaign.combatLaunched = true;
  lastPreparedBattle = prepared;
  generation += 1;
  const token = generation;
  clearEffects();
  battleStartPhase = "initializing";
  viewState = initializeBattle(prepared.roster);
  battleStatusState = { jinchuriki: null, c0: null, borosPhase: null, bombs: [], armoredShield: null, tojiExhausted: false, currentRound: 0 };
  selectedStatusId = null;
  renderSquad();
  buildHealthRows(viewState.characters);
  for (const summon of initialMakimaSummons)
    document.querySelector(`[data-character="${summon.id}"]`)?.classList.add("is-portal-pending");
  renderAllyStatusIcons();
  const colossal = viewState.characters.find((unit) => unit.id === "colossal-titan");
  const arena = document.querySelector(".arena");
  if (colossal && arena && !arena.querySelector(".colossal-battle-smoke")) {
    const smoke = document.createElement("img");
    smoke.className = "colossal-battle-smoke";
    smoke.src = colossal.smokeAsset;
    smoke.alt = "";
    smoke.setAttribute("aria-hidden", "true");
    arena.append(smoke);
  }
  for (const character of viewState.characters) {
    if (character.id === "naruto" && character.evolutionPhase === 2) {
      const deathAsset = character.animations?.death?.frames?.down;
      if (deathAsset && !passiveVisualPreloads.has(deathAsset)) {
        const image = new Image();
        image.decoding = "async";
        image.src = new URL(`./${deathAsset}`, import.meta.url).href;
        passiveVisualPreloads.set(deathAsset, image);
      }
    }
    if (character.id === "arima") {
      const assets = [character.weaknessAsset, ...Object.values(character.animations ?? {}).flatMap((animation) => Object.values(animation.frames ?? {}))];
      for (const asset of assets) {
        if (!asset || passiveVisualPreloads.has(asset)) continue;
        const image = new Image();
        image.decoding = "async";
        image.src = new URL(`./${asset}`, import.meta.url).href;
        passiveVisualPreloads.set(asset, image);
      }
    }
    if (character.passiveProtectionAsset && !passiveVisualPreloads.has(character.passiveProtectionAsset)) {
      const image = new Image();
      image.decoding = "async";
      image.src = new URL(`./${character.passiveProtectionAsset}`, import.meta.url).href;
      passiveVisualPreloads.set(character.passiveProtectionAsset, image);
    }
    const fighter = document.querySelector(`[data-character="${character.id}"]`);
    if (fighter) startIdleCycle(fighter, character);
  }
  $("#arena-location").textContent = prepared.battle.location;
  $("#boss-warning").hidden = prepared.battle.type !== "boss";
  if (prepared.battle.type === "boss") $("#boss-warning-text").textContent = campaign.stageId === 3
    ? "⚠️ 玛奇玛正在召集眷属。"
    : campaign.stageId === 2 ? "⚠️ 龙级灾难：波罗斯！注意他的三阶段形态变化！"
    : "艺术就是爆炸！要尽快击败迪达拉！";
  const typeNames = { normal: "普通战", "normal-hard": "强化普通战", elite: "精英战", boss: "首领战", event: "奇遇战" };
  $("#battle-stage-label").textContent = `第 ${prepared.battle.step} 步 · ${typeNames[prepared.battle.type]}`;
  log.innerHTML = "";
  playbackPaused = false;
  battleLogExpanded = false;
  pausedContinuation = null;
  updateBattleLogPanel();
  displayedEvents = 0;
  updateSpeedControl();
  $("#log-count").textContent = "战斗进行中";
  addLog(`第 ${prepared.battle.number} 场开始：${prepared.battle.title}`, "log-start");
  if (prepared.battle.type === "boss" && campaign.stageId === 1) {
    const boss = prepared.roster.find((character) => Number.isFinite(character.c0DamagePerRound));
    const c4Chance = Math.round((boss?.skill?.chance ?? 0) * 100);
    addLog(`迪达拉的 C0 每个完整行动回合积累 ${boss?.c0DamagePerRound ?? 70} 点真实伤害；C4 迦楼罗有 ${c4Chance}% 概率造成 1.2 倍伤害并降低目标 DEF 20 点。`, "log-enemy");
  }
  if (prepared.battle.type === "boss" && campaign.stageId === 2) {
    addLog("波罗斯阶段一受到伤害减少 10%；阶段二每个完整回合 SPD +10；阶段三入场 ATK +80、DEF -40、SPD +100、吸血 +10%，之后每个完整回合 ATK +30。", "log-enemy");
  }
  const startFight = () => {
    if (battleStartedToken === token || token !== generation || campaign?.status !== "combat") return;
    battleStartedToken = token;
    battleStartPhase = "fighting";
    try {
      pendingResult = restoredBattle?.result ?? simulateBattle(prepared.roster, Math.random, prepared.combatOptions);
      restoredBattle = null;
      playback = { ...pendingResult, index: 0 };
      battleStatusState.c0 = pendingResult.c0 ? { damagePerRound: pendingResult.c0.damagePerRound, completedRounds: 0, accumulatedDamage: 0, detonated: false } : null;
      battleStatusState.borosPhase = prepared.roster.some((character) => character.id === "boros") ? 1 : null;
      renderAllyStatusIcons();
    } catch (error) {
      console.error("Battle initialization failed:", error);
      setStatus("战斗启动失败", "finished");
      addLog("战斗未能启动，请重新开始本局。", "log-death");
      return;
    }
    setStatus("战斗中", "fighting");
    setBattleControls(true);
    const deidara = prepared.battle.type === "boss"
      ? viewState.characters.find((character) => character.name === "迪达拉")
      : null;
    const deidaraEl = deidara && document.querySelector(`[data-character="${deidara.id}"]`);
    const spawnFrames = animationFrameNames(deidara, "spawn");
    if (deidaraEl && spawnFrames.length) {
      const spawnDuration = spawnFrames.length * ANIMATION_TIMING.boss.deidaraSpawnFrameMs;
      startFrameCycle(deidaraEl, deidara, "spawn", spawnFrames, ANIMATION_TIMING.boss.deidaraSpawnFrameMs, false);
      timer = window.setTimeout(() => {
        timer = null;
        if (playbackPaused) pausedContinuation = () => playNext(token);
        else playNext(token);
      }, spawnDuration);
    } else if (initialMakimaSummons.length) {
      const makima = viewState.characters.find((unit) => unit.id === "makima");
      const makimaFighter = document.querySelector('[data-character="makima"]');
      if (makimaFighter && makima) showFighterFrame(makimaFighter, makima, "hoverAttack", "cast");
      let remaining = initialMakimaSummons.length;
      addLog("<b>玛奇玛</b> 召唤眷属。", "log-enemy");
      for (const summon of initialMakimaSummons) {
        const fighter = document.querySelector(`[data-character="${summon.id}"]`);
        playSummonPortal(fighter, makima?.summonAuraAsset, "makima", () => {
          if (--remaining !== 0 || token !== generation) return;
          if (makimaFighter && makima) startIdleCycle(makimaFighter, makima);
          if (playbackPaused) pausedContinuation = () => playNext(token);
          else playNext(token);
        });
      }
    } else playNext(token);
  };
  setScreen("battle-screen");
  setBattleControls(false);
  const shownEntrances = campaign.evolutionEntranceShownIds ?? [];
  const entranceActors = prepared.roster.filter((actor) => actor.team === "ally" && actor.evolutionPhase === 2 &&
    actor.entranceBackground && !shownEntrances.includes(actor.id) && !(actor.id === "eren" && campaign.evolutionEntranceShown));
  const evolutionEntrance = entranceActors.length ? new Promise((resolve) => {
    const showNext = (index) => {
      if (index >= entranceActors.length || token !== generation) { resolve(); return; }
      const actor = entranceActors[index];
      const overlay = document.createElement("div");
      overlay.className = "evolution-entrance";
      overlay.style.backgroundImage = `url("${actor.entranceBackground}")`;
      document.querySelector(".arena")?.append(overlay);
      window.setTimeout(() => {
        overlay.remove();
        if (token !== generation) { resolve(); return; }
        campaign.evolutionEntranceShownIds ??= [];
        campaign.evolutionEntranceShownIds.push(actor.id);
        if (actor.id === "eren") campaign.evolutionEntranceShown = true;
        showNext(index + 1);
      }, 1550);
    };
    showNext(0);
  }) : Promise.resolve();
  const entrance = restoredBattle?.result ? null : getEnemyEntrance(prepared.battle, prepared.roster);
  const actionAssets = prepared.roster.flatMap((actor) => [actor.summonAuraAsset,
    ...(actor.id === "gilgamesh"
      ? [actor.animations?.enuma?.frames?.raise, actor.skillVisualTimelines?.enuma?.effect]
      : actor.id === "kira" ? [actor.animations?.meleeAttack?.frames?.punch_1, actor.animations?.meleeAttack?.frames?.stand, actor.animations?.skill1?.frames?.cast]
      : actor.id === "shin" ? [actor.animations?.meleeAttack?.frames?.punch,
        actor.animations?.hammerThrow?.frames?.charge, actor.animations?.hammerThrow?.frames?.throw, actor.projectileAsset]
      : actor.id === "noi" ? [actor.animations?.meleeAttack?.frames?.punch, actor.animations?.heal?.frames?.cast]
      : actor.id === "falling-devil" ? [actor.animations?.magicAttack?.frames?.attack,
        actor.animations?.gravity?.frames?.charge, actor.animations?.gravity?.frames?.release,
        actor.animations?.execution?.frames?.cast, actor.gravityCircleAsset, actor.dishAsset]
      : actor.id === "armored-titan" ? [actor.animations?.skill1?.frames?.hold] : [])]).filter(Boolean);
  const actionReady = Promise.all(actionAssets.map((src) => new Promise((resolve) => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = resolve;
    image.src = src;
    if (image.complete) resolve();
  })));
  const startAfterAssets = () => Promise.all([actionReady, evolutionEntrance]).then(() => { if (token === generation) startFight(); });
  if (entrance) {
    setStatus("强敌登场");
    playEnemyEntrance(entrance, token, startAfterAssets);
  } else startAfterAssets();
  return true;
}

function renderTrialIntro() {
  if (campaign?.status !== "trial_intro") return;
  setScreen("stage-interlude-screen");
  $("#stage-interlude-line").textContent = "去完成试炼吧，那时你或将以凡人之驱比肩神明..";
  const currentTrial = campaign.trial;
  window.setTimeout(() => {
    if (campaign?.status !== "trial_intro" || campaign.trial !== currentTrial) return;
    $("#stage-interlude-line").textContent = "";
    if (enterTrialMap(campaign)) renderTrialMap();
  }, 2100);
}

function renderTrialMap() {
  if (campaign?.status !== "trial_route" || !campaign.trial) return;
  const trial = campaign.trial;
  $("#trial-count").textContent = `${trial.completedCount} / 2 · 已失败 ${trial.failedCount ?? 0} 次`;
  const map = $("#trial-map");
  map.replaceChildren();
  trial.order.forEach((id) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `trial-node${trial.tasks[id] === "pending" ? " is-current" : ""}`;
    button.disabled = trial.tasks[id] !== "pending";
    const state = ({ pending: "未开始", active: "进行中", completed: "已完成", declined: "已放弃", failed: "失败" })[trial.tasks[id]];
    button.textContent = `${TRIAL_TASKS[id].kind} · ${TRIAL_TASKS[id].name}`;
    const label = document.createElement("small"); label.textContent = state;
    button.append(label);
    button.addEventListener("click", () => {
      const selected = chooseTrialNode(campaign, id);
      if (!selected) return;
      if (selected.type === "event") renderTrialWill();
      else beginBattle();
    });
    map.append(button);
  });
  setScreen("trial-screen");
}

function renderTrialWill() {
  if (campaign?.status !== "trial_event") return;
  renderDecisionScreen(TRIAL_TASKS.will.eventName, "高加素山上的铁链，永恒的痛苦。", [
    decisionChoice("will_accept", "我来承受这一切！", ""),
    decisionChoice("will_leave", "转身离开", ""),
  ], "确认", (id) => {
    const result = resolveTrialWill(campaign, id);
    if (!result) return false;
    if (campaign.status === "combat") beginBattle();
    else if (campaign.status === "trial_route") renderTrialMap();
    else renderTrialResult();
    return true;
  }, "ACT 03 · TRIAL");
}

function renderTrialResult() {
  if (campaign?.status !== "trial_result") return;
  const won = campaign.trial.status === "completed";
  renderDecisionScreen(won ? "试炼完成" : "试炼失败", won
    ? "已完成两项试炼。两名角色将进化，并各获得四次技能升级。"
    : "试炼结束。全队最大 HP 与 SPD 各降低 40%，效果持续至本局结束；当前 HP 恢复到进入试炼前的数值，但不超过现有上限。", [
    decisionChoice("__continue__", won ? "开始二阶段进化" : "返回第三关路线", won ? "进化后选择两名角色的技能升级。" : "本版本暂只开放试炼，常规路线等待后续内容。"),
  ], "继续", () => {
    if (!finishTrialResult(campaign)) return false;
    updateProgressionDisplays();
    if (campaign.status === "evolution_reward") renderEvolutionReward();
    else renderRoute();
    return true;
  }, "ACT 03 · TRIAL RESULT");
}

function renderEvolutionReward() {
  if (campaign?.status !== "evolution_reward") return;
  const reward = campaign.evolutionRewards;
  const id = reward.order[reward.index];
  const state = campaign.partyStates[id];
  const choices = state.learnedActiveSkills.filter((skillId) =>
    (state.skillLevels[skillId] ?? 1) < SKILL_DATA[skillId].maxLevel).map((skillId) => {
    const level = state.skillLevels[skillId] + 1;
    const config = SKILL_DATA[skillId];
    return decisionChoice(skillId, `${config.name} · Lv.${level}`, shortSkillEffect({ ...config, ...config.levels[level], level }));
  });
  const name = partyPresentation(id)?.name ?? id;
  renderDecisionScreen(`${name} · 技能升级`, `${name}还可升级 ${reward.remaining} 次；每次选择一项已解锁技能。`, choices,
    "确认升级", (skillId) => {
      if (!chooseEvolutionUpgrade(campaign, skillId)) return false;
      updateProgressionDisplays();
      if (campaign.status === "evolution_reward") renderEvolutionReward();
      else renderRoute();
      return true;
    }, "ACT 03 · EVOLUTION");
}

function renderRoute() {
  if (!campaign || campaign.status !== "route") return;
  const routeMap = getRouteMap(campaign);
  const options = orderRouteOptionsByPosition(routeMap, getRouteOptions(campaign));
  $("#route-progress").textContent = options.some((node) => node.type === "demon") ? "Boss" : `第 ${campaign.step} 步`;
  $("#route-restart-btn").hidden = campaign.stageId !== 1;
  $("#route-screen").classList.toggle("stage-two", campaign.stageId >= 2);
  $("#route-screen").classList.toggle("stage-three", campaign.stageId === 3);
  $("#route-screen").setAttribute("aria-label", `第${campaign.stageId}大关路线选择`);
  $("#battle-screen").classList.toggle("stage-two", campaign.stageId >= 2);
  $("#route-screen .eyebrow").textContent = `ACT 0${campaign.stageId} · EXPEDITION`;
  $("#route-screen .flow-copy").textContent = campaign.stageId === 3
    ? campaign.trialOffered ? "选择一块路牌，继续第三关旅程。"
      : "下一个随机事件将带你前往试炼之地"
    : "选择一块路牌，踏上下一段旅程。";
  $("#route-screen .flow-copy").classList.remove("route-selection-feedback");
  $("#route-health").textContent = campaign.partyIds.map((id) => {
    const member = partyPresentation(id);
    const state = campaign.partyStates[id];
    return `${member?.name ?? id} ${state.currentHp}/${state.maxHp}`;
  }).join(" · ");
  renderSquad();
  const hero = partyPresentation(campaign.playerId);
  $("#route-player-img").src = Object.values(hero.animations?.idle?.frames ?? {})[0] ?? hero.asset;
  $("#route-player-name").textContent = hero.name;
  $("#route-party .route-player").dataset.evolution = String(campaign.partyStates[campaign.playerId]?.evolution?.phase ?? 1);
  const partnerId = campaign.partyIds.find((id) => id !== campaign.playerId);
  const routePartner = $("#route-partner");
  const partner = campaign.stageId >= 2 && partnerId
    ? partyPresentation(partnerId) : null;
  $("#route-party").classList.toggle("has-partner", Boolean(partner));
  $("#route-party").classList.toggle("has-evolved-eren", campaign.partyIds.some((id) =>
    id === "eren" && campaign.partyStates[id]?.evolution?.phase === 2));
  routePartner.hidden = !partner;
  if (partner) {
    $("#route-partner-img").src = Object.values(partner.animations?.idle?.frames ?? {})[0] ?? partner.asset;
    $("#route-partner-name").textContent = partner.name;
    routePartner.dataset.characterDetail = partner.id;
    routePartner.dataset.evolution = String(campaign.partyStates[partnerId]?.evolution?.phase ?? 1);
    routePartner.setAttribute("aria-label", `查看${partner.name}的属性和技能`);
  }
  const partnerButton = $("#route-partner-link");
  partnerButton.hidden = !partnerId;
  if (partnerId) {
    const partner = partyPresentation(partnerId);
    partnerButton.textContent = `查看伙伴：${partner?.name ?? partnerId}`;
    partnerButton.onclick = () => openCharacterDetail(partnerId);
  }
  $(".route-player").dataset.characterDetail = hero.id;
  $(".route-player").setAttribute("aria-label", `查看${hero.name}的属性和技能`);
  updateBossProgress();
  const signs = $("#route-signs");
  signs.replaceChildren();
  signs.classList.toggle("route-signs-single", options.length === 1);
  for (const node of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `route-sign route-sign-${node.type}`;
    button.setAttribute("aria-label", `前往${routeTypeLabel(node.type)}`);
    const image = document.createElement("img");
    image.className = "route-sign-image";
    image.src = node.type === "elite" ? "assets/route-signs/battle.png" : `assets/route-signs/${node.type}.png`;
    image.alt = "";
    button.append(image);
    if (node.type === "elite") {
      const eliteIcon = document.createElement("img");
      eliteIcon.className = "route-sign-overlay";
      eliteIcon.src = "assets/route-signs/map-elite.svg";
      eliteIcon.alt = "";
      button.append(eliteIcon);
    }
    button.addEventListener("click", () => selectRouteNode(node.id));
    signs.append(button);
  }
  setScreen("route-screen");
  if (campaign.stageId === 1 && routeMap.currentNodeId === routeMap.startNodeId) openRouteMap();
}

let selectedShopSlot = null;
let selectedShopRecipientId = null;
let shopChoosingRecipient = false;
function shopCategoryLabel(id) {
  return ({ common: "普通宝物", growing: "可累积宝物", rare: "稀有宝物", medicine: "临时药物", book: "技能书" })[id] ?? id;
}
function renderShop() {
  if (campaign?.status !== "shop" || !campaign.activeShop) return;
  refreshShopPrices(campaign);
  $("#shop-essence").textContent = String(campaign.essence ?? 0);
  $("#essence-count").textContent = String(campaign.essence ?? 0);
  const slots = $("#shop-slots");
  slots.replaceChildren();
  for (const slot of campaign.activeShop.slots) {
    const view = document.createElement("button");
    view.type = "button"; view.className = "shop-slot shop-view";
    if (slot.purchased) view.classList.add("is-purchased");
    view.setAttribute("aria-label", `${slot.name}，${slot.price} 精华${slot.purchased ? "，已购买" : ""}，查看详情`);
    const image = document.createElement("img");
    image.src = slot.image ?? "assets/shop/skill-book.png";
    image.alt = "";
    const price = document.createElement("span");
    price.className = "shop-slot-price";
    price.textContent = slot.purchased ? "已售" : `◆ ${slot.price}`;
    view.append(image, price);
    view.addEventListener("click", () => openShopDetail(slot.index));
    slots.append(view);
  }
  setScreen("shop-screen");
}
function openShopDetail(index) {
  const slot = campaign?.activeShop?.slots[index];
  if (!slot) return;
  selectedShopSlot = index;
  selectedShopRecipientId = null;
  shopChoosingRecipient = false;
  $("#shop-detail-title").textContent = slot.name;
  $("#shop-detail-image").src = slot.image ?? "assets/shop/skill-book.png";
  $("#shop-detail-image").alt = slot.name;
  $("#shop-detail-category").textContent = shopCategoryLabel(slot.categoryId);
  $("#shop-detail-description").textContent = slot.description;
  $("#shop-detail-price").textContent = `◆ ${slot.price} 精华`;
  const recipients = $("#shop-detail-recipients");
  recipients.replaceChildren(); recipients.hidden = true;
  const buy = $("#shop-detail-buy");
  buy.disabled = !slot.available || slot.purchased || campaign.essence < slot.price;
  buy.textContent = slot.purchased ? "已购买" : !slot.available ? "待配置" : campaign.essence < slot.price ? "精华不足" : "购买";
  $("#shop-detail-dialog").showModal();
}
function chooseShopRecipient() {
  const slot = campaign?.activeShop?.slots[selectedShopSlot];
  if (!slot || shopChoosingRecipient) return;
  shopChoosingRecipient = true;
  const recipients = $("#shop-detail-recipients");
  const prompt = document.createElement("strong");
  prompt.textContent = "选择获得角色";
  recipients.append(prompt);
  for (const id of campaign.partyIds) {
    const choice = document.createElement("button");
    choice.type = "button"; choice.className = "shop-recipient-choice";
    choice.textContent = partyPresentation(id)?.name ?? id;
    choice.addEventListener("click", () => {
      selectedShopRecipientId = id;
      recipients.querySelectorAll(".shop-recipient-choice").forEach((button) => button.classList.toggle("is-selected", button === choice));
      const preview = previewShopItem(campaign, slot, id);
      $("#shop-detail-description").textContent = preview?.fullDescription ?? slot.description;
      $("#shop-detail-price").textContent = `◆ ${slot.price} 精华 · 此角色已有 ${preview?.ownedCount ?? 0} 件`;
      $("#shop-detail-buy").disabled = false;
    });
    recipients.append(choice);
  }
  recipients.hidden = false;
  $("#shop-detail-buy").textContent = "确认购买";
  $("#shop-detail-buy").disabled = true;
}
function purchaseShopSlot(index) {
  if (!selectedShopRecipientId) return false;
  const result = buyShopItem(campaign, index, selectedShopRecipientId);
  $("#shop-feedback").textContent = result ? `购买成功：${campaign.activeShop.slots[index].name}交给${partyPresentation(selectedShopRecipientId)?.name ?? selectedShopRecipientId}，精华 -${campaign.activeShop.slots[index].price}。` : "购买未完成，请查看余额或角色是否已学会该技能。";
  if (!result) $("#shop-detail-description").textContent = "购买未完成：请确认精华足够，且该角色尚未学会这本技能书。";
  if (result) { $("#shop-detail-dialog").close(); renderShop(); }
  return result;
}

function selectRouteNode(nodeId) {
  if (campaign?.status === "shop") {
    if (!getShopRouteOptions(campaign).some((node) => node.id === nodeId)) return false;
    if (!leaveShop(campaign)) return false;
  }
  const routeNode = campaign?.routeMap?.nodes.find((node) => node.id === nodeId);
  const eventResults = campaign?.runCharacterState?.eventResults;
  const hadEventResult = Boolean(eventResults && Object.hasOwn(eventResults, nodeId));
  const previous = routeNode && {
    edgeCount: campaign.routeMap.visitedEdges.length,
    nodeStatus: routeNode.status, nodeResolution: routeNode.resolution, nodeBattle: routeNode.battle,
    activeNode: campaign.activeNode, currentBattle: campaign.currentBattle,
    battleNumber: campaign.battleNumber, consecutiveWithoutBattle: campaign.consecutiveWithoutBattle,
    pendingEvent: campaign.pendingEvent, activeEventType: campaign.activeEventType,
    eventResolved: campaign.eventResolved,
    chapter3FirstEncounterAssigned: campaign.chapter3FirstEncounterAssigned,
    eventResult: eventResults?.[nodeId],
  };
  let selected;
  try {
    selected = chooseRoute(campaign, nodeId);
  } catch (error) {
    console.error("Route selection failed:", nodeId, error);
    showRouteSelectionFeedback("路线暂时无法进入，请重试；若仍失败，请刷新页面恢复本局进度。");
    return false;
  }
  if (!selected) {
    showRouteSelectionFeedback("只能选择当前位置相连的金色高亮地点，请重新选择。");
    return false;
  }
  const dialog = $("#route-map-dialog");
  const wasMapOpen = dialog.open;
  if (dialog.open) dialog.close();
  try {
    if (selected.type === "shop") renderShop();
    else if (selected.type === "event") renderCampaignEvent();
    else if (selected.type === "stage2_pending_end") renderStageTwoPendingEnd();
    else if (!beginBattle()) throw new Error("battle setup did not start");
  } catch (error) {
    console.error("Route transition failed:", nodeId, error);
    if (previous && !campaign.combatLaunched) {
      campaign.routeMap.visitedEdges.length = previous.edgeCount;
      routeNode.status = previous.nodeStatus;
      routeNode.resolution = previous.nodeResolution;
      routeNode.battle = previous.nodeBattle;
      campaign.activeNode = previous.activeNode;
      campaign.currentBattle = previous.currentBattle;
      campaign.battleNumber = previous.battleNumber;
      campaign.consecutiveWithoutBattle = previous.consecutiveWithoutBattle;
      campaign.pendingEvent = previous.pendingEvent;
      campaign.activeEventType = previous.activeEventType;
      campaign.eventResolved = previous.eventResolved;
      campaign.chapter3FirstEncounterAssigned = previous.chapter3FirstEncounterAssigned;
      if (eventResults) {
        if (hadEventResult) eventResults[nodeId] = previous.eventResult;
        else delete eventResults[nodeId];
      }
      campaign.status = "route";
      renderRoute();
      if (wasMapOpen) openRouteMap();
    }
    showRouteSelectionFeedback(previous && !campaign.combatLaunched
      ? "进入该路线时出错，已保留当前进度。可以重试或选择另一条路线。"
      : "进入该路线时出错。请刷新页面恢复本局进度。");
    return false;
  }
  return true;
}

function showRouteSelectionFeedback(message) {
  const dialog = $("#route-map-dialog");
  const hint = dialog.open ? dialog.querySelector(".route-map-readonly-note") : $("#route-screen .flow-copy");
  if (hint) {
    hint.textContent = message.trim();
    hint.classList.add("route-selection-feedback");
  }
}

function openRouteMap() {
  if (!campaign || !["route", "shop"].includes(campaign.status)) return;
  renderRouteMap();
  const dialog = $("#route-map-dialog");
  dialog.classList.toggle("stage-two", campaign.stageId >= 2);
  dialog.classList.toggle("stage-three", campaign.stageId === 3);
  if (!dialog.open) dialog.showModal();
}

function routeTypeLabel(type) {
  return ({ battle: "普通战斗", elite: "精英战", question: "未知事件", campfire: "篝火", shop: "商店", demon: campaign?.stageId === 3 ? "玛奇玛 Boss 战" : campaign?.stageId === 2 ? "波罗斯 Boss 战" : "迪达拉 Boss 战" })[type] ?? "前方地点";
}

function renderRouteMap() {
  if (!campaign) return;
  const hint = $("#route-map-dialog .route-map-readonly-note");
  hint.textContent = "完整路线已生成。点击金色高亮的下一节点开始探索；其他节点尚不可进入。";
  hint.classList.remove("route-selection-feedback");
  const routeMap = getRouteMap(campaign);
  const world = $("#route-map-world");
  const edgeLayer = $("#route-map-edges");
  const nodeLayer = $("#route-map-nodes");
  const mapHeight = (Math.max(...routeMap.nodes.map((node) => node.layer)) + 1) * 100;
  $("#route-map-edges").setAttribute("viewBox", "0 0 1000 " + mapHeight);
  const nodePosition = (node) => {
    return { x: node.x, y: mapHeight - 60 - node.layer * 100 };
  };
  edgeLayer.replaceChildren();
  nodeLayer.replaceChildren();
  const nodeById = new Map(routeMap.nodes.map((node) => [node.id, node]));
  for (const node of routeMap.nodes) {
    const from = nodePosition(node);
    for (const nextId of node.nextNodeIds) {
      const next = nodeById.get(nextId);
      if (!next) continue;
      const to = nodePosition(next);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", from.x); line.setAttribute("y1", from.y);
      line.setAttribute("x2", to.x); line.setAttribute("y2", to.y);
      line.setAttribute("class", routeMap.visitedEdges.some((edge) => edge.from === node.id && edge.to === next.id) ? "route-edge route-edge-visited" : "route-edge");
      edgeLayer.append(line);
    }
  }
  const hero = partyPresentation(campaign.playerId);
  const labels = { start: "起点", battle: "普通战斗", elite: "精英战", question: "未知事件", campfire: "篝火", shop: "商店", demon: campaign.stageId === 3 ? "玛奇玛 Boss" : campaign.stageId === 2 ? "波罗斯 Boss" : "迪达拉 Boss" };
  for (const node of routeMap.nodes) {
    const position = nodePosition(node);
    const selectable = (campaign.status === "route" ? getRouteOptions(campaign) : getShopRouteOptions(campaign)).some((option) => option.id === node.id);
    const element = document.createElement("button");
    const isCurrent = node.id === (campaign.status === "shop" ? campaign.activeShop?.nodeId : routeMap.currentNodeId);
    element.className = `route-map-node route-map-${node.type} route-map-${node.status}${isCurrent ? " route-map-current" : ""}${selectable ? " route-map-selectable" : ""}`;
    element.style.left = `${position.x / 10}%`;
    element.style.top = `${position.y / mapHeight * 100}%`;
    element.type = "button";
    if (selectable) {
      element.addEventListener("click", () => selectRouteNode(node.id));
    } else {
      element.setAttribute("aria-disabled", "true");
      element.addEventListener("click", () => showRouteSelectionFeedback(isCurrent
        ? "这里是当前位置，请选择金色高亮的下一节点。"
        : node.status === "completed" ? "这条路线已经走过，请选择金色高亮的下一节点。"
          : "这个节点目前无法到达，请选择与当前位置相连的金色高亮节点。"));
    }
    element.setAttribute("aria-label", `${labels[node.type]}，地图第 ${node.layer} 排${selectable ? `，可作为第 ${campaign.step} 步进入` : isCurrent ? "，当前位置" : node.status === "completed" ? "，已完成" : "，暂不可达"}`);
    const icon = document.createElement("img");
    icon.className = "route-map-icon";
    icon.src = node.type === "start"
      ? "assets/route-signs/map-home.svg"
      : node.type === "demon"
        ? (campaign.stageId === 3 ? "assets/normal-enemies/teruhashi.png" : campaign.stageId === 2 ? "assets/stage2-enemies/boros-placeholder.svg" : "assets/deidara-v2/idle/idle_1.png")
        : `assets/route-signs/map-${node.type}.svg`;
    icon.alt = "";
    element.append(icon);
    if (isCurrent && hero) {
      const avatar = document.createElement("img");
      avatar.className = "route-map-avatar";
      avatar.src = hero.asset;
      avatar.alt = "";
      element.append(avatar);
    }
    nodeLayer.append(element);
  }
  world.style.height = `${mapHeight}px`;
  const scroll = $("#route-map-scroll");
  const currentPosition = nodePosition(nodeById.get(routeMap.currentNodeId));
  requestAnimationFrame(() => { scroll.scrollTop = Math.max(0, currentPosition.y - scroll.clientHeight + 150); });
}

function renderEvent(selection = {}) {
  if (!campaign || campaign.status !== "event" || !campaign.pendingEvent) return;
  const event = campaign.pendingEvent;
  eventResultShown = false;
  $("#event-title").textContent = event.title;
  $("#event-description").textContent = event.description;
  $("#event-effect").textContent = event.effectText;
  $("#event-icon").textContent = selection.symbol === "campfire" ? "♨" : "?";
  $("#resolve-event-btn").textContent = "继续前进";
  setScreen("event-screen");
}

function renderEnding() {
  if (!campaign || !["victory", "defeat"].includes(campaign.status)) return;
  $("#ending-screen").classList.remove("stage-two-pending");
  $("#ending-screen .eyebrow").textContent = `ACT 0${campaign.stageId} · RESULT`;
  const won = campaign.status === "victory";
  $("#ending-screen").classList.toggle("is-victory", won);
  $("#ending-screen").classList.toggle("is-defeat", !won);
  $("#ending-mark").textContent = won ? "★" : "…";
  $("#ending-title").textContent = won ? (campaign.stageId === 3 ? "第三大关通关！" : campaign.stageId === 2 ? "第二大关通关！" : "第一大关通关！") : "本局挑战结束";
  $("#ending-copy").textContent = won
    ? (campaign.stageId === 3 ? "你击败了玛奇玛，完成了第三大关。" : campaign.stageId === 2 ? "你击败了波罗斯，完成了第二大关。" : "你战胜了遗迹首领，完成了第一大关。")
    : (partyPresentation(campaign.playerId)?.name ?? "角色") + "倒下了，旅程止步于第 " + campaign.step + " 步。";
  $("#ending-count").textContent = "路线已走 " + campaign.history.length + " 步 · 完成战斗 " + campaign.completedBattles + " · 最终生命 " + campaign.playerHp + " / " + campaign.playerMaxHp;
  if (localStageTwoTest && campaign.devBattleOnly) {
    let returnLink = $("#dev-battle-return");
    if (!returnLink) {
      returnLink = document.createElement("a");
      returnLink.id = "dev-battle-return";
      returnLink.className = "primary-button";
      returnLink.href = "dev/stage2.html";
      returnLink.textContent = "返回本地测试入口";
      $("#ending-screen").append(returnLink);
    }
    returnLink.hidden = false;
  }
  setScreen("ending-screen");
}

function renderStageTwoPendingEnd() {
  $("#ending-screen").classList.remove("is-victory", "is-defeat");
  $("#ending-screen").classList.add("stage-two-pending");
  $("#ending-mark").textContent = "◇";
  $("#ending-title").textContent = "第二关终点待制作";
  $("#ending-copy").textContent = "本关 Boss、专属奇遇与终局结算尚未加入。当前队伍和已走路线已保留，可在后续版本继续扩展。";
  $("#ending-count").textContent = `累计探索 ${campaign.history.length} 个节点 · 完成战斗 ${campaign.completedBattles} 场`;
  setScreen("ending-screen");
}

function playRecruitScene(flow) {
  setScreen("stage-transition-screen");
  const hero = STARTING_CHARACTERS.find((entry) => entry.id === campaign.playerId);
  const candidates = flow.candidateIds.map((id) => STARTING_CHARACTERS.find((entry) => entry.id === id));
  $("#transition-hero img").src = hero?.asset ?? "";
  $("#transition-left img").src = candidates[0]?.asset ?? "";
  $("#transition-right img").src = candidates[1]?.asset ?? "";
  const scene = $("#stage-transition-screen");
  const choices = $("#transition-choices");
  choices.replaceChildren();
  scene.classList.remove("hero-arrived", "candidates-arrived");
  $("#transition-line").textContent = "";
  const runCycles = [];
  const startRecruitRun = (selector, character) => {
    const image = $(`${selector} img`);
    const frames = Object.values(character?.animations?.run?.frames ?? {});
    if (frames.length < 2) return;
    let index = 0;
    runCycles.push({ image, idle: character.asset, timer: window.setInterval(() => {
      if (campaign?.stageTransition !== flow || flow.phase !== "recruit") return;
      image.src = frames[index++ % frames.length];
    }, 125) });
  };
  const stopRecruitRun = (selector) => {
    const image = $(`${selector} img`);
    const cycle = runCycles.find((item) => item.image === image);
    if (cycle) { window.clearInterval(cycle.timer); image.src = cycle.idle; }
  };
  startRecruitRun("#transition-hero", hero);
  requestAnimationFrame(() => scene.classList.add("hero-arrived"));
  window.setTimeout(() => {
    if (campaign?.stageTransition !== flow || flow.phase !== "recruit") return;
    stopRecruitRun("#transition-hero");
    const line = "是一段艰辛的旅途...";
    let index = 0;
    const reveal = () => {
      if (campaign?.stageTransition !== flow || flow.phase !== "recruit") return;
      $("#transition-line").textContent = line.slice(0, ++index);
      if (index < line.length) window.setTimeout(reveal, 75);
      else window.setTimeout(() => {
        if (flow.phase !== "recruit") return;
        startRecruitRun("#transition-left", candidates[0]);
        startRecruitRun("#transition-right", candidates[1]);
        scene.classList.add("candidates-arrived");
        window.setTimeout(() => {
          if (flow.phase !== "recruit") return;
          stopRecruitRun("#transition-left");
          stopRecruitRun("#transition-right");
          const title = document.createElement("p");
          title.textContent = "选择你的伙伴";
          choices.append(title);
          for (const candidate of candidates.filter(Boolean)) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "control-btn";
            button.textContent = candidate.name;
            button.addEventListener("click", () => {
              if (!advanceStageTransition(campaign, candidate.id)) return;
              renderSquad();
              renderStageTransition();
            });
            choices.append(button);
          }
        }, 750);
      }, 300);
    };
    reveal();
  }, 950);
}

let stageThreeInterludeRunning = false;
function playStageThreeInterlude(flow) {
  if (stageThreeInterludeRunning) return;
  stageThreeInterludeRunning = true;
  const scene = $("#stage-transition-screen");
  const members = campaign.partyIds.map(partyPresentation);
  $("#transition-left img").src = members[0]?.asset ?? "";
  $("#transition-right img").src = members[1]?.asset ?? "";
  $("#transition-choices").replaceChildren();
  $("#transition-line").textContent = "好险...挺过来了，好在有你";
  scene.classList.remove("hero-arrived", "candidates-arrived");
  scene.classList.add("stage3-interlude");
  setScreen("stage-transition-screen");
  const stillCurrent = () => campaign?.status === "stage_transition" && campaign.stageTransition === flow && flow.phase === "stage2_interlude";
  window.setTimeout(() => {
    if (!stillCurrent()) return;
    scene.classList.add("stage3-close");
    window.setTimeout(() => {
      if (!stillCurrent()) return;
      scene.classList.add("stage3-heart");
      window.setTimeout(() => {
        if (!stillCurrent()) return;
        scene.classList.add("stage3-fade");
        window.setTimeout(() => {
          if (!stillCurrent()) return;
          setScreen("stage-interlude-screen");
          const lines = ["诸神正注视着你…", "被选择的英雄，普罗米修斯将赐你未来"];
          const showLine = (index) => {
            if (!stillCurrent()) return;
            $("#stage-interlude-line").textContent = "";
            window.setTimeout(() => {
              if (!stillCurrent()) return;
              $("#stage-interlude-line").textContent = lines[index];
              window.setTimeout(() => {
                if (!stillCurrent()) return;
                $("#stage-interlude-line").textContent = "";
                if (index + 1 < lines.length) window.setTimeout(() => showLine(index + 1), 300);
                else window.setTimeout(() => {
                  if (!stillCurrent()) return;
                  stageThreeInterludeRunning = false;
                  scene.classList.remove("stage3-interlude", "stage3-close", "stage3-heart", "stage3-fade");
                  if (beginStageThree(campaign)) { renderSquad(); renderRoute(); }
                }, 400);
              }, 1600);
            }, 350);
          };
          showLine(0);
        }, 400);
      }, 1050);
    }, 700);
  }, 850);
}

function renderStageTransition() {
  if (campaign?.status !== "stage_transition") return;
  void preloadStageTwoBackground();
  const flow = campaign.stageTransition;
  const phase = getStageTransitionChoices(campaign);
  if (phase.phase === "stage2_interlude") return playStageThreeInterlude(flow);
  if (phase.phase === "stage2_skill") {
    const character = partyPresentation(phase.characterId);
    const state = campaign.partyStates[phase.characterId];
    const skills = phase.skillIds.map((id) => {
      const config = SKILL_DATA[id];
      const level = (state.skillLevels[id] ?? 0) + 1;
      return decisionChoice(id, `${config.name} · Lv.${level}`, shortSkillEffect({ ...config, ...config.levels[level], level }));
    });
    const chooseSkill = (id) => {
      if (!advanceStageTransition(campaign, id)) return false;
      updateProgressionDisplays(); renderStageTransition(); return true;
    };
    if (!skills.length) { advanceStageTransition(campaign); return renderStageTransition(); }
    if (phase.canDecline) {
      renderDecisionScreen(`${character?.name ?? "队员"} · 技能升级`, "第二关通关奖励：可学习新技能，也可放弃。", [
        decisionChoice("__learn__", "学习新技能", "查看 Lv.1 技能效果。"),
        decisionChoice("__skip_new_skill__", "放弃学习", "保留现有技能。"),
      ], "确认", (id) => {
        if (id === "__skip_new_skill__") return chooseSkill(id);
        renderDecisionScreen("选择新技能", "确认前可以返回上一层。", [...skills,
          decisionChoice("__back__", "返回上一层", "暂不学习。")], "确认", (skillId) =>
          skillId === "__back__" ? (renderStageTransition(), true) : chooseSkill(skillId), "ACT 02 · CLEAR REWARD");
        return true;
      }, "ACT 02 · CLEAR REWARD");
    } else renderDecisionScreen(`${character?.name ?? "队员"} · 技能升级`, "第二关通关奖励：每名队员各获得一次机会。",
      skills, "确认升级", chooseSkill, "ACT 02 · CLEAR REWARD");
    return;
  }
  if (phase.phase === "stage2_stat") {
    const character = partyPresentation(phase.characterId);
    const choices = phase.offer.choices.map((id) => {
      const upgrade = ATTRIBUTE_UPGRADES.find((entry) => entry.id === id);
      return decisionChoice(id, upgrade?.name ?? id, upgrade?.description ?? "属性强化");
    });
    renderDecisionScreen(`${character?.name ?? "队员"} · 属性加点`, `第二关通关奖励 · 当前角色剩余 ${phase.remaining} 次。`,
      choices, "应用强化", (id) => {
        if (!advanceStageTransition(campaign, id)) return false;
        updateProgressionDisplays(); renderStageTransition(); return true;
      }, "ACT 02 · CLEAR REWARD", null, { autoConfirm: true });
    return;
  }
  if (phase.phase === "recruit") return playRecruitScene(flow);
  if (phase.phase === "interlude") {
    setScreen("stage-interlude-screen");
    const line = "落叶捎来讯息，前方是未知之地";
    let index = 0;
    const reveal = () => {
      if (campaign?.status !== "stage_transition" || flow.phase !== "interlude") return;
      $("#stage-interlude-line").textContent = line.slice(0, ++index);
      if (index < line.length) window.setTimeout(reveal, 95);
      else window.setTimeout(() => {
        if (beginStageTwo(campaign)) {
          renderSquad();
          renderRoute();
        }
      }, 1100);
    };
    reveal();
    return;
  }
  if (phase.phase === "hero_skill") {
    const skill = SKILL_DATA[phase.passiveId];
    const levelTwoDescription = phase.passiveId === "jinchuriki"
      ? "当前 HP 严格低于最大 HP 的 50% 时，战斗中 ATK +30%，吸血 +20%；恢复到半血及以上即移除。"
      : phase.passiveId === "eren-2000-years"
        ? "每场战斗免疫前两次受到的攻击，最大 HP 一次性 +400。"
        : phase.passiveId === "kaneki-one-eye"
          ? "暴击时按最终计算伤害的 40% 恢复 HP，暴击率 +10 个百分点，暴击伤害 +20 个百分点。"
          : skill?.description ?? "升级角色被动技能。";
    renderDecisionScreen("主角被动升级", `第一关通关奖励 · ${skill?.name ?? "被动技能"} 升至 Lv.2`, [
      decisionChoice("upgrade_passive", `${skill?.name ?? "被动技能"} Lv.2`, levelTwoDescription),
    ], "确认升级", () => { if (!advanceStageTransition(campaign, "upgrade_passive")) return false; updateProgressionDisplays(); renderStageTransition(); return true; }, "ACT 01 · CLEAR REWARD");
    return;
  }
  if (phase.phase === "hero_active_skill" && !phase.skillIds.length) {
    advanceStageTransition(campaign);
    return renderStageTransition();
  }
  if (phase.phase === "partner_upgrade" && !phase.skillIds.length) {
    advanceStageTransition(campaign);
    return renderStageTransition();
  }
  const partner = STARTING_CHARACTERS.find((entry) => entry.id === phase.partnerId);
  const owner = phase.phase.startsWith("partner") ? partner?.name ?? "伙伴" : "主角";
  if (phase.phase.endsWith("skill") || phase.phase === "partner_upgrade") {
    const skillIds = phase.phase === "partner_skill" ? phase.skillIds : phase.skillIds;
    const state = phase.phase.startsWith("partner") ? campaign.partyStates[phase.partnerId] : campaign.runCharacterState;
    const choices = skillIds.map((id) => {
      const config = SKILL_DATA[id];
      const current = state.skillLevels[id] ?? 0;
      const level = phase.phase === "partner_skill" ? 1 : current + 1;
      return decisionChoice(id, `${config.name} · Lv.${level}`, shortSkillEffect({ ...config, ...config.levels[level] }));
    });
    if (phase.phase === "hero_active_skill" && phase.canDecline)
      choices.push(decisionChoice("__skip_new_skill__", "放弃学习", "结束这次主动技能升级奖励。"));
    renderDecisionScreen(`${owner}${phase.phase === "partner_skill" ? "选择初始技能" : "技能升级"}`, `第一关通关培养 · 剩余 ${phase.remaining ?? 1} 次`, choices,
      "确认", (id) => { if (!advanceStageTransition(campaign, id)) return false; renderStageTransition(); return true; }, "ACT 01 · CLEAR REWARD");
    return;
  }
  if (phase.phase === "hero_stat" || phase.phase === "partner_stat") {
    const choices = phase.offer.choices.map((id) => {
      const upgrade = ATTRIBUTE_UPGRADES.find((entry) => entry.id === id);
      return decisionChoice(id, upgrade?.name ?? id, upgrade?.description ?? "属性强化");
    });
    renderDecisionScreen(`${owner}属性强化`, `剩余 ${phase.remaining} 次，仅作用于${owner}。`, choices, "应用强化",
      (id) => { if (!advanceStageTransition(campaign, id)) return false; updateProgressionDisplays(); renderStageTransition(); return true; }, "ACT 01 · CLEAR REWARD", null, { autoConfirm: true });
  }
}

function renderSquad() {
  if (!campaign) return;
  const panel = document.querySelector(".squad-panel");
  if (!panel) return;
  const inCombat = campaign.status === "combat";
  if (!inCombat) squadSide = "ally";
  for (const tab of panel.querySelectorAll(".squad-tab")) {
    tab.disabled = !inCombat && tab.dataset.squadSide === "enemy";
    tab.classList.toggle("is-active", tab.dataset.squadSide === squadSide);
    tab.setAttribute("aria-selected", String(tab.dataset.squadSide === squadSide));
    tab.onclick = () => { if (!tab.disabled) { squadSide = tab.dataset.squadSide; renderSquad(); } };
  }
  const enemies = inCombat ? viewState.characters.filter((unit) => unit.team === "enemy") : [];
  const summons = inCombat ? viewState.characters.filter((unit) => unit.team === "ally" && unit.tangSummonKind) : [];
  panel.querySelector(".squad-treasures").hidden = squadSide === "enemy";
  panel.querySelector("#squad-treasure-detail").hidden = squadSide === "enemy" || !selectedStatusId?.startsWith("treasure-");
  panel.querySelector(".reserve-heading span").textContent = squadSide === "enemy" ? `${enemies.length} 名敌人`
    : summons.length ? `${campaign.partyIds.length} 名队员 · ${summons.length} 名召唤物` : `${campaign.partyIds.length} / 4`;
  const slots = panel.querySelector(".squad-slots");
  slots.replaceChildren();
  slots.classList.toggle("is-enemy-view", squadSide === "enemy");
  if (squadSide === "enemy") {
    for (const enemy of enemies) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = `squad-slot active-slot enemy-squad-card${enemy.alive ? "" : " is-dead"}`;
      const phase = enemy.borosPhase ? ` · 阶段 ${enemy.borosPhase}` : "";
      const portrait = document.createElement("img");
      portrait.src = enemy.asset;
      portrait.alt = "";
      const name = document.createElement("span");
      name.textContent = `${enemy.name}${phase}`;
      const hint = document.createElement("span");
      hint.className = "slot-hint";
      hint.textContent = "查看";
      card.append(portrait, name, hint);
      card.setAttribute("aria-label", `查看${enemy.name}的属性和技能`);
      card.addEventListener("click", () => openCharacterDetail(enemy.id));
      slots.append(card);
    }
    return;
  }
  for (const id of campaign.partyIds) {
    const character = partyPresentation(id);
    if (!character) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "squad-slot active-slot";
    button.dataset.characterDetail = id;
    button.innerHTML = `<img src="${character.asset}" alt=""><span>${character.name}</span><span class="slot-hint">查看</span>`;
    button.addEventListener("click", () => openCharacterDetail(id));
    slots.append(button);
  }
  for (const summon of summons) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `squad-slot active-slot summon-slot${summon.alive ? "" : " is-dead"}`;
    button.dataset.characterDetail = summon.id;
    button.innerHTML = `<img src="${summon.asset}" alt=""><span></span><span class="slot-hint">查看</span>`;
    button.querySelector("span:not(.slot-hint)").textContent = summon.name;
    button.addEventListener("click", () => openCharacterDetail(summon.id));
    slots.append(button);
  }
  for (let index = campaign.partyIds.length + summons.length; index < 4; index++) {
    const empty = document.createElement("div");
    empty.className = "squad-slot empty-slot";
    empty.innerHTML = "<b>＋</b><span>预留</span>";
    slots.append(empty);
  }
}

function renderStartingSkillSelection(character) {
  const skills = (character.activeSkills ?? []).map((id) => {
    const config = SKILL_DATA[id];
    const effect = config?.levels?.[1] ?? {};
    return decisionChoice(id, `${config?.name ?? id} · Lv.1`, shortSkillEffect({ ...config, ...effect }));
  });
  if (!skills.length) {
    campaign.startingSkillSelected = true;
    beginJourney(campaign);
    renderRoute();
    return;
  }
  renderDecisionScreen("选择一项初始主动技能", "被动技能会自动生效。确认后开始第一步探索。", skills, "学习技能并开始旅程", (skillId) => {
    if (!chooseStartingSkill(campaign, skillId)) return false;
    beginJourney(campaign);
    renderRoute();
    return true;
  }, "ACT 01 · FIRST SKILL");
}

function renderTreasureOffer() {
  const offer = getCampaignTreasureOffer(campaign);
  if (!offer) return false;
  const tierName = offer.tier === "royal" ? "王之财宝" : "小宝物";
  const choices = offer.choices.map((id) => {
    const treasure = TREASURE_DATA[id];
    const summary = id === "sukuna_finger"
      ? "ATK 随关卡与重复获取次数成长，最大 HP -150；选定领取者后显示本次准确数值。"
      : treasure.description;
    return decisionChoice(id, treasure.name, `${summary} 选择后指定一名队员领取。`, false, treasure.image);
  });
  renderDecisionScreen(`${tierName} · 选择宝物`, "随机展示两件不同的宝物，只能领取其中一件。", choices, "选择宝物", (treasureId) => {
    const treasure = TREASURE_DATA[treasureId];
    const recipients = campaign.partyIds.map((id) => {
      const character = partyPresentation(id);
      const effect = previewGrowingDrop(campaign.partyStates[id], treasureId, campaign.stageId);
      return decisionChoice(id, character?.name ?? id, `领取「${treasure.name}」：${effect?.description ?? treasure.description}`);
    });
    const claim = (recipientId) => {
      const result = claimCampaignTreasure(campaign, treasureId, recipientId);
      if (!result) return false;
      updateProgressionDisplays();
      if (result.next === "stat") renderBattleReward();
      else renderEventResult({ result: { treasure: result.name, recipientId } });
      return true;
    };
    if (recipients.length === 1) return claim(recipients[0].id);
    renderDecisionScreen(`${treasure.name} · 指定领取者`, "这件宝物只授予一名队员。", recipients, "确认领取", claim, "ACT 02 · TREASURE");
    return true;
  }, "ACT 02 · TREASURE");
  return true;
}

function renderBattleReward() {
  if (!campaign || campaign.status !== "reward") return;
  if (campaign.rewardPhase === "treasure") return renderTreasureOffer();
  if (campaign.rewardPhase === "quinque") {
    const choices = campaign.partyIds.flatMap((id) => {
      const name = partyPresentation(id)?.name ?? id;
      return [decisionChoice(`${id}|quinque_guard`, `${name} · 库因克防御`, "普通攻击命中时有 50% 概率抵挡一半伤害。", false, "assets/treasures/quinque-guard.png"),
        decisionChoice(`${id}|quinque_crit`, `${name} · 库因克暴击`, "HP 低于 60% 时暴击率增加 30 个百分点。", false, "assets/treasures/quinque-crit.png")];
    });
    renderDecisionScreen("领取库因克", "选择一种被动，并指定一名角色领取。", choices, "确认领取", (choice) => {
      const [recipientId, rewardId] = choice.split("|");
      if (!claimCampaignQuinque(campaign, recipientId, rewardId)) return false;
      updateProgressionDisplays(); renderBattleReward(); return true;
    }, "ACT 03 · EVENT REWARD");
    return;
  }
  if (campaign.rewardPhase === "event_epilogue") {
    renderDecisionScreen("安定区", "街道逐渐暗了下来。白色的死神正在靠近…", [
      decisionChoice("__continue__", "继续", "查看战斗奖励。"),
    ], "继续", () => { if (!advanceEventEpilogue(campaign)) return false; renderBattleReward(); return true; }, "ACT 02 · ENCOUNTER", null, { darkScene: true });
    return;
  }
  if (campaign.rewardPhase === "special_recipient") {
    const record = campaign.runCharacterState.eventResults[campaign.eventBattleSourceId];
    const name = record?.data.specialRewardId === "drip_coffee" ? "挂耳咖啡" : "六耳真身";
    const description = record?.data.specialRewardId === "drip_coffee"
      ? "本局之后每次篝火回血额外增加最大 HP 的 15%；石鬼面持有者仍不能通过篝火回血。"
      : "本局普通攻击和主动技能攻击无法被敌人闪避。";
    const recipients = campaign.partyIds.map((id) => {
      const character = partyPresentation(id);
      return decisionChoice(id, character?.name ?? id, "指定该角色领取。抽取和效果不会重复结算。");
    });
    renderDecisionScreen(`领取「${name}」`, description, recipients, "确认领取", (id) => {
      if (!claimCampaignSpecialReward(campaign, id)) return false;
      updateProgressionDisplays(); renderBattleReward(); return true;
    }, "ACT 02 · EVENT REWARD", record?.data.specialRewardId === "drip_coffee" ? "assets/events/drip_coffee.png" : "assets/events/six_ear_true_form.png");
    return;
  }
  if (campaign.rewardPhase === "elite_drop") {
    const enemyIds = campaign.currentBattle?.enemies ?? [];
    const isTitanDuo = enemyIds.includes("armored-titan") && enemyIds.includes("colossal-titan");
    const item = isTitanDuo ? GIANT_SPINAL_FLUID
      : enemyIds.includes("bomb-demon") ? GUN_DEVIL_FRAGMENT : TREASURE_DATA.sukuna_finger;
    const choices = campaign.partyIds.map((id) => {
      const member = partyPresentation(id);
      const reward = previewGrowingDrop(campaign.partyStates[id], item.id, campaign.stageId);
      return decisionChoice(id, member?.name ?? id, reward?.description ?? `由该角色领取「${item.name}」。`, false, member?.asset ?? null);
    });
    renderDecisionScreen(`精英战利品 · ${item.name}`, "本次收益按当前关卡及所选角色此前获得同名宝物的次数计算。", choices, "确认领取", (id) => {
      const result = claimCampaignEliteDrop(campaign, id);
      if (!result?.status) {
        console.error("精英战利品领取未完成", { itemId: item.id, recipientId: id,
          rewardBattleId: campaign.rewardBattleId, rewardPhase: campaign.rewardPhase,
          nodeId: campaign.activeNode?.id, nodeStatus: campaign.activeNode?.status });
        $("#decision-copy").textContent = `${item.description} 领取未完成，请再次点击确认领取；若仍无法继续，请截取此处提示。`;
        return false;
      }
      updateProgressionDisplays(); renderRoute(); return true;
    }, "ACT 03 · ELITE REWARD", item.image, { portraitCards: true });
    return;
  }
  const offer = getCampaignRewardOffer(campaign);
  if (!offer) return;
  if (campaign.rewardPhase === "giant_recipient") {
    const choices = campaign.partyIds.map((id) => {
      const character = partyPresentation(id);
      return decisionChoice(id, character?.name ?? id, previewGrowingDrop(campaign.partyStates[id], GIANT_SPINAL_FLUID.id, campaign.stageId).description);
    });
    renderDecisionScreen("选择巨人脊髓液领取者", "整份奖励仅授予一名队员，恢复的 HP 不超过领取后的最大 HP。", choices,
      "领取奖励", (id) => {
        if (!claimStageTwoGiantRecipient(campaign, id)) return false;
        updateProgressionDisplays(); renderBattleReward(); return true;
      }, "ACT 02 · EVENT REWARD");
    return;
  }
  if (campaign.stageId >= 2 && campaign.stageTwoReward) {
    if (campaign.rewardPhase === "stat") {
      const isPartnerTurn = offer.assignments.length > 0;
      const recipientId = isPartnerTurn ? campaign.partyIds.find((id) => id !== campaign.playerId) : campaign.playerId;
      const recipient = partyPresentation(recipientId);
      const choices = offer.choices.map((statId) => {
        const upgrade = STAGE_TWO_STAT_UPGRADES.find((item) => item.id === statId);
        return decisionChoice(statId, upgrade.name, upgrade.description ?? `${upgrade.value > 0 ? "+" : ""}${upgrade.value}`,
          offer.assignments.some((item) => item.statId === statId));
      });
      renderDecisionScreen("第二关战后属性强化", isPartnerTurn ? `请选择伙伴${recipient?.name ?? ""}的奖励。` : `请先为主角${recipient?.name ?? ""}选择奖励。`, choices,
        "确认分配", (id) => {
          const result = claimStageTwoStatReward(campaign, recipientId, id);
          if (!result) return false;
          updateProgressionDisplays();
          if (result.phase === "complete") renderRoute(); else renderBattleReward();
          return true;
        }, "ACT 02 · BATTLE REWARD", null, { autoConfirm: true, portraitCards: true });
      return;
    }
    const recipientId = campaign.partyIds[offer.eliteAssignments?.length ?? 0];
    const recipient = partyPresentation(recipientId);
    const choices = getSkillTrainingChoices(campaign.partyStates[recipientId]).map((skillId) => {
      const skill = getSkillAtLevel(campaign.partyStates[recipientId], skillId);
      return skill
        ? decisionChoice(skillId, `${skill.name} Lv.${skill.level + 1}`, shortSkillEffect({ ...skill, ...SKILL_DATA[skillId].levels[skill.level + 1] }))
        : decisionChoice(skillId, `学习 ${SKILL_DATA[skillId].name} Lv.1`, shortSkillEffect({ ...SKILL_DATA[skillId], ...SKILL_DATA[skillId].levels[1], level: 1 }));
    });
    const finishSkillChoice = (skillId) => {
      const result = skillId === "__skip__" ? claimStageTwoEliteSkip(campaign, recipientId) : claimStageTwoEliteSkill(campaign, recipientId, skillId);
      if (!result) return false;
      updateProgressionDisplays();
      if (result.phase === "complete") renderRoute(); else renderBattleReward();
      return true;
    };
    if (canDeclineNewSkill(campaign.partyStates[recipientId])) {
      renderDecisionScreen(`${recipient?.name ?? "队员"} · 精英技能升级`, "已学主动技能达到 Lv.4，可学习另一项技能，也可放弃本次机会。", [
        decisionChoice("__learn__", "学习新技能", "查看可学习的主动技能。"),
        decisionChoice("__skip__", "放弃学习", "保留现有技能，继续奖励结算。"),
      ], "确认", (choiceId) => {
        if (choiceId === "__skip__") return finishSkillChoice(choiceId);
        renderDecisionScreen("选择新技能", "确认后从 Lv.1 开始学习。", [...choices,
          decisionChoice("__back__", "返回上一层", "暂不确认学习。")], "确认", (skillId) =>
          skillId === "__back__" ? (renderBattleReward(), true) : finishSkillChoice(skillId), "ACT 02 · ELITE REWARD");
        return true;
      }, "ACT 02 · ELITE REWARD");
    } else {
      if (!choices.length) choices.push(decisionChoice("__skip__", "主动技能均已满级", "继续为下一位结算。"));
      renderDecisionScreen(`${recipient?.name ?? "队员"} · 精英技能升级`, "每名队员各获得一次机会。", choices, "确认", finishSkillChoice, "ACT 02 · ELITE REWARD");
    }
    return;
  }
  if (campaign.rewardPhase === "stat") {
    const giantReward = campaign.eventBattleSourceId
      ? campaign.runCharacterState.eventResults[campaign.eventBattleSourceId]?.data.spinalFluidGranted
      : false;
    const grantedFluid = giantReward && campaign.partyIds.map((id) => campaign.partyStates[id]?.permanentEffects?.find((effect) =>
      effect.id === GIANT_SPINAL_FLUID.id && effect.sourceId === campaign.eventBattleSourceId)).find(Boolean);
    const choices = offer.statChoices.map((id) => {
      const upgrade = ATTRIBUTE_UPGRADES.find((entry) => entry.id === id);
      return decisionChoice(id, upgrade?.name ?? id, upgrade?.description ?? "属性强化");
    });
    renderDecisionScreen(giantReward ? "戴娜战胜利 · 巨人脊髓液" : campaign.rewardBattleType === "elite" ? "精英战胜利 · 属性加点" : "战斗胜利 · 属性加点", giantReward
      ? `已获得巨人脊髓液：${grantedFluid?.description ?? GIANT_SPINAL_FLUID.description} 再从三个选项中选择两项属性强化。`
      : "从三个选项中选择两项强化，它们会影响后续战斗。", choices, "应用两项强化", (ids) => {
      const result = claimCampaignReward(campaign, ids);
      if (!result) return false;
      if (result.phase === "bonus" || result.phase === "elite_drop") renderBattleReward();
      else {
        updateProgressionDisplays();
        renderRoute();
      }
      return true;
    }, "ACT 01 · BATTLE REWARD", giantReward ? GIANT_SPINAL_FLUID.image : null, { multiple: true, required: offer.requiredStatSelections ?? 2, autoConfirm: true, portraitCards: true });
    return;
  }

  if (campaign.rewardPhase === "bonus") {
    const skills = offer.upgradeableSkills.map((skillId) => {
      const current = getSkillAtLevel(campaign.runCharacterState, skillId);
      const next = SKILL_DATA[skillId].levels[(current?.level ?? 0) + 1];
      return current
        ? decisionChoice(skillId, `${current.name} · Lv.${current.level} → Lv.${current.level + 1}`, shortSkillEffect({ ...current, ...next }))
        : decisionChoice(skillId, `学习 ${SKILL_DATA[skillId].name} Lv.1`, shortSkillEffect({ ...SKILL_DATA[skillId], ...next, level: 1 }));
    });
    const finishSkillChoice = (skillId) => {
      const result = skillId === "__skip__" ? claimCampaignReward(campaign, "skip_skill") : claimCampaignReward(campaign, "skill_upgrade", null, skillId);
      if (!result) return false;
      updateProgressionDisplays();
      renderRoute();
      return true;
    };
    if (canDeclineNewSkill(campaign.runCharacterState)) {
      renderDecisionScreen("精英战胜利 · 技能升级", "已学主动技能达到 Lv.4，可学习另一项技能，也可放弃本次机会。", [
        decisionChoice("__learn__", "学习新技能", "查看可学习的主动技能。"),
        decisionChoice("__skip__", "放弃学习", "保留现有技能并返回地图。"),
      ], "确认", (choiceId) => {
        if (choiceId === "__skip__") return finishSkillChoice(choiceId);
        renderDecisionScreen("选择新技能", "确认后从 Lv.1 开始学习。", [...skills,
          decisionChoice("__back__", "返回上一层", "暂不确认学习。")], "确认", (skillId) =>
          skillId === "__back__" ? (renderBattleReward(), true) : finishSkillChoice(skillId), "ACT 01 · ELITE REWARD");
        return true;
      }, "ACT 01 · ELITE REWARD");
    } else renderDecisionScreen("精英战胜利 · 技能升级", "属性加点已完成，选择升级技能。", skills, "确认", finishSkillChoice, "ACT 01 · ELITE REWARD");
  }
}

function finishEventAndAdvance() {
  const next = completeLocation(campaign);
  updateProgressionDisplays();
  if (next === "route") renderRoute();
  else if (next === "combat") beginBattle();
  return next === "route" || next === "combat";
}

function gambleRoundText(result) {
  const { type, success, change, round } = result.settled;
  const label = { skill: "技能赌博", atk: "攻击赌博", def: "防御赌博" }[type];
  const outcome = change.skillId ? `「${change.skillName}」提升至 Lv.${change.level}`
    : Number.isFinite(change.hpLoss) ? `损失 ${change.hpLoss} HP，剩余 ${change.currentHp}/${change.maxHp} HP`
      : `${change.stat.toUpperCase()} ${change.amount >= 0 ? "+" : ""}${change.amount}，当前 ${change.value}`;
  const revoked = change && result.settled.revoked?.length
    ? `额外撤销：${result.settled.revoked.map((entry) => entry.skillId
      ? `第 ${entry.round} 轮「${entry.skillName}」Lv.${entry.fromLevel} → Lv.${entry.toLevel}${entry.attackGain ? `、ATK -${entry.attackGain}` : ""}`
      : `第 ${entry.round} 轮 ${entry.stat.toUpperCase()} +${entry.amount}`).join("；")}。此前及本轮负面效果保留。`
    : "";
  return `第 ${round} 轮 · ${label}：${success ? "正面，成功" : "反面，失败"}。${outcome}。${revoked}`;
}

function renderGambleRoundResult(result) {
  renderDecisionScreen(`第 ${result.round} 轮结果`, gambleRoundText(result),
    [decisionChoice("gamble_next", "进入下一轮", "")], "继续", () => resolveVisibleEvent("gamble_next"),
    "ACT 01 · GAMBLE", campaign.pendingEvent?.image);
}

function playGambleCoin(result) {
  const record = campaign.pendingEvent;
  if (!result?.coinPending || record?.data.phase !== "coin") return;
  renderDecisionScreen(`第 ${result.round} 轮 · 抛硬币`, "硬币已经抛出，正在等待落地……", [], "等待结果",
    () => false, "ACT 01 · GAMBLE", record.image);
  const revision = decisionRevision;
  const coin = document.createElement("img");
  coin.className = "gamble-coin is-flipping";
  coin.src = "assets/events/gamble-coin-front.svg";
  coin.alt = "硬币正在旋转";
  $("#decision-copy").append(coin);
  window.setTimeout(() => {
    if (revision !== decisionRevision || campaign.pendingEvent?.data.phase !== "coin") return;
    coin.src = result.success ? "assets/events/gamble-coin-front.svg" : "assets/events/gamble-coin-back.svg";
    coin.className = "gamble-coin is-landed";
    coin.alt = result.success ? "硬币正面" : "硬币反面";
    $("#decision-copy").firstChild.textContent = result.success ? "硬币落地：正面。" : "硬币落地：反面。";
    window.setTimeout(() => {
      if (revision === decisionRevision && campaign.pendingEvent?.data.phase === "coin") resolveVisibleEvent("gamble_settle");
    }, 450);
  }, 1350);
}

function renderEventResult(result) {
  const title = result?.result?.escape === "success" ? "逃跑成功"
    : campaign.activeEventType === "campfire" ? "篝火休整完成" : `${campaign.pendingEvent?.name ?? "奇遇"} · 已完成`;
  const eventId = campaign.pendingEvent?.eventId;
  const shared = campaign.stageId >= 2 && campaign.pendingEvent?.data.sharedWith?.length;
  const teamDetail = shared ? eventId === "big_rock" ? "主角和伙伴下一场战斗均速度 -20。"
    : eventId === "coffee_shop" ? "主角和伙伴均获得相同的安定区效果。"
      : "本次正向属性收益同时作用于主角和伙伴；生命上限代价仅由主角承担。" : "";
  renderDecisionScreen(title, `${describeEventResult(result)}${teamDetail ? ` ${teamDetail}` : ""}`, [decisionChoice("__continue__", "继续前进", `前往第 ${campaign.step + 1} 步。`)], "继续前进", () => finishEventAndAdvance(), "ACT 01 · EVENT RESULT", campaign.pendingEvent?.image ?? null);
}

function resolveVisibleEvent(choiceId, skillId = null) {
  const result = resolveCampaignEvent(campaign, choiceId, skillId);
  if (!result) return false;
  updateProgressionDisplays();
  if (campaign.pendingEvent?.type === "gamble") {
    if (result.result?.coinPending) { playGambleCoin(result.result); return true; }
    if (result.result?.gambleResult) { renderGambleRoundResult(result.result); return true; }
    if (campaign.eventResolved) {
      const summary = result.result?.settled ? `${gambleRoundText(result.result)} ${describeEventResult(result)}` : describeEventResult(result);
      renderDecisionScreen(`${campaign.pendingEvent.name} · 已完成`, summary,
        [decisionChoice("__continue__", "继续前进", "")], "继续前进", () => finishEventAndAdvance(),
        "ACT 01 · EVENT RESULT", campaign.pendingEvent.image);
      return true;
    }
    renderAdventureEvent();
    return true;
  }
  if (campaign.pendingEvent?.eventId === "kings_treasury" && result.result?.pendingBattle) {
    renderDecisionScreen("王之宝库", "此时，你听到一声利呵“杂修”，回头望去，一个耀眼的家伙坐在王座之上", [
      decisionChoice("__fight__", "迎战吉尔伽美什", "确认后进入战斗。"),
    ], "开始战斗", () => { if (!startCampaignEventBattle(campaign)) return false; beginBattle(); return true; }, "ACT 02 · ENCOUNTER", campaign.pendingEvent.image);
    return true;
  }
  if (campaign.pendingEvent?.eventId === "giant_encirclement") {
    const outcome = result.result;
    if (outcome?.pendingBattle) {
      if (outcome.escape === "failed") {
        renderDecisionScreen("逃跑失败", describeEventResult(outcome), [decisionChoice("__fight__", "迎战戴娜", "确认后进入战斗。")], "开始战斗", () => {
          if (!startCampaignEventBattle(campaign)) return false;
          beginBattle();
          return true;
        }, "ACT 01 · ENCOUNTER", campaign.pendingEvent.image);
      } else {
        if (!startCampaignEventBattle(campaign)) return false;
        beginBattle();
      }
      return true;
    }
    renderEventResult(result);
    return true;
  }
  if (!campaign.eventResolved) {
    renderAdventureEvent();
    return true;
  }
  if (campaign.activeEventType === "adventure" && ["sea_beyond", "sea_beyond_2", "old_scroll_2", "coffee_shop", "anteiku_2", "anteiku_3", "big_rock", "giant_rock_2", "death_note", "fate_gate", "kings_treasury"].includes(campaign.pendingEvent?.eventId)) {
    renderEventResult(result);
    return true;
  }
  return finishEventAndAdvance();
}

function renderCampfire() {
  if (campaign?.stageId >= 2) {
    const members = getStageTwoCampfireOptions(campaign);
    if (!members) return;
    const healText = members.map(({ characterId, options }) => {
      const character = partyPresentation(characterId);
      return options[0].blockedBy ? `${character.name}受石鬼面影响，无法通过篝火恢复` : `${character.name} +${options[0].healAmount} HP`;
    }).join("；");
    const canUpgrade = members.some(({ options }) => options[1].enabled);
    renderDecisionScreen("第二关篝火", "休息治疗全队，或每名队员分别获得一次技能训练机会。", [
      decisionChoice("rest", "全队休息", healText),
      decisionChoice("skill_upgrade", "全队技能升级", "每名符合条件的队员各升级一次。", !canUpgrade),
    ], "确认", (id) => {
      if (id === "rest") {
        const result = resolveStageTwoCampfire(campaign, "rest");
        if (!result) return false;
        updateProgressionDisplays(); renderEventResult({ result }); return true;
      }
      const eligible = members.filter(({ options }) => options[1].enabled);
      const selections = {};
      const chooseFor = (index) => {
        if (index >= eligible.length) {
          const result = resolveStageTwoCampfire(campaign, "skill_upgrade", selections);
          if (!result) return false;
          if (result.results.every(({ result: memberResult }) => memberResult.skippedSkill)) return finishEventAndAdvance();
          updateProgressionDisplays(); renderEventResult({ result }); return true;
        }
        const { characterId, options } = eligible[index];
        const character = partyPresentation(characterId);
        const skillChoices = options[1].skills.map((entry) =>
          decisionChoice(entry.skillId, entry.currentLevel ? `${entry.name} Lv.${entry.nextLevel}` : `学习 ${entry.name} Lv.1`, shortSkillEffect({ ...SKILL_DATA[entry.skillId], ...entry.nextEffect, level: entry.nextLevel })));
        const saveChoice = (skillId) => { selections[characterId] = skillId; return chooseFor(index + 1); };
        if (canDeclineNewSkill(campaign.partyStates[characterId])) {
          const chooseOrLeave = () => renderDecisionScreen(`${character.name}技能升级`, "已学主动技能达到 Lv.4，可学习另一项技能，也可直接离开。", [
            decisionChoice("__learn__", "学习新技能", "查看可学习的主动技能。"),
            decisionChoice("__skip_new_skill__", "直接离开", "不改变技能。"),
          ], "确认", (choiceId) => {
            if (choiceId === "__skip_new_skill__") return saveChoice(choiceId);
            renderDecisionScreen("选择新技能", "确认前可返回上一层。", [...skillChoices,
              decisionChoice("__back__", "返回上一层", "暂不确认学习。")], "确认", (skillId) =>
              skillId === "__back__" ? (chooseOrLeave(), true) : saveChoice(skillId), "ACT 02 · CAMPFIRE");
            return true;
          }, "ACT 02 · CAMPFIRE");
          return chooseOrLeave();
        }
        renderDecisionScreen(`${character.name}技能升级`, "本次篝火每名队员最多训练一次。", skillChoices,
          "确认升级", saveChoice, "ACT 02 · CAMPFIRE");
        return true;
      };
      return chooseFor(0);
    }, "ACT 02 · CAMPFIRE");
    return;
  }
  const options = getActiveCampfireOptions(campaign);
  if (!options) return;
  const rest = options[0];
  const upgrade = options[1];
  renderDecisionScreen("篝火", "在此选择休息治疗，或训练一项主动技能。", [
    decisionChoice("rest", "休息治疗", rest.blockedBy ? "石鬼面阻止篝火回血。" : `恢复 ${rest.healAmount} HP（当前 ${campaign.runCharacterState.currentHp}/${campaign.runCharacterState.maxHp}）。`),
    decisionChoice("skill_upgrade", "技能升级", upgrade.enabled ? upgrade.skills.map((entry) => entry.currentLevel ? `${entry.name} Lv.${entry.currentLevel} → Lv.${entry.nextLevel}` : `学习 ${entry.name} Lv.1`).join("、") : upgrade.reason, !upgrade.enabled),
  ], "确认选择", (id) => {
    if (id === "rest") return resolveVisibleEvent("rest");
    if (id === "skill_upgrade") {
      const choices = upgrade.skills.map((entry) => decisionChoice(entry.skillId, entry.currentLevel ? `${entry.name} · Lv.${entry.currentLevel} → Lv.${entry.nextLevel}` : `学习 ${entry.name} Lv.1`, shortSkillEffect({ ...SKILL_DATA[entry.skillId], ...entry.nextEffect, level: entry.nextLevel })));
      if (canDeclineNewSkill(campaign.runCharacterState)) {
        const chooseOrLeave = () => renderDecisionScreen("技能升级", "已学主动技能达到 Lv.4，可学习另一项技能，也可直接离开。", [
          decisionChoice("__learn__", "学习新技能", "查看可学习的主动技能。"),
          decisionChoice("__skip_new_skill__", "直接离开", "不改变技能。"),
        ], "确认", (choiceId) => {
          if (choiceId === "__skip_new_skill__") {
            if (!resolveCampaignEvent(campaign, "skill_upgrade", choiceId)) return false;
            return finishEventAndAdvance();
          }
          renderDecisionScreen("选择新技能", "确认前可返回上一层。", [...choices,
            decisionChoice("__back__", "返回上一层", "暂不确认学习。")], "确认", (skillId) =>
            skillId === "__back__" ? (chooseOrLeave(), true) : resolveVisibleEvent("skill_upgrade", skillId), "ACT 01 · CAMPFIRE");
          return true;
        }, "ACT 01 · CAMPFIRE");
        return chooseOrLeave();
      }
      renderDecisionScreen("选择升级技能", "已学技能满级后可学习新的主动技能。", choices, "确认", (skillId) => resolveVisibleEvent("skill_upgrade", skillId), "ACT 01 · CAMPFIRE");
      return true;
    }
    return false;
  }, "ACT 01 · CAMPFIRE");
}

function renderAdventureEvent() {
  const record = campaign?.pendingEvent;
  if (!record) return;
  if (record.type === "gamble" && record.data.phase === "coin") { playGambleCoin(record.result); return; }
  if (record.type === "gamble" && record.data.phase === "result") { renderGambleRoundResult(record.result); return; }
  if (record.eventId === "trial_land") {
    renderDecisionScreen("试炼之地", "道路上，是无尽的试炼", [
      decisionChoice("trial_accept", "前往试炼，失败则受到严惩", ""),
      decisionChoice("trial_decline", "逃离这个是非之地", ""),
    ], "确认", (choiceId) => {
      const result = resolveTrialOffer(campaign, choiceId);
      if (!result) return false;
      if (result.accepted) renderTrialIntro(); else renderRoute();
      return true;
    }, "ACT 03 · ADVENTURE", record.image);
    return;
  }
  if (record.eventId === "kings_treasury" && record.status === "awaiting_treasure") {
    renderTreasureOffer();
    return;
  }
  if (record.containsBattle) {
    if (record.eventId === "kings_treasury") {
      renderDecisionScreen(record.name, "此时，你听到一声利呵“杂修”，回头望去，一个耀眼的家伙坐在王座之上", [decisionChoice("start_battle", "迎战吉尔伽美什", "确认后进入战斗。")], "开始战斗", () => {
        if (!startCampaignEventBattle(campaign)) return false; beginBattle(); return true;
      }, "ACT 02 · ENCOUNTER", record.image);
      return;
    }
    if (record.eventId === "giant_encirclement") {
      renderDecisionScreen(record.data.choiceId === "giant_escape" ? "逃跑失败" : record.name,
        record.data.choiceId === "giant_escape" ? "逃跑失败！戴娜挡住了去路。" : "已决定迎战戴娜。",
        [decisionChoice("start_battle", "迎战戴娜", "确认后进入战斗。")], "开始战斗", () => {
          if (!startCampaignEventBattle(campaign)) return false;
          beginBattle(); return true;
        }, "ACT 01 · ENCOUNTER", record.image);
      return;
    }
    if (["anteiku_2", "anteiku_3", "giant_rock_2"].includes(record.eventId)) {
      const enemy = record.eventId === "anteiku_2" ? "铃屋什造" : record.eventId === "anteiku_3" ? "有马贵将" : "六耳猕猴";
      renderDecisionScreen(record.name, `${enemy}挡住了去路。`, [decisionChoice("start_battle", `迎战${enemy}`, "")], "开始战斗", () => {
        if (!startCampaignEventBattle(campaign)) return false;
        beginBattle(); return true;
      }, "ACT 02 · ENCOUNTER", record.image);
      return;
    }
    renderDecisionScreen(record.name, `${record.description} ${record.effectText}`, [decisionChoice("start_battle", "迎战精英", "战斗结果将使用当前属性和技能结算。")], "开始战斗", () => {
      const battle = startCampaignEventBattle(campaign);
      if (!battle) return false;
      beginBattle();
      return true;
    }, "ACT 01 · ENCOUNTER", record.image);
    return;
  }

  const choices = [];
  if (record.eventId === "found_money") {
    choices.push(decisionChoice("money_take", "天上掉馅饼", ""));
    choices.push(decisionChoice("money_leave", "不是我的不能拿", ""));
  } else if (record.eventId === "devil_bargain") {
    choices.push(decisionChoice("devil_trade", "接受交易", "主角当前 HP 减少相当于最大 HP 的 50%，最低保留 1 HP；获得 5 点精华。"));
    choices.push(decisionChoice("devil_leave", "拒绝交易并离开", "获得 1 点精华，不扣除 HP。"));
  } else if (record.type === "gamble") {
    if (record.data.phase === "recipient") for (const id of campaign.partyIds) {
      choices.push(decisionChoice(`gamble_recipient|${id}`, partyPresentation(id)?.name ?? id, ""));
    }
    else if (record.data.phase === "choice") {
      choices.push(decisionChoice("gamble_play", ["赌一把", "再赌一把", "最后一搏"][record.data.round - 1],
        record.data.round === 3 ? "失败将额外失去前两轮获得的全部加成，且保留所有负面效果。" : ""));
      choices.push(decisionChoice("gamble_quit", record.data.round === 3 ? "点到为止" : "不赌为妙", ""));
    }
  } else if (record.eventId === "kings_treasury") {
    choices.push(decisionChoice("treasury_leave", "转身离开", "不属于你的东西，最好还是放下。"));
    choices.push(decisionChoice("treasury_steal", "随手拿一件并偷偷溜走", ""));
    choices.push(decisionChoice("treasury_advance", "再往前走走", ""));
  } else if (record.eventId === "giant_encirclement") {
    choices.push(decisionChoice("giant_escape", "尝试逃跑", ""));
    choices.push(decisionChoice("giant_heart", "献出心脏吧！", ""));
  } else if (record.type === "learn_skill") {
    if (record.data.scrollPhase === "intro") {
      choices.push(decisionChoice("scroll_follow", "跟随老头前往妙蛙山", ""));
      choices.push(decisionChoice("scroll_leave", "看起来不像好人，溜了", ""));
    } else if (campaign.partyIds.length > 1 && !record.data.recipientId) {
      for (const id of campaign.partyIds) {
        const character = partyPresentation(id);
        const available = campaign.partyStates[id].activeSkillPool.filter((skillId) => !campaign.partyStates[id].learnedActiveSkills.includes(skillId));
        if (available.length) choices.push(decisionChoice(`scroll_recipient|${id}`, `${character?.name ?? id}学习`, `可学习 ${available.length} 项主动技能。`));
      }
    } else {
    for (const id of record.data.skillChoices) {
      const config = SKILL_DATA[id];
      choices.push(decisionChoice(id, `${config.name} · Lv.1`, ""));
    }
    }
    if (record.data.scrollPhase !== "intro") choices.push(decisionChoice("scroll_leave", "看起来不像好人，溜了", ""));
  } else if (record.eventId === "sea_beyond") {
    if (record.data.phase === "intro") {
      choices.push(decisionChoice("sea_begin", "是，我想看看海", ""));
      choices.push(decisionChoice("sea_pass", "还是留在墙内", ""));
    } else if (record.data.phase === "recipient") {
      for (const id of campaign.partyIds) {
        const character = partyPresentation(id);
        choices.push(decisionChoice(`sea_recipient|${id}`, `${character?.name ?? id}兑换属性`, ""));
      }
    } else {
      choices.push(decisionChoice("sea_sacrifice", "继续前往海的另一边", ""));
      choices.push(decisionChoice("sea_finish", "就到这里，领取已积累的力量", ""));
    }
  } else if (record.eventId === "sea_beyond_2") {
    choices.push(decisionChoice("sea_stay", "留在这里", ""));
    choices.push(decisionChoice("sea_home", "回到故乡", ""));
  } else if (record.eventId === "old_scroll_2") {
    if (record.data.awaitingRecipient) {
      for (const id of campaign.partyIds) {
        const character = partyPresentation(id);
        choices.push(decisionChoice(`scroll_recipient|${id}`, character?.name ?? id, ""));
      }
    } else {
      choices.push(decisionChoice("scroll_mountain", "前往妙蛙山", ""));
      choices.push(decisionChoice("scroll_not_yet", "时候未到", ""));
      choices.push(decisionChoice("scroll_never", "不想再看到你这个老头了啦", ""));
    }
  } else if (record.eventId === "coffee_shop") {
    choices.push(decisionChoice("coffee_leave", "喝杯咖啡就离开吧", ""));
    choices.push(decisionChoice("coffee_help", "偶尔来这帮忙似乎也不错", ""));
  } else if (record.eventId === "anteiku_2") {
    choices.push(decisionChoice("anteiku_leave", "尊重店长，离开此地", ""));
    choices.push(decisionChoice("anteiku_fight", "兄弟，我来助你", ""));
  } else if (record.eventId === "anteiku_3") {
    choices.push(decisionChoice("anteiku_arima", "迎战白色死神", ""));
    choices.push(decisionChoice("anteiku_weapon", "一部分被做成武器", ""));
  } else if (record.eventId === "big_rock") {
    choices.push(decisionChoice("rock_bypass", "绕路而行", ""));
    choices.push(decisionChoice("rock_move", "尝试搬动", ""));
  } else if (record.eventId === "giant_rock_2") {
    choices.push(decisionChoice("rock_avoid_again", "好奇心害死猫，反正咱也搬不动", ""));
    choices.push(decisionChoice("rock_fight", "相见即是缘，再搬搬看吧", ""));
  } else if (record.eventId === "death_note") {
    choices.push(decisionChoice("death_note_open", "打开笔记", "获得或承受一项持续两场战斗的效果；选择后会揭晓结果并显示在状态栏。"));
    choices.push(decisionChoice("death_note_pass", "路过", "不触碰笔记，继续前进。"));
  } else if (record.eventId === "fate_gate") choices.push(decisionChoice("fate_accept", "接受命运的指引", record.data.skillChoices.length ? record.effectText : "当前没有已学习且可触发的技能；确认后正常结束事件，不会生成无效效果。"));
  else choices.push(decisionChoice("__confirm__", "继续前进", record.effectText));
  // Event choices reveal outcomes only after selection; phase-two skill lists
  // are shown after the initial decision and still expose only names.
  if (record.eventId !== "devil_bargain") for (const choice of choices) choice.description = "";
  const eventDescription = record.type === "gamble"
    ? record.data.phase === "recipient" ? `${record.description}\n请选择本次赌博的角色。`
      : `${record.data.round === 3 ? "贪心不足蛇吞象" : record.description}\n第 ${record.data.round} 轮 · ${partyPresentation(record.data.recipientId)?.name ?? "角色"}`
    : record.eventId === "fate_gate"
    ? `${record.description} ${record.data.skillChoices.length ? record.effectText : "当前没有已学习且可触发的技能；确认后正常结束事件。"}`
    : record.eventId === "fall_rock"
      ? `${record.description} ${record.effectText}`
    : record.eventId === "sea_beyond" && record.data.phase === "intro"
      ? `${record.description}\n选择第一项会以最大生命值换取一项随机属性；选择后可决定是否继续兑换。具体代价与所得属性在选择后揭晓。`
    : record.eventId === "sea_beyond" && record.data.phase === "choices"
      ? `${record.description}\n已选择的兑换（离开时结算）：\n${record.data.selectedTiers.map((index) => {
          const offer = getSeaBeyondOfferDetails(record)[index];
          return `第 ${index + 1} 次：${partyPresentation(record.data.recipientId ?? campaign.playerId)?.name ?? "角色"}最大生命值 -${offer.hpLossPercent}%（-${offer.hpLoss}）；${({ atk: "攻击", def: "防御", spd: "速度" })[offer.rewardStat]} +${offer.rewardAmount}`;
        }).join("\n")}`
    : record.description;
  $("#decision-copy").classList.toggle("sea-offer-preview", record.eventId === "sea_beyond");
  renderDecisionScreen(record.name, eventDescription, choices, "确认选择", (id) => resolveVisibleEvent(id === "__confirm__" ? null : id),
    "ACT 01 · ADVENTURE", record.image, { autoConfirmChoiceIds: record.eventId === "kings_treasury" ? ["treasury_steal"] : [] });
}

function renderCampaignEvent() {
  if (!campaign || campaign.status !== "event") return;
  if (campaign.eventResolved) renderEventResult(campaign.activeNode?.resolutionResult);
  else if (campaign.activeEventType === "campfire") renderCampfire();
  else renderAdventureEvent();
}

function updateProgressionDisplays() {
  if (!campaign?.runCharacterState) return;
  campaign.playerHp = campaign.runCharacterState.currentHp;
  campaign.playerMaxHp = campaign.runCharacterState.maxHp;
  $("#route-health").textContent = `${campaign.playerHp} / ${campaign.playerMaxHp}`;
  renderSquad();
  renderAllyStatusIcons();
  if (characterDialog.open && detailCharacterId) openCharacterDetail(detailCharacterId);
}

function renderCandidateSelection() {
  if (!campaign || campaign.status !== "character-select") return;
  const container = $("#starter-candidates");
  container.innerHTML = "";
  for (const characterId of campaign.candidateIds ?? []) {
    const character = STARTING_CHARACTERS.find((entry) => entry.id === characterId);
    if (!character) continue;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "starter-card" + (selectedCandidateId === character.id ? " selected" : "");
    card.dataset.candidateId = character.id;
    card.setAttribute("aria-pressed", String(selectedCandidateId === character.id));
    card.innerHTML = '<img src="' + character.asset + '" alt=""><b>' + character.name + '</b><span>' + character.role + '</span>';
    card.addEventListener("click", () => {
      selectedCandidateId = character.id;
      renderCandidateSelection();
    });
    container.append(card);
  }
  $("#confirm-character-btn").disabled = !selectedCandidateId;
  setScreen("character-select-screen");
}

function preloadEntryAssets(character) {
  const animationAssets = Object.values(character.animations ?? {}).flatMap((animation) => [
    animation.asset,
    ...Object.values(animation.frames ?? {}),
  ]);
  const assets = [...new Set([character.asset, ...animationAssets].filter((asset) => typeof asset === "string"))];
  return Promise.all(assets.map((src) => new Promise((resolve) => {
    const image = new Image();
    const ready = () => {
      if (typeof image.decode === "function") image.decode().catch(() => {}).then(resolve);
      else resolve();
    };
    image.onload = ready;
    image.onerror = resolve;
    image.src = src;
    if (image.complete) ready();
  })));
}

async function playEntryAnimation(character) {
  if (!campaign || campaign.status !== "entry") return;
  const animationToken = ++entryAnimationToken;
  await preloadEntryAssets(character);
  if (!campaign || campaign.status !== "entry" || animationToken !== entryAnimationToken) return;
  $("#entry-character-name").textContent = character.name;
  $("#entry-character-img").src = character.asset;
  $("#entry-character-img").alt = character.name;
  const actor = $("#entry-actor");
  actor.className = "entry-actor";
  actor.removeAttribute("data-pose");
  clearSpriteFrame(actor);
  void actor.offsetWidth;
  actor.classList.add("is-dropping");
  const fallFrames = animationFrameNames(character, "fall");
  const fallDurations = character.animations?.fall?.durationsMs;
  const fallDuration = fallFrames.length && Array.isArray(fallDurations)
    ? fallFrames.reduce((total, _, index) => total + (Number.isFinite(fallDurations[index]) ? fallDurations[index] : ANIMATION_TIMING.entryDropMs / fallFrames.length), 0)
    : ANIMATION_TIMING.entryDropMs;
  actor.style.setProperty("--entry-drop-duration", `${fallDuration}ms`);
  if (fallFrames.length) startFrameCycle(actor, character, "fall", fallFrames, ANIMATION_TIMING.entryDropMs / fallFrames.length, false);
  setScreen("entry-screen");
  const sequence = character.poseSequence ?? [{ state: "ready", caption: "准备就绪", duration: 750 }];
  let index = 0;
  const runPose = () => {
    if (index >= sequence.length) {
      if (animationToken !== entryAnimationToken) return;
        renderStartingSkillSelection(character);
      return;
    }
    const pose = sequence[index++];
    actor.classList.add("has-landed");
    actor.classList.remove("is-dropping");
    actor.style.removeProperty("--entry-drop-duration");
    actor.dataset.pose = pose.state;
    if (!showFighterFrame(actor, character, "pose", pose.state)) clearSpriteFrame(actor);
    actor.classList.remove("pose-change");
    void actor.offsetWidth;
    actor.classList.add("pose-change");
    entryTimer = window.setTimeout(runPose, pose.duration);
  };
  entryTimer = window.setTimeout(runPose, fallDuration);
}

function confirmStartingCharacter() {
  if (!campaign || campaign.status !== "character-select" || !selectedCandidateId) return;
  const character = selectStartingCharacter(campaign, selectedCandidateId, null);
  if (!character) return;
  $("#route-player-img").src = character.asset;
  $("#route-player-name").textContent = character.name;
  const squadButton = document.querySelector(".squad-slot.active-slot");
  if (squadButton) {
    squadButton.dataset.characterDetail = character.id;
    squadButton.setAttribute("aria-label", "查看" + character.name + "的属性和技能");
    squadButton.querySelector("img").src = character.asset;
    squadButton.querySelector("span:not(.slot-hint)").textContent = character.name;
  }
  const hero = $("#hero-fighter");
  hero.querySelector(".fighter-name").textContent = character.name;
  hero.querySelector(".sprite").src = character.asset;
  hero.dataset.character = character.id;
  playEntryAnimation(character);
}

function showCharacterSelectionForNewRun() {
  entryAnimationToken += 1;
  campaign = createCampaign();
  selectedCandidateId = null;
  startCampaign(campaign);
  renderCandidateSelection();
}

function playOpeningOnce() {
  window.clearTimeout(introTimer);
  window.clearTimeout(entryTimer);
  campaign = createCampaign();
  selectedCandidateId = null;
  const screen = $("#intro-screen");
  screen.classList.remove("opening-lights", "opening-city", "opening-redshift");
  setScreen("intro-screen");
  markOpeningPlayed();
  const { blackMs, warningMs, cityRevealMs, skyRedMs, transitionMs } = ANIMATION_TIMING.opening;
  const later = (delay, callback) => { introTimer = window.setTimeout(callback, delay); };
  later(blackMs, () => {
    screen.classList.add("opening-lights");
    later(warningMs, () => {
      screen.classList.add("opening-city");
      later(cityRevealMs, () => {
        screen.classList.add("opening-redshift");
        later(skyRedMs, () => {
          later(transitionMs, () => {
            if (!campaign || !startCampaign(campaign)) return;
            renderCandidateSelection();
          });
        });
      });
    });
  });
}

function initializeGame() {
  applyAnimationTiming();
  if (localStageTwoTest) void preloadStageTwoBackground();
  try {
    const url = new URL(window.location.href);
    if (!localStageTwoTest && url.searchParams.get("new") === "1") {
      localStorage.removeItem(RUN_SAVE_KEY);
      sessionStorage.removeItem(OPENING_SESSION_KEY);
      url.searchParams.delete("new");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
    // A newly opened tab owns the current save. An older open tab must not
    // overwrite the new run with its previous in-memory campaign.
    localStorage.setItem(SAVE_OWNER_KEY, saveOwnerId);
    const saved = JSON.parse(localStorage.getItem(RUN_SAVE_KEY) || "null");
    if (saved?.campaign?.playerId && saved.version === 1) {
      campaign = saved.campaign;
      campaign.essence ??= 0;
      campaign.essenceHistory ??= [];
      campaign.shopHistory ??= [];
      campaign.shopMedicines ??= [];
      campaign.random = Math.random;
      campaign.partyStates ??= {};
      campaign.partyStates[campaign.playerId] = campaign.runCharacterState;
      for (const id of campaign.partyIds ?? []) {
        const evolution = campaign.partyStates[id]?.evolution;
        if (evolution?.phase === 2) evolution.name = evolutionDisplayName(id, evolution);
      }
      for (const unit of saved.battle?.prepared?.roster ?? []) {
        if (unit.team === "ally") unit.name = evolutionDisplayName(unit.id, campaign.partyStates[unit.id]?.evolution) ?? unit.name;
      }
      if (campaign.activeNode?.id) campaign.activeNode = campaign.routeMap.nodes.find((node) => node.id === campaign.activeNode.id) ?? campaign.activeNode;
      // Older second-stage saves stopped on the placeholder end. Restore that
      // selection as an available Boss node instead of trapping the run there.
      if (campaign.stageId === 2 && campaign.status === "stage2_pending_end" && campaign.activeNode?.type === "demon") {
        const bossId = campaign.activeNode.id;
        campaign.activeNode.status = "pending";
        campaign.activeNode.resolution = null;
        campaign.routeMap.visitedEdges = campaign.routeMap.visitedEdges.filter((edge) => edge.to !== bossId);
        campaign.activeNode = null;
        campaign.status = "route";
      }
      campaign.routeOptions = (campaign.routeOptions ?? []).map((option) => campaign.routeMap.nodes.find((node) => node.id === option.id)).filter(Boolean);
      if (campaign.status === "combat") {
        campaign.combatLaunched = false;
        restoredBattle = saved.battle?.prepared ? saved.battle : null;
        beginBattle();
      } else if (campaign.status === "stage_transition") renderStageTransition();
      else if (campaign.status === "route") renderRoute();
      else if (campaign.status === "shop") renderShop();
      else if (campaign.status === "trial_intro") renderTrialIntro();
      else if (campaign.status === "trial_route") renderTrialMap();
      else if (campaign.status === "trial_event") renderTrialWill();
      else if (campaign.status === "trial_result") renderTrialResult();
      else if (campaign.status === "evolution_reward") renderEvolutionReward();
      else if (campaign.status === "reward") renderBattleReward();
      else if (campaign.status === "event") renderCampaignEvent();
      else if (campaign.status === "stage2_pending_end") renderStageTwoPendingEnd();
      else if (campaign.status === "settlement") { completeSettlement(campaign); if (campaign.status === "stage_transition") renderStageTransition(); else renderEnding(); }
      else if (["victory", "defeat"].includes(campaign.status)) renderEnding();
      else if (campaign.status === "entry") renderStartingSkillSelection(STARTING_CHARACTERS.find((entry) => entry.id === campaign.playerId));
      else if (campaign.status === "character-select") renderCandidateSelection();
      else return showCharacterSelectionForNewRun();
      return;
    }
  } catch (error) {
    console.error("无法恢复本局进度", error);
    if (localStageTwoTest) {
      setScreen("battle-screen");
      setStatus("第二关测试加载失败", "finished");
      addLog(`第二关测试加载失败：${error.message}`, "log-death");
      return;
    }
  }
  if (hasOpeningPlayed()) showCharacterSelectionForNewRun();
  else playOpeningOnce();
}

function saveCampaign() {
  if (!campaign?.playerId || campaign.status === "intro") return;
  try {
    if (localStorage.getItem(SAVE_OWNER_KEY) !== saveOwnerId) return;
    localStorage.setItem(RUN_SAVE_KEY, JSON.stringify({ version: 1, campaign,
      battle: campaign.status === "combat" && lastPreparedBattle ? { prepared: lastPreparedBattle, result: pendingResult } : null }));
  } catch (error) { console.warn("无法保存本局进度", error); }
}
window.setInterval(saveCampaign, 400);
window.addEventListener("pagehide", saveCampaign);
window.addEventListener("pagehide", cancelEnemyEntrance);

function restartToCharacterSelection() {
  try { localStorage.removeItem(RUN_SAVE_KEY); } catch { /* storage may be unavailable */ }
  document.querySelectorAll(".fighter-partner").forEach((fighter) => fighter.remove());
  generation += 1;
  window.clearTimeout(timer);
  window.clearTimeout(effectTimer);
  window.clearTimeout(introTimer);
  window.clearTimeout(entryTimer);
  window.clearTimeout(attackTimer);
  window.clearTimeout(animationStageTimer);
  playback = null;
  pendingResult = null;
  lastPreparedBattle = null;
  restoredBattle = null;
  decisionHandler = null;
  selectedDecisionId = null;
  decisionBusy = false;
  decisionRevision += 1;
  fast = false;
  displayedEvents = 0;
  updateSpeedControl();
  setBattleControls(false);
  setStatus("准备就绪");
  clearEffects();
  showCharacterSelectionForNewRun();
}

document.querySelectorAll("[data-character-detail]").forEach((button) => {
  button.addEventListener("click", () => openCharacterDetail(button.dataset.characterDetail));
});
const toggleStatusIcon = (event) => {
  const button = event.target.closest("[data-status-id]");
  if (!button) return;
  selectedStatusId = selectedStatusId === button.dataset.statusId ? null : button.dataset.statusId;
  renderAllyStatusIcons();
};
$("#ally-status-icons").addEventListener("click", toggleStatusIcon);
$("#enemy-status-icons").addEventListener("click", toggleStatusIcon);
$("#squad-treasure-icons").addEventListener("click", toggleStatusIcon);
$("#character-dialog-close").addEventListener("click", () => {
  if (typeof characterDialog.close === "function") characterDialog.close();
  else characterDialog.removeAttribute("open");
});
characterDialog.addEventListener("click", (event) => {
  if (event.target === characterDialog && typeof characterDialog.close === "function") characterDialog.close();
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.showSkillDetails) {
    detailProfileMarkup = $("#character-detail").innerHTML;
    renderSkillDetailView();
  } else if (button.dataset.skillBack) {
    $("#character-detail").innerHTML = detailProfileMarkup;
  } else if (button.dataset.skillIndex !== undefined) {
    renderSkillDetailView(Number(button.dataset.skillIndex), button.dataset.skillLevel ? Number(button.dataset.skillLevel) : null);
  }
});
restartRunButton.addEventListener("click", restartToCharacterSelection);
$("#route-restart-btn").addEventListener("click", () => {
  if (campaign?.status !== "route" || campaign.stageId !== 1) return;
  $("#route-restart-dialog").showModal();
});
$("#route-restart-no").addEventListener("click", () => $("#route-restart-dialog").close());
$("#route-restart-yes").addEventListener("click", () => {
  $("#route-restart-dialog").close();
  if (campaign?.status === "route" && campaign.stageId === 1) restartToCharacterSelection();
});
$("#route-map-open").addEventListener("click", openRouteMap);
$("#shop-map-open").addEventListener("click", openRouteMap);
$("#shop-leave").addEventListener("click", () => { if (leaveShop(campaign)) renderRoute(); });
$("#shop-detail-close").addEventListener("click", () => $("#shop-detail-dialog").close());
$("#shop-detail-buy").addEventListener("click", () => {
  if (selectedShopSlot == null) return;
  if (!shopChoosingRecipient) chooseShopRecipient();
  else purchaseShopSlot(selectedShopSlot);
});
$("#route-map-close").addEventListener("click", () => $("#route-map-dialog").close());
logToggle.addEventListener("click", toggleBattleLog);
log.addEventListener("click", () => {
  if (playback) pauseForBattleLog();
  else { battleLogExpanded = !battleLogExpanded; updateBattleLogPanel(); }
});
$("#confirm-character-btn").addEventListener("click", confirmStartingCharacter);
$("#decision-confirm").addEventListener("click", confirmDecision);
speedButton.addEventListener("click", () => {
  if (!campaign || campaign.status !== "combat" || !playback || playbackPaused) return;
  fast = !fast;
  updateSpeedControl();
});

const musicController = createMusicController(musicTracks, globalThis.Audio, (state) => {
  const picker = $("#music-track");
  const toggle = $("#music-toggle");
  picker.replaceChildren();
  for (const [index, track] of state.tracks.entries()) {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = track.name;
    picker.append(option);
  }
  if (!state.available) picker.append(new Option("暂无音乐", ""));
  picker.disabled = !state.available;
  picker.value = state.available ? String(state.index) : "";
  toggle.disabled = !state.available;
  toggle.textContent = !state.available ? "暂无音乐" : state.playing ? "暂停" : "播放";
});
$("#music-toggle").addEventListener("click", () => {
  if (musicController.getState().playing) musicController.pause();
  else void musicController.play();
});
$("#music-track").addEventListener("change", (event) => {
  void musicController.select(Number(event.target.value));
});

setBattleControls(false);
initializeGame();
window.__pixelBattleReady = true;
