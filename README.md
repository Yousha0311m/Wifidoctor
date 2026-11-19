# README.md | SignalFLoor | Complete quickstart, features guide & Antigravity setup (Built by Geymars)

# SignalFloor — Wi-Fi Spatial Studio & Field Diagnostic Suite

Built by **Geymars**. SignalFloor is a React 19 + Konva + TypeScript RF spatial mapping workstation featuring 6 switchable UI design engines, procedural Web Audio feedback, live operator walking navigation, camera room dimension scanning, a QR-paired phone LAN companion bridge, and a Windows host Wi-Fi spectrum & ping/speed diagnostic suite.

---

## Quick Start (Windows)

1. Extract this archive into a folder (for example `SignalFLoor`).
2. Double-click **`start.bat`** (or run `npm.cmd install && npm.cmd run dev -- --host --open` in PowerShell).
3. Wait for dependencies to install on first launch — your browser opens automatically at `http://localhost:5173/`.

> **Connecting a Phone on the Same Wi-Fi**:
> Click **Phone / LAN** in the top bar and scan the QR code with your phone camera. Make sure both your PC and phone are on the same Wi-Fi network. Click **Push Layout to Phone** inside the modal so your floor plan syncs live.

---

## Features & Views

### 1. Dashboard (`/`)
- 4 live RF telemetry KPI cards (**Avg RSSI**, **Good Coverage %**, **Scan Points**, **Dead Zones**).
- **Latency, Link & Channel Advisor** summary card showing Router/WAN ping, Wi-Fi PHY link rate, host uptime, and recommended least-traffic 2.4 GHz & 5 GHz channels.
- Interactive Floor Coverage Overview, RSSI Trend Sparkline, Signal by Room bars, and Recent Scans list.

### 2. Floor Plans (`/floor-plans`)
- Interactive **Konva** spatial editor on a `1000 × 600` (`50px = 1 meter`) 10px snap grid.
- **Draw room**, **Select & resize** (clamped cleanly inside canvas boundaries), and **Place router**.
- **Scan Room (Camera)**: Open a live WebRTC camera stream or upload/take a photo (`Snap / Upload Photo` works even over HTTP on mobile phones) and measure room width & depth using either:
  - **Visual Scale Reticle**: Align the cyan calibration bar to a known reference (`Door 0.90m`, `Tile 0.60m`, `Desk 1.40m`, `Step 0.75m`) and measure room width × depth in meters, then click **Add Room**.
  - **Pitch Laser Trig**: Aim the crosshair at the wall floor base using camera height + downward tilt angle ($d = h \cdot \tan(\theta)$).
- **Measure (Laser Ruler)**: Drag or two-tap any two points on the blueprint to inspect exact meters, walking steps, walls crossed, and estimated dB wall path loss.

### 3. Scans & Live Navigate (`/scans`)
- Click grid spots or click anywhere inside a room to capture Wi-Fi RSSI (from the **RF Simulator**, **Live Host Windows Wi-Fi (`netsh wlan`)**, or an **ESP32 bridge**).
- **Live Navigate Mode**:
  - Track your operator beacon (`YOU`) + 54° directional heading cone and dashed wayfinding vector toward the next target spot.
  - Walk using **Mobile Phone Sensors** (`DeviceOrientationEvent` compass + `DeviceMotionEvent` step pedometer), desktop keyboard **`WASD` / Arrow keys** (`Space` to capture), on-screen D-Pad, or **Step to Target**.
  - **Auto-Capture (`<= 0.65m`)**: Automatically captures RSSI + plays a sonar chime when you walk onto the dedicated target spot.
  - **LAN Live Sync**: Streams operator coordinates, room updates, and new scan points between PC and Phone in real time via `/api/lan/state`.

### 4. Heatmap (`/heatmap`) & Reports (`/reports`)
- **IDW Heatmap**: Inverse-Distance Weighted spatial signal contour map with opacity slider, signal probe, dead-zone (`DZ`) + extender (`E`) pins, and **Laser Ruler** overlay.
- **Reports**: Per-room averages, signal distribution chart, dead-zone clustering (`< -75 dBm`), mesh extender placement recommendations, and one-click `.csv` / diagnostic `.json` exports.

### 5. Wi-Fi Utilities (`/utilities`)
- **Live Latency & Ping**: Measures local Default Gateway (router) and WAN (`1.1.1.1`) ICMP latency, jitter, packet loss, and rolling timeline with **Auto-Ping (3s)** monitor.
- **LAN / Wi-Fi Throughput Test**: Benchmarks real 3 MB Download, 1.5 MB Upload, and HTTP RTT/jitter between browser and Vite host.
- **Host & Session Uptime**: Real OS system uptime and dev-server session uptime.
- **Least-Traffic Channel Recommender**: Scans `netsh wlan show networks mode=bssid`, plots congestion across **2.4 GHz Ch 1–11** (selecting cleanest non-overlapping **1, 6, or 11**) and **5 GHz Ch 36–165**, and lists detected BSSIDs.
- **SNR & Workload Estimator**: Drag RSSI from `-90` to `-35 dBm` to inspect estimated SNR dB, MCS index, PHY/TCP Mbps, and readiness for Gaming, 4K Streaming, and VoIP.

### 6. Multi-Engine UI Themes, Backdrop FX & Web Audio Studio
Click the **Theme pill** in the top bar (or press **`Ctrl+K`** -> **Open UI Themes & FX Studio**) to switch live across 6 design systems (**Neumorphism**, **Liquid Glass**, **Obsidian Classic**, **Cyber Carbon**, **Field Hardware**, **Aurora Velvet**), Dark/Light mode, 6 accent presets, 60 FPS `Float32Array` canvas particle presets, and synthesized Web Audio clicks/sonar cues.

---

## Using with Google Antigravity IDE (For You & Your Friend)

This folder comes pre-configured so Antigravity builds every new feature to the same production quality:

1. In **Google Antigravity**, open this extracted **`SignalFLoor`** directory as your **Workspace**.
2. Antigravity automatically loads:
   - [`.agent/rules/signalfloor-quality.md`](file:///.agent/rules/signalfloor-quality.md) — Always-on architectural, React 19, TypeScript, Tailwind v4, and UI quality rules.
   - [`AGENTS.md`](file:///AGENTS.md) & [`GEMINI.md`](file:///GEMINI.md) — Workspace handbook, directory map, and required verification gates (`npm.cmd run lint` and `npm.cmd run build`).
   - [`docs/ui-themes-reference.md`](file:///docs/ui-themes-reference.md) — Full CSS token & FX reference.
3. Try asking Antigravity in chat:
   - *"Read README.md and AGENTS.md first, then add an exportable printable PDF floor report button on Reports."*
   - *"Add a room obstacle / concrete wall material selector to FloorPlans that adjusts wall attenuation in analytics.ts and scanner.ts."*
   - *"Add an internet Cloudflare speed test toggle next to the LAN speed test in Utilities.tsx."*

---

## Development Scripts (Windows PowerShell)

Always use `npm.cmd` on Windows PowerShell:

```powershell
npm.cmd install        # Install dependencies
npm.cmd run dev -- --host --open   # Start LAN + Local dev server (or double-click start.bat)
npm.cmd run lint       # Run oxlint (target: 0 warnings, 0 errors)
npm.cmd run build      # Strict TypeScript check + Vite production bundle
```
