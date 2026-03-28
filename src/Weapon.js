import * as THREE from 'three';

export class Weapon {
    constructor(camera, scene, particles) {
        this.camera = camera; // 玩家视角相机
        this.scene = scene; // 场景
        this.particles = particles; // 注入粒子系统
        
        this.group = new THREE.Group(); // 武器整体模型组
        this.basePos = new THREE.Vector3(0.35, -0.3, -0.6); // 武器在屏幕右下角的基准坐标
        this.recoil = 0; // 当前后坐力偏移值
        this.bob = 0; // 跑动时的呼吸摇晃相位
        this.ammo = 30; // 当前子弹数
        this.maxAmmo = 120; // 备弹数
        this.lastFireTime = 0; // 上次开火的时间戳，用于控制射速
        this.fireRate = 100; // 射速限制：100 毫秒

        // 【Debug 1 修复】缓存 DOM 节点，避免高频查询
        this.uiAmmo = document.querySelector('.ammo');

        // 【Debug 2 修复】预分配射线计算所需的向量，避免垃圾回收
        this._tempHitDir = new THREE.Vector3();
        this._tempNormal = new THREE.Vector3();

        this._buildModel(); // 构建几何体

        // 枪口动态闪光灯
        this.flash = new THREE.PointLight(0xffaa00, 0, 5);
        this.flash.position.set(0, 0.05, -0.6);
        this.group.add(this.flash);

        this.camera.add(this.group); // 将武器绑定到相机上（实现第一人称视角）
        this.group.position.copy(this.basePos); // 放置在基准位
    }

    _buildModel() {
        // 创建枪身、枪管、瞄准镜等几何体和材质
        const matBody = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.2 });
        const matBarrel = new THREE.MeshStandardMaterial({ color: 0x050505, metalness: 1.0 });
        const matAccent = new THREE.MeshStandardMaterial({ color: 0x00ff88, emissive: 0x003311 });

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.5), matBody);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8), matBarrel);
        barrel.rotation.x = Math.PI / 2; // 旋转枪管使其水平
        barrel.position.set(0, 0.02, -0.4); 
        
        const scope = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.15), matAccent);
        scope.position.set(0, 0.1, -0.1);

        // ★ 核心技巧：将武器所有组件分配到 Layer 1
        // 因为射线默认只检测 Layer 0，这能防止射出的子弹打中自己的枪管
        body.layers.set(1);
        barrel.layers.set(1);
        scope.layers.set(1);

        this.group.add(body, barrel, scope);
    }

    update(delta, isMoving, isSSprint, mouseDelta) {
        // 计算基于正弦波的武器摇晃（Sway / Bobbing）
        if (isMoving) {
            const speedMultiplier = isSSprint ? 1.8 : 1.0; // 冲刺时晃动加剧
            this.bob += delta * 12 * speedMultiplier; // 推进正弦波相位
            // Y 轴使用 sin 画出上下起伏
            this.group.position.y = this.basePos.y + Math.sin(this.bob) * 0.015 * speedMultiplier;
            // X 轴使用 0.5 倍频的 cos 画出左右摆动，合成一个 ∞ 字型轨迹
            this.group.position.x = this.basePos.x + Math.cos(this.bob * 0.5) * 0.01 * speedMultiplier;
        }

        // 鼠标视角拖拽导致的武器反向惯性偏移
        this.group.position.x -= mouseDelta.x * 0.0002;
        this.group.position.y += mouseDelta.y * 0.0002;

        // 后坐力恢复：利用线性插值（lerp）让后坐力平滑趋于 0
        this.recoil = THREE.MathUtils.lerp(this.recoil, 0, 0.15);
        this.group.position.z = this.basePos.z + this.recoil; // Z 轴控制枪支前后推移
        
        // 让枪支的 XY 轴也通过插值平滑回归基准点
        this.group.position.x = THREE.MathUtils.lerp(this.group.position.x, this.basePos.x + (isMoving ? Math.cos(this.bob*0.5)*0.01 : 0), 0.1);
        this.group.position.y = THREE.MathUtils.lerp(this.group.position.y, this.basePos.y + (isMoving ? Math.sin(this.bob)*0.015 : 0), 0.1);

        // 射击火光指数衰减
        if (this.flash.intensity > 0) this.flash.intensity -= delta * 80;
    }

    fire(raycaster) {
        const now = performance.now(); // 获取系统当前毫秒级时间
        // 如果没子弹，或者距离上次射击间隔小于 fireRate，拒绝开火
        if (this.ammo <= 0 || now - this.lastFireTime < this.fireRate) return;

        this.lastFireTime = now; // 记录开火时间
        this.ammo--; // 消耗弹药
        this.recoil = 0.12; // 瞬间增加后坐力数值（向后顶出 0.12 单位）
        this.flash.intensity = 15; // 瞬间点亮枪口火光

        // 使用缓存的 UI 对象直接更新文字
        this.uiAmmo.innerText = `${this.ammo} / ${this.maxAmmo}`;

        // 从屏幕正中心发射射线（0, 0 代表设备坐标系的屏幕中央）
        raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        raycaster.layers.set(0); // 确保射线只跟世界环境碰撞
        // true 代表开启递归检测子对象
        const hits = raycaster.intersectObjects(this.scene.children, true);

        if (hits.length > 0) {
            const hit = hits[0]; // 获取离相机最近的击中点
            const object = hit.object; // 击中的 3D 实体

            // 检查 userData，如果击中的是敌人
            if (object.userData && object.userData.isEnemy) {
                const enemyRef = object.userData.ref; // 提取绑定的 Enemy 类实例
                
                // 【Debug 2 修复】使用缓存的向量计算击退方向
                this._tempHitDir.subVectors(hit.point, this.camera.position).normalize();
                this._tempHitDir.y = 0; // 将 Y 轴动量抹平，防止敌人飞上天
                
                enemyRef.takeDamage(25, this._tempHitDir); // 造成 25 点伤害并传入击退向量
                
                // 取模型表面的法线，如果模型没有正确生成法线，默认朝上
                const norm = hit.face ? hit.face.normal : this._tempNormal.set(0,1,0);
                this.particles.spawnImpact(hit.point, norm); // 喷洒粒子
            } else {
                // 击中环境（墙壁、地板）
                if (hit.face) {
                    // 获取击中面的法线，并将其转换到世界坐标系（应对物体本身被旋转过的情况）
                    this._tempNormal.copy(hit.face.normal).transformDirection(object.matrixWorld);
                } else {
                    this._tempNormal.set(0, 1, 0);
                }
                this.particles.spawnImpact(hit.point, this._tempNormal); // 喷洒粒子
            }
        }
    }
}
