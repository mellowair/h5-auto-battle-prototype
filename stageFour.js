import { ELITE_ENEMY_DATA } from "./characters.js";

// Encounter IDs are the draw and reward units. A duo keeps both combat actors.
const ROW_OVERRIDES = Object.freeze({
  "titan-duo": "front", "shin-noi": "front", "gold-silver-kings": "back",
});
const BASE_STATS = Object.freeze({
  "bomb-demon": { hp: 3000, atk: 500, def: 150, spd: 170 },
  mahito: { hp: 3500, atk: 400, def: 200, spd: 100 },
  "eternity-devil": { hp: 4000, atk: 270, def: 130, spd: 50 },
  "swamp-giant": { hp: 3200, atk: 290, def: 170, spd: 120 },
  kira: { hp: 2800, atk: 650, def: 180, spd: 160 },
  "armored-titan": { hp: 3000, atk: 300, def: 230, spd: 100 },
  "colossal-titan": { hp: 2500, atk: 0, def: 120, spd: 10 },
  toji: { hp: 3800, atk: 450, def: 160, spd: 350 },
  "falling-devil": { hp: 6000, atk: 500, def: 230, spd: 150 },
  "aging-devil": { hp: 6000, atk: 500, def: 230, spd: 150 },
  "gold-king": { hp: 3700, atk: 250, def: 210, spd: 100 },
  "silver-king": { hp: 3300, atk: 280, def: 180, spd: 100 },
});
const STATS = Object.freeze(Object.fromEntries(ELITE_ENEMY_DATA.map((enemy) => {
  const base = BASE_STATS[enemy.id] ?? enemy;
  return [enemy.id, Object.freeze({ hp: base.hp + 500, atk: base.atk + 30,
    def: base.def + 30, spd: base.spd + 30 })];
})));
const DROP_OVERRIDES = Object.freeze({
  mahito: "sukuna_finger", toji: "sukuna_finger", kira: "sukuna_finger",
  "shin-noi": "sukuna_finger", "gold-silver-kings": "sukuna_finger",
  "bomb-demon": "gun_devil_fragment", "eternity-devil": "gun_devil_fragment",
  "falling-devil": "gun_devil_fragment", "aging-devil": "gun_devil_fragment",
  "swamp-giant": "giant_spinal_fluid", "titan-duo": "giant_spinal_fluid",
  "might-guy": "ninja_footwear",
});

const grouped = new Map();
for (const enemy of ELITE_ENEMY_DATA) {
  const id = enemy.eliteEncounterId ?? enemy.id;
  if (!grouped.has(id)) grouped.set(id, []);
  grouped.get(id).push(enemy);
}

export const STAGE_FOUR_UNITS = Object.freeze([...grouped].map(([id, members]) => Object.freeze({
  id, name: members.map((member) => member.name).join("／"),
  row: ROW_OVERRIDES[id] ?? members[0].row ?? "front",
  enemies: Object.freeze(members.map((member) => member.id)),
  rewardId: DROP_OVERRIDES[id] ?? null,
})));

export const STAGE_FOUR_ENEMY_STATS = STATS;
export const STAGE_FOUR_BOSS = Object.freeze({
  id: "darkness-devil", name: "暗之恶魔", type: "boss", team: "enemy", role: "第四关首领",
  row: "back", position: "back", hp: 9999, atk: 999, def: 555, spd: 444,
  attackType: "ranged", asset: "assets/stage4-darkness/idle.png", activeSkills: ["darkness-sever"],
  attackAnimation: "idle", skillAnimationMap: { "darkness-sever": "severCharge" },
  animations: {
    idle: { type: "frames", frames: { idle: "assets/stage4-darkness/idle.png" } },
    vanish: { type: "frames", frames: { hold: "assets/stage4-darkness/vanish.png" } },
    severCharge: { type: "frames", frames: { charge: "assets/stage4-darkness/charge.png" } },
    hit: { type: "frames", frames: { hurt: "assets/stage4-darkness/hit.png" } },
    death: { type: "frames", frames: { down: "assets/stage4-darkness/death.png" } },
  },
});

export function getStageFourUnit(id) { return STAGE_FOUR_UNITS.find((unit) => unit.id === id) ?? null; }
export function stageFourUnitForEnemy(enemyId) {
  return STAGE_FOUR_UNITS.find((unit) => unit.enemies.includes(enemyId)) ?? null;
}
export function pickStageFourUnits(type, history = [], random = Math.random) {
  const counts = new Map();
  for (const id of history) counts.set(id, (counts.get(id) ?? 0) + 1);
  const pick = (pool) => {
    if (!pool.length) throw new RangeError("第四关缺少可用敌人");
    const fewest = Math.min(...pool.map((unit) => counts.get(unit.id) ?? 0));
    const candidates = pool.filter((unit) => (counts.get(unit.id) ?? 0) === fewest);
    return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
  };
  return type === "elite"
    ? [pick(STAGE_FOUR_UNITS.filter((unit) => unit.row === "front")),
      pick(STAGE_FOUR_UNITS.filter((unit) => unit.row === "back"))]
    : [pick(STAGE_FOUR_UNITS)];
}
export function stageFourBattle(units, type, number, step) {
  const enemies = units.flatMap((unit) => unit.enemies);
  const templates = new Map(ELITE_ENEMY_DATA.map((enemy) => [enemy.id, enemy]));
  return { number, step, type, stageFourUnitIds: units.map((unit) => unit.id),
    title: units.map((unit) => unit.name).join(" + "), location: "第四关遭遇地点",
    description: "昔日精英再度挡住去路。", enemies,
    enemyNames: Object.fromEntries(enemies.map((id) => [id, templates.get(id).name])),
    enemyBaseStats: Object.fromEntries(enemies.map((id) => [id, STATS[id]])),
    enemyGrowthExemptIds: enemies,
  };
}
