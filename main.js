import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// --- 1. 初始化物理世界 ---
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
// 物理材质：减少滑动
const contactMaterial = new CANNON.ContactMaterial(
    new CANNON.Material('ground'), 
    new CANNON.Material('player'), 
    { friction: 0.0 }
);
world.addContactMaterial(contactMaterial);

// --- 2. 初始化渲染世界 ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// 灯光
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const sunLight = new THREE.DirectionalLight(0xffffff, 1);
sunLight.position.set(10, 20, 10);
sunLight.castShadow = true;
scene.add(sunLight);

// --- 3. 创建玩家物理体 ---
const playerRadius = 0.5;
const playerBody = new CANNON.Body({
    mass: 60,
    shape: new CANNON.Sphere(playerRadius),
    position: new CANNON.Vec3(0, 5, 0),
    fixedRotation: true,
});
world.addBody(playerBody);

// --- 4. 创建地面与障碍物 ---
const groundGeo = new THREE.PlaneGeometry(100, 100);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
const groundMesh = new THREE.Mesh(groundGeo, groundMat);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

const groundBody = new CANNON.Body({ shape: new CANNON.Plane(), mass: 0 });
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

// --- 5. 控制逻辑 ---
const controls = new PointerLockControls(camera, document.body);
const instructions = document.getElementById('instructions');

instructions.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => instructions.style.display = 'none');
controls.addEventListener('unlock', () => instructions.style.display = 'flex');

let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, canJump = false;
const inputVelocity = new THREE.Vector3();

const onKeyDown = (e) => {
    switch(e.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyD': moveRight = true; break;
        case 'Space': if(canJump) playerBody.velocity.y = 5; canJump = false; break;
    }
};
const onKeyUp = (e) => {
    switch(e.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyD': moveRight = false; break;
    }
};
document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);

// 碰撞检测判断是否在地面
playerBody.addEventListener('collide', () => canJump = true);

// --- 6. 游戏循环 ---
const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);
    
    if (controls.isLocked) {
        world.fixedStep(); // 推进物理模拟

        // 计算移动矢量
        inputVelocity.set(0, 0, 0);
        if (moveForward) inputVelocity.z -= 1;
        if (moveBackward) inputVelocity.z += 1;
        if (moveLeft) inputVelocity.x -= 1;
        if (moveRight) inputVelocity.x += 1;

        inputVelocity.normalize().multiplyScalar(10).applyQuaternion(camera.quaternion);
        
        // 应用到物理身体 (保持 Y 轴速度即重力)
        playerBody.velocity.x = inputVelocity.x;
        playerBody.velocity.z = inputVelocity.z;

        // 同步相机到物理身体
        camera.position.set(playerBody.position.x, playerBody.position.y + 0.5, playerBody.position.z);
    }

    renderer.render(scene, camera);
}

// 窗口自适应
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();