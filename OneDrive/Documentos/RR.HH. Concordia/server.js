const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
if (!fs.existsSync('data')) fs.mkdirSync('data');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'rrhh', resave: false, saveUninitialized: false }));
app.use('/uploads', express.static('uploads'));

const DB_FILE = './data/db.json';

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const data = { users: [{ username: 'admin', password: bcrypt.hashSync('admin123', 10) }], vacantes: [], candidatos: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(data));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function isAuth(req, res, next) {
  if (req.session.user) return next();
  res.status(401).json({ error: 'No autorizado' });
}

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/admin', (req, res) => res.sendFile(__dirname + '/admin.html'));

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const db = loadDB();
  const user = db.users.find(u => u.username === username);
  if (user && bcrypt.compareSync(password, user.password)) {
    req.session.user = username;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Credenciales invalidas' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.post('/api/change-password', isAuth, (req, res) => {
  const { newPassword } = req.body;
  const db = loadDB();
  db.users[0].password = bcrypt.hashSync(newPassword, 10);
  saveDB(db);
  res.json({ success: true });
});

app.get('/api/vacantes', (req, res) => {
  const db = loadDB();
  res.json(db.vacantes);
});

app.post('/api/vacantes', isAuth, (req, res) => {
  const db = loadDB();
  const vacante = { id: Date.now(), ...req.body, fecha: new Date().toISOString() };
  db.vacantes.push(vacante);
  saveDB(db);
  res.json(vacante);
});

app.delete('/api/vacantes/:id', isAuth, (req, res) => {
  const db = loadDB();
  db.vacantes = db.vacantes.filter(v => v.id != req.params.id);
  saveDB(db);
  res.json({ success: true });
});

app.post('/api/candidatos', upload.single('cv'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se envió archivo CV' });
  }
  const db = loadDB();
  const candidato = {
    id: Date.now(),
    nombre: req.body.nombre || '',
    email: req.body.email || '',
    telefono: req.body.telefono || '',
    area: req.body.area || '',
    cvPath: req.file.path,
    cvOriginal: req.file.originalname,
    fecha: new Date().toISOString()
  };
  db.candidatos.push(candidato);
  saveDB(db);
  res.json({ success: true, message: 'CV guardado correctamente' });
});

app.get('/api/candidatos', isAuth, (req, res) => {
  const db = loadDB();
  res.json(db.candidatos);
});

app.delete('/api/candidatos/:id', isAuth, (req, res) => {
  const db = loadDB();
  const candidato = db.candidatos.find(c => c.id == req.params.id);
  if (candidato && fs.existsSync(candidato.cvPath)) {
    fs.unlinkSync(candidato.cvPath);
  }
  db.candidatos = db.candidatos.filter(c => c.id != req.params.id);
  saveDB(db);
  res.json({ success: true });
});

app.listen(PORT, () => console.log('Servidor en http://localhost:' + PORT));