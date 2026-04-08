import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import express from 'express';
import multer from 'multer';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.use(express.json());

// Serve static files to access test.html
app.use(express.static('.'));

app.post('/generate-from-text', async (req, res) => {
    try {
        const { prompt } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const result = await genAI.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        res.json({ response: result.text });
    } catch (error) {
        console.error('Error generating content:', error);
        res.status(500).json({ message: error.message || 'Failed to generate content' });
    }
});

app.post('/generate-from-image', upload.single('image'), async (req, res) => {
    try {
        const { prompt } = req.body;
        const image = req.file;

        const contents = [
            { text: prompt || 'Tolong deskripsikan gambar berikut' },
            ...(image ? [{ inlineData: { mimeType: image.mimetype, data: image.buffer.toString('base64') } }] : [])
        ];

        const result = await genAI.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: contents }],
        });

        res.json({ response: result.text });
    } catch (error) {
        console.error('Error generating content:', error);
        res.status(500).json({ message: error.message || 'Failed to generate content' });
    }
});

app.post('/generate-from-document', upload.single('document'), async (req, res) => {
    try {
        const { prompt } = req.body;
        const document = req.file;

        const contents = [
            { text: prompt || 'Tolong buat ringkasan dari dokumen berikut' },
            ...(document ? [{ inlineData: { mimeType: document.mimetype, data: document.buffer.toString('base64') } }] : [])
        ];

        const result = await genAI.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: contents }],
        });

        res.json({ response: result.text });
    } catch (error) {
        console.error('Error generating content:', error);
        res.status(500).json({ message: error.message || 'Failed to generate content' });
    }
});

app.post('/generate-from-audio', upload.single('audio'), async (req, res) => {
    try {
        const { prompt } = req.body;
        const audio = req.file;

        const contents = [
            { text: prompt || 'Tolong transkrip audio berikut' },
            ...(audio ? [{ inlineData: { mimeType: audio.mimetype, data: audio.buffer.toString('base64') } }] : [])
        ];

        const result = await genAI.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: contents }],
        });

        res.json({ response: result.text });
    } catch (error) {
        console.error('Error generating content:', error);
        res.status(500).json({ message: error.message || 'Failed to generate content' });
    }
});

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});