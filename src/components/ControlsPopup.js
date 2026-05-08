import * as THREE from 'three';

export class ControlsPopup {
    constructor() {
        this.isOpen = false;
        this.element = null;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = [];
        this.init();
    }

    init() {
        // Create the popup element
        this.element = document.createElement('div');
        this.element.id = 'controls-popup';
        this.element.className = 'controls-popup';
        this.element.innerHTML = `
            <div class="controls-header">
                <h2>Controls Guide</h2>
                <button class="close-btn" id="close-controls">×</button>
            </div>
            <div class="controls-content">
                <div class="controls-section" id="desktop-controls">
                    <h3>Desktop Controls</h3>
                    <div class="control-item">
                        <div class="control-key">Click</div>
                        <div class="control-desc">Interact with cats</div>
                    </div>
                    <div class="control-item">
                        <div class="control-key">C</div>
                        <div class="control-desc">Toggle viewfinder</div>
                    </div>
                    <div class="control-item">
                        <div class="control-key">Space</div>
                        <div class="control-desc">Capture scene (in viewfinder)</div>
                    </div>
                    <div class="control-item">
                        <div class="control-key">← → ↑ ↓</div>
                        <div class="control-desc">Rotate/zoom camera</div>
                    </div>
                    <div class="control-item">
                        <div class="control-key">Drag</div>
                        <div class="control-desc">Rotate view</div>
                    </div>
                    <div class="control-item">
                        <div class="control-key">Scroll</div>
                        <div class="control-desc">Zoom camera</div>
                    </div>
                </div>
                <div class="controls-section" id="vr-controls">
                    <h3>VR Controls</h3>
                    <div class="control-item">
                        <div class="control-key">Trigger</div>
                        <div class="control-desc">Interact with cats</div>
                    </div>
                    <div class="control-item">
                        <div class="control-key">Y Button</div>
                        <div class="control-desc">Toggle viewfinder</div>
                    </div>
                    <div class="control-item">
                        <div class="control-key">Left Stick</div>
                        <div class="control-desc">Move</div>
                    </div>
                    <div class="control-item">
                        <div class="control-key">Right Stick</div>
                        <div class="control-desc">Look around</div>
                    </div>
                </div>
                <div class="controls-visual" id="controls-visual"></div>
            </div>
        `;
        
        document.body.appendChild(this.element);
        
        // Add event listeners
        document.getElementById('close-controls').addEventListener('click', () => {
            this.hide();
        });
        
        // Add keyboard shortcut to toggle popup
        document.addEventListener('keydown', (e) => {
            if (e.key === 'F1') {
                e.preventDefault();
                this.toggle();
            }
        });
        
        // Initialize Three.js scene for visual controls
        this.initVisualControls();
    }
    
    initVisualControls() {
        const container = document.getElementById('controls-visual');
        if (!container) return;
        
        // Create scene for visual controls
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setClearColor(0x000000, 0);
        container.appendChild(this.renderer.domElement);
        
        // Add lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1, 1, 1);
        this.scene.add(directionalLight);
        
        // Create controller model
        this.createControllerModel();
        
        // Position camera
        this.camera.position.z = 5;
        
        // Start animation loop
        this.animate();
        
        // Handle resize
        window.addEventListener('resize', () => {
            if (container.parentElement) {
                this.camera.aspect = container.clientWidth / container.clientHeight;
                this.camera.updateProjectionMatrix();
                this.renderer.setSize(container.clientWidth, container.clientHeight);
            }
        });
    }
    
    createControllerModel() {
        // Create a simple controller model
        const controllerGroup = new THREE.Group();
        
        // Controller body
        const bodyGeometry = new THREE.BoxGeometry(0.8, 1.5, 0.2);
        const bodyMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x1a4a1a,
            transparent: true,
            opacity: 0.7
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.z = -0.1;
        controllerGroup.add(body);
        
        // Handle
        const handleGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.8, 16);
        const handleMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x2a6a2a,
            transparent: true,
            opacity: 0.7
        });
        const handle = new THREE.Mesh(handleGeometry, handleMaterial);
        handle.rotation.x = Math.PI / 2;
        handle.position.y = -0.3;
        handle.position.z = -0.1;
        controllerGroup.add(handle);
        
        // Buttons
        const buttonGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 16);
        const buttonMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xa0c0a0,
            transparent: true,
            opacity: 0.8
        });
        
        // Y Button
        const yButton = new THREE.Mesh(buttonGeometry, buttonMaterial.clone());
        yButton.material.color.set(0x3a8a3a); // Forest accent color for Y button
        yButton.position.set(0.2, 0.3, 0);
        controllerGroup.add(yButton);
        
        // Trigger
        const triggerGeometry = new THREE.BoxGeometry(0.1, 0.3, 0.05);
        const trigger = new THREE.Mesh(triggerGeometry, buttonMaterial.clone());
        trigger.position.set(0, -0.5, 0.1);
        controllerGroup.add(trigger);
        
        // Thumbstick
        const stickBase = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.08, 0.02, 16),
            buttonMaterial.clone()
        );
        stickBase.position.set(-0.2, 0.1, 0);
        controllerGroup.add(stickBase);
        
        const stick = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8),
            new THREE.MeshPhongMaterial({ 
                color: 0x80a080,
                transparent: true,
                opacity: 0.8
            })
        );
        stick.position.set(-0.2, 0.2, 0);
        controllerGroup.add(stick);
        
        this.scene.add(controllerGroup);
    }
    
    animate() {
        if (!this.isOpen) return;
        
        requestAnimationFrame(() => this.animate());
        
        // Animate controller elements
        const time = Date.now() * 0.001;
        
        // Rotate the controller slowly
        if (this.scene.children.length > 2) {
            this.scene.children[2].rotation.y = Math.sin(time * 0.5) * 0.1;
        }
        
        this.renderer.render(this.scene, this.camera);
    }
    
    show() {
        this.isOpen = true;
        this.element.style.display = 'block';
        this.animate(); // Restart animation loop
    }
    
    hide() {
        this.isOpen = false;
        this.element.style.display = 'none';
    }
    
    toggle() {
        if (this.isOpen) {
            this.hide();
        } else {
            this.show();
        }
    }
}