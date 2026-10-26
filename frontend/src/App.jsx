import React, { useState } from 'react';
import LoginView from './modules/auth/presentation/LoginView.jsx';
import MainApp from './modules/dashboard/presentation/MainApp.jsx';
import { I18nProvider } from './core/i18n/presentation/I18nContext.jsx';
import TopProgressBar from './core/components/TopProgressBar.jsx';
import ErrorBoundary from './core/components/ErrorBoundary.jsx';

const AUTH_TOKEN_KEY = 'ethernity_auth_token';

export default function App() {
  const [token, setToken] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.location.search) {
        const params = new URLSearchParams(window.location.search);
        const urlToken = params.get('token');
        const rawUser = params.get('user');

        if (urlToken) {
          localStorage.setItem(AUTH_TOKEN_KEY, urlToken);
          if (rawUser) {
            try {
              localStorage.setItem('ethernity_user', decodeURIComponent(rawUser));
            } catch {}
          }
          window.history.replaceState({}, document.title, window.location.pathname);
          return urlToken;
        }
      }

      return localStorage.getItem(AUTH_TOKEN_KEY) || null;
    } catch {
      return null;
    }
  });

  const handleLoginSuccess = (authToken) => {
    if (authToken) {
      try {
        localStorage.setItem(AUTH_TOKEN_KEY, authToken);
      } catch (err) {
        console.error('Erro ao salvar token de autenticação:', err);
      }
    }
    setToken(authToken);
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      sessionStorage.removeItem('ethernity_active_tab');
    } catch (err) {
      console.error('Erro ao limpar sessão:', err);
    }
    setToken(null);
  };

  return (
    <I18nProvider>
      <ErrorBoundary>
        <TopProgressBar />
        {!token ? (
          <LoginView onLoginSuccess={handleLoginSuccess} />
        ) : (
          <MainApp token={token} onLogout={handleLogout} />
        )}
      </ErrorBoundary>
    </I18nProvider>
  );
}
