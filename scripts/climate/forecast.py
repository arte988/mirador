#!/usr/bin/env python3
"""Zero-shot TimesFM 2.5 forecast for the Gale daily series.

A variable is published only when its one-step MAE beats persistence (yesterday's
value) on the held-out tail. Otherwise the JSON says unavailable and carries no
invented quantiles. Dust tau is not forecast: the sample has no numeric tau.
"""
from __future__ import annotations

import json
import statistics
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SAMPLE = ROOT / "data" / "climate" / "samples" / "gale_daily.json"
METRICS = ROOT / "data" / "climate" / "eval" / "metrics.json"
FORECAST = ROOT / "public" / "forecasts" / "gale.json"
HOLDOUT = 14
HORIZON = 3
CONTEXT = 256
MODEL_ID = "google/timesfm-2.5-200m-pytorch"


def mae(errors: list[float]) -> float | None:
    return round(sum(abs(e) for e in errors) / len(errors), 4) if errors else None


def climatology(train: list[dict], key: str, ls: float | None) -> float:
    if ls is None:
        return statistics.fmean(r[key] for r in train)
    same = [r[key] for r in train if r.get("ls") is not None and abs(r["ls"] - ls) <= 5]
    pool = same or [r[key] for r in train]
    return statistics.fmean(pool)


def baselines(rows: list[dict], key: str) -> dict:
    train, test = rows[:-HOLDOUT], rows[-HOLDOUT:]
    pers, clim = [], []
    for i, row in enumerate(test):
        prev = rows[-(HOLDOUT - i) - 1]
        pers.append(row[key] - prev[key])
        clim.append(row[key] - climatology(train, key, row.get("ls")))
    return {"mae_persistence": mae(pers), "mae_climatology": mae(clim), "holdout_sols": HOLDOUT}


def load_model():
    import timesfm

    # torch_compile needs a working inductor; CPU inference does not.
    model = timesfm.TimesFM_2p5_200M_torch.from_pretrained(MODEL_ID, torch_compile=False)
    model.compile(
        timesfm.ForecastConfig(
            max_context=CONTEXT,
            max_horizon=128,
            normalize_inputs=True,
            use_continuous_quantile_head=True,
            force_flip_invariance=True,
            infer_is_positive=False,
            fix_quantile_crossing=True,
            per_core_batch_size=1,
        )
    )
    return model


def timesfm_errors(model, rows: list[dict], key: str):
    test = rows[-HOLDOUT:]
    errors = []
    for i in range(len(test)):
        ctx = [r[key] for r in rows[: len(rows) - HOLDOUT + i]][-CONTEXT:]
        point, _quant = model.forecast(horizon=1, inputs=[ctx])
        errors.append(test[i][key] - float(point[0][0]))
        print(f"{key} holdout {i + 1}/{len(test)}", flush=True)
    ctx = [r[key] for r in rows][-CONTEXT:]
    _point, quant = model.forecast(horizon=HORIZON, inputs=[ctx])
    # quant: (n, H, 10). Index 5 is the median the decode returns as the point forecast.
    q = quant[0]
    if getattr(q, "ndim", 0) != 2 or q.shape[0] < HORIZON or q.shape[1] < 10:
        raise RuntimeError(f"unexpected quantile shape {getattr(q, 'shape', None)}")
    return errors, {
        "q10": [round(float(q[h][1]), 3) for h in range(HORIZON)],
        "q50": [round(float(q[h][5]), 3) for h in range(HORIZON)],
        "q90": [round(float(q[h][9]), 3) for h in range(HORIZON)],
    }


def series_block(rows: list[dict], key: str, unit: str, model) -> dict:
    base = baselines(rows, key)
    block = {
        "unit": unit,
        "status": "unavailable",
        "q10": [],
        "q50": [],
        "q90": [],
        **base,
        "mae_timesfm": None,
        "reason": "timesfm not run",
    }
    if isinstance(model, Exception):
        block["reason"] = f"timesfm not run: {model.__class__.__name__}: {model}"
        return block
    try:
        errors, quantiles = timesfm_errors(model, rows, key)
    except Exception as exc:  # model missing, shape change, or download failure
        block["reason"] = f"timesfm not run: {exc.__class__.__name__}: {exc}"
        return block
    block["mae_timesfm"] = mae(errors)
    if block["mae_timesfm"] is not None and block["mae_persistence"] is not None and block["mae_timesfm"] < block["mae_persistence"]:
        block.update(status="prediction", reason="beats persistence", **quantiles)
    else:
        block["reason"] = "does not beat persistence; quantiles withheld"
    return block


def main() -> None:
    sample = json.loads(SAMPLE.read_text())
    rows = sample["rows"]
    try:
        model = load_model()
    except Exception as exc:
        model = exc
    t_air = series_block(rows, "t_air_c", "C", model)
    pressure = series_block(rows, "pressure_pa", "Pa", model)
    published = [b for b in (t_air, pressure) if b["status"] == "prediction"]
    last = rows[-1]
    doc = {
        "schema": 1,
        "zone_id": "gale",
        "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "step": "sol",
        "horizon_steps": HORIZON,
        "model": MODEL_ID if published else None,
        "license": "Apache-2.0",
        "data_kind": "prediction" if published else "unavailable",
        "shared_point": "Curiosity REMS is one rover. Ridge A-E share this series. It is not a reading at each stop.",
        "last_measured": {
            "kind": "measured",
            "sol": last["sol"],
            "t_air_c": last["t_air_c"],
            "pressure_pa": last["pressure_pa"],
            "note": "t_air is the midpoint of the published min and max for that sol.",
        },
        "series": {"t_air": t_air, "pressure": pressure},
        "tau_dust": {
            "status": "unavailable",
            "reason": "The MSL outreach feed has no numeric dust opacity. MCS tau is not in this sample.",
        },
        "warnings": sample["notes"],
    }
    METRICS.parent.mkdir(parents=True, exist_ok=True)
    FORECAST.parent.mkdir(parents=True, exist_ok=True)
    metrics = {"model": MODEL_ID, "holdout_sols": HOLDOUT, "t_air": t_air, "pressure": pressure, "tau_dust": doc["tau_dust"]}
    METRICS.write_text(json.dumps(metrics, indent=2) + "\n")
    FORECAST.write_text(json.dumps(doc, indent=2) + "\n")
    print(f"t_air {t_air['status']} mae={t_air['mae_timesfm']} pers={t_air['mae_persistence']}")
    print(f"pressure {pressure['status']} mae={pressure['mae_timesfm']} pers={pressure['mae_persistence']}")
    print(f"wrote {FORECAST}")


if __name__ == "__main__":
    main()
