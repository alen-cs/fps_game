// ... 其他 import 保持不变 ...

// 在 mousedown 事件中应用新的伤害逻辑
document.addEventListener('mousedown', () => {
    if (controls.isLocked) {
        const result = weapon.fire(raycaster);
        if (result) {
            const { point, object } = result;
            let hitTarget = null;

            // 1. 尝试直接通过碰撞的对象寻找敌人
            enemies.forEach(enemy => {
                // 检查被击中的对象是否属于该敌人的 group 或 mesh
                if (object && (object === enemy.mesh || (enemy.group && enemy.group.attach && enemy.group.children.includes(object)))) {
                    hitTarget = enemy;
                }
            });

            // 2. 备选方案：通过距离判定（针对复杂模型或判定失败补偿）
            if (!hitTarget && point) {
                enemies.forEach(enemy => {
                    const enemyPos = (enemy.group && enemy.group.position) || enemy.mesh.position;
                    const distSq = enemyPos.distanceToSquared(point);
                    // 如果击中点距离敌人中心小于 2.5 米（圆柱体判定范围）
                    if (distSq < 6.25) { 
                        hitTarget = enemy;
                    }
                });
            }

            // 3. 应用伤害
            if (hitTarget) {
                const DAMAGE_VALUE = 60; // 伤害值
                console.log("HIT ENEMY!", hitTarget); // 调试日志，按 F12 查看

                if (typeof hitTarget.takeDamage === 'function') {
                    hitTarget.takeDamage(DAMAGE_VALUE);
                } else if (typeof hitTarget.hit === 'function') {
                    hitTarget.hit(DAMAGE_VALUE);
                } else {
                    // 兜底方案：如果敌人没有血量逻辑，直接标记销毁
                    hitTarget.isDestroyed = true;
                }

                // 视觉反馈：红色 ❌ 准星
                showHitMarker();
            }
        }
    }
});

// 辅助函数：显示击中标记
function showHitMarker() {
    let marker = document.getElementById('hit-marker');
    if (!marker) {
        marker = document.createElement('div');
        marker.id = 'hit-marker';
        marker.innerHTML = '❌';
        marker.style.cssText = 'position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); color:red; font-size:40px; pointer-events:none; opacity:0; transition:opacity 0.1s; z-index:60;';
        document.body.appendChild(marker);
    }
    marker.style.opacity = '1';
    setTimeout(() => { marker.style.opacity = '0'; }, 150);
}

// ... animate 函数和其他部分保持不变，但确保 weapon.update(delta) 被调用 ...
