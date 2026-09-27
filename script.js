/**
 * NPGALERY - CORE SCRIPT & PRICE LIST PERBANDINGAN HARGA
 * FULLY CLOUD-NATIVE VIA SUPABASE & REALTIME SYNC (5 TABEL UTAMA)
 * THEME: DEEP OBSIDIAN & TITANIUM PLATINUM (ELECTRIC STEEL BLUE ACCENT)
 */

// KONFIGURASI KONEKSI SUPABASE
const SUPABASE_URL = "https://howayirmbfhyludvwvgn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhvd2F5aXJtYmZoeWx1ZHZ3dmduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1MzM5MDcsImV4cCI6MjEwNDEwOTkwN30.hRjCJzUjMOQSJmPW-AZ-WZKTN0TS6787A2vq4tQtF7Y";

let supabaseClient = null;
if (window.supabase && typeof window.supabase.createClient === 'function') {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// FLAG KEAMANAN MODE GARANSI PUBLIK
let isPublicWarrantyMode = false;

// DATA IN-MEMORY (SINGLE SOURCE OF TRUTH: SUPABASE)
let rawPriceListData = [];
let rawDiagnosisData = [];
let daftarStokMasuk = [];
let daftarTerjual = [];
let daftarKasPribadi = [];
let daftarNotes = [];

let currentPage = 1;
const itemsPerPage = 10;
let currentFilteredData = [];
let currentEditId = null;
let editOpenedFromDetail = false;

let activeInvoiceData = null;
let tempInvoiceOverridePrice = null;
let tempInvoiceOriginalItem = null;

// INSTANCE SCANNER KAMERA
let html5QrScannerInstance = null;

// STATE CHECKLIST DIAGNOSIS
let checkedDiagnosisCodes = new Set();

// STATE KALKULATOR KAS
let calcCurrentVal = "0";
let calcEquation = "";

// STATE FOTO FISIK UNIT STOK
let selectedStockPhotoFile = null;

// STATE SERTIFIKAT GARANSI DIGITAL AKTIF
let activeWarrantyItemData = null;

// MAPPING LINK RESMI CEK IMEI PER BRAND
const BRAND_IMEI_LINKS = {
    'SAMSUNG': { name: 'Samsung', url: 'https://imeicheck.com/id/samsung-imei-check' },
    'OPPO': { name: 'Oppo', url: 'https://support.oppo.com/id/check/' },
    'XIAOMI': { name: 'Xiaomi / Poco', url: 'https://www.mi.com/global/verify' },
    'VIVO': { name: 'Vivo', url: 'https://www.vivo.com/id/support/IMEI' },
    'REALME': { name: 'Realme', url: 'https://www.realme.com/id/support/phonecheck' },
    'INFINIX': { name: 'Infinix (Carlcare)', url: 'https://www.carlcare.com/id/warranty-check/' },
    'TECNO': { name: 'Tecno (Carlcare)', url: 'https://www.carlcare.com/id/warranty-check/' },
    'ITEL': { name: 'Itel (Carlcare)', url: 'https://www.carlcare.com/id/warranty-check/' },
    'ASUS': { name: 'Asus', url: 'https://www.asus.com/id/support/warranty-status-inquiry/' }
};

const ORDERED_BRANDS = [
    'SAMSUNG',
    'REALME',
    'INFINIX',
    'XIAOMI',
    'REDMI',
    'VIVO',
    'POCO',
    'OPPO',
    'TECNO',
    'ITEL'
];

/* ========================================================== */
/* FUNGSI PEMBANTU MODAL UNIVERSAL & FORMAT RUPIAH            */
/* ========================================================== */
function toggleModal(modalId, show = true) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    if (show) modal.classList.add('show');
    else modal.classList.remove('show');
}

function formatRupiahBase(num, isComplete = false) {
    if (num === null || isNaN(num)) return 'Rp 0';
    if (isComplete) {
        return 'Rp ' + Math.round(num).toLocaleString('id-ID');
    }
    let ringkas = Math.round(num / 1000);
    return 'Rp ' + ringkas.toLocaleString('id-ID');
}

function formatRupiahRingkas(num) {
    return formatRupiahBase(num, false);
}

function formatRupiahLengkap(num) {
    return formatRupiahBase(num, true);
}

function formatRupiah(num) {
    return formatRupiahRingkas(num);
}

function naturalModelCompare(a, b) {
    return (a || '').localeCompare(b || '', undefined, { numeric: true, sensitivity: 'base' });
}

function sortPriceListConsistently(list) {
    return list.sort((a, b) => {
        const brandA = (a.brand || '').trim().toUpperCase();
        const brandB = (b.brand || '').trim().toUpperCase();

        const indexA = ORDERED_BRANDS.indexOf(brandA);
        const indexB = ORDERED_BRANDS.indexOf(brandB);

        if (indexA !== -1 && indexB !== -1) {
            if (indexA !== indexB) return indexA - indexB;
        } else if (indexA !== -1) {
            return -1;
        } else if (indexB !== -1) {
            return 1;
        } else if (brandA !== brandB) {
            return brandA.localeCompare(brandB);
        }

        return naturalModelCompare(a.model, b.model);
    });
}

function getModelNameWithoutSpecs(modelName) {
    if (!modelName) return '';
    return modelName.split('(')[0].trim().toLowerCase();
}

/* ========================================================== */
/* SISTEM INDIKATOR STATUS KONEKSI & REAL-TIME SYNC — id="rt5k2a" */
/* ========================================================== */
let isCloudConnected = false;

function setConnectionStatus(status) {
    const btn = document.getElementById('btn-connection-status');
    const phoneGlow = document.getElementById('np-phone-glow');

    // Status realtime tetap menjadi sumber tunggal untuk seluruh feedback visual.
    if (status === 'connected') {
        isCloudConnected = true;
    } else {
        isCloudConnected = false;
    }

    if (btn) {
        btn.classList.remove('status-connected', 'status-disconnected', 'status-syncing');
        if (status === 'connected') {
            btn.classList.add('status-connected');
            btn.title = 'Koneksi Cloud: Terhubung & Realtime Aktif';
        } else if (status === 'syncing') {
            btn.classList.add('status-syncing');
            btn.title = 'Koneksi Cloud: Sedang Sinkronisasi...';
        } else {
            btn.classList.add('status-disconnected');
            btn.title = 'Koneksi Cloud: Terputus / Periksa Sambungan';
        }
    }

    if (phoneGlow) {
        phoneGlow.classList.remove('status-connected', 'status-disconnected', 'status-syncing');
        phoneGlow.classList.add(`status-${status === 'connected' ? 'connected' : status === 'syncing' ? 'syncing' : 'disconnected'}`);
        phoneGlow.setAttribute('aria-label', `Status realtime: ${status}`);
    }
}

window.checkConnectionStatusManual = async function(btn) {
    if (isPublicWarrantyMode) return;
    setConnectionStatus('syncing');
    showToast('Koneksi', 'Memeriksa sambungan ke Supabase...');
    try {
        if (!navigator.onLine || !supabaseClient) {
            throw new Error('Offline');
        }
        const { error } = await supabaseClient.from('product').select('id').limit(1);
        if (error) throw error;

        setConnectionStatus('connected');
        showToast('Online', 'Terhubung ke server Supabase Cloud.');
        await syncFromSupabase();
    } catch (e) {
        setConnectionStatus('disconnected');
        showToast('Offline', 'Koneksi cloud terganggu. Periksa internet Anda.', false);
    }
};

window.addEventListener('online', () => {
    if (isPublicWarrantyMode) return;
    setConnectionStatus('syncing');
    syncFromSupabase().then(() => setConnectionStatus('connected'));
});
window.addEventListener('offline', () => {
    if (isPublicWarrantyMode) return;
    setConnectionStatus('disconnected');
    showToast('Offline', 'Koneksi internet terputus.', false);
});

// SINKRONISASI DATA UTAMA DARI SUPABASE
async function syncFromSupabase() {
    if (isPublicWarrantyMode) return;
    if (!supabaseClient || !navigator.onLine) {
        setConnectionStatus('disconnected');
        return;
    }
    setConnectionStatus('syncing');
    try {
        await Promise.all([
            syncPriceListFromSupabaseOnly(),
            syncProductsFromSupabaseOnly(),
            syncTransactionsFromSupabaseOnly(),
            syncCashFromSupabaseOnly(),
            syncNotesFromSupabaseOnly()
        ]);
        setConnectionStatus('connected');
    } catch (err) {
        console.warn('Gagal sinkronisasi data dari Supabase:', err);
        setConnectionStatus('disconnected');
    }
}

/* ========================================================== */
/* FUNGSI SINKRONISASI MASING-MASING TABEL KE SUPABASE        */
/* ========================================================== */

// 1. TABEL PRICELIST
async function syncPriceListFromSupabaseOnly() {
    if (!supabaseClient || isPublicWarrantyMode) return;
    try {
        const { data, error } = await supabaseClient.from('pricelist').select('*');

        if (!error && data) {
            if (data.length === 0) {
                await initialMigratePriceListToSupabase();
                return;
            }
            rawPriceListData = data.map(item => ({
                id: item.id,
                brand: item.brand,
                model: item.model,
                jkt: item.jkt || '--',
                sgc: item.sgc || '--',
                bnib: item.bnib || '--'
            }));

            sortPriceListConsistently(rawPriceListData);
            initBrandDropdown();
            filterPriceList();
        }
    } catch (e) {
        console.warn('Gagal memuat tabel pricelist:', e);
    }
}

async function initialMigratePriceListToSupabase() {
    try {
        let oldData = [];
        try {
            const response = await fetch('pricelist.json');
            if (response.ok) oldData = await response.json();
        } catch (e) {}

        let bnibData = [];
        try {
            const resBnib = await fetch('listbnib.json');
            if (resBnib.ok) bnibData = await resBnib.json();
        } catch (e) {}

        let mergedMap = new Map();
        oldData.forEach(item => {
            let key = `${item.brand.trim().toUpperCase()} - ${item.model.trim().toUpperCase()}`;
            mergedMap.set(key, {
                id: String(item.id || 'pl-' + Math.random().toString(36).substr(2, 9)),
                brand: item.brand.trim().toUpperCase(),
                model: item.model.trim(),
                jkt: item.jkt || '--',
                sgc: item.sgc || '--',
                bnib: item.bnib || '--'
            });
        });

        bnibData.forEach(item => {
            let key = `${item.brand.trim().toUpperCase()} - ${item.model.trim().toUpperCase()}`;
            if (mergedMap.has(key)) {
                let existing = mergedMap.get(key);
                if (item.bnib && item.bnib !== '--') existing.bnib = item.bnib;
            } else {
                mergedMap.set(key, {
                    id: String(item.id || 'pl-' + Math.random().toString(36).substr(2, 9)),
                    brand: item.brand.trim().toUpperCase(),
                    model: item.model.trim(),
                    jkt: item.jkt || '--',
                    sgc: item.sgc || '--',
                    bnib: item.bnib || '--'
                });
            }
        });

        const initialList = Array.from(mergedMap.values());
        if (initialList.length > 0 && supabaseClient) {
            const { error } = await supabaseClient.from('pricelist').upsert(initialList);
            if (!error) {
                rawPriceListData = initialList;
                sortPriceListConsistently(rawPriceListData);
                initBrandDropdown();
                filterPriceList();
            }
        }
    } catch (err) {
        console.warn('Gagal migrasi data awal pricelist:', err);
    }
}

// 2. TABEL PRODUCT
async function syncProductsFromSupabaseOnly() {
    if (!supabaseClient) return;
    const { data: prods, error: errProds } = await supabaseClient
        .from('product')
        .select('*')
        .order('created_at', { ascending: false });

    if (!errProds && prods) {
        daftarStokMasuk = prods.filter(p => p.status === 'ready' || !p.status).map(p => ({
            id: p.id,
            produk: p.name,
            kondisi: p.condition || 'Second',
            kelengkapan: p.completeness || 'Fullset',
            imei: p.imei || '-',
            qty: String(p.qty || 1),
            hargaModal: String(p.buy_price || 0),
            hargaJual: String(p.sell_price || ''),
            hargaDisplay: String(p.display_price || ''),
            isNego: p.is_nego !== undefined ? Boolean(p.is_nego) : true,
            pembeli: p.buyer || '',
            tanggal: p.date || (p.created_at ? p.created_at.slice(0, 10) : ''),
            imageUrl: p.image_url || null
        }));

        updateDashboardStats();
        initShowcaseBrandDropdown();
    }
}

// 3. TABEL TRANSACTIONS
async function syncTransactionsFromSupabaseOnly() {
    if (!supabaseClient || isPublicWarrantyMode) return;
    const { data: trx, error: errTrx } = await supabaseClient
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false });

    if (!errTrx && trx) {
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
        renderInvoiceCenter();
        renderDaftarModal();
        updateDashboardStats();
    }
}

// 4. TABEL CASH_MUTATIONS
async function syncCashFromSupabaseOnly() {
    if (!supabaseClient || isPublicWarrantyMode) return;
    const { data: mutasi, error: errMutasi } = await supabaseClient
        .from('cash_mutations')
        .select('*')
        .order('created_at', { ascending: false });

    if (!errMutasi && mutasi) {
        daftarKasPribadi = mutasi.map(m => ({
            id: m.id,
            keterangan: m.description,
            kategori: m.type,
            nominal: parseFloat(m.amount) || 0,
            tanggal: m.date || (m.created_at ? m.created_at.slice(0, 10) : '')
        }));
        renderManajemenKas();
        updatePribadiStats();
    }
}

// 5. TABEL NOTES
async function syncNotesFromSupabaseOnly() {
    if (!supabaseClient || isPublicWarrantyMode) return;
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
            renderDaftarNotes();
        }
    } catch (e) {
        console.warn('Gagal memuat tabel notes:', e);
    }
}

// SETUP SUPABASE REALTIME
function setupSupabaseRealtime() {
    if (!supabaseClient || isPublicWarrantyMode) {
        if (!supabaseClient) setConnectionStatus('disconnected');
        return;
    }

    supabaseClient
        .channel('npgalery-realtime-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pricelist' }, () => syncPriceListFromSupabaseOnly())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'product' }, () => syncProductsFromSupabaseOnly())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => syncTransactionsFromSupabaseOnly())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_mutations' }, () => syncCashFromSupabaseOnly())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, () => syncNotesFromSupabaseOnly())
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                setConnectionStatus('connected');
            } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                setConnectionStatus('disconnected');
            }
        });
}

async function loadDiagnosisData() {
    if (isPublicWarrantyMode) return;
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

// INISIALISASI SAAT DOM READY & PENGECEKAN PARAMETER URL GARANSI
document.addEventListener('DOMContentLoaded', async () => {
    const savedTheme = localStorage.getItem('npgalery_theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        const themeIcon = document.getElementById('theme-icon');
        if (themeIcon) themeIcon.classList.replace('fa-moon', 'fa-sun');
    }
    updateThemeMenu();

    const authModal = document.getElementById('auth-modal');
    const urlParams = new URLSearchParams(window.location.search);
    const isWarrantyRequest = urlParams.has('warranty');

    if (isWarrantyRequest) {
        isPublicWarrantyMode = true;
        if (authModal) authModal.classList.add('hidden');

        const header = document.querySelector('.floating-header-container');
        const nav = document.querySelector('.floating-nav-container');
        const fab = document.getElementById('btn-floating-ai');
        const mainContent = document.querySelector('.content-container');

        if (header) header.style.display = 'none';
        if (nav) nav.style.display = 'none';
        if (fab) fab.style.display = 'none';
        if (mainContent) mainContent.style.display = 'none';

        checkUrlForWarrantyParam();
        return;
    }

    if (supabaseClient) {
        const { data: sessionData } = await supabaseClient.auth.getSession();
        if (sessionData && sessionData.session) {
            localStorage.setItem('npgalery_logged_in', 'true');
            if (authModal) authModal.classList.add('hidden');
        } else {
            const isLoggedIn = localStorage.getItem('npgalery_logged_in');
            if (authModal) {
                if (isLoggedIn === 'true') authModal.classList.add('hidden');
                else authModal.classList.remove('hidden');
            }
        }
    }

    loadDiagnosisData();
    initAllCustomDropdowns();

    // Default tampilan adalah Home Screen polos
    goHomeScreen();

    const searchInput = document.getElementById('filter-model-input');
    if (searchInput) {
        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                triggerPriceListModalSearch();
            }
        });
    }

    if (navigator.onLine && supabaseClient) {
        setConnectionStatus('syncing');
        await syncFromSupabase();
        setupSupabaseRealtime();
    } else {
        setConnectionStatus('disconnected');
    }

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
/* PINTASAN PENCARIAN TANYA AI                                */
/* ========================================================== */
window.openAiSearch = function() {
    window.open('https://www.google.com/search?udm=50&q=', '_blank');
};

/* ========================================================== */
/* MENU AKSI TENGAH (+): TOGGLE MENU & HANDLER AKSI            */
/* Menu ditampilkan horizontal di atas tombol (+)             */
/* ========================================================== */
window.toggleCenterRadialMenu = function() {
    const menu = document.getElementById('center-radial-menu');
    const backdrop = document.getElementById('center-radial-backdrop');
    const addBtn = document.getElementById('btn-nav-center-add');

    if (!menu || !backdrop) return;

    const isActive = menu.classList.contains('active');

    if (isActive) {
        closeCenterRadialMenu();
    } else {
        menu.classList.add('active');
        backdrop.classList.add('active');
        if (addBtn) {
            addBtn.classList.add('active');
            addBtn.setAttribute('aria-expanded', 'true');
        }
    }
};

window.closeCenterRadialMenu = function() {
    const menu = document.getElementById('center-radial-menu');
    const backdrop = document.getElementById('center-radial-backdrop');
    const addBtn = document.getElementById('btn-nav-center-add');

    if (menu) menu.classList.remove('active');
    if (backdrop) backdrop.classList.remove('active');

    if (addBtn) {
        addBtn.classList.remove('active');
        addBtn.setAttribute('aria-expanded', 'false');
    }
};

window.triggerRadialAction = function(actionType) {
    // Tutup menu terlebih dahulu, lalu jalankan aksi aslinya.
    closeCenterRadialMenu();

    if (actionType === 'stock') {
        // Icon Stock -> tetap membuka form Tambah Stok.
        openAddStokModal();
    } else if (actionType === 'wa') {
        // Icon WhatsApp -> tetap membuka form Direct WhatsApp.
        openDirectWaModal();
    }
};

function parseRawToNumeric(valStr) {
    if (!valStr || valStr.trim() === '--' || valStr.trim() === '') return null;
    let clean = valStr.toString().trim().replace(/\./g, '');
    let num = parseFloat(clean);
    if (isNaN(num)) return null;
    if (num < 1000000) return num * 1000;
    return num;
}

function formatDisplayPrice(priceString, isExport = false) {
    if (!priceString || priceString.trim() === '--') return '--';
    const parts = priceString.split('/');
    const formattedParts = parts.map(part => {
        const val = parseRawToNumeric(part);
        if (val === null) return '--';
        return isExport ? formatRupiahLengkap(val) : formatRupiahRingkas(val);
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

/* ========================================================== */
/* FITUR MANAJEMEN FOTO UNIT                                  */
/* ========================================================== */
window.handleStockPhotoSelect = function(inputEl) {
    if (!inputEl.files || inputEl.files.length === 0) return;
    const file = inputEl.files[0];
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const previewBox = document.getElementById('stok-foto-preview-box');
        const previewImg = document.getElementById('stok-foto-preview-img');
        if (previewImg && previewBox) {
            previewImg.src = e.target.result;
            previewBox.classList.remove('hidden');
        }
    };
    reader.readAsDataURL(file);

    compressImageFile(file, 900, 0.78, (compressedBlob) => {
        selectedStockPhotoFile = compressedBlob;
    });
};

window.removeStockPhotoSelection = function() {
    selectedStockPhotoFile = null;
    const inputEl = document.getElementById('stok-foto-input');
    const previewBox = document.getElementById('stok-foto-preview-box');
    const previewImg = document.getElementById('stok-foto-preview-img');
    if (inputEl) inputEl.value = '';
    if (previewImg) previewImg.src = '';
    if (previewBox) previewBox.classList.add('hidden');
};

function compressImageFile(file, maxDimension, quality, callback) {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = function(event) {
        const img = new Image();
        img.src = event.target.result;
        img.onload = function() {
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxDimension) {
                    height = Math.round((height * maxDimension) / width);
                    width = maxDimension;
                }
            } else {
                if (height > maxDimension) {
                    width = Math.round((width * maxDimension) / height);
                    height = maxDimension;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
                callback(blob || file);
            }, 'image/jpeg', quality);
        };
    };
}

async function uploadProductPhotoToStorage(blobOrFile, productId) {
    if (!supabaseClient || !blobOrFile) return null;
    try {
        const filePath = `units/${productId}_${Date.now()}.jpg`;
        const { error: uploadError } = await supabaseClient.storage
            .from('product-images')
            .upload(filePath, blobOrFile, {
                contentType: 'image/jpeg',
                upsert: true
            });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabaseClient.storage
            .from('product-images')
            .getPublicUrl(filePath);

        return publicUrlData ? publicUrlData.publicUrl : null;
    } catch (err) {
        console.warn('Gagal unggah foto ke Storage Supabase:', err);
        return null;
    }
}

/* ========================================================== */
/* FITUR DISPLAY TOKO / ETALASE DIGITAL                       */
/* ========================================================== */
window.openStoreShowcaseModal = function() {
    initShowcaseBrandDropdown();
    renderStoreShowcase();
    toggleModal('store-showcase-modal', true);
};

window.closeStoreShowcaseModal = function() {
    toggleModal('store-showcase-modal', false);
};

function initShowcaseBrandDropdown() {
    const select = document.getElementById('showcase-brand-select');
    if (!select) return;
    const currentVal = select.value || 'ALL';
    select.innerHTML = '<option value="ALL">Semua Merk</option>';

    const brands = Array.from(new Set(daftarStokMasuk.map(i => i.produk.split(' ')[0].toUpperCase()))).filter(Boolean);
    brands.sort().forEach(b => {
        const opt = document.createElement('option');
        opt.value = b;
        opt.textContent = b;
        if (b === currentVal) opt.selected = true;
        select.appendChild(opt);
    });

    buildCustomDropdown(select);
}

// FUNGSI MENDAPATKAN LIST STOK YANG SEDANG TERFILTER DI ETALASE
function getFilteredShowcaseItems() {
    const searchVal = (document.getElementById('showcase-search-input')?.value || '').toLowerCase().trim();
    const brandVal = document.getElementById('showcase-brand-select')?.value || 'ALL';

    return daftarStokMasuk.filter(item => {
        const brand = item.produk.split(' ')[0].toUpperCase();
        const matchesBrand = (brandVal === 'ALL' || brand === brandVal);
        const matchesSearch = item.produk.toLowerCase().includes(searchVal);
        return matchesBrand && matchesSearch;
    });
}

window.renderStoreShowcase = function() {
    const grid = document.getElementById('store-showcase-grid');
    const badge = document.getElementById('showcase-count-badge');
    if (!grid) return;

    const filtered = getFilteredShowcaseItems();

    if (badge) badge.textContent = `${filtered.length} Unit Tersedia`;

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: span 2; padding: 36px 12px;">
                <i class="fa-solid fa-box-open icon-placeholder" style="font-size: 32px;"></i>
                <h4 style="font-size: 13.5px; font-weight: 800; margin-top: 6px;">Unit Tidak Ditemukan</h4>
                <p style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">Tidak ada unit ready sesuai filter.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(item => {
        const brand = item.produk.split(' ')[0].toUpperCase();
        const modelName = item.produk.split(' ').slice(1).join(' ') || item.produk;
        
        let hargaDisplayNum = parseRawToNumeric(item.hargaDisplay);
        let hargaJualNum = parseRawToNumeric(item.hargaJual);
        
        let hargaTampil = 'Chat Admin';
        if (hargaDisplayNum) {
            hargaTampil = formatRupiahLengkap(hargaDisplayNum);
        } else if (hargaJualNum) {
            hargaTampil = formatRupiahLengkap(hargaJualNum);
        }

        const imgDisplay = item.imageUrl || 'logo-np.jpg';
        const negoBadgeHtml = (item.isNego && hargaTampil !== 'Chat Admin') 
            ? `<span class="badge-nego-tag">Bisa Nego</span>` 
            : ``;

        return `
            <div class="showcase-item-card" onclick="openShowcaseDetail('${item.id}')" title="Klik untuk lihat detail unit">
                <div class="showcase-card-img-wrap">
                    <img src="${imgDisplay}" alt="${item.produk}" loading="lazy" onerror="this.src='logo-np.jpg';">
                    <span class="showcase-condition-pill ${item.kondisi.toLowerCase()}">${item.kondisi}</span>
                </div>
                <div class="showcase-card-body">
                    <div class="showcase-card-meta">
                        <span class="showcase-card-brand-tag" style="${getBrandStyle(brand)}">${brand}</span>
                        <h4 class="showcase-card-title">${modelName}</h4>
                        <span class="showcase-card-completeness">${item.kelengkapan}</span>
                    </div>
                    <div class="showcase-card-footer">
                        <div class="showcase-price-group">
                            <span class="showcase-card-price">${hargaTampil}</span>
                            ${negoBadgeHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
};

/* ========================================================== */
/* POP-UP QUICK VIEW ETALASE — PREMIUM CLEAN                 */
/* ========================================================== */
window.openShowcaseDetail = function(id) {
    const item = daftarStokMasuk.find(s => s.id === id);
    if (!item) return;

    const brand = item.produk.split(' ')[0].toUpperCase();
    const modelName = item.produk.split(' ').slice(1).join(' ') || item.produk;

    const brandBadge = document.getElementById('modal-showcase-brand-badge');
    const photoImg = document.getElementById('modal-showcase-photo-img');
    const modelEl = document.getElementById('modal-showcase-model');
    const kondisiEl = document.getElementById('modal-showcase-kondisi');
    const kelengkapanEl = document.getElementById('modal-showcase-kelengkapan');
    const hargaEl = document.getElementById('modal-showcase-harga');
    const negoBadgeEl = document.getElementById('modal-showcase-nego-badge');
    const jualBtn = document.getElementById('modal-showcase-jual');

    if (brandBadge) {
        brandBadge.textContent = brand;
        brandBadge.style.cssText = getBrandStyle(brand);
    }

    if (photoImg) {
        photoImg.src = item.imageUrl || 'logo-np.jpg';
        photoImg.onerror = function() { this.src = 'logo-np.jpg'; };
    }

    if (modelEl) modelEl.textContent = modelName;
    if (kondisiEl) kondisiEl.textContent = item.kondisi || 'Tersedia';
    if (kelengkapanEl) kelengkapanEl.textContent = item.kelengkapan || 'Unit ready';

    const hargaDisplayNum = parseRawToNumeric(item.hargaDisplay);
    const hargaJualNum = parseRawToNumeric(item.hargaJual);
    let hargaTampil = 'Chat Admin';
    if (hargaDisplayNum) {
        hargaTampil = formatRupiahLengkap(hargaDisplayNum);
    } else if (hargaJualNum) {
        hargaTampil = formatRupiahLengkap(hargaJualNum);
    }
    if (hargaEl) hargaEl.textContent = hargaTampil;

    if (negoBadgeEl) {
        negoBadgeEl.style.display = item.isNego && hargaTampil !== 'Chat Admin' ? 'inline-flex' : 'none';
    }

    if (jualBtn) {
        jualBtn.onclick = () => {
            closeShowcaseDetailModal();
            jualStokItem(item.id);
        };
    }

    toggleModal('showcase-detail-modal', true);
};

window.closeShowcaseDetailModal = function() {
    toggleModal('showcase-detail-modal', false);
};

/* ========================================================== */
/* FITUR MANAJEMEN NOTES                                      */
/* ========================================================== */
window.openAddNoteModal = function() {
    toggleModal('add-note-modal', true);
    document.getElementById('add-note-modal')?.setAttribute('aria-hidden', 'false');
    const titleInput = document.getElementById('note-title-input');
    const contentInput = document.getElementById('note-content-input');
    requestAnimationFrame(() => {
        autoGrowNoteTextarea(contentInput);
        titleInput?.focus();
    });
};

window.closeAddNoteModal = function() {
    toggleModal('add-note-modal', false);
    document.getElementById('add-note-modal')?.setAttribute('aria-hidden', 'true');
};

function autoGrowNoteTextarea(el) {
    if (!el) return;
    el.style.height = 'auto';
    const min = 62;
    const max = Math.min(300, Math.max(140, Math.round(window.innerHeight * 0.36)));
    const next = Math.max(min, Math.min(el.scrollHeight, max));
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
}

window.openDaftarNotesModal = function() {
    renderDaftarNotes();
    toggleModal('daftar-notes-modal', true);
};

window.closeDaftarNotesModal = function() {
    toggleModal('daftar-notes-modal', false);
};

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

    titleInput.value = '';
    contentInput.value = '';
    autoGrowNoteTextarea(contentInput);
    closeAddNoteModal();

    if (supabaseClient) {
        setConnectionStatus('syncing');
        try {
            const { error } = await supabaseClient.from('notes').insert([newNote]);
            if (error) throw error;
            daftarNotes.unshift(newNote);
            renderDaftarNotes();
            setConnectionStatus('connected');
            showToast('Tersimpan', 'Catatan berhasil ditambahkan ke Cloud.');
        } catch (e) {
            console.warn('Gagal menyimpan catatan ke Supabase:', e);
            setConnectionStatus('disconnected');
            showToast('Gagal', 'Tidak dapat menyimpan catatan ke Cloud.', false);
        }
    }
};

window.salinCatatan = function(id) {
    const note = daftarNotes.find(n => n.id === id);
    if (!note) return;

    let textToCopy = '';
    if (note.title && note.title.trim() !== '' && note.title !== 'Catatan Baru') {
        textToCopy = `📌 *${note.title}*\n${note.content}`;
    } else {
        textToCopy = note.content;
    }

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(textToCopy).then(() => {
            showToast('Tersalin', 'Isi catatan berhasil disalin.');
        }).catch(() => fallbackSalinText(textToCopy));
    } else {
        fallbackSalinText(textToCopy);
    }
};

function fallbackSalinText(text) {
    let textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
        showToast('Tersalin', 'Isi catatan berhasil disalin.');
    } catch (err) {
        showToast('Gagal', 'Gagal menyalin catatan.', false);
    }
    document.body.removeChild(textArea);
}

window.hapusCatatan = function(id) {
    showCustomConfirm("Hapus Catatan", "Yakin ingin menghapus catatan ini?", async () => {
        if (supabaseClient) {
            setConnectionStatus('syncing');
            try {
                const { error } = await supabaseClient.from('notes').delete().eq('id', id);
                if (error) throw error;
                daftarNotes = daftarNotes.filter(n => n.id !== id);
                renderDaftarNotes();
                setConnectionStatus('connected');
                showToast('Berhasil', 'Catatan telah dihapus dari Cloud.');
            } catch (e) {
                console.warn('Gagal menghapus catatan di Supabase:', e);
                setConnectionStatus('disconnected');
                showToast('Gagal', 'Gagal menghapus catatan.', false);
            }
        }
    });
};

function renderDaftarNotes() {
    const container = document.getElementById('notes-container');
    const badge = document.getElementById('badge-notes-count');
    const modalBadge = document.getElementById('modal-badge-notes-count');
    if (!container) return;

    if (badge) badge.textContent = `${daftarNotes.length}`;
    if (modalBadge) modalBadge.textContent = `${daftarNotes.length} Catatan`;

    if (daftarNotes.length === 0) {
        container.innerHTML = `<div class="empty-stok-msg">Belum ada catatan tersimpan.</div>`;
        return;
    }

    container.innerHTML = daftarNotes.map(n => `
        <div class="note-item-card">
            <div class="stok-item-top">
                <span class="stok-item-title">${n.title}</span>
                <div style="display: flex; gap: 4px;">
                    <button onclick="salinCatatan('${n.id}')" class="action-btn" title="Salin Catatan"><i class="fa-solid fa-copy"></i></button>
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

let activeEditNoteId = null;

window.bukaEditCatatan = function(id) {
    const note = daftarNotes.find(n => n.id === id);
    if (!note) return;

    activeEditNoteId = id;
    const titleInput = document.getElementById('edit-note-title-input');
    const contentInput = document.getElementById('edit-note-content-input');
    if (titleInput) titleInput.value = note.title;
    if (contentInput) contentInput.value = note.content;
    toggleModal('edit-note-modal', true);
};

window.closeEditNoteModal = function() {
    toggleModal('edit-note-modal', false);
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
    if (note && supabaseClient) {
        setConnectionStatus('syncing');
        try {
            const { error } = await supabaseClient
                .from('notes')
                .update({ title: newTitle || 'Catatan Baru', content: newContent })
                .eq('id', activeEditNoteId);

            if (error) throw error;

            note.title = newTitle || 'Catatan Baru';
            note.content = newContent;
            renderDaftarNotes();
            closeEditNoteModal();
            setConnectionStatus('connected');
            showToast('Berhasil', 'Catatan berhasil diperbarui di Cloud.');
        } catch (e) {
            console.warn('Gagal update catatan di Supabase:', e);
            setConnectionStatus('disconnected');
            showToast('Gagal', 'Gagal memperbarui catatan.', false);
        }
    }
};

/* ========================================================== */
/* MODAL POP-UP STOK                                          */
/* ========================================================== */
window.openAddStokModal = function() {
    const tglInput = document.getElementById('stok-tanggal');
    if (tglInput && !tglInput.value) {
        let d = new Date();
        tglInput.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    removeStockPhotoSelection();
    toggleModal('add-stok-modal', true);
    document.getElementById('add-stok-modal')?.setAttribute('aria-hidden', 'false');
};

window.closeAddStokModal = function() {
    removeStockPhotoSelection();
    toggleModal('add-stok-modal', false);
    document.getElementById('add-stok-modal')?.setAttribute('aria-hidden', 'true');
};

window.openDaftarStokModal = function() {
    toggleModal('daftar-stok-modal', true);
};

window.closeDaftarStokModal = function() {
    toggleModal('daftar-stok-modal', false);
};

/* ========================================================== */
/* MODAL POP-UP KAS                                           */
/* ========================================================== */
window.openAddKasModal = function() {
    const tglInput = document.getElementById('kas-tanggal');
    if (tglInput && !tglInput.value) {
        let d = new Date();
        tglInput.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    toggleModal('add-kas-modal', true);
};

window.closeAddKasModal = function() {
    toggleModal('add-kas-modal', false);
};

window.openRiwayatKasModal = function() {
    renderManajemenKas();
    toggleModal('riwayat-kas-modal', true);
};

window.closeRiwayatKasModal = function() {
    toggleModal('riwayat-kas-modal', false);
};

/* ========================================================== */
/* MODAL POP-UP RIWAYAT PENJUALAN (R.JUAL)                    */
/* ========================================================== */
window.openInvoiceCenterModal = function() {
    renderInvoiceCenter();
    const search = document.getElementById('invoice-center-search');
    if (search) search.value = '';
    toggleModal('invoice-center-modal', true);
    setTimeout(() => search?.focus(), 180);
};

window.closeInvoiceCenterModal = function() {
    toggleModal('invoice-center-modal', false);
};

/* ========================================================== */
/* MODAL POP-UP SUB-TAB MODAL                                 */
/* ========================================================== */
window.openModalBelumKembaliModal = function() {
    renderDaftarModal();
    toggleModal('modal-belum-kembali-popup', true);
};

window.closeModalBelumKembaliModal = function() {
    toggleModal('modal-belum-kembali-popup', false);
};

window.openModalSudahKembaliModal = function() {
    renderDaftarModal();
    toggleModal('modal-sudah-kembali-popup', true);
};

window.closeModalSudahKembaliModal = function() {
    toggleModal('modal-sudah-kembali-popup', false);
};

/* ========================================================== */
/* FITUR PORTAL CEK IMEI SPESIFIK BRAND                       */
/* ========================================================== */
window.openBrandImeiPortal = function(brandKey) {
    closeDiagnosisModal();

    const key = (brandKey || '').trim().toUpperCase();
    const portal = BRAND_IMEI_LINKS[key] || { name: brandKey, url: 'https://imeicheck.com/' };

    if (key.includes('XIAOMI') || key.includes('POCO')) {
        window.open(portal.url, '_blank');
        return;
    }

    const inAppModal = document.getElementById('imei-web-modal');
    const inAppFrame = document.getElementById('imei-webview-frame');
    const inAppTitle = document.getElementById('inapp-webview-title');

    if (inAppModal && inAppFrame) {
        if (inAppTitle) inAppTitle.textContent = `Portal IMEI: ${portal.name}`;
        inAppFrame.src = portal.url;
        toggleModal('imei-web-modal', true);
    } else {
        window.open(portal.url, '_blank');
    }
};

window.closeImeiWebModal = function() {
    const inAppFrame = document.getElementById('imei-webview-frame');
    if (inAppFrame) inAppFrame.src = 'about:blank';
    toggleModal('imei-web-modal', false);
};

/* ========================================================== */
/* SCANNER KAMERA HP                                          */
/* ========================================================== */
window.startImeiScanner = function() {
    const scannerModal = document.getElementById('scanner-modal');
    if (!scannerModal) return;

    if (typeof Html5Qrcode === 'undefined') {
        let fallback = prompt("Kamera web belum siap. Ketik nomor IMEI:", "");
        if (fallback) document.getElementById('stok-imei').value = fallback.trim();
        return;
    }

    toggleModal('scanner-modal', true);

    try {
        if (!html5QrScannerInstance) {
            html5QrScannerInstance = new Html5Qrcode("scanner-reader");
        }

        const qrConfig = { fps: 15, qrbox: { width: 260, height: 160 }, aspectRatio: 1.0 };

        const onScanSuccess = (decodedText) => {
            document.getElementById('stok-imei').value = decodedText.trim();
            showToast('IMEI Terpindai', `Berhasil memindai: ${decodedText}`);
            stopImeiScanner();
        };

        Html5Qrcode.getCameras().then(devices => {
            let backCamera = devices.find(device => 
                device.label.toLowerCase().includes('back') || 
                device.label.toLowerCase().includes('rear') ||
                device.label.toLowerCase().includes('environment')
            );
            let cameraId = backCamera ? backCamera.id : (devices.length > 0 ? devices[devices.length - 1].id : null);

            html5QrScannerInstance.start(
                cameraId || { facingMode: "environment" },
                qrConfig,
                onScanSuccess,
                () => {}
            ).catch(() => stopImeiScanner());
        }).catch(() => stopImeiScanner());
    } catch (e) {
        showToast('Kamera', 'Terjadi kendala sistem kamera.', false);
        stopImeiScanner();
    }
};

window.stopImeiScanner = function() {
    toggleModal('scanner-modal', false);

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

window.handlePhotoScan = function(inputElement) {
    if (!inputElement.files || inputElement.files.length === 0) return;
    const imageFile = inputElement.files[0];
    showToast('Memproses', 'Menganalisis foto barcode...');

    if (!html5QrScannerInstance) {
        html5QrScannerInstance = new Html5Qrcode("scanner-reader");
    }

    html5QrScannerInstance.scanFile(imageFile, true)
        .then(decodedText => {
            document.getElementById('stok-imei').value = decodedText.trim();
            showToast('Berhasil', `IMEI Terbaca: ${decodedText}`);
            stopImeiScanner();
            if (inputElement) inputElement.value = '';
        })
        .catch(() => {
            showToast('Scan Gagal', 'Barcode tidak terdeteksi. Pastikan foto jelas!', false);
            if (inputElement) inputElement.value = '';
        });
};

/* ========================================================== */
/* POP-UP CHAT WHATSAPP LANGSUNG                              */
/* ========================================================== */
window.openDirectWaModal = function() {
    const inputPhone = document.getElementById('input-direct-wa-phone');
    const inputMsg = document.getElementById('input-direct-wa-msg');
    if (inputPhone) inputPhone.value = '';
    if (inputMsg) inputMsg.value = '';
    toggleModal('direct-wa-modal', true);
    setTimeout(() => inputPhone?.focus(), 180);
};

window.closeDirectWaModal = function() {
    toggleModal('direct-wa-modal', false);
};

window.submitDirectWa = function() {
    let phone = document.getElementById('input-direct-wa-phone')?.value.trim() || '';
    const msg = document.getElementById('input-direct-wa-msg')?.value.trim() || '';

    if (!phone) {
        showToast('Peringatan', 'Masukkan nomor WhatsApp terlebih dahulu!', false);
        document.getElementById('input-direct-wa-phone')?.focus();
        return;
    }

    phone = phone.replace(/[^0-9]/g, '');
    if (phone.startsWith('0')) phone = '62' + phone.substring(1);
    if (phone.startsWith('8')) phone = '62' + phone;

    if (phone.length < 10 || phone.length > 15 || !phone.startsWith('62')) {
        showToast('Peringatan', 'Format nomor WhatsApp belum valid.', false);
        document.getElementById('input-direct-wa-phone')?.focus();
        return;
    }

    let url = `https://api.whatsapp.com/send?phone=${phone}`;
    if (msg) url += `&text=${encodeURIComponent(msg)}`;

    window.open(url, '_blank');
    closeDirectWaModal();
};

/* ========================================================== */
/* SUB-TAB DIAGNOSIS / SYSTEM CHECK                           */
/* ========================================================== */
window.openDiagnosisBrand = function(brandName) {
    if (!brandName) return;
    openDiagnosisModal(brandName);
};

window.toggleDiagnosisCheckItem = function(codeStr, isChecked) {
    if (isChecked) checkedDiagnosisCodes.add(codeStr);
    else checkedDiagnosisCodes.delete(codeStr);
    const card = document.getElementById(`diag-card-${btoa(codeStr).replace(/=/g, '')}`);
    if (card) card.classList.toggle('checked-item', isChecked);
};

function openDiagnosisModal(query) {
    const upperQuery = query.toUpperCase();
    const modalTitle = document.getElementById('diagnosis-modal-title');
    const modalSub = document.getElementById('diagnosis-modal-subtitle');
    const modalBody = document.getElementById('diagnosis-modal-body');

    if (!modalBody) return;

    let matchedBrandObj = rawDiagnosisData.find(b => upperQuery.includes(b.brand.toUpperCase()));

    let targetCodes = [];
    let detectedBrandKey = 'SAMSUNG';

    if (matchedBrandObj && matchedBrandObj.codes) {
        detectedBrandKey = matchedBrandObj.brand.toUpperCase();
        modalTitle.innerHTML = `<i class="fa-solid fa-microchip" style="color: var(--azure-primary); margin-right: 6px;"></i> Diagnosis: ${matchedBrandObj.brand.toUpperCase()}`;
        modalSub.textContent = `Daftar kode cek resmi brand: ${matchedBrandObj.brand.toUpperCase()}`;
        targetCodes = matchedBrandObj.codes.map(c => ({ code: c.code, name: c.description }));
    } else {
        detectedBrandKey = upperQuery;
        modalTitle.innerHTML = `<i class="fa-solid fa-microchip" style="color: var(--azure-primary); margin-right: 6px;"></i> Diagnosis: ${query}`;
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

            </div>
        `;
    }).join('');

    let imeiInfo = BRAND_IMEI_LINKS[detectedBrandKey];
    if (!imeiInfo) {
        if (detectedBrandKey.includes('XIAOMI') || detectedBrandKey.includes('POCO')) imeiInfo = BRAND_IMEI_LINKS['XIAOMI'];
        else if (detectedBrandKey.includes('INFINIX')) imeiInfo = BRAND_IMEI_LINKS['INFINIX'];
        else if (detectedBrandKey.includes('TECNO')) imeiInfo = BRAND_IMEI_LINKS['TECNO'];
        else if (detectedBrandKey.includes('ITEL')) imeiInfo = BRAND_IMEI_LINKS['ITEL'];
        else imeiInfo = { name: query, url: 'https://imeicheck.com/' };
    }

    let imeiBottomHtml = `
        <div class="diag-imei-box">
            <button type="button" class="btn-diag-imei-action" onclick="openBrandImeiPortal('${detectedBrandKey}')" title="Buka Portal Cek Garansi Resmi">
                <span style="display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-shield-virus"></i>
                    <span>Cek IMEI & Garansi ${imeiInfo.name}</span>
                </span>
                <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 11px;"></i>
            </button>
        </div>
    `;

    modalBody.innerHTML = codesHtml + imeiBottomHtml;
    toggleModal('diagnosis-modal', true);
}

window.closeDiagnosisModal = function() {
    toggleModal('diagnosis-modal', false);
};

/* ========================================================== */
/* KALKULATOR CEPAT KAS                                       */
/* ========================================================== */
window.openKasCalculator = function() {
    calcCurrentVal = "0";
    calcEquation = "";
    updateCalcDisplay();
    toggleModal('calc-modal', true);
};

window.closeKasCalculator = function() {
    toggleModal('calc-modal', false);
};

function updateCalcDisplay() {
    const curElem = document.getElementById('calc-current');
    const histElem = document.getElementById('calc-history');
    if (curElem) curElem.textContent = calcCurrentVal;
    if (histElem) histElem.textContent = calcEquation;
}

window.calcAppendNumber = function(num) {
    if (calcCurrentVal === "0" && num !== ".") calcCurrentVal = num;
    else calcCurrentVal += num;
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
    if (calcCurrentVal.length > 1) calcCurrentVal = calcCurrentVal.slice(0, -1);
    else calcCurrentVal = "0";
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
/* CUSTOM GLASS DROPDOWN                                      */
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
        '#showcase-brand-select'
    ];
    targets.forEach(sel => {
        const el = document.querySelector(sel);
        if (el) buildCustomDropdown(el);
    });
}

/* ========================================================== */
/* STATISTIK DASHBOARD & KAS                                  */
/* ========================================================== */
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

    // Statistik finansial tetap dihitung untuk kebutuhan internal/fitur laporan,
    // tetapi dashboard utama sekarang menonjolkan metrik inventori.
    const keuntunganQtyElem = document.getElementById('keuntungan-qty');
    const keuntunganNominalElem = document.getElementById('keuntungan-nominal');
    if (keuntunganQtyElem) keuntunganQtyElem.textContent = `${sumTerjual} Unit`;
    if (keuntunganNominalElem) keuntunganNominalElem.textContent = formatRupiahRingkas(totalProfit);

    const totalUnitElem = document.getElementById('total-unit-val');
    const stokReadyValElem = document.getElementById('stok-ready-val');
    const terjualValElem = document.getElementById('terjual-val');
    const terjualOmsetValElem = document.getElementById('terjual-omset-val');
    const transaksiCountElem = document.getElementById('transaksi-count-val');
    if (totalUnitElem) totalUnitElem.textContent = `${sumStok + sumTerjual} Unit`;
    if (stokReadyValElem) stokReadyValElem.textContent = `${sumStok} Unit`;
    if (terjualValElem) terjualValElem.textContent = `${sumTerjual} Unit`;
    if (terjualOmsetValElem) terjualOmsetValElem.textContent = formatRupiahRingkas(totalOmset);
    if (transaksiCountElem) transaksiCountElem.textContent = `${daftarStokMasuk.length + daftarTerjual.length}`;

    const modalBadgeStokCount = document.getElementById('modal-badge-stok-count');
    if (modalBadgeStokCount) modalBadgeStokCount.textContent = `${daftarStokMasuk.length} Unit`;

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
        if (saldoValElem) saldoValElem.textContent = formatRupiahRingkas(saldoAktif);
        if (pengeluaranValElem) pengeluaranValElem.textContent = formatRupiahRingkas(totalKeluar);
    }
}

function formatTanggalID(dateString) {
    if (!dateString) return '';
    const parts = dateString.split('-');
    if (parts.length !== 3) return dateString;
    return `${parts[2]} - ${parts[1]} - ${parts[0]}`;
}

function showToast(title, desc, isSuccess = true) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toastId = 'toast-' + Date.now();
    const borderColor = isSuccess ? 'var(--status-safe)' : 'var(--status-unsafe)';
    const iconClass = isSuccess ? 'fa-circle-check' : 'fa-triangle-exclamation';

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
    const b = (brandName || '').trim().toUpperCase();
    let color = 'var(--azure-primary)', bg = 'var(--card-bg)', border = 'var(--border-subtle)';
    if (b.includes('INFINIX')) { color = '#059669'; bg = 'rgba(5, 150, 105, 0.1)'; border = 'rgba(5, 150, 105, 0.25)'; } 
    else if (b.includes('SAMSUNG')) { color = '#38BDF8'; bg = 'rgba(56, 189, 248, 0.1)'; border = 'rgba(56, 189, 248, 0.25)'; }
    else if (b.includes('OPPO')) { color = '#10B981'; bg = 'rgba(16, 185, 129, 0.1)'; border = 'rgba(16, 185, 129, 0.25)'; }
    else if (b.includes('XIAOMI') || b.includes('REDMI')) { color = '#F43F5E'; bg = 'rgba(244, 63, 94, 0.1)'; border = 'rgba(244, 63, 94, 0.25)'; }
    else if (b.includes('POCO')) { color = '#F59E0B'; bg = 'rgba(245, 158, 11, 0.1)'; border = 'rgba(245, 158, 11, 0.25)'; }
    else if (b.includes('VIVO')) { color = '#A855F7'; bg = 'rgba(168, 85, 247, 0.1)'; border = 'rgba(168, 85, 247, 0.25)'; }
    else if (b.includes('REALME')) { color = '#F59E0B'; bg = 'rgba(245, 158, 11, 0.1)'; border = 'rgba(245, 158, 11, 0.25)'; }
    else if (b.includes('TECNO')) { color = '#0284C7'; bg = 'rgba(2, 132, 199, 0.1)'; border = 'rgba(2, 132, 199, 0.25)'; }
    else if (b.includes('ITEL')) { color = '#E11D48'; bg = 'rgba(225, 29, 72, 0.1)'; border = 'rgba(225, 29, 72, 0.25)'; }
    return `color: ${color}; background-color: ${bg}; border-color:${border};`;
}

/* ========================================================== */
/* PRICE LIST & KATALOG                                       */
/* ========================================================== */
window.openAddPriceListModal = function() {
    toggleModal('add-pricelist-modal', true);
};

window.closeAddPriceListModal = function() {
    toggleModal('add-pricelist-modal', false);
};

window.addNewProduct = async function() {
    const nameInput = document.getElementById('add-input-name').value.trim();
    const jktInput = document.getElementById('add-input-jkt').value.trim();
    const sgcInput = document.getElementById('add-input-sgc').value.trim();
    const bnibInput = document.getElementById('add-input-bnib') ? document.getElementById('add-input-bnib').value.trim() : '';
    
    if (nameInput === '') {
        showToast('Peringatan', 'Nama produk tidak boleh kosong!', false);
        return;
    }

    const parts = nameInput.split(' ');
    const detectedBrand = parts[0].toUpperCase();
    const detectedModel = parts.length > 1 ? parts.slice(1).join(' ') : nameInput;

    const newPriceItem = {
        id: 'pl-' + Date.now(),
        brand: detectedBrand,
        model: detectedModel,
        jkt: jktInput || '--',
        sgc: sgcInput || '--',
        bnib: bnibInput || '--'
    };

    if (supabaseClient) {
        setConnectionStatus('syncing');
        try {
            const { error } = await supabaseClient.from('pricelist').insert([newPriceItem]);
            if (error) throw error;

            rawPriceListData.push(newPriceItem);
            sortPriceListConsistently(rawPriceListData);

            initBrandDropdown(); 
            filterPriceList(); 

            document.getElementById('add-input-name').value = ''; 
            document.getElementById('add-input-jkt').value = ''; 
            document.getElementById('add-input-sgc').value = ''; 
            if (document.getElementById('add-input-bnib')) document.getElementById('add-input-bnib').value = '';
            
            closeAddPriceListModal();
            setConnectionStatus('connected');
            showToast('Berhasil!', `Produk baru tersimpan di cloud merek: ${detectedBrand}.`);
        } catch (e) {
            console.warn('Gagal menambah produk ke Supabase:', e);
            setConnectionStatus('disconnected');
            showToast('Gagal', 'Gagal menyimpan ke server Cloud.', false);
        }
    }
};

window.editProduct = function(id) {
    const item = rawPriceListData.find(p => p.id === id);
    if (item) {
        currentEditId = id;

        const detailModal = document.getElementById('pricelist-detail-modal');
        if (detailModal && detailModal.classList.contains('show')) {
            editOpenedFromDetail = true;
            closePriceListModal();
        } else {
            editOpenedFromDetail = false;
        }

        const subTitle = document.getElementById('edit-modal-subtitle');
        if (subTitle) subTitle.textContent = `${item.brand} - ${item.model}`;

        const fullNameInput = document.getElementById('edit-input-fullname');
        if (fullNameInput) {
            fullNameInput.value = `${item.brand} ${item.model}`.trim();
        }

        document.getElementById('edit-input-jkt').value = item.jkt || '';
        document.getElementById('edit-input-sgc').value = item.sgc || '';
        if (document.getElementById('edit-input-bnib')) {
            document.getElementById('edit-input-bnib').value = item.bnib || '--';
        }
        toggleModal('edit-custom-modal', true);
    }
};

window.closeEditModal = function() { 
    const previousEditId = currentEditId;
    toggleModal('edit-custom-modal', false);
    currentEditId = null; 

    if (editOpenedFromDetail && previousEditId) {
        openSingleProductPriceModal(previousEditId);
    }
    editOpenedFromDetail = false;
};

window.saveEditModal = async function() {
    if (!currentEditId) return;
    
    const itemIndex = rawPriceListData.findIndex(p => p.id === currentEditId);
    if (itemIndex === -1) return;
    const item = rawPriceListData[itemIndex];

    let updatedBrand = item.brand;
    let updatedModel = item.model;

    const fullNameInput = document.getElementById('edit-input-fullname');
    if (fullNameInput && fullNameInput.value.trim() !== '') {
        const fullVal = fullNameInput.value.trim();
        const parts = fullVal.split(' ');
        
        if (parts.length > 1 && parts[0].toUpperCase() === item.brand) {
            updatedBrand = item.brand;
            updatedModel = parts.slice(1).join(' ').trim();
        } else {
            updatedBrand = item.brand;
            updatedModel = fullVal;
        }
    }

    const updatedJkt = document.getElementById('edit-input-jkt').value.trim() || '--';
    const updatedSgc = document.getElementById('edit-input-sgc').value.trim() || '--';
    const updatedBnib = document.getElementById('edit-input-bnib') ? (document.getElementById('edit-input-bnib').value.trim() || '--') : '--';

    if (supabaseClient) {
        setConnectionStatus('syncing');
        try {
            const { error } = await supabaseClient
                .from('pricelist')
                .update({
                    brand: updatedBrand,
                    model: updatedModel,
                    jkt: updatedJkt,
                    sgc: updatedSgc,
                    bnib: updatedBnib
                })
                .eq('id', currentEditId);

            if (error) throw error;

            rawPriceListData[itemIndex].brand = updatedBrand;
            rawPriceListData[itemIndex].model = updatedModel;
            rawPriceListData[itemIndex].jkt = updatedJkt;
            rawPriceListData[itemIndex].sgc = updatedSgc;
            rawPriceListData[itemIndex].bnib = updatedBnib;

            sortPriceListConsistently(rawPriceListData);

            const savedItemId = item.id;
            const wasFromDetail = editOpenedFromDetail;

            toggleModal('edit-custom-modal', false);
            currentEditId = null; 
            editOpenedFromDetail = false;

            initBrandDropdown();
            filterPriceList(); 
            setConnectionStatus('connected');
            showToast('Berhasil!', 'Perubahan produk & harga tersimpan di Cloud.');
            
            if (wasFromDetail) {
                openSingleProductPriceModal(savedItemId);
            }
        } catch (e) {
            console.warn('Gagal mengedit produk di Supabase:', e);
            setConnectionStatus('disconnected');
            showToast('Gagal', 'Tidak dapat memperbarui data di Cloud.', false);
        }
    }
};

window.deleteProduct = function(id) {
    showCustomConfirm("Hapus Model", "Yakin ingin menghapus model ini secara permanen dari server?", async () => {
        if (supabaseClient) {
            setConnectionStatus('syncing');
            try {
                const { error } = await supabaseClient.from('pricelist').delete().eq('id', id);
                if (error) throw error;

                rawPriceListData = rawPriceListData.filter(p => p.id !== id);

                initBrandDropdown(); 
                filterPriceList(); 
                closePriceListModal();
                setConnectionStatus('connected');
                showToast('Berhasil', 'Produk dihapus dari Cloud.');
            } catch (e) {
                console.warn('Gagal menghapus produk di Supabase:', e);
                setConnectionStatus('disconnected');
                showToast('Gagal', 'Gagal menghapus produk.', false);
            }
        }
    });
};

function sortBrandsWithCustomOrder(brandList) {
    const brandMap = new Map();
    brandList.forEach(b => brandMap.set(b.trim().toUpperCase(), b.trim()));

    const result = [];
    ORDERED_BRANDS.forEach(target => {
        if (brandMap.has(target)) {
            result.push(brandMap.get(target));
            brandMap.delete(target);
        }
    });

    const remaining = Array.from(brandMap.values()).sort((a, b) => a.localeCompare(b));
    return [...result, ...remaining];
}

function initBrandDropdown() {
    const brandSelect = document.getElementById('filter-brand-select');
    if (!brandSelect) return;
    
    const currentVal = brandSelect.value || 'ALL';
    brandSelect.innerHTML = '<option value="ALL">All Merek</option>';
    
    const uniqueBrands = Array.from(new Set(rawPriceListData.map(item => item.brand.trim()))).filter(Boolean);
    const sortedBrands = sortBrandsWithCustomOrder(uniqueBrands);

    sortedBrands.forEach(brand => {
        const opt = document.createElement('option');
        opt.value = brand;
        opt.textContent = brand;
        if (brand === currentVal) opt.selected = true;
        brandSelect.appendChild(opt);
    });

    buildCustomDropdown(brandSelect);
}

function filterPriceList() {
    const searchVal = document.getElementById('filter-model-input') ? document.getElementById('filter-model-input').value.toLowerCase().trim() : '';
    const brandVal = document.getElementById('filter-brand-select') ? document.getElementById('filter-brand-select').value : 'ALL';
    
    if (!searchVal && brandVal === 'ALL') {
        currentFilteredData = [];
    } else {
        currentFilteredData = rawPriceListData.filter(item => {
            const itemBrand = (item.brand || '').trim().toUpperCase();
            const filterBrand = brandVal.trim().toUpperCase();
            
            const cleanModel = getModelNameWithoutSpecs(item.model);
            const cleanBrand = (item.brand || '').toLowerCase().trim();

            return (brandVal === 'ALL' || itemBrand === filterBrand) && 
                   (cleanModel.includes(searchVal) || cleanBrand.includes(searchVal));
        });
    }
    
    const totalPages = Math.ceil(currentFilteredData.length / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;

    renderPage();
}

function renderPage() {
    const container = document.getElementById('pricelist-container');
    const badgeCount = document.getElementById('pricelist-count-badge');
    if (!container) return;

    const searchInput = document.getElementById('filter-model-input');
    const searchVal = searchInput ? searchInput.value.trim() : '';
    const brandSelect = document.getElementById('filter-brand-select');
    const brandVal = brandSelect ? brandSelect.value : 'ALL';

    if (!searchVal && brandVal === 'ALL') {
        if (badgeCount) badgeCount.textContent = `Pencarian Standby`;
        container.innerHTML = `
            <div class="empty-state" style="padding: 40px 16px;">
                <i class="fa-solid fa-magnifying-glass-arrow-right icon-placeholder" style="font-size: 32px; opacity: 0.6;"></i>
                <h3 style="font-size: 14px; font-weight: 800; margin-top: 6px;">Cari Model Handphone</h3>
                <p style="font-size: 11.5px; color: var(--text-secondary); margin-top: 4px; line-height: 1.4;">
                    Ketik model di atas lalu tekan <b>Enter</b>, atau pilih merk untuk melihat daftar harga.
                </p>
            </div>
        `;
        return;
    }

    const totalItems = currentFilteredData.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (badgeCount) badgeCount.textContent = `Menampilkan ${totalItems} Item`;

    if (totalItems === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-file-circle-xmark icon-placeholder"></i><h2>Tidak Ditemukan</h2><p style="font-size: 11.5px; color: var(--text-secondary);">Tidak ada model yang cocok.</p></div>`;
        return;
    }

    let htmlContent = '';
    currentFilteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).forEach(item => {
        htmlContent += `
            <div class="stok-item-card" onclick="openSingleProductPriceModal('${item.id}')" style="cursor: pointer; padding: 10px 14px;">
                <div class="stok-item-top" style="align-items: center;">
                    <div style="display: flex; align-items: center; gap: 8px; flex: 1; overflow: hidden;">
                        <span class="price-card-brand" style="${getBrandStyle(item.brand)}">${item.brand}</span>
                        <span class="stok-item-title" style="font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.model}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 10px; color: var(--azure-primary); font-weight: 700;">Cek Harga <i class="fa-solid fa-chevron-right" style="font-size: 8.5px;"></i></span>
                    </div>
                </div>
            </div>
        `;
    });
    
    htmlContent += `<div class="pagination-controls"><button class="page-btn" onclick="changePage(-1)" ${currentPage === 1 ? 'disabled' : ''}>Prev</button><span class="page-info">Hal ${currentPage}/${totalPages}</span><button class="page-btn" onclick="changePage(1)" ${currentPage === totalPages ? 'disabled' : ''}>Next</button></div>`;
    container.innerHTML = htmlContent;
}

function changePage(direction) { currentPage += direction; renderPage(); }

function generatePriceCardHTML(item) {
    let diffHtml = '';
    let jktMax = getHighestNumericPrice(item.jkt), sgcMax = getHighestNumericPrice(item.sgc);
    if (jktMax !== null && sgcMax !== null) {
        let diff = jktMax - sgcMax;
        let cls = diff > 0 ? 'selisih-green' : (diff < 0 ? 'selisih-red' : 'selisih-neutral');
        let txt = diff > 0 ? `+ ${formatRupiahRingkas(diff)}` : (diff < 0 ? `- ${formatRupiahRingkas(Math.abs(diff))}` : 'Rp 0');
        diffHtml = `<div class="price-card-footer" style="padding-top: 6px;"><span class="selisih-badge ${cls}">Selisih: ${txt}</span></div>`;
    }

    let bnibBadgeHtml = '';
    if (item.bnib && item.bnib.trim() !== '--' && item.bnib.trim() !== '') {
        bnibBadgeHtml = `
            <div class="price-card-top-badge" style="margin-top: 2px; margin-bottom: 6px;">
                <span class="badge-bnib-tag" title="Harga BNIB">
                    <i class="fa-solid fa-box" style="font-size: 8.5px;"></i> ${formatDisplayPrice(item.bnib)}
                </span>
            </div>
        `;
    }

    return `
        <div class="price-card" style="margin: 0; background: var(--bg-page);">
            <div class="price-card-header">
                <div>
                    <span class="price-card-brand" style="${getBrandStyle(item.brand)}">${item.brand}</span>
                    <div class="price-card-model" style="font-size: 13.5px; margin-top: 3px;">${item.model}</div>
                </div>
                <div class="price-card-actions">
                    <button class="action-btn edit-btn" onclick="editProduct('${item.id}')" title="Edit Produk & Harga"><i class="fa-solid fa-pen"></i></button>
                    <button class="action-btn delete-btn" onclick="deleteProduct('${item.id}')" title="Hapus"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
            ${bnibBadgeHtml}
            <div class="price-compare-stack" style="margin-top: 4px;">
                <div class="price-box"><span class="price-box-label">Jakarta</span><span class="price-box-val">${formatDisplayPrice(item.jkt)}</span></div>
                <div class="price-box"><span class="price-box-label">Cikarang</span><span class="price-box-val">${formatDisplayPrice(item.sgc)}</span></div>
            </div>
            ${diffHtml}
        </div>
    `;
}

window.openSingleProductPriceModal = function(id) {
    const item = rawPriceListData.find(p => p.id === id);
    if (!item) return;

    const container = document.getElementById('pricelist-modal-results-container');
    const countBadge = document.getElementById('modal-pricelist-count');
    const subtitle = document.getElementById('modal-pricelist-subtitle');

    if (!container) return;

    if (countBadge) countBadge.textContent = "1 Model";
    if (subtitle) subtitle.textContent = `${item.brand} - ${item.model}`;

    container.innerHTML = generatePriceCardHTML(item);
    toggleModal('pricelist-detail-modal', true);
};

window.triggerPriceListModalSearch = function() {
    const searchInput = document.getElementById('filter-model-input');
    const searchVal = searchInput ? searchInput.value.trim().toLowerCase() : '';

    if (!searchVal) {
        showToast('Peringatan', 'Ketik nama model smartphone terlebih dahulu!', false);
        return;
    }

    const container = document.getElementById('pricelist-modal-results-container');
    const countBadge = document.getElementById('modal-pricelist-count');
    const subtitle = document.getElementById('modal-pricelist-subtitle');

    if (!container) return;

    const matched = rawPriceListData.filter(item => {
        const cleanModel = getModelNameWithoutSpecs(item.model);
        const cleanBrand = (item.brand || '').toLowerCase().trim();
        return cleanModel.includes(searchVal) || cleanBrand.includes(searchVal);
    });

    if (countBadge) countBadge.textContent = `${matched.length} Item`;
    if (subtitle) subtitle.textContent = `Hasil pencarian untuk "${searchInput.value.trim()}"`;

    if (matched.length === 0) {
        container.innerHTML = `<div class="empty-stok-msg">Tidak ada model yang cocok dengan "${searchInput.value.trim()}"</div>`;
    } else {
        container.innerHTML = matched.map(item => generatePriceCardHTML(item)).join('');
    }

    toggleModal('pricelist-detail-modal', true);
};

window.closePriceListModal = function() {
    toggleModal('pricelist-detail-modal', false);
};

/* ========================================================== */
/* NAVIGASI & AUTHENTIKASI SUPABASE                           */
/* ========================================================== */
function restartApp(btn) { btn?.classList.add('spinning'); setTimeout(() => window.location.reload(), 450); }
function updateThemeMenu() {
    const isDark = document.body.classList.contains('dark-mode');
    const icon = document.getElementById('theme-menu-icon');
    const label = document.getElementById('theme-menu-label');
    if (icon) {
        icon.classList.remove('fa-moon', 'fa-sun');
        icon.classList.add(isDark ? 'fa-sun' : 'fa-moon');
    }
    if (label) label.textContent = isDark ? 'Mode Terang' : 'Mode Gelap';
}
function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-mode');
    document.getElementById('theme-icon')?.classList.replace(isDark ? 'fa-moon' : 'fa-sun', isDark ? 'fa-sun' : 'fa-moon');
    localStorage.setItem('npgalery_theme', isDark ? 'dark' : 'light');
    updateThemeMenu();
}

window.toggleHeaderMore = function(event) {
    event?.stopPropagation();
    const menu = document.getElementById('header-more-menu');
    const trigger = document.getElementById('btn-header-more');
    if (!menu) return;
    const open = menu.classList.toggle('is-open');
    menu.setAttribute('aria-hidden', open ? 'false' : 'true');
    trigger?.setAttribute('aria-expanded', open ? 'true' : 'false');
};
window.closeHeaderMore = function() {
    const menu = document.getElementById('header-more-menu');
    const trigger = document.getElementById('btn-header-more');
    menu?.classList.remove('is-open');
    menu?.setAttribute('aria-hidden', 'true');
    trigger?.setAttribute('aria-expanded', 'false');
};

// WELCOME SUMMARY INTERACTION — id="vz73zb"
window.toggleWelcomeSummary = function() {
    const hero = document.getElementById('np-welcome-toggle');
    const panel = document.getElementById('np-summary-panel');
    if (!hero || !panel) return;
    const open = !panel.classList.contains('is-open');
    hero.classList.toggle('is-open', open);
    panel.classList.toggle('is-open', open);
    hero.setAttribute('aria-expanded', open ? 'true' : 'false');
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
};
window.handleWelcomeKey = function(event) {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        window.toggleWelcomeSummary();
    }
};

document.addEventListener('click', (event) => {
    const wrap = document.querySelector('.header-more-wrap');
    if (wrap && !wrap.contains(event.target)) window.closeHeaderMore();
});

function handleLogout() {
    showCustomConfirm("Keluar", "Yakin ingin keluar?", async () => { 
        if (supabaseClient) {
            try { await supabaseClient.auth.signOut(); } catch (err) {}
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
        const { error } = await supabaseClient.auth.signInWithPassword({
            email: userVal,
            password: passVal
        });

        if (error) throw error;

        localStorage.setItem('npgalery_logged_in', 'true');
        document.getElementById('auth-modal')?.classList.add('hidden');
        if (document.getElementById('auth-username')) document.getElementById('auth-username').value = '';
        if (document.getElementById('auth-password')) document.getElementById('auth-password').value = '';
        
        showToast('Login Berhasil', 'Selamat datang, Admin NPGalery!');
        goHomeScreen();
        await syncFromSupabase();
    } catch (err) {
        showToast('Akses Ditolak', 'Email atau Password salah!', false);
    }
}

// FUNGSI KEMBALI KE HOME SCREEN POLOS BERLOGO SEMI-TRANSPARAN
window.goHomeScreen = function() {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const homeSection = document.getElementById('section-home');
    if (homeSection) homeSection.classList.add('active');
    const homeNav = document.querySelector('.nav-item[data-section="section-home"]');
    if (homeNav) homeNav.classList.add('active');
    if (typeof updateDashboardStats === 'function') updateDashboardStats();
};

// HANDLER NAVIGASI KLIK / DOUBLE-TAP / TOGGLE
window.handleNavClick = function(tabId, el) {
    const targetSection = document.getElementById(tabId);
    if (!targetSection) return;

    // Jika tab yang diklik saat ini sudah aktif, maka kembalikan ke Home Screen
    if (targetSection.classList.contains('active') && el.classList.contains('active')) {
        goHomeScreen();
        return;
    }

    switchTab(tabId, el);
};

function switchTab(tabId, el) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(tabId)?.classList.add('active'); 
    el?.classList.add('active');
}

function switchSubTab(subId, el) {
    const p = el.closest('.tab-content');
    p?.querySelectorAll('.sub-content').forEach(s => s.classList.remove('active'));
    p?.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(subId)?.classList.add('active'); 
    el?.classList.add('active');

    if (subId === 'sub-modal' && navigator.onLine && supabaseClient) {
        syncTransactionsFromSupabaseOnly();
    }
}

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
        const fullStr = `${item.brand}${item.model}`.toLowerCase();
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

// SIMPAN STOK DENGAN DUKUNGAN UNGGAH FOTO FISIK UNIT & HARGA DISPLAY
window.simpanStokBaru = async function() {
    let produk = document.getElementById('stok-produk-input').value.trim();
    let imei = document.getElementById('stok-imei').value.trim();
    let tanggal = document.getElementById('stok-tanggal').value;
    if (!produk || !imei || !tanggal) { showToast('Gagal', 'Lengkapi form stok!', false); return; }

    const saveBtn = document.getElementById('btn-save-stok');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...`;
    }

    const newId = 'stok-' + Date.now();
    let uploadedImageUrl = null;

    if (selectedStockPhotoFile) {
        setConnectionStatus('syncing');
        uploadedImageUrl = await uploadProductPhotoToStorage(selectedStockPhotoFile, newId);
    }

    const displayPriceInputVal = document.getElementById('stok-display-harga')?.value.trim() || '';

    const newStockItem = {
        id: newId,
        name: produk,
        condition: document.getElementById('stok-kondisi').value,
        completeness: document.getElementById('stok-kelengkapan').value,
        imei: imei,
        qty: parseInt(document.getElementById('stok-qty').value) || 1,
        buy_price: parseRawToNumeric(document.getElementById('stok-harga').value) || 0,
        sell_price: 0,
        display_price: parseRawToNumeric(displayPriceInputVal) || 0,
        status: 'ready',
        buyer: '',
        date: tanggal,
        image_url: uploadedImageUrl
    };

    if (supabaseClient) {
        setConnectionStatus('syncing');
        try {
            const { error } = await supabaseClient.from('product').insert([newStockItem]);
            if (error) throw error;

            daftarStokMasuk.unshift({
                id: newStockItem.id,
                produk: newStockItem.name,
                kondisi: newStockItem.condition,
                kelengkapan: newStockItem.completeness,
                imei: newStockItem.imei,
                qty: String(newStockItem.qty),
                hargaModal: String(newStockItem.buy_price),
                hargaJual: '',
                hargaDisplay: String(newStockItem.display_price),
                pembeli: '',
                tanggal: newStockItem.date,
                imageUrl: uploadedImageUrl
            });

            updateDashboardStats();
            initShowcaseBrandDropdown();

            document.getElementById('stok-produk-input').value = '';
            document.getElementById('stok-imei').value = '';
            document.getElementById('stok-harga').value = '';
            if (document.getElementById('stok-display-harga')) document.getElementById('stok-display-harga').value = '';
            removeStockPhotoSelection();
            closeAddStokModal();

            setConnectionStatus('connected');
            showToast('Tersimpan', 'Stok, display price, & foto unit tersimpan di Cloud.');
        } catch (e) {
            console.warn('Gagal simpan stok ke Supabase:', e);
            setConnectionStatus('disconnected');
            showToast('Gagal', 'Gagal menyimpan stok ke server.', false);
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Save`;
            }
        }
    }
};

function showCustomConfirm(title, desc, cb) {
    const titleEl = document.getElementById('custom-confirm-title');
    const descEl = document.getElementById('custom-confirm-desc');
    const btnYes = document.getElementById('custom-confirm-yes');
    const btnNo = document.getElementById('custom-confirm-no');

    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = desc;

    toggleModal('custom-confirm-modal', true);

    if (btnYes) {
        btnYes.onclick = () => {
            toggleModal('custom-confirm-modal', false);
            if (typeof cb === 'function') cb();
        };
    }
    if (btnNo) {
        btnNo.onclick = () => toggleModal('custom-confirm-modal', false);
    }
}

let activeDetailStokId = null;

window.openStokDetail = function(id) {
    const item = daftarStokMasuk.find(s => s.id === id);
    if (!item) return;
    activeDetailStokId = id;
    const brand = item.produk.split(' ')[0].toUpperCase();

    const photoWrap = document.getElementById('modal-detail-photo-container');
    const photoImg = document.getElementById('modal-detail-photo-img');
    if (item.imageUrl) {
        if (photoImg) photoImg.src = item.imageUrl;
        if (photoWrap) photoWrap.style.display = 'flex';
    } else {
        if (photoWrap) photoWrap.style.display = 'none';
    }

    document.getElementById('modal-detail-brand').textContent = brand;
    document.getElementById('modal-detail-brand').style.cssText = getBrandStyle(brand);
    document.getElementById('modal-detail-title').textContent = item.produk.split(' ').slice(1).join(' ');
    document.getElementById('modal-detail-imei').textContent = `IMEI: ${item.imei}`;
    document.getElementById('modal-detail-kondisi').textContent = item.kondisi;
    document.getElementById('modal-detail-kelengkapan').textContent = item.kelengkapan;
    document.getElementById('modal-detail-tanggal').textContent = formatTanggalID(item.tanggal);
    document.getElementById('modal-detail-qty').textContent = `${item.qty} unit`;

    let numericModal = parseRawToNumeric(item.hargaModal);
    document.getElementById('modal-detail-harga').textContent = numericModal !== null ? formatRupiahRingkas(numericModal) : '-';

    document.getElementById('modal-input-customer').value = item.pembeli || '';
    document.getElementById('modal-input-harga-jual').value = item.hargaJual || '';

    const displayInput = document.getElementById('modal-input-harga-display');
    const negoCheck = document.getElementById('modal-check-is-nego');
    if (displayInput) {
        let numDisp = parseRawToNumeric(item.hargaDisplay);
        displayInput.value = numDisp ? numDisp.toLocaleString('id-ID') : (item.hargaDisplay || '');
    }
    if (negoCheck) {
        negoCheck.checked = (item.isNego !== undefined) ? item.isNego : true;
    }

    document.getElementById('modal-btn-jual').onclick = () => { closeStokDetailModal(); jualStokItem(item.id); };
    document.getElementById('modal-btn-hapus').onclick = () => { closeStokDetailModal(); hapusStokItem(item.id); };
    toggleModal('stok-detail-modal', true);
};

window.updateHargaDisplayLive = function(val) {
    const item = daftarStokMasuk.find(s => s.id === activeDetailStokId);
    if (item) {
        item.hargaDisplay = val;
        if (supabaseClient) {
            supabaseClient.from('product').update({ display_price: parseRawToNumeric(val) || 0 }).eq('id', item.id).then();
        }
    }
};

window.updateIsNegoLive = function(isChecked) {
    const item = daftarStokMasuk.find(s => s.id === activeDetailStokId);
    if (item) {
        item.isNego = isChecked;
        if (supabaseClient) {
            supabaseClient.from('product').update({ is_nego: isChecked }).eq('id', item.id).then();
        }
    }
};

window.updateHargaJualLive = function(val) {
    const item = daftarStokMasuk.find(s => s.id === activeDetailStokId);
    if (item) {
        item.hargaJual = val;
        if (supabaseClient) {
            supabaseClient.from('product').update({ sell_price: parseRawToNumeric(val) || 0 }).eq('id', item.id).then();
        }
    }
};

window.updatePembeliLive = function(val) {
    const item = daftarStokMasuk.find(s => s.id === activeDetailStokId);
    if (item) {
        item.pembeli = val;
        if (supabaseClient) {
            supabaseClient.from('product').update({ buyer: val }).eq('id', item.id).then();
        }
    }
};

window.closeStokDetailModal = function() { 
    toggleModal('stok-detail-modal', false); 
    activeDetailStokId = null; 
};

// PROSES JUAL UNIT KE SUPABASE TRANSACTIONS
window.jualStokItem = function(id) {
    const item = daftarStokMasuk.find(s => s.id === id);
    if (!item) return;
    openSaleNowModal(item);
};

let npSaleNowItemId = null;
let npSaleNowPayment = '';

function openSaleNowModal(item) {
    npSaleNowItemId = item.id;
    npSaleNowPayment = item.metodePembayaran || '';

    const nameEl = document.getElementById('np-sale-product-name');
    const specEl = document.getElementById('np-sale-product-spec');
    const imageEl = document.getElementById('np-sale-product-image');
    const customerEl = document.getElementById('np-sale-customer');
    const phoneEl = document.getElementById('np-sale-phone');
    const priceEl = document.getElementById('np-sale-price');
    const totalEl = document.getElementById('np-sale-total-value');
    const paymentLabel = document.getElementById('np-sale-payment-label');
    const options = document.getElementById('np-sale-payment-options');

    const basePrice = parseRawToNumeric(item.hargaDisplay) || parseRawToNumeric(item.hargaJual) || 0;
    if (nameEl) nameEl.textContent = item.produk || 'Unit';
    if (specEl) specEl.textContent = [item.kondisi, item.kelengkapan].filter(Boolean).join(' • ') || 'Unit tersedia';
    if (imageEl) {
        imageEl.src = item.imageUrl || 'logo-np.jpg';
        imageEl.onerror = function() { this.src = 'logo-np.jpg'; };
    }
    if (customerEl) customerEl.value = item.pembeli || '';
    if (phoneEl) phoneEl.value = item.customerPhone || '';
    if (priceEl) priceEl.value = basePrice > 0 ? formatRupiahLengkap(basePrice) : '';
    if (totalEl) totalEl.textContent = basePrice > 0 ? formatRupiahLengkap(basePrice) : 'Rp 0';
    if (paymentLabel) paymentLabel.textContent = npSaleNowPayment || 'Pilih metode pembayaran';
    if (options) options.classList.remove('is-open');

    const modal = document.getElementById('np-sale-sheet-modal');
    if (modal) {
        modal.classList.add('show');
        modal.setAttribute('aria-hidden', 'false');
        setTimeout(() => customerEl?.focus(), 260);
    }
}

window.closeSaleNowModal = function() {
    const modal = document.getElementById('np-sale-sheet-modal');
    if (modal) {
        modal.classList.remove('show');
        modal.setAttribute('aria-hidden', 'true');
    }
    npSaleNowItemId = null;
    npSaleNowPayment = '';
};

async function confirmSaleNow() {
    const id = npSaleNowItemId;
    const item = daftarStokMasuk.find(s => s.id === id);
    if (!item) return;

    const customerEl = document.getElementById('np-sale-customer');
    const phoneEl = document.getElementById('np-sale-phone');
    const priceEl = document.getElementById('np-sale-price');
    const customer = customerEl?.value.trim() || '';
    const phone = phoneEl?.value.trim() || '';
    const price = parseRawToNumeric(priceEl?.value) || 0;

    if (!customer) {
        showToast('Data belum lengkap', 'Nama pembeli wajib diisi.', false);
        customerEl?.focus();
        return;
    }
    if (price <= 0) {
        showToast('Data belum lengkap', 'Harga penjualan wajib diisi dan harus lebih dari 0.', false);
        priceEl?.focus();
        return;
    }
    if (!npSaleNowPayment) {
        showToast('Data belum lengkap', 'Pilih metode pembayaran terlebih dahulu.', false);
        return;
    }

    item.pembeli = customer;
    item.customerPhone = phone;
    item.hargaJual = String(price);
    item.metodePembayaran = npSaleNowPayment;

    closeSaleNowModal();
    await processSaleNow(item);
}

async function processSaleNow(item) {
    let d = new Date(), tgl = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    item.tanggalTerjualRaw = tgl;
    item.modalStatus = 'belum';

    let profit = (parseRawToNumeric(item.hargaJual) || 0) - (parseRawToNumeric(item.hargaModal) || 0);
    let kasId = 'kas-' + Date.now();

    if (!supabaseClient) {
        showToast('Gagal', 'Koneksi Cloud belum tersedia.', false);
        return;
    }

    setConnectionStatus('syncing');
    try {
        await supabaseClient.from('product').update({ status: 'sold' }).eq('id', item.id);

        const { error: trxError } = await supabaseClient.from('transactions').insert([{
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
        if (trxError) throw trxError;

        // Field tambahan bersifat opsional agar tetap kompatibel dengan schema transaksi lama.
        await supabaseClient.from('transactions').update({
            customer_phone: item.customerPhone || '',
            payment_method: item.metodePembayaran || ''
        }).eq('id', item.id).then(() => {}).catch(() => {});

        if (profit > 0) {
            await supabaseClient.from('cash_mutations').insert([{
                id: kasId,
                description: `Laba Jual: ${item.produk}`,
                type: 'masuk',
                amount: profit,
                date: tgl
            }]);
        }

        daftarStokMasuk = daftarStokMasuk.filter(s => s.id !== item.id);
        daftarTerjual.unshift(item);
        if (profit > 0) {
            daftarKasPribadi.unshift({ id: kasId, keterangan: `Laba Jual: ${item.produk}`, kategori: 'masuk', nominal: profit, tanggal: tgl });
        }

        renderInvoiceCenter();
        renderDaftarModal();
        renderManajemenKas();
        updateDashboardStats();
        updatePribadiStats();
        initShowcaseBrandDropdown();
        renderHomeShowcase();

        setConnectionStatus('connected');
        showToast('Berhasil', 'Unit terjual & transaksi tercatat di Cloud.');
        openInvoiceModal(item);
    } catch (err) {
        console.warn('Gagal sinkron penjualan ke Supabase:', err);
        setConnectionStatus('disconnected');
        showToast('Gagal', 'Terjadi kendala memproses penjualan di Cloud.', false);
    }
}

/* FORM JUAL SEKARANG — INTERACTION */
(function initSaleNowForm() {
    document.addEventListener('DOMContentLoaded', () => {
        const priceEl = document.getElementById('np-sale-price');
        const totalEl = document.getElementById('np-sale-total-value');
        const paymentTrigger = document.getElementById('np-sale-payment-trigger');
        const paymentOptions = document.getElementById('np-sale-payment-options');
        const paymentLabel = document.getElementById('np-sale-payment-label');
        const confirmBtn = document.getElementById('np-sale-confirm-btn');

        const normalizeSalePriceInput = () => {
            if (!priceEl) return 0;
            const rawDigits = String(priceEl.value || '').replace(/\D/g, '');
            priceEl.value = rawDigits;
            return parseRawToNumeric(rawDigits) || 0;
        };

        priceEl?.addEventListener('focus', () => {
            const current = String(priceEl.value || '').trim();
            if (!current) return;
            const numeric = parseRawToNumeric(current.replace(/\D/g, '')) || 0;
            if (numeric > 0 && numeric % 1000 === 0) {
                priceEl.value = String(Math.round(numeric / 1000));
            } else {
                priceEl.value = current.replace(/\D/g, '');
            }
        });

        priceEl?.addEventListener('input', () => {
            const value = normalizeSalePriceInput();
            if (totalEl) totalEl.textContent = value ? formatRupiahLengkap(value) : 'Rp 0';
        });

        priceEl?.addEventListener('blur', () => {
            const value = parseRawToNumeric(String(priceEl.value || '').replace(/\D/g, '')) || 0;
            priceEl.value = value ? formatRupiahLengkap(value) : '';
            if (totalEl) totalEl.textContent = value ? formatRupiahLengkap(value) : 'Rp 0';
        });

        paymentTrigger?.addEventListener('click', () => {
            paymentOptions?.classList.toggle('is-open');
        });

        paymentOptions?.querySelectorAll('[data-payment]').forEach(btn => {
            btn.addEventListener('click', () => {
                npSaleNowPayment = btn.dataset.payment || '';
                if (paymentLabel) paymentLabel.textContent = npSaleNowPayment;
                paymentOptions.classList.remove('is-open');
            });
        });

        confirmBtn?.addEventListener('click', confirmSaleNow);
    });
})();

/* QUICK NOTE — AUTO EXPAND TEXTAREA */
(function initQuickNoteForm() {
    document.addEventListener('DOMContentLoaded', () => {
        const contentInput = document.getElementById('note-content-input');
        contentInput?.addEventListener('input', () => autoGrowNoteTextarea(contentInput));
        contentInput?.addEventListener('focus', () => autoGrowNoteTextarea(contentInput));
        requestAnimationFrame(() => autoGrowNoteTextarea(contentInput));
    });
})();


/* ========================================================== */
/* INVOICE NOTA A4 DENGAN QR CODE GARANSI DIGITAL             */
/* ========================================================== */
function generateInvoiceHTML(item, overridePrice = null, qrBoxId = 'invoice-qr-canvas') {
    let invoiceNo = 'INV-' + (item.tanggalTerjualRaw ? item.tanggalTerjualRaw.replace(/-/g, '') : new Date().toISOString().slice(0, 10).replace(/-/g, '')) + '-' + String(item.id).slice(-4);
    let customerName = item.pembeli && item.pembeli.trim() !== '' ? item.pembeli.trim() : 'Pelanggan Setia';
    
    let numericJual = (overridePrice !== null) ? overridePrice : (parseRawToNumeric(item.hargaJual) || 0);
    let qty = parseInt(item.qty || 1);
    let hargaTotalTampil = formatRupiahLengkap(numericJual);
    let tglTampil = formatTanggalID(item.tanggalTerjualRaw || new Date().toISOString().slice(0, 10));

    return `
        <div class="elegant-invoice-card">
            <div class="invoice-header-box">
                <div class="invoice-brand-wrap">
                    <img src="logo-np.jpg" alt="Logo NP" class="invoice-brand-logo">
                    <div>
                        <h2 class="invoice-brand-title">NP - GALERY</h2>
                        <p class="invoice-brand-sub">Smartphone Store & Premium Gadget</p>
                        <div class="invoice-contact-row">
                            <span class="invoice-contact-item wa"><i class="fa-brands fa-whatsapp"></i> 0857 1794 5565</span>
                            <span class="invoice-contact-divider">|</span>
                            <span class="invoice-contact-item email"><i class="fa-solid fa-envelope"></i> helboynpgalery@gmail.com</span>
                        </div>
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
                        <td align="right" style="font-weight: 800; color: #0284C7; font-size: 13px;">${hargaTotalTampil}</td>
                    </tr>
                </tbody>
            </table>

            <div class="invoice-total-row">
                <span class="invoice-total-label">TOTAL PEMBAYARAN (LUNAS)</span>
                <span class="invoice-total-val">${hargaTotalTampil}</span>
            </div>

            <div class="invoice-footer-signatures">
                <div class="invoice-sign-column-left">
                    <span class="invoice-sign-header-label">Hormat Kami,</span>
                    <img src="tanda-tangan.png" alt="Tanda Tangan" class="invoice-auto-sign-img" onerror="this.style.display='none';">
                    <span class="invoice-sign-name-label">( NP - Galery )</span>
                </div>
                <div class="invoice-sign-column-right">
                    <span class="invoice-sign-header-label">Customer</span>
                    <div class="invoice-qr-wrap" onclick="openWarrantyCertificateModal('${item.id}')" style="cursor:pointer;" title="Klik untuk pratinjau sertifikat garansi">
                        <div id="${qrBoxId}" class="invoice-qr-box"></div>
                        <span class="invoice-qr-hint">Scan Kartu Garansi</span>
                    </div>
                    <span class="invoice-sign-name-label">( ${customerName} )</span>
                </div>
            </div>
        </div>
    `;
}

function renderInvoiceQRCode(containerId, item) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';

    const currentBaseUrl = window.location.origin + window.location.pathname;
    const warrantyTargetUrl = `${currentBaseUrl}?warranty=${encodeURIComponent(item.id)}`;

    if (window.QRCode) {
        new QRCode(el, {
            text: warrantyTargetUrl,
            width: 90,
            height: 90,
            colorDark: "#000000",
            colorLight: "#FFFFFF",
            correctLevel: QRCode.CorrectLevel.H
        });
    } else {
        el.innerHTML = `<i class="fa-solid fa-qrcode" style="font-size: 40px; color: var(--azure-primary);"></i>`;
    }
}

window.openInvoiceModal = function(item) {
    activeInvoiceData = item;
    tempInvoiceOriginalItem = item;
    tempInvoiceOverridePrice = null;

    const body = document.getElementById('invoice-preview-body');
    const priceInput = document.getElementById('invoice-custom-price-input');

    if (priceInput) {
        let basePrice = parseRawToNumeric(item.hargaJual) || 0;
        priceInput.value = basePrice ? basePrice.toLocaleString('id-ID') : '';
    }

    if (!body) return;
    body.innerHTML = generateInvoiceHTML(item, null, 'invoice-qr-canvas-preview');
    renderInvoiceQRCode('invoice-qr-canvas-preview', item);
    toggleModal('invoice-modal', true);
};

window.handleInvoiceCustomPriceChange = function(rawVal) {
    if (!activeInvoiceData) return;
    let numeric = parseRawToNumeric(rawVal);
    tempInvoiceOverridePrice = numeric !== null ? numeric : 0;

    const body = document.getElementById('invoice-preview-body');
    if (body) {
        body.innerHTML = generateInvoiceHTML(activeInvoiceData, tempInvoiceOverridePrice, 'invoice-qr-canvas-preview');
        renderInvoiceQRCode('invoice-qr-canvas-preview', activeInvoiceData);
    }
};

window.resetInvoicePriceToOriginal = function() {
    if (!tempInvoiceOriginalItem) return;
    let basePrice = parseRawToNumeric(tempInvoiceOriginalItem.hargaJual) || 0;
    tempInvoiceOverridePrice = null;

    const priceInput = document.getElementById('invoice-custom-price-input');
    if (priceInput) {
        priceInput.value = basePrice ? basePrice.toLocaleString('id-ID') : '';
    }

    const body = document.getElementById('invoice-preview-body');
    if (body) {
        body.innerHTML = generateInvoiceHTML(tempInvoiceOriginalItem, null, 'invoice-qr-canvas-preview');
        renderInvoiceQRCode('invoice-qr-canvas-preview', tempInvoiceOriginalItem);
    }
    showToast('Reset', 'Harga invoice dikembalikan ke nilai awal.');
};

window.closeInvoiceModal = function() {
    toggleModal('invoice-modal', false);
    activeInvoiceData = null;
    tempInvoiceOverridePrice = null;
    tempInvoiceOriginalItem = null;
};

window.shareInvoiceWA = function() {
    if (!activeInvoiceData || !window.html2canvas) {
        showToast('Peringatan', 'Data nota atau modul gambar belum siap.', false);
        return;
    }

    const canvasWrap = document.getElementById('invoice-render-canvas');
    if (!canvasWrap) return;

    canvasWrap.innerHTML = generateInvoiceHTML(activeInvoiceData, tempInvoiceOverridePrice, 'invoice-qr-canvas-render');
    renderInvoiceQRCode('invoice-qr-canvas-render', activeInvoiceData);

    showToast('Memproses', 'Menyiapkan nota gambar & membuka WhatsApp...');

    const textUcapan = `Halo Kak, terima kasih banyak telah melakukan transaksi di *NP - Galery Store* ✨\n\nBerikut kami lampirkan nota pembelian resmi beserta kartu garansi digital untuk unit Anda.\n\nJika ada kendala atau pertanyaan seputar unitnya, silakan hubungi kami kembali ya. Selamat menikmati perangkat barunya! 🙏😊`;

    setTimeout(() => {
        html2canvas(canvasWrap, { scale: 2, backgroundColor: '#FFFFFF', useCORS: true }).then(canvas => {
            let link = document.createElement('a');
            link.download = `Nota_${activeInvoiceData.produk.replace(/\s+/g, '_')}_${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();

            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(textUcapan).catch(() => fallbackSalinText(textUcapan));
            } else {
                fallbackSalinText(textUcapan);
            }

            showToast('Berhasil', 'Nota terunduh & pesan disalin ke clipboard.');

            setTimeout(() => {
                window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(textUcapan)}`, '_blank');
            }, 600);
        }).catch(err => {
            console.warn('Gagal render nota:', err);
            showToast('Gagal', 'Tidak dapat merender nota ke gambar.', false);
        });
    }, 250);
};

window.downloadInvoiceImage = function() {
    if (!activeInvoiceData || !window.html2canvas) return;
    const canvasWrap = document.getElementById('invoice-render-canvas');
    if (!canvasWrap) return;

    canvasWrap.innerHTML = generateInvoiceHTML(activeInvoiceData, tempInvoiceOverridePrice, 'invoice-qr-canvas-render');
    renderInvoiceQRCode('invoice-qr-canvas-render', activeInvoiceData);

    setTimeout(() => {
        html2canvas(canvasWrap, { scale: 2, backgroundColor: '#FFFFFF', useCORS: true }).then(canvas => {
            let link = document.createElement('a');
            link.download = `Invoice_A4_NPGalery_${activeInvoiceData.produk.replace(/\s+/g, '_')}_${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            showToast('Berhasil!', 'Nota invoice format A4 diunduh.');
        });
    }, 200);
};

/* ========================================================== */
/* SERTIFIKAT KARTU GARANSI DIGITAL (E-WARRANTY) & HITUNG MUNDUR */
/* ========================================================== */
function calculateWarrantyCountdown(purchaseDateStr) {
    if (!purchaseDateStr) return { isExpired: true, daysLeft: 0, endDateStr: '-' };
    
    const parts = purchaseDateStr.split('-');
    if (parts.length !== 3) return { isExpired: true, daysLeft: 0, endDateStr: '-' };

    const startDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    const endDate = new Date(startDate.getTime());
    endDate.setDate(endDate.getDate() + 7);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffTime = endDate.getTime() - today.getTime();
    const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const endYear = endDate.getFullYear();
    const endMonth = String(endDate.getMonth() + 1).padStart(2, '0');
    const endDay = String(endDate.getDate()).padStart(2, '0');
    const endDateStr = `${endDay} - ${endMonth} - ${endYear}`;

    return {
        isExpired: daysLeft < 0,
        daysLeft: Math.max(0, daysLeft),
        endDateStr: endDateStr
    };
}

window.openWarrantyCertificateModal = function(unitIdOrObject) {
    let item = null;
    if (typeof unitIdOrObject === 'string') {
        item = daftarTerjual.find(t => t.id === unitIdOrObject) || daftarStokMasuk.find(s => s.id === unitIdOrObject);
    } else {
        item = unitIdOrObject;
    }

    if (!item) {
        showToast('Peringatan', 'Data unit tidak ditemukan untuk garansi ini.', false);
        return;
    }

    activeWarrantyItemData = item;
    const body = document.getElementById('warranty-certificate-body');
    if (!body) return;

    const brand = item.produk.split(' ')[0].toUpperCase();
    const tglBeliRaw = item.tanggalTerjualRaw || item.tanggal || new Date().toISOString().slice(0, 10);
    const countdownInfo = calculateWarrantyCountdown(tglBeliRaw);

    const statusBadgeHtml = !countdownInfo.isExpired 
        ? `<span class="warranty-status-badge active"><span class="warranty-pulse-dot"></span> GARANSI AKTIF</span>`
        : `<span class="warranty-status-badge expired"><span class="warranty-pulse-dot"></span> GARANSI BERAKHIR</span>`;

    const countdownText = !countdownInfo.isExpired 
        ? `${countdownInfo.daysLeft} Hari Lagi`
        : `Masa Garansi Telah Habis`;

    body.innerHTML = `
        <div class="warranty-cert-card">
            <div class="warranty-cert-hero">
                <div>
                    <span class="price-card-brand" style="${getBrandStyle(brand)}">${brand}</span>
                    <h3 style="font-size: 14px; font-weight: 800; color: var(--text-primary); margin-top: 4px;">${item.produk}</h3>
                </div>
                <div class="warranty-cert-badge-wrap">
                    ${statusBadgeHtml}
                </div>
            </div>

            <div class="warranty-countdown-box">
                <div>
                    <span class="warranty-countdown-label">Sisa Masa Garansi 7 Hari</span>
                    <div style="font-size: 9.5px; color: var(--text-secondary); margin-top: 2px;">
                        Berlaku s/d: <b>${countdownInfo.endDateStr}</b>
                    </div>
                </div>
                <span class="warranty-countdown-val">${countdownText}</span>
            </div>

            <div class="warranty-details-stack">
                <div class="warranty-detail-row">
                    <span class="w-label">Nomor IMEI / SN</span>
                    <span class="w-val mono">${item.imei || '-'}</span>
                </div>
                <div class="warranty-detail-row">
                    <span class="w-label">Kondisi & Kelengkapan</span>
                    <span class="w-val">${item.kondisi} • ${item.kelengkapan}</span>
                </div>
                <div class="warranty-detail-row">
                    <span class="w-label">Tanggal Pembelian</span>
                    <span class="w-val">${formatTanggalID(tglBeliRaw)}</span>
                </div>
                <div class="warranty-detail-row">
                    <span class="w-label">Nama Pemilik</span>
                    <span class="w-val">${item.pembeli || 'Pelanggan Setia'}</span>
                </div>
            </div>

            <div class="warranty-terms-box">
                <div class="warranty-terms-title">
                    <i class="fa-solid fa-shield-halved"></i>
                    <span>Syarat & Ketentuan Klaim Garansi Toko:</span>
                </div>
                <ul class="warranty-terms-list">
                    <li><i class="fa-solid fa-circle-check"></i> Customer sudah mengecek detail fisik, hardware, & software saat pembelian.</li>
                    <li><i class="fa-solid fa-circle-check"></i> Klaim garansi berlaku 7 hari setelah tanggal pembelian.</li>
                    <li><i class="fa-solid fa-circle-check"></i> Garansi berlaku untuk kerusakan software yang terjadi akibat error sistem.</li>
                    <li class="term-warning"><i class="fa-solid fa-triangle-exclamation"></i> Garansi tidak berlaku untuk hardware (layar pecah, mesin konslet, terkena cairan, dsb).</li>
                    <li class="term-warning"><i class="fa-solid fa-triangle-exclamation"></i> Garansi hangus apabila disebabkan oleh human error atau pembongkaran segel unit.</li>
                </ul>
            </div>
        </div>
    `;

    toggleModal('warranty-certificate-modal', true);
};

window.closeWarrantyCertificateModal = function() {
    if (isPublicWarrantyMode) {
        const body = document.getElementById('warranty-certificate-body');
        const footer = document.querySelector('.warranty-modal-footer');
        if (body) {
            body.innerHTML = `
                <div style="text-align: center; padding: 32px 14px; display: flex; flex-direction: column; align-items: center; gap: 10px;">
                    <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(16, 185, 129, 0.12); display: flex; align-items: center; justify-content: center; color: var(--status-safe); font-size: 24px;">
                        <i class="fa-solid fa-circle-check"></i>
                    </div>
                    <h3 style="font-size: 15px; font-weight: 800; color: var(--text-primary);">Terima Kasih Telah Berbelanja!</h3>
                    <p style="font-size: 11.5px; color: var(--text-secondary); line-height: 1.5; max-width: 320px;">
                        Simpan nota invoice Anda sebagai bukti garansi resmi di <b>NP - Galery Store</b>. Jika ada pertanyaan, admin siap melayani Anda.
                    </p>
                    <button type="button" class="btn-save" style="margin-top: 8px; width: auto; padding: 10px 22px; font-size: 12px;" onclick="openStoreShowcaseModal()">
                        <i class="fa-solid fa-store"></i> Lihat Katalog Toko
                    </button>
                </div>
            `;
        }
        if (footer) {
            footer.innerHTML = `
                <button type="button" class="invoice-btn-wa" style="width: 100%;" onclick="claimWarrantyViaWhatsApp()">
                    <i class="fa-brands fa-whatsapp"></i> Chat Admin WhatsApp
                </button>
            `;
        }
        return;
    }

    toggleModal('warranty-certificate-modal', false);
    activeWarrantyItemData = null;
};

window.claimWarrantyViaWhatsApp = function() {
    let item = activeWarrantyItemData;
    let tglBeliRaw = item ? (item.tanggalTerjualRaw || item.tanggal || new Date().toISOString().slice(0, 10)) : new Date().toISOString().slice(0, 10);
    let countdownInfo = calculateWarrantyCountdown(tglBeliRaw);

    let msg = `Halo Admin *NP - Galery*,\n\n`;
    msg += `Saya ingin konsultasi / klaim garansi untuk unit berikut:\n`;
    if (item) {
        msg += `• *Model*: ${item.produk}\n`;
        msg += `• *IMEI/SN*: ${item.imei || '-'}\n`;
        msg += `• *Kelengkapan*: ${item.kelengkapan}\n`;
        msg += `• *Tgl Beli*: ${formatTanggalID(tglBeliRaw)}\n`;
        msg += `• *Sisa Garansi*: ${!countdownInfo.isExpired ? countdownInfo.daysLeft + ' Hari' : 'Masa Garansi Habis'}\n\n`;
    }
    msg += `Kendala yang dialami: `;

    const phone = "6285717945565";
    const url = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
};

async function checkUrlForWarrantyParam() {
    const urlParams = new URLSearchParams(window.location.search);
    const warrantyId = urlParams.get('warranty');
    if (!warrantyId) return;

    const authModal = document.getElementById('auth-modal');
    if (authModal) authModal.classList.add('hidden');

    let found = daftarTerjual.find(t => t.id === warrantyId) || daftarStokMasuk.find(s => s.id === warrantyId);

    if (found) {
        openWarrantyCertificateModal(found);
    } else if (supabaseClient) {
        try {
            const { data: trxData } = await supabaseClient.from('transactions').select('*').eq('id', warrantyId).maybeSingle();
            if (trxData) {
                openWarrantyCertificateModal({
                    id: trxData.id,
                    produk: trxData.product_name,
                    kondisi: trxData.condition || 'Second',
                    kelengkapan: trxData.completeness || 'Fullset',
                    imei: trxData.imei || '-',
                    qty: String(trxData.qty || 1),
                    hargaModal: '0',
                    hargaJual: String(trxData.sell_price || 0),
                    pembeli: trxData.customer_name || '',
                    tanggal: trxData.date || '',
                    tanggalTerjualRaw: trxData.sold_date || (trxData.created_at ? trxData.created_at.slice(0, 10) : '')
                });
            } else {
                const { data: prodData } = await supabaseClient.from('product').select('*').eq('id', warrantyId).maybeSingle();
                if (prodData) {
                    openWarrantyCertificateModal({
                        id: prodData.id,
                        produk: prodData.name,
                        kondisi: prodData.condition || 'Second',
                        kelengkapan: prodData.completeness || 'Fullset',
                        imei: prodData.imei || '-',
                        qty: String(prodData.qty || 1),
                        hargaModal: '0',
                        hargaJual: String(prodData.sell_price || 0),
                        pembeli: prodData.buyer || '',
                        tanggal: prodData.date || '',
                        tanggalTerjualRaw: prodData.date || (prodData.created_at ? prodData.created_at.slice(0, 10) : '')
                    });
                } else {
                    showToast('Info', 'Data kartu garansi unit tidak ditemukan.', false);
                }
            }
        } catch (err) {
            console.warn('Gagal memuat garansi publik:', err);
        }
    }
}

window.hapusStokItem = function(id) {
    showCustomConfirm("Hapus Stok", "Hapus unit ini?", async () => {
        if (supabaseClient) {
            setConnectionStatus('syncing');
            try { 
                await supabaseClient.from('product').delete().eq('id', id); 
                daftarStokMasuk = daftarStokMasuk.filter(s => s.id !== id);
                updateDashboardStats(); 
                initShowcaseBrandDropdown();
                setConnectionStatus('connected');
                showToast('Berhasil', 'Stok dihapus dari server.');
            } catch (e) {
                setConnectionStatus('disconnected');
            }
        }
    });
};

window.hapusRiwayatTerjual = function(id) {
    showCustomConfirm("Hapus Riwayat", "Hapus riwayat penjualan?", async () => {
        if (supabaseClient) {
            setConnectionStatus('syncing');
            try { 
                await supabaseClient.from('transactions').delete().eq('id', id); 
                daftarTerjual = daftarTerjual.filter(s => s.id !== id);
                renderInvoiceCenter(); 
                renderDaftarModal(); 
                updateDashboardStats(); 
                setConnectionStatus('connected');
                showToast('Berhasil', 'Riwayat penjualan dihapus dari Cloud.');
            } catch (e) {
                setConnectionStatus('disconnected');
            }
        }
    });
};

function getInvoiceCenterNumber(item) {
    return 'INV-' + (item.tanggalTerjualRaw ? item.tanggalTerjualRaw.replace(/-/g, '') : new Date().toISOString().slice(0, 10).replace(/-/g, '')) + '-' + String(item.id).slice(-4);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

window.openInvoiceModalById = function(id) {
    const item = daftarTerjual.find(entry => String(entry.id) === String(id));
    if (item) openInvoiceModal(item);
};

window.filterInvoiceCenter = function(query = '') {
    const container = document.getElementById('invoice-center-list');
    const countEl = document.getElementById('invoice-center-count');
    if (!container) return;

    const q = String(query).trim().toLowerCase();
    const filtered = daftarTerjual.filter(item => {
        const name = String(item.pembeli || 'Pelanggan Setia').toLowerCase();
        const date = String(item.tanggalTerjualRaw || item.tanggal || '').toLowerCase();
        const price = String(parseRawToNumeric(item.hargaJual) || 0);
        const invoiceNo = getInvoiceCenterNumber(item).toLowerCase();
        return !q || name.includes(q) || date.includes(q) || price.includes(q) || invoiceNo.includes(q);
    });

    if (countEl) countEl.textContent = String(filtered.length);

    if (!filtered.length) {
        container.innerHTML = `<div class="np-invoice-empty">${q ? 'Invoice yang dicari tidak ditemukan.' : 'Belum ada invoice tersimpan.'}</div>`;
        return;
    }

    container.innerHTML = filtered.map(item => {
        const name = item.pembeli && item.pembeli.trim() ? item.pembeli.trim() : 'Pelanggan Setia';
        const date = formatTanggalID(item.tanggalTerjualRaw || item.tanggal || '');
        const price = formatRupiahLengkap(parseRawToNumeric(item.hargaJual) || 0);
        return `
            <button class="np-invoice-row" type="button" onclick="openInvoiceModalById('${escapeHtml(item.id)}')" aria-label="Buka invoice untuk ${escapeHtml(name)}">
                <span class="np-invoice-row-main">
                    <strong>${escapeHtml(name)}</strong>
                    <small>${escapeHtml(date || '-')}</small>
                </span>
                <span class="np-invoice-row-price">${escapeHtml(price)}</span>
                <i class="fa-solid fa-chevron-right np-invoice-row-arrow" aria-hidden="true"></i>
            </button>
        `;
    }).join('');
};

function renderInvoiceCenter() {
    const countEl = document.getElementById('invoice-center-count');
    if (countEl) countEl.textContent = String(daftarTerjual.length);
    filterInvoiceCenter(document.getElementById('invoice-center-search')?.value || '');
}

/* ========================================================== */
/* RENDER SUB-TAB MODAL                                       */
/* ========================================================== */
function renderDaftarModal() {
    let belumKembali = daftarTerjual.filter(i => i.modalStatus !== 'sudah');
    let sudahKembali = daftarTerjual.filter(i => i.modalStatus === 'sudah');

    let totalNominalBelum = belumKembali.reduce((sum, item) => sum + (parseRawToNumeric(item.hargaModal) || 0) * parseInt(item.qty || 1), 0);
    let totalNominalSudah = sudahKembali.reduce((sum, item) => sum + (parseRawToNumeric(item.hargaModal) || 0) * parseInt(item.qty || 1), 0);

    const belumNomElem = document.getElementById('modal-belum-nominal');
    const sudahNomElem = document.getElementById('modal-sudah-nominal');

    if (belumNomElem) belumNomElem.textContent = formatRupiahRingkas(totalNominalBelum);
    if (sudahNomElem) sudahNomElem.textContent = formatRupiahRingkas(totalNominalSudah);

    const badgeBelum = document.getElementById('badge-modal-belum-count');
    const badgeSudah = document.getElementById('badge-modal-sudah-count');
    if (badgeBelum) badgeBelum.textContent = `${belumKembali.length} Unit`;
    if (badgeSudah) badgeSudah.textContent = `${sudahKembali.length} Unit`;

    const containerBelum = document.getElementById('container-modal-belum-list');
    if (containerBelum) {
        if (belumKembali.length === 0) {
            containerBelum.innerHTML = `<div class="empty-stok-msg">Semua modal unit telah kembali.</div>`;
        } else {
            containerBelum.innerHTML = belumKembali.map(i => {
                let numericModal = parseRawToNumeric(i.hargaModal) || 0;
                let namaPembeliText = i.pembeli && i.pembeli.trim() !== '' ? ` • Pembeli: <b>${i.pembeli}</b>` : '';
                return `
                    <div class="stok-item-card" style="cursor:default;">
                        <div class="stok-item-top">
                            <div class="stok-title-group">
                                <span class="kondisi-badge ${i.kondisi.toLowerCase()}">${i.kondisi}</span>
                                <span class="stok-item-title">${i.produk}</span>
                            </div>
                            <button onclick="toggleModalStatus('${i.id}')" style="background: rgba(16, 185, 129, 0.12); color: var(--status-safe); border: 1px solid currentColor; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                                <i class="fa-solid fa-check"></i> Sudah
                            </button>
                        </div>
                        <div class="stok-item-details">
                            <span class="detail-badge imei-badge">IMEI: ${i.imei || '-'}</span>
                            <span class="detail-badge">${formatTanggalID(i.tanggalTerjualRaw || i.tanggal)}</span>
                            <span class="detail-badge qty-badge">${i.qty || 1} unit</span>
                            <span class="detail-badge" style="font-size: 10px; color: var(--text-secondary);">${namaPembeliText}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-top:6px; font-size:11px; font-weight:700;">
                            <span style="color:var(--text-secondary);">Modal Unit:</span>
                            <span style="color:#F43F5E; font-family:var(--font-mono);">${formatRupiahRingkas(numericModal)}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    const containerSudah = document.getElementById('container-modal-sudah-list');
    if (containerSudah) {
        if (sudahKembali.length === 0) {
            containerSudah.innerHTML = `<div class="empty-stok-msg">Belum ada catatan modal yang kembali.</div>`;
        } else {
            containerSudah.innerHTML = sudahKembali.map(i => {
                let numericModal = parseRawToNumeric(i.hargaModal) || 0;
                let namaPembeliText = i.pembeli && i.pembeli.trim() !== '' ? ` • Pembeli: <b>${i.pembeli}</b>` : '';
                return `
                    <div class="stok-item-card" style="cursor:default;">
                        <div class="stok-item-top">
                            <div class="stok-title-group">
                                <span class="kondisi-badge ${i.kondisi.toLowerCase()}">${i.kondisi}</span>
                                <span class="stok-item-title">${i.produk}</span>
                            </div>
                            <span style="background: rgba(16, 185, 129, 0.12); color: var(--status-safe); border: 1px solid rgba(16, 185, 129, 0.3); padding: 3px 8px; border-radius: 6px; font-size: 10.5px; font-weight: 800;">
                                <i class="fa-solid fa-check-double"></i> Selesai
                            </span>
                        </div>
                        <div class="stok-item-details">
                            <span class="detail-badge imei-badge">IMEI: ${i.imei || '-'}</span>
                            <span class="detail-badge">${formatTanggalID(i.tanggalTerjualRaw || i.tanggal)}</span>
                            <span class="detail-badge qty-badge">${i.qty || 1} unit</span>
                            <span class="detail-badge" style="font-size: 10px; color: var(--text-secondary);">${namaPembeliText}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-top:6px; font-size:11px; font-weight:700;">
                            <span style="color:var(--text-secondary);">Modal Kembali:</span>
                            <span style="color:#10B981; font-family:var(--font-mono);">${formatRupiahRingkas(numericModal)}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
}

window.toggleModalStatus = async function(id) {
    const item = daftarTerjual.find(s => s.id === id);
    if (item) {
        if (item.modalStatus === 'sudah') return;

        if (supabaseClient) {
            setConnectionStatus('syncing');
            try {
                const { error } = await supabaseClient
                    .from('transactions')
                    .update({ modal_status: 'sudah' })
                    .eq('id', id);

                if (error) throw error;

                item.modalStatus = 'sudah';
                renderDaftarModal();
                setConnectionStatus('connected');
                showToast('Berhasil', 'Modal berhasil ditandai sudah kembali.');
            } catch (err) {
                console.warn('Gagal sinkron status modal:', err);
                setConnectionStatus('disconnected');
                showToast('Gagal', 'Gagal memperbarui status modal.', false);
            }
        }
    }
};

window.tambahKasPribadi = async function() {
    let ket = document.getElementById('kas-keterangan').value.trim();
    let nom = parseRawToNumeric(document.getElementById('kas-nominal').value);
    let tgl = document.getElementById('kas-tanggal').value;
    if (!ket || !nom || !tgl) { showToast('Gagal', 'Lengkapi form kas!', false); return; }

    const newKasItem = {
        id: 'kas-' + Date.now(),
        description: ket,
        type: document.getElementById('kas-kategori').value,
        amount: nom,
        date: tgl
    };

    if (supabaseClient) {
        setConnectionStatus('syncing');
        try {
            const { error } = await supabaseClient.from('cash_mutations').insert([newKasItem]);
            if (error) throw error;

            daftarKasPribadi.unshift({
                id: newKasItem.id,
                keterangan: newKasItem.description,
                kategori: newKasItem.type,
                nominal: newKasItem.amount,
                tanggal: newKasItem.date
            });

            document.getElementById('kas-keterangan').value = '';
            document.getElementById('kas-nominal').value = '';
            closeAddKasModal();
            renderManajemenKas();
            updatePribadiStats();
            setConnectionStatus('connected');
            showToast('Berhasil', 'Kas dicatat ke Cloud.');
        } catch (e) {
            console.warn('Gagal sinkron kas ke Supabase:', e);
            setConnectionStatus('disconnected');
            showToast('Gagal', 'Gagal mencatat kas ke server.', false);
        }
    }
};

window.hapusKasPribadi = function(id) {
    showCustomConfirm("Hapus Kas", "Hapus catatan kas ini?", async () => {
        if (supabaseClient) {
            setConnectionStatus('syncing');
            try { 
                await supabaseClient.from('cash_mutations').delete().eq('id', id); 
                daftarKasPribadi = daftarKasPribadi.filter(k => k.id !== id);
                renderManajemenKas();
                updatePribadiStats();
                setConnectionStatus('connected');
                showToast('Berhasil', 'Catatan kas dihapus.');
            } catch (e) {
                setConnectionStatus('disconnected');
            }
        }
    });
};

window.renderManajemenKas = function() {
    const container = document.getElementById('kas-masuk-container');
    const badge = document.getElementById('badge-kas-count');
    const modalBadge = document.getElementById('modal-badge-kas-count');
    if (!container) return;
    let kat = document.getElementById('filter-kas-kategori')?.value || 'ALL';
    let tgl = document.getElementById('filter-kas-tanggal')?.value || '';
    let filtered = daftarKasPribadi.filter(i => (kat === 'ALL' || i.kategori === kat) && (!tgl || i.tanggal === tgl));
    
    if (badge) badge.textContent = `${filtered.length} Catatan`;
    if (modalBadge) modalBadge.textContent = `${filtered.length} Catatan`;

    if (filtered.length === 0) { 
        container.innerHTML = `<div class="empty-stok-msg">Tidak ada catatan kas.</div>`; 
        return; 
    }
    
    container.innerHTML = filtered.map(i => `
        <div class="stok-item-card" style="cursor:default;">
            <div class="stok-item-top"><span style="font-size:9.5px; font-weight:800; padding:2px 6px; border-radius:4px; background:${i.kategori==='masuk'?'rgba(16,185,129,0.12)':'rgba(244,63,94,0.12)'}; color:${i.kategori==='masuk'?'var(--status-safe)':'var(--status-unsafe)'}">${i.kategori==='masuk'?'Masuk':'Keluar'}</span><span class="stok-item-title">${i.keterangan}</span><button onclick="hapusKasPribadi('${i.id}')" class="action-btn delete-btn"><i class="fa-solid fa-trash"></i></button></div>
            <div style="display:flex; justify-content:space-between; margin-top:6px; font-size:11px;"><span style="color:var(--text-secondary)">${formatTanggalID(i.tanggal)}</span><span style="font-weight:800; color:${i.kategori==='masuk'?'var(--status-safe)':'var(--status-unsafe)'}">${i.kategori==='masuk'?'+':'-'} ${formatRupiahRingkas(i.nominal)}</span></div>
        </div>
    `).join('');
};

/* ========================================================== */
/* BROADCAST WHATSAPP & BANNER STORY                          */
/* ========================================================== */
window.broadcastStokWA = function() {
    const isShowcaseOpen = document.getElementById('store-showcase-modal')?.classList.contains('show');
    const sourceList = (isShowcaseOpen && typeof getFilteredShowcaseItems === 'function') 
        ? getFilteredShowcaseItems() 
        : daftarStokMasuk;

    if (sourceList.length === 0) {
        showToast('Info', 'Belum ada stok ready untuk dibagikan.', false);
        return;
    }

    let text = `🔥 *STOK READY NP - GALERY HARI INI* 🔥\n`;
    text += `📅 Update: ${new Date().toLocaleDateString('id-ID')}\n`;
    text += `📍 Unit Berkualitas, Bergaransi, & Siap Pakai!\n`;
    text += `───────────────────────\n\n`;

    sourceList.forEach((item, idx) => {
        let hargaDisplayNum = parseRawToNumeric(item.hargaDisplay);
        let hargaJualNum = parseRawToNumeric(item.hargaJual);
        let hargaTampil = 'Chat Admin';
        if (hargaDisplayNum) {
            hargaTampil = formatRupiahLengkap(hargaDisplayNum);
        } else if (hargaJualNum) {
            hargaTampil = formatRupiahLengkap(hargaJualNum);
        }
        let negoInfo = (item.isNego && hargaTampil !== 'Chat Admin') ? ' (Bisa Nego)' : '';

        text += `${idx + 1}. *${item.produk}*\n`;
        text += `   • Kondisi: ${item.kondisi}\n`;
        text += `   • Kelengkapan: ${item.kelengkapan}\n`;
        text += `   • Harga: *${hargaTampil}*${negoInfo}\n\n`;
    });

    text += `───────────────────────\n`;
    text += `⚡ Minat? Langsung kontak ke admin sekarang!\n`;
    text += `📱 NP - Galery Smartphone`;

    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('Tersalin!', 'Format broadcast disalin.');
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
    const isShowcaseOpen = document.getElementById('store-showcase-modal')?.classList.contains('show');
    const sourceList = (isShowcaseOpen && typeof getFilteredShowcaseItems === 'function') 
        ? getFilteredShowcaseItems() 
        : daftarStokMasuk;

    let itemsHtml = sourceList.slice(0, 8).map((item) => {
        let hargaDisplayNum = parseRawToNumeric(item.hargaDisplay);
        let hargaJualNum = parseRawToNumeric(item.hargaJual);
        let hargaTampil = 'Ready Siap Pakai';
        if (hargaDisplayNum) {
            hargaTampil = formatRupiahLengkap(hargaDisplayNum);
        } else if (hargaJualNum) {
            hargaTampil = formatRupiahLengkap(hargaJualNum);
        }

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
                <span class="story-units-count">${sourceList.length} Unit Pilihan</span>
            </div>

            <div class="story-items-container">
                ${itemsHtml}
            </div>

            <div class="story-footer">
                <span class="story-footer-info">Garansi Toko • Siap COD / Antar</span>
                <span class="story-contact-badge"><i class="fa-brands fa-whatsapp"></i> Chat Admin</span>
            </div>
        </div>
    `;
}

window.previewStoryBanner = function() {
    const isShowcaseOpen = document.getElementById('store-showcase-modal')?.classList.contains('show');
    const sourceList = (isShowcaseOpen && typeof getFilteredShowcaseItems === 'function') 
        ? getFilteredShowcaseItems() 
        : daftarStokMasuk;

    if (sourceList.length === 0) {
        showToast('Info', 'Belum ada stok ready untuk dibuat banner.', false);
        return;
    }

    const previewBody = document.getElementById('story-preview-body');
    if (!previewBody) return;

    previewBody.innerHTML = generateStoryBannerHTML();
    toggleModal('story-preview-modal', true);
};

window.closeStoryPreview = function() {
    toggleModal('story-preview-modal', false);
};

window.executeDownloadStoryBanner = function() {
    const canvasElem = document.getElementById('story-banner-canvas');
    if (!canvasElem || !window.html2canvas) {
        showToast('Gagal', 'Library gambar belum siap.', false);
        return;
    }

    canvasElem.innerHTML = generateStoryBannerHTML();

    html2canvas(canvasElem, { scale: 2, backgroundColor: '#F0F9FF', useCORS: true }).then(canvas => {
        let link = document.createElement('a');
        link.download = `NPGalery_KatalogStory_${new Date().toISOString().slice(0, 10)}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showToast('Berhasil!', 'Banner story diunduh.');
        closeStoryPreview();
    });
};
/* ========================================================== */
/* V12 — HOME ETALASE LAYERED CAROUSEL                       */
/* ========================================================== */
let npHomeShowcaseIndex = 0;
let npHomeShowcaseItems = [];
let npHomeShowcaseStartX = null;
let npHomeShowcaseDeltaX = 0;

function renderHomeShowcase() {
    const root = document.getElementById('np-home-showcase');
    const dots = document.getElementById('np-showcase-dots');
    if (!root) return;

    npHomeShowcaseItems = Array.isArray(daftarStokMasuk) ? daftarStokMasuk.slice(0, 5) : [];
    if (npHomeShowcaseIndex >= npHomeShowcaseItems.length) npHomeShowcaseIndex = Math.max(0, npHomeShowcaseItems.length - 1);

    if (!npHomeShowcaseItems.length) {
        root.innerHTML = '<div class="np-showcase-empty"><span><i class="fa-solid fa-box-open" style="margin-right:6px;"></i>Belum ada unit tersedia</span></div>';
        if (dots) dots.innerHTML = '';
        return;
    }

    root.innerHTML = npHomeShowcaseItems.map((item, index) => {
        const brand = (item.produk || '').split(' ')[0].toUpperCase();
        const model = (item.produk || '').split(' ').slice(1).join(' ') || item.produk || 'Unit';
        const img = item.imageUrl || 'logo-np.jpg';
        const hargaDisplayNum = parseRawToNumeric(item.hargaDisplay);
        const hargaJualNum = parseRawToNumeric(item.hargaJual);
        const harga = hargaDisplayNum ? formatRupiahLengkap(hargaDisplayNum) : (hargaJualNum ? formatRupiahLengkap(hargaJualNum) : 'Chat Admin');
        const kondisi = item.kondisi || 'Tersedia';
        const detail = item.kelengkapan || 'Unit ready';
        return `
            <article class="np-showcase-card" data-index="${index}" data-pos="${index - npHomeShowcaseIndex}" onclick="openShowcaseDetail('${item.id}')" aria-label="${item.produk || 'Unit'}">
                <div class="np-showcase-photo">
                    <img src="${img}" alt="${item.produk || 'Unit'}" loading="lazy" onerror="this.src='logo-np.jpg';">
                </div>
                <div class="np-showcase-info">
                    <div class="np-showcase-meta"><span class="np-showcase-brand">${brand}</span><span class="np-showcase-condition">${kondisi}</span></div>
                    <h4 class="np-showcase-name">${model}</h4>
                    <div class="np-showcase-detail">${detail}</div>
                    <strong class="np-showcase-price">${harga}</strong>
                </div>
            </article>
        `;
    }).join('');

    if (dots) dots.innerHTML = npHomeShowcaseItems.map((_, i) => `<span class="np-showcase-dot ${i === npHomeShowcaseIndex ? 'active' : ''}"></span>`).join('');
}

function updateHomeShowcasePositions() {
    const cards = document.querySelectorAll('#np-home-showcase .np-showcase-card');
    cards.forEach(card => {
        const pos = Number(card.dataset.index) - npHomeShowcaseIndex;
        card.dataset.pos = String(pos);
    });
    document.querySelectorAll('#np-showcase-dots .np-showcase-dot').forEach((dot, i) => dot.classList.toggle('active', i === npHomeShowcaseIndex));
}

function moveHomeShowcase(direction) {
    if (!npHomeShowcaseItems.length) return;
    const next = Math.max(0, Math.min(npHomeShowcaseItems.length - 1, npHomeShowcaseIndex + direction));
    if (next === npHomeShowcaseIndex) return;
    npHomeShowcaseIndex = next;
    updateHomeShowcasePositions();
}

(function initHomeShowcaseSwipe() {
    document.addEventListener('DOMContentLoaded', () => {
        renderHomeShowcase();
        const root = document.getElementById('np-home-showcase');
        if (!root) return;
        root.addEventListener('pointerdown', e => { npHomeShowcaseStartX = e.clientX; npHomeShowcaseDeltaX = 0; root.classList.add('is-dragging'); });
        root.addEventListener('pointermove', e => { if (npHomeShowcaseStartX !== null) npHomeShowcaseDeltaX = e.clientX - npHomeShowcaseStartX; });
        const endSwipe = () => {
            if (npHomeShowcaseStartX === null) return;
            if (Math.abs(npHomeShowcaseDeltaX) > 45) moveHomeShowcase(npHomeShowcaseDeltaX < 0 ? 1 : -1);
            npHomeShowcaseStartX = null; npHomeShowcaseDeltaX = 0; root.classList.remove('is-dragging');
        };
        root.addEventListener('pointerup', endSwipe);
        root.addEventListener('pointercancel', endSwipe);
        root.addEventListener('pointerleave', endSwipe);
    });
})();

const _npOriginalUpdateDashboardStats = window.updateDashboardStats || updateDashboardStats;
window.updateDashboardStats = function() {
    _npOriginalUpdateDashboardStats();
    renderHomeShowcase();
};


/* ========================================================== */
/* HEADER STICKY — TRANSPARENT TOP + SUBTLE BLUR ON SCROLL  */
/* ========================================================== */
(function initNpStickyHeader() {
    const apply = () => document.body.classList.toggle('np-header-scrolled', window.scrollY > 8);
    window.addEventListener('scroll', apply, { passive: true });
    document.addEventListener('DOMContentLoaded', apply);
})();
