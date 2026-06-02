const express = require('express');
const session = require('express-session');
const bcryptjs = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => console.error('Error en BD:', err));

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.'));
app.use(session({ secret: 'rrhh', resave: false, saveUninitialized: false }));

const isAuth = (req, res, next) => {
  if (!req.session.authenticated) return res.status(401).json({ error: 'No autorizado' });
  next();
};

async function initDB() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username VARCHAR(50), password VARCHAR(255))`);
    await pool.query(`CREATE TABLE IF NOT EXISTS vacantes (id BIGINT PRIMARY KEY, titulo VARCHAR(255), ubicacion VARCHAR(255), tipo VARCHAR(50), rubro VARCHAR(100), descripcion TEXT, imagenPath VARCHAR(255), fecha TIMESTAMP)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS candidatos (id BIGINT PRIMARY KEY, nombre VARCHAR(255), email VARCHAR(255), telefono VARCHAR(20), rubro VARCHAR(100), vacanteId BIGINT, cvPath VARCHAR(255), cvOriginal VARCHAR(255), fecha TIMESTAMP, scoring JSONB)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS rubros (id SERIAL PRIMARY KEY, nombre VARCHAR(100) UNIQUE)`);

    const user = await pool.query('SELECT * FROM users WHERE username = $1', ['admin']);
    if (user.rows.length === 0) {
      const hashedPassword = bcryptjs.hashSync('admin123', 10);
      await pool.query('INSERT INTO users (username, password) VALUES ($1, $2)', ['admin', hashedPassword]);
    }

    const rubrosCount = await pool.query('SELECT COUNT(*) FROM rubros');
    if (parseInt(rubrosCount.rows[0].count) === 0) {
      const rubrosDefault = ['Administración y contabilidad', 'Comercial y ventas', 'Logística y operaciones', 'Recursos humanos', 'Tecnología e informática', 'Producción e industria', 'Salud y educación', 'Otro'];
      for (const rubro of rubrosDefault) {
        await pool.query('INSERT INTO rubros (nombre) VALUES ($1)', [rubro]);
      }
    }
    console.log('✓ BD inicializada');
  } catch (err) {
    console.error('Error inicializando BD:', err);
  }
}

initDB();

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (user && bcryptjs.compareSync(password, user.password)) {
      req.session.authenticated = true;
      res.json({ success: true });
    } else {
      res.status(401).json({ error: 'Credenciales inválidas' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.post('/api/change-password', isAuth, async (req, res) => {
  const { newPassword } = req.body;
  const hashedPassword = bcryptjs.hashSync(newPassword, 10);
  try {
    await pool.query('UPDATE users SET password = $1', [hashedPassword]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/set-admin-password', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });
  const hashedPassword = bcryptjs.hashSync(password, 10);
  try {
    await pool.query('UPDATE users SET password = $1 WHERE username = $2', [hashedPassword, 'admin']);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vacantes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM vacantes ORDER BY fecha DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vacantes', isAuth, upload.single('imagen'), async (req, res) => {
  const { titulo, ubicacion, tipo, rubro, descripcion } = req.body;
  const id = Date.now();
  const fecha = new Date().toISOString();
  const imagenPath = req.file ? req.file.path : null;
  try {
    await pool.query('INSERT INTO vacantes (id, titulo, ubicacion, tipo, rubro, descripcion, imagenPath, fecha) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [id, titulo, ubicacion, tipo, rubro, descripcion, imagenPath, fecha]);
    res.json({ id, titulo, ubicacion, tipo, rubro, descripcion, imagenPath, fecha });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/vacantes/:id', isAuth, upload.single('imagen'), async (req, res) => {
  const { id } = req.params;
  const { titulo, ubicacion, tipo, rubro, descripcion } = req.body;
  const imagenPath = req.file ? req.file.path : undefined;
  try {
    if (imagenPath) {
      await pool.query('UPDATE vacantes SET titulo = $1, ubicacion = $2, tipo = $3, rubro = $4, descripcion = $5, imagenPath = $6 WHERE id = $7', [titulo, ubicacion, tipo, rubro, descripcion, imagenPath, id]);
    } else {
      await pool.query('UPDATE vacantes SET titulo = $1, ubicacion = $2, tipo = $3, rubro = $4, descripcion = $5 WHERE id = $6', [titulo, ubicacion, tipo, rubro, descripcion, id]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/vacantes/:id', isAuth, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM vacantes WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/candidatos', upload.single('cv'), async (req, res) => {
  const { nombre, email, telefono, rubro, vacanteId } = req.body;
  const id = Date.now();
  const fecha = new Date().toISOString();
  const cvPath = req.file ? req.file.path : null;
  const cvOriginal = req.file ? req.file.originalname : null;
  try {
    await pool.query('INSERT INTO candidatos (id, nombre, email, telefono, rubro, vacanteId, cvPath, cvOriginal, fecha, scoring) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)', [id, nombre, email, telefono, rubro, vacanteId || null, cvPath, cvOriginal, fecha, null]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/candidatos', isAuth, async (req, res) => {
  const { rubro } = req.query;
  try {
    let query = 'SELECT * FROM candidatos ORDER BY fecha DESC';
    let params = [];
    if (rubro) {
      query = 'SELECT * FROM candidatos WHERE rubro = $1 ORDER BY fecha DESC';
      params = [rubro];
    }
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/candidatos/:id', isAuth, async (req, res) => {
  const { id } = req.params;
  const { nombre, email, telefono, rubro, vacanteId } = req.body;
  try {
    await pool.query('UPDATE candidatos SET nombre = $1, email = $2, telefono = $3, rubro = $4, vacanteId = $5 WHERE id = $6', [nombre, email, telefono, rubro, vacanteId || null, id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/candidatos/:id/scoring', isAuth, async (req, res) => {
  const { id } = req.params;
  const { score, fortalezas, debilidades, recomendacion } = req.body;
  const scoring = { score, fortalezas, debilidades, recomendacion, fechaEvaluacion: new Date().toISOString() };
  try {
    await pool.query('UPDATE candidatos SET scoring = $1 WHERE id = $2', [JSON.stringify(scoring), id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/candidatos/:id', isAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT cvPath FROM candidatos WHERE id = $1', [id]);
    if (result.rows.length > 0 && result.rows[0].cvpath) {
      if (fs.existsSync(result.rows[0].cvpath)) fs.unlinkSync(result.rows[0].cvpath);
    }
    await pool.query('DELETE FROM candidatos WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/rubros', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM rubros ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/rubros', isAuth, async (req, res) => {
  const { nombre } = req.body;
  try {
    const result = await pool.query('INSERT INTO rubros (nombre) VALUES ($1) RETURNING *', [nombre]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/rubros/:id', isAuth, async (req, res) => {
  const { id } = req.params;
  const { nombre } = req.body;
  try {
    await pool.query('UPDATE rubros SET nombre = $1 WHERE id = $2', [nombre, id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/rubros/:id', isAuth, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM rubros WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log('Servidor en http://localhost:' + PORT));
