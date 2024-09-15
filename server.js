const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config(); // Carga las variables del archivo .env

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(cors({
    origin: 'microtasks2024.vercel.app'  // Reemplaza con la URL de tu frontend en Vercel
  }));

app.post('/api/generate-subtasks', async (req, res) => {
    const { title, description } = req.body;
    console.log("Recibiendo solicitud con título:", title, "y descripción:", description);

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: 'Eres un asistente que ayuda a descomponer tareas en subtareas y sub-subtareas.' },
                    { role: 'user', content: `Genera una lista de **4 subtareas** con **4 sub-subtareas** para completar la siguiente tarea: "${title}". Descripción: "${description}". No hagas introducciones, explicaciones o conclusiones` }
                ],
                max_tokens: 500, // Aumentar la cantidad de tokens
                temperature: 0.7
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const generatedSubtasks = response.data.choices[0].message.content.trim().split('\n');

        res.json({ subtasks: generatedSubtasks });
    } catch (error) {
        console.error('Error al generar subtareas:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Error al generar subtareas' });
    }
});


app.listen(port, () => {
    console.log(`Servidor funcionando en el puerto ${port}`);
});
