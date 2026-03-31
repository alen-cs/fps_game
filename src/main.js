import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

import { Weapon } from './Weapon.js';
import { ParticleSystem } from './Particles.js';
import { Enemy1 } from './Enemy1.js';
import { Enemy2 } from './Enemy2.js';
import { Boss } from './Boss.js';
import { Pickup } from './Pickups.js';
import { Shop } from './Shop.js';

// ========== 1. 全局配置与地形 ==========
export function getTerrainHeight(x, z) {
    const distFromCenter = Math.sqrt(x * x + z * z);
    if (distFromCenter > 40) {
        return Math.sin(x * 0.1) * Math.cos(z * 0.1) * 6 + (distFromCenter - 40) * 0.3;
    }
    return 0; 
}

// 物理碰撞组（修复了之前的变量提升错误）
const FILTER_PLAYER = 1;
const FILTER_PLAYER_BULLET = 2;
const FILTER_ENEMY = 4;
const FILTER_ENEMY_BULLET = 8;
const FILTER_GROUND = 16;
const PICKUP_GROUP = 32;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050510);
scene.fog = new THREE.FogExp2(0x050510, 0.025);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -25, 0) }); 

const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0x00ffff, 0.8);
dirLight.position.set(20, 40, 20);
scene.add(dirLight);

const terrainGeo = new THREE.PlaneGeometry(300, 300, 80, 80);
const posAttr = terrainGeo.attributes.position;
for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vy = posAttr.getY(i);
    posAttr.setZ(i, getTerrainHeight(vx, vy));
}
terrainGeo.computeVertexNormals();

const terrainMat = new THREE.MeshStandardMaterial({ color: 0x070714, roughness: 0.8, metalness: 0.2 });
const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
terrainMesh.rotation.x = -Math.PI / 2;
scene.add(terrainMesh);

// ========== 2. 玩家与控制器 ==========
const playerBody = new CANNON.Body({
    mass: 70, shape: new CANNON.Sphere(0.6), position: new CANNON.Vec3(0, 2, 0), fixedRotation: true, linearDamping: 0.9,
    collisionFilterGroup: FILTER_PLAYER,
    collisionFilterMask: FILTER_ENEMY | FILTER_ENEMY_BULLET | FILTER_GROUND | PICKUP_GROUP
});
world.addBody(playerBody);

const controls = new PointerLockControls(camera, document.body);
const instructions = document.getElementById('instructions');
if (instructions) {
    instructions.addEventListener('click', () => { if (!shop.isOpen) controls.lock(); });
    controls.addEventListener('lock', () => { instructions.style.display = 'none'; shop.isOpen = false; });
    controls.addEventListener('unlock', () => { if (!shop.isOpen) instructions.style.display = 'flex'; });
}

// ========== 3. 游戏状态与核心模块 ==========
let playerState = { health: 100, points: 0 }; 
const particles = new ParticleSystem(scene);
const weapon = new Weapon(camera, scene, particles);
const shop = new Shop(playerState, weapon, controls);
const raycaster = new THREE.Raycaster();

let enemies = [];
let currentWave = 1;
let keys = {};

// 事件监听
document.addEventListener('keydown', (e) => { 
    keys[e.code] = true; 
    if(e.code === 'KeyR') weapon.reload(); 
    if(e.code === 'KeyB') shop.toggle(); 
});
document.addEventListener('keyup', (e) => keys[e.code] = false);
document.addEventListener('contextmenu', e => e.preventDefault());

let isMouseDown = false;
document.addEventListener('mousedown', (e) => {
    if (shop.isOpen) return; 
    if (e.button === 2) { weapon.aim(true); } 
    else if (e.button === 0 && controls.isLocked) { isMouseDown = true; handleShooting(); } 
});
document.addEventListener('mouseup', (e) => {
    if (e.button === 2) weapon.aim(false); 
    if (e.button === 0) isMouseDown = false;
});

// ========== 4. 核心逻辑 ==========
function handleShooting() {
    if (!controls.isLocked) return;
    const result = weapon.fire(raycaster);
    if (result) {
        const { point, object, damage } = result;
        let hitAny = false;
        
        enemies.forEach(enemy => {
            const isHit = object && (object === enemy.mesh || (enemy.group && enemy.group.children.includes(object)) || (enemy.turretGroup && enemy.turretGroup.children.includes(object)));
            
            if (isHit || enemy.mesh.position.distanceTo(point) < 2.5) {
                const wasAlive = enemy.health > 0; 
                enemy.takeDamage(damage); 
                if (wasAlive && enemy.health <= 0) {
                    playerState.health = Math.min(100, playerState.health + 2); 
                    playerState.points += 100; 
                    weapon.updateUI();
                    updateUIState();
                }
                hitAny = true;
            }
        });
        
        if (hitAny) {
            const marker = document.getElementById('hit-marker');
            if (marker) { marker.style.opacity = '1'; setTimeout(() => marker.style.opacity = '0', 100); }
        }
    }
}

function updateUIState() {
    const hFill = document.getElementById('health-fill');
    if (hFill) hFill.style.width = playerState.health + '%';
    const waveEl = document.getElementById('wave-info');
    if (waveEl) waveEl.innerText = `WAVE: ${currentWave} | ENEMIES: ${enemies.length} | PTS: ${playerState.points}`;
}

function spawnWave() {
    const count = currentWave * 2;
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 30 + Math.random() * 10;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const startY = getTerrainHeight(x, z) + 5; 

        if (currentWave >= 5 && i === 0) enemies.push(new Boss(scene, world, new THREE.Vector3(x, startY, z)));
        else if (currentWave >= 1 && Math.random() > 0.4) enemies.push(new Enemy1(scene, world, new THREE.Vector3(x, startY, z)));
        else enemies.push(new Enemy2(scene, world, new THREE.Vector3(x, startY, z)));
    }
    updateUIState();
}
spawnWave();

let isDashing = false;
let dashCooldown = 0;
let dashDuration = 0;
const moveDir = new THREE.Vector3();
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);

    if (controls.isLocked) {
        if (isMouseDown && weapon.arsenal[weapon.currentWeaponIndex].fireRate < 0.2) handleShooting(); // 处理全自动连发
        
        world.step(1/60, delta, 3);
        const playerGroundY = getTerrainHeight(playerBody.position.x, playerBody.position.z);
        let isOnGround = false;
        if (playerBody.position.y <= playerGroundY + 0.61) {
            playerBody.position.y = playerGroundY + 0.6; 
            if (playerBody.velocity.y < 0) playerBody.velocity.y = 0; 
            isOnGround = true; 
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

        if (keys['Space'] && isOnGround) { playerBody.velocity.y = 15; isOnGround = false; }
        if (keys['ShiftLeft'] && !isDashing && dashCooldown <= 0 && moveDir.lengthSq() > 0) {
            isDashing = true; dashDuration = 0.2; dashCooldown = 1.0;
        }

        const currentSpeed = isDashing ? 45 : (weapon.isAiming ? 10 : 20); 
        if (moveDir.lengthSq() > 0) {
            moveDir.normalize().multiplyScalar(currentSpeed).applyQuaternion(camera.quaternion);
            playerBody.velocity.x = moveDir.x; playerBody.velocity.z = moveDir.z;
        } else if (!isDashing) { playerBody.velocity.x = 0; playerBody.velocity.z = 0; }

        camera.position.set(playerBody.position.x, playerBody.position.y + 0.6, playerBody.position.z);

        weapon.update(delta);
        particles.update(delta);
        
        const playerPosThree = new THREE.Vector3(playerBody.position.x, playerBody.position.y, playerBody.position.z);

        enemies.forEach(enemy => {
            const eGroundY = getTerrainHeight(enemy.body.position.x, enemy.body.position.z);
            if (enemy.body.position.y <= eGroundY + enemy.halfHeight) {
                enemy.body.position.y = eGroundY + enemy.halfHeight;
                if (enemy.body.velocity.y < 0) enemy.body.velocity.y = 0;
            }

            enemy.update(delta, playerPosThree); 
            
            // 战车压人判定
            if (enemy.group && enemy.group.position.distanceTo(playerPosThree) < 2.5) {
                playerState.health = Math.max(0, playerState.health - delta * 30);
                updateUIState();
            }

            // 处理敌人发射的子弹
            if (enemy.enemyBullets) {
                enemy.enemyBullets.forEach(b => {
                    if (b.active) {
                        const bPos = new THREE.Vector3(b.body.position.x, b.body.position.y, b.body.position.z);
                        if (bPos.distanceTo(playerPosThree) < 1.0) { 
                            playerState.health = Math.max(0, playerState.health - 15);
                            b.active = false; 
                            b.mesh.visible = false;
                            b.body.position.set(0, -100, 0); 
                            particles.spawnImpact(bPos, new THREE.Vector3(0,1,0)); 
                            updateUIState();
                        }
                    }
                });
            }
        });

        enemies = enemies.filter(e => !e.isDestroyed);
        if (enemies.length === 0) { currentWave++; spawnWave(); }
        if (playerState.health <= 0) { 
            controls.unlock();
            setTimeout(() => { alert("游戏结束！按确定重开。"); location.reload(); }, 100); 
        }
        updateUIState();
    }
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
