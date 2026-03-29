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
        return Math.sin(x * 0.1) * Math.cos(z * 0.1) * 6 + (distFromCenter - 40) * 0.3;
    }
    return 0; 
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050510);
scene.fog = new THREE.FogExp2(0x050510, 0.025);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
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

const terrainWireframe = new THREE.Mesh(
    terrainGeo, 
    new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true, transparent: true, opacity: 0.15 })
);
terrainWireframe.rotation.x = -Math.PI / 2;
scene.add(terrainWireframe);

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

let isDashing = false;
let dashCooldown = 0;
let dashDuration = 0;
const DASH_SPEED = 45;   
const NORMAL_SPEED = 20; 

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
        
        const startY = getTerrainHeight(x, z) + 5; 

        if (currentWave >= 5 && i === 0) {
            enemies.push(new Boss(scene, world, new THREE.Vector3(x, startY, z)));
        } else if (currentWave >= 2 && Math.random() > 0.6) {
            enemies.push(new Enemy2(scene, world, new THREE.Vector3(x, startY, z)));
        } else {
            enemies.push(new Enemy1(scene, world, new THREE.Vector3(x, startY, z)));
        }
    }
    
    const px = (Math.random()-0.5)*80;
    const pz = (Math.random()-0.5)*80;
    const py = getTerrainHeight(px, pz) + 1;
    pickups.push(new Pickup(scene, Math.random() > 0.5 ? 'HEALTH' : 'AMMO', new THREE.Vector3(px, py, pz)));
    
    updateWaveUI();
}

function updateWaveUI() {
    const el = document.getElementById('wave-info');
    if (el) el.
