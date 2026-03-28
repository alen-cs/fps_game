import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { ParticleSystem } from './Particles.js';
import { Enemy } from './Enemy.js';
import { Weapon } from './Weapon.js';

// --- 1. 核心上下文初始化 ---
// 初始化物理世界并设置重力 (Y 轴向下 9.82 m/s²)
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) }); 
const scene = new THREE.Scene(); // 初始化渲染场景
scene.background = new THREE.Color(0x0a0a0a); // 设置深灰背景
scene.fog = new THREE.FogExp2(0x0a0a0a, 0.03); // 添加指数迷雾，掩盖地图边缘

// 初始化透视相机：75度视角，近裁切面 0.1，远裁切面 1000
const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
// 开启抗锯齿，请求高性能独显
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; // 开启全局阴影计算
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // 使用软阴影算法
document.body.appendChild(renderer.domElement); // 将 Canvas 注入 HTML

scene.add(camera);

// --- 2. 场景灯光与静态碰撞体 ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3); // 基础环境光
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 1); // 模拟太阳光的平行光
dirLight.position.set(20, 50, 20); // 光源位置
dirLight.castShadow = true; // 开启光源阴影投影
dirLight.shadow.mapSize.width = 2048; // 提升阴影贴图分辨率
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

// 地面物理与视觉双重创建
const groundMat = new CANNON.Material(); // 创建地面物理材质
const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: groundMat });
groundBody.quaternion.setFromEuler(-Math.PI/2, 0, 0); // 旋转 -90 度使其水平
world.addBody(groundBody);

const gridHelper = new THREE.GridHelper(200, 100, 0x00ff88, 0x111111); // 添加赛博朋克风网格
gridHelper.position.y = 0.01; // 稍微抬高防止 Z-Fighting（与地板闪烁）
scene.add(gridHelper);

const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x050505 }));
groundMesh.rotation.x = -Math.PI/2;
groundMesh.receiveShadow = true; // 允许在地面上渲染其他物体的阴影
scene.add(groundMesh);

// 随机生成 20 个箱子掩体
const boxGeo = new THREE.BoxGeometry(2, 3, 2);
const boxMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
const boxShape = new CANNON.Box(new CANNON.Vec3(1, 1.5, 1)); // CANNON 的长方体是以中心到边界的距离（即尺寸的一半）作为参数的
for(let i = 0; i < 20; i++) {
    const x = (Math.random() - 0.5) * 80;
    const z = (Math.random() - 0.5) * 80;
    if (Math.abs(x) < 5 && Math.abs(z) < 5) continue; // 保护区：避开坐标原点（玩家出生点）

    const mesh = new THREE.Mesh(boxGeo, boxMat);
    mesh.position.set(x, 1.5, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    // 绑定同步的物理碰撞体
    const body = new CANNON.Body({ mass: 0, shape: boxShape, position: new CANNON.Vec3(x, 1.5, z) });
    world.addBody(body);
}

// --- 3. 玩家实体初始化 ---
const playerMat = new CANNON.Material(); // 玩家专属物理材质
// 定义接触材质：玩家和地面之间的摩擦力设为 0，防止卡墙角
world.addContactMaterial(new CANNON.ContactMaterial(groundMat, playerMat, { friction: 0.0 }));

const playerBody = new CANNON.Body({
    mass: 70, 
    shape: new CANNON.Sphere(0.6), // 玩家在物理世界中是一个半径 0.6 的球
    position: new CANNON.Vec3(0, 5, 0), // 出生点在半空中
    material: playerMat,
    fixedRotation: true, // 绝对不准滚动，这会导致视角天地反转
    linearDamping: 0.9 // 松开键盘瞬间减速的核心参数
});
world.addBody(playerBody);

// --- 4. 系统模块挂载 ---
const particles = new ParticleSystem(scene);
const weapon = new Weapon(camera, scene, particles);
const raycaster = new THREE.Raycaster();

const enemies = [];
for(let i=0; i<5; i++) {
    enemies.push(new Enemy(world, scene, new THREE.Vector3((Math.random()-0.5)*40, 2, (Math.random()-0.5)*40 - 20)));
}

// --- 5. 输入控制器与状态 ---
const controls = new PointerLockControls(camera, document.body); // 利用浏览器原生 API 隐藏并锁定鼠标
const keys = {}; // 键盘状态字典
let mouseDelta = { x: 0, y: 0 };
let stamina = 100; // 体力值
let canJump = false; // 是否允许跳跃

// 【Debug 1 修复】预先缓存体力条 DOM 节点，杜绝主循环查找
const uiStaminaFill = document.getElementById('stamina-fill');
const uiInst = document.getElementById('instructions');

// 事件监听器：按键按下设为 true，松开设为 false
document.addEventListener('keydown', (e) => keys[e.code] = true);
document.addEventListener('keyup', (e) => keys[e.code] = false);
// 记录鼠标的相对移动像素值，供武器 sway 使用
document.addEventListener('mousemove', (e) => { mouseDelta.x = e.movementX; mouseDelta.y = e.movementY; });
// 点击左键时，如果鼠标已经被锁定在屏幕内，则开火
document.addEventListener('mousedown', () => { if(controls.isLocked) weapon.fire(raycaster); });

// 点击提示屏幕请求鼠标锁
uiInst.addEventListener('click', () => controls.lock());
// 监听到系统完成鼠标锁定后，隐藏提示 UI
controls.addEventListener('lock', () => uiInst.style.display = 'none');
controls.addEventListener('unlock', () => uiInst.style.display = 'flex');

// 物理碰撞回调，用来检测是否落地（恢复跳跃权限）
playerBody.addEventListener('collide', (e) => {
    const contactNormal = new CANNON.Vec3();
    e.contact.ni.negate(contactNormal); // 获取碰撞接触点的法线
    if(contactNormal.y > 0.5) canJump = true; // 如果法线朝上，说明碰到了地面或箱子顶部
});

// --- 6. 工业级主循环 ---
const clock = new THREE.Clock(); // 计时器
const moveDir = new THREE.Vector3(); // 预分配移动计算向量

function animate() {
    requestAnimationFrame(animate); // 递归调用自身渲染下一帧
    
    // 【关键】限制单帧时间不超过 0.1s。如果不限制，玩家切回其他网页很久再回来，delta 会巨大，导致穿模
    const delta = Math.min(clock.getDelta(), 0.1); 

    if (controls.isLocked) { // 只有处于游戏状态才更新逻辑
        // 物理引擎步进推进时间：固定计算频率 60Hz，允许追赶最多 3 次子步
        world.step(1/60, delta, 3);

        // 【Debug 3 修复】虚空死区检测：如果玩家掉出边界，将其传送回天空
        if (playerBody.position.y < -20) {
            playerBody.position.set(0, 5, 0);
            playerBody.velocity.set(0, 0, 0); // 清空下坠速度
        }

        // -- 玩家移动计算 --
        const isSprinting = keys['ShiftLeft'] && stamina > 0; // 判断冲刺
        const speed = isSprinting ? 12 : 6;
        
        moveDir.set(0, 0, 0); // 重置方向向量
        if(keys['KeyW']) moveDir.z -= 1; // W 向前
        if(keys['KeyS']) moveDir.z += 1;
        if(keys['KeyA']) moveDir.x -= 1; // A 向左
        if(keys['KeyD']) moveDir.x += 1;

        const isMoving = moveDir.lengthSq() > 0;
        if (isMoving) {
            // 将按键的局部方向向量，结合相机的旋转（四元数）转为世界绝对方向
            moveDir.normalize().multiplyScalar(speed).applyQuaternion(camera.quaternion);
            
            // 将计算出的力直接覆盖给刚体的 X 和 Z 轴速度，实现无延迟极速响应
            playerBody.velocity.x = moveDir.x;
            playerBody.velocity.z = moveDir.z;
            
            // 扣除体力
            if (isSprinting) stamina = Math.max(0, stamina - delta * 20);
        }
        
        // 耐力恢复逻辑
        if (!isSprinting && stamina < 100) stamina = Math.min(100, stamina + delta * 15);
        // 更新体力 UI 宽度
        uiStaminaFill.style.width = stamina + '%';
        // 控制准星缩放 CSS 类
        document.body.classList.toggle('sprinting', isSprinting && isMoving);

        // 跳跃逻辑
        if(keys['Space'] && canJump) {
            playerBody.velocity.y = 6; // 给予向上的瞬间速度
            canJump = false; // 在落地碰撞触发前禁止再次跳跃
        }

        // 第一人称核心：将渲染相机的坐标强行绑定到物理球体的中心，并加上 0.6 的身高偏移
        camera.position.set(playerBody.position.x, playerBody.position.y + 0.6, playerBody.position.z);
        
        // 动态 FOV：冲刺时将视野从 75 逐渐拉宽到 85，增强速度感
        const targetFov = isSprinting && isMoving ? 85 : 75;
        if (Math.abs(camera.fov - targetFov) > 0.1) {
            camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.1);
            camera.updateProjectionMatrix(); // FOV 改变后必须更新投影矩阵
        }

        // -- 子系统更新 --
        weapon.update(delta, isMoving, isSprinting, mouseDelta);
        mouseDelta.x = 0; mouseDelta.y = 0; // 消费完鼠标增量后必须清零

        particles.update(delta); // 推进粒子运算
        enemies.forEach(e => e.update(delta, playerBody.position)); // 推进 AI 运算
    }

    renderer.render(scene, camera); // 调用 GPU 进行最终画面绘制
}

// 监听窗口缩放事件，动态调整画布比例，防止画面拉伸变形
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate(); // 启动引擎！
