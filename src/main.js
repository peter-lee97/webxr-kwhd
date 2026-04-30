import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/examples/jsm/webxr/XRHandModelFactory.js';
import { createOcelot } from './components/VoxelOcelot.js';
import { createButterfly } from './components/VoxelButterfly.js';
import { AudioManager } from './audio/AudioManager.js';
import { Environment } from './components/Environment.js';

let scene, camera, renderer;
let ocelots = [];
let butterflies = [];
let environment; // Add environment reference
let floor;
let cameraAngle = 0;
let cameraRadius = 15;
let cameraHeight = 8;
const boundarySize = 45;
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

function init() {
    const container = document.body;
    
    detectDevice();

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x6a8c6a, 20, 100); // Forest-green fog

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, cameraHeight, cameraRadius);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);
    document.body.appendChild(VRButton.createButton(renderer, {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
    }));

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
    environment = new Environment(scene);
    
    setupXRInteraction();
    
    setupControls();
    
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('click', onMouseClick);
    document.addEventListener('keydown', onKeyDown);

    audioManager = new AudioManager(state => {
        audioState = state;
    });
    audioManager.attachControls({
        toggleButton: document.getElementById('audio-toggle'),
        statusLabel: document.getElementById('audio-status')
    });
    audioManager.tryAutoplayOnLoad();
    
    for (let i = 0; i < 3; i++) {
        const x = (Math.random() - 0.5) * boundarySize;
        const z = (Math.random() - 0.5) * boundarySize;
        spawnOcelot(x, z);
    }

    // Seed the scene with ambient butterflies
    const butterflyCount = 10 + Math.floor(Math.random() * 6); // 10–15
    for (let i = 0; i < butterflyCount; i++) {
        const x = (Math.random() - 0.5) * boundarySize;
        const z = (Math.random() - 0.5) * boundarySize;
        spawnButterfly(x, z);
    }

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
}

function updateControlInstructions() {
    const spawnInstruction = document.getElementById('spawn-instruction');
    const cameraInstruction = document.getElementById('camera-instruction');
    
    if (deviceType === 'desktop') {
        spawnInstruction.textContent = 'Click floor to spawn | Click cat to interact';
        cameraInstruction.textContent = 'Drag to rotate view | Scroll to zoom | Enter VR for hand interaction';
    } else if (deviceType === 'mobile') {
        spawnInstruction.textContent = 'Tap floor to spawn | Tap cat to interact';
        cameraInstruction.textContent = 'Drag to rotate view | Pinch to zoom | Enter VR for hand interaction';
    } else {
        spawnInstruction.textContent = 'Interact with controller/hand rays to trigger cat reactions';
        cameraInstruction.textContent = 'Use controller to rotate/move and interact with cats';
    }
}

function setupXRInteraction() {
    const controllerModelFactory = new XRControllerModelFactory();
    const handModelFactory = new XRHandModelFactory();

    for (let i = 0; i < 2; i++) {
        const controller = renderer.xr.getController(i);
        controller.userData.sourceId = `controller-${i + 1}`;
        controller.addEventListener('selectstart', onXRSelectStart);
        scene.add(controller);
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
        scene.add(grip);

        const hand = renderer.xr.getHand(i);
        hand.userData.sourceId = `hand-${i + 1}`;
        hand.add(handModelFactory.createHandModel(hand, 'mesh'));
        scene.add(hand);
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
    const ocelot = createOcelot({
        position: new THREE.Vector3(x, 0, z),
        boundarySize: boundarySize
    });
    
    ocelots.push(ocelot);
    scene.add(ocelot.group);
    registerOcelotMeshes(ocelot);
    
    updateDashboard();
    
    return ocelot;
}

function registerOcelotMeshes(ocelot) {
    ocelot.group.traverse(child => {
        if (child.isMesh) {
            ocelotMeshes.push(child);
            ocelotMeshToEntity.set(child, ocelot);
        }
    });
}

function spawnButterfly(x, z) {
    const butterfly = createButterfly({
        position: new THREE.Vector3(x, 3 + Math.random() * 4, z),
        boundarySize
    });
    butterflies.push(butterfly);
    scene.add(butterfly.group);
    return butterfly;
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

    // Raycast against the environment ground
    const intersects = raycaster.intersectObject(environment.ground);
    
    if (intersects.length > 0) {
        const point = intersects[0].point;
        const clampedX = Math.max(-boundarySize + 2, Math.min(boundarySize - 2, point.x));
        const clampedZ = Math.max(-boundarySize + 2, Math.min(boundarySize - 2, point.z));
        spawnOcelot(clampedX, clampedZ);
    }
}

function triggerOcelotInteraction(ocelot, sourceId) {
    const interaction = ocelot.interact(sourceId);
    if (interaction.sound) {
        audioManager.playSfx(interaction.sound);
    }
    lastInteractionLabel = `${sourceId}: ${interaction.sound || 'no-sound'}`;
    updateDashboard();
}

function onKeyDown(event) {
    if (event.code === 'Space') {
        spawnOcelot(0, 0);
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
    }
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
}

function onXRSelectStart(event) {
    const controller = event.target;
    const interactionTarget = raycastOcelotFromXR(controller);
    if (!interactionTarget) return;
    triggerOcelotInteraction(interactionTarget, controller.userData.sourceId);
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

function renderFrame() {
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

    handleXRHandInteractions();
    updateDashboard();
    renderer.render(scene, camera);
}

function startStandardRenderLoop() {
    if (standardAnimationFrameId !== null) return;

    const loop = () => {
        renderFrame();
        standardAnimationFrameId = requestAnimationFrame(loop);
    };

    standardAnimationFrameId = requestAnimationFrame(loop);
}

function stopStandardRenderLoop() {
    if (standardAnimationFrameId === null) return;
    cancelAnimationFrame(standardAnimationFrameId);
    standardAnimationFrameId = null;
}

init();
