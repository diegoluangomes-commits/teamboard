const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ── Cria todas as tabelas se não existirem ─────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      color       TEXT,
      descr       TEXT,
      client_id   TEXT,
      product_id  TEXT,
      seller_id   TEXT,
      owner_id    TEXT,
      date_start  TEXT,
      date_end    TEXT,
      created_at  TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      proj_id     TEXT,
      grp         INTEGER DEFAULT 0,
      status      TEXT DEFAULT 'pending',
      owner_id    TEXT,
      priority    TEXT DEFAULT 'medium',
      date        TEXT,
      date_start  TEXT,
      date_end    TEXT,
      turno       TEXT DEFAULT 'manha',
      descr       TEXT,
      comments    JSONB DEFAULT '[]',
      meet        JSONB,
      created_at  TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS clients (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      classification  TEXT,
      product_id      TEXT,
      date            TEXT,
      seller_id       TEXT,
      notes           TEXT,
      created_at      TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS products (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      descr      TEXT,
      active     BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS owners (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      email      TEXT,
      color      TEXT,
      initials   TEXT,
      active     BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sellers (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      email      TEXT,
      phone      TEXT,
      active     BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      email      TEXT UNIQUE NOT NULL,
      password   TEXT NOT NULL,
      perfil     TEXT DEFAULT 'responsavel',
      owner_id   TEXT,
      active     BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ausencias (
      id          TEXT PRIMARY KEY,
      owner_id    TEXT NOT NULL,
      tipo        TEXT NOT NULL DEFAULT 'ferias',
      date_start  TEXT NOT NULL,
      date_end    TEXT NOT NULL,
      obs         TEXT,
      created_at  TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS templates (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      descr      TEXT,
      tasks      JSONB DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // ── Dados iniciais (apenas se tabelas estiverem vazias) ──
  const { rows } = await pool.query('SELECT COUNT(*) FROM users');
  if (+rows[0].count === 0) {
    const { v4: uuidv4 } = require('uuid');

    // Owners
    const o1 = uuidv4(), o2 = uuidv4(), o3 = uuidv4(), o4 = uuidv4();
    await pool.query(`INSERT INTO owners (id,name,email,color,initials,active) VALUES
      ($1,'Ana Lima','ana@empresa.com','#185FA5','AL',true),
      ($2,'Carlos M.','carlos@empresa.com','#3B6D11','CM',true),
      ($3,'Bruna R.','bruna@empresa.com','#BA7517','BR',true),
      ($4,'João S.','joao@empresa.com','#993556','JS',true)`,[o1,o2,o3,o4]);

    // Sellers
    const s1 = uuidv4(), s2 = uuidv4(), s3 = uuidv4();
    await pool.query(`INSERT INTO sellers (id,name,email,phone,active) VALUES
      ($1,'Ana Lima','ana@empresa.com','',true),
      ($2,'Carlos M.','carlos@empresa.com','',true),
      ($3,'Bruna R.','bruna@empresa.com','',true)`,[s1,s2,s3]);

    // Products
    const p1 = uuidv4(), p2 = uuidv4(), p3 = uuidv4(), p4 = uuidv4();
    await pool.query(`INSERT INTO products (id,name,descr,active) VALUES
      ($1,'Zen Folha','Sistema de folha de pagamento',true),
      ($2,'Zen Fiscal','Sistema fiscal e contábil',true),
      ($3,'Zen Negócio','Sistema de gestão empresarial',true),
      ($4,'Zen Completo','Todos os módulos',true)`,[p1,p2,p3,p4]);

    // Users
    await pool.query(`INSERT INTO users (id,name,email,password,perfil,owner_id,active) VALUES
      ($1,'Administrador','admin@empresa.com','admin123','admin',null,true),
      ($2,'Ana Lima','ana@empresa.com','ana123','responsavel',$3,true)`,
      [uuidv4(), uuidv4(), o1]);

    // Template padrão
    const tplTasks = JSON.stringify([
      { name:'Boas Vindas',                            group:0, priority:'high',   desc:'' },
      { name:'Enviar e-mail',                          group:0, priority:'high',   desc:'Agenda, memória de cálculo e planilhas' },
      { name:'Acessos',                                group:1, priority:'high',   desc:'' },
      { name:'Pegar a base do cliente',                group:1, priority:'high',   desc:'' },
      { name:'Enviar base para matriz extrair txt',    group:1, priority:'medium', desc:'' },
      { name:'Preparar base',                          group:1, priority:'high',   desc:'Migrar txt para base e/ou base branca' },
      { name:'Enviar base para matriz criar ambiente', group:1, priority:'high',   desc:'' },
      { name:'Testar ambiente e WTS',                  group:1, priority:'high',   desc:'' },
      { name:'Testar Licença do Zen e Negócio',        group:1, priority:'high',   desc:'' },
      { name:'Validação',                              group:2, priority:'high',   desc:'' },
      { name:'Folha de pagamento e Zen',               group:2, priority:'high',   desc:'' },
      { name:'Fiscal e Zen',                           group:2, priority:'medium', desc:'' },
      { name:'Contábil e Zen',                         group:2, priority:'medium', desc:'' },
      { name:'Negócio',                                group:2, priority:'medium', desc:'' },
      { name:'Automatizações',                         group:2, priority:'low',    desc:'' },
      { name:'Folha de pagamento',                     group:3, priority:'high',   desc:'' },
      { name:'Fiscal',                                 group:3, priority:'medium', desc:'' },
      { name:'Contabil',                               group:3, priority:'medium', desc:'' },
      { name:'Automatizações',                         group:3, priority:'low',    desc:'' }
    ]);
    await pool.query(
      'INSERT INTO templates (id,name,descr,tasks) VALUES ($1,$2,$3,$4)',
      [uuidv4(), 'Implantação Padrão', 'Modelo padrão de implantação com todos os grupos e etapas', tplTasks]
    );

    console.log('[DB] Dados iniciais inseridos com sucesso.');
  }

  // ── Migration: adicionar colunas novas se não existirem ──
  await pool.query(`
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS date_start TEXT;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS date_end   TEXT;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS status        TEXT DEFAULT 'ativo';
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS tipo          TEXT DEFAULT 'implantacao';
    ALTER TABLE owners   ADD COLUMN IF NOT EXISTS notif_email   BOOLEAN DEFAULT true;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS cancel_date   TEXT;
    ALTER TABLE clients  ADD COLUMN IF NOT EXISTS contact_name TEXT;
    ALTER TABLE clients  ADD COLUMN IF NOT EXISTS contact_role TEXT;
    ALTER TABLE clients  ADD COLUMN IF NOT EXISTS phone        TEXT;
    ALTER TABLE clients  ADD COLUMN IF NOT EXISTS email        TEXT;
  `).catch(()=>{});

  // ── Migration: metas anuais de agendas por responsável ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS metas_anuais (
      id          TEXT PRIMARY KEY,
      ano         INTEGER NOT NULL UNIQUE,
      meta_mensal INTEGER NOT NULL DEFAULT 30,
      obs         TEXT,
      created_at  TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS metas_responsaveis (
      meta_id  TEXT NOT NULL REFERENCES metas_anuais(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL,
      PRIMARY KEY (meta_id, owner_id)
    );
    CREATE INDEX IF NOT EXISTS idx_metas_resp_owner ON metas_responsaveis(owner_id);
  `).catch(e => console.warn('[DB] Aviso metas:', e.message));

  // ── Migration: tabela de status diário de agendas ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_daily_status (
      task_id   TEXT NOT NULL,
      date      TEXT NOT NULL,
      status    TEXT NOT NULL DEFAULT 'pending',
      updated_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (task_id, date)
    );
  `).catch(()=>{});

  // ── Índices: aceleram os filtros mais usados ──
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tasks_proj      ON tasks(proj_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_owner     ON tasks(owner_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_date      ON tasks(date);
    CREATE INDEX IF NOT EXISTS idx_tasks_datestart ON tasks(date_start);
    CREATE INDEX IF NOT EXISTS idx_tasks_status    ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id);
    CREATE INDEX IF NOT EXISTS idx_projects_owner  ON projects(owner_id);
    CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
    CREATE INDEX IF NOT EXISTS idx_projects_tipo   ON projects(tipo);
    CREATE INDEX IF NOT EXISTS idx_clients_seller  ON clients(seller_id);
    CREATE INDEX IF NOT EXISTS idx_ausencias_owner ON ausencias(owner_id);
    CREATE INDEX IF NOT EXISTS idx_tds_date        ON task_daily_status(date);
    CREATE INDEX IF NOT EXISTS idx_users_email     ON users(email);
  `).catch(e => console.warn('[DB] Aviso ao criar índices:', e.message));

  // ── Migration: criptografa senhas ainda em texto puro ──
  // Hashes bcrypt começam com $2a$/$2b$/$2y$ — tudo diferente disso é texto puro
  try {
    const bcrypt = require('bcryptjs');
    const { rows: planas } = await pool.query(
      `SELECT id, password FROM users WHERE password IS NOT NULL AND password NOT LIKE '$2%'`
    );
    for (const u of planas) {
      const hash = await bcrypt.hash(u.password, 10);
      await pool.query('UPDATE users SET password=$1 WHERE id=$2', [hash, u.id]);
    }
    if (planas.length) console.log(`[DB] ${planas.length} senha(s) criptografada(s) com bcrypt.`);
  } catch (e) {
    console.warn('[DB] Aviso na migração de senhas:', e.message);
  }

  // ── Migration: projetos já cadastrados entram como Implantação ──
  await pool.query(
    `UPDATE projects SET tipo='implantacao' WHERE tipo IS NULL OR tipo=''`
  ).catch(()=>{});

  // ── Migration: trilha de auditoria ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id          BIGSERIAL PRIMARY KEY,
      user_id     TEXT,
      user_name   TEXT,
      user_perfil TEXT,
      action      TEXT NOT NULL,
      entity      TEXT,
      entity_id   TEXT,
      entity_name TEXT,
      changes     JSONB,
      ip          TEXT,
      created_at  TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_user    ON audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_entity  ON audit_log(entity, entity_id);
    CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_log(action);
  `).catch(e => console.warn('[DB] Aviso audit_log:', e.message));

  // ── Retenção por criticidade ──
  // Exclusões e mudanças de usuário/permissão: 24 meses
  // Edições e criações comuns: 12 meses | Logins: 6 meses
  try {
    const { rowCount: r1 } = await pool.query(`
      DELETE FROM audit_log
      WHERE created_at < NOW() - INTERVAL '24 months'
        AND (action = 'excluir' OR entity = 'usuário')
    `);
    const { rowCount: r2 } = await pool.query(`
      DELETE FROM audit_log
      WHERE created_at < NOW() - INTERVAL '12 months'
        AND action IN ('criar','editar')
        AND entity <> 'usuário'
    `);
    const { rowCount: r3 } = await pool.query(`
      DELETE FROM audit_log
      WHERE created_at < NOW() - INTERVAL '6 months'
        AND action IN ('login','login_falhou','logout')
    `);
    const total = (r1||0)+(r2||0)+(r3||0);
    if (total) console.log(`[DB] Auditoria: ${total} registro(s) antigo(s) removido(s).`);
  } catch (e) {
    console.warn('[DB] Aviso na retenção da auditoria:', e.message);
  }

  console.log('[DB] PostgreSQL conectado e tabelas prontas.');
}

module.exports = { pool, initDB };
