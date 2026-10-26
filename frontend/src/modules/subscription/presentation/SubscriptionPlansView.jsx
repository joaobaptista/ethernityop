import React, { useState } from 'react';
import { useI18n } from '../../../core/i18n/presentation/useI18n.js';
import { SUBSCRIPTION_PLANS, formatCurrency } from '../domain/subscriptionModel.js';
import MercadoPagoCheckoutModal from './MercadoPagoCheckoutModal.jsx';
import './SubscriptionPlansView.css';

const PLAN_FEATURES = {
  free: [
    '1 Relógio / Dispositivo Conectado',
    '2 Cercas Virtuais Seguras',
    'Histórico de Telemetria de 24h',
  ],
  family: [
    'Até 3 Relógios / Pacientes',
    'Cercas Virtuais Ilimitadas',
    'Histórico Completo de 30 Dias',
    'Notificações Push Prioritárias',
    'Multi-cuidadores na Mesma Conta',
    'Suporte Familiar Dedicado',
  ],
  clinical: [
    'Até 10 Relógios / Pacientes',
    'Planta Baixa & Monitoramento Indoor',
    'Exportação de Prontuários (PDF & CSV)',
    'Alertas Críticos com SLA Prioritário',
    'Visão Multi-paciente Integrada',
  ],
};

export default function SubscriptionPlansView({
  currentSubscription,
  token,
  onSubscriptionUpdated,
  showToast,
  onBack,
}) {
  const { t } = useI18n();
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [selectedPlanForCheckout, setSelectedPlanForCheckout] = useState(null);

  const currentPlanId = currentSubscription?.planId || 'free';
  const plans = Object.values(SUBSCRIPTION_PLANS).map((plan) => ({
    ...plan,
    features: PLAN_FEATURES[plan.id] || [],
  }));

  const handleSelectPlan = (plan) => {
    if (plan.id === currentPlanId) return;

    if (plan.id === 'free') {
      showToast?.('Para voltar ao plano gratuito, entre em contato com o suporte.');
      return;
    }

    setSelectedPlanForCheckout(plan);
  };

  const handlePaymentSuccess = (updatedSubscription) => {
    onSubscriptionUpdated?.(updatedSubscription);
    setSelectedPlanForCheckout(null);
  };

  return (
    <>
      <main className="subscription-page" aria-labelledby="subscription-page-title">
        <div className="subscription-page-inner">
          <button
            type="button"
            className="subscription-page-back"
            onClick={onBack}
          >
            <i className="fa-solid fa-arrow-left" aria-hidden="true" />
            <span>{t('common.back')}</span>
          </button>

          <header className="subscription-page-header">
            <div className="subscription-page-heading">
              <span className="subscription-page-eyebrow">
                <i className="fa-solid fa-crown" aria-hidden="true" />
                {t('subscription.menuItem')}
              </span>
              <h1 id="subscription-page-title">{t('subscription.modalTitle')}</h1>
              <p>{t('subscription.modalSubtitle')}</p>
            </div>

            <div className="subscription-page-cycle" aria-label="Ciclo de cobrança">
              <button
                type="button"
                className={billingCycle === 'monthly' ? 'is-active' : ''}
                onClick={() => setBillingCycle('monthly')}
                aria-pressed={billingCycle === 'monthly'}
              >
                {t('subscription.monthly')}
              </button>
              <button
                type="button"
                className={billingCycle === 'yearly' ? 'is-active' : ''}
                onClick={() => setBillingCycle('yearly')}
                aria-pressed={billingCycle === 'yearly'}
              >
                <span>{t('subscription.yearly')}</span>
                <span className="subscription-page-discount">{t('subscription.yearlyDiscount')}</span>
              </button>
            </div>
          </header>

          <section className="subscription-page-grid" aria-label="Planos disponíveis">
            {plans.map((plan) => {
              const isCurrent = plan.id === currentPlanId;
              const price = billingCycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;
              const monthlyEquivalent = billingCycle === 'yearly' && plan.priceYearly
                ? Math.round(plan.priceYearly / 12)
                : null;

              return (
                <article
                  key={plan.id}
                  className={`subscription-page-card ${plan.popular ? 'is-popular' : ''} ${isCurrent ? 'is-current' : ''}`}
                >
                  {plan.popular && (
                    <span className="subscription-page-popular">
                      <i className="fa-solid fa-star" aria-hidden="true" />
                      {t('subscription.popularBadge')}
                    </span>
                  )}

                  <div className="subscription-page-card-heading">
                    <h2>{plan.name}</h2>
                    <div className="subscription-page-price">
                      <span>{price === 0 ? 'Grátis' : formatCurrency(price)}</span>
                      {price > 0 && (
                        <small>
                          {billingCycle === 'yearly'
                            ? t('subscription.perYear')
                            : t('subscription.perMonth')}
                        </small>
                      )}
                    </div>
                    {monthlyEquivalent && (
                      <p className="subscription-page-equivalent">
                        Equivale a {formatCurrency(monthlyEquivalent)}/mês
                      </p>
                    )}
                  </div>

                  <ul className="subscription-page-features">
                    {plan.features.map((feature) => (
                      <li key={feature}>
                        <i className="fa-solid fa-circle-check" aria-hidden="true" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="subscription-page-card-action">
                    {isCurrent ? (
                      <span className="subscription-page-current">
                        <i className="fa-solid fa-check" aria-hidden="true" />
                        {t('subscription.currentPlan')}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={plan.popular ? 'is-primary' : ''}
                        onClick={() => handleSelectPlan(plan)}
                      >
                        <i className="fa-brands fa-pix" aria-hidden="true" />
                        {t('subscription.choosePlan')}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </section>

          <footer className="subscription-page-security">
            <i className="fa-solid fa-lock" aria-hidden="true" />
            <span>
              Pagamento processado com segurança via <strong>Mercado Pago</strong> (PIX &amp; Cartão de Crédito)
            </span>
          </footer>
        </div>
      </main>

      {selectedPlanForCheckout && (
        <MercadoPagoCheckoutModal
          plan={selectedPlanForCheckout}
          cycle={billingCycle}
          token={token}
          onClose={() => setSelectedPlanForCheckout(null)}
          onPaymentSuccess={handlePaymentSuccess}
          showToast={showToast}
        />
      )}
    </>
  );
}
