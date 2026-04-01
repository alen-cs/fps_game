import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Enemy1 {
    constructor(scene, world, pos) {
        this.scene = scene;
        this.world = world;
        this.health = 100;
        this.isDestroyed = false;
        
        // 核心修正：物理盒半高设定为 0.35 (总高度 0.7)，确保完美贴地不漂浮
        this.halfHeight = 0.35; 

        // ========== 1. 赛博无人战车建模 ==========
        this.group = new THREE.Group();
        this.group.position.copy(pos);
        this.scene.add(this.group);

        const metalMat = new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.6, metalness: 0.7 }); 
        const trackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }); 
        const glowMat = new THREE.MeshBasicMaterial({ color: 0xff0055 }); 

        // 1.1 履带 (高度 0.5, 中心下移至 -0.1 以贴合地板 -0.35)
        const trackGeo = new THREE.BoxGeometry(0.4, 0.5, 1.8);
        const leftTrack = new THREE.Mesh(trackGeo, trackMat);
        leftTrack.position.set(0.6, -0.1, 0);
        const rightTrack = leftTrack.clone();
        rightTrack.position.x = -0.6;
        
        const trackLightGeo = new THREE.BoxGeometry(0.05, 0.1, 1.9);
        const tl1 = new THREE.Mesh(trackLightGeo, glowMat);
        tl1.position.set(0.81, -0.1, 0);
        const tl2 = tl1.clone();
        tl2.position.x = -0.81;
        this.group.add(leftTrack, rightTrack, tl1, tl2);

        // 1.2 车体 (高度 0.4, 中心放在 0.15)
        const bodyGeo = new THREE.BoxGeometry(1.0, 0.4, 1.5);
        const body = new THREE.Mesh(bodyGeo, metalMat);
        body.position.y = 0.15;
        this.group.add(body);

        // 1.3 炮塔水平轴 (Yaw)
        this.turretGroup = new THREE.Group();
        this.turretGroup.position.y = 0.35; // 车体上方
        this.group.add(this.turretGroup);

        const turretGeo = new THREE.CylinderGeometry(0.4, 0.5, 0.4, 8);
        const turret = new THREE.Mesh(turretGeo, metalMat);
        turret.position.y = 0.2;
        this.turretGroup.add(turret);

        // 1.4 炮管垂直俯仰轴 (Pitch) - 核心修复点
        this.pitchGroup = new THREE.Group();
        this.pitchGroup.position.y = 0.2; // 旋转中心设在炮塔内部
        this.turretGroup.add(this.pitchGroup);

        const gunGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.8, 8);
        const gun = new THREE.Mesh(gunGeo, metalMat);
        gun.rotation.x = -Math.PI / 2; 
        gun.position.set(0, 0, -0.4); // 相对俯仰轴心向前延伸
        this.pitchGroup.add(gun);

        const muzzleGlowGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.05, 8);
        this.muzzleGlow = new THREE.Mesh(muzzleGlowGeo, glowMat);
        this.muzzleGlow.rotation.x = -Math.PI / 2;
        this.muzzleGlow.position.set(0, 0, -0.8);
        this.pitchGroup.add(this.muzzleGlow);

        // 智能绑定：给所有子网格打上标签，方便 main.js 一次性做射线伤害判定
        this.group.traverse((child) => {
            if (child.isMesh) child.enemyParent = this;
        });
        this.mesh = body; // 兼容旧接口

        // ========== 2. 物理碰撞盒 ==========
        this.body = new CANNON.Body({
            mass: 15, 
            shape: new CANNON.Box(new CANNON.Vec3(0.6, 0.35, 0.9)), // 半宽, 半高, 半深
            position: new CANNON.Vec3(pos.x, pos.y, pos.z),
            linearDamping: 0.5,
            angularDamping: 0.9 
        });
        this.world.addBody(this.body);

        // ========== 3. 战斗系统参数 ==========
        this.state = 'CHASE'; 
        this.fireRate = 2.5; 
        this.lastFireTime = 0;
        this.bulletSpeed = 30; 
        
        // 子弹池
        this.enemyBullets = [];
        for (let i = 0; i < 3; i++) { 
            const bGeo = new THREE.SphereGeometry(0.15, 8, 8);
            const bMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            const bMesh = new THREE.Mesh(bGeo, bMat);
            bMesh.visible = false;
            this.scene.add(bMesh);
            
            const bBody = new CANNON.Body({
                mass: 0, // 设为 0 + KINEMATIC 消除重力影响，解决弹道偏下！
                type: CANNON.Body.KINEMATIC,
                shape: new CANNON.Sphere(0.15),
                collisionFilterGroup: 8,
                collisionFilterMask: 1, 
            });
            bBody.isTrigger = true; 
            this.world.addBody(bBody);
            
            this.enemyBullets.push({ mesh: bMesh, body: bBody, active: false, life: 0 });
        }
    }

    update(delta, safePlayerPosThree) {
        if (this.isDestroyed) return;

        // 核心修复：视觉位置与物理盒坐标完全对齐
        this.group.position.set(this.body.position.x, this.body.position.y, this.body.position.z);

        const targetTurretWorldPos = new THREE.Vector3();
        this.turretGroup.getWorldPosition(targetTurretWorldPos);
        const toPlayer = new THREE.Vector3().subVectors(safePlayerPosThree, targetTurretWorldPos);
        const dist = toPlayer.length();
        
        if (dist > 25) this.state = 'CHASE';
        else if (dist < 20) this.state = 'ATTACK';

        if (this.state === 'CHASE') {
            const flatToPlayer = new THREE.Vector3(toPlayer.x, 0, toPlayer.z).normalize();
            const targetQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), flatToPlayer);
            this.group.quaternion.slerp(targetQuaternion, delta * 3);
            
            // 核心修复：同步物理盒的旋转，解决动画平移滑步问题
            this.body.quaternion.set(this.group.quaternion.x, this.group.quaternion.y, this.group.quaternion.z, this.group.quaternion.w);

            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.group.quaternion);
            this.body.velocity.x = forward.x * 5;
            this.body.velocity.z = forward.z * 5;
            
            this.turretGroup.quaternion.slerp(new THREE.Quaternion(), delta * 2);
            this.pitchGroup.rotation.x = THREE.MathUtils.lerp(this.pitchGroup.rotation.x, 0, delta * 2);

        } else if (this.state === 'ATTACK') {
            this.body.velocity.x *= 0.9; 
            this.body.velocity.z *= 0.9;

            // 1. 炮塔水平瞄准 (Yaw)
            const localAim = this.group.worldToLocal(safePlayerPosThree.clone());
            const yawDir = new THREE.Vector3(localAim.x, 0, localAim.z).normalize();
            const targetYaw = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), yawDir);
            this.turretGroup.quaternion.slerp(targetYaw, delta * 5); 

            // 2. 枪管垂直瞄准 (Pitch) - 核心修复点
            const dist2D = Math.sqrt(toPlayer.x ** 2 + toPlayer.z ** 2);
            let pitchAngle = Math.atan2(toPlayer.y, dist2D);
            pitchAngle = THREE.MathUtils.clamp(pitchAngle, -Math.PI / 3, Math.PI / 4); // 限制抬枪/压枪角度
            this.pitchGroup.rotation.x = THREE.MathUtils.lerp(this.pitchGroup.rotation.x, -pitchAngle, delta * 5);

            const now = performance.now() / 1000;
            if (now - this.lastFireTime > this.fireRate) {
                this.shoot();
                this.lastFireTime = now;
            }
        }

        // 更新子弹
        this.enemyBullets.forEach(b => {
            if (b.active) {
                // KINEMATIC body 需要手动根据速度更新位置 (因为绕过了Cannon的重力处理)
                b.body.position.x += b.body.velocity.x * delta;
                b.body.position.y += b.body.velocity.y * delta;
                b.body.position.z += b.body.velocity.z * delta;

                b.mesh.position.set(b.body.position.x, b.body.position.y, b.body.position.z);
                b.life -= delta;
                if (b.life <= 0) {
                    b.active = false;
                    b.mesh.visible = false;
                    b.body.position.set(0, -100, 0); 
                }
            }
        });
    }

    shoot() {
        const bullet = this.enemyBullets.find(b => !b.active);
        if (!bullet) return;

        // 核心修复：发射点与方向完全跟随物理枪口，绝对精准同步
        const muzzleWorldPos = new THREE.Vector3();
        this.muzzleGlow.getWorldPosition(muzzleWorldPos);

        const shootDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.pitchGroup.getWorldQuaternion(new THREE.Quaternion()));

        bullet.active = true;
        bullet.mesh.visible = true;
        bullet.life = 4.0; 

        bullet.body.position.set(muzzleWorldPos.x, muzzleWorldPos.y, muzzleWorldPos.z);
        bullet.body.velocity.set(
            shootDir.x * this.bulletSpeed,
            shootDir.y * this.bulletSpeed,
            shootDir.z * this.bulletSpeed
        );
    }

    takeDamage(amount) {
        if (this.isDestroyed) return;
        this.health -= amount;
        
        this.muzzleGlow.material.color.setHex(0xffffff); 
        setTimeout(() => { if (!this.isDestroyed && this.muzzleGlow) this.muzzleGlow.material.color.setHex(0xff0055); }, 50);

        if (this.health <= 0) this.destroy();
    }

    destroy() {
        this.isDestroyed = true;
        this.scene.remove(this.group);
        this.world.removeBody(this.body);
        
        this.enemyBullets.forEach(b => {
            this.world.removeBody(b.body);
            this.scene.remove(b.mesh);
        });
    }
}
