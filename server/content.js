// content.js — Agregador de conteúdo do site teosofia.org
// Busca os widgets/endpoints de conteúdo do site e os expõe de forma
// normalizada para o app. Evita problemas de CORS e centraliza o acesso.

import 'dotenv/config';

// Base do site. Em produção aponte para o domínio real.
// Ex.: https://showdeideias.com/teosofia  ou  https://teosofia.org
const SITE_BASE = (process.env.SITE_BASE || 'https://showdeideias.com/teosofia').replace(/\/+$/, '');

const UA =
  'Mozilla/5.0 (TeosofiaApp/1.0; +https://teosofia.org) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// Cache em memória com TTL para não sobrecarregar o site a cada request.
const cache = new Map();
const TTL = Number(process.env.CONTENT_TTL_MS || 5 * 60 * 1000); // 5 min

async function fetchJson(path, { ttl = TTL } = {}) {
  const key = path;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data;

  const url = `${SITE_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json,text/plain,*/*' },
  });
  if (!res.ok) throw new Error(`Falha ao buscar ${url}: HTTP ${res.status}`);

  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();

  cache.set(key, { at: Date.now(), data });
  return data;
}

// Frase do dia — texto simples com atribuição.
// O site passou a incluir uma linha "📖 Continuar lendo: <url>" no final;
// separamos a citação do link para renderizar o link clicável no app.
export async function getFraseDoDia() {
  const text = String(await fetchJson('/frase_do_dia.txt') || '').trim();
  const lines = text.split('\n').map((l) => l.trim());
  const quoteLines = [];
  let link = null;
  for (const line of lines) {
    const m = line.match(/Continuar lendo:\s*(https?:\/\/\S+)/i);
    if (m) {
      link = m[1];
    } else if (line) {
      quoteLines.push(line);
    }
  }
  return { tipo: 'frase', texto: quoteLines.join('\n'), link };
}

// Citação longa — último artigo (JSON).
export async function getCitacaoLonga() {
  const d = await fetchJson('/citacao-longa-widget.json');
  return {
    tipo: 'citacao',
    title: d.title || '',
    excerpt: d.excerpt || '',
    book: d.book || '',
    link: d.link || '',
    generated_at: d.generated_at || null,
  };
}

// Aforismo (JSON).
export async function getAforismo() {
  const d = await fetchJson('/aforismo.php');
  return {
    tipo: 'aforismo',
    livro: d.livro || '',
    numero: d.numero || '',
    texto: d.texto || '',
    comentario: d.comentario || '',
  };
}

// Conto Zen (JSON).
export async function getContoZen() {
  const d = await fetchJson('/conto_zen.php');
  return { tipo: 'conto', data: d.data || null, texto: d.texto || '' };
}

// Mood diário (JSON).
export async function getMoodDiario() {
  const d = await fetchJson('/mood_diario.json');
  return {
    tipo: 'mood',
    data: d.data || null,
    lunar: d.lunar || null,
    aspectos: d.aspectos || null,
    signo_solar: d.signo_solar || null,
    mensagem: d.mensagem || '',
  };
}

// Último vídeo (JSON).
export async function getUltimoVideo() {
  const d = await fetchJson('/ultimo_video.json');
  return {
    tipo: 'video',
    id: d.id || '',
    title: d.title || '',
    url: d.url || '',
    thumbnail: d.thumbnail || '',
    published: d.published || null,
    channel: d.channel || '',
  };
}

// QA do YouTube (JSON).
export async function getYoutubeQA() {
  const d = await fetchJson('/youtube_qa.json');
  return { tipo: 'qa', updated: d.updated || null, total: d.total || 0, qa: d.qa || [] };
}

// Agrega tudo em um único payload para a home do app.
export async function getTudo() {
  const [frase, citacao, aforismo, conto, mood, video, qa] = await Promise.allSettled([
    getFraseDoDia(),
    getCitacaoLonga(),
    getAforismo(),
    getContoZen(),
    getMoodDiario(),
    getUltimoVideo(),
    getYoutubeQA(),
  ]);

  const ok = (r) => (r.status === 'fulfilled' ? r.value : null);
  return {
    gerado_em: new Date().toISOString(),
    fonte: SITE_BASE,
    frase_do_dia: ok(frase),
    citacao_longa: ok(citacao),
    aforismo: ok(aforismo),
    conto_zen: ok(conto),
    mood_diario: ok(mood),
    ultimo_video: ok(video),
    youtube_qa: ok(qa),
  };
}

// Limpa o cache (útil em dev).
export function clearCache() {
  cache.clear();
}
