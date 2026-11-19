import { compact, dayIndex } from "./format.js";

const DOMAIN = {
  mechanical: "#1f7a4d",
  fluid: "#1a6fa8",
  thermal: "#c45c26",
  electrical: "#8a6d12",
};
const ENV_FILL = {
  SYS_D: "#f6f0dc",
  SYS_A: "#e7f2e6",
  SYS_B: "#f8e7dc",
  SYS_C: "#e6eef8",
};

export function mountEnvelope(root, { plant, scenario, getFault, clock, initialMode = "grouped" }) {
  const assetById = Object.fromEntries(plant.assets.map((a) => [a.id, a]));
  root.innerHTML = `
    <div class="pane-scroll">
      <div class="env-head">
        <h2>Envelope physics</h2>
        <p class="honest">Envelopes hold the assets. A port is a dot. A coupling is the line between ports, and its width follows power, P = e·f. Entropy generation fills the bar. The limit is entropic endurance.</p>
      </div>
      <div class="env-tools">
        <label>View <select id="envMode">
          <option value="grouped">Assets in envelopes</option>
          <option value="reduced">Envelope as one asset</option>
        </select></label>
      </div>
      <div class="legend" id="envLegend"></div>
      <div class="env-stage" id="envStage">
        <svg class="env-svg" id="envSvg"></svg>
        <div class="env-cols" id="envCols"></div>
      </div>
      <div class="below">
        <div class="deriv-head">
          <label>Instrument <select id="envInstrument"></select></label>
          <p>0th to 3rd order. Orders 1–3 are finite differences of the daily mean, per day.</p>
        </div>
        <div class="deriv-grid" id="envDeriv"></div>
        <div class="warn-grid" id="envWarn"></div>
        <p class="local-dc" id="envLocalDc"></p>
      </div>
    </div>`;

  const stage = root.querySelector("#envStage");
  const cols = root.querySelector("#envCols");
  const svg = root.querySelector("#envSvg");
  const modeSelect = root.querySelector("#envMode");
  const instrumentSelect = root.querySelector("#envInstrument");
  let mode = initialMode === "reduced" ? "reduced" : "grouped";
  let instrument = 0;
  let derivs = [];

  root.querySelector("#envLegend").innerHTML = plant.domains.map((d) =>
    `<span><i style="background:${DOMAIN[d.id]}"></i>${d.id}</span>`
  ).join("");

  modeSelect.value = mode;
  modeSelect.addEventListener("change", () => {
    mode = modeSelect.value;
    build();
    paint();
  });

  function buildInstruments() {
    const fault = getFault();
    instrumentSelect.innerHTML = fault.instruments.map((item, i) =>
      `<option value="${i}">${escapeHtml(item.label)}</option>`
    ).join("");
    instrument = Math.min(instrument, fault.instruments.length - 1);
    instrumentSelect.value = String(instrument);
    derivs = fault.instruments.map((item) => {
      const y = item.series.map(Number);
      const d1 = gradient(y);
      const d2 = gradient(d1);
      const d3 = gradient(d2);
      return [y, d1, d2, d3];
    });
    const orders = ["0th order", "1st order", "2nd order", "3rd order"];
    root.querySelector("#envDeriv").innerHTML = orders.map((label, i) => `
      <figure>
        <figcaption><b>${label}</b><span data-deriv="${i}"></span></figcaption>
        <canvas data-order="${i}"></canvas>
      </figure>`).join("");
  }

  function build() {
    const fault = getFault();
    const leaves = plant.envelopes.filter((e) => e.leaf).slice().sort((a, b) => meanX(a, assetById) - meanX(b, assetById));
    cols.innerHTML = leaves.map((env) => {
      const fill = ENV_FILL[env.id] || "#f4f1ea";
      if (mode === "reduced") {
        const ports = boundaryPorts(env.id);
        return `<section class="env-col" data-env="${env.id}" data-fill="${fill}">
          <header><b>${env.short}</b> ${escapeHtml(env.name)}</header>
          <div class="env-stack">
            <article class="asset" data-env-card="${env.id}">
              <header><b>${env.short}</b><span>envelope</span></header>
              <div class="ports">${ports.map(portDot).join("")}</div>
              <div class="meter" title="Sum of entropy generation, divided by the sum of Safe limits"><i data-sum="${env.id}"></i></div>
              <span class="nums" data-env-nums="${env.id}"></span>
            </article>
          </div>
        </section>`;
      }
      const assets = env.assetIds.slice().sort((a, b) => {
        const A = assetById[a], B = assetById[b];
        return A.y_m - B.y_m || A.x_m - B.x_m;
      });
      return `<section class="env-col" data-env="${env.id}" data-fill="${fill}">
        <header><b>${env.short}</b> ${escapeHtml(env.name)}</header>
        <div class="env-stack">
          ${assets.map((id) => assetCard(id)).join("")}
        </div>
      </section>`;
    }).join("");
    buildWires(fault);
  }

  function assetCard(id) {
    const asset = assetById[id];
    const ports = plant.ports.filter((p) => p.assetId === id);
    return `<article class="asset" data-asset="${id}" title="${escapeHtml(asset.name)}">
      <header><b>${id}</b></header>
      <div class="ports">${ports.map(portDot).join("")}</div>
      <div class="meter" title="Entropy generation against the Safe limit"><i data-meter="${id}"></i></div>
      <span class="nums" data-nums="${id}"></span>
    </article>`;
  }

  function portDot(port) {
    const id = typeof port === "string" ? port : port.id;
    const domain = typeof port === "string"
      ? plant.ports.find((p) => p.id === port).domain
      : port.domain;
    return `<i class="port" data-port="${id}" style="background:${DOMAIN[domain]}" title="${escapeHtml(id)}"></i>`;
  }

  function boundaryPorts(envelopeId) {
    const ids = [];
    for (const c of plant.couplings) {
      if (!c.boundary) continue;
      if (c.sourceEnvelopeId === envelopeId) ids.push(c.sourcePortId);
      if (c.targetEnvelopeId === envelopeId) ids.push(c.targetPortId);
    }
    return [...new Set(ids)].map((id) => plant.ports.find((p) => p.id === id));
  }

  function buildWires(fault) {
    const list = mode === "reduced" ? plant.couplings.filter((c) => c.boundary) : plant.couplings;
    svg.innerHTML = list.map((c, i) =>
      `<path data-wire="${c.id}" fill="none" stroke-linecap="round"></path>`
    ).join("") + `<g id="envArrows"></g>`;
    svg._wires = list;
  }

  function paint() {
    const fault = getFault();
    const day = clock.day;
    if (mode === "grouped") paintAssets(fault, day);
    else paintReduced(fault, day);
    paintWires(fault, day);
    paintDeriv(fault, day);
    paintWarnings(fault, day);
  }

  function paintAssets(fault, day) {
    for (const asset of plant.assets) {
      const card = cols.querySelector(`[data-asset="${asset.id}"]`);
      if (!card) continue;
      const row = fault.assets[asset.id];
      const i = dayIndex(day, row.sigma.length);
      const sigma = Number(row.sigma[i]);
      const safe = Number(row.safe[i]);
      const damage = Number(row.damage[i]);
      const failed = fault.failureDay[asset.id] != null && day >= fault.failureDay[asset.id];
      card.classList.toggle("at-limit", failed);
      const meter = card.querySelector("[data-meter]");
      const region = sigma <= asset.limits.design ? "design" : sigma <= safe ? "safe" : "damage";
      meter.style.width = Math.min(100, (sigma / safe) * 100) + "%";
      meter.className = "region-" + region;
      const nums = card.querySelector("[data-nums]");
      const limit = failed ? " · limit" : "";
      nums.textContent = `σ ${compact(sigma)}${damage > 0.0005 || failed ? " · damage " + compact(damage) : ""}${limit}`;
    }
  }

  function paintReduced(fault, day) {
    for (const env of plant.envelopes) {
      const nums = cols.querySelector(`[data-env-nums="${env.id}"]`);
      const bar = cols.querySelector(`[data-sum="${env.id}"]`);
      const card = cols.querySelector(`[data-env-card="${env.id}"]`);
      if (!nums || !bar) continue;
      let sigma = 0;
      let safe = 0;
      let worst = null;
      for (const id of env.assetIds) {
        const row = fault.assets[id];
        const i = dayIndex(day, row.sigma.length);
        sigma += Number(row.sigma[i]);
        safe += Number(row.safe[i]);
        if (fault.failureDay[id] != null && day >= fault.failureDay[id]) worst = id;
      }
      bar.style.width = Math.min(100, (sigma / safe) * 100) + "%";
      card.classList.toggle("at-limit", Boolean(worst));
      nums.textContent = worst ? `${worst} at the limit` : `σ ${compact(sigma)}`;
    }
  }

  function paintWires(fault, day) {
    const scale = acScale(fault);
    const rect = stage.getBoundingClientRect();
    const backs = [...cols.querySelectorAll(".env-col")].map((col) => {
      const r = col.getBoundingClientRect();
      const x = r.left - rect.left;
      const y = r.top - rect.top;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${r.width.toFixed(1)}" height="${r.height.toFixed(1)}" rx="12" fill="${col.dataset.fill}"></rect>`;
    }).join("");
    const paths = [];
    const arrows = [];
    for (const coupling of svg._wires || []) {
      const a = pointOf(coupling.sourcePortId, rect);
      const b = pointOf(coupling.targetPortId, rect);
      if (!a || !b) continue;
      const row = fault.couplings[coupling.id];
      const i = dayIndex(day, row.powerDc.length);
      const power = Number(row.powerDc[i]) + Number(row.powerAc[i]);
      const width = 1.15 + 8 * Math.sqrt(Math.min(1.4, Math.abs(power) / (scale * 1.2 + 0.05)));
      const forward = power >= 0;
      const bow = coupling.boundary ? -14 : 0;
      const from = forward ? a : b;
      const to = forward ? b : a;
      const dash = coupling.intent === "parasitic" ? ' stroke-dasharray="4 4"' : "";
      const title = `${coupling.id} · P ${compact(power)} pu`;
      paths.push(`<path d="${curve(from, to, bow)}" fill="none" stroke="${DOMAIN[coupling.domain]}" stroke-width="${width.toFixed(2)}" stroke-linecap="round" opacity="${coupling.boundary ? 0.95 : 0.7}"${dash}><title>${escapeHtml(title)}</title></path>`);
      if (Math.abs(power) > 1e-3) arrows.push(arrow(to, from, DOMAIN[coupling.domain]));
    }
    svg.innerHTML = backs + paths.join("") + arrows.join("");
  }

  function pointOf(portId, rect) {
    const el = [...stage.querySelectorAll("[data-port]")].find((node) => node.dataset.port === portId);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: r.left - rect.left + r.width / 2,
      y: r.top - rect.top + r.height / 2,
    };
  }

  function paintDeriv(fault, day) {
    const orders = derivs[instrument];
    if (!orders) return;
    const idx = dayIndex(day, orders[0].length);
    orders.forEach((series, order) => {
      const canvas = root.querySelector(`canvas[data-order="${order}"]`);
      const ctx = sizeCanvas(canvas, 72);
      if (!ctx) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      let lo = Infinity, hi = -Infinity;
      for (const v of series) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (lo === hi) { lo -= 1; hi += 1; }
      const pad = 4;
      const xAt = (i) => pad + (i / (series.length - 1)) * (w - pad * 2);
      const yAt = (v) => pad + (1 - (v - lo) / (hi - lo)) * (h - pad * 2);
      ctx.beginPath();
      ctx.strokeStyle = "#0f5c56";
      ctx.lineWidth = 1.4;
      let drawn = false;
      series.forEach((v, i) => {
        if (i > idx) return;
        const x = xAt(i);
        const y = yAt(v);
        if (!drawn) { ctx.moveTo(x, y); drawn = true; } else ctx.lineTo(x, y);
      });
      ctx.stroke();
      const x = xAt(idx);
      ctx.strokeStyle = "#9f1239";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, pad);
      ctx.lineTo(x, h - pad);
      ctx.stroke();
      ctx.fillStyle = "#8a8276";
      ctx.font = "10px ui-monospace, monospace";
      ctx.textBaseline = "top";
      ctx.fillText(compact(hi), pad, 0);
      ctx.textBaseline = "bottom";
      ctx.fillText(compact(lo), pad, h);
      root.querySelector(`[data-deriv="${order}"]`).textContent = compact(series[idx]);
    });
  }

  function paintWarnings(fault, day) {
    const names = [
      ["FULL", "Full model"],
      ["REDUCED", "Reduced envelope"],
      ["LOCAL", "Local band sensor"],
    ];
    root.querySelector("#envWarn").innerHTML = names.map(([key, label]) => {
      const block = fault.warnings[key];
      const fired = block.alarmDay != null && day >= Number(block.alarmDay);
      if (!fired) {
        return `<article class="warn"><h3>${label}</h3><p>No warning yet</p></article>`;
      }
      return `<article class="warn fired"><h3>${label}</h3>
        <p>Warned day ${block.alarmDay}</p>
        <p>Failing item ${block.failingItem}</p>
        <p class="cause">${escapeHtml(block.rootCause || "—")}</p>
        <p>Lead ${block.leadTimeDays} days</p></article>`;
    }).join("");
    const dc = fault.warnings.LOCAL_DC;
    const el = root.querySelector("#envLocalDc");
    if (dc.alarmDay == null) {
      el.textContent = "Conventional temperature and pressure, no band sensor: no warning in this run.";
    } else if (day >= Number(dc.alarmDay)) {
      el.textContent = `Conventional temperature and pressure warned on day ${dc.alarmDay}. Root cause ${dc.rootCause}.`;
    } else {
      el.textContent = "Conventional temperature and pressure: no warning yet.";
    }
  }

  instrumentSelect.addEventListener("change", () => {
    instrument = Number(instrumentSelect.value);
    paint();
  });

  const resize = new ResizeObserver(() => paint());
  resize.observe(stage);
  clock.subscribe(() => paint());

  return {
    setFault() {
      buildInstruments();
      build();
      paint();
    },
  };
}

function meanX(env, assetById) {
  const xs = env.assetIds.map((id) => assetById[id].x_m);
  return xs.reduce((sum, x) => sum + x, 0) / xs.length;
}

function curve(a, b, bow) {
  const mx = (a.x + b.x) / 2;
  const my = Math.min(a.y, b.y) + bow;
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

function arrow(to, from, color) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const back = 14;
  const x = to.x - ux * back;
  const y = to.y - uy * back;
  return `<path d="M ${to.x.toFixed(1)} ${to.y.toFixed(1)} L ${(x + px * 4).toFixed(1)} ${(y + py * 4).toFixed(1)} L ${(x - px * 4).toFixed(1)} ${(y - py * 4).toFixed(1)} Z" fill="${color}"/>`;
}

function gradient(y) {
  const n = y.length;
  const g = new Array(n);
  if (n < 2) return y.slice();
  g[0] = y[1] - y[0];
  g[n - 1] = y[n - 1] - y[n - 2];
  for (let i = 1; i < n - 1; i++) g[i] = (y[i + 1] - y[i - 1]) / 2;
  return g;
}

function acScale(fault) {
  const row = fault.couplings[fault.boundaryCouplingId];
  let scale = 0;
  for (const v of row.powerAc) scale = Math.max(scale, Math.abs(Number(v)));
  return scale || 1;
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function sizeCanvas(canvas, minH) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight || minH;
  if (w < 20) return null;
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
