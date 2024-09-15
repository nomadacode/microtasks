new Vue({
    el: '#app',
    data() {
        return {
            tasks: [],
            newTask: {
                title: '',
                description: ''
            },
            showNewTaskModal: false,
            showTaskModal: false,
            // Añadimos estas propiedades para manejar nuevas sub-subtareas
            newSubsubtaskIndex: null,
            newSubsubtaskTitle: '',
            editingSubtaskIndex: null,  // NUEVA variable para almacenar la subtarea en edición
            editedSubtaskTitle: ''      // NUEVA variable para almacenar temporalmente el nuevo título de la subtarea
        };
    },
    methods: {
        // Función para abrir/cerrar el modal de Nueva Tarea
        toggleModalNewTask() {
            this.showNewTaskModal = !this.showNewTaskModal;
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
            if (this.newTask.title && this.newTask.description) {
                axios.post('https://microtasks-backend.onrender.com', {
                    title: this.newTask.title,
                    description: this.newTask.description
                })
                .then(response => {
                    const subtasks = this.parseGPTResponse(response.data.subtasks);
                    
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
                        title: this.newTask.title,
                        description: this.newTask.description,
                        subtasks: subtasks,
                        progress: 0
                    });
            
                    // Cierra el modal de nueva tarea
                    this.toggleModalNewTask(); 
            
                    // Restablece el formulario
                    this.newTask.title = '';
                    this.newTask.description = '';
                })
                .catch(error => {
                    console.error("Error al generar subtareas:", error.response ? error.response.data : error.message);
                });
            }
        },

        // Función para parsear la respuesta de GPT y organizar subtareas/sub-subtareas
        parseGPTResponse(subtasksArray) {
            const subtasks = [];
            let currentSubtask = null;

            subtasksArray.forEach(line => {
                line = line.trim();
                if (line === '') {
                    // Ignorar líneas vacías
                    return;
                }
                // Detectar subtareas principales (ej: "1. Investigar mercado argentino")
                if (/^\d+\.\s+/.test(line)) {
                    if (currentSubtask) {
                        subtasks.push(currentSubtask);
                    }
                    currentSubtask = {
                        title: line.replace(/^\d+\.\s+/, ''), // Remover el número y punto
                        description: '',
                        completed: false,
                        subsubtasks: []
                    };
                }
                // Detectar sub-subtareas (ej: "- Analizar competencia")
                else if (/^- /.test(line)) {
                    if (currentSubtask) {
                        currentSubtask.subsubtasks.push({
                            title: line.replace(/^- /, ''), // Remover el guion
                            completed: false
                        });
                    }
                }
            });

            if (currentSubtask) {
                subtasks.push(currentSubtask);
            }

            return subtasks;
        },

        // Función para actualizar el progreso de la tarea al hacer clic en una subtarea o sub-subtarea
        updateProgress(item, type, parentSubtask = null) {
            item.completed = !item.completed; // Cambiar el estado de completado del item
        
            // Si es una subtarea, marcar o desmarcar todas las sub-subtareas asociadas
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

                // Calcular el porcentaje de progreso total
                const progress = (completedItems / totalItems) * 100;
                this.selectedTask.progress = Math.round(progress);
            }
        },

        // Función para eliminar una tarea
        deleteTask(taskId) {
            this.tasks = this.tasks.filter(task => task.id !== taskId);
        },

        // Función para agregar una subtarea
        addSubtask() {
            this.selectedTask.subtasks.push({
                title: 'Nueva Subtarea',
                description: '',
                completed: false,
                subsubtasks: []
            });
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
