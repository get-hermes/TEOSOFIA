// scheduler.js — Envio diário de push para os assinantes.
// Envia a "Frase do Dia" (ou aforismo) no horário configurado (PUSH_HOUR).
// Implementação simples com setInterval (sem dependência externa).

import { getFraseDoDia, getAforismo } from './content.js';
import { listPushSubscribers } from './subscribers.js';
import { sendToMany, isPushReady } from './push.js';

const PUSH_HOUR = Number(process.env.PUSH_HOUR ?? 7); // hora local do servidor
const PUSH_MINUTE = Number(process.env.PUSH_MINUTE ?? 0);
const TZ = process.env.TZ || 'America/Sao_Paulo';

let lastSentDay = null;
let timer = null;

function nowParts() {
  // Usa a hora local do servidor. Para fuso específico, ajuste TZ no ambiente.
  const d = new Date();
  return {
    day: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
    hour: d.getHours(),
    minute: d.getMinutes(),
  };
}

async function buildPayload() {
  // Tenta a frase do dia; se vazia, usa o aforismo.
  const frase = await getFraseDoDia();
  if (frase && frase.texto) {
    return {
      title: '🌅 Frase do Dia — Teosofia',
      body: frase.texto.slice(0, 180) + (frase.texto.length > 180 ? '…' : ''),
      data: { url: '/', tipo: 'frase' },
    };
  }
  const aforismo = await getAforismo();
  if (aforismo && aforismo.texto) {
    return {
      title: '📜 Aforismo do Dia — Teosofia',
      body: aforismo.texto.slice(0, 180) + (aforismo.texto.length > 180 ? '…' : ''),
      data: { url: '/', tipo: 'aforismo' },
    };
  }
  return null;
}

async function runOnce() {
  if (!isPushReady()) {
    console.warn('[scheduler] Push não configurado (VAPID ausente). Envio diário desativado.');
    return;
  }
  const payload = await buildPayload();
  if (!payload) {
    console.warn('[scheduler] Nenhum conteúdo disponível para o push de hoje.');
    return;
  }
  const subs = await listPushSubscribers();
  if (!subs.length) {
    console.log('[scheduler] Nenhum assinante com push ativo.');
    return;
  }
  const res = await sendToMany(subs, payload);
  console.log(
    `[scheduler] Push diário enviado: ${res.ok}/${res.total} ok, ${res.failed} falhas, ${res.gone.length} expirados.`
  );
  return res;
}

// Verifica a cada 60s se chegou a hora de enviar (uma vez por dia).
function tick() {
  const { day, hour, minute } = nowParts();
  if (day !== lastSentDay && hour === PUSH_HOUR && minute === PUSH_MINUTE) {
    lastSentDay = day;
    runOnce().catch((e) => console.error('[scheduler] Erro no envio:', e.message));
  }
}

export function startScheduler() {
  if (timer) return;
  console.log(`[scheduler] Agendado para ${String(PUSH_HOUR).padStart(2, '0')}:${String(PUSH_MINUTE).padStart(2, '0')} (fuso do servidor).`);
  tick(); // permite disparo imediato se já for a hora
  timer = setInterval(tick, 60 * 1000);
  timer.unref?.();
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

// Permite disparo manual via CLI: `node scheduler.js --now`
if (process.argv[1] && process.argv[1].endsWith('scheduler.js') && process.argv.includes('--now')) {
  runOnce()
    .then((r) => {
      console.log('[scheduler] Envio manual concluído.', r);
      process.exit(0);
    })
    .catch((e) => {
      console.error('[scheduler] Erro:', e);
      process.exit(1);
    });
}
