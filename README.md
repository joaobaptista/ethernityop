# 🕊️ Ethernity DMs — Legado Digital & Memórias Vivas

Sistema completo e humanizado projetado para **eternizar memórias, legados, mensagens de voz, vídeos, conselhos e documentos essenciais** para familiares e entes queridos, durante a vida e após a morte.

O projeto une segurança de nível militar (criptografia ponta a ponta), inteligência para seleção de fotos e narração de memórias, e uma rede de **Guardiões de Confiança** para liberação programada e póstuma de cápsulas do tempo.

---

## 🌟 Pilares & Funcionalidades do Ethernity DMs

1. **🌟 Comece Aqui (Conexão de Memórias & Linha do Tempo):**
   * Conexão nativa com **Google Photos** e **Apple iCloud** com curadoria de momentos especiais.
   * Linha do tempo visual organizada por anos e marcos afetivos da família.
   * Gravação e envio direto de **mensagens de voz**, **vídeos de depoimento** e **cartas digitais** para o cofre e cápsulas.
2. **🔒 Meu Cofre Digital:**
   * Armazenamento ultra-seguro categorizado (*Voz e Áudios*, *Vídeos*, *Cartas de Amor*, *Diretivas e Documentos*).
   * Reprodução e descriptografia segura sob demanda.
3. **🛡️ Rede de Guardiões:**
   * Designação de pessoas de máxima confiança para validação de marcos de vida e liberação de cápsulas póstumas com dupla confirmação.
   * Protocolo de verificação periódica de bem-estar (*Life-check*).
4. **🎁 Cápsulas do Tempo & Entregas Programadas:**
   * Programação de presentes digitais e mensagens para datas marcantes (*18º aniversário de filhos*, *bodas de casamento*, *formaturas* ou *após a partida física*).
5. **🎙️ Avatar e Eternização de Voz:**
   * Treinamento e preservação do timbre, entonação e expressividade da voz para que histórias familiares nunca sejam esquecidas.
6. **📅 Calendário de Legado:**
   * Cronograma visual de entregas programadas, datas comemorativas e revisões anuais de diretivas.
7. **👥 Círculo & Família (Mensageria e Apoio em Tempo Real):**
   * Chat em tempo real via **WebSockets (Socket.io)**, telemetria segura e status de tranquilidade familiar.

---

## 🎨 Identidade Visual & Design System

A interface do Ethernity DMs é construída sobre uma paleta acolhedora, humana e sofisticada:

* **Terracota Coral Vivo (`#EE5945`):** Calor, vida, memória ativa e afeto.
* **Canvas Bege Acolhedor (`#FAF7F2` / `#FDFBF7`):** Conforto visual e serenidade.
* **Tipografia Chocolate Profundo (`#2D1B18`):** Alta legibilidade e sofisticação editorial (Playfair / Inter).
* **Modo Escuro / Noturno:** Tons nobres de carvão e obsidiana com acentos quentes (`#14110F`, `#1E1A17`).
* 📄 **Documentação do Design System:** [`doc/DESIGN_SYSTEM.md`](./doc/DESIGN_SYSTEM.md)
* 🌐 **Showcase Interativo (HTML):** [`doc/design_system.html`](./doc/design_system.html)

---

## 📱 Progressive Web App (PWA — Desktop & Mobile)

* 📲 **Execução Standalone:** Sem barras de navegador, experiência nativa em iOS, Android, macOS e Windows.
* ⚡ **Segurança & Offline:** Acesso a rascunhos e mensagens locais via Service Worker.

---

## 🚀 Como Executar o Projeto

Pré-requisito: **Node.js `>= 20`**.

### Executar a partir da raiz:

```bash
# Iniciar o Back-end com Socket.io (http://localhost:8000)
npm start

# Iniciar o Front-end React (http://localhost:5173)
npm run dev

# Executar a suíte de testes unitários do backend
npm test
```

### Executar entrando em cada pasta:

#### 1. Back-end (`backend/`)
```bash
cd backend
npm install
npm start          # Inicia na porta http://localhost:8000
```
- **Health check:** `http://localhost:8000/health`
- **Swagger UI:** `http://localhost:8000/docs`
- **OpenAPI 3.0 JSON:** `http://localhost:8000/openapi.json`
- **WebSocket Endpoint:** `ws://localhost:8000/socket.io/`

#### 2. Front-end (`frontend/`)
```bash
cd frontend
npm install
npm run dev        # Inicia a interface web em http://localhost:5173
```

---

## 👤 Credenciais Demo

| Campo | Valor |
| --- | --- |
| **E-mail de Teste** | `demo@ethernity.com` |
| **Senha** | `bdCare2026!Demo` ou `password123` |
| **Perfil Demo** | Vagner Ibas — *Plano Infinity* |

---

## 📁 Estrutura do Repositório

```
ethernity/
├── backend/                   # API REST Express + WebSocket Server (Socket.io)
│   ├── src/                   # Rotas de auth, perfis, telemetria e mensageria
│   ├── test/                  # Testes automatizados com node:test
│   └── uploads/               # Armazenamento seguro de arquivos de mídia
├── frontend/                  # Aplicação Web React + Vite (Clean Architecture + DDD)
│   ├── src/
│   │   ├── core/              # Componentes base, i18n (pt-BR, en-US, es-ES), Sockets
│   │   │   └── components/    # Sidebar, BottomNav, HeaderActions
│   │   ├── modules/           # Bounded Contexts
│   │   │   ├── memories/      # Comece Aqui (Google Photos, iCloud, Gravação de Voz/Vídeo)
│   │   │   ├── vault/         # Meu Cofre Digital (Áudios, Vídeos, Cartas, Docs)
│   │   │   ├── guardian/      # Rede de Guardiões e Protocolo de Confiança
│   │   │   ├── capsules/      # Cápsulas do Tempo e Entregas Programadas
│   │   │   ├── avatar/        # Avatar e Eternização de Voz
│   │   │   ├── calendar/      # Calendário de Legado e Entregas

│   │   │   ├── tracking/      # Localização & Sensores Seguros
│   │   │   ├── profile/       # Perfil do Usuário
│   │   │   └── dashboard/     # Orquestrador MainApp
│   │   └── styles/            # Design tokens e folhas de estilo globais
├── DOCUMENTACAO.md            # 📚 Documentação técnica única (arquitetura, cofre, IA, segurança, deploy, pendências)
├── doc/                       # 🎨 Design System e Manuais Legados
│   ├── DESIGN_SYSTEM.md       # Guia de Tokens e Estilos
│   └── design_system.html     # Showcase Interativo
├── qa-agent.mjs               # 🩺 Agente de Auditoria E2E (23/23 testes de infra, auth, cofre e Google)
└── README.md
```

---

## 🩺 Auditoria e Testes de Sanidade

Para auditar o servidor em qualquer ambiente (desenvolvimento ou produção):

```bash
# Executa a auditoria completa (Infra, MySQL, Auth, Google Photos, Cofre Multimodal)
node qa-agent.mjs

# Executa testes unitários e de integração do cofre criptografado:
npm --prefix backend test -- test/vaultMedia.test.js
npm --prefix frontend test
```

