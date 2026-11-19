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

## Failure mechanism: Convergent excitation [PROPOSED] (2026-11-19)

Two or more sources, possibly in different envelopes, each within limits, whose combined response at a target asset exceeds its limit (in-phase superposition, frequency near resonance, or nonlinear mixing w1 +/- w2). Damage is computed on the combined response (fatigue ~ A^m), never summed per source. Averaged-power (SEA-style) envelope summaries cannot detect it.

## Step 6b (planned): Port-to-port reduction [PROPOSED]

- Eliminate internal states (Schur complement / Kron reduction) to get a port-to-port map y(s) = Z(s) u(s), valid per operating state (linearised).
- |Z_jk| at the fault band = transfer-attenuation distance.
- Derived view for fast screening only; the coupling graph remains the model because the map loses path/attribution, nonlinearity and damage in eliminated assets.

## Change Log

- **2026-11-19 — ADDED: Step 3 plant model; boundary = ideal-source boundary ports, not assets (Brant: yes).**

- **2026-11-19 — ADDED: Step 2 couplings; domain conversion inside the asset (Brant: yes).**
- **2026-11-19 — ADDED: spectral port descriptions and convergent excitation (Brant: yes).** Raised by Brant: separate nominal vibrations combining at a resonance would be lost by averaged-power reductions.

- **2026-11-19 — CHANGE (Step 1): dropped "import/export ports".** An earlier draft split ports into import, export and bidirectional sets. Replaced because (1) direction is a property of the interaction, not the interface: the same port reverses in backflow, startup and faults, the abnormal states that matter; (2) in bond-graph and port-Hamiltonian theory a port is defined by its effort/flow pair and direction comes from the sign of power; (3) the paper already puts source/target on the coupling and reserves "export" for entropy export (negative d_eS, maintenance). Direction now lives on the coupling; port directionality kept only as a design constraint [PROPOSED].
- **2026-11-19 — ADDED: Step 6b port-to-port reduction** (Brant's question: can ports map directly to all other ports, skipping transformations?).
