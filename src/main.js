import { msalConfig, loginRequest, log } from './config.js';
import { PROJECT_DATA } from './projectData.js';
import { initViewer, loadIFCModel, clearScene, fitCameraToScene } from './viewer.js';

let viewer;
let msalInstance;

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
    log(`Отображение структуры для проекта ${projectName}, количество элементов: ${items.length}`);
    const structureElement = parentElement || document.getElementById('folder-structure');
    if (!parentElement) {
        structureElement.innerHTML = `<h2 class="text-xl font-bold mb-4">${projectName}</h2>`;
    }
    const ul = document.createElement('ul');
    ul.className = 'ml-4';

    items.forEach(item => {
        log(`Обработка элемента: ${item.name}, тип: ${item.folder ? 'папка' : 'файл'}`);
        const li = document.createElement('li');
        li.className = item.folder ? 'folder my-2' : 'file my-1 flex items-center';

        if (item.folder) {
            const toggleButton = document.createElement('span');
            toggleButton.textContent = '▶';
            toggleButton.className = 'toggle-button mr-2 cursor-pointer';
            li.appendChild(toggleButton);

            const folderName = document.createElement('span');
            folderName.textContent = item.name;
            folderName.className = 'font-semibold';
            li.appendChild(folderName);

            toggleButton.onclick = async (event) => {
                event.stopPropagation();
                const folderContent = li.querySelector('ul');
                if (folderContent) {
                    folderContent.style.display = folderContent.style.display === 'none' ? 'block' : 'none';
                    toggleButton.textContent = folderContent.style.display === 'none' ? '▶' : '▼';
                } else {
                    log(`Загрузка содержимого папки: ${item.name}`);
                    const subFolderContents = await getFolderContents(driveId, item.id);
                    displayFolderStructure(subFolderContents.value, null, driveId, li);
                    toggleButton.textContent = '▼';
                }
            };
        } else if (item.name.toLowerCase().endsWith('.ifc')) {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'file-checkbox mr-2';
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
        }

        ul.appendChild(li);
    });

    structureElement.appendChild(ul);

    if (!parentElement) {
        const loadButton = document.createElement('button');
        loadButton.id = 'load-selected-files';
        loadButton.className = 'mt-4 bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded transition duration-300';
        loadButton.textContent = 'Загрузить выбранные файлы';
        loadButton.onclick = () => {
            const selectedFiles = getSelectedFiles();
            if (selectedFiles.length > 0) {
                loadSelectedIFCModels(selectedFiles, driveId);
            } else {
                alert('Пожалуйста, выберите файлы для загрузки');
            }
        };
        structureElement.appendChild(loadButton);
    }

    log('Структура папок отображена');
}
// Добавьте эту новую функцию для управления видимостью панели
function setupFolderStructureVisibility() {
    const folderStructure = document.getElementById('folder-structure');
    const viewerContainer = document.getElementById('viewer-container');
    let isVisible = true;
    let timeout;

    function showPanel() {
        folderStructure.style.transform = 'translateX(0)';
        viewerContainer.style.marginLeft = '300px';
        isVisible = true;
    }

    function hidePanel() {
        folderStructure.style.transform = 'translateX(-100%)';
        viewerContainer.style.marginLeft = '0';
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
        showPanel();
    });

    folderStructure.addEventListener('mouseleave', (event) => {
        if (event.clientX > 300) {
            timeout = setTimeout(hidePanel, 300);
        }
    });
}

function updateLoadButton() {
    const selectedFiles = getSelectedFiles();
    const loadButton = document.getElementById('load-selected-files');
    if (loadButton) {
        loadButton.textContent = `Загрузить выбранные файлы (${selectedFiles.length})`;
    }
}

function getSelectedFiles() {
    const checkboxes = document.querySelectorAll('.file-checkbox:checked');
    return Array.from(checkboxes).map(checkbox => ({
        id: checkbox.dataset.fileId,
        name: checkbox.dataset.fileName
    }));
}

async function loadSelectedIFCModels(selectedFiles, driveId) {
    log('Начало загрузки выбранных IFC моделей', { selectedFilesCount: selectedFiles.length });

    if (!viewer) {
        log('Viewer не инициализирован, начинаем инициализацию');
        viewer = initViewer();
        if (!viewer) {
            log('ОШИБКА: Не удалось инициализировать viewer');
            return;
        }
        log('Viewer успешно инициализирован');
    }

    clearScene(); // Очищаем сцену перед загрузкой новых моделей

    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress');
    const progressText = document.getElementById('progress-text');
    progressContainer.style.display = 'block';

    const totalFiles = selectedFiles.length;
    let loadedFiles = 0;

    for (const file of selectedFiles) {
        log('Начало загрузки IFC модели', { fileName: file.name, fileId: file.id });
        try {
            const accessToken = await getAccessToken();
            const response = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${file.id}/content`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            if (!response.ok) {
                throw new Error(`Ошибка при получении файла: ${response.statusText}`);
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);

            log('Файл получен, начинаем загрузку в viewer', { fileName: file.name });
            const model = await loadIFCModel(url, file.name);
            if (model) {
                log('IFC модель успешно загружена и добавлена на сцену', { fileName: file.name });
            } else {
                log('Ошибка: модель не была возвращена функцией loadIFCModel', { fileName: file.name });
            }

            URL.revokeObjectURL(url);

            loadedFiles++;
            const progress = (loadedFiles / totalFiles) * 100;
            progressBar.style.width = `${progress}%`;
            progressText.textContent = `${Math.round(progress)}% completed`;
        } catch (error) {
            log('Ошибка при загрузке IFC модели', { error: error.message, stack: error.stack });
        }
    }

    log('Загрузка и отображение IFC моделей завершены');
    fitCameraToScene(scene);

    // Скрываем прогресс-бар после завершения загрузки
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
        }
    } catch (error) {
        log('Ошибка при инициализации приложения', { error: error.message });
        console.error('Полная ошибка:', error);
    }
}

document.addEventListener('DOMContentLoaded', initApp);