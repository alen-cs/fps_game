import * as THREE from 'three';

export class Weapon {
    constructor(camera, scene, particles) {
        this.camera = camera;
        this.scene = scene;
        this.particles = particles;

        // 武器库参数配置
        this.arsenal = [
            { name: '新兵电磁步枪', cost: 0, damage: 40, fireRate: 0.12, magSize: 30, color: 0x00ffff, scale: [1, 1, 1], zoom: 60 },
            { name: '地狱火冲锋枪', cost: 500, damage: 18, fireRate: 0.06, magSize: 50, color: 0xff0055, scale: [0.8, 0.8, 0.6], zoom: 65 },
            { name: '镇暴重型霰弹枪', cost: 1200, damage: 25, bullets: 6, fireRate: 0.8, magSize: 8, color: 0xffaa00, scale: [1.2, 1.2, 0.8], zoom: 70 },
            { name: '高斯充能狙击炮', cost: 2500, damage: 200, fireRate: 1.5, magSize: 5, color: 0x00ff88, scale: [1, 1, 1.8], zoom: 20 },
            { name: '虚空微型机枪', cost: 5000, damage: 45, fireRate: 0.04, magSize: 100, color: 0xaa00ff, scale: [1.5, 1.5, 1.2], zoom: 55 }
        ];

        this.unlockedWeapons = [0]; // 默认解锁第一把
        this.currentWeaponIndex = 0;
        this.maxAmmo = 120; // 通用备弹
        this.isReloading = false;
        this.lastFireTime = 0;
        this.isAiming = false; // 开镜状态

        // 持枪姿态基准点
        this.hipPosition = new THREE.Vector3(0.25, -0.2, -0.5);
        this.adsPosition = new THREE.Vector3(0, -0.12, -0.4); 

        this.weaponGroup = new THREE.Group();
        this.camera.add(this.weaponGroup);
        
        this.bullets = [];
        for (let i = 0; i < 30; i++) {
            const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
            b.visible = false;
            this.scene.add(b);
            this.bullets.push({ mesh: b, active: false, velocity: new THREE.Vector3(), life: 0 });
        }

        this.buildWeaponModel();
        this.switchWeapon(0);
    }

    buildWeaponModel() {
        // 构建一个模块化枪身，后续通过 switchWeapon 动态调色调尺码
        this.weaponGroup.clear();
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1a24, roughness: 0.3 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.5), bodyMat);

        this.coreMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
        const barrelCore = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 8), this.coreMat);
        barrelCore.rotation.x = Math.PI / 2; 
        barrelCore.position.set(0, 0.02, -0.35);

        const sightBase = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.08), bodyMat);
        sightBase.position.set(0, 0.1, 0.05);
        
        this.weaponGroup.add(body, barrelCore, sightBase);
    }

    switchWeapon(index) {
        this.currentWeaponIndex = index;
        const config = this.arsenal[index];
        this.ammo = config.magSize;
        
        // 动态改变武器外观
        this.coreMat.color.setHex(config.color);
        this.weaponGroup.scale.set(...config.scale);
        this.bullets.forEach(b => b.mesh.material.color.setHex(config.color));
        
        this.updateUI();
    }

    aim(isAiming) {
        this.isAiming = isAiming;
    }

    update(delta) {
        const config = this.arsenal[this.currentWeaponIndex];
        
        // 1. 处理子弹飞行
        this.bullets.forEach(b => {
            if (b.active) {
                b.mesh.position.addScaledVector(b.velocity, delta);
                b.life -= delta;
                if (b.life <= 0) { b.active = false; b.mesh.visible = false; }
            }
        });

        // 2. 平滑过渡开镜/腰射姿态 (Lerp)
        const targetPos = this.isAiming ? this.adsPosition : this.hipPosition;
        this.weaponGroup.position.lerp(targetPos, delta * 15);
        
        // 3. 平滑过渡相机 FOV (开镜放大)
        const targetFOV = this.isAiming ? config.zoom : 75;
        this.camera.fov += (targetFOV - this.camera.fov) * delta * 15;
        this.camera.updateProjectionMatrix();
    }

    fire(raycaster) {
        if (this.ammo <= 0 || this.isReloading) return null;
        const now = performance.now() / 1000;
        const config = this.arsenal[this.currentWeaponIndex];

        if (now - this.lastFireTime < config.fireRate) return null;

        this.lastFireTime = now;
        this.ammo--;
        this.updateUI();
        
        // 后坐力动画表现
        this.weaponGroup.position.z += this.isAiming ? 0.05 : 0.12;
        this.weaponGroup.rotation.x = 0.05;
        setTimeout(() => this.weaponGroup.rotation.x = 0, 50);

        // 霰弹枪多弹片逻辑
        const bulletCount = config.bullets || 1;
        let mainHit = null;

        for (let i = 0; i < bulletCount; i++) {
            // 霰弹散布，若是单发武器则不散布
            const spread = bulletCount > 1 ? (Math.random() - 0.5) * 0.1 : 0;
            const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
            dir.x += spread; dir.y += spread; dir.normalize();

            raycaster.set(this.camera.position, dir);
            const intersects = raycaster.intersectObjects(this.scene.children, true)
                .filter(item => !this.bullets.some(b => b.mesh === item.object) && !this.weaponGroup.children.includes(item.object));

            let targetPoint = new THREE.Vector3();
            if (intersects.length > 0) {
                targetPoint.copy(intersects[0].point);
                if (i === 0) mainHit = { point: targetPoint, object: intersects[0].object, damage: config.damage };
                this.particles.spawnImpact(targetPoint, intersects[0].face.normal);
            } else {
                raycaster.ray.at(100, targetPoint);
            }

            const b = this.bullets.find(bullet => !bullet.active);
            if (b) {
                b.active = true; b.life = 0.8; b.mesh.visible = true;
                this.weaponGroup.getWorldPosition(b.mesh.position);
                b.mesh.lookAt(targetPoint);
                b.velocity.subVectors(targetPoint, b.mesh.position).normalize().multiplyScalar(250);
            }
        }
        return mainHit; // 返回击中信息和当前武器伤害供 main.js 扣血
    }

    reload() {
        const config = this.arsenal[this.currentWeaponIndex];
        if (this.isReloading || this.ammo === config.magSize || this.maxAmmo <= 0) return;
        this.isReloading = true;
        
        const el = document.getElementById('ammo-info');
        if (el) el.innerText = "RELOADING...";
        
        this.weaponGroup.position.y -= 0.2;
        this.weaponGroup.rotation.x = -0.2;

        setTimeout(() => {
            const needed = config.magSize - this.ammo;
            const toReload = Math.min(needed, this.maxAmmo);
            this.ammo += toReload; 
            this.maxAmmo -= toReload;
            this.isReloading = false; 
            this.updateUI();
            this.weaponGroup.rotation.x = 0;
        }, 1200);
    }

    updateUI() {
        const config = this.arsenal[this.currentWeaponIndex];
        const el = document.getElementById('ammo-info');
        if (el) el.innerText = `[${config.name}] AMMO: ${this.ammo} / ${this.maxAmmo}`;
    }
}
