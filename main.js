const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            enableRemoteModule: false,
        },
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

function setupIPCHandlers() {
    ipcMain.handle('select-file-path', handleSelectFilePath);
    ipcMain.handle('select-ddf-path', handleSelectDDFPath);
    ipcMain.handle('run-ddf', handleRunDDF);
}

async function handleSelectFilePath() {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
    });

    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
}

async function handleSelectDDFPath(event, type) {
    const properties = type === 'file' ? ['openFile'] : ['openDirectory'];
    const filters = type === 'file' ? [{ name: 'Excel Files', extensions: ['xlsx'] }] : [];

    const result = await dialog.showOpenDialog(mainWindow, {
        properties,
        filters,
    });

    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
}

async function handleRunDDF(event, ddfPath) {
    try {
        const { DDF } = await import('./ddf.mjs');
        const results = [];

        const processFile = (filePath) => {
            console.log('Processing file:', filePath); // Debug log
            const ddf = new DDF(filePath); // Use the absolute path directly
            results.push({ file: path.basename(filePath), ddf });
        };

        const stats = fs.statSync(ddfPath);

        if (stats.isDirectory()) {
            const files = fs.readdirSync(ddfPath);
            for (const file of files) {
                const filePath = path.resolve(ddfPath, file);
                if (path.extname(file).toLowerCase() === '.xlsx') {
                    processFile(filePath);
                }
            }
        } else {
            if (path.extname(ddfPath).toLowerCase() === '.xlsx') {
                processFile(ddfPath);
            } else {
                throw new Error('Invalid file extension. Please select an Excel file with .xlsx extension.');
            }
        }

        return results;
    } catch (error) {
        console.error('DDF error:', error);
        throw error;
    }
}

app.on('ready', () => {
    createWindow();
    setupIPCHandlers();
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', function () {
    if (mainWindow === null) {
        createWindow();
    }
});
