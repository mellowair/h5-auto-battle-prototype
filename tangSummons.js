// Tang Sanzang's battle-only summon rules. All generated units are independent roster entries.
export const TANG_SUMMON_WEIGHTS = Object.freeze({
  1: [100, 0, 0, 0], 2: [80, 20, 0, 0], 3: [60, 40, 0, 0],
  4: [40, 60, 0, 0], 5: [20, 80, 0, 0], 6: [0, 80, 20, 0],
  7: [0, 60, 40, 0], 8: [0, 40, 60, 0], 9: [0, 20, 80, 0],
  10: [0, 30, 45, 25],
});

export const TANG_SUMMON_IDS = Object.freeze(["white-horse", "bajie", "shaseng", "wukong"]);

const SUMMON_META = Object.freeze({
  "white-horse": { name: "白龙马", prefix: "horse", skillId: "horse-hoof", attackType: "melee" },
  bajie: { name: "八戒", prefix: "bajie", skillId: "bajie-rake", attackType: "melee" },
  shaseng: { name: "沙僧", prefix: "shaseng", skillId: "shaseng-staff", attackType: "ranged" },
  wukong: { name: "孙悟空", prefix: "wukong", skillId: "wukong-fate", attackType: "melee" },
});

export function tangSummonVisual(kind) {
  const meta = SUMMON_META[kind];
  if (!meta) return null;
  const asset = `assets/tang/${meta.prefix}_idle.png`;
  const skillAsset = kind === "wukong" ? "assets/tang/wukong_charge.png" : `assets/tang/${meta.prefix}_skill.png`;
  const deathAsset = `assets/tang/${meta.prefix}_death.png`;
  return { name: meta.name, asset, attackType: meta.attackType, skillId: meta.skillId,
    visualId: `tang-${kind}`, skillAnimationMap: kind === "wukong" ? { [meta.skillId]: "skillAttack" } : { [meta.skillId]: "skill1" },
    animations: {
      idle: { type: "frames", frames: { idle: asset } },
      meleeAttack: { type: "frames", frames: { strike: kind === "wukong" ? "assets/tang/wukong_attack.png" : asset } },
      skill1: { type: "frames", frames: { cast: skillAsset }, durationsMs: [400] },
      ...(kind === "wukong" ? {
        charge: { type: "frames", frames: { charge: skillAsset }, durationsMs: [500] },
        skillAttack: { type: "frames", frames: { teleport: "assets/tang/wukong_teleport.png", strike: "assets/tang/wukong_attack.png" }, durationsMs: [180, 420] },
      } : {}),
      death: { type: "frames", frames: { down: deathAsset } },
    } };
}

export function chooseTangSummon(level, summonedKinds = [], random = Math.random) {
  const weights = TANG_SUMMON_WEIGHTS[level];
  if (!weights) return null;
  const seen = new Set(summonedKinds);
  if ((level === 4 || level === 5) && seen.has("bajie") && !seen.has("white-horse")) return "white-horse";
  if (level >= 6 && level <= 9 && seen.has("shaseng") && !seen.has("bajie")) return "bajie";
  const roll = Math.max(0, Math.min(0.999999999, Number(random()) || 0)) * 100;
  let boundary = 0;
  for (let index = 0; index < weights.length; index += 1) {
    boundary += weights[index];
    if (roll < boundary) return seen.has(TANG_SUMMON_IDS[index]) ? null : TANG_SUMMON_IDS[index];
  }
  return null;
}

const whole = (value) => Math.max(1, Math.floor(value));

export function tangSummonStats(kind, summoner) {
  if (kind === "wukong") return { hp: 4300, atk: 500, def: 250, spd: 250 };
  const growth = summoner.tangGrowth ?? { maxHp: 0, atk: 0, def: 0, spd: 0 };
  const scaled = (base, extra, multiplier) => whole(base * multiplier + extra * Math.min(multiplier, 1));
  if (kind === "white-horse") return { hp: scaled(700, growth.maxHp, 1.5), atk: scaled(300, growth.atk, .5), def: scaled(30, growth.def, 2), spd: scaled(10, growth.spd, 5) };
  if (kind === "bajie") return { hp: scaled(700, growth.maxHp, 3), atk: scaled(300, growth.atk, 1/3), def: scaled(30, growth.def, 2.5), spd: scaled(10, growth.spd, 2) };
  if (kind === "shaseng") return { hp: scaled(700, growth.maxHp, 2.5), atk: scaled(300, growth.atk, 2/3), def: scaled(30, growth.def, 3), spd: scaled(10, growth.spd, 3) };
  return null;
}
