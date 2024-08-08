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

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    console.log('Сцена создана');

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(10, 10, 10);
    camera.lookAt(0, 0, 0);
    console.log('Камера создана');

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    console.log('Renderer создан и добавлен в DOM');

    const light = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(light);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(0, 10, 0);
    scene.add(directionalLight);
    console.log('Освещение добавлено');

    ifcLoader = new IFCLoader();
    ifcLoader.ifcManager.setWasmPath('/web-ifc/');
    console.log('IFCLoader инициализирован');

    window.addEventListener('resize', onWindowResize);
    setupControls();

    animate();

    console.log('IFC viewer инициализирован');
    return { scene, camera, renderer, ifcLoader };
}

function setupControls() {
    const canvas = renderer.domElement;

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onMouseWheel);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
}

function onMouseDown(event) {
    isDragging = true;
    previousMousePosition = { x: event.clientX, y: event.clientY };
}

function onMouseMove(event) {
    currentMousePosition = { x: event.clientX, y: event.clientY };

    if (isDragging) {
        const deltaMove = {
            x: currentMousePosition.x - previousMousePosition.x,
            y: currentMousePosition.y - previousMousePosition.y
        };

        if (event.buttons === 1) { // Left mouse button
            if (event.shiftKey) {
                // Pan
                const speed = 0.05;
                camera.position.x -= deltaMove.x * speed;
                camera.position.y += deltaMove.y * speed;
            } else {
                // Orbit
                const speed = 0.01;
                rotateCamera(deltaMove.x * speed, deltaMove.y * speed);
            }
        } else if (event.buttons === 4) { // Middle mouse button
            // Pan
            const speed = 0.05;
            camera.position.x -= deltaMove.x * speed;
            camera.position.y += deltaMove.y * speed;
        }
    }

    previousMousePosition = { x: currentMousePosition.x, y: currentMousePosition.y };
}

function onMouseUp() {
    isDragging = false;
}

function onMouseWheel(event) {
    const zoomSpeed = 0.1;
    const zoomFactor = event.deltaY > 0 ? 1 + zoomSpeed : 1 - zoomSpeed;
    camera.position.multiplyScalar(zoomFactor);
}

function onKeyDown(event) {
    if (event.key === 'f' || event.key === 'F') {
        fitCameraToScene();
    }
}

function onKeyUp(event) {
    // Можно добавить дополнительные действия при отпускании клавиш
}

function rotateCamera(angleX, angleY) {
    const quaternionX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angleX);
    const quaternionY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angleY);

    camera.quaternion.premultiply(quaternionX);
    camera.quaternion.premultiply(quaternionY);
    camera.position.applyQuaternion(quaternionX);
    camera.position.applyQuaternion(quaternionY);
}

export async function loadIFCModel(url, fileName, onProgress) {
    console.log(`Начало загрузки IFC модели: ${fileName}`);
    try {
        const model = await new Promise((resolve, reject) => {
            ifcLoader.load(
                url,
                (model) => resolve(model),
                (progress) => {
                    const percentage = progress.loaded / progress.total;
                    console.log(`Загрузка ${fileName}: ${Math.round(percentage * 100)}%`);
                    if (onProgress) {
                        onProgress(percentage);
                    }
                },
                (error) => reject(error)
            );
        });

        console.log(`IFC модель загружена: ${fileName}`, model);

        // Перекрашивание модели на основе имени файла
        let color;
        if (fileName.startsWith('AR')) {
            color = new THREE.Color(0xFFA500); // Оранжевый
        } else if (fileName.startsWith('HV')) {
            color = new THREE.Color(0x0000FF); // Синий
        } else if (fileName.startsWith('TS')) {
            color = new THREE.Color(0x8A2BE2); // Фиолетовый
        }

        if (color) {
            model.traverse((child) => {
                if (child.isMesh) {
                    child.material = new THREE.MeshPhongMaterial({
                        color: color,
                        transparent: true,
                        opacity: 0.7,
                        side: THREE.DoubleSide // Рендерим обе стороны полигонов
                    });
                }
            });
        }

        scene.add(model);

        // Подгоняем камеру под новую модель
        fitCameraToScene();

        return model;
    } catch (error) {
        console.error(`Ошибка при загрузке IFC модели ${fileName}:`, error);
        return null;
    }
}

export function fitCameraToScene() {
    const boundingBox = new THREE.Box3().setFromObject(scene);
    const center = boundingBox.getCenter(new THREE.Vector3());
    const size = boundingBox.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 * Math.tan(fov * 2));

    cameraZ *= 1.5; // Увеличиваем расстояние, чтобы вся сцена поместилась в кадр

    camera.position.set(center.x, center.y, center.z + cameraZ);
    camera.lookAt(center);

    const minZ = boundingBox.min.z;
    const cameraToFarEdge = (minZ < 0) ? -minZ + cameraZ : cameraZ - minZ;

    camera.far = cameraToFarEdge * 3;
    camera.updateProjectionMatrix();

    console.log('Камера подстроена под сцену');
}

function onWindowResize() {
    const container = document.getElementById('viewer-container');
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

export function clearScene() {
    scene.traverse((object) => {
        if (object.type === 'Mesh') {
            object.geometry.dispose();
            object.material.dispose();
        }
    });

    while (scene.children.length > 0) {
        scene.remove(scene.children[0]);
    }

    // Добавляем базовое освещение после очистки сцены
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(10, 10, 10);
    scene.add(directionalLight);
}