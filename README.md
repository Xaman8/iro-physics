# IRO Physics

A static site for the Inverted Reliability Ontology. The bench apparatus is the interactive experiment: a toy plant in which a pump pulsation in one envelope crosses a boundary and damages heat exchanger HX1 in another. Entropy generation is the damage proxy.

The audience is the Xaman8 team. The overview explains the question, the bench replays one run, the method page is the vocabulary and the formal model, and the results page shows the study figures and the numbers in the result files.

The plant behind the bench is the v1 toy model in `model/`. A later plant can replace the two JSON files the pages read, without a server.

## Pages

[https://xaman8.github.io/iro-physics/](https://xaman8.github.io/iro-physics/)

GitHub Pages serves this repository at the base path `/iro-physics/`. Links in the site are relative to the page, so the same files work locally and at that path.

## Regenerate the data

From the repository root, with Python 3 and numpy:

```bash
python3 tools/build_bench_data.py
```

The script reads `model/iro_plant.py`, `model/cross_system_failure.py`, and `model/results/`. It writes:

| File | What it is |
| --- | --- |
| `site/data/plant.json` | Assets, ports, bonds, couplings, envelopes. Schema `iro.bench.plant/1`. |
| `site/data/scenario.json` | The P1 pulsation run: daily power, entropy generation, damage, warnings, and band amplitudes. Schema `iro.bench.scenario/1`. |
| `site/data/results.json` | Tables copied from the study files. |
| `site/data/captions.json` | Overview captions. Counts come from the plant; lead times and fractions come from the headline summary. |
| `site/assets/` | Figures and explainer drawings. |
| `site/content/` | Markdown for the method page. |

The interactive run is seed 1000. That is the representative case stored with the study. The script checks the onset (day 23.980315), the HX1 limit (day 105.625), and the four warnings before it writes. The 40-run medians are not recomputed. They are copied from `model/results/`.

Each series value is the mean of the 24 hourly steps of that day. Orders 1–3 on the bench are finite differences of those daily means, per day.

### Swapping in another plant

Replace `site/data/plant.json` and `site/data/scenario.json`, keeping the two schema names. A plant is assets, ports, couplings, and leaf envelopes with coordinates. A scenario is one or more faults, a shared `timeDays` axis, per-asset entropy generation and damage, per-coupling power (`powerDc` is the steady e·f, `powerAc` is the pulsation), and the warning blocks `FULL`, `REDUCED`, `LOCAL`, and `LOCAL_DC`. The bench lays envelopes out from the asset coordinates. The classic view reads `classic.band`, a daily band amplitude per port at each sensor-noise level.

## Run it locally

```bash
python3 -m http.server -d site 8765
```

Open `http://127.0.0.1:8765/`. Opening the HTML files directly will not load the JSON.

## Paper

The paper page looks for `paper/iro-envelopes.pdf`. While the file is absent, the page says **Paper in preparation**. Drop the PDF at that path and, on the next deploy, the workflow copies it into the site and the download link appears. No page has to be edited.

## Deploy

Pushes to `main` run `.github/workflows/pages.yml`. The workflow publishes the `site/` directory, and copies `paper/*.pdf` in beside it, with GitHub's Pages actions.

### What a repository admin has to switch on

Pages is not on for this repository yet. An admin needs to:

1. Open **Settings → Pages → Build and deployment**.
2. Set **Source** to **GitHub Actions**. The workflow in this repo is what GitHub then runs. "Deploy from a branch" will not use it.
3. Leave Actions enabled for the repository. The workflow asks for `contents: read`, `pages: write`, and `id-token: write`.
4. If the organisation protects the `github-pages` environment, approve the first run. GitHub creates that environment when the workflow is used.

After the first successful run on `main`, the site is at [https://xaman8.github.io/iro-physics/](https://xaman8.github.io/iro-physics/). A pull request does not deploy. The deploy happens when the workflow runs on `main`. The Pages project path follows the repository name, `iro-physics`.

## Vocabulary

The pages say **envelope** for a group of assets (pumping, heat exchange, reactor, electrical) and **operating envelope** for the Design, Safe, and Damage limits of one asset. **Port**, **coupling**, **effort**, **flow**, and **entropy generation** are used in the IRO sense. The word export is reserved for maintenance entropy export, which this toy model does not simulate.
