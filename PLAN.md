# PLAN — Trackside Telemetry Visualization Pipeline

Design plan for a synthetic motorsport telemetry pipeline: a **Python/FastAPI + SQLite** data layer and a **React/TypeScript (Vite)** dashboard that polls the API and visualizes telemetry.

```
[ generator ] -> [ SQLite ] -> [ FastAPI :8000 ] <-- HTTP poll ~3s --> [ React/Vite :5173 ]
                                  (CORS: localhost:5173)                  (TanStack Query + Recharts)
```

## 1. Data Models (SQLite)

- **sessions**: `id, track_name, car_id, driver, weather(dry|wet|mixed), ambient_temp_c, started_at(ISO), ended_at(ISO), total_laps`
- **laps**: `id, session_id→sessions, lap_number(1-based), lap_time_ms, started_at_ms(offset from session start), is_best(0/1)`
- **telemetry_samples**: `id, session_id→, lap_id→laps, t_ms(offset from lap start, ~10Hz), speed_kph, rpm, gear, throttle_pct, brake_pct, steering_deg, tire_temp_fl, tire_temp_fr, tire_temp_rl, tire_temp_rr, g_lat, g_long, fuel_pct`
- **alerts**: `id, session_id→, lap_id→, t_ms, type(redline|tire_overtemp|brake_lock|fuel_low), severity(info|warning|critical), message`

**Generator**: deterministic (fixed RNG seed) so data is identical run-to-run. Fixed demo dataset of **3 sessions** (Silverstone/5 laps, Monza/4 laps, Suzuka/6 laps) with correlated, physically plausible signals and a few alerts (including at least one `critical`). Seeding is **idempotent**; supports `--reset`. DB path via `TELEMETRY_DB_PATH` (default `backend/telemetry.db`, gitignored).

## 2. API Contracts (REST/JSON, CORS-enabled for http://localhost:5173)

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | `{ "status": "ok" }` |
| GET | `/api/sessions` | List session summaries |
| GET | `/api/sessions/{id}` | Session detail + KPIs (`top_speed_kph`, `best_lap_ms`, `avg_throttle_pct`, `max_tire_temp_c`); 404 if unknown |
| GET | `/api/sessions/{id}/laps` | Laps for session; 404 if unknown |
| GET | `/api/sessions/{id}/telemetry` | Samples; params `lap, signals(CSV), from_ms, to_ms, max_points(default 500)`; server-side downsampling; 404/422 |
| GET | `/api/sessions/{id}/alerts` | Alerts; optional `severity` filter; 404 if unknown |

- **Telemetry response**: `{ session_id, lap, signals[], sample_count, returned_count, downsampled, samples[] }`; each sample has `t_ms` + requested signals.
- **Errors**: `{ "detail": ... }`; `404` unknown session, `422` invalid params.
- Valid signals: `speed_kph, rpm, gear, throttle_pct, brake_pct, steering_deg, tire_temp_fl, tire_temp_fr, tire_temp_rl, tire_temp_rr, g_lat, g_long, fuel_pct`.

## 3. Component Hierarchy (React)

```
App  (QueryClientProvider)
└── DashboardLayout  (owns selected sessionId + lapNumber)
    ├── SessionSelector        # dropdown of sessions
    ├── LapSelector            # dropdown of laps (+ "All laps")
    ├── KPISummary             # 4 KPI cards
    ├── AlertsPanel            # severity-colored alert list
    └── charts/                # Recharts, x-axis = t_ms
        ├── SpeedChart         # speed line
        ├── RPMGearChart       # rpm line + gear step (dual axis)
        ├── ThrottleBrakeChart # throttle + brake lines
        ├── TireTempChart      # 4 tire-temp lines
        └── GForceChart        # g_lat vs g_long scatter
    └── common/                # Loading, ErrorState, EmptyState
```

- **Polling**: telemetry/alerts queries use TanStack Query `refetchInterval = 3000ms`.
- **API base URL**: `VITE_API_BASE_URL` (default `http://localhost:8000`).
- **States**: every view handles loading / error (with retry) / empty.

## 4. Infrastructure & Testing

- **Ports**: backend uvicorn `:8000`, frontend Vite `:5173`. SQLite is a local file.
- **Backend tests**: pytest (generator, schema, endpoints, filters, CORS) via ASGI/httpx; lint `ruff`; types `mypy`.
- **Frontend tests**: Vitest + React Testing Library (components/hooks, API mocked via MSW); types `tsc -b --noEmit`; lint `npm run lint`.
- **End-to-end**: API via `curl`/`httpx`; dashboard via `agent-browser` against the real backend.

## 5. Milestones

1. **data-layer** — backend schema, generator/seeding, REST API; validated independently via the API surface.
2. **dashboard-ui** — React dashboard, end-to-end integration (live CORS verified), and a comprehensive `README.md`; validated via the browser against the real backend.
