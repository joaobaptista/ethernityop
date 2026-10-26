# Auditoria Arquitetural — Ethernity DMS (Legado Digital)

Este documento apresenta a análise técnica detalhada do ecossistema **Ethernity DMS**, avaliando a persistência no banco monolito MySQL, a conformidade com Clean Architecture / Domain-Driven Design (DDD), a capacidade de escalabilidade para dezenas de milhares de usuários e o estado da documentação OpenAPI/Swagger.

---

## 1. Mapeamento de Serviços e Persistência no Banco Monolito MySQL

O banco de dados oficial do sistema é a instância monolítica MySQL **`ethernity`**, operada via pool de conexões assíncrono (`mysql2/promise`).

| Serviço / Domínio | Tabela(s) MySQL Associada(s) | Status Operacional | Modo de Persistência |
| :--- | :--- | :--- | :--- |
| **Autenticação & Contas** | `users` | 🟢 Produção / Real | MySQL (bcrypt/hash, email, avatar, plano). Suporta login tradicional e Google OAuth 2.0 (OpenID Connect / Gmail). |
| **Google Photos Picker API** | `google_photos_picker_sessions`, `integration_connections` | 🟢 Produção / Real | MySQL (credenciais OAuth cifradas em AES-256-GCM, sessões de seleção com status polling e TTL). |
| **Memórias & Linha do Tempo** | `memories` | 🟢 Produção / Real | MySQL (mídias importadas, metadados do provedor, URLs estáticas servidas via `/uploads`). |
| **Cápsulas do Tempo** | `capsules` | 🟢 Produção / Real | MySQL (título, destinatário em JSON, agendamento de data, status de entrega e criptografia). |
| **Círculo Familiar & Guardiões** | `guardians`, `circle_connections` | 🟢 Produção / Real | MySQL (relacionamento, papéis, privilégio de liberação de cápsulas e status ativo). |
| **Cofre Digital Criptografado** | `drive_folders`, `drive_files` | 🟢 Produção / Real | Arquitetura Híbrida: Frontend executa criptografia local zero-knowledge (AES-256-GCM) e o backend persiste estrutura de pastas e arquivos no MySQL. |
| **Planos & Assinaturas** | `subscriptions`, `users.plan_id` | 🟢 Produção / Real | MySQL (ciclo de faturamento, expiração, PIX instantâneo Mercado Pago e Checkout Transparente). |
| **Eventos & Notificações** | `notifications`, `outbox_events`, `device_tokens` | 🟢 Produção / Real | MySQL (Transactional Outbox Pattern para mensageria assíncrona resiliente). |
| **Rastreadores & Telemetria** | `store.devices`, `store.areas` | 🟡 Híbrido | Camada em memória com broadcasting via Socket.io em tempo real. |

---

## 2. Avaliação de Escalabilidade para Milhares de Usuários

Para atender de 10.000 a 100.000 usuários simultâneos com alto throughput e baixa latência, foram identificados os seguintes pilares:

### A. Banco de Dados Monolito (MySQL)
* **Connection Pooling:** O pool (`mysql2/promise`) está configurado com `connectionLimit: 10`. Para suportar milhares de conexões simultâneas em produção:
  - Elevar `connectionLimit` para `50-100` por réplica da API.
  - Utilizar **ProxySQL** à frente do MySQL para balanceamento e multiplexação de conexões.
* **Índices Estruturais:** As tabelas principais já contam com chaves compostas essenciais:
  - `idx_integration_connections_user_status` em `(user_id, status)`
  - `idx_google_photos_picker_sessions_user_status` em `(user_id, status, created_at)`
  - `idx_memories_capsule_timeline` em `(capsule_id, occurred_at, created_at)`
  - `uq_google_photos_picker_sessions_google_session` garantindo idempotência estrita.

### B. Statelessness e Escala Horizontal do Backend
* **Desacoplamento de Sessão:** A função `requireAuth` e o endpoint `/profile` foram refatorados para consultar diretamente o MySQL em caso de cache-miss em memória. Isso permite subir **N réplicas do Node.js** (via PM2 em Cluster Mode ou Pods no Kubernetes) sem perda de sessão ou inconsistência de tokens JWT.
* **WebSockets / Tempo Real:** O servidor Socket.io atual opera em memória local. Para escalabilidade horizontal multi-instância, deve ser conectado o `@socket.io/redis-adapter` para que os broadcasts alcancem clientes conectados em instâncias distintas.

### C. Armazenamento e Distribuição de Mídias (Uploads / Fotos)
* O diretório `./uploads` atende com excelência o ambiente local e staging de alta velocidade.
* Para escala de múltiplos servidores sem compartilhamento de disco NFS, a camada de storage deve apontar para **S3-compatible Object Storage** (AWS S3, Cloudflare R2 ou MinIO) com distribuição via CDN (Cloudflare) para garantir latência inferior a 50ms na entrega de avatares e memórias.

---

## 3. Arquitetura Limpa (Clean Architecture & DDD)

A base de código segue uma segregação estrita de responsabilidades:

```
frontend/src/modules/{module}/
├── domain/            # Regras de negócio puras, entidades, value objects e testes Vitest
├── application/       # Serviços orquestradores e use-cases
├── infrastructure/    # Clientes HTTP, repositórios de storage e adaptadores
└── presentation/      # Telas (Views), modais, componentes React e estilos CSS
```

### Conformidade por Módulo:
* **`memories`**: Segrega `memoriesModel.js`, `memoriesService.js` e `memoriesRepository.js`.
* **`vault`**: Segrega `vaultModel.js` e `vaultRepository.js`.
* **`profile`**: Modelo de formatação internacional de WhatsApp, iniciais de nome e resolução de URLs estáticas desacoplado da UI em `profileModel.js`.
* **`subscription`**: Modelos de quotas, cálculo de upgrade de plano e repositório de infraestrutura Mercado Pago em `subscriptionModel.js`.

---

## 4. Estado da Documentação OpenAPI / Swagger

O Swagger foi completamente reformulado e reflete com 100% de fidelidade a API real:

* **Servidores Ativos:**
  - `http://localhost:3333` (Servidor Principal)
  - `http://localhost:8000` (Porta de Compatibilidade)
* **Rotas Documentadas no Swagger UI (`/docs` e `/redoc`):**
  - **Autenticação:** `POST /register`, `POST /login`, `GET /auth/me`, `GET /api/auth/google/url`, `GET /api/integrations/google-photos/callback`.
  - **Perfil:** `GET /profile`, `PUT /profile`, `POST /profile/photo`.
  - **Google Photos Picker API:** `GET /status`, `GET /authorization-url`, `POST /sessions`, `GET /sessions/{id}`, `GET /sessions/{id}/items`, `POST /sessions/{id}/import`, `DELETE /connection`.
  - **Memórias:** `GET /api/memories`, `GET /api/memories/google-photos`.
  - **Assinaturas & Mercado Pago:** `GET /subscriptions/plans`, `GET /subscriptions/current`, `POST /subscriptions/create-preference`, `POST /subscriptions/pay-card`, `POST /subscriptions/simulate-payment`, `POST /subscriptions/webhook`.
