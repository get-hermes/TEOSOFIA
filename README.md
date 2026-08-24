# Teosofia App — PWA + Backend

Aplicativo web progressivo (PWA) que reaproveita o conteúdo do site
[teosofia.org](https://showdeideias.com/teosofia/) e o entrega no celular:
**frase do dia, citação longa, aforismo, conto zen, mood diário, último vídeo
e perguntas & respostas**, com **notificações push** diárias e uma **base de
assinantes** própria (independente de WhatsApp/Telegram).

## Estrutura

```
Teosofia APP/
├── server/                 # Backend Node/Express
│   ├── index.js            # Servidor HTTP + rotas da API
│   ├── content.js          # Agregador de conteúdo do site (com cache)
│   ├── subscribers.js      # Base de assinantes (arquivo JSON)
│   ├── push.js             # Envio de notificações push (web-push)
│   ├── scheduler.js        # Agendador do push diário
│   ├── scripts/
│   │   ├── generate-vapid.js   # Gera chaves VAPID
│   │   └── generate-icons.js   # Gera os ícones PNG do PWA
│   ├── data/subscribers.json   # Assinantes (criado automaticamente)
│   └── .env                # Configuração (não versionar)
└── public/                 # Frontend PWA (sem build, JS puro)
    ├── index.html
    ├── manifest.json
    ├── sw.js               # Service worker (cache + push)
    ├── css/style.css
    ├── js/app.js
    └── icons/              # Ícones gerados
```

## Como rodar localmente

```bash
cd server
npm install --cache ./.npm-cache   # usa cache local (evita EPERM no cache global)
cp .env.example .env               # edite os valores
npm run keys                       # gera chaves VAPID e cole no .env
npm start                          # sobe em http://localhost:3001
```

Abra `http://localhost:3001` no navegador. Para testar a instalação como app,
use o Chrome/Edge no celular ou o modo "app" do DevTools.

> **⚠️ Porta 3000 é do bridge do WhatsApp do Hermes — NÃO usar.** O app usa a
> **3001** por padrão. Se o servidor for iniciado na 3000, ele derruba o
> WhatsApp do Hermes.

> **Nota sobre o npm:** se o cache global do npm tiver arquivos de outro
> usuário (erro `EPERM`), use `--cache ./.npm-cache` como acima.

## Configuração (`.env`)

| Variável | Descrição | Padrão |
|---|---|---|
| `PORT` | Porta do servidor (3000 é do WhatsApp do Hermes) | `3001` |
| `SITE_BASE` | URL base do site de conteúdo | `https://showdeideias.com/teosofia` |
| `CONTENT_TTL_MS` | Cache do conteúdo (ms) | `300000` (5 min) |
| `VAPID_PUBLIC_KEY` | Chave pública VAPID | — |
| `VAPID_PRIVATE_KEY` | Chave privada VAPID | — |
| `VAPID_SUBJECT` | Email de contato do VAPID | `mailto:contato@teosofia.org` |
| `PUSH_HOUR` / `PUSH_MINUTE` | Horário do push diário (hora local) | `7` / `0` |
| `ADMIN_TOKEN` | Token para o endpoint de push manual | — |

## API

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/content` | Todo o conteúdo agregado |
| `GET` | `/api/content/frase` | Frase do dia |
| `GET` | `/api/content/citacao` | Citação longa |
| `GET` | `/api/content/aforismo` | Aforismo |
| `GET` | `/api/content/conto` | Conto zen |
| `GET` | `/api/content/mood` | Mood diário |
| `GET` | `/api/content/video` | Último vídeo |
| `GET` | `/api/content/qa` | Perguntas & respostas |
| `POST` | `/api/subscribe` | Cadastra assinante `{contact, name?, pushSubscription?}` |
| `POST` | `/api/unsubscribe` | Remove assinante `{contact}` |
| `GET` | `/api/push/public-key` | Chave pública VAPID (para o navegador) |
| `POST` | `/api/push/send` | Envio manual (requer `x-admin-token`) |
| `GET` | `/api/stats` | Nº de assinantes e status do push |
| `GET` | `/api/health` | Health check |

## Notificações push

1. Gere as chaves VAPID: `npm run keys` e cole no `.env`.
2. O navegador pede permissão ao usuário e envia a assinatura push ao servidor.
3. O agendador envia a **frase do dia** automaticamente todos os dias no
   horário configurado (`PUSH_HOUR`/`PUSH_MINUTE`).
4. Envio manual (teste): `node scheduler.js --now` ou
   `curl -X POST /api/push/send -H "x-admin-token: SEU_TOKEN" -d '{"title":"...","body":"..."}'`.

## Deploy

O app é um servidor Node/Express que serve o frontend e a API. Qualquer host
que rode Node.js serve (VPS, Railway, Render, Fly.io, etc.). Exemplo com
**systemd** numa VPS:

```ini
# /etc/systemd/system/teosofia.service
[Unit]
Description=Teosofia App
After=network.target

[Service]
WorkingDirectory=/opt/teosofia/server
ExecStart=/usr/bin/node index.js
Restart=always
EnvironmentFile=/opt/teosofia/server/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now teosofia
```

**Importante:** o push e a instalação do PWA exigem **HTTPS** (ou `localhost`).
Use um proxy reverso (Caddy/Nginx) com certificado TLS apontando para a porta
do app.

## Observações

- O conteúdo é buscado do site em tempo real (com cache de 5 min) — o site
  continua sendo a fonte da verdade.
- A base de assinantes é um arquivo JSON simples (`server/data/subscribers.json`).
  Para volumes maiores, troque `subscribers.js` por um banco de dados.
- O app é gratuito e sem build: JavaScript puro, fácil de manter.
