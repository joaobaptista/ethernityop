# 📚 Central de Documentação Técnica — Ethernity DMS

Bem-vindo ao diretório central de documentação técnica e guias de arquitetura do projeto **Ethernity DMS**.

---

## 📑 Índice de Documentações

| Documento | Descrição & Escopo |
| :--- | :--- |
| [**⚡ Swagger UI & Especificação OpenAPI 3.0**](./openapi.json) | Documentação interativa de endpoints REST (`/docs`), visualizador ReDoc (`/redoc`) e especificação JSON (`/openapi.json`). |
| [**💳 Guia de Pagamentos & Mercado Pago**](./MERCADO_PAGO_INTEGRATION.md) | Integração completa com Mercado Pago (PIX, Cartão de Crédito e Débito, Checkout Pro, Webhooks e Cartões de Teste). |
| [**📡 Arquitetura de Dados & Contratos JSON**](./JSON_DATA_ARCHITECTURE.md) | Catálogo completo de esquemas JSON, fluxo Clean Architecture/DDD, Repositórios e chamadas HTTP/WebSocket. |
| [**💬 Arquitetura de Mensageria & WebSockets**](./MESSAGING_ARCHITECTURE.md) | Especificação de comunicação em tempo real, tópicos de telemetria MQTT, salas Socket.io e protocolos de telemetria. |
| [**📱 Progressive Web App (PWA)**](./PWA.md) | Guia de instalação PWA standalone, Service Workers, cache offline e suporte iOS/Android. |
| [**🎨 Design System & Tokens Duais**](./DESIGN_SYSTEM.md) | Princípios visuais, paleta de cores para saúde/emergência, contraste noturno e tipografia. |
| [**🔒 Arquitetura WebRTC P2P, E2EE & LGPD**](./WEBRTC_P2P_ARCHITECTURE.md) | Comunicação P2P para mensagens, arquivos, chamadas de voz/vídeo, armazenamento local no celular e conformidade com a LGPD. |
| [**📸 Arquitetura de Integração: Google Fotos**](./GOOGLE_PHOTOS_ARCHITECTURE.md) | Integração OAuth 2.0, Google Photos Picker API, endpoints REST no backend e criptografia AES-256 no Cofre. |
| [**🚀 Configuração em Produção do Google Fotos (Valendo)**](./CONFIGURACAO_PRODUCAO_GOOGLE_PHOTOS.md) | Guia passo a passo para sair do modo de teste (Testing) para modo de produção público e aberto a qualquer usuário Google. |
| [**🛠️ Documentação Técnica: Google Photos Picker API**](./DOCUMENTACAO_GOOGLE_PHOTOS_PICKER.md) | Especificação técnica de sessões Picker, endpoints, polling inteligente e download de mídias. |
| [**🔑 Documentação Técnica: Login & Cadastro Social Google**](./DOCUMENTACAO_LOGIN_GOOGLE.md) | Fluxo de autenticação unificada via Gmail / OpenID Connect (OIDC) com cadastro automático. |
| [**🌐 Showcase Visual Interativo (HTML)**](./design_system.html) | Demonstração interativa dos componentes em HTML puro com alternador de Modo Claro e Escuro. |

---

## 🚀 Como Executar o Projeto

Consulte o [**README.md principal**](../README.md) na raiz do projeto para instruções de inicialização do backend e frontend.

---

## 💼 Regras de Negócio

### 1. Mensagens Gravadas e o Cofre Digital
- **Regra:** Ao criar e gravar uma nova mensagem (seja em formato de texto, áudio ou vídeo) na aba de *Mensagens*, o conteúdo original e todas as suas versões/tentativas salvas (rascunhos ou definitivas) devem ser obrigatoriamente armazenados e espelhados no **Cofre Digital** (`Meu Cofre`).
- **Objetivo:** Garantir que o usuário tenha um repositório centralizado, seguro e criptografado de todas as memórias e legados produzidos, facilitando o gerenciamento e a reatribuição de configurações de entrega sem a necessidade de recriar o conteúdo.

### 2. Criação de Cápsulas por Destinatário
- **Regra:** Cada cápsula ou "perfil" criado no Cofre é, primariamente, vinculado a uma pessoa ou entidade específica (exemplo: *uma afilhada, um filho, ou parceiro*).
- **Conteúdo Ilimitado:** Dentro dessa mesma cápsula dedicada ao destinatário, o usuário pode ir anexando memórias gradativamente e sem limite de formato, funcionando como um grande álbum contínuo (fotos, vídeos, mensagens gravadas, cartas de texto e documentos legais/pessoais).
- **Objetivo:** Concentrar todo o legado destinado a uma mesma pessoa em uma única estrutura organizacional, para que no momento do gatilho (Data Específica ou Falecimento), o destinatário receba um pacote unificado de memórias.

### 3. Integração com Google Fotos e Criptografia no Cofre
- **Regra:** As fotos importadas do Google Fotos entram inicialmente no **Cofre Digital** em estado 100% privado e com criptografia simétrica AES-256-GCM. O usuário tem a opção de selecioná-las para criar ou anexar a uma **Cápsula do Tempo** para entrega programada ou guardá-las em seu patrimônio afetivo pessoal.
- **Objetivo:** Garantir soberania total dos dados e privacidade seletiva ao usuário, transformando fotografias cotidianas em memórias eternas vinculadas ao legado familiar.
