const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

app.use(bodyParser.json({ limit: '16kb' }));
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`Origen no permitido: ${origin}`));
    },
    methods: 'GET,POST,PUT,DELETE',
    allowedHeaders: 'Content-Type,Authorization'
}));

const generateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes. Intentá de nuevo en un minuto.' }
});

const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function validatePayload({ title, description }) {
    if (typeof title !== 'string' || typeof description !== 'string') {
        return 'title y description son obligatorios y deben ser texto.';
    }
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    if (!trimmedTitle || !trimmedDescription) {
        return 'title y description no pueden estar vacíos.';
    }
    if (trimmedTitle.length > MAX_TITLE_LENGTH) {
        return `title supera el máximo de ${MAX_TITLE_LENGTH} caracteres.`;
    }
    if (trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
        return `description supera el máximo de ${MAX_DESCRIPTION_LENGTH} caracteres.`;
    }
    return null;
}

app.post('/api/generate-subtasks', generateLimiter, async (req, res) => {
    const validationError = validatePayload(req.body || {});
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    const title = req.body.title.trim();
    const description = req.body.description.trim();

    const systemPrompt = 'Eres un asistente que descompone tareas en subtareas y sub-subtareas. Responde siempre en JSON válido siguiendo el esquema solicitado, sin texto adicional.';
    const userPrompt = `Tarea: "${title}". Descripción: "${description}".\n\n` +
        `Si el título o la descripción son ambiguos o están incompletos, respondé exactamente: {"needs_more_details": true, "message": "<breve aclaración solicitada>"}.\n` +
        `Si son claros, respondé con: {"needs_more_details": false, "subtasks": [{"title": "...", "subsubtasks": [{"title": "..."}, ...]}, ...]} con exactamente 4 subtareas y 4 sub-subtareas cada una.`;

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: OPENAI_MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                max_tokens: 600,
                temperature: 0.7,
                response_format: { type: 'json_object' }
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 20000
            }
        );

        const rawContent = response.data.choices?.[0]?.message?.content || '{}';
        let parsed;
        try {
            parsed = JSON.parse(rawContent);
        } catch (parseError) {
            console.error('Respuesta de OpenAI no es JSON válido:', rawContent);
            return res.status(502).json({ error: 'Respuesta inválida del modelo.' });
        }

        return res.json(parsed);
    } catch (error) {
        const status = error.response?.status;
        console.error('Error al generar subtareas:', status, error.response?.data || error.message);
        if (status === 429) {
            return res.status(429).json({ error: 'Servicio saturado, intentá de nuevo.' });
        }
        return res.status(502).json({ error: 'Error al generar subtareas.' });
    }
});

app.listen(port, () => {
    console.log(`Servidor funcionando en el puerto ${port}`);
});
