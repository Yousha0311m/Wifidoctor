<!-- AGENTS.md | SignalFLoor | AI Agent Architecture, Coding Standards & Verification Playbook -->
# AGENTS.md — How to Build & Maintain SignalFloor

Welcome, agent or developer! Before modifying any file in this repository, read this playbook alongside `GEMINI.md` and `.agent/rules/signalfloor-quality.md` so every change matches SignalFloor's UI craft, TypeScript strictness, and multi-theme architecture.

---

## 1. Repository Architecture & Code Map

| Path | Role |
| :--- | :--- |
| `start.bat` | One-click Windows launcher (`npm.cmd run dev -- --host --open`) binding LAN access on port `5173`. |
| `vite.config.ts` | Vite 8 config + embedded `signalFloorLanBridge()` server middleware providing LAN IP detection, PC-Phone state sync (`/api/lan/state`), Windows `netsh` Wi-Fi RSSI/BSSID reading (`/api/lan/wifi-scan`, `/api/lan/net-diag`), and HTTP bandwidth benchmark endpoints (`/api/lan/speed-down`, `/api/lan/speed-up`). |
| `src/types/index.ts` | Core domain interfaces: `Room`, `ScanPoint`, `OperatorTelemetry`, `RulerMeasurement`. |
| `src/index.css` | Master design token sheet for all **6 UI Styles** (`neumorphism`, `liquid-glass`, `obsidian`, `cyber-carbon`, `te-field`, `aurora-velvet`), Light/Dark tokens, `@layer components` primitives, and `.stat-card` / `.canvas-well` surfaces. |
| `src/components/ui/Kit.tsx` | Shared UI primitives: `Button` (with `.btn-content`), `BrandMark`, `GlassCard`, `Badge`, `Segmented`, `Switch`, `Modal`, `ConfirmDialog`, `ToastContainer`. |
| `src/components/fx/FxCanvas.tsx` | Isolated 60 FPS `Float32Array` pooled background particle/mesh physics renderer. |
| `src/components/layout/` | Shell (`AppLayout.tsx`), `Topbar.tsx` (Theme modal trigger, `Phone / LAN` QR button, `Ctrl+K`, 3-way Scan Source switcher), `Sidebar.tsx`, `CommandPalette.tsx`, `FxStudioModal.tsx`, `PhoneConnectModal.tsx`. |
| `src/components/floorplan/` | `FloorMap.tsx` (heatmap + operator `YOU` + heading FOV + wayfinding + laser ruler), `FloorPlanCanvas.tsx` (Konva room draw/resize/router/ruler), `CameraScannerModal.tsx` (WebRTC + photo upload + scale reticle + pitch trig), `Legend.tsx`. |
| `src/pages/` | `Dashboard.tsx`, `FloorPlans.tsx`, `Scans.tsx` (Live Navigate + IMU pedometer + LAN sync), `Heatmap.tsx`, `Reports.tsx`, `Utilities.tsx` (Ping, Speed Test, Uptime, Least-Traffic Channel Advisor, SNR estimator). |
| `src/hooks/` | Reactive persisted hooks (`useFloor.ts`, `useScan.ts`, `useSettings.ts`, `useTheme.ts`, `useCanvasColors.ts`). |
| `src/lib/` | Pure logic modules: `analytics.ts` (`measureSpan` wall intersection & dB loss), `heatmap.ts` (IDW grid), `recommend.ts` (dead zones & extender spots), `spots.ts`, `scanner.ts`, `lan.ts`, `nettools.ts`, `qr.ts` (ISO 18004 QR SVG), `audio.ts`, `sounds.ts`, `toast.ts`, `workspace.ts`, `floor.ts`, `signal.ts`, `mock.ts`. |

---

## 2. How to Instruct Antigravity on Your Machine

If you ask Antigravity to add a feature, follow or paste these checkpoints:
1. **Plan First on Multi-File Features**: Let Antigravity inspect related hooks/components before editing so it reuses `GlassCard`, `Button`, `Badge`, `Segmented`, `useCanvasColors`, and `toast()`.
2. **Preserve All 6 Themes**: Never replace CSS variables with hardcoded hex colors (`#111`, `#fff`), or one of the 6 themes / Light mode will break.
3. **Never Bypass `oxlint` or `tsc -b`**:
   - Avoid calling `setState` synchronously inside `useEffect`.
   - Never call `localStorage.setItem` or `window.dispatchEvent` synchronously inside a `setState(prev => ...)` updater callback — mirror via `useRef` + `queueMicrotask`.
   - Use `npm.cmd run lint` and `npm.cmd run build` on Windows PowerShell.

---

## 3. Mandatory Verification Checklist

Before declaring any task finished:
```powershell
npm.cmd run lint    # Expect: Found 0 warnings and 0 errors
npm.cmd run build   # Expect: tsc -b && vite build exits 0
```
Also update `CHANGELOG.md` with a summary of what changed.
