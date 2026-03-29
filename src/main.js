import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

import { Weapon } from './Weapon.js';
import { ParticleSystem } from './Particles.js';
import { Enemy1 } from './Enemy1.js';
import { Enemy2 } from './Enemy2.js';
import { Boss } from './Boss.js';
import { Pickup } from './Pickups.js';

// --- 全局地形高度计算公式 ---
export function getTerrainHeight(x, z) {
    const distFromCenter = Math.sqrt(x * x + z * z);
    if (distFromCenter > 40) {
        // 四周隆起的赛博山脉公式
        return Math.sin(x * 0.1) * Math.cos(z * 0.1) * 6 + (distFromCenter - 40) * 0.3;
    }
    return 0; // 中心平原
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050510);
scene.fog = new THREE.FogExp2(0x050510, 0.025);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// 重力保持，但地面碰撞我们将用坐标动态接管
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -25, 0) }); 

const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0x00ffff, 0.8);
dirLight.position.set(20, 40, 20);
scene.add(dirLight);

// --- 移除物理平面，仅保留视觉地形 ---
const terrainGeo = new THREE.PlaneGeometry(300, 300, 80, 80);
const posAttr = terrainGeo.attributes.position;

for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vy = posAttr.getY(i);
    // 用统一公式生成地形
    posAttr.setZ(i, getTerrainHeight(vx, vy));
}
terrainGeo.computeVertexNormals();

const terrainMat = new THREE.MeshStandardMaterial({ color: 0x070714, roughness: 0.8, metalness: 0.2 });
const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
terrainMesh.rotation.x = -Math.PI / 2;
scene.add(terrainMesh);

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

// --- 大幅提高移速 ---
let isDashing = false;
let dashCooldown = 0;
let dashDuration = 0;
const DASH_SPEED = 45;   // 原为 35
const NORMAL_SPEED = 20; // 原为 10

const particles = new ParticleSystem(scene);
const weapon = new Weapon(camera, scene, particles);
const raycaster = new THREE.Raycaster();

let playerHealth = 100;
let enemies = [];
let pickups = [];
let currentWave = 1;

function spawnWave() {
    const count = currentWave * 2;
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 30 + Math.random() * 10;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        
        const startY = getTerrainHeight(x, z) + 5; // 从空中掉落生成

        if (currentWave >= 5 && i === 0) {
            enemies.push(new Boss(scene, world, new THREE.Vector3(x, startY, z)));
        } else if (currentWave >= 2 && Math.random() > 0.6) {
            enemies.push(new Enemy2(scene, world, new THREE.Vector3(x, startY, z)));
        } else {
            enemies.push(new Enemy1(scene, world, new THREE.Vector3(x, startY, z)));
        }
    }
    
    // 补给物跟随地形高度
    const px = (Math.random()-0.5)*80;
    const pz = (Math.random()-0.5)*80;
    const py = getTerrainHeight(px, pz) + 1;
    pickups.push(new Pickup(scene, Math.random() > 0.5 ? 'HEALTH' : 'AMMO', new THREE.Vector3(px, py, pz)));
    
    updateWaveUI();
}

function updateWaveUI() {
    const el = document.getElementById('wave-info');
    if (el) el.innerText = `WAVE: ${currentWave} | ENEMIES: ${enemies.length}`;
}
spawnWave();

document.addEventListener('mousedown', () => {
    if (controls.isLocked) {
        const result = weapon.fire(raycaster);
        if (result) {
            const { point, object } = result;
            let hitAny = false;
            enemies.forEach(enemy => {
                if (object === enemy.mesh || enemy.mesh.position.distanceTo(point) < 2.5) {
                    enemy.takeDamage(40);
                    hitAny = true;
                }
            });
            if (hitAny) {
                const marker = document.getElementById('hit-marker');
                if (marker) { marker.style.opacity = '1'; setTimeout(() => marker.style.opacity = '0', 100); }
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

        // --- 坐标地面严格判定 (防止穿模 + 解决二段跳) ---
        const playerGroundY = getTerrainHeight(playerBody.position.x, playerBody.position.z);
        let isOnGround = false;
        
        // 0.6 是玩家的球体半径
        if (playerBody.position.y <= playerGroundY + 0.61) {
            playerBody.position.y = playerGroundY + 0.6; // 锁定在地面上方
            if (playerBody.velocity.y < 0) playerBody.velocity.y = 0; // 消除下落速度
            isOnGround = true; // 只有绝对贴地才算在地面
        }

        if (dashCooldown > 0) dashCooldown -= delta;
        if (dashDuration > 0) {
            dashDuration -= delta;
            if (dashDuration <= 0) isDashing = false;
        }

        moveDir.set(0, 0, 0);
        if (keys['KeyW']) moveDir.z -= 1;
        if (keys['KeyS']) moveDir.z += 1;
        if (keys['KeyA']) moveDir.x -= 1;
        if (keys['KeyD']) moveDir.x += 1;

        // 严格地面判定起跳，杜绝二段跳
        if (keys['Space'] && isOnGround) {
            playerBody.velocity.y = 15; // 起跳力度
            isOnGround = false; 
        }

        if (keys['ShiftLeft'] && !isDashing && dashCooldown <= 0 && moveDir.lengthSq() > 0) {
            isDashing = true; dashDuration = 0.2; dashCooldown = 1.0;
        }

        const currentSpeed = isDashing ? DASH_SPEED : NORMAL_SPEED;

        if (moveDir.lengthSq() > 0) {
            moveDir.normalize().multiplyScalar(currentSpeed).applyQuaternion(camera.quaternion);
            playerBody.velocity.x = moveDir.x;
            playerBody.velocity.z = moveDir.z;
        } else if (!isDashing) {
            playerBody.velocity.x = 0;
            playerBody.velocity.z = 0;
        }

        camera.position.set(playerBody.position.x, playerBody.position.y + 0.6, playerBody.position.z);

        weapon.update(delta);
        particles.update(delta);
        
        enemies.forEach(enemy => {
            // 敌人的坐标地面判定，防止卡入山脉
            const eGroundY = getTerrainHeight(enemy.body.position.x, enemy.body.position.z);
            if (enemy.body.position.y <= eGroundY + enemy.halfHeight) {
                enemy.body.position.y = eGroundY + enemy.halfHeight;
                if (enemy.body.velocity.y < 0) enemy.body.velocity.y = 0;
            }

            enemy.update(delta, playerBody.position);
            
            if (enemy.mesh.position.distanceTo(playerBody.position) < 3) {
                playerHealth = Math.max(0, playerHealth - delta * 15);
                const hFill = document.getElementById('health-fill');
                if (hFill) hFill.style.width = playerHealth + '%';
            }
        });

        pickups.forEach(p => {
            p.update(delta);
            if (p.group.position.distanceTo(playerBody.position) < 2) {
                p.isCollected = true;
                scene.remove(p.group);
                if (p.type === 'HEALTH') playerHealth = Math.min(100, playerHealth + 30);
                if (p.type === 'AMMO') weapon.maxAmmo += 60;
                weapon.updateUI();
                const hFill = document.getElementById('health-fill');
                if (hFill) hFill.style.width = playerHealth + '%';
            }
        });

        enemies = enemies.filter(e => !e.isDestroyed);
        pickups = pickups.filter(p => !p.isCollected);

        if (enemies.length === 0) { currentWave++; spawnWave(); }
        if (playerHealth <= 0) { alert("游戏结束！"); location.reload(); }
        
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
