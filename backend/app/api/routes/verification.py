"""
Verification metrics REST API routes.
"""

from fastapi import APIRouter, HTTPException, Request

from app.api.schemas.cyclone import VerificationMetrics

router = APIRouter()


@router.get("/verification", response_model=VerificationMetrics)
async def get_verification_metrics(request: Request):
    """Get system performance verification metrics against historical cases."""
    demo = request.app.state.demo_service
    if demo is None:
        raise HTTPException(503, "Service not initialized")

    return await demo.get_verification_metrics()


@router.get("/verification/reliability")
async def get_reliability_diagram(
    request: Request,
    target: str = "intensity",
):
    """
    Get reliability diagram data (predicted prob vs observed frequency).
    target: 'intensity', 'ri', or 'genesis'
    """
    demo = request.app.state.demo_service
    if demo is None:
        raise HTTPException(503, "Service not initialized")

    return await demo.get_reliability_data(target)
