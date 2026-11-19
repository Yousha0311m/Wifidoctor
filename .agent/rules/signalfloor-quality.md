---
trigger: always_on
description: SignalFloor production UI, multi-theme CSS, React 19, Konva, TypeScript 7, and verification standards for Antigravity.
---

# SignalFloor Engineering & UI Quality Rule

Every edit inside this repository MUST match the production quality bar already established in **SignalFloor**:

## 1. Zero Stubs, Complete Delivery & File Discipline
- **No placeholders**: Never leave `// TODO`, `FIXME`, stub functions, mocked broken buttons, or truncated outputs. Ship working end-to-end features.
- **Single-line header comment**: Every new or meaningfully modified `.ts`, `.tsx`, `.css`, `.bat`, or `.md` file must begin with a concise one-line header: `// filename | SignalFLoor | short purpose`.
- **Safe backups**: Before editing existing source files, copy originals into `_backup/` (listed in `.gitignore`).
- **Update changelog**: Append a clear bullet summary to `CHANGELOG.md` when completing significant features or fixes.
- **Attribution & cleanliness**: Keep product credits to **Geymars** (`Built by Geymars`), never commit secrets or personal machine tokens, and never add emoji characters to the UI (use `lucide-react` or crisp inline `<svg>` vector icons only).

## 2. React 19, TypeScript 7 & `oxlint` Hard Rules
These codebase patterns are enforced strictly by `tsconfig.app.json` and `.oxlintrc.json` — breaking them fails `lint` or triggers React runtime warnings:
1. **No synchronous `setState` inside `useEffect`** (`oxlint` `react(set-state-in-effect)`):
   - Use lazy `useState(() => loadInitialValue())` instead of calling `setState(...)` directly in an effect body.
   - Defer async initial fetches cleanly with `setTimeout(() => void fetchFn(), 20)` inside `useEffect` and clear the timer on cleanup.
2. **No side effects inside `setState(prev => ...)` updaters**:
   - Never call `localStorage.setItem(...)` or `window.dispatchEvent(...)` synchronously inside a state updater (causes React 19 cross-component render updates).
   - Mirror state in a `useRef`, compute `next`, update ref + `setState(next)`, then run storage writes/custom events inside `queueMicrotask(() => ...)`. See `src/hooks/useFloor.ts`, `src/hooks/useScan.ts`, and `src/hooks/useSettings.ts` for the exact pattern.
3. **Strict `react/only-export-components`**:
   - Put pure math, constants, presets, storage helpers, and TypeScript types in `src/lib/*.ts` or `src/types/index.ts`, leaving `.tsx` files focused on React components.
4. **TypeScript 7 strict flags**:
   - `verbatimModuleSyntax: true`: use `import type { ... }` for types.
   - `erasableSyntaxOnly: true`: never use TypeScript `enum` or parameter properties in constructors; use `type Foo = 'a' | 'b'` union types.
   - `noUnusedLocals: true`, `noUnusedParameters: true`: remove unused imports/variables.

## 3. UI Architecture, Multi-Theme Tokens & Tailwind v4 Rules
- **`@layer components` protection (`src/index.css`)**:
  - Custom component classes (`.btn`, `.panel.glass`, `.tb-pill`, `.segmented`, `.chip`, `.modal`) MUST live inside `@layer components` so Tailwind v4 `@layer utilities` (`hidden`, `sm:inline`, `ml-auto`, etc.) work properly without CSS specificity collisions.
- **Button icon alignment**:
  - Always use `<Button>` from `@/components/ui/Kit` (wraps children in `<span className="btn-content">` with `display: inline-flex; align-items: center; gap: 7px`) so icons never stack above labels.
- **Never hardcode light/dark colors**:
  - Use CSS variables (`--bg`, `--panel`, `--panel-2`, `--edge`, `--edge-strong`, `--text`, `--text-2`, `--text-3`, `--accent`, `--accent-2`, `--strong`, `--fair`, `--weak`, `--ok-text`, `--warn-text`, `--err-text`) so all **6 UI themes** (`neumorphism`, `liquid-glass`, `obsidian`, `cyber-carbon`, `te-field`, `aurora-velvet`) and both Dark/Light themes render consistently.
  - Konva canvases MUST read colors via `useCanvasColors()` (`src/hooks/useCanvasColors.ts`) rather than hardcoded hex strings.
- **Non-blocking feedback only**:
  - Use `toast(msg, level)` (`info` | `success` | `warn` | `error`) and `<ConfirmDialog>` / `<Modal>` instead of `window.alert` or `window.confirm`.

## 4. Konva Canvas & Interactive UX Rules
- Clamp drag and resize bounds inside `0..CANVAS_W` (`1000`) and `0..CANVAS_H` (`600`), grid scale `50px = 1 meter`, 10px snap.
- Keep room name labels anchored cleanly in the top-left corner pill (`x: 8, y: 8`) so center-mounted pins (Router, Operator `YOU`, Extenders) never collide with room titles.

## 5. Verification Before Finishing (Mandatory)
On Windows PowerShell, always run `npm.cmd` (not `npm`):
1. `npm.cmd run lint` -> must output `Found 0 warnings and 0 errors` (`exit 0`).
2. `npm.cmd run build` -> runs `tsc -b && vite build` (`exit 0`).
3. If editing `vite.config.ts` server endpoints (`/api/lan/*`), start Vite briefly and verify the modified endpoint responds with HTTP `200` JSON before shutting the test process down.
