import * as THREE from 'three';

const uprightEuler = new THREE.Euler(0, 0, 0, 'YXZ');

export class VoxelOcelot {
    constructor(options = {}) {
        try {
            this.size = options.size || 0.6;
            this.position = options.position || new THREE.Vector3(0, 0, 0);
            this.boundarySize = options.boundarySize || 45;
            this.group = new THREE.Group();

            this.bodyParts = {};
            this.animationTime = Math.random() * Math.PI * 2;

            const speciesProfiles = VoxelOcelot.getSpeciesProfiles();
            // Species determines the overall look.
            this.speciesType = options.speciesType !== undefined
                ? options.speciesType
                : Math.floor(Math.random() * speciesProfiles.length);
            this.speciesProfile = speciesProfiles[this.speciesType] || speciesProfiles[0];

            // Pattern index selects within the species colour palette
            this.pattern = options.pattern !== undefined
                ? options.pattern
                : Math.floor(Math.random() * this.speciesProfile.bodyColors.length);
            this.isTuxedo = this.speciesProfile.id === 'tuxedo';
            this.tuxedoPattern = this.isTuxedo ? this.generateTuxedoPattern() : null;

            // Per-individual anatomical variation
            this.earSize = 0.9 + Math.random() * 0.7;
            this.earHeight = 1.2 + Math.random() * 0.5;
            this.tailLength = (0.65 + Math.random() * 0.725) * this.speciesProfile.tailLengthMod;
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
            this.sitModelBlend = 0;
            this.isHeld = false;
            this.heldBy = null;

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
        const totalTailLength = (1.6 + tailVar * 0.9) * s;
        const tailThickness = 0.32 * s * this.tailTaper;
        const torsoBackX = -1.6 * s * this.bodyLengthVariance;
        const tailBaseY = 0.18 * s;
        const prof = this.speciesProfile;
        const bodyColor = this.getBodyColor();
        const ringColorA = prof.tailRingColors[0];
        const ringColorB = prof.tailRingColors[1] ?? bodyColor;
        const tailParent = this.bodyParts.torso || this.group;

        // Three-segment cuboid tail with variable total length.
        const segmentCount = 3;
        const segmentRatios = [0.40, 0.34, 0.26];
        let cumX = 0;

        for (let i = 0; i < segmentCount; i++) {
            const len = totalTailLength * segmentRatios[i];
            const thickness = tailThickness * (1 - i * 0.14);
            const segColor = this.getTailSegmentColor(i, segmentCount, bodyColor, ringColorA, ringColorB);

            const tailGeo = new THREE.BoxGeometry(len, thickness, thickness);
            const tailMat = new THREE.MeshBasicMaterial({color: segColor});
            const segment = new THREE.Mesh(tailGeo, tailMat);

            cumX += len;
            segment.position.set(torsoBackX - (cumX - len * 0.5), tailBaseY, 0);
            segment.castShadow = true;

            this.bodyParts.tailSegments.push(segment);
            tailParent.add(segment);
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

        if (this.isTuxedo) {
            this.applyTuxedoMarkings(baseColor);
            return;
        }

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

    generateTuxedoPattern() {
        return {
            chestStart: 0.42 + Math.random() * 0.2,
            chestWidth: 0.18 + Math.random() * 0.22,
            chestHeight: 0.62 + Math.random() * 0.25,
            blazeWidth: 0.06 + Math.random() * 0.11,
            blazeHeight: 0.35 + Math.random() * 0.45,
            muzzleWhiteness: 0.65 + Math.random() * 0.35,
            tailTipChance: 0.2 + Math.random() * 0.45,
            sockChance: 0.45 + Math.random() * 0.4
        };
    }

    applyTuxedoMarkings(baseColor) {
        const pattern = this.tuxedoPattern || this.generateTuxedoPattern();
        const whiteColor = this.getBellyColor();
        const torso = this.bodyParts.torso;
        const head = this.bodyParts.headMesh;
        const snout = this.bodyParts.snout;

            if (torso?.geometry) {
                this.addMaskToMesh(
                    torso,
                    baseColor,
                    whiteColor,
                    (x, y, z, bounds) => {
                        const nx = (x - bounds.min.x) / (bounds.max.x - bounds.min.x);
                        const ny = (y - bounds.min.y) / (bounds.max.y - bounds.min.y);
                        const nz = Math.abs((z - bounds.centerZ) / ((bounds.max.z - bounds.min.z) * 0.5));
                        if (nx < pattern.chestStart || ny > pattern.chestHeight || nz > pattern.chestWidth) {
                            return 0;
                        }
                        const frontWeight = THREE.MathUtils.smoothstep(nx, pattern.chestStart, 1);
                        const centerWeight = 1 - THREE.MathUtils.clamp(nz / pattern.chestWidth, 0, 1);
                        return Math.min(1, frontWeight * centerWeight * 1.2);
                    }
                );
            }

            if (head?.geometry) {
                this.addMaskToMesh(
                    head,
                    baseColor,
                    whiteColor,
                    (x, y, z, bounds) => {
                        const nx = (x - bounds.min.x) / (bounds.max.x - bounds.min.x);
                        const ny = (y - bounds.min.y) / (bounds.max.y - bounds.min.y);
                        const nz = Math.abs((z - bounds.centerZ) / ((bounds.max.z - bounds.min.z) * 0.5));
                        if (nx < 0.42 || ny < (1 - pattern.blazeHeight) || nz > pattern.blazeWidth) {
                            return 0;
                        }
                        const upperFace = THREE.MathUtils.smoothstep(ny, 1 - pattern.blazeHeight, 1);
                        const centerWeight = 1 - THREE.MathUtils.clamp(nz / pattern.blazeWidth, 0, 1);
                        return Math.min(1, upperFace * centerWeight);
                    }
                );
            }

            if (snout?.geometry) {
                this.addMaskToMesh(
                    snout,
                    baseColor,
                    whiteColor,
                    (x, y, z, bounds) => {
                        const ny = (y - bounds.min.y) / (bounds.max.y - bounds.min.y);
                        const nz = Math.abs((z - bounds.centerZ) / ((bounds.max.z - bounds.min.z) * 0.5));
                        const centerWeight = 1 - THREE.MathUtils.clamp(nz / 0.95, 0, 1);
                        const lowerFace = 1 - THREE.MathUtils.clamp((ny - 0.65) / 0.35, 0, 1);
                        return Math.max(0, centerWeight * lowerFace * pattern.muzzleWhiteness);
                    }
                );
            }

            ['frontLeftLeg', 'frontRightLeg', 'backLeftLeg', 'backRightLeg'].forEach((name) => {
                const legGroup = this.bodyParts[name];
                if (!legGroup?.children?.[1]?.material) return;
                if (Math.random() > pattern.sockChance) return;
                legGroup.children[1].material.color.setHex(whiteColor);
            });

        if (this.bodyParts.tailSegments?.length && Math.random() < pattern.tailTipChance) {
            const tip = this.bodyParts.tailSegments[this.bodyParts.tailSegments.length - 1];
            if (tip?.material) {
                tip.material.color.setHex(whiteColor);
            }
        }
    }

    addMaskToMesh(mesh, baseColor, markColor, maskFunction) {
        const geometry = mesh.geometry;
        geometry.computeBoundingBox();
        const bb = geometry.boundingBox;
        const posAttr = geometry.attributes.position;
        const baseCol = new THREE.Color(baseColor);
        const markCol = new THREE.Color(markColor);
        const colors = [];

            const bounds = {
                min: bb.min,
                max: bb.max,
                centerZ: (bb.min.z + bb.max.z) * 0.5
            };

            for (let i = 0; i < posAttr.count; i++) {
                const x = posAttr.getX(i);
                const y = posAttr.getY(i);
                const z = posAttr.getZ(i);
                const blend = THREE.MathUtils.clamp(maskFunction(x, y, z, bounds), 0, 1);
                const color = baseCol.clone().lerp(markCol, blend);
                colors.push(color.r, color.g, color.b);
            }

        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        mesh.material.vertexColors = true;
        mesh.material.needsUpdate = true;
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
            },
            {   // 5 — Tuxedo: high-contrast black/white bicolor, mostly clean coat
                id: 'tuxedo',
                bodyColors: [0x131313, 0x1A1A1A, 0x0E0E0E, 0x202020],
                earColors: [0xF4E8DA, 0xF6EEE4, 0xEEDCC8],
                eyeColors: [0xC9C34A, 0x9FD05A, 0x73B8D8, 0xD7C65C],  // yellow/green/blue mix
                spotColors: [0x0A0A0A, 0x151515],
                accentColors: [0xFFFFFF, 0xF8F8F8, 0xF2F2F2],
                bellyColors: [0xFFFFFF, 0xFCFCFC, 0xF4F4F4],
                tailPattern: 'solid',
                tailRingColors: [0x141414, 0x141414],
                tailLengthMod: 1.0,
                spotStyle: 'solid_spots',
                spotDensityMod: 0.0,
                spotRadius: 0.2
            },
            {   // 6 — Siamese: warm cream coat with dark points
                bodyColors: [0xD9C5A2, 0xE2D1B4, 0xCFB996, 0xE7D8BE],
                earColors: [0x4B3A31, 0x3F2F27, 0x5B473C],
                eyeColors: [0x5DA8CF, 0x6DB6DA, 0x4F9CC7, 0x7CC0E4],  // blue eyes
                spotColors: [0x46362C, 0x3A2B22],
                accentColors: [0x3E3129, 0x4D3D33, 0x2F241E],
                bellyColors: [0xEFE2CD, 0xF2E7D6, 0xE8D8BD],
                tailPattern: 'solid',
                tailRingColors: [0x3F2F27, 0x3F2F27],
                tailLengthMod: 1.05,
                spotStyle: 'solid_spots',
                spotDensityMod: 0.0,
                spotRadius: 0.2
            },
            {   // 7 — Savannah: sandy coat with bold dark spots
                bodyColors: [0xC89A58, 0xD3A96A, 0xB98A4E, 0xD9B072],
                earColors: [0xF3D6A8, 0xEBC997, 0xF8E0B8],
                eyeColors: [0xA8C74E, 0xB8D05A, 0x99B943, 0xC2D967],  // yellow-green
                spotColors: [0x141414, 0x0B0B0B, 0x1F1F1F],
                accentColors: [0x2B1B10, 0x362015, 0x24170E],
                bellyColors: [0xF7E8D0, 0xF2DEC0, 0xFCEED8],
                tailPattern: 'banded',
                tailRingColors: [0x181818, 0xC89A58],
                tailLengthMod: 1.1,
                spotStyle: 'solid_spots',
                spotDensityMod: 1.35,
                spotRadius: 0.27
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
            legScales: {
                frontLeftLeg: this.bodyParts.frontLeftLeg?.scale.clone(),
                frontRightLeg: this.bodyParts.frontRightLeg?.scale.clone(),
                backLeftLeg: this.bodyParts.backLeftLeg?.scale.clone(),
                backRightLeg: this.bodyParts.backRightLeg?.scale.clone()
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
                const baseScale = this.basePose.legScales?.[name];
                if (baseScale) leg.scale.copy(baseScale);
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
                this.targetRotation = this.getYawForHeadForward(approachDir);
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
                    const targetHeadY = this.getYawForHeadForward(toPlayer) - this.group.rotation.y;
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
                    this.targetRotation = this.getYawForHeadForward(dir);
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
            this.targetRotation = this.getYawForHeadForward(dir);
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
            const total = this.bodyParts.tailSegments.length;
            this.bodyParts.tailSegments.forEach((segment, index) => {
                const t = (index + 1) / total;
                const swayY = Math.sin(this.animationTime * 1.7 + index * 0.6) * 0.10 * t;
                const swayX = Math.sin(this.animationTime * 1.3 + index * 0.45) * 0.04 * t;
                segment.rotation.y = swayY;
                segment.rotation.x = swayX;
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

    applySitAnimation(blend = 1) {
        const s = this.size;
        const maxHeadTilt = THREE.MathUtils.degToRad(5);
        const sitT = THREE.MathUtils.clamp(blend, 0, 1);
        if (sitT <= 0) return;

        // Dedicated sitting model: lower body near ground, chest upright.
        if (this.bodyParts.torso) {
            this.bodyParts.torso.position.y -= 0.46 * s * sitT;
            this.bodyParts.torso.rotation.z = 0.08 * sitT;
            this.bodyParts.torso.scale.x *= (1 + 0.03 * sitT);
            this.bodyParts.torso.scale.y *= (1 - 0.06 * sitT);
        }

        // Head remains upright with subtle left-right tilt while seated.
        if (this.bodyParts.head) {
            this.bodyParts.head.position.y -= 0.04 * s * sitT;
            this.bodyParts.head.position.x += 0.06 * s * sitT;
            this.bodyParts.head.rotation.z = Math.sin(this.animationTime * 1.2) * maxHeadTilt * sitT;
        }

        // Front arms (near head, named "back" in this rig) become longer in sit pose.
        ['backLeftLeg', 'backRightLeg'].forEach(name => {
            const leg = this.bodyParts[name];
            const base = this.basePose.legPositions[name];
            if (leg && base) {
                const side = name.includes('Left') ? 1 : -1;
                leg.scale.y = 1 + 0.48 * sitT;
                leg.position.y = base.y - 0.22 * s * sitT;
                leg.position.x = base.x + 0.08 * s * sitT;
                leg.rotation.z = side * 0.06 * sitT;
            }
        });

        // Hind legs (near tail, named "front" in this rig) tuck to lower body to ground.
        ['frontLeftLeg', 'frontRightLeg'].forEach(name => {
            const leg = this.bodyParts[name];
            const base = this.basePose.legPositions[name];
            if (leg && base) {
                const side = name.includes('Left') ? 1 : -1;
                leg.position.y = base.y - 0.34 * s * sitT;
                leg.position.x = base.x - 0.08 * s * sitT;
                leg.rotation.z = side * 0.22 * sitT;
            }
        });

        // Tail stays as a straight cuboid in sit state.
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
        const headTurn = Math.sin(this.animationTime * 1.2) * 0.45;
        if (this.bodyParts.torso) this.bodyParts.torso.rotation.y = 0;

        if (!this.bodyParts.head) return;
        this.bodyParts.head.rotation.y = headTurn;

        if (this.bodyParts.leftEar) {
            this.bodyParts.leftEar.rotation.y = headTurn * 0.55;
        }
        if (this.bodyParts.rightEar) {
            this.bodyParts.rightEar.rotation.y = headTurn * 0.55;
        }
    }

    setHeld(isHeld, sourceId = null) {
        this.isHeld = Boolean(isHeld);
        this.heldBy = this.isHeld ? sourceId : null;
        this.currentAction = 'idle';
        this.jumpProgress = 0;
        this.actionTimer = 60;
        this.interactionCooldown = 0;

        if (!this.isHeld) {
            uprightEuler.setFromQuaternion(this.group.quaternion, 'YXZ');
            this.group.rotation.set(0, uprightEuler.y, 0);
            this.targetRotation = uprightEuler.y;
            if (this.targetPosition) {
                this.targetPosition.y = this.baseGroupY;
            }
        }
    }

    setExternalTransform(position, rotation = null) {
        if (position) {
            this.group.position.copy(position);
            this.baseGroupY = this.group.position.y;
            if (this.targetPosition) {
                this.targetPosition.y = this.baseGroupY;
            }
        }
        if (rotation) {
            this.group.quaternion.copy(rotation);
        }
    }

    animate(playerPos) {
        this.animationTime += 0.05;

        if (this.isHeld) {
            this.restoreBasePose();
            this.applyCommonAnimation();
            return;
        }

        this.updateActionState(playerPos);
        if (this.currentAction === 'sit') {
            this.sitModelBlend = Math.min(1, this.sitModelBlend + 0.12);
        } else {
            this.sitModelBlend = 0;
        }
        this.restoreBasePose();
        this.applyCommonAnimation();

        if (this.currentAction === 'walking' || this.currentAction === 'zoomies') {
            this.applyWalkingAnimation();
        } else if (this.currentAction === 'sit') {
            this.applySitAnimation(this.sitModelBlend);
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
        if (this.isHeld) {
            return {sound: null, action: 'held'};
        }
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


    getStatus() {
        return {
            action: this.isHeld ? 'held' : this.currentAction
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
        this.targetRotation = this.getYawForHeadForward(direction);
    }

    getYawForHeadForward(direction) {
        return Math.atan2(direction.x, direction.z) - Math.PI / 2;
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
        const toTarget = new THREE.Vector3().subVectors(this.targetPosition, this.group.position);
        const distance = toTarget.length();

        if (distance > 0.1) {
            const targetDir = toTarget.normalize();
            const forward = new THREE.Vector3(
                Math.cos(this.group.rotation.y),
                0,
                -Math.sin(this.group.rotation.y)
            );
            const alignment = THREE.MathUtils.clamp(forward.dot(targetDir), 0, 1);

            // Forward-only locomotion: no strafing/backpedaling while turning.
            if (alignment < 0.05) return;

            const step = Math.min(distance, this.movementSpeed * alignment);
            const newPosition = this.group.position.clone().add(forward.multiplyScalar(step));
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
