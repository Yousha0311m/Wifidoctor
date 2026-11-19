<!-- ui-themes-reference.md | SignalFLoor | Downloaded & curated CSS architecture reference for multi-engine UI themes -->
# SignalFloor UI Design System Reference (`docs/ui-themes-reference.md`)

This document captures the extracted visual design systems and tokenized CSS architectures implemented inside **SignalFloor** (`src/index.css` & `src/hooks/useSettings.ts`). Each theme switches live via `document.documentElement.dataset.uiStyle` combined with `[data-theme="dark" | "light"]`.

---

## 1. Neumorphism (Extruded & Inset Soft UI)
**Core principle:** Surfaces share the exact tonal base color of the canvas (`--bg`) and define spatial elevation exclusively with **dual-opposing directional box shadows** (top-left light source + bottom-right ambient shadow) rather than translucent borders. Interactive controls toggle from **extruded** (`outset`) at rest to **carved** (`inset`) when active/pressed or housing recessed inputs and Konva canvas wells.

- **Dark Mode Palette**:
  - Base Surface (`--bg`, `--neu-bg`): `#1d2128`
  - Ambient Dark Shadow (`--neu-dark`): `#111419`
  - Top-Left Rim Highlight (`--neu-light`): `#292f39`
  - Extruded Card: `9px 9px 18px var(--neu-dark), -9px -9px 18px var(--neu-light)`
  - Extruded Button: `5px 5px 11px var(--neu-dark), -5px -5px 11px var(--neu-light)`
  - Carved Inset (`.input`, `.segmented`, `.nav-indicator`, `.canvas-well`, `:active`): `inset 5px 5px 10px var(--neu-dark), inset -5px -5px 10px var(--neu-light)`
- **Light Mode Palette**:
  - Base Surface (`--bg`, `--neu-bg`): `#e0e5ec`
  - Ambient Dark Shadow (`--neu-dark`): `#b8bec7`
  - Top-Left Rim Highlight (`--neu-light`): `#ffffff`
- **WCAG Accessibility Rule**: Never dim text tones (`#f3f5f8` dark / `#182230` light) and always preserve crisp `:focus-visible` outlines.

---

## 2. Refractive Liquid Glass
**Core principle:** Optical glass planes using high-saturation `backdrop-filter: blur(38px) saturate(185%)`, deeper `24px` pill radii, top-edge bright specular refraction (`inset 0 1.5px 0 rgba(255,255,255,0.34)`), bottom bounce rim (`inset 0 -1px 0 rgba(255,255,255,0.12)`), and cool ambient caustic orbs drifting softly beneath.

---

## 3. Obsidian Glass (Account Manager Reference Theme)
**Core principle:** Monochrome charcoal obsidian (`#050506` -> `#0a0a0c`), frosted `--glass-1..3` planes, `inset 0 1px 0 rgba(255,255,255,0.08)` top rims, brushed-silver convex primary CTAs (`linear-gradient(180deg, #fafafa 0%, #d4d4d8 100%)` with dark `#0b0b0d` label), and functional-only semantic color tokens (`--ok: #34d399`, `--warn: #fbbf24`, `--err: #f87171`).

---

## 4. 3K Cyber Carbon
**Core principle:** Woven 45°/135° carbon-fiber micro-weave background with sharp `8px` technical corners, dark anodized frames (`#0c0d10`), and sharp luminous accent borders (`var(--accent)`).

---

## 5. Field Hardware (TE Tactile Utility)
**Core principle:** Warm matte graphite (`#202124` dark / `#dcdad3` light), subtle engineering grid underlay, high-visibility International Orange (`#ff5722`) primary triggers, and physical 3D mechanical keycap bevels (`0 3px 0 #090a0b`) that depress `translateY(2px)` when clicked.

---

## 6. Aurora Velvet
**Core principle:** Deep midnight indigo base (`#070914`) layered under rich multi-stop violet/teal/emerald aurora gradient washes and low-haze velvet-tinted translucent containers.
