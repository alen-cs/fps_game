import * as THREE from 'three';

export class Weapon {
    constructor(camera, scene, particles) {
        this.camera = camera;
        this.scene = scene;
        this.particles = particles;

        this.ammo = 30;
        this.maxAmmo = 120;
        this.fireRate = 0.1; 
        this.lastFireTime = 0;
        this.isReloading = false;

        this.weaponGroup = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.6), new THREE.MeshBasicMaterial({ color: 0x333333 }));
        this.barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.5), new THREE.MeshBasicMaterial({ color: 0x111111 }));
        this.barrel.position.set(0, 0.05, -0.4);
        this.weaponGroup.add(body, this.barrel);
        
        this.basePosition = new THREE.Vector3(0.35, -0.35, -0.8);
        this.weaponGroup.position.copy(this.basePosition);
        this.camera.add(this.weaponGroup);

        this.muzzleFlash = new THREE.Mesh(
            new THREE.PlaneGeometry(0.4, 0.4),
            new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0, side: THREE.DoubleSide })
        );
        this.muzzleFlash.position.set(0, 0.05, -0.7);
        this.weaponGroup.add(this.muzzleFlash);

        this.bullets = [];
        for (let i = 0; i < 20; i++) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 1.2), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
            mesh.visible = false;
            this.scene.add(mesh);
            this.bullets.push({ mesh: mesh, active: false, velocity: new THREE.Vector3(), life: 0 });
        }
        // 延迟一丢丢执行，确保 DOM 树好了
        setTimeout(() => this._updateUI(), 100);
    }

    _updateUI() {
        const el = document.getElementById('ammo-info');
        if(el) el.innerText = `AMMO: ${this.ammo} / ${this.maxAmmo}`;
    }

    update(delta) {
        this.bullets.forEach(b => {
            if (b.active) {
                b.mesh.position.addScaledVector(b.velocity, delta);
                b.life -= delta;
                if (b.life <= 0) { b.active = false; b.mesh.visible = false; }
            }
        });
        if (this.muzzleFlash && this.muzzleFlash.material.opacity > 0) {
            this.muzzleFlash.material.opacity -= delta * 20;
        }
        this.weaponGroup.position.lerp(this.basePosition, delta * 10);
    }

    fire(raycaster) {
        if (this.ammo <= 0 || this.isReloading) return null;
        const now = performance.now() / 1000;
        if (now - this.lastFireTime < this.fireRate) return null;
        
        this.lastFireTime = now;
        this.ammo--;
        this._updateUI();

        this.weaponGroup.position.z += 0.15;
        this.muzzleFlash.material.opacity = 1;

        raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const intersects = raycaster.intersectObjects(this.scene.children, true)
            .filter(i => !this.bullets.some(b => b.mesh === i.object) && i.object !== this.muzzleFlash);

        let targetPoint = new THREE.Vector3();
        let hitObject = null;

        if (intersects.length > 0) {
            targetPoint.copy(intersects[0].point);
            hitObject = intersects[0].object;
            // 安全调用粒子
            if (this.particles && typeof this.particles.spawnImpact === 'function') {
                this.particles.spawnImpact(targetPoint, intersects[0].face.normal);
            }
        } else {
            raycaster.ray.at(100, targetPoint);
        }

        const bullet = this.bullets.find(b => !b.active);
        if (bullet) {
            bullet.active = true;
            bullet.life = 0.8;
            bullet.mesh.visible = true;
            this.barrel.getWorldPosition(bullet.mesh.position);
            bullet.mesh.lookAt(targetPoint);
            bullet.velocity.subVectors(targetPoint, bullet.mesh.position).normalize().multiplyScalar(280);
        }

        return { point: targetPoint, object: hitObject };
    }

    reload() {
        if (this.isReloading || this.ammo === 30 || this.maxAmmo <= 0) return;
        this.isReloading = true;
        const el = document.getElementById('ammo-info');
        if(el) el.innerText = "RELOADING...";
        setTimeout(() => {
            const needed = 30 - this.ammo;
            const toReload = Math.min(needed, this.maxAmmo);
            this.ammo += toReload;
            this.maxAmmo -= toReload;
            this.isReloading = false;
            this._updateUI();
        }, 1200);
    }
}
