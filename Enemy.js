import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Enemy {
    constructor(world, scene, startPos) {
        this.world = world;
        this.scene = scene;
        this.speed = 4;
        this.state = 'IDLE'; // IDLE, CHASE, DEAD
        this.health = 100;

        // --- 视觉模型 (悬浮机械眼风格) ---
        this.group = new THREE.Group();
        
        const coreGeo = new THREE.OctahedronGeometry(0.5, 0);
        const coreMat = new THREE.MeshStandardMaterial({ color: 0xff2222, metalness: 0.8, roughness: 0.2 });
        this.mesh = new THREE.Mesh(coreGeo, coreMat);
        this.mesh.castShadow = true;
        
        // 增加一个外侧光环
        const ringGeo = new THREE.TorusGeometry(0.8, 0.05, 8, 24);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        this.ring = new THREE.Mesh(ringGeo, ringMat);
        this.ring.rotation.x = Math.PI / 2;

        this.group.add(this.mesh, this.ring);
        this.scene.add(this.group);

        // --- 物理刚体 ---
        // 使用球体作为检测与碰撞体，质量适中使得能够被子弹推开
        this.body = new CANNON.Body({
            mass: 20,
            shape: new CANNON.Sphere(0.6),
            position: new CANNON.Vec3(startPos.x, startPos.y, startPos.z),
            linearDamping: 0.9 // 增加阻尼防止像冰球一样滑行
        });
        // 限制旋转，让模型靠代码控制朝向
        this.body.fixedRotation = true;
        this.world.addBody(this.body);

        // 给模型打上标签供射线检测
        this.group.userData = { isEnemy: true, ref: this };
        this.mesh.userData = { isEnemy: true, ref: this };
    }

    takeDamage(amount, hitDir) {
        if (this.state === 'DEAD') return;
        
        this.health -= amount;
        // 受击物理击退反馈
        this.body.velocity.x += hitDir.x * 5;
        this.body.velocity.z += hitDir.z * 5;

        // 受击视觉闪烁
        this.mesh.material.color.setHex(0xffffff);
        setTimeout(() => { if(this.state !== 'DEAD') this.mesh.material.color.setHex(0xff2222); }, 100);

        if (this.health <= 0) {
            this.die();
        }
    }

    die() {
        this.state = 'DEAD';
        this.mesh.material.color.setHex(0x333333);
        this.ring.visible = false;
        // 死亡后失去质量，掉落地面
        this.body.mass = 0;
        this.body.velocity.set(0, 0, 0);
    }

    update(delta, playerPos) {
        // 同步物理位置到视觉模型
        this.group.position.copy(this.body.position);
        
        if (this.state === 'DEAD') return;

        // 视觉旋转动画
        this.mesh.rotation.y += delta;
        this.ring.rotation.z += delta * 2;

        // --- AI 状态机逻辑 ---
        const distSq = this.body.position.distanceToSquared(playerPos);
        
        // 如果玩家进入探测半径 (20单位)，开始追击
        if (distSq < 400 && distSq > 4) {
            this.state = 'CHASE';
            
            // 计算朝向玩家的单位向量
            const dirX = playerPos.x - this.body.position.x;
            const dirZ = playerPos.z - this.body.position.z;
            const length = Math.sqrt(dirX * dirX + dirZ * dirZ);
            
            if (length > 0) {
                // 施加速度
                this.body.velocity.x = (dirX / length) * this.speed;
                this.body.velocity.z = (dirZ / length) * this.speed;
            }
        } else {
            this.state = 'IDLE';
            this.body.velocity.x *= 0.9;
            this.body.velocity.z *= 0.9;
        }
    }
}