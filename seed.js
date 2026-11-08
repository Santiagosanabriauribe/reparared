'use strict';
const { db, hashPw, metaGet, metaSet, tx } = require('./db');
const seedData = require('./seed-data');

const DEMO_PASS = 'demo1234';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@reparared.demo';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'admin1234';

const REP_EMAILS = {
  r1: 'marta@reparared.demo', r2: 'jhon@reparared.demo', r3: 'luzdary@reparared.demo',
  r4: 'oscar@reparared.demo', r5: 'camila@reparared.demo', r6: 'hernando@reparared.demo',
  r7: 'diana@reparared.demo', r8: 'wilson@reparared.demo', r9: 'andrea@reparared.demo',
  r10: 'taller@reparared.demo'
};

function addUser(email, nombre, rol, barrio, pass) {
  const { salt, hash } = hashPw(pass);
  const r = db.prepare('INSERT INTO users(email,nombre,rol,barrio,salt,hash,creado) VALUES(?,?,?,?,?,?,?)')
    .run(email, nombre, rol, barrio || null, salt, hash, Date.now());
  return Number(r.lastInsertRowid);
}

function ensureAdmin() {
  const ex = db.prepare('SELECT id FROM users WHERE rol=?').get('admin');
  if (!ex) addUser(ADMIN_EMAIL, 'Administración ReparaRed', 'admin', null, ADMIN_PASS);
}

function pad(n) { return String(n).padStart(2, '0'); }
function dateIn(days) {
  const d = new Date(Date.now() + days * 86400000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function seedJornadas() {
  const J = [
    ['j1', 'Jornada de reparación', 'Jornada de reparación comunitaria', 12, '9:00 a. m. – 1:00 p. m.', 'Campus UPB Bucaramanga, lugar por confirmar', 40, 23, ['ropa', 'tec', 'hogar'], 'Trae ropa, pequeños electrónicos, lámparas o bicicletas. Reparadores y voluntarios hacen diagnóstico y arreglos sencillos.'],
    ['j2', 'Taller', 'Taller de auto-reparación segura: costura básica', 17, '4:00 – 6:00 p. m.', 'Campus UPB Bucaramanga', 20, 14, ['ropa'], 'Botones, descosidos y cierres trabados. Incluye kit de costura para practicar.'],
    ['j3', 'Jornada de reparación', 'Jornada barrial de reparación', 26, '8:00 a. m. – 12:00 m.', 'Salón comunal en Floridablanca, por confirmar', 35, 9, ['muebles', 'hogar', 'ropa'], 'Sillas, juguetes, utensilios y arreglos de ropa con el taller comunal y carpinteros aliados.'],
    ['j4', 'Taller', 'Taller: baterías y equipos, cuándo no abrirlos', 30, '5:00 – 6:30 p. m.', 'Virtual', 60, 18, ['tec'], 'Cuidado de baterías, respaldo de datos y señales de que un equipo debe ir a un técnico o a posconsumo.']
  ];
  const st = db.prepare('INSERT INTO jornadas(id,tipo,t,fecha,hora,lugar,cupos,ocup,cats,d) VALUES(?,?,?,?,?,?,?,?,?,?)');
  for (const j of J) st.run(j[0], j[1], j[2], dateIn(j[3]), j[4], j[5], j[6], j[7], JSON.stringify(j[8]), j[9]);
}

function seedDemo() {
  const now = Date.now();
  const { reps, reqs } = seedData(now);
  tx(() => {
    const otro = addUser('otro@reparared.demo', 'Usuario de ejemplo', 'usuario', 'Centro', DEMO_PASS);
    const demo = addUser('demo@reparared.demo', 'Valentina (ejemplo)', 'usuario', 'Campus UPB (Floridablanca)', DEMO_PASS);
    const owners = { 'u-otro': otro, 'u-demo': demo };

    const insRep = db.prepare(`INSERT INTO reps(id,user_id,nombre,oficio,cats,skills,barrio,km,exp,trabajos,resp,verif,protocolo,volunt,nivel,bio)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insRes = db.prepare('INSERT INTO resenas(rep_id,folio,u,s,t,fecha) VALUES(?,?,?,?,?,?)');
    for (const r of reps) {
      const uid = addUser(REP_EMAILS[r.id], r.nombre, 'reparador', r.barrio, DEMO_PASS);
      insRep.run(r.id, uid, r.nombre, r.oficio, JSON.stringify(r.cats), JSON.stringify(r.skills), r.barrio, r.km, r.exp,
        r.trabajos, r.resp, r.verif ? 1 : 0, r.protocolo ? 1 : 0, r.volunt ? 1 : 0, r.nivel, r.bio);
      r.resenas.forEach((x, i) => insRes.run(r.id, null, x.u, x.s, x.t, now - (i + 3) * 86400000));
    }

    const insReq = db.prepare(`INSERT INTO reqs(folio,owner_id,cat,sub,titulo,descr,barrio,fecha,estado,elegido,res,fotos,riesgos,franjas,cita,jornada)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insProp = db.prepare('INSERT INTO props(folio,rep_id,pmin,pmax,diag,dias,horas,fecha) VALUES(?,?,?,?,?,?,?,?)');
    for (const q of reqs) {
      const cita = q.elegido ? { dia: 'Próximo sábado', franja: 'Mañana' } : null;
      insReq.run(q.folio, owners[q.owner], q.cat, q.sub, q.titulo, q.desc, q.barrio, q.fecha, q.estado, q.elegido || null,
        q.res ? JSON.stringify(q.res) : null, '[]', '[]', JSON.stringify(['Tarde']), cita ? JSON.stringify(cita) : null, 0);
      for (const p of q.props) insProp.run(q.folio, p.repId, p.min, p.max, p.diag, p.dias, p.horas, q.fecha + 3600000 * p.horas);
    }
    metaSet('folio', 41);
    seedJornadas();
  });
}

function seedIfEmpty() {
  if (metaGet('seeded', '') === '1') { ensureAdmin(); return; }
  const has = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (!has) {
    if (process.env.SEED_DEMO === '1') { seedDemo(); metaSet('demo', '1'); }
    else { metaSet('folio', 1); metaSet('demo', '0'); }
  }
  metaSet('seeded', '1');
  ensureAdmin();
}

module.exports = { seedIfEmpty, ADMIN_EMAIL };
