import * as THREE from 'three';

export class VoxelBlackHeadedGrosbeak {
    constructor(options = {}) {
        this.size = options.size || 0.7;
        this.position = options.position || new THREE.Vector3(0, 0, 0);
        this.boundarySize = options.boundarySize || 45;
        this.groundOffset = options.groundOffset ?? (0.18 * this.size);
        this.roaming = options.roaming !== false;
        this.constrainPosition = options.constrainPosition || null;
        this.group = new THREE.Group();
        this.bodyParts = {};
        this.animationTime = Math.random() * Math.PI * 2;

        this.palette = VoxelBlackHeadedGrosbeak.buildPalette(options.colors);

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
        this.idleTimer = 1.2 + Math.random() * 2.6;

        this.createBody();
        this.group.position.copy(this.position);
        this.group.position.y += this.groundOffset;
        this.baseGroupY = this.group.position.y;
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

    createBody() {
        const s = this.size;
        const mat = (color) => new THREE.MeshBasicMaterial({ color });

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
            new THREE.ConeGeometry(0.13 * s, 0.5 * s, 4),
            mat(this.palette.beak)
        );
        beak.rotation.x = Math.PI / 2;
        beak.position.set(0, -0.03 * s, 0.56 * s);
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
            new THREE.BoxGeometry(0.6 * s, 0.2 * s, 0.9 * s),
            mat(this.palette.wing)
        );
        tail.position.set(0, 1.35 * s, -1.15 * s);
        tail.rotation.x = -0.28;
        this.group.add(tail);
        this.bodyParts.tail = tail;

        const legGeo = new THREE.BoxGeometry(0.14 * s, 0.8 * s, 0.14 * s);
        const footGeo = new THREE.BoxGeometry(0.34 * s, 0.1 * s, 0.25 * s);
        const leftLeg = new THREE.Mesh(legGeo, mat(this.palette.legs));
        leftLeg.position.set(-0.23 * s, 0.48 * s, 0.3 * s);
        this.group.add(leftLeg);
        const rightLeg = new THREE.Mesh(legGeo, mat(this.palette.legs));
        rightLeg.position.set(0.23 * s, 0.48 * s, 0.3 * s);
        this.group.add(rightLeg);
        const leftFoot = new THREE.Mesh(footGeo, mat(this.palette.legs));
        leftFoot.position.set(-0.23 * s, 0.05 * s, 0.35 * s);
        this.group.add(leftFoot);
        const rightFoot = new THREE.Mesh(footGeo, mat(this.palette.legs));
        rightFoot.position.set(0.23 * s, 0.05 * s, 0.35 * s);
        this.group.add(rightFoot);
        this.bodyParts.leftLeg = leftLeg;
        this.bodyParts.rightLeg = rightLeg;
        this.bodyParts.leftFoot = leftFoot;
        this.bodyParts.rightFoot = rightFoot;
    }

    setColors(colors = {}) {
        this.palette = VoxelBlackHeadedGrosbeak.buildPalette({ ...this.palette, ...colors });
        this.bodyParts.head.material.color.setHex(this.palette.head);
        this.bodyParts.body.material.color.setHex(this.palette.back);
        this.bodyParts.leftWing.material.color.setHex(this.palette.wing);
        this.bodyParts.rightWing.material.color.setHex(this.palette.wing);
        this.bodyParts.tail.material.color.setHex(this.palette.wing);
        this.bodyParts.belly.material.color.setHex(this.palette.belly);
        this.bodyParts.chest.material.color.setHex(this.palette.chest);
        this.bodyParts.beak.material.color.setHex(this.palette.beak);
        this.bodyParts.leftLeg.material.color.setHex(this.palette.legs);
        this.bodyParts.rightLeg.material.color.setHex(this.palette.legs);
        this.bodyParts.leftFoot.material.color.setHex(this.palette.legs);
        this.bodyParts.rightFoot.material.color.setHex(this.palette.legs);
        this.bodyParts.leftEye.material.color.setHex(this.palette.eye);
        this.bodyParts.rightEye.material.color.setHex(this.palette.eye);
    }

    setState(state) {
        if (state === 'hopping') {
            this.startHop();
            return;
        }
        this.state = 'neutral';
        this.hopTimer = 0;
        this.travelActive = false;
        this.interactionHopBudget = 0;
        this.group.position.y = this.baseGroupY;
        this.group.rotation.x = 0;
        if (this.bodyParts.head) {
            this.bodyParts.head.rotation.z = 0;
        }
        if (this.bodyParts.tail) {
            this.bodyParts.tail.rotation.x = -0.28;
            this.bodyParts.tail.rotation.y = 0;
        }
    }

    startHop(forwardDistance = this.hopDistance) {
        if (this.state === 'hopping' && this.hopTimer < this.hopDuration) return;
        this.state = 'hopping';
        this.hopTimer = 0;
        this.hopForwardDistance = forwardDistance;
        this.hopStart.copy(this.group.position);
        const yaw = this.group.rotation.y;
        this.hopDirection.set(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
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
        this.startHop(nextHopDistance);
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

    animate() {
        const dt = 1 / 60;
        this.animationTime += dt;

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
                this.group.position.y = this.baseGroupY;
                this.group.rotation.x = 0;

                if (this.travelActive && this.travelHopBudget > 0) {
                    this.travelHopBudget -= 1;
                    const remaining = this.group.position.distanceTo(this.travelTarget);
                    if (remaining > 0.35 && this.travelHopBudget > 0) {
                        this.startTravelHop();
                    } else {
                        this.travelActive = false;
                        this.state = 'neutral';
                        this.idleTimer = 1.4 + Math.random() * 2.8;
                    }
                } else if (this.interactionHopBudget > 0) {
                    this.interactionHopBudget -= 1;
                    this.startHop(this.hopDistance);
                } else {
                    this.state = 'neutral';
                }
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
        this.travelActive = false;
        this.travelHopBudget = 0;
        this.interactionHopBudget = 1 + Math.floor(Math.random() * 2); // total 2-3 hops
        this.startHop(this.hopDistance);
        this.idleTimer = 1 + Math.random() * 2.4;
        return { action: this.state, sound: null };
    }

    getStatus() {
        return {
            species: 'Black-headed Grosbeak',
            action: this.state
        };
    }
}

export function createBlackHeadedGrosbeak(options = {}) {
    return new VoxelBlackHeadedGrosbeak(options);
}
