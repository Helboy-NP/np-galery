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
let daftarProdukRiwayat = [];
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

// MASTER FOTO PRODUK (terpisah dari foto fisik unit)
let masterProductPhotos = new Map();
const MASTER_PRODUCT_PHOTO_TABLE = 'product_reference_images';

// STATE SERTIFIKAT GARANSI DIGITAL AKTIF
let activeWarrantyItemData = null;

// MAPPING LINK RESMI CEK IMEI PER BRAND
const BRAND_IMEI_LINKS = {
    'SAMSUNG': { name: 'Samsung', url: 'https://imeicheck.com/id/samsung-imei-check' },
    'OPPO': { name: 'Oppo', url: 'https://support.oppo.com/id/check/' },
    'XIAOMI': { name: 'Xiaomi', url: 'https://www.mi.com/global/verify' },
    'REDMI': { name: 'Redmi', url: 'https://www.mi.com/global/verify' },
    'POCO': { name: 'POCO', url: 'https://www.mi.com/global/verify' },
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
/* SISTEM INDIKATOR STATUS KONEKSI & REAL-TIME SYNC           */
/* ========================================================== */
let isCloudConnected = false;
let currentConnectionStatus = 'disconnected';
let lastSuccessfulSyncAt = null;

function setConnectionStatus(status) {
    const btn = document.getElementById('btn-connection-status');
    const label = document.getElementById('connection-status-label');
    const icon = document.getElementById('connection-status-icon');
    const summary = document.getElementById('connection-info-summary');
    const databaseValue = document.getElementById('connection-database-value');
    const lastSyncValue = document.getElementById('connection-last-sync');

    currentConnectionStatus = status === 'connected' || status === 'syncing' ? status : 'disconnected';
    if (currentConnectionStatus === 'connected') {
        isCloudConnected = true;
        lastSuccessfulSyncAt = new Date();
    } else if (currentConnectionStatus === 'disconnected') {
        isCloudConnected = false;
    }

    if (btn) {
        btn.classList.remove('status-connected', 'status-disconnected', 'status-syncing');
        btn.classList.add(`status-${currentConnectionStatus}`);
        btn.title = currentConnectionStatus === 'connected' ? 'Koneksi database: Terhubung' : currentConnectionStatus === 'syncing' ? 'Koneksi database: Sedang sinkronisasi' : 'Koneksi database: Offline';
    }

    if (label) label.textContent = currentConnectionStatus === 'connected' ? 'Terhubung' : currentConnectionStatus === 'syncing' ? 'Sinkronisasi' : 'Offline';
    if (icon) {
        const mark = currentConnectionStatus === 'connected' ? '<i class="fa-solid fa-check connection-status-mark"></i>' : currentConnectionStatus === 'syncing' ? '<i class="fa-solid fa-rotate connection-status-mark is-spinning"></i>' : '<i class="fa-solid fa-xmark connection-status-mark"></i>';
        icon.innerHTML = `<i class="fa-solid fa-cloud"></i>${mark}`;
    }
    if (summary) summary.textContent = currentConnectionStatus === 'connected' ? 'Database terhubung' : currentConnectionStatus === 'syncing' ? 'Sedang memperbarui data' : 'Database tidak terhubung';
    if (databaseValue) databaseValue.textContent = currentConnectionStatus === 'connected' ? 'Terhubung' : currentConnectionStatus === 'syncing' ? 'Sinkronisasi...' : 'Offline';
    if (lastSyncValue) lastSyncValue.textContent = lastSuccessfulSyncAt ? lastSuccessfulSyncAt.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : 'Belum tersedia';
    updateConnectionInternetStatus();
}

function updateConnectionInternetStatus() {
    const value = document.getElementById('connection-internet-value');
    if (value) value.textContent = navigator.onLine ? 'Online' : 'Offline';
}

window.toggleConnectionInfo = function(event) {
    event?.stopPropagation();
    const popover = document.getElementById('connection-info-popover');
    const trigger = document.getElementById('btn-connection-status');
    if (!popover || !trigger) return;
    const open = popover.classList.toggle('is-open');
    popover.setAttribute('aria-hidden', open ? 'false' : 'true');
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    updateConnectionInternetStatus();
};

function closeConnectionInfo() {
    const popover = document.getElementById('connection-info-popover');
    const trigger = document.getElementById('btn-connection-status');
    popover?.classList.remove('is-open');
    popover?.setAttribute('aria-hidden', 'true');
    trigger?.setAttribute('aria-expanded', 'false');
}

document.addEventListener('click', (event) => {
    const wrap = document.querySelector('.connection-status-wrap');
    if (wrap && !wrap.contains(event.target)) closeConnectionInfo();
});
window.addEventListener('online', updateConnectionInternetStatus);
window.addEventListener('offline', updateConnectionInternetStatus);

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

    const [{ data: prods, error: errProds }, { data: refPhotos, error: errRefPhotos }] = await Promise.all([
        supabaseClient.from('product').select('*').order('created_at', { ascending: false }),
        supabaseClient.from(MASTER_PRODUCT_PHOTO_TABLE).select('product_id,image_url,updated_at')
    ]);

    if (!errRefPhotos && refPhotos) {
        masterProductPhotos = new Map(refPhotos.map(row => [String(row.product_id), row.image_url || null]));
    } else if (errRefPhotos) {
        // Master foto belum bermigrasi: jangan gunakan foto fisik sebagai foto invoice.
        masterProductPhotos = new Map();
        console.warn('Master Foto Produk belum tersedia:', errRefPhotos.message || errRefPhotos);
    }

    if (!errProds && prods) {
        const mapProduct = p => ({
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
            imageUrl: p.image_url || null,
            status: p.status || 'ready'
        });
        daftarProdukRiwayat = prods.map(mapProduct);
        daftarStokMasuk = daftarProdukRiwayat.filter(p => p.status === 'ready').map(({status, ...item}) => item);

        updateDashboardStats();
        renderTransaksiCompact();
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
            productId: t.product_id || t.id,
            produk: t.product_name,
            invoicePhotoUrl: t.invoice_photo_url || null,
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
        renderDaftarTerjual();
        renderTransaksiCompact();
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
        if (typeof renderPribadiV23 === 'function') renderPribadiV23();
            renderDaftarNotes();
        }
    } catch (e) {
        console.warn('Gagal memuat tabel notes:', e);
    }
}

// SETUP SUPABASE REALTIME
const realtimeSyncTimers = new Map();
function scheduleRealtimeSync(key, fn, delay = 180) {
    const previous = realtimeSyncTimers.get(key);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
        realtimeSyncTimers.delete(key);
        if (navigator.onLine) fn().catch?.(err => console.warn(`Realtime sync ${key} gagal:`, err));
    }, delay);
    realtimeSyncTimers.set(key, timer);
}

function setupSupabaseRealtime() {
    if (!supabaseClient || isPublicWarrantyMode) {
        if (!supabaseClient) setConnectionStatus('disconnected');
        return;
    }

    supabaseClient
        .channel('npgalery-realtime-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pricelist' }, () => scheduleRealtimeSync('pricelist', syncPriceListFromSupabaseOnly))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'product' }, () => scheduleRealtimeSync('product', syncProductsFromSupabaseOnly))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => scheduleRealtimeSync('transactions', syncTransactionsFromSupabaseOnly))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_mutations' }, () => scheduleRealtimeSync('cash_mutations', syncCashFromSupabaseOnly))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, () => scheduleRealtimeSync('notes', syncNotesFromSupabaseOnly))
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                setConnectionStatus('connected');
            } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                setConnectionStatus('disconnected');
            }
        });
}

// Keep the UI responsive when the network changes instead of waiting for a failed request.
window.addEventListener('online', () => {
    setConnectionStatus('syncing');
    scheduleRealtimeSync('network-recovery', syncFromSupabase, 120);
});
window.addEventListener('offline', () => setConnectionStatus('disconnected'));

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
    initDiagnosisInline();
    renderTransaksiCompact();
    // THEME: default tetap Dark agar baseline V1.15 tidak berubah.
    const savedTheme = localStorage.getItem('npgalery_theme') || 'dark';
    applyTheme(savedTheme, false);

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

    await loadDiagnosisData();
    initDiagnosisInline();
    renderTransaksiCompact();
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

        const imgDisplay = item.imageUrl || 'assets/np-phone-hero.svg';
        const negoBadgeHtml = (item.isNego && hargaTampil !== 'Chat Admin') 
            ? `<span class="badge-nego-tag">Bisa Nego</span>` 
            : ``;

        return `
            <div class="showcase-item-card" onclick="openShowcaseDetail('${item.id}')" title="Klik untuk lihat detail unit">
                <div class="showcase-card-img-wrap">
                    <img src="${imgDisplay}" alt="${item.produk}" loading="lazy" onerror="this.onerror=null;this.src='assets/np-phone-hero.svg';">
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
/* POP-UP DETAIL UNIT ETALASE KATALOG                         */
/* ========================================================== */
window.openShowcaseDetail = function(id) {
    const item = daftarStokMasuk.find(s => s.id === id);
    if (!item) return;

    const brand = item.produk.split(' ')[0].toUpperCase();
    const modelName = item.produk.split(' ').slice(1).join(' ') || item.produk;

    const brandBadge = document.getElementById('modal-showcase-brand-badge');
    const photoBox = document.getElementById('modal-showcase-photo-box');
    const photoImg = document.getElementById('modal-showcase-photo-img');
    const modelEl = document.getElementById('modal-showcase-model');
    const kondisiEl = document.getElementById('modal-showcase-kondisi');
    const kelengkapanEl = document.getElementById('modal-showcase-kelengkapan');
    const imeiEl = document.getElementById('modal-showcase-imei');
    const tanggalEl = document.getElementById('modal-showcase-tanggal');
    const hargaEl = document.getElementById('modal-showcase-harga');
    const negoBadgeEl = document.getElementById('modal-showcase-nego-badge');

    if (brandBadge) {
        brandBadge.textContent = brand;
        brandBadge.style.cssText = getBrandStyle(brand);
    }

    if (photoImg && photoBox) {
        photoImg.src = item.imageUrl || 'assets/np-phone-hero.svg';
        photoImg.onerror = function() {
            this.src = 'assets/np-phone-hero.svg';
        };
    }

    if (modelEl) modelEl.textContent = modelName;
    if (kondisiEl) kondisiEl.textContent = item.kondisi;
    if (kelengkapanEl) kelengkapanEl.textContent = item.kelengkapan;
    if (imeiEl) imeiEl.textContent = item.imei || '-';
    if (tanggalEl) tanggalEl.textContent = formatTanggalID(item.tanggal);

    let hargaDisplayNum = parseRawToNumeric(item.hargaDisplay);
    let hargaJualNum = parseRawToNumeric(item.hargaJual);
    let hargaTampil = 'Chat Admin';
    if (hargaDisplayNum) {
        hargaTampil = formatRupiahLengkap(hargaDisplayNum);
    } else if (hargaJualNum) {
        hargaTampil = formatRupiahLengkap(hargaJualNum);
    }

    if (hargaEl) hargaEl.textContent = hargaTampil;

    if (negoBadgeEl) {
        if (item.isNego && hargaTampil !== 'Chat Admin') {
            negoBadgeEl.style.display = 'inline-block';
            negoBadgeEl.textContent = 'Bisa Nego';
        } else {
            negoBadgeEl.style.display = 'none';
        }
    }

    const jualBtn = document.getElementById('modal-showcase-jual');
    if (jualBtn) jualBtn.onclick = () => openSaleNowModal(item.id);

    toggleModal('showcase-detail-modal', true);
};

window.closeShowcaseDetailModal = function() {
    toggleModal('showcase-detail-modal', false);
};

/* ========================================================== */
/* JUAL SEKARANG — ETALASE → TRANSAKSI PENJUALAN             */
/* Menghubungkan tombol detail Etalase ke form transaksi      */
/* ========================================================== */
let activeSaleNowItemId = null;
let activeSaleNowPayment = '';
let saleNowEventsReady = false;

function resetSaleNowForm() {
    const ids = ['np-sale-customer', 'np-sale-phone', 'np-sale-price'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    activeSaleNowPayment = '';
    const paymentLabel = document.getElementById('np-sale-payment-label');
    if (paymentLabel) paymentLabel.textContent = 'Pilih metode pembayaran';
    document.getElementById('np-sale-payment-options')?.classList.remove('is-open');
    const total = document.getElementById('np-sale-total-value');
    if (total) total.textContent = 'Rp 0';
}

function formatSaleNowPriceInput(value) {
    const numeric = parseRawToNumeric(value);
    return numeric !== null && numeric > 0 ? numeric.toLocaleString('id-ID') : '';
}

function setupSaleNowEvents() {
    if (saleNowEventsReady) return;
    saleNowEventsReady = true;

    const paymentTrigger = document.getElementById('np-sale-payment-trigger');
    const paymentOptions = document.getElementById('np-sale-payment-options');
    if (paymentTrigger && paymentOptions) {
        paymentTrigger.onclick = () => paymentOptions.classList.toggle('is-open');
        paymentOptions.querySelectorAll('[data-payment]').forEach(btn => {
            btn.onclick = () => {
                activeSaleNowPayment = btn.dataset.payment || '';
                const label = document.getElementById('np-sale-payment-label');
                if (label) label.textContent = activeSaleNowPayment || 'Pilih metode pembayaran';
                paymentOptions.classList.remove('is-open');
            };
        });
    }

    const priceInput = document.getElementById('np-sale-price');
    const totalValue = document.getElementById('np-sale-total-value');
    if (priceInput) {
        priceInput.addEventListener('input', () => {
            const numeric = parseRawToNumeric(priceInput.value) || 0;
            if (totalValue) totalValue.textContent = formatRupiahLengkap(numeric);
        });
        priceInput.addEventListener('blur', () => {
            const numeric = parseRawToNumeric(priceInput.value) || 0;
            priceInput.value = numeric > 0 ? numeric.toLocaleString('id-ID') : '';
        });
    }

    const confirmBtn = document.getElementById('np-sale-confirm-btn');
    if (confirmBtn) confirmBtn.onclick = processSaleNow;
}

window.closeSaleNowModal = function() {
    toggleModal('np-sale-sheet-modal', false);
    document.getElementById('np-sale-sheet-modal')?.setAttribute('aria-hidden', 'true');
    document.getElementById('np-sale-payment-options')?.classList.remove('is-open');
    activeSaleNowItemId = null;
    activeSaleNowPayment = '';
};

window.openSaleNowModal = function(id) {
    const item = daftarStokMasuk.find(s => String(s.id) === String(id));
    if (!item) {
        showToast('Info', 'Unit tidak ditemukan atau sudah terjual.', false);
        return;
    }

    setupSaleNowEvents();
    activeSaleNowItemId = item.id;
    resetSaleNowForm();

    const brand = item.produk.split(' ')[0].toUpperCase();
    const modelName = item.produk.split(' ').slice(1).join(' ') || item.produk;
    const price = parseRawToNumeric(item.hargaJual) || parseRawToNumeric(item.hargaDisplay) || 0;

    const img = document.getElementById('np-sale-product-image');
    const name = document.getElementById('np-sale-product-name');
    const spec = document.getElementById('np-sale-product-spec');
    const customer = document.getElementById('np-sale-customer');
    const priceInput = document.getElementById('np-sale-price');
    const total = document.getElementById('np-sale-total-value');

    if (img) {
        img.src = item.imageUrl || 'assets/np-phone-hero.svg';
        img.onerror = function() { this.onerror = null; this.src = 'assets/np-phone-hero.svg'; };
    }
    if (name) name.textContent = item.produk || '-';
    if (spec) spec.textContent = `${brand} • ${item.kondisi || '-'} • ${item.kelengkapan || '-'}`;
    if (customer) customer.value = item.pembeli || '';
    if (priceInput) priceInput.value = price > 0 ? price.toLocaleString('id-ID') : '';
    if (total) total.textContent = formatRupiahLengkap(price);

    toggleModal('showcase-detail-modal', false);
    toggleModal('np-sale-sheet-modal', true);
    document.getElementById('np-sale-sheet-modal')?.setAttribute('aria-hidden', 'false');
    setTimeout(() => document.getElementById('np-sale-customer')?.focus(), 120);
};

async function processSaleNow() {
    const id = activeSaleNowItemId;
    const item = daftarStokMasuk.find(s => String(s.id) === String(id));
    if (!item) {
        showToast('Info', 'Unit tidak ditemukan atau sudah terjual.', false);
        return;
    }

    const customer = document.getElementById('np-sale-customer')?.value.trim() || '';
    const phone = document.getElementById('np-sale-phone')?.value.trim() || '';
    const price = parseRawToNumeric(document.getElementById('np-sale-price')?.value) || 0;
    const payment = activeSaleNowPayment || '';

    if (!customer) return showToast('Periksa Data', 'Nama pembeli wajib diisi.', false);
    if (!price || price <= 0) return showToast('Periksa Data', 'Harga penjualan wajib diisi.', false);
    if (!payment) return showToast('Periksa Data', 'Pilih metode pembayaran terlebih dahulu.', false);

    const confirmBtn = document.getElementById('np-sale-confirm-btn');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Memproses...</span>';
    }

    const now = new Date();
    const tgl = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const modalPrice = parseRawToNumeric(item.hargaModal) || 0;
    const profit = price - modalPrice;
    const kasId = 'kas-' + Date.now();
    const invoicePhotoUrl = await getMasterProductPhoto(item.id);
    const transactionPayload = {
        id: item.id,
        product_id: item.id,
        product_name: item.produk,
        invoice_photo_url: invoicePhotoUrl || null,
        condition: item.kondisi,
        completeness: item.kelengkapan,
        imei: item.imei,
        qty: parseInt(item.qty) || 1,
        buy_price: modalPrice,
        sell_price: price,
        customer_name: customer,
        customer_phone: phone,
        payment_method: payment,
        profit,
        sold_date: tgl,
        modal_status: 'belum'
    };

    try {
        setConnectionStatus('syncing');
        if (!supabaseClient) throw new Error('Koneksi database tidak tersedia.');

        /* Simpan transaksi dulu. Jika kolom tambahan belum ada, fallback ke struktur lama. */
        let { error: trxError } = await supabaseClient.from('transactions').insert([transactionPayload]);
        if (trxError) {
            const legacyPayload = { ...transactionPayload };
            delete legacyPayload.customer_phone;
            delete legacyPayload.payment_method;
            delete legacyPayload.product_id;
            delete legacyPayload.invoice_photo_url;
            const legacyResult = await supabaseClient.from('transactions').insert([legacyPayload]);
            if (legacyResult.error) throw legacyResult.error;
            console.warn('Kolom detail pembayaran/telepon belum tersedia; transaksi disimpan dengan struktur kompatibilitas V2.5.');
        }

        const { error: productError } = await supabaseClient.from('product').update({
            status: 'sold',
            sell_price: price,
            buyer: customer
        }).eq('id', item.id);
        if (productError) {
            await supabaseClient.from('transactions').delete().eq('id', item.id);
            throw productError;
        }

        if (profit > 0) {
            const { error: cashError } = await supabaseClient.from('cash_mutations').insert([{
                id: kasId,
                description: `Laba Jual: ${item.produk}`,
                type: 'masuk',
                amount: profit,
                date: tgl
            }]);
            if (cashError) console.warn('Laba belum masuk ke kas:', cashError);
        }

        item.pembeli = customer;
        item.hargaJual = String(price);
        item.tanggalTerjualRaw = tgl;
        item.modalStatus = 'belum';
        item.phonePembeli = phone;
        item.metodePembayaran = payment;

        daftarStokMasuk = daftarStokMasuk.filter(s => String(s.id) !== String(id));
        const historyItem = daftarProdukRiwayat.find(s => String(s.id) === String(id));
        if (historyItem) {
            historyItem.status = 'sold';
            historyItem.pembeli = customer;
            historyItem.hargaJual = String(price);
        }
        daftarTerjual.unshift({ ...item, productId: item.id, invoicePhotoUrl: invoicePhotoUrl || null });
        if (profit > 0) {
            daftarKasPribadi.unshift({ id: kasId, keterangan: `Laba Jual: ${item.produk}`, kategori: 'masuk', nominal: profit, tanggal: tgl });
        }

        renderDaftarTerjual();
        renderDaftarModal();
        renderManajemenKas();
        updateDashboardStats();
        updatePribadiStats();
        initShowcaseBrandDropdown();
        renderStoreShowcase();
        renderHomeShowcase();

        setConnectionStatus('connected');
        closeSaleNowModal();
        showToast('Berhasil', 'Unit terjual dan transaksi tercatat.');
        openInvoiceModal({ ...item, productId: item.id, invoicePhotoUrl: invoicePhotoUrl || null });
    } catch (err) {
        console.warn('Gagal memproses Jual Sekarang:', err);
        setConnectionStatus('disconnected');
        showToast('Gagal', 'Terjadi kendala saat menyimpan transaksi. Unit belum diubah menjadi terjual.', false);
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fa-solid fa-check"></i><span>Konfirmasi Penjualan</span>';
        }
    }
}


/* ========================================================== */
/* PRIBADI V2.3 — PROFILE & MULTI PERSONAL NOTES              */
/* ========================================================== */
let activePersonalNoteId = null;
let activeDetailNoteId = null;

function getPrimaryPersonalNote() {
    if (!Array.isArray(daftarNotes) || daftarNotes.length === 0) return null;
    return daftarNotes[0] || null;
}

window.renderPribadiV23 = function() {
    const nameEl = document.getElementById('pribadi-profile-name');
    const roleEl = document.getElementById('pribadi-profile-role');
    const saved = JSON.parse(localStorage.getItem('npgalery_profile') || 'null');
    if (nameEl) nameEl.textContent = saved?.name || 'Pengguna NP_Galery';
    if (roleEl) roleEl.textContent = saved?.role || 'Pemilik / Admin';

    const titleEl = document.getElementById('pribadi-note-title');
    const previewEl = document.getElementById('pribadi-note-preview');
    const count = Array.isArray(daftarNotes) ? daftarNotes.length : 0;
    if (titleEl) titleEl.textContent = 'Daftar Catatan';
    if (previewEl) previewEl.textContent = count ? `${count} catatan tersimpan` : 'Belum ada catatan tersimpan';

    const themeIcon = document.getElementById('pribadi-theme-icon');
    const themeLabel = document.getElementById('pribadi-theme-label');
    const dark = document.body.classList.contains('dark-mode');
    if (themeIcon) { themeIcon.classList.toggle('fa-moon', !dark); themeIcon.classList.toggle('fa-sun', dark); }
    if (themeLabel) themeLabel.textContent = dark ? 'Mode gelap aktif' : 'Mode terang aktif';
};

window.openProfileEditor = function() {
    const saved = JSON.parse(localStorage.getItem('npgalery_profile') || 'null') || {};
    const n = document.getElementById('pribadi-profile-name-input');
    const r = document.getElementById('pribadi-profile-role-input');
    if (n) n.value = saved.name || '';
    if (r) r.value = saved.role || '';
    toggleModal('profile-editor-modal', true);
};
window.closeProfileEditor = function() { toggleModal('profile-editor-modal', false); };
window.savePribadiProfile = function() {
    const name = document.getElementById('pribadi-profile-name-input')?.value.trim() || 'Pengguna NP_Galery';
    const role = document.getElementById('pribadi-profile-role-input')?.value.trim() || 'Pemilik / Admin';
    localStorage.setItem('npgalery_profile', JSON.stringify({name, role}));
    renderPribadiV23();
    closeProfileEditor();
};

window.openPersonalNoteSheet = function(id) {
    const note = daftarNotes.find(n => n.id === id);
    if (!note) { if (daftarNotes.length === 0) openAddNoteModal(); return; }
    activePersonalNoteId = note.id;
    activeDetailNoteId = note.id;
    const title = document.getElementById('inline-note-title-input');
    const content = document.getElementById('inline-note-content-input');
    if (title) title.value = note.title || '';
    if (content) content.value = note.content || '';
    const titleView = document.getElementById('inline-note-title');
    const contentView = document.getElementById('inline-note-content');
    if (titleView) titleView.textContent = note.title || 'Catatan';
    if (contentView) contentView.textContent = note.content || 'Belum ada isi catatan.';
    const empty = document.getElementById('pribadi-inline-detail-empty');
    const detail = document.getElementById('pribadi-inline-detail-content');
    const view = document.getElementById('personal-note-inline-view');
    const edit = document.getElementById('personal-note-inline-edit');
    const viewActions = document.getElementById('inline-note-view-actions');
    const editActions = document.getElementById('inline-note-edit-actions');
    if (empty) empty.hidden = true;
    if (detail) detail.hidden = false;
    if (view) view.hidden = false;
    if (edit) edit.hidden = true;
    if (viewActions) viewActions.hidden = false;
    if (editActions) editActions.hidden = true;
    renderDaftarNotes();
};
window.closePersonalNoteSheet = function() {
    activePersonalNoteId = null;
    activeDetailNoteId = null;
    const empty = document.getElementById('pribadi-inline-detail-empty');
    const detail = document.getElementById('pribadi-inline-detail-content');
    if (empty) empty.hidden = false;
    if (detail) detail.hidden = true;
};

window.bukaEditCatatanDariDetail = function() {
    const note = daftarNotes.find(n => n.id === activeDetailNoteId);
    if (!note) return;
    const view = document.getElementById('personal-note-inline-view');
    const edit = document.getElementById('personal-note-inline-edit');
    const viewActions = document.getElementById('inline-note-view-actions');
    const editActions = document.getElementById('inline-note-edit-actions');
    if (view) view.hidden = true;
    if (edit) edit.hidden = false;
    if (viewActions) viewActions.hidden = true;
    if (editActions) editActions.hidden = false;
    document.getElementById('inline-note-title-input')?.focus();
};
window.batalEditCatatanDetail = function() { openPersonalNoteSheet(activeDetailNoteId); };
window.simpanEditCatatanDetail = async function() {
    const id = activeDetailNoteId;
    if (!id) return;
    const note = daftarNotes.find(n => n.id === id);
    if (!note) return;
    const title = document.getElementById('inline-note-title-input')?.value.trim() || 'Catatan Baru';
    const content = document.getElementById('inline-note-content-input')?.value.trim() || '';
    if (!title && !content) { showToast('Peringatan', 'Judul atau isi catatan tidak boleh kosong!', false); return; }
    if (!supabaseClient) { showToast('Gagal', 'Koneksi data belum tersedia.', false); return; }
    setConnectionStatus('syncing');
    try {
        const { error } = await supabaseClient.from('notes').update({title, content}).eq('id', id);
        if (error) throw error;
        note.title = title; note.content = content;
        renderDaftarNotes();
        openPersonalNoteSheet(id);
        setConnectionStatus('connected');
        showToast('Berhasil', 'Catatan berhasil diperbarui.');
    } catch (e) {
        console.warn('Gagal menyimpan catatan:', e);
        setConnectionStatus('disconnected');
        showToast('Gagal', 'Catatan tidak dapat diperbarui.', false);
    }
};
window.savePersonalNote = window.simpanEditCatatanDetail;
window.salinCatatanAktif = function() { if (activeDetailNoteId) salinCatatan(activeDetailNoteId); };
window.hapusCatatanAktif = function() {
    if (!activeDetailNoteId) return;
    const id = activeDetailNoteId;
    showCustomConfirm('Hapus Catatan', 'Yakin ingin menghapus catatan ini?', async () => {
        if (!supabaseClient) { showToast('Gagal', 'Koneksi data belum tersedia.', false); return; }
        setConnectionStatus('syncing');
        try {
            const { error } = await supabaseClient.from('notes').delete().eq('id', id);
            if (error) throw error;
            daftarNotes = daftarNotes.filter(n => n.id !== id);
            closePersonalNoteSheet();
            renderDaftarNotes();
            setConnectionStatus('connected');
            showToast('Berhasil', 'Catatan telah dihapus.');
        } catch (e) {
            console.warn('Gagal menghapus catatan:', e);
            setConnectionStatus('disconnected');
            showToast('Gagal', 'Gagal menghapus catatan.', false);
        }
    });
};

/* ========================================================== */
/* FITUR MANAJEMEN NOTES                                      */
/* ========================================================== */
window.openAddNoteModal = function() {
    toggleModal('add-note-modal', true);
};

window.closeAddNoteModal = function() {
    toggleModal('add-note-modal', false);
};

window.openDaftarNotesModal = function() {
    renderDaftarNotes();
    const pribadi = document.getElementById('section-pribadi');
    const notesPage = document.getElementById('section-pribadi-notes');
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (notesPage) notesPage.classList.add('active');
    if (pribadi) pribadi.classList.remove('active');
    window.scrollTo({ top: 0, behavior: 'auto' });
};

window.closeDaftarNotesModal = function() {
    const pribadi = document.getElementById('section-pribadi');
    const notesPage = document.getElementById('section-pribadi-notes');
    if (notesPage) notesPage.classList.remove('active');
    if (pribadi) pribadi.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'auto' });
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

    const textToCopy = note.content || '';

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
    const pageContainer = document.getElementById('notes-page-container');
    const fullCount = document.getElementById('full-notes-count');
    if (!container && !pageContainer) return;
    const notes = Array.isArray(daftarNotes) ? daftarNotes : [];
    if (badge) badge.textContent = `${notes.length}`;
    if (fullCount) fullCount.textContent = `${notes.length} catatan`;
    const renderEmpty = `<div class="empty-stok-msg">Belum ada catatan tersimpan.</div>`;
    if (notes.length === 0) {
        if (container) container.innerHTML = renderEmpty;
        if (pageContainer) pageContainer.innerHTML = renderEmpty;
        if (typeof renderPribadiV23 === 'function') renderPribadiV23();
        return;
    }
    const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
    const html = notes.map(n => `
        <button type="button" class="note-item-card note-item-card-clickable" onclick="openPersonalNoteSheet('${String(n.id).replace(/'/g, "\\'")}')" aria-label="Buka catatan ${esc(n.title || 'Catatan')}">
            <span class="note-list-title-row">
                <span class="stok-item-title">${esc(n.title || 'Catatan')}</span>
                <i class="fa-solid fa-chevron-right note-list-arrow" aria-hidden="true"></i>
            </span>
        </button>
    `).join('');
    if (container) container.innerHTML = html;
    if (pageContainer) pageContainer.innerHTML = html;
    if (typeof renderPribadiV23 === 'function') renderPribadiV23();
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
};

window.closeAddStokModal = function() {
    removeStockPhotoSelection();
    toggleModal('add-stok-modal', false);
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
window.openRiwayatJualModal = function() {
    renderDaftarTerjual();
    toggleModal('riwayat-jual-modal', true);
};

window.closeRiwayatJualModal = function() {
    toggleModal('riwayat-jual-modal', false);
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
};

window.closeDirectWaModal = function() {
    toggleModal('direct-wa-modal', false);
};

window.submitDirectWa = function() {
    let phone = document.getElementById('input-direct-wa-phone').value.trim();
    let msg = document.getElementById('input-direct-wa-msg').value.trim();

    if (!phone) {
        showToast('Peringatan', 'Masukkan nomor WhatsApp terlebih dahulu!', false);
        return;
    }

    phone = phone.replace(/[^0-9]/g, '');
    if (phone.startsWith('0')) phone = '62' + phone.substring(1);

    let url = `https://api.whatsapp.com/send?phone=${phone}`;
    if (msg) url += `&text=${encodeURIComponent(msg)}`;

    window.open(url, '_blank');
    closeDirectWaModal();
};

/* ========================================================== */
/* TRANSAKSI + DIAGNOSIS INLINE                               */
/* ========================================================== */
const NP_DIAGNOSIS_BRANDS = [
    { key: 'SAMSUNG', name: 'Samsung', logo: 'https://cdn.simpleicons.org/samsung/1428A0' },
    { key: 'OPPO', name: 'OPPO', logo: 'https://cdn.simpleicons.org/oppo/1FA637' },
    { key: 'XIAOMI', name: 'Xiaomi', logo: 'https://cdn.simpleicons.org/xiaomi/FF6900' },
    { key: 'REDMI', name: 'Redmi', logo: 'https://cdn.simpleicons.org/redmi/FF6900' },
    { key: 'POCO', name: 'POCO', logo: 'https://cdn.simpleicons.org/poco/FFD600' },
    { key: 'VIVO', name: 'Vivo', logo: 'https://cdn.simpleicons.org/vivo/415FFF' },
    { key: 'REALME', name: 'realme', logo: 'https://cdn.simpleicons.org/realme/FFC915' },
    { key: 'INFINIX', name: 'Infinix', logo: 'https://cdn.simpleicons.org/infinix/000000' },
    { key: 'TECNO', name: 'TECNO', logo: 'https://cdn.simpleicons.org/tecno/000000' },
    { key: 'ITEL', name: 'itel', logo: 'https://cdn.simpleicons.org/itel/00AEEF' }
];
let activeDiagnosisBrand = 'SAMSUNG';
let activeTransaksiFilter = 'semua';

function escapeHtmlNP(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch]));
}

function npFormatDateShort(value) {
    if (!value) return '-';
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return String(value);
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return `${m[3]} ${months[Number(m[2])-1] || m[2]} ${m[1].slice(-2)}`;
}

function getNpTransactionRows() {
    const masuk = daftarProdukRiwayat.map(i => ({
        type: 'masuk', id: i.id, produk: i.produk || '-', imei: i.imei || '-',
        harga: parseRawToNumeric(i.hargaModal) || 0, tanggal: i.tanggal || '',
        source: i
    }));
    const keluar = daftarTerjual.map(i => ({
        type: 'keluar', id: i.id, produk: i.produk || '-', imei: i.imei || '-',
        harga: parseRawToNumeric(i.hargaJual) || 0, tanggal: i.tanggalTerjualRaw || i.tanggal || '',
        source: i
    }));
    let rows = activeTransaksiFilter === 'masuk' ? masuk : activeTransaksiFilter === 'keluar' ? keluar : [...masuk, ...keluar];
    return rows.sort((a,b) => String(b.tanggal).localeCompare(String(a.tanggal)));
}

window.renderTransaksiCompact = function() {
    const el = document.getElementById('np-transaksi-list');
    if (!el) return;
    const rows = getNpTransactionRows();
    if (!rows.length) {
        el.innerHTML = `<div class="np-trx-empty">Belum ada transaksi ${activeTransaksiFilter === 'masuk' ? 'masuk' : activeTransaksiFilter === 'keluar' ? 'keluar' : ''}.</div>`;
        return;
    }
    el.innerHTML = rows.map(row => {
        const safeId = encodeURIComponent(String(row.id));
        const icon = row.type === 'masuk' ? '↓' : '↑';
        const price = formatRupiahRingkas(row.harga);
        const actionLabel = row.type === 'masuk' ? 'Edit transaksi masuk' : 'Edit transaksi keluar';
        return `<div class="np-trx-row" data-type="${row.type}" data-id="${escapeHtmlNP(row.id)}">
            <button class="np-trx-main-hit" type="button" onclick="${row.type === 'masuk' ? `editNpTransaction('masuk','${safeId}')` : `openInvoiceFromCenter('${safeId}')`}" aria-label="Buka detail ${escapeHtmlNP(row.produk)}">
                <span class="np-trx-type ${row.type}" aria-hidden="true">${icon}</span>
                <span class="np-trx-main"><span class="np-trx-product">${escapeHtmlNP(row.produk)}</span><span class="np-trx-meta">IMEI ••••${escapeHtmlNP(String(row.imei).slice(-4))}</span></span>
                <span class="np-trx-price-wrap"><span class="np-trx-price">${escapeHtmlNP(price)}</span><span class="np-trx-date">${escapeHtmlNP(npFormatDateShort(row.tanggal))}</span></span>
            </button>
            <span class="np-trx-actions">
                <button class="np-trx-action edit" type="button" onclick="editNpTransaction('${row.type}','${safeId}')" title="${actionLabel}" aria-label="${actionLabel}"><i class="fa-solid fa-pen"></i></button>
                <button class="np-trx-action delete" type="button" onclick="deleteNpTransaction('${row.type}','${safeId}')" title="Hapus transaksi" aria-label="Hapus transaksi"><i class="fa-solid fa-trash"></i></button>
            </span>
        </div>`;
    }).join('');
};

function ensureNpTransactionEditModal() {
    if (document.getElementById('np-trx-edit-modal')) return;
    document.body.insertAdjacentHTML('beforeend', `<div class="custom-modal-overlay np-trx-edit-modal" id="np-trx-edit-modal" aria-hidden="true">
        <div class="np-trx-edit-card">
            <div class="np-trx-edit-head"><div><span class="np-kicker">TRANSAKSI</span><h3 id="np-trx-edit-title">Edit Transaksi</h3></div><button type="button" class="np-trx-edit-close" onclick="closeNpTransactionEdit()" aria-label="Tutup">×</button></div>
            <div class="np-trx-edit-grid">
                <label>Produk<input id="np-trx-edit-produk" type="text"></label>
                <label>IMEI<input id="np-trx-edit-imei" type="text"></label>
                <label>Tanggal<input id="np-trx-edit-tanggal" type="date"></label>
                <label>Harga<input id="np-trx-edit-harga" type="text"></label>
                <label class="np-trx-edit-extra" id="np-trx-edit-pembeli-wrap">Pembeli<input id="np-trx-edit-pembeli" type="text"></label>
            </div>
            <div class="np-trx-edit-foot"><button type="button" class="np-trx-edit-cancel" onclick="closeNpTransactionEdit()">Batal</button><button type="button" class="np-trx-edit-save" onclick="saveNpTransactionEdit()">Simpan Perubahan</button></div>
        </div>
    </div>`);
}
let activeNpTransactionEdit = null;
window.editNpTransaction = function(type, encodedId) {
    const id = decodeURIComponent(String(encodedId || ''));
    const item = type === 'masuk' ? daftarProdukRiwayat.find(x => String(x.id) === id) : daftarTerjual.find(x => String(x.id) === id);
    if (!item) return showToast('Info', 'Data transaksi tidak ditemukan.', false);
    ensureNpTransactionEditModal();
    activeNpTransactionEdit = {type, id};
    document.getElementById('np-trx-edit-title').textContent = type === 'masuk' ? 'Edit Transaksi Masuk' : 'Edit Transaksi Keluar';
    document.getElementById('np-trx-edit-produk').value = item.produk || '';
    document.getElementById('np-trx-edit-imei').value = item.imei || '';
    document.getElementById('np-trx-edit-tanggal').value = type === 'masuk' ? (item.tanggal || '') : (item.tanggalTerjualRaw || item.tanggal || '');
    document.getElementById('np-trx-edit-harga').value = String(type === 'masuk' ? (parseRawToNumeric(item.hargaModal) || 0) : (parseRawToNumeric(item.hargaJual) || 0));
    document.getElementById('np-trx-edit-pembeli').value = item.pembeli || '';
    document.getElementById('np-trx-edit-pembeli-wrap').style.display = type === 'keluar' ? 'block' : 'none';
    toggleModal('np-trx-edit-modal', true);
    document.getElementById('np-trx-edit-modal').setAttribute('aria-hidden','false');
};
window.closeNpTransactionEdit = function() { toggleModal('np-trx-edit-modal', false); document.getElementById('np-trx-edit-modal')?.setAttribute('aria-hidden','true'); activeNpTransactionEdit = null; };
window.saveNpTransactionEdit = async function() {
    if (!activeNpTransactionEdit) return;
    const {type,id} = activeNpTransactionEdit;
    const produk = document.getElementById('np-trx-edit-produk').value.trim();
    const imei = document.getElementById('np-trx-edit-imei').value.trim() || '-';
    const tanggal = document.getElementById('np-trx-edit-tanggal').value;
    const harga = parseRawToNumeric(document.getElementById('np-trx-edit-harga').value) || 0;
    const pembeli = document.getElementById('np-trx-edit-pembeli').value.trim();
    if (!produk || !tanggal) return showToast('Periksa Data', 'Produk dan tanggal wajib diisi.', false);
    try {
        setConnectionStatus('syncing');
        if (type === 'masuk') {
            const item = daftarProdukRiwayat.find(x => String(x.id) === id);
            if (!item) throw new Error('Produk tidak ditemukan');
            if (supabaseClient) {
                const {error} = await supabaseClient.from('product').update({name:produk, imei, buy_price:harga, date:tanggal}).eq('id',id);
                if (error) throw error;
            }
            Object.assign(item,{produk,imei,hargaModal:String(harga),tanggal});
            const active = daftarStokMasuk.find(x => String(x.id) === id); if (active) Object.assign(active,{produk,imei,hargaModal:String(harga),tanggal});
        } else {
            const item = daftarTerjual.find(x => String(x.id) === id);
            if (!item) throw new Error('Transaksi tidak ditemukan');
            const profit = harga - (parseRawToNumeric(item.hargaModal) || 0);
            if (supabaseClient) {
                const {error} = await supabaseClient.from('transactions').update({product_name:produk, imei, sell_price:harga, customer_name:pembeli, sold_date:tanggal, profit}).eq('id',id);
                if (error) throw error;
                if (item.productId) await supabaseClient.from('product').update({name:produk, imei, sell_price:harga, buyer:pembeli}).eq('id',item.productId);
            }
            Object.assign(item,{produk,imei,hargaJual:String(harga),pembeli,tanggalTerjualRaw:tanggal});
            const history = daftarProdukRiwayat.find(x => String(x.id) === String(item.productId || id)); if (history) Object.assign(history,{produk,imei,hargaJual:String(harga),pembeli});
        }
        closeNpTransactionEdit();
        renderTransaksiCompact(); renderDaftarTerjual(); updateDashboardStats(); renderHomeShowcase();
        setConnectionStatus('connected'); showToast('Berhasil','Transaksi berhasil diperbarui.');
    } catch(e) { console.warn(e); setConnectionStatus('disconnected'); showToast('Gagal','Perubahan transaksi gagal disimpan.',false); }
};
window.deleteNpTransaction = function(type, encodedId) {
    const id = decodeURIComponent(String(encodedId || ''));
    showCustomConfirm('Hapus Transaksi', type === 'masuk' ? 'Hapus riwayat transaksi masuk ini? Unit juga akan dihapus dari stok.' : 'Hapus transaksi keluar ini? Invoice/riwayat penjualannya juga akan terhapus.', async () => {
        try {
            setConnectionStatus('syncing');
            if (type === 'masuk') {
                if (supabaseClient) { const {error}=await supabaseClient.from('product').delete().eq('id',id); if(error) throw error; }
                daftarProdukRiwayat = daftarProdukRiwayat.filter(x=>String(x.id)!==id); daftarStokMasuk=daftarStokMasuk.filter(x=>String(x.id)!==id);
            } else {
                const soldItem = daftarTerjual.find(x=>String(x.id)===id);
                if (supabaseClient) {
                    const {error}=await supabaseClient.from('transactions').delete().eq('id',id); if(error) throw error;
                    if (soldItem?.productId) {
                        const {error:restoreError}=await supabaseClient.from('product').update({status:'ready', buyer:''}).eq('id',soldItem.productId);
                        if (restoreError) throw restoreError;
                    }
                }
                daftarTerjual=daftarTerjual.filter(x=>String(x.id)!==id);
                if (soldItem?.productId) {
                    const history=daftarProdukRiwayat.find(x=>String(x.id)===String(soldItem.productId));
                    if (history) { history.status='ready'; history.pembeli=''; history.hargaJual=history.hargaJual || ''; }
                    if (history && !daftarStokMasuk.some(x=>String(x.id)===String(history.id))) {
                        const {status,...activeItem}=history; daftarStokMasuk.unshift({...activeItem});
                    }
                }
            }
            renderTransaksiCompact(); renderDaftarTerjual(); updateDashboardStats(); renderHomeShowcase();
            setConnectionStatus('connected'); showToast('Berhasil','Transaksi berhasil dihapus.');
        } catch(e) { console.warn(e); setConnectionStatus('disconnected'); showToast('Gagal','Transaksi gagal dihapus.',false); }
    });
};

window.setTransaksiFilter = function(filter) {
    activeTransaksiFilter = ['semua','masuk','keluar'].includes(filter) ? filter : 'semua';
    document.querySelectorAll('.np-trx-filter').forEach(btn => btn.classList.toggle('active', btn.dataset.filter === activeTransaksiFilter));
    renderTransaksiCompact();
};

window.switchTransaksiSubTab = function(tab) {
    const isDiag = tab === 'diagnosis';
    document.getElementById('sub-transaksi')?.classList.toggle('active', !isDiag);
    document.getElementById('sub-diagnosis')?.classList.toggle('active', isDiag);
    document.getElementById('tab-transaksi-list')?.classList.toggle('active', !isDiag);
    document.getElementById('tab-diagnosis-list')?.classList.toggle('active', isDiag);
    document.getElementById('tab-transaksi-list')?.setAttribute('aria-selected', String(!isDiag));
    document.getElementById('tab-diagnosis-list')?.setAttribute('aria-selected', String(isDiag));
    if (isDiag) renderDiagnosisInline();
};

function getDiagnosisBrandData(key) {
    let actual = key;
    if (key === 'REDMI' || key === 'POCO') actual = key.charAt(0) + key.slice(1).toLowerCase();
    const obj = rawDiagnosisData.find(b => String(b.brand).toUpperCase() === actual);
    if (obj) return obj;
    if (key === 'REDMI' || key === 'POCO') return rawDiagnosisData.find(b => String(b.brand).toUpperCase() === 'XIAOMI');
    return null;
}

function renderDiagnosisBrandSelector() {
    const el = document.getElementById('diagnosis-brand-selector');
    if (!el) return;

    // Render brand buttons only once. Rebuilding innerHTML on every click caused
    // image/font elements to be destroyed and recreated, producing a visible blink.
    if (!el.dataset.initialized) {
        const frag = document.createDocumentFragment();
        NP_DIAGNOSIS_BRANDS.forEach(b => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `np-brand-logo-btn brand-${b.key.toLowerCase()}`;
            btn.setAttribute('aria-label', b.name);
            btn.dataset.brand = b.key;
            btn.addEventListener('click', () => window.selectDiagnosisBrand(b.key));

            const img = document.createElement('img');
            img.src = b.logo;
            img.alt = `${b.name} logo`;
            img.loading = 'lazy';
            img.decoding = 'async';
            img.onerror = function() {
                this.style.display = 'none';
                const fallback = this.nextElementSibling;
                if (fallback) fallback.style.display = 'block';
            };

            const fallback = document.createElement('span');
            fallback.className = 'np-brand-logo-fallback';
            fallback.style.display = 'none';
            fallback.textContent = b.name;

            btn.append(img, fallback);
            frag.appendChild(btn);
        });
        el.replaceChildren(frag);
        el.dataset.initialized = 'true';
    }

    // Change only classes/ARIA state; never recreate the logo DOM nodes.
    el.querySelectorAll('.np-brand-logo-btn').forEach(btn => {
        const isActive = btn.dataset.brand === activeDiagnosisBrand;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', String(isActive));
    });
}

window.selectDiagnosisBrand = function(key) {
    if (!NP_DIAGNOSIS_BRANDS.some(b => b.key === key)) return;
    if (activeDiagnosisBrand === key) return;
    activeDiagnosisBrand = key;
    renderDiagnosisBrandSelector();
    renderDiagnosisInline(true);
};

window.copyDiagnosisCode = function(code) {
    navigator.clipboard?.writeText(code).then(() => showToast('Tersalin', `Kode ${code} disalin.`)).catch(() => showToast('Info', 'Clipboard tidak tersedia.', false));
};

function renderDiagnosisInline(animateSwap = false) {
    renderDiagnosisBrandSelector();
    const panel = document.getElementById('np-diagnosis-panel');
    if (!panel) return;
    const brand = NP_DIAGNOSIS_BRANDS.find(b => b.key === activeDiagnosisBrand) || NP_DIAGNOSIS_BRANDS[0];
    const data = getDiagnosisBrandData(activeDiagnosisBrand);
    const codes = data?.codes || [];
    const imei = BRAND_IMEI_LINKS[activeDiagnosisBrand] || BRAND_IMEI_LINKS['XIAOMI'];

    // Build the diagnosis panel only once. Replacing the whole panel on every
    // logo click caused a visible blink while images/fonts were recreated.
    let head = panel.querySelector('.np-diagnosis-panel-head');
    let logo = head?.querySelector('.np-diagnosis-logo');
    let title = head?.querySelector('h4');
    let sub = head?.querySelector('p');
    let codeList = panel.querySelector('.np-diag-code-list');
    let imeiSub = panel.querySelector('.np-diag-imei-sub');
    let imeiOpen = panel.querySelector('.np-diag-open');

    if (!head || !logo || !title || !sub || !codeList || !imeiSub || !imeiOpen) {
        panel.innerHTML = `<div class="np-diagnosis-panel-head"><img class="np-diagnosis-logo" alt=""><div><h4></h4><p>Kode dial & akses cek IMEI</p></div></div>
            <span class="np-diag-section-label">KODE DIAL</span>
            <div class="np-diag-code-list"></div>
            <div class="np-diag-imei"><div><div class="np-diag-imei-title">Cek IMEI & Garansi</div><div class="np-diag-imei-sub"></div></div><button class="np-diag-open" type="button">BUKA ↗</button></div>`;
        head = panel.querySelector('.np-diagnosis-panel-head');
        logo = panel.querySelector('.np-diagnosis-logo');
        title = head.querySelector('h4');
        sub = head.querySelector('p');
        codeList = panel.querySelector('.np-diag-code-list');
        imeiSub = panel.querySelector('.np-diag-imei-sub');
        imeiOpen = panel.querySelector('.np-diag-open');
    }

    const updatePanel = () => {
        title.textContent = brand.name;
        sub.textContent = 'Kode dial & akses cek IMEI';
        imeiSub.textContent = imei.name;
        imeiOpen.onclick = () => openBrandImeiPortal(activeDiagnosisBrand);
        codeList.replaceChildren(...codes.map(c => {
            const row = document.createElement('div');
            row.className = 'np-diag-code-row';
            const main = document.createElement('div');
            main.className = 'np-diag-code-row-main';
            const code = document.createElement('span');
            code.className = 'np-diag-code';
            code.textContent = c.code;
            const desc = document.createElement('span');
            desc.className = 'np-diag-desc';
            desc.textContent = c.description;
            main.append(code, desc);
            const copy = document.createElement('button');
            copy.className = 'np-diag-copy';
            copy.type = 'button';
            copy.innerHTML = '<i class="fa-regular fa-copy"></i> SALIN';
            copy.addEventListener('click', () => copyDiagnosisCode(c.code));
            row.append(main, copy);
            return row;
        }));
    };

    // Preload/decode the next logo before swapping src, so the visible logo
    // never disappears for a frame during a brand change.
    const nextLogo = new Image();
    nextLogo.decoding = 'async';
    nextLogo.onload = () => {
        logo.className = `np-diagnosis-logo brand-logo-${brand.key.toLowerCase()}`;
        logo.alt = brand.name;
        logo.style.opacity = '1';
        logo.src = brand.logo;
    };
    nextLogo.onerror = () => {
        logo.className = `np-diagnosis-logo brand-logo-${brand.key.toLowerCase()}`;
        logo.alt = brand.name;
        logo.style.opacity = '1';
        logo.src = brand.logo;
    };
    nextLogo.src = brand.logo;

    updatePanel();

    if (animateSwap) {
        panel.classList.remove('np-diagnosis-swap');
        void panel.offsetWidth;
        panel.classList.add('np-diagnosis-swap');
        window.setTimeout(() => panel.classList.remove('np-diagnosis-swap'), 220);
    }
}


function initDiagnosisInline() {
    if (!document.getElementById('diagnosis-brand-selector')) return;
    renderDiagnosisInline();
}

/* ========================================================== */
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
function renderHomeShowcase() {
    const container = document.getElementById('np-home-showcase');
    if (!container) return;

    if (!daftarStokMasuk.length) {
        container.innerHTML = `
            <div class="np-showcase-empty">
                <i class="fa-solid fa-box-open"></i>
                <span>Belum ada unit tersedia.</span>
            </div>
        `;
        return;
    }

    container.innerHTML = daftarStokMasuk.map(item => {
        const productName = item.produk || 'Unit';
        const condition = item.kondisi || 'Second';
        const price = parseRawToNumeric(item.hargaDisplay) || parseRawToNumeric(item.hargaJual) || 0;
        const priceText = price ? formatRupiahLengkap(price) : 'Chat Admin';
        const hasPhoto = Boolean(item.imageUrl && String(item.imageUrl).trim());
        const imageSource = hasPhoto ? item.imageUrl : 'assets/np-phone-hero.svg';
        const imageClass = hasPhoto ? 'is-real-photo' : 'is-fallback-visual';
        const imageAlt = hasPhoto ? `Foto ${productName}` : `Visual ${productName}`;

        return `
            <button class="np-showcase-row" type="button" onclick="openShowcaseDetail('${item.id}')" aria-label="Lihat detail ${productName}">
                <span class="np-showcase-thumb ${imageClass}">
                    <img src="${imageSource}" alt="${imageAlt}" loading="lazy" onerror="this.onerror=null;this.src='assets/np-phone-hero.svg';this.classList.remove('is-real-photo');this.classList.add('is-fallback-visual');">
                </span>
                <span class="np-showcase-row-info">
                    <span class="np-showcase-row-top">
                        <span class="np-showcase-row-name">${productName}</span>
                        <span class="np-showcase-row-status">Tersedia</span>
                    </span>
                    <span class="np-showcase-row-bottom">
                        <span class="np-showcase-row-meta">${condition}</span>
                        <strong class="np-showcase-row-price">${priceText}</strong>
                    </span>
                </span>
                <i class="fa-solid fa-chevron-right np-showcase-row-arrow" aria-hidden="true"></i>
            </button>
        `;
    }).join('');
}

function updateDashboardStats() {
    // Ringkasan memakai sumber data yang sama dengan Produk dan Transaksi.
    // Total Unit = unit tersedia + unit terjual.
    // Transaksi = jumlah record transaksi aktual (bukan jumlah unit).
    let sumStok = daftarStokMasuk.reduce((sum, item) => sum + (parseInt(item.qty, 10) || 0), 0);
    let sumTerjual = daftarTerjual.reduce((sum, item) => sum + (parseInt(item.qty, 10) || 0), 0);
    let totalUnit = sumStok + sumTerjual;
    let totalTransaksi = daftarTerjual.length;
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
    if (keuntunganNominalElem) keuntunganNominalElem.textContent = formatRupiahRingkas(totalProfit);

    const totalUnitValElem = document.getElementById('total-unit-val');
    if (totalUnitValElem) totalUnitValElem.textContent = `${totalUnit} Unit`;

    const transaksiCountValElem = document.getElementById('transaksi-count-val');
    if (transaksiCountValElem) transaksiCountValElem.textContent = `${totalTransaksi}`;

    const stokReadyValElem = document.getElementById('stok-ready-val');
    if (stokReadyValElem) stokReadyValElem.textContent = `${sumStok} Unit`;

    const terjualValElem = document.getElementById('terjual-val');
    const terjualOmsetValElem = document.getElementById('terjual-omset-val');
    if (terjualValElem) terjualValElem.textContent = `${sumTerjual} Unit`;
    if (terjualOmsetValElem) terjualOmsetValElem.textContent = formatRupiahRingkas(totalOmset);

    const modalBadgeStokCount = document.getElementById('modal-badge-stok-count');
    if (modalBadgeStokCount) modalBadgeStokCount.textContent = `${daftarStokMasuk.length} Unit`;

    renderHomeShowcase();

    const badgeRjual = document.getElementById('badge-rjual-count');
    const modalBadgeRjual = document.getElementById('modal-badge-rjual-count');
    if (badgeRjual) badgeRjual.textContent = `${sumTerjual}`;
    if (modalBadgeRjual) modalBadgeRjual.textContent = `${sumTerjual} Unit`;
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
function applyTheme(theme, persist = true) {
    const isDark = theme !== 'light';
    document.body.classList.toggle('dark-mode', isDark);

    const icon = document.getElementById('theme-menu-icon');
    const label = document.getElementById('theme-menu-label');
    if (icon) {
        icon.classList.toggle('fa-sun', isDark);
        icon.classList.toggle('fa-moon', !isDark);
    }
    if (label) label.textContent = isDark ? 'Mode Terang' : 'Mode Gelap';

    if (persist) localStorage.setItem('npgalery_theme', isDark ? 'dark' : 'light');
}

function toggleTheme() {
    applyTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark');
}

// V22 — Header More menu: hanya menambahkan fungsi yang hilang pada V21.
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
    const target = document.getElementById(tabId);
    if (!target) return;
    const sections = document.querySelectorAll('.tab-content');
    const navItems = document.querySelectorAll('.nav-item');
    // Mutate all states in one synchronous batch so there is no intermediate blank frame.
    sections.forEach(t => t.classList.toggle('active', t === target));
    navItems.forEach(n => n.classList.toggle('active', n === el));
}

function switchSubTab(subId, el) {
    const p = el?.closest('.tab-content');
    const target = document.getElementById(subId);
    if (!target) return;
    p?.querySelectorAll('.sub-content').forEach(s => s.classList.toggle('active', s === target));
    p?.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.toggle('active', b === el));

    if (subId === 'sub-modal' && navigator.onLine && supabaseClient) {
        scheduleRealtimeSync('modal-transactions', syncTransactionsFromSupabaseOnly);
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

// SIMPAN STOK DENGAN DUKUNGAN UNGGAH FOTO FISIK UNIT, HARGA DISPLAY, & NEGO
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
    const isNegoCheckbox = document.getElementById('stok-is-nego');
    const isNegoVal = isNegoCheckbox ? isNegoCheckbox.checked : true;

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
        is_nego: isNegoVal,
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
                isNego: newStockItem.is_nego,
                pembeli: '',
                tanggal: newStockItem.date,
                imageUrl: uploadedImageUrl
            });
            daftarProdukRiwayat.unshift({
                id: newStockItem.id, produk: newStockItem.name, kondisi: newStockItem.condition,
                kelengkapan: newStockItem.completeness, imei: newStockItem.imei, qty: String(newStockItem.qty),
                hargaModal: String(newStockItem.buy_price), hargaJual: '', hargaDisplay: String(newStockItem.display_price),
                isNego: newStockItem.is_nego, pembeli: '', tanggal: newStockItem.date, imageUrl: uploadedImageUrl, status: 'ready'
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

async function getMasterProductPhoto(productId) {
    const key = String(productId || '');
    if (!key) return null;
    if (masterProductPhotos.has(key)) return masterProductPhotos.get(key);

    if (!supabaseClient) return null;
    try {
        const { data, error } = await supabaseClient
            .from(MASTER_PRODUCT_PHOTO_TABLE)
            .select('image_url')
            .eq('product_id', key)
            .maybeSingle();
        if (!error && data?.image_url) {
            masterProductPhotos.set(key, data.image_url);
            return data.image_url;
        }
    } catch (e) {
        console.warn('Gagal mengambil Master Foto Produk:', e);
    }
    return null;
}

// PROSES JUAL UNIT KE SUPABASE TRANSACTIONS
window.jualStokItem = function(id) {
    const item = daftarStokMasuk.find(s => s.id === id);
    if (item) {
        showCustomConfirm("Penjualan", `Jual unit ${item.produk}?`, async () => {
            let d = new Date(), tgl = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            item.tanggalTerjualRaw = tgl; 
            item.modalStatus = 'belum';

            let profit = (parseRawToNumeric(item.hargaJual) || 0) - (parseRawToNumeric(item.hargaModal) || 0);
            let kasId = 'kas-' + Date.now();

            if (supabaseClient) {
                setConnectionStatus('syncing');
                try {
                    // Snapshot foto Master Produk saat transaksi dibuat.
                    const invoicePhotoUrl = await getMasterProductPhoto(item.id);

                    await supabaseClient.from('product').update({ status: 'sold' }).eq('id', item.id);

                    const transactionPayload = {
                        id: item.id,
                        product_id: item.id,
                        product_name: item.produk,
                        invoice_photo_url: invoicePhotoUrl || null,
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
                    };

                    let { error: trxInsertError } = await supabaseClient.from('transactions').insert([transactionPayload]);
                    if (trxInsertError) {
                        // Kompatibilitas sementara untuk database lama sebelum migrasi kolom baru.
                        const legacyPayload = { ...transactionPayload };
                        delete legacyPayload.product_id;
                        delete legacyPayload.invoice_photo_url;
                        const legacyInsert = await supabaseClient.from('transactions').insert([legacyPayload]);
                        if (legacyInsert.error) throw legacyInsert.error;
                        console.warn('Kolom snapshot foto belum tersedia; transaksi disimpan dalam mode kompatibilitas lama.');
                    }

                    if (profit > 0) {
                        await supabaseClient.from('cash_mutations').insert([{
                            id: kasId,
                            description: `Laba Jual: ${item.produk}`,
                            type: 'masuk',
                            amount: profit,
                            date: tgl
                        }]);
                    }

                    daftarStokMasuk = daftarStokMasuk.filter(s => s.id !== id);
                    const historyItem = daftarProdukRiwayat.find(s => String(s.id) === String(id));
                    if (historyItem) historyItem.status = 'sold';
                    daftarTerjual.unshift({ ...item, productId: item.id, invoicePhotoUrl: invoicePhotoUrl || null });
                    if (profit > 0) {
                        daftarKasPribadi.unshift({ id: kasId, keterangan: `Laba Jual: ${item.produk}`, kategori: 'masuk', nominal: profit, tanggal: tgl });
                    }

                    renderDaftarTerjual(); 
                    renderDaftarModal(); 
                    renderManajemenKas(); 
                    updateDashboardStats(); 
                    updatePribadiStats(); 
                    initShowcaseBrandDropdown();

                    setConnectionStatus('connected');
                    showToast('Berhasil', 'Unit terjual & laba tercatat di Cloud.');
                    openInvoiceModal(item);
                } catch (err) {
                    console.warn('Gagal sinkron penjualan ke Supabase:', err);
                    setConnectionStatus('disconnected');
                    showToast('Gagal', 'Terjadi kendala memproses penjualan di Cloud.', false);
                }
            }
        });
    }
};

/* ========================================================== */
/* INVOICE CENTER — DAFTAR SEMUA INVOICE                       */
/* ========================================================== */
function escapeInvoiceCenterText(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getInvoiceCenterFilteredData(keyword = '') {
    const q = String(keyword || '').trim().toLowerCase();
    if (!q) return [...daftarTerjual];
    return daftarTerjual.filter(item => {
        const haystack = [
            item.pembeli,
            item.produk,
            item.imei,
            item.id,
            item.tanggalTerjualRaw,
            item.tanggal
        ].map(v => String(v ?? '').toLowerCase()).join(' ');
        return haystack.includes(q);
    });
}

window.renderInvoiceCenter = function(keyword = '') {
    const list = document.getElementById('invoice-center-list');
    const count = document.getElementById('invoice-center-count');
    if (!list) return;

    const rows = getInvoiceCenterFilteredData(keyword);
    if (count) count.textContent = String(rows.length);

    if (rows.length === 0) {
        list.innerHTML = `<div class="np-invoice-empty">${keyword ? 'Invoice yang dicari tidak ditemukan.' : 'Belum ada invoice tersimpan.'}</div>`;
        return;
    }

    list.innerHTML = rows.map(item => {
        const invoiceNo = 'INV-' +
            (item.tanggalTerjualRaw ? String(item.tanggalTerjualRaw).replace(/-/g, '') : new Date().toISOString().slice(0, 10).replace(/-/g, '')) +
            '-' + String(item.id).slice(-4);
        const customer = item.pembeli && String(item.pembeli).trim() ? String(item.pembeli).trim() : 'Pelanggan Setia';
        const price = parseRawToNumeric(item.hargaJual) || 0;
        const date = item.tanggalTerjualRaw || item.tanggal || '';
        const safeId = encodeURIComponent(String(item.id));

        const invoicePhoto = item.invoicePhotoUrl || masterProductPhotos.get(String(item.productId || item.id)) || '';
        const photoHtml = invoicePhoto
            ? `<span class="np-invoice-row-thumb"><img src="${escapeInvoiceCenterText(invoicePhoto)}" alt="" loading="lazy" onerror="this.parentElement.classList.add('is-fallback');this.style.display='none';"></span>`
            : `<span class="np-invoice-row-thumb is-fallback"><i class="fa-solid fa-mobile-screen-button" aria-hidden="true"></i></span>`;

        return `
            <button class="np-invoice-row" type="button" onclick="openInvoiceFromCenter('${safeId}')" aria-label="Buka invoice ${escapeInvoiceCenterText(invoiceNo)}">
                ${photoHtml}
                <span class="np-invoice-row-main">
                    <strong>${escapeInvoiceCenterText(customer)}</strong>
                    <small>${escapeInvoiceCenterText(invoiceNo)} • ${escapeInvoiceCenterText(item.produk || '-')} • ${escapeInvoiceCenterText(date)}</small>
                </span>
                <span class="np-invoice-row-price">${escapeInvoiceCenterText(formatRupiahLengkap(price))}</span>
                <i class="fa-solid fa-chevron-right np-invoice-row-arrow" aria-hidden="true"></i>
            </button>
        `;
    }).join('');
};

window.openInvoiceCenterModal = function() {
    const modal = document.getElementById('invoice-center-modal');
    if (!modal) return;

    const search = document.getElementById('invoice-center-search');
    if (search) search.value = '';

    renderInvoiceCenter('');
    toggleModal('invoice-center-modal', true);
    modal.setAttribute('aria-hidden', 'false');
};

window.closeInvoiceCenterModal = function() {
    const modal = document.getElementById('invoice-center-modal');
    if (!modal) return;
    toggleModal('invoice-center-modal', false);
    modal.setAttribute('aria-hidden', 'true');
};

window.filterInvoiceCenter = function(value) {
    renderInvoiceCenter(value);
};

window.openInvoiceFromCenter = function(encodedId) {
    const id = decodeURIComponent(String(encodedId || ''));
    const item = daftarTerjual.find(t => String(t.id) === id);
    if (!item) {
        showToast('Peringatan', 'Data invoice tidak ditemukan.', false);
        renderInvoiceCenter(document.getElementById('invoice-center-search')?.value || '');
        return;
    }

    closeInvoiceCenterModal();
    openInvoiceModal(item);
};

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
                renderDaftarTerjual();
                renderTransaksiCompact(); 
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

function renderDaftarTerjual() {
    const container = document.getElementById('rjual-container');
    const badge = document.getElementById('badge-rjual-count');
    const modalBadge = document.getElementById('modal-badge-rjual-count');
    if (!container) return;

    if (badge) badge.textContent = `${daftarTerjual.length}`;
    if (modalBadge) modalBadge.textContent = `${daftarTerjual.length} Unit`;

    if (daftarTerjual.length === 0) { 
        container.innerHTML = `<div class="empty-stok-msg">Belum ada riwayat penjualan.</div>`; 
        return; 
    }
    
    container.innerHTML = daftarTerjual.map(i => {
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
                        <button onclick="openWarrantyCertificateModal('${i.id}')" class="action-btn" title="Lihat Kartu Garansi Digital"><i class="fa-solid fa-shield-halved" style="color:var(--azure-primary);"></i></button>
                        <button onclick="hapusRiwayatTerjual('${i.id}')" class="action-btn delete-btn" title="Hapus Riwayat"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
                <div class="stok-item-details">
                    <span class="detail-badge imei-badge">IMEI: ${i.imei}</span>
                    <span class="detail-badge" style="font-size: 10px; color: var(--text-secondary);">${namaPembeliText}</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-top:6px; font-size:11px; font-weight:700;">
                    <span>Modal: ${formatRupiahRingkas(numericModal)} | Jual: ${formatRupiahRingkas(numericJual)}</span>
                    <span style="color:${p>=0?'var(--status-safe)':'var(--status-unsafe)'}">${p>=0?'+ ':''}${formatRupiahRingkas(p)}</span>
                </div>
            </div>
        `;
    }).join('');
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