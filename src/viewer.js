import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { IFCLoader } from 'web-ifc-three/IFCLoader';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

let scene, camera, renderer, controls;
let ifcLoader, gltfLoader;

export function initViewer() {
    console.log('Начало инициализации viewer');
    const container = document.getElementById('viewer-container');
    if (!container) {
        console.error('Не найден элемент с id "viewer-container"');
        return null;
    }

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    console.log('Сцена создана');

    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(10, 10, 10);
    console.log('Камера создана');

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    console.log('Renderer создан и добавлен в DOM');

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controls.screenSpacePanning = false;
    controls.maxPolarAngle = Math.PI / 2;
    console.log('OrbitControls инициализированы');

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(10, 10, 10);
    scene.add(directionalLight);
    console.log('Освещение добавлено');

    ifcLoader = new IFCLoader();
    ifcLoader.ifcManager.setWasmPath('/web-ifc/');
    console.log('IFCLoader инициализирован');

    gltfLoader = new GLTFLoader();
    console.log('GLTFLoader инициализирован');

    window.addEventListener('resize', onWindowResize);

    animate();

    console.log('Viewer инициализирован');
    return { scene, camera, renderer, controls, ifcLoader, gltfLoader };
}

function onWindowResize() {
    const container = document.getElementById('viewer-container');
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

export function clearScene() {
    console.log('Очистка сцены');
    scene.traverse((object) => {
        if (object.type === 'Mesh') {
            object.geometry.dispose();
            object.material.dispose();
        }
    });

    while (scene.children.length > 0) {
        scene.remove(scene.children[0]);
    }

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(50, 50, 50);
    scene.add(directionalLight);

    console.log('Сцена очищена');
}

export async function loadModel(url, fileName, onProgress) {
    console.log(`Начало загрузки модели: ${fileName}`);
    try {
        let model;
        if (fileName.toLowerCase().endsWith('.ifc')) {
            model = await loadIFCModel(url, fileName, onProgress);
        } else if (fileName.toLowerCase().endsWith('.gltf') || fileName.toLowerCase().endsWith('.glb')) {
            model = await loadGLTFModel(url, fileName, onProgress);
        } else {
            throw new Error('Неподдерживаемый формат файла');
        }

        scene.add(model);
        console.log(`Модель ${fileName} добавлена в сцену`);

        fitCameraToScene();

        return model;
    } catch (error) {
        console.error(`Ошибка при загрузке модели ${fileName}:`, error);
        return null;
    }
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
                    console.log(`Материал установлен для меша в модели ${fileName}`);
                }
            });
        }

        scene.add(model);
        console.log(`Модель ${fileName} добавлена в сцену`);

        // Центрируем камеру на модели
        fitCameraToScene();

        return model;
    } catch (error) {
        console.error(`Ошибка при загрузке IFC модели ${fileName}:`, error);
        return null;
    }
}
async function loadGLTFModel(url, fileName, onProgress) {
    return new Promise((resolve, reject) => {
        gltfLoader.load(
            url,
            (gltf) => {
                const model = gltf.scene;
                applyMaterialToModel(model, fileName);
                resolve(model);
            },
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
}

function applyMaterialToModel(model, fileName) {
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
                    side: THREE.DoubleSide
                });
            }
        });
    }
}
export function fitCameraToScene() {
    const box = new THREE.Box3().setFromObject(scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 * Math.tan(fov * 2));

    cameraZ *= 1.5;

    camera.position.set(center.x, center.y, center.z + cameraZ);
    camera.lookAt(center);

    controls.target.copy(center);
    controls.maxDistance = cameraZ * 2;
    controls.update();

    console.log('Камера и контролы подстроены под сцену');
}

export function debugScene() {
    console.log('Отладка сцены:');
    console.log('Количество объектов в сцене:', scene.children.length);
    scene.traverse((object) => {
        if (object.isMesh) {
            console.log('Меш:', object);
            console.log('Позиция меша:', object.position);
            console.log('Размер геометрии:', new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()));
        }
    });
    console.log('Позиция камеры:', camera.position);
    console.log('Направление камеры:', camera.getWorldDirection(new THREE.Vector3()));
    console.log('Цель контролов:', controls.target);
}