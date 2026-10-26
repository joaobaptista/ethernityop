# 📸 Arquitetura de Integração: Google Fotos, OAuth 2.0 & Cofre Digital

Documentação técnica completa da integração com o **Google Fotos** no **Ethernity DMs**, cobrindo o ciclo de vida de autenticação OAuth 2.0, consumo da **Google Photos Picker API**, endpoints de backend, criptografia de ponta a ponta (E2EE) no dispositivo e regras de vinculação ao Cofre e Cápsulas do Tempo.

---

## 📌 Índice
1. [Visão Geral da Arquitetura](#-visão-geral-da-arquitetura)
2. [Fluxo de Autenticação & Sessões (OAuth 2.0 / Picker API)](#-fluxo-de-autenticação--sessões-oauth-20--picker-api)
3. [Endpoints REST do Backend (`/google-photos/*`)](#-endpoints-rest-do-backend-google-photos)
4. [Camada de Frontend (`googlePhotosService` & Componentes)](#-camada-de-frontend-googlephotosservice--componentes)
5. [Criptografia no Cofre Digital (AES-256-GCM)](#-criptografia-no-cofre-digital-aes-256-gcm)
6. [Regras de Negócio & Vinculação com Cápsulas do Tempo](#-regras-de-negócio--vinculação-com-cápsulas-do-tempo)
7. [Guia de Configuração de Credenciais (.env)](#-guia-de-configuração-de-credenciais-env)

---

## 🎯 Visão Geral da Arquitetura

A integração com o Google Fotos foi concebida para unir **conveniência de importação** com **máxima privacidade e soberania de dados**.

```
[ Usuário na Tela "Comece Aqui" ]
              │
              ▼
   Clica em "Conectar Google Photos"
              │
              ▼
[ Janela Oficial do Google (OAuth 2.0) ] ──▶ Login seguro com E-mail e Senha Google
              │
              ▼
[ Google Photos Picker API ] ──────────────▶ Usuário escolhe fotos e álbuns
              │
              ▼
[ Backend (/google-photos/import) ] ───────▶ Gera IDs de custódia e metadados
              │
              ▼
[ Motor de Criptografia AES-256 ] ─────────▶ Web Crypto API + localVaultService
              │
              ├─────────────────────────────────────────┐
              ▼                                         ▼
   [ Salvo no "Meu Cofre" ]                [ Adicionado a uma "Cápsula do Tempo" ]
   (100% privado / Criptografado)          (Vinculado a um destinatário: ex. filha)
                                                        │
                                                        ▼
                                           [ Entrega Programada / Guardião ]
                                           (Data, Formatura, Casamento ou Ausência)
```

---

## 🔑 Fluxo de Autenticação & Sessões (OAuth 2.0 / Picker API)

O Ethernity adota o padrão moderno recomendado pelo Google (**Google Photos Picker API**):

1. **Zero Credenciais Vazadas**: A aplicação nunca recebe e nem armazena a senha do usuário. O login é realizado em pop-up seguro nos servidores do Google (`https://accounts.google.com/`).
2. **Escopos Mínimos Necessários**:
   - `https://www.googleapis.com/auth/photospicker.mediaitems.readonly`
   - `email`
   - `profile`
3. **Modo Híbrido Resiliente**:
   - **Produção**: Quando a variável `VITE_GOOGLE_CLIENT_ID` está preenchida, o sistema dispara o fluxo oficial do Google Identity Services (GIS).
   - **Desenvolvimento / Demo**: Quando executado sem credenciais de nuvem, entra automaticamente em modo de simulação em alta resolução com fotos curadas por momentos.

---

## 🛣️ Endpoints REST do Backend (`/google-photos/*`)

O arquivo [backend/src/routes/googlePhotos.js](file:///Users/vagneribas/Documents/GitHub/ethernity/backend/src/routes/googlePhotos.js) disponibiliza as seguintes rotas:

| Método | Endpoint | Descrição |
| :--- | :--- | :--- |
| `GET` | `/google-photos/auth-url` | Retorna a URL de autorização OAuth 2.0 com Client ID, redirect URI e escopo da Picker API. |
| `GET` | `/google-photos/status` | Retorna o status de conexão atual da conta do usuário autenticado. |
| `POST` | `/google-photos/connect` | Registra e persiste o estado de conta conectada (e-mail, nome, avatar). |
| `POST` | `/google-photos/session` | Cria uma nova sessão da Google Photos Picker API (`https://photospicker.googleapis.com/v1/sessions`). |
| `GET` | `/google-photos/photos` | Lista fotos disponíveis com suporte a busca e filtros por categoria (`family`, `special`, `travel`, `documents`). |
| `POST` | `/google-photos/import` | Recebe IDs de fotos selecionadas, gera identificadores de custódia (`vaultId`) e persiste no cofre do usuário ou vincula a uma cápsula. |
| `POST` | `/google-photos/disconnect` | Desconecta a conta e revoga tokens da sessão. |

---

## 💻 Camada de Frontend (`googlePhotosService` & Componentes)

### 1. Serviço de Gerenciamento: [`frontend/src/core/services/googlePhotosService.js`](file:///Users/vagneribas/Documents/GitHub/ethernity/frontend/src/core/services/googlePhotosService.js)
- Padrão **Observable/Pub-Sub**: Notifica componentes em tempo real via eventos customizados (`ethernity_google_photos_updated` e `ethernity_vault_updated`).
- Integração com `localVaultService` para gravação de registros cifrados no IndexedDB.

### 2. Componentes Visuais:
- **`ConnectMemoriesView.jsx`**: Tela "Comece Aqui" com cards de fontes de memória (Google Fotos, iCloud e Upload Manual), badges de conexão e contadores em tempo real.
- **`GooglePhotosPickerModal.jsx`**: Modal de galeria com filtros de momentos marcantes (*Família, Viagens, Celebrações, Documentos Históricos*), busca instantânea, Lightbox em tela cheia e barra de ações.
- **`VaultView.jsx`**: Visualizador do Cofre Digital com filtro dedicado a *Fotos & Google*, badges de criptografia AES-256 e opção direta de envio em cápsula.
- **`CapsulesView.jsx`**: Criador e curador de Cápsulas do Tempo com detecção automática de fotos importadas no rascunho.

---

## 🔒 Criptografia no Cofre Digital (AES-256-GCM)

A segurança das memórias segue os mais rigorosos padrões de proteção:

1. **Chave Simétrica Mestre**: Gerada através da Web Crypto API do navegador (`AES-GCM` com 256 bits).
2. **Vetor de Inicialização (IV)**: Cada memória ou foto importada recebe um IV único de 12 bytes gerado aleatoriamente (`crypto.getRandomValues`).
3. **Armazenamento Seguro Local-First**: O texto, metadados e URLs protegidas são armazenados cifrados no IndexedDB local do usuário ([localVaultService.js](file:///Users/vagneribas/Documents/GitHub/ethernity/frontend/src/core/services/localVaultService.js)).

---

## 💼 Regras de Negócio & Vinculação com Cápsulas do Tempo

1. **Estado Inicial (Privacidade Total)**:
   - Toda foto importada do Google Fotos entra no cofre com status privado, visível unicamente pelo titular da conta.
2. **Associação a Cápsulas de Destinatários**:
   - O usuário pode associar fotos do cofre a uma **Cápsula do Tempo** criada para uma pessoa específica (ex.: *Mariana - Filha*).
   - O usuário pode narrar histórias em áudio ou gravar vídeos sobre a foto na etapa de curadoria da cápsula.
3. **Gatilhos de Entrega**:
   - A foto e a cápsula permanecem lacradas até a ativação do gatilho configurado:
     - 📅 **Data Futura Programada** (ex.: aniversário de 18 anos).
     - 🎓 **Evento de Vida** (ex.: formatura, casamento).
     - 🛡️ **Protocolo do Guardião de Confiança** (em caso de falecimento ou ausência).

---

## ⚙️ Guia de Configuração de Credenciais (.env)

Para ativar com uma conta Google de produção:
1. Obtenha o Client ID no [Google Cloud Console](https://console.cloud.google.com/) seguindo o guia detalhado em [`doc/GUIA_PASSO_A_PASSO_GOOGLE_PHOTOS.md`](GUIA_PASSO_A_PASSO_GOOGLE_PHOTOS.md).
2. Crie ou edite o arquivo `frontend/.env`:
   ```env
   VITE_GOOGLE_CLIENT_ID=seu_client_id_aqui.apps.googleusercontent.com
   VITE_API_URL=http://localhost:8000
   ```
