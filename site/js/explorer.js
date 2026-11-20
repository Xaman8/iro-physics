import { sig3 } from "./format.js";
import { DOMAIN, domainLabel, esc, labelOf, mountEnvelopeNav, siblingEdges } from "./envelope-nav.js";

const root = document.getElementById("explorer");
root.innerHTML = `
  <button type="button" class="nav-toggle" data-nav-toggle aria-expanded="false">Envelopes</button>
  <div class="nav-backdrop" data-nav-close hidden></div>
  <aside class="board-nav" data-nav></aside>
  <section class="explorer-stage">
    <div class="explorer-bar">
      <nav class="crumbs" data-crumbs aria-label="Envelope path"></nav>
      <div class="dom-picks" data-domains></div>
      <div class="zoom-picks">
        <button type="button" class="chip-btn" data-zoom="out" aria-label="Zoom out">−</button>
        <button type="button" class="chip-btn" data-zoom="in" aria-label="Zoom in">+</button>
        <button type="button" class="chip-btn" data-zoom="fit">Fit</button>
      </div>
    </div>
    <div class="explorer-canvas">
      <canvas data-canvas></canvas>
      <aside class="ex-card" data-card hidden></aside>
    </div>
    <details class="board-notes">
      <summary>Notes</summary>
      <p>This is a made-up toy plant. The canvas shows the selected node's children and the couplings between them. Chemical ports in v3 are not physical.</p>
    </details>
  </section>`;

const canvas = root.querySelector("[data-canvas]");
const crumbsEl = root.querySelector("[data-crumbs]");
const domainsEl = root.querySelector("[data-domains]");
const cardEl = root.querySelector("[data-card]");
const nav = root.querySelector("[data-nav]");
const navToggle = root.querySelector("[data-nav-toggle]");
const backdrop = root.querySelector("[data-nav-close]");

const domainsOn = new Set(Object.keys(DOMAIN));
let couplings = null;
let snap = null;
let parentId = "PLANT";
let highlight = null;
let detail = null;
const cam = { x: 0, y: 0, k: 1 };
let boxes = [];
let edges = [];
let drag = null;

domainsEl.innerHTML = Object.keys(DOMAIN).map((name) =>
  `<button type="button" class="chip-btn" data-domain="${name}" aria-pressed="true" title="${esc(domainLabel(name))}"><i style="background:${DOMAIN[name]}"></i>${esc(name)}</button>`
).join("");

function node(id) { return snap?.byId?.[id]; }

function setNavOpen(open) {
  nav.classList.toggle("open", open);
  backdrop.hidden = !open;
  navToggle.setAttribute("aria-expanded", String(open));
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

function renderCrumbs() {
  crumbsEl.innerHTML = ancestors(parentId).map((item, index, all) => {
    const last = index === all.length - 1;
    return `<button type="button" data-crumb="${esc(item.id)}" ${last ? 'aria-current="page"' : ""}>${esc(labelOf(item))}</button>`;
  }).join("<span>/</span>");
}

function portsOf(item) {
  if (!item) return [];
  if (item.kind === "plant") {
    return (snap.boundary || []).map((entry) => ({
      name: entry.name,
      domain: entry.domain,
      detail: `${entry.name}. ${entry.domain}, ${entry.direction}. ${sig3(entry.dc_power_into_plant_MW)} MW into the plant.`,
    }));
  }
  return (item.boundary_ports || []).map((entry) => ({
    name: entry.port || entry.name,
    domain: entry.domain,
    detail: `${entry.port || entry.name}. ${entry.domain}.`,
  }));
}

function layout() {
  const parent = node(parentId);
  const children = (parent?.children || []).map((id) => node(id)).filter(Boolean);
  const boxW = 180;
  const boxH = 76;
  const gap = 84;
  const total = children.length * boxW + Math.max(0, children.length - 1) * gap;
  let x = -total / 2;
  boxes = children.map((child) => {
    const box = { id: child.id, node: child, x, y: 20, w: boxW, h: boxH };
    x += boxW + gap;
    return box;
  });
  edges = parent ? siblingEdges(parent, snap.byId, couplings).filter((edge) => domainsOn.has(edge.domain)) : [];
}

function fit() {
  if (!boxes.length) { cam.x = 0; cam.y = 0; cam.k = 1; return; }
  const minX = Math.min(...boxes.map((box) => box.x));
  const maxX = Math.max(...boxes.map((box) => box.x + box.w));
  const minY = Math.min(...boxes.map((box) => box.y)) - 90;
  const maxY = Math.max(...boxes.map((box) => box.y + box.h)) + 24;
  cam.x = (minX + maxX) / 2;
  cam.y = (minY + maxY) / 2;
  const rect = canvas.getBoundingClientRect();
  const kw = (rect.width * 0.82) / Math.max(1, maxX - minX);
  const kh = (rect.height * 0.72) / Math.max(1, maxY - minY);
  cam.k = Math.max(0.35, Math.min(1.8, kw, kh));
}

function sizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, w: rect.width, h: rect.height };
}

function toScreen(wx, wy, w, h) {
  return { x: (wx - cam.x) * cam.k + w / 2, y: (wy - cam.y) * cam.k + h / 2 };
}
function toWorld(sx, sy, w, h) {
  return { x: (sx - w / 2) / cam.k + cam.x, y: (sy - h / 2) / cam.k + cam.y };
}

function draw() {
  const { ctx, w, h } = sizeCanvas();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  const placed = edges.map((edge) => {
    const a = boxes.find((box) => box.id === edge.a);
    const b = boxes.find((box) => box.id === edge.b);
    if (!a || !b) return null;
    const p = toScreen(a.x + a.w / 2, a.y, w, h);
    const q = toScreen(b.x + b.w / 2, b.y, w, h);
    return { edge, p, q };
  }).filter(Boolean);
  const groups = new Map();
  placed.forEach((item) => {
    const key = [item.edge.a, item.edge.b].sort().join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  for (const list of groups.values()) {
    list.forEach((item, index) => {
      const shift = (index - (list.length - 1) / 2) * 8;
      const midX = (item.p.x + item.q.x) / 2 + shift;
      const lift = Math.min(item.p.y, item.q.y) - 36 * cam.k;
      ctx.beginPath();
      ctx.moveTo(item.p.x, item.p.y);
      ctx.quadraticCurveTo(midX, lift, item.q.x, item.q.y);
      ctx.strokeStyle = DOMAIN[item.edge.domain] || "#888";
      ctx.lineWidth = 2.4;
      ctx.stroke();
      item.curve = { midX, lift };
    });
  }
  boxes.forEach((box) => {
    const p = toScreen(box.x, box.y, w, h);
    const s = toScreen(box.x + box.w, box.y + box.h, w, h);
    const bw = s.x - p.x;
    const bh = s.y - p.y;
    box.screen = { x: p.x, y: p.y, w: bw, h: bh };
    const on = highlight === box.id || detail?.id === box.id;
    ctx.fillStyle = on ? "#e5f2f0" : "#fff";
    ctx.strokeStyle = on ? "#0f5c56" : "#e0d8cb";
    ctx.lineWidth = on ? 2.5 : 1.2;
    roundRect(ctx, p.x, p.y, bw, bh, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1c1915";
    ctx.font = `${Math.max(13, 16 * cam.k)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(labelOf(box.node), p.x + bw / 2, p.y + bh / 2);
  });
  const ports = portsOf(node(parentId)).filter((entry) => domainsOn.has(entry.domain));
  ports.forEach((entry, index) => {
    const x = 18 + (index % 18) * 18;
    const y = 16 + Math.floor(index / 18) * 16;
    entry.screen = { x, y };
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = DOMAIN[entry.domain] || "#888";
    ctx.fill();
  });
  canvas._ports = ports;
  canvas._edges = placed;
  canvas._boxes = boxes;
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function showCard(title, rows) {
  cardEl.hidden = false;
  cardEl.innerHTML = `<button type="button" data-card-close aria-label="Close">×</button><h2>${esc(title)}</h2><dl>${
    rows.filter((row) => row[1] != null && row[1] !== "").map(([name, value]) => `<dt>${esc(name)}</dt><dd>${esc(value)}</dd>`).join("")
  }</dl>`;
}

function nodeRows(item) {
  const ports = item.kind === "plant" ? (snap.boundary || []) : (item.boundary_ports || []);
  const domains = [...new Set(ports.map((port) => port.domain))].filter(Boolean);
  return [
    ["Id", item.id],
    ["Level", item.level],
    ["Kind", item.kind],
    ["Assets", item.assets ? item.assets.length : null],
    ["Ports", ports.length || item.n_active_ports],
    ["Domains", domains.join(", ")],
  ];
}

function openNode(item) {
  detail = { kind: "node", id: item.id };
  highlight = item.id;
  showCard(item.name || item.id, nodeRows(item));
  draw();
}

function openEdge(edge) {
  detail = { kind: "edge", id: `${edge.a}|${edge.b}|${edge.domain}` };
  const power = edge.dc_power_MW_a_to_b;
  showCard(`${edge.a} → ${edge.b}`, [
    ["Domain", edge.domain],
    ["Strength", power == null ? null : `${sig3(power)} MW`],
    ["Links", edge.n_links ?? edge.links?.length],
  ]);
  draw();
}

function drill(id) {
  const item = node(id);
  if (!item) return;
  if (item.kind === "asset" || !(item.children || []).length) {
    openNode(item);
    return;
  }
  parentId = id;
  highlight = null;
  navCtl.select(id, { silent: true });
  renderCrumbs();
  layout();
  fit();
  openNode(item);
}

function hit(sx, sy) {
  const box = [...boxes].reverse().find((item) => item.screen && sx >= item.screen.x && sx <= item.screen.x + item.screen.w && sy >= item.screen.y && sy <= item.screen.y + item.screen.h);
  if (box) return { type: "box", box };
  const port = (canvas._ports || []).find((item) => Math.hypot(item.screen.x - sx, item.screen.y - sy) < 8);
  if (port) return { type: "port", port };
  const edge = (canvas._edges || []).find((item) => curveDistance(item, sx, sy) < 8);
  if (edge) return { type: "edge", edge: edge.edge };
  return null;
}

function curveDistance(item, sx, sy) {
  let best = Infinity;
  for (let t = 0; t <= 1; t += 0.05) {
    const mt = 1 - t;
    const x = mt * mt * item.p.x + 2 * mt * t * item.curve.midX + t * t * item.q.x;
    const y = mt * mt * item.p.y + 2 * mt * t * item.curve.lift + t * t * item.q.y;
    best = Math.min(best, Math.hypot(x - sx, y - sy));
  }
  return best;
}

function onCanvasClick(event) {
  const rect = canvas.getBoundingClientRect();
  const target = hit(event.clientX - rect.left, event.clientY - rect.top);
  if (!target) { cardEl.hidden = true; detail = null; highlight = null; draw(); return; }
  if (target.type === "box") {
    const item = target.box.node;
    if (item.kind !== "asset" && (item.children || []).length) drill(item.id);
    else openNode(item);
    return;
  }
  if (target.type === "edge") { openEdge(target.edge); return; }
  if (target.type === "port") {
    detail = { kind: "port", id: target.port.name };
    showCard(target.port.name, [["Detail", target.port.detail]]);
  }
}

canvas.addEventListener("pointerdown", (event) => {
  drag = { x: event.clientX, y: event.clientY, camx: cam.x, camy: cam.y, moved: false };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (!drag) return;
  if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 4) drag.moved = true;
  if (!drag.moved) return;
  cam.x = drag.camx - (event.clientX - drag.x) / cam.k;
  cam.y = drag.camy - (event.clientY - drag.y) / cam.k;
  draw();
});
canvas.addEventListener("pointerup", (event) => {
  if (!drag) return;
  const wasClick = !drag.moved;
  drag = null;
  if (wasClick) onCanvasClick(event);
});
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const sx = event.clientX - rect.left;
  const sy = event.clientY - rect.top;
  const { w, h } = { w: rect.width, h: rect.height };
  const before = toWorld(sx, sy, w, h);
  cam.k = Math.max(0.35, Math.min(3, cam.k * (event.deltaY < 0 ? 1.08 : 1 / 1.08)));
  const after = toWorld(sx, sy, w, h);
  cam.x += before.x - after.x;
  cam.y += before.y - after.y;
  draw();
}, { passive: false });

root.addEventListener("click", (event) => {
  if (event.target.closest("[data-nav-toggle]")) { setNavOpen(!nav.classList.contains("open")); return; }
  if (event.target.closest("[data-nav-close]")) { setNavOpen(false); return; }
  if (event.target.closest("[data-card-close]")) { cardEl.hidden = true; detail = null; highlight = null; draw(); return; }
  const crumb = event.target.closest("[data-crumb]");
  if (crumb) { drill(crumb.dataset.crumb); return; }
  const domain = event.target.closest("[data-domain]");
  if (domain) {
    const name = domain.dataset.domain;
    if (domainsOn.has(name)) domainsOn.delete(name);
    else domainsOn.add(name);
    if (!domainsOn.size) domainsOn.add(name);
    domain.setAttribute("aria-pressed", String(domainsOn.has(name)));
    layout();
    draw();
    return;
  }
  const zoom = event.target.closest("[data-zoom]");
  if (!zoom) return;
  if (zoom.dataset.zoom === "fit") { fit(); draw(); return; }
  cam.k = Math.max(0.35, Math.min(3, cam.k * (zoom.dataset.zoom === "in" ? 1.15 : 1 / 1.15)));
  draw();
});

function showParent(id) {
  parentId = id;
  highlight = null;
  detail = null;
  cardEl.hidden = true;
  renderCrumbs();
  layout();
  fit();
  draw();
  if (window.matchMedia("(max-width: 800px)").matches) setNavOpen(false);
}

const navCtl = mountEnvelopeNav(nav, {
  showAssets: true,
  onSelect(id, next) {
    snap = next;
    const item = next.byId[id];
    if (item?.kind === "asset") {
      parentId = item.parent || parentId;
      renderCrumbs();
      layout();
      fit();
      openNode(item);
      return;
    }
    showParent(id);
  },
});

new ResizeObserver(() => draw()).observe(canvas);
fetch("data/v3/couplings.json").then((response) => response.json()).then((data) => {
  couplings = data;
  return navCtl.start();
});
