# ColdBlock Intelligence Dashboard

## Project Overview
This project is an operational dashboard for ColdBlock Technologies. It extracts raw data from a local Fishbowl ERP and a cloud HubSpot CRM, processes the data using a high-speed Python/Polars backend, and serves actionable insights to a React frontend optimized for shop-floor tablets.

## Technical Architecture
* **Frontend:** React, Vite, Tailwind CSS (Dark theme, highly optimized for touch/tablet).
* **Backend:** Python, FastAPI.
* **Data Processing Engine:** Polars (for lightning-fast JSON ingestion, DataFrame manipulation, and cross-referencing SKUs between CRM and ERP).
* **Auth:** Token-based login for dashboard access.
* **Infrastructure:**
  * Fishbowl ERP accessed via private Tailscale mesh VPN tunnel (`http://100.x.x.x:2456`).
  * HubSpot CRM accessed via public REST API with Bearer Token.

## Core Data Flow
1. **Ingest:** FastAPI endpoints trigger Polars to fetch data from Fishbowl (Inventory, MOs, tracking queries) and HubSpot (Deals, Line Items) on dashboard load.
2. **Process:** Polars merges HubSpot demand signals with Fishbowl supply constraints using Part IDs / SKUs.
3. **Serve:** FastAPI serves clean, sanitized JSON to the React frontend.

## Desired Directory Structure
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
│   ├── routers/                # Dashboard-facing endpoints
│   │   ├── dashboard.py
│   ├── api/
│   │   ├── fishbowl.py         # Fishbowl REST API proxy & authentication
│   │   ├── hubspot.py          # HubSpot REST API client
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
