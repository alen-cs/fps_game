import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { Weapon } from './Weapon.js';
// ... 其余 Enemy/Particle 引入保持不变

console.log("%c 🚀 游戏逻辑 v1.2.0 已加载：弹道与伤害修正生效", "color: #00ff00; font-weight: bold;");

// ... 初始化 Scene/World/Camera 逻辑保持不变 ...

// 核心：点击开火逻辑
document.addEventListener('mousedown', () => {
    if (controls.isLocked) {
        const result = weapon.fire(raycaster);
        if (result) {
            const { point, object } = result;
            let hitTarget = null;

            // 1. 优先检测射线是否直击敌人
            enemies.forEach(enemy => {
                const enemyMesh = enemy.group || enemy.mesh;
                if (object && (object === enemy.mesh || (enemyMesh.children && enemyMesh.children.includes(object)))) {
                    hitTarget = enemy;
                }
            });

            // 2. 补偿检测：如果击中点在敌人中心附近 (圆柱体判定)
            if (!hitTarget && point) {
                enemies.forEach(enemy => {
                    const enemyPos = (enemy.group && enemy.group.position) || enemy.mesh.position;
                    const horizontalDist = Math.sqrt(Math.pow(enemyPos.x - point.x, 2) + Math.pow(enemyPos.z - point.z, 2));
                    const verticalDist = Math.abs(enemyPos.y - point.y);
                    
                    if (horizontalDist < 1.8 && verticalDist < 3.0) { 
                        hitTarget = enemy;
                    }
                });
            }

            // 3. 结算伤害
            if (hitTarget) {
                const DAMAGE = 60; 
                console.log("HIT!", hitTarget);
                
                if (hitTarget.takeDamage) hitTarget.takeDamage(DAMAGE);
                else if (hitTarget.hit) hitTarget.hit(DAMAGE);
                else hitTarget.isDestroyed = true;

                // 命中反馈 UI
                const marker = document.getElementById('hit-marker');
                marker.style.opacity = '1';
                setTimeout(() => marker.style.opacity = '0', 100);
            }
        }
    }
});

// ... animate 函数内确保调用 weapon.update(delta) ...
