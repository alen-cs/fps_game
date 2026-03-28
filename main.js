import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/**
 * 核心配置与状态
 */
const CONFIG = {
    PLAYER_SPEED: 12,
    JUMP_FORCE: 5,
    GRAVITY: -9.82,
    WEAPON_LERP: 0.15,
    BOB_SPEED: 10,
    BOB_AMOUNT: 0.04
};

const state = {
    moveForward: false, moveBackward: false,
    moveLeft: false, moveRight: false,
    canJump: false, isMoving: false
};

/**
 * 武器类：处理模型、动画、射击
 */
class Weapon {
    constructor(camera, scene) {
        this.camera = camera;
        this.scene = scene;
        this.group = new THREE.Group();
        this.basePos = new THREE.Vector3(0.4, -0.35, -0.6);
        this.recoilZ = 0;
        this.bobTime = 0;

        // 构建方块枪
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(0.15, 0.2, 0.7),
            new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.2 })
        );
        const barrel = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.08, 0.5),
            new THREE.MeshStandardMaterial({ color: 0x050505 })
        );
        barrel.position.z = -0.5;
        this.group.add(body, barrel);
        
        // 枪口火光
        this.muzzleFlash = new THREE.PointLight(0xffaa00, 0, 3);
        this.muzzleFlash.position.set(0.4, -0.2, -1.2);
        
        this.camera.add(this.group);
        this.camera.add(this.muzzleFlash);
        this.group.position.copy(this.basePos);
    }

    update(delta, isMoving) {
        // 1. 呼吸与走动晃动 (Bobbing)
        if (isMoving) {
            this.bobTime += delta * CONFIG.BOB_SPEED;
            const targetY = this.basePos.y + Math.sin(this.bobTime) * CONFIG.BOB_AMOUNT;
            const targetX = this.basePos.x + Math.cos(this.bobTime * 0.5) * CONFIG.BOB_AMOUNT * 0.5;
            this.group.position.y = THREE.MathUtils.lerp(this.group.position.y, targetY, 0.1);
            this.group.position.x = THREE.MathUtils.lerp(this.group.position.x, targetX, 0.1);
        } else {
            this.group.position.lerp(this.basePos, 0.05);
        }

        // 2. 后坐力回弹
        this.recoilZ = THREE.MathUtils.lerp(this.recoilZ, 0, 0.1);
        this.group.position.z = this.basePos.z + this.recoilZ;

        // 3. 闪光熄灭
        if (this.muzzleFlash.intensity > 0) this.muzzleFlash.intensity -= delta * 60;
    }

    shoot(raycaster) {
        this.recoilZ = 0.2; // 瞬间后移
        this.muzzleFlash.intensity = 10; // 亮起

        const intersects = raycaster.intersectObjects(this.scene.children, true);
        if (intersects.length > 0) {
            this.createImpact(intersects[0].point);
        }
    }

    createImpact(pos) {
        const hit = new THREE.Mesh(
            new THREE.SphereGeometry(0.05, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xffff00 })
        );
        hit.position.copy(pos);
        this.scene.add(hit);
        setTimeout(() => this.scene.remove(hit), 100);
    }
}

/**
 * 初始化引擎
 */
const init = () => {
    // 物理世界
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, CONFIG.GRAVITY, 0) });
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    
    // 相机与渲染器
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    scene.add(camera);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // 材质定义
    const groundMat = new CANNON.Material("ground");
    const playerMat = new CANNON.Material("player");
    world.addContactMaterial(new CANNON.ContactMaterial(groundMat, playerMat, { friction: 0.0 }));

    // 地面
    const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: groundMat });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(groundBody);
    
    const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // 目标方块 (设计元素)
    for(let i=0; i<10; i++) {
        const size = 1 + Math.random() * 2;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff }));
        mesh.position.set(Math.random()*40-20, size/2, Math.random()*40-20);
        mesh.castShadow = true;
        scene.add(mesh);
    }

    // 玩家物理体
    const playerBody = new CANNON.Body({
        mass: 60, shape: new CANNON.Sphere(0.6), 
        position: new CANNON.Vec3(0, 2, 0), material: playerMat,
        fixedRotation: true
    });
    world.addBody(playerBody);

    // 灯光
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.position.set(5, 15, 5);
    sun.castShadow = true;
    scene.add(sun);

    // 武器与控制器
    const weapon = new Weapon(camera, scene);
    const controls = new PointerLockControls(camera, document.body);
    const raycaster = new THREE.Raycaster();
    const inst = document.getElementById('instructions');

    inst.addEventListener('click', () => controls.lock());
    controls.addEventListener('lock', () => inst.style.display = 'none');
    controls.addEventListener('unlock', () => inst.style.display = 'flex');

    // 事件监听
    window.addEventListener('keydown', (e) => {
        if(e.code === 'KeyW') state.moveForward = true;
        if(e.code === 'KeyS') state.moveBackward = true;
        if(e.code === 'KeyA') state.moveLeft = true;
        if(e.code === 'KeyD') state.moveRight = true;
        if(e.code === 'Space' && state.canJump) { playerBody.velocity.y = CONFIG.JUMP_FORCE; state.canJump = false; }
    });
    window.addEventListener('keyup', (e) => {
        if(e.code === 'KeyW') state.moveForward = false;
        if(e.code === 'KeyS') state.moveBackward = false;
        if(e.code === 'KeyA') state.moveLeft = false;
        if(e.code === 'KeyD') state.moveRight = false;
    });
    window.addEventListener('mousedown', () => { if(controls.isLocked) weapon.shoot(raycaster); });
    playerBody.addEventListener('collide', () => state.canJump = true);

    // 循环运行
    const clock = new THREE.Clock();
    const moveVector = new THREE.Vector3();

    function animate() {
        requestAnimationFrame(animate);
        const delta = Math.min(clock.getDelta(), 0.1);

        if (controls.isLocked) {
            world.fixedStep();
            
            // 计算移动速度
            moveVector.set(0, 0, 0);
            if (state.moveForward) moveVector.z -= 1;
            if (state.moveBackward) moveVector.z += 1;
            if (state.moveLeft) moveVector.x -= 1;
            if (state.moveRight) moveVector.x += 1;

            state.isMoving = moveVector.length() > 0;
            moveVector.normalize().multiplyScalar(CONFIG.PLAYER_SPEED).applyQuaternion(camera.quaternion);

            playerBody.velocity.x = moveVector.x;
            playerBody.velocity.z = moveVector.z;

            camera.position.set(playerBody.position.x, playerBody.position.y + 0.6, playerBody.position.z);
            weapon.update(delta, state.isMoving);
            
            // 准星射线中心点对齐
            raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        }
        renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
};

init();
