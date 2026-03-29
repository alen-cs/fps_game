import * as THREE from 'three';

export class Pickup {
    constructor(scene, type, pos) {
        this.scene = scene;
        this.type = type; // 'HEALTH' 或 'AMMO'
        this.isCollected = false;

        this.group = new THREE.Group();
        this.group.position.copy(pos);
        this.group.position.y = 1; // 初始高度
        this.scene.add(this.group);

        // 根据类型设置颜色
        // 医疗：亮绿色 | 弹药：亮蓝色
        const color = type === 'HEALTH' ? 0x00ff88 : 0x0088ff;

        // 1. 内部核心 (正八面体，更有科技感)
        const coreGeo = new THREE.OctahedronGeometry(0.25);
        const coreMat = new THREE.MeshBasicMaterial({ 
            color: color,
            transparent: true,
            opacity: 0.9
        });
        this.core = new THREE.Mesh(coreGeo, coreMat);
        this.group.add(this.core);

        // 2. 外部框架 (线框球体或立方体)
        const frameGeo = new THREE.IcosahedronGeometry(0.4, 0); // 低多边形球体
        const frameMat = new THREE.MeshBasicMaterial({ 
            color: color, 
            wireframe: true, 
            transparent: true, 
            opacity: 0.3 
        });
        this.frame = new THREE.Mesh(frameGeo, frameMat);
        this.group.add(this.frame);

        // 3. 底部光晕 (一个朝上的圆盘)
        const glowGeo = new THREE.CircleGeometry(0.5, 16);
        const glowMat = new THREE.MeshBasicMaterial({ 
            color: color, 
            transparent: true, 
            opacity: 0.1, 
            side: THREE.DoubleSide 
        });
        this.glow = new THREE.Mesh(glowGeo, glowMat);
        this.glow.rotation.x = Math.PI / 2;
        this.glow.position.y = -0.8; // 贴近地面
        this.group.add(this.glow);
        
        this.time = Math.random() * Math.PI * 2; 
    }

    update(delta) {
        if (this.isCollected) return;

        this.time += delta;

        // --- 动画逻辑 ---
        
        // 1. 整体上下浮动 (正弦波)
        const floatY = Math.sin(this.time * 2) * 0.15;
        this.group.position.y = 1.2 + floatY;

        // 2. 核心与框架交错旋转
        this.core.rotation.y += delta * 2;
        this.core.rotation.z += delta * 0.5;
        
        this.frame.rotation.y -= delta * 1.5;
        this.frame.rotation.x += delta * 0.8;

        // 3. 呼吸灯效果 (通过改变透明度)
        const pulse = (Math.sin(this.time * 4) + 1) / 2; // 0 到 1 之间
        this.core.material.opacity = 0.6 + pulse * 0.4;
        this.glow.scale.set(1 + pulse * 0.2, 1 + pulse * 0.2, 1);
        this.glow.material.opacity = 0.05 + pulse * 0.1;
    }

    // 辅助属性，方便 main.js 获取位置
    get mesh() {
        return this.group;
    }
}
