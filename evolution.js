import { SKILL_DATA } from "./skills.js";
import { upgradeActiveSkill } from "./progression.js";

export const EVOLUTION_DATA = Object.freeze({
  eren: { name: "进击巨人", self: .10, aura: { atk: .10, maxHp: .20, spd: .10, def: .30 },
    passive: "eren-paths", skills: ["eren-hardening", "eren-warhammer"] },
  kaneki: { name: "白发金木", self: .10, aura: { atk: .30, maxHp: .10, spd: .10, def: .10 },
    passive: "kaneki-one-eye-king", skills: ["kaneki-glutton", "kaneki-2000-14"] },
  naruto: { name: "九尾鸣人", self: .15, aura: { atk: .20, maxHp: .10, spd: .20, def: .10 },
    passive: "naruto-nine-tails-bond", extraPassive: "naruto-chakra-clones",
    skills: ["naruto-multi-clone", "naruto-giant-rasengan"] },
  tang: { name: "旃檀功德佛", self: .10, aura: { atk: .15, maxHp: .15, spd: .15, def: .15 },
    passive: "tang-compassion", skills: ["journey-west", "tang-boundless-dharma"] },
});

export function evolutionDisplayName(id, evolution) {
  if (evolution?.phase !== 2) return null;
  // Older local saves still carry the former Eren name in their snapshot.
  return id === "eren" ? EVOLUTION_DATA.eren.name : evolution.name;
}

const STATS = ["maxHp", "atk", "def", "spd"];

// Only the opening hero evolves in a formal run. The optional character ID is
// used by the local visual test to inspect a partner's form in isolation.
export function evolveTrialParty(campaign, evolvingCharacterId = campaign?.playerId ?? campaign?.partyIds?.[0]) {
  if (!campaign?.trialCompleted || !campaign.evolutionPending || campaign.evolutionRewards) return false;
  if (!campaign.partyIds?.includes(evolvingCharacterId)) throw new RangeError("Evolution hero must belong to the party");
  const snapshots = Object.fromEntries(campaign.partyIds.map((id) => {
    const state = campaign.partyStates[id];
    if (!state || !EVOLUTION_DATA[id]) throw new RangeError(`Missing evolution state for ${id}`);
    return [id, Object.fromEntries(STATS.map((stat) => [stat, state[stat]]))];
  }));
  const id = evolvingCharacterId;
  const state = campaign.partyStates[id];
  const config = EVOLUTION_DATA[id];
  if (state.evolution?.phase === 2) return false;
  const selfStats = Object.fromEntries(STATS.map((stat) =>
    [stat, snapshots[id][stat] + Math.floor(snapshots[id][stat] * config.self)]));
  for (const stat of STATS) state[stat] = selfStats[stat];
  for (const teammateId of campaign.partyIds.filter((memberId) => memberId !== id)) {
    const teammate = campaign.partyStates[teammateId];
    const bonuses = Object.fromEntries(STATS.map((stat) => [stat, Math.floor(selfStats[stat] * config.aura[stat])]));
    for (const stat of STATS) teammate[stat] += bonuses[stat];
    teammate.currentHp = Math.min(teammate.currentHp, teammate.maxHp);
    teammate.evolutionAuraSources ??= [];
    teammate.evolutionAuraSources.push({ sourceId: id, bonuses });
  }
  // A higher maximum HP follows the existing rule: current HP is unchanged.
  state.currentHp = Math.min(state.currentHp, state.maxHp);
  const formerJourneyLevel = state.skillLevels["journey-west"] ?? 1;
  state.passiveSkillId = config.passive;
  state.passiveLevel = 1;
  state.extraPassiveSkillIds = config.extraPassive ? [config.extraPassive] : [];
  state.activeSkillPool = [...config.skills];
  state.learnedActiveSkills = [...config.skills];
  state.skillLevels = { ...state.skillLevels,
    [config.skills[0]]: id === "tang" ? Math.max(1, formerJourneyLevel - 2) : 1,
    [config.skills[1]]: 1 };
  state.evolution = { phase: 2, name: config.name, source: "divine-trial", ownSnapshot: snapshots[id],
    postSelfSnapshot: selfStats, auraRecipients: campaign.partyIds.filter((memberId) => memberId !== id) };
  campaign.evolutionPending = false;
  campaign.evolutionRewards = { order: [id], index: 0, remaining: 4, totalPerCharacter: 4 };
  campaign.playerHp = campaign.partyStates[campaign.playerId]?.currentHp ?? campaign.playerHp;
  campaign.playerMaxHp = campaign.partyStates[campaign.playerId]?.maxHp ?? campaign.playerMaxHp;
  campaign.status = "evolution_reward";
  return true;
}

export function chooseEvolutionUpgrade(campaign, skillId) {
  const reward = campaign?.evolutionRewards;
  if (campaign?.status !== "evolution_reward" || !reward || reward.remaining < 1) return false;
  const id = reward.order[reward.index];
  const state = campaign.partyStates[id];
  if (!state?.learnedActiveSkills.includes(skillId)) return false;
  const config = SKILL_DATA[skillId];
  if (!config || (state.skillLevels[skillId] ?? 1) >= config.maxLevel) return false;
  const source = `evolution:${id}:${reward.totalPerCharacter - reward.remaining + 1}`;
  const result = upgradeActiveSkill(state, skillId, source);
  if (!result) return false;
  reward.remaining -= 1;
  if (reward.remaining === 0) {
    reward.index += 1;
    if (reward.index < reward.order.length) reward.remaining = reward.totalPerCharacter;
    else campaign.status = "route";
  }
  return result;
}
