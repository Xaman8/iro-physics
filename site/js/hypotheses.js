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
const ckc = v2.chosenKc;
const cnull = v2.chosenModularityNull;
const full = v1.headline.FULL;
const reduced = v1.headline.REDUCED;
const local = v1.headline.LOCAL;

const leads = [
  {
    n: "(1)",
    text: "A transfer map built port to port through the couplings predicts the effect on the receiving asset, whether the two are adjacent or many hops apart, as long as the transferred effect stays above a stated attenuation and signal-to-noise limit. The test is the prediction error at the receiving asset as a function of hop count and of transfer attenuation, with the model's parameters in error and with a coupling that exists in the plant missing from the model. Scope: this hypothesis covers energy carried through ports. Effects also travel through matter (composition, solids), control signals, discrete events and, in SAGD, the reservoir. Those paths are outside this hypothesis and are not yet modelled.",
  },
  {
    n: "(2)",
    text: "Nested envelopes, each reduced to one equivalent asset with boundary ports and a reconstruction map, work better as a structure for sensing and for reading the plant than random groupings of the same sizes. Two tests, with criteria fixed before the runs: isolability (whether sensors on the envelope boundaries can still tell the candidate sources apart) and held-out prediction (fault-propagation error, or boundary-only attribution accuracy, on faults not used to choose the envelopes). Each is compared with null partitions of the same size distribution. Not claimed: that exact reduction reveals multi-asset behaviour the full model does not already hold (for a linear model it carries nothing beyond Y inverse), or that natural envelopes emerge from the physics. Convergent excitation stays under RQ9.",
  },
];

const cards = [
  {
    id: "(3)",
    title: "Envelopes emerge from coupling physics (claim dropped 2026-11-19)",
    rq: "RQ1",
    status: "dropped",
    cls: "open",
    prediction: "A partition built from coupling weights is stable when parameters move, and its modularity sits above a degree-preserving rewired null.",
    falsify: "The partition changes with the weight, or modularity is not above the null.",
    test: `v2 Step 5. The downstream envelopes are the ${v2.chosenName} partition, ${v2.chosenK} envelopes, picked by the pre-registered rule. Before the 2026-11-19 red-team fixes the rule picked PF-louvain.`,
    evidence: [
      `${v2.chosenName} versus the engineer’s functional grouping, adjusted Rand index ${text(v2.ariChosenEngineer)}; PF-louvain versus the engineer, ${text(v2.ariPfLouvainEngineer)} (discovery_ARI.csv).`,
      `Stability under ±30% parameter perturbation: ${v2.chosenName} mean ARI ${text(v2.chosenStability30.mean_ARI)}, minimum ${text(v2.chosenStability30.min_ARI)}; PF-louvain mean ${text(v2.stability30.mean_ARI)}, minimum ${text(v2.stability30.min_ARI)}; n ${text(v2.stability30.n)} (discovery.json).`,
      `Power-flow modularity Q ${text(pf.Q)}. Unweighted topology Q ${text(topo.Q_unweighted)}. Rewired null mean ${text(topo.rewired_null_mean)}, sd ${text(topo.rewired_null_sd)}, z ${text(topo.z)}, p ${text(topo.p_ge)}. Not above the null.`,
      `Weight-shuffle null for the power-flow weights: mean ${text(pf.null_mean)}, and the observed Q is below it (p ${text(pf.p_ge)}).`,
      ...(cnull ? [`Weight-shuffle null for the ${cnull.name} weights: observed Q ${text(cnull.Q)}, null mean ${text(cnull.null_mean)}, p ${text(cnull.p_ge)}.`] : []),
      "Dropped from lead hypothesis (2) on 2026-11-19 after the red team, approved by Brant. Agreement with the designed grouping is self-consistency, because the same author built the plant and the grouping, and modularity is at best just above its null models. Envelopes are now tested by isolability and held-out prediction against random groupings of the same sizes (<a href=\"design.html#xi\">XI</a>, <a href=\"design.html#xb\">XB</a>). The evidence below is kept as the record.",
      `Kron two-port coupling ratio at DC inside ${v2.chosenName} envelopes, median ${text(ckc.median_intra)}; between them, median ${text(ckc.median_inter)}. Inside PF-louvain envelopes ${text(kc.median_intra)} and between ${text(kc.median_inter)}. The ratio is bounded by 1 after the red-team fix; it earlier reached 2.37.`,
    ],
  },
  {
    id: "(4)",
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
      "Caveat (red team, 2026-11-19): in every toy test the truth plant is the inference plant with ±10% parameter noise, so these results check the method against itself and do not yet support RQ0. Independent truth is planned in <a href=\"design.html#xt\">XT</a>. Attribution picks one source even when the sensors cannot separate several; an isolability pre-test and multi-source fits are planned in <a href=\"design.html#xi\">XI</a>.",
      `No-fault alarms, failure_table.csv. C0 FULL ${cell("C0", "FULL", "alarms_no_failure")}, REDUCED ${cell("C0", "REDUCED", "alarms_no_failure")}, LOCAL ${cell("C0", "LOCAL", "alarms_no_failure")}. F5 LOCAL ${cell("F5", "LOCAL", "alarms_no_failure")}.`,
    ],
  },
  {
    id: "(5)",
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
    id: "(6)",
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
    id: "(7)",
    title: "Convergent excitation is visible on the combined response",
    rq: "RQ9",
    status: "partly supported",
    cls: "partly",
    prediction: "Two sources that are each inside the limit can drive a target past its limit, and a model that keeps the combined response names that target. A model that only sums per-source damage does not.",
    falsify: "The combined case never exceeds the limit, or every predictor misses it. Also limited if the design model alarms when the true, detuned plant does not fail.",
    test: "v1 convergent cases C0–C3. v2 F4, P1 held steady and P2 rising, target HDR1.",
    evidence: [
      `v2 F4, failure_table.csv. True failures ${cell("F4", "FULL", "true_failures")} of ${cell("F4", "FULL", "runs")} runs. FULL warned ${cell("F4", "FULL", "warned")}, root cause ${cell("F4", "FULL", "root_cause_correct")}, alarms where the run did not fail ${cell("F4", "FULL", "alarms_no_failure")}. REDUCED alarms where the run did not fail ${cell("F4", "REDUCED", "alarms_no_failure")}.`,
      "Limit (2026-11-19): the mechanical port is one torque and speed pair, so it carries torsion only. The v2 F4 and F5 results do not transfer to lateral or axial vibration faults in real machinery as stated. Lateral and axial ports on one rotor are planned in <a href=\"design.html#xm\">XM</a>.",
      "v1’s convergent table is on the Results page. Several damaging cases have a per-source damage sum of 0 in convergent_excitation_summary.json, which is the part of the prediction the v1 toy supports. v2 F4 supports detection and also shows the over-prediction when the mode moves.",
    ],
  },
  {
    id: "(8)",
    anchor: "h8",
    title: "Approximate envelope models meet a fixed deadline where the exact sparse solve does not",
    rq: "RQ12 and RQ16 (Brant, 2026-11-19; restated 2026-11-19 after the red team)",
    status: "untested",
    cls: "draft",
    prediction: "Conditional, for later testing. Approximate envelope models with a stated error bound meet an update deadline D on a plant class P where the exact sparse full solve does not, with D and P fixed before any run. No speed claim is made for exact envelope reduction. The case for envelopes rests on sensing and interpretability, lead hypothesis (2). The earlier wording, that envelopes are needed because running the whole graph in real time would take too much computing, was dropped on 2026-11-19 with Brant’s approval; it is quoted in the Formal model’s Change Log.",
    falsify: "With D and P fixed in advance, the exact sparse full solve meets D, or the approximate envelope models miss D or exceed their stated error bound.",
    test: `<a href="design.html#xb">XB</a> and X4. The approximate models (weak couplings dropped, balanced truncation, or a rational fit) are compared with the full solve on the same hardware and in the same language, against METIS or AMD orderings and against Woodbury updates. D and P have not been set yet.`,
    evidence: [
      "Scaling benchmark, one CPU core (SCALING.md). Full update at 10,016 assets: 19.8 ms with stored factorizations, 142 ms refactorized. At 100,000 assets: 274 ms and 1.55 s. These are from before the 2026-11-19 red-team fixes; a spot check afterwards at 10,016 assets gave 19.3 ms and 163 ms, and the full sweep has not been rerun.",
      "Meshed plant at 100,000 assets, refactorized update: 11.6 s full, 25.2 s envelope. A plant-year of 1,461 updates at 100,000 assets took 6.7 to 37.8 min on the grid plant and 4.7 h meshed.",
      "The exact envelope solve matched the full solve to within 5e-9 relative, but it was not faster per update at any size measured. That is why the speed claim for exact reduction was dropped. Even the slowest measured solve, 11.64 s, is about 0.05% of a 6-hour step.",
      "Not measured yet: updates after a change inside one envelope, the Kron work spread over several cores, any GPU (none was tested), METIS ordering, and envelopes of envelopes. The v2 predictors work on 6-hour means, and every measured full update fits easily inside that interval, so the test needs a deadline D and plant class P fixed in advance.",
    ],
  },
];

const leadHtml = leads.map((item) => `
  <article class="hyp">
    <span class="badge answered">Locked, reworded 2026-11-19</span>
    <h2>${item.n}</h2>
    <p>${item.text}</p>
  </article>
`).join("");

document.getElementById("hypotheses").innerHTML = leadHtml + cards.map((card) => `
  <article class="hyp"${card.anchor ? ` id="${card.anchor}"` : ""}>
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
