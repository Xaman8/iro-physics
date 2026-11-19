import { text } from "./format.js";

const [data, v2] = await Promise.all([
  fetch("data/results.json").then((r) => r.json()),
  fetch("data/v2-results.json").then((r) => r.json()),
]);
const root = document.getElementById("results");
const methods = ["FULL", "REDUCED", "LOCAL", "LOCAL_DC"];
const methodName = {
  FULL: "Full model",
  REDUCED: "Reduced envelope",
  LOCAL: "Local band sensor",
  LOCAL_DC: "Local temperature and pressure",
};

const parts = [];
parts.push(`<p class="kicker">Study files</p><h1>What the runs found</h1>`);
parts.push(`<p class="note">Every figure below is the study figure. Every number is copied from the result files named in the page source. A dash is a null or a non-number in that file.</p>`);

parts.push(`<h2>v1 cross-envelope failure</h2>`);
parts.push(headlineTable(data.headline));
parts.push(errorTable(data.headline));
parts.push(truthNote(data.headline._truth, "With the deadband used in the headline study"));

parts.push(`<h2>Entropy generation by envelope</h2>`);
parts.push(`<p class="note">Per unit. “Added” is per unit pulsation amplitude squared at the pump fluid port. Cross-envelope couplings are listed on their own, not inside either envelope.</p>`);
parts.push(csvTable(data.entropy, [
  ["system", "Row"],
  ["name", "Name"],
  ["entropy_generation_nominal", "Nominal"],
  ["entropy_generation_added_per_pu2_pulsation", "Added per pu²"],
]));

for (const fig of data.figures) {
  if (fig.id === "fig1") parts.push(figure(fig));
}
parts.push(figure(data.figures.find((f) => f.id === "fig2")));

parts.push(`<h2>How far: propagation distance</h2>`);
parts.push(`<p class="note">Spearman rank correlation over the 90 source–target pairs, as stored. Within-source is the mean of the per-source correlations. Time to failure uses only the pairs that reach endurance.</p>`);
parts.push(distanceTable(data.distanceRank));
parts.push(`<h3>Pairs that move together</h3>`);
parts.push(`<p class="note">Off-diagonal entries in the redundancy file whose absolute correlation is at least 0.8. The value is the stored token.</p>`);
parts.push(`<div class="table-scroll"><table><thead><tr><th>Distance</th><th>Distance</th><th class="num">ρ</th></tr></thead><tbody>` +
  data.distanceRedundant.map((row) => `<tr><td>${text(row.a)}</td><td>${text(row.b)}</td><td class="num">${text(row.rho)}</td></tr>`).join("") +
  `</tbody></table></div>`);

const pair = data.headlinePair;
parts.push(`<h3>Pump pulsation to HX1</h3>`);
parts.push(`<p class="note">${text(pair.mechanism)} from ${text(pair.sourcePort)} (${text(pair.source)}) to ${text(pair.targetPort)}. Band ${text(pair.band)} rad/s. Effect (added entropy generation at the target per unit power at the source) ${text(pair.effectTransferRatio)}. Damage-region entry ${text(pair.damageRegionEntryDays)} days. Time to failure ${text(pair.timeToFailureDays)} days.</p>`);
parts.push(`<dl class="pair">` + Object.entries(pair.distances).map(([key, value]) =>
  `<div><dt>${key}</dt><dd>${text(value)}</dd></div>`
).join("") + `</dl>`);
parts.push(figure(data.figures.find((f) => f.id === "fig3")));

parts.push(`<h2>Sensor noise</h2>`);
parts.push(`<p class="note">The same headline test as band-sensor noise rises. Each level is a separate block in the noise file. Lead time and delay are medians, in days.</p>`);
parts.push(noiseTable(data.noise));

parts.push(`<h2>Convergent excitation</h2>`);
parts.push(`<p class="note">Correct calls are true positives plus true negatives. True negatives are n minus the true exceedances minus the false positives, which is the count printed on the figure. Damage is the median on the combined response. The per-source sum is the median of the damages added source by source.</p>`);
parts.push(convergentTable(data.convergent));
parts.push(figure(data.figures.find((f) => f.id === "fig4")));

parts.push(`<h2>Port directionality checks</h2>`);
parts.push(`<p class="note">Excursion hours stored on the two checks that dropped a directionality constraint, or ran it without a deadband. The headline study’s own excursion hours are in the first table’s note.</p>`);
parts.push(directionTable("No deadband", data.directionalityNoDeadband));
parts.push(directionTable("R1.fluid held target-only", data.directionalityR1TargetOnly));

parts.push(`<h2>v2 failure test</h2>`);
parts.push(`<p class="note">v2 names a cause by fitting which single source port, through the plant transfer maps, best explains the effort-sensor readings in one DC channel plus five known line-frequency bands. Forecast damage then picks the cause. Port power is only a tie-break. v1 used port power directly. The derivative charts on the Apparatus page are display only and are never used for attribution.</p>`);
parts.push(`<p class="note">Tokens from results/failure_table.csv (SAFE_FACTOR 2.0, 20 runs). An empty cell is an empty field in that file. Cross-envelope counts are from failure_summary.json and count true failures whose source and failing asset sit in different envelopes.</p>`);
parts.push(csvTable(v2.failureTable, [
  ["scenario", "Scenario"],
  ["predictor", "Predictor"],
  ["runs", "Runs"],
  ["true_failures", "True failures"],
  ["warned", "Warned"],
  ["lead_median_d", "Lead median (d)"],
  ["lead_IQR_d", "Lead IQR (d)"],
  ["failing_asset_correct", "Failing asset"],
  ["root_cause_correct", "Root cause"],
  ["ttf_error_median_d", "TTF error (d)"],
  ["alarms_no_failure", "Alarms, no failure"],
  ["alarms_before_onset", "Alarms before onset"],
]));
parts.push(`<p class="note">Cross-envelope true failures, discovered envelopes: ${crossLine(v2, "discovered")}. Engineer grouping: ${crossLine(v2, "engineer")}.</p>`);
parts.push(`<h3>SAFE_FACTOR 1.5, 20 runs</h3>`);
parts.push(`<p class="note">results/failure_table_sf1.5.csv</p>`);
parts.push(csvTable(v2.failureTableSf15, [
  ["scenario", "Scenario"], ["predictor", "Predictor"], ["true_failures", "True failures"],
  ["warned", "Warned"], ["lead_median_d", "Lead median (d)"], ["root_cause_correct", "Root cause"],
  ["alarms_no_failure", "Alarms, no failure"],
]));
parts.push(`<h3>SAFE_FACTOR 3.0, 20 runs</h3>`);
parts.push(`<p class="note">results/failure_table_sf3.csv</p>`);
parts.push(csvTable(v2.failureTableSf3, [
  ["scenario", "Scenario"], ["predictor", "Predictor"], ["true_failures", "True failures"],
  ["warned", "Warned"], ["lead_median_d", "Lead median (d)"], ["failing_asset_correct", "Failing asset"],
  ["root_cause_correct", "Root cause"], ["alarms_no_failure", "Alarms, no failure"],
]));
parts.push(`<h2>v2 propagation distance</h2>`);
parts.push(`<p class="note">Spearman against log effect, from distance_rank_correlations.csv. Attenuation is reported with the study’s own caveat that it is partly circular.</p>`);
parts.push(csvTable(v2.distanceRank, [
  ["distance", "Distance"],
  ["rho_pooled", "ρ pooled"],
  ["p_pooled", "p"],
  ["rho_within_mean", "ρ within source"],
  ["rho_within_min", "within min"],
  ["rho_within_max", "within max"],
  ["n_sources", "sources"],
]));
parts.push(`<figure class="plate"><img src="assets/figures/fig1_discovered_envelopes.png" alt="Discovered envelopes"><figcaption><h2>Discovered envelopes</h2><p>Coupling graph of the 32-asset plant, coloured by the 7 KCw1-louvain envelopes that the selection rule picked after the 2026-11-19 red-team fixes. Thick lines are couplings inside an envelope. Dotted lines are parasitic paths.</p></figcaption></figure>`);
parts.push(`<figure class="plate"><img src="assets/figures/fig2_root_cause_false_alarms.png" alt="Root cause and false alarms"><figcaption><h2>Root cause and alarms</h2><p>Share of warned runs with the correct root cause, and share of no-fault runs with an alarm, by predictor. The counts are in the table above.</p></figcaption></figure>`);

root.innerHTML = parts.join("\n");

function crossLine(block, which) {
  return ["F1", "F2", "F3", "F4", "F5", "C0"].map((sc) => {
    const row = block.crossEnvelope[`${sc}:_cross_envelope_${which}`];
    if (!row) return `${sc} —`;
    return `${sc} ${row.n_cross}/${row.n}`;
  }).join("; ");
}

function figure(fig) {
  return `<figure class="plate">
    <img src="${fig.file}" alt="${fig.title}">
    <figcaption><h2>${fig.title}</h2><p>${fig.caption}</p></figcaption>
  </figure>`;
}

function headlineTable(block) {
  const head = `<tr><th>Reading</th><th class="num">Runs</th><th class="num">Warned</th><th class="num">Lead time median</th><th class="num">IQR low</th><th class="num">IQR high</th><th class="num">Detection delay</th><th>Root cause A</th><th>Failing item HX1</th><th class="num">False alarms</th></tr>`;
  const body = methods.map((name) => {
    const row = block[name];
    const iqr = row.lead_time_days_iqr || [null, null];
    return `<tr>
      <td>${methodName[name]}</td>
      <td class="num">${text(row.mechanism_runs_with_target_failure)}</td>
      <td class="num">${text(row.warned_before_failure)}</td>
      <td class="num">${text(row.lead_time_days_median)}</td>
      <td class="num">${text(iqr[0])}</td>
      <td class="num">${text(iqr[1])}</td>
      <td class="num">${text(row.detection_delay_after_onset_days_median)}</td>
      <td class="num">${text(row.root_cause_SYS_A_correct)}</td>
      <td class="num">${text(row.failing_item_HX1_correct)}</td>
      <td class="num">${text(row.no_mechanism_runs_with_alarm)} / ${text(row.no_mechanism_runs)}</td>
    </tr>`;
  }).join("");
  return `<div class="table-scroll"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

function errorTable(block) {
  const horizons = [60, 30, 14, 7];
  const head = `<tr><th>Reading</th><th>RUL horizon</th><th class="num">n</th><th class="num">No failure predicted</th><th class="num">Median signed error (days)</th><th class="num">MAE (days)</th></tr>`;
  const body = methods.flatMap((name) => horizons.map((h) => {
    const row = block[name][`tstar_error_days_at_RUL_${h}d`];
    return `<tr>
      <td>${methodName[name]}</td>
      <td class="num">${h} d</td>
      <td class="num">${text(row.n)}</td>
      <td class="num">${text(row.n_no_failure_predicted)}</td>
      <td class="num">${text(row.median_signed)}</td>
      <td class="num">${text(row.MAE)}</td>
    </tr>`;
  })).join("");
  return `<h3>Error in the predicted failure day</h3><div class="table-scroll"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

function truthNote(truth, title) {
  const first = Object.entries(truth.first_failing_item_in_mechanism_runs).map(([k, v]) => `${k}: ${v}`).join(", ");
  const hours = Object.entries(truth.port_directionality_excursion_hours_total).map(([k, v]) => `${k} ${v}`).join("; ");
  return `<p class="note">${title}. First failing item: ${first}. Runs without the mechanism that still failed: ${text(truth.no_mechanism_runs_with_a_true_failure)}. Directionality excursion hours: ${hours}.</p>`;
}

function csvTable(rows, columns) {
  const head = `<tr>${columns.map(([, label]) => `<th>${label}</th>`).join("")}</tr>`;
  const body = rows.map((row) => `<tr>${columns.map(([key]) => `<td class="num">${text(row[key])}</td>`).join("")}</tr>`).join("");
  return `<div class="table-scroll"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

function distanceTable(rows) {
  const cols = [
    ["distance", "Distance"],
    ["effect_transfer_ratio", "ρ effect"],
    ["effect_transfer_ratio_p", "p"],
    ["effect_transfer_ratio_n", "n"],
    ["effect_transfer_ratio_within_source_mean", "ρ within source"],
    ["time_to_failure_d", "ρ time to failure"],
    ["time_to_failure_d_p", "p"],
    ["time_to_failure_d_n", "n"],
  ];
  return csvTable(rows, cols);
}

function noiseTable(block) {
  const levels = Object.keys(block).sort((a, b) => Number(a) - Number(b));
  const head = `<tr><th class="num">Noise (pu)</th><th>Reading</th><th class="num">Warned</th><th class="num">Lead time median</th><th class="num">Detection delay</th><th>Root cause A</th><th class="num">MAE at RUL 30 d</th></tr>`;
  const body = levels.flatMap((level) => methods.map((name) => {
    const row = block[level][name];
    const mae = row.tstar_error_days_at_RUL_30d;
    return `<tr>
      <td class="num">${text(level)}</td>
      <td>${methodName[name]}</td>
      <td class="num">${text(row.warned_before_failure)}/${text(row.mechanism_runs_with_target_failure)}</td>
      <td class="num">${text(row.lead_time_days_median)}</td>
      <td class="num">${text(row.detection_delay_after_onset_days_median)}</td>
      <td class="num">${text(row.root_cause_SYS_A_correct)}</td>
      <td class="num">${text(mae.MAE)}</td>
    </tr>`;
  })).join("");
  return `<div class="table-scroll"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

function convergentTable(block) {
  const cases = ["C0", "C1", "C2a", "C2b", "C3a", "C3b", "C3n"];
  const preds = ["FULL", "FULL_LINEAR", "REDUCED_SPEC", "REDUCED_POWER", "ZMAP_COMPLEX", "ZMAP_ABS"];
  const head = `<tr><th>Case</th><th class="num">n</th><th class="num">True exceed</th><th class="num">Damage, combined</th><th class="num">Sum of per-source damage</th>` +
    preds.map((p) => `<th class="num">${p}</th>`).join("") + `</tr>`;
  const body = cases.map((name) => {
    const row = block[name];
    const cells = preds.map((pred) => {
      const item = row[pred];
      const tn = row.n - row.true_exceed - item.false_pos;
      const correct = item.true_pos + tn;
      return `<td class="num">${correct}/${row.n}<br>fp ${item.false_pos} · miss ${item.missed}</td>`;
    }).join("");
    return `<tr><td>${name}</td><td class="num">${text(row.n)}</td><td class="num">${text(row.true_exceed)}</td><td class="num">${text(row.D_true_median)}</td><td class="num">${text(row.D_sum_per_source_median)}</td>${cells}</tr>`;
  }).join("");
  return `<div class="table-scroll"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

function directionTable(title, truth) {
  const rows = Object.entries(truth.port_directionality_excursion_hours_total).map(([key, hours]) =>
    `<tr><td>${text(key)}</td><td class="num">${text(hours)}</td></tr>`
  ).join("");
  return `<h3>${title}</h3><div class="table-scroll"><table><thead><tr><th>Port</th><th class="num">Excursion hours</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
