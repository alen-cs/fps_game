import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Enemy1 {
    constructor(scene, world, pos) {
        this.scene = scene;
        this.world = world;
        this.health = 100;
        this.isDestroyed = false;
        this.halfHeight = 0.8; 

        // 1. 建模
        this.group = new THREE.Group();
        this.group.position.copy(pos);
        this.scene.add(this.group);

        const metalMat = new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.6, metalness: 0.7 }); 
        const trackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }); 
        const glowMat = new THREE.MeshBasicMaterial({ color: 0xff0055 }); 

        const trackGeo = new THREE.BoxGeometry(0.4, 0.5, 1.8);
        const leftTrack = new THREE.Mesh(trackGeo, trackMat);
        leftTrack.position.set(0.6, 0.25, 0);
        const rightTrack = leftTrack.clone();
        rightTrack.position.x = -0.6;
        
        const trackLightGeo = new THREE.BoxGeometry(0.05, 0.1, 1.9);
        const tl1 = new THREE.Mesh(trackLightGeo, glowMat);
        tl1.position.set(0.81, 0.25, 0);
        const tl2 = tl1.clone();
        tl2.position.x = -0.81;
        this.group.add(leftTrack, rightTrack, tl1, tl2);

        const bodyGeo = new THREE.BoxGeometry(1.0, 0.4, 1.5);
        const body = new THREE.Mesh(bodyGeo, metalMat);
        body.position.y = 0.5;
        this.group.add(body);

        this.turretGroup = new THREE.Group();
        this.turretGroup.position.y = 0.7; 
        this.group.add(this.turretGroup);

        const turretGeo = new THREE.CylinderGeometry(0.5, 0.6, 0.4, 8);
        const turret = new THREE.Mesh(turretGeo, metalMat);
        this.turretGroup.add(turret);

        const gunGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.8, 8);
        const gun = new THREE.Mesh(gunGeo, metalMat);
        gun.rotation.x = -Math.PI / 2; 
        gun.position.set(0, 0.1, -0.6); 
        this.turretGroup.add(gun);

        const muzzleGlowGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.05, 8);
        const muzzleGlow = new THREE.Mesh(muzzleGlowGeo, glowMat);
        muzzleGlow.rotation.x = -Math.PI / 2;
        muzzleGlow.position.set(0, 0.1, -1.0);
        this.turretGroup.add(muzzleGlow);

        this.mesh = body; 
        this.mesh.enemyParent = this; 

        // 2. 物理
        this.body = new CANNON.Body({
            mass: 15, 
            shape: new CANNON.Box(new CANNON.Vec3(0.8, 0.7, 0.9)), 
            position: new CANNON.Vec3(pos.x, pos.y, pos.z),
            linearDamping: 0.5,
            angularDamping: 0.9 
        });
        this.world.addBody(this.body);

        // 3. 战斗参数
        this.state = 'CHASE'; 
        this.fireRate = 2.5; 
        this.lastFireTime = 0;
        this.bulletSpeed = 30; 
        
        this.enemyBullets = [];
        for (let i = 0; i < 3; i++) { 
            const bGeo = new THREE.SphereGeometry(0.15, 8, 8);
            const bMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            const bMesh = new THREE.Mesh(bGeo, bMat);
            bMesh.visible = false;
            this.scene.add(bMesh);
            
            const bBody = new CANNON.Body({
                mass: 0.1,
                shape: new CANNON.Sphere(0.15),
                collisionFilterGroup: 8, // FILTER_ENEMY_BULLET
                collisionFilterMask: 1,  // FILTER_PLAYER
            });
            bBody.isTrigger = true; 
            this.world.addBody(bBody);
            
            this.enemyBullets.push({ mesh: bMesh, body: bBody, active: false, life: 0 });
        }
    }

    update(delta, safePlayerPosThree) {
        if (this.isDestroyed) return;

        this.group.position.set(this.body.position.x, this.body.position.y, this.body.position.z);

        const toPlayer = new THREE.Vector3().subVectors(safePlayerPosThree, this.group.position);
        const dist = toPlayer.length();
        
        if (dist > 25) {
            this.state = 'CHASE';
        } else if (dist < 20) {
            this.state = 'ATTACK';
        }

        if (this.state === 'CHASE') {
            toPlayer.y = 0;
            toPlayer.normalize();

            const targetQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), toPlayer);
            this.group.quaternion.slerp(targetQuaternion, delta * 3);

            this.body.velocity.x = toPlayer.x * 5;
            this.body.velocity.z = toPlayer.z * 5;
            
            this.turretGroup.quaternion.slerp(new THREE.Quaternion(), delta * 2);

        } else if (this.state === 'ATTACK') {
            this.body.velocity.x *= 0.9; 
            this.body.velocity.z *= 0.9;

            const turretWorldPos = new THREE.Vector3();
            this.turretGroup.getWorldPosition(turretWorldPos);
            const aimDir = new THREE.Vector3().subVectors(safePlayerPosThree, turretWorldPos).normalize();

            this.group.worldToLocal(aimDir); 
            const localAimDirY0 = new THREE.Vector3(aimDir.x, 0, aimDir.z).normalize();

            const targetTurretQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), localAimDirY0);
            this.turretGroup.quaternion.slerp(targetTurretQuaternion, delta * 5); 

            const now = performance.now() / 1000;
            if (now - this.lastFireTime > this.fireRate) {
                this.shoot(safePlayerPosThree);
                this.lastFireTime = now;
            }
        }

        this.enemyBullets.forEach(b => {
            if (b.active) {
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

    shoot(targetPos) {
        const bullet = this.enemyBullets.find(b => !b.active);
        if (!bullet) return;

        const muzzlePos = new THREE.Vector3();
        this.turretGroup.children[2].getWorldPosition(muzzlePos); 

        bullet.active = true;
        bullet.mesh.visible = true;
        bullet.life = 4.0; 

        bullet.body.position.set(muzzlePos.x, muzzlePos.y, muzzlePos.z);
        
        const shootDir = new THREE.Vector3().subVectors(targetPos, muzzlePos).normalize();
        bullet.body.velocity.set(
            shootDir.x * this.bulletSpeed,
            shootDir.y * this.bulletSpeed,
            shootDir.z * this.bulletSpeed
        );
    }

    takeDamage(amount) {
        if (this.isDestroyed) return;
        this.health -= amount;
        
        this.group.children[2].material.color.setHex(0xffffff); 
        setTimeout(() => { if (!this.isDestroyed && this.group) this.group.children[2].material.color.setHex(0xff0055); }, 50);

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
