# TimesFM 2.5 on the Gale daily series

Zero-shot forecast. No covariates and no fine-tune. The model is a statistical forecast, not atmospheric physics.

| | |
| --- | --- |
| Weights | `google/timesfm-2.5-200m-pytorch`, snapshot `1d952420fba87f3c6dee4f240de0f1a0fbc790e3` |
| License | Apache-2.0 for the code and the 2.5 weights. TimesFM 3.0 weights were not loaded. |
| Package | `timesfm` 3.0.2 (`TimesFM_2p5_200M_torch`) |
| Runtime | torch 2.15.0+cpu, `torch_compile=False`. No GPU. |
| Series | Sols 4779–4995 (217 rows) from the unofficial MSL weather feed |
| `t_air` | Midpoint of the published min and max for that sol |
| Pressure | Published sol pressure, pascals |
| Tau | Not in the feed. Not forecast. |

Backtest: last 14 sols, one step ahead, context up to 256. Persistence is the previous sol. Climatology is the mean of training rows whose solar longitude is within 5 degrees, otherwise the mean of all training rows. A series is published only when TimesFM's MAE is strictly below persistence. Otherwise the quantiles stay empty.

Run written at `2026-11-15T11:51:56Z` (`public/forecasts/gale.json`):

| Series | TimesFM MAE | Persistence MAE | Climatology MAE | Published |
| --- | ---: | ---: | ---: | --- |
| Air temperature, °C | 0.8586 | 0.8929 | 1.1959 | yes |
| Pressure, Pa | 1.0588 | 1.2857 | 15.4668 | yes |
| Dust opacity | — | — | — | no series |

The temperature gain is small (0.03 °C of MAE). It clears the rule. It is not a large skill gain. Pressure climatology is a weak baseline here because the seasonal mean is a poor one-step guess.

Next three sols after sol 4995, quantiles q10 / q50 / q90:

- Air temperature, °C: −40.477 / −38.222 / −36.709, then −40.708 / −38.177 / −36.531, then −40.918 / −38.182 / −36.476
- Pressure, Pa: 774.124 / 777.283 / 780.913, then 774.202 / 777.807 / 781.691, then 773.325 / 777.379 / 781.648

The cold-drop rule is a planning assumption of 15 K. The lowest median (−38.222 °C) is 0.2 K below the last measured midpoint (−38.0 °C), so the amber forecast-cold reason does not fire and the dust-storm flag is not set.
