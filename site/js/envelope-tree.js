import { sig3 } from "./format.js";

const DOMAIN = {
  mechanical: "#1f7a4d",
  fluid: "#1a6fa8",
  thermal: "#c45c26",
  electrical: "#8a6d12",
  chemical: "#6b3fa0",
};

export function mountNest(root, { peer } = {}) {
  root.classList.add("nest-root");
  root.innerHTML = `
    <p class="ex-note" data-notice>This is a made-up toy plant, not real plant data. The charts are for display only.</p>
    <div class="ex-bar">
      <div class="seg" role="group" aria-label="Hierarchy">
        <button type="button" class="btn" data-tree="designed" aria-pressed="true">Designed</button>
        <button type="button" class="btn" data-tree="discovered" aria-pressed="false">Discovered</button>
      </div>
      <div class="seg" role="group" aria-label="Days shown">
        <button type="button" class="btn" data-win="all" aria-pressed="false">All days</button>
        <button type="button" class="btn" data-win="fault" aria-pressed="true">Onset to failure</button>
      </div>
      <ul class="dom-legend">${Object.keys(DOMAIN).map((name) =>
        `<li><i style="background:${DOMAIN[name]}"></i>${name}</li>`
      ).join("")}</ul>
      ${peer ? `<a class="btn" href="${peer.href}">${peer.label}</a>` : ""}
    </div>
    <p class="ex-note" data-port></p>
    <div class="tree" data-tree-view></div>
    <p class="ex-note" data-chart-note>Select a node to see its calculus. Up to three nodes, including ones in different branches.</p>
    <div class="chart-row" data-charts></div>`;

  const treeEl = root.querySelector("[data-tree-view]");
  const chartsEl = root.querySelector("[data-charts]");
  const chartNote = root.querySelector("[data-chart-note]");
  const portNote = root.querySelector("[data-port]");
  const notice = root.querySelector("[data-notice]");

  let mode = "designed";
  let windowMode = "fault";
  const packs = {};
  let byId = {};
  let boundary = [];
  const expanded = new Set();
  const selected = [];
  const tsCache = new Map();
  let meta = null;
  let chartToken = 0;
  let lastDraw = null;

  root.addEventListener("click", (event) => {
    const treeBtn = event.target.closest("[data-tree]");
    if (treeBtn) { setMode(treeBtn.dataset.tree); return; }
    const winBtn = event.target.closest("[data-win]");
    if (winBtn) { setWindow(winBtn.dataset.win); return; }
  });
  treeEl.addEventListener("click", onTreeClick);
  const watcher = new ResizeObserver(() => {
    drawEdges();
    if (lastDraw) drawAll(lastDraw);
  });
  watcher.observe(treeEl);
  watcher.observe(chartsEl);

  async function setMode(next) {
    mode = next;
    expanded.clear();
    selected.length = 0;
    root.querySelectorAll("[data-tree]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.tree === mode));
    });
    await ensureTree();
    paintTree();
    paintCharts();
  }

  function setWindow(next) {
    windowMode = next;
    root.querySelectorAll("[data-win]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.win === windowMode));
    });
    paintCharts();
  }

  async function ensureTree() {
    if (packs[mode]) {
      byId = packs[mode].byId;
      boundary = packs[mode].boundary;
      return;
    }
    const file = mode === "designed" ? "data/v3/hierarchy.json" : "data/v3/hierarchy_discovered.json";
    const data = await fetch(file).then((r) => r.json());
    packs[mode] = {
      byId: Object.fromEntries(data.nodes.map((node) => [node.id, node])),
      boundary: data.plant_boundary || [],
      meta: data.meta || {},
    };
    byId = packs[mode].byId;
    boundary = packs[mode].boundary;
    if (data.meta && data.meta.made_up_plant) {
      notice.textContent = "This is a made-up toy plant, not real plant data. The charts are for display only.";
    }
  }

  function label(node) {
    if (node.kind === "plant") return node.name || "Plant";
    if (node.kind === "asset") return node.id;
    return node.id.split(".").pop();
  }

  function shortPort(entry) {
    const name = String(entry.name || "").replace(/\s*\([^)]*\)/g, "").trim();
    const words = name.split(/\s+/).filter(Boolean);
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
          const key = `${[id, far.other_node].sort().join("|")}|${port.domain}`;
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
      const entry = boundary.find((item) => item.port === port.dataset.port);
      if (entry) {
        portNote.textContent = `${entry.name}. ${entry.domain}, ${entry.direction}. ${sig3(entry.dc_power_into_plant_MW)} MW into the plant.`;
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
    treeEl.innerHTML = renderNode(byId.PLANT);
    requestAnimationFrame(() => requestAnimationFrame(drawEdges));
  }

  function renderNode(node) {
    const open = expanded.has(node.id);
    const on = selected.includes(node.id);
    const ports = node.kind === "plant" ? boundary.map((entry) => {
      const color = DOMAIN[entry.domain] || "#888";
      return `<button type="button" class="bport" data-port="${entry.port}" title="${entry.name}"><i style="background:${color}"></i><span>${shortPort(entry)}</span></button>`;
    }).join("") : "";
    const kids = open && node.children && node.children.length
      ? `<div class="nest"><div class="stem"></div><div class="kids" data-parent="${node.id}"><svg class="sibs" aria-hidden="true"></svg>${
        node.children.map((id) => renderNode(byId[id])).join("")
      }</div></div>`
      : "";
    return `<div class="enode" data-id="${node.id}"><div class="ecard">
      <button type="button" class="enode-btn" data-node="${node.id}" aria-pressed="${on}" aria-expanded="${open}" title="${node.name}"><b>${label(node)}</b></button>
      ${ports ? `<div class="bports">${ports}</div>` : ""}
    </div>${kids}</div>`;
  }

  function drawEdges() {
    treeEl.querySelectorAll(".kids").forEach((kids) => {
      const svg = kids.querySelector("svg.sibs");
      const rect = kids.getBoundingClientRect();
      if (!rect.width || !svg) return;
      svg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
      const parent = byId[kids.dataset.parent];
      const pos = {};
      kids.querySelectorAll(":scope > .enode").forEach((el) => {
        const box = el.querySelector(".enode-btn").getBoundingClientRect();
        pos[el.dataset.id] = {
          x: box.left - rect.left + box.width / 2,
          y: Math.max(6, box.top - rect.top - 4),
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
          lines.push(`<line x1="${(p.x + (-dy / len) * shift).toFixed(1)}" y1="${(p.y + (dx / len) * shift).toFixed(1)}" x2="${(q.x + (-dy / len) * shift).toFixed(1)}" y2="${(q.y + (dx / len) * shift).toFixed(1)}" stroke="${DOMAIN[edge.domain] || "#888"}" stroke-width="2.2" stroke-linecap="round"></line>`);
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
    if (!data.nodes[node.id]) return null;
    return { day: data.day, row: data.nodes[node.id], meta: data.meta };
  }

  function orderName(info, index) {
    const raw = info?.orders?.[index];
    if (!raw) return ["value", "rate", "acceleration", "jerk"][index];
    return String(raw).split(" (")[0];
  }

  function unitFor(info, key, index) {
    const text = String(info?.quantities?.[key] || "");
    const base = /\bMW\b/.test(text) && !/\bpu\b/.test(text) ? "MW" : (/\bpu\b/.test(text) ? "pu" : "");
    if (!base || index === 0) return base;
    const raw = String(info?.orders?.[index] || "");
    const power = raw.match(/per day\^(\d+)/);
    if (power) return `${base}/day^${power[1]}`;
    if (/per day/.test(raw)) return `${base}/day`;
    return base;
  }

  function indicesFor(days) {
    if (windowMode === "fault" && meta && meta.fault_onset_day != null && meta.first_failure && meta.first_failure.day != null) {
      const a = Number(meta.fault_onset_day);
      const b = Number(meta.first_failure.day);
      const idx = [];
      days.forEach((day, i) => { if (day >= Math.min(a, b) && day <= Math.max(a, b)) idx.push(i); });
      if (idx.length > 2) return idx;
    }
    return days.map((_, i) => i);
  }

  async function paintCharts() {
    const token = ++chartToken;
    if (!selected.length) {
      chartsEl.innerHTML = "";
      lastDraw = null;
      chartNote.textContent = "Select a node to see its calculus. Up to three nodes, including ones in different branches.";
      return;
    }
    chartNote.textContent = "Reading the run.";
    const blocks = [];
    for (const id of selected) {
      const series = await loadSeries(byId[id]);
      if (token !== chartToken) return;
      blocks.push({ node: byId[id], series });
    }
    const info = meta;
    const run = info ? `${info.scenario}, seed ${info.seed}` : "this run";
    const fail = info && info.first_failure ? info.first_failure : null;
    const onset = info && info.fault_onset_day != null ? info.fault_onset_day : null;
    if (info) notice.textContent = `This is a made-up toy plant, not real plant data. Charts show ${run}, and they are for display only.`;
    const where = windowMode === "fault" && onset != null && fail
      ? `Days ${sig3(onset)} to ${sig3(fail.day)}.`
      : "The y-scale leaves out the first and last day, where the smoothing window runs off the series.";
    chartNote.textContent = `Dashed line: fault onset. Solid line: first failure${fail ? `, ${fail.asset}` : ""}. ${where}`;
    chartsEl.innerHTML = blocks.map(({ node, series }) => {
      if (!series) {
        return `<article class="calc-card"><h2>${label(node)}</h2><p>No time series for this node in the discovered tree.</p></article>`;
      }
      const panels = (key) => [0, 1, 2, 3].map((order) =>
        `<figure><figcaption>${orderName(info, order)} <span>${unitFor(info, key, order)}</span></figcaption><canvas data-series="${key}" data-order="${order}" data-node="${node.id}"></canvas></figure>`
      ).join("");
      return `<article class="calc-card"><h2 title="${node.name}">${label(node)}</h2>
        <h3>σ <span>${unitFor(info, "sigma", 0)}</span></h3><div class="orders">${panels("sigma")}</div>
        <h3>P <span>${unitFor(info, "boundary_power", 0)}</span></h3><div class="orders">${panels("boundary_power")}</div></article>`;
    }).join("");
    lastDraw = { blocks, info, token };
    requestAnimationFrame(() => drawAll(lastDraw));
  }

  function drawAll(job) {
    if (!job || job.token !== chartToken) return;
    const info = job.info;
    for (const { node, series } of job.blocks) {
      if (!series) continue;
      const idx = indicesFor(series.day);
      const onset = info && info.fault_onset_day != null ? nearest(series.day, info.fault_onset_day) : -1;
      const fail = info && info.first_failure ? nearest(series.day, info.first_failure.day) : -1;
      for (const key of ["sigma", "boundary_power"]) {
        [0, 1, 2, 3].forEach((order) => {
          const canvas = chartsEl.querySelector(`canvas[data-node="${node.id}"][data-series="${key}"][data-order="${order}"]`);
          if (!canvas) return;
          drawSeries(canvas, series.row[key][order], series.day, idx, { onset, fail });
        });
      }
    }
  }

  function shortNum(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "";
    const ax = Math.abs(n);
    if (ax >= 100) return String(Math.round(n));
    if (ax >= 10) return String(Math.round(n * 10) / 10);
    if (ax >= 1) return String(Math.round(n * 100) / 100);
    return sig3(n);
  }

  function dayTicks(d0, d1) {
    const start = Math.ceil(Number(d0));
    const end = Math.floor(Number(d1));
    if (end <= start) return [Math.round(d0), Math.round(d1)];
    const count = end - start >= 90 ? 4 : 3;
    const ticks = [];
    for (let k = 0; k < count; k++) ticks.push(Math.round(start + ((end - start) * k) / (count - 1)));
    return [...new Set(ticks)];
  }

  function nearest(days, day) {
    let best = 0;
    let gap = Infinity;
    days.forEach((value, index) => {
      const d = Math.abs(Number(value) - Number(day));
      if (d < gap) { gap = d; best = index; }
    });
    return best;
  }

  function drawSeries(canvas, series, days, idx, marks) {
    const width = canvas.clientWidth || 220;
    const height = 120;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const padL = 44;
    const padR = 12;
    const padT = 10;
    const padB = 22;
    const plotW = Math.max(40, width - padL - padR);
    const d0 = Number(days[idx[0]]);
    const d1 = Number(days[idx[idx.length - 1]]);
    const span = d1 - d0 || 1;
    const xDay = (day) => padL + ((Number(day) - d0) / span) * plotW;
    const scaleIdx = idx.filter((i) => i !== 0 && i !== series.length - 1);
    const used = (scaleIdx.length > 2 ? scaleIdx : idx).map((i) => Number(series[i]));
    let lo = Math.min(...used);
    let hi = Math.max(...used);
    if (!Number.isFinite(lo) || lo === hi) { lo = (Number.isFinite(lo) ? lo : 0) - 1; hi = (Number.isFinite(hi) ? hi : 0) + 1; }
    const slack = (hi - lo) * 0.1;
    lo -= slack;
    hi += slack;
    const yAt = (v) => padT + (1 - (Number(v) - lo) / (hi - lo)) * (height - padT - padB);
    ctx.beginPath();
    ctx.strokeStyle = "#0f5c56";
    ctx.lineWidth = 1.6;
    idx.forEach((i, n) => {
      const x = xDay(days[i]);
      const y = yAt(series[i]);
      if (n === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    const xIndex = (index) => (idx.includes(index) ? xDay(days[index]) : null);
    markLine(ctx, xIndex(marks.onset), padT, height - padB, "#8a6d12", true);
    markLine(ctx, xIndex(marks.fail), padT, height - padB, "#9f1239", false);
    ctx.fillStyle = "#8a8276";
    ctx.font = "11px ui-monospace, monospace";
    const yTicks = [hi, (hi + lo) / 2, lo];
    yTicks.forEach((value) => {
      const y = yAt(value);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(shortNum(value), 2, Math.min(height - padB - 4, Math.max(padT + 4, y)));
    });
    ctx.textBaseline = "alphabetic";
    dayTicks(d0, d1).forEach((day, n, all) => {
      const x = xDay(day);
      ctx.textAlign = n === 0 ? "left" : n === all.length - 1 ? "right" : "center";
      const labelX = n === 0 ? padL : n === all.length - 1 ? padL + plotW : x;
      ctx.fillText(String(day), labelX, height - 4);
    });
    ctx.textAlign = "left";
  }

  function markLine(ctx, x, top, bottom, color, dashed) {
    if (x == null) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    if (dashed) ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.restore();
  }

  ensureTree().then(() => {
    paintTree();
    paintCharts();
  });
}
