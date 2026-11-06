// The trial is a small, serializable route. Its three buttons keep a stable
// display order; the player chooses which pending task to challenge next.
export const TRIAL_TASKS = Object.freeze({
  will: { name: "永恒的枷锁", eventName: "永恒的枷锁", kind: "意志" },
  strength: { name: "击败赫拉克勒斯", kind: "力量" },
  wisdom: { name: "击败奥丁", kind: "智慧" },
});

export const TRIAL_RULES = Object.freeze({
  requiredTasks: 2,
  divinePunishmentHpFraction: .2,
  divinePunishmentBattles: 3,
  failureMaxHpFraction: .4,
  failureSpeedFraction: .4,
  // A tied point-count has a stable, testable result.
  odinPointTiePriority: ["maxHp", "atk", "def", "spd"],
  bleedFractionPerStack: .01,
  burnFractionPerStack: .01,
  burnStacksPerHit: 5,
  bleedTick: "round-end",
  burnTick: "round-end",
  hidanDelayRounds: 3,
  ahFuEscapeAfterRounds: 5,
});

export function shuffleTrialTasks(random = Math.random) {
  const order = Object.keys(TRIAL_TASKS);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const roll = Math.min(.999999999999, Math.max(0, Number(random()) || 0));
    const other = Math.floor(roll * (index + 1));
    [order[index], order[other]] = [order[other], order[index]];
  }
  return order;
}

export function createTrialState(random = Math.random) {
  return {
    status: "active", order: shuffleTrialTasks(random), index: 0,
    tasks: { will: "pending", strength: "pending", wisdom: "pending" },
    completedCount: 0, battleIndex: 0, priorBattleEnemies: [],
    currentBattleEnemies: [], divinePunishmentBattlesLeft: 0,
    failurePenaltyApplied: false, currentTask: null,
  };
}

export function startTrialTask(trial, selectedTaskId = null) {
  if (trial?.status !== "active" || trial.currentTask || trial.index >= trial.order.length) return null;
  const taskId = selectedTaskId ?? trial.order.find((id) => trial.tasks[id] === "pending");
  if (!trial.order.includes(taskId) || trial.tasks[taskId] !== "pending") return null;
  trial.currentTask = taskId;
  trial.tasks[taskId] = "active";
  return taskId;
}

export function completeTrialTask(trial, taskId, result = "completed") {
  if (trial?.status !== "active" || trial.currentTask !== taskId || trial.tasks[taskId] !== "active" ||
      !["completed", "declined"].includes(result)) return false;
  trial.tasks[taskId] = result;
  if (result === "completed") trial.completedCount += 1;
  trial.currentTask = null;
  trial.index += 1;
  if (trial.completedCount >= TRIAL_RULES.requiredTasks) trial.status = "completed";
  else if (trial.index >= trial.order.length) trial.status = "failed";
  return { status: trial.status, completedCount: trial.completedCount,
    nextTask: trial.order.find((id) => trial.tasks[id] === "pending") ?? null };
}

export function failTrial(trial) {
  if (trial?.status !== "active") return false;
  if (trial.currentTask) trial.tasks[trial.currentTask] = "failed";
  trial.status = "failed";
  return true;
}

export function pickTrialEnemies(pool, count, prior = [], random = Math.random) {
  const available = pool.filter((id) => !prior.includes(id));
  if (count > available.length || count < 1) throw new RangeError("No legal non-repeating trial encounter");
  const selected = [];
  while (selected.length < count) {
    const index = Math.floor(Math.min(.999999999999, Math.max(0, Number(random()) || 0)) * available.length);
    selected.push(available.splice(index, 1)[0]);
  }
  return selected;
}

export function odinWeakestPointStat(pointChoices = {}) {
  const counts = Object.fromEntries(TRIAL_RULES.odinPointTiePriority.map((stat) => [stat, Number(pointChoices?.[stat]) || 0]));
  const maximum = Math.max(...Object.values(counts));
  return maximum > 0 ? TRIAL_RULES.odinPointTiePriority.find((stat) => counts[stat] === maximum) : null;
}
