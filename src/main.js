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

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });

// 灯光
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0x00ffff, 0.8);
dirLight.position.set(20, 40, 20);
scene.add(dirLight);

// 地面
const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

const gridHelper = new THREE.GridHelper(200, 50, 0x00ffff, 0x222244);
gridHelper.position.y = 0.01;
scene.add(gridHelper);

const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x0a0a15 }));
groundMesh.rotation.x = -Math.PI / 2;
scene.add(groundMesh);

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
        
        // 根据波次刷出不同的怪
        if (currentWave >= 5 && i === 0) {
            enemies.push(new Boss(scene, world, new THREE.Vector3(x, 2, z)));
        } else if (currentWave >= 2 && Math.random() > 0.6) {
            enemies.push(new Enemy2(scene, world, new THREE.Vector3(x, 1, z)));
        } else {
            enemies.push(new Enemy1(scene, world, new THREE.Vector3(x, 1, z)));
        }
    }
    
    // 刷补给
    pickups.push(new Pickup(scene, Math.random() > 0.5 ? 'HEALTH' : 'AMMO', new THREE.Vector3((Math.random()-0.5)*40, 1, (Math.random()-0.5)*40)));
    updateWaveUI();
}

function updateWaveUI() {
    document.getElementById('wave-info').innerText = `WAVE: ${currentWave} | ENEMIES: ${enemies.length}`;
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
                // 宽容判定：射线直击 or 距离小于判定半径
                if (object === enemy.mesh || dist < 2.5) {
                    enemy.takeDamage(40);
                    hitAny = true;
                }
            });

            if (hitAny) {
                const marker = document.getElementById('hit-marker');
                marker.style.opacity = '1';
                setTimeout(() => marker.style.opacity = '0', 100);
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

        // 玩家移动
        moveDir.set(0, 0, 0);
        if (keys['KeyW']) moveDir.z -= 1;
        if (keys['KeyS']) moveDir.z += 1;
        if (keys['KeyA']) moveDir.x -= 1;
        if (keys['KeyD']) moveDir.x += 1;

        if (moveDir.lengthSq() > 0) {
            moveDir.normalize().multiplyScalar(10).applyQuaternion(camera.quaternion);
            playerBody.velocity.x = moveDir.x;
            playerBody.velocity.z = moveDir.z;
        } else {
            playerBody.velocity.x = 0; playerBody.velocity.z = 0;
        }

        camera.position.set(playerBody.position.x, playerBody.position.y + 0.6, playerBody.position.z);

        // 更新组件
        weapon.update(delta);
        particles.update(delta);
        
        // 更新敌人
        enemies.forEach(enemy => {
            enemy.update(delta, playerBody.position);
            // 敌方伤害判定
            if (enemy.mesh.position.distanceTo(playerBody.position) < 3) {
                playerHealth = Math.max(0, playerHealth - delta * 10);
                document.getElementById('health-fill').style.width = playerHealth + '%';
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
                document.getElementById('health-fill').style.width = playerHealth + '%';
            }
        });

        // 清理死掉的实体
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
