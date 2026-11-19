# CHANGELOG.md | SignalFLoor | UI & telemetry architecture upgrade log (Built by Geymars)
# Changelog

## 2026-11-18 (Rev 9) — Web Bluetooth (BLE) & Web Serial (USB) Direct Hardware Connection
- Created `src/lib/hardware.ts`: `HardwareManager` singleton supporting two portable, IP-independent hardware connection modes:
  - **USB / Web Serial**: connects Chrome/Edge directly to ESP32-S3 at 115200 baud via `navigator.serial`; reads newline-delimited JSON scan payloads from the serial stream.
  - **BLE / Web Bluetooth**: connects wirelessly via `navigator.bluetooth` using service UUID `4fafc201-...` and characteristic UUID `beb5483e-...`; receives scan notifications without any network configuration.
- Wired `connectUsb()` / `connectBle()` / `disconnect()` calls and hardware status into `src/pages/Scans.tsx` ESP32 HUD card.
- Both modes automatically invoke the same `onScan` callback, fully compatible with the existing guided tour scan flow.
- Fixed `TS6133` build error: removed unused `bleChar` class field (BLE disconnect is handled via `bleDevice.gatt.disconnect()`).
- Build verified: `npm.cmd run lint` → `Found 0 warnings and 0 errors`; `npm.cmd run build` → `exit 0`.

## 2026-11-18 (Rev 8) — Guided Room-by-Room Surveying, ESP32 Handheld Telemetry HUD & 2.4 GHz Specialization
- Rebuilt `Scans.tsx` around a clean, scale-independent **Guided Room Tour**: replaced confusing pedometer/compass/D-pad walking simulations with intuitive numbered room pins (① Living Room $\rightarrow$ ② Bedroom $\rightarrow$ ③ Kitchen).
- Added an **ESP32-S3 Hardware Telemetry Card** to the Scans page displaying real-time connection status, active target SSID, 10-sample burst averaging, and microcontroller free heap memory.
- Upgraded the `/api/lan/esp-scan` server endpoint and client bridge (`src/lib/lan.ts`) to ingest rich burst statistics (`minRssi`, `maxRssi`, `samples`, `freeHeap`) on each physical button press.
- Completely removed 5 GHz mode from `Utilities.tsx` and `Dashboard.tsx` to align strictly with the single-band 2.4 GHz radio of the ESP32-S3 microcontroller.
- Added celebratory completion state linking directly to the IDW Heatmap upon surveying all rooms.

## 2026-11-18 (Rev 7) — Continuous Blueprint Drawing, Quick Room Stamps, UI Declutter & Geymars Group Attribution
- Overhauled blueprint room creation in `FloorPlans.tsx`: drawing a room now persists `draw` mode continuously without auto-switching to `select`, allowing users to drag and draw multiple rooms in sequence.
- Added 1-Click Quick-Add Room Stamps bar (`Living Room 5×4m`, `Bedroom 4×3.5m`, `Kitchen 3.5×3m`, `Bathroom 2.5×2m`, `Office 3×2.5m`, `Hallway 4×1.5m`) with intelligent layout positioning and automatic number suffixing.
- Added Room Duplication (`Ctrl+D` / button) and Arrow Key nudging (`10px` snap, `Shift+Arrows` for `1m`) with hotkeys `D` (Draw), `V`/`S` (Select), `R` (Router), `M` (Ruler), `Del` (Remove).
- Decluttered Topbar: removed redundant `Start Scan` button and moved the cryptic hardware scan source switcher directly to the `Scans.tsx` page header where it is contextually relevant.
- Decluttered Heatmap toolbar: consolidated 4 separate toggle buttons into a unified compact layer visibility toggle group (`Points`, `Zones`, `Router`).
- Updated product attribution to **Geymars** group everywhere across UI and documentation.

## 2026-11-18 (Rev 6) — Shareable Developer Package & Antigravity Quality Governance
- Replaced boilerplate `README.md` with full SignalFloor quickstart, feature guide, LAN phone pairing workflow, and Antigravity IDE instructions.
- Added `.agent/rules/signalfloor-quality.md` (`trigger: always_on`) and `AGENTS.md` alongside updated `GEMINI.md` documenting the 6-theme CSS token contract, `@layer components` discipline, React 19 `useRef`/`queueMicrotask` hook rules, TypeScript 7 strict constraints, Konva canvas standards, and mandatory `npm.cmd run lint` + `npm.cmd run build` verification gates.

## 2026-11-18 (Rev 5) — Wi-Fi Utilities (Ping, Latency/Jitter, Speed Test, Host Uptime & Least-Traffic Channel Advisor)
- Extended `vite.config.ts` LAN server middleware with `/api/lan/net-diag` (real Windows gateway `ipconfig` + `ping` latency/jitter/loss + `os.uptime()` + `netsh wlan show networks mode=bssid` BSSID spectrum scan computing congestion across 2.4 GHz Ch 1–11 and 5 GHz Ch 36–165), `/api/lan/speed-down`, and `/api/lan/speed-up`.
- Created `src/lib/nettools.ts` (`fetchNetDiag`, `runLiveSpeedTest`, `formatUptime`, `estimateSnrMetrics`) and `src/pages/Utilities.tsx` featuring Gateway/WAN latency monitoring with auto-ping timer, Download/Upload speed benchmark, 2.4/5 GHz channel congestion `BarChart` recommending the least-traffic channels, nearby BSSID table, and interactive SNR/readiness estimator.
- Wired `/utilities` into `src/App.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/layout/Topbar.tsx`, and `src/components/layout/CommandPalette.tsx`, and added a live **Latency, Link & Channel Advisor** summary card to `src/pages/Dashboard.tsx`.

## 2026-11-18 (Rev 4) — Live Operator Navigation, Camera Room Scanner, LAN Phone Companion Bridge & Laser Distance Ruler
- Added Vite LAN Host plugin (`signalFloorLanBridge`) in `vite.config.ts` (replacing deprecated `__dirname` with `import.meta.dirname` and binding `server: { host: true, port: 5173 }`) with `/api/lan/info`, `/api/lan/state`, and `/api/lan/wifi-scan` powered by native Windows `netsh wlan show interfaces`.
- Updated `start.bat` to launch `npm.cmd run dev -- --host --open` so phones on the same Wi-Fi can connect immediately.
- Added zero-dependency ISO/IEC 18004 QR Code matrix & SVG generator (`src/lib/qr.ts`) and PC-Phone companion client bridge (`src/lib/lan.ts`), plus `PhoneConnectModal.tsx` accessible from Topbar (**Phone / LAN**) and `Ctrl+K` Command Palette.
- Added `CameraScannerModal.tsx` supporting WebRTC live camera, mobile native photo upload fallback (`capture="environment"`), interactive visual reference calibration reticle, and Pitch Laser Trig ($d = h \cdot \tan(\theta)$) to measure wall distances and add scanned rooms directly onto the floor plan.
- Extended `src/lib/analytics.ts` (`measureSpan`) and `FloorMap.tsx` / `FloorPlanCanvas.tsx` with a live Operator beacon (`YOU`), 54° compass FOV wedge, wayfinding guidance vector + arrival detection (`<= 0.65m`), and an interactive **Laser Distance & Wall-Loss Ruler** (meters, walking steps, walls crossed, dB attenuation).
- Upgraded `src/pages/Scans.tsx` with **Live Navigate** mode (desktop `WASD`/Arrows/D-Pad walk simulation + mobile `DeviceMotionEvent` pedometer & compass heading + Auto-Capture on arrival + live LAN sync), and added Camera Scanner & Laser Ruler tools to `FloorPlans.tsx` and `Heatmap.tsx`.

## 2026-11-18 (Rev 3) — Multi-Engine UI Theme System (Neumorphism, Liquid Glass, Obsidian Classic, Cyber Carbon, Field Hardware, Aurora Velvet)
- Saved curated dual-mode CSS design tokens & physics reference in `docs/ui-themes-reference.md`.
- Added `UiStyle` engine and `UI_STYLES` gallery metadata (`neumorphism` default, `liquid-glass`, `obsidian`, `cyber-carbon`, `te-field`, `aurora-velvet`) in `src/hooks/useSettings.ts` with storage key `signalfloor.settings.v2` and live `data-ui-style` synchronization.
- Added complete dark + light CSS rules per UI style inside `src/index.css` (extruded/inset Neumorphism shadows, optical Liquid Glass caustics, classic Obsidian smoked glass, 3K Cyber Carbon weave, 3D Field Hardware keycaps, and Midnight Aurora Velvet).
- Surfaced live UI Theme switching in the Topbar Palette pill (`src/components/layout/Topbar.tsx`), the 6-card Visual Theme Gallery inside `src/components/layout/FxStudioModal.tsx`, and the `Ctrl+K` Command Palette (`src/components/layout/CommandPalette.tsx`).
- Added `.stat-card` and `.canvas-well` theme hooks in `StatCard.tsx`, `FloorMap.tsx`, and `FloorPlanCanvas.tsx`.

## 2026-11-18 — Monochrome Liquid-Glass UI, Bug Fixes & Layout Polish
- Replaced lime dashboard styling with a clean **Monochrome Liquid-Glass** UI (`--ink-0: #050506`, `--glass-1..3`, `--rim`, brushed silver `.btn.primary`, 44px `.titlebar` with SignalFloor emblem, floating rounded `.sidebar.glass` with sliding `.nav-indicator`, `.view-head`, `.panel.glass`, sliding `.segmented` controls, `.switch`, and custom non-blocking modals/toasts) in `src/index.css` and `src/components/ui/Kit.tsx`.
- Removed third-party branding/logos and attributed the studio UI to **Geymars**.
- Fixed button icon vertical stacking by rendering button contents inside `<span className="btn-content">` (`display: inline-flex; align-items: center; gap: 7px`) cleanly inside `@layer components`.
- Fixed overlapping center `Living Room` / `Router` text on `FloorMap.tsx` and `FloorPlanCanvas.tsx` by anchoring room name/size badges to the top-left corner of each room.
- Fixed React 19 cross-component `setState` during render in `src/hooks/useFloor.ts`, `src/hooks/useScan.ts`, and `src/hooks/useSettings.ts` via `useRef` mirrors and `queueMicrotask` dispatches.
- Fixed `FloorPlanCanvas.tsx` drag bounds clamping, live `onTransform` normalization, `ResizeObserver` `320px` floor, and automatic return to `select` after router placement.
- Fixed `autoFill` identical timestamps in `src/pages/Scans.tsx` and `src/components/layout/CommandPalette.tsx` by staggering points by 1 second each.
- Added 60 FPS `Float32Array` pooled backdrop physics (`src/components/fx/FxCanvas.tsx`), procedural Web Audio feedback (`src/lib/audio.ts`, `src/lib/sounds.ts`), `Ctrl+K` Command Palette (`src/components/layout/CommandPalette.tsx`), FX & Audio Studio modal, CSV/JSON exports (`src/lib/workspace.ts`), and `start.bat`.
