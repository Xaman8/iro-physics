import { text } from "./format.js";

const [v1, v2] = await Promise.all([
  fetch("data/results.json").then((r) => r.json()),
  fetch("data/v2-results.json").then((r) => r.json()),
]);

const cell = (scenario, predictor, field) => {
  const row = v2.failureTable.find((item) => item.scenario === scenario && item.predictor === predictor);
  return row ? text(row[field]) : "—";
};
const topo = v2.modularityNull.topology;
const pf = v2.modularityNull.PF;
const kc = v2.pfLouvainKc;
const full = v1.headline.FULL;
const reduced = v1.headline.REDUCED;
const local = v1.headline.LOCAL;

const cards = [
  {
    id: "H1",
    title: "Envelopes emerge from coupling physics",
    rq: "RQ1",
    status: "partly supported",
    cls: "partly",
    prediction: "A partition built from coupling weights is stable when parameters move, and its modularity sits above a degree-preserving rewired null.",
    falsify: "The partition changes with the weight, or modularity is not above the null.",
    test: "v2 Step 5. The downstream envelopes are the PF-louvain partition.",
    evidence: [
      `PF-louvain versus the engineer’s functional grouping, adjusted Rand index ${text(v2.ariPfLouvainEngineer)} (discovery_ARI.csv).`,
      `Stability under ±30% parameter perturbation, mean ARI ${text(v2.stability30.mean_ARI)}, minimum ${text(v2.stability30.min_ARI)}, n ${text(v2.stability30.n)} (discovery.json).`,
      `Power-flow modularity Q ${text(pf.Q)}. Unweighted topology Q ${text(topo.Q_unweighted)}. Rewired null mean ${text(topo.rewired_null_mean)}, sd ${text(topo.rewired_null_sd)}, z ${text(topo.z)}, p ${text(topo.p_ge)}. Not above the null.`,
      `Weight-shuffle null for the power-flow weights: mean ${text(pf.null_mean)}, and the observed Q is below it (p ${text(pf.p_ge)}).`,
      `Kedem–Caplan q inside PF-louvain envelopes, median ${text(kc.median_intra)}; between them, median ${text(kc.median_inter)}.`,
    ],
  },
  {
    id: "H2",
    title: "A cross-envelope failure can be predicted from boundary-port power",
    rq: "RQ0",
    status: "partly supported",
    cls: "partly",
    prediction: "A reduced model that sees power only at envelope boundaries warns before failure and names the source envelope, and it stays quiet when there is no fault.",
    falsify: "No warning, the wrong source, or alarms on the no-fault runs. Also falsified, for this plant, if the path is not actually cross-envelope.",
    test: "v1 pump pulsation into HX1. v2 scenarios F1–F5 and C0, discovered envelopes versus the engineer’s grouping.",
    evidence: [
      `v1, 40 mechanism runs. Full model warned ${text(full.warned_before_failure)}, median lead ${text(full.lead_time_days_median)} days, root cause envelope A ${text(full.root_cause_SYS_A_correct)}. Reduced model warned ${text(reduced.warned_before_failure)}, median lead ${text(reduced.lead_time_days_median)} days, root cause ${text(reduced.root_cause_SYS_A_correct)}. Local band sensor root cause ${text(local.root_cause_SYS_A_correct)}.`,
      `v2 F1, failure_table.csv. FULL warned ${cell("F1", "FULL", "warned")}, lead median ${cell("F1", "FULL", "lead_median_d")} days, failing asset ${cell("F1", "FULL", "failing_asset_correct")}, root cause ${cell("F1", "FULL", "root_cause_correct")}. REDUCED root cause ${cell("F1", "REDUCED", "root_cause_correct")}, failing asset ${cell("F1", "REDUCED", "failing_asset_correct")}.`,
      `Cross-envelope true failures in failure_summary.json. Discovered envelopes: F1 ${v2.crossEnvelope["F1:_cross_envelope_discovered"].n_cross}/${v2.crossEnvelope["F1:_cross_envelope_discovered"].n}, F2 ${v2.crossEnvelope["F2:_cross_envelope_discovered"].n_cross}/${v2.crossEnvelope["F2:_cross_envelope_discovered"].n}, F3 ${v2.crossEnvelope["F3:_cross_envelope_discovered"].n_cross}/${v2.crossEnvelope["F3:_cross_envelope_discovered"].n}, F4 ${v2.crossEnvelope["F4:_cross_envelope_discovered"].n_cross}/${v2.crossEnvelope["F4:_cross_envelope_discovered"].n}. Engineer grouping, F1 ${v2.crossEnvelope["F1:_cross_envelope_engineer"].n_cross}/${v2.crossEnvelope["F1:_cross_envelope_engineer"].n}. Only F1 was cross-envelope, and only in part of the discovered-envelope runs.`,
      `No-fault alarms, failure_table.csv. C0 FULL ${cell("C0", "FULL", "alarms_no_failure")}, REDUCED ${cell("C0", "REDUCED", "alarms_no_failure")}, LOCAL ${cell("C0", "LOCAL", "alarms_no_failure")}. F5 LOCAL ${cell("F5", "LOCAL", "alarms_no_failure")}.`,
    ],
  },
  {
    id: "H3",
    title: "A distance ranks how large the effect is",
    rq: "RQ5",
    status: "partly supported",
    cls: "partly",
    prediction: "At least one distance has a negative rank correlation with the entropy generation that arrives, and the same sign inside each source.",
    falsify: "Every distance is near zero, or the within-source range crosses zero for the distances one would rely on.",
    test: "v1, 90 pairs. v2, 12 sources, distance_rank_correlations.csv.",
    evidence: v2.distanceRank.map((row) =>
      `${row.distance}: pooled ρ ${text(row.rho_pooled)}, p ${text(row.p_pooled)}, within-source mean ${text(row.rho_within_mean)} [${text(row.rho_within_min)}, ${text(row.rho_within_max)}], sources ${text(row.n_sources)}.`
    ).concat([
      "v1’s strongest rank correlation with effect was the Kron port-to-port distance, in distance_rank_correlations.csv on the v1 study. The v2 table is the one above. Within-source ranges cross zero for several structural distances, so none of those is reliable inside every source.",
    ]),
  },
  {
    id: "H4",
    title: "Boundary sensors can tell sources inside one envelope apart",
    rq: "RQ12",
    status: "not supported",
    cls: "open",
    prediction: "The reduced model matches the full model on lead time and on the failing asset when the source sits inside the same envelope as the target.",
    falsify: "Lead time drops and the failing asset is wrong when two sources look alike from the boundary.",
    test: "v2 F3, compressor surge. C1 and M6 are in the gas-train envelope.",
    evidence: [
      `FULL lead median ${cell("F3", "FULL", "lead_median_d")} days, failing asset ${cell("F3", "FULL", "failing_asset_correct")}, root cause ${cell("F3", "FULL", "root_cause_correct")}.`,
      `REDUCED lead median ${cell("F3", "REDUCED", "lead_median_d")} days, failing asset ${cell("F3", "REDUCED", "failing_asset_correct")}, root cause ${cell("F3", "REDUCED", "root_cause_correct")}.`,
      `REDUCED_ENG lead median ${cell("F3", "REDUCED_ENG", "lead_median_d")} days, root cause ${cell("F3", "REDUCED_ENG", "root_cause_correct")}.`,
      `Discovered cross-envelope count for F3 is ${v2.crossEnvelope["F3:_cross_envelope_discovered"].n_cross}/${v2.crossEnvelope["F3:_cross_envelope_discovered"].n}. The failure stays inside the envelope, and the boundary sensors do not separate the sources.`,
    ],
  },
  {
    id: "H5",
    title: "Convergent excitation is visible on the combined response",
    rq: "RQ9",
    status: "partly supported",
    cls: "partly",
    prediction: "Two sources that are each inside the limit can drive a target past its limit, and a model that keeps the combined response names that target. A model that only sums per-source damage does not.",
    falsify: "The combined case never exceeds the limit, or every predictor misses it. Also limited if the design model alarms when the true, detuned plant does not fail.",
    test: "v1 convergent cases C0–C3. v2 F4, P1 held steady and P2 rising, target HDR1.",
    evidence: [
      `v2 F4, failure_table.csv. True failures ${cell("F4", "FULL", "true_failures")} of ${cell("F4", "FULL", "runs")} runs. FULL warned ${cell("F4", "FULL", "warned")}, root cause ${cell("F4", "FULL", "root_cause_correct")}, alarms where the run did not fail ${cell("F4", "FULL", "alarms_no_failure")}. REDUCED alarms where the run did not fail ${cell("F4", "REDUCED", "alarms_no_failure")}.`,
      "v1’s convergent table is on the Results page. Several damaging cases have a per-source damage sum of 0 in convergent_excitation_summary.json, which is the part of the prediction the v1 toy supports. v2 F4 supports detection and also shows the over-prediction when the mode moves.",
    ],
  },
];

document.getElementById("hypotheses").innerHTML = cards.map((card) => `
  <article class="hyp">
    <span class="badge ${card.cls}">${card.status}</span>
    <h2>${card.id}. ${card.title}</h2>
    <p class="note">From ${card.rq}.</p>
    <dl>
      <dt>Prediction</dt><dd>${card.prediction}</dd>
      <dt>Would falsify</dt><dd>${card.falsify}</dd>
      <dt>Tested by</dt><dd>${card.test}</dd>
    </dl>
    <ul>${card.evidence.map((line) => `<li>${line}</li>`).join("")}</ul>
  </article>
`).join("");
