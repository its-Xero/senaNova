"""
General Chat WebSocket Router (NO AUTH).
Handles Global Broadcasts with Persistence.
User identity from query params (user_id, name).
"""

import logging
import json
from datetime import datetime
from typing import List
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models import GlobalMessage

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


class BroadcastManager:
    def __init__(self):
        # all websockets
        self.active_connections: List[WebSocket] = []
        # metadata per websocket
        self.ws_meta: dict[WebSocket, dict] = {}
        # room_id -> { user_id: user_name }
        self.rooms: dict[str, dict[str, str]] = {}

    async def connect(self, websocket: WebSocket, user_id: str, name: str, room_id: str):
        await websocket.accept()
        self.active_connections.append(websocket)
        self.ws_meta[websocket] = {"user_id": user_id, "user_name": name, "room_id": room_id}
        self.rooms.setdefault(room_id, {})[user_id] = name

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            meta = self.ws_meta.get(websocket)
            if meta:
                rid = meta.get("room_id")
                uid = meta.get("user_id")
                if rid and uid and rid in self.rooms and uid in self.rooms[rid]:
                    try:
                        del self.rooms[rid][uid]
                    except KeyError:
                        pass
            self.active_connections.remove(websocket)
            self.ws_meta.pop(websocket, None)

    async def broadcast_room(self, room_id: str, message: dict):
        # send message to all connections in the same room
        for connection in list(self.active_connections):
            meta = self.ws_meta.get(connection)
            if not meta:
                continue
            if meta.get("room_id") == room_id:
                try:
                    await connection.send_json(message)
                except Exception:
                    pass


manager = BroadcastManager()


@router.websocket("/ws/general")
async def general_chat_endpoint(
    websocket: WebSocket,
    user_id: str = Query("anonymous"),
    name: str = Query("Guest"),
    room_id: str = Query("general"),
):
    """
    Open WebSocket for general chat.
    No auth required - user_id and name come from query params.
    """
    username = name or f"Guest-{user_id[:4]}"
    await manager.connect(websocket, user_id, username, room_id)
    logger.info(f"WS Connected: {user_id} ({username}) in room {room_id}")

    # Send initial room user list to the newly connected client
    try:
        users = []
        room_map = manager.rooms.get(room_id, {})
        for uid, uname in room_map.items():
            users.append({"user_id": uid, "user_name": uname})
        await websocket.send_json({"type": "room_users", "room_id": room_id, "users": users})
        # Broadcast presence join to room
        await manager.broadcast_room(room_id, {"type": "presence", "event": "join", "user_id": user_id, "user_name": username})
    except Exception:
        pass


@router.get("/api/v1/rooms/{room_id}/members")
async def get_room_members(room_id: str):
    """Return current members for a room (in-memory)."""
    room_map = manager.rooms.get(room_id)
    if room_map is None:
        # empty room -> return empty list
        return []
    return [{"user_id": uid, "user_name": name} for uid, name in room_map.items()]

    try:
        while True:
            data_text = await websocket.receive_text()
            data = json.loads(data_text)
            
            if data.get("type") == "chat":
                content = data.get("content")
                if not content:
                    continue

                # Persist message
                async with AsyncSessionLocal() as db:
                    msg = GlobalMessage(
                        sender_id=user_id,
                        sender_name=username,
                        content=content
                    )
                    db.add(msg)
                    await db.commit()
                    await db.refresh(msg)

                    # Broadcast to room only
                    out_msg = {
                        "type": "message",
                        "id": msg.id,
                        "sender_id": user_id,
                        "user_name": username,
                        "content": content,
                        "timestamp": str(msg.timestamp),
                        "room_id": room_id,
                    }
                    await manager.broadcast_room(room_id, out_msg)

    except WebSocketDisconnect:
        # On disconnect, remove and notify room
        meta = manager.ws_meta.get(websocket)
        manager.disconnect(websocket)
        if meta:
            try:
                await manager.broadcast_room(meta.get("room_id"), {"type": "presence", "event": "leave", "user_id": meta.get("user_id"), "user_name": meta.get("user_name")})
            except Exception:
                pass
        logger.info(f"WS Disconnected: {user_id}")
    except Exception as e:
        logger.error(f"General WS Error: {e}")
        manager.disconnect(websocket)
        meta = manager.ws_meta.get(websocket)
        if meta:
            try:
                await manager.broadcast_room(meta.get("room_id"), {"type": "presence", "event": "leave", "user_id": meta.get("user_id"), "user_name": meta.get("user_name")})
            except Exception:
                pass
