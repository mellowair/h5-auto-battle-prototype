import { GIANT_SPINAL_FLUID, TREASURE_DATA } from "./skills.js";
import { SHOP_RULES } from "./shopConfig.js";

export const LEADERBOARD_IDS = Object.freeze({
  items: "95lisrg78b4rli1nkc",
  hiddenBoss: "o1lsmmz4c04y7dc1x2",
  finalBoss: "s96dy3gq0rft7uc6oi",
});

const EXTRA_TREASURE_IDS = new Set([
  GIANT_SPINAL_FLUID.id, "gun_devil_fragment", "drip_coffee", "six_ear_true_form",
  "quinque_guard", "quinque_crit", "anteiku_weapon",
]);
const BOOK_IDS = new Set(SHOP_RULES.books.map((book) => book.id));

export function countLeaderboardItems(campaign) {
  if (!campaign?.partyIds?.length) return 0;
  const members = campaign.partyIds.map((id) => campaign.partyStates?.[id]).filter(Boolean);
  const treasures = members.reduce((total, member) => total +
    (member.permanentEffects ?? []).filter((effect) => TREASURE_DATA[effect.id] || EXTRA_TREASURE_IDS.has(effect.id)).length, 0);
  const purchases = [...(campaign.shopHistory ?? []), ...(campaign.activeShop ? [campaign.activeShop] : [])]
    .flatMap((shop) => shop.purchases ?? []).filter((item) => BOOK_IDS.has(item.itemId)).length;
  const rewardBooks = members.reduce((total, member) => total + (member.skillHistory ?? []).filter((entry) =>
    entry.kind === "fate-book" ||
    (entry.skillId === "apocalypse-knight" && entry.kind === "learn" && entry.sourceId?.startsWith("hidden-boss:"))).length, 0);
  return treasures + purchases + rewardBooks;
}

export function recordBossLeaderboardScore(campaign, battle, result) {
  if (!campaign || campaign.devBattleOnly || result?.outcome !== "victory" ||
      !Number.isInteger(result.rounds) || result.rounds < 1) return null;
  const key = battle?.hiddenBoss ? "hiddenBoss" : battle?.enemies?.includes("makima") ? "finalBoss" : null;
  if (!key) return null;
  campaign.leaderboardRecords ??= {};
  campaign.leaderboardRecords[key] = Math.min(campaign.leaderboardRecords[key] ?? Infinity, result.rounds);
  return { key, score: campaign.leaderboardRecords[key] };
}

export function leaderboardScores(campaign) {
  if (!campaign?.playerId || campaign.devBattleOnly) return {};
  campaign.leaderboardRecords ??= {};
  campaign.leaderboardRecords.items = Math.max(campaign.leaderboardRecords.items ?? 0, countLeaderboardItems(campaign));
  return Object.fromEntries(Object.entries(campaign.leaderboardRecords)
    .filter(([key, value]) => LEADERBOARD_IDS[key] && Number.isInteger(value) && value > 0));
}

export function createLeaderboardClient(getTap = () => globalThis.tap) {
  let manager = null;
  const getManager = () => {
    if (manager) return manager;
    try { manager = getTap()?.getLeaderboardManager?.() ?? null; }
    catch (error) { console.warn("[TapTap 排行榜] 初始化失败", error); }
    return manager;
  };
  return {
    submit(key, score, onSuccess, onFailure) {
      const board = getManager();
      if (!board || !LEADERBOARD_IDS[key] || !Number.isInteger(score) || score < 1) return false;
      try {
        board.submitScores({ scores: [{ leaderboardId: LEADERBOARD_IDS[key], score }],
          callback: { onSuccess, onFailure } });
        return true;
      } catch (error) { onFailure?.("client_error", error?.message ?? String(error)); return false; }
    },
    open(key, onSuccess, onFailure) {
      const board = getManager();
      if (!board || !LEADERBOARD_IDS[key]) return false;
      try {
        board.openLeaderboard({ leaderboardId: LEADERBOARD_IDS[key], collection: "public",
          callback: { onSuccess, onFailure } });
        return true;
      } catch (error) { onFailure?.("client_error", error?.message ?? String(error)); return false; }
    },
  };
}
