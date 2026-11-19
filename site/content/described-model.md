# Described model

This page describes in prose what the IRO toy models compute and how they compute it, in the order of the eight steps below, one method at a time. Unless a passage says v1, it describes toy model v2: a 32-asset lumped linear plant built with typical engineering parameters, not plant data. The code in `iro-toy-model/v2/` is the authority. Where the code and the Formal model tab disagree, this page says what the code does and records the gap in the last section. Formal-model steps that are not locked are marked [PROPOSED]. "Step 1" to "Step 8" in headings are the eight steps of the approach. A step of the Formal model is always called "Step N of the Formal model" or "the Formal model's Step N". Every number below comes from `v2/results/`, from `v2/scaling/SCALING.md`, or from rerunning the v2 code on 2026-11-19. The few numbers that are our own arithmetic are labelled as such.

## The approach in eight steps

- **Step 1.** The plant is assets joined by couplings.
- **Step 2.** Every asset is an energy transfer function with five ports: mechanical, fluid, thermal, electrical and chemical, some of them unused. Energy changes kind inside an asset and travels between assets along couplings.
- **Step 3.** The simplest view is every asset against every other. With five ports each, that is $(5N)^2 = 25N^2$ possible port-to-port links, or 2.5 billion at 10,000 assets.
- **Step 4.** Most of those links are zero and the rest are linear. A plant has a few couplings per asset, so it is a sparse linear system that a CPU or GPU solves quickly. In the benchmark one update took about 20 ms at 10,000 assets on one CPU core. Cost rises sharply for densely meshed plants and for simulation that resolves the time domain.
- **Step 5.** Model it differently: find natural envelopes from coupling strength. Our hypothesis is that in a large or tightly meshed plant, running the whole graph in real time would take too much computing.
- **Step 6.** Each envelope becomes one asset with boundary ports.
- **Step 7.** A failure crosses envelopes.
- **Step 8.** Detect it and trace it back. Instruments show the fault developing, and the model works backwards to name the source.

Step 4 leads to the hypothesis behind envelopes, hypothesis (8) [PROPOSED] (Brant, 2026-11-19). The plant graph is sparse, but in a large or tightly meshed plant it is still very large, and running the whole thing to predict behaviour and faults in real time would take too much computing. So the assets are grouped into envelopes and each envelope is reduced to one equivalent asset. The benchmark has not supported this yet. On one core the full sparse solve took about 20 ms per update at 10,000 assets, and the envelope solve was exact but no faster at any size measured, including the meshed 100,000-asset plant (11.64 s full against 25.23 s envelope, refactorized). The hypothesis therefore depends on cases not measured so far: plants larger or more meshed than those tested, a real-time update rate faster than the 6-hour means the v2 predictors use, cheap updates when one part of the plant changes, parallel work across envelopes, and recursion (envelopes of envelopes). Revealing behaviour that involves several assets at once is a separate argument, lead hypothesis (2). XB and X4 in the Experimental Design are the planned tests.

## Step 1. The plant is assets joined by couplings

The v2 plant has 32 assets joined by 50 couplings, with 31 bonds inside the assets and 71 ports in use. Its mean coupling degree is 3.1 couplings per asset, and the most connected asset has 6 (from `scaling/SCALING.md`). The plant boundary (grid, ambient, reaction heat, gas users) is made of ideal-source boundary ports, not assets (Step 3e of the Formal model).

A coupling is a reified relation from a source port on one asset to a target port on another (paper). In v2 both ends are always in the same domain, and a test enforces this. The coupling carries its mechanism, length and topology. The topology is one of the paper's three: direct port, medium-only or structure-mediated. The nominal direction is source to target. The actual direction at any moment is the sign of the coupling power.

In the code, a coupling is the same kind of element as a bond, a resistance $R$ with an optional inertance $L$. The only difference is that its two ends sit on different assets. v2 has 50 couplings and 31 bonds. Four of the couplings are parasitic heat paths: R1→BRG1 and R1→GB1 are structure-mediated, and VFD2→VFD1 and C1→M6 are medium-only. Parasitic couplings carry no budgeted flow. Their conductance is set to KAPPA × the target port's designed loss, with KAPPA = 0.05. That value is an assumption, and the discovery test also runs it at 0.01 and 0.2.

The Formal model's Step 2b–2c writes coupling physics as an Onsager matrix $L$ and defines coupling strength as the Kedem–Caplan degree of coupling $q = L_{12}/\sqrt{L_{11}L_{22}}$ (Onsager 1931; Kedem and Caplan 1965). The code has no per-coupling Onsager matrix. Instead it computes $q$ from the admittance of the whole plant reduced onto the coupling's two ports (step 5). That substitution is marked [PROPOSED] in the Formal model's Step 5a.

## Step 2. Every asset is an energy transfer function with five ports

An asset is a set of ports plus the bonds that link them. A port is "an interface where energy crosses a boundary" (Arseneau and Arseneau, draft 2026.10.27). Each port has a domain and carries an effort and a flow, and their product is the power through the port. Ports are direction-neutral. Direction belongs to couplings (step 1).

**Five ports per asset (LOCKED 2026-11-19, Brant).** Every asset has exactly five ports, one in each domain: mechanical, fluid, thermal, electrical and chemical. A port the asset does not use is kept as an empty port: it has zero power and nothing is connected to it. In v2, for example, pump P1 uses only a mechanical and a fluid port; under the rule it also carries empty electrical, thermal and chemical ports.

The v2 code does not follow this rule yet. It gives each asset only the ports it uses, and it has only four domains: 24 fluid, 18 thermal, 16 mechanical and 13 electrical ports, which is 71 ports over 32 assets. There is no chemical domain. Six assets have 1 port, 13 have 2 and 13 have 3. Counted by domain, 8 assets use one domain, 16 use two and 8 use three. Seven assets have two ports in the same domain: a valve's inlet and outlet (CV1, CV2), a gearbox's input and output shafts (GB1), and the two fluid streams of a heat exchanger or cooler (HX1, HX2, IC1, CT1). Under the five-port rule each of those pairs has to become one port. How a port should carry a pressure drop across a valve, or two separate streams, has not been decided yet (see the gaps section). With the rule applied, the plant would have 32 × 5 = 160 ports.

The effort and flow in each v2 domain are:

- Electrical: effort is voltage, flow is current, both per unit of each bus's nominal value.
- Mechanical: effort is shaft speed and flow is torque, per unit of each machine's rating. This is the mobility form. The v15 vocabulary lists force/torque first and velocity second, but the product (power) is the same either way.
- Fluid: effort is pressure, flow is volume flow. The pressure base differs for each medium.
- Thermal: effort is the temperature rise above ambient divided by 100 K, and flow is heat flow in MW. This is a pseudo-bond: effort × flow is not a power. The energy crossing a thermal link is the heat flow itself, and the code treats it that way.

The power base is 1 MW and the time base is 1 s.

The code writes each port as one node with one effort state. Each node has a storage $C_p$ and a designed loss conductance $g_p$ to the port's reference effort, which is zero, or ambient for thermal ports. Storage comes from rotor inertia, fluid compliance or thermal capacity. Each bond inside an asset is a per-unit transformer of modulus 1 with a series loss, and in per unit that is just a resistance $R$, sometimes in series with an inertance $L$. Domain conversion, for example motor current to shaft torque, happens only on bonds inside an asset (the Formal model's Step 2e). Gyrators such as torque–current are represented as per-unit transformers.

Parameters come from a design power budget. Each port gets a design effort, and each bond and coupling gets a nominal flow. Then $R$ is the effort drop divided by the flow, and $g$ closes each port's balance. When the network is solved at DC under nominal conditions it reproduces the budget to 1e-14, and a test checks this. `PARAMETERS.md` lists every value and its source.

**Entropy generation is the damage proxy.** The entropy generation rate of an asset is the dissipation in its ports' designed losses plus the dissipation in its own bonds, divided by one reference temperature:

$$\sigma_a = \frac{1}{T_0}\Big(\sum_{p \in a} g_p\,(e_p - e_{\mathrm{ref},p})^2 + \sum_{b \in a} R_b\, f_b^2\Big), \qquad T_0 = 1\ \text{pu}.$$

For a sinusoidal line, the same formula is applied to the phasor amplitudes with a factor of 1/2. A coupling's own dissipation is kept on the coupling, not on either asset. This follows Bryant, Khonsari and Ling (2008), who tie degradation to the entropy generated by the dissipative processes. The Formal model divides by each asset's own temperature, $D_i/T_i$, and the code does not do that yet.

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

$$Y(s)\,e = J, \qquad Y(s) = \operatorname{diag}\!\big(sC + g + g_{\mathrm{bnd}}\big) + B\,\operatorname{diag}\!\Big(\frac{1}{R + sL}\Big)\,B^{\mathsf T}.$$

Here $e$ is the vector of 71 port efforts, $J$ is the vector of flow injections, and $B$ is the port-by-link incidence matrix, with +1 at the source port and −1 at the target port. The plant boundary is not made of assets (the Formal model's Step 3e). The grid at XF1 is a Norton source with conductance $g_{\mathrm{bnd}}$. The gas users at KO1 are a boundary conductance. The 2 MW of reaction heat at R1 is an injection, and ambient enters through the thermal reference. A steady operating point is one solve at $s = 0$. The steady response to a sinusoid at frequency ω is one solve at $s = j\omega$.

The same elements also give a state-space matrix $A$. Its states are the 71 port efforts plus the flows of the 39 links that have inertance, 110 states in all. Time constants range from about 2.7 µs (electrical, which the model does not resolve) to about 2.3 h (thermal). The code uses $A$ only for eigenmodes, in the timescale discovery methods, and for a stability test. The failure test does not integrate it in time. Each hour of the truth simulation is a DC solve for the operating point plus steady-state phasors for each line, which makes it quasi-static.

$Y$ is structurally sparse: 233 of its 5,041 entries are nonzero. The v2 failure-test code nevertheless stores and solves it with dense NumPy routines. The scaling benchmark below solves the same equations with sparse LU.

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

## Step 5. Natural envelopes from coupling strength

An envelope [PROPOSED term] is a group of assets found from the plant's physics, not assigned by the modeller (the Formal model's Step 5, [PROPOSED]). The paper itself notes that IRO sources use "envelope" in two senses. Here it means a grouping, not an operating envelope. The discovery code never reads the engineer's groupings. They are used only to score the result afterwards.

Every coupling gets a physics weight, and the asset graph is then partitioned. The code builds four kinds of weight:

- **PF, power flow.** The weight is the magnitude of the nominal energy flux through each coupling at the design operating point (heat flow for thermal links), summed over all couplings between the same two assets.
- **KC, Kedem–Caplan [PROPOSED weight].** For each coupling, the whole plant's $Y(j\omega)$ is Kron-reduced onto the coupling's two ports, giving $q_c = \lvert Y_{12}\rvert/\sqrt{\lvert Y_{11}\rvert\,\lvert Y_{22}\rvert}$. The edge weight between two assets is the largest $q_c$ among their couplings. This is computed at five bands: DC, 0.01, 1, 6 and 150 rad/s.
- **TS-sig, timescale signature.** For each asset, the code takes the participation factors of the modes of $A$ (Pérez-Arriaga et al. 1982), groups them by decade of time constant from 1e-7 s to 1e5 s, and clusters assets by the cosine similarity of these profiles.
- **TS-coh, slow coherency** (Winkelman et al. 1980). Assets are grouped by their energy-weighted coordinates in the slowest modes. The number of slow modes is set by the largest gap in time constant. Only 9 assets have enough slow participation to be placed.

Two partitioning algorithms run on each weighted graph. One is normalised spectral clustering (von Luxburg 2007), with $k$ chosen by the largest eigengap for $k$ from 2 to 10. The other is Louvain modularity maximisation (Blondel et al. 2008; Newman 2006), run from 50 seeds with the best $Q$ kept. Agreement between partitions is measured with the adjusted Rand index, ARI (Hubert and Arabie 1985), where 1 means identical.

Every partition is reported with the same set of checks:

- Stability: mean ARI over 40 perturbed plants, at ±10 % and at ±30 % of every parameter.
- Sensitivity to KAPPA.
- Two modularity null models: weights shuffled over the same topology, and degree-preserving rewiring (Guimerà et al. 2004).
- Whether coupling is strong inside envelopes and weak between them.
- ARI against the engineer's functional and area groupings.

The rule for choosing the envelopes used downstream was fixed before the scoring: among the PF and KC partitions, take the one with the highest mean ARI under ±30 % perturbation. Ties go to the higher $Q$, then to the DC weighting.

**What was found.** The rule chose PF-Louvain, which gives five envelopes with $Q = 0.52$. It is perfectly stable: mean and minimum ARI are both 1.00 at ±30 %. Its ARI against the engineer's functional grouping is 0.43. Named after the fact, the envelopes are:

| Envelope | Assets |
|---|---|
| Supply | XF1, SWG1, VFD2 |
| Pump trains | VFD1, MCC1, M1, P1, M2, P2, HDR1, CV1, CV2, M3, FAN1 |
| Drives + oil | MCC2, P3, M5, M4, GB1, AG1, BRG1, BRG2, LOP1, HX2 |
| Heat rejection | HDR2, CT1, HX1, R1 |
| Gas train | M6, C1, IC1, KO1 |

The result is partly emergent, which is the RQ1 verdict so far. Several findings support that reading:

- The methods agree with each other only partly. Between the PF and KC partitions (excluding the runs with $k$ forced to 4), ARI ranges from 0.22 to 0.48. Against the engineer's functional grouping, the PF and KC partitions score 0.24–0.55 (the 0.55 is KC-DC with $k$ forced to 4). The engineer's own two groupings agree at 0.55.
- The discovered groups follow energy chains, such as a drive train with its feeder, the lube-oil loop, the gas train and the heat-rejection trunk. The engineer's groups are functional systems. Only 22 % of assets sit in a PF-Louvain envelope that lies wholly inside one engineer group.
- The timescale methods find domain and timescale layers, mainly thermal versus the rest. TS-sig scores ARI 0.01 against the engineer.
- Modularity is not evidence of envelopes in this plant. The PF $Q$ of 0.52 equals the $Q$ of the unweighted topology, and it is below the weight-shuffle null (0.76 ± 0.06). The topology's $Q$ of 0.52 against rewired graphs (0.49 ± 0.02) gives $p$ = 0.16.
- Kedem–Caplan $q$ is strong inside and weak between envelopes. Inside PF-Louvain envelopes the median $q$ is 0.85, against 0.28 between them. Inside the engineer's groups it is 0.86 against 0.59.
- Setting KAPPA to 0.01 or 0.2 leaves every partition unchanged (ARI 1.0) except TS-coh, which drops to 0.78 at 0.2.

All of this comes from one operating point. Whether envelopes change with operating mode is RQ13, which is open.

**Boundary domains [PROPOSED expectation, testable hypothesis].** Brant's expectation is that an asset uses only one to three of its five ports, but that as assets are grouped into envelopes, the envelope's boundary comes to use all five domains. This is a hypothesis to test, not a result. In v2 today, no envelope boundary spans five domains, and five is not possible, because v2 has no chemical domain:

| Envelope | Boundary ports | Domains on the boundary | Count |
|---|---|---|---|
| Supply | 3 | electrical, thermal | 2 |
| Pump trains | 7 | electrical, fluid, thermal | 3 |
| Drives + oil | 8 | electrical, fluid, mechanical, thermal | 4 |
| Heat rejection | 7 | fluid, thermal | 2 |
| Gas train | 4 | electrical, fluid, mechanical, thermal | 4 |

Individual v2 assets span one to three domains. The two largest envelopes reach three and four domains, but Heat rejection has four assets and only two boundary domains, so in this plant the number of domains does not grow simply with envelope size. A fair test needs a plant that has a chemical domain, such as reaction, fuel or corrosion paths, and the five-port rule applied.

## Step 6. Each envelope becomes one asset with boundary ports

This is what `envelope_reduction.py` does, and it is Step 6b of the Formal model [PROPOSED]. The method is Kron reduction, also called a Schur complement, of the envelope's own admittance matrix onto its boundary ports (Dörfler and Bullo 2013).

**Step 1: split the ports.** For an envelope $E$, a boundary port is any port of $E$ that has a coupling to a port outside $E$. All other ports of $E$ are internal. Across the five v2 envelopes there are 29 boundary ports out of 71, and 18 couplings cross envelope edges.

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

**Checks.** The envelope is called passive if the smallest eigenvalue of the Hermitian part of $Y_{E,\mathrm{red}}(j\omega)$ is at least −1e-9 at every point of the grid. All five envelopes pass. The smallest eigenvalues are 0.18 for Supply, 2.0e-4 for Heat rejection, 9.9e-6 for Gas train, 4.4e-7 for Pump trains and 3.5e-7 for Drives + oil, so the last three are only marginally passive.

**Exactness.** Solving the plant through the envelope-assets reproduces the full solve to 2.2e-15 at DC. The relative error is at most 1.1e-15 at 6, 13.6 and 150 rad/s. For each envelope, the code also reports the DC dissipation inside it and the stored energy $\tfrac12\sum C e^2$.

| Envelope | Assets | Ports | Boundary ports | Internal ports eliminated |
|---|---|---|---|---|
| Supply | 3 | 5 | 3 | 2 |
| Pump trains | 11 | 23 | 7 | 16 |
| Drives + oil | 10 | 24 | 8 | 16 |
| Heat rejection | 4 | 9 | 7 | 2 |
| Gas train | 4 | 10 | 4 | 6 |

**What is lost.** In this linear model, at any one frequency, nothing is lost: the reduction is exact. The losses appear when the reduction is used as a replacement for the inside of the envelope:

- **Path and attribution inside the envelope.** $Y_{E,\mathrm{red}}$ has no internal structure. Internal sources with the same boundary signature cannot be told apart from the boundary (F3, Known limits). Recovering internal efforts needs the reconstruction map, and that means keeping the internal model.
- **Damage in eliminated assets.** Damage there is only available through the reconstruction map.
- **Nonlinearity.** A Schur complement assumes linear elements. A nonlinear element inside an envelope would need re-linearisation at each operating point, and v2 does not test that.
- **Operating mode.** The reduction holds for one parameter set and one operating point.
- **Averaging.** Nothing is averaged here. Phase is kept, because $Y_{E,\mathrm{red}}$ is complex. v1 showed that a reduction that keeps only averaged boundary power misses convergent excitation.

### Solving the plant at envelope level

Each envelope's $Y_{E,\mathrm{red}}$ is placed in a $29 \times 29$ matrix on its boundary ports, and the 18 cross-envelope couplings are then added in, in the same way as in step 4. Each envelope's Norton injections are summed into $J_{\mathrm{eq}}$:

$$Y_r(s)\,e_B = J_{\mathrm{eq}}, \qquad Y_r = \operatorname{blockdiag}_E\big(Y_{E,\mathrm{red}}\big) + \sum_{c\ \text{crossing}} y_c(s)\,b_c b_c^{\mathsf T}.$$

Here $y_c = 1/(R_c + sL_c)$ and $b_c$ is +1 at the coupling's source boundary port and −1 at its target. Once $e_B$ is solved, the internal efforts of each envelope come from its reconstruction map.

The REDUCED predictor uses this solve to build transfer maps. For each frequency (DC and the five lines) it injects a unit flow at each of the 71 ports, one port at a time, and records the response at the 29 boundary ports. That is 71 reduced solves per frequency.

In the current code, the REDUCED predictor computes its damage forecast with the full design model's σ and DC maps, not through the reconstruction map. The result is the same, because the reconstruction is exact. At scale, though, the forecast would have to go through the reconstruction map, or the full model would have to be kept.

### Envelope cost against the full sparse solve

The table compares the two approaches at 10,016 assets on the grid plant (1,565 envelopes, 9,390 boundary ports). The envelope solution matched the full sparse solution to within 5e-9 relative at every size.

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

Only F1 crossed an envelope boundary. Under the engineer's grouping, F1 failed in another group in all 20 runs. Under the discovered envelopes, it failed in another envelope in only 4 of 20 runs, because the discovered envelopes keep more of each fault path inside one envelope. F2–F4 failed inside the source's own envelope under both groupings. A plant with more cross-envelope paths is needed to test step 7 properly.

## Step 8. Detect it and trace it back

Attribution is done in `failure_test_v2.py`. The same logic runs for FULL, which has sensors at all 71 ports, REDUCED, which has the 29 boundary ports of the discovered envelopes, and REDUCED_ENG, which has the 22 boundary ports of the engineer's grouping. The model predictors differ only in which ports they sense and which transfer maps they use. LOCAL is a separate baseline that trends each asset's own σ.

**Channels.** There is one DC channel and five line channels, at the five line frequencies listed in step 6. These frequencies are known to the predictor in advance, so this is not a broadband search. The sensors read port efforts (6-hour means of DC effort) and complex effort phasors for each line. They do not read power.

**Source fit.** For each channel, the predictor asks which single port, injecting flow, best explains the sensor pattern. Write the transfer map from port $p$ to the sensors as $h_p$ (column $p$ of $Y^{-1}$, or of the reduced map from step 6), write the noise weights as $W$, and write the observation as $y$. The score and the fitted amplitude are:

$$\mathrm{score}_p = \frac{\lvert (Wh_p)^{\mathsf H}(Wy)\rvert^2}{\lVert Wh_p\rVert^2}, \qquad a_p = \frac{(Wh_p)^{\mathsf H}(Wy)}{\lVert Wh_p\rVert^2}.$$

Source selection uses a 7-day coherent mean of $y$, and the amplitude uses a 1-day mean.

**Least-power tie-break [PROPOSED].** Among candidate ports whose score is at least 0.99 of the best, the predictor picks the one that needs the least injected power, $\lvert a_p\rvert^2\,\mathrm{Re}\,Z_{pp}$, where $Z_{pp}$ comes from the design model at that frequency. Without this rule, boundary-only predictors chose physically absurd internal sources, for example BRG1.thermal at 34,000× background, and alarmed in every control run.

**Detection.** A channel is detected when its daily statistic exceeds the baseline mean by more than 4 standard deviations, with the baseline taken from days 0–8. There is also an observability guard: an amplitude within 3 standard errors of zero is replaced by the design background level.

**Forecast.** Each detected amplitude is extrapolated with a 14-day linear trend. The forecast is passed through the σ quadratic forms, the temperature coordinate and the HDR1 fatigue coordinate to give each asset's accumulated damage. The predictor alarms when any asset's predicted remaining life drops below 120 days.

**Attribution.** For the asset predicted to fail first, the predictor removes each detected channel in turn, setting it back to background. The channel whose removal lowers that asset's forecast damage the most is the cause. The root-cause asset is the owner of that channel's fitted source port.

So in v2, attribution comes from three things: the transfer maps through the couplings (or the reduced port-to-port map), the forecast of entropy generation and the other damage coordinates, and the fitted amplitudes of the DC and line channels. Port power enters only through the tie-break. v1 was different. Its REDUCED predictor measured power flow across the cross-system couplings, and it used energy-balance attribution [PROPOSED]: follow the coupling with the largest rise in power upstream until reaching a system that emits more added power than it receives.

**The calculus charts are display only.** The value, rate, acceleration and jerk charts on the site (0th–3rd derivative order) are drawn from the simulated series so that people can read them. No derivative is computed in `failure_test_v2.py`, `envelope_reduction.py` or `discover_envelopes.py`, and none is used for detection, forecast or attribution. Whether instrument calculus can detect faults on its own is RQ15, below.

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
| Transfer attenuation | −20 log10 of (largest target-port effort / source effort) at the band, in dB | −0.56 | −0.63 [−0.84, −0.33] |
| Domain crossings | fewest domain-converting bonds on a port path | −0.45 | −0.40 [−0.78, +0.13] |
| Asset hops | fewest couplings between the assets | −0.34 | −0.33 [−0.63, −0.13] |
| Envelope hops (discovered) | fewest envelope edges crossed | −0.30 | −0.40 [−0.77, +0.22] |
| Physical | straight-line distance between asset coordinates | −0.28 | −0.27 [−0.65, +0.06] |
| Line length | shortest pipe, cable or shaft length along couplings | −0.28 | −0.36 [−0.61, +0.13] |
| −log q path | shortest path with edge length −log q (KC, DC) | −0.24 | −0.42 [−0.70, −0.17] |
| Envelope hops (engineer) | the same, on the engineer's grouping | −0.21 | −0.21 [−0.73, +0.34] |
| Z distance (v1) | the impedance distance $\lvert Z_{pp} + Z_{tt} - Z_{pt} - Z_{tp}\rvert$, minimised over target ports | −0.12 | −0.21 [−0.51, +0.27] |

A more negative ρ means the distance ranks the effect better. Transfer attenuation ranks it best, but it is partly circular, because the effect scales with the square of effort. The distances overlap: physical against line length is 0.58, and line length against −log q is 0.74. No single structural distance is reliable within every source, since most within-source ranges cross zero. Discovered-envelope hops rank effect better than engineer-envelope hops. The Formal model refers to a Step 7 for distance, but Step 7 has not been written.

## Known limits

These come from the v2 failure test, with 20 seeds per scenario at SAFE_FACTOR 2.0, unless stated otherwise.

- **F3: a compressor surge cannot be told apart at the boundary.** C1 and M6 are in the same envelope. At the boundary ports, a surge at C1 looks the same as a source at M6, and the least-power rule picks M6. REDUCED named the wrong failing asset and the wrong root cause in 20 of 20 runs, and its median lead time was 71 days against 142 days for FULL. The engineer's grouping did the same (1/20 right, 72 days). This is a loss of observability, not of physics, because the reduction is exact.
- **F4: convergent excitation is detected but over-predicted.** P1 runs steadily at 0.6 of the endurance amplitude at the HDR1 mode, and P2 rises from 0.1 to 0.85. Every model predictor named P2 and HDR1 correctly in the 10 runs that failed. FULL also alarmed in 9 of the 10 runs that never failed, and both reduced predictors in 10 of 10, because the true mode was detuned by up to 3 % in frequency and 20 % in damping. Near a resonance, the design modal parameters are not accurate enough.
- **F1: wrong failing asset.** Lost conductance at CT1 is fitted as an equivalent injection. The predictors name CT1 as the root cause (FULL 20/20, REDUCED 18/20), but CT1 also absorbs the predicted σ, so the failing asset (HX1 or HX2) is wrong in every run, for every predictor. Parametric faults need a model of the parameter change (RQ4).
- **Few cross-envelope cases.** Under the discovered envelopes, F1 was cross-envelope in only 4 of 20 runs. F2–F4 failed inside the source's own envelope. As evidence on the cross-envelope question (RQ0), this test is thin.
- **Controls.** The model predictors raised no alarms in the 40 no-fault runs (F5 and C0). LOCAL alarmed in all 40. AG1 imbalance (F5) never caused a failure.
- **Model class.** The plant is linear and lumped, with a single operating point. Parameters are typical engineering values, and HDR1's mode was constructed. Electrical dynamics are not resolved. Truth and predictors share the same structure, so only parameter errors (±10 %) were tested, never a missing coupling.
- **Rules added during development.** Four predictor rules were introduced after early runs: the observability guard, 7-day coherent averaging, the least-power tie-break and the temperature coordinate. Each is applied the same way to every predictor.
- **Margin.** At SAFE_FACTOR 1.5 and 3.0 (10 seeds each), the pattern of conclusions holds, but which asset fails first in F1 changes.

## Where the code and the formal model differ

Step numbers in this section refer to the Formal model.

- **Five ports per asset (Step 1, LOCKED 2026-11-19).** The v2 code has 71 ports over 32 assets in four domains, with 1–3 ports per asset and no chemical domain. Seven assets have two ports in the same domain: CV1, CV2, GB1, HX1, HX2, IC1 and CT1. Open question for Brant: should a port that carries a pressure drop across a valve, or two separate fluid streams, be one port in that domain with a vector effort and flow, or should the asset be split? The rule also replaces "field" in Step 1's domain list with "chemical", and the paper's port typing needs the same change.
- **Envelope boundaries span all five domains (Step 5h, [PROPOSED] hypothesis).** This is not tested. In v2 the envelope boundaries span 2, 3, 4, 2 and 4 domains.
- **Entropy generation.** The code divides all dissipation by $T_0 = 1$ pu. Step 1 and Step 3c use $D_i/T_i$.
- **Onsager $L$ and Kedem–Caplan $q$ (Step 2b–2c).** The code has a scalar $R$ and $L$ for each link and no Onsager matrix. It computes $q$ from the Kron two-port of the plant admittance (Step 5a ii, [PROPOSED]).
- **Port-Hamiltonian form (Step 1, Step 3b).** The code assembles one nodal and state-space model for the whole plant and does not write it out asset by asset. The two are equivalent for linear elements.
- **Incidence sign (Step 3a).** The Formal model uses an asset-by-coupling incidence with +1 at the target. The code uses a port-by-link incidence with +1 at the source. Only the sign convention differs.
- **Step 6b.** It is headed "planned", but it is implemented and used. Its text calls the port map "screening only", while the v2 REDUCED predictor uses it for source fitting.
- **Missing steps.** Step 4 and Step 7 (distance) are referred to but have not been written.
- **ARI range (Step 5e).** Step 5e says the methods agree at "ARI 0.24–0.55". `discovery_ARI.csv` gives 0.22–0.48 between the PF and KC partitions. The figure 0.55 is the KC-DC $k = 4$ partition against the engineer, and the engineer's area grouping against the functional one. The v2 README and RQ1 say 0.24–0.48, but the low end in the file is 0.224 (PF-Louvain against KC 150 rad/s spectral).
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
