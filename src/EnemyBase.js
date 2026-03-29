import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// 全局资源缓存，防止每波刷怪时卡顿 (Flyweight Pattern)
const GeometryCache = {};
const MaterialCache = {};

export class EnemyBase {
    constructor(world, scene, startPos, config) {
        this.world = world;
        this.scene = scene;
        
        this.speed = config.speed;
        this.health = config.health;
        this.baseColor = config.color;
        this.damage = config.damage || 15;
        
        this.state = 'IDLE'; 
        this.isDestroyed = false;
        this.attackCooldown = 1.0; 
        this.lastAttackTime = 0;   

        this.group = new THREE.Group();
        
        // --- 资源复用逻辑 ---
        const cacheKey = `${config.radius}_${config.color}`;
        
        if (!GeometryCache[cacheKey]) {
            GeometryCache[cacheKey] = {
                core: new THREE.OctahedronGeometry(config.radius * 0.8, 0),
                ring: new THREE.TorusGeometry(config.radius * 1.3, config.radius * 0.08, 8, 24)
            };
            MaterialCache[cacheKey] = {
                core: new THREE.MeshStandardMaterial({ color: config.color, metalness: 0.8, roughness: 0.2 }),
                ring: new THREE.MeshBasicMaterial({ color: config.color })
            };
        }

        const geos = GeometryCache[cacheKey];
        const mats = MaterialCache[cacheKey];
        // -------------------

        // 由于材质是共享的，我们需要 clone 核心材质以便单独实现受击闪白效果
        this.coreMatInstance = mats.core.clone(); 
        this.mesh = new THREE.Mesh(geos.core, this.coreMatInstance); 
        this.mesh.castShadow = true;
        
        this.ring = new THREE.Mesh(geos.ring, mats.ring);
        this.ring.rotation.x = Math.PI / 2;

        this.group.add(this.mesh, this.ring);
        this.scene.add(this.group);

        this.body = new CANNON.Body({
            mass: config.mass,
            shape: new CANNON.Sphere(config.radius),
            position: new CANNON.Vec3(startPos.x, startPos.y, startPos.z),
            linearDamping: 0.9 
        });
        this.body.fixedRotation = true;
        this.world.addBody(this.body);

        this.group.userData = { isEnemy: true, ref: this };
        this.mesh.userData = { isEnemy: true, ref: this };
    }

    takeDamage(amount, hitDir) {
        if (this.state === 'DEAD') return;
        
        this.health -= amount;
        
        const knockback = 100 / this.body.mass;
        this.body.velocity.x += hitDir.x * knockback; 
        this.body.velocity.z += hitDir.z * knockback;

        // 受击变白
        this.coreMatInstance.color.setHex(0xffffff);
        setTimeout(() => { 
            if(this.state !== 'DEAD') this.coreMatInstance.color.setHex(this.baseColor); 
        }, 100);

        if (this.health <= 0) this.die();
    }

    die() {
        this.state = 'DEAD';
        this.coreMatInstance.color.setHex(0x333333); 
        this.ring.visible = false; 
        this.body.mass = 0; 
        this.body.velocity.set(0, 0, 0); 

        setTimeout(() => {
            this.scene.remove(this.group);
            this.world.removeBody(this.body);
            // 只释放专属克隆的材质，不释放共享的几何体
            this.coreMatInstance.dispose(); 
            this.isDestroyed = true; 
        }, 3000);
    }

    update(delta, playerPos, onAttack) {
        if (this.isDestroyed) return; 
        if (this.body.position.y < -10 && this.state !== 'DEAD') this.die();

        this.group.position.copy(this.body.position); 
        if (this.state === 'DEAD') return; 

        if (this.lastAttackTime > 0) this.lastAttackTime -= delta;

        this.mesh.rotation.y += delta;
        this.ring.rotation.z += delta * (this.speed * 0.5);

        const dx = playerPos.x - this.body.position.x;
        const dy = playerPos.y - this.body.position.y;
        const dz = playerPos.z - this.body.position.z;
        const distSq = dx * dx + dy * dy + dz * dz; 
        
        if (distSq < 900 && distSq > 4) { 
            this.state = 'CHASE';
            const length = Math.sqrt(dx * dx + dz * dz);
            if (length > 0) {
                this.body.velocity.x = (dx / length) * this.speed;
                this.body.velocity.z = (dz / length) * this.speed;
            }
        } else if (distSq <= 4) {
            this.state = 'ATTACK';
            this.body.velocity.x *= 0.5; 
            this.body.velocity.z *= 0.5;
            
            if (this.lastAttackTime <= 0) {
                if (onAttack) onAttack(this.damage);
                this.lastAttackTime = this.attackCooldown; 
                
                const length = Math.sqrt(dx * dx + dz * dz);
                if (length > 0) {
                    this.body.velocity.x += (dx / length) * 5;
                    this.body.velocity.z += (dz / length) * 5;
                }
            }
        } else {
            this.state = 'IDLE';
            this.body.velocity.x *= 0.9;
            this.body.velocity.z *= 0.9;
        }
    }
}
