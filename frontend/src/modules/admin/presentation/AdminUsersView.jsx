import React, { useState, useEffect, useCallback } from 'react';
import adminRepository from '../infrastructure/adminRepository.js';
import { getUserInitials, getAbsolutePhotoUrl } from '../../profile/domain/profileModel.js';
import { useI18n } from '../../../core/i18n/presentation/useI18n.js';
import NotificationBell from '../../../core/components/NotificationBell.jsx';
import './AdminView.css';

export default function AdminUsersView({
  token,
  profile,
  onNavigateTab,
  showToast,
  onSwitchMode,
}) {
  const { t } = useI18n();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all'); // 'all', 'admin', 'user'
  const [processingId, setProcessingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);

  const isUserEligibleForBatch = useCallback((u) => {
    if (!u) return false;
    const isRoot =
      u.is_root_admin ||
      u.email === 'demo@ethernity.com' ||
      u.email === 'vameri@gmail.com';
    const isAdmin = u.is_admin === 1 || Boolean(u.is_admin);
    const isSelf = (profile?.id && profile.id === u.id) || (profile?.email && profile.email === u.email);
    return !isRoot && !isAdmin && !isSelf;
  }, [profile]);

  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await adminRepository.listUsers(token, {
        search,
        role: filterRole,
      });
      setUsers(res.users || []);
    } catch (err) {
      if (showToast) showToast(err.message || 'Erro ao carregar usuários.');
    } finally {
      setIsLoading(false);
    }
  }, [token, search, filterRole, showToast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchUsers]);

  // Usuários elegíveis para seleção em lote (usuários comuns, excluindo Admins, Root e Self)
  const eligibleUsers = users.filter(isUserEligibleForBatch);
  const eligibleIds = eligibleUsers.map((u) => u.id);
  const selectedEligibleCount = selectedIds.filter((id) => eligibleIds.includes(id)).length;
  const allEligibleSelected = eligibleUsers.length > 0 && selectedEligibleCount === eligibleUsers.length;
  const isIndeterminate = selectedIds.length > 0 && !allEligibleSelected;

  const handleToggleSelectAllNonAdmins = () => {
    if (allEligibleSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(eligibleUsers.map((u) => u.id));
    }
  };

  const handleToggleSelectOne = (userId) => {
    setSelectedIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;

    const count = selectedIds.length;
    const confirmMsg =
      t('admin.confirmBatchDelete', { count }) ||
      `Tem certeza de que deseja excluir permanentemente ${count} usuário(s) selecionado(s)?\n\nEsta ação é irreversível e expurgará definitivamente todas as memórias, mídias e dados destes usuários.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      setIsBatchDeleting(true);
      const res = await adminRepository.batchDeleteUsers(token, selectedIds);
      const deletedCount = res?.deletedCount || count;

      if (showToast) {
        showToast(
          res?.message ||
          t('admin.batchDeleteSuccess', { count: deletedCount }) ||
          `${deletedCount} usuário(s) excluído(s) permanentemente com sucesso!`
        );
      }

      const deletedSet = new Set(selectedIds);
      setUsers((prev) => prev.filter((u) => !deletedSet.has(u.id)));
      setSelectedIds([]);
    } catch (err) {
      if (showToast) {
        showToast(
          t('admin.batchDeleteError', { error: err.message }) ||
          `Erro ao excluir usuários em lote: ${err.message}`
        );
      }
    } finally {
      setIsBatchDeleting(false);
    }
  };

  const handleToggleAdmin = async (targetUser) => {
    const willBeAdmin = !targetUser.is_admin;
    const confirmMsg = willBeAdmin
      ? t('admin.confirmMakeAdmin', { name: targetUser.name || targetUser.email })
      : t('admin.confirmRemoveAdmin', { name: targetUser.name || targetUser.email });

    if (!window.confirm(confirmMsg || 'Confirmar alteração de permissão?')) {
      return;
    }

    try {
      setProcessingId(targetUser.id);
      const res = await adminRepository.setUserAdminRole(token, targetUser.id, willBeAdmin);
      if (showToast) {
        showToast(res.message || t('admin.roleChangeSuccess') || 'Permissão alterada com sucesso!');
      }
      // Atualizar lista localmente
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, is_admin: willBeAdmin ? 1 : 0 } : u))
      );
    } catch (err) {
      if (showToast) {
        showToast(t('admin.roleChangeError', { error: err.message }) || `Erro: ${err.message}`);
      }
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteUser = async (targetUser) => {
    const isRootTarget =
      targetUser.is_root_admin ||
      targetUser.email === 'demo@ethernity.com' ||
      targetUser.email === 'vameri@gmail.com';

    if (isRootTarget) {
      if (showToast) showToast(t('admin.cannotDeleteRoot') || 'O administrador principal (Root) é estritamente protegido e não pode ser excluído.');
      return;
    }

    const isSelf = (profile?.id && profile.id === targetUser.id) || (profile?.email && profile.email === targetUser.email);
    if (isSelf) {
      if (showToast) showToast(t('admin.cannotDeleteSelf') || 'Você não pode excluir sua própria conta nesta lista.');
      return;
    }

    const confirmMsg =
      t('admin.confirmDeleteUser', { name: targetUser.name || targetUser.email }) ||
      `Tem certeza de que deseja excluir permanentemente o usuário "${targetUser.name || targetUser.email}"?\n\nEsta ação é irreversível e expurgará definitivamente todas as memórias, mídias e dados deste usuário.`;

    if (!window.confirm(confirmMsg)) {
      return;
    }

    try {
      setProcessingId(targetUser.id);
      const res = await adminRepository.deleteUser(token, targetUser.id);
      if (showToast) {
        showToast(res?.message || t('admin.userDeletedSuccess') || 'Usuário excluído com sucesso!');
      }
      setUsers((prev) => prev.filter((u) => u.id !== targetUser.id));
      setSelectedIds((prev) => prev.filter((id) => id !== targetUser.id));
    } catch (err) {
      if (showToast) {
        showToast(t('admin.userDeletedError', { error: err.message }) || `Erro ao excluir usuário: ${err.message}`);
      }
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="admin-screen-wrapper fade-in">
      <div className="admin-screen-container">
        {/* Cabeçalho */}
        <div className="admin-top-bar">
          <div>
            <span className="admin-badge-pill">
              <i className="fa-solid fa-shield-halved"></i>
              {t('admin.modeAdminBadge') || 'MODO ADMINISTRADOR'}
            </span>
            <h1 className="admin-main-title">{t('admin.usersTitle') || 'Gestão Geral de Usuários'}</h1>
            <p className="admin-main-subtitle">
              {t('admin.usersSubtitle') ||
                'Visualize todos os usuários cadastrados na plataforma, gerencie perfis e conceda ou revogue privilégios de administrador.'}
            </p>
          </div>

          <div className="admin-top-actions">
            <button
              type="button"
              className="btn-switch-mode-outline"
              onClick={() => onSwitchMode && onSwitchMode('personal')}
              title={t('admin.switchToUser') || 'Voltar ao Modo Pessoal'}
            >
              <i className="fa-solid fa-arrow-left"></i>
              <span>{t('admin.switchToUser') || 'Voltar ao Modo Pessoal'}</span>
            </button>
            <NotificationBell onNavigateTab={onNavigateTab} />
          </div>
        </div>

        {/* Barra de Filtros, Busca e Ações em Lote */}
        <div className="admin-toolbar-card">
          <div className="admin-search-wrapper">
            <i className="fa-solid fa-magnifying-glass"></i>
            <input
              type="text"
              className="admin-search-input"
              placeholder={t('admin.searchPlaceholder') || 'Buscar por nome, e-mail ou telefone...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            )}
          </div>

          <div className="admin-filter-tabs">
            <button
              type="button"
              className={`admin-filter-btn ${filterRole === 'all' ? 'active' : ''}`}
              onClick={() => setFilterRole('all')}
            >
              {t('admin.filterAll') || 'Todos os Usuários'}
            </button>
            <button
              type="button"
              className={`admin-filter-btn ${filterRole === 'admin' ? 'active' : ''}`}
              onClick={() => setFilterRole('admin')}
            >
              <i className="fa-solid fa-crown" style={{ marginRight: 6 }}></i>
              {t('admin.filterAdmins') || 'Administradores'}
            </button>
            <button
              type="button"
              className={`admin-filter-btn ${filterRole === 'user' ? 'active' : ''}`}
              onClick={() => setFilterRole('user')}
            >
              {t('admin.filterStandard') || 'Usuários Padrão'}
            </button>
          </div>

          <div className="admin-batch-toolbar-actions">
            <button
              type="button"
              className={`btn-select-all-non-admins ${allEligibleSelected ? 'all-selected' : ''}`}
              onClick={handleToggleSelectAllNonAdmins}
              disabled={eligibleUsers.length === 0}
              title={
                allEligibleSelected
                  ? t('admin.deselectAll') || 'Desmarcar todos'
                  : t('admin.selectAllNonAdmins') || 'Selecionar todos (exceto admins)'
              }
            >
              <i className={allEligibleSelected ? 'fa-solid fa-square-check' : 'fa-regular fa-square-check'}></i>
              <span>
                {allEligibleSelected
                  ? t('admin.deselectAll') || 'Desmarcar todos'
                  : t('admin.selectAllNonAdmins') || 'Selecionar todos (exceto admins)'}
              </span>
              <span className="eligible-pill" title={`${eligibleUsers.length} usuários comuns elegíveis`}>
                {eligibleUsers.length}
              </span>
            </button>
          </div>
        </div>

        {/* Barra Flutuante de Ações em Lote */}
        {selectedIds.length > 0 && (
          <div className="admin-bulk-bar slide-up">
            <div className="admin-bulk-info">
              <span className="admin-bulk-badge">
                <i className="fa-solid fa-check"></i>
                {selectedIds.length}
              </span>
              <span className="admin-bulk-text">
                {t('admin.selectedUsersCount', { count: selectedIds.length }) || `${selectedIds.length} selecionado(s)`}
              </span>
            </div>

            <div className="admin-bulk-actions">
              <button
                type="button"
                className="btn-bulk-cancel"
                onClick={() => setSelectedIds([])}
                disabled={isBatchDeleting}
              >
                <i className="fa-solid fa-xmark"></i>
                <span>{t('admin.deselectAll') || 'Desmarcar'}</span>
              </button>

              <button
                type="button"
                className="btn-bulk-delete"
                onClick={handleBatchDelete}
                disabled={isBatchDeleting}
              >
                {isBatchDeleting ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin"></i>
                    <span>{t('common.processing') || 'Excluindo...'}</span>
                  </>
                ) : (
                  <>
                    <i className="fa-regular fa-trash-can"></i>
                    <span>{t('admin.deleteSelected') || 'Excluir Selecionados'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Tabela de Usuários */}
        <div className="admin-table-card">
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: 44, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      className="admin-checkbox"
                      checked={allEligibleSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = isIndeterminate;
                      }}
                      onChange={handleToggleSelectAllNonAdmins}
                      disabled={eligibleUsers.length === 0}
                      title={
                        allEligibleSelected
                          ? t('admin.deselectAll') || 'Desmarcar todos'
                          : t('admin.selectAllNonAdmins') || 'Selecionar todos (exceto admins)'
                      }
                      aria-label={t('admin.selectAllNonAdmins') || 'Selecionar todos (exceto admins)'}
                    />
                  </th>
                  <th>{t('admin.userColName') || 'Usuário & Contato'}</th>
                  <th>{t('admin.userColPlan') || 'Plano'}</th>
                  <th>{t('admin.userColRole') || 'Nível de Acesso'}</th>
                  <th>{t('admin.userColActions') || 'Ações'}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '40px' }}>
                      <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 24, color: '#EE5945' }}></i>
                      <div style={{ marginTop: 10, color: '#64748b', fontSize: 13 }}>
                        {t('common.loading') || 'Carregando usuários...'}
                      </div>
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                      {t('common.emptyList') || 'Nenhum usuário encontrado com os filtros atuais.'}
                    </td>
                  </tr>
                ) : (
                  users.map((u) => {
                    const avatar = getAbsolutePhotoUrl(u.avatar_url || u.photo_url || u.avatar);
                    const isRoot =
                      u.is_root_admin ||
                      u.email === 'demo@ethernity.com' ||
                      u.email === 'vameri@gmail.com';
                    const isSelf = (profile?.id && profile.id === u.id) || (profile?.email && profile.email === u.email);
                    const isProcessing = processingId === u.id;
                    const isEligible = isUserEligibleForBatch(u);
                    const isSelected = selectedIds.includes(u.id);

                    return (
                      <tr key={u.id} className={isSelected ? 'row-selected' : ''}>
                        <td style={{ textAlign: 'center' }}>
                          {isEligible ? (
                            <input
                              type="checkbox"
                              className="admin-checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectOne(u.id)}
                              aria-label={u.name || u.email}
                            />
                          ) : (
                            <span
                              className="admin-checkbox-locked"
                              title={
                                isRoot
                                  ? t('admin.rootAdminNotice') || 'Root Admin'
                                  : u.is_admin
                                  ? t('admin.protectedAdminNotice') || 'Admin Protegido'
                                  : t('admin.currentUserBadge') || 'Sua Conta'
                              }
                            >
                              <i className="fa-solid fa-shield-halved"></i>
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="admin-user-cell">
                            {avatar ? (
                              <img
                                src={avatar}
                                alt={u.name}
                                className="admin-user-avatar"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="admin-user-initials">
                                {getUserInitials(u.name || u.email)}
                              </div>
                            )}
                            <div className="admin-user-meta">
                              <span className="admin-user-name">
                                {u.name || 'Usuário Sem Nome'}
                                {isRoot && (
                                  <span style={{ marginLeft: 6, color: '#EE5945', fontSize: 12 }} title="Admin Root">
                                    <i className="fa-solid fa-circle-check"></i>
                                  </span>
                                )}
                              </span>
                              <span className="admin-user-email">{u.email}</span>
                              {u.phone && <span className="admin-user-phone">{u.phone}</span>}
                            </div>
                          </div>
                        </td>

                        <td>
                          <span className="admin-plan-tag">
                            {u.plan || (u.plan_id === 'infinity' ? 'Plano Infinity' : 'Gratuito')}
                          </span>
                        </td>

                        <td>
                          {isRoot ? (
                            <span className="admin-badge-role root">
                              <i className="fa-solid fa-shield-halved"></i>
                              {t('admin.rootAdminNotice') || 'Root Admin'}
                            </span>
                          ) : u.is_admin ? (
                            <span className="admin-badge-role admin">
                              <i className="fa-solid fa-crown"></i>
                              {t('admin.roleAdmin') || 'Administrador'}
                            </span>
                          ) : (
                            <span className="admin-badge-role user">
                              <i className="fa-regular fa-user"></i>
                              {t('admin.roleStandard') || 'Usuário'}
                            </span>
                          )}
                        </td>

                        <td>
                          <div className="admin-actions-cell">
                            {isRoot ? (
                              <span className="admin-root-text">
                                {t('admin.rootAdminNotice') || 'Admin Principal (Root)'}
                              </span>
                            ) : isSelf ? (
                              <span className="admin-self-badge">
                                <i className="fa-solid fa-user-check"></i>
                                {t('admin.currentUserBadge') || 'Sua Conta'}
                              </span>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className={`admin-action-btn ${u.is_admin ? 'demote' : 'promote'}`}
                                  onClick={() => handleToggleAdmin(u)}
                                  disabled={isProcessing}
                                  title={u.is_admin ? t('admin.removeAdmin') : t('admin.makeAdmin')}
                                >
                                  {isProcessing ? (
                                    <i className="fa-solid fa-spinner fa-spin"></i>
                                  ) : u.is_admin ? (
                                    <>
                                      <i className="fa-solid fa-user-minus"></i>
                                      <span>{t('admin.removeAdmin') || 'Revogar Admin'}</span>
                                    </>
                                  ) : (
                                    <>
                                      <i className="fa-solid fa-crown"></i>
                                      <span>{t('admin.makeAdmin') || 'Tornar Admin'}</span>
                                    </>
                                  )}
                                </button>

                                <button
                                  type="button"
                                  className="admin-action-btn delete"
                                  onClick={() => handleDeleteUser(u)}
                                  disabled={isProcessing}
                                  title={t('admin.deleteUser') || 'Excluir Usuário'}
                                >
                                  {isProcessing ? (
                                    <i className="fa-solid fa-spinner fa-spin"></i>
                                  ) : (
                                    <>
                                      <i className="fa-regular fa-trash-can"></i>
                                      <span>{t('admin.deleteUser') || 'Excluir'}</span>
                                    </>
                                  )}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
