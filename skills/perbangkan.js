import { logger } from '../utils/logger.js';

// ===================================================
// SKILLSET PERBANKAN / FINTECH
// Domain: CS bank, koperasi, dompet digital
// Functions: cek_saldo, riwayat_mutasi, proses_transfer, cek_kurs
// CATATAN: Data ini dummy untuk demo — jangan gunakan data nasabah nyata
// ===================================================

export const domain = 'perbankan';
export const displayName = 'CS Perbankan & Keuangan';

// --- Data akun demo (BUKAN data nyata) ---
const AKUN_DB = new Map([
    ['1234567890', { nama: 'Budi Santoso',   saldo: 4850000,  jenis: 'Tabungan', pin_hash: 'demo' }],
    ['0987654321', { nama: 'Siti Rahayu',    saldo: 12300000, jenis: 'Giro',     pin_hash: 'demo' }],
    ['1111222233', { nama: 'Ahmad Fauzi',    saldo: 875000,   jenis: 'Tabungan', pin_hash: 'demo' }],
]);

const MUTASI_DB = new Map([
    ['1234567890', [
        { tanggal: '2025-07-10', keterangan: 'Transfer masuk dari SITI', jenis: 'kredit', jumlah: 500000 },
        { tanggal: '2025-07-09', keterangan: 'Belanja Tokopedia',        jenis: 'debit',  jumlah: 150000 },
        { tanggal: '2025-07-08', keterangan: 'Tarik Tunai ATM',          jenis: 'debit',  jumlah: 300000 },
        { tanggal: '2025-07-07', keterangan: 'Gaji Juli',                jenis: 'kredit', jumlah: 5000000 },
    ]],
    ['0987654321', [
        { tanggal: '2025-07-10', keterangan: 'Transfer ke BUDI',         jenis: 'debit',  jumlah: 500000 },
        { tanggal: '2025-07-08', keterangan: 'Setoran tunai',            jenis: 'kredit', jumlah: 2000000 },
    ]],
]);

const KURS_DB = {
    USD: { beli: 15800, jual: 16100, nama: 'Dolar Amerika' },
    SGD: { beli: 11700, jual: 11950, nama: 'Dolar Singapura' },
    EUR: { beli: 17200, jual: 17500, nama: 'Euro' },
    JPY: { beli: 102,   jual: 106,   nama: 'Yen Jepang' },
    MYR: { beli: 3350,  jual: 3420,  nama: 'Ringgit Malaysia' },
    SAR: { beli: 4100,  jual: 4280,  nama: 'Riyal Saudi' },
};

// ===================================================
// DEKLARASI FUNCTION CALLING
// ===================================================

export const skillDeclarations = [
    {
        name: "cek_saldo",
        description: "Mengecek saldo rekening nasabah. Gunakan ketika user bertanya tentang saldo atau informasi akun.",
        parameters: {
            type: "OBJECT",
            properties: {
                nomor_rekening: {
                    type: "STRING",
                    description: "Nomor rekening 10 digit"
                }
            },
            required: ["nomor_rekening"]
        }
    },
    {
        name: "riwayat_mutasi",
        description: "Menampilkan riwayat transaksi rekening dalam periode tertentu.",
        parameters: {
            type: "OBJECT",
            properties: {
                nomor_rekening: { type: "STRING" },
                jumlah_transaksi: {
                    type: "NUMBER",
                    description: "Berapa transaksi terakhir yang ingin ditampilkan. Default: 5"
                }
            },
            required: ["nomor_rekening"]
        }
    },
    {
        name: "proses_transfer",
        description: "Melakukan transfer dana antar rekening. Selalu konfirmasi nominal dan tujuan sebelum memanggil fungsi ini.",
        parameters: {
            type: "OBJECT",
            properties: {
                rekening_asal:   { type: "STRING", description: "Nomor rekening pengirim" },
                rekening_tujuan: { type: "STRING", description: "Nomor rekening penerima" },
                jumlah:          { type: "NUMBER",  description: "Nominal transfer dalam Rupiah" },
                berita:          { type: "STRING",  description: "Berita transfer (opsional)" }
            },
            required: ["rekening_asal", "rekening_tujuan", "jumlah"]
        }
    },
    {
        name: "cek_kurs",
        description: "Mengecek nilai tukar mata uang asing terhadap Rupiah. Gunakan ketika user bertanya tentang kurs, nilai tukar, atau konversi mata uang.",
        parameters: {
            type: "OBJECT",
            properties: {
                mata_uang: {
                    type: "STRING",
                    description: "Kode mata uang. Contoh: USD, SGD, EUR, JPY, MYR, SAR"
                },
                jumlah: {
                    type: "NUMBER",
                    description: "Jumlah yang ingin dikonversi (opsional, untuk kalkulasi)"
                }
            },
            required: ["mata_uang"]
        }
    }
];

// ===================================================
// EXECUTOR
// ===================================================

export const executors = {

    cek_saldo: async ({ nomor_rekening }) => {
        logger.info("[Bank Skill]", `Cek saldo rek: ${nomor_rekening}`);

        const akun = AKUN_DB.get(nomor_rekening);

        if (!akun) {
            return {
                ditemukan: false,
                pesan: `Rekening ${nomor_rekening} tidak ditemukan. Pastikan nomor rekening sudah benar.`
            };
        }

        return {
            ditemukan: true,
            nama_nasabah: akun.nama,
            nomor_rekening,
            jenis_rekening: akun.jenis,
            saldo: akun.saldo,
            saldo_format: `Rp ${akun.saldo.toLocaleString('id-ID')}`,
            per_tanggal: new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })
        };
    },

    riwayat_mutasi: async ({ nomor_rekening, jumlah_transaksi = 5 }) => {
        logger.info("[Bank Skill]", `Mutasi rek: ${nomor_rekening}`);

        const akun = AKUN_DB.get(nomor_rekening);
        if (!akun) {
            return { ditemukan: false, pesan: `Rekening ${nomor_rekening} tidak ditemukan.` };
        }

        const mutasi = (MUTASI_DB.get(nomor_rekening) || []).slice(0, jumlah_transaksi);

        return {
            ditemukan: true,
            nama_nasabah: akun.nama,
            nomor_rekening,
            transaksi: mutasi.map(t => ({
                ...t,
                jumlah_format: `${t.jenis === 'kredit' ? '+' : '-'} Rp ${t.jumlah.toLocaleString('id-ID')}`
            })),
            total_ditampilkan: mutasi.length
        };
    },

    proses_transfer: async ({ rekening_asal, rekening_tujuan, jumlah, berita = 'Transfer' }) => {
        logger.info("[Bank Skill]", `Transfer: ${rekening_asal} → ${rekening_tujuan} Rp${jumlah}`);

        const asal   = AKUN_DB.get(rekening_asal);
        const tujuan = AKUN_DB.get(rekening_tujuan);

        if (!asal)   return { sukses: false, pesan: `Rekening asal ${rekening_asal} tidak ditemukan.` };
        if (!tujuan) return { sukses: false, pesan: `Rekening tujuan ${rekening_tujuan} tidak ditemukan.` };
        if (jumlah <= 0)          return { sukses: false, pesan: 'Nominal transfer harus lebih dari 0.' };
        if (jumlah > asal.saldo)  return { sukses: false, pesan: `Saldo tidak cukup. Saldo tersedia: Rp ${asal.saldo.toLocaleString('id-ID')}` };
        if (jumlah < 10000)       return { sukses: false, pesan: 'Minimal transfer Rp 10.000.' };

        // Proses transfer
        asal.saldo -= jumlah;
        tujuan.saldo += jumlah;

        const id_transaksi = `TRF-${Date.now().toString().slice(-8)}`;
        const waktu = new Date().toLocaleString('id-ID');

        return {
            sukses: true,
            id_transaksi,
            dari: asal.nama,
            ke: tujuan.nama,
            rekening_tujuan,
            jumlah_format: `Rp ${jumlah.toLocaleString('id-ID')}`,
            berita,
            waktu,
            saldo_akhir: `Rp ${asal.saldo.toLocaleString('id-ID')}`,
            pesan: `Transfer berhasil! Rp ${jumlah.toLocaleString('id-ID')} terkirim ke ${tujuan.nama}.`
        };
    },

    cek_kurs: async ({ mata_uang, jumlah }) => {
        logger.info("[Bank Skill]", `Kurs: ${mata_uang}`);

        const kode = mata_uang.toUpperCase().trim();
        const kurs = KURS_DB[kode];

        if (!kurs) {
            return {
                ditemukan: false,
                pesan: `Kurs ${kode} tidak tersedia.`,
                tersedia: Object.keys(KURS_DB)
            };
        }

        const result = {
            ditemukan: true,
            mata_uang: kode,
            nama: kurs.nama,
            kurs_beli: `Rp ${kurs.beli.toLocaleString('id-ID')}`,
            kurs_jual: `Rp ${kurs.jual.toLocaleString('id-ID')}`,
            per_tanggal: new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })
        };

        if (jumlah && jumlah > 0) {
            result.konversi = {
                jumlah_valas: `${jumlah} ${kode}`,
                nilai_beli: `Rp ${(jumlah * kurs.beli).toLocaleString('id-ID')}`,
                nilai_jual: `Rp ${(jumlah * kurs.jual).toLocaleString('id-ID')}`
            };
        }

        return result;
    }
};