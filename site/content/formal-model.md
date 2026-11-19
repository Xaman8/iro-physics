# IRO Envelope Model: Formal Specification (working)

Vocabulary follows "Grounding Industrial System Ontologies in Physics" (Arseneau & Arseneau, draft 2026.10.27).
Proposed additions are marked **[PROPOSED]**. Changes to earlier steps are recorded in the Change Log.

## Step 1: Asset as a physical behaviour (LOCKED 2026-11-19)

- Asset i has state x_i and stored energy H_i(x_i).
- **Port** (paper): an interface where energy crosses a boundary; typed by domain (mechanical, fluid, thermal, electrical, field) with an effort/flow pair; power = e_p f_p. Ports are direction-neutral.
- **Coupling** (paper): reified relation linking a **source port** to a **target port**; carries nominal direction. Actual direction at time t is the sign of the coupling power P_c(t).
- Energy balance:

  dH_i/dt = sum_{c: target(c) in i} P_c  -  sum_{c: source(c) in i} P_c  -  D_i,   D_i >= 0

- Internal entropy generation: dS_gen,i/dt = D_i / T_i (Prigogine d_iS).
- State-space form: dx_i/dt = (J_i - R_i) grad H_i + G_i u_i,  y_i = G_i^T grad H_i.
- **[PROPOSED] Port directionality**: design constraint of a port, one of {source-only, target-only, reversible}. Not the physics of direction; it states what the port is built to tolerate. P_c(t) against a port's design directionality is an envelope excursion (failure signal).


## Step 2: Couplings (LOCKED 2026-11-19)

- Coupling c links source port s(c) to target port t(c) (paper). Medium/structure is a property of the coupling.
- 2a Energy accounting: P_c^s - P_c^t = D_c >= 0; dS_gen,c/dt = D_c / T_c. Ideal direct-port coupling D_c = 0.
- 2b Constitutive law (Onsager): J = L X, L symmetric (L12 = L21), L positive semidefinite; entropy production sigma_c = X^T L X >= 0.
- 2c Coupling strength (Kedem-Caplan): q_c = L12 / sqrt(L11 L22), |q_c| <= 1. Weight for envelope detection (Step 5) and energy-weighted distance (Step 7).
- 2d Topologies (paper): direct port (stiff, ~lossless), medium-only (lossy, delayed), structure-mediated (weak, often unexpected cross-envelope path).
- 2e **Domain conversion lives inside the asset** (decided 2026-11-19): assets own ports of different domains; couplings join same-domain ports. Domain-crossing distance = number of converting assets on a path.
- 2f **Spectral description** [PROPOSED]: each port/coupling carries power spectral density and cross-spectral density with other ports (phase kept). Each asset carries resonance data (natural frequencies, damping) in its design envelope.


## Step 3: The plant (LOCKED 2026-11-19)

- 3a Graph G = (A, C): assets = nodes, couplings = edges between ports. Incidence B_ic = +1 if asset i holds target port of c, -1 if source port, 0 otherwise. dH/dt (vector) = B P_C - D_A.
- 3b Port-Hamiltonian form: x' = (J(x,theta) - R(x,theta)) grad H + G_b u_b, y_b = G_b^T grad H, H = sum_i H_i. J skew (lossless interconnection), R >= 0 (all dissipation incl. Onsager L blocks), theta(t) = operating state.
- 3c dH/dt = y_b^T u_b - grad H^T R grad H; d_iS/dt = sum_i D_i/T_i + sum_c D_c/T_c >= 0. Maintenance = entropy export (negative d_eS), per paper.
- 3d J and R depend on theta: coupling graph, envelopes and cross-envelope failure paths can be operating-mode dependent (e.g. startup).
- 3e Plant boundary (decided 2026-11-19): reservoir, ambient, grid, fuel supply are boundary ports backed by ideal sources (fixed effort), not assets. "Asset" = something owned and maintained. Same boundary notion reused for envelopes.

## Step 5: Envelope discovery [PROPOSED] (2026-11-19, not locked)

Envelopes are found from the plant's physics, not assigned. Tested in toy model v2 (`iro-toy-model/v2/discover_envelopes.py`).

- 5a Coupling weights, each computed from the Step 3 plant alone: (i) design power flow |P_c| per coupling; (ii) **[PROPOSED]** Kedem-Caplan degree of coupling of the Kron two-port, q_c(w) = |Y12| / sqrt(|Y11||Y22|), where Y is the full plant Y(jw) reduced onto the two ports of coupling c, per band w (this is Step 2c evaluated on the whole plant, not the isolated coupling); (iii) timescale signatures (participation factors per timescale decade, Perez-Arriaga et al.); (iv) slow coherency (Winkelman et al.).
- 5b Partitioning: normalised spectral clustering (k from the eigengap) and Louvain modularity, on the asset graph with weights from 5a.
- 5c Scores reported with every partition: eigengap, modularity Q, **null models** (weight shuffle and degree-preserving rewiring; modularity alone does not show envelopes, Guimera et al. 2004), stability under +/-10 % and +/-30 % parameter perturbation (ARI), sensitivity to the parasitic-coupling rule, strong-inside/weak-between ratio of q, and ARI against the engineer's grouping.
- 5d Selection rule (fixed before scoring against the engineer): among the power-flow and Kedem-Caplan partitions, the one with the highest mean ARI under +/-30 % parameter perturbation; ties go to higher Q, then the DC weighting.
- 5e Result on v2 (32 assets): partly emergent. Power-flow Louvain gives 5 stable envelopes that follow energy chains (ARI 1.0 under perturbation; ARI 0.43 vs the engineer's functional grouping). Methods agree only partly (ARI 0.24-0.55). Q is not above the nulls. Kedem-Caplan q is strong inside and weak between (median 0.85 inside vs 0.28 between).
- 5f Each discovered envelope is reduced by Step 6b to an envelope-asset (boundary ports, Z_E(s), Norton equivalent, reconstruction map) and couples to the others through the unchanged cross-envelope couplings. In the linear model this is exact and passive (checked).
- 5g Open: operating-mode dependence (3d, RQ13); recursion (RQ3); choice between weights when they disagree.

## Failure mechanism: Convergent excitation [PROPOSED] (2026-11-19)

Two or more sources, possibly in different envelopes, each within limits, whose combined response at a target asset exceeds its limit (in-phase superposition, frequency near resonance, or nonlinear mixing w1 +/- w2). Damage is computed on the combined response (fatigue ~ A^m), never summed per source. Averaged-power (SEA-style) envelope summaries cannot detect it.

## Step 6b (planned): Port-to-port reduction [PROPOSED]

- Eliminate internal states (Schur complement / Kron reduction) to get a port-to-port map y(s) = Z(s) u(s), valid per operating state (linearised).
- |Z_jk| at the fault band = transfer-attenuation distance.
- Derived view for fast screening only; the coupling graph remains the model because the map loses path/attribution, nonlinearity and damage in eliminated assets.

## Change Log

- **2026-11-19 — ADDED [PROPOSED]: Step 5 envelope discovery (5a-5g).** Built and tested in toy model v2 (Brant, pt27u: "build it and add more assets"). Not locked; needs Brant's review. Highlights:
  - **NEW [PROPOSED]:** Kedem-Caplan q evaluated on the Kron two-port of the full plant (5a ii), extending Step 2c from an isolated coupling to the coupling in context.
  - **NEW:** null-model and stability scores are required with every discovered partition (5c), because the v2 modularity did not beat sparse-graph chance.
  - **NEW:** fixed selection rule for downstream envelopes (5d).
  - **NEW [PROPOSED]:** least-power tie-break for source attribution. Among candidate sources that fit the sensors equally well (>= 0.99 of the best), pick the one needing least injected power |a|^2 Re Z_pp. Needed because boundary-only sensing cannot separate collinear internal sources (v2 failure test F3).
  - **NEW (damage, toward RQ10):** the v2 failure test adds a temperature coordinate (all thermal ports) and a fatigue coordinate (combined modal response) to sigma, all under one uniform margin rule, because sigma alone missed thermal ageing and oscillatory fatigue.
  - Step 6b used as implemented (Kron/Schur per envelope); no change to its text.

- **2026-11-19 — ADDED: Step 3 plant model; boundary = ideal-source boundary ports, not assets (Brant: yes).**

- **2026-11-19 — ADDED: Step 2 couplings; domain conversion inside the asset (Brant: yes).**
- **2026-11-19 — ADDED: spectral port descriptions and convergent excitation (Brant: yes).** Raised by Brant: separate nominal vibrations combining at a resonance would be lost by averaged-power reductions.

- **2026-11-19 — CHANGE (Step 1): dropped "import/export ports".** An earlier draft split ports into import, export and bidirectional sets. Replaced because (1) direction is a property of the interaction, not the interface: the same port reverses in backflow, startup and faults, the abnormal states that matter; (2) in bond-graph and port-Hamiltonian theory a port is defined by its effort/flow pair and direction comes from the sign of power; (3) the paper already puts source/target on the coupling and reserves "export" for entropy export (negative d_eS, maintenance). Direction now lives on the coupling; port directionality kept only as a design constraint [PROPOSED].
- **2026-11-19 — ADDED: Step 6b port-to-port reduction** (Brant's question: can ports map directly to all other ports, skipping transformations?).
