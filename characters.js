// All balance values and lineup order live here.
export const CHARACTER_DATA = [
  {
    id: "naruto", name: "鸣人", team: "ally", role: "战士", row: "front",
    hp: 1200, atk: 150, def: 60, spd: 80,
    skill: { id: "shadow-clone-rush", name: "影分身突袭", chance: 0.25, multiplier: 1.8 },
    asset: "assets/naruto.svg", rosterOrder: 0,
  },
  {
    id: "guard", name: "守卫", team: "enemy", role: "守卫", row: "front",
    hp: 1200, atk: 100, def: 60, spd: 60, skill: null,
    asset: "assets/guard.svg", rosterOrder: 1,
  },
  {
    id: "mage", name: "法师", team: "enemy", role: "法师", row: "back",
    hp: 600, atk: 120, def: 20, spd: 80, skill: null,
    asset: "assets/mage.svg", rosterOrder: 2,
  },
];
