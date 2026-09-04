"""
Cyclone analysis REST API routes.
Serves cyclone bulletins, intensity, track, Dvorak, and GradCAM data.
"""

from fastapi import APIRouter, HTTPException, Request
from typing import Optional

from app.api.schemas.cyclone import (
    CycloneBulletin,
    CycloneListItem,
    IntensityEstimate,
    TrackForecast,
    DvorakAnalysis,
)

router = APIRouter()


@router.get("/cyclones", response_model=list[CycloneListItem])
async def list_cyclones(
    request: Request,
    active_only: bool = True,
    basin: str = "NIO",
):
    """List all tracked cyclones (active and/or historical)."""
    demo = request.app.state.demo_service
    if demo is None:
        raise HTTPException(503, "Service not initialized")
    return await demo.get_cyclone_list(active_only=active_only, basin=basin)


@router.get("/cyclone/{storm_id}", response_model=CycloneBulletin)
async def get_cyclone_bulletin(
    request: Request,
    storm_id: str,
):
    """Get the complete cyclone analysis bulletin for a specific storm."""
    demo = request.app.state.demo_service
    if demo is None:
        raise HTTPException(503, "Service not initialized")

    bulletin = await demo.get_bulletin(storm_id)
    if bulletin is None:
        raise HTTPException(404, f"Storm '{storm_id}' not found")
    return bulletin


@router.get("/cyclone/{storm_id}/intensity", response_model=IntensityEstimate)
async def get_intensity(request: Request, storm_id: str):
    """Get current intensity estimation with uncertainty."""
    demo = request.app.state.demo_service
    if demo is None:
        raise HTTPException(503, "Service not initialized")

    data = await demo.get_intensity(storm_id)
    if data is None:
        raise HTTPException(404, f"Storm '{storm_id}' not found")
    return data


@router.get("/cyclone/{storm_id}/track", response_model=TrackForecast)
async def get_track_forecast(request: Request, storm_id: str):
    """Get track forecast with ensemble paths and KDE probability cone."""
    demo = request.app.state.demo_service
    if demo is None:
        raise HTTPException(503, "Service not initialized")

    data = await demo.get_track(storm_id)
    if data is None:
        raise HTTPException(404, f"Storm '{storm_id}' not found")
    return data


@router.get("/cyclone/{storm_id}/dvorak", response_model=DvorakAnalysis)
async def get_dvorak_analysis(request: Request, storm_id: str):
    """Get Dvorak pattern classification and T-number."""
    demo = request.app.state.demo_service
    if demo is None:
        raise HTTPException(503, "Service not initialized")

    data = await demo.get_dvorak(storm_id)
    if data is None:
        raise HTTPException(404, f"Storm '{storm_id}' not found")
    return data


@router.get("/cyclone/{storm_id}/gradcam")
async def get_gradcam(request: Request, storm_id: str, target: str = "intensity"):
    """
    Get GradCAM explainability heatmap.
    target: 'intensity', 'ri', or 'pattern'
    """
    demo = request.app.state.demo_service
    if demo is None:
        raise HTTPException(503, "Service not initialized")

    data = await demo.get_gradcam(storm_id, target)
    if data is None:
        raise HTTPException(404, f"GradCAM not available for '{storm_id}'")
    return data


@router.get("/cyclone/{storm_id}/timeline")
async def get_intensity_timeline(
    request: Request,
    storm_id: str,
    hours_back: int = 72,
    hours_forward: int = 48,
):
    """Get intensity timeline (historical + forecast) for chart visualization."""
    demo = request.app.state.demo_service
    if demo is None:
        raise HTTPException(503, "Service not initialized")

    data = await demo.get_intensity_timeline(storm_id, hours_back, hours_forward)
    if data is None:
        raise HTTPException(404, f"Storm '{storm_id}' not found")
    return data
