// ===================================================
// STATE — Local state frontend
// ===================================================

// Riwayat percakapan lengkap (disimpan di frontend)
let conversation = [];

// Konfigurasi aktif yang sinkron dengan server
let currentConfig = {
    useWebSearch: false, // Default diubah menjadi OFF untuk mode e-commerce
    activeDocument: null,
    activeDomain: 'ecommerce' // Default ke ecommerce
};

// ===================================================
// ONBOARDING TUTORIAL LOGIC
// ===================================================
document.addEventListener('DOMContentLoaded', () => {
    const hasSeenTutorial = localStorage.getItem('onboarding_done');
    if (!hasSeenTutorial) {
        document.getElementById('onboarding-overlay').style.display = 'flex';
    }
});

window.nextStep = function(stepObj) {
    document.querySelectorAll('.onboarding-step').forEach(el => el.style.display = 'none');
    document.getElementById(`step-${stepObj}`).style.display = 'block';
};

window.skipTutorial = function() {
    document.getElementById('onboarding-overlay').style.display = 'none';
    localStorage.setItem('onboarding_done', 'true');
    // Jika user berada di sini untuk pertama kali, beri sapaan awal
    if (chatBox.children.length === 0) {
        initApp();
    }
};

// ===================================================
// DOM ELEMENTS
// ===================================================
const chatForm     = document.getElementById('chat-form');
const userInput    = document.getElementById('user-input');
const chatBox      = document.getElementById('chat-box');
const sendBtn      = document.getElementById('send-btn');

const settingsBtn  = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeModal   = document.getElementById('close-modal');
const settingsForm = document.getElementById('settings-form');
const settingsStatus = document.getElementById('settings-status');

const modeBadge    = document.getElementById('mode-badge');
const modeBadgeText = document.getElementById('mode-badge-text');
const docBadge     = document.getElementById('doc-badge');
const docBadgeName = document.getElementById('doc-badge-name');
const clearChatBtn = document.getElementById('clear-chat-btn');

const currentDocInfo  = document.getElementById('current-doc-info');
const currentDocName  = document.getElementById('current-doc-name');
const currentDocChunks = document.getElementById('current-doc-chunks');

const activeDomainSelect = document.getElementById('active-domain');
const domainContainer = document.getElementById('domain-container');
const useWebSearchToggle = document.getElementById('use-web-search');

// ===================================================
// HELPER: URL API (dinamis, tidak hardcode)
// Prod/Deploy: gunakan relative path '/api/...'
// Fallback ke localhost:3000 jika membuka dari file://
// ===================================================
function getApiUrl(path) {
    if (window.location.protocol === 'file:') {
        // Dibuka langsung dari file system — fallback ke localhost
        const port = 3000; // sama dengan PORT di .env, atau ganti sesuai kebutuhan
        return `http://localhost:${port}${path}`;
    }
    // Di-serve oleh Express — gunakan URL relatif (berfungsi di semua environment)
    return path;
}

// ===================================================
// MARKDOWN RENDERER (aman + XSS-proof)
// ===================================================
function renderMarkdown(text) {
    if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(marked.parse(text));
    }
    return text.replace(/\n/g, '<br>');
}

// ===================================================
// UI: Update Mode Badge di header
// ===================================================
function updateModeBadge(isWebSearch, activeDomain = 'ecommerce') {
    if (isWebSearch) {
        modeBadge.className = 'mode-badge mode-websearch';
        modeBadge.innerHTML = '<i class="fas fa-globe"></i> <span id="mode-badge-text">Web Search</span>';
    } else {
        const domainLabels = {
            'ecommerce': 'E-Commerce',
            'kargo': 'Kargo',
            'restoran': 'Restoran',
            'perbankan': 'Perbankan'
        };
        const label = domainLabels[activeDomain] || 'Skill Mode';
        modeBadge.className = 'mode-badge mode-skill';
        modeBadge.innerHTML = `<i class="fas fa-tools"></i> <span id="mode-badge-text">${label}</span>`;
    }
}

// ===================================================
// UI: Update Document Badge di header
// ===================================================
function updateDocBadge(docInfo) {
    if (docInfo) {
        docBadge.style.display = 'flex';
        docBadge.querySelector('span').textContent = docInfo.name;
        docBadge.title = `Dokumen aktif: ${docInfo.name} (${docInfo.chunks} chunk, ${docInfo.sizeKb || '?'} KB)`;

        // Update info di dalam settings modal
        currentDocInfo.style.display = 'flex';
        currentDocName.textContent = docInfo.name;
        currentDocChunks.textContent = `— ${docInfo.chunks} chunk`;
    } else {
        docBadge.style.display = 'none';
        currentDocInfo.style.display = 'none';
    }
}

// ===================================================
// INIT: Sinkronisasi config dari server saat halaman load
// ===================================================
async function syncConfigFromServer() {
    try {
        const res = await fetch(getApiUrl('/api/config'));
        if (res.ok) {
            const data = await res.json();
            currentConfig.useWebSearch = data.useWebSearch;
            currentConfig.activeDocument = data.activeDocument;
            currentConfig.activeDomain = data.activeDomain || 'ecommerce';
            
            // Sinkronisasi toggle di modal
            useWebSearchToggle.checked = data.useWebSearch;
            activeDomainSelect.value = currentConfig.activeDomain;
            domainContainer.style.display = data.useWebSearch ? 'none' : 'flex';
            
            // Update UI badges
            updateModeBadge(data.useWebSearch, currentConfig.activeDomain);
            updateDocBadge(data.activeDocument);
        }
    } catch (e) {
        console.warn('Gagal sync config dari server:', e.message);
    }
}

// ===================================================
// CHAT: Tambah pesan ke DOM
// ===================================================
function appendMessage(role, text, id = null) {
    const div = document.createElement('div');
    if (id) div.id = id;
    div.classList.add('message', role);

    const bubble = document.createElement('div');
    bubble.classList.add('msg-bubble');
    
    if (role === 'user') {
        bubble.innerHTML = DOMPurify.sanitize(text);
    } else if (role === 'system') {
        bubble.innerHTML = text; // System messages: aman langsung dari script
    } else {
        bubble.innerHTML = renderMarkdown(text);
    }
    
    div.appendChild(bubble);
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    return div;
}

function appendTypingIndicator(id) {
    const div = document.createElement('div');
    div.id = id;
    div.classList.add('message', 'model');
    div.innerHTML = `<div class="msg-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function updateMessageWithMarkdown(id, text) {
    const el = document.getElementById(id);
    if (el) {
        el.querySelector('.msg-bubble').innerHTML = renderMarkdown(text);
    }
    chatBox.scrollTop = chatBox.scrollHeight;
}

// ===================================================
// CHAT: Submit pesan
// ===================================================
chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = userInput.value.trim();
    if (!text) return;

    appendMessage('user', text);
    conversation.push({ role: 'user', text });
    userInput.value = '';

    // Disable input saat menunggu respons
    userInput.disabled = true;
    sendBtn.disabled = true;

    const tempId = 'msg-' + Date.now();
    appendTypingIndicator(tempId);

    try {
        const response = await fetch(getApiUrl('/api/chat'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversation })
            // Catatan: sliding window MAX_HISTORY diterapkan di server (routes/api.js)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || data.error || `Server error ${response.status}`);
        }

        const aiText = data.response;
        if (aiText) {
            updateMessageWithMarkdown(tempId, aiText);
            conversation.push({ role: 'model', text: aiText });
        } else {
            throw new Error('Respons kosong dari AI');
        }

    } catch (error) {
        console.error('Chat error:', error);
        updateMessageWithMarkdown(tempId, `**⚠️ Gagal:** ${error.message}`);
        conversation.pop(); // Hapus pesan user dari history karena gagal
    } finally {
        userInput.disabled = false;
        sendBtn.disabled = false;
        userInput.focus();
    }
});

// ===================================================
// CHAT: Bersihkan / Reset percakapan
// ===================================================
clearChatBtn.addEventListener('click', () => {
    if (conversation.length === 0) return;
    if (!confirm('Yakin ingin menghapus semua percakapan?')) return;
    
    conversation = [];
    chatBox.innerHTML = '';
    appendMessage('system', '<i class="fas fa-broom"></i> Percakapan telah dibersihkan. Mulai topik baru!');
});

// ===================================================
// SETTINGS MODAL: Buka/Tutup
// ===================================================
settingsBtn.addEventListener('click', () => settingsModal.classList.add('show'));
closeModal.addEventListener('click', () => {
    settingsModal.classList.remove('show');
    settingsStatus.innerText = '';
});
window.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        settingsModal.classList.remove('show');
        settingsStatus.innerText = '';
    }
});

// ===================================================
// SETTINGS: Toggle custom prompt visibility
// ===================================================
document.getElementById('brand-voice-preset').addEventListener('change', (e) => {
    document.getElementById('custom-prompt-container').style.display =
        e.target.value === 'custom' ? 'block' : 'none';
});

// ===================================================
// SETTINGS: Toggle visibility for Web Search vs Skill Mode
// ===================================================
useWebSearchToggle.addEventListener('change', (e) => {
    domainContainer.style.display = e.target.checked ? 'none' : 'flex';
});

// ===================================================
// SETTINGS: Simpan konfigurasi ke server
// ===================================================
settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const presetVal = document.getElementById('brand-voice-preset').value;
    const customPrompt = document.getElementById('system-prompt').value;
    const finalBrandVoice = presetVal === 'custom' ? customPrompt : presetVal;
    const useWebSearch = useWebSearchToggle.checked;
    const activeDomain = activeDomainSelect.value;
    const fileInput = document.getElementById('knowledge-file');

    const formData = new FormData();
    formData.append('brandVoice', finalBrandVoice);
    formData.append('useWebSearch', useWebSearch);
    formData.append('activeDomain', activeDomain);
    if (fileInput.files.length > 0) {
        formData.append('document', fileInput.files[0]);
    }

    const btn = document.getElementById('save-settings-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
    btn.disabled = true;

    try {
        const response = await fetch(getApiUrl('/api/settings'), {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Server error');

        // Update local config state
        currentConfig.useWebSearch = useWebSearch;
        currentConfig.activeDomain = data.config?.activeDomain || activeDomain;
        if (data.config?.documentInfo) {
            currentConfig.activeDocument = data.config.documentInfo;
        }

        // Update UI badges secara langsung
        updateModeBadge(useWebSearch, currentConfig.activeDomain);
        updateDocBadge(currentConfig.activeDocument);

        // Notifikasi di chat bahwa konfigurasi berubah
        const domainLabels = {
            'ecommerce': 'E-Commerce',
            'kargo': 'Kargo',
            'restoran': 'Restoran',
            'perbankan': 'Perbankan'
        };
        const modeLabel = useWebSearch ? '<i class="fas fa-globe"></i> Web Search' : `<i class="fas fa-tools"></i> Skill Mode (${domainLabels[currentConfig.activeDomain]})`;
        const docLabel = currentConfig.activeDocument 
            ? `<i class="fas fa-file-alt"></i> Dokumen: ${currentConfig.activeDocument.name}` 
            : '';
        appendMessage('system', `<i class="fas fa-info-circle"></i> Konfigurasi diperbarui &mdash; Mode: ${modeLabel}${docLabel ? ' | ' + docLabel : ''}`);

        settingsStatus.style.color = '#10b981';
        settingsStatus.innerText = data.message || '✅ Konfigurasi berhasil diterapkan!';
        fileInput.value = '';

        setTimeout(() => {
            settingsModal.classList.remove('show');
            settingsStatus.innerText = '';
        }, 2000);

    } catch (err) {
        settingsStatus.style.color = '#ef4444';
        settingsStatus.innerText = '❌ Gagal: ' + err.message;
    } finally {
        btn.innerHTML = '<span>Simpan &amp; Terapkan</span> <i class="fas fa-check"></i>';
        btn.disabled = false;
    }
});

// ===================================================
// INIT: Memulai sapaan awal
// ===================================================
async function initApp() {
    // 1. Sinkronisasi config dari server
    await syncConfigFromServer();

    // 2. Cek apakah tutorial onboarding sudah selesai
    const hasSeenTutorial = localStorage.getItem('onboarding_done');
    if (hasSeenTutorial && chatBox.children.length === 0) {
        // Tampilkan pesan sambutan
        const welcomeText = `Halo! <i class="fas fa-hand-sparkles" style="color:var(--primary)"></i> Selamat datang di **AI Customer Service Enterprise**.

Saya siap membantu Anda. Beberapa hal yang bisa saya lakukan:

- <i class="fas fa-globe"></i> **Web Search ON** → Saya bisa mencari informasi terkini dari internet
- <i class="fas fa-tools"></i> **Skill Mode** *(toggle Web Search OFF)* → Saya bisa cek stok barang, tarif kargo, lokasi gudang
- <i class="fas fa-file-alt"></i> **Upload Dokumen** → Upload SOP atau referensi bisnis Anda agar jawaban saya lebih akurat

Klik <i class="fas fa-cog"></i> di kanan bawah untuk mengatur kepribadian dan mode saya. Ada yang bisa dibantu?`;

        appendMessage('model', welcomeText);
    }
}

// Terus jalankan inisialisasi awal, sapaan akan dipending oleh initApp jika onboarding aktif
initApp();
