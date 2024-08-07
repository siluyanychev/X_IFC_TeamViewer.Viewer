import * as THREE from 'three';
import { IFCLoader } from 'web-ifc-three/IFCLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

let scene, camera, renderer, controls;
let ifcLoader;

export function initViewer() {
    const container = document.getElementById('viewer-container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.z = 5;

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);

    const light = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(light);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(0, 10, 0);
    scene.add(directionalLight);

    ifcLoader = new IFCLoader();
    ifcLoader.ifcManager.setWasmPath('/web-ifc/');

    window.addEventListener('resize', onWindowResize);

    animate();

    console.log('IFC viewer инициализирован');
    return { scene, camera, renderer, controls, ifcLoader };
}

export async function loadIFCModel(url) {
    console.log('Начало загрузки IFC модели');
    try {
        const model = await ifcLoader.loadAsync(url);
        scene.add(model);
        console.log('IFC модель загружена', model);

        // Центрирование камеры на модели
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z);
        camera.position.copy(center);
        camera.position.z += maxDim * 2;
        camera.lookAt(center);

        controls.target.copy(center);
        controls.update();
    } catch (error) {
        console.error('Ошибка при загрузке IFC модели:', error);
    }
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