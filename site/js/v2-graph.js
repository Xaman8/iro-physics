const COLORS = ["#e7d7a1", "#d5ead4", "#f6d7c8", "#d5e2f4", "#eadcf2"];

export function mountV2(graphHost, detailHost, plant) {
  const envById = Object.fromEntries(plant.envelopes.map((env, i) => [env.id, { ...env, color: COLORS[i % COLORS.length] }]));
  const assetById = Object.fromEntries(plant.assets.map((asset) => [asset.id, asset]));
  let selected = plant.envelopes[0].id;

  graphHost.innerHTML = `<div class="v2-note">${plant.note} Click an envelope.</div><div id="v2svg"></div>`;
  const stage = graphHost.querySelector("#v2svg");

  function draw() {
    const xs = plant.assets.map((a) => a.x_m);
    const ys = plant.assets.map((a) => a.y_m);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const W = 760;
    const H = 520;
    const pad = 36;
    const sx = (x) => pad + ((x - minX) / (maxX - minX || 1)) * (W - pad * 2);
    const sy = (y) => pad + ((maxY - y) / (maxY - minY || 1)) * (H - pad * 2);
    const pos = Object.fromEntries(plant.assets.map((a) => [a.id, { x: sx(a.x_m), y: sy(a.y_m) }]));
    const edges = plant.couplings.map((c) => {
      const a = pos[c.sourceAssetId];
      const b = pos[c.targetAssetId];
      const on = c.sourceEnvelopeId === selected || c.targetEnvelopeId === selected;
      const color = c.boundary ? "#9a3412" : "#8a8276";
      return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${color}" stroke-width="${c.boundary ? 1.6 : 1}" opacity="${on ? 0.9 : 0.35}" ${c.intent === "parasitic" ? 'stroke-dasharray="4 3"' : ""}><title>${c.id}</title></line>`;
    }).join("");
    const placed = [];
    const nodes = plant.assets.map((a) => {
      const p = pos[a.id];
      const env = envById[a.envelopeId];
      const on = a.envelopeId === selected;
      let ly = p.y - 14;
      while (placed.some((q) => Math.hypot(q.x - p.x, q.y - ly) < 11)) ly += 11;
      placed.push({ x: p.x, y: ly });
      return `<g data-env="${a.envelopeId}" style="cursor:pointer">
        <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${on ? 11 : 8}" fill="${env.color}" stroke="${on ? "#1c1915" : "rgba(28,25,21,0.35)"}" stroke-width="${on ? 1.6 : 1}"></circle>
        <text x="${(p.x + 12).toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="start" font-size="10" fill="#1c1915">${a.id}</text>
      </g>`;
    }).join("");
    stage.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="v2 discovered envelopes">${edges}${nodes}</svg>`;
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
      <ul>${links.map((c) => `<li><span class="chip">${c.id}</span> ${c.intent === "parasitic" ? "parasitic" : c.domain}</li>`).join("")}</ul>`;
  }

  draw();
  show();
}
