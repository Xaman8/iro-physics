import { compact, dayIndex } from "./format.js";

const BRIGHT = {
  mechanical: "#7dffaf",
  fluid: "#5ad1ff",
  thermal: "#f0b070",
  electrical: "#ffd24a",
};

const YMAX = 12;

export function mountPhysics(root, { plant, scenario, getFault, clock }) {
  const assetById = Object.fromEntries(plant.assets.map((a) => [a.id, a]));
  root.innerHTML = `
    <div class="physics">
      <header>
        <div class="phys-kicker">System physics</div>
        <h2 id="physTitle">Heat exchanger</h2>
        <p class="honest">In the Francis System Physics view these tracks are scripted. Here each track is this run's band amplitude at the coupled port, in units of the 0.01 pu sensor scatter. The grey line is endurance remaining, drawn on the same axis (10 unused, 0 at the limit).</p>
      </header>
      <div class="phys-controls">
        <label>Asset <select id="physAsset"></select></label>
        <label>Noise <select id="physNoise"></select></label>
      </div>
      <div class="phys-sch" id="physSch"></div>
      <div class="chart-wrap">
        <canvas id="physCanvas"></canvas>
        <div class="tip" id="physTip" hidden></div>
      </div>
      <div class="phys-foot">
        <span id="physRegime">Nominal</span>
        <span id="physRead"></span>
      </div>
    </div>`;

  const assetSelect = root.querySelector("#physAsset");
  const noiseSelect = root.querySelector("#physNoise");
  const canvas = root.querySelector("#physCanvas");
  const tip = root.querySelector("#physTip");
  const sch = root.querySelector("#physSch");
  let center = "HX1";
  let noiseKey = "0.01";
  let pinned = null;
  let marks = [];

  assetSelect.innerHTML = plant.assets.map((a) => `<option value="${a.id}">${a.id} · ${escapeHtml(a.name)}</option>`).join("");
  assetSelect.value = center;
  assetSelect.addEventListener("change", () => {
    center = assetSelect.value;
    pinned = null;
    buildSchematic();
    paint();
  });

  function syncNoiseOptions() {
    const classic = getFault().classic;
    noiseSelect.innerHTML = classic.noiseLevelsPu.map((level) => {
      const key = level.toFixed(2);
      const label = level === 0 ? "model" : `${key} pu`;
      return `<option value="${key}">${label}</option>`;
    }).join("");
    if (![...noiseSelect.options].some((o) => o.value === noiseKey)) noiseKey = classic.defaultNoisePu.toFixed(2);
    noiseSelect.value = noiseKey;
  }
  noiseSelect.addEventListener("change", () => { noiseKey = noiseSelect.value; paint(); });
  syncNoiseOptions();

  function couplingsOf(assetId) {
    return plant.couplings.filter((c) => c.sourceAssetId === assetId || c.targetAssetId === assetId);
  }

  function trackList() {
    const fault = getFault();
    const classic = fault.classic;
    return couplingsOf(center).map((coupling) => {
      const inbound = coupling.targetAssetId === center;
      const neighborId = inbound ? coupling.sourceAssetId : coupling.targetAssetId;
      const portId = inbound ? coupling.sourcePortId : coupling.targetPortId;
      const portIndex = classic.portIds.indexOf(portId);
      return { coupling, neighborId, portId, portIndex };
    });
  }

  function sigmaAt(track, day) {
    const classic = getFault().classic;
    const band = classic.band[noiseKey];
    if (!band || track.portIndex < 0) return 0;
    const idx = dayIndex(day, band[track.portIndex].length);
    const amp = band[track.portIndex][idx];
    return (amp - classic.baselineMu[track.portIndex]) / classic.baselineSd[track.portIndex];
  }

  function detectIndex(track) {
    const fault = getFault();
    const classic = fault.classic;
    const band = classic.band[noiseKey][track.portIndex];
    const onset = fault.onsetDay;
    const first = Math.ceil(onset - 1e-6);
    for (let d = first; d < band.length; d++) {
      const s = (band[d] - classic.baselineMu[track.portIndex]) / classic.baselineSd[track.portIndex];
      if (s >= classic.detectionSigma) return d;
    }
    return null;
  }

  function regimes() {
    const fault = getFault();
    const tMax = fault.assets[center].sigma.length;
    const warn = warningDay(fault, center);
    const entry = fault.damageEntryDay[center];
    const fail = fault.failureDay[center];
    const primary = fault.targetAssetId === center;
    const bounds = [{ t: 0, label: "NOMINAL" }];
    const push = (t, label) => {
      if (t == null || !Number.isFinite(Number(t))) return;
      if (t <= bounds[bounds.length - 1].t + 1e-6) return;
      bounds.push({ t: Number(t), label });
    };
    push(fault.onsetDay, primary ? "TRANSIENT" : "AFTER ONSET");
    if (primary) push(warn, "PRE-FAULT");
    push(entry, primary ? "TRADITIONAL P–F" : "DAMAGE");
    push(fail, "FAILED");
    bounds.push({ t: tMax, label: "" });
    return bounds;
  }

  function regimeAt(day) {
    const bounds = regimes();
    let label = bounds[0].label;
    for (let i = 0; i < bounds.length - 1; i++) {
      if (day + 1e-9 >= bounds[i].t) label = bounds[i].label;
    }
    return label || "—";
  }

  function buildSchematic() {
    const tracks = trackList();
    const neighbors = [];
    const seen = new Set();
    for (const track of tracks) {
      if (seen.has(track.neighborId)) continue;
      seen.add(track.neighborId);
      neighbors.push(track);
    }
    const W = 680, H = 168, cx = 340, cy = 78, rx = 250, ry = 52;
    const pos = neighbors.map((track, i) => {
      const a = -Math.PI / 2 + (i / Math.max(neighbors.length, 1)) * Math.PI * 2;
      return { track, x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
    });
    const edges = tracks.map((track) => {
      const end = pos.find((p) => p.track.neighborId === track.neighborId);
      return { track, x: end.x, y: end.y };
    }).join("");
    const nodes = pos.map(({ track, x, y }) => nodeBox(x, y, track.neighborId, false)).join("");
    sch.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Couplings of ${center}">
        <g id="physEdges"></g>
        ${nodes}
        ${nodeBox(cx, cy, center, true)}
      </svg>`;
    sch._layout = { cx, cy, pos, W, H };
    paintSchematic();
  }

  function nodeBox(x, y, id, hub) {
    const asset = assetById[id];
    const name = asset ? asset.name.split("(")[0].trim() : id;
    const shown = name.length > 22 ? name.slice(0, 20) + "…" : name;
    const ports = plant.ports.filter((p) => p.assetId === id);
    const w = Math.max(96, shown.length * 6.4 + 28);
    const dots = ports.map((p, i) => {
      const dx = (i - (ports.length - 1) / 2) * 12;
      return `<circle cx="${(x + dx).toFixed(1)}" cy="${(y + 22).toFixed(1)}" r="3.2" fill="${BRIGHT[p.domain]}"><title>${escapeHtml(p.id)}</title></circle>`;
    }).join("");
    const fill = hub ? "rgba(255,91,77,0.14)" : "#1c2030";
    const stroke = hub ? "#ff5b4d" : "rgba(255,255,255,0.28)";
    return `<g><title>${escapeHtml(id + " " + (asset ? asset.name : ""))}</title>
      <rect x="${(x - w / 2).toFixed(1)}" y="${(y - 22).toFixed(1)}" width="${w.toFixed(1)}" height="36" rx="8" fill="${fill}" stroke="${stroke}"/>
      <text x="${x.toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" fill="${hub ? "#fff" : "#e7eaf2"}" font-size="12" font-weight="700">${id}</text>
      <text x="${x.toFixed(1)}" y="${(y + 8).toFixed(1)}" text-anchor="middle" fill="rgba(255,255,255,0.55)" font-size="9">${escapeHtml(shown)}</text>
      ${dots}</g>`;
  }

  function paintSchematic() {
    const fault = getFault();
    const layout = sch._layout;
    if (!layout) return;
    const g = sch.querySelector("#physEdges");
    const day = clock.day;
    const parts = [];
    const groups = new Map();
    for (const { track, x, y } of layout.pos.flatMap((p) => trackList().filter((t) => t.neighborId === p.track.neighborId).map((track) => ({ track, x: p.x, y: p.y })))) {
      const key = track.neighborId;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ track, x, y });
    }
    for (const group of groups.values()) {
      group.forEach((item, k) => {
        const off = (k - (group.length - 1) / 2) * 6;
        const power = signedPower(fault, item.track.coupling.id, day);
        const pac = Math.abs(Number(sampleAc(fault, item.track.coupling.id, day)) || 0);
        const color = BRIGHT[item.track.coupling.domain] || "#9aa";
        const width = (1.2 + 4 * Math.sqrt(Math.min(1, pac / acScale(fault)))).toFixed(2);
        const forward = power >= 0;
        const x1 = forward ? layout.cx : item.x;
        const y1 = forward ? layout.cy + off : item.y;
        const x2 = forward ? item.x : layout.cx;
        const y2 = forward ? item.y : layout.cy + off;
        const dash = item.track.coupling.intent === "parasitic" ? 'stroke-dasharray="5 4"' : "";
        parts.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="${width}" ${dash} stroke-linecap="round"><title>${escapeHtml(item.track.coupling.id)} · P ${compact(power)} pu</title></line>`);
        parts.push(arrowHead(x2, y2, x1, y1, color));
      });
    }
    g.innerHTML = parts.join("");
  }

  function paint() {
    const fault = getFault();
    const asset = assetById[center];
    root.querySelector("#physTitle").textContent = `${asset.name} ${center}`;
    const ctx = sizeCanvas(canvas);
    if (!ctx) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const pad = { l: 42, r: 18, t: 30, b: 36 };
    const pw = w - pad.l - pad.r;
    const ph = h - pad.t - pad.b;
    const tMax = fault.assets[center].sigma.length;
    const xAt = (t) => pad.l + (t / tMax) * pw;
    const yAt = (s) => pad.t + ph - (Math.max(0, Math.min(YMAX, s)) / YMAX) * ph;
    ctx.clearRect(0, 0, w, h);
    const bounds = regimes();
    const active = regimeAt(clock.day);
    for (let i = 0; i < bounds.length - 1; i++) {
      const band = bounds[i];
      const x0 = xAt(band.t);
      const x1 = xAt(bounds[i + 1].t);
      ctx.fillStyle = bandFill(band.label);
      ctx.fillRect(x0, pad.t, x1 - x0, ph);
      if (band.label !== active) {
        ctx.fillStyle = "rgba(9,11,16,0.38)";
        ctx.fillRect(x0, pad.t, x1 - x0, ph);
      }
    }
    drawPhaseLabels(ctx, bounds, xAt);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const s of [0, 4, 10]) {
      const y = yAt(s);
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r, y);
      ctx.stroke();
      ctx.fillText(String(s), pad.l - 6, y);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.l, pad.t, pw, ph);
    ctx.clip();
    const damage = fault.assets[center].damage;
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1.8;
    let started = false;
    for (let d = 0; d < damage.length; d++) {
      const x = xAt(d + 0.5);
      if (d + 0.5 > clock.day) break;
      const y = yAt(10 * (1 - Math.max(0, Math.min(1, Number(damage[d])))));
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const tracks = trackList();
    tracks.forEach((track) => {
      const color = BRIGHT[track.coupling.domain] || "#9ab";
      const faded = pinned && pinned !== track.coupling.id;
      ctx.globalAlpha = faded ? 0.18 : 1;
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      let on = false;
      const band = fault.classic.band[noiseKey][track.portIndex];
      for (let d = 0; d < band.length; d++) {
        if (d + 0.5 > clock.day) break;
        const s = (band[d] - fault.classic.baselineMu[track.portIndex]) / fault.classic.baselineSd[track.portIndex];
        const x = xAt(d + 0.5);
        const y = yAt(s);
        if (!on) { ctx.moveTo(x, y); on = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
    ctx.restore();
    marks = [];
    tracks.forEach((track) => {
      const detected = detectIndex(track);
      if (detected == null || detected + 0.5 > clock.day) return;
      const s = sigmaAt(track, detected);
      const x = xAt(detected + 0.5);
      const y = yAt(s);
      const early = fault.damageEntryDay[center] == null || detected + 0.5 < fault.damageEntryDay[center];
      ctx.beginPath();
      ctx.fillStyle = early ? "#ffffff" : (BRIGHT[track.coupling.domain] || "#fff");
      ctx.arc(x, y, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = "#14161d";
      ctx.stroke();
      ctx.fillStyle = early ? "#fff" : (BRIGHT[track.coupling.domain] || "#fff");
      ctx.font = "10px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(track.neighborId, x + 6, y - 4);
      marks.push({ x, y, track, detected, sigma: s });
    });
    const warn = warningDay(fault, center);
    if (warn != null && clock.day >= warn) {
      const x = xAt(warn);
      ctx.strokeStyle = "#7dffaf";
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, pad.t + ph);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#7dffaf";
      ctx.font = "700 10px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("WARN", x + 4, pad.t + 16);
    }
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const tick of [0, 40, 80, 120, 160, 200]) {
      if (tick > tMax) continue;
      ctx.fillText(String(tick), xAt(tick), pad.t + ph + 4);
    }
    const events = [
      ["onset", fault.onsetDay],
      ["P", fault.damageEntryDay[center]],
      ["F", fault.failureDay[center]],
    ];
    events.forEach(([label, t]) => {
      if (t == null) return;
      ctx.fillStyle = label === "F" ? "#ff8d80" : "rgba(240,176,112,0.95)";
      ctx.fillText(label, xAt(t), pad.t + ph + 18);
    });
    const nowX = xAt(clock.day);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(nowX, pad.t);
    ctx.lineTo(nowX, pad.t + ph);
    ctx.stroke();
    const idx = dayIndex(clock.day, damage.length);
    const dmg = damage[idx];
    const sig = fault.assets[center].sigma[idx];
    const over = tracks.some((track) => sigmaAt(track, clock.day) > YMAX);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("C", pad.l + 4, yAt(10 * (1 - Math.max(0, Math.min(1, Number(dmg))))) - 4);
    root.querySelector("#physRegime").textContent = regimeAt(clock.day);
    root.querySelector("#physRead").innerHTML = `day <b>${clock.day.toFixed(2)}</b> · σ ${compact(sig)} · damage ${compact(dmg)}${over ? " · a track is above 12σ" : ""}`;
    paintSchematic();
  }

  canvas.addEventListener("mousemove", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = marks.find((m) => Math.abs(m.x - x) < 10 && Math.abs(m.y - y) < 10);
    if (!hit) { tip.hidden = true; return; }
    const nowS = sigmaAt(hit.track, clock.day);
    tip.hidden = false;
    tip.innerHTML = `<b>${hit.track.neighborId}</b> · ${hit.track.coupling.domain}
      <div class="sub">${escapeHtml(hit.track.coupling.id)}</div>
      <div>detect day ${hit.detected} · ${compact(hit.sigma)} σ</div>
      <div class="sub">now ${compact(nowS)} σ${nowS > YMAX ? " · above the axis" : ""}</div>`;
    tip.style.left = Math.min(rect.width - 200, hit.x + 12) + "px";
    tip.style.top = Math.max(8, hit.y - 54) + "px";
  });
  canvas.addEventListener("mouseleave", () => { tip.hidden = true; });
  canvas.addEventListener("click", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = marks.find((m) => Math.abs(m.x - x) < 10 && Math.abs(m.y - y) < 10);
    pinned = hit ? (pinned === hit.track.coupling.id ? null : hit.track.coupling.id) : null;
    paint();
  });

  const resize = new ResizeObserver(() => paint());
  resize.observe(canvas);
  clock.subscribe(() => paint());
  buildSchematic();

  return {
    setFault() { syncNoiseOptions(); buildSchematic(); paint(); },
    focusAsset(id) {
      if (!assetById[id]) return;
      center = id;
      assetSelect.value = id;
      buildSchematic();
      paint();
    },
  };
}

function warningDay(fault, assetId) {
  if (assetId !== fault.targetAssetId) return null;
  const days = ["FULL", "REDUCED", "LOCAL"]
    .map((name) => fault.warnings[name].alarmDay)
    .filter((d) => d != null);
  if (!days.length) return null;
  return Math.min(...days.map(Number));
}

function signedPower(fault, id, day) {
  const row = fault.couplings[id];
  if (!row) return 0;
  const i = dayIndex(day, row.powerDc.length);
  return Number(row.powerDc[i]) + Number(row.powerAc[i]);
}

function sampleAc(fault, id, day) {
  const row = fault.couplings[id];
  const i = dayIndex(day, row.powerAc.length);
  return row.powerAc[i];
}

function acScale(fault) {
  const row = fault.couplings[fault.boundaryCouplingId];
  let scale = 0;
  for (const v of row.powerAc) scale = Math.max(scale, Math.abs(Number(v)));
  return scale || 1;
}

const PHASE_SHORT = {
  NOMINAL: "NOM",
  TRANSIENT: "TRANS",
  "AFTER ONSET": "AFTER",
  "PRE-FAULT": "PRE",
  "TRADITIONAL P–F": "P–F",
  DAMAGE: "DMG",
  FAILED: "FAIL",
};

function drawPhaseLabels(ctx, bounds, xAt) {
  ctx.font = "10px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  const placed = [];
  const hits = (row, left, right) => placed.some((item) => item.row === row && right > item.left - 4 && left < item.right + 4);
  for (let i = 0; i < bounds.length - 1; i++) {
    const label = bounds[i].label;
    if (!label) continue;
    const x0 = xAt(bounds[i].t);
    const x1 = xAt(bounds[i + 1].t);
    const mid = (x0 + x1) / 2;
    const span = x1 - x0;
    let text = label;
    let width = ctx.measureText(text).width;
    if (width + 8 > span) {
      text = PHASE_SHORT[label] || label;
      width = ctx.measureText(text).width;
    }
    let left = mid - width / 2;
    let right = mid + width / 2;
    let row = hits(0, left, right) ? 1 : 0;
    if (hits(row, left, right) && text !== (PHASE_SHORT[label] || label)) {
      text = PHASE_SHORT[label] || label;
      width = ctx.measureText(text).width;
      left = mid - width / 2;
      right = mid + width / 2;
      row = hits(0, left, right) ? 1 : 0;
    }
    if (hits(row, left, right)) continue;
    placed.push({ left, right, row });
    ctx.fillText(text, mid, 2 + row * 13);
  }
}

function bandFill(label) {
  const map = {
    NOMINAL: "rgba(125,255,175,0.07)",
    TRANSIENT: "rgba(142,160,255,0.12)",
    "AFTER ONSET": "rgba(142,160,255,0.12)",
    "PRE-FAULT": "rgba(240,176,112,0.14)",
    "TRADITIONAL P–F": "rgba(255,91,77,0.14)",
    DAMAGE: "rgba(255,91,77,0.14)",
    FAILED: "rgba(255,91,77,0.22)",
  };
  return map[label] || "transparent";
}

function arrowHead(x2, y2, x1, y1, color) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const bx = x2 - ux * 36;
  const by = y2 - uy * 16;
  const px = -uy;
  const py = ux;
  const ax = bx;
  const ay = by;
  return `<path d="M ${ax.toFixed(1)} ${ay.toFixed(1)} L ${(ax - ux * 8 + px * 3.5).toFixed(1)} ${(ay - uy * 8 + py * 3.5).toFixed(1)} L ${(ax - ux * 8 - px * 3.5).toFixed(1)} ${(ay - uy * 8 - py * 3.5).toFixed(1)} Z" fill="${color}"/>`;
}

function sizeCanvas(canvas) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w < 20 || h < 20) return null;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
