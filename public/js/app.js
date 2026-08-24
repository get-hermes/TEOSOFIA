// app.js — Lógica do frontend do app Teosofia.

(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const state = {
    content: null,
    pushReady: false,
    pushSubscribed: false,
    tab: 'hoje',
  };

  // ── Cookie persistente de assinatura ───────────────────────────
  const SUB_COOKIE = 'teosofia_subscribed';
  function setSubscribedCookie(contact) {
    const d = new Date();
    d.setTime(d.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 ano
    const val = contact ? encodeURIComponent(contact) : '1';
    document.cookie = `${SUB_COOKIE}=${val}; expires=${d.toUTCString()}; path=/; SameSite=Lax`;
  }
  function hasSubscribedCookie() {
    return document.cookie.split(';').some((c) => c.trim().startsWith(SUB_COOKIE + '='));
  }
  // Contato salvo no cookie (para pré-preencher a edição de dados).
  function getSubscribedContact() {
    const c = document.cookie.split(';').map((s) => s.trim()).find((s) => s.startsWith(SUB_COOKIE + '='));
    if (!c) return null;
    const val = c.slice(SUB_COOKIE.length + 1);
    if (!val || val === '1') return null;
    try { return decodeURIComponent(val); } catch { return null; }
  }

  // ── Service worker + push ──────────────────────────────────────
  async function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    try {
      await navigator.serviceWorker.register('/sw.js');
    } catch (e) {
      console.warn('SW falhou:', e);
    }
  }

  async function loadPushConfig() {
    try {
      const res = await fetch('/api/push/public-key');
      const data = await res.json();
      state.pushReady = !!data.publicKey;
      if (data.publicKey) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        state.pushSubscribed = !!sub;
      }
      updatePushButton();
    } catch (e) {
      console.warn('Push config indisponível:', e);
    }
  }

  function urlBase64ToUint8Array(base64) {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  async function togglePush() {
    if (!state.pushReady) {
      showStatus('Push não configurado no servidor.', 'err');
      return;
    }
    if (state.pushSubscribed) {
      // Desinscrever
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      state.pushSubscribed = false;
      updatePushButton();
      showStatus('Notificações desativadas.', 'ok');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        showStatus('Permissão de notificação negada.', 'err');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const res = await fetch('/api/push/public-key');
      const { publicKey } = await res.json();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      // Salva a assinatura no servidor (vinculada ao contato, se houver).
      const contact = $('#contact').value.trim();
      const body = { pushSubscription: sub.toJSON() };
      if (contact) body.contact = contact;
      await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      state.pushSubscribed = true;
      updatePushButton();
      showStatus('Notificações ativadas! Você receberá a frase do dia.', 'ok');
    } catch (e) {
      console.error(e);
      showStatus('Não foi possível ativar as notificações.', 'err');
    }
  }

  function updatePushButton() {
    const btn = $('#pushBtn');
    if (!btn) return;
    const label = (t) => `<span class="push-label">${t}</span>`;
    const bell = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';
    const bellOff = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/><path d="M2 2l20 20"/></svg>';
    if (!state.pushReady) {
      btn.innerHTML = bellOff + label('Push indisponível');
      btn.disabled = true;
    } else if (state.pushSubscribed) {
      btn.innerHTML = bell + label('Notificações ativas');
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-ghost');
    } else {
      btn.innerHTML = bell + label('Ativar notificações');
      btn.classList.add('btn-primary');
      btn.classList.remove('btn-ghost');
    }
  }

  // ── Conteúdo ────────────────────────────────────────────────────
  async function loadContent() {
    const main = $('#content');
    main.innerHTML = '<div class="loading"><div class="spinner"></div>Carregando…</div>';
    try {
      const res = await fetch('/api/content');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      state.content = await res.json();
      render();
    } catch (e) {
      main.innerHTML = '<div class="error">Não foi possível carregar o conteúdo.<br>Verifique sua conexão.</div>';
    }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function card(tag, inner) {
    return `<div class="card"><span class="tag">${tag}</span>${inner}</div>`;
  }

  function render() {
    const c = state.content;
    const main = $('#content');
    const parts = [];

    if (c.frase_do_dia && c.frase_do_dia.texto) {
      const fd = c.frase_do_dia;
      const link = fd.link
        ? `<a class="link" href="${esc(fd.link)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> Continuar lendo →</a>`
        : '';
      parts.push(card('Frase do Dia', `<p class="quote">${esc(fd.texto)}</p>${link}`));
    }

    if (c.citacao_longa && c.citacao_longa.excerpt) {
      const cl = c.citacao_longa;
      parts.push(card('Citação Longa', `
        <h2>${esc(cl.title)}</h2>
        <p class="quote">${esc(cl.excerpt)}</p>
        <div class="attribution">${esc(cl.book || '')}</div>
        ${cl.link ? `<a class="link" href="${esc(cl.link)}" target="_blank" rel="noopener">Ler no site →</a>` : ''}
      `));
    }

    if (c.aforismo && c.aforismo.texto) {
      const a = c.aforismo;
      parts.push(card('Aforismo', `
        <p class="quote">${esc(a.texto)}</p>
        <div class="attribution">${esc(a.livro || '')}${a.numero ? ' · nº ' + esc(a.numero) : ''}</div>
        ${a.comentario ? `<p class="meta">${esc(a.comentario)}</p>` : ''}
      `));
    }

    if (c.conto_zen && c.conto_zen.texto) {
      parts.push(card('Conto Zen', `<p class="quote">${esc(c.conto_zen.texto)}</p>`));
    }

    if (c.mood_diario) {
      const m = c.mood_diario;
      const lunar = m.lunar || {};
      const signo = m.signo_solar || {};
      const signoNome = (signo && signo.nome) ? `${signo.emoji || ''} ${signo.nome}` : '—';
      parts.push(card('Mood Diário', `
        <div class="mood-grid">
          <div class="mood-item"><div class="label">Lua</div><div class="value">${esc(lunar.emoji || '')} ${esc(lunar.fase || '—')}</div></div>
          <div class="mood-item"><div class="label">Iluminação</div><div class="value">${esc(lunar.iluminacao || '—')}</div></div>
          <div class="mood-item"><div class="label">Signo Solar</div><div class="value">${esc(signoNome)}</div></div>
          <div class="mood-item"><div class="label">Próx. fase</div><div class="value">${esc(lunar.proxima_fase || '—')}</div></div>
        </div>
        ${m.mensagem ? `<p class="meta">${esc(m.mensagem)}</p>` : ''}
      `));
    }

    if (c.ultimo_video && c.ultimo_video.title) {
      const v = c.ultimo_video;
      parts.push(card('Último Vídeo', `
        ${v.thumbnail ? `<div class="video-wrap"><img class="video-thumb" src="${esc(v.thumbnail)}" alt="" loading="lazy"><span class="play-overlay" aria-hidden="true"></span></div>` : ''}
        <h2>${esc(v.title)}</h2>
        ${v.url ? `<a class="link" href="${esc(v.url)}" target="_blank" rel="noopener">Assistir no YouTube →</a>` : ''}
      `));
    }

    if (c.youtube_qa && c.youtube_qa.qa && c.youtube_qa.qa.length) {
      const items = c.youtube_qa.qa.slice(0, 5).map((q) => `
        <div class="qa-item">
          <div class="q">${esc(q.pergunta)}</div>
          <div class="a">${esc(q.resposta)}</div>
          ${q.videoUrl ? `<a class="link qa-video" href="${esc(q.videoUrl)}" target="_blank" rel="noopener">▶ ${esc(q.videoTitle || 'Ver vídeo')}</a>` : ''}
        </div>
      `).join('');
      parts.push(card('Perguntas & Respostas', items));
    }

    if (!parts.length) {
      main.innerHTML = '<div class="error">Nenhum conteúdo disponível no momento.</div>';
      return;
    }
    main.innerHTML = parts.join('');
  }

  // ── Assinatura ─────────────────────────────────────────────────
  async function handleSubscribe(e) {
    e.preventDefault();
    const contact = $('#contact').value.trim();
    const name = $('#name').value.trim();
    if (!contact) {
      showStatus('Informe seu email ou telefone.', 'err');
      return;
    }
    const btn = $('#subscribeBtn');
    btn.disabled = true;
    btn.textContent = 'Salvando…';
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro');
      setSubscribedCookie(contact);
      renderSubscribed();
      showStatus('Inscrição realizada! Você está inscrito. 🎉', 'ok');
      $('#contact').value = '';
      $('#name').value = '';
    } catch (err) {
      showStatus(err.message || 'Não foi possível cadastrar.', 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Cadastrar';
    }
  }

  function showStatus(msg, type) {
    const el = $('#status');
    el.textContent = msg;
    el.className = 'status show ' + type;
    clearTimeout(showStatus._t);
    showStatus._t = setTimeout(() => el.classList.remove('show'), 6000);
  }

  // Confirmação persistente de que a pessoa já está inscrita (com ticker de check).
  function renderSubscribed() {
    const sec = $('#subscribeSection');
    if (!sec) return;
    sec.classList.remove('hidden');
    sec.innerHTML = `
      <div class="subscribed">
        <div class="ticker" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        </div>
        <div>
          <h2>Você já está inscrito</h2>
          <p class="meta">Você receberá o conteúdo do dia. Obrigado! 🎉</p>
        </div>
      </div>
      <button id="editDataBtn" class="btn-ghost edit-data" type="button">Alterar dados cadastrados</button>`;
    const btn = $('#editDataBtn');
    if (btn) btn.addEventListener('click', onEditData);
  }

  // Re-renderiza o formulário de assinatura (pré-preenchido quando há dados).
  function renderSubscribeForm(prefill) {
    const sec = $('#subscribeSection');
    if (!sec) return;
    sec.classList.remove('hidden');
    const name = (prefill && prefill.name) ? esc(prefill.name) : '';
    const contact = (prefill && prefill.contact) ? esc(prefill.contact) : '';
    sec.innerHTML = `
      <span class="tag">Assinatura grátis</span>
      <h2>Receba conteúdo do dia</h2>
      <p class="hint">Cadastre-se gratuitamente para receber conteúdo diário e ficar por dentro das novidades. Sem spam.</p>
      <form id="subscribeForm" class="subscribe-form">
        <input id="name" type="text" placeholder="Seu nome (opcional)" autocomplete="name" value="${name}">
        <input id="contact" type="text" placeholder="Email ou telefone" autocomplete="email" required value="${contact}">
        <button id="subscribeBtn" type="submit" class="btn-primary btn-block">Salvar alterações</button>
      </form>
      <div id="status" class="status" role="status" aria-live="polite"></div>`;
    const form = $('#subscribeForm');
    if (form) form.addEventListener('submit', handleSubscribe);
  }

  // Abre a edição dos dados cadastrados, pré-preenchendo com o que está salvo no servidor.
  async function onEditData() {
    const contact = getSubscribedContact();
    let prefill = null;
    if (contact) {
      try {
        const res = await fetch('/api/subscriber?contact=' + encodeURIComponent(contact));
        if (res.ok) prefill = await res.json();
      } catch (e) { /* segue com o formulário vazio */ }
    }
    renderSubscribeForm(prefill);
    $('#subscribeSection').scrollIntoView({ behavior: 'smooth' });
  }

  // ── Navegação por abas ─────────────────────────────────────────
  function setupTabs() {
    $$('nav.bottom button').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('nav.bottom button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.tab = btn.dataset.tab;
        // Por ora todas as abas mostram o mesmo feed; a assinatura fica no topo.
        if (state.tab === 'hoje') loadContent();
        else if (state.tab === 'assinar') {
          $('#content').innerHTML = '';
          if (hasSubscribedCookie()) {
            renderSubscribed();
            $('#subscribeSection').scrollIntoView({ behavior: 'smooth' });
          } else {
            $('#subscribeSection').classList.remove('hidden');
            $('#subscribeSection').scrollIntoView({ behavior: 'smooth' });
          }
        } else {
          $('#subscribeSection').classList.add('hidden');
          loadContent();
        }
      });
    });
  }

  // ── Init ───────────────────────────────────────────────────────
  async function init() {
    const form = $('#subscribeForm');
    if (form) form.addEventListener('submit', handleSubscribe);
    $('#pushBtn').addEventListener('click', togglePush);
    setupTabs();
    if (hasSubscribedCookie()) renderSubscribed();
    await registerSW();
    await loadPushConfig();
    loadContent();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
