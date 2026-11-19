# site_data schema (IRO toy model v3)

**Made-up plant.** Every number here comes from `plant_v3.py`, `failure_test_v3.py` and `site_data.py` in this folder. Nothing describes a real site. Build the folder again with `python3 site_data.py` (about 3 s; it re-simulates the headline run).

All numbers are rounded to 3 significant figures. Power is in MW (power base 1 MW). sigma is in per unit, MW / T0 with T0 = 1. Total size is 4.78 MB across the 8 JSON files.

## Files

| File | Holds |
|---|---|
| `hierarchy.json` | The designed tree (the engineer's grouping): every node with its parent, children, assets and boundary ports, plus the plant boundary ports |
| `hierarchy_discovered.json` | The same structure for the tree found by recursive discovery (`discover_v3.py`). Node ids such as `D4.D1` are arbitrary labels |
| `couplings.json` | All 134 couplings between assets, and the sibling edges at every level of the designed tree |
| `ts_L0.json` … `ts_L3.json` | Time series for every designed envelope at that level (L0 = the plant) |
| `ts_assets.json` | Time series for every one of the 99 assets |

## hierarchy.json

- `meta`: `tree`, `made_up_plant`, `model`, `levels` (envelope count per level: 1 / 5 / 19 / 24), `n_assets` 99, `n_ports_total` 495 (5 per asset), `n_ports_active` 206, `domains`, `ambient`, `note`.
- `plant_boundary[]`: one entry per plant boundary port (14).
  - `name`, `direction` (in / out), `domain`, `port`, `asset`.
  - `path`: the chain from `PLANT` down to the asset, so every input and output can be traced through the hierarchy.
  - `model` (Norton source or sink conductance), `note`, `dc_power_into_plant_MW` (signed; negative means leaving the plant).
- `nodes[]`: 148 entries: 1 plant, 48 envelopes (5 + 19 + 24) and 99 assets.
  - `id`: dotted path for envelopes (`AREA_A.RX.AGD`), the tag for assets (`GB-A3`).
  - `name`, `level` (0–3 for envelopes; an asset's level is its parent's level + 1), `parent`, `kind` (plant / envelope / asset), `children`, `assets` (every asset below the node).
  - `n_active_ports`.
  - `boundary_ports[]`: ports of the node that couple to something outside it. Each has `port`, `asset`, `domain`, and `coupled_to[]`. Each `coupled_to` entry has `port`, `asset`, `other_node` (the sibling at the same level that owns the far end), `link`, `direction` (out = nominal flow leaves this node), `topology`, `intent` (desired / parasitic) and `dc_power_MW`.
  - `plant_boundary_ports[]`: the plant boundary ports that sit inside this node.
  - `boundary_domains`: the domains of `boundary_ports`. `boundary_domains_with_plant_ports` adds the plant boundary port domains.
  - `timeseries_file`: which `ts_*.json` file holds this node's time series.
  - Asset nodes also carry `asset_kind`, `victim_mode` (the constructed structural mode for the three victim assets, otherwise null) and `ports`: all 5 ports, each with `port`, `domain` and `status` (`active` / `empty`). Empty ports are present but have no coupling and no boundary.

## couplings.json

- `links[]`: every coupling. Fields: `id`, `source_port`, `target_port`, `source_asset`, `target_asset`, `domain`, `topology`, `intent`, `mechanism`, `length_m`, `source_path`, `target_path`.
  - `dc_power_MW_design`: power at the source port at the design point. For thermal links it is the heat flow.
  - `fault_band_power_MW_at_failure`: time-averaged AC power in the headline fault band (18.5 Hz) at the source port, at the first-failure hour of the headline run.
- `sibling_edges{parent_id: [...]}`: for every designed envelope, the couplings between two of its children, grouped by child pair and domain.
  - `a`, `b`: the two children. `domain`. `links`: the link ids. `n_links`.
  - `dc_power_MW_a_to_b`: summed DC power, positive from a to b.
  - `fault_band_power_MW_a_to_b`: the same in the fault band, at the failure hour.

## ts_*.json

- `meta`:
  - `scenario` (X3), `scenario_label`, `seed` (3000), `fault_onset_day`, `first_failure` (`asset`, `day`), `fault_line` (`name`, `port`, `f_Hz`).
  - `predictor_alarms_this_run`: for each predictor (FULL, REDUCED_L1, REDUCED_L2, REDUCED_D1, LOCAL), the alarm day and the predicted failing asset, root-cause asset and its L1 and L2 envelope, remaining life at the alarm (days), and the channel. Taken from `results/failure_cases.json`.
  - `day_axis`, `smoothing`, `quantities` (definitions), `orders`, `rounding`.
- `day[]`: 400 values. `day[k] = k + 0.5`.
- `nodes{id: {...}}`:
  - `sigma`: 4 arrays (orders 0–3), each with 400 values.
  - `boundary_power`: 4 arrays (orders 0–3), each with 400 values.
  - `fault_band_power`: 1 array (order 0 only).
  - `damage`: 1 array (order 0 only), or `null` when the node's damage is zero for the whole run.

### Quantities

| Key | Meaning | Unit |
|---|---|---|
| `sigma` | Entropy generation inside the node: designed losses at its assets' ports, its bonds, and couplings with both ends inside it. DC plus the AC lines | pu (MW / T0, T0 = 1) |
| `boundary_power` | Net power into the node through its boundary couplings (taken at the node-side port; thermal = heat flow), plus any plant boundary ports inside it. DC plus time-averaged AC | MW |
| `fault_band_power` | The part of `boundary_power` in the headline fault band only (18.5 Hz, time-averaged AC) | MW |
| `damage` | Largest Miner damage fraction over the node's assets (1 = failure) | – |

### Orders and smoothing (Francis)

- The simulation runs hourly for 400 days.
- Order 0 = centred moving average over ±24 hourly samples.
- Order n = finite difference (`np.gradient`) of order n−1, re-smoothed with a ±4-sample moving average.
- Units per day^n: order 1 = rate (per day), 2 = acceleration (per day²), 3 = jerk (per day³).
- **Downsampled:** after smoothing, one sample per day is kept (hour 12). Hourly series are not stored.
- The first and last day of each series are affected by the window edges.

## What the files do not hold

- No hourly data.
- No time series for the discovered tree. Its structure is in `hierarchy_discovered.json`; it has no `ts_` files.
- No time series for runs other than the headline. Summary results for all runs are in `../results/`.
