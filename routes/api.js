import express from 'express';
import multer from 'multer';
import { createRequire } from 'module';
import Fuse from 'fuse.js';
import { callGenAIFailover } from '../core/router.js';
import { logger } from '../utils/logger.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

export const apiRouter = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// ===================================================
// SESSION CONFIG — State aktif chatbot di server
// ===================================================
let chatbotSettings = {
    brandVoice: "Anda adalah asisten virtual profesional. Bantulah dengan bahasa yang baik dan format Markdown.",
    useWebSearch: true,
    activeDocument: null, // { name, chunks, uploadedAt }
    activeDomain: 'ecommerce'
};

// RAG State
let documentChunks = []; 
let fuseIndex = new Fuse([], { keys: ['text'], threshold: 0.6, ignoreLocation: true });

// ===================================================
// HELPER: Chunk teks menjadi potongan kecil
// ===================================================
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

// ===================================================
// GET /config — Ambil konfigurasi aktif (untuk UI sync)
// ===================================================
apiRouter.get('/config', (req, res) => {
    res.json({
        useWebSearch: chatbotSettings.useWebSearch,
        activeDocument: chatbotSettings.activeDocument,
        activeDomain: chatbotSettings.activeDomain,
        brandVoicePreview: chatbotSettings.brandVoice?.substring(0, 60) + '...'
    });
});

// ===================================================
// POST /settings — Update konfigurasi + upload dokumen
// ===================================================
apiRouter.post('/settings', upload.single('document'), async (req, res) => {
    try {
        const { brandVoice, useWebSearch, activeDomain } = req.body;
        
        if (brandVoice) chatbotSettings.brandVoice = brandVoice;
        if (activeDomain) chatbotSettings.activeDomain = activeDomain;
        if (useWebSearch !== undefined) {
            chatbotSettings.useWebSearch = (useWebSearch === 'true');
        }

        // Handle Upload Dokumen (RAG)
        let documentInfo = null;
        if (req.file) {
            let extractedText = "";

            if (req.file.mimetype === 'application/pdf') {
                extractedText = (await pdfParse(req.file.buffer)).text;
            } else if (req.file.mimetype === 'text/plain') {
                extractedText = req.file.buffer.toString('utf-8');
            } else {
                return res.status(400).json({ error: "Tipe dokumen ditolak. Hanya menerima .pdf atau .txt" });
            }

            if (!extractedText || extractedText.trim().length < 10) {
                return res.status(400).json({ error: "Dokumen tidak bisa dibaca atau kosong." });
            }

            const chunks = chunkText(extractedText);
            documentChunks = chunks.map((text, id) => ({ id, text }));
            fuseIndex = new Fuse(documentChunks, {
                keys: ['text'],
                threshold: 0.6,
                ignoreLocation: true,
                includeScore: true
            });

            documentInfo = {
                name: req.file.originalname,
                chunks: documentChunks.length,
                sizeKb: Math.round(req.file.size / 1024),
                uploadedAt: new Date().toISOString()
            };

            // Simpan ke session config agar bisa dibaca endpoint /config
            chatbotSettings.activeDocument = documentInfo;

            logger.success(`Dokumen "${req.file.originalname}" di-index: ${documentChunks.length} chunk siap untuk RAG.`);
        }

        res.json({
            message: "Konfigurasi berhasil diterapkan.",
            config: {
                useWebSearch: chatbotSettings.useWebSearch,
                activeDomain: chatbotSettings.activeDomain,
                documentInfo // null jika tidak ada file baru
            }
        });

    } catch (e) {
        logger.error('API Settings Error:', e);
        res.status(500).json({ error: "Gagal memproses konfigurasi: " + e.message });
    }
});

// ===================================================
// POST /chat — Endpoint utama percakapan
// ===================================================

// Batasan sliding window: hanya kirim N pesan terakhir ke Gemini
// untuk mencegah overflow context window pada percakapan panjang
const MAX_HISTORY_WINDOW = 20;

apiRouter.post('/chat', async (req, res) => {
    const { conversation } = req.body;
    try {
        if (!Array.isArray(conversation) || conversation.length === 0) {
            return res.status(400).json({ error: 'Payload chat kosong/invalid' });
        }

        // Terapkan sliding window — ambil hanya N pesan terakhir
        const trimmedConversation = conversation.slice(-MAX_HISTORY_WINDOW);
        if (conversation.length > MAX_HISTORY_WINDOW) {
            logger.info(`Sliding window aktif: total ${conversation.length} pesan, dikirim ${trimmedConversation.length} terakhir.`);
        }

        const contents = trimmedConversation.map(({ role, text }) => ({
            role,
            parts: [{ text }]
        }));

        // RAG: Cari konteks relevan dari dokumen yang diupload (jika ada)
        const latestQuery = contents[contents.length - 1].parts[0].text;
        let localRAGContext = "";
        
        if (documentChunks.length > 0) {
            const results = fuseIndex.search(latestQuery);
            const topChunks = results.slice(0, 2).map(r => r.item.text);
            if (topChunks.length > 0) {
                localRAGContext = topChunks.join("\n\n");
                logger.info(`RAG: ${topChunks.length} chunk relevan ditemukan untuk query ini.`);
            }
        }

        // Jalankan Failover Router + Skill System
        const jawabanAI = await callGenAIFailover(contents, chatbotSettings, localRAGContext);

        res.json({ response: jawabanAI });

    } catch (error) {
        logger.error('Handler Chat Error:', error);
        res.status(500).json({ message: error.message || 'Gagal memproses ke server Google / Limit.' });
    }
});
