import * as THREE from 'three'; // 引入 Three.js 核心库

export class ParticleSystem {
    constructor(scene) {
        this.scene = scene; // 接收并保存场景对象，用于添加粒子模型
        this.poolSize = 150; // 定义对象池大小，同时存在最多 150 个粒子
        this.particles = []; // 存储所有粒子数据的数组
        
        // 预分配材质和几何体（避免重复创建导致显存溢出）
        const geo = new THREE.BoxGeometry(0.04, 0.04, 0.04); // 创建一个小立方体几何体
        const mat = new THREE.MeshBasicMaterial({ color: 0xffaa00 }); // 创建自发光的橙色材质

        // 【Debug 2 修复】预分配用于数学计算的临时向量，拒绝在循环中 new 对象
        this._tempRandom = new THREE.Vector3(); 

        // 循环创建对象池中的粒子
        for (let i = 0; i < this.poolSize; i++) {
            const mesh = new THREE.Mesh(geo, mat); // 实例化网格模型
            mesh.visible = false; // 初始状态隐藏，不参与渲染
            this.scene.add(mesh); // 将其提前加入场景
            
            // 将粒子的逻辑数据与渲染模型绑定存入数组
            this.particles.push({
                mesh: mesh, // 渲染网格
                velocity: new THREE.Vector3(), // 粒子的当前速度向量
                life: 0 // 粒子的剩余生命周期
            });
        }
    }

    // 触发火花的方法（接收命中位置和表面的法线方向）
    spawnImpact(position, normal) {
        const burstCount = 8; // 每次命中爆发 8 个粒子
        for (let i = 0; i < burstCount; i++) {
            const p = this.getFreeParticle(); // 从池中获取一个休眠的粒子
            if (!p) return; // 如果池子空了（满屏都是粒子），直接放弃生成

            p.mesh.position.copy(position); // 将粒子位置移动到命中点
            p.mesh.visible = true; // 开启渲染
            p.life = 0.5 + Math.random() * 0.3; // 随机赋予 0.5 到 0.8 秒的寿命

            // 【Debug 2 修复】使用复用的临时向量生成随机偏移方向
            this._tempRandom.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
            
            // 速度方向 = 表面法线方向 + 随机发散方向，并赋予 4~8 的随机初速度
            p.velocity.copy(normal).add(this._tempRandom).normalize().multiplyScalar(4 + Math.random() * 4);
        }
    }

    // 遍历寻找未使用的粒子
    getFreeParticle() {
        for (let i = 0; i < this.poolSize; i++) {
            if (!this.particles[i].mesh.visible) { // 只要不可见就认为是空闲的
                return this.particles[i];
            }
        }
        return null; // 全部在使用中
    }

    // 在主循环中每帧调用，更新粒子位置
    update(delta) {
        const gravity = -9.8; // 定义重力标量
        for (let i = 0; i < this.poolSize; i++) {
            const p = this.particles[i];
            if (p.mesh.visible) { // 只处理活跃的粒子
                p.life -= delta; // 扣除生命周期
                if (p.life <= 0) { // 如果寿命耗尽
                    p.mesh.visible = false; // 隐藏粒子，将其交还给对象池
                    continue; // 跳过当前循环，不计算物理
                }
                // 运动学更新：速度 Y 轴受重力影响减小 (v = v0 + at)
                p.velocity.y += gravity * delta; 
                // 位置受速度影响变化 (p = p0 + vt)
                p.mesh.position.addScaledVector(p.velocity, delta); 
            }
        }
    }
}
