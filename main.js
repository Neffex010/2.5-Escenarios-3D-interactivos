import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Octree } from 'three/addons/math/Octree.js';
import { OctreeHelper } from 'three/addons/helpers/OctreeHelper.js';
import { Capsule } from 'three/addons/math/Capsule.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

// =========================
// TEMPORIZADOR
// =========================
const timer = new THREE.Timer();
timer.connect(document);

// =========================
// ESCENA
// =========================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88ccee);
scene.fog = new THREE.Fog(0x88ccee, 0, 120);

// =========================
// CÁMARA
// =========================
const camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.rotation.order = 'YXZ';

// =========================
// LUCES
// =========================
const hemiLight = new THREE.HemisphereLight(0x8dc1de, 0x3b4a2f, 1.5);
scene.add(hemiLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
directionalLight.position.set(-10, 25, 10);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.near = 0.1;
directionalLight.shadow.camera.far = 300;
directionalLight.shadow.camera.left = -60;
directionalLight.shadow.camera.right = 60;
directionalLight.shadow.camera.top = 60;
directionalLight.shadow.camera.bottom = -60;
directionalLight.shadow.bias = -0.00008;
scene.add(directionalLight);

// =========================
// RENDERER
// =========================
const container = document.getElementById('container');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setAnimationLoop(animate);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

// =========================
// STATS
// =========================
const stats = new Stats();
stats.dom.style.position = 'absolute';
stats.dom.style.top = '0px';
stats.dom.style.left = '0px';
stats.dom.style.zIndex = '999';
document.body.appendChild(stats.dom);

// =========================
// PARÁMETROS GLOBALES
// =========================
const GRAVITY = 30;
const NUM_SPHERES = 100;
const DEFAULT_SPHERE_RADIUS = 0.12; // radio original de la geometría
const STEPS_PER_FRAME = 5;
const MAX_PLAYER_SPEED = 15;

// =========================
// PARÁMETROS AJUSTABLES (valores por defecto tipo baloncesto)
// =========================
const params = {
    // Mundo
    worldBounce: 0.6,
    // Balón
    ballBounce: 0.8,
    ballDamping: 1.0,
    ballColor: '#ff6600', // naranja
    ballSize: DEFAULT_SPHERE_RADIUS,
    // Lanzamiento
    throwStrength: 1.0,
    // Visual
    showOctree: false
};

// =========================
// INFO DEL MUNDO
// =========================
const worldInfo = {
    center: new THREE.Vector3(),
    size: new THREE.Vector3(),
    box: new THREE.Box3(),
    floorY: 0,
    halfWidth: 12,
    halfDepth: 12,
    modelScale: 1
};

// =========================
// OCTREE
// =========================
const worldOctree = new Octree();
let octreeHelper = null;

// =========================
// JUGADOR
// =========================
const PLAYER_RADIUS = 0.32;
const PLAYER_HEIGHT = 1.72;

const playerCollider = new Capsule(
    new THREE.Vector3(0, PLAYER_RADIUS, 0),
    new THREE.Vector3(0, PLAYER_HEIGHT, 0),
    PLAYER_RADIUS
);

const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();
let playerOnFloor = false;

// =========================
// CONTROLES
// =========================
const keyStates = {};
let mouseTime = 0;

document.addEventListener('keydown', (event) => {
    if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
        event.preventDefault();
    }
    keyStates[event.code] = true;
});

document.addEventListener('keyup', (event) => {
    keyStates[event.code] = false;
});

container.addEventListener('mousedown', () => {
    document.body.requestPointerLock();
    mouseTime = performance.now();
});

document.addEventListener('mouseup', () => {
    if (document.pointerLockElement === document.body) {
        throwBall();
    }
});

document.body.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === document.body) {
        camera.rotation.y -= event.movementX / 500;
        camera.rotation.x -= event.movementY / 500;
        camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
    }
});

// =========================
// VECTORES AUXILIARES
// =========================
const vector1 = new THREE.Vector3();
const vector2 = new THREE.Vector3();
const vector3 = new THREE.Vector3();

const tempBox = new THREE.Box3();
const tempSize = new THREE.Vector3();
const tempCenter = new THREE.Vector3();

// =========================
// SCORE
// =========================
let score = 0;
const scoreElement = document.getElementById('score');

// =========================
// PARTÍCULAS
// =========================
const particleCount = 20;
const particleGeometry = new THREE.BufferGeometry();
const particlePositions = new Float32Array(particleCount * 3);
const particleColors = new Float32Array(particleCount * 3);

particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
particleGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));

const particleMaterial = new THREE.PointsMaterial({
    size: 0.08,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending
});

const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
particleSystem.visible = false;
scene.add(particleSystem);

let particlesActive = false;
let particleLifetime = 0;
const particleMaxLifetime = 0.45;
let particleVelocities = [];

// =========================
// PELOTAS (color inicial naranja)
// =========================
const sphereGeometry = new THREE.IcosahedronGeometry(DEFAULT_SPHERE_RADIUS, 4);
const sphereMaterial = new THREE.MeshLambertMaterial({ color: params.ballColor });

const spheres = [];

for (let i = 0; i < NUM_SPHERES; i++) {
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial.clone());
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    sphere.visible = false;
    scene.add(sphere);

    spheres.push({
        mesh: sphere,
        collider: new THREE.Sphere(new THREE.Vector3(0, -100, 0), DEFAULT_SPHERE_RADIUS),
        velocity: new THREE.Vector3(),
        active: false
    });
}

// =========================
// GUI reorganizado
// =========================
const gui = new GUI({ width: 270 });
gui.title('Configuración FPS');
gui.domElement.style.zIndex = '1000';
gui.domElement.style.position = 'absolute';
gui.domElement.style.top = '70px';
gui.domElement.style.right = '10px';

// Carpeta Mundo
const worldFolder = gui.addFolder('Mundo');
worldFolder.add(params, 'worldBounce', 0.2, 0.95, 0.01).name('Rebote');
worldFolder.open();

// Carpeta Balón (baloncesto)
const ballFolder = gui.addFolder('Balón');
ballFolder.add(params, 'ballBounce', 0.2, 0.95, 0.01).name('Rebote');
ballFolder.add(params, 'ballDamping', 0.2, 3.0, 0.01).name('Fricción');
ballFolder.addColor(params, 'ballColor').name('Color').onChange(value => {
    spheres.forEach(s => {
        if (s.mesh.material) s.mesh.material.color.set(value);
    });
});
ballFolder.add(params, 'ballSize', 0.05, 0.5, 0.01).name('Tamaño').onChange(value => {
    const scale = value / DEFAULT_SPHERE_RADIUS;
    spheres.forEach(s => {
        s.mesh.scale.set(scale, scale, scale);
        s.collider.radius = value;
    });
});
ballFolder.open();

// Carpeta Lanzamiento
const throwFolder = gui.addFolder('Lanzamiento');
throwFolder.add(params, 'throwStrength', 0.2, 3.0, 0.01).name('Fuerza');
throwFolder.open();

// Visual
gui.add(params, 'showOctree').name('Mostrar octree').onChange((value) => {
    if (octreeHelper) octreeHelper.visible = value;
});

// =========================
// FUNCIONES DE DIRECCIÓN
// =========================
function getForwardVector() {
    camera.getWorldDirection(playerDirection);
    playerDirection.y = 0;
    playerDirection.normalize();
    return playerDirection;
}

function getSideVector() {
    camera.getWorldDirection(playerDirection);
    playerDirection.y = 0;
    playerDirection.normalize();
    playerDirection.cross(camera.up);
    return playerDirection;
}

// =========================
// COLISIONES JUGADOR
// =========================
function playerCollisions() {
    const result = worldOctree.capsuleIntersect(playerCollider);

    playerOnFloor = false;

    if (result) {
        playerOnFloor = result.normal.y > 0;

        if (!playerOnFloor) {
            playerVelocity.addScaledVector(result.normal, -result.normal.dot(playerVelocity));
        }

        if (result.depth >= 1e-10) {
            playerCollider.translate(result.normal.multiplyScalar(result.depth));
        }
    }
}

// =========================
// CONTROLES DE MOVIMIENTO
// =========================
function controls(deltaTime) {
    const speedDelta = deltaTime * (playerOnFloor ? 18 : 7);

    if (keyStates['KeyW']) {
        playerVelocity.add(getForwardVector().multiplyScalar(speedDelta));
    }

    if (keyStates['KeyS']) {
        playerVelocity.add(getForwardVector().multiplyScalar(-speedDelta));
    }

    if (keyStates['KeyA']) {
        playerVelocity.add(getSideVector().multiplyScalar(-speedDelta));
    }

    if (keyStates['KeyD']) {
        playerVelocity.add(getSideVector().multiplyScalar(speedDelta));
    }

    if (playerOnFloor && keyStates['Space']) {
        playerVelocity.y = 11;
    }
}

// =========================
// ACTUALIZAR JUGADOR
// =========================
function updatePlayer(deltaTime) {
    let damping = Math.exp(-4 * deltaTime) - 1;

    if (!playerOnFloor) {
        playerVelocity.y -= GRAVITY * deltaTime;
        damping *= 0.15;
    }

    playerVelocity.addScaledVector(playerVelocity, damping);

    // Limitar velocidad máxima
    if (playerVelocity.length() > MAX_PLAYER_SPEED) {
        playerVelocity.normalize().multiplyScalar(MAX_PLAYER_SPEED);
    }

    const deltaPosition = playerVelocity.clone().multiplyScalar(deltaTime);
    playerCollider.translate(deltaPosition);

    playerCollisions();
    keepPlayerInsideBounds();

    camera.position.copy(playerCollider.end);
}

// =========================
// MANTENER JUGADOR DENTRO
// =========================
function keepPlayerInsideBounds() {
    const margin = 0.45;

    const minX = worldInfo.center.x - worldInfo.halfWidth + margin;
    const maxX = worldInfo.center.x + worldInfo.halfWidth - margin;
    const minZ = worldInfo.center.z - worldInfo.halfDepth + margin;
    const maxZ = worldInfo.center.z + worldInfo.halfDepth - margin;

    const centerX = (playerCollider.start.x + playerCollider.end.x) * 0.5;
    const centerZ = (playerCollider.start.z + playerCollider.end.z) * 0.5;

    let dx = 0;
    let dz = 0;

    if (centerX < minX) dx = minX - centerX;
    if (centerX > maxX) dx = maxX - centerX;
    if (centerZ < minZ) dz = minZ - centerZ;
    if (centerZ > maxZ) dz = maxZ - centerZ;

    if (dx !== 0 || dz !== 0) {
        playerCollider.translate(new THREE.Vector3(dx, 0, dz));

        if (dx !== 0) playerVelocity.x = 0;
        if (dz !== 0) playerVelocity.z = 0;
    }
}

// =========================
// SPAWN DEL JUGADOR
// =========================
function setPlayerSpawn() {
    const spawnX = worldInfo.center.x;
    const spawnZ = worldInfo.center.z;
    const spawnY = worldInfo.floorY + PLAYER_RADIUS;

    playerCollider.start.set(spawnX, spawnY, spawnZ);
    playerCollider.end.set(spawnX, spawnY + (PLAYER_HEIGHT - PLAYER_RADIUS), spawnZ);

    playerVelocity.set(0, 0, 0);
    camera.position.copy(playerCollider.end);
}

// =========================
// TELEPORT SI CAE
// =========================
function teleportPlayerIfOob() {
    if (camera.position.y < worldInfo.floorY - 10) {
        setPlayerSpawn();
        camera.rotation.set(0, 0, 0);
    }
}

// =========================
// INTERSECCIÓN CÁPSULA-ESFERA
// =========================
function capsuleSphereIntersect(capsule, sphereCenter, sphereRadius) {
    const d = sphereCenter.clone().sub(capsule.start);
    const lab = capsule.end.clone().sub(capsule.start);
    const t = d.dot(lab) / lab.lengthSq();
    const tClamped = Math.max(0, Math.min(1, t));
    const closestPoint = capsule.start.clone().add(lab.multiplyScalar(tClamped));
    const dist = closestPoint.distanceTo(sphereCenter);
    return dist < (capsule.radius + sphereRadius);
}

// =========================
// PELOTAS VS JUGADOR
// =========================
function playerSphereCollision(sphere) {
    if (!sphere.active) return;

    if (capsuleSphereIntersect(playerCollider, sphere.collider.center, sphere.collider.radius)) {
        score++;
        if (scoreElement) {
            scoreElement.innerText = `Bolas recolectadas: ${score}`;
        }

        sphere.active = false;
        sphere.mesh.visible = false;
        sphere.collider.center.set(0, -100, 0);
        sphere.velocity.set(0, 0, 0);
    }
}

// =========================
// PELOTAS ENTRE SÍ (usando parámetros de balón)
// =========================
function spheresCollisions() {
    for (let i = 0; i < spheres.length; i++) {
        const s1 = spheres[i];
        if (!s1.active) continue;

        for (let j = i + 1; j < spheres.length; j++) {
            const s2 = spheres[j];
            if (!s2.active) continue;

            const d2 = s1.collider.center.distanceToSquared(s2.collider.center);
            const r = s1.collider.radius + s2.collider.radius;
            const r2 = r * r;

            if (d2 < r2) {
                const normal = vector1
                    .subVectors(s1.collider.center, s2.collider.center)
                    .normalize();

                const v1 = vector2.copy(normal).multiplyScalar(normal.dot(s1.velocity));
                const v2 = vector3.copy(normal).multiplyScalar(normal.dot(s2.velocity));

                const rest = params.ballBounce;

                s1.velocity.add(v2.clone().multiplyScalar(1 + rest)).sub(v1.clone().multiplyScalar(1 + rest));
                s2.velocity.add(v1.clone().multiplyScalar(1 + rest)).sub(v2.clone().multiplyScalar(1 + rest));

                const d = (r - Math.sqrt(d2)) / 2;
                s1.collider.center.addScaledVector(normal, d);
                s2.collider.center.addScaledVector(normal, -d);
            }
        }
    }
}

// =========================
// LIMITAR PELOTAS AL MUNDO
// =========================
function clampSphereToWorld(sphere) {
    const margin = 0.25;
    const minX = worldInfo.center.x - worldInfo.halfWidth + sphere.collider.radius + margin;
    const maxX = worldInfo.center.x + worldInfo.halfWidth - sphere.collider.radius - margin;
    const minZ = worldInfo.center.z - worldInfo.halfDepth + sphere.collider.radius + margin;
    const maxZ = worldInfo.center.z + worldInfo.halfDepth - sphere.collider.radius - margin;

    if (sphere.collider.center.x < minX) {
        sphere.collider.center.x = minX;
        sphere.velocity.x *= -0.6;
    } else if (sphere.collider.center.x > maxX) {
        sphere.collider.center.x = maxX;
        sphere.velocity.x *= -0.6;
    }

    if (sphere.collider.center.z < minZ) {
        sphere.collider.center.z = minZ;
        sphere.velocity.z *= -0.6;
    } else if (sphere.collider.center.z > maxZ) {
        sphere.collider.center.z = maxZ;
        sphere.velocity.z *= -0.6;
    }

    if (sphere.collider.center.y < worldInfo.floorY - 2) {
        sphere.active = false;
        sphere.mesh.visible = false;
        sphere.collider.center.set(0, -100, 0);
        sphere.velocity.set(0, 0, 0);
    }
}

// =========================
// ACTUALIZAR PELOTAS (usando parámetros de balón)
// =========================
function updateSpheres(deltaTime) {
    for (const sphere of spheres) {
        if (!sphere.active) continue;

        sphere.collider.center.addScaledVector(sphere.velocity, deltaTime);

        const result = worldOctree.sphereIntersect(sphere.collider);

        if (result) {
            const vNormal = result.normal.dot(sphere.velocity);
            sphere.velocity.addScaledVector(
                result.normal,
                -vNormal * (1 + params.worldBounce)
            );
            sphere.collider.center.add(result.normal.multiplyScalar(result.depth));
        } else {
            sphere.velocity.y -= GRAVITY * deltaTime;
        }

        const damping = Math.exp(-params.ballDamping * deltaTime) - 1;
        sphere.velocity.addScaledVector(sphere.velocity, damping);

        clampSphereToWorld(sphere);
        playerSphereCollision(sphere);
    }

    spheresCollisions();

    for (const sphere of spheres) {
        if (sphere.active) {
            sphere.mesh.position.copy(sphere.collider.center);
        }
    }
}

// =========================
// PARTÍCULAS
// =========================
function spawnParticles(position, direction) {
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    particleVelocities = [];

    for (let i = 0; i < particleCount; i++) {
        const offset = new THREE.Vector3(
            (Math.random() - 0.5) * 0.25,
            (Math.random() - 0.5) * 0.25,
            (Math.random() - 0.5) * 0.25
        );

        const pos = position.clone().add(offset);

        positions[i * 3] = pos.x;
        positions[i * 3 + 1] = pos.y;
        positions[i * 3 + 2] = pos.z;

        const color = new THREE.Color().setHSL(
            0.08 + Math.random() * 0.08,
            1,
            0.5 + Math.random() * 0.25
        );

        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;

        const vel = direction.clone().multiplyScalar(2 + Math.random() * 2.5);
        vel.x += (Math.random() - 0.5) * 1.5;
        vel.y += (Math.random() - 0.5) * 1.5;
        vel.z += (Math.random() - 0.5) * 1.5;

        particleVelocities.push(vel);
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    particleGeometry.attributes.position.needsUpdate = true;
    particleGeometry.attributes.color.needsUpdate = true;

    particlesActive = true;
    particleLifetime = 0;
    particleMaterial.opacity = 0.8;
    particleSystem.visible = true;
}

function updateParticles(deltaTime) {
    if (!particlesActive) return;

    particleLifetime += deltaTime;
    const alpha = 1 - particleLifetime / particleMaxLifetime;

    if (alpha <= 0) {
        particlesActive = false;
        particleSystem.visible = false;
        return;
    }

    const positions = particleGeometry.attributes.position.array;

    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] += particleVelocities[i].x * deltaTime;
        positions[i * 3 + 1] += particleVelocities[i].y * deltaTime;
        positions[i * 3 + 2] += particleVelocities[i].z * deltaTime;
    }

    particleGeometry.attributes.position.needsUpdate = true;
    particleMaterial.opacity = alpha;
}

// =========================
// LANZAR PELOTA (busca inactiva)
// =========================
function throwBall() {
    const inactiveIndex = spheres.findIndex(s => !s.active);
    if (inactiveIndex === -1) {
        console.warn('No hay bolas disponibles');
        return;
    }
    const sphere = spheres[inactiveIndex];
    sphere.active = true;
    sphere.mesh.visible = true;

    camera.getWorldDirection(playerDirection);

    sphere.collider.center
        .copy(playerCollider.end)
        .addScaledVector(playerDirection, playerCollider.radius * 1.6);

    const holdTime = (performance.now() - mouseTime) * 0.001;
    const impulse = (12 + 22 * (1 - Math.exp(-holdTime))) * params.throwStrength;

    sphere.velocity.copy(playerDirection).multiplyScalar(impulse);
    sphere.velocity.addScaledVector(playerVelocity, 1.5);

    spawnParticles(
        sphere.collider.center.clone(),
        playerDirection.clone().multiplyScalar(-0.5)
    );
}

// =========================
// AJUSTAR MODELO A LA CANCHA
// =========================
function fitModelToCourt(root) {
    tempBox.setFromObject(root);
    tempBox.getSize(tempSize);
    tempBox.getCenter(tempCenter);

    const currentMaxXZ = Math.max(tempSize.x, tempSize.z);
    const targetMaxXZ = 30;
    const autoScale = currentMaxXZ > 0 ? targetMaxXZ / currentMaxXZ : 1;

    root.scale.setScalar(autoScale);
    root.updateMatrixWorld(true);

    tempBox.setFromObject(root);
    tempBox.getSize(tempSize);
    tempBox.getCenter(tempCenter);

    root.position.x -= tempCenter.x;
    root.position.z -= tempCenter.z;
    root.position.y -= tempBox.min.y;
    root.updateMatrixWorld(true);

    worldInfo.modelScale = autoScale;
}

// =========================
// CALCULAR INFO DEL MUNDO
// =========================
function computeWorldInfo(root) {
    worldInfo.box.setFromObject(root);
    worldInfo.box.getCenter(worldInfo.center);
    worldInfo.box.getSize(worldInfo.size);
    worldInfo.floorY = worldInfo.box.min.y;

    worldInfo.halfWidth = Math.max(2, worldInfo.size.x * 0.47);
    worldInfo.halfDepth = Math.max(2, worldInfo.size.z * 0.47);

    const maxDim = Math.max(worldInfo.size.x, worldInfo.size.z, 20);

    scene.fog.far = maxDim * 4;

    directionalLight.shadow.camera.left = -maxDim * 1.4;
    directionalLight.shadow.camera.right = maxDim * 1.4;
    directionalLight.shadow.camera.top = maxDim * 1.4;
    directionalLight.shadow.camera.bottom = -maxDim * 1.4;
    directionalLight.shadow.camera.far = maxDim * 6;
    directionalLight.shadow.needsUpdate = true;

    console.log('Escala modelo:', worldInfo.modelScale);
    console.log('Tamaño mundo:', worldInfo.size);
    console.log('Centro mundo:', worldInfo.center);
}

// =========================
// CARGAR MODELO
// =========================
const loader = new GLTFLoader().setPath('./models/gltf/');

loader.load(
    'basket.glb',
    (gltf) => {
        const model = gltf.scene;

        fitModelToCourt(model);
        scene.add(model);

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;

                if (child.material) {
                    child.material.side = THREE.FrontSide;
                    if (child.material.map) {
                        child.material.map.anisotropy = 4;
                    }
                }
            }
        });

        computeWorldInfo(model);
        worldOctree.fromGraphNode(model);

        try {
    octreeHelper = new OctreeHelper(worldOctree);
    octreeHelper.visible = params.showOctree;
    scene.add(octreeHelper);
} catch (e) {
    console.warn('No se pudo crear el OctreeHelper. Puede deberse a un octree muy grande o a un modelo complejo. El juego seguirá funcionando sin la visualización del octree.', e);
    octreeHelper = null;
}

        setPlayerSpawn();
    },
    undefined,
    (error) => {
        console.error('Error cargando basket.glb:', error);
    }
);

// =========================
// RESIZE
// =========================
window.addEventListener('resize', onWindowResize);

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// =========================
// ANIMACIÓN
// =========================
function animate() {
    timer.update();

    const deltaTime = Math.min(0.05, timer.getDelta()) / STEPS_PER_FRAME;

    for (let i = 0; i < STEPS_PER_FRAME; i++) {
        controls(deltaTime);
        updatePlayer(deltaTime);
        updateSpheres(deltaTime);
        teleportPlayerIfOob();
    }

    updateParticles(deltaTime * STEPS_PER_FRAME);

    const t = performance.now() * 0.001;
    directionalLight.position.x = Math.sin(t * 0.2) * 14;
    directionalLight.position.z = Math.cos(t * 0.2) * 14;

    renderer.render(scene, camera);
    stats.update();
}