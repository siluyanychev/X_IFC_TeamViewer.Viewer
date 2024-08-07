// description: Сервер, который получает токен доступа к API Microsoft Graph
const express = require('express');
const msal = require('@azure/msal-node');

const app = express();

// Загрузка секрета из переменных окружения
const clientSecret = process.env.AZURE_SECRET;//

const config = {
    auth: {
        clientId: "b3769796-c138-408a-845b-50a2061010d8",
        authority: "https://login.microsoftonline.com/c74d26ef-abde-4789-86f9-99cc2e0e8751",
        clientSecret: clientSecret
    }
};

const cca = new msal.ConfidentialClientApplication(config);

app.get('/api/getToken', async (req, res) => {
    try {
        const response = await msalInstance.loginRedirect({
            scopes: ["https://graph.microsoft.com/.default"]
        });
        res.json({ accessToken: result.accessToken });
    } catch (error) {
        console.error(error);
        res.status(500).send(error.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));