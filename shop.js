import { createSeededRandom } from "./routeMap.js";
import { GIANT_SPINAL_FLUID, GUN_DEVIL_FRAGMENT, TREASURE_DATA } from "./skills.js";
import { grantEliteSukunaFinger, grantGiantSpinalFluid, grantGunDevilFragment, hasStoneMask, learnActiveSkill, previewGrowingDrop } from "./progression.js";
import { SHOP_RULES } from "./shopConfig.js";

export const SHOP_TREASURES = Object.freeze({ ...TREASURE_DATA,
  [GIANT_SPINAL_FLUID.id]: GIANT_SPINAL_FLUID,
  [GUN_DEVIL_FRAGMENT.id]: GUN_DEVIL_FRAGMENT });

export function essenceRewardForBattle(battle) {
  if (!battle) return { amount: 0, reason: "unconfigured" };
  const special = battle.enemies?.find((id) => Object.hasOwn(SHOP_RULES.specialEssence, id));
  if (special) return { amount: SHOP_RULES.specialEssence[special], reason: special };
  if (battle.type === "event") return { amount: 0, reason: `unconfigured:${battle.enemies?.join(",") ?? battle.id}` };
  const type = battle.type === "demon" ? "boss" : battle.type;
  return { amount: SHOP_RULES.essence[type] ?? 0, reason: type };
}

function draw(random, items) { return items[Math.min(items.length - 1, Math.floor(random() * items.length))]; }

export function refreshShopPrices(campaign) {
  for (const slot of campaign?.activeShop?.slots ?? []) {
    const category = SHOP_RULES.categories.find((entry) => entry.id === slot.categoryId);
    if (category) slot.price = category.id === "medicine"
      ? SHOP_RULES.medicinePriceByStage[campaign.stageId] : category.price;
    const item = SHOP_TREASURES[slot.itemId] ?? SHOP_RULES.medicines.find((entry) => entry.id === slot.itemId)
      ?? SHOP_RULES.books.find((entry) => entry.id === slot.itemId);
    if (item?.image) slot.image = item.image;
    if (item) slot.placeholderArt = false;
  }
}

export function generateShopInventory(seed, stageId) {
  const random = createSeededRandom(`shop:${seed}`);
  const categories = SHOP_RULES.categories;
  const totalWeight = categories.reduce((sum, category) => sum + category.weight, 0);
  return Array.from({ length: SHOP_RULES.slots }, (_, index) => {
    let roll = random() * totalWeight;
    const category = categories.find((entry) => (roll -= entry.weight) < 0) ?? categories.at(-1);
    const pool = category.id === "book" ? SHOP_RULES.books : category.id === "medicine" ? SHOP_RULES.medicines.filter((item) => item.stageId === stageId)
      : category.ids.map((id) => SHOP_TREASURES[id]);
    const item = pool.length ? draw(random, pool) : null;
    return { index, categoryId: category.id, itemId: item?.id ?? null,
      name: item?.name ?? (category.id === "book" ? "技能书待配置" : "状态药物待配置"),
      image: item?.image ?? null, description: item?.description ?? "待配置／不可购买",
      price: category.id === "medicine" ? SHOP_RULES.medicinePriceByStage[stageId] : category.price,
      available: Boolean(item), placeholderArt: ["book", "medicine"].includes(category.id), purchased: false };
  });
}

export function previewShopItem(campaign, slot, recipientId = campaign?.playerId) {
  const member = campaign?.partyStates?.[recipientId];
  if (!slot || !member) return null;
  const item = SHOP_TREASURES[slot.itemId];
  const count = member.permanentEffects?.filter((effect) => effect.id === slot.itemId).length ?? 0;
  const alreadyOwned = slot.categoryId === "medicine" && (campaign.shopMedicines ?? [])
    .some((effect) => effect.recipientId === recipientId && effect.id === slot.itemId && effect.battlesLeft > 0);
  const growth = slot.categoryId === "growing" ? previewGrowingDrop(member, slot.itemId, 1) : null;
  return { ...slot, ownedCount: count, alreadyOwned, recipientId,
    expectedGains: growth ? { atk: growth.atk, def: growth.def, maxHp: growth.maxHp } : null,
    fullDescription: growth ? `${item.description} 本次购买预计：${growth.description.replace(/^第 1 关/, "商店")}` : slot.description };
}

function grantTreasure(member, slot, sourceId, stageId) {
  let effect;
  if (slot.itemId === GIANT_SPINAL_FLUID.id) effect = grantGiantSpinalFluid(member, sourceId, 1);
  else if (slot.itemId === GUN_DEVIL_FRAGMENT.id) effect = grantGunDevilFragment(member, sourceId, 1);
  else if (slot.itemId === TREASURE_DATA.sukuna_finger.id) effect = grantEliteSukunaFinger(member, sourceId, 1);
  else {
    const item = SHOP_TREASURES[slot.itemId];
    if (!item || member.consumedActions.includes(`shop-treasure:${sourceId}`)) return false;
    member.consumedActions.push(`shop-treasure:${sourceId}`);
    const repeat = member.permanentEffects.some((entry) => entry.id === item.id) ? 1.2 : 1;
    const gains = Object.fromEntries(["atk", "maxHp", "damageReduction", "dodgeRateBonus", "critRateBonus", "lifesteal"]
      .filter((key) => Number.isFinite(item[key])).map((key) => [key, item[key] > 0 ? item[key] * repeat : item[key]]));
    member.atk += gains.atk ?? 0;
    member.maxHp = Math.max(1, member.maxHp + (gains.maxHp ?? 0));
    member.currentHp = Math.min(member.currentHp, member.maxHp);
    if (gains.critRateBonus) member.critRate = Math.min(1, member.critRate + gains.critRateBonus);
    if (item.id === "angel_breath" && !(member.divinePunishment?.battlesLeft > 0) && !hasStoneMask(member)) member.currentHp = member.maxHp;
    effect = { ...item, ...gains, sourceId };
    member.permanentEffects.push(effect);
  }
  if (!effect) return false;
  effect.stageId = stageId;
  effect.sourceLabel = `第${stageId}关商店`;
  if (slot.categoryId === "growing") effect.description = effect.description.replace(/^第 1 关/, "商店");
  return effect;
}

export function buyShopItem(campaign, index, recipientId = campaign?.playerId) {
  if (campaign?.status !== "shop" || !campaign.activeShop || campaign.activeShop.nodeId !== campaign.activeNode?.id) return false;
  refreshShopPrices(campaign);
  const slot = campaign.activeShop.slots[index];
  const member = campaign.partyStates?.[recipientId];
  if (!slot?.available || slot.purchased || !member || !campaign.partyIds.includes(recipientId) ||
      (slot.categoryId === "medicine" && (campaign.shopMedicines ?? []).some((effect) =>
        effect.recipientId === recipientId && effect.id === slot.itemId && effect.battlesLeft > 0)) ||
      (campaign.essence ?? 0) < slot.price) return false;
  const sourceId = `shop:${campaign.stageId}:${campaign.activeShop.nodeId}:${index}`;
  let result;
  if (["common", "growing", "rare"].includes(slot.categoryId)) result = grantTreasure(member, slot, sourceId, campaign.stageId);
  else if (slot.categoryId === "book") {
    const book = SHOP_RULES.books.find((item) => item.id === slot.itemId);
    if (book && (!book.characterIds || book.characterIds.includes(recipientId))) {
      if (book.skillType === "active") result = learnActiveSkill(member, book.skillId, sourceId);
      else if (book.skillType === "passive" && !(member.extraPassiveSkillIds ?? []).includes(book.skillId)) {
        member.extraPassiveSkillIds ??= [];
        member.extraPassiveSkillIds.push(book.skillId);
        member.skillHistory.push({ skillId: book.skillId, level: 1, sourceId, kind: "learn" });
        result = book;
      }
    }
  } else if (slot.categoryId === "medicine") {
    const medicine = SHOP_RULES.medicines.find((item) => item.id === slot.itemId);
    if (medicine && [1, 2].includes(medicine.battles) && medicine.modifiers) {
      (campaign.shopMedicines ??= []).push({ id: medicine.id, recipientId, sourceId,
        battlesLeft: medicine.battles, modifiers: { ...medicine.modifiers } });
      result = medicine;
    }
  }
  if (!result) return false;
  campaign.essence -= slot.price;
  slot.purchased = true;
  const gains = slot.categoryId === "medicine" ? result.modifiers ?? {} :
    Object.fromEntries(["atk", "def", "maxHp"].filter((key) => result[key]).map((key) => [key, result[key]]));
  campaign.activeShop.purchases.push({ index, itemId: slot.itemId, recipientId, price: slot.price,
    stageId: campaign.stageId, gains, effect: slot.categoryId === "book" ? result.description : null });
  campaign.playerHp = campaign.runCharacterState.currentHp;
  campaign.playerMaxHp = campaign.runCharacterState.maxHp;
  return result;
}
