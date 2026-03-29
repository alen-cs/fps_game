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

        // --- 核心优化：构建一把看得见的赛博枪械 ---
        this.weaponGroup = new THREE.Group();
        
        // 1. 枪身 (黑灰色金属)
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1a24, roughness: 0.4, metalness: 0.8 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.5), bodyMat);
        
        // 2. 枪管 (深黑)
        const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.3), new THREE.MeshStandardMaterial({ color: 0x050505 }));
        barrel.position.set(0, 0.03, -0.3);
        
        // 3. 霓虹灯条 (青色自发光)
        const neonMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
        const neonStrip1 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.4), neonMat);
        neonStrip1.position.set(0.065, 0.02, -0.05);
        const neonStrip2 = neonStrip1.clone();
        neonStrip2.position.x = -0.065;
        
        this.weaponGroup.add(body, barrel, neonStrip1, neonStrip2);
        
        // 调整持枪位置：右下方，微微向前伸
        this.basePosition = new THREE.Vector3(0.25, -0.25, -0.6);
        this.weaponGroup.position.copy(this.basePosition);
        
        // 枪口稍微往左偏一点，指向屏幕中心
        this.weaponGroup.rotation.y = -0.05; 
        
        this.camera.add(this.weaponGroup);

        // 子弹池保持不变
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
        // 武器后坐力复位
        this.weaponGroup.position.lerp(this.basePosition, delta * 10);
    }

    fire(raycaster) {
        if (this.ammo <= 0 || this.isReloading) return null;
        const now = performance.now() / 1000;
        if (now - this.lastFireTime < this.fireRate) return null;

        this.lastFireTime = now;
        this.ammo--;
        this.updateUI();
        
        // 开火后坐力动画
        this.weaponGroup.position.z += 0.12;
        this.weaponGroup.position.y += 0.02;

        raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const intersects = raycaster.intersectObjects(this.scene.children, true)
            .filter(i => !this.bullets.some(b => b.mesh === i.object) && i.object !== this.weaponGroup);

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
            this.weaponGroup.getWorldPosition(b.mesh.position);
            b.mesh.lookAt(targetPoint);
            b.velocity.subVectors(targetPoint, b.mesh.position).normalize().multiplyScalar(220);
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
        const el = document.getElementById('ammo-info');
        if (el) el.innerText = `AMMO: ${this.ammo} / ${this.maxAmmo}`;
    }
}
