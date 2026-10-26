# 🖥️ Ethernity DMs — Front-end Application

Interface web progressiva (**PWA**) construída em **React + Vite**, com design moderno, acolhedor e seguro, projetada para gerenciar e eternizar o legado digital, memórias, mensagens de voz, vídeos e documentos de vida.

---

## ⚡ Guia Rápido: Como Rodar o Projeto

### 1. Pré-requisitos
* **Node.js**: versão `>= 18.0.0` (recomendado `>= 20.x`)
* **NPM**: versão `>= 9.x`

### 2. Instalação e Execução

```bash
# 1. Entre na pasta do frontend
cd frontend

# 2. Instale as dependências
npm install

# 3. Inicie o servidor de desenvolvimento Vite
npm run dev
```

A aplicação estará disponível em: **`http://localhost:5173/`**

---

## 🔑 Credenciais de Teste / Demonstração

| Campo | Valor |
| --- | --- |
| **E-mail** | `demo@ethernity.com` |
| **Senha** | `password123` |
| **Perfil** | Vagner Ibas (*Plano Infinity*) |

---

## 🏗️ Arquitetura Limpa & Estrutura Modular (DDD)

A aplicação segue os princípios de **Clean Architecture** e **Domain-Driven Design (DDD)**:

```
frontend/src/
├── core/                           # Kernel Compartilhado & Infraestrutura Base
│   ├── api/                        # Wrapper HTTP centralizado
│   ├── services/                   # Singletons (Socket.io, Notificações)
│   ├── i18n/                       # Internacionalização (pt-BR, en-US, es-ES)
│   └── components/                 # Sidebar, BottomNav, HeaderActions, NetworkStatusBar
│
├── modules/                        # Bounded Contexts
│   ├── memories/                   # 🌟 Comece Aqui (Conexão Google Photos, iCloud, Gravador)
│   ├── vault/                      # 🔒 Meu Cofre Digital (Áudios, Vídeos, Cartas, Documentos)
│   ├── guardian/                   # 🛡️ Rede de Guardiões & Protocolo de Liberação
│   ├── capsules/                   # 🎁 Cápsulas do Tempo & Entregas Programadas
│   ├── avatar/                     # 🎙️ Avatar e Eternização de Voz
│   ├── calendar/                   # 📅 Calendário de Legado & Marcos Familiares

│   ├── tracking/                   # 📍 Localização & Dispositivos Seguros
│   ├── profile/                    # 👤 Perfil do Usuário
│   └── dashboard/                  # 📱 Orquestrador Principal (MainApp)
└── styles/                         # Design tokens, paleta terracota/bege e temas
```
