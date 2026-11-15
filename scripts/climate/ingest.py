#!/usr/bin/env python3
"""Build one daily Gale series from the unofficial MSL weather feed.

t_air is the midpoint of the published min and max, not an hourly reading.
Pressure is the published value in pascals. Numeric dust opacity (tau) is not
in this feed, so it is not invented. Curiosity REMS is one rover: Ridge A–E
share this series.
"""
from __future__ import annotations

import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "climate" / "samples" / "gale_daily.json"
URL = "https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json"
UA = "MIRADOR/0.1 (NASA Space Apps prototype; climate sample)"


def num(value: str | None) -> float | None:
    if value is None or value in ("", "--"):
        return None
    try:
        n = float(value)
    except ValueError:
        return None
    return n if n == n else None


def runs(rows: list[dict]) -> list[list[dict]]:
    """Split on sol gaps. A missing sol ends the run; nothing is interpolated."""
    rows = sorted(rows, key=lambda r: r["sol"])
    out: list[list[dict]] = []
    cur: list[dict] = []
    for row in rows:
        if cur and row["sol"] != cur[-1]["sol"] + 1:
            out.append(cur)
            cur = []
        cur.append(row)
    if cur:
        out.append(cur)
    return out


def choose(rows: list[dict]) -> list[dict]:
    """Prefer the run that ends on the newest sol, so the forecast starts from the latest reading."""
    parts = runs(rows)
    if not parts:
        return []
    newest = max(parts, key=lambda part: part[-1]["sol"])
    if len(newest) >= 20:
        return newest
    return max(parts, key=len)


def main() -> None:
    req = urllib.request.Request(URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as res:
        payload = json.load(res)
    raw = payload.get("soles") or []
    parsed = []
    for row in raw:
        sol = num(str(row.get("sol", "")))
        tmin = num(row.get("min_temp"))
        tmax = num(row.get("max_temp"))
        pressure = num(row.get("pressure"))
        if sol is None or tmin is None or tmax is None or pressure is None:
            continue
        parsed.append(
            {
                "sol": int(sol),
                "ls": num(str(row.get("ls", ""))) if row.get("ls") not in (None, "") else None,
                "terrestrial_date": row.get("terrestrial_date"),
                "t_air_c": round((tmin + tmax) / 2, 2),
                "pressure_pa": pressure,
                "quality_flag": "midpoint",
            }
        )
    series = choose(parsed)
    if len(series) < 20:
        raise SystemExit(f"only {len(series)} consecutive sols; refusing to invent a longer series")
    doc = {
        "zone_id": "gale",
        "source_id": "msl-weather-rss",
        "source_url": URL,
        "disclaimer": "Unofficial NASA web feed (REMS, Centro de Astrobiologia), for outreach purposes only.",
        "notes": [
            "One rover (Curiosity REMS). Ridge A-E share this series. Not a sensor at each stop.",
            "t_air_c is the midpoint of the published min and max for that sol.",
            "pressure_pa is the published sol pressure.",
            "tau_dust is absent: this feed publishes a word (Sunny) and not a numeric opacity.",
        ],
        "rows": series,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, indent=2) + "\n")
    print(f"wrote {OUT} sols {series[0]['sol']}–{series[-1]['sol']} ({len(series)} rows)")


if __name__ == "__main__":
    main()
