import { createSeededRandom } from "./routeMap.js";
import { GIANT_SPINAL_FLUID, GUN_DEVIL_FRAGMENT, TREASURE_DATA } from "./skills.js";
import { applyPassiveBookStats, applyRockLeeWeight, grantAdventureSpecialReward, grantEliteSukunaFinger, grantGiantSpinalFluid, grantGunDevilFragment, grantQuinque, learnActiveSkill, previewGrowingDrop, upgradePassiveSkill } from "./progression.js";
import { MAX_PARTY_MEMBERS, recruitPartyMember } from "./partyRecruitment.js";
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
const GROWING_SHOP_IDS = new Set(["sukuna_finger", "gun_devil_fragment", "giant_spinal_fluid"]);
function shopPrice(item, category) {
  if (category.id === "book" && item?.price == null) return null;
  return item?.price ?? (item?.grade === "legendary" ? 40 : item?.grade === "rare" ? 20
    : GROWING_SHOP_IDS.has(item?.id) ? 20 : category.price);
}

const VIP_RULES = Object.freeze({ vip_card: { multiplier: .8, purchases: 3, shops: 2 },
  premium_vip_card: { multiplier: .6, purchases: 5, shops: 4 } });

export function activateVipCard(campaign, itemId) {
  const rule = VIP_RULES[itemId];
  if (!campaign || !rule) return false;
  campaign.shopDiscount = { type: itemId, multiplier: rule.multiplier, usedPurchases: 0,
    enteredShops: 0, acquiredShopId: campaign.status === "shop" ? campaign.activeShop?.nodeId : null,
    countedShopIds: [], expired: false };
  refreshShopPrices(campaign);
  return campaign.shopDiscount;
}

export function registerShopEntry(campaign, nodeId) {
  const vip = campaign?.shopDiscount;
  if (vip && !vip.expired && nodeId !== vip.acquiredShopId && !vip.countedShopIds.includes(nodeId)) {
    vip.countedShopIds.push(nodeId);
    vip.enteredShops += 1;
    if (vip.enteredShops >= VIP_RULES[vip.type].shops) vip.expired = true;
  }
  const ticket = campaign?.vipTrialTicket;
  if (ticket && !ticket.used && !ticket.shopId) ticket.shopId = nodeId;
  refreshShopPrices(campaign);
}

function activeDiscount(campaign) {
  const ticket = campaign?.vipTrialTicket;
  if (ticket && !ticket.used && ticket.shopId === campaign?.activeShop?.nodeId) return { kind: "ticket", multiplier: .6 };
  const vip = campaign?.shopDiscount;
  return vip && !vip.expired ? { kind: "card", multiplier: vip.multiplier } : { kind: null, multiplier: 1 };
}

export function refreshShopPrices(campaign) {
  // Retire the removed skill book from shops already stored in an older save.
  const slots = campaign?.activeShop?.slots ?? [];
  const takenIds = new Set(slots.map((slot) => slot.itemId));
  for (const slot of slots) {
    if (slot.itemId !== "lonelier_than_fireworks_book") continue;
    const replacement = SHOP_RULES.books.find((book) => !takenIds.has(book.id));
    if (!replacement) continue;
    takenIds.add(replacement.id);
    Object.assign(slot, { itemId: replacement.id, name: replacement.name, image: replacement.image,
      description: replacement.description, placeholderArt: false });
  }
  for (const slot of campaign?.activeShop?.slots ?? []) {
    const category = SHOP_RULES.categories.find((entry) => entry.id === slot.categoryId)
      ?? (slot.categoryId === "growing" ? { id: "growing", price: 20 } : null);
    const item = SHOP_TREASURES[slot.itemId] ?? SHOP_RULES.medicines.find((entry) => entry.id === slot.itemId)
      ?? SHOP_RULES.books.find((entry) => entry.id === slot.itemId);
    if (category) {
      slot.basePrice = category.id === "medicine"
        ? SHOP_RULES.medicinePriceByStage[campaign.stageId] : shopPrice(item, category);
      slot.price = slot.itemId === "prison_realm" ? 180 : Math.ceil(slot.basePrice * activeDiscount(campaign).multiplier);
    }
    if (item?.image) slot.image = item.image;
    if (item) slot.placeholderArt = false;
  }
}

export function generateShopInventory(seed, stageId) {
  const random = createSeededRandom(`shop:${seed}`);
  const categories = SHOP_RULES.categories;
  const selectedIds = new Set();
  return Array.from({ length: SHOP_RULES.slots }, (_, index) => {
    const available = categories.map((category) => ({ category,
      pool: (category.id === "book" ? SHOP_RULES.books : category.id === "medicine" ? SHOP_RULES.medicines.filter((item) => item.stageId === stageId)
        : category.ids.map((id) => SHOP_TREASURES[id]).filter((item) => item &&
          (!["common", "rare", "legendary"].includes(category.id) || item.grade === category.id ||
            category.id === "legendary" && item.grade === "superlegendary")))
        .filter((item) => !selectedIds.has(item.id) && (category.id === "medicine" || Number.isFinite(shopPrice(item, category))))
    })).filter((entry) => entry.pool.length > 0);
    if (!available.length) throw new Error("商店可用商品不足 7 件");
    const totalWeight = available.reduce((sum, entry) => sum + entry.category.weight, 0);
    let roll = random() * totalWeight;
    const { category, pool } = available.find((entry) => (roll -= entry.category.weight) < 0) ?? available.at(-1);
    const item = draw(random, pool);
    selectedIds.add(item.id);
    return { index, categoryId: category.id, itemId: item?.id ?? null,
      name: item?.name ?? (category.id === "book" ? "技能书待配置" : "状态药物待配置"),
      image: item?.image ?? null, description: item?.description ?? "待配置／不可购买",
      price: category.id === "medicine" ? SHOP_RULES.medicinePriceByStage[stageId] : shopPrice(item, category),
      available: true, placeholderArt: ["book", "medicine"].includes(category.id), purchased: false };
  });
}

export function previewShopItem(campaign, slot, recipientId = campaign?.playerId) {
  const member = campaign?.partyStates?.[recipientId];
  if (!slot || !member) return null;
  const item = SHOP_TREASURES[slot.itemId];
  const count = member.permanentEffects?.filter((effect) => effect.id === slot.itemId).length ?? 0;
  const alreadyOwned = slot.categoryId === "medicine" && (campaign.shopMedicines ?? [])
    .some((effect) => effect.recipientId === recipientId && effect.id === slot.itemId && effect.battlesLeft > 0);
  const growth = GROWING_SHOP_IDS.has(slot.itemId) ? previewGrowingDrop(member, slot.itemId, 1) : null;
  return { ...slot, ownedCount: count, alreadyOwned,
    recipientIneligible: slot.itemId === "heavenly_restriction_book" && recipientId === "tang", recipientId,
    expectedGains: growth ? { atk: growth.atk, def: growth.def, maxHp: growth.maxHp } : null,
    fullDescription: growth ? `${item.description} 本次购买预计：${growth.description.replace(/^第 1 关/, "商店")}` : slot.description };
}

function grantTreasure(member, slot, sourceId, stageId) {
  let effect;
  if (slot.itemId === GIANT_SPINAL_FLUID.id) effect = grantGiantSpinalFluid(member, sourceId, 1);
  else if (slot.itemId === GUN_DEVIL_FRAGMENT.id) effect = grantGunDevilFragment(member, sourceId, 1);
  else if (slot.itemId === TREASURE_DATA.sukuna_finger.id) effect = grantEliteSukunaFinger(member, sourceId, 1);
  else if (slot.itemId === "drip_coffee") effect = grantAdventureSpecialReward(member, sourceId, slot.itemId);
  else if (["quinque_guard", "quinque_crit"].includes(slot.itemId)) effect = grantQuinque(member, sourceId, slot.itemId);
  else {
    const item = SHOP_TREASURES[slot.itemId];
    if (!item || member.consumedActions.includes(`shop-treasure:${sourceId}`)) return false;
    member.consumedActions.push(`shop-treasure:${sourceId}`);
    const gains = Object.fromEntries(["atk", "maxHp", "spd", "damageReduction", "dodgeRateBonus", "critRateBonus", "lifesteal"]
      .filter((key) => Number.isFinite(item[key])).map((key) => [key, item[key]]));
    member.atk += gains.atk ?? 0;
    member.spd += gains.spd ?? 0;
    member.maxHp = Math.max(1, member.maxHp + (gains.maxHp ?? 0));
    member.currentHp = Math.min(member.currentHp, member.maxHp);
    if (gains.critRateBonus) member.critRate = Math.min(1, member.critRate + gains.critRateBonus);
    effect = applyRockLeeWeight(member, { ...item, ...gains, sourceId });
    member.permanentEffects.push(effect);
  }
  if (!effect) return false;
  effect.stageId = stageId;
  effect.sourceLabel = `第${stageId}关商店`;
  if (GROWING_SHOP_IDS.has(slot.itemId)) effect.description = effect.description.replace(/^第 1 关/, "商店");
  return effect;
}

export function buyShopItem(campaign, index, recipientId = campaign?.playerId, replaceId = null) {
  if (campaign?.status !== "shop" || !campaign.activeShop || campaign.activeShop.nodeId !== campaign.activeNode?.id) return false;
  refreshShopPrices(campaign);
  const slot = campaign.activeShop.slots[index];
  const member = campaign.partyStates?.[recipientId];
  if (!slot?.available || slot.purchased || !member || !campaign.partyIds.includes(recipientId) ||
      (slot.itemId === "prison_realm" && (campaign.partyIds.includes("gojo") ||
        (campaign.partyIds.length >= MAX_PARTY_MEMBERS && (!replaceId || replaceId === campaign.playerId ||
          replaceId === recipientId || !campaign.partyIds.includes(replaceId))))) ||
      (slot.itemId === "heavenly_restriction_book" && recipientId === "tang") ||
      (slot.categoryId === "medicine" && (campaign.shopMedicines ?? []).some((effect) =>
        effect.recipientId === recipientId && effect.id === slot.itemId && effect.battlesLeft > 0)) ||
      !Number.isFinite(slot.price) || slot.price <= 0 || (campaign.essence ?? 0) < slot.price) return false;
  const chargedPrice = slot.price;
  const sourceId = `shop:${campaign.stageId}:${campaign.activeShop.nodeId}:${index}`;
  let result;
  const discount = activeDiscount(campaign);
  if (["common", "growing", "rare", "legendary"].includes(slot.categoryId)) result = grantTreasure(member, slot, sourceId, campaign.stageId);
  else if (slot.categoryId === "book") {
    const book = SHOP_RULES.books.find((item) => item.id === slot.itemId);
    if (book && (!book.characterIds || book.characterIds.includes(recipientId))) {
      if (book.skillType === "passive-upgrade") {
        result = upgradePassiveSkill(member, sourceId);
        if (result) member.skillHistory.push({ skillId: result.skillId, level: result.level, sourceId, kind: "passive-upgrade" });
      } else if (book.skillType === "active") result = learnActiveSkill(member, book.skillId, sourceId);
      else if (book.skillType === "passive" && !(member.extraPassiveSkillIds ?? []).includes(book.skillId)) {
        member.extraPassiveSkillIds ??= [];
        member.extraPassiveSkillIds.push(book.skillId);
        applyPassiveBookStats(member);
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
  if (slot.itemId === "prison_realm") {
    if (!recruitPartyMember(campaign, "gojo", sourceId, replaceId)) return false;
  }
  campaign.essence -= chargedPrice;
  slot.purchased = true;
  if (slot.itemId === "vip_card" || slot.itemId === "premium_vip_card") {
    if (discount.kind === "ticket") campaign.vipTrialTicket.used = true;
    activateVipCard(campaign, slot.itemId);
  }
  else if (discount.kind === "ticket") { campaign.vipTrialTicket.used = true; refreshShopPrices(campaign); }
  else if (discount.kind === "card") {
    const vip = campaign.shopDiscount;
    vip.usedPurchases += 1;
    if (vip.usedPurchases >= VIP_RULES[vip.type].purchases) vip.expired = true;
    refreshShopPrices(campaign);
  }
  const gains = slot.categoryId === "medicine" ? result.modifiers ?? {} :
    Object.fromEntries(["atk", "def", "maxHp"].filter((key) => result[key]).map((key) => [key, result[key]]));
  campaign.activeShop.purchases.push({ index, itemId: slot.itemId, recipientId, price: chargedPrice,
    stageId: campaign.stageId, gains, effect: slot.categoryId === "book" ? result.description : null });
  campaign.playerHp = campaign.runCharacterState.currentHp;
  campaign.playerMaxHp = campaign.runCharacterState.maxHp;
  return result;
}
