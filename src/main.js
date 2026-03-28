import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { ParticleSystem } from './Particles.js';
import { Enemy } from './Enemy.js';
import { Weapon } from './Weapon.js';

// --- 1. 核心上下文初始化 ---
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a);
scene.fog = new THREE.FogExp2(0x0a0a0a, 0.03); // 加入迷雾增加深邃感

const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

scene.add(camera);

// --- 2. 场景灯光与静态碰撞体 ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(20, 50, 20);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

// 地面
const groundMat = new CANNON.Material();
const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: groundMat });
groundBody.quaternion.setFromEuler(-Math.PI/2, 0, 0);
world.addBody(groundBody);

const gridHelper = new THREE.GridHelper(200, 100, 0x00ff88, 0x111111);
gridHelper.position.y = 0.01;
scene.add(gridHelper);

const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x050505 }));
groundMesh.rotation.x = -Math.PI/2;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

// 随机生成掩体
const boxGeo = new THREE.BoxGeometry(2, 3, 2);
const boxMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
const boxShape = new CANNON.Box(new CANNON.Vec3(1, 1.5, 1));
for(let i = 0; i < 20; i++) {
    const x = (Math.random() - 0.5) * 80;
    const z = (Math.random() - 0.5) * 80;
    if (Math.abs(x) < 5 && Math.abs(z) < 5) continue; // 避开出生点

    const mesh = new THREE.Mesh(boxGeo, boxMat);
    mesh.position.set(x, 1.5, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const body = new CANNON.Body({ mass: 0, shape: boxShape, position: new CANNON.Vec3(x, 1.5, z) });
    world.addBody(body);
}

// --- 3. 玩家实体初始化 ---
const playerMat = new CANNON.Material();
world.addContactMaterial(new CANNON.ContactMaterial(groundMat, playerMat, { friction: 0.0 }));

const playerBody = new CANNON.Body({
    mass: 70, 
    shape: new CANNON.Sphere(0.6), 
    position: new CANNON.Vec3(0, 5, 0),
    material: playerMat,
    fixedRotation: true,
    linearDamping: 0.9 // 极高的空气阻力，使得 WASD 松开即停
});
world.addBody(playerBody);

// --- 4. 系统模块挂载 ---
const particles = new ParticleSystem(scene);
const weapon = new Weapon(camera, scene, particles);
const raycaster = new THREE.Raycaster();

// 生成敌人
const enemies = [];
for(let i=0; i<5; i++) {
    enemies.push(new Enemy(world, scene, new THREE.Vector3((Math.random()-0.5)*40, 2, (Math.random()-0.5)*40 - 20)));
}

// --- 5. 输入控制器与状态 ---
const controls = new PointerLockControls(camera, document.body);
const keys = {};
let mouseDelta = { x: 0, y: 0 };
let stamina = 100;
let canJump = false;

document.addEventListener('keydown', (e) => keys[e.code] = true);
document.addEventListener('keyup', (e) => keys[e.code] = false);
document.addEventListener('mousemove', (e) => { mouseDelta.x = e.movementX; mouseDelta.y = e.movementY; });
document.addEventListener('mousedown', () => { if(controls.isLocked) weapon.fire(raycaster); });

const inst = document.getElementById('instructions');
inst.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => inst.style.display = 'none');
controls.addEventListener('unlock', () => inst.style.display = 'flex');

playerBody.addEventListener('collide', (e) => {
    // 简单的法线判断：如果碰到的物体在下方，说明落地
    const contactNormal = new CANNON.Vec3();
    e.contact.ni.negate(contactNormal);
    if(contactNormal.y > 0.5) canJump = true;
});

// --- 6. 工业级主循环 ---
const clock = new THREE.Clock();
const moveDir = new THREE.Vector3();

function animate() {
    requestAnimationFrame(animate);
    // 限制最大 delta，防止切后台回来后 delta 过大导致穿模
    const delta = Math.min(clock.getDelta(), 0.1); 

    if (controls.isLocked) {
        // 物理引擎步进：固定 1/60 秒，最多追赶 3 帧
        world.step(1/60, delta, 3);

        // -- 玩家移动计算 --
        const isSprinting = keys['ShiftLeft'] && stamina > 0;
        const speed = isSprinting ? 12 : 6;
        
        moveDir.set(0, 0, 0);
        if(keys['KeyW']) moveDir.z -= 1;
        if(keys['KeyS']) moveDir.z += 1;
        if(keys['KeyA']) moveDir.x -= 1;
        if(keys['KeyD']) moveDir.x += 1;

        const isMoving = moveDir.lengthSq() > 0;
        if (isMoving) {
            moveDir.normalize().multiplyScalar(speed).applyQuaternion(camera.quaternion);
            // 手动干预速度，而不是施加力，保证操控的绝对精确性（硬核竞技手感）
            playerBody.velocity.x = moveDir.x;
            playerBody.velocity.z = moveDir.z;
            
            if (isSprinting) stamina = Math.max(0, stamina - delta * 20);
        }
        
        // 耐力恢复与 UI 渲染
        if (!isSprinting && stamina < 100) stamina = Math.min(100, stamina + delta * 15);
        document.getElementById('stamina-fill').style.width = stamina + '%';
        document.body.classList.toggle('sprinting', isSprinting && isMoving); // 触发准星扩大的 CSS 动画

        // 跳跃
        if(keys['Space'] && canJump) {
            playerBody.velocity.y = 6;
            canJump = false;
        }

        // 同步相机（加上人物高度偏移）
        camera.position.set(playerBody.position.x, playerBody.position.y + 0.6, playerBody.position.z);
        // 动态 FOV（冲刺时拉长视角）
        camera.fov = THREE.MathUtils.lerp(camera.fov, isSprinting && isMoving ? 85 : 75, 0.1);
        camera.updateProjectionMatrix();

        // -- 子系统更新 --
        weapon.update(delta, isMoving, isSprinting, mouseDelta);
        mouseDelta.x = 0; mouseDelta.y = 0; // 清空增量

        particles.update(delta);
        enemies.forEach(e => e.update(delta, playerBody.position));
    }

    renderer.render(scene, camera);
}

// 响应窗口大小变化
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();