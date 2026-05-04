import * as THREE from 'three';

export class VoxelOcelot {
    constructor(options = {}) {
        try {
            this.size = options.size || 0.6;
            this.position = options.position || new THREE.Vector3(0, 0, 0);
            this.boundarySize = options.boundarySize || 45;
            this.group = new THREE.Group();

            this.bodyParts = {};
            this.animationTime = Math.random() * Math.PI * 2;

            // Species determines the overall look — 0=Ocelot 1=Snow Leopard 2=Cheetah 3=Serval 4=Bengal
            this.speciesType = options.speciesType !== undefined
                ? options.speciesType
                : Math.floor(Math.random() * 5);
            this.speciesProfile = VoxelOcelot.getSpeciesProfiles()[this.speciesType];

            // Pattern index selects within the species colour palette
            this.pattern = options.pattern !== undefined
                ? options.pattern
                : Math.floor(Math.random() * this.speciesProfile.bodyColors.length);

            // Per-individual anatomical variation
            this.earSize = 0.9 + Math.random() * 0.7;
            this.earHeight = 1.2 + Math.random() * 0.5;
            this.tailLength = (1 + Math.random() * 1.2) * this.speciesProfile.tailLengthMod;
            this.tailTaper = 0.78 + Math.random() * 0.14;
            this.tailLift = Math.random();
            this.headWidth = 0.95 + Math.random() * 0.35;
            this.spotDensity = 0.8 + Math.random() * 0.6;
            this.bodyLengthVariance = 0.9 + Math.random() * 0.3;

            this.createBody();
            this.createHead();
            this.createLegs();
            this.createTail();
            this.setColorPattern();

            this.group.position.copy(this.position);
            this.baseGroupY = this.group.position.y;
            this.basePose = this.captureBasePose();

            this.currentAction = 'idle';
            this.actionTimer = 90 + Math.random() * 80;
            this.targetPosition = new THREE.Vector3();
            this.movementSpeed = 0.02;
            this.targetRotation = 0;
            this.jumpProgress = 0;
            this.interactionCooldown = 0;

            // Wand interaction properties
            this.wandFollowTimer = 0;
            this.wandInterestLevel = 0;

            // Laser pointer interaction properties
            this.laserFollowTimer = 0;
            this.laserInterestLevel = 0;

            // ── Personality ──
            const personalities = ['clingy', 'loner', 'active'];
            this.personality = personalities[Math.floor(Math.random() * personalities.length)];

            // Clingy state machine
            this.clingyState = 'dormant';       // 'dormant' | 'approaching' | 'nearby' | 'walking_away'
            this.clingyAttentionTimer = 0;      // counts down while nearby; interaction resets it
            this.clingyRefreshTimer = 0;        // counts down after walking away; resets to dormant

            // Loner flee state
            this.lonerFleeRadius = 4 + Math.random() * 3;  // 4–7 units
            this.lonerFleeing = false;

            // Active / zoomies state
            this.zoomiesActive = false;
            this.zoomiesTimer = 0;
            if (this.personality === 'active') {
                this.movementSpeed = 0.04;
            }
        } catch (error) {
            console.error('Failed to create VoxelOcelot:', error);
            throw error;
        }
    }

    createBody() {
        const s = this.size;
        const lv = this.bodyLengthVariance;

        // Subdivided geometry gives many more vertices for detailed vertex-color patterns
        const torsoGeo = new THREE.BoxGeometry(3.2 * s * lv, 1.15 * s, 1.6 * s, 8, 4, 5);
        const torsoMat = new THREE.MeshBasicMaterial({color: this.getBodyColor()});
        this.bodyParts.torso = new THREE.Mesh(torsoGeo, torsoMat);
        this.bodyParts.torso.position.y = 1.5 * s;
        this.bodyParts.torso.castShadow = true;
        this.group.add(this.bodyParts.torso);

        // Belly: lighter strip on underside, child of torso so it follows all animations
        const bellyGeo = new THREE.BoxGeometry(2.6 * s * lv, 0.08 * s, 1.0 * s);
        const bellyMat = new THREE.MeshBasicMaterial({color: this.getBellyColor()});
        const belly = new THREE.Mesh(bellyGeo, bellyMat);
        belly.position.y = -(1.15 * s / 2) - 0.04 * s;  // just below torso bottom face
        this.bodyParts.torso.add(belly);
        this.bodyParts.belly = belly;
    }

    createHead() {
        const s = this.size;
        const wv = this.headWidth;    // 0.95 – 1.3
        const earS = this.earSize;    // 0.9 – 1.6
        const earH = this.earHeight;  // 1.2 – 1.7

        const headW = 1.6 * s * wv;
        const headHt = 1.4 * s;
        const headD = 1.3 * s;

        const headGroup = new THREE.Group();
        headGroup.position.set(1.9 * s * wv, 2.15 * s, 0);
        this.bodyParts.head = headGroup;
        this.group.add(headGroup);

        // Main head box
        // Subdivided for visible patterns on the face
        const headGeo = new THREE.BoxGeometry(headW, headHt, headD, 4, 3, 4);
        const headMat = new THREE.MeshBasicMaterial({color: this.getBodyColor()});
        const headMesh = new THREE.Mesh(headGeo, headMat);
        headMesh.castShadow = true;
        headGroup.add(headMesh);
        this.bodyParts.headMesh = headMesh;

        // ── Snout / Muzzle ──
        // Protrudes from lower-front of face; narrower in Z for cat-like profile
        const snoutProjX = 0.28 * s;
        const snoutH = headHt * 0.52;
        const snoutD = headD * 0.60;
        const snoutGeo = new THREE.BoxGeometry(snoutProjX, snoutH, snoutD, 2, 2, 3);
        const snoutMat = new THREE.MeshBasicMaterial({color: this.getBodyColor()});
        const snout = new THREE.Mesh(snoutGeo, snoutMat);
        snout.position.set(headW / 2 + snoutProjX / 2, -headHt * 0.14, 0);
        snout.castShadow = true;
        this.bodyParts.snout = snout;
        headGroup.add(snout);

        // ── Ears ── (cuboid ears instead of cone-shaped, oriented horizontally)
        const earWidth = 0.45 * s * earS;  // Increased width for horizontal orientation
        const earHeight = 0.24 * s * earH; // Decreased height for horizontal orientation
        const earDepth = 0.18 * s * earS;  // Adjusted depth
        const earLocalY = headHt / 2 + earHeight / 2;
        const earLocalZ = headD * 0.28;

        // 70% probability for both ears to be the same color
        const sameEarColor = Math.random() < 0.7;
        const leftEarColor = this.getEarColor();
        const rightEarColor = sameEarColor ? leftEarColor : this.getEarColor();

        const earGeo = new THREE.BoxGeometry(earWidth, earHeight, earDepth);
        const leftEarMat = new THREE.MeshBasicMaterial({color: leftEarColor});
        const rightEarMat = new THREE.MeshBasicMaterial({color: rightEarColor});

        // Inner ear: smaller pink cuboid sitting inside the outer ear
        const innerWidth = earWidth * 0.70;
        const innerHeight = earHeight * 0.52;
        const innerDepth = earDepth * 0.52;
        const innerGeo = new THREE.BoxGeometry(innerWidth, innerHeight, innerDepth);
        const innerMat = new THREE.MeshBasicMaterial({
            color: 0xE8A0A8,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1
        });

        const leftEar = new THREE.Mesh(earGeo, leftEarMat);
        leftEar.position.set(0, earLocalY, earLocalZ);
        leftEar.castShadow = true;
        this.bodyParts.leftEar = leftEar;
        headGroup.add(leftEar);

        const leftInner = new THREE.Mesh(innerGeo, innerMat.clone());
        leftInner.position.set(0, earLocalY, earLocalZ);
        headGroup.add(leftInner);

        const rightEar = new THREE.Mesh(earGeo, rightEarMat);
        rightEar.position.set(0, earLocalY, -earLocalZ);
        rightEar.castShadow = true;
        this.bodyParts.rightEar = rightEar;
        headGroup.add(rightEar);

        const rightInner = new THREE.Mesh(innerGeo, innerMat.clone());
        rightInner.position.set(0, earLocalY, -earLocalZ);
        headGroup.add(rightInner);

        // ── Eyes ── (on head front face, upper portion above snout)
        const eyeThick = 0.12 * s;
        const eyeHt = 0.28 * s;
        const eyeWide = 0.24 * s;
        const eyeLocalX = headW / 2 + eyeThick / 2;
        const eyeLocalY = headHt * 0.14;
        const eyeLocalZ = 0.30 * s;

        const eyeGeo = new THREE.BoxGeometry(eyeThick, eyeHt, eyeWide);
        const eyeMat = new THREE.MeshBasicMaterial({color: this.getEyeColor()});

        const leftEye = new THREE.Mesh(eyeGeo, eyeMat.clone());
        leftEye.position.set(eyeLocalX, eyeLocalY, eyeLocalZ);
        this.bodyParts.leftEye = leftEye;
        headGroup.add(leftEye);

        const rightEye = new THREE.Mesh(eyeGeo, eyeMat.clone());
        rightEye.position.set(eyeLocalX, eyeLocalY, -eyeLocalZ);
        this.bodyParts.rightEye = rightEye;
        headGroup.add(rightEye);

        // Slit pupils — narrow dark vertical bar on each eye face
        const pupilGeo = new THREE.BoxGeometry(eyeThick * 1.1, eyeHt * 0.62, eyeWide * 0.20);
        const pupilMat = new THREE.MeshBasicMaterial({
            color: 0x060606,
            polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
        });
        const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
        leftPupil.position.set(eyeLocalX, eyeLocalY, eyeLocalZ);
        headGroup.add(leftPupil);

        const rightPupil = new THREE.Mesh(pupilGeo, pupilMat.clone());
        rightPupil.position.set(eyeLocalX, eyeLocalY, -eyeLocalZ);
        headGroup.add(rightPupil);

        // ── Nose ── (on snout front face, below eyes)
        const snoutFrontX = headW / 2 + snoutProjX + eyeThick / 2;
        const noseGeo = new THREE.BoxGeometry(eyeThick, 0.18 * s, 0.26 * s);
        const noseMat = new THREE.MeshBasicMaterial({color: 0xE8A090});
        const nose = new THREE.Mesh(noseGeo, noseMat);
        nose.position.set(snoutFrontX, -headHt * 0.14, 0);
        this.bodyParts.nose = nose;
        headGroup.add(nose);
    }

    createLegs() {
        const s = this.size;
        const legH = 1.0 * s;
        const legW = 0.42 * s;
        const pawH = 0.20 * s;
        const pawW = 0.58 * s;
        const pawD = 0.64 * s;

        const legGeo = new THREE.BoxGeometry(legW, legH, legW);
        const pawGeo = new THREE.BoxGeometry(pawW, pawH, pawD);
        const mat = new THREE.MeshBasicMaterial({color: this.getBodyColor()});

        const positions = [
            {x: -1.1, z: 0.55, name: 'frontLeftLeg'},
            {x: -1.1, z: -0.55, name: 'frontRightLeg'},
            {x: 1.1, z: 0.55, name: 'backLeftLeg'},
            {x: 1.1, z: -0.55, name: 'backRightLeg'}
        ];

        positions.forEach(pos => {
            // Group so paw moves with leg in all animations
            const legGroup = new THREE.Group();
            legGroup.position.set(pos.x * s, 0.55 * s, pos.z * s);

            const legMesh = new THREE.Mesh(legGeo, mat.clone());
            legMesh.castShadow = true;
            legGroup.add(legMesh);

            // Paw at leg bottom, slightly wider/deeper to show the foot
            const pawMesh = new THREE.Mesh(pawGeo, mat.clone());
            pawMesh.position.y = -(legH / 2 + pawH / 2);
            pawMesh.castShadow = true;
            legGroup.add(pawMesh);

            this.bodyParts[pos.name] = legGroup;
            this.group.add(legGroup);
        });
    }

    createTail() {
        const s = this.size;
        this.bodyParts.tailSegments = [];

        const tailVar = this.tailLength;
        const tailTaper = this.tailTaper;
        const tailLift = this.tailLift;
        const tailSegments = Math.floor(7 * (0.7 + tailVar * 0.5));  // 5 – 12 segments
        const segLen = 0.32 * s * (tailVar * 0.3 + 0.75);

        const torsoBackX = -1.6 * s * this.bodyLengthVariance;
        const tailBaseY = 1.5 * s + 0.18 * s;

        const prof = this.speciesProfile;
        const bodyColor = this.getBodyColor();
        const ringColorA = prof.tailRingColors[0];
        const ringColorB = prof.tailRingColors[1] ?? bodyColor;

        let cumX = 0;
        for (let i = 0; i < tailSegments; i++) {
            const segSize = s * Math.pow(tailTaper, i);
            const len = segLen * segSize;
            const thick = 0.35 * segSize;

            // Per-species tail colour pattern
            const segColor = this.getTailSegmentColor(i, tailSegments, bodyColor, ringColorA, ringColorB);

            const tailGeo = new THREE.BoxGeometry(len, thick, thick);
            const tailMat = new THREE.MeshBasicMaterial({color: segColor});
            const segment = new THREE.Mesh(tailGeo, tailMat);

            cumX += len;
            const t = i / tailSegments;
            const arcY = tailLift * t * t * 1.6 * s;

            segment.position.set(torsoBackX - (cumX - len * 0.5), tailBaseY + arcY, 0);
            segment.castShadow = true;

            this.bodyParts.tailSegments.push(segment);
            this.group.add(segment);
        }
    }

    getTailSegmentColor(i, total, bodyColor, ringA, ringB) {
        const pattern = this.speciesProfile.tailPattern;
        const t = i / total;

        if (pattern === 'solid') return bodyColor;

        if (pattern === 'ringed') {
            // Alternate every segment: body / dark ring
            return i % 2 === 0 ? bodyColor : ringA;
        }

        if (pattern === 'banded') {
            // Wider bands: alternate every 2 segments
            return Math.floor(i / 2) % 2 === 0 ? bodyColor : ringA;
        }

        if (pattern === 'ringed_tip') {
            // Solid body colour for first half, then dark rings; last segment = light tip
            if (i === total - 1) return ringB;      // white/light tip
            if (t < 0.5) return bodyColor;
            return i % 2 === 0 ? bodyColor : ringA;
        }

        if (pattern === 'gradient') {
            // Gradually darkens toward the tip
            const darkColor = new THREE.Color(ringA);
            const baseColor = new THREE.Color(bodyColor);
            return baseColor.lerp(darkColor, t * t).getHex();
        }

        return bodyColor;
    }

    setColorPattern() {
        const prof = this.speciesProfile;
        const baseColor = this.getBodyColor();
        const spotColor = this.getSpotColor();
        const accentColor = this.getAccentColor();
        const spotRadius = prof.spotRadius * this.size;
        const spotCount = Math.floor((8 + Math.random() * 10) * this.spotDensity * prof.spotDensityMod);

        const torso = this.bodyParts.torso;
        const head = this.bodyParts.headMesh;
        const snout = this.bodyParts.snout;

        if (prof.spotStyle === 'striped') {
            // Serval: dorsal stripes along body + spots on head
            const stripes = 3 + Math.floor(Math.random() * 3);
            if (torso && torso.geometry) {
                this.addStripesToMesh(torso, stripes, baseColor, spotColor);
            }
            if (head && head.geometry) {
                this.addSpotsToMesh(head, Math.ceil(spotCount * 0.5), baseColor, spotColor, accentColor, spotRadius * 0.7);
            }
            if (snout && snout.geometry) {
                this.addSpotsToMesh(snout, 2, baseColor, spotColor, accentColor, spotRadius * 0.4);
            }
        } else {
            // Rosette / solid_spots / marbled all use the spot system with species radius
            if (torso && torso.geometry) {
                this.addSpotsToMesh(torso, spotCount, baseColor, spotColor, accentColor, spotRadius);
            }
            if (head && head.geometry) {
                this.addSpotsToMesh(head, Math.ceil(spotCount * 0.4), baseColor, spotColor, accentColor, spotRadius * 0.75);
            }
            if (snout && snout.geometry) {
                this.addSpotsToMesh(snout, Math.ceil(spotCount * 0.15), baseColor, spotColor, accentColor, spotRadius * 0.5);
            }
        }
    }

    addSpotsToMesh(mesh, spotCount, baseColor, spotColor, accentColor, spotRadius = null) {
        const geometry = mesh.geometry;
        geometry.computeBoundingBox();
        const bb = geometry.boundingBox;
        const bbSize = new THREE.Vector3();
        bb.getSize(bbSize);

        const posAttr = geometry.attributes.position;
        const vertexCount = posAttr.count;
        const radius = spotRadius !== null ? spotRadius : 0.35 * this.size;
        const style = this.speciesProfile.spotStyle;

        // Place spots within the actual mesh bounds so they cover the whole surface
        const spots = [];
        for (let i = 0; i < spotCount; i++) {
            spots.push({
                x: bb.min.x + Math.random() * bbSize.x,
                y: bb.min.y + Math.random() * bbSize.y,
                z: bb.min.z + Math.random() * bbSize.z,
                size: radius * (0.45 + Math.random() * 0.65),
                color: Math.random() > 0.65 ? accentColor : spotColor
            });
        }

        const colors = [];
        const baseCol = new THREE.Color(baseColor);

        for (let i = 0; i < vertexCount; i++) {
            const x = posAttr.getX(i);
            const y = posAttr.getY(i);
            const z = posAttr.getZ(i);

            let color = baseCol.clone();

            for (const spot of spots) {
                const dist = Math.sqrt((x - spot.x) ** 2 + (y - spot.y) ** 2 + (z - spot.z) ** 2);
                if (dist >= spot.size) continue;

                const spotCol = new THREE.Color(spot.color);

                if (style === 'rosette') {
                    // Hollow rosette: open pale center surrounded by dark ring
                    if (dist < spot.size * 0.38) {
                        // Center brightens slightly — stays near base
                        const innerT = dist / (spot.size * 0.38);
                        color = baseCol.clone().lerp(spotCol, innerT * 0.25);
                    } else {
                        // Dark outer ring
                        const ringT = (dist - spot.size * 0.38) / (spot.size * 0.62);
                        color = baseCol.clone().lerp(spotCol, (1 - ringT) * 0.92);
                    }
                } else if (style === 'solid_spots') {
                    // Sharp-edged solid dots (cheetah)
                    const sharpBlend = dist < spot.size * 0.72 ? 0.95 : (1 - dist / spot.size) * 3.2;
                    color = baseCol.clone().lerp(spotCol, Math.min(1, sharpBlend));
                } else if (style === 'marbled') {
                    // Soft large blotches blending into each other (bengal)
                    const blend = (1 - dist / spot.size) * 0.78;
                    color = baseCol.clone().lerp(spotCol, blend);
                } else {
                    // Default smooth gradient
                    color = baseCol.clone().lerp(spotCol, (1 - dist / spot.size) * 0.9);
                }
                break;
            }

            colors.push(color.r, color.g, color.b);
        }

        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        mesh.material.vertexColors = true;
        mesh.material.needsUpdate = true;
    }

    addStripesToMesh(mesh, stripeCount, baseColor, stripeColor) {
        const geometry = mesh.geometry;
        geometry.computeBoundingBox();
        const bb = geometry.boundingBox;
        const bbSizeX = bb.max.x - bb.min.x;

        const posAttr = geometry.attributes.position;
        const colors = [];
        const base = new THREE.Color(baseColor);
        const stripe = new THREE.Color(stripeColor);

        for (let i = 0; i < posAttr.count; i++) {
            // Normalise X (body length) to 0..1, then make evenly-spaced bands
            const nx = (posAttr.getX(i) - bb.min.x) / bbSizeX;
            const phase = nx * stripeCount * Math.PI * 2;
            const t = (Math.sin(phase) + 1) * 0.5;
            const blend = t > 0.52 ? 0.88 : 0.0;
            colors.push(...base.clone().lerp(stripe, blend).toArray());
        }

        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        mesh.material.vertexColors = true;
        mesh.material.needsUpdate = true;
    }

    getBellyColor() {return this.speciesProfile.bellyColors[this.pattern % this.speciesProfile.bellyColors.length];}
    getBodyColor() {return this.speciesProfile.bodyColors[this.pattern % this.speciesProfile.bodyColors.length];}
    getEarColor() {return this.speciesProfile.earColors[this.pattern % this.speciesProfile.earColors.length];}
    getEyeColor() {return this.speciesProfile.eyeColors[this.pattern % this.speciesProfile.eyeColors.length];}
    getSpotColor() {return this.speciesProfile.spotColors[this.pattern % this.speciesProfile.spotColors.length];}
    getAccentColor() {return this.speciesProfile.accentColors[this.pattern % this.speciesProfile.accentColors.length];}

    static getSpeciesProfiles() {
        return [
            {   // 0 — Ocelot: tawny with dark rosettes, ringed tail
                bodyColors: [0xC17B3D, 0xD2691E, 0xCD853F, 0xDEB887, 0xDA8C45],
                earColors: [0xFFE4C4, 0xFFD9B3, 0xFFE8D0, 0xFFF5EE],
                eyeColors: [0xD4B020, 0xC8A818, 0xE0C030, 0xBCA010],  // golden yellow
                spotColors: [0x2A2A2A, 0x1A1A1A, 0x3D2B1F, 0x0D0D0D],
                accentColors: [0x8B4513, 0x704214, 0x654321, 0x6B4423],
                bellyColors: [0xFFF5E0, 0xFAF0E6, 0xFFF8EC],
                tailPattern: 'ringed',
                tailRingColors: [0x1C1C1C, 0xC17B3D],
                tailLengthMod: 1.0,
                spotStyle: 'rosette',
                spotDensityMod: 1.0,
                spotRadius: 0.35
            },
            {   // 1 — Snow Leopard: pale silver-gray, large faint rosettes, very long ringed tail
                bodyColors: [0xD2D2D2, 0xC4C4C4, 0xDCDCDC, 0xC8C8D8, 0xD8D4E0],
                earColors: [0xF0F0F0, 0xE8E8F0, 0xF5F5FF],
                eyeColors: [0x7090A8, 0x8098B0, 0x607890, 0x6888A0],  // pale blue-gray
                spotColors: [0x505060, 0x404050, 0x606070],
                accentColors: [0x303040, 0x282838, 0x383848],
                bellyColors: [0xFFFFFF, 0xF8F8FF, 0xFAFAFF],
                tailPattern: 'ringed',
                tailRingColors: [0x404050, 0xD0D0E0],
                tailLengthMod: 1.6,
                spotStyle: 'rosette',
                spotDensityMod: 0.6,
                spotRadius: 0.55
            },
            {   // 2 — Cheetah: golden, solid black spots, ringed-tip tail with white end
                bodyColors: [0xE8B86D, 0xD4A84B, 0xF0C060, 0xCCA040, 0xDAAA55],
                earColors: [0xFFF0D0, 0xFFE8B0, 0xFFF5D8],
                eyeColors: [0xC8780A, 0xD4860C, 0xBC700A, 0xE08A10],  // amber
                spotColors: [0x101010, 0x0A0A0A, 0x1A1A1A],
                accentColors: [0x202020, 0x181818, 0x0D0D0D],
                bellyColors: [0xFFFAF0, 0xFFFFF0, 0xFFF8E8],
                tailPattern: 'ringed_tip',
                tailRingColors: [0x101010, 0xF5F5F5],
                tailLengthMod: 1.15,
                spotStyle: 'solid_spots',
                spotDensityMod: 1.5,
                spotRadius: 0.22
            },
            {   // 3 — Serval: bright golden, bold dorsal stripes, banded tail
                bodyColors: [0xD4A840, 0xC89830, 0xE0B050, 0xBE9228, 0xD0A038],
                earColors: [0xFFE090, 0xFFD870, 0xFFEC9A],
                eyeColors: [0xA0C418, 0xB0D428, 0x90B410, 0xBCD830],  // yellow-green
                spotColors: [0x1A1A1A, 0x0A0A0A, 0x2A2A2A],
                accentColors: [0x3A2000, 0x2A1500, 0x4A2800],
                bellyColors: [0xFFF8E0, 0xFFFAF0, 0xFFF3D0],
                tailPattern: 'banded',
                tailRingColors: [0x1A1A1A, 0xD4A840],
                tailLengthMod: 0.75,
                spotStyle: 'striped',
                spotDensityMod: 0.9,
                spotRadius: 0.40
            },
            {   // 4 — Bengal: warm rust-brown, marbled patches, ringed tail
                bodyColors: [0xB8602C, 0xA05020, 0xC07035, 0xD08040, 0xC8703A],
                earColors: [0xFFD0A0, 0xFFC090, 0xFFD8B0],
                eyeColors: [0x5CA848, 0x6CB858, 0x4C9838, 0x70C060],  // green
                spotColors: [0x3C1A0A, 0x2A1005, 0x4A2010],
                accentColors: [0x5A2A10, 0x4A2010, 0x6A3010],
                bellyColors: [0xFFF0E0, 0xFAE8D8, 0xFFF5EA],
                tailPattern: 'ringed',
                tailRingColors: [0x2A1005, 0xD08040],
                tailLengthMod: 1.0,
                spotStyle: 'marbled',
                spotDensityMod: 0.75,
                spotRadius: 0.55
            }
        ];
    }

    captureBasePose() {
        return {
            torsoPosition: this.bodyParts.torso?.position.clone(),
            torsoRotation: this.bodyParts.torso?.rotation.clone(),
            torsoScale: this.bodyParts.torso?.scale.clone(),
            headPosition: this.bodyParts.head?.position.clone(),
            headRotation: this.bodyParts.head?.rotation.clone(),
            earLeftRotation: this.bodyParts.leftEar?.rotation.clone(),
            earRightRotation: this.bodyParts.rightEar?.rotation.clone(),
            legPositions: {
                frontLeftLeg: this.bodyParts.frontLeftLeg?.position.clone(),
                frontRightLeg: this.bodyParts.frontRightLeg?.position.clone(),
                backLeftLeg: this.bodyParts.backLeftLeg?.position.clone(),
                backRightLeg: this.bodyParts.backRightLeg?.position.clone()
            },
            tailPositions: (this.bodyParts.tailSegments || []).map(segment => segment.position.clone())
        };
    }

    restoreBasePose() {
        if (this.bodyParts.torso && this.basePose.torsoPosition && this.basePose.torsoScale) {
            this.bodyParts.torso.position.copy(this.basePose.torsoPosition);
            this.bodyParts.torso.scale.copy(this.basePose.torsoScale);
            if (this.basePose.torsoRotation) this.bodyParts.torso.rotation.copy(this.basePose.torsoRotation);
        }

        if (this.bodyParts.head && this.basePose.headPosition && this.basePose.headRotation) {
            this.bodyParts.head.position.copy(this.basePose.headPosition);
            this.bodyParts.head.rotation.copy(this.basePose.headRotation);
        }

        if (this.bodyParts.leftEar && this.basePose.earLeftRotation) {
            this.bodyParts.leftEar.rotation.copy(this.basePose.earLeftRotation);
        }
        if (this.bodyParts.rightEar && this.basePose.earRightRotation) {
            this.bodyParts.rightEar.rotation.copy(this.basePose.earRightRotation);
        }

        const legNames = ['frontLeftLeg', 'frontRightLeg', 'backLeftLeg', 'backRightLeg'];
        legNames.forEach(name => {
            const leg = this.bodyParts[name];
            const base = this.basePose.legPositions[name];
            if (leg && base) {
                leg.position.copy(base);
                leg.rotation.set(0, 0, 0);
            }
        });

        if (this.bodyParts.tailSegments) {
            this.bodyParts.tailSegments.forEach((segment, index) => {
                const baseTailPos = this.basePose.tailPositions[index];
                if (baseTailPos) {
                    segment.position.copy(baseTailPos);
                    segment.rotation.set(0, 0, 0);
                }
            });
        }

        this.group.position.y = this.baseGroupY;
    }

    chooseNextAction() {
        let action;

        if (this.personality === 'active') {
            const roll = Math.random();
            if (roll < 0.60) action = 'walking';
            else if (roll < 0.80) action = 'zoomies';
            else if (roll < 0.90) action = 'jump';
            else action = 'idle';
        } else if (this.personality === 'clingy') {
            // Clingy chooses normally when dormant/walking_away; personality FSM overrides movement
            const choices = ['idle', 'walking', 'sit', 'lookAround'];
            action = choices[Math.floor(Math.random() * choices.length)];
        } else {
            const choices = ['idle', 'walking', 'sit', 'jump', 'stretch', 'lookAround'];
            action = choices[Math.floor(Math.random() * choices.length)];
        }

        this.currentAction = action;
        this.actionTimer = 60 + Math.random() * 100;

        if (action === 'walking' || action === 'zoomies') {
            this.pickRandomTarget();
        }
        if (action === 'jump') {
            this.jumpProgress = 0;
            this.actionTimer = 30;
        }
        if (action === 'sit') {
            this.actionTimer = 80 + Math.random() * 80;
        }
        if (action === 'zoomies') {
            this.zoomiesActive = true;
            this.zoomiesTimer = 40 + Math.floor(Math.random() * 30); // burst duration
            this.actionTimer = this.zoomiesTimer + 40;               // burst + short idle after
        }
    }

    updateActionState(playerPos) {
        if (this.interactionCooldown > 0) {
            this.interactionCooldown--;
        }

        this.actionTimer--;
        if (this.actionTimer <= 0) {
            this.chooseNextAction();
        }

        if (this.currentAction === 'walking' || this.currentAction === 'zoomies') {
            this.moveToTarget();
            this.smoothRotateToTarget();
        }

        if (playerPos) {
            this.updatePersonalityBehavior(playerPos);
        }
    }

    updatePersonalityBehavior(playerPos) {
        const distToPlayer = this.group.position.distanceTo(playerPos);

        if (this.personality === 'clingy') {
            this._updateClingy(distToPlayer, playerPos);
        } else if (this.personality === 'loner') {
            this._updateLoner(distToPlayer, playerPos);
        } else if (this.personality === 'active') {
            this._updateActive();
        }
    }

    _updateClingy(distToPlayer, playerPos) {
        switch (this.clingyState) {
            case 'dormant':
                if (distToPlayer < 10) {
                    this.clingyState = 'approaching';
                    this.clingyRefreshTimer = 0;
                }
                break;

            case 'approaching':
                // Walk toward player
                this.currentAction = 'walking';
                this.targetPosition.set(playerPos.x, this.baseGroupY, playerPos.z);
                const approachDir = new THREE.Vector3().subVectors(this.targetPosition, this.group.position).normalize();
                this.targetRotation = Math.atan2(approachDir.x, approachDir.z);
                this.moveToTarget();
                this.smoothRotateToTarget();

                if (distToPlayer < 2.5) {
                    this.clingyState = 'nearby';
                    this.clingyAttentionTimer = 240; // ~4 seconds at 60fps
                    this.currentAction = 'sit';
                    this.actionTimer = 999;
                }
                break;

            case 'nearby':
                this.clingyAttentionTimer--;
                // Keep facing player
                if (this.bodyParts.head) {
                    const toPlayer = new THREE.Vector3().subVectors(playerPos, this.group.position).normalize();
                    const targetHeadY = Math.atan2(toPlayer.x, toPlayer.z) - this.group.rotation.y;
                    this.bodyParts.head.rotation.y += (targetHeadY - this.bodyParts.head.rotation.y) * 0.08;
                }
                if (this.clingyAttentionTimer <= 0) {
                    this.clingyState = 'walking_away';
                    // Pick a target far from the player
                    const awayAngle = Math.atan2(
                        this.group.position.z - playerPos.z,
                        this.group.position.x - playerPos.x
                    ) + (Math.random() - 0.5) * 0.8;
                    const awayDist = 10 + Math.random() * 8;
                    const maxBound = this.boundarySize - 2;
                    this.targetPosition.set(
                        Math.max(-maxBound, Math.min(maxBound, this.group.position.x + Math.cos(awayAngle) * awayDist)),
                        this.baseGroupY,
                        Math.max(-maxBound, Math.min(maxBound, this.group.position.z + Math.sin(awayAngle) * awayDist))
                    );
                    const dir = new THREE.Vector3().subVectors(this.targetPosition, this.group.position).normalize();
                    this.targetRotation = Math.atan2(dir.x, dir.z);
                    this.currentAction = 'walking';
                    this.actionTimer = 999;
                }
                break;

            case 'walking_away':
                this.moveToTarget();
                this.smoothRotateToTarget();
                this.currentAction = 'walking';
                // Once arrived at far target, start refresh cooldown
                if (this.group.position.distanceTo(this.targetPosition) < 0.5) {
                    this.clingyState = 'cooling';
                    this.clingyRefreshTimer = 3600; // ~1 minute
                    this.currentAction = 'idle';
                    this.actionTimer = 60;
                }
                break;

            case 'cooling':
                this.clingyRefreshTimer--;
                if (this.clingyRefreshTimer <= 0) {
                    this.clingyState = 'dormant';
                }
                break;
        }
    }

    _updateLoner(distToPlayer, playerPos) {
        if (distToPlayer < this.lonerFleeRadius && !this.lonerFleeing) {
            this.lonerFleeing = true;
            // Flee in the opposite direction from the player
            const fleeAngle = Math.atan2(
                this.group.position.z - playerPos.z,
                this.group.position.x - playerPos.x
            ) + (Math.random() - 0.5) * 0.5;
            const fleeDistance = this.lonerFleeRadius * 2.5;
            const maxBound = this.boundarySize - 2;
            this.targetPosition.set(
                Math.max(-maxBound, Math.min(maxBound, this.group.position.x + Math.cos(fleeAngle) * fleeDistance)),
                this.baseGroupY,
                Math.max(-maxBound, Math.min(maxBound, this.group.position.z + Math.sin(fleeAngle) * fleeDistance))
            );
            const dir = new THREE.Vector3().subVectors(this.targetPosition, this.group.position).normalize();
            this.targetRotation = Math.atan2(dir.x, dir.z);
            this.currentAction = 'walking';
            this.actionTimer = 999;
        }

        if (this.lonerFleeing) {
            const savedSpeed = this.movementSpeed;
            this.movementSpeed = 0.015;
            this.moveToTarget();
            this.smoothRotateToTarget();
            this.currentAction = 'walking';
            this.movementSpeed = savedSpeed;

            // Stop fleeing once far enough away
            if (distToPlayer > this.lonerFleeRadius * 2) {
                this.lonerFleeing = false;
                this.currentAction = 'idle';
                this.actionTimer = 40 + Math.random() * 40;
            }
        }
    }

    _updateActive() {
        if (this.zoomiesActive) {
            this.zoomiesTimer--;
            const savedSpeed = this.movementSpeed;
            this.movementSpeed = 0.12; // triple burst
            this.moveToTarget();
            this.smoothRotateToTarget();
            this.movementSpeed = savedSpeed;

            if (this.zoomiesTimer <= 0) {
                this.zoomiesActive = false;
                this.currentAction = 'idle';
                this.actionTimer = 20 + Math.floor(Math.random() * 20);
            }
        }
    }

    /** Called by main.js when the user interacts with this ocelot. */
    notifyInteraction() {
        if (this.personality === 'clingy' && this.clingyState === 'nearby') {
            this.clingyAttentionTimer = 240;
        }
    }

    applyCommonAnimation() {
        if (!this.bodyParts.torso) return;

        const breatheScale = 1 + Math.sin(this.animationTime * 0.5) * 0.02;
        this.bodyParts.torso.scale.multiplyScalar(breatheScale);

        if (this.bodyParts.tailSegments && this.bodyParts.tailSegments.length > 0) {
            this.bodyParts.tailSegments.forEach((segment, index) => {
                const wave = Math.sin(this.animationTime * 1.8 + index * 0.45) * 0.04;
                segment.position.y += wave;
            });
        }
    }

    applyWalkingAnimation() {
        const legWave = Math.sin(this.animationTime * 1.8) * 0.12;
        if (this.bodyParts.frontLeftLeg && this.basePose.legPositions.frontLeftLeg) {
            this.bodyParts.frontLeftLeg.position.y = this.basePose.legPositions.frontLeftLeg.y + legWave;
        }
        if (this.bodyParts.frontRightLeg && this.basePose.legPositions.frontRightLeg) {
            this.bodyParts.frontRightLeg.position.y = this.basePose.legPositions.frontRightLeg.y - legWave;
        }
        if (this.bodyParts.backLeftLeg && this.basePose.legPositions.backLeftLeg) {
            this.bodyParts.backLeftLeg.position.y = this.basePose.legPositions.backLeftLeg.y - legWave;
        }
        if (this.bodyParts.backRightLeg && this.basePose.legPositions.backRightLeg) {
            this.bodyParts.backRightLeg.position.y = this.basePose.legPositions.backRightLeg.y + legWave;
        }
    }

    applySitAnimation() {
        const s = this.size;

        // Torso: lower rear end and tilt so haunches are down
        if (this.bodyParts.torso) {
            this.bodyParts.torso.position.y -= 0.38 * s;
            this.bodyParts.torso.rotation.z = 0.14;   // rear tilts down
        }

        // Head stays elevated (cat sits upright)
        if (this.bodyParts.head) {
            this.bodyParts.head.position.y -= 0.12 * s;
        }

        // Rear haunches fold flat (legs near tail, x < 0, named "front" in code)
        ['frontLeftLeg', 'frontRightLeg'].forEach(name => {
            const leg = this.bodyParts[name];
            const base = this.basePose.legPositions[name];
            if (leg && base) {
                leg.position.y = base.y - 0.55 * s;
                leg.rotation.z = name.includes('Left') ? 0.45 : -0.45;  // splay outward
            }
        });

        // Front legs (near head, named "back" in code) stay upright, barely move
        ['backLeftLeg', 'backRightLeg'].forEach(name => {
            const leg = this.bodyParts[name];
            const base = this.basePose.legPositions[name];
            if (leg && base) {
                leg.position.y = base.y - 0.05 * s;
            }
        });

        // Tail curls around to the side and forward, tip near front paws
        if (this.bodyParts.tailSegments) {
            const total = this.bodyParts.tailSegments.length;
            this.bodyParts.tailSegments.forEach((segment, i) => {
                const base = this.basePose.tailPositions[i];
                if (!base) return;
                const t = i / total;
                segment.position.z = base.z + Math.sin(t * Math.PI) * 1.1 * s;  // arc sideways
                segment.position.x = base.x + t * t * 1.4 * s;                  // curl forward
                segment.position.y = base.y - t * 0.5 * s;                       // drop toward ground
            });
        }
    }

    applyJumpAnimation() {
        this.jumpProgress = Math.min(1, this.jumpProgress + 0.06);
        const jumpY = Math.sin(this.jumpProgress * Math.PI) * 1.4 * this.size;
        this.group.position.y = this.baseGroupY + jumpY;
        this.applyWalkingAnimation();

        if (this.jumpProgress >= 1) {
            this.currentAction = 'idle';
            this.actionTimer = 80;
        }
    }

    applyStretchAnimation() {
        if (this.bodyParts.torso) {
            this.bodyParts.torso.scale.x *= 1.08;
            this.bodyParts.torso.scale.y *= 0.96;
        }
        if (this.bodyParts.head) {
            this.bodyParts.head.position.x += 0.2 * this.size;
        }
    }

    applyLookAroundAnimation() {
        if (!this.bodyParts.head) return;

        const headTurn = Math.sin(this.animationTime * 1.2) * 0.45;
        this.bodyParts.head.rotation.y = headTurn;

        if (this.bodyParts.leftEar) {
            this.bodyParts.leftEar.rotation.y = headTurn * 0.55;
        }
        if (this.bodyParts.rightEar) {
            this.bodyParts.rightEar.rotation.y = headTurn * 0.55;
        }
    }

    animate(playerPos) {
        this.animationTime += 0.05;

        this.updateActionState(playerPos);
        this.restoreBasePose();
        this.applyCommonAnimation();

        if (this.currentAction === 'walking' || this.currentAction === 'zoomies') {
            this.applyWalkingAnimation();
        } else if (this.currentAction === 'sit') {
            this.applySitAnimation();
        } else if (this.currentAction === 'jump') {
            this.applyJumpAnimation();
        } else if (this.currentAction === 'stretch') {
            this.applyStretchAnimation();
        } else if (this.currentAction === 'lookAround') {
            this.applyLookAroundAnimation();
        } else {
            this.applyLookAroundAnimation();
        }
    }

    interact(source = 'cursor') {
        if (this.interactionCooldown > 0) {
            return {sound: null, action: this.currentAction};
        }

        const fromHand = source.includes('hand') || source.includes('controller');
        const sound = fromHand ? 'purr' : (Math.random() > 0.5 ? 'meow' : 'purr');
        this.currentAction = sound === 'meow' ? 'jump' : 'sit';
        this.actionTimer = sound === 'meow' ? 35 : 100;
        this.jumpProgress = 0;
        this.interactionCooldown = 35;

        return {sound, action: this.currentAction};
    }

    respondToWand(wandPosition) {
        if (!this.bodyParts.head) return;

        // Calculate distance to wand
        const distance = this.group.position.distanceTo(wandPosition);

        // If wand is close enough, show interest
        if (distance < 5) {
            // Increase interest level
            this.wandInterestLevel = Math.min(1, this.wandInterestLevel + 0.02);

            // Make the cat look at the wand
            const direction = new THREE.Vector3().subVectors(wandPosition, this.group.position).normalize();
            const targetRotation = Math.atan2(direction.x, direction.z);

            // Rotate head toward wand
            const headDirection = new THREE.Vector3().subVectors(wandPosition, this.bodyParts.head.getWorldPosition(new THREE.Vector3())).normalize();
            const headTargetRotationY = Math.atan2(headDirection.x, headDirection.z);
            const headTargetRotationX = -Math.asin(headDirection.y);

            // Apply head rotation with smooth interpolation
            this.bodyParts.head.rotation.y += (headTargetRotationY - this.bodyParts.head.rotation.y) * 0.1;
            this.bodyParts.head.rotation.x += (headTargetRotationX - this.bodyParts.head.rotation.x) * 0.1;

            // If wand is very close, trigger special behavior
            if (distance < 2) {
                // Increase chance of playful behavior
                if (Math.random() < 0.02) {
                    this.currentAction = 'jump';
                    this.actionTimer = 30;
                    return 'playful';
                }
            }
        } else {
            // Decrease interest level when wand is far
            this.wandInterestLevel = Math.max(0, this.wandInterestLevel - 0.01);
        }

        return this.wandInterestLevel > 0.5 ? 'interested' : 'neutral';
    }

    respondToLaserPointer(laserPosition) {
        if (!this.bodyParts.head) return;

        // Calculate distance to laser pointer
        const distance = this.group.position.distanceTo(laserPosition);

        // If laser is close enough, show interest
        if (distance < 10) {
            // Increase interest level
            this.laserInterestLevel = Math.min(1, this.laserInterestLevel + 0.03);

            // Make the cat look at the laser
            const direction = new THREE.Vector3().subVectors(laserPosition, this.group.position).normalize();
            const targetRotation = Math.atan2(direction.x, direction.z);

            // Rotate head toward laser
            const headDirection = new THREE.Vector3().subVectors(laserPosition, this.bodyParts.head.getWorldPosition(new THREE.Vector3())).normalize();
            const headTargetRotationY = Math.atan2(headDirection.x, headDirection.z);
            const headTargetRotationX = -Math.asin(headDirection.y);

            // Apply head rotation with smooth interpolation
            this.bodyParts.head.rotation.y += (headTargetRotationY - this.bodyParts.head.rotation.y) * 0.15;
            this.bodyParts.head.rotation.x += (headTargetRotationX - this.bodyParts.head.rotation.x) * 0.15;

            // If laser is close, make the cat approach it
            if (distance < 6) {
                // Set the cat to move toward the laser position
                this.currentAction = 'walking';
                this.targetPosition.copy(laserPosition);
                // Keep the target position within bounds
                const maxBound = this.boundarySize - 2;
                this.targetPosition.x = Math.max(-maxBound, Math.min(maxBound, this.targetPosition.x));
                this.targetPosition.z = Math.max(-maxBound, Math.min(maxBound, this.targetPosition.z));

                // Set target rotation toward laser
                const direction = new THREE.Vector3().subVectors(this.targetPosition, this.group.position).normalize();
                this.targetRotation = Math.atan2(direction.x, direction.z);

                // Increase chance of playful behavior when very close
                if (distance < 3 && Math.random() < 0.03) {
                    this.currentAction = 'jump';
                    this.actionTimer = 30;
                    return 'playful';
                }
            }

            return 'interested';
        } else {
            // Decrease interest level when laser is far
            this.laserInterestLevel = Math.max(0, this.laserInterestLevel - 0.02);
            return 'neutral';
        }
    }

    getStatus() {
        return {
            action: this.currentAction
        };
    }

    pickRandomTarget() {
        const angle = Math.random() * Math.PI * 2;
        const distance = 3 + Math.random() * 5;

        const newX = this.group.position.x + Math.cos(angle) * distance;
        const newZ = this.group.position.z + Math.sin(angle) * distance;
        const maxBound = this.boundarySize - 2;

        this.targetPosition.set(
            Math.max(-maxBound, Math.min(maxBound, newX)),
            this.baseGroupY,
            Math.max(-maxBound, Math.min(maxBound, newZ))
        );

        const direction = new THREE.Vector3().subVectors(this.targetPosition, this.group.position).normalize();
        this.targetRotation = Math.atan2(direction.x, direction.z);
    }

    smoothRotateToTarget() {
        const rotationSpeed = 0.05;
        const targetAngle = this.targetRotation;
        let currentAngle = this.group.rotation.y;

        let angleDiff = targetAngle - currentAngle;

        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        if (Math.abs(angleDiff) < 0.01) {
            this.group.rotation.y = targetAngle;
        } else {
            this.group.rotation.y += angleDiff * rotationSpeed;
        }
    }

    moveToTarget() {
        const direction = new THREE.Vector3().subVectors(this.targetPosition, this.group.position);
        const distance = direction.length();

        if (distance > 0.1) {
            direction.normalize().multiplyScalar(this.movementSpeed);
            const newPosition = this.group.position.clone().add(direction);
            this.group.position.copy(newPosition);
        } else {
            this.currentAction = 'idle';
            this.actionTimer = 40;
        }
    }
}


export function createOcelot(options = {}) {
    return new VoxelOcelot(options);
}
