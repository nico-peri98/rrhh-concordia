# 🚀 Escalado del Panel Admin — RRHH Concordia

## Resumen de Cambios

Se implementó un sistema completo de **evaluación y clasificación de candidatos** en el panel de administración, permitiendo:

1. **Filtrado por rubro y vacante**
2. **Sistema de scoring (0-100)**
3. **Evaluación de fortalezas y debilidades**
4. **Recomendación personalizada por candidato**

---

## 📋 Cambios en el Backend (`server.js`)

### 1. Nuevo campo `scoring` en candidatos
Cuando se crea un candidato, se inicializa con:
```javascript
scoring: null
```

### 2. Endpoint para guardar evaluaciones
**POST `/api/candidatos/:id/scoring`**

```javascript
app.post('/api/candidatos/:id/scoring', isAuth, (req, res) => {
  const db = loadDB();
  const candidato = db.candidatos.find(c => c.id == req.params.id);
  
  candidato.scoring = {
    score: req.body.score,           // 0-100
    fortalezas: req.body.fortalezas,
    debilidades: req.body.debilidades,
    recomendacion: req.body.recomendacion,
    fechaEvaluacion: new Date().toISOString()
  };
  saveDB(db);
  res.json({ success: true });
});
```

### 3. Filtro por rubro en GET
**GET `/api/candidatos?rubro=Trade Marketing`**

```javascript
app.get('/api/candidatos', isAuth, (req, res) => {
  const db = loadDB();
  const rubro = req.query.rubro;
  let candidatos = db.candidatos;
  if (rubro) {
    candidatos = candidatos.filter(c => c.rubro === rubro);
  }
  res.json(candidatos);
});
```

---

## 🎨 Cambios en el Frontend (`admin.html`)

### 1. **Sección de Candidatos Mejorada**

#### Filtros dinámicos
- **Filtro por Rubro**: Trade Marketing, Operario Polivalente, Administrativo, Otro
- **Filtro por Vacante**: Se populate dinámicamente desde las vacantes creadas

#### Tabla de candidatos con Score
Ahora muestra:
- Nombre, Email, Teléfono
- **Rubro** (nuevo campo)
- **Score visual** con badge de color:
  - 🟢 **Verde** (70+): Score Alto
  - 🟡 **Amarillo** (50-69): Score Medio
  - 🔴 **Rojo** (<50): Score Bajo
  - ⚪ **Gris**: Sin evaluar

#### Acciones por candidato
- **Ver**: Abre detalle con CV y evaluación (si existe)
- **Evaluar**: Abre formulario para agregar/editar score
- **Eliminar**: Elimina candidato

### 2. **Modal de Detalles del Candidato**
Muestra:
- Información personal (email, teléfono, rubro)
- Enlace para descargar CV
- **Evaluación completa** (si existe):
  - Score
  - Fortalezas
  - Debilidades
  - Recomendación
  - Fecha de evaluación

### 3. **Modal de Evaluación (Scoring)**
Formulario con campos:
- **Score (0-100)**: Input numérico
- **Fortalezas**: Textarea
- **Debilidades**: Textarea
- **Recomendación**: Textarea

Los datos se guardan y persisten en la BD.

---

## 🔄 Flujo de Uso

### Para un admin:

1. **Login** → Panel Admin
2. **Ir a Candidatos**
3. **Filtrar por rubro** (ej: Trade Marketing)
4. **Opcionalmente filtrar por vacante específica**
5. **Hacer clic en "Evaluar"** para un candidato
6. **Completar el formulario**:
   - Asignar score
   - Listar fortalezas
   - Listar debilidades
   - Escribir recomendación
7. **Guardar** → La evaluación se persiste
8. **Ver en la tabla**: El candidato ahora muestra badge con el score

---

## 📊 Estructura de Datos (db.json)

```json
{
  "candidatos": [
    {
      "id": 1234567890,
      "nombre": "Juan Pérez",
      "email": "juan@example.com",
      "telefono": "345-123456",
      "rubro": "Trade Marketing",
      "vacanteId": 9876543210,
      "cvPath": "uploads/...",
      "cvOriginal": "cv_juan.pdf",
      "fecha": "2026-06-01T10:30:00Z",
      "scoring": {
        "score": 82,
        "fortalezas": "- Experiencia en retail\n- Comunicación clara",
        "debilidades": "- Sin experiencia en e-commerce",
        "recomendacion": "Candidato fuerte. Revisar detalles de e-commerce en entrevista.",
        "fechaEvaluacion": "2026-06-01T14:45:00Z"
      }
    }
  ]
}
```

---

## 🎯 Próximas Ideas de Mejora

1. **Exportar candidatos** evaluados a Excel con scoring
2. **Comparador visual** entre candidatos del mismo rubro
3. **Historial de cambios** en evaluaciones
4. **Notas privadas** en candidatos (solo visible para admin)
5. **Integración con mail** para enviar feedback a candidatos
6. **Dashboard de estadísticas**:
   - Promedio de score por rubro
   - Candidatos sin evaluar
   - Tasa de aprobación

---

## 📝 Archivos Modificados

- ✅ `server.js` — Agregados endpoints de scoring
- ✅ `admin.html` — Completamente rediseñado con filtros y scoring

---

¡Listo! El sistema está escalado y funcional. 🚀
