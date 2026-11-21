"""
WiFiDoctor Phase A backend.

Subscribes to MQTT (devices/esp32-01/scan + /status), pairs incoming scans
with the (x, y) of the last POST /scan request, stores points in memory,
broadcasts them via WebSocket to any connected browser. Each stored point keeps the
full nearby-networks list (ssid, bssid, rssi, channel) so the dashboard can show channel congestion.

No database, no auth, no persistence. All of that is Phase B.
"""

import asyncio
import json
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import aiomqtt
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


# ---- Config (hardcoded for Phase A; moves to env vars in Phase B) ----
MQTT_HOST = "192.168.0.122"
MQTT_PORT = 1883
DEVICE_ID = "esp32-01"


# ---- In-memory state ----
pending_scans: dict[str, dict] = {}
scan_points: list[dict] = []
connected_ws: set[WebSocket] = set()


# ---- WebSocket broadcast ----
async def broadcast(event: dict) -> None:
    dead: list[WebSocket] = []
    for ws in connected_ws:
        try:
            await ws.send_json(event)
        except Exception:
            dead.append(ws)
    for ws in dead:
        connected_ws.discard(ws)


# ---- MQTT background listener ----
async def mqtt_listener() -> None:
    while True:
        try:
            async with aiomqtt.Client(MQTT_HOST, MQTT_PORT) as client:
                await client.subscribe(f"devices/{DEVICE_ID}/scan")
                await client.subscribe(f"devices/{DEVICE_ID}/status")
                print(f"[mqtt] connected to {MQTT_HOST}:{MQTT_PORT}")
                print(f"[mqtt] subscribed to devices/{DEVICE_ID}/scan and /status")

                async for message in client.messages:
                    topic = str(message.topic)
                    payload = message.payload.decode("utf-8", errors="replace")
                    print(f"[mqtt] << {topic}: {payload[:160]}")

                    if topic.endswith("/scan"):
                        await handle_scan(payload)
                    elif topic.endswith("/status"):
                        await broadcast({"type": "device_status", "status": payload})
        except Exception as e:
            print(f"[mqtt] error: {e!r} — reconnecting in 5s")
            await asyncio.sleep(5)


async def handle_scan(payload: str) -> None:
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as e:
        print(f"[scan] invalid JSON: {e}")
        return

    scan_id = data.get("scan_id", "")
    pending = pending_scans.pop(scan_id, None) if scan_id else None

    if pending is None:
        x, y = 500, 300
        print(f"[scan] no pending location for scan_id={scan_id!r}, defaulting to (500,300)")
    else:
        x, y = pending["x"], pending["y"]

    raw_networks = data.get("networks", [])
    networks = [
        {
            "ssid": n.get("ssid", ""),
            "bssid": n.get("bssid", ""),
            "rssi": n["rssi"],
            "channel": n.get("channel"),
        }
        for n in raw_networks
        if isinstance(n, dict) and isinstance(n.get("rssi"), (int, float))
    ]
    if not networks:
        print("[scan] no usable networks in payload, nothing to store")
        return

    strongest = max(networks, key=lambda n: n["rssi"])
    point = {
        "id": int(datetime.now(timezone.utc).timestamp() * 1000),
        "x": x,
        "y": y,
        "rssi": strongest["rssi"],
        "ssid": strongest["ssid"],
        "bssid": strongest["bssid"],
        "channel": strongest["channel"],
        "networks": networks,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    scan_points.append(point)
    print(f"[scan] stored point ({x}, {y}) rssi={point['rssi']} ssid={point['ssid']!r} total={len(scan_points)}")
    await broadcast({"type": "scan_point", "data": point})


# ---- FastAPI app ----
@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(mqtt_listener())
    print("[api] MQTT listener started")
    try:
        yield
    finally:
        task.cancel()
        print("[api] shutting down")


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ScanRequest(BaseModel):
    x: int
    y: int


@app.get("/health")
async def health() -> dict:
    return {
        "ok": True,
        "points": len(scan_points),
        "pending": len(pending_scans),
        "ws_clients": len(connected_ws),
    }


@app.post("/scan")
async def trigger_scan(req: ScanRequest) -> dict:
    scan_id = str(uuid.uuid4())[:8]
    pending_scans[scan_id] = {"x": req.x, "y": req.y}

    try:
        async with aiomqtt.Client(MQTT_HOST, MQTT_PORT) as client:
            payload = json.dumps({"action": "scan", "scan_id": scan_id})
            await client.publish(f"devices/{DEVICE_ID}/cmd", payload, qos=0)
        print(f"[api] scan triggered at ({req.x}, {req.y}) id={scan_id}")
        return {"scan_id": scan_id, "status": "queued"}
    except Exception as e:
        pending_scans.pop(scan_id, None)
        print(f"[api] publish failed: {e!r}")
        return {"error": str(e)}


@app.get("/points")
async def get_points() -> list[dict]:
    return scan_points


@app.delete("/points")
async def clear_points() -> dict:
    n = len(scan_points)
    scan_points.clear()
    return {"cleared": n}


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    connected_ws.add(ws)
    print(f"[ws] client connected, total={len(connected_ws)}")

    try:
        await ws.send_json({"type": "init", "points": scan_points})
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[ws] error: {e!r}")
    finally:
        connected_ws.discard(ws)
        print(f"[ws] client disconnected, total={len(connected_ws)}")