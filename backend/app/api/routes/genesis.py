"""
Genesis prediction REST API routes.
"""

from fastapi import APIRouter, HTTPException, Request

from app.api.schemas.cyclone import GenesisMap

router = APIRouter()


@router.get("/genesis", response_model=GenesisMap)
async def get_genesis_map(
    request: Request,
    lead_time: int = 24,
):
    """
    Get current genesis probability map.
    lead_time: 24, 48, or 72 hours.
    """
    if lead_time not in (24, 48, 72):
        raise HTTPException(400, "lead_time must be 24, 48, or 72")

    demo = request.app.state.demo_service
    if demo is None:
        raise HTTPException(503, "Service not initialized")

    data = await demo.get_genesis_map(lead_time)
    if data is None:
        raise HTTPException(404, "Genesis data not available")
    return data


@router.get("/genesis/zones")
async def get_genesis_zones(request: Request):
    """Get all detected potential genesis zones across all lead times."""
    demo = request.app.state.demo_service
    if demo is None:
        raise HTTPException(503, "Service not initialized")

    return await demo.get_genesis_zones()
