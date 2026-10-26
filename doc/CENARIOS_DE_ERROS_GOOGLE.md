# Guia de Cenários de Erros, Diagnósticos e Soluções — Eternity

Este documento registra os principais cenários de erro enfrentados durante o desenvolvimento e evolução da plataforma Eternity (com ênfase nas integrações com Google OAuth, Google Photos Picker, persistência MySQL e ciclo de vida do React), detalhando sintomas, causas raízes, soluções definitivas e como o **Agente de QA** automatizado previne cada caso.

---

## Índice de Cenários

1. [Cenário 1: Loop Infinito e Travamento no Navegador ao Retornar do Google OAuth](#cenário-1-loop-infinito-e-travamento-no-navegador-ao-retornar-do-google-oauth)
2. [Cenário 2: Erro 403 `access_denied` no Google Cloud OAuth](#cenário-2-erro-403-access_denied-no-google-cloud-oauth)
3. [Cenário 3: Falha ao Inserir Usuário Social no Banco (`password_hash cannot be null`)](#cenário-3-falha-ao-inserir-usuário-social-no-banco-password_hash-cannot-be-null)
4. [Cenário 4: Divergência de Assinatura JWT (`invalid signature`) por Resolução de Diretório](#cenário-4-divergência-de-assinatura-jwt-invalid-signature-por-resolução-de-diretório)
5. [Cenário 5: Poluição Visual com Nomes de Arquivo Técnicos (`IMG_...jpg`) nas Fotos](#cenário-5-poluição-visual-com-nomes-de-arquivo-técnicos-img_jpg-nas-fotos)
6. [Cenário 6: Sessão Expirada ou Inexistente do Google Photos ao Salvar Fotos](#cenário-6-sessão-expirada-ou-inexistente-do-google-photos-ao-salvar-fotos)
7. [Cenário 7: Erro `Failed to fetch` ao Iniciar Login com Google em Portas Dinâmicas (CORS)](#cenário-7-erro-failed-to-fetch-ao-iniciar-login-com-google-em-portas-dinâmicas-cors)
8. [Matriz de Prevenção pelo Agente de QA](#matriz-de-prevenção-pelo-agente-de-qa)

---

## Cenário 1: Loop Infinito e Travamento no Navegador ao Retornar do Google OAuth

### Sintomas no Console
```text
▲ Throttling navigation to prevent the browser from hanging. See https://crbug.com/1038223. Command line switch --disable-ipc-flooding-protection can be used to bypass the protection AuthPage.jsx:37
2843 Warning: Maximum update depth exceeded. This can happen when a component calls setState inside useEffect, but useEffect either doesn't have a dependency array, or one of the dependencies changes on every render. Error Component Stack
at AuthPage (AuthPage.jsx:7:34)
at AuthProvider (AuthContext.jsx:14:32)
```
- A aba do navegador trava ou consome alta CPU.
- O Chrome interrompe o processo por proteção contra *IPC Flooding*.

### Causa Raiz
1. **Recriação de Referência no Contexto:** Em `AuthContext.jsx`, a função `loginWithToken` era gerada como uma função anônima dentro de `useMemo(() => ({ ... }), [token, user])`. Sempre que o estado `token` ou `user` mudava, `useMemo` gerava uma nova referência na memória para `loginWithToken`.
2. **Ciclo de Dependência no `useEffect`:** Em `AuthPage.jsx`, o hook escutava `[searchParams, loginWithToken, navigate]`. Ao salvar o token na primeira vez, o contexto mudava, `loginWithToken` recebia nova referência, disparando novamente o `useEffect`. Como os parâmetros `?token=...&user=...` ainda estavam na URL, a função era invocada milhares de vezes por segundo em loop infinito.

### Solução Aplicada
1. **Estabilização de Funções com `useCallback` ([`frontend/src/context/AuthContext.jsx`](frontend/src/context/AuthContext.jsx)):**
   ```javascript
   const completeSession = useCallback((response) => {
     const nextSession = sessionFromResponse(response);
     saveSession(nextSession);
     setToken(nextSession.token);
     setUser(nextSession.user);
     return nextSession;
   }, []);

   const loginWithToken = useCallback((session) => {
     return completeSession(session);
   }, [completeSession]);
   ```
2. **Trava de Execução Única com `useRef` ([`frontend/src/pages/AuthPage.jsx`](frontend/src/pages/AuthPage.jsx)):**
   ```javascript
   const processedTokenRef = useRef(false);

   useEffect(() => {
     const token = searchParams.get('token');
     const rawUser = searchParams.get('user');

     if (token && rawUser && !processedTokenRef.current) {
       processedTokenRef.current = true; // Bloqueia reexecuções subsequentes
       const userObj = JSON.parse(rawUser);
       loginWithToken({ token, user: userObj });
       navigate('/', { replace: true });
     }
   }, [searchParams, loginWithToken, navigate]);
   ```

---

## Cenário 2: Erro 403 `access_denied` no Google Cloud OAuth

### Sintomas
Ao clicar no botão "Continuar com o Google" ou "Conectar Google Fotos", a Google bloqueia o login com a tela de erro:
```text
Erro 403: access_denied
O desenvolvedor não concluiu o processo de verificação do Google para este app...
```

### Causa Raiz
No [Google Cloud Console](https://console.cloud.google.com/), enquanto o projeto está em modo **"Testing"** (Em teste) na aba *OAuth Consent Screen*, a API da Google proíbe qualquer conta que não esteja expressamente listada na seção de "Test users".

### Solução Aplicada
1. Acessar o Google Cloud Console > **APIs e Serviços** > **Tela de permissão OAuth**.
2. Rolar até a seção **Usuários de teste** (*Test users*).
3. Clicar em **+ ADD USERS** e adicionar o e-mail Google da pessoa que está testando.
4. Para ambiente de produção aberta, alterar o status de publicação para **"In production"** (Publicar aplicativo).

---

## Cenário 3: Falha ao Inserir Usuário Social no Banco (`password_hash cannot be null`)

### Sintomas
No retorno do callback do Google Social Login, o backend retornava erro HTTP 500:
```text
Error: Column 'password_hash' cannot be null
    at PromisePool.query (...)
```

### Causa Raiz
O banco de dados original da POC possuía a definição `password_hash VARCHAR(255) NOT NULL`. Usuários que se cadastram pelo Google/Gmail usam o protocolo OpenID Connect e não definem senha no sistema da Eternity.

### Solução Aplicada
1. Executado comando DDL de flexibilização no MySQL:
   ```sql
   ALTER TABLE users MODIFY password_hash VARCHAR(255) NULL;
   ```
2. Atualizado o schema em [`database.sql`](database.sql):
   ```sql
   CREATE TABLE IF NOT EXISTS users (
     id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
     name VARCHAR(150) NOT NULL,
     email VARCHAR(191) NOT NULL,
     password_hash VARCHAR(255) NULL,
     ...
   );
   ```

---

## Cenário 4: Divergência de Assinatura JWT (`invalid signature`) por Resolução de Diretório

### Sintomas
Ao executar scripts de teste ou comandos via npm dentro de subpastas (ex.: `npm --prefix backend run test:qa`):
```text
✖ FAIL State Token Anti-CSRF Válido
  ↳ Erro: Falha ao validar state assinado: invalid signature
```

### Causa Raiz
O `process.cwd()` em comandos com `--prefix backend` aponta para o diretório `backend/`. Se o código procurar `.env` via `path.join(process.cwd(), "backend", ".env")`, ele tentará ler `backend/backend/.env` (inexistente). Ao não encontrar o `.env`, o script usava o valor de fallback do `JWT_SECRET`, que era diferente do segredo real utilizado pelo servidor em execução.

### Solução Aplicada
Resolução dinâmica e resiliente da raiz do projeto independente de onde o terminal estiver posicionado ([`qa-agent.mjs`](qa-agent.mjs)):
```javascript
const CURRENT_DIR = path.resolve(process.cwd());
const ROOT_DIR = fs.existsSync(path.join(CURRENT_DIR, "backend"))
  ? CURRENT_DIR
  : path.resolve(CURRENT_DIR, "..");

const BACKEND_ENV_PATH = path.join(ROOT_DIR, "backend", ".env");
if (fs.existsSync(BACKEND_ENV_PATH)) {
  dotenv.config({ path: BACKEND_ENV_PATH });
}
```

---

## Cenário 5: Poluição Visual com Nomes de Arquivo Técnicos (`IMG_...jpg`) nas Fotos

### Sintomas
As fotos importadas do Google Fotos ou câmeras de celular renderizavam títulos como `IMG_20260926_122005364.jpg` ou `PXL_20260926.jpg` em destaque sobre os cards de memória, quebrando a estética acolhedora da aplicação.

### Causa Raiz
O serviço de importação atribuía `title = mediaItem.filename`. Para fotos de smartphone, o nome do arquivo raramente tem significado humano.

### Solução Aplicada
1. **Sanitização no Backend ([`backend/src/services/google-photos.service.js`](backend/src/services/google-photos.service.js)):** Nomes de arquivo de câmera não são mais gravados no campo `title` da tabela `memories`.
2. **Filtro de Detecção no Frontend ([`frontend/src/components/MemoryCard.jsx`](frontend/src/components/MemoryCard.jsx)):**
   ```javascript
   function isRawFileName(title) {
     if (!title) return false;
     return /^((IMG|PXL|DSC|VID|PHOTO)[_-]?\d+|.*\.(jpg|jpeg|png|webp|heic))$/i.test(title.trim());
   }
   ```
3. **Edição Inline de Legendas:** Quando a foto não tem legenda, exibe o botão `✎ Digite uma legenda para essa foto…`. Ao clicar, permite digitar um texto personalizado e salvar via `PATCH /api/memories/:id`.

---

## Cenário 6: Sessão Expirada ou Inexistente do Google Photos ao Salvar Fotos

### Sintomas
Ao tentar importar fotos pelo seletor, o backend retornava:
```text
400 Bad Request: Conexão com o Google Fotos não encontrada. Conecte sua conta Google primeiro.
ou
401 Unauthorized: Sua autorização com o Google Fotos expirou.
```

### Causa Raiz
- O usuário tentou abrir a sessão do Picker sem antes ter concluído o fluxo OAuth do Google Fotos.
- O `access_token` do Google expirou (tempo de vida padrão de 1 hora) e não havia rotina para renovação silenciosa com o `refresh_token`.

### Solução Aplicada
No serviço [`google-photos.service.js`](backend/src/services/google-photos.service.js):
1. Verificação proativa no método `getValidAccessToken(userId)`: se o token expirar nos próximos 2 minutos, o backend utiliza automaticamente o `refresh_token` criptografado para obter um novo `access_token` na Google sem deslogar o usuário:
   ```javascript
   if (credentials.expiresAt && Date.now() > credentials.expiresAt - 120000) {
     const refreshResponse = await fetch(GOOGLE_TOKEN_URL, {
       method: "POST",
       body: new URLSearchParams({
         client_id: env.googlePhotos.clientId,
         client_secret: env.googlePhotos.clientSecret,
         refresh_token: credentials.refreshToken,
         grant_type: "refresh_token"
       })
     });
     // Atualiza as credenciais criptografadas no banco com o novo access_token
   }
   ```

---

## Cenário 7: Erro `Failed to fetch` ao Iniciar Login com Google em Portas Dinâmicas (CORS)

### Sintomas
Ao clicar no botão "Continuar com o Google" na tela de login, o usuário recebia o erro em tela:
```text
Failed to fetch
```
No console do navegador:
```text
Access to fetch at 'http://localhost:3333/api/auth/google/url' from origin 'http://localhost:5174' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

### Causa Raiz
1. **Porta Dinâmica do Vite:** Se a porta padrão `5173` estiver ocupada por outro processo ou projeto, o Vite sobe automaticamente em `http://localhost:5174`.
2. **Restrição Rígida de CORS:** O backend possuía uma lista de origens permitidas baseada estritamente no valor de `CLIENT_URL` do `.env` (`http://localhost:5173`). Quando a requisição vinha de `5174`, o middleware do CORS bloqueava o cabeçalho preflight (`OPTIONS`), fazendo com que o `fetch()` do navegador lançasse `TypeError: Failed to fetch`.
3. **Redirecionamento Fixo no Retorno:** No retorno do OAuth da Google, o backend redirecionava fixamente para `${env.frontendUrl}` (`5173`), o que faria o usuário perder a sessão se estivesse acessando pela porta `5174`.

### Solução Aplicada
1. **CORS Inteligente para Desenvolvimento ([`backend/src/app.js`](backend/src/app.js)):** Em ambiente de desenvolvimento (`nodeEnv !== 'production'`), qualquer porta originada de `localhost` ou `127.0.0.1` é aceita dinamicamente:
   ```javascript
   if (env.nodeEnv !== "production") {
     const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
     if (isLocalhost) return callback(null, true);
   }
   ```
2. **Rastreamento de Origem no State Token ([`backend/src/controllers/auth.controller.js`](backend/src/controllers/auth.controller.js)):**
   - Na geração da URL (`GET /api/auth/google/url`), o backend inspeciona `req.headers.origin` e embute a origem exata de chamada dentro do token JWT `state`.
   - No callback (`handleGoogleAuth`), o backend lê a propriedade `statePayload.origin` e redireciona o usuário exatamente para a porta de onde ele partiu (`5174` ou `5173`), mantendo a navegação e o login 100% consistentes.

---

## Matriz de Prevenção pelo Agente de QA

O script [`qa-agent.mjs`](qa-agent.mjs) foi projetado para cobrir e alertar previamente sobre cada um desses cenários:

| Cenário de Erro | Teste do Agente de QA | Validação Efetuada |
| :--- | :--- | :--- |
| **Cenário 1 (Loop Auth)** | Testes de Browser / Console & Auth Endpoint | Garante respostas HTTP limpas e sem reexecução em cascata |
| **Cenário 2 (OAuth 403)** | `Suite 3 - Escopos OIDC` & `Suite 5 - Escopos Picker` | Confirma que os escopos solicitados são estritamente os cadastrados no GCP |
| **Cenário 3 (password_hash)** | `Suite 1 - Schema users.password_hash` | Verifica no `INFORMATION_SCHEMA` se a coluna aceita `NULL` |
| **Cenário 4 (JWT Secret)** | `Suite 3 - State Token Anti-CSRF Válido` | Garante que o secret do `.env` é lido e assina/decodifica corretamente |
| **Cenário 5 (Legendas)** | `Suite 4 - Edição de Legenda (PATCH)` | Testa envio, persistência e retorno do título customizado |
| **Cenário 6 (Tokens Google)** | `Suite 5 - Status da Conexão & URL` | Valida credenciais do `.env` e parâmetros da sessão |

### Como Executar os Testes a Qualquer Momento:
```bash
# Na raiz do projeto:
node qa-agent.mjs

# Ou via npm pelo backend:
npm --prefix backend run test:qa
```
O resultado detalhado é sempre registrado no arquivo [`QA_REPORT.md`](QA_REPORT.md).
