'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db, J, hashPw, checkPw, metaGet, nextFolio, tx, DB_PATH } = require('./db');
const { seedIfEmpty } = require('./seed');

seedIfEmpty();

const PORT = +process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const COMISION = 0.08;

/* ---------- utilidades ---------- */
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = (msg, status = 400) => { throw new HttpError(status, msg); };
const str = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const arr = v => (Array.isArray(v) ? v : []);
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const CONTACT = /\b3\d{9}\b|\d{3}[\s-]?\d{3}[\s-]?\d{4}|@\S+\.\S+/;
const ESTADOS_ABIERTOS = ['publicada', 'propuestas'];

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > 25 * 1024 * 1024) { reject(new HttpError(413, 'Archivo demasiado grande')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new HttpError(400, 'JSON inválido')); }
    });
    req.on('error', reject);
  });
}

function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data);
  res.writeHead(status, Object.assign({
    'Content-Type': typeof data === 'object' && !Buffer.isBuffer(data) ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store'
  }, headers));
  res.end(body);
}

/* ---------- sesión ---------- */
function userFromReq(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return null;
  const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?`).get(token);
  return row ? { ...row, token } : null;
}
function userOut(u) {
  if (!u) return null;
  const out = { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, barrio: u.barrio };
  if (u.rol === 'reparador') {
    const r = db.prepare('SELECT id FROM reps WHERE user_id=?').get(u.id);
    if (r) out.repId = r.id;
  }
  return out;
}
function newSession(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions(token,user_id,creado) VALUES(?,?,?)').run(token, userId, Date.now());
  return token;
}
const need = (u, ...roles) => { if (!u) bad('Debes iniciar sesión', 401); if (roles.length && !roles.includes(u.rol)) bad('No tienes permiso para esto', 403); return u; };
const myRep = u => db.prepare('SELECT * FROM reps WHERE user_id=?').get(u.id);

/* ---------- serialización ---------- */
function repOut(r) {
  const resenas = db.prepare('SELECT u,s,t FROM resenas WHERE rep_id=? ORDER BY fecha DESC, id DESC').all(r.id);
  const hechos = db.prepare(`SELECT folio,titulo,res FROM reqs WHERE elegido=? AND estado='reparada' ORDER BY fecha DESC`).all(r.id)
    .map(h => ({ folio: h.folio, titulo: h.titulo, rating: (J(h.res, {}) || {}).rating || 0 }));
  const hs = db.prepare('SELECT AVG(horas) AS h FROM props WHERE rep_id=?').get(r.id).h;
  const resp = hs != null ? Math.max(1, Math.round(hs)) : r.resp;
  return {
    id: r.id, nombre: r.nombre, oficio: r.oficio, cats: J(r.cats, []), skills: J(r.skills, []), barrio: r.barrio,
    km: r.km, exp: r.exp, trabajos: r.trabajos, resp, verif: !!r.verif, protocolo: !!r.protocolo,
    volunt: !!r.volunt, nivel: r.nivel, bio: r.bio, resenas, hechos
  };
}
function propsOf(folio) {
  return db.prepare('SELECT rep_id,pmin,pmax,diag,dias,horas FROM props WHERE folio=? ORDER BY id').all(folio)
    .map(p => ({ repId: p.rep_id, min: p.pmin, max: p.pmax, diag: p.diag, dias: p.dias, horas: p.horas }));
}
function reqOut(r) {
  return {
    folio: r.folio, cat: r.cat, sub: r.sub, titulo: r.titulo, desc: r.descr, barrio: r.barrio, fecha: r.fecha,
    estado: r.estado, elegido: r.elegido, res: J(r.res), fotos: J(r.fotos, []), riesgos: J(r.riesgos, []),
    franjas: J(r.franjas, []), cita: J(r.cita), jornada: !!r.jornada, props: propsOf(r.folio)
  };
}
function jornadaOut(j, userId) {
  const inscr = db.prepare('SELECT COUNT(*) AS n FROM inscritos WHERE jornada_id=?').get(j.id).n;
  const yo = userId ? !!db.prepare('SELECT 1 FROM inscritos WHERE user_id=? AND jornada_id=?').get(userId, j.id) : false;
  const dt = new Date(j.fecha + 'T12:00:00');
  return {
    id: j.id, tipo: j.tipo, t: j.t, fecha: j.fecha,
    fechaTxt: dt.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }),
    hora: j.hora, lugar: j.lugar, cupos: j.cupos, ocup: j.ocup + inscr, cats: J(j.cats, []), d: j.d, inscrito: yo
  };
}
function metricsAll() {
  const R = db.prepare('SELECT * FROM reqs ORDER BY fecha').all().map(reqOut);
  const reparadas = R.filter(r => r.estado === 'reparada');
  const cerradas = R.filter(r => r.estado === 'reparada' || r.estado === 'noreparable');
  const conResp = R.filter(r => r.props.length);
  const en48 = conResp.filter(r => Math.min(...r.props.map(p => p.horas)) <= 48);
  const ratings = cerradas.map(r => r.res && r.res.rating).filter(Boolean);
  const transado = reparadas.reduce((a, r) => a + ((r.res && r.res.precio) || 0), 0);
  const kg = cerradas.filter(r => r.res && r.res.medido).reduce((a, r) => a + r.res.kg, 0);
  const sinMedir = reparadas.filter(r => !(r.res && r.res.medido)).length;
  const derivados = R.filter(r => r.estado === 'noreparable' && r.res && r.res.ruta).length;
  const repsVerif = db.prepare('SELECT COUNT(*) AS n FROM reps WHERE verif=1 AND protocolo=1').get().n;
  const mes = reparadas.filter(r => Date.now() - r.fecha < 30 * 86400000).length;
  const metrics = {
    publicadas: R.length, reparadas: reparadas.length, cerradas: cerradas.length,
    tasa: cerradas.length ? reparadas.length / cerradas.length : 0,
    resp48: conResp.length ? en48.length / conResp.length : 0, conResp: conResp.length,
    satisf: avg(ratings), transado, comision: transado * COMISION,
    ticket: reparadas.length ? transado / reparadas.length : 0, kg, sinMedir, derivados, repsVerif, mes
  };
  const log = R.slice().reverse().map(r => ({
    folio: r.folio, titulo: r.titulo, estado: r.estado,
    primera: r.props.length ? Math.min(...r.props.map(p => p.horas)) : null,
    precio: r.estado === 'reparada' && r.res ? r.res.precio : null,
    kg: r.res && r.res.medido ? r.res.kg : null
  }));
  const recent = reparadas.slice(-3).reverse().map(r => {
    const rep = r.elegido ? db.prepare('SELECT nombre FROM reps WHERE id=?').get(r.elegido) : null;
    return {
      folio: r.folio, titulo: r.titulo, cat: r.cat, fotoAntes: r.fotos[0] || null,
      fotoDespues: r.res && r.res.fotoDespues && r.res.autorizaFoto ? r.res.fotoDespues : null,
      rep: rep ? rep.nombre : '', precio: r.res ? r.res.precio : 0, rating: r.res ? r.res.rating : 0
    };
  });
  return { metrics, log, recent };
}
function threadsFor(u) {
  let rows;
  if (u.rol === 'reparador') {
    const rep = myRep(u); if (!rep) return [];
    rows = db.prepare(`SELECT rep_id,user_id,folio,MAX(id) AS last FROM chat WHERE rep_id=? GROUP BY rep_id,user_id,folio`).all(rep.id);
  } else {
    rows = db.prepare(`SELECT rep_id,user_id,folio,MAX(id) AS last FROM chat WHERE user_id=? GROUP BY rep_id,user_id,folio`).all(u.id);
  }
  return rows.map(r => {
    const m = db.prepare('SELECT w,t,fecha FROM chat WHERE id=?').get(r.last);
    const usr = db.prepare('SELECT nombre FROM users WHERE id=?').get(r.user_id);
    const rep = db.prepare('SELECT nombre FROM reps WHERE id=?').get(r.rep_id);
    const rq = r.folio ? db.prepare('SELECT titulo FROM reqs WHERE folio=?').get(r.folio) : null;
    return {
      repId: r.rep_id, repNombre: rep ? rep.nombre : '', userId: r.user_id, userNombre: usr ? usr.nombre : '',
      folio: r.folio, titulo: rq ? rq.titulo : '', last: m.t, w: m.w, fecha: m.fecha
    };
  }).sort((a, b) => b.fecha - a.fecha);
}
function panelFor(u) {
  const rep = myRep(u); if (!rep) return null;
  const cats = J(rep.cats, []), skills = J(rep.skills, []);
  const all = db.prepare('SELECT * FROM reqs ORDER BY fecha DESC').all().map(r => Object.assign(reqOut(r), {
    ownerId: r.owner_id, ownerNombre: (db.prepare('SELECT nombre FROM users WHERE id=?').get(r.owner_id) || {}).nombre
  }));
  const abiertas = all.filter(r => ESTADOS_ABIERTOS.includes(r.estado) && cats.includes(r.cat) && skills.includes(r.sub)
    && !r.props.some(p => p.repId === rep.id) && !(r.riesgos.some(x => x !== 'datos') && !rep.protocolo));
  const enviadas = all.filter(r => r.estado === 'propuestas' && r.props.some(p => p.repId === rep.id));
  const agenda = all.filter(r => r.elegido === rep.id && r.estado === 'agendada');
  const hechos = all.filter(r => r.elegido === rep.id && r.estado === 'reparada');
  return { abiertas, enviadas, agenda, hechos };
}

/* ---------- bootstrap ---------- */
function bootstrap(u) {
  const reps = db.prepare('SELECT * FROM reps ORDER BY CAST(SUBSTR(id,2) AS INTEGER)').all().map(repOut);
  const jornadas = db.prepare('SELECT * FROM jornadas ORDER BY fecha').all().map(j => jornadaOut(j, u && u.id));
  const out = Object.assign({ user: userOut(u), reps, jornadas, demo: metaGet('demo', '0') === '1', comision: COMISION }, metricsAll());
  out.reqs = []; out.reclamos = []; out.panel = null; out.threads = [];
  if (u) {
    if (u.rol === 'usuario') {
      out.reqs = db.prepare('SELECT * FROM reqs WHERE owner_id=? ORDER BY fecha').all(u.id).map(reqOut);
      out.reclamos = db.prepare('SELECT * FROM reclamos WHERE user_id=? ORDER BY fecha').all(u.id)
        .map(c => ({ id: c.id, folio: c.folio, motivo: c.motivo, detalle: c.detalle, fecha: c.fecha, limite: c.limite, estado: c.estado, respuesta: c.respuesta }));
    }
    if (u.rol === 'reparador') out.panel = panelFor(u);
    if (u.rol !== 'admin') out.threads = threadsFor(u);
  }
  return out;
}

/* ---------- rutas ---------- */
const routes = [];
const route = (method, pattern, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn });

route('GET', '/api/bootstrap', ({ user }) => bootstrap(user));

route('POST', '/api/auth/register', ({ body }) => {
  const nombre = str(body.nombre, 80), email = str(body.email, 120).toLowerCase(), pass = String(body.password || '');
  const rol = body.rol === 'reparador' ? 'reparador' : 'usuario';
  if (!nombre) bad('Escribe tu nombre.');
  if (!/^\S+@\S+\.\S+$/.test(email)) bad('Escribe un correo válido.');
  if (pass.length < 6) bad('La contraseña debe tener al menos 6 caracteres.');
  if (!body.acepta) bad('Debes aceptar los términos y el tratamiento de datos.');
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) bad('Ya existe una cuenta con ese correo.', 409);
  const { salt, hash } = hashPw(pass);
  const barrio = str(body.barrio, 80);
  const token = tx(() => {
    const r = db.prepare('INSERT INTO users(email,nombre,rol,barrio,salt,hash,creado) VALUES(?,?,?,?,?,?,?)').run(email, nombre, rol, barrio, salt, hash, Date.now());
    const uid = Number(r.lastInsertRowid);
    if (rol === 'reparador') {
      const id = 'r' + uid + 'n';
      const cat = str(body.cat, 20) || 'hogar';
      const skills = arr(body.skills).map(s => str(s, 40));
      db.prepare(`INSERT INTO reps(id,user_id,nombre,oficio,cats,skills,barrio,km,exp,trabajos,resp,verif,protocolo,volunt,nivel,bio)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, uid, nombre, str(body.oficio, 80) || 'Oficio por definir', JSON.stringify([cat]), JSON.stringify(skills), barrio, null,
          Math.max(0, Math.min(60, num(body.exp))), 0, null, 0, 0, 0, '', '');
    }
    return newSession(uid);
  });
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  return { token, user: userOut(u) };
});

route('POST', '/api/auth/login', ({ body }) => {
  const email = str(body.email, 120).toLowerCase();
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!u || !checkPw(body.password || '', u.salt, u.hash)) bad('Correo o contraseña incorrectos.', 401);
  return { token: newSession(u.id), user: userOut(u) };
});

route('POST', '/api/auth/logout', ({ user }) => {
  if (user) db.prepare('DELETE FROM sessions WHERE token=?').run(user.token);
  return { ok: true };
});

/* --- solicitudes --- */
route('POST', '/api/reqs', ({ user, body }) => {
  need(user, 'usuario');
  const cat = str(body.cat, 20), sub = str(body.sub, 40), titulo = str(body.titulo, 70), desc = str(body.desc, 500);
  if (!cat || !sub) bad('Elige qué se dañó.');
  if (titulo.length < 4) bad('Escribe un título de al menos 4 caracteres.');
  if (desc.length < 10) bad('Describe el daño con un poco más de detalle.');
  const fotos = arr(body.fotos).slice(0, 3).filter(f => typeof f === 'string' && f.length < 4 * 1024 * 1024);
  const folio = tx(() => {
    const f = nextFolio();
    db.prepare(`INSERT INTO reqs(folio,owner_id,cat,sub,titulo,descr,barrio,fecha,estado,fotos,riesgos,franjas,jornada)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(f, user.id, cat, sub, titulo, desc, str(body.barrio, 80), Date.now(), 'publicada', JSON.stringify(fotos),
        JSON.stringify(arr(body.riesgos).map(x => str(x, 20))), JSON.stringify(arr(body.franjas).map(x => str(x, 20))), body.jornada ? 1 : 0);
    return f;
  });
  return { folio };
});

function ownReq(user, folio) {
  need(user, 'usuario');
  const r = db.prepare('SELECT * FROM reqs WHERE folio=?').get(folio);
  if (!r) bad('No existe esa solicitud.', 404);
  if (r.owner_id !== user.id) bad('Esta solicitud no es tuya.', 403);
  return r;
}
function sysChat(folio, repId, userId, t) {
  db.prepare('INSERT INTO chat(folio,rep_id,user_id,w,t,fecha) VALUES(?,?,?,?,?,?)').run(folio, repId, userId, 'sys', t, Date.now());
}

route('POST', '/api/reqs/:folio/props', ({ user, params, body }) => {
  need(user, 'reparador');
  const rep = myRep(user); if (!rep) bad('No tienes perfil de reparador.', 403);
  if (!rep.verif) bad('Tu identidad aún no está verificada; un administrador debe validarla antes de enviar propuestas.', 403);
  const r = db.prepare('SELECT * FROM reqs WHERE folio=?').get(params.folio);
  if (!r) bad('No existe esa solicitud.', 404);
  if (!ESTADOS_ABIERTOS.includes(r.estado)) bad('Esta solicitud ya no recibe propuestas.');
  const riesgo = J(r.riesgos, []).some(x => x !== 'datos');
  if (riesgo && !rep.protocolo) bad('Debes aceptar el protocolo de seguridad para atender solicitudes con riesgo.', 403);
  const diag = str(body.diag, 300), pmin = Math.round(num(body.min)), pmax = Math.round(num(body.max)), dias = Math.max(1, Math.min(30, Math.round(num(body.dias, 1))));
  if (diag.length < 10) bad('Escribe un diagnóstico de al menos 10 caracteres.');
  if (!(pmin > 0) || !(pmax >= pmin)) bad('Revisa el rango de precios.');
  if (db.prepare('SELECT 1 FROM props WHERE folio=? AND rep_id=?').get(r.folio, rep.id)) bad('Ya enviaste una propuesta para esta solicitud.', 409);
  const horas = Math.max(1, Math.round((Date.now() - r.fecha) / 3600000));
  tx(() => {
    db.prepare('INSERT INTO props(folio,rep_id,pmin,pmax,diag,dias,horas,fecha) VALUES(?,?,?,?,?,?,?,?)').run(r.folio, rep.id, pmin, pmax, diag, dias, horas, Date.now());
    db.prepare("UPDATE reqs SET estado='propuestas' WHERE folio=?").run(r.folio);
  });
  return { ok: true };
});

route('POST', '/api/reqs/:folio/pick', ({ user, params, body }) => {
  const r = ownReq(user, params.folio);
  if (!ESTADOS_ABIERTOS.includes(r.estado)) bad('Esta solicitud ya tiene un reparador elegido.');
  const repId = str(body.repId, 40);
  if (!db.prepare('SELECT 1 FROM props WHERE folio=? AND rep_id=?').get(r.folio, repId)) bad('Ese reparador no envió propuesta.');
  const cita = { dia: str(body.dia, 80), franja: str(body.franja, 60) };
  if (body.lugar) cita.lugar = str(body.lugar, 200);
  if (!cita.dia) bad('Elige un día para la cita.');
  tx(() => {
    db.prepare("UPDATE reqs SET elegido=?, estado='agendada', cita=? WHERE folio=?").run(repId, JSON.stringify(cita), r.folio);
    sysChat(r.folio, repId, user.id, `Cita agendada: ${cita.dia} · ${cita.franja}.`);
  });
  return { ok: true };
});

route('POST', '/api/reqs/:folio/result', ({ user, params, body }) => {
  const r = ownReq(user, params.folio);
  if (r.estado !== 'agendada') bad('Solo puedes registrar el resultado de una reparación agendada.');
  const resultado = body.resultado === 'noreparable' ? 'noreparable' : 'reparada';
  const rating = Math.max(1, Math.min(5, Math.round(num(body.rating, 5))));
  const comentario = str(body.comentario, 300);
  const foto = typeof body.fotoDespues === 'string' && body.fotoDespues.length < 4 * 1024 * 1024 ? body.fotoDespues : null;
  const res = {
    resultado, precio: resultado === 'reparada' ? Math.max(0, Math.round(num(body.precio))) : 0, rating, comentario,
    kg: Math.max(0, num(body.kg)), medido: !!body.medido, fotoDespues: foto, autorizaFoto: !!body.autorizaFoto
  };
  tx(() => {
    db.prepare('UPDATE reqs SET res=?, estado=? WHERE folio=?').run(JSON.stringify(res), resultado, r.folio);
    db.prepare('INSERT INTO resenas(rep_id,folio,u,s,t,fecha) VALUES(?,?,?,?,?,?)')
      .run(r.elegido, r.folio, user.nombre.split(' ')[0], rating, comentario || 'Sin comentario.', Date.now());
    if (resultado === 'reparada') db.prepare('UPDATE reps SET trabajos=trabajos+1 WHERE id=?').run(r.elegido);
  });
  return { ok: true };
});

route('POST', '/api/reqs/:folio/disposal', ({ user, params, body }) => {
  const r = ownReq(user, params.folio);
  if (r.estado === 'reparada') bad('Esta solicitud ya se reparó.');
  const ruta = str(body.ruta, 120); if (!ruta) bad('Elige una salida.');
  let res = J(r.res);
  tx(() => {
    if (r.estado !== 'noreparable') {
      res = { resultado: 'noreparable', precio: 0, rating: 0, comentario: '', kg: 0, medido: false };
      const elegido = r.elegido || (db.prepare('SELECT rep_id FROM props WHERE folio=? ORDER BY id LIMIT 1').get(r.folio) || {}).rep_id || null;
      db.prepare("UPDATE reqs SET estado='noreparable', elegido=? WHERE folio=?").run(elegido, r.folio);
    }
    res.ruta = ruta;
    db.prepare('UPDATE reqs SET res=? WHERE folio=?').run(JSON.stringify(res), r.folio);
  });
  return { ok: true };
});

route('POST', '/api/reqs/:folio/reclamo', ({ user, params, body }) => {
  const r = ownReq(user, params.folio);
  const detalle = str(body.detalle, 600);
  if (detalle.length < 10) bad('Cuéntanos qué pasó en al menos 10 caracteres.');
  const n = db.prepare('SELECT COUNT(*) AS n FROM reclamos').get().n + 1;
  const id = 'RC-' + String(n).padStart(3, '0');
  db.prepare('INSERT INTO reclamos(id,folio,user_id,motivo,detalle,fecha,limite) VALUES(?,?,?,?,?,?,?)')
    .run(id, r.folio, user.id, str(body.motivo, 120), detalle, Date.now(), Date.now() + 15 * 86400000);
  return { id };
});

/* --- chat --- */
function threadKey(user, q) {
  need(user, 'usuario', 'reparador');
  const repId = str(q.repId, 40);
  const folio = q.folio ? str(q.folio, 20) : null;
  let userId;
  if (user.rol === 'usuario') userId = user.id;
  else {
    const rep = myRep(user);
    if (!rep || rep.id !== repId) bad('No tienes acceso a esta conversación.', 403);
    userId = Math.round(num(q.userId));
    if (!userId) bad('Falta el usuario.');
  }
  if (!db.prepare('SELECT 1 FROM reps WHERE id=?').get(repId)) bad('Reparador no encontrado.', 404);
  return { repId, folio, userId };
}
route('GET', '/api/chat', ({ user, query }) => {
  const k = threadKey(user, query);
  const msgs = db.prepare('SELECT id,w,t,fecha FROM chat WHERE rep_id=? AND user_id=? AND folio IS ? ORDER BY id').all(k.repId, k.userId, k.folio);
  return { msgs: msgs.map(m => ({ id: m.id, w: m.w, t: m.t, fecha: m.fecha, mine: (user.rol === 'usuario' ? m.w === 'user' : m.w === 'rep') })) };
});
route('POST', '/api/chat', ({ user, body }) => {
  const k = threadKey(user, body);
  const t = str(body.t, 800); if (!t) bad('Escribe un mensaje.');
  if (CONTACT.test(t)) {
    sysChat(k.folio, k.repId, k.userId, 'Por seguridad ocultamos teléfonos y correos en el chat. Agenda desde la plataforma.');
    return { filtered: true };
  }
  db.prepare('INSERT INTO chat(folio,rep_id,user_id,w,t,fecha) VALUES(?,?,?,?,?,?)').run(k.folio, k.repId, k.userId, user.rol === 'usuario' ? 'user' : 'rep', t, Date.now());
  return { ok: true };
});

/* --- jornadas --- */
route('POST', '/api/jornadas/:id/toggle', ({ user, params }) => {
  need(user);
  const j = db.prepare('SELECT * FROM jornadas WHERE id=?').get(params.id);
  if (!j) bad('Jornada no encontrada.', 404);
  const ya = db.prepare('SELECT 1 FROM inscritos WHERE user_id=? AND jornada_id=?').get(user.id, j.id);
  if (ya) { db.prepare('DELETE FROM inscritos WHERE user_id=? AND jornada_id=?').run(user.id, j.id); return { inscrito: false }; }
  const o = jornadaOut(j, user.id);
  if (o.ocup >= o.cupos) bad('Esta jornada ya no tiene cupos.', 409);
  db.prepare('INSERT INTO inscritos(user_id,jornada_id) VALUES(?,?)').run(user.id, j.id);
  return { inscrito: true };
});

/* --- perfil de reparador --- */
route('PUT', '/api/me/rep', ({ user, body }) => {
  need(user, 'reparador');
  const rep = myRep(user); if (!rep) bad('No tienes perfil de reparador.', 404);
  const cats = arr(body.cats).map(c => str(c, 20)).filter(Boolean);
  const skills = arr(body.skills).map(c => str(c, 40)).filter(Boolean);
  if (!cats.length) bad('Elige al menos una categoría.');
  if (!skills.length) bad('Elige al menos una especialidad.');
  const km = body.km === '' || body.km == null ? null : Math.max(0, Math.min(500, Math.round(num(body.km) * 10) / 10));
  db.prepare('UPDATE reps SET oficio=?, barrio=?, bio=?, cats=?, skills=?, nivel=?, volunt=?, protocolo=?, exp=?, km=? WHERE id=?')
    .run(str(body.oficio, 80) || rep.oficio, str(body.barrio, 80) || rep.barrio, str(body.bio, 400), JSON.stringify(cats), JSON.stringify(skills),
      str(body.nivel, 40), body.volunt ? 1 : 0, body.protocolo ? 1 : 0, Math.max(0, Math.min(60, Math.round(num(body.exp, rep.exp)))), km, rep.id);
  return { ok: true };
});

/* --- administración --- */
route('GET', '/api/admin', ({ user }) => {
  need(user, 'admin');
  const reps = db.prepare('SELECT * FROM reps ORDER BY verif, CAST(SUBSTR(id,2) AS INTEGER)').all().map(repOut);
  const reclamos = db.prepare('SELECT * FROM reclamos ORDER BY fecha DESC').all().map(c => {
    const u = db.prepare('SELECT nombre FROM users WHERE id=?').get(c.user_id);
    return { id: c.id, folio: c.folio, usuario: u ? u.nombre : '', motivo: c.motivo, detalle: c.detalle, fecha: c.fecha, limite: c.limite, estado: c.estado, respuesta: c.respuesta };
  });
  const jornadas = db.prepare('SELECT * FROM jornadas ORDER BY fecha').all().map(j => jornadaOut(j, null));
  const usuarios = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  return { reps, reclamos, jornadas, usuarios };
});
route('POST', '/api/admin/reps/:id', ({ user, params, body }) => {
  need(user, 'admin');
  const rep = db.prepare('SELECT id FROM reps WHERE id=?').get(params.id);
  if (!rep) bad('Reparador no encontrado.', 404);
  if ('verif' in body) db.prepare('UPDATE reps SET verif=? WHERE id=?').run(body.verif ? 1 : 0, rep.id);
  if ('protocolo' in body) db.prepare('UPDATE reps SET protocolo=? WHERE id=?').run(body.protocolo ? 1 : 0, rep.id);
  return { ok: true };
});
route('POST', '/api/admin/reclamos/:id', ({ user, params, body }) => {
  need(user, 'admin');
  const c = db.prepare('SELECT id FROM reclamos WHERE id=?').get(params.id);
  if (!c) bad('Reclamación no encontrada.', 404);
  db.prepare('UPDATE reclamos SET estado=?, respuesta=? WHERE id=?').run(str(body.estado, 40) || 'En revisión', str(body.respuesta, 600), c.id);
  return { ok: true };
});
route('POST', '/api/admin/jornadas', ({ user, body }) => {
  need(user, 'admin');
  const t = str(body.t, 120), fecha = str(body.fecha, 10);
  if (!t) bad('Escribe el nombre de la jornada.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) bad('Elige una fecha válida.');
  const id = 'j' + Date.now().toString(36);
  db.prepare('INSERT INTO jornadas(id,tipo,t,fecha,hora,lugar,cupos,ocup,cats,d) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(id, body.tipo === 'Taller' ? 'Taller' : 'Jornada de reparación', t, fecha, str(body.hora, 60), str(body.lugar, 160),
      Math.max(1, Math.round(num(body.cupos, 20))), 0, JSON.stringify(arr(body.cats)), str(body.d, 400));
  return { id };
});
route('DELETE', '/api/admin/jornadas/:id', ({ user, params }) => {
  need(user, 'admin');
  db.prepare('DELETE FROM jornadas WHERE id=?').run(params.id);
  return { ok: true };
});

route('GET', '/api/health', () => ({ ok: true, db: DB_PATH }));

/* ---------- servidor ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) {
      const r = routes.find(x => x.method === req.method && x.re.test(url.pathname));
      if (!r) return send(res, 404, { error: 'Ruta no encontrada' });
      const m = r.re.exec(url.pathname);
      const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req);
      const query = Object.fromEntries(url.searchParams);
      const out = await r.fn({ user: userFromReq(req), params: m.groups || {}, body, query });
      return send(res, 200, out);
    }
    let file = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
    if (!file.startsWith(PUBLIC)) return send(res, 403, 'Prohibido');
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    console.error(e);
    send(res, 500, { error: 'Error interno del servidor' });
  }
});

server.listen(PORT, () => console.log(`ReparaRed escuchando en http://localhost:${PORT}  (BD: ${DB_PATH})`));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
