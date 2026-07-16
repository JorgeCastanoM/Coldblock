# ColdBlock Intelligence Dashboard — Project Context

## What this is
An operational dashboard for ColdBlock Technologies. It pulls data from a local
Fishbowl ERP and a cloud HubSpot CRM, merges it with a Python/Polars backend,
and serves it to a React frontend optimized for shop-floor tablets.

## Stack
- **Frontend:** React, Vite, Tailwind CSS. Dark theme, touch/tablet-optimized.
- **Backend:** Python, FastAPI.
- **Data processing:** Polars — used for JSON ingestion, DataFrame merges, and
  cross-referencing SKUs/Part IDs between Fishbowl and HubSpot.
- **Auth:** Token-based login for dashboard access (no user table — this is a
  stateless system, see below).

## Design constraints (important — don't deviate without asking)
- **No persistence layer / no database.** This is intentionally a live,
  stateless system. Every dashboard load re-fetches from Fishbowl and HubSpot
  directly — nothing is cached or stored between requests.
- **No scheduled jobs.** Ingest and processing are triggered on-demand by the
  dashboard load, not by cron/Celery/APScheduler.
- **No forecasting.** MLForecast/LightGBM and any predictive/forecasting logic
  are explicitly out of scope for now. Don't add forecasting dependencies or
  code unless asked.

## External systems
- **Fishbowl ERP:** accessed via a private Tailscale mesh VPN tunnel
  (`http://100.x.x.x:2456`). Client/auth logic lives in `backend/api/fishbowl.py`.
- **HubSpot CRM:** accessed via public REST API with a Bearer token. Client
  logic lives in `backend/api/hubspot.py`. Add retry/backoff here — HubSpot
  has real rate limits and a failed call shouldn't take down the dashboard.

## Directory structure
```text
coldblock-intelligence/
├── backend/
│   ├── main.py                 # FastAPI application entry point
│   ├── requirements.txt        # Python dependencies
│   ├── .env.example            # Template for Tailscale IP, tokens, JWT secret
│   ├── core/
│   │   ├── config.py           # Environment variables (Tailscale IP, tokens)
│   │   ├── logging.py          # Structured logging
│   ├── auth/
│   │   ├── dependencies.py     # FastAPI auth dependency (verifies token on each request)
│   │   ├── routes.py           # Login endpoint
│   ├── routers/                # Our own dashboard-facing endpoints
│   │   ├── dashboard.py
│   ├── api/                    # Clients for EXTERNAL systems (Fishbowl, HubSpot)
│   │   ├── fishbowl.py
│   │   ├── hubspot.py
│   ├── services/
│   │   ├── data_engine.py      # Polars DataFrames & data merging logic
│   ├── tests/
├── frontend/
│   ├── package.json
│   ├── index.html
│   ├── tailwind.config.js
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/         # UI Elements (Buttons, Charts, Tables)
│   │   ├── pages/              # Dashboard Views
│   │   ├── services/           # Axios/Fetch API calls to FastAPI
│   │   ├── auth/                # Login screen / token storage
├── Dockerfile
├── docker-compose.yml
├── README.md
```

## Naming conventions
- `backend/api/` = clients/proxies for external systems (Fishbowl, HubSpot).
- `backend/routers/` = our own FastAPI routes that the frontend calls.
  Keep these separate — don't mix external-system client code into `routers/`.

## Open / not yet decided
- Deployment target for Docker/docker-compose setup.
- Exact auth scheme (shared token vs JWT-with-login) — currently planned as
  token-based but implementation details aren't finalized.
