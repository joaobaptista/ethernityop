import React from 'react';
import './SelectPeopleGrid.css';

/**
 * SelectPeopleGrid — Step 2: "Pessoas que importam" (Seleção de rostos identificados)
 * Fiel ao design do Ethernity DMS:
 * • Header com estatísticas de fotos analisadas e pessoas identificadas
 * • Botão "Enviar Foto" no topo para alimentar mais fotos se desejado
 * • Grid com cards de pessoas, avatares recortados por IA e contagem de fotos
 * • Barra flutuante inferior com contador e botão de ação
 */
export default function SelectPeopleGrid({
  detectedPeopleList = [],
  selectedPeopleIds = [],
  onToggleSelect,
  totalPhotosAnalyzed = 0,
  isAnalyzing = false,
  onUploadMore,
  onSkip,
  onProceed,
  maxAllowed = 2,
  planName = 'Plano Free',
}) {
  return (
    <div className="people-discovery-container fade-in">
      {/* Header da Tela */}
      <div className="people-discovery-header">
        <div className="discovery-header-row">
          <div>
            <h1 className="discovery-title">Pessoas que importam</h1>
            <p className="discovery-subtitle">
              Identificamos os rostos mais presentes nas suas memórias. Dê um nome a cada pessoa e escolha para quem você gostaria de criar uma cápsula do tempo.
            </p>
          </div>
          {onUploadMore && (
            <button
              type="button"
              className="btn-upload-direct"
              onClick={onUploadMore}
            >
              <i className="fa-solid fa-cloud-arrow-up"></i>
              <span>Enviar Foto</span>
            </button>
          )}
        </div>

        <div className="discovery-stats-badge">
          <i className="fa-solid fa-book-open discovery-book-icon"></i>
          <span className="stats-main">
            {totalPhotosAnalyzed === 1
              ? '1 foto analisada'
              : `${totalPhotosAnalyzed} fotos analisadas`}
          </span>
          <span className="stats-dot">•</span>
          <span className="stats-highlight">
            {detectedPeopleList.length === 1
              ? '1 pessoa identificada'
              : `${detectedPeopleList.length} pessoas identificadas`}
          </span>
        </div>
      </div>

      {/* Grid de Pessoas com Seleção e Avatares Recortados por IA */}
      {isAnalyzing ? (
        <div className="analyzing-faces-box">
          <div className="analyzing-spinner" />
          <h3 className="analyzing-title">Identificando pessoas nas memórias...</h3>
          <p className="analyzing-subtitle">
            Processando detecção facial privada via inteligência artificial local com zero envio para a nuvem.
          </p>
        </div>
      ) : detectedPeopleList.length === 0 ? (
        <div className="no-people-box">
          <i className="fa-solid fa-users-viewfinder no-people-icon"></i>
          <h3 className="no-people-title">Nenhum rosto identificado ainda</h3>
          <p className="no-people-desc">
            Envie uma foto de alguém especial ou com rostos nítidos para criar as cápsulas individuais automaticamente.
          </p>
          {onUploadMore && (
            <button
              type="button"
              className="btn-upload-direct primary"
              style={{ marginTop: '12px' }}
              onClick={onUploadMore}
            >
              <i className="fa-solid fa-cloud-arrow-up"></i>
              <span>Enviar Foto com Rosto</span>
            </button>
          )}
        </div>
      ) : (
        <div className="people-faces-grid">
          {detectedPeopleList.map((person) => {
            const isSelected = selectedPeopleIds.includes(person.id);
            const countLabel = person.totalCount
              ? person.totalCount === 1
                ? '1 foto'
                : `${person.totalCount} fotos`
              : person.photosCount || '1 foto';

            return (
              <div
                key={person.id}
                className={`person-face-card ${isSelected ? 'selected' : ''}`}
                onClick={() => onToggleSelect && onToggleSelect(person.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onToggleSelect && onToggleSelect(person.id)}
              >
                <div className="face-card-top">
                  <img
                    src={person.avatar}
                    alt={person.name}
                    className="face-avatar-img"
                  />
                  <div className={`face-check-circle ${isSelected ? 'checked' : ''}`}>
                    {isSelected && <i className="fa-solid fa-check"></i>}
                  </div>
                </div>

                <div className="face-card-bottom">
                  <span className="face-photos-count">{countLabel}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Barra Flutuante de Ação no Rodapé com Limite do Plano */}
      <div className="people-discovery-action-bar">
        <div className="selected-count-label">
          <span className="count-red-dot"></span>
          <span className="count-text">
            <strong>
              {selectedPeopleIds.length === 1
                ? '1 pessoa selecionada'
                : `${selectedPeopleIds.length} pessoas selecionadas`}
            </strong>
            <span className="plan-limit-text">
              (Limite do seu {planName}: até {maxAllowed})
            </span>
          </span>
        </div>

        <div className="action-bar-buttons">
          {onSkip && (
            <button
              type="button"
              className="btn-skip-discovery"
              onClick={onSkip}
            >
              Pular por agora
            </button>
          )}

          <button
            type="button"
            className="btn-create-selected"
            onClick={onProceed}
            disabled={selectedPeopleIds.length === 0}
          >
            Criar Cápsulas Selecionadas
          </button>
        </div>
      </div>
    </div>
  );
}
