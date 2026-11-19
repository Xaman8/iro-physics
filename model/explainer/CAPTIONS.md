# IRO toy model: explainer figures (captions)

Source: `../iro_plant.py` (structure) and the model's own pulsation response (Fig. 4). Regenerate with `python3 make_explainer.py`.

**0. Overview** (`explainer_0_overview.png`): the four figures below on one page, in story order.

**1. The plant is assets joined by couplings** (`explainer_1_plant.png`)
The toy plant has 11 assets, 21 ports and 13 couplings, and each coupling carries one kind of energy between ports on two assets. Energy changes form only inside an asset, for example where the pump turns shaft power into fluid power.

**2. Grouping the plant into envelopes** (`explainer_2_envelopes.png`)
The same plant grouped into four envelopes, with only 5 of its 13 couplings crossing a boundary. In this toy model the groups were set by function; finding them automatically from coupling strength is Step 5 of the formal model, which isn't built yet.

**3. Each envelope becomes one asset** (`explainer_3_envelope_as_asset.png`)
Each envelope is folded into a single block whose ports are the ends of the 5 boundary couplings, so the plant becomes a network of four blocks fed by the grid and the process heat load. Using only the power on those 5 couplings, this reduced model warned of the failure as early as the full model (about 62 days ahead, median) and named the right source in 40 of 40 runs.

**4. A failure that crosses envelopes** (`explainer_4_cross_envelope_failure.png`)
Pulsation from the pump in envelope A travels down the 60 m line and wears out the heat exchanger in envelope B (line width = pulsation power arriving, shading = extra entropy generation). A local sensor on the exchanger warned just as early but blamed the exchanger in all 40 runs, while the envelope model traced the cause to the pump in all 40.
