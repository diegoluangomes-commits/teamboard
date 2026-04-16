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

  console.log('[DB] PostgreSQL conectado e tabelas prontas.');
}

module.exports = { pool, initDB };
