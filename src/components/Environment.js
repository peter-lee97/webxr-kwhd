import * as THREE from 'three';

export class Environment {
    constructor(scene) {
        this.scene = scene;
        this.trees = [];
        this.rocks = [];
        this.logs = [];
        this.waterBodies = [];
        this.grassInstances = [];
        
        this.createGround();
        this.createWaterBodies();
        this.createTrees();
        this.createRocks();
        this.createLogs();
        this.createGrass();
    }
    
    createGround() {
        // Create a more realistic ground with texture-like appearance
        const groundGeometry = new THREE.PlaneGeometry(100, 100, 20, 20);
        
        // Create a more complex material for the ground
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x3d5e3a,
            roughness: 0.9,
            metalness: 0.1
        });
        
        // Add some variation to the ground surface
        const vertices = groundGeometry.attributes.position.array;
        for (let i = 0; i < vertices.length; i += 3) {
            // Add some random height variation to create a natural terrain look
            vertices[i + 2] = (Math.random() - 0.5) * 0.5;
        }
        groundGeometry.attributes.position.needsUpdate = true;
        groundGeometry.computeVertexNormals();
        
        this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.receiveShadow = true;
        this.scene.add(this.ground);
    }
    
    createWaterBody(position, size) {
        // Create water geometry
        const waterGeometry = new THREE.CircleGeometry(size, 32);
        
        // Create water material with more realistic properties
        const waterMaterial = new THREE.MeshStandardMaterial({
            color: 0x1e88e5,
            roughness: 0.05,
            metalness: 0.95,
            transparent: true,
            opacity: 0.7,
            emissive: 0x0d47a1,
            emissiveIntensity: 0.2
        });
        
        const water = new THREE.Mesh(waterGeometry, waterMaterial);
        water.position.copy(position);
        water.position.y = 0.01; // Slightly above ground to prevent z-fighting
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
        shore.position.y = 0.005; // Slightly above ground
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
    
    createWaterBodies() {
        // Create a small pond near the center
        this.createWaterBody(new THREE.Vector3(0, 0, 10), 5);
        
        // Create a few smaller puddles around the area
        for (let i = 0; i < 3; i++) {
            const x = (Math.random() - 0.5) * 30;
            const z = (Math.random() - 0.5) * 30;
            const size = 1 + Math.random() * 2;
            
            this.createWaterBody(new THREE.Vector3(x, 0, z), size);
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
    }
    
    update() {
        // Add animations or updates for environmental elements if needed
        // For example, wind effects on trees or grass
        // Animate water bodies for ripple effects
        const time = Date.now() * 0.001;
        
        // Animate water waves with more natural movement
        this.waterBodies.forEach((waterObj, index) => {
            const water = waterObj.mesh;
            const waveSpeed = waterObj.waveSpeed;
            const waveHeight = waterObj.waveHeight;
            
            // Combine multiple sine waves for more natural water movement
            const wave1 = Math.sin(time * waveSpeed + index) * waveHeight;
            const wave2 = Math.sin(time * waveSpeed * 1.7 + index * 1.3) * waveHeight * 0.7;
            const wave3 = Math.cos(time * waveSpeed * 0.8 + index * 0.7) * waveHeight * 0.5;
            
            water.position.y = waterObj.initialY + 0.01 + wave1 + wave2 + wave3;
        });
    }
}