// ── Constantes fixas ───────────────────────────────────────
const GROUPS = [
  { name: 'Onboarding',         color: '#185FA5', bg: '#E6F1FB', text: '#0C447C' },
  { name: 'Preparação de base', color: '#3B6D11', bg: '#EAF3DE', text: '#27500A' },
  { name: 'Treinamento',        color: '#BA7517', bg: '#FAEEDA', text: '#633806' },
  { name: 'Acompanhamento',     color: '#993556', bg: '#FBEAF0', text: '#72243E' },
  { name: 'Administrativo',     color: '#534AB7', bg: '#EEEDFE', text: '#3C3489' }
];

const SM = {
  done:     { l: 'Concluído',         c: 's-done'     },
  progress: { l: 'Em andamento',      c: 's-progress'  },
  pending:  { l: 'Pendente',          c: 's-pending'   },
  na:       { l: 'Não aplicável',     c: 's-na'        },
  cancel:   { l: 'Cliente desmarcou', c: 's-cancel'    }
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

async function api(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
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
  const niUsers=$('ni-users');if(niUsers)niUsers.style.display=isAdmin?'flex':'none';
  const btnNU=$('btn-new-user');if(btnNU)btnNU.style.display=isAdmin?'':'none';
  const arU=$('add-row-user');if(arU)arU.style.display=isAdmin?'':'none';
  // Ausências — apenas admin pode cadastrar
  const btnNA=$('btn-new-ausencia');if(btnNA)btnNA.style.display=isAdmin?'':'none';
  const arA=$('add-row-ausencia');if(arA)arA.style.display=isAdmin?'':'none';
  const infoA=$('ausencia-info');if(infoA)infoA.style.display=isAdmin?'none':'block';
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
  if(currentUser?.perfil==='responsavel'&&currentUser?.ownerId){
    tasks=tasks.filter(t=>t.ownerId===currentUser.ownerId);
  }
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
  const cfc=$('cal-fil-client');
  if(cfc){const v=cfc.value;cfc.innerHTML='<option value="">Todos clientes</option>'+clients.map(c=>`<option value="${c.id}"${c.id===v?' selected':''}>${esc(c.name)}</option>`).join('');cfc.value=v;}
  const cfp=$('cal-fil-proj');
  if(cfp){const v=cfp.value;cfp.innerHTML='<option value="">Todos projetos</option>'+projects.map(p=>`<option value="${p.id}"${p.id===v?' selected':''}>${esc(p.name)}</option>`).join('');cfp.value=v;}

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
  // Ajuste 7: ordenar por data início
  const filtered=projects
    .filter(p=>!search||p.name.toLowerCase().includes(search))
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
    return `<div class="proj-card${p.id===activeProj?' active-proj':''}" onclick="setProj('${p.id}');goPage('board')">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:9px">
        <div style="width:10px;height:10px;border-radius:3px;background:${p.color};flex-shrink:0"></div>
        ${p.dateStart?`<span style="font-size:10px;color:var(--text3)">📅 ${fd(p.dateStart)}</span>`:''}
      </div>
      <div style="font-size:13px;font-weight:500;margin-bottom:3px">${esc(p.name)}</div>
      ${cli.name?`<div style="font-size:11px;color:var(--text2);margin-bottom:1px">${esc(cli.name)}</div>`:''}
      ${prod.name?`<div style="font-size:10px;color:var(--text3)">${esc(prod.name)}</div>`:''}
      <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
        <div style="font-size:11px;color:var(--text2);flex:1">${pt.length} tarefas · ${pct}% concluído</div>
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
    <div class="f2">
      <div class="fr"><label>Responsável</label><select id="f-owner"></select></div>
      <div class="fr"><label>Prazo</label><input type="date" id="f-date" value="${t?.date||''}"/></div>
    </div>
    <div class="f2">
      <div class="fr"><label>Data início</label><input type="date" id="f-date-start" value="${t?.dateStart||''}"/></div>
      <div class="fr"><label>Data fim</label><input type="date" id="f-date-end" value="${t?.dateEnd||''}"/></div>
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
    <div class="ma"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="saveTask()">Salvar tarefa</button></div>
  </div>`;
}
function openTaskModal(gi=0){editingTask=null;showModal(taskHTML(null));$('f-group').value=gi;}
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

async function saveTask(){
  const name=$('f-name').value.trim();if(!name)return;
  const meetData=pendingMeet?{...pendingMeet}:null;
  const dateStart=$('f-date-start').value||'';
  const dateEnd=$('f-date-end').value||'';
  const date=dateEnd||dateStart||$('f-date').value||'';
  const turno=document.querySelector('input[name="f-turno"]:checked')?.value||'manha';
  const newOwnerId=$('f-owner').value;
  const body={name,projId:$('f-proj').value||activeProj,group:+$('f-group').value,
    status:$('f-status').value,ownerId:newOwnerId,priority:$('f-priority').value,
    date,dateStart,dateEnd,turno,desc:$('f-desc').value,meet:meetData};

  // Verifica se é tarefa nova ou troca de responsável
  const oldTask=editingTask?tasks.find(x=>x.id===editingTask):null;
  const isNew=!editingTask;
  const ownerChanged=oldTask&&oldTask.ownerId!==newOwnerId;

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

  // Ajuste 4: notificar responsável quando for nova tarefa ou quando trocar o responsável
  if(newOwnerId&&(isNew||ownerChanged)){
    const projNome=projects.find(p=>p.id===(body.projId||activeProj))?.name||'';
    await api('POST','/notify',{
      type:'task_assigned',
      toOwnerId:newOwnerId,
      fromName:currentUser?.name||'Sistema',
      taskName:name,
      projName:projNome,
      meetUrl:meetData?.meetUrl||''
    });
  }

  // Link do Meet já incluído no e-mail de task_assigned — não dispara e-mail separado
  // if(newOwnerId && meetData?.meetUrl){ ... }

  tasks=await api('GET','/tasks?projId='+activeProj);
  closeModal();renderBoard();
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
    const data=await fetch('/meet/create',{method:'POST',headers:{'Content-Type':'application/json'},
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
    <div class="fr"><label>Responsável principal</label><select id="p-owner"><option value="">— nenhum —</option>${owners.map(o=>`<option value="${o.id}"${p?.ownerId===o.id?' selected':''}>${esc(o.name)}</option>`).join('')}</select></div>
    <div class="f2">
      <div class="fr"><label>Data início</label><input type="date" id="p-date-start" value="${p?.dateStart||''}"/></div>
      <div class="fr"><label>Previsão de conclusão</label><input type="date" id="p-date-end" value="${p?.dateEnd||''}"/></div>
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
function openProjModal(){editingProj=null;showModal(projHTML(null));}
function editProj(id){const p=projects.find(x=>x.id===id);if(!p)return;editingProj=id;showModal(projHTML(p));}

async function saveProj(){
  const name=$('p-name').value.trim();if(!name)return;
  const body={name,color:$('p-color').value,clientId:$('p-client')?.value||null,
    productId:$('p-product')?.value||null,sellerId:$('p-seller')?.value||null,
    ownerId:$('p-owner')?.value||null,desc:$('p-desc')?.value||'',
    dateStart:$('p-date-start')?.value||'',dateEnd:$('p-date-end')?.value||''};
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
  if(!confirm('Excluir projeto?'))return;
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
  const sorted=clients.slice().sort((a,b)=>{
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
    <div class="fr"><label>Observações</label><textarea id="c-notes">${esc(c?.notes||'')}</textarea></div>
    <div class="ma"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="saveClient()">Salvar cliente</button></div>
  </div>`;
}
function openClientModal(){editingClient=null;showModal(clientHTML(null));}
function editClient(id){const c=clients.find(x=>x.id===id);if(!c)return;editingClient=id;showModal(clientHTML(c));setTimeout(()=>{if($('c-product'))$('c-product').value=c.productId||'';if($('c-seller'))$('c-seller').value=c.sellerId||'';},50);}
async function saveClient(){
  const name=$('c-name').value.trim();if(!name)return;
  const body={name,classification:$('c-class').value,productId:$('c-product').value||null,date:$('c-date').value,sellerId:$('c-seller').value||null,notes:$('c-notes').value};
  if(editingClient){await api('PUT','/clients/'+editingClient,body);}else{await api('POST','/clients',body);}
  clients=await api('GET','/clients');closeModal();renderClientsTable();updateSelects();
}
async function deleteClient(id){if(!canDelete())return;if(!confirm('Excluir cliente?'))return;await api('DELETE','/clients/'+id);clients=clients.filter(c=>c.id!==id);renderClientsTable();}

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
async function deleteProduct(id){if(!canDelete())return;if(!confirm('Excluir produto?'))return;await api('DELETE','/products/'+id);products=products.filter(p=>p.id!==id);renderProductsTable();}

// ── Owners ─────────────────────────────────────────────────
function renderOwnersTable(){
  const tb=$('owners-tb');if(!tb)return;
  tb.innerHTML=owners.map(o=>`<tr onclick="editOwner('${o.id}')" style="cursor:pointer">
    <td><div style="display:flex;align-items:center;gap:7px">${ownerAvatar(o)}<span>${esc(o.name)}</span></div></td>
    <td style="color:var(--text2)">${esc(o.email||'')}</td>
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
  const body={name,initials,email:$('ow-email').value,color:$('ow-color').value,active:$('ow-active').value==='true'};
  if(editingOwner){await api('PUT','/owners/'+editingOwner,body);}else{await api('POST','/owners',body);}
  owners=await api('GET','/owners');closeModal();renderOwnersTable();updateSelects();
}
async function deleteOwner(id){if(!canDelete())return;if(!confirm('Excluir responsável?'))return;await api('DELETE','/owners/'+id);owners=owners.filter(o=>o.id!==id);renderOwnersTable();}

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
  if(editingSeller){await api('PUT','/sellers/'+editingSeller,body);}else{await api('POST','/sellers',body);}
  sellers=await api('GET','/sellers');closeModal();renderSellersTable();updateSelects();
}
async function deleteSeller(id){if(!canDelete())return;if(!confirm('Excluir vendedor?'))return;await api('DELETE','/sellers/'+id);sellers=sellers.filter(s=>s.id!==id);renderSellersTable();}

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

let allCalTasks=[];
async function loadAllTasksForCal(){
  allCalTasks=await api('GET','/tasks');
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

    dayTasks.forEach(t=>{
      const o=ownerById(t.ownerId);
      const ownerColor=o.color||'#888';
      const bgColor=ownerColor+'22';
      const proj=projects.find(p=>p.id===t.projId)||{};
      const cli=clientById(proj.clientId);
      const turnoIcon=t.turno==='tarde'?'🌙':'☀️';
      const isStart=(!t.dateStart&&t.date===ds)||(t.dateStart===ds);
      const periodo=t.dateStart&&t.dateEnd?`${fd(t.dateStart)} → ${fd(t.dateEnd)}`:fd(t.dateStart||t.dateEnd||t.date);
      const tooltipTitle=`${t.name}${cli.name?' · '+cli.name:''} · ${turnoIcon} ${t.turno==='tarde'?'Tarde':'Manhã'}${periodo?' · '+periodo:''}`;
      html+=`<div onclick="event.stopPropagation();openEditTask('${t.id}')"
        title="${esc(tooltipTitle)}"
        style="font-size:10px;padding:2px 5px;border-radius:4px;margin-bottom:2px;cursor:pointer;
               background:${bgColor};color:var(--text);border-left:3px solid ${ownerColor};
               display:flex;align-items:center;gap:3px;overflow:hidden">
        <span style="font-size:9px;flex-shrink:0">${turnoIcon}</span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500">${isStart?esc(t.name):''}</span>
        ${cli.name&&isStart?`<span style="opacity:.7;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:40px">${esc(cli.name)}</span>`:''}
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
    return `<div onclick="openEditTask('${t.id}')" style="display:flex;align-items:center;gap:9px;padding:9px 12px;border-bottom:0.5px solid var(--border);cursor:pointer;transition:background .1s" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <div style="width:3px;height:40px;border-radius:2px;background:${ownerColor};flex-shrink:0"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.name)}</div>
        <div style="font-size:10px;color:var(--text2);margin-top:2px;display:flex;align-items:center;gap:6px">
          <span>${esc(proj.name||'')}</span>
          ${cli.name?`<span style="background:#EEEDFE;color:#3C3489;padding:0 4px;border-radius:3px;font-size:10px">${esc(cli.name)}</span>`:''}
          <span style="color:var(--text3)">${g.name}</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <span style="font-size:11px;background:${t.turno==='tarde'?'#E6F1FB':'#FAEEDA'};color:${t.turno==='tarde'?'#0C447C':'#854F0B'};padding:2px 7px;border-radius:8px;font-weight:500">${turnoIcon} ${turnoLabel}</span>
        <span class="pill ${SM[t.status].c}" style="font-size:10px">${SM[t.status].l}</span>
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
  renderCalendar();
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
function goPage(p){
  closeModal(); // Ajuste 4: fecha qualquer modal aberto ao navegar
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.ni').forEach(x=>x.classList.remove('act'));
  document.getElementById('page-'+p)?.classList.add('active');
  document.getElementById('ni-'+p)?.classList.add('act');
  if(p==='clients')  renderClientsTable();
  if(p==='products') renderProductsTable();
  if(p==='owners')   renderOwnersTable();
  if(p==='sellers')  renderSellersTable();
  if(p==='templates')renderTemplates();
  if(p==='users')    renderUsersTable();
  if(p==='ausencias')renderAusenciasTable();
  if(p==='projects') renderProjGrid();
  if(p==='notif'){loadAllTasksForCal().then(renderNotifs);}
  if(p==='cal'){loadAllTasksForCal().then(renderCalendar);}
}
function switchView(v,el){
  document.querySelectorAll('.vt').forEach(t=>t.classList.remove('act'));el.classList.add('act');
  $('view-tbl').style.display=v==='tbl'?'block':'none';
  $('view-kan').style.display=v==='kan'?'block':'none';
}

// ── Export CSV ─────────────────────────────────────────────
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
  const loggedIn = await checkLocalAuth();
  if(loggedIn){
    showApp();
    await checkAuth(); // Google
    await loadAll();
  } else {
    // Esconde app e mostra login
    document.querySelector('.topbar').style.display='none';
    document.querySelector('.layout').style.display='none';
    $('login-screen').style.display='flex';
  }
})();
