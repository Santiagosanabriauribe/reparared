'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'reparared.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL,            -- usuario | reparador | admin
  barrio TEXT,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  creado INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creado INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reps(
  id TEXT PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  oficio TEXT,
  cats TEXT NOT NULL DEFAULT '[]',
  skills TEXT NOT NULL DEFAULT '[]',
  barrio TEXT,
  km REAL,
  exp INTEGER DEFAULT 0,
  trabajos INTEGER DEFAULT 0,
  resp INTEGER,
  verif INTEGER DEFAULT 0,
  protocolo INTEGER DEFAULT 0,
  volunt INTEGER DEFAULT 0,
  nivel TEXT DEFAULT '',
  bio TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS resenas(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rep_id TEXT NOT NULL REFERENCES reps(id) ON DELETE CASCADE,
  folio TEXT,
  u TEXT,
  s INTEGER NOT NULL,
  t TEXT,
  fecha INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reqs(
  folio TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  cat TEXT NOT NULL,
  sub TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descr TEXT NOT NULL,
  barrio TEXT,
  fecha INTEGER NOT NULL,
  estado TEXT NOT NULL,         -- publicada | propuestas | agendada | reparada | noreparable
  elegido TEXT,
  res TEXT,
  fotos TEXT NOT NULL DEFAULT '[]',
  riesgos TEXT NOT NULL DEFAULT '[]',
  franjas TEXT NOT NULL DEFAULT '[]',
  cita TEXT,
  jornada INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS props(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folio TEXT NOT NULL REFERENCES reqs(folio) ON DELETE CASCADE,
  rep_id TEXT NOT NULL REFERENCES reps(id) ON DELETE CASCADE,
  pmin INTEGER NOT NULL,
  pmax INTEGER NOT NULL,
  diag TEXT,
  dias INTEGER DEFAULT 1,
  horas INTEGER DEFAULT 1,
  fecha INTEGER NOT NULL,
  UNIQUE(folio, rep_id)
);
CREATE TABLE IF NOT EXISTS chat(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folio TEXT,
  rep_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  w TEXT NOT NULL,              -- user | rep | sys
  t TEXT NOT NULL,
  fecha INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_thread ON chat(rep_id, user_id, folio);
CREATE TABLE IF NOT EXISTS jornadas(
  id TEXT PRIMARY KEY,
  tipo TEXT,
  t TEXT NOT NULL,
  fecha TEXT NOT NULL,          -- YYYY-MM-DD
  hora TEXT,
  lugar TEXT,
  cupos INTEGER NOT NULL DEFAULT 20,
  ocup INTEGER NOT NULL DEFAULT 0,
  cats TEXT NOT NULL DEFAULT '[]',
  d TEXT
);
CREATE TABLE IF NOT EXISTS inscritos(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jornada_id TEXT NOT NULL REFERENCES jornadas(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, jornada_id)
);
CREATE TABLE IF NOT EXISTS reclamos(
  id TEXT PRIMARY KEY,
  folio TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  motivo TEXT,
  detalle TEXT,
  fecha INTEGER NOT NULL,
  limite INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'En revisión',
  respuesta TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
`);

const J = (s, d = null) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };

function hashPw(pw, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  return { salt, hash: crypto.scryptSync(String(pw), salt, 32).toString('hex') };
}
function checkPw(pw, salt, hash) {
  const h = crypto.scryptSync(String(pw), salt, 32);
  const b = Buffer.from(hash, 'hex');
  return b.length === h.length && crypto.timingSafeEqual(h, b);
}

function metaGet(k, d) { const r = db.prepare('SELECT v FROM meta WHERE k=?').get(k); return r ? r.v : d; }
function metaSet(k, v) { db.prepare('INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, String(v)); }
function nextFolio() {
  const n = +metaGet('folio', '1');
  metaSet('folio', n + 1);
  return 'RR-' + String(n).padStart(4, '0');
}
function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

module.exports = { db, J, hashPw, checkPw, metaGet, metaSet, nextFolio, tx, DB_PATH };
