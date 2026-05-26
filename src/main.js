import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/examples/jsm/webxr/XRHandModelFactory.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import * as CANNON from 'cannon-es';
import { createOcelot } from './components/VoxelOcelot.js';
import { createButterfly } from './components/VoxelButterfly.js';
import { createBlackHeadedGrosbeak } from './components/VoxelBlackHeadedGrosbeak.js';
import { AudioManager } from './audio/AudioManager.js';
import { Environment } from './components/Environment.js';
import { ControlsPopup } from './components/ControlsPopup.js';

// Barrel distortion shader simulating a wide-angle (28mm) lens
const BarrelDistortionShader = {
    uniforms: {
        tDiffuse: { value: null },
        k0: { value: 0.0 },
        k1: { value: 0.24 },
        k2: { value: 0.06 },
        vignette: { value: 0.0 },
        zoom: { value: 1.0 },
        strength: { value: 0.0 },
    },
    vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse;
        uniform float k0;
        uniform float k1;
        uniform float k2;
        uniform float vignette;
        uniform float zoom;
        uniform float strength;
        varying vec2 vUv;

        vec2 distort(vec2 uv) {
            vec2 p = (uv - 0.5) * zoom;
            float r = length(p);
            float r2 = dot(p, p);
            float barrel = 1.0 + strength * (k0 * r + k1 * r2 + k2 * r2 * r2);
            return p * barrel + 0.5;
        }

        void main() {
            vec2 distortedUv = mix(vUv, distort(vUv), strength);
            vec2 finalUv = clamp(distortedUv, vec2(0.001), vec2(0.999));
            vec4 color = texture2D(tDiffuse, finalUv);

            vec2 vignetteUv = (vUv - 0.5) * 1.6;
            float vignetteMask = smoothstep(0.10, 0.85, dot(vignetteUv, vignetteUv));
            color.rgb *= 1.0 - (vignette * vignetteMask);

            gl_FragColor = color;
        }
    `
};

let scene, camera, renderer, cameraRig;
let ocelots = [];
let butterflies = [];
let grosbeaks = [];
let environment; // Add environment reference
let floor;
let cameraAngle = 0;
let cameraRadius = 15;
let cameraHeight = 8;
const boundarySize = 45;
let currentRenderer = null;
let rendererType = 'unknown';
let controlsPopup = null;
let dashboardCollapsed = true;

// VR locomotion constants
const VR_MOVE_SPEED = 3;    // metres per second
const VR_LOOK_SPEED = 1.5;  // radians per second
const VR_DEAD_ZONE = 0.15;  // thumbstick dead zone
let lastFrameTime = 0;
let deviceType = 'desktop';
let isDragging = false;
let hasDragged = false;
let previousMousePosition = { x: 0, y: 0 };
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const xrDirectionMatrix = new THREE.Matrix4();
const xrRayOrigin = new THREE.Vector3();
const xrRayDirection = new THREE.Vector3();
const xrCollisionPadding = 0.4;
const ocelotMeshes = [];
const ocelotMeshToEntity = new Map();
const butterflyMeshes = [];
const butterflyMeshToEntity = new Map();
const grosbeakMeshes = [];
const grosbeakMeshToEntity = new Map();
const pickableMeshToTarget = new Map();
const xrControllers = [];
const xrHands = [];
const xrInteractionCooldown = new Map();
let suppressNextClickInteraction = false;
let physicsWorld = null;
const entityPhysicsStates = new Map();
const worldUp = new CANNON.Vec3(0, 1, 0);
const tmpWorldVec3 = new THREE.Vector3();
const tmpWorldQuat = new THREE.Quaternion();
const tmpYawEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const tmpScreenPlaneHit = new THREE.Vector3();
const tmpControllerPos = new THREE.Vector3();
const tmpHandPos = new THREE.Vector3();
const tmpCameraDirection = new THREE.Vector3();
const velocityScratch = new THREE.Vector3();
const releaseMotionScratch = new THREE.Vector3();
const DESKTOP_GRAB_MIN_HOLD_DISTANCE = 1.5;
const DESKTOP_GRAB_MAX_HOLD_DISTANCE = 20;
const STILL_RELEASE_LOOKBACK_MS = 120;
const STILL_RELEASE_MAX_SPEED = 0.65;
const STILL_RELEASE_MAX_DISPLACEMENT = 0.08;
const STILL_RELEASE_HORIZONTAL_DAMPING = 0.05;
const HOLD_TO_DRAG_DELAY_MS = 500;
const AUTO_RELEASE_HOLD_MS = 3000;
const HELD_PULSE_DURATION_MS = 240;
const HELD_PULSE_HEIGHT = 0.12;
const HELD_SCALE_BOOST = 0.035;
const HELD_GLOW_OPACITY = 0.24;
const desktopGrabState = {
    active: false,
    sourceId: 'desktop-pointer',
    target: null,
    holdDistance: 0,
    localOffset: new THREE.Vector3(),
    pointer: { x: 0, y: 0 },
    history: [],
    startedAt: 0
};
const pendingDesktopInteraction = {
    active: false,
    target: null,
    pointerX: 0,
    pointerY: 0,
    holdDistance: 0,
    localOffset: new THREE.Vector3(),
    timerId: null
};
const xrGrabStates = new Map();
const pendingXRInteractions = new Map();
const heldVisualStates = new Map();
let audioManager;
let lastInteractionLabel = 'none';
let standardAnimationFrameId = null;
let audioState = {
    isPlaying: false,
    isMuted: false,
    status: 'Ready',
    trackName: 'none'
};

// Camera capture state variables
let cameraViewfinderActive = false;
let mobileQuickPanelOpen = false;

// Mobile joystick state
const joystickState = { active: false, dx: 0, dy: 0 };
let captureCounter = 0; // For incremental folder naming
const viewfinderOverlay = document.getElementById('viewfinder-overlay');
const captureFlash = document.getElementById('capture-flash');
const lensLabel = document.getElementById('vf-lens-label');

// Lens effect state
const DEFAULT_FOV = 75; // baseline scene camera when viewfinder is off
const LENS_PRESETS = [
    { label: '150MM', fov: 30, strength: 0.0, k0: 0.0, k1: 0.0, k2: 0.0, zoom: 1.0, vignette: 0.0 },
    { label: '50MM', fov: 75, strength: 0.0, k0: 0.0, k1: 0.0, k2: 0.0, zoom: 1.0, vignette: 0.0 },
    { label: '24MM', fov: 98, strength: 1.0, k0: 0.02, k1: 0.24, k2: 0.06, zoom: 0.85, vignette: 0.08 },
    { label: '18MM', fov: 112, strength: 1.4, k0: 0.24, k1: 0.48, k2: 0.18, zoom: 0.67, vignette: 0.26 }
];
let activeLensIndex = -1;
let targetFov = DEFAULT_FOV;
let currentFov = DEFAULT_FOV;
let targetLensStrength = 0.0;
let targetLensK0 = 0.0;
let targetLensK1 = 0.0;
let targetLensK2 = 0.0;
let targetLensZoom = 1.0;
let targetLensVignette = 0.0;
let wideAngleComposer = null;
let wideAnglePass = null;
let heldGlowTexture = null;

function applyLensPreset(index) {
    activeLensIndex = index;
    cameraViewfinderActive = index >= 0;
    viewfinderOverlay.style.display = cameraViewfinderActive ? 'block' : 'none';
    document.body.classList.toggle('viewfinder-active', cameraViewfinderActive);
    if (deviceType === 'mobile' && cameraViewfinderActive) {
        setMobileQuickPanelOpen(false);
    }

    if (!cameraViewfinderActive) {
        targetFov = DEFAULT_FOV;
        targetLensStrength = 0.0;
        targetLensK0 = 0.0;
        targetLensK1 = 0.0;
        targetLensK2 = 0.0;
        targetLensZoom = 1.0;
        targetLensVignette = 0.0;
        if (lensLabel) lensLabel.textContent = 'OFF';
        syncMobileHud();
        return;
    }

    const preset = LENS_PRESETS[index];
    targetFov = preset.fov;
    targetLensStrength = preset.strength;
    targetLensK0 = preset.k0;
    targetLensK1 = preset.k1;
    targetLensK2 = preset.k2;
    targetLensZoom = preset.zoom;
    targetLensVignette = preset.vignette;

    if (lensLabel) lensLabel.textContent = preset.label;
    syncMobileHud();
}

function cycleLensMode() {
    const nextLensIndex = activeLensIndex >= LENS_PRESETS.length - 1 ? -1 : activeLensIndex + 1;
    applyLensPreset(nextLensIndex);
}

function toggleViewfinder() {
    cycleLensMode();
}

function updateViewfinderHudHint() {
    const hint = document.getElementById('vf-hud-hint');
    if (!hint) return;

    hint.textContent = deviceType === 'mobile'
        ? 'Camera button · capture  |  Eye button · cycle lens'
        : 'SPACE · capture  |  C · cycle lens';
}

function getHeldGlowTexture() {
    if (heldGlowTexture) return heldGlowTexture;

    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(
        size * 0.5, size * 0.5, size * 0.08,
        size * 0.5, size * 0.5, size * 0.5
    );
    gradient.addColorStop(0, 'rgba(255, 252, 235, 0.9)');
    gradient.addColorStop(0.35, 'rgba(210, 236, 190, 0.45)');
    gradient.addColorStop(0.7, 'rgba(150, 190, 120, 0.12)');
    gradient.addColorStop(1, 'rgba(150, 190, 120, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    heldGlowTexture = new THREE.CanvasTexture(canvas);
    return heldGlowTexture;
}

function setMobileQuickPanelOpen(isOpen) {
    mobileQuickPanelOpen = Boolean(isOpen);

    const panel = document.getElementById('mobile-quick-panel');
    const toggle = document.getElementById('mob-panel-toggle');

    if (panel) {
        panel.classList.toggle('open', mobileQuickPanelOpen);
        panel.setAttribute('aria-hidden', String(!mobileQuickPanelOpen));
    }

    if (toggle) {
        toggle.classList.toggle('active', mobileQuickPanelOpen);
        toggle.setAttribute('aria-expanded', String(mobileQuickPanelOpen));
    }

    document.body.classList.toggle('mobile-panel-open', mobileQuickPanelOpen);
}

function syncMobileHud() {
    const viewfinderButton = document.getElementById('mob-viewfinder');
    const captureButton = document.getElementById('mob-capture');

    if (viewfinderButton) {
        viewfinderButton.classList.toggle('active', cameraViewfinderActive);
    }

    if (captureButton) {
        const shouldShowCapture = deviceType === 'mobile' && cameraViewfinderActive;
        captureButton.hidden = !shouldShowCapture;
        captureButton.setAttribute('aria-hidden', String(!shouldShowCapture));
    }

    updateViewfinderHudHint();
}

function syncMobilePanel() {
    const mobileAudioLabel = document.getElementById('mobile-audio-label');

    if (mobileAudioLabel) {
        mobileAudioLabel.textContent = audioState.isMuted
            ? 'Muted'
            : audioState.status;
    }
}

function initWideAngleLens() {
    // Only available with WebGL renderer (not WebGPU)
    if (rendererType !== 'WebGL') return;

    wideAngleComposer = new EffectComposer(renderer);
    wideAngleComposer.setPixelRatio(window.devicePixelRatio);
    wideAngleComposer.addPass(new RenderPass(scene, camera));

    wideAnglePass = new ShaderPass(BarrelDistortionShader);
    wideAnglePass.uniforms.strength.value = 0.0;
    wideAnglePass.uniforms.k0.value = 0.0;
    wideAnglePass.uniforms.k1.value = 0.0;
    wideAnglePass.uniforms.k2.value = 0.0;
    wideAnglePass.uniforms.vignette.value = 0.0;
    wideAnglePass.uniforms.zoom.value = 1.0;
    wideAngleComposer.addPass(wideAnglePass);
    wideAngleComposer.addPass(new OutputPass());
}

async function captureScene() {
    captureFlash.style.display = 'block';
    audioManager.playShutter();
    
    captureCounter++;
    const name = `capture_${captureCounter.toString().padStart(3, '0')}`;
    
    const countEl = document.getElementById('vf-capture-count');
    if (countEl) countEl.textContent = captureCounter.toString().padStart(3, '0');
    
    if (cameraViewfinderActive && wideAngleComposer) {
        wideAngleComposer.render();
    } else {
        renderer.render(scene, camera);
    }
    const dataUrl = renderer.domElement.toDataURL('image/png');
    
    try {
        const res = await fetch('/save-capture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, dataUrl })
        });
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        const { file } = await res.json();
        console.log(`Capture saved: ${file}`);
    } catch (err) {
        console.warn('Could not save to server, falling back to download:', err);
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `${name}.png`;
        link.click();
    }
    
    setTimeout(() => {
        captureFlash.style.display = 'none';
    }, 150);
}

function detectDevice() {
    const hasPointer = matchMedia('(pointer: fine)').matches;
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                     (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    
    if (hasTouch || isMobile) {
        deviceType = 'mobile';
    } else if (hasPointer) {
        deviceType = 'desktop';
    } else {
        deviceType = 'mobile';
    }
    
    console.log('Detected device type:', deviceType);
}

async function init() {
    console.log('Initializing application...');
    const container = document.body;
    
    detectDevice();
    console.log('Device type detected:', deviceType);
    
    // Initialize controls popup
    controlsPopup = new ControlsPopup(deviceType);
    
    // Show controls button for desktop devices
    if (deviceType === 'desktop') {
        const controlsToggle = document.getElementById('controls-toggle');
        controlsToggle.classList.add('visible');
    } else if (deviceType === 'mobile') {
        setupMobileControls();
        setupOrientationHandler();
    }
    
    // Initialize scene first
    scene = new THREE.Scene();
    if (!scene) {
        console.error('Failed to create scene');
        displayFatalError('Failed to initialize 3D scene');
        return;
    }
    console.log('Scene created successfully');
    initPhysicsWorld();
    
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 20, 100); // Sky blue fog to match background
    
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, cameraHeight, cameraRadius);
    camera.lookAt(0, 0, 0);
    
    // Camera rig: wraps camera so VR locomotion can move/rotate the player
    cameraRig = new THREE.Group();
    cameraRig.add(camera);
    scene.add(cameraRig);
    
    // Initialize renderer with WebGPU support
    try {
        currentRenderer = await initializeRenderer();
        renderer = currentRenderer;
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        renderer.xr.enabled = true;
        renderer.domElement.classList.add('scene-canvas');
        
        container.appendChild(renderer.domElement);
        console.log('Renderer created successfully');

        // Initialize wide-angle lens post-processing (WebGL only)
        initWideAngleLens();
    } catch (error) {
        console.error('Failed to initialize renderer:', error);
        displayFatalError(`Failed to initialize renderer: ${error.message}`);
        return;
    }
    
    // Verify renderer was created successfully
    if (!renderer) {
        console.error('Renderer not available');
        displayFatalError('Failed to create 3D renderer');
        return;
    }
    
    // Add VR button with error handling
    try {
        document.body.appendChild(VRButton.createButton(renderer, {
            optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
        }));
    } catch (error) {
        console.warn('Failed to create VR button:', error);
        // Create a simple fallback button
        const fallbackButton = document.createElement('button');
        fallbackButton.textContent = 'VR Not Available';
        fallbackButton.style.position = 'absolute';
        fallbackButton.style.bottom = '20px';
        fallbackButton.style.left = '20px';
        fallbackButton.style.padding = '10px';
        fallbackButton.style.background = 'rgba(18, 52, 18, 0.7)';
        fallbackButton.style.color = '#a0c0a0';
        fallbackButton.style.border = '1px solid #3a8a3a';
        fallbackButton.style.borderRadius = '4px';
        fallbackButton.style.zIndex = '1000';
        fallbackButton.style.fontFamily = '-apple-system, BlinkMacSystemFont, sans-serif';
        fallbackButton.style.fontSize = '12px';
        fallbackButton.disabled = true;
        document.body.appendChild(fallbackButton);
    }
    
    const ambientLight = new THREE.AmbientLight(0x406040, 0.8); // More greenish ambient light for forest
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
    directionalLight.position.set(15, 25, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 100;
    directionalLight.shadow.camera.left = -50;
    directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -50;
    scene.add(directionalLight);
    
    // Create environment instead of simple floor
    console.log('Creating environment...');
    try {
        environment = new Environment(scene);
        console.log('Environment created successfully');
    } catch (error) {
        console.error('Failed to create environment:', error);
        // Don't stop execution, environment is optional
    }
    
    setupXRInteraction();
    
    setupControls();
    
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('click', onMouseClick);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    
    // Add event listener for dashboard toggle
    document.getElementById('toggle-dashboard').addEventListener('click', toggleDashboard);
    
    // Add event listener for controls toggle button
    document.getElementById('controls-toggle').addEventListener('click', () => {
        if (controlsPopup) {
            controlsPopup.show();
        }
    });
    
    // Initialize dashboard to collapsed state
    initializeDashboard();
    
    try {
        audioManager = new AudioManager(state => {
            audioState = state;
            syncMobilePanel();
        });
        audioManager.attachControls({
            toggleButton: document.getElementById('audio-toggle'),
            statusLabel: document.getElementById('audio-status')
        });
        audioManager.tryAutoplayOnLoad();
    } catch (error) {
        console.error('Failed to initialize audio:', error);
        // Continue without audio
    }
    
    // Evenly distribute cats across the map using a jittered grid.
    // Pick a grid size large enough to hold 4–8 cats; place one per cell with random offset.
    const catCount = 4 + Math.floor(Math.random() * 5); // 4–8 cats
    const cols = Math.ceil(Math.sqrt(catCount));
    const rows = Math.ceil(catCount / cols);
    const margin = 4; // keep cats away from edge
    const usable = boundarySize - margin * 2;
    const cellW = usable / cols;
    const cellH = usable / rows;
    let spawned = 0;
    for (let row = 0; row < rows && spawned < catCount; row++) {
        for (let col = 0; col < cols && spawned < catCount; col++) {
            const x = -usable / 2 + col * cellW + cellW * (0.2 + Math.random() * 0.6);
            const z = -usable / 2 + row * cellH + cellH * (0.2 + Math.random() * 0.6);
            spawnOcelot(x, z);
            spawned++;
        }
    }
    console.log(`Spawned ${catCount} cats`);
    
    // Seed the scene with ambient butterflies
    const butterflyCount = 10 + Math.floor(Math.random() * 6); // 10–15
    for (let i = 0; i < butterflyCount; i++) {
        const x = (Math.random() - 0.5) * boundarySize;
        const z = (Math.random() - 0.5) * boundarySize;
        spawnButterfly(x, z);
    }
    console.log(`Spawned ${butterflyCount} butterflies`);

    const grosbeakCount = 2 + Math.floor(Math.random() * 3); // 2-4
    const grosbeakSpawnHalf = boundarySize / 2 - 5;
    for (let i = 0; i < grosbeakCount; i++) {
        const x = THREE.MathUtils.randFloat(-grosbeakSpawnHalf, grosbeakSpawnHalf);
        const z = THREE.MathUtils.randFloat(-grosbeakSpawnHalf, grosbeakSpawnHalf);
        spawnGrosbeak(x, z);
    }
    console.log(`Spawned ${grosbeakCount} grosbeaks`);
    
    updateControlInstructions();
    updateDashboard();
    syncMobileHud();
    syncMobilePanel();
    startStandardRenderLoop();
    
    renderer.xr.addEventListener('sessionstart', () => {
        stopStandardRenderLoop();
        renderer.setAnimationLoop(renderFrame);
    });
    
    renderer.xr.addEventListener('sessionend', () => {
        for (const sourceId of pendingXRInteractions.keys()) {
            clearPendingXRInteraction(sourceId);
        }
        for (const sourceId of xrGrabStates.keys()) {
            endGrab(sourceId, new THREE.Vector3(0, 0, 0));
        }
        renderer.setAnimationLoop(null);
        startStandardRenderLoop();
    });
    
    console.log('Initialization complete');
}

function displayFatalError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.style.position = 'fixed';
    errorDiv.style.top = '0';
    errorDiv.style.left = '0';
    errorDiv.style.width = '100%';
    errorDiv.style.height = '100%';
    errorDiv.style.backgroundColor = 'rgba(8, 28, 8, 0.9)';
    errorDiv.style.color = '#d0e0d0';
    errorDiv.style.display = 'flex';
    errorDiv.style.flexDirection = 'column';
    errorDiv.style.alignItems = 'center';
    errorDiv.style.justifyContent = 'center';
    errorDiv.style.fontSize = '18px';
    errorDiv.style.zIndex = '9999';
    errorDiv.style.fontFamily = '-apple-system, BlinkMacSystemFont, sans-serif';
    errorDiv.innerHTML = `
        <h2 style="color: #a0c0a0; margin-bottom: 20px;">Application Error</h2>
        <p style="margin-bottom: 10px;">${message}</p>
        <p style="margin-bottom: 20px; font-size: 14px; color: #80a080;">Please check the browser console for more details.</p>
        <button onclick="location.reload()" style="padding: 8px 16px; background: rgba(58, 138, 58, 0.3); color: #a0c0a0; border: 1px solid #3a8a3a; border-radius: 4px; cursor: pointer; font-family: inherit;">Reload Page</button>
    `;
    document.body.appendChild(errorDiv);
}

async function initializeRenderer() {
    // Try WebGPU first
    if (navigator.gpu) {
        try {
            const adapter = await navigator.gpu.requestAdapter();
            if (adapter) {
                const renderer = new THREE.WebGPURenderer({
                    antialias: true,
                    xrCompatible: true
                });
                console.log('✓ WebGPU renderer initialized');
                rendererType = 'WebGPU';
                return renderer;
            }
        } catch (error) {
            console.warn('✗ WebGPU initialization failed:', error.message);
        }
    }
    
    // Fallback to WebGL
    try {
        const renderer = new THREE.WebGLRenderer({
            antialias: true
        });
        console.log('✓ WebGL renderer initialized (fallback)');
        rendererType = 'WebGL';
        return renderer;
    } catch (error) {
        console.error('✗ WebGL initialization failed:', error.message);
        throw new Error('Both WebGPU and WebGL renderers failed to initialize');
    }
}

function updateControlInstructions() {
    const spawnInstruction = document.getElementById('spawn-instruction');
    const cameraInstruction = document.getElementById('camera-instruction');
    const infoElement = document.getElementById('info');
    
    if (deviceType === 'desktop') {
        spawnInstruction.textContent = 'Click-and-hold creatures to grab';
        cameraInstruction.textContent = 'Drag empty space to rotate view | Scroll to zoom | Enter VR to grab with controllers | C: cycle lens | Space: capture scene';
    } else if (deviceType === 'mobile') {
        spawnInstruction.textContent = 'Tap cat to interact';
        cameraInstruction.textContent = 'Drag to rotate · Pinch to zoom';
    } else {
        spawnInstruction.textContent = 'Point controller ray at a creature and hold trigger to grab';
        cameraInstruction.textContent = 'Left stick: move · Right stick: look · Right A/B: cycle lens';
    }
    
    if (infoElement && !document.getElementById('f1-hint') && deviceType !== 'mobile') {
        const f1Hint = document.createElement('p');
        f1Hint.id = 'f1-hint';
        f1Hint.textContent = 'Press F1 for controls guide';
        f1Hint.style.fontSize = '0.8rem';
        f1Hint.style.color = '#80a080';
        f1Hint.style.marginTop = '4px';
        infoElement.appendChild(f1Hint);
    }

    const mobileSpawnInstruction = document.getElementById('mobile-spawn-instruction');
    const mobileCameraInstruction = document.getElementById('mobile-camera-instruction');

    if (mobileSpawnInstruction) {
        mobileSpawnInstruction.textContent = spawnInstruction.textContent;
    }

    if (mobileCameraInstruction) {
        mobileCameraInstruction.textContent = cameraInstruction.textContent;
    }

    updateViewfinderHudHint();
}

function setupXRInteraction() {
    const controllerModelFactory = new XRControllerModelFactory();
    const handModelFactory = new XRHandModelFactory();
    
    for (let i = 0; i < 2; i++) {
        const controller = renderer.xr.getController(i);
        controller.userData.sourceId = `controller-${i + 1}`;
        controller.addEventListener('selectstart', onXRSelectStart);
        controller.addEventListener('selectend', onXRSelectEnd);
        cameraRig.add(controller);
        xrControllers.push(controller);
        
        const controllerRay = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, -6)
            ]),
            new THREE.LineBasicMaterial({ color: 0xa0c0a0 })
        );
        controllerRay.name = 'controller-ray';
        controller.add(controllerRay);
        
        const grip = renderer.xr.getControllerGrip(i);
        grip.add(controllerModelFactory.createControllerModel(grip));
        cameraRig.add(grip);
        
        const hand = renderer.xr.getHand(i);
        hand.userData.sourceId = `hand-${i + 1}`;
        hand.add(handModelFactory.createHandModel(hand, 'mesh'));
        cameraRig.add(hand);
        xrHands.push(hand);
    }
    
    // Show controls button when XR is available
    const controlsToggle = document.getElementById('controls-toggle');
    controlsToggle.classList.add('visible');
}

function setupControls() {
    console.log('Setting up controls for device type:', deviceType);
    
    if (deviceType === 'desktop') {
        document.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.addEventListener('wheel', onMouseWheel, { passive: false });
        console.log('Desktop controls enabled');
    } else if (deviceType === 'mobile') {
        document.addEventListener('touchstart', onTouchStart, { passive: false });
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd);
        console.log('Mobile controls enabled');
    }
}

function beginDesktopGrab(clientX, clientY) {
    const picked = raycastPickableFromScreen(clientX, clientY);
    if (!picked) return false;

    const localOffset = new THREE.Vector3();
    if (picked.hit?.point) {
        localOffset.copy(picked.hit.point).sub(picked.entity.group.position);
    }
    const holdDistance = camera.position.distanceTo(picked.hit?.point || picked.entity.group.position);
    return beginGrab(picked, desktopGrabState.sourceId, {
        desktop: true,
        pointerX: clientX,
        pointerY: clientY,
        holdDistance,
        localOffset
    });
}

function clearPendingDesktopInteraction() {
    if (pendingDesktopInteraction.timerId !== null) {
        clearTimeout(pendingDesktopInteraction.timerId);
    }
    pendingDesktopInteraction.active = false;
    pendingDesktopInteraction.target = null;
    pendingDesktopInteraction.timerId = null;
}

function startPendingDesktopInteraction(clientX, clientY) {
    const picked = raycastPickableFromScreen(clientX, clientY);
    if (!picked) return false;

    const localOffset = new THREE.Vector3();
    if (picked.hit?.point) {
        localOffset.copy(picked.hit.point).sub(picked.entity.group.position);
    }

    pendingDesktopInteraction.active = true;
    pendingDesktopInteraction.target = picked;
    pendingDesktopInteraction.pointerX = clientX;
    pendingDesktopInteraction.pointerY = clientY;
    pendingDesktopInteraction.holdDistance = camera.position.distanceTo(
        picked.hit?.point || picked.entity.group.position
    );
    pendingDesktopInteraction.localOffset.copy(localOffset);
    pendingDesktopInteraction.timerId = setTimeout(() => {
        if (!pendingDesktopInteraction.active || !pendingDesktopInteraction.target) return;
        const target = pendingDesktopInteraction.target;
        const pointerX = pendingDesktopInteraction.pointerX;
        const pointerY = pendingDesktopInteraction.pointerY;
        const holdDistance = pendingDesktopInteraction.holdDistance;
        const dragOffset = pendingDesktopInteraction.localOffset.clone();
        clearPendingDesktopInteraction();
        beginGrab(target, desktopGrabState.sourceId, {
            desktop: true,
            pointerX,
            pointerY,
            holdDistance,
            localOffset: dragOffset
        });
    }, HOLD_TO_DRAG_DELAY_MS);

    return true;
}

function clearPendingXRInteraction(sourceId) {
    const pending = pendingXRInteractions.get(sourceId);
    if (pending?.timerId) {
        clearTimeout(pending.timerId);
    }
    pendingXRInteractions.delete(sourceId);
}

function startPendingXRInteraction(controller, picked) {
    const sourceId = controller.userData.sourceId;
    const localOffset = new THREE.Vector3(0, -0.05, -0.35);

    const timerId = setTimeout(() => {
        const pending = pendingXRInteractions.get(sourceId);
        if (!pending) return;
        clearPendingXRInteraction(sourceId);
        beginGrab(pending.target, sourceId, {
            xrController: pending.controller,
            localOffset: pending.localOffset.clone()
        });
    }, HOLD_TO_DRAG_DELAY_MS);

    pendingXRInteractions.set(sourceId, {
        controller,
        target: picked,
        localOffset,
        timerId
    });
}

function onMouseDown(event) {
    if (event.button !== 0) return;
    if (event.target === renderer.domElement && startPendingDesktopInteraction(event.clientX, event.clientY)) {
        previousMousePosition = { x: event.clientX, y: event.clientY };
        isDragging = false;
        hasDragged = false;
        return;
    }

    isDragging = true;
    hasDragged = false;
    previousMousePosition = { x: event.clientX, y: event.clientY };
}

function onMouseMove(event) {
    if (pendingDesktopInteraction.active) {
        pendingDesktopInteraction.pointerX = event.clientX;
        pendingDesktopInteraction.pointerY = event.clientY;
        previousMousePosition = { x: event.clientX, y: event.clientY };
        return;
    }

    if (desktopGrabState.active) {
        desktopGrabState.pointer.x = event.clientX;
        desktopGrabState.pointer.y = event.clientY;
        const movedX = event.clientX - previousMousePosition.x;
        const movedY = event.clientY - previousMousePosition.y;
        if (Math.abs(movedX) > 3 || Math.abs(movedY) > 3) {
            desktopGrabState.moved = true;
        }
        previousMousePosition = { x: event.clientX, y: event.clientY };
        return;
    }

    if (!isDragging) return;
    
    const deltaX = event.clientX - previousMousePosition.x;
    const deltaY = event.clientY - previousMousePosition.y;
    
    // Mark as dragged if moved more than a small threshold
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        hasDragged = true;
    }
    
    cameraAngle += deltaX * 0.01;
    cameraHeight = Math.max(3, Math.min(20, cameraHeight - deltaY * 0.05));
    
    updateCameraPosition();
    
    previousMousePosition = { x: event.clientX, y: event.clientY };
}

function onMouseUp() {
    if (pendingDesktopInteraction.active) {
        const target = pendingDesktopInteraction.target;
        clearPendingDesktopInteraction();
        suppressNextClickInteraction = true;
        if (target) {
            triggerPickableInteraction(target, 'cursor');
        }
        return;
    }

    if (desktopGrabState.active) {
        const heldMs = performance.now() - (desktopGrabState.startedAt || performance.now());
        const target = desktopGrabState.target;
        const shouldTreatAsTap = !desktopGrabState.moved && heldMs < 180;
        let releaseVelocity = new THREE.Vector3(0, 0.4, 0);

        if (!shouldTreatAsTap) {
            camera.getWorldDirection(tmpCameraDirection);
            const fallback = tmpCameraDirection.clone().multiplyScalar(1.2).setY(0.8);
            releaseVelocity = calculateReleaseVelocity(desktopGrabState.history, fallback)
                .clampLength(0, 8);
            releaseVelocity = applyStillReleaseDrop(target, desktopGrabState.history, releaseVelocity);
            releaseVelocity = applyImmediateReleaseDrop(releaseVelocity);
        }

        endGrab(desktopGrabState.sourceId, shouldTreatAsTap ? new THREE.Vector3() : releaseVelocity);
        suppressNextClickInteraction = true;
        if (shouldTreatAsTap && target) {
            const state = entityPhysicsStates.get(target.entity);
            if (state) {
                state.mode = 'idle';
                state.body.type = CANNON.Body.KINEMATIC;
                state.body.updateMassProperties();
                state.body.velocity.set(0, 0, 0);
                state.body.angularVelocity.set(0, 0, 0);
                syncEntityFromPhysicsState(state);
            }
            setEntityHeld(target, false, null);
            triggerPickableInteraction(target, 'cursor');
        }
        return;
    }

    isDragging = false;
}

function onMouseWheel(event) {
    event.preventDefault();
    cameraRadius = Math.max(5, Math.min(30, cameraRadius + event.deltaY * 0.01));
    updateCameraPosition();
}

function onTouchStart(event) {
    if (event.touches.length === 1) {
        isDragging = true;
        hasDragged = false;
        previousMousePosition = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }
}

function onTouchMove(event) {
    if (!isDragging || event.touches.length !== 1) return;
    event.preventDefault();
    
    const deltaX = event.touches[0].clientX - previousMousePosition.x;
    const deltaY = event.touches[0].clientY - previousMousePosition.y;

    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        hasDragged = true;
    }
    
    cameraAngle += deltaX * 0.01;
    cameraHeight = Math.max(3, Math.min(20, cameraHeight - deltaY * 0.05));
    
    updateCameraPosition();
    
    previousMousePosition = { x: event.touches[0].clientX, y: event.touches[0].clientY };
}

function onTouchEnd(event) {
    isDragging = false;
    if (!hasDragged && event.changedTouches.length === 1) {
        const touch = event.changedTouches[0];
        handleMobileTap(touch.clientX, touch.clientY);
    }
    hasDragged = false;
}

function handleMobileTap(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    if (el !== renderer.domElement) return;

    const target = raycastPickableFromScreen(clientX, clientY);
    if (target) {
        triggerPickableInteraction(target, 'cursor');
    }
}

function setupMobileControls() {
    const mobViewfinder = document.getElementById('mob-viewfinder');
    const mobCapture = document.getElementById('mob-capture');
    const mobPanelToggle = document.getElementById('mob-panel-toggle');
    const mobileQuickPanel = document.getElementById('mobile-quick-panel');
    const mobilePanelShell = mobileQuickPanel?.querySelector('.mobile-panel-shell');
    const mobilePanelClose = document.getElementById('mobile-panel-close');
    const mobileAudioToggle = document.getElementById('mobile-audio-toggle');
    const mobileControlsGuide = document.getElementById('mobile-controls-guide');
    const audioToggle = document.getElementById('audio-toggle');

    mobViewfinder.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleViewfinder();
    });

    mobCapture.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!cameraViewfinderActive) return;
        captureScene();
    });

    mobPanelToggle.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setMobileQuickPanelOpen(!mobileQuickPanelOpen);
    });

    mobilePanelClose.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setMobileQuickPanelOpen(false);
    });

    mobileAudioToggle.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        audioToggle?.click();
    });

    mobileControlsGuide.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setMobileQuickPanelOpen(false);
        controlsPopup?.show();
    });

    mobileQuickPanel?.addEventListener('click', () => {
        setMobileQuickPanelOpen(false);
    });

    mobilePanelShell?.addEventListener('click', (event) => {
        event.stopPropagation();
    });

    const zone = document.getElementById('joystick-zone');
    const thumb = document.getElementById('joystick-thumb');
    const radius = 38;
    let joystickTouchId = null;
    let baseX = 0;
    let baseY = 0;

    zone.addEventListener('touchstart', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (joystickTouchId !== null) return;

        const touch = event.changedTouches[0];
        joystickTouchId = touch.identifier;
        const rect = zone.getBoundingClientRect();
        baseX = rect.left + rect.width / 2;
        baseY = rect.top + rect.height / 2;
        joystickState.active = true;
        zone.classList.add('active');
    }, { passive: false });

    zone.addEventListener('touchmove', (event) => {
        event.preventDefault();
        event.stopPropagation();
        let touch = null;

        for (const changedTouch of event.changedTouches) {
            if (changedTouch.identifier === joystickTouchId) {
                touch = changedTouch;
                break;
            }
        }

        if (!touch) return;

        let dx = touch.clientX - baseX;
        let dy = touch.clientY - baseY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > radius) {
            dx = dx / distance * radius;
            dy = dy / distance * radius;
        }

        thumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        joystickState.dx = dx / radius;
        joystickState.dy = dy / radius;
    }, { passive: false });

    const endJoystick = (event) => {
        event.preventDefault();
        let found = false;

        for (const touch of event.changedTouches) {
            if (touch.identifier === joystickTouchId) {
                found = true;
                break;
            }
        }

        if (!found) return;

        joystickTouchId = null;
        joystickState.active = false;
        joystickState.dx = 0;
        joystickState.dy = 0;
        thumb.style.transform = 'translate(-50%, -50%)';
        zone.classList.remove('active');
    };

    zone.addEventListener('touchend', endJoystick, { passive: false });
    zone.addEventListener('touchcancel', endJoystick, { passive: false });

    syncMobileHud();
    syncMobilePanel();
}

function setupOrientationHandler() {
    const warning = document.getElementById('portrait-warning');
    const check = () => {
        const portrait = window.matchMedia('(orientation: portrait)').matches;
        warning.style.display = portrait ? 'flex' : 'none';
    };

    check();
    window.addEventListener('orientationchange', check);
    window.matchMedia('(orientation: portrait)').addEventListener('change', check);
}

function getTerrainY(x, z) {
    if (!environment || typeof environment.getTerrainHeightAt !== 'function') {
        return 0;
    }
    return environment.getTerrainHeightAt(x, z);
}

function spawnOcelot(x, z) {
    try {
        const groundY = getTerrainY(x, z);
        const ocelot = createOcelot({
            position: new THREE.Vector3(x, groundY, z),
            boundarySize: boundarySize
        });
        
        if (ocelot && ocelot.group) {
            ocelots.push(ocelot);
            scene.add(ocelot.group);
            registerOcelotMeshes(ocelot);
            
            updateDashboard();
            return ocelot;
        }
    } catch (error) {
        console.error('Failed to spawn ocelot at', x, z, ':', error);
        return null;
    }
}

function spawnButterfly(x, z) {
    try {
        const butterfly = createButterfly({
            position: new THREE.Vector3(x, 3 + Math.random() * 4, z),
            boundarySize
        });
        
        if (butterfly && butterfly.group) {
            butterflies.push(butterfly);
            scene.add(butterfly.group);
            registerButterflyMeshes(butterfly);
            return butterfly;
        }
    } catch (error) {
        console.error('Failed to spawn butterfly at', x, z, ':', error);
        return null;
    }
}

function spawnGrosbeak(x, z) {
    try {
        const groundY = getTerrainY(x, z);
        const grosbeak = createBlackHeadedGrosbeak({
            position: new THREE.Vector3(x, groundY, z),
            boundarySize,
            roaming: true,
            constrainPosition: (position) => {
                environment?.constrainPositionAgainstHouse(position, xrCollisionPadding);
            }
        });

        if (grosbeak && grosbeak.group) {
            grosbeaks.push(grosbeak);
            scene.add(grosbeak.group);
            registerGrosbeakMeshes(grosbeak);
            return grosbeak;
        }
    } catch (error) {
        console.error('Failed to spawn grosbeak at', x, z, ':', error);
        return null;
    }
}

function registerOcelotMeshes(ocelot) {
    registerEntityMeshes(ocelot, 'ocelot', ocelotMeshes, ocelotMeshToEntity);
}

function registerButterflyMeshes(butterfly) {
    registerEntityMeshes(butterfly, 'butterfly', butterflyMeshes, butterflyMeshToEntity);
}

function registerGrosbeakMeshes(grosbeak) {
    registerEntityMeshes(grosbeak, 'grosbeak', grosbeakMeshes, grosbeakMeshToEntity);
}

function registerEntityMeshes(entity, type, meshList, meshMap) {
    entity.group.traverse(child => {
        if (child.isMesh) {
            meshList.push(child);
            meshMap.set(child, entity);
            pickableMeshToTarget.set(child, { entity, type });
        }
    });
}

function initPhysicsWorld() {
    physicsWorld = new CANNON.World({
        gravity: new CANNON.Vec3(0, -9.82, 0)
    });
    physicsWorld.allowSleep = true;
    physicsWorld.broadphase = new CANNON.SAPBroadphase(physicsWorld);
}

function getEntityHoldRadius(target) {
    const box = new THREE.Box3().setFromObject(target.entity.group);
    const size = new THREE.Vector3();
    box.getSize(size);
    const largestAxis = Math.max(size.x, size.y, size.z);
    const defaultRadius = target.type === 'butterfly' ? 0.22 : 0.45;
    return THREE.MathUtils.clamp((largestAxis || defaultRadius) * 0.36, 0.16, 1.3);
}

function getHeldVisualState(target) {
    if (heldVisualStates.has(target.entity)) {
        return heldVisualStates.get(target.entity);
    }

    const bounds = new THREE.Box3().setFromObject(target.entity.group);
    const size = new THREE.Vector3();
    bounds.getSize(size);
    const radius = Math.max(size.x, size.z, 0.5);
    const height = Math.max(size.y, 0.8);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getHeldGlowTexture(),
        color: 0xe7f4bf,
        transparent: true,
        opacity: HELD_GLOW_OPACITY,
        depthWrite: false,
        depthTest: true
    }));
    glow.renderOrder = 2;
    glow.visible = false;
    scene.add(glow);

    const state = {
        glow,
        baseScale: new THREE.Vector3(1, 1, 1),
        radius,
        height,
        startedAt: 0,
        active: false
    };
    heldVisualStates.set(target.entity, state);
    return state;
}

function setHeldVisuals(target, isHeld) {
    if (!scene || !target?.entity?.group) return;

    const state = getHeldVisualState(target);
    state.active = Boolean(isHeld);
    state.startedAt = performance.now();

    if (isHeld) {
        state.baseScale.copy(target.entity.group.scale);
        state.glow.visible = true;
    } else {
        state.glow.visible = false;
        target.entity.group.scale.copy(state.baseScale);
    }
}

function getOrCreatePhysicsState(target) {
    if (entityPhysicsStates.has(target.entity)) {
        return entityPhysicsStates.get(target.entity);
    }

    const radius = getEntityHoldRadius(target);
    const start = target.entity.group.position;
    const body = new CANNON.Body({
        mass: 1,
        shape: new CANNON.Sphere(radius),
        position: new CANNON.Vec3(start.x, start.y, start.z)
    });
    body.linearDamping = 0.24;
    body.angularDamping = 0.9;
    body.allowSleep = true;
    body.sleepSpeedLimit = 0.1;
    body.sleepTimeLimit = 0.25;
    body.type = CANNON.Body.KINEMATIC;
    body.updateMassProperties();
    physicsWorld.addBody(body);

    const state = {
        body,
        target,
        mode: 'idle',
        releaseTimer: 0,
        heldSince: 0,
        holdSourceId: null
    };
    entityPhysicsStates.set(target.entity, state);
    return state;
}

function setEntityHeld(target, isHeld, sourceId = null) {
    if (typeof target.entity.setHeld === 'function') {
        target.entity.setHeld(isHeld, sourceId);
    }
    setHeldVisuals(target, isHeld);
}

function applyExternalEntityTransform(target, position, quaternion = null) {
    if (typeof target.entity.setExternalTransform === 'function') {
        target.entity.setExternalTransform(position, quaternion);
        return;
    }
    target.entity.group.position.copy(position);
    if (quaternion) {
        target.entity.group.quaternion.copy(quaternion);
    }
}

function raycastPickableFromScreen(clientX, clientY) {
    if (!pickableMeshToTarget.size) return null;

    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(Array.from(pickableMeshToTarget.keys()), false);
    if (!intersects.length) return null;

    const hit = intersects[0];
    const target = pickableMeshToTarget.get(hit.object);
    if (!target) return null;
    return { ...target, hit };
}

function raycastPickableFromXR(sourceObject) {
    if (!pickableMeshToTarget.size) return null;

    xrDirectionMatrix.identity().extractRotation(sourceObject.matrixWorld);
    xrRayOrigin.setFromMatrixPosition(sourceObject.matrixWorld);
    xrRayDirection.set(0, 0, -1).applyMatrix4(xrDirectionMatrix);

    raycaster.ray.origin.copy(xrRayOrigin);
    raycaster.ray.direction.copy(xrRayDirection).normalize();
    const intersects = raycaster.intersectObjects(Array.from(pickableMeshToTarget.keys()), false);
    if (!intersects.length) return null;

    const hit = intersects[0];
    const target = pickableMeshToTarget.get(hit.object);
    if (!target) return null;
    return { ...target, hit };
}

function recordGrabSample(history, position) {
    history.push({
        time: performance.now(),
        position: position.clone()
    });
    if (history.length > 6) {
        history.shift();
    }
}

function calculateReleaseVelocity(history, fallback = new THREE.Vector3()) {
    if (history.length < 2) {
        return fallback.clone();
    }
    const first = history[0];
    const last = history[history.length - 1];
    const dt = Math.max((last.time - first.time) / 1000, 1 / 120);
    return velocityScratch.subVectors(last.position, first.position).divideScalar(dt);
}

function isStillRelease(history) {
    if (!history || history.length < 2) {
        return false;
    }
    const last = history[history.length - 1];
    const windowStart = last.time - STILL_RELEASE_LOOKBACK_MS;
    let first = history[0];
    for (let i = history.length - 2; i >= 0; i -= 1) {
        if (history[i].time < windowStart) break;
        first = history[i];
    }

    const dt = Math.max((last.time - first.time) / 1000, 1 / 120);
    const displacement = releaseMotionScratch.subVectors(last.position, first.position);
    const speed = displacement.length() / dt;
    const horizontalDisplacement = Math.hypot(displacement.x, displacement.z);
    return speed <= STILL_RELEASE_MAX_SPEED && horizontalDisplacement <= STILL_RELEASE_MAX_DISPLACEMENT;
}

function applyStillReleaseDrop(target, history, velocity) {
    if (!target || target.type === 'butterfly' || !isStillRelease(history)) {
        return velocity;
    }
    const adjustedVelocity = velocity.clone();
    adjustedVelocity.x *= STILL_RELEASE_HORIZONTAL_DAMPING;
    adjustedVelocity.z *= STILL_RELEASE_HORIZONTAL_DAMPING;
    if (Math.hypot(adjustedVelocity.x, adjustedVelocity.z) < 0.04) {
        adjustedVelocity.x = 0;
        adjustedVelocity.z = 0;
    }
    return adjustedVelocity;
}

function applyImmediateReleaseDrop(velocity) {
    const adjustedVelocity = velocity.clone();
    adjustedVelocity.y = Math.min(adjustedVelocity.y, 0);
    if (adjustedVelocity.y > -0.45) {
        adjustedVelocity.y = -0.45;
    }
    return adjustedVelocity;
}

function clampDesktopGrabHoldDistance(value) {
    return THREE.MathUtils.clamp(
        value,
        DESKTOP_GRAB_MIN_HOLD_DISTANCE,
        DESKTOP_GRAB_MAX_HOLD_DISTANCE
    );
}

function beginGrab(target, sourceId, options = {}) {
    if (!target || !physicsWorld) return false;

    const state = getOrCreatePhysicsState(target);
    state.mode = 'held';
    state.releaseTimer = 0;
    state.heldSince = performance.now();
    state.holdSourceId = sourceId;
    state.body.type = CANNON.Body.KINEMATIC;
    state.body.updateMassProperties();
    state.body.velocity.set(0, 0, 0);
    state.body.angularVelocity.set(0, 0, 0);
    state.body.wakeUp();
    state.body.position.set(
        target.entity.group.position.x,
        target.entity.group.position.y,
        target.entity.group.position.z
    );
    state.body.quaternion.set(
        target.entity.group.quaternion.x,
        target.entity.group.quaternion.y,
        target.entity.group.quaternion.z,
        target.entity.group.quaternion.w
    );
    setEntityHeld(target, true, sourceId);

    if (options.desktop) {
        desktopGrabState.active = true;
        desktopGrabState.target = target;
        desktopGrabState.holdDistance = clampDesktopGrabHoldDistance(
            options.holdDistance ?? camera.position.distanceTo(target.entity.group.position)
        );
        desktopGrabState.localOffset.copy(options.localOffset || new THREE.Vector3());
        desktopGrabState.pointer.x = options.pointerX ?? 0;
        desktopGrabState.pointer.y = options.pointerY ?? 0;
        desktopGrabState.history.length = 0;
        desktopGrabState.startedAt = performance.now();
        desktopGrabState.moved = false;
        recordGrabSample(desktopGrabState.history, target.entity.group.position);
    }

    if (options.xrController) {
        xrGrabStates.set(sourceId, {
            target,
            sourceObject: options.xrController,
            localOffset: options.localOffset || new THREE.Vector3(),
            history: [],
            startedAt: performance.now()
        });
    }

    return true;
}

function endGrab(sourceId, releaseVelocity = null) {
    let target = null;
    if (sourceId === desktopGrabState.sourceId) {
        target = desktopGrabState.target;
        desktopGrabState.active = false;
        desktopGrabState.target = null;
    } else {
        const xrGrab = xrGrabStates.get(sourceId);
        if (xrGrab) {
            target = xrGrab.target;
            xrGrabStates.delete(sourceId);
        }
    }

    if (!target) return null;
    const state = entityPhysicsStates.get(target.entity);
    if (!state) return target;

    const velocity = releaseVelocity || new THREE.Vector3();
    state.mode = 'released';
    state.releaseTimer = 0.8;
    state.heldSince = 0;
    state.holdSourceId = null;
    state.body.type = CANNON.Body.DYNAMIC;
    state.body.mass = 1;
    state.body.updateMassProperties();
    state.body.velocity.set(velocity.x, velocity.y, velocity.z);
    state.body.angularVelocity.set(
        THREE.MathUtils.randFloatSpread(2),
        THREE.MathUtils.randFloatSpread(2),
        THREE.MathUtils.randFloatSpread(2)
    );
    setEntityHeld(target, true, `${sourceId}-release`);
    return target;
}

function syncEntityFromPhysicsState(state) {
    tmpWorldVec3.set(state.body.position.x, state.body.position.y, state.body.position.z);
    tmpWorldQuat.set(
        state.body.quaternion.x,
        state.body.quaternion.y,
        state.body.quaternion.z,
        state.body.quaternion.w
    );
    applyExternalEntityTransform(state.target, tmpWorldVec3, tmpWorldQuat);
}

function completeReleaseHandoff(state) {
    state.mode = 'idle';
    state.body.type = CANNON.Body.KINEMATIC;
    state.body.updateMassProperties();
    state.body.velocity.set(0, 0, 0);
    state.body.angularVelocity.set(0, 0, 0);
    setEntityHeld(state.target, false, null);
}

function enforceReleaseUprightOrientation(state) {
    if (!state || state.target.type === 'butterfly') return;

    tmpWorldQuat.set(
        state.body.quaternion.x,
        state.body.quaternion.y,
        state.body.quaternion.z,
        state.body.quaternion.w
    );
    tmpYawEuler.setFromQuaternion(tmpWorldQuat, 'YXZ');
    tmpYawEuler.x = 0;
    tmpYawEuler.z = 0;
    tmpWorldQuat.setFromEuler(tmpYawEuler);

    state.body.quaternion.set(
        tmpWorldQuat.x,
        tmpWorldQuat.y,
        tmpWorldQuat.z,
        tmpWorldQuat.w
    );
}

function getReleaseSettleY(target, x, z) {
    const terrainY = getTerrainY(x, z);
    if (target.type === 'grosbeak') {
        return terrainY + (target.entity?.groundOffset || 0);
    }
    if (target.type === 'butterfly') {
        return terrainY + 0.12;
    }
    return terrainY;
}

function stepPhysicsAndSync(delta) {
    if (!physicsWorld) return;

    physicsWorld.step(1 / 60, delta, 3);

    for (const state of entityPhysicsStates.values()) {
        if (state.mode === 'idle') continue;
        syncEntityFromPhysicsState(state);

        if (state.mode === 'released') {
            state.releaseTimer -= delta;
            const settleY = getReleaseSettleY(state.target, state.body.position.x, state.body.position.z);
            const nearTerrain = state.body.position.y <= settleY + 0.2;
            const verticalSpeed = Math.abs(state.body.velocity.y);

            if (state.body.position.y <= settleY) {
                state.body.position.y = settleY;
                if (state.body.velocity.y < 0) {
                    state.body.velocity.y = 0;
                }
            }

            if (state.releaseTimer <= 0 && nearTerrain && verticalSpeed < 0.35) {
                enforceReleaseUprightOrientation(state);
                syncEntityFromPhysicsState(state);
                completeReleaseHandoff(state);
            }
        }
    }
}

function isEntityPhysicsControlled(entity) {
    const state = entityPhysicsStates.get(entity);
    return Boolean(state && state.mode !== 'idle');
}

function getDesktopGrabGroundClearance(target) {
    if (!target) return 0.08;
    if (target.type === 'grosbeak') {
        return target.entity?.groundOffset ?? 0.1;
    }
    if (target.type === 'butterfly') {
        return 0.12;
    }
    return 0.08;
}

function updateDesktopGrab() {
    if (!desktopGrabState.active || !desktopGrabState.target) return;
    const clampedHoldDistance = clampDesktopGrabHoldDistance(desktopGrabState.holdDistance);
    desktopGrabState.holdDistance = clampedHoldDistance;

    mouse.x = (desktopGrabState.pointer.x / window.innerWidth) * 2 - 1;
    mouse.y = -(desktopGrabState.pointer.y / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    camera.getWorldDirection(tmpCameraDirection);
    const holdPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        tmpCameraDirection,
        tmpWorldVec3.copy(camera.position).addScaledVector(tmpCameraDirection, clampedHoldDistance)
    );

    if (!raycaster.ray.intersectPlane(holdPlane, tmpScreenPlaneHit)) {
        tmpScreenPlaneHit.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, clampedHoldDistance);
    }

    tmpScreenPlaneHit.sub(desktopGrabState.localOffset);
    const state = entityPhysicsStates.get(desktopGrabState.target.entity);
    if (!state) return;

    const minY = getTerrainY(tmpScreenPlaneHit.x, tmpScreenPlaneHit.z) + getDesktopGrabGroundClearance(desktopGrabState.target);
    tmpScreenPlaneHit.y = Math.max(tmpScreenPlaneHit.y, minY);

    state.body.position.set(tmpScreenPlaneHit.x, tmpScreenPlaneHit.y, tmpScreenPlaneHit.z);
    state.body.quaternion.set(
        desktopGrabState.target.entity.group.quaternion.x,
        desktopGrabState.target.entity.group.quaternion.y,
        desktopGrabState.target.entity.group.quaternion.z,
        desktopGrabState.target.entity.group.quaternion.w
    );
    syncEntityFromPhysicsState(state);
    recordGrabSample(desktopGrabState.history, tmpScreenPlaneHit);
}

function updateXRGrabStates() {
    for (const [sourceId, grab] of xrGrabStates.entries()) {
        const state = entityPhysicsStates.get(grab.target.entity);
        if (!state) continue;
        tmpControllerPos.setFromMatrixPosition(grab.sourceObject.matrixWorld);
        tmpWorldVec3.copy(tmpControllerPos).add(grab.localOffset);
        tmpWorldQuat.setFromRotationMatrix(grab.sourceObject.matrixWorld);

        state.body.position.set(tmpWorldVec3.x, tmpWorldVec3.y, tmpWorldVec3.z);
        state.body.quaternion.set(tmpWorldQuat.x, tmpWorldQuat.y, tmpWorldQuat.z, tmpWorldQuat.w);
        syncEntityFromPhysicsState(state);
        recordGrabSample(grab.history, tmpWorldVec3);

        const bodyRay = grab.sourceObject.getObjectByName('controller-ray');
        if (bodyRay) {
            bodyRay.material.color.setHex(0xc8ff7a);
        }

        if (!grab.sourceObject.parent) {
            xrGrabStates.delete(sourceId);
            endGrab(sourceId, new THREE.Vector3(0, 0.6, -0.2));
        }
    }
}

function updateHeldVisualStates(time) {
    for (const [entity, state] of heldVisualStates.entries()) {
        if (!state.active) continue;

        const elapsed = Math.max(0, time - state.startedAt);
        const pulseProgress = Math.min(elapsed / HELD_PULSE_DURATION_MS, 1);
        const pulse = Math.sin(Math.min(pulseProgress, 1) * Math.PI);
        const settleScale = 1 + HELD_SCALE_BOOST * (0.45 + 0.55 * pulse);
        const liftOffset = HELD_PULSE_HEIGHT * pulse;

        entity.group.scale.copy(state.baseScale).multiplyScalar(settleScale);

        state.glow.position.set(
            entity.group.position.x,
            entity.group.position.y + state.height * 0.5 + liftOffset,
            entity.group.position.z
        );
        state.glow.scale.set(state.radius * 2.8, state.height * 1.8, 1);
        state.glow.material.opacity = HELD_GLOW_OPACITY + pulse * 0.08;
    }
}

function autoReleaseExpiredHolds(time) {
    for (const state of entityPhysicsStates.values()) {
        if (state.mode !== 'held' || !state.holdSourceId || !state.heldSince) continue;
        if (time - state.heldSince >= AUTO_RELEASE_HOLD_MS) {
            endGrab(
                state.holdSourceId,
                applyImmediateReleaseDrop(new THREE.Vector3(0, -0.45, 0))
            );
        }
    }
}

function triggerPickableInteraction(target, sourceId) {
    if (!target) return;
    if (target.type === 'ocelot') {
        triggerOcelotInteraction(target.entity, sourceId);
        return;
    }
    if (target.type === 'grosbeak') {
        triggerGrosbeakInteraction(target.entity, sourceId);
        return;
    }
    lastInteractionLabel = `${sourceId}: observed butterfly`;
    updateDashboard();
}

function updateDashboard() {
    const catCount = document.getElementById('cat-count');
    const actionSummary = document.getElementById('action-summary');
    const interactionStatus = document.getElementById('interaction-status');
    const audioTrack = document.getElementById('audio-track');
    const audioPlayback = document.getElementById('audio-playback');
    if (catCount) {
        catCount.textContent = ocelots.length;
    }

    const mobileCatCount = document.getElementById('mobile-cat-count');
    if (mobileCatCount) {
        mobileCatCount.textContent = String(ocelots.length);
    }
    
    if (actionSummary) {
        const actionCounts = {};
        ocelots.forEach(ocelot => {
            const action = ocelot.getStatus().action;
            actionCounts[action] = (actionCounts[action] || 0) + 1;
        });
        const summary = Object.entries(actionCounts)
            .map(([name, count]) => `${name}:${count}`)
            .join(' | ');
        actionSummary.textContent = summary || 'none';
    }
    
    if (interactionStatus) {
        interactionStatus.textContent = lastInteractionLabel;
    }

    const mobileInteractionStatus = document.getElementById('mobile-interaction-status');
    if (mobileInteractionStatus) {
        mobileInteractionStatus.textContent = lastInteractionLabel;
    }
    
    if (audioTrack) {
        audioTrack.textContent = audioState.trackName;
    }
    
    if (audioPlayback) {
        const muteText = audioState.isMuted ? 'Muted' : 'Unmuted';
        audioPlayback.textContent = `${audioState.status} | ${muteText}`;
    }
    
    // Update renderer display with icon and text
    const rendererIcon = document.getElementById('renderer-status-icon');
    const rendererName = document.getElementById('renderer-name');
    if (rendererIcon && rendererName) {
        if (rendererType === 'WebGPU') {
            rendererIcon.textContent = '🟢';
            rendererName.textContent = 'WebGPU';
        } else if (rendererType === 'WebGL') {
            rendererIcon.textContent = '🟠';
            rendererName.textContent = 'WebGL';
        } else {
            rendererIcon.textContent = '⏳';
            rendererName.textContent = 'Initializing...';
        }
    }

    syncMobilePanel();
}

function onMouseClick(event) {
    if (suppressNextClickInteraction) {
        suppressNextClickInteraction = false;
        return;
    }
    if (event.target !== renderer.domElement) {
        return;
    }
    
    // Only spawn if we didn't drag the mouse
    if (hasDragged) {
        hasDragged = false;
        return;
    }
    
    const target = raycastPickableFromScreen(event.clientX, event.clientY);
    if (target) {
        triggerPickableInteraction(target, 'cursor');
        return;
    }
    
    // Raycast against the environment ground — floor clicks no longer spawn cats
    // (spawning is handled automatically on load)
}

function triggerOcelotInteraction(ocelot, sourceId) {
    const interaction = ocelot.interact(sourceId);
    if (interaction.sound && audioManager) {
        audioManager.playSfx(interaction.sound);
    }
    ocelot.notifyInteraction();
    lastInteractionLabel = `${sourceId}: ${interaction.sound || 'no-sound'}`;
    updateDashboard();
}

function triggerGrosbeakInteraction(grosbeak, sourceId) {
    const interaction = grosbeak.interact(sourceId);
    lastInteractionLabel = `${sourceId}: ${interaction.action || 'hopping'}`;
    updateDashboard();
}

function toggleDashboard() {
    const dashboard = document.getElementById('dashboard');
    const toggleButton = document.getElementById('toggle-dashboard');
    
    dashboardCollapsed = !dashboardCollapsed;
    
    if (dashboardCollapsed) {
        dashboard.classList.add('dashboard-collapsed');
        toggleButton.textContent = '+';
    } else {
        dashboard.classList.remove('dashboard-collapsed');
        toggleButton.textContent = '−';
    }
}

function initializeDashboard() {
    // If dashboard should be collapsed by default, apply the collapsed class immediately
    if (dashboardCollapsed) {
        const dashboard = document.getElementById('dashboard');
        const toggleButton = document.getElementById('toggle-dashboard');
        dashboard.classList.add('dashboard-collapsed');
        toggleButton.textContent = '+';
    }
}

function onKeyDown(event) {
    if (event.code === 'Space') {
        if (cameraViewfinderActive) {
            captureScene();
        }
        event.preventDefault(); // Prevent default spacebar behavior
    } else if (event.code === 'ArrowLeft') {
        cameraAngle -= 0.1;
        updateCameraPosition();
    } else if (event.code === 'ArrowRight') {
        cameraAngle += 0.1;
        updateCameraPosition();
    } else if (event.code === 'ArrowUp') {
        cameraRadius = Math.max(5, cameraRadius - 1);
        updateCameraPosition();
    } else if (event.code === 'ArrowDown') {
        cameraRadius = Math.min(30, cameraRadius + 1);
        updateCameraPosition();
    } else if (event.code === 'KeyC') {
        cycleLensMode();
    } else if (event.code === 'Escape' && mobileQuickPanelOpen) {
        setMobileQuickPanelOpen(false);
    }
}

function onKeyUp(event) {
    // Placeholder for keyboard up events if needed
    // Currently no specific keyup handling required
}

function updateCameraPosition() {
    camera.position.x = Math.sin(cameraAngle) * cameraRadius;
    camera.position.z = Math.cos(cameraAngle) * cameraRadius;
    camera.position.y = cameraHeight;
    camera.lookAt(0, 0, 0);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);

    if (wideAngleComposer) {
        wideAngleComposer.setPixelRatio(window.devicePixelRatio);
        wideAngleComposer.setSize(window.innerWidth, window.innerHeight);
    }
    
    // Ensure canvas is visible and properly sized
    const canvas = renderer.domElement;
    if (canvas) {
        canvas.style.display = 'block';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
    }
}

function onXRSelectStart(event) {
    const controller = event.target;
    const sourceId = controller.userData.sourceId;
    const picked = raycastPickableFromXR(controller);

    if (picked) {
        startPendingXRInteraction(controller, picked);
        return;
    }

    // Keep legacy trigger semantics when no target is found.
    lastInteractionLabel = `${sourceId}: no target`;
    updateDashboard();
}

function onXRSelectEnd(event) {
    const controller = event.target;
    const sourceId = controller.userData.sourceId;
    const pending = pendingXRInteractions.get(sourceId);
    if (pending) {
        clearPendingXRInteraction(sourceId);
        triggerPickableInteraction(pending.target, sourceId);
        return;
    }

    const grab = xrGrabStates.get(sourceId);
    if (!grab) return;

    const fallback = new THREE.Vector3(0, 1.1, -0.8).applyQuaternion(controller.quaternion);
    const releaseVelocity = applyStillReleaseDrop(
        grab.target,
        grab.history,
        calculateReleaseVelocity(grab.history, fallback).clampLength(0, 9)
    );
    endGrab(sourceId, applyImmediateReleaseDrop(releaseVelocity));

    const ray = controller.getObjectByName('controller-ray');
    if (ray) {
        ray.material.color.setHex(0xa0c0a0);
    }
}

function handleXRHandInteractions() {
    if (!renderer.xr.isPresenting) return;
    
    const now = performance.now();
    
    xrHands.forEach(hand => {
        const handJoint = hand.joints?.['index-finger-tip'] || hand.joints?.['middle-finger-tip'];
        if (!handJoint) return;
        
        const handPos = tmpHandPos.setFromMatrixPosition(handJoint.matrixWorld);
        let nearestTarget = null;
        let nearestDistance = Number.POSITIVE_INFINITY;

        const candidates = [
            ...ocelots.map(entity => ({ entity, type: 'ocelot' })),
            ...grosbeaks.map(entity => ({ entity, type: 'grosbeak' })),
            ...butterflies.map(entity => ({ entity, type: 'butterfly' }))
        ];
        candidates.forEach(target => {
            if (target.entity.isHeld) return;
            const distance = handPos.distanceTo(target.entity.group.position);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestTarget = target;
            }
        });
        
        const sourceId = hand.userData.sourceId;
        const lastHit = xrInteractionCooldown.get(sourceId) || 0;
        const cooldownMs = 700;
        
        if (nearestTarget && nearestDistance < 1.3 && now - lastHit > cooldownMs) {
            triggerPickableInteraction(nearestTarget, sourceId);
            xrInteractionCooldown.set(sourceId, now);
        }
    });
}

function getXRThumbstickAxes(axes) {
    if (!axes || axes.length < 2) {
        return { x: 0, y: 0 };
    }

    // Quest controllers expose the active thumbstick on axes[0/1].
    // Keep axes[2/3] as a fallback for runtimes that report the stick there.
    let rawX = Number.isFinite(axes[0]) ? axes[0] : 0;
    let rawY = Number.isFinite(axes[1]) ? axes[1] : 0;

    if (axes.length >= 4 && Number.isFinite(axes[2]) && Number.isFinite(axes[3])) {
        const primaryIdle = Math.abs(rawX) <= VR_DEAD_ZONE && Math.abs(rawY) <= VR_DEAD_ZONE;
        const fallbackActive = Math.abs(axes[2]) > VR_DEAD_ZONE || Math.abs(axes[3]) > VR_DEAD_ZONE;
        if (primaryIdle && fallbackActive) {
            rawX = axes[2];
            rawY = axes[3];
        }
    }

    return {
        x: Math.abs(rawX) > VR_DEAD_ZONE ? rawX : 0,
        y: Math.abs(rawY) > VR_DEAD_ZONE ? rawY : 0
    };
}

function isXRLensCyclePressed(buttons) {
    if (!buttons || !buttons.length) return false;

    // Standard WebXR gamepad mapping:
    // 4 = primary face button (A/X), 5 = secondary face button (B/Y)
    // Keep index 2 as legacy fallback for older mappings.
    return Boolean(buttons[4]?.pressed || buttons[5]?.pressed || buttons[2]?.pressed);
}

function handleXRLocomotion(delta) {
    if (!renderer.xr.isPresenting) return;
    
    const session = renderer.xr.getSession();
    if (!session) return;
    
    for (const source of session.inputSources) {
        if (!source.gamepad) continue;
        const axes = source.gamepad.axes;
        const buttons = source.gamepad.buttons;
        if ((!axes || !axes.length) && (!buttons || !buttons.length)) continue;

        const { x: stickX, y: stickY } = getXRThumbstickAxes(axes);
        
        // Handle button inputs for camera functions
        if (buttons && buttons.length) {
            // Cycle lens presets with right controller face buttons (A/B).
            if (source.handedness === 'right' && isXRLensCyclePressed(buttons)) {
                // Debounce the button press to prevent rapid toggling
                if (!xrInteractionCooldown.get('viewfinder-toggle')) {
                    cycleLensMode();
                    xrInteractionCooldown.set('viewfinder-toggle', true);
                    setTimeout(() => xrInteractionCooldown.delete('viewfinder-toggle'), 300);
                }
            }
        }
        
        if (source.handedness === 'left') {
            // Translate relative to current rig yaw
            const yaw = cameraRig.rotation.y;
            const fwdX = -Math.sin(yaw);
            const fwdZ = -Math.cos(yaw);
            cameraRig.position.x += (fwdX * (-stickY) + Math.cos(yaw) * stickX) * VR_MOVE_SPEED * delta;
            cameraRig.position.z += (fwdZ * (-stickY) + (-Math.sin(yaw)) * stickX) * VR_MOVE_SPEED * delta;
            
            const half = boundarySize / 2;
            cameraRig.position.x = Math.max(-half, Math.min(half, cameraRig.position.x));
            cameraRig.position.z = Math.max(-half, Math.min(half, cameraRig.position.z));
            environment?.constrainPositionAgainstHouse(cameraRig.position, xrCollisionPadding);
        } else if (source.handedness === 'right') {
            cameraRig.rotation.y -= stickX * VR_LOOK_SPEED * delta;
        }
    }
}

function renderFrame(time = performance.now()) {
    try {
        const delta = Math.min((time - lastFrameTime) / 1000, 0.1);
        lastFrameTime = time;

        handleXRLocomotion(delta);
        autoReleaseExpiredHolds(time);
        updateXRGrabStates();
        updateDesktopGrab();
        stepPhysicsAndSync(delta);
        updateHeldVisualStates(time);

        ocelots.forEach(ocelot => {
            const physicsControlled = isEntityPhysicsControlled(ocelot);
            let groundY = ocelot.baseGroupY;
            if (!physicsControlled) {
                groundY = getTerrainY(ocelot.group.position.x, ocelot.group.position.z);
                ocelot.baseGroupY = groundY;
                if (ocelot.targetPosition) {
                    ocelot.targetPosition.y = groundY;
                }
            }
            ocelot.animate();
            if (!physicsControlled && ocelot.currentAction !== 'jump') {
                ocelot.group.position.y = groundY;
            }
        });

        grosbeaks.forEach(grosbeak => {
            const physicsControlled = isEntityPhysicsControlled(grosbeak);
            if (!physicsControlled) {
                const groundY = getTerrainY(grosbeak.group.position.x, grosbeak.group.position.z);
                grosbeak.baseGroupY = groundY + (grosbeak.groundOffset || 0);
            }
            grosbeak.animate();
        });
        
        butterflies.forEach(butterfly => {
            butterfly.animate();
        });

        // Update environment if it has an update method
        if (environment && typeof environment.update === 'function') {
            environment.update();
        }

        handleXRHandInteractions();

        if (joystickState.active) {
            const ORBIT_SPEED = 1.2;
            const ZOOM_SPEED = 8;
            cameraAngle += joystickState.dx * ORBIT_SPEED * delta;
            cameraRadius = Math.max(5, Math.min(30, cameraRadius + joystickState.dy * ZOOM_SPEED * delta));
            updateCameraPosition();
        }
        
        updateDashboard();

        const lensTransition = Math.min(delta * 6, 1);

        if (Math.abs(currentFov - targetFov) > 0.01) {
            currentFov += (targetFov - currentFov) * lensTransition;
            camera.fov = currentFov;
            camera.updateProjectionMatrix();
        }

        if (wideAnglePass) {
            wideAnglePass.uniforms.strength.value += (targetLensStrength - wideAnglePass.uniforms.strength.value) * lensTransition;
            wideAnglePass.uniforms.k0.value += (targetLensK0 - wideAnglePass.uniforms.k0.value) * lensTransition;
            wideAnglePass.uniforms.k1.value += (targetLensK1 - wideAnglePass.uniforms.k1.value) * lensTransition;
            wideAnglePass.uniforms.k2.value += (targetLensK2 - wideAnglePass.uniforms.k2.value) * lensTransition;
            wideAnglePass.uniforms.vignette.value += (targetLensVignette - wideAnglePass.uniforms.vignette.value) * lensTransition;
            wideAnglePass.uniforms.zoom.value += (targetLensZoom - wideAnglePass.uniforms.zoom.value) * lensTransition;
        }

        if (cameraViewfinderActive && wideAngleComposer) {
            wideAngleComposer.render();
        } else {
            renderer.render(scene, camera);
        }
    } catch (error) {
        console.error('Error in render loop:', error);
        // Display error message on screen
        const errorMessage = document.createElement('div');
        errorMessage.id = 'render-error';
        errorMessage.style.position = 'absolute';
        errorMessage.style.top = '10px';
        errorMessage.style.right = '10px';
        errorMessage.style.background = 'rgba(139, 0, 0, 0.8)';
        errorMessage.style.color = '#d0e0d0';
        errorMessage.style.padding = '10px';
        errorMessage.style.borderRadius = '4px';
        errorMessage.style.zIndex = '1000';
        errorMessage.style.maxWidth = '300px';
        errorMessage.style.fontFamily = '-apple-system, BlinkMacSystemFont, sans-serif';
        errorMessage.style.fontSize = '12px';
        errorMessage.innerHTML = `
            <strong>Rendering Error:</strong><br>
            ${error.message}<br>
            <small>Check console for details</small>
        `;
        document.body.appendChild(errorMessage);
        
        // Stop the render loop to prevent continuous errors
        renderer.setAnimationLoop(null);
    }
}

function startStandardRenderLoop() {
    if (standardAnimationFrameId !== null) return;
    
    const loop = (time) => {
        renderFrame(time);
        standardAnimationFrameId = requestAnimationFrame(loop);
    };
    
    standardAnimationFrameId = requestAnimationFrame(loop);
}

function stopStandardRenderLoop() {
    if (standardAnimationFrameId === null) return;
    cancelAnimationFrame(standardAnimationFrameId);
    standardAnimationFrameId = null;
}

// Initialize the application
init();
