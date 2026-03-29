export class Shop {
    constructor(player, weaponManager, controls) {
        this.player = player; // 传入玩家状态引用 { points: 0 }
        this.weaponManager = weaponManager;
        this.controls = controls;
        this.isOpen = false;

        this.initUI();
    }

    initUI() {
        this.container = document.createElement('div');
        this.container.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            width: 600px; background: rgba(10, 10, 25, 0.95); border: 2px solid #00ffff;
            box-shadow: 0 0 20px #00ffff; color: white; font-family: monospace;
            padding: 20px; display: none; z-index: 1000; border-radius: 10px;
        `;
        document.body.appendChild(this.container);
    }

    open() {
        this.isOpen = true;
        this.controls.unlock(); // 解除鼠标锁定以便点击
        this.render();
        this.container.style.display = 'block';
    }

    close() {
        this.isOpen = false;
        this.container.style.display = 'none';
        this.controls.lock(); // 重新锁定鼠标
    }

    toggle() {
        this.isOpen ? this.close() : this.open();
    }

    buyWeapon(index, cost) {
        if (this.player.points >= cost) {
            if (this.weaponManager.unlockedWeapons.includes(index)) {
                alert("已拥有该武器！");
                return;
            }
            this.player.points -= cost;
            this.weaponManager.unlockedWeapons.push(index);
            this.weaponManager.switchWeapon(index);
            this.render();
        } else {
            alert("积分不足！");
        }
    }

    buyAmmo() {
        if (this.player.points >= 100) {
            this.player.points -= 100;
            this.weaponManager.maxAmmo += 120;
            this.weaponManager.updateUI();
            this.render();
        } else {
            alert("积分不足！");
        }
    }

    render() {
        const weapons = this.weaponManager.arsenal;
        let html = `
            <h2 style="text-align:center; color:#00ff88; margin-top:0;">军火终端 (按 B 退出)</h2>
            <h3 style="color:#ffaa00;">当前积分: ${this.player.points} PTS</h3>
            <div style="margin-bottom: 20px; padding: 10px; border: 1px dashed #555;">
                <p>通用备弹箱 (120发) - <span style="color:#00ffff;">100 PTS</span></p>
                <button id="buy-ammo-btn" style="background:#00ffff; color:#000; border:none; padding:5px 10px; cursor:pointer;">购买弹药</button>
            </div>
            <h4>武器库:</h4>
            <div style="display:flex; flex-direction:column; gap:10px;">
        `;

        weapons.forEach((w, index) => {
            const isOwned = this.weaponManager.unlockedWeapons.includes(index);
            const isEquipped = this.weaponManager.currentWeaponIndex === index;
            html += `
                <div style="display:flex; justify-content:space-between; align-items:center; background:#1a1a24; padding:10px; border-left: 4px solid #${w.color.toString(16).padStart(6,'0')}">
                    <div>
                        <strong>${w.name}</strong> 
                        <span style="font-size:12px; color:#aaa;">(伤害:${w.damage} | 射速:${w.fireRate}s)</span>
                    </div>
                    <div>
                        ${isEquipped ? '<span style="color:#00ff88;">已装备</span>' : 
                          isOwned ? `<button class="equip-btn" data-id="${index}" style="background:#444; color:#fff; border:none; padding:5px; cursor:pointer;">装备</button>` : 
                          `<button class="buy-btn" data-id="${index}" data-cost="${w.cost}" style="background:#ff0055; color:#fff; border:none; padding:5px; cursor:pointer;">购买 - ${w.cost} PTS</button>`}
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        this.container.innerHTML = html;

        // 绑定事件
        document.getElementById('buy-ammo-btn').onclick = () => this.buyAmmo();
        
        this.container.querySelectorAll('.buy-btn').forEach(btn => {
            btn.onclick = (e) => this.buyWeapon(parseInt(e.target.dataset.id), parseInt(e.target.dataset.cost));
        });

        this.container.querySelectorAll('.equip-btn').forEach(btn => {
            btn.onclick = (e) => {
                this.weaponManager.switchWeapon(parseInt(e.target.dataset.id));
                this.render();
            };
        });
    }
}
