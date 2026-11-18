'use strict';
const $ = id => document.getElementById(id);
const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const state = {users:[],userId:null,role:'manager',year:2026,today:'',monthNow:0,data:null,drafts:{},busy:false};
const amountFmt = n => new Intl.NumberFormat('es-CL',{maximumFractionDigits:2}).format(Number(n)||0);
const key = (c,y,m)=>`${c}:${y}:${m}`;
const money = n=>`${amountFmt(n)} MM`;
const indexMonth = (y,m)=>Number(y)*12+Number(m);
const showError = msg => {$('error').hidden=!msg;$('error').textContent=msg||'';};
let toastTimer;
function notify(text){const t=$('toast');t.textContent=text;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),3200);}
const STORAGE_KEY='forecast_demo_github_v1';
let database;
function clone(value){return JSON.parse(JSON.stringify(value));}
function saveDatabase(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(database));}catch(e){console.warn('Almacenamiento no disponible',e);}}
function loadDatabase(){
  let stored=null;
  try{stored=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');}catch(e){stored=null;}
  database=stored&&Array.isArray(stored.contracts)&&Array.isArray(stored.forecasts)&&Array.isArray(stored.users)?stored:clone(window.FORECAST_DEMO_SEED);
}
function dataFor(uid){
 const user=database.users.find(u=>u.id===Number(uid));
 if(!user)throw new Error('Usuario de demostración no encontrado');
 const allowed=user.role==='manager'?database.assignments[String(uid)]||[]:database.contracts.map(c=>c.id);
 const contracts=database.contracts.filter(c=>allowed.includes(c.id));
 const ids=new Set(contracts.map(c=>c.id));
 const proposals=database.proposals.filter(p=>ids.has(p.contract_id)).map(p=>{
   const contract=database.contracts.find(c=>c.id===p.contract_id);
   return {...p,manager_name:database.users.find(u=>u.id===p.manager_id)?.full_name||'',approver_name:database.users.find(u=>u.id===p.reviewed_by)?.full_name||'',contract_code:contract.code,client:contract.client};
 }).sort((a,b)=>b.id-a.id);
 return {user,contracts:clone(contracts),forecasts:clone(database.forecasts.filter(f=>ids.has(f.contract_id))),proposals,recent:clone(database.audit.slice(-20))};
}
function updateProposal(d){
 const uid=Number(d.user_id),cid=Number(d.contract_id),y=Number(d.year),m=Number(d.month),n=Number(d.amount);
 const user=database.users.find(u=>u.id===uid);
 if(!user||user.role!=='manager')throw new Error('Selecciona un Manager');
 if(!database.assignments[String(uid)]?.includes(cid))throw new Error('El contrato no está asignado al Manager');
 if(!Number.isFinite(n)||n<0||n>1e12)throw new Error('Ingresa un importe válido');
 if(indexMonth(y,m)<state.monthNow)throw new Error('No puedes modificar meses anteriores');
 const c=database.contracts.find(c=>c.id===cid);
 if(!c||!currentContract(c,y,m))throw new Error('Mes fuera de vigencia');
 const f=database.forecasts.find(f=>f.contract_id===cid&&f.year===y&&f.month===m);
 if(!f)throw new Error('No hay proyección para ese mes');
 const proposed=Math.round(n*100)/100;
 const pending=database.proposals.find(p=>p.contract_id===cid&&p.year===y&&p.month===m&&p.status==='pending');
 const ts=new Date().toISOString();
 if(pending){
   if(pending.manager_id!==uid)throw new Error('Modificación pendiente de otro Manager');
   database.audit.push({proposal_id:pending.id,actor_id:uid,action:'replaced',old_value:pending.proposed_amount,new_value:proposed,happened_at:ts});
   pending.proposed_amount=proposed;pending.updated_at=ts;saveDatabase();
   return {id:pending.id,status:'pending',replaced:true};
 }
 if(proposed===f.amount)return {status:'unchanged'};
 const p={id:database.nextId++,contract_id:cid,year:y,month:m,base_amount:f.amount,proposed_amount:proposed,manager_id:uid,status:'pending',created_at:ts,updated_at:ts,reviewed_by:null,reviewed_at:null,comment:''};
 database.proposals.push(p);database.audit.push({proposal_id:p.id,actor_id:uid,action:'created',old_value:f.amount,new_value:proposed,happened_at:ts});saveDatabase();
 return {id:p.id,status:'pending',replaced:false};
}
function reviewProposal(d){
 const uid=Number(d.user_id),pid=Number(d.proposal_id),decision=d.decision;
 const user=database.users.find(u=>u.id===uid);
 if(!user||user.role!=='approver')throw new Error('Solo Finanzas puede revisar');
 if(!['approved','rejected'].includes(decision))throw new Error('Decisión inválida');
 const p=database.proposals.find(p=>p.id===pid&&p.status==='pending');
 if(!p)throw new Error('La propuesta ya no está pendiente');
 const contract=database.contracts.find(c=>c.id===p.contract_id);
 const f=database.forecasts.find(f=>f.contract_id===p.contract_id&&f.year===p.year&&f.month===p.month);
 if(decision==='approved'){
   // Cambio neto mensual aprobado, aplicado una sola vez al valor actual contractual.
   // El valor original pactado permanece fijo.
   const delta=p.proposed_amount-f.amount;
   f.amount=p.proposed_amount;
   contract.current_contract_value=Math.round((contract.current_contract_value+delta)*100)/100;
 }
 p.status=decision;p.reviewed_by=uid;p.reviewed_at=new Date().toISOString();p.updated_at=p.reviewed_at;p.comment=String(d.comment||'').slice(0,500);
 database.audit.push({proposal_id:pid,actor_id:uid,action:decision,old_value:p.base_amount,new_value:p.proposed_amount,happened_at:p.reviewed_at});
 saveDatabase();return {id:pid,status:decision};
}
async function api(path,options){
 // Misma API simulada que la V9, pero sin servidor ni red.
 if(path==='/api/bootstrap'){
   const now=new Date();
   const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
   return {users:clone(database.users),today,month_now:now.getFullYear()*12+now.getMonth()+1,years:[...new Set(database.forecasts.map(f=>f.year))].sort().map(year=>({year}))};
 }
 if(path.startsWith('/api/data/'))return dataFor(Number(path.split('/').pop()));
 const input=JSON.parse(options?.body||'{}');
 if(path==='/api/proposals')return updateProposal(input);
 if(path==='/api/review')return reviewProposal(input);
 throw new Error('Operación no disponible');
}
function getUser(){return state.users.find(u=>u.id===state.userId);}
function findForecast(c,y,m){return state.data?.forecasts.find(f=>f.contract_id===c&&f.year===y&&f.month===m);}
function pendingFor(c,y,m){return state.data?.proposals.find(p=>p.contract_id===c&&p.year===y&&p.month===m&&p.status==='pending');}
function valueFor(c,y,m){const draft=state.drafts[key(c,y,m)];if(draft!==undefined)return Number(draft);return pendingFor(c,y,m)?.proposed_amount??findForecast(c,y,m)?.amount??0;}
function currentContract(c,y,m){const [a,b]=[c.start_date.slice(0,7),c.end_date.slice(0,7)];const current=`${y}-${String(m).padStart(2,'0')}`;return current>=a&&current<=b;}
function filteredContracts(){const q=$('searchInput').value.trim().toLowerCase();return (state.data?.contracts||[]).filter(c=>c.code.toLowerCase().includes(q));}
function setRoleView(){
  const approver=state.role==='approver';
  $('managerPanel').hidden=approver;$('approverPanel').hidden=!approver;
  $('managerTab').classList.toggle('active',!approver);$('approverTab').classList.toggle('active',approver);
  $('managerTab').disabled=approver;$('approverTab').disabled=!approver;
  $('subtitle').textContent=approver?'Revisa modificaciones individuales y aprueba o rechaza por contrato y mes.':'Consulta y actualiza las proyecciones mensuales de tus contratos.';
  $('userRole').textContent=approver?'Perfil: Aprobador (demo)':'Perfil: Manager (demo)';
}
function renderStats(){
 const cs=state.role==='manager'?filteredContracts():(state.data?.contracts||[]);
 const year=state.year;
 const yearTotal=cs.reduce((sum,c)=>sum+months.reduce((s,_,i)=>s+(currentContract(c,year,i+1)?(findForecast(c.id,year,i+1)?.amount||0):0),0),0);
 const nowYear=Math.floor((state.monthNow-1)/12),nowMonth=state.monthNow-nowYear*12;
 const currentTotal=cs.reduce((sum,c)=>sum+(findForecast(c.id,nowYear,nowMonth)?.amount||0),0);
 const pending=state.data?.proposals.filter(p=>p.status==='pending').length||0;
 $('stat1Label').textContent=state.role==='manager'?'Contratos asignados':'Contratos totales';$('stat1').textContent=cs.length;
 $('stat2').textContent=money(yearTotal);$('stat3').textContent=money(currentTotal);
 $('stat3Foot').textContent=`${months[nowMonth-1]} ${nowYear}`;
 $('stat4').textContent=pending;
 $('stat4Label').textContent=state.role==='manager'?'Mis modificaciones pendientes':'Pendientes de aprobación';
 $('stat1Foot').textContent=state.role==='manager'?'Contratos visibles':'Todos los contratos';
}
function renderForecast(){
 const cs=filteredContracts();const year=state.year;
 $('forecastTable').querySelector('thead').innerHTML='<tr><th class="contract-col">Contrato</th><th class="client-col">Cliente</th><th class="financial-col">Valor Contrato</th><th class="financial-col">Valor Actual Contrato</th><th class="financial-col">Valor Consumido</th>'+months.map((m,i)=>`<th class="month-col ${indexMonth(year,i+1)<state.monthNow?'locked-col':'future-col'}">${m}</th>`).join('')+'<th class="total-col">Total año</th></tr>';
 let body='',totals=Array(12).fill(0),totalAll=0,contractSum=0,currentSum=0,consumedSum=0;
 for (const c of cs){
   let subtotal=0;
   contractSum+=Number(c.contract_value)||0;currentSum+=Number(c.current_contract_value)||0;consumedSum+=Number(c.consumed_value)||0;
   body+=`<tr><td class="contract-col"><span class="contract-id">${escapeHTML(c.code)}</span><span class="contract-sub">${escapeHTML(c.description)}</span></td><td class="client-col client-name">${escapeHTML(c.client)}</td><td class="financial-col">${amountFmt(c.contract_value)}</td><td class="financial-col">${amountFmt(c.current_contract_value)}</td><td class="financial-col">${amountFmt(c.consumed_value)}</td>`;
   for(let m=1;m<=12;m++){
     const inContract=currentContract(c,year,m);const f=inContract?findForecast(c.id,year,m):undefined;
     const isPast=indexMonth(year,m)<state.monthNow;
     const pending=inContract?pendingFor(c.id,year,m):undefined;
     const editable=Boolean(f)&&!isPast;
     const v=editable?valueFor(c.id,year,m):f?.amount;
     if(f){totals[m-1]+=Number(v)||0;subtotal+=Number(v)||0;}
     if(!f){body+='<td class="locked-col cell-blank">—</td>';continue;}
     if(!editable){body+=`<td class="locked-col">${amountFmt(v)}</td>`;continue;}
     const k=key(c.id,year,m);
     const modified=state.drafts[k]!==undefined;
     body+=`<td class="future-col"><input type="number" step="0.01" min="0" class="cell-input ${pending?'pending-cell':''} ${modified?'modified':''}" data-contract="${c.id}" data-year="${year}" data-month="${m}" value="${Number(v)}" title="${pending?'Propuesta pendiente: se puede reemplazar':'Proponer nuevo valor'}" aria-label="${escapeHTML(c.code)} ${months[m-1]} ${year}" /></td>`;
   }
   totalAll+=subtotal;
   body+=`<td class="total-col">${amountFmt(subtotal)}</td></tr>`;
 }
 $('forecastTable').querySelector('tbody').innerHTML=body||'<tr><td class="empty-row" colspan="18">No hay contratos para este código.</td></tr>';
 $('forecastTable').querySelector('tfoot').innerHTML='<tr><td class="contract-col"><strong>TOTAL</strong></td><td class="client-col">Contratos visibles</td><td class="financial-col">'+amountFmt(contractSum)+'</td><td class="financial-col">'+amountFmt(currentSum)+'</td><td class="financial-col">'+amountFmt(consumedSum)+'</td>'+totals.map(v=>`<td>${amountFmt(v)}</td>`).join('')+`<td class="total-col">${amountFmt(totalAll)}</td></tr>`;
 $('tableSummary').textContent=`${cs.length} contrato(s) · Año ${year}`;
 $('dirtyDot').hidden=Object.keys(state.drafts).length===0;
 renderChart(cs);
}
function renderChart(cs){
  const yy=state.year;
  const series=months.map((_,i)=>cs.reduce((sum,c)=>sum+(findForecast(c.id,yy,i+1)?.amount||0),0));
  const max=Math.max(...series,1);
  $('chart').innerHTML=series.map((v,i)=>`<div class="bar-wrap"><div class="bar ${indexMonth(yy,i+1)>=state.monthNow?'future':''}" title="${months[i]}: ${money(v)}" style="height:${Math.max(3,Math.round(v/max*145))}px"></div><div class="bar-label">${months[i]}</div></div>`).join('');
}
function escapeHTML(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function renderApprover(){
 const q=$('reviewSearch').value.trim().toLowerCase(),status=$('statusSelect').value;
 const rows=(state.data?.proposals||[]).filter(p=>(status==='all'||p.status===status)&&p.contract_code.toLowerCase().includes(q));
 $('reviewSummary').textContent=`${rows.length} modificación(es) · ${status==='pending'?'Pendientes':status==='all'?'Todos los estados':status==='approved'?'Aprobadas':'Rechazadas'}`;
 $('reviewBody').innerHTML=rows.map(p=>{
   const change=p.base_amount===0?'—':`${((p.proposed_amount-p.base_amount)/p.base_amount*100).toFixed(1)}%`;
   const label={pending:'Pendiente',approved:'Aprobado',rejected:'Rechazado'}[p.status];
   return `<tr><td><span class="bold">${escapeHTML(p.contract_code)}</span><br><small>${escapeHTML(p.client)}</small></td><td>${months[p.month-1]} ${p.year}</td><td>${escapeHTML(p.manager_name)}</td><td class="num">${amountFmt(p.base_amount)}</td><td class="num bold">${amountFmt(p.proposed_amount)}</td><td class="num">${change}</td><td><span class="pill ${p.status}">${label}</span></td><td>${p.status==='pending'?`<input class="comment" data-comment="${p.id}" placeholder="Observación (opcional)" maxlength="500" aria-label="Observación de ${escapeHTML(p.contract_code)}"/><br><button class="approve-btn" data-review="approved" data-id="${p.id}">✓ Aprobar</button><button class="reject-btn" data-review="rejected" data-id="${p.id}">✕ Rechazar</button>`:`${escapeHTML(p.approver_name||'—')}<br><small>${escapeHTML(p.comment||'')}</small>`}</td></tr>`;
 }).join('')||'<tr><td colspan="8" class="empty-row">No hay modificaciones en este estado.</td></tr>';
}
function render(){setRoleView();renderStats();renderForecast();renderApprover();}
async function loadData(){
 showError('');try{state.data=await api(`/api/data/${state.userId}`);state.role=state.data.user.role;state.drafts={};render();}
 catch(e){showError(`No pudimos obtener la información: ${e.message}. Revisa la terminal del servidor.`);}
}
async function saveDrafts(){
 const drafts=Object.entries(state.drafts);
 if(!drafts.length){notify('No hay cambios por enviar');return;}
 if(drafts.some(([k,val])=>val===''||!Number.isFinite(Number(val))||Number(val)<0)){showError('Revisa los importes: no pueden estar vacíos ni ser negativos.');return;}
 if(state.busy)return;state.busy=true;$('saveBtn').disabled=true;
 let sent=0;
 try{
  for(const [k,val] of drafts){const [contract_id,year,month]=k.split(':').map(Number);
   await api('/api/proposals',{method:'POST',body:JSON.stringify({user_id:state.userId,contract_id,year,month,amount:Number(val)})});sent++;
  }
  await loadData();notify(`${sent} modificación(es) enviada(s) a revisión`);
 }catch(e){showError(`Se enviaron ${sent} modificaciones antes del error: ${e.message}. Actualiza para ver su estado.`);}
 finally{state.busy=false;$('saveBtn').disabled=false;}
}
async function decide(id,decision){
 if(state.busy)return;
 const comment=document.querySelector(`[data-comment="${id}"]`)?.value||'';
 state.busy=true;
 try{await api('/api/review',{method:'POST',body:JSON.stringify({user_id:state.userId,proposal_id:id,decision,comment})});await loadData();notify(decision==='approved'?'Modificación aprobada':'Modificación rechazada');}
 catch(e){showError(e.message);}finally{state.busy=false;}
}
async function init(){
 try{
  const bootstrap=await api('/api/bootstrap');state.users=bootstrap.users;state.today=bootstrap.today;state.monthNow=bootstrap.month_now;
  state.year=Math.max(Number(state.today.slice(0,4)),2026);
  $('todayLabel').textContent='Hoy: '+new Intl.DateTimeFormat('es-CL',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(bootstrap.today+'T12:00:00Z'));
  $('userSelect').innerHTML=state.users.map(u=>`<option value="${u.id}">${escapeHTML(u.full_name)} · ${u.role==='manager'?'Manager':'Aprobador'}</option>`).join('');
  $('yearSelect').innerHTML=bootstrap.years.map(y=>`<option value="${y.year}">${y.year}</option>`).join('');
  if(!bootstrap.years.some(y=>y.year===state.year))state.year=bootstrap.years[0]?.year||state.year;
  $('yearSelect').value=String(state.year);state.userId=state.users[0]?.id;
  if(!state.userId)throw new Error('No hay usuarios de demostración');
  await loadData();
 }catch(e){showError(`No se pudo iniciar Forecast: ${e.message}. Ejecuta «python server.py» desde la carpeta del proyecto.`);}
}
$('resetDemo').addEventListener('click',()=>{
 if(!confirm('¿Restaurar los contratos y borrar las modificaciones de este navegador?'))return;
 database=clone(window.FORECAST_DEMO_SEED);saveDatabase();loadData();notify('Demostración restaurada');
});
$('userSelect').addEventListener('change',async e=>{state.userId=Number(e.target.value);await loadData();});
$('yearSelect').addEventListener('change',e=>{state.year=Number(e.target.value);render();});
$('searchInput').addEventListener('input',()=>{renderStats();renderForecast();});
$('reviewSearch').addEventListener('input',renderApprover);
$('statusSelect').addEventListener('change',renderApprover);
$('refreshBtn').addEventListener('click',loadData);
$('refreshReviewBtn').addEventListener('click',loadData);
$('saveBtn').addEventListener('click',saveDrafts);
$('forecastTable').addEventListener('input',e=>{
 if(!e.target.matches('.cell-input'))return;
 const el=e.target;const k=key(Number(el.dataset.contract),Number(el.dataset.year),Number(el.dataset.month));
 const raw=el.value;
 if(raw===''||!Number.isFinite(Number(raw))||Number(raw)<0){el.classList.add('modified');state.drafts[k]=raw;}
 else {state.drafts[k]=Number(raw);el.classList.add('modified');}
 $('dirtyDot').hidden=false;
 // Updating summary without replacing the focused input.
 const cs=filteredContracts();let sum=0;
 for(const c of cs){for(let m=1;m<=12;m++)if(findForecast(c.id,state.year,m))sum+=valueFor(c.id,state.year,m)||0;}
 $('stat2').textContent=money(sum);
});
$('reviewBody').addEventListener('click',e=>{const btn=e.target.closest('button[data-review]');if(btn)decide(Number(btn.dataset.id),btn.dataset.review);});
loadDatabase();init();
