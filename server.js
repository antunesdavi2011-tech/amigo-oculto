import express from 'express';
import session from 'express-session';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1);
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data.sqlite');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  host_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT,
  UNIQUE(room_id, name)
);
CREATE TABLE IF NOT EXISTS draws (
  room_id TEXT NOT NULL,
  participant_id INTEGER NOT NULL,
  secret_id INTEGER NOT NULL,
  prank_id INTEGER NOT NULL,
  PRIMARY KEY(room_id, participant_id)
);
`);

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(session({
  secret: process.env.SESSION_SECRET || 'troque-esta-chave-em-producao',
  resave:false,
  saveUninitialized:false,
  cookie:{httpOnly:true, sameSite:'lax', secure: process.env.NODE_ENV === 'production'}
}));
app.use(express.static(path.join(__dirname,'public')));

const hash = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const roomId = () => crypto.randomBytes(4).toString('hex').toUpperCase();

function validRoom(id){
  return db.prepare('SELECT * FROM rooms WHERE id=?').get(id);
}

app.post('/api/rooms', (req,res)=>{
  const name = String(req.body.name||'').trim();
  const password = String(req.body.password||'');
  if(!name || password.length < 4) return res.status(400).json({error:'Informe o nome da sala e uma senha de pelo menos 4 caracteres.'});
  const id = roomId();
  db.prepare("INSERT INTO rooms(id,name,host_hash,created_at) VALUES(?,?,?,datetime('now'))")
    .run(id,name,hash(password));
  req.session.hostRoom=id;
  res.json({id,name});
});

app.post('/api/rooms/:id/participants', (req,res)=>{
  const room=validRoom(req.params.id);
  if(!room || req.session.hostRoom!==room.id) return res.status(403).json({error:'Acesso de anfitrião negado.'});
  if(room.status!=='waiting') return res.status(400).json({error:'O sorteio já foi realizado.'});
  const names=(req.body.names||[]).map(x=>String(x).trim()).filter(Boolean);
  if(names.length<3) return res.status(400).json({error:'Adicione pelo menos 3 participantes.'});
  const insert=db.prepare('INSERT OR IGNORE INTO participants(room_id,name) VALUES(?,?)');
  const tx=db.transaction(()=>names.forEach(n=>insert.run(room.id,n)));
  tx();
  res.json({participants:db.prepare('SELECT id,name,password_hash IS NOT NULL AS registered FROM participants WHERE room_id=? ORDER BY id').all(room.id)});
});

app.post('/api/rooms/:id/register', (req,res)=>{
  const room=validRoom(req.params.id);
  if(!room) return res.status(404).json({error:'Sala não encontrada.'});
  const name=String(req.body.name||'').trim(), password=String(req.body.password||'');
  const p=db.prepare('SELECT * FROM participants WHERE room_id=? AND name=?').get(room.id,name);
  if(!p) return res.status(404).json({error:'Nome não encontrado nesta sala.'});
  if(password.length<4) return res.status(400).json({error:'A senha precisa ter pelo menos 4 caracteres.'});
  if(p.password_hash && p.password_hash!==hash(password)) return res.status(401).json({error:'Senha incorreta.'});
  db.prepare('UPDATE participants SET password_hash=? WHERE id=?').run(hash(password),p.id);
  req.session.participantId=p.id;
  req.session.participantRoom=room.id;
  res.json({ok:true,name});
});

app.post('/api/rooms/:id/login', (req,res)=>{
  const room=validRoom(req.params.id);
  if(!room) return res.status(404).json({error:'Sala não encontrada.'});
  const name=String(req.body.name||'').trim(), password=String(req.body.password||'');
  const p=db.prepare('SELECT * FROM participants WHERE room_id=? AND name=?').get(room.id,name);
  if(!p || !p.password_hash || p.password_hash!==hash(password)) return res.status(401).json({error:'Nome ou senha incorretos.'});
  req.session.participantId=p.id; req.session.participantRoom=room.id;
  res.json({ok:true});
});

app.get('/api/rooms/:id/public',(req,res)=>{
  const room=validRoom(req.params.id);
  if(!room) return res.status(404).json({error:'Sala não encontrada.'});
  res.json({id:room.id,name:room.name,status:room.status,
    participants:db.prepare('SELECT name,password_hash IS NOT NULL AS registered FROM participants WHERE room_id=? ORDER BY id').all(room.id)});
});

app.get('/api/rooms/:id/me',(req,res)=>{
  const room=validRoom(req.params.id);
  if(!room || req.session.participantRoom!==room.id) return res.status(403).json({error:'Faça login primeiro.'});
  const p=db.prepare('SELECT id,name FROM participants WHERE id=? AND room_id=?').get(req.session.participantId,room.id);
  if(!p) return res.status(403).json({error:'Participante inválido.'});
  const d=db.prepare(`
    SELECT s.name AS secret, pr.name AS prank
    FROM draws d
    JOIN participants s ON s.id=d.secret_id
    JOIN participants pr ON pr.id=d.prank_id
    WHERE d.room_id=? AND d.participant_id=?`).get(room.id,p.id);
  res.json({name:p.name,status:room.status,result:d||null});
});

app.post('/api/rooms/:id/draw',(req,res)=>{
  const room=validRoom(req.params.id);
  if(!room || req.session.hostRoom!==room.id) return res.status(403).json({error:'Acesso de anfitrião negado.'});
  if(room.status!=='waiting') return res.status(400).json({error:'O sorteio já foi realizado.'});
  const ps=db.prepare('SELECT id FROM participants WHERE room_id=?').all(room.id);
  if(ps.length<3) return res.status(400).json({error:'São necessários pelo menos 3 participantes.'});

  // Sorteia por embaralhamento até que as duas permutações tenham:
  // 1) ninguém consigo mesmo; 2) Oculto != Onça.
  function shuffle(a){
    const b=[...a];
    for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}
    return b;
  }
  let secret, prank, tries=0;
  do {
    secret=shuffle(ps.map(x=>x.id));
    prank=shuffle(ps.map(x=>x.id));
    tries++;
  } while (
    tries<10000 &&
    ps.some((p,i)=>secret[i]===p.id || prank[i]===p.id || secret[i]===prank[i])
  );
  if(tries>=10000) return res.status(500).json({error:'Não foi possível gerar um sorteio válido. Tente novamente.'});

  const ins=db.prepare('INSERT INTO draws(room_id,participant_id,secret_id,prank_id) VALUES(?,?,?,?)');
  const tx=db.transaction(()=>ps.forEach((p,i)=>ins.run(room.id,p.id,secret[i],prank[i])));
  tx();
  db.prepare('UPDATE rooms SET status="drawn" WHERE id=?').run(room.id);
  res.json({ok:true,count:ps.length});
});

app.get('/api/rooms/:id/host',(req,res)=>{
  const room=validRoom(req.params.id);
  if(!room || req.session.hostRoom!==room.id) return res.status(403).json({error:'Acesso de anfitrião negado.'});
  res.json({room,participants:db.prepare('SELECT id,name,password_hash IS NOT NULL AS registered FROM participants WHERE room_id=? ORDER BY id').all(room.id)});
});

app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));



app.use((req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

const port=process.env.PORT||3000;
app.listen(port,()=>console.log(`Amigo Oculto + Onça rodando na porta ${port}`));
