import { sig3 } from "./format.js";

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
  <p>Step 5 tries four weightings of the same asset graph: design power flow, Kedem–Caplan q on the Kron two-port <span class="badge draft">proposed</span>, timescale signatures, and slow coherency. Each weighting is partitioned by spectral clustering and by Louvain. The selection rule, fixed before the comparison with the engineer, keeps the power-flow or Kedem–Caplan partition with the highest mean adjusted Rand index under a ±30% parameter perturbation. On this plant that is PF-louvain. Modularity is reported against nulls and is not treated as proof of an envelope. For the power-flow weights, Q is ${sig3(v2.modularityNull.PF.Q)}, below the weight-shuffle null mean ${sig3(v2.modularityNull.PF.null_mean)}. Topology Q ${sig3(v2.modularityNull.topology.Q_unweighted)} against a rewired null mean ${sig3(v2.modularityNull.topology.rewired_null_mean)} has p ${sig3(v2.modularityNull.topology.p_ge)}.</p>
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
  <h2>Proposed experiments <span class="badge draft">proposed</span></h2>
  <p>None of these experiments has been run, and no result is stated here. Where a row names an existing result, it only shows what the new experiment adds. The steps are the eight steps on the Overview.</p>
  <div class="table-scroll"><table>
    <thead><tr><th>ID</th><th>Step</th><th>Question</th><th>What is varied</th><th>What is measured</th><th>Builds on</th></tr></thead>
    <tbody>
      <tr><td>X1</td><td>1. Plant</td><td>Does the inferred coupling graph change with operating mode? (RQ13)</td><td>Operating mode: normal, startup, one pump tripped, valve closed</td><td>Changes in couplings and in coupling power sign; whether the discovered envelopes change (ARI)</td><td>v2 plant, one operating point only today</td></tr>
      <tr><td>X2</td><td>2. Five-port asset</td><td>Does applying the five-port rule change any result? (RQ8, RQ10)</td><td>v2 as it stands (${c.ports} ports in use) against v2 rebuilt with five ports per asset, including a chemical domain (reaction heat, corrosion or fuel paths)</td><td>Solve identity at DC and the five line frequencies; boundary domains per envelope; how many empty ports remain</td><td>Five-port rule (Formal model Step 1, locked). Same-domain port pairs still to be decided</td></tr>
      <tr><td>X3</td><td>3. All-pairs view</td><td>What does the all-pairs port map hold, and how much of it matters? (RQ6, RQ12)</td><td>Plant size, 32 to 10k assets</td><td>Share of entries of the port-to-port map Z(s) above set thresholds at each fault band; dense cost and memory</td><td>Scaling notes: dense figures measured to 3,008 assets</td></tr>
      <tr><td>X4</td><td>4. Sparse linear system</td><td>Where does the sparse full solve stop being cheap? (RQ12, RQ16)</td><td>Meshing density; ordering (COLAMD against METIS nested dissection); GPU against CPU</td><td>Update time with stored and with fresh factorizations; fill; memory</td><td>Grid and meshed plants on one CPU core with COLAMD. METIS and GPU not measured</td></tr>
      <tr><td>X5</td><td>5. Natural envelopes</td><td>Are the envelopes stable across plants and modes, and which weighting should decide? (RQ1, RQ13)</td><td>Plant (v2, five-port v2, a second plant layout); weighting (power flow, Kedem–Caplan per band); operating mode</td><td>ARI between methods, across perturbation and across modes; null-model scores</td><td>v2 discovery, one plant, one mode</td></tr>
      <tr><td>X6</td><td>6. Envelope as asset</td><td>Does the reduction hold up away from the linear case, and does recursion work? (RQ2, RQ3, RQ4)</td><td>A nonlinear element inside an envelope; envelopes of envelopes</td><td>Exactness against the full solve; passivity; what is lost at each level</td><td>v2 reduction, exact and passive in the linear case</td></tr>
      <tr><td>X7</td><td>7. Cross-envelope failure</td><td>Can failures that genuinely cross envelopes be predicted? (RQ0, RQ5, RQ9)</td><td>New scenarios built so the true first failure lies outside the source envelope: thermal, fluid and vibration paths, plus convergent excitation from two envelopes</td><td>Share of runs where the failure is cross-envelope; lead time; correct failing asset; correct root cause; false alarms</td><td>v2 test, where only F1 crossed (${v2.crossEnvelope["F1:_cross_envelope_discovered"].n_cross}/${v2.crossEnvelope["F1:_cross_envelope_discovered"].n} under discovered envelopes)</td></tr>
      <tr><td>X8</td><td>8. Detect and trace back</td><td>See XB and XD below</td><td></td><td></td><td></td></tr>
    </tbody>
  </table></div>
  <h2 id="xb">XB. Full baseline against envelopes <span class="badge draft">proposed</span></h2>
  <p>Purpose: decide what envelopes add once the full sparse solve is known to be fast. The benchmark measured speed only. This experiment measures accuracy and insight. All arms use the same truth runs, scenarios, seeds and alarm rule. (RQ16, lead hypothesis 2.)</p>
  <ul>
    <li>FULL-ALL. The full plant model with sensors at every port in use.</li>
    <li>FULL-BOUNDARY. The full plant model, but sensors only at the envelope boundary ports. This separates the effect of the model from the effect of sensing.</li>
    <li>ENV. The envelope model, with boundary sensors.</li>
    <li>ENV+INT. The envelope model with a few added internal sensors per envelope, chosen to separate that envelope’s own candidate sources (the F3 case).</li>
    <li>LOCAL. Per-asset trending, as in v2.</li>
  </ul>
  <p>Scenarios: the v2 set (F1 to F5, C0) plus the X7 cross-envelope scenarios. At least one parametric fault is modelled as a change in Y, not as an equivalent injection (RQ4).</p>
  <p>Measures for each arm and scenario: root cause correct (asset, and envelope); failing asset correct; lead time (median and interquartile range); error in predicted time to failure; alarms in no-fault and non-failing runs, and alarms before onset; update time with stored and with fresh factorizations, and cost after a local change in one envelope; convergent-excitation cases detected, and cases where combined behaviour at an envelope boundary flags a risk that no single asset pair shows.</p>
  <p>Each measure is reported with its run count, as in the v2 tables. A difference between arms counts only if it holds across seeds and across the safety-margin checks. Those decision rules still need agreement.</p>
  <h2 id="three-way">XD. Three-way detection comparison <span class="badge draft">proposed</span></h2>
  <p>The same fault and no-fault runs go to three detectors. Not yet built. The derivative charts are display only today. (RQ15.)</p>
  <ul>
    <li>(a) The model’s prediction: transfer-map fit, damage forecast and remaining life, as in v2.</li>
    <li>(b) Instrument calculus alone: value, rate, acceleration and jerk (derivative orders 0 to 3) of the instrument readings, with a threshold rule fixed before the runs.</li>
    <li>(c) The model’s band matching: fitting the fault bands at the sensors to name a source, without the damage forecast.</li>
  </ul>
  <p>Measures: correct root cause, lead time and false alarms, plus detection delay after onset. Detector (b) cannot name a remote source on its own, so its root-cause score is the asset that alarmed, the same way LOCAL is scored in v2.</p>
  <p>Still open: the smoothing window for the derivatives, the sample rate (the v2 predictors work on 6-hour means), and whether (b) runs on every port or only on boundary ports.</p>
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
const jump = document.getElementById(location.hash.slice(1));
if (jump) jump.scrollIntoView();
