import './style.css';
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, connectAuthEmulator } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache, connectFirestoreEmulator } from 'firebase/firestore';
import config from './firebase-config.json';
import { Repository } from './repository.js';
import { invitationCode } from './draw.js';

const emulated = import.meta.env.DEV && import.meta.env.VITE_FIREBASE_EMULATORS === '1' && ['localhost','127.0.0.1'].includes(location.hostname);
const firebase = initializeApp(emulated ? {...config,projectId:'demo-entre-nosotros',apiKey:'demo-key'} : config);
const auth = getAuth(firebase);
auth.languageCode = 'es';
const db = initializeFirestore(firebase,{localCache:memoryLocalCache()});
if(emulated){connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8080);}
const repository = new Repository(db,auth);
const app = document.querySelector('#app'), dialog = document.querySelector('#dialog');
let user = null, ready = false, unsubscribe, revision = 0, current = null, busy = false;
let secretVisible = false, revealRevision = 0;
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const gift = '<img class="gift-mark" src="./icon.svg" alt="Un regalo para compartir">';
const arrow = '<span aria-hidden="true">↗</span>';
const field = (name,label,options='') => `<label class="field">${label}<input name="${name}" ${options}></label>`;
function notify(message) {
  const toast = document.querySelector('#toast'); toast.textContent=message; toast.hidden=false;
  clearTimeout(notify.timer); notify.timer=setTimeout(()=>toast.hidden=true,6000);
}
function errorMessage(error) {
  const messages = {
    'auth/popup-closed-by-user':'No se inició sesión. Podés volver a intentarlo cuando quieras.',
    'auth/cancelled-popup-request':'Ya hay una ventana de Google abierta.',
    'auth/popup-blocked':'El navegador bloqueó Google. Permití la ventana emergente o usá correo y contraseña. Si abriste el enlace en WhatsApp, abrilo en Safari o Chrome.',
    'auth/unauthorized-domain':'El acceso desde este dominio todavía no está habilitado. Avisale al organizador.',
    'auth/invalid-credential':'Revisá el correo y la contraseña, o recuperá el acceso.',
    'auth/email-already-in-use':'Ese correo ya tiene cuenta. Iniciá sesión o recuperá la contraseña.',
    'auth/weak-password':'Usá una contraseña de al menos 6 caracteres.',
    'auth/invalid-email':'Revisá el correo electrónico.',
    'auth/too-many-requests':'Hubo demasiados intentos. Esperá un momento antes de volver a intentar.',
    'auth/network-request-failed':'No hay conexión. Revisá Internet y volvé a intentar.',
    'auth/account-exists-with-different-credential':'Entrá con el método que usaste al crear tu cuenta para conservar tus encuentros.',
    'permission-denied':'Tu cuenta no tiene permiso para esta acción. Actualizá el encuentro.',
    'unavailable':'No hay conexión con el encuentro. Revisá Internet y reintentá.',
    'resource-exhausted':'Se alcanzó la cuota gratuita. Volvé a intentar más tarde.'
  };
  return messages[error.code] || (!error.code ? error.message : 'No pudimos completar la operación. Volvé a intentar.');
}
function navigate(hash='') { if(location.hash === hash || (!hash && !location.hash)) renderRoute(); else location.hash=hash; }
function setBusy(value) {
  busy=value;
  document.querySelectorAll('button,input,select').forEach(el => {
    if (value) { if(el.dataset.wasDisabled === undefined)el.dataset.wasDisabled=String(el.disabled); el.disabled=true; }
    else if (el.dataset.wasDisabled !== undefined) { el.disabled=el.dataset.wasDisabled==='true'; delete el.dataset.wasDisabled; }
  });
  app.setAttribute('aria-busy',String(value));
}
async function action(work, after=()=>{}) {
  if(busy) return;
  setBusy(true);
  const session = user?.uid;
  try { const value=await work(); if(session===user?.uid) after(value); }
  catch(error) { if(session===user?.uid) {
    const target=dialog.open ? dialog.querySelector('.form-error') : app.querySelector('.page-error');
    if(target) target.textContent=errorMessage(error); else notify(errorMessage(error));
  } }
  finally { setBusy(false); }
}
function openDialog(title,html,onSubmit) {
  if(dialog.open) dialog.close();
  dialog.innerHTML=`<form><div class="dialog-top"><h2 id="dialog-title">${esc(title)}</h2><button type="button" class="icon-button" aria-label="Cerrar" data-close>×</button></div>${html}<p class="form-error" role="alert"></p></form>`;
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.querySelector('form').onsubmit=event=>{ event.preventDefault(); onSubmit(new FormData(event.currentTarget)); };
  dialog.showModal();
}
dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
function confirmAction(title,description,label,work,after,danger=false) {
  openDialog(title,`<p>${esc(description)}</p><button class="button ${danger?'danger':''}" type="submit">${esc(label)}</button>`,()=>action(work,value=>{dialog.close();after(value);}));
}
function header() {
  document.querySelector('#account').innerHTML=user ? `<button id="account-button" class="account-chip" aria-label="Mi cuenta"><span class="avatar">${esc((user.displayName || user.email || 'F')[0].toUpperCase())}</span><span class="account-name">Mi cuenta</span></button>` : '<span class="header-note">AMIGO INVISIBLE EN FAMILIA</span>';
  document.querySelector('#account-button')?.addEventListener('click',()=>{
    openDialog('Tu cuenta',`<p class="account-email">${esc(user.email || user.displayName)}</p><p>Tus encuentros te acompañan en cualquier teléfono. Usá siempre la misma cuenta.</p><button type="submit" class="button secondary">Cerrar sesión</button>`,()=>action(()=>signOut(auth),()=>dialog.close()));
  });
}
function login(invited=false) {
  app.innerHTML=`<section class="welcome"><div class="welcome-copy"><span class="eyebrow">${invited?'TENÉS UNA INVITACIÓN':'LA TRADICIÓN DE SIEMPRE, MÁS SIMPLE'}</span><h1>${invited?'La familia<br>te está esperando.':'La magia está<br>en <em>sorprender.</em>'}</h1><p class="lead">${invited?'Entrá para sumarte al encuentro y guardar tu amigo invisible.':'El amigo invisible de tu familia, sin cruces de pareja y con el secreto bien guardado.'}</p><div class="welcome-benefits"><span>♡ Parejas excluidas</span><span>✦ Una sorpresa para cada uno</span></div></div><section class="signin card">${gift}<h2>Un regalo empieza<br>con un encuentro.</h2><p>Entrá con tu cuenta y compartí la ilusión.</p><button class="button google" id="google-login"><span aria-hidden="true" class="google-letter">G</span> Continuar con Google</button><details><summary>Prefiero usar correo y contraseña</summary><form id="email-login">${field('email','Correo electrónico','type="email" autocomplete="email" required maxlength="254"')}${field('password','Contraseña','type="password" autocomplete="current-password" minlength="6" required maxlength="128"')}<button class="button" type="submit">Iniciar sesión</button><button class="button secondary" type="button" id="register">Crear mi cuenta</button><button class="text-button" type="button" id="reset">Recuperar contraseña</button></form></details><p class="page-error" role="alert"></p><small class="fine-print">Funciona en iPhone, Android y computadora.<br>No necesitás instalar nada.</small></section></section><div class="steps"><article><span>01</span><h3>Reuní a tu gente</h3><p>Creá un encuentro e invitá por WhatsApp.</p></article><article><span>02</span><h3>Cuidá las sorpresas</h3><p>Indicá las parejas antes de sortear.</p></article><article><span>03</span><h3>Regalá con ilusión</h3><p>Cada persona descubre a quién le toca.</p></article></div>`;
  document.querySelector('#google-login').onclick=()=>{
    // Keep the popup directly within the click to preserve Safari user activation.
    const provider=new GoogleAuthProvider(); provider.setCustomParameters({prompt:'select_account'});
    action(()=>signInWithPopup(auth,provider));
  };
  const form=document.querySelector('#email-login');
  form.onsubmit=event=>{event.preventDefault();action(()=>signInWithEmailAndPassword(auth,form.email.value.trim(),form.password.value));};
  document.querySelector('#register').onclick=()=>{if(form.reportValidity())action(()=>createUserWithEmailAndPassword(auth,form.email.value.trim(),form.password.value));};
  document.querySelector('#reset').onclick=()=>{if(form.email.reportValidity())action(()=>sendPasswordResetEmail(auth,form.email.value.trim()),()=>notify('Si ese correo tiene una cuenta, recibirá instrucciones para recuperar el acceso.'));};
}
async function home(token) {
  app.innerHTML=`<section class="page-heading"><div><span class="eyebrow">TU CÍRCULO, TUS TRADICIONES</span><h1>Un lugar para<br><em>reunirnos.</em></h1><p>Organizá la sorpresa. Nosotros cuidamos las combinaciones.</p></div><div class="heading-art" aria-hidden="true">${gift}<span>Que nadie se quede<br>sin su sorpresa.</span></div></section><div class="toolbar"><button class="button" id="create">＋ Crear encuentro</button><button class="button secondary" id="join">Tengo una invitación ${arrow}</button></div><section class="encounters"><div class="section-heading"><h2>Mis encuentros</h2><button class="text-button" id="refresh">Actualizar ↻</button></div><p class="page-error" role="alert"></p><div id="encounter-list" class="encounter-grid" aria-live="polite"><p class="loading">Buscando tus encuentros…</p></div></section>`;
  document.querySelector('#create').onclick=createForm;
  document.querySelector('#join').onclick=joinCodeForm;
  document.querySelector('#refresh').onclick=()=>renderRoute();
  try {
    const draws=await repository.list(); if(token!==revision)return;
    const list=document.querySelector('#encounter-list');
    list.innerHTML=draws.length ? draws.map(d=>`<a class="encounter card" href="#draw/${d.id}"><span class="badge ${d.status==='drawn'?'finished':''}">${d.status==='drawn'?'Sorteo realizado':'En preparación'}</span><h3>${esc(d.title)}</h3><p>${d.memberIds.length} de ${d.capacity} participantes</p><div class="mini-progress"><span style="width:${Math.min(100,100*d.memberIds.length/d.capacity)}%"></span></div><div class="card-bottom"><span>${esc(d.budget || 'Presupuesto libre')}</span>${arrow}</div></a>`).join('') : `<div class="empty card"><span class="empty-star">✦</span><h3>El primer regalo es reunirse.</h3><p>Creá un encuentro o sumate con la invitación de tu familia.</p></div>`;
  } catch(error) { if(token===revision){document.querySelector('#encounter-list').innerHTML='';document.querySelector('.page-error').textContent=errorMessage(error);} }
}
function createForm() {
  openDialog('Un nuevo encuentro',`${field('title','Nombre del encuentro','required maxlength="80" placeholder="Navidad en familia"')}${field('name','Tu nombre en la familia',`required maxlength="80" autocomplete="given-name" value="${esc(user.displayName?.split(' ')[0] || '')}"`)}<div class="form-row">${field('capacity','Participantes','type="number" inputmode="numeric" min="3" max="50" value="6" required')}${field('budget','Presupuesto (opcional)','maxlength="80" placeholder="Ej.: $ 1.000 UYU"')}</div><p class="hint">Incluite en el total. Cada persona se suma con su propia cuenta.</p><button class="button" type="submit">Crear encuentro ${arrow}</button>`,data=>action(()=>repository.create(Object.fromEntries(data)),id=>{dialog.close();navigate(`#draw/${id}`);}));
}
function joinCodeForm() {
  openDialog('Tu invitación',`${field('invitation','Enlace o código','required maxlength="500" placeholder="Pegá acá lo que te enviaron"')}<button class="button" type="submit">Ver encuentro ${arrow}</button>`,data=>{
    const code=invitationCode(String(data.get('invitation')));
    if(!code){dialog.querySelector('.form-error').textContent='Revisá el enlace o código de invitación.';return;}
    dialog.close();navigate(`#join/${code}`);
  });
}
function showEncounter(d) {
  current=d;
  const member=d.memberIds.includes(user.uid), owner=d.ownerId===user.uid, done=d.status==='drawn';
  const remaining=d.capacity-d.memberIds.length;
  app.innerHTML=`<a class="back" href="#">← Mis encuentros</a><section class="draw-heading"><span class="badge ${done?'finished':''}">${done?'Sorteo realizado':'En preparación'}</span><h1>${esc(d.title)}</h1><p>${esc(d.budget || 'Presupuesto libre')} <span class="dot">·</span> ${d.memberIds.length} de ${d.capacity} participantes</p></section>${owner&&!done?'<button class="text-button" id="edit-capacity">Editar cantidad de participantes</button>':''}<p class="page-error" role="alert"></p><div class="draw-layout"><section class="card roster"><div class="section-heading"><h2>La familia</h2><span class="counter">${d.memberIds.length}/${d.capacity}</span></div><p class="hint">${owner&&!done?'Indicá las parejas. La exclusión vale en ambos sentidos.':'Nadie se recibe a sí mismo ni a su pareja.'}</p><ul class="people">${d.participants.map((p,index)=>`<li><span class="person-avatar tone-${index%3}">${esc(p.name[0].toUpperCase())}</span><div class="person-info"><strong>${esc(p.name)} ${p.id===user.uid?'<small>(vos)</small>':''}</strong><span>${p.partnerId?'♡ Pareja: '+esc(d.people[p.partnerId]?.name || ''):'Sin pareja en el encuentro'}${p.id===d.ownerId?' · Organiza':''}</span></div>${owner&&!done?`<div class="person-actions"><button class="text-button partner-button" data-person="${esc(p.id)}" aria-label="Elegir pareja de ${esc(p.name)}">Editar</button>${p.id!==d.ownerId?`<button class="text-button danger-text remove-person" data-person="${esc(p.id)}" aria-label="Quitar a ${esc(p.name)}">Quitar</button>`:''}</div>`:''}</li>`).join('')}</ul></section><aside class="draw-aside">${!member ? `<section class="card join-card"><span class="eyebrow">UN LUGAR PARA VOS</span><h2>${done?'El sorteo ya está cerrado':remaining>0?'Sumate a la sorpresa':'El encuentro está completo'}</h2>${!done&&remaining>0?`<p>Tu nombre aparecerá en la lista familiar.</p><form id="join-form">${field('name','Tu nombre',`required maxlength="80" autocomplete="given-name" value="${esc(user.displayName?.split(' ')[0] || '')}"`)}<button class="button" type="submit">Unirme al encuentro</button></form>`:'<p>Consultá con quien organiza el encuentro.</p>'}</section>` : done ? `<section class="card reveal-card"><span class="eyebrow">UN SECRETO ENTRE NOSOTROS</span><div class="reveal-symbol">✦</div><h2>Alguien espera<br>tu sorpresa.</h2><p>Buscá un momento a solas para descubrir a quién le vas a regalar.</p><div id="secret" hidden></div><button class="button" id="reveal">Revelar mi amigo invisible</button></section>` : `<section class="card invite-card"><span class="eyebrow">LA MESA SE VA COMPLETANDO</span><h2>${remaining>0?`Falta${remaining===1?'':'n'} ${remaining}.<br>¡Invitalo${remaining===1?'':'s'}!`:'¡Ya estamos todos!'}</h2><p>Un mismo enlace para iPhone, Android y computadora.</p><a class="button whatsapp" id="whatsapp" target="_blank" rel="noopener noreferrer">Invitar por WhatsApp ${arrow}</a><button class="button secondary" id="copy-link">Copiar enlace</button><button class="text-button" id="share-link">Más opciones para compartir</button></section>${owner?`<section class="card sort-card"><h3>Que empiece la magia</h3><p>${remaining>0?'Cuando estén todos, revisá las parejas y realizá el sorteo.':'Revisá las parejas. El sorteo se realiza una sola vez.'}</p><button class="button" id="execute" ${remaining>0?'disabled':''}>Realizar sorteo ✦</button></section>`:'<p class="aside-note">El organizador realizará el sorteo cuando estén todos.</p>'}`}</aside></div>${owner&&!done?'<div class="danger-zone"><button class="text-button danger-text" id="delete">Eliminar encuentro</button><span>Solo antes de realizar el sorteo.</span></div>':''}`;
  document.querySelectorAll('.remove-person').forEach(button=>button.onclick=()=>confirmAction('¿Quitar participante?',`Se quitará a «${d.people[button.dataset.person].name}» y su relación de pareja, si tiene una. Quedará un lugar libre; podés ajustar el total con «Editar cantidad de participantes». Esta persona podrá volver a sumarse con el enlace si hay lugar.`,'Quitar participante',()=>repository.removeParticipant(d.id,button.dataset.person),()=>notify('Participante eliminado. Podés ajustar la cantidad total si hace falta.'),true));
  document.querySelector('#edit-capacity')?.addEventListener('click',()=>capacityForm(d));
  document.querySelectorAll('.partner-button').forEach(button=>button.onclick=()=>partnerForm(d,button.dataset.person));
  document.querySelector('#join-form')?.addEventListener('submit',event=>{event.preventDefault();const name=new FormData(event.currentTarget).get('name');action(()=>repository.join(d.id,name),()=>{notify('¡Ya sos parte del encuentro!');navigate(`#draw/${d.id}`);});});
  const link=`${location.origin}${import.meta.env.BASE_URL}#join/${d.id}`;
  const invitation=`Te invito a ${d.title} en Entre Nosotros 🎁 Entrá con tu cuenta y sumate: ${link}`;
  const whatsapp=document.querySelector('#whatsapp'); if(whatsapp)whatsapp.href=`https://wa.me/?text=${encodeURIComponent(invitation)}`;
  document.querySelector('#copy-link')?.addEventListener('click',()=>copyLink(link));
  document.querySelector('#share-link')?.addEventListener('click',async()=>{
    if(!navigator.share){copyLink(link);return;}
    try{await navigator.share({title:'Entre Nosotros',text:`Te invito a ${d.title}`,url:link});}catch(error){if(error.name!=='AbortError')copyLink(link);}
  });
  document.querySelector('#execute')?.addEventListener('click',()=>confirmAction('¿Listos para la sorpresa?','Revisá las parejas. El sorteo no se puede repetir ni modificar. Tu dispositivo calculará las asignaciones y guardará un resultado privado para cada cuenta.','Sí, realizar sorteo',()=>repository.execute(d.id),()=>{notify('¡Sorteo realizado! Cada persona ya puede ver su resultado.');renderRoute();}));
  document.querySelector('#delete')?.addEventListener('click',()=>confirmAction('¿Eliminar este encuentro?',`Se eliminará «${d.title}» para todos y la invitación dejará de funcionar. No se puede deshacer.`,'Eliminar encuentro',()=>repository.remove(d.id),()=>{notify('Encuentro eliminado.');navigate();},true));
  document.querySelector('#reveal')?.addEventListener('click',()=>{
    if(secretVisible){hideSecret();return;}
    const token=revision, revealToken=++revealRevision;
    action(()=>repository.result(d),name=>{
      if(token!==revision || revealToken!==revealRevision || document.hidden)return;
      const secret=document.querySelector('#secret');secret.textContent=name;secret.hidden=false;
      document.querySelector('#reveal').textContent='Ocultar resultado';secretVisible=true;
    });
  });
  if(busy) { /* Snapshot updates may replace controls while a transaction is pending. */
    busy=false;setBusy(true);
  }
}
function capacityForm(d) {
  openDialog('Cantidad de participantes',`${field('capacity','Total de participantes',`type="number" inputmode="numeric" min="${Math.max(3,d.memberIds.length)}" max="50" value="${d.capacity}" required`)}<p class="hint">Incluite en el total. Ya hay ${d.memberIds.length} personas anotadas; no podés elegir una cantidad menor. El enlace de invitación sigue siendo el mismo.</p><button class="button" type="submit">Guardar cantidad</button>`,data=>action(()=>repository.capacity(d.id,data.get('capacity')),()=>{dialog.close();notify('Cantidad de participantes actualizada.');}));
}
function partnerForm(d,id) {
  const p=d.people[id];
  const options=d.participants.filter(other=>other.id!==id&&(!other.partnerId||other.partnerId===id));
  openDialog(`Pareja de ${p.name}`,`<label class="field">Elegí una persona<select name="partner"><option value="">Sin pareja en el encuentro</option>${options.map(other=>`<option value="${esc(other.id)}" ${p.partnerId===other.id?'selected':''}>${esc(other.name)}</option>`).join('')}</select></label><p class="hint">No podrán tocarse entre sí. Cada persona puede tener una pareja.</p><button class="button" type="submit">Guardar pareja</button>`,data=>action(()=>repository.partner(d.id,id,String(data.get('partner'))),()=>{dialog.close();notify('Pareja actualizada.');}));
}
async function copyLink(link) {
  try { await navigator.clipboard.writeText(link); notify('Enlace copiado. Pegalo en el chat de tu familia.'); }
  catch { openDialog('Copiá tu invitación',`${field('link','Enlace',`readonly value="${esc(link)}"`)}<p>Mantené presionado el enlace para copiarlo.</p><button type="submit" class="button">Listo</button>`,()=>dialog.close());dialog.querySelector('input').select(); }
}
function hideSecret() {
  revealRevision++;
  const secret=document.querySelector('#secret');if(secret){secret.textContent='';secret.hidden=true;}
  const button=document.querySelector('#reveal');if(button)button.textContent='Revelar mi amigo invisible';
  secretVisible=false;
}
function renderRoute() {
  if(!ready)return;
  unsubscribe?.();unsubscribe=null;revision++;hideSecret();current=null;
  const token=revision;
  if(dialog.open&&!busy)dialog.close();
  const route=location.hash.match(/^#(join|draw)\/([a-f0-9]{48})$/);
  if(location.hash && !route){
    app.innerHTML='<section class="empty card"><h1>Ese enlace no es válido.</h1><p>Revisá la invitación o volvé a tus encuentros.</p><a class="button" href="#">Volver al inicio</a></section>';return;
  }
  if(!user){login(Boolean(route));return;}
  if(!route){home(token);return;}
  app.innerHTML='<p class="loading" role="status">Abriendo el encuentro…</p>';
  unsubscribe=repository.subscribe(route[2],d=>{
    if(token!==revision)return;
    hideSecret();showEncounter(d);
  },error=>{
    if(token!==revision)return;
    app.innerHTML=`<section class="empty card"><h2>No pudimos abrir el encuentro.</h2><p role="alert">${esc(errorMessage(error))}</p><a class="button" href="#">Mis encuentros</a></section>`;
  });
}
window.addEventListener('hashchange',renderRoute);
window.addEventListener('blur',hideSecret);
window.addEventListener('pagehide',hideSecret);
document.addEventListener('visibilitychange',()=>{if(document.hidden)hideSecret();});
window.addEventListener('offline',()=>{hideSecret();notify('Estás sin conexión. Conectate a Internet para consultar y guardar encuentros.');});
onAuthStateChanged(auth,value=>{user=value;ready=true;header();if(dialog.open)dialog.close();renderRoute();},()=>{app.innerHTML='<p role="alert">No pudimos iniciar la conexión. Recargá la página.</p>';});
document.querySelector('#install-help').onclick=()=>openDialog('Siempre a mano','<p><strong>En iPhone:</strong> abrí esta página en Safari, tocá Compartir y luego «Agregar a inicio».</p><p><strong>En Android:</strong> abrila en Chrome y buscá «Agregar a pantalla principal» en el menú.</p><p>Necesitás Internet para consultar tus encuentros. Si Google no abre desde WhatsApp, usá «Abrir en el navegador».</p><button class="button" type="submit">Entendido</button>',()=>dialog.close());
document.querySelector('#privacy').onclick=()=>openDialog('Tu sorpresa, cuidada','<p>Usamos Firebase Authentication para identificar tu cuenta y Firestore para guardar encuentros. El enlace de invitación permite a personas con sesión iniciada ver la lista familiar: compartilo solo con participantes.</p><p>Cada cuenta puede consultar únicamente su resultado. El organizador calcula las asignaciones en su dispositivo y debe ser de confianza; el administrador del proyecto también puede acceder a los datos.</p><p>El resultado se oculta al cambiar de pestaña. Una web no puede impedir capturas de pantalla. La sesión queda guardada en este navegador hasta que cierres sesión.</p><p>No usamos publicidad ni analítica. GitHub Pages y Firebase procesan los datos técnicos necesarios para prestar el servicio.</p><button class="button" type="submit">Entendido</button>',()=>dialog.close());
