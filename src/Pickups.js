import * as THREE from 'three';

export class Pickup {
    constructor(scene, type, pos) {
        this.scene = scene;
        this.type = type; // 'HEALTH' 或 'AMMO'
        this.isCollected = false;

        const color = type === 'HEALTH' ? 0x00ff88 : 0x0088ff;
        this.mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshBasicMaterial({ color: color }));
        this.mesh.position.copy(pos);
        this.scene.add(this.mesh);
        
        this.time = Math.random() * 100; // 用于浮动动画
    }

    update(delta) {
        if (this.isCollected) return;
        this.time += delta * 2;
        // 旋转加漂浮
        this.mesh.rotation.y += delta;
        this.mesh.position.y = 1 + Math.sin(this.time) * 0.2;
    }
}
