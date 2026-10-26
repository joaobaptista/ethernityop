import React, { useState, useRef, useEffect } from 'react';
import profileRepository from '../infrastructure/profileRepository.js';
import { getUserInitials, getAbsolutePhotoUrl, formatWhatsAppNumber } from '../domain/profileModel.js';
import { convertImageToWebP } from '../../../core/services/mediaOptimizer.js';
import { useI18n } from '../../../core/i18n/presentation/useI18n.js';
import './ProfileView.css';

import NotificationBell from '../../../core/components/NotificationBell.jsx';

export default function ProfileView({
  profile,
  setProfile,
  token,
  onNavigateTab,
  onLogout,
  showToast,
  theme,
  toggleTheme,
  subscription,
  onOpenSubscription,
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [localPhotoPreview, setLocalPhotoPreview] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef(null);

  // PWA install
  const [deferredPwaPrompt, setDeferredPwaPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      setIsStandalone(true);
    }
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPwaPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallPwa = async () => {
    if (deferredPwaPrompt) {
      deferredPwaPrompt.prompt();
      const { outcome } = await deferredPwaPrompt.userChoice;
      if (outcome === 'accepted') {
        if (showToast) showToast(t('profile.installPwaSuccess') || '🎉 Aplicativo instalado com sucesso no seu dispositivo!');
      }
      setDeferredPwaPrompt(null);
    } else {
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      if (showToast) showToast(isIos ? (t('profile.installIosHint') || 'Para instalar no iOS: toque no botão Compartilhar e selecione "Adicionar à Tela de Início".') : (t('profile.installDesktopHint') || 'Para instalar no desktop: clique no ícone de instalação na barra de endereços do navegador.'));
    }
  };

  // Sincronizar com perfil existente
  useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setEmail(profile.email || '');
      setPhone(formatWhatsAppNumber(profile.phone || ''));
    }
  }, [profile]);

  const [hasImageError, setHasImageError] = useState(false);

  const rawPhoto = profile?.avatar_url || profile?.photo_url || profile?.avatar;

  useEffect(() => {
    setHasImageError(false);
  }, [rawPhoto, localPhotoPreview]);

  const avatarUrl = localPhotoPreview || getAbsolutePhotoUrl(rawPhoto);
  const getInitials = (n) => getUserInitials(n);

  // Upload direto de foto de perfil
  const handlePhotoUpload = async (e) => {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;

    if (!rawFile.type.startsWith('image/')) {
      if (showToast) showToast(t('profile.validImageRequired') || 'Por favor, selecione um arquivo de imagem válido (JPEG, PNG ou WebP).');
      return;
    }

    const previewUrl = URL.createObjectURL(rawFile);
    setLocalPhotoPreview(previewUrl);

    try {
      setIsUploadingPhoto(true);
      if (showToast) showToast(t('profile.uploadingAndOptimizing') || 'Enviando e otimizando sua foto de perfil...');

      const optimizedWebpFile = await convertImageToWebP(rawFile, {
        isAvatar: true,
        quality: 0.88,
        maxAvatarSize: 600,
      });

      const uploadRes = await profileRepository.uploadPhoto(token, optimizedWebpFile);
      const newPhotoUrl = uploadRes.photo_url || uploadRes.url;

      const updated = await profileRepository.updateProfile(token, {
        name,
        email,
        phone,
        photo_url: newPhotoUrl,
      });

      const finalProfile = updated || { ...profile, photo_url: newPhotoUrl, avatar: newPhotoUrl, avatar_url: newPhotoUrl };
      setProfile(finalProfile);
      setLocalPhotoPreview(null);
      if (showToast) showToast(t('profile.photoSuccess') || '✨ Foto de perfil atualizada com sucesso!');
    } catch (err) {
      setLocalPhotoPreview(null);
      if (showToast) showToast(t('profile.photoError', { error: err.message }) || `Erro ao atualizar foto: ${err.message}`);
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Salvar edições do perfil
  const handleSaveProfile = async (e) => {
    e.preventDefault();

    if (password && password !== confirmPassword) {
      if (showToast) showToast(t('profile.passwordMismatch') || 'As senhas digitadas não coincidem.');
      return;
    }

    if (password && password.length < 8) {
      if (showToast) showToast(t('profile.passwordMinLength') || 'A nova senha deve ter no mínimo 8 caracteres.');
      return;
    }

    try {
      setIsSaving(true);
      const payload = {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        photo_url: profile?.photo_url || profile?.avatar || undefined,
      };

      if (password && password.trim().length > 0) {
        payload.password = password.trim();
      }

      const updated = await profileRepository.updateProfile(token, payload);
      setProfile(updated || { ...profile, ...payload });
      setPassword('');
      setConfirmPassword('');
      if (showToast) showToast(t('profile.saveSuccess') || '💾 Dados do seu perfil salvos com sucesso!');
    } catch (err) {
      if (showToast) showToast(t('profile.saveError', { error: err.message }) || `Erro ao salvar: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="profile-screen-wrapper fade-in">
      <div className="profile-screen-container">
        {/* Cabeçalho & Breadcrumbs */}
        <div className="prof-top-bar">
          <div className="prof-left-title-block">
            <nav className="prof-breadcrumbs" aria-label="Navegação">
              <span
                className="prof-crumb-link"
                onClick={() => onNavigateTab && onNavigateTab('vault')}
              >
                {t('nav.vault') || 'Meu Cofre'}
              </span>
              <span className="prof-crumb-sep">&gt;</span>
              <span className="prof-crumb-current">{t('profile.breadcrumb') || 'Perfil & Configurações da Conta'}</span>
            </nav>

            <h1 className="prof-main-title">{t('profile.title') || 'Perfil & Configurações da Conta'}</h1>
            <p className="prof-main-subtitle">
              {t('profile.subtitle') || 'Gerencie seus dados de acesso, contatos, segurança e preferências da conta.'}
            </p>
          </div>

          <div className="prof-top-actions">
            <NotificationBell onNavigateTab={onNavigateTab} />
          </div>
        </div>

        {/* Grid de 2 Colunas */}
        <div className="prof-grid-layout">
          {/* Coluna Lateral: Resumo, Foto & Ações Rápidas */}
          <aside className="prof-sidebar-column">
            <div className="prof-white-card">
              <div className="prof-avatar-box">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handlePhotoUpload}
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  style={{ display: 'none' }}
                />

                <div className="prof-photo-circle-wrapper">
                  <div className="prof-photo-circle">
                    {avatarUrl && !hasImageError ? (
                      <img
                        src={avatarUrl}
                        alt={name}
                        className="prof-photo-img"
                        referrerPolicy="no-referrer"
                        onError={() => setHasImageError(true)}
                      />
                    ) : (
                      <span className="prof-photo-initials">{getInitials(name)}</span>
                    )}
                  </div>

                  <button
                    type="button"
                    className="prof-btn-camera-badge"
                    onClick={() => fileInputRef.current?.click()}
                    title={t('profile.changePhotoBadge') || 'Alterar foto de perfil'}
                    disabled={isUploadingPhoto}
                  >
                    <i className={`fa-solid ${isUploadingPhoto ? 'fa-spinner fa-spin' : 'fa-camera'}`}></i>
                  </button>
                </div>

                <button
                  type="button"
                  className="prof-btn-alterar-foto"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingPhoto}
                >
                  <i className="fa-solid fa-cloud-arrow-up"></i>
                  <span>{isUploadingPhoto ? (t('profile.uploadingPhoto') || 'Enviando foto...') : (t('profile.changePhoto') || 'Alterar Foto')}</span>
                </button>

                <h3 className="prof-user-name">{name || 'Seu Nome'}</h3>
                <p className="prof-user-email">{email || 'seuemail@exemplo.com'}</p>
              </div>

              {/* Botões de Ações Rápidas */}
              <div className="prof-quick-actions-group">
                {/* Meu Plano & Assinatura */}
                <button
                  type="button"
                  className="prof-action-btn-card"
                  onClick={onOpenSubscription}
                >
                  <div className="prof-action-icon-box coral">
                    <i className="fa-solid fa-crown"></i>
                  </div>
                  <div className="prof-action-meta">
                    <div className="prof-action-title-row">
                      <span className="prof-action-title">{t('profile.myPlanCardTitle') || 'Meu Plano & Assinatura'}</span>
                    </div>
                    <span className="prof-plan-pill-tag">
                      {subscription?.planName || 'Plano Infinity'}
                    </span>
                    <span className="prof-action-sub">{t('profile.unlimitedLegacyVault') || 'Cofre e Memórias Ilimitadas'}</span>
                  </div>
                  <i className="fa-solid fa-chevron-right prof-action-chevron"></i>
                </button>

                {/* Alternar Aparência */}
                <button
                  type="button"
                  className="prof-action-btn-card"
                  onClick={toggleTheme}
                >
                  <div className="prof-action-icon-box yellow">
                    <i className={`fa-solid ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`}></i>
                  </div>
                  <div className="prof-action-meta">
                    <span className="prof-action-title">{t('profile.appearanceTitle') || 'Aparência'}</span>
                    <span className="prof-action-sub">
                      {theme === 'dark' ? (t('profile.darkModeActive') || 'Modo Escuro (Ativo)') : (t('profile.lightModeActive') || 'Modo Claro (Ativo)')}
                    </span>
                  </div>
                  <i className="fa-solid fa-chevron-right prof-action-chevron"></i>
                </button>

                {/* PWA */}
                {!isStandalone && (
                  <button
                    type="button"
                    className="prof-action-btn-card"
                    onClick={handleInstallPwa}
                  >
                    <div className="prof-action-icon-box purple">
                      <i className="fa-solid fa-download"></i>
                    </div>
                    <div className="prof-action-meta">
                      <span className="prof-action-title">{t('profile.installPwaTitle') || 'Instalar Aplicativo (PWA)'}</span>
                      <span className="prof-action-sub">{t('profile.installPwaSubtitle') || 'Acesso Rápido Standalone'}</span>
                    </div>
                    <i className="fa-solid fa-chevron-right prof-action-chevron"></i>
                  </button>
                )}

                {/* Sair da Conta */}
                <button
                  type="button"
                  className="prof-btn-logout-card"
                  onClick={onLogout}
                >
                  <i className="fa-solid fa-arrow-right-from-bracket"></i>
                  <span>{t('profile.logoutBtn') || 'Sair da Conta'}</span>
                </button>
              </div>
            </div>
          </aside>

          {/* Coluna Principal: Formulário de Dados Pessoais & Segurança */}
          <main className="prof-main-form-column">
            <form onSubmit={handleSaveProfile} className="prof-form-section-card">
              {/* Header da Seção */}
              <div className="prof-sec-header">
                <div className="prof-sec-icon-box">
                  <i className="fa-solid fa-user-pen"></i>
                </div>
                <div className="prof-sec-title-wrap">
                  <h2 className="prof-sec-title">{t('profile.personalSection') || 'Dados Pessoais & Contato'}</h2>
                  <p className="prof-sec-desc">
                    {t('profile.personalSectionDesc') || 'Gerencie seus dados de acesso, contatos e preferências de segurança da conta.'}
                  </p>
                </div>
              </div>

              {/* Grid de Nome & E-mail */}
              <div className="prof-form-grid-2">
                <div className="prof-form-group">
                  <label className="prof-form-label" htmlFor="prof-input-name">
                    {t('profile.fullName') || 'Nome Completo'}
                  </label>
                  <input
                    id="prof-input-name"
                    type="text"
                    className="prof-form-input"
                    placeholder={t('profile.fullNamePlaceholder') || 'Seu nome completo'}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div className="prof-form-group">
                  <label className="prof-form-label" htmlFor="prof-input-email">
                    {t('profile.email') || 'Email Principal'}
                  </label>
                  <input
                    id="prof-input-email"
                    type="email"
                    className="prof-form-input"
                    placeholder={t('profile.emailPlaceholder') || 'seuemail@exemplo.com'}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Telefone / WhatsApp */}
              <div className="prof-form-group">
                <label className="prof-form-label" htmlFor="prof-input-phone">
                  <i className="fa-brands fa-whatsapp" style={{ color: '#25D366' }}></i>
                  {t('profile.phone') || 'WhatsApp / Telefone'}
                </label>
                <input
                  id="prof-input-phone"
                  type="tel"
                  className="prof-form-input"
                  placeholder={t('profile.phonePlaceholder') || 'Ex: (11) 98765-4321'}
                  value={phone}
                  onChange={(e) => setPhone(formatWhatsAppNumber(e.target.value))}
                  maxLength={20}
                  required
                />
              </div>

              {/* Card de Segurança e Senha */}
              <div className="prof-security-box">
                <div className="prof-security-top-row">
                  <div className="prof-security-label-block">
                    <i className="fa-solid fa-lock" style={{ color: '#FF5A43' }}></i>
                    <div>
                      <strong>{t('profile.securitySection') || 'Segurança e Alteração de Senha'}</strong>
                      <div className="prof-security-sub">{t('profile.newPassword') || 'Nova Senha (opcional)'}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-toggle-eye"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? (t('profile.hidePasswords') || 'Ocultar senhas') : (t('profile.showPasswords') || 'Exibir senhas')}
                  >
                    <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>

                <div className="prof-form-grid-2">
                  <div className="prof-form-group">
                    <label className="prof-form-label" htmlFor="prof-input-pass">
                      {t('profile.newPassword') || 'Nova Senha (opcional)'}
                    </label>
                    <input
                      id="prof-input-pass"
                      type={showPassword ? 'text' : 'password'}
                      className="prof-form-input"
                      placeholder={t('profile.newPasswordPlaceholder') || 'Mínimo 8 caracteres'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>

                  <div className="prof-form-group">
                    <label className="prof-form-label" htmlFor="prof-input-pass-confirm">
                      {t('profile.confirmPassword') || 'Confirmar Nova Senha'}
                    </label>
                    <input
                      id="prof-input-pass-confirm"
                      type={showPassword ? 'text' : 'password'}
                      className="prof-form-input"
                      placeholder={t('profile.confirmPasswordPlaceholder') || 'Repita a nova senha'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
              </div>

              {/* Botão de Salvar */}
              <div className="prof-form-footer-actions">
                <button
                  type="submit"
                  className="prof-btn-save-main"
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin"></i>
                      <span>{t('profile.savingChanges') || 'Salvando...'}</span>
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-check"></i>
                      <span>{t('profile.saveChanges') || 'Salvar Alterações'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </main>
        </div>
      </div>
    </div>
  );
}
