// Centralized first-stage skill, growth, campfire, and encounter-event data.
// Level-one Naruto values preserve current combat behavior. Other starter entries are first-pass placeholders.
// Skill tuning can be replaced through this registry without scattering numbers into UI code.
export const SKILL_DATA = {
  "falling-gravity-domain": { id: "falling-gravity-domain", name: "重力领域", type: "passive", passive: true,
    description: "开战时将所有玩家角色的实际战斗 SPD 固定为 1；入场面板 SPD 仍用于失重伤害。", levels: { 1: {} } },
  "falling-weightlessness": { id: "falling-weightlessness", name: "失重", type: "passive", passive: true,
    description: "第 3、6、9……回合结束时，使所有存活玩家角色坠落；基础伤害为各自入场面板 SPD × 4 + 250，再按 DEF 和现有防护规则结算。", levels: { 1: {} } },
  "falling-main-course": { id: "falling-main-course", name: "主菜", type: "passive", passive: true,
    description: "每次失重后存活者获得 1 层失去引力；每次实际获得治疗减少 1 层。任一角色达到 5 层时立即被处决。", levels: { 1: {} } },
  "stage3-resurrection": { id: "stage3-resurrection", name: "双人复活", type: "passive", passive: true,
    description: "倒地时另一人若存活，等待四回合后以 40% 最大 HP 复活；等待期间存活者攻击力翻倍；两人同时倒地则战斗结束。", levels: { 1: {} } },
  "makima-weapons": { id: "makima-weapons", name: "武器人", type: "passive", passive: true,
    description: "开局召唤两名眷属；低于半血再召唤两名。每名眷属阵亡 ATK +100；四名全灭后吸血 +10%。", levels: { 1: {} } },
  "makima-control": { id: "makima-control", name: "支配", type: "passive", passive: true,
    description: "第 2 回合起每回合 25% 概率支配伙伴；成功后持续当前及下一回合，随后必定解除，每场最多成功一次。", levels: { 1: {} } },
  "makima-angel": { id: "makima-angel", name: "天使恶魔", type: "passive", passive: true,
    description: "第 3、7、11……回合清除敌方当前技能来源增益，不移除道具与永久属性。", levels: { 1: {} } },
  "makima-bang": { id: "makima-bang", name: "砰！", type: "passive", passive: true,
    description: "第 4 回合首次发动；每有一名眷属阵亡，后续间隔从 5 回合缩短一回合。", levels: { 1: {} } },
  "stage3-burn": { id: "stage3-burn", name: "灼烧", type: "passive", passive: true,
    description: "每次命中增加 1 层灼烧；每层每次按目标最大 HP 的 1% 扣血。", levels: { 1: {} } },
  "stage3-bleed": { id: "stage3-bleed", name: "流血", type: "passive", passive: true,
    description: "每次命中增加 1 层流血；每层每次按目标最大 HP 的 1% 扣血。", levels: { 1: {} } },
  "quanxi-finisher": { id: "quanxi-finisher", name: "追击", type: "passive", passive: true,
    description: "攻击附加目标已损失 HP 的 50% 攻击力，仍参与本次防御结算。", levels: { 1: {} } },
  "arima-insight": { id: "arima-insight", name: "弱点洞察", type: "passive", passive: true,
    description: "对同一目标造成三次伤害后，后续攻击无视该目标 80% 防御。", levels: { 1: {} } },
  "arima-crit": { id: "arima-crit", name: "濒危暴击", type: "passive", passive: true,
    description: "自身 HP 低于 60% 时暴击率增加 30 个百分点。", levels: { 1: {} } },
  "arima-guard": { id: "arima-guard", name: "库因克格挡", type: "passive", passive: true,
    description: "被普通攻击命中时，50% 概率抵挡一半伤害。", levels: { 1: {} } },
  "shin-strike": { id: "shin-strike", name: "心的处决", type: "active", triggerType: "on_action",
    description: "攻击当前防御最低的存活对手，造成 1.5 倍攻击伤害且无法闪避。",
    levels: { 1: { chance: .33, multiplier: 1.5, effectType: "damage", attackType: "melee", lowestDefenseTarget: true, unavoidable: true } } },
  "noi-heal": { id: "noi-heal", name: "能井的治疗", type: "active", triggerType: "on_action",
    description: "治疗每位存活队友已损失生命值的 30%。",
    levels: { 1: { chance: .33, effectType: "team-heal", missingHpRatio: .3 } } },
  "arima-pierce": { id: "arima-pierce", name: "贯穿", type: "active", triggerType: "on_action",
    description: "造成 1.2 倍攻击伤害，命中后使目标沉默两回合。",
    levels: { 1: { chance: .4, multiplier: 1.2, effectType: "damage", attackType: "melee", silenceRounds: 2 } } },
  "eren-paths": { id: "eren-paths", name: "道路", type: "passive", passive: true, maxLevel: 1,
    description: "每场首次受到伤害免疫；首次生命低于 20% 时恢复 40% 最大 HP。", levels: { 1: { immuneHits: 1, emergencyHealRatio: .4, emergencyThreshold: .2 } } },
  "eren-hardening": { id: "eren-hardening", name: "硬质化", type: "active", triggerType: "on_action", maxLevel: 4,
    description: "增加本场防御，受到攻击时反伤；高等级可嘲讽。",
    levels: Object.fromEntries([[.5,10,.8,false],[.6,15,.8,false],[.6,20,1,false],[.7,25,1,true]].map(([chance,defenseBonus,reflectMultiplier,taunt], index) =>
      [index + 1, { chance, defenseBonus, reflectMultiplier, maxDefenseStacks: 4, reflectTurns: 2, taunt, effectType: "hardening" }])) },
  "eren-warhammer": { id: "eren-warhammer", name: "战锤之力", type: "active", triggerType: "on_action", maxLevel: 4,
    description: "以攻击与防御合力攻击，按自身防御忽视目标防御，随后消耗自身防御。",
    levels: Object.fromEntries([[.4,1.7,.4,40],[.5,1.8,.5,40],[.5,1.9,.6,30],[.6,1.9,.7,30]].map(([chance,multiplier,ignoreDefenseFromOwnDef,defenseCost], index) =>
      [index + 1, { chance, multiplier, ignoreDefenseFromOwnDef, defenseCost, attackFormula: "atk_plus_current_def", effectType: "damage", attackType: "melee" }])) },
  "kaneki-one-eye-king": { id: "kaneki-one-eye-king", name: "独眼之王", type: "passive", passive: true, maxLevel: 1,
    description: "暴击吸血；首次低于 40% HP 时获得三回合暴伤强化，期间击杀永久加攻。",
    levels: { 1: { healFromCalculatedDamage: .3, emergencyThreshold: .4, critDamageBonus: .4, durationRounds: 3, killAttackBonus: 10 } } },
  "kaneki-glutton": { id: "kaneki-glutton", name: "暴食者", type: "active", triggerType: "on_action", maxLevel: 4,
    description: "以攻击与速度造成伤害；目标血量低于等级阈值时必暴击。",
    levels: Object.fromEntries([[.6,1.2,.3,50],[.65,1.3,.3,50],[.7,1.4,.4,50],[.7,1.4,.5,100]].map(([chance,multiplier,guaranteedCritBelowHpRatio,killMaxHpBonus], index) =>
      [index + 1, { chance, multiplier, guaranteedCritBelowHpRatio, killMaxHpBonus, lowestDefenseTarget: index === 3,
        attackFormula: "atk_plus_spd", effectType: "damage", attackType: "melee" }])) },
  "kaneki-2000-14": { id: "kaneki-2000-14", name: "2000-14", type: "active", triggerType: "on_damage", maxLevel: 4,
    description: "本场受伤和攻击次数分别累计，自身逐步强化。",
    levels: Object.fromEntries([[2,.07,10,2,.03,0],[2,.07,20,2,.04,0],[2,.14,25,2,.05,0],[1,.07,15,1,.03,.04]].map(([hitsPerTrigger,critRateBonus,attackBonus,attacksPerTrigger,critDamagePerAttack,dodgeRateBonus], index) =>
      [index + 1, { hitsPerTrigger, critRateBonus, attackBonus, attacksPerTrigger, critDamagePerAttack, dodgeRateBonus,
        counterDamageEvery: index === 3 ? 10 : 0 }])) },
  "naruto-nine-tails-bond": { id: "naruto-nine-tails-bond", name: "九尾的羁绊", type: "passive", passive: true, maxLevel: 1,
    description: "低于半血时提升攻击并吸血；队友濒危时再强化攻击，并将伤害转为队友护盾。",
    levels: { 1: { lowHpThreshold: .5, attackBonusRatio: .3, lifesteal: .2, teammateThreshold: .15, teammateAttackBonusRatio: .3, teammateShieldRatio: .1 } } },
  "naruto-chakra-clones": { id: "naruto-chakra-clones", name: "查克拉影分身", type: "passive", passive: true, maxLevel: 1,
    description: "每场自带两个分身；队友在 HP 不高于最大 HP 的 20% 时受到攻击，必定消耗一个分身，将本次伤害减半。",
    levels: { 1: { startingClones: 2, teammateHpThreshold: .2, reduction: .5 } } },
  "naruto-multi-clone": { id: "naruto-multi-clone", name: "多重影分身", type: "active", triggerType: "on_action", maxLevel: 4,
    description: "分身攻击主目标，并对其余敌人造成附加伤害；只有一个敌人时附加伤害仍命中主目标。",
    levels: Object.fromEntries([[.5,1.3],[.6,1.6],[.7,1.9],[.7,2.2]].map(([chance,multiplier], index) =>
      [index + 1, { chance, multiplier, splashRatio: index === 3 ? .5 : .75, cloneGain: index === 3 ? 1 : 0, effectType: "damage", attackType: "melee" }])) },
  "naruto-giant-rasengan": { id: "naruto-giant-rasengan", name: "大玉螺旋丸", type: "active", triggerType: "on_action", maxLevel: 4,
    description: "沿用螺旋丸等级伤害；每次施放积累查克拉，满 100 时追加超大玉螺旋丸。",
    levels: Object.fromEntries(Array.from({ length: 4 }, (_, index) => [index + 1, {
      ...[null, { chance: .4, multiplierFormula: { base: 1, stat: "spd", coefficient: .003 } },
        { chance: .44, multiplierFormula: { base: 1, stat: "spd", coefficient: .006 } },
        { chance: .48, multiplierFormula: { base: 1, stat: "spd", coefficient: .009 } },
        { chance: .52, multiplierFormula: { base: 1, stat: "spd", coefficient: .012 } }][index + 1],
      chakraLevelGain: (index + 1) * 3, chakraThreshold: 100, effectType: "damage", attackType: "melee" }])) },
  "tang-compassion": { id: "tang-compassion", name: "慈悲为怀", type: "passive", passive: true, maxLevel: 1,
    description: "高血量为友方减伤；低血量从友方伤害中获治疗；濒危时由另一名玩家队友分摊伤害。",
    levels: { 1: { highHpThreshold: .8, damageReduction: .1, lowHpThreshold: .6, healFromAllyDamage: .2,
      criticalHpThreshold: .2, sharedDamageRatio: .4 } } },
  "tang-boundless-dharma": { id: "tang-boundless-dharma", name: "无量佛法", type: "active", triggerType: "on_meditation", maxLevel: 4,
    description: "打坐每满四回合强化己方、削弱敌方；离开打坐后重新计数。",
    levels: Object.fromEntries([[50,0,false],[50,10,false],[100,10,false],[100,10,true]].map(([attackCap,allyAttackStep,teamShield], index) =>
      [index + 1, { meditationRounds: 4, enemyAttackStep: 10, allyAttackStep, attackCap, teamShield, effectType: "meditation" }])) },
  "tang-flesh": {
    id: "tang-flesh", name: "唐僧肉", type: "passive", passive: true, maxLevel: 2,
    description: "召唤物存活时唐僧受到伤害减少 20%；Lv.2 召唤物按实际造成伤害的 20% 治疗唐僧。",
    levels: { 1: { reduction: 0.2 }, 2: { reduction: 0.2, summonHealRatio: 0.2 } },
  },
  "journey-west": {
    id: "journey-west", name: "取经之路", type: "active", triggerType: "on_action", maxLevel: 14,
    description: "每次行动必定尝试召唤；同一时间最多一只，同种召唤物每场最多成功召唤一次。",
    levels: Object.fromEntries(Array.from({ length: 14 }, (_, index) => [index + 1, { chance: 1, effectType: "summon", summonSkillChance: (index + 1) * .07,
      ...(index + 1 >= 11 ? { attackBonus: index + 1 === 14 ? 150 : 100 } : {}),
      ...(index + 1 >= 13 ? { summonHpBonus: index + 1 === 14 ? 1500 : 1000 } : {}),
      reconcileWukong: index + 1 === 14 }])),
  },
  "tang-meditation-strike": {
    id: "tang-meditation-strike", name: "诵经冲击", type: "active", maxLevel: 1,
    levels: { 1: { chance: 1, multiplier: 1.2, effectType: "damage", attackType: "magic" } },
  },
  "horse-hoof": { id: "horse-hoof", name: "蹄朝西", type: "active", maxLevel: 1,
    levels: { 1: { chance: 1, multiplier: 1, attackFormula: "atk_plus_spd", effectType: "damage", attackType: "melee" } } },
  "bajie-rake": { id: "bajie-rake", name: "九齿钉耙", type: "active", maxLevel: 1,
    levels: { 1: { chance: 1, multiplier: 1, attackFormula: "atk_plus_current_hp_fraction", hpFraction: 0.2, effectType: "damage", attackType: "melee" } } },
  "shaseng-staff": { id: "shaseng-staff", name: "梭罗宝杖", type: "active", maxLevel: 1,
    levels: { 1: { chance: 1, multiplier: 1.5, attackFormula: "atk_plus_current_def", targetRule: "all_living", effectType: "damage", attackType: "magic" } } },
  "wukong-fate": { id: "wukong-fate", name: "天命人", type: "active", maxLevel: 1,
    levels: { 1: { chance: 1, effectType: "alternating", summonerDefenseBonus: 80,
      summonerDefenseDurationRounds: 1, damageResistance: 0.2, trueDamage: 666 } } },
  "reiner-sat-down": {
    id: "reiner-sat-down", name: "莱纳我坐了", type: "active",
    description: "50% 概率释放；下一个完整战斗回合受到的最终伤害减少 25%，重复释放只刷新持续时间。",
    triggerType: "on_action", targetRule: "self", maxLevel: 1,
    levels: { 1: { chance: 0.5, effectType: "next-round-reduction", reduction: 0.25 } },
  },
  "colossal-steam-wave": {
    id: "colossal-steam-wave", name: "蒸汽波", type: "passive",
    description: "每第 4 个全局回合开始，对所有存活玩家造成 300 点真实伤害，并对存活铠之巨人造成 100 点真实伤害。",
    maxLevel: 1, levels: { 1: {} },
  },
  "boros-meteor-burst": {
    id: "boros-meteor-burst", name: "流星爆发", type: "active", description: "阶段二每次行动释放；奇数次单体 1.3 倍，偶数次全体 0.7 倍。",
    triggerType: "on_action", targetRule: "alternating", maxLevel: 1,
    levels: { 1: { chance: 1, multiplier: 1.3, alternatingMultiplier: 0.7, effectType: "damage", attackType: "ranged" } },
  },
  "boros-collapsing-star": {
    id: "boros-collapsing-star", name: "崩星咆哮炮", type: "active", description: "阶段三每次行动对所有存活敌人分别造成 1.3 倍伤害。",
    triggerType: "on_action", targetRule: "all_living", maxLevel: 1,
    levels: { 1: { chance: 1, multiplier: 1.3, effectType: "damage", attackType: "ranged", targetRule: "all_living" } },
  },
  "bites-the-dust": {
    id: "bites-the-dust", name: "败者食尘", type: "active", description: "40% 概率将自身 HP 设为两完整回合前的快照，并使所有未爆炸炸弹提前一回合。",
    triggerType: "on_action", targetRule: "self", maxLevel: 1,
    levels: { 1: { chance: 0.40, effectType: "rewind" } },
  },
  "toji-heavenly-restriction": {
    id: "toji-heavenly-restriction", name: "天予咒缚", type: "passive", description: "速度高于目标时连击，最多连续出拳 5 次；累计出拳达到 3 次后，进入疲劳状态，每次正常行动后休息一次。",
    maxLevel: 1, levels: { 1: { maxHits: 5, fatigueAtHit: 3 } },
  },
  "killer-queen": {
    id: "killer-queen", name: "杀手皇后", type: "passive", description: "每次造成有效伤害都附加一枚炸弹；经过三个后续完整回合后独立引爆，对所有存活对手造成伤害并无视 70% DEF，爆炸伤害不计入其他炸弹。",
    maxLevel: 1, levels: { 1: {} },
  },
  "boros-cosmic-overlord": {
    id: "boros-cosmic-overlord", name: "宇宙霸主", type: "passive", description: "阶段一减伤；阶段二每个完整回合速度+10；阶段三入场强化攻击和速度并获得10%吸血，此后每个完整回合攻击+30。",
    maxLevel: 1, levels: { 1: {} },
  },
  "gilgamesh-enuma-elish": {
    id: "gilgamesh-enuma-elish", name: "天地乖离", type: "active", description: "每次行动释放，按成功释放次数循环四种效果。",
    triggerType: "on_action", targetRule: "front_priority_random", maxLevel: 1,
    castPhases: {
      1: { multiplier: 1.3, weaknessDamageReduction: 0.5 },
      2: { multiplier: 0.9, ignoreDefenseFraction: 0.4, targetRule: "all_living" },
      3: { selfHeal: 100 },
      4: { trueDamageRatio: 0.4, targetRule: "lowest_current_hp" },
    },
    levels: { 1: { chance: 1, multiplier: 1.3, effectType: "damage", attackType: "magic" } },
  },
  "kaneki-one-eye": {
    id: "kaneki-one-eye", name: "独眼", type: "passive", description: "暴击后按本次最终计算伤害回血；Lv.1 恢复 25%，Lv.2 恢复 40% 并增加 10 个百分点暴击率、20 个百分点暴击伤害。",
    triggerType: "after_critical_hit", targetRule: "self", passive: true, unlockMethod: "character_passive", maxLevel: 2,
    levels: { 1: { healFromCalculatedDamage: 0.25 }, 2: { healFromCalculatedDamage: 0.40, critRateBonus: 0.10, critDamageBonus: 0.20 } },
  },
  "kaneki-predator": {
    id: "kaneki-predator", name: "捕食者", type: "active", description: "以当前 ATK + SPD 攻击；目标 HP 严格低于技能阈值时，本次命中必定暴击。",
    triggerType: "on_action", targetRule: "front_priority_random", passive: false, unlockMethod: "character_choice", maxLevel: 4,
    levels: {
      1: { chance: 0.50, multiplier: 1, attackFormula: "atk_plus_spd", guaranteedCritBelowHpRatio: 0.25, effectType: "damage", attackType: "melee" },
      2: { chance: 0.55, multiplier: 1, attackFormula: "atk_plus_spd", guaranteedCritBelowHpRatio: 0.30, effectType: "damage", attackType: "melee", killMaxHpBonus: 0 },
      3: { chance: 0.55, multiplier: 1.1, attackFormula: "atk_plus_spd", guaranteedCritBelowHpRatio: 0.40, effectType: "damage", attackType: "melee", killMaxHpBonus: 0 },
      4: { chance: 0.60, multiplier: 1.3, attackFormula: "atk_plus_spd", guaranteedCritBelowHpRatio: 0.50, effectType: "damage", attackType: "melee", killMaxHpBonus: 50 },
    },
  },
  "kaneki-1000-7": {
    id: "kaneki-1000-7", name: "1000-7", type: "active", description: "受伤后自动计数；达到当前等级所需次数时，本场暴击率与攻击力累加，Lv.4 还增加闪避率。",
    triggerType: "on_damage", targetRule: "self", passive: false, unlockMethod: "character_choice", maxLevel: 4,
    levels: {
      1: { hitsPerTrigger: 2, critRateBonus: 0.07, attackBonus: 10, dodgeRateBonus: 0 },
      2: { hitsPerTrigger: 2, critRateBonus: 0.07, attackBonus: 20, dodgeRateBonus: 0 },
      3: { hitsPerTrigger: 2, critRateBonus: 0.14, attackBonus: 25, dodgeRateBonus: 0 },
      4: { hitsPerTrigger: 1, critRateBonus: 0.07, attackBonus: 15, dodgeRateBonus: 0.03 },
    },
  },
  "c4-garuda": {
    id: "c4-garuda", name: "C4 迦楼罗", type: "active", description: "造成 1.2 倍伤害；命中且目标存活时，目标 DEF 降低 20 点，持续本场战斗。",
    triggerType: "on_action", targetRule: "front_priority_random", passive: false, unlockMethod: "boss", maxLevel: 1,
    levels: { 1: { chance: 1, multiplier: 1.2, effectType: "damage", attackType: "magic", defenseReduction: 20, defenseFloor: -20 } },
  },
  "bomb-demon-boom": {
    id: "bomb-demon-boom", name: "Boom", type: "active", description: "30% 概率发动爆破，造成 1.8 倍攻击伤害。",
    triggerType: "on_action", targetRule: "front_priority_random", passive: false, unlockMethod: "elite", maxLevel: 1,
    levels: { 1: { chance: 0.30, multiplier: 1.8, effectType: "damage", attackType: "ranged" } },
  },
  "mahito-domain": {
    id: "mahito-domain", name: "自闭圆顿裹", type: "passive", description: "HP 低于 50% 后触发；当回合 ATK +50，之后每个新回合 ATK 再 +50。",
    triggerType: "on_action", targetRule: "self", passive: true, unlockMethod: "elite", maxLevel: 1,
    levels: { 1: { currentHpRatioBelow: 0.5, attackBonusPerRound: 50 } },
  },
  "shadow-clone-rush": {
    id: "shadow-clone-rush", name: "影分身突袭", type: "active", description: "触发时保留基础攻击，并由影分身各贡献 0.3 倍攻击力伤害。",
    triggerType: "on_action", targetRule: "front_priority_random", passive: false, unlockMethod: "character_choice", maxLevel: 4,
    levels: {
      1: { chance: 0.55, multiplier: 1.3, cloneCount: 1, effectType: "damage", attackType: "melee" },
      2: { chance: 0.60, multiplier: 1.6, cloneCount: 2, effectType: "damage", attackType: "melee" },
      3: { chance: 0.65, multiplier: 1.9, cloneCount: 3, effectType: "damage", attackType: "melee" },
      4: { chance: 0.75, multiplier: 2.2, cloneCount: 4, effectType: "damage", attackType: "melee", splashRatio: 0.5, specialEffect: { kind: "clone_afterimage" } },
    },
  },
  rasengan: {
    id: "rasengan", name: "螺旋丸", type: "active", description: "伤害倍率随技能等级系数和战斗中的实际速度变化。每次施放击杀敌人，本局 SPD +5（同次施放只生效一次）。",
    triggerType: "on_action", targetRule: "front_priority_random", passive: false, unlockMethod: "scroll", maxLevel: 4,
    levels: {
      1: { chance: 0.40, multiplierFormula: { base: 1, stat: "spd", coefficient: 0.003 }, effectType: "damage", attackType: "melee" },
      2: { chance: 0.44, multiplierFormula: { base: 1, stat: "spd", coefficient: 0.006 }, effectType: "damage", attackType: "melee" },
      3: { chance: 0.48, multiplierFormula: { base: 1, stat: "spd", coefficient: 0.009 }, effectType: "damage", attackType: "melee" },
      4: { chance: 0.52, multiplierFormula: { base: 1, stat: "spd", coefficient: 0.012 }, effectType: "damage", attackType: "melee", specialEffect: { kind: "rasengan_burst" } },
    },
  },
  "ninja-instinct": {
    id: "ninja-instinct", name: "忍者直觉", type: "passive", description: "每场战斗首次受到伤害时减免 8%。",
    triggerType: "before_damage", targetRule: "self", passive: true, unlockMethod: "character_passive", maxLevel: 1,
    levels: { 1: { oncePerBattle: true, damageReduction: 0.08 } },
  },
  jinchuriki: {
    id: "jinchuriki", name: "人柱力", type: "passive", description: "Lv.1 首次低于半血时本场 ATK +25%；Lv.2 严格低于半血时 ATK +30%、吸血 +20%，恢复到半血及以上时移除。",
    triggerType: "before_attack", targetRule: "self", passive: true, unlockMethod: "character_passive", maxLevel: 2,
    levels: { 1: { oncePerBattle: true, currentHpRatioBelow: 0.5, attackBonus: 0.25, rounding: "floor" }, 2: { currentHpRatioBelow: 0.5, attackBonus: 0.30, lifesteal: 0.20, rounding: "floor" } },
  },
  "eren-2000-years": {
    id: "eren-2000-years", name: "2000年后的你", type: "passive", description: "Lv.1 每场免疫首次受到的攻击；Lv.2 每场免疫前两次，并一次性增加最大 HP 400。",
    triggerType: "before_damage", targetRule: "self", passive: true, unlockMethod: "character_passive", maxLevel: 2,
    levels: { 1: { oncePerBattle: true, damageImmune: true, immuneHits: 1 }, 2: { oncePerBattle: true, damageImmune: true, immuneHits: 2, maxHpBonus: 400 } },
  },
  "eren-free-will": {
    id: "eren-free-will", name: "自由意志", type: "active", description: "触发时进行一次普通攻击，并获得持续本场战斗的 DEF 加成，最多叠加 4 次。每累计成功触发 3 次，恢复最大 HP 的 8%；Lv.4 每第 3 次释放追加当前 DEF×1 的真实伤害。",
    triggerType: "on_action", targetRule: "front_priority_random", passive: false, unlockMethod: "character_choice", maxLevel: 4,
    levels: {
      1: { chance: 0.50, multiplier: 1, effectType: "damage", normalAttack: true, defenseBonus: 10, stackDefenseBonus: true, maxDefenseStacks: 4, defenseDuration: "battle", healEveryTriggers: 3, healMaxHpFraction: 0.08 },
      2: { chance: 0.55, multiplier: 1, effectType: "damage", normalAttack: true, defenseBonus: 15, stackDefenseBonus: true, maxDefenseStacks: 4, defenseDuration: "battle", healEveryTriggers: 3, healMaxHpFraction: 0.08 },
      3: { chance: 0.60, multiplier: 1, effectType: "damage", normalAttack: true, defenseBonus: 20, stackDefenseBonus: true, maxDefenseStacks: 4, defenseDuration: "battle", healEveryTriggers: 3, healMaxHpFraction: 0.08 },
      4: { chance: 0.70, multiplier: 1, effectType: "damage", normalAttack: true, defenseBonus: 25, stackDefenseBonus: true, maxDefenseStacks: 4, defenseDuration: "battle", healEveryTriggers: 3, healMaxHpFraction: 0.08, extraTrueDamageEvery: 3, extraTrueDamageDefRatio: 1 },
    },
  },
  "eren-tatakae": {
    id: "eren-tatakae", name: "塔塔开", type: "active", description: "触发时以 ATK + 当前 DEF 作为攻击力并造成倍率伤害；下回合嘲讽敌方单体攻击。Lv.4 将每名存活队友的护盾刷新至最多 200 点，不叠加。",
    triggerType: "on_action", targetRule: "front_priority_random", passive: false, unlockMethod: "character_choice", maxLevel: 4,
    levels: {
      1: { chance: 0.30, multiplier: 1.3, attackFormula: "atk_plus_current_def", effectType: "damage", tauntNextRound: true },
      2: { chance: 0.35, multiplier: 1.4, attackFormula: "atk_plus_current_def", effectType: "damage", tauntNextRound: true },
      3: { chance: 0.40, multiplier: 1.55, attackFormula: "atk_plus_current_def", effectType: "damage", tauntNextRound: true },
      4: { chance: 0.50, multiplier: 1.7, attackFormula: "atk_plus_current_def", effectType: "damage", tauntNextRound: true, teamShield: 200 },
    },
  },
  "shield-bash": {
    id: "shield-bash", name: "盾击", type: "active", description: "用盾牌攻击当前优先目标。",
    triggerType: "on_action", targetRule: "front_priority_random", passive: false, unlockMethod: "character_choice", maxLevel: 4,
    levels: {
      1: { chance: 0.2, multiplier: 1.45, effectType: "damage", attackType: "melee" },
      2: { chance: 0.22, multiplier: 1.55, effectType: "damage", attackType: "melee" },
      3: { chance: 0.24, multiplier: 1.7, effectType: "damage", attackType: "melee" },
      4: { chance: 0.26, multiplier: 1.85, effectType: "damage", attackType: "melee", specialEffect: { kind: "guard_break" } },
    },
  },
  "guardian-stance": {
    id: "guardian-stance", name: "守护架势", type: "active", description: "短暂提高自身防御。",
    triggerType: "on_action", targetRule: "self", passive: false, unlockMethod: "scroll", maxLevel: 4,
    levels: {
      1: { chance: 0.16, effectType: "buff", defenseBonus: 12, durationTurns: 1 },
      2: { chance: 0.18, effectType: "buff", defenseBonus: 16, durationTurns: 1 },
      3: { chance: 0.2, effectType: "buff", defenseBonus: 21, durationTurns: 1 },
      4: { chance: 0.22, effectType: "buff", defenseBonus: 28, durationTurns: 1, specialEffect: { kind: "brace_next_hit" } },
    },
  },
  "steadfast-guard": {
    id: "steadfast-guard", name: "稳固守势", type: "passive", description: "每场战斗首次受到伤害时减免 8%。",
    triggerType: "before_damage", targetRule: "self", passive: true, unlockMethod: "character_passive", maxLevel: 1,
    levels: { 1: { oncePerBattle: true, damageReduction: 0.08 } },
  },
  firebolt: {
    id: "firebolt", name: "火球术", type: "active", description: "发射火球造成单体魔法伤害。",
    triggerType: "on_action", targetRule: "front_priority_random", passive: false, unlockMethod: "character_choice", maxLevel: 4,
    levels: {
      1: { chance: 0.2, multiplier: 1.5, effectType: "damage", attackType: "magic" },
      2: { chance: 0.22, multiplier: 1.65, effectType: "damage", attackType: "magic" },
      3: { chance: 0.24, multiplier: 1.8, effectType: "damage", attackType: "magic" },
      4: { chance: 0.26, multiplier: 2.0, effectType: "damage", attackType: "magic", specialEffect: { kind: "ember_burst" } },
    },
  },
  "arcane-ward": {
    id: "arcane-ward", name: "奥术护幕", type: "active", description: "获得短暂防御增益。",
    triggerType: "on_action", targetRule: "self", passive: false, unlockMethod: "scroll", maxLevel: 4,
    levels: {
      1: { chance: 0.14, effectType: "buff", defenseBonus: 10, durationTurns: 1 },
      2: { chance: 0.16, effectType: "buff", defenseBonus: 14, durationTurns: 1 },
      3: { chance: 0.18, effectType: "buff", defenseBonus: 19, durationTurns: 1 },
      4: { chance: 0.2, effectType: "buff", defenseBonus: 25, durationTurns: 1, specialEffect: { kind: "ward_flash" } },
    },
  },
  "mana-spark": {
    id: "mana-spark", name: "魔力余辉", type: "passive", description: "每场战斗首次攻击时获得 5% 伤害加成。",
    triggerType: "before_attack", targetRule: "self", passive: true, unlockMethod: "character_passive", maxLevel: 1,
    levels: { 1: { oncePerBattle: true, damageBonus: 0.05 } },
  },
  "heracles-nine-heads": { id: "heracles-nine-heads", name: "射杀百头", type: "active",
    description: "25% 概率造成 1.2 倍 ATK 单体伤害；自身当前 HP 严格低于 1000 时本次伤害翻倍。",
    levels: { 1: { chance: .25, multiplier: 1.2, effectType: "damage", attackType: "melee" } } },
  "odin-ravens": { id: "odin-ravens", name: "福金与雾尼", type: "passive", passive: true,
    description: "按整场战斗回合每 5 回合循环减伤：第 1 至 5 回合分别减免 50%、40%、30%、20%、0%，第 6 回合重新从 50% 开始；同回合所有伤害均适用。",
    levels: { 1: {} } },
  "odin-gungnir": { id: "odin-gungnir", name: "冈格尼尔", type: "active",
    description: "30% 概率无视站位随机攻击一名存活角色，造成 1.4 倍伤害并使其下一行动回合眩晕。",
    levels: { 1: { chance: .3, multiplier: 1.4, effectType: "damage", attackType: "magic", targetRule: "random_all", stunNextAction: true } } },
  "zhang-jiao-lightning": { id: "zhang-jiao-lightning", name: "雷法", type: "active",
    description: "30% 概率随机对场上任一存活单位（包括自身及友军）造成 300 点真实伤害。",
    levels: { 1: { chance: .3, trueDamage: 300, effectType: "damage", attackType: "magic", targetRule: "any_living" } } },
};

export const ATTRIBUTE_UPGRADES = [
  { id: "max_hp", name: "强健", description: "最大 HP +100。", effects: { maxHp: 100 } },
  { id: "attack", name: "猛攻", description: "ATK +10。", effects: { atk: 10 } },
  { id: "defense", name: "坚守", description: "DEF +10。", effects: { def: 10 } },
  { id: "speed", name: "迅捷", description: "SPD +10。", effects: { spd: 10 } },
];

export const CAMPFIRE_RULES = {
  rest: { id: "rest", name: "休息", healFraction: 0.40 },
  skillUpgrade: { id: "skill_upgrade", name: "技能升级" },
};

export const ADVENTURE_EVENT_DATA = {
  scroll: {
    id: "scroll", name: "老头的卷轴", type: "learn_skill", description: "遇到一个好色的白发老人，他给了你一份神秘的卷轴！",
    image: "assets/events/event_scroll_jiraiya.png", effectText: "跟随白发老人学习一项新技能，或选择离开。",
    containsBattle: false, providesReward: true, requiresChoice: true,
  },
  sea_beyond: { id: "sea_beyond", name: "海的那边……", type: "sea_choice", description: "围城里的你，渴望翻过矗立的城墙去看看海。", image: "assets/events/event_sea_beyond.png", effectText: "选择前往后先以生命换取一项属性，随后可决定是否继续；每次结果在选择后揭晓。", containsBattle: false, providesReward: true, requiresChoice: true },
  sea_beyond_2: { id: "sea_beyond_2", name: "海的那边……", type: "sea_sequel", description: "你孤身一人来到海的那边，结果却与你想象中截然不同，你所仇恨在意的一切到底是什么呢？……海浪拍打着岸边，你望向远方，下定决心。", image: "assets/events/event_sea_beyond_2.png", effectText: "你将如何选择？", containsBattle: false, providesReward: true, requiresChoice: true },
  old_scroll_2: { id: "old_scroll_2", name: "老头的卷轴", type: "scroll_sequel", description: "又遇到这个老头了，似乎手里面还拿着一本什么天堂？……", image: "assets/events/event_old_scroll_2.png", effectText: "你将如何回应？", containsBattle: false, providesReward: true, requiresChoice: true },
  anteiku_2: { id: "anteiku_2", name: "安定区", type: "anteiku_sequel", description: "再次回来时，街区已经被封锁，年迈的店长告诉你，平静的日子已经一去不返。", image: "assets/events/event_anteiku_2.png", effectText: "你将如何选择？", containsBattle: false, providesReward: true, requiresChoice: true },
  anteiku_3: { id: "anteiku_3", name: "安定区", type: "anteiku_final", description: "封锁后的安定区传来脚步声，白色死神站在街道尽头。", image: "assets/events/event_anteiku_3.png", effectText: "你将如何选择？", containsBattle: false, providesReward: true, requiresChoice: true },
  giant_rock_2: { id: "giant_rock_2", name: "路遇巨石", type: "rock_sequel", description: "兜兜转转又是这块巨石，你听到了巨石下有窸窸窣窣的声音。", image: "assets/events/event_giant_rock_2.png", effectText: "你将如何选择？", containsBattle: false, providesReward: true, requiresChoice: true },
  death_note: { id: "death_note", name: "死亡笔记", type: "death_note", description: "一本散发着不祥气息的笔记本……要不要打开看看呢？", image: "assets/events/event_death_note.png", effectText: "打开后可能招来厄运，也可能获得力量；效果持续两场战斗，并显示在状态栏。", containsBattle: false, providesReward: true, requiresChoice: true },
  fate_gate: { id: "fate_gate", name: "命运石之门", type: "guaranteed_skill", description: "这一切都是命运石之门的选择！", image: "assets/events/event_fate_gate.png", effectText: "下一场战斗中随机强化一个已学习且可触发的技能，使其触发率提升至 100%。", containsBattle: false, providesReward: false, requiresChoice: true },
  fall_rock: {
    id: "fall_rock", name: "酋长岩意外", type: "max_hp_loss", description: "你突然决定去酋长岩 free solo，不慎摔落……",
    image: "assets/events/event_fall_rock.png", effectText: "最大生命值上限降低 5%，当前生命不变（超过新上限时会受限）。",
    maxHpLossFraction: 0.05, containsBattle: false, providesReward: false, requiresChoice: false,
    stages: [
      { maxHpLossFraction: 0.05 },
      { description: "再次来到酋长岩，在掉落的途中你领悟到了勇气的真谛", effectText: "最大生命值上限降低 5%，攻击力提高 15%。", maxHpLossFraction: 0.05, attackGainFraction: 0.15 },
      { description: "你终于登上了酋长岩，此刻你一览众山小", effectText: "暴击率提高 15 个百分点。", critRateGain: 0.15 },
    ],
  },
  big_rock: {
    id: "big_rock", name: "路遇巨石", type: "temporary_debuff", description: "一块硕大的石头挡住了你的去路。",
    image: "assets/events/event_big_rock.png", effectText: "选择如何通过。",
    effect: { stat: "spd", amount: -20, durationBattles: 1 }, containsBattle: false, providesReward: false, requiresChoice: true,
  },
  coffee_shop: {
    id: "coffee_shop", name: "安定区", type: "temporary_buff", description: "你走进一家咖啡店，空气中弥漫着浓郁的香气，一位老人微笑招呼你坐下，端上一杯热气腾腾的咖啡。",
    image: "assets/events/event_coffee_shop.png", effectText: "选择如何停留。",
    effect: { stat: "def", amount: 30, durationBattles: 1 }, containsBattle: false, providesReward: false, requiresChoice: true,
  },
  giant_encirclement: {
    id: "giant_encirclement", name: "糟糕，被巨人包围了！", type: "giant_encirclement",
    description: "那一天，人类想起了被巨人支配的恐惧",
    image: "assets/events/event_giant_encirclement.png", effectText: "选择如何应对眼前的巨人。",
    containsBattle: false, providesReward: true, requiresChoice: true,
  },
  kings_treasury: {
    id: "kings_treasury", name: "王之宝库", type: "treasure_choice",
    description: "你在探索途中发现了一扇金色的大门，门后堆满了黄金和珍异的宝物。",
    image: "assets/events/event_kings_treasury.png", effectText: "决定如何面对王之宝库。",
    containsBattle: false, providesReward: true, requiresChoice: true,
  },
  gamble: { id: "gamble", name: "一次豪赌", type: "gamble", description: "小赌怡情，大赌伤身（三局两胜者，当赏！）", image: "assets/events/gamble-coin.svg", effectText: "先选择一名队员，再决定是否参与每一轮赌博。", containsBattle: false, providesReward: true, requiresChoice: true },
  gamble_2: { id: "gamble_2", name: "一次豪赌（2）", type: "gamble", description: "小赌怡情，大赌伤身（三局两胜者，当赏！）", image: "assets/events/gamble-coin.svg", effectText: "先选择一名队员，再决定是否参与每一轮赌博。", containsBattle: false, providesReward: true, requiresChoice: true },
};

export const GIANT_SPINAL_FLUID = Object.freeze({
  id: "giant_spinal_fluid", name: "巨人脊髓液", image: "assets/events/giant_spinal_fluid.png",
  description: "本局 DEF +20，最大 HP +150，并立即恢复等量 HP（不超过最大 HP）。重复获得时本次属性收益逐次提高。", atk: 0, def: 20, maxHp: 150,
});

export const GUN_DEVIL_FRAGMENT = Object.freeze({
  id: "gun_devil_fragment", name: "枪魔碎片", image: "assets/treasures/gun-devil-fragment.png",
  description: "本局最大 HP +200，并立即恢复 200 HP（不超过最大 HP）。重复获得时本次属性收益逐次提高。", maxHp: 200,
});

// King's Treasury rewards are data only; their effects are applied by the
// existing run-character and battle-state rules.
export const TREASURE_DATA = Object.freeze({
  magic_conch: { id: "magic_conch", tier: "small", name: "神奇海螺", image: "assets/treasures/magic-conch.png", description: "本局可减免的战斗伤害减免 +5 个百分点。", damageReduction: 0.05 },
  sukuna_finger: { id: "sukuna_finger", tier: "small", name: "宿傩手指", image: "assets/treasures/sukuna-finger.png", description: "本局 ATK +30，最大 HP -150。", atk: 30, maxHp: -150 },
  odm_gear: { id: "odm_gear", tier: "small", name: "立体机动装置", image: "assets/treasures/odm-gear.png", description: "本局闪避率 +5 个百分点，暴击率 +5 个百分点。", dodgeRateBonus: 0.05, critRateBonus: 0.05 },
  angel_breath: { id: "angel_breath", tier: "royal", name: "大天使的气息", image: "assets/treasures/angel-breath.png", description: "立即回满 HP；此后每场战斗结束恢复最大 HP 的 20%。", battleEndHealRatio: 0.20 },
  stone_mask: { id: "stone_mask", tier: "royal", name: "石鬼面", image: "assets/treasures/stone-mask.png", description: "本局吸血 +40 个百分点，但无法通过篝火恢复 HP。", lifesteal: 0.40, blocksCampfireHeal: true },
  nichirin_blade: { id: "nichirin_blade", tier: "royal", name: "日轮刀", image: "assets/treasures/nichirin-blade.png", description: "普通攻击命中后，额外扣除目标攻击前当前 HP 的 8%，无视 DEF。", normalAttackCurrentHpRatio: 0.08 },
});

export const ELITE_BONUS_REWARDS = [
  { id: "skill_upgrade", name: "技能精进" },
];

