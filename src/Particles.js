import * as THREE from 'three';

export class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        this.particles = [];
        
        // 粒子池
        const geo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
        const mat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
        
        for(let i=0; i<50; i++) {
            const mesh = new THREE.Mesh(geo, mat);
            mesh.visible = false;
            this.scene.add(mesh);
            this.particles.push({ mesh: mesh, active: false, velocity: new THREE.Vector3(), life: 0 });
        }
    }

    spawnImpact(point, normal) {
        let count = 0;
        for(let p of this.particles) {
            if(!p.active) {
                p.active = true;
                p.life = 0.5;
                p.mesh.position.copy(point);
                p.mesh.visible = true;
                
                // 随机向法线方向喷射
                p.velocity.copy(normal).multiplyScalar(5);
                p.velocity.x += (Math.random() - 0.5) * 4;
                p.velocity.y += (Math.random() - 0.5) * 4;
                p.velocity.z += (Math.random() - 0.5) * 4;
                
                count++;
                if(count >= 5) break; // 每次撞击产生5个粒子
            }
        }
    }

    update(delta) {
        this.particles.forEach(p => {
            if(p.active) {
                p.mesh.position.addScaledVector(p.velocity, delta);
                p.velocity.y -= delta * 9.8; // 重力
                p.life -= delta;
                if(p.life <= 0) { p.active = false; p.mesh.visible = false; }
            }
        });
    }
}
