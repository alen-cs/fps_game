import * as THREE from 'three';

export class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        this.particles = [];
        this.geometry = new THREE.BoxGeometry(0.06, 0.06, 0.06);
        this.material = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    }

    spawnImpact(position, normal) {
        for(let i = 0; i < 6; i++) {
            const mesh = new THREE.Mesh(this.geometry, this.material);
            mesh.position.copy(position);
            
            // 简单的粒子飞溅算法
            const velocity = new THREE.Vector3(
                normal.x + (Math.random() - 0.5) * 2,
                normal.y + (Math.random() - 0.5) * 2,
                normal.z + (Math.random() - 0.5) * 2
            ).normalize().multiplyScalar(5 + Math.random() * 5);
            
            this.scene.add(mesh);
            this.particles.push({ mesh, velocity, life: 1.0 });
        }
    }

    update(delta) {
        for(let i = this.particles.length - 1; i >= 0; i--) {
            let p = this.particles[i];
            p.life -= delta * 3; 
            p.mesh.position.addScaledVector(p.velocity, delta);
            
            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                this.particles.splice(i, 1);
            }
        }
    }
}
