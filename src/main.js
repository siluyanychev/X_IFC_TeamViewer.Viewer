import { msalConfig, loginRequest, log } from './config.js';
import { PROJECT_DATA } from './projectData.js';
import { initViewer, loadIFCModel } from './viewer.js';

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
        structureElement.innerHTML = `<h2>${projectName}</h2>`;
    }
    const ul = document.createElement('ul');

    items.forEach(item => {
        log(`Обработка элемента: ${item.name}, тип: ${item.folder ? 'папка' : 'файл'}`);
        const li = document.createElement('li');
        li.textContent = item.name;
        li.className = item.folder ? 'folder' : 'file';

        if (item.folder) {
            const toggleButton = document.createElement('span');
            toggleButton.textContent = '▶';
            toggleButton.className = 'toggle-button';
            li.prepend(toggleButton);

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
            li.onclick = () => loadSelectedIFCModels([item], driveId);
        }

        ul.appendChild(li);
    });

    structureElement.appendChild(ul);
    log('Структура папок отображена');
}
async function loadSelectedIFCModels(selectedFiles, driveId) {
    log('Начало загрузки выбранных IFC моделей', { selectedFilesCount: selectedFiles.length });

    if (!viewer) {
        log('Viewer не инициализирован, начинаем инициализацию');
        viewer = initViewer();
    }

    for (const file of selectedFiles) {
        log('Загрузка IFC модели', { fileName: file.name, fileId: file.id });
        try {
            const accessToken = await getAccessToken();
            log('Токен получен для загрузки файла');

            const response = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${file.id}/content`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            if (!response.ok) {
                throw new Error(`Ошибка при получении файла: ${response.statusText}`);
            }

            const blob = await response.blob();
            log('Файл успешно получен', { size: blob.size, type: blob.type });

            const url = URL.createObjectURL(blob);
            log('URL создан для файла:', url);

            await loadIFCModel(url);
            log('IFC файл загружен в viewer');

            URL.revokeObjectURL(url);
        } catch (error) {
            log('Ошибка при загрузке IFC модели', { error: error.message, stack: error.stack });
            console.error('Полная ошибка:', error);
        }
    }

    log('Загрузка и отображение IFC моделей завершены');
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
        }
    } catch (error) {
        log('Ошибка при инициализации приложения', { error: error.message });
        console.error('Полная ошибка:', error);
    }
}

document.addEventListener('DOMContentLoaded', initApp);