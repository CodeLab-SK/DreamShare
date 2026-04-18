const API_URL = window.location.origin + '/api';

// Tab switching logic
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
    });
});

// File input changes
document.getElementById('ip-file-input').addEventListener('change', function(e) {
    const fileName = e.target.files[0]?.name;
    document.getElementById('ip-file-name').textContent = fileName ? `Selected: ${fileName}` : '';
});

document.getElementById('code-file-input').addEventListener('change', function(e) {
    const fileName = e.target.files[0]?.name;
    document.getElementById('code-file-name').textContent = fileName ? `Selected: ${fileName}` : '';
});

// Toast notification
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    
    // Trigger reflow
    void toast.offsetWidth;
    
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// FORMATTERS
function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}


// --- FEATURE 1: IP SHARE ---

async function fetchLocalData() {
    try {
        const res = await fetch(`${API_URL}/ip/data`);
        const data = await res.json();
        
        document.getElementById('ip-indicator').textContent = "Connected to Local Hive";
        
        renderLocalItems(data.texts, data.files);
    } catch (error) {
        console.error("Error fetching local data:", error);
        document.getElementById('ip-indicator').textContent = "Connection Error";
    }
}

function renderLocalItems(texts = [], files = []) {
    const list = document.getElementById('local-items-list');
    list.innerHTML = '';
    
    const allItems = [
        ...texts.map(t => ({ ...t, type: 'text' })),
        ...files.map(f => ({ ...f, type: 'file' }))
    ].sort((a, b) => b.timestamp - a.timestamp); // Newest first

    if (allItems.length === 0) {
        list.innerHTML = '<div class="empty-state">No items shared on this network yet.</div>';
        return;
    }

    allItems.forEach(item => {
        const card = document.createElement('div');
        card.className = 'item-card';
        
        if (item.type === 'text') {
            card.innerHTML = `
                <div class="item-header">
                    <span><i class='bx bx-text'></i> Text Snippet</span>
                    <span class="timestamp">${formatTime(item.timestamp)}</span>
                </div>
                <div class="item-content">
                    <pre>${escapeHtml(item.text)}</pre>
                </div>
                <div class="item-actions">
                    <button class="btn-small" style="background: rgba(239, 68, 68, 0.2); color: #fca5a5;" onclick="deleteText('${item.id}')">Delete</button>
                    <button class="btn-small" onclick="copyToClipboard('${escapeJs(item.text)}')">Copy</button>
                </div>
            `;
        } else {
            card.innerHTML = `
                <div class="item-header">
                    <span><i class='bx bx-file'></i> File: ${formatSize(item.size)}</span>
                    <span class="timestamp">${formatTime(item.timestamp)}</span>
                </div>
                <div class="item-content">
                    <strong>${escapeHtml(item.originalname)}</strong>
                </div>
                <div class="item-actions">
                    <button class="btn-small" style="background: rgba(239, 68, 68, 0.2); color: #fca5a5;" onclick="deleteFile('${item.filename}')">Delete</button>
                    <button class="btn-small" onclick="window.location.href='${API_URL}/ip/download/${item.filename}'">Download</button>
                </div>
            `;
        }
        
        list.appendChild(card);
    });
}

function escapeHtml(unsafe) {
    return (unsafe||"")
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function escapeJs(str) {
    return (str||"").replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '');
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast("Copied to clipboard!");
    }).catch(() => {
        showToast("Could not copy text");
    });
}

async function deleteText(id) {
    try {
        const res = await fetch(`${API_URL}/ip/text/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast("Text deleted");
            fetchLocalData();
        }
    } catch(err) {
        showToast("Failed to delete text");
    }
}

async function deleteFile(filename) {
    try {
        const res = await fetch(`${API_URL}/ip/file/${filename}`, { method: 'DELETE' });
        if (res.ok) {
            showToast("File removed from local network");
            fetchLocalData();
        }
    } catch(err) {
        showToast("Failed to remove file");
    }
}

async function clearAllTexts() {
    if(!confirm("Clear all your shared texts?")) return;
    try {
        const res = await fetch(`${API_URL}/ip/text`, { method: 'DELETE' });
        if (res.ok) {
            showToast("All texts cleared");
            fetchLocalData();
        }
    } catch(err) {
        showToast("Failed to clear texts");
    }
}

async function shareText() {
    const input = document.getElementById('ip-text-input');
    const text = input.value.trim();
    
    if (!text) return showToast("Please enter some text");

    const btn = event.currentTarget;
    btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/ip/text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        
        if (res.ok) {
            input.value = '';
            showToast("Text shared to local network!");
            fetchLocalData();
        }
    } catch(err) {
        showToast("Failed to share text");
    } finally {
        btn.disabled = false;
    }
}

async function shareLocalFile() {
    const fileInput = document.getElementById('ip-file-input');
    if (!fileInput.files[0]) return showToast("Please select a file");

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    const btn = event.currentTarget;
    btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/ip/upload`, {
            method: 'POST',
            body: formData
        });
        
        if (res.ok) {
            fileInput.value = '';
            document.getElementById('ip-file-name').textContent = '';
            showToast("File shared successfully!");
            fetchLocalData();
        }
    } catch(err) {
        showToast("Failed to share file");
    } finally {
        btn.disabled = false;
    }
}

// --- FEATURE 2: CODE SHARE ---

async function uploadCodeFile() {
    const fileInput = document.getElementById('code-file-input');
    if (!fileInput.files[0]) return showToast("Please select a file");

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    const btn = event.currentTarget;
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> Uploading...`;

    try {
        const res = await fetch(`${API_URL}/code/upload`, {
            method: 'POST',
            body: formData
        });
        
        const data = await res.json();
        if (data.success) {
            document.getElementById('generated-code-box').classList.remove('hidden');
            document.getElementById('the-generated-code').textContent = data.code;
            fileInput.value = '';
            document.getElementById('code-file-name').textContent = '';

            const qrcodeContainer = document.getElementById('qrcode-container');
            qrcodeContainer.innerHTML = '';
            const downloadUrl = `${window.location.origin}/api/code/download/${data.code}`;
            new QRCode(qrcodeContainer, {
                text: downloadUrl,
                width: 150,
                height: 150,
                colorDark : "#0f172a",
                colorLight : "#ffffff"
            });

            document.getElementById('code-timer').style.display = 'block';
            let timeLeft = 10 * 60; // 10 minutes
            if (window.codeInterval) clearInterval(window.codeInterval);
            
            const timerEl = document.getElementById('timer-countdown');
            timerEl.textContent = "10:00";
            
            window.codeInterval = setInterval(() => {
                timeLeft--;
                if (timeLeft <= 0) {
                    clearInterval(window.codeInterval);
                    timerEl.textContent = "Expired";
                    document.getElementById('generated-code-box').classList.add('hidden');
                } else {
                    const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
                    const s = (timeLeft % 60).toString().padStart(2, '0');
                    timerEl.textContent = `${m}:${s}`;
                }
            }, 1000);

            showToast("File uploaded! Use the code to download.");
        }
    } catch(err) {
        showToast("Failed to upload and generate code");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function copyCode() {
    const code = document.getElementById('the-generated-code').textContent;
    copyToClipboard(code);
}

async function downloadViaCode() {
    const codeInput = document.getElementById('receive-code-input');
    const code = codeInput.value.trim().toUpperCase();
    
    if (code.length < 3) return showToast("Please enter a valid code");

    // Initiate download
    window.location.href = `${API_URL}/code/download/${code}`;
}

// Init
fetchLocalData();
// Poll every 10 seconds for updates
setInterval(fetchLocalData, 10000);
