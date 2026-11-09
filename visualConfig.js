// Battle-only presentation settings. These never enter battle calculations.
// frameWidth/frameHeight describe one display frame, not the source PNG size;
// a 160x176 source can use a 160x176 frame without changing the PNG.
// Optional animationOffsets: { skill1: { offsetX: 4, offsetY: 0 } } applies
// only while that animation is visible and resets when its frame is cleared.
export const CHARACTER_VISUALS = Object.freeze({
  tang: { scale: 1.2, offsetX: 0, offsetY: 0, frameWidth: 84, frameHeight: 98,
    animationFrameScales: { skill1: { cast: 1.15 } } },
  "tang-white-horse": { scale: 1, offsetX: 0, offsetY: 0, frameWidth: 84, frameHeight: 98,
    animationFrameScales: { skill1: { cast: 1.45 } } },
  "tang-bajie": { scale: 1, offsetX: 0, offsetY: 0, frameWidth: 84, frameHeight: 98,
    animationFrameScales: { skill1: { cast: 1.45 } } },
  "tang-shaseng": { scale: 1.35, offsetX: 0, offsetY: 0, frameWidth: 84, frameHeight: 98,
    animationFrameScales: { skill1: { cast: 1.35 } }, frameFootShifts: { skill1: { cast: 10 } } },
  "tang-wukong": { scale: 1.35, offsetX: 0, offsetY: 0, frameWidth: 84, frameHeight: 98, animationFrameScales: { skill1: { cast: 1.35 } } },
  naruto: { scale: 1, offsetX: 0, offsetY: 0, frameWidth: 84, frameHeight: 98 },
  "naruto-evolved": { scale: 1.35, offsetX: 0, offsetY: -8, frameWidth: 84, frameHeight: 98,
    animationFrameScales: {
      meleeAttack: { punch_1: 1, punch_2: 1, punch_3: 1, punch_4: 1, punch_5: 1, punch_6: 1 },
      skill1_shadow_clone: { first: 1, second: 1, rush: 1 },
      skill2_rasengan: { charge: 1, approach: 1, impact: 1 }, giantRasenganBurst: { impact: 1.2 },
      death: { down: 1 },
    },
    frameFootShifts: { skill2_rasengan: { charge: 2, approach: 7, impact: 6 }, giantRasenganBurst: { impact: 12 } } },
  eren: { scale: 1, offsetX: 0, offsetY: 0, frameWidth: 84, frameHeight: 98,
    stageTwoFootOffsetY: 4,
    frameFootShifts: { death: { fall: -2 } } },
  "eren-evolved": { scale: 2.145, offsetX: 0, offsetY: -22, frameWidth: 100, frameHeight: 112,
    animationFrameScales: { death: { down: 1.5, fallen: 1.5 } } },
  kaneki: { scale: 1, offsetX: 0, offsetY: 0, frameWidth: 84, frameHeight: 98,
    frameFootShifts: {
      run: { run_01: -2, run_02: -2 },
      meleeAttack: { charge: -4, punch: -2 },
      predator: { strike: -3, retreat: -4 },
      thousandSeven: { burst: -4 },
      death: { down: -4 },
    },
    animationFrameScales: {
      predator: { launch: 1, strike: 1.55, retreat: 1.45 },
      thousandSeven: { burst: 1.4 },
      death: { down: 1.15 },
    } },
  "kaneki-evolved": { scale: 0.98, offsetX: 0, offsetY: 0, frameWidth: 92, frameHeight: 106,
    animationFrameScales: { run: { run_2: 1.13 }, glutton: { cast: 1.26, dash: 1.38 }, thousandSeven: { burst: 1.08 } },
    frameFootShifts: { glutton: { cast: 6, dash: 15 } } },
  makima: { scale: 2.05, offsetX: 0, offsetY: 42, frameWidth: 94, frameHeight: 112,
    frameFootShifts: { landing: { land: 16 }, groundIdle: { stand: 6 }, groundAttack: { strike: 4 } } },
  "flamethrower-devil": { scale: 1.55, offsetX: 0, offsetY: -20, frameWidth: 94, frameHeight: 108 },
  "katana-devil": { scale: 1.24, offsetX: 0, offsetY: -18, frameWidth: 94, frameHeight: 108 },
  quanxi: { scale: 1.2, offsetX: 0, offsetY: 0, frameWidth: 94, frameHeight: 108,
    animationFrameScales: { meleeAttack: { flash: 1.55, strike: 1.2 } },
    frameFootShifts: { meleeAttack: { flash: 14, strike: 16 } } },
  "tang-evolved": { scale: 1.6, offsetX: 0, offsetY: -6, frameWidth: 96, frameHeight: 112,
    animationFrameScales: { skill1: { cast: 1.22 } } },
  heracles: { scale: 1.45, offsetX: 0, offsetY: 0, frameWidth: 112, frameHeight: 128,
    animationFrameScales: { phase2MeleeAttack: { punch: 1.1 } } },
  odin: { scale: 1.7, offsetX: 0, offsetY: -13, frameWidth: 112, frameHeight: 128,
    animationFrameScales: { idle: { idle: 1.15 }, magicAttack: { cast: 1.5 }, gungnir: { cast: 1.5 } },
    frameFootShifts: { magicAttack: { cast: 29 }, gungnir: { cast: 29 }, passive1: { trigger: -3 }, passive2: { trigger: 6 } } },
  zhang_jiao: { scale: 1, offsetX: 0, offsetY: 0, frameWidth: 112, frameHeight: 128 },
  jogo: { scale: 1, offsetX: 0, offsetY: 0, frameWidth: 112, frameHeight: 128 },
  esdeath: { scale: 1, offsetX: 0, offsetY: 0, frameWidth: 112, frameHeight: 128 },
  hidan: { scale: 1, offsetX: 0, offsetY: 0, frameWidth: 112, frameHeight: 128 },
  nami: { scale: 1, offsetX: 0, offsetY: 0, frameWidth: 112, frameHeight: 128 },
  scorpion_lailai: { scale: 1, offsetX: 0, offsetY: 0, frameWidth: 112, frameHeight: 128 },
  shin: { scale: 1.18, offsetX: 0, offsetY: -18, frameWidth: 112, frameHeight: 128 },
  noi: { scale: 1.18, offsetX: 0, offsetY: -18, frameWidth: 112, frameHeight: 128 },
  "falling-devil": { scale: 1.6, offsetX: 0, offsetY: -8, frameWidth: 112, frameHeight: 128,
    animationFrameScales: { execution: { cast: 1.05 }, death: { down: 1.25 } } },
  giant: { scale: 1.05, offsetX: 0, offsetY: 0, frameWidth: 128, frameHeight: 144 },
  slime: { scale: 0.72, offsetX: 0, offsetY: 0, frameWidth: 128, frameHeight: 144 },
  mage: { scale: 0.86, offsetX: 0, offsetY: 0, frameWidth: 128, frameHeight: 144 },
  lubu: { scale: 1, offsetX: 0, offsetY: 0, frameWidth: 128, frameHeight: 144 },
  dementor: { scale: 1, offsetX: 0, offsetY: 0, frameWidth: 128, frameHeight: 144 },
  jack: { scale: 1, offsetX: 0, offsetY: 0, frameWidth: 84, frameHeight: 98 },
  teruhashi: { scale: 0.88, offsetX: 0, offsetY: -1, frameWidth: 128, frameHeight: 144 },
  gollum: { scale: 0.6, offsetX: 0, offsetY: 0, frameWidth: 128, frameHeight: 144 },
  gilgamesh: { scale: 1.9, offsetX: 0, offsetY: 28, frameWidth: 104, frameHeight: 112 },
  arima: { scale: 0.86, offsetX: 0, offsetY: 0, frameWidth: 112, frameHeight: 128,
    frameFootShifts: { pierce: { charge: 18, thrust: 18 } } },
  suzuya: { scale: 1.02, offsetX: 0, offsetY: 0, frameWidth: 96, frameHeight: 112 },
  six_ear: { scale: 1, offsetX: 0, offsetY: 0, frameWidth: 84, frameHeight: 98 },
  deep_sea_king: { scale: 1, offsetX: 0, offsetY: 0, frameWidth: 128, frameHeight: 144 },
  bull_king: { scale: 1, offsetX: 0, offsetY: 0, frameWidth: 128, frameHeight: 144 },
  headless_knight: { scale: 1, offsetX: 0, offsetY: 0, frameWidth: 128, frameHeight: 144 },
  anubis: { scale: 1, offsetX: 0, offsetY: 0, frameWidth: 128, frameHeight: 144 },
  loki: { scale: 1, offsetX: 0, offsetY: 0, frameWidth: 128, frameHeight: 144 },
  medusa: { scale: 1, offsetX: 0, offsetY: 0, frameWidth: 128, frameHeight: 144 },
  shiji: { scale: 1, offsetX: 0, offsetY: 0, frameWidth: 128, frameHeight: 144 },
  dina: { scale: 1.7, offsetX: 0, offsetY: 0, frameWidth: 160, frameHeight: 176 },
  deidara: { scale: 1.4, offsetX: 0, offsetY: 0, frameWidth: 84, frameHeight: 98 },
  mahito: { scale: 1, offsetX: 0, offsetY: 0, frameWidth: 84, frameHeight: 98 },
  "bomb-demon": { scale: 1, offsetX: 0, offsetY: 0, frameWidth: 84, frameHeight: 98,
    animationFrameScales: { boom: { raise: 1.4, launch: 1.4 } },
    frameFootShifts: { boom: { raise: 20, launch: 20 } } },
  "makima-bomb": { scale: 1.2, offsetX: 0, offsetY: 0, frameWidth: 94, frameHeight: 108,
    animationFrameScales: { boom: { raise: 1.4, launch: 1.4 } },
    frameFootShifts: { boom: { raise: 22, launch: 22 } } },
  boros: { scale: 1.3, offsetX: 0, offsetY: 0, frameWidth: 84, frameHeight: 98,
    animationFrameScales: {
      meleeAttack: { windup: 1.08, punch: 1.1 },
      phase2Idle: { stage2: 1.22 }, phase3Idle: { stage3: 1.38 },
      meteor: { fly: 1.22, dash: 1.30 }, cannon: { charge: 1.55 },
    } },
  toji: { scale: 1.1, offsetX: 0, offsetY: 0, frameWidth: 84, frameHeight: 98,
    animationFrameScales: { meleeAttack: { punch_1: 1.24, punch_2: 1.24 } } },
  kira: { scale: 1.55, offsetX: 0, offsetY: -10, frameWidth: 104, frameHeight: 112,
    animationFrameScales: { meleeAttack: { punch_1: 1.18 }, skill1: { cast: 1.3 } } },
  "armored-titan": { scale: 1.2, offsetX: 0, offsetY: 0, frameWidth: 104, frameHeight: 128,
    animationFrameScales: { skill1: { hold: 1.3 } } },
  "colossal-titan": { scale: 2.1, offsetX: 0, offsetY: 0, frameWidth: 150, frameHeight: 190 },
});

const DEFAULT_VISUAL = Object.freeze({ scale: 1, offsetX: 0, offsetY: 0, frameWidth: 84, frameHeight: 98 });

export function getCharacterVisual(character) {
  return CHARACTER_VISUALS[character?.visualId ?? character?.appearanceId ?? character?.id] ?? DEFAULT_VISUAL;
}

export function getAnimationVisualOffset(character, animationName) {
  return getCharacterVisual(character).animationOffsets?.[animationName] ?? { offsetX: 0, offsetY: 0 };
}

export function getAnimationFrameVisualScale(character, animationName, frameName) {
  if (character?.id === "six_ear" && animationName === "death") return 1.6;
  return getCharacterVisual(character).animationFrameScales?.[animationName]?.[frameName] ?? 1;
}

export function getAnimationFrameFootShift(character, animationName, frameName) {
  return getCharacterVisual(character).frameFootShifts?.[animationName]?.[frameName] ?? 0;
}

export function getGravityLiftPixels(entryPanelSpd) {
  return 20 + Math.max(0, entryPanelSpd) * .28;
}

export function getBorosBeamGeometry(arenaLeft, arenaRight, headX, allyX) {
  const towardLeft = allyX <= headX;
  const edge = towardLeft ? arenaLeft : arenaRight;
  return {
    left: Math.min(headX, edge) - arenaLeft,
    width: Math.max(1, Math.abs(headX - edge)),
    flip: !towardLeft,
  };
}
