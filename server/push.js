// push.js — Envio de push notifications via Web Push (VAPID).
// Requer VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY no .env (gere com `npm run keys`).

import 'dotenv/config';
import webpush from 'web-push';

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:contato@teosofia.org';

let ready = false;
if (PUBLIC_KEY && PRIVATE_KEY) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  ready = true;
}

export function isPushReady() {
  return ready;
}

export function getPublicKey() {
  return PUBLIC_KEY || null;
}

// Envia uma notificação para uma única assinatura.
// Retorna { ok, status, error }.
export async function sendToOne(subscription, payload) {
  if (!ready) return { ok: false, error: 'VAPID não configurado' };
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { ok: true };
  } catch (err) {
    const status = err && err.statusCode;
    // 404/410 = assinatura expirada/removida.
    if (status === 404 || status === 410) {
      return { ok: false, gone: true, status, error: err.message };
    }
    return { ok: false, status, error: err.message };
  }
}

// Envia para várias assinaturas. Retorna resumo e lista de assinaturas inválidas.
export async function sendToMany(subscriptions, payload) {
  const results = await Promise.all(
    subscriptions.map(async (sub) => {
      const r = await sendToOne(sub, payload);
      return { sub, ...r };
    })
  );
  const ok = results.filter((r) => r.ok).length;
  const gone = results.filter((r) => r.gone).map((r) => r.sub);
  const failed = results.filter((r) => !r.ok && !r.gone).length;
  return { total: results.length, ok, failed, gone };
}
