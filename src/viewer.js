import * as THREE from 'three';
import { IFCLoader } from 'web-ifc-three/IFCLoader';

let scene, camera, renderer;
let ifcLoader;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let currentMousePosition = { x: 0, y: 0 };

export function initViewer() {
    console.log('Начало инициализации IFC viewer');
    const container = document.getElementById('viewer-container');
    if (!container) {
        console.error('Не найден элемент с id "viewer-container"');
        return null;
    }

    // Инициализация сцены
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    console.log('Сцена создана');

    // Инициализация камеры
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(10, 10, 10);
    camera.lookAt(0, 0, 0);
    console.log('Камера создана');

    // Инициализация рендерера
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    console.log('Renderer создан и добавлен в DOM');

    // Настройка освещения
    const light = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(light);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(0, 10, 0);
    scene.add(directionalLight);
    console.log('Освещение добавлено');

    // Инициализация загрузчика IFC
    ifcLoader = new IFCLoader();
    ifcLoader.ifcManager.setWasmPath('/web-ifc/');
    console.log('IFCLoader инициализирован');

    // Настройка событий
    window.addEventListener('resize', onWindowResize);
    setupControls();

    // Запуск анимации
    animate();

    console.log('IFC viewer инициализирован');
    return { scene, camera, renderer, ifcLoader };
}

// Настройка управления камерой и событиями мыши
function setupControls() {
    const canvas = renderer.domElement;

    // Обработчики событий мыши
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onMouseWheel);

    // Обработчики событий клавиатуры
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
}

// Обработчик нажатия мыши
function onMouseDown(event) {
    isDragging = true;
    previousMousePosition = { x: event.clientX, y: event.clientY };
}

// Обработчик движения мыши
function onMouseMove(event) {
    currentMousePosition = { x: event.clientX, y: event.clientY };

    if (isDragging) {
        const deltaMove = {
            x: currentMousePosition.x - previousMousePosition.x,
            y: currentMousePosition.y - previousMousePosition.y
        };

        if (event.buttons === 4) { // Средняя кнопка мыши
            if (event.shiftKey) {
                // Панорамирование (Pan)
                const panSpeed = 0.005;
                camera.position.x -= deltaMove.x * panSpeed;
                camera.position.y += deltaMove.y * panSpeed;
            } else {
                // Вращение (Orbit)
                const rotateSpeed = 0.005;
                rotateCamera(deltaMove.x * rotateSpeed, deltaMove.y * rotateSpeed);
            }
        }
    }

    previousMousePosition = { x: currentMousePosition.x, y: currentMousePosition.y };
}

// Обработчик отпускания мыши
function onMouseUp() {
    isDragging = false;
}

// Обработчик колеса мыши (для зума)
function onMouseWheel(event) {
    const zoomSpeed = 1.05;
    const zoomFactor = event.deltaY > 0 ? zoomSpeed : 1 / zoomSpeed;
    camera.position.multiplyScalar(zoomFactor);
}

// Вращение камеры
function rotateCamera(angleX, angleY) {
    const quaternionX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angleX);
    const quaternionY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angleY);

    camera.quaternion.premultiply(quaternionX);
    camera.quaternion.premultiply(quaternionY);
    camera.position.applyQuaternion(quaternionX);
    camera.position.applyQuaternion(quaternionY);
}

// Подгонка камеры под сцену
function fitCameraToScene() {
    const boundingBox = new THREE.Box3().setFromObject(scene);
    const center = boundingBox.getCenter(new THREE.Vector3());
    const size = boundingBox.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 * Math.tan(fov * 2)); // расстояние до объекта по оси Z
    cameraZ *= 1.5; // увеличение расстояния для предотвращения обрезки
    camera.position.z = center.z + cameraZ;

    const minZ = boundingBox.min.z;
    const cameraToFarEdge = (minZ < 0) ? -minZ + cameraZ : cameraZ - minZ;

    camera.far = cameraToFarEdge * 3;
    camera.updateProjectionMatrix();

    if (camera.position.length() < 1) {
        camera.position.set(10, 10, 10);
    }
    camera.lookAt(center);
}
// Обработчик изменения размера окна
function onWindowResize() {
    const container = document.getElementById('viewer-container');
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

// Анимация и рендеринг сцены
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

// Обработчик событий клавиатуры (можно расширить по необходимости)
function onKeyDown(event) {
    switch (event.key) {
        case 'w': // Example: Move forward
            camera.position.z -= 0.1;
            break;
        case 's': // Example: Move backward
            camera.position.z += 0.1;
            break;
        // Добавьте больше кейсов для других действий
    }
}

function onKeyUp(event) {
    // Обработка отпускания клавиш (можно расширить по необходимости)
}

// Экспорт функции загрузки IFC модели
export function loadIfcModel(url) {
    ifcLoader.load(url, (ifcModel) => {
        scene.add(ifcModel.mesh);
        fitCameraToScene();
    });
}
