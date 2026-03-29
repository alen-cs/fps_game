import { EnemyBase } from './EnemyBase.js';

export class Boss extends EnemyBase {
    constructor(world, scene, startPos) {
        super(world, scene, startPos, { 
            speed: 2.0,      
            health: 500,     
            radius: 1.5,     
            color: 0x8800ff, 
            mass: 500,
            damage: 40
        });
    }

    takeDamage(amount, hitDir) {
        if (this.state === 'DEAD') return;
        this.health -= amount;
        
        this.mesh.material.color.setHex(0xffffff);
        setTimeout(() => { 
            if(this.state !== 'DEAD') this.mesh.material.color.setHex(this.baseColor); 
        }, 100);

        if (this.health <= 0) this.die();
    }
}