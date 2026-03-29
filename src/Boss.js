import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Boss {
    constructor(scene, world, pos) {
        this.scene = scene;
        this.world = world;
        this.health = 500;
        this.isDestroyed = false;
        this.halfHeight = 2.5; 

        this.mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 5, 4), new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xffaa00, emissiveIntensity: 0.2 }));
        this.mesh.position.copy(pos);
        this.scene.add(this.mesh);

        this.body = new CANNON.Body({
            mass: 50, shape: new CANNON.Box(new CANNON.Vec3(2, 2.5, 2)), position: new CANNON.Vec3(pos.x, pos.y, pos.z)
        });
        this.world.addBody(this.body);
    }

    update(delta, safePlayerPosThree) {
        if (this.isDestroyed) return;
        this.mesh.position.set(this.body.position.x, this.body.position.y, this.body.position.z);

        const dir = new THREE.Vector3().subVectors(safePlayerPosThree, this.mesh.position);
        dir.y = 0; dir.normalize();
        
        this.body.velocity.x = dir.x * 2; 
        this.body.velocity.z = dir.z * 2;
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
