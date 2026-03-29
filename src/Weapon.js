import * as THREE from 'three';

export class Weapon {
    constructor(camera, scene, particles) {
        this.camera = camera;
        this.scene = scene;
        this.particles = particles;
        
        this.group = new THREE.Group();
        this.basePos = new THREE.Vector3(0.35, -0.3, -0.6);
        this.recoil = 0;
        this.bob = 0;
        
        this.clipSize = 30;
        this.ammo = 30;    
        this.maxAmmo = 120;
        this.isReloading = false;
        this.reloadDuration = 1.5;
        this.reloadTimer = 0;
        
        this.lastFireTime = 0;
        this.fireRate = 100;

        this.uiAmmo = document.querySelector('.ammo');
        this.lastAmmoText = ""; // 缓存弹药 UI 文本

        this._tempHitDir = new THREE.Vector3();
        this._tempNormal = new THREE.Vector3();
        this._centerScreen = new THREE.Vector2(0, 0); // 预分配屏幕中心坐标，避免每帧创建

        this._buildModel();

        this.flash = new THREE.PointLight(0xffaa00, 0, 5);
        this.flash.position.set(0, 0.05, -0.6);
        this.group.add(this.flash);

        this.camera.add(this.group);
        this.group.position.copy(this.basePos);
    }

    _buildModel() {
        const matBody = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.2 });
        const matBarrel = new THREE.MeshStandardMaterial({ color: 0x050505, metalness: 1.0 });
        const matAccent = new THREE.MeshStandardMaterial({ color: 0x00ff88, emissive: 0x003311 });

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.5), matBody);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8), matBarrel);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.02, -0.4);
        
        const scope = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.15), matAccent);
        scope.position.set(0, 0.1, -0.1);

        body.layers.set(1);
        barrel.layers.set(1);
        scope.layers.set(1);

        this.group.add(body, barrel, scope);
    }

    _updateAmmoUI(text, color) {
        if (this.lastAmmoText !== text) {
            this.uiAmmo.innerText = text;
            this.lastAmmoText = text;
        }
        if (color) this.uiAmmo.style.color = color;
    }

    reload() {
        if (this.isReloading || this.ammo === this.clipSize || this.maxAmmo <= 0) return;
        this.isReloading = true;
        this.reloadTimer = 0;
        this._updateAmmoUI(`RELOADING...`, "#ffaa00");
    }

    _finishReload() {
        this.isReloading = false;
        const needed = this.clipSize - this.ammo;
        const toReload = Math.min(needed, this.maxAmmo);
        this.ammo += toReload;
        this.maxAmmo -= toReload;
        this._updateAmmoUI(`${this.ammo} / ${this.maxAmmo}`, "#fff");
    }

    update(delta, isMoving, isSprinting, mouseDelta) {
        if (this.isReloading) {
            this.reloadTimer += delta;
            const progress = this.reloadTimer / this.reloadDuration;
            const dip = Math.sin(progress * Math.PI); 
            
            this.group.position.y = this.basePos.y - dip * 0.3;
            this.group.rotation.x = -dip * 0.8;
            this.group.rotation.z = dip * 0.2;

            if (this.reloadTimer >= this.reloadDuration) this._finishReload();
        } else {
            this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, 0, 0.1);
            this.group.rotation.z = THREE.MathUtils.lerp(this.group.rotation.z, 0, 0.1);

            if (isMoving) {
                const speedMultiplier = isSprinting ? 1.8 : 1.0;
                this.bob += delta * 12 * speedMultiplier;
                this.group.position.y = this.basePos.y + Math.sin(this.bob) * 0.015 * speedMultiplier;
                this.group.position.x = this.basePos.x + Math.cos(this.bob * 0.5) * 0.01 * speedMultiplier;
            }

            this.group.position.x -= mouseDelta.x * 0.0002;
            this.group.position.y += mouseDelta.y * 0.0002;

            this.recoil = THREE.MathUtils.lerp(this.recoil, 0, 0.15);
            this.group.position.z = this.basePos.z + this.recoil;
            
            this.group.position.x = THREE.MathUtils.lerp(this.group.position.x, this.basePos.x + (isMoving ? Math.cos(this.bob*0.5)*0.01 : 0), 0.1);
            this.group.position.y = THREE.MathUtils.lerp(this.group.position.y, this.basePos.y + (isMoving ? Math.sin(this.bob)*0.015 : 0), 0.1);
        }

        if (this.flash.intensity > 0) this.flash.intensity -= delta * 80;
    }

    fire(raycaster) {
        if (this.isReloading) return;
        const now = performance.now();
        if (this.ammo <= 0) { this.reload(); return; }
        if (now - this.lastFireTime < this.fireRate) return;

        this.lastFireTime = now;
        this.ammo--;
        this.recoil = 0.12;
        this.flash.intensity = 15;
        this._updateAmmoUI(`${this.ammo} / ${this.maxAmmo}`);

        // 使用复用的屏幕中心坐标，杜绝每次开火生成新的 Vector2
        raycaster.setFromCamera(this._centerScreen, this.camera);
        raycaster.layers.set(0); 
        const hits = raycaster.intersectObjects(this.scene.children, true);

        if (hits.length > 0) {
            const hit = hits[0];
            const object = hit.object;

            if (object.userData && object.userData.isEnemy) {
                const enemyRef = object.userData.ref;
                this._tempHitDir.subVectors(hit.point, this.camera.position).normalize();
                this._tempHitDir.y = 0; 
                enemyRef.takeDamage(25, this._tempHitDir);
                
                const norm = hit.face ? hit.face.normal : this._tempNormal.set(0,1,0);
                this.particles.spawnImpact(hit.point, norm);
            } else {
                if (hit.face) {
                    this._tempNormal.copy(hit.face.normal).transformDirection(object.matrixWorld);
                } else {
                    this._tempNormal.set(0, 1, 0);
                }
                this.particles.spawnImpact(hit.point, this._tempNormal);
            }
        }
    }
}
