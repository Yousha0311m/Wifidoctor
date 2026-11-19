<!-- GEMINI.md | SignalFLoor | Engineering, design & backup governance rules -->
# SignalFloor — Engineering & Design Governance (`GEMINI.md`)

1. **Plan-First Execution**: Read `README.md`, `AGENTS.md`, and `.agent/rules/signalfloor-quality.md` before building multi-file changes. Follow approved plans sequentially and update `CHANGELOG.md` once verified.
2. **Zero Truncation or Placeholders**: Every file must be 100% complete and production-ready — strictly no `// TODO`, stubs, or unimplemented controls.
3. **File Header Standard**: Begin every new or edited source file with a single-line header: `// filename | SignalFLoor | short purpose`.
4. **Strict Modularity**: Keep clean boundaries between pages (`src/pages/`), UI primitives (`src/components/ui/Kit.tsx`), interactive Konva/physics canvases (`src/components/floorplan/`, `src/components/fx/`), procedural audio (`src/lib/audio.ts`, `src/lib/sounds.ts`), network/LAN helpers (`src/lib/lan.ts`, `src/lib/nettools.ts`, `src/lib/qr.ts`), and localStorage hooks (`src/hooks/`).
5. **Backup & Safe Patching**: Copy target files into `_backup/` before editing (`_backup/` stays ignored in `.gitignore`). Keep attribution cleanly to **Geymars**.
6. **Multi-Theme CSS, React 19 & Audio Standard**:
   - Preserve semantic CSS variables (`--bg`, `--panel`, `--panel-2`, `--line`, `--ink`, `--muted`, `--accent`, `--accent-2`, `--strong`, `--fair`, `--weak`) across all 6 UI Styles (`neumorphism`, `liquid-glass`, `obsidian`, `cyber-carbon`, `te-field`, `aurora-velvet`) and Dark/Light themes so Konva (`useCanvasColors`) and Recharts stay synchronized.
   - Keep custom component CSS inside `@layer components` in `src/index.css` so Tailwind v4 utility classes never lose specificity.
   - Wrap button children inside `<Button>` (`.btn-content`) and use vector icons only (`lucide-react` / inline SVG); zero emojis anywhere in the UI.
   - Never call `localStorage.setItem` / `window.dispatchEvent` inside a React `setState(prev => ...)` updater; never call `setState` synchronously inside `useEffect`.
   - Use non-blocking `toast()` and `<ConfirmDialog>` instead of `window.confirm` / `alert`.
7. **Verification Commands (Windows PowerShell — Always use `npm.cmd`)**:
   - Run `npm.cmd run lint` (target: `Found 0 warnings and 0 errors`) and `npm.cmd run build` (`tsc -b && vite build`, exit `0`) after any change.
   - Start the LAN-enabled workspace via `start.bat` (`npm.cmd run dev -- --host --open`).
