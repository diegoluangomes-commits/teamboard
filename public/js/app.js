// ── Constantes fixas ───────────────────────────────────────
const GROUPS = [
  { name: 'Onboarding',         color: '#185FA5', bg: '#E6F1FB', text: '#0C447C' },
  { name: 'Preparação de base', color: '#3B6D11', bg: '#EAF3DE', text: '#27500A' },
  { name: 'Treinamento',        color: '#BA7517', bg: '#FAEEDA', text: '#633806' },
  { name: 'Acompanhamento',     color: '#993556', bg: '#FBEAF0', text: '#72243E' },
  { name: 'Administrativo',     color: '#534AB7', bg: '#EEEDFE', text: '#3C3489' }
];

// ── Timeout por inatividade ───────────────────────────────
// Avisa 10 min antes de expirar e redireciona ao expirar
const TIMEOUT_MS = 2 * 60 * 60 * 1000;    // 2h (igual ao servidor)
const AVISO_MS   = 10 * 60 * 1000;         // avisa 10min antes
let _timeoutAviso, _timeoutExpira;

function resetarTimeout() {
  clearTimeout(_timeoutAviso);
  clearTimeout(_timeoutExpira);
  _timeoutAviso = setTimeout(() => {
    showToast('⏰ Sua sessão expira em 10 minutos. Salve o que estiver fazendo.', 'error');
  }, TIMEOUT_MS - AVISO_MS);
  _timeoutExpira = setTimeout(() => {
    // Destrói a sessão no servidor
    fetch('/api/logout-local', { method: 'POST' }).catch(()=>{});
    // Mostra a tela de login com aviso de inatividade
    const ls = document.getElementById('login-screen');
    const err = document.getElementById('login-error');
    const layout = document.querySelector('.layout');
    const topbar = document.querySelector('.topbar');
    if (err) {
      err.innerHTML = '⏰ Sessão encerrada por inatividade (2 horas sem uso).<br>Faça login novamente para continuar.';
      err.style.display = 'block';
    }
    if (layout)  layout.style.display = 'none';
    if (topbar)  topbar.style.display = 'none';
    if (ls) { ls.style.display = 'flex'; }
    clearTimeout(_timeoutAviso);
  }, TIMEOUT_MS);
}

function iniciarTimeoutInatividade() {
  ['click','keydown','scroll','mousemove'].forEach(ev =>
    document.addEventListener(ev, resetarTimeout, { passive: true })
  );
  resetarTimeout();
}

// ── Tema (modo escuro / claro) ─────────────────────────────
function toggleTheme(){
  const isDark=document.documentElement.getAttribute('data-theme')==='dark';
  const novoTema=isDark?'light':'dark';
  document.documentElement.setAttribute('data-theme', novoTema);
  localStorage.setItem('ts-theme', novoTema);
  const btn=$('btn-theme');
  if(btn) btn.textContent=novoTema==='dark'?'☀️':'🌙';
}

function applyTheme(){
  const saved=localStorage.getItem('ts-theme');
  const prefer=window.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light';
  const tema=saved||prefer;
  document.documentElement.setAttribute('data-theme', tema);
  const btn=$('btn-theme');
  if(btn) btn.textContent=tema==='dark'?'☀️':'🌙';
}

// ── Barra de loading global ───────────────────────────────
const loadingBar=()=>document.getElementById('loading-bar');
let _loadCount=0;
function showLoading(){
  _loadCount++;
  const b=loadingBar();if(!b)return;
  b.classList.remove('done'); b.classList.add('active');
}
function hideLoading(){
  _loadCount=Math.max(0,_loadCount-1);
  if(_loadCount>0)return;
  const b=loadingBar();if(!b)return;
  b.classList.add('done');
  setTimeout(()=>b.classList.remove('active','done'),500);
}

// ── Sidebar mobile ────────────────────────────────────────
function toggleSidebar(){
  const sb=document.getElementById('sidebar');
  sb?.classList.toggle('open');
}
function closeSidebarMobile(){
  if(window.innerWidth<=768) document.getElementById('sidebar')?.classList.remove('open');
}
// Fecha a sidebar ao clicar fora dela no mobile
document.addEventListener('click', e => {
  if(window.innerWidth>768)return;
  const sb=document.getElementById('sidebar');
  const toggle=$('sidebar-toggle');
  if(sb?.classList.contains('open') && !sb.contains(e.target) && e.target!==toggle && !toggle?.contains(e.target)){
    sb.classList.remove('open');
  }
});
// Exibe o toggle de sidebar no mobile
function applyMobileLayout(){
  const toggle=$('sidebar-toggle');
  if(!toggle)return;
  toggle.style.display=window.innerWidth<=768?'flex':'none';
}

// Override da função api() para integrar o loading

const SM = {
  done:     { l: 'Concluído',         c: 's-done'     },
  progress: { l: 'Em andamento',      c: 's-progress'  },
  pending:  { l: 'Pendente',          c: 's-pending'   },
  na:       { l: 'Não aplicável',     c: 's-na'        },
  cancel:   { l: 'Cliente desmarcou', c: 's-cancel'    }
};

const PROJ_TIPO = {
  implantacao: { l: 'Implantação', c: 'class-b' },
  treinamento: { l: 'Treinamento', c: 'class-c' },
  servicos:    { l: 'Serviços',    c: 'class-a' }
};

const PROJ_STATUS = {
  ativo:     { l: 'Ativo',     c: 's-progress', dot: '#185FA5' },
  concluido: { l: 'Concluído', c: 's-done',     dot: '#3B6D11' },
  pausado:   { l: 'Pausado',   c: 's-pending',  dot: '#BA7517' },
  cancelado: { l: 'Cancelado', c: 's-cancel',   dot: '#A32D2D' }
};

const PM = {
  high:   { l: 'Alta',  c: 'p-h' },
  medium: { l: 'Média', c: 'p-m' },
  low:    { l: 'Baixa', c: 'p-l' }
};

// ── Estado ─────────────────────────────────────────────────
let projects   = [];
let tasks      = [];
let clients    = [];
let products   = [];
let owners     = [];
let sellers    = [];
let templates  = [];
let users      = [];
let ausencias  = [];
let activeProj = null;
let editingTask = null, editingClient = null, editingProj = null;
let editingProduct = null, editingOwner = null, editingSeller = null, editingTemplate = null, editingUser = null;
let googleUser = null, pendingMeet = null;
let currentUser = null; // usuário logado no sistema

// ── Utils ──────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const fd = d  => { if (!d) return ''; const [y,m,dd] = d.slice(0,10).split('-'); return `${dd}/${m}/${y.slice(2)}`; };
const today = new Date().toISOString().slice(0,10);
const isOv  = (d,s) => d && d < today && s !== 'done' && s !== 'na' && s !== 'cancel';
const esc   = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
// Renderiza texto com quebras de linha (para comentários e descrições)
const escNl = s => esc(s).replace(/\n/g,'<br>');

// Busca dinâmica de owner e seller nos arrays carregados
const ownerById   = id => owners.find(o => o.id === id) || {};
const sellerById  = id => sellers.find(s => s.id === id) || {};
const productById = id => products.find(p => p.id === id) || {};
const clientById  = id => clients.find(c => c.id === id) || {};
const pname       = id => (projects.find(p => p.id === id)||{}).name || '';

function ownerAvatar(o) {
  if (!o || !o.id) return '<div class="av" style="background:#ddd;color:#888">?</div>';
  const bg  = o.color || '#ddd';
  const ini = o.initials || o.name?.slice(0,2).toUpperCase() || '??';
  return `<div class="av" style="background:${bg};color:#fff">${ini}</div>`;
}

// Lê o token CSRF do cookie e envia em toda escrita
function getCsrfToken() {
  const m = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/);
  return m ? m[1] : '';
}

async function api(method, path, body) {
  showLoading();
  try {
  const heads = { 'Content-Type': 'application/json' };
  if (['POST','PUT','PATCH','DELETE'].includes(method)) {
    heads['X-CSRF-Token'] = getCsrfToken();
  }
  const res = await fetch('/api' + path, {
    method,
    headers: heads,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  // 403 CSRF = token inválido → pede para recarregar
  if (res.status === 403 && data.error === 'CSRF_INVALIDO') {
    showToast('🔒 ' + (data.message || 'Erro de segurança. Recarregue a página.'), 'error');
    setTimeout(() => location.reload(), 2000);
    throw new Error(data.message);
  }
  // 401 = sessão expirada ou inexistente → volta para o login
  if (res.status === 401 && !path.startsWith('/login')) {
    const ls = document.getElementById('login-screen');
    if (ls) {
      ls.style.display = 'flex';
      const app = document.getElementById('app-wrap') || document.querySelector('.layout');
      if (app) app.style.display = 'none';
      if (typeof showToast === 'function') showToast('Sessão expirada. Faça login novamente.', 'error');
    } else {
      location.reload();
    }
    throw new Error('Não autenticado');
  }
  // 429 = excedeu o limite de requisições
  if (res.status === 429) {
    const err = new Error(data.error || 'Muitas requisições. Aguarde um momento.');
    err.rateLimited = true;
    showToast('⏳ ' + err.message, 'error');
    throw err;
  }
  // 400 = dados inválidos — mostra a mensagem ao usuário
  if (res.status === 400 && data.error === 'DADOS_INVALIDOS') {
    showToast('⚠️ ' + (data.message || 'Dados inválidos'), 'error');
    const err = new Error(data.message || 'Dados inválidos');
    err.validacao = true;
    throw err;
  }
  // 409 = conflito de integridade (registro em uso)
  if (res.status === 409) {
    const err = new Error(data.message || 'Registro em uso');
    err.conflict = true;
    err.items = data.items || [];
    throw err;
  }
  // 403 = sem permissão para a ação
  if (res.status === 403) {
    const err = new Error(data.message || 'Você não tem permissão para esta ação.');
    err.forbidden = true;
    throw err;
  }
  return data;
  } finally { hideLoading(); }
}

// Exibe erro de exclusão bloqueada
function showDeleteError(e) {
  if (e.forbidden) { showToast('🔒 ' + e.message, 'error'); return; }
  if (!e.conflict) { showToast('Erro ao excluir: ' + e.message, 'error'); return; }
  let msg = e.message;
  if (e.items?.length) msg += '\n\n• ' + e.items.slice(0, 5).join('\n• ');
  alert('⚠️ ' + msg);
}

// ── Auth ───────────────────────────────────────────────────
async function checkAuth() {
  try {
    const data = await fetch('/auth/status').then(r => r.json());
    if (data.loggedIn) {
      googleUser = data.user;
      $('btn-connect').classList.add('hidden');
      $('top-user').classList.remove('hidden');
      $('top-avatar').src = data.user.picture || '';
      $('top-name').textContent = data.user.name || '';
    } else {
      googleUser = null;
      $('btn-connect').classList.remove('hidden');
      $('top-user').classList.add('hidden');
    }
  } catch(e) { /* servidor pode não ter auth */ }
  const p = new URLSearchParams(location.search);
  if (p.get('auth') === 'success') { showToast('Google conectado!','success'); history.replaceState({},'',' /'); }
}

// ── Login local ────────────────────────────────────────────
async function doLogin(){
  const email=$('login-email').value.trim();
  const password=$('login-password').value;
  $('login-error').style.display='none';
  try{
    const res=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
    const data=await res.json();
    if(!res.ok){$('login-error').textContent=data.error||'Erro ao entrar';$('login-error').style.display='block';return;}
    currentUser=data.user;
    showApp();
    await loadAll();
  }catch(e){$('login-error').textContent='Erro de conexão';$('login-error').style.display='block';}
}

async function checkLocalAuth(){
  try{
    const res=await fetch('/api/me');
    if(res.ok){currentUser=await res.json();return true;}
  }catch(e){}
  return false;
}

function showApp(){
  $('login-screen').style.display='none';
  const tb=document.querySelector('.topbar');
  const lay=document.querySelector('.layout');
  if(tb) tb.style.display='flex';
  if(lay) lay.style.display='flex';

  const loggedDiv=$('local-user-info');
  const perfil=currentUser?.perfil;
  const badge=perfil==='admin'
    ?'<span style="background:#EEEDFE;color:#3C3489;font-size:10px;padding:1px 7px;border-radius:8px;font-weight:500">Admin</span>'
    :'<span style="background:#EAF3DE;color:#27500A;font-size:10px;padding:1px 7px;border-radius:8px;font-weight:500">Responsável</span>';
  if(loggedDiv)loggedDiv.innerHTML=`
    <span style="font-size:12px;color:var(--text)">${esc(currentUser?.name||'')}</span>
    ${badge}
    <button class="btn btn-sm" title="Alterar senha" onclick="openChangePassword()"
      style="padding:4px 7px;font-size:11px">🔑</button>
    <button class="btn btn-sm" onclick="doLogout()">Sair</button>`;
  applyPerfilRestrictions();
}

function openChangePassword(){
  showModal(`<div class="modal" style="max-width:360px">
    <h3>Alterar senha</h3>
    <div style="font-size:12px;color:var(--text2);margin-bottom:14px">Usuário: <strong>${esc(currentUser?.name||'')}</strong></div>
    <div id="cp-error" style="display:none;background:#FCEBEB;color:#A32D2D;border:0.5px solid #F09595;border-radius:var(--r-md);padding:9px 12px;font-size:12px;margin-bottom:10px"></div>
    <div class="fr"><label>Senha atual</label><input type="password" id="cp-old" placeholder="••••••••"/></div>
    <div class="fr"><label>Nova senha</label><input type="password" id="cp-new" placeholder="Mínimo 6 caracteres"/></div>
    <div class="fr"><label>Confirmar nova senha</label><input type="password" id="cp-confirm" placeholder="Repita a nova senha"/></div>
    <div class="ma">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-blue" onclick="saveChangePassword()">Salvar senha</button>
    </div>
  </div>`);
}

async function saveChangePassword(){
  const oldPwd=$('cp-old').value;
  const newPwd=$('cp-new').value.trim();
  const confirm=$('cp-confirm').value.trim();
  const errDiv=$('cp-error');
  errDiv.style.display='none';

  if(!oldPwd||!newPwd||!confirm){
    errDiv.textContent='Preencha todos os campos.';errDiv.style.display='block';return;
  }
  if(newPwd.length<6){
    errDiv.textContent='A nova senha deve ter pelo menos 6 caracteres.';errDiv.style.display='block';return;
  }
  if(newPwd!==confirm){
    errDiv.textContent='A nova senha e a confirmação não coincidem.';errDiv.style.display='block';return;
  }

  try{
    const res=await fetch('/api/change-password',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({oldPassword:oldPwd,newPassword:newPwd})
    });
    const data=await res.json();
    if(!res.ok){errDiv.textContent=data.error||'Erro ao alterar senha.';errDiv.style.display='block';return;}
    closeModal();
    showToast('Senha alterada com sucesso!','success');
  }catch(e){
    errDiv.textContent='Erro de conexão.';errDiv.style.display='block';
  }
}

function applyPerfilRestrictions(){
  if(!currentUser)return;
  const isAdmin=currentUser.perfil==='admin';
  // Usuários — gestão de acessos permanece exclusiva do admin
  const niUsers=$('ni-users');if(niUsers)niUsers.style.display=isAdmin?'flex':'none';
  const niAudit=$('ni-audit');if(niAudit)niAudit.style.display=isAdmin?'flex':'none';
  const niMetas=$('ni-metas');if(niMetas)niMetas.style.display=isAdmin?'flex':'none';
  const btnNU=$('btn-new-user');if(btnNU)btnNU.style.display=isAdmin?'':'none';
  const arU=$('add-row-user');if(arU)arU.style.display=isAdmin?'':'none';
  // Responsável: oculta exclusões e criação de projetos (classe .admin-only no CSS)
  document.body.classList.toggle('perfil-responsavel', !isAdmin);
}

// Verifica se o usuário atual pode excluir — Responsável nunca pode
function canDelete(msg='Apenas Administradores podem excluir informações.'){
  if(currentUser?.perfil==='responsavel'){
    showToast(msg,'error');
    return false;
  }
  return true;
}

async function doLogout(){
  await fetch('/api/logout-local',{method:'POST'}).catch(()=>{});
  currentUser=null;
  location.reload();
}

// ── Load ───────────────────────────────────────────────────
async function loadAll() {
  [projects, clients, products, owners, sellers, templates, users, ausencias] = await Promise.all([
    api('GET','/projects'), api('GET','/clients'), api('GET','/products'),
    api('GET','/owners'),   api('GET','/sellers'), api('GET','/templates'),
    api('GET','/users'),    api('GET','/ausencias')
  ]);
  if (projects.length) {
    activeProj = activeProj || projects[0].id;
    tasks = await api('GET', '/tasks?projId=' + activeProj);
  }
  // Responsável só vê suas tarefas
  // Todos os perfis visualizam todas as tarefas
  renderAll();
}

function renderAll() {
  renderProjNav(); renderProjGrid(); renderBoard();
  renderClientsTable(); renderProductsTable(); renderOwnersTable();
  renderSellersTable(); renderTemplates(); renderNotifs(); renderUsersTable(); renderAusenciasTable(); updateSelects();
}

// ── Selects dinâmicos ──────────────────────────────────────
function updateSelects() {
  // Filtro de owner no board
  const fo = $('fil-owner');
  if (fo) { const v=fo.value; fo.innerHTML='<option value="">Todos</option>'+owners.map(o=>`<option value="${o.id}"${o.id===v?' selected':''}>${esc(o.name)}</option>`).join(''); fo.value=v; }

  // Selects calendário
  const cfo=$('cal-fil-owner');
  if(cfo){const v=cfo.value;cfo.innerHTML='<option value="">Todos responsáveis</option>'+owners.map(o=>`<option value="${o.id}"${o.id===v?' selected':''}>${esc(o.name)}</option>`).join('');cfo.value=v;}
  // Autocomplete do calendário — cliente e projeto (digita e filtra)
  const dlc=$('dl-clients');
  if(dlc){
    dlc.innerHTML=clients.slice()
      .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))
      .map(c=>`<option value="${esc(c.name)}"></option>`).join('');
  }
  const dlp=$('dl-projs');
  if(dlp){
    dlp.innerHTML=projects.slice()
      .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))
      .map(p=>`<option value="${esc(p.name)}"></option>`).join('');
  }

  // Selects em modais
  ['f-owner'].forEach(id => {
    const s=$(id); if(!s)return;
    const v=s.value;
    s.innerHTML='<option value="">— selecione —</option>'+owners.map(o=>`<option value="${o.id}"${o.id===v?' selected':''}>${esc(o.name)}</option>`).join('');
    s.value=v;
  });
  ['f-client','fil-client'].forEach(id => {
    const s=$(id); if(!s)return;
    const v=s.value;
    s.innerHTML=(id==='fil-client'?'<option value="">Todos clientes</option>':'<option value="">— nenhum —</option>')+clients.map(c=>`<option value="${c.id}"${c.id===v?' selected':''}>${esc(c.name)}</option>`).join('');
    s.value=v;
  });
  ['f-product','c-product'].forEach(id => {
    const s=$(id); if(!s)return;
    const v=s.value;
    s.innerHTML='<option value="">— selecione —</option>'+products.filter(p=>p.active).map(p=>`<option value="${p.id}"${p.id===v?' selected':''}>${esc(p.name)}</option>`).join('');
    s.value=v;
  });
  ['f-seller','c-seller'].forEach(id => {
    const s=$(id); if(!s)return;
    const v=s.value;
    s.innerHTML='<option value="">— selecione —</option>'+sellers.filter(s=>s.active).map(s=>`<option value="${s.id}"${s.id===v?' selected':''}>${esc(s.name)}</option>`).join('');
    s.value=v;
  });
  const fp=$('f-proj');
  if(fp){const v=fp.value;fp.innerHTML=projects.map(p=>`<option value="${p.id}"${p.id===(v||activeProj)?' selected':''}>${esc(p.name)}</option>`).join('');fp.value=v||activeProj;}
}

// ── Projects ───────────────────────────────────────────────
function renderProjNav() {
  const search=($('sidebar-proj-search')?.value||'').toLowerCase();
  const filtered=projects.filter(p=>!search||p.name.toLowerCase().includes(search));
  $('proj-nav-list').innerHTML = filtered.map(p =>
    `<div class="ni${p.id===activeProj?' act':''}" onclick="setProj('${p.id}')" style="padding-right:8px">
      <div style="width:7px;height:7px;border-radius:2px;background:${p.color};flex-shrink:0"></div>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</span>
    </div>`).join('');
}

function renderProjGrid() {
  const el=$('proj-grid'); if(!el)return;
  const search=($('proj-search')?.value||'').toLowerCase();
  const fStatus=$('proj-filter-status')?.value||'';
  // Ajuste 7: ordenar por data início
  const filtered=projects
    .filter(p=>!search||p.name.toLowerCase().includes(search))
    .filter(p=>!fStatus||(p.status||'ativo')===fStatus)
    .slice().sort((a,b)=>{
      if(!a.dateStart&&!b.dateStart)return 0;
      if(!a.dateStart)return 1;
      if(!b.dateStart)return -1;
      return a.dateStart.localeCompare(b.dateStart);
    });
  el.innerHTML = filtered.map(p => {
    const pt = tasks.filter(t=>t.projId===p.id);
    const dn = pt.filter(t=>t.status==='done').length;
    const applicable = pt.filter(t=>t.status!=='na'&&t.status!=='cancel').length;
    const pct = applicable ? Math.round(dn/applicable*100) : 0;
    const cli = clientById(p.clientId);
    const prod= productById(p.productId);
    const hasDesc=p.desc&&p.desc.trim().length>0;
    const st = PROJ_STATUS[p.status||'ativo'] || PROJ_STATUS.ativo;
    const tp = PROJ_TIPO[p.tipo||'implantacao'] || PROJ_TIPO.implantacao;
    const naoAtivo = (p.status||'ativo')!=='ativo';
    return `<div class="proj-card${p.id===activeProj?' active-proj':''}" onclick="setProj('${p.id}');goPage('board')" style="${p.status==='cancelado'?'opacity:.65':''}">
      <div style="display:flex;align-items:center;gap:5px;margin-bottom:9px;flex-wrap:wrap;min-width:0">
        <div style="width:10px;height:10px;border-radius:3px;background:${p.color};flex-shrink:0"></div>
        ${p.dateStart?`<span style="font-size:10px;color:var(--text3);white-space:nowrap">📅 ${fd(p.dateStart)}</span>`:''}
        <span class="pill ${tp.c}" style="font-size:9px;max-width:100%;overflow:hidden;text-overflow:ellipsis">${tp.l}</span>
        ${naoAtivo?`<span class="pill ${st.c}" style="font-size:9px;max-width:100%;overflow:hidden;text-overflow:ellipsis">${st.l}</span>`:''}
      </div>
      <div style="font-size:13px;font-weight:500;margin-bottom:3px;${p.status==='cancelado'?'text-decoration:line-through':''}">${esc(p.name)}</div>
      ${cli.name?`<div style="font-size:11px;color:var(--text2);margin-bottom:1px">${esc(cli.name)}</div>`:''}
      ${prod.name?`<div style="font-size:10px;color:var(--text3)">${esc(prod.name)}</div>`:''}
      <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
        <div style="font-size:11px;color:var(--text2);flex:1">${pt.length} tarefas · ${pct}% concluído${p.qtdAgendas?` · 📅 ${p.qtdAgendas} agendas`:''}</div>
        ${hasDesc?`<button onclick="event.stopPropagation();showProjDesc('${p.id}')" title="Ver descrição"
          style="background:none;border:none;cursor:pointer;padding:2px;color:var(--text3);display:flex;align-items:center">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3">
            <circle cx="7" cy="7" r="5.5"/>
            <line x1="7" y1="6" x2="7" y2="10"/>
            <circle cx="7" cy="4.5" r=".6" fill="currentColor"/>
          </svg>
        </button>`:''}
      </div>
      <div style="height:3px;background:var(--bg);border-radius:2px;margin-top:5px;overflow:hidden">
        <div style="height:100%;background:${p.color};width:${pct}%;border-radius:2px"></div>
      </div>
      <div style="display:flex;gap:5px;margin-top:9px">
        <button class="btn btn-sm" style="flex:1" onclick="event.stopPropagation();editProj('${p.id}')">Editar</button>
        <button class="btn btn-red btn-sm" onclick="event.stopPropagation();deleteProj('${p.id}')">×</button>
      </div>
    </div>`;
  }).join('') +
  `<div class="proj-card new-card" onclick="openProjModal()">
    <div style="font-size:26px;color:var(--text3)">+</div>
    <div style="font-size:12px;color:var(--text3);margin-top:4px">Novo projeto</div>
  </div>`;
}

// Ajuste 2 - Exibir descrição do projeto em mini modal
function showProjDesc(id){
  const p=projects.find(x=>x.id===id);if(!p||!p.desc)return;
  const cli=clientById(p.clientId);
  showModal(`<div class="modal" style="max-width:420px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <div style="width:10px;height:10px;border-radius:3px;background:${p.color};flex-shrink:0"></div>
      <h3 style="margin:0">${esc(p.name)}</h3>
    </div>
    ${cli.name?`<div style="font-size:11px;color:var(--text2);margin-bottom:10px">${esc(cli.name)}</div>`:''}
    <div style="background:var(--surface2);border:0.5px solid var(--border);border-radius:var(--r-md);padding:12px;font-size:13px;line-height:1.6;color:var(--text);white-space:pre-wrap">${esc(p.desc)}</div>
    <div class="ma"><button class="btn btn-blue" onclick="closeModal()">Fechar</button></div>
  </div>`);
}

async function setProj(id) {
  activeProj = id;
  const p = projects.find(x=>x.id===id);
  if(p){
    // Ajuste 1: ícone ⓘ ao lado do nome no cabeçalho do Quadro
    const hasDesc=p.desc&&p.desc.trim().length>0;
    $('board-lbl').innerHTML=`${esc(p.name)}${hasDesc
      ?` <button onclick="showProjDesc('${p.id}')" title="Ver descrição do projeto"
          style="background:none;border:none;cursor:pointer;padding:2px 4px;color:var(--text3);vertical-align:middle;display:inline-flex;align-items:center">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.4">
            <circle cx="7.5" cy="7.5" r="6"/>
            <line x1="7.5" y1="6.5" x2="7.5" y2="11"/>
            <circle cx="7.5" cy="4.8" r=".7" fill="currentColor"/>
          </svg>
        </button>`
      :''}`;
    $('breadcrumb').textContent='/ '+p.name;
  }
  tasks = await api('GET','/tasks?projId='+id);
  renderAll();
}

function filteredTasks() {
  const fo=$('fil-owner')?.value||'', fs=$('fil-status')?.value||'', fg=$('fil-group')?.value||'';
  return tasks.filter(t=>
    t.projId===activeProj&&
    (!fo||t.ownerId===fo)&&
    (!fs||t.status===fs)&&
    (fg===''||t.group===+fg)
  );
}

function renderBoard() {
  const ft=filteredTasks();
  const dn=ft.filter(t=>t.status==='done').length;
  const applicable=ft.filter(t=>t.status!=='na'&&t.status!=='cancel').length;
  const pct=applicable?Math.round(dn/applicable*100):0;
  $('s-tot').textContent=ft.length;
  $('s-dn').textContent=dn;
  $('s-pr').textContent=ft.filter(t=>t.status==='progress').length;
  $('s-pe').textContent=ft.filter(t=>t.status==='pending').length;
  $('s-ca').textContent=ft.filter(t=>t.status==='cancel').length;
  $('s-pct').textContent=pct+'%';
  $('s-bar').style.width=pct+'%';

  const cont=$('groups-cont'); cont.innerHTML='';
  GROUPS.forEach((g,gi)=>{
    const gt=ft.filter(t=>t.group===gi);
    const d=document.createElement('div');d.className='group';d.id='group-'+gi;
    d.innerHTML=`
      <div class="ghdr" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'">
        <div class="gdot" style="background:${g.color}"></div>
        <div class="gname">${g.name}</div><div class="gcnt">${gt.length}</div>
      </div>
      <div><div class="tw"><table style="table-layout:auto">
        <thead><tr>
          <th style="width:26px"></th>
          <th>Tarefa</th>
          <th style="white-space:nowrap">Status</th>
          <th style="white-space:nowrap">Responsável</th>
          <th style="white-space:nowrap">Prior.</th>
          <th style="white-space:nowrap">Turno</th>
          <th style="white-space:nowrap">Período</th>
          <th style="width:28px"></th>
        </tr></thead>
        <tbody>${gt.map(t=>{
          const o=ownerById(t.ownerId);
          const turnoIcon=t.turno==='tarde'?'🌙 Tarde':'☀️ Manhã';
          const turnoColor=t.turno==='tarde'?'background:#E6F1FB;color:#0C447C':'background:#FAEEDA;color:#854F0B';
          return `<tr onclick="openEditTask('${t.id}')" style="${t.status==='na'||t.status==='cancel'?'opacity:.65':''}">
            <td style="width:26px"><div style="width:13px;height:13px;border-radius:3px;border:1.5px solid ${t.status==='done'?'#3B6D11':'#ccc'};display:inline-flex;align-items:center;justify-content:center;cursor:pointer;background:${t.status==='done'?'#3B6D11':'transparent'}" onclick="toggleDone(event,'${t.id}')">
              ${t.status==='done'?'<svg width="9" height="9" viewBox="0 0 9 9"><polyline points="1,4.5 3.5,7 8,1.5" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>':''}
            </div></td>
            <td style="min-width:140px;${t.status==='done'?'text-decoration:line-through;color:var(--text3)':''}">${esc(t.name)}</td>
            <td style="white-space:nowrap"><span class="pill ${SM[t.status].c}">${SM[t.status].l}</span></td>
            <td style="white-space:nowrap"><div style="display:flex;align-items:center;gap:5px">${ownerAvatar(o)}<span style="font-size:12px">${esc(o.name||'—')}</span></div></td>
            <td style="white-space:nowrap"><span class="pill ${PM[t.priority].c}">${PM[t.priority].l}</span></td>
            <td style="white-space:nowrap"><span style="font-size:10px;padding:2px 6px;border-radius:8px;font-weight:500;${turnoColor}">${turnoIcon}</span></td>
            <td class="dc${isOv(t.dateEnd||t.date,t.status)||isOv(t.date,t.status)?' ov':''}" style="white-space:nowrap">
              ${t.dateStart&&t.dateEnd
                ?`<span style="font-size:10px">${fd(t.dateStart)}</span><span style="color:var(--text3);margin:0 2px">→</span><span style="font-size:10px">${fd(t.dateEnd)}</span>`
                :fd(t.dateStart||t.dateEnd||t.date)}
            </td>
            <td style="width:28px"><button class="btn btn-red btn-sm" onclick="deleteTask(event,'${t.id}')">×</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
      <div class="add-row" onclick="openTaskModal(${gi})">+ Adicionar tarefa</div>
      </div>`;
    cont.appendChild(d);
  });
  renderKanban(ft);
  // Atualiza feed de comentários se a aba estiver ativa
  if($('view-cmt')?.style.display!=='none') renderComentarios();
}

function renderKanban(ft) {
  ft=ft||filteredTasks();
  const cols={done:[],progress:[],pending:[],na:[],cancel:[]};
  ft.forEach(t=>cols[t.status].push(t));
  const kconf={
    done:    {tc:'color:#3B6D11',bg:'background:#EAF3DE;color:#27500A'},
    progress:{tc:'color:#185FA5',bg:'background:#E6F1FB;color:#0C447C'},
    pending: {tc:'color:#854F0B',bg:'background:#FAEEDA;color:#854F0B'},
    na:      {tc:'',             bg:'background:#D3D1C7;color:#444441'},
    cancel:  {tc:'color:#A32D2D',bg:'background:#FCEBEB;color:#A32D2D'}
  };
  const board=$('kboard');board.innerHTML='';
  Object.keys(cols).forEach(s=>{
    const k=kconf[s];
    const col=document.createElement('div');col.className='kcol';
    col.innerHTML=`<div class="kct"><span style="${k.tc}">${SM[s].l}</span><span style="padding:1px 5px;border-radius:7px;font-size:10px;${k.bg}">${cols[s].length}</span></div>`;
    cols[s].forEach(t=>{
      const g=GROUPS[t.group]||GROUPS[0];
      const o=ownerById(t.ownerId);
      const card=document.createElement('div');card.className='kcard';
      if(t.status==='na'||t.status==='cancel')card.style.opacity='.65';
      card.innerHTML=`<div style="font-size:12px;margin-bottom:6px;${t.status==='done'?'text-decoration:line-through;color:var(--text3)':''}">${esc(t.name)}</div>
        <div style="margin-bottom:5px"><span class="group-badge" style="background:${g.bg};color:${g.text}">${g.name}</span></div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:5px">
          <span class="pill ${PM[t.priority].c}" style="font-size:10px">${PM[t.priority].l}</span>
          ${ownerAvatar(o)}
        </div>`;
      card.onclick=()=>openEditTask(t.id);
      col.appendChild(card);
    });
    board.appendChild(col);
  });
}

// ── Modal system ───────────────────────────────────────────
function showModal(html){
  $('modal-area').innerHTML=`<div class="modal-wrap open" id="active-modal">${html}</div>`;
  // Fecha modal apenas se clicar no fundo SEM ter arrastado (seleção de texto)
  const wrap=$('active-modal');
  let mouseDownTarget=null;
  wrap.addEventListener('mousedown',e=>{ mouseDownTarget=e.target; });
  wrap.addEventListener('click',e=>{
    if(e.target.id==='active-modal' && mouseDownTarget?.id==='active-modal') closeModal();
  });
  // Sempre abre o modal com scroll no topo
  wrap.scrollTop=0;
  const modalEl=wrap.querySelector('.modal');
  if(modalEl) modalEl.scrollTop=0;
  updateSelects();
}
function closeModal(){$('modal-area').innerHTML='';pendingMeet=null;}

// ── Task modal ─────────────────────────────────────────────
function taskHTML(t) {
  const isEdit=!!t;
  const gOpts=GROUPS.map((g,i)=>`<option value="${i}"${t&&t.group===i?' selected':''}>${g.name}</option>`).join('');
  const sOpts=Object.keys(SM).map(k=>`<option value="${k}"${(t?.status||'pending')===k?' selected':''}>${SM[k].l}</option>`).join('');
  const pOpts=Object.keys(PM).map(k=>`<option value="${k}"${(t?.priority||'medium')===k?' selected':''}>${PM[k].l}</option>`).join('');
  return `<div class="modal" style="max-height:92vh;overflow-y:auto">
    <h3>${isEdit?'Editar tarefa':'Nova tarefa'}</h3>
    <div class="fr"><label>Nome da tarefa</label><input id="f-name" value="${esc(t?.name||'')}" placeholder="Ex: Treinamento folha"/></div>
    <div class="f2">
      <div class="fr"><label>Projeto</label><select id="f-proj"></select></div>
      <div class="fr"><label>Grupo</label><select id="f-group">${gOpts}</select></div>
    </div>
    <div class="f2">
      <div class="fr"><label>Status</label><select id="f-status">${sOpts}</select></div>
      <div class="fr"><label>Prioridade</label><select id="f-priority">${pOpts}</select></div>
    </div>
    <div id="f-periodo-aviso" style="display:none"></div>
    <div class="f2">
      <div class="fr"><label>Responsável</label><select id="f-owner"></select></div>
      <div class="fr"><label>Prazo</label><input type="date" id="f-date" value="${t?.date||''}"/></div>
    </div>
    <div class="f2">
      <div class="fr"><label>Data início</label><input type="date" id="f-date-start" value="${t?.dateStart||''}" onchange="aplicarAvisoPeriodoForm()"/></div>
      <div class="fr"><label>Data fim</label><input type="date" id="f-date-end" value="${t?.dateEnd||''}" onchange="aplicarAvisoPeriodoForm()"/></div>
    </div>
    <div class="f2">
      <div class="fr"><label>Turno</label>
        <div style="display:flex;gap:8px;margin-top:4px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;font-weight:400;padding:6px 14px;border-radius:var(--r-md);border:0.5px solid var(--border2);flex:1;justify-content:center;background:${(t?.turno||'manha')==='manha'?'#FAEEDA':'var(--surface)'};color:${(t?.turno||'manha')==='manha'?'#854F0B':'var(--text2)'};" id="lbl-manha">
            <input type="radio" name="f-turno" id="f-turno-manha" value="manha" ${(t?.turno||'manha')==='manha'?'checked':''} style="display:none" onchange="highlightTurno()"/>
            ☀️ Manhã
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;font-weight:400;padding:6px 14px;border-radius:var(--r-md);border:0.5px solid var(--border2);flex:1;justify-content:center;background:${t?.turno==='tarde'?'#E6F1FB':'var(--surface)'};color:${t?.turno==='tarde'?'#0C447C':'var(--text2)'};" id="lbl-tarde">
            <input type="radio" name="f-turno" id="f-turno-tarde" value="tarde" ${t?.turno==='tarde'?'checked':''} style="display:none" onchange="highlightTurno()"/>
            🌙 Tarde
          </label>
        </div>
      </div>
      <div class="fr"><label>Descrição / Observação</label><textarea id="f-desc" style="min-height:42px">${esc(t?.desc||'')}</textarea></div>
    </div>
    <div class="meet-section">
      <div class="meet-sec-title">Google Meet</div>
      <div id="meet-attached" style="display:${t?.meet?'block':'none'}">
        <div class="meet-attached-box">
          <div style="width:32px;height:32px;border-radius:var(--r-md);background:#E6F1FB;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="8" height="10" rx="1.5" fill="#E6F1FB" stroke="#185FA5" stroke-width="1.1"/><path d="M9 5l4-2.5v9L9 9" stroke="#185FA5" stroke-width="1.1" stroke-linejoin="round"/></svg>
          </div>
          <div style="flex:1;min-width:0">
            <div id="ma-title" style="font-size:12px;font-weight:500;margin-bottom:2px">${esc(t?.meet?.title||'')}</div>
            <div id="ma-url" style="font-size:11px;color:#185FA5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t?.meet?.meetUrl||'')}</div>
            <div style="display:flex;gap:6px;margin-top:7px">
              <button class="copy-btn" onclick="copyText(document.getElementById('ma-url').textContent,this)">Copiar link</button>
              <a id="ma-open" href="${t?.meet?.meetUrl||'#'}" target="_blank" class="btn btn-sm" style="background:#E6F1FB;color:#0C447C;border-color:#85B7EB;font-size:11px">Abrir Meet</a>
              <button class="btn btn-red btn-sm" onclick="removeMeetModal()">Remover</button>
            </div>
          </div>
        </div>
      </div>
      <div id="meet-create-area" style="display:${t?.meet?'none':'block'}">
        ${googleUser ? `
        <div class="meet-form-box">
          <div style="font-size:11px;font-weight:500;margin-bottom:9px">Criar link Google Meet real</div>
          <div class="f2">
            <div class="fr"><label>Título da reunião</label><input id="meet-title" placeholder="Ex: Treinamento" value="${esc(t?.name||'')}"/></div>
            <div class="fr"><label>Duração</label><select id="meet-dur">
              <option value="15">15 min</option><option value="30">30 min</option>
              <option value="60" selected>1 hora</option><option value="90">1h30</option><option value="120">2 horas</option>
              <option value="180">3 horas</option>
            </select></div>
          </div>
          <div class="f2">
            <div class="fr"><label>Data</label><input type="date" id="meet-date" value="${t?.date||today}"/></div>
            <div class="fr"><label>Horário</label><input type="time" id="meet-time" value="09:00"/></div>
          </div>
          <div class="fr"><label>Participantes (e-mails separados por vírgula)</label><input id="meet-parts" placeholder="email@empresa.com, ..."/></div>
          <button class="btn btn-blue" style="width:100%;margin-top:4px;justify-content:center" onclick="createMeetFromTask()">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><rect x=".5" y="1.5" width="7.5" height="9" rx="1.2"/><path d="M8 4l3.5-2v8L8 8"/></svg>
            Criar reunião na minha conta Google
          </button>
          <div id="meet-creating" style="display:none;text-align:center;padding:10px 0;color:var(--text2);font-size:12px">Criando reunião...</div>
          <div id="meet-gen-result" style="display:none;margin-top:9px">
            <div style="font-size:11px;color:var(--text2);margin-bottom:5px">Reunião criada! Cole o link abaixo:</div>
            <div style="display:flex;gap:7px;align-items:center">
              <input id="meet-gen-url" readonly style="flex:1;padding:6px 8px;border:0.5px solid var(--border2);border-radius:var(--r-md);font-size:11px;font-family:monospace;background:var(--surface);color:var(--text)"/>
              <button class="copy-btn" onclick="copyText(document.getElementById('meet-gen-url').value,this)">Copiar</button>
            </div>
            <button class="btn btn-green" style="width:100%;margin-top:7px;justify-content:center" onclick="attachGeneratedMeet()">Vincular à tarefa</button>
          </div>
        </div>` : `
        <div style="background:#FAEEDA;border:0.5px solid #EF9F27;border-radius:var(--r-md);padding:11px;font-size:12px;color:#854F0B;display:flex;align-items:center;gap:8px">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="6.5" cy="6.5" r="5"/><line x1="6.5" y1="4" x2="6.5" y2="7"/><circle cx="6.5" cy="9" r=".5" fill="currentColor"/></svg>
          Conecte sua conta Google para criar reuniões reais.
          <a href="/auth/google" class="btn btn-sm" style="background:#fff;border-color:#EF9F27">Conectar</a>
        </div>`}
      </div>
    </div>
    ${isEdit?`<div class="cmt-section">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text2);margin-bottom:7px">Comentários</div>
      <div id="cmt-list">${(t.comments||[]).map(c=>{
        const ao=ownerById(c.authorId);
        const mo=c.mentionId?ownerById(c.mentionId):null;
        const canEdit=currentUser?.perfil==='admin'||c.authorId===currentUser?.ownerId||c.author===currentUser?.name;
        return `<div class="cmt-item" id="cmt-${c.id}">
          <div class="cmt-body">
            <div class="cmt-meta" style="display:flex;align-items:center;gap:6px">
              <span style="font-weight:500;color:var(--text)">${esc(c.author||ao.name||'?')}</span>
              <span style="color:var(--text3)">·</span>
              <span style="color:var(--text3)">${esc(c.time)}</span>
              ${mo?`<span style="background:#E6F1FB;color:#0C447C;padding:1px 6px;border-radius:6px;font-size:10px">@ ${esc(mo.name)}</span>`:''}
              ${canEdit?`<span style="margin-left:auto;display:flex;gap:4px">
                <button class="btn btn-sm" style="padding:1px 6px;font-size:10px" onclick="editComment('${c.id}')">✏️</button>
                <button class="btn btn-red btn-sm" style="padding:1px 6px;font-size:10px" onclick="deleteComment('${c.id}')">×</button>
              </span>`:''}
            </div>
            <div class="cmt-text" style="white-space:pre-wrap" id="cmt-text-${c.id}">${escNl(c.text)}</div>
          </div>
        </div>`;
      }).join('')||'<p style="font-size:11px;color:var(--text3);margin-bottom:7px">Nenhum comentário ainda.</p>'}</div>
      <div style="margin-bottom:6px">
        <label style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.04em">Mencionar responsável (opcional)</label>
        <select id="cmt-mention" style="width:100%;margin-top:3px;padding:5px 8px;border:0.5px solid var(--border2);border-radius:var(--r-md);background:var(--surface);color:var(--text);font-size:12px">
          <option value="">— nenhum —</option>
          ${owners.map(o=>`<option value="${o.id}">${esc(o.name)}</option>`).join('')}
        </select>
      </div>
      <div class="cir"><textarea id="new-cmt" placeholder="Escrever comentário..." onkeydown="if(event.key==='Enter'&&event.ctrlKey){event.preventDefault();submitComment();}"></textarea>
      <button class="btn btn-blue" onclick="submitComment()" style="height:44px;flex-shrink:0" title="Enviar (Ctrl+Enter)">Enviar</button></div>
    </div>`:''}
    <div class="ma">
      ${t?`<button class="btn btn-purple" onclick="duplicateTask()" style="margin-right:auto" title="Cria uma cópia desta tarefa para outra data">⧉ Duplicar</button>`:''}
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-blue" onclick="saveTask()">Salvar tarefa</button>
    </div>
  </div>`;
}
function openTaskModal(gi=0){editingTask=null;showModal(taskHTML(null));$('f-group').value=gi;aplicarAvisoPeriodoForm();}

// Duplica a tarefa aberta — mantém os dados e limpa as datas para o novo dia
function duplicateTask(){
  if(!editingTask)return;
  // Sai do modo edição: o próximo "Salvar" cria um registro novo
  editingTask=null;
  pendingMeet=null; // a cópia não herda a reunião do Meet original
  // Mantém todos os campos preenchidos, apenas zera as datas
  ['f-date-start','f-date-end','f-date'].forEach(id=>{const el=$(id);if(el)el.value='';});
  // Ajusta o título e o rodapé do modal para refletir a cópia
  const h3=document.querySelector('#modal-area h3');
  if(h3)h3.textContent='Duplicar tarefa';
  const btnDup=document.querySelector('.btn-purple[onclick="duplicateTask()"]');
  if(btnDup)btnDup.remove();
  // Remove a seção de comentários (a cópia começa sem histórico)
  const cmt=document.querySelector('#modal-area .cmt-section');
  if(cmt)cmt.remove();
  showToast('⧉ Cópia criada — informe a nova data e salve','success');
  const ds=$('f-date-start');if(ds)ds.focus();
}
function openEditTask(id){
  const t=tasks.find(x=>x.id===id)||allCalTasks.find(x=>x.id===id);
  if(!t)return;
  // Ajuste 1: garantir que o projeto ativo seja o da tarefa antes de abrir
  if(t.projId && t.projId!==activeProj){
    activeProj=t.projId;
    // Recarrega tasks do projeto para ter contexto completo
    api('GET','/tasks?projId='+activeProj).then(ts=>{tasks=ts;});
  }
  editingTask=id;
  pendingMeet=t.meet?{...t.meet}:null;
  showModal(taskHTML(t));
  if($('f-owner'))$('f-owner').value=t.ownerId||'';
  aplicarAvisoPeriodo(t);
}

// Tarefas com período são contadas dia a dia — avisa o usuário e trava o Status para não-admin
// Versão chamada pelo onchange dos campos de data — lê valores atuais do form
function aplicarAvisoPeriodoForm(){
  const dateStart=$('f-date-start')?.value||'';
  const dateEnd=$('f-date-end')?.value||'';
  const taskId=editingTask||'';
  aplicarAvisoPeriodo({dateStart, dateEnd, id:taskId});
}

function aplicarAvisoPeriodo(t){
  const box=$('f-periodo-aviso');
  if(!box||!t)return;
  const temPeriodo=t.dateStart&&t.dateEnd&&t.dateStart!==t.dateEnd;
  if(!temPeriodo){box.style.display='none';return;}

  const ini=new Date(t.dateStart+'T00:00:00'), fim=new Date(t.dateEnd+'T00:00:00');
  const fer=getFeriadosAno(t.dateStart.slice(0,4));
  const uteis=[], feriadosDoPeriodo=[];

  for(let d=new Date(ini);d<=fim;d.setDate(d.getDate()+1)){
    const dow=d.getDay();
    const ds=d.toISOString().slice(0,10);
    if(dow===0||dow===6) continue;
    if(fer&&fer[ds]){ feriadosDoPeriodo.push({ds,nome:fer[ds]}); continue; }
    uteis.push(ds);
  }
  const feitos=uteis.filter(d=>getDailyStatus(t.id,d)==='done').length;
  const total=uteis.length;
  const completo=total>0&&feitos===total;

  // Calcular sugestão de nova data final mantendo o mesmo nº de dias úteis
  let sugestao='';
  if(feriadosDoPeriodo.length){
    let diasRestantes=feriadosDoPeriodo.length;
    let cursor=new Date(fim);
    while(diasRestantes>0){
      cursor.setDate(cursor.getDate()+1);
      const dow=cursor.getDay();
      const ds=cursor.toISOString().slice(0,10);
      if(dow===0||dow===6) continue;
      if(fer&&fer[ds]) continue; // outro feriado
      diasRestantes--;
    }
    sugestao=cursor.toLocaleDateString('pt-BR');
  }

  box.style.display='block';
  const avisoFeriados=feriadosDoPeriodo.length?`
    <div style="background:#FFF3CD;border:0.5px solid #EF9F27;color:#7A4A00;border-radius:var(--r-md);padding:9px 11px;font-size:11px;margin-bottom:8px">
      <div style="font-weight:600;margin-bottom:4px">⚠️ ${feriadosDoPeriodo.length} feriado${feriadosDoPeriodo.length>1?'s':''} no período:</div>
      <div style="margin-bottom:6px">${feriadosDoPeriodo.map(f=>`• ${new Date(f.ds+'T00:00:00').toLocaleDateString('pt-BR')} — ${esc(f.nome)}`).join('<br>')}</div>
      <div>O período tem <strong>${total} dia${total!==1?'s':''} útil${total!==1?'s':''}</strong> (feriados excluídos).
      ${sugestao?`Para manter ${total+feriadosDoPeriodo.length} dias úteis, a data final sugerida é <strong>${sugestao}</strong>.`:''}</div>
    </div>`:'' ;

  box.innerHTML=avisoFeriados+`
    <div style="background:${completo?'var(--green-bg)':'var(--blue-bg)'};border:0.5px solid ${completo?'#97C459':'#85B7EB'};
                color:${completo?'#27500A':'#0C447C'};border-radius:var(--r-md);padding:9px 11px;font-size:11px;margin-bottom:11px">
      <div style="font-weight:600;margin-bottom:3px">
        📅 Agenda de ${total} dia${total===1?'':'s'} útil${total===1?'':'s'} · ${feitos} de ${total} realizado${feitos===1?'':'s'}
      </div>
      <div style="line-height:1.4">
        ${completo
          ? 'Todos os dias foram marcados — o Status já foi atualizado para Concluído automaticamente.'
          : 'Marque cada dia no <strong>Calendário</strong> para contar nos relatórios. Alterar o Status aqui <strong>não</strong> conta as agendas.'}
      </div>
    </div>`;

  // Com período, o Status é controlado pelos dias — só admin altera manualmente
  const sel=$('f-status');
  if(sel&&currentUser?.perfil!=='admin'){
    sel.disabled=true;
    sel.style.opacity='.6';
    sel.style.cursor='not-allowed';
    sel.title='O Status é definido pelas agendas marcadas no calendário';
  }
}

async function submitComment(){
  if(!editingTask)return;
  const txt=$('new-cmt').value.trim();if(!txt)return;
  const mentionId=$('cmt-mention')?.value||'';

  // Usar o usuário logado como autor do comentário
  // Se o usuário logado tiver ownerId vinculado usa ele, senão usa o responsável da tarefa
  const authorOwnerId = currentUser?.ownerId || $('f-owner').value;
  const o = ownerById(authorOwnerId) || {};
  // Nome do autor: prefere o nome do usuário logado
  const authorName = currentUser?.name || o.name || '?';

  const c=await api('POST','/tasks/'+editingTask+'/comments',{
    author:authorName, authorId:authorOwnerId, text:txt, mentionId:mentionId||null
  });
  $('new-cmt').value='';
  if($('cmt-mention'))$('cmt-mention').value='';
  const mo=mentionId?ownerById(mentionId):null;
  $('cmt-list').insertAdjacentHTML('beforeend',`<div class="cmt-item">
    <div class="cmt-body">
      <div class="cmt-meta" style="display:flex;align-items:center;gap:6px">
        <span style="font-weight:500;color:var(--text)">${esc(authorName)}</span>
        <span style="color:var(--text3)">·</span>
        <span style="color:var(--text3)">${esc(c.time)}</span>
        ${mo?`<span style="background:#E6F1FB;color:#0C447C;padding:1px 6px;border-radius:6px;font-size:10px">@ ${esc(mo.name)}</span>`:''}
      </div>
      <div class="cmt-text" style="white-space:pre-wrap">${escNl(txt)}</div>
    </div>
  </div>`);
  // Notificação por email para responsável mencionado
  if(mentionId){
    const task=tasks.find(x=>x.id===editingTask)||allCalTasks.find(x=>x.id===editingTask)||{};
    const projNome=projects.find(p=>p.id===task.projId)?.name||'';
    await api('POST','/notify',{
      type:'comment_mention',
      toOwnerId:mentionId,
      fromName:authorName,
      taskName:task.name||'',
      projName:projNome,
      comment:txt
    });
  }
  tasks=await api('GET','/tasks?projId='+activeProj);
}

async function editComment(cmtId){
  if(!editingTask)return;
  const taskData=await api('GET','/tasks/'+editingTask);
  const cmt=taskData.comments?.find(c=>c.id===cmtId);
  if(!cmt)return;
  const novoTexto=prompt('Editar comentário:',cmt.text);
  if(novoTexto===null||novoTexto.trim()==='')return;
  const newComments=taskData.comments.map(c=>c.id===cmtId?{...c,text:novoTexto.trim()}:c);
  await api('PUT','/tasks/'+editingTask,{...taskData,comments:newComments});
  // Atualiza só o texto na tela
  const el=$('cmt-text-'+cmtId);
  if(el){el.innerHTML=escNl(novoTexto.trim());}
  tasks=await api('GET','/tasks?projId='+activeProj);
}

async function deleteComment(cmtId){
  if(!editingTask)return;
  if(!confirm('Excluir este comentário?'))return;
  const taskData=await api('GET','/tasks/'+editingTask);
  const newComments=(taskData.comments||[]).filter(c=>c.id!==cmtId);
  await api('PUT','/tasks/'+editingTask,{...taskData,comments:newComments});
  const el=$('cmt-'+cmtId);
  if(el)el.remove();
  tasks=await api('GET','/tasks?projId='+activeProj);
  showToast('Comentário excluído.','success');
}

let savingTask=false;
async function saveTask(){
  if(savingTask)return; // evita duplo clique
  savingTask=true;
  const btnSave=document.querySelector('.btn-blue[onclick="saveTask()"]');
  if(btnSave){btnSave.disabled=true;btnSave.textContent='Salvando...';}

  try{
  const name=$('f-name').value.trim();if(!name){savingTask=false;if(btnSave){btnSave.disabled=false;btnSave.textContent='Salvar tarefa';}return;}
  const meetData=pendingMeet?{...pendingMeet}:null;
  const dateStart=$('f-date-start').value||'';
  const dateEnd=$('f-date-end').value||'';
  const date=dateEnd||dateStart||$('f-date').value||'';
  const turno=document.querySelector('input[name="f-turno"]:checked')?.value||'manha';
  const newOwnerId=$('f-owner').value;
  const oldTask=editingTask?tasks.find(x=>x.id===editingTask)||allCalTasks.find(x=>x.id===editingTask):null;
  const isNew=!editingTask;
  const ownerChanged=oldTask&&oldTask.ownerId!==newOwnerId;

  // Usa comentários já carregados em memória — evita GET extra que causava lentidão
  const currentComments=oldTask?.comments||[];

  const body={name,projId:$('f-proj').value||activeProj,group:+$('f-group').value,
    status:$('f-status').value,ownerId:newOwnerId,priority:$('f-priority').value,
    date,dateStart,dateEnd,turno,desc:$('f-desc').value,meet:meetData,
    comments:currentComments};

  // Verifica se responsável está ausente no período da tarefa
  if(newOwnerId&&(dateStart||date)){
    const aus=checkAusencia(newOwnerId,dateStart||date,dateEnd||date);
    if(aus){
      const tipo=AUSENCIA_TIPOS[aus.tipo]||AUSENCIA_TIPOS.ferias;
      const o=ownerById(newOwnerId);
      showToast(`⚠️ ${o.name||'Responsável'} está em ${tipo.l} de ${fd(aus.dateStart)} a ${fd(aus.dateEnd)}!`,'error');
    }
  }

  if(editingTask){await api('PUT','/tasks/'+editingTask,body);}
  else{await api('POST','/tasks',body);}

  // Notificar responsável quando for nova tarefa ou quando trocar o responsável
  if(newOwnerId&&(isNew||ownerChanged)){
    const projNome=projects.find(p=>p.id===(body.projId||activeProj))?.name||'';
    const owner=ownerById(newOwnerId);
    console.log('[Notify Debug] newOwnerId='+newOwnerId+' owner='+JSON.stringify(owner));
    if(owner?.email){
      api('POST','/notify',{
  type:'task_assigned',
        toOwnerId:newOwnerId,
        fromName:currentUser?.name||'Sistema',
        taskName:name,
        projName:projNome,
        meetUrl:meetData?.meetUrl||''
      });
    }
  }

  tasks=await api('GET','/tasks?projId='+activeProj);
  closeModal();renderBoard();
  }finally{
    savingTask=false;
    if(btnSave){btnSave.disabled=false;btnSave.textContent='Salvar tarefa';}
  }
}

function highlightTurno(){
  const m=$('f-turno-manha')?.checked;
  const lm=$('lbl-manha'), lt=$('lbl-tarde');
  if(lm){lm.style.background=m?'#FAEEDA':'var(--surface)';lm.style.color=m?'#854F0B':'var(--text2)';lm.style.borderColor=m?'#EF9F27':'var(--border2)';}
  if(lt){lt.style.background=!m?'#E6F1FB':'var(--surface)';lt.style.color=!m?'#0C447C':'var(--text2)';lt.style.borderColor=!m?'#85B7EB':'var(--border2)';}
}

async function createMeetFromTask(){
  const title=$('meet-title').value.trim()||$('f-name').value.trim()||'Reunião TeamSolidez';
  const date=$('meet-date').value;
  const time=$('meet-time').value||'09:00';
  const dur=+$('meet-dur').value;
  const parts=$('meet-parts').value;
  const btn=document.querySelector('#meet-create-area .btn-blue');
  if(btn)btn.style.display='none';
  $('meet-creating').style.display='block';
  try{
    const data=await fetch('/meet/create',{method:'POST',
      headers:{'Content-Type':'application/json','X-CSRF-Token':getCsrfToken()},
      body:JSON.stringify({title,date,time,duration:dur,participants:parts})}).then(r=>r.json());
    $('meet-creating').style.display='none';
    if(data.error){showToast('Erro: '+data.error,'error');if(btn)btn.style.display='flex';return;}
    pendingMeet={meetUrl:data.meetUrl,eventId:data.eventId||'',title:data.title||title};
    $('meet-gen-url').value=data.meetUrl;
    $('meet-gen-result').style.display='block';
    showToast('Reunião criada!','success');
  }catch(e){$('meet-creating').style.display='none';if(btn)btn.style.display='flex';showToast('Erro ao criar reunião.','error');}
}

function attachGeneratedMeet(){
  if(!pendingMeet)return;
  $('ma-title').textContent=pendingMeet.title||'';
  $('ma-url').textContent=pendingMeet.meetUrl||'';
  if($('ma-open'))$('ma-open').href=pendingMeet.meetUrl||'#';
  $('meet-attached').style.display='block';
  $('meet-create-area').style.display='none';
}

function removeMeetModal(){
  pendingMeet=null;
  $('meet-attached').style.display='none';
  $('meet-create-area').style.display='block';
  if($('meet-gen-result'))$('meet-gen-result').style.display='none';
}

function copyText(text,btn){
  try{navigator.clipboard.writeText(text);}catch(e){}
  if(btn){const o=btn.textContent;btn.textContent='Copiado!';btn.classList.add('copied');setTimeout(()=>{btn.textContent=o;btn.classList.remove('copied');},1800);}
}

async function toggleDone(e,id){
  e.stopPropagation();
  const t=tasks.find(x=>x.id===id);if(!t)return;
  await api('PUT','/tasks/'+id,{...t,status:t.status==='done'?'pending':'done'});
  tasks=await api('GET','/tasks?projId='+activeProj);renderBoard();
}
async function deleteTask(e,id){
  e.stopPropagation();
  if(!canDelete())return;
  if(!confirm('Excluir tarefa?'))return;
  await api('DELETE','/tasks/'+id);tasks=tasks.filter(t=>t.id!==id);renderBoard();
}

// ── Project modal ──────────────────────────────────────────
function projHTML(p) {
  const tplOpts=templates.map(t=>`<option value="${t.id}"${p?.templateId===t.id?' selected':''}>${esc(t.name)}</option>`).join('');
  const colors=[['#185FA5','Azul'],['#3B6D11','Verde'],['#BA7517','Âmbar'],['#993556','Rosa'],['#534AB7','Roxo'],['#993C1D','Coral']];
  return `<div class="modal">
    <h3>${p?'Editar projeto':'Novo projeto'}</h3>
    <div class="fr"><label>Nome do projeto</label><input id="p-name" value="${esc(p?.name||'')}" placeholder="Ex: Implantação Acme Corp"/></div>
    <div class="f2">
      <div class="fr"><label>Cor</label><select id="p-color">${colors.map(([v,l])=>`<option value="${v}"${(p?.color||'#185FA5')===v?' selected':''}>${l}</option>`).join('')}</select></div>
      <div class="fr"><label>Cliente</label><select id="p-client"><option value="">— nenhum —</option>${clients.map(c=>`<option value="${c.id}"${p?.clientId===c.id?' selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
    </div>
    <div class="f2">
      <div class="fr"><label>Produto</label><select id="p-product"><option value="">— nenhum —</option>${products.map(pr=>`<option value="${pr.id}"${p?.productId===pr.id?' selected':''}>${esc(pr.name)}</option>`).join('')}</select></div>
      <div class="fr"><label>Vendedor</label><select id="p-seller"><option value="">— nenhum —</option>${sellers.map(s=>`<option value="${s.id}"${p?.sellerId===s.id?' selected':''}>${esc(s.name)}</option>`).join('')}</select></div>
    </div>
    <div class="f2">
      <div class="fr"><label>Data início</label><input type="date" id="p-date-start" value="${p?.dateStart||''}"/></div>
      <div class="fr"><label>Previsão de conclusão</label><input type="date" id="p-date-end" value="${p?.dateEnd||''}"/></div>
    </div>
    <div class="f2">
      <div class="fr"><label>Tipo do projeto</label>
        <select id="p-tipo">
          ${Object.entries(PROJ_TIPO).map(([k,v])=>`<option value="${k}"${(p?.tipo||'implantacao')===k?' selected':''}>${v.l}</option>`).join('')}
        </select>
      </div>
      <div class="fr"><label>Situação do projeto</label>
        <select id="p-status" onchange="toggleCancelReason()">
          ${Object.entries(PROJ_STATUS).map(([k,v])=>`<option value="${k}"${(p?.status||'ativo')===k?' selected':''}>${v.l}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="fr"><label>Qtd. Agendas Contratadas</label><input type="number" id="p-qtd-agendas" min="0" value="${p?.qtdAgendas||''}" placeholder="Ex: 12"/></div>
    <div class="fr" id="p-cancel-box" style="display:${p?.status==='cancelado'?'block':'none'}">
      <label>Motivo do cancelamento</label>
      <textarea id="p-cancel-reason" placeholder="Ex: Cliente desistiu da migração">${esc(p?.cancelReason||'')}</textarea>
      ${p?.cancelDate?`<div style="font-size:10px;color:var(--text2);margin-top:4px">Cancelado em ${fd(p.cancelDate)}</div>`:''}
    </div>
    <div class="fr"><label>Descrição</label><textarea id="p-desc">${esc(p?.desc||'')}</textarea></div>
    ${!p&&templates.length?`
    <div class="section-sep"></div>
    <div style="font-size:11px;font-weight:500;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">Modelo de tarefas</div>
    <div class="fr"><label>Usar modelo (opcional)</label>
      <select id="p-template"><option value="">— sem modelo —</option>${tplOpts}</select>
    </div>
    <div style="font-size:11px;color:var(--text2)">Se selecionado, todas as tarefas do modelo serão criadas automaticamente no projeto.</div>`:''}
    <div class="ma"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="saveProj()">Salvar projeto</button></div>
  </div>`;
}
// Mostra o campo de motivo apenas quando o projeto é cancelado
function toggleCancelReason(){
  const st=$('p-status')?.value;
  const box=$('p-cancel-box');
  if(box)box.style.display=st==='cancelado'?'block':'none';
}

function openProjModal(){editingProj=null;showModal(projHTML(null));}
function editProj(id){
  const p=projects.find(x=>x.id===id);if(!p)return;
  editingProj=id;showModal(projHTML(p));
  // Responsável edita o projeto, mas não troca cliente nem responsável principal
  if(currentUser?.perfil!=='admin'){
    ['p-client'].forEach(fid=>{
      const el=$(fid);if(!el)return;
      el.disabled=true;
      el.style.opacity='.6';
      el.style.cursor='not-allowed';
      el.title='Apenas Administradores podem alterar este campo';
    });
  }
}

async function saveProj(){
  const name=$('p-name').value.trim();if(!name)return;
  const body={name,color:$('p-color').value,clientId:$('p-client')?.value||null,
    productId:$('p-product')?.value||null,sellerId:$('p-seller')?.value||null,
    ownerId:(editingProj?projects.find(x=>x.id===editingProj)?.ownerId:null)||null,desc:$('p-desc')?.value||'',
    dateStart:$('p-date-start')?.value||'',dateEnd:$('p-date-end')?.value||'',
    qtdAgendas:+$('p-qtd-agendas')?.value||0,
    status:$('p-status')?.value||'ativo',
    tipo:$('p-tipo')?.value||'implantacao',
    cancelReason:$('p-cancel-reason')?.value||''};
  // Cancelamento exige justificativa
  if(body.status==='cancelado'&&!body.cancelReason.trim()){
    showToast('Informe o motivo do cancelamento','error');
    $('p-cancel-reason')?.focus();
    return;
  }
  const tplId=$('p-template')?.value||'';
  if(editingProj){
    await api('PUT','/projects/'+editingProj,body);
  } else {
    if(tplId){
      const res=await api('POST','/projects/from-template',{templateId:tplId,projectData:body});
      activeProj=res.project.id;
      showToast(`Projeto criado com ${res.tasksCreated} tarefas do modelo!`,'success');
    } else {
      const p=await api('POST','/projects',body);activeProj=p.id;
    }
  }
  projects=await api('GET','/projects');
  tasks=await api('GET','/tasks?projId='+activeProj);
  closeModal();renderAll();
}
async function deleteProj(id){
  if(!canDelete())return;
  const proj=projects.find(p=>p.id===id);
  // Busca quantas tarefas serão apagadas junto
  let qtd=0;
  try{ const ts=await api('GET','/tasks?projId='+id); qtd=Array.isArray(ts)?ts.length:0; }catch(e){}
  const aviso=qtd
    ? `Excluir o projeto "${proj?.name||''}"?\n\n⚠️ Isso apagará permanentemente ${qtd} tarefa(s) vinculada(s) e seus históricos.\n\nEsta ação não pode ser desfeita.`
    : `Excluir o projeto "${proj?.name||''}"?`;
  if(!confirm(aviso))return;
  await api('DELETE','/projects/'+id);
  projects=projects.filter(p=>p.id!==id);
  if(activeProj===id&&projects.length)activeProj=projects[0].id;
  tasks=activeProj?await api('GET','/tasks?projId='+activeProj):[];
  renderAll();
}

// ── Templates ──────────────────────────────────────────────
function renderTemplates(){
  const el=$('templates-list');if(!el)return;
  if(!templates.length){el.innerHTML='<div style="text-align:center;color:var(--text2);padding:24px">Nenhum modelo criado ainda.</div>';return;}
  el.innerHTML=templates.map(tpl=>{
    const byGroup=GROUPS.map((_,gi)=>tpl.tasks.filter(t=>t.group===gi));
    return `<div class="tpl-card">
      <div class="tpl-header">
        <div>
          <div class="tpl-title">${esc(tpl.name)}</div>
          <div style="font-size:11px;color:var(--text2);margin-top:2px">${tpl.tasks.length} tarefas · ${esc(tpl.desc||'')}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm btn-purple" onclick="editTemplate('${tpl.id}')">Editar</button>
          <button class="btn btn-sm btn-red" onclick="deleteTemplate('${tpl.id}')">×</button>
        </div>
      </div>
      ${GROUPS.map((g,gi)=>{
        const gt=byGroup[gi];if(!gt.length)return'';
        return `<div class="tpl-group-title">
          <div style="width:7px;height:7px;border-radius:50%;background:${g.color}"></div>${g.name}
          <span style="font-size:10px;color:var(--text3);font-weight:400">${gt.length} tarefas</span>
        </div>
        ${gt.map(t=>`<div class="tpl-task-row">
          <div class="tpl-task-dot" style="background:${g.color}"></div>
          <span class="tpl-task-name">${esc(t.name)}</span>
          <span class="pill ${PM[t.priority].c}" style="font-size:10px">${PM[t.priority].l}</span>
          ${t.desc?`<span class="tpl-task-desc">${esc(t.desc)}</span>`:''}
        </div>`).join('')}`;
      }).join('')}
    </div>`;
  }).join('');
}

function templateModalHTML(tpl){
  const isEdit=!!tpl;
  const tasks=tpl?.tasks||[];
  return `<div class="modal" style="max-height:92vh;overflow-y:auto;width:580px">
    <h3>${isEdit?'Editar modelo':'Novo modelo de tarefa'}</h3>
    <div class="fr"><label>Nome do modelo</label><input id="tpl-name" value="${esc(tpl?.name||'')}" placeholder="Ex: Implantação Padrão"/></div>
    <div class="fr"><label>Descrição</label><input id="tpl-desc" value="${esc(tpl?.desc||'')}" placeholder="Ex: Modelo com todos os grupos"/></div>
    <div class="section-sep"></div>
    <div style="font-size:11px;font-weight:500;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px">Tarefas do modelo</div>
    <div id="tpl-tasks-list">
      ${tasks.map((t,i)=>{
        const g=GROUPS[t.group]||GROUPS[0];
        return `<div class="tpl-edit-row" id="tpl-row-${i}">
          <div class="tpl-task-dot" style="background:${g.color}"></div>
          <span class="tpl-edit-name">${esc(t.name)}</span>
          <span class="tpl-edit-group" style="background:${g.bg};color:${g.text}">${g.name}</span>
          <span class="pill ${PM[t.priority].c}" style="font-size:10px">${PM[t.priority].l}</span>
          <button class="btn btn-red btn-sm" onclick="removeTplTask(${i})" style="padding:1px 6px">×</button>
        </div>`;
      }).join('')}
    </div>
    <div style="background:var(--surface2);border:0.5px solid var(--border);border-radius:var(--r-md);padding:12px;margin-top:8px">
      <div style="font-size:11px;font-weight:500;margin-bottom:8px;color:var(--text2)">Adicionar tarefa ao modelo</div>
      <div class="f2">
        <div class="fr"><label>Nome da tarefa</label><input id="new-tpl-name" placeholder="Ex: Treinamento fiscal"/></div>
        <div class="fr"><label>Grupo</label><select id="new-tpl-group">
          ${GROUPS.map((g,i)=>`<option value="${i}">${g.name}</option>`).join('')}
        </select></div>
      </div>
      <div class="f2">
        <div class="fr"><label>Prioridade</label><select id="new-tpl-priority">
          ${Object.keys(PM).map(k=>`<option value="${k}"${k==='medium'?' selected':''}>${PM[k].l}</option>`).join('')}
        </select></div>
        <div class="fr"><label>Descrição (opcional)</label><input id="new-tpl-desc" placeholder=""/></div>
      </div>
      <button class="btn btn-blue" style="width:100%;justify-content:center" onclick="addTplTask()">+ Adicionar tarefa</button>
    </div>
    <div class="ma"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="saveTemplate()">Salvar modelo</button></div>
  </div>`;
}

let tplTasksBuffer=[];

function openTemplateModal(){
  editingTemplate=null;tplTasksBuffer=[];
  showModal(templateModalHTML(null));
}
function editTemplate(id){
  const t=templates.find(x=>x.id===id);if(!t)return;
  editingTemplate=id;tplTasksBuffer=[...t.tasks.map(x=>({...x}))];
  showModal(templateModalHTML({...t,tasks:tplTasksBuffer}));
}

function addTplTask(){
  const name=$('new-tpl-name').value.trim();if(!name)return;
  const task={name,group:+$('new-tpl-group').value,priority:$('new-tpl-priority').value,desc:$('new-tpl-desc').value||''};
  tplTasksBuffer.push(task);
  $('new-tpl-name').value='';$('new-tpl-desc').value='';
  const g=GROUPS[task.group]||GROUPS[0];
  const idx=tplTasksBuffer.length-1;
  $('tpl-tasks-list').insertAdjacentHTML('beforeend',`<div class="tpl-edit-row" id="tpl-row-${idx}">
    <div class="tpl-task-dot" style="background:${g.color}"></div>
    <span class="tpl-edit-name">${esc(task.name)}</span>
    <span class="tpl-edit-group" style="background:${g.bg};color:${g.text}">${g.name}</span>
    <span class="pill ${PM[task.priority].c}" style="font-size:10px">${PM[task.priority].l}</span>
    <button class="btn btn-red btn-sm" onclick="removeTplTask(${idx})" style="padding:1px 6px">×</button>
  </div>`);
}

function removeTplTask(idx){
  tplTasksBuffer.splice(idx,1);
  if(editingTemplate){
    const t=templates.find(x=>x.id===editingTemplate);
    if(t)t.tasks=[...tplTasksBuffer];
  }
  // Re-render task list
  const list=$('tpl-tasks-list');
  const g_=GROUPS;
  list.innerHTML=tplTasksBuffer.map((t,i)=>{
    const g=g_[t.group]||g_[0];
    return `<div class="tpl-edit-row" id="tpl-row-${i}">
      <div class="tpl-task-dot" style="background:${g.color}"></div>
      <span class="tpl-edit-name">${esc(t.name)}</span>
      <span class="tpl-edit-group" style="background:${g.bg};color:${g.text}">${g.name}</span>
      <span class="pill ${PM[t.priority].c}" style="font-size:10px">${PM[t.priority].l}</span>
      <button class="btn btn-red btn-sm" onclick="removeTplTask(${i})" style="padding:1px 6px">×</button>
    </div>`;
  }).join('');
}

async function saveTemplate(){
  const name=$('tpl-name').value.trim();if(!name)return;
  const body={name,desc:$('tpl-desc').value,tasks:tplTasksBuffer};
  if(editingTemplate){await api('PUT','/templates/'+editingTemplate,body);}
  else{await api('POST','/templates',body);}
  templates=await api('GET','/templates');
  closeModal();renderTemplates();
}
async function deleteTemplate(id){
  if(!canDelete())return;
  if(!confirm('Excluir modelo?'))return;
  await api('DELETE','/templates/'+id);
  templates=templates.filter(t=>t.id!==id);renderTemplates();
}

// ── Clients ────────────────────────────────────────────────
let clientSort={col:'name',dir:1};
function sortClients(col){
  if(clientSort.col===col){clientSort.dir*=-1;}else{clientSort.col=col;clientSort.dir=1;}
  renderClientsTable();
}

function renderClientsTable(){
  const tb=$('clients-tb');if(!tb)return;
  const search=($('client-search')?.value||'').toLowerCase().trim();
  const filtered=search?clients.filter(c=>
    (c.name||'').toLowerCase().includes(search)||
    (c.contactName||'').toLowerCase().includes(search)||
    (c.phone||'').toLowerCase().includes(search)||
    (c.email||'').toLowerCase().includes(search)
  ):clients;
  const sorted=filtered.slice().sort((a,b)=>{
    let va='',vb='';
    if(clientSort.col==='name'){va=a.name||'';vb=b.name||'';}
    else if(clientSort.col==='classification'){va=a.classification||'';vb=b.classification||'';}
    else if(clientSort.col==='product'){va=productById(a.productId)?.name||'';vb=productById(b.productId)?.name||'';}
    else if(clientSort.col==='date'){va=a.date||'';vb=b.date||'';}
    else if(clientSort.col==='seller'){va=sellerById(a.sellerId)?.name||'';vb=sellerById(b.sellerId)?.name||'';}
    return va.localeCompare(vb)*clientSort.dir;
  });
  tb.innerHTML=sorted.map(c=>`<tr onclick="editClient('${c.id}')" style="cursor:pointer">
    <td>${esc(c.name)}</td>
    <td><span class="pill class-${c.classification}">${c.classification}</span></td>
    <td>${esc(productById(c.productId)?.name||'—')}</td>
    <td style="font-size:11px">${c.contactName?`${esc(c.contactName)}${c.contactRole?`<div style="font-size:10px;color:var(--text3)">${esc(c.contactRole)}</div>`:''}`:'—'}</td>
    <td class="dc" style="font-size:11px">${c.phone?esc(c.phone):'—'}</td>
    <td class="dc" style="font-size:11px">${c.email?esc(c.email):'—'}</td>
    <td class="dc">${fd(c.date)}</td>
    <td>${esc(sellerById(c.sellerId)?.name||'—')}</td>
    <td><button class="btn btn-red btn-sm" onclick="event.stopPropagation();deleteClient('${c.id}')">×</button></td>
  </tr>`).join('');
}

function clientHTML(c){
  return `<div class="modal">
    <h3>${c?'Editar cliente':'Novo cliente'}</h3>
    <div class="f2">
      <div class="fr" style="flex:2"><label>Nome</label><input id="c-name" value="${esc(c?.name||'')}" placeholder="Ex: Empresa XYZ Ltda"/></div>
      <div class="fr"><label>Classificação</label><select id="c-class">
        <option value="Esmeralda"${c?.classification==='Esmeralda'?' selected':''}>Esmeralda</option>
        <option value="Diamante"${c?.classification==='Diamante'?' selected':''}>Diamante</option>
        <option value="Ouro"${(!c||c.classification==='Ouro')?' selected':''}>Ouro</option>
        <option value="Prata"${c?.classification==='Prata'?' selected':''}>Prata</option>
        <option value="Bronze"${c?.classification==='Bronze'?' selected':''}>Bronze</option>
      </select></div>
    </div>
    <div class="f2">
      <div class="fr"><label>Produto</label><select id="c-product"></select></div>
      <div class="fr"><label>Vendedor</label><select id="c-seller"></select></div>
    </div>
    <div class="fr"><label>Data de entrada</label><input type="date" id="c-date" value="${c?.date||''}"/></div>

    <div class="section-sep"></div>
    <div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;font-weight:500;margin-bottom:6px">👤 Contato</div>
    <div style="font-size:10px;color:var(--text3);line-height:1.45;margin-bottom:9px;background:var(--surface2);border-radius:var(--r-md);padding:7px 9px">
      🔒 Dados usados para agendamento e comunicação sobre os serviços contratados.
      Guardados por 5 anos após o fim do contrato. Dúvidas: lgpd@solidez.net
    </div>
    <div class="f2">
      <div class="fr" style="flex:2"><label>Nome do contato</label><input id="c-contact-name" value="${esc(c?.contactName||'')}" placeholder="Ex: Maria Silva"/></div>
      <div class="fr"><label>Cargo / Função</label><input id="c-contact-role" value="${esc(c?.contactRole||'')}" placeholder="Ex: Sócia, Contadora"/></div>
    </div>
    <div class="f2">
      <div class="fr"><label>Telefone</label><input id="c-phone" value="${esc(c?.phone||'')}" placeholder="(91) 98888-8888"/></div>
      <div class="fr"><label>E-mail</label><input type="email" id="c-email" value="${esc(c?.email||'')}" placeholder="contato@empresa.com"/></div>
    </div>
    <div class="section-sep"></div>

    <div class="fr"><label>Observações</label><textarea id="c-notes">${esc(c?.notes||'')}</textarea></div>
    <div class="ma"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="saveClient()">Salvar cliente</button></div>
  </div>`;
}
function openClientModal(){editingClient=null;showModal(clientHTML(null));}
function editClient(id){const c=clients.find(x=>x.id===id);if(!c)return;editingClient=id;showModal(clientHTML(c));setTimeout(()=>{if($('c-product'))$('c-product').value=c.productId||'';if($('c-seller'))$('c-seller').value=c.sellerId||'';},50);}
async function saveClient(){
  const name=$('c-name').value.trim();if(!name)return;
  const body={name,classification:$('c-class').value,productId:$('c-product').value||null,date:$('c-date').value,sellerId:$('c-seller').value||null,notes:$('c-notes').value,
    contactName:$('c-contact-name')?.value||'',contactRole:$('c-contact-role')?.value||'',
    phone:$('c-phone')?.value||'',email:$('c-email')?.value||''};
  try{
    if(editingClient){await api('PUT','/clients/'+editingClient,body);}else{await api('POST','/clients',body);}
  }catch(e){ return; } // erro já exibido ao usuário; mantém o modal aberto
  clients=await api('GET','/clients');closeModal();renderClientsTable();updateSelects();
}
async function deleteClient(id){if(!canDelete())return;if(!confirm('Excluir cliente?'))return;
  try{await api('DELETE','/clients/'+id);clients=clients.filter(c=>c.id!==id);renderClientsTable();}catch(e){showDeleteError(e);}}

// ── Products ───────────────────────────────────────────────
function renderProductsTable(){
  const tb=$('products-tb');if(!tb)return;
  tb.innerHTML=products.map(p=>`<tr onclick="editProduct('${p.id}')" style="cursor:pointer">
    <td style="font-weight:500">${esc(p.name)}</td>
    <td>${esc(p.desc||'')}</td>
    <td><span class="${p.active?'badge-active':'badge-inactive'}">${p.active?'Ativo':'Inativo'}</span></td>
    <td><button class="btn btn-red btn-sm" onclick="event.stopPropagation();deleteProduct('${p.id}')">×</button></td>
  </tr>`).join('');
}
function productHTML(p){
  return `<div class="modal">
    <h3>${p?'Editar produto':'Novo produto'}</h3>
    <div class="fr"><label>Nome do produto</label><input id="pr-name" value="${esc(p?.name||'')}" placeholder="Ex: Zen Folha"/></div>
    <div class="fr"><label>Descrição</label><textarea id="pr-desc">${esc(p?.desc||'')}</textarea></div>
    <div class="fr"><label>Status</label><select id="pr-active">
      <option value="true"${p?.active!==false?' selected':''}>Ativo</option>
      <option value="false"${p?.active===false?' selected':''}>Inativo</option>
    </select></div>
    <div class="ma"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="saveProduct()">Salvar produto</button></div>
  </div>`;
}
function openProductModal(){editingProduct=null;showModal(productHTML(null));}
function editProduct(id){const p=products.find(x=>x.id===id);if(!p)return;editingProduct=id;showModal(productHTML(p));}
async function saveProduct(){
  const name=$('pr-name').value.trim();if(!name)return;
  const body={name,desc:$('pr-desc').value,active:$('pr-active').value==='true'};
  if(editingProduct){await api('PUT','/products/'+editingProduct,body);}else{await api('POST','/products',body);}
  products=await api('GET','/products');closeModal();renderProductsTable();updateSelects();
}
async function deleteProduct(id){if(!canDelete())return;if(!confirm('Excluir produto?'))return;
  try{await api('DELETE','/products/'+id);products=products.filter(p=>p.id!==id);renderProductsTable();}catch(e){showDeleteError(e);}}

// ── Owners ─────────────────────────────────────────────────
function renderOwnersTable(){
  const tb=$('owners-tb');if(!tb)return;
  tb.innerHTML=owners.map(o=>`<tr onclick="editOwner('${o.id}')" style="cursor:pointer">
    <td><div style="display:flex;align-items:center;gap:7px">${ownerAvatar(o)}<span>${esc(o.name)}</span></div></td>
    <td style="color:var(--text2)">${esc(o.email||'')}</td>
    <td style="font-size:11px">${o.email&&o.notifEmail!==false?'<span title="Notificação diária ativa">📧 ativo</span>':'<span style="color:var(--text3)">—</span>'}</td>
    <td><span class="${o.active?'badge-active':'badge-inactive'}">${o.active?'Ativo':'Inativo'}</span></td>
    <td><button class="btn btn-red btn-sm" onclick="event.stopPropagation();deleteOwner('${o.id}')">×</button></td>
  </tr>`).join('');
}
function ownerHTML(o){
  const colors=['#185FA5','#3B6D11','#BA7517','#993556','#534AB7','#993C1D','#0F6E56','#854F0B'];
  return `<div class="modal">
    <h3>${o?'Editar responsável':'Novo responsável'}</h3>
    <div class="f2">
      <div class="fr" style="flex:2"><label>Nome completo</label><input id="ow-name" value="${esc(o?.name||'')}" placeholder="Ex: Ana Lima"/></div>
      <div class="fr"><label>Iniciais</label><input id="ow-initials" value="${esc(o?.initials||'')}" placeholder="AL" maxlength="3" style="text-transform:uppercase"/></div>
    </div>
    <div class="fr"><label>E-mail</label><input type="email" id="ow-email" value="${esc(o?.email||'')}" placeholder="ana@empresa.com"/></div>
    <div class="fr"><label>Cor do avatar</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
        ${colors.map(c=>`<div onclick="selectOwnerColor('${c}')" style="width:24px;height:24px;border-radius:50%;background:${c};cursor:pointer;border:2px solid ${(o?.color||colors[0])===c?'var(--text)':'transparent'}"></div>`).join('')}
      </div>
      <input type="hidden" id="ow-color" value="${o?.color||colors[0]}"/>
    </div>
    <div class="fr"><label>Status</label><select id="ow-active">
      <option value="true"${o?.active!==false?' selected':''}>Ativo</option>
      <option value="false"${o?.active===false?' selected':''}>Inativo</option>
    </select></div>
    <div class="fr" style="align-items:center;gap:10px">
      <label style="flex:1">📧 Notificação de agendas por e-mail</label>
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px">
        <input type="checkbox" id="ow-notif" ${o?.notifEmail!==false?'checked':''} style="width:16px;height:16px;cursor:pointer"/>
        Enviar resumo diário das agendas
      </label>
    </div>
    <div id="ow-notif-aviso" style="display:${(!o?.email)?'block':'none'};font-size:11px;color:var(--amber);margin-top:-6px;margin-bottom:4px">
      ⚠ Cadastre um e-mail para habilitar as notificações.
    </div>
    <div class="ma"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="saveOwner()">Salvar responsável</button></div>
  </div>`;
}
function selectOwnerColor(c){
  $('ow-color').value=c;
  document.querySelectorAll('#active-modal [onclick^="selectOwnerColor"]').forEach(el=>{
    el.style.border=el.getAttribute('onclick').includes(c)?'2px solid var(--text)':'2px solid transparent';
  });
}
function openOwnerModal(){editingOwner=null;showModal(ownerHTML(null));}
function editOwner(id){const o=owners.find(x=>x.id===id);if(!o)return;editingOwner=id;showModal(ownerHTML(o));}
async function saveOwner(){
  const name=$('ow-name').value.trim();if(!name)return;
  const initials=$('ow-initials').value.trim().toUpperCase()||name.slice(0,2).toUpperCase();
  const body={name,initials,email:$('ow-email').value,color:$('ow-color').value,active:$('ow-active').value==='true',notifEmail:$('ow-notif')?.checked!==false};
  try{
    if(editingOwner){await api('PUT','/owners/'+editingOwner,body);}else{await api('POST','/owners',body);}
  }catch(e){ return; }
  owners=await api('GET','/owners');closeModal();renderOwnersTable();updateSelects();
}
async function deleteOwner(id){if(!canDelete())return;if(!confirm('Excluir responsável?'))return;
  try{await api('DELETE','/owners/'+id);owners=owners.filter(o=>o.id!==id);renderOwnersTable();}catch(e){showDeleteError(e);}}

// ── Sellers ────────────────────────────────────────────────
function renderSellersTable(){
  const tb=$('sellers-tb');if(!tb)return;
  tb.innerHTML=sellers.map(s=>`<tr onclick="editSeller('${s.id}')" style="cursor:pointer">
    <td style="font-weight:500">${esc(s.name)}</td>
    <td style="color:var(--text2)">${esc(s.email||'')}</td>
    <td style="color:var(--text2)">${esc(s.phone||'')}</td>
    <td><span class="${s.active?'badge-active':'badge-inactive'}">${s.active?'Ativo':'Inativo'}</span></td>
    <td><button class="btn btn-red btn-sm" onclick="event.stopPropagation();deleteSeller('${s.id}')">×</button></td>
  </tr>`).join('');
}
function sellerHTML(s){
  return `<div class="modal">
    <h3>${s?'Editar vendedor':'Novo vendedor'}</h3>
    <div class="fr"><label>Nome completo</label><input id="se-name" value="${esc(s?.name||'')}" placeholder="Ex: Carlos Menezes"/></div>
    <div class="f2">
      <div class="fr"><label>E-mail</label><input type="email" id="se-email" value="${esc(s?.email||'')}" placeholder="carlos@empresa.com"/></div>
      <div class="fr"><label>Telefone</label><input id="se-phone" value="${esc(s?.phone||'')}" placeholder="(11) 99999-9999"/></div>
    </div>
    <div class="fr"><label>Status</label><select id="se-active">
      <option value="true"${s?.active!==false?' selected':''}>Ativo</option>
      <option value="false"${s?.active===false?' selected':''}>Inativo</option>
    </select></div>
    <div class="ma"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="saveSeller()">Salvar vendedor</button></div>
  </div>`;
}
function openSellerModal(){editingSeller=null;showModal(sellerHTML(null));}
function editSeller(id){const s=sellers.find(x=>x.id===id);if(!s)return;editingSeller=id;showModal(sellerHTML(s));}
async function saveSeller(){
  const name=$('se-name').value.trim();if(!name)return;
  const body={name,email:$('se-email').value,phone:$('se-phone').value,active:$('se-active').value==='true'};
  try{
    if(editingSeller){await api('PUT','/sellers/'+editingSeller,body);}else{await api('POST','/sellers',body);}
  }catch(e){ return; }
  sellers=await api('GET','/sellers');closeModal();renderSellersTable();updateSelects();
}
async function deleteSeller(id){if(!canDelete())return;if(!confirm('Excluir vendedor?'))return;
  try{await api('DELETE','/sellers/'+id);sellers=sellers.filter(s=>s.id!==id);renderSellersTable();}catch(e){showDeleteError(e);}}

// ── Notificações ───────────────────────────────────────────
function renderNotifs(){
  const in3=new Date(Date.now()+3*864e5).toISOString().slice(0,10);
  const isAdmin=currentUser?.perfil==='admin';

  // Atualizar filtro de projetos
  const fpEl=$('notif-fil-proj');
  if(fpEl&&fpEl.options.length<=1){
    projects.forEach(p=>{
      const o=document.createElement('option');
      o.value=p.id;o.textContent=p.name;
      fpEl.appendChild(o);
    });
  }

  // Mostrar filtro de responsável apenas para admin
  const fuEl=$('notif-fil-user');
  if(fuEl){
    fuEl.style.display=isAdmin?'':'none';
    if(isAdmin&&fuEl.options.length<=1){
      owners.forEach(o=>{
        const opt=document.createElement('option');
        opt.value=o.id;opt.textContent=o.name;
        fuEl.appendChild(opt);
      });
    }
  }

  const fp=$('notif-fil-proj')?.value||'';
  const fu=$('notif-fil-user')?.value||'';

  // Fonte de tasks: admin vê todas, responsável vê só as suas
  let src=allCalTasks.length?allCalTasks:tasks;
  if(!isAdmin){
    // Filtrar apenas tasks do responsável logado
    const myOwnerId=currentUser?.ownerId||'';
    src=src.filter(t=>t.ownerId===myOwnerId);
  }

  // Aplicar filtros
  if(fp) src=src.filter(t=>t.projId===fp);
  if(fu) src=src.filter(t=>t.ownerId===fu);

  const ov=src.filter(t=>isOv(t.date||t.dateEnd,t.status));
  const sn=src.filter(t=>{
    const d=t.date||t.dateEnd||'';
    return d&&d>=today&&d<=in3&&t.status!=='done'&&t.status!=='na'&&t.status!=='cancel';
  });
  const tot=ov.length+sn.length;

  // Badge no sino
  $('notif-dot').style.display=tot>0?'block':'none';
  const nb=$('nb');if(tot>0){nb.textContent=tot;nb.style.display='inline';}else nb.style.display='none';

  const list=$('notif-list');if(!list)return;

  if(!tot){
    list.innerHTML='<div style="padding:22px;text-align:center;color:var(--text2)">Sem notificações pendentes</div>';
    return;
  }

  const mkItem=(t,tipo)=>{
    const proj=projects.find(p=>p.id===t.projId)||{};
    const owner=ownerById(t.ownerId);
    const isAtrasada=tipo==='atrasada';
    const cor=isAtrasada?'#A32D2D':'#854F0B';
    const bg=isAtrasada?'#FCEBEB':'#FAEEDA';
    const icon=isAtrasada
      ?`<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="${cor}" stroke-width="1.5"><circle cx="6" cy="6" r="4.5"/><line x1="6" y1="3.5" x2="6" y2="6.5"/><circle cx="6" cy="8.5" r=".5" fill="${cor}"/></svg>`
      :`<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="${cor}" stroke-width="1.5"><circle cx="6" cy="6" r="4.5"/><line x1="6" y1="3" x2="6" y2="6.5"/><line x1="6" y1="6.5" x2="8.5" y2="8.5"/></svg>`;
    const label=isAtrasada?`<span class="pill s-cancel">Atrasada</span>`:`<span class="pill s-pending">Em breve</span>`;
    const dataLabel=isAtrasada?'Prazo':'Vence';
    return `<div onclick="openEditTask('${t.id}')" style="display:flex;align-items:center;gap:9px;padding:9px 12px;border-bottom:0.5px solid var(--border);cursor:pointer;transition:background .1s" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <div style="width:26px;height:26px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;flex-shrink:0">${icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:500;color:${isAtrasada?cor:'var(--text)'};font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.name)}</div>
        <div style="font-size:11px;color:var(--text2);display:flex;gap:8px;flex-wrap:wrap;margin-top:1px">
          <span>${dataLabel}: ${fd(t.date||t.dateEnd)}</span>
          ${owner?.name?`<span>· ${esc(owner.name)}</span>`:''}
          ${proj.name?`<span style="color:var(--text3)">· ${esc(proj.name)}</span>`:''}
        </div>
      </div>
      ${label}
    </div>`;
  };

  list.innerHTML=`<div style="background:var(--surface);border:0.5px solid var(--border);border-radius:var(--r-lg);overflow:hidden">
    ${ov.map(t=>mkItem(t,'atrasada')).join('')}
    ${sn.map(t=>mkItem(t,'embreve')).join('')}
  </div>`;
}

// ── Calendário ─────────────────────────────────────────────
let calY=new Date().getFullYear(), calM=new Date().getMonth();

// Feriados nacionais fixos (MM-DD) e móveis calculados por ano
function getFeriados(year){
  // Cálculo da Páscoa (algoritmo de Gauss)
  const a=year%19, b=Math.floor(year/100), c=year%100;
  const d=Math.floor(b/4), e=b%4, f=Math.floor((b+8)/25);
  const g=Math.floor((b-f+1)/3), h=(19*a+b-d-g+15)%30;
  const i=Math.floor(c/4), k=c%4, l=(32+2*e+2*i-h-k)%7;
  const m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31);
  const day=((h+l-7*m+114)%31)+1;
  const pascoa=new Date(year,month-1,day);
  const add=(d,n)=>{const r=new Date(d);r.setDate(r.getDate()+n);return r.toISOString().slice(0,10);};
  const fmt=d=>`${year}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  return {
    // Fixos
    [`${year}-01-01`]:'Confraternização Universal',
    [`${year}-04-21`]:'Tiradentes',
    [`${year}-05-01`]:'Dia do Trabalho',
    [`${year}-09-07`]:'Independência do Brasil',
    [`${year}-10-12`]:'Nossa Sra. Aparecida',
    [`${year}-11-02`]:'Finados',
    [`${year}-11-15`]:'Proclamação da República',
    [`${year}-11-20`]:'Consciência Negra',
    [`${year}-12-25`]:'Natal',
    // Móveis baseados na Páscoa
    [add(pascoa,-48)]:'Segunda de Carnaval',
    [add(pascoa,-47)]:'Terça de Carnaval',
    [add(pascoa,-2)] :'Sexta-feira Santa',
    [fmt(pascoa)]    :'Páscoa',
    [add(pascoa,60)] :'Corpus Christi',
  };
}


// Helper: retorna true se a data é dia útil (não é fim de semana nem feriado nacional)
function isDiaUtil(ds, feriadosMap){
  const d=new Date(ds+'T00:00:00');
  const dow=d.getDay();
  if(dow===0||dow===6) return false;          // fim de semana
  if(feriadosMap && feriadosMap[ds]) return false; // feriado
  return true;
}

// Cache de feriados por ano para não recalcular
const _feriadosCache={};
function getFeriadosAno(year){
  if(!_feriadosCache[year]) _feriadosCache[year]=getFeriados(year);
  return _feriadosCache[year];
}

let allCalTasks=[];
let taskDailyStatus = {}; // { "taskId|YYYY-MM-DD": "done"|"pending" }

async function loadAllTasksForCal(){
  allCalTasks=await api('GET','/tasks');
  // Carrega status diários do mês atual e adjacentes
  const months=[
    `${calY}-${String(calM).padStart(2,'0')}`,
    `${calY}-${String(calM+1).padStart(2,'0')}`,
    `${calY}-${String(calM+2).padStart(2,'0')}`
  ];
  taskDailyStatus={};
  for(const m of months){
    try{
      const rows=await api('GET',`/task-daily-status?month=${m}`);
      if(Array.isArray(rows)) rows.forEach(r=>{ taskDailyStatus[r.taskId+'|'+r.date]=r.status; });
    }catch(e){}
  }
}

async function loadDailyStatusForMonth(y, m){
  const monthStr=`${y}-${String(m+1).padStart(2,'0')}`;
  try{
    const rows=await api('GET',`/task-daily-status?month=${monthStr}`);
    if(Array.isArray(rows)) rows.forEach(r=>{ taskDailyStatus[r.taskId+'|'+r.date]=r.status; });
  }catch(e){}
}

function getDailyStatus(taskId, dateStr){
  return taskDailyStatus[taskId+'|'+dateStr]||null;
}

function hasPeriod(t){
  return t.dateStart && t.dateEnd && t.dateStart !== t.dateEnd;
}

// ── Autocomplete dos filtros do calendário ────────────────
// Converte o nome digitado no id correspondente e refiltra
function onCalFilterInput(tipo){
  const txt=$(`cal-fil-${tipo}-txt`);
  const hid=$(`cal-fil-${tipo}`);
  if(!txt||!hid)return;
  const termo=txt.value.trim().toLowerCase();
  const lista=tipo==='client'?clients:projects;
  // Casa pelo nome exato (escolhido na lista) ou pelo único resultado da busca
  let achado=lista.find(x=>(x.name||'').toLowerCase()===termo);
  if(!achado&&termo){
    const parciais=lista.filter(x=>(x.name||'').toLowerCase().includes(termo));
    if(parciais.length===1)achado=parciais[0];
  }
  hid.value=achado?achado.id:'';
  txt.style.borderColor=termo&&!achado?'#F09595':'var(--border2)';
  renderCalendar();
}

function clearCalFilter(tipo){
  const txt=$(`cal-fil-${tipo}-txt`);
  const hid=$(`cal-fil-${tipo}`);
  if(txt){txt.value='';txt.style.borderColor='var(--border2)';}
  if(hid)hid.value='';
  renderCalendar();
  txt?.focus();
}

function calFilteredTasks(){
  const src=allCalTasks.length?allCalTasks:tasks;
  const fo=$('cal-fil-owner')?.value||'';
  const fc=$('cal-fil-client')?.value||'';
  const fp=$('cal-fil-proj')?.value||'';
  return src.filter(t=>
    t.date &&
    (!fo||t.ownerId===fo) &&
    (!fp||t.projId===fp) &&
    (!fc||(()=>{const p=projects.find(x=>x.id===t.projId);return p&&p.clientId===fc;})())
  );
}

function renderCalendar(){
  const MONTHS=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  $('cal-lbl').textContent=MONTHS[calM]+' '+calY;
  const cont=$('cal-cont'); if(!cont)return; cont.innerHTML='';

  const ft=calFilteredTasks();
  const first=new Date(calY,calM,1).getDay();
  const dim=new Date(calY,calM+1,0).getDate();
  const prev=new Date(calY,calM,0).getDate();

  // Função: verifica se uma tarefa ocorre em determinado dia (suporta período)
  function taskOnDay(t, ds){
    const start=t.dateStart||t.date||'';
    const end=t.dateEnd||t.date||'';
    if(!start && !end) return false;
    if(getDailyStatus(t.id, ds)==='cancel') return false;
    if(t.status==='cancel' && !hasPeriod(t)) return false;
    // Feriado: tarefa de período não aparece no dia (igual fim de semana)
    if(hasPeriod(t)){
      const fer=getFeriadosAno(ds.slice(0,4));
      if(fer && fer[ds]) return false;
    }
    if(start && end) return ds>=start && ds<=end;
    return ds===start || ds===end;
  }

  const grid=document.createElement('div');
  grid.style.cssText='display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:1px;background:rgba(0,0,0,0.08);border:0.5px solid var(--border);border-radius:var(--r-lg);overflow:hidden';

  // Cabeçalho — apenas dias úteis (Seg a Sex)
  ['Seg','Ter','Qua','Qui','Sex'].forEach(d=>{
    const c=document.createElement('div');
    c.style.cssText='background:var(--surface2);padding:6px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text2);text-align:center;font-weight:500';
    c.textContent=d; grid.appendChild(c);
  });

  // Dias mês anterior — ajustar para semana começar na segunda
  // first: 0=Dom,1=Seg,2=Ter,3=Qua,4=Qui,5=Sex,6=Sáb
  // Na grade Seg-Sex: Seg=col0, Ter=col1, ... Sex=col4
  // Dom e Sáb não existem — se o mês começa no Dom, mostra 4 células vazias (Seg-Qui do mês anterior)
  const firstAdj = first===0 ? 4 : (first===6 ? 0 : first-1);
  for(let i=0;i<firstAdj;i++){
    const c=document.createElement('div');
    c.style.cssText='background:var(--surface2);padding:5px 7px;min-height:90px';
    c.innerHTML=`<div style="font-size:11px;color:var(--text3);margin-bottom:3px">${prev-firstAdj+1+i}</div>`;
    grid.appendChild(c);
  }

  // Dias do mês — pular sábado (6) e domingo (0)
  const feriados=getFeriados(calY);
  for(let d=1;d<=dim;d++){
    const ds=`${calY}-${String(calM+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dow=new Date(calY,calM,d).getDay(); // 0=Dom, 6=Sáb
    if(dow===0||dow===6) continue; // pula fim de semana
    const isToday=ds===today;
    const isFeriado=!!feriados[ds];
    const feriadoNome=feriados[ds]||'';
    const dayTasks=ft.filter(t=>taskOnDay(t,ds));
    const hasTask=dayTasks.length>0;
    const dayStr=String(d).padStart(2,'0');
    const c=document.createElement('div');
    // Fundo diferente para feriados
    const bgCell=isToday?'var(--blue-bg)':isFeriado?'#FFF8F0':'var(--surface)';
    c.style.cssText=`background:${bgCell};padding:5px 7px;min-height:90px;cursor:pointer;transition:outline .1s`;
    c.setAttribute('id','cal-cell-'+dayStr);
    c.onclick=(e)=>{
      if(e.target.closest('[onclick*="openEditTask"]'))return;
      calSelectedDay===dayStr?calSelectDay(null):calSelectDay(dayStr);
    };

    let html=`<div style="display:flex;align-items:center;gap:3px;margin-bottom:3px">
      <div style="display:inline-flex;align-items:center;justify-content:center;
        width:20px;height:20px;border-radius:50%;font-size:11px;
        font-weight:${isToday?'700':'400'};cursor:pointer;flex-shrink:0;
        background:${isToday?'#185FA5':isFeriado?'#EF9F27':'transparent'};
        color:${isToday?'#fff':isFeriado?'#fff':hasTask?'var(--text)':'var(--text2)'};
        ${hasTask&&!isToday&&!isFeriado?'font-weight:600':''}
        ">${d}</div>
      ${isFeriado?`<span style="font-size:9px;color:#854F0B;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1" title="${esc(feriadoNome)}">${esc(feriadoNome)}</span>`:''}
    </div>`;

    const dayTasksSorted=dayTasks.slice().sort((a,b)=>{
      // Manhã (manha) antes da tarde
      const turnoA=a.turno==='tarde'?1:0;
      const turnoB=b.turno==='tarde'?1:0;
      if(turnoA!==turnoB) return turnoA-turnoB;
      // Dentro do mesmo turno, ordena por nome do responsável
      const nA=ownerById(a.ownerId)?.name||'';
      const nB=ownerById(b.ownerId)?.name||'';
      return nA.localeCompare(nB,'pt-BR');
    });
    dayTasksSorted.forEach(t=>{
      const o=ownerById(t.ownerId);
      const ownerColor=o.color||'#888';
      const bgColor=ownerColor+'22';
      const proj=projects.find(p=>p.id===t.projId)||{};
      const cli=clientById(proj.clientId);
      const turnoIcon=t.turno==='tarde'?'🌙':'☀️';
      const turnoBorderColor=t.turno==='tarde'?'#3B6D11':'#EF9F27';
      const isStart=(!t.dateStart&&t.date===ds)||(t.dateStart===ds);
      const periodo=t.dateStart&&t.dateEnd?`${fd(t.dateStart)} → ${fd(t.dateEnd)}`:fd(t.dateStart||t.dateEnd||t.date);
      const tooltipTitle=`${t.name}${cli.name?' · '+cli.name:''} · ${turnoIcon} ${t.turno==='tarde'?'Tarde':'Manhã'}${periodo?' · '+periodo:''}`;
      html+=`<div onclick="event.stopPropagation();openEditTask('${t.id}')"
        title="${esc(tooltipTitle)}"
        style="font-size:10px;padding:2px 5px;border-radius:4px;margin-bottom:2px;cursor:pointer;
               background:${bgColor};color:var(--text);border-left:3px solid ${ownerColor};border-bottom:2px solid ${turnoBorderColor};
               display:flex;align-items:center;gap:3px;overflow:hidden">
        <span style="font-size:9px;flex-shrink:0">${turnoIcon}</span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500">${esc(t.name)}</span>
        ${cli.name?`<span style="opacity:.7;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:40px">${esc(cli.name)}</span>`:''}
        <span style="font-size:9px;font-weight:700;flex-shrink:0;color:${ownerColor}">${o.initials||''}</span>
      </div>`;
    });

    // Mostrar ausências do dia no calendário
    const dayAus=ausencias.filter(a=>a.dateStart<=ds&&a.dateEnd>=ds);
    dayAus.forEach(a=>{
      const o=ownerById(a.ownerId);
      const tipo=AUSENCIA_TIPOS[a.tipo]||AUSENCIA_TIPOS.ferias;
      const isFirst=a.dateStart===ds;
      html+=`<div title="${esc(o.name||'')} · ${tipo.l}"
        style="font-size:10px;padding:2px 5px;border-radius:4px;margin-bottom:2px;
               background:${tipo.bg};color:${tipo.color};border-left:3px solid ${tipo.color};
               display:flex;align-items:center;gap:3px;overflow:hidden;opacity:.85">
        <span style="font-size:9px;flex-shrink:0">${tipo.icon}</span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px">${isFirst?esc(o.name||''):''}</span>
      </div>`;
    });
    c.innerHTML=html;
    grid.appendChild(c);
  }

  // Dias mês seguinte
  const rem=(7-((first+dim)%7))%7;
  for(let i=1;i<=rem;i++){
    const c=document.createElement('div');
    c.style.cssText='background:var(--surface2);padding:5px 7px;min-height:90px';
    c.innerHTML=`<div style="font-size:11px;color:var(--text3);margin-bottom:3px">${i}</div>`;
    grid.appendChild(c);
  }

  cont.appendChild(grid);

  // Legenda de responsáveis
  const ownersList=ft.reduce((acc,t)=>{
    if(t.ownerId&&!acc.find(o=>o.id===t.ownerId)){const o=ownerById(t.ownerId);if(o.id)acc.push(o);}
    return acc;
  },[]);
  if(ownersList.length){
    const lg=document.createElement('div');
    lg.style.cssText='margin-top:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:6px 2px';
    lg.innerHTML='<span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em">Responsáveis:</span>'+
      ownersList.map(o=>`<div style="display:flex;align-items:center;gap:4px">
        <div style="width:10px;height:10px;border-radius:50%;background:${o.color||'#888'}"></div>
        <span style="font-size:11px;color:var(--text2)">${esc(o.name||'')}</span>
      </div>`).join('');
    cont.appendChild(lg);
  }

  // Ajuste 5 — seletor de dia + lista de tarefas do dia/mês
  const selDayDiv=document.createElement('div');
  selDayDiv.style.cssText='margin-top:14px;background:var(--surface);border:0.5px solid var(--border);border-radius:var(--r-lg);overflow:hidden';

  // Botões de dias do mês com tarefas
  const diasComTarefas=[...new Set(ft.map(t=>{
    const ref=t.dateStart||t.dateEnd||t.date||'';
    if(!ref)return null;
    const[y,m]=ref.split('-');
    if(+y===calY&&+m-1===calM)return ref.slice(8,10);
    return null;
  }).filter(Boolean))].sort();

  selDayDiv.innerHTML=`
    <div style="padding:9px 12px;border-bottom:0.5px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text2);font-weight:500">Tarefas por dia</div>
      <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
        <button id="cal-day-all" class="btn btn-sm btn-blue" onclick="calSelectDay(null)" style="font-size:10px;padding:2px 9px">Todos os dias</button>
        ${diasComTarefas.map(d=>`<button class="btn btn-sm cal-day-btn" data-day="${d}" onclick="calSelectDay('${d}')"
          style="font-size:10px;padding:2px 9px;min-width:32px">${+d}</button>`).join('')}
      </div>
    </div>
    <div id="cal-day-list"></div>`;
  cont.appendChild(selDayDiv);

  // Render inicial: todos os dias
  calRenderDayList(ft, null);
}

let calSelectedDay=null;
function calSelectDay(day){
  calSelectedDay=day;
  // Destaca célula do dia selecionado no grid
  document.querySelectorAll('[id^="cal-cell-"]').forEach(el=>{
    const d=el.id.replace('cal-cell-','');
    el.style.outline=d===day?'2px solid #185FA5':'none';
    el.style.outlineOffset='-2px';
  });
  // Atualiza botões da barra
  document.querySelectorAll('.cal-day-btn').forEach(b=>{
    const active=b.getAttribute('data-day')===day;
    b.style.background=active?'#185FA5':'';
    b.style.color=active?'#B5D4F4':'';
    b.style.borderColor=active?'#185FA5':'';
  });
  const allBtn=$('cal-day-all');
  if(allBtn){
    allBtn.style.background=!day?'#185FA5':'var(--surface)';
    allBtn.style.color=!day?'#B5D4F4':'var(--text)';
  }
  calRenderDayList(calFilteredTasks(), day);
  // Rola suavemente para a lista
  const list=$('cal-day-list');
  if(list&&day)list.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function calRenderDayList(ft, day){
  const list=$('cal-day-list');if(!list)return;

  // taskOnDay local — tarefas que ocorrem no dia (início, meio ou fim do período)
  function taskOnDay(t,ds){
    const start=t.dateStart||t.date||'';
    const end=t.dateEnd||t.date||'';
    if(!start&&!end)return false;
    if(getDailyStatus(t.id,ds)==='cancel')return false;
    if(t.status==='cancel'&&!hasPeriod(t))return false;
    // Feriado: tarefa de período não aparece no dia (igual fim de semana)
    if(hasPeriod(t)){
      const fer=getFeriadosAno(ds.slice(0,4));
      if(fer&&fer[ds])return false;
    }
    if(start&&end)return ds>=start&&ds<=end;
    return ds===start||ds===end;
  }

  let filtered;
  if(day){
    // Ajuste 2: mostra TODAS as tarefas que ocorrem naquele dia
    const ds=`${calY}-${String(calM+1).padStart(2,'0')}-${day.padStart(2,'0')}`;
    filtered=ft.filter(t=>taskOnDay(t,ds));
  } else {
    filtered=ft.filter(t=>{
      const ref=t.dateStart||t.dateEnd||t.date||'';
      if(!ref)return false;
      const[y,m]=ref.split('-');
      return +y===calY&&+m-1===calM;
    });
  }

  const sorted=filtered.slice().sort((a,b)=>(a.dateStart||a.date||'').localeCompare(b.dateStart||b.date||''));

  if(!sorted.length){
    list.innerHTML=`<div style="padding:18px;text-align:center;color:var(--text3);font-size:12px">${day?`Nenhuma tarefa no dia ${+day}`:'Nenhuma tarefa no mês com os filtros selecionados'}</div>`;
    return;
  }

  list.innerHTML=sorted.map(t=>{
    const g=GROUPS[t.group]||GROUPS[0];
    const o=ownerById(t.ownerId);
    const proj=projects.find(p=>p.id===t.projId)||{};
    const cli=clientById(proj.clientId);
    const periodo=t.dateStart&&t.dateEnd?`${fd(t.dateStart)} → ${fd(t.dateEnd)}`:fd(t.dateStart||t.dateEnd||t.date);
    const ownerColor=o.color||'#888';
    const turnoIcon=t.turno==='tarde'?'🌙':'☀️';
    const turnoLabel=t.turno==='tarde'?'Tarde':'Manhã';

    // Para tarefas com período, usa status do dia específico; para dia único usa status da tarefa
    const isPeriod=hasPeriod(t);
    // dateStr do dia sendo exibido
    let dateStr='';
    if(day){
      dateStr=`${calY}-${String(calM+1).padStart(2,'0')}-${day.padStart(2,'0')}`;
    } else {
      // na visão "todos os dias", usa a data de início da tarefa como referência
      dateStr=t.dateStart||t.date||'';
    }
    const dailySt=isPeriod?getDailyStatus(t.id, dateStr):null;
    const effectiveStatus=isPeriod?(dailySt||'pending'):t.status;
    const isDone=effectiveStatus==='done';

    // id do checkbox inclui a data para tarefas com período
    const checkId=isPeriod?`cal-check-${t.id}--${dateStr}`:`cal-check-${t.id}`;
    const pillId=isPeriod?`cal-pill-${t.id}--${dateStr}`:`cal-pill-${t.id}`;
    const nameId=isPeriod?`${t.id}--${dateStr}`:t.id;
    const onclick=isPeriod
      ?`event.stopPropagation();toggleDoneCalTask('${t.id}','${dateStr}')`
      :`event.stopPropagation();toggleDoneCalTask('${t.id}')`;

    const dsFer=dateStr||t.dateStart||t.date||'';
    const ferDs=getFeriadosAno(dsFer.slice(0,4));
    const ehFeriado=!!(ferDs&&ferDs[dsFer]);
    return `<div data-task-id="${t.id}" data-date="${dateStr}" style="display:flex;align-items:center;gap:9px;padding:9px 12px;border-bottom:0.5px solid var(--border);transition:background .1s;${isDone?'opacity:.75':''}" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <div style="width:3px;height:40px;border-radius:2px;background:${ownerColor};flex-shrink:0"></div>
      ${ehFeriado
        ? `<div style="width:18px;height:18px;border-radius:4px;border:1.5px solid #EF9F27;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;font-size:10px" title="Feriado — sem agenda">🏖</div>`
        : `<div id="${checkId}" onclick="${onclick}" title="${isDone?'Marcar como pendente':'Marcar como realizado'}"
          style="width:18px;height:18px;border-radius:4px;border:1.5px solid ${isDone?'#3B6D11':'#ccc'};display:inline-flex;align-items:center;justify-content:center;cursor:pointer;background:${isDone?'#3B6D11':'transparent'};flex-shrink:0">
          ${isDone?'<svg width="10" height="10" viewBox="0 0 10 10"><polyline points="1.5,5 4,7.5 8.5,2" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>':''}
        </div>
        <div onclick="event.stopPropagation();desmarcarDia('${t.id}','${isPeriod?dateStr:''}')" title="Cliente desmarcou esta agenda"
          style="width:18px;height:18px;border-radius:4px;border:1.5px solid #E8B4B4;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:#A32D2D;font-size:11px;line-height:1;flex-shrink:0;background:transparent"
          onmouseover="this.style.background='#FCEBEB';this.style.borderColor='#A32D2D'" onmouseout="this.style.background='transparent';this.style.borderColor='#E8B4B4'">&#10005;</div>`}
      <div style="flex:1;min-width:0;cursor:pointer" onclick="openEditTask('${t.id}')">
        <div data-task-name="${nameId}" style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${isDone?'text-decoration:line-through;color:var(--text3)':''}">${esc(t.name)}</div>
        <div style="font-size:10px;color:var(--text2);margin-top:2px;display:flex;align-items:center;gap:6px">
          <span>${esc(proj.name||'')}</span>
          ${cli.name?`<span style="background:#EEEDFE;color:#3C3489;padding:0 4px;border-radius:3px;font-size:10px">${esc(cli.name)}</span>`:''}
          <span style="color:var(--text3)">${g.name}</span>
          ${isPeriod?`<span style="background:#F1EFEA;color:#6b6b67;padding:0 4px;border-radius:3px;font-size:9px">📅 ${fd(dateStr)}</span>`:''}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <span style="font-size:11px;background:${t.turno==='tarde'?'#E6F1FB':'#FAEEDA'};color:${t.turno==='tarde'?'#0C447C':'#854F0B'};padding:2px 7px;border-radius:8px;font-weight:500">${turnoIcon} ${turnoLabel}</span>
        <span id="${pillId}" class="pill ${SM[effectiveStatus]?.c||SM['pending'].c}" style="font-size:10px">${SM[effectiveStatus]?.l||SM['pending'].l}</span>
        <span style="font-size:11px;color:var(--text2)">${periodo}</span>
        <div class="av" style="background:${ownerColor};color:#fff;font-size:9px;width:24px;height:24px" title="${esc(o.name||'')}">${o.initials||'?'}</div>
      </div>
    </div>`;
  }).join('');
}

function calNav(d){
  calM+=d;
  if(calM>11){calM=0;calY++;}
  else if(calM<0){calM=11;calY--;}
  loadDailyStatusForMonth(calY, calM).then(renderCalendar);
}

// Registra que o cliente desmarcou a agenda.
// Com período: desmarca só o dia informado. Dia único: desmarca a tarefa inteira.
async function desmarcarDia(id, dateStr){
  const t=allCalTasks.find(x=>x.id===id)||tasks.find(x=>x.id===id);
  if(!t)return;
  const isPeriod=hasPeriod(t);
  const quando=isPeriod?dateStr:(t.dateStart||t.date||'');

  if(!confirm(`Registrar que o cliente desmarcou a agenda${quando?' do dia '+fd(quando):''}?\n\n${isPeriod?'O dia sai do calendário':'A agenda sai do calendário'} e não conta como pendência do responsável.`))return;

  if(isPeriod&&dateStr){
    const resp=await api('POST','/task-daily-status',{taskId:id, date:dateStr, status:'cancel'});
    taskDailyStatus[id+'|'+dateStr]='cancel';
    if(resp?.taskStatus){
      allCalTasks=allCalTasks.map(x=>x.id===id?{...x,status:resp.taskStatus}:x);
      tasks=tasks.map(x=>x.id===id?{...x,status:resp.taskStatus}:x);
    }
  } else {
    // Dia único: o status da própria tarefa passa a "Cliente desmarcou"
    await api('PUT','/tasks/'+id,{...t,status:'cancel'});
    allCalTasks=allCalTasks.map(x=>x.id===id?{...x,status:'cancel'}:x);
    tasks=tasks.map(x=>x.id===id?{...x,status:'cancel'}:x);
  }
  renderCalendar();
  showToast('🚫 Agenda'+(quando?' de '+fd(quando):'')+' desmarcada pelo cliente','success');
}

async function toggleDoneCalTask(id, dateStr){
  const t=allCalTasks.find(x=>x.id===id)||tasks.find(x=>x.id===id);
  if(!t)return;

  const isPeriod=hasPeriod(t);

  if(isPeriod && dateStr){
    // ── Tarefa com período: alterna pendente ↔ realizado ──
    const current=getDailyStatus(id, dateStr)||'pending';
    const newStatus=current==='done'?'pending':'done';
    const isDone=newStatus==='done';
    const resp=await api('POST','/task-daily-status',{taskId:id, date:dateStr, status:newStatus});
    taskDailyStatus[id+'|'+dateStr]=newStatus;
    // O servidor sincroniza o status da tarefa quando todos os dias ficam concluídos
    if(resp?.taskStatus){
      allCalTasks=allCalTasks.map(x=>x.id===id?{...x,status:resp.taskStatus}:x);
      tasks=tasks.map(x=>x.id===id?{...x,status:resp.taskStatus}:x);
    }
    // Atualiza DOM cirurgicamente
    const checkId=`cal-check-${id}--${dateStr}`;
    const chk=document.getElementById(checkId);
    if(chk){
      chk.style.borderColor=isDone?'#3B6D11':'#ccc';
      chk.style.background=isDone?'#3B6D11':'transparent';
      chk.title=isDone?'Marcar como pendente':'Marcar como realizado';
      chk.innerHTML=isDone?'<svg width="10" height="10" viewBox="0 0 10 10"><polyline points="1.5,5 4,7.5 8.5,2" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>':'';
      const row=chk.closest('[data-task-id]');
      if(row) row.style.opacity=isDone?'.75':'1';
      const nameKey=`${id}--${dateStr}`;
      const name=document.querySelector(`[data-task-name="${nameKey}"]`);
      if(name){ name.style.textDecoration=isDone?'line-through':'none'; name.style.color=isDone?'var(--text3)':''; }
      const pill=document.getElementById(`cal-pill-${id}--${dateStr}`);
      if(pill){ pill.className='pill '+(isDone?SM['done'].c:SM['pending'].c); pill.textContent=isDone?SM['done'].l:SM['pending'].l; }
    }
    showToast(isDone?'✅ Realizado no dia '+fd(dateStr)+'!':'↩️ Desmarcado','success');
  } else {
    // ── Tarefa de dia único: comportamento original ──
    const newStatus=t.status==='done'?'pending':'done';
    const isDone=newStatus==='done';
    await api('PUT','/tasks/'+id,{...t,status:newStatus});
    if(allCalTasks.find(x=>x.id===id)) allCalTasks=allCalTasks.map(x=>x.id===id?{...x,status:newStatus}:x);
    if(tasks.find(x=>x.id===id)) tasks=tasks.map(x=>x.id===id?{...x,status:newStatus}:x);
    const chk=document.getElementById('cal-check-'+id);
    if(chk){
      chk.style.borderColor=isDone?'#3B6D11':'#ccc';
      chk.style.background=isDone?'#3B6D11':'transparent';
      chk.title=isDone?'Marcar como pendente':'Marcar como realizado';
      chk.innerHTML=isDone?'<svg width="10" height="10" viewBox="0 0 10 10"><polyline points="1.5,5 4,7.5 8.5,2" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>':'';
      const row=chk.closest('[data-task-id]');
      if(row) row.style.opacity=isDone?'.75':'1';
      const name=document.querySelector(`[data-task-name="${id}"]`);
      if(name){ name.style.textDecoration=isDone?'line-through':'none'; name.style.color=isDone?'var(--text3)':''; }
      const pill=document.getElementById('cal-pill-'+id);
      if(pill){ pill.className='pill '+(isDone?SM['done'].c:SM['pending'].c); pill.textContent=isDone?SM['done'].l:SM['pending'].l; }
    }
    showToast(isDone?'✅ Agenda marcada como realizada!':'↩️ Agenda desmarcada','success');
  }
}

// ── Users ──────────────────────────────────────────────────
function renderUsersTable(){
  const tb=$('users-tb');if(!tb)return;
  const isAdmin=currentUser?.perfil==='admin';
  tb.innerHTML=users.map(u=>{
    const perfilBadge=u.perfil==='admin'
      ?'<span style="font-size:10px;padding:2px 8px;border-radius:8px;font-weight:500;background:#EEEDFE;color:#3C3489">Administrador</span>'
      :'<span style="font-size:10px;padding:2px 8px;border-radius:8px;font-weight:500;background:#EAF3DE;color:#27500A">Responsável</span>';
    const ownerName=esc(ownerById(u.ownerId)?.name||'—');
    const activeSpan=`<span class="${u.active?'badge-active':'badge-inactive'}">${u.active?'Ativo':'Inativo'}</span>`;
    const editClick=isAdmin?`onclick="editUser('${u.id}')"`:'' ;
    // Ajuste 1: botão de exclusão só aparece se admin E o usuário alvo também for admin
    // Responsáveis nunca podem ser excluídos — apenas desativados
    const podeExcluir=isAdmin && u.perfil==='admin' && u.id!==currentUser?.id;
    const delBtn=podeExcluir
      ?`<button class="btn btn-red btn-sm" onclick="event.stopPropagation();deleteUser('${u.id}')" title="Excluir">×</button>`
      :(isAdmin&&u.perfil==='responsavel'
        ?'<span style="font-size:10px;color:var(--text3)" title="Responsáveis não podem ser excluídos — desative o acesso">🔒</span>'
        :'');
    return `<tr style="cursor:${isAdmin?'pointer':'default'}" ${editClick}>
      <td style="font-weight:500">${esc(u.name)}</td>
      <td style="color:var(--text2)">${esc(u.email||'')}</td>
      <td>${perfilBadge}</td>
      <td style="color:var(--text2)">${ownerName}</td>
      <td>${activeSpan}</td>
      <td style="text-align:center">${delBtn}</td>
    </tr>`;
  }).join('');
}

function userHTML(u){
  return `<div class="modal">
    <h3>${u?'Editar usuário':'Novo usuário'}</h3>
    <div class="f2">
      <div class="fr" style="flex:2"><label>Nome completo</label><input id="u-name" value="${esc(u?.name||'')}" placeholder="Ex: João Silva"/></div>
      <div class="fr"><label>Perfil de acesso</label><select id="u-perfil">
        <option value="admin"${u?.perfil==='admin'?' selected':''}>Administrador</option>
        <option value="responsavel"${(!u||u.perfil==='responsavel')?' selected':''}>Responsável</option>
      </select></div>
    </div>
    <div class="fr"><label>E-mail (usado para login)</label><input type="email" id="u-email" value="${esc(u?.email||'')}" placeholder="joao@empresa.com"/></div>
    <div class="fr"><label>${u?'Nova senha (deixe em branco para manter)':'Senha'}</label><input type="password" id="u-password" placeholder="••••••••"/></div>
    <div class="fr"><label>Responsável vinculado</label>
      <select id="u-owner">
        <option value="">— nenhum (apenas Administrador) —</option>
        ${owners.map(o=>`<option value="${o.id}"${u?.ownerId===o.id?' selected':''}>${esc(o.name)}</option>`).join('')}
      </select>
      <div style="font-size:10px;color:var(--text2);margin-top:3px">Vincule um responsável para que o usuário veja apenas suas próprias tarefas</div>
    </div>
    <div class="fr"><label>Status</label><select id="u-active">
      <option value="true"${u?.active!==false?' selected':''}>Ativo</option>
      <option value="false"${u?.active===false?' selected':''}>Inativo</option>
    </select></div>
    <div class="ma"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="saveUser()">Salvar usuário</button></div>
  </div>`;
}

function openUserModal(){editingUser=null;showModal(userHTML(null));}
function editUser(id){
  if(currentUser?.perfil!=='admin'){showToast('Apenas administradores podem editar usuários.','error');return;}
  const u=users.find(x=>x.id===id);if(!u)return;
  editingUser=id;showModal(userHTML(u));
}
async function saveUser(){
  const name=$('u-name').value.trim();if(!name)return;
  const email=$('u-email').value.trim();if(!email)return;
  const password=$('u-password').value;
  const body={name,email,perfil:$('u-perfil').value,ownerId:$('u-owner').value||null,active:$('u-active').value==='true'};
  if(password)body.password=password;
  if(editingUser){await api('PUT','/users/'+editingUser,body);}
  else{
    if(!password){showToast('Informe uma senha para o novo usuário.','error');return;}
    await api('POST','/users',body);
  }
  users=await api('GET','/users');
  closeModal();renderUsersTable();
  showToast(editingUser?'Usuário atualizado!':'Usuário criado!','success');
}
async function deleteUser(id){
  if(id===currentUser?.id){showToast('Você não pode excluir seu próprio usuário.','error');return;}
  // Ajuste 1: não permite excluir responsáveis
  const u=users.find(x=>x.id===id);
  if(u?.perfil==='responsavel'){showToast('Usuários com perfil Responsável não podem ser excluídos. Desative o acesso se necessário.','error');return;}
  if(!confirm('Excluir usuário?'))return;
  await api('DELETE','/users/'+id);
  users=users.filter(u=>u.id!==id);renderUsersTable();
}

// ── Ausências ───────────────────────────────────────────────
const AUSENCIA_TIPOS = {
  ferias:      { l: 'Férias',       icon: '🏖️', color: '#185FA5', bg: '#E6F1FB' },
  folga:       { l: 'Folga',        icon: '😴', color: '#3B6D11', bg: '#EAF3DE' },
  afastamento: { l: 'Afastamento',  icon: '🏥', color: '#993556', bg: '#FBEAF0' },
  evento:      { l: 'Evento',       icon: '📅', color: '#BA7517', bg: '#FAEEDA' }
};

let editingAusencia=null;

function renderAusenciasTable(){
  const tb=$('ausencias-tb');if(!tb)return;
  const isAdmin=currentUser?.perfil==='admin';
  const sorted=ausencias.slice().sort((a,b)=>a.dateStart.localeCompare(b.dateStart));
  tb.innerHTML=sorted.map(a=>{
    const o=ownerById(a.ownerId);
    const tipo=AUSENCIA_TIPOS[a.tipo]||AUSENCIA_TIPOS.ferias;
    const dias=calcDias(a.dateStart,a.dateEnd);
    return `<tr style="cursor:${isAdmin?'pointer':'default'}" ${isAdmin?`onclick="editAusencia('${a.id}')"`:''}">
      <td><div style="display:flex;align-items:center;gap:6px">${ownerAvatar(o)}<span>${esc(o.name||'—')}</span></div></td>
      <td><span style="font-size:11px;padding:2px 8px;border-radius:8px;font-weight:500;background:${tipo.bg};color:${tipo.color}">${tipo.icon} ${tipo.l}</span></td>
      <td class="dc">${fd(a.dateStart)}</td>
      <td class="dc">${fd(a.dateEnd)}</td>
      <td style="text-align:center;font-weight:500">${dias}</td>
      <td style="color:var(--text2);font-size:12px">${esc(a.obs||'')}</td>
      <td><button class="btn btn-red btn-sm" onclick="event.stopPropagation();deleteAusencia('${a.id}')">×</button></td>
    </tr>`;
  }).join('')||'<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px">Nenhuma ausência cadastrada</td></tr>';
}

function calcDias(start,end){
  if(!start||!end)return '—';
  const d1=new Date(start),d2=new Date(end);
  return Math.round((d2-d1)/86400000)+1+'d';
}

function ausenciaHTML(a){
  return `<div class="modal" style="max-width:440px">
    <h3>${a?'Editar ausência':'Nova ausência'}</h3>
    <div class="f2">
      <div class="fr" style="flex:2"><label>Responsável</label>
        <select id="aus-owner">
          <option value="">— selecione —</option>
          ${owners.filter(o=>o.active).map(o=>`<option value="${o.id}"${a?.ownerId===o.id?' selected':''}>${esc(o.name)}</option>`).join('')}
        </select>
      </div>
      <div class="fr"><label>Tipo</label>
        <select id="aus-tipo">
          ${Object.entries(AUSENCIA_TIPOS).map(([k,v])=>`<option value="${k}"${(a?.tipo||'ferias')===k?' selected':''}>${v.icon} ${v.l}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="f2">
      <div class="fr"><label>Data início</label><input type="date" id="aus-start" value="${a?.dateStart||''}"/></div>
      <div class="fr"><label>Data fim</label><input type="date" id="aus-end" value="${a?.dateEnd||''}"/></div>
    </div>
    <div class="fr"><label>Observação (opcional)</label><textarea id="aus-obs" placeholder="Ex: Férias programadas, afastamento médico...">${esc(a?.obs||'')}</textarea></div>
    <div class="ma"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="saveAusencia()">Salvar</button></div>
  </div>`;
}

function openAusenciaModal(){
  if(currentUser?.perfil!=='admin'){showToast('Apenas Administradores podem cadastrar ausências.','error');return;}
  editingAusencia=null;showModal(ausenciaHTML(null));
}
function editAusencia(id){
  if(currentUser?.perfil!=='admin'){showToast('Apenas Administradores podem editar ausências.','error');return;}
  const a=ausencias.find(x=>x.id===id);if(!a)return;
  editingAusencia=id;showModal(ausenciaHTML(a));
}
async function saveAusencia(){
  const ownerId=$('aus-owner').value;
  const dateStart=$('aus-start').value;
  const dateEnd=$('aus-end').value;
  if(!ownerId)return showToast('Selecione um responsável.','error');
  if(!dateStart||!dateEnd)return showToast('Informe o período.','error');
  if(dateEnd<dateStart)return showToast('A data fim deve ser maior ou igual à data início.','error');
  const body={ownerId,tipo:$('aus-tipo').value,dateStart,dateEnd,obs:$('aus-obs').value};
  if(editingAusencia){await api('PUT','/ausencias/'+editingAusencia,body);}
  else{await api('POST','/ausencias',body);}
  ausencias=await api('GET','/ausencias');
  closeModal();renderAusenciasTable();
  showToast(editingAusencia?'Ausência atualizada!':'Ausência cadastrada!','success');
}
async function deleteAusencia(id){
  if(!canDelete())return;
  if(!confirm('Excluir ausência?'))return;
  await api('DELETE','/ausencias/'+id);
  ausencias=ausencias.filter(a=>a.id!==id);renderAusenciasTable();
}

// Verifica se responsável está ausente em um período
function checkAusencia(ownerId, dateStart, dateEnd){
  if(!ownerId||!dateStart)return null;
  const end=dateEnd||dateStart;
  return ausencias.find(a=>
    a.ownerId===ownerId &&
    a.dateStart<=end && a.dateEnd>=dateStart
  );
}
// ── Agendas por Projeto ────────────────────────────────────
function renderAgendasProj(){
  const MONTHS=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const content=$('agendas-proj-content');if(!content)return;
  const yearSel=$('agp-filter-year');
  const projSel=$('agp-filter-proj');
  if(yearSel&&!yearSel.value){
    const years=[...new Set(allCalTasks.map(t=>(t.dateStart||t.date||'').slice(0,4)).filter(Boolean))].sort().reverse();
    if(!years.length)years.push(new Date().getFullYear().toString());
    yearSel.innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join('');
    yearSel.value=years[0];
  }
  if(projSel&&projSel.children.length<=1){
    projSel.innerHTML='<option value="">Todos projetos</option>'+projects.filter(p=>p.qtdAgendas>0||allCalTasks.some(t=>t.projId===p.id)).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
  }
  const curYear=yearSel?.value||new Date().getFullYear().toString();
  const filterProj=projSel?.value||'';
  const yearTasks=allCalTasks.filter(t=>(t.dateStart||t.date||'').startsWith(curYear));
  const projList=filterProj?projects.filter(p=>p.id===filterProj):projects.filter(p=>p.qtdAgendas>0||yearTasks.some(t=>t.projId===p.id));
  let html='';
  projList.forEach(proj=>{
    const projTasks=yearTasks.filter(t=>t.projId===proj.id);
    if(!projTasks.length&&!proj.qtdAgendas)return;
    const contratadas=proj.qtdAgendas||0;
    const realizadas=projTasks.filter(t=>t.status==='done').length;
    const total=projTasks.length;
    const pct=total?Math.round(realizadas/total*100):0;
    const pctCtrt=contratadas?Math.round(realizadas/contratadas*100):0;
    const color=pct>=100?'#3B6D11':pct>=50?'#BA7517':'#A32D2D';
    const cli=clientById(proj.clientId);
    html+=`<div class="card-table" style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:0.5px solid var(--border)">
        <div style="width:10px;height:10px;border-radius:3px;background:${proj.color};flex-shrink:0"></div>
        <div style="font-size:13px;font-weight:500">${esc(proj.name)}</div>
        ${cli.name?`<span style="font-size:11px;color:var(--text2)">${esc(cli.name)}</span>`:''}
        <div style="margin-left:auto;font-size:11px;color:var(--text2)">${realizadas} realizadas · ${contratadas} contratadas</div>
      </div>
      <div style="display:flex;padding:12px 16px;align-items:center;flex-wrap:wrap;gap:24px">
        <div style="text-align:center"><div style="font-size:22px;font-weight:600">${total}</div><div style="font-size:10px;color:var(--text2)">Agendadas</div></div>
        <div style="text-align:center"><div style="font-size:22px;font-weight:600;color:#185FA5">${contratadas}</div><div style="font-size:10px;color:#185FA5">Contratadas</div></div>
        <div style="text-align:center"><div style="font-size:22px;font-weight:600;color:#3B6D11">${realizadas}</div><div style="font-size:10px;color:#3B6D11">Realizadas</div></div>
        <div style="text-align:center;flex:1">
          <div style="font-size:22px;font-weight:600;color:${color}">${pct}%</div>
          <div style="font-size:10px;color:var(--text2)">% Realizado</div>
          <div style="height:5px;background:var(--bg);border-radius:3px;margin-top:5px"><div style="height:100%;background:${color};width:${Math.min(pct,100)}%;border-radius:3px"></div></div>
        </div>
        ${contratadas?`<div style="text-align:center;flex:1">
          <div style="font-size:22px;font-weight:600;color:${pctCtrt>=100?'#3B6D11':pctCtrt>=50?'#BA7517':'#A32D2D'}">${pctCtrt}%</div>
          <div style="font-size:10px;color:var(--text2)">Realiz./Contrat.</div>
          <div style="height:5px;background:var(--bg);border-radius:3px;margin-top:5px"><div style="height:100%;background:${pctCtrt>=100?'#3B6D11':pctCtrt>=50?'#BA7517':'#A32D2D'};width:${Math.min(pctCtrt,100)}%;border-radius:3px"></div></div>
        </div>`:''}
      </div>
    </div>`;
  });
  content.innerHTML=html||'<div style="padding:20px;text-align:center;color:var(--text3)">Nenhum projeto com agendas encontrado.</div>';
}

// ── Agendas por Responsável ────────────────────────────────
function renderAgendasOwner(){
  const MONTHS=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const content=$('agendas-owner-content');if(!content)return;
  const yearSel=$('ago-filter-year');
  const ownerSel=$('ago-filter-owner');
  const monthSel=$('ago-filter-month');
  if(yearSel&&!yearSel.value){
    const years=[...new Set(allCalTasks.map(t=>(t.dateStart||t.date||'').slice(0,4)).filter(Boolean))].sort().reverse();
    if(!years.length)years.push(new Date().getFullYear().toString());
    yearSel.innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join('');
    yearSel.value=years[0];
  }
  if(ownerSel&&ownerSel.children.length<=1){
    ownerSel.innerHTML='<option value="">Todos responsáveis</option>'+owners.filter(o=>o.active!==false).map(o=>`<option value="${o.id}">${esc(o.name)}</option>`).join('');
  }
  const curYear=yearSel?.value||new Date().getFullYear().toString();
  const filterOwner=ownerSel?.value||'';
  const filterMonth=monthSel?.value!==''&&monthSel?.value!=null?+monthSel.value:-1;
  const yearTasks=allCalTasks.filter(t=>(t.dateStart||t.date||'').startsWith(curYear));
  const ownerList=filterOwner?owners.filter(o=>o.id===filterOwner):owners.filter(o=>o.active!==false);
  let html='';
  ownerList.forEach(owner=>{
    const ownerTasks=yearTasks.filter(t=>t.ownerId===owner.id);
    if(!ownerTasks.length)return;
    const byMonth={};for(let m=0;m<12;m++)byMonth[m]=[];
    ownerTasks.forEach(t=>{const d=t.dateStart||t.date||'';if(d){const m=+d.slice(5,7)-1;byMonth[m].push(t);}});
    const monthRows=MONTHS.map((mName,mi)=>{
      if(filterMonth>=0&&mi!==filterMonth)return null;
      const mTasks=byMonth[mi];if(!mTasks.length)return null;
      const realizadas=mTasks.filter(t=>t.status==='done').length;
      const total=mTasks.length;
      const pct=Math.round(realizadas/total*100);
      const color=pct>=100?'#3B6D11':pct>=50?'#BA7517':'#A32D2D';
      return `<tr>
        <td style="padding:6px 10px;font-size:12px;color:var(--text2)">${mName}</td>
        <td style="padding:6px 10px;font-size:12px;text-align:center">${total}</td>
        <td style="padding:6px 10px;font-size:12px;text-align:center;color:#3B6D11;font-weight:500">${realizadas}</td>
        <td style="padding:6px 10px;font-size:12px;text-align:center">
          <span style="font-size:11px;font-weight:500;color:${color}">${pct}%</span>
          <div style="height:3px;background:var(--bg);border-radius:2px;margin-top:3px;width:60px;display:inline-block"><div style="height:100%;background:${color};width:${Math.min(pct,100)}%;border-radius:2px"></div></div>
        </td>
      </tr>`;
    }).filter(Boolean);
    if(!monthRows.length)return;
    const totalRealizadas=ownerTasks.filter(t=>t.status==='done').length;
    html+=`<div class="card-table" style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:0.5px solid var(--border)">
        <div class="av" style="background:${owner.color||'#888'};color:#fff;font-size:10px;width:26px;height:26px">${owner.initials||'?'}</div>
        <div style="font-size:13px;font-weight:500">${esc(owner.name)}</div>
        <div style="margin-left:auto;font-size:11px;color:var(--text2)">${totalRealizadas} de ${ownerTasks.length} realizadas em ${curYear}</div>
      </div>
      <table style="width:100%">
        <thead><tr style="background:var(--surface2)">
          <th style="padding:6px 10px;font-size:11px;text-align:left;font-weight:500;color:var(--text2)">Mês</th>
          <th style="padding:6px 10px;font-size:11px;text-align:center;font-weight:500;color:var(--text2)">Agendadas</th>
          <th style="padding:6px 10px;font-size:11px;text-align:center;font-weight:500;color:#3B6D11">Realizadas</th>
          <th style="padding:6px 10px;font-size:11px;text-align:center;font-weight:500;color:var(--text2)">% Realizado</th>
        </tr></thead>
        <tbody>${monthRows.join('')}</tbody>
      </table>
    </div>`;
  });
  content.innerHTML=html||'<div style="padding:20px;text-align:center;color:var(--text3)">Nenhuma agenda encontrada.</div>';
}

// ── Dashboard de Agendas ───────────────────────────────────
function renderAgendaDash(){
  const MONTHS=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const content=$('agenda-dash-content');if(!content)return;

  // ── Ano ──
  const anoSel=$('adash-ano');
  if(anoSel){
    const years=[...new Set(allCalTasks.map(t=>(t.dateStart||t.date||'').slice(0,4)).filter(Boolean))].sort().reverse();
    if(!years.length)years.push(new Date().getFullYear().toString());
    if(!anoSel.value||anoSel.innerHTML.trim()===''){
      anoSel.innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join('');
      anoSel.value=new Date().getFullYear().toString();
      if(!years.includes(anoSel.value))anoSel.value=years[0];
    }
  }
  const curYear=anoSel?.value||new Date().getFullYear().toString();

  // ── Mês (padrão: mês atual) ──
  const mesSel=$('adash-mes');
  if(mesSel&&mesSel.value===''&&!mesSel._defaultSet){
    mesSel.value=String(new Date().getMonth());
    mesSel._defaultSet=true;
  }
  const filterMes=mesSel?.value!==''&&mesSel?.value!=null?+mesSel.value:-1;

  const yearTasks=allCalTasks.filter(t=>(t.dateStart||t.date||'').startsWith(curYear));
  const filteredTasks=filterMes>=0
    ?yearTasks.filter(t=>{const d=t.dateStart||t.date||'';return d&&+d.slice(5,7)-1===filterMes;})
    :yearTasks;

  const total=filteredTasks.length;
  const realizadas=filteredTasks.filter(t=>t.status==='done').length;
  const pendentes=total-realizadas;
  const pctGeral=total?Math.round(realizadas/total*100):0;
  const pctColor=pctGeral>=100?'var(--green)':pctGeral>=50?'var(--amber)':'var(--red)';

  // ── Cards ──
  const cardsHtml=`
    <div class="sbar" style="margin-bottom:16px">
      <div class="sc flex1"><div class="slabel">Total Agendadas</div><div class="sval blue">${total}</div></div>
      <div class="sc flex1"><div class="slabel">Realizadas</div><div class="sval green">${realizadas}</div></div>
      <div class="sc flex1"><div class="slabel">Pendentes</div><div class="sval amber">${pendentes}</div></div>
      <div class="sc flex1">
        <div class="slabel">% Realizado</div>
        <div class="sval" style="color:${pctColor}">${pctGeral}%</div>
        <div class="pbar"><div style="height:3px;background:${pctColor};width:${Math.min(pctGeral,100)}%;border-radius:2px"></div></div>
      </div>
    </div>`;

  // ── Gráfico por mês (apenas se filtro = todos os meses) ──
  let chartHtml='';
  if(filterMes<0){
    const byMonth=Array.from({length:12},(_,i)=>{
      const mTasks=yearTasks.filter(t=>{const d=t.dateStart||t.date||'';return d&&+d.slice(5,7)-1===i;});
      return{label:MONTHS[i].slice(0,3),total:mTasks.length,realizadas:mTasks.filter(t=>t.status==='done').length};
    });
    const maxVal=Math.max(...byMonth.map(m=>m.total),1);
    const barW=52; const gap=8; const chartH=120; const padL=28; const padB=22;
    const totalW=padL+(barW+gap)*12+gap;
    const bars=byMonth.map((m,i)=>{
      const x=padL+gap+(barW+gap)*i;
      const hTotal=Math.round((m.total/maxVal)*chartH);
      const hReal=m.total?Math.round((m.realizadas/m.total)*hTotal):0;
      const yTotal=chartH-hTotal; const yReal=chartH-hReal;
      const pct=m.total?Math.round(m.realizadas/m.total*100):0;
      const curMes=i===new Date().getMonth()&&curYear===String(new Date().getFullYear());
      return `<g>
        ${m.total?`<rect x="${x}" y="${yTotal}" width="${barW}" height="${hTotal}" rx="3" fill="#B5D4F4" opacity="${curMes?1:.7}"/>`:''}
        ${m.realizadas?`<rect x="${x}" y="${yReal}" width="${barW}" height="${hReal}" rx="3" fill="#3B6D11" opacity="${curMes?1:.8}"/>`:''}
        ${m.total?`<text x="${x+barW/2}" y="${yTotal-3}" text-anchor="middle" font-size="9" fill="#185FA5" font-weight="500">${m.total}</text>`:''}
        ${m.realizadas&&m.total?`<text x="${x+barW/2}" y="${yReal-3}" text-anchor="middle" font-size="9" fill="#3B6D11">${pct}%</text>`:''}
        <text x="${x+barW/2}" y="${chartH+padB-8}" text-anchor="middle" font-size="9" fill="${curMes?'#185FA5':'var(--text2)'}" font-weight="${curMes?'600':'400'}">${m.label}</text>
      </g>`;
    }).join('');
    // Eixo Y
    const yLines=[0,.25,.5,.75,1].map(p=>{
      const y=Math.round(chartH-p*chartH);
      const v=Math.round(p*maxVal);
      return `<line x1="${padL}" y1="${y}" x2="${totalW}" y2="${y}" stroke="var(--border)" stroke-width="0.5"/>
        <text x="${padL-4}" y="${y+3}" text-anchor="end" font-size="8" fill="var(--text3)">${v}</text>`;
    }).join('');
    chartHtml=`<div class="card-table" style="margin-bottom:16px;padding:16px">
      <div style="font-size:12px;font-weight:500;margin-bottom:12px;display:flex;align-items:center;gap:12px">
        Agendas por Mês — ${curYear}
        <div style="display:flex;align-items:center;gap:8px;margin-left:auto">
          <div style="display:flex;align-items:center;gap:4px"><div style="width:10px;height:10px;border-radius:2px;background:#B5D4F4"></div><span style="font-size:10px;color:var(--text2)">Agendadas</span></div>
          <div style="display:flex;align-items:center;gap:4px"><div style="width:10px;height:10px;border-radius:2px;background:#3B6D11"></div><span style="font-size:10px;color:var(--text2)">Realizadas</span></div>
        </div>
      </div>
      <div style="overflow-x:auto">
        <svg viewBox="0 0 ${totalW} ${chartH+padB}" width="${totalW}" height="${chartH+padB}" style="display:block;min-width:${totalW}px">
          ${yLines}${bars}
        </svg>
      </div>
    </div>`;
  }

  // ── Tabela por responsável ──
  const ownerRows=owners.filter(o=>o.active!==false).map(o=>{
    const oTasks=filteredTasks.filter(t=>t.ownerId===o.id);
    if(!oTasks.length)return null;
    const oReal=oTasks.filter(t=>t.status==='done').length;
    const oPct=Math.round(oReal/oTasks.length*100);
    const barColor=oPct>=100?'#3B6D11':oPct>=50?'#BA7517':'#A32D2D';
    return{name:o.name,initials:o.initials||'?',color:o.color||'#888',total:oTasks.length,realizadas:oReal,pct:oPct,barColor};
  }).filter(Boolean).sort((a,b)=>b.total-a.total);

  const tableHtml=ownerRows.length?`
    <div class="card-table">
      <div style="padding:10px 14px;border-bottom:0.5px solid var(--border);font-size:12px;font-weight:500">Por Responsável</div>
      <table style="width:100%">
        <thead><tr style="background:var(--surface2)">
          <th style="padding:7px 12px;font-size:10px;text-align:left;font-weight:500;color:var(--text2)">Responsável</th>
          <th style="padding:7px 12px;font-size:10px;text-align:center;font-weight:500;color:#185FA5">Agendadas</th>
          <th style="padding:7px 12px;font-size:10px;text-align:center;font-weight:500;color:#3B6D11">Realizadas</th>
          <th style="padding:7px 12px;font-size:10px;text-align:left;font-weight:500;color:var(--text2);min-width:160px">% Realizado</th>
        </tr></thead>
        <tbody>
          ${ownerRows.map(r=>`<tr style="border-bottom:0.5px solid var(--border)">
            <td style="padding:7px 12px">
              <div style="display:flex;align-items:center;gap:7px">
                <div class="av" style="background:${r.color};color:#fff;font-size:9px;width:22px;height:22px">${r.initials}</div>
                <span style="font-size:12px">${esc(r.name)}</span>
              </div>
            </td>
            <td style="padding:7px 12px;text-align:center;font-size:13px;font-weight:500;color:#185FA5">${r.total}</td>
            <td style="padding:7px 12px;text-align:center;font-size:13px;font-weight:500;color:#3B6D11">${r.realizadas}</td>
            <td style="padding:7px 12px">
              <div style="display:flex;align-items:center;gap:8px">
                <div style="flex:1;height:6px;background:var(--bg);border-radius:3px;overflow:hidden">
                  <div style="height:100%;background:${r.barColor};width:${Math.min(r.pct,100)}%;border-radius:3px;transition:width .3s"></div>
                </div>
                <span style="font-size:11px;font-weight:600;color:${r.barColor};min-width:34px;text-align:right">${r.pct}%</span>
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`
    :'<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px">Nenhuma agenda encontrada para o período.</div>';

  content.innerHTML=cardsHtml+chartHtml+tableHtml;
}


function renderAgendasCtrl(){
  const MONTHS=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const content=$('agendas-ctrl-content');if(!content)return;

  // ── Ano ──
  const yearSel=$('ag-filter-year');
  if(yearSel){
    const years=[...new Set(allCalTasks.map(t=>(t.dateStart||t.date||'').slice(0,4)).filter(Boolean))].sort().reverse();
    if(!years.length) years.push(new Date().getFullYear().toString());
    if(!yearSel.value||yearSel.innerHTML.trim()===''){
      yearSel.innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join('');
      yearSel.value=years[0];
    }
  }
  const curYear=yearSel?.value||new Date().getFullYear().toString();

  // ── Tab ativo ──
  const activeTab=$('ag-tab-active')||'owner';
  const tab=typeof activeTab==='string'?activeTab:(activeTab?.dataset?.tab||'owner');

  // ── Filtro responsável ──
  const ownerSel=$('ag-filter-owner');
  if(ownerSel&&ownerSel.children.length<=1){
    ownerSel.innerHTML='<option value="">Todos responsáveis</option>'+owners.filter(o=>o.active!==false).map(o=>`<option value="${o.id}">${esc(o.name)}</option>`).join('');
  }
  const filterOwner=ownerSel?.value||'';

  // ── Filtro projeto ──
  const projSel=$('ag-filter-proj');
  if(projSel&&projSel.children.length<=1){
    projSel.innerHTML='<option value="">Todos projetos</option>'+projects.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
  }
  const filterProj=projSel?.value||'';

  const yearTasks=allCalTasks.filter(t=>(t.dateStart||t.date||'').startsWith(curYear));

  // ── Filtro de mês ──
  const monthSel=$('ag-filter-month');
  const filterMonth=monthSel?.value!==''&&monthSel?.value!=null?+monthSel.value:-1;

  // ── Decide qual aba renderizar ──
  const currentTab=document.querySelector('.ag-tab.ag-tab-act')?.dataset?.tab||'owner';

  let html='';
  if(currentTab==='owner'){
    // ── TABELA POR RESPONSÁVEL ──
    const ownerList=filterOwner?owners.filter(o=>o.id===filterOwner):owners.filter(o=>o.active!==false);
    ownerList.forEach(owner=>{
      const ownerTasks=yearTasks.filter(t=>t.ownerId===owner.id);
      if(!ownerTasks.length)return;
      const byMonth={};for(let m=0;m<12;m++)byMonth[m]=[];
      ownerTasks.forEach(t=>{const d=t.dateStart||t.date||'';if(d){const m=+d.slice(5,7)-1;byMonth[m].push(t);}});
      const monthRows=MONTHS.map((mName,mi)=>{
        if(filterMonth>=0&&mi!==filterMonth)return null;
        const mTasks=byMonth[mi];if(!mTasks.length)return null;
        const realizadas=mTasks.filter(t=>t.status==='done').length;
        const total=mTasks.length;
        const pct=Math.round(realizadas/total*100);
        const color=pct>=100?'#3B6D11':pct>=50?'#BA7517':'#A32D2D';
        return `<tr>
          <td style="padding:6px 10px;font-size:12px;color:var(--text2)">${mName}</td>
          <td style="padding:6px 10px;font-size:12px;text-align:center">${total}</td>
          <td style="padding:6px 10px;font-size:12px;text-align:center;color:#3B6D11;font-weight:500">${realizadas}</td>
          <td style="padding:6px 10px;font-size:12px;text-align:center">
            <span style="font-size:11px;font-weight:500;color:${color}">${pct}%</span>
            <div style="height:3px;background:var(--bg);border-radius:2px;margin-top:3px;width:60px;display:inline-block"><div style="height:100%;background:${color};width:${Math.min(pct,100)}%;border-radius:2px"></div></div>
          </td>
        </tr>`;
      }).filter(Boolean);
      if(!monthRows.length)return;
      const totalRealizadas=ownerTasks.filter(t=>t.status==='done').length;
      html+=`<div class="card-table" style="margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:0.5px solid var(--border)">
          <div class="av" style="background:${owner.color||'#888'};color:#fff;font-size:10px;width:26px;height:26px">${owner.initials||'?'}</div>
          <div style="font-size:13px;font-weight:500">${esc(owner.name)}</div>
          <div style="margin-left:auto;font-size:11px;color:var(--text2)">${totalRealizadas} de ${ownerTasks.length} agendas realizadas em ${curYear}</div>
        </div>
        <table style="width:100%">
          <thead><tr style="background:var(--surface2)">
            <th style="padding:6px 10px;font-size:11px;text-align:left;font-weight:500;color:var(--text2)">Mês</th>
            <th style="padding:6px 10px;font-size:11px;text-align:center;font-weight:500;color:var(--text2)">Agendadas</th>
            <th style="padding:6px 10px;font-size:11px;text-align:center;font-weight:500;color:#3B6D11">Realizadas</th>
            <th style="padding:6px 10px;font-size:11px;text-align:center;font-weight:500;color:var(--text2)">% Realizado</th>
          </tr></thead>
          <tbody>${monthRows.join('')}</tbody>
        </table>
      </div>`;
    });
    if(!html) html='<div style="padding:20px;text-align:center;color:var(--text3)">Nenhuma agenda encontrada para o período.</div>';
  } else {
    // ── TABELA POR PROJETO ──
    const projList=filterProj?projects.filter(p=>p.id===filterProj):projects.filter(p=>p.qtdAgendas>0||yearTasks.some(t=>t.projId===p.id));
    projList.forEach(proj=>{
      const projTasks=yearTasks.filter(t=>t.projId===proj.id);
      if(!projTasks.length&&!proj.qtdAgendas)return;
      const contratadas=proj.qtdAgendas||0;
      const realizadas=projTasks.filter(t=>t.status==='done').length;
      const total=projTasks.length;
      const pct=total?Math.round(realizadas/total*100):0;
      const pctCtrt=contratadas?Math.round(realizadas/contratadas*100):0;
      const color=pct>=100?'#3B6D11':pct>=50?'#BA7517':'#A32D2D';
      const cli=clientById(proj.clientId);
      html+=`<div class="card-table" style="margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:0.5px solid var(--border)">
          <div style="width:10px;height:10px;border-radius:3px;background:${proj.color};flex-shrink:0"></div>
          <div style="font-size:13px;font-weight:500">${esc(proj.name)}</div>
          ${cli.name?`<span style="font-size:11px;color:var(--text2)">${esc(cli.name)}</span>`:''}
          <div style="margin-left:auto;font-size:11px;color:var(--text2)">${realizadas} realizadas · ${contratadas} contratadas em ${curYear}</div>
        </div>
        <div style="display:flex;gap:0;padding:12px 16px;align-items:center;flex-wrap:wrap;gap:20px">
          <div style="text-align:center">
            <div style="font-size:22px;font-weight:600;color:var(--text)">${total}</div>
            <div style="font-size:10px;color:var(--text2)">Agendadas</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:22px;font-weight:600;color:#185FA5">${contratadas}</div>
            <div style="font-size:10px;color:#185FA5">Contratadas</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:22px;font-weight:600;color:#3B6D11">${realizadas}</div>
            <div style="font-size:10px;color:#3B6D11">Realizadas</div>
          </div>
          <div style="text-align:center;flex:1">
            <div style="font-size:22px;font-weight:600;color:${color}">${pct}%</div>
            <div style="font-size:10px;color:var(--text2)">% Realizado</div>
            <div style="height:5px;background:var(--bg);border-radius:3px;margin-top:5px"><div style="height:100%;background:${color};width:${Math.min(pct,100)}%;border-radius:3px"></div></div>
          </div>
          ${contratadas?`<div style="text-align:center;flex:1">
            <div style="font-size:22px;font-weight:600;color:${pctCtrt>=100?'#3B6D11':pctCtrt>=50?'#BA7517':'#A32D2D'}">${pctCtrt}%</div>
            <div style="font-size:10px;color:var(--text2)">Realiz. / Contrat.</div>
            <div style="height:5px;background:var(--bg);border-radius:3px;margin-top:5px"><div style="height:100%;background:${pctCtrt>=100?'#3B6D11':pctCtrt>=50?'#BA7517':'#A32D2D'};width:${Math.min(pctCtrt,100)}%;border-radius:3px"></div></div>
          </div>`:''}
        </div>
      </div>`;
    });
    if(!html) html='<div style="padding:20px;text-align:center;color:var(--text3)">Nenhum projeto com agendas encontrado.</div>';
  }

  content.innerHTML=html;
  // Rola body para o topo após render
  window.scrollTo(0,0);
  document.body.scrollTop=0;
  document.documentElement.scrollTop=0;
  document.querySelector('.content')?.scrollTo(0,0);
  setTimeout(()=>{
    window.scrollTo(0,0);
    document.body.scrollTop=0;
    document.documentElement.scrollTop=0;
    document.querySelector('.content')?.scrollTo(0,0);
  },10);
  setTimeout(()=>{
    window.scrollTo(0,0);
    document.body.scrollTop=0;
    document.documentElement.scrollTop=0;
    document.querySelector('.content')?.scrollTo(0,0);
  },300);
}

// funções de agendas separadas mantidas para compatibilidade
function switchAgTab(tab){ renderAgendasOwner(); }

function goPage(p){
  closeModal();
  closeSidebarMobile();
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.ni').forEach(x=>x.classList.remove('act'));
  document.getElementById('page-'+p)?.classList.add('active');
  document.getElementById('ni-'+p)?.classList.add('act');
  // Bloqueia qualquer scroll no .content pelos próximos 300ms
  const c=document.querySelector('.content');
  if(c){
    c.scrollTop=0;
    let blocking=true;
    const blocker=()=>{ if(blocking) c.scrollTop=0; };
    c.addEventListener('scroll',blocker);
    setTimeout(()=>{ blocking=false; c.removeEventListener('scroll',blocker); },500);
  }
  if(p==='clients')  renderClientsTable();
  if(p==='products') renderProductsTable();
  if(p==='owners')   renderOwnersTable();
  if(p==='sellers')  renderSellersTable();
  if(p==='templates')renderTemplates();
  if(p==='users')    renderUsersTable();
  if(p==='ausencias')renderAusenciasTable();
  if(p==='agenda-dash'){
    if(allCalTasks.length){
      const as=$('adash-ano');if(as)as.innerHTML='';
      const ms=$('adash-mes');if(ms)ms._defaultSet=false;
      renderAgendaDash();
    } else {
      const ct=$('agenda-dash-content');
      if(ct)ct.innerHTML='<div style="padding:40px;text-align:center;color:var(--text3)">⏳ Carregando...</div>';
      loadAllTasksForCal().then(()=>{
        const as=$('adash-ano');if(as)as.innerHTML='';
        const ms=$('adash-mes');if(ms)ms._defaultSet=false;
        renderAgendaDash();
      });
    }
  }
  if(p==='projects') renderProjGrid();
  if(p==='notif'){loadAllTasksForCal().then(renderNotifs);}
  if(p==='cal'){loadAllTasksForCal().then(renderCalendar);}
  if(p==='dashboard-resp'){
    initDashResp();
    loadDashResp();
  }
  if(p==='metas'){ loadMetas(); }
  if(p==='privacidade'){ loadPrivacidade(); }
  if(p==='audit'){
    initAudit();
    loadAudit(1);
  }
  if(p==='dashboard'){
    initDashboard();
    loadDashboard();
  }
  if(p==='relatorios'){
    if(!allCalTasks.length) loadAllTasksForCal();
    initRelatorios();
  }
}
function switchView(v,el){
  document.querySelectorAll('.vt').forEach(t=>t.classList.remove('act'));el.classList.add('act');
  $('view-tbl').style.display=v==='tbl'?'block':'none';
  $('view-kan').style.display=v==='kan'?'block':'none';
}

function switchView(v,el){
  document.querySelectorAll('.vt').forEach(t=>t.classList.remove('act'));el.classList.add('act');
  $('view-tbl').style.display=v==='tbl'?'block':'none';
  $('view-kan').style.display=v==='kan'?'block':'none';
  $('view-cmt').style.display=v==='cmt'?'block':'none';
  if(v==='cmt') initComentarios();
}

// ── Aba de Comentários ─────────────────────────────────────
function initComentarios(){
  // Popula filtro de responsáveis
  const sel=$('cmt-fil-owner');
  if(sel && sel.options.length<=1){
    const usados=new Set(tasks.map(t=>t.ownerId).filter(Boolean));
    owners.filter(o=>usados.has(o.id)).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))
      .forEach(o=>{ const opt=document.createElement('option'); opt.value=o.id; opt.text=o.name; sel.appendChild(opt); });
  }
  renderComentarios();
}

function renderComentarios(){
  const feed=$('cmt-feed'); if(!feed)return;
  const filOwner=$('cmt-fil-owner')?.value||'';
  const filDias=parseInt($('cmt-fil-periodo')?.value||'0');
  const corte=filDias?new Date(Date.now()-filDias*86400000):null;

  // Coleta todos os comentários de todas as tarefas do projeto ativo
  const itens=[];
  tasks.forEach(t=>{
    if(!t.comments?.length)return;
    t.comments.forEach(c=>{
      if(filOwner&&t.ownerId!==filOwner)return;
      const dt=c.time?new Date(c.time.split('/').reverse().join('-').replace(' ','\n').replace('\n',' ')):null;
      const dtMs=dt?.getTime()||0;
      if(corte&&dtMs&&dt<corte)return;
      itens.push({tarefa:t.name,tarefaId:t.id,ownerId:t.ownerId,
        autor:c.author||'—',texto:c.text||'',data:dt,timeStr:c.time||''});
    });
  });
  itens.sort((a,b)=>(b.data||0)-(a.data||0));

  const total=$('cmt-total');
  if(total)total.textContent=itens.length+' comentário'+(itens.length!==1?'s':'');

  if(!itens.length){
    feed.innerHTML='<div style="padding:30px;text-align:center;color:var(--text3);font-size:12px">Nenhum comentário encontrado para os filtros.</div>';
    return;
  }

  const proj=projects.find(p=>p.id===activeProj);
  const cli=proj?clients.find(c=>c.id===proj.clientId):null;

  feed.innerHTML=itens.map(item=>{
    const owner=owners.find(o=>o.id===item.ownerId);
    return `<div class="cmt-card" style="background:var(--surface);border:0.5px solid var(--border);border-radius:var(--r-lg);padding:13px 15px;margin-bottom:9px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:9px">
        ${ownerAvatar(owner)}
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:500">${esc(item.autor)}</div>
          <div style="font-size:10px;color:var(--text2);margin-top:1px">
            em <strong>${esc(item.tarefa)}</strong>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0">
          ${item.timeStr?`<span style="font-size:11px;color:var(--text);font-weight:500;background:var(--surface2);border:0.5px solid var(--border);border-radius:6px;padding:2px 7px">📅 ${esc(item.timeStr)}</span>`:''}
          <button class="btn btn-sm" onclick="openEditTask('${item.tarefaId}')" style="font-size:10px;padding:2px 8px">Ver tarefa</button>
        </div>
      </div>
      <div style="font-size:12px;line-height:1.55;color:var(--text);padding-left:32px;white-space:pre-wrap;border-left:2px solid var(--border);margin-left:32px;padding-left:10px">${esc(item.texto)}</div>
    </div>`;
  }).join('');
}

function exportarComentariosPDF(){
  const feed=$('cmt-feed');
  if(!feed||!feed.children.length){ showToast('Nenhum comentário para exportar','error'); return; }

  const proj=projects.find(p=>p.id===activeProj);
  const cli=proj?clients.find(c=>c.id===proj.clientId):null;
  const total=$('cmt-total')?.textContent||'';
  const filPer=$('cmt-fil-periodo');
  const filOwner=$('cmt-fil-owner');
  const perLabel=filPer?.options[filPer.selectedIndex]?.text||'Todo o período';
  const ownerLabel=filOwner?.value?(owners.find(o=>o.id===filOwner.value)?.name||''):'Todos os responsáveis';
  const data=new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});

  // Injeta cabeçalho do PDF
  let hdr=$('cmt-pdf-header');
  if(!hdr){ hdr=document.createElement('div'); hdr.id='cmt-pdf-header'; feed.prepend(hdr); }
  hdr.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px;padding-bottom:10px;border-bottom:1.5px solid #185FA5">
      <div>
        <div style="font-size:15px;font-weight:700;color:#185FA5">Relatório de Comentários — ${esc(proj?.name||'Projeto')}</div>
        ${cli?`<div style="font-size:11px;color:#555;margin-top:2px">Cliente: ${esc(cli.name)}</div>`:''}
        <div style="font-size:11px;color:#555;margin-top:2px">Solidez Soluções Empresariais</div>
      </div>
      <div style="text-align:right;font-size:10px;color:#888">
        <div>Emitido em ${data}</div>
        <div>Período: ${perLabel} · ${ownerLabel}</div>
        <div>${total}</div>
      </div>
    </div>`;

  // Estilo temporário para impressão
  const styleId='cmt-print-style';
  let styleEl=document.getElementById(styleId);
  if(!styleEl){ styleEl=document.createElement('style'); styleEl.id=styleId; document.head.appendChild(styleEl); }
  styleEl.textContent=`
    @media print {
      .topbar,.sidebar,.ph,.vtabs,.btn,#cmt-fil-owner,#cmt-fil-periodo,#cmt-total,
      #view-tbl,#view-kan,.sbar{display:none!important}
      .layout{display:block!important}
      .content{padding:0!important;overflow:visible!important}
      .page{display:none!important}
      #page-board{display:block!important}
      #view-cmt{display:block!important}
      #cmt-pdf-header{display:block!important}
      .cmt-card{break-inside:avoid;border:0.5px solid #ddd!important;background:#fff!important}
      body{background:#fff!important;color:#111!important}
      @page{size:A4 portrait;margin:15mm 12mm}
    }`;

  const content=document.querySelector('.content');
  const prev=content?.style.overflow||'';
  if(content)content.style.overflow='visible';

  setTimeout(()=>{
    window.print();
    setTimeout(()=>{
      if(content)content.style.overflow=prev;
      styleEl.textContent='';
      if(hdr)hdr.remove();
    },600);
  },150);
}

// ── Dashboard de Equipe ────────────────────────────────────
async function initDashResp(){
  const anoSel=$('dresp-ano');
  if(anoSel && !anoSel.options.length){
    const atual=new Date().getFullYear();
    [atual+1,atual,atual-1,atual-2].forEach(a=>{
      const o=document.createElement('option');
      o.value=a; o.text=a;
      if(a===atual)o.selected=true;
      anoSel.appendChild(o);
    });
  }
  const mesSel=$('dresp-mes');
  if(mesSel){
    const mesAtual=String(new Date().getMonth()+1).padStart(2,'0');
    mesSel.value=mesAtual;
  }
}

async function loadDashResp(){
  const box=$('dresp-content');if(!box)return;
  box.innerHTML='<div style="padding:40px;text-align:center;color:var(--text3)">Carregando…</div>';
  const ano=$('dresp-ano')?.value||new Date().getFullYear();
  const mes=$('dresp-mes')?.value||String(new Date().getMonth()+1).padStart(2,'0');
  try{
    const pm=await api('GET',`/metas/progresso?ano=${ano}&mes=${mes}`);
    renderDashResp(pm,ano,mes);
  }catch(e){
    box.innerHTML=`<div style="padding:40px;text-align:center;color:var(--red)">Erro: ${esc(e.message)}</div>`;
  }
}

// Detalhe de agendas realizadas de um responsável no mês
let dashRespDetalheAtivo='';
async function toggleDetalheResp(ownerId,nome,ano,mes){
  const boxId='dresp-detalhe-'+ownerId;
  const box=document.getElementById(boxId);if(!box)return;
  if(dashRespDetalheAtivo===ownerId){
    box.innerHTML=''; dashRespDetalheAtivo=''; return;
  }
  dashRespDetalheAtivo=ownerId;
  box.innerHTML='<div style="padding:8px;color:var(--text3);font-size:11px">Carregando agendas…</div>';
  try{
    const d=await api('GET',`/dashboard/detalhe-responsavel?ownerId=${ownerId}&ano=${ano}&mes=${mes}`);
    if(!d.projetos?.length){
      box.innerHTML='<div style="padding:10px 14px;font-size:11px;color:var(--text3)">Nenhuma agenda realizada em '+mes+'/'+ano+'.</div>';
      return;
    }
    box.innerHTML=`<div style="padding:10px 14px;border-top:0.5px solid var(--border)">
      <div style="font-size:11px;font-weight:500;margin-bottom:8px;color:var(--text2)">
        Agendas realizadas — ${esc(nome)} · ${mes}/${ano}
        <span style="font-weight:400">(${d.totalRealizado} no total)</span>
      </div>
      <table style="width:100%;font-size:11px;border-collapse:collapse">
        <thead><tr style="background:var(--surface2)">
          <th style="text-align:left;padding:5px 8px">Projeto</th>
          <th style="text-align:left;padding:5px 8px">Cliente</th>
          <th style="text-align:center;padding:5px 8px">Realizadas</th>
          <th style="text-align:center;padding:5px 8px">Agendadas</th>
        </tr></thead>
        <tbody>${d.projetos.map(p=>`<tr style="border-top:0.5px solid var(--border)">
          <td style="padding:5px 8px">${esc(p.projeto)}</td>
          <td style="padding:5px 8px;color:var(--text2)">${esc(p.cliente)||'—'}</td>
          <td style="text-align:center;padding:5px 8px;font-weight:600;color:var(--green)">${p.realizadas}</td>
          <td style="text-align:center;padding:5px 8px;color:var(--text2)">${p.agendadas}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
  }catch(e){ box.innerHTML=`<div style="padding:10px;color:var(--red);font-size:11px">Erro: ${esc(e.message)}</div>`; }
}

function renderDashResp(pm,ano,mes){
  const box=$('dresp-content');if(!box)return;
  const MES=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  if(!pm?.meta){
    box.innerHTML=`<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px">
      Nenhuma meta cadastrada para ${ano}.<br><br>
      <button class="btn btn-blue admin-only" onclick="goPage('metas')">Cadastrar meta →</button>
    </div>`;
    return;
  }

  if(!pm.progresso?.length){
    box.innerHTML='<div style="padding:30px;text-align:center;color:var(--text3);font-size:12px">Nenhum responsável vinculado à meta de '+ano+'.</div>';
    return;
  }

  const corBarra=r=>r.status==='atingiu'?'var(--green)':r.status==='andamento'?'var(--blue)':'var(--red)';
  const icone=r=>r.status==='atingiu'?'✅':r.status==='andamento'?'🔵':'🔴';
  const atingiram=pm.progresso.filter(r=>r.status==='atingiu').length;

  const resumo=`
    <div class="sbar" style="margin-bottom:14px">
      <div class="sc flex1"><div class="slabel">Responsáveis</div><div class="sval">${pm.progresso.length}</div></div>
      <div class="sc flex1"><div class="slabel">Meta mensal</div><div class="sval blue">${pm.meta.metaMensal}</div>
        <div style="font-size:10px;color:var(--text2);margin-top:2px">agendas/mês</div></div>
      <div class="sc flex1"><div class="slabel">Atingiram a meta</div>
        <div class="sval" style="color:${atingiram===pm.progresso.length?'var(--green)':'var(--amber)'}">${atingiram}</div>
        <div style="font-size:10px;color:var(--text2);margin-top:2px">de ${pm.progresso.length}</div></div>
      <div class="sc flex1"><div class="slabel">Período</div>
        <div style="font-size:16px;font-weight:700">${MES[+mes-1]}/${ano}</div></div>
    </div>`;

  const linhas=pm.progresso.map(r=>`
    <tr>
      <td><div style="display:flex;align-items:center;gap:7px">${ownerAvatar(r)}<span style="font-size:12px">${esc(r.nome)}</span></div></td>
      <td style="text-align:center">
        <button onclick="toggleDetalheResp('${r.id}','${esc(r.nome)}','${ano}','${mes}')"
          style="background:none;border:none;cursor:pointer;font-size:13px;font-weight:700;color:${corBarra(r)};text-decoration:underline;text-underline-offset:2px"
          title="Clique para ver as agendas realizadas">
          ${r.realizadas}
        </button>
      </td>
      <td style="text-align:center;color:var(--text2)">${r.meta}</td>
      <td>
        <div style="display:flex;align-items:center;gap:7px">
          <div style="flex:1;height:8px;background:var(--bg);border-radius:4px;overflow:hidden">
            <div style="height:100%;background:${corBarra(r)};width:${Math.min(r.pct,100)}%;border-radius:4px"></div>
          </div>
          <span style="font-size:11px;font-weight:600;color:${corBarra(r)};min-width:38px">${r.pct}%</span>
          <span>${icone(r)}</span>
        </div>
      </td>
    </tr>
    <tr><td colspan="4" style="padding:0"><div id="dresp-detalhe-${r.id}"></div></td></tr>`).join('');

  box.innerHTML=resumo+`
    <div class="card-table">
      <div style="padding:10px 16px;border-bottom:0.5px solid var(--border);font-size:12px;font-weight:500">
        🎯 Progresso individual — ${MES[+mes-1]}/${ano}
        <span style="font-size:10px;color:var(--text2);font-weight:400;margin-left:8px">Clique no número de realizadas para ver o detalhe</span>
      </div>
      <div class="tw"><table style="table-layout:fixed;width:100%">
        <thead><tr>
          <th style="width:35%">Responsável</th>
          <th style="width:13%;text-align:center">Realizadas 🔍</th>
          <th style="width:12%;text-align:center">Meta</th>
          <th style="width:40%">Progresso</th>
        </tr></thead>
        <tbody>${linhas}</tbody>
      </table></div>
    </div>`;
}

// ── Metas ──────────────────────────────────────────────────
let metasData = [];

async function loadMetas(){
  const box=$('metas-content');if(!box)return;
  box.innerHTML='<div style="padding:30px;text-align:center;color:var(--text3)">Carregando…</div>';
  try{
    metasData=await api('GET','/metas');
    renderMetas();
  }catch(e){
    box.innerHTML=`<div style="padding:30px;text-align:center;color:var(--red)">Erro: ${esc(e.message)}</div>`;
  }
}

function renderMetas(){
  const box=$('metas-content');if(!box)return;
  if(!metasData.length){
    box.innerHTML=`<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px">
      Nenhuma meta cadastrada.<br><br>
      <button class="btn btn-blue admin-only" onclick="abrirModalMeta(null)">+ Criar primeira meta</button>
    </div>`;
    return;
  }
  box.innerHTML=metasData.map(m=>`
    <div class="card-table" style="margin-bottom:14px">
      <div style="padding:12px 16px;border-bottom:0.5px solid var(--border);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <div>
          <div style="font-size:14px;font-weight:600">${m.ano}</div>
          <div style="font-size:11px;color:var(--text2)">Meta mensal: <strong>${m.metaMensal}</strong> agendas realizadas${m.obs?` · ${esc(m.obs)}`:''}</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:6px" class="admin-only">
          <button class="btn btn-sm" onclick="abrirModalMeta('${m.id}')">Editar</button>
          <button class="btn btn-red btn-sm" onclick="deletarMeta('${m.id}',${m.ano})">×</button>
        </div>
      </div>
      <div style="padding:12px 16px">
        <div style="font-size:11px;color:var(--text2);margin-bottom:8px">Responsáveis monitorados (${m.responsaveis.length}):</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${m.responsaveis.map(r=>`
            <div style="display:flex;align-items:center;gap:5px;background:var(--surface2);border-radius:20px;padding:3px 10px 3px 4px">
              ${ownerAvatar(r)}
              <span style="font-size:11px">${esc(r.nome)}</span>
            </div>`).join('')}
          ${!m.responsaveis.length?'<span style="font-size:11px;color:var(--text3)">Nenhum responsável vinculado</span>':''}
        </div>
      </div>
    </div>`).join('');
}

function abrirModalMeta(id){
  const m=id?metasData.find(x=>x.id===id):null;
  const anoAtual=new Date().getFullYear();
  const responsaveisCheck=owners.filter(o=>o.active!==false).map(o=>`
    <label style="display:flex;align-items:center;gap:7px;padding:5px 0;cursor:pointer;font-size:12px">
      <input type="checkbox" value="${o.id}" ${m?.responsaveis.some(r=>r.id===o.id)?'checked':''} style="width:14px;height:14px">
      ${ownerAvatar(o)} ${esc(o.name)}
    </label>`).join('');
  showModal(`<div class="modal-inner">
    <h3>${m?'Editar meta '+m.ano:'Nova meta anual'}</h3>
    <div class="f2">
      <div class="fr"><label>Ano</label>
        <input type="number" id="meta-ano" value="${m?.ano||anoAtual}" min="2024" max="2030" ${m?'readonly style="opacity:.6"':''}/>
      </div>
      <div class="fr"><label>Meta mensal (agendas)</label>
        <input type="number" id="meta-mensal" value="${m?.metaMensal||30}" min="1" max="999"/>
      </div>
    </div>
    <div class="fr"><label>Observação (opcional)</label>
      <input id="meta-obs" value="${esc(m?.obs||'')}" placeholder="Ex: válida para toda a equipe"/>
    </div>
    <div class="fr" style="flex-direction:column;align-items:flex-start">
      <label style="margin-bottom:8px">Responsáveis monitorados</label>
      <div style="max-height:220px;overflow-y:auto;width:100%;border:0.5px solid var(--border2);border-radius:var(--r-md);padding:8px 12px" id="meta-owners-list">
        ${responsaveisCheck}
      </div>
      <div style="margin-top:5px;display:flex;gap:8px">
        <button class="btn btn-sm" onclick="selecionarTodosMeta(true)">Selecionar todos</button>
        <button class="btn btn-sm" onclick="selecionarTodosMeta(false)">Desmarcar todos</button>
      </div>
    </div>
    <div class="ma">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-blue" onclick="salvarMeta('${id||''}')">Salvar meta</button>
    </div>
  </div>`);
}

function selecionarTodosMeta(sel){
  document.querySelectorAll('#meta-owners-list input[type=checkbox]').forEach(cb=>cb.checked=sel);
}

async function salvarMeta(id){
  const ano=$('meta-ano')?.value;
  const metaMensal=$('meta-mensal')?.value;
  const obs=$('meta-obs')?.value||'';
  const responsaveis=[...document.querySelectorAll('#meta-owners-list input:checked')].map(cb=>cb.value);
  if(!responsaveis.length){showToast('Selecione ao menos um responsável','error');return;}
  try{
    if(id){ await api('PUT','/metas/'+id,{metaMensal,obs,responsaveis}); }
    else   { await api('POST','/metas',{ano,metaMensal,obs,responsaveis}); }
    metasData=await api('GET','/metas');
    closeModal(); renderMetas();
    showToast('Meta salva','success');
  }catch(e){ if(!e.validacao) showToast('Erro: '+e.message,'error'); }
}

async function deletarMeta(id,ano){
  if(!confirm(`Excluir a meta de ${ano}? Esta ação não pode ser desfeita.`))return;
  try{
    await api('DELETE','/metas/'+id);
    metasData=await api('GET','/metas');
    renderMetas();
    showToast('Meta removida','success');
  }catch(e){ showDeleteError(e); }
}

// ── LGPD ───────────────────────────────────────────────────
async function loadPrivacidade(){
  const box=$('lgpd-admin');if(!box)return;
  // Ferramentas administrativas só para admin
  if(currentUser?.perfil!=='admin'){box.innerHTML='';return;}
  box.innerHTML='<div style="padding:20px;color:var(--text3);font-size:12px">Carregando dados de retenção…</div>';
  try{
    const d=await api('GET','/lgpd/retencao');
    renderLgpdAdmin(d);
  }catch(e){
    box.innerHTML=`<div style="padding:20px;color:var(--red);font-size:12px">Erro: ${esc(e.message)}</div>`;
  }
}

function renderLgpdAdmin(d){
  const box=$('lgpd-admin');if(!box)return;
  const vencidos=d.clientes||[];

  const linhas=vencidos.map(c=>`<tr>
    <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.nome)}</td>
    <td style="font-size:11px;color:var(--text2)">${esc(c.contato)||'—'}</td>
    <td style="font-size:11px;color:var(--text2)">${c.ultimaAtividade?fd(c.ultimaAtividade):'—'}</td>
    <td style="text-align:center;font-size:11px">${c.totalProjetos}</td>
    <td style="text-align:right">
      ${c.temDadosPessoais
        ? `<button class="btn btn-sm btn-red" onclick="anonimizarCliente('${c.id}','${esc(c.nome).replace(/'/g,"\\'")}')">Remover dados pessoais</button>`
        : '<span style="font-size:10px;color:var(--text3)">já anonimizado</span>'}
    </td>
  </tr>`).join('');

  box.innerHTML=`
    <div class="card-table" style="margin-bottom:14px;max-width:900px">
      <div style="padding:12px 16px;border-bottom:0.5px solid var(--border)">
        <div style="font-size:13px;font-weight:600;margin-bottom:3px">📤 Exportar dados de um titular</div>
        <div style="font-size:11px;color:var(--text2)">Gera um arquivo com tudo que o sistema guarda sobre a pessoa, para atender pedidos de acesso (art. 18).</div>
      </div>
      <div style="padding:14px 16px;display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
        <div style="flex:1;min-width:150px">
          <label style="display:block;font-size:10px;color:var(--text2);text-transform:uppercase;margin-bottom:3px">Tipo</label>
          <select id="lgpd-tipo" onchange="lgpdTrocaTipo()" style="width:100%;padding:6px 8px;border:0.5px solid var(--border2);border-radius:var(--r-md);background:var(--surface);color:var(--text);font-size:12px">
            <option value="cliente">Cliente</option>
            <option value="responsavel">Responsável</option>
          </select>
        </div>
        <div style="flex:2;min-width:200px">
          <label style="display:block;font-size:10px;color:var(--text2);text-transform:uppercase;margin-bottom:3px">Titular</label>
          <select id="lgpd-titular" style="width:100%;padding:6px 8px;border:0.5px solid var(--border2);border-radius:var(--r-md);background:var(--surface);color:var(--text);font-size:12px"></select>
        </div>
        <button class="btn btn-blue" onclick="exportarTitular()">⬇ Exportar</button>
      </div>
    </div>

    <div class="card-table" style="max-width:900px">
      <div style="padding:12px 16px;border-bottom:0.5px solid var(--border)">
        <div style="font-size:13px;font-weight:600;margin-bottom:3px">
          🗓️ Retenção — dados além de ${d.prazoAnos} anos
          <span class="pill ${vencidos.length?'s-pending':'s-done'}" style="font-size:9px;margin-left:6px">${vencidos.length}</span>
        </div>
        <div style="font-size:11px;color:var(--text2)">Clientes sem atividade desde ${fd(d.limite)}. Remover os dados pessoais mantém o histórico dos projetos.</div>
      </div>
      ${vencidos.length?`
        <div class="tw"><table style="table-layout:fixed;width:100%">
          <thead><tr>
            <th style="width:30%">Cliente</th>
            <th style="width:20%">Contato</th>
            <th style="width:16%">Última atividade</th>
            <th style="width:12%;text-align:center">Projetos</th>
            <th style="width:22%"></th>
          </tr></thead>
          <tbody>${linhas}</tbody>
        </table></div>`
      :'<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px">Nenhum cliente com dados além do prazo de retenção.</div>'}
    </div>`;

  lgpdTrocaTipo();
}

// Preenche a lista de titulares conforme o tipo escolhido
function lgpdTrocaTipo(){
  const tipo=$('lgpd-tipo')?.value||'cliente';
  const sel=$('lgpd-titular');if(!sel)return;
  const lista=tipo==='cliente'
    ? clients.slice().sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))
    : owners.filter(o=>o.active!==false).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  sel.innerHTML=lista.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');
}

async function exportarTitular(){
  const tipo=$('lgpd-tipo')?.value, id=$('lgpd-titular')?.value;
  if(!id){showToast('Selecione um titular','error');return;}
  try{
    const d=await api('GET',`/lgpd/titular/${tipo}/${id}`);
    // Baixa como arquivo JSON legível
    const nome=(d.titular?.razaoSocial||d.titular?.nome||'titular').replace(/[^\w\s-]/g,'').trim();
    const blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=`dados-${nome}-${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    showToast('✅ Dados exportados','success');
  }catch(e){ showToast('Erro ao exportar: '+e.message,'error'); }
}

async function anonimizarCliente(id,nome){
  if(!confirm(`Remover os dados pessoais do contato de "${nome}"?\n\nNome, cargo, telefone, e-mail e observações serão apagados.\nO histórico de projetos e tarefas é mantido.\n\nEsta ação não pode ser desfeita.`))return;
  try{
    await api('POST','/lgpd/anonimizar/'+id);
    clients=await api('GET','/clients');
    showToast('✅ Dados pessoais removidos','success');
    loadPrivacidade();
  }catch(e){ showToast('Erro: '+e.message,'error'); }
}

// ── Exportar Dashboard em PDF ─────────────────────────────
function exportarDashboardPDF(){
  const box=$('dash-content');
  if(!box||!box.innerHTML.trim()){
    showToast('Carregue o dashboard antes de exportar','error'); return;
  }

  // Cria cabeçalho dinâmico com filtros aplicados
  let filtros=[];
  const ano=$('dash-ano')?.value; if(ano)filtros.push('Ano: '+ano);
  const ownerTxt=$('dash-owner');
  if(ownerTxt?.value){
    const nome=ownerTxt.options[ownerTxt.selectedIndex]?.text;
    if(nome&&nome!=='Todos responsáveis')filtros.push('Responsável: '+nome);
  }
  const statusTxt=$('dash-status');
  if(statusTxt?.value){
    const st=statusTxt.options[statusTxt.selectedIndex]?.text;
    if(st&&st!=='Todas as situações')filtros.push('Situação: '+st);
  }
  const projTxt=$('dash-proj-txt')?.value;
  if(projTxt)filtros.push('Projeto: '+projTxt);

  const data=new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});

  // Insere (ou atualiza) o cabeçalho do PDF
  let hdr=$('pdf-header');
  if(!hdr){
    hdr=document.createElement('div');
    hdr.id='pdf-header';
    box.prepend(hdr);
  }
  hdr.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:flex-end">
      <div>
        <div style="font-size:16px;font-weight:700;color:#185FA5">TeamSolidez — Dashboard</div>
        <div style="font-size:11px;color:#666;margin-top:3px">Solidez Soluções Empresariais</div>
      </div>
      <div style="text-align:right;font-size:10px;color:#888">
        <div>Emitido em ${data}</div>
        ${filtros.length?'<div>Filtros: '+filtros.join(' · ')+'</div>':'<div>Todos os projetos</div>'}
      </div>
    </div>`;

  // Força orientação horizontal adicionando estilo temporário
  const styleId='print-landscape-force';
  let styleEl=document.getElementById(styleId);
  if(!styleEl){
    styleEl=document.createElement('style');
    styleEl.id=styleId;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent='@page{size:A4 landscape!important;margin:12mm 10mm!important;}';

  // Aguarda renderização e abre impressão
  setTimeout(()=>{
    // Remove qualquer scroll que possa cortar o conteúdo
    const content=document.querySelector('.content');
    const prev=content?.style.overflow||'';
    if(content)content.style.overflow='visible';
    window.print();
    // Restaura depois
    setTimeout(()=>{
      if(content)content.style.overflow=prev;
      styleEl.textContent='';
    },500);
  }, 150);
}

// ── Auditoria ──────────────────────────────────────────────
const AUD_ACOES = {
  criar:        { l:'Criou',          c:'s-done',     ic:'＋' },
  editar:       { l:'Editou',         c:'s-progress', ic:'✎'  },
  excluir:      { l:'Excluiu',        c:'s-cancel',   ic:'✕'  },
  login:        { l:'Entrou',         c:'s-na',       ic:'→'  },
  login_falhou: { l:'Login falhado',  c:'s-cancel',   ic:'⚠'  },
  exportar_lgpd:  { l:'Exportou dados (LGPD)', c:'s-progress', ic:'📤' },
  anonimizar_lgpd:{ l:'Removeu dados (LGPD)',  c:'s-cancel',   ic:'🗑' },
  logout:       { l:'Saiu',           c:'s-na',       ic:'←'  }
};
let audTimer=null;
function debounceAudit(){ clearTimeout(audTimer); audTimer=setTimeout(()=>loadAudit(1),400); }

function initAudit(){
  const sel=$('aud-user');
  if(sel && sel.options.length<=1){
    sel.innerHTML='<option value="">Todos usuários</option>'+
      users.map(u=>`<option value="${u.id}">${esc(u.name)}</option>`).join('');
  }
}

async function loadAudit(page=1){
  const box=$('aud-content');if(!box)return;
  box.innerHTML='<div style="padding:40px;text-align:center;color:var(--text3)">Carregando…</div>';
  const p=new URLSearchParams({page});
  const add=(k,id)=>{const v=$(id)?.value;if(v)p.set(k,v);};
  add('user','aud-user'); add('action','aud-action'); add('entity','aud-entity');
  add('de','aud-de'); add('ate','aud-ate'); add('q','aud-q');
  try{
    const [d,resumo]=await Promise.all([
      api('GET','/audit?'+p.toString()),
      api('GET','/audit/resumo').catch(()=>null)
    ]);
    renderAudit(d,resumo);
  }catch(e){
    box.innerHTML=`<div style="padding:40px;text-align:center;color:var(--red)">Erro: ${esc(e.message)}</div>`;
  }
}

function renderAudit(d,resumo){
  const box=$('aud-content');if(!box)return;

  const cards=resumo?`
    <div class="sbar" style="margin-bottom:14px">
      <div class="sc flex1"><div class="slabel">Registros hoje</div><div class="sval blue">${resumo.hoje}</div></div>
      <div class="sc flex1"><div class="slabel">Exclusões (30 dias)</div><div class="sval red">${resumo.exclusoes30d}</div></div>
      <div class="sc flex1"><div class="slabel">Logins falhados (7 dias)</div><div class="sval amber">${resumo.loginsFalhos7d}</div></div>
      <div class="sc flex1"><div class="slabel">Total no histórico</div><div class="sval">${resumo.total}</div></div>
    </div>`:'';

  if(!d.registros.length){
    box.innerHTML=cards+'<div style="padding:30px;text-align:center;color:var(--text3);font-size:12px">Nenhum registro encontrado para os filtros.</div>';
    return;
  }

  const linhas=d.registros.map(r=>{
    const a=AUD_ACOES[r.action]||{l:r.action,c:'s-na',ic:'•'};
    const dt=new Date(r.createdAt);
    const quando=dt.toLocaleDateString('pt-BR')+' '+dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    // Monta a lista de alterações "campo: antes → depois"
    let det='';
    if(r.changes&&Object.keys(r.changes).length){
      det=Object.entries(r.changes).map(([campo,v])=>
        `<div style="font-size:10px;color:var(--text2);margin-top:2px">
          <span style="font-weight:500">${esc(campo)}:</span>
          <span style="text-decoration:line-through;opacity:.6">${esc(v.de||'(vazio)')}</span>
          <span style="margin:0 3px">→</span>
          <span style="color:var(--text)">${esc(v.para||'(vazio)')}</span>
        </div>`).join('');
    }
    return `<tr>
      <td style="white-space:nowrap;font-size:11px;color:var(--text2)">${quando}</td>
      <td style="font-size:11px">${esc(r.userName||'—')}</td>
      <td><span class="pill ${a.c}" style="font-size:9px">${a.ic} ${a.l}</span></td>
      <td style="font-size:11px;color:var(--text2)">${esc(r.entity||'—')}</td>
      <td>
        <div style="font-size:12px">${esc(r.entityName||'—')}</div>
        ${det}
      </td>
      <td style="font-size:10px;color:var(--text3);white-space:nowrap">${esc(r.ip||'')}</td>
    </tr>`;
  }).join('');

  // Paginação
  const nav=d.paginas>1?`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 14px;border-top:0.5px solid var(--border)">
      <span style="font-size:11px;color:var(--text2)">${d.total} registro(s) · página ${d.page} de ${d.paginas}</span>
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm" ${d.page<=1?'disabled style="opacity:.4"':''} onclick="loadAudit(${d.page-1})">← Anterior</button>
        <button class="btn btn-sm" ${d.page>=d.paginas?'disabled style="opacity:.4"':''} onclick="loadAudit(${d.page+1})">Próxima →</button>
      </div>
    </div>`:`<div style="padding:9px 14px;border-top:0.5px solid var(--border);font-size:11px;color:var(--text2)">${d.total} registro(s)</div>`;

  box.innerHTML=cards+`
    <div class="card-table">
      <div class="tw"><table style="table-layout:fixed;width:100%">
        <thead><tr>
          <th style="width:13%">Data/Hora</th>
          <th style="width:14%">Usuário</th>
          <th style="width:12%">Ação</th>
          <th style="width:10%">Tipo</th>
          <th style="width:41%">Registro e alterações</th>
          <th style="width:10%">IP</th>
        </tr></thead>
        <tbody>${linhas}</tbody>
      </table></div>
      ${nav}
    </div>`;
}

// ── Dashboard ──────────────────────────────────────────────
function initDashboard(){
  const anoSel=$('dash-ano');
  if(anoSel && !anoSel.options.length){
    const atual=new Date().getFullYear();
    const anos=[atual+1,atual,atual-1,atual-2];
    anoSel.innerHTML='<option value="">Todos os anos</option>'+
      anos.map(a=>`<option value="${a}"${a===atual?' selected':''}>${a}</option>`).join('');
  }
  const ownerSel=$('dash-owner');
  if(ownerSel && ownerSel.options.length<=1){
    ownerSel.innerHTML='<option value="">Todos responsáveis</option>'+
      owners.filter(o=>o.active!==false).map(o=>`<option value="${o.id}">${esc(o.name)}</option>`).join('');
  }
  const dlp=$('dl-dash-projs');
  if(dlp && !dlp.innerHTML){
    dlp.innerHTML=projects.slice()
      .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))
      .map(p=>`<option value="${esc(p.name)}"></option>`).join('');
  }
}

// Autocomplete do filtro de projeto no dashboard
function onDashProjInput(){
  const txt=$('dash-proj-txt'), hid=$('dash-proj');
  if(!txt||!hid)return;
  const termo=txt.value.trim().toLowerCase();
  let achado=projects.find(p=>(p.name||'').toLowerCase()===termo);
  if(!achado&&termo){
    const parciais=projects.filter(p=>(p.name||'').toLowerCase().includes(termo));
    if(parciais.length===1)achado=parciais[0];
  }
  const anterior=hid.value;
  hid.value=achado?achado.id:'';
  txt.style.borderColor=termo&&!achado?'#F09595':'var(--border2)';
  if(anterior!==hid.value)loadDashboard();
}

function clearDashProj(){
  const txt=$('dash-proj-txt'), hid=$('dash-proj');
  if(txt){txt.value='';txt.style.borderColor='var(--border2)';}
  if(hid)hid.value='';
  loadDashboard();
  txt?.focus();
}

async function loadDashboard(){
  const box=$('dash-content');if(!box)return;
  box.innerHTML='<div style="padding:40px;text-align:center;color:var(--text3)">Carregando…</div>';
  const params=new URLSearchParams();
  const ano=$('dash-ano')?.value; if(ano)params.set('ano',ano);
  const own=$('dash-owner')?.value; if(own)params.set('ownerId',own);
  const st=$('dash-status')?.value; if(st)params.set('status',st);
  const pj=$('dash-proj')?.value; if(pj)params.set('projId',pj);
  try{
    const d=await api('GET','/dashboard?'+params.toString());
    renderDashboard(d);
  }catch(e){
    box.innerHTML=`<div style="padding:40px;text-align:center;color:var(--red)">Erro ao carregar: ${esc(e.message)}</div>`;
  }
}

let dashData=null;      // dados carregados do dashboard
let dashDetalheAtivo=''; // painel de detalhe aberto

// Abre (ou fecha) o painel com a lista de projetos do card clicado
function dashDetalhe(tipo){
  const box=$('dash-detalhe');
  if(!box||!dashData)return;
  // Clicar de novo no mesmo card fecha o painel
  if(dashDetalheAtivo===tipo){ box.innerHTML=''; dashDetalheAtivo=''; return; }
  dashDetalheAtivo=tipo;

  let lista=[], titulo='', vazio='';
  if(tipo==='atrasados'){
    lista=dashData.projetos.filter(p=>p.atrasado).sort((a,b)=>b.diasAtraso-a.diasAtraso);
    titulo='⚠️ Projetos atrasados';
    vazio='Nenhum projeto atrasado.';
  } else if(tipo==='desmarcadas'){
    lista=dashData.projetos.filter(p=>p.desmarcadas>0).sort((a,b)=>b.desmarcadas-a.desmarcadas);
    titulo='🚫 Projetos com agendas desmarcadas pelo cliente';
    vazio='Nenhuma agenda desmarcada.';
  } else if(tipo==='cancelados'){
    lista=dashData.projetos.filter(p=>p.situacao==='cancelado')
      .sort((a,b)=>(b.cancelDate||'').localeCompare(a.cancelDate||''));
    titulo='❌ Projetos cancelados';
    vazio='Nenhum projeto cancelado.';
  } else {
    lista=dashData.projetos.slice();
    titulo='📋 Todos os projetos';
    vazio='Nenhum projeto.';
  }

  if(!lista.length){
    box.innerHTML=`<div class="card-table" style="margin-bottom:14px;padding:20px;text-align:center;color:var(--text3);font-size:12px">${vazio}</div>`;
    return;
  }

  const linhas=lista.map(p=>{
    const st=PROJ_STATUS[p.situacao]||PROJ_STATUS.ativo;
    // Coluna de destaque muda conforme o tipo de detalhamento
    let destaque='';
    if(tipo==='atrasados'){
      destaque=`<td style="text-align:right;white-space:nowrap">
        <span style="color:var(--red);font-weight:600;font-size:12px">${p.diasAtraso} dia${p.diasAtraso===1?'':'s'}</span>
        <div style="font-size:10px;color:var(--text3)">prazo: ${fd(p.dateEnd)}</div></td>`;
    } else if(tipo==='desmarcadas'){
      destaque=`<td style="text-align:right;white-space:nowrap">
        <span style="color:var(--red);font-weight:600;font-size:13px">${p.desmarcadas}</span>
        <div style="font-size:10px;color:var(--text3)">desmarcada${p.desmarcadas===1?'':'s'}</div></td>`;
    } else if(tipo==='cancelados'){
      destaque=`<td style="text-align:right;white-space:nowrap">
        <span style="font-size:11px;color:var(--text2)">${p.cancelDate?fd(p.cancelDate):'—'}</span>
        <div style="font-size:10px;color:var(--text3)">${p.realizadas} de ${p.contratadas||p.agendadas} agendas</div></td>`;
    } else {
      destaque=`<td style="text-align:right;white-space:nowrap">
        <span style="font-weight:600;font-size:12px">${p.pct}%</span>
        <div style="font-size:10px;color:var(--text3)">${p.realizadas}/${p.contratadas||p.agendadas}</div></td>`;
    }
    return `<tr onclick="setProj('${p.id}');goPage('board')" style="cursor:pointer" title="Abrir o projeto">
      <td style="overflow:hidden;text-overflow:ellipsis">
        <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.nome)}</div>
        ${tipo==='cancelados'&&p.cancelReason?`<div style="font-size:10px;color:var(--text2);margin-top:2px;white-space:normal;line-height:1.3">${esc(p.cancelReason)}</div>`:''}
      </td>
      <td style="font-size:11px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.cliente)||'—'}</td>
      <td><span class="pill ${st.c}" style="font-size:9px">${st.l}</span></td>
      ${destaque}
    </tr>`;
  }).join('');

  box.innerHTML=`
    <div class="card-table" style="margin-bottom:14px">
      <div style="padding:10px 14px;border-bottom:0.5px solid var(--border);display:flex;align-items:center;gap:8px">
        <span style="font-size:12px;font-weight:500">${titulo}</span>
        <span style="font-size:11px;color:var(--text2)">(${lista.length})</span>
        <button class="btn btn-sm" style="margin-left:auto" onclick="dashDetalhe('${tipo}')">Fechar ×</button>
      </div>
      <div class="tw"><table style="table-layout:fixed;width:100%">
        <thead><tr>
          <th style="width:38%">Projeto</th>
          <th style="width:28%">Cliente</th>
          <th style="width:16%">Situação</th>
          <th style="width:18%;text-align:right">${tipo==='atrasados'?'Atraso':tipo==='desmarcadas'?'Qtd.':tipo==='cancelados'?'Cancelado em':'Realizado'}</th>
        </tr></thead>
        <tbody>${linhas}</tbody>
      </table></div>
    </div>`;
  box.scrollIntoView({behavior:'smooth',block:'nearest'});
}

async function renderDashboard(d){
  const box=$('dash-content');if(!box)return;
  dashData=d; dashDetalheAtivo='';
  const {resumo,projetos,evolucao}=d;
  const a=resumo.agendas, pr=resumo.projetos;
  const corPct=p=>p>=100?'var(--green)':p>=70?'var(--blue)':p>=40?'var(--amber)':'var(--red)';

  // ── Cards de resumo (alguns clicáveis, abrem detalhamento) ──
  const clicavel='cursor:pointer;transition:border-color .12s';
  const cards=`
    <div class="sbar" style="margin-bottom:14px">
      <div class="sc flex1" style="${clicavel}" onclick="dashDetalhe('todos')" title="Ver todos os projetos"
           onmouseover="this.style.borderColor='var(--border2)'" onmouseout="this.style.borderColor=''">
        <div class="slabel">Projetos 🔍</div><div class="sval">${pr.total}</div>
        <div style="font-size:10px;color:var(--text2);margin-top:2px">${pr.ativo} ativos · ${pr.concluido} concluídos</div></div>
      <div class="sc flex1"><div class="slabel">Agendas contratadas</div><div class="sval blue">${a.contratadas}</div></div>
      <div class="sc flex1"><div class="slabel">Agendas realizadas</div><div class="sval green">${a.realizadas}</div>
        <div style="font-size:10px;color:var(--text2);margin-top:2px">de ${a.agendadas} agendadas</div></div>
      <div class="sc flex1"><div class="slabel">Aproveitamento</div>
        <div class="sval" style="color:${corPct(a.pct)}">${a.pct}%</div>
        <div class="pbar"><div style="height:3px;background:${corPct(a.pct)};width:${Math.min(a.pct,100)}%;border-radius:2px"></div></div></div>
      <div class="sc flex1" style="${a.desmarcadas?clicavel:''}" ${a.desmarcadas?`onclick="dashDetalhe('desmarcadas')" title="Ver projetos com agendas desmarcadas"
           onmouseover="this.style.borderColor='var(--border2)'" onmouseout="this.style.borderColor=''"`:''}>
        <div class="slabel">Desmarcadas${a.desmarcadas?' 🔍':''}</div><div class="sval red">${a.desmarcadas}</div>
        <div style="font-size:10px;color:var(--text2);margin-top:2px">pelo cliente</div></div>
      <div class="sc flex1" style="${pr.atrasados?clicavel:''}" ${pr.atrasados?`onclick="dashDetalhe('atrasados')" title="Ver projetos atrasados"
           onmouseover="this.style.borderColor='var(--border2)'" onmouseout="this.style.borderColor=''"`:''}>
        <div class="slabel">Atrasados${pr.atrasados?' 🔍':''}</div><div class="sval amber">${pr.atrasados}</div>
        <div style="font-size:10px;color:var(--text2);margin-top:2px">fora do prazo</div></div>
      <div class="sc flex1" style="${pr.cancelado?clicavel:''}" ${pr.cancelado?`onclick="dashDetalhe('cancelados')" title="Ver projetos cancelados"
           onmouseover="this.style.borderColor='var(--border2)'" onmouseout="this.style.borderColor=''"`:''}>
        <div class="slabel">Cancelados${pr.cancelado?' 🔍':''}</div><div class="sval red">${pr.cancelado}</div>
        <div style="font-size:10px;color:var(--text2);margin-top:2px">projetos encerrados</div></div>
    </div>
    <div id="dash-detalhe"></div>`;

  // ── Gráfico de evolução mensal ──
  const MES=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  let grafico='';
  if(evolucao.length){
    const max=Math.max(...evolucao.map(e=>e.agendadas),1);
    const bw=44,gap=10,h=110,padL=30,padB=20;
    const w=padL+(bw+gap)*evolucao.length+gap;
    const barras=evolucao.map((e,i)=>{
      const x=padL+gap+(bw+gap)*i;
      const hA=Math.round(e.agendadas/max*h), hR=Math.round(e.realizadas/max*h);
      const pct=e.agendadas?Math.round(e.realizadas/e.agendadas*100):0;
      const [y,m]=e.mes.split('-');
      return `<g>
        <rect x="${x}" y="${h-hA}" width="${bw}" height="${hA}" rx="3" fill="#B5D4F4"/>
        ${hR?`<rect x="${x}" y="${h-hR}" width="${bw}" height="${hR}" rx="3" fill="#3B6D11"/>`:''}
        <text x="${x+bw/2}" y="${h-hA-4}" text-anchor="middle" font-size="9" fill="#185FA5" font-weight="500">${e.agendadas}</text>
        ${e.realizadas?`<text x="${x+bw/2}" y="${h-hR+11}" text-anchor="middle" font-size="8" fill="#fff" font-weight="600">${pct}%</text>`:''}
        <text x="${x+bw/2}" y="${h+padB-6}" text-anchor="middle" font-size="9" fill="var(--text2)">${MES[+m-1]}/${y.slice(2)}</text>
      </g>`;
    }).join('');
    const eixo=[0,.5,1].map(p=>{
      const y=Math.round(h-p*h);
      return `<line x1="${padL}" y1="${y}" x2="${w}" y2="${y}" stroke="var(--border)" stroke-width="0.5"/>
        <text x="${padL-5}" y="${y+3}" text-anchor="end" font-size="8" fill="var(--text3)">${Math.round(p*max)}</text>`;
    }).join('');
    grafico=`<div class="card-table" style="margin-bottom:14px;padding:14px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
        <div style="font-size:12px;font-weight:500">Evolução mensal de agendas</div>
        <div style="display:flex;gap:10px;margin-left:auto">
          <span style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text2)"><i style="width:9px;height:9px;border-radius:2px;background:#B5D4F4"></i>Agendadas</span>
          <span style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text2)"><i style="width:9px;height:9px;border-radius:2px;background:#3B6D11"></i>Realizadas</span>
        </div>
      </div>
      <div style="overflow-x:auto"><svg viewBox="0 0 ${w} ${h+padB}" width="${w}" height="${h+padB}" style="display:block;min-width:${w}px">${eixo}${barras}</svg></div>
    </div>`;
  }

  // ── Tabela comparativa por projeto ──
  const linhas=projetos.map(p=>{
    const st=PROJ_STATUS[p.situacao]||PROJ_STATUS.ativo;
    const tp=PROJ_TIPO[p.tipo]||PROJ_TIPO.implantacao;
    const excedeu=p.contratadas>0&&p.realizadas>p.contratadas;
    const cor=corPct(p.pct);
    return `<tr style="${p.situacao==='cancelado'?'opacity:.6':''}">
      <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(p.nome)}">${esc(p.nome)}</td>
      <td style="font-size:11px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(p.cliente)}">${esc(p.cliente)||'—'}</td>
      <td><span class="pill ${tp.c}" style="font-size:9px">${tp.l}</span></td>
      <td><span class="pill ${st.c}" style="font-size:9px">${st.l}</span></td>
      <td style="text-align:center;font-weight:500;color:#185FA5">${p.contratadas||'—'}</td>
      <td style="text-align:center">${p.agendadas}</td>
      <td style="text-align:center;font-weight:500;color:#3B6D11">${p.realizadas}</td>
      <td style="text-align:center;color:${p.desmarcadas?'var(--red)':'var(--text3)'}">${p.desmarcadas||'—'}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="flex:1;min-width:40px;height:6px;background:var(--bg);border-radius:3px;overflow:hidden">
            <div style="height:100%;background:${cor};width:${Math.min(p.pct,100)}%;border-radius:3px"></div>
          </div>
          <span style="font-size:11px;font-weight:600;color:${cor};white-space:nowrap">${p.pct}%</span>
          ${excedeu?'<span title="Realizadas acima do contratado" style="font-size:11px">⚠️</span>':''}
        </div>
      </td>
    </tr>`;
  }).join('');

  const tabela=projetos.length?`
    <div class="card-table">
      <div style="padding:10px 14px;border-bottom:0.5px solid var(--border);font-size:12px;font-weight:500">
        Agendas contratadas × realizadas por projeto
      </div>
      <div class="tw"><table style="table-layout:fixed;width:100%">
        <thead><tr>
          <th style="width:21%">Projeto</th>
          <th style="width:17%">Cliente</th>
          <th style="width:10%">Tipo</th>
          <th style="width:9%">Situação</th>
          <th style="width:7%;text-align:center" title="Agendas previstas no contrato">Contrat.</th>
          <th style="width:7%;text-align:center" title="Dias de agenda marcados">Agend.</th>
          <th style="width:7%;text-align:center" title="Dias de agenda efetivamente realizados">Realiz.</th>
          <th style="width:8%;text-align:center" title="Agendas desmarcadas pelo cliente">Desmarc.</th>
          <th style="width:14%" title="Realizadas ÷ Contratadas">% Realizado</th>
        </tr></thead>
        <tbody>${linhas}</tbody>
      </table></div>
    </div>`
    :'<div style="padding:30px;text-align:center;color:var(--text3);font-size:12px">Nenhum projeto encontrado para os filtros.</div>';


  let secaoMetas='';
    box.innerHTML=cards+secaoMetas+grafico+tabela;
}

// ── Relatórios ─────────────────────────────────────────────
const MESES_REL=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function initRelatorios(){
  // Popula anos e selects de todos os relatórios
  const thisYear=new Date().getFullYear();
  const years=[...new Set([
    ...(allCalTasks.length?allCalTasks:tasks).map(t=>(t.dateStart||t.date||'').slice(0,4)).filter(Boolean),
    ...tasks.map(t=>(t.date||'').slice(0,4)).filter(Boolean)
  ])].filter(Boolean).sort().reverse();
  if(!years.includes(String(thisYear))) years.unshift(String(thisYear));

  [1,2,3,4].forEach(n=>{
    const anoSel=$(`rel${n}-ano`);
    if(anoSel){
      anoSel.innerHTML=years.map(y=>`<option value="${y}"${y===String(thisYear)?' selected':''}>${y}</option>`).join('');
    }
    // Pré-seleciona mês atual via selected attribute (não via .value para evitar scroll do browser)
    const mesSel=$(`rel${n}-mes`);
    if(mesSel){
      const curMes=String(new Date().getMonth());
      Array.from(mesSel.options).forEach(opt=>{ opt.selected=(opt.value===curMes); });
    }
  });

  // Owners
  const ownerOpts='<option value="">Todos</option>'+owners.filter(o=>o.active!==false).map(o=>`<option value="${o.id}">${esc(o.name)}</option>`).join('');
  ['rel1-owner','rel2-owner','rel4-owner'].forEach(id=>{ const s=$(id); if(s) s.innerHTML=ownerOpts; });

  // Projetos
  const projOpts='<option value="">Todos</option>'+projects.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
  ['rel1-proj','rel3-proj','rel4-proj'].forEach(id=>{ const s=$(id); if(s) s.innerHTML=projOpts; });
}

// Utilitários SheetJS
function xlsxDownload(wb, filename){
  if(!window.XLSX){ showToast('❌ Biblioteca Excel não carregada','error'); return; }
  window.XLSX.writeFile(wb, filename);
}
function xlsxWB(){ return window.XLSX.utils.book_new(); }
function xlsxSheet(data){ return window.XLSX.utils.aoa_to_sheet(data); }
function xlsxAppend(wb,ws,name){ window.XLSX.utils.book_append_sheet(wb,ws,name); }

function relPeriodFilter(t, mesSel, anoSel, dateField){
  const dateRef=t[dateField]||t.dateStart||t.date||'';
  if(!dateRef) return false;
  const [y,m]=dateRef.split('-');
  const ano=anoSel?.value||'';
  const mes=mesSel?.value;
  if(ano && y!==ano) return false;
  if(mes!==''&&mes!=null && +m-1!==+mes) return false;
  return true;
}

// ── Rel 1: Tarefas por Status ──────────────────────────────
async function exportRel1(){
  const mesSel=$('rel1-mes'), anoSel=$('rel1-ano');
  const filterOwner=$('rel1-owner')?.value||'';
  const filterProj=$('rel1-proj')?.value||'';
  // Usa allCalTasks (todas as tarefas), carregando se necessário
  if(!allCalTasks.length) await loadAllTasksForCal();
  const src=allCalTasks;

  const filtered=src.filter(t=>{
    if(filterOwner && t.ownerId!==filterOwner) return false;
    if(filterProj && t.projId!==filterProj) return false;
    return relPeriodFilter(t, mesSel, anoSel, 'date');
  });

  if(!filtered.length){ showToast('Nenhuma tarefa encontrada para o filtro','error'); return; }

  const header=['Tarefa','Status','Grupo','Responsável','Prioridade','Prazo','Data Início','Data Fim','Projeto','Cliente','Turno'];
  const rows=filtered.map(t=>{
    const proj=projects.find(p=>p.id===t.projId)||{};
    const cli=clientById(proj.clientId);
    return [
      t.name,
      SM[t.status]?.l||t.status,
      GROUPS[t.group]?.name||'',
      ownerById(t.ownerId)?.name||'',
      PM[t.priority]?.l||t.priority||'',
      fd(t.date)||'',
      fd(t.dateStart)||'',
      fd(t.dateEnd)||'',
      proj.name||'',
      cli?.name||'',
      t.turno==='tarde'?'Tarde':'Manhã'
    ];
  });

  const wb=xlsxWB();
  xlsxAppend(wb, xlsxSheet([header,...rows]), 'Tarefas');
  const mesLabel=mesSel?.value!==''?MESES_REL[+mesSel.value]:'Todos';
  xlsxDownload(wb, `tarefas_status_${mesLabel}_${anoSel?.value||'geral'}.xlsx`);
  showToast('✅ Relatório exportado!','success');
}

// ── Rel 2: Agendas por Responsável ────────────────────────
async function exportRel2(){
  const mesSel=$('rel2-mes'), anoSel=$('rel2-ano');
  const filterOwner=$('rel2-owner')?.value||'';
  const ano=anoSel?.value||String(new Date().getFullYear());
  const mes=mesSel?.value;

  if(!allCalTasks.length) await loadAllTasksForCal();
  const monthStr=mes!==''&&mes!=null?`${ano}-${String(+mes+1).padStart(2,'0')}`:null;
  if(monthStr) await loadDailyStatusForMonth(+ano, +mes);

  const agendas=allCalTasks.filter(t=>{
    if(filterOwner && t.ownerId!==filterOwner) return false;
    return relPeriodFilter(t, mesSel, anoSel, 'dateStart');
  });

  if(!agendas.length){ showToast('Nenhuma agenda encontrada para o filtro','error'); return; }

  const wb=xlsxWB();
  const ownerList=filterOwner
    ?owners.filter(o=>o.id===filterOwner)
    :owners.filter(o=>o.active!==false&&agendas.some(t=>t.ownerId===o.id));

  // ── Aba Resumo ──
  const headerRes=['Responsável','Qtd Tarefas','Dias Agendados','Dias Realizados','Dias Pendentes','% Realizado'];
  const rowsRes=ownerList.map(owner=>{
    const ownerTasks=agendas.filter(t=>t.ownerId===owner.id);
    let diasAgendados=0, realizados=0;
    ownerTasks.forEach(t=>{
      if(hasPeriod(t)){
        const start=new Date(t.dateStart+'T00:00:00');
        const end=new Date(t.dateEnd+'T00:00:00');
        for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
          const dow=d.getDay(); if(dow===0||dow===6) continue;
          const dateStr=d.toISOString().slice(0,10);
          const _fer=getFeriadosAno(dateStr.slice(0,4));
          if(_fer&&_fer[dateStr]) continue; // feriado ignorado
          const sd=getDailyStatus(t.id,dateStr);
          if(sd==='cancel') continue;
          diasAgendados++;
          if(sd==='done') realizados++;
        }
      } else {
        diasAgendados++;
        if(t.status==='done') realizados++;
      }
    });
    const pendentes=diasAgendados-realizados;
    const pct=diasAgendados>0?Math.round(realizados/diasAgendados*100):0;
    return [owner.name, ownerTasks.length, diasAgendados, realizados, pendentes, pct+'%'];
  }).filter(r=>r[1]>0);
  if(rowsRes.length) xlsxAppend(wb, xlsxSheet([headerRes,...rowsRes]), 'Resumo');

  // ── Abas por responsável ──
  ownerList.forEach(owner=>{
    const ownerTasks=agendas.filter(t=>t.ownerId===owner.id);
    if(!ownerTasks.length) return;
    const header=['Tarefa','Projeto','Cliente','Data Início','Data Fim','Dia','Status do Dia','Turno'];
    const rows=[];
    ownerTasks.forEach(t=>{
      const proj=projects.find(p=>p.id===t.projId)||{};
      const cli=clientById(proj.clientId);
      const isPeriod=hasPeriod(t);
      if(isPeriod){
        const start=new Date(t.dateStart+'T00:00:00');
        const end=new Date(t.dateEnd+'T00:00:00');
        for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
          const dateStr=d.toISOString().slice(0,10);
          const dow=d.getDay(); if(dow===0||dow===6) continue;
          const ds=getDailyStatus(t.id,dateStr)||'pending';
          rows.push([t.name,proj.name||'',cli?.name||'',fd(t.dateStart),fd(t.dateEnd),fd(dateStr),SM[ds]?.l||ds,t.turno==='tarde'?'Tarde':'Manhã']);
        }
      } else {
        rows.push([t.name,proj.name||'',cli?.name||'',fd(t.dateStart||t.date),'',fd(t.dateStart||t.date),SM[t.status]?.l||t.status,t.turno==='tarde'?'Tarde':'Manhã']);
      }
    });
    if(rows.length){
      const sheetName=(owner.initials||owner.name||'Owner').slice(0,28);
      xlsxAppend(wb, xlsxSheet([header,...rows]), sheetName);
    }
  });

  if(!wb.SheetNames?.length){ showToast('Nenhum dado para exportar','error'); return; }
  const mesLabel=mes!==''&&mes!=null?MESES_REL[+mes]:'Todos';
  xlsxDownload(wb, `agendas_responsavel_${mesLabel}_${ano}.xlsx`);
  showToast('✅ Relatório exportado!','success');
}

// ── Rel 3: Agendas por Projeto (contratadas x realizadas) ─
async function exportRel3(){
  const mesSel=$('rel3-mes'), anoSel=$('rel3-ano');
  const filterProj=$('rel3-proj')?.value||'';
  const ano=anoSel?.value||String(new Date().getFullYear());
  const mes=mesSel?.value;

  if(!allCalTasks.length) await loadAllTasksForCal();
  const monthStr=mes!==''&&mes!=null?`${ano}-${String(+mes+1).padStart(2,'0')}`:null;
  if(monthStr) await loadDailyStatusForMonth(+ano, +mes);

  const agendas=allCalTasks.filter(t=>{
    if(filterProj && t.projId!==filterProj) return false;
    return relPeriodFilter(t, mesSel, anoSel, 'dateStart');
  });

  const projList=filterProj
    ?projects.filter(p=>p.id===filterProj)
    :projects.filter(p=>agendas.some(t=>t.projId===p.id)||p.qtdAgendas>0);

  if(!projList.length){ showToast('Nenhum projeto encontrado para o filtro','error'); return; }

  // Aba resumo
  const headerRes=['Projeto','Cliente','Contratadas','Agendadas','Realizadas','Pendentes','% Realizado'];
  const rowsRes=projList.map(proj=>{
    const cli=clientById(proj.clientId);
    const pTasks=agendas.filter(t=>t.projId===proj.id);
    let realizadas=0;
    pTasks.forEach(t=>{
      if(hasPeriod(t)){
        const start=new Date(t.dateStart+'T00:00:00');
        const end=new Date(t.dateEnd+'T00:00:00');
        for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
          const dow=d.getDay(); if(dow===0||dow===6) continue;
          const dateStr=d.toISOString().slice(0,10);
          const _fer2=getFeriadosAno(dateStr.slice(0,4));
          if(_fer2&&_fer2[dateStr]) continue; // feriado
          if(getDailyStatus(t.id,dateStr)==='done') realizadas++;
        }
      } else {
        if(t.status==='done') realizadas++;
      }
    });
    const contratadas=proj.qtdAgendas||0;
    const agendadas=pTasks.length;
    const pendentes=agendadas-realizadas;
    const pct=agendadas>0?Math.round(realizadas/agendadas*100):0;
    return [proj.name||'', cli?.name||'', contratadas, agendadas, realizadas, pendentes, pct+'%'];
  });

  // Aba detalhes
  const headerDet=['Projeto','Cliente','Tarefa','Responsável','Data Início','Data Fim','Dia','Status do Dia','Turno'];
  const rowsDet=[];
  projList.forEach(proj=>{
    const cli=clientById(proj.clientId);
    const pTasks=agendas.filter(t=>t.projId===proj.id);
    pTasks.forEach(t=>{
      const owner=ownerById(t.ownerId);
      if(hasPeriod(t)){
        const start=new Date(t.dateStart+'T00:00:00');
        const end=new Date(t.dateEnd+'T00:00:00');
        for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
          const dow=d.getDay(); if(dow===0||dow===6) continue;
          const dateStr=d.toISOString().slice(0,10);
          const ds=getDailyStatus(t.id,dateStr)||'pending';
          rowsDet.push([proj.name||'', cli?.name||'', t.name, owner?.name||'', fd(t.dateStart), fd(t.dateEnd), fd(dateStr), SM[ds]?.l||ds, t.turno==='tarde'?'Tarde':'Manhã']);
        }
      } else {
        rowsDet.push([proj.name||'', cli?.name||'', t.name, owner?.name||'', fd(t.dateStart||t.date), '', fd(t.dateStart||t.date), SM[t.status]?.l||t.status, t.turno==='tarde'?'Tarde':'Manhã']);
      }
    });
  });

  const wb=xlsxWB();
  xlsxAppend(wb, xlsxSheet([headerRes,...rowsRes]), 'Resumo');
  if(rowsDet.length) xlsxAppend(wb, xlsxSheet([headerDet,...rowsDet]), 'Detalhes');
  const mesLabel=mes!==''&&mes!=null?MESES_REL[+mes]:'Todos';
  xlsxDownload(wb, `agendas_projeto_${mesLabel}_${ano}.xlsx`);
  showToast('✅ Relatório exportado!','success');
}

// ── Rel 4: Tarefas Realizadas + Comentários ───────────────
async function exportRel4(){
  const mesSel=$('rel4-mes'), anoSel=$('rel4-ano');
  const filterOwner=$('rel4-owner')?.value||'';
  const filterProj=$('rel4-proj')?.value||'';
  // Usa allCalTasks (todas as tarefas), carregando se necessário
  if(!allCalTasks.length) await loadAllTasksForCal();
  const src=allCalTasks;

  const filtered=src.filter(t=>{
    if(filterOwner && t.ownerId!==filterOwner) return false;
    if(filterProj && t.projId!==filterProj) return false;
    const dateRef=t.date||t.dateStart||t.dateEnd||'';
    if(!dateRef) return false;
    const [y,m]=dateRef.split('-');
    const ano=anoSel?.value||'';
    const mes=mesSel?.value;
    if(ano && y!==ano) return false;
    if(mes!==''&&mes!=null && +m-1!==+mes) return false;
    return true;
  });

  if(!filtered.length){ showToast('Nenhuma tarefa encontrada para o filtro','error'); return; }

  const wb=xlsxWB();

  // Aba 1: Tarefas
  const headerT=['Tarefa','Status','Grupo','Responsável','Prioridade','Prazo','Data Início','Data Fim','Projeto','Cliente','Turno'];
  const rowsT=filtered.map(t=>{
    const proj=projects.find(p=>p.id===t.projId)||{};
    const cli=clientById(proj.clientId);
    return [t.name, SM[t.status]?.l||t.status, GROUPS[t.group]?.name||'', ownerById(t.ownerId)?.name||'',
      PM[t.priority]?.l||'', fd(t.date)||'', fd(t.dateStart)||'', fd(t.dateEnd)||'',
      proj.name||'', cli?.name||'', t.turno==='tarde'?'Tarde':'Manhã'];
  });
  xlsxAppend(wb, xlsxSheet([headerT,...rowsT]), 'Tarefas');

  // Aba 2: Comentários — usa c.time (formato pt-BR) e c.text
  const headerC=['Data/Hora','Autor','Comentário','Tarefa','Projeto','Cliente','Responsável da Tarefa'];
  const rowsC=[];
  filtered.forEach(t=>{
    const proj=projects.find(p=>p.id===t.projId)||{};
    const cli=clientById(proj.clientId);
    const ownerName=ownerById(t.ownerId)?.name||'';
    const comments=Array.isArray(t.comments)?t.comments:[];
    comments.forEach(c=>{
      rowsC.push([
        c.time||c.date||'',          // campo correto é c.time
        c.author||c.user||'',
        c.text||c.content||'',
        t.name,
        proj.name||'',
        cli?.name||'',
        ownerName
      ]);
    });
  });
  if(rowsC.length) xlsxAppend(wb, xlsxSheet([headerC,...rowsC]), 'Comentários');

  const mesLabel=mesSel?.value!==''&&mesSel?.value!=null?MESES_REL[+mesSel.value]:'Todos';
  xlsxDownload(wb, `tarefas_realizadas_${mesLabel}_${anoSel?.value||'geral'}.xlsx`);
  showToast('✅ Relatório exportado!','success');
}


function exportCSV(){
  const ft=tasks.filter(t=>t.projId===activeProj);
  const rows=[['Tarefa','Status','Grupo','Responsável','Prioridade','Prazo','Projeto'],
    ...ft.map(t=>[t.name,SM[t.status].l,GROUPS[t.group]?.name||'',ownerById(t.ownerId)?.name||'',PM[t.priority].l,fd(t.date),pname(t.projId)])];
  const csv=rows.map(r=>r.map(v=>`"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv);a.download='teamboard.csv';a.click();
}

// ── Toast ──────────────────────────────────────────────────
function showToast(msg,type='success'){
  const t=document.createElement('div');
  t.style.cssText=`position:fixed;bottom:20px;right:20px;z-index:9999;padding:10px 16px;border-radius:8px;font-size:12px;font-weight:500;${type==='success'?'background:#EAF3DE;color:#27500A;border:0.5px solid #97C459':'background:#FCEBEB;color:#A32D2D;border:0.5px solid #F09595'}`;
  t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),3500);
}

// ── Init ───────────────────────────────────────────────────
(async()=>{
  applyTheme();
  applyMobileLayout();
  window.addEventListener('resize', applyMobileLayout);
  const loggedIn = await checkLocalAuth();
  if(loggedIn){
    showApp();
    await checkAuth(); // Google
    await loadAll();
    iniciarTimeoutInatividade();
  } else {
    // Esconde app e mostra login
    document.querySelector('.topbar').style.display='none';
    document.querySelector('.layout').style.display='none';
    $('login-screen').style.display='flex';
  }
})();
