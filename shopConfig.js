// Shop balance and item definitions live here.
export const SHOP_RULES = Object.freeze({
  targetNodes: 2, minimumNodesBetweenShops: 3, slots: 5,
  essence: Object.freeze({ normal: 1, elite: 3, boss: 5 }),
  specialEssence: Object.freeze({ dina: 3, arima: 3, six_ear: 3, gilgamesh: 5 }),
  medicinePriceByStage: Object.freeze({ 1: 1, 2: 2, 3: 3 }),
  categories: Object.freeze([
    { id: "common", weight: 30, price: 5, ids: ["magic_conch", "odm_gear"] },
    { id: "medicine", weight: 30, price: null, ids: [] },
    { id: "growing", weight: 20, price: 10, ids: ["sukuna_finger", "gun_devil_fragment", "giant_spinal_fluid"] },
    { id: "book", weight: 10, price: 20, ids: [] },
    { id: "rare", weight: 10, price: 20, ids: ["angel_breath", "stone_mask", "nichirin_blade"] },
  ]),
  // A future medicine has {id,name,image,description,battles:1|2,modifiers,stackable}.
  medicines: Object.freeze([1, 2, 3].flatMap((stageId) => ["atk", "def"].map((stat) => ({
    id: `medicine_${stat}_${stageId}`, stageId, name: stat === "atk" ? "攻击药剂" : "防御药剂",
    image: stat === "atk" ? "assets/shop/attack-potion.svg" : "assets/shop/defense-potion.svg",
    description: `下一场战斗 ${stat.toUpperCase()} +${stageId * 10 + 10}；战斗结束后失效。`,
    battles: 1, modifiers: { [stat]: stageId * 10 + 10 }, stackable: false,
  })))),
  // A future book has {id,name,image,description,skillId,skillType,characterIds}.
  books: Object.freeze([{ id: "iron_bell_book", name: "金钟罩铁布衫", image: "assets/shop/skill-book.svg",
    description: "被动技能：自身防御高于伤害来源时，将本次实际受到伤害的 50% 反弹给伤害来源。",
    skillId: "iron-bell", skillType: "passive", characterIds: null }]),
  allowDuplicateItemsInShop: true,
});
