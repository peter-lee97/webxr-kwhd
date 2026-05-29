import * as THREE from 'three';

export class AnimalCatalogOverlay {
    constructor({ scene, renderer, camera, items = [] }) {
        this.scene = scene;
        this.renderer = renderer;
        this.camera = camera;
        this.items = items;
        this.currentIndex = 0;
        this.isVisible = false;
        this.isVRBoardVisible = false;
        this.previewEntity = null;
        this.previewPivot = null;
        this.vrCards = [];
        this.vrBoard = null;
        this.tmpPos = new THREE.Vector3();
        this.tmpDir = new THREE.Vector3();
        this.tmpQuat = new THREE.Quaternion();
        this.tmpScale = new THREE.Vector3();
        this.tmpBox = new THREE.Box3();
        this.tmpSize = new THREE.Vector3();
        this.tmpCenter = new THREE.Vector3();

        this.buildDom();
        this.buildPreviewScene();
        this.rebuildVRBoard();
        this.showCurrentCard();
    }

    buildDom() {
        this.root = document.createElement('div');
        this.root.id = 'animal-catalog-overlay';
        this.root.innerHTML = `
            <div class="animal-catalog-shell">
                <button id="animal-catalog-close" class="animal-catalog-close" aria-label="Close animal catalog">×</button>
                <div class="animal-catalog-canvas-wrap"></div>
                <div class="animal-catalog-meta">
                    <p class="animal-catalog-eyebrow">Forest species</p>
                    <h2 id="animal-catalog-name">Loading</h2>
                </div>
                <div class="animal-catalog-nav">
                    <button id="animal-catalog-prev" type="button">Previous</button>
                    <button id="animal-catalog-next" type="button">Next</button>
                </div>
            </div>
        `;
        document.body.appendChild(this.root);

        this.canvasWrap = this.root.querySelector('.animal-catalog-canvas-wrap');
        this.nameLabel = this.root.querySelector('#animal-catalog-name');

        this.root.querySelector('#animal-catalog-close')?.addEventListener('click', () => this.hide());
        this.root.querySelector('#animal-catalog-prev')?.addEventListener('click', () => this.previous());
        this.root.querySelector('#animal-catalog-next')?.addEventListener('click', () => this.next());
        this.root.addEventListener('click', (event) => {
            if (event.target === this.root) this.hide();
        });
    }

    buildPreviewScene() {
        this.previewScene = new THREE.Scene();
        this.previewCamera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
        this.previewCamera.position.set(0, 0.8, 2.4);
        this.previewCamera.lookAt(0, 0.6, 0);

        this.previewRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        this.previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        this.previewRenderer.setSize(420, 320);
        this.previewRenderer.setClearColor(0x000000, 0);
        this.canvasWrap?.appendChild(this.previewRenderer.domElement);

        this.previewScene.add(new THREE.AmbientLight(0xffffff, 0.75));
        const key = new THREE.DirectionalLight(0xffffff, 0.9);
        key.position.set(2, 3, 2);
        this.previewScene.add(key);

        this.previewPivot = new THREE.Group();
        this.previewScene.add(this.previewPivot);
    }

    rebuildVRBoard() {
        if (!this.scene) return;
        if (this.vrBoard) {
            this.scene.remove(this.vrBoard);
        }
        this.vrCards = [];
        this.vrBoard = new THREE.Group();
        this.vrBoard.visible = false;

        const columns = 4;
        const cardWidth = 0.52;
        const cardHeight = 0.42;
        const xGap = 0.1;
        const yGap = 0.12;
        const rows = Math.ceil(this.items.length / columns);
        const totalWidth = columns * cardWidth + (columns - 1) * xGap;
        const totalHeight = rows * cardHeight + (rows - 1) * yGap;

        const back = new THREE.Mesh(
            new THREE.PlaneGeometry(totalWidth + 0.28, totalHeight + 0.28),
            new THREE.MeshBasicMaterial({
                color: 0x0f2f0f,
                transparent: true,
                opacity: 0.7,
                depthTest: false
            })
        );
        back.position.z = -0.03;
        this.vrBoard.add(back);

        this.items.forEach((item, index) => {
            const col = index % columns;
            const row = Math.floor(index / columns);
            const x = -totalWidth / 2 + col * (cardWidth + xGap) + cardWidth / 2;
            const y = totalHeight / 2 - row * (cardHeight + yGap) - cardHeight / 2;

            const card = new THREE.Group();
            card.position.set(x, y, 0);

            const cardPlane = new THREE.Mesh(
                new THREE.PlaneGeometry(cardWidth, cardHeight),
                new THREE.MeshBasicMaterial({
                    color: 0x194719,
                    transparent: true,
                    opacity: 0.85,
                    depthTest: false
                })
            );
            card.add(cardPlane);

            const label = this.createTextSprite(item.name);
            label.position.set(0, -cardHeight * 0.37, 0.01);
            label.scale.set(cardWidth * 0.9, 0.09, 1);
            card.add(label);

            const entity = item.createPreview();
            const previewGroup = entity?.group || new THREE.Group();
            previewGroup.position.set(0, 0.03, 0.03);
            this.fitPreviewModel(previewGroup, {
                targetWidth: cardWidth * 0.46,
                targetHeight: cardHeight * 0.48,
                targetDepth: cardWidth * 0.36,
                baseY: -cardHeight * 0.09
            });
            card.add(previewGroup);
            this.vrCards.push({ entity, previewGroup });
            this.vrBoard.add(card);
        });

        this.scene.add(this.vrBoard);
    }

    createTextSprite(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 96;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'rgba(8, 22, 8, 0.8)';
            ctx.fillRect(0, 10, canvas.width, 76);
            ctx.fillStyle = '#d4ead4';
            ctx.font = '600 46px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1);
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = this.renderer?.outputColorSpace || texture.colorSpace;
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false
        });
        return new THREE.Sprite(material);
    }

    clearPreview() {
        if (this.previewEntity?.group) {
            this.previewPivot.remove(this.previewEntity.group);
        }
        this.previewEntity = null;
    }

    showCurrentCard() {
        if (!this.items.length) return;
        const item = this.items[this.currentIndex];
        this.nameLabel.textContent = item.name;
        this.clearPreview();
        this.previewEntity = item.createPreview();
        if (this.previewEntity?.group) {
            this.previewEntity.group.position.set(0, 0, 0);
            this.fitPreviewModel(this.previewEntity.group, {
                targetWidth: 1.25,
                targetHeight: 1.1,
                targetDepth: 0.95,
                baseY: -0.25
            });
            this.previewPivot.add(this.previewEntity.group);
        }
    }

    fitPreviewModel(group, { targetWidth, targetHeight, targetDepth, baseY = 0 }) {
        if (!group) return;

        group.updateMatrixWorld(true);
        this.tmpBox.setFromObject(group);
        if (this.tmpBox.isEmpty()) return;

        this.tmpBox.getSize(this.tmpSize);
        this.tmpBox.getCenter(this.tmpCenter);

        const widthScale = this.tmpSize.x > 0 ? targetWidth / this.tmpSize.x : Infinity;
        const heightScale = this.tmpSize.y > 0 ? targetHeight / this.tmpSize.y : Infinity;
        const depthScale = this.tmpSize.z > 0 ? targetDepth / this.tmpSize.z : Infinity;
        const uniformScale = Math.min(widthScale, heightScale, depthScale);

        if (Number.isFinite(uniformScale) && uniformScale > 0) {
            group.scale.multiplyScalar(uniformScale);
        }

        group.updateMatrixWorld(true);
        this.tmpBox.setFromObject(group);
        if (this.tmpBox.isEmpty()) return;

        this.tmpBox.getCenter(this.tmpCenter);
        group.position.x -= this.tmpCenter.x;
        group.position.z -= this.tmpCenter.z;

        const yOffset = baseY - this.tmpBox.min.y;
        group.position.y += yOffset;
    }

    previous() {
        if (!this.items.length) return;
        this.currentIndex = (this.currentIndex - 1 + this.items.length) % this.items.length;
        this.showCurrentCard();
    }

    next() {
        if (!this.items.length) return;
        this.currentIndex = (this.currentIndex + 1) % this.items.length;
        this.showCurrentCard();
    }

    show() {
        this.isVisible = true;
        this.root.classList.add('open');
    }

    hide() {
        this.isVisible = false;
        this.root.classList.remove('open');
    }

    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    toggleVRBoard() {
        this.isVRBoardVisible = !this.isVRBoardVisible;
        if (this.vrBoard) {
            this.vrBoard.visible = this.isVRBoardVisible;
        }
    }

    hideVRBoard() {
        this.isVRBoardVisible = false;
        if (this.vrBoard) {
            this.vrBoard.visible = false;
        }
    }

    update(delta, time, xrCamera = null, isVRPresenting = false) {
        if (this.isVisible && this.previewEntity?.group) {
            this.previewEntity.group.rotation.y += delta * 0.85;
            if (this.previewEntity.catalogShouldAnimate && typeof this.previewEntity.animate === 'function') {
                this.previewEntity.animate();
            }
            this.previewRenderer.render(this.previewScene, this.previewCamera);
        }

        if (!isVRPresenting || !this.vrBoard || !this.isVRBoardVisible) {
            if (this.vrBoard) this.vrBoard.visible = false;
            return;
        }

        this.vrBoard.visible = true;
        const cameraRef = xrCamera || this.camera;
        if (!cameraRef) return;

        cameraRef.updateMatrixWorld(true);
        cameraRef.matrixWorld.decompose(this.tmpPos, this.tmpQuat, this.tmpScale);
        this.tmpDir.set(0, -0.02, -1.8).applyQuaternion(this.tmpQuat);
        this.tmpPos.add(this.tmpDir);

        this.vrBoard.position.copy(this.tmpPos);
        this.vrBoard.quaternion.copy(this.tmpQuat);

        this.vrCards.forEach(({ previewGroup, entity }) => {
            previewGroup.rotation.y += delta * 1.15;
            if (entity?.catalogShouldAnimate && typeof entity.animate === 'function') {
                entity.animate();
            }
        });
    }
}
