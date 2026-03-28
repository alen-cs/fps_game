// filepath: src/Weapon.js
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
        
        // --- 新增：弹药与换弹状态管理 ---
        this.clipSize = 30; // 弹匣容量
        this.ammo = 30;     // 当前弹匣内子弹
        this.maxAmmo = 120; // 备用弹药总数
        this.isReloading = false; // 换弹状态锁
        this.reloadDuration = 1.5; // 换弹耗时（秒）
        this.reloadTimer = 0; // 换弹计时器
        
        this.lastFireTime = 0;
        this.fireRate = 100;

        this.uiAmmo = document.querySelector('.ammo');
        this._tempHitDir = new THREE.Vector3();
        this._tempNormal = new THREE.Vector3();

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

    // --- 新增：触发换弹动作 ---
    reload() {
        // 如果正在换弹、弹匣已满、或没有备弹了，则拒绝换弹
        if (this.isReloading || this.ammo === this.clipSize || this.maxAmmo <= 0) return;
        
        this.isReloading = true;
        this.reloadTimer = 0;
        this.uiAmmo.innerText = `RELOADING...`; // UI 提示
        this.uiAmmo.style.color = "#ffaa00"; // 变成换弹警告色
    }

    // --- 新增：结算弹药逻辑 ---
    _finishReload() {
        this.isReloading = false;
        this.uiAmmo.style.color = "#fff"; // 恢复 UI 颜色

        // 计算需要补充多少子弹
        const needed = this.clipSize - this.ammo;
        // 实际能补充的子弹（取所需量和备弹量的最小值）
        const toReload = Math.min(needed, this.maxAmmo);
        
        this.ammo += toReload;
        this.maxAmmo -= toReload;
        
        this.uiAmmo.innerText = `${this.ammo} / ${this.maxAmmo}`;
    }

    update(delta, isMoving, isSprinting, mouseDelta) {
        // --- 核心：换弹动画状态机 ---
        if (this.isReloading) {
            this.reloadTimer += delta;
            const progress = this.reloadTimer / this.reloadDuration;
            
            // 利用 sin 曲线做出完美的平滑下沉与抬起动作 (0 -> 1 -> 0)
            const dip = Math.sin(progress * Math.PI); 
            
            this.group.position.y = this.basePos.y - dip * 0.3; // 枪支下沉
            this.group.rotation.x = -dip * 0.8; // 枪口朝下翻转
            this.group.rotation.z = dip * 0.2; // 稍微向侧边倾斜

            // 换弹结束
            if (this.reloadTimer >= this.reloadDuration) {
                this._finishReload();
            }
        } else {
            // 平滑恢复旋转姿态（防止换弹结束后瞬间闪现回原位）
            this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, 0, 0.1);
            this.group.rotation.z = THREE.MathUtils.lerp(this.group.rotation.z, 0, 0.1);

            // 原有的呼吸晃动逻辑 (仅在非换弹时执行)
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
        // --- 修改：拦截开火 ---
        if (this.isReloading) return; // 换弹期间绝对禁止开火

        const now = performance.now();
        
        // 如果没子弹了，自动触发换弹并拦截本次开火
        if (this.ammo <= 0) {
            this.reload();
            return;
        }

        if (now - this.lastFireTime < this.fireRate) return;

        this.lastFireTime = now;
        this.ammo--;
        this.recoil = 0.12;
        this.flash.intensity = 15;

        this.uiAmmo.innerText = `${this.ammo} / ${this.maxAmmo}`;

        raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
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
