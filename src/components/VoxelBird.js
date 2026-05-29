import * as THREE from 'three';

export class VoxelBird {
    static getDefaults() {
        return {
            size: 0.7,
            groundOffsetFactor: 0.18
        };
    }

    static buildPalette(colors = {}) {
        return {
            head: colors.head ?? 0x2b2f3a,
            back: colors.back ?? 0x5a4a3b,
            wing: colors.wing ?? 0x3d4654,
            belly: colors.belly ?? 0xc9b79a,
            chest: colors.chest ?? 0xb6895d,
            beak: colors.beak ?? 0xb3b9c7,
            legs: colors.legs ?? 0x646464,
            eye: colors.eye ?? 0x050505
        };
    }

    static getBuildProfile() {
        return {
            beak: {
                radius: 0.13,
                length: 0.5,
                radialSegments: 4,
                rotationX: Math.PI / 2,
                position: { x: 0, y: -0.03, z: 0.56 }
            },
            tail: {
                size: { x: 0.6, y: 0.2, z: 0.9 },
                position: { x: 0, y: 1.35, z: -1.15 },
                rotationX: -0.28
            },
            legs: {
                thickness: 0.14,
                length: 0.8,
                footSize: { x: 0.34, y: 0.1, z: 0.25 },
                legX: 0.23,
                legY: 0.48,
                legZ: 0.3,
                footY: 0.05,
                footZ: 0.35
            }
        };
    }

    static buildGeometryProfile(overrides = {}) {
        const defaults = this.getBuildProfile();
        return {
            beak: {
                ...defaults.beak,
                ...overrides.beak,
                position: { ...defaults.beak.position, ...(overrides.beak?.position ?? {}) }
            },
            tail: {
                ...defaults.tail,
                ...overrides.tail,
                size: { ...defaults.tail.size, ...(overrides.tail?.size ?? {}) },
                position: { ...defaults.tail.position, ...(overrides.tail?.position ?? {}) }
            },
            legs: {
                ...defaults.legs,
                ...overrides.legs,
                footSize: { ...defaults.legs.footSize, ...(overrides.legs?.footSize ?? {}) }
            }
        };
    }

    constructor(options = {}) {
        const defaults = this.constructor.getDefaults();
        this.size = options.size ?? defaults.size;
        this.position = options.position || new THREE.Vector3(0, 0, 0);
        this.boundarySize = options.boundarySize || 45;
        this.groundOffset = options.groundOffset ?? (defaults.groundOffsetFactor * this.size);
        this.roaming = options.roaming !== false;
        this.constrainPosition = options.constrainPosition || null;
        this.group = new THREE.Group();
        this.bodyParts = {};
        this.animationTime = Math.random() * Math.PI * 2;

        this.palette = this.constructor.buildPalette(options.colors);
        this.geometryProfile = this.constructor.buildGeometryProfile(options.geometryProfile);

        this.state = options.state || 'neutral';
        this.hopDuration = 0.45;
        this.hopHeight = 0.35 * this.size;
        this.hopDistance = 0.45 * this.size;
        this.hopTimer = 0;
        this.hopStart = new THREE.Vector3();
        this.hopDirection = new THREE.Vector3(0, 0, 1);
        this.hopForwardDistance = this.hopDistance;
        this.travelTarget = new THREE.Vector3();
        this.travelActive = false;
        this.travelHopBudget = 0;
        this.interactionHopBudget = 0;
        this.flightVelocity = new THREE.Vector3();
        this.flightGravity = 6.2;
        this.currentFlightGravity = this.flightGravity;
        this.flightTimer = 0;
        this.flightDurationMax = 0;
        this.idleTimer = 1.2 + Math.random() * 2.6;
        this.flapTimer = 0;
        this.flapAmplitude = 0;
        this.flapFrequency = 10;
        this.wingFlapPhase = Math.random() * Math.PI * 2;
        this.wingFlapCurrent = 0;
        this.isHeld = false;
        this.heldBy = null;

        this.createBody();
        this.group.position.copy(this.position);
        this.group.position.y += this.groundOffset;
        this.baseGroupY = this.group.position.y;
    }

    createBody() {
        const s = this.size;
        const mat = (color) => new THREE.MeshBasicMaterial({ color });
        const beakProfile = this.geometryProfile.beak;
        const tailProfile = this.geometryProfile.tail;
        const legProfile = this.geometryProfile.legs;

        const body = new THREE.Mesh(
            new THREE.BoxGeometry(1.4 * s, 1.0 * s, 1.8 * s),
            mat(this.palette.back)
        );
        body.position.y = 1.45 * s;
        body.castShadow = true;
        this.group.add(body);
        this.bodyParts.body = body;

        const belly = new THREE.Mesh(
            new THREE.BoxGeometry(1.1 * s, 0.55 * s, 1.25 * s),
            mat(this.palette.belly)
        );
        belly.position.set(0, -0.16 * s, 0.05 * s);
        body.add(belly);
        this.bodyParts.belly = belly;

        const chest = new THREE.Mesh(
            new THREE.BoxGeometry(0.9 * s, 0.48 * s, 0.52 * s),
            mat(this.palette.chest)
        );
        chest.position.set(0, -0.05 * s, 0.68 * s);
        body.add(chest);
        this.bodyParts.chest = chest;

        const head = new THREE.Mesh(
            new THREE.BoxGeometry(0.78 * s, 0.72 * s, 0.78 * s),
            mat(this.palette.head)
        );
        head.position.set(0, 2.0 * s, 0.78 * s);
        head.castShadow = true;
        this.group.add(head);
        this.bodyParts.head = head;

        const beak = new THREE.Mesh(
            new THREE.ConeGeometry(
                beakProfile.radius * s,
                beakProfile.length * s,
                beakProfile.radialSegments
            ),
            mat(this.palette.beak)
        );
        beak.rotation.x = beakProfile.rotationX;
        beak.position.set(
            beakProfile.position.x * s,
            beakProfile.position.y * s,
            beakProfile.position.z * s
        );
        head.add(beak);
        this.bodyParts.beak = beak;

        const eyeGeo = new THREE.BoxGeometry(0.09 * s, 0.09 * s, 0.05 * s);
        const eyeMat = mat(this.palette.eye);
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-0.17 * s, 0.1 * s, 0.4 * s);
        head.add(leftEye);
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat.clone());
        rightEye.position.set(0.17 * s, 0.1 * s, 0.4 * s);
        head.add(rightEye);
        this.bodyParts.leftEye = leftEye;
        this.bodyParts.rightEye = rightEye;

        const wingGeo = new THREE.BoxGeometry(0.25 * s, 0.55 * s, 1.0 * s);
        const leftWing = new THREE.Mesh(wingGeo, mat(this.palette.wing));
        leftWing.position.set(-0.8 * s, 1.45 * s, 0);
        this.group.add(leftWing);
        const rightWing = new THREE.Mesh(wingGeo, mat(this.palette.wing));
        rightWing.position.set(0.8 * s, 1.45 * s, 0);
        this.group.add(rightWing);
        this.bodyParts.leftWing = leftWing;
        this.bodyParts.rightWing = rightWing;

        const tail = new THREE.Mesh(
            new THREE.BoxGeometry(
                tailProfile.size.x * s,
                tailProfile.size.y * s,
                tailProfile.size.z * s
            ),
            mat(this.palette.wing)
        );
        tail.position.set(
            tailProfile.position.x * s,
            tailProfile.position.y * s,
            tailProfile.position.z * s
        );
        tail.rotation.x = tailProfile.rotationX;
        this.group.add(tail);
        this.bodyParts.tail = tail;

        const legGeo = new THREE.BoxGeometry(
            legProfile.thickness * s,
            legProfile.length * s,
            legProfile.thickness * s
        );
        const footGeo = new THREE.BoxGeometry(
            legProfile.footSize.x * s,
            legProfile.footSize.y * s,
            legProfile.footSize.z * s
        );
        const leftLeg = new THREE.Mesh(legGeo, mat(this.palette.legs));
        leftLeg.position.set(-legProfile.legX * s, legProfile.legY * s, legProfile.legZ * s);
        this.group.add(leftLeg);
        const rightLeg = new THREE.Mesh(legGeo, mat(this.palette.legs));
        rightLeg.position.set(legProfile.legX * s, legProfile.legY * s, legProfile.legZ * s);
        this.group.add(rightLeg);
        const leftFoot = new THREE.Mesh(footGeo, mat(this.palette.legs));
        leftFoot.position.set(-legProfile.legX * s, legProfile.footY * s, legProfile.footZ * s);
        this.group.add(leftFoot);
        const rightFoot = new THREE.Mesh(footGeo, mat(this.palette.legs));
        rightFoot.position.set(legProfile.legX * s, legProfile.footY * s, legProfile.footZ * s);
        this.group.add(rightFoot);
        this.bodyParts.leftLeg = leftLeg;
        this.bodyParts.rightLeg = rightLeg;
        this.bodyParts.leftFoot = leftFoot;
        this.bodyParts.rightFoot = rightFoot;
    }

    startHop(forwardDistance = this.hopDistance) {
        if ((this.state === 'hopping' && this.hopTimer < this.hopDuration) || this.state === 'flying') return false;
        this.startFlapBurst(0.55, this.hopDuration * 0.9, 11);
        this.state = 'hopping';
        this.hopTimer = 0;
        this.hopForwardDistance = forwardDistance;
        this.hopStart.copy(this.group.position);
        const yaw = this.group.rotation.y;
        this.hopDirection.set(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
        return true;
    }

    startFlight(forwardDistance = this.hopDistance * 1.25) {
        if (this.state === 'hopping' || this.state === 'flying') return false;
        const yaw = this.group.rotation.y;
        this.hopDirection.set(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
        const variedDistance = forwardDistance * THREE.MathUtils.randFloat(0.8, 1.35);
        const distance = THREE.MathUtils.clamp(variedDistance, this.hopDistance * 0.6, this.hopDistance * 1.75);
        const baseFlightApex = Math.max(this.size * 1.2, this.hopHeight * 2.8);
        const apexScale = THREE.MathUtils.randFloat(0.9, 1.8);
        const targetApex = Math.max(baseFlightApex * apexScale, 0.24 * this.size);
        const targetDuration = THREE.MathUtils.randFloat(0.65, 3.0);
        const flightDuration = THREE.MathUtils.clamp(targetDuration, 0.65, 3.0);
        const flightGravity = Math.max((8 * targetApex) / (flightDuration * flightDuration), 1.2);
        const verticalSpeed = (flightGravity * flightDuration) * 0.5;
        const forwardSpeed = distance / flightDuration;
        this.currentFlightGravity = flightGravity;
        this.flightVelocity.copy(this.hopDirection).multiplyScalar(forwardSpeed);
        this.flightVelocity.y = verticalSpeed;
        this.flightTimer = 0;
        this.flightDurationMax = flightDuration * 1.08;
        this.state = 'flying';
        this.startFlapBurst(0.95, this.flightDurationMax, 14);
        return true;
    }

    startFlapBurst(amplitude = 0.45, duration = 0.3, frequency = 10) {
        this.flapAmplitude = Math.max(this.flapAmplitude, amplitude);
        this.flapTimer = Math.max(this.flapTimer, duration);
        this.flapFrequency = Math.max(this.flapFrequency, frequency);
    }

    updateWingFlap(dt) {
        let targetAmplitude = 0;
        let frequency = 5;
        if (!this.isHeld && this.flapTimer > 0) {
            this.flapTimer = Math.max(this.flapTimer - dt, 0);
            targetAmplitude = this.flapAmplitude;
            frequency = this.flapFrequency;
        } else if (this.state === 'neutral' && !this.isHeld) {
            targetAmplitude = 0.06;
            frequency = 2.4;
            this.flapAmplitude = 0;
            this.flapFrequency = 10;
        } else {
            this.flapAmplitude = 0;
            this.flapFrequency = 10;
        }

        this.wingFlapCurrent += (targetAmplitude - this.wingFlapCurrent) * Math.min(dt * 12, 1);
        this.wingFlapPhase += dt * frequency * Math.PI * 2;
        const flap = Math.sin(this.wingFlapPhase) * this.wingFlapCurrent;
        if (this.bodyParts.leftWing) {
            this.bodyParts.leftWing.rotation.z = -flap;
            this.bodyParts.leftWing.rotation.x = Math.abs(flap) * 0.35;
        }
        if (this.bodyParts.rightWing) {
            this.bodyParts.rightWing.rotation.z = flap;
            this.bodyParts.rightWing.rotation.x = Math.abs(flap) * 0.35;
        }
    }

    handleBurstCompletion() {
        this.group.position.y = this.baseGroupY;
        this.group.rotation.x = 0;
        this.state = 'neutral';

        if (this.travelActive && this.travelHopBudget > 0) {
            this.travelHopBudget -= 1;
            const remaining = this.group.position.distanceTo(this.travelTarget);
            if (remaining > 0.35 && this.travelHopBudget > 0) {
                this.startTravelHop();
            } else {
                this.travelActive = false;
                this.idleTimer = 1.4 + Math.random() * 2.8;
            }
        } else if (this.interactionHopBudget > 0) {
            this.interactionHopBudget -= 1;
            this.startBurstMove(this.hopDistance);
        }
    }

    startBurstMove(forwardDistance = this.hopDistance) {
        if (this.state === 'hopping' || this.state === 'flying') return false;
        const shouldFlight = Math.random() < 0.6;
        if (shouldFlight) {
            return this.startFlight(forwardDistance * THREE.MathUtils.randFloat(0.75, 1.25));
        }
        return this.startHop(forwardDistance);
    }

    setFacingDirection(direction) {
        const horizontal = direction.clone();
        horizontal.y = 0;
        if (horizontal.lengthSq() < 1e-6) return;
        horizontal.normalize();
        this.group.rotation.y = Math.atan2(horizontal.x, horizontal.z);
    }

    startTravelHop() {
        const toTarget = new THREE.Vector3().subVectors(this.travelTarget, this.group.position);
        toTarget.y = 0;
        const distance = toTarget.length();
        if (distance < 0.1) {
            this.travelActive = false;
            this.state = 'neutral';
            return;
        }

        this.setFacingDirection(toTarget);
        const hopsRemaining = Math.max(1, this.travelHopBudget);
        const nextHopDistance = Math.min(this.hopDistance * 1.2, distance / hopsRemaining);
        this.startBurstMove(nextHopDistance);
    }

    pickTravelTarget() {
        const half = this.boundarySize / 2 - 2;
        const hopCount = 2 + Math.floor(Math.random() * 2); // 2-3 hops per travel burst
        const angle = Math.random() * Math.PI * 2;
        const burstDistance = this.hopDistance * hopCount * THREE.MathUtils.randFloat(0.9, 1.1);
        const tx = this.group.position.x + Math.sin(angle) * burstDistance;
        const tz = this.group.position.z + Math.cos(angle) * burstDistance;
        this.travelTarget.set(
            THREE.MathUtils.clamp(tx, -half, half),
            this.baseGroupY,
            THREE.MathUtils.clamp(tz, -half, half)
        );
        this.travelActive = true;
        this.travelHopBudget = hopCount;
        this.startTravelHop();
    }

    setHeld(isHeld, sourceId = null) {
        this.isHeld = Boolean(isHeld);
        this.heldBy = this.isHeld ? sourceId : null;
        this.state = 'neutral';
        this.travelActive = false;
        this.travelHopBudget = 0;
        this.interactionHopBudget = 0;
        this.hopTimer = 0;
        this.flapTimer = 0;
        this.flapAmplitude = 0;
        this.flightVelocity.set(0, 0, 0);
        const yaw = this.group.rotation.y;
        this.group.rotation.set(0, yaw, 0);
    }

    setExternalTransform(position, rotation = null) {
        if (position) {
            this.group.position.copy(position);
            this.baseGroupY = this.group.position.y;
        }
        if (rotation) {
            this.group.quaternion.copy(rotation);
        }
    }

    animate() {
        const dt = 1 / 60;
        this.animationTime += dt;
        this.updateWingFlap(dt);

        if (this.isHeld) {
            if (this.bodyParts.head) {
                this.bodyParts.head.rotation.z = Math.sin(this.animationTime * 1.6) * THREE.MathUtils.degToRad(5);
            }
            if (this.bodyParts.tail) {
                this.bodyParts.tail.rotation.x = -0.28 + Math.sin(this.animationTime * 2.2) * 0.08;
                this.bodyParts.tail.rotation.y = Math.sin(this.animationTime * 1.8) * THREE.MathUtils.degToRad(3);
            }
            return;
        }

        if (this.state === 'hopping') {
            this.hopTimer += dt;
            const t = Math.min(this.hopTimer / this.hopDuration, 1);
            const eased = 1 - ((1 - t) * (1 - t)); // easeOutQuad
            const arc = 4 * eased * (1 - eased);
            const travel = this.hopForwardDistance * eased;

            this.group.position.x = this.hopStart.x + this.hopDirection.x * travel;
            this.group.position.z = this.hopStart.z + this.hopDirection.z * travel;
            this.group.position.y = this.baseGroupY + arc * this.hopHeight;
            this.group.rotation.x = -arc * 0.2;

            if (this.constrainPosition) {
                this.constrainPosition(this.group.position);
            }

            if (t >= 1) {
                this.handleBurstCompletion();
            }
        } else if (this.state === 'flying') {
            this.flightTimer += dt;
            this.flightVelocity.y -= this.currentFlightGravity * dt;
            this.group.position.x += this.flightVelocity.x * dt;
            this.group.position.z += this.flightVelocity.z * dt;
            this.group.position.y += this.flightVelocity.y * dt;
            this.group.rotation.x = THREE.MathUtils.clamp(-this.flightVelocity.y * 0.05, -0.18, 0.18);

            if (this.constrainPosition) {
                this.constrainPosition(this.group.position);
            }

            if (this.group.position.y <= this.baseGroupY || this.flightTimer >= this.flightDurationMax) {
                this.flightVelocity.set(0, 0, 0);
                this.handleBurstCompletion();
            }
        } else {
            this.group.position.y = this.baseGroupY;
            if (this.bodyParts.head) {
                this.bodyParts.head.rotation.z = Math.sin(this.animationTime * 1.6) * THREE.MathUtils.degToRad(5);
            }
            if (this.bodyParts.tail) {
                this.bodyParts.tail.rotation.x = -0.28 + Math.sin(this.animationTime * 2.2) * 0.08;
                this.bodyParts.tail.rotation.y = Math.sin(this.animationTime * 1.8) * THREE.MathUtils.degToRad(3);
            }

            if (this.roaming) {
                this.idleTimer -= dt;
                if (this.idleTimer <= 0 && !this.travelActive) {
                    this.pickTravelTarget();
                }
            }
        }

        const half = this.boundarySize / 2 - 1;
        this.group.position.x = Math.max(-half, Math.min(half, this.group.position.x));
        this.group.position.z = Math.max(-half, Math.min(half, this.group.position.z));
    }

    interact() {
        if (this.isHeld) {
            return { action: 'held', sound: null };
        }
        this.travelActive = false;
        this.travelHopBudget = 0;
        this.interactionHopBudget = 1 + Math.floor(Math.random() * 2); // total 2-3 hops
        this.startBurstMove(this.hopDistance);
        this.idleTimer = 1 + Math.random() * 2.4;
        return { action: this.state, sound: null };
    }

}

export class VoxelBlackHeadedGrosbeak extends VoxelBird {
    static getDefaults() {
        return {
            size: 0.7,
            groundOffsetFactor: 0.18
        };
    }

    static buildPalette(colors = {}) {
        return {
            head: colors.head ?? 0x111111,
            back: colors.back ?? 0x2a1f1a,
            wing: colors.wing ?? 0x1d1d1d,
            belly: colors.belly ?? 0xf2d8a7,
            chest: colors.chest ?? 0xd99b4a,
            beak: colors.beak ?? 0xb3b9c7,
            legs: colors.legs ?? 0x646464,
            eye: colors.eye ?? 0x050505
        };
    }
}

export class VoxelWesternTanager extends VoxelBird {
    static getDefaults() {
        return {
            size: VoxelBlackHeadedGrosbeak.getDefaults().size,
            groundOffsetFactor: VoxelBlackHeadedGrosbeak.getDefaults().groundOffsetFactor
        };
    }

    static buildPalette(colors = {}) {
        return {
            // Iconic Western Tanager profile: red/orange head, yellow body, dark wings.
            head: colors.head ?? 0xd9482f,
            back: colors.back ?? 0xf0c63c,
            wing: colors.wing ?? 0x12151a,
            belly: colors.belly ?? 0xf6d85d,
            chest: colors.chest ?? 0xf3c84a,
            beak: colors.beak ?? 0x9096a6,
            legs: colors.legs ?? 0x595959,
            eye: colors.eye ?? 0x050505
        };
    }

    static getBuildProfile() {
        return {
            ...VoxelBird.getBuildProfile(),
            beak: {
                ...VoxelBird.getBuildProfile().beak,
                radius: 0.12,
                length: 0.46
            },
            tail: {
                ...VoxelBird.getBuildProfile().tail,
                size: { x: 0.56, y: 0.18, z: 0.86 }
            }
        };
    }
}

export class VoxelBlackNapedOriole extends VoxelBird {
    static getDefaults() {
        return {
            size: VoxelBlackHeadedGrosbeak.getDefaults().size * 1.05,
            groundOffsetFactor: VoxelBlackHeadedGrosbeak.getDefaults().groundOffsetFactor
        };
    }

    static buildPalette(colors = {}) {
        return {
            // Iconic Black-naped Oriole profile: bright yellow body with black nape/eye stripe.
            head: colors.head ?? 0x141414,
            back: colors.back ?? 0xf0cb32,
            wing: colors.wing ?? 0x191919,
            belly: colors.belly ?? 0xf7dc5f,
            chest: colors.chest ?? 0xf0c84a,
            beak: colors.beak ?? 0xc87a2b,
            legs: colors.legs ?? 0x5b5b5b,
            eye: colors.eye ?? 0x050505
        };
    }

    static getBuildProfile() {
        return {
            ...VoxelBird.getBuildProfile(),
            beak: {
                ...VoxelBird.getBuildProfile().beak,
                radius: 0.11,
                length: 0.62,
                position: { x: 0, y: -0.035, z: 0.6 }
            },
            tail: {
                ...VoxelBird.getBuildProfile().tail,
                size: { x: 0.5, y: 0.18, z: 1.15 },
                position: { x: 0, y: 1.33, z: -1.3 },
                rotationX: -0.38
            },
            legs: {
                ...VoxelBird.getBuildProfile().legs,
                thickness: 0.12,
                length: 0.88,
                legY: 0.45
            }
        };
    }
}

export class VoxelBlueCrownedHangingParrot extends VoxelBird {
    static getDefaults() {
        return {
            size: VoxelBlackHeadedGrosbeak.getDefaults().size * 0.8,
            groundOffsetFactor: VoxelBlackHeadedGrosbeak.getDefaults().groundOffsetFactor
        };
    }

    static buildPalette(colors = {}) {
        return {
            // Iconic hanging parrot cues: vivid green body and a bright blue crown.
            head: colors.head ?? 0x2f82cf,
            back: colors.back ?? 0x2e9b42,
            wing: colors.wing ?? 0x207634,
            belly: colors.belly ?? 0x5fc95e,
            chest: colors.chest ?? 0xe06934,
            beak: colors.beak ?? 0xd06d38,
            legs: colors.legs ?? 0x636363,
            eye: colors.eye ?? 0x050505
        };
    }

    static getBuildProfile() {
        return {
            ...VoxelBird.getBuildProfile(),
            beak: {
                ...VoxelBird.getBuildProfile().beak,
                radius: 0.15,
                length: 0.4,
                radialSegments: 5,
                position: { x: 0, y: -0.015, z: 0.52 }
            },
            tail: {
                ...VoxelBird.getBuildProfile().tail,
                size: { x: 0.5, y: 0.22, z: 0.52 },
                position: { x: 0, y: 1.3, z: -0.95 },
                rotationX: -0.18
            },
            legs: {
                ...VoxelBird.getBuildProfile().legs,
                thickness: 0.13,
                length: 0.64,
                legX: 0.2,
                legY: 0.44,
                legZ: 0.28,
                footSize: { x: 0.28, y: 0.1, z: 0.22 },
                footZ: 0.32
            }
        };
    }
}

export function createBird(options = {}) {
    return new VoxelBird(options);
}

export function createBlackHeadedGrosbeak(options = {}) {
    return new VoxelBlackHeadedGrosbeak(options);
}

export function createWesternTanager(options = {}) {
    return new VoxelWesternTanager(options);
}

export function createBlackNapedOriole(options = {}) {
    return new VoxelBlackNapedOriole(options);
}

export function createBlueCrownedHangingParrot(options = {}) {
    return new VoxelBlueCrownedHangingParrot(options);
}
