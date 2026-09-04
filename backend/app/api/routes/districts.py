"""
District-level landfall risk REST API routes.
"""

from fastapi import APIRouter, HTTPException, Request

from app.api.schemas.cyclone import DistrictRisk

router = APIRouter()


@router.get("/districts/risk", response_model=list[DistrictRisk])
async def get_district_risks(
    request: Request,
    storm_id: str = None,
    min_probability: float = 0.0,
):
    """
    Get landfall probability per coastal district.
    Optionally filter by storm_id and minimum probability threshold.
    """
    demo = request.app.state.demo_service
    if demo is None:
        raise HTTPException(503, "Service not initialized")

    risks = await demo.get_district_risks(storm_id, min_probability)
    return risks


@router.get("/districts/geojson")
async def get_districts_geojson(request: Request):
    """Get Indian coastal district boundaries as GeoJSON/TopoJSON for map rendering."""
    demo = request.app.state.demo_service
    if demo is None:
        raise HTTPException(503, "Service not initialized")

    return await demo.get_districts_geojson()
