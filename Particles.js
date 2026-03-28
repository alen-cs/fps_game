import * as THREE from 'three';

export class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        this.poolSize = 150;
        this.particles = [];
        this.activeCount = 0;

        // 预分配材质和几何体以节省显存
        const geo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });

        for (let i = 0; i < this.poolSize; i++) {
            const mesh = new THREE.Mesh(geo, mat);
            mesh.visible = false;
            this.scene.add(mesh);
            this.particles.push({
                mesh: mesh,
                velocity: new THREE.Vector3(),
                life: 0
            });
        }
    }

    // 触发击中火花爆发
    spawnImpact(position, normal) {
        const burstCount = 8;
        for (let i = 0; i < burstCount; i++) {
            const p = this.getFreeParticle();
            if (!p) return;

            p.mesh.position.copy(position);
            p.mesh.visible = true;
            p.life = 0.5 + Math.random() * 0.3; // 存活 0.5~0.8 秒

            // 基于法线生成半球形随机反弹速度
            const randomDir = new THREE.Vector3(
                Math.random() - 0.5,
                Math.random() - 0.5,
                Math.random() - 0.5
            ).normalize();
            
            // 将速度偏向法线方向
            p.velocity.copy(normal).add(randomDir).normalize().multiplyScalar(4 + Math.random() * 4);
        }
    }

    getFreeParticle() {
        for (let i = 0; i < this.poolSize; i++) {
            if (!this.particles[i].mesh.visible) {
                return this.particles[i];
            }
        }
        return null; // 池已满
    }

    update(delta) {
        const gravity = new THREE.Vector3(0, -9.8, 0);
        for (let i = 0; i < this.poolSize; i++) {
            const p = this.particles[i];
            if (p.mesh.visible) {
                p.life -= delta;
                if (p.life <= 0) {
                    p.mesh.visible = false;
                    continue;
                }
                // 运动学更新：应用重力
                p.velocity.addScaledVector(gravity, delta);
                p.mesh.position.addScaledVector(p.velocity, delta);
            }
        }
    }
}