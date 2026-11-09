// Local-only inspection: node shopReport.js 42 1
// Or export a browser save and inspect it with: node shopReport.js --save run.json
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyzeRouteMap, generateRouteMap } from "./routeMap.js";
import { generateShopInventory } from "./shop.js";

export function reportShopMap(seed = 42, stageId = 1, campaign = null) {
  const map = campaign?.routeMap ?? generateRouteMap(seed, { stageId });
  const actualStage = campaign?.stageId ?? stageId;
  const stats = analyzeRouteMap(map);
  const visits = [...(campaign?.shopHistory ?? []), ...(campaign?.activeShop ? [campaign.activeShop] : [])];
  return {
    seed: map.seed, stageId: actualStage, shopCount: stats.shops.length,
    shortestRoute: stats.shortest, longestRoute: stats.longest,
    minimumGap: 3, invalidPaths: stats.invalidPaths,
    essence: campaign?.essence ?? 0,
    essenceHistory: campaign?.essenceHistory ?? [],
    shops: stats.shops.map((node) => {
      const visit = visits.find((entry) => entry.nodeId === node.id);
      return { ...node, visited: Boolean(visit), slots: visit?.slots ??
        generateShopInventory(`${map.seed}:${node.id}`, actualStage), purchases: visit?.purchases ?? [] };
    }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const saved = process.argv[2] === "--save" ? JSON.parse(readFileSync(process.argv[3], "utf8")) : null;
  const campaign = saved?.campaign ?? saved;
  const report = reportShopMap(process.argv[2] === "--save" ? campaign?.routeMap?.seed : process.argv[2] ?? 42,
    Number(process.argv[3] ?? 1), campaign || null);
  console.log(JSON.stringify(report, null, 2));
}
