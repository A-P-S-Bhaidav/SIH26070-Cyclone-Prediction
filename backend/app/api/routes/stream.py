"""
Server-Sent Events (SSE) streaming endpoint for real-time cyclone telemetry.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Request
from sse_starlette.sse import EventSourceResponse

logger = logging.getLogger(__name__)

router = APIRouter()


async def telemetry_generator(request: Request):
    """
    Generate SSE events for real-time cyclone telemetry.
    
    In production, this reads from a Redis pub/sub channel.
    In demo mode, it streams pre-computed demo data at realistic intervals.
    """
    logger.info("SSE client connected for telemetry stream")

    try:
        while True:
            # Check if client disconnected
            if await request.is_disconnected():
                logger.info("SSE client disconnected")
                break

            demo = request.app.state.demo_service
            if demo is not None:
                # Stream demo telemetry
                event_data = await demo.get_next_telemetry_event()
                if event_data:
                    yield {
                        "event": event_data.get("event_type", "cyclone_telemetry"),
                        "data": json.dumps(event_data, default=str),
                        "id": str(int(datetime.now(timezone.utc).timestamp() * 1000)),
                    }

            # Heartbeat every 30 seconds to keep connection alive
            yield {
                "event": "heartbeat",
                "data": json.dumps({
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "status": "alive",
                }),
            }

            # Wait before next update (6h cycle simulated as 10s in demo)
            await asyncio.sleep(10)

    except asyncio.CancelledError:
        logger.info("SSE stream cancelled")
    except Exception as e:
        logger.error("SSE stream error: %s", str(e))


@router.get("/stream/telemetry")
async def stream_telemetry(request: Request):
    """
    Real-time cyclone telemetry stream via Server-Sent Events.
    
    Events:
    - cyclone_telemetry: Storm state updates (position, intensity, category)
    - track_update: Updated track forecast and KDE cone
    - ri_alert: Rapid intensification probability changes
    - genesis_update: New genesis zone detections
    - heartbeat: Connection keepalive
    """
    return EventSourceResponse(
        telemetry_generator(request),
        media_type="text/event-stream",
    )
