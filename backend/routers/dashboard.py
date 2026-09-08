import httpx
from fastapi import APIRouter, Depends, HTTPException, status

from api.fishbowl import fishbowl_client
from auth.dependencies import verify_token
from core.config import settings
from services.data_engine import FINISHED_SKUS, build_dashboard_snapshot
from services.tasks import build_tasks_report

router = APIRouter(prefix="/dashboard", tags=["dashboard"], dependencies=[Depends(verify_token)])


def _fishbowl_error(exc: Exception) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"Fishbowl request failed: {exc}",
    )


@router.get("/summary")
async def get_summary() -> dict:
    # Single Fishbowl login covers inventory, manufacture orders, and sales orders
    # together (see services/data_engine._fetch_all) so a dashboard load only ever
    # opens one Fishbowl session, not one per data type.
    try:
        return await build_dashboard_snapshot()
    except httpx.HTTPError as exc:
        raise _fishbowl_error(exc) from exc


@router.get("/tasks")
async def get_tasks(window: str = "actionable") -> dict:
    """Unified Planner + HubSpot to-do report.

    Deliberately not part of /summary: that payload is fetched once on app mount
    for every page, and tasks are needed on one tab. Per-source failures are
    reported in the "sources" field rather than raised, so a Planner outage (or
    Planner simply being disabled) still returns the HubSpot half.
    """
    if window not in ("actionable", "all"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="window must be 'actionable' or 'all'",
        )
    return await build_tasks_report(window)


@router.get("/serials/{sku}")
async def get_serials(sku: str) -> dict:
    if not settings.enable_fishbowl:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Fishbowl is disabled in this deployment.",
        )
    if sku not in FINISHED_SKUS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Serial lookup is only available for finished goods: {', '.join(sorted(FINISHED_SKUS))}",
        )
    try:
        serials = await fishbowl_client.get_serial_numbers(sku)
    except httpx.HTTPError as exc:
        raise _fishbowl_error(exc) from exc
    finally:
        await fishbowl_client.logout()
    return {"sku": sku, "serials": serials}
