import { sig3 } from "./format.js";

const PALETTE = {
  Supply: { fill: "#f4e7c4", stroke: "#8a6a22", ink: "#6b5010" },
  "Pump trains": { fill: "#d7efe2", stroke: "#1f7a4d", ink: "#145c38" },
  "Drives and oil": { fill: "#f8dfd0", stroke: "#c45c26", ink: "#8a3d14" },
  "Heat rejection": { fill: "#d7e4f4", stroke: "#1d5f8a", ink: "#143e5c" },
  "Gas train": { fill: "#eadcf4", stroke: "#6d3d86", ink: "#4c2860" },
};

const BOX = {
  Supply: { x: 24, y: 20, w: 220, h: 148 },
  "Pump trains": { x: 268, y: 20, w: 400, h: 248 },
  "Heat rejection": { x: 692, y: 20, w: 250, h: 188 },
  "Drives and oil": { x: 24, y: 300, w: 520, h: 188 },
  "Gas train": { x: 568, y: 300, w: 374, h: 188 },
};

const W = 966;
const H = 560;

export function mountV2(graphHost, detailHost, plant) {
  const envById = Object.fromEntries(plant.envelopes.map((env) => [env.id, env]));
  let selected = plant.envelopes[0].id;

  graphHost.innerHTML = `
    <div class="v2-note">${plant.note} Click an envelope.</div>
    <div id="v2svg"></div>
    <div class="v2-legend" id="v2legend"></div>`;
  const stage = graphHost.querySelector("#v2svg");
  graphHost.querySelector("#v2legend").innerHTML = plant.envelopes.map((env) => {
    const tone = PALETTE[env.name];
    return `<span><i style="background:${tone.fill};box-shadow:inset 0 0 0 1.5px ${tone.stroke}"></i>${env.name}</span>`;
  }).join("");

  function slots(env) {
    const box = BOX[env.name];
    const assets = plant.assets.filter((a) => a.envelopeId === env.id);
    const n = assets.length;
    const cols = n <= 3 ? n : n <= 4 ? 2 : n <= 8 ? 4 : 5;
    const rows = Math.ceil(n / cols);
    const top = 34;
    const cw = (box.w - 16) / cols;
    const ch = (box.h - top - 10) / rows;
    return assets.map((asset, i) => ({
      asset,
      x: box.x + 8 + (i % cols) * cw + cw / 2,
      y: box.y + top + Math.floor(i / cols) * ch + ch / 2,
    }));
  }

  function edgePoint(from, to) {
    const cx = from.x + from.w / 2;
    const cy = from.y + from.h / 2;
    const tx = to.x + to.w / 2;
    const ty = to.y + to.h / 2;
    const dx = tx - cx;
    const dy = ty - cy;
    const sx = dx === 0 ? Infinity : (from.w / 2) / Math.abs(dx);
    const sy = dy === 0 ? Infinity : (from.h / 2) / Math.abs(dy);
    const t = Math.min(sx, sy);
    return { x: cx + dx * t, y: cy + dy * t };
  }

  function draw() {
    const boxes = plant.envelopes.map((env) => ({ env, box: BOX[env.name], tone: PALETTE[env.name] }));
    const regions = boxes.map(({ env, box, tone }) => {
      const on = env.id === selected;
      return `<g data-env="${env.id}" style="cursor:pointer">
        <rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="16" fill="${tone.fill}" stroke="${tone.stroke}" stroke-width="${on ? 2.4 : 1.2}"></rect>
        <text x="${box.x + 14}" y="${box.y + 22}" fill="${tone.ink}" font-size="13" font-weight="650">${env.name}</text>
      </g>`;
    }).join("");
    const nodes = boxes.flatMap(({ env }) => slots(env).map(({ asset, x, y }) => `
      <g data-env="${env.id}" style="cursor:pointer">
        <text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-size="12" fill="#1c1915">${asset.id}</text>
      </g>`)).join("");

    const bundles = new Map();
    for (const coupling of plant.couplings) {
      if (!coupling.boundary) continue;
      const key = [coupling.sourceEnvelopeId, coupling.targetEnvelopeId].sort().join("|");
      if (!bundles.has(key)) bundles.set(key, { ids: [], power: 0, parasitic: true, a: coupling.sourceEnvelopeId, b: coupling.targetEnvelopeId });
      const bundle = bundles.get(key);
      bundle.ids.push(coupling.id);
      bundle.power += Math.abs(Number(coupling.powerMw) || 0);
      if (coupling.intent !== "parasitic") bundle.parasitic = false;
    }
    const maxPower = Math.max(0.001, ...[...bundles.values()].map((b) => b.power));
    const lines = [...bundles.values()].map((bundle) => {
      const from = BOX[envById[bundle.a].name];
      const to = BOX[envById[bundle.b].name];
      const p1 = edgePoint(from, to);
      const p2 = edgePoint(to, from);
      const width = (1.25 + 5.5 * Math.sqrt(bundle.power / maxPower)).toFixed(2);
      const on = bundle.a === selected || bundle.b === selected;
      const dash = bundle.parasitic ? 'stroke-dasharray="5 4"' : "";
      return `<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="#9a3412" stroke-width="${width}" stroke-linecap="round" opacity="${on ? 0.9 : 0.55}" ${dash}><title>${bundle.ids.join(", ")} · ${sig3(bundle.power)} MW</title></line>`;
    }).join("");

    stage.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="v2 discovered envelopes">${lines}${regions}${nodes}</svg>`;
    stage.querySelectorAll("[data-env]").forEach((node) => {
      node.addEventListener("click", () => {
        selected = node.dataset.env;
        draw();
        show();
      });
    });
  }

  function show() {
    const env = envById[selected];
    const assets = plant.assets.filter((a) => a.envelopeId === env.id);
    const ports = plant.boundaryPorts.filter((p) => p.envelopeId === env.id);
    const links = plant.couplings.filter((c) => c.boundary && (c.sourceEnvelopeId === env.id || c.targetEnvelopeId === env.id));
    detailHost.innerHTML = `
      <p class="kicker">Discovered envelope</p>
      <h2>${env.name}</h2>
      <p>${assets.length} assets. ${ports.length} boundary-port ends on the couplings that leave this envelope.</p>
      <h3>Assets</h3>
      <div class="chip-row">${assets.map((a) => `<span class="chip" title="${a.name}">${a.id}</span>`).join("")}</div>
      <h3>Boundary ports</h3>
      <div class="chip-row">${ports.map((p) => `<span class="chip">${p.portId}</span>`).join("")}</div>
      <h3>Cross-envelope couplings</h3>
      <ul>${links.map((c) => `<li><span class="chip">${c.id}</span> ${sig3(c.powerMw)} MW${c.intent === "parasitic" ? " · parasitic" : ""}</li>`).join("")}</ul>`;
  }

  draw();
  show();
}
