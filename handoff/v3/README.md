# IRO toy model v3: a nested plant

**This is a made-up plant.** It is not a real site and has no vendor data. Equipment sizes and losses are typical engineering orders of magnitude, chosen so the design power budget closes (see `PARAMETERS.md`). Every number in this README comes from the scripts in this folder, run on 19 Nov 2026.

v3 asks two questions of the v2 machinery (`../v2/`). First, does it still work when the plant is nested several levels deep (RQ3)? Second, can it trace a fault across envelope levels, including one that starts in the electrical domain and damages a mechanical asset several levels away (RQ1)?

Vocabulary follows the Oct 27, 2026 paper and `iro-paper/formal-model/FORMAL_MODEL.md`: asset, port (effort, flow), bond, coupling, envelope, designed loss, entropy generation sigma, Safe region, operating context.

## How to run

```
cd v3
export OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1   # needed: BLAS threads make the Pool runs crawl
python3 plant_v3.py            # build + checks, writes PARAMETERS.md
python3 discover_v3.py         # recursive discovery (minutes)
python3 reduction_v3.py        # recursive vs one-shot Kron reduction
python3 failure_test_v3.py 20  # 4 scenarios x 20 seeds x 5 predictors (minutes)
python3 site_data.py           # site_data/ (reads results/failure_cases.json)
python3 make_figures.py        # figures/
python3 -m pytest -q tests     # 12 tests
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
- 99 assets, 84 bonds, 134 couplings (6 of them parasitic).
- 206 active ports out of 495.
- 285 states, all modes stable, slowest time constant 224 h.
- DC solve reproduces the design budget to 4.2e-15.

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
| electrical | in | Grid feed, 13.8 kV | TX1 → ELEC | +2.304 |
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
| thermal | out | Heat rejection to ambient (tower) | CT-A1 → UTIL | −5.699 |
| thermal | out | Flue heat to ambient | ST-H1 → HEAT | −0.772 |
| mechanical | – | none: no shaft crosses the plant boundary | – | – |
| thermal | reference | Ambient: the reference effort of every thermal designed loss (operating context, not a port) | – | – |

- Sources are ideal efforts behind a Norton conductance. Sinks are conductances to zero effort (to ambient for thermal).
- Inputs total 13.41 MW and outputs 10.22 MW. The net 3.189 MW splits three ways:
  - 2.150 MW of heat to ambient through the thermal designed losses.
  - 0.069 MW in non-thermal designed losses.
  - 0.970 MW in bond and coupling resistances.
- The three add to the net input within 1e-4 MW.
- Steam is raised on site from natural gas (HEAT), so no steam import was added. Electricity is converted to motion by 12 motors, and to heat in transformers, drives, motors and bearings.

### Thermal effort base [PROPOSED, for Brant]

- Thermal effort = temperature rise above ambient / **1000 K** (v2 used 100 K).
- With 100 K, the furnace (~900 K rise) has effort 9. The burner, a chemical→thermal bond, then needs a modulus well above 1, which breaks v2's "lossy transformer, modulus ≤ 1" rule.
- With 1000 K every effort stays in [0, 1.1]. The rule is unchanged, and v2's sizes only rescale.

### How the parameters were set

The v2 design-power-budget method is now automated:
- Every link carries a flow rule: explicit, by power, back-propagated with shares, a forward fraction, or a loss fraction.
- Efforts come from anchors and per-link efficiency factors, set in topological order. The nominal graph is acyclic. The 6 parasitic links carry no budgeted flow; each has G = 0.05 × the designed-loss conductance of its target port (an assumption).
- R = Δe/f on every link, and g = KCL residual / e at every port.
- Every R, g, C and L is listed in `PARAMETERS.md`, with its rule.

## 2. Nesting: designed vs discovered (RQ3)

**Method.** `discover_v3.py` reuses v2's discovery unchanged:
- Level 1: Kedem–Caplan q per band, PF, Louvain and spectral methods, then the v2 rule 5d (highest mean ARI under ±30 % parameter perturbation, 40 perturbations). The rule chose `KCw0.01-louvain`: k = 10, Q = 0.777.
- Below level 1: Louvain is run again on each sub-block of the same plant-wide weight matrix. A block is split only if it has ≥ 6 assets and Q ≥ 0.25, down to depth 3.
- The discovery code never reads the designed tree (a test checks this).
- A hybrid variant runs the same recursion inside the designed L1 envelopes.

**Discovered tree:** 10 L1, 17 L2 and 2 L3 envelopes. Assets in an envelope that was not split carry its label down, which gives 20 and 21 asset groups at levels 2 and 3.

| Level | Designed groups | Discovered groups | ARI discovered vs designed | ARI hybrid vs designed | Discovered stability, ±30 % (mean / min ARI) |
|---|---|---|---|---|---|
| L1 | 5 | 10 | 0.369 | 1.000 (by construction) | 0.992 / 0.956 |
| L2 | 19 | 20 | 0.513 | 0.752 | 0.872 / 0.764 |
| L3 | 34* | 21 | 0.539 | 0.635 | 0.882 / 0.792 |

*At L3 the designed labels count the 24 L3 envelopes plus the 10 L2 envelopes that hold assets directly.

What the numbers say:
- **Agreement is partial at every level.** The discovered tree is finer than the designed one at the top: discovered L1 matches designed L2 better (ARI 0.439) than designed L1 (0.369).
- **Discovery follows electrical stiffness and shafts, not process areas.** For example:
  - D1 is the main substation plus the whole compressor train and its gas cooler.
  - D4 is the CW pumps, the CW network, the reactor jacket J-A1 and every water-side cooler.
  - D2 is TX2, MCC-A and both feed pump trains.
  - Each drive sits with its supply transformer and MCC rather than with ELEC. Engineers group by function and ownership; the coupling weights see stiffness.
- **Discovered splits are stable** under ±30 % perturbation (mean ARI 0.87–0.99). Two of the 10 L1 splits are seed-sensitive: inside D1 and D5, Louvain seed ARI is 0.49 and 0.52.
- **Strong inside, weak between holds at designed L1 and L2, not at L3.** Median KC q is 0.727 inside vs 0.540 between at L1, and 0.727 vs 0.561 at L2. At L3 it is 0.604 inside vs 0.644 between: the designed L3 split cuts strong shaft couplings (motor | pump), as engineers do.
- **Brant's 5h domain-span hypothesis** (that envelope boundaries tend to span all five domains) **is not supported in this plant.**
  - No designed or discovered envelope's boundary spans all five domains. The designed L1 envelopes span 1, 4, 4, 3 and 3 domains (ELEC, AREA_A, AREA_B, UTIL, HEAT). HEAT reaches 4 when its plant boundary ports are counted.
  - In the designed tree, mechanical couplings never cross an L1 or L2 boundary. They cross only at L3, where 10 envelopes split a shaft. In the discovered tree, two L1 envelopes (D1, D8) have a mechanical boundary.
  - Chemical crosses level 1 only between AREA_A and AREA_B (reactor to product tank).
  - The ten discovered L1 envelopes span 1–3 domains, or 2–4 counting plant boundary ports.
  - Full table: `results/discovery_v3.json` → `boundary_domain_span`.

## 3. Recursive reduction (exactness and passivity)

**[PROPOSED] Step 6c.** Reduce each child envelope to its boundary ports first (Kron/Schur, with a Norton equivalent for the injections). Then assemble the reduced children with the sibling couplings, and reduce again at the parent. `reduction_v3.py` compares this with one-shot reduction of the whole node, at 36 frequencies from DC to 159 Hz (1000 rad/s).

| Tree | Nodes | Max rel. error, Y | Max rel. error, Norton J | Plant boundary solve, max rel. error | Passive |
|---|---|---|---|---|---|
| Designed | 48 | 3.4e-13 | 7.8e-16 | 1.1e-13 | all |
| Discovered | 29 | 1.8e-13 | 7.5e-10 | 8.7e-14 | all |

- Recursive reduction equals one-shot reduction to round-off on both trees. The 7.5e-10 is node D4, whose Norton current is very small, so relative error is inflated.
- Every reduced node is passive: the smallest eigenvalue of Re Y is ≥ −1.1e-16 relative.
- Some nodes are only marginally passive (≈ 0). They are lossless at DC through an electrical path.
- All 99 asset admittances have min eig Re Y ≥ 0.
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
- Each line grows to LEVEL_END = 2.5 × the amplitude that would just reach the victim's endurance limit in the design model. End amplitudes in pu flow at the source port: X1 0.0167, X2 0.124, X3 0.0659.
- The test runs hourly for 400 days.

**Predictors** (as in v2: transfer-path GLRT with a least-power tie-break, plus damage projection):

| Predictor | Sensors | What it can see |
|---|---|---|
| FULL | all 206 active ports | everything |
| REDUCED_L1 | the 42 ports on designed L1 boundaries | only power crossing an L1 boundary |
| REDUCED_L2 | the 68 ports on designed L2 boundaries | only power crossing an L2 boundary |
| REDUCED_D1 | the 32 ports on discovered L1 boundaries | only power crossing a discovered L1 boundary |
| LOCAL | each asset's own ports, trend only | no transfer path |

The reduced transfer maps equal the matching rows of the full inverse to 2e-15.

**Results (run 2, 20 seeds each).** Warned = alarm after onset and before failure. Root cause L2 = the named source sits in the true source's designed L2 envelope.

| Scen. | Predictor | Warned | Lead, median (IQR), d | Failing asset right | Root cause: asset / L1 / L2 right | False alarms |
|---|---|---|---|---|---|---|
| X1 | FULL | 20/20 | 88.9 (79–102) | 20/20 | 20 / 20 / 20 | 0 |
| X1 | REDUCED_L1 | 20/20 | 89.3 (79–101) | 20/20 | 20 / 20 / 20 | 0 |
| X1 | REDUCED_L2 | 20/20 | 89.6 (79–102) | 20/20 | 20 / 20 / 20 | 0 |
| X1 | REDUCED_D1 | 0/20 | – | – | – | 0 |
| X1 | LOCAL | 20/20 | 91.5 (79–99) | 19/20 | 0 / 0 / 0 | 0 |
| X2 | FULL | 20/20 | 85.2 (68–99) | 20/20 | 20 / 20 / 20 | 0 |
| X2 | REDUCED_L1 | 1/20 | 81.8 | 0/1 | 0 / 0 / 0 | 0 |
| X2 | REDUCED_L2 | 20/20 | 82.7 (68–94) | 19/20 | 20 / 20 / 20 | 0 |
| X2 | REDUCED_D1 | 1/20 | 80.3 | 0/1 | 1 / 1 / 1 | 0 |
| X2 | LOCAL | 20/20 | 87.1 (72–104) | 18/20 | 0 / 18† / 0 | 0 |
| X3 | FULL | 20/20 | 91.0 (70–106) | 20/20 | 9 / 9 / 9 | 0 |
| X3 | REDUCED_L1 | 20/20 | 70.6 (55–107) | 19/20 | 0 / 14 / 14 | 0 |
| X3 | REDUCED_L2 | 19/20 | 71.6 (59–102) | 19/19 | 0 / 9 / 9 | 1 (before onset) |
| X3 | REDUCED_D1 | 19/20 | 98.2 (86–116) | 19/19 | 0 / 19 / 19 | 1 (before onset) |
| X3 | LOCAL | 20/20 | 107.5 (85–120) | 16/20 | 0 / 1 / 0 | 0 |
| C0 | FULL, REDUCED_L1, REDUCED_L2, REDUCED_D1 | no true failures in 20 runs | – | – | – | 0/20 each |
| C0 | LOCAL | no true failures in 20 runs | – | – | – | **19/20** |

†LOCAL names the victim. In X2 the victim is in the same L1 envelope as the source, so its L1 "root cause" is right by accident.

What the table says:
- **A reduced predictor sees a fault only if the fault's path crosses one of its sensed boundaries.** In the table:
  - X1 crosses L1, so REDUCED_L1 and REDUCED_L2 match FULL.
  - X2 stays inside AREA_B, so REDUCED_L1 is blind (1/20) and REDUCED_L2 matches FULL.
  - The discovered L1 envelopes put P-U1 with J-A1 (D4) and K-B1 with E-B1G (D1). So REDUCED_D1 is blind to X1 (0/20) and X2 (1/20).
  - Which boundaries are sensed decides which faults can be traced. Neither tree covers all three faults at level 1 alone. Designed L2 covered X1 and X2 fully but got the X3 source envelope right in only 9/20.
- **X3 (electrical origin): the failing asset is predicted well, but the source asset is ambiguous.**
  - FULL names HF1 in 9/20 runs and LR-B1 in 11/20. LR-B1 is the compressor drive's line reactor, hung on the same stiff 4.16 kV bus. From any sensor, an injection at HF1 and one at LR-B1 look almost the same, and the least-power tie-break picks either.
  - The reduced predictors name the bus itself (SWG1) or LR-B1. REDUCED_D1 names SWG1 in 19/19 warned runs, which gives the right envelope but not the right asset.
  - This is a structural identifiability limit, not noise. Separating two assets on one stiff bus needs sensors that see their branch currents.
- **Lead times** are 70–107 days (median) for every predictor that warns. The damage projection is the same for all; the difference is which path the predictor can see.
- **LOCAL trending warns on time but cannot name a source**, and it alarmed in 19 of 20 no-fault runs. The model predictors had 0 false alarms in 80 no-fault predictor runs.
  - There were 2 alarms before fault onset: X3 seed 3004, REDUCED_L2 and REDUCED_D1. Both predicted AB-A3 at zero remaining life, which was wrong; FULL did not alarm.

**Rule change after run 1 (disclosed).** Run 1 is kept in `results/run1_*`. In run 1, 9 of 20 no-fault runs had a true failure:
- BN-H1 ×7 by the temperature rule. Its peak is 1081 K and the ±10 % perturbed plants reached about 1160 K.
- E-B1G ×1 by fatigue: its mode sat close to a forcing line.
- B-H1G ×1.

Two rules were changed before run 2:
- Temperature limit = peak + max(10 K, 15 % of peak), in place of a fixed margin.
- Victim modes moved to ≥ 6.6 % from every line (J-A1 26.5 Hz, E-B1G 9.8 Hz, GB-A3 19.8 Hz).

Run 2 has 0 true failures in 20 no-fault runs. The fault results moved little between runs. For example, X3 FULL named HF1 in 10/20 in run 1 and 9/20 in run 2; X1 and X2 were unchanged in pattern.

## 5. Site data

`site_data/` holds 4.78 MB in 8 JSON files. The schema is in `site_data/SCHEMA.md`.
- Hierarchies, designed and discovered: id, name, level, parent, children, assets, boundary ports with what each couples to.
- Couplings, and sibling edges at every level with domain and DC and fault-band power.
- Time series for every node (plant, 48 envelopes, 99 assets) for the headline run, X3 seed 3000. Each holds sigma and boundary power at orders 0–3 (value, rate, acceleration, jerk), with Francis smoothing: ±24-sample moving average, then each finite difference re-smoothed ±4.
- **Downsampled** from hourly to one sample per day (hour 12), 3 significant figures.

## Figures

- `figures/fig1_designed_hierarchy.png`: the designed nesting, levels 1–3 over 99 assets.
- `figures/fig2_agreement_by_level.png`: ARI vs designed by level, discovered and hybrid.
- `figures/fig3_root_cause_by_predictor.png`: fraction of runs with the right root-cause L2 envelope, by scenario and predictor.

## Limitations

- A made-up plant with lumped, linear, per-unit physics. Forcing lines are pure tones, and modes are constructed second-order resonances.
- The true plant is the design model with ±10 % perturbation. The predictors use the design model, so model error is bounded by construction.
- Resistive losses in bonds and couplings (0.970 MW at design) leave the model. They are not routed to a thermal port, the same as in v2.
- The 9 zero-sigma assets carry no sigma-based damage.
- Three faults, one victim each, 20 seeds. These are existence results, not rates.
- Discovered L1 depends on the v2 selection rule. The recursion stop rule (MIN_SPLIT = 6, Q_MIN = 0.25) is a choice and was not tuned.

## Open decisions for Brant

1. Merge vs split for same-domain duplicate ports [PROPOSED], and what to do about the 9 zero-sigma assets.
2. Thermal effort base of 1000 K [PROPOSED].
3. The temperature-margin rule changed after run 1 (peak + max(10 K, 15 %)).
4. The recursion stop rule (MIN_SPLIT, Q_MIN, MAX_DEPTH).
5. Should drives and MCCs belong to ELEC or to the trains they feed? Discovery says the trains.
6. Electrical bus identifiability: several assets on one stiff bus cannot be told apart from boundary sensors.
7. The 5h domain-span hypothesis is not supported here. Keep it as a hypothesis, or drop it?
8. Sensor placement: which envelope boundaries to instrument, given that each tree leaves some faults unseen.
