/**
 * NPGALERY - CORE SCRIPT & PRICE LIST PERBANDINGAN HARGA
 * TERINTEGRASI PENUH DENGAN SUPABASE & FITUR BNIB BADGE
 * DILENGKAPI SISTEM SUPABASE AUTH, RLS, NOTES & REALTIME SYNC
 */

// KONFIGURASI KONEKSI SUPABASE
const SUPABASE_URL = "https://howayirmbfhyludvwvgn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhvd2F5aXJtYmZoeWx1ZHZ3dmduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1MzM5MDcsImV4cCI6MjEwNDEwOTkwN30.hRjCJzUjMOQSJmPW-AZ-WZKTN0TS6787A2vq4tQtF7Y";

let supabaseClient = null;
if (window.supabase && typeof window.supabase.createClient === 'function') {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// 1. DATA MASTER PRICE LIST (DIMUAT OTOMATIS DARI FILE JSON EKSTERNAL)
let rawPriceListData = [];

// 2. DATA MASTER DIAGNOSIS SYSTEM CHECK (DIMUAT DARI DIAGNOSIS.JSON)
let rawDiagnosisData = [];

let currentPage = 1;
const itemsPerPage = 10;
let currentFilteredData = [];
let currentEditId = null;

let activeReportCategory = 'kas';
let selectedPriceListModelIds = new Set();
let isReportAccordionOpen = false;

let daftarStokMasuk = JSON.parse(localStorage.getItem('npgalery_stok_masuk')) || [];
let daftarTerjual = JSON.parse(localStorage.getItem('npgalery_stok_terjual')) || [];
let daftarKasPribadi = JSON.parse(localStorage.getItem('npgalery_kas_pribadi')) || [];
let daftarNotes = JSON.parse(localStorage.getItem('npgalery_notes')) || [];

let activeInvoiceData = null;

// INSTANCE SCANNER KAMERA
let html5QrScannerInstance = null;

// STATE CHECKLIST DIAGNOSIS
let checkedDiagnosisCodes = new Set();

// STATE KALKULATOR KAS
let calcCurrentVal = "0";
let calcEquation = "";

// SINKRONISASI DATA AWAL DARI SUPABASE
async function syncFromSupabase() {
    if (!supabaseClient) return;
    try {
        // 1. Ambil Data Produk (Stok Ready) dari tabel 'product'
        await syncProductsFromSupabaseOnly();

        // 2. Ambil Data Penjualan (Transactions)
        await syncTransactionsFromSupabaseOnly();

        // 3. Ambil Mutasi Kas
        await syncCashFromSupabaseOnly();

        // 4. Ambil Data Notes / Catatan
        await syncNotesFromSupabaseOnly();
    } catch (err) {
        console.warn('Gagal sinkronisasi data dari Supabase:', err);
    }
}

// FUNGSI SINKRONISASI PARSIAL
async function syncProductsFromSupabaseOnly() {
    if (!supabaseClient) return;
    const { data: prods, error: errProds } = await supabaseClient
        .from('product')
        .select('*')
        .order('created_at', { ascending: false });

    if (!errProds && prods && prods.length > 0) {
        daftarStokMasuk = prods.filter(p => p.status === 'ready' || !p.status).map(p => ({
            id: p.id,
            produk: p.name,
            kondisi: p.condition || 'Second',
            kelengkapan: p.completeness || 'Fullset',
            imei: p.imei || '-',
            qty: String(p.qty || 1),
            hargaModal: String(p.buy_price || 0),
            hargaJual: String(p.sell_price || ''),
            pembeli: p.buyer || '',
            tanggal: p.date || (p.created_at ? p.created_at.slice(0, 10) : '')
        }));
        saveStokToStorage();
        renderDaftarStokMasuk();
        updateDashboardStats();
        renderLaporanKeuangan();
    }
}

async function syncTransactionsFromSupabaseOnly() {
    if (!supabaseClient) return;
    const { data: trx, error: errTrx } = await supabaseClient
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false });

    if (!errTrx && trx && trx.length > 0) {
        daftarTerjual = trx.map(t => ({
            id: t.id,
            produk: t.product_name,
            kondisi: t.condition || 'Second',
            kelengkapan: t.completeness || 'Fullset',
            imei: t.imei || '-',
            qty: String(t.qty || 1),
            hargaModal: String(t.buy_price || 0),
            hargaJual: String(t.sell_price || 0),
            pembeli: t.customer_name || '',
            tanggal: t.date || (t.created_at ? t.created_at.slice(0, 10) : ''),
            tanggalTerjualRaw: t.sold_date || (t.created_at ? t.created_at.slice(0, 10) : ''),
            modalStatus: t.modal_status || 'belum'
        }));
        saveTerjualToStorage();
        renderDaftarTerjual();
        renderDaftarModal();
        updateDashboardStats();
        renderLaporanKeuangan();
    }
}

async function syncCashFromSupabaseOnly() {
    if (!supabaseClient) return;
    const { data: mutasi, error: errMutasi } = await supabaseClient
        .from('cash_mutations')
        .select('*')
        .order('created_at', { ascending: false });

    if (!errMutasi && mutasi && mutasi.length > 0) {
        daftarKasPribadi = mutasi.map(m => ({
            id: m.id,
            keterangan: m.description,
            kategori: m.type,
            nominal: parseFloat(m.amount) || 0,
            tanggal: m.date || (m.created_at ? m.created_at.slice(0, 10) : '')
        }));
        saveKasToStorage();
        renderManajemenKas();
        updatePribadiStats();
        renderLaporanKeuangan();
    }
}

async function syncNotesFromSupabaseOnly() {
    if (!supabaseClient) return;
    try {
        const { data: notesData, error: errNotes } = await supabaseClient
            .from('notes')
            .select('*')
            .order('created_at', { ascending: false });

        if (!errNotes && notesData) {
            daftarNotes = notesData.map(n => ({
                id: n.id,
                title: n.title || 'Catatan',
                content: n.content || '',
                date: n.date || (n.created_at ? n.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10))
            }));
            saveNotesToStorage();
            renderDaftarNotes();
        }
    } catch (e) {
        console.warn('Gagal memuat tabel notes:', e);
    }
}

// SETUP SUPABASE REALTIME MULTI-DEVICE
function setupSupabaseRealtime() {
    if (!supabaseClient) return;

    supabaseClient
        .channel('npgalery-realtime-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'product' }, () => {
            syncProductsFromSupabaseOnly();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
            syncTransactionsFromSupabaseOnly();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_mutations' }, () => {
            syncCashFromSupabaseOnly();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, () => {
            syncNotesFromSupabaseOnly();
        })
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Realtime listener aktif untuk semua tabel NPGalery.');
            }
        });
}

// FUNGSI MEMUAT DATA DARI PRICELIST.JSON DAN LISTBNIB.JSON
async function loadPriceListData() {
    try {
        let oldData = [];
        try {
            const response = await fetch('pricelist.json');
            if (response.ok) oldData = await response.json();
        } catch (e) {
            console.warn('File pricelist.json tidak ditemukan atau kosong:', e);
        }

        let bnibData = [];
        try {
            const resBnib = await fetch('listbnib.json');
            if (resBnib.ok) bnibData = await resBnib.json();
        } catch (e) {
            console.warn('File listbnib.json tidak ditemukan atau kosong:', e);
        }

        let mergedMap = new Map();

        oldData.forEach(item => {
            let key = `${item.brand.trim().toUpperCase()} - ${item.model.trim().toUpperCase()}`;
            mergedMap.set(key, {
                id: item.id,
                brand: item.brand,
                model: item.model,
                jkt: item.jkt || '--',
                sgc: item.sgc || '--',
                bnib: item.bnib || '--'
            });
        });

        bnibData.forEach(item => {
            let key = `${item.brand.trim().toUpperCase()} - ${item.model.trim().toUpperCase()}`;
            if (mergedMap.has(key)) {
                let existing = mergedMap.get(key);
                if (item.bnib && item.bnib !== '--') {
                    existing.bnib = item.bnib;
                }
            } else {
                mergedMap.set(key, {
                    id: item.id || ('bnib-' + Math.random().toString(36).substr(2, 9)),
                    brand: item.brand,
                    model: item.model,
                    jkt: item.jkt || '--',
                    sgc: item.sgc || '--',
                    bnib: item.bnib || '--'
                });
            }
        });

        rawPriceListData = Array.from(mergedMap.values());
        
        selectedPriceListModelIds = new Set(rawPriceListData.map(p => p.id));
        initBrandDropdown();
        initReportBrandDropdown();
        filterPriceList();
        renderLaporanKeuangan();
    } catch (error) {
        console.warn('Memuat pricelist gagal:', error);
        rawPriceListData = [];
        initBrandDropdown();
        initReportBrandDropdown();
        filterPriceList();
        renderLaporanKeuangan();
    }
}

async function loadDiagnosisData() {
    try {
        const response = await fetch('diagnosis.json');
        if (!response.ok) throw new Error('File diagnosis.json tidak dapat dimuat');
        const data = await response.json();
        rawDiagnosisData = data.diagnosis_data || [];
    } catch (error) {
        console.warn('Memuat diagnosis.json gagal:', error);
        rawDiagnosisData = [];
    }
}

// INISIALISASI
document.addEventListener('DOMContentLoaded', async () => {
    const savedTheme = localStorage.getItem('npgalery_theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        const themeIcon = document.getElementById('theme-icon');
        if (themeIcon) themeIcon.classList.replace('fa-moon', 'fa-sun');
    }

    const authModal = document.getElementById('auth-modal');
    
    if (supabaseClient) {
        const { data: sessionData } = await supabaseClient.auth.getSession();
        if (sessionData && sessionData.session) {
            localStorage.setItem('npgalery_logged_in', 'true');
            if (authModal) authModal.classList.add('hidden');
        } else {
            const isLoggedIn = localStorage.getItem('npgalery_logged_in');
            if (authModal) {
                if (isLoggedIn === 'true') {
                    authModal.classList.add('hidden');
                } else {
                    authModal.classList.remove('hidden');
                }
            }
        }
    } else {
        const isLoggedIn = localStorage.getItem('npgalery_logged_in');
        if (authModal) {
            if (isLoggedIn === 'true') {
                authModal.classList.add('hidden');
            } else {
                authModal.classList.remove('hidden');
            }
        }
    }

    const protectionStatus = localStorage.getItem('npgalery_protection');
    const protBtn = document.getElementById('btn-protection');
    if (protBtn) {
        if (protectionStatus === 'unprotected') {
            protBtn.className = 'header-icon-btn status-unprotected';
            protBtn.title = 'Status Proteksi: Belum Terproteksi';
        } else {
            protBtn.className = 'header-icon-btn status-protected';
            protBtn.title = 'Status Proteksi: Aman & Terproteksi';
        }
    }

    loadPriceListData();
    loadDiagnosisData();
    
    renderDaftarStokMasuk(); 
    renderDaftarTerjual();
    renderDaftarModal(); 
    renderManajemenKas();
    renderDaftarNotes();
    updateDashboardStats();
    updatePribadiStats();

    initAllCustomDropdowns();

    // Panggil sinkronisasi awal dan aktifkan Realtime listener
    await syncFromSupabase();
    setupSupabaseRealtime();

    document.addEventListener('click', (e) => {
        const inputElem = document.getElementById('stok-produk-input');
        const listElem = document.getElementById('stok-autocomplete-list');
        if (inputElem && listElem && !inputElem.contains(e.target) && !listElem.contains(e.target)) {
            listElem.classList.add('hidden');
        }

        if (!e.target.closest('.custom-glass-dropdown')) {
            document.querySelectorAll('.custom-glass-dropdown.open').forEach(dd => dd.classList.remove('open'));
        }
    });
});

/* ========================================================== */
/* FITUR MANAJEMEN NOTES (CATATAN)                            */
/* ========================================================== */
window.toggleNoteForm = function() {
    document.getElementById('note-form-collapse')?.classList.toggle('collapsed');
    document.getElementById('icon-toggle-note-form')?.classList.toggle('rotated');
};

function saveNotesToStorage() {
    localStorage.setItem('npgalery_notes', JSON.stringify(daftarNotes));
}

window.simpanCatatanBaru = async function() {
    const titleInput = document.getElementById('note-title-input');
    const contentInput = document.getElementById('note-content-input');

    const title = titleInput.value.trim();
    const content = contentInput.value.trim();

    if (!title && !content) {
        showToast('Peringatan', 'Judul atau isi catatan tidak boleh kosong!', false);
        return;
    }

    const newNote = {
        id: 'note-' + Date.now(),
        title: title || 'Catatan Baru',
        content: content,
        date: new Date().toISOString().slice(0, 10)
    };

    daftarNotes.unshift(newNote);
    saveNotesToStorage();
    renderDaftarNotes();
    showToast('Tersimpan', 'Catatan berhasil ditambahkan.');

    titleInput.value = '';
    contentInput.value = '';
    toggleNoteForm();

    if (supabaseClient) {
        try {
            await supabaseClient.from('notes').insert([{
                id: newNote.id,
                title: newNote.title,
                content: newNote.content,
                date: newNote.date
            }]);
        } catch (e) {
            console.warn('Gagal menyimpan catatan ke Supabase:', e);
        }
    }
};

window.hapusCatatan = function(id) {
    showCustomConfirm("Hapus Catatan", "Yakin ingin menghapus catatan ini?", async () => {
        daftarNotes = daftarNotes.filter(n => n.id !== id);
        saveNotesToStorage();
        renderDaftarNotes();
        showToast('Berhasil', 'Catatan telah dihapus.', false);

        if (supabaseClient) {
            try {
                await supabaseClient.from('notes').delete().eq('id', id);
            } catch (e) {
                console.warn('Gagal menghapus catatan di Supabase:', e);
            }
        }
    });
};

function renderDaftarNotes() {
    const container = document.getElementById('notes-container');
    const badge = document.getElementById('badge-notes-count');
    if (!container) return;

    if (badge) badge.textContent = `${daftarNotes.length} Catatan`;

    if (daftarNotes.length === 0) {
        container.innerHTML = `<div class="empty-stok-msg">Belum ada catatan tersimpan.</div>`;
        return;
    }

    container.innerHTML = daftarNotes.map(n => `
        <div class="note-item-card">
            <div class="stok-item-top">
                <span class="stok-item-title">${n.title}</span>
                <div style="display: flex; gap: 4px;">
                    <button onclick="bukaEditCatatan('${n.id}')" class="action-btn edit-btn" title="Edit Catatan"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="hapusCatatan('${n.id}')" class="action-btn delete-btn" title="Hapus Catatan"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
            <div class="note-item-content">${n.content}</div>
            <div style="font-size: 10px; color: var(--text-secondary); margin-top: 4px;">
                <i class="fa-regular fa-clock"></i> ${formatTanggalID(n.date)}
            </div>
        </div>
    `).join('');
}

// MODAL & FUNGSI EDIT CATATAN
let activeEditNoteId = null;

function createEditNoteModalDOM() {
    if (document.getElementById('edit-note-modal')) return;
    document.body.insertAdjacentHTML('beforeend', `
        <div class="custom-modal-overlay" id="edit-note-modal">
            <div class="custom-modal-card">
                <div class="edit-modal-header">
                    <h3>Edit Catatan</h3>
                    <p style="font-size:12px; color:var(--azure-primary);">Perbarui Judul atau Isi Catatan</p>
                </div>
                <div class="edit-input-group">
                    <label>Judul Catatan</label>
                    <input type="text" id="edit-note-title-input">
                </div>
                <div class="edit-input-group" style="margin-top: 10px;">
                    <label>Isi Catatan</label>
                    <textarea id="edit-note-content-input" rows="4" style="width:100%; padding:8px 10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-card); color:var(--text-primary); font-family:inherit; font-size:12px; resize:vertical; box-sizing:border-box; outline:none;"></textarea>
                </div>
                <div class="edit-modal-actions" style="margin-top: 14px;">
                    <button class="btn-cancel" onclick="closeEditNoteModal()">Batal</button>
                    <button class="btn-save" onclick="simpanPerubahanCatatan()">Simpan Perubahan</button>
                </div>
            </div>
        </div>
    `);
}

window.bukaEditCatatan = function(id) {
    createEditNoteModalDOM();
    const note = daftarNotes.find(n => n.id === id);
    if (!note) return;

    activeEditNoteId = id;
    document.getElementById('edit-note-title-input').value = note.title;
    document.getElementById('edit-note-content-input').value = note.content;
    document.getElementById('edit-note-modal').classList.add('show');
};

window.closeEditNoteModal = function() {
    document.getElementById('edit-note-modal')?.classList.remove('show');
    activeEditNoteId = null;
};

window.simpanPerubahanCatatan = async function() {
    if (!activeEditNoteId) return;

    const newTitle = document.getElementById('edit-note-title-input').value.trim();
    const newContent = document.getElementById('edit-note-content-input').value.trim();

    if (!newTitle && !newContent) {
        showToast('Peringatan', 'Judul atau isi catatan tidak boleh kosong!', false);
        return;
    }

    const note = daftarNotes.find(n => n.id === activeEditNoteId);
    if (note) {
        note.title = newTitle || 'Catatan Baru';
        note.content = newContent;

        saveNotesToStorage();
        renderDaftarNotes();
        closeEditNoteModal();
        showToast('Berhasil', 'Catatan berhasil diperbarui.');

        if (supabaseClient) {
            try {
                await supabaseClient.from('notes').update({
                    title: note.title,
                    content: note.content
                }).eq('id', activeEditNoteId);
            } catch (e) {
                console.warn('Gagal memperbarui catatan di Supabase:', e);
            }
        }
    }
};

/* ========================================================== */
/* FITUR CEK IMEI & PORTAL WEBVIEW IN-APP                      */
/* ========================================================== */
window.openImeiCheckModal = function() {
    const modal = document.getElementById('imei-check-modal');
    if (modal) modal.classList.add('show');
};

window.closeImeiCheckModal = function() {
    const modal = document.getElementById('imei-check-modal');
    if (modal) modal.classList.remove('show');
};

window.openImeiPortal = function(url, brandTitle) {
    closeImeiCheckModal();
    const webModal = document.getElementById('imei-web-modal');
    const iframe = document.getElementById('imei-webview-frame');
    const titleElem = document.getElementById('inapp-webview-title');

    if (titleElem) titleElem.textContent = brandTitle;
    if (iframe) iframe.src = url;
    if (webModal) webModal.classList.add('show');
};

window.closeImeiWebModal = function() {
    const webModal = document.getElementById('imei-web-modal');
    const iframe = document.getElementById('imei-webview-frame');
    if (iframe) iframe.src = 'about:blank';
    if (webModal) webModal.classList.remove('show');
};

/* ========================================================== */
/* SCANNER KAMERA HP (HTML5-QRCODE) - DETEKSI RESMI KAMERA BELAKANG */
/* ========================================================== */
window.startImeiScanner = function() {
    const scannerModal = document.getElementById('scanner-modal');
    if (!scannerModal) return;

    if (typeof Html5Qrcode === 'undefined') {
        let fallback = prompt("Kamera web belum siap. Ketik nomor IMEI:", "");
        if (fallback) document.getElementById('stok-imei').value = fallback.trim();
        return;
    }

    scannerModal.classList.add('show');

    try {
        if (!html5QrScannerInstance) {
            html5QrScannerInstance = new Html5Qrcode("scanner-reader");
        }

        const qrConfig = {
            fps: 15,
            qrbox: { width: 260, height: 160 },
            aspectRatio: 1.0
        };

        const onScanSuccess = (decodedText) => {
            document.getElementById('stok-imei').value = decodedText.trim();
            showToast('IMEI Terpindai', `Berhasil memindai: ${decodedText}`);
            stopImeiScanner();
        };

        const onScanFailure = (errorMessage) => {
            // Mengabaikan frame tanpa barcode saat proses deteksi
        };

        // Deteksi ID kamera belakang secara eksplisit agar video tidak layar hitam
        Html5Qrcode.getCameras().then(devices => {
            if (devices && devices.length > 0) {
                // Cari kamera yang memiliki label 'back', 'rear', atau gunakan kamera terakhir
                let backCamera = devices.find(device => 
                    device.label.toLowerCase().includes('back') || 
                    device.label.toLowerCase().includes('rear') ||
                    device.label.toLowerCase().includes('environment')
                );

                let cameraId = backCamera ? backCamera.id : devices[devices.length - 1].id;

                html5QrScannerInstance.start(
                    cameraId,
                    qrConfig,
                    onScanSuccess,
                    onScanFailure
                ).catch(err => {
                    console.warn("Gagal memulai dengan Camera ID, beralih ke facingMode:", err);
                    html5QrScannerInstance.start(
                        { facingMode: "environment" },
                        qrConfig,
                        onScanSuccess,
                        onScanFailure
                    ).catch(innerErr => {
                        console.error("Gagal membuka kamera:", innerErr);
                        showToast('Kamera', 'Tidak dapat mengakses kamera perangkat.', false);
                        stopImeiScanner();
                    });
                });
            } else {
                // Fallback jika daftar kamera kosong
                html5QrScannerInstance.start(
                    { facingMode: "environment" },
                    qrConfig,
                    onScanSuccess,
                    onScanFailure
                ).catch(innerErr => {
                    console.error("Gagal membuka kamera:", innerErr);
                    showToast('Kamera', 'Tidak dapat mengakses kamera perangkat.', false);
                    stopImeiScanner();
                });
            }
        }).catch(err => {
            console.warn("Gagal getCameras, beralih ke facingMode:", err);
            html5QrScannerInstance.start(
                { facingMode: "environment" },
                qrConfig,
                onScanSuccess,
                onScanFailure
            ).catch(innerErr => {
                console.error("Gagal membuka kamera:", innerErr);
                showToast('Kamera', 'Tidak dapat mengakses kamera perangkat.', false);
                stopImeiScanner();
            });
        });

    } catch (e) {
        console.error("Scanner Error:", e);
        showToast('Kamera', 'Terjadi kesalahan sistem kamera.', false);
        stopImeiScanner();
    }
};

window.stopImeiScanner = function() {
    const scannerModal = document.getElementById('scanner-modal');
    if (scannerModal) scannerModal.classList.remove('show');

    if (html5QrScannerInstance) {
        html5QrScannerInstance.stop().then(() => {
            html5QrScannerInstance.clear();
            html5QrScannerInstance = null;
        }).catch(() => {
            try { html5QrScannerInstance.clear(); } catch(e) {}
            html5QrScannerInstance = null;
        });
    }
};

/* ========================================================== */
/* POP-UP CHAT WHATSAPP LANGSUNG                              */
/* ========================================================== */
window.openDirectWaModal = function() {
    const modal = document.getElementById('direct-wa-modal');
    if (modal) {
        document.getElementById('input-direct-wa-phone').value = '';
        document.getElementById('input-direct-wa-msg').value = '';
        modal.classList.add('show');
    }
};

window.closeDirectWaModal = function() {
    document.getElementById('direct-wa-modal')?.classList.remove('show');
};

window.submitDirectWa = function() {
    let phone = document.getElementById('input-direct-wa-phone').value.trim();
    let msg = document.getElementById('input-direct-wa-msg').value.trim();

    if (!phone) {
        showToast('Peringatan', 'Masukkan nomor WhatsApp terlebih dahulu!', false);
        return;
    }

    phone = phone.replace(/[^0-9]/g, '');
    if (phone.startsWith('0')) {
        phone = '62' + phone.substring(1);
    }

    let url = `https://api.whatsapp.com/send?phone=${phone}`;
    if (msg) {
        url += `&text=${encodeURIComponent(msg)}`;
    }

    window.open(url, '_blank');
    closeDirectWaModal();
};

/* ========================================================== */
/* LOGIKA SUB-TAB DIAGNOSIS (DINAMIS DARI DIAGNOSIS.JSON)     */
/* ========================================================== */
window.triggerDiagnosisCheck = function() {
    const inputVal = document.getElementById('diagnosis-input-model').value.trim();
    if (!inputVal) {
        showToast('Peringatan', 'Masukkan model HP terlebih dahulu!', false);
        return;
    }
    openDiagnosisModal(inputVal);
};

window.quickDiagnosisBrand = function(brandName) {
    document.getElementById('diagnosis-input-model').value = brandName;
    openDiagnosisModal(brandName);
};

window.toggleDiagnosisCheckItem = function(codeStr, isChecked) {
    if (isChecked) {
        checkedDiagnosisCodes.add(codeStr);
    } else {
        checkedDiagnosisCodes.delete(codeStr);
    }
    const card = document.getElementById(`diag-card-${btoa(codeStr).replace(/=/g, '')}`);
    if (card) {
        card.classList.toggle('checked-item', isChecked);
    }
};

function openDiagnosisModal(query) {
    const upperQuery = query.toUpperCase();
    const modalTitle = document.getElementById('diagnosis-modal-title');
    const modalSub = document.getElementById('diagnosis-modal-subtitle');
    const modalBody = document.getElementById('diagnosis-modal-body');
    const modal = document.getElementById('diagnosis-modal');

    if (!modalBody || !modal) return;

    let matchedBrandObj = rawDiagnosisData.find(b => upperQuery.includes(b.brand.toUpperCase()));

    let targetCodes = [];
    if (matchedBrandObj && matchedBrandObj.codes) {
        modalTitle.innerHTML = `<i class="fa-solid fa-stethoscope" style="color: var(--azure-primary); margin-right: 6px;"></i> Diagnosis: ${matchedBrandObj.brand.toUpperCase()}`;
        modalSub.textContent = `Daftar kode & langkah cek resmi untuk: "${query}"`;
        targetCodes = matchedBrandObj.codes.map(c => ({ code: c.code, name: c.description }));
    } else {
        modalTitle.innerHTML = `<i class="fa-solid fa-stethoscope" style="color: var(--azure-primary); margin-right: 6px;"></i> Diagnosis: ${query}`;
        modalSub.textContent = `Daftar kode dial umum perangkat`;
        targetCodes = [
            { code: "*#06#", name: "Cek Nomor IMEI" },
            { code: "*#*#4636#*#*", name: "Info Jaringan & Baterai / Statistik" }
        ];
    }

    let codesHtml = targetCodes.map(c => {
        const isChecked = checkedDiagnosisCodes.has(c.code);
        const domId = `diag-card-${btoa(c.code).replace(/=/g, '')}`;
        return `
            <div id="${domId}" class="diag-code-card ${isChecked ? 'checked-item' : ''}">
                <div class="diag-left-wrap">
                    <label class="checkbox-model-item" style="width: auto;">
                        <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleDiagnosisCheckItem('${c.code}', this.checked)">
                    </label>
                    <div>
                        <b class="diag-code-title">${c.code}</b><br>
                        <span style="color: var(--text-secondary); font-size: 10px;">${c.name}</span>
                    </div>
                </div>
                <button onclick="navigator.clipboard.writeText('${c.code}'); showToast('Tersalin', 'Kode ${c.code} disalin.');" class="btn-select-ctrl"><i class="fa-solid fa-copy"></i> Salin</button>
            </div>
        `;
    }).join('');

    modalBody.innerHTML = codesHtml;
    modal.classList.add('show');
}

window.closeDiagnosisModal = function() {
    document.getElementById('diagnosis-modal')?.classList.remove('show');
};

/* ========================================================== */
/* LOGIKA KALKULATOR CEPAT KAS                                */
/* ========================================================== */
window.openKasCalculator = function() {
    calcCurrentVal = "0";
    calcEquation = "";
    updateCalcDisplay();
    document.getElementById('calc-modal')?.classList.add('show');
};

window.closeKasCalculator = function() {
    document.getElementById('calc-modal')?.classList.remove('show');
};

function updateCalcDisplay() {
    const curElem = document.getElementById('calc-current');
    const histElem = document.getElementById('calc-history');
    if (curElem) curElem.textContent = calcCurrentVal;
    if (histElem) histElem.textContent = calcEquation;
}

window.calcAppendNumber = function(num) {
    if (calcCurrentVal === "0" && num !== ".") {
        calcCurrentVal = num;
    } else {
        calcCurrentVal += num;
    }
    updateCalcDisplay();
};

window.calcAppendDot = function() {
    if (!calcCurrentVal.includes('.')) {
        calcCurrentVal += '.';
        updateCalcDisplay();
    }
};

window.calcAppendOp = function(op) {
    calcEquation += (calcCurrentVal + " " + op + " ");
    calcCurrentVal = "0";
    updateCalcDisplay();
};

window.calcClear = function() {
    calcCurrentVal = "0";
    calcEquation = "";
    updateCalcDisplay();
};

window.calcBackspace = function() {
    if (calcCurrentVal.length > 1) {
        calcCurrentVal = calcCurrentVal.slice(0, -1);
    } else {
        calcCurrentVal = "0";
    }
    updateCalcDisplay();
};

window.calcCalculate = function() {
    try {
        let fullExpr = calcEquation + calcCurrentVal;
        let cleanExpr = fullExpr.replace(/×/g, '*').replace(/÷/g, '/');
        if (!/^[0-9+\-*/. ]+$/.test(cleanExpr)) return;
        let res = Function('"use strict";return (' + cleanExpr + ')')();
        calcEquation = "";
        calcCurrentVal = String(Math.round(res));
        updateCalcDisplay();
    } catch(e) {
        calcCurrentVal = "Error";
        updateCalcDisplay();
    }
};

window.applyCalculatorResult = function() {
    calcCalculate();
    let finalVal = parseInt(calcCurrentVal, 10);
    if (!isNaN(finalVal) && finalVal >= 0) {
        document.getElementById('kas-nominal').value = finalVal.toLocaleString('id-ID');
        showToast('Kalkulator', 'Hasil perhitungan dimasukkan ke form kas.');
    }
    closeKasCalculator();
};

/* ========================================================== */
/* CUSTOM GLASS DROPDOWN & UTILITIES                          */
/* ========================================================== */
function buildCustomDropdown(selectElem) {
    if (!selectElem) return;

    let existingCustom = selectElem.nextElementSibling;
    if (existingCustom && existingCustom.classList.contains('custom-glass-dropdown')) {
        existingCustom.remove();
    }

    selectElem.classList.add('native-hidden-select');

    const wrapper = document.createElement('div');
    wrapper.className = 'custom-glass-dropdown';
    wrapper.setAttribute('data-target-id', selectElem.id);

    const selectedOption = selectElem.options[selectElem.selectedIndex] || selectElem.options[0];
    const trigger = document.createElement('div');
    trigger.className = 'custom-dropdown-trigger';
    trigger.innerHTML = `
        <span class="custom-dropdown-label">${selectedOption ? selectedOption.textContent : ''}</span>
        <i class="fa-solid fa-chevron-down custom-dropdown-icon"></i>
    `;

    const menu = document.createElement('ul');
    menu.className = 'custom-dropdown-menu';

    Array.from(selectElem.options).forEach(opt => {
        const item = document.createElement('li');
        item.className = `custom-dropdown-item ${opt.value === selectElem.value ? 'active' : ''}`;
        item.textContent = opt.textContent;
        item.setAttribute('data-val', opt.value);

        item.addEventListener('click', (ev) => {
            ev.stopPropagation();
            selectElem.value = opt.value;
            trigger.querySelector('.custom-dropdown-label').textContent = opt.textContent;

            menu.querySelectorAll('.custom-dropdown-item').forEach(li => li.classList.remove('active'));
            item.classList.add('active');
            wrapper.classList.remove('open');

            selectElem.dispatchEvent(new Event('change', { bubbles: true }));
        });

        menu.appendChild(item);
    });

    trigger.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const isOpen = wrapper.classList.contains('open');
        document.querySelectorAll('.custom-glass-dropdown.open').forEach(dd => dd.classList.remove('open'));
        if (!isOpen) wrapper.classList.add('open');
    });

    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);
    selectElem.parentNode.insertBefore(wrapper, selectElem.nextSibling);
}

function initAllCustomDropdowns() {
    const targets = [
        '#filter-brand-select',
        '#stok-kondisi',
        '#stok-kelengkapan',
        '#filter-kas-kategori',
        '#kas-kategori',
        '#export-format-select',
        '#report-filter-kas-kategori',
        '#report-filter-brand-select',
        '#report-main-category-select'
    ];
    targets.forEach(sel => {
        const el = document.querySelector(sel);
        if (el) buildCustomDropdown(el);
    });
}

function saveStokToStorage() { localStorage.setItem('npgalery_stok_masuk', JSON.stringify(daftarStokMasuk)); }
function saveTerjualToStorage() { localStorage.setItem('npgalery_stok_terjual', JSON.stringify(daftarTerjual)); }
function saveKasToStorage() { localStorage.setItem('npgalery_kas_pribadi', JSON.stringify(daftarKasPribadi)); }

function updateDashboardStats() {
    let sumStok = daftarStokMasuk.reduce((sum, item) => sum + parseInt(item.qty || 1), 0);
    let sumTerjual = daftarTerjual.reduce((sum, item) => sum + parseInt(item.qty || 1), 0);
    let totalOmset = 0;
    let totalProfit = 0; 
    
    daftarTerjual.forEach(item => {
        let qty = parseInt(item.qty || 1);
        let hargaJual = parseRawToNumeric(item.hargaJual) || 0;
        let hargaModal = parseRawToNumeric(item.hargaModal) || 0;
        totalOmset += (hargaJual * qty);
        totalProfit += ((hargaJual - hargaModal) * qty); 
    });

    const keuntunganQtyElem = document.getElementById('keuntungan-qty');
    const keuntunganNominalElem = document.getElementById('keuntungan-nominal');
    
    if (keuntunganQtyElem) keuntunganQtyElem.textContent = `${sumTerjual} Unit`;
    if (keuntunganNominalElem) keuntunganNominalElem.textContent = formatRupiah(totalProfit);

    const sideCards = document.querySelectorAll('.stat-side-group .stat-card');
    if (sideCards.length >= 2) {
        const stokDiv = sideCards[0].querySelector('div');
        if (stokDiv) stokDiv.innerHTML = `<span class="stat-label-small">Stok Ready</span><h4 class="stat-value-small">${sumStok} Unit</h4>`;
        const terjualDiv = sideCards[1].querySelector('div');
        if (terjualDiv) terjualDiv.innerHTML = `<span class="stat-label-small">Terjual</span><h4 class="stat-value-small">${sumTerjual} Unit</h4><span style="font-size: 9.5px; font-weight: 700; color: var(--status-safe); display: block; margin-top: 1px; font-family: var(--font-mono);">${formatRupiah(totalOmset)}</span>`;
    }
}

function updatePribadiStats() {
    let totalMasuk = 0;
    let totalKeluar = 0;
    daftarKasPribadi.forEach(item => {
        let nominal = parseFloat(item.nominal) || 0;
        if (item.kategori === 'masuk') totalMasuk += nominal;
        else if (item.kategori === 'keluar') totalKeluar += nominal;
    });

    let saldoAktif = totalMasuk - totalKeluar;
    const cards = document.querySelectorAll('.stats-pribadi-grid .pribadi-card');
    if (cards.length >= 2) {
        const saldoValElem = cards[0].querySelector('.pribadi-value');
        const pengeluaranValElem = cards[1].querySelector('.pribadi-value');
        if (saldoValElem) saldoValElem.textContent = formatRupiah(saldoAktif);
        if (pengeluaranValElem) pengeluaranValElem.textContent = formatRupiah(totalKeluar);
    }
}

function formatTanggalID(dateString) {
    if (!dateString) return '';
    const parts = dateString.split('-');
    if (parts.length !== 3) return dateString;
    return `${parts[2]} - ${parts[1]} - ${parts[0]}`;
}

function formatRupiah(num) {
    if (num === null || isNaN(num)) return 'Rp 0';
    return 'Rp ' + num.toLocaleString('id-ID');
}

function parseRawToNumeric(valStr) {
    if (!valStr || valStr.trim() === '--' || valStr.trim() === '') return null;
    let clean = valStr.toString().trim().replace(/\./g, '');
    let num = parseFloat(clean);
    if (isNaN(num)) return null;
    if (num < 10000) return num * 1000;
    return num;
}

function formatDisplayPrice(priceString) {
    if (!priceString || priceString.trim() === '--') return '--';
    const parts = priceString.split('/');
    const formattedParts = parts.map(part => {
        const val = parseRawToNumeric(part);
        return val !== null ? formatRupiah(val) : '--';
    });
    return formattedParts.join(' / ');
}

function getHighestNumericPrice(priceString) {
    if (!priceString || priceString.trim() === '--') return null;
    const parts = priceString.split('/');
    let maxVal = null;
    parts.forEach(part => {
        const val = parseRawToNumeric(part);
        if (val !== null && (maxVal === null || val > maxVal)) maxVal = val;
    });
    return maxVal;
}

function showToast(title, desc, isSuccess = true) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toastId = 'toast-' + Date.now();
    const iconClass = isSuccess ? 'fa-circle-check' : 'fa-triangle-exclamation';
    const borderColor = isSuccess ? 'var(--status-safe)' : 'var(--status-unsafe)';

    const toastHtml = `
        <div id="${toastId}" class="toast-msg" style="border-left-color: ${borderColor};">
            <i class="fa-solid ${iconClass}" style="color: ${borderColor};"></i>
            <div class="toast-content"><span class="toast-title">${title}</span><span class="toast-desc">${desc}</span></div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', toastHtml);
    const toastEl = document.getElementById(toastId);
    setTimeout(() => { if (toastEl) toastEl.remove(); }, 3000);
}

function getBrandStyle(brandName) {
    const b = brandName.trim().toUpperCase();
    let color = 'var(--azure-primary)', bg = 'var(--card-bg)', border = 'var(--border-subtle)';
    if (b.includes('INFINIX')) { color = '#10B981'; bg = 'rgba(16, 185, 129, 0.12)'; border = 'rgba(16, 185, 129, 0.3)'; } 
    else if (b.includes('SAMSUNG')) { color = '#3B82F6'; bg = 'rgba(59, 130, 246, 0.12)'; border = 'rgba(59, 130, 246, 0.3)'; }
    else if (b.includes('OPPO')) { color = '#059669'; bg = 'rgba(5, 150, 105, 0.12)'; border = 'rgba(5, 150, 105, 0.3)'; }
    else if (b.includes('XIAOMI') || b.includes('POCO') || b.includes('REDMI')) { color = '#EF4444'; bg = 'rgba(239, 68, 68, 0.12)'; border = 'rgba(239, 68, 68, 0.3)'; }
    else if (b.includes('VIVO')) { color = '#8B5CF6'; bg = 'rgba(139, 92, 246, 0.12)'; border = 'rgba(139, 92, 246, 0.3)'; }
    else if (b.includes('REALME')) { color = '#D97706'; bg = 'rgba(217, 119, 6, 0.12)'; border = 'rgba(217, 119, 6, 0.3)'; }
    else if (b.includes('TECNO')) { color = '#2563EB'; bg = 'rgba(37, 99, 235, 0.12)'; border = 'rgba(37, 99, 235, 0.3)'; }
    else if (b.includes('ITEL')) { color = '#DC2626'; bg = 'rgba(220, 38, 38, 0.12)'; border = 'rgba(220, 38, 38, 0.3)'; }
    return `color: ${color}; background-color: ${bg}; border-color: ${border};`;
}

/* PRICE LIST & KATALOG DENGAN DUKUNGAN BNIB */
window.addNewProduct = function() {
    const nameInput = document.getElementById('add-input-name').value.trim();
    const jktInput = document.getElementById('add-input-jkt').value.trim();
    const sgcInput = document.getElementById('add-input-sgc').value.trim();
    const bnibInput = document.getElementById('add-input-bnib') ? document.getElementById('add-input-bnib').value.trim() : '';
    
    if(nameInput === '') { showToast('Peringatan', 'Nama produk tidak boleh kosong!', false); return; }

    const parts = nameInput.split(' ');
    const detectedBrand = parts[0].toUpperCase();
    const detectedModel = parts.length > 1 ? parts.slice(1).join(' ') : nameInput;

    let maxId = 0;
    rawPriceListData.forEach(item => { const idNum = parseInt(item.id); if(!isNaN(idNum) && idNum > maxId) maxId = idNum; });
    
    let newId = (maxId + 1).toString();
    rawPriceListData.unshift({ 
        id: newId, 
        brand: detectedBrand, 
        model: detectedModel, 
        jkt: jktInput || '--', 
        sgc: sgcInput || '--',
        bnib: bnibInput || '--'
    });
    selectedPriceListModelIds.add(newId);

    initBrandDropdown(); initReportBrandDropdown(); filterPriceList(); renderLaporanKeuangan();
    document.getElementById('add-input-name').value = ''; 
    document.getElementById('add-input-jkt').value = ''; 
    document.getElementById('add-input-sgc').value = ''; 
    if (document.getElementById('add-input-bnib')) document.getElementById('add-input-bnib').value = '';
    showToast('Berhasil!', `Produk baru masuk ke merek: ${detectedBrand}.`);
};

function createEditModalDOM() {
    if (document.getElementById('edit-custom-modal')) return;
    const modalHtml = `
        <div class="custom-modal-overlay" id="edit-custom-modal">
            <div class="custom-modal-card">
                <div class="edit-modal-header"><h3>Edit Harga</h3><p id="edit-modal-subtitle" style="font-size:12px; color:var(--azure-primary);">Model HP</p></div>
                <div class="edit-input-group"><label>Harga Jakarta</label><input type="text" id="edit-input-jkt"></div>
                <div class="edit-input-group"><label>Harga Cikarang</label><input type="text" id="edit-input-sgc"></div>
                <div class="edit-input-group"><label>Harga BNIB</label><input type="text" id="edit-input-bnib"></div>
                <div class="edit-modal-actions"><button class="btn-cancel" onclick="closeEditModal()">Batal</button><button class="btn-save" onclick="saveEditModal()">Simpan</button></div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

window.editProduct = function(id) {
    createEditModalDOM();
    const item = rawPriceListData.find(p => p.id === id);
    if(item) {
        currentEditId = id;
        document.getElementById('edit-modal-subtitle').textContent = `${item.brand} - ${item.model}`;
        document.getElementById('edit-input-jkt').value = item.jkt || '';
        document.getElementById('edit-input-sgc').value = item.sgc || '';
        if (document.getElementById('edit-input-bnib')) {
            document.getElementById('edit-input-bnib').value = item.bnib || '--';
        }
        document.getElementById('edit-custom-modal').classList.add('show');
    }
};

window.closeEditModal = function() { document.getElementById('edit-custom-modal')?.classList.remove('show'); currentEditId = null; };

window.saveEditModal = function() {
    if (!currentEditId) return;
    const item = rawPriceListData.find(p => p.id === currentEditId);
    if(item) {
        item.jkt = document.getElementById('edit-input-jkt').value.trim() || '--';
        item.sgc = document.getElementById('edit-input-sgc').value.trim() || '--';
        if (document.getElementById('edit-input-bnib')) {
            item.bnib = document.getElementById('edit-input-bnib').value.trim() || '--';
        }
        closeEditModal(); filterPriceList(); showToast('Berhasil!', 'Perubahan harga disimpan.');
    }
};

window.deleteProduct = function(id) {
    showCustomConfirm("Hapus Model", "Yakin ingin menghapus model dari katalog?", () => {
        rawPriceListData = rawPriceListData.filter(p => p.id !== id);
        selectedPriceListModelIds.delete(id);
        initBrandDropdown(); initReportBrandDropdown(); filterPriceList(); renderLaporanKeuangan(); showToast('Berhasil', 'Produk dihapus.', false);
    });
};

function initBrandDropdown() {
    const brandSelect = document.getElementById('filter-brand-select');
    if (!brandSelect) return;
    brandSelect.innerHTML = '<option value="ALL">Semua Merk</option>';
    Array.from(new Set(rawPriceListData.map(item => item.brand.trim()))).sort().forEach(brand => {
        const opt = document.createElement('option'); opt.value = brand; opt.textContent = brand; brandSelect.appendChild(opt);
    });
    buildCustomDropdown(brandSelect);
}

function initReportBrandDropdown() {
    const brandSelect = document.getElementById('report-filter-brand-select');
    if (!brandSelect) return;
    brandSelect.innerHTML = '<option value="ALL">Semua Merk</option>';
    Array.from(new Set(rawPriceListData.map(item => item.brand.trim()))).sort().forEach(brand => {
        const opt = document.createElement('option'); opt.value = brand; opt.textContent = brand; brandSelect.appendChild(opt);
    });
    buildCustomDropdown(brandSelect);
}

function filterPriceList() {
    const searchVal = document.getElementById('filter-model-input').value.toLowerCase().trim();
    const brandVal = document.getElementById('filter-brand-select').value;
    currentFilteredData = rawPriceListData.filter(item => {
        return (brandVal === 'ALL' || item.brand.trim() === brandVal) && (item.model.toLowerCase().includes(searchVal) || item.brand.toLowerCase().includes(searchVal));
    });
    currentPage = 1; renderPage();
}

function renderPage() {
    const container = document.getElementById('pricelist-container');
    const badgeCount = document.getElementById('pricelist-count-badge');
    if (!container) return;
    const totalItems = currentFilteredData.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (badgeCount) badgeCount.textContent = `Menampilkan ${totalItems} Item`;

    if (totalItems === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-file-circle-xmark icon-placeholder"></i><h2>Tidak Ditemukan</h2></div>`;
        return;
    }

    let htmlContent = '';
    currentFilteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).forEach(item => {
        let diffHtml = '';
        let jktMax = getHighestNumericPrice(item.jkt), sgcMax = getHighestNumericPrice(item.sgc);
        if (jktMax !== null && sgcMax !== null) {
            let diff = jktMax - sgcMax;
            let cls = diff > 0 ? 'selisih-green' : (diff < 0 ? 'selisih-red' : 'selisih-neutral');
            let txt = diff > 0 ? `+ ${formatRupiah(diff)}` : (diff < 0 ? `- ${formatRupiah(Math.abs(diff))}` : 'Rp 0');
            diffHtml = `<div class="price-card-footer"><span class="selisih-badge ${cls}">${txt}</span></div>`;
        }

        let bnibBadgeHtml = '';
        if (item.bnib && item.bnib.trim() !== '--' && item.bnib.trim() !== '') {
            bnibBadgeHtml = `
                <div class="price-card-top-badge">
                    <span class="badge-bnib-tag" title="Harga BNIB">
                        <i class="fa-solid fa-box" style="font-size: 8.5px;"></i> ${formatDisplayPrice(item.bnib)}
                    </span>
                </div>
            `;
        }

        htmlContent += `
            <div class="price-card">
                <div class="price-card-header">
                    <div><span class="price-card-brand" style="${getBrandStyle(item.brand)}">${item.brand}</span><div class="price-card-model">${item.model}</div></div>
                    <div class="price-card-actions"><button class="action-btn edit-btn" onclick="editProduct('${item.id}')"><i class="fa-solid fa-pen"></i></button><button class="action-btn delete-btn" onclick="deleteProduct('${item.id}')"><i class="fa-solid fa-trash"></i></button></div>
                </div>
                ${bnibBadgeHtml}
                <div class="price-compare-stack">
                    <div class="price-box"><span class="price-box-label">Jakarta</span><span class="price-box-val">${formatDisplayPrice(item.jkt)}</span></div>
                    <div class="price-box"><span class="price-box-label">Cikarang</span><span class="price-box-val">${formatDisplayPrice(item.sgc)}</span></div>
                </div>
                ${diffHtml}
            </div>
        `;
    });
    htmlContent += `<div class="pagination-controls"><button class="page-btn" onclick="changePage(-1)" ${currentPage === 1 ? 'disabled' : ''}>Prev</button><span class="page-info">Hal ${currentPage}/${totalPages}</span><button class="page-btn" onclick="changePage(1)" ${currentPage === totalPages ? 'disabled' : ''}>Next</button></div>`;
    container.innerHTML = htmlContent;
}

function changePage(direction) { currentPage += direction; renderPage(); }

/* NAVIGASI & AUTH */
function restartApp(btn) { btn?.classList.add('spinning'); setTimeout(() => window.location.reload(), 450); }
function toggleProtectionStatus(btn) {
    if (btn.classList.contains('status-protected')) { btn.className = 'header-icon-btn status-unprotected'; localStorage.setItem('npgalery_protection', 'unprotected'); }
    else { btn.className = 'header-icon-btn status-protected'; localStorage.setItem('npgalery_protection', 'protected'); }
}
function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-mode');
    document.getElementById('theme-icon')?.classList.replace(isDark ? 'fa-moon' : 'fa-sun', isDark ? 'fa-sun' : 'fa-moon');
    localStorage.setItem('npgalery_theme', isDark ? 'dark' : 'light');
}

function handleLogout() {
    showCustomConfirm("Keluar", "Yakin ingin keluar?", async () => { 
        if (supabaseClient) {
            try {
                await supabaseClient.auth.signOut();
            } catch (err) {
                console.warn('Logout error Supabase:', err);
            }
        }
        localStorage.setItem('npgalery_logged_in', 'false'); 
        document.getElementById('auth-modal')?.classList.remove('hidden'); 
    });
}

async function handleLogin(e) {
    e.preventDefault();
    const userVal = document.getElementById('auth-username')?.value.trim();
    const passVal = document.getElementById('auth-password')?.value.trim();

    if (!userVal || !passVal) {
        showToast('Peringatan', 'Masukkan Email dan Password!', false);
        return;
    }

    if (!supabaseClient) {
        showToast('Gagal', 'Koneksi Supabase belum siap!', false);
        return;
    }

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: userVal,
            password: passVal
        });

        if (error) throw error;

        localStorage.setItem('npgalery_logged_in', 'true');
        document.getElementById('auth-modal')?.classList.add('hidden');
        if (document.getElementById('auth-username')) document.getElementById('auth-username').value = '';
        if (document.getElementById('auth-password')) document.getElementById('auth-password').value = '';
        
        showToast('Login Berhasil', 'Selamat datang, Admin NPGalery!');
        
        await syncFromSupabase();
    } catch (err) {
        console.error("Login Error:", err);
        showToast('Akses Ditolak', 'Email atau Password salah!', false);
    }
}

function switchTab(tabId, el) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(tabId)?.classList.add('active'); el?.classList.add('active');
}
function switchSubTab(subId, el) {
    const p = el.closest('.tab-content');
    p?.querySelectorAll('.sub-content').forEach(s => s.classList.remove('active'));
    p?.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(subId)?.classList.add('active'); el?.classList.add('active');
}

/* STOK & JUAL */
window.toggleStokForm = function() {
    document.getElementById('stok-form-collapse')?.classList.toggle('collapsed');
    document.getElementById('icon-toggle-form')?.classList.toggle('rotated');
};

window.handleAutocomplete = function(query) {
    const listElem = document.getElementById('stok-autocomplete-list');
    if (!listElem) return;

    const trimmed = query.trim().toLowerCase();
    if (trimmed.length < 2) {
        listElem.innerHTML = '';
        listElem.classList.add('hidden');
        return;
    }

    const matches = rawPriceListData.filter(item => {
        const fullStr = `${item.brand} ${item.model}`.toLowerCase();
        return fullStr.includes(trimmed);
    });

    if (matches.length === 0) {
        listElem.innerHTML = '<li style="color:var(--text-secondary); cursor:default; padding: 10px 12px;">Tidak ada produk yang cocok</li>';
        listElem.classList.remove('hidden');
        return;
    }

    let html = '';
    matches.forEach(item => {
        const labelText = `${item.brand} - ${item.model}`;
        html += `<li onmousedown="selectStokKatalog('${labelText}')">${labelText}</li>`;
    });

    listElem.innerHTML = html;
    listElem.classList.remove('hidden');
};

window.selectStokKatalog = function(val) {
    document.getElementById('stok-produk-input').value = val;
    document.getElementById('stok-autocomplete-list')?.classList.add('hidden');
};

// SIMPAN STOK (SUPABASE INTEGRATED KE TABEL 'product')
window.simpanStokBaru = async function() {
    let produk = document.getElementById('stok-produk-input').value.trim();
    let imei = document.getElementById('stok-imei').value.trim();
    let tanggal = document.getElementById('stok-tanggal').value;
    if (!produk || !imei || !tanggal) { showToast('Gagal', 'Lengkapi form stok!', false); return; }

    const newStockItem = {
        id: 'stok-' + Date.now(),
        produk,
        kondisi: document.getElementById('stok-kondisi').value,
        kelengkapan: document.getElementById('stok-kelengkapan').value,
        imei,
        qty: document.getElementById('stok-qty').value || '1',
        hargaModal: document.getElementById('stok-harga').value || '0',
        hargaJual: '',
        pembeli: '',
        tanggal
    };

    daftarStokMasuk.unshift(newStockItem);
    saveStokToStorage();
    renderDaftarStokMasuk();
    updateDashboardStats();
    renderLaporanKeuangan();
    showToast('Tersimpan', 'Stok baru masuk.');

    document.getElementById('stok-produk-input').value = '';
    document.getElementById('stok-imei').value = '';

    if (supabaseClient) {
        try {
            await supabaseClient.from('product').insert([{
                id: newStockItem.id,
                name: newStockItem.produk,
                condition: newStockItem.kondisi,
                completeness: newStockItem.kelengkapan,
                imei: newStockItem.imei,
                qty: parseInt(newStockItem.qty) || 1,
                buy_price: parseRawToNumeric(newStockItem.hargaModal) || 0,
                sell_price: 0,
                status: 'ready',
                date: newStockItem.tanggal
            }]);
        } catch (e) {
            console.warn('Gagal sinkron stok ke Supabase:', e);
        }
    }
};

function createCustomConfirmModalDOM() {
    if (document.getElementById('custom-confirm-modal')) return;
    document.body.insertAdjacentHTML('beforeend', `
        <div class="custom-modal-overlay" id="custom-confirm-modal">
            <div class="custom-modal-card" style="text-align:center;">
                <h3 id="custom-confirm-title" style="font-size:16px; margin-bottom:6px;">Konfirmasi</h3>
                <p id="custom-confirm-desc" style="font-size:12px; color:var(--text-secondary); margin-bottom:14px;"></p>
                <div class="edit-modal-actions"><button class="btn-cancel" id="custom-confirm-no">Batal</button><button class="btn-save" id="custom-confirm-yes">Ya</button></div>
            </div>
        </div>
    `);
}
function showCustomConfirm(title, desc, cb) {
    createCustomConfirmModalDOM();
    document.getElementById('custom-confirm-title').textContent = title;
    document.getElementById('custom-confirm-desc').textContent = desc;
    const m = document.getElementById('custom-confirm-modal');
    m.classList.add('show');
    document.getElementById('custom-confirm-yes').onclick = () => { m.classList.remove('show'); cb(); };
    document.getElementById('custom-confirm-no').onclick = () => m.classList.remove('show');
}

function createStokDetailModalDOM() {
    if (document.getElementById('stok-detail-modal')) return;
    document.body.insertAdjacentHTML('beforeend', `
        <div class="stok-modal-overlay" id="stok-detail-modal">
            <div class="stok-modal-card">
                <div class="stok-modal-header"><span class="modal-brand-tag" id="modal-detail-brand"></span><h3 id="modal-detail-title"></h3><p id="modal-detail-imei"></p></div>
                <div class="stok-modal-body">
                    <div class="stok-modal-info-row"><span class="stok-modal-info-label">Kondisi</span><span class="stok-modal-info-val" id="modal-detail-kondisi"></span></div>
                    <div class="stok-modal-info-row"><span class="stok-modal-info-label">Kelengkapan</span><span class="stok-modal-info-val" id="modal-detail-kelengkapan"></span></div>
                    <div class="stok-modal-info-row"><span class="stok-modal-info-label">Tgl Masuk</span><span class="stok-modal-info-val" id="modal-detail-tanggal"></span></div>
                    <div class="stok-modal-info-row"><span class="stok-modal-info-label">QTY</span><span class="stok-modal-info-val" id="modal-detail-qty"></span></div>
                    <div class="stok-modal-info-row"><span class="stok-modal-info-label">Modal</span><span class="stok-modal-info-val" id="modal-detail-harga"></span></div>
                    <div class="stok-modal-info-row"><span class="stok-modal-info-label">Nama Pembeli</span><input type="text" class="modal-input-customer" id="modal-input-customer" placeholder="Nama Pelanggan" oninput="updatePembeliLive(this.value)"></div>
                    <div class="stok-modal-info-row"><span class="stok-modal-info-label">Harga Jual</span><input type="text" class="modal-input-harga-jual" id="modal-input-harga-jual" placeholder="Contoh: 1.850.000" oninput="updateHargaJualLive(this.value)"></div>
                </div>
                <div class="stok-modal-actions"><button class="modal-action-btn sell-btn" id="modal-btn-jual">Jual</button><button class="modal-action-btn delete-btn" id="modal-btn-hapus">Hapus</button></div>
                <button class="modal-action-btn close-btn" onclick="closeStokDetailModal()">Tutup</button>
            </div>
        </div>
    `);
}

let activeDetailStokId = null;
window.openStokDetail = function(id) {
    createStokDetailModalDOM();
    const item = daftarStokMasuk.find(s => s.id === id);
    if (!item) return;
    activeDetailStokId = id;
    const brand = item.produk.split(' ')[0].toUpperCase();
    document.getElementById('modal-detail-brand').textContent = brand;
    document.getElementById('modal-detail-brand').style.cssText = getBrandStyle(brand);
    document.getElementById('modal-detail-title').textContent = item.produk.split(' ').slice(1).join(' ');
    document.getElementById('modal-detail-imei').textContent = `IMEI: ${item.imei}`;
    document.getElementById('modal-detail-kondisi').textContent = item.kondisi;
    document.getElementById('modal-detail-kelengkapan').textContent = item.kelengkapan;
    document.getElementById('modal-detail-tanggal').textContent = formatTanggalID(item.tanggal);
    document.getElementById('modal-detail-qty').textContent = `${item.qty} unit`;

    let numericModal = parseRawToNumeric(item.hargaModal);
    document.getElementById('modal-detail-harga').textContent = numericModal !== null ? formatRupiah(numericModal) : '-';

    document.getElementById('modal-input-customer').value = item.pembeli || '';
    document.getElementById('modal-input-harga-jual').value = item.hargaJual || '';

    document.getElementById('modal-btn-jual').onclick = () => { closeStokDetailModal(); jualStokItem(item.id); };
    document.getElementById('modal-btn-hapus').onclick = () => { closeStokDetailModal(); hapusStokItem(item.id); };
    document.getElementById('stok-detail-modal').classList.add('show');
};

window.updateHargaJualLive = function(val) {
    const item = daftarStokMasuk.find(s => s.id === activeDetailStokId);
    if (item) {
        item.hargaJual = val;
        saveStokToStorage();
        if (supabaseClient) {
            supabaseClient.from('product').update({ sell_price: parseRawToNumeric(val) || 0 }).eq('id', item.id).then();
        }
    }
};

window.updatePembeliLive = function(val) {
    const item = daftarStokMasuk.find(s => s.id === activeDetailStokId);
    if (item) {
        item.pembeli = val;
        saveStokToStorage();
        if (supabaseClient) {
            supabaseClient.from('product').update({ buyer: val }).eq('id', item.id).then();
        }
    }
};

window.closeStokDetailModal = function() { document.getElementById('stok-detail-modal')?.classList.remove('show'); activeDetailStokId = null; };

// JUAL STOK (SUPABASE INTEGRATED)
window.jualStokItem = function(id) {
    const item = daftarStokMasuk.find(s => s.id === id);
    if (item) {
        showCustomConfirm("Penjualan", `Jual unit ${item.produk}?`, async () => {
            daftarStokMasuk = daftarStokMasuk.filter(s => s.id !== id);
            saveStokToStorage();
            let d = new Date(), tgl = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            item.tanggalTerjualRaw = tgl; 
            item.modalStatus = 'belum';
            daftarTerjual.unshift(item); 
            saveTerjualToStorage();

            let profit = (parseRawToNumeric(item.hargaJual) || 0) - (parseRawToNumeric(item.hargaModal) || 0);
            let kasId = 'kas-' + Date.now();
            if (profit > 0) {
                daftarKasPribadi.unshift({ id: kasId, keterangan: `Laba Jual: ${item.produk}`, kategori: 'masuk', nominal: profit, tanggal: tgl });
                saveKasToStorage();
            }

            renderDaftarStokMasuk(); renderDaftarTerjual(); renderDaftarModal(); renderManajemenKas(); updateDashboardStats(); updatePribadiStats(); renderLaporanKeuangan();
            showToast('Berhasil', 'Unit terjual & laba masuk kas.');
            openInvoiceModal(item);

            if (supabaseClient) {
                try {
                    await supabaseClient.from('product').update({ status: 'sold' }).eq('id', item.id);

                    await supabaseClient.from('transactions').insert([{
                        id: item.id,
                        product_name: item.produk,
                        condition: item.kondisi,
                        completeness: item.kelengkapan,
                        imei: item.imei,
                        qty: parseInt(item.qty) || 1,
                        buy_price: parseRawToNumeric(item.hargaModal) || 0,
                        sell_price: parseRawToNumeric(item.hargaJual) || 0,
                        customer_name: item.pembeli || '',
                        profit: profit,
                        sold_date: tgl,
                        modal_status: 'belum'
                    }]);

                    if (profit > 0) {
                        await supabaseClient.from('cash_mutations').insert([{
                            id: kasId,
                            description: `Laba Jual: ${item.produk}`,
                            type: 'masuk',
                            amount: profit,
                            date: tgl
                        }]);
                    }
                } catch (err) {
                    console.warn('Gagal sinkron penjualan ke Supabase:', err);
                }
            }
        });
    }
};

/* INVOICE A4 */
function generateInvoiceHTML(item) {
    let invoiceNo = 'INV-' + (item.tanggalTerjualRaw ? item.tanggalTerjualRaw.replace(/-/g, '') : new Date().toISOString().slice(0, 10).replace(/-/g, '')) + '-' + String(item.id).slice(-4);
    let customerName = item.pembeli && item.pembeli.trim() !== '' ? item.pembeli.trim() : 'Pelanggan Setia';
    let numericJual = parseRawToNumeric(item.hargaJual) || 0;
    let hargaTampil = formatRupiah(numericJual);
    let qty = parseInt(item.qty || 1);
    let tglTampil = formatTanggalID(item.tanggalTerjualRaw || new Date().toISOString().slice(0, 10));

    return `
        <div class="elegant-invoice-card">
            <div class="invoice-header-box">
                <div class="invoice-brand-wrap">
                    <img src="logo-np.jpg" alt="Logo NP" class="invoice-brand-logo">
                    <div>
                        <h2 class="invoice-brand-title">NP - GALERY</h2>
                        <p class="invoice-brand-sub">Smartphone Store & Premium Service</p>
                    </div>
                </div>
                <div class="invoice-num-badge">
                    <div class="invoice-num-title">${invoiceNo}</div>
                    <div class="invoice-num-date"><i class="fa-solid fa-calendar-days"></i> ${tglTampil}</div>
                </div>
            </div>

            <table class="invoice-table-details">
                <thead>
                    <tr>
                        <th>Item Deskripsi</th>
                        <th style="text-align: center; width: 60px;">Qty</th>
                        <th style="text-align: right; width: 140px;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>
                            <div class="invoice-item-unit">${item.produk}</div>
                            <div class="invoice-item-spec">${item.kondisi} • ${item.kelengkapan}</div>
                            <div class="invoice-item-imei">SN/IMEI: ${item.imei || '-'}</div>
                        </td>
                        <td align="center" style="font-weight: 700; font-size: 12px;">${qty}</td>
                        <td align="right" style="font-weight: 800; color: #0077B6; font-size: 13px;">${hargaTampil}</td>
                    </tr>
                </tbody>
            </table>

            <div class="invoice-total-row">
                <span class="invoice-total-label">TOTAL PEMBAYARAN (LUNAS)</span>
                <span class="invoice-total-val">${hargaTampil}</span>
            </div>

            <div class="invoice-footer-signatures">
                <div class="invoice-sign-column-left">
                    <span class="invoice-sign-header-label">Hormat Kami,</span>
                    <img src="tanda-tangan.png" alt="Tanda Tangan" class="invoice-auto-sign-img" onerror="this.style.display='none';">
                    <span class="invoice-sign-name-label">( NP - Galery )</span>
                </div>
                <div class="invoice-sign-column-right">
                    <span class="invoice-sign-header-label">Customer,</span>
                    <div class="invoice-sign-blank-space"></div>
                    <span class="invoice-sign-name-label">( ${customerName} )</span>
                </div>
            </div>
        </div>
    `;
}

window.openInvoiceModal = function(item) {
    activeInvoiceData = item;
    const body = document.getElementById('invoice-preview-body');
    const modal = document.getElementById('invoice-modal');
    if (!body || !modal) return;
    body.innerHTML = generateInvoiceHTML(item);
    modal.classList.add('show');
};

window.closeInvoiceModal = function() {
    document.getElementById('invoice-modal')?.classList.remove('show');
    activeInvoiceData = null;
};

window.shareInvoiceWA = function() {
    if (!activeInvoiceData) return;
    let item = activeInvoiceData;
    let invoiceNo = 'INV-' + (item.tanggalTerjualRaw ? item.tanggalTerjualRaw.replace(/-/g, '') : new Date().toISOString().slice(0, 10).replace(/-/g, '')) + '-' + String(item.id).slice(-4);
    let customerName = item.pembeli && item.pembeli.trim() !== '' ? item.pembeli.trim() : 'Pelanggan Setia';
    let numericJual = parseRawToNumeric(item.hargaJual) || 0;
    let tglTampil = formatTanggalID(item.tanggalTerjualRaw || new Date().toISOString().slice(0, 10));

    let text = `🧾 *NOTA INVOICE RESMI - NP GALERY* 🧾\n`;
    text += `───────────────────────\n`;
    text += `No. Nota : *${invoiceNo}*\n`;
    text += `Tanggal  : ${tglTampil}\n`;
    text += `Kepada   : *${customerName}*\n`;
    text += `───────────────────────\n`;
    text += `📱 Unit        : *${item.produk}*\n`;
    text += `🔍 Kondisi     : ${item.kondisi}\n`;
    text += `📦 Kelengkapan : ${item.kelengkapan}\n`;
    text += `🔢 IMEI/SN     : ${item.imei || '-'}\n`;
    text += `───────────────────────\n`;
    text += `💰 Total Bayar : *${formatRupiah(numericJual)}* (LUNAS)\n`;
    text += `───────────────────────\n`;
    text += `Terima kasih atas kepercayaan Anda bertransaksi di *NP - Galery Smartphone*! 🙏✨`;

    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('Tersalin!', 'Format nota WhatsApp disalin.');
            setTimeout(() => {
                window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
            }, 500);
        }).catch(() => {
            window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
        });
    } else {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
    }
};

window.downloadInvoiceImage = function() {
    if (!activeInvoiceData || !window.html2canvas) return;
    const canvasWrap = document.getElementById('invoice-render-canvas');
    if (!canvasWrap) return;

    canvasWrap.innerHTML = generateInvoiceHTML(activeInvoiceData);

    html2canvas(canvasWrap, { scale: 2, backgroundColor: '#FFFFFF', useCORS: true }).then(canvas => {
        let link = document.createElement('a');
        link.download = `Invoice_A4_NPGalery_${activeInvoiceData.produk.replace(/\s+/g, '_')}_${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showToast('Berhasil!', 'Nota invoice format A4 diunduh sebagai gambar.');
    });
};

window.hapusStokItem = function(id) {
    showCustomConfirm("Hapus Stok", "Hapus unit ini?", async () => {
        daftarStokMasuk = daftarStokMasuk.filter(s => s.id !== id);
        saveStokToStorage(); renderDaftarStokMasuk(); updateDashboardStats(); renderLaporanKeuangan();
        if (supabaseClient) {
            try { await supabaseClient.from('product').delete().eq('id', id); } catch (e) {}
        }
    });
};

window.hapusRiwayatTerjual = function(id) {
    showCustomConfirm("Hapus Riwayat", "Hapus riwayat penjualan?", async () => {
        daftarTerjual = daftarTerjual.filter(s => s.id !== id);
        saveTerjualToStorage(); renderDaftarTerjual(); renderDaftarModal(); updateDashboardStats(); renderLaporanKeuangan();
        if (supabaseClient) {
            try { await supabaseClient.from('transactions').delete().eq('id', id); } catch (e) {}
        }
    });
};

function renderDaftarStokMasuk() {
    const container = document.getElementById('stok-masuk-container');
    const badge = document.getElementById('badge-stok-count');
    if (!container) return;
    if (badge) badge.textContent = `${daftarStokMasuk.length} Unit`;
    if (daftarStokMasuk.length === 0) { container.innerHTML = `<div class="empty-stok-msg">Belum ada stok.</div>`; return; }
    container.innerHTML = daftarStokMasuk.map(i => `
        <div class="stok-item-card" onclick="openStokDetail('${i.id}')">
            <div class="stok-item-top"><div class="stok-title-group"><span class="kondisi-badge ${i.kondisi.toLowerCase()}">${i.kondisi}</span><span class="stok-item-title">${i.produk}</span><span class="stok-kelengkapan-sub">${i.kelengkapan}</span></div></div>
            <div class="stok-item-details"><span class="detail-badge imei-badge">IMEI: ${i.imei}</span><span class="detail-badge">${formatTanggalID(i.tanggal)}</span><span class="detail-badge qty-badge">${i.qty} unit</span></div>
        </div>
    `).join('');
}

function renderDaftarTerjual() {
    const container = document.getElementById('sub-rjual');
    if (!container) return;
    if (daftarTerjual.length === 0) { container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-clock-rotate-left icon-placeholder"></i><h2>Riwayat Kosong</h2></div>`; return; }
    container.innerHTML = `
        <div class="stok-masuk-header"><div class="header-left"><i class="fa-solid fa-clock-rotate-left"></i><h4>Riwayat Terjual</h4></div><span class="badge-count">${daftarTerjual.length} Unit</span></div>
        <div class="stok-masuk-container" style="max-height:550px;">
            ${daftarTerjual.map(i => {
                let numericModal = parseRawToNumeric(i.hargaModal) || 0;
                let numericJual = parseRawToNumeric(i.hargaJual) || 0;
                let p = numericJual - numericModal;
                let namaPembeliText = i.pembeli && i.pembeli.trim() !== '' ? ` • Pembeli: <b>${i.pembeli}</b>` : '';
                return `
                    <div class="stok-item-card" style="cursor:default;">
                        <div class="stok-item-top">
                            <div class="stok-title-group">
                                <span class="kondisi-badge ${i.kondisi.toLowerCase()}">${i.kondisi}</span>
                                <span class="stok-item-title">${i.produk}</span>
                            </div>
                            <div style="display: flex; gap: 4px;">
                                <button onclick='openInvoiceModal(${JSON.stringify(i).replace(/'/g, "&apos;")})' class="action-btn edit-btn" title="Cetak / Lihat Invoice"><i class="fa-solid fa-receipt"></i></button>
                                <button onclick="hapusRiwayatTerjual('${i.id}')" class="action-btn delete-btn" title="Hapus Riwayat"><i class="fa-solid fa-trash"></i></button>
                            </div>
                        </div>
                        <div class="stok-item-details">
                            <span class="detail-badge imei-badge">IMEI: ${i.imei}</span>
                            <span class="detail-badge" style="font-size: 10px; color: var(--text-secondary);">${namaPembeliText}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-top:6px; font-size:11px; font-weight:700;">
                            <span>Modal: ${formatRupiah(numericModal)} | Jual: ${formatRupiah(numericJual)}</span>
                            <span style="color:${p>=0?'var(--status-safe)':'var(--status-unsafe)'}">${p>=0?'+ ':''}${formatRupiah(p)}</span>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderDaftarModal() {
    const container = document.getElementById('sub-modal');
    if (!container) return;
    if (daftarTerjual.length === 0) { container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-coins icon-placeholder"></i><h2>Manajemen Modal</h2></div>`; return; }
    container.innerHTML = `
        <div class="stok-masuk-header"><div class="header-left"><i class="fa-solid fa-coins"></i><h4>Status Kembali Modal</h4></div></div>
        <div class="stok-masuk-container" style="max-height:550px;">
            ${daftarTerjual.map(i => {
                let s = i.modalStatus === 'sudah';
                return `
                    <div class="stok-item-card" style="cursor:default;">
                        <div class="stok-item-top">
                            <span class="stok-item-title">${i.produk}</span>
                            <button onclick="toggleModalStatus('${i.id}')" style="background:${s?'rgba(16,185,129,0.12)':'rgba(239,68,68,0.12)'}; color:${s?'var(--status-safe)':'var(--status-unsafe)'}; border:1px solid currentColor; padding:4px 10px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">${s?'Sudah':'Belum'}</button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

window.toggleModalStatus = function(id) {
    const item = daftarTerjual.find(s => s.id === id);
    if (item) {
        item.modalStatus = item.modalStatus === 'sudah' ? 'belum' : 'sudah';
        saveTerjualToStorage();
        renderDaftarModal();
        if (supabaseClient) {
            supabaseClient.from('transactions').update({ modal_status: item.modalStatus }).eq('id', id).then();
        }
    }
};

window.toggleKasForm = function() {
    document.getElementById('kas-form-collapse')?.classList.toggle('collapsed');
    document.getElementById('icon-toggle-kas-form')?.classList.toggle('rotated');
};

// TAMBAH KAS (SUPABASE INTEGRATED)
window.tambahKasPribadi = async function() {
    let ket = document.getElementById('kas-keterangan').value.trim();
    let nom = parseRawToNumeric(document.getElementById('kas-nominal').value);
    let tgl = document.getElementById('kas-tanggal').value;
    if (!ket || !nom || !tgl) { showToast('Gagal', 'Lengkapi form kas!', false); return; }

    const newKasItem = {
        id: 'kas-' + Date.now(),
        keterangan: ket,
        kategori: document.getElementById('kas-kategori').value,
        nominal: nom,
        tanggal: tgl
    };

    daftarKasPribadi.unshift(newKasItem);
    saveKasToStorage();
    document.getElementById('kas-keterangan').value = '';
    document.getElementById('kas-nominal').value = '';
    renderManajemenKas();
    updatePribadiStats();
    renderLaporanKeuangan();
    showToast('Berhasil', 'Kas ditambahkan.');

    if (supabaseClient) {
        try {
            await supabaseClient.from('cash_mutations').insert([{
                id: newKasItem.id,
                description: newKasItem.keterangan,
                type: newKasItem.kategori,
                amount: newKasItem.nominal,
                date: newKasItem.tanggal
            }]);
        } catch (e) {
            console.warn('Gagal sinkron kas ke Supabase:', e);
        }
    }
};

window.hapusKasPribadi = function(id) {
    showCustomConfirm("Hapus Kas", "Hapus catatan kas ini?", async () => {
        daftarKasPribadi = daftarKasPribadi.filter(k => k.id !== id);
        saveKasToStorage();
        renderManajemenKas();
        updatePribadiStats();
        renderLaporanKeuangan();
        if (supabaseClient) {
            try { await supabaseClient.from('cash_mutations').delete().eq('id', id); } catch (e) {}
        }
    });
};

window.renderManajemenKas = function() {
    const container = document.getElementById('kas-masuk-container');
    const badge = document.getElementById('badge-kas-count');
    if (!container) return;
    let kat = document.getElementById('filter-kas-kategori')?.value || 'ALL';
    let tgl = document.getElementById('filter-kas-tanggal')?.value || '';
    let filtered = daftarKasPribadi.filter(i => (kat === 'ALL' || i.kategori === kat) && (!tgl || i.tanggal === tgl));
    if (badge) badge.textContent = `${filtered.length} Catatan`;
    if (filtered.length === 0) { container.innerHTML = `<div class="empty-stok-msg">Tidak ada catatan kas.</div>`; return; }
    container.innerHTML = filtered.map(i => `
        <div class="stok-item-card" style="cursor:default;">
            <div class="stok-item-top"><span style="font-size:9.5px; font-weight:800; padding:2px 6px; border-radius:4px; background:${i.kategori==='masuk'?'rgba(16,185,129,0.12)':'rgba(239,68,68,0.12)'}; color:${i.kategori==='masuk'?'var(--status-safe)':'var(--status-unsafe)'}">${i.kategori==='masuk'?'Masuk':'Keluar'}</span><span class="stok-item-title">${i.keterangan}</span><button onclick="hapusKasPribadi('${i.id}')" class="action-btn delete-btn"><i class="fa-solid fa-trash"></i></button></div>
            <div style="display:flex; justify-content:space-between; margin-top:6px; font-size:11px;"><span style="color:var(--text-secondary)">${formatTanggalID(i.tanggal)}</span><span style="font-weight:800; color:${i.kategori==='masuk'?'var(--status-safe)':'var(--status-unsafe)'}">${i.kategori==='masuk'?'+':'-'} ${formatRupiah(i.nominal)}</span></div>
        </div>
    `).join('');
};

/* BROADCAST WA & STORY BANNER */
window.broadcastStokWA = function() {
    if (daftarStokMasuk.length === 0) {
        showToast('Info', 'Belum ada stok ready untuk dibagikan.', false);
        return;
    }

    let text = `🔥 *STOK READY NP - GALERY HARI INI* 🔥\n`;
    text += `📅 Update: ${new Date().toLocaleDateString('id-ID')}\n`;
    text += `📍 Unit Berkualitas, Bergaransi, & Siap Pakai!\n`;
    text += `───────────────────────\n\n`;

    daftarStokMasuk.forEach((item, idx) => {
        let hargaTampil = item.hargaJual ? `Rp ${parseRawToNumeric(item.hargaJual).toLocaleString('id-ID')}` : 'Chat Admin';
        text += `${idx + 1}. *${item.produk}*\n`;
        text += `   • Kondisi: ${item.kondisi}\n`;
        text += `   • Kelengkapan: ${item.kelengkapan}\n`;
        text += `   • Harga: *${hargaTampil}*\n\n`;
    });

    text += `───────────────────────\n`;
    text += `⚡ Minat? Langsung kirim pesan / kontak ke admin sekarang!\n`;
    text += `📱 NP - Galery Smartphone`;

    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('Tersalin!', 'Format nota WhatsApp disalin.');
            setTimeout(() => {
                window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
            }, 600);
        }).catch(() => {
            window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
        });
    } else {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
    }
};

function generateStoryBannerHTML() {
    let itemsHtml = daftarStokMasuk.slice(0, 8).map((item) => {
        let hargaTampil = item.hargaJual ? `Rp ${parseRawToNumeric(item.hargaJual).toLocaleString('id-ID')}` : 'Ready Siap Pakai';
        return `
            <div class="story-unit-card">
                <div class="story-unit-left">
                    <span class="story-unit-name">${item.produk}</span>
                    <span class="story-unit-desc">${item.kondisi} • ${item.kelengkapan}</span>
                </div>
                <div class="story-unit-right">
                    <span class="story-status-badge">READY</span>
                    <span class="story-unit-price">${hargaTampil}</span>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="elegant-story-card">
            <div class="story-header">
                <div class="story-brand">
                    <img src="logo-np.jpg" alt="Logo NPGalery" class="story-logo">
                    <div>
                        <h2 class="story-title">NP - GALERY</h2>
                        <p class="story-subtitle">Pusat Jual Beli Smartphone Berkualitas</p>
                    </div>
                </div>
                <span class="story-date-badge">${new Date().toLocaleDateString('id-ID')}</span>
            </div>

            <div class="story-tagline-bar">
                <span class="story-tagline-text">KATALOG STOK READY TERBARU</span>
                <span class="story-units-count">${daftarStokMasuk.length} Unit Pilihan</span>
            </div>

            <div class="story-items-container">
                ${itemsHtml}
            </div>

            <div class="story-footer">
                <span class="story-footer-info">Garansi Resmi Toko • Siap COD / Antar</span>
                <span class="story-contact-badge"><i class="fa-brands fa-whatsapp"></i> Chat Admin</span>
            </div>
        </div>
    `;
}

window.previewStoryBanner = function() {
    if (daftarStokMasuk.length === 0) {
        showToast('Info', 'Belum ada stok ready untuk dibuat banner.', false);
        return;
    }

    const previewBody = document.getElementById('story-preview-body');
    const previewModal = document.getElementById('story-preview-modal');
    if (!previewBody || !previewModal) return;

    previewBody.innerHTML = generateStoryBannerHTML();
    previewModal.classList.add('show');
};

window.closeStoryPreview = function() {
    document.getElementById('story-preview-modal')?.classList.remove('show');
};

window.executeDownloadStoryBanner = function() {
    const canvasElem = document.getElementById('story-banner-canvas');
    if (!canvasElem || !window.html2canvas) {
        showToast('Gagal', 'Library render gambar belum siap.', false);
        return;
    }

    canvasElem.innerHTML = generateStoryBannerHTML();

    html2canvas(canvasElem, { scale: 2, backgroundColor: '#F0F9FF', useCORS: true }).then(canvas => {
        let link = document.createElement('a');
        link.download = `NPGalery_KatalogStory_${new Date().toISOString().slice(0, 10)}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showToast('Berhasil!', 'Banner story katalog siap posting diunduh.');
        closeStoryPreview();
    });
};

/* LAPORAN & EXPORT */
function getFilteredReportKas() {
    let kat = document.getElementById('report-filter-kas-kategori')?.value || 'ALL';
    let tgl = document.getElementById('report-filter-kas-tanggal')?.value || '';
    return daftarKasPribadi.filter(i => (kat === 'ALL' || i.kategori === kat) && (!tgl || i.tanggal === tgl));
}

function getFilteredReportPriceListAll() {
    let brandVal = document.getElementById('report-filter-brand-select')?.value || 'ALL';
    let searchVal = document.getElementById('report-filter-model-input')?.value.toLowerCase().trim() || '';
    return rawPriceListData.filter(item => {
        return (brandVal === 'ALL' || item.brand.trim() === brandVal) && 
            (item.model.toLowerCase().includes(searchVal) || item.brand.toLowerCase().includes(searchVal));
    });
}

function getSelectedReportPriceList() {
    let matched = getFilteredReportPriceListAll();
    return matched.filter(item => selectedPriceListModelIds.has(item.id));
}

window.onReportBrandChanged = function() {
    let matched = getFilteredReportPriceListAll();
    matched.forEach(item => selectedPriceListModelIds.add(item.id));
    renderLaporanKeuangan();
};

window.togglePriceListModelSelect = function(id) {
    if (selectedPriceListModelIds.has(id)) selectedPriceListModelIds.delete(id);
    else selectedPriceListModelIds.add(id);
    updateSelectionIndicator();
};

window.selectAllPriceListModels = function(selectAll) {
    let matched = getFilteredReportPriceListAll();
    matched.forEach(item => {
        if (selectAll) selectedPriceListModelIds.add(item.id);
        else selectedPriceListModelIds.delete(item.id);
    });
    renderLaporanKeuangan();
};

function updateSelectionIndicator() {
    let selected = getSelectedReportPriceList();
    const indicator = document.getElementById('selected-models-count-badge');
    if (indicator) indicator.textContent = `${selected.length} Model Dipilih`;
}

window.toggleReportAccordion = function() {
    isReportAccordionOpen = !isReportAccordionOpen;
    const headerBtn = document.querySelector('.report-accordion-header');
    const contentBox = document.getElementById('report-accordion-body');
    if (headerBtn) headerBtn.classList.toggle('expanded', isReportAccordionOpen);
    if (contentBox) contentBox.classList.toggle('expanded', isReportAccordionOpen);
};

function getLaporanDataSummary() {
    let filteredKas = getFilteredReportKas();
    let totalMasuk = 0, totalKeluar = 0;
    filteredKas.forEach(i => { if (i.kategori === 'masuk') totalMasuk += i.nominal; else totalKeluar += i.nominal; });
    let saldoAktif = totalMasuk - totalKeluar;

    let sumTerjual = 0, totalOmset = 0, totalProfit = 0;
    daftarTerjual.forEach(i => {
        let q = parseInt(i.qty || 1);
        let hj = parseRawToNumeric(i.hargaJual) || 0;
        let hm = parseRawToNumeric(i.hargaModal) || 0;
        sumTerjual += q; totalOmset += hj * q; totalProfit += (hj - hm) * q;
    });

    let sumStok = 0;
    daftarStokMasuk.forEach(i => { sumStok += parseInt(i.qty || 1); });

    let filteredPLAll = getFilteredReportPriceListAll();
    let filteredPLSelected = getSelectedReportPriceList();

    return { totalMasuk, totalKeluar, saldoAktif, sumTerjual, totalOmset, totalProfit, sumStok, totalModels: filteredPLSelected.length, filteredKas, filteredPLAll, filteredPLSelected };
}

window.onReportCategorySelectChanged = function(catKey) {
    activeReportCategory = catKey;

    const filterKasArea = document.getElementById('report-filter-kas-area');
    const filterPLArea = document.getElementById('report-filter-pricelist-area');

    if (filterKasArea) filterKasArea.style.display = (catKey === 'kas') ? 'flex' : 'none';
    if (filterPLArea) filterPLArea.style.display = (catKey === 'pricelist') ? 'flex' : 'none';

    renderLaporanKeuangan();
};

window.renderLaporanKeuangan = function() {
    const container = document.getElementById('laporan-container');
    if (!container) return;
    let d = getLaporanDataSummary();
    updateSelectionIndicator();

    let html = '';
    if (activeReportCategory === 'kas') {
        let rowsHtml = d.filteredKas.length === 0 ? '<div style="font-size:11px; color:var(--text-secondary); text-align:center; padding:12px;">Tidak ada data kas sesuai filter</div>' : d.filteredKas.map(k => `
            <div class="laporan-detail-item">
                <div class="detail-left"><span class="detail-title">${k.keterangan}</span><span class="detail-sub">${formatTanggalID(k.tanggal)} • ${k.kategori === 'masuk' ? 'Kas Masuk' : 'Kas Keluar'}</span></div>
                <div class="detail-val" style="color: ${k.kategori === 'masuk' ? 'var(--status-safe)' : 'var(--status-unsafe)'}">${k.kategori === 'masuk' ? '+' : '-'} ${formatRupiah(k.nominal)}</div>
            </div>
        `).join('');

        html = `
            <div class="laporan-section-card">
                <div class="laporan-section-header">
                    <div class="laporan-section-title"><i class="fa-solid fa-cash-register"></i> Ringkasan Kas Pribadi</div>
                    <span class="badge-count">${d.filteredKas.length} Catatan</span>
                </div>
                <div class="laporan-row"><span class="laporan-label">Total Masuk</span><span class="laporan-value highlight-green">+ ${formatRupiah(d.totalMasuk)}</span></div>
                <div class="laporan-row"><span class="laporan-label">Total Keluar</span><span class="laporan-value" style="color:var(--status-unsafe)">- ${formatRupiah(d.totalKeluar)}</span></div>
                <div class="laporan-row" style="border-top:1px dashed var(--border-subtle); padding-top:6px; margin-top:2px;">
                    <span class="laporan-label" style="color:var(--text-primary); font-weight:800;">Saldo Aktif Terfilter</span>
                    <span class="laporan-value highlight-blue">${formatRupiah(d.saldoAktif)}</span>
                </div>
            </div>
            <button class="report-accordion-header ${isReportAccordionOpen ? 'expanded' : ''}" onclick="toggleReportAccordion()">
                <span><i class="fa-solid fa-list-ol" style="color:var(--azure-primary); margin-right:6px;"></i> Rincian Mutasi (${d.filteredKas.length})</span>
                <i class="fa-solid fa-chevron-down acc-icon"></i>
            </button>
            <div id="report-accordion-body" class="report-accordion-content ${isReportAccordionOpen ? 'expanded' : ''}">${rowsHtml}</div>
        `;
    } else if (activeReportCategory === 'penjualan') {
        let rowsHtml = daftarTerjual.length === 0 ? '<div style="font-size:11px; color:var(--text-secondary); text-align:center; padding:12px;">Belum ada riwayat penjualan</div>' : daftarTerjual.map(t => {
            let p = (parseRawToNumeric(t.hargaJual) || 0) - (parseRawToNumeric(t.hargaModal) || 0);
            return `
                <div class="laporan-detail-item">
                    <div class="detail-left"><span class="detail-title">${t.produk}</span><span class="detail-sub">IMEI: ${t.imei || '-'} • Qty: ${t.qty || 1} unit</span></div>
                    <div class="detail-val" style="color: ${p >= 0 ? 'var(--status-safe)' : 'var(--status-unsafe)'}">+ ${formatRupiah(p)}</div>
                </div>
            `;
        }).join('');

        html = `
            <div class="laporan-section-card">
                <div class="laporan-section-header">
                    <div class="laporan-section-title"><i class="fa-solid fa-clock-rotate-left"></i> Ringkasan Penjualan</div>
                    <span class="badge-count">${d.sumTerjual} Unit Laku</span>
                </div>
                <div class="laporan-row"><span class="laporan-label">Total Omset</span><span class="laporan-value">${formatRupiah(d.totalOmset)}</span></div>
                <div class="laporan-row" style="border-top:1px dashed var(--border-subtle); padding-top:6px; margin-top:2px;">
                    <span class="laporan-label" style="color:var(--text-primary); font-weight:800;">Laba Bersih</span>
                    <span class="laporan-value highlight-green">+ ${formatRupiah(d.totalProfit)}</span>
                </div>
            </div>
            <button class="report-accordion-header ${isReportAccordionOpen ? 'expanded' : ''}" onclick="toggleReportAccordion()">
                <span><i class="fa-solid fa-receipt" style="color:var(--azure-primary); margin-right:6px;"></i> Rincian Unit Terjual (${daftarTerjual.length})</span>
                <i class="fa-solid fa-chevron-down acc-icon"></i>
            </button>
            <div id="report-accordion-body" class="report-accordion-content ${isReportAccordionOpen ? 'expanded' : ''}">${rowsHtml}</div>
        `;
    } else if (activeReportCategory === 'stok') {
        let rowsHtml = daftarStokMasuk.length === 0 ? '<div style="font-size:11px; color:var(--text-secondary); text-align:center; padding:12px;">Belum ada stok barang</div>' : daftarStokMasuk.map(s => `
            <div class="laporan-detail-item">
                <div class="detail-left"><span class="detail-title">${s.produk} (${s.kondisi})</span><span class="detail-sub">IMEI: ${s.imei || '-'} • Masuk: ${formatTanggalID(s.tanggal)}</span></div>
                <div class="detail-val"><span style="color:var(--azure-primary); font-weight:800;">${s.qty || 1} Unit</span></div>
            </div>
        `).join('');

        html = `
            <div class="laporan-section-card">
                <div class="laporan-section-header">
                    <div class="laporan-section-title"><i class="fa-solid fa-boxes-stacked"></i> Ringkasan Stok Gudang</div>
                    <span class="badge-count">${d.sumStok} Ready</span>
                </div>
                <div class="laporan-row"><span class="laporan-label">Total Unit Ready</span><span class="laporan-value highlight-blue">${d.sumStok} Unit</span></div>
            </div>
            <button class="report-accordion-header ${isReportAccordionOpen ? 'expanded' : ''}" onclick="toggleReportAccordion()">
                <span><i class="fa-solid fa-clipboard-check" style="color:var(--azure-primary); margin-right:6px;"></i> Rincian Stok Ready (${daftarStokMasuk.length})</span>
                <i class="fa-solid fa-chevron-down acc-icon"></i>
            </button>
            <div id="report-accordion-body" class="report-accordion-content ${isReportAccordionOpen ? 'expanded' : ''}">${rowsHtml}</div>
        `;
    } else if (activeReportCategory === 'pricelist') {
        let rowsHtml = d.filteredPLAll.length === 0 ? '<div style="font-size:11px; color:var(--text-secondary); text-align:center; padding:12px;">Tidak ada model sesuai filter</div>' : d.filteredPLAll.map(p => {
            let isChecked = selectedPriceListModelIds.has(p.id);
            return `
                <div class="laporan-detail-item" style="padding: 6px 10px;">
                    <label class="checkbox-model-item">
                        <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="togglePriceListModelSelect('${p.id}')">
                        <div class="detail-left" style="flex:1;"><span class="detail-title">${p.brand} - ${p.model}</span><span class="detail-sub">JKT: ${formatDisplayPrice(p.jkt)} | SGC: ${formatDisplayPrice(p.sgc)} | BNIB: ${formatDisplayPrice(p.bnib)}</span></div>
                    </label>
                </div>
            `;
        }).join('');

        html = `
            <div class="laporan-section-card">
                <div class="laporan-section-header">
                    <div class="laporan-section-title"><i class="fa-solid fa-tags"></i> Ringkasan Price List</div>
                    <span class="badge-count">${d.filteredPLSelected.length} dari ${d.filteredPLAll.length} Dipilih</span>
                </div>
                <div class="laporan-row"><span class="laporan-label">Model Siap Cetak</span><span class="laporan-value highlight-blue">${d.filteredPLSelected.length} Model</span></div>
            </div>
            <button class="report-accordion-header ${isReportAccordionOpen ? 'expanded' : ''}" onclick="toggleReportAccordion()">
                <span><i class="fa-solid fa-square-check" style="color:var(--azure-primary); margin-right:6px;"></i> Pilih Model Handphone (${d.filteredPLAll.length})</span>
                <i class="fa-solid fa-chevron-down acc-icon"></i>
            </button>
            <div id="report-accordion-body" class="report-accordion-content ${isReportAccordionOpen ? 'expanded' : ''}">${rowsHtml}</div>
        `;
    }

    container.innerHTML = html;
};

function generateReportCardHTML() {
    let d = getLaporanDataSummary();
    let catTitles = { kas: 'Kas Pribadi', penjualan: 'Penjualan', stok: 'Stok Ready Gudang', pricelist: 'Katalog Price List' };
    let activeTitle = catTitles[activeReportCategory] || 'Rekap Bisnis';
    let tglCetak = new Date().toLocaleDateString('id-ID');

    let summaryCardsHtml = '';
    let tableRowsHtml = '';

    if (activeReportCategory === 'kas') {
        summaryCardsHtml = `
            <div class="doc-mini-stat"><span style="font-size: 10px; color: #64748B;">Total Pemasukan</span><h4 style="color: #10B981; font-size: 13.5px; margin-top:2px;">+ ${formatRupiah(d.totalMasuk)}</h4></div>
            <div class="doc-mini-stat"><span style="font-size: 10px; color: #64748B;">Total Pengeluaran</span><h4 style="color: #EF4444; font-size: 13.5px; margin-top:2px;">- ${formatRupiah(d.totalKeluar)}</h4></div>
            <div class="doc-mini-stat"><span style="font-size: 10px; color: #64748B;">Saldo Akhir</span><h4 style="color: #0077B6; font-size: 13.5px; margin-top:2px;">${formatRupiah(d.saldoAktif)}</h4></div>
        `;
        tableRowsHtml = d.filteredKas.length === 0 ? `<tr><td colspan="4" align="center" style="color:#64748B;">Tidak ada catatan kas.</td></tr>` : d.filteredKas.map((k, i) => `
            <tr>
                <td align="center">${i + 1}</td>
                <td><b>${k.keterangan}</b></td>
                <td>${formatTanggalID(k.tanggal)} (${k.kategori.toUpperCase()})</td>
                <td align="right" style="font-weight:700; color:${k.kategori==='masuk'?'#10B981':'#EF4444'}; font-family:var(--font-mono);">${k.kategori==='masuk'?'+':'-'} ${formatRupiah(k.nominal)}</td>
            </tr>
        `).join('');
    } else if (activeReportCategory === 'penjualan') {
        summaryCardsHtml = `
            <div class="doc-mini-stat"><span style="font-size: 10px; color: #64748B;">Unit Terjual</span><h4 style="color: #0F172A; font-size: 13.5px; margin-top:2px;">${d.sumTerjual} Unit</h4></div>
            <div class="doc-mini-stat"><span style="font-size: 10px; color: #64748B;">Omset Transaksi</span><h4 style="color: #0077B6; font-size: 13.5px; margin-top:2px;">${formatRupiah(d.totalOmset)}</h4></div>
            <div class="doc-mini-stat"><span style="font-size: 10px; color: #64748B;">Laba Bersih</span><h4 style="color: #10B981; font-size: 13.5px; margin-top:2px;">+ ${formatRupiah(d.totalProfit)}</h4></div>
        `;
        tableRowsHtml = daftarTerjual.length === 0 ? `<tr><td colspan="4" align="center" style="color:#64748B;">Belum ada data penjualan.</td></tr>` : daftarTerjual.map((t, i) => {
            let p = (parseRawToNumeric(t.hargaJual) || 0) - (parseRawToNumeric(t.hargaModal) || 0);
            return `
                <tr>
                    <td align="center">${i + 1}</td>
                    <td><b>${t.produk}</b><br><span style="font-size:9.5px; color:#64748B;">IMEI: ${t.imei || '-'}</span></td>
                    <td>Modal: ${t.hargaModal || '0'}<br>Jual: ${t.hargaJual || '0'}</td>
                    <td align="right" style="font-weight:700; color:${p>=0?'#10B981':'#EF4444'}; font-family:var(--font-mono);">+ ${formatRupiah(p)}</td>
                </tr>
            `;
        }).join('');
    } else if (activeReportCategory === 'stok') {
        summaryCardsHtml = `
            <div class="doc-mini-stat"><span style="font-size: 10px; color: #64748B;">Total Stok Gudang</span><h4 style="color: #0077B6; font-size: 13.5px; margin-top:2px;">${d.sumStok} Unit Ready</h4></div>
        `;
        tableRowsHtml = daftarStokMasuk.length === 0 ? `<tr><td colspan="4" align="center" style="color:#64748B;">Belum ada unit ready.</td></tr>` : daftarStokMasuk.map((s, i) => `
            <tr>
                <td align="center">${i + 1}</td>
                <td><b>${s.produk}</b><br><span style="font-size:9.5px; color:#64748B;">Kondisi: ${s.kondisi} • ${s.kelengkapan}</span></td>
                <td>IMEI: ${s.imei || '-'}<br>Tgl: ${formatTanggalID(s.tanggal)}</td>
                <td align="center" style="font-weight:800; color:#0077B6;">${s.qty || 1} Unit</td>
            </tr>
        `).join('');
    } else if (activeReportCategory === 'pricelist') {
        summaryCardsHtml = `
            <div class="doc-mini-stat"><span style="font-size: 10px; color: #64748B;">Model Dipilih</span><h4 style="color: #0077B6; font-size: 13.5px; margin-top:2px;">${d.filteredPLSelected.length} Model</h4></div>
        `;
        tableRowsHtml = d.filteredPLSelected.length === 0 ? `<tr><td colspan="4" align="center" style="color:#64748B;">Tidak ada model terpilih.</td></tr>` : d.filteredPLSelected.map((p, i) => `
            <tr>
                <td align="center">${i + 1}</td>
                <td><b>[${p.brand}] ${p.model}</b></td>
                <td>JKT: ${formatDisplayPrice(p.jkt)} | SGC: ${formatDisplayPrice(p.sgc)}</td>
                <td align="right" style="font-weight:700; color:#10B981; font-family:var(--font-mono);">BNIB: ${formatDisplayPrice(p.bnib)}</td>
            </tr>
        `).join('');
    }

    return `
        <div class="elegant-export-card" style="background:#FFFFFF; color:#0F172A; padding:32px 34px; border:2px solid #BAE6FD; border-radius:14px; box-sizing:border-box; width:100%; min-height: 1050px; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
                <div class="doc-header-kop">
                    <img src="logo-np.jpg" alt="Logo NP" class="doc-logo-img">
                    <div class="doc-brand-info">
                        <h2>NP - GALERY</h2>
                        <p>Smartphone Store & Premium Service</p>
                    </div>
                </div>

                <div class="doc-report-title-badge" style="margin-top: 14px;">
                    <span>LAPORAN: ${activeTitle.toUpperCase()}</span>
                    <span>Tgl: ${tglCetak}</span>
                </div>

                <div class="doc-summary-cards" style="margin-top: 12px;">
                    ${summaryCardsHtml}
                </div>

                <table class="doc-table-elegant" style="margin-top: 16px;">
                    <thead>
                        <tr>
                            <th style="width: 35px; text-align: center;">No</th>
                            <th>Deskripsi Item</th>
                            <th>Keterangan / Info</th>
                            <th style="text-align: right; width: 140px;">Jumlah / Nilai</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRowsHtml}
                    </tbody>
                </table>
            </div>

            <div class="doc-footer-sign" style="margin-top: 30px; border-top: 1px dashed #CBD5E1; padding-top: 16px;">
                <div class="doc-sign-box">
                    <span>Penanggung Jawab,</span>
                    <img src="tanda-tangan.png" alt="Tanda Tangan" class="doc-auto-sign-img" onerror="this.style.display='none';">
                    <div class="doc-sign-space" style="display:none;"></div>
                    <b style="border-top: 1px solid #94A3B8; padding-top: 4px; width: 100%; display: block;">( NP - Galery )</b>
                </div>
            </div>
        </div>
    `;
}

function generatePlainTextReport() {
    let d = getLaporanDataSummary();
    let catNames = { kas: 'KAS PRIBADI', penjualan: 'PENJUALAN', stok: 'STOK READY', pricelist: 'PRICE LIST' };
    let currentCatKey = activeReportCategory;

    let text = `======================================================\n`;
    text += `             LAPORAN RESMI NP - GALERY               \n`;
    text += `Kategori : ${catNames[currentCatKey]}\n`;
    text += `Tanggal  : ${new Date().toLocaleDateString('id-ID')}\n`;
    text += `======================================================\n\n`;

    if (currentCatKey === 'kas') {
        text += `Total Pemasukan   : + ${formatRupiah(d.totalMasuk)}\n`;
        text += `Total Pengeluaran : - ${formatRupiah(d.totalKeluar)}\n`;
        text += `Saldo Aktif Kas   : ${formatRupiah(d.saldoAktif)}\n\n`;
        text += `--- RINCIAN MUTASI ---\n`;
        d.filteredKas.forEach((k, i) => {
            text += `${i+1}. [${k.kategori.toUpperCase()}] ${k.keterangan} | ${formatRupiah(k.nominal)} | Tgl: ${formatTanggalID(k.tanggal)}\n`;
        });
    } else if (currentCatKey === 'penjualan') {
        text += `Total Terjual : ${d.sumTerjual} Unit\n`;
        text += `Total Omset   : ${formatRupiah(d.totalOmset)}\n`;
        text += `Total Laba    : + ${formatRupiah(d.totalProfit)}\n\n`;
        text += `--- RINCIAN PENJUALAN ---\n`;
        daftarTerjual.forEach((t, i) => {
            let p = (parseRawToNumeric(t.hargaJual) || 0) - (parseRawToNumeric(t.hargaModal) || 0);
            text += `${i+1}. ${t.produk} | Modal: ${t.hargaModal} | Jual: ${t.hargaJual} | Laba: ${formatRupiah(p)}\n`;
        });
    } else if (currentCatKey === 'stok') {
        text += `Total Stok Ready : ${d.sumStok} Unit\n\n`;
        text += `--- RINCIAN STOK GUDANG ---\n`;
        daftarStokMasuk.forEach((s, i) => {
            text += `${i+1}. ${s.produk} (${s.kondisi}) - IMEI: ${s.imei} - Qty: ${s.qty} unit\n`;
        });
    } else if (currentCatKey === 'pricelist') {
        text += `Model Dipilih : ${d.filteredPLSelected.length} Model\n\n`;
        text += `--- KATALOG HARGA ---\n`;
        d.filteredPLSelected.forEach((p, i) => {
            text += `${i+1}. [${p.brand}] ${p.model} | JKT: ${p.jkt} | SGC: ${p.sgc} | BNIB: ${p.bnib}\n`;
        });
    }
    return text;
}

function generateCSVReport() {
    let d = getLaporanDataSummary();
    let currentCatKey = activeReportCategory;
    let csv = `\uFEFFNo,Kategori,Deskripsi,Keterangan,Nilai_Rp\n`;

    if (currentCatKey === 'kas') {
        d.filteredKas.forEach((k, i) => {
            csv += `"${i+1}","KAS","${k.keterangan}","${formatTanggalID(k.tanggal)} - ${k.kategori}","${k.nominal}"\n`;
        });
    } else if (currentCatKey === 'penjualan') {
        daftarTerjual.forEach((t, i) => {
            let p = (parseRawToNumeric(t.hargaJual) || 0) - (parseRawToNumeric(t.hargaModal) || 0);
            csv += `"${i+1}","PENJUALAN","${t.produk}","IMEI: ${t.imei || '-'}","${p}"\n`;
        });
    } else if (currentCatKey === 'stok') {
        daftarStokMasuk.forEach((s, i) => {
            csv += `"${i+1}","STOK","${s.produk}","${s.kondisi} - IMEI: ${s.imei || '-'}","${s.qty || 1}"\n`;
        });
    } else if (currentCatKey === 'pricelist') {
        d.filteredPLSelected.forEach((p, i) => {
            csv += `"${i+1}","PRICELIST","${p.brand} ${p.model}","JKT: ${p.jkt} | SGC: ${p.sgc}","BNIB: ${p.bnib}"\n`;
        });
    }
    return csv;
}

window.openReportPreview = function() {
    const content = document.getElementById('report-preview-content');
    const subtitle = document.getElementById('report-preview-subtitle');
    const selectedFormat = document.getElementById('export-format-select')?.value || 'txt';
    if (!content) return;
    
    let catTitles = { kas: 'Kas Pribadi', penjualan: 'Penjualan', stok: 'Stok Ready', pricelist: 'Price List' };
    if (subtitle) subtitle.textContent = `Pratinjau [Format ${selectedFormat.toUpperCase()}] - ${catTitles[activeReportCategory]}`;

    if (selectedFormat === 'img' || selectedFormat === 'docs') {
        content.innerHTML = `
            <div style="background: var(--bg-page); padding: 8px; border-radius: 10px; border: 1px solid var(--border-subtle);">
                <div style="font-size: 10.5px; color: var(--azure-primary); font-weight: 700; margin-bottom: 6px;">
                    <i class="fa-solid fa-file-contract"></i> Layout Lembar Cetak Dokumen A4:
                </div>
                ${generateReportCardHTML()}
            </div>
        `;
    } else if (selectedFormat === 'txt') {
        content.innerHTML = `
            <div style="font-size: 10.5px; color: var(--azure-primary); font-weight: 700; margin-bottom: 6px;">
                <i class="fa-solid fa-file-lines"></i> Pratinjau Teks Bersih (.txt):
            </div>
            <pre style="background: var(--bg-page); padding: 12px; border-radius: 10px; font-family: monospace; font-size: 11px; white-space: pre-wrap; border: 1px solid var(--border-subtle);">${generatePlainTextReport()}</pre>
        `;
    } else if (selectedFormat === 'csv') {
        let d = getLaporanDataSummary();
        let tableRows = '';
        if (activeReportCategory === 'kas') {
            tableRows = d.filteredKas.map((k, i) => `<tr><td align="center">${i+1}</td><td>KAS</td><td>${k.keterangan}</td><td>${k.tanggal}</td><td align="right">${formatRupiah(k.nominal)}</td></tr>`).join('');
        } else if (activeReportCategory === 'penjualan') {
            tableRows = daftarTerjual.map((t, i) => `<tr><td align="center">${i+1}</td><td>PENJUALAN</td><td>${t.produk}</td><td>${t.imei || '-'}</td><td align="right">${t.hargaJual || '0'}</td></tr>`).join('');
        } else if (activeReportCategory === 'stok') {
            tableRows = daftarStokMasuk.map((s, i) => `<tr><td align="center">${i+1}</td><td>STOK</td><td>${s.produk}</td><td>${s.kondisi}</td><td align="center">${s.qty || 1}</td></tr>`).join('');
        } else if (activeReportCategory === 'pricelist') {
            tableRows = d.filteredPLSelected.map((p, i) => `<tr><td align="center">${i+1}</td><td>PRICELIST</td><td>${p.brand} ${p.model}</td><td>${p.jkt}</td><td align="right">${p.sgc}</td></tr>`).join('');
        }

        content.innerHTML = `
            <div style="font-size: 10.5px; color: var(--azure-primary); font-weight: 700; margin-bottom: 6px;">
                <i class="fa-solid fa-file-csv"></i> Pratinjau Struktur Kolom Excel (.csv):
            </div>
            <table class="doc-table-elegant" style="font-size: 10.5px;">
                <thead><tr><th style="width:30px;">No</th><th>Kategori</th><th>Deskripsi</th><th>Info</th><th style="text-align:right;">Nilai</th></tr></thead>
                <tbody>${tableRows || '<tr><td colspan="5" align="center">Tidak ada data.</td></tr>'}</tbody>
            </table>
        `;
    }

    document.getElementById('report-preview-modal')?.classList.add('show');
};

window.closeReportPreview = function() { document.getElementById('report-preview-modal')?.classList.remove('show'); };
window.executeExportReport = function() { processFileDownload(document.getElementById('export-format-select').value); };
window.executeExportReportFromPreview = function() { processFileDownload(document.getElementById('export-format-select').value); closeReportPreview(); };

function processFileDownload(format) {
    let catNames = { kas: 'Kas_Pribadi', penjualan: 'Penjualan', stok: 'Stok_Ready', pricelist: 'Price_List' };
    let currentCatKey = activeReportCategory;
    let filename = `NPGalery_Laporan_${catNames[currentCatKey]}_${new Date().toISOString().slice(0,10)}`;

    if (format === 'txt') {
        let text = generatePlainTextReport();
        downloadFileBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${filename}.txt`);
    } else if (format === 'csv') {
        let csv = generateCSVReport();
        downloadFileBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`);
    } else if (format === 'docs') {
        let bodyHtml = generateReportCardHTML();
        let docHtml = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
            <head>
                <meta charset="utf-8">
                <title>${filename}</title>
                <style>
                    @page Section1 {
                        size: 210mm 297mm;
                        margin: 1.5cm 1.5cm 1.5cm 1.5cm;
                    }
                    div.Section1 { page: Section1; }
                    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #0F172A; }
                    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
                    th { background-color: #0077B6; color: #FFFFFF; padding: 8px; border: 1px solid #0077B6; }
                    td { padding: 8px; border: 1px solid #CBD5E1; font-size: 10pt; }
                </style>
            </head>
            <body>
                <div class="Section1">
                    ${bodyHtml}
                </div>
            </body>
            </html>
        `;
        downloadFileBlob(new Blob([docHtml], { type: 'application/msword;charset=utf-8' }), `${filename}.doc`);
    } else if (format === 'img') {
        const renderCanvas = document.getElementById('export-render-canvas');
        if (!renderCanvas || !window.html2canvas) {
            showToast('Gagal', 'Library gambar belum siap.', false);
            return;
        }

        renderCanvas.innerHTML = generateReportCardHTML();

        showToast('Memproses', 'Menyiapkan lembar gambar laporan A4...');

        html2canvas(renderCanvas, {
            scale: 2,
            backgroundColor: '#FFFFFF',
            useCORS: true,
            logging: false
        }).then(canvas => {
            let link = document.createElement('a');
            link.download = `${filename}_A4.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            showToast('Berhasil!', 'Laporan format gambar A4 (PNG) berhasil diunduh.');
        }).catch(err => {
            showToast('Gagal', 'Gagal merender gambar laporan.', false);
            console.error(err);
        });
    }
}

function downloadFileBlob(blob, filename) {
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    showToast('Berhasil', `File ${filename} diunduh.`);
}
