/**
 * notificationService.js — Gerenciador singleton de Notificações Nativas (PWA / OS)
 * Suporta Área de Trabalho (Windows/Mac/Linux) e Mobile (Android).
 */

class NotificationService {
  constructor() {
    this.isSupported = typeof window !== 'undefined' && 'Notification' in window;
  }

  /**
   * Verifica o status da permissão atual
   * @returns {'granted' | 'denied' | 'default' | 'unsupported'}
   */
  getPermission() {
    if (!this.isSupported) return 'unsupported';
    return Notification.permission;
  }

  /**
   * Solicita permissão ao usuário
   * @returns {Promise<boolean>} true se concedida
   */
  async requestPermission() {
    if (!this.isSupported) return false;
    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch (err) {
      console.warn('Erro ao solicitar permissão de notificação:', err);
      return false;
    }
  }

  /**
   * Dispara uma notificação nativa do sistema operacional
   * @param {string} title
   * @param {NotificationOptions} options
   */
  async notify(title, options = {}) {
    if (!this.isSupported) return;

    if (Notification.permission === 'default') {
      const granted = await this.requestPermission();
      if (!granted) return;
    }

    if (Notification.permission !== 'granted') return;

    const defaultOptions = {
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      vibrate: [200, 100, 200],
      requireInteraction: false,
      silent: false,
      data: { url: window.location.origin },
      ...options,
    };

    // 1. Tentar via Service Worker Registration (preferível para PWA)
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.showNotification) {
          await reg.showNotification(title, defaultOptions);
          return;
        }
      } catch (e) {
        // Fallback para new Notification
      }
    }

    // 2. Fallback via construtor Notification padrão
    try {
      const n = new Notification(title, defaultOptions);
      if (defaultOptions.data?.url) {
        n.onclick = () => {
          window.focus();
          if (defaultOptions.data.url) {
            window.location.href = defaultOptions.data.url;
          }
          n.close();
        };
      }
    } catch (err) {
      console.warn('Falha ao instanciar notificação nativa:', err);
    }
  }

  /**
   * Notificação específica de Emergência SOS
   */
  notifyEmergencySOS(senderName = 'Paciente', details = 'Botão de pânico acionado!') {
    return this.notify(`ALERTA SOS: ${senderName}`, {
      body: details,
      icon: '/favicon.svg',
      requireInteraction: true,
      tag: 'emergency-sos',
      data: { url: '/#map' },
    });
  }

  /**
   * Notificação de nova mensagem do Grupo de Cuidado
   */
  notifyCareMessage(senderName, text, groupName = 'Grupo de Cuidado') {
    return this.notify(`${senderName} (${groupName})`, {
      body: text || 'Nova mensagem recebida',
      icon: '/favicon.svg',
      tag: 'care-message',
      data: { url: '/#messages' },
    });
  }
}

export const notificationService = new NotificationService();
export default notificationService;
