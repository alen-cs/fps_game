import { EnemyBase } from './EnemyBase.js';

export class Enemy1 extends EnemyBase {
    constructor(world, scene, startPos) {
        super(world, scene, startPos, { 
            speed: 4.5, 
            health: 100, 
            radius: 0.6, 
            color: 0xff2222, 
            mass: 20,
            damage: 15
        });
    }
}