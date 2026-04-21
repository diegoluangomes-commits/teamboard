const express  = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool }  = require('../db');
const router    = express.Router();

const send     = (res, data) => res.json(data);
const notFound = (res, e)   => res.status(404).json({ error: `${e} não encontrado` });
const q        = (sql, p)   => pool.query(sql, p);

// ── helpers de mapeamento ──────────────────────────────────
const toProject = r => r ? ({
  id: r.id, name: r.name, color: r.color, desc: r.descr,
  clientId: r.client_id, productId: r.product_id,
  sellerId: r.seller_id, ownerId: r.owner_id,
  dateStart: r.date_start||'', dateEnd: r.date_end||''
}) : null;

const toTask = r => r ? ({
  id: r.id, name: r.name, projId: r.proj_id, group: r.grp,
  status: r.status, ownerId: r.owner_id, priority: r.priority,
  date: r.date||'', dateStart: r.date_start||'', dateEnd: r.date_end||'',
  turno: r.turno||'manha', desc: r.descr||'',
  comments: r.comments||[], meet: r.meet||null
}) : null;

const toClient = r => r ? ({
  id: r.id, name: r.name, classification: r.classification,
  productId: r.product_id, date: r.date||'',
  sellerId: r.seller_id, notes: r.notes||''
}) : null;

const toProduct = r => r ? ({
  id: r.id, name: r.name, desc: r.descr||'', active: r.active
}) : null;

const toOwner = r => r ? ({
  id: r.id, name: r.name, email: r.email||'',
  color: r.color||'#185FA5', initials: r.initials||'',
  active: r.active
}) : null;

const toSeller = r => r ? ({
  id: r.id, name: r.name, email: r.email||'',
  phone: r.phone||'', active: r.active
}) : null;

const toUser = r => r ? ({
  id: r.id, name: r.name, email: r.email,
  perfil: r.perfil, ownerId: r.owner_id, active: r.active
}) : null;

const toTemplate = r => r ? ({
  id: r.id, name: r.name, desc: r.descr||'', tasks: r.tasks||[]
}) : null;

// ── Login / Auth ───────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { rows } = await q('SELECT * FROM users WHERE email=$1 AND password=$2 AND active=true', [email, password]);
    if (!rows.length) return res.status(401).json({ error: 'E-mail ou senha incorretos' });
    const user = rows[0];
    req.session.userId    = user.id;
    req.session.userPerfil = user.perfil;
    req.session.userName  = user.name;
    req.session.ownerId   = user.owner_id;
    send(res, { ok: true, user: toUser(user) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/logout-local', (req, res) => {
  req.session.destroy(() => send(res, { ok: true }));
});

router.get('/me', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Não autenticado' });
  try {
    const { rows } = await q('SELECT * FROM users WHERE id=$1', [req.session.userId]);
    if (!rows.length) return res.status(401).json({ error: 'Usuário não encontrado' });
    send(res, toUser(rows[0]));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Users ──────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  const { rows } = await q('SELECT * FROM users ORDER BY name');
  send(res, rows.map(toUser));
});

router.post('/users', async (req, res) => {
  try {
    const { name, email, password, perfil, ownerId, active } = req.body;
    const id = uuidv4();
    const { rows } = await q(
      'INSERT INTO users (id,name,email,password,perfil,owner_id,active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [id, name, email, password, perfil||'responsavel', ownerId||null, active!==false]
    );
    send(res, toUser(rows[0]));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/users/:id', async (req, res) => {
  try {
    const { name, email, password, perfil, ownerId, active } = req.body;
    let sql, params;
    if (password) {
      sql = 'UPDATE users SET name=$1,email=$2,password=$3,perfil=$4,owner_id=$5,active=$6 WHERE id=$7 RETURNING *';
      params = [name, email, password, perfil, ownerId||null, active!==false, req.params.id];
    } else {
      sql = 'UPDATE users SET name=$1,email=$2,perfil=$3,owner_id=$4,active=$5 WHERE id=$6 RETURNING *';
      params = [name, email, perfil, ownerId||null, active!==false, req.params.id];
    }
    const { rows } = await q(sql, params);
    if (!rows.length) return notFound(res,'Usuário');
    send(res, toUser(rows[0]));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/change-password', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Não autenticado' });
  const { oldPassword, newPassword } = req.body;
  try {
    const { rows } = await q('SELECT * FROM users WHERE id=$1', [req.session.userId]);
    if (!rows.length) return res.status(404).json({ error: 'Usuário não encontrado' });
    const user = rows[0];
    if (user.password !== oldPassword) return res.status(400).json({ error: 'Senha atual incorreta' });
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres' });
    await q('UPDATE users SET password=$1 WHERE id=$2', [newPassword, req.session.userId]);
    send(res, { ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/users/:id', async (req, res) => {
  const { rows } = await q('SELECT perfil FROM users WHERE id=$1', [req.params.id]);
  if (rows[0]?.perfil === 'responsavel') return res.status(403).json({ error: 'Usuários com perfil Responsável não podem ser excluídos.' });
  await q('DELETE FROM users WHERE id=$1', [req.params.id]);
  send(res, { ok: true });
});

// ── Projects ───────────────────────────────────────────────
router.get('/projects', async (req, res) => {
  const { rows } = await q('SELECT * FROM projects ORDER BY name');
  send(res, rows.map(toProject));
});

router.post('/projects', async (req, res) => {
  const { name, color, desc, clientId, productId, sellerId, ownerId, dateStart, dateEnd } = req.body;
  const id = uuidv4();
  const { rows } = await q(
    'INSERT INTO projects (id,name,color,descr,client_id,product_id,seller_id,owner_id,date_start,date_end) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
    [id, name, color||'#185FA5', desc||'', clientId||null, productId||null, sellerId||null, ownerId||null, dateStart||null, dateEnd||null]
  );
  send(res, toProject(rows[0]));
});

router.put('/projects/:id', async (req, res) => {
  const { name, color, desc, clientId, productId, sellerId, ownerId, dateStart, dateEnd } = req.body;
  const { rows } = await q(
    'UPDATE projects SET name=$1,color=$2,descr=$3,client_id=$4,product_id=$5,seller_id=$6,owner_id=$7,date_start=$8,date_end=$9 WHERE id=$10 RETURNING *',
    [name, color||'#185FA5', desc||'', clientId||null, productId||null, sellerId||null, ownerId||null, dateStart||null, dateEnd||null, req.params.id]
  );
  if (!rows.length) return notFound(res,'Projeto');
  send(res, toProject(rows[0]));
});

router.delete('/projects/:id', async (req, res) => {
  await q('DELETE FROM projects WHERE id=$1', [req.params.id]);
  send(res, { ok: true });
});

// Criar projeto a partir de template
router.post('/projects/from-template', async (req, res) => {
  const { templateId, projectData } = req.body;
  const { rows: trows } = await q('SELECT * FROM templates WHERE id=$1', [templateId]);
  if (!trows.length) return notFound(res, 'Template');
  const tpl = trows[0];
  const projId = uuidv4();
  const { name, color, desc, clientId, productId, sellerId, ownerId } = projectData;
  await q(
    'INSERT INTO projects (id,name,color,descr,client_id,product_id,seller_id,owner_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [projId, name, color||'#185FA5', desc||'', clientId||null, productId||null, sellerId||null, ownerId||null]
  );
  const tasks = tpl.tasks || [];
  for (const t of tasks) {
    await q(
      'INSERT INTO tasks (id,name,proj_id,grp,status,owner_id,priority,date,date_start,date_end,turno,descr,comments) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
      [uuidv4(), t.name, projId, t.group||0, 'pending', ownerId||null, t.priority||'medium', '','','','manha', t.desc||'', JSON.stringify([])]
    );
  }
  const { rows } = await q('SELECT * FROM projects WHERE id=$1', [projId]);
  send(res, { project: toProject(rows[0]), tasksCreated: tasks.length });
});

// ── Tasks ──────────────────────────────────────────────────
router.get('/tasks', async (req, res) => {
  const { projId } = req.query;
  const { rows } = projId
    ? await q('SELECT * FROM tasks WHERE proj_id=$1 ORDER BY created_at', [projId])
    : await q('SELECT * FROM tasks ORDER BY created_at');
  send(res, rows.map(toTask));
});

router.post('/tasks', async (req, res) => {
  const { name, projId, group, status, ownerId, priority, date, dateStart, dateEnd, turno, desc, meet } = req.body;
  const id = uuidv4();
  const { rows } = await q(
    'INSERT INTO tasks (id,name,proj_id,grp,status,owner_id,priority,date,date_start,date_end,turno,descr,comments,meet) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *',
    [id, name, projId||null, group||0, status||'pending', ownerId||null, priority||'medium',
     date||'', dateStart||'', dateEnd||'', turno||'manha', desc||'',
     JSON.stringify([]), meet ? JSON.stringify(meet) : null]
  );
  send(res, toTask(rows[0]));
});

router.get('/tasks/:id', async (req, res) => {
  const { rows } = await q('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
  if (!rows.length) return notFound(res,'Tarefa');
  send(res, toTask(rows[0]));
});

router.put('/tasks/:id', async (req, res) => {
  const { name, projId, group, status, ownerId, priority, date, dateStart, dateEnd, turno, desc, meet, comments } = req.body;
  const { rows } = await q(
    'UPDATE tasks SET name=$1,proj_id=$2,grp=$3,status=$4,owner_id=$5,priority=$6,date=$7,date_start=$8,date_end=$9,turno=$10,descr=$11,meet=$12,comments=$13 WHERE id=$14 RETURNING *',
    [name, projId||null, group||0, status||'pending', ownerId||null, priority||'medium',
     date||'', dateStart||'', dateEnd||'', turno||'manha', desc||'',
     meet ? JSON.stringify(meet) : null,
     comments ? JSON.stringify(comments) : null,
     req.params.id]
  );
  if (!rows.length) return notFound(res,'Tarefa');
  send(res, toTask(rows[0]));
});

router.delete('/tasks/:id', async (req, res) => {
  await q('DELETE FROM tasks WHERE id=$1', [req.params.id]);
  send(res, { ok: true });
});

router.post('/tasks/:id/comments', async (req, res) => {
  const { rows } = await q('SELECT comments FROM tasks WHERE id=$1', [req.params.id]);
  if (!rows.length) return notFound(res,'Tarefa');
  const comments = rows[0].comments || [];
  const c = { id: uuidv4(), ...req.body, time: new Date().toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short', timeZone:'America/Sao_Paulo' }) };
  comments.push(c);
  await q('UPDATE tasks SET comments=$1 WHERE id=$2', [JSON.stringify(comments), req.params.id]);
  send(res, c);
});

router.post('/tasks/:id/meet', async (req, res) => {
  const { rows } = await q('UPDATE tasks SET meet=$1 WHERE id=$2 RETURNING *', [JSON.stringify(req.body), req.params.id]);
  if (!rows.length) return notFound(res,'Tarefa');
  send(res, toTask(rows[0]));
});

router.delete('/tasks/:id/meet', async (req, res) => {
  await q('UPDATE tasks SET meet=NULL WHERE id=$1', [req.params.id]);
  send(res, { ok: true });
});

// ── Clients ────────────────────────────────────────────────
router.get('/clients', async (req, res) => {
  const { rows } = await q('SELECT * FROM clients ORDER BY name');
  send(res, rows.map(toClient));
});

router.post('/clients', async (req, res) => {
  const { name, classification, productId, date, sellerId, notes } = req.body;
  const id = uuidv4();
  const { rows } = await q(
    'INSERT INTO clients (id,name,classification,product_id,date,seller_id,notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [id, name, classification||'Ouro', productId||null, date||'', sellerId||null, notes||'']
  );
  send(res, toClient(rows[0]));
});

router.put('/clients/:id', async (req, res) => {
  const { name, classification, productId, date, sellerId, notes } = req.body;
  const { rows } = await q(
    'UPDATE clients SET name=$1,classification=$2,product_id=$3,date=$4,seller_id=$5,notes=$6 WHERE id=$7 RETURNING *',
    [name, classification||'Ouro', productId||null, date||'', sellerId||null, notes||'', req.params.id]
  );
  if (!rows.length) return notFound(res,'Cliente');
  send(res, toClient(rows[0]));
});

router.delete('/clients/:id', async (req, res) => {
  await q('DELETE FROM clients WHERE id=$1', [req.params.id]);
  send(res, { ok: true });
});

// ── Products ───────────────────────────────────────────────
router.get('/products', async (req, res) => {
  const { rows } = await q('SELECT * FROM products ORDER BY name');
  send(res, rows.map(toProduct));
});

router.post('/products', async (req, res) => {
  const { name, desc, active } = req.body;
  const id = uuidv4();
  const { rows } = await q(
    'INSERT INTO products (id,name,descr,active) VALUES ($1,$2,$3,$4) RETURNING *',
    [id, name, desc||'', active!==false]
  );
  send(res, toProduct(rows[0]));
});

router.put('/products/:id', async (req, res) => {
  const { name, desc, active } = req.body;
  const { rows } = await q(
    'UPDATE products SET name=$1,descr=$2,active=$3 WHERE id=$4 RETURNING *',
    [name, desc||'', active!==false, req.params.id]
  );
  if (!rows.length) return notFound(res,'Produto');
  send(res, toProduct(rows[0]));
});

router.delete('/products/:id', async (req, res) => {
  await q('DELETE FROM products WHERE id=$1', [req.params.id]);
  send(res, { ok: true });
});

// ── Owners ─────────────────────────────────────────────────
router.get('/owners', async (req, res) => {
  const { rows } = await q('SELECT * FROM owners ORDER BY name');
  send(res, rows.map(toOwner));
});

router.post('/owners', async (req, res) => {
  const { name, email, color, initials, active } = req.body;
  const id = uuidv4();
  const { rows } = await q(
    'INSERT INTO owners (id,name,email,color,initials,active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [id, name, email||'', color||'#185FA5', initials||name.slice(0,2).toUpperCase(), active!==false]
  );
  send(res, toOwner(rows[0]));
});

router.put('/owners/:id', async (req, res) => {
  const { name, email, color, initials, active } = req.body;
  const { rows } = await q(
    'UPDATE owners SET name=$1,email=$2,color=$3,initials=$4,active=$5 WHERE id=$6 RETURNING *',
    [name, email||'', color||'#185FA5', initials||name.slice(0,2).toUpperCase(), active!==false, req.params.id]
  );
  if (!rows.length) return notFound(res,'Responsável');
  send(res, toOwner(rows[0]));
});

router.delete('/owners/:id', async (req, res) => {
  await q('DELETE FROM owners WHERE id=$1', [req.params.id]);
  send(res, { ok: true });
});

// ── Sellers ────────────────────────────────────────────────
router.get('/sellers', async (req, res) => {
  const { rows } = await q('SELECT * FROM sellers ORDER BY name');
  send(res, rows.map(toSeller));
});

router.post('/sellers', async (req, res) => {
  const { name, email, phone, active } = req.body;
  const id = uuidv4();
  const { rows } = await q(
    'INSERT INTO sellers (id,name,email,phone,active) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [id, name, email||'', phone||'', active!==false]
  );
  send(res, toSeller(rows[0]));
});

router.put('/sellers/:id', async (req, res) => {
  const { name, email, phone, active } = req.body;
  const { rows } = await q(
    'UPDATE sellers SET name=$1,email=$2,phone=$3,active=$4 WHERE id=$5 RETURNING *',
    [name, email||'', phone||'', active!==false, req.params.id]
  );
  if (!rows.length) return notFound(res,'Vendedor');
  send(res, toSeller(rows[0]));
});

router.delete('/sellers/:id', async (req, res) => {
  await q('DELETE FROM sellers WHERE id=$1', [req.params.id]);
  send(res, { ok: true });
});

// ── Templates ──────────────────────────────────────────────
router.get('/templates', async (req, res) => {
  const { rows } = await q('SELECT * FROM templates ORDER BY name');
  send(res, rows.map(toTemplate));
});

router.post('/templates', async (req, res) => {
  const { name, desc, tasks } = req.body;
  const id = uuidv4();
  const { rows } = await q(
    'INSERT INTO templates (id,name,descr,tasks) VALUES ($1,$2,$3,$4) RETURNING *',
    [id, name, desc||'', JSON.stringify(tasks||[])]
  );
  send(res, toTemplate(rows[0]));
});

router.put('/templates/:id', async (req, res) => {
  const { name, desc, tasks } = req.body;
  const { rows } = await q(
    'UPDATE templates SET name=$1,descr=$2,tasks=$3 WHERE id=$4 RETURNING *',
    [name, desc||'', JSON.stringify(tasks||[]), req.params.id]
  );
  if (!rows.length) return notFound(res,'Template');
  send(res, toTemplate(rows[0]));
});

router.delete('/templates/:id', async (req, res) => {
  await q('DELETE FROM templates WHERE id=$1', [req.params.id]);
  send(res, { ok: true });
});

// ── Notificações por email ─────────────────────────────────
router.post('/notify', async (req, res) => {
  const { type, toOwnerId, fromName, taskName, projName, comment, meetUrl, meetTitle } = req.body;
  try {
    const { rows } = await q('SELECT * FROM owners WHERE id=$1', [toOwnerId]);
    const owner = rows[0];
    if (!owner?.email) return send(res, { ok: false, reason: 'Responsável sem e-mail' });

    let subject = '', text = '';
    if (type === 'task_assigned') {
      subject = `[TeamSolidez] Nova tarefa atribuída a você: ${taskName}`;
      const meetSection = meetUrl
        ? `\n🔗 Link do Meet:\n${meetUrl}\n`
        : '';
      text = `Olá ${owner.name},\n\nVocê recebeu uma nova tarefa no TeamSolidez!\n\n📋 Tarefa: ${taskName}\n📁 Projeto: ${projName||'—'}\n👤 Atribuída por: ${fromName}${meetSection}\n\nAcesse o sistema para ver todos os detalhes:\n👉 https://team.solidez.net\n\nEquipe TeamSolidez\nSolidez Soluções`;
    } else if (type === 'comment_mention') {
      subject = `[TeamSolidez] Você foi mencionado em um comentário`;
      text    = `Olá ${owner.name},\n\n${fromName} mencionou você em um comentário na tarefa "${taskName}":\n\n📁 Projeto: ${projName||'—'}\n💬 "${comment}"\n\nAcesse o sistema para responder:\n👉 https://team.solidez.net\n\nEquipe TeamSolidez\nSolidez Soluções`;
    } else if (type === 'meet_created') {
      subject = `[TeamSolidez] Reunião criada para a tarefa: ${taskName}`;
      text    = `Olá ${owner.name},\n\nUma reunião Google Meet foi criada para você!\n\n📋 Tarefa: ${taskName}\n📁 Projeto: ${projName||'—'}\n📅 Reunião: ${meetTitle||taskName}\n👤 Criada por: ${fromName}\n\n🔗 Link do Meet:\n${meetUrl}\n\nAcesse o link acima para entrar na reunião.\n👉 https://team.solidez.net\n\nEquipe TeamSolidez\nSolidez Soluções`;
    }

    const nodemailer = require('nodemailer');
    if (!process.env.SMTP_HOST) throw new Error('SMTP não configurado');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port: +process.env.SMTP_PORT||587,
      secure: process.env.SMTP_SECURE==='true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    await transporter.sendMail({ from:`"TeamBoard" <${process.env.SMTP_USER}>`, to: owner.email, subject, text });
    send(res, { ok: true, sent: true, to: owner.email });
  } catch(err) {
    console.log(`[Notificação] ${err.message}`);
    send(res, { ok: true, sent: false, reason: err.message });
  }
});

// ── Ausências ──────────────────────────────────────────────
router.get('/ausencias', async (req, res) => {
  const { rows } = await q('SELECT * FROM ausencias ORDER BY date_start');
  send(res, rows.map(r=>({ id:r.id, ownerId:r.owner_id, tipo:r.tipo, dateStart:r.date_start, dateEnd:r.date_end, obs:r.obs||'' })));
});

router.post('/ausencias', async (req, res) => {
  const { ownerId, tipo, dateStart, dateEnd, obs } = req.body;
  const id = uuidv4();
  const { rows } = await q(
    'INSERT INTO ausencias (id,owner_id,tipo,date_start,date_end,obs) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [id, ownerId, tipo||'ferias', dateStart, dateEnd, obs||'']
  );
  send(res, { id:rows[0].id, ownerId:rows[0].owner_id, tipo:rows[0].tipo, dateStart:rows[0].date_start, dateEnd:rows[0].date_end, obs:rows[0].obs||'' });
});

router.put('/ausencias/:id', async (req, res) => {
  const { ownerId, tipo, dateStart, dateEnd, obs } = req.body;
  const { rows } = await q(
    'UPDATE ausencias SET owner_id=$1,tipo=$2,date_start=$3,date_end=$4,obs=$5 WHERE id=$6 RETURNING *',
    [ownerId, tipo||'ferias', dateStart, dateEnd, obs||'', req.params.id]
  );
  if(!rows.length) return notFound(res,'Ausência');
  send(res, { id:rows[0].id, ownerId:rows[0].owner_id, tipo:rows[0].tipo, dateStart:rows[0].date_start, dateEnd:rows[0].date_end, obs:rows[0].obs||'' });
});

router.delete('/ausencias/:id', async (req, res) => {
  await q('DELETE FROM ausencias WHERE id=$1', [req.params.id]);
  send(res, { ok: true });
});

module.exports = router;
