export function battlePlaybackMultiplier(speed = 1) {
  return [1, 2, 3].includes(speed) ? speed : 1;
}

export function nextPlaybackSpeed(speed = 1) {
  return battlePlaybackMultiplier(speed) % 3 + 1;
}
