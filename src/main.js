import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/examples/jsm/webxr/XRHandModelFactory.js';
import { createOcelot } from './components/VoxelOcelot.js';
import { createButterfly } from './components/VoxelButterfly.js';
import { AudioManager } from './audio/AudioManager.js';
import { Environment } from './components/Environment.js';

let scene, camera, renderer, cameraRig;
let ocelots = [];
let butterflies = [];
let environment; // Add environment reference
let floor;
let cameraAngle = 0;
let cameraRadius = 15;
let cameraHeight = 8;
const boundarySize = 45;
let currentRenderer = null;
let rendererType = 'unknown';

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
const ocelotMeshes = [];
const ocelotMeshToEntity = new Map();
const xrControllers = [];
const xrHands = [];
const xrInteractionCooldown = new Map();
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
let captureCounter = 0; // For incremental folder naming
const viewfinderOverlay = document.getElementById('viewfinder-overlay');
const captureFlash = document.getElementById('capture-flash');

function toggleViewfinder() {
    cameraViewfinderActive = !cameraViewfinderActive;
    viewfinderOverlay.style.display = cameraViewfinderActive ? 'block' : 'none';
    document.body.classList.toggle('viewfinder-active', cameraViewfinderActive);
}

async function captureScene() {
    captureFlash.style.display = 'block';
    audioManager.playShutter();

    captureCounter++;
    const name = `capture_${captureCounter.toString().padStart(3, '0')}`;

    const countEl = document.getElementById('vf-capture-count');
    if (countEl) countEl.textContent = captureCounter.toString().padStart(3, '0');

    renderer.render(scene, camera);
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

    // Initialize scene first
    scene = new THREE.Scene();
    if (!scene) {
        console.error('Failed to create scene');
        displayFatalError('Failed to initialize 3D scene');
        return;
    }
    console.log('Scene created successfully');

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
        fallbackButton.style.background = '#ff0000';
        fallbackButton.style.color = 'white';
        fallbackButton.style.border = 'none';
        fallbackButton.style.borderRadius = '5px';
        fallbackButton.style.zIndex = '1000';
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

    try {
        audioManager = new AudioManager(state => {
            audioState = state;
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

    updateControlInstructions();
    updateDashboard();
    startStandardRenderLoop();

    renderer.xr.addEventListener('sessionstart', () => {
        stopStandardRenderLoop();
        renderer.setAnimationLoop(renderFrame);
    });

    renderer.xr.addEventListener('sessionend', () => {
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
    errorDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
    errorDiv.style.color = 'white';
    errorDiv.style.display = 'flex';
    errorDiv.style.flexDirection = 'column';
    errorDiv.style.alignItems = 'center';
    errorDiv.style.justifyContent = 'center';
    errorDiv.style.fontSize = '24px';
    errorDiv.style.zIndex = '9999';
    errorDiv.innerHTML = `
        <h2>Application Error</h2>
        <p>${message}</p>
        <p>Please check the browser console for more details.</p>
        <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #FFD700; color: black; border: none; border-radius: 5px; cursor: pointer;">Reload Page</button>
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

    if (deviceType === 'desktop') {
        spawnInstruction.textContent = 'Click floor to spawn | Click cat to interact';
        cameraInstruction.textContent = 'Drag to rotate view | Scroll to zoom | Enter VR for hand interaction | C: toggle viewfinder | Space: capture scene';
    } else if (deviceType === 'mobile') {
        spawnInstruction.textContent = 'Tap floor to spawn | Tap cat to interact';
        cameraInstruction.textContent = 'Drag to rotate view | Pinch to zoom | Enter VR for hand interaction';
    } else {
        spawnInstruction.textContent = 'Point controller ray at a cat and pull trigger to interact';
        cameraInstruction.textContent = 'Left stick: move · Right stick: look';
    }
}

function setupXRInteraction() {
    const controllerModelFactory = new XRControllerModelFactory();
    const handModelFactory = new XRHandModelFactory();

    for (let i = 0; i < 2; i++) {
        const controller = renderer.xr.getController(i);
        controller.userData.sourceId = `controller-${i + 1}`;
        controller.addEventListener('selectstart', onXRSelectStart);
        cameraRig.add(controller);
        xrControllers.push(controller);

        const controllerRay = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, -6)
            ]),
            new THREE.LineBasicMaterial({ color: 0xffffff })
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

function onMouseDown(event) {
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
        previousMousePosition = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }
}

function onTouchMove(event) {
    if (!isDragging || event.touches.length !== 1) return;
    event.preventDefault();

    const deltaX = event.touches[0].clientX - previousMousePosition.x;
    const deltaY = event.touches[0].clientY - previousMousePosition.y;

    cameraAngle += deltaX * 0.01;
    cameraHeight = Math.max(3, Math.min(20, cameraHeight - deltaY * 0.05));

    updateCameraPosition();

    previousMousePosition = { x: event.touches[0].clientX, y: event.touches[0].clientY };
}

function onTouchEnd() {
    isDragging = false;
}

function spawnOcelot(x, z) {
    try {
        const ocelot = createOcelot({
            position: new THREE.Vector3(x, 0, z),
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
            return butterfly;
        }
    } catch (error) {
        console.error('Failed to spawn butterfly at', x, z, ':', error);
        return null;
    }
}

function registerOcelotMeshes(ocelot) {
    ocelot.group.traverse(child => {
        if (child.isMesh) {
            ocelotMeshes.push(child);
            ocelotMeshToEntity.set(child, ocelot);
        }
    });
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
}

function onMouseClick(event) {
    if (event.target !== renderer.domElement) {
        return;
    }

    // Only spawn if we didn't drag the mouse
    if (hasDragged) {
        hasDragged = false;
        return;
    }

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const ocelotHits = raycaster.intersectObjects(ocelotMeshes, false);
    if (ocelotHits.length > 0) {
        const ocelot = ocelotMeshToEntity.get(ocelotHits[0].object);
        if (ocelot) {
            triggerOcelotInteraction(ocelot, 'cursor');
            return;
        }
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
        toggleViewfinder();
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
    const interactionTarget = raycastOcelotFromXR(controller);

    if (interactionTarget) {
        triggerOcelotInteraction(interactionTarget, controller.userData.sourceId);
    }
}

function raycastOcelotFromXR(sourceObject) {
    xrDirectionMatrix.identity().extractRotation(sourceObject.matrixWorld);
    xrRayOrigin.setFromMatrixPosition(sourceObject.matrixWorld);
    xrRayDirection.set(0, 0, -1).applyMatrix4(xrDirectionMatrix);

    raycaster.ray.origin.copy(xrRayOrigin);
    raycaster.ray.direction.copy(xrRayDirection).normalize();

    const intersects = raycaster.intersectObjects(ocelotMeshes, false);
    if (!intersects.length) return null;
    return ocelotMeshToEntity.get(intersects[0].object) || null;
}

function handleXRHandInteractions() {
    if (!renderer.xr.isPresenting) return;

    const now = performance.now();

    xrHands.forEach(hand => {
        const handJoint = hand.joints?.['index-finger-tip'] || hand.joints?.['middle-finger-tip'];
        if (!handJoint) return;

        const handPos = xrRayOrigin.setFromMatrixPosition(handJoint.matrixWorld);
        let nearestOcelot = null;
        let nearestDistance = Number.POSITIVE_INFINITY;

        ocelots.forEach(ocelot => {
            const distance = handPos.distanceTo(ocelot.group.position);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestOcelot = ocelot;
            }
        });

        const sourceId = hand.userData.sourceId;
        const lastHit = xrInteractionCooldown.get(sourceId) || 0;
        const cooldownMs = 700;

        if (nearestOcelot && nearestDistance < 1.3 && now - lastHit > cooldownMs) {
            triggerOcelotInteraction(nearestOcelot, sourceId);
            xrInteractionCooldown.set(sourceId, now);
        }
    });
}

function handleXRLocomotion(delta) {
    if (!renderer.xr.isPresenting) return;

    const session = renderer.xr.getSession();
    if (!session) return;

    for (const source of session.inputSources) {
        if (!source.gamepad) continue;
        const axes = source.gamepad.axes;
        if (!axes || axes.length < 4) continue;

        const stickX = Math.abs(axes[2]) > VR_DEAD_ZONE ? axes[2] : 0;
        const stickY = Math.abs(axes[3]) > VR_DEAD_ZONE ? axes[3] : 0;

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
        } else if (source.handedness === 'right') {
            cameraRig.rotation.y -= stickX * VR_LOOK_SPEED * delta;
        }
    }
}

function renderFrame(time = performance.now()) {
    try {
        const delta = Math.min((time - lastFrameTime) / 1000, 0.1);
        lastFrameTime = time;

        ocelots.forEach(ocelot => {
            ocelot.animate();
        });

        butterflies.forEach(butterfly => {
            butterfly.animate();
        });

        // Update environment if it has an update method
        if (environment && typeof environment.update === 'function') {
            environment.update();
        }

        handleXRLocomotion(delta);
        handleXRHandInteractions();

        updateDashboard();
        renderer.render(scene, camera);
    } catch (error) {
        console.error('Error in render loop:', error);
        // Display error message on screen
        const errorMessage = document.createElement('div');
        errorMessage.id = 'render-error';
        errorMessage.style.position = 'absolute';
        errorMessage.style.top = '10px';
        errorMessage.style.right = '10px';
        errorMessage.style.background = 'rgba(255, 0, 0, 0.8)';
        errorMessage.style.color = 'white';
        errorMessage.style.padding = '10px';
        errorMessage.style.borderRadius = '5px';
        errorMessage.style.zIndex = '1000';
        errorMessage.style.maxWidth = '300px';
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