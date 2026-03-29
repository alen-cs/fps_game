import * as THREE from 'three';

export class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        this.poolSize = 150;
        this.particlesData = [];
        
        const geo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
        
        // 【核心优化】：使用 InstancedMesh，将 150 次 Draw Call 降至 1 次
        this.instancedMesh = new THREE.InstancedMesh(geo, mat, this.poolSize);
        this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.instancedMesh);

        this.dummy = new THREE.Object3D();
        this._tempRandom = new THREE.Vector3(); 

        // 初始化数据池，并把所有实例缩放为 0（隐藏）
        for (let i = 0; i < this.poolSize; i++) {
            this.particlesData.push({ velocity: new THREE.Vector3(), life: 0 });
            this.dummy.position.set(0, -1000, 0);
            this.dummy.scale.set(0, 0, 0);
            this.dummy.updateMatrix();
            this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
        }
        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }

    spawnImpact(position, normal) {
        const burstCount = 8;
        for (let i = 0; i < burstCount; i++) {
            const index = this.getFreeParticleIndex();
            if (index === -1) return;

            const p = this.particlesData[index];
            p.life = 0.5 + Math.random() * 0.3;

            this._tempRandom.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
            p.velocity.copy(normal).add(this._tempRandom).normalize().multiplyScalar(4 + Math.random() * 4);

            // 激活该粒子，设置位置并恢复缩放
            this.dummy.position.copy(position);
            this.dummy.scale.set(1, 1, 1);
            this.dummy.updateMatrix();
            this.instancedMesh.setMatrixAt(index, this.dummy.matrix);
        }
        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }

    getFreeParticleIndex() {
        for (let i = 0; i < this.poolSize; i++) {
            if (this.particlesData[i].life <= 0) return i;
        }
        return -1;
    }

    update(delta) {
        const gravity = -9.8;
        let needsUpdate = false;

        for (let i = 0; i < this.poolSize; i++) {
            const p = this.particlesData[i];
            if (p.life > 0) {
                p.life -= delta;
                
                // 取出当前粒子的矩阵数据
                this.instancedMesh.getMatrixAt(i, this.dummy.matrix);
                this.dummy.matrix.decompose(this.dummy.position, this.dummy.quaternion, this.dummy.scale);

                if (p.life <= 0) {
                    // 生命周期结束，缩放归零隐藏
                    this.dummy.scale.set(0, 0, 0);
                } else {
                    // 应用物理重力和速度
                    p.velocity.y += gravity * delta; 
                    this.dummy.position.addScaledVector(p.velocity, delta); 
                }

                // 写回矩阵数据
                this.dummy.updateMatrix();
                this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
                needsUpdate = true;
            }
        }

        // 只要有粒子在运动，就通知 GPU 更新矩阵
        if (needsUpdate) {
            this.instancedMesh.instanceMatrix.needsUpdate = true;
        }
    }
}
