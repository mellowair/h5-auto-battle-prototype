import { CHARACTER_DATA } from "./characters.js";

export function initializeBattle(config = CHARACTER_DATA) {
  return {
    characters: config.map((character) => ({ ...character, skill: character.skill ? { ...character.skill } : null, maxHp: character.hp, currentHp: character.hp, alive: true })),
    round: 0,
    status: "ready",
  };
}

export function getActionOrder(state) {
  return state.characters.filter((c) => c.alive && c.currentHp > 0)
    .sort((a, b) => b.spd - a.spd || a.rosterOrder - b.rosterOrder);
}

export function chooseTarget(state, attacker, random = Math.random) {
  const candidates = state.characters.filter((c) => c.team !== attacker.team && c.alive && c.currentHp > 0);
  const frontRow = candidates.filter((c) => c.row === "front");
  const pool = frontRow.length ? frontRow : candidates;
  return pool.length ? pool[Math.floor(random() * pool.length)] : null;
}

export function skillTriggers(character, random = Math.random) {
  return Boolean(character.skill && random() < character.skill.chance);
}

export function calculateDamage(attacker, target, multiplier = 1) {
  const base = (attacker.atk * 100) / (100 + target.def);
  return Math.max(1, Math.floor(base * multiplier));
}

export function handleDeath(character) {
  if (character.currentHp <= 0) {
    character.currentHp = 0;
    character.alive = false;
    return true;
  }
  return false;
}

export function isBattleOver(state) {
  const livingTeams = new Set(state.characters.filter((c) => c.alive && c.currentHp > 0).map((c) => c.team));
  if (!livingTeams.has("ally")) return "defeat";
  if (!livingTeams.has("enemy")) return "victory";
  return null;
}

export function executeAttack(state, attacker, target, random = Math.random) {
  const skilled = skillTriggers(attacker, random);
  const multiplier = skilled ? attacker.skill.multiplier : 1;
  const damage = calculateDamage(attacker, target, multiplier);
  target.currentHp = Math.max(0, target.currentHp - damage);
  const died = handleDeath(target);
  return { type: "attack", attackerId: attacker.id, targetId: target.id, damage, skilled, skillName: skilled ? attacker.skill.name : null, targetHp: target.currentHp, targetMaxHp: target.maxHp, targetDied: died };
}

// Resolve the complete battle up front. The UI only replays these immutable results,
// so animation speed and skipping cannot affect random choices or apply damage twice.
export function simulateBattle(random = Math.random) {
  const state = initializeBattle();
  const events = [];
  let outcome = null;
  while (!outcome) {
    state.round += 1;
    for (const orderedActor of getActionOrder(state)) {
      const attacker = state.characters.find((c) => c.id === orderedActor.id);
      if (!attacker.alive || attacker.currentHp <= 0) continue;
      const target = chooseTarget(state, attacker, random);
      if (!target) break;
      const event = executeAttack(state, attacker, target, random);
      event.round = state.round;
      events.push(event);
      outcome = isBattleOver(state);
      if (outcome) break;
    }
  }
  events.push({ type: "battle-end", outcome, round: state.round });
  return { events, outcome, rounds: state.round };
}

export function restartBattle() {
  return initializeBattle();
}
