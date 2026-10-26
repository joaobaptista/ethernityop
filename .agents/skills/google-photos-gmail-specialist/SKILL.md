---
name: google-photos-gmail-specialist
description: Agente especialista em integração com Google OAuth 2.0 (Login e Cadastro via Gmail/OpenID Connect) e Google Photos Picker API. Responsável por arquitetura, credenciais de nuvem, segurança criptográfica AES-256-GCM, rotinas de auditoria e resolução de erros.
---

# Ethernity — Especialista em Google Photos & Social Login (Gmail)

Este skill define as diretrizes de engenharia, especificações de protocolos e procedimentos operacionais para as integrações oficiais da Google no ecossistema Ethernity.

---

## 1. Responsabilidades do Especialista

1. **Autenticação Social Unificada (Gmail)**:
   - Permitir login e cadastro automático em 1 clique via Google OpenID Connect (OIDC).
   - Multiplexar retornos no mesmo endpoint de redirecionamento autorizado sem colisões.
   - Mitigar loops infinitos de renderização no React via `useRef` e limpeza de parâmetros na URL.
   - Tratar origens dinâmicas (ex.: portas Vite `5173`, `5174`, `5175`) através de state JWT assinado com claim `origin`.

2. **Google Photos Picker API (Compartilhamento Delimitado)**:
   - Gerenciar o ciclo de vida da Picker API: criação de sessões, polling inteligente (`3s`), detecção de `mediaItemsSet: true`.
   - Baixar os bytes das fotos em resolução original (`baseUrl=d`) através de streaming seguro para armazenamento local/cofre.
   - Destruir a sessão temporária na Google (`DELETE /v1/sessions/{id}`) após a importação.
   - Renovar automaticamente tokens de acesso (`refresh_token`) 2 minutos antes do vencimento.

3. **Criptografia e Cofre de Credenciais**:
   - Manter tokens OAuth cifrados em repouso com **AES-256-GCM** na tabela `integration_connections`.
   - Garantir que tokens puros nunca sejam persistidos ou expostos em logs.

4. **Garantia de Qualidade e Prevenção de Falhas**:
   - Executar a bateria de testes automatizados com `node qa-agent.mjs`.

---

## 2. Configurações de Nuvem no Google Cloud Console

Para que os fluxos funcionem em ambiente de desenvolvimento e produção:

### 2.1. Escopos Habilitados na Tela de Consentimento OAuth
- `openid` (Identificador OpenID Connect)
- `https://www.googleapis.com/auth/userinfo.email` (Endereço de e-mail)
- `https://www.googleapis.com/auth/userinfo.profile` (Nome e foto de perfil)
- `https://www.googleapis.com/auth/photospicker.mediaitems.readonly` (Google Photos Picker API)

### 2.2. URIs de Redirecionamento Autorizados
No cliente OAuth 2.0 (Tipo: Aplicação Web):
```text
http://localhost:3333/api/integrations/google-photos/callback
```

### 2.3. Usuários de Teste (Test Users)
Enquanto o app estiver em modo **"Testing"** no GCP:
- Apenas e-mails explicitamente listados na aba **"Test users"** conseguirão efetuar login.
- Contas não cadastradas receberão o erro `Erro 403: access_denied`.
- Em produção aberta, o status de publicação deve ser alterado para **"In production"**.

---

## 3. Endpoints da Arquitetura

| Método | Endpoint | Descrição |
| :--- | :--- | :--- |
| `GET` | `/api/auth/google/url` | Gera a URL de consentimento do Google com state assinado anti-CSRF |
| `GET` | `/api/integrations/google-photos/callback` | Multiplexador do retorno OAuth (redireciona para login ou conexão de fotos) |
| `GET` | `/api/integrations/google-photos/status` | Retorna status de conexão e configuração do Google Fotos |
| `POST` | `/api/integrations/google-photos/authorization-url` | Gera URL de consentimento para a Google Photos Picker API |
| `POST` | `/api/capsules/:id/google-photos/sessions` | Inicia uma sessão oficial no Google Photos Picker |
| `GET` | `/api/capsules/:id/google-photos/sessions/:sessionId` | Consulta status do seletor (polling de seleção) |
| `POST` | `/api/capsules/:id/google-photos/sessions/:sessionId/import` | Baixa as fotos selecionadas e guarda na cápsula |

---

## 4. Como Executar os Testes Automatizados

Na raiz do projeto:
```bash
node qa-agent.mjs
```

O agente de testes valida:
- Portas do Backend (3333 e 8000) e Frontend (5173).
- Conexão e schema MySQL (`users`, `integration_connections`, `google_photos_picker_sessions`, `memories`).
- Cadastro e login tradicional por e-mail e senha.
- Emissão e validação de tokens JWT.
- Endpoint de URL do Google com escopos OIDC e anti-CSRF state.
- Status e rotas da Google Photos Picker API.
