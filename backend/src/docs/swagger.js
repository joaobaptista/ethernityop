/**
 * docs/swagger.js
 * Especificação OpenAPI 3.0.3 completa e renderizadores de Swagger UI e ReDoc.
 */
import { Router } from 'express';

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Ethernity DMS — REST & Real-time API',
    description: `API de Legado Digital, Cofre Criptografado, Telemetria, Mensagens e Assinaturas com Mercado Pago.
    
### Recursos Principais:
* 🔐 **Autenticação JWT** (Bearer Token)
* 📍 **Gestão de Dispositivos & Guardiões**
* 🛡️ **Cercas Virtuais (Geofencing)**
* 🔔 **Mensageria & Alertas**
* 👤 **Perfil do Usuário & Protocolo de Legado**
* 💳 **Assinaturas & Mercado Pago** (PIX Instantâneo, Cartão de Crédito e Débito, Webhooks)
`,
    version: '1.2.0',
    contact: {
      name: 'Suporte Ethernity DMS',
      email: 'suporte@ethernity.com',
      url: 'https://ethernity.com',
    },
    license: {
      name: 'Proprietary / Ethernity DMS',
    },
  },
  servers: [
    {
      url: 'http://localhost:3333',
      description: 'Servidor Principal Ethernity (Porta 3333)',
    },
    {
      url: 'http://localhost:8000',
      description: 'Servidor de Compatibilidade (Porta 8000)',
    },
  ],
  tags: [
    { name: 'Autenticação & Social Login', description: 'Registro, Login JWT e autenticação Google OAuth 2.0 (Gmail / OpenID Connect)' },
    { name: 'Perfil do Usuário', description: 'Dados cadastrais, upload e cache local de foto de perfil' },
    { name: 'Google Fotos Picker API', description: 'Fluxo oficial da Google Photos Picker API (autorização, sessões, listagem e importação para o cofre)' },
    { name: 'Cápsulas do Tempo', description: 'Criação, curadoria, narração com foto original e ciclo de vida de cápsulas do tempo' },
    { name: 'Guardiões & Dead Man Switch', description: 'Gestão de guardiões de confiança e gatilhos de entrega' },
    { name: 'Cofre Digital & Mídia', description: 'Armazenamento seguro, criptografia Zero-Knowledge AES-256-GCM, transcodificação WebP Multi-Tier e CryptoShred' },
    { name: 'Memórias & Linha do Tempo', description: 'Consultas de memórias e fotos sincronizadas no banco monolito MySQL' },
    { name: 'Mensagens & Cartas', description: 'Cartas para o futuro, agendamentos e assistente gerativo de ideação com IA' },
    { name: 'Assinaturas & Mercado Pago', description: 'Planos SaaS, pagamentos via PIX Instantâneo, Cartão de Crédito/Débito e Webhooks' },
    { name: 'Sistema & Telemetria', description: 'Health check, métricas Prometheus e status do serviço' },
  ],
  paths: {
    '/register': {
      post: {
        tags: ['Autenticação & Social Login'],
        summary: 'Cadastrar novo usuário (Email e Senha)',
        operationId: 'registerUser',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RegisterRequest' },
            },
          },
        },
        responses: {
          201: {
            description: 'Usuário cadastrado com sucesso',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UserResponse' },
              },
            },
          },
          400: {
            description: 'Email já existente ou dados inválidos',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/login': {
      post: {
        tags: ['Autenticação & Social Login'],
        summary: 'Autenticar usuário e gerar Token JWT',
        operationId: 'loginUser',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Login efetuado com sucesso',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LoginResponse' },
              },
            },
          },
          401: {
            description: 'Credenciais inválidas',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Autenticação & Social Login'],
        summary: 'Obter dados da sessão do usuário autenticado (Sincronizado com MySQL)',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Dados da sessão atual do usuário',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user: { $ref: '#/components/schemas/UserProfile' },
                  },
                },
              },
            },
          },
          401: { description: 'Não autenticado' },
        },
      },
    },
    '/api/auth/google/url': {
      get: {
        tags: ['Autenticação & Social Login'],
        summary: 'Gerar URL oficial de consentimento do Google OAuth 2.0 (Gmail / OpenID Connect)',
        responses: {
          200: {
            description: 'URL de consentimento gerada com state JWT anti-CSRF',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    url: { type: 'string', example: 'https://accounts.google.com/o/oauth2/v2/auth?...' },
                  },
                },
              },
            },
          },
          500: { description: 'Google OAuth não configurado no servidor' },
        },
      },
    },
    '/profile': {
      get: {
        tags: ['Perfil do Usuário'],
        summary: 'Obter dados do perfil do usuário autenticado',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Dados do perfil do usuário',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UserProfile' },
              },
            },
          },
          401: { description: 'Não autorizado' },
        },
      },
      put: {
        tags: ['Perfil do Usuário'],
        summary: 'Atualizar dados cadastrais do perfil do usuário',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ProfileUpdateRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Perfil atualizado com sucesso',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UserProfile' },
              },
            },
          },
          401: { description: 'Não autorizado' },
        },
      },
    },
    '/profile/photo': {
      post: {
        tags: ['Perfil do Usuário'],
        summary: 'Upload de foto de avatar (Multipart/form-data com persistência MySQL)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  photo: { type: 'string', format: 'binary' },
                  file: { type: 'string', format: 'binary' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Foto enviada e vinculada ao perfil com sucesso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    photo_url: { type: 'string', example: '/uploads/avatar-google-123.jpg' },
                    avatar_url: { type: 'string', example: '/uploads/avatar-google-123.jpg' },
                    user: { $ref: '#/components/schemas/UserProfile' },
                  },
                },
              },
            },
          },
          400: { description: 'Nenhuma foto válida enviada' },
        },
      },
    },
    '/api/integrations/google-photos/status': {
      get: {
        tags: ['Google Fotos Picker API'],
        summary: 'Consultar status de conexão com Google Fotos do usuário autenticado',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Status da conexão e escopos concedidos',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    connected: { type: 'boolean', example: true },
                    configured: { type: 'boolean', example: true },
                    account: { type: 'string', example: 'vameri@gmail.com' },
                    lastSyncedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/integrations/google-photos/authorization-url': {
      get: {
        tags: ['Google Fotos Picker API'],
        summary: 'Gerar URL de autorização OAuth 2.0 para Google Photos Picker API',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'URL de autorização do Google Photos Picker',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    url: { type: 'string', example: 'https://accounts.google.com/o/oauth2/v2/auth?...' },
                    state: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/integrations/google-photos/sessions': {
      post: {
        tags: ['Google Fotos Picker API'],
        summary: 'Criar nova sessão de seleção de fotos na Google Photos Picker API',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  capsuleId: { type: 'string', example: 'cap-1' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Sessão iniciada na Picker API do Google',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sessionId: { type: 'string' },
                    pickerUri: { type: 'string', example: 'https://photos.google.com/integration/picker/auth/...' },
                    status: { type: 'string', example: 'PENDING' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/integrations/google-photos/sessions/{sessionId}': {
      get: {
        tags: ['Google Fotos Picker API'],
        summary: 'Consultar status e progresso de uma sessão da Picker API',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Status atual da sessão',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sessionId: { type: 'string' },
                    status: { type: 'string', example: 'SELECTION_READY' },
                    selectedCount: { type: 'integer', example: 12 },
                    importedCount: { type: 'integer', example: 0 },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/integrations/google-photos/sessions/{sessionId}/items': {
      get: {
        tags: ['Google Fotos Picker API'],
        summary: 'Listar itens de mídia selecionados pelo usuário na Picker API',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Lista de fotos/vídeos selecionados',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          filename: { type: 'string' },
                          mediaUrl: { type: 'string' },
                          mimeType: { type: 'string' },
                        },
                      },
                    },
                    total: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/integrations/google-photos/sessions/{sessionId}/import': {
      post: {
        tags: ['Google Fotos Picker API'],
        summary: 'Importar itens selecionados da sessão para o cofre de memórias no MySQL',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Importação concluída com sucesso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    importedCount: { type: 'integer', example: 12 },
                    memories: { type: 'array', items: { type: 'object' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/memories': {
      get: {
        tags: ['Memórias & Linha do Tempo'],
        summary: 'Listar todas as memórias e fotos sincronizadas no MySQL',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Lista de memórias persistidas',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    memories: { type: 'array', items: { type: 'object' } },
                    total: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/upload/': {
      post: {
        tags: ['Perfil do Cuidador'],
        summary: 'Upload de foto de perfil (Multipart/form-data)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Upload realizado com sucesso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    url: { type: 'string', example: '/uploads/photo_123.jpg' },
                    filename: { type: 'string', example: 'photo_123.jpg' },
                  },
                },
              },
            },
          },
          400: { description: 'Arquivo inválido ou extensão não permitida' },
        },
      },
    },
    '/capsules/': {
      get: {
        tags: ['Cápsulas do Tempo'],
        summary: 'Listar todas as cápsulas do tempo do usuário',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Lista de cápsulas com status e metadados',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Capsule' },
                },
              },
            },
          },
          403: { description: 'Token de autenticação não fornecido' },
        },
      },
      post: {
        tags: ['Cápsulas do Tempo'],
        summary: 'Criar nova cápsula do tempo (Zero-Knowledge & Foto Original)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CapsuleCreate' },
            },
          },
        },
        responses: {
          201: {
            description: 'Cápsula criada com sucesso',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Capsule' },
              },
            },
          },
          400: { description: 'Título ou campos obrigatórios ausentes' },
        },
      },
    },
    '/guardians/': {
      get: {
        tags: ['Guardiões & Dead Man Switch'],
        summary: 'Listar guardiões de confiança do usuário',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Lista de guardiões ativos',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Guardian' },
                },
              },
            },
          },
          403: { description: 'Não autorizado' },
        },
      },
      post: {
        tags: ['Guardiões & Dead Man Switch'],
        summary: 'Cadastrar novo guardião para protocolo DMS',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GuardianCreate' },
            },
          },
        },
        responses: {
          201: {
            description: 'Guardião cadastrado com sucesso',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Guardian' },
              },
            },
          },
          400: { description: 'Campos obrigatórios ausentes' },
        },
      },
    },
    '/messages/': {
      get: {
        tags: ['Mensagens & Alertas'],
        summary: 'Listar alertas, notificações e chamados de cuidado',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Lista de mensagens e alertas',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Message' },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Mensagens & Alertas'],
        summary: 'Criar nova mensagem de alerta ou chamada médica',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageCreate' },
            },
          },
        },
        responses: {
          201: { description: 'Mensagem criada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Message' } } } },
        },
      },
    },
    '/subscriptions/plans': {
      get: {
        tags: ['Assinaturas & Mercado Pago'],
        summary: 'Listar todos os planos SaaS e métodos de pagamento disponíveis',
        responses: {
          200: {
            description: 'Planos disponíveis',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PlansResponse' },
              },
            },
          },
        },
      },
    },
    '/subscriptions/current': {
      get: {
        tags: ['Assinaturas & Mercado Pago'],
        summary: 'Obter status da assinatura ativa do usuário e limites de uso',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Assinatura e limites de uso',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CurrentSubscriptionResponse' },
              },
            },
          },
        },
      },
    },
    '/subscriptions/create-preference': {
      post: {
        tags: ['Assinaturas & Mercado Pago'],
        summary: 'Gerar transação de pagamento no Mercado Pago (PIX ou Checkout Pro)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreatePreferenceRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Dados da transação gerada com sucesso (PIX Copia-e-Cola ou Link Checkout Pro)',
          },
        },
      },
    },
    '/subscriptions/pay-card': {
      post: {
        tags: ['Assinaturas & Mercado Pago'],
        summary: 'Processar pagamento transparente com Cartão de Crédito ou Débito',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PayCardRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Pagamento autorizado e assinatura ativada',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Pagamento com cartão de crédito aprovado!' },
                    paymentId: { type: 'string', example: 'mp_cc_1788726555' },
                    subscription: { $ref: '#/components/schemas/Subscription' },
                  },
                },
              },
            },
          },
          400: { description: 'Dados do cartão inválidos ou recusados' },
        },
      },
    },
    '/subscriptions/webhook': {
      post: {
        tags: ['Assinaturas & Mercado Pago'],
        summary: 'Webhook oficial do Mercado Pago para confirmação de transações',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object' },
            },
          },
        },
        responses: {
          200: { description: 'Webhook processado com sucesso' },
        },
      },
    },
    '/health': {
      get: {
        tags: ['Sistema & Telemetria'],
        summary: 'Verificação de integridade da API e conexão MQTT',
        responses: {
          200: {
            description: 'API operando normalmente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'healthy' },
                    mqtt: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', example: 'connected' },
                        broker: { type: 'string', example: 'mock.local' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/metrics': {
      get: {
        tags: ['Sistema & Telemetria'],
        summary: 'Exportador de métricas no padrão Prometheus',
        responses: {
          200: {
            description: 'Métricas de telemetria em formato texto',
            content: { 'text/plain': { schema: { type: 'string' } } },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Insira o token JWT gerado na rota /login no formato: Bearer <token>',
      },
    },
    schemas: {
      RegisterRequest: {
        type: 'object',
        required: ['email', 'password', 'name'],
        properties: {
          email: { type: 'string', format: 'email', example: 'guardiao@ethernity.com' },
          password: { type: 'string', minLength: 6, example: 'senhaSegura123' },
          name: { type: 'string', example: 'Dr. Vagner Ibas' },
          phone: { type: 'string', example: '(11) 98765-4321' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'demo@ethernity.com' },
          password: { type: 'string', example: 'password123' },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          access_token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
          token_type: { type: 'string', example: 'bearer' },
          user: { $ref: '#/components/schemas/UserProfile' },
        },
      },
      UserProfile: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'u-1' },
          email: { type: 'string', example: 'demo@ethernity.com' },
          name: { type: 'string', example: 'Demo User' },
          phone: { type: 'string', example: '(11) 98765-4321' },
          photo_url: { type: 'string', example: '/uploads/avatar.webp' },
        },
      },
      ProfileUpdateRequest: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string' },
          password: { type: 'string', minLength: 6 },
          photo_url: { type: 'string' },
        },
      },
      Capsule: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'cap-9842' },
          title: { type: 'string', example: 'Mensagem para os 18 anos da Clara' },
          recipient: { type: 'string', example: 'Clara Silva' },
          delivery_type: { type: 'string', example: 'date' },
          scheduled_date: { type: 'string', format: 'date-time' },
          status: { type: 'string', example: 'LOCKED' },
          is_encrypted: { type: 'boolean', example: true },
        },
      },
      CapsuleCreate: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', example: 'Formatura da Mariana' },
          recipient: { type: 'string', example: 'Mariana' },
          delivery_type: { type: 'string', example: 'date' },
          scheduled_date: { type: 'string', format: 'date-time' },
        },
      },
      Guardian: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'guard-101' },
          name: { type: 'string', example: 'Dr. Roberto Alves' },
          email: { type: 'string', example: 'roberto@ethernity.com' },
          relation: { type: 'string', example: 'Médico da Família' },
          status: { type: 'string', example: 'active' },
        },
      },
      GuardianCreate: {
        type: 'object',
        required: ['name', 'email'],
        properties: {
          name: { type: 'string', example: 'Ana Paula' },
          email: { type: 'string', example: 'ana@ethernity.com' },
          phone: { type: 'string', example: '+55 11 99999-8888' },
          relation: { type: 'string', example: 'Irmã' },
        },
      },
      Message: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'msg-demo-1' },
          title: { type: 'string', example: 'Carta para o Futuro — Formatura da Mariana' },
          content: { type: 'string', example: 'Minha querida filha, parabéns pela formatura!' },
          recipientName: { type: 'string', example: 'Mariana Silva' },
          status: { type: 'string', example: 'scheduled' },
          deliveryDate: { type: 'string', format: 'date' },
        },
      },
      MessageCreate: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', example: 'Carta de Aniversário Especial' },
          content: { type: 'string', example: 'Mensagem carinhosa de celebração...' },
          recipientName: { type: 'string', example: 'Mariana' },
          deliveryDate: { type: 'string', format: 'date' },
        },
      },
      PlansResponse: {
        type: 'object',
        properties: {
          currency: { type: 'string', example: 'BRL' },
          supportedPaymentMethods: {
            type: 'array',
            items: { type: 'string' },
            example: ['pix', 'credit_card', 'debit_card', 'mercado_pago_checkout'],
          },
          plans: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', example: 'family' },
                name: { type: 'string', example: 'Cuidado Familiar' },
                priceMonthly: { type: 'number', example: 29.90 },
                priceYearly: { type: 'number', example: 299.00 },
                maxDevices: { type: 'integer', example: 3 },
                maxGeofences: { type: 'integer', example: 999 },
                historyDays: { type: 'integer', example: 30 },
                popular: { type: 'boolean', example: true },
                features: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
            },
          },
        },
      },
      CurrentSubscriptionResponse: {
        type: 'object',
        properties: {
          subscription: { $ref: '#/components/schemas/Subscription' },
          usage: {
            type: 'object',
            properties: {
              devicesCount: { type: 'integer', example: 2 },
              devicesLimit: { type: 'integer', example: 3 },
              areasCount: { type: 'integer', example: 1 },
              areasLimit: { type: 'integer', example: 999 },
            },
          },
        },
      },
      Subscription: {
        type: 'object',
        properties: {
          planId: { type: 'string', example: 'family' },
          planName: { type: 'string', example: 'Cuidado Familiar' },
          status: { type: 'string', example: 'active' },
          cycle: { type: 'string', example: 'monthly' },
          maxDevices: { type: 'integer', example: 3 },
          maxGeofences: { type: 'integer', example: 999 },
          historyDays: { type: 'integer', example: 30 },
          expiresAt: { type: 'string', format: 'date-time' },
          paymentMethod: { type: 'string', example: 'mercado_pago_pix' },
        },
      },
      CreatePreferenceRequest: {
        type: 'object',
        required: ['planId'],
        properties: {
          planId: { type: 'string', example: 'family' },
          cycle: { type: 'string', enum: ['monthly', 'yearly'], default: 'monthly' },
          paymentType: { type: 'string', enum: ['pix', 'checkout_pro'], default: 'pix' },
        },
      },
      PayCardRequest: {
        type: 'object',
        required: ['planId', 'cardData'],
        properties: {
          planId: { type: 'string', example: 'family' },
          cycle: { type: 'string', enum: ['monthly', 'yearly'], default: 'monthly' },
          cardData: {
            type: 'object',
            required: ['cardNumber', 'holderName', 'expiry', 'cvv'],
            properties: {
              cardNumber: { type: 'string', example: '4532117088991234' },
              holderName: { type: 'string', example: 'VAGNER IBAS' },
              expiry: { type: 'string', example: '12/28' },
              cvv: { type: 'string', example: '123' },
              cpf: { type: 'string', example: '12345678909' },
              brand: { type: 'string', example: 'Visa' },
              cardType: { type: 'string', enum: ['credit', 'debit'], default: 'credit' },
              installments: { type: 'integer', default: 1 },
            },
          },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          detail: { type: 'string', example: 'Mensagem de erro detalhada' },
        },
      },
    },
  },
};

/**
 * Gera o template HTML standalone do Swagger UI
 */
export function renderSwaggerUI() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Ethernity DMS — Swagger API Docs</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui.css">
  <link rel="icon" type="image/svg+xml" href="/uploads/logo.svg">
  <style>
    html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin: 0; background: #fafafa; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Helvetica, Arial, sans-serif; }
    .topbar { display: none !important; }
    .swagger-ui .info .title { font-size: 28px; color: #F05A47; }
    .swagger-ui .btn.authorize { background-color: #F05A47; border-color: #F05A47; color: #fff; }
    .swagger-ui .btn.authorize svg { fill: #fff; }
    .swagger-ui .opblock.opblock-post { border-color: #F05A47; background: rgba(240, 90, 71, 0.05); }
    .swagger-ui .opblock.opblock-post .opblock-summary-method { background: #F05A47; }
    .swagger-ui .opblock.opblock-get .opblock-summary-method { background: #0284c7; }
    .swagger-ui .opblock.opblock-put .opblock-summary-method { background: #d97706; }
    .swagger-ui .opblock.opblock-delete .opblock-summary-method { background: #dc2626; }
    .custom-banner {
      background: linear-gradient(135deg, #2D1917 0%, #4A2824 100%);
      color: #fff;
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 2px 10px rgba(0,0,0,0.15);
    }
    .custom-banner h1 { margin: 0; font-size: 20px; font-weight: 700; display: flex; align-items: center; gap: 10px; }
    .custom-banner a { color: #FADED8; text-decoration: none; font-size: 13px; font-weight: 600; }
    .custom-banner a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="custom-banner">
    <h1>🛡️ Ethernity DMS API Documentation</h1>
    <div style="display: flex; gap: 16px;">
      <a href="/openapi.json" target="_blank">📄 OpenAPI Spec (JSON)</a>
      <a href="/redoc">📖 ReDoc UI</a>
      <a href="http://localhost:5173" target="_blank">🚀 Abrir Frontend Web</a>
    </div>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      window.ui = SwaggerUIBundle({
        url: "/openapi.json",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>`;
}

/**
 * Gera o template HTML do ReDoc UI
 */
export function renderRedocUI() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <title>Ethernity DMS — ReDoc API Documentation</title>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Inter:300,400,700" rel="stylesheet">
  <style>
    body { margin: 0; padding: 0; }
  </style>
</head>
<body>
  <redoc spec-url='/openapi.json'></redoc>
  <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
</body>
</html>`;
}

const router = Router();

// Endpoint OpenAPI JSON
router.get('/openapi.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  return res.json(openApiSpec);
});

// Endpoint Swagger UI
router.get('/docs', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(renderSwaggerUI());
});

// Endpoint ReDoc
router.get('/redoc', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(renderRedocUI());
});

export default router;
