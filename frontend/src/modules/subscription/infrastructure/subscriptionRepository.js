/**
 * subscriptionRepository.js
 * Camada de infraestrutura para requisições de planos de assinatura e checkout Mercado Pago.
 */
import httpClient from '../../../core/api/httpClient.js';

class SubscriptionRepository {
  /**
   * Obtém a lista de planos vigentes e métodos de pagamento suportados
   */
  async getPlans() {
    return httpClient.get('/subscriptions/plans');
  }

  /**
   * Obtém a assinatura atual e o uso de limites do usuário autenticado
   */
  async getCurrentSubscription(token) {
    return httpClient.get('/subscriptions/current', token);
  }

  /**
   * Cria uma transação no Mercado Pago (PIX ou Checkout Pro)
   */
  async createCheckoutPreference(planId, cycle = 'monthly', paymentType = 'pix', token = null) {
    return httpClient.post(
      '/subscriptions/create-preference',
      {
        planId,
        cycle,
        paymentType,
        backUrls: {
          success: `${window.location.origin}/?payment_status=success`,
          pending: `${window.location.origin}/?payment_status=pending`,
          failure: `${window.location.origin}/?payment_status=failure`,
        },
      },
      token
    );
  }

  /**
   * Processa pagamento com cartão de crédito via Mercado Pago Checkout Transparente
   */
  async payWithCreditCard(planId, cycle = 'monthly', cardData = {}, token = null) {
    return httpClient.post(
      '/subscriptions/pay-card',
      { planId, cycle, cardData },
      token
    );
  }

  /**
   * Simula a aprovação imediata do pagamento em ambiente de testes
   */
  async simulatePayment(planId, cycle = 'monthly', paymentId = null, token = null) {
    return httpClient.post(
      '/subscriptions/simulate-payment',
      { planId, cycle, paymentId },
      token
    );
  }
}

export const subscriptionRepository = new SubscriptionRepository();
export default subscriptionRepository;
