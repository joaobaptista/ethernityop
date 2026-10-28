# Ethernity DMs — Documentação Técnica

Documento único do projeto. Substitui as antigas pastas `docs/` e `plan/` (o histórico continua no git).
Regras obrigatórias para agentes de IA ficam em [AGENTS.md](AGENTS.md); este documento as detalha.

**Conteúdo**
1. [Visão geral](#1-visão-geral)
2. [Regras de governança](#2-regras-de-governança)
3. [Frontend: cápsulas, fotos e reconhecimento facial](#3-frontend-cápsulas-fotos-e-reconhecimento-facial)
4. [Cofre de mídia criptografado (backend)](#4-cofre-de-mídia-criptografado-backend)
5. [IA local de escrita](#5-ia-local-de-escrita)
6. [Avatar falante e voz](#6-avatar-falante-e-voz)
7. [Autenticação, administração e segurança](#7-autenticação-administração-e-segurança)
8. [Implantação em produção](#8-implantação-em-produção)
9. [Pendências e roadmap](#9-pendências-e-roadmap)

---

## 1. Visão geral

O Ethernity preserva memórias, cartas, áudios e vídeos para entes queridos, com cápsulas do tempo, um cofre de mídia criptografado e guardiões que liberam conteúdo póstumo.

| Parte | Pasta | Stack |
| :--- | :--- | :--- |
| API | `backend/` | Node.js 20+, Express 4, MySQL 8 (`mysql2`), Socket.io, `sharp`, FFmpeg estático |
| Web / PWA | `frontend/` | React 19, Vite, Vitest, Oxlint, TipTap, `face-api.js`, `@mlc-ai/web-llm` |
| App mobile | repositório próprio | React Native / Expo. Saiu deste repositório em out/2026; `app/` é só um stub para o CI |

Comandos principais (na raiz):

```bash
npm run dev:backend     # API em :3333 (e :8000 por compatibilidade)
npm run dev:frontend    # Vite em :5173
npm run test:frontend   # Vitest
npm run test:backend    # node --test (precisa de MySQL local)
npm run lint:frontend   # Oxlint
npm run ci              # tudo acima, como no GitHub Actions
```

**Versão:** o Ethernity usa Versionamento Semântico (SemVer), exibido como `v1.0.0`, `v1.1.0`, `v1.0.1`.
- **MAJOR (`2.0.0`):** mudança incompatível (API, formato de dados).
- **MINOR (`1.1.0`):** recurso novo compatível.
- **PATCH (`1.0.1`):** só correções.

A `v1.0.0` é a primeira versão estável. O número fica no campo `version` dos três `package.json` (raiz, `backend/`, `frontend/`), que devem andar juntos. O frontend mostra a versão na tela de login (`core/appVersion.js`, injetada pelo Vite), e o backend a devolve em `GET /health`. Cada lançamento deve ganhar a tag git correspondente (`v1.0.0`).

A organização do frontend segue módulos por domínio (`frontend/src/modules/<domínio>/{domain,application,infrastructure,presentation}`) com um núcleo compartilhado em `frontend/src/core/` (api, components, hooks, i18n, services).

---

## 2. Regras de governança

Resumo das regras de [AGENTS.md](AGENTS.md), que prevalecem em caso de conflito:

1. **Estrutura congelada, desenvolvimento incremental.** Não reorganizar pastas, reescrever módulos, trocar bibliotecas base ou quebrar contratos de serviços sem pedido explícito do usuário.
2. **Foto original × avatar.** Dentro da cápsula (estúdio de narração, álbuns), a foto é exibida inteira, na proporção natural (`object-fit: contain`). O avatar quadrado serve só para ícones circulares e badges.
3. **Persistência híbrida.** Metadados leves no `localStorage`; fotos e mídias pesadas no IndexedDB, via `capsulesService`.
4. **Ambiente virgem.** Nenhum dado fictício é injetado para o usuário: `DEFAULT_CAPSULES` é vazio. As antigas cápsulas padrão `cap-1`/`cap-2` existem apenas como fixtures de teste (`SAMPLE_FIXTURE_CAPSULES`).
5. **Estanqueidade e expurgo definitivo.** Cada cápsula tem conteúdo próprio. Excluir uma cápsula ou item apaga metadados, IndexedDB e rascunhos na hora, sem ressuscitar dados nem misturar conteúdo de outras cápsulas.
6. **Qualidade.** Suítes `test:frontend` e `test:backend` sempre 100% verdes.

---

## 3. Frontend: cápsulas, fotos e reconhecimento facial

### 3.1 Persistência das cápsulas (`capsulesService.js`)
- **`localStorage` → `ethernity_user_capsules`:** só campos leves (`id`, `title`, `recipient`, `avatar` 240×240, `photosCount`, `triggerLabel`, `sealColor`, `statusText`). É proibido guardar fotos em alta resolução aqui: o limite de ~5 MB gerava `QuotaExceededError`.
- **IndexedDB → banco `Ethernity_Capsules_Media`, store `capsule_photos`:** fotos, áudios e vídeos completos de cada cápsula, sempre via `setCapsulePhotos(id, photos)` / `getCapsulePhotos(id)`.
- **Cache em memória `_photosByCapsuleId` (`Map`):** navegação instantânea entre fotos durante a sessão.
- **Servidor como fonte da verdade:** com usuário autenticado, `syncCapsule` grava a cápsula (`POST /capsules/`, idempotente, com os campos de tela em `metadata`), envia cada foto ao cofre cifrado (`/vault/media/upload` com `capsuleId`) e guarda `mediaId`/`memoryId` na foto. Voz, vídeo do avatar e voz de calibração seguem o mesmo caminho; enquanto não chegam ao servidor, os arquivos ficam no IndexedDB (`pending::…`).
- **Sem conexão:** a cápsula fica com `syncState: 'pending'` e é reenviada em `syncPending()` (ao abrir Cápsulas/Calendário e no evento `online`). Exclusões feitas offline são repetidas no servidor na próxima sincronização.
- **Outro aparelho / navegador limpo:** `fetchCapsulesFromApi` traz as cápsulas e `getCapsulePhotos` restaura as fotos de `GET /capsules/:id`; as URLs de exibição são montadas na leitura (`resolveMediaUrl`, com token).
- **Histórias e emoções das fotos:** salvas ao trocar de foto, ao sair do campo e em "Salvar rascunho" (`updatePhotoStory` → `PUT /memories/:id`).

### 3.2 Avatar × foto original
- `avatarUrl`: recorte facial 1:1 (240×240), só para perfis circulares, grade de pessoas e badges.
- `photo.img`: arquivo original. No estúdio de curadoria, a imagem em destaque usa `object-fit: contain; max-height: 568px` sobre fundo escuro, nunca `cover`.
- `findOriginalUploadedPhotos` recupera a foto original quando uma cápsula antiga tiver sido salva só com o recorte do avatar.

### 3.3 Reconhecimento facial 100% no navegador (`faceRecognitionService.js`)
- Modelos do `face-api.js` em `frontend/public/models/`: `ssdMobilenetv1` (fallback `tinyFaceDetector`), `faceLandmark68Net` e `faceRecognitionNet` (descritores 128D).
- Fotos sem rosto são descartadas na criação de pessoas.
- Agrupamento por distância euclidiana, limiar `SIMILARITY_THRESHOLD = 0.55`.
- O avatar é recortado com 40% de margem ao redor do rosto.
- Fluxo: upload (manual ou Google Fotos) → `select_people` → `configure_person_details` → uma cápsula por pessoa selecionada (1:1). Também é possível adicionar mídias direto a uma cápsula, sem detecção facial.

### 3.4 Exclusão e rascunhos
- Excluir uma cápsula remove metadados, mídias do IndexedDB, cache em memória e rascunhos relacionados, sem tocar nas demais.
- Rascunhos de mensagens (`useAutoSaveDraft`) usam a chave `ethernity_message_draft_${capsuleId || destinatário}`. Se o rascunho recuperado for de outro destinatário ou cápsula, ele é descartado.

### 3.5 Outros módulos
- **i18n:** pt, en e es em `frontend/src/core/i18n/infrastructure/locales/`, com paridade verificada por teste.
- **PWA:** `frontend/public/sw.js` busca primeiro na rede (HTML com `cache: 'no-store'`), nunca intercepta rotas da API nem do cofre e usa `skipWaiting` + `clients.claim`. Ao mudar o SW, suba a versão de `CACHE_NAME` e a de `main.jsx` juntas.
- **Calendário:** monta a linha do tempo com cápsulas e mensagens com data de entrega (`calendar/domain/calendarModel.js`); entregas póstumas não aparecem.
- **URLs da API:** `core/api/apiUrl.js` centraliza `VITE_API_URL`; mídias do cofre (`/api/vault/media/...`) são resolvidas contra a origem da API, nunca contra o site.
- **Mensagens:** editor TipTap em `NewMessageView`, em dois passos (ideação → entrega por data ou póstuma via guardião). Os dados vão para `/messages/` e para o cofre local cifrado (`localVaultService`, AES-256-GCM no IndexedDB).

---

## 4. Cofre de mídia criptografado (backend)

Serviços: `imageProcessorService.js`, `videoAudioProcessorService.js`, `vaultEncryptionService.js`; rotas em `routes/vaultMedia.js`.

### 4.1 Formatos

| Mídia | Processamento |
| :--- | :--- |
| Imagem (inclui HEIC/HEIF) | `sharp` gera `master.webp` (até 4096 px, Q92, 4:4:4), `display.webp` (até 1920×1080, Q85) e `thumb.webp` (400×400, Q80) |
| Vídeo | MP4 H.264 + AAC, `+faststart`; pôster WebP extraído no segundo 1 |
| Áudio | Opus/M4A 48 kHz + vetor de 100 picos (waveform) pré-calculado |
| Live Photo | Imagem + vídeo curto emparelhados; vídeo servido em `/live-video` |

FFmpeg e FFprobe vêm de `@ffmpeg-installer/*` e `sharp` traz binários próprios: não é preciso instalar nada no sistema operacional.

### 4.2 Criptografia (como está implementada hoje)
- **Imagens:** AES-256-GCM em bloco único, com o `userId` como dado autenticado (AAD).
- **Vídeo e áudio:** Chunked AEAD em blocos de 64 KB, com IV por bloco (`IV base ⊕ número do bloco`), o que permite streaming com `HTTP 206` decifrando só os blocos pedidos.
- **Chave:** derivada por PBKDF2 (100 mil iterações, SHA-256) de um segredo do servidor + `userId`. O segredo é `VAULT_MASTER_KEY`. Em produção, se ela estiver vazia, o código usa o `JWT_SECRET` e registra um alerta no log a cada inicialização; a string fixa de desenvolvimento só vale fora de produção.

> **Atenção.** O servidor consegue decifrar o cofre, então ele **não é zero-knowledge**, ao contrário do que documentos antigos diziam. O esquema UVMK/KEK derivado da senha e o quórum de guardiões continuam só no papel.
> Defina sempre `VAULT_MASTER_KEY` em produção e **nunca troque o `JWT_SECRET` sem antes fixar `VAULT_MASTER_KEY` com o valor do segredo usado até então**. Caso contrário, os arquivos já gravados ficam ilegíveis.

- **Exclusão:** o arquivo é sobrescrito com ruído aleatório antes do `unlink` (crypto-shredding em `vaultEncryptionService`).

### 4.3 Rotas (todas exigem JWT)

| Método e rota | Função |
| :--- | :--- |
| `POST /vault/media/upload` | Envio de mídia: processa e cifra |
| `GET /vault/media/:id` | Imagem decifrada (`?variant=thumb\|display\|master`) |
| `GET /vault/media/:id/stream` | Vídeo/áudio com Range (`206 Partial Content`) |
| `GET /vault/media/:id/poster` · `/waveform` · `/live-video` | Pôster, picos de áudio, vídeo da Live Photo |
| `GET /vault/media/:id/export?format=print` | Exportação para impressão (300 DPI, TIFF/PNG) |
| `DELETE /vault/media/:id` | Exclusão definitiva |

Upload com `capsuleId` de cápsula de outro usuário é recusado (403). `DELETE /capsules/:id` expurga também os arquivos cifrados de todas as mídias da cápsula.

As rotas também respondem sob `/api`. Tags `<img>`, `<video>` e `<audio>` podem passar o token por `?token=` (ver riscos na seção 9). Os arquivos ficam em `VAULT_FOLDER` (padrão `./vault_storage/<userId>/<mediaId>/`), nunca servidos como estáticos.

---

## 5. IA local de escrita

`frontend/src/core/services/localAiService.js`, usado por `NewMessageView` e `VoiceIdeationView`.

- Roda **no navegador**, via WebGPU + WebAssembly (`@mlc-ai/web-llm`): nenhum texto sai do aparelho.
- Modelos: `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` (padrão, ~1 GB) e `Qwen2.5-3B-Instruct-q4f16_1-MLC` ("alta qualidade", ~2 GB), escolhidos pelo usuário. A preferência fica em `ethernity_local_ai_quality`.
- **Calibração de estilo:**
  - prompt de sistema escrito como guia de escritor (primeira pessoa, detalhes concretos, sem citações nem moral);
  - lista de clichês proibidos (`CLICHE_PHRASES`) e abertura sorteada a cada geração (`OPENING_ANGLES`);
  - amostragem `temperature 0.85`, `top_p 0.9`, `frequency_penalty 0.35`, `presence_penalty 0.3`, `max_tokens 1400`.
- **Estrutura de carta:** saudação, começo, lembrança, significado, desejos e fim, em 5 a 7 parágrafos (350–550 palavras). Se a resposta vier curta (< 250 palavras) ou com clichês, o serviço pede uma reescrita e fica com a melhor versão.
- **Campo opcional de detalhes reais:** apelidos, lugares, lembranças.
- **Sem WebGPU ou com a IA desligada:** o fallback monta a carta a partir de variações por tema (pet, bodas, aniversário, casamento, formatura, amor, apoio, gratidão, livre), com concordância de gênero (`_detectGenderAndRole`).

---

## 6. Avatar falante e voz

- **Voz matriz:** aba no `VoiceRecorderModal` com teleprompter de 3 frases foneticamente balanceadas (45–60 s). O áudio é convertido para WAV PCM 16 kHz mono em `audioCalibrationService.js`.
- **Foto mestra:** `analyzeMasterPhotoQuality` em `faceRecognitionService.js` avalia se a foto frontal serve.
- **Animação no navegador:** `talkingAvatarService.js` + `TalkingAvatarModal.jsx` (lip-sync por frequência em Canvas, respiração e movimento de cabeça).
- **Exportação:** 9:16, 1:1 ou 16:9 via `canvas.captureStream`, salva na cápsula ou baixada.
- **Ainda não feito:** worker no servidor para aparelhos sem GPU (`POST /api/avatar/generate-video`, progresso via Socket.io). Modelos neurais como LivePortrait/Wav2Lip estão só planejados.

---

## 7. Autenticação, administração e segurança

- **JWT:** HS256, validade de 24 h, `sub` = e-mail. Em produção `JWT_SECRET` é obrigatório (o servidor não sobe sem ele).
- **Leitura do usuário:** `requireAuth` consulta o MySQL a cada requisição. Usuários só em memória (sementes e testes) valem apenas fora de produção.
- **Admin:** coluna `users.is_admin`. Os e-mails raiz ficam em `ROOT_ADMIN_EMAILS` (`auth.js`) + `ADMIN_EMAILS`. A promoção automática acontece só com e-mail verificado pelo Google. A conta `demo@ethernity.com` nunca é admin em produção.
- **Conta demo e dados de exemplo:** semeados apenas fora de produção, ou com `ENABLE_DEMO_LOGIN=1`.
- **Limite de tentativas** (`rateLimit.js`, em memória por instância):
  - `/login`: 10 por e-mail e 30 por IP a cada 15 min;
  - `/register`: 10 por IP por hora.
- **Senhas:** mínimo de 8 caracteres no cadastro e na troca de senha; só hash bcrypt, no banco e na memória. O `PUT /profile` recusa e-mail de outra conta (409) e altera apenas a linha do próprio usuário.
- **Respostas e cabeçalhos:** erros 500 respondem só "Erro interno do servidor." (detalhes vão para o log). Toda resposta leva `X-Content-Type-Options`, `X-Frame-Options: DENY` e `Referrer-Policy`, além de HSTS em produção, sem `X-Powered-By`.
- **Uploads:** SVG rejeitado; `/uploads` servido com `nosniff` e CSP `sandbox`.
- **CORS:** `localhost` + `CORS_ORIGINS`, `CLIENT_URL` e `FRONTEND_URL`.
- **Painel admin** (`frontend/src/modules/admin`, rotas `/admin/*`): métricas, busca, exclusão individual e em lote de usuários (administradores raiz protegidos).
- Regressões de segurança ficam em `backend/test/authHardening.test.js` e `securityAudit.test.js`.

---

## 8. Implantação em produção

### 8.1 Requisitos
Linux com Docker (ou Node 22 e MySQL 8; a imagem usa `node:22-alpine`), 2 vCPUs, 2 GB de RAM + 2 GB de swap (o FFmpeg usa 150–400 MB por processo) e disco SSD para o cofre. HTTPS é obrigatório: navegadores só liberam câmera e microfone em HTTPS ou `localhost`.

### 8.2 Variáveis do backend (`backend/.env` no servidor)

| Variável | Obrigatória | Uso |
| :--- | :---: | :--- |
| `NODE_ENV=production` | sim | Liga as proteções de produção |
| `JWT_SECRET` | sim | Assinatura dos tokens (≥ 64 caracteres aleatórios) |
| `VAULT_MASTER_KEY` | sim | Chave do cofre (ver alerta na seção 4.2) |
| `FRONTEND_URL`, `CORS_ORIGINS` | sim | Domínio do site (redirects do Google, e-mails, CORS) |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | sim | MySQL (o código usa `DB_*`, não `DATABASE_*`) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_PHOTOS_REDIRECT_URI`, `GOOGLE_PHOTOS_TOKEN_ENCRYPTION_KEY` | p/ Google | Login Google e Google Fotos (Picker API) |
| `TRUST_PROXY` | — | Padrão 1 em produção (atrás do Nginx). Use `0` se a API estiver exposta direto |
| `RATE_LIMIT_ENABLED` | — | Padrão: ligado só em produção |
| `ADMIN_EMAILS` | — | E-mails extras de administrador raiz |
| `UPLOAD_FOLDER`, `VAULT_FOLDER`, `MAX_UPLOAD_BYTES` | — | Armazenamento local e limite de upload |
| `ENABLE_DEMO_LOGIN`, `ENABLE_PAYMENT_SIMULATION` | — | **Não usar em produção** |

Frontend (no build): `VITE_API_URL` (URL pública da API, ex.: `https://api.seudominio/api`), `VITE_GOOGLE_CLIENT_ID` e, opcionalmente, `VITE_WS_URL`. Esses valores são gravados no bundle **no momento do build**.

### 8.3 Docker Compose (backend + MySQL)
O `docker-compose.yml` sobe `db` (MySQL 8, volume `ethernity_mysql_data`) e `backend` (portas 3333/8000, volumes `ethernity_uploads` e `ethernity_vault`). O backend lê `backend/.env` via `env_file`; as variáveis `DB_*` do compose apontam para o container `db`. O `JWT_SECRET` vem do ambiente ou de um `.env` na raiz.

```bash
git pull
docker compose up -d --build backend   # sem --build o código antigo continua rodando
docker compose images                  # confira a data da imagem
```

- `backend/.dockerignore` impede que `node_modules` do macOS, `.env`, `uploads/` e `vault_storage/` locais entrem na imagem.
- O backend tem healthcheck no compose: `/health` consulta o MySQL e responde 503 quando o banco não está acessível.
- `database.sql` roda **só na criação** do volume do MySQL. Mudanças de esquema posteriores são aplicadas pelo `initDatabase()` (`backend/src/db/mysql.js`) a cada inicialização.

### 8.4 Frontend e Nginx
`npm --prefix frontend run build` gera `frontend/dist/`, servido como SPA. Modelo de Nginx:

```nginx
server {
    listen 443 ssl http2;
    server_name app.seudominio;
    root /var/www/ethernity/frontend/dist;

    location / { try_files $uri $uri/ /index.html; }

    # Nunca em cache longo, senão o navegador fica preso na versão antiga
    location = /sw.js         { add_header Cache-Control "no-cache"; }
    location = /manifest.json { add_header Cache-Control "no-cache"; }
    location = /index.html    { add_header Cache-Control "no-cache"; }

    location ~* \.(js|css|webp|png|jpg|svg|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}

server {
    listen 443 ssl http2;
    server_name api.seudominio;
    client_max_body_size 150M;

    location ~* /vault_storage/ { deny all; return 404; }

    location / {
        proxy_pass http://127.0.0.1:3333;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;          # Socket.io
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;                             # streaming / Range
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}
```

Redirecione a porta 80 para HTTPS e emita certificados com `certbot --nginx`.

### 8.5 Depois do deploy
- `node qa-agent.mjs`: auditoria de infraestrutura, autenticação, Google e cofre.
- **Backup:**
  - `mysqldump` diário do banco;
  - sincronização do volume do cofre (`aws s3 sync`/`rclone`).

  Os arquivos já vão cifrados, mas guarde a `VAULT_MASTER_KEY` **separada** do backup.

---

## 9. Pendências e roadmap

### Precisa de decisão ou credencial do dono do produto
- **Cobrança real (Mercado Pago).** Hoje tudo é simulado: PIX com chave aleatória, checkout fictício, webhook que só confirma o recebimento. Em produção, o checkout fica desligado e todo cadastro novo ganha o plano `infinity`. Para cobrar:
  - credenciais de produção (`MERCADO_PAGO_ACCESS_TOKEN` / `MERCADO_PAGO_PUBLIC_KEY`);
  - definição do plano inicial;
  - PIX/Checkout Pro reais e cartão tokenizado no navegador (Card Payment Brick, sem número/CVV no servidor);
  - webhook com assinatura `x-signature` validada que ative o plano.
- **Google Fotos em produção:** Client ID com escopo `photospicker.mediaitems.readonly` e as variáveis da seção 8.2.

### Escalabilidade
- Arquivos do cofre em disco local → object storage (S3/R2), necessário para rodar mais de uma instância.
- Socket.io com adaptador Redis; limite de tentativas com store compartilhado (Redis).
- Transcodificação FFmpeg fora da requisição HTTP (fila + worker; a tabela `outbox` pode servir de base).
- Migrações com ferramenta própria rodando no deploy, em vez de `initDatabase()` a cada inicialização.
- MySQL com usuário próprio da aplicação, senha e backup automático (hoje o compose usa root sem senha, restrito a `127.0.0.1`).

### Segurança e qualidade
- Trocar `?token=` nas mídias por URLs assinadas de curta duração.
- Chave do cofre derivada da senha do usuário (zero-knowledge real) e o protocolo de quórum dos guardiões.
- Observabilidade: métricas reais em `/metrics` (hoje fixas), logs estruturados e Sentry.
- Remover credenciais de demonstração do README; teste E2E (Playwright) dos fluxos principais.
- Google Fotos: as chamadas de sessão do Picker no frontend não enviam o token JWT, mas as rotas exigem autenticação. Revisar o fluxo junto com a ativação das credenciais.

### App mobile (repositório próprio)
Builds EAS (Android `.apk`/`.aab`, iOS via TestFlight), conta Apple Developer e testes E2E Maestro em aparelho real.
