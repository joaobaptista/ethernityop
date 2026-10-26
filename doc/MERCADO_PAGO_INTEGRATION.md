# 💳 Guia Completo de Integração de Pagamentos com Mercado Pago

Este documento é o guia oficial de arquitetura, configuração e integração de pagamentos e assinaturas SaaS do **Ethernity DMS** com o gateway **Mercado Pago**, suportando **PIX Instantâneo**, **Cartão de Crédito**, **Cartão de Débito** e **Checkout Pro**.

---

## 🎯 1. Modelos de Assinatura & Limites (SaaS)

O sistema comercializa planos mensais e anuais (com desconto de 2 meses) com controle estrito de limites de dispositivos e histórico de saúde:

| Recurso | Gratuito / Essencial | Cuidado Familiar (Popular) | Clínico & Especialistas |
| :--- | :--- | :--- | :--- |
| **Preço Mensal** | R$ 0,00 | **R$ 29,90 / mês** | **R$ 79,90 / mês** |
| **Preço Anual** | R$ 0,00 | **R$ 299,00 / ano** *(2 meses off)* | **R$ 799,00 / ano** *(2 meses off)* |
| **Dispositivos Conectados** | 1 Relógio / Clip | **Até 3 Relógios** | **Até 10 Pacientes** |
| **Cercas Virtuais (Geofences)** | 2 Áreas Seguras | **Ilimitadas** | **Ilimitadas** |
| **Histórico de Saúde & GPS** | 24 Horas | **30 Dias** | **365 Dias (1 Ano)** |
| **Notificações Críticas** | PWA Básico | **Push Prioritário / SMS** | **SLA Médico 24/7** |
| **Prontuários & Relatórios** | Não | Resumo Mensal | **Exportação PDF & CSV** |
| **Monitoramento Indoor (BLE)** | Não | Não | **Planta Baixa Multi-cômodo** |

---

## 🔑 2. Variáveis de Ambiente e Credenciais

No arquivo `.env` do backend, configure as credenciais obtidas no [Painel de Desenvolvedores do Mercado Pago](https://www.mercadopago.com.br/developers/panel):

```env
# ==============================================================================
# MERCADO PAGO GATEWAY CONFIGURATION
# ==============================================================================
# Token de Acesso Privado (Production ou Sandbox Test)
MERCADO_PAGO_ACCESS_TOKEN=APP_USR-0000000000000000-000000-00000000000000000000000000000000-000000000

# Chave Pública para o Frontend (Tokenização de Cartões)
MERCADO_PAGO_PUBLIC_KEY=APP_USR-00000000-0000-0000-0000-000000000000

# Segredo do Webhook (Assinatura HMAC para validar notificações legítimas)
MERCADO_PAGO_WEBHOOK_SECRET=0000000000000000000000000000000000000000000000000000000000000000

# URLs de Retorno do Checkout
MERCADO_PAGO_SUCCESS_URL=https://app.ethernity.com/?status=success
MERCADO_PAGO_FAILURE_URL=https://app.ethernity.com/?status=failure
MERCADO_PAGO_PENDING_URL=https://app.ethernity.com/?status=pending
```

> [!NOTE]
> Em ambiente de desenvolvimento local, se as variáveis de ambiente não estiverem preenchidas, a aplicação utiliza automaticamente o modo **Mock / Sandbox Seguro**, permitindo testar toda a interface, geração de QR Code PIX e aprovação instantânea sem custos.

---

## ⚡ 3. Métodos de Pagamento Suportados

### 3.1. PIX Instantâneo (QR Code & Copia-e-Cola)
- **Endpoint do Backend:** `POST /subscriptions/create-preference` com `{ "paymentType": "pix", "planId": "family", "cycle": "monthly" }`
- **Chamada Mercado Pago API:** `POST https://api.mercadopago.com/v1/payments`
- **Payload Enviado ao Mercado Pago:**
```json
{
  "transaction_amount": 29.90,
  "description": "Ethernity DMS — Plano Cuidado Familiar (Mensal)",
  "payment_method_id": "pix",
  "payer": {
    "email": "cuidador@email.com",
    "first_name": "Vagner",
    "last_name": "Ibas",
    "identification": {
      "type": "CPF",
      "number": "12345678909"
    }
  },
  "notification_url": "https://api.ethernity.com/subscriptions/webhook",
  "external_reference": "{\"userId\": 10, \"planId\": \"family\", \"cycle\": \"monthly\"}"
}
```
- **Retorno ao Frontend:**
  - `qr_code`: Código EMV Copia-e-Cola para aplicativos de bancos.
  - `qr_code_base64`: Imagem do QR Code para exibição na tela.
  - `date_of_expiration`: Timestamp de expiração (padrão: 30 minutos).

---

### 3.2. Cartão de Crédito e Débito (Checkout Transparente)
- **Endpoint do Backend:** `POST /subscriptions/pay-card`
- **Payload do Frontend:**
```json
{
  "planId": "family",
  "cycle": "monthly",
  "cardData": {
    "cardNumber": "4532117088991234",
    "holderName": "VAGNER IBAS",
    "expiry": "12/28",
    "cvv": "123",
    "cpf": "12345678909",
    "brand": "Visa",
    "cardType": "credit", // ou "debit"
    "installments": 1
  }
}
```

#### Tokenização no Frontend (Produção via SDK MercadoPago.js v2):
```javascript
// Exemplo de tokenização oficial recomendada pelo Mercado Pago:
const mp = new window.MercadoPago(process.env.MERCADO_PAGO_PUBLIC_KEY);

const cardToken = await mp.createCardToken({
  cardNumber: cleanNumber,
  cardholderName: holderName,
  cardExpirationMonth: expiryMonth,
  cardExpirationYear: expiryYear,
  securityCode: cvv,
  identificationType: "CPF",
  identificationNumber: cpfClean,
});

// Envia apenas o cardToken.id ao seu backend para máxima conformidade PCI-DSS:
await httpClient.post('/subscriptions/pay-card', {
  planId,
  cycle,
  token: cardToken.id,
  installments,
  paymentMethodId: brand.toLowerCase(),
}, userJwt);
```

---

### 3.3. Checkout Pro (Redirecionamento Seguro)
- **Endpoint do Backend:** `POST /subscriptions/create-preference` com `{ "paymentType": "checkout_pro" }`
- **Chamada Mercado Pago:** `POST https://api.mercadopago.com/checkout/preferences`
- **Resposta:** Retorna `init_point` (para produção) e `sandbox_init_point` (para testes) que abre a janela oficial de pagamento com todas as opções (Boleto, Mercado Pago Wallet, PIX, Cartão).

---

## 🔔 4. Webhooks e Atualização em Tempo Real (IPN)

O endpoint [`POST /subscriptions/webhook`](file:///Users/vagneribas/Documents/GitHub/ethernity/backend/src/routes/subscriptions.js) recebe eventos automáticos do Mercado Pago sempre que o status de uma transação muda.

### Validação Criptográfica (`x-signature`):
```javascript
import crypto from 'node:crypto';

export function verifyMercadoPagoSignature(req, secret) {
  const xSignature = req.headers['x-signature'];
  const xRequestId = req.headers['x-request-id'];
  if (!xSignature || !xRequestId) return false;

  const parts = Object.fromEntries(xSignature.split(',').map((item) => item.split('=')));
  const ts = parts.ts;
  const v1 = parts.v1;

  const manifest = `id:${req.query['data.id'] || req.body?.data?.id};request-id:${xRequestId};ts:${ts};`;
  const hmac = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  return hmac === v1;
}
```

### Ciclo de Vida de Aprovação:
1. Usuário paga o PIX ou passa o cartão.
2. Mercado Pago envia `POST /subscriptions/webhook` com `{ "type": "payment", "data": { "id": "123456789" } }`.
3. Backend consulta `GET https://api.mercadopago.com/v1/payments/123456789` usando o `MERCADO_PAGO_ACCESS_TOKEN`.
4. Se `status === 'approved'`:
   - Extrai `userId`, `planId` e `cycle` do campo `external_reference`.
   - Atualiza `user.subscription` no banco de dados com a nova data de expiração (`expiresAt`).
   - Emite evento WebSocket (`socket.emit('subscription_updated', user.subscription)`), atualizando a tela do usuário instantaneamente sem recarregar a página!

---

## 🧪 5. Cartões de Teste Oficiais para Homologação

Ao testar no ambiente de testes (Sandbox):

| Bandeira | Número de Cartão de Teste | Validade | CVV | Resultado Esperado |
| :--- | :--- | :--- | :--- | :--- |
| **Mastercard** | `5031 7557 3453 0001` | `11/28` | `123` | ✅ **Aprovado (Approved)** |
| **Visa** | `4012 0010 3714 1112` | `10/27` | `123` | ✅ **Aprovado (Approved)** |
| **Elo** | `6363 6810 0000 0008` | `12/29` | `123` | ✅ **Aprovado (Approved)** |
| **Recusa (Sem Limite)**| `4012 0010 3714 1120` | `10/27` | `123` | ❌ **Recusado (Insufficient funds)** |
| **Recusa (CVV Incorreto)**| `4012 0010 3714 1138` | `10/27` | `999` | ❌ **Recusado (Bad CVV)** |

---

## 📁 6. Arquivos e Código no Projeto

- 🖥️ **Frontend:**
  - Modal de Escolha de Planos: [`SubscriptionPlansModal.jsx`](file:///Users/vagneribas/Documents/GitHub/ethernity/frontend/src/modules/subscription/presentation/SubscriptionPlansModal.jsx)
  - Modal de Pagamento & Checkout: [`MercadoPagoCheckoutModal.jsx`](file:///Users/vagneribas/Documents/GitHub/ethernity/frontend/src/modules/subscription/presentation/MercadoPagoCheckoutModal.jsx)
  - Repositório HTTP de Assinaturas: [`subscriptionRepository.js`](file:///Users/vagneribas/Documents/GitHub/ethernity/frontend/src/modules/subscription/infrastructure/subscriptionRepository.js)
  - Regras de Limites e Domínio: [`subscriptionModel.js`](file:///Users/vagneribas/Documents/GitHub/ethernity/frontend/src/modules/subscription/domain/subscriptionModel.js)

- ⚙️ **Backend:**
  - Rotas de Assinatura: [`subscriptions.js`](file:///Users/vagneribas/Documents/GitHub/ethernity/backend/src/routes/subscriptions.js)
  - Serviço Mercado Pago: [`mercadoPagoService.js`](file:///Users/vagneribas/Documents/GitHub/ethernity/backend/src/services/mercadoPagoService.js)
