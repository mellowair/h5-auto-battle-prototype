import { CHARACTER_DATA } from "./characters.js";
import { initializeBattle, restartBattle, simulateBattle } from "./battle.js";

const $ = (selector) => document.querySelector(selector);
const log = $("#battle-log");
const statusLabel = $("#battle-status");
const startButton = $("#start-btn");
const speedButton = $("#speed-btn");
const skipButton = $("#skip-btn");
const restartButton = $("#restart-btn");
let viewState = initializeBattle();
let playback = null;
let timer = null;
let generation = 0;
let fast = false;
let displayedEvents = 0;
const BASE_DELAY = 780;

function buildHealthRows() {
  const allies = CHARACTER_DATA.filter((c) => c.team === "ally");
  const enemies = CHARACTER_DATA.filter((c) => c.team === "enemy");
  const render = (chars) => chars.map((c) => `<div class="health-row" data-health="${c.id}">
    <span class="health-name">${c.name}<small>${c.role}</small></span>
    <span class="health-track"><i class="health-fill ${c.team === "ally" ? "ally-fill" : "enemy-fill"}"></i></span>
    <span class="health-value"><b class="current-hp">${c.hp}</b><small>/${c.hp}</small></span>
  </div>`).join("");
  $("#health-bars").innerHTML = render(allies);
  $("#enemy-health-bars").innerHTML = render(enemies);
}

function updateHealth(character) {
  const row = document.querySelector(`[data-health="${character.id}"]`);
  if (!row) return;
  row.querySelector(".current-hp").textContent = character.currentHp;
  row.querySelector(".health-fill").style.width = `${(character.currentHp / character.maxHp) * 100}%`;
  row.classList.toggle("is-dead", !character.alive);
  const fighter = document.querySelector(`[data-character="${character.id}"]`);
  fighter?.classList.toggle("is-dead", !character.alive);
}

function addLog(text, kind = "") {
  const item = document.createElement("li");
  item.className = `log-entry ${kind}`;
  item.innerHTML = text;
  log.append(item);
  while (log.children.length > 7) log.firstElementChild.remove();
  log.scrollTop = log.scrollHeight;
  displayedEvents += 1;
  $("#log-count").textContent = `${displayedEvents} 条记录`;
}

function setStatus(text, state = "") {
  statusLabel.textContent = text;
  statusLabel.parentElement.classList.toggle("is-fighting", state === "fighting");
  statusLabel.parentElement.classList.toggle("is-finished", state === "finished");
}

function clearEffects() {
  document.querySelectorAll(".fighter").forEach((fighter) => {
    fighter.classList.remove("is-attacking", "is-hit", "is-casting");
    fighter.querySelector(".damage-number").textContent = "";
  });
  $("#battle-stamp").className = "battle-stamp";
  $("#battle-stamp").textContent = "";
}

function playEvent(event, finish) {
  if (event.type === "battle-end") {
    const win = event.outcome === "victory";
    setStatus(win ? "胜利" : "战败", "finished");
    $("#battle-stamp").textContent = win ? "胜利！" : "战斗失败";
    $("#battle-stamp").classList.add("show", win ? "stamp-win" : "stamp-lose");
    addLog(win ? `第 ${event.round} 轮 · <b>胜利！敌方全员倒下</b>` : `第 ${event.round} 轮 · <b>战斗失败</b>`, win ? "log-win" : "log-death");
    finish();
    return;
  }
  const attacker = viewState.characters.find((c) => c.id === event.attackerId);
  const target = viewState.characters.find((c) => c.id === event.targetId);
  const sourceEl = document.querySelector(`[data-character="${attacker.id}"]`);
  const targetEl = document.querySelector(`[data-character="${target.id}"]`);
  const sourceSide = attacker.team === "ally" ? "ally" : "enemy";
  target.currentHp = event.targetHp;
  target.alive = !event.targetDied;
  sourceEl.classList.add("is-attacking");
  targetEl.classList.add("is-hit");
  const damage = targetEl.querySelector(".damage-number");
  damage.textContent = `-${event.damage}`;
  damage.classList.remove("pop");
  void damage.offsetWidth;
  damage.classList.add("pop");
  updateHealth(target);
  const actionText = event.skilled ? `<span class="skill-name">${event.skillName}</span>` : "普通攻击";
  addLog(`<span class="round-label">R${event.round}</span> <b>${attacker.name}</b> ${actionText} → <b>${target.name}</b> <span class="damage-text">-${event.damage}</span>`, event.skilled ? "log-skill" : sourceSide === "enemy" ? "log-enemy" : "");
  if (event.skilled) {
    sourceEl.classList.add("is-casting");
    const stamp = $("#battle-stamp");
    stamp.textContent = event.skillName;
    stamp.className = "battle-stamp skill-stamp show";
    window.setTimeout(() => stamp.classList.remove("show"), fast ? 180 : 520);
  }
  if (event.targetDied) {
    targetEl.classList.add("is-dead");
    addLog(`<b>${target.name}</b> 倒下了`, "log-death");
  }
  const delay = fast ? 190 : BASE_DELAY;
  timer = window.setTimeout(() => {
    sourceEl.classList.remove("is-attacking", "is-casting");
    targetEl.classList.remove("is-hit");
    finish();
  }, delay);
}

function playNext(token) {
  if (token !== generation || !playback) return;
  if (playback.index >= playback.events.length) {
    playback = null;
    setButtons(false);
    return;
  }
  const event = playback.events[playback.index++];
  playEvent(event, () => playNext(token));
}

function setButtons(fighting) {
  startButton.disabled = fighting;
  speedButton.disabled = !fighting;
  skipButton.disabled = !fighting;
  restartButton.disabled = false;
  startButton.classList.toggle("is-disabled", fighting);
}

function beginBattle() {
  if (playback) return;
  generation += 1;
  const token = generation;
  clearEffects();
  viewState = initializeBattle();
  viewState.characters.forEach((c) => updateHealth(c));
  log.innerHTML = "";
  displayedEvents = 0;
  $("#log-count").textContent = "战斗进行中";
  addLog("战斗开始！鸣人速度优先，准备行动。", "log-start");
  try {
    playback = { ...simulateBattle(), index: 0 };
  } catch (error) {
    console.error("Battle initialization failed:", error);
    setStatus("战斗启动失败", "finished");
    addLog("战斗未能启动，请重新开始后再试。", "log-death");
    return;
  }
  setStatus("战斗中", "fighting");
  setButtons(true);
  playNext(token);
}

function skipAnimations() {
  if (!playback) return;
  generation += 1;
  const token = generation;
  window.clearTimeout(timer);
  clearEffects();
  for (let i = playback.index; i < playback.events.length; i += 1) {
    const event = playback.events[i];
    if (event.type === "battle-end") {
      const win = event.outcome === "victory";
      setStatus(win ? "胜利" : "战败", "finished");
      $("#battle-stamp").textContent = win ? "胜利！" : "战斗失败";
      $("#battle-stamp").className = `battle-stamp show ${win ? "stamp-win" : "stamp-lose"}`;
      addLog(win ? `第 ${event.round} 轮 · <b>胜利！敌方全员倒下</b>` : `第 ${event.round} 轮 · <b>战斗失败</b>`, win ? "log-win" : "log-death");
      continue;
    }
    const target = viewState.characters.find((c) => c.id === event.targetId);
    target.currentHp = event.targetHp;
    target.alive = event.targetHp > 0;
    updateHealth(target);
    const attacker = viewState.characters.find((c) => c.id === event.attackerId);
    addLog(`<span class="round-label">R${event.round}</span> <b>${attacker.name}</b> ${event.skilled ? `<span class="skill-name">${event.skillName}</span>` : "普通攻击"} → <b>${target.name}</b> <span class="damage-text">-${event.damage}</span>`, event.skilled ? "log-skill" : attacker.team === "enemy" ? "log-enemy" : "");
    if (event.targetDied) addLog(`<b>${target.name}</b> 倒下了`, "log-death");
  }
  playback.index = playback.events.length;
  playback = null;
  setButtons(false);
}

function resetBattle() {
  generation += 1;
  window.clearTimeout(timer);
  playback = null;
  viewState = restartBattle();
  clearEffects();
  viewState.characters.forEach((c) => updateHealth(c));
  log.innerHTML = "";
  displayedEvents = 0;
  $("#log-count").textContent = "等待開戰";
  setStatus("准备就绪");
  setButtons(false);
}

startButton.addEventListener("click", beginBattle);
restartButton.addEventListener("click", resetBattle);
skipButton.addEventListener("click", skipAnimations);
speedButton.addEventListener("click", () => {
  fast = !fast;
  speedButton.classList.toggle("is-active", fast);
  $("#speed-label").textContent = fast ? "开" : "关";
});

buildHealthRows();
resetBattle();
window.__pixelBattleReady = true;
