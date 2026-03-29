import * as THREE from 'three';
import * as CANNON from 'cannon-es';

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
        
        const coreGeo = new THREE.OctahedronGeometry(config.radius * 0.8, 0); 
        const coreMat = new THREE.MeshStandardMaterial({ color: this.baseColor, metalness: 0.8, roughness: 0.2 });
        this.mesh = new THREE.Mesh(coreGeo, coreMat); 
        this.mesh.castShadow = true;
        
        const ringGeo = new THREE.TorusGeometry(config.radius * 1.3, config.radius * 0.08, 8, 24);
        const ringMat = new THREE.MeshBasicMaterial({ color: this.baseColor });
        this.ring = new THREE.Mesh(ringGeo, ringMat);
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

        this.mesh.material.color.setHex(0xffffff);
        setTimeout(() => { 
            if(this.state !== 'DEAD') this.mesh.material.color.setHex(this.baseColor); 
        }, 100);

        if (this.health <= 0) this.die();
    }

    die() {
        this.state = 'DEAD';
        this.mesh.material.color.setHex(0x333333); 
        this.ring.visible = false; 
        this.body.mass = 0; 
        this.body.velocity.set(0, 0, 0); 

        setTimeout(() => {
            this.scene.remove(this.group);
            this.world.removeBody(this.body);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
            this.ring.geometry.dispose();
            this.ring.material.dispose();
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