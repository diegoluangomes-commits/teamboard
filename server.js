require('dotenv').config();
const express        = require('express');
const session        = require('express-session');
const pgSession      = require('connect-pg-simple')(session);
const rateLimit      = require('express-rate-limit');
const helmet         = require('helmet');
const path           = require('path');
const { initDB, pool } = require('./db');
const crypto         = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Render/Heroku ficam atrás de proxy — necessário para cookie secure funcionar
if (isProd) app.set('trust proxy', 1);

// ── Segurança HTTP ─────────────────────────────────────────
// Protege contra clickjacking, sniffing de MIME e vazamento de referrer.
// CSP fica desativada: o app usa handlers inline (onclick) e SVG embutido,
// que exigiriam uma refatoração grande do frontend para funcionar com ela.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  referrerPolicy: { policy: 'same-origin' }
}));

// Impede que o app seja embutido em iframe de outro site (anti-clickjacking)
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

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

// ── Timeout de inatividade (2h) ───────────────────────────
const INATIVIDADE_MS = 2 * 60 * 60 * 1000; // 2 horas
app.use((req, res, next) => {
  if (!req.session?.userId) return next();
  const agora = Date.now();
  const ultima = req.session.ultimaAtividade || agora;
  if (agora - ultima > INATIVIDADE_MS) {
    return req.session.destroy(() => {
      res.status(401).json({ error: 'SESSAO_EXPIRADA', message: 'Sessão expirada por inatividade.' });
    });
  }
  req.session.ultimaAtividade = agora;
  next();
});

// ── Token CSRF ─────────────────────────────────────────────
// Gera um token por sessão e o envia em cookie legível pelo JS (não httpOnly)
// O frontend o lê e envia em X-CSRF-Token; o servidor valida em toda escrita.
app.use((req, res, next) => {
  if (!req.session?.userId) return next();
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  // Cookie legível pelo JS (sem httpOnly) para o frontend poder ler
  res.cookie('csrf-token', req.session.csrfToken, {
    sameSite: 'lax',
    secure: isProd,
    httpOnly: false
  });
  next();
});

// Valida CSRF em toda escrita (POST/PUT/PATCH/DELETE)
// Exceções: login, logout e rotas externas com API key
const CSRF_ISENTO = ['/api/login', '/api/logout-local'];
app.use((req, res, next) => {
  if (!['POST','PUT','PATCH','DELETE'].includes(req.method)) return next();
  if (CSRF_ISENTO.includes(req.path)) return next();
  if (req.path.startsWith('/api/ext/')) return next(); // usa API key
  if (!req.session?.userId) return next();             // não autenticado
  const tokenHeader = req.headers['x-csrf-token'];
  const tokenSessao = req.session?.csrfToken;
  if (!tokenHeader || tokenHeader !== tokenSessao) {
    return res.status(403).json({ error: 'CSRF_INVALIDO', message: 'Token de segurança inválido. Recarregue a página.' });
  }
  next();
});

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
