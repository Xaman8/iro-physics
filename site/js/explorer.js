const DOMAIN = {
  mechanical: "#1f7a4d",
  fluid: "#1a6fa8",
  thermal: "#c45c26",
  electrical: "#8a6d12",
  chemical: "#6b3fa0",
};
const ORDERS = ["0", "1", "2", "3"];

const treeEl = document.getElementById("tree");
const chartsEl = document.getElementById("charts");
const chartNote = document.getElementById("chartNote");
const portNote = document.getElementById("portNote");
const legend = document.getElementById("legend");

legend.innerHTML = Object.keys(DOMAIN).map((name) =>
  `<li><i style="background:${DOMAIN[name]}"></i>${name}</li>`
).join("");

let mode = "designed";
const packs = {};
let byId = {};
let boundary = [];
const expanded = new Set();
const selected = [];
const tsCache = new Map();
let meta = null;
let chartToken = 0;

document.getElementById("treeDesigned").addEventListener("click", () => setMode("designed"));
document.getElementById("treeDiscovered").addEventListener("click", () => setMode("discovered"));
treeEl.addEventListener("click", onTreeClick);
new ResizeObserver(() => drawEdges()).observe(treeEl);

async function setMode(next) {
  mode = next;
  expanded.clear();
  selected.length = 0;
  document.getElementById("treeDesigned").setAttribute("aria-pressed", String(mode === "designed"));
  document.getElementById("treeDiscovered").setAttribute("aria-pressed", String(mode === "discovered"));
  await ensureTree();
  paintTree();
  paintCharts();
}

async function ensureTree() {
  if (packs[mode]) {
    byId = packs[mode].byId;
    boundary = packs[mode].boundary;
    return;
  }
  const file = mode === "designed" ? "hierarchy.json" : "hierarchy_discovered.json";
  const data = await fetch(`data/v3/${file}`).then((r) => r.json());
  const index = Object.fromEntries(data.nodes.map((node) => [node.id, node]));
  packs[mode] = { byId: index, boundary: data.plant_boundary || [] };
  byId = index;
  boundary = packs[mode].boundary;
}

function label(node) {
  if (node.kind === "plant") return "Plant";
  if (node.kind === "asset") return node.id;
  return node.id.split(".").pop();
}

function shortPort(entry) {
  const name = entry.name.replace(/\s*\([^)]*\)/g, "").trim();
  const words = name.split(/\s+/);
  return words.length <= 2 ? name : words.slice(0, 2).join(" ");
}

function siblingEdges(parent) {
  const kids = new Set(parent.children || []);
  const seen = new Set();
  const edges = [];
  for (const id of parent.children || []) {
    const node = byId[id];
    for (const port of node.boundary_ports || []) {
      for (const far of port.coupled_to || []) {
        if (!kids.has(far.other_node)) continue;
        const pair = [id, far.other_node].sort().join("|");
        const key = `${pair}|${port.domain}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ a: id, b: far.other_node, domain: port.domain });
      }
    }
  }
  return edges;
}

function onTreeClick(event) {
  const port = event.target.closest("[data-port]");
  if (port) {
    event.stopPropagation();
    const entry = boundary.find((item) => item.port === port.dataset.port);
    if (entry) {
      const flow = entry.dc_power_into_plant_MW;
      portNote.textContent = `${entry.name}. ${entry.domain}, ${entry.direction}. ${flow} MW into the plant.`;
    }
    return;
  }
  const card = event.target.closest("[data-node]");
  if (!card) return;
  const id = card.dataset.node;
  const node = byId[id];
  const at = selected.indexOf(id);
  if (at >= 0) {
    selected.splice(at, 1);
    expanded.delete(id);
  } else {
    selected.push(id);
    if (selected.length > 3) selected.shift();
    if (node.children && node.children.length) expanded.add(id);
  }
  paintTree();
  paintCharts();
}

function paintTree() {
  const plant = byId.PLANT;
  treeEl.innerHTML = renderNode(plant);
  requestAnimationFrame(() => requestAnimationFrame(drawEdges));
}

function renderNode(node) {
  const open = expanded.has(node.id);
  const on = selected.includes(node.id);
  const ports = node.kind === "plant" ? boundary.map((entry) => {
    const color = DOMAIN[entry.domain] || "#888";
    return `<button type="button" class="bport" data-port="${entry.port}" title="${entry.name}">
      <i style="background:${color}"></i><span>${shortPort(entry)}</span></button>`;
  }).join("") : "";
  const kids = open && node.children && node.children.length
    ? `<div class="nest"><div class="stem"></div><div class="kids" data-parent="${node.id}">
        <svg class="sibs" aria-hidden="true"></svg>
        ${node.children.map((id) => renderNode(byId[id])).join("")}
      </div></div>`
    : "";
  return `<div class="enode" data-id="${node.id}">
    <div class="ecard">
      <button type="button" class="enode-btn" data-node="${node.id}" aria-pressed="${on}" aria-expanded="${open}" title="${node.name}">
        <b>${label(node)}</b>
      </button>
      ${ports ? `<div class="bports">${ports}</div>` : ""}
    </div>
    ${kids}
  </div>`;
}

function drawEdges() {
  treeEl.querySelectorAll(".kids").forEach((kids) => {
    const svg = kids.querySelector("svg.sibs");
    const rect = kids.getBoundingClientRect();
    if (!rect.width) return;
    svg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
    svg.setAttribute("width", rect.width);
    svg.setAttribute("height", rect.height);
    const parent = byId[kids.dataset.parent];
    const pos = {};
    kids.querySelectorAll(":scope > .enode").forEach((el) => {
      const button = el.querySelector(".enode-btn");
      const box = button.getBoundingClientRect();
      pos[el.dataset.id] = {
        x: box.left - rect.left + box.width / 2,
        y: box.top - rect.top - 4,
      };
    });
    const groups = new Map();
    for (const edge of siblingEdges(parent)) {
      const key = [edge.a, edge.b].sort().join("|");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(edge);
    }
    const lines = [];
    for (const list of groups.values()) {
      list.forEach((edge, index) => {
        const p = pos[edge.a];
        const q = pos[edge.b];
        if (!p || !q) return;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        const shift = (index - (list.length - 1) / 2) * 4;
        const ox = (-dy / len) * shift;
        const oy = (dx / len) * shift;
        lines.push(`<line x1="${(p.x + ox).toFixed(1)}" y1="${(p.y + oy).toFixed(1)}" x2="${(q.x + ox).toFixed(1)}" y2="${(q.y + oy).toFixed(1)}" stroke="${DOMAIN[edge.domain]}" stroke-width="2.2" stroke-linecap="round"></line>`);
      });
    }
    svg.innerHTML = lines.join("");
  });
}

async function loadSeries(node) {
  const file = node.kind === "asset" ? "ts_assets.json" : node.timeseries_file;
  if (!file) return null;
  if (!tsCache.has(file)) tsCache.set(file, fetch(`data/v3/${file}`).then((r) => r.json()));
  const data = await tsCache.get(file);
  meta = data.meta;
  return data.nodes[node.id] ? { day: data.day, row: data.nodes[node.id], meta: data.meta } : null;
}

async function paintCharts() {
  const token = ++chartToken;
  if (!selected.length) {
    chartsEl.innerHTML = "";
    chartNote.textContent = "Select a node to see its calculus. Up to three nodes, including ones in different branches.";
    return;
  }
  chartNote.textContent = "Reading the run.";
  const blocks = [];
  for (const id of selected) {
    const node = byId[id];
    const series = await loadSeries(node);
    if (token !== chartToken) return;
    blocks.push({ node, series });
  }
  const fail = meta && meta.first_failure ? meta.first_failure : null;
  chartNote.textContent = fail
    ? `σ is entropy generation, pu. P is boundary power, MW. The panels are value, rate, acceleration and jerk. The line is the first failure, ${fail.asset}, day ${fail.day}.`
    : "σ is entropy generation, pu. P is boundary power, MW. The panels are value, rate, acceleration and jerk.";
  chartsEl.innerHTML = blocks.map(({ node, series }) => {
    if (!series) {
      return `<article class="calc-card"><h2>${label(node)}</h2><p>No time series for this node in the discovered tree.</p></article>`;
    }
    const panels = (key) => ORDERS.map((order) =>
      `<figure><figcaption>${order}</figcaption><canvas data-series="${key}" data-order="${order}" data-node="${node.id}"></canvas></figure>`
    ).join("");
    return `<article class="calc-card"><h2 title="${node.name}">${label(node)}</h2>
      <h3>σ</h3><div class="orders">${panels("sigma")}</div>
      <h3>P</h3><div class="orders">${panels("boundary_power")}</div></article>`;
  }).join("");
  requestAnimationFrame(() => {
    if (token !== chartToken) return;
    for (const { node, series } of blocks) {
      if (!series) continue;
      const mark = fail ? nearestIndex(series.day, fail.day) : -1;
      for (const key of ["sigma", "boundary_power"]) {
        ORDERS.forEach((order, index) => {
          const canvas = chartsEl.querySelector(`canvas[data-node="${node.id}"][data-series="${key}"][data-order="${order}"]`);
          if (canvas) drawSeries(canvas, series.row[key][index], mark);
        });
      }
    }
  });
}

function nearestIndex(days, day) {
  let best = 0;
  let gap = Infinity;
  days.forEach((value, index) => {
    const d = Math.abs(value - day);
    if (d < gap) { gap = d; best = index; }
  });
  return best;
}

function drawSeries(canvas, series, mark) {
  const width = canvas.clientWidth || 120;
  const height = 64;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  let lo = Infinity;
  let hi = -Infinity;
  for (const value of series) {
    if (value < lo) lo = value;
    if (value > hi) hi = value;
  }
  if (!Number.isFinite(lo) || lo === hi) { lo = (lo || 0) - 1; hi = (hi || 0) + 1; }
  const pad = 4;
  const xAt = (i) => pad + (i / (series.length - 1)) * (width - pad * 2);
  const yAt = (v) => pad + (1 - (v - lo) / (hi - lo)) * (height - pad * 2);
  ctx.beginPath();
  ctx.strokeStyle = "#0f5c56";
  ctx.lineWidth = 1.4;
  series.forEach((value, index) => {
    const x = xAt(index);
    const y = yAt(value);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  if (mark >= 0) {
    const x = xAt(mark);
    ctx.strokeStyle = "#9f1239";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, pad);
    ctx.lineTo(x, height - pad);
    ctx.stroke();
  }
}

ensureTree().then(() => {
  paintTree();
  paintCharts();
});
