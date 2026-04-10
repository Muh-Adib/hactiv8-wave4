import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import multer from 'multer';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
import Fuse from 'fuse.js';

// Load Konfigurasi Model (Failback)
import fs from 'fs';
const rawModels = fs.readFileSync(new URL('./models.json', import.meta.url));
const modelList = JSON.parse(rawModels);

const app = express();
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// ==========================================
// 1. STATE & PENYIMPANAN
// ==========================================
let chatbotSettings = {
    systemPrompt: "Anda adalah asisten Customer Service. Jawab secara profesional menggunakan Markdown.",
    useWebSearch: true
};

let documentChunks = []; 
let fuseIndex = new Fuse([], { keys: ['text'], threshold: 0.5, ignoreLocation: true });

// Penyimpan State Blacklist (Limit Kuota Kena Batas)
// Format: { "gemini-2.5-flash": 1712613141203 } (Menyimpan timestamp terakhir error)
const blacklistedModels = {};

// ==========================================
// 2. TOOLS E-COMMERCE (FUNGSI INTERNAL)
// ==========================================

// Daftar definisi/skema tools untuk Gemini
const ecomToolsDescs = {
    functionDeclarations: [
        {
            name: "cek_stok",
            description: "Cek ketersediaan sisa stok barang di gudang.",
            parameters: {
                type: "OBJECT",
                properties: { nama_barang: { type: "STRING", description: "Nama produk" } },
                required: ["nama_barang"]
            }
        },
        {
            name: "buat_pesanan",
            description: "Mencatat dan memproses pemesanan baru untuk pelanggan.",
            parameters: {
                type: "OBJECT",
                properties: {
                    nama_barang: { type: "STRING" },
                    jumlah: { type: "NUMBER" },
                    nama_pembeli: { type: "STRING" },
                    alamat: { type: "STRING" }
                },
                required: ["nama_barang", "jumlah", "nama_pembeli", "alamat"]
            }
        },
        {
            name: "proses_pembayaran",
            description: "Memverifikasi apakah pembayaran pelanggan telah masuk dan sah.",
            parameters: {
                type: "OBJECT",
                properties: {
                    id_pesanan: { type: "STRING" },
                    metode_pembayaran: { type: "STRING" }
                },
                required: ["id_pesanan", "metode_pembayaran"]
            }
        },
        {
            name: "kirim_ke_gudang",
            description: "Meminta tim logistik/gudang untuk mengemas dan mengirimkan pesanan berstatus Lunas.",
            parameters: {
                type: "OBJECT",
                properties: { id_pesanan: { type: "STRING" } },
                required: ["id_pesanan"]
            }
        }
    ]
};

// Implementasi Nyata dari Function Calling (Proses/Logika Bisnis)
function jalankanFungsiInternal(cmdName, args) {
    console.log(`[SISTEM] AI memanggil fungsi '${cmdName}' -> Data:`, args);
    
    if (cmdName === 'cek_stok') {
        const stokAcak = Math.floor(Math.random() * 50);
        return { sisa_stok: stokAcak, keterangan: stokAcak > 0 ? "Stok tersedia" : "Kosong/Habis" };
    }
    else if (cmdName === 'buat_pesanan') {
        const idOrd = 'ORD-' + Math.floor(Math.random() * 1000000);
        return { id_pesanan: idOrd, status: "Tercatat di sistem", detail: `Pesanan ${args.jumlah}x ${args.nama_barang} atas nama ${args.nama_pembeli} diproses menunggu pembayaran.` };
    }
    else if (cmdName === 'proses_pembayaran') {
        return { staus_pembayaran: "Selesai Diverifikasi", instruksi_lanjutan: "Silakan hubungi fungsi kirim_ke_gudang agar dipacking." };
    }
    else if (cmdName === 'kirim_ke_gudang') {
        return { resi_pengiriman: "RESI" + Date.now(), status: "Packing di Gudang Pusat selesai, dikirim ke kurir." };
    }
    return { error: 'Fungsi tidak valid di sistem.' };
}

// ==========================================
// 3. CORE ROUTER FAILOVER (Pencegah Limit Rate)
// ==========================================

function isModelHealthy(modelId) {
    const freezeTime = blacklistedModels[modelId];
    if (!freezeTime) return true;
    
    // Apakah masa limit sudah berlalu (Cek apakah sudah beda hari atau lewat 24 Jam)
    const HARI_DALAM_MS = 24 * 60 * 60 * 1000; 
    const isExpired = (Date.now() - freezeTime) > HARI_DALAM_MS;
    
    if (isExpired) {
        // Jika sudah ganti hari, pulihkan model ke status SEHAT
        delete blacklistedModels[modelId];
        console.log(`[ROUTER] Model ${modelId} telah dipulihkan dari daftar hitam hari ini.`);
        return true;
    }
    return false; // Model masih di block / over limit
}

async function callGenAIFailover(contents, contextText, isToolTurn = false) {
    // Mencoba satu per satu urutan model yang ada di json
    for (const modelConfig of modelList) {
        if (!isModelHealthy(modelConfig.id)) {
            console.log(`[ROUTER] Melewati ${modelConfig.id} karena sedang terblokir limit kemarin/hari ini.`);
            continue;
        }

        try {
            console.log(`[ROUTER] Mencoba memanggil Model => ${modelConfig.id}`);
            
            // Konfigurasi Standar
            const config = {
                temperature: 0.4,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 2048,
                systemInstruction: chatbotSettings.systemPrompt + contextText
            };

            const modelTools = [];

            // Peraturan API Google: Native googleSearch dan Function Custom Tools TIDAK BISA digabung di 1 request.
            // Kita pisahkan secara tegas: Jika toggle "Web Search" ON, jalankan Web Search.
            // Jika toggle "Web Search" OFF, jalankan Custom Tools E-Commerce.

            if (chatbotSettings.useWebSearch && modelConfig.supportsSearch) {
                modelTools.push({ googleSearch: {} });
            } else if (!chatbotSettings.useWebSearch && modelConfig.supportsTools) {
                modelTools.push(ecomToolsDescs);
            }

            if (modelTools.length > 0) {
                config.tools = modelTools;
            }

            // Tembak API Utama
            const response = await genAI.models.generateContent({
                model: modelConfig.id,
                contents,
                config
            });

            // 1. Cek apakah AI memanggil Trik Function
            if (response.functionCalls && response.functionCalls.length > 0) {
                const callInfo = response.functionCalls[0];
                const fnResult = jalankanFungsiInternal(callInfo.name, callInfo.args);
                
                // Masukkan respons fungsi ke keranjang historis lalu kirim ulang ke AI secara langsung
                contents.push({ role: 'model', parts: [{ functionCall: { name: callInfo.name, args: callInfo.args } }] });
                contents.push({ role: 'user', parts: [{ functionResponse: { name: callInfo.name, response: fnResult } }] });
                
                // Rekursif panggil kembali agar model bisa memahami data stok
                return await callGenAIFailover(contents, contextText, true); 
            }

            // 2. Jika cuma jawaban biasa, return text.
            return response.text;

        } catch (error) {
            console.error(`[ROUTER FAIL] Model ${modelConfig.id} Gagal. Alasan:`, error.message);
            // Tangkap Error Khusus Spikes/Kuota Habis (429 atau 503)
            if (error.status === 429 || error.status === 503 || String(error.message).includes('exhausted') || String(error.message).includes('high demand')) {
                console.warn(`⚠️ Memasukkan ${modelConfig.id} ke daftar pemblokiran sementara (Blacklist Harian).`);
                blacklistedModels[modelConfig.id] = Date.now();
                // Looping akan jalan ke modelConfig berikutnya!
            } else {
                // Return Error lain yg bukan soal kuota/limit
                throw error; 
            }
        }
    }
    
    throw new Error('Semua model AI yang tersedia dalam daftar routing sedang over-limit atau rusak.');
}


// ==========================================
// 4. WEBSERVER ENDPOINTS
// ==========================================

function chunkText(text, maxWords = 250) {
    const words = text.split(/\s+/);
    const chunks = [];
    let currentChunk = [];
    for (let word of words) {
        currentChunk.push(word);
        if (currentChunk.length >= maxWords) {
            chunks.push(currentChunk.join(" "));
            currentChunk = [];
        }
    }
    if (currentChunk.length > 0) chunks.push(currentChunk.join(" "));
    return chunks;
}

app.post('/api/settings', upload.single('document'), async (req, res) => {
    try {
        const { systemPrompt, useWebSearch } = req.body;
        if (systemPrompt) chatbotSettings.systemPrompt = systemPrompt;
        chatbotSettings.useWebSearch = (useWebSearch === 'true');

        if (req.file) {
            let extractedText = "";
            if (req.file.mimetype === 'application/pdf') extractedText = (await pdfParse(req.file.buffer)).text;
            else if (req.file.mimetype === 'text/plain') extractedText = req.file.buffer.toString('utf-8');
            else return res.status(400).json({ error: "Gunakan tipe PDF/TXT." });

            const chunks = chunkText(extractedText);
            documentChunks = chunks.map((text, id) => ({ id, text }));
            fuseIndex = new Fuse(documentChunks, { keys: ['text'], threshold: 0.6, ignoreLocation: true, includeScore: true });
        }
        res.json({ message: "Konfigurasi ter-update." });
    } catch (e) {
        res.status(500).json({ error: "Gagal: " + e.message });
    }
});

app.post('/api/chat', async (req, res) => {
    const { conversation } = req.body;
    try {
        if (!Array.isArray(conversation)) return res.status(400).json({ error: 'Payload tidak valid' });

        const contents = conversation.map(({role, text}) => ({
            role,
            parts:[{ text }]
        }));

        const latestQuery = contents[contents.length - 1].parts[0].text;
        
        let localRAGContext = "";
        if (documentChunks.length > 0) {
            const results = fuseIndex.search(latestQuery);
            const topChunks = results.slice(0, 2).map(r => r.item.text);
            if (topChunks.length > 0) {
                localRAGContext = "\n\nREFERENSI SOP TOKO:\n" + topChunks.join("\n\n");
            }
        }

        // Jalankan Autopilot Failover Logic
        const finalAnswerText = await callGenAIFailover(contents, localRAGContext);

        res.json({ response: finalAnswerText });

    } catch (error) {
        console.error('Error in chat:', error);
        res.status(500).json({ message: error.message || 'Error internal server' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server siap - Router E-Commerce Aktif di: http://localhost:${PORT}`));