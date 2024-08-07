import { Color } from 'three';

export const msalConfig = {
    auth: {
        clientId: "b3769796-c138-408a-845b-50a2061010d8",
        authority: "https://login.microsoftonline.com/c74d26ef-abde-4789-86f9-99cc2e0e8751",
        redirectUri: "https://ifc.bimstart.info/"
    },
    cache: {
        cacheLocation: "sessionStorage",
        storeAuthStateInCookie: false
    }
};

export const loginRequest = {
    scopes: ["https://graph.microsoft.com/.default"]
};

export function log(message, data) {
    console.log(message, data || '');
    const logElement = document.getElementById('log');
    if (logElement) {
        logElement.innerHTML += `<p>${message} ${data ? JSON.stringify(data) : ''}</p>`;
    }
}