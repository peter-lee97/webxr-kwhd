# Copilot Instructions for `webxr-kwhd`

## Build, test, and lint commands

This project uses npm scripts from `package.json`:

- `npm run dev` — start Vite dev server (default: `http://localhost:5173`)
- `npm run build` — production build via Vite
- `npm run preview` — preview the production build locally

There are currently no test or lint scripts configured in this repository, and no test framework config files are present.

When adding new scripts, keep command names explicit and readable (`test`, `test:unit`, `lint`) so future Copilot sessions can map intent to scripts quickly.

## High-level architecture

The app is a small Three.js ES-module project with one main runtime module and one domain component. It follows a reusable composition pattern where `main.js` orchestrates lifecycle and each scene entity encapsulates its own model + animation behavior.

- `index.html` defines the HUD (`#info`, `#dashboard`) and loads `/src/main.js` and `/src/style.css`.
- `src/main.js` owns app lifecycle and global scene state:
  - initializes `scene`, `camera`, `renderer`, lights, and floor
  - detects device type (desktop/mobile) and binds corresponding input listeners
  - handles spawning logic (click/tap raycast to floor, keyboard shortcuts)
  - maintains the `ocelots` array and updates dashboard count
  - runs the render loop and calls `ocelot.animate()` every frame
- `src/components/VoxelOcelot.js` contains the procedural ocelot model and behavior:
  - `VoxelOcelot` builds voxel body parts into a `THREE.Group`
  - applies randomized pattern colors/spots
  - updates roaming + animation state per frame
  - exports `createOcelot(options)` factory used by `main.js`
- `src/style.css` styles HUD overlays and keeps canvas full-screen.

Data flow is one-way from `main.js` to component instances: `main.js` creates ocelots and drives per-frame updates; component instances expose `group` (for scene insertion) and `animate()` (for frame updates). Keep this contract for reusable entity modules.

## Key conventions in this codebase

- Keep runtime in plain browser ES modules (no framework/state library); main orchestration stays in `src/main.js`.
- New creature-like scene objects should follow the same integration contract as `VoxelOcelot`: return an object with:
  - `group` (`THREE.Group` ready to `scene.add`)
  - `animate()` (called each frame from the main loop)
- Prefer readable, named functions and straightforward control flow over compact or clever logic in rendering/input code.
- Input model is intentionally device-specific and set once at init via `detectDevice()` + `setupControls()`; preserve this split when adding controls.
- Click-to-spawn uses floor raycasting and drag suppression (`hasDragged`) to avoid accidental spawns while rotating camera.
- Spawns are clamped in `main.js` to scene bounds (`boundarySize` with margin); keep clamping logic in spawn handling, not inside rendering loop.

## Design Context

### Users
Primary users are people exploring a virtual forest environment with voxel-style Ocelot cats. They're looking for an immersive VR experience where they can interact with the cats and explore the environment.

### Brand Personality
Immersive, Natural, Playful

### Aesthetic Direction
The interface should be non-obtrusive and minimal, allowing users to focus entirely on the 3D forest environment and cat interactions. Visual elements should blend naturally with the forest theme without competing for attention.

References: Nature-focused VR experiences, minimalist UI that disappears when not needed
Anti-references: Cluttered game interfaces, heavy UI overlays that distract from the 3D experience

### Design Principles
1. **Minimal Interface** - UI elements should be subtle and only appear when needed
2. **Nature Integration** - All UI should complement the forest environment, not compete with it
3. **Immersive Priority** - The 3D scene is the primary focus; UI supports but never overshadows it
4. **Functional Simplicity** - Controls and information should be intuitive and unobtrusive
5. **Seamless VR Transition** - UI should work equally well in both desktop and VR modes