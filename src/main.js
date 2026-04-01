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

export function getTerrainHeight(x, z) {
    const distFromCenter = Math.sqrt(x * x + z * z);
    if (distFromCenter > 40) {
        return Math.sin(x * 0.1) * Math.cos(z * 0.1) * 6 + (distFromCenter - 40) * 0.3;
    }
    return 0; 
}

const FILTER_PLAYER = 1;
const FILTER_PLAYER_BULLET = 2;
const FILTER_ENEMY = 4;
const FILTER_ENEMY_BULLET = 8;
const FILTER_GROUND = 16;
const PICKUP_GROUP = 32;

const scene = new THREE.Scene();
// 优化：略微调亮背景色，保持赛博深夜感
scene.background = new THREE.Color(0x0a0a1a); 
// 优化：降低雾气密度提升远景可见度
scene.fog = new THREE.FogExp2(0x0a0a1a, 0.012); 

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -25, 0) }); 

// 优化：增强环境光与赛博主光源
const ambientLight = new THREE.AmbientLight(0xffffff, 0.65); // 提高基础亮度
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0x00ffff, 1.2); // 增强青色强光
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

// 优化：将地表颜色调得略带泛蓝反光
const terrainMat = new THREE.MeshStandardMaterial({ color: 0x11112b, roughness: 0.8, metalness: 0.2 });
const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
terrainMesh.rotation.x = -Math.PI / 2;
scene.add(terrainMesh);

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

let playerState = { health: 100, points: 0 }; 
const particles = new ParticleSystem(scene);
const weapon = new Weapon(camera, scene, particles);
const shop = new Shop(playerState, weapon, controls);
const raycaster = new THREE.Raycaster();

let enemies = [];
let currentWave = 1;
let keys = {};

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

function handleShooting() {
    if (!controls.isLocked) return;
    const result = weapon.fire(raycaster);
    if (result) {
        const { point, object, damage } = result;
        let hitAny = false;
        
        enemies.forEach(enemy => {
            // 核心修复：利用在 Enemy1 中赋予的 enemyParent，极简实现精准碰撞检测
            const isHit = object && object.enemyParent === enemy;
            
            if (isHit || (enemy.mesh && enemy.mesh.position.distanceTo(point) < 2.5)) {
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

// ... 后续 updateUIState(), spawnWave() 和 animate() 保持与上一版完全一致即可 ...
