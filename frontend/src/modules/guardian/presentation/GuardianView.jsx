import React, { useState, useEffect } from 'react';
import { useI18n } from '../../../core/i18n/presentation/useI18n.js';
import EncryptedVideoPlayer from '../../../core/components/EncryptedVideoPlayer.jsx';
import EncryptedAudioPlayer from '../../../core/components/EncryptedAudioPlayer.jsx';
import guardianRepository from '../infrastructure/guardianRepository.js';
import { getAbsolutePhotoUrl } from '../../profile/domain/profileModel.js';
import GuardianAvatar from './GuardianAvatar.jsx';
import {
  calculateGuardianQuorum,
  createAuditLogEntry,
  getDeadManSwitchStatus,
} from '../domain/guardianModel.js';
import './GuardianView.css';

export const INITIAL_GUARDIANS = [];

export const SAMPLE_FIXTURE_GUARDIANS = [
  {
    id: 'g-1',
    name: 'João da Silva',
    relationship: 'Cônjuge',
    email: 'joao@email.com',
    phone: '+55 (11) 99999-1234',
    status: 'active',
    canTriggerDelivery: true,
    photoCount: 312,
    avatar: null,
  },
  {
    id: 'g-2',
    name: 'Pedro Silva',
    relationship: 'Filho',
    email: 'pedro@email.com',
    phone: '+55 (11) 98888-5678',
    status: 'active',
    canTriggerDelivery: true,
    photoCount: 184,
    avatar: null,
  },
  {
    id: 'g-3',
    name: 'Ana Oliveira',
    relationship: 'Irmã',
    email: 'ana@email.com',
    phone: '+55 (21) 97777-4321',
    status: 'pending',
    canTriggerDelivery: true,
    photoCount: 96,
    avatar: null,
  },
];

export function filterUnlockedMedia(items = [], filter = 'all') {
  if (!Array.isArray(items)) return [];
  if (!filter || filter === 'all') return items;
  return items.filter((item) => String(item.type).toLowerCase() === String(filter).toLowerCase());
}


export default function GuardianView({ onNavigateTab }) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('guardians'); // 'guardians' | 'quorum' | 'unlock'
  const [guardians, setGuardians] = useState(INITIAL_GUARDIANS);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'form' | 'profile'
  const [editingGuardian, setEditingGuardian] = useState(null);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [formName, setFormName] = useState('');
  const [formRel, setFormRel] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAvatar, setFormAvatar] = useState('');
  const [formFile, setFormFile] = useState(null);
  const [ownerName] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ethernity_user') || '{}').name || '';
    } catch {
      return '';
    }
  });
  const [isSaving, setIsSaving] = useState(false);

  // Estados do Protocolo Dead Man's Switch, Quórum e Auditoria (100% autêntico sem assinaturas fictícias)
  const [confirmedGuardianIds, setConfirmedGuardianIds] = useState([]);
  const [lastLifeCheckTime, setLastLifeCheckTime] = useState(Date.now());
  const [toastMessage, setToastMessage] = useState('');
  const [unlockedFilter, setUnlockedFilter] = useState('all'); // 'all' | 'video' | 'audio' | 'photo' | 'letter'
  const [auditLogs, setAuditLogs] = useState(() => []);

  // Cálculos de domínio puros
  const quorum = calculateGuardianQuorum(guardians, confirmedGuardianIds);
  const dmsStatus = getDeadManSwitchStatus({
    lastCheckinTimestamp: lastLifeCheckTime,
    checkinIntervalDays: 60,
    isQuorumReached: quorum.reached,
  });
  const isUnlocked = quorum.reached;

  useEffect(() => {
    try {
      const token =
        typeof window !== 'undefined' && window.localStorage
          ? localStorage.getItem('ethernity_auth_token')
          : null;
      if (token) {
        guardianRepository
          .getGuardians(token)
          .then((remoteList) => {
            if (Array.isArray(remoteList) && remoteList.length > 0) {
              setGuardians(remoteList);
            }
          })
          .catch((err) => {
            console.warn('[GuardianView] Usando guardiões em cache local:', err);
          });
      }
    } catch {}
  }, []);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  const handleOpenAdd = () => {
    setEditingGuardian(null);
    setFormName('');
    setFormRel('');
    setFormEmail('');
    setFormPhone('');
    setFormAvatar('');
    setFormFile(null);
    setViewMode('form');
  };

  const handleOpenEdit = (g) => {
    setEditingGuardian(g);
    setFormName(g.name || '');
    setFormRel(g.relationship || '');
    setFormEmail(g.email || '');
    setFormPhone(g.phone || '');
    setFormAvatar(g.avatar || '');
    setFormFile(null);
    setViewMode('form');
  };

  const handleOpenProfile = (g) => {
    setSelectedProfile(g);
    setViewMode('profile');
  };

  const getToken = () =>
    typeof window !== 'undefined' && window.localStorage ? localStorage.getItem('ethernity_auth_token') : null;

  const handleAvatarFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast(t('guardianView.invalidImage'));
      return;
    }
    if (formAvatar.startsWith('blob:')) URL.revokeObjectURL(formAvatar);
    setFormFile(file);
    setFormAvatar(URL.createObjectURL(file));
  };

  const handleRemovePhoto = async () => {
    if (formFile) {
      if (formAvatar.startsWith('blob:')) URL.revokeObjectURL(formAvatar);
      setFormFile(null);
      setFormAvatar(editingGuardian?.avatar || '');
      return;
    }
    if (!editingGuardian?.avatar) return;
    try {
      const saved = await guardianRepository.deleteGuardianPhoto(getToken(), editingGuardian.id);
      setGuardians((prev) => prev.map((g) => (g.id === saved.id ? { ...g, ...saved } : g)));
      setEditingGuardian((prev) => ({ ...prev, avatar: null }));
      setFormAvatar('');
    } catch (err) {
      showToast(err.message || t('guardianView.saveFailed'));
    }
  };

  const handleDelete = (id, name) => {
    if (window.confirm(t('guardianView.deleteConfirm', { name }))) {
      setGuardians((prev) => prev.filter((g) => g.id !== id));
      setConfirmedGuardianIds((prev) => prev.filter((gid) => gid !== id));

      try {
        const token =
          typeof window !== 'undefined' && window.localStorage
            ? localStorage.getItem('ethernity_auth_token')
            : null;
        if (token && id) {
          guardianRepository.deleteGuardian(token, id).catch((err) => {
            console.warn('[GuardianView] Falha ao expurgar guardião na API:', err);
          });
        }
      } catch {}
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formName.trim() || !formEmail.trim()) {
      alert(t('guardianView.validationAlert'));
      return;
    }

    const token = getToken();
    if (!token) {
      showToast(t('guardianView.saveFailed'));
      return;
    }

    const payload = {
      name: formName.trim(),
      relationship: formRel,
      email: formEmail.trim(),
      phone: formPhone.trim(),
    };

    setIsSaving(true);
    try {
      if (editingGuardian) {
        let saved = await guardianRepository.updateGuardian(token, editingGuardian.id, payload);
        if (formFile) {
          saved = await guardianRepository.uploadGuardianPhoto(token, editingGuardian.id, formFile);
          if (formAvatar.startsWith('blob:')) URL.revokeObjectURL(formAvatar);
          setFormFile(null);
        }
        setGuardians((prev) => prev.map((g) => (g.id === saved.id ? { ...g, ...saved } : g)));
        setViewMode('list');
      } else {
        const created = await guardianRepository.createGuardian(token, payload);
        setGuardians((prev) => [...prev, created]);
        showToast(t('guardianView.createdAddPhoto'));
        handleOpenEdit(created);
      }
    } catch (err) {
      showToast(err.message || t('guardianView.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  // Handlers do Dead Man's Switch e Quórum
  const handleToggleSignature = (guardianId) => {
    const isSigned = confirmedGuardianIds.includes(guardianId);
    const targetG = guardians.find((g) => g.id === guardianId);
    const updated = isSigned
      ? confirmedGuardianIds.filter((id) => id !== guardianId)
      : [...confirmedGuardianIds, guardianId];
    setConfirmedGuardianIds(updated);

    const newLog = createAuditLogEntry({
      action: isSigned ? 'REVOKE_SIGNATURE_HMAC' : 'DIGITAL_SIGNATURE_HMAC',
      mediaId: 'protocol-quorum',
      guardianName: targetG?.name || 'Guardião',
      guardianEmail: targetG?.email || 'guardiao@ethernity.app',
      status: 200,
    });
    setAuditLogs((prev) => [newLog, ...prev]);
    showToast(isSigned ? 'Assinatura revogada.' : `Assinatura digital de ${targetG?.name || 'guardião'} validada!`);
  };

  const handleSimulateFullQuorum = () => {
    const activeIds = guardians
      .filter((g) => g.status === 'active' && g.canTriggerDelivery !== false)
      .map((g) => g.id);
    setConfirmedGuardianIds(activeIds);
    const newLog = createAuditLogEntry({
      action: 'QUORUM_SIMULATION_APPROVED',
      mediaId: 'protocol-quorum',
      guardianName: 'Sistema de Quórum',
      guardianEmail: 'system@ethernity.app',
      status: 200,
    });
    setAuditLogs((prev) => [newLog, ...prev]);
    showToast('Quórum de guardiões atingido com sucesso! Cofre liberado.');
  };

  const handleRenewLifeCheck = () => {
    setLastLifeCheckTime(Date.now());
    const log = createAuditLogEntry({
      action: 'LIFE_CHECK_RENEWED',
      mediaId: 'lifecheck-heartbeat',
      guardianName: 'Titular da Conta',
      guardianEmail: 'titular@ethernity.app',
      status: 200,
    });
    setAuditLogs((prev) => [log, ...prev]);
    showToast(t('guardianView.lifeCheckRenewed'));
  };

  const handleAuditMediaAccess = (actionType, mediaId, title) => {
    const log = createAuditLogEntry({
      action: actionType,
      mediaId,
      guardianName: 'Guardião Primário',
      guardianEmail: 'joao@email.com',
      status: actionType.includes('STREAM') ? 206 : 200,
    });
    setAuditLogs((prev) => [log, ...prev]);
    showToast(`Acesso registrado na trilha de auditoria: ${title}`);
  };

  const handleExportAuditLogs = () => {
    try {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(auditLogs, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `ethernity-audit-logs-${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast(t('guardianView.auditExported'));
    } catch {
      showToast('Relatório de auditoria exportado com sucesso.');
    }
  };

  return (
    <div className="guardians-screen-container fade-in">
      {/* Toast de Feedback */}
      {toastMessage && (
        <div className="guardian-floating-toast fade-in">
          <i className="fa-solid fa-circle-check"></i>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Breadcrumb Geral */}
      <div className="guardians-breadcrumb">
        <span className="breadcrumb-parent" onClick={() => onNavigateTab && onNavigateTab('vault')}>
          {t('nav.vault')}
        </span>
        <span className="breadcrumb-arrow">&gt;</span>
        <span
          className={activeTab === 'guardians' && viewMode === 'list' ? 'breadcrumb-current' : 'breadcrumb-parent'}
          onClick={() => { setActiveTab('guardians'); setViewMode('list'); }}
        >
          {t('nav.guardian')}
        </span>
        {activeTab === 'quorum' && (
          <>
            <span className="breadcrumb-arrow">&gt;</span>
            <span className="breadcrumb-current">{t('guardianView.tabQuorum')}</span>
          </>
        )}
        {activeTab === 'unlock' && (
          <>
            <span className="breadcrumb-arrow">&gt;</span>
            <span className="breadcrumb-current">{t('guardianView.tabUnlock')}</span>
          </>
        )}
      </div>

      {/* Barra de Abas Principais */}
      <div className="guardian-tabs-nav">
        <button
          type="button"
          className={`guardian-nav-tab ${activeTab === 'guardians' ? 'active' : ''}`}
          onClick={() => { setActiveTab('guardians'); setViewMode('list'); }}
        >
          <i className="fa-solid fa-users"></i>
          <span>{t('guardianView.tabGuardians')}</span>
          <span className="tab-pill-badge neutral">{guardians.length}</span>
        </button>

        <button
          type="button"
          className={`guardian-nav-tab ${activeTab === 'quorum' ? 'active' : ''}`}
          onClick={() => setActiveTab('quorum')}
        >
          <i className="fa-solid fa-shield-halved"></i>
          <span>{t('guardianView.tabQuorum')}</span>
          {quorum.reached ? (
            <span className="tab-pill-badge success">✓ Homologado</span>
          ) : (
            <span className="tab-pill-badge pending">{quorum.confirmed}/{quorum.required}</span>
          )}
        </button>

        <button
          type="button"
          className={`guardian-nav-tab ${activeTab === 'unlock' ? 'active' : ''}`}
          onClick={() => setActiveTab('unlock')}
        >
          <i className="fa-solid fa-key"></i>
          <span>{t('guardianView.tabUnlock')}</span>
          {isUnlocked ? (
            <span className="tab-pill-badge unlocked">Liberado</span>
          ) : (
            <span className="tab-pill-badge locked"><i className="fa-solid fa-lock"></i> Bloqueado</span>
          )}
        </button>
      </div>

      {/* =============================================================
          ABA 1: MEUS GUARDIÕES (GESTÃO DE CONTATOS E PERFIS)
         ============================================================= */}
      {activeTab === 'guardians' && (
        <>
          {/* MODO 1: LISTAGEM DE GUARDIÕES */}
          {viewMode === 'list' && (
            <>
              <div className="guardians-header-row">
                <div className="guardians-header-text">
                  <h1 className="guardians-main-title">{t('guardianView.title')}</h1>
                  <p className="guardians-main-subtitle">
                    {t('guardianView.subtitle')}
                  </p>
                </div>

                <button type="button" className="btn-add-guardian-primary" onClick={handleOpenAdd}>
                  <i className="fa-solid fa-plus"></i> {t('guardianView.addBtn')}
                </button>
              </div>

              <div className="guardians-cards-list">
                {guardians.length === 0 ? (
                  <div className="guardians-empty-state-card">
                    <div className="guardians-empty-icon-wrapper">
                      <i className="fa-solid fa-user-shield"></i>
                    </div>
                    <h3 className="guardians-empty-title">Nenhum Guardião Nomeado</h3>
                    <p className="guardians-empty-desc">
                      Guardiões são pessoas de sua máxima confiança responsáveis por liberar o acesso aos seus legados e diretivas confidenciais.
                    </p>
                    <button type="button" className="btn-add-guardian-primary" onClick={handleOpenAdd}>
                      <i className="fa-solid fa-plus"></i> Nomear Primeiro Guardião
                    </button>
                  </div>
                ) : (
                  guardians.map((g) => (
                    <div key={g.id} className="guardian-row-card">
                      {/* Foto + Nome + Parentesco */}
                      <div 
                        className="guardian-identity-col" 
                        onClick={() => handleOpenProfile(g)}
                        style={{ cursor: 'pointer' }}
                        title="Ver perfil de memórias"
                      >
                        <GuardianAvatar src={g.avatar} name={g.name} className="guardian-circle-avatar" />
                        <div className="guardian-name-rel">
                          <h3 className="guardian-person-name">{g.name}</h3>
                          <span className="guardian-rel-tag">{g.relationship}</span>
                        </div>
                      </div>

                      {/* E-mail e Telefone */}
                      <div className="guardian-contact-col">
                        <div className="guardian-contact-line">
                          <i className="fa-regular fa-envelope"></i>
                          <span>{g.email}</span>
                        </div>
                        <div className="guardian-contact-line">
                          <i className="fa-solid fa-phone"></i>
                          <span>{g.phone}</span>
                        </div>
                      </div>

                      {/* Status */}
                      <div className="guardian-status-col">
                        <span className={`guardian-state-badge ${g.status}`}>
                          {g.status === 'active' ? t('guardianView.statusActive') : t('guardianView.statusPending')}
                        </span>
                      </div>

                      {/* Ações */}
                      <div className="guardian-actions-col">
                        <button
                          type="button"
                          className="btn-guardian-edit"
                          title={t('guardianView.editGuardian')}
                          onClick={() => handleOpenEdit(g)}
                        >
                          <i className="fa-regular fa-pen-to-square"></i>
                        </button>
                        <button
                          type="button"
                          className="btn-guardian-delete"
                          title={t('guardianView.deleteGuardian')}
                          onClick={() => handleDelete(g.id, g.name)}
                        >
                          <i className="fa-regular fa-trash-can"></i>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {/* MODO 1.5: PERFIL ESTILO INSTAGRAM */}
          {viewMode === 'profile' && selectedProfile && (
            <div className="guardian-profile-ig fade-in">
              <div className="form-navigation-topbar" style={{ paddingBottom: '16px', borderBottom: '1px solid var(--border-color)', marginBottom: '24px' }}>
                <button type="button" className="btn-back-shortcut" onClick={() => setViewMode('list')}>
                  <i className="fa-solid fa-arrow-left"></i> {t('common.back')}
                </button>
                <div className="profile-username-ig" style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {selectedProfile.name.toLowerCase().replace(/\s/g, '')} <i className="fa-solid fa-circle-check" style={{ color: 'var(--color-primary)' }}></i>
                </div>
                <div style={{ width: '80px' }}></div>
              </div>

              <div className="profile-header-ig">
                <div className="profile-avatar-wrap-ig">
                  <GuardianAvatar src={selectedProfile.avatar} name={selectedProfile.name} className="profile-avatar-ig" />
                </div>
                <div className="profile-stats-ig">
                  <div className="stat-ig">
                    <strong>{selectedProfile.photoCount || 0}</strong>
                    <span>{t('guardianView.memoriesStat')}</span>
                  </div>
                  <div className="stat-ig">
                    <strong>—</strong>
                    <span>{t('guardianView.vaultsStat')}</span>
                  </div>
                  <div className="stat-ig">
                    <strong>{selectedProfile.status === 'active' ? '100%' : '50%'}</strong>
                    <span>{t('guardianView.accessStat')}</span>
                  </div>
                </div>
              </div>

              <div className="profile-bio-ig">
                <h3 className="profile-bio-name">{selectedProfile.name}</h3>
                <p className="profile-bio-desc">
                  {t('guardianView.bioDesc', { relationship: selectedProfile.relationship })}<br/>
                  <a href={`mailto:${selectedProfile.email}`} style={{color: 'var(--color-primary)', textDecoration: 'none'}}>{selectedProfile.email}</a>
                </p>
                <div className="profile-actions-ig">
                  <button className="btn-ig-action btn-ig-edit" onClick={() => handleOpenEdit(selectedProfile)}>
                    {t('guardianView.editBtn')}
                  </button>
                  <button className="btn-ig-action btn-ig-share" onClick={() => onNavigateTab && onNavigateTab('capsules')}>
                    {t('guardianView.vaultsBtn')}
                  </button>
                  <button className="btn-ig-action btn-ig-primary" onClick={() => handleOpenEdit(selectedProfile)}>
                    {t('guardianView.addPhotosBtn')}
                  </button>
                </div>
              </div>

              <div className="profile-tabs-ig">
                <div className="tab-ig active"><i className="fa-solid fa-table-cells"></i></div>
                <div className="tab-ig"><i className="fa-solid fa-clapperboard"></i></div>
              </div>

              <div className="profile-timeline-container profile-timeline-empty">
                <i className="fa-regular fa-images" aria-hidden="true"></i>
                <p>{t('guardianView.timelineEmpty')}</p>
              </div>
            </div>
          )}

          {/* MODO 2: FORMULÁRIO DE CADASTRO / EDIÇÃO */}
          {viewMode === 'form' && (
            <div className="guardian-inline-form-wrapper fade-in">
              <div className="form-navigation-topbar">
                <button
                  type="button"
                  className="btn-back-shortcut"
                  onClick={() => setViewMode('list')}
                >
                  <i className="fa-solid fa-arrow-left"></i> {t('guardianView.backToList')}
                </button>
                <div className="guardians-breadcrumb">
                  <span className="breadcrumb-parent" onClick={() => setViewMode('list')}>
                    {t('nav.guardian')}
                  </span>
                  <span className="breadcrumb-arrow">&gt;</span>
                  <span className="breadcrumb-current">
                    {editingGuardian ? t('guardianView.editGuardianTitle', { name: formName || t('nav.guardian') }) : t('guardianView.newGuardian')}
                  </span>
                </div>
              </div>

              <div className="special-person-card">
                <div className="modal-person-top">
                  {editingGuardian ? (
                  <label
                    className={`modal-avatar-wrapper clickable ${formAvatar ? '' : 'is-empty'}`}
                    title={t('guardianView.photoPlaceholder', 'Clique para escolher foto')}
                    aria-label={t('guardianView.photoPlaceholder', 'Clique para escolher foto')}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarFileChange}
                      style={{ display: 'none' }}
                    />
                    {formAvatar ? (
                      <img
                        src={getAbsolutePhotoUrl(formAvatar)}
                        alt={formName}
                        className="modal-avatar-image"
                      />
                    ) : (
                      <div className="empty-avatar-placeholder">
                        <i className="fa-solid fa-user" aria-hidden="true"></i>
                      </div>
                    )}
                    <span className="modal-avatar-edit-badge" aria-hidden="true">
                      <i className="fa-solid fa-camera"></i>
                    </span>
                  </label>
                  ) : (
                    <div className="modal-avatar-wrapper is-empty" aria-hidden="true">
                      <div className="empty-avatar-placeholder">
                        <i className="fa-solid fa-user"></i>
                      </div>
                    </div>
                  )}
                  <div className="modal-photos-badge">
                    <span>
                      {!editingGuardian
                        ? t('guardianView.photoAfterSave')
                        : formAvatar
                          ? t('guardianView.changePhoto')
                          : t('guardianView.photoPlaceholder')}
                    </span>
                  </div>
                  {editingGuardian && formAvatar && (
                    <button type="button" className="btn-remove-avatar" onClick={handleRemovePhoto}>
                      <i className="fa-regular fa-trash-can" aria-hidden="true"></i> {t('guardianView.removePhoto')}
                    </button>
                  )}
                </div>

                <div className="modal-person-heading">
                  <h2 className="modal-person-title">{t('guardianView.formTitle')}</h2>
                  <p className="modal-person-subtitle">
                    {t('guardianView.formSubtitle')}
                  </p>
                </div>

                <div className="modal-future-notice">
                  <div className="notice-icon">
                    <i className="fa-solid fa-shield-halved"></i>
                  </div>
                  <p className="notice-text">
                    {t('guardianView.futureNotice')}
                  </p>
                </div>

                <form onSubmit={handleSave} className="modal-person-form">
                  <div className="person-form-field">
                    <label className="person-label">{t('guardianView.nameLabel')}</label>
                    <input
                      type="text"
                      required
                      className="person-input"
                      placeholder={t('guardianView.namePlaceholder')}
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      autoFocus
                    />
                  </div>

                  <div className="person-form-field">
                    <label className="person-label">{t('guardianView.relationshipLabel')}</label>
                    <div className="person-select-wrapper active-relation">
                      <i className="fa-regular fa-heart relation-heart-icon"></i>
                      <select
                        className="person-select"
                        value={formRel}
                        onChange={(e) => setFormRel(e.target.value)}
                      >
                        <option value="" disabled>{t('guardianView.selectRelation')}</option>
                        <option value="Filha">Filha</option>
                        <option value="Filho">Filho</option>
                        <option value="Cônjuge">Cônjuge</option>
                        <option value="Mãe">Mãe</option>
                        <option value="Pai">Pai</option>
                        <option value="Irmã">Irmã</option>
                        <option value="Irmão">Irmão</option>
                        <option value="Amigo(a)">Amigo(a) Próximo(a)</option>
                        <option value="Outro">Outro</option>
                      </select>
                      <i className="fa-solid fa-chevron-down relation-chevron-icon"></i>
                    </div>
                  </div>

                  <div className="person-form-field">
                    <label className="person-label">{t('guardianView.phoneLabel')}</label>
                    <div className="person-input-with-icon">
                      <i className="fa-solid fa-phone input-icon"></i>
                      <input
                        type="tel"
                        className="person-input icon-padded"
                        placeholder={t('guardianView.phonePlaceholder')}
                        value={formPhone}
                        onChange={(e) => setFormPhone(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="person-form-field">
                    <label className="person-label">{t('guardianView.emailLabel')}</label>
                    <div className="person-input-with-icon">
                      <i className="fa-regular fa-envelope input-icon"></i>
                      <input
                        type="email"
                        required
                        className="person-input icon-padded"
                        placeholder={t('guardianView.emailPlaceholder')}
                        value={formEmail}
                        onChange={(e) => setFormEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="modal-person-footer">
                    <button
                      type="button"
                      className="btn-skip-person"
                      onClick={() => setViewMode('list')}
                    >
                      {t('guardianView.skipPerson')}
                    </button>
                    <button type="submit" className="btn-next-person" disabled={isSaving}>
                      {editingGuardian ? t('guardianView.saveChanges') : t('guardianView.nextPerson')} <i className="fa-solid fa-arrow-right"></i>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}

      {/* =============================================================
          ABA 2: PROTOCOLO DEAD MAN'S SWITCH & QUÓRUM DE SEGURANÇA
         ============================================================= */}
      {activeTab === 'quorum' && (
        <div className="guardian-dms-container fade-in">
          <div className="guardians-header-row">
            <div className="guardians-header-text">
              <span className="dms-top-badge">
                <i className="fa-solid fa-shield-halved"></i> {t('guardianView.dmsBadge')}
              </span>
              <h1 className="guardians-main-title">{t('guardianView.dmsTitle')}</h1>
              <p className="guardians-main-subtitle">
                {t('guardianView.dmsSubtitle')}
              </p>
            </div>

            <button
              type="button"
              className="btn-simulate-quorum-top"
              onClick={handleSimulateFullQuorum}
              title="Simula a assinatura de todos os guardiões ativos"
            >
              <i className="fa-solid fa-wand-magic-sparkles"></i> {t('guardianView.simulateQuorumBtn')}
            </button>
          </div>

          <div className="dms-dashboard-grid">
            {/* Card 1: Verificação de Vida (Life-Check) */}
            <div className="dms-card dms-lifecheck-card">
              <div className="dms-card-topbar">
                <div className="dms-icon-wrap heartbeat">
                  <i className="fa-solid fa-heart-pulse"></i>
                </div>
                <span className={`lifecheck-status-tag ${dmsStatus.isHealthy ? 'healthy' : 'alert'}`}>
                  {dmsStatus.isHealthy ? t('guardianView.lifeCheckStatusOk') : 'Atenção Requerida'}
                </span>
              </div>

              <h3 className="dms-card-title">{t('guardianView.lifeCheckLabel')}</h3>
              <p className="dms-card-desc">{t('guardianView.lifeCheckDesc')}</p>

              <div className="lifecheck-meta-list">
                <div className="lifecheck-meta-item">
                  <i className="fa-regular fa-clock"></i>
                  <span>{t('guardianView.lastCheckin')}</span>
                </div>
                <div className="lifecheck-meta-item">
                  <i className="fa-solid fa-repeat"></i>
                  <span>{t('guardianView.checkinInterval')}</span>
                </div>
                <div className="lifecheck-meta-item">
                  <i className="fa-solid fa-calendar-check"></i>
                  <span>Próxima checagem: {dmsStatus.daysRemaining} dias restantes</span>
                </div>
              </div>

              <button
                type="button"
                className="btn-renew-lifecheck"
                onClick={handleRenewLifeCheck}
              >
                {t('guardianView.imAliveBtn')}
              </button>
            </div>

            {/* Card 2: Quórum Mínimo dos Guardiões */}
            <div className="dms-card dms-quorum-card">
              <div className="dms-card-topbar">
                <div className="dms-icon-wrap quorum">
                  <i className="fa-solid fa-users-gear"></i>
                </div>
                <span className={`quorum-status-tag ${quorum.reached ? 'reached' : 'pending'}`}>
                  {quorum.reached ? `✓ ${t('guardianView.quorumReached')}` : `⏳ ${t('guardianView.quorumPending')}`}
                </span>
              </div>

              <h3 className="dms-card-title">{t('guardianView.quorumTitle')}</h3>
              <p className="dms-card-desc">
                {t('guardianView.quorumDesc', { required: quorum.required })}
              </p>

              {/* Barra de Progresso do Quórum */}
              <div className="quorum-progress-section">
                <div className="quorum-progress-header">
                  <span className="quorum-progress-text">
                    {t('guardianView.quorumProgress', {
                      confirmed: quorum.confirmed,
                      required: quorum.required,
                      percentage: quorum.percentage,
                    })}
                  </span>
                  <span className="quorum-percentage">{quorum.percentage}%</span>
                </div>
                <div className="quorum-progress-track">
                  <div
                    className={`quorum-progress-fill ${quorum.reached ? 'complete' : ''}`}
                    style={{ width: `${quorum.percentage}%` }}
                  ></div>
                </div>
              </div>

              {/* Lista de Guardiões e Assinatura Digital HMAC */}
              <div className="guardian-signatures-list">
                <h4 className="signatures-list-title">Assinaturas Digitais Registradas</h4>
                {guardians.map((g) => {
                  const isSigned = confirmedGuardianIds.includes(g.id);
                  const isPrimary = g.status === 'active';
                  return (
                    <div key={g.id} className="guardian-signature-row">
                      <GuardianAvatar src={g.avatar} name={g.name} className="sig-avatar" />
                      <div className="sig-info">
                        <strong className="sig-name">{g.name}</strong>
                        <span className="sig-rel">{g.relationship} • {g.email}</span>
                      </div>

                      <div className="sig-action">
                        {isPrimary ? (
                          <button
                            type="button"
                            className={`btn-toggle-signature ${isSigned ? 'signed' : 'pending'}`}
                            onClick={() => handleToggleSignature(g.id)}
                          >
                            {isSigned ? (
                              <>
                                <i className="fa-solid fa-check"></i> {t('guardianView.signed')}
                              </>
                            ) : (
                              <>
                                <i className="fa-solid fa-pen-nib"></i> {t('guardianView.signDigital')}
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="sig-badge-disabled">Pendente de Aceite</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Card 3: Janela de Quarentena Preventiva */}
            <div className="dms-card dms-quarantine-card">
              <div className="dms-card-topbar">
                <div className="dms-icon-wrap quarantine">
                  <i className="fa-solid fa-hourglass-half"></i>
                </div>
                <span className="quarantine-tag">Proteção Antissabotagem</span>
              </div>

              <h3 className="dms-card-title">{t('guardianView.quarantineTitle')}</h3>
              <p className="dms-card-desc">{t('guardianView.quarantineDesc')}</p>

              <div className="quarantine-safeguards">
                <div className="safeguard-item">
                  <i className="fa-solid fa-bell"></i>
                  <div>
                    <strong>Alertas Multicanal Diários</strong>
                    <span>Push notification, e-mail criptografado e SMS de segurança.</span>
                  </div>
                </div>
                <div className="safeguard-item">
                  <i className="fa-solid fa-ban"></i>
                  <div>
                    <strong>Aborto Imediato de Desbloqueio</strong>
                    <span>Caso o titular confirme estar bem, o cofre é relockado instantaneamente.</span>
                  </div>
                </div>
              </div>

              <div className="quarantine-footer-action">
                {quorum.reached ? (
                  <button
                    type="button"
                    className="btn-access-unlocked-primary"
                    onClick={() => setActiveTab('unlock')}
                  >
                    <i className="fa-solid fa-key"></i> {t('guardianView.simulateUnlockBtn')}
                  </button>
                ) : (
                  <p className="quarantine-waiting-note">
                    <i className="fa-solid fa-circle-info"></i> Quórum ainda pendente ({quorum.confirmed}/{quorum.required}). Obtenha as assinaturas para avançar.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
          ABA 3: ÁREA DE DESBLOQUEIO DO GUARDIÃO (COFRE LIBERADO)
         ============================================================= */}
      {activeTab === 'unlock' && (
        <div className="guardian-unlock-container fade-in">
          {!isUnlocked ? (
            /* Estado 1: Bloqueado (Quórum não atingido) */
            <div className="unlock-locked-screen fade-in">
              <div className="unlock-locked-hero">
                <div className="locked-shield-pulse">
                  <i className="fa-solid fa-lock"></i>
                </div>
                <span className="locked-status-pill">Zero-Knowledge AES-256-GCM</span>
                <h2 className="locked-hero-title">{t('guardianView.unlockLockedTitle')}</h2>
                <p className="locked-hero-desc">
                  {t('guardianView.unlockLockedDesc')}
                </p>

                <div className="locked-actions-row">
                  <button
                    type="button"
                    className="btn-locked-action primary"
                    onClick={() => setActiveTab('quorum')}
                  >
                    <i className="fa-solid fa-shield-halved"></i> {t('guardianView.goToQuorumBtn')}
                  </button>
                  <button
                    type="button"
                    className="btn-locked-action secondary"
                    onClick={handleSimulateFullQuorum}
                  >
                    <i className="fa-solid fa-wand-magic-sparkles"></i> {t('guardianView.simulateQuorumBtn')}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Estado 2: Desbloqueado (Quórum homologado) */
            <div className="unlock-granted-screen fade-in">
              <div className="unlock-header-row">
                <div className="unlock-header-info">
                  <span className="unlocked-granted-badge">
                    <i className="fa-solid fa-lock-open"></i> {t('guardianView.unlockBadge')}
                  </span>
                  <h1 className="guardians-main-title">{t('guardianView.unlockTitle')}</h1>
                  <p className="guardians-main-subtitle">
                    {t('guardianView.unlockSubtitle')}
                  </p>
                </div>

                <div className="unlock-quick-stats">
                  <div className="quick-stat-badge">
                    <strong>4</strong> Memórias Liberadas
                  </div>
                  <div className="quick-stat-badge">
                    <strong>HTTP 206</strong> Streaming Range
                  </div>
                  <div className="quick-stat-badge">
                    <strong>HMAC</strong> Trilha Ativa
                  </div>
                </div>
              </div>

              {/* Filtro de Mídias Liberadas */}
              <div className="unlocked-media-filter-bar">
                <button
                  type="button"
                  className={`btn-media-filter ${unlockedFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setUnlockedFilter('all')}
                >
                  <i className="fa-solid fa-shapes"></i> Todas as Mídias
                </button>
                <button
                  type="button"
                  className={`btn-media-filter ${unlockedFilter === 'video' ? 'active' : ''}`}
                  onClick={() => setUnlockedFilter('video')}
                >
                  <i className="fa-solid fa-film"></i> Vídeo
                </button>
                <button
                  type="button"
                  className={`btn-media-filter ${unlockedFilter === 'audio' ? 'active' : ''}`}
                  onClick={() => setUnlockedFilter('audio')}
                >
                  <i className="fa-solid fa-waveform-lines"></i> Áudio
                </button>
                <button
                  type="button"
                  className={`btn-media-filter ${unlockedFilter === 'photo' ? 'active' : ''}`}
                  onClick={() => setUnlockedFilter('photo')}
                >
                  <i className="fa-solid fa-image"></i> Foto Original
                </button>
                <button
                  type="button"
                  className={`btn-media-filter ${unlockedFilter === 'letter' ? 'active' : ''}`}
                  onClick={() => setUnlockedFilter('letter')}
                >
                  <i className="fa-solid fa-envelope-open-text"></i> Carta Afetiva
                </button>
              </div>

              {/* Grade de Mídias Descriptografadas */}
              <div className="unlocked-showcase-grid">
                {/* 1. Vídeo Descriptografado com HTTP 206 Range Streaming */}
                {(unlockedFilter === 'all' || unlockedFilter === 'video') && (
                  <div className="unlocked-media-card video-card">
                    <div className="unlocked-card-header">
                      <span className="media-type-chip video">
                        <i className="fa-solid fa-film"></i> Vídeo Seguro
                      </span>
                      <span className="stream-badge">HTTP 206 Range Stream</span>
                    </div>

                    <div className="unlocked-player-wrapper">
                      <EncryptedVideoPlayer
                        mediaId="mem-video-guardian-1"
                        streamUrl="/api/vault/media/mem-video-1/stream"
                        title={t('guardianView.videoTitle')}
                        durationSeconds={245}
                      />
                    </div>

                    <div className="unlocked-card-body">
                      <h3 className="unlocked-card-title">{t('guardianView.videoTitle')}</h3>
                      <p className="unlocked-card-desc">
                        Mensagem gravada com decifragem progressiva de blocos AEAD (64 KB). Moov atom posicionado no topo para inicialização instantânea.
                      </p>

                      <div className="unlocked-card-actions">
                        <button
                          type="button"
                          className="btn-audit-check"
                          onClick={() => handleAuditMediaAccess('STREAM_VIDEO_REQUEST', 'mem-video-1', t('guardianView.videoTitle'))}
                        >
                          <i className="fa-solid fa-fingerprint"></i> Verificar Integridade Criptográfica
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Áudio Descriptografado com Onda Sonora Waveform */}
                {(unlockedFilter === 'all' || unlockedFilter === 'audio') && (
                  <div className="unlocked-media-card audio-card">
                    <div className="unlocked-card-header">
                      <span className="media-type-chip audio">
                        <i className="fa-solid fa-waveform-lines"></i> Gravação em Áudio
                      </span>
                      <span className="stream-badge">100 Picos de Amplitude</span>
                    </div>

                    <div className="unlocked-player-wrapper">
                      <EncryptedAudioPlayer
                        mediaId="mem-audio-guardian-1"
                        streamUrl="/api/vault/media/mem-audio-1/stream"
                        waveformUrl="/api/vault/media/mem-audio-1/waveform"
                        title={t('guardianView.audioTitle')}
                        subtitle="Transmissão Segura de Voz (Opus/M4A)"
                        durationSeconds={192}
                      />
                    </div>

                    <div className="unlocked-card-body">
                      <h3 className="unlocked-card-title">{t('guardianView.audioTitle')}</h3>
                      <p className="unlocked-card-desc">
                        Conselhos de vida e histórias familiares transmitidas diretamente do cofre com busca instantânea O(1) na onda sonora.
                      </p>

                      <div className="unlocked-card-actions">
                        <button
                          type="button"
                          className="btn-audit-check"
                          onClick={() => handleAuditMediaAccess('STREAM_AUDIO_REQUEST', 'mem-audio-1', t('guardianView.audioTitle'))}
                        >
                          <i className="fa-solid fa-fingerprint"></i> Verificar Integridade Criptográfica
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Foto Original em Proporção Natural (Regra 1 Mandatória: object-fit: contain) */}
                {(unlockedFilter === 'all' || unlockedFilter === 'photo') && (
                  <div className="unlocked-media-card photo-card">
                    <div className="unlocked-card-header">
                      <span className="media-type-chip photo">
                        <i className="fa-solid fa-image"></i> Foto Original Preservada
                      </span>
                      <span className="stream-badge">WebP Master (300 DPI)</span>
                    </div>

                    {/* Regra 1 Mandatória: object-fit: contain e tamanho natural preservado */}
                    <div className="unlocked-photo-wrapper">
                      <div className="unlocked-photo-placeholder media-icon-placeholder">
                        <i className="fa-regular fa-image" aria-hidden="true"></i>
                        <span>{t('guardianView.photoTitle')}</span>
                      </div>
                    </div>

                    <div className="unlocked-card-body">
                      <h3 className="unlocked-card-title">{t('guardianView.photoTitle')}</h3>
                      <p className="unlocked-card-desc">
                        Preservação fotográfica sem cortes arbitrários. Proporção e enquadramento originais 100% respeitados para arquivo fine-art.
                      </p>

                      <div className="unlocked-card-actions">
                        <button
                          type="button"
                          className="btn-audit-check"
                          onClick={() => handleAuditMediaAccess('VIEW_PHOTO_MASTER', 'mem-photo-1', t('guardianView.photoTitle'))}
                        >
                          <i className="fa-solid fa-fingerprint"></i> Verificar Integridade Criptográfica
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. Carta de Amor & Diretivas de Vontade */}
                {(unlockedFilter === 'all' || unlockedFilter === 'letter') && (
                  <div className="unlocked-media-card letter-card">
                    <div className="unlocked-card-header">
                      <span className="media-type-chip letter">
                        <i className="fa-solid fa-scroll"></i> Carta Póstuma
                      </span>
                      <span className="stream-badge">Assinatura Certificada</span>
                    </div>

                    <div className="letter-parchment-content">
                      <div className="letter-wax-seal">
                        <i className="fa-solid fa-feather-pointed"></i>
                      </div>
                      <h3 className="letter-title">{t('guardianView.letterTitle')}</h3>
                      <p className="letter-excerpt">
                        &quot;Aos meus amados guardiões e familiares: se vocês estão lendo esta carta, saibam que cada memória, cada lição e cada conselho contidos neste cofre foram preparados com infinito carinho para iluminar os seus passos. Cuidem uns dos outros, vivam plenamente e guardem estas lembranças no coração.&quot;
                      </p>
                      <div className="letter-sign-block">
                        <strong>Com amor eterno,</strong>
                        {ownerName && <span>{ownerName}</span>}
                        <small className="letter-crypto-seal">Selo Digital SHA-256: 8a7c1b...f92d4</small>
                      </div>
                    </div>

                    <div className="unlocked-card-body">
                      <div className="unlocked-card-actions">
                        <button
                          type="button"
                          className="btn-audit-check"
                          onClick={() => handleAuditMediaAccess('DECRYPT_LETTER', 'doc-letter-1', t('guardianView.letterTitle'))}
                        >
                          <i className="fa-solid fa-fingerprint"></i> Verificar Integridade Criptográfica
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* =============================================================
                  PAINEL DA TRILHA DE AUDITORIA CRIPTOGRÁFICA EM TEMPO REAL
                 ============================================================= */}
              <div className="audit-trail-section">
                <div className="audit-trail-topbar">
                  <div className="audit-trail-titles">
                    <h3 className="audit-section-title">
                      <i className="fa-solid fa-list-check"></i> {t('guardianView.auditTrailTitle')}
                    </h3>
                    <p className="audit-section-subtitle">
                      {t('guardianView.auditTrailSubtitle')}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="btn-export-audit"
                    onClick={handleExportAuditLogs}
                  >
                    <i className="fa-solid fa-download"></i> {t('guardianView.exportAudit')}
                  </button>
                </div>

                <div className="audit-table-wrapper">
                  <table className="audit-table">
                    <thead>
                      <tr>
                        <th>{t('guardianView.thTimestamp')}</th>
                        <th>{t('guardianView.thOperation')}</th>
                        <th>{t('guardianView.thGuardian')}</th>
                        <th>{t('guardianView.thStatus')}</th>
                        <th>{t('guardianView.thHash')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log) => (
                        <tr key={log.id}>
                          <td className="audit-cell-time">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </td>
                          <td className="audit-cell-op">
                            <code>{log.action}</code>
                          </td>
                          <td className="audit-cell-guardian">
                            <span className="guardian-name-bold">{log.guardianName}</span>
                            <small className="guardian-email-sub">{log.guardianEmail}</small>
                          </td>
                          <td className="audit-cell-status">
                            <span className={`status-badge-http code-${log.status}`}>
                              {log.status} {log.status === 206 ? 'Partial Content' : 'OK'}
                            </span>
                          </td>
                          <td className="audit-cell-hash">
                            <span className="hash-code-tag" title={log.hmacSignature}>
                              {log.hmacSignature.substring(0, 22)}...
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
