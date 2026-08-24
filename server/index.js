// index.js — Servidor Express do app Teosofia.
// Serve o PWA (public/) e expõe a API de conteúdo, assinantes e push.

import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as content from './content.js';
import * as subscribers from './subscribers.js';
import * as push from './push.js';
import { startScheduler } from './scheduler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();
app.use(express.json({ limit: '256kb' }));

// ── Estáticos do PWA ─────────────────────────────────────────────
app.use(express.static(PUBLIC_DIR, { index: 'index.html' }));

// ── API de conteúdo ───────────────────────────────────────────────
app.get('/api/content', async (req, res) => {
  try {
    res.json(await content.getTudo());
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/content/frase', async (req, res) => {
  try { res.json(await content.getFraseDoDia()); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/content/citacao', async (req, res) => {
  try { res.json(await content.getCitacaoLonga()); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/content/aforismo', async (req, res) => {
  try { res.json(await content.getAforismo()); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/content/conto', async (req, res) => {
  try { res.json(await content.getContoZen()); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/content/mood', async (req, res) => {
  try { res.json(await content.getMoodDiario()); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/content/video', async (req, res) => {
  try { res.json(await content.getUltimoVideo()); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/content/qa', async (req, res) => {
  try { res.json(await content.getYoutubeQA()); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

// ── Assinantes ───────────────────────────────────────────────────
// Cadastro: { contact, name?, pushSubscription?, preferences? }
app.post('/api/subscribe', async (req, res) => {
  try {
    const { contact, name, pushSubscription, preferences } = req.body || {};
    if (!contact) return res.status(400).json({ error: 'Contato (email ou telefone) é obrigatório.' });
    const sub = await subscribers.upsertSubscriber({ contact, name, pushSubscription, preferences });
    res.status(201).json({ ok: true, id: sub.id, contact: sub.contact });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Cancelamento: { contact }
app.post('/api/unsubscribe', async (req, res) => {
  try {
    const { contact } = req.body || {};
    if (!contact) return res.status(400).json({ error: 'Contato é obrigatório.' });
    const removed = await subscribers.removeSubscriber(contact);
    res.json({ ok: true, removed });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Busca um assinante pelo contato (para pré-preencher a edição de dados).
app.get('/api/subscriber', async (req, res) => {
  try {
    const { contact } = req.query || {};
    if (!contact) return res.status(400).json({ error: 'Contato é obrigatório.' });
    const sub = await subscribers.findSubscriber(contact);
    if (!sub) return res.status(404).json({ error: 'Assinante não encontrado.' });
    res.json(sub);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Push ─────────────────────────────────────────────────────────
app.get('/api/push/public-key', (req, res) => {
  res.json({ publicKey: push.getPublicKey(), ready: push.isPushReady() });
});

// Envio manual (protegido por token). Body: { title, body, data? }
app.post('/api/push/send', async (req, res) => {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }
  const { title, body, data } = req.body || {};
  if (!title || !body) return res.status(400).json({ error: 'title e body são obrigatórios.' });
  const subs = await subscribers.listPushSubscribers();
  const result = await push.sendToMany(subs, { title, body, data: data || {} });
  res.json(result);
});

// ── Estatísticas ─────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  res.json({ assinantes: await subscribers.count(), push_ready: push.isPushReady() });
});

// ── Export de assinantes (para backup) — protegido por ADMIN_TOKEN ──
// Retorna a base completa de assinantes em JSON. Uso: GET /api/export?token=<ADMIN_TOKEN>
app.get('/api/export', async (req, res) => {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }
  try {
    const all = await subscribers.listAll();
    res.json({ exported_at: new Date().toISOString(), count: all.length, subscribers: all });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Health check ──────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ── SPA fallback ─────────────────────────────────────────────────
app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`🌐 Teosofia App rodando em http://localhost:${PORT}`);
  console.log(`   Conteúdo de: ${process.env.SITE_BASE || 'https://showdeideias.com/teosofia'}`);
  console.log(`   Push: ${push.isPushReady() ? 'configurado ✓' : 'NÃO configurado (gere VAPID com npm run keys)'}`);
  startScheduler();
});
