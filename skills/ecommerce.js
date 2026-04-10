import { logger } from '../utils/logger.js';

// ===================================================
// SKILLSET E-COMMERCE
// Domain: toko online / ritel
// Functions: cek_stok, buat_pesanan, cek_status_pesanan, batalkan_pesanan
// ===================================================

export const domain = 'ecommerce';
export const displayName = 'CS E-Commerce';

// --- Data statis produk (ganti Math.random()) ---
const KATALOG_PRODUK = {
    'iphone 15': { stok: 12, harga: 14999000, satuan: 'unit' },
    'iphone 15 pro': { stok: 5, harga: 18999000, satuan: 'unit' },
    'samsung galaxy s24': { stok: 8, harga: 12999000, satuan: 'unit' },
    'laptop asus vivobook': { stok: 3, harga: 8499000, satuan: 'unit' },
    'headphone sony wh-1000xm5': { stok: 20, harga: 4299000, satuan: 'unit' },
    'smartwatch apple watch s9': { stok: 0, harga: 6499000, satuan: 'unit' },
    'charger anker 65w': { stok: 45, harga: 349000, satuan: 'unit' },
    'kabel hdmi 2m': { stok: 60, harga: 89000, satuan: 'unit' },
};

// --- Database pesanan in-memory (untuk demo) ---
const PESANAN_DB = new Map();

// --- Helper cari produk fuzzy (toleran typo minor) ---
function cariProduk(query) {
    if (!query) return null;
    const q = String(query).toLowerCase().trim();
    const exactMatch = KATALOG_PRODUK[q];
    if (exactMatch) return { key: q, ...exactMatch };

    const fuzzyMatch = Object.entries(KATALOG_PRODUK).find(([key]) =>
        key.includes(q) || q.includes(key.split(' ')[0])
    );
    if (fuzzyMatch) return { key: fuzzyMatch[0], ...fuzzyMatch[1] };

    return null;
}

// ===================================================
// DEKLARASI FUNCTION CALLING
// ===================================================

export const skillDeclarations = [
    {
        name: "cek_stok",
        description: "Cek ketersediaan dan harga produk di toko. Gunakan ini ketika user bertanya tentang stok, ketersediaan, atau harga barang.",
        parameters: {
            type: "OBJECT",
            properties: {
                nama_barang: {
                    type: "STRING",
                    description: "Nama produk yang ingin dicek. Contoh: 'iPhone 15', 'Samsung Galaxy S24'"
                }
            },
            required: ["nama_barang"]
        }
    },
    {
        name: "buat_pesanan",
        description: "Memproses dan mencatat pesanan baru dari customer. Gunakan setelah customer konfirmasi ingin membeli.",
        parameters: {
            type: "OBJECT",
            properties: {
                nama_barang: {
                    type: "STRING",
                    description: "Nama produk yang dipesan"
                },
                jumlah: {
                    type: "NUMBER",
                    description: "Jumlah unit yang dipesan"
                },
                nama_pembeli: {
                    type: "STRING",
                    description: "Nama lengkap pembeli"
                },
                alamat: {
                    type: "STRING",
                    description: "Alamat pengiriman lengkap"
                },
                metode_bayar: {
                    type: "STRING",
                    description: "Metode pembayaran: transfer_bank, cod, dompet_digital",
                    enum: ["transfer_bank", "cod", "dompet_digital"]
                }
            },
            required: ["nama_barang", "jumlah", "nama_pembeli", "alamat"]
        }
    },
    {
        name: "cek_status_pesanan",
        description: "Mengecek status dan detail pesanan berdasarkan ID pesanan atau nama pembeli.",
        parameters: {
            type: "OBJECT",
            properties: {
                id_pesanan: {
                    type: "STRING",
                    description: "ID pesanan format ORD-XXXXXX. Gunakan ini jika user tahu ID pesanannya."
                },
                nama_pembeli: {
                    type: "STRING",
                    description: "Nama pembeli untuk mencari pesanan jika ID tidak diketahui."
                }
            }
        }
    },
    {
        name: "batalkan_pesanan",
        description: "Membatalkan pesanan yang belum diproses/dikirim. Hanya bisa dibatalkan jika status masih 'menunggu_bayar' atau 'diproses'.",
        parameters: {
            type: "OBJECT",
            properties: {
                id_pesanan: {
                    type: "STRING",
                    description: "ID pesanan yang akan dibatalkan"
                },
                alasan: {
                    type: "STRING",
                    description: "Alasan pembatalan dari customer"
                }
            },
            required: ["id_pesanan"]
        }
    }
];

// ===================================================
// EXECUTOR (LOGIKA BISNIS)
// ===================================================

export const executors = {

    cek_stok: async ({ nama_barang }) => {
        logger.info("[ECom Skill]", `Cek stok: "${nama_barang}"`);

        const produk = cariProduk(nama_barang);

        if (!produk) {
            return {
                ditemukan: false,
                pesan: `Produk "${nama_barang}" tidak ditemukan di katalog kami.`,
                saran: "Coba gunakan nama yang lebih spesifik atau tanyakan daftar produk yang tersedia."
            };
        }

        return {
            ditemukan: true,
            nama_produk: produk.key,
            stok: produk.stok,
            tersedia: produk.stok > 0,
            harga: produk.harga,
            harga_format: `Rp ${produk.harga.toLocaleString('id-ID')}`,
            pesan: produk.stok === 0
                ? `Maaf, ${produk.key} sedang habis. Daftarkan ke waitlist?`
                : `Stok tersedia: ${produk.stok} unit`
        };
    },

    buat_pesanan: async ({ nama_barang, jumlah, nama_pembeli, alamat, metode_bayar = 'transfer_bank' }) => {
        logger.info("[ECom Skill]", `Order: ${jumlah}x ${nama_barang} untuk ${nama_pembeli}`);

        const produk = cariProduk(nama_barang);

        if (!produk) {
            return { sukses: false, pesan: `Produk "${nama_barang}" tidak ditemukan.` };
        }
        if (produk.stok < jumlah) {
            return {
                sukses: false,
                pesan: `Stok tidak cukup. Tersedia hanya ${produk.stok} unit.`
            };
        }

        // Catat pesanan
        const id_pesanan = `ORD-${Date.now().toString().slice(-6)}`;
        const total = produk.harga * jumlah;

        PESANAN_DB.set(id_pesanan, {
            id: id_pesanan,
            nama_barang: produk.key,
            jumlah,
            nama_pembeli,
            alamat,
            metode_bayar,
            total,
            status: 'menunggu_bayar',
            waktu: new Date().toISOString()
        });

        // Kurangi stok
        KATALOG_PRODUK[produk.key].stok -= jumlah;

        return {
            sukses: true,
            id_pesanan,
            nama_barang: produk.key,
            jumlah,
            total_bayar: `Rp ${total.toLocaleString('id-ID')}`,
            metode_bayar,
            status: 'menunggu_bayar',
            pesan: metode_bayar === 'transfer_bank'
                ? `Pesanan dicatat! Silakan transfer ke BCA 1234567890 a/n Toko Kami dalam 24 jam.`
                : `Pesanan dicatat! Kurir akan menghubungi dalam 1-2 jam.`
        };
    },

    cek_status_pesanan: async ({ id_pesanan, nama_pembeli }) => {
        logger.info("[ECom Skill]", `Cek pesanan: ${id_pesanan || nama_pembeli}`);

        let pesanan = null;

        if (id_pesanan) {
            pesanan = PESANAN_DB.get(id_pesanan.toUpperCase());
        } else if (nama_pembeli) {
            pesanan = [...PESANAN_DB.values()].find(p =>
                p.nama_pembeli.toLowerCase().includes(nama_pembeli.toLowerCase())
            );
        }

        if (!pesanan) {
            return {
                ditemukan: false,
                pesan: "Pesanan tidak ditemukan. Pastikan ID pesanan atau nama pembeli sudah benar."
            };
        }

        const STATUS_LABEL = {
            menunggu_bayar: 'Menunggu pembayaran',
            diproses: 'Sedang diproses',
            dikirim: 'Dalam pengiriman',
            selesai: 'Selesai',
            dibatalkan: 'Dibatalkan'
        };

        return {
            ditemukan: true,
            ...pesanan,
            status_label: STATUS_LABEL[pesanan.status] || pesanan.status,
            total_format: `Rp ${pesanan.total.toLocaleString('id-ID')}`
        };
    },

    batalkan_pesanan: async ({ id_pesanan, alasan = 'Tidak ada alasan' }) => {
        logger.info("[ECom Skill]", `Batalkan pesanan: ${id_pesanan}`);

        const pesanan = PESANAN_DB.get(id_pesanan.toUpperCase());

        if (!pesanan) {
            return { sukses: false, pesan: `Pesanan ${id_pesanan} tidak ditemukan.` };
        }

        const STATUS_BISA_BATAL = ['menunggu_bayar', 'diproses'];
        if (!STATUS_BISA_BATAL.includes(pesanan.status)) {
            return {
                sukses: false,
                pesan: `Pesanan dengan status "${pesanan.status}" tidak dapat dibatalkan. Hubungi CS untuk bantuan lebih lanjut.`
            };
        }

        // Kembalikan stok
        if (KATALOG_PRODUK[pesanan.nama_barang]) {
            KATALOG_PRODUK[pesanan.nama_barang].stok += pesanan.jumlah;
        }

        pesanan.status = 'dibatalkan';
        pesanan.alasan_batal = alasan;

        return {
            sukses: true,
            id_pesanan,
            pesan: `Pesanan ${id_pesanan} berhasil dibatalkan.`,
            refund: pesanan.metode_bayar === 'transfer_bank'
                ? 'Refund akan diproses 2-3 hari kerja ke rekening asal.'
                : 'Tidak ada tagihan.'
        };
    }
};