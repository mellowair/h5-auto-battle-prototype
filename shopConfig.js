// Shop balance and item definitions live here.
export const SHOP_RULES = Object.freeze({
  targetNodes: 2, minimumNodesBetweenShops: 3, slots: 7,
  essence: Object.freeze({ normal: 2, elite: 4, boss: 7 }),
  specialEssence: Object.freeze({ dina: 4, arima: 4, six_ear: 4, gilgamesh: 7 }),
  medicinePriceByStage: Object.freeze({ 1: 1, 2: 2, 3: 3 }),
  categories: Object.freeze([
    { id: "common", weight: 30, price: 15, ids: ["magic_conch", "odm_gear", "universal_capsule", "rock_lee_weights", "drip_coffee", "vip_card"] },
    { id: "medicine", weight: 30, price: null, ids: [] },
    { id: "rare", weight: 10, price: 20, ids: ["sukuna_finger", "gun_devil_fragment", "giant_spinal_fluid"] },
    { id: "legendary", weight: 10, price: 40, ids: ["angel_breath", "stone_mask", "nichirin_blade", "dragon_radar", "hogyoku_fragment", "shikon_fragment", "quinque_crit", "quinque_guard", "premium_vip_card"] },
    { id: "book", weight: 20, price: 40, ids: [] },
  ]),
  // A future medicine has {id,name,image,description,battles:1|2,modifiers,stackable}.
  medicines: Object.freeze([1, 2, 3].flatMap((stageId) => ["atk", "def"].map((stat) => ({
    id: `medicine_${stat}_${stageId}`, stageId, name: stat === "atk" ? "攻击药剂" : "防御药剂",
    image: "assets/shop/potion.png",
    description: `下一场战斗 ${stat.toUpperCase()} +${stageId * 10 + 10}；战斗结束后失效。`,
    battles: 1, modifiers: { [stat]: stageId * 10 + 10 }, stackable: false,
  })))),
  // A future book has {id,name,image,description,skillId,skillType,characterIds}.
  books: Object.freeze([
    { id: "iron_bell_book", name: "金钟罩铁布衫", image: "assets/shop/skill-book.png", effectImage: "assets/shop/iron-bell-effect.png", price: 40,
      description: "被普通攻击或主动技能命中且自身当前 DEF 严格高于伤害来源时，按实际承伤的 50% 发动一次受目标 DEF 减免的反击。",
      skillId: "iron-bell", skillType: "passive", characterIds: null },
    { id: "armament_haki_book", name: "武装色霸气", image: "assets/shop/skill-book.png", effectImage: "assets/shop/armament-haki-effect.png", price: 30,
      description: "被动技能：普通攻击按原攻击威力造成真实伤害。",
      skillId: "armament-haki", skillType: "passive", characterIds: null },
    { id: "heavenly_restriction_book", name: "天予咒缚", image: "assets/shop/skill-book.png", effectImage: "assets/shop/heavenly-restriction-effect.png", price: 40,
      description: "被动技能：禁用其他主动技能，按实际禁用等级获得 ATK；速度高于目标时追加普通攻击。达到四次攻击后每行动一次休息一回合。",
      skillId: "heavenly-restriction-book", skillType: "passive", characterIds: null },
    { id: "undying_subspecies_book", name: "不死亚种", image: "assets/shop/skill-book.png", effectImage: "assets/shop/undying-subspecies-effect.png", price: 40,
      description: "被动技能：每战首次致命伤害保留 1 HP，之后 3 回合无法通过行动恢复 HP。",
      skillId: "undying-subspecies", skillType: "passive", characterIds: null },
    { id: "lonelier_than_fireworks_book", name: "比烟花还寂寞", image: "assets/shop/skill-book.png", price: 30,
      description: "将角色已有的被动技能从 Lv.1 升级到 Lv.2；已有 Lv.2 或无可升级被动时无法使用。",
      skillType: "passive-upgrade", characterIds: null },
  ]),
  allowDuplicateItemsInShop: false,
});
