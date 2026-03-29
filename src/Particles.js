import * as THREE from 'three';

export class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        this.poolSize = 150;
        this.particles = [];
        
        const geo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
        this._tempRandom = new THREE.Vector3(); 

        for (let i = 0; i < this.poolSize; i++) {
            const mesh = new THREE.Mesh(geo, mat);
            mesh.visible = false;
            this.scene.add(mesh);
            this.particles.push({ mesh: mesh, velocity: new THREE.Vector3(), life: 0 });
        }
    }

    spawnImpact(position, normal) {
        const burstCount = 8;
        for (let i = 0; i < burstCount; i++) {
            const p = this.getFreeParticle();
            if (!p) return;

            p.mesh.position.copy(position);
            p.mesh.visible = true;
            p.life = 0.5 + Math.random() * 0.3;

            this._tempRandom.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
            p.velocity.copy(normal).add(this._tempRandom).normalize().multiplyScalar(4 + Math.random() * 4);
        }
    }

    getFreeParticle() {
        for (let i = 0; i < this.poolSize; i++) {
            if (!this.particles[i].mesh.visible) return this.particles[i];
        }
        return null;
    }

    update(delta) {
        const gravity = -9.8;
        for (let i = 0; i < this.poolSize; i++) {
            const p = this.particles[i];
            if (p.mesh.visible) {
                p.life -= delta;
                if (p.life <= 0) {
                    p.mesh.visible = false;
                    continue;
                }
                p.velocity.y += gravity * delta; 
                p.mesh.position.addScaledVector(p.velocity, delta); 
            }
        }
    }
}