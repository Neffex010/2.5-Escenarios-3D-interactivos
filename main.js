import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Octree } from 'three/addons/math/Octree.js';
import { OctreeHelper } from 'three/addons/helpers/OctreeHelper.js';
import { Capsule } from 'three/addons/math/Capsule.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

// --- Temporizador ---
const timer = new THREE.Timer();
timer.connect(document);

// --- Escena ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88ccee);
scene.fog = new THREE.Fog(0x88ccee, 0, 80);

// --- Cámara ---
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.rotation.order = 'YXZ';

// --- Luces ---
const fillLight1 = new THREE.HemisphereLight(0x8dc1de, 0x00668d, 1.5);
fillLight1.position.set(2, 1, 1);
scene.add(fillLight1);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
directionalLight.position.set(-5, 25, -1);
directionalLight.castShadow = true;
directionalLight.shadow.camera.near = 0.01;
directionalLight.shadow.camera.far = 500;
directionalLight.shadow.camera.right = 50;
directionalLight.shadow.camera.left = -50;
directionalLight.shadow.camera.top = 50;
directionalLight.shadow.camera.bottom = -50;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.radius = 4;
directionalLight.shadow.bias = -0.00006;
scene.add(directionalLight);

// --- Renderer ---
const container = document.getElementById('container');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setAnimationLoop(animate);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);

// --- Estadísticas (FPS) ---
const stats = new Stats();
stats.domElement.style.position = 'fixed';
stats.domElement.style.top = '60px';
stats.domElement.style.left = '0';
stats.domElement.style.zIndex = '300';
document.body.appendChild(stats.domElement);

// --- Constantes globales ---
const GRAVITY = 30;
const NUM_SPHERES = 100;
const SPHERE_RADIUS = 0.18;
const STEPS_PER_FRAME = 5;

// --- Parámetros ajustables (físicas) ---
let params = {
    restitution: 0.7,
    ballBallRestitution: 0.7,
    damping: 1.5,
    throwStrength: 1.0
};

// --- Datos del mundo / escala ---
const worldInfo = {
    center: new THREE.Vector3(),
    size: new THREE.Vector3(),
    box: new THREE.Box3(),
    floorY: 0,
    halfWidth: 10,
    halfDepth: 10,
    modelScale: 1
};

// --- Contador de bolas recolectadas ---
let score = 0;
const scoreElement = document.getElementById('score');

// --- Sistema de partículas para lanzamiento ---
const particleCount = 20;
const particleGeometry = new THREE.BufferGeometry();
const particlePositions = new Float32Array(particleCount * 3);
const particleColors = new Float32Array(particleCount * 3);
particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
particleGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));

const particleMaterial = new THREE.PointsMaterial({
    size: 0.1,
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
const particleMaxLifetime = 0.5;
let particleVelocities = [];

// --- Creación de las bolas ---
const sphereGeometry = new THREE.IcosahedronGeometry(SPHERE_RADIUS, 4);
const sphereMaterial = new THREE.MeshLambertMaterial({ color: 0xdede8d });

const spheres = [];
let sphereIdx = 0;

for (let i = 0; i < NUM_SPHERES; i++) {
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    sphere.visible = false;
    scene.add(sphere);

    spheres.push({
        mesh: sphere,
        collider: new THREE.Sphere(new THREE.Vector3(0, -100, 0), SPHERE_RADIUS),
        velocity: new THREE.Vector3(),
        active: false
    });
}

// --- Octree del mundo ---
const worldOctree = new Octree();

// --- Colisionador del jugador ---
const playerCollider = new Capsule(
    new THREE.Vector3(0, 0.35, 0),
    new THREE.Vector3(0, 1.7, 0),
    0.35
);

// --- Variables de movimiento del jugador ---
const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();
let playerOnFloor = false;
let mouseTime = 0;
const keyStates = {};

// --- Vectores auxiliares ---
const vector1 = new THREE.Vector3();
const vector2 = new THREE.Vector3();
const vector3 = new THREE.Vector3();
const tempBox = new THREE.Box3();
const tempSize = new THREE.Vector3();
const tempCenter = new THREE.Vector3();

// --- Eventos de teclado ---
document.addEventListener('keydown', (event) => {
    keyStates[event.code] = true;
});

document.addEventListener('keyup', (event) => {
    keyStates[event.code] = false;
});

// --- Eventos de mouse ---
container.addEventListener('mousedown', () => {
    document.body.requestPointerLock();
    mouseTime = performance.now();
});

document.addEventListener('mouseup', () => {
    if (document.pointerLockElement !== null) throwBall();
});

// --- Movimiento de cámara ---
document.body.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === document.body) {
        camera.rotation.y -= event.movementX / 500;
        camera.rotation.x -= event.movementY / 500;
        camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
    }
});

// --- Resize ---
window.addEventListener('resize', onWindowResize);

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Partículas ---
function spawnParticles(position, direction) {
    const count = particleCount;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    particleVelocities = [];

    for (let i = 0; i < count; i++) {
        const offset = new THREE.Vector3(
            (Math.random() - 0.5) * 0.3,
            (Math.random() - 0.5) * 0.3,
            (Math.random() - 0.5) * 0.3
        );

        const pos = position.clone().add(offset);
        positions[i * 3] = pos.x;
        positions[i * 3 + 1] = pos.y;
        positions[i * 3 + 2] = pos.z;

        const color = new THREE.Color().setHSL(0.1 + Math.random() * 0.1, 1, 0.5 + Math.random() * 0.3);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;

        const vel = direction.clone().multiplyScalar(2 + Math.random() * 3);
        vel.x += (Math.random() - 0.5) * 2;
        vel.y += (Math.random() - 0.5) * 2;
        vel.z += (Math.random() - 0.5) * 2;
        particleVelocities.push(vel);
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    particlesActive = true;
    particleLifetime = 0;
    particleMaterial.opacity = 0.8;
    particleSystem.visible = true;
}

// --- Lanzar bola ---
function throwBall() {
    const sphere = spheres[sphereIdx];
    sphere.active = true;
    sphere.mesh.visible = true;

    camera.getWorldDirection(playerDirection);

    sphere.collider.center.copy(playerCollider.end).addScaledVector(playerDirection, playerCollider.radius * 1.5);

    const impulse = (15 + 30 * (1 - Math.exp((mouseTime - performance.now()) * 0.001))) * params.throwStrength;
    sphere.velocity.copy(playerDirection).multiplyScalar(impulse);
    sphere.velocity.addScaledVector(playerVelocity, 2);

    spawnParticles(sphere.collider.center.clone(), playerDirection.clone().multiplyScalar(-0.5));

    sphereIdx = (sphereIdx + 1) % spheres.length;
}

// --- Colisiones del jugador con el mundo ---
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

// --- Actualizar jugador ---
function updatePlayer(deltaTime) {
    let damping = Math.exp(-4 * deltaTime) - 1;

    if (!playerOnFloor) {
        playerVelocity.y -= GRAVITY * deltaTime;
        damping *= 0.1;
    }

    playerVelocity.addScaledVector(playerVelocity, damping);

    const deltaPosition = playerVelocity.clone().multiplyScalar(deltaTime);
    playerCollider.translate(deltaPosition);

    playerCollisions();
    camera.position.copy(playerCollider.end);
}

// --- Recolectar bolas ---
function playerSphereCollision(sphere) {
    if (!sphere.active) return;

    const center = vector1.addVectors(playerCollider.start, playerCollider.end).multiplyScalar(0.5);
    const sphereCenter = sphere.collider.center;
    const r = playerCollider.radius + sphere.collider.radius;
    const r2 = r * r;

    for (const point of [playerCollider.start, playerCollider.end, center]) {
        const d2 = point.distanceToSquared(sphereCenter);
        if (d2 < r2) {
            score++;
            if (scoreElement) scoreElement.innerText = `Bolas recolectadas: ${score}`;

            sphere.active = false;
            sphere.mesh.visible = false;
            sphere.collider.center.set(0, -100, 0);
            sphere.velocity.set(0, 0, 0);
            return;
        }
    }
}

// --- Colisiones entre bolas ---
function spheresCollisions() {
    for (let i = 0, length = spheres.length; i < length; i++) {
        const s1 = spheres[i];
        if (!s1.active) continue;

        for (let j = i + 1; j < length; j++) {
            const s2 = spheres[j];
            if (!s2.active) continue;

            const d2 = s1.collider.center.distanceToSquared(s2.collider.center);
            const r = s1.collider.radius + s2.collider.radius;
            const r2 = r * r;

            if (d2 < r2) {
                const normal = vector1.subVectors(s1.collider.center, s2.collider.center).normalize();
                const v1 = vector2.copy(normal).multiplyScalar(normal.dot(s1.velocity));
                const v2 = vector3.copy(normal).multiplyScalar(normal.dot(s2.velocity));

                const rest = params.ballBallRestitution;
                s1.velocity.add(v2.clone().multiplyScalar(1 + rest)).sub(v1.clone().multiplyScalar(1 + rest));
                s2.velocity.add(v1.clone().multiplyScalar(1 + rest)).sub(v2.clone().multiplyScalar(1 + rest));

                const d = (r - Math.sqrt(d2)) / 2;
                s1.collider.center.addScaledVector(normal, d);
                s2.collider.center.addScaledVector(normal, -d);
            }
        }
    }
}

// --- Limitar bolas al área del modelo ---
function clampSphereToWorld(sphere) {
    const margin = 0.3;
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

// --- Actualizar bolas ---
function updateSpheres(deltaTime) {
    spheres.forEach(sphere => {
        if (!sphere.active) return;

        sphere.collider.center.addScaledVector(sphere.velocity, deltaTime);

        const result = worldOctree.sphereIntersect(sphere.collider);

        if (result) {
            const vNormal = result.normal.dot(sphere.velocity);
            sphere.velocity.addScaledVector(result.normal, -vNormal * (1 + params.restitution));
            sphere.collider.center.add(result.normal.multiplyScalar(result.depth));
        } else {
            sphere.velocity.y -= GRAVITY * deltaTime;
        }

        const damping = Math.exp(-params.damping * deltaTime) - 1;
        sphere.velocity.addScaledVector(sphere.velocity, damping);

        clampSphereToWorld(sphere);
        playerSphereCollision(sphere);
    });

    spheresCollisions();

    for (const sphere of spheres) {
        if (sphere.active) {
            sphere.mesh.position.copy(sphere.collider.center);
        }
    }
}

// --- Movimiento relativo a cámara ---
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

// --- Controles ---
function controls(deltaTime) {
    const speedDelta = deltaTime * (playerOnFloor ? 18 : 6);

    if (keyStates['KeyW']) playerVelocity.add(getForwardVector().multiplyScalar(speedDelta));
    if (keyStates['KeyS']) playerVelocity.add(getForwardVector().multiplyScalar(-speedDelta));
    if (keyStates['KeyA']) playerVelocity.add(getSideVector().multiplyScalar(-speedDelta));
    if (keyStates['KeyD']) playerVelocity.add(getSideVector().multiplyScalar(speedDelta));

    if (playerOnFloor && keyStates['Space']) {
        playerVelocity.y = 12;
    }
}

// --- Colocar jugador dentro del modelo ---
function setPlayerSpawn() {
    const spawnX = worldInfo.center.x;
    const spawnZ = worldInfo.center.z;
    const spawnY = worldInfo.floorY + 0.35;

    playerCollider.start.set(spawnX, spawnY, spawnZ);
    playerCollider.end.set(spawnX, spawnY + 1.35, spawnZ);
    playerCollider.radius = 0.35;

    playerVelocity.set(0, 0, 0);
    camera.position.copy(playerCollider.end);
}

// --- Escalado automático del modelo ---
function fitModelToCourt(gltfScene) {
    tempBox.setFromObject(gltfScene);
    tempBox.getSize(tempSize);
    tempBox.getCenter(tempCenter);

    const currentMaxXZ = Math.max(tempSize.x, tempSize.z);

    // Tamaño objetivo aproximado para una cancha cómoda en FPS
    const targetMaxXZ = 28;
    const autoScale = currentMaxXZ > 0 ? targetMaxXZ / currentMaxXZ : 1;

    gltfScene.scale.setScalar(autoScale);
    gltfScene.updateMatrixWorld(true);

    tempBox.setFromObject(gltfScene);
    tempBox.getSize(tempSize);
    tempBox.getCenter(tempCenter);

    // Centrar el modelo en X/Z y apoyar sobre Y=0
    gltfScene.position.x -= tempCenter.x;
    gltfScene.position.z -= tempCenter.z;
    gltfScene.position.y -= tempBox.min.y;
    gltfScene.updateMatrixWorld(true);

    worldInfo.modelScale = autoScale;
}

// --- Analizar dimensiones del mundo ---
function computeWorldInfo(root) {
    worldInfo.box.setFromObject(root);
    worldInfo.box.getCenter(worldInfo.center);
    worldInfo.box.getSize(worldInfo.size);

    worldInfo.floorY = worldInfo.box.min.y;

    // Reducimos un poco para que el límite quede dentro de la malla
    worldInfo.halfWidth = Math.max(2, worldInfo.size.x * 0.48);
    worldInfo.halfDepth = Math.max(2, worldInfo.size.z * 0.48);

    // Ajustar niebla y sombras al tamaño real del modelo
    const maxDim = Math.max(worldInfo.size.x, worldInfo.size.z, 20);
    scene.fog.far = maxDim * 3.5;

    directionalLight.shadow.camera.right = maxDim * 1.2;
    directionalLight.shadow.camera.left = -maxDim * 1.2;
    directionalLight.shadow.camera.top = maxDim * 1.2;
    directionalLight.shadow.camera.bottom = -maxDim * 1.2;
    directionalLight.shadow.camera.far = maxDim * 6;
    directionalLight.shadow.needsUpdate = true;

    console.log('Escala aplicada al modelo:', worldInfo.modelScale);
    console.log('Tamaño final del mundo:', worldInfo.size);
    console.log('Centro del mundo:', worldInfo.center);
}

// --- Cargar modelo ---
const loader = new GLTFLoader().setPath('./models/gltf/');

loader.load('basket.glb', (gltf) => {
    const model = gltf.scene;

    // Ajuste automático de escala y posición
    fitModelToCourt(model);

    scene.add(model);

    model.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;

            if (child.material) {
                if (child.material.map) child.material.map.anisotropy = 4;
                child.material.side = THREE.FrontSide;
            }
        }
    });

    computeWorldInfo(model);

    // Construir colisiones después de escalar y posicionar
    worldOctree.fromGraphNode(model);

    setPlayerSpawn();

    // --- Ayuda visual del octree ---
    const helper = new OctreeHelper(worldOctree);
    helper.visible = false;
    scene.add(helper);

    // --- GUI ---
    const gui = new GUI({ width: 260 });
    gui.domElement.style.position = 'fixed';
    gui.domElement.style.top = '60px';
    gui.domElement.style.right = '0';
    gui.domElement.style.zIndex = '300';

    const physicsFolder = gui.addFolder('Físicas');
    physicsFolder.add(params, 'restitution', 0.2, 0.95).name('Rebote mundo');
    physicsFolder.add(params, 'ballBallRestitution', 0.2, 0.95).name('Rebote entre bolas');
    physicsFolder.add(params, 'damping', 0.2, 3.0).name('Fricción aire');
    physicsFolder.open();

    const throwFolder = gui.addFolder('Lanzamiento');
    throwFolder.add(params, 'throwStrength', 0.2, 3.0).name('Fuerza');
    throwFolder.open();

    const debugData = { debug: false };
    gui.add(debugData, 'debug').name('Mostrar Octree').onChange(value => {
        helper.visible = value;
    });
}, undefined, (error) => {
    console.error('Error cargando basket.glb:', error);
});

// --- Evitar que el jugador salga del modelo ---
function keepPlayerInsideBounds() {
    const margin = 0.5;
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

// --- Teletransportar jugador si cae ---
function teleportPlayerIfOob() {
    if (camera.position.y <= worldInfo.floorY - 10) {
        setPlayerSpawn();
        camera.rotation.set(0, 0, 0);
    }
}

// --- Animación ---
function animate() {
    timer.update();
    const deltaTime = Math.min(0.05, timer.getDelta()) / STEPS_PER_FRAME;

    if (particlesActive) {
        particleLifetime += deltaTime * STEPS_PER_FRAME;
        const alpha = 1 - (particleLifetime / particleMaxLifetime);

        if (alpha <= 0) {
            particlesActive = false;
            particleSystem.visible = false;
        } else {
            particleSystem.visible = true;
            const positions = particleGeometry.attributes.position.array;

            for (let i = 0; i < particleCount; i++) {
                positions[i * 3] += particleVelocities[i].x * deltaTime * STEPS_PER_FRAME;
                positions[i * 3 + 1] += particleVelocities[i].y * deltaTime * STEPS_PER_FRAME;
                positions[i * 3 + 2] += particleVelocities[i].z * deltaTime * STEPS_PER_FRAME;
            }

            particleGeometry.attributes.position.needsUpdate = true;
            particleMaterial.opacity = alpha;
        }
    }

    for (let i = 0; i < STEPS_PER_FRAME; i++) {
        controls(deltaTime);
        updatePlayer(deltaTime);
        keepPlayerInsideBounds();
        updateSpheres(deltaTime);
        teleportPlayerIfOob();
    }

    const time = performance.now() * 0.001;
    directionalLight.position.x = Math.sin(time * 0.2) * 12;
    directionalLight.position.z = Math.cos(time * 0.2) * 12;

    renderer.render(scene, camera);
    stats.update();
}