import { Clock } from "./clock.js";
import { mountPhysics } from "./physics-view.js";
import { mountEnvelope } from "./envelope-view.js";
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
const envelope = mountEnvelope(document.getElementById("envelope"), {
  plant, scenario, getFault: () => fault, clock,
  initialMode: params.get("view") === "reduced" ? "reduced" : "grouped",
});
physics.focusAsset(params.get("asset") || fault.targetAssetId);
envelope.setFault();
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

document.getElementById("play").addEventListener("click", () => {
  if (clock.playing) clock.pause();
  else if (clock.day > 0.05 && clock.day < clock.max - 0.05) clock.play();
  else clock.restart();
});
document.getElementById("reset").addEventListener("click", () => clock.reset());
document.getElementById("speed").addEventListener("input", (event) => clock.setSpeed(event.target.value));
document.getElementById("scrub").addEventListener("input", (event) => {
  clock.pause();
  clock.setDay(Number(event.target.value));
});
const v1views = document.getElementById("v1views");
const v2views = document.getElementById("v2views");
const plantPick = document.getElementById("plantPick");
function applyPlant() {
  const v2 = plantPick.value === "v2";
  v1views.hidden = v2;
  v2views.hidden = !v2;
  document.getElementById("runNote").hidden = v2;
  if (v2) clock.pause();
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
  envelope.setFault();
  describeRun();
});

clock.subscribe(() => {
  const scrub = document.getElementById("scrub");
  if (document.activeElement !== scrub) scrub.value = String(clock.day);
  document.getElementById("dayRead").textContent = `Day ${clock.day.toFixed(2)} / ${clock.max.toFixed(0)}`;
  const midway = clock.day > 0.05 && clock.day < clock.max - 0.05;
  document.getElementById("play").textContent = clock.playing ? "Pause" : midway ? "Play" : "Replay";
});

window.addEventListener("keydown", (event) => {
  if (event.code !== "Space") return;
  if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
  event.preventDefault();
  if (clock.playing) clock.pause();
  else clock.play();
});
