import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { autoLoadSkills } from './core/router.js';
import { apiRouter } from './routes/api.js';
import { logger } from './utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());

// Serve frontend statis (index.html, script.js, style.css)
app.use(express.static(path.join(__dirname, 'public')));

// Bootloader Engine
async function bootSistem() {
    logger.info("Memulai Aplikasi Server Chatbot CS Enterprise...");
    
    // 1. Ekstrak & Inject Modular Skills secara Dinamis
    await autoLoadSkills();

    // 2. Tancapkan API Endpoints
    app.use('/api', apiRouter);

    // 3. Fallback: semua route non-API kembalikan index.html (SPA support)
    // Di Express 5, gunakan app.use sebagai penampung akhir tanpa router khusus.
    app.use((req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // 4. Jalankan HTTP Server
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        logger.success(`Sistem Utama Berjalan pada http://localhost:${PORT}`);
        logger.info(`Frontend: buka http://localhost:${PORT} di browser`);
    });
}

// Fire the bootloader
bootSistem().catch(err => logger.error("Gagal men-start sistem utama", err));
