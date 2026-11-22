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
import time
import uuid
from collections import deque
from pathlib import Path
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import aiomqtt
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


# ---- Config (hardcoded for Phase A; moves to env vars in Phase B) ----
MQTT_HOST = "192.168.0.122"
NOT_HEARD_RSSI = -100  # stored when our own network is not heard at a spot
MQTT_PORT = 1883
DEVICE_ID = "esp32-01"


# ---- In-memory state ----
pending_scans: dict[str, dict] = {}
scan_points: list[dict] = []
connected_ws: set[WebSocket] = set()

# ---- Monitor mode: time series from the always-on ESP32 ----
# Kept in memory and appended to a small file so a restart does not lose history.
# (Postgres replaces the file later.)
MONITOR_FILE = Path(__file__).parent / "data" / "monitor.jsonl"
monitor_samples: deque = deque(maxlen=30000)  # ~20 days at one sample a minute
monitor_events: deque = deque(maxlen=5000)
monitor_state: dict = {"enabled": False, "interval": 60, "last_seen": None}


def _persist(kind: str, item: dict) -> None:
    try:
        MONITOR_FILE.parent.mkdir(parents=True, exist_ok=True)
        with MONITOR_FILE.open("a", encoding="utf-8") as f:
            f.write(json.dumps({"k": kind, "d": item}) + "\n")
    except OSError as e:
        print(f"[monitor] could not write history file: {e!r}")


def _load_history() -> None:
    if not MONITOR_FILE.exists():
        return
    try:
        for line in MONITOR_FILE.read_text(encoding="utf-8").splitlines():
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if row.get("k") == "sample":
                monitor_samples.append(row["d"])
            elif row.get("k") == "event":
                monitor_events.append(row["d"])
        print(f"[monitor] loaded {len(monitor_samples)} samples, {len(monitor_events)} events")
    except OSError as e:
        print(f"[monitor] could not read history file: {e!r}")


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
                await client.subscribe(f"devices/{DEVICE_ID}/monitor")
                print(f"[mqtt] connected to {MQTT_HOST}:{MQTT_PORT}")
                print(f"[mqtt] subscribed to devices/{DEVICE_ID}/scan, /status and /monitor")

                async for message in client.messages:
                    topic = str(message.topic)
                    payload = message.payload.decode("utf-8", errors="replace")
                    print(f"[mqtt] << {topic}: {payload[:160]}")

                    if topic.endswith("/scan"):
                        await handle_scan(payload)
                    elif topic.endswith("/monitor"):
                        await handle_monitor(payload)
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
    # "Your" network is the one the board is joined to; the firmware sends its name.
    # Map that network, not whichever neighbour happens to be loudest at this spot.
    own_ssid = data.get("own_ssid") or ""
    if own_ssid:
        mine = [n for n in networks if n["ssid"] == own_ssid]
        if mine:
            chosen = max(mine, key=lambda n: n["rssi"])
        else:
            # Heard everyone except our own network: that spot is effectively dead
            chosen = {"ssid": own_ssid, "bssid": "", "rssi": NOT_HEARD_RSSI, "channel": None}
            print(f"[scan] own network {own_ssid!r} not heard here, storing {NOT_HEARD_RSSI} dBm")
    elif networks:
        # Older firmware without own_ssid: fall back to the loudest network
        chosen = max(networks, key=lambda n: n["rssi"])
    else:
        print("[scan] no usable networks in payload, nothing to store")
        return

    point = {
        "id": int(datetime.now(timezone.utc).timestamp() * 1000),
        "x": x,
        "y": y,
        "rssi": chosen["rssi"],
        "ssid": chosen["ssid"],
        "bssid": chosen["bssid"],
        "channel": chosen["channel"],
        "networks": networks,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    scan_points.append(point)
    print(f"[scan] stored point ({x}, {y}) rssi={point['rssi']} ssid={point['ssid']!r} total={len(scan_points)}")
    await broadcast({"type": "scan_point", "data": point})


async def handle_monitor(payload: str) -> None:
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as e:
        print(f"[monitor] invalid JSON: {e}")
        return
    if not isinstance(data, dict):
        return

    now_ms = int(time.time() * 1000)
    kind = data.get("type")
    monitor_state["last_seen"] = now_ms

    if kind == "sample":
        sample = {
            "t": now_ms,
            "rssi": data.get("rssi"),          # signal to our own access point (dBm), None if not connected
            "channel": data.get("channel"),
            "ssid": data.get("ssid", ""),
            "gw_ms": data.get("gw_ms"),        # time to reach the router, None = unreachable
            "net_ms": data.get("net_ms"),      # time to reach the internet, None = unreachable
            "dns_ms": data.get("dns_ms"),      # time to look up a name, None = failed
            "heap": data.get("heap"),
            "up": data.get("up"),              # board uptime in seconds
            "aps": data.get("aps"),            # networks heard in the last scan
        }
        nets = data.get("networks")
        if isinstance(nets, list):
            sample["networks"] = [
                {"ssid": n.get("ssid", ""), "bssid": n.get("bssid", ""), "rssi": n["rssi"], "channel": n.get("channel")}
                for n in nets
                if isinstance(n, dict) and isinstance(n.get("rssi"), (int, float))
            ]
        monitor_samples.append(sample)
        _persist("sample", sample)
        await broadcast({"type": "monitor_sample", "data": sample})
    elif kind == "event":
        ago = data.get("ago_s")
        when = now_ms - int(ago * 1000) if isinstance(ago, (int, float)) and 0 <= ago < 86400 * 7 else now_ms
        event = {
            "t": when,                          # the board reports drops after it is back, so backdate them
            "event": data.get("event", ""),     # "disconnect" or "reconnect"
            "reason": data.get("reason"),
            "down_s": data.get("down_s"),       # how long the link was down (reconnect only)
        }
        monitor_events.append(event)
        _persist("event", event)
        await broadcast({"type": "monitor_event", "data": event})
    elif kind == "state":
        monitor_state["enabled"] = bool(data.get("enabled"))
        monitor_state["interval"] = int(data.get("interval") or 60)
        await broadcast({"type": "monitor_state", "data": monitor_state})


# ---- FastAPI app ----
@asynccontextmanager
async def lifespan(app: FastAPI):
    _load_history()
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


class MonitorMode(BaseModel):
    enabled: bool
    interval: int = 60


@app.get("/monitor")
async def get_monitor(hours: float = 24) -> dict:
    since = int((time.time() - hours * 3600) * 1000)
    return {
        "samples": [s for s in monitor_samples if s["t"] >= since],
        "events": [e for e in monitor_events if e["t"] >= since],
        "state": monitor_state,
    }


@app.post("/monitor/mode")
async def set_monitor_mode(req: MonitorMode) -> dict:
    interval = max(15, min(req.interval, 600))
    try:
        async with aiomqtt.Client(MQTT_HOST, MQTT_PORT) as client:
            payload = json.dumps({"action": "monitor", "enabled": req.enabled, "interval": interval})
            await client.publish(f"devices/{DEVICE_ID}/cmd", payload, qos=0)
        print(f"[api] monitor mode enabled={req.enabled} interval={interval}s")
        return {"status": "sent", "enabled": req.enabled, "interval": interval}
    except Exception as e:
        print(f"[api] publish failed: {e!r}")
        return {"error": str(e)}


@app.delete("/monitor")
async def clear_monitor() -> dict:
    n = len(monitor_samples)
    monitor_samples.clear()
    monitor_events.clear()
    try:
        MONITOR_FILE.unlink(missing_ok=True)
    except OSError:
        pass
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