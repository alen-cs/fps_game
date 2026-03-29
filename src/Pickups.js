import * as THREE from 'three';

export class Pickup {
    constructor(scene, type, position) {
        this.scene = scene;
        this.type = type; 
        this.isCollected = false;

        const color = type === 'HEALTH' ? 0x00ff88 : 0x0088ff;
        
        this.group = new THREE.Group();
        this.group.position.copy(position);
        
        const boxGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const boxMat = new THREE.MeshStandardMaterial({ color: color, transparent: true, opacity: 0.5, wireframe: true });
        this.box = new THREE.Mesh(boxGeo, boxMat);
        
        const coreGeo = new THREE.OctahedronGeometry(0.2);
        const coreMat = new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 0.5 });
        this.core = new THREE.Mesh(coreGeo, coreMat);
        
        this.group.add(this.box, this.core);
        this.scene.add(this.group);

        this.baseY = position.y;
        this.time = Math.random() * 100; 
    }

    update(delta) {
        if (this.isCollected) return;
        this.time += delta * 2;
        
        this.group.position.y = this.baseY + Math.sin(this.time) * 0.2;
        this.box.rotation.y += delta;
        this.box.rotation.x += delta * 0.5;
        this.core.rotation.y -= delta * 2;
    }

    collect() {
        this.isCollected = true;
        this.scene.remove(this.group);
        this.box.geometry.dispose();
        this.box.material.dispose();
        this.core.geometry.dispose();
        this.core.material.dispose();
    }
}