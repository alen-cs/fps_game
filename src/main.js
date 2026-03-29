// --- 替换原本的 GroundMesh 逻辑 ---
const terrainGeo = new THREE.PlaneGeometry(300, 300, 80, 80);
const posAttr = terrainGeo.attributes.position;

// 用数学公式生成四周高、中间平的赛博地形
for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vy = posAttr.getY(i);
    const distFromCenter = Math.sqrt(vx * vx + vy * vy);
    
    if (distFromCenter > 40) {
        // 边缘生成波浪山脉
        const z = Math.sin(vx * 0.1) * Math.cos(vy * 0.1) * 6 + (distFromCenter - 40) * 0.3;
        posAttr.setZ(i, z);
    }
}
terrainGeo.computeVertexNormals();

const terrainMat = new THREE.MeshStandardMaterial({
    color: 0x070714,
    roughness: 0.8,
    metalness: 0.2,
    wireframe: false // 改为 true 可以变成纯线条的《黑客帝国》风格
});

const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
terrainMesh.rotation.x = -Math.PI / 2;
scene.add(terrainMesh);

// 加上发光的网格线，赛博味拉满
const terrainWireframe = new THREE.Mesh(
    terrainGeo, 
    new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true, transparent: true, opacity: 0.15 })
);
terrainWireframe.rotation.x = -Math.PI / 2;
scene.add(terrainWireframe);
