// Battle presentation only. Evolution stats and skills remain in evolution.js.
const path = (hero, file) => `assets/evolved/${hero}/${file}.png`;
const frames = (hero, names) => Object.fromEntries(names.map(([key, file]) => [key, path(hero, file)]));

export const EVOLVED_PRESENTATIONS = Object.freeze({
  naruto: {
    visualId: "naruto-evolved", asset: path("naruto", "鸣人待机"), entranceBackground: path("naruto", "鸣人登场"),
    passiveProtectionAsset: path("naruto", "被动保护"),
    skillAnimationMap: { "naruto-multi-clone": "skill1_shadow_clone", "naruto-giant-rasengan": "skill2_rasengan" },
    skillVisualTimelines: {
      "naruto-multi-clone": { castMs: 880, secondFrameMs: 430, moveMs: 650, holdMs: 460, returnMs: 500 },
      "naruto-giant-rasengan": { castMs: 700, moveMs: 680, holdMs: 500, returnMs: 500 },
    },
    animations: {
      idle: { type: "frames", frames: { idle: path("naruto", "鸣人待机") } },
      run: { type: "frames", frames: { run_1: path("naruto", "跑步1"), run_2: path("naruto", "跑步2") } },
      meleeAttack: { type: "frames", frames: frames("naruto", [["punch_1", "攻击1"], ["punch_2", "攻击2"], ["punch_3", "攻击3"], ["punch_4", "攻击4"], ["punch_5", "攻击5"], ["punch_6", "攻击6"]]), impactFrames: ["punch_4", "punch_5", "punch_6"] },
      skill1_shadow_clone: { type: "frames", frames: frames("naruto", [["first", "1-1"], ["second", "1-2"], ["rush", "1-3"]]), durationsMs: [430, 450, 650] },
      skill2_rasengan: { type: "frames", frames: frames("naruto", [["charge", "螺旋丸1"], ["approach", "螺旋丸3"], ["impact", "螺旋丸4"]]), durationsMs: [700, 680, 500] },
      giantRasenganBurst: { type: "frames", frames: frames("naruto", [["impact", "螺旋丸4（大玉版）"]]) },
      death: { type: "frames", frames: frames("naruto", [["down", "倒地"]]) },
    },
  },
  eren: {
    visualId: "eren-evolved", asset: path("eren", "进击"), entranceBackground: path("eren", "登场"),
    skillAnimationMap: { "eren-hardening": "hardening", "eren-warhammer": "warhammer" },
    animations: {
      idle: { type: "frames", frames: frames("eren", [["idle", "进击"]]) },
      run: { type: "frames", frames: frames("eren", [["run_1", "跑步1"], ["run_2", "跑步2"]]) },
      meleeAttack: { type: "frames", frames: frames("eren", [["punch_1", "攻击1"], ["punch_2", "攻击2"]]), impactFrames: ["punch_2"] },
      hardening: { type: "frames", frames: frames("eren", [["cast", "技能1"]]) },
      warhammer: { type: "frames", frames: frames("eren", [["charge", "技能2蓄力"], ["strike", "技能2"]]), durationsMs: [420, 500] },
      death: { type: "frames", frames: frames("eren", [["down", "摔倒1"], ["fallen", "摔倒2"]]) },
    },
  },
  tang: {
    visualId: "tang-evolved", asset: path("tang", "待机"), entranceBackground: path("tang", "登场"),
    summonAuraAsset: "assets/effects/tang_wukong_summon_circle.png",
    skillAnimationMap: { "journey-west": "skill1", "tang-boundless-dharma": "skill1" },
    animations: {
      idle: { type: "frames", frames: frames("tang", [["idle", "待机"]]) },
      meditate: { type: "frames", frames: frames("tang", [["sit", "打坐"]]) },
      skill1: { type: "frames", frames: frames("tang", [["cast", "施法"]]) },
      death: { type: "frames", frames: frames("tang", [["down", "击倒"]]) },
    },
  },
  kaneki: {
    visualId: "kaneki-evolved", asset: path("kaneki", "待机"), entranceBackground: path("kaneki", "登场"), auraAsset: path("kaneki", "光环"),
    skillAnimationMap: { "kaneki-glutton": "glutton", "kaneki-2000-14": "thousandSeven" },
    skillVisualTimelines: { "kaneki-glutton": { castMs: 420, moveMs: 560, holdMs: 300, returnMs: 420 } },
    animations: {
      idle: { type: "frames", frames: frames("kaneki", [["idle", "待机"]]) },
      run: { type: "frames", frames: frames("kaneki", [["run_1", "跑步1"], ["run_2", "跑步2"]]) },
      meleeAttack: { type: "frames", frames: frames("kaneki", [["punch", "出拳1"]]), impactFrames: ["punch"] },
      glutton: { type: "frames", frames: frames("kaneki", [["cast", "技能1"], ["dash", "技能1-需要调方向"]]), durationsMs: [350, 450] },
      thousandSeven: { type: "frames", frames: frames("kaneki", [["burst", "光环2"]]) },
      death: { type: "frames", frames: frames("kaneki", [["down", "倒地"]]) },
    },
  },
});

export function evolvedBattlePresentation(id) { return EVOLVED_PRESENTATIONS[id] ?? null; }
