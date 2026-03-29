import { EnemyBase } from './EnemyBase.js';

export class Enemy2 extends EnemyBase {
    constructor(world, scene, startPos) {
        super(world, scene, startPos, { 
            speed: 9.0,      
            health: 40,      
            radius: 0.35,    
            color: 0xffff00, 
            mass: 10,
            damage: 10
        });
    }
}