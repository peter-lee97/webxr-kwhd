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
- **WebXR support** for VR/AR headsets with hand and controller interaction
- **WebGPU rendering** with automatic WebGL fallback for modern graphics acceleration
- **Renderer dashboard indicator** showing current graphics backend (🟢 WebGPU / 🟠 WebGL)
- HTTPS development server for secure WebXR contexts

## Installation

```bash
npm install
```

## Usage

Start the development server:

```bash
npm run dev
```

Open your browser and navigate to `https://localhost:5173/`

**Note:** The server runs on HTTPS using self-signed certificates. You'll need to accept the security warning on first load. For details, see [HTTPS_SETUP.md](./HTTPS_SETUP.md).

### Quick Certificate Generation

To generate HTTPS certificates automatically:

```bash
./generate-cert.sh
```

This creates `key.pem` and `cert.pem` files needed for HTTPS development.

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

- **Three.js**: 3D rendering library (v0.184.0+)
- **Vite**: Build tool and development server with HTTPS support
- **WebGPU/WebGL**: Automatic renderer detection and graceful fallback
- **WebXR**: VR/AR support with hand tracking and controller input
- **Procedural Generation**: Ocelots are generated using BoxGeometry with randomized patterns
- **Animation**: Action state machine with reusable behavior animations
- **Interaction**: Pointer raycasting + XR controller/hand interaction hooks
- **Audio**: Ordered background loop playlist + meow/purr SFX categorization by file prefix

### Browser Support

**WebGPU:**
- Chrome 113+
- Edge 113+
- Firefox (behind flags)
- Safari (experimental)

**WebXR:**
- Requires HTTPS in production
- Self-signed certificates work for localhost development
- Tested with MetaQuest headsets

**WebGL Fallback:**
- All modern browsers
- Automatic fallback when WebGPU unavailable

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
- Sound effects (beyond current meow/purr)
- Improved interaction system
- Multiplayer support for shared VR experiences
- Advanced VR locomotion techniques (teleportation, smooth turning)
- Environmental audio with spatial positioning
- Custom VR controller models and haptics feedback
