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
let frame = null;
let hoverEdge = null;
let drag = null;
let camTouched = false;

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

function assetCountLine(item) {
  const n = Array.isArray(item?.assets) ? item.assets.length : 0;
  if (!n) return "";
  return n === 1 ? "1 asset" : `${n} assets`;
}

function ownerChild(parent, asset) {
  for (const id of parent.children || []) {
    const child = node(id);
    if (!child) continue;
    if (child.id === asset || (child.assets || []).includes(asset)) return id;
  }
  return null;
}

function plantPortLabel(name, all) {
  const raw = String(name || "");
  const paren = (raw.match(/\(([^)]+)\)/) || [])[1] || "";
  const baseOf = (value) => String(value).replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+to\s+.*/i, "").replace(/\s+/g, " ").trim();
  const base = baseOf(raw);
  const dup = all.filter((entry) => baseOf(entry) === base).length > 1;
  let label = dup && paren ? `${base} (${paren.split(/\s+/)[0].toLowerCase()})` : base;
  if (label.length > 24) label = `${label.slice(0, 23)}…`;
  return label || raw;
}

function boundaryPorts(parent) {
  if (!parent) return [];
  if (parent.kind === "plant") {
    const entries = snap.boundary || [];
    return entries.filter((entry) => domainsOn.has(entry.domain)).map((entry, _index, list) => ({
      key: entry.port || entry.name,
      name: plantPortLabel(entry.name || entry.port, list.map((item) => item.name || item.port)),
      full: entry.name || entry.port,
      domain: entry.domain,
      childId: (entry.path || [])[1] || null,
      direction: entry.direction,
      power: entry.dc_power_into_plant_MW,
    }));
  }
  return (parent.boundary_ports || []).filter((entry) => domainsOn.has(entry.domain)).map((entry) => ({
    key: `${entry.asset}|${entry.port}`,
    name: String(entry.port || entry.name || ""),
    full: entry.port || entry.name,
    domain: entry.domain,
    childId: ownerChild(parent, entry.asset),
  })).filter((entry) => entry.childId);
}

function layout() {
  const parent = node(parentId);
  const children = (parent?.children || []).map((id) => node(id)).filter(Boolean);
  const rect = canvas.getBoundingClientRect();
  const insetX = 132;
  const insetY = 32;
  const availW = Math.max(280, (rect.width || 800) - insetX * 2);
  const availH = Math.max(200, (rect.height || 500) - insetY * 2);
  const n = children.length;
  let boxW = Math.min(340, Math.max(200, availW * 0.24));
  let boxH = Math.min(132, Math.max(96, availH * 0.16));
  let rx = Math.max(48, availW / 2 - boxW / 2 - 36);
  let ry = Math.max(48, availH / 2 - boxH / 2 - 36);
  if (n > 1) {
    const chord = 2 * Math.min(rx, ry) * Math.sin(Math.PI / n);
    if (chord < boxW + 40) boxW = Math.max(136, chord - 40);
    rx = Math.max(48, availW / 2 - boxW / 2 - 36);
    ry = Math.max(48, availH / 2 - boxH / 2 - 36);
  }
  boxes = children.map((child, index) => {
    const angle = n ? -Math.PI / 2 + (index * 2 * Math.PI) / n : -Math.PI / 2;
    const cx = n > 1 ? rx * Math.cos(angle) : 0;
    const cy = n > 1 ? ry * Math.sin(angle) : 0;
    return { id: child.id, node: child, x: cx - boxW / 2, y: cy - boxH / 2, w: boxW, h: boxH };
  });
  frame = { left: -availW / 2, top: -availH / 2, right: availW / 2, bottom: availH / 2 };
  edges = parent ? siblingEdges(parent, snap.byId, couplings).filter((edge) => domainsOn.has(edge.domain)) : [];
}

function fit() {
  cam.x = 0;
  cam.y = 0;
  cam.k = 1;
  camTouched = false;
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

function couplingWidth(power, viewH) {
  const mag = Math.abs(Number(power));
  const scale = Math.max(1, Math.min(1.5, (viewH || 700) / 680));
  if (!Number.isFinite(mag) || mag <= 0) return 1.8 * scale;
  const t = (Math.log10(mag) + 4) / 5;
  return (1.8 + Math.max(0, Math.min(1, t)) * 5.8) * scale;
}

function edgeKey(edge) {
  return `${edge.a}|${edge.b}|${edge.domain}`;
}

function screenBox(box, w, h) {
  const p = toScreen(box.x, box.y, w, h);
  const s = toScreen(box.x + box.w, box.y + box.h, w, h);
  return { x: p.x, y: p.y, w: s.x - p.x, h: s.y - p.y };
}

function rayExit(rect, x, y, dx, dy) {
  const hits = [];
  const within = (value, lo, hi) => value >= lo - 0.8 && value <= hi + 0.8;
  if (dx) {
    for (const edge of [rect.x, rect.x + rect.w]) {
      const t = (edge - x) / dx;
      if (t > 0.001) {
        const yy = y + t * dy;
        if (within(yy, rect.y, rect.y + rect.h)) hits.push({ t, x: edge, y: yy });
      }
    }
  }
  if (dy) {
    for (const edge of [rect.y, rect.y + rect.h]) {
      const t = (edge - y) / dy;
      if (t > 0.001) {
        const xx = x + t * dx;
        if (within(xx, rect.x, rect.x + rect.w)) hits.push({ t, x: xx, y: edge });
      }
    }
  }
  hits.sort((a, b) => a.t - b.t);
  return hits[0] ? { x: hits[0].x, y: hits[0].y } : { x, y };
}

function parallelSegment(aRect, bRect, offset) {
  const acx = aRect.x + aRect.w / 2;
  const acy = aRect.y + aRect.h / 2;
  const bcx = bRect.x + bRect.w / 2;
  const bcy = bRect.y + bRect.h / 2;
  const dx = bcx - acx;
  const dy = bcy - acy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const ax = acx + nx * offset;
  const ay = acy + ny * offset;
  const bx = bcx + nx * offset;
  const by = bcy + ny * offset;
  return {
    p: rayExit(aRect, ax, ay, bx - ax, by - ay),
    q: rayExit(bRect, bx, by, ax - bx, ay - by),
  };
}

function placePorts(ports, fr) {
  const groups = { top: [], right: [], bottom: [], left: [] };
  for (const port of ports) {
    const box = boxes.find((item) => item.id === port.childId);
    if (!box?.screen) continue;
    const cx = box.screen.x + box.screen.w / 2;
    const cy = box.screen.y + box.screen.h / 2;
    const mx = fr.x + fr.w / 2;
    const my = fr.y + fr.h / 2;
    const side = Math.abs(cx - mx) / (fr.w / 2) >= Math.abs(cy - my) / (fr.h / 2)
      ? (cx >= mx ? "right" : "left")
      : (cy >= my ? "bottom" : "top");
    port.side = side;
    port.anchor = side === "left" || side === "right" ? cy : cx;
    groups[side].push(port);
  }
  for (const side of Object.keys(groups)) {
    const list = groups[side];
    if (!list.length) continue;
    const vertical = side === "left" || side === "right";
    const lo = (vertical ? fr.y : fr.x) + 10;
    const hi = (vertical ? fr.y + fr.h : fr.x + fr.w) - 10;
    const gap = vertical ? 6 : 12;
    const sizeOf = (port) => (vertical ? 18 : port.labelWidth + 6);
    const byChild = new Map();
    for (const port of list) {
      if (!byChild.has(port.childId)) byChild.set(port.childId, []);
      byChild.get(port.childId).push(port);
    }
    const clusters = [...byChild.values()].map((items) => ({
      items,
      need: items.reduce((sum, port) => sum + sizeOf(port), 0) + gap * Math.max(0, items.length - 1),
      anchor: items.reduce((sum, port) => sum + port.anchor, 0) / items.length,
    })).sort((a, b) => a.anchor - b.anchor);
    let cursor = lo;
    const placed = clusters.map((cluster) => {
      const start = Math.max(cursor, Math.min(cluster.anchor - cluster.need / 2, hi - cluster.need));
      cursor = start + cluster.need + gap;
      return { ...cluster, start };
    });
    const end = placed.length ? placed[placed.length - 1].start + placed[placed.length - 1].need : lo;
    const shift = Math.max(0, end - hi);
    for (const cluster of placed) {
      let pos = Math.max(lo, cluster.start - shift);
      cluster.items.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      for (const port of cluster.items) {
        const at = pos + sizeOf(port) / 2;
        pos += sizeOf(port) + (cluster.items.length > 1 ? gap : 0);
        if (side === "top") { port.sx = at; port.sy = fr.y; }
        if (side === "bottom") { port.sx = at; port.sy = fr.y + fr.h; }
        if (side === "left") { port.sx = fr.x; port.sy = at; }
        if (side === "right") { port.sx = fr.x + fr.w; port.sy = at; }
      }
    }
  }
}

function draw() {
  const { ctx, w, h } = sizeCanvas();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  boxes.forEach((box) => { box.screen = screenBox(box, w, h); });
  const fr = frame ? (() => {
    const p = toScreen(frame.left, frame.top, w, h);
    const q = toScreen(frame.right, frame.bottom, w, h);
    return { x: p.x, y: p.y, w: q.x - p.x, h: q.y - p.y };
  })() : null;
  if (fr) {
    ctx.save();
    ctx.fillStyle = "#f7f4ee";
    ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
    ctx.strokeStyle = "#b7ad9e";
    ctx.lineWidth = 1.25;
    ctx.setLineDash([7, 5]);
    ctx.strokeRect(fr.x + 0.5, fr.y + 0.5, fr.w, fr.h);
    ctx.restore();
  }
  const placed = [];
  const groups = new Map();
  for (const edge of edges) {
    const a = boxes.find((box) => box.id === edge.a);
    const b = boxes.find((box) => box.id === edge.b);
    if (!a?.screen || !b?.screen) continue;
    const key = [edge.a, edge.b].sort().join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(edge);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => String(a.domain).localeCompare(String(b.domain)));
    list.forEach((edge, index) => {
      const a = boxes.find((box) => box.id === edge.a);
      const b = boxes.find((box) => box.id === edge.b);
      const offset = (index - (list.length - 1) / 2) * 8;
      const seg = parallelSegment(a.screen, b.screen, offset);
      placed.push({ edge, p: seg.p, q: seg.q, width: couplingWidth(edge.dc_power_MW_a_to_b, h) });
    });
  }
  const activeId = hoverEdge || (detail?.kind === "edge" ? detail.id : null);
  const active = placed.some((item) => edgeKey(item.edge) === activeId) ? activeId : null;
  const paintEdge = (item, emphasized) => {
    ctx.save();
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(item.p.x, item.p.y);
    ctx.lineTo(item.q.x, item.q.y);
    if (emphasized) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = item.width + 5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(item.p.x, item.p.y);
      ctx.lineTo(item.q.x, item.q.y);
    }
    ctx.globalAlpha = !active || emphasized ? 1 : 0.16;
    ctx.strokeStyle = DOMAIN[item.edge.domain] || "#888";
    ctx.lineWidth = item.width + (emphasized ? 2 : 0);
    ctx.stroke();
    ctx.restore();
  };
  placed.forEach((item) => { if (edgeKey(item.edge) !== active) paintEdge(item, false); });
  placed.forEach((item) => { if (edgeKey(item.edge) === active) paintEdge(item, true); });
  boxes.forEach((box) => {
    const { x, y, w: bw, h: bh } = box.screen;
    const on = highlight === box.id || (detail?.kind === "node" && detail.id === box.id);
    ctx.fillStyle = on ? "#e5f2f0" : "#fff";
    ctx.strokeStyle = on ? "#0f5c56" : "#d9d0c3";
    ctx.lineWidth = on ? 2.5 : 1.4;
    roundRect(ctx, x, y, bw, bh, 12);
    ctx.fill();
    ctx.stroke();
    const name = labelOf(box.node);
    const count = assetCountLine(box.node);
    const namePx = Math.min(18, Math.max(13, bh * 0.24));
    ctx.fillStyle = "#1c1915";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let size = namePx;
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    while (ctx.measureText(name).width > bw - 18 && size > 11) {
      size -= 0.5;
      ctx.font = `600 ${size}px system-ui, sans-serif`;
    }
    ctx.fillText(name, x + bw / 2, y + bh / 2 - (count ? 11 : 0));
    if (count) {
      ctx.font = `500 ${Math.min(13, Math.max(11, bh * 0.16))}px system-ui, sans-serif`;
      ctx.fillStyle = "#6f675e";
      ctx.fillText(count, x + bw / 2, y + bh / 2 + 14);
    }
  });
  const ports = fr ? boundaryPorts(node(parentId)) : [];
  ctx.font = "12px system-ui, sans-serif";
  ports.forEach((port) => { port.labelWidth = Math.min(150, ctx.measureText(port.name).width); });
  if (fr) placePorts(ports, fr);
  if (fr) {
    for (const port of ports) {
      const box = boxes.find((item) => item.id === port.childId);
      if (!box?.screen || port.sx == null) continue;
      const cx = box.screen.x + box.screen.w / 2;
      const cy = box.screen.y + box.screen.h / 2;
      const end = rayExit(box.screen, cx, cy, port.sx - cx, port.sy - cy);
      ctx.save();
      ctx.globalAlpha = active ? 0.28 : 0.8;
      ctx.beginPath();
      ctx.moveTo(port.sx, port.sy);
      ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = DOMAIN[port.domain] || "#888";
      ctx.lineWidth = 1.25;
      ctx.stroke();
      ctx.restore();
    }
  }
  for (const port of ports) {
    if (port.sx == null) continue;
    ctx.beginPath();
    ctx.arc(port.sx, port.sy, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = DOMAIN[port.domain] || "#888";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = "#1c1915";
    ctx.textBaseline = "middle";
    if (port.side === "left") {
      ctx.textAlign = "right";
      ctx.fillText(port.name, port.sx - 10, port.sy);
    } else if (port.side === "right") {
      ctx.textAlign = "left";
      ctx.fillText(port.name, port.sx + 10, port.sy);
    } else if (port.side === "top") {
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(port.name, port.sx, port.sy - 9);
    } else {
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(port.name, port.sx, port.sy + 9);
    }
    const labelW = port.labelWidth || 40;
    const labelH = 16;
    if (port.side === "left") port.hit = { x: port.sx - 12 - labelW, y: port.sy - 10, w: labelW + 20, h: 20 };
    else if (port.side === "right") port.hit = { x: port.sx - 8, y: port.sy - 10, w: labelW + 20, h: 20 };
    else if (port.side === "top") port.hit = { x: port.sx - labelW / 2 - 4, y: port.sy - 12 - labelH, w: labelW + 8, h: labelH + 16 };
    else port.hit = { x: port.sx - labelW / 2 - 4, y: port.sy - 6, w: labelW + 8, h: labelH + 16 };
  }
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
  const lead = rows.find((row) => row[0] === "Net power" && row[1]);
  const body = rows.filter((row) => row !== lead && row[1] != null && row[1] !== "");
  const note = lead ? `<p class="ex-lead"><span>Net power</span> ${esc(lead[1])}</p>` : "";
  cardEl.innerHTML = `<button type="button" data-card-close aria-label="Close">×</button><h2>${esc(title)}</h2>${note}<dl>${
    body.map(([name, value]) => `<dt>${esc(name)}</dt><dd>${esc(value)}</dd>`).join("")
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

function powerMagnitude(power) {
  const mag = Math.abs(Number(power));
  if (!Number.isFinite(mag)) return null;
  if (mag === 0) return "0";
  if (mag < 1e-3 || mag >= 1e4) return mag.toExponential(2).replace("e+", "e");
  return mag.toPrecision(3).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

function netPowerText(edge) {
  const power = Number(edge.dc_power_MW_a_to_b);
  if (!Number.isFinite(power)) return null;
  const mag = powerMagnitude(power);
  if (power === 0) return `${mag}\u00a0MW`;
  const from = power > 0 ? edge.a : edge.b;
  const to = power > 0 ? edge.b : edge.a;
  return `${from} → ${to}: ${mag}\u00a0MW`;
}

function linkCount(edge) {
  if (edge.n_links != null) return String(edge.n_links);
  if (Array.isArray(edge.links)) return String(edge.links.length);
  return null;
}

function openEdge(edge) {
  detail = { kind: "edge", id: edgeKey(edge) };
  highlight = null;
  showCard(`${edge.a} – ${edge.b}`, [
    ["Domain", domainLabel(edge.domain)],
    ["Net power", netPowerText(edge)],
    ["Links", linkCount(edge)],
  ]);
  draw();
}

function drill(id) {
  hoverEdge = null;
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

function pointSegDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function hit(sx, sy) {
  const box = [...boxes].reverse().find((item) => item.screen && sx >= item.screen.x && sx <= item.screen.x + item.screen.w && sy >= item.screen.y && sy <= item.screen.y + item.screen.h);
  if (box) return { type: "box", box };
  const port = (canvas._ports || []).find((item) => item.hit && sx >= item.hit.x && sx <= item.hit.x + item.hit.w && sy >= item.hit.y && sy <= item.hit.y + item.hit.h);
  if (port) return { type: "port", port };
  let best = null;
  let bestDist = Infinity;
  for (const item of canvas._edges || []) {
    const dist = pointSegDistance(sx, sy, item.p.x, item.p.y, item.q.x, item.q.y);
    const limit = Math.max(8, item.width / 2 + 4);
    if (dist <= limit && dist < bestDist) { best = item; bestDist = dist; }
  }
  if (best) return { type: "edge", edge: best.edge };
  return null;
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
    detail = { kind: "port", id: target.port.key };
    highlight = null;
    const rows = [
      ["Domain", domainLabel(target.port.domain)],
      ["Child", target.port.childId],
    ];
    if (target.port.direction) rows.push(["Direction", target.port.direction]);
    if (target.port.power != null) {
      const signed = Number(target.port.power);
      const text = powerMagnitude(signed);
      rows.push(["Power into plant", `${signed < 0 ? "−" : ""}${text} MW`]);
    }
    showCard(target.port.full || target.port.name, rows);
    draw();
  }
}

function hoverAt(event) {
  const rect = canvas.getBoundingClientRect();
  const target = hit(event.clientX - rect.left, event.clientY - rect.top);
  const id = target?.type === "edge" ? edgeKey(target.edge) : null;
  canvas.style.cursor = target ? "pointer" : "grab";
  if (id !== hoverEdge) {
    hoverEdge = id;
    draw();
  }
}

canvas.addEventListener("pointerdown", (event) => {
  drag = { x: event.clientX, y: event.clientY, camx: cam.x, camy: cam.y, moved: false };
  canvas.style.cursor = "grabbing";
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (!drag) { hoverAt(event); return; }
  if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 4) drag.moved = true;
  if (!drag.moved) return;
  camTouched = true;
  cam.x = drag.camx - (event.clientX - drag.x) / cam.k;
  cam.y = drag.camy - (event.clientY - drag.y) / cam.k;
  draw();
});
canvas.addEventListener("pointerup", (event) => {
  if (!drag) return;
  const wasClick = !drag.moved;
  drag = null;
  if (wasClick) onCanvasClick(event);
  else hoverAt(event);
});
canvas.addEventListener("pointerleave", () => {
  if (drag) return;
  if (hoverEdge) { hoverEdge = null; draw(); }
  canvas.style.cursor = "grab";
});
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const sx = event.clientX - rect.left;
  const sy = event.clientY - rect.top;
  const { w, h } = { w: rect.width, h: rect.height };
  const before = toWorld(sx, sy, w, h);
  camTouched = true;
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
    if (hoverEdge && !edges.some((edge) => edgeKey(edge) === hoverEdge)) hoverEdge = null;
    draw();
    return;
  }
  const zoom = event.target.closest("[data-zoom]");
  if (!zoom) return;
  if (zoom.dataset.zoom === "fit") { layout(); fit(); draw(); return; }
  camTouched = true;
  cam.k = Math.max(0.35, Math.min(3, cam.k * (zoom.dataset.zoom === "in" ? 1.15 : 1 / 1.15)));
  draw();
});

function showParent(id) {
  parentId = id;
  highlight = null;
  detail = null;
  hoverEdge = null;
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

new ResizeObserver(() => {
  if (!camTouched) layout();
  draw();
}).observe(canvas);
fetch("data/v3/couplings.json").then((response) => response.json()).then((data) => {
  couplings = data;
  return navCtl.start();
});
