# VoxelOcelot

A procedurally-generated, animated Three.js voxel cat. Each instance is a fully self-contained entity with its own body geometry, colour pattern, personality, and per-frame animation state.

---

## Overview

`VoxelOcelot` builds a cat from `THREE.BoxGeometry` primitives grouped under a root `THREE.Group`. Vertex colours are written directly to geometry attributes to produce spots, rosettes, stripes, or marbled patterns at construction time. Every frame, `animate()` advances a simple action state machine and applies the corresponding pose/movement to the group hierarchy.

The exported `createOcelot(options)` factory is the intended entry point from `main.js`.

---

## Species

Five species are available, selected randomly or via `options.speciesType`:

| Index | Species | Pattern Style | Eye Colour |
|-------|-------------|---------------|------------|
| 0 | Ocelot | Rosette | Golden yellow |
| 1 | Snow Leopard | Rosette (large, faint) | Pale blue-gray |
| 2 | Cheetah | Solid spots | Amber |
| 3 | Serval | Dorsal stripes | Yellow-green |
| 4 | Bengal | Marbled | Green |

Each species defines colour palettes for body, ears, eyes, spots, accents, and belly, as well as tail pattern, tail length modifier, spot radius, and spot density modifier.

---

## Constructor

```js
new VoxelOcelot(options = {})
```

| Option | Type | Default | Description |
|---|---|---|---|
| `size` | `number` | `1` | Uniform scale multiplier for all geometry |
| `position` | `THREE.Vector3` | `(0,0,0)` | Initial world position |
| `boundarySize` | `number` | `45` | Half-extent of the roaming area |
| `speciesType` | `number` | random 0–4 | Selects a species profile |
| `pattern` | `number` | random | Index into the species colour palette |

Additional per-individual variation is randomised at construction: ear size, ear height, tail length, tail taper, tail lift, head width, spot density, and body length variance.

---

## Public Interface

### `group` *(THREE.Group)*

The root scene object. Add this to the Three.js scene:

```js
scene.add(ocelot.group);
```

### `animate(playerPos?)`

Call once per frame. Advances `animationTime`, runs the action state machine, restores the base pose, then applies the animation for the current action.

- `playerPos` — optional `THREE.Vector3` of the viewer/camera, used by personality behaviours.

### `interact(source?)`

Triggers an immediate interactive response (meow/purr + action change). Returns `{ sound, action }`.

- `source` — string hint; `'hand'` / `'controller'` sources produce a purr; others are random.
- Respects a 35-frame cooldown between interactions.

### `respondToWand(wandPosition)`

Points the cat's head toward a wand `THREE.Vector3` within 5 units. Triggers a jump if the wand comes within 2 units (2% chance per frame). Returns `'playful'`, `'interested'`, or `'neutral'`.

### `respondToLaserPointer(laserPosition)`

Similar to `respondToWand` but with a wider detection radius (10 units) and movement: the cat walks toward the laser when within 6 units. Returns `'playful'`, `'interested'`, or `'neutral'`.

### `notifyInteraction()`

Resets the clingy personality's attention timer when the ocelot is already `nearby` the player. Call whenever the user interacts with the world near a clingy cat.

### `getStatus()`

Returns `{ action: string }` — the current action name.

---

## Model Construction Methods

| Method | Description |
|---|---|
| `createBody()` | Creates the subdivided torso mesh and child belly strip |
| `createHead()` | Creates the head group: head box, snout, ears with inner ear, eyes with slit pupils, and nose |
| `createLegs()` | Creates four leg groups (each with a leg mesh and paw mesh) |
| `createTail()` | Creates 5–12 tapered tail segments with per-species colour patterns |

---

## Colour & Pattern Methods

| Method | Returns | Description |
|---|---|---|
| `getBodyColor()` | `number` (hex) | Primary coat colour from species palette |
| `getBellyColor()` | `number` | Belly/underside colour |
| `getEarColor()` | `number` | Outer ear colour (70% chance both ears match) |
| `getEyeColor()` | `number` | Iris colour |
| `getSpotColor()` | `number` | Primary spot/stripe colour |
| `getAccentColor()` | `number` | Secondary accent used in spot blending |
| `setColorPattern()` | `void` | Dispatches to stripe or spot painter based on species |
| `addSpotsToMesh(mesh, count, ...)` | `void` | Writes vertex colours for rosette, solid, or marbled spot styles |
| `addStripesToMesh(mesh, count, ...)` | `void` | Writes vertex colours as sinusoidal dorsal stripes |
| `getTailSegmentColor(i, total, ...)` | `number` | Returns the colour for tail segment `i` given the species tail pattern (`solid`, `ringed`, `banded`, `ringed_tip`, `gradient`) |

### Static

| Method | Returns | Description |
|---|---|---|
| `VoxelOcelot.getSpeciesProfiles()` | `Array` | Returns the array of five species profile objects |

---

## Pose & Movement Methods

| Method | Description |
|---|---|
| `captureBasePose()` | Snapshots all part positions/rotations into `this.basePose` at construction |
| `restoreBasePose()` | Resets all parts to the snapshot before applying the current animation |
| `pickRandomTarget()` | Sets `this.targetPosition` to a random point within bounds |
| `moveToTarget()` | Steps the group toward `targetPosition` by `movementSpeed`; switches to `idle` on arrival |
| `smoothRotateToTarget()` | Lerps `group.rotation.y` toward `this.targetRotation` at 5% per frame |

---

## Animation Methods

Called internally by `animate()` each frame.

| Method | Action trigger | Description |
|---|---|---|
| `applyCommonAnimation()` | Always | Breathing torso scale pulse; tail wave |
| `applyWalkingAnimation()` | `walking`, `zoomies` | Alternating leg bob |
| `applySitAnimation()` | `sit` | Lowers torso, splays rear legs, curls tail around the body |
| `applyJumpAnimation()` | `jump` | Sine-arc vertical jump over 1 second; reverts to `idle` on landing |
| `applyStretchAnimation()` | `stretch` | Elongates torso, extends head forward |
| `applyLookAroundAnimation()` | `lookAround`, `idle` | Sinusoidal head/ear rotation |

---

## Action State Machine

Managed by `updateActionState(playerPos)` and `chooseNextAction()`.

### Actions

| Action | Description |
|---|---|
| `idle` | Stands still, plays look-around animation |
| `walking` | Moves to a random target |
| `zoomies` | High-speed burst movement (active personality only) |
| `sit` | Sits with tail curled |
| `jump` | Short vertical leap |
| `stretch` | Elongates momentarily |
| `lookAround` | Head scans side to side |

### Personalities

Each instance is assigned one of three personalities at construction:

| Personality | Behaviour |
|---|---|
| `clingy` | Approaches the player when within 10 units, sits nearby, then walks away. Cycles through a state machine: `dormant → approaching → nearby → walking_away → cooling → dormant`. |
| `loner` | Flees from the player when within `lonerFleeRadius` (4–7 units). Stops fleeing once the player is 2× the flee radius away. |
| `active` | Higher base movement speed (0.04); frequently picks `walking` or `zoomies`; zoomies triple movement speed for a short burst. |

Personality state is updated via `updatePersonalityBehavior(playerPos)`, which delegates to `_updateClingy`, `_updateLoner`, or `_updateActive`.

---

## Factory Function

```js
import { createOcelot } from './components/VoxelOcelot.js';

const ocelot = createOcelot({ size: 1, position: new THREE.Vector3(0, 0, 0) });
scene.add(ocelot.group);

// In render loop:
ocelot.animate(camera.position);
```
