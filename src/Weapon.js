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

        this.weaponGroup = new THREE.Group();
        
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1a24, roughness: 0.3, metalness: 0.9 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.5), bodyMat);

        const railMat = new THREE.MeshStandardMaterial({ color: 0x0a0a10, roughness: 0.5, metalness: 0.8 });
        const leftRail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.4), railMat);
        leftRail.position.set(0.04, 0.02, -0.35);
        const rightRail = leftRail.clone();
        rightRail.position.x = -0.04;

        const coreMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
        const barrelCore = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 8), coreMat);
        barrelCore.rotation.x = Math.PI / 2; 
        barrelCore.position.set(0, 0.02, -0.35);

        const sightBase = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.08), bodyMat);
        sightBase.position.set(0, 0.1, 0.05);
        
        const glassMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
        const sightGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.05), glassMat);
        sightGlass.position.set(0, 0.14, 0.05);

        const mag = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.15, 8), new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8 }));
        mag.position.set(0, -0.12, 0.1);
        const magShell = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.08), bodyMat);
        magShell.position.set(0, -0.12, 0.1);

        this.weaponGroup.add(body, leftRail, rightRail, barrelCore, sightBase, sightGlass, mag, magShell);
        
        this.basePosition = new THREE.Vector3(0.25, -0.2, -0.5);
        this.weaponGroup.position.copy(this.basePosition);
        this.weaponGroup.rotation.y = -0.05; 
        this.camera.add(this.weaponGroup);

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
        this.weaponGroup.position.lerp(this.basePosition, delta * 10);
    }

    fire(raycaster) {
        if (this.ammo <= 0 || this.isReloading) return null;
        const now = performance.now() / 1000;
        if (now - this.lastFireTime < this.fireRate) return null;

        this.lastFireTime = now;
        this.ammo--;
        this.updateUI();
        
        this.weaponGroup.position.z += 0.12;
        this.weaponGroup.position.y += 0.02;
        this.weaponGroup.rotation.x = 0.05;
        setTimeout(() => this.weaponGroup.rotation.x = 0, 50);

        raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const intersects = raycaster.intersectObjects(this.scene.children, true)
            .filter(i => !this.bullets.some(b => b.mesh === i.object) && !this.weaponGroup.children.includes(i.object));

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
        const el = document.getElementById('ammo-info');
        if (el) el.innerText = "RELOADING...";
        
        this.weaponGroup.position.y -= 0.2;
        this.weaponGroup.rotation.x = -0.2;

        setTimeout(() => {
            const needed = 30 - this.ammo;
            const toReload = Math.min(needed, this.maxAmmo);
            this.ammo += toReload; 
            this.maxAmmo -= toReload;
            this.isReloading = false; 
            this.updateUI();
            this.weaponGroup.rotation.x = 0;
        }, 1200);
    }

    updateUI() {
        const el = document.getElementById('ammo-info');
        if (el) el.innerText = `AMMO: ${this.ammo} / ${this.maxAmmo}`;
    }
}
