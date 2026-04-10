import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { logger } from '../utils/logger.js';

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const rawModels = fs.readFileSync(new URL('../models.json', import.meta.url));
export const modelList = JSON.parse(rawModels);

export const blacklistedModels = {};
export const MasterSkills = {}; // Terstruktur berdasarkan domain: { [domain]: { declarations: [], executors: {} } }

// ===================================================
// HELPER: Timeout wrapper untuk API call
// ===================================================
function withTimeout(promise, ms, modelId) {
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`TIMEOUT: Model ${modelId} tidak merespons dalam ${ms / 1000} detik.`)), ms)
    );
    return Promise.race([promise, timeout]);
}

// ===================================================
// 1. ENGINE AUTOLOAD PLUGIN (SKILLS)
// ===================================================
export async function autoLoadSkills() {
    const skillsDir = path.resolve('./skills');
    const files = fs.readdirSync(skillsDir).filter(f => f.endsWith('.js'));
    let loadedCount = 0;
    let failedCount = 0;

    for (const file of files) {
        try {
            const mod = await import(`file://${path.join(skillsDir, file)}`);
            const domain = mod.domain || 'global';
            
            if (!MasterSkills[domain]) {
                MasterSkills[domain] = { declarations: [], executors: {} };
            }
            if (mod.skillDeclarations) MasterSkills[domain].declarations.push(...mod.skillDeclarations);
            if (mod.executors) Object.assign(MasterSkills[domain].executors, mod.executors);
            loadedCount++;
            logger.success(`Plugin "${file}" (Domain: ${domain}) berhasil dimuat.`);
        } catch (e) {
            // Error boundary: satu plugin gagal tidak merusak keseluruhan server
            failedCount++;
            logger.error(`[AutoLoad] Plugin "${file}" GAGAL dimuat — server tetap berjalan tanpa skill ini.`, e);
        }
    }
    logger.success(`Skill Loader selesai: ${loadedCount} berhasil, ${failedCount} gagal.`);
    logger.info(`Domain aktif dalam memori: ${Object.keys(MasterSkills).join(', ')}`);
}

// ===================================================
// 2. CHECK STATUS KESEHATAN MODEL
// ===================================================
function isModelHealthy(modelId) {
    const freezeTime = blacklistedModels[modelId];
    if (!freezeTime) return true;
    
    // Recovery setelah 1 Menit (untuk dev/testing, diganti dari 24 Jam)
    if ((Date.now() - freezeTime) > (60 * 1000)) {
        delete blacklistedModels[modelId];
        logger.info(`Model ${modelId} telah dipulihkan dari blacklist.`);
        return true;
    }
    return false;
}

// ===================================================
// 3. FAILBACK ROUTING CORE
// ===================================================
export async function callGenAIFailover(contents, chatbotSettings, localRAGContext = '', depth = 0) {
    // Batas rekursi function calling (mencegah infinite loop)
    if (depth > 4) {
        return "Sistem sedang kewalahan melacak data tersebut. Bisa ulangi pertanyaan Anda?";
    }

    for (const modelConfig of modelList) {
        if (!isModelHealthy(modelConfig.id)) {
            logger.info(`Melewati ${modelConfig.id} — sedang diblacklist.`);
            continue;
        }

        try {
            logger.info(`Mencoba Model => ${modelConfig.id} (depth: ${depth})`);
            
            // Injeksi Template Kepribadian + Konteks Dokumen RAG (jika ada)
            const systemInstruction = 
                (chatbotSettings.brandVoice || chatbotSettings.systemPrompt) + 
                (localRAGContext ? `\n\nREFERENSI INTERNAL (dokumen yang diupload user):\n${localRAGContext}` : '');

            const config = {
                temperature: 0.4,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 2048,
                systemInstruction
            };

            // ---------------------------------------------------
            // ATURAN PENTING: Web Search dan Custom Function Tools
            // TIDAK BISA dikirim bersamaan ke API Gemini.
            // ---------------------------------------------------
            const modelTools = [];
            const activeDomain = chatbotSettings.activeDomain || 'ecommerce';
            
            if (chatbotSettings.useWebSearch && modelConfig.supportsSearch) {
                // Mode Web Search: gunakan Google Search native
                modelTools.push({ googleSearch: {} });
            } else if (!chatbotSettings.useWebSearch && modelConfig.supportsTools) {
                // Mode Skill: Ambil tool khusus untuk domain yang aktif dari memory
                const domainTools = MasterSkills[activeDomain];
                if (domainTools && domainTools.declarations.length > 0) {
                    modelTools.push({ functionDeclarations: domainTools.declarations });
                }
            }

            if (modelTools.length > 0) config.tools = modelTools;

            // Kirim ke Gemini dengan timeout 30 detik
            const response = await withTimeout(
                genAI.models.generateContent({
                    model: modelConfig.id,
                    contents,
                    config
                }),
                30000,
                modelConfig.id
            );

            // Handle Function Calling dari AI
            if (response.functionCalls && response.functionCalls.length > 0) {
                const callInfo = response.functionCalls[0];
                const activeDomain = chatbotSettings.activeDomain || 'ecommerce';
                const domainTools = MasterSkills[activeDomain];
                
                logger.info(`AI memanggil skill: "${callInfo.name}" (Domain: ${activeDomain})`, callInfo.args);

                const fnResult = (domainTools && domainTools.executors[callInfo.name])
                    ? await domainTools.executors[callInfo.name](callInfo.args)
                    : { error: `Skill "${callInfo.name}" tidak terdaftar pada domain ${activeDomain}.` };
                
                logger.info(`Skill "${callInfo.name}" selesai dieksekusi — hasilnya dikirim balik ke AI.`);
                
                // Masukkan function call asli + hasilnya ke conversation history
                if (response.candidates && response.candidates.length > 0 && response.candidates[0].content) {
                    contents.push(response.candidates[0].content);
                } else {
                    contents.push({ role: 'model', parts: [{ functionCall: { name: callInfo.name, args: callInfo.args } }] });
                }
                
                contents.push({ role: 'user', parts: [{ functionResponse: { name: callInfo.name, response: fnResult } }] });
                
                logger.info(`Isi contents sebelum rekursi:`, JSON.stringify(contents.slice(-3), null, 2));
                
                // Rekursif: Minta AI merangkai jawaban berdasarkan data dari fungsi
                return await callGenAIFailover(contents, chatbotSettings, localRAGContext, depth + 1); 
            }

            // Memeriksa respons detail jika kosong
            const hasParts = response.candidates && response.candidates.length > 0 && 
                             response.candidates[0].content && response.candidates[0].content.parts;
                             
            if (!hasParts || !response.text) {
                throw new Error('EMPTY_RESPONSE');
            }

            return response.text;

        } catch (error) {
            const isRateLimit = error.status === 429 || error.status === 503 || 
                String(error.message).includes('exhausted') || 
                String(error.message).includes('high demand');
            const isTimeout = String(error.message).startsWith('TIMEOUT:');
            const isEmptyResponse = error.message === 'EMPTY_RESPONSE';

            if (isRateLimit) {
                // Blacklist model selama 1 menit
                blacklistedModels[modelConfig.id] = Date.now();
                logger.warn(`⚠️ ${modelConfig.id} diblacklist (rate limit/503) — mencoba model berikutnya.`);
            } else if (isTimeout) {
                // Timeout: skip ke model berikutnya tanpa blacklist permanen
                logger.warn(`⏱️ ${modelConfig.id} timeout — mencoba model berikutnya tanpa memblacklist.`);
            } else if (isEmptyResponse) {
                logger.warn(`⚠️ ${modelConfig.id} merespons dengan konten kosong/terpotong — mencoba model berikutnya.`);
            } else {
                // Error lain (mis: auth, parsing) — langsung throw
                throw error;
            }
        }
    }
    
    throw new Error('Terjadi Gangguan: Semua model AI dalam daftar failover saat ini tidak tersedia.');
}
