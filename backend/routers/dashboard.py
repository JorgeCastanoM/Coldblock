from fastapi import APIRouter, Depends

from auth.dependencies import verify_token
from services.data_engine import build_dashboard_snapshot

router = APIRouter(prefix="/dashboard", tags=["dashboard"], dependencies=[Depends(verify_token)])


@router.get("/summary")
async def get_summary() -> dict:
    return await build_dashboard_snapshot()
