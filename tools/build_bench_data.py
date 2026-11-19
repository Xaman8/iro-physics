#!/usr/bin/env python3
"""Regenerate the static JSON the bench site reads.

Run from anywhere:

    python3 tools/build_bench_data.py

Inputs (already in the repo):

    model/iro_plant.py, model/cross_system_failure.py
    model/results/*.json, model/results/*.csv
    model/figures/, model/explainer/, model/VOCABULARY.md
    content/method.md, content/FORMAL_MODEL.md

Outputs:

    site/data/plant.json        swappable plant (assets, ports, couplings, envelopes)
    site/data/scenario.json     one fault, daily series, warnings, band tracks
    site/data/results.json      study tables copied from model/results
    site/data/captions.json     overview captions with counts and study figures
    site/assets/                figures and explainer drawings
    site/content/               markdown the Method page renders
    site/paper/iro-envelopes.pdf   only if paper/iro-envelopes.pdf is present

The interactive run is seed 1000 of the headline study. That seed is the
representative case saved with the study (onset, failure day and the four
warnings are checked below). Published medians are not recomputed; they are
copied from the result files.
"""
from __future__ import annotations

import csv
import json
import shutil
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "model"
SITE = ROOT / "site"
sys.path.insert(0, str(MODEL))

import cross_system_failure as cs  # noqa: E402
import iro_plant as ip  # noqa: E402

SEED = 1000
# Landmarks of the representative case, so a numpy change cannot silently
# publish a different run under the same seed.
LOCK = {
    "onset": 23.98031522411054,
    "hx1_failure": 105.625,
    "full_alarm": 34.5,
    "reduced_alarm": 34.5,
    "local_alarm": 34.25,
    "full_source": "SYS_A:P1.fluid",
    "reduced_source": "SYS_A (path SYS_B <- SYS_A)",
    "local_source": "SYS_B (local item HX1.fluid)",
}
NOISE_LEVELS = (0.0, 0.01, 0.05, 0.10, 0.20)
FIGURES = (
    "fig1_propagation_path.png",
    "fig2_predicted_vs_actual_damage.png",
    "fig3_effect_vs_distance.png",
    "fig4_convergent_excitation.png",
)


def sigfig(x, n=6):
    if x is None:
        return None
    x = float(x)
    if not np.isfinite(x):
        return None
    return float(f"{x:.{n}g}")


def series(a, n=6):
    return [sigfig(x, n) for x in np.asarray(a, float)]


def daily_mean(t, hourly):
    """Mean of `hourly` over each calendar day. hourly is (hours,) or (hours, k)."""
    day = np.floor(np.asarray(t)).astype(int)
    nd = int(day.max()) + 1
    hourly = np.asarray(hourly, float)
    out = np.zeros((nd,) + hourly.shape[1:], float)
    for d in range(nd):
        m = day == d
        out[d] = hourly[m].mean(axis=0)
    return out


def run_seed(seed):
    """Same draws as cross_system_failure.run_case(seed, True), plus the plant."""
    rng = np.random.default_rng(seed)
    n = int(cs.DAYS * 24 / cs.DT_H)
    plant = ip.perturbed_plant(rng, 0.10)
    hw = (rng.uniform(40, 150), 10.0, 0.12) if rng.uniform() < 0.5 else None
    ls = (rng.uniform(30, 150), 0.10) if rng.uniform() < 0.5 else None
    t, load, grid, amb = cs.context_series(rng, n, hw, ls)
    t0 = float(rng.uniform(10, 40))
    exponent = float(rng.uniform(0.8, 1.3))
    rate = float(rng.uniform(0.010, 0.022) * 50 ** (1 - exponent))
    amplitude = cs.mechanism_amplitude(rng, t, t0, rate, exponent)
    truth = cs.simulate_truth(plant, t, load, grid, amb, amplitude, seed)
    methods = {M.name: M(truth, t).run() for M in cs.METHODS}
    return dict(
        plant=plant, t=t, load=load, grid=grid, amb=amb, amplitude=amplitude,
        t0=t0, exponent=exponent, rate=rate, heatwave=hw, load_step=ls,
        truth=truth, methods=methods,
    )


def coupling_power(plant, t, grid, load, amb, a_tot):
    """Daily-mean power of every link. DC is e·f. AC is the pulsation mean power."""
    xa = plant.ac(cs.MECHANISM_PORT, cs.OMEGA_F, 1.0)
    basis = cs.dc_basis(plant)
    xs = basis @ np.vstack([grid, load, amb])
    n_links = len(plant.links)
    p_dc = np.zeros((len(t), n_links))
    p_ac_coef = np.zeros(n_links)
    for k, link in enumerate(plant.links):
        if link.L > 0:
            flow = xs[plant.n + plant.Llinks.index(k)]
        else:
            flow = (xs[ip.PIDX[link.source]] - xs[ip.PIDX[link.target]]) / link.R
        p_dc[:, k] = xs[ip.PIDX[link.target]] * flow
        p_ac_coef[k] = plant.port_power(xa, k, at="target", ac=True)
    p_ac = p_ac_coef * (a_tot ** 2)[:, None]
    return daily_mean(t, p_dc), daily_mean(t, p_ac), xa


def band_amplitudes(plant, t, a_tot, xa, truth):
    """Daily-mean |band effort| at each port, for several sensor-noise levels.

    0 pu is the model. 0.01 pu is this run's own band sensor (the stream inside
    simulate_truth). The other levels are fresh draws of the same noise model,
    seeded from the level so they repeat.
    """
    ports = plant.n
    clean = np.abs(np.outer(a_tot, xa[:ports]))
    levels = {0.0: clean, 0.01: np.abs(truth["band"])}
    for level in NOISE_LEVELS:
        if level in levels:
            continue
        rng = np.random.default_rng(SEED * 1000 + int(round(level * 1000)))
        noise = level * (
            rng.standard_normal((len(t), ports)) + 1j * rng.standard_normal((len(t), ports))
        ) / np.sqrt(2)
        levels[level] = np.abs(np.outer(a_tot, xa[:ports]) + noise)
    daily = {level: daily_mean(t, levels[level]) for level in NOISE_LEVELS}
    return daily


def first_day(t, mask):
    idx = np.nonzero(mask)[0]
    if len(idx) == 0:
        return None
    return float(t[idx[0]])


def build_plant():
    leaves = []
    for system_id in ("SYS_A", "SYS_B", "SYS_C", "SYS_D"):
        name = ip.SYSTEM_NAME[system_id]
        short = name[name.find("(") + 1] if "(" in name else system_id[-1]
        title = name.split("(")[0].strip()
        leaves.append({
            "id": system_id,
            "name": title,
            "short": short,
            "leaf": True,
            "parentId": ip.system_parent(system_id),
            "assetIds": [a.tag for a in ip.ASSETS if a.system == system_id],
        })
    parents = []
    for system_id, children in ip.SYSTEM_TREE.items():
        parents.append({
            "id": system_id,
            "name": ip.SYSTEM_NAME[system_id],
            "parentId": ip.system_parent(system_id),
            "childIds": list(children),
        })
    assets = []
    for tag in cs.ASSET_TAGS:
        a = ip.ASSET[tag]
        env = cs.ENVELOPES[tag]
        assets.append({
            "id": tag,
            "name": a.name,
            "envelopeId": a.system,
            "x_m": a.xy[0],
            "y_m": a.xy[1],
            "thermalSensitive": bool(a.thermal_sensitive),
            "limits": {
                "design": sigfig(env.design),
                "safe": sigfig(env.safe0),
                "endurance": sigfig(env.endurance),
                "safeFactor": ip.SAFE_FACTOR.get(tag, ip.SAFE_FACTOR_DEFAULT),
                "designFactor": ip.DESIGN_FACTOR,
                "contextSensitivity": ip.CONTEXT_SENSITIVITY if a.thermal_sensitive else 0.0,
            },
        })
    ports = []
    for pid, domain, c_store, g_loss in ip.PORTS:
        ports.append({
            "id": pid,
            "assetId": ip.port_asset(pid),
            "domain": domain,
            "storageC": c_store,
            "designedLossG": g_loss,
            "directionality": ip.PORT_DIRECTIONALITY.get(pid, ip.DIRECTIONALITY_DEFAULT),
        })
    bonds, couplings = [], []
    for link in ip.LINKS:
        row = {
            "id": link.cid,
            "sourcePortId": link.source,
            "targetPortId": link.target,
            "R": link.R,
            "L": link.L,
            "mechanism": link.mechanism,
        }
        if link.kind == "bond":
            row["assetId"] = ip.port_asset(link.source)
            bonds.append(row)
            continue
        src_asset = ip.port_asset(link.source)
        tgt_asset = ip.port_asset(link.target)
        src_env = ip.ASSET[src_asset].system
        tgt_env = ip.ASSET[tgt_asset].system
        row.update({
            "sourceAssetId": src_asset,
            "targetAssetId": tgt_asset,
            "sourceEnvelopeId": src_env,
            "targetEnvelopeId": tgt_env,
            "domain": ip.port_type(link.source),
            "topology": link.topology,
            "intent": link.intent,
            "length_m": link.length_m,
            "boundary": src_env != tgt_env,
        })
        couplings.append(row)
    return {
        "schema": "iro.bench.plant/1",
        "id": "toy-v1",
        "title": "IRO toy plant",
        "units": {
            "power": "pu",
            "effort": "pu",
            "flow": "pu",
            "entropyGeneration": "pu",
            "time": "day",
            "frequency": "rad/s",
            "length": "m",
        },
        "domains": [
            {"id": "mechanical", "effort": "force / torque", "flow": "velocity"},
            {"id": "fluid", "effort": "pressure", "flow": "volume flow"},
            {"id": "thermal", "effort": "temperature", "flow": "heat flow"},
            {"id": "electrical", "effort": "voltage", "flow": "current"},
        ],
        "referenceTemperatureT0": ip.T0,
        "directionalityDeadbandPu": ip.DIRECTIONALITY_DEADBAND,
        "assets": assets,
        "ports": ports,
        "bonds": bonds,
        "couplings": couplings,
        "envelopes": leaves,
        "envelopeParents": parents,
        "boundary": {
            "gridPortId": ip.GRID_PORT,
            "processHeatPortId": ip.PROCESS_HEAT_PORT,
            "note": "Grid and process heat are ideal-source boundary ports, not assets.",
        },
        "replace": (
            "A later plant replaces this file and site/data/scenario.json. "
            "Keep schema iro.bench.plant/1 and iro.bench.scenario/1. "
            "The bench lays envelopes out from asset coordinates."
        ),
    }


def warning_block(methods, t0, failure_day):
    out = {}
    for name, result in methods.items():
        alarm = result["alarm"]
        alarm_f = None if alarm is None else float(alarm)
        out[name] = {
            "alarmDay": None if alarm_f is None else sigfig(alarm_f, 8),
            "failingItem": result["failing"],
            "rootCause": result["attributed_source"],
            "leadTimeDays": None if alarm_f is None or failure_day is None else sigfig(failure_day - alarm_f, 8),
            "detectionDelayDays": None if alarm_f is None else sigfig(alarm_f - t0, 8),
        }
    return out


def build_scenario(plant_doc, run):
    t = run["t"]
    truth = run["truth"]
    plant = run["plant"]
    tags = cs.ASSET_TAGS
    a_tot = truth["a_tot"]
    p_dc, p_ac, xa = coupling_power(plant, t, run["grid"], run["load"], run["amb"], a_tot)
    bands = band_amplitudes(plant, t, a_tot, xa, truth)

    safe = np.zeros((len(t), len(tags)))
    for j, tag in enumerate(tags):
        env = cs.ENVELOPES[tag]
        if env.thermal:
            safe[:, j] = env.safe0 * (1 - ip.CONTEXT_SENSITIVITY * run["amb"])
        else:
            safe[:, j] = env.safe0
    safe_d = daily_mean(t, safe)
    sigma_d = daily_mean(t, truth["sig"])
    damage_d = daily_mean(t, truth["D"])

    failure_day = {}
    entry_day = {}
    for j, tag in enumerate(tags):
        failure_day[tag] = first_day(t, truth["D"][:, j] >= 1.0)
        entry_day[tag] = first_day(t, truth["sig"][:, j] > safe[:, j])

    hx1_fail = failure_day["HX1"]
    assert abs(run["t0"] - LOCK["onset"]) < 1e-9, run["t0"]
    assert hx1_fail is not None and abs(hx1_fail - LOCK["hx1_failure"]) < 1e-9, hx1_fail
    assert run["methods"]["FULL"]["alarm"] == LOCK["full_alarm"]
    assert run["methods"]["REDUCED"]["alarm"] == LOCK["reduced_alarm"]
    assert run["methods"]["LOCAL"]["alarm"] == LOCK["local_alarm"]
    assert run["methods"]["LOCAL_DC"]["alarm"] is None
    assert run["methods"]["FULL"]["attributed_source"] == LOCK["full_source"]
    assert run["methods"]["REDUCED"]["attributed_source"] == LOCK["reduced_source"]
    assert run["methods"]["LOCAL"]["attributed_source"] == LOCK["local_source"]
    assert run["methods"]["FULL"]["failing"] == "HX1"

    nd = sigma_d.shape[0]
    time_days = list(range(nd))
    assets = {}
    for j, tag in enumerate(tags):
        assets[tag] = {
            "sigma": series(sigma_d[:, j]),
            "damage": series(damage_d[:, j]),
            "safe": series(safe_d[:, j]),
        }
    couplings = {}
    for k, link in enumerate(plant.links):
        if link.kind != "coupling":
            continue
        couplings[link.cid] = {"powerDc": series(p_dc[:, k]), "powerAc": series(p_ac[:, k])}

    # Baseline σ unit: scatter of the 0.01 pu band sensor over days [0, 8).
    ref = bands[0.01]
    mu = ref[:8].mean(axis=0)
    sd = ref[:8].std(axis=0)
    if np.any(sd <= 0):
        raise SystemExit("band-sensor baseline has a zero standard deviation")

    port_ids = list(ip.PORT_IDS)
    band_out = {}
    for level, table in bands.items():
        key = f"{level:.2f}"
        band_out[key] = [series(table[:, i], 5) for i in range(table.shape[1])]

    link_index = {link.cid: k for k, link in enumerate(plant.links)}
    boundary_id = "P1.fluid->HX1.fluid"
    bi = link_index[boundary_id]
    instruments = [
        {
            "id": "hx1-sigma",
            "label": "HX1 entropy generation",
            "unit": "pu",
            "series": assets["HX1"]["sigma"],
        },
        {
            "id": "hx1-damage",
            "label": "HX1 damage",
            "unit": "endurance fraction",
            "series": assets["HX1"]["damage"],
        },
        {
            "id": "boundary-pulsation",
            "label": "P1.fluid → HX1.fluid pulsation power",
            "unit": "pu",
            "series": series(p_ac[:, bi]),
        },
        {
            "id": "boundary-power",
            "label": "P1.fluid → HX1.fluid power",
            "unit": "pu",
            "series": series(p_dc[:, bi] + p_ac[:, bi]),
        },
        {
            "id": "hx1-fluid-band",
            "label": "HX1.fluid band amplitude",
            "unit": "pu",
            "series": series(bands[0.0][:, ip.PIDX["HX1.fluid"]]),
        },
        {
            "id": "p1-sigma",
            "label": "P1 entropy generation",
            "unit": "pu",
            "series": assets["P1"]["sigma"],
        },
    ]

    def event_triplet(triple):
        if triple is None:
            return None
        return {"startDay": sigfig(triple[0], 6), "durationDays": triple[1], "heightPu": triple[2]}

    def event_pair(pair):
        if pair is None:
            return None
        return {"startDay": sigfig(pair[0], 6), "heightPu": pair[1]}

    fault = {
        "id": "p1-pulsation",
        "label": "P1 pulsation",
        "mechanismPort": cs.MECHANISM_PORT,
        "sourceAssetId": "P1",
        "sourceEnvelopeId": "SYS_A",
        "targetAssetId": "HX1",
        "targetEnvelopeId": "SYS_B",
        "boundaryCouplingId": boundary_id,
        "bandRadPerS": cs.OMEGA_F,
        "backgroundAmplitudePu": cs.A_BG,
        "onsetDay": sigfig(run["t0"], 8),
        "exponent": sigfig(run["exponent"], 6),
        "rate": sigfig(run["rate"], 6),
        "heatwave": event_triplet(run["heatwave"]),
        "loadStep": event_pair(run["load_step"]),
        "failureDay": {k: (None if v is None else sigfig(v, 8)) for k, v in failure_day.items()},
        "damageEntryDay": {k: (None if v is None else sigfig(v, 8)) for k, v in entry_day.items()},
        "assets": assets,
        "couplings": couplings,
        "instruments": instruments,
        "warnings": warning_block(run["methods"], run["t0"], hx1_fail),
        "classic": {
            "displaySigmaMax": 12,
            "detectionSigma": cs.K_SIGMA,
            "sigmaUnit": (
                "Daily-mean band amplitude, minus its mean over days 0–7, "
                "divided by the standard deviation of the 0.01 pu band sensor over those days."
            ),
            "noiseLevelsPu": [float(f"{level:.2f}") for level in NOISE_LEVELS],
            "defaultNoisePu": 0.01,
            "portIds": port_ids,
            "baselineMu": series(mu, 6),
            "baselineSd": series(sd, 6),
            "band": band_out,
        },
    }
    return {
        "schema": "iro.bench.scenario/1",
        "plantId": plant_doc["id"],
        "seed": SEED,
        "days": cs.DAYS,
        "sample": "Each value is the mean of the 24 hourly steps of that day. The plant for this seed differs from the design model by up to 10% in every parameter.",
        "timeDays": time_days,
        "derivative": "Orders 1–3 on the bench are finite differences of these daily means, per day.",
        "faults": [fault],
    }


def load_json(name):
    return json.loads((MODEL / "results" / name).read_text())


def read_csv(name):
    with (MODEL / "results" / name).open(newline="") as handle:
        return list(csv.DictReader(handle))


def build_results():
    headline = load_json("cross_system_failure_summary.json")
    redundant = []
    rows = read_csv("distance_redundancy.csv")
    names = [row["distance"] for row in rows]
    for row in rows:
        a = row["distance"]
        for b in names:
            if a >= b:
                continue
            raw = row[b]
            value = float(raw)
            if abs(value) >= 0.8:
                redundant.append({"a": a, "b": b, "rho": raw})
    pair = None
    for row in read_csv("distance_pairs.csv"):
        if row["source"] == "F1" and row["target"] == "HX1":
            pair = row
            break
    if pair is None:
        raise SystemExit("distance_pairs.csv has no F1 → HX1 row")
    distance_keys = [k for k in pair if k.startswith("d")]
    return {
        "schema": "iro.bench.results/1",
        "sources": {
            "headline": "model/results/cross_system_failure_summary.json",
            "directionalityNoDeadband": "model/results/cross_system_failure_summary_no_deadband.json",
            "directionalityR1TargetOnly": "model/results/cross_system_failure_summary_R1_target_only.json",
            "noise": "model/results/noise_sweep_summary.json",
            "entropy": "model/results/system_entropy_generation.csv",
            "distanceRank": "model/results/distance_rank_correlations.csv",
            "distancePairs": "model/results/distance_pairs.csv",
            "distanceRedundancy": "model/results/distance_redundancy.csv",
            "convergent": "model/results/convergent_excitation_summary.json",
        },
        "headline": headline,
        "directionalityNoDeadband": load_json("cross_system_failure_summary_no_deadband.json")["_truth"],
        "directionalityR1TargetOnly": load_json("cross_system_failure_summary_R1_target_only.json")["_truth"],
        "noise": load_json("noise_sweep_summary.json"),
        "entropy": read_csv("system_entropy_generation.csv"),
        "distanceRank": read_csv("distance_rank_correlations.csv"),
        "distanceRedundant": redundant,
        "headlinePair": {
            "source": pair["source"],
            "mechanism": pair["mechanism"],
            "sourcePort": pair["source_port"],
            "target": pair["target"],
            "targetPort": pair["target_port"],
            "band": pair["band"],
            "effectTransferRatio": pair["effect_transfer_ratio"],
            "timeToFailureDays": pair["time_to_failure_d"],
            "damageRegionEntryDays": pair["damage_region_entry_d"],
            "distances": {k: pair[k] for k in distance_keys},
        },
        "convergent": load_json("convergent_excitation_summary.json"),
        "figures": [
            {
                "id": "fig1",
                "file": "assets/figures/fig1_propagation_path.png",
                "title": "Propagation path",
                "caption": "Pulsation power flow from the pump fluid port to HX1, and the entropy generation it adds. The numbers drawn on the figure come from the figure generator at a pulsation amplitude of 1 pu.",
            },
            {
                "id": "fig2",
                "file": "assets/figures/fig2_predicted_vs_actual_damage.png",
                "title": "Predicted and actual damage",
                "caption": "HX1 on the representative run (seed 1000). The lower panel is predicted remaining useful life. Vertical lines are each method's warning.",
            },
            {
                "id": "fig3",
                "file": "assets/figures/fig3_effect_vs_distance.png",
                "title": "Effect against propagation distance",
                "caption": "Added entropy generation at the target per unit power at the source, for the three distances with the strongest rank correlation. The table below is the correlation file.",
            },
            {
                "id": "fig4",
                "file": "assets/figures/fig4_convergent_excitation.png",
                "title": "Convergent excitation",
                "caption": "Correct calls at the cooling-water valve, whose natural mode is at 2.0 rad/s. The table below is the summary file.",
            },
        ],
    }


def build_captions(plant_doc, results):
    h = results["headline"]
    full, reduced, local = h["FULL"], h["REDUCED"], h["LOCAL"]
    n_assets = len(plant_doc["assets"])
    n_ports = len(plant_doc["ports"])
    n_couplings = len(plant_doc["couplings"])
    n_boundary = sum(1 for c in plant_doc["couplings"] if c["boundary"])
    n_envelopes = len(plant_doc["envelopes"])
    line = next(c for c in plant_doc["couplings"] if c["id"] == "P1.fluid->HX1.fluid")
    return {
        "figures": [
            {
                "file": "assets/explainer/explainer_1_plant.svg",
                "title": "The plant is assets joined by couplings",
                "caption": (
                    f"The toy plant has {n_assets} assets, {n_ports} ports and {n_couplings} couplings. "
                    "Each coupling carries one domain of energy between ports on two assets. "
                    "Energy changes domain only inside an asset, on a bond. The pump turns shaft power into fluid power."
                ),
            },
            {
                "file": "assets/explainer/explainer_2_envelopes.svg",
                "title": "Grouping the plant into envelopes",
                "caption": (
                    f"The same plant grouped into {n_envelopes} envelopes. "
                    f"{n_boundary} of the {n_couplings} couplings cross a boundary. "
                    "In this toy model the groups were set by function. Finding them from coupling strength is not built yet."
                ),
            },
            {
                "file": "assets/explainer/explainer_3_envelope_as_asset.svg",
                "title": "Each envelope becomes one asset",
                "caption": (
                    f"Each envelope folds into one block. Its ports are the ends of the {n_boundary} boundary couplings. "
                    "The study below uses only the power on those couplings for the reduced model, and every port for the full model."
                ),
                "stats": [
                    {"label": "Runs in the study", "value": full["mechanism_runs_with_target_failure"]},
                    {"label": "Full model, warned before failure", "value": full["warned_before_failure"]},
                    {"label": "Full model, median lead time (days)", "value": full["lead_time_days_median"]},
                    {"label": "Full model, root cause envelope A", "value": full["root_cause_SYS_A_correct"]},
                    {"label": "Reduced model, warned before failure", "value": reduced["warned_before_failure"]},
                    {"label": "Reduced model, median lead time (days)", "value": reduced["lead_time_days_median"]},
                    {"label": "Reduced model, root cause envelope A", "value": reduced["root_cause_SYS_A_correct"]},
                ],
            },
            {
                "file": "assets/explainer/explainer_4_cross_envelope_failure.svg",
                "title": "A failure that crosses envelopes",
                "caption": (
                    f"Pulsation from the pump in envelope A travels the coupling P1.fluid → HX1.fluid "
                    f"({line['length_m']} m, {line['mechanism']}) and the heat exchanger in envelope B reaches entropic endurance. "
                    "The local band sensor and the reduced model are not the same on the source."
                ),
                "stats": [
                    {"label": "Local band sensor, warned before failure", "value": f"{local['warned_before_failure']}/{local['mechanism_runs_with_target_failure']}"},
                    {"label": "Local band sensor, median lead time (days)", "value": local["lead_time_days_median"]},
                    {"label": "Local band sensor, root cause envelope A", "value": local["root_cause_SYS_A_correct"]},
                    {"label": "Reduced model, root cause envelope A", "value": reduced["root_cause_SYS_A_correct"]},
                ],
            },
        ]
    }


def dump(path, obj, indent=2):
    path.write_text(json.dumps(obj, indent=indent, allow_nan=False) + "\n")
    print(f"  {path.relative_to(ROOT)}  {path.stat().st_size / 1024:.0f} KiB")


def copy_static():
    fig_dir = SITE / "assets" / "figures"
    exp_dir = SITE / "assets" / "explainer"
    content = SITE / "content"
    for directory in (fig_dir, exp_dir, content, SITE / "data", SITE / "paper"):
        directory.mkdir(parents=True, exist_ok=True)
    for name in FIGURES:
        shutil.copy(MODEL / "figures" / name, fig_dir / name)
    for svg in (MODEL / "explainer").glob("*.svg"):
        shutil.copy(svg, exp_dir / svg.name)
    shutil.copy(MODEL / "VOCABULARY.md", content / "vocabulary.md")
    shutil.copy(ROOT / "content" / "FORMAL_MODEL.md", content / "formal-model.md")
    shutil.copy(ROOT / "content" / "method.md", content / "method.md")
    pdf = ROOT / "paper" / "iro-envelopes.pdf"
    dest = SITE / "paper" / "iro-envelopes.pdf"
    if pdf.exists():
        shutil.copy(pdf, dest)
        print(f"  copied {pdf.relative_to(ROOT)}")
    elif dest.exists():
        dest.unlink()


def main():
    print("simulating seed", SEED)
    run = run_seed(SEED)
    plant_doc = build_plant()
    scenario = build_scenario(plant_doc, run)
    results = build_results()
    captions = build_captions(plant_doc, results)
    copy_static()
    dump(SITE / "data" / "plant.json", plant_doc)
    dump(SITE / "data" / "scenario.json", scenario, indent=None)
    dump(SITE / "data" / "results.json", results)
    dump(SITE / "data" / "captions.json", captions)
    fault = scenario["faults"][0]
    print(
        "onset", fault["onsetDay"],
        "HX1 damage entry", fault["damageEntryDay"]["HX1"],
        "HX1 failure", fault["failureDay"]["HX1"],
    )
    for name, block in fault["warnings"].items():
        print(f"  {name}: alarm {block['alarmDay']} cause {block['rootCause']}")


if __name__ == "__main__":
    main()
