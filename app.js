new Vue({
    el: '#app',
    created() {
        try {
            const stored = localStorage.getItem('microtasks.tasks');
            if (stored) {
                this.tasks = JSON.parse(stored);
            }
        } catch (error) {
            console.warn('No se pudo restaurar el estado guardado:', error);
        }
    },
    watch: {
        tasks: {
            deep: true,
            handler(value) {
                try {
                    localStorage.setItem('microtasks.tasks', JSON.stringify(value));
                } catch (error) {
                    console.warn('No se pudo persistir el estado:', error);
                }
            }
        }
    },
    data() {
        return {
            tasks: [],
            newTask: {
                title: '',
                description: ''
            },
            selectedTask: null,
            showNewTaskModal: false,
            showTaskModal: false,
            formError: '',
            isLoading: false,
            newSubsubtaskIndex: null,
            newSubsubtaskTitle: '',
            editingSubtaskIndex: null,
            editedSubtaskTitle: '',
            isAddingSubtask: false,
            newSubtaskTitle: ''
        };
    },
    methods: {
        // Función para abrir/cerrar el modal de Nueva Tarea
        toggleModalNewTask() {
            this.showNewTaskModal = !this.showNewTaskModal;
            this.formError = '';
        },

        // Función para abrir el modal de Subtareas de una tarea seleccionada
        openTaskModal(task) {
            this.selectedTask = task;
            this.showTaskModal = true;
        },

        // Función para cerrar el modal de Subtareas
        closeTaskModal() {
            this.selectedTask = null;
            this.showTaskModal = false;
            this.newSubsubtaskIndex = null;
            this.newSubsubtaskTitle = '';
        },

        // Función para limpiar el prefijo de sub-subtareas
        cleanSubtaskText(subtaskText) {
            return subtaskText.replace(/Sub-subtarea \d+:\s*/, '').trim();
        },

        // Enviar la tarea a la API de OpenAI
        sendToAI() {
            this.isLoading = true;
            const apiUrl = 'https://microtasks-backend.onrender.com'; // Cambia esto por la URL de tu backend en Render
            const needsMoreDetailsPrefix = 'NECESITO_MAS_DETALLES:';
            const invalidTerms = new Set(['x', 'xx', 'ok', 'aa', 'bb', 'cc']);
            const minTitleLength = 3;
            const minDescriptionLength = 15;
            const minDescriptionWords = 4;
            const countWords = (text) => text.split(/\s+/).filter(Boolean).length;
            const isInvalidContent = (text) => {
                const normalized = text.toLowerCase();
                if (invalidTerms.has(normalized)) {
                    return true;
                }
                const words = normalized.split(/\s+/).filter(Boolean);
                return words.length > 0 && words.every(word => word.length <= 2);
            };

            const title = this.newTask.title.trim();
            const description = this.newTask.description.trim();

            if (!title || !description) {
                this.formError = 'Por favor completa el título y la descripción.';
                this.isLoading = false;
                return;
            }

            if (title.length < minTitleLength || isInvalidContent(title)) {
                this.formError = 'El título debe tener más detalles (mínimo 3 caracteres y evitar términos inválidos).';
                this.isLoading = false;
                return;
            }

            if (description.length < minDescriptionLength || countWords(description) < minDescriptionWords || isInvalidContent(description)) {
                this.formError = 'La descripción debe incluir más detalles (mínimo 15 caracteres, 4 palabras y sin términos inválidos).';
                this.isLoading = false;
                return;
            }

            if (title.length > 100) {
                this.formError = 'El título debe tener 100 caracteres o menos.';
                this.isLoading = false;
                return;
            }

            if (description.length > 500) {
                this.formError = 'La descripción debe tener 500 caracteres o menos.';
                this.isLoading = false;
                return;
            }

            this.formError = '';

            if (title && description) {
                axios.post(`${apiUrl}/api/generate-subtasks`, {
                    title,
                    description
                })
                .then(response => {
                    const subtasksPayload = response.data.subtasks;
                    const markerCandidate = Array.isArray(subtasksPayload) ? subtasksPayload[0] : subtasksPayload;
                    const markerText = typeof markerCandidate === 'string' ? markerCandidate.trim() : '';

                    if (markerText.startsWith(needsMoreDetailsPrefix)) {
                        this.formError = 'Necesitamos más detalles para generar subtareas. Por favor amplía el título o la descripción.';
                        return;
                    }

                    const subtasks = this.parseGPTResponse(subtasksPayload);
                    
                    // Aplicamos la limpieza de texto SOLO al título de las sub-subtareas
                    subtasks.forEach(subtask => {
                        if (subtask.subsubtasks) {
                            subtask.subsubtasks = subtask.subsubtasks.map(subsubtask => ({
                                ...subsubtask, // Mantenemos el resto del objeto intacto
                                title: this.cleanSubtaskText(subsubtask.title) // Limpiamos solo el título
                            }));
                        }
                    });

                    this.tasks.push({
                        id: Date.now(),
                        title,
                        description,
                        subtasks: subtasks,
                        progress: 0
                    });
            
                    // Cierra el modal de nueva tarea
                    this.toggleModalNewTask(); 
            
                    // Restablece el formulario
                    this.newTask.title = '';
                    this.newTask.description = '';
                    this.formError = '';
                })
                .catch(error => {
                    console.error("Error al generar subtareas:", error.response ? error.response.data : error.message);
                    this.formError = 'No pudimos generar las subtareas. Verificá tu conexión e intentá de nuevo.';
                })
                .finally(() => {
                    this.isLoading = false;
                });
            }
        },

        // Función para parsear la respuesta de GPT y organizar subtareas/sub-subtareas
        parseGPTResponse(subtasksArray) {
            const subtasks = [];
            let currentSubtask = null;

            const subtaskPattern = /^\d+[\.)]\s+/; // "1." o "1)"
            const subsubtaskNumberedPattern = /^\d+\.\d+\s+/; // "1.1"
            const bulletPattern = /^[-•*]\s+/; // "-", "•", "*"

            subtasksArray.forEach(line => {
                line = line.trim();
                if (line === '') {
                    // Ignorar líneas vacías
                    return;
                }
                // Detectar subtareas principales (ej: "1. Investigar mercado argentino")
                if (subtaskPattern.test(line)) {
                    const title = line.replace(subtaskPattern, '').trim();
                    if (!title) {
                        return;
                    }
                    if (currentSubtask) {
                        subtasks.push(currentSubtask);
                    }
                    currentSubtask = {
                        title,
                        description: '',
                        completed: false,
                        subsubtasks: []
                    };
                }
                // Detectar sub-subtareas enumeradas (ej: "1.1 Analizar competencia")
                else if (subsubtaskNumberedPattern.test(line)) {
                    if (currentSubtask) {
                        const title = line.replace(subsubtaskNumberedPattern, '').trim();
                        if (!title) {
                            return;
                        }
                        currentSubtask.subsubtasks.push({
                            title,
                            completed: false
                        });
                    }
                }
                // Detectar sub-subtareas con viñetas (ej: "- Analizar competencia")
                else if (bulletPattern.test(line)) {
                    if (currentSubtask) {
                        const title = line.replace(bulletPattern, '').trim();
                        if (!title) {
                            return;
                        }
                        currentSubtask.subsubtasks.push({
                            title,
                            completed: false
                        });
                    }
                }
                // Ignorar líneas de ruido u otros formatos
            });

            if (currentSubtask) {
                subtasks.push(currentSubtask);
            }

            return subtasks;
        },

        // Función para actualizar el progreso de la tarea al hacer clic en una subtarea o sub-subtarea
        updateProgress(item, type, parentSubtask = null) {
            if (type === 'subtask' && item.subsubtasks) {
                item.subsubtasks.forEach(subsubtask => {
                    subsubtask.completed = item.completed;
                });
            }
        
            // Si es una sub-subtarea, verificar si todas las sub-subtareas están completadas
            if (type === 'subsubtask' && parentSubtask) {
                const allSubSubtasksCompleted = parentSubtask.subsubtasks.every(sub => sub.completed);
                parentSubtask.completed = allSubSubtasksCompleted;
            }
        
            // Recalcular el progreso de la tarea completa
            this.calculateTaskProgress();
        },

        // Calcular el porcentaje de progreso total basado en subtareas y sub-subtareas
        calculateTaskProgress() {
            if (this.selectedTask) {
                let totalItems = 0;
                let completedItems = 0;

                // Calcular total de subtareas y sub-subtareas
                this.selectedTask.subtasks.forEach(subtask => {
                    if (subtask.subsubtasks.length > 0) {
                        totalItems += subtask.subsubtasks.length;
                        completedItems += subtask.subsubtasks.filter(sub => sub.completed).length;
                    } else {
                        totalItems += 1;
                        if (subtask.completed) {
                            completedItems += 1;
                        }
                    }
                });

                const progress = totalItems === 0 ? 0 : (completedItems / totalItems) * 100;
                this.selectedTask.progress = Math.round(progress);
            }
        },

        // Función para eliminar una tarea
        deleteTask(taskId) {
            this.tasks = this.tasks.filter(task => task.id !== taskId);
        },

        addSubtask() {
            this.isAddingSubtask = true;
            this.newSubtaskTitle = '';
        },

        saveSubtask() {
            const title = this.newSubtaskTitle.trim();
            if (!title) {
                return;
            }
            this.selectedTask.subtasks.push({
                title,
                description: '',
                completed: false,
                subsubtasks: []
            });
            this.cancelAddSubtask();
            this.calculateTaskProgress();
        },

        cancelAddSubtask() {
            this.isAddingSubtask = false;
            this.newSubtaskTitle = '';
        },

        // Función para agregar una sub-subtarea
        addSubsubtask(subtaskIndex) {
            this.newSubsubtaskIndex = subtaskIndex;
            this.newSubsubtaskTitle = '';
        },

        // Función para guardar una nueva sub-subtarea
        saveSubsubtask(subtaskIndex) {
            if (this.newSubsubtaskTitle.trim() !== '') {
                this.selectedTask.subtasks[subtaskIndex].subsubtasks.push({
                    title: this.newSubsubtaskTitle.trim(),
                    completed: false
                });
                this.newSubsubtaskIndex = null;
                this.newSubsubtaskTitle = '';
                this.calculateTaskProgress();
            }
        },

        // Función para eliminar una subtarea
        deleteSubtask(subtaskIndex) {
            this.selectedTask.subtasks.splice(subtaskIndex, 1);
            this.calculateTaskProgress();
        },

        // Función para eliminar una sub-subtarea
        deleteSubsubtask(subtaskIndex, subsubtaskIndex) {
            this.selectedTask.subtasks[subtaskIndex].subsubtasks.splice(subsubtaskIndex, 1);
            this.calculateTaskProgress();
        },

        // NUEVA Función para iniciar la edición de una subtarea
        editSubtask(subtaskIndex) {
            this.editingSubtaskIndex = subtaskIndex; // Guardamos el índice de la subtarea en edición
            this.editedSubtaskTitle = this.selectedTask.subtasks[subtaskIndex].title; // Almacenamos el título actual
        },

        // NUEVA Función para guardar el nuevo nombre de la subtarea
        saveEditedSubtask(subtaskIndex) {
            if (this.editedSubtaskTitle.trim() !== '') {
                this.selectedTask.subtasks[subtaskIndex].title = this.editedSubtaskTitle.trim(); // Actualizamos el título
            }
            this.cancelEditSubtask(); // Salimos del modo edición
        },

        // NUEVA Función para cancelar la edición
        cancelEditSubtask() {
            this.editingSubtaskIndex = null;
            this.editedSubtaskTitle = '';
        }
    }
});
