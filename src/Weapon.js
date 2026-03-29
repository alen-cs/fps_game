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

        // --- 1. 构建枪械模型 ---
        this.weaponGroup = new THREE.Group();
        
        const bodyGeo = new THREE.BoxGeometry(0.15, 0.2, 0.6);
        const bodyMat = new THREE.MeshBasicMaterial({ color: 0x555555 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        
        const barrelGeo = new THREE.BoxGeometry(0.05, 0.05, 0.4);
        const barrelMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
        this.barrel = new THREE.Mesh(barrelGeo, barrelMat);
        this.barrel.position.set(0, 0.05, -0.4); 

        const sightGeo = new THREE.BoxGeometry(0.02, 0.06, 0.02);
        const sightMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const sight = new THREE.Mesh(sightGeo, sightMat);
        sight.position.set(0, 0.13, -0.1);

        this.weaponGroup.add(body);
        this.weaponGroup.add(this.barrel);
        this.weaponGroup.add(sight);

        this.basePosition = new THREE.Vector3(0.35, -0.35, -0.8);
        this.weaponGroup.position.copy(this.basePosition);
        this.camera.add(this.weaponGroup); 

        this.swayTime = 0;

        // --- 2. 枪口火焰 ---
        const flashGeo = new THREE.PlaneGeometry(0.3, 0.3);
        const flashMat = new THREE.MeshBasicMaterial({ 
            color: 0xffaa00, transparent: true, opacity: 0, 
            side: THREE.DoubleSide, depthWrite: false
        });
        this.muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
        this.muzzleFlash.position.set(0, 0.05, -0.65); 
        this.muzzleFlash.rotation.y = Math.PI / 2;
        this.weaponGroup.add(this.muzzleFlash);

        // --- 3. 实体子弹池 ---
        this.bullets = [];
        const bulletGeo = new THREE.BoxGeometry(0.04, 0.04, 0.8);
        const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffea00 }); 
        for (let i = 0; i < 15; i++) {
            const mesh = new THREE.Mesh(bulletGeo, bulletMat);
            mesh.visible = false;
            this.scene.add(mesh);
            this.bullets.push({ mesh: mesh, active: false, velocity: new THREE.Vector3(), life: 0 });
        }

        // --- 4. 击中火花特效池 ---
        this.hitFlashes = [];
        const hitFlashGeo = new THREE.SphereGeometry(0.15, 8, 8);
        const hitFlashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
        for(let i = 0; i < 10; i++) {
            let mesh = new THREE.Mesh(hitFlashGeo, hitFlashMat.clone());
            mesh.visible = false;
            this.scene.add(mesh);
            this.hitFlashes.push({ mesh: mesh, life: 0 });
        }

        this._updateAmmoUI(`${this.ammo} / ${this.maxAmmo}`);
    }

    _updateAmmoUI(text) {
        let ammoDiv = document.getElementById('ammo-info');
        if (!ammoDiv) {
            ammoDiv = document.createElement('div');
            ammoDiv.id = 'ammo-info';
            ammoDiv.style.position = 'absolute';
            ammoDiv.style.bottom = '20px';
            ammoDiv.style.right = '30px';
            ammoDiv.style.fontSize = '32px';
            ammoDiv.style.fontWeight = 'bold';
            ammoDiv.style.fontFamily = 'monospace';
            ammoDiv.style.color = '#fff';
            ammoDiv.style.zIndex = '10';
            document.body.appendChild(ammoDiv);
        }
        ammoDiv.innerText = `AMMO: ${text}`;
    }

    update(delta, isMoving, isSprinting) {
        if (isMoving && !this.isReloading) {
            const speed = isSprinting ? 14 : 8;
            this.swayTime += delta * speed;
            this.weaponGroup.position.x = this.basePosition.x + Math.sin(this.swayTime) * 0.015;
            this.weaponGroup.position.y = this.basePosition.y + Math.abs(Math.cos(this.swayTime)) * 0.02;
        } else {
            this.weaponGroup.position.lerp(this.basePosition, delta * 5);
        }

        this.weaponGroup.rotation.x = THREE.MathUtils.lerp(this.weaponGroup.rotation.x, 0, delta * 15);
        this.weaponGroup.position.z = THREE.MathUtils.lerp(this.weaponGroup.position.z, this.basePosition.z, delta * 15);

        if (this.muzzleFlash.material.opacity > 0) {
            this.muzzleFlash.material.opacity -= delta * 15;
        }

        for (let b of this.bullets) {
            if (b.active) {
                b.mesh.position.addScaledVector(b.velocity, delta);
                b.life -= delta;
                if (b.life <= 0) {
                    b.active = false;
                    b.mesh.visible = false;
                }
            }
        }

        for (let f of this.hitFlashes) {
            if (f.life > 0) {
                f.life -= delta;
                f.mesh.scale.addScalar(delta * 15); 
                f.mesh.material.opacity = f.life * 5; 
                if (f.life <= 0) f.mesh.visible = false;
            }
        }
    }

    fire(raycaster) {
        if (this.ammo <= 0 || this.isReloading) {
            if (this.ammo <= 0) this.reload(); 
            return null;
        }
        
        const now = performance.now() / 1000;
        if (now - this.lastFireTime < this.fireRate) return null; 
        this.lastFireTime = now;

        this.ammo--;
        this._updateAmmoUI(`${this.ammo} / ${this.maxAmmo}`);

        this.weaponGroup.rotation.x += 0.05 + Math.random() * 0.02; 
        this.weaponGroup.position.z += 0.1; 
        this.muzzleFlash.material.opacity = 1;
        this.muzzleFlash.rotation.z = Math.random() * Math.PI; 

        raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const intersects = raycaster.intersectObjects(this.scene.children, true);
        
        let hitPoint = null;
        for (let i = 0; i < intersects.length; i++) {
            const obj = intersects[i].object;
            if (obj !== this.weaponGroup && !this.bullets.some(b => b.mesh === obj) && obj !== this.muzzleFlash) {
                hitPoint = intersects[i].point;
                const normal = intersects[i].face ? intersects[i].face.normal : new THREE.Vector3(0,1,0);
                if(this.particles) this.particles.spawnImpact(hitPoint, normal); 
                break;
            }
        }

        const targetPos = hitPoint ? hitPoint : raycaster.ray.at(100, new THREE.Vector3());

        let bullet = this.bullets.find(b => !b.active);
        if (bullet) {
            bullet.active = true;
            bullet.life = 1.0; 
            bullet.mesh.visible = true;
            
            this.barrel.getWorldPosition(bullet.mesh.position);
            bullet.mesh.lookAt(targetPos); 
            bullet.velocity.subVectors(targetPos, bullet.mesh.position).normalize().multiplyScalar(200); 
        }

        if (hitPoint) {
            let flash = this.hitFlashes.find(f => f.life <= 0);
            if (flash) {
                flash.mesh.position.copy(hitPoint);
                flash.mesh.scale.set(1, 1, 1);
                flash.mesh.material.opacity = 1;
                flash.mesh.visible = true;
                flash.life = 0.15; 
            }
        }

        return { point: hitPoint }; 
    }

    reload() {
        if (this.isReloading || this.ammo === 30 || this.maxAmmo <= 0) return;
        this.isReloading = true;
        this._updateAmmoUI(`RELOADING...`);

        let reloadTicks = 0;
        const reloadAnim = setInterval(() => {
            this.weaponGroup.rotation.x -= 0.05;
            reloadTicks++;
            if (reloadTicks > 15) clearInterval(reloadAnim);
        }, 16);

        setTimeout(() => {
            const needed = 30 - this.ammo;
            const toReload = Math.min(needed, this.maxAmmo);
            this.ammo += toReload;
            this.maxAmmo -= toReload;
            this.isReloading = false;
            this._updateAmmoUI(`${this.ammo} / ${this.maxAmmo}`);
            this.weaponGroup.rotation.x = 0;
        }, 1500);
    }
}
