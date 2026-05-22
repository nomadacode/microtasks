# ✅ MicroTasks — Gestor de tareas con desglose inteligente por IA

Una app web que usa inteligencia artificial para descomponer automáticamente cualquier tarea compleja en subtareas y sub-subtareas accionables. Describís lo que querés hacer, y la IA se encarga de estructurarlo.

---

## ¿Qué problema resuelve?

Cuando tenés una tarea grande — "Lanzar campaña de marketing", "Rediseñar el sitio web", "Preparar el cierre de mes" — empezar desde cero es difícil. MicroTasks toma esa tarea, la manda a la IA y te devuelve un plan de acción organizado en niveles, listo para ir tachando.

---

## ¿Qué hace exactamente?

### Creación de tareas con IA
- Ingresás un **título** y una **descripción** para tu tarea
- La app valida que la información tenga suficiente detalle antes de llamar a la IA (evita respuestas vacías o genéricas)
- Si la IA necesita más contexto, te lo avisa con un mensaje específico en lugar de generar subtareas inútiles
- Si todo está bien, genera una jerarquía de **subtareas** + **sub-subtareas** adaptada a la complejidad real de la tarea (entre 2 y 8 por nivel, sin inflar pasos artificialmente)

### Gestión de tareas
- Las tareas se muestran en un **grid de cards** con título, descripción y barra de progreso
- Cada card tiene un botón **Ver Detalles** que abre un modal con toda la jerarquía
- **Progreso automático**: al tildar subtareas y sub-subtareas, la barra de progreso se recalcula en tiempo real. Si una subtarea tiene sub-subtareas, su estado se determina por si todas ellas están completadas
- **Editar subtareas**: hacé clic sobre el nombre de una subtarea para editarlo inline
- **Agregar manualmente**: podés agregar subtareas y sub-subtareas adicionales que la IA no generó
- **Eliminar** cualquier elemento (tarea, subtarea, sub-subtarea) con confirmación
- **Persistencia local**: todo el estado se guarda en `localStorage` — cerrás el navegador, abrís de nuevo, y tus tareas siguen ahí

---

## Arquitectura

El proyecto está dividido en dos partes independientes:

### Frontend (cliente)
- **Vue.js 2** (CDN, sin build step)
- **Tailwind CSS 2** (CDN)
- HTML + CSS + JS vanilla — se puede abrir directamente en el navegador o servir con cualquier servidor estático
- Se comunica con el backend vía `axios`

### Backend (API)
- **Node.js + Express**
- Recibe el título y descripción, los valida, y llama a la API de OpenAI
- Usa el modelo configurable vía `OPENAI_MODEL` (default: `gpt-4o-mini`)
- El prompt fuerza respuesta en JSON estructurado con `response_format: { type: 'json_object' }`
- Incluye **rate limiting**: máximo 10 requests por minuto por IP
- CORS configurable por variable de entorno

---

## Stack tecnológico

| Capa | Tecnología | Versión |
|---|---|---|
| **UI Framework** | Vue.js | 2.6 (CDN) |
| **Estilos** | Tailwind CSS | 2.2 (CDN) |
| **HTTP client (frontend)** | Axios | CDN |
| **Runtime (backend)** | Node.js | ≥ 16 |
| **Framework (backend)** | Express | 4.21 |
| **IA** | OpenAI API | gpt-4o-mini (configurable) |
| **Rate limiting** | express-rate-limit | 7.4 |
| **Variables de entorno** | dotenv | 16 |

---

## Estructura del proyecto

```
├── index.html        # App completa del frontend (Vue montado en #app)
├── app.js            # Lógica Vue: estado, métodos, comunicación con la API
├── styles.css        # Estilos custom (complementa Tailwind)
├── server.js         # Backend Express: endpoint /api/generate-subtasks
├── package.json      # Dependencias del backend
└── .env              # Variables de entorno (no incluido en el repo)
```

---

## Setup local

### Backend

```bash
npm install
```

Crear un archivo `.env` en la raíz con:

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini       # opcional, es el default
PORT=3000                       # opcional, default 3000
CORS_ORIGIN=http://localhost:5500,http://127.0.0.1:5500   # orígenes permitidos
```

```bash
npm start
# Servidor corriendo en http://localhost:3000
```

### Frontend

No necesita build. Abrí `index.html` directamente en el navegador o usá una extensión como **Live Server** en VS Code.

> Si el frontend corre en un origen distinto al backend, asegurate de incluirlo en `CORS_ORIGIN`.

---

## Endpoint de la API

### `POST /api/generate-subtasks`

Genera subtareas para una tarea dada.

**Request body:**
```json
{
  "title": "Lanzar campaña de marketing",
  "description": "Necesitamos lanzar una campaña de email marketing para el producto nuevo, apuntando a nuestra base de clientes existentes."
}
```

**Respuesta exitosa:**
```json
{
  "needs_more_details": false,
  "subtasks": [
    {
      "title": "Definir público objetivo",
      "subsubtasks": [
        { "title": "Segmentar base de clientes" },
        { "title": "Definir criterios de filtrado" }
      ]
    },
    {
      "title": "Crear el contenido",
      "subsubtasks": [
        { "title": "Escribir el asunto del email" },
        { "title": "Diseñar el template" }
      ]
    }
  ]
}
```

**Respuesta cuando falta info:**
```json
{
  "needs_more_details": true,
  "message": "¿A qué audiencia va dirigida la campaña y cuál es el objetivo principal?"
}
```

**Rate limit:** 10 requests/minuto por IP. Excedido → HTTP 429.

**Validaciones:**
- `title` y `description` son obligatorios
- `title` máximo 100 caracteres
- `description` máximo 500 caracteres

---

## Lógica de validación del frontend

Antes de llamar a la API, el frontend corre sus propias validaciones en `validateNewTask()`:

- Título: mínimo 3 caracteres, no puede ser solo palabras cortas inválidas (`x`, `ok`, `aa`, etc.)
- Descripción: mínimo 15 caracteres y 4 palabras, sin términos triviales
- Ambos tienen máximos (100 y 500 caracteres)

Esto evita gastar llamadas a la API en entradas claramente inválidas.

---

## Lógica de progreso

El cálculo del progreso no es simplemente "subtareas completadas / total":

- Si una subtarea **tiene sub-subtareas**, su peso en el progreso viene de sus sub-subtareas (no del checkbox propio)
- Si una subtarea **no tiene sub-subtareas**, cuenta como una unidad directa
- Al tildar una subtarea padre, todas sus sub-subtareas se marcan automáticamente
- Al tildar todas las sub-subtareas de una subtarea, el padre se marca automáticamente

Resultado: el progreso siempre refleja el trabajo real hecho, no solo los niveles marcados.

---

## Deploy del backend

El backend está deployado en **Render** (`https://microtasks-backend.onrender.com`). El frontend apunta a esa URL hardcodeada en `app.js`. Para usar tu propia instancia, cambiá la constante `apiUrl` en `sendToAI()`.

---

## Sobre el proyecto

Construido como herramienta de productividad personal para explorar el uso de LLMs en flujos de gestión de tareas. El foco estuvo en que la IA agregue valor real (no genere subtareas genéricas e inútiles) y en que la experiencia de usuario sea fluida sin frameworks pesados ni pasos de build.

---

*Vue.js 2 · Express · OpenAI API · Tailwind CSS · localStorage*
