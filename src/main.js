import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

import { ParticleSystem } from './Particles.js';
import { Weapon } from './Weapon.js';
import { Enemy1 } from './Enemy1.js';
import { Enemy2 } from './Enemy2.js';
import { Boss } from './Boss.js';
import { Pickup } from './Pickups.js';

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) }); 
const scene = new THREE.Scene(); 
scene.background = new THREE.Color(0x0a0a0a); 
scene.fog = new THREE.FogExp2(0x0a0a0a, 0.03); 

const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); 
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; 
document.body.appendChild(renderer.domElement); 
scene.add(camera); // 确保相机加入场景

const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(20, 50, 20); 
dirLight.castShadow = true; 
dirLight.shadow.camera.left = -40;
dirLight.shadow.camera.right = 40;
dirLight.shadow.camera.top = 40;
dirLight.shadow.camera.bottom = -40;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 100;
dirLight.shadow.mapSize.width = 1024; 
dirLight.shadow.mapSize.height = 1024;
scene.add(dirLight);

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

const boxGeo = new THREE.BoxGeometry(2, 3, 2);
const boxMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
const boxShape = new CANNON.Box(new CANNON.Vec3(1, 1.5, 1)); 
for(let i = 0; i < 20; i++) {
    const x = (Math.random() - 0.5) * 80;
    const z = (Math.random() - 0.5) * 80;
    if (Math.abs(x) < 5 && Math.abs(z) < 5) continue; 
    const mesh = new THREE.Mesh(boxGeo, boxMat);
    mesh.position.set(x, 1.5, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const body = new CANNON.Body({ mass: 0, shape: boxShape, position: new CANNON.Vec3(x, 1.5, z) });
    world.addBody(body);
}

const playerMat = new CANNON.Material(); 
world.addContactMaterial(new CANNON.ContactMaterial(groundMat, playerMat, { friction: 0.0 }));

const playerBody = new CANNON.Body({
    mass: 70, shape: new CANNON.Sphere(0.6), position: new CANNON.Vec3(0, 5, 0), 
    material: playerMat, fixedRotation: true, linearDamping: 0.9 
});
world.addBody(playerBody);

const particles = new ParticleSystem(scene);
const weapon = new Weapon(camera, scene, particles);
const raycaster = new THREE.Raycaster();

const uiStaminaFill = document.getElementById('stamina-fill');
const uiInst = document.getElementById('instructions');
const uiWaveInfo = document.getElementById('wave-info');
const uiHealthFill = document.getElementById('health-fill');
const damageOverlay = document.getElementById('damage-overlay');

let keys = {}; 
let mouseDelta = { x: 0, y: 0 };
let stamina = 100; 
let canJump = false; 
let playerHealth = 100;
let damageOverlayTimer = 0;

let enemies = [];
let pickups = [];
let currentWave = 0;
let isWaveSpawning = false; 

const uiCache = { stamina: -1, health: -1, waveText: "", isSprinting: null };

function spawnPickups(count) {
    for (let i = 0; i < count; i++) {
        let x = (Math.random() - 0.5) * 80;
        let z = (Math.random() - 0.5) * 80;
        let type = Math.random() > 0.5 ? 'HEALTH' : 'AMMO';
        pickups.push(new Pickup(scene, type, new THREE.Vector3(x, 1.5, z)));
    }
}

function handlePlayerDamage(amount) {
    if (playerHealth <= 0) return;
    playerHealth -= amount;
    const hpWidth = Math.max(0, playerHealth) + '%';
    if (uiCache.health !== hpWidth) { uiHealthFill.style.width = hpWidth; uiCache.health = hpWidth; }
    damageOverlay.style.boxShadow = "inset 0 0 150px rgba(255, 0, 0, 0.8)";
    damageOverlayTimer = 0.5;
    if (playerHealth <= 0) {
        uiWaveInfo.innerText = "CRITICAL FAILURE. SYSTEM REBOOTING...";
        uiWaveInfo.style.color = "#ff2222";
        controls.unlock();
        setTimeout(() => location.reload(), 2000);
    }
}

function startNextWave() {
    isWaveSpawning = true;
    currentWave++;
    const newWaveText = `WAVE ${currentWave} - INCOMING...`;
    uiWaveInfo.innerText = newWaveText;
    uiCache.waveText = newWaveText;
    uiWaveInfo.style.color = "#ffaa00";

    setTimeout(() => {
        const basicCount = currentWave + 2; 
        const fastCount = currentWave > 1 ? currentWave : 0; 
        const bossCount = currentWave > 2 ? Math.floor(currentWave / 2) : 0; 

        const spawnType = (count, EnemyClass) => {
            for(let i = 0; i < count; i++) {
                let x = (Math.random() - 0.5) * 80;
                let z = (Math.random() - 0.5) * 80;
                if (Math.abs(x) < 15 && Math.abs(z) < 15) { x += (x > 0 ? 15 : -15); z += (z > 0 ? 15 : -15); }
                enemies.push(new EnemyClass(world, scene, new THREE.Vector3(x, 5 + i * 2, z)));
            }
        };

        spawnType(basicCount, Enemy1);
        spawnType(fastCount, Enemy2);
        spawnType(bossCount, Boss);
        uiWaveInfo.style.color = "#ffffff";
        isWaveSpawning = false;
    }, 3000);
}

spawnPickups(10);
startNextWave();

const controls = new PointerLockControls(camera, document.body); 

document.addEventListener('keydown', (e) => { keys[e.code] = true; if (e.code === 'KeyR' && controls.isLocked) weapon.reload(); });
document.addEventListener('keyup', (e) => keys[e.code] = false);
document.addEventListener('mousemove', (e) => { mouseDelta.x = e.movementX; mouseDelta.y = e.movementY; });

// 【核心修复：万能伤害判定法】
document.addEventListener('mousedown', () => { 
    if(controls.isLocked) {
        const hitResult = weapon.fire(raycaster); 
        // 如果子弹打中了东西，获取它的 3D 坐标
        if (hitResult && hitResult.point) {
            enemies.forEach(e => {
                // 尝试获取敌人的中心坐标 (兼容你的 Enemy 类结构)
                const targetPos = (e.body && e.body.position) || (e.group && e.group.position) || (e.mesh && e.mesh.position);
                if (targetPos) {
                    // 计算命中点到敌人的距离平方
                    const dx = targetPos.x - hitResult.point.x;
                    const dy = targetPos.y - hitResult.point.y;
                    const dz = targetPos.z - hitResult.point.z;
                    const distSq = dx*dx + dy*dy + dz*dz;

                    // 如果命中点在敌人半径 2.5 米内（相当于子弹打在敌人身上）
                    if (distSq < 6.25) { 
                        // 暴力兼容各种扣血方法
                        if (typeof e.takeDamage === 'function') e.takeDamage(35);
                        else if (typeof e.hit === 'function') e.hit(35);
                        else e.isDestroyed = true; // 如果都没有，直接秒杀
                    }
                }
            });
        }
    } 
});

uiInst.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => uiInst.style.display = 'none');
controls.addEventListener('unlock', () => uiInst.style.display = 'flex');

playerBody.addEventListener('collide', (e) => {
    const contactNormal = new CANNON.Vec3();
    e.contact.ni.negate(contactNormal); 
    if(contactNormal.y > 0.5) canJump = true; 
});

const clock = new THREE.Clock(); 
const moveDir = new THREE.Vector3(); 

function animate() {
    requestAnimationFrame(animate); 
    const delta = Math.min(clock.getDelta(), 0.1); 

    if (controls.isLocked && playerHealth > 0) { 
        world.step(1/60, delta, 3);
        if (playerBody.position.y < -20) { playerBody.position.set(0, 5, 0); playerBody.velocity.set(0, 0, 0); }

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
            playerBody.velocity.x = moveDir.x;
            playerBody.velocity.z = moveDir.z;
            if (isSprinting) stamina = Math.max(0, stamina - delta * 20);
        }
        
        if (!isSprinting && stamina < 100) stamina = Math.min(100, stamina + delta * 15);
        
        const intStamina = Math.round(stamina);
        if (uiCache.stamina !== intStamina) { uiStaminaFill.style.width = intStamina + '%'; uiCache.stamina = intStamina; }

        const isSprintingStatus = Boolean(isSprinting && isMoving);
        if (uiCache.isSprinting !== isSprintingStatus) {
            document.body.classList.toggle('sprinting', isSprintingStatus);
            uiCache.isSprinting = isSprintingStatus;
        }

        if(keys['Space'] && canJump) { playerBody.velocity.y = 6; canJump = false; }

        camera.position.set(playerBody.position.x, playerBody.position.y + 0.6, playerBody.position.z);
        
        const targetFov = isSprinting && isMoving ? 85 : 75;
        if (Math.abs(camera.fov - targetFov) > 0.1) {
            camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.1);
            camera.updateProjectionMatrix(); 
        }

        if (damageOverlayTimer > 0) {
            damageOverlayTimer -= delta;
            if (damageOverlayTimer <= 0) damageOverlay.style.boxShadow = "inset 0 0 150px rgba(255, 0, 0, 0)";
        }

        pickups.forEach(p => {
            p.update(delta);
            if (!p.isCollected) {
                const dx = playerBody.position.x - p.group.position.x;
                const dy = playerBody.position.y - p.group.position.y;
                const dz = playerBody.position.z - p.group.position.z;
                const distSq = dx * dx + dy * dy + dz * dz;

                if (distSq < 2.25) { 
                    p.collect();
                    if (p.type === 'HEALTH') {
                        playerHealth = Math.min(100, playerHealth + 40); 
                        const hpWidth = playerHealth + '%';
                        if (uiCache.health !== hpWidth) { uiHealthFill.style.width = hpWidth; uiCache.health = hpWidth; }
                        damageOverlay.style.boxShadow = "inset 0 0 100px rgba(0, 255, 136, 0.5)";
                        damageOverlayTimer = 0.3;
                    } else if (p.type === 'AMMO') {
                        weapon.maxAmmo += 60; 
                        weapon._updateAmmoUI(`${weapon.ammo} / ${weapon.maxAmmo}`); 
                        damageOverlay.style.boxShadow = "inset 0 0 100px rgba(0, 136, 255, 0.5)";
                        damageOverlayTimer = 0.3;
                    }
                }
            }
        });

        weapon.update(delta, isMoving, isSprinting); 
        mouseDelta.x = 0; mouseDelta.y = 0; 
        particles.update(delta); 
        
        enemies.forEach(e => e.update(delta, playerBody.position, handlePlayerDamage)); 
        
        for (let i = pickups.length - 1; i >= 0; i--) { if (pickups[i].isCollected) pickups.splice(i, 1); }
        for (let i = enemies.length - 1; i >= 0; i--) { if (enemies[i].isDestroyed) enemies.splice(i, 1); }

        const aliveEnemies = enemies.filter(e => e.state !== 'DEAD').length;
        if (!isWaveSpawning) {
            const newWaveText = `WAVE ${currentWave} | ENEMIES: ${aliveEnemies}`;
            if (uiCache.waveText !== newWaveText) { uiWaveInfo.innerText = newWaveText; uiCache.waveText = newWaveText; }
        }

        if (aliveEnemies === 0 && !isWaveSpawning && enemies.length === 0) {
            startNextWave();
            spawnPickups(2); 
        }
    }

    renderer.render(scene, camera); 
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
