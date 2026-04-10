import { logger } from '../utils/logger.js';

// ===================================================
// SKILLSET RESTORAN / F&B
// Domain: restoran, kafe, cloud kitchen
// Functions: cek_menu, pesan_meja, cek_antrian, order_takeaway
// ===================================================

export const domain = 'restoran';
export const displayName = 'CS Restoran & Kafe';

const MENU_DB = {
    makanan: [
        { id: 'M01', nama: 'Nasi Goreng Spesial',  harga: 35000, tersedia: true,  kalori: 650, alergen: [] },
        { id: 'M02', nama: 'Soto Ayam Kampung',    harga: 28000, tersedia: true,  kalori: 420, alergen: [] },
        { id: 'M03', nama: 'Steak Wagyu 150gr',    harga: 185000, tersedia: true, kalori: 580, alergen: [] },
        { id: 'M04', nama: 'Pasta Carbonara',       harga: 65000, tersedia: false, kalori: 720, alergen: ['gluten', 'telur'] },
        { id: 'M05', nama: 'Gado-Gado Betawi',     harga: 25000, tersedia: true,  kalori: 380, alergen: ['kacang'] },
    ],
    minuman: [
        { id: 'D01', nama: 'Es Teh Manis',         harga: 8000,  tersedia: true },
        { id: 'D02', nama: 'Jus Alpukat',           harga: 22000, tersedia: true },
        { id: 'D03', nama: 'Cold Brew Coffee',      harga: 38000, tersedia: true },
        { id: 'D04', nama: 'Fresh Lemonade',        harga: 25000, tersedia: true },
    ],
    dessert: [
        { id: 'S01', nama: 'Es Krim Gelato',        harga: 32000, tersedia: true },
        { id: 'S02', nama: 'Klepon Ubi Ungu',       harga: 18000, tersedia: true },
        { id: 'S03', nama: 'Lava Cake Cokelat',     harga: 45000, tersedia: false },
    ]
};

const MEJA_DB = Array.from({ length: 15 }, (_, i) => ({
    nomor: i + 1,
    kapasitas: i < 5 ? 2 : i < 10 ? 4 : 8,
    tersedia: ![3, 7, 11].includes(i + 1)
}));

const RESERVASI_DB = new Map();
const ANTRIAN_DB = [];

// ===================================================
// DEKLARASI FUNCTION CALLING
// ===================================================

export const skillDeclarations = [
    {
        name: "cek_menu",
        description: "Menampilkan daftar menu makanan/minuman beserta harga dan ketersediaan. Gunakan ketika user bertanya tentang menu, harga, atau ada pilihan apa.",
        parameters: {
            type: "OBJECT",
            properties: {
                kategori: {
                    type: "STRING",
                    description: "Kategori menu: makanan, minuman, dessert, atau semua",
                    enum: ["makanan", "minuman", "dessert", "semua"]
                },
                filter_tersedia: {
                    type: "BOOLEAN",
                    description: "Jika true, hanya tampilkan menu yang tersedia"
                }
            }
        }
    },
    {
        name: "pesan_meja",
        description: "Membuat reservasi meja untuk makan di tempat. Gunakan ketika user ingin booking atau reservasi meja.",
        parameters: {
            type: "OBJECT",
            properties: {
                nama:          { type: "STRING", description: "Nama pemesan" },
                jumlah_orang:  { type: "NUMBER", description: "Jumlah tamu" },
                tanggal:       { type: "STRING", description: "Tanggal reservasi format YYYY-MM-DD" },
                jam:           { type: "STRING", description: "Jam reservasi. Contoh: 19:00" },
                catatan:       { type: "STRING", description: "Catatan khusus, misalnya ada yang ulang tahun, alergi makanan" }
            },
            required: ["nama", "jumlah_orang", "tanggal", "jam"]
        }
    },
    {
        name: "cek_antrian_dine_in",
        description: "Mengecek estimasi waktu tunggu untuk makan di tempat tanpa reservasi (walk-in).",
        parameters: {
            type: "OBJECT",
            properties: {
                jumlah_orang: { type: "NUMBER", description: "Jumlah tamu yang akan datang" }
            },
            required: ["jumlah_orang"]
        }
    },
    {
        name: "order_takeaway",
        description: "Mencatat pesanan takeaway/bungkus untuk diambil. Gunakan ketika user ingin pesan untuk dibawa pulang.",
        parameters: {
            type: "OBJECT",
            properties: {
                nama:      { type: "STRING", description: "Nama pemesan" },
                telepon:   { type: "STRING", description: "Nomor telepon untuk konfirmasi" },
                pesanan:   {
                    type: "ARRAY",
                    description: "Daftar item yang dipesan",
                    items: {
                        type: "OBJECT",
                        properties: {
                            id_menu: { type: "STRING" },
                            jumlah:  { type: "NUMBER" }
                        }
                    }
                },
                jam_ambil: { type: "STRING", description: "Jam pengambilan yang diinginkan" }
            },
            required: ["nama", "pesanan"]
        }
    }
];

// ===================================================
// EXECUTOR
// ===================================================

export const executors = {

    cek_menu: async ({ kategori = 'semua', filter_tersedia = false }) => {
        logger.info("[Resto Skill]", `Cek menu: ${kategori}`);

        let result = {};
        const kategoriList = kategori === 'semua'
            ? ['makanan', 'minuman', 'dessert']
            : [kategori];

        for (const kat of kategoriList) {
            if (!MENU_DB[kat]) continue;
            let items = MENU_DB[kat];
            if (filter_tersedia) items = items.filter(i => i.tersedia);
            result[kat] = items.map(i => ({
                ...i,
                harga_format: `Rp ${i.harga.toLocaleString('id-ID')}`,
                status: i.tersedia ? 'Tersedia' : 'Habis'
            }));
        }

        return { menu: result, total_item: Object.values(result).flat().length };
    },

    pesan_meja: async ({ nama, jumlah_orang, tanggal, jam, catatan = '' }) => {
        logger.info("[Resto Skill]", `Reservasi: ${nama} (${jumlah_orang} org) - ${tanggal} ${jam}`);

        const mejaCocok = MEJA_DB.find(m => m.tersedia && m.kapasitas >= jumlah_orang);

        if (!mejaCocok) {
            return {
                sukses: false,
                pesan: `Tidak ada meja tersedia untuk ${jumlah_orang} orang. Semua meja kapasitas ${jumlah_orang}+ sedang penuh.`,
                saran: 'Coba pilih tanggal atau jam lain.'
            };
        }

        const id_reservasi = `RSV-${Date.now().toString().slice(-5)}`;
        mejaCocok.tersedia = false;

        RESERVASI_DB.set(id_reservasi, {
            id: id_reservasi, nama, jumlah_orang,
            tanggal, jam, nomor_meja: mejaCocok.nomor, catatan
        });

        return {
            sukses: true,
            id_reservasi,
            nomor_meja: mejaCocok.nomor,
            kapasitas_meja: mejaCocok.kapasitas,
            nama, jumlah_orang, tanggal, jam,
            pesan: `Reservasi berhasil! Meja No.${mejaCocok.nomor} untuk ${jumlah_orang} orang pada ${tanggal} pukul ${jam}.`,
            reminder: 'Harap hadir 10 menit sebelum waktu reservasi. Meja akan dilepas jika terlambat 15 menit.'
        };
    },

    cek_antrian_dine_in: async ({ jumlah_orang }) => {
        logger.info("[Resto Skill]", `Cek antrian: ${jumlah_orang} orang`);

        const antrianSaatIni = ANTRIAN_DB.length;
        const mejaKosong = MEJA_DB.filter(m => m.tersedia && m.kapasitas >= jumlah_orang).length;
        const estimasiMenit = mejaKosong > 0 ? 0 : antrianSaatIni * 20;

        return {
            antrian_saat_ini: antrianSaatIni,
            meja_tersedia: mejaKosong,
            estimasi_tunggu: mejaKosong > 0
                ? 'Langsung bisa duduk!'
                : `Estimasi tunggu ±${estimasiMenit} menit`,
            saran: mejaKosong === 0
                ? 'Disarankan reservasi terlebih dahulu untuk menghindari antrian.'
                : null
        };
    },

    order_takeaway: async ({ nama, telepon, pesanan, jam_ambil }) => {
        logger.info("[Resto Skill]", `Takeaway: ${nama} - ${pesanan?.length} item`);

        // Validasi dan hitung total
        let total = 0;
        const detail_pesanan = [];
        const semua_menu = Object.values(MENU_DB).flat();

        for (const item of (pesanan || [])) {
            const menu = semua_menu.find(m => m.id === item.id_menu);
            if (!menu) {
                return { sukses: false, pesan: `Menu ID "${item.id_menu}" tidak ditemukan.` };
            }
            if (!menu.tersedia) {
                return { sukses: false, pesan: `Menu "${menu.nama}" sedang habis.` };
            }
            const subtotal = menu.harga * item.jumlah;
            total += subtotal;
            detail_pesanan.push({
                nama: menu.nama, jumlah: item.jumlah,
                subtotal_format: `Rp ${subtotal.toLocaleString('id-ID')}`
            });
        }

        const id_order = `TKW-${Date.now().toString().slice(-5)}`;
        const estimasi_siap = jam_ambil || '±30 menit';

        return {
            sukses: true,
            id_order, nama, telepon,
            detail_pesanan,
            total_format: `Rp ${total.toLocaleString('id-ID')}`,
            estimasi_siap,
            pesan: `Order takeaway dicatat! ID: ${id_order}. Pesanan siap diambil ${estimasi_siap}.`
        };
    }
};