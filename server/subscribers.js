// subscribers.js — Gestão de assinantes (base de contatos do app).
// Armazenamento simples em arquivo JSON com escrita atômica.
// Para escala maior, troque por SQLite/Postgres mantendo a mesma interface.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'subscribers.json');

let store = null; // { subscribers: [], seq: number }

async function load() {
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

async function persist() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf8');
  await fs.rename(tmp, FILE);
}

// Normaliza email/telefone para chave de unicidade.
function normalizeContact(contact) {
  if (!contact) return null;
  const c = String(contact).trim().toLowerCase();
  if (!c) return null;
  // remove tudo que não for dígito para telefone
  if (/^\+?[\d\s().-]+$/.test(c)) {
    return 'tel:' + c.replace(/[^\d+]/g, '');
  }
  return 'email:' + c;
}

// Cadastra (ou atualiza) um assinante. Retorna o assinante.
export async function upsertSubscriber({ contact, name = '', pushSubscription = null, preferences = {} }) {
  const s = await load();
  const key = normalizeContact(contact);
  if (!key) throw new Error('Contato inválido');

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
      contact,
      name,
      pushSubscription: pushSubscription || null,
      preferences: preferences || {},
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    s.subscribers.push(sub);
  }
  await persist();
  return sub;
}

// Remove um assinante (opt-out).
export async function removeSubscriber(contact) {
  const s = await load();
  const key = normalizeContact(contact);
  const before = s.subscribers.length;
  s.subscribers = s.subscribers.filter((x) => x.key !== key);
  if (s.subscribers.length !== before) await persist();
  return s.subscribers.length !== before;
}

// Lista assinantes ativos que possuem pushSubscription.
export async function listPushSubscribers() {
  const s = await load();
  return s.subscribers.filter((x) => x.active && x.pushSubscription);
}

// Lista todos (para exportar a base).
export async function listAll() {
  const s = await load();
  return s.subscribers;
}

export async function count() {
  const s = await load();
  return s.subscribers.length;
}
