// filepath: src/Enemy.js
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Enemy {
    constructor(world, scene, startPos) {
        this.world = world;
        this.scene = scene;
        this.speed = 4;
        this.state = 'IDLE'; 
        this.health = 100;

        this.group = new THREE.Group();
        const coreGeo = new THREE.OctahedronGeometry(0.5, 0);
        const coreMat = new THREE.MeshStandardMaterial({ color: 0xff2222, metalness: 0.8, roughness: 0.2 });
        this.mesh = new THREE.Mesh(coreGeo, coreMat);
        this.mesh.castShadow = true;
        
        const ringGeo = new THREE.TorusGeometry(0.8, 0.05, 8, 24);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        this.ring = new THREE.Mesh(ringGeo, ringMat);
        this.ring.rotation.x = Math.PI / 2;

        this.group.add(this.mesh, this.ring);
        this.scene.add(this.group);

        this.body = new CANNON.Body({
            mass: 20,
            shape: new CANNON.Sphere(0.6),
            position: new CANNON.Vec3(startPos.x, startPos.y, startPos.z),
            linearDamping: 0.9 
        });
        this.body.fixedRotation = true;
        this.world.addBody(this.body);

        this.group.userData = { isEnemy: true, ref: this };
        this.mesh.userData = { isEnemy: true, ref: this };
    }

    takeDamage(amount, hitDir) {
        if (this.state === 'DEAD') return;
        
        this.health -= amount;
        this.body.velocity.x += hitDir.x * 5;
        this.body.velocity.z += hitDir.z * 5;

        this.mesh.material.color.setHex(0xffffff);
        setTimeout(() => { if(this.state !== 'DEAD') this.mesh.material.color.setHex(0xff2222); }, 100);

        if (this.health <= 0) this.die();
    }

    die() {
        this.state = 'DEAD';
        this.mesh.material.color.setHex(0x333333);
        this.ring.visible = false;
        this.body.mass = 0;
        this.body.velocity.set(0, 0, 0);
    }

    update(delta, playerPos) {
        this.group.position.copy(this.body.position);
        if (this.state === 'DEAD') return;

        this.mesh.rotation.y += delta;
        this.ring.rotation.z += delta * 2;

        // 【Bug 修复点】：直接进行数学运算，绕开 CANNON.Vec3 方法名兼容性问题
        const dx = playerPos.x - this.body.position.x;
        const dy = playerPos.y - this.body.position.y;
        const dz = playerPos.z - this.body.position.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        
        if (distSq < 400 && distSq > 4) {
            this.state = 'CHASE';
            const length = Math.sqrt(dx * dx + dz * dz);
            if (length > 0) {
                this.body.velocity.x = (dx / length) * this.speed;
                this.body.velocity.z = (dz / length) * this.speed;
            }
        } else {
            this.state = 'IDLE';
            this.body.velocity.x *= 0.9;
            this.body.velocity.z *= 0.9;
        }
    }
}
