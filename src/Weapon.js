import * as THREE from 'three';

export class Weapon {
    constructor(camera, scene, particles) {
        this.camera = camera;
        this.scene = scene;
        this.particles = particles;

        // 武器数据
        this.ammo = 30;
        this.maxAmmo = 120;
        this.fireRate = 0.1; // 射速（秒）
        this.lastFireTime = 0;
        this.isReloading = false;

        // --- 1. 构建枪械模型 ---
        this.weaponGroup = new THREE.Group();
        
        // 枪身 (深灰色)
        const bodyGeo = new THREE.BoxGeometry(0.1, 0.15, 0.4);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.castShadow = true;
        
        // 枪管 (黑色)
        const barrelGeo = new THREE.BoxGeometry(0.04, 0.04, 0.3);
        const barrelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
        this.barrel = new THREE.Mesh(barrelGeo, barrelMat);
        this.barrel.position.set(0, 0.03, -0.3); // 枪管凸出
        this.barrel.castShadow = true;

        // 瞄具 (发光点)
        const sightGeo = new THREE.BoxGeometry(0.02, 0.04, 0.02);
        const sightMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const sight = new THREE.Mesh(sightGeo, sightMat);
        sight.position.set(0, 0.09, -0.1);

        this.weaponGroup.add(body);
        this.weaponGroup.add(this.barrel);
        this.weaponGroup.add(sight);

        // 【关键】将枪械绑定到摄像机，并放在屏幕右下方
        this.basePosition = new THREE.Vector3(0.25, -0.25, -0.5);
        this.weaponGroup.position.copy(this.basePosition);
        this.camera.add(this.weaponGroup); // 加到相机里，而不是 scene 里

        // 枪械晃动参数
        this.swayTime = 0;

        // --- 2. 枪口火焰 (Muzzle Flash) ---
        const flashGeo = new THREE.PlaneGeometry(0.25, 0.25);
        const flashMat = new THREE.MeshBasicMaterial({ 
            color: 0xffaa00, 
            transparent: true, 
            opacity: 0, 
            side: THREE.DoubleSide,
            depthWrite: false
        });
        this.muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
        this.muzzleFlash.position.set(0, 0.03, -0.5); // 位于枪管正前方
        this.muzzleFlash.rotation.y = Math.PI / 2;
        this.weaponGroup.add(this.muzzleFlash);

        // --- 3. 子弹弹道池 (Tracers) ---
        // 预先创建 10 条弹道线，循环使用，避免内存垃圾
        this.tracers = [];
        for (let i = 0; i < 10; i++) {
            const geo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0), 
                new THREE.Vector3(0, 0, -1)
            ]);
            const mat = new THREE.LineBasicMaterial({ color: 0xffeebb, transparent: true, opacity: 0 });
            const line = new THREE.Line(geo, mat);
            // 给弹道打个标签，防止射线检测射到自己的子弹
            line.isTracer = true; 
            this.scene.add(line);
            this.tracers.push({ mesh: line, life: 0 });
        }

        // 初始化 UI
        this._updateAmmoUI(`${this.ammo} / ${this.maxAmmo}`);
    }

    _updateAmmoUI(text) {
        // 如果网页上还没有专门的子弹 UI，我们动态创建一个
        let ammoDiv = document.getElementById('ammo-info');
        if (!ammoDiv) {
            ammoDiv = document.createElement('div');
            ammoDiv.id = 'ammo-info';
            ammoDiv.style.position = 'absolute';
            ammoDiv.style.bottom = '20px';
            ammoDiv.style.right = '30px';
            ammoDiv.style.fontSize = '32px';
            ammoDiv.style.fontWeight = 'bold';
            ammoDiv.style.fontFamily = 'monospace';
            ammoDiv.style.color = '#fff';
            ammoDiv.style.textShadow = '2px 2px 4px #000';
            ammoDiv.style.zIndex = '10';
            document.body.appendChild(ammoDiv);
        }
        ammoDiv.innerText = `AMMO: ${text}`;
    }

    update(delta, isMoving, isSprinting, mouseDelta) {
        // 1. 枪械随步伐摇摆 (Bobbing)
        if (isMoving && !this.isReloading) {
            const speed = isSprinting ? 14 : 8;
            this.swayTime += delta * speed;
            this.weaponGroup.position.x = this.basePosition.x + Math.sin(this.swayTime) * 0.015;
            this.weaponGroup.position.y = this.basePosition.y + Math.abs(Math.cos(this.swayTime)) * 0.02;
        } else {
            // 平滑恢复原位
            this.weaponGroup.position.lerp(this.basePosition, delta * 5);
        }

        // 2. 后座力恢复 (平滑降低枪口)
        this.weaponGroup.rotation.x = THREE.MathUtils.lerp(this.weaponGroup.rotation.x, 0, delta * 15);
        this.weaponGroup.position.z = THREE.MathUtils.lerp(this.weaponGroup.position.z, this.basePosition.z, delta * 15);

        // 3. 枪口火焰消散
        if (this.muzzleFlash.material.opacity > 0) {
            this.muzzleFlash.material.opacity -= delta * 15;
            this.muzzleFlash.scale.setScalar(this.muzzleFlash.material.opacity * 1.5);
        }

        // 4. 更新子弹弹道
        for (let tracer of this.tracers) {
            if (tracer.life > 0) {
                tracer.life -= delta;
                tracer.mesh.material.opacity = tracer.life * 10; // 快速褪色
                if (tracer.life <= 0) {
                    tracer.mesh.material.opacity = 0;
                }
            }
        }
    }

    fire(raycaster) {
        if (this.ammo <= 0 || this.isReloading) {
            if (this.ammo <= 0) this.reload(); // 没子弹自动换弹
            return;
        }
        
        const now = performance.now() / 1000;
        if (now - this.lastFireTime < this.fireRate) return; // 限制射速
        this.lastFireTime = now;

        this.ammo--;
        this._updateAmmoUI(`${this.ammo} / ${this.maxAmmo}`);

        // --- 视觉反馈：后座力与枪口火焰 ---
        this.weaponGroup.rotation.x += 0.05 + Math.random() * 0.02; // 枪口上跳
        this.weaponGroup.position.z += 0.08; // 枪身后退
        
        this.muzzleFlash.material.opacity = 1;
        this.muzzleFlash.rotation.z = Math.random() * Math.PI; // 随机旋转火焰

        // --- 射线检测与弹道生成 ---
        // 从屏幕中心发出射线
        raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        
        // 获取真实世界中枪管前端的坐标（作为弹道起点）
        const barrelWorldPos = new THREE.Vector3();
        this.barrel.getWorldPosition(barrelWorldPos);

        const intersects = raycaster.intersectObjects(this.scene.children, true);
        let hitPoint = null;

        for (let i = 0; i < intersects.length; i++) {
            const obj = intersects[i].object;
            // 忽略枪械自身和弹道线
            if (obj !== this.weaponGroup && !obj.isTracer && obj !== this.muzzleFlash) {
                hitPoint = intersects[i].point;
                const normal = intersects[i].face ? intersects[i].face.normal : new THREE.Vector3(0,1,0);
                
                // 在击中点生成火花粒子
                this.particles.spawnImpact(hitPoint, normal);

                // --- 伤害逻辑判断 ---
                // 如果击中对象的 userData 里存了敌人的引用，则扣血
                // （假设你的 Enemy 类有 takeDamage 方法，你可以根据实际情况调整）
                if (obj.userData && obj.userData.enemyRef && typeof obj.userData.enemyRef.takeDamage === 'function') {
                     obj.userData.enemyRef.takeDamage(25);
                }
                break;
            }
        }

        // 如果没有打中任何东西，把弹道终点设在极远处的空中
        if (!hitPoint) {
            hitPoint = raycaster.ray.at(100, new THREE.Vector3());
        }

        // 绘制真实的曳光弹轨迹
        this.showTracer(barrelWorldPos, hitPoint);
    }

    showTracer(startPoint, endPoint) {
        // 从池子里找一根空闲的弹道线
        let tracer = this.tracers.find(t => t.life <= 0);
        if (!tracer) return;

        tracer.life = 0.08; // 弹道存在时间极短，模拟子弹初速极快
        tracer.mesh.material.opacity = 1;
        
        // 瞬间修改顶点坐标
        const positions = tracer.mesh.geometry.attributes.position.array;
        positions[0] = startPoint.x; positions[1] = startPoint.y; positions[2] = startPoint.z;
        positions[3] = endPoint.x;   positions[4] = endPoint.y;   positions[5] = endPoint.z;
        tracer.mesh.geometry.attributes.position.needsUpdate = true;
    }

    reload() {
        if (this.isReloading || this.ammo === 30 || this.maxAmmo <= 0) return;
        
        this.isReloading = true;
        this._updateAmmoUI(`RELOADING...`);

        // 换弹动作：枪管向下压
        let reloadTicks = 0;
        const reloadAnim = setInterval(() => {
            this.weaponGroup.rotation.x -= 0.05;
            reloadTicks++;
            if (reloadTicks > 15) clearInterval(reloadAnim);
        }, 16);

        // 等待 1.5 秒后完成换弹
        setTimeout(() => {
            const needed = 30 - this.ammo;
            const toReload = Math.min(needed, this.maxAmmo);
            this.ammo += toReload;
            this.maxAmmo -= toReload;
            this.isReloading = false;
            this._updateAmmoUI(`${this.ammo} / ${this.maxAmmo}`);
            
            // 瞬间把枪抬回来
            this.weaponGroup.rotation.x = 0;
        }, 1500);
    }
}
