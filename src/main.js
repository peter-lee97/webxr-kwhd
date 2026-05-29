import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/examples/jsm/webxr/XRHandModelFactory.js';
import * as CANNON from 'cannon-es';
import { createOcelot } from './components/VoxelOcelot.js';
import { createButterfly } from './components/VoxelButterfly.js';
import {
    createBlackHeadedGrosbeak,
    createWesternTanager,
    createBlackNapedOriole,
    createBlueCrownedHangingParrot
} from './components/VoxelBird.js';
import { AudioManager } from './audio/AudioManager.js';
import { Environment } from './components/Environment.js';
import { ControlsPopup } from './components/ControlsPopup.js';
import { AnimalCatalogOverlay } from './components/AnimalCatalogOverlay.js';


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
const OCELOT_SIZE = 0.42; // 30% smaller than previous 0.6
const OCELOT_SIZE_VARIATION_MIN = 0.82;
const OCELOT_SIZE_VARIATION_MAX = 1.2;
const GROSBEAK_SIZE = 0.35; // 50% smaller than previous 0.7
const WESTERN_TANAGER_SIZE_MULTIPLIER = 0.9;
const WESTERN_TANAGER_SIZE = GROSBEAK_SIZE * WESTERN_TANAGER_SIZE_MULTIPLIER;
const BLACK_NAPED_ORIOLE_SIZE = GROSBEAK_SIZE * 1.0;
const BLUE_CROWNED_HANGING_PARROT_SIZE = GROSBEAK_SIZE * 0.82;
let currentRenderer = null;
let rendererType = 'unknown';
let controlsPopup = null;
let animalCatalogOverlay = null;
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
const xrControllerGrips = [];
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
const AUTO_RELEASE_HOLD_MS = 3000;
const HELD_PULSE_DURATION_MS = 240;
const HELD_PULSE_HEIGHT = 0.12;
const HELD_SCALE_BOOST = 0.035;
const HELD_VR_CREATURE_SCALE_MULTIPLIER = 0.5;
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
    target: null
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
const lensOverlay = document.getElementById('lens-overlay');
const lensOverlayText = document.getElementById('lens-overlay-text');
let lensOverlayHideTimeoutId = null;
let vrLensOverlaySprite = null;
let vrLensOverlayTexture = null;
let vrLensOverlayCanvas = null;
let vrLensOverlayContext = null;
let vrLensOverlayVisibleUntil = 0;
const vrLensOverlayPosition = new THREE.Vector3();
const vrLensOverlayForward = new THREE.Vector3();
const vrLensOverlayQuaternion = new THREE.Quaternion();
const vrLensOverlayScale = new THREE.Vector3();

function createAnimalCatalogItems() {
    const catalogCatPreviewSize = 0.3;
    const makeButterflyPreview = (speciesType) => {
        const butterfly = createButterfly({
            position: new THREE.Vector3(0, 0, 0),
            boundarySize: 12,
            size: 0.52,
            speciesType
        });
        butterfly.setHeld(true, 'catalog');
        butterfly.catalogShouldAnimate = true;
        butterfly.group.position.set(0, 0.15, 0);
        return butterfly;
    };

    return [
        {
            id: 'ocelot',
            name: 'Ocelot',
            createPreview: () => createOcelot({ position: new THREE.Vector3(0, 0, 0), boundarySize: 12, speciesType: 0, size: catalogCatPreviewSize, action: 'idle' })
        },
        {
            id: 'snow-leopard',
            name: 'Snow Leopard',
            createPreview: () => createOcelot({ position: new THREE.Vector3(0, 0, 0), boundarySize: 12, speciesType: 1, size: catalogCatPreviewSize, action: 'idle' })
        },
        {
            id: 'cheetah',
            name: 'Cheetah',
            createPreview: () => createOcelot({ position: new THREE.Vector3(0, 0, 0), boundarySize: 12, speciesType: 2, size: catalogCatPreviewSize, action: 'idle' })
        },
        {
            id: 'serval',
            name: 'Serval',
            createPreview: () => createOcelot({ position: new THREE.Vector3(0, 0, 0), boundarySize: 12, speciesType: 3, size: catalogCatPreviewSize, action: 'idle' })
        },
        {
            id: 'bengal',
            name: 'Bengal',
            createPreview: () => createOcelot({ position: new THREE.Vector3(0, 0, 0), boundarySize: 12, speciesType: 4, size: catalogCatPreviewSize, action: 'idle' })
        },
        {
            id: 'tuxedo',
            name: 'Tuxedo',
            createPreview: () => createOcelot({ position: new THREE.Vector3(0, 0, 0), boundarySize: 12, speciesType: 5, size: catalogCatPreviewSize, action: 'idle' })
        },
        {
            id: 'siamese',
            name: 'Siamese',
            createPreview: () => createOcelot({ position: new THREE.Vector3(0, 0, 0), boundarySize: 12, speciesType: 6, size: catalogCatPreviewSize, action: 'idle' })
        },
        {
            id: 'savannah',
            name: 'Savannah',
            createPreview: () => createOcelot({ position: new THREE.Vector3(0, 0, 0), boundarySize: 12, speciesType: 7, size: catalogCatPreviewSize, action: 'idle' })
        },
        {
            id: 'monarch-butterfly',
            name: 'Monarch Butterfly',
            createPreview: () => makeButterflyPreview(0)
        },
        {
            id: 'blue-morpho-butterfly',
            name: 'Blue Morpho Butterfly',
            createPreview: () => makeButterflyPreview(1)
        },
        {
            id: 'swallowtail-butterfly',
            name: 'Swallowtail Butterfly',
            createPreview: () => makeButterflyPreview(2)
        },
        {
            id: 'cabbage-white-butterfly',
            name: 'Cabbage White Butterfly',
            createPreview: () => makeButterflyPreview(3)
        },
        {
            id: 'red-admiral-butterfly',
            name: 'Red Admiral Butterfly',
            createPreview: () => makeButterflyPreview(4)
        },
        {
            id: 'grosbeak',
            name: 'Black-headed Grosbeak',
            createPreview: () => createBlackHeadedGrosbeak({ position: new THREE.Vector3(0, 0, 0), boundarySize: 12, size: GROSBEAK_SIZE * 1.1, roaming: false })
        },
        {
            id: 'western-tanager',
            name: 'Western Tanager',
            createPreview: () => createWesternTanager({ position: new THREE.Vector3(0, 0, 0), boundarySize: 12, size: WESTERN_TANAGER_SIZE * 1.15, roaming: false })
        },
        {
            id: 'black-naped-oriole',
            name: 'Black-naped Oriole',
            createPreview: () => createBlackNapedOriole({ position: new THREE.Vector3(0, 0, 0), boundarySize: 12, size: BLACK_NAPED_ORIOLE_SIZE * 1.1, roaming: false })
        },
        {
            id: 'blue-crowned-hanging-parrot',
            name: 'Blue-crowned Hanging Parrot',
            createPreview: () => createBlueCrownedHangingParrot({ position: new THREE.Vector3(0, 0, 0), boundarySize: 12, size: BLUE_CROWNED_HANGING_PARROT_SIZE * 1.25, roaming: false })
        }
    ];
}

// Lens presets: FOV-based only (compatible with both desktop and VR)
const DEFAULT_FOV = 75;
const LENS_PRESETS = [
    { label: '150MM', fov: 30 },
    { label: '85MM',  fov: 50 },
    { label: '50MM',  fov: 75 },
    { label: '35MM',  fov: 90 },
];
let activeLensIndex = -1;
let targetFov = DEFAULT_FOV;
let currentFov = DEFAULT_FOV;
let heldGlowTexture = null;
const XR_LENS_MIN_SCALE = 0.15;
const XR_LENS_MAX_SCALE = 2.5;

function getActiveLensProjectionScale() {
    if (activeLensIndex < 0) {
        return 1;
    }
    const preset = LENS_PRESETS[activeLensIndex];
    const defaultTan = Math.tan(THREE.MathUtils.degToRad(DEFAULT_FOV * 0.5));
    const presetTan = Math.tan(THREE.MathUtils.degToRad(preset.fov * 0.5));
    if (!Number.isFinite(defaultTan) || !Number.isFinite(presetTan) || defaultTan <= 0) {
        return 1;
    }
    return THREE.MathUtils.clamp(presetTan / defaultTan, XR_LENS_MIN_SCALE, XR_LENS_MAX_SCALE);
}

function applyLensProjectionScaleToMatrix(projectionMatrix, lensScale) {
    if (!projectionMatrix || !Number.isFinite(lensScale) || Math.abs(lensScale - 1) < 1e-4) {
        return;
    }
    const zoomMultiplier = 1 / lensScale;
    const elements = projectionMatrix.elements;
    elements[0] *= zoomMultiplier; // horizontal FOV term
    elements[5] *= zoomMultiplier; // vertical FOV term
}

function applyXRLensProjectionOverride() {
    if (!renderer?.xr?.isPresenting || activeLensIndex < 0) {
        return;
    }
    const xrCamera = renderer.xr.getCamera(camera);
    if (!xrCamera?.isArrayCamera || !xrCamera.cameras?.length) {
        return;
    }
    const lensScale = getActiveLensProjectionScale();
    xrCamera.cameras.forEach((eyeCamera) => {
        applyLensProjectionScaleToMatrix(eyeCamera.projectionMatrix, lensScale);
        eyeCamera.projectionMatrixInverse.copy(eyeCamera.projectionMatrix).invert();
    });
}

function ensureVRLensOverlay() {
    if (vrLensOverlaySprite || !scene) return;

    vrLensOverlayCanvas = document.createElement('canvas');
    vrLensOverlayCanvas.width = 1024;
    vrLensOverlayCanvas.height = 256;
    vrLensOverlayContext = vrLensOverlayCanvas.getContext('2d');
    if (!vrLensOverlayContext) return;

    vrLensOverlayTexture = new THREE.CanvasTexture(vrLensOverlayCanvas);
    if (renderer?.outputColorSpace) {
        vrLensOverlayTexture.colorSpace = renderer.outputColorSpace;
    }
    vrLensOverlayTexture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({
        map: vrLensOverlayTexture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false
    });
    vrLensOverlaySprite = new THREE.Sprite(material);
    vrLensOverlaySprite.scale.set(1.6, 0.38, 1);
    vrLensOverlaySprite.renderOrder = 9999;
    vrLensOverlaySprite.visible = false;
    scene.add(vrLensOverlaySprite);
}

function redrawVRLensOverlay(text) {
    ensureVRLensOverlay();
    if (!vrLensOverlayContext || !vrLensOverlayCanvas || !vrLensOverlayTexture) return;

    const ctx = vrLensOverlayContext;
    const width = vrLensOverlayCanvas.width;
    const height = vrLensOverlayCanvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(18, 52, 18, 0.8)';
    ctx.strokeStyle = 'rgba(42, 106, 42, 0.9)';
    ctx.lineWidth = 4;
    ctx.fillRect(8, 8, width - 16, height - 16);
    ctx.strokeRect(8, 8, width - 16, height - 16);

    ctx.fillStyle = '#d8f0d8';
    ctx.font = '600 96px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, width / 2, height / 2);

    vrLensOverlayTexture.needsUpdate = true;
}

function updateVRLensOverlay(time = performance.now()) {
    if (!renderer?.xr?.isPresenting || !vrLensOverlaySprite) {
        if (vrLensOverlaySprite) {
            vrLensOverlaySprite.visible = false;
        }
        return;
    }

    const visible = time <= vrLensOverlayVisibleUntil;
    vrLensOverlaySprite.visible = visible;
    if (!visible) return;

    const xrCamera = renderer.xr.getCamera(camera);
    const poseCamera = xrCamera || camera;
    if (!poseCamera) return;

    poseCamera.updateMatrixWorld(true);
    poseCamera.matrixWorld.decompose(vrLensOverlayPosition, vrLensOverlayQuaternion, vrLensOverlayScale);
    vrLensOverlayForward.set(0, -0.12, -1.3).applyQuaternion(vrLensOverlayQuaternion);
    vrLensOverlayPosition.add(vrLensOverlayForward);

    vrLensOverlaySprite.position.copy(vrLensOverlayPosition);
    vrLensOverlaySprite.quaternion.copy(vrLensOverlayQuaternion);
}

function showLensOverlayTemporarily() {
    if (!lensOverlay) return;

    lensOverlay.classList.add('is-visible');
    if (lensOverlayHideTimeoutId) {
        clearTimeout(lensOverlayHideTimeoutId);
    }
    lensOverlayHideTimeoutId = window.setTimeout(() => {
        lensOverlay.classList.remove('is-visible');
        lensOverlayHideTimeoutId = null;
    }, 2000);

    if (renderer?.xr?.isPresenting) {
        redrawVRLensOverlay(lensOverlayText?.textContent ?? 'Lens: OFF');
        vrLensOverlayVisibleUntil = performance.now() + 2000;
    }
}

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
        if (lensLabel) lensLabel.textContent = 'OFF';
        if (lensOverlayText) lensOverlayText.textContent = 'Lens: OFF';
        showLensOverlayTemporarily();
        syncMobileHud();
        return;
    }

    const preset = LENS_PRESETS[index];
    targetFov = preset.fov;

    if (lensLabel) lensLabel.textContent = preset.label;
    if (lensOverlayText) lensOverlayText.textContent = `Lens: ${preset.label}`;
    showLensOverlayTemporarily();
    syncMobileHud();
}

function cycleLensMode() {
    const nextLensIndex = activeLensIndex >= LENS_PRESETS.length - 1 ? -1 : activeLensIndex + 1;
    applyLensPreset(nextLensIndex);
}

function toggleViewfinder() {
    cycleLensMode();
}

function toggleAnimalCatalog() {
    if (!animalCatalogOverlay) return;
    if (renderer?.xr?.isPresenting) {
        animalCatalogOverlay.toggleVRBoard();
        return;
    }
    animalCatalogOverlay.toggle();
    syncMobileHud();
}

function updateViewfinderHudHint() {
    const hint = document.getElementById('vf-hud-hint');
    if (!hint) return;

    if (renderer?.xr?.isPresenting) {
        hint.textContent = 'A · capture  |  B · cycle lens  |  Y · catalog';
    } else if (deviceType === 'mobile') {
        hint.textContent = 'Camera button · capture  |  Eye button · cycle lens';
    } else {
        hint.textContent = 'SPACE · capture  |  C · cycle lens';
    }
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

function getHeldScaleMultiplier(targetType) {
    const isReducedVRHoldType = targetType === 'ocelot' || targetType === 'grosbeak';
    if (!isReducedVRHoldType || !renderer?.xr?.isPresenting) {
        return 1;
    }
    return HELD_VR_CREATURE_SCALE_MULTIPLIER;
}

function syncMobileHud() {
    const catalogButton = document.getElementById('mob-catalog');
    const viewfinderButton = document.getElementById('mob-viewfinder');
    const captureButton = document.getElementById('mob-capture');

    if (catalogButton) {
        catalogButton.classList.toggle('active', Boolean(animalCatalogOverlay?.isVisible));
    }

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


async function captureScene() {
    captureFlash.style.display = 'block';
    audioManager.playShutter();
    
    captureCounter++;
    const name = `capture_${captureCounter.toString().padStart(3, '0')}`;
    
    const countEl = document.getElementById('vf-capture-count');
    if (countEl) countEl.textContent = captureCounter.toString().padStart(3, '0');

    let dataUrl;
    if (renderer.xr?.isPresenting) {
        // Capture a single-perspective frame in XR (not side-by-side stereo).
        const xrCamera = renderer.xr.getCamera(camera);
        const sourceCamera = xrCamera?.isArrayCamera && xrCamera.cameras.length
            ? xrCamera.cameras[0] // left eye
            : xrCamera || camera;
        const viewport = sourceCamera?.viewport;
        const w = Math.max(1, Math.floor(viewport?.z || renderer.domElement.width || window.innerWidth));
        const h = Math.max(1, Math.floor(viewport?.w || renderer.domElement.height || window.innerHeight));
        const renderTarget = new THREE.WebGLRenderTarget(w, h);
        renderTarget.texture.colorSpace = renderer.outputColorSpace || THREE.SRGBColorSpace;
        const pixels = new Uint8Array(w * h * 4);
        const captureCamera = camera.clone();
        const wasXrEnabled = renderer.xr.enabled;
        const hiddenObjects = [...xrControllers, ...xrControllerGrips, ...xrHands];
        const visibilityState = new Map();

        captureCamera.matrixAutoUpdate = false;
        captureCamera.matrixWorld.copy(sourceCamera.matrixWorld);
        captureCamera.matrixWorldInverse.copy(sourceCamera.matrixWorldInverse);
        captureCamera.projectionMatrix.copy(sourceCamera.projectionMatrix);
        captureCamera.projectionMatrixInverse.copy(sourceCamera.projectionMatrixInverse);
        captureCamera.near = sourceCamera.near;
        captureCamera.far = sourceCamera.far;
        captureCamera.layers.mask = sourceCamera.layers.mask;
        if (activeLensIndex >= 0) {
            applyLensProjectionScaleToMatrix(captureCamera.projectionMatrix, getActiveLensProjectionScale());
            captureCamera.projectionMatrixInverse.copy(captureCamera.projectionMatrix).invert();
        }

        renderer.xr.enabled = false;
        try {
            hiddenObjects.forEach((obj) => {
                visibilityState.set(obj, obj.visible);
                obj.visible = false;
            });
            renderer.setRenderTarget(renderTarget);
            renderer.render(scene, captureCamera);
            renderer.readRenderTargetPixels(renderTarget, 0, 0, w, h, pixels);
        } finally {
            hiddenObjects.forEach((obj) => {
                const wasVisible = visibilityState.get(obj);
                obj.visible = wasVisible === undefined ? true : wasVisible;
            });
            renderer.setRenderTarget(null);
            renderer.xr.enabled = wasXrEnabled;
            renderTarget.dispose();
        }

        // WebGL pixel rows are bottom-to-top; flip vertically before drawing to canvas.
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = w;
        tmpCanvas.height = h;
        const ctx = tmpCanvas.getContext('2d');
        const imageData = ctx.createImageData(w, h);
        for (let row = 0; row < h; row++) {
            const srcRow = h - 1 - row;
            imageData.data.set(
                pixels.subarray(srcRow * w * 4, (srcRow + 1) * w * 4),
                row * w * 4
            );
        }
        ctx.putImageData(imageData, 0, 0);
        dataUrl = tmpCanvas.toDataURL('image/png');
    } else {
        renderer.render(scene, camera);
        dataUrl = renderer.domElement.toDataURL('image/png');
    }
    
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
        const catalogToggle = document.getElementById('catalog-toggle');
        catalogToggle.classList.add('visible');
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
            optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'dom-overlay'],
            domOverlay: { root: document.body }
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

    document.getElementById('catalog-toggle').addEventListener('click', () => {
        toggleAnimalCatalog();
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

    const grosbeakCount = 4 + Math.floor(Math.random() * 2); // 4-5
    const tanagerCount = 4 + Math.floor(Math.random() * 2); // 4-5
    const orioleCount = 4 + Math.floor(Math.random() * 2); // 4-5
    const hangingParrotCount = 4 + Math.floor(Math.random() * 2); // 4-5
    const birdSpawnHalf = boundarySize / 2 - 5;
    for (let i = 0; i < grosbeakCount; i++) {
        const x = THREE.MathUtils.randFloat(-birdSpawnHalf, birdSpawnHalf);
        const z = THREE.MathUtils.randFloat(-birdSpawnHalf, birdSpawnHalf);
        spawnGrosbeak(x, z);
    }
    for (let i = 0; i < tanagerCount; i++) {
        const x = THREE.MathUtils.randFloat(-birdSpawnHalf, birdSpawnHalf);
        const z = THREE.MathUtils.randFloat(-birdSpawnHalf, birdSpawnHalf);
        spawnWesternTanager(x, z);
    }
    for (let i = 0; i < orioleCount; i++) {
        const x = THREE.MathUtils.randFloat(-birdSpawnHalf, birdSpawnHalf);
        const z = THREE.MathUtils.randFloat(-birdSpawnHalf, birdSpawnHalf);
        spawnBlackNapedOriole(x, z);
    }
    for (let i = 0; i < hangingParrotCount; i++) {
        const x = THREE.MathUtils.randFloat(-birdSpawnHalf, birdSpawnHalf);
        const z = THREE.MathUtils.randFloat(-birdSpawnHalf, birdSpawnHalf);
        spawnBlueCrownedHangingParrot(x, z);
    }
    console.log(`Spawned ${grosbeakCount} grosbeaks`);
    console.log(`Spawned ${tanagerCount} western tanagers`);
    console.log(`Spawned ${orioleCount} black-naped orioles`);
    console.log(`Spawned ${hangingParrotCount} blue-crowned hanging parrots`);

    animalCatalogOverlay = new AnimalCatalogOverlay({
        scene,
        renderer,
        camera,
        items: createAnimalCatalogItems()
    });
    
    updateControlInstructions();
    updateDashboard();
    syncMobileHud();
    syncMobilePanel();
    startStandardRenderLoop();
    
    renderer.xr.addEventListener('sessionstart', () => {
        stopStandardRenderLoop();
        renderer.setAnimationLoop(renderFrame);
        ensureVRLensOverlay();
        animalCatalogOverlay?.hide();
        updateViewfinderHudHint();
    });
    
    renderer.xr.addEventListener('sessionend', () => {
        renderer.setAnimationLoop(null);
        startStandardRenderLoop();
        if (vrLensOverlaySprite) {
            vrLensOverlaySprite.visible = false;
        }
        animalCatalogOverlay?.hideVRBoard();
        updateViewfinderHudHint();
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
                    xrCompatible: true,
                    preserveDrawingBuffer: true
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
            antialias: true,
            preserveDrawingBuffer: true
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
        spawnInstruction.textContent = 'Click creatures to interact';
        cameraInstruction.textContent = 'Drag empty space to rotate view | Scroll to zoom | C: cycle lens | Space: capture scene | Catalog button: species viewer';
    } else if (deviceType === 'mobile') {
        spawnInstruction.textContent = 'Tap cat to interact';
        cameraInstruction.textContent = 'Drag to rotate · Pinch to zoom · Grid button: species viewer';
    } else {
        spawnInstruction.textContent = 'Point controller ray at a creature and press trigger to interact';
        cameraInstruction.textContent = 'Left stick: move · Right stick: look · B: cycle lens · Y: catalog · A: capture';
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
        xrControllerGrips.push(grip);
        
        const hand = renderer.xr.getHand(i);
        hand.userData.sourceId = `hand-${i + 1}`;
        hand.add(handModelFactory.createHandModel(hand, 'mesh'));
        cameraRig.add(hand);
        xrHands.push(hand);
    }
    
    // Show controls button when XR is available
    const controlsToggle = document.getElementById('controls-toggle');
    controlsToggle.classList.add('visible');
    const catalogToggle = document.getElementById('catalog-toggle');
    catalogToggle.classList.add('visible');
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

function clearPendingDesktopInteraction() {
    pendingDesktopInteraction.active = false;
    pendingDesktopInteraction.target = null;
}

function startPendingDesktopInteraction(clientX, clientY) {
    const picked = raycastPickableFromScreen(clientX, clientY);
    if (!picked) return false;
    pendingDesktopInteraction.active = true;
    pendingDesktopInteraction.target = picked;
    return true;
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
        if (!hasDragged && target) {
            suppressNextClickInteraction = true;
            triggerPickableInteraction(target, 'cursor');
        }
        isDragging = false;
        hasDragged = false;
        return;
    }

    isDragging = false;
    hasDragged = false;
}

function onDocumentMouseOut(event) {
    if (event.relatedTarget || event.toElement) {
        return;
    }
    if (pendingDesktopInteraction.active) {
        clearPendingDesktopInteraction();
    }
    isDragging = false;
    hasDragged = false;
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

function onTouchCancel() {
    isDragging = false;
    hasDragged = false;
    clearPendingDesktopInteraction();
}

function onWindowBlur() {
    clearPendingDesktopInteraction();
    isDragging = false;
    hasDragged = false;
}

function onVisibilityChange() {
    if (document.hidden) {
        clearPendingDesktopInteraction();
        isDragging = false;
        hasDragged = false;
    }
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
    const mobCatalog = document.getElementById('mob-catalog');
    const mobViewfinder = document.getElementById('mob-viewfinder');
    const mobCapture = document.getElementById('mob-capture');
    const mobPanelToggle = document.getElementById('mob-panel-toggle');
    const mobileQuickPanel = document.getElementById('mobile-quick-panel');
    const mobilePanelShell = mobileQuickPanel?.querySelector('.mobile-panel-shell');
    const mobilePanelClose = document.getElementById('mobile-panel-close');
    const mobileAudioToggle = document.getElementById('mobile-audio-toggle');
    const mobileControlsGuide = document.getElementById('mobile-controls-guide');
    const audioToggle = document.getElementById('audio-toggle');

    mobCatalog.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleAnimalCatalog();
    });

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
        const sizeVariation = THREE.MathUtils.randFloat(OCELOT_SIZE_VARIATION_MIN, OCELOT_SIZE_VARIATION_MAX);
        const ocelot = createOcelot({
            position: new THREE.Vector3(x, groundY, z),
            boundarySize: boundarySize,
            size: OCELOT_SIZE * sizeVariation
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
            size: GROSBEAK_SIZE,
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

function spawnWesternTanager(x, z) {
    try {
        const groundY = getTerrainY(x, z);
        const tanager = createWesternTanager({
            position: new THREE.Vector3(x, groundY, z),
            boundarySize,
            size: WESTERN_TANAGER_SIZE,
            roaming: true,
            constrainPosition: (position) => {
                environment?.constrainPositionAgainstHouse(position, xrCollisionPadding);
            }
        });

        if (tanager && tanager.group) {
            grosbeaks.push(tanager);
            scene.add(tanager.group);
            registerGrosbeakMeshes(tanager);
            return tanager;
        }
    } catch (error) {
        console.error('Failed to spawn western tanager at', x, z, ':', error);
        return null;
    }
}

function spawnBlackNapedOriole(x, z) {
    try {
        const groundY = getTerrainY(x, z);
        const oriole = createBlackNapedOriole({
            position: new THREE.Vector3(x, groundY, z),
            boundarySize,
            size: BLACK_NAPED_ORIOLE_SIZE,
            roaming: true,
            constrainPosition: (position) => {
                environment?.constrainPositionAgainstHouse(position, xrCollisionPadding);
            }
        });

        if (oriole && oriole.group) {
            grosbeaks.push(oriole);
            scene.add(oriole.group);
            registerGrosbeakMeshes(oriole);
            return oriole;
        }
    } catch (error) {
        console.error('Failed to spawn black-naped oriole at', x, z, ':', error);
        return null;
    }
}

function spawnBlueCrownedHangingParrot(x, z) {
    try {
        const groundY = getTerrainY(x, z);
        const hangingParrot = createBlueCrownedHangingParrot({
            position: new THREE.Vector3(x, groundY, z),
            boundarySize,
            size: BLUE_CROWNED_HANGING_PARROT_SIZE,
            roaming: true,
            constrainPosition: (position) => {
                environment?.constrainPositionAgainstHouse(position, xrCollisionPadding);
            }
        });

        if (hangingParrot && hangingParrot.group) {
            grosbeaks.push(hangingParrot);
            scene.add(hangingParrot.group);
            registerGrosbeakMeshes(hangingParrot);
            return hangingParrot;
        }
    } catch (error) {
        console.error('Failed to spawn blue-crowned hanging parrot at', x, z, ':', error);
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
        targetType: target.type,
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

function computeTossReleaseVelocity(target, history, fallback, maxSpeed = 8) {
    let releaseVelocity = calculateReleaseVelocity(history, fallback).clampLength(0, maxSpeed);
    if (!target || target.type === 'butterfly') {
        return applyImmediateReleaseDrop(releaseVelocity);
    }

    if (isStillRelease(history)) {
        releaseVelocity = applyStillReleaseDrop(target, history, releaseVelocity);
        return applyImmediateReleaseDrop(releaseVelocity);
    }

    const horizontalSpeed = Math.hypot(releaseVelocity.x, releaseVelocity.z);
    const tossLift = THREE.MathUtils.clamp(0.55 + horizontalSpeed * 0.16, 0.55, 1.3);
    releaseVelocity.y = Math.max(releaseVelocity.y, tossLift);
    return releaseVelocity;
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

function releaseDesktopGrab(options = {}) {
    if (!desktopGrabState.active) return null;

    const {
        allowTap = true,
        fallbackVelocity = null
    } = options;
    const heldMs = performance.now() - (desktopGrabState.startedAt || performance.now());
    const target = desktopGrabState.target;
    const shouldTreatAsTap = allowTap && !desktopGrabState.moved && heldMs < 180;
    let releaseVelocity = fallbackVelocity ? fallbackVelocity.clone() : new THREE.Vector3(0, 0.4, 0);

    if (!shouldTreatAsTap) {
        if (!fallbackVelocity) {
            camera.getWorldDirection(tmpCameraDirection);
            const fallback = tmpCameraDirection.clone().multiplyScalar(1.2).setY(0.8);
            releaseVelocity = computeTossReleaseVelocity(target, desktopGrabState.history, fallback, 8);
        } else {
            releaseVelocity = calculateReleaseVelocity(desktopGrabState.history, fallbackVelocity).clampLength(0, 8);
            releaseVelocity = applyImmediateReleaseDrop(releaseVelocity);
        }
    }

    endGrab(
        desktopGrabState.sourceId,
        shouldTreatAsTap ? new THREE.Vector3() : releaseVelocity
    );
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

    return target;
}

function releaseXRGrab(sourceId, sourceQuaternion = null, forceDrop = false) {
    const grab = xrGrabStates.get(sourceId);
    if (!grab) return null;

    let releaseVelocity;
    if (forceDrop) {
        releaseVelocity = new THREE.Vector3(0, -0.75, 0);
        releaseVelocity = applyImmediateReleaseDrop(releaseVelocity);
    } else {
        const fallback = new THREE.Vector3(0, 1.1, -0.8);
        if (sourceQuaternion) {
            fallback.applyQuaternion(sourceQuaternion);
        }
        releaseVelocity = computeTossReleaseVelocity(grab.target, grab.history, fallback, 9);
    }

    return endGrab(sourceId, releaseVelocity);
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
            const shouldFinalizeGrounded = state.releaseTimer <= -0.35 && nearTerrain;

            if (state.body.position.y <= settleY) {
                state.body.position.y = settleY;
                if (state.body.velocity.y < 0) {
                    state.body.velocity.y = 0;
                }
            }

            if ((state.releaseTimer <= 0 && nearTerrain && verticalSpeed < 0.35) || shouldFinalizeGrounded) {
                state.body.position.y = settleY;
                state.body.velocity.set(0, 0, 0);
                state.body.angularVelocity.set(0, 0, 0);
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
            releaseXRGrab(sourceId, null, true);
        }
    }
}

function updateHeldVisualStates(time) {
    for (const [entity, state] of heldVisualStates.entries()) {
        if (!state.active) continue;

        const physicsState = entityPhysicsStates.get(entity);
        if (!physicsState || physicsState.mode !== 'held') {
            state.active = false;
            state.glow.visible = false;
            entity.group.scale.copy(state.baseScale);
            continue;
        }

        const elapsed = Math.max(0, time - state.startedAt);
        const pulseProgress = Math.min(elapsed / HELD_PULSE_DURATION_MS, 1);
        const pulse = Math.sin(Math.min(pulseProgress, 1) * Math.PI);
        const settleScale = 1 + HELD_SCALE_BOOST * (0.45 + 0.55 * pulse);
        const heldScaleMultiplier = getHeldScaleMultiplier(state.targetType);
        const liftOffset = HELD_PULSE_HEIGHT * pulse;

        entity.group.scale.copy(state.baseScale).multiplyScalar(settleScale * heldScaleMultiplier);

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
        triggerPickableInteraction(picked, sourceId);
        return;
    }

    // Keep legacy trigger semantics when no target is found.
    lastInteractionLabel = `${sourceId}: no target`;
    updateDashboard();
}

function onXRSelectEnd(event) {
    const controller = event.target;
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

    // Per the `xr-standard` gamepad mapping spec, the primary thumbstick is at
    // axes[2] (X) and axes[3] (Y). axes[0/1] are reserved for a primary touchpad
    // (Quest controllers have no touchpad, so these are always 0 placeholders).
    // Fall back to axes[0/1] only for non-standard runtimes that don't report axes[2/3].
    let rawX = 0;
    let rawY = 0;

    if (axes.length >= 4 && (Number.isFinite(axes[2]) || Number.isFinite(axes[3]))) {
        rawX = Number.isFinite(axes[2]) ? axes[2] : 0;
        rawY = Number.isFinite(axes[3]) ? axes[3] : 0;
    } else {
        rawX = Number.isFinite(axes[0]) ? axes[0] : 0;
        rawY = Number.isFinite(axes[1]) ? axes[1] : 0;
    }

    return {
        x: Math.abs(rawX) > VR_DEAD_ZONE ? rawX : 0,
        y: Math.abs(rawY) > VR_DEAD_ZONE ? rawY : 0
    };
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

        // Meta Quest button mapping (standard WebXR gamepad):
        //   Right controller: A = buttons[4], B = buttons[5]
        //   Left controller:  X = buttons[4], Y = buttons[5]
        if (buttons && buttons.length) {
            if (source.handedness === 'right') {
                // A (buttons[4]): capture scene when viewfinder is active
                if (buttons[4]?.pressed && !xrInteractionCooldown.get('xr-capture')) {
                    if (cameraViewfinderActive) captureScene();
                    xrInteractionCooldown.set('xr-capture', true);
                    setTimeout(() => xrInteractionCooldown.delete('xr-capture'), 400);
                }
                // B (buttons[5]): cycle through lens presets; wraps back to OFF
                if (buttons[5]?.pressed && !xrInteractionCooldown.get('xr-lens-cycle')) {
                    cycleLensMode();
                    xrInteractionCooldown.set('xr-lens-cycle', true);
                    setTimeout(() => xrInteractionCooldown.delete('xr-lens-cycle'), 400);
                }
            } else if (source.handedness === 'left') {
                // Y (buttons[5]): toggle animal catalog board in VR
                if (buttons[5]?.pressed && !xrInteractionCooldown.get('xr-catalog-toggle')) {
                    animalCatalogOverlay?.toggleVRBoard();
                    xrInteractionCooldown.set('xr-catalog-toggle', true);
                    setTimeout(() => xrInteractionCooldown.delete('xr-catalog-toggle'), 400);
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

        // Smooth FOV transition for desktop/non-VR.
        if (!renderer.xr.isPresenting && Math.abs(currentFov - targetFov) > 0.01) {
            currentFov += (targetFov - currentFov) * Math.min(delta * 6, 1);
            camera.fov = currentFov;
            camera.updateProjectionMatrix();
        }

        updateVRLensOverlay(time);
        animalCatalogOverlay?.update(
            delta,
            time,
            renderer.xr.isPresenting ? renderer.xr.getCamera(camera) : camera,
            renderer.xr.isPresenting
        );
        applyXRLensProjectionOverride();
        renderer.render(scene, camera);
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
