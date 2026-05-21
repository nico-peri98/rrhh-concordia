const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || '.';

// Crear directorios necesarios
if (!fs.existsSync(DATA_DIR + '/uploads')) fs.mkdirSync(DATA_DIR + '/uploads', { recursive: true });
if (!fs.existsSync(DATA_DIR + '/data'))    fs.mkdirSync(DATA_DIR + '/data',    { recursive: true });

// Multer — almacenamiento de archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DATA_DIR + '/uploads/'),
  filename:    (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // máx 5MB

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'rrhh_concordia_2026', resave: false, saveUninitialized: false }));

// Archivos estáticos
app.use('/uploads', express.static(DATA_DIR + '/uploads'));
app.use('/assets',  express.static(path.join(__dirname, 'assets')));

// ── Base de datos ─────────────────────────────────────────────
const DB_FILE = DATA_DIR + '/data/db.json';

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const data = {
      users: [{ username: 'admin', password: bcrypt.hashSync('peri657098', 10) }],
      vacantes: [],
      candidatos: [],
      cvs: [],
      empresa: {
        sobre: '',
        servicios: [],
        contacto: { email: 'rrhhconcordia@hotmail.com', telefono: '+54 345 5283688', direccion: 'Concordia, Entre Ríos', whatsapp: '' }
      }
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  }
  const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  // Migración: agregar cvs y empresa si no existen en DB vieja
  if (!data.cvs)     data.cvs = [];
  if (!data.empresa) data.empresa = {
    sobre: '', servicios: [],
    contacto: { email: 'rrhhconcordia@hotmail.com', telefono: '+54 345 5283688', direccion: 'Concordia, Entre Ríos', whatsapp: '' }
  };
  return data;
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ── Middleware de autenticación ───────────────────────────────
function isAuth(req, res, next) {
  if (req.session.user) return next();
  res.status(401).json({ error: 'No autorizado' });
}

// ── Páginas ───────────────────────────────────────────────────
app.get('/',      (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// ── Auth ──────────────────────────────────────────────────────

// Login clásico (usuario + contraseña) — para compatibilidad
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const db = loadDB();
  const user = db.users.find(u => u.username === username);
  if (user && bcrypt.compareSync(password, user.password)) {
    req.session.user = username;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Credenciales inválidas' });
  }
});

// Login nuevo (solo contraseña) — usado por el nuevo admin.html
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const db = loadDB();
  const admin = db.users.find(u => u.username === 'admin');
  if (admin && bcrypt.compareSync(password, admin.password)) {
    req.session.user = 'admin';
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Contraseña incorrecta' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.post('/api/change-password', isAuth, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Contraseña muy corta' });
  const db = loadDB();
  db.users[0].password = bcrypt.hashSync(newPassword, 10);
  saveDB(db);
  res.json({ success: true });
});

// ── Vacantes ──────────────────────────────────────────────────

// GET público — homepage las carga para mostrarlas
app.get('/api/vacantes', (req, res) => {
  const db = loadDB();
  res.json(db.vacantes);
});

// POST — crear vacante nueva
app.post('/api/vacantes', isAuth, (req, res) => {
  const db = loadDB();
  const vacante = {
    id: String(Date.now()),
    ...req.body,
    activa: req.body.activa !== false && req.body.activa !== 'false',
    postulantes: 0,
    createdAt: new Date().toISOString()
  };
  db.vacantes.push(vacante);
  saveDB(db);
  res.status(201).json(vacante);
});

// PUT — editar vacante
app.put('/api/vacantes/:id', isAuth, (req, res) => {
  const db = loadDB();
  const idx = db.vacantes.findIndex(v => String(v.id) === String(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Vacante no encontrada' });
  db.vacantes[idx] = {
    ...db.vacantes[idx],
    ...req.body,
    id: db.vacantes[idx].id, // preservar ID original
    activa: req.body.activa !== false && req.body.activa !== 'false'
  };
  saveDB(db);
  res.json(db.vacantes[idx]);
});

// DELETE — eliminar vacante
app.delete('/api/vacantes/:id', isAuth, (req, res) => {
  const db = loadDB();
  db.vacantes = db.vacantes.filter(v => String(v.id) !== String(req.params.id));
  saveDB(db);
  res.json({ success: true });
});

// ── Postulaciones a vacantes (formulario público del homepage) ─

app.post('/api/postulaciones', upload.single('archivo'), (req, res) => {
  const db = loadDB();
  const candidato = {
    id: String(Date.now()),
    nombre:        req.body.nombre   || '',
    email:         req.body.email    || '',
    telefono:      req.body.telefono || '',
    vacanteId:     req.body.vacanteId || '',
    vacanteNombre: req.body.vacanteNombre || '',
    archivo:       req.file ? req.file.filename : null,
    cvPath:        req.file ? req.file.path : null,
    cvOriginal:    req.file ? req.file.originalname : null,
    fecha:         new Date().toISOString()
  };
  db.candidatos.push(candidato);
  // Incrementar contador de postulantes en la vacante
  const vIdx = db.vacantes.findIndex(v => String(v.id) === String(candidato.vacanteId));
  if (vIdx !== -1) db.vacantes[vIdx].postulantes = (db.vacantes[vIdx].postulantes || 0) + 1;
  saveDB(db);
  res.status(201).json({ success: true });
});

// ── Candidatos (panel admin) ──────────────────────────────────

app.get('/api/candidatos', isAuth, (req, res) => {
  const db = loadDB();
  res.json(db.candidatos);
});

// Compatibilidad: POST viejo también sigue funcionando
app.post('/api/candidatos', upload.single('cv'), (req, res) => {
  const db = loadDB();
  const candidato = {
    id: String(Date.now()),
    nombre:     req.body.nombre   || '',
    email:      req.body.email    || '',
    telefono:   req.body.telefono || '',
    vacanteId:  req.body.vacanteId || '',
    archivo:    req.file ? req.file.filename : null,
    cvPath:     req.file ? req.file.path : null,
    cvOriginal: req.file ? req.file.originalname : null,
    fecha:      new Date().toISOString()
  };
  db.candidatos.push(candidato);
  saveDB(db);
  res.json({ success: true });
});

app.delete('/api/candidatos/:id', isAuth, (req, res) => {
  const db = loadDB();
  const candidato = db.candidatos.find(c => String(c.id) === String(req.params.id));
  if (candidato && candidato.cvPath && fs.existsSync(candidato.cvPath)) {
    try { fs.unlinkSync(candidato.cvPath); } catch (e) {}
  }
  db.candidatos = db.candidatos.filter(c => String(c.id) !== String(req.params.id));
  saveDB(db);
  res.json({ success: true });
});

// ── CVs espontáneos (formulario "Dejá tu CV" del homepage) ────

app.post('/api/cvs', upload.single('archivo'), (req, res) => {
  const db = loadDB();
  const cv = {
    id: String(Date.now()),
    nombre:   req.body.nombre   || '',
    email:    req.body.email    || '',
    telefono: req.body.telefono || '',
    area:     req.body.area     || '',
    archivo:  req.file ? req.file.filename : null,
    cvPath:   req.file ? req.file.path : null,
    createdAt: new Date().toISOString()
  };
  db.cvs.push(cv);
  saveDB(db);
  res.status(201).json({ success: true });
});

app.get('/api/cvs', isAuth, (req, res) => {
  const db = loadDB();
  res.json(db.cvs);
});

// ── Información empresa ───────────────────────────────────────

app.get('/api/empresa', isAuth, (req, res) => {
  const db = loadDB();
  res.json(db.empresa);
});

app.put('/api/empresa', isAuth, (req, res) => {
  const db = loadDB();
  db.empresa = { ...db.empresa, ...req.body };
  saveDB(db);
  res.json({ success: true });
});

// ── Iniciar servidor ──────────────────────────────────────────
app.listen(PORT, () => console.log('✓ Servidor RRHH Concordia en puerto ' + PORT));
