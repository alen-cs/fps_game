import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

import { Weapon } from './Weapon.js';
import { ParticleSystem } from './Particles.js';
import { Enemy1 } from './Enemy1.js';
import { Enemy2 } from './Enemy2.js';
import { Boss } from './Boss.js';
import { Pickup } from './Pickups.js';

console.log("%c 🚀 主程序已加载！", "color: #00ff00; font-weight: bold;");

// --- 场景与物理初始化 ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050510);
scene.fog = new THREE.FogExp2(0x050510, 0.025);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -25, 0) }); // 调高了重力，让跳跃手感更扎实

// 灯光
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0x00ffff, 0.8);
dirLight.position.set(20, 40, 20);
scene.add(dirLight);

// 地面物理
const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

// --- 优化地形逻辑 ---
const terrainGeo = new THREE.PlaneGeometry(300, 300, 80, 80);
const posAttr = terrainGeo.attributes.position;

// 用数学公式生成四周高、中间平的赛博地形
for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vy = posAttr.getY(i);
    const distFromCenter = Math.sqrt(vx * vx + vy * vy);
    
    if (distFromCenter > 40) {
        // 边缘生成波浪山脉
        const z = Math.sin(vx * 0.1) * Math.cos(vy * 0.1) * 6 + (distFromCenter - 40) * 0.3;
        posAttr.setZ(i, z);
    }
}
terrainGeo.computeVertexNormals();

const terrainMat = new THREE.MeshStandardMaterial({
    color: 0x070714,
    roughness: 0.8,
    metalness: 0.2,
    wireframe: false
});

const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
terrainMesh.rotation.x = -Math.PI / 2;
scene.add(terrainMesh);

// 加上发光的网格线，赛博味拉满
const terrainWireframe = new THREE.Mesh(
    terrainGeo, 
    new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true, transparent: true, opacity: 0.15 })
);
terrainWireframe.rotation.x = -Math.PI / 2;
scene.add(terrainWireframe);


// 玩家物理
const playerBody = new CANNON.Body({
    mass: 70, shape: new CANNON.Sphere(0.6), position: new CANNON.Vec3(0, 2, 0), fixedRotation: true, linearDamping: 0.9
});
world.addBody(playerBody);

const controls = new PointerLockControls(camera, document.body);
const instructions = document.getElementById('instructions');
instructions.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => instructions.style.display = 'none');
controls.addEventListener('unlock', () => instructions.style.display = 'flex');

let keys = {};
document.addEventListener('keydown', (e) => { keys[e.code] = true; if(e.code === 'KeyR') weapon.reload(); });
document.addEventListener('keyup', (e) => keys[e.code] = false);

// --- 动作控制变量 ---
let isDashing = false;
let dashCooldown = 0;
let dashDuration = 0;
const DASH_SPEED = 35;
const NORMAL_SPEED = 10;

// 核心系统实例
const particles = new ParticleSystem(scene);
const weapon = new Weapon(camera, scene, particles);
const raycaster = new THREE.Raycaster();

let playerHealth = 100;
let enemies = [];
let pickups = [];
let currentWave = 1;

// 刷怪系统
function spawnWave() {
    const count = currentWave * 2;
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 30 + Math.random() * 10;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        
        if (currentWave >= 5 && i === 0) {
            enemies.push(new Boss(scene, world, new THREE.Vector3(x, 2, z)));
        } else if (currentWave >= 2 && Math.random() > 0.6) {
            enemies.push(new Enemy2(scene, world, new THREE.Vector3(x, 1, z)));
        } else {
            enemies.push(new Enemy1(scene, world, new THREE.Vector3(x, 1, z)));
        }
    }
    
    pickups.push(new Pickup(scene, Math.random() > 0.5 ? 'HEALTH' : 'AMMO', new THREE.Vector3((Math.random()-0.5)*40, 1, (Math.random()-0.5)*40)));
    updateWaveUI();
}

function updateWaveUI() {
    const el = document.getElementById('wave-info');
    if (el) el.innerText = `WAVE: ${currentWave} | ENEMIES: ${enemies.length}`;
}

spawnWave();

// 射击命中判定
document.addEventListener('mousedown', () => {
    if (controls.isLocked) {
        const result = weapon.fire(raycaster);
        if (result) {
            const { point, object } = result;
            let hitAny = false;

            enemies.forEach(enemy => {
                const dist = enemy.mesh.position.distanceTo(point);
                if (object === enemy.mesh || dist < 2.5) {
                    enemy.takeDamage(40);
                    hitAny = true;
                }
            });

            if (hitAny) {
                const marker = document.getElementById('hit-marker');
                if (marker) {
                    marker.style.opacity = '1';
                    setTimeout(() => marker.style.opacity = '0', 100);
                }
            }
        }
    }
});

const clock = new THREE.Clock();
const moveDir = new THREE.Vector3();

function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);

    if (controls.isLocked) {
        world.step(1/60, delta, 3);

        // 处理冲刺冷却
        if (dashCooldown > 0) dashCooldown -= delta;
        if (dashDuration > 0) {
            dashDuration -= delta;
            if (dashDuration <= 0) isDashing = false;
        }

        // 玩家移动
        moveDir.set(0, 0, 0);
        if (keys['KeyW']) moveDir.z -= 1;
        if (keys['KeyS']) moveDir.z += 1;
        if (keys['KeyA']) moveDir.x -= 1;
        if (keys['KeyD']) moveDir.x += 1;

        // 跳跃 (通过判定垂直速度是否接近 0，粗略代表玩家在地面上)
        const isOnGround = Math.abs(playerBody.velocity.y) < 0.1;
        if (keys['Space'] && isOnGround) {
            playerBody.velocity.y = 10; // 跳跃向上初速度
        }

        // 冲刺
        if (keys['ShiftLeft'] && !isDashing && dashCooldown <= 0 && moveDir.lengthSq() > 0) {
            isDashing = true;
            dashDuration = 0.2;
            dashCooldown = 1.0;
        }

        const currentSpeed = isDashing ? DASH_SPEED : NORMAL_SPEED;

        if (moveDir.lengthSq() > 0) {
            moveDir.normalize().multiplyScalar(currentSpeed).applyQuaternion(camera.quaternion);
            playerBody.velocity.x = moveDir.x;
            playerBody.velocity.z = moveDir.z;
        } else {
            if (!isDashing) {
                playerBody.velocity.x = 0;
                playerBody.velocity.z = 0;
            }
        }

        camera.position.set(playerBody.position.x, playerBody.position.y + 0.6, playerBody.position.z);

        // 更新组件
        weapon.update(delta);
        particles.update(delta);
        
        // 更新敌人
        enemies.forEach(enemy => {
            enemy.update(delta, playerBody.position);
            if (enemy.mesh.position.distanceTo(playerBody.position) < 3) {
                playerHealth = Math.max(0, playerHealth - delta * 10);
                const hFill = document.getElementById('health-fill');
                if (hFill) hFill.style.width = playerHealth + '%';
            }
        });

        // 更新拾取物
        pickups.forEach(p => {
            p.update(delta);
            if (p.mesh.position.distanceTo(playerBody.position) < 2) {
                p.isCollected = true;
                scene.remove(p.mesh);
                if (p.type === 'HEALTH') playerHealth = Math.min(100, playerHealth + 30);
                if (p.type === 'AMMO') weapon.maxAmmo += 60;
                weapon.updateUI();
                const hFill = document.getElementById('health-fill');
                if (hFill) hFill.style.width = playerHealth + '%';
            }
        });

        enemies = enemies.filter(enemy => !enemy.isDestroyed);
        pickups = pickups.filter(p => !p.isCollected);

        if (enemies.length === 0) {
            currentWave++;
            spawnWave();
        }

        if (playerHealth <= 0) {
            alert("游戏结束！");
            location.reload();
        }
        updateWaveUI();
    }
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
