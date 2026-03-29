import * as THREE from 'three';

export class Weapon {
    constructor(camera, scene, particles) {
        this.camera = camera;
        this.scene = scene;
        this.particles = particles;

        this.ammo = 30;
        this.maxAmmo = 120;
        this.fireRate = 0.12;
        this.lastFireTime = 0;
        this.isReloading = false;

        // 武器模型
        this.mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.5), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
        this.mesh.position.set(0.2, -0.2, -0.5);
        this.camera.add(this.mesh);

        // 子弹池
        this.bullets = [];
        for (let i = 0; i < 15; i++) {
            const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.8), new THREE.MeshBasicMaterial({ color: 0xff00ff }));
            b.visible = false;
            this.scene.add(b);
            this.bullets.push({ mesh: b, active: false, velocity: new THREE.Vector3(), life: 0 });
        }
    }

    update(delta) {
        this.bullets.forEach(b => {
            if (b.active) {
                b.mesh.position.addScaledVector(b.velocity, delta);
                b.life -= delta;
                if (b.life <= 0) { b.active = false; b.mesh.visible = false; }
            }
        });
        this.mesh.position.lerp(new THREE.Vector3(0.2, -0.2, -0.5), delta * 10);
    }

    fire(raycaster) {
        if (this.ammo <= 0 || this.isReloading) return null;
        const now = performance.now() / 1000;
        if (now - this.lastFireTime < this.fireRate) return null;

        this.lastFireTime = now;
        this.ammo--;
        this.updateUI();
        this.mesh.position.z += 0.1;

        raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const intersects = raycaster.intersectObjects(this.scene.children, true)
            .filter(i => !this.bullets.some(b => b.mesh === i.object) && i.object !== this.mesh);

        let targetPoint = new THREE.Vector3();
        let hitObject = null;

        if (intersects.length > 0) {
            targetPoint.copy(intersects[0].point);
            hitObject = intersects[0].object;
            this.particles.spawnImpact(targetPoint, intersects[0].face.normal);
        } else {
            raycaster.ray.at(100, targetPoint);
        }

        const b = this.bullets.find(bullet => !bullet.active);
        if (b) {
            b.active = true; b.life = 0.8; b.mesh.visible = true;
            this.mesh.getWorldPosition(b.mesh.position);
            b.mesh.lookAt(targetPoint);
            b.velocity.subVectors(targetPoint, b.mesh.position).normalize().multiplyScalar(200);
        }
        return { point: targetPoint, object: hitObject };
    }

    reload() {
        if (this.isReloading || this.ammo === 30 || this.maxAmmo <= 0) return;
        this.isReloading = true;
        document.getElementById('ammo-info').innerText = "RELOADING...";
        setTimeout(() => {
            const needed = 30 - this.ammo;
            const toReload = Math.min(needed, this.maxAmmo);
            this.ammo += toReload; this.maxAmmo -= toReload;
            this.isReloading = false; this.updateUI();
        }, 1200);
    }

    updateUI() {
        document.getElementById('ammo-info').innerText = `AMMO: ${this.ammo} / ${this.maxAmmo}`;
    }
}
