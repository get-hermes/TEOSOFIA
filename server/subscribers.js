// subscribers.js — Gestão de assinantes (base de contatos do app).
// Usa Postgres persistente quando DATABASE_URL está definido (produção/Railway).
// Fallback: arquivo JSON local (dev sem banco).
// Schema: subscribers(id, key, contact, name, push_subscription, preferences, active, created_at, updated_at)

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'subscribers.json');

const DATABASE_URL = process.env.DATABASE_URL;
const usingPg = !!DATABASE_URL;

// ── Postgres ────────────────────────────────────────────────────
let pool = null;
async function getPool() {
  if (pool) return pool;
  pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await ensureSchema();
  return pool;
}

async function ensureSchema() {
  const p = pool;
  await p.query(`
    CREATE TABLE IF NOT EXISTS subscribers (
      id SERIAL PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      contact TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      push_subscription JSONB,
      preferences JSONB NOT NULL DEFAULT '{}',
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

// ── JSON fallback ──────────────────────────────────────────────
let store = null; // { subscribers: [], seq: number }

async function loadJson() {
  if (store) return store;
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    store = JSON.parse(raw);
  } catch {
    store = { seq: 0, subscribers: [] };
  }
  if (!Array.isArray(store.subscribers)) store.subscribers = [];
  if (typeof store.seq !== 'number') store.seq = 0;
  return store;
}

async function persistJson() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf8');
  await fs.rename(tmp, FILE);
}

// ── Normalização de contato ────────────────────────────────────
function normalizeContact(contact) {
  if (!contact) return null;
  const c = String(contact).trim().toLowerCase();
  if (!c) return null;
  if (/^\+?[\d\s().-]+$/.test(c)) {
    return 'tel:' + c.replace(/[^+\d]/g, '');
  }
  return 'email:' + c;
}

function rowToSub(row) {
  return {
    id: row.id,
    key: row.key,
    contact: row.contact,
    name: row.name || '',
    pushSubscription: row.push_subscription || null,
    preferences: row.preferences || {},
    active: !!row.active,
    created_at: row.created_at ? row.created_at.toISOString() : null,
    updated_at: row.updated_at ? row.updated_at.toISOString() : null,
  };
}

// ── API pública ────────────────────────────────────────────────

// Cadastra (ou atualiza) um assinante. Retorna o assinante.
export async function upsertSubscriber({ contact, name = '', pushSubscription = null, preferences = {} }) {
  const key = normalizeContact(contact);
  if (!key) throw new Error('Contato inválido');

  if (usingPg) {
    const p = await getPool();
    const prefs = JSON.stringify(preferences || {});
    const pushSub = pushSubscription ? JSON.stringify(pushSubscription) : null;
    const { rows } = await p.query(
      `INSERT INTO subscribers (key, contact, name, push_subscription, preferences)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (key) DO UPDATE SET
         name = CASE WHEN $3 <> '' THEN $3 ELSE subscribers.name END,
         push_subscription = COALESCE($4, subscribers.push_subscription),
         preferences = subscribers.preferences || $5,
         updated_at = now()
       RETURNING *`,
      [key, String(contact).trim(), name || '', pushSub, prefs]
    );
    return rowToSub(rows[0]);
  }

  // Fallback JSON
  const s = await loadJson();
  let sub = s.subscribers.find((x) => x.key === key);
  if (sub) {
    sub.name = name || sub.name;
    sub.updated_at = new Date().toISOString();
    if (pushSubscription) sub.pushSubscription = pushSubscription;
    if (preferences && Object.keys(preferences).length) {
      sub.preferences = { ...(sub.preferences || {}), ...preferences };
    }
  } else {
    s.seq += 1;
    sub = {
      id: s.seq,
      key,
      contact: String(contact).trim(),
      name,
      pushSubscription: pushSubscription || null,
      preferences: preferences || {},
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    s.subscribers.push(sub);
  }
  await persistJson();
  return sub;
}

// Remove um assinante (opt-out).
export async function removeSubscriber(contact) {
  const key = normalizeContact(contact);
  if (!key) return false;

  if (usingPg) {
    const p = await getPool();
    const { rowCount } = await p.query('DELETE FROM subscribers WHERE key = $1', [key]);
    return rowCount > 0;
  }

  const s = await loadJson();
  const before = s.subscribers.length;
  s.subscribers = s.subscribers.filter((x) => x.key !== key);
  if (s.subscribers.length !== before) await persistJson();
  return s.subscribers.length !== before;
}

// Lista assinantes ativos que possuem pushSubscription.
export async function listPushSubscribers() {
  if (usingPg) {
    const p = await getPool();
    const { rows } = await p.query(
      `SELECT * FROM subscribers WHERE active = true AND push_subscription IS NOT NULL`
    );
    return rows.map(rowToSub).map((s) => s.pushSubscription);
  }
  const s = await loadJson();
  return s.subscribers.filter((x) => x.active && x.pushSubscription).map((x) => x.pushSubscription);
}

// Busca um assinante pelo contato (para pré-preencher a edição de dados).
export async function findSubscriber(contact) {
  const key = normalizeContact(contact);
  if (!key) return null;

  if (usingPg) {
    const p = await getPool();
    const { rows } = await p.query('SELECT * FROM subscribers WHERE key = $1', [key]);
    if (!rows.length) return null;
    const s = rowToSub(rows[0]);
    return { id: s.id, contact: s.contact, name: s.name || '' };
  }

  const s = await loadJson();
  const sub = s.subscribers.find((x) => x.key === key);
  if (!sub) return null;
  return { id: sub.id, contact: sub.contact, name: sub.name || '' };
}

// Lista todos (para exportar a base).
export async function listAll() {
  if (usingPg) {
    const p = await getPool();
    const { rows } = await p.query('SELECT * FROM subscribers ORDER BY id');
    return rows.map(rowToSub);
  }
  const s = await loadJson();
  return s.subscribers;
}

export async function count() {
  if (usingPg) {
    const p = await getPool();
    const { rows } = await p.query('SELECT count(*)::int AS n FROM subscribers');
    return rows[0].n;
  }
  const s = await loadJson();
  return s.subscribers.length;
}
