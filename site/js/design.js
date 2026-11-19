const [plant, v2] = await Promise.all([
  fetch("data/v2-plant.json").then((r) => r.json()),
  fetch("data/v2-results.json").then((r) => r.json()),
]);
const c = plant.counts;
const root = document.getElementById("design");
const extra = document.createElement("div");
extra.innerHTML = `
  <h2>Plants</h2>
  <p>v1 is the 11-asset plant already on the Apparatus page: four envelopes assigned by function, 21 ports, 13 couplings. The headline fault is a pulsation at P1.fluid. The run is seed 1000 of that study.</p>
  <p>v2 is a separate plant. Counted from the v2 graph file built from <code>plant_v2.py</code>: ${c.assets} assets, ${c.ports} ports, ${c.bonds} bonds, ${c.couplings} couplings, of which ${c.boundaryCouplings} cross a discovered envelope. The envelopes used downstream are the PF-louvain partition, ${c.envelopes} envelopes, ${c.boundaryPorts} boundary ports. They were not assigned. An engineer’s functional grouping and an area grouping are kept only for scoring and for the REDUCED_ENG predictor.</p>
  <h2>Finding the envelopes</h2>
  <p>Step 5 tries four weightings of the same asset graph: design power flow, Kedem–Caplan q on the Kron two-port <span class="badge draft">proposed</span>, timescale signatures, and slow coherency. Each weighting is partitioned by spectral clustering and by Louvain. The selection rule, fixed before the comparison with the engineer, keeps the power-flow or Kedem–Caplan partition with the highest mean adjusted Rand index under a ±30% parameter perturbation. On this plant that is PF-louvain. Modularity is reported against nulls and is not treated as proof of an envelope. For the power-flow weights, Q is ${v2.modularityNull.PF.Q}, below the weight-shuffle null mean ${v2.modularityNull.PF.null_mean}. Topology Q ${v2.modularityNull.topology.Q_unweighted} against a rewired null mean ${v2.modularityNull.topology.rewired_null_mean} has p ${v2.modularityNull.topology.p_ge}.</p>
  <h2>Predictors</h2>
  <ul>
    <li>FULL. Every port. On v2 that is all ${c.ports} ports.</li>
    <li>REDUCED. The discovered envelopes, with sensors only at their ${c.boundaryPorts} boundary ports.</li>
    <li>REDUCED_ENG. The engineer’s envelopes and their boundary sensors. The v2 README records 22 of those sensors.</li>
    <li>LOCAL. A trend on the asset’s own signals. It names the asset that alarmed.</li>
  </ul>
  <p>On v1 the same roles are the full plant, the reduced envelope model, and the local band sensor. v1 also reports a conventional temperature-and-pressure baseline, LOCAL_DC, which never warned in that study.</p>
  <h2>Fault scenarios</h2>
  <ul>
    <li>F1. Cooling-tower heat-rejection conductance falls. Parametric.</li>
    <li>F2. P1 cavitation.</li>
    <li>F3. Compressor surge at C1.</li>
    <li>F4. Convergent excitation. P1 held steady, P2 rising, target the supply-header mode. Each source alone stays inside the limit.</li>
    <li>F5. Agitator imbalance. It does not fail, so it is a second control.</li>
    <li>C0. No fault.</li>
  </ul>
  <p>The main table uses 20 runs per scenario. The margin checks use 10. Onset is drawn between day 10 and day 30. Each run is 400 days at a 6 hour step. Those settings are the v2 test design.</p>
  <h2>One safety-margin rule</h2>
  <p>The same factor multiplies the nominal peak for every asset. The reported tables are SAFE_FACTOR 2.0 (the main table), 1.5 and 3.0. v1 did not use this uniform rule: its Safe limits were asset-specific, 1.2 on HX1, 3 on P1, 4 on V1, and 2 on the others. v2 also scores temperature at thermal ports and fatigue on the header mode, under that same factor. Entropy generation is not the only coordinate in v2.</p>
  <h2>Metrics</h2>
  <ul>
    <li>Lead time, days from the warning to the true failure, with the median and the interquartile range.</li>
    <li>Whether the failing asset is the one named.</li>
    <li>Whether the root cause is the source that was injected.</li>
    <li>Alarms in runs that do not fail, and alarms before onset.</li>
    <li>For distance, Spearman rank correlation of each distance with log effect, pooled and within source.</li>
  </ul>
  <h2>Caveats, from the v2 README</h2>
  <ul>
    <li>The plant is linear and lumped. There is no transport delay, and pipes stay lumped at the frequencies used.</li>
    <li>Thermal ports use a pseudo-bond: effort is a temperature rise and flow is heat. That is why temperature is a separate damage coordinate.</li>
    <li>Electrical dynamics are not resolved. Motor gyrators are per-unit transformers.</li>
    <li>Parameters are typical engineering values, not a record of one plant. The header mode is constructed. Fault sizes were set so that F1 and F3 fail inside 400 days.</li>
    <li>Some predictor rules were added after early runs: an observability guard, 7-day coherent averaging, a least-power tie-break, and the temperature coordinate. Each rule is applied to every predictor.</li>
    <li>Envelopes are discovered at one operating point.</li>
    <li>Only F1 puts a true failure across an envelope boundary: ${v2.crossEnvelope["F1:_cross_envelope_discovered"].n_cross} of ${v2.crossEnvelope["F1:_cross_envelope_discovered"].n} under the discovered envelopes, and ${v2.crossEnvelope["F1:_cross_envelope_engineer"].n_cross} of ${v2.crossEnvelope["F1:_cross_envelope_engineer"].n} under the engineer’s grouping. The v2 failure test is thin evidence on the primary question.</li>
  </ul>
`;
root.appendChild(extra);
