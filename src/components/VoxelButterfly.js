import * as THREE from 'three';

export class VoxelButterfly {
    constructor(options = {}) {
        try {
            this.size = options.size || 0.6;
            this.position = options.position || new THREE.Vector3(0, 3, 0);
            this.boundarySize = options.boundarySize || 45;
            this.group = new THREE.Group();

            this.animationTime = Math.random() * Math.PI * 2;
            this.flapPhase = Math.random() * Math.PI * 2;

            // Species: 0=Monarch  1=Blue Morpho  2=Swallowtail  3=Cabbage White  4=Red Admiral
            this.speciesType = options.speciesType !== undefined
                ? options.speciesType
                : Math.floor(Math.random() * 5);
            this.speciesProfile = VoxelButterfly.getSpeciesProfiles()[this.speciesType];

            // Per-individual variation
            this.wingSpan      = 0.85 + Math.random() * 0.45;
            this.flapSpeed     = 4.0  + Math.random() * 4.5;
            this.flapAmplitude = 0.60 + Math.random() * 0.30;
            this.flightHeight  = 2.5  + Math.random() * 4.5;
            this.flightRadius  = 5    + Math.random() * 14;
            this.orbitCenter   = options.position
                ? new THREE.Vector3(options.position.x, 0, options.position.z)
                : new THREE.Vector3((Math.random() - 0.5) * 30, 0, (Math.random() - 0.5) * 30);

            this.bodyParts = {};
            this.createBody();
            this.createWings();
            this.createAntennae();

            this.group.position.copy(this.position);
            this.group.position.y = this.flightHeight;

            this.targetPosition = new THREE.Vector3();
            this._toTarget = new THREE.Vector3();
            this.pickNewTarget();
        } catch (error) {
            console.error('Failed to create VoxelButterfly:', error);
            throw error;
        }
    }

    // ─── Body ────────────────────────────────────────────────────────────────

    createBody() {
        const s = this.size;
        const bc = this.speciesProfile.bodyColor;
        const mat = () => new THREE.MeshBasicMaterial({ color: bc });

        // Thorax
        const thoraxGeo = new THREE.BoxGeometry(0.16 * s, 0.16 * s, 0.42 * s);
        this.bodyParts.thorax = new THREE.Mesh(thoraxGeo, mat());
        this.bodyParts.thorax.castShadow = true;
        this.group.add(this.bodyParts.thorax);

        // Abdomen — three tapering segments trailing behind thorax
        for (let i = 0; i < 3; i++) {
            const taper = 1 - (i + 1) * 0.22;
            const w = 0.13 * s * taper;
            const seg = new THREE.Mesh(
                new THREE.BoxGeometry(w, w, 0.22 * s),
                mat()
            );
            seg.position.z = -(0.32 + i * 0.21) * s;
            this.group.add(seg);
        }

        // Head
        const headGeo = new THREE.BoxGeometry(0.20 * s, 0.20 * s, 0.20 * s);
        this.bodyParts.head = new THREE.Mesh(headGeo, mat());
        this.bodyParts.head.position.z = 0.33 * s;
        this.group.add(this.bodyParts.head);

        // Eyes
        const eyeGeo = new THREE.BoxGeometry(0.07 * s, 0.07 * s, 0.04 * s);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
        for (const side of [-1, 1]) {
            const eye = new THREE.Mesh(eyeGeo, eyeMat);
            eye.position.set(side * 0.10 * s, 0.04 * s, 0.12 * s);
            this.bodyParts.head.add(eye);
        }
    }

    // ─── Wings ───────────────────────────────────────────────────────────────

    createWings() {
        const s  = this.size;
        const ws = this.wingSpan;

        // Two wing groups — one per side. They pivot at the body centreline (x=0).
        this.bodyParts.wingGroupLeft  = new THREE.Group();
        this.bodyParts.wingGroupRight = new THREE.Group();
        this.group.add(this.bodyParts.wingGroupLeft);
        this.group.add(this.bodyParts.wingGroupRight);

        const sharedMat = new THREE.MeshBasicMaterial({
            vertexColors: true,
            side: THREE.DoubleSide
        });

        // Upper (forewing)
        const upW = 1.0 * s * ws;
        const upD = 0.72 * s * ws;

        // Lower (hindwing) — smaller, set back
        const loW = 0.70 * s * ws;
        const loD = 0.56 * s * ws;

        const wings = [
            { key: 'upper', w: upW, d: upD, zOff: 0.10 * s  },
            { key: 'lower', w: loW, d: loD, zOff: -0.28 * s },
        ];

        for (const { key, w, d, zOff } of wings) {
            for (const side of [-1, 1]) {
                // 10×1×10 gives 121 XZ-plane vertices → smooth patterns
                const geo = new THREE.BoxGeometry(w, 0.028 * s, d, 10, 1, 10);
                this.paintWing(geo, key);
                const mesh = new THREE.Mesh(geo, sharedMat.clone());
                // Inner edge of mesh sits at x=0 in the wing-group's local space
                mesh.position.set(side * w * 0.5, 0, zOff);

                const group = side === -1
                    ? this.bodyParts.wingGroupLeft
                    : this.bodyParts.wingGroupRight;
                group.add(mesh);

                const partName = `${key}Wing${side === -1 ? 'Left' : 'Right'}`;
                this.bodyParts[partName] = mesh;
            }
        }
    }

    paintWing(geometry, wingType) {
        geometry.computeBoundingBox();
        const bb = geometry.boundingBox;
        const pos = geometry.attributes.position;
        const n   = pos.count;
        const buf = new Float32Array(n * 3);

        const rangeX = bb.max.x - bb.min.x || 1;
        const rangeZ = bb.max.z - bb.min.z || 1;

        const p = this.speciesProfile;
        const src = (wingType === 'lower' && p.lowerWingColors) ? p.lowerWingColors : p.upperWingColors;

        const c0 = new THREE.Color(src[0]);
        const c1 = new THREE.Color(src[1] !== undefined ? src[1] : src[0]);
        const c2 = new THREE.Color(src[2] !== undefined ? src[2] : src[1] !== undefined ? src[1] : src[0]);
        const c3 = new THREE.Color(src[3] !== undefined ? src[3] : c2.getHex());

        const tmp = new THREE.Color();

        for (let i = 0; i < n; i++) {
            const x = pos.getX(i);
            const z = pos.getZ(i);

            // nx: 0 = left edge, 1 = right edge of geometry
            // outerFrac: 0 = centre of wing width, 1 = either tip edge
            const nx = (x - bb.min.x) / rangeX;
            const nz = (z - bb.min.z) / rangeZ;
            const outerFrac = Math.abs(nx * 2 - 1); // 0 at body, 1 at tip

            tmp.copy(c0);

            switch (p.patternType) {
                case 'monarch': {
                    // Orange base, black border + veins, white fringe spots on outer edge
                    const border = outerFrac > 0.83 || nz < 0.09 || nz > 0.91;
                    const veinX  = Math.abs(((nx * 5) % 1) - 0.5) < 0.10;
                    const veinZ  = Math.abs(((nz * 4) % 1) - 0.5) < 0.09;
                    if (border) {
                        tmp.copy(c1);
                        if (outerFrac > 0.83 && Math.sin(nz * 20) > 0.45) tmp.copy(c2);
                    } else if (veinX || veinZ) {
                        tmp.copy(c1).lerp(c0, 0.52);
                    }
                    break;
                }
                case 'morpho': {
                    // Electric blue with shimmer gradient + dark edges
                    const shimmer = (Math.sin(outerFrac * 7 + nz * 5) + 1) * 0.5;
                    const fade    = Math.max(0, 1 - outerFrac * 1.5);
                    if (outerFrac > 0.86) {
                        tmp.copy(c1);
                    } else {
                        tmp.copy(c0).lerp(c2, shimmer * fade * 0.75);
                    }
                    break;
                }
                case 'swallowtail': {
                    // Yellow with repeating black bands; blue/red spot on hindwing rear
                    const band = Math.sin(outerFrac * Math.PI * 3.8 + nz) > 0.40;
                    const edge = outerFrac > 0.89 || outerFrac < 0.05;
                    if (edge || band) {
                        tmp.copy(c1);
                    }
                    if (wingType === 'lower' && outerFrac > 0.52 && nz > 0.54) {
                        tmp.copy(c2);
                    }
                    break;
                }
                case 'white': {
                    // Off-white with subtle grey tips and faint vein grid
                    const vein = Math.abs(((nx * 3) % 1) - 0.5) < 0.05
                              || Math.abs(((nz * 3) % 1) - 0.5) < 0.05;
                    if (outerFrac > 0.82) {
                        tmp.copy(c0).lerp(c1, 0.50);
                    } else if (vein) {
                        tmp.copy(c0).lerp(c1, 0.22);
                    }
                    break;
                }
                case 'admiral': {
                    // Mostly black; crimson band; white spots near tip; orange inner hindwing
                    tmp.copy(c1); // dark base
                    const redBand   = outerFrac > 0.28 && outerFrac < 0.56;
                    const whiteDots = outerFrac > 0.80 && Math.sin(nz * 14) > 0.30;
                    const hindOrange = wingType === 'lower' && outerFrac < 0.20;
                    if (redBand)    tmp.copy(c0);
                    if (whiteDots)  tmp.copy(c2);
                    if (hindOrange) tmp.copy(c3);
                    break;
                }
            }

            buf[i * 3]     = tmp.r;
            buf[i * 3 + 1] = tmp.g;
            buf[i * 3 + 2] = tmp.b;
        }

        geometry.setAttribute('color', new THREE.BufferAttribute(buf, 3));
    }

    // ─── Antennae ─────────────────────────────────────────────────────────────

    createAntennae() {
        const s   = this.size;
        const mat = new THREE.MeshBasicMaterial({ color: this.speciesProfile.bodyColor });

        for (const side of [-1, 1]) {
            const shaft = new THREE.Mesh(
                new THREE.BoxGeometry(0.025 * s, 0.36 * s, 0.025 * s),
                mat
            );
            shaft.position.set(side * 0.07 * s, 0.22 * s, 0.10 * s);
            shaft.rotation.z = -side * 0.35;
            shaft.rotation.x = -0.42;
            this.bodyParts.head.add(shaft);

            // Knob at tip
            const knob = new THREE.Mesh(
                new THREE.BoxGeometry(0.065 * s, 0.065 * s, 0.065 * s),
                mat
            );
            knob.position.y = 0.21 * s;
            shaft.add(knob);
        }
    }

    // ─── Flight ───────────────────────────────────────────────────────────────

    pickNewTarget() {
        const angle = Math.random() * Math.PI * 2;
        const dist  = 3 + Math.random() * this.flightRadius;
        const half  = this.boundarySize - 4;

        this.targetPosition.set(
            Math.max(-half, Math.min(half, this.orbitCenter.x + Math.sin(angle) * dist)),
            Math.max(1.5, this.flightHeight + (Math.random() - 0.5) * 3.5),
            Math.max(-half, Math.min(half, this.orbitCenter.z + Math.cos(angle) * dist))
        );
    }

    // ─── Animation ────────────────────────────────────────────────────────────

    animate() {
        const dt = 1 / 60;
        this.animationTime += dt;
        this.flapPhase     += this.flapSpeed * dt;

        // ── Wing flap (rotate around Z axis at body centreline) ──
        // Positive rotation.z: +X goes up, −X goes down.
        // Left wing extends toward −X → needs −rotation.z to lift tip upward.
        const flap = Math.sin(this.flapPhase) * this.flapAmplitude;
        if (this.bodyParts.wingGroupLeft)  this.bodyParts.wingGroupLeft.rotation.z  = -flap;
        if (this.bodyParts.wingGroupRight) this.bodyParts.wingGroupRight.rotation.z =  flap;

        // ── Move toward target ──
        this._toTarget.subVectors(this.targetPosition, this.group.position);
        const dist = this._toTarget.length();

        if (dist < 1.2) {
            this.pickNewTarget();
        } else {
            const speed = 0.026 + Math.abs(Math.sin(this.flapPhase * 0.4)) * 0.012;
            this.group.position.addScaledVector(this._toTarget.normalize(), speed);
        }

        // ── Flutter jitter (erratic butterfly flight) ──
        this.group.position.x += Math.sin(this.animationTime * 4.1 + this.flapPhase * 0.7) * 0.007;
        this.group.position.z += Math.cos(this.animationTime * 3.3 + this.flapPhase * 0.5) * 0.007;

        // ── Vertical bob ──
        this.group.position.y += Math.sin(this.animationTime * 2.4) * 0.004;

        // ── Face direction of travel (smooth Y-axis rotation) ──
        if (dist > 0.6) {
            const targetYaw = Math.atan2(this._toTarget.x, this._toTarget.z);
            let yawDiff = targetYaw - this.group.rotation.y;
            // Wrap to [−π, π]
            yawDiff = ((yawDiff + Math.PI) % (Math.PI * 2)) - Math.PI;
            this.group.rotation.y += yawDiff * 0.07;
        }

        // ── Subtle tilt ──
        this.group.rotation.x = Math.sin(this.animationTime * 1.6) * 0.06;
    }

    getStatus() {
        return { action: 'flying', species: this.speciesProfile.name };
    }

    // ─── Species profiles ─────────────────────────────────────────────────────

    static getSpeciesProfiles() {
        return [
            {   // 0 — Monarch
                name: 'Monarch',
                bodyColor: 0x0E0800,
                upperWingColors: [0xE8620A, 0x080400, 0xF6F6F6],
                lowerWingColors: [0xD45608, 0x080400, 0xF0F0F0],
                patternType: 'monarch'
            },
            {   // 1 — Blue Morpho
                name: 'Blue Morpho',
                bodyColor: 0x08080E,
                upperWingColors: [0x1A5EE8, 0x040408, 0x82BAFF],
                lowerWingColors: [0x1452D0, 0x040408, 0x6CA2F2],
                patternType: 'morpho'
            },
            {   // 2 — Swallowtail
                name: 'Swallowtail',
                bodyColor: 0x0C0C00,
                upperWingColors: [0xF0E014, 0x080800, 0x4082E8, 0xE03030],
                lowerWingColors: [0xE8D80C, 0x080800, 0x3072D8],
                patternType: 'swallowtail'
            },
            {   // 3 — Cabbage White
                name: 'Cabbage White',
                bodyColor: 0x282828,
                upperWingColors: [0xF4F4F4, 0x5A5A5A],
                lowerWingColors: [0xEEEEEE, 0x525252],
                patternType: 'white'
            },
            {   // 4 — Red Admiral
                name: 'Red Admiral',
                bodyColor: 0x080808,
                upperWingColors: [0xCC1C0A, 0x080808, 0xF2F2F2, 0xE05C10],
                lowerWingColors: [0xBE1408, 0x080808, 0xEEEEEE, 0xD85010],
                patternType: 'admiral'
            }
        ];
    }
}

export function createButterfly(options = {}) {
    return new VoxelButterfly(options);
}
