﻿import { msalConfig, loginRequest } from './config.js';
import { PROJECT_DATA } from './projectData.js';
import { initViewer, loadModel, clearScene, fitCameraToScene, debugScene } from './viewer.js';

let viewer;
let msalInstance;

function log(message, data) {
    console.log(message, data || '');
}

async function initMSAL() {
    msalInstance = new msal.PublicClientApplication(msalConfig);
    log('MSAL инициализирован');
}

async function getAccessToken() {
    try {
        const accounts = msalInstance.getAllAccounts();
        if (accounts.length === 0) {
            throw new Error("No accounts found");
        }
        msalInstance.setActiveAccount(accounts[0]);
        const response = await msalInstance.acquireTokenSilent(loginRequest);
        return response.accessToken;
    } catch (error) {
        log('Ошибка при получении токена', { error: error.message });
        if (error instanceof msal.InteractionRequiredAuthError) {
            const response = await msalInstance.acquireTokenPopup(loginRequest);
            return response.accessToken;
        } else {
            throw error;
        }
    }
}

async function getFolderContents(driveId, itemId) {
    const accessToken = await getAccessToken();
    const response = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/children`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
}

async function loadIFCFiles(sharedLink, projectName, specificPath) {
    try {
        const accessToken = await getAccessToken();
        log(`Попытка загрузки файлов для проекта: ${projectName}`);

        const url = new URL(sharedLink);
        const sitePath = url.pathname.split('/')[3];
        const siteUrl = `https://graph.microsoft.com/v1.0/sites/${url.hostname}:/sites/${sitePath}`;

        log(`Запрос информации о сайте: ${siteUrl}`);
        const siteResponse = await fetch(siteUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!siteResponse.ok) {
            throw new Error(`HTTP error when fetching site info! status: ${siteResponse.status}`);
        }
        const siteData = await siteResponse.json();
        log('Полученная информация о сайте:', siteData);

        log(`Запрос информации о drive для сайта с id: ${siteData.id}`);
        const driveResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteData.id}/drive`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!driveResponse.ok) {
            throw new Error(`HTTP error when fetching drive info! status: ${driveResponse.status}`);
        }
        const driveData = await driveResponse.json();
        log('Полученная информация о drive:', driveData);

        if (!driveData.id) {
            throw new Error('Drive ID не найден в ответе API');
        }

        log(`Запрос содержимого корневой папки drive: ${driveData.id}`);
        const rootFolderUrl = `https://graph.microsoft.com/v1.0/drives/${driveData.id}/root/children`;
        const rootFolderResponse = await fetch(rootFolderUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!rootFolderResponse.ok) {
            throw new Error(`HTTP error when fetching root folder content! status: ${rootFolderResponse.status}`);
        }
        let folderData = await rootFolderResponse.json();
        log('Содержимое корневой папки:', folderData);

        if (specificPath) {
            log(`Навигация по пути: ${specificPath}`);
            const pathParts = specificPath.split('/');
            for (const folderName of pathParts) {
                log(`Поиск папки: ${folderName}`);
                const folder = folderData.value.find(item => item.name === folderName && item.folder);
                if (!folder) {
                    throw new Error(`Папка ${folderName} не найдена в указанном пути`);
                }
                log(`Найдена папка: ${folderName}, id: ${folder.id}`);
                const folderContentUrl = `https://graph.microsoft.com/v1.0/drives/${driveData.id}/items/${folder.id}/children`;
                log(`Запрос содержимого папки: ${folderContentUrl}`);
                const folderContentResponse = await fetch(folderContentUrl, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                if (!folderContentResponse.ok) {
                    throw new Error(`HTTP error when fetching folder content! status: ${folderContentResponse.status}`);
                }
                folderData = await folderContentResponse.json();
                log(`Получено содержимое папки ${folderName}:`, folderData);
            }
        }

        log('Отображение структуры папок');
        displayFolderStructure(folderData.value, projectName, driveData.id);
    } catch (error) {
        log(`Ошибка при загрузке файлов для проекта ${projectName}`, { error: error.message });
        console.error('Полная ошибка:', error);
    }
}

function displayFolderStructure(items, projectName, driveId, parentElement = null) {
    console.log(`Отображение структуры для проекта ${projectName}, количество элементов: ${items.length}`);
    const structureElement = parentElement || document.getElementById('folder-structure');

    if (!parentElement) {
        structureElement.innerHTML = `<h2 class="text-xl font-bold mb-4">${projectName}</h2>`;
    }

    const ul = document.createElement('ul');

    // Сохраняем информацию о всех файлах в текущей папке
    window.currentFolderFiles = items;

    items.forEach(item => {
        console.log(`Обработка элемента: ${item.name}, тип: ${item.folder ? 'папка' : 'файл'}`);
        const li = document.createElement('li');
        li.className = item.folder ? 'folder' : 'file';

        if (item.folder) {
            const folderHeader = document.createElement('div');
            folderHeader.className = 'folder-header';

            const toggleButton = document.createElement('span');
            toggleButton.textContent = '▶';
            toggleButton.className = 'toggle-button';
            folderHeader.appendChild(toggleButton);

            const folderName = document.createElement('span');
            folderName.textContent = item.name;
            folderHeader.appendChild(folderName);

            li.appendChild(folderHeader);

            const folderContent = document.createElement('div');
            folderContent.className = 'folder-content';
            li.appendChild(folderContent);

            folderHeader.onclick = async (event) => {
                event.stopPropagation();
                li.classList.toggle('open');
                toggleButton.textContent = li.classList.contains('open') ? '▼' : '▶';
                if (li.classList.contains('open') && folderContent.children.length === 0) {
                    console.log(`Загрузка содержимого папки: ${item.name}`);
                    const subFolderContents = await getFolderContents(driveId, item.id);
                    displayFolderStructure(subFolderContents.value, null, driveId, folderContent);
                }
            };
        } else if (item.name.toLowerCase().endsWith('.ifc') ||
            item.name.toLowerCase().endsWith('.gltf') ||
            item.name.toLowerCase().endsWith('.glb')) {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'file-checkbox';
            checkbox.dataset.fileId = item.id;
            checkbox.dataset.fileName = item.name;
            li.appendChild(checkbox);

            const fileName = document.createElement('span');
            fileName.textContent = item.name;
            li.appendChild(fileName);

            li.onclick = (event) => {
                if (event.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                }
                event.stopPropagation();
                updateLoadButton();
            };
        } else {
            // Для других типов файлов просто отображаем имя
            const fileName = document.createElement('span');
            fileName.textContent = item.name;
            li.appendChild(fileName);
        }

        ul.appendChild(li);
    });

    structureElement.appendChild(ul);

    if (!parentElement) {
        const loadButton = document.createElement('button');
        loadButton.id = 'load-selected-files';
        loadButton.textContent = 'Загрузить выбранные файлы';
        loadButton.onclick = () => {
            const selectedFiles = getSelectedFiles();
            if (selectedFiles.length > 0) {
                loadSelectedModels(selectedFiles, driveId, window.currentFolderFiles);
            } else {
                alert('Пожалуйста, выберите файлы для загрузки');
            }
        };
        structureElement.appendChild(loadButton);
    }

    console.log('Структура папок отображена');
}

function getSelectedFiles() {
    const checkboxes = document.querySelectorAll('.file-checkbox:checked');
    return Array.from(checkboxes).map(checkbox => ({
        id: checkbox.dataset.fileId,
        name: checkbox.dataset.fileName
    }));
}

function updateLoadButton() {
    const selectedFiles = getSelectedFiles();
    const loadButton = document.getElementById('load-selected-files');
    if (loadButton) {
        loadButton.textContent = `Загрузить выбранные файлы (${selectedFiles.length})`;
    }
}

function setupFolderStructureVisibility() {
    const folderStructure = document.getElementById('folder-structure');
    let isVisible = false;
    let timeout;

    function showPanel() {
        folderStructure.classList.add('visible');
        isVisible = true;
    }

    function hidePanel() {
        folderStructure.classList.remove('visible');
        isVisible = false;
    }

    document.addEventListener('mousemove', (event) => {
        clearTimeout(timeout);
        if (event.clientX <= 10) {
            showPanel();
        } else if (isVisible && event.clientX > 310) {
            timeout = setTimeout(hidePanel, 300);
        }
    });

    folderStructure.addEventListener('mouseenter', () => {
        clearTimeout(timeout);
        showPanel();//
    });

    folderStructure.addEventListener('mouseleave', (event) => {
        if (event.clientX > 300) {
            timeout = setTimeout(hidePanel, 300);
        }
    });
}


async function loadSelectedModels(selectedFiles, driveId, allFiles) {
    console.log('Начало загрузки выбранных моделей', { selectedFilesCount: selectedFiles.length, driveId });

    if (!viewer) {
        console.log('Viewer не инициализирован, начинаем инициализацию');
        viewer = initViewer();
        if (!viewer) {
            console.error('ОШИБКА: Не удалось инициализировать viewer');
            return;
        }
        console.log('Viewer успешно инициализирован');
    }

    console.log('Очистка сцены перед загрузкой новых моделей');
    clearScene();

    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress');
    const progressText = document.getElementById('progress-text');
    progressContainer.style.display = 'block';

    const totalFiles = selectedFiles.length;
    let loadedFiles = 0;
    let totalProgress = 0;

    for (const file of selectedFiles) {
        console.log('Начало загрузки модели', { fileName: file.name, fileId: file.id });

        try {
            const accessToken = await getAccessToken();
            console.log('Получен токен доступа');

            const response = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${file.id}/content`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            if (!response.ok) {
                throw new Error(`Ошибка при получении файла: ${response.statusText}`);
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);

            console.log('Файл получен, начинаем загрузку в viewer', { fileName: file.name, url });

            let binBlob;
            if (file.name.toLowerCase().endsWith('.gltf')) {
                console.log('Обнаружен glTF файл, ищем соответствующий .bin файл');
                const binFileName = file.name.replace('.gltf', '.bin');
                console.log('Ожидаемое имя .bin файла:', binFileName);

                const binFile = allFiles.find(f => f.name === binFileName);
                if (binFile) {
                    console.log('Найден соответствующий .bin файл', binFile);
                    const binResponse = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${binFile.id}/content`, {
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    });
                    if (binResponse.ok) {
                        binBlob = await binResponse.blob();
                        console.log(`Соответствующий .bin файл загружен: ${binFileName}`);
                    } else {
                        console.log(`Ошибка при получении .bin файла: ${binResponse.statusText}`);
                    }
                } else {
                    console.log(`Предупреждение: Не найден соответствующий .bin файл для ${file.name}`);
                }
            }

            console.log('Вызов функции loadModel', { fileName: file.name, url, hasBinBlob: !!binBlob });
            const model = await loadModel(url, file.name, (progress) => {
                const fileProgress = progress * (1 / totalFiles);
                totalProgress = (loadedFiles / totalFiles) + fileProgress;
                const progressPercentage = Math.round(totalProgress * 100);
                progressBar.style.width = `${progressPercentage}%`;
                progressText.textContent = `${progressPercentage}% completed`;
                console.log('Прогресс загрузки', { fileName: file.name, progress: progressPercentage });
            }, binBlob);

            if (model) {
                console.log('Модель успешно загружена и добавлена на сцену', { fileName: file.name });
            } else {
                console.error('Ошибка: модель не была возвращена функцией loadModel', { fileName: file.name });
            }

            URL.revokeObjectURL(url);

            loadedFiles++;
            console.log('Файл обработан', { fileName: file.name, loadedFiles, totalFiles });
        } catch (error) {
            console.error('Ошибка при загрузке модели', { fileName: file.name, error: error.message, stack: error.stack });
        }
    }

    console.log('Загрузка и отображение моделей завершены');
    fitCameraToScene();

    debugScene();

    setTimeout(() => {
        progressContainer.style.display = 'none';
    }, 1000);
}

async function initApp() {
    log('DOM загружен, начало инициализации приложения');
    try {
        await initMSAL();
        const result = await msalInstance.handleRedirectPromise();

        let account = msalInstance.getAllAccounts()[0];
        if (!account) {
            log('Аккаунт не найден, начинаем процесс входа');
            await msalInstance.loginRedirect({
                scopes: ["https://graph.microsoft.com/.default"]
            });
        } else {
            msalInstance.setActiveAccount(account);
            log('Аккаунт найден и установлен как активный, загружаем проекты');
            log('PROJECT_DATA:', PROJECT_DATA);
            for (const [projectName, projectInfo] of Object.entries(PROJECT_DATA)) {
                await loadIFCFiles(projectInfo.sharedLink, projectName, projectInfo.specificPath);
            }
            setupFolderStructureVisibility();

            // Инициализируем viewer здесь
            if (!viewer) {
                viewer = initViewer();
                if (viewer) {
                    log('Viewer успешно инициализирован');
                } else {
                    console.error('ОШИБКА: Не удалось инициализировать viewer');
                }
            }
        }
    } catch (error) {
        console.error('Ошибка при инициализации приложения', error);
    }
}

document.addEventListener('DOMContentLoaded', initApp);