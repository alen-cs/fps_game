import * as THREE from 'three';

export class Pickup {
    constructor(scene, type, pos) {
        this.scene = scene;
        this.type = type; 
        this.isCollected = false;

        this.group = new THREE.Group();
        this.group.position.copy(pos);
        this.baseY = pos.y; // 记录生成时的坐标地形高度
        this.scene.add(this.group);

        const color = type === 'HEALTH' ? 0x00ff88 : 0x0088ff;

        const coreGeo = new THREE.OctahedronGeometry(0.25);
        const coreMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.9 });
        this.core = new THREE.Mesh(coreGeo, coreMat);
        this.group.add(this.core);

        const frameGeo = new THREE.IcosahedronGeometry(0.4, 0);
        const frameMat = new THREE.MeshBasicMaterial({ color: color, wireframe: true, transparent: true, opacity: 0.3 });
        this.frame = new THREE.Mesh(frameGeo, frameMat);
        this.group.add(this.frame);

        const glowGeo = new THREE.CircleGeometry(0.5, 16);
        const glowMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.1, side: THREE.DoubleSide });
        this.glow = new THREE.Mesh(glowGeo, glowMat);
        this.glow.rotation.x = Math.PI / 2;
        this.glow.position.y = -0.8;
        this.group.add(this.glow);
        
        this.time = Math.random() * Math.PI * 2; 
    }

    update(delta) {
        if (this.isCollected) return;
        this.time += delta;

        // 浮动基准基于当前地形高度
        const floatY = Math.sin(this.time * 2) * 0.15;
        this.group.position.y = this.baseY + floatY;

        this.core.rotation.y += delta * 2;
        this.core.rotation.z += delta * 0.5;
        this.frame.rotation.y -= delta * 1.5;
        this.frame.rotation.x += delta * 0.8;

        const pulse = (Math.sin(this.time * 4) + 1) / 2;
        this.core.material.opacity = 0.6 + pulse * 0.4;
        this.glow.scale.set(1 + pulse * 0.2, 1 + pulse * 0.2, 1);
        this.glow.material.opacity = 0.05 + pulse * 0.1;
    }
}
