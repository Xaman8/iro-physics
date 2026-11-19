# IRO Envelope Model: Formal Specification (working)

Vocabulary follows "Grounding Industrial System Ontologies in Physics" (Arseneau & Arseneau, draft 2026.10.27).
Proposed additions are marked **[PROPOSED]**. Changes to earlier steps are recorded in the Change Log.

## Step 1: Asset as a physical behaviour (LOCKED 2026-11-19)

- Asset $i$ has state $x_i$ and stored energy $H_i(x_i)$.
- **Port** (paper): an interface where energy crosses a boundary; typed by domain (mechanical, fluid, thermal, electrical, field) with an effort/flow pair; power $P = e_p f_p$. Ports are direction-neutral.
- **Coupling** (paper): reified relation linking a **source port** to a **target port**; carries nominal direction. Actual direction at time $t$ is the sign of the coupling power $P_c(t)$.
- Energy balance:

$$\frac{dH_i}{dt} = \sum_{c:\ \mathrm{target}(c)\in i} P_c - \sum_{c:\ \mathrm{source}(c)\in i} P_c - D_i, \qquad D_i \ge 0.$$

- Internal entropy generation: $\dfrac{dS_{\mathrm{gen},i}}{dt} = \dfrac{D_i}{T_i} + \sum_h Q_h\left(\dfrac{1}{T_{\mathrm{cold},h}} - \dfrac{1}{T_{\mathrm{hot},h}}\right)$ (Prigogine $d_iS$), with $T$ in kelvin at the port where the loss lands, and the sum over heat $Q_h$ that crosses a temperature difference inside the asset. **[LOCKED TEXT CORRECTED 2026-11-19, red team; see Change Log. Was: $dS_{\mathrm{gen},i}/dt = D_i / T_i$.]**
- State-space form:

$$\frac{dx_i}{dt} = (J_i - R_i)\,\nabla H_i + G_i u_i, \qquad y_i = G_i^{\mathsf T}\nabla H_i.$$

- **Five ports per asset (LOCKED amendment 2026-11-19, Brant).** Every asset has exactly five ports, one per domain: mechanical, fluid, thermal, electrical and chemical. Ports the asset does not use are present but empty (zero power, no coupling). This replaces "field" in the domain list above with "chemical" for asset ports. Open detail: how one port per domain represents an asset with two same-domain terminals today (valve inlet/outlet, gearbox in/out shafts, the two streams of a heat exchanger). Toy model v2 does not yet follow this rule (71 ports over 32 assets, four domains, no chemical domain); see DESCRIBED_MODEL.md.
- **[PROPOSED] Port directionality**: design constraint of a port, one of {source-only, target-only, reversible}. Not the physics of direction; it states what the port is built to tolerate. $P_c(t)$ against a port's design directionality is an envelope excursion (failure signal).

## Step 2: Couplings (LOCKED 2026-11-19)

- Coupling $c$ links source port $s(c)$ to target port $t(c)$ (paper). Medium/structure is a property of the coupling.
- 2a Energy accounting: $P_c^{s} - P_c^{t} = D_c \ge 0$; $\dfrac{dS_{\mathrm{gen},c}}{dt} = \dfrac{D_c}{T_c} + Q_c\left(\dfrac{1}{T_t} - \dfrac{1}{T_s}\right)$, where $Q_c$ is heat carried from a source port at $T_s$ to a target port at $T_t$ (zero for work-domain couplings). Ideal direct-port coupling $D_c = 0$. Heat conduction has $D_c = 0$ but positive entropy generation when $T_s > T_t$. **[LOCKED TEXT CORRECTED 2026-11-19, red team; see Change Log. Was: $dS_{\mathrm{gen},c}/dt = D_c / T_c$.]**
- 2b Constitutive law (Onsager): $J = LX$, $L$ symmetric ($L_{12} = L_{21}$), $L$ positive semidefinite; entropy production $\sigma_c = X^{\mathsf T} L X \ge 0$.
- 2c Coupling strength (Kedem-Caplan): $q_c = L_{12} / \sqrt{L_{11} L_{22}}$, $|q_c| \le 1$. Weight for envelope detection (Step 5) and energy-weighted distance (Step 7).
- 2d Topologies (paper): direct port (stiff, ~lossless), medium-only (lossy, delayed), structure-mediated (weak, often unexpected cross-envelope path).
- 2e **Domain conversion lives inside the asset** (decided 2026-11-19): assets own ports of different domains; couplings join same-domain ports. Domain-crossing distance = number of converting assets on a path.
- 2f **Spectral description** **[PROPOSED]**: each port/coupling carries power spectral density and cross-spectral density with other ports (phase kept). Each asset carries resonance data (natural frequencies, damping) in its design envelope.

## Step 3: The plant (LOCKED 2026-11-19)

- 3a Graph $G = (A, C)$: assets = nodes, couplings = edges between ports. Incidence $B_{ic} = +1$ if asset $i$ holds the target port of $c$, $-1$ if the source port, $0$ otherwise.

$$\frac{dH}{dt} = B P_C - D_A.$$

- 3b Port-Hamiltonian form. $J$ skew (lossless interconnection), $R \ge 0$ (all dissipation incl. Onsager $L$ blocks), $\theta(t)$ = operating state. $H = \sum_i H_i$.

$$\dot{x} = \big(J(x,\theta) - R(x,\theta)\big)\nabla H + G_b u_b, \qquad y_b = G_b^{\mathsf T}\nabla H.$$

- 3c Maintenance = entropy export (negative $d_eS$), per paper. Each entropy term includes its heat-transfer part (Steps 1 and 2a). **[LOCKED TEXT CORRECTED 2026-11-19, red team; see Change Log. Was: $d_iS/dt = \sum_i D_i/T_i + \sum_c D_c/T_c \ge 0$.]**

$$\frac{dH}{dt} = y_b^{\mathsf T} u_b - \nabla H^{\mathsf T} R\,\nabla H, \qquad \frac{d_iS}{dt} = \sum_i \frac{dS_{\mathrm{gen},i}}{dt} + \sum_c \frac{dS_{\mathrm{gen},c}}{dt} \ge 0.$$

- 3d $J$ and $R$ depend on $\theta$: coupling graph, envelopes and cross-envelope failure paths can be operating-mode dependent (e.g. startup).
- 3e Plant boundary (decided 2026-11-19): reservoir, ambient, grid, fuel supply are boundary ports backed by ideal sources (fixed effort), not assets. "Asset" = something owned and maintained. Same boundary notion reused for envelopes.
- 3f **[PROPOSED] note: all-pairs bound versus actual couplings** (2026-11-19, not locked; 3a–3e unchanged). With the Step 1 five-port amendment, $N$ assets have $N_{\mathrm{ports}} = 5N$ ports, so a model in which every port may act on every other has $(5N)^2 = 25N^2$ port-to-port entries: $2.5 \times 10^9$ at $N = 10{,}000$. Actual plants have a few couplings per asset. v2 has 50 couplings over 32 assets (mean coupling degree 3.1, max 6). The 10,016-asset benchmark plant (tiled v2, `iro-toy-model/v2/scaling/SCALING.md`) has 15,650 couplings plus 590 ties, and its $Y(s)$ has about 7.4 nonzeros per asset. The benchmark used v2's port set (about 2.2 ports per asset, 22,223 ports at 10,016 assets), not $5N$. An empty port has no coupling and no injection, so it adds no off-diagonal entry; $5N$ is the ontology count, and the solved system needs only the ports in use. Per operating state, the plant is therefore a sparse linear system. Measured on one CPU core (no GPU was tested): one update in about 20 ms at 10,016 assets with stored factorizations (19.8 ms in SCALING.md Table 3; a spot check after the 2026-11-19 red-team fixes gave 19.3 ms, and the full sweep has not been rerun), with near-linear growth for local couplings and steeper growth for long-range meshing. Consequence: on the plants measured, envelopes (Step 5, Step 6b) are not justified by single-machine speed. Since the 2026-11-19 decisions after the red team (see Change Log), their case rests on sensing and interpretability (lead hypothesis 2 as reworded). Hypothesis (8) [PROPOSED, UNTESTED] no longer claims speed for exact reduction; it is a conditional claim that approximate envelope models with a stated error bound meet a deadline $D$ on a plant class $P$ where the exact sparse solve does not, with $D$ and $P$ fixed in advance. XB and X4 are to test it.

## Step 5: Envelope discovery [PROPOSED] (2026-11-19, not locked)

Envelopes are found from the plant's physics, not assigned. Tested in toy model v2 (`iro-toy-model/v2/discover_envelopes.py`).

- 5a Coupling weights, each computed from the Step 3 plant alone: (i) design power flow $|P_c|$ per coupling; (ii) **[PROPOSED]** Kron two-port coupling ratio (earlier called the Kedem-Caplan degree of coupling),

$$q_c(\omega) = \frac{|H_{12}|}{\sqrt{H_{11}\,H_{22}}}, \qquad H = \tfrac12\left(Y + Y^{\mathsf H}\right),$$

where $Y$ is the full plant $Y(j\omega)$ reduced onto the two ports of coupling $c$, per band $\omega$. $q_c \le 1$ whenever $H$ is positive semidefinite, and it is clipped at 1 otherwise (no pair needed clipping in v2). It plays the role of Step 2c on the whole plant, but it is not Onsager's $L$, because the plant has non-reciprocal heat bonds. Corrected 2026-11-19 after the red team: the earlier formula $|Y_{12}|/\sqrt{|Y_{11}||Y_{22}|}$ is not bounded and reached 1.004, 1.058 and 2.374 in v2 at 1, 6 and 150 rad/s; the bounded ratio peaks at 0.987; (iii) timescale signatures (participation factors per timescale decade, Perez-Arriaga et al.); (iv) slow coherency (Winkelman et al.).
- 5b Partitioning: normalised spectral clustering ($k$ from the eigengap) and Louvain modularity, on the asset graph with weights from 5a.
- 5c Scores reported with every partition: eigengap, modularity $Q$, **null models** (weight shuffle and degree-preserving rewiring; modularity alone does not show envelopes, Guimera et al. 2004), stability under $\pm 10\%$ and $\pm 30\%$ parameter perturbation (ARI), sensitivity to the parasitic-coupling rule, strong-inside/weak-between ratio of $q$, and ARI against the engineer's grouping.
- 5d Selection rule (fixed before scoring against the engineer): among the power-flow and coupling-ratio (5a ii) partitions, the one with the highest mean ARI under $\pm 30\%$ parameter perturbation; ties go to higher $Q$, then the DC weighting.
- 5e Result on v2 (32 assets): partly emergent. After the 2026-11-19 red-team fixes the rule picks the coupling-ratio Louvain partition at 1 rad/s (KCw1-louvain): 7 envelopes that follow energy chains (mean ARI 0.98, minimum 0.87, under $\pm 30\%$ perturbation; ARI 0.32 vs the engineer's functional grouping). Power-flow Louvain still gives the same 5 groups as before (ARI 0.43 vs the engineer), but its stability fell from 1.0 to 0.91. Methods agree only partly: ARI 0.22–0.64 between the PF and coupling-ratio partitions, 0.16–0.43 against the engineer ($k$ forced to 4 excluded). Power-flow $Q$ is below its weight-shuffle null; the chosen partition's $Q$ is 0.66 against a null of $0.62 \pm 0.03$ ($p = 0.04$); topology $Q$ against rewired graphs gives $p = 0.16$. The coupling ratio is strong inside and weak between (median 0.84 inside vs 0.31 between for the chosen envelopes). Before the fixes 5e read: 5 PF-louvain envelopes, ARI 1.0 under perturbation, 0.43 vs the engineer, methods 0.24–0.55 (the data then gave 0.22–0.48), $q$ 0.85 inside vs 0.28 between.
- 5f Each discovered envelope is reduced by Step 6b to an envelope-asset (boundary ports, $Z_E(s)$, Norton equivalent, reconstruction map) and couples to the others through the unchanged cross-envelope couplings. In the linear model this is exact (checked to $1.5 \times 10^{-14}$) and every reduced envelope is passive. Passive after reduction does not mean passive inside: in v2 the gas-train envelope's own admittance has a negative Hermitian eigenvalue ($-1.9 \times 10^{-3}$, at C1.thermal / IC1.thermal), caused by the one-way heat bonds (open item, 2026-11-19).
- 5h **[PROPOSED] expectation, testable hypothesis (Brant, 2026-11-19):** an asset typically uses 1–3 of its five ports, but as assets aggregate into envelopes the envelope's boundary ports are expected to span all five domains. Not a result. In v2 the seven envelopes chosen after the 2026-11-19 fixes span 1, 2, 4, 2, 3, 4 and 4 domains (Supply, MCC1 pumps + fan, Drives, CW pump 1, Reactor + heat rejection, Oil + bearing, Gas train; before the fixes the five PF-louvain envelopes spanned 2, 3, 4, 2 and 4); five is impossible in v2 because it has no chemical domain. Test needs a plant with chemical paths and the five-port rule applied. **v3 (2026-11-19, approved by Brant after red team): not reported. Toy model v3 has a chemical domain, but its chemical port is non-physical (see "v3 chemical domain" below), so 5h is not reported from v3.**
- 5g Open: operating-mode dependence (3d, RQ13); recursion (RQ3); choice between weights when they disagree.

## Failure mechanism: Convergent excitation [PROPOSED] (2026-11-19)

Two or more sources, possibly in different envelopes, each within limits, whose combined response at a target asset exceeds its limit (in-phase superposition, frequency near resonance, or nonlinear mixing $w_1 \pm w_2$). Damage is computed on the combined response (fatigue $\sim A^m$), never summed per source. Averaged-power (SEA-style) envelope summaries cannot detect it.

## Step 6b (planned): Port-to-port reduction [PROPOSED]

- Eliminate internal states (Schur complement / Kron reduction) to get a port-to-port map, valid per operating state (linearised):

$$y(s) = Z(s)\,u(s).$$

- $|Z_{jk}|$ at the fault band = transfer-attenuation distance.
- Derived view for fast screening only; the coupling graph remains the model because the map loses path/attribution, nonlinearity and damage in eliminated assets.

## Damage measure (decided 2026-11-19, approved by Brant after red team)

Decision 2 of `iro-paper/red-team/MERGED_PLAN.md`. Steps 1, 2a and 3c are unchanged.

- Entropy generation σ (Steps 1, 2a, 3c) is kept as a power and energy-balance check. Total asset σ measures efficiency. It is not a damage measure, because much of it is the asset's job (heat rejection, throttling, the process reaction, combustion).
- Damage is tracked with mechanism-specific coordinates, each with its own law: Arrhenius temperature, Miner/Basquin fatigue with real stress, L10 or ISO 281 for bearings, corrosion rate and fouling resistance.
- Per-mechanism entropy with its own coefficient $B_i$ (Bryant, Khonsari and Ling 2008) is used only where a calibrated $B_i$ exists, such as sliding wear and coupon fatigue. Designed and process losses are kept out of the damage integral. Bryant et al. (2008) is not cited as support for total asset σ.
- RQ10 is answered "no, not on its own."
- Not built yet. The v2 and v3 failure tests still use total σ as one of their damage coordinates.

## Mechanical port: vector effort and flow (decided 2026-11-19, approved by Brant after red team)

Decision 3 of the merged plan. Locked Step 1 text is unchanged: the five domain types stay, and a port's "effort/flow pair" may be a pair of vectors where the physics needs it.

- Mechanical ports may carry a vector effort and flow: a twist and wrench, or at least x, y and axial components at each bearing station.
- Plan: give at least one rotor lateral and axial ports before any further machinery-fault claim. Test: a rotating unbalance on a two-bearing rotor, compared with a standard lateral rotor-dynamics model (XM in EXPERIMENTAL_DESIGN_ADDITIONS.md).
- Until then, mechanical claims are limited to torsion. Today's port is one speed/torque pair, which keeps only rotation about the shaft axis. Unbalance, misalignment, bearing defects, looseness, rubs and oil whirl are lateral or axial, and none of them has a torsional power path to first order. The v2 results for F4 and F5 (F5 is an "agitator imbalance" injected as a torque line) do not transfer to vibration faults in real machinery as stated.
- The same vector form is available for other same-domain terminals, such as a valve's inlet and outlet. The rule for merging or splitting same-domain terminals is not changed by this decision.

## v3 chemical domain: non-physical (decided 2026-11-19, approved by Brant after red team)

Decision 4 of the merged plan.

- The v3 chemical port is marked non-physical. Its effort is a dimensionless number on its own base, and its flow is power divided by that number, not a molar rate. It has no species, stoichiometry or element balance, and the fluid, thermal and chemical ports of one stream are not coupled. The Chemistry review found that it has the wrong temperature sign, can run combustion backwards, and, before the unit fix, gave 63.5 % of plant σ from unit choices.
- No v3 chemical result is used for damage, for hypothesis 5h, or to test hypothesis (1) through chemical paths. 5h is not reported from v3.
- If the programme needs chemistry later (for 5h, or for SAGD matter transport), the port is rebuilt with species-resolved ports, reaction rates from the affinity, $\sigma_{\mathrm{rxn}} = \sum_r A_r \dot{\xi}_r / T$, a stated exergy reference and the eleven tests in `red-team/Chemistry-Ontology.md`.

## Attribution: isolability first [PROPOSED] (decided 2026-11-19, approved by Brant after red team)

Decision 8 of the merged plan. Not built yet; the toy models still use the single-source least-squares fit with the least-power tie-break.

- Before any source fit, an isolability pre-test on the sensor set: group candidate ports by the coherence of their transfer columns and check the rank of the fault-signature matrix. A group with more than one member is reported as "not isolable", or attributed to the group as a whole.
- The fit allows several simultaneous sources (a multi-source sparse fit), reports how often it names a source that is not there, and has a "none of the above" outcome when no candidate explains the residual.
- Baselines on the same runs, at matched false-alarm rates: bond-graph analytical redundancy relations (ARR) or observer residuals, and PCA ($T^2$ and SPE). Detection delay, isolation accuracy and false-alarm rate are reported for every arm (XI in EXPERIMENTAL_DESIGN_ADDITIONS.md).
- Step 8 of the approach then reads: the method names the source when the sensor set makes it isolable, and says when it does not.

## Change Log

- **2026-11-19 — LEAD RESEARCH QUESTIONS (1) AND (2) REWORDED AND STEP 5 RETITLED, approved by Brant ("Align the research questions and Step 5 title with the new hypotheses").** Follows the hypothesis rewording in the entry below. No code changed, no model rerun.
  - **LOCKED TEXT CHANGED, research question (1).** Was: "**(1) Research question.** Can we model how a physical effect in one asset is transferred to and affects another asset, regardless of the distance between them?" Now asks whether a transfer map through the couplings predicts the effect on another asset, and how the prediction error changes with hop count and transfer attenuation.
  - **LOCKED TEXT CHANGED, research question (2).** Was: "**(2) Research question.** Does grouping assets into natural nested envelopes keep those asset-to-asset relationships intact, and does it reveal multi-asset behaviour that pairwise analysis misses?" Now asks whether nested envelopes, each reduced to one equivalent asset, help sensing and reading the plant more than random groupings of the same sizes, judged by isolability and held-out prediction.
  - **Step 5 of the eight-step framing retitled.** Was: "Natural envelopes found from coupling strength" (RESEARCH_QUESTIONS.md), "Natural envelopes from coupling strength" and "Model it differently: find natural envelopes from coupling strength." (DESCRIBED_MODEL.md), "Natural envelopes" (EXPERIMENTAL_DESIGN_ADDITIONS.md X5). Now: "Envelopes from coupling strength, tested against random groupings". The Formal model's own Step 5 keeps its title, "Envelope discovery".
  - EXPERIMENTAL_DESIGN_ADDITIONS.md X7: "4/20" corrected to 6/20 after the fixes (v2 `results/failure_summary.json`, F1 cross-envelope under discovered envelopes: n_cross 6 of 20).

- **2026-11-19 — DECISIONS AFTER THE RED TEAM, approved by Brant after red team (`iro-paper/red-team/MERGED_PLAN.md`, Decisions 1-8; Brant accepted all eight recommendations). FOR BRANT: the locked hypotheses (1) and (2) and the proposed hypothesis (8) were reworded.** The hypothesis text lives in RESEARCH_QUESTIONS.md. DESCRIBED_MODEL.md and EXPERIMENTAL_DESIGN_ADDITIONS.md were brought in line. No code was changed and no model was rerun for this entry. Research questions (1) and (2) are unchanged.
  - **LOCKED TEXT CHANGED, hypothesis (1), 2026-11-19, approved by Brant after red team (Decision 5).** Was: "**(1) Hypothesis.** Energy transfer modelled port to port through couplings predicts the effect on the receiving asset, whether the two are adjacent or many hops apart. (Related: RQ0, RQ5 to RQ9, distance.)" Now: predictability through a transfer map, up to a stated attenuation and signal-to-noise limit, tested by prediction error against hop count and transfer attenuation under parameter error and with a coupling missing from the model, plus a scope note that effects also travel through matter, control signals, discrete events and the reservoir. Reason: with the true structure and an exact inverse, prediction does not depend on distance by construction, so the old wording could not be tested (merged plan Finding 14).
  - **LOCKED TEXT CHANGED, hypothesis (2), 2026-11-19, approved by Brant after red team (Decision 6).** Was: "**(2) Hypothesis.** Envelope reduction keeps the cause-and-effect path between assets, and it exposes combined behaviour, such as convergent excitation, that no single asset pair shows. (Related: RQ1 to RQ4, combination effects.)" Now: envelopes are a sensing and interpretation structure, tested by isolability and by held-out prediction against null partitions of the same size distribution. The claims that exact reduction reveals internal multi-asset behaviour and that natural envelopes emerge are dropped. Reason: for a linear model exact reduction carries nothing beyond Y inverse, discovered modularity is not convincingly above the null models, and ARI against the designed tree is self-consistency (Findings 4 and 15).
  - **HYPOTHESIS (8) RESTATED [PROPOSED, UNTESTED], 2026-11-19, approved by Brant after red team (Decision 7).** Was: "**Hypothesis (8) [PROPOSED] (2026-11-19, Brant):** the reason assets are grouped into envelopes and each envelope is reduced to one equivalent asset is computing cost. In a large or tightly meshed plant the graph, sparse as it is, is still very large, and running the whole thing to predict behaviour and faults in real time would take too much computing." Now: the speed claim is dropped. What remains is a conditional claim for later testing: approximate envelope models with a stated error bound meet an update deadline D on a plant class P where the exact sparse full solve does not, with D and P fixed before any run. Reason: the exact envelope solve was slower than the full sparse solve at every size measured (meshed 100,000 assets: 11.64 s full, 25.23 s envelope), and "real time" had no deadline, so the old wording could not be falsified (Finding 8).
  - **ADDED: Damage measure section (Decision 2).** σ is a power and energy-balance check; damage uses mechanism-specific coordinates, with per-mechanism entropy and $B_i$ only where $B_i$ is calibrated. RQ10 answered "no, not on its own." Steps 1, 2a and 3c unchanged.
  - **ADDED: Mechanical port section (Decision 3).** Five domain types kept; effort and flow may be vectors; lateral and axial ports planned for at least one rotor; machinery claims limited to torsion until then. Locked Step 1 text unchanged.
  - **ADDED: v3 chemical domain section (Decision 4), and 5h's v3 result withdrawn.** The v3 chemistry is marked non-physical, and 5h is not reported from it. The 5h text is kept, with a note.
  - **ADDED [PROPOSED]: Attribution section (Decision 8).** Isolability pre-test, multi-source fits with "not isolable" and "none of the above", bond-graph ARR or observer and PCA baselines at matched false-alarm rates.
  - **ADDED [PROPOSED]: independent truth plan (Decision 1)**, as XT in EXPERIMENTAL_DESIGN_ADDITIONS.md: Tennessee Eastman, the Petrobras 3W dataset, and one nonlinear envelope (Modelica or Simscape, or a two-phase SAGD ESP, separator and FWKO).
  - **CHANGED [PROPOSED] 3f, last sentences,** to match the restated (2) and (8).

- **2026-11-19 — CORRECTIONS AFTER THE RED TEAM (`iro-paper/RED_TEAM.md`; reviews Physics-Ontology, Engineering-Ontology, Chemistry-Ontology, Mathematics-Ontology, Researcher, SAGD-Model). FOR BRANT: three LOCKED lines were changed because they were factually wrong.**
  - **LOCKED TEXT CHANGED, Step 1, internal entropy generation.** Was "dS_gen,i/dt = D_i / T_i". Now adds sum_h Q_h (1/T_cold,h - 1/T_hot,h) for heat crossing a temperature difference inside the asset, with T in kelvin per port. Reason: heat moving inside an asset from hot to cold generates entropy even with no other loss (Physics-Ontology).
  - **LOCKED TEXT CHANGED, Step 2a.** Was "dS_gen,c/dt = D_c / T_c". Now adds Q_c (1/T_t - 1/T_s). Reason: for heat conduction P_c^s = P_c^t, so D_c = 0 and the old formula gave zero entropy generation, which is wrong.
  - **LOCKED TEXT CHANGED, Step 3c.** Was "d_iS/dt = sum_i D_i/T_i + sum_c D_c/T_c >= 0". Now sums the corrected Step 1 and 2a terms. Same reason.
  - No other locked text changed. The (1)/(2) research question and hypothesis block is unchanged.
  - [PROPOSED] text changed: 5a(ii) renamed to the Kron two-port coupling ratio and bounded (old formula reached 2.374); 5d wording; 5e new v2 result (chosen partition is now KCw1-louvain, 7 envelopes; ARI ranges corrected); 5f exactness and the inside-passivity caveat; 5h v2 domain counts; 3f post-fix benchmark spot check and CPU-only note. The v3 sections (5i, 6c, the five-port rule notes) are in `iro-paper/formal-model/FORMAL_MODEL.md` and were updated there.
  - Code fixes behind these numbers (v2 and v3): heat of compression was counted twice (removed the compressor shaft-to-thermal bond; v2 shaft 1.623 to 1.202 MW); heat bonds were reciprocal (now one-way and linear, so Y is not symmetric and passivity is checked, not assumed); the coupling ratio could exceed 1 (bounded); sigma had no units (now kW/K with T_amb as base, checked against exact exergy destruction: exact at design, asset ratios 0.98-1.13 off design in v2 and 0.85-1.23 in v3); calculus-chart smoothing used future samples (now causal, lags 24 / 28.5 / 33 / 37.5 h). Old results are kept as `pre_redteam_*` files.

- **2026-11-19 — ADDED [PROPOSED] hypothesis (8): the reason for envelopes is computing cost (Brant, pt80u and pt82u: "And that's our hypothesis").** Assets are grouped into envelopes and each envelope is reduced to one equivalent asset because in a large or tightly meshed plant the graph, sparse as it is, is still very large, and running the whole thing to predict behaviour and faults in real time would take too much computing. Recorded as a hypothesis to be tested by XB and X4, not a result. The benchmark so far does not support it: on one core the full update took about 20 ms at 10,000 assets, and the envelope solve matched the full solve to within 5e-9 relative but was not faster at any size measured (meshed 100,000 assets, refactorized: 11.64 s full, 25.23 s envelope; `iro-toy-model/v2/scaling/SCALING.md`). Locked step text unchanged; the [PROPOSED] 3f note now points to the hypothesis. Propagated to the Overview, the eight steps, Hypotheses, RQ16, Experimental Design and the Described model.
- **2026-11-19 — ADDED [PROPOSED] 3f: all-pairs bound $25N^2$ ($N_{\mathrm{ports}} = 5N$ under the five-port rule) versus the actual sparse coupling count, with the benchmark consequence for envelopes.** Part of the eight-step framing Brant approved for the whole study (pt68u: "propagate that through the research process"). Locked Step 3 text (3a–3e) unchanged. Numbers from `iro-toy-model/v2/scaling/SCALING.md`. DESCRIBED_MODEL.md now follows the eight steps.

- **2026-11-19 — ADDED: Described model (`iro-paper/DESCRIBED_MODEL.md`), a prose description of each method as the v2 code implements it, for a new "Described model" tab between Vocabulary and Formal model (Brant, pt53u).** No step text changed by it. It lists code-versus-spec gaps, including: entropy uses $T_0 = 1$ pu, not $D_i/T_i$; no per-coupling Onsager $L$ ($q$ computed from the Kron two-port); one plant-level nodal model, not per-asset port-Hamiltonian; port-level incidence with $+1$ at source; Step 6b is implemented and used for source fitting although headed "planned" and "screening only"; Steps 4 and 7 not written; 5e's "ARI 0.24–0.55" does not match discovery_ARI.csv (PF vs KC partitions 0.22–0.48; 0.55 is KC-DC $k=4$ vs engineer and engineer area vs functional) — correction pending Brant.
- **2026-11-19 — LOCKED AMENDMENT (Step 1): five ports per asset, one per domain (mechanical, fluid, thermal, electrical, chemical); unused ports present but empty (Brant).** Gap: v2 code gives each asset only the ports it uses (1–3 ports, 1–3 domains, 71 ports over 32 assets, four domains, no chemical); 7 assets have two ports in one domain. Applying the rule gives 160 ports.
- **2026-11-19 — ADDED [PROPOSED] 5h: envelope boundaries expected to span all five domains (Brant).** Testable hypothesis, not locked. v2 today: 2, 3, 4, 2, 4 domains.

- **2026-11-19 — ADDED [PROPOSED]: Step 5 envelope discovery (5a–5g).** Built and tested in toy model v2 (Brant, pt27u: "build it and add more assets"). Not locked; needs Brant's review. Highlights:
  - **NEW [PROPOSED]:** Kedem-Caplan $q$ evaluated on the Kron two-port of the full plant (5a ii), extending Step 2c from an isolated coupling to the coupling in context.
  - **NEW:** null-model and stability scores are required with every discovered partition (5c), because the v2 modularity did not beat sparse-graph chance.
  - **NEW:** fixed selection rule for downstream envelopes (5d).
  - **NEW [PROPOSED]:** least-power tie-break for source attribution. Among candidate sources that fit the sensors equally well ($\ge 0.99$ of the best), pick the one needing least injected power $|a|^2 \operatorname{Re} Z_{pp}$. Needed because boundary-only sensing cannot separate collinear internal sources (v2 failure test F3).
  - **NEW (damage, toward RQ10):** the v2 failure test adds a temperature coordinate (all thermal ports) and a fatigue coordinate (combined modal response) to $\sigma$, all under one uniform margin rule, because $\sigma$ alone missed thermal ageing and oscillatory fatigue.
  - Step 6b used as implemented (Kron/Schur per envelope); no change to its text.

- **2026-11-19 — ADDED: Step 3 plant model; boundary = ideal-source boundary ports, not assets (Brant: yes).**

- **2026-11-19 — ADDED: Step 2 couplings; domain conversion inside the asset (Brant: yes).**
- **2026-11-19 — ADDED: spectral port descriptions and convergent excitation (Brant: yes).** Raised by Brant: separate nominal vibrations combining at a resonance would be lost by averaged-power reductions.

- **2026-11-19 — CHANGE (Step 1): dropped "import/export ports".** An earlier draft split ports into import, export and bidirectional sets. Replaced because (1) direction is a property of the interaction, not the interface: the same port reverses in backflow, startup and faults, the abnormal states that matter; (2) in bond-graph and port-Hamiltonian theory a port is defined by its effort/flow pair and direction comes from the sign of power; (3) the paper already puts source/target on the coupling and reserves "export" for entropy export (negative $d_eS$, maintenance). Direction now lives on the coupling; port directionality kept only as a design constraint **[PROPOSED]**.
- **2026-11-19 — ADDED: Step 6b port-to-port reduction** (Brant's question: can ports map directly to all other ports, skipping transformations?).
