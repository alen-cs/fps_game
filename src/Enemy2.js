import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Enemy2 {
    constructor(scene, world, pos) {
        this.scene = scene;
        this.world = world;
        this.health = 60; // 血量薄
        this.isDestroyed = false;

        // 蓝色，体积小
        this.mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1.5, 1), new THREE.MeshStandardMaterial({ color: 0x00aaff, emissive: 0x00aaff, emissiveIntensity: 0.2 }));
        this.mesh.position.copy(pos);
        this.scene.add(this.mesh);

        this.body = new CANNON.Body({
            mass: 3, shape: new CANNON.Box(new CANNON.Vec3(0.5, 0.75, 0.5)), position: new CANNON.Vec3(pos.x, pos.y, pos.z)
        });
        this.world.addBody(this.body);
    }

    update(delta, playerPos) {
        if (this.isDestroyed) return;
        this.mesh.position.copy(this.body.position);

        const dir = new THREE.Vector3().subVectors(playerPos, this.mesh.position);
        dir.y = 0; dir.normalize();
        this.body.velocity.x = dir.x * 8; // 速度快！
        this.body.velocity.z = dir.z * 8;
    }

    takeDamage(amount) {
        this.health -= amount;
        this.mesh.material.emissiveIntensity = 1;
        setTimeout(() => { if (this.mesh) this.mesh.material.emissiveIntensity = 0.2; }, 50);

        if (this.health <= 0) {
            this.isDestroyed = true;
            this.scene.remove(this.mesh);
            this.world.removeBody(this.body);
        }
    }
}
