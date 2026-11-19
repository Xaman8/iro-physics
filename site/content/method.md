# Method

A short account of the vocabulary and the formal model behind the bench. The other two tabs are the source documents, rendered as written. Terms marked **[proposed]** are not part of IRO until they are accepted through IRO governance.

## The question

Can a failure in one envelope be predicted from energy that arrives from another envelope, and how far is the cause from the asset that fails?

The bench answers with a toy plant. Every number on the Results page is taken from the study files. The Bench page replays one run of that plant.

## Ports, couplings, envelopes

A **port** is an interface where energy crosses a boundary. It is typed by a domain and carries an effort and a flow. Power at the port is the product of that pair.

| Domain | Effort | Flow |
| --- | --- | --- |
| Mechanical | force / torque | velocity |
| Fluid | pressure | volume flow |
| Thermal | temperature | heat flow |
| Electrical | voltage | current |

Ports are direction-neutral. Direction belongs to the coupling: the nominal direction is source port to target port, and the actual direction is the sign of the coupling power.

A **coupling** is a reified link from a source port to a target port on another asset. The medium is a property of the link (the transfer mechanism, the topology, the intent, the length), not a thing in the chain. A parasitic coupling is an unintended path.

A **bond** is the power link between two ports of the same asset. Domain conversion lives inside the asset, on its bonds. A coupling only joins ports of the same domain. The pump's impeller is a bond from shaft to fluid. The 60 m cooling-water line is a fluid coupling from the pump to the heat exchanger.

An **asset** is a maintainable item: a physical system defined by the constraints it satisfies. This plant groups its assets into four envelopes — pumping, heat exchange, the reactor, and the electrical supply. Each envelope reduces to one equivalent asset. The ports of that equivalent asset are the ends of the couplings that cross the envelope boundary.

In IRO 2.0 the phrase *operating envelope* means something else: the bounded region of safe operating states of one asset, with Design, Safe and Damage limits. This site says **envelope** for the group, and **operating envelope** for those limits. The toy model set the four groups by function. Finding them from coupling strength is a later step, and it is not in this version.

## Entropy generation

Entropy generation is the damage proxy. Dissipated power at a port, a bond or a coupling, divided by temperature, is the entropy generation rate. This first toy model (v1) uses one reference temperature, T0 = 1 per unit, so the rate equals the dissipated power. Toy models v2 and v3 were corrected on 2026-11-19 after a red-team review: they divide each loss by its own temperature with ambient (298.15 K) as the base, count heat that flows from hot to cold, and report σ in kW/K. v1 has not been corrected yet. Entropy generation is only a provisional stand-in for damage. Bryant ties damage to the specific process that wears a part out, so losses a plant is designed to have are not damage in themselves.

The operating envelope is drawn on that one coordinate. The Design limit is 1.05 times the nominal peak. The Safe limit is an asset-specific factor times the nominal peak (1.2 on the heat exchanger, 3 on the pump, 4 on the recirculation valve, 2 on the others). Below the Safe limit there is no degradation. In the Damage region the accumulated excess, divided by the entropic endurance, is the damage fraction. The asset fails when that fraction reaches 1.

Maintenance would enter as an entropy export. This run does not simulate entropy export.

## Formal model, in brief

**Step 1, locked.** Asset *i* stores energy *Hᵢ*. With *Dᵢ* ≥ 0 the dissipation inside the asset,

`dHᵢ/dt = Σ P_c (couplings into i) − Σ P_c (couplings out of i) − Dᵢ`

Internal entropy generation is `Dᵢ / Tᵢ`, plus `Q (1/T_cold − 1/T_hot)` for heat that crosses a temperature difference inside the asset (locked text corrected 2026-11-19; see the Formal model change log).

**Step 2, locked.** Coupling *c* has its own dissipation: power at the source port minus power at the target port. A coupling that carries heat from hot to cold also generates entropy, even with no dissipation (corrected 2026-11-19). The medium stays on the coupling. The constitutive law is the Onsager form. Domain conversion stays inside the asset.

**Step 3, locked.** The plant is the graph of assets and couplings. Grid, ambient and process heat are ideal sources on boundary ports. They are not assets. An envelope reuses that same idea of a boundary.

**Port directionality [proposed].** A design constraint on a port: source-only, target-only, or reversible. It says what the port is built to tolerate. It is not the physics of direction. Net coupling power against it, beyond a deadband, is an excursion.

**Convergent excitation [proposed].** Two or more sources, each inside its own limits, whose combined response at a target asset exceeds a limit — in phase, near a resonance, or by mixing. Damage is taken on the combined response. It is never the sum of per-source damages. An averaged-power description of an envelope cannot see it. A spectral description of the boundary ports can, when the mixing happens outside the envelope.

**Port-to-port map [proposed].** Eliminate the internal ports (a Kron reduction) and what remains is a map between the ports you keep, for one operating state of the linear model. The magnitude of that map ranks how much of a source shows up at a target. It is a screening view. The coupling graph stays the model: the map drops the path, the phase, and any damage in the assets it removes.

## What the bench compares

The headline mechanism is a pulsation at the pump's fluid port, in a band at 0.5 rad/s. The pulsation power crosses the coupling into the heat-exchange envelope.

v2 names a cause by fitting which single source port, through the plant transfer maps, best explains the effort-sensor readings in one DC channel plus five known line-frequency bands. Forecast damage then picks the cause. Port power is only a tie-break. The derivative charts are display only and are never used for attribution. v1 used port power directly.

Three readings of the same damage model are carried on the v1 bench:

- **Full model.** Every port.
- **Reduced envelope model.** Boundary couplings only.
- **Local band sensor.** Ports inside the heat-exchange envelope.

A fourth reading, conventional temperature and pressure with no band sensor, is in the results. It is the case where the local indicators are not the variable that carries the failure.

The distance study asks the second half of the question: of the ways to measure how far a target is from a source, which ones track the entropy generation that actually arrives. The candidates and their rank correlations are on the Results page.
