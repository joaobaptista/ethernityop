import React from 'react';
import './UploadProgressModal.css';

export default function UploadProgressModal({
  isOpen,
  files = [],
  overallProgress = 0,
  isProcessing = true,
  onClose,
}) {
  if (!isOpen) return null;

  const completedCount = files.filter((f) => f.status === 'completed').length;
  const totalCount = files.length;
  const isFinished = !isProcessing && completedCount === totalCount;

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 KB';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="upload-progress-overlay" onClick={isFinished ? onClose : undefined}>
      <div
        className="upload-progress-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header do Modal */}
        <div className="upload-progress-header">
          <div className="upload-header-left">
            <div className={`upload-header-icon ${isFinished ? 'is-success' : 'is-uploading'}`}>
              <i className={isFinished ? 'fa-solid fa-check' : 'fa-solid fa-shield-halved'}></i>
            </div>
            <div>
              <h3 className="upload-header-title">
                {isFinished ? 'Upload e Criptografia Concluídos' : 'Criptografando & Enviando Fotos'}
              </h3>
              <span className="upload-header-subtitle">
                {isFinished
                  ? `${totalCount} arquivo(s) processado(s) com sucesso com AES-256`
                  : `Processando ${completedCount} de ${totalCount} arquivo(s)...`}
              </span>
            </div>
          </div>
          {isFinished && (
            <button
              type="button"
              className="upload-close-btn"
              onClick={onClose}
              aria-label="Fechar"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          )}
        </div>

        {/* Barra de Progresso Global */}
        <div className="upload-overall-section">
          <div className="upload-overall-meta">
            <span className="upload-overall-label">Progresso Geral</span>
            <span className="upload-overall-percent">{Math.round(overallProgress)}%</span>
          </div>
          <div className="upload-progress-track">
            <div
              className={`upload-progress-fill ${isFinished ? 'is-complete' : ''}`}
              style={{ width: `${Math.min(100, Math.max(0, overallProgress))}%` }}
            ></div>
          </div>
        </div>

        {/* Lista de Arquivos com status individual */}
        <div className="upload-files-list">
          {files.map((file) => (
            <div key={file.id} className={`upload-file-item status-${file.status}`}>
              {/* Preview Thumbnail / Ícone */}
              <div className="upload-file-preview">
                {file.preview ? (
                  <img src={file.preview} alt={file.name} className="upload-thumb-img" />
                ) : (
                  <div className="upload-thumb-placeholder">
                    <i className="fa-regular fa-image"></i>
                  </div>
                )}
              </div>

              {/* Informações do Arquivo e Barra de Progresso Individual */}
              <div className="upload-file-info">
                <div className="upload-file-name-row">
                  <span className="upload-file-name" title={file.name}>
                    {file.name}
                  </span>
                  <span className="upload-file-size">{formatFileSize(file.size)}</span>
                </div>

                {/* Barra individual de cada arquivo */}
                <div className="upload-item-track">
                  <div
                    className={`upload-item-fill ${file.status === 'completed' ? 'is-complete' : ''}`}
                    style={{ width: `${file.progress || 0}%` }}
                  ></div>
                </div>

                <div className="upload-item-status-row">
                  <span className="upload-item-status-text">
                    {file.status === 'completed' && (
                      <>
                        <i className="fa-solid fa-circle-check"></i> Criptografado & Salvo
                      </>
                    )}
                    {file.status === 'uploading' && (
                      <>
                        <i className="fa-solid fa-circle-notch fa-spin"></i> Criptografando AES-256... ({file.progress}%)
                      </>
                    )}
                    {file.status === 'pending' && (
                      <>
                        <i className="fa-regular fa-clock"></i> Aguardando na fila...
                      </>
                    )}
                    {file.status === 'error' && (
                      <>
                        <i className="fa-solid fa-circle-exclamation"></i> Falha no upload
                      </>
                    )}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer do Modal */}
        <div className="upload-progress-footer">
          <div className="upload-security-badge">
            <i className="fa-solid fa-lock"></i>
            <span>Criptografia E2EE ponta a ponta no seu dispositivo</span>
          </div>
          {isFinished ? (
            <button type="button" className="btn-upload-done" onClick={onClose}>
              <i className="fa-solid fa-users-viewfinder"></i>
              <span>Identificar Rostos e Criar Cápsulas</span>
            </button>
          ) : (
            <div className="upload-processing-pill">
              <i className="fa-solid fa-spinner fa-spin"></i>
              <span>Processando localmente...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
