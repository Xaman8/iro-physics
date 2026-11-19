import { Clock } from "./clock.js";
import { mountPhysics } from "./physics-view.js";
import { mountBoard } from "./envelope-board.js";
import { mountV2 } from "./v2-graph.js";
import { text } from "./format.js";

const [plant, scenario] = await Promise.all([
  fetch("data/plant.json").then((r) => r.json()),
  fetch("data/scenario.json").then((r) => r.json()),
]);

const params = new URLSearchParams(location.search);
let fault = scenario.faults.find((item) => item.id === params.get("fault")) || scenario.faults[0];

const clock = new Clock({
  min: 0,
  max: scenario.timeDays[scenario.timeDays.length - 1] + 1,
  day: params.has("day") ? Number(params.get("day")) : 0,
});

const v2plant = await fetch("data/v2-plant.json").then((r) => r.json());
mountV2(document.getElementById("v2graph"), document.getElementById("v2detail"), v2plant);

const bar = document.getElementById("benchBar");
bar.innerHTML = `
  <span class="bench-name">Bench apparatus</span>
  <label>Plant <select id="plantPick"><option value="v1">v1 assigned envelopes</option><option value="v2">v2 discovered envelopes</option></select></label>
  <button class="btn" id="play" type="button">Replay</button>
  <button class="btn" id="reset" type="button">Reset</button>
  <span class="day-read" id="dayRead"></span>
  <input id="scrub" type="range" min="0" max="${clock.max}" step="0.05" value="${clock.day}" aria-label="Day">
  <label>Speed <input id="speed" type="range" min="0.25" max="4" step="0.25" value="1"></label>
  <label>Fault <select id="fault"></select></label>
  <span class="day-read" id="runNote"></span>`;

const faultSelect = document.getElementById("fault");
faultSelect.innerHTML = scenario.faults.map((item) => `<option value="${item.id}">${item.label}</option>`).join("");
faultSelect.value = fault.id;

const physics = mountPhysics(document.getElementById("physics"), {
  plant, scenario, getFault: () => fault, clock,
});
const v3clock = new Clock({ min: 0.5, max: 1, day: 1 });
let v3span = null;
let transport = "v3";
mountBoard(document.getElementById("envelope"), {
  clock: v3clock,
  onSpan(span) {
    v3span = span;
    const atEnd = v3clock.max <= 1 || Math.abs(v3clock.day - v3clock.max) < 0.51;
    v3clock.min = span.min;
    v3clock.max = span.max;
    v3clock.day = atEnd ? span.max : Math.min(span.max, Math.max(span.min, v3clock.day));
    v3clock.emit();
    if (transport === "v3") syncBar();
  },
});
physics.focusAsset(params.get("asset") || fault.targetAssetId);
physics.setFault();

function describeRun() {
  const bits = [`seed ${scenario.seed}`, `onset ${text(fault.onsetDay)}`];
  const limit = fault.failureDay[fault.targetAssetId];
  if (limit != null) bits.push(`${fault.targetAssetId} limit ${text(limit)}`);
  if (fault.loadStep) bits.push(`load step day ${text(fault.loadStep.startDay)}`);
  if (fault.heatwave) bits.push(`heat wave day ${text(fault.heatwave.startDay)}`);
  document.getElementById("runNote").textContent = bits.join(" · ");
}
describeRun();

const francis = document.getElementById("francis");
function activeClock() {
  return transport === "v3" ? v3clock : clock;
}
function syncBar() {
  const current = activeClock();
  const scrub = document.getElementById("scrub");
  scrub.min = String(current.min);
  scrub.max = String(current.max);
  scrub.step = transport === "v3" ? "0.5" : "0.05";
  if (document.activeElement !== scrub) scrub.value = String(current.day);
  const dayRead = document.getElementById("dayRead");
  if (transport === "v3" && v3span) {
    dayRead.textContent = `Day ${current.day.toFixed(2)} / ${current.max.toFixed(1)} · ${v3span.count} days`;
    document.getElementById("runNote").textContent = `${v3span.scenario} seed ${v3span.seed} · onset ${text(v3span.onset)} · failure ${text(v3span.failure)}`;
  } else {
    dayRead.textContent = `Day ${current.day.toFixed(2)} / ${current.max.toFixed(0)}`;
    describeRun();
  }
  const midway = current.day > current.min + 0.05 && current.day < current.max - 0.05;
  document.getElementById("play").textContent = current.playing ? "Pause" : midway ? "Play" : "Replay";
}
document.getElementById("play").addEventListener("click", () => {
  const current = activeClock();
  const francisOpen = francis && francis.open;
  if (current.playing) {
    current.pause();
    if (francisOpen) clock.pause();
  } else if (current.day > current.min + 0.05 && current.day < current.max - 0.05) {
    current.play();
    if (francisOpen) clock.play();
  } else {
    current.restart();
    if (francisOpen) clock.restart();
  }
});
document.getElementById("reset").addEventListener("click", () => {
  activeClock().reset();
  if (francis && francis.open) clock.reset();
});
document.getElementById("speed").addEventListener("input", (event) => {
  v3clock.setSpeed(event.target.value);
  clock.setSpeed(event.target.value);
});
document.getElementById("scrub").addEventListener("input", (event) => {
  const current = activeClock();
  current.pause();
  current.setDay(Number(event.target.value));
});
const v1views = document.getElementById("v1views");
const v2views = document.getElementById("v2views");
const plantPick = document.getElementById("plantPick");
function applyPlant() {
  const v2 = plantPick.value === "v2";
  transport = v2 ? "v1" : "v3";
  v1views.hidden = v2;
  v2views.hidden = !v2;
  document.getElementById("runNote").hidden = v2;
  v3clock.pause();
  clock.pause();
  syncBar();
}
plantPick.addEventListener("change", applyPlant);
if (params.get("plant") === "v2") {
  plantPick.value = "v2";
  applyPlant();
}

faultSelect.addEventListener("change", () => {
  fault = scenario.faults.find((item) => item.id === faultSelect.value);
  physics.focusAsset(fault.targetAssetId);
  physics.setFault();
  syncBar();
});

function follow(source) {
  source.subscribe(() => {
    if (activeClock() === source) syncBar();
  });
}
follow(clock);
follow(v3clock);

window.addEventListener("keydown", (event) => {
  if (event.code !== "Space") return;
  if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
  event.preventDefault();
  const current = activeClock();
  if (current.playing) current.pause();
  else if (current.day > current.min + 0.05 && current.day < current.max - 0.05) current.play();
  else current.restart();
});
