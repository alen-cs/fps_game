import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Enemy1 {
    constructor(scene, world, pos) {
        this.scene = scene;
        this.world = world;
        this.health = 100;
        this.isDestroyed = false;
        this.halfHeight = 1; 

        this.mesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2, 1.5), new THREE.MeshStandardMaterial({ color: 0xff0055, emissive: 0xff0055, emissiveIntensity: 0.2 }));
        this.mesh.position.copy(pos);
        this.scene.add(this.mesh);

        this.body = new CANNON.Body({
            mass: 5, shape: new CANNON.Box(new CANNON.Vec3(0.75, 1, 0.75)), position: new CANNON.Vec3(pos.x, pos.y, pos.z)
        });
        this.world.addBody(this.body);
    }

    update(delta, safePlayerPosThree) {
        if (this.isDestroyed) return;
        // 安全坐标同步
        this.mesh.position.set(this.body.position.x, this.body.position.y, this.body.position.z);

        const dir = new THREE.Vector3().subVectors(safePlayerPosThree, this.mesh.position);
        dir.y = 0; dir.normalize();
        
        this.body.velocity.x = dir.x * 4;
        this.body.velocity.z = dir.z * 4;
    }

    takeDamage(amount) {
        if (this.isDestroyed) return;
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
