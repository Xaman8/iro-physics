# Described model

This page describes in prose what the IRO toy models compute and how they compute it, in the order of the eight steps below, one method at a time. Unless a passage says v1, it describes toy model v2: a 32-asset lumped linear plant built with typical engineering parameters, not plant data. The code in `iro-toy-model/v2/` is the authority. Where the code and the Formal model tab disagree, this page says what the code does and records the gap in the last section. Formal-model steps that are not locked are marked [PROPOSED]. "Step 1" to "Step 8" in headings are the eight steps of the approach. A step of the Formal model is always called "Step N of the Formal model" or "the Formal model's Step N". Every number below comes from `v2/results/`, from `v2/scaling/SCALING.md`, or from rerunning the v2 code on 2026-11-19. The few numbers that are our own arithmetic are labelled as such.

## The approach in eight steps

- **Step 1.** The plant is assets joined by couplings.
- **Step 2.** Every asset is an energy transfer function with five ports: mechanical, fluid, thermal, electrical and chemical, some of them unused. Energy changes kind inside an asset and travels between assets along couplings.
- **Step 3.** The simplest view is every asset against every other. With five ports each, that is $(5N)^2 = 25N^2$ possible port-to-port links, or 2.5 billion at 10,000 assets.
- **Step 4.** Most of those links are zero and the rest are linear. A plant has a few couplings per asset, so it is a sparse linear system that a CPU solves quickly. A GPU has not been tested. In the benchmark one update took about 20 ms at 10,000 assets on one CPU core. Cost rises sharply for densely meshed plants and for simulation that resolves the time domain.
- **Step 5.** Model it differently: find natural envelopes from coupling strength. Our hypothesis is that in a large or tightly meshed plant, running the whole graph in real time would take too much computing.
- **Step 6.** Each envelope becomes one asset with boundary ports.
- **Step 7.** A failure crosses envelopes.
- **Step 8.** Detect it and trace it back. Instruments show the fault developing, and the model works backwards to name the source.

Step 4 leads to the hypothesis behind envelopes, hypothesis (8) [PROPOSED] (Brant, 2026-11-19). The plant graph is sparse, but in a large or tightly meshed plant it is still very large, and running the whole thing to predict behaviour and faults in real time would take too much computing. So the assets are grouped into envelopes and each envelope is reduced to one equivalent asset. The benchmark has not supported this yet. On one core the full sparse solve took about 20 ms per update at 10,000 assets, and the envelope solve was exact but no faster at any size measured, including the meshed 100,000-asset plant (11.64 s full against 25.23 s envelope, refactorized). The hypothesis therefore depends on cases not measured so far: plants larger or more meshed than those tested, a real-time update rate faster than the 6-hour means the v2 predictors use, cheap updates when one part of the plant changes, parallel work across envelopes, and recursion (envelopes of envelopes). Revealing behaviour that involves several assets at once is a separate argument, lead hypothesis (2). XB and X4 in the Experimental Design are the planned tests.

## Step 1. The plant is assets joined by couplings

The v2 plant has 32 assets joined by 50 couplings, with 31 bonds inside the assets and 71 ports in use. Its mean coupling degree is 3.1 couplings per asset, and the most connected asset has 6 (from `scaling/SCALING.md`). The plant boundary (grid, ambient, reaction heat, gas users) is made of ideal-source boundary ports, not assets (Step 3e of the Formal model).

A coupling is a reified relation from a source port on one asset to a target port on another (paper). In v2 both ends are always in the same domain, and a test enforces this. The coupling carries its mechanism, length and topology. The topology is one of the paper's three: direct port, medium-only or structure-mediated. The nominal direction is source to target. The actual direction at any moment is the sign of the coupling power.

In the code, a coupling is the same kind of element as a bond, a resistance $R$ with an optional inertance $L$. The only difference is that its two ends sit on different assets. v2 has 50 couplings and 31 bonds. Four of the couplings are parasitic heat paths: R1→BRG1 and R1→GB1 are structure-mediated, and VFD2→VFD1 and C1→M6 are medium-only. Parasitic couplings carry no budgeted flow. Their conductance is set to KAPPA × the target port's designed loss, with KAPPA = 0.05. That value is an assumption, and the discovery test also runs it at 0.01 and 0.2.

The Formal model's Step 2b–2c writes coupling physics as an Onsager matrix $L$ and defines coupling strength as the Kedem–Caplan degree of coupling $q = L_{12}/\sqrt{L_{11}L_{22}}$ (Onsager 1931; Kedem and Caplan 1965). The code has no per-coupling Onsager matrix. Instead it computes a coupling ratio from the admittance of the whole plant reduced onto the coupling's two ports (step 5). Since 2026-11-19 this is called the Kron two-port coupling ratio, not the Kedem–Caplan $q$: it is built like $q$ but is not an Onsager quantity, and the earlier formula could exceed 1 (step 5). The substitution is marked [PROPOSED] in the Formal model's Step 5a. The code still labels it "KC".

## Step 2. Every asset is an energy transfer function with five ports

An asset is a set of ports plus the bonds that link them. A port is "an interface where energy crosses a boundary" (Arseneau and Arseneau, draft 2026.10.27). Each port has a domain and carries an effort and a flow, and their product is the power through the port. Ports are direction-neutral. Direction belongs to couplings (step 1).

**Five ports per asset (LOCKED 2026-11-19, Brant).** Every asset has exactly five ports, one in each domain: mechanical, fluid, thermal, electrical and chemical. A port the asset does not use is kept as an empty port: it has zero power and nothing is connected to it. In v2, for example, pump P1 uses only a mechanical and a fluid port; under the rule it also carries empty electrical, thermal and chemical ports.

The v2 code does not follow this rule yet. It gives each asset only the ports it uses, and it has only four domains: 24 fluid, 18 thermal, 16 mechanical and 13 electrical ports, which is 71 ports over 32 assets. There is no chemical domain. Six assets have 1 port, 13 have 2 and 13 have 3. Counted by domain, 8 assets use one domain, 16 use two and 8 use three. Seven assets have two ports in the same domain: a valve's inlet and outlet (CV1, CV2), a gearbox's input and output shafts (GB1), and the two fluid streams of a heat exchanger or cooler (HX1, HX2, IC1, CT1). Under the five-port rule each of those pairs has to become one port. How a port should carry a pressure drop across a valve, or two separate streams, has not been decided yet (see the gaps section). With the rule applied, the plant would have 32 × 5 = 160 ports.

The effort and flow in each v2 domain are:

- Electrical: effort is voltage, flow is current, both per unit of each bus's nominal value.
- Mechanical: effort is shaft speed and flow is torque, per unit of each machine's rating. This is the mobility form. The v15 vocabulary lists force/torque first and velocity second, but the product (power) is the same either way.
- Fluid: effort is pressure, flow is volume flow. The pressure base differs for each medium.
- Thermal: effort is the temperature rise above ambient divided by the absolute ambient temperature, $T_{\mathrm{amb}}$ = 298.15 K, and flow is heat flow in MW. Before 2026-11-19 the divisor was 100 K. This is a pseudo-bond: effort × flow is not a power. With the $T_{\mathrm{amb}}$ base it is $Q\,\Delta T/T_{\mathrm{amb}}$, the small-ΔT linearisation of the exergy carried by the heat. The energy crossing a thermal link is the heat flow itself, and the code treats it that way.

The power base is 1 MW and the time base is 1 s.

The code writes each port as one node with one effort state. Each node has a storage $C_p$ and a designed loss conductance $g_p$ to the port's reference effort, which is zero, or ambient for thermal ports. Storage comes from rotor inertia, fluid compliance or thermal capacity. Each bond between two work-domain ports inside an asset is a per-unit transformer of modulus 1 with a series loss, and in per unit that is just a resistance $R$, sometimes in series with an inertance $L$. A bond into a thermal port is one-way (since 2026-11-19, below): the source sees a loss conductance, and the power it draws arrives at the thermal port as heat, with no path back. Domain conversion, for example motor current to shaft torque, happens only on bonds inside an asset (the Formal model's Step 2e). Gyrators such as torque–current are represented as per-unit transformers.

Parameters come from a design power budget. Each port gets a design effort, and each bond and coupling gets a nominal flow. Then $R$ is the effort drop divided by the flow, and $g$ closes each port's balance. When the network is solved at DC under nominal conditions it reproduces the budget to 1e-14, and a test checks this. `PARAMETERS.md` lists every value and its source.

**Entropy generation is used as a provisional damage proxy.** Bryant, Khonsari and Ling (2008) tie damage to the entropy generated by the degradation process itself, not to all the entropy an asset generates. Here the total σ of an asset stands in for that, and designed losses such as heat rejected in a cooler are not damage.

Since 2026-11-19 σ is an entropy generation rate in kW/K. Each loss term is weighted by $T_{\mathrm{amb}}/T$, with $T$ the absolute temperature where the loss lands, taken at the design point:

$$\sigma_a = \frac{1}{T_{\mathrm{amb}}}\Big(\sum_{p \in a} w_p\, g_p\,(e_p - e_{\mathrm{ref},p})^2 + \sum_{b \in a} w_b\, R_b\, f_b^2\Big), \qquad T_{\mathrm{amb}}\,\sigma_a = \text{exergy destroyed (MW)}.$$

- A work-domain port loss or a bond loss that leaves the network has $w = 1$.
- A thermal port's loss to ambient has $w = T_{\mathrm{amb}}/T_p = 1/(1 + e_{p,0})$, so the term is $Q\,(1 - T_{\mathrm{amb}}/T_p)$, the exergy lost when the heat reaches ambient.
- A loss that lands as heat at a thermal port $h$ (a one-way heat bond, or a routed loss) has $w = 1/(1 + e_{h,0})$, which gives $D\,T_{\mathrm{amb}}/T_h$.
- Heat flowing between two thermal ports has $w = 1/\big((1+e_{s,0})(1+e_{t,0})\big)$, which gives $Q\,T_{\mathrm{amb}}\,(1/T_t - 1/T_s)$, so heat transfer generates entropy (Step 2a of the Formal model as corrected on 2026-11-19).

The weights are frozen at the design temperatures, so σ stays a quadratic form in the efforts. For a sinusoidal line the same formula is applied to the phasor amplitudes with a factor of 1/2. A coupling's own dissipation is kept on the coupling, not on either asset.

**How close is that to the exact value?** `exergy_check.py` compares $T_{\mathrm{amb}}\sigma$ with an exact Gouy–Stodola account that uses the actual absolute temperatures of each solved state. Per asset (assets with at least 0.1 % of the plant total), the ratio is 1 to rounding at the design point, by construction. Over load 0.8–1.2, grid 0.97–1.03 and ambient 0 to +20 K it is 0.983–1.126 (worst HX1), and over 40 perturbed plants (±10 %) at three operating points it is 0.972–1.093. The plain linearisation with the same base and no weights gives 0.879–1.164 and 0.860–1.142. Booking work-domain losses at the owning asset's temperature instead of at ambient moves the off-design upper end to 1.25. (`v2/results/exergy_check.json`.)

**Corrections made on 2026-11-19 (red team).** Four modelling errors were fixed in v2, and the results on this page are from the re-run:

- **Compressor heat counted twice.** C1's heat of compression sat on a separate 0.413 MW mechanical-to-thermal bond on top of the impeller's own series loss. The shaft carried 1.623 MW instead of the design 1.2 MW, and M6 drew 1.682 MW against its 1.25 MW rating. Now the impeller's series loss is the heat of compression, routed once to C1.thermal. The shaft carries 1.202 MW and M6 draws 1.246 MW.
- **Heat could drive shafts.** Bonds into thermal ports were reciprocal, so heat injected at a bearing's thermal port could push torque back into the shaft, and the power drawn ($e_s f$) differed from the heat delivered ($f$). The 14 bonds into thermal ports are now one-way: heat delivered equals the power drawn at the design point. The model stays linear, but $Y$ is no longer symmetric. Off the design point the delivered heat uses the design effort, so the first law has a small gap off design: −15 kW at grid 0.97, which is 3.1 % of the 0.48 MW carried by the heat bonds. A test checks that the balance closes exactly once this gap is counted.
- **Coupling ratio above 1.** See step 5.
- **Entropy units.** As above.

v2 found that σ alone misses thermal ageing and oscillatory fatigue. The failure test therefore applies the same margin rule to three damage coordinates:

- σ: the Safe limit is SAFE_FACTOR × the nominal peak, and 20 days at 2 × Safe is a failure.
- Temperature at every thermal port: Safe is the nominal peak plus 10 K. Ageing doubles for every 10 K above Safe, and 20 days at 20 K over is a failure.
- Fatigue on the one modelled structural mode (HDR1, 24.4 Hz): Basquin slope $m = 3$, computed on the combined, phase-summed response.

Taken together, an asset's ports, storages, designed losses and bonds define a linear map from the flows injected at its ports to the efforts at its ports. That map is the asset's energy transfer function. The term is the eight-step framing's; the code has no separate per-asset object for it.

## Step 3. Every asset against every other

The simplest model of interaction allows any port to affect any other port directly. With $N$ assets and five ports each there are $N_{\mathrm{ports}} = 5N$ ports, and so $(5N)^2 = 25N^2$ ordered port pairs. At 10,000 assets that is $2.5 \times 10^9$ possible links. A dense matrix of that size, holding one complex number per entry at one frequency, would take about 40 GB. That figure is our arithmetic ($2.5 \times 10^9 \times 16$ bytes), not a measurement.

The scaling benchmark used v2's actual port set, about 2.2 ports per asset rather than 5, so its dense figures are smaller. At 10,016 assets there were 22,223 ports, and the dense complex matrix alone would take 7.9 GB, which does not fit in the box's 15 GB once a dense LU is attempted. At 100,000 assets it would take 788 GB. Dense solve time grew with exponent 2.84 (theory: 3).

## Step 4. Mostly zeros, and linear: one sparse system

The all-pairs bound is far from the real count. The 10,016-asset benchmark plant has 15,650 couplings plus 590 ties between tiles, which is 16,240 links against a bound of about $2.5 \times 10^9$. Its admittance matrix holds about 7.4 nonzeros per asset. Most of the all-pairs matrix is zero, and the part that is not zero is linear in this model class.

All ports and links are assembled into one nodal equation in the Laplace variable $s$:

$$Y(s)\,e = J, \qquad Y(s) = \operatorname{diag}\!\big(sC + g + g_{\mathrm{bnd}}\big) + B_c\,\operatorname{diag}\!\Big(\frac{1}{R + sL}\Big)\,B_v^{\mathsf T}.$$

Here $e$ is the vector of 71 port efforts and $J$ is the vector of flow injections. $B_v$ says what drives each link's flow: +1 at the source port and −1 at the target port, or 0 at the target of a one-way heat bond. $B_c$ says where the flow lands: +1 at the source, −1 at the target of a two-way link, and $-k_a$ at the thermal port that receives a link's heat, with $k_a$ the design source effort (one-way bond) or the design effort drop (routed loss). For couplings $B_c = B_v$, so $Y$ is symmetric except for the 14 one-way bonds and the one routed loss. The plant boundary is not made of assets (the Formal model's Step 3e). The grid at XF1 is a Norton source with conductance $g_{\mathrm{bnd}}$. The gas users at KO1 are a boundary conductance. The 2 MW of reaction heat at R1 is an injection, and ambient enters through the thermal reference. A steady operating point is one solve at $s = 0$. The steady response to a sinusoid at frequency ω is one solve at $s = j\omega$.

The same elements also give a state-space matrix $A$. Its states are the 71 port efforts plus the flows of the 39 links that have inertance, 110 states in all. Time constants range from about 3.5 µs (electrical, which the model does not resolve) to about 5.1 h (thermal). The code uses $A$ only for eigenmodes, in the timescale discovery methods, and for a stability test. The failure test does not integrate it in time. Each hour of the truth simulation is a DC solve for the operating point plus steady-state phasors for each line, which makes it quasi-static.

$Y$ is structurally sparse: 219 of its 5,041 entries are nonzero. The v2 failure-test code nevertheless stores and solves it with dense NumPy routines. The scaling benchmark below solves the same equations with sparse LU.

**What is linear and what is not.** All the plant physics in v2 is linear and lumped. Advection is linearised, there are no transport delays, and pipes are lumped even at 25 Hz. The nonlinear parts sit outside the solve:

- Cavitation (F2) and surge (F3) are sinusoidal flow injections at fixed frequencies whose amplitudes grow over time. They are not nonlinear dynamics.
- Fouling (F1) is a change in a parameter. In the truth simulation it is applied as an exact rank-one (Sherman–Morrison) update of the DC solution.
- The damage functions are nonlinear: σ is quadratic in effort and has a threshold, temperature ageing is exponential, and fatigue follows a power law on the combined amplitude. They are evaluated after the linear solve.

v2 has no nonlinear mixing. The v1 convergent-excitation test had a mixing term, and it showed that any linear map misses the product frequency.

**What the benchmark measured.** The figures below are from `iro-toy-model/v2/scaling/SCALING.md`. Its plants are tiles of the v2 plant, run on one core of the box (Intel Xeon, 15 GB RAM, SciPy SuperLU), with every run single-threaded. One update means a DC solve, five fault-band solves, σ and its three derivatives for every asset, and online root-cause scoring.

| Plant | Update, factorizations stored | Update, refactorized | Plant-year at 6 h |
|---|---|---|---|
| 10,016 assets, grid | 19.8 ms | 141.7 ms (meshed 155.5 ms) | 28.86 s cached, 3.5 min refactorized |
| 100,000 assets, grid | 273.8 ms | 1.55 s (meshed 11.64 s) | 6.7 min cached, 37.8 min refactorized (meshed 4.7 h) |

SCALING.md rounds the 10k update to 20 ms and 0.14 s. The cost of a sparse direct solve depends on how well the coupling graph splits into pieces with small separators (George 1973; Lipton, Rose and Tarjan 1979; Davis 2006). Sparse cost grows almost linearly when couplings are local: the fitted exponents for the cached and refactorized update are 1.09 and 1.02. Random long-range ties, the meshed variant, raise the cost. Its factorization exponent is 1.50 over the whole range and about 2.3 between 30k and 100k assets.

Three workloads do not scale:

- Dense algebra.
- Exact offline attribution tables, which grow as $O(N^2)$ and take 41.2 min per fault band at 100k assets (extrapolated from a chunk).
- Time-domain simulation that resolves the 24–25 Hz fault lines. That needs about 650 steps per simulated second. A plant-year would take about 1.6 years of compute at 3k assets and an estimated 4–7 years at 10k. The model avoids this by using phasors for oscillatory content and 6-hour quasi-static steps for slow content.

The benchmark did not use a GPU. Any GPU speed-up is an estimate, not a measurement.

The benchmark was measured before the 2026-11-19 corrections. After them it was re-checked at 32, 992 and 10,016 assets (sparse, grid ties; `scaling/results/bench_sparse_postfix_check.jsonl`). At 10,016 assets the update with stored factorizations took 19.3 ms (19.8 ms before) and the refactorized update 162.7 ms (141.7 ms before), and the envelope solve still matched the full solve (relative error 1.2e-14 at DC). The one-way bonds make $Y$ non-symmetric, so the attribution step now solves with $Y^{\mathsf T}$ instead of relying on symmetry. The tables above are the pre-correction measurements; the full sweep to 100,000 assets was not repeated.

## Step 5. Natural envelopes from coupling strength

An envelope [PROPOSED term] is a group of assets found from the plant's physics, not assigned by the modeller (the Formal model's Step 5, [PROPOSED]). The paper itself notes that IRO sources use "envelope" in two senses. Here it means a grouping, not an operating envelope. The discovery code never reads the engineer's groupings. They are used only to score the result afterwards.

Every coupling gets a physics weight, and the asset graph is then partitioned. The code builds four kinds of weight:

- **PF, power flow.** The weight is the magnitude of the nominal energy flux through each coupling at the design operating point (heat flow for thermal links), summed over all couplings between the same two assets.
- **KC, Kron two-port coupling ratio [PROPOSED weight].** For each coupling, the whole plant's $Y(j\omega)$ is Kron-reduced onto the coupling's two ports. With $H$ the Hermitian part of that 2 × 2 matrix, the ratio is $q_c = \lvert H_{12}\rvert/\sqrt{H_{11} H_{22}}$, which lies between 0 and 1 whenever $H$ is positive semidefinite. The edge weight between two assets is the largest $q_c$ among their couplings. This is computed at five bands: DC, 0.01, 1, 6 and 150 rad/s. Until 2026-11-19 the code used $\lvert Y_{12}\rvert/\sqrt{\lvert Y_{11}\rvert\lvert Y_{22}\rvert}$ and called it the Kedem–Caplan $q$. That value reached 1.004 at 1 rad/s, 1.058 at 6 rad/s and 2.374 at 150 rad/s, so it was not a degree of coupling. With the new formula the largest value is 0.987 at DC and 0.979 at 150 rad/s, and no pair had to be clipped.
- **TS-sig, timescale signature.** For each asset, the code takes the participation factors of the modes of $A$ (Pérez-Arriaga et al. 1982), groups them by decade of time constant from 1e-7 s to 1e5 s, and clusters assets by the cosine similarity of these profiles.
- **TS-coh, slow coherency** (Winkelman et al. 1980). Assets are grouped by their energy-weighted coordinates in the slowest modes. The number of slow modes is set by the largest gap in time constant. Only 2 assets have enough slow participation to be placed (9 before the 2026-11-19 corrections).

Two partitioning algorithms run on each weighted graph. One is normalised spectral clustering (von Luxburg 2007), with $k$ chosen by the largest eigengap for $k$ from 2 to 10. The other is Louvain modularity maximisation (Blondel et al. 2008; Newman 2006), run from 50 seeds with the best $Q$ kept. Agreement between partitions is measured with the adjusted Rand index, ARI (Hubert and Arabie 1985), where 1 means identical.

Every partition is reported with the same set of checks:

- Stability: mean ARI over 40 perturbed plants, at ±10 % and at ±30 % of every parameter.
- Sensitivity to KAPPA.
- Two modularity null models: weights shuffled over the same topology, and degree-preserving rewiring (Guimerà et al. 2004).
- Whether coupling is strong inside envelopes and weak between them.
- ARI against the engineer's functional and area groupings.

The rule for choosing the envelopes used downstream was fixed before the scoring: among the PF and KC partitions, take the one with the highest mean ARI under ±30 % perturbation. Ties go to the higher $Q$, then to the DC weighting.

**What was found.** After the 2026-11-19 corrections the rule chose KCw1-Louvain (the coupling ratio at 1 rad/s), which gives seven envelopes with $Q = 0.66$. Its mean ARI at ±30 % perturbation is 0.98 (minimum 0.87). Before the corrections the rule chose PF-Louvain, with five envelopes. PF-Louvain still finds the same five groups, but its stability at ±30 % fell from 1.00 to 0.91, so it no longer wins. The chosen partition's ARI against the engineer's functional grouping is 0.32 (PF-Louvain: 0.43). Named after the fact, the envelopes are:

| Envelope | Assets |
|---|---|
| Supply | XF1, SWG1, VFD1, VFD2 |
| MCC1 pumps + fan | MCC1, M2, P2, M3, FAN1 |
| Drives | MCC2, P3, M5, M4, GB1 |
| CW pump 1 | M1, P1, HDR1 |
| Reactor + heat rejection | CV1, HDR2, CT1, HX1, R1, AG1, BRG1 |
| Oil + bearing | CV2, BRG2, LOP1, HX2 |
| Gas train | M6, C1, IC1, KO1 |

The result is partly emergent, which is the RQ1 verdict so far. Several findings support that reading:

- The methods agree with each other only partly. Between the PF and KC partitions (excluding the runs with $k$ forced to 4), ARI ranges from 0.22 to 0.64. Against the engineer's functional grouping, the PF and KC partitions score 0.16–0.55 (the 0.55 is KC-DC with $k$ forced to 4). The engineer's own two groupings agree at 0.55.
- Which partition the rule picks is itself sensitive: a modelling correction that left PF-Louvain's own grouping unchanged changed the winner.
- The discovered groups follow energy chains, such as a drive train with its feeder, the lube-oil loop, the gas train and the heat-rejection trunk. The engineer's groups are functional systems. Only 34 % of assets sit in a KCw1-Louvain envelope that lies wholly inside one engineer group (PF-Louvain: 22 %).
- The timescale methods find domain and timescale layers, mainly thermal versus the rest. TS-sig scores ARI 0.01 against the engineer.
- Modularity is not evidence of envelopes in this plant. The PF $Q$ of 0.53 is close to the $Q$ of the unweighted topology (0.52), and it is below the weight-shuffle null (0.75 ± 0.06). The KC-DC $Q$ of 0.60 equals its weight-shuffle null (0.60 ± 0.02, $p$ = 0.49). The topology's $Q$ of 0.52 against rewired graphs (0.49 ± 0.02) gives $p$ = 0.16. The chosen KCw1-Louvain partition has $Q$ 0.66 against its own weight-shuffle null of 0.62 ± 0.03 ($p$ = 0.04), which is only just above chance.
- The coupling ratio is strong inside and weak between envelopes. Inside the chosen KCw1-Louvain envelopes the median ratio at DC is 0.84, against 0.31 between them. Inside PF-Louvain envelopes it is 0.85 against 0.31. Inside the engineer's groups it is 0.86 against 0.60.
- Setting KAPPA to 0.01 or 0.2 leaves every partition unchanged (ARI 1.0) except KC-DC spectral and KC 0.01 rad/s spectral, which drop to 0.94 at 0.2.

All of this comes from one operating point. Whether envelopes change with operating mode is RQ13, which is open.

**Boundary domains [PROPOSED expectation, testable hypothesis].** Brant's expectation is that an asset uses only one to three of its five ports, but that as assets are grouped into envelopes, the envelope's boundary comes to use all five domains. This is a hypothesis to test, not a result. In v2 today, no envelope boundary spans five domains, and five is not possible, because v2 has no chemical domain:

| Envelope | Boundary ports | Domains on the boundary | Count |
|---|---|---|---|
| Supply | 3 | electrical | 1 |
| MCC1 pumps + fan | 3 | electrical, fluid | 2 |
| Drives | 4 | electrical, fluid, mechanical, thermal | 4 |
| CW pump 1 | 2 | electrical, fluid | 2 |
| Reactor + heat rejection | 7 | fluid, mechanical, thermal | 3 |
| Oil + bearing | 5 | electrical, fluid, mechanical, thermal | 4 |
| Gas train | 4 | electrical, fluid, mechanical, thermal | 4 |

Individual v2 assets span one to three domains. The largest envelope (seven assets) reaches three domains, and three envelopes of four or five assets reach four, so in this plant the number of domains does not grow simply with envelope size. A fair test needs a plant that has a chemical domain, such as reaction, fuel or corrosion paths, and the five-port rule applied.

## Step 6. Each envelope becomes one asset with boundary ports

This is what `envelope_reduction.py` does, and it is Step 6b of the Formal model [PROPOSED]. The method is Kron reduction, also called a Schur complement, of the envelope's own admittance matrix onto its boundary ports (Dörfler and Bullo 2013).

**Step 1: split the ports.** For an envelope $E$, a boundary port is any port of $E$ that has a coupling to a port outside $E$. All other ports of $E$ are internal. Across the seven discovered v2 envelopes there are 28 boundary ports out of 71, and 18 couplings cross envelope edges.

**Step 2: build the envelope's own admittance.** $Y_E(s)$ contains the storage and designed loss of every port in $E$, any boundary sources on those ports, and every bond and coupling with both ends inside $E$. The couplings that cross the edge are left out of $Y_E$. They are kept unchanged as couplings between envelope-assets. Ordering boundary ports (B) before internal ports (I):

$$Y_E(s) = \begin{pmatrix} Y_{BB} & Y_{BI} \\ Y_{IB} & Y_{II} \end{pmatrix}.$$

**Step 3: eliminate the internal ports.** This gives the boundary admittance, which is the port-to-port map seen from outside:

$$Y_{E,\mathrm{red}}(s) = Y_{BB} - Y_{BI}\,Y_{II}^{-1}\,Y_{IB}, \qquad Z_E(s) = Y_{E,\mathrm{red}}(s)^{-1}.$$

**Step 4: keep two more maps.** Flow injected at internal ports, for example a fault source inside the envelope, is moved to the boundary as a Norton equivalent. Internal efforts can be rebuilt from boundary efforts with the reconstruction map:

$$J_{B,\mathrm{eq}} = J_B - Y_{BI}\,Y_{II}^{-1}\,J_I, \qquad e_I = Y_{II}^{-1}\big(J_I - Y_{IB}\,e_B\big).$$

The envelope-asset is the set of four things: the boundary ports, $Y_{E,\mathrm{red}}(s)$ (or $Z_E(s)$), the Norton map and the reconstruction map.

**Frequencies.** The reduction is evaluated at a specific complex frequency $s$, not fitted once for all frequencies. The code calls it at:

- DC and the five line frequencies of the failure test: 6 rad/s (cavitation), 13.6 rad/s (surge), 151.8 and 155.0 rad/s (the running speeds of P1 and P2), and 9.42 rad/s (agitator).
- A 61-point grid for the passivity check: 0, plus 60 log-spaced points from 1e-4 to 1e3 rad/s.
- 0, 0.1, 10 and 150 rad/s in the tests.

The code makes no rational or state-space fit of $Z_E(s)$. The envelope-asset is therefore a map evaluated frequency by frequency, not a smaller set of differential equations. It does not reduce the model order in the time domain.

**Checks.** The envelope is called passive if the smallest eigenvalue of the Hermitian part of $Y_{E,\mathrm{red}}(j\omega)$ is at least −1e-9 at every point of the grid. All seven reductions pass. Their smallest eigenvalues are 13.6 for Supply, 1.2e-3 for MCC1 pumps + fan, 9.8e-4 for Drives, 2.6e-4 for CW pump 1, 3.4e-5 for Reactor + heat rejection, 1.0e-5 for Gas train and 1.8e-7 for Oil + bearing, so the last few are only marginally passive. "Passive" here is with respect to the pseudo-power $e \cdot f$, which for thermal ports is linearised exergy, not energy.

That test is not enough on its own (Mathematics-Ontology red team, 2026-11-19). A Schur complement keeps $\mathrm{Re}(x^{\mathsf H} Y x) \ge 0$ only if the envelope's own $Y_E$ has it and $Y_{II}$ is invertible. A passive reduction can hide a non-passive inside. The code now also checks each envelope's unreduced $Y_E$ and the condition of $Y_{II}$ on the same grid. $Y_{II}$ is invertible everywhere (largest condition number 4.9e7, Reactor + heat rejection). One envelope fails the inside test: **Gas train**, whose own $Y_E$ has a smallest Hermitian eigenvalue of −1.89e-3, on C1.thermal and IC1.thermal, while its reduction passes at +1.0e-5. The engineer's Gas/compression group fails in the same way (−1.89e-3). Asset by asset, only C1 fails (−0.057, on C1.thermal). The cause is a modelling choice made in the 2026-11-19 fix: the impeller loss is routed into C1.thermal as a one-way heat source, a non-reciprocal term that adds heat to a thermal port with a small loss of its own. The plant as a whole stays passive (smallest Hermitian eigenvalue of $Y$ at DC +5.8e-4). This is recorded as an open item, not tuned away; a true thermal port with entropy as a state would remove the pseudo-power question.

**Exactness.** Solving the plant through the envelope-assets reproduces the full solve to 1.4e-14 at DC. The relative error is at most 1.5e-15 at 6, 13.6 and 150 rad/s. For each envelope, the code also reports the DC exergy destruction inside it and the stored energy $\tfrac12\sum C e^2$.

| Envelope | Assets | Ports | Boundary ports | Internal ports eliminated |
|---|---|---|---|---|
| Supply | 4 | 7 | 3 | 4 |
| MCC1 pumps + fan | 5 | 11 | 3 | 8 |
| Drives | 5 | 12 | 4 | 8 |
| CW pump 1 | 3 | 6 | 2 | 4 |
| Reactor + heat rejection | 7 | 15 | 7 | 8 |
| Oil + bearing | 4 | 10 | 5 | 5 |
| Gas train | 4 | 10 | 4 | 6 |

**What is lost.** In this linear model, at any one frequency, nothing is lost: the reduction is exact. The losses appear when the reduction is used as a replacement for the inside of the envelope:

- **Path and attribution inside the envelope.** $Y_{E,\mathrm{red}}$ has no internal structure. Internal sources with the same boundary signature cannot be told apart from the boundary (F3, Known limits). Recovering internal efforts needs the reconstruction map, and that means keeping the internal model.
- **Damage in eliminated assets.** Damage there is only available through the reconstruction map.
- **Nonlinearity.** A Schur complement assumes linear elements. A nonlinear element inside an envelope would need re-linearisation at each operating point, and v2 does not test that.
- **Operating mode.** The reduction holds for one parameter set and one operating point.
- **Averaging.** Nothing is averaged here. Phase is kept, because $Y_{E,\mathrm{red}}$ is complex. v1 showed that a reduction that keeps only averaged boundary power misses convergent excitation.

### Solving the plant at envelope level

Each envelope's $Y_{E,\mathrm{red}}$ is placed in a $28 \times 28$ matrix on its boundary ports, and the 18 cross-envelope couplings are then added in, in the same way as in step 4. Each envelope's Norton injections are summed into $J_{\mathrm{eq}}$:

$$Y_r(s)\,e_B = J_{\mathrm{eq}}, \qquad Y_r = \operatorname{blockdiag}_E\big(Y_{E,\mathrm{red}}\big) + \sum_{c\ \text{crossing}} y_c(s)\,b_c b_c^{\mathsf T}.$$

Here $y_c = 1/(R_c + sL_c)$ and $b_c$ is +1 at the coupling's source boundary port and −1 at its target. Once $e_B$ is solved, the internal efforts of each envelope come from its reconstruction map.

The REDUCED predictor uses this solve to build transfer maps. For each frequency (DC and the five lines) it injects a unit flow at each of the 71 ports, one port at a time, and records the response at the 28 boundary ports. That is 71 reduced solves per frequency.

In the current code, the REDUCED predictor computes its damage forecast with the full design model's σ and DC maps, not through the reconstruction map. The result is the same, because the reconstruction is exact. At scale, though, the forecast would have to go through the reconstruction map, or the full model would have to be kept.

### Envelope cost against the full sparse solve

The table compares the two approaches at 10,016 assets on the grid plant (1,565 envelopes, 9,390 boundary ports). The benchmark tiles reuse the five PF-Louvain envelopes chosen before the 2026-11-19 corrections; the envelope choice affects only the envelope column. The envelope solution matched the full sparse solution to within 5e-9 relative at every size.

| Update | Full sparse | Envelope |
|---|---|---|
| Factorizations stored | 19.8 ms | 23.2 ms |
| Refactorized (grid) | 141.7 ms | 186.2 ms |
| Refactorized (meshed) | 155.5 ms | 214.7 ms |

At 100,000 assets the refactorized update took 1.55 s full against 2.81 s envelope on the grid plant, and 11.64 s against 25.23 s meshed. SCALING.md explains why: the envelope boundaries act as a hand-chosen separator, which is the same elimination a sparse direct solver performs with a good ordering. The comparison is also Python batched Kron against SuperLU written in C, on one core.

SCALING.md lists where envelopes should win, none of it measured yet:

- A change inside one envelope costs a small local factorization plus a boundary refactor, instead of a full refactor.
- The offline Kron work runs in parallel on several cores.
- Recursion (RQ3) shrinks the boundary system again.

These are the cases hypothesis (8) depends on. The fourth argument, revealing behaviour that involves several assets, is not a cost argument. It is lead hypothesis (2).

## Step 7. A failure that crosses envelopes

The v2 failure test (`failure_test_v2.py`) runs each scenario for 400 days. The truth plant has every parameter perturbed by up to ±10 %, and HDR1's mode varies by ±3 % in frequency and ±20 % in damping. The operating context adds daily load swings, a load step, a 10-day heatwave and noise. Faults start at a random day between day 10 and day 30. The scenarios are:

- F1, slow fouling at the cooling tower CT1.
- F2, cavitation at pump P1.
- F3, surge at compressor C1.
- F4, convergent excitation: P1 and P2 at their running speeds, each below the limit on its own, combine at the HDR1 mode.
- F5, agitator imbalance.
- C0, no fault.

Only F1 crossed an envelope boundary. After the 2026-11-19 corrections the first asset to fail in F1 is CT1 itself in 11 of 20 runs (HX2 in 4, HX1 in 3, C1 in 2); before, it was HX1 or HX2 in every run. Under the engineer's grouping, F1 failed in another group in 9 of 20 runs (20 of 20 before). Under the discovered envelopes it failed in another envelope in 6 of 20 runs (4 of 20 before). F2–F4 failed inside the source's own envelope under both groupings. A plant with more cross-envelope paths is needed to test step 7 properly.

## Step 8. Detect it and trace it back

Attribution is done in `failure_test_v2.py`. The same logic runs for FULL, which has sensors at all 71 ports, REDUCED, which has the 28 boundary ports of the discovered envelopes, and REDUCED_ENG, which has the 22 boundary ports of the engineer's grouping. The model predictors differ only in which ports they sense and which transfer maps they use. LOCAL is a separate baseline that trends each asset's own σ.

**Channels.** There is one DC channel and five line channels, at the five line frequencies listed in step 6. These frequencies are known to the predictor in advance, so this is not a broadband search. The sensors read port efforts (6-hour means of DC effort) and complex effort phasors for each line. They do not read power.

**Source fit.** For each channel, the predictor asks which single port, injecting flow, best explains the sensor pattern. Write the transfer map from port $p$ to the sensors as $h_p$ (column $p$ of $Y^{-1}$, or of the reduced map from step 6), write the noise weights as $W$, and write the observation as $y$. The score and the fitted amplitude are:

$$\mathrm{score}_p = \frac{\lvert (Wh_p)^{\mathsf H}(Wy)\rvert^2}{\lVert Wh_p\rVert^2}, \qquad a_p = \frac{(Wh_p)^{\mathsf H}(Wy)}{\lVert Wh_p\rVert^2}.$$

Source selection uses a 7-day coherent mean of $y$, and the amplitude uses a 1-day mean.

**Least-power tie-break [PROPOSED].** Among candidate ports whose score is at least 0.99 of the best, the predictor picks the one that needs the least injected power, $\lvert a_p\rvert^2\,\mathrm{Re}\,Z_{pp}$, where $Z_{pp}$ comes from the design model at that frequency. Without this rule, boundary-only predictors chose physically absurd internal sources, for example BRG1.thermal at 34,000× background, and alarmed in every control run.

**Detection.** A channel is detected when its daily statistic exceeds the baseline mean by more than 4 standard deviations, with the baseline taken from days 0–8. There is also an observability guard: an amplitude within 3 standard errors of zero is replaced by the design background level.

**Forecast.** Each detected amplitude is extrapolated with a 14-day linear trend. The forecast is passed through the σ quadratic forms, the temperature coordinate and the HDR1 fatigue coordinate to give each asset's accumulated damage. The predictor alarms when any asset's predicted remaining life drops below 120 days.

**Attribution.** For the asset predicted to fail first, the predictor removes each detected channel in turn, setting it back to background. The channel whose removal lowers that asset's forecast damage the most is the cause. The root-cause asset is the owner of that channel's fitted source port.

So in v2, attribution comes from three things: the transfer maps through the couplings (or the reduced port-to-port map), the forecast of entropy generation and the other damage coordinates, and the fitted amplitudes of the DC and line channels. Port power enters only through the tie-break. v1 was different. Its REDUCED predictor measured power flow across the cross-system couplings, and it used energy-balance attribution [PROPOSED]: follow the coupling with the largest rise in power upstream until reaching a system that emits more added power than it receives.

**The calculus charts are display only.** The value, rate, acceleration and jerk charts on the site (0th–3rd derivative order) are drawn from the simulated series so that people can read them. Since 2026-11-19 their smoothing is causal: a trailing 49-hour mean for the value, then a backward difference and a trailing 9-hour mean for each order, so each point uses no later data. The price is a delay of 24, 28.5, 33 and 37.5 hours for orders 0 to 3. Before, the windows were centred and read up to about a day and a half of future data. No derivative is computed in `failure_test_v2.py`, `envelope_reduction.py` or `discover_envelopes.py`, and none is used for detection, forecast or attribution. Whether instrument calculus can detect faults on its own is RQ15, below.

**Three-way detection comparison (RQ15) [PROPOSED].** This is planned but not built. Three detectors would run on the same fault and no-fault runs:

- (a) the model's prediction, as above;
- (b) instrument calculus alone: value, rate, acceleration and jerk of the readings;
- (c) the model's band matching.

The measures would be correct root cause, lead time and false alarms. No results exist yet.

## Distance between assets

`distances_v2.py` asks which distance between a fault source and an affected asset best ranks the size of the effect. There are 12 sources: the failure-test channels plus extra mechanisms, each at its own band. Against the 31 other assets, that makes 372 source–asset pairs. The effect is the change in the target's σ when 50 kW (0.05 pu) is injected at the source port at that band. At DC the absolute change is used, because a DC change can lower σ at some assets.

Each distance is computed from the model alone. None is tuned:

| Distance | Definition | Spearman ρ, pooled | ρ within source, mean [min, max] |
|---|---|---|---|
| Transfer attenuation | −20 log10 of (largest target-port effort / source effort) at the band, in dB | −0.90 | −0.76 [−0.99, −0.39] (11 sources) |
| Domain crossings | fewest domain-converting bonds on a port path | −0.36 | −0.58 [−0.92, −0.11] |
| Line length | shortest pipe, cable or shaft length along couplings | −0.30 | −0.38 [−0.62, +0.14] |
| Asset hops | fewest couplings between the assets | −0.24 | −0.35 [−0.63, −0.15] |
| −log q path | shortest path with edge length −log q (coupling ratio, DC) | −0.22 | −0.37 [−0.65, +0.10] |
| Z distance (v1) | the impedance distance $\lvert Z_{pp} + Z_{tt} - Z_{pt} - Z_{tp}\rvert$, minimised over target ports | −0.21 | −0.20 [−0.46, +0.33] |
| Envelope hops (discovered) | fewest envelope edges crossed | −0.20 | −0.26 [−0.52, −0.05] |
| Physical | straight-line distance between asset coordinates | −0.17 | −0.28 [−0.65, +0.21] |
| Envelope hops (engineer) | the same, on the engineer's grouping | −0.08 | −0.14 [−0.73, +0.43] |

A more negative ρ means the distance ranks the effect better. Transfer attenuation ranks it best, and after the 2026-11-19 corrections much more strongly than before (pooled −0.56 before), but it is partly circular, because the effect scales with the square of effort. A likely reason is the one-way heat bonds: effort at a thermal port no longer travels back into the work domains, which separates near and far targets more sharply. This has not been checked pair by pair. For one of the 12 sources the attenuation is the same for every target, so its within-source ρ is undefined. The distances overlap: physical against line length is 0.58, and line length against −log q is 0.74. No single structural distance is reliable within every source, since most within-source ranges cross zero. Discovered-envelope hops still rank effect better than engineer-envelope hops. The Formal model refers to a Step 7 for distance, but Step 7 has not been written.

## Known limits

These come from the v2 failure test as re-run after the 2026-11-19 corrections, with 20 seeds per scenario at SAFE_FACTOR 2.0, unless stated otherwise.

- **F3: a compressor surge cannot be told apart at the boundary.** C1 and M6 are in the same envelope. At the boundary ports, a surge at C1 looks the same as a source at M6, and the least-power rule picks M6. REDUCED named the wrong failing asset and the wrong root cause in 20 of 20 runs, and its median lead time was 70 days against 140 days for FULL. The engineer's grouping did the same (0/20 right, 70 days). This is a loss of observability, not of physics, because the reduction is exact.
- **F4: convergent excitation is detected but over-predicted.** P1 runs steadily at 0.6 of the endurance amplitude at the HDR1 mode, and P2 rises from 0.1 to 0.85. Every model predictor named P2 and HDR1 correctly in the 11 runs that failed. FULL and both reduced predictors also alarmed in all 9 runs that never failed, because the true mode was detuned by up to 3 % in frequency and 20 % in damping. Near a resonance, the design modal parameters are not accurate enough.
- **F1: the failing asset is right only when CT1 fails first.** Lost conductance at CT1 is fitted as an equivalent injection. The predictors name CT1 as the root cause (FULL, REDUCED and REDUCED_ENG 20/20), but CT1 also absorbs the predicted σ, so FULL names CT1 as the failing asset in every run. After the corrections CT1 really does fail first in 11 of 20 runs, so FULL is right in those 11 and wrong in the other 9 (HX2, HX1 or C1 failed first). Before the corrections HX1 or HX2 always failed first and the failing asset was wrong in every run. Parametric faults need a model of the parameter change (RQ4).
- **Few cross-envelope cases.** Under the discovered envelopes, F1 was cross-envelope in only 6 of 20 runs. F2–F4 failed inside the source's own envelope. As evidence on the cross-envelope question (RQ0), this test is thin.
- **Controls.** The model predictors raised no alarms in the 40 no-fault runs (F5 and C0). LOCAL alarmed in 39 of the 40 (all 20 C0 runs and 19 of 20 F5 runs). LOCAL's threshold was not calibrated to a false-alarm rate. AG1 imbalance (F5) never caused a failure.
- **Model class.** The plant is linear and lumped, with a single operating point. Parameters are typical engineering values, and HDR1's mode was constructed. Electrical dynamics are not resolved. Truth and predictors share the same structure, so only parameter errors (±10 %) were tested, never a missing coupling.
- **Rules added during development.** Four predictor rules were introduced after early runs: the observability guard, 7-day coherent averaging, the least-power tie-break and the temperature coordinate. Each is applied the same way to every predictor.
- **Margin.** At SAFE_FACTOR 1.5 and 3.0 (20 seeds each in the re-run; 10 before), the pattern of conclusions holds, but which asset fails first in F1 changes: CT1 in 15 of 20 runs at 1.5, and BRG2 7, CT1 5, C1 4, HX1 3, HX2 1 at 3.0.

## Where the code and the formal model differ

Step numbers in this section refer to the Formal model.

- **Five ports per asset (Step 1, LOCKED 2026-11-19).** The v2 code has 71 ports over 32 assets in four domains, with 1–3 ports per asset and no chemical domain. Seven assets have two ports in the same domain: CV1, CV2, GB1, HX1, HX2, IC1 and CT1. Open question for Brant: should a port that carries a pressure drop across a valve, or two separate fluid streams, be one port in that domain with a vector effort and flow, or should the asset be split? The rule also replaces "field" in Step 1's domain list with "chemical", and the paper's port typing needs the same change.
- **Envelope boundaries span all five domains (Step 5h, [PROPOSED] hypothesis).** This is not tested. In v2 the seven discovered envelope boundaries span 1, 2, 4, 2, 3, 4 and 4 domains.
- **Entropy generation.** Fixed on 2026-11-19. The code now weights each loss by $T_{\mathrm{amb}}/T$ at its design temperature and includes heat transfer, which matches the corrected Step 1, Step 2a and Step 3c of the Formal model to within the linearisation (step 2, exergy check). It is a linearised account with weights frozen at the design point, not the exact one.
- **Onsager $L$ and Kedem–Caplan $q$ (Step 2b–2c).** The code has a scalar $R$ and $L$ for each link and no Onsager matrix. It computes a Kron two-port coupling ratio from the plant admittance (Step 5a ii, [PROPOSED]), bounded by 1 since 2026-11-19. The one-way heat bonds also break the reciprocity that Step 2b assumes (L symmetric); Onsager reciprocity does not apply to them because they are not near-equilibrium flux–force pairs.
- **Port-Hamiltonian form (Step 1, Step 3b).** The code assembles one nodal and state-space model for the whole plant and does not write it out asset by asset. The two are equivalent for linear elements. Since the 2026-11-19 one-way heat bonds, the state matrix no longer has the port-Hamiltonian split into a skew-symmetric J and a symmetric R ≥ 0: a one-way bond is a controlled heat source. The plant is still stable (all eigenvalues in the left half-plane), and its admittance is passive overall with respect to pseudo-power, but not every envelope inside it is (step 6).
- **Incidence sign (Step 3a).** The Formal model uses an asset-by-coupling incidence with +1 at the target. The code uses a port-by-link incidence with +1 at the source. Only the sign convention differs.
- **Step 6b.** It is headed "planned", but it is implemented and used. Its text calls the port map "screening only", while the v2 REDUCED predictor uses it for source fitting.
- **Missing steps.** Step 4 and Step 7 (distance) are referred to but have not been written.
- **ARI range (Step 5e).** Corrected on 2026-11-19. After the re-run, `discovery_ARI.csv` gives 0.22–0.64 between the PF and KC partitions ($k = 4$ excluded), and Step 5e now says so. Before the re-run it was 0.22–0.48, and Step 5e said "0.24–0.55".
- **Passivity check (Step 6c-3).** The reduced-matrix check alone does not prove a passive inside. Since 2026-11-19 each node's own admittance and $Y_{II}$ are checked too. In v2 the Gas train envelope (and the asset C1) is not passive inside, although its reduction is (step 6).
- **Mechanical port.** The code uses the mobility form (effort = speed, flow = torque). The thermal port is a pseudo-bond, so effort × flow is not power.
- **Port directionality (Step 1, [PROPOSED]).** It is implemented in v1 but not in v2.
- **Sparse system.** $Y$ is sparse in structure, but the v2 failure test uses dense solves. Only the scaling benchmark uses sparse LU.
- **Documentation mismatch.** The docstring of `failure_test_v2.py` says hourly. The README says "6 h steps". Both are right: the truth simulation runs hourly, and the predictors work on 6-hour means, evaluated every 12 hours.

## References

Only entries in `iro-paper/references/references.bib` are cited. Entries marked † have `claims_source = not verified` in that file, meaning no abstract or summary could be read when the file was built. Their bibliographic details come from Crossref, but their content was not checked.

- R. Arseneau and J. B. Arseneau, *Grounding Industrial System Ontologies in Physics*, draft 2026.10.27 (internal draft).
- Bryant, Khonsari and Ling 2008, "On the thermodynamics of degradation" (`bryant2008degradation`).
- Onsager 1931, "Reciprocal relations in irreversible processes. I." (`onsager1931reciprocal`).
- Kedem and Caplan 1965, "Degree of coupling and its relation to efficiency of energy conversion" (`kedem1965coupling`) †.
- Dörfler and Bullo 2013, "Kron reduction of graphs with applications to electrical networks" (`dorfler2013kron`).
- von Luxburg 2007, "A tutorial on spectral clustering" (`vonluxburg2007spectral`) †.
- Blondel et al. 2008, "Fast unfolding of communities in large networks" (`blondel2008louvain`).
- Newman 2006, "Modularity and community structure in networks" (`newman2006modularity`).
- Guimerà, Sales-Pardo and Amaral 2004, "Modularity from fluctuations in random graphs and complex networks" (`guimera2004modularity`).
- Hubert and Arabie 1985, "Comparing partitions" (`hubert1985comparing`) †.
- Pérez-Arriaga, Verghese and Schweppe 1982, "Selective modal analysis… Part I" (`perezarriaga1982sma`).
- Winkelman, Chow, Allemong and Kokotović 1980, "Multi-time-scale analysis of a power system" (`winkelman1980multitimescale`) †.
- George 1973, "Nested dissection of a regular finite element mesh" (`george1973nested`).
- Lipton, Rose and Tarjan 1979, "Generalized nested dissection" (`lipton1979generalized`).
- Davis 2006, *Direct Methods for Sparse Linear Systems* (`davis2006direct`).
- van der Schaft and Jeltsema 2014, *Port-Hamiltonian Systems Theory* (`vanderschaft2014porthamiltonian`), for the port-Hamiltonian form in the Formal model's Step 3b.

The v2 code also cites Chow (1982) and Ng–Jordan–Weiss for spectral clustering. Neither is in `references.bib`, so neither is cited here.
