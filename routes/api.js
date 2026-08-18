const express  = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool }  = require('../db');
const nodemailer = require('nodemailer');
const bcrypt    = require('bcryptjs');
const router    = express.Router();

const send     = (res, data) => res.json(data);
const notFound = (res, e)   => res.status(404).json({ error: `${e} não encontrado` });
const q        = (sql, p)   => pool.query(sql, p);

// ── Chave de API para integração externa ──────────────────
const EXTERNAL_API_KEY = process.env.EXTERNAL_API_KEY || 'solidez-team-api-2024';

function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.apiKey;
  if (key !== EXTERNAL_API_KEY) {
    return res.status(401).json({ error: 'Chave de API inválida' });
  }
  next();
}

// ── Autorização por perfil ─────────────────────────────────
// Exige usuário autenticado
function requireAuth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: 'Não autenticado' });
  next();
}

// Rotas liberadas sem sessão
const ROTAS_PUBLICAS = ['/login', '/logout-local'];

// Trava global: qualquer rota não listada acima exige sessão ativa.
router.use((req, res, next) => {
  if (ROTAS_PUBLICAS.includes(req.path)) return next();
  if (req.path.startsWith('/ext/'))      return next();
  return requireAuth(req, res, next);
});

// ── Auditoria ──────────────────────────────────────────────
// Mapeia rota → nome legível da entidade
const ENTIDADES = {
  projects:'projeto', tasks:'tarefa', clients:'cliente', products:'produto',
  owners:'responsável', sellers:'vendedor', users:'usuário',
  ausencias:'ausência', templates:'modelo', 'task-daily-status':'agenda diária'
};

// Campos que nunca entram no log
const CAMPOS_OCULTOS = ['password','senha','token','secret'];

// Rótulos amigáveis para os campos
const ROTULOS = {
  name:'Nome', email:'E-mail', phone:'Telefone', status:'Situação',
  clientId:'Cliente', productId:'Produto', sellerId:'Vendedor', ownerId:'Responsável',
  projId:'Projeto', date:'Prazo', dateStart:'Data início', dateEnd:'Data fim',
  priority:'Prioridade', turno:'Turno', desc:'Descrição', notes:'Observações',
  qtdAgendas:'Qtd. agendas', cancelReason:'Motivo do cancelamento',
  classification:'Classificação', perfil:'Perfil', active:'Ativo', group:'Grupo',
  contactName:'Contato', contactRole:'Cargo do contato'
};

// Compara o estado anterior com o novo e devolve apenas o que mudou
function diffValores(antes, depois) {
  const mudancas = {};
  if (!depois) return mudancas;
  Object.keys(depois).forEach(k => {
    if (CAMPOS_OCULTOS.includes(k.toLowerCase())) return;
    const vAntes  = antes ? antes[k] : undefined;
    const vDepois = depois[k];
    if (typeof vDepois === 'object' && vDepois !== null) return; // ignora objetos/arrays
    const a = vAntes  === null || vAntes  === undefined ? '' : String(vAntes);
    const d = vDepois === null || vDepois === undefined ? '' : String(vDepois);
    if (a !== d) mudancas[ROTULOS[k] || k] = { de: a, para: d };
  });
  return mudancas;
}

// Grava um evento na trilha (nunca interrompe a operação principal)
async function registrarAuditoria(req, { action, entity, entityId, entityName, changes }) {
  try {
    await q(
      `INSERT INTO audit_log (user_id,user_name,user_perfil,action,entity,entity_id,entity_name,changes,ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        req.session?.userId || null,
        req.session?.userName || 'Desconhecido',
        req.session?.userPerfil || null,
        action, entity || null, entityId || null, entityName || null,
        changes && Object.keys(changes).length ? JSON.stringify(changes) : null,
        (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim()
      ]
    );
  } catch (e) {
    console.warn('[AUDIT] Falha ao registrar:', e.message);
  }
}

// Busca o nome do registro para exibir no log
async function nomeDoRegistro(tabela, id) {
  try {
    const { rows } = await q(`SELECT name FROM ${tabela} WHERE id=$1`, [id]);
    return rows[0]?.name || null;
  } catch { return null; }
}

// Intercepta automaticamente toda operação de escrita
router.use(async (req, res, next) => {
  const metodo = req.method;
  if (!['POST','PUT','PATCH','DELETE'].includes(metodo)) return next();
  if (req.path.startsWith('/ext/') || req.path === '/login' || req.path === '/logout-local') return next();

  // /clients/abc → ['clients','abc']
  const partes  = req.path.split('/').filter(Boolean);
  const recurso = partes[0];
  const entity  = ENTIDADES[recurso];
  if (!entity) return next();

  const id = partes[1] && partes[1] !== 'stats' ? partes[1] : null;
  const action = metodo === 'POST' ? (id ? 'editar' : 'criar')
               : metodo === 'DELETE' ? 'excluir' : 'editar';

  // Estado anterior — necessário para o diff e para saber o nome do excluído
  let antes = null;
  if (id && ['PUT','PATCH','DELETE'].includes(metodo)) {
    try {
      const { rows } = await q(`SELECT * FROM ${recurso} WHERE id=$1`, [id]);
      antes = rows[0] || null;
    } catch {}
  }

  // Intercepta a resposta para registrar apenas operações bem-sucedidas
  const jsonOriginal = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode < 400) {
      const nome = body?.name || antes?.name || null;
      let changes = {};
      if (action === 'excluir') {
        changes = antes?.name ? { Registro: { de: antes.name, para: '(excluído)' } } : {};
      } else if (action === 'editar' && antes) {
        // Converte snake_case do banco para camelCase do corpo da requisição
        const antesCamel = {};
        Object.keys(antes).forEach(k => {
          antesCamel[k.replace(/_([a-z])/g, (_,c) => c.toUpperCase())] = antes[k];
        });
        changes = diffValores(antesCamel, req.body);
      } else if (action === 'criar') {
        changes = diffValores({}, req.body);
      }
      registrarAuditoria(req, {
        action, entity,
        entityId: id || body?.id || null,
        entityName: nome,
        changes
      });
    }
    return jsonOriginal(body);
  };
  next();
});

// Exige perfil admin — bloqueia Responsável
function requireAdmin(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: 'Não autenticado' });
  if (req.session.userPerfil !== 'admin') {
    return res.status(403).json({
      error: 'SEM_PERMISSAO',
      message: 'Apenas Administradores podem realizar esta ação.'
    });
  }
  next();
}

// ── Rotas de integração externa (autenticação por API Key) ──

// GET /api/ext/projects — lista todos os projetos com clientes
router.get('/ext/projects', requireApiKey, async (req, res) => {
  const { rows } = await q(`
    SELECT p.id, p.name, p.color, p.date_start, p.date_end,
           c.name as client_name
    FROM projects p
    LEFT JOIN clients c ON c.id = p.client_id
    ORDER BY p.name
  `);
  send(res, rows.map(r => ({
    id: r.id, name: r.name, color: r.color,
    dateStart: r.date_start||'', dateEnd: r.date_end||'',
    clientName: r.client_name||''
  })));
});

// GET /api/ext/projects/:id/tasks — lista tarefas de um projeto
router.get('/ext/projects/:id/tasks', requireApiKey, async (req, res) => {
  const { rows } = await q(`
    SELECT t.id, t.name, t.status, t.grp, t.date_end,
           o.name as owner_name
    FROM tasks t
    LEFT JOIN owners o ON o.id = t.owner_id
    WHERE t.proj_id = $1
    ORDER BY t.grp, t.name
  `, [req.params.id]);
  send(res, rows.map(r => ({
    id: r.id, name: r.name, status: r.status,
    group: r.grp, dateEnd: r.date_end||'',
    ownerName: r.owner_name||''
  })));
});

// POST /api/ext/tasks/:id/comments — adiciona comentário numa tarefa
router.post('/ext/tasks/:id/comments', requireApiKey, async (req, res) => {
  const { text, author } = req.body;
  if (!text) return res.status(400).json({ error: 'Texto obrigatório' });
  const { rows } = await q('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
  if (!rows.length) return notFound(res, 'Tarefa');
  const task = rows[0];
  const comments = task.comments || [];
  const newComment = {
    id: uuidv4(),
    author: author || 'Resumo de Reunião',
    authorId: '',
    text,
    time: new Date().toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short', timeZone:'America/Sao_Paulo' }),
    mentionId: null
  };
  comments.push(newComment);
  await q('UPDATE tasks SET comments=$1 WHERE id=$2', [JSON.stringify(comments), req.params.id]);
  send(res, { ok: true, comment: newComment });
});

// POST /api/ext/projects/:id/tasks — cria nova tarefa em um projeto
router.post('/ext/projects/:id/tasks', requireApiKey, async (req, res) => {
  const { name, desc, ownerId, dateEnd, group } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  const id = uuidv4();
  const { rows } = await q(
    `INSERT INTO tasks (id,name,proj_id,grp,status,owner_id,priority,date,date_start,date_end,turno,descr,comments,meet)
     VALUES ($1,$2,$3,$4,'pending',$5,'medium',$6,$6,$6,'manha',$7,'[]',null) RETURNING *`,
    [id, name, req.params.id, group||0, ownerId||null, dateEnd||'', desc||'']
  );
  send(res, { ok: true, task: toTask(rows[0]) });
});

// GET /api/ext/owners — lista responsáveis ativos
router.get('/ext/owners', requireApiKey, async (req, res) => {
  const { rows } = await q('SELECT id, name, email FROM owners WHERE active=true ORDER BY name');
  send(res, rows);
});

// ── helpers de mapeamento ──────────────────────────────────
const toProject = r => r ? ({
  id: r.id, name: r.name, color: r.color, desc: r.descr,
  clientId: r.client_id, productId: r.product_id,
  sellerId: r.seller_id, ownerId: r.owner_id,
  dateStart: r.date_start||'', dateEnd: r.date_end||'',
  qtdAgendas: r.qtd_agendas||0,
  status: r.status||'ativo', tipo: r.tipo||'implantacao',
  cancelReason: r.cancel_reason||'', cancelDate: r.cancel_date||''
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
  sellerId: r.seller_id, notes: r.notes||'',
  contactName: r.contact_name||'', contactRole: r.contact_role||'',
  phone: r.phone||'', email: r.email||''
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
    if (!email || !password) return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });

    const { rows } = await q('SELECT * FROM users WHERE email=$1 AND active=true', [email]);
    // Mensagem genérica: não revela se o e-mail existe
    if (!rows.length) {
      await registrarAuditoria(req, { action:'login_falhou', entity:'sessão', entityName:email });
      return res.status(401).json({ error: 'E-mail ou senha incorretos' });
    }

    const user = rows[0];
    let ok = false;
    if (user.password && user.password.startsWith('$2')) {
      ok = await bcrypt.compare(password, user.password);
    } else {
      // Senha ainda em texto puro: valida e converte para hash na hora
      ok = user.password === password;
      if (ok) {
        const hash = await bcrypt.hash(password, 10);
        await q('UPDATE users SET password=$1 WHERE id=$2', [hash, user.id]);
      }
    }
    if (!ok) {
      await registrarAuditoria(req, { action:'login_falhou', entity:'sessão', entityName:email });
      return res.status(401).json({ error: 'E-mail ou senha incorretos' });
    }

    // Renova o ID da sessão no login (previne session fixation)
    req.session.regenerate(err => {
      if (err) return res.status(500).json({ error: 'Erro ao criar sessão' });
      req.session.userId     = user.id;
      req.session.userPerfil = user.perfil;
      req.session.userName   = user.name;
      req.session.ownerId    = user.owner_id;
      registrarAuditoria(req, { action:'login', entity:'sessão', entityId:user.id, entityName:user.name });
      send(res, { ok: true, user: toUser(user) });
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/logout-local', (req, res) => {
  req.session.destroy(() => send(res, { ok: true }));
});

router.get('/me', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Não autenticado' });
  try {
    const { rows } = await q('SELECT id,name,email,perfil,owner_id,active FROM users WHERE id=$1', [req.session.userId]);
    if (!rows.length) return res.status(401).json({ error: 'Usuário não encontrado' });
    send(res, toUser(rows[0]));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Users ──────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  const { rows } = await q('SELECT id,name,email,perfil,owner_id,active FROM users ORDER BY name');
  send(res, rows.map(toUser));
});

router.post('/users', requireAdmin, async (req, res) => {
  try {
    const { name, email, password, perfil, ownerId, active } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });
    const id = uuidv4();
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await q(
      'INSERT INTO users (id,name,email,password,perfil,owner_id,active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [id, name, email, hash, perfil||'responsavel', ownerId||null, active!==false]
    );
    send(res, toUser(rows[0]));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/users/:id', requireAdmin, async (req, res) => {
  try {
    const { name, email, password, perfil, ownerId, active } = req.body;
    let sql, params;
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });
      const hash = await bcrypt.hash(password, 10);
      sql = 'UPDATE users SET name=$1,email=$2,password=$3,perfil=$4,owner_id=$5,active=$6 WHERE id=$7 RETURNING *';
      params = [name, email, hash, perfil, ownerId||null, active!==false, req.params.id];
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
    const atualOk = user.password?.startsWith('$2')
      ? await bcrypt.compare(oldPassword, user.password)
      : user.password === oldPassword;
    if (!atualOk) return res.status(400).json({ error: 'Senha atual incorreta' });
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres' });
    const novoHash = await bcrypt.hash(newPassword, 10);
    await q('UPDATE users SET password=$1 WHERE id=$2', [novoHash, req.session.userId]);
    send(res, { ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/users/:id', requireAdmin, async (req, res) => {
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

router.post('/projects', requireAdmin, async (req, res) => {
  const { name, color, desc, clientId, productId, sellerId, ownerId, dateStart, dateEnd, qtdAgendas, status, tipo } = req.body;
  const id = uuidv4();
  const { rows } = await q(
    'INSERT INTO projects (id,name,color,descr,client_id,product_id,seller_id,owner_id,date_start,date_end,qtd_agendas,status,tipo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',
    [id, name, color||'#185FA5', desc||'', clientId||null, productId||null, sellerId||null, ownerId||null, dateStart||null, dateEnd||null, qtdAgendas||0, status||'ativo', tipo||'implantacao']
  );
  send(res, toProject(rows[0]));
});

router.put('/projects/:id', async (req, res) => {
  const { name, color, desc, clientId, productId, sellerId, ownerId, dateStart, dateEnd, qtdAgendas, status, cancelReason, tipo } = req.body;
  // Responsável pode editar, mas não pode trocar o cliente nem o responsável do projeto
  let finalClientId = clientId || null;
  let finalOwnerId  = ownerId  || null;
  if (req.session?.userPerfil !== 'admin') {
    const { rows: atual } = await q('SELECT client_id, owner_id FROM projects WHERE id=$1', [req.params.id]);
    if (!atual.length) return notFound(res,'Projeto');
    finalClientId = atual[0].client_id;
    finalOwnerId  = atual[0].owner_id;
  }
  // Registra a data do cancelamento automaticamente na transição para "cancelado"
  const { rows: anterior } = await q('SELECT status, cancel_date FROM projects WHERE id=$1', [req.params.id]);
  const statusFinal = status || 'ativo';
  let cancelDate = anterior[0]?.cancel_date || null;
  if (statusFinal === 'cancelado' && anterior[0]?.status !== 'cancelado') {
    cancelDate = new Date().toISOString().slice(0, 10);
  } else if (statusFinal !== 'cancelado') {
    cancelDate = null;
  }
  const motivo = statusFinal === 'cancelado' ? (cancelReason || '') : '';

  const { rows } = await q(
    'UPDATE projects SET name=$1,color=$2,descr=$3,client_id=$4,product_id=$5,seller_id=$6,owner_id=$7,date_start=$8,date_end=$9,qtd_agendas=$10,status=$11,cancel_reason=$12,cancel_date=$13,tipo=$14 WHERE id=$15 RETURNING *',
    [name, color||'#185FA5', desc||'', finalClientId, productId||null, sellerId||null, finalOwnerId, dateStart||null, dateEnd||null, qtdAgendas||0, statusFinal, motivo, cancelDate, tipo||'implantacao', req.params.id]
  );
  if (!rows.length) return notFound(res,'Projeto');
  send(res, toProject(rows[0]));
});

router.delete('/projects/:id', requireAdmin, async (req, res) => {
  // Cascade: remove status diários das tarefas, depois as tarefas, depois o projeto
  await q(`DELETE FROM task_daily_status WHERE task_id IN (SELECT id FROM tasks WHERE proj_id=$1)`, [req.params.id]).catch(()=>{});
  await q('DELETE FROM tasks WHERE proj_id=$1', [req.params.id]);
  await q('DELETE FROM projects WHERE id=$1', [req.params.id]);
  send(res, { ok: true });
});

// Criar projeto a partir de template
router.post('/projects/from-template', requireAdmin, async (req, res) => {
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

router.delete('/tasks/:id', requireAdmin, async (req, res) => {
  // Cascade: remove os status diários vinculados
  await q('DELETE FROM task_daily_status WHERE task_id=$1', [req.params.id]).catch(()=>{});
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
  const { name, classification, productId, date, sellerId, notes, contactName, contactRole, phone, email } = req.body;
  const id = uuidv4();
  const { rows } = await q(
    'INSERT INTO clients (id,name,classification,product_id,date,seller_id,notes,contact_name,contact_role,phone,email) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
    [id, name, classification||'Ouro', productId||null, date||'', sellerId||null, notes||'', contactName||'', contactRole||'', phone||'', email||'']
  );
  send(res, toClient(rows[0]));
});

router.put('/clients/:id', async (req, res) => {
  const { name, classification, productId, date, sellerId, notes, contactName, contactRole, phone, email } = req.body;
  const { rows } = await q(
    'UPDATE clients SET name=$1,classification=$2,product_id=$3,date=$4,seller_id=$5,notes=$6,contact_name=$7,contact_role=$8,phone=$9,email=$10 WHERE id=$11 RETURNING *',
    [name, classification||'Ouro', productId||null, date||'', sellerId||null, notes||'', contactName||'', contactRole||'', phone||'', email||'', req.params.id]
  );
  if (!rows.length) return notFound(res,'Cliente');
  send(res, toClient(rows[0]));
});

router.delete('/clients/:id', requireAdmin, async (req, res) => {
  // Verifica se há projetos vinculados
  const { rows: deps } = await q('SELECT name FROM projects WHERE client_id=$1 LIMIT 5', [req.params.id]);
  if (deps.length) {
    const { rows: [{ total }] } = await q('SELECT COUNT(*) AS total FROM projects WHERE client_id=$1', [req.params.id]);
    return res.status(409).json({
      error: 'CLIENTE_EM_USO',
      message: `Não é possível excluir: cliente vinculado a ${total} projeto(s).`,
      items: deps.map(d => d.name)
    });
  }
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

router.delete('/products/:id', requireAdmin, async (req, res) => {
  const { rows: projs } = await q('SELECT name FROM projects WHERE product_id=$1 LIMIT 5', [req.params.id]);
  const { rows: clis }  = await q('SELECT name FROM clients  WHERE product_id=$1 LIMIT 5', [req.params.id]);
  if (projs.length || clis.length) {
    const partes = [];
    if (projs.length) partes.push(`${projs.length} projeto(s)`);
    if (clis.length)  partes.push(`${clis.length} cliente(s)`);
    return res.status(409).json({
      error: 'PRODUTO_EM_USO',
      message: `Não é possível excluir: produto vinculado a ${partes.join(' e ')}.`,
      items: [...projs.map(p=>p.name), ...clis.map(c=>c.name)]
    });
  }
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

router.delete('/owners/:id', requireAdmin, async (req, res) => {
  const { rows: [{ tarefas }] }  = await q('SELECT COUNT(*) AS tarefas FROM tasks WHERE owner_id=$1', [req.params.id]);
  const { rows: projs }          = await q('SELECT name FROM projects WHERE owner_id=$1 LIMIT 5', [req.params.id]);
  const { rows: [{ usuarios }] } = await q('SELECT COUNT(*) AS usuarios FROM users WHERE owner_id=$1', [req.params.id]);
  const partes = [];
  if (+tarefas)      partes.push(`${tarefas} tarefa(s)`);
  if (projs.length)  partes.push(`${projs.length} projeto(s)`);
  if (+usuarios)     partes.push(`${usuarios} usuário(s)`);
  if (partes.length) {
    return res.status(409).json({
      error: 'RESPONSAVEL_EM_USO',
      message: `Não é possível excluir: responsável vinculado a ${partes.join(', ')}. Considere desativá-lo em vez de excluir.`,
      items: projs.map(p => p.name)
    });
  }
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

router.delete('/sellers/:id', requireAdmin, async (req, res) => {
  const { rows: projs } = await q('SELECT name FROM projects WHERE seller_id=$1 LIMIT 5', [req.params.id]);
  const { rows: clis }  = await q('SELECT name FROM clients  WHERE seller_id=$1 LIMIT 5', [req.params.id]);
  if (projs.length || clis.length) {
    const partes = [];
    if (projs.length) partes.push(`${projs.length} projeto(s)`);
    if (clis.length)  partes.push(`${clis.length} cliente(s)`);
    return res.status(409).json({
      error: 'VENDEDOR_EM_USO',
      message: `Não é possível excluir: vendedor vinculado a ${partes.join(' e ')}. Considere desativá-lo.`,
      items: [...projs.map(p=>p.name), ...clis.map(c=>c.name)]
    });
  }
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

router.delete('/templates/:id', requireAdmin, async (req, res) => {
  await q('DELETE FROM templates WHERE id=$1', [req.params.id]);
  send(res, { ok: true });
});

// ── Notificações por email ─────────────────────────────────
router.post('/notify', async (req, res) => {
  const { type, toOwnerId, fromName, taskName, projName, comment, meetUrl, meetTitle } = req.body;
  console.log(`[Notify] Rota chamada! type=${type} toOwnerId=${toOwnerId}`);  // ← adicionar
  try {
    const { rows } = await q('SELECT * FROM owners WHERE id=$1', [toOwnerId]);
    console.log(`[Notify] Owner encontrado: ${rows[0]?.name} email=${rows[0]?.email}`);  // ← adicionar
    const owner = rows[0];

    // Busca e-mail do owner ou do usuário vinculado ao owner
    let email = owner?.email || '';
    if (!email) {
      const { rows: urows } = await q('SELECT email FROM users WHERE owner_id=$1 AND active=true LIMIT 1', [toOwnerId]);
      email = urows[0]?.email || '';
    }
    if (!email) return send(res, { ok: false, reason: 'Responsável sem e-mail' });

    let subject = '', text = '';
    if (type === 'task_assigned') {
      subject = `[TeamSolidez] Nova tarefa atribuída a você: ${taskName}`;
      const meetSection = meetUrl
        ? `\n🔗 Link do Meet:\n${meetUrl}\n`
        : '';
      text = `Olá ${owner.name},\n\nVocê recebeu uma nova tarefa no TeamSolidez!\n\n📋 Tarefa: ${taskName}\n📁 Projeto: ${projName||'—'}\n👤 Atribuída por: ${fromName}${meetSection}\n\nAcesse o sistema para ver todos os detalhes:\n👉 https://solidezteam.solidez.net\n\nEquipe TeamSolidez\nSolidez Soluções`;
    } else if (type === 'comment_mention') {
      subject = `[TeamSolidez] Você foi mencionado em um comentário`;
      text    = `Olá ${owner.name},\n\n${fromName} mencionou você em um comentário na tarefa "${taskName}":\n\n📁 Projeto: ${projName||'—'}\n💬 "${comment}"\n\nAcesse o sistema para responder:\n👉 https://solidezteam.solidez.net\n\nEquipe TeamSolidez\nSolidez Soluções`;
    } else if (type === 'meet_created') {
      subject = `[TeamSolidez] Reunião criada para a tarefa: ${taskName}`;
      text    = `Olá ${owner.name},\n\nUma reunião Google Meet foi criada para você!\n\n📋 Tarefa: ${taskName}\n📁 Projeto: ${projName||'—'}\n📅 Reunião: ${meetTitle||taskName}\n👤 Criada por: ${fromName}\n\n🔗 Link do Meet:\n${meetUrl}\n\nAcesse o link acima para entrar na reunião.\n👉 https://solidezteam.solidez.net\n\nEquipe TeamSolidez\nSolidez Soluções`;
    }
    
console.log(`[Notify] Iniciando envio para: ${email}`);
console.log(`[Notify] SMTP_USER: ${process.env.SMTP_USER}`);
console.log(`[Notify] SMTP_HOST: ${process.env.SMTP_HOST}`);
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: +process.env.SMTP_PORT || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});await transporter.sendMail({
  from: `"TeamSolidez" <${process.env.SMTP_USER}>`,
  to: email,
  subject,
  text
});
console.log(`[Notify] Email enviado com sucesso para ${email}`);
send(res, { ok: true, sent: true, to: email });
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

router.delete('/ausencias/:id', requireAdmin, async (req, res) => {
  await q('DELETE FROM ausencias WHERE id=$1', [req.params.id]);
  send(res, { ok: true });
});

// ── Task Daily Status ───────────────────────────────────────
// GET /task-daily-status?month=YYYY-MM  → retorna todos os registros do mês
router.get('/task-daily-status', async (req, res) => {
  const { month } = req.query; // ex: "2026-05"
  try {
    const { rows } = month
      ? await q(`SELECT task_id, date, status FROM task_daily_status WHERE date LIKE $1 ORDER BY date`, [month + '-%'])
      : await q(`SELECT task_id, date, status FROM task_daily_status ORDER BY date`);
    send(res, rows.map(r => ({ taskId: r.task_id, date: r.date, status: r.status })));
  } catch(err) { send(res, []); }
});

// POST /task-daily-status  → cria ou atualiza status do dia
router.post('/task-daily-status', async (req, res) => {
  const { taskId, date, status } = req.body;
  if(!taskId || !date || !status) return send(res, { ok: false, error: 'taskId, date e status são obrigatórios' });
  await q(
    `INSERT INTO task_daily_status (task_id, date, status, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (task_id, date) DO UPDATE SET status=$3, updated_at=NOW()`,
    [taskId, date, status]
  );

  // Sincroniza o status da tarefa com os dias marcados:
  // todos os dias úteis concluídos → tarefa Concluída; senão volta para Em andamento
  let taskStatus = null;
  try {
    const { rows: [t] } = await q(
      'SELECT status, date_start, date_end FROM tasks WHERE id=$1', [taskId]
    );
    const temPeriodo = t && t.date_start && t.date_end && t.date_start !== t.date_end;
    if (temPeriodo && t.status !== 'cancel' && t.status !== 'na') {
      // Monta a lista de dias úteis do período
      const uteis = [];
      const ini = new Date(t.date_start + 'T00:00:00');
      const fim = new Date(t.date_end + 'T00:00:00');
      for (let d = new Date(ini); d <= fim; d.setDate(d.getDate() + 1)) {
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) uteis.push(d.toISOString().slice(0, 10));
      }
      const { rows: marcados } = await q(
        `SELECT date, status FROM task_daily_status WHERE task_id=$1 AND status IN ('done','cancel')`, [taskId]
      );
      const setDone   = new Set(marcados.filter(m => m.status === 'done').map(m => m.date));
      const setCancel = new Set(marcados.filter(m => m.status === 'cancel').map(m => m.date));
      // Dias desmarcados pelo cliente não impedem a conclusão da tarefa
      const pendentes = uteis.filter(d => !setCancel.has(d));
      const todosFeitos = pendentes.length > 0 && pendentes.every(d => setDone.has(d));
      const novo = todosFeitos ? 'done' : (t.status === 'done' ? 'progress' : t.status);
      if (novo !== t.status) {
        await q('UPDATE tasks SET status=$1 WHERE id=$2', [novo, taskId]);
        taskStatus = novo;
      }
    }
  } catch (e) {
    console.warn('[SYNC] Falha ao sincronizar status da tarefa:', e.message);
  }

  send(res, { ok: true, taskId, date, status, taskStatus });
});

// ── Dashboard ──────────────────────────────────────────────
// GET /dashboard?mes=&ano=&ownerId=&status=
// Consolida projetos, agendas contratadas x realizadas e evolução mensal
router.get('/dashboard', async (req, res) => {
  try {
    const { ano, ownerId, status, projId } = req.query;

    // Projetos com dados do cliente
    const { rows: projs } = await q(`
      SELECT p.id, p.name, p.status, p.tipo, p.qtd_agendas, p.date_start, p.date_end,
             p.cancel_reason, p.cancel_date, p.owner_id,
             c.name AS client_name
      FROM projects p
      LEFT JOIN clients c ON c.id = p.client_id
      ORDER BY p.date_start DESC NULLS LAST
    `);

    // Todas as tarefas relevantes
    const { rows: tasks } = await q(`
      SELECT id, proj_id, owner_id, status, date, date_start, date_end
      FROM tasks
    `);

    // Status diário das agendas de período
    const { rows: daily } = await q(`SELECT task_id, date, status FROM task_daily_status`);
    const dailyMap = {};
    daily.forEach(d => { dailyMap[d.task_id + '|' + d.date] = d.status; });

    // Conta dias úteis realizados de uma tarefa
    const contarDias = (t) => {
      const temPeriodo = t.date_start && t.date_end && t.date_start !== t.date_end;
      if (!temPeriodo) {
        const dref = t.date_start || t.date || '';
        return { agendados: dref ? 1 : 0, realizados: t.status === 'done' ? 1 : 0, desmarcados: 0, dias: dref ? [dref] : [] };
      }
      let agendados = 0, realizados = 0, desmarcados = 0; const dias = [];
      const ini = new Date(t.date_start + 'T00:00:00');
      const fim = new Date(t.date_end + 'T00:00:00');
      for (let d = new Date(ini); d <= fim; d.setDate(d.getDate() + 1)) {
        const dow = d.getDay();
        if (dow === 0 || dow === 6) continue; // ignora fim de semana
        const ds = d.toISOString().slice(0, 10);
        const st = dailyMap[t.id + '|' + ds];
        // Dia desmarcado pelo cliente sai do total agendado
        if (st === 'cancel') { desmarcados++; continue; }
        agendados++;
        dias.push(ds);
        if (st === 'done') realizados++;
      }
      return { agendados, realizados, desmarcados, dias };
    };

    const dentroDoAno = (d) => !ano || (d || '').startsWith(ano);

    // ── Comparativo por projeto ──
    const porProjeto = projs.map(p => {
      let ptasks = tasks.filter(t => t.proj_id === p.id);
      if (ownerId) ptasks = ptasks.filter(t => t.owner_id === ownerId);

      let agendadas = 0, realizadas = 0, desmarcadas = 0, naoAplicavel = 0;
      let totalTarefas = 0, tarefasConcluidas = 0;

      ptasks.forEach(t => {
        const dref = t.date_start || t.date || '';
        if (!dentroDoAno(dref)) return;
        totalTarefas++;
        if (t.status === 'done')   tarefasConcluidas++;
        if (t.status === 'na')     { naoAplicavel++; return; }
        // Tarefa inteira desmarcada: conta todos os dias úteis que ela ocupava
        if (t.status === 'cancel') {
          const c0 = contarDias(t);
          desmarcadas += (c0.agendados + c0.desmarcados) || 1;
          return;
        }
        const c = contarDias(t);
        agendadas   += c.agendados;
        realizadas  += c.realizados;
        desmarcadas += c.desmarcados;
      });

      const contratadas = p.qtd_agendas || 0;
      const pct = contratadas > 0
        ? Math.round(realizadas / contratadas * 100)
        : (agendadas > 0 ? Math.round(realizadas / agendadas * 100) : 0);
      const aplicaveis = totalTarefas - desmarcadas - naoAplicavel;
      const pctTarefas = aplicaveis > 0 ? Math.round(tarefasConcluidas / aplicaveis * 100) : 0;

      return {
        id: p.id, nome: p.name, cliente: p.client_name || '',
        situacao: p.status || 'ativo', tipo: p.tipo || 'implantacao',
        dateStart: p.date_start || '', dateEnd: p.date_end || '',
        cancelReason: p.cancel_reason || '', cancelDate: p.cancel_date || '',
        contratadas, agendadas, realizadas, desmarcadas,
        pendentes: Math.max(agendadas - realizadas, 0),
        pct, totalTarefas, tarefasConcluidas, pctTarefas,
        completo: aplicaveis > 0 && tarefasConcluidas === aplicaveis
      };
    }).filter(p => (!status || p.situacao === status) && (!projId || p.id === projId));

    // ── Evolução mensal (agendas realizadas por mês) ──
    // Considera apenas os projetos que passaram pelos filtros acima
    const idsFiltrados = new Set(porProjeto.map(p => p.id));
    const porMes = {};
    tasks.forEach(t => {
      if (!idsFiltrados.has(t.proj_id)) return;
      if (ownerId && t.owner_id !== ownerId) return;
      if (t.status === 'cancel' || t.status === 'na') return;
      const c = contarDias(t);
      c.dias.forEach(ds => {
        if (!dentroDoAno(ds)) return;
        const mes = ds.slice(0, 7);
        if (!porMes[mes]) porMes[mes] = { agendadas: 0, realizadas: 0 };
        porMes[mes].agendadas++;
        const temPeriodo = t.date_start && t.date_end && t.date_start !== t.date_end;
        const feito = temPeriodo ? dailyMap[t.id + '|' + ds] === 'done' : t.status === 'done';
        if (feito) porMes[mes].realizadas++;
      });
    });
    const evolucao = Object.entries(porMes)
      .map(([mes, v]) => ({ mes, ...v }))
      .sort((a, b) => a.mes.localeCompare(b.mes));

    // ── Totais gerais ──
    const hoje = new Date().toISOString().slice(0, 10);
    // Marca cada projeto atrasado e calcula quantos dias passaram do prazo
    porProjeto.forEach(p => {
      p.atrasado = p.situacao === 'ativo' && !!p.dateEnd && p.dateEnd < hoje && !p.completo;
      p.diasAtraso = p.atrasado
        ? Math.floor((new Date(hoje) - new Date(p.dateEnd)) / 86400000)
        : 0;
    });
    const resumo = {
      projetos: {
        total:     porProjeto.length,
        ativo:     porProjeto.filter(p => p.situacao === 'ativo').length,
        concluido: porProjeto.filter(p => p.situacao === 'concluido').length,
        pausado:   porProjeto.filter(p => p.situacao === 'pausado').length,
        cancelado: porProjeto.filter(p => p.situacao === 'cancelado').length,
        atrasados: porProjeto.filter(p => p.atrasado).length
      },
      agendas: {
        contratadas: porProjeto.reduce((s, p) => s + p.contratadas, 0),
        agendadas:   porProjeto.reduce((s, p) => s + p.agendadas, 0),
        realizadas:  porProjeto.reduce((s, p) => s + p.realizadas, 0),
        desmarcadas: porProjeto.reduce((s, p) => s + p.desmarcadas, 0)
      }
    };
    resumo.agendas.pct = resumo.agendas.contratadas > 0
      ? Math.round(resumo.agendas.realizadas / resumo.agendas.contratadas * 100)
      : 0;

    send(res, { resumo, projetos: porProjeto, evolucao });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Auditoria — consulta (somente admin) ──────────────────
// GET /audit?user=&action=&entity=&de=&ate=&q=&page=
router.get('/audit', requireAdmin, async (req, res) => {
  try {
    const { user, action, entity, de, ate, q: busca } = req.query;
    const page  = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = 50;
    const off   = (page - 1) * limit;

    const cond = [], par = [];
    if (user)   { par.push(user);            cond.push(`user_id = $${par.length}`); }
    if (action) { par.push(action);          cond.push(`action  = $${par.length}`); }
    if (entity) { par.push(entity);          cond.push(`entity  = $${par.length}`); }
    if (de)     { par.push(de);              cond.push(`created_at >= $${par.length}::date`); }
    if (ate)    { par.push(ate);             cond.push(`created_at < ($${par.length}::date + INTERVAL '1 day')`); }
    if (busca)  { par.push('%'+busca+'%');   cond.push(`(entity_name ILIKE $${par.length} OR user_name ILIKE $${par.length})`); }
    const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';

    const { rows: [{ total }] } = await q(`SELECT COUNT(*) AS total FROM audit_log ${where}`, par);
    const { rows } = await q(
      `SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${off}`, par
    );

    send(res, {
      total: parseInt(total),
      page, limit,
      paginas: Math.ceil(total / limit),
      registros: rows.map(r => ({
        id: r.id, userId: r.user_id, userName: r.user_name, userPerfil: r.user_perfil,
        action: r.action, entity: r.entity, entityId: r.entity_id, entityName: r.entity_name,
        changes: r.changes, ip: r.ip, createdAt: r.created_at
      }))
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /audit/resumo — contadores para os cards
router.get('/audit/resumo', requireAdmin, async (req, res) => {
  try {
    const { rows: [hoje] } = await q(
      `SELECT COUNT(*) AS total FROM audit_log WHERE created_at >= CURRENT_DATE`);
    const { rows: [exc] } = await q(
      `SELECT COUNT(*) AS total FROM audit_log WHERE action='excluir' AND created_at >= NOW() - INTERVAL '30 days'`);
    const { rows: [falhas] } = await q(
      `SELECT COUNT(*) AS total FROM audit_log WHERE action='login_falhou' AND created_at >= NOW() - INTERVAL '7 days'`);
    const { rows: [geral] } = await q(`SELECT COUNT(*) AS total FROM audit_log`);
    send(res, {
      hoje: +hoje.total, exclusoes30d: +exc.total,
      loginsFalhos7d: +falhas.total, total: +geral.total
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
