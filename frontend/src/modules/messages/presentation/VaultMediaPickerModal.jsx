import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import vaultService from '../../vault/application/vaultService.js';
import EncryptedImage from '../../../core/components/EncryptedImage.jsx';
import { useI18n } from '../../../core/i18n/presentation/useI18n.js';
import './VaultMediaPickerModal.css';

const MEDIA_FILTERS = [
  { id: 'all', label: 'Todas as Mídias', icon: 'fa-solid fa-layer-group' },
  { id: 'photo', label: 'Fotos', icon: 'fa-regular fa-image' },
  { id: 'video', label: 'Vídeos', icon: 'fa-solid fa-video' },
  { id: 'audio', label: 'Áudios & Voz', icon: 'fa-solid fa-microphone-lines' },
];

export function filterVaultMedia(items = [], filter = 'all', query = '') {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => {
    const itemType = (item.type || '').toLowerCase();
    const matchesType =
      filter === 'all' ||
      (filter === 'photo' && (itemType === 'photo' || itemType === 'image')) ||
      (filter === 'video' && itemType === 'video') ||
      (filter === 'audio' && itemType === 'audio');

    if (!matchesType) return false;

    if (!query || !query.trim()) return true;
    const q = query.toLowerCase().trim();
    const titleMatch = (item.title || item.name || '').toLowerCase().includes(q);
    const recipientMatch = (item.recipient || '').toLowerCase().includes(q);
    const categoryMatch = (item.category || '').toLowerCase().includes(q);
    return titleMatch || recipientMatch || categoryMatch;
  });
}

export default function VaultMediaPickerModal({
  isOpen,
  onClose,
  onSelect,
  alreadySelectedIds = [],
  title = 'Biblioteca do Cofre Criptografado',
}) {
  const { t } = useI18n();
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  // Inicializar seleção quando o modal abrir
  useEffect(() => {
    if (isOpen) {
      setSelectedIds([...alreadySelectedIds]);
      loadVaultItems();
    }
  }, [isOpen, alreadySelectedIds]);

  // Carregar itens do repositório/serviço do cofre
  const loadVaultItems = async () => {
    setIsLoading(true);
    try {
      const vaultItems = await vaultService.getItems();
      setItems(vaultItems || []);
    } catch (err) {
      console.warn('[VaultMediaPickerModal] Erro ao carregar itens do cofre:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Fechar com tecla Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Filtragem e busca
  const filteredItems = useMemo(() => {
    return filterVaultMedia(items, activeFilter, searchQuery);
  }, [items, activeFilter, searchQuery]);

  const toggleSelect = (itemId) => {
    setSelectedIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const handleSelectAllVisible = () => {
    const visibleIds = filteredItems.map((i) => i.id);
    const allSelected = visibleIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleConfirm = () => {
    const chosenItems = items.filter((item) => selectedIds.includes(item.id));
    if (onSelect) {
      onSelect(chosenItems);
    }
    onClose();
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="vmp-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="vmp-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="vmp-header">
          <div className="vmp-header-left">
            <div className="vmp-badge-icon">
              <i className="fa-solid fa-shield-halved"></i>
            </div>
            <div>
              <h3 className="vmp-title">{title}</h3>
              <p className="vmp-subtitle">
                Anexe memórias, áudios e depoimentos com preservação e criptografia AES-256
              </p>
            </div>
          </div>
          <button
            type="button"
            className="vmp-btn-close"
            onClick={onClose}
            aria-label={t('common.close', 'Fechar')}
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Toolbar: Filtros & Busca */}
        <div className="vmp-toolbar">
          <div className="vmp-filter-tabs">
            {MEDIA_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`vmp-tab-btn ${activeFilter === f.id ? 'active' : ''}`}
                onClick={() => setActiveFilter(f.id)}
              >
                <i className={f.icon}></i>
                <span>{f.label}</span>
              </button>
            ))}
          </div>

          <div className="vmp-search-box">
            <i className="fa-solid fa-magnifying-glass"></i>
            <input
              type="text"
              placeholder="Buscar por título, categoria ou destinatário..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="vmp-search-clear"
                onClick={() => setSearchQuery('')}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            )}
          </div>
        </div>

        {/* Status Bar / Ações Rápidas */}
        <div className="vmp-subbar">
          <span className="vmp-count-text">
            Exibindo {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'itens'} no cofre
          </span>
          {filteredItems.length > 0 && (
            <button
              type="button"
              className="vmp-btn-text"
              onClick={handleSelectAllVisible}
            >
              {filteredItems.every((i) => selectedIds.includes(i.id))
                ? 'Desmarcar visíveis'
                : 'Selecionar visíveis'}
            </button>
          )}
        </div>

        {/* Grid de Itens */}
        <div className="vmp-grid-container">
          {isLoading ? (
            <div className="vmp-loading-state">
              <i className="fa-solid fa-circle-notch fa-spin"></i>
              <span>Carregando itens do cofre seguro...</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="vmp-empty-state">
              <div className="vmp-empty-icon">
                <i className="fa-solid fa-box-open"></i>
              </div>
              <h4>Nenhuma mídia encontrada</h4>
              <p>
                {searchQuery
                  ? 'Nenhum resultado corresponde à sua pesquisa.'
                  : 'Grave áudios ou vídeos pelo estúdio para guardar memórias no seu cofre.'}
              </p>
            </div>
          ) : (
            <div className="vmp-grid">
              {filteredItems.map((item) => {
                const isSelected = selectedIds.includes(item.id);
                const type = (item.type || '').toLowerCase();
                const isImage = type === 'photo' || type === 'image';
                const isVideo = type === 'video';
                const isAudio = type === 'audio';

                return (
                  <div
                    key={item.id}
                    className={`vmp-item-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleSelect(item.id)}
                  >
                    {/* Checkbox Indicador */}
                    <div className="vmp-checkbox-wrapper">
                      <div className={`vmp-checkbox ${isSelected ? 'checked' : ''}`}>
                        {isSelected && <i className="fa-solid fa-check"></i>}
                      </div>
                    </div>

                    {/* Preview da Mídia com contain estrito */}
                    <div className="vmp-card-media-preview">
                      {isImage && (item.previewUrl || item.thumbUrl || item.mediaUrl) ? (
                        <div className="vmp-img-contain-box">
                          <EncryptedImage
                            src={item.thumbUrl || item.previewUrl || item.mediaUrl}
                            alt={item.title}
                            className="vmp-contain-img"
                          />
                        </div>
                      ) : isVideo ? (
                        <div className="vmp-video-preview-box">
                          {item.posterUrl ? (
                            <img
                              src={item.posterUrl}
                              alt={item.title}
                              className="vmp-poster-img"
                            />
                          ) : (
                            <div className="vmp-video-icon-art">
                              <i className="fa-solid fa-film"></i>
                            </div>
                          )}
                          <div className="vmp-play-badge">
                            <i className="fa-solid fa-play"></i>
                          </div>
                        </div>
                      ) : isAudio ? (
                        <div className="vmp-audio-preview-box">
                          <div className="vmp-audio-waveform-art">
                            <i className="fa-solid fa-waveform"></i>
                          </div>
                          <div className="vmp-audio-mic-badge">
                            <i className="fa-solid fa-microphone"></i>
                          </div>
                        </div>
                      ) : (
                        <div className="vmp-fallback-icon-box">
                          <i className="fa-solid fa-file-shield"></i>
                        </div>
                      )}

                      {/* Badge de Duração / Tipo */}
                      <div className="vmp-type-chip">
                        <i
                          className={
                            isImage
                              ? 'fa-regular fa-image'
                              : isVideo
                              ? 'fa-solid fa-video'
                              : 'fa-solid fa-microphone'
                          }
                        ></i>
                        <span>{item.duration || item.size || 'Cofre'}</span>
                      </div>
                    </div>

                    {/* Conteúdo e Metadados do Card */}
                    <div className="vmp-card-meta">
                      <h4 className="vmp-card-title" title={item.title || item.name}>
                        {item.title || item.name || 'Memória no Cofre'}
                      </h4>
                      <div className="vmp-card-details">
                        <span className="vmp-meta-tag">
                          <i className="fa-solid fa-tag"></i>
                          {item.category || (isAudio ? 'Depoimento' : isVideo ? 'Vídeo' : 'Memória')}
                        </span>
                        {item.recipient && (
                          <span className="vmp-meta-recipient">
                            <i className="fa-solid fa-heart"></i>
                            {item.recipient}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="vmp-footer">
          <div className="vmp-footer-info">
            <span className="vmp-selected-badge">
              <i className="fa-solid fa-check-double"></i>
              {selectedIds.length} {selectedIds.length === 1 ? 'mídia selecionada' : 'mídias selecionadas'}
            </span>
          </div>
          <div className="vmp-footer-buttons">
            <button type="button" className="vmp-btn-cancel" onClick={onClose}>
              {t('common.cancel', 'Cancelar')}
            </button>
            <button
              type="button"
              className="vmp-btn-confirm"
              onClick={handleConfirm}
              disabled={selectedIds.length === 0}
            >
              <i className="fa-solid fa-paperclip"></i>
              <span>Anexar Selecionados ({selectedIds.length})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
}
