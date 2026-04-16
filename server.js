require('dotenv').config();
const express        = require('express');
const session        = require('express-session');
const path           = require('path');
const { initDB }     = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middlewares ────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret:            process.env.SESSION_SECRET || 'teamboard_secret_2024',
  resave:            false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24h
}));

// ── Arquivos estáticos ─────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Rotas API ──────────────────────────────────────────────
const apiRouter  = require('./routes/api');
app.use('/api', apiRouter);

// ── Google OAuth (se configurado) ─────────────────────────
try {
  const authRouter = require('./routes/auth');
  app.use('/auth', authRouter);
  const meetRouter = require('./routes/meet');
  app.use('/meet', meetRouter);
} catch(e) {
  // rotas opcionais — não quebra se não existirem
  app.get('/auth/status', (req, res) => res.json({ loggedIn: false }));
  app.get('/auth/google', (req, res) => res.redirect('/?auth=no-google'));
  app.get('/auth/logout', (req, res) => res.redirect('/'));
}

// ── SPA fallback ───────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ──────────────────────────────────────────────────
async function start() {
  await initDB();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ TeamBoard rodando em http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('Erro ao iniciar:', err);
  process.exit(1);
});
