import test from "node:test";
import assert from "node:assert/strict";
import { STARTING_CHARACTERS, ELITE_ENEMY_DATA, COMBAT_RULES } from "./characters.js";
import { applyRadarEssenceGrowth, resolveStageTwoCampfire } from "./campaign.js";
import { executeAttack, getSkillDodgeChance, initializeBattle, simulateBattle } from "./battle.js";
import { createRunCharacterState, resolveCampfire } from "./progression.js";
import { SHOP_RULES } from "./shopConfig.js";
import { GIANT_SPINAL_FLUID, GUN_DEVIL_FRAGMENT, SKILL_DATA, TREASURE_DATA } from "./skills.js";

const unit = (id, team, stats = {}) => ({ id, name: id, team, originalTeam: team, row: team === "ally" ? "front" : "back",
  hp: 1000, maxHp: 1000, currentHp: 1000, atk: 100, def: 0, spd: 100,
  critChance: 0, normalDodgeRate: 0, skillDodgeRate: 0, skills: [], ...stats });

test("dragon radar counts only essence earned after pickup and awards multiple real rare treasures", () => {
  const member = createRunCharacterState(STARTING_CHARACTERS.find((entry) => entry.id === "naruto"), "shadow-clone-rush");
  const campaign = { partyIds: ["naruto"], partyStates: { naruto: member }, runCharacterState: member,
    stageId: 3, essence: 100, random: () => .4 };
  assert.deepEqual(applyRadarEssenceGrowth(campaign, 10), []);
  const radar = { id: "dragon_radar", name: "龙珠雷达", sourceId: "pickup" };
  member.permanentEffects.push(radar);
  assert.equal(applyRadarEssenceGrowth(campaign, 19).length, 0);
  const rewards = applyRadarEssenceGrowth(campaign, 26);
  assert.equal(rewards.length, 2);
  assert.equal(radar.essenceProgress, 5);
  assert.equal(campaign.essence, 100);
  const rareIds = [GIANT_SPINAL_FLUID.id, GUN_DEVIL_FRAGMENT.id,
    ...Object.values(TREASURE_DATA).filter((item) => item.grade === "rare").map((item) => item.id)];
  assert.ok(rewards.every((reward) => rareIds.includes(reward.treasureId)));
  assert.equal(new Set(rewards.map((reward) => reward.sourceId)).size, 2);
  assert.equal(member.permanentEffects.filter((effect) => effect.sourceLabel === "龙珠雷达精华奖励").length, 2);
});

test("dragon radar can draw all three rare drops with their stage-scaled settlement", () => {
  const expected = [GIANT_SPINAL_FLUID.id, GUN_DEVIL_FRAGMENT.id, "sukuna_finger"];
  for (const [index, roll] of [0, .4, .8].entries()) {
    const member = createRunCharacterState(STARTING_CHARACTERS.find((entry) => entry.id === "naruto"), "shadow-clone-rush");
    member.permanentEffects.push({ id: "dragon_radar", sourceId: `radar-${index}` });
    const campaign = { partyIds: ["naruto"], partyStates: { naruto: member }, runCharacterState: member,
      stageId: 3, essence: 20, random: () => roll };
    const reward = applyRadarEssenceGrowth(campaign, 20)[0];
    assert.equal(reward.treasureId, expected[index]);
    const acquired = member.permanentEffects.find((effect) => effect.sourceId === reward.sourceId);
    assert.equal(acquired.stageId, 3);
    assert.equal(acquired.sourceLabel, "龙珠雷达精华奖励");
  }
});

test("daily progress gives its holder two campfire skill upgrades exactly once", () => {
  const book = SHOP_RULES.books.find((entry) => entry.skillId === "daily-progress");
  assert.equal(book.price, 30);
  const member = createRunCharacterState(STARTING_CHARACTERS.find((entry) => entry.id === "naruto"), "shadow-clone-rush");
  member.extraPassiveSkillIds = ["daily-progress"];
  const before = member.skillLevels["shadow-clone-rush"];
  assert.equal(resolveCampfire(member, "first-fire", "skill_upgrade", ["shadow-clone-rush", "missing"]), false);
  assert.equal(member.skillLevels["shadow-clone-rush"], before);
  const result = resolveCampfire(member, "first-fire", "skill_upgrade", ["shadow-clone-rush", "shadow-clone-rush"]);
  assert.equal(result.extraSkill.level, before + 2);
  assert.equal(member.skillLevels["shadow-clone-rush"], before + 2);
  assert.equal(resolveCampfire(member, "first-fire", "skill_upgrade", ["shadow-clone-rush", "shadow-clone-rush"]), false);
  assert.equal(member.completedCampfires.filter((id) => id === "first-fire").length, 1);
});

test("two-person campfire gives the extra upgrade only to the book holder", () => {
  const naruto = createRunCharacterState(STARTING_CHARACTERS.find((entry) => entry.id === "naruto"), "shadow-clone-rush");
  const eren = createRunCharacterState(STARTING_CHARACTERS.find((entry) => entry.id === "eren"), "eren-free-will");
  naruto.extraPassiveSkillIds = ["daily-progress"];
  const campaign = { stageId: 2, status: "event", activeEventType: "campfire", eventResolved: false,
    activeNode: { id: "team-fire" }, partyIds: ["naruto", "eren"], partyStates: { naruto, eren },
    runCharacterState: naruto, resolvedEvents: [] };
  const result = resolveStageTwoCampfire(campaign, "skill_upgrade", {
    naruto: ["shadow-clone-rush", "shadow-clone-rush"], eren: "eren-free-will" });
  assert.equal(result.results.length, 2);
  assert.equal(naruto.skillLevels["shadow-clone-rush"], 3);
  assert.equal(eren.skillLevels["eren-free-will"], 2);
  assert.equal(resolveStageTwoCampfire(campaign, "skill_upgrade", {}), false);
});

test("evolved Tang shares 30 percent evenly and heals below 70 percent from real ally damage", () => {
  const state = initializeBattle([
    unit("tang", "ally", { currentHp: 200, passiveSkillId: "tang-compassion" }),
    unit("partner", "ally"), unit("summon", "ally", { summonerId: "tang" }),
    unit("foe", "enemy", { atk: 100 })]);
  state.round = 1;
  const [tang, partner, summon, foe] = state.characters;
  const hit = executeAttack(state, foe, tang, () => .99, { skill: null });
  assert.equal(hit.trialDamage.sharedDamages.length, 2);
  assert.deepEqual(hit.trialDamage.sharedDamages.map((entry) => entry.amount), [12, 12]);
  assert.equal(tang.currentHp, 144);
  assert.equal(partner.currentHp, 988);
  assert.equal(summon.currentHp, 988);
  const retaliation = executeAttack(state, partner, foe, () => .99, { skill: null });
  assert.equal(retaliation.actualDamage, 100);
  assert.equal(tang.currentHp, 164);
  tang.currentHp = 700;
  executeAttack(state, partner, foe, () => .99, { skill: null });
  assert.equal(tang.currentHp, 700);
});

test("Tang Flesh Lv2 heals 30 percent of summon HP damage", () => {
  const state = initializeBattle([unit("tang", "ally", { currentHp: 500, passiveSkillId: "tang-flesh", passiveLevel: 2 }),
    unit("summon", "ally", { summonerId: "tang" }), unit("foe", "enemy", { currentHp: 1000 })]);
  state.round = 1;
  const hit = executeAttack(state, state.characters[1], state.characters[2], () => .99, { skill: null });
  assert.equal(hit.actualDamage, 100);
  assert.equal(hit.summonerHealedAmount, 30);
  assert.equal(state.characters[0].currentHp, 530);
});

test("Silver King's round-eight bottle hurts both living kings by half the absorbed unit's current HP", () => {
  const gold = unit("gold-king", "enemy", { hp: 30000, maxHp: 30000, currentHp: 30000, atk: 1, spd: 1, rosterOrder: 2 });
  const silver = { ...ELITE_ENEMY_DATA.find((entry) => entry.id === "silver-king"),
    hp: 30000, maxHp: 30000, currentHp: 30000, atk: 1, def: 0, spd: 1, rosterOrder: 3 };
  const result = simulateBattle([unit("hero", "ally", { atk: 10, rosterOrder: 0 }),
    unit("partner", "ally", { atk: 5, rosterOrder: 1 }), gold, silver], () => .99, { playerId: "hero" });
  const bottle = result.events.find((event) => event.type === "silver-bottle");
  assert.equal(bottle?.round, 8);
  assert.equal(bottle.kingHits.length, 2);
  assert.ok(bottle.kingHits.every((hit) => hit.actualDamage === Math.floor(bottle.targetHpBefore * .5)));
  assert.equal(result.events.filter((event) => event.type === "silver-bottle").length, 1);
});

test("configured skill dodge is halved once and Boros phase threshold is 1600", () => {
  assert.equal(COMBAT_RULES.skillDodgeChanceCap, .25);
  assert.equal(getSkillDodgeChance({ spd: 0, skillDodgeRateBonus: .15 }), .152);
  assert.equal(SKILL_DATA["tang-flesh"].levels[2].summonHealRatio, .3);
});
