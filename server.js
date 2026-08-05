require('dotenv').config();
const express        = require('express');
const session        = require('express-session');
const pgSession      = require('connect-pg-simple')(session);
const rateLimit      = require('express-rate-limit');
const path           = require('path');
const { initDB, pool } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Render/Heroku ficam atrás de proxy — necessário para cookie secure funcionar
if (isProd) app.set('trust proxy', 1);

// ── Middlewares ────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Sessão persistida no PostgreSQL (sobrevive a restarts e não vaza memória)
app.use(session({
  store: new pgSession({
    pool,
    tableName: 'user_sessions',
    createTableIfMissing: true
  }),
  secret:            process.env.SESSION_SECRET || 'teamboard_secret_2024',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   isProd,        // exige HTTPS em produção
    httpOnly: true,          // bloqueia leitura via JavaScript (anti-XSS)
    sameSite: 'lax',         // mitiga CSRF
    maxAge:   24 * 60 * 60 * 1000 // 24h
  }
}));

// ── Rate limiting ──────────────────────────────────────────
// Login: protege contra força bruta
app.use('/api/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas de login. Aguarde 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false
}));

// API em geral: evita abuso e scraping
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { error: 'Muitas requisições. Aguarde um momento.' },
  standardHeaders: true,
  legacyHeaders: false
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
