import * as THREE from 'three';

export class Environment {
    constructor(scene) {
        this.scene = scene;
        this.trees = [];
        this.rocks = [];
        this.logs = [];
        this.bushes = [];
        this.waterBodies = [];
        this.grassInstances = [];
        
        this.createGround();
        this.createWaterBodies();
        this.createTrees();
        this.createRocks();
        this.createLogs();
        this.createBushes();
        this.createGrass();
        this.createDepthBackground();
    }
    
    createGround() {
        // Create a more realistic ground with texture-like appearance
        const groundGeometry = new THREE.PlaneGeometry(100, 100, 32, 32);
        
        // Create a more complex material for the ground
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x3d5e3a,
            roughness: 0.9,
            metalness: 0.0,
            flatShading: false
        });
        
        // Add more detailed variation to the ground surface
        const vertices = groundGeometry.attributes.position.array;
        for (let i = 0; i < vertices.length; i += 3) {
            // Add some random height variation to create a natural terrain look
            const x = vertices[i];
            const z = vertices[i + 1];
            
            // Use multiple noise functions for more natural terrain
            const noise1 = Math.sin(x * 0.1) * Math.cos(z * 0.1) * 0.3;
            const noise2 = Math.sin(x * 0.3) * Math.cos(z * 0.3) * 0.1;
            const noise3 = Math.sin(x * 0.05) * Math.cos(z * 0.05) * 0.5;
            
            vertices[i + 2] = noise1 + noise2 + noise3;
        }
        groundGeometry.attributes.position.needsUpdate = true;
        groundGeometry.computeVertexNormals();
        
        this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.receiveShadow = true;
        this.ground.castShadow = false;
        this.scene.add(this.ground);
    }
    
    createWaterBody(position, size) {
        // Create water geometry
        const waterGeometry = new THREE.CircleGeometry(size, 32);
        
        // Create water material with more realistic properties
        const waterMaterial = new THREE.MeshStandardMaterial({
            color: 0x1e88e5,
            roughness: 0.0,
            metalness: 0.9,
            transparent: true,
            opacity: 0.8,
            emissive: 0x0d47a1,
            emissiveIntensity: 0.3
        });
        
        const water = new THREE.Mesh(waterGeometry, waterMaterial);
        water.position.copy(position);
        water.position.y = 0.1; // Slightly above ground level
        water.rotation.x = -Math.PI / 2;
        
        // Add slight wave effect by adjusting vertices
        const vertices = waterGeometry.attributes.position.array;
        for (let i = 0; i < vertices.length; i += 3) {
            // Add subtle wave pattern
            vertices[i + 2] = Math.sin(vertices[i] * 2) * Math.cos(vertices[i + 1] * 2) * 0.1;
        }
        waterGeometry.attributes.position.needsUpdate = true;
        waterGeometry.computeVertexNormals();
        
        water.receiveShadow = true;
        water.castShadow = false; // Water shouldn't cast shadows
        
        this.scene.add(water);
        this.waterBodies.push({
            mesh: water,
            initialY: position.y,
            waveSpeed: 0.5 + Math.random() * 0.5,
            waveHeight: 0.02 + Math.random() * 0.03
        });
        
        // Create shoreline details around the water
        this.createShorelineDetails(position, size);
        
        // Add aquatic plants in the water
        this.createAquaticPlants(position, size);
        
        return water;
    }
    
    createShorelineDetails(position, size) {
        // Create a ring of grass around the water to simulate shoreline
        const shoreRadius = size + 0.3;
        const shoreGeometry = new THREE.RingGeometry(size, shoreRadius, 32);
        const shoreMaterial = new THREE.MeshStandardMaterial({
            color: 0x5d4037,
            roughness: 0.8,
            metalness: 0.1,
            side: THREE.DoubleSide
        });
        
        const shore = new THREE.Mesh(shoreGeometry, shoreMaterial);
        shore.position.copy(position);
        shore.position.y = 0.09; // Slightly above ground to match water level
        shore.rotation.x = -Math.PI / 2;
        shore.receiveShadow = true;
        
        this.scene.add(shore);
        
        // Add some rocks around the shoreline
        const rockCount = Math.floor(size * 2);
        for (let i = 0; i < rockCount; i++) {
            const angle = (i / rockCount) * Math.PI * 2;
            const distance = size + 0.5 + Math.random() * 0.5;
            
            const x = position.x + Math.cos(angle) * distance;
            const z = position.z + Math.sin(angle) * distance;
            
            // Small rocks for shoreline
            const rockSize = 0.1 + Math.random() * 0.3;
            const rockGeometry = new THREE.DodecahedronGeometry(rockSize, 0);
            const rockMaterial = new THREE.MeshStandardMaterial({
                color: 0x757575,
                roughness: 0.9,
                metalness: 0.1
            });
            
            const rock = new THREE.Mesh(rockGeometry, rockMaterial);
            rock.position.set(x, rockSize / 2, z);
            rock.rotation.x = Math.random() * Math.PI;
            rock.rotation.y = Math.random() * Math.PI;
            rock.castShadow = true;
            rock.receiveShadow = true;
            
            this.scene.add(rock);
        }
    }
    
    createAquaticPlants(position, size) {
        // Add lily pads on the water surface
        const plantCount = Math.floor(size * 3);
        for (let i = 0; i < plantCount; i++) {
            // Random position within the water body
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * (size - 0.5);
            
            const x = position.x + Math.cos(angle) * distance;
            const z = position.z + Math.sin(angle) * distance;
            
            // Create lily pad
            const padGeometry = new THREE.CircleGeometry(0.3 + Math.random() * 0.2, 16);
            const padMaterial = new THREE.MeshStandardMaterial({
                color: 0x4caf50,
                roughness: 0.9,
                metalness: 0.0
            });
            
            const lilyPad = new THREE.Mesh(padGeometry, padMaterial);
            lilyPad.position.set(x, 0.11, z);
            lilyPad.rotation.x = -Math.PI / 2;
            lilyPad.receiveShadow = true;
            
            this.scene.add(lilyPad);
            
            // Occasionally add a flower to the lily pad
            if (Math.random() > 0.7) {
                const flowerGeometry = new THREE.SphereGeometry(0.1, 8, 8);
                const flowerMaterial = new THREE.MeshStandardMaterial({
                    color: 0xffeb3b,
                    emissive: 0xff9800,
                    emissiveIntensity: 0.2
                });
                
                const flower = new THREE.Mesh(flowerGeometry, flowerMaterial);
                flower.position.set(x, 0.14, z);
                flower.castShadow = true;
                flower.receiveShadow = true;
                
                this.scene.add(flower);
            }
        }
        
        // Add underwater plants
        const underwaterPlantCount = Math.floor(size * 2);
        for (let i = 0; i < underwaterPlantCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * (size - 0.3);
            
            const x = position.x + Math.cos(angle) * distance;
            const z = position.z + Math.sin(angle) * distance;
            
            // Create simple underwater plant using a tapered cylinder
            const plantHeight = 0.5 + Math.random() * 0.8;
            const plantGeometry = new THREE.CylinderGeometry(0.02, 0.05, plantHeight, 6);
            const plantMaterial = new THREE.MeshStandardMaterial({
                color: 0x2e7d32,
                roughness: 0.9,
                metalness: 0.0
            });
            
            const plant = new THREE.Mesh(plantGeometry, plantMaterial);
            plant.position.set(x, -plantHeight / 2 + 0.1, z);
            plant.castShadow = false;
            plant.receiveShadow = true;
            
            this.scene.add(plant);
        }
    }
    
    createWaterBodies() {
        // Create a small pond near the center
        this.createWaterBody(new THREE.Vector3(0, 0, 15), 5);
        
        // Create a few smaller puddles around the area with proper spacing
        const positions = [
            new THREE.Vector3(-20, 0, -10),
            new THREE.Vector3(20, 0, -15),
            new THREE.Vector3(0, 0, -25)
        ];
        
        for (let i = 0; i < positions.length; i++) {
            const size = 1.5 + Math.random() * 1.5;
            this.createWaterBody(positions[i], size);
        }
    }
    
    createTree(position) {
        const treeGroup = new THREE.Group();
        
        // Create trunk with better proportions
        const trunkHeight = 3 + Math.random() * 3;
        const trunkRadiusTop = 0.2 + Math.random() * 0.3;
        const trunkRadiusBottom = trunkRadiusTop * (1.2 + Math.random() * 0.5);
        const trunkGeometry = new THREE.CylinderGeometry(trunkRadiusTop, trunkRadiusBottom, trunkHeight, 8);
        const trunkMaterial = new THREE.MeshStandardMaterial({
            color: 0x8B4513,
            roughness: 0.9,
            metalness: 0.0
        });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = trunkHeight / 2;
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        treeGroup.add(trunk);
        
        // Create branches
        const branchCount = 3 + Math.floor(Math.random() * 4);
        for (let i = 0; i < branchCount; i++) {
            const branchHeight = (0.3 + Math.random() * 0.4) * trunkHeight;
            const branchLength = 0.5 + Math.random() * 1.5;
            const branchRadius = trunkRadiusTop * (0.3 + Math.random() * 0.4);
            
            const branchGeometry = new THREE.CylinderGeometry(branchRadius * 0.7, branchRadius, branchLength, 6);
            const branchMaterial = new THREE.MeshStandardMaterial({
                color: 0x8B4513,
                roughness: 0.9,
                metalness: 0.0
            });
            const branch = new THREE.Mesh(branchGeometry, branchMaterial);
            
            // Position branch on trunk
            branch.position.y = branchHeight;
            
            // Rotate branch outward
            branch.rotation.z = Math.PI / 2;
            branch.rotation.y = (i / branchCount) * Math.PI * 2;
            
            // Position branch end correctly
            branch.position.x = branchLength / 2;
            
            branch.castShadow = true;
            branch.receiveShadow = true;
            treeGroup.add(branch);
        }
        
        // Create canopy with better cohesion
        const canopyType = Math.floor(Math.random() * 3); // 0: conical, 1: spherical, 2: irregular
        let canopyGroup = new THREE.Group();
        
        switch (canopyType) {
            case 0: // Conical (pine-like) - multiple layers
                const layerCount = 2 + Math.floor(Math.random() * 2);
                for (let i = 0; i < layerCount; i++) {
                    const layerHeight = 2 + Math.random() * 2;
                    const layerRadius = 1.5 + Math.random() * 2;
                    const layerY = trunkHeight + i * 1.5;
                    
                    const coneGeometry = new THREE.ConeGeometry(layerRadius, layerHeight, 8);
                    const coneMaterial = new THREE.MeshStandardMaterial({
                        color: 0x2E8B57,
                        roughness: 0.8,
                        metalness: 0.0
                    });
                    const coneLayer = new THREE.Mesh(coneGeometry, coneMaterial);
                    coneLayer.position.y = layerY + layerHeight / 2;
                    coneLayer.castShadow = true;
                    coneLayer.receiveShadow = true;
                    canopyGroup.add(coneLayer);
                }
                break;
                
            case 1: // Spherical (oak-like) - multiple spheres
                const sphereCount = 2 + Math.floor(Math.random() * 3);
                for (let i = 0; i < sphereCount; i++) {
                    const sphereRadius = 1 + Math.random() * 1.5;
                    const sphereY = trunkHeight + i * 0.8;
                    
                    const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 6, 6);
                    const sphereMaterial = new THREE.MeshStandardMaterial({
                        color: 0x3CB371,
                        roughness: 0.8,
                        metalness: 0.0
                    });
                    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
                    sphere.position.y = sphereY;
                    
                    // Offset spheres slightly for natural look
                    if (i > 0) {
                        sphere.position.x = (Math.random() - 0.5) * 1.5;
                        sphere.position.z = (Math.random() - 0.5) * 1.5;
                    }
                    
                    sphere.castShadow = true;
                    sphere.receiveShadow = true;
                    canopyGroup.add(sphere);
                }
                break;
                
            case 2: // Irregular (birch-like) - dodecahedrons
                const irrCount = 2 + Math.floor(Math.random() * 2);
                for (let i = 0; i < irrCount; i++) {
                    const irrRadius = 1.2 + Math.random() * 1.2;
                    const irrY = trunkHeight + i * 1.2;
                    
                    const irrGeometry = new THREE.DodecahedronGeometry(irrRadius, 0);
                    const irrMaterial = new THREE.MeshStandardMaterial({
                        color: 0x90EE90,
                        roughness: 0.8,
                        metalness: 0.0
                    });
                    const irrShape = new THREE.Mesh(irrGeometry, irrMaterial);
                    irrShape.position.y = irrY;
                    
                    // Offset shapes slightly for natural look
                    if (i > 0) {
                        irrShape.position.x = (Math.random() - 0.5) * 1.2;
                        irrShape.position.z = (Math.random() - 0.5) * 1.2;
                    }
                    
                    irrShape.castShadow = true;
                    irrShape.receiveShadow = true;
                    canopyGroup.add(irrShape);
                }
                break;
        }
        
        treeGroup.add(canopyGroup);
        
        treeGroup.position.copy(position);
        this.scene.add(treeGroup);
        
        this.trees.push({
            group: treeGroup,
            trunk: trunk,
            canopy: canopyGroup
        });
        
        return treeGroup;
    }
    
    createTrees() {
        // Create trees around the perimeter to form a forest edge
        const boundarySize = 45;
        const treeCount = 30;
        
        for (let i = 0; i < treeCount; i++) {
            // Position trees around the edge with some randomization
            const angle = (i / treeCount) * Math.PI * 2;
            const distance = boundarySize + 5 + Math.random() * 10;
            
            const x = Math.cos(angle) * distance;
            const z = Math.sin(angle) * distance;
            const y = 0;
            
            this.createTree(new THREE.Vector3(x, y, z));
        }
        
        // Add some random trees within the area
        for (let i = 0; i < 15; i++) {
            const x = (Math.random() - 0.5) * boundarySize * 1.5;
            const z = (Math.random() - 0.5) * boundarySize * 1.5;
            const y = 0;
            
            this.createTree(new THREE.Vector3(x, y, z));
        }
    }
    
    createRock(position) {
        const size = 0.5 + Math.random() * 1.5;
        const geometry = new THREE.DodecahedronGeometry(size, 0);
        const material = new THREE.MeshStandardMaterial({
            color: 0x808080,
            roughness: 0.9,
            metalness: 0.2
        });
        
        const rock = new THREE.Mesh(geometry, material);
        rock.position.copy(position);
        rock.position.y = size / 2; // Place on ground
        rock.castShadow = true;
        rock.receiveShadow = true;
        
        // Random rotation for variety
        rock.rotation.x = Math.random() * Math.PI;
        rock.rotation.y = Math.random() * Math.PI;
        rock.rotation.z = Math.random() * Math.PI;
        
        this.scene.add(rock);
        this.rocks.push(rock);
        
        return rock;
    }
    
    createRocks() {
        const rockCount = 20;
        const boundarySize = 45;
        
        for (let i = 0; i < rockCount; i++) {
            const x = (Math.random() - 0.5) * boundarySize * 1.8;
            const z = (Math.random() - 0.5) * boundarySize * 1.8;
            const y = 0;
            
            this.createRock(new THREE.Vector3(x, y, z));
        }
    }
    
    createLog(position) {
        const length = 2 + Math.random() * 4;
        const radius = 0.3 + Math.random() * 0.5;
        const geometry = new THREE.CylinderGeometry(radius, radius * 0.8, length, 8);
        const material = new THREE.MeshStandardMaterial({
            color: 0x654321,
            roughness: 0.9,
            metalness: 0.0
        });
        
        const log = new THREE.Mesh(geometry, material);
        log.position.copy(position);
        log.position.y = radius; // Place on ground
        
        // Rotate to lie horizontally
        log.rotation.z = Math.PI / 2;
        
        // Add some bark-like texture with randomness
        log.rotation.y = Math.random() * Math.PI;
        
        log.castShadow = true;
        log.receiveShadow = true;
        
        this.scene.add(log);
        this.logs.push(log);
        
        return log;
    }
    
    createLogs() {
        const logCount = 10;
        const boundarySize = 45;
        
        for (let i = 0; i < logCount; i++) {
            const x = (Math.random() - 0.5) * boundarySize * 1.8;
            const z = (Math.random() - 0.5) * boundarySize * 1.8;
            const y = 0;
            
            this.createLog(new THREE.Vector3(x, y, z));
        }
    }
    
    createBush(position) {
        const bushGroup = new THREE.Group();
        
        // Create multiple spheres for a fuller bush look
        const sphereCount = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < sphereCount; i++) {
            const size = 0.5 + Math.random() * 0.5;
            const geometry = new THREE.SphereGeometry(size, 6, 6);
            const material = new THREE.MeshStandardMaterial({
                color: 0x2e7d32,
                roughness: 0.9,
                metalness: 0.0
            });
            
            const sphere = new THREE.Mesh(geometry, material);
            
            // Position spheres to create a natural bush shape
            if (i === 0) {
                // Main sphere at the base
                sphere.position.y = size;
            } else {
                // Additional spheres positioned around the main one
                const angle = (i / (sphereCount - 1)) * Math.PI * 2;
                const distance = 0.3 + Math.random() * 0.4;
                sphere.position.x = Math.cos(angle) * distance;
                sphere.position.z = Math.sin(angle) * distance;
                sphere.position.y = size + (Math.random() - 0.5) * 0.3;
            }
            
            sphere.castShadow = true;
            sphere.receiveShadow = true;
            bushGroup.add(sphere);
        }
        
        bushGroup.position.copy(position);
        this.scene.add(bushGroup);
        this.bushes.push(bushGroup);
        
        return bushGroup;
    }
    
    createBushes() {
        const bushCount = 15;
        const boundarySize = 45;
        
        for (let i = 0; i < bushCount; i++) {
            const x = (Math.random() - 0.5) * boundarySize * 1.8;
            const z = (Math.random() - 0.5) * boundarySize * 1.8;
            const y = 0;
            
            this.createBush(new THREE.Vector3(x, y, z));
        }
    }
    
    createGrass() {
        // Create grass using instanced meshes for performance
        const grassCount = 500;
        const boundarySize = 45;
        
        // Create a simple grass blade geometry
        const grassGeometry = new THREE.PlaneGeometry(0.1, 0.5);
        grassGeometry.translate(0, 0.25, 0); // Center at base
        
        const grassMaterial = new THREE.MeshStandardMaterial({
            color: 0x4E9C45,
            roughness: 0.9,
            metalness: 0.0,
            side: THREE.DoubleSide
        });
        
        const grassInstances = new THREE.InstancedMesh(grassGeometry, grassMaterial, grassCount);
        grassInstances.castShadow = true;
        grassInstances.receiveShadow = true;
        
        const dummy = new THREE.Object3D();
        
        for (let i = 0; i < grassCount; i++) {
            const x = (Math.random() - 0.5) * boundarySize * 2;
            const z = (Math.random() - 0.5) * boundarySize * 2;
            const y = 0.1;
            
            dummy.position.set(x, y, z);
            
            // Random rotation
            dummy.rotation.y = Math.random() * Math.PI * 2;
            
            // Random scale
            const scale = 0.5 + Math.random() * 0.8;
            dummy.scale.set(scale, scale, scale);
            
            dummy.updateMatrix();
            grassInstances.setMatrixAt(i, dummy.matrix);
        }
        
        this.scene.add(grassInstances);
        this.grassInstances.push(grassInstances);
        
        // Add some flowers among the grass
        this.createFlowers();
    }
    
    createFlowers() {
        const flowerCount = 30;
        const boundarySize = 45;
        
        for (let i = 0; i < flowerCount; i++) {
            const x = (Math.random() - 0.5) * boundarySize * 1.8;
            const z = (Math.random() - 0.5) * boundarySize * 1.8;
            const y = 0.1;
            
            // Random flower color
            const colors = [0xffeb3b, 0xe91e63, 0x9c27b0, 0xff9800, 0xf44336];
            const color = colors[Math.floor(Math.random() * colors.length)];
            
            // Create flower stem
            const stemHeight = 0.3 + Math.random() * 0.4;
            const stemGeometry = new THREE.CylinderGeometry(0.01, 0.01, stemHeight, 6);
            const stemMaterial = new THREE.MeshStandardMaterial({
                color: 0x4caf50,
                roughness: 0.9,
                metalness: 0.0
            });
            
            const stem = new THREE.Mesh(stemGeometry, stemMaterial);
            stem.position.set(x, y + stemHeight / 2, z);
            stem.castShadow = true;
            stem.receiveShadow = true;
            this.scene.add(stem);
            
            // Create flower head
            const headSize = 0.1 + Math.random() * 0.1;
            const headGeometry = new THREE.SphereGeometry(headSize, 8, 8);
            const headMaterial = new THREE.MeshStandardMaterial({
                color: color,
                roughness: 0.8,
                metalness: 0.2
            });
            
            const head = new THREE.Mesh(headGeometry, headMaterial);
            head.position.set(x, y + stemHeight, z);
            head.castShadow = true;
            head.receiveShadow = true;
            this.scene.add(head);
        }
    }
    
    update() {
        // Add animations or updates for environmental elements if needed
        // For example, wind effects on trees or grass
        const time = Date.now() * 0.001;
        
        // Add gentle wind effect to bushes
        this.bushes.forEach((bush, index) => {
            const windStrength = Math.sin(time * 0.5 + index) * 0.02;
            bush.rotation.z = windStrength;
        });
    }

    // ─── Procedural depth background ─────────────────────────────────────────
    // Draws once to a CanvasTexture and assigns it as scene.background.
    // scene.background renders as a flat fullscreen quad before any 3D geometry —
    // zero per-frame cost. Atmospheric perspective (things get lighter/bluer with
    // distance) creates the illusion that the horizon is very far away.
    createDepthBackground() {
        const W = 2048, H = 512;
        const canvas = document.createElement('canvas');
        canvas.width  = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        // Horizon sits at 50 % of the image height
        const HZ = H * 0.50;

        // ── Sky ──────────────────────────────────────────────────────────────
        const sky = ctx.createLinearGradient(0, 0, 0, HZ);
        sky.addColorStop(0,    '#1b3d72');   // deep blue zenith
        sky.addColorStop(0.45, '#3d72b8');   // mid sky
        sky.addColorStop(0.82, '#85bcd8');   // pale near-horizon blue
        sky.addColorStop(1,    '#c8e4f0');   // washed-out horizon
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, HZ);

        // ── Sun-glow haze (warm radial glow near the horizon centre) ─────────
        const glow = ctx.createRadialGradient(W * 0.5, HZ, 0, W * 0.5, HZ, W * 0.38);
        glow.addColorStop(0,   'rgba(255,215,140,0.28)');
        glow.addColorStop(0.5, 'rgba(255,215,140,0.10)');
        glow.addColorStop(1,   'rgba(255,215,140,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, HZ);

        // ── Ground ───────────────────────────────────────────────────────────
        const ground = ctx.createLinearGradient(0, HZ, 0, H);
        ground.addColorStop(0,   '#3a6b28');
        ground.addColorStop(0.4, '#2d5520');
        ground.addColorStop(1,   '#192f0e');
        ctx.fillStyle = ground;
        ctx.fillRect(0, HZ, W, H - HZ);

        // ── Silhouette helper ─────────────────────────────────────────────────
        // Draws a row of pointed conifer/pine silhouettes as a filled polygon.
        //   yBase   - bottom edge of this layer (canvas y, positive = down)
        //   maxH    - tallest tree height in pixels
        //   spacing - approx px between tree centres
        //   seed    - offsets the deterministic noise so each layer looks different
        //   color   - CSS fill string
        const drawConiferLayer = (yBase, maxH, spacing, seed, color) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(0, H);
            ctx.lineTo(0, yBase);

            let x = 0;
            while (x <= W + spacing) {
                // Deterministic height variation via overlapping sine waves
                const noise =
                    Math.sin(x * 0.018 + seed)         * 0.35 +
                    Math.sin(x * 0.007 + seed * 1.9)   * 0.45 +
                    Math.sin(x * 0.042 + seed * 0.8)   * 0.20;
                const h  = maxH * (0.50 + (noise * 0.5 + 0.5) * 0.50);
                const hw = spacing * 0.55;   // half-width of this tree

                // Conifer profile: narrow base flare → pointed tip via bezier
                ctx.lineTo(x - hw * 0.18, yBase);
                ctx.lineTo(x - hw * 0.12, yBase - h * 0.55);
                ctx.bezierCurveTo(
                    x - hw * 0.07, yBase - h * 0.85,
                    x + hw * 0.07, yBase - h * 0.85,
                    x + hw * 0.12, yBase - h * 0.55
                );
                ctx.lineTo(x + hw * 0.18, yBase);

                x += spacing * (0.75 + Math.abs(Math.sin(x * 0.031 + seed)) * 0.50);
            }

            ctx.lineTo(W, H);
            ctx.closePath();
            ctx.fill();
        };

        // ── Distant rolling hills (very hazy, almost sky colour) ─────────────
        const hillPath = (yBase, amplitude, freqA, freqB, phaseA, phaseB) => {
            ctx.beginPath();
            ctx.moveTo(0, H);
            ctx.lineTo(0, yBase);
            for (let x = 0; x <= W; x += 6) {
                const y = yBase - amplitude *
                    (Math.sin(x * freqA + phaseA) * 0.55 +
                     Math.sin(x * freqB + phaseB) * 0.45);
                ctx.lineTo(x, y);
            }
            ctx.lineTo(W, H);
            ctx.closePath();
        };

        // Very far mountains — nearly sky colour, barely visible
        const mtnGrad1 = ctx.createLinearGradient(0, HZ - 30, 0, HZ + 5);
        mtnGrad1.addColorStop(0, 'rgba(155,185,210,0.50)');
        mtnGrad1.addColorStop(1, 'rgba(130,165,195,0.80)');
        ctx.fillStyle = mtnGrad1;
        hillPath(HZ + 4, 26, 0.0040, 0.0090, 0.0, 1.2);
        ctx.fill();

        // Mid-distance hills — slightly greener
        const mtnGrad2 = ctx.createLinearGradient(0, HZ - 20, 0, HZ + 10);
        mtnGrad2.addColorStop(0, 'rgba(100,140,115,0.72)');
        mtnGrad2.addColorStop(1, 'rgba(78,118,85,0.92)');
        ctx.fillStyle = mtnGrad2;
        hillPath(HZ + 8, 20, 0.0062, 0.0130, 0.5, 2.3);
        ctx.fill();

        // ── Forest silhouette layers: far → near (darker, taller, sharper) ───
        // Each layer's base is progressively lower (closer to viewer)
        drawConiferLayer(HZ + 14, 32, 20, 1.0, 'rgba(75,112,72,0.80)');   // far  – hazy
        drawConiferLayer(HZ + 22, 44, 15, 2.6, 'rgba(50, 90,48,0.90)');   // mid
        drawConiferLayer(HZ + 34, 58, 11, 4.3, 'rgba(28, 62,26,0.97)');   // near – crisp

        // ── Atmospheric horizon band ──────────────────────────────────────────
        // Bright foggy strip at the horizon — the key cue that sells great distance
        const haze = ctx.createLinearGradient(0, HZ - 22, 0, HZ + 22);
        haze.addColorStop(0,    'rgba(195,225,242,0)');
        haze.addColorStop(0.38, 'rgba(195,225,242,0.60)');
        haze.addColorStop(0.62, 'rgba(195,225,242,0.60)');
        haze.addColorStop(1,    'rgba(195,225,242,0)');
        ctx.fillStyle = haze;
        ctx.fillRect(0, HZ - 22, W, 44);

        // ── Apply as scene background ─────────────────────────────────────────
        // scene.background renders as a flat fullscreen quad with no depth writes,
        // completely free at runtime because it is drawn once and never redrawn.
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        this.scene.background = tex;

        // Match fog colour to horizon haze so 3D objects fade naturally into it
        if (this.scene.fog) {
            this.scene.fog.color.set(0xc3e1f2);
        }
    }
}