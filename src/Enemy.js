import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Enemy {
    constructor(world, scene, startPos) {
        this.world = world; // 物理引擎世界引用
        this.scene = scene; // 渲染场景引用
        this.speed = 4; // 敌人的移动速度
        this.state = 'IDLE'; // 初始状态为待机
        this.health = 100; // 敌人生命值

        // --- 视觉模型搭建 ---
        this.group = new THREE.Group(); // 创建容器组，方便整体移动
        
        // 核心几何体：八面体
        const coreGeo = new THREE.OctahedronGeometry(0.5, 0); 
        const coreMat = new THREE.MeshStandardMaterial({ color: 0xff2222, metalness: 0.8, roughness: 0.2 });
        this.mesh = new THREE.Mesh(coreGeo, coreMat); 
        this.mesh.castShadow = true; // 允许产生阴影
        
        // 外围光环：圆环面
        const ringGeo = new THREE.TorusGeometry(0.8, 0.05, 8, 24);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        this.ring = new THREE.Mesh(ringGeo, ringMat);
        this.ring.rotation.x = Math.PI / 2; // 将圆环放平

        this.group.add(this.mesh, this.ring); // 将核心和光环组合
        this.scene.add(this.group); // 添加到场景

        // --- 物理刚体搭建 ---
        this.body = new CANNON.Body({
            mass: 20, // 质量 20kg
            shape: new CANNON.Sphere(0.6), // 碰撞体积为一个半径 0.6 的球
            position: new CANNON.Vec3(startPos.x, startPos.y, startPos.z), // 初始位置
            linearDamping: 0.9 // 线性阻尼，防止受力后像在冰面上一样滑行
        });
        this.body.fixedRotation = true; // 锁定物理旋转，只由代码控制视觉旋转
        this.world.addBody(this.body); // 加入物理世界

        // 将实例的引用绑定到模型的 userData 上，供射线检测命中时反向查找调用
        this.group.userData = { isEnemy: true, ref: this };
        this.mesh.userData = { isEnemy: true, ref: this };
    }

    // 承受伤害的逻辑
    takeDamage(amount, hitDir) {
        if (this.state === 'DEAD') return; // 鞭尸无效
        
        this.health -= amount; // 扣血
        // 物理击退反馈：给刚体施加瞬间速度
        this.body.velocity.x += hitDir.x * 5; 
        this.body.velocity.z += hitDir.z * 5;

        // 视觉反馈：瞬间变白
        this.mesh.material.color.setHex(0xffffff);
        // 100毫秒后如果不处于死亡状态，变回红色
        setTimeout(() => { if(this.state !== 'DEAD') this.mesh.material.color.setHex(0xff2222); }, 100);

        if (this.health <= 0) this.die(); // 血量归零触发死亡
    }

    die() {
        this.state = 'DEAD'; // 切换状态
        this.mesh.material.color.setHex(0x333333); // 变成废铁色
        this.ring.visible = false; // 隐藏光环
        this.body.mass = 0; // 质量设为 0（在 Cannon.js 中代表变为静止物体，不再受重力和碰撞移动）
        this.body.velocity.set(0, 0, 0); // 动量清零
    }

    // 每帧调用的 AI 更新逻辑
    update(delta, playerPos) {
        // 【Debug 3 修复】坠落检测，掉出地图直接判定死亡
        if (this.body.position.y < -10 && this.state !== 'DEAD') this.die();

        // 核心：物理模型位置同步给视觉模型
        this.group.position.copy(this.body.position); 
        
        if (this.state === 'DEAD') return; // 如果死了，不执行后续 AI 寻路

        // 视觉旋转动画，让模型看起来在工作
        this.mesh.rotation.y += delta;
        this.ring.rotation.z += delta * 2;

        // 计算与玩家的各轴距离
        const dx = playerPos.x - this.body.position.x;
        const dy = playerPos.y - this.body.position.y;
        const dz = playerPos.z - this.body.position.z;
        const distSq = dx * dx + dy * dy + dz * dz; // 距离的平方（比开根号性能好）
        
        // 视野检测：距离在 2 到 20 之间（平方 4 到 400）
        if (distSq < 400 && distSq > 4) {
            this.state = 'CHASE'; // 切换追击状态
            const length = Math.sqrt(dx * dx + dz * dz); // 计算水平面的绝对距离
            if (length > 0) {
                // 赋予朝向玩家的速度（仅 X 和 Z 轴）
                this.body.velocity.x = (dx / length) * this.speed;
                this.body.velocity.z = (dz / length) * this.speed;
            }
        } else {
            this.state = 'IDLE'; // 玩家走远，切换待机状态
            // 速度指数衰减，平滑停下
            this.body.velocity.x *= 0.9;
            this.body.velocity.z *= 0.9;
        }
    }
}
