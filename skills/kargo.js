import { logger } from '../utils/logger.js';

// ===================================================
// SKILLSET KARGO / EKSPEDISI
// Domain: jasa pengiriman barang antarkota
// Functions: cek_tarif_kargo, lacak_paket, cek_lokasi_gudang, estimasi_waktu
// ===================================================

export const domain = 'kargo';
export const displayName = 'CS Kargo & Ekspedisi';

// --- Data statis tarif kargo ---
const TARIF_DB = {
    'jogja-jakarta':  { harga: 850000,  estimasi: '2-3 hari', jalur: 'Jalur Pantura' },
    'jogja-semarang': { harga: 320000,  estimasi: '1 hari',   jalur: 'Jalur Tol Trans Jawa' },
    'jogja-surabaya': { harga: 620000,  estimasi: '1-2 hari', jalur: 'Jalur Selatan' },
    'jogja-bali':     { harga: 1100000, estimasi: '3-5 hari', jalur: 'Jalur Selatan + Ferry' },
    'jogja-medan':    { harga: 2400000, estimasi: '5-7 hari', jalur: 'Udara' },
    'jakarta-bali':   { harga: 950000,  estimasi: '2-3 hari', jalur: 'Jalur Darat + Ferry' },
    'jakarta-surabaya':{ harga: 700000, estimasi: '1-2 hari', jalur: 'Tol Trans Jawa' },
};

const GUDANG_DB = {
    'jogja':    { alamat: 'Jl. Magelang KM 5, Sleman, Yogyakarta', telp: '0274-123456', jam: '08.00 - 17.00' },
    'jakarta':  { alamat: 'Jl. Raya Bekasi KM 18, Jakarta Timur',  telp: '021-987654',  jam: '07.00 - 20.00' },
    'surabaya': { alamat: 'Jl. Rungkut Industri No.12, Surabaya',  telp: '031-456789',  jam: '08.00 - 18.00' },
    'semarang': { alamat: 'Jl. Siliwangi No.45, Semarang Barat',   telp: '024-321654',  jam: '08.00 - 17.00' },
    'bali':     { alamat: 'Jl. Sunset Road No.88, Kuta, Bali',     telp: '0361-789012', jam: '08.00 - 17.00' },
};

// --- Database lacak paket in-memory ---
const PAKET_DB = new Map([
    ['PKT-001234', { status: 'dikirim', lokasi: 'Gudang Semarang', estimasi_tiba: '2025-07-15', asal: 'Jogja', tujuan: 'Jakarta' }],
    ['PKT-005678', { status: 'terima', lokasi: 'Gudang Tujuan',    estimasi_tiba: '2025-07-13', asal: 'Jakarta', tujuan: 'Bali'   }],
    ['PKT-009999', { status: 'proses', lokasi: 'Gudang Jogja',     estimasi_tiba: '2025-07-17', asal: 'Jogja', tujuan: 'Surabaya'}],
]);

function normalisasiKota(kota) {
    return kota.toLowerCase()
        .replace(/yogyakarta|yk|diy/, 'jogja')
        .replace(/dki|jkt/, 'jakarta')
        .replace(/sby/, 'surabaya')
        .replace(/smg/, 'semarang')
        .trim();
}

// ===================================================
// DEKLARASI FUNCTION CALLING
// ===================================================

export const skillDeclarations = [
    {
        name: "cek_tarif_kargo",
        description: "Mengecek ongkos kirim motor atau kendaraan antarkota. Gunakan ini ketika user bertanya tentang biaya, harga, atau tarif pengiriman.",
        parameters: {
            type: "OBJECT",
            properties: {
                kota_asal:   { type: "STRING", description: "Kota asal pengiriman. Contoh: Jogja, Jakarta, Surabaya" },
                kota_tujuan: { type: "STRING", description: "Kota tujuan pengiriman." },
                jenis_kargo: { type: "STRING", description: "Jenis kargo: motor, mobil, barang_umum", enum: ["motor", "mobil", "barang_umum"] }
            },
            required: ["kota_asal", "kota_tujuan"]
        }
    },
    {
        name: "lacak_paket",
        description: "Melacak posisi dan status pengiriman berdasarkan nomor resi/paket.",
        parameters: {
            type: "OBJECT",
            properties: {
                nomor_resi: { type: "STRING", description: "Nomor resi paket format PKT-XXXXXX" }
            },
            required: ["nomor_resi"]
        }
    },
    {
        name: "cek_lokasi_gudang",
        description: "Mendapatkan informasi alamat, nomor telepon, dan jam operasional gudang di suatu kota.",
        parameters: {
            type: "OBJECT",
            properties: {
                kota: { type: "STRING", description: "Nama kota gudang yang dicari" }
            },
            required: ["kota"]
        }
    },
    {
        name: "estimasi_waktu_tiba",
        description: "Menghitung estimasi waktu tiba berdasarkan rute dan tanggal pengiriman.",
        parameters: {
            type: "OBJECT",
            properties: {
                kota_asal:        { type: "STRING" },
                kota_tujuan:      { type: "STRING" },
                tanggal_kirim:    { type: "STRING", description: "Format YYYY-MM-DD" }
            },
            required: ["kota_asal", "kota_tujuan"]
        }
    }
];

// ===================================================
// EXECUTOR
// ===================================================

export const executors = {

    cek_tarif_kargo: async ({ kota_asal, kota_tujuan, jenis_kargo = 'motor' }) => {
        logger.info("[Kargo Skill]", `Tarif: ${kota_asal} → ${kota_tujuan} (${jenis_kargo})`);

        const asal = normalisasiKota(kota_asal);
        const tujuan = normalisasiKota(kota_tujuan);
        const key = `${asal}-${tujuan}`;
        const keyReverse = `${tujuan}-${asal}`;

        const data = TARIF_DB[key] || TARIF_DB[keyReverse];

        if (!data) {
            return {
                tersedia: false,
                pesan: `Rute ${kota_asal} → ${kota_tujuan} belum tersedia.`,
                rute_tersedia: ['Jogja-Jakarta', 'Jogja-Semarang', 'Jogja-Surabaya', 'Jogja-Bali', 'Jakarta-Bali']
            };
        }

        const MULTIPLIER = { motor: 1, mobil: 2.5, barang_umum: 0.7 };
        const harga_final = Math.round(data.harga * (MULTIPLIER[jenis_kargo] || 1));

        return {
            tersedia: true,
            asal: kota_asal,
            tujuan: kota_tujuan,
            jenis_kargo,
            harga: harga_final,
            harga_format: `Rp ${harga_final.toLocaleString('id-ID')}`,
            estimasi: data.estimasi,
            jalur: data.jalur
        };
    },

    lacak_paket: async ({ nomor_resi }) => {
        logger.info("[Kargo Skill]", `Lacak resi: ${nomor_resi}`);

        const resi = nomor_resi.toUpperCase().trim();
        const paket = PAKET_DB.get(resi);

        if (!paket) {
            return {
                ditemukan: false,
                pesan: `Resi ${resi} tidak ditemukan. Pastikan nomor resi sudah benar.`
            };
        }

        const STATUS_LABEL = {
            proses: 'Sedang diproses di gudang asal',
            dikirim: 'Dalam perjalanan',
            terima: 'Sudah diterima di gudang tujuan'
        };

        return {
            ditemukan: true,
            nomor_resi: resi,
            ...paket,
            status_label: STATUS_LABEL[paket.status] || paket.status
        };
    },

    cek_lokasi_gudang: async ({ kota }) => {
        logger.info("[Kargo Skill]", `Gudang kota: ${kota}`);

        const key = normalisasiKota(kota);
        const gudang = GUDANG_DB[key];

        if (!gudang) {
            return {
                ditemukan: false,
                pesan: `Belum ada gudang di ${kota}.`,
                kota_tersedia: Object.keys(GUDANG_DB)
            };
        }

        return { ditemukan: true, kota, ...gudang };
    },

    estimasi_waktu_tiba: async ({ kota_asal, kota_tujuan, tanggal_kirim }) => {
        logger.info("[Kargo Skill]", `Estimasi: ${kota_asal} → ${kota_tujuan}`);

        const asal = normalisasiKota(kota_asal);
        const tujuan = normalisasiKota(kota_tujuan);
        const key = `${asal}-${tujuan}`;
        const data = TARIF_DB[key] || TARIF_DB[`${tujuan}-${asal}`];

        if (!data) {
            return { tersedia: false, pesan: `Rute ${kota_asal} → ${kota_tujuan} tidak tersedia.` };
        }

        const hariMin = parseInt(data.estimasi.split('-')[0]);
        const tglKirim = tanggal_kirim ? new Date(tanggal_kirim) : new Date();
        const tglTiba = new Date(tglKirim);
        tglTiba.setDate(tglTiba.getDate() + hariMin);

        return {
            tersedia: true,
            estimasi_durasi: data.estimasi,
            tanggal_kirim: tglKirim.toLocaleDateString('id-ID'),
            perkiraan_tiba: tglTiba.toLocaleDateString('id-ID'),
            catatan: 'Estimasi tidak termasuk hari libur nasional.'
        };
    }
};