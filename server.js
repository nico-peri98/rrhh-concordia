const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Cloudinary config ──────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ── PostgreSQL ─────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vacantes (
      id SERIAL PRIMARY KEY,
      titulo TEXT NOT NULL,
      ubicacion TEXT,
      tipo TEXT,
      descripcion TEXT,
      responsabilidades TEXT,
      requisitos TEXT,
      se_valora TEXT,
      beneficios TEXT,
      activa BOOLEAN DEFAULT TRUE,
      fecha TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS candidatos (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      email TEXT NOT NULL,
      telefono TEXT,
      area TEXT,
      vacante_titulo TEXT,
      cv_url TEXT NOT NULL,
      cv_public_id TEXT NOT NULL,
      cv_original TEXT NOT NULL,
      fecha TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  // Asegurar que columnas existan aunque la tabla haya sido creada por una version anterior sin ellas
  await pool.query(`ALTER TABLE candidatos ADD COLUMN IF NOT EXISTS area TEXT;`);
  await pool.query(`ALTER TABLE candidatos ADD COLUMN IF NOT EXISTS vacante_titulo TEXT;`);
  await pool.query(`ALTER TABLE candidatos ADD COLUMN IF NOT EXISTS cv_url TEXT;`);
  await pool.query(`ALTER TABLE candidatos ADD COLUMN IF NOT EXISTS cv_public_id TEXT;`);
  await pool.query(`ALTER TABLE candidatos ADD COLUMN IF NOT EXISTS cv_original TEXT;`);
  // Usuario admin por defecto si no existe
  const exists = await pool.query("SELECT 1 FROM users WHERE username = 'admin'");
  if (exists.rowCount === 0) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
    await pool.query("INSERT INTO users (username, password) VALUES ('admin', $1)", [hash]);
  }

  // ── Migración condicional: asegurar que candidatos.id tenga autogeneración ─
  const idInfo = await pool.query(`
    SELECT column_default, is_identity
    FROM information_schema.columns
    WHERE table_name = 'candidatos' AND column_name = 'id';
  `);
  const idBefore = idInfo.rows[0] || {};
  console.log('[migración id] Estado actual de candidatos.id:', {
    column_default: idBefore.column_default,
    is_identity: idBefore.is_identity
  });

  const needsMigration = !idBefore.column_default && idBefore.is_identity !== 'YES';
  if (needsMigration) {
    console.log('[migración id] Aplicando migración transaccional...');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('CREATE SEQUENCE IF NOT EXISTS candidatos_id_seq;');
      await client.query(`SELECT setval('candidatos_id_seq', COALESCE((SELECT MAX(id) FROM candidatos), 0) + 1, false);`);
      await client.query(`ALTER TABLE candidatos ALTER COLUMN id SET DEFAULT nextval('candidatos_id_seq');`);
      await client.query('ALTER SEQUENCE candidatos_id_seq OWNED BY candidatos.id;');
      await client.query('COMMIT');

      const idAfterRes = await pool.query(`
        SELECT column_default, is_identity
        FROM information_schema.columns
        WHERE table_name = 'candidatos' AND column_name = 'id';
      `);
      const idAfter = idAfterRes.rows[0] || {};
      if (idAfter.column_default && idAfter.column_default.includes('nextval')) {
        console.log('[migración id] Migración exitosa. Nuevo estado:', {
          column_default: idAfter.column_default,
          is_identity: idAfter.is_identity
        });
      } else {
        console.error('[migración id] ADVERTENCIA: column_default no quedó apuntando a nextval:', idAfter);
      }
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[migración id] Error durante la migración, rollback ejecutado:', err.message);
      throw err;
    } finally {
      client.release();
    }
  } else {
    console.log('[migración id] Sin cambios necesarios: id ya tiene autogeneración.');
  }

  console.log('Base de datos inicializada correctamente');
}

// ── Multer → Cloudinary (guardar como raw para PDFs/docs) ──────────────────
const cvStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    const isPdf = ext === 'pdf';
    return {
      folder: 'rrhh_concordia/cvs',
      resource_type: isPdf ? 'raw' : 'raw',   // raw funciona para PDF, DOC, DOCX
      public_id: Date.now() + '_' + file.originalname.replace(/\s+/g, '_'),
      format: ext
    };
  }
});

const uploadCV = multer({
  storage: cvStorage,
  limits: { fileSize: 5 * 1024 * 1024 },  // 5 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Solo PDF, DOC, DOCX o JPG.'));
    }
  }
});

// ── Middlewares ────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'rrhh-concordia-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 8 * 60 * 60 * 1000 }  // 8 horas
}));

function isAuth(req, res, next) {
  if (req.session.user) return next();
  res.status(401).json({ error: 'No autorizado' });
}

// ── Páginas estáticas ──────────────────────────────────────────────────────
app.get('/',      (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/admin', (req, res) => res.sendFile(__dirname + '/admin.html'));

// ── Auth ───────────────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (user && bcrypt.compareSync(password, user.password)) {
      req.session.user = username;
      res.json({ success: true });
    } else {
      res.status(401).json({ error: 'Credenciales inválidas' });
    }
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.post('/api/change-password', isAuth, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    const hash = bcrypt.hashSync(newPassword, 10);
    await pool.query('UPDATE users SET password = $1 WHERE username = $2', [hash, req.session.user]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error cambiando contraseña:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ── Vacantes ───────────────────────────────────────────────────────────────
app.get('/api/vacantes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM vacantes ORDER BY fecha DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error obteniendo vacantes:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/api/vacantes', isAuth, async (req, res) => {
  try {
    const { titulo, ubicacion, tipo, descripcion, responsabilidades, requisitos, se_valora, beneficios } = req.body;
    if (!titulo) return res.status(400).json({ error: 'El título es obligatorio' });
    const result = await pool.query(
      `INSERT INTO vacantes (titulo, ubicacion, tipo, descripcion, responsabilidades, requisitos, se_valora, beneficios)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [titulo, ubicacion, tipo, descripcion, responsabilidades, requisitos, se_valora, beneficios]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creando vacante:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.delete('/api/vacantes/:id', isAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM vacantes WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error eliminando vacante:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ── Candidatos / CVs ───────────────────────────────────────────────────────
app.post('/api/candidatos', (req, res) => {
  uploadCV.single('cv')(req, res, async (err) => {
    // Error de multer/cloudinary (tipo inválido, tamaño, etc.)
    if (err) {
      console.error('Error de multer/cloudinary:', err.message);
      return res.status(400).json({
        success: false,
        error: err.message || 'Error al procesar el archivo'
      });
    }

    // El archivo no llegó
    if (!req.file) {
      console.error('No se recibió archivo CV en la request');
      return res.status(400).json({
        success: false,
        error: 'No se recibió el archivo CV. Por favor adjuntá tu CV antes de enviar.'
      });
    }

    // Validar campos obligatorios
    const nombre  = (req.body.nombre  || '').trim();
    const email   = (req.body.email   || '').trim();
    if (!nombre || !email) {
      // Si el archivo ya subió a Cloudinary, eliminarlo para no dejar huérfanos
      if (req.file.public_id) {
        cloudinary.uploader.destroy(req.file.public_id, { resource_type: 'raw' }).catch(() => {});
      }
      return res.status(400).json({
        success: false,
        error: 'Nombre y email son obligatorios'
      });
    }

    try {
      const cv_url       = req.file.path || req.file.secure_url || '';
      const cv_public_id = req.file.filename || req.file.public_id || '';
      const cv_original  = req.file.originalname || '';

      if (!cv_url) {
        throw new Error('Cloudinary no devolvió una URL válida para el archivo');
      }

      await pool.query(
        `INSERT INTO candidatos (nombre, email, telefono, area, vacante_titulo, cv_url, cv_public_id, cv_original)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          nombre,
          email,
          (req.body.telefono || '').trim(),
          (req.body.area     || '').trim(),
          (req.body.vacante  || '').trim(),
          cv_url,
          cv_public_id,
          cv_original
        ]
      );

      console.log('CV guardado correctamente:', { nombre, email, cv_url });
      res.json({ success: true, message: 'Postulación recibida correctamente' });

    } catch (dbErr) {
      console.error('Error guardando candidato en DB:', dbErr.message);
      // Intentar eliminar el archivo de Cloudinary para no dejar huérfanos
      if (req.file && req.file.filename) {
        cloudinary.uploader.destroy(req.file.filename, { resource_type: 'raw' }).catch(() => {});
      }
      res.status(500).json({
        success: false,
        error: 'Hubo un error al guardar tu postulación. Por favor intentá nuevamente.'
      });
    }
  });
});

app.get('/api/candidatos', isAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM candidatos ORDER BY fecha DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error obteniendo candidatos:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.delete('/api/candidatos/:id', isAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM candidatos WHERE id = $1', [req.params.id]);
    const candidato = result.rows[0];
    if (candidato && candidato.cv_public_id) {
      // Eliminar de Cloudinary también
      await cloudinary.uploader.destroy(candidato.cv_public_id, { resource_type: 'raw' }).catch(() => {});
    }
    await pool.query('DELETE FROM candidatos WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error eliminando candidato:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ── Diagnóstico schema (TEMPORAL — remover después) ────────────────────────
app.get('/api/debug-schema', isAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default, is_identity
      FROM information_schema.columns
      WHERE table_name = 'candidatos'
      ORDER BY ordinal_position;
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error consultando schema:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Healthcheck ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── Start ──────────────────────────────────────────────────────────────────
initDB()
  .then(() => {
    app.listen(PORT, () => console.log('Servidor RRHH Concordia en puerto ' + PORT));
  })
  .catch(err => {
    console.error('Error fatal iniciando servidor:', err);
    process.exit(1);
  });
