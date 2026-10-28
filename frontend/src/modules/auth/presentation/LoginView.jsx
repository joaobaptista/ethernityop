import React, { useState, useEffect, useRef } from 'react';
import authRepository from '../infrastructure/authRepository.js';
import { useI18n } from '../../../core/i18n/presentation/useI18n.js';
import logoIcon from '../../../assets/logo-icon.svg';
import logoText from '../../../assets/logo-text.svg';
import './LoginView.css';
import { APP_VERSION, APP_VERSION_LABEL } from '../../../core/appVersion.js';

export default function LoginView({ onLoginSuccess }) {
  const { t } = useI18n();
  const [theme] = useState(() => localStorage.getItem('ethernity_theme') || 'light');
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const processedTokenRef = useRef(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ethernity_theme', theme);
  }, [theme]);

  // Captura do callback do Google Social Login (Gmail)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const rawUser = params.get('user');
    const urlError = params.get('error');

    if (urlError) {
      setErrorMessage(decodeURIComponent(urlError));
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (token && !processedTokenRef.current) {
      processedTokenRef.current = true;
      try {
        if (rawUser) {
          localStorage.setItem('ethernity_user', decodeURIComponent(rawUser));
        }
      } catch {}
      window.history.replaceState({}, document.title, window.location.pathname);
      if (onLoginSuccess) {
        onLoginSuccess(token);
      }
    }
  }, [onLoginSuccess]);

  const switchMode = (next) => {
    setMode(next);
    setErrorMessage('');
    setSuccessMessage('');
  };

  const handleGoogleAuth = async () => {
    setErrorMessage('');
    setGoogleBusy(true);
    try {
      const data = await authRepository.getGoogleAuthUrl();
      if (!data?.url) {
        throw new Error('A API não retornou o endereço de conexão com o Google.');
      }
      window.location.assign(data.url);
    } catch (err) {
      setErrorMessage(err.message || 'Não foi possível iniciar o login com o Google.');
      setGoogleBusy(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      if (mode === 'register') {
        const newUser = await authRepository.register({ email, password, name, phone });
        setSuccessMessage(`Cadastro realizado com sucesso para ${newUser.name}! Faça login para continuar.`);
        switchMode('login');
      } else if (mode === 'forgot') {
        // Simulação de envio de e-mail de recuperação
        setSuccessMessage('Se esse e-mail estiver cadastrado, você receberá as instruções em instantes.');
        setEmail('');
      } else {
        const authData = await authRepository.login(email, password);
        if (onLoginSuccess) onLoginSuccess(authData.access_token);
      }
    } catch (err) {
      setErrorMessage(err.message || t('auth.errorLogin'));
    } finally {
      setLoading(false);
    }
  };

  const isLogin = mode === 'login';
  const isRegister = mode === 'register';
  const isForgot = mode === 'forgot';

  return (
    <div className="login-screen-wrapper">
      <main className="login-card-container">
        <section className="login-card">

          {/* Logo */}
          <div className="login-brand">
            <img src={logoIcon} alt="Ethernity ícone" className="login-brand-icon" />
            <img src={logoText} alt="Ethernity" className="login-brand-text" />
          </div>

          {/* Título dinâmico */}
          <div className="login-heading">
            <h1>
              {isLogin && 'Acesse seu Cofre'}
              {isRegister && 'Crie sua Conta'}
              {isForgot && 'Recuperar Senha'}
            </h1>
            <p>
              {isLogin && 'Entre com sua conta Google ou use seu e-mail e senha.'}
              {isRegister && 'Preencha seus dados ou conecte via Google com 1 clique.'}
              {isForgot && 'Informe seu e-mail e enviaremos as instruções de recuperação.'}
            </p>
          </div>

          {/* Feedback */}
          {errorMessage && (
            <div className="feedback-alert error">
              <i className="fa-solid fa-circle-exclamation" />
              <span>{errorMessage}</span>
            </div>
          )}
          {successMessage && (
            <div className="feedback-alert success">
              <i className="fa-solid fa-circle-check" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Botão de Login / Cadastro Social Google */}
          {!isForgot && (
            <div className="auth-social-section">
              <button
                type="button"
                className="btn-google-social"
                onClick={handleGoogleAuth}
                disabled={loading || googleBusy}
              >
                <svg className="google-icon-svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.27v3.13C3.25 21.31 7.31 24 12 24z"/>
                  <path fill="#FBBC05" d="M5.28 14.27A7.17 7.17 0 0 1 4.9 12c0-.79.14-1.57.38-2.27V6.6H1.27A11.96 11.96 0 0 0 0 12c0 1.92.45 3.74 1.27 5.4l4.01-3.13z"/>
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.69 1.27 6.6l4.01 3.13c.95-2.83 3.6-4.98 6.72-4.98z"/>
                </svg>
                <span>
                  {googleBusy ? 'Conectando ao Google…' : isRegister ? 'Cadastrar com o Google' : 'Continuar com o Google'}
                </span>
              </button>
              <div className="auth-social-divider">
                <span>ou use seu e-mail</span>
              </div>
            </div>
          )}

          {/* Formulário */}
          <form className="auth-form" onSubmit={handleSubmit} autoComplete="off">

            {/* Nome — só no cadastro */}
            {isRegister && (
              <div className="floating-group">
                <div className="floating-input-wrapper">
                  <i className="fa-solid fa-user floating-prefix-icon" />
                  <input
                    id="input-name"
                    type="text"
                    className="floating-input"
                    placeholder=" "
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="off"
                    required
                  />
                  <label htmlFor="input-name" className="floating-label">{t('auth.nameLabel')}</label>
                </div>
              </div>
            )}

            {/* Telefone — só no cadastro */}
            {isRegister && (
              <div className="floating-group">
                <div className="floating-input-wrapper">
                  <i className="fa-solid fa-phone floating-prefix-icon" />
                  <input
                    id="input-phone"
                    type="tel"
                    className="floating-input"
                    placeholder=" "
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="off"
                    required
                  />
                  <label htmlFor="input-phone" className="floating-label">{t('auth.phoneLabel')}</label>
                </div>
              </div>
            )}

            {/* E-mail */}
            <div className="floating-group">
              <div className="floating-input-wrapper">
                <i className="fa-solid fa-envelope floating-prefix-icon" />
                <input
                  id="input-email"
                  type="email"
                  className="floating-input"
                  placeholder=" "
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  required
                />
                <label htmlFor="input-email" className="floating-label">{t('auth.emailLabel')}</label>
              </div>
            </div>

            {/* Senha — oculta no modo esqueci */}
            {!isForgot && (
              <div className="floating-group">
                <div className="floating-input-wrapper">
                  <i className="fa-solid fa-lock floating-prefix-icon" />
                  <input
                    id="input-password"
                    type={showPassword ? 'text' : 'password'}
                    className="floating-input has-suffix"
                    placeholder=" "
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    minLength={isRegister ? 8 : undefined}
                    data-lpignore="true"
                    required
                  />
                  <label htmlFor="input-password" className="floating-label">{t('auth.passwordLabel')}</label>
                  <button
                    type="button"
                    className="btn-toggle-password"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                    aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                  >
                    <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
                  </button>
                </div>
              </div>
            )}

            {/* Botão principal */}
            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin" />
                  <span>{t('auth.loadingButton')}</span>
                </>
              ) : isRegister ? (
                <>
                  <i className="fa-solid fa-user-plus" />
                  <span>Criar Minha Conta</span>
                </>
              ) : isForgot ? (
                <>
                  <i className="fa-solid fa-paper-plane" />
                  <span>Enviar Instruções</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-arrow-right-to-bracket" />
                  <span>{t('auth.loginButton')}</span>
                </>
              )}
            </button>

            {/* Links secundários */}
            <div className="auth-secondary-actions">
              {isLogin && (
                <>
                  <button
                    type="button"
                    className="btn-link-forgot"
                    onClick={() => switchMode('forgot')}
                  >
                    <i className="fa-solid fa-key" />
                    Esqueci minha senha
                  </button>

                  <div className="auth-divider"><span>ou</span></div>

                  <div className="auth-switch-prompt">
                    <span>Não tem uma conta?</span>
                    <button type="button" className="btn-link-switch" onClick={() => switchMode('register')}>
                      Cadastre-se
                    </button>
                  </div>
                </>
              )}

              {isRegister && (
                <div className="auth-switch-prompt">
                  <span>Já possui uma conta?</span>
                  <button type="button" className="btn-link-switch" onClick={() => switchMode('login')}>
                    Fazer Login
                  </button>
                </div>
              )}

              {isForgot && (
                <button type="button" className="btn-link-back" onClick={() => switchMode('login')}>
                  <i className="fa-solid fa-arrow-left" />
                  Voltar para o login
                </button>
              )}
            </div>

          </form>

          <p className="auth-version" aria-label={`Versão ${APP_VERSION}`}>
            Ethernity {APP_VERSION_LABEL}
          </p>
        </section>
      </main>
    </div>
  );
}
