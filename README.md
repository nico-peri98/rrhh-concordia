# RRHH Concordia - Sistema de Gestión de Postulaciones

Portal web para gestión de vacantes laborales y postulaciones de candidatos.

## 🚀 Características

- ✅ Gestión de vacantes laborales
- ✅ Sistema de postulación con screening de candidatos
- ✅ Panel administrativo protegido
- ✅ Recepción de CVs libres
- ✅ Editor rich-text para descripciones
- ✅ Almacenamiento de archivos (CVs)

## 🔧 Tecnologías

- **Frontend:** HTML5, CSS3, JavaScript vanilla
- **Backend:** Node.js + Express
- **Base de datos:** JSON (db.json)
- **Autenticación:** bcrypt + express-session
- **Uploads:** Multer

## 📦 Instalación Local

```bash
# Clonar el repositorio
git clone https://github.com/TU_USUARIO/rrhh-concordia.git
cd rrhh-concordia

# Instalar dependencias
npm install

# Iniciar servidor
node server.js
```

El sistema estará disponible en `http://localhost:3000`

## 🔐 Credenciales por Defecto

### Panel Público
- **URL:** `/`
- **Password:** `peri657098`

### Panel Administrador
- **URL:** `/admin`
- **Usuario:** `admin`
- **Password:** `admin123` (cambiar en primera sesión)

## 📁 Estructura de Archivos

```
rrhh-concordia/
├── index.html          # Portal público
├── admin.html          # Panel administrador
├── server.js           # Servidor Express
├── package.json        # Dependencias
├── db.json            # Base de datos (auto-generado)
├── logo.png           # Logo de la consultora
├── uploads/           # CVs subidos (auto-generado)
└── data/              # Datos persistentes (auto-generado)
```

## 🌐 Despliegue en Render.com

1. Crear cuenta en [render.com](https://render.com)
2. Conectar este repositorio de GitHub
3. Configurar Web Service:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
4. Conectar dominio personalizado: `rrhhconcordia.com`

## 📝 Notas de Seguridad

- Cambiar contraseñas por defecto en producción
- El archivo `db.json` contiene contraseñas hasheadas con bcrypt
- Los CVs se almacenan en carpeta `uploads/` (no incluida en Git)

## 👨‍💻 Desarrollado por

**Consultora RRHH Concordia**  
Concordia, Entre Ríos, Argentina

---

© 2026 RRHH Concordia - Todos los derechos reservados
