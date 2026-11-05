import { createSeededRandom, generateRouteMap } from './routeGraph.js';
import { createRunCharacterState, chooseAdventureEventId, getAvailableAdventureEventIds } from './progression.js';
import { STARTING_CHARACTERS } from './characters.js';

const COUNT = Number(process.argv[2] ?? 300);
for (const stageId of [1, 2]) {
  const eliteCounts = new Map();
  const battleCounts = new Map();
  const pathLengths = new Map();
  const questionNeighbors = new Map();
  const nodeCounts = new Map();
  const firstQuestionEvents = new Map();
  const firstQuestionExpected = new Map();
  let paths = 0;
  for (let index = 0; index < COUNT; index += 1) {
    const map = generateRouteMap(`audit-${stageId}-${index}`, { stageId });
    const byId = new Map(map.nodes.map((entry) => [entry.id, entry]));
    const walk = (id, types) => {
      const current = byId.get(id);
      const next = [...types, current.type];
      if (id === map.bossNodeId) {
        paths++;
        const elites = next.filter((type) => type === 'elite').length;
        eliteCounts.set(elites, (eliteCounts.get(elites) ?? 0) + 1);
        const battles = next.filter((type) => type === 'battle').length;
        battleCounts.set(battles, (battleCounts.get(battles) ?? 0) + 1);
        pathLengths.set(next.length - 1, (pathLengths.get(next.length - 1) ?? 0) + 1);
        return;
      }
      current.nextNodeIds.forEach((child) => walk(child, next));
    };
    walk(map.startNodeId, []);
    let cursor = byId.get(map.startNodeId), pathStep = 0;
    while (cursor.nextNodeIds.length) {
      cursor = byId.get(cursor.nextNodeIds[0]); pathStep++;
      if (cursor.type !== 'question') continue;
      const run = createRunCharacterState(STARTING_CHARACTERS[0], 'shadow-clone-rush');
      const pool = getAvailableAdventureEventIds(run, pathStep, [run], stageId);
      const event = chooseAdventureEventId(run, createSeededRandom(`event-draw-${(index * 2654435761) >>> 0}-${stageId}`), pathStep, [run], stageId);
      const nextType = byId.get(cursor.nextNodeIds[0])?.type ?? 'end';
      firstQuestionExpected.set(nextType, (firstQuestionExpected.get(nextType) ?? 0) + 1 / pool.length);
      const key = `${nextType}|${event === 'sea_beyond' ? 'sea' : 'other'}`;
      firstQuestionEvents.set(key, (firstQuestionEvents.get(key) ?? 0) + 1);
      if (!pool.includes('sea_beyond')) throw new Error('Sea event unexpectedly absent from fresh-run pool');
      break;
    }
    for (const current of map.nodes) {
      nodeCounts.set(current.type, (nodeCounts.get(current.type) ?? 0) + 1);
      if (current.type !== 'question') continue;
      const incoming = map.nodes.filter((entry) => entry.nextNodeIds.includes(current.id));
      const previous = incoming.map((entry) => entry.type).sort().join(',');
      const following = current.nextNodeIds.map((id) => byId.get(id).type).sort().join(',');
      const key = `${previous} -> question -> ${following}`;
      questionNeighbors.set(key, (questionNeighbors.get(key) ?? 0) + 1);
    }
  }
  console.log(JSON.stringify({ stageId, maps: COUNT, paths,
    eliteCounts: Object.fromEntries([...eliteCounts].sort((a, b) => a[0] - b[0])),
    battleCounts: Object.fromEntries([...battleCounts].sort((a, b) => a[0] - b[0])),
    pathLengths: Object.fromEntries([...pathLengths].sort((a, b) => a[0] - b[0])),
    firstQuestionEvents: Object.fromEntries(firstQuestionEvents),
    firstQuestionExpectedSea: Object.fromEntries([...firstQuestionExpected].map(([key, value]) => [key, Number(value.toFixed(1))])),
    nodeCounts: Object.fromEntries(nodeCounts),
    questionNeighbors: Object.fromEntries([...questionNeighbors].sort((a, b) => b[1] - a[1]).slice(0, 12)),
  }));
}
