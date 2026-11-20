export const DOMAIN = {
  mechanical: "#1f7a4d",
  fluid: "#1a6fa8",
  thermal: "#c45c26",
  electrical: "#8a6d12",
  chemical: "#6b3fa0",
};

export function domainLabel(name) {
  return name === "chemical" ? "chemical (v3 port not physical)" : name;
}

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

export function labelOf(item) {
  if (!item) return "";
  if (item.kind === "plant") return "Plant";
  return item.id;
}

export function siblingEdges(parent, byId, couplings) {
  const listed = couplings?.sibling_edges?.[parent.id];
  if (Array.isArray(listed) && listed.length) return listed;
  const kids = new Set(parent.children || []);
  const seen = new Set();
  const edges = [];
  for (const id of parent.children || []) {
    const child = byId[id];
    if (!child) continue;
    for (const port of child.boundary_ports || []) {
      for (const far of port.coupled_to || []) {
        if (!kids.has(far.other_node)) continue;
        const key = `${[id, far.other_node].sort().join("|")}|${port.domain}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({
          a: id,
          b: far.other_node,
          domain: port.domain,
          dc_power_MW_a_to_b: far.dc_power_MW,
          n_links: 1,
          links: far.link ? [far.link] : [],
        });
      }
    }
  }
  return edges;
}

export function mountEnvelopeNav(host, { showAssets = false, onSelect } = {}) {
  host.innerHTML = `
    <div class="seg" role="group" aria-label="Hierarchy">
      <button type="button" class="btn" data-tree="designed" aria-pressed="true">Designed</button>
      <button type="button" class="btn" data-tree="discovered" aria-pressed="false">Discovered</button>
    </div>
    <div class="nav-tree" data-nav-tree></div>`;
  const treeEl = host.querySelector("[data-nav-tree]");
  const packs = {};
  let mode = "designed";
  let parentId = "PLANT";
  const expanded = new Set(["PLANT"]);

  function pack() { return packs[mode]; }
  function node(id) { return pack()?.byId?.[id]; }

  function kidsOf(id) {
    const item = node(id);
    const ids = item?.children || [];
    if (showAssets) return ids.filter((child) => node(child));
    return ids.filter((child) => node(child) && node(child).kind !== "asset");
  }

  function snapshot() {
    const data = pack();
    return { mode, byId: data.byId, boundary: data.boundary, meta: data.meta };
  }

  async function load(next) {
    if (packs[next]) return;
    const file = next === "designed" ? "data/v3/hierarchy.json" : "data/v3/hierarchy_discovered.json";
    const response = await fetch(file);
    if (!response.ok) throw new Error(`Missing ${file}`);
    const data = await response.json();
    packs[next] = {
      byId: Object.fromEntries(data.nodes.map((item) => [item.id, item])),
      boundary: data.plant_boundary || [],
      meta: data.meta || {},
    };
  }

  function renderBranch(id) {
    const item = node(id);
    if (!item) return "";
    const kids = kidsOf(id);
    const open = expanded.has(id) && kids.length;
    const current = id === parentId;
    const twist = kids.length
      ? `<button type="button" class="twist" data-twist="${esc(id)}" aria-expanded="${open ? "true" : "false"}" aria-label="${open ? "Collapse" : "Expand"} ${esc(labelOf(item))}">${open ? "▾" : "▸"}</button>`
      : `<span class="twist leaf"></span>`;
    const nested = open ? `<ul class="nav-list">${kids.map((child) => renderBranch(child)).join("")}</ul>` : "";
    return `<li>${twist}<button type="button" class="nav-pick" data-pick="${esc(id)}" aria-current="${current ? "true" : "false"}" title="${esc(item.name || item.id)}">${esc(labelOf(item))}</button>${nested}</li>`;
  }

  function render() {
    treeEl.innerHTML = `<ul class="nav-list">${renderBranch("PLANT")}</ul>`;
    host.querySelectorAll("[data-tree]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.tree === mode));
    });
  }

  function select(id, { silent = false } = {}) {
    if (!node(id)) return;
    parentId = id;
    let current = node(id);
    while (current) {
      if (current.kind !== "asset") expanded.add(current.id);
      current = current.parent ? node(current.parent) : null;
    }
    render();
    const picked = host.querySelector(`[data-pick="${CSS.escape(id)}"]`);
    picked?.scrollIntoView({ block: "nearest" });
    if (!silent) onSelect?.(id, snapshot());
  }

  async function setMode(next) {
    if (!packs[next] && next === "discovered") {
      try { await load("discovered"); }
      catch { return; }
    }
    mode = next;
    expanded.clear();
    expanded.add("PLANT");
    select("PLANT");
  }

  host.addEventListener("click", (event) => {
    const treeBtn = event.target.closest("[data-tree]");
    if (treeBtn) { setMode(treeBtn.dataset.tree); return; }
    const twist = event.target.closest("[data-twist]");
    if (twist) {
      const id = twist.dataset.twist;
      if (expanded.has(id)) expanded.delete(id);
      else expanded.add(id);
      render();
      return;
    }
    const pick = event.target.closest("[data-pick]");
    if (pick) select(pick.dataset.pick);
  });

  return {
    start() { return load("designed").then(() => select("PLANT")); },
    select,
    node(id) { return node(id); },
    snapshot,
  };
}
