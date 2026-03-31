import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Enemy1 {
    constructor(scene, world, pos) {
        this.scene = scene;
        this.world = world;
        this.health = 100;
        this.isDestroyed = false;
        this.halfHeight = 0.8; // 整体物理高度调整

        // ========== 1. 赛博无人战车建模 ==========
        this.group = new THREE.Group();
        this.group.position.copy(pos);
        this.scene.add(this.group);

        // 材质定义
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.6, metalness: 0.7 }); // 深蓝灰金属
        const trackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }); // 深黑履带
        const glowMat = new THREE.MeshBasicMaterial({ color: 0xff0055 }); // 敌方霓虹红

        // 1.1 履带底盘 (左/右)
        const trackGeo = new THREE.BoxGeometry(0.4, 0.5, 1.8);
        const leftTrack = new THREE.Mesh(trackGeo, trackMat);
        leftTrack.position.set(0.6, 0.25, 0);
        const rightTrack = leftTrack.clone();
        rightTrack.position.x = -0.6;
        
        // 履带上的发光装饰
        const trackLightGeo = new THREE.BoxGeometry(0.05, 0.1, 1.9);
        const tl1 = new THREE.Mesh(trackLightGeo, glowMat);
        tl1.position.set(0.81, 0.25, 0);
        const tl2 = tl1.clone();
        tl2.position.x = -0.81;
        this.group.add(leftTrack, rightTrack, tl1, tl2);

        // 1.2 主车体
        const bodyGeo = new THREE.BoxGeometry(1.0, 0.4, 1.5);
        const body = new THREE.Mesh(bodyGeo, metalMat);
        body.position.y = 0.5;
        this.group.add(body);

        // 1.3 可旋转炮塔组
        this.turretGroup = new THREE.Group();
        this.turretGroup.position.y = 0.7; // 放在车体上方
        this.group.add(this.turretGroup);

        const turretGeo = new THREE.CylinderGeometry(0.5, 0.6, 0.4, 8);
        const turret = new THREE.Mesh(turretGeo, metalMat);
        this.turretGroup.add(turret);

        // 枪管
        const gunGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.8, 8);
        const gun = new THREE.Mesh(gunGeo, metalMat);
        gun.rotation.x = -Math.PI / 2; // 横放
        gun.position.set(0, 0.1, -0.6); // 向前伸出
        this.turretGroup.add(gun);

        // 枪管发光口
        const muzzleGlowGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.05, 8);
        const muzzleGlow = new THREE.Mesh(muzzleGlowGeo, glowMat);
        muzzleGlow.rotation.x = -Math.PI / 2;
        muzzleGlow.position.set(0, 0.1, -1.0);
        this.turretGroup.add(muzzleGlow);

        // 适配 main.js 的 mesh 引用 (用于射线检测)
        this.mesh = body; // 射线打中车体算数
        this.mesh.enemyParent = this; // 反向引用

        // ========== 2. 物理重构 (改为 Box 适配 UGV 外形) ==========
        this.body = new CANNON.Body({
            mass: 15, // 战车较重
            shape: new CANNON.Box(new CANNON.Vec3(0.8, 0.7, 0.9)), // 整体物理碰撞盒
            position: new CANNON.Vec3(pos.x, pos.y, pos.z),
            linearDamping: 0.5,
            angularDamping: 0.9 // 防止战车乱滚
        });
        this.world.addBody(this.body);

        // ========== 3. 战斗系统参数 ==========
        this.state = 'CHASE'; // CHASE, ATTACK
        this.fireRate = 2.5; // 射速：2.5秒一发 (较低)
        this.lastFireTime = 0;
        this.bulletSpeed = 30; // 敌方子弹速度 (较低，可躲避)
        
        // 敌人子弹池
        this.enemyBullets = [];
        for (let i = 0; i < 3; i++) { // 同时存在的子弹不多
            const bGeo = new THREE.SphereGeometry(0.15, 8, 8);
            const bMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            const bMesh = new THREE.Mesh(bGeo, bMat);
            bMesh.visible = false;
            this.scene.add(bMesh);
            
            // 敌方子弹物理 (用 Sphere)
            const bBody = new CANNON.Body({
                mass: 0.1,
                shape: new CANNON.Sphere(0.15),
                collisionFilterGroup: 2, // 敌方弹药组
                collisionFilterMask: 1, // 只与玩家(组1)碰撞
            });
            bBody.isTrigger = true; // 设置为触发器，main.js 手动处理伤害
            this.world.addBody(bBody);
            
            this.enemyBullets.push({ mesh: bMesh, body: bBody, active: false, life: 0 });
        }
    }

    update(delta, safePlayerPosThree) {
        if (this.isDestroyed) return;

        // 同步物理坐标
        this.group.position.set(this.body.position.x, this.body.position.y, this.body.position.z);
        // 车体始终保持水平（履带贴地），不需要同步物理旋转，除非你想做翻车效果

        // 计算与玩家距离和方向
        const toPlayer = new THREE.Vector3().subVectors(safePlayerPosThree, this.group.position);
        const dist = toPlayer.length();
        
        // ========== AI 状态机 ==========
        if (dist > 25) {
            this.state = 'CHASE';
        } else if (dist < 20) {
            this.state = 'ATTACK';
        }

        if (this.state === 'CHASE') {
            // --- 追逐模式：底盘转向并移动 ---
            toPlayer.y = 0;
            toPlayer.normalize();

            // 底盘转向 (平滑 Lerp)
            const targetQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), toPlayer);
            this.group.quaternion.slerp(targetQuaternion, delta * 3);

            // 履带战车移速 5
            this.body.velocity.x = toPlayer.x * 5;
            this.body.velocity.z = toPlayer.z * 5;
            
            // 炮塔归位
            this.turretGroup.quaternion.slerp(new THREE.Quaternion(), delta * 2);

        } else if (this.state === 'ATTACK') {
            // --- 攻击模式：停下，炮塔瞄准并射击 ---
            this.body.velocity.x *= 0.9; // 减速
            this.body.velocity.z *= 0.9;

            // 炮塔世界坐标系下的瞄准方向
            const turretWorldPos = new THREE.Vector3();
            this.turretGroup.getWorldPosition(turretWorldPos);
            const aimDir = new THREE.Vector3().subVectors(safePlayerPosThree, turretWorldPos).normalize();

            // 将目标方向转换到本地空间以便设置旋转
            this.group.worldToLocal(aimDir); 
            // 忽略垂直方向偏差，只做水平旋转
            const localAimDirY0 = new THREE.Vector3(aimDir.x, 0, aimDir.z).normalize();

            const targetTurretQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), localAimDirY0);
            this.turretGroup.quaternion.slerp(targetTurretQuaternion, delta * 5); // 炮塔旋转较快

            // 射击逻辑
            const now = performance.now() / 1000;
            if (now - this.lastFireTime > this.fireRate) {
                this.shoot(safePlayerPosThree);
                this.lastFireTime = now;
            }
        }

        // 更新自身生成的子弹
        this.enemyBullets.forEach(b => {
            if (b.active) {
                b.mesh.position.set(b.body.position.x, b.body.position.y, b.body.position.z);
                b.life -= delta;
                if (b.life <= 0) {
                    b.active = false;
                    b.mesh.visible = false;
                    b.body.position.set(0, -100, 0); // 移除战场
                }
            }
        });
    }

    shoot(targetPos) {
        // 寻找空闲子弹
        const bullet = this.enemyBullets.find(b => !b.active);
        if (!bullet) return;

        // 子弹起始位置（枪口）
        const muzzlePos = new THREE.Vector3();
        this.turretGroup.children[2].getWorldPosition(muzzlePos); // 枪管世界坐标

        bullet.active = true;
        bullet.visible = true;
        bullet.mesh.visible = true;
        bullet.life = 4.0; // 子弹存活4秒

        bullet.body.position.set(muzzlePos.x, muzzlePos.y, muzzlePos.z);
        
        // 计算预判？不，低速无人机直射即可
        const shootDir = new THREE.Vector3().subVectors(targetPos, muzzlePos).normalize();
        
        bullet.body.velocity.set(
            shootDir.x * this.bulletSpeed,
            shootDir.y * this.bulletSpeed,
            shootDir.z * this.bulletSpeed
        );
    }

    takeDamage(amount) {
        if (this.isDestroyed) return;
        this.health -= amount;
        
        // 战车受伤霓虹闪烁
        this.group.children[2].material.color.setHex(0xffffff); // 霓虹条变白
        setTimeout(() => { if (!this.isDestroyed && this.group) this.group.children[2].material.color.setHex(0xff0055); }, 50);

        if (this.health <= 0) {
            this.destroy();
        }
    }

    destroy() {
        this.isDestroyed = true;
        this.scene.remove(this.group);
        this.world.removeBody(this.body);
        
        // 清理自身子弹物理体
        this.enemyBullets.forEach(b => {
            this.world.removeBody(b.body);
            this.scene.remove(b.mesh);
        });
    }
}
