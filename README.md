# Trackside Telemetry Visualization Pipeline

A two-runtime monorepo that generates and serves **synthetic motorsport telemetry** and renders it on a live dashboard:

- **Backend** (`backend/`): Python 3.12 + FastAPI + SQLite (stdlib `sqlite3`). A deterministic generator seeds a fixed 3-session dataset; a CORS-enabled REST API serves sessions, laps, telemetry (with server-side downsampling), and alerts. Runs on **uvicorn :8000**.
- **Frontend** (`frontend/`): React 19 + TypeScript + Vite. A dashboard polls the API with TanStack Query and renders live charts (Recharts), KPI cards, and a severity-coded alerts panel. Runs on **Vite :5173**.

```
[ generator ] --idempotent seed--> [ SQLite file ]
                                          |  read
                                          v
                            [ FastAPI REST API  :8000 ]  (CORS: http://localhost:5173)
                                          ^  HTTP poll ~3s (TanStack Query refetchInterval)
                                          |
                            [ React + Vite dashboard  :5173 ]  (Recharts)
```

The API contract is the integration boundary: backend and frontend are built independently against it. CORS is configured from the first backend feature so the cross-origin path is validated, never patched.

---

## Repository Structure

```
factory-demo/
├── PLAN.md                      # User-approved design plan
├── README.md                    # This file (AutoWiki deliverable)
├── .gitignore                   # Ignores backend/.venv, **/__pycache__, *.db, frontend/node_modules, frontend/dist
├── backend/
│   ├── requirements.txt         # fastapi, uvicorn[standard], pydantic, pytest, httpx, ruff, mypy
│   ├── pyproject.toml           # pytest / ruff / mypy (strict) config
│   ├── app/
│   │   ├── main.py              # FastAPI app, CORS middleware, router registration, startup seeding (lifespan)
│   │   ├── db.py                # connection helper, dict row factory, schema DDL + indexes, init_db/drop_tables
│   │   ├── models.py            # pydantic v2 response models (Session, Lap, Telemetry, Alert, KPIs)
│   │   ├── generator.py         # deterministic generator + idempotent seed_demo(); CLI entrypoint (--reset)
│   │   ├── queries.py           # pure data-access functions (sessions, laps, KPIs, telemetry, alerts, signals)
│   │   └── routers/
│   │       ├── deps.py          # SQLite connection dependency + canonical 404 guard
│   │       ├── sessions.py      # /api/sessions, /api/sessions/{id}, /api/sessions/{id}/laps
│   │       ├── telemetry.py     # /api/sessions/{id}/telemetry
│   │       └── alerts.py        # /api/sessions/{id}/alerts
│   └── tests/                   # pytest: generator, schema, sessions, laps, telemetry, alerts, CORS, error matrix
└── frontend/
    ├── package.json             # React 19, Vite 8, TS 6, Recharts 3, TanStack Query 5, Vitest 4, RTL, MSW, oxlint
    ├── .env                     # VITE_API_BASE_URL=http://localhost:8000 (committed; no secrets)
    ├── index.html               # title "Trackside Telemetry Dashboard"
    ├── vite.config.ts / vitest.config.ts / tsconfig*.json
    └── src/
        ├── main.tsx             # createRoot + <App/>
        ├── App.tsx              # QueryClientProvider + DashboardLayout
        ├── App.css / index.css
        ├── config.ts            # POLL_INTERVAL_MS=3000, TELEMETRY_MAX_POINTS=500, DEFAULT_SESSION_ID=1
        ├── api/
        │   ├── client.ts        # fetch wrapper (base URL from VITE_API_BASE_URL), fetchSessions/Laps/Telemetry/Alerts
        │   └── types.ts         # TS interfaces mirroring the API responses + ALL_SIGNALS
        ├── hooks/
        │   ├── useSessions.ts / useSession.ts / useLaps.ts
        │   ├── useTelemetry.ts  # refetchInterval = POLL_INTERVAL_MS
        │   └── useAlerts.ts     # refetchInterval = POLL_INTERVAL_MS
        ├── components/
        │   ├── DashboardLayout.tsx   # owns selection state; renders selectors, KPIs, alerts, charts
        │   ├── SessionSelector.tsx / LapSelector.tsx
        │   ├── KPISummary.tsx / AlertsPanel.tsx
        │   ├── charts/                # SpeedChart, RPMGearChart, ThrottleBrakeChart, TireTempChart, GForceChart, ChartsGrid
        │   └── common/                # Loading, ErrorState, EmptyState
        ├── utils/                     # formatting helpers + tests
        └── test/                      # RTL + jest-dom + MSW setup
```

---

## SQLite Schema

Four tables, created idempotently by `app/db.init_db()`. `PRAGMA foreign_keys = ON` is set on every connection; rows are returned via a dict row factory. Indexes exist on all foreign keys plus `telemetry_samples(session_id, lap_id, t_ms)`.

### `sessions`
| column | type | notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | session id (seed pins 1, 2, 3) |
| `track_name` | TEXT NOT NULL | e.g. "Silverstone" |
| `car_id` | TEXT NOT NULL | e.g. "RB-19" |
| `driver` | TEXT NOT NULL | e.g. "A. Verstappen" |
| `weather` | TEXT NOT NULL | one of `dry`, `wet`, `mixed` |
| `ambient_temp_c` | REAL NOT NULL | ambient temperature in Celsius |
| `started_at` | TEXT NOT NULL | ISO-8601 UTC (`YYYY-MM-DDTHH:MM:SSZ`) |
| `ended_at` | TEXT NOT NULL | ISO-8601 UTC (`> started_at`) |
| `total_laps` | INTEGER NOT NULL | equals the count of related `laps` rows |

### `laps`
| column | type | notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `session_id` | INTEGER NOT NULL FK→`sessions(id)` ON DELETE CASCADE | |
| `lap_number` | INTEGER NOT NULL | 1-based, unique within session (`UNIQUE(session_id, lap_number)`) |
| `lap_time_ms` | INTEGER NOT NULL | total lap duration in ms (multiple of 100) |
| `started_at_ms` | INTEGER NOT NULL | offset from session start; lap 1 starts at 0 |
| `is_best` | INTEGER NOT NULL DEFAULT 0 | 0/1; exactly one best lap per session = the min `lap_time_ms` |

### `telemetry_samples`
| column | type | notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `session_id` | INTEGER NOT NULL FK→`sessions(id)` ON DELETE CASCADE | |
| `lap_id` | INTEGER NOT NULL FK→`laps(id)` ON DELETE CASCADE | |
| `t_ms` | INTEGER NOT NULL | offset from lap start, `0..lap_time_ms`, ~100 ms cadence (10 Hz) |
| `speed_kph` | REAL | `0..360` |
| `rpm` | INTEGER | `0..15000` |
| `gear` | INTEGER | `0..8` (0 = neutral) |
| `throttle_pct` | REAL | `0..100` |
| `brake_pct` | REAL | `0..100` |
| `steering_deg` | REAL | `-180..180` |
| `tire_temp_fl` | REAL | Celsius |
| `tire_temp_fr` | REAL | Celsius |
| `tire_temp_rl` | REAL | Celsius |
| `tire_temp_rr` | REAL | Celsius |
| `g_lat` | REAL | lateral g |
| `g_long` | REAL | longitudinal g |
| `fuel_pct` | REAL | `0..100`, monotonically non-increasing within a session |

### `alerts`
| column | type | notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `session_id` | INTEGER NOT NULL FK→`sessions(id)` ON DELETE CASCADE | |
| `lap_id` | INTEGER NOT NULL FK→`laps(id)` ON DELETE CASCADE | |
| `t_ms` | INTEGER NOT NULL | offset from lap start, `0..lap_time_ms` of the referenced lap |
| `type` | TEXT NOT NULL | `redline` \| `tire_overtemp` \| `brake_lock` \| `fuel_low` |
| `severity` | TEXT NOT NULL | `info` \| `warning` \| `critical` |
| `message` | TEXT NOT NULL | human-readable |

### Invariants
- `sessions.total_laps` == count of related `laps`; exactly one `laps.is_best=1` per session = the min `lap_time_ms`.
- `telemetry_samples.t_ms` ∈ `[0, lap.lap_time_ms]`; samples ordered by `(lap_number, t_ms)`.
- Every `alerts.lap_id` / `telemetry_samples.lap_id` references a lap in the same session.

---

## REST API

Base: `http://localhost:8000`. All routes under `/api`. All responses are JSON (`Content-Type: application/json`). CORS allows origin `http://localhost:5173` (methods `GET`, `OPTIONS`; allow-headers `*`).

### `GET /api/health`
Liveness probe. No params/headers/auth.
- `200` → `{"status":"ok"}`

### `GET /api/sessions`
List all session summaries, ordered by `id` ascending.
- `200` → array of session summaries (9 fields each):
```json
[{ "id":1, "track_name":"Silverstone", "car_id":"RB-19", "driver":"A. Verstappen",
   "weather":"dry", "ambient_temp_c":22.5, "started_at":"2024-06-01T13:00:00Z",
   "ended_at":"2024-06-01T13:07:24Z", "total_laps":5 }]
```

### `GET /api/sessions/{id}`
Session detail = the 9 summary fields + integer `lap_count` + a `kpis` object. `404 {"detail":"Session not found"}` if the id is unknown.
- `200` →
```json
{ "id":1, "track_name":"Silverstone", "car_id":"RB-19", "driver":"A. Verstappen",
  "weather":"dry", "ambient_temp_c":22.5, "started_at":"2024-06-01T13:00:00Z",
  "ended_at":"2024-06-01T13:07:24Z", "total_laps":5, "lap_count":5,
  "kpis":{ "top_speed_kph":314.97, "best_lap_ms":81200, "avg_throttle_pct":65.57, "max_tire_temp_c":106.9 } }
```
KPI definitions: `top_speed_kph` = max `speed_kph` over the session; `best_lap_ms` = min `lap_time_ms`; `avg_throttle_pct` = mean `throttle_pct` over all samples; `max_tire_temp_c` = max across the four tire channels.

### `GET /api/sessions/{id}/laps`
Laps for the session, ordered by `lap_number` ascending. `404 {"detail":"Session not found"}` if the session is unknown.
- `200` → array of laps (6 fields each):
```json
[{ "id":2, "session_id":1, "lap_number":2, "lap_time_ms":81200, "started_at_ms":85700, "is_best":true }]
```
`is_best` is a JSON boolean. Exactly one lap per session has `is_best == true`.

### `GET /api/sessions/{id}/telemetry`
Filtered, downsampled telemetry. All query params are optional:

| param | type | constraint | default | meaning |
|---|---|---|---|---|
| `lap` | int | `>= 1` | omitted | filters to that `lap_number`; `null` when omitted (whole session) |
| `signals` | CSV string | names from the 13 valid signals | all 13 | signal projection (de-duped, order echoed) |
| `from_ms` | int | `>= 0` | omitted | inclusive lower bound on `t_ms` |
| `to_ms` | int | `>= 0` | omitted | inclusive upper bound on `t_ms` |
| `max_points` | int | `[1, 5000]` | `500` | downsampling cap |

Valid signal names (13): `speed_kph, rpm, gear, throttle_pct, brake_pct, steering_deg, tire_temp_fl, tire_temp_fr, tire_temp_rl, tire_temp_rr, g_lat, g_long, fuel_pct`.

Downsampling: if matched rows exceed `max_points`, an evenly-strided subset is returned (stride = ceil(n / max_points)) that always retains the first and last matched rows. Each sample always includes `t_ms` plus the requested signals.

- `200` →
```json
{ "session_id":1, "lap":1, "signals":["speed_kph","rpm"],
  "sample_count":858, "returned_count":858, "downsampled":false,
  "samples":[ { "t_ms":0, "speed_kph":303.82, "rpm":4732 }, ... ] }
```
`sample_count` is the number of matched rows (independent of `max_points` and `signals`); `returned_count` is the count after downsampling; `downsampled` is `true` iff `sample_count > max_points`. When `lap` is omitted, the response `lap` is `null` and samples span the whole session ordered by `(lap_number, t_ms)`.

### `GET /api/sessions/{id}/alerts`
Alerts scoped to the session, ordered by `(lap_number, t_ms)` ascending.
- Query param: `severity` (optional: `info` | `warning` | `critical`).
- `200` → array of alerts (8 fields each, `lap_number` joined from `laps`):
```json
[{ "id":1, "session_id":1, "lap_id":1, "lap_number":1, "t_ms":42850,
   "type":"redline", "severity":"critical", "message":"Silverstone: engine held near redline on the main straight" }]
```

### Error responses
All errors use the FastAPI `{"detail": ...}` shape with `Content-Type: application/json`.

| Status | When | Body |
|---|---|---|
| `404` | unknown integer session id on every `/api/sessions/{id}` and `/api/sessions/{id}/*` route | `{"detail":"Session not found"}` |
| `404` | unknown top-level path | `{"detail":"Not Found"}` (FastAPI default) |
| `422` | non-integer path id (e.g. `/api/sessions/abc`) on every route | FastAPI validation-error body: `{"detail":[{ "loc":[...], "msg":..., "type":... }]}` |
| `422` | malformed query param (non-int `lap`/`max_points`/`from_ms`/`to_ms`; unknown signal name; `severity` not in the enum; `max_points` outside `[1,5000]`; `lap < 1`; `from_ms`/`to_ms < 0`) | FastAPI validation-error body (`detail` array) |
| `405` | non-GET method on a GET route | `{"detail":"Method Not Allowed"}` |

### LOCKED edge-case decisions (implemented exactly)
These resolve ambiguities and are validated by the contract:
- **Path id is typed `int`.** A non-integer path segment (`/api/sessions/abc`) → `422`. A valid-but-unknown int id (`9999`, also boundary `0` and `-1`) → `404 {"detail":"Session not found"}` on every `/api/sessions/{id}` and `/api/sessions/{id}/*` route.
- **Validation precedence.** Query-param validation (`422`) is surfaced **before** the not-found (`404`) check. So an unknown id combined with a malformed query param → `422` (e.g. `/api/sessions/9999/telemetry?lap=abc` → `422`).
- **Concrete ids.** Seed order fixes session ids to `1` (Silverstone), `2` (Monza), `3` (Suzuka). `GET /api/sessions` is ordered by `id` ascending.
- **Telemetry params.** `max_points` is an int in `[1, 5000]`; outside that range → `422` (boundary `5000` is accepted, `0` and `5001` are rejected). `lap` is an int `>= 1`; `from_ms`/`to_ms` are ints `>= 0`. Any unknown signal name in `signals` → `422`. Duplicate signals are de-duplicated and the response `signals` echoes the requested order after de-dup. A valid-but-nonexistent `lap` (e.g. `99`) → `200` with `samples: []` and `lap` echoed. `from_ms`/`to_ms` bounds are **inclusive**; an inverted or empty window → `200` with `samples: []`.
- **Alerts params.** An invalid `severity` (not in `info|warning|critical`) → `422`. A valid-but-unused severity → `200 []`. Alerts are ordered by `(lap_number, t_ms)`. The generator guarantees **each of the 3 sessions has ≥ 1 alert** and **≥ 1 `critical` alert** exists across the dataset; each alert's `t_ms` ∈ `[0, lap.lap_time_ms]`.
- **CORS preflight.** An `OPTIONS` preflight from origin `http://localhost:5173` → `200`/`204` with `access-control-allow-origin` set and `GET` advertised in allow-methods; a disallowed origin is not echoed back.
- **Methods.** A non-GET method on a GET route → `405`.

---

## Frontend

A React single-page dashboard that polls the REST API and renders live telemetry.

### Component hierarchy
```
App  (QueryClientProvider)
└── DashboardLayout  (owns selected sessionId + lapNumber; handles loading/error/empty)
    ├── SessionSelector        # <select> of sessions (label: "track — driver")
    ├── LapSelector            # <select> of laps + an "All laps" option
    ├── KPISummary             # 4 KPI cards (top speed, best lap, avg throttle, max tire temp)
    ├── AlertsPanel            # severity-colored alert list (info=neutral, warning=amber, critical=red)
    └── ChartsGrid
        ├── SpeedChart         # line: speed_kph vs t_ms
        ├── RPMGearChart       # rpm line + gear step on dual y-axes vs t_ms
        ├── ThrottleBrakeChart # throttle & brake lines vs t_ms
        ├── TireTempChart      # 4 tire-temp lines vs t_ms
        └── GForceChart        # scatter: x=g_lat, y=g_long (NOT t_ms)
    └── common/                # Loading, ErrorState, EmptyState
```

### Behavior
- **Selection state** lives in `DashboardLayout`. The default session is id `1` (first session); the default lap is the session's best lap (`is_best=true`, a concrete lap, not "All laps"). Changing the session resets the lap to the new session's best lap and repopulates the lap selector.
- **Polling**: telemetry + alerts queries use TanStack Query `refetchInterval = 3000 ms` (`POLL_INTERVAL_MS`); sessions + laps are static. Telemetry requests send `max_points=500` (`TELEMETRY_MAX_POINTS`) so responses are downsampled and charts stay responsive.
- **States**: every data view handles loading, error (message + retry button), and empty gracefully without crashing.
- **`data-testid` attributes** are present on all primary regions for stable validation: `dashboard-root`, `loading-indicator`, `error-state`, `empty-state`, `session-selector`, `lap-selector`, `kpi-top-speed`, `kpi-best-lap`, `kpi-avg-throttle`, `kpi-max-tire-temp`, `alerts-panel`, `alert-item` (with `data-severity`), `speed-chart`, `rpm-gear-chart`, `throttle-brake-chart`, `tire-temp-chart`, `gforce-chart`.

### Libraries
React 19, React DOM 19, Vite 8, TypeScript 6, Recharts 3, TanStack Query 5. Dev/test: Vitest 4, React Testing Library, `@testing-library/jest-dom`, `@testing-library/user-event`, jsdom, MSW, oxlint. Lint uses **oxlint** (`npm run lint`) — ESLint is not used.

---

## Environment Variables

| Variable | Runtime | Default | Purpose |
|---|---|---|---|
| `TELEMETRY_DB_PATH` | backend | `backend/telemetry.db` (absolute, anchored to the package) | SQLite database file path (gitignored) |
| `VITE_API_BASE_URL` | frontend | `http://localhost:8000` (set in `frontend/.env`) | Base URL for the API client |

No secrets are required or committed. The SQLite DB, `backend/.venv`, `frontend/node_modules`, and `frontend/dist` are gitignored.

---

## Setup

Requires Python 3.12 (with `python3.12-venv`), Node 20 LTS, and npm.

The idempotent `init.sh` at the repository root ensures `python3.12-venv`, creates the backend venv (`backend/.venv`), installs backend requirements, and runs `npm install` for the frontend if `node_modules` is missing. Run it from the repository root:

```bash
bash init.sh            # from the repository root
# -> "init.sh: environment ready"
```

`init.sh` is safe to re-run (no-op for already-installed pieces).

---

## Running

### 1. Seed the database
The generator is deterministic (`random.Random(42)`) so seeding produces byte-identical data run-to-run. `seed_demo()` is idempotent (no-op if the 3 sessions already exist). The app also seeds on startup if the DB is empty.

```bash
cd backend
.venv/bin/python -m app.generator            # seed if empty (idempotent)
.venv/bin/python -m app.generator --reset    # drop, recreate, seed (use to refresh)
```

### 2. Start the backend (uvicorn on :8000)
```bash
cd backend
.venv/bin/uvicorn app.main:app --port 8000
```
Healthcheck:
```bash
curl -sf http://localhost:8000/api/health
# -> {"status":"ok"}
```

### 3. Start the frontend (Vite on :5173)
```bash
cd frontend
npm run dev -- --port 5173 --host
```
Healthcheck:
```bash
curl -sf http://localhost:5173
```
Open `http://localhost:5173` in a browser; the dashboard defaults to session 1 (Silverstone) and that session's best lap.

---

## Testing, Typecheck, and Lint

### Backend (run from `backend/`)
```bash
.venv/bin/python -m pytest tests -q          # tests: generator, schema, sessions, laps, telemetry, alerts, CORS, error matrix
.venv/bin/mypy app                           # typecheck (strict)
.venv/bin/ruff check .                       # lint
```

### Frontend (run from `frontend/`)
```bash
npx vitest run                               # tests: components/hooks; API mocked with MSW
npx tsc -b --noEmit                          # typecheck
npm run lint                                 # lint (oxlint)
```

> Note: `fastapi.testclient.TestClient` emits a `StarletteDeprecationWarning` about `httpx` vs `httpx2` under the installed FastAPI/Starlette version. Tests still pass (exit 0); the warning is expected and should not be "fixed" by migrating to httpx2.

---

## Deterministic Dataset (3 sessions)

Seeded by `app/generator.py` with a fixed RNG seed (`random.Random(42)`). Session ids are pinned by explicit insert order.

| id | track | car | driver | weather | ambient °C | started_at (UTC) | laps | top_speed target |
|---|---|---|---|---|---|---|---|---|
| 1 | Silverstone | RB-19 | A. Verstappen | dry | 22.5 | 2024-06-01T13:00:00Z | 5 | 312.0 |
| 2 | Monza | SF-23 | C. Leclerc | dry | 26.0 | 2024-06-08T14:00:00Z | 4 | 328.0 |
| 3 | Suzuka | W14 | L. Hamilton | mixed | 19.5 | 2024-06-15T15:00:00Z | 6 | 300.0 |

Each lap is ~80–110s with 10 Hz telemetry (`t_ms` steps of 100). Signals are correlated and physically plausible: speed/RPM/gear track each other, throttle and brake are anti-correlated, tire temps drift up over a lap, fuel is monotonically non-increasing across a session, and `g_lat`/`g_long` reflect cornering/braking. Each session has ≥ 1 alert; session 1 carries the dataset's `critical` redline alert. Exactly one `is_best` lap per session equals the minimum `lap_time_ms`.

The dashboard defaults to session 1 (Silverstone) and its best lap (lap 2, `lap_time_ms = 81200`).
