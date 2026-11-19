# IRO toy model v3: a nested plant

**This is a made-up plant.** It is not a real site and has no vendor data. Equipment sizes and losses are typical engineering orders of magnitude, chosen so the design power budget closes (see `PARAMETERS.md`). Every number in this README comes from the scripts in this folder, run on 19 Nov 2026.

v3 asks two questions of the v2 machinery (`../v2/`). First, does it still work when the plant is nested several levels deep (RQ3)? Second, can it trace a fault across envelope levels, including one that starts in the electrical domain and damages a mechanical asset several levels away (RQ1)?

Vocabulary follows the Oct 27, 2026 paper and `iro-paper/formal-model/FORMAL_MODEL.md`: asset, port (effort, flow), bond, coupling, envelope, designed loss, entropy generation sigma, Safe region, operating context.

## How to run

```
cd v3
export OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1   # needed: BLAS threads make the Pool runs crawl
python3 plant_v3.py            # build + checks, writes PARAMETERS.md
python3 discover_v3.py         # recursive discovery (about 25 s with one BLAS thread)
python3 reduction_v3.py        # recursive vs one-shot Kron reduction
python3 failure_test_v3.py 20  # 4 scenarios x 20 seeds x 5 predictors (about 3 min on 8 workers)
python3 exergy_check.py        # sigma against exact exergy destruction
python3 site_data.py           # site_data/ (reads results/failure_cases.json)
python3 make_figures.py        # figures/
python3 -m pytest -q tests     # 18 tests
```

| File | What it does |
|---|---|
| `plant_v3.py` | Plant builder, design power budget, nodal model Y(s), state space, boundary ports, designed hierarchy |
| `hierarchy.py` | Tree class, node admittance, Schur (Kron) reduction one-shot and recursive, passivity check, boundary transfer maps |
| `discover_v3.py` | v2 discovery (`../v2/discover_envelopes.py`) applied recursively |
| `reduction_v3.py` | Exactness and passivity of recursive reduction |
| `failure_test_v3.py` | Cross-level failure test |
| `site_data.py` | Writes `site_data/` (schema in `site_data/SCHEMA.md`) |
| `make_figures.py` | The three figures |
| `exergy_check.py` | Checks T_amb × sigma against the exact exergy destruction, at and off the design point |

## 1. The plant

### Hierarchy (designed)

Plant → 5 level-1 envelopes → 19 level-2 envelopes → 24 level-3 envelopes → 99 assets. The tree is 3 envelope levels deep. Some branches stop at level 2: the electrical L2 envelopes, `AREA_A.FEED`, `AREA_B.GAS`, `AREA_B.PROD`, `UTIL.CWN`, `UTIL.IA` and `HEAT.STM` hold assets directly.

| L1 | Name | Assets | L2 envelopes |
|---|---|---|---|
| ELEC | Electrical distribution | 10 | SUB (main substation), LVA, LVB, LVU |
| AREA_A | Process area A (feed + reaction) | 25 | FEED, TRN_A1, TRN_A2, RX |
| AREA_B | Process area B (compression + product) | 26 | TRN_B1 (compressor train), GAS, TRN_B3, PROD |
| UTIL | Utilities | 23 | CWP (CW pumps), CWN (CW network), CT (cooling tower), IA (instrument air) |
| HEAT | Heat (steam raising) | 15 | BLR (boiler), FW (feedwater), STM (steam distribution) |

The level-3 envelopes are the parts of a train (drive, motor, pump or compressor, lube) or of a unit (reactor vessel and agitator drive; burner, furnace and stack; deaerator and feed pump; tower and fan; each CW pump set). The full tree is in `site_data/hierarchy.json`.

`python3 plant_v3.py` reports:
- 99 assets, 82 bonds, 134 couplings (6 of them parasitic). There were 84 bonds before the 2026-11-19 red-team fixes; the two compressor shaft-to-thermal bonds (K-B1, K-U4) were removed because they counted the heat of compression twice.
- 58 bonds are one-way heat bonds and 2 more are routed losses (see "One-way heat bonds" below).
- 206 active ports out of 495.
- 285 states, all modes stable, slowest time constant 241 h (224 h before the fixes).
- DC solve reproduces the design budget to 6.6e-15.

### Five ports per asset (locked)

- Every asset has exactly 5 ports, one per domain: mechanical, fluid, thermal, electrical, chemical.
- Unused ports are present and marked `empty`. They have no coupling, no boundary and no state.
- 73 assets use 2 domains, 17 use 3 and 9 use 1.
- All five domains are used in the plant. Chemical ports sit on the feed tank, the reactor, the product tank and the burner.

**Same-domain duplicates [PROPOSED, for Brant].** Some real equipment has two connections in one domain: a heat exchanger with two streams, a compressor with suction and discharge. With one port per domain, v3 handles them in two ways:
- **Merge** when both connections carry the same stream through the asset. Inlet and outlet become one port, and the pressure drop sits on the couplings either side. Used for headers, control valves, the knock-out drum, the stack and the instrument-air dryer.
- **Split** when the asset holds two different streams. The asset becomes two assets with a thermal coupling between them: `E-A1S`/`E-A1T`, `E-B1G`/`E-B1W`, `E-B3P`/`E-B3W`, `B-H1G`/`B-H1W`.

The cost of merging: 9 assets have **zero nominal sigma**, because their whole loss sits on a coupling or a boundary sink. These are HDR-A1, CV-A1, KO-B1, HDR-U1, CV-U1, CV-U2, CT-A1, D-U4 and ST-H1. The failure test leaves them out of the sigma limit (it has no Safe limit to scale). This is the main open modelling choice in v3.

### Plant boundary ports, by domain

Electricity is one input among several. Every boundary port belongs to one asset, so it can be traced up the tree. `plant_boundary[].path` in `hierarchy.json` gives the chain, e.g. `PLANT > HEAT > HEAT.BLR > HEAT.BLR.BRN > BN-H1`.

| Domain | In / out | Boundary port | Asset → L1 | DC power into plant (MW) |
|---|---|---|---|---|
| electrical | in | Grid feed, 13.8 kV | TX1 → ELEC | +1.892 |
| chemical | in | Natural gas (fuel) | BN-H1 → HEAT | +6.000 |
| chemical | in | Reactant feed | TK-A1 → AREA_A | +5.102 |
| chemical | out | Product | TK-B1 → AREA_B | −2.910 |
| fluid | in | Process feed (liquid) | TK-A1 → AREA_A | +0.0032 |
| fluid | in | Raw water make-up | CT-W1 → UTIL | +0.00036 |
| fluid | in | Boiler make-up water | DA-H1 → HEAT | +0.00015 |
| fluid | out | Compressed gas to users | KO-B1 → AREA_B | −0.742 |
| fluid | out | Product (liquid) to storage | P-B3 → AREA_B | −0.0162 |
| fluid | out | Tower exhaust air | CT-A1 → UTIL | −0.0295 |
| fluid | out | Instrument air to users | D-U4 → UTIL | −0.0193 |
| fluid | out | Flue gas | ST-H1 → HEAT | −0.0331 |
| thermal | out | Heat rejection to ambient (tower) | CT-A1 → UTIL | −5.702 |
| thermal | out | Flue heat to ambient | ST-H1 → HEAT | −0.772 |
| mechanical | – | none: no shaft crosses the plant boundary | – | – |
| thermal | reference | Ambient: the reference effort of every thermal designed loss (operating context, not a port) | – | – |

- Sources are ideal efforts behind a Norton conductance. Sinks are conductances to zero effort (to ambient for thermal).
- Inputs total 13.00 MW and outputs 10.22 MW. The net 2.774 MW splits three ways:
  - 2.122 MW of heat to ambient through the thermal designed losses.
  - 0.069 MW in non-thermal designed losses.
  - 0.583 MW in coupling and bond resistances that are not routed to a thermal port.
- The three add to the net input within 1e-12 MW.
- Before the fixes the grid feed was 2.304 MW, inputs 13.41 MW, and 0.970 MW of resistive loss left the model. The compressor shaft power was 1.572 MW (K-B1) and 0.0437 MW (K-U4); it is now 1.211 MW and 0.0336 MW.
- Steam is raised on site from natural gas (HEAT), so no steam import was added. Electricity is converted to motion by 12 motors, and to heat in transformers, drives, motors and bearings.

### Thermal effort base [FIXED 2026-11-19, red team]

- Thermal effort = temperature rise above ambient / **T_amb**, T_amb = 298.15 K. Before the fix the base was 1000 K (v2 used 100 K).
- An arbitrary base made sigma a number without units. With T_amb as the base, T = T_amb (1 + e), and each loss can be divided by its own temperature. sigma is now in kW/K and T_amb × sigma is the exergy destroyed.
- The furnace (about 900 K rise) now has effort about 3. The 1000 K base existed only so that the burner could be a reciprocal transformer with modulus ≤ 1. The burner is now a one-way heat bond, so the base no longer has to keep efforts below 1.

### One-way heat bonds [FIXED 2026-11-19, red team]

- Every bond that turns a loss into heat (motor, drive, transformer and bearing losses, the burner's fuel-to-heat bond) is one-way: its flow is set by the source side only, f = y (e_src − w e_tgt) with w = 0, and the heat k_a f goes to the thermal port. Before the fix these bonds were reciprocal, so a hotter thermal port could push power back into the shaft or the wire.
- Two shaft bonds are routed losses: the R f² of the bond is delivered as heat at the thermal port.
- The model is still linear, but Y(s) is no longer symmetric. Reciprocity no longer holds, and passivity has to be checked, not assumed (section 3).

### Entropy generation and the exergy check [FIXED 2026-11-19, red team]

- sigma, kW/K = (1000 / T_amb) × Σ w_k D_k. Losses in work domains have w = 1. A thermal designed loss to ambient has w = 1 / (1 + e). A loss landing at heat port h has w = 1 / (1 + e_h). A thermal–thermal link has w = 1 / ((1 + e_s)(1 + e_t)), which is Q (1/T_cold − 1/T_hot) to first order, so heat moving down a temperature difference now generates entropy. The weights use the design temperatures.
- `exergy_check.py` compares T_amb × sigma with the exact exergy destruction. At the design point they agree exactly. Off design (load 0.8–1.2, grid 0.97–1.03, ambient 0–20 K) the asset ratios run 0.850–1.227 (worst B-H1G) and the plant total 0.929–1.120. On 40 perturbed plants at 3 points each the asset ratios run 0.788–1.283 and the plant total 0.903–1.152. A linearisation without the weights fails outright here (it gives negative values), because the flame is at e ≈ 3.
- The asset total (excluding couplings) at design is 14.72 kW/K, or 4.388 MW of exergy destroyed. It counts each asset's designed port losses (2.02 kW/K) and its bonds (12.70 kW/K). The largest are R-A1 5.80, BN-H1 5.16, K-B1 1.13 and DA-H1 0.78 kW/K.
- The plant total including couplings is 29.77 kW/K at the design point: the asset total plus 15.06 kW/K on the couplings between assets. The largest couplings are thermal links: B-H1G→B-H1W 4.41, BN-H1→B-H1G 2.49, R-A1→J-A1 1.38 and E-A1T→R-A1 1.16 kW/K. The PLANT time series in `site_data/` uses this plant total.
- sigma is a provisional proxy for damage. Bryant ties damage to the specific process that degrades a part, so designed losses are not damage in themselves.

### How the parameters were set

The v2 design-power-budget method is now automated:
- Every link carries a flow rule: explicit, by power, back-propagated with shares, a forward fraction, or a loss fraction.
- Efforts come from anchors and per-link efficiency factors, set in topological order. The nominal graph is acyclic. The 6 parasitic links carry no budgeted flow; each has G = 0.05 × the designed-loss conductance of its target port (an assumption).
- R = Δe/f on every link, and g = KCL residual / e at every port.
- Every R, g, C and L is listed in `PARAMETERS.md`, with its rule.

## 2. Nesting: designed vs discovered (RQ3)

**Method.** `discover_v3.py` reuses v2's discovery unchanged:
- Level 1: the Kron two-port coupling ratio per band (labelled KC; earlier called Kedem–Caplan q), PF, Louvain and spectral methods, then the v2 rule 5d (highest mean ARI under ±30 % parameter perturbation, 40 perturbations). The rule chose `KCw0.01-spectral`: k = 6, mean ARI 0.990 under ±30 % perturbation. Before the red-team fixes it chose `KCw0.01-louvain` with k = 10.
- Below level 1: Louvain is run again on each sub-block of the same plant-wide weight matrix. A block is split only if it has ≥ 6 assets and Q ≥ 0.25, down to depth 3.
- The discovery code never reads the designed tree (a test checks this).
- A hybrid variant runs the same recursion inside the designed L1 envelopes.

**Discovered tree:** 6 L1, 18 L2 and 3 L3 envelopes (before the fixes 10, 17 and 2). Assets in an envelope that was not split carry its label down, which gives 19 and 21 asset groups at levels 2 and 3.

| Level | Designed groups | Discovered groups | ARI discovered vs designed | ARI hybrid vs designed | Discovered stability, ±30 % (mean / min ARI) |
|---|---|---|---|---|---|
| L1 | 5 | 6 | 0.507 (was 0.369) | 1.000 (by construction) | 0.995 / 0.955 |
| L2 | 19 | 19 | 0.531 (was 0.513) | 0.765 (was 0.752) | 0.869 / 0.698 |
| L3 | 34* | 21 | 0.532 (was 0.539) | 0.634 (was 0.635) | 0.869 / 0.716 |

*At L3 the designed labels count the 24 L3 envelopes plus the 10 L2 envelopes that hold assets directly.

What the numbers say:
- **Agreement is partial at every level.** Discovered L1 now matches designed L1 (ARI 0.507) better than designed L2 (0.324). Before the fixes it was the other way round (0.369 against 0.439), so that earlier finding does not survive.
- **Discovery follows electrical stiffness and shafts, not process areas.** For example:
  - D1 is the main substation plus the whole compressor train, its gas cooler and its lube system.
  - D2 is TX2, MCC-A, both feed pump trains and the agitator drive.
  - D4 is TX4, MCC-H and the boiler house, with the reactor-side cooler E-A1S.
  - D5 is the CW pumps, the CW network, the cooling tower, the reactor and both tanks, and the reactor jacket J-A1.
  - D6 is the instrument-air compressor set.
  - Each drive sits with its supply transformer and MCC rather than with ELEC. Engineers group by function and ownership; the coupling weights see stiffness.
- **Discovered splits are stable** under ±30 % perturbation (mean ARI 0.87–0.99). The least seed-stable splits are inside D4 and D5.D1 (Louvain seed ARI 0.83 each) and D1 (0.92).
- **Strong inside, weak between holds at designed L1 and L2, not at L3.** The median coupling ratio is 0.727 inside vs 0.540 between at L1, and 0.727 vs 0.562 at L2. At L3 it is 0.612 inside vs 0.644 between: the designed L3 split cuts strong shaft couplings (motor | pump), as engineers do. On the discovered tree it is 0.653 vs 0.359 at L1 and 0.664 vs 0.532 at L2. The ratio is bounded by 1 after the red-team fix.
- **Brant's 5h domain-span hypothesis** (that envelope boundaries tend to span all five domains) **is not supported in this plant.**
  - No designed or discovered envelope's boundary spans all five domains. The designed L1 envelopes span 1, 4, 4, 3 and 3 domains (ELEC, AREA_A, AREA_B, UTIL, HEAT). HEAT reaches 4 when its plant boundary ports are counted.
  - In the designed tree, mechanical couplings never cross an L1 or L2 boundary. They cross only at L3, where 10 envelopes split a shaft. In the discovered tree, two L1 envelopes (D1, D3) have a mechanical boundary.
  - Chemical crosses level 1 only between AREA_A and AREA_B (reactor to product tank).
  - The six discovered L1 envelopes span 1–4 domains, or 2–4 counting plant boundary ports.
  - Full table: `results/discovery_v3.json` → `boundary_domain_span`.

## 3. Recursive reduction (exactness and passivity)

**[PROPOSED] Step 6c.** Reduce each child envelope to its boundary ports first (Kron/Schur, with a Norton equivalent for the injections). Then assemble the reduced children with the sibling couplings, and reduce again at the parent. `reduction_v3.py` compares this with one-shot reduction of the whole node, at 36 frequencies from DC to 159 Hz (1000 rad/s).

| Tree | Nodes | Max rel. error, Y | Max rel. error, Norton J | Plant boundary solve, max rel. error | Passive |
|---|---|---|---|---|---|
| Designed | 48 | 2.8e-13 | 9.2e-16 | 9.6e-14 | reduced: all; inside: not HEAT.BLR.BRN |
| Discovered | 27 | 9.6e-14 | 1.5e-15 | 9.4e-14 | reduced: all; inside: all |

- Recursive reduction equals one-shot reduction to round-off on both trees.
- Every reduced node is passive: the smallest eigenvalue of the Hermitian part of the reduced Y is ≥ −1.1e-16 relative.
- **Inside check [added 2026-11-19, red team].** A passive reduced matrix does not prove that the node is passive inside. `reduction_v3.py` now also tests the Hermitian part of each node's own unreduced Y, and the internal block Y_II that the reduction inverts.
  - One node fails: the designed burner envelope HEAT.BLR.BRN, minimum eigenvalue −0.00953 at DC, carried almost entirely by BN-H1.thermal. The asset BN-H1 fails on its own with the same value.
  - The cause is the one-way fuel-to-heat bond. It puts −6 off the diagonal of Y (k_a = 1, y = 6), against a thermal conductance at BN-H1.thermal of only 0.0199. A one-way bond is a controlled source, and on its own it is not passive.
  - In the discovered tree BN-H1 sits in D4.D3 with the fan, the gas-side boiler and the stack, whose conductances load the thermal port, so every discovered node passes.
  - This is a modelling choice, not a numerical fault, and it is recorded as an open item. A thermal port with entropy as a state would remove it. It has not been tuned away.
  - Y_II is invertible at every node and frequency: the smallest singular value is 1.6e-4. The condition number reaches 5.5e12 in discovered D5 and 4.1e12 in D5.D2, at 309–562 rad/s, where the large thermal capacitances of the reactor and tanks dominate. It is a spread of scales, not a near-singular block, and the reduction still matches the one-shot result to 1e-13.
- Some nodes are only marginally passive after reduction (≈ 0). They are lossless at DC through an electrical path.
- All 99 asset admittances have min eig Re Y ≥ −3.6e-19 after reduction to their ports. Inside, only BN-H1 fails.
- Exactness is expected, since Schur complements compose. The test checks that the code builds the right blocks at every level.

## 4. Cross-level failures (RQ1)

**Scenarios.** Each grows a forcing line at the source asset and damages a constructed structural mode at the victim. Victim modes sit at least 6.6 % from every forcing line.

| Id | Source → victim | Crossing |
|---|---|---|
| X1 | CW pump P-U1, 1× hydraulic pulsation 24.58 Hz (UTIL.CWP) → reactor jacket J-A1 mode 26.5 Hz (AREA_A) | crosses L1 |
| X2 | Compressor K-B1 rotating stall 9 Hz (AREA_B.TRN_B1) → aftercooler E-B1G tube mode 9.8 Hz (AREA_B.GAS) | crosses L2 inside AREA_B |
| X3 | Harmonic filter HF1 detuning, 18.5 Hz interharmonic on the 4.16 kV bus (ELEC.SUB) → agitator gearbox GB-A3 torsional mode 19.8 Hz (AREA_A.RX.AGD) | electrical origin; L2 in ELEC to L3 in AREA_A; electrical → mechanical |
| C0 | no fault | control |

**Setup.**
- 20 seeds per scenario. Each seed draws a ±10 % perturbed "true" plant, victim modes shifted ±3 % (damping ±20 %), a random fault onset (day 10–30), noise and operating context.
- Damage has three parts:
  - Basquin fatigue at each victim's constructed mode. The endurance amplitude A_e = SAFE_FACTOR × the nominal background modal amplitude.
  - A sigma rule: the Safe limit = SAFE_FACTOR × the asset's nominal peak sigma.
  - A temperature rule.
  - SAFE_FACTOR = 2.
- Each line grows to LEVEL_END = 2.5 × the amplitude that would just reach the victim's endurance limit in the design model. End amplitudes in pu flow at the source port: X1 0.0167, X2 0.124, X3 0.0540 (0.0659 before the fixes).
- The test runs hourly for 400 days.
- Each seed also gets a scripted load step of ±10 % (+0.1 or −0.1 on the per-unit load) at a random day from 60 to 250, and a 10-day +8 K ambient heatwave at a random day from 40 to 250. For the headline run (X3, seed 3000) the load step is −0.1 at day 87.67 and the heatwave starts at day 235.1.

**Predictors** (as in v2: transfer-path GLRT with a least-power tie-break, plus damage projection):

| Predictor | Sensors | What it can see |
|---|---|---|
| FULL | all 206 active ports | everything |
| REDUCED_L1 | the 42 ports on designed L1 boundaries | only power crossing an L1 boundary |
| REDUCED_L2 | the 68 ports on designed L2 boundaries | only power crossing an L2 boundary |
| REDUCED_D1 | the 22 ports on discovered L1 boundaries (32 before the fixes) | only power crossing a discovered L1 boundary |
| LOCAL | each asset's own ports, trend only | no transfer path |

The reduced transfer maps equal the matching rows of the full inverse to 2.7e-15.

**Results (rerun after the 2026-11-19 red-team fixes, 20 seeds each).** Warned = alarm after onset and before failure. Root cause L2 = the named source sits in the true source's designed L2 envelope. The run before the fixes is kept in `results/pre_redteam_*`.

| Scen. | Predictor | Warned | Lead, median (IQR), d | Failing asset right | Root cause: asset / L1 / L2 right | False alarms |
|---|---|---|---|---|---|---|
| X1 | FULL | 20/20 | 84.5 (72–93) | 20/20 | 20 / 20 / 20 | 0 |
| X1 | REDUCED_L1 | 20/20 | 88.6 (69–94) | 20/20 | 20 / 20 / 20 | 0 |
| X1 | REDUCED_L2 | 20/20 | 88.3 (69–94) | 20/20 | 20 / 20 / 20 | 0 |
| X1 | REDUCED_D1 | 20/20 | 90.1 (69–102) | 20/20 | 0 / 20 / 20 | 0 |
| X1 | LOCAL | 20/20 | 91.1 (71–106) | 19/20 | 0 / 0 / 0 | 0 |
| X2 | FULL | 20/20 | 82.6 (77–101) | 20/20 | 20 / 20 / 20 | 0 |
| X2 | REDUCED_L1 | 0/20 | – | – | – | 0 |
| X2 | REDUCED_L2 | 20/20 | 81.7 (76–100) | 20/20 | 20 / 20 / 20 | 0 |
| X2 | REDUCED_D1 | 0/20 | – | – | – | 0 |
| X2 | LOCAL | 20/20 | 85.0 (77–105) | 17/20 | 0 / 18† / 1 | 0 |
| X3 | FULL | 20/20 | 82.0 (70–93) | 20/20 | 11 / 14 / 14 | 0 |
| X3 | REDUCED_L1 | 20/20 | 66.6 (54–87) | 20/20 | 0 / 17 / 17 | 0 |
| X3 | REDUCED_L2 | 20/20 | 74.3 (62–91) | 20/20 | 0 / 11 / 11 | 0 |
| X3 | REDUCED_D1 | 20/20 | 75.5 (57–90) | 20/20 | 0 / 20 / 20 | 0 |
| X3 | LOCAL | 20/20 | 96.2 (80–111) | 18/20 | 0 / 1 / 0 | 0 |
| C0 | FULL, REDUCED_L1, REDUCED_L2, REDUCED_D1 | no true failures in 20 runs | – | – | – | 0/20 each |
| C0 | LOCAL | no true failures in 20 runs | – | – | – | **19/20** |

†LOCAL names the victim. In X2 the victim is in the same L1 envelope as the source, so its L1 "root cause" is right by accident.

What changed with the fixes (before → after):
- X1 REDUCED_D1 went from 0/20 warned to 20/20. The new discovered D5 holds both P-U1 and J-A1, so the path does not cross a discovered L1 boundary; the predictor now sees the pulsation on the electrical feed of the CW pump motors and names P-U2, the other pump on the same MCC, in all 20 runs. The envelope is right, the asset is wrong.
- X2 REDUCED_L1 and REDUCED_D1 went from 1/20 warned to 0/20.
- X3 FULL named HF1 in 11/20 runs (was 9/20); REDUCED_D1 warned in 20/20 (was 19/20). The two alarms before onset in X3 seed 3004 are gone.
- Where a predictor warned both before and after, its median lead time moved by 0.4 to 22.7 days. The largest change is X3 REDUCED_D1, 98.2 → 75.5 days.

What the table says:
- **A reduced predictor sees a fault only if the fault's path, or a side path, crosses one of its sensed boundaries.** In the table:
  - X1 crosses designed L1, so REDUCED_L1 and REDUCED_L2 match FULL.
  - X2 stays inside AREA_B, so REDUCED_L1 is blind (0/20) and REDUCED_L2 matches FULL.
  - The discovered L1 envelopes put P-U1 with J-A1 (D5) and K-B1 with E-B1G (D1). REDUCED_D1 is blind to X2 and sees X1 only through the motor feed, so it names the wrong pump.
  - Which boundaries are sensed decides which faults can be traced. Neither tree covers all three faults at level 1 alone. Designed L2 covered X1 and X2 fully but got the X3 source envelope right in only 11/20.
- **X3 (electrical origin): the failing asset is predicted well, but the source asset is ambiguous.**
  - FULL names HF1 in 11/20 runs, LR-B1 in 6, SWG1 in 2 and TX1 in 1. LR-B1 is the compressor drive's line reactor, hung on the same stiff 4.16 kV bus. From any sensor, an injection at HF1 and one at LR-B1 look almost the same, and the least-power tie-break picks either.
  - The reduced predictors name the bus itself (SWG1) or LR-B1. REDUCED_D1 names SWG1 in 20/20 runs, which gives the right envelope but not the right asset.
  - This is a structural identifiability limit, not noise. Separating two assets on one stiff bus needs sensors that see their branch currents.
- **Lead times** are 67–96 days (median) for every predictor that warns. The damage projection is the same for all; the difference is which path the predictor can see.
- **LOCAL trending warns on time but cannot name a source**, and it alarmed in 19 of 20 no-fault runs. The model predictors had 0 false alarms in 80 no-fault predictor runs, and no alarm before onset in any fault run.

**Rule change after run 1 (disclosed).** Run 1 is kept in `results/run1_*`. In run 1, 9 of 20 no-fault runs had a true failure:
- BN-H1 ×7 by the temperature rule. Its peak is 1081 K and the ±10 % perturbed plants reached about 1160 K.
- E-B1G ×1 by fatigue: its mode sat close to a forcing line.
- B-H1G ×1.

Two rules were changed before run 2:
- Temperature limit = peak + max(10 K, 15 % of peak), in place of a fixed margin.
- Victim modes moved to ≥ 6.6 % from every line (J-A1 26.5 Hz, E-B1G 9.8 Hz, GB-A3 19.8 Hz).

Run 2 (the run before the red-team fixes, kept as `results/pre_redteam_*`) had 0 true failures in 20 no-fault runs, and so does the rerun. The fault results moved little between runs. For example, X3 FULL named HF1 in 10/20 in run 1 and 9/20 in run 2; X1 and X2 were unchanged in pattern.

## 5. Site data

`site_data/` holds 4.98 MB in 8 JSON files. The schema is in `site_data/SCHEMA.md`.
- Hierarchies, designed and discovered: id, name, level, parent, children, assets, boundary ports with what each couples to.
- Couplings, and sibling edges at every level with domain and DC and fault-band power.
- Time series for every node (plant, 48 envelopes, 99 assets) for the headline run, X3 seed 3000. Each holds sigma and boundary power at orders 0–3 (value, rate, acceleration, jerk), with Francis smoothing made causal on 2026-11-19: a trailing 49-sample moving average, then each backward difference re-smoothed by a trailing 9-sample average. No later sample is used, so the orders lag the hourly signal by 24, 28.5, 33 and 37.5 hours. sigma is in kW/K.
- **Downsampled** from hourly to one sample per day (hour 12), 3 significant figures. The day axis is written to 2 decimals (`day[k] = k + 0.5`); before 2026-11-19 it was also rounded to 3 significant figures, which duplicated days from 100 on (251 unique of 400).
- Headline run, PLANT sigma: about 32 kW/K before the load step (the ±10 % perturbed plant reads 31.77 kW/K at design inputs, against 29.77 for the design plant). The scripted −0.1 load step at day 87.67 brings it down to about 26.5 kW/K over the next two days, and boundary power drops from about 2.94 to 2.0 MW at the same time. The first two days read high (34.9 kW/K at day 0.5) because the 49-hour average has not filled yet: at day 0.5 it holds only 13 hours, all on the high half of the daily load cycle.

## Figures

- `figures/fig1_designed_hierarchy.png`: the designed nesting, levels 1–3 over 99 assets.
- `figures/fig2_agreement_by_level.png`: ARI vs designed by level, discovered and hybrid.
- `figures/fig3_root_cause_by_predictor.png`: fraction of runs with the right root-cause L2 envelope, by scenario and predictor.

## Limitations

- A made-up plant with lumped, linear physics. Forcing lines are pure tones, and modes are constructed second-order resonances.
- The true plant is the design model with ±10 % perturbation. The predictors use the design model, so model error is bounded by construction.
- Resistive losses in couplings and in bonds that are not heat bonds (0.583 MW at design) still leave the model; they are not routed to a thermal port.
- The one-way heat bonds are linear. Off design they do not close the first law exactly, and the burner's bond makes BN-H1 non-passive inside (section 3).
- sigma uses design temperatures. Off design it is within −15 % to +23 % of the exact exergy destruction per asset (plant total −7 % to +12 %).
- The 9 zero-sigma assets carry no sigma-based damage.
- Three faults, one victim each, 20 seeds. These are existence results, not rates.
- Discovered L1 depends on the v2 selection rule. The recursion stop rule (MIN_SPLIT = 6, Q_MIN = 0.25) is a choice and was not tuned.

## Open decisions for Brant

1. Merge vs split for same-domain duplicate ports [PROPOSED], and what to do about the 9 zero-sigma assets.
2. Thermal effort base: now T_amb (fixed 2026-11-19; was 1000 K). A true thermal port with entropy as a state would remove the BN-H1 inside-passivity failure.
3. The temperature-margin rule changed after run 1 (peak + max(10 K, 15 %)).
4. The recursion stop rule (MIN_SPLIT, Q_MIN, MAX_DEPTH).
5. Should drives and MCCs belong to ELEC or to the trains they feed? Discovery says the trains.
6. Electrical bus identifiability: several assets on one stiff bus cannot be told apart from boundary sensors.
7. The 5h domain-span hypothesis is not supported here. Keep it as a hypothesis, or drop it?
8. Sensor placement: which envelope boundaries to instrument, given that each tree leaves some faults unseen.
