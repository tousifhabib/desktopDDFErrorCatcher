const selectFileButton = document.getElementById('selectFileButton');
const selectFolderButton = document.getElementById('selectFolderButton');
const runButton = document.getElementById('runButton');
const errorMessage = document.getElementById('errorMessage');
const resultContainer = document.getElementById('resultContainer');
const ddfPathInput = document.getElementById('ddfPath');

selectFileButton.addEventListener('click', () => handleSelection('file'));
selectFolderButton.addEventListener('click', () => handleSelection('folder'));
runButton.addEventListener('click', handleRunDDF);

async function handleSelection(type) {
    try {
        const path = await window.electron.selectDDFPath(type);
        ddfPathInput.value = path || '';
    } catch (error) {
        console.error(`Error selecting ${type}:`, error);
        errorMessage.textContent = `Error selecting ${type}: ${error.message}`;
    }
}

async function handleRunDDF() {
    clearMessages();

    const ddfPath = ddfPathInput.value;
    if (!ddfPath) {
        errorMessage.textContent = 'Please select a DDF file or folder.';
        return;
    }

    try {
        const results = await window.electron.runDDF(ddfPath);
        displayResults(results);
    } catch (error) {
        console.error('DDF error:', error);
        errorMessage.textContent = 'Error: ' + error.message;
    }
}

function clearMessages() {
    errorMessage.textContent = '';
    resultContainer.innerHTML = '';
}

function displayResults(results) {
    resultContainer.innerHTML = results.map(({file, ddf}) => {
        const errorContent = ddf.Response && ddf.Response.error ? formatError(ddf.Response.error) : '<p class="success-message">No error!</p>';
        return `
            <div class="result-item">
                <h3>${file}</h3>
                <pre>${errorContent}</pre>
            </div>
        `;
    }).join('');
}

function formatError(error) {
    if (typeof error === 'string') return error;
    if (typeof error === 'object') {
        return `YAMLException: ${error.reason}\n\n` +
            `  ${error.message}\n\n` +
            `${formatErrorSnippet(error.mark.snippet, error.mark.position)}\n\n` +
            `  ${JSON.stringify(error, null, 2)}`;
    }
    return JSON.stringify(error, null, 2);
}

function formatErrorSnippet(snippet, position) {
    const lines = snippet.split('\n');
    return lines.map((line, index) => `${String(index + 1).padStart(2)} | ${line}`).join('\n') +
        '\n' + ' '.repeat(position + 4) + '^';
}
