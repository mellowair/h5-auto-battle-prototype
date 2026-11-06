export const AUTO_SPEED_LOG_THRESHOLD = 100;

export function isAutoSpeedActive(logCount) {
  return logCount > AUTO_SPEED_LOG_THRESHOLD;
}

export function battlePlaybackMultiplier(logCount, manualFast, fastMultiplier = 2) {
  return (manualFast ? fastMultiplier : 1) * (isAutoSpeedActive(logCount) ? 2 : 1);
}
