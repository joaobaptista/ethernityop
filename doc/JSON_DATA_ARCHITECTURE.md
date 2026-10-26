# 📡 Arquitetura de Dados e Contratos JSON (Frontend & Backend)

Este documento descreve detalhadamente como o frontend consome, valida e trafega dados no formato **JSON (JavaScript Object Notation)** com o backend, cobrindo tanto as APIs REST quanto os canais de telemetria em tempo real (WebSockets / MQTT).

---

## 🏗️ 1. Visão Geral da Arquitetura

O sistema adota os princípios de **Clean Architecture** e **Domain-Driven Design (DDD)** no frontend, garantindo que o código da interface visual (React) seja completamente desacoplado dos detalhes de rede e transporte de dados.

```
┌────────────────────────────────────────────────────────┐
│             BACKEND (FastAPI / Node.js Mock)           │
│       Endpoints REST (HTTP) e WebSockets (Real-Time)   │
└──────────────────────────┬─────────────────────────────┘
                           │ JSON Payload
                           ▼
┌────────────────────────────────────────────────────────┐
│ 1. CAMADA DE INFRAESTRUTURA (Core API Client)         │
│    • httpClient.js (Fetch API + Bearer JWT + Headers)  │
│    • socketClient.js (WebSocket / Event Emitter)       │
└──────────────────────────┬─────────────────────────────┘
                           │ Objeto JavaScript bruto
                           ▼
┌────────────────────────────────────────────────────────┐
│ 2. REPOSITÓRIOS POR MÓDULO (Data Access Layer)         │
│    • trackingRepository.js                             │
│    • profileRepository.js                              │
│    • subscriptionRepository.js                         │
│    • chatRepository.js                                 │
└──────────────────────────┬─────────────────────────────┘
                           │ Dados estruturados
                           ▼
┌────────────────────────────────────────────────────────┐
│ 3. MODELOS DE DOMÍNIO & VALIDAÇÃO (Domain Layer)       │
│    • trackerModel.js                                   │
│    • profileModel.js                                   │
│    • subscriptionModel.js                              │
│    • chatModel.js                                      │
└──────────────────────────┬─────────────────────────────┘
                           │ Entidades tipadas & funções puras
                           ▼
┌────────────────────────────────────────────────────────┐
│ 4. APRESENTAÇÃO & INTERFACE (Presentation Layer)       │
│    • Componentes React (Views, Cards, Modais)          │
│    • Hooks de Estado (useState, useEffect, useI18n)    │
└────────────────────────────────────────────────────────┘
```

---

## ⚙️ 2. Camada de Transporte e Cliente HTTP Base

Todas as requisições HTTP REST do aplicativo passam centralizadamente pelo [`httpClient.js`](file:///Users/vagneribas/Documents/GitHub/ethernity/frontend/src/core/api/httpClient.js):

### Funções Principais:
- **Injeção de Cabeçalhos:** Configura `Content-Type: application/json` e `Authorization: Bearer <token>` automaticamente quando o usuário está autenticado.
- **Parsing Automático de JSON:** Identifica se a resposta do servidor é do tipo `application/json` e executa `response.json()`.
- **Tratamento Padronizado de Erros:** Captura erros HTTP (status 400, 401, 403, 404, 500) e extrai o campo `detail` ou `message` do JSON para exibição ao usuário.

```javascript
// Exemplo de chamada simplificada em um Repository
import httpClient from '../../../core/api/httpClient.js';

export const trackingRepository = {
  async getDevices(token) {
    return httpClient.get('/devices/', token);
  },
  async createDevice(token, payload) {
    return httpClient.post('/devices/', payload, token);
  },
};
```

---

## 📋 3. Catálogo de Contratos JSON (Schemas por Módulo)

Abaixo estão os esquemas JSON oficiais utilizados em cada recurso do sistema:

---

### 📍 3.1. Rastreadores e Dispositivos (`/devices/`)

#### Obter Lista de Dispositivos (`GET /devices/`)
```json
[
  {
    "id": 1,
    "device_id": "TRACKER-001",
    "name": "Relógio Vô João",
    "battery_level": 84,
    "latitude": -23.55052,
    "longitude": -46.633308,
    "heart_rate": 72,
    "spo2": 98,
    "fall_detected": false,
    "status": "online",
    "last_seen": "2026-09-06T17:30:00Z"
  }
]
```

#### Cadastrar / Parear Dispositivo (`POST /devices/`)
```json
// Request Body:
{
  "device_id": "TRACKER-002",
  "name": "Clip Dona Maria",
  "type": "clip"
}

// Response (201 Created):
{
  "id": 2,
  "device_id": "TRACKER-002",
  "name": "Clip Dona Maria",
  "battery_level": 100,
  "latitude": -23.55100,
  "longitude": -46.63400,
  "status": "online"
}
```

---

### 🛡️ 3.2. Cercas Virtuais e Áreas Seguras (`/areas/`)

#### Obter Áreas Monitoradas (`GET /areas/`)
```json
[
  {
    "id": 101,
    "device_id": 1,
    "name": "Casa & Jardim",
    "center_lat": -23.55052,
    "center_lng": -46.633308,
    "radius_meters": 150,
    "is_active": true,
    "alert_on_exit": true,
    "alert_on_entry": false
  }
]
```

---

### 🔔 3.3. Notificações e Alertas de Telemetria (`/messages/`)

#### Obter Notificações e Avisos (`GET /messages/`)
```json
[
  {
    "id": "notif-1",
    "device_id": 1,
    "type": "sos",
    "title": "Protocolo de Telemetria Ativo",
    "desc": "Relógio do Vô João conectado com sinal GPS de alta precisão.",
    "time": "2026-09-06T17:28:00Z",
    "active": true,
    "unread": true,
    "tab": "map"
  },
  {
    "id": "notif-2",
    "device_id": 1,
    "type": "geofence",
    "title": "Cerca Virtual Segura",
    "desc": "Paciente permaneceu dentro da área 'Casa & Jardim'.",
    "time": "2026-09-06T17:15:00Z",
    "active": false,
    "unread": false,
    "tab": "map"
  }
]
```

---

### 👤 3.4. Perfil do Usuário e Protocolo Médico (`/profile/`)

#### Obter Dados do Perfil (`GET /profile/`)
```json
{
  "id": 10,
  "name": "Dr. Vagner Ibas",
  "email": "vagner@ethernity.com",
  "phone": "(11) 98765-4321",
  "photo_url": "/uploads/photo_user_10.png",
  "doctor_contact": "Dr. Carlos Mendonça • Tel: (11) 98765-4321",
  "hospital_reference": "Instituto do Coração (InCor) • Pronto-Socorro 24h",
  "patient_diagnosis": "Paciente cianótico crônico (Síndrome de Eisenmenger). Em caso de síncope, manter deitado e acionar o socorro.",
  "created_at": "2026-01-15T10:00:00Z"
}
```

#### Atualizar Perfil (`PUT /profile/`)
```json
// Request Body:
{
  "name": "Dr. Vagner Ibas",
  "phone": "(11) 99999-8888",
  "doctor_contact": "Dr. Roberto Silva • Tel: (11) 91234-5678"
}
```

---

### 💳 3.5. Assinaturas e Mercado Pago (`/subscriptions/`)

#### Obter Planos Disponíveis (`GET /subscriptions/plans`)
```json
[
  {
    "id": "family-care",
    "name": "Familiar Care",
    "price": 49.90,
    "currency": "BRL",
    "billingPeriod": "monthly",
    "maxDevices": 3,
    "features": [
      "Até 3 Rastreadores simultâneos",
      "Histórico de rotas de 90 dias",
      "Cercas virtuais ilimitadas",
      "Suporte prioritário via WhatsApp"
    ],
    "paymentMethods": ["pix", "credit_card"]
  }
]
```

#### Status da Assinatura do Usuário (`GET /subscriptions/current`)
```json
{
  "planId": "family-care",
  "planName": "Familiar Care",
  "status": "active",
  "maxDevices": 3,
  "expiresAt": "2026-10-06T00:00:00Z",
  "paymentMethod": "pix",
  "usage": {
    "currentDevices": 2,
    "availableSlots": 1
  }
}
```

#### Pagamento com Cartão de Crédito (`POST /subscriptions/pay-card`)
```json
// Request Body:
{
  "planId": "family-care",
  "cardNumber": "4532117088991234",
  "cardHolder": "Vagner Ibas",
  "expiry": "12/28",
  "cvv": "123",
  "installments": 1
}

// Response (200 OK):
{
  "success": true,
  "paymentId": "MP-CC-987654",
  "planId": "family-care",
  "status": "approved",
  "message": "Pagamento aprovado via Mercado Pago"
}
```

---

### ⚡ 3.6. Eventos em Tempo Real (WebSockets / MQTT)

Recebidos continuamente pelo canal de telemetria ([`socketClient.js`](file:///Users/vagneribas/Documents/GitHub/ethernity/frontend/src/core/api/socketClient.js)):

#### 1. Pulso Periódico de Localização e Saúde (`telemetry_pulse`)
```json
{
  "event": "telemetry_pulse",
  "device_id": "TRACKER-001",
  "latitude": -23.55052,
  "longitude": -46.633308,
  "accuracy_meters": 4.5,
  "battery": 84,
  "heart_rate": 72,
  "spo2": 98,
  "speed_kmh": 1.2,
  "timestamp": 1788726555000
}
```

#### 2. Alerta de Emergência SOS (`sos_alert`)
```json
{
  "event": "sos_alert",
  "device_id": "TRACKER-001",
  "alert_type": "fall_detected",
  "severity": "critical",
  "latitude": -23.55052,
  "longitude": -46.633308,
  "timestamp": 1788726560000
}
```

---

## 🧪 4. Validação e Testes de Integridade de Dados

Cada módulo do frontend possui uma suíte de testes unitários com Vitest que valida o processamento correto dos JSONs recebidos, cobrindo casos como:
- Respostas vazias ou valores `null` / `undefined`.
- Normalização de URLs relativas para absolutas.
- Cálculo de limites de dispositivos conforme o plano ativo.

```bash
# Executar todos os testes de contrato e integração
npm test
```

---

## 🚀 5. Como Adicionar um Novo Recurso JSON

Para adicionar um novo endpoint ou modelo no frontend:
1. **Defina a Entidade:** Crie `src/modules/<modulo>/domain/<recurso>Model.js` com as funções puras de validação e normalização.
2. **Crie o Repositório:** Crie `src/modules/<modulo>/infrastructure/<recurso>Repository.js` consumindo o `httpClient.js`.
3. **Crie os Testes:** Crie `src/modules/<modulo>/domain/<recurso>Model.test.js` para garantir 100% de cobertura.
4. **Integre na View:** Consuma o repository dentro do componente React correspondente.
