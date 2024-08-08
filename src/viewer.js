import * as THREE from 'three';
import { IFCLoader } from 'web-ifc-three/IFCLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

let scene, camera, renderer, controls;
let ifcLoader;

export function initViewer() {
    console.log('Начало инициализации IFC viewer');
    const container = document.getElementById('viewer-container');
    if (!container) {
        console.error('Не найден элемент с id "viewer-container"');
        return null;
    }

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    console.log('Сцена создана');

    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.z = 5;
    console.log('Камера создана');

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    console.log('Renderer создан и добавлен в DOM');

    controls = new OrbitControls(camera, renderer.domElement);
    console.log('OrbitControls инициализированы');

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

    animate();

    console.log('IFC viewer инициализирован');
    return { scene, camera, renderer, controls, ifcLoader };
}

// В viewer.js
export async function loadIFCModel(url, fileName) {
    console.log(`Начало загрузки IFC модели: ${fileName}`);
    try {
        const model = await new Promise((resolve, reject) => {
            ifcLoader.load(
                url,
                (model) => resolve(model),
                (progress) => {
                    console.log(`Загрузка ${fileName}: ${Math.round(progress.loaded / progress.total * 100)}%`);
                },
                (error) => reject(error)
            );
        });

        console.log(`IFC модель загружена: ${fileName}`, model);

        scene.add(model);

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
                    child.material = new THREE.MeshPhongMaterial({ color: color, transparent: true, opacity: 0.7 });
                }
            });
        }

        return model;
    } catch (error) {
        console.error(`Ошибка при загрузке IFC модели ${fileName}:`, error);
        return null;
    }
}



export function fitCameraToScene(object, offset = 1.5) {
    const boundingBox = new THREE.Box3().setFromObject(object);
    const center = boundingBox.getCenter(new THREE.Vector3());
    const size = boundingBox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 * Math.tan(fov * 2));
    cameraZ *= offset;
    camera.position.z = cameraZ;
    const minZ = boundingBox.min.z;
    const cameraToFarEdge = (minZ < 0) ? -minZ + cameraZ : cameraZ - minZ;
    camera.far = cameraToFarEdge * 3;
    camera.updateProjectionMatrix();
    if (controls) {
        controls.target = center;
        controls.maxDistance = cameraToFarEdge * 2;
    }
    camera.position.x = center.x;
    camera.position.y = center.y + (size.y / 2);
    camera.lookAt(center);
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
    while (scene.children.length > 0) {
        scene.remove(scene.children[0]);
    }
}