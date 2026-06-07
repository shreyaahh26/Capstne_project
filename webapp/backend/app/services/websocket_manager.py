import logging
import json
from typing import List, Dict, Any, Set
from fastapi import WebSocket

logger = logging.getLogger("WebSocketManager")

class RealTimeTelemetryBroadcaster:
    """
    Manages active client Websockets subscribed to live distributed VM dashboards.
    Supports asynchronous JSON-form content broadcasting under multi-user concurrency.
    """
    def __init__(self):
        self.active_sockets: Set[WebSocket] = set()

    async def register_connection(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_sockets.add(websocket)
        logger.info(f"Registered connection from live Dashboard. Active subscriber count: {len(self.active_sockets)}")

    def unregister_connection(self, websocket: WebSocket) -> None:
        if websocket in self.active_sockets:
            self.active_sockets.remove(websocket)
            logger.info(f"Closed Dashboard subscriber link. Active subscriber count: {len(self.active_sockets)}")

    async def broadcast_metric_update(self, event_type: str, payload_data: Dict[str, Any]) -> None:
        """ Broadcasts dynamic load arrays asynchronously into visual frames. """
        if not self.active_sockets:
            return
            
        message = json.dumps({
            "event": event_type,
            "data": payload_data
        })
        
        broken_links: Set[WebSocket] = set()
        for sock in list(self.active_sockets):
            try:
                await sock.send_text(message)
            except Exception:
                broken_links.add(sock)
                
        # Clean up stale connections
        for stale_sock in broken_links:
            self.unregister_connection(stale_sock)

ws_telemetry_broadcaster = RealTimeTelemetryBroadcaster()
