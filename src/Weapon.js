import * as THREE from 'three';

export class Weapon {
    constructor(camera, scene, particles) {
        this.camera = camera;
        this.scene = scene;
        this.particles = particles;

        this.ammo = 30;
        this.maxAmmo = 120;
        this.fireRate = 0.1; // 略微加快射速
        this.lastFireTime = 0;
        this.isReloading = false;

        // 武器模型
        this.weaponGroup = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.6), new THREE.MeshBasicMaterial({ color: 0x444444 }));
        this.barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.5), new THREE.MeshBasicMaterial({ color: 0x111111 }));
        this.barrel.position.set(0, 0.05, -0.4);
        this.weaponGroup.add(body, this.barrel);
        
        this.basePosition = new THREE.Vector3(0.35, -0.35, -0.8);
        this.weaponGroup.position.copy(this.basePosition);
        this.camera.add(this.weaponGroup);

        // 实体子弹池
        this.bullets = [];
        const bulletGeo = new THREE.BoxGeometry(0.05, 0.05, 1.0); // 拉长子弹视觉效果
        const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffdd00 });
        for (let i = 0; i < 20; i++) {
            const mesh = new THREE.Mesh(bulletGeo, bulletMat);
            mesh.visible = false;
            this.scene.add(mesh);
            this.bullets.push({ mesh: mesh, active: false, velocity: new THREE.Vector3(), life: 0 });
        }

        // 枪口火焰
        this.muzzleFlash = new THREE.Mesh(
            new THREE.PlaneGeometry(0.4, 0.4),
            new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0, side: THREE.DoubleSide })
        );
        this.muzzleFlash.position.set(0, 0.05, -0.7);
        this.weaponGroup.add(this.muzzleFlash);

        this._updateAmmoUI();
    }

    _updateAmmoUI() {
        const ammoDiv = document.getElementById('ammo-info') || this._createAmmoUI();
        ammoDiv.innerText = `AMMO: ${this.ammo} / ${this.maxAmmo}`;
    }

    _createAmmoUI() {
        const div = document.createElement('div');
        div.id = 'ammo-info';
        div.style.cssText = 'position:absolute; bottom:20px; right:30px; font-size:32px; color:#fff; font-family:monospace; z-index:100;';
        document.body.appendChild(div);
        return div;
    }

    update(delta) {
        // 更新子弹位置
        this.bullets.forEach(b => {
            if (b.active) {
                b.mesh.position.addScaledVector(b.velocity, delta);
                b.life -= delta;
                if (b.life <= 0) {
                    b.active = false;
                    b.mesh.visible = false;
                }
            }
        });
        if (this.muzzleFlash.material.opacity > 0) this.muzzleFlash.material.opacity -= delta * 15;
    }

    fire(raycaster) {
        if (this.ammo <= 0 || this.isReloading) return null;
        const now = performance.now() / 1000;
        if (now - this.lastFireTime < this.fireRate) return null;
        
        this.lastFireTime = now;
        this.ammo--;
        this._updateAmmoUI();

        // 后坐力反馈
        this.weaponGroup.position.z += 0.1;
        this.muzzleFlash.material.opacity = 1;

        // --- 核心优化：弹道目标计算 ---
        raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        // 过滤掉子弹本身和枪口火焰，避免自撞
        const intersects = raycaster.intersectObjects(this.scene.children, true)
            .filter(i => !this.bullets.some(b => b.mesh === i.object) && i.object !== this.muzzleFlash);

        let targetPoint = new THREE.Vector3();
        let hitObject = null;

        if (intersects.length > 0) {
            targetPoint.copy(intersects[0].point);
            hitObject = intersects[0].object;
            // 触发撞击粒子
            if (this.particles) this.particles.spawnImpact(targetPoint, intersects[0].face.normal);
        } else {
            // 如果没打中物体，目标点设在前方100米处
            raycaster.ray.at(100, targetPoint);
        }

        // 发射视觉子弹
        const bullet = this.bullets.find(b => !b.active);
        if (bullet) {
            bullet.active = true;
            bullet.life = 1.0;
            bullet.mesh.visible = true;
            this.barrel.getWorldPosition(bullet.mesh.position);
            bullet.mesh.lookAt(targetPoint);
            bullet.velocity.subVectors(targetPoint, bullet.mesh.position).normalize().multiplyScalar(250); // 超高速飞行
        }

        return { point: targetPoint, object: hitObject };
    }

    reload() {
        if (this.isReloading || this.ammo === 30 || this.maxAmmo <= 0) return;
        this.isReloading = true;
        setTimeout(() => {
            const needed = 30 - this.ammo;
            const toReload = Math.min(needed, this.maxAmmo);
            this.ammo += toReload;
            this.maxAmmo -= toReload;
            this.isReloading = false;
            this._updateAmmoUI();
        }, 1200);
    }
}
