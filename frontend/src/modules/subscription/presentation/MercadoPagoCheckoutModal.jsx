import React, { useState, useEffect, useMemo } from 'react';
import { useI18n } from '../../../core/i18n/presentation/useI18n.js';
import subscriptionRepository from '../infrastructure/subscriptionRepository.js';
import { formatCurrency } from '../domain/subscriptionModel.js';
import './MercadoPagoCheckoutModal.css';

/**
 * Detecta a bandeira do cartão baseando-se nos primeiros dígitos
 */
function detectCardBrand(number) {
  const clean = number.replace(/\D/g, '');
  if (!clean) return { name: 'Card', icon: 'fa-solid fa-credit-card' };
  if (/^4/.test(clean)) return { name: 'Visa', icon: 'fa-brands fa-cc-visa' };
  if (/^(5[1-5]|2[2-7])/.test(clean)) return { name: 'Mastercard', icon: 'fa-brands fa-cc-mastercard' };
  if (/^(34|37)/.test(clean)) return { name: 'Amex', icon: 'fa-brands fa-cc-amex' };
  if (/^(4011|4389|5041|6362|6363)/.test(clean)) return { name: 'Elo', icon: 'fa-solid fa-credit-card' };
  if (/^(6062|3841)/.test(clean)) return { name: 'Hipercard', icon: 'fa-solid fa-credit-card' };
  return { name: 'Card', icon: 'fa-solid fa-credit-card' };
}

export default function MercadoPagoCheckoutModal({
  plan,
  cycle = 'monthly',
  token,
  onClose,
  onPaymentSuccess,
  showToast,
}) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('card'); // Padrão com foco no Cartão
  const [loading, setLoading] = useState(true);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [processingSimulation, setProcessingSimulation] = useState(false);
  const [pixData, setPixData] = useState(null);
  const [preferenceData, setPreferenceData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(1800); // 30 min

  // Formulário de Cartão (Crédito / Débito)
  const [cardType, setCardType] = useState('credit'); // 'credit' | 'debit'
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardCpf, setCardCpf] = useState('');
  const [installments, setInstallments] = useState('1');
  const [formError, setFormError] = useState('');

  const amount = cycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;
  const brand = useMemo(() => detectCardBrand(cardNumber), [cardNumber]);

  // Parcelamento calculado em até 12x
  const installmentOptions = useMemo(() => {
    const maxInstallments = cycle === 'yearly' ? 12 : (amount > 50 ? 3 : 1);
    const options = [];
    for (let i = 1; i <= maxInstallments; i++) {
      const installmentValue = amount / i;
      options.push({
        count: i,
        amount: installmentValue,
        label: i === 1 
          ? t('subscription.installmentsSingle', { amount: formatCurrency(amount) })
          : t('subscription.installmentsMultiple', { count: i, amount: formatCurrency(installmentValue) }),
      });
    }
    return options;
  }, [amount, cycle, t]);

  // Carrega transações do Mercado Pago
  useEffect(() => {
    let isMounted = true;
    async function initCheckout() {
      try {
        setLoading(true);
        const [pixRes, prefRes] = await Promise.all([
          subscriptionRepository.createCheckoutPreference(plan.id, cycle, 'pix', token).catch(() => null),
          subscriptionRepository.createCheckoutPreference(plan.id, cycle, 'checkout_pro', token).catch(() => null),
        ]);
        
        if (isMounted) {
          setPixData(pixRes?.payment);
          setPreferenceData(prefRes?.preference);
        }
      } catch (err) {
        console.error('Erro ao inicializar checkout Mercado Pago:', err);
        if (showToast) showToast('Erro ao inicializar checkout.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    initCheckout();
    return () => { isMounted = false; };
  }, [plan.id, cycle, token, showToast]);

  // Timer do PIX
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCopyPix = () => {
    const qrCode = pixData?.point_of_interaction?.transaction_data?.qr_code;
    if (!qrCode) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(qrCode);
      setCopied(true);
      if (showToast) showToast(t('subscription.pixCopied'));
      setTimeout(() => setCopied(false), 3000);
    }
  };

  // Formatadores de Inputs do Cartão
  const handleCardNumberChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 16);
    const formatted = val.replace(/(\d{4})(?=\d)/g, '$1 ');
    setCardNumber(formatted);
    if (formError) setFormError('');
  };

  const handleExpiryChange = (e) => {
    let val = e.target.value.replace(/\D/g, '').slice(0, 4);
    if (val.length >= 2) {
      val = `${val.slice(0, 2)}/${val.slice(2)}`;
    }
    setCardExpiry(val);
    if (formError) setFormError('');
  };

  const handleCvvChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 4);
    setCardCvv(val);
    if (formError) setFormError('');
  };

  const handleCpfChange = (e) => {
    let val = e.target.value.replace(/\D/g, '').slice(0, 11);
    if (val.length > 9) {
      val = `${val.slice(0, 3)}.${val.slice(3, 6)}.${val.slice(6, 9)}-${val.slice(9)}`;
    } else if (val.length > 6) {
      val = `${val.slice(0, 3)}.${val.slice(3, 6)}.${val.slice(6)}`;
    } else if (val.length > 3) {
      val = `${val.slice(0, 3)}.${val.slice(3)}`;
    }
    setCardCpf(val);
    if (formError) setFormError('');
  };

  // Submissão do Cartão de Crédito
  const handlePayWithCard = async (e) => {
    e.preventDefault();
    setFormError('');

    const cleanNumber = cardNumber.replace(/\D/g, '');
    if (!cleanNumber || cleanNumber.length < 13) {
      setFormError(t('subscription.cardErrorInvalidNumber'));
      return;
    }
    if (!cardHolder.trim() || cardHolder.trim().length < 3) {
      setFormError(t('subscription.cardErrorFillAll'));
      return;
    }
    if (!cardExpiry || cardExpiry.length < 5) {
      setFormError(t('subscription.cardErrorInvalidExpiry'));
      return;
    }
    if (!cardCvv || cardCvv.length < 3) {
      setFormError(t('subscription.cardErrorInvalidCvv'));
      return;
    }

    try {
      setProcessingPayment(true);
      const res = await subscriptionRepository.payWithCreditCard(
        plan.id,
        cycle,
        {
          cardNumber: cleanNumber,
          holderName: cardHolder.trim().toUpperCase(),
          expiry: cardExpiry,
          cvv: cardCvv,
          cpf: cardCpf.replace(/\D/g, ''),
          brand: brand.name,
          cardType,
          installments: cardType === 'debit' ? 1 : Number(installments),
        },
        token
      );

      if (showToast) showToast(t('subscription.paymentSuccess'));
      if (onPaymentSuccess) {
        onPaymentSuccess(res.subscription);
      }
      onClose();
    } catch (err) {
      console.error('Erro ao processar cartão:', err);
      setFormError(err.message || 'Falha na autorização do cartão pelo Mercado Pago.');
    } finally {
      setProcessingPayment(false);
    }
  };

  // Simulação de aprovação para ambiente de testes
  const handleSimulateApproval = async () => {
    try {
      setProcessingSimulation(true);
      const res = await subscriptionRepository.simulatePayment(
        plan.id,
        cycle,
        pixData?.id || preferenceData?.id,
        token
      );
      if (showToast) showToast(t('subscription.paymentSuccess'));
      if (onPaymentSuccess) {
        onPaymentSuccess(res.subscription);
      }
      onClose();
    } catch (err) {
      console.error('Erro na simulação:', err);
      if (showToast) showToast(err.message || 'Falha ao confirmar pagamento.');
    } finally {
      setProcessingSimulation(false);
    }
  };

  return (
    <div className="mp-checkout-overlay" onClick={onClose}>
      <div className="mp-checkout-modal" onClick={(e) => e.stopPropagation()}>
        {/* Cabeçalho do Modal */}
        <div className="mp-checkout-header">
          <div className="mp-header-brand">
            <div className="mp-badge-icon">
              <i className="fa-solid fa-shield-check"></i>
            </div>
            <div>
              <h3>Mercado Pago &bull; Checkout Seguro</h3>
              <p>Plano {plan.name} ({cycle === 'yearly' ? t('subscription.yearly') : t('subscription.monthly')})</p>
            </div>
          </div>
          <button type="button" className="btn-close-mp" onClick={onClose} title={t('common.close')}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Resumo do Valor */}
        <div className="mp-amount-summary">
          <span className="mp-summary-label">Total a Pagar:</span>
          <span className="mp-summary-value">{formatCurrency(amount)}</span>
        </div>

        {/* Abas de Método de Pagamento */}
        <div className="mp-method-tabs">
          <button
            type="button"
            className={`mp-tab-btn ${activeTab === 'card' ? 'active' : ''}`}
            onClick={() => setActiveTab('card')}
          >
            <i className="fa-solid fa-credit-card"></i>
            <span>{t('subscription.cardTab')}</span>
          </button>
          <button
            type="button"
            className={`mp-tab-btn ${activeTab === 'pix' ? 'active' : ''}`}
            onClick={() => setActiveTab('pix')}
          >
            <i className="fa-brands fa-pix"></i>
            <span>{t('subscription.pixTitle')}</span>
          </button>
        </div>

        {/* Conteúdo do Método Selecionado */}
        {loading ? (
          <div className="mp-loading-state">
            <i className="fa-solid fa-arrows-rotate fa-spin"></i>
            <p>{t('subscription.processingPayment')}</p>
          </div>
        ) : !pixData && !preferenceData ? (
          // Backend recusou criar o pagamento (ex.: pagamentos online ainda não liberados em produção)
          <div className="mp-loading-state">
            <i className="fa-solid fa-circle-info"></i>
            <p>Pagamentos online ainda não estão disponíveis. Tente novamente em breve.</p>
          </div>
        ) : (
          <div className="mp-method-content">
            {activeTab === 'card' ? (
              <form className="mp-card-form" onSubmit={handlePayWithCard}>
                {formError && (
                  <div className="mp-form-alert error">
                    <i className="fa-solid fa-triangle-exclamation"></i>
                    <span>{formError}</span>
                  </div>
                )}

                {/* Seleção de Função: Cartão de Crédito ou Débito */}
                <div className="mp-card-type-selector">
                  <button
                    type="button"
                    className={`mp-card-type-pill ${cardType === 'credit' ? 'active' : ''}`}
                    onClick={() => setCardType('credit')}
                  >
                    <i className="fa-solid fa-credit-card"></i>
                    <span>Cartão de Crédito</span>
                  </button>
                  <button
                    type="button"
                    className={`mp-card-type-pill ${cardType === 'debit' ? 'active' : ''}`}
                    onClick={() => {
                      setCardType('debit');
                      setInstallments('1');
                    }}
                  >
                    <i className="fa-solid fa-money-check-dollar"></i>
                    <span>Cartão de Débito</span>
                  </button>
                </div>

                {/* Número do Cartão com Ícone Dinâmico de Bandeira */}
                <div className="mp-input-group">
                  <label htmlFor="mp-card-number">{t('subscription.cardNumber')}</label>
                  <div className="mp-input-wrapper">
                    <input
                      id="mp-card-number"
                      type="text"
                      inputMode="numeric"
                      placeholder={t('subscription.cardNumberPlaceholder')}
                      value={cardNumber}
                      onChange={handleCardNumberChange}
                      required
                      autoComplete="cc-number"
                    />
                    <div className="mp-card-brand-tag" title={brand.name}>
                      <i className={brand.icon}></i>
                      <span className="brand-name">{brand.name !== 'Card' ? brand.name : ''}</span>
                    </div>
                  </div>
                </div>

                {/* Nome do Titular */}
                <div className="mp-input-group">
                  <label htmlFor="mp-card-holder">{t('subscription.cardHolder')}</label>
                  <input
                    id="mp-card-holder"
                    type="text"
                    placeholder={t('subscription.cardHolderPlaceholder')}
                    value={cardHolder}
                    onChange={(e) => {
                      setCardHolder(e.target.value.toUpperCase());
                      if (formError) setFormError('');
                    }}
                    required
                    autoComplete="cc-name"
                  />
                </div>

                {/* Linha Dupla: Validade, CVV e CPF */}
                <div className="mp-form-grid-3">
                  <div className="mp-input-group">
                    <label htmlFor="mp-card-expiry">{t('subscription.cardExpiry')}</label>
                    <input
                      id="mp-card-expiry"
                      type="text"
                      inputMode="numeric"
                      placeholder={t('subscription.cardExpiryPlaceholder')}
                      value={cardExpiry}
                      onChange={handleExpiryChange}
                      required
                      autoComplete="cc-exp"
                    />
                  </div>

                  <div className="mp-input-group">
                    <label htmlFor="mp-card-cvv">{t('subscription.cardCvv')}</label>
                    <input
                      id="mp-card-cvv"
                      type="password"
                      inputMode="numeric"
                      placeholder={t('subscription.cardCvvPlaceholder')}
                      value={cardCvv}
                      onChange={handleCvvChange}
                      required
                      autoComplete="cc-csc"
                    />
                  </div>

                  <div className="mp-input-group">
                    <label htmlFor="mp-card-cpf">{t('subscription.cardCpf')}</label>
                    <input
                      id="mp-card-cpf"
                      type="text"
                      inputMode="numeric"
                      placeholder={t('subscription.cardCpfPlaceholder')}
                      value={cardCpf}
                      onChange={handleCpfChange}
                    />
                  </div>
                </div>

                {/* Parcelas (Apenas para Crédito) ou Nota de Débito */}
                {cardType === 'credit' ? (
                  <div className="mp-input-group">
                    <label htmlFor="mp-card-installments">{t('subscription.installments')}</label>
                    <select
                      id="mp-card-installments"
                      value={installments}
                      onChange={(e) => setInstallments(e.target.value)}
                      className="mp-select"
                    >
                      {installmentOptions.map((opt) => (
                        <option key={opt.count} value={opt.count}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="mp-debit-notice">
                    <i className="fa-solid fa-circle-check" style={{ color: 'var(--color-success)' }}></i>
                    <span>Débito à vista com aprovação instantânea Mercado Pago.</span>
                  </div>
                )}

                {/* Selo de Segurança */}
                <div className="mp-security-badge">
                  <i className="fa-solid fa-lock"></i>
                  <span>{t('subscription.cardSecurityNotice')}</span>
                </div>

                {/* Botão de Pagamento com Cartão */}
                <button
                  type="submit"
                  className="btn-pay-card"
                  disabled={processingPayment}
                >
                  <i className={`fa-solid ${processingPayment ? 'fa-arrows-rotate fa-spin' : 'fa-credit-card'}`}></i>
                  <span>
                    {processingPayment
                      ? t('subscription.processingPayment')
                      : t('subscription.payCardButton', { amount: formatCurrency(amount) })}
                  </span>
                </button>

                {/* Link Opcional para Checkout Pro Externo */}
                {preferenceData?.init_point && (
                  <div className="mp-external-option">
                    <a
                      href={preferenceData.init_point}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mp-external-link"
                    >
                      <i className="fa-solid fa-arrow-up-right-from-square"></i>
                      <span>{t('subscription.orPayExternal')}</span>
                    </a>
                  </div>
                )}
              </form>
            ) : (
              <div className="mp-pix-container">
                <p className="mp-pix-instruction">{t('subscription.pixDesc')}</p>

                {/* QR Code Simulado / Renderizado */}
                <div className="mp-qr-box">
                  <svg
                    className="mp-qr-svg"
                    viewBox="0 0 100 100"
                    width="140"
                    height="140"
                    fill="currentColor"
                  >
                    <rect width="100" height="100" fill="var(--bg-surface-subtle)" rx="6" />
                    <rect x="10" y="10" width="26" height="26" fill="var(--color-primary)" rx="4" />
                    <rect x="16" y="16" width="14" height="14" fill="var(--bg-surface)" rx="2" />
                    <rect x="64" y="10" width="26" height="26" fill="var(--color-primary)" rx="4" />
                    <rect x="70" y="16" width="14" height="14" fill="var(--bg-surface)" rx="2" />
                    <rect x="10" y="64" width="26" height="26" fill="var(--color-primary)" rx="4" />
                    <rect x="16" y="70" width="14" height="14" fill="var(--bg-surface)" rx="2" />
                    <rect x="42" y="12" width="16" height="6" fill="var(--text-main)" rx="1" />
                    <rect x="42" y="24" width="8" height="12" fill="var(--text-main)" rx="1" />
                    <rect x="42" y="42" width="16" height="16" fill="var(--color-primary)" rx="3" />
                    <rect x="64" y="42" width="12" height="6" fill="var(--text-main)" rx="1" />
                    <rect x="12" y="42" width="22" height="8" fill="var(--text-main)" rx="1" />
                    <rect x="64" y="64" width="26" height="12" fill="var(--text-main)" rx="2" />
                    <rect x="42" y="64" width="14" height="26" fill="var(--text-main)" rx="2" />
                    <rect x="64" y="82" width="24" height="8" fill="var(--color-primary)" rx="2" />
                  </svg>
                  <div className="mp-qr-timer">
                    <i className="fa-solid fa-stopwatch"></i>
                    <span>{t('subscription.pixExpiresIn')} ({formatTimer(timeLeft)})</span>
                  </div>
                </div>

                {/* Código Copia-e-Cola */}
                <div className="mp-copia-cola-box">
                  <input
                    type="text"
                    readOnly
                    value={pixData?.point_of_interaction?.transaction_data?.qr_code || ''}
                    className="mp-copia-cola-input"
                  />
                  <button
                    type="button"
                    className={`btn-copy-pix ${copied ? 'copied' : ''}`}
                    onClick={handleCopyPix}
                  >
                    <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'}`}></i>
                    <span>{copied ? 'Copiado!' : t('subscription.copyPix')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Rodapé com Ação de Teste / Conclusão */}
        <div className="mp-checkout-footer">
          <button
            type="button"
            className="btn-simulate-mp"
            onClick={handleSimulateApproval}
            disabled={processingSimulation || loading}
          >
            <i className={`fa-solid ${processingSimulation ? 'fa-arrows-rotate fa-spin' : 'fa-circle-check'}`}></i>
            <span>{processingSimulation ? 'Validando...' : t('subscription.simulateApproval')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

