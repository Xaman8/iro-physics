import { sig3 } from "./format.js?v=20261120";

const DOMAIN = {
  mechanical: "#1f7a4d",
  fluid: "#1a6fa8",
  thermal: "#c45c26",
  electrical: "#8a6d12",
  chemical: "#6b3fa0",
};

const CHILD_COLOR = ["#0f5c56", "#1a6fa8", "#c45c26", "#6b3fa0", "#8a6d12", "#9f1239", "#1f6b3a"];

const BAND_FILL = {
  NOMINAL: "rgba(31, 122, 77, 0.08)",
  "PRE-FAULT": "rgba(138, 109, 18, 0.10)",
  "TRADITIONAL P–F": "rgba(196, 92, 38, 0.11)",
  FAILED: "rgba(159, 18, 57, 0.10)",
};

function lighten(hex, amount) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  if (!Number.isFinite(n)) return hex;
  const mix = (channel) => Math.round(channel + (255 - channel) * amount);
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

const ORDER_NAME = ["value", "rate", "acceleration", "jerk"];

function domainLabel(name) {
  return name === "chemical" ? "chemical (v3 port not physical)" : name;
}

function baseUnit(text) {
  const match = String(text || "").match(/kW\/K|\bMW\b|\bkW\b|\bpu\b/);
  return match ? match[0] : "";
}

function orderUnit(info, key, index) {
  const base = baseUnit(info?.quantities?.[key]);
  if (!base) return "";
  if (index === 0) return base;
  const raw = String(info?.orders?.[index] || "");
  const power = raw.match(/per day\^(\d+)/);
  if (power) return `${base}/day^${power[1]}`;
  if (/per day/.test(raw)) return `${base}/day`;
  return base;
}

function orderTitle(info, index) {
  const raw = info?.orders?.[index];
  if (!raw) return ORDER_NAME[index];
  return String(raw).split(" (")[0];
}

function loadStepDay(info) {
  const raw = info && (info.load_step_day ?? info.load_step?.start_day ?? info.load_step?.day);
  const n = Number(raw);
  return Number.isFinite(n) ? n : 87.7;
}

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.floor(sorted.length / 2)];
}

function plantSigmaCaption(info, series) {
  const days = series.day || [];
  const sigma = (series.row?.sigma?.[0] || []).map(Number);
  const step = loadStepDay(info);
  const fail = Number(info?.first_failure?.day);
  const before = [];
  const after = [];
  days.forEach((day, index) => {
    const t = Number(day);
    if (t >= 4 && t < step) before.push(sigma[index]);
    if (t >= step + 4 && (!Number.isFinite(fail) || t <= fail)) after.push(sigma[index]);
  });
  const beforeLevel = median(before);
  const afterLevel = median(after);
  const hours = String(info?.smoothing || "").match(/last (\d+) hourly/);
  const windowHours = hours ? hours[1] : "49";
  const beforeText = beforeLevel == null ? "32" : sig3(beforeLevel);
  const afterText = afterLevel == null ? "26.5" : sig3(afterLevel);
  return `Plant entropy generation counts losses inside the assets (14.7 kW/K at the design point) plus losses on the couplings between them (another 15.1 kW/K). In this run's slightly perturbed plant that is about ${beforeText} kW/K until a scripted 10% load drop on day ${sig3(step)} brings it to about ${afterText}. The first two days read high because the ${windowHours}-hour average has not filled yet.`;
}

function lagNote(info) {
  const lag = info?.lag_hours;
  if (!lag) return "";
  const bits = [0, 1, 2, 3].map((index) => {
    const hours = lag[index] ?? lag[String(index)];
    if (hours == null || hours === "") return "";
    return `${orderTitle(info, index)} ${Number(hours)} h`;
  }).filter(Boolean);
  return bits.length ? `Causal trailing windows; stated lag ${bits.join(", ")}.` : "";
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function shortPort(name) {
  const clean = String(name || "").replace(/\s*\([^)]*\)/g, "").trim();
  const words = clean.split(/\s+/).filter(Boolean);
  const text = words.length <= 2 ? clean : words.slice(0, 2).join(" ");
  return text.length > 18 ? `${text.slice(0, 16)}…` : text;
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

export function mountBoard(root, { clock, onSpan } = {}) {
  root.classList.add("board-root");
  root.innerHTML = `
    <div class="board">
      <button type="button" class="nav-toggle" data-nav-toggle aria-expanded="false">Envelopes</button>
      <div class="nav-backdrop" data-nav-close hidden></div>
      <aside class="board-nav" data-nav>
        <div class="seg" role="group" aria-label="Hierarchy">
          <button type="button" class="btn" data-tree="designed" aria-pressed="true">Designed</button>
          <button type="button" class="btn" data-tree="discovered" aria-pressed="false">Discovered</button>
        </div>
        <div class="nav-tree" data-nav-tree></div>
      </aside>
      <div class="board-main">
        <nav class="crumbs" data-crumbs aria-label="Envelope path"></nav>
        <div class="board-top">
          <div class="port-row" data-ports></div>
          <div class="diagram" data-diagram></div>
        </div>
        <div class="filters" data-filters></div>
        <p class="now-read" data-now></p>
        <div class="axis-labels"><span data-axis-left></span><span class="axis-right-group"><span data-axis-cond></span><span data-axis-right></span></span></div>
        <div class="chart-stage">
          <canvas data-chart></canvas>
          <div class="readout" data-readout hidden></div>
        </div>
        <ul class="trace-legend" data-legend></ul>
        <p class="pf-note" data-pf-note hidden></p>
        <details class="board-notes">
          <summary>Notes</summary>
          <p class="ex-note" data-notice>This is a made-up toy plant, not real plant data. The charts are for display only.</p>
          <p class="ex-note" data-caveat>In this v1 toy the limit is entropic endurance; the study now keeps entropy generation as a balance check and tracks damage per mechanism (RQ10).</p>
          <p class="ex-note" data-chart-note></p>
          <p class="ex-note port-note" data-port></p>
          <p class="scale-note" data-scale-note></p>
          <p class="ex-note">Chemical is labelled chemical (v3 port not physical): the v3 chemical port is not a physical species balance.</p>
          <p class="sigma-check">σ is shown as an energy-balance check, not a damage measure.</p>
          <p class="plant-sigma" data-plant-caption hidden></p>
        </details>
      </div>
    </div>`;

  const treeEl = root.querySelector("[data-nav-tree]");
  const crumbsEl = root.querySelector("[data-crumbs]");
  const portsEl = root.querySelector("[data-ports]");
  const portNote = root.querySelector("[data-port]");
  const diagramEl = root.querySelector("[data-diagram]");
  const filtersEl = root.querySelector("[data-filters]");
  const chartNote = root.querySelector("[data-chart-note]");
  const axisLeft = root.querySelector("[data-axis-left]");
  const axisRight = root.querySelector("[data-axis-right]");
  const axisCond = root.querySelector("[data-axis-cond]");
  const scaleNote = root.querySelector("[data-scale-note]");
  const canvas = root.querySelector("[data-chart]");
  const pfNote = root.querySelector("[data-pf-note]");
  const readout = root.querySelector("[data-readout]");
  const legendEl = root.querySelector("[data-legend]");
  const plantCaption = root.querySelector("[data-plant-caption]");
  const nowEl = root.querySelector("[data-now]");
  const notice = root.querySelector("[data-notice]");
  const nav = root.querySelector("[data-nav]");
  const navToggle = root.querySelector("[data-nav-toggle]");
  const backdrop = root.querySelector("[data-nav-close]");

  let mode = "designed";
  let windowMode = "fault";
  let parentId = "PLANT";
  let highlight = null;
  const expanded = new Set(["PLANT"]);
  const shown = new Set();
  const measures = new Set(["sigma", "boundary_power"]);
  const orders = new Set([0]);
  const domainsOn = new Set(Object.keys(DOMAIN));
  let showPf = true;
  const packs = {};
  const tsCache = new Map();
  let couplings = null;
  let meta = null;
  let chartToken = 0;
  let plot = null;
  let lastSample = -1;

  function cursorDay() {
    return clock ? Number(clock.day) : null;
  }

  function sampleSeries(series, key, day) {
    if (!series || day == null) return null;
    const row = series.row?.[key]?.[0];
    if (!row) return null;
    const value = Number(row[nearest(series.day, day)]);
    return Number.isFinite(value) ? value : null;
  }

  function liveValue(id, key) {
    const day = cursorDay();
    if (day == null || !plot) return null;
    const block = plot.blocks.find((item) => item.child.id === id);
    return sampleSeries(block?.series, key, day);
  }

  function renderNow() {
    const day = cursorDay();
    if (day == null) { nowEl.textContent = ""; return; }
    let extra = "";
    if (highlight && plot) {
      const block = plot.blocks.find((item) => item.child.id === highlight);
      if (block?.series) {
        const sigma = sampleSeries(block.series, "sigma", day);
        const power = sampleSeries(block.series, "boundary_power", day);
        extra = ` · ${labelOf(block.child)} σ ${sig3(sigma)} ${orderUnit(plot.info, "sigma", 0)} · P ${sig3(power)} ${orderUnit(plot.info, "boundary_power", 0)}`;
      }
    }
    nowEl.textContent = `Day ${sig3(day)}${extra}`;
  }

  function publishSpan() {
    if (!onSpan || !meta) return;
    const days = plot?.blocks?.find((item) => item.series)?.series.day;
    if (!days?.length) return;
    const onset = meta.fault_onset_day;
    const failure = meta.first_failure?.day;
    const fault = windowMode === "fault" && onset != null && failure != null;
    onSpan({
      min: fault ? Number(onset) : Number(days[0]),
      max: fault ? Number(failure) : Number(days[days.length - 1]),
      count: days.length,
      scenario: meta.scenario,
      seed: meta.seed,
      onset: onset != null ? Number(onset) : null,
      failure: failure != null ? Number(failure) : null,
    });
  }

  function pack() { return packs[mode]; }
  function byId() { return pack().byId; }
  function node(id) { return byId()[id]; }

  function envelopeKids(id) {
    return (node(id).children || []).filter((child) => node(child).kind !== "asset");
  }

  function ancestors(id) {
    const path = [];
    let current = node(id);
    while (current) {
      path.unshift(current);
      current = current.parent ? node(current.parent) : null;
    }
    return path;
  }

  function setNavOpen(open) {
    nav.classList.toggle("open", open);
    backdrop.hidden = !open;
    navToggle.setAttribute("aria-expanded", String(open));
  }

  navToggle.addEventListener("click", () => setNavOpen(!nav.classList.contains("open")));
  backdrop.addEventListener("click", () => setNavOpen(false));

  root.addEventListener("click", (event) => {
    const treeBtn = event.target.closest("[data-tree]");
    if (treeBtn && treeBtn.closest("[data-nav]")) {
      setMode(treeBtn.dataset.tree);
      return;
    }
    const winBtn = event.target.closest("[data-win]");
    if (winBtn) { setWindow(winBtn.dataset.win); return; }
    const childChip = event.target.closest("[data-child-filter]");
    if (childChip) { toggleShown(childChip.dataset.childFilter); return; }
    const measureBtn = event.target.closest("[data-measure]");
    if (measureBtn) { toggleSet(measures, measureBtn.dataset.measure); return; }
    const orderBtn = event.target.closest("[data-order]");
    if (orderBtn) { toggleSet(orders, Number(orderBtn.dataset.order)); return; }
    const domainBtn = event.target.closest("[data-domain]");
    if (domainBtn) { toggleSet(domainsOn, domainBtn.dataset.domain); return; }
    const pfBtn = event.target.closest("[data-pf]");
    if (pfBtn && pfBtn.hasAttribute("data-pf")) { setPf(!showPf); return; }
    const crumb = event.target.closest("[data-crumb]");
    if (crumb) { selectParent(crumb.dataset.crumb); }
  });

  treeEl.addEventListener("click", (event) => {
    const twist = event.target.closest("[data-twist]");
    if (twist) {
      const id = twist.dataset.twist;
      if (expanded.has(id)) expanded.delete(id);
      else expanded.add(id);
      renderTree();
      return;
    }
    const pick = event.target.closest("[data-pick]");
    if (pick) {
      selectParent(pick.dataset.pick);
      if (window.matchMedia("(max-width: 800px)").matches) setNavOpen(false);
    }
  });

  let childClick = null;
  diagramEl.addEventListener("click", (event) => {
    const box = event.target.closest("[data-child]");
    if (!box || event.detail > 1) return;
    const id = box.dataset.child;
    clearTimeout(childClick);
    childClick = setTimeout(() => {
      highlight = highlight === id ? null : id;
      renderDiagram();
      draw();
      renderLegend();
      renderNow();
    }, 220);
  });
  diagramEl.addEventListener("dblclick", (event) => {
    const box = event.target.closest("[data-child]");
    clearTimeout(childClick);
    if (!box) return;
    const child = node(box.dataset.child);
    if (!child || child.kind === "asset") return;
    selectParent(child.id);
  });
  portsEl.addEventListener("click", (event) => {
    const port = event.target.closest("[data-port-detail]");
    portNote.textContent = port ? port.dataset.portDetail : "";
  });

  canvas.addEventListener("mousemove", onHover);
  canvas.addEventListener("mouseleave", () => { readout.hidden = true; });
  legendEl.addEventListener("click", (event) => {
    const item = event.target.closest("[data-legend-child]");
    if (!item) return;
    highlight = highlight === item.dataset.legendChild ? null : item.dataset.legendChild;
    renderDiagram();
    draw();
    renderLegend();
    renderNow();
  });

  const watcher = new ResizeObserver(() => { if (plot) draw(); });
  watcher.observe(canvas);

  function setPf(on) {
    showPf = on;
    pfNote.hidden = !on;
    if (axisCond) axisCond.hidden = !on;
    renderFilters();
    renderLegend();
    requestAnimationFrame(() => { if (plot) draw(); });
  }

  function toggleSet(set, value) {
    if (set.has(value)) set.delete(value);
    else set.add(value);
    if (set.size === 0) set.add(value);
    renderFilters();
    paint();
  }

  function toggleShown(id) {
    if (shown.has(id)) shown.delete(id);
    else shown.add(id);
    if (highlight === id && !shown.has(id)) highlight = null;
    renderFilters();
    renderDiagram();
    paint();
  }

  function selectParent(id) {
    parentId = id;
    highlight = null;
    ancestors(id).forEach((item) => { if (item.kind !== "asset") expanded.add(item.id); });
    const kids = node(id).children || [];
    shown.clear();
    kids.forEach((child) => shown.add(child));
    portNote.textContent = "";
    renderTree();
    renderCrumbs();
    renderPorts();
    renderDiagram();
    renderFilters();
    paint();
  }

  async function setMode(next) {
    mode = next;
    root.querySelectorAll("[data-nav] [data-tree]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.tree === mode));
    });
    expanded.clear();
    expanded.add("PLANT");
    await ensurePack();
    selectParent("PLANT");
  }

  function setWindow(next) {
    windowMode = next;
    renderFilters();
    paint();
  }

  async function ensurePack() {
    if (packs[mode]) return;
    const file = mode === "designed" ? "data/v3/hierarchy.json" : "data/v3/hierarchy_discovered.json";
    const data = await fetch(file).then((response) => response.json());
    packs[mode] = {
      byId: Object.fromEntries(data.nodes.map((item) => [item.id, item])),
      boundary: data.plant_boundary || [],
    };
    if (data.meta && data.meta.made_up_plant) {
      notice.textContent = "This is a made-up toy plant, not real plant data. The charts are for display only.";
    }
  }

  async function ensureCouplings() {
    if (!couplings) couplings = await fetch("data/v3/couplings.json").then((response) => response.json());
    return couplings;
  }

  async function loadSeries(item) {
    const file = item.kind === "asset" ? "ts_assets.json" : item.timeseries_file;
    if (!file) return null;
    if (!tsCache.has(file)) tsCache.set(file, fetch(`data/v3/${file}`).then((response) => response.json()));
    const data = await tsCache.get(file);
    meta = data.meta;
    if (!data.nodes[item.id]) return null;
    return { day: data.day, row: data.nodes[item.id], meta: data.meta };
  }

  function renderTree() {
    treeEl.innerHTML = `<ul class="nav-list">${renderBranch("PLANT")}</ul>`;
  }

  function renderBranch(id) {
    const item = node(id);
    const kids = envelopeKids(id);
    const open = expanded.has(id) && kids.length;
    const current = id === parentId;
    const twist = kids.length
      ? `<button type="button" class="twist" data-twist="${esc(id)}" aria-expanded="${open ? "true" : "false"}" aria-label="${open ? "Collapse" : "Expand"} ${esc(labelOf(item))}">${open ? "▾" : "▸"}</button>`
      : `<span class="twist leaf"></span>`;
    const nested = open ? `<ul class="nav-list">${kids.map((child) => renderBranch(child)).join("")}</ul>` : "";
    return `<li>${twist}<button type="button" class="nav-pick" data-pick="${esc(id)}" aria-current="${current ? "true" : "false"}" title="${esc(item.name)}">${esc(labelOf(item))}</button>${nested}</li>`;
  }

  function labelOf(item) {
    if (item.kind === "plant") return "Plant";
    return item.id;
  }

  function renderCrumbs() {
    crumbsEl.innerHTML = ancestors(parentId).map((item, index, all) => {
      const last = index === all.length - 1;
      return `<button type="button" data-crumb="${esc(item.id)}" ${last ? "aria-current=\"page\"" : ""}>${esc(labelOf(item))}</button>`;
    }).join("<span>/</span>");
  }

  function portsOf(item) {
    if (item.kind === "plant") {
      return pack().boundary.map((entry) => ({
        name: shortPort(entry.name),
        domain: entry.domain,
        detail: `${entry.name}. ${entry.domain}, ${entry.direction}. ${sig3(entry.dc_power_into_plant_MW)} MW into the plant.`,
      }));
    }
    return (item.boundary_ports || []).map((entry) => ({
      name: shortPort(entry.port || entry.name),
      domain: entry.domain,
      detail: `${entry.port || entry.name}. ${entry.domain}.`,
    }));
  }

  function renderPorts() {
    const ports = portsOf(node(parentId)).filter((entry) => domainsOn.has(entry.domain));
    portsEl.innerHTML = ports.map((entry) =>
      `<button type="button" class="port-dot" data-port-detail="${esc(entry.detail)}" title="${esc(entry.detail)}" aria-label="${esc(entry.detail)}"><i style="background:${DOMAIN[entry.domain] || "#888"}"></i></button>`
    ).join("");
  }

  function edgesFor(item) {
    const listed = couplings && couplings.sibling_edges && couplings.sibling_edges[item.id];
    if (Array.isArray(listed) && listed.length) {
      return listed.map((edge) => ({ a: edge.a, b: edge.b, domain: edge.domain }));
    }
    const kids = new Set(item.children || []);
    const seen = new Set();
    const edges = [];
    for (const id of item.children || []) {
      const child = node(id);
      for (const port of child.boundary_ports || []) {
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

  function renderDiagram() {
    const parent = node(parentId);
    const children = (parent.children || []).filter((id) => shown.has(id)).map((id) => node(id));
    const edges = edgesFor(parent).filter((edge) => domainsOn.has(edge.domain) && shown.has(edge.a) && shown.has(edge.b));
    if (!children.length) {
      diagramEl.innerHTML = `<p class="ex-note">No children are selected.</p>`;
      return;
    }
    const width = 860;
    const height = 196;
    const boxW = Math.min(210, Math.max(128, (width - 40) / children.length - 28));
    const boxH = 72;
    const span = width - 24 - boxW;
    const boxes = {};
    children.forEach((child, index) => {
      const x = 12 + (children.length === 1 ? (width - boxW) / 2 : (span * index) / Math.max(1, children.length - 1));
      boxes[child.id] = { x, y: 112, w: boxW, h: boxH, child, index };
    });
    const groups = new Map();
    edges.forEach((edge) => {
      const key = [edge.a, edge.b].sort().join("|");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(edge);
    });
    const lines = [];
    for (const list of groups.values()) {
      list.forEach((edge, index) => {
        const a = boxes[edge.a];
        const b = boxes[edge.b];
        if (!a || !b) return;
        const x1 = a.x + a.w / 2;
        const y1 = a.y;
        const x2 = b.x + b.w / 2;
        const y2 = b.y;
        const shift = (index - (list.length - 1) / 2) * 7;
        const mid = (x1 + x2) / 2 + shift;
        const lift = 46 + Math.min(36, Math.abs(x2 - x1) * 0.04);
        const pa = liveValue(edge.a, "boundary_power");
        const pb = liveValue(edge.b, "boundary_power");
        const flow = pa != null && pb != null ? (Math.abs(pa) + Math.abs(pb)) / 2 : null;
        const width = flow == null ? 2.2 : 1.2 + 4.5 * (flow / Math.max(0.001, ...children.map((child) => Math.abs(liveValue(child.id, "boundary_power") || 0))));
        lines.push(`<path d="M ${x1.toFixed(1)} ${y1} Q ${mid.toFixed(1)} ${lift.toFixed(1)} ${x2.toFixed(1)} ${y2}" fill="none" stroke="${DOMAIN[edge.domain] || "#888"}" stroke-width="${width.toFixed(2)}" stroke-linecap="round"><title>${esc(edge.domain)}</title></path>`);
      });
    }
    const sigmaNow = children.map((child) => liveValue(child.id, "sigma")).filter((value) => value != null && value > 0);
    const maxSigma = Math.max(0.001, ...sigmaNow);
    const rects = children.map((child) => {
      const box = boxes[child.id];
      const on = highlight === child.id;
      const sigma = liveValue(child.id, "sigma");
      const level = sigma != null && sigma > 0 ? Math.max(0, Math.min(1, sigma / maxSigma)) : 0;
      const fill = level ? `rgba(15,92,86,${(0.1 + 0.55 * level).toFixed(3)})` : (on ? "#e5f2f0" : "#fff");
      return `<g data-child="${esc(child.id)}" tabindex="0" role="button" aria-pressed="${on ? "true" : "false"}">
        <rect x="${box.x.toFixed(1)}" y="${box.y}" width="${box.w}" height="${box.h}" rx="10" fill="${fill}" stroke="${on ? "#0f5c56" : "#e0d8cb"}" stroke-width="${on ? 2.4 : 1}"></rect>
        <text x="${(box.x + box.w / 2).toFixed(1)}" y="${box.y + 46}" text-anchor="middle" font-size="18" font-weight="700" fill="#1c1915">${esc(labelOf(child))}</text>
        <title>${esc(child.name)}</title>
      </g>`;
    }).join("");
    diagramEl.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Children of ${esc(labelOf(parent))}">${lines}${rects}</svg>`;
  }

  function renderFilters() {
    const parent = node(parentId);
    const kids = parent.children || [];
    const childChips = kids.map((id) =>
      `<button type="button" class="chip-btn" data-child-filter="${esc(id)}" aria-pressed="${shown.has(id) ? "true" : "false"}">${esc(labelOf(node(id)))}</button>`
    ).join("");
    const measureChips = [
      ["sigma", "σ"],
      ["boundary_power", "P"],
    ].map(([key, name]) =>
      `<button type="button" class="chip-btn" data-measure="${key}" aria-pressed="${measures.has(key) ? "true" : "false"}">${name}</button>`
    ).join("");
    const orderChips = [0, 1, 2, 3].map((index) =>
      `<button type="button" class="chip-btn" data-order="${index}" aria-pressed="${orders.has(index) ? "true" : "false"}">${orderTitle(meta, index)}</button>`
    ).join("");
    const domainChips = Object.keys(DOMAIN).map((name) =>
      `<button type="button" class="chip-btn" data-domain="${name}" aria-pressed="${domainsOn.has(name) ? "true" : "false"}" title="${esc(domainLabel(name))}"><i style="background:${DOMAIN[name]}"></i>${esc(name)}</button>`
    ).join("");
    const windows = `
      <button type="button" class="chip-btn" data-win="fault" aria-pressed="${windowMode === "fault" ? "true" : "false"}">Onset to failure</button>
      <button type="button" class="chip-btn" data-win="all" aria-pressed="${windowMode === "all" ? "true" : "false"}">All days</button>`;
    filtersEl.innerHTML = `
      <div class="filter-row"><span>Children</span><div>${childChips}</div><span>Days</span><div>${windows}</div></div>
      <div class="filter-row"><span>Show</span><div>${measureChips}${orderChips}<button type="button" class="chip-btn" data-pf aria-pressed="${showPf ? "true" : "false"}">P–F</button></div><span>Domain</span><div>${domainChips}</div></div>`;
  }

  function indicesFor(days) {
    if (windowMode === "fault" && meta && meta.fault_onset_day != null && meta.first_failure && meta.first_failure.day != null) {
      const a = Number(meta.fault_onset_day);
      const b = Number(meta.first_failure.day);
      const idx = [];
      days.forEach((day, index) => {
        if (day >= Math.min(a, b) && day <= Math.max(a, b)) idx.push(index);
      });
      if (idx.length > 2) return idx;
    }
    return days.map((_, index) => index);
  }

  async function paint() {
    const token = ++chartToken;
    const parent = node(parentId);
    const children = (parent.children || []).filter((id) => shown.has(id)).map((id) => node(id));
    const blocks = [];
    for (const child of children) {
      const series = await loadSeries(child);
      if (token !== chartToken) return;
      blocks.push({ child, series });
    }
    let plantSeries = null;
    if (parent.kind === "plant") {
      plantSeries = await loadSeries(parent);
      if (token !== chartToken) return;
    }
    const info = meta;
    if (info) notice.textContent = `This is a made-up toy plant, not real plant data. Charts show ${info.scenario}, seed ${info.seed}, and they are for display only.`;
    const step = loadStepDay(info);
    const fail = info && info.first_failure ? info.first_failure : null;
    const onset = info && info.fault_onset_day != null ? info.fault_onset_day : null;
    chartNote.textContent = (showPf ? [
      "Shaded bands are nominal before onset, pre-fault until the first predictor alarm, traditional P–F until failure, and failed after that.",
      "Dashed line: first predictor alarm.",
      `Faint line: load step, day ${sig3(step)}.`,
    ] : [
      "Dashed line: fault onset.",
      `Faint line: load step, day ${sig3(step)}.`,
      fail
        ? `Solid line: first failure, from the toy model's provisional failure rule (${fail.asset}, day ${sig3(fail.day)}).`
        : "Solid line: first failure, from the toy model's provisional failure rule.",
    ]).concat([
      lagNote(info),
      windowMode === "fault" && onset != null && fail ? `Days ${sig3(onset)} to ${sig3(fail.day)}.` : "",
    ]).filter(Boolean).join(" ");
    if (parent.kind === "plant" && plantSeries) {
      plantCaption.hidden = false;
      plantCaption.textContent = plantSigmaCaption(info, plantSeries);
    } else {
      plantCaption.hidden = true;
      plantCaption.textContent = "";
    }
    const multi = orders.size > 1;
    const sigmaUnit = orders.size === 1 ? orderUnit(info, "sigma", [...orders][0]) : "";
    const powerUnit = orders.size === 1 ? orderUnit(info, "boundary_power", [...orders][0]) : "";
    axisLeft.textContent = measures.has("sigma") ? (multi ? "σ normalised" : `σ ${sigmaUnit}`) : "";
    axisRight.textContent = measures.has("boundary_power") ? (multi ? "P normalised" : `P ${powerUnit}`) : "";
    axisCond.hidden = !showPf;
    axisCond.textContent = showPf ? "Condition" : "";
    if (multi) {
      const bits = [...orders].sort((a, b) => a - b).map((index) => {
        const parts = [];
        if (measures.has("sigma")) parts.push(`σ ${orderUnit(info, "sigma", index)}`);
        if (measures.has("boundary_power")) parts.push(`P ${orderUnit(info, "boundary_power", index)}`);
        return `${orderTitle(info, index)} ${parts.join(", ")}`;
      });
      scaleNote.textContent = `Each order is scaled to its own range so the units are not mixed. Hover shows the measured value. ${bits.join(". ")}.`;
    } else {
      scaleNote.textContent = "";
    }
    plot = { blocks, info, multi, token };
    renderLegend();
    renderNow();
    publishSpan();
    requestAnimationFrame(() => draw());
  }

  function colorFor(id) {
    const kids = node(parentId).children || [];
    const index = Math.max(0, kids.indexOf(id));
    return CHILD_COLOR[index % CHILD_COLOR.length];
  }

  function traces() {
    if (!plot) return [];
    const out = [];
    for (const block of plot.blocks) {
      if (!block.series) continue;
      for (const measure of ["sigma", "boundary_power"]) {
        if (!measures.has(measure)) continue;
        for (const order of [...orders].sort((a, b) => a - b)) {
          const row = block.series.row[measure];
          if (!row || !row[order]) continue;
          out.push({
            id: block.child.id,
            name: labelOf(block.child),
            measure,
            order,
            color: colorFor(block.child.id),
            days: block.series.day,
            values: row[order].map(Number),
          });
        }
      }
    }
    return out;
  }

  function renderLegend() {
    const seen = new Map();
    traces().forEach((trace) => {
      if (!seen.has(trace.id)) seen.set(trace.id, { color: trace.color, name: trace.name, sigma: false, power: false, condition: false });
      if (trace.measure === "sigma") seen.get(trace.id).sigma = true;
      if (trace.measure === "boundary_power") seen.get(trace.id).power = true;
    });
    if (showPf) {
      conditionCurves().forEach((curve) => {
        if (curve.missing) return;
        if (!seen.has(curve.id)) seen.set(curve.id, { color: curve.color, name: curve.name, sigma: false, power: false, condition: true });
        else seen.get(curve.id).condition = true;
      });
    }
    legendEl.innerHTML = [...seen.entries()].map(([id, item]) => {
      const bits = [];
      if (item.sigma) bits.push("σ solid");
      if (item.power) bits.push("P dashed");
      if (item.condition) bits.push("C light");
      const on = highlight === id;
      return `<li><button type="button" data-legend-child="${esc(id)}" aria-pressed="${on ? "true" : "false"}"><i style="background:${item.color}"></i>${esc(item.name)} <span>${bits.join(" · ")}</span></button></li>`;
    }).join("");
  }

  function draw() {
    if (!plot || plot.token !== chartToken) return;
    const width = canvas.clientWidth || 320;
    const height = canvas.clientHeight || 240;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const list = traces();
    const padL = 54;
    const condGutter = showPf ? 36 : 0;
    const powerGutter = measures.has("boundary_power") ? 48 : 0;
    const padR = Math.max(14, condGutter + powerGutter);
    const padT = showPf ? 18 : 22;
    const padB = 24;
    const plotW = Math.max(40, width - padL - padR);
    const plotH = Math.max(40, height - padT - padB);
    if (!list.length) return;
    const info = plot.info;
    const days = list[0].days;
    const idx = indicesFor(days);
    let d0 = Number(days[idx[0]]);
    let d1 = Number(days[idx[idx.length - 1]]);
    if (windowMode === "fault" && info && info.fault_onset_day != null && info.first_failure) {
      d0 = Math.min(d0, Number(info.fault_onset_day));
      d1 = Math.max(d1, Number(info.first_failure.day));
    }
    const span = d1 - d0 || 1;
    const xDay = (day) => padL + ((Number(day) - d0) / span) * plotW;
    const prepared = list.map((trace) => {
      const aligned = days.map((_, index) => {
        if (trace.days === days) return trace.values[index];
        return trace.values[nearest(trace.days, days[index])];
      });
      return { ...trace, aligned };
    });
    const groups = new Map();
    prepared.forEach((trace) => {
      const key = `${trace.measure}|${trace.order}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(trace);
    });
    const scaleOf = new Map();
    for (const [key, group] of groups) {
      let lo = Infinity;
      let hi = -Infinity;
      group.forEach((trace) => {
        idx.forEach((index) => {
          if (index === 0 || index === days.length - 1) return;
          const value = trace.aligned[index];
          if (!Number.isFinite(value)) return;
          if (value < lo) lo = value;
          if (value > hi) hi = value;
        });
      });
      if (!Number.isFinite(lo) || lo === hi) {
        lo = Number.isFinite(lo) ? lo - 1 : 0;
        hi = Number.isFinite(hi) ? hi + 1 : 1;
      }
      const slack = (hi - lo) * 0.08;
      scaleOf.set(key, { lo: lo >= 0 ? 0 : lo - slack, hi: hi + slack });
    }
    const multi = orders.size > 1;
    const yLeft = (trace, value) => {
      const scale = scaleOf.get(`${trace.measure}|${trace.order}`);
      const t = (value - scale.lo) / (scale.hi - scale.lo);
      return padT + (1 - t) * plotH;
    };
    const yShared = (measure) => {
      let lo = Infinity;
      let hi = -Infinity;
      prepared.filter((trace) => trace.measure === measure).forEach((trace) => {
        const scale = scaleOf.get(`${trace.measure}|${trace.order}`);
        if (scale.lo < lo) lo = scale.lo;
        if (scale.hi > hi) hi = scale.hi;
      });
      return { lo, hi };
    };
    const sigmaScale = multi ? { lo: 0, hi: 1 } : (measures.has("sigma") ? yShared("sigma") : null);
    const powerScale = multi ? { lo: 0, hi: 1 } : (measures.has("boundary_power") ? yShared("boundary_power") : null);
    const yAt = (trace, value) => {
      if (multi) return yLeft(trace, value);
      const scale = trace.measure === "sigma" ? sigmaScale : powerScale;
      const t = (value - scale.lo) / (scale.hi - scale.lo);
      return padT + (1 - t) * plotH;
    };
    const yCond = (condition) => padT + (1 - Math.max(0, Math.min(1, condition))) * plotH;
    const reveal = idx.filter((index) => !clock || Number(days[index]) <= Number(clock.day) + 1e-6);
    const cursor = clock ? Number(clock.day) : d1;
    const phases = phaseDays(info);
    if (showPf) {
      phaseBands(info, d0, d1).forEach((band) => {
        ctx.fillStyle = BAND_FILL[band.label] || "transparent";
        ctx.fillRect(xDay(band.t0), padT, Math.max(0, xDay(band.t1) - xDay(band.t0)), plotH);
      });
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(padL, padT - 3, plotW, plotH + 6);
    ctx.clip();
    prepared.forEach((trace) => {
      const dim = highlight && highlight !== trace.id;
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = trace.color;
      ctx.globalAlpha = dim ? 0.15 : 1;
      ctx.lineWidth = trace.order === 0 ? 2 : trace.order === 1 ? 1.5 : 1.15;
      if (trace.measure === "boundary_power") ctx.setLineDash(trace.order === 0 ? [6, 3] : [2, 2]);
      reveal.forEach((index, n) => {
        const value = trace.aligned[index];
        if (!Number.isFinite(value)) return;
        const x = xDay(days[index]);
        const y = yAt(trace, value);
        if (n === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
    });
    const curves = showPf ? conditionCurves().filter((curve) => !curve.missing) : [];
    curves.forEach((curve) => {
      const dim = highlight && highlight !== curve.id;
      const pts = [];
      reveal.forEach((index) => {
        const raw = curve.days === days ? curve.values[index] : curve.values[nearest(curve.days, days[index])];
        if (!Number.isFinite(raw)) return;
        pts.push([xDay(days[index]), yCond(raw)]);
      });
      if (pts.length < 2) return;
      const stroke = () => {
        ctx.beginPath();
        pts.forEach(([x, y], n) => (n ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      };
      ctx.save();
      ctx.globalAlpha = dim ? 0.18 : 1;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.lineWidth = 5.5;
      ctx.strokeStyle = "rgba(255, 252, 247, 0.94)";
      stroke();
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = lighten(curve.color, 0.34);
      stroke();
      ctx.restore();
    });
    ctx.restore();
    const guide = (day, color, dash, widthOfLine) => {
      if (day < d0 || day > d1) return;
      const x = xDay(day);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = widthOfLine;
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
      ctx.restore();
    };
    if (showPf) {
      if (phases.firstP != null) guide(phases.firstP, "rgba(196, 92, 38, 0.95)", [5, 4], 1.35);
      guide(loadStepDay(info), "rgba(28, 25, 21, 0.35)", [1, 3], 1);
    } else {
      if (info && info.fault_onset_day != null) guide(Number(info.fault_onset_day), "#8a6d12", [3, 3], 1);
      guide(loadStepDay(info), "rgba(28, 25, 21, 0.45)", [1, 3], 1);
      if (info && info.first_failure) guide(Number(info.first_failure.day), "#9f1239", [], 1);
    }
    if (clock && cursor >= d0 && cursor <= d1) {
      const x = xDay(cursor);
      ctx.save();
      ctx.strokeStyle = "#0f5c56";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#0f5c56";
      ctx.font = "11px ui-monospace, monospace";
      ctx.textBaseline = "top";
      const atRight = x > padL + plotW - 46;
      ctx.textAlign = atRight ? "right" : "left";
      ctx.fillText(sig3(cursor), atRight ? x - 4 : x + 4, padT + 3);
    }
    if (!showPf) {
      const placed = [];
      const oldMarks = [
        info && info.fault_onset_day != null ? { day: Number(info.fault_onset_day), label: "onset", color: "#8a6d12" } : null,
        { day: loadStepDay(info), label: "load", color: "rgba(28,25,21,0.55)" },
        info && info.first_failure ? { day: Number(info.first_failure.day), label: "failure", color: "#9f1239" } : null,
      ].filter((mark) => mark && mark.day >= d0 && mark.day <= d1);
      oldMarks.forEach((mark) => {
        const x = xDay(mark.day);
        ctx.fillStyle = mark.color;
        ctx.font = "10px ui-monospace, monospace";
        ctx.textBaseline = "top";
        const widthOf = ctx.measureText(mark.label).width;
        const roomRight = width - x - 6;
        const labelX = roomRight >= widthOf ? x + 4 : x - 5;
        ctx.textAlign = roomRight >= widthOf ? "left" : "right";
        let row = 0;
        while (placed.some((item) => item.row === row && Math.abs(item.x - labelX) < (item.w + widthOf) / 2 + 6)) row += 1;
        placed.push({ row, x: labelX, w: widthOf });
        ctx.fillText(mark.label, labelX, 1 + row * 11);
      });
    } else {
      drawBandLabels(ctx, phaseBands(info, d0, d1), xDay);
    }
    ctx.font = "11px ui-monospace, monospace";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#8a8276";
    ctx.textAlign = "right";
    if (sigmaScale) [sigmaScale.hi, (sigmaScale.hi + sigmaScale.lo) / 2, sigmaScale.lo].forEach((value) => {
      const y = padT + (1 - (value - sigmaScale.lo) / (sigmaScale.hi - sigmaScale.lo)) * plotH;
      ctx.fillText(multi ? value.toFixed(1) : sig3(value), padL - 6, y);
    });
    if (showPf) {
      ctx.fillStyle = "#6d5e4e";
      ctx.textAlign = "right";
      [1, 0.5, 0].forEach((value) => {
        const y = yCond(value);
        ctx.fillText(value === 0.5 ? "0.5" : String(value), padL + plotW + condGutter - 4, y);
      });
    }
    ctx.fillStyle = "#8a8276";
    ctx.textAlign = "left";
    if (powerScale) [powerScale.hi, (powerScale.hi + powerScale.lo) / 2, powerScale.lo].forEach((value) => {
      const y = padT + (1 - (value - powerScale.lo) / (powerScale.hi - powerScale.lo)) * plotH;
      ctx.fillText(multi ? value.toFixed(1) : sig3(value), padL + plotW + condGutter + 6, y);
    });
    const ticks = dayTicks(d0, d1);
    const events = showPf ? [
      phases.onset != null ? { day: phases.onset, label: "onset", color: "#8a6d12" } : null,
      phases.firstP != null ? { day: phases.firstP, label: "P", color: "#c45c26" } : null,
      phases.fail != null ? { day: phases.fail, label: "F", color: "#9f1239" } : null,
    ].filter((mark) => mark && mark.day >= d0 && mark.day <= d1) : [];
    ctx.textBaseline = "alphabetic";
    ctx.font = "11px ui-monospace, monospace";
    ticks.forEach((day, index) => {
      const x = xDay(day);
      if (events.some((mark) => Math.abs(xDay(mark.day) - x) < 20)) return;
      ctx.fillStyle = "#8a8276";
      ctx.textAlign = index === 0 ? "left" : index === ticks.length - 1 ? "right" : "center";
      ctx.fillText(String(day), index === 0 ? padL : index === ticks.length - 1 ? padL + plotW : x, height - 5);
    });
    events.forEach((mark) => {
      const x = xDay(mark.day);
      const atLeft = x - padL < 26;
      const atRight = padL + plotW - x < 18;
      ctx.fillStyle = mark.color;
      ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = atLeft ? "left" : atRight ? "right" : "center";
      ctx.fillText(mark.label, atLeft ? padL : atRight ? padL + plotW : x, height - 5);
    });
    if (showPf) drawPredictorMarks(ctx, { info, curves, days, reveal, xDay, yCond, d0, d1, cursor, padL, padT, plotW, plotH });
    const shownCurves = showPf ? conditionCurves() : [];
    pfNote.hidden = !showPf;
    if (showPf) pfNote.textContent = pfCaption(info, shownCurves);
    plot.frame = { days, idx, d0, d1, xDay, yAt, yCond, prepared, padL, padR, padT, plotW, plotH, ticks };
    plot.pf = showPf ? { d0, d1, xDay, yCond, padL, plotW, curves: shownCurves } : null;
  }

  function phaseDays(info) {
    const onset = Number(info?.fault_onset_day);
    const fail = Number(info?.first_failure?.day);
    const alarms = predictorMarks(info);
    const firstP = alarms.length ? alarms[0].alarm : null;
    return {
      onset: Number.isFinite(onset) ? onset : null,
      firstP: Number.isFinite(firstP) ? firstP : null,
      fail: Number.isFinite(fail) ? fail : null,
    };
  }

  function phaseBands(info, d0, d1) {
    const { onset, firstP, fail } = phaseDays(info);
    const labelAt = (day) => {
      const t = day + 1e-3;
      if (fail != null && t >= fail) return "FAILED";
      if (firstP != null && t >= firstP && (fail == null || t < fail)) return "TRADITIONAL P–F";
      if (onset != null && t >= onset && (firstP == null || t < firstP)) return "PRE-FAULT";
      return "NOMINAL";
    };
    const cuts = [d0];
    [onset, firstP, fail].forEach((day) => {
      if (day != null && day > d0 + 0.05 && day < d1 - 0.05) cuts.push(day);
    });
    cuts.push(d1);
    cuts.sort((a, b) => a - b);
    const bands = [];
    for (let i = 0; i < cuts.length - 1; i++) {
      if (cuts[i + 1] - cuts[i] < 0.05) continue;
      bands.push({ t0: cuts[i], t1: cuts[i + 1], label: labelAt(cuts[i]) });
    }
    return bands;
  }

  function drawBandLabels(ctx, bands, xDay) {
    ctx.font = "600 10px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#5f594e";
    const placed = [];
    const hits = (left, right) => placed.some((item) => right > item.left - 6 && left < item.right + 6);
    bands.forEach((band) => {
      if (!band.label) return;
      const x0 = xDay(band.t0);
      const x1 = xDay(band.t1);
      const mid = (x0 + x1) / 2;
      const span = x1 - x0;
      let text = band.label;
      let widthOf = ctx.measureText(text).width;
      if (widthOf + 8 > span && band.label === "TRADITIONAL P–F") {
        text = "P–F";
        widthOf = ctx.measureText(text).width;
      }
      if (widthOf + 6 > span) return;
      const left = mid - widthOf / 2;
      const right = mid + widthOf / 2;
      if (hits(left, right)) return;
      placed.push({ left, right });
      ctx.fillText(text, mid, 2);
    });
  }

  function drawPredictorMarks(ctx, frame) {
    const { info, curves, days, reveal, xDay, yCond, d0, d1, cursor, padL, padT, plotW, plotH } = frame;
    const usable = curves.filter((curve) => !highlight || highlight === curve.id);
    let lead = null;
    if (highlight) lead = usable.find((curve) => curve.id === highlight) || null;
    if (!lead && usable.length) {
      const lastOf = (curve) => {
        const index = reveal.length ? reveal[reveal.length - 1] : 0;
        const value = curve.days === days ? curve.values[index] : curve.values[nearest(curve.days, days[index])];
        return Number.isFinite(value) ? value : 1;
      };
      lead = usable.slice().sort((a, b) => lastOf(a) - lastOf(b))[0];
    }
    const yOnLead = (day) => {
      if (!lead) return yCond(1);
      const value = lead.values[nearest(lead.days, day)];
      return yCond(Number.isFinite(value) ? value : 1);
    };
    const placed = [];
    const overlaps = (left, top, w, h) => placed.some((box) => left < box.l + box.w + 5 && left + w > box.l - 5 && top < box.t + box.h + 3 && top + h > box.t - 3);
    predictorMarks(info).forEach((mark) => {
      if (mark.alarm < d0 || mark.alarm > d1 || mark.alarm > cursor + 1e-6) return;
      const x = xDay(mark.alarm);
      const y = yOnLead(mark.alarm);
      ctx.save();
      ctx.fillStyle = "#1c1915";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillStyle = "#1c1915";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      const text = mark.label;
      const w = ctx.measureText(text).width;
      const h = 12;
      const clampLeft = (left) => Math.max(padL, Math.min(left, padL + plotW - w));
      const candidates = [y - 16, y + 8, y - 30, y + 22, y + 36].map((top) => ({ l: clampLeft(x - w / 2), t: Math.max(padT + 1, top) }));
      candidates.push({ l: clampLeft(x + 8), t: Math.max(padT + 1, y - 16) });
      candidates.push({ l: clampLeft(x - w - 8), t: Math.max(padT + 1, y - 16) });
      const spot = candidates.find((box) => box.t + h < padT + plotH - 4 && !overlaps(box.l, box.t, w, h)) || candidates[0];
      placed.push({ l: spot.l, t: spot.t, w, h });
      ctx.fillText(text, spot.l, spot.t);
    });
  }

  function damageValues(series) {
    const raw = series?.row?.damage;
    if (raw == null) return null;
    const seq = Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : raw;
    if (!Array.isArray(seq)) return null;
    return seq.map((value) => (value == null || value === "" ? null : Number(value)));
  }

  function conditionCurves() {
    if (!plot) return [];
    return plot.blocks.filter((block) => block.series).map((block) => {
      const damage = damageValues(block.series);
      return {
        id: block.child.id,
        name: labelOf(block.child),
        color: colorFor(block.child.id),
        days: block.series.day,
        missing: damage == null,
        values: damage ? damage.map((value) => (value == null ? null : 1 - value)) : null,
      };
    });
  }

  function predictorMarks(info) {
    const alarms = info?.predictor_alarms_this_run;
    const fail = Number(info?.first_failure?.day);
    if (!alarms || !Number.isFinite(fail)) return [];
    const singles = Object.entries(alarms).map(([name, row]) => {
      const alarm = Number(row?.alarm);
      if (!Number.isFinite(alarm)) return null;
      return {
        name,
        short: name.replace(/^REDUCED_/, ""),
        alarm,
        interval: fail - alarm,
      };
    }).filter(Boolean).sort((a, b) => a.alarm - b.alarm);
    const groups = [];
    singles.forEach((mark) => {
      const last = groups[groups.length - 1];
      if (last && Math.abs(last.alarm - mark.alarm) < 1e-6) last.parts.push(mark);
      else groups.push({ alarm: mark.alarm, parts: [mark] });
    });
    return groups.map((group) => ({
      alarm: group.alarm,
      parts: group.parts,
      label: `${group.parts.map((part) => part.short).join(", ")} ${sig3(group.alarm)}`,
    }));
  }

  function pfCaption(info, curves) {
    if (!info) return "";
    const missing = curves.filter((curve) => curve.missing).map((curve) => curve.name);
    const absent = missing.length === 1
      ? ` ${missing[0]} takes no damage in this run.`
      : missing.length
        ? ` ${missing.join(", ")} take no damage in this run.`
        : "";
    return `Condition is 1 minus the simulator's damage, ground truth the sensors cannot see.${absent} Each P is when that predictor alarmed in this ${info.scenario} run, seed ${info.seed}, not a detection threshold.`;
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

  function onHover(event) {
    if (!plot || !plot.frame) { readout.hidden = true; return; }
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const frame = plot.frame;
    if (x < frame.padL || x > frame.padL + frame.plotW) { readout.hidden = true; return; }
    const day = frame.d0 + ((x - frame.padL) / frame.plotW) * (frame.d1 - frame.d0);
    let best = frame.idx[0];
    let gap = Infinity;
    frame.idx.forEach((index) => {
      const d = Math.abs(Number(frame.days[index]) - day);
      if (d < gap) { gap = d; best = index; }
    });
    const shownDay = frame.days[best];
    const lines = frame.prepared.filter((trace) => !highlight || highlight === trace.id).map((trace) => {
      const value = trace.aligned[best];
      const unit = orderUnit(plot.info, trace.measure, trace.order);
      const symbol = trace.measure === "sigma" ? "σ" : "P";
      return `<div><i style="background:${trace.color}"></i>${esc(trace.name)} ${symbol} ${esc(orderTitle(plot.info, trace.order))} <b>${esc(sig3(value))}</b> ${esc(unit)}</div>`;
    });
    if (showPf && plot.pf) {
      const cursor = clock ? Number(clock.day) : plot.pf.d1;
      plot.pf.curves.filter((curve) => !curve.missing && (!highlight || highlight === curve.id)).forEach((curve) => {
        const value = curve.values[nearest(curve.days, shownDay)];
        if (!Number.isFinite(value)) return;
        lines.push(`<div><i style="background:${curve.color}"></i>${esc(curve.name)} C <b>${esc(sig3(value))}</b></div>`);
      });
      const near = predictorMarks(plot.info).find((mark) => Math.abs(frame.xDay(mark.alarm) - x) < 12 && mark.alarm <= cursor + 1e-6);
      if (near) {
        near.parts.forEach((part) => {
          lines.push(`<div>${esc(part.short)} day ${esc(sig3(part.alarm))}, P–F ${esc(sig3(part.interval))} days</div>`);
        });
      }
      const fail = Number(plot.info?.first_failure?.day);
      if (Number.isFinite(fail) && Math.abs(frame.xDay(fail) - x) < 10 && fail <= cursor + 1e-6) {
        lines.push(`<div>F ${esc(plot.info.first_failure.asset)}, day ${esc(sig3(fail))}</div>`);
      }
    }
    readout.hidden = false;
    readout.innerHTML = `<b>day ${esc(sig3(shownDay))}</b>${lines.join("")}`;
    const left = Math.min(rect.width - 240, x + 12);
    readout.style.left = `${Math.max(8, left)}px`;
    readout.style.top = "28px";
  }

  if (clock) {
    clock.subscribe(() => {
      if (!packs[mode]) return;
      const days = plot?.blocks?.find((item) => item.series)?.series.day;
      const sample = days ? nearest(days, clock.day) : -1;
      if (sample !== lastSample) {
        lastSample = sample;
        renderDiagram();
      }
      renderNow();
      if (plot) draw();
    });
  }

  ensureCouplings().then(() => ensurePack()).then(() => selectParent("PLANT"));
}
