let currentRoom=null,currentName=null;
const $=id=>document.getElementById(id);
function show(id){
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
  $(id).classList.add('active');
  window.scrollTo({top:0,behavior:'smooth'});
}
function msg(id,t){$(id).textContent=t}
async function api(url,opt={}){const r=await fetch(url,{headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt});const d=await r.json();if(!r.ok)throw Error(d.error||'Erro');return d}
async function createRoom(){try{const d=await api('/api/rooms',{method:'POST',body:JSON.stringify({name:$('roomName').value,password:$('hostPass').value})});currentRoom=d.id;$('hostTitle').textContent=d.name;$('roomLink').textContent=location.origin+'/?room='+d.id;show('host')}catch(e){msg('createMsg',e.message)}}
async function saveParticipants(){try{const names=$('names').value.split('\n').map(x=>x.trim()).filter(Boolean);await api('/api/rooms/'+currentRoom+'/participants',{method:'POST',body:JSON.stringify({names})});await refreshHost();msg('hostMsg','Participantes salvos. Agora eles podem entrar pelo link.')}catch(e){msg('hostMsg',e.message)}}
async function refreshHost(){const d=await api('/api/rooms/'+currentRoom+'/host');$('people').innerHTML=d.participants.map(p=>`<div class="person"><span>${escapeHtml(p.name)}</span><span class="status">${p.registered?'senha criada':'aguardando senha'}</span></div>`).join('')}
async function copyLink(){await navigator.clipboard.writeText(location.origin+'/?room='+currentRoom);msg('hostMsg','Link copiado!')}
async function openRoom(){let v=$('roomCode').value.trim();try{if(v.includes('room='))v=v.split('room=')[1].split('&')[0];const d=await api('/api/rooms/'+v+'/public');currentRoom=d.id;$('joinTitle').textContent=d.name;$('namesList').innerHTML=d.participants.map(p=>`<button class="namebtn" onclick="selectName('${encodeURIComponent(p.name)}')">${escapeHtml(p.name)}</button>`).join('');show('choose')}catch(e){msg('joinMsg',e.message)}}
function selectName(n){currentName=decodeURIComponent(n);$('selectedName').textContent=currentName;$('passHelp').textContent='Digite sua senha. Na primeira entrada, ela será criada para proteger seu resultado.';show('login')}
async function loginUser(){try{await api('/api/rooms/'+currentRoom+'/login',{method:'POST',body:JSON.stringify({name:currentName,password:$('userPass').value})}).catch(async e=>{ // if not registered, try registration
  const d=await api('/api/rooms/'+currentRoom+'/public'); const p=d.participants.find(x=>x.name===currentName);
  if(p?.registered) throw e;
  return api('/api/rooms/'+currentRoom+'/register',{method:'POST',body:JSON.stringify({name:currentName,password:$('userPass').value})});
});const d=await api('/api/rooms/'+currentRoom+'/me');if(d.result){$('resultName').textContent=d.name;$('secretName').textContent=d.result.secret;$('prankName').textContent=d.result.prank;show('result')}else{msg('loginMsg','Você já entrou, mas o anfitrião ainda não realizou o sorteio.')}}catch(e){msg('loginMsg',e.message)}}
async function draw(){if(!confirm('Tem certeza que quer realizar o sorteio? Depois disso os participantes não poderão ser alterados.'))return;try{const d=await api('/api/rooms/'+currentRoom+'/draw',{method:'POST'});msg('hostMsg',`Sorteio realizado com ${d.count} participantes. Cada pessoa deve entrar com sua senha para ver os nomes.`);await refreshHost()}catch(e){msg('hostMsg',e.message)}}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
(async()=>{const r=new URLSearchParams(location.search).get('room');if(r){$('roomCode').value=r;await openRoom()}})();
