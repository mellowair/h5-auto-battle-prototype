// The two opponents share one battle state. Timings and visual anchors live here.
const asset = (name) => `assets/hidden-boss/${name}.png`;

export const HIDDEN_BOSS_RULES = Object.freeze({
  fragmentGoal: 5,
  rewardEssence: 20,
  entryHealFraction: 1,
  firstSkillPhaseRound: 2,
  skillEveryRounds: 2,
  gunDeathHoldMs: 2000,
  yoruWalkMs: 3000,
  yoruEntranceHoldMs: 3000,
  gunBulletFlightMs: 1450,
  gunNormalBulletFlightMs: 700,
  yoruBulletFlightMs: 1250,
  swordFlightMs: 900,
  swordReturnMs: 840,
  tankShowMs: 650,
});

export const GUN_DEVIL = Object.freeze({
  id: "gun-devil", name: "枪之恶魔", type: "boss", team: "enemy", role: "隐藏首领",
  row: "back", position: "back", hp: 3500, atk: 800, def: 120, spd: 300,
  attackType: "ranged", asset: asset("gun-idle"), visualId: "gun-devil",
  activeSkills: ["gun-devil-charged-shot"], attackAnimation: "normalAttack",
  skillAnimationMap: { "gun-devil-charged-shot": "charge" },
  animations: {
    idle: { type: "frames", frames: { idle: asset("gun-idle") } },
    normalAttack: { type: "frames", frames: { fire: asset("gun-attack") } },
    charge: { type: "frames", frames: { charge: asset("gun-charge"), fire: asset("gun-fire") } },
    death: { type: "frames", frames: { down: asset("gun-death") } },
  },
  projectileAsset: asset("bullet"), projectileEffectAsset: asset("bullet-effect"),
});

export const YORU = Object.freeze({
  id: "yoru", name: "战争恶魔·夜", type: "boss", team: "enemy", role: "隐藏首领",
  row: "back", position: "back", hp: 6000, atk: 1000, def: 180, spd: 180,
  attackType: "ranged", asset: asset("yoru-idle"), visualId: "yoru",
  activeSkills: ["yoru-gun-summon"], attackAnimation: "pointUp",
  skillAnimationMap: { "yoru-gun-summon": "pointAtTarget" },
  animations: {
    idle: { type: "frames", frames: { idle: asset("yoru-idle") } },
    walk: { type: "frames", frames: { first: asset("yoru-walk-1"), second: asset("yoru-walk-2") } },
    tank: { type: "frames", frames: { first: asset("yoru-tank-1"), second: asset("yoru-tank-2") } },
    pointUp: { type: "frames", frames: { point: asset("yoru-point-up") } },
    pointAtTarget: { type: "frames", frames: { point: asset("yoru-point-target") } },
  },
  entranceAsset: asset("yoru-entrance"), tankAssets: [asset("yoru-tank-1"), asset("yoru-tank-2")],
  summonedGunAsset: asset("yoru-summoned-gun"), projectileAsset: asset("bullet"),
  projectileEffectAsset: asset("bullet-effect"),
});

export const SPINAL_SWORD_BY_PARTNER = Object.freeze({
  eren: asset("sword-eren"), naruto: asset("sword-naruto"),
  tang: asset("sword-tang"), kaneki: asset("sword-kaneki"),
});

export const HIDDEN_BOSS_BACKGROUND = asset("gun-background");

export function hiddenBossShotLayout(sourceRect, targetRect, fighterRect, arenaRect, muzzleAnchor) {
  const start = { x: sourceRect.left - arenaRect.left + sourceRect.width * muzzleAnchor.x,
    y: sourceRect.top - arenaRect.top + sourceRect.height * muzzleAnchor.y };
  return { start, end: { x: targetRect.left - arenaRect.left + targetRect.width / 2, y: start.y },
    ground: { x: fighterRect.left - arenaRect.left + fighterRect.width / 2,
      y: fighterRect.bottom - arenaRect.top - 4 } };
}

export function fragmentCount(campaign) {
  return (campaign?.partyIds ?? []).reduce((total, id) => total +
    (campaign.partyStates?.[id]?.permanentEffects ?? []).filter((effect) => effect.id === "gun_devil_fragment").length, 0);
}
