# Gale climate sample and TimesFM 2.5

One series for Gale, from the unofficial MSL weather feed. Curiosity REMS is a single rover, so Ridge A–E share it. `t_air` is the midpoint of the published min and max for that sol. Pressure is the published value in pascals. Numeric dust opacity is not in the feed and is not invented.

```bash
python3 scripts/climate/ingest.py
python3 -m venv .venv
.venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu
.venv/bin/pip install -r scripts/climate/requirements-timesfm.txt
.venv/bin/python scripts/climate/forecast.py
```

`forecast.py` writes `data/climate/eval/metrics.json` and `public/forecasts/gale.json`. A variable is marked `prediction` only when TimesFM 2.5's one-step MAE on the last 14 sols beats persistence (yesterday's value). Otherwise the quantiles are left empty.

The file checked in with this note is the run of 2026-11-15. Both air temperature and pressure beat persistence; dust opacity stays unavailable. Numbers and the checkpoint id are in `MODEL_CARD.md`.

TimesFM 2.5 (`google/timesfm-2.5-200m-pytorch`) is Apache-2.0. It is a statistical forecast, not atmospheric physics, and it does not run in the browser or on Vercel. Checkpoint 3.0 is not used (non-commercial weights).
