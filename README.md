# Ocelot VR Experience

A Three.js application featuring procedurally generated voxel-style Ocelot cats on a blank horizon floor.

## Features

- Procedural generation of voxel-style Ocelot cats with different patterns
- Interactive spawning system via mouse clicks or keyboard
- Action system with simple cat behaviors: walking, sitting, jumping, stretching, and look-around
- Basic camera controls for viewing the scene
- Cursor and WebXR hand/controller interaction with cats (meow/purr reactions)
- Audio playlist system for background loops plus meow/purr sound effects
- Optimized for web browsers using Three.js

## Installation

```bash
npm install
```

## Usage

Start the development server:

```bash
npm run dev
```

Open your browser and navigate to `http://localhost:5173/`

## Controls

- **Mouse/Tap on floor**: Spawn an ocelot
- **Mouse/Tap on ocelot**: Interact with cat (reaction action + meow/purr SFX)
- **Spacebar**: Spawn an ocelot at the center of the scene
- **Arrow Keys (Left/Right)**: Rotate the camera view
- **Arrow Keys (Up/Down)**: Zoom camera
- **VR Button**: Enter WebXR mode (MetaQuest hand/controller interaction)
- **Window Resize**: Automatically adjusts to new window size

## Project Structure

```
src/
├── main.js              # Main application entry point
├── index.html           # HTML template
├── style.css            # Basic styles
├── components/
│   └── VoxelOcelot.js   # Procedural Ocelot generation
└── utils/
    └── MathUtils.js      # Helper functions (for future use)
```

## Technical Details

- **Three.js**: 3D rendering library
- **Vite**: Build tool and development server
- **Procedural Generation**: Ocelots are generated using BoxGeometry with randomized patterns
- **Animation**: Action state machine with reusable behavior animations
- **Interaction**: Pointer raycasting + XR controller/hand interaction hooks
- **Audio**: Ordered background loop playlist + meow/purr SFX categorization by file prefix

## Audio Assets

Store audio files in `src/assets/audio/`:

- `bg-*` files: background playlist entries (played in ascending filename order, looped)
- `meow-*` files: meow reaction SFX
- `purr-*` files: purr reaction SFX

The app preloads audio and attempts autoplay at 5% volume on load. Use the speaker icon to toggle mute/unmute.

## Ocelot Generation

The VoxelOcelot class procedurally generates cats using:
- BoxGeometry for body parts (torso, head, legs, tail)
- Randomized color patterns (3 different variations)
- Vertex coloring for spot patterns
- Different sizes and animations

## Future Enhancements

- More complex animations
- Multiple cat breeds
- Sound effects
- Improved interaction system
- VR implementation with WebXR
