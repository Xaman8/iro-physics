#!/usr/bin/env python3
"""Copy v2 study files into the static site and write the envelope graph.

Reads the v2 toy model next to this repo when present, or the path in
V2_ROOT. Does not resimulate the failure test. Numbers in the JSON are
the stored file tokens.
"""
from __future__ import annotations

import csv
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CANDIDATES = [
    Path("/cursor/stores/bot/iro-toy-model/v2"),
    ROOT.parent / "iro-toy-model" / "v2",
]
V2 = next((p for p in CANDIDATES if (p / "plant_v2.py").exists()), None)
if V2 is None:
    sys.exit("v2 toy model not found")

SITE = ROOT / "site"
sys.path.insert(0, str(V2))
import plant_v2 as pv  # noqa: E402

NAMES = {
    frozenset(["XF1", "SWG1", "VFD2"]): "Supply",
    frozenset(["VFD1", "MCC1", "M1", "P1", "M2", "P2", "HDR1", "CV1", "CV2", "M3", "FAN1"]): "Pump trains",
    frozenset(["MCC2", "P3", "M5", "M4", "GB1", "AG1", "BRG1", "BRG2", "LOP1", "HX2"]): "Drives and oil",
    frozenset(["HDR2", "CT1", "HX1", "R1"]): "Heat rejection",
    frozenset(["M6", "C1", "IC1", "KO1"]): "Gas train",
}


def read_csv(name):
    with (V2 / "results" / name).open(newline="") as handle:
        return list(csv.DictReader(handle))


def main():
    discovery = json.loads((V2 / "results" / "discovery.json").read_text())
    groups = discovery["partitions"]["PF-louvain"]
    env_of = {}
    envelopes = []
    for i, tags in enumerate(groups):
        key = frozenset(tags)
        if key not in NAMES:
            raise SystemExit(f"PF-louvain group {tags} has no name in the v2 README")
        eid = f"E{i}"
        envelopes.append({"id": eid, "name": NAMES[key], "assetIds": list(tags)})
        for tag in tags:
            env_of[tag] = eid

    assets = []
    for asset in pv.ASSETS:
        assets.append({
            "id": asset.tag,
            "name": asset.name,
            "kind": asset.kind,
            "x_m": asset.xy[0],
            "y_m": asset.xy[1],
            "envelopeId": env_of[asset.tag],
        })

    couplings = []
    for link in pv.couplings():
        a = pv.port_asset(link.source)
        b = pv.port_asset(link.target)
        couplings.append({
            "id": link.cid,
            "sourcePortId": link.source,
            "targetPortId": link.target,
            "sourceAssetId": a,
            "targetAssetId": b,
            "sourceEnvelopeId": env_of[a],
            "targetEnvelopeId": env_of[b],
            "domain": link.source.split(".", 1)[1].split("_")[0],
            "intent": link.intent,
            "topology": link.topology,
            "mechanism": link.mechanism,
            "length_m": link.length_m,
            "boundary": env_of[a] != env_of[b],
        })

    boundary_ports = []
    seen = set()
    for coupling in couplings:
        if not coupling["boundary"]:
            continue
        for port, asset, env in (
            (coupling["sourcePortId"], coupling["sourceAssetId"], coupling["sourceEnvelopeId"]),
            (coupling["targetPortId"], coupling["targetAssetId"], coupling["targetEnvelopeId"]),
        ):
            key = (env, port)
            if key in seen:
                continue
            seen.add(key)
            boundary_ports.append({"envelopeId": env, "assetId": asset, "portId": port, "couplingId": coupling["id"]})

    plant = {
        "schema": "iro.bench.plant-graph/1",
        "id": "toy-v2",
        "title": "IRO toy plant v2",
        "discoveredBy": "PF-louvain",
        "replay": False,
        "note": "No v2 time series are in this site. The graph is the discovered plant, not a replay.",
        "counts": {
            "assets": len(assets),
            "ports": len(pv.PORT_IDS),
            "bonds": sum(1 for link in pv.LINKS if link.kind == "bond"),
            "couplings": len(couplings),
            "boundaryCouplings": sum(1 for c in couplings if c["boundary"]),
            "boundaryPorts": len({row["portId"] for row in boundary_ports}),
            "envelopes": len(envelopes),
        },
        "assets": assets,
        "couplings": couplings,
        "envelopes": envelopes,
        "boundaryPorts": boundary_ports,
    }

    summary = json.loads((V2 / "results" / "failure_summary.json").read_text())
    table = summary["table"]
    cross = {k: v for k, v in table.items() if "cross_envelope" in k}
    out = {
        "failureTable": read_csv("failure_table.csv"),
        "failureTableSf15": read_csv("failure_table_sf1.5.csv"),
        "failureTableSf3": read_csv("failure_table_sf3.csv"),
        "distanceRank": read_csv("distance_rank_correlations.csv"),
        "crossEnvelope": cross,
        "modularityNull": discovery["modularity_null"],
        "pfLouvainKc": discovery["strong_inside_weak_between"]["PF-louvain"]["KC_DC"],
        "engineerKc": discovery["strong_inside_weak_between"]["ENG-functional"]["KC_DC"],
        "stability30": discovery["perturbation_stability"]["30%"]["PF-louvain"],
        "ariPfLouvainEngineer": None,
    }
    # ARI matrix cell, stored to 3 decimals in discovery_ARI.csv
    for row in read_csv("discovery_ARI.csv"):
        # first column has an empty header
        pass
    ari_rows = list(csv.reader((V2 / "results" / "discovery_ARI.csv").open()))
    header = ari_rows[0]
    eng_i = header.index("ENG-functional")
    for row in ari_rows[1:]:
        if row[0] == "PF-louvain":
            out["ariPfLouvainEngineer"] = row[eng_i]
            out["ariHeader"] = header[1:]
            out["ariPfLouvainRow"] = row[1:]

    data = SITE / "data"
    data.mkdir(parents=True, exist_ok=True)
    (data / "v2-plant.json").write_text(json.dumps(plant, indent=2) + "\n")
    (data / "v2-results.json").write_text(json.dumps(out) + "\n")
    fig = SITE / "assets" / "figures"
    fig.mkdir(parents=True, exist_ok=True)
    for name in ("fig1_discovered_envelopes.png", "fig2_root_cause_false_alarms.png"):
        shutil.copy(V2 / "figures" / name, fig / name)
    content = SITE / "content"
    content.mkdir(parents=True, exist_ok=True)
    shutil.copy(Path("/cursor/stores/bot/iro-paper/RESEARCH_QUESTIONS.md"), content / "research-questions.md")
    shutil.copy(Path("/cursor/stores/bot/iro-paper/formal-model/FORMAL_MODEL.md"), content / "formal-model.md")
    print("assets", plant["counts"])
    print("ari", out["ariPfLouvainEngineer"], "p", discovery["modularity_null"]["topology"]["p_ge"])
    print("F1 cross", cross.get("F1:_cross_envelope_discovered"), cross.get("F1:_cross_envelope_engineer"))


if __name__ == "__main__":
    main()
