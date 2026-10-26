import React, { useState, useRef, useEffect } from 'react';
import messagesRepository from '../infrastructure/messagesRepository.js';
import localVaultService from '../../../core/services/localVaultService.js';
import localAiService from '../../../core/services/localAiService.js';
import RichTextEditor from '../../../core/components/RichTextEditor.jsx';
import useAutoSaveDraft from '../../../core/hooks/useAutoSaveDraft.js';
import VaultMediaPickerModal from './VaultMediaPickerModal.jsx';
import './NewMessageView.css';

export default function NewMessageView({ onNavigateTab, capsuleId = null, recipientName = 'Destinatário', onBack }) {
  // Passos: 1 = Ideação, 2 = Entrega
  const [step, setStep] = useState(1);

  // Estados dos Campos
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiDetails, setAiDetails] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [isVaultPickerOpen, setIsVaultPickerOpen] = useState(false);
  const [vaultAttachments, setVaultAttachments] = useState([]);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isSavingMessage, setIsSavingMessage] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Estado da IA Local na Máquina do Usuário
  const [isLocalAiEnabled, setIsLocalAiEnabled] = useState(localAiService.isLocalAiEnabled());
  const [localAiProgress, setLocalAiProgress] = useState(0);
  const [localAiText, setLocalAiText] = useState('');
  const [isLocalAiLoading, setIsLocalAiLoading] = useState(false);
  const [isWebGpuSupported] = useState(localAiService.isWebGpuSupported());
  const [aiQuality, setAiQuality] = useState(localAiService.getModelQuality());

  // Estados de Entrega (Passo 2)
  const [deliveryType, setDeliveryType] = useState('date'); // 'date' | 'posthumous'
  const [deliveryDate, setDeliveryDate] = useState('2026-12-25');
  const [deliveryTime, setDeliveryTime] = useState('09:00');
  const [emailNotification, setEmailNotification] = useState(true);
  const [whatsappNotification, setWhatsappNotification] = useState(false);
  const [guardianProtected, setGuardianProtected] = useState(true);

  const fileInputRef = useRef(null);

  // Efeito para sincronizar status da IA Local
  useEffect(() => {
    const unsubscribe = localAiService.subscribe((state) => {
      if (state.loadProgress !== undefined) setLocalAiProgress(state.loadProgress);
      if (state.loadText !== undefined) setLocalAiText(state.loadText);
      if (state.isLoading !== undefined) setIsLocalAiLoading(state.isLoading);
    });
    return () => unsubscribe();
  }, []);

  // 0. Auto-Save Inteligente isolado por Cápsula / Destinatário
  const draftKey = `ethernity_message_draft_${capsuleId || recipientName.replace(/\s+/g, '_').toLowerCase()}`;
  const autoSaveData = {
    title,
    content,
    recipientName,
    deliveryType,
    deliveryDate,
    deliveryTime,
    vaultAttachments: vaultAttachments.map((v) => ({
      id: v.id,
      title: v.title || v.name,
      type: v.type,
      mediaUrl: v.mediaUrl || v.streamUrl,
      category: v.category,
    })),
  };

  const { saveStatus, lastSavedAt, initialDraft, clearDraft, forceSaveNow } = useAutoSaveDraft(
    draftKey,
    autoSaveData,
    {
      debounceMs: 1500,
    }
  );

  // Restauração suave do rascunho salvo ao carregar a tela SOMENTE se pertencer a esta cápsula
  useEffect(() => {
    // Se a chave legada global ainda existir no localStorage do usuário, limpa imediatamente
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem('ethernity_message_draft_v1');
      }
    } catch {}

    if (initialDraft && !hasRestoredDraft) {
      const isMismatch = (initialDraft.recipientName && initialDraft.recipientName.trim().toLowerCase() !== recipientName.trim().toLowerCase()) ||
                         (initialDraft.capsuleId && capsuleId && initialDraft.capsuleId !== capsuleId);

      if (isMismatch) {
        // Se o rascunho pertencia a outra pessoa/cápsula diferente, descarta e limpa imediatamente
        clearDraft();
        setTitle('');
        setContent('');
        setHasRestoredDraft(true);
        return;
      }

      if (!title && !content) {
        if (initialDraft.title) setTitle(initialDraft.title);
        if (initialDraft.content) setContent(initialDraft.content);
        if (initialDraft.deliveryType) setDeliveryType(initialDraft.deliveryType);
        if (initialDraft.deliveryDate) setDeliveryDate(initialDraft.deliveryDate);
        if (initialDraft.deliveryTime) setDeliveryTime(initialDraft.deliveryTime);
        if (initialDraft.vaultAttachments && Array.isArray(initialDraft.vaultAttachments)) {
          setVaultAttachments(initialDraft.vaultAttachments);
        }
      }
      setHasRestoredDraft(true);
    }
  }, [initialDraft, hasRestoredDraft, title, content, recipientName, capsuleId, clearDraft]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Sugestões Rápidas da IA
  const handleChipClick = (suggestionText) => {
    setAiPrompt(suggestionText);
  };

  // Converte texto puro em parágrafos HTML para o Rich Text Editor
  const formatAsHtml = (text) => {
    if (!text) return '';
    if (text.includes('<p>') || text.includes('<div>') || text.includes('<h2>')) {
      return text;
    }
    return text
      .split(/\n\n+/)
      .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('');
  };

  // Alterna o Modo de IA Local no aparelho
  const handleToggleLocalAi = async () => {
    const nextState = !isLocalAiEnabled;
    setIsLocalAiEnabled(nextState);
    localAiService.setLocalAiEnabled(nextState);

    if (nextState) {
      showToast('🔒 Modo IA Local ativado. Processamento 100% no seu dispositivo.');
      if (isWebGpuSupported && !localAiService.engine) {
        try {
          await localAiService.initEngine();
          showToast('⚡ Modelo de IA carregado na sua memória local!');
        } catch (err) {
          console.warn('[NewMessageView] Falha ao pré-carregar IA local:', err);
          showToast('Nota: O modelo será preparado durante a primeira geração.');
        }
      }
    } else {
      showToast('Modo IA Local desativado.');
    }
  };

  // Troca entre o modelo padrão (mais leve) e o de alta qualidade (escrita mais natural)
  const handleChangeAiQuality = async (quality) => {
    if (quality === aiQuality) return;
    setAiQuality(quality);
    await localAiService.setModelQuality(quality);
    showToast(quality === 'high'
      ? 'Alta qualidade selecionada. O novo modelo (~2 GB) será baixado na próxima geração.'
      : 'Modelo padrão selecionado.');
  };

  const handleGenerateSuggestion = async () => {
    if (!aiPrompt.trim()) {
      showToast('Digite uma descrição ou escolha uma sugestão rápida.');
      return;
    }

    setIsGeneratingAi(true);
    try {
      let finalTitle = '';
      let finalContent = '';

      // 1. Tenta IA Local se ativada (com streaming progressivo em tempo real)
      if (isLocalAiEnabled) {
        try {
          const suggestion = await localAiService.generateSuggestion({
            prompt: aiPrompt,
            details: aiDetails,
            recipientName,
            tone: 'afetuoso',
            onChunk: (_delta, _fullText, parsedPreview) => {
              if (parsedPreview?.title) setTitle(parsedPreview.title);
              if (parsedPreview?.content) setContent(parsedPreview.content);
            },
          });

          if (suggestion?.title && suggestion?.content) {
            finalTitle = suggestion.title;
            finalContent = suggestion.content;
          }
        } catch (err) {
          console.warn('[NewMessageView] IA Local falhou ou está baixando, aplicando template enriquecido:', err);
        }
      }

      // 2. Se ainda não preencheu, gera template inteligente contextual
      if (!finalTitle || !finalContent) {
        const fallback = localAiService._generateTemplateFallback(aiPrompt, recipientName, 'afetuoso', aiDetails);
        finalTitle = fallback.title;
        finalContent = fallback.content;
      }

      // 3. Aplica no estado da tela
      setTitle(finalTitle);
      setContent(finalContent);
      showToast(isLocalAiEnabled ? '✨ Sugestão gerada pela sua IA Local!' : '✨ Sugestão gerada com sucesso!');
    } catch (err) {
      console.error('[NewMessageView] Erro ao gerar sugestão:', err);
      showToast('Erro ao gerar sugestão.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setMediaFiles((prev) => [...prev, ...files]);
      showToast(`📎 ${files.length} arquivo(s) adicionado(s)!`);
    }
  };

  const handleRemoveFile = (index, e) => {
    e.stopPropagation();
    setMediaFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSelectVaultItems = (selectedItems) => {
    setVaultAttachments((prev) => {
      const existingIds = new Set(prev.map((i) => i.id));
      const newItems = selectedItems.filter((i) => !existingIds.has(i.id));
      return [...prev, ...newItems];
    });
    showToast(`🔒 ${selectedItems.length} mídia(s) do cofre vinculada(s)!`);
  };

  const handleRemoveVaultAttachment = (itemId, e) => {
    if (e) e.stopPropagation();
    setVaultAttachments((prev) => prev.filter((i) => i.id !== itemId));
  };

  const handleSaveDraft = async () => {
    try {
      forceSaveNow();
      const token = localStorage.getItem('ethernity_auth_token') || localStorage.getItem('ethernity_token') || '';
      const draftPayload = {
        title: title || 'Rascunho de Mensagem',
        content,
        recipientName,
        status: 'draft',
        deliveryType,
        deliveryDate: deliveryType === 'date' ? deliveryDate : null,
        deliveryTime,
        vaultAttachments: vaultAttachments.map((v) => ({
          id: v.id,
          title: v.title || v.name,
          type: v.type,
          mediaUrl: v.mediaUrl || v.streamUrl,
          category: v.category,
        })),
      };

      // Salva na API/Backend se online
      await messagesRepository.createMessage(token, draftPayload).catch(() => null);

      showToast('💾 Rascunho salvo com sucesso!');
    } catch {
      showToast('Erro ao salvar rascunho.');
    }
  };

  const handleSaveMessage = async () => {
    if (!title.trim()) {
      showToast('Por favor, informe o título da mensagem.');
      return;
    }

    if (step === 1) {
      // Avança para o passo 2 (Entrega)
      setStep(2);
      return;
    }

    setIsSavingMessage(true);

    try {
      const token = localStorage.getItem('ethernity_auth_token') || localStorage.getItem('ethernity_token') || '';
      const payload = {
        title: title.trim(),
        content,
        recipientName,
        deliveryType,
        deliveryDate: deliveryType === 'date' ? deliveryDate : null,
        deliveryTime,
        guardianProtected,
        emailNotification,
        whatsappNotification,
        status: 'scheduled',
        category: 'Cartas de Amor',
        mediaFiles: mediaFiles.map((f) => ({ name: f.name, size: f.size, type: f.type })),
        vaultAttachments: vaultAttachments.map((v) => ({
          id: v.id,
          title: v.title || v.name,
          type: v.type,
          mediaUrl: v.mediaUrl || v.streamUrl,
          category: v.category,
        })),
      };

      // 1. Persiste no backend / banco de dados via API
      let savedResult = null;
      try {
        savedResult = await messagesRepository.createMessage(token, payload);
      } catch (err) {
        console.warn('[NewMessageView] Falha ao enviar para backend, usando localVault:', err);
      }

      // 2. Salva no cofre local criptografado (LocalVaultService / AES-256)
      try {
        await localVaultService.saveMessage({
          id: savedResult?.id || `vault-msg-${Date.now()}`,
          groupId: 'messages',
          title: title.trim(),
          recipient: recipientName,
          content,
          deliveryType,
          deliveryDate: deliveryType === 'date' ? deliveryDate : 'Póstuma',
          vaultAttachments: vaultAttachments.map((v) => ({
            id: v.id,
            title: v.title || v.name,
            type: v.type,
            mediaUrl: v.mediaUrl || v.streamUrl,
          })),
          timestamp: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('[LocalVaultService] Local storage fallback:', e);
      }

      // 3. Atualiza a lista do cofre e notifica a interface
      const currentVault = JSON.parse(localStorage.getItem('ethernity_vault_items') || '[]');
      const newItem = {
        id: savedResult?.id || `vault-msg-${Date.now()}`,
        title: title.trim(),
        type: 'text',
        category: 'Cartas de Amor',
        recipient: recipientName,
        description: content,
        date: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        duration: 'Carta Escrita',
        size: '1.2 MB',
        isEncrypted: true,
        deliveryDate: deliveryType === 'date' ? deliveryDate : 'Póstuma',
      };

      localStorage.setItem('ethernity_vault_items', JSON.stringify([newItem, ...currentVault]));
      window.dispatchEvent(new CustomEvent('ethernity_vault_updated'));

      // Limpa rascunho automático após conclusão com sucesso
      clearDraft();

      showToast('🎉 Mensagem e agendamento de entrega salvos com sucesso!');
      setTimeout(() => {
        if (onBack) {
          onBack();
        } else if (onNavigateTab) {
          onNavigateTab('vault');
        }
      }, 1000);
    } catch {
      showToast('Erro ao gravar mensagem no cofre.');
    } finally {
      setIsSavingMessage(false);
    }
  };

  const handleBreadcrumbClick = () => {
    if (onBack) {
      onBack();
    } else if (onNavigateTab) {
      onNavigateTab('vault');
    }
  };

  return (
    <div className="new-message-wrapper fade-in">
      <div className="new-message-container">
        {/* Toast Notificação */}
        {toastMessage && (
          <div className="nm-toast-banner">
            <i className="fa-solid fa-circle-check"></i>
            <span>{toastMessage}</span>
          </div>
        )}

        {/* 1. Breadcrumb */}
        <nav className="nm-breadcrumb-row" aria-label="Caminho de navegação">
          <span className="nm-breadcrumb-link" onClick={handleBreadcrumbClick}>
            Meu Cofre
          </span>
          <span className="nm-breadcrumb-sep">&gt;</span>
          <span className="nm-breadcrumb-link" onClick={handleBreadcrumbClick}>
            {recipientName}
          </span>
          <span className="nm-breadcrumb-sep">&gt;</span>
          <span className="nm-breadcrumb-current">Nova Mensagem</span>
        </nav>

        {/* 2. Título da Tela e Descrição */}
        <header className="nm-page-header">
          <h1 className="nm-page-title">Criar Nova Mensagem</h1>
          <p className="nm-page-subtitle">
            Escreva e prepare as memórias mais especiais que serão guardadas com total cuidado para a pessoa escolhida.
          </p>
        </header>

        {/* 3. Stepper (1 Ideação ── 2 Entrega) */}
        <div className="nm-stepper-box">
          <div
            className={`nm-step-item ${step === 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}
            onClick={() => setStep(1)}
          >
            <span className="nm-step-number">{step > 1 ? '✓' : '1'}</span>
            <span className="nm-step-label">Ideação</span>
          </div>

          <div className={`nm-step-divider ${step >= 2 ? 'active' : ''}`}></div>

          <div
            className={`nm-step-item ${step === 2 ? 'active' : ''}`}
            onClick={() => title.trim() && setStep(2)}
          >
            <span className="nm-step-number">2</span>
            <span className="nm-step-label">Entrega</span>
          </div>
        </div>

        {/* 4. Formulário Principal Dentro do Card Branco com Borda Arredondada */}
        <main className="nm-main-card">
          {/* Banner de Rascunho Recuperado (Discreto e Seguro) */}
          {hasRestoredDraft && (
            <div className="nm-draft-restored-banner">
              <div className="nm-draft-banner-left">
                <i className="fa-solid fa-clock-rotate-left"></i>
                <span>Rascunho recuperado automaticamente. Suas memórias continuam preservadas.</span>
              </div>
              <button
                type="button"
                className="nm-btn-discard-draft"
                onClick={() => {
                  clearDraft();
                  setTitle('');
                  setContent('');
                  setHasRestoredDraft(false);
                  showToast('Rascunho descartado.');
                }}
              >
                Descartar rascunho
              </button>
            </div>
          )}

          {step === 1 ? (
            <>
              {/* Box Assistente de Ideação AI */}
              <section className="nm-ai-assistant-card">
                <div className="nm-ai-header">
                  <div className="nm-ai-sparkle-icon">
                    <i className="fa-solid fa-wand-magic-sparkles"></i>
                  </div>
                  <div className="nm-ai-header-text">
                    <h2 className="nm-ai-title">Assistente de Ideação AI</h2>
                    <p className="nm-ai-subtitle">Deixe a inteligência artificial te ajudar a encontrar as palavras certas</p>
                  </div>

                  {/* Switch Liga / Desliga IA Local no Aparelho */}
                  <div className="nm-ai-local-toggle-wrap">
                    <div className="nm-ai-toggle-info">
                      <i className={`fa-solid ${isLocalAiEnabled ? 'fa-shield-halved text-success' : 'fa-laptop'}`}></i>
                      <span>IA Local (Seu Aparelho)</span>
                    </div>
                    <label className="nm-switch-label" title="Executar inteligência artificial direto no seu navegador sem enviar dados para a nuvem">
                      <input
                        type="checkbox"
                        checked={isLocalAiEnabled}
                        onChange={handleToggleLocalAi}
                      />
                      <span className="nm-switch-slider"></span>
                    </label>
                  </div>
                </div>

                {/* Banner Informativo quando a IA Local está ativa */}
                {isLocalAiEnabled && (
                  <div className="nm-ai-local-active-note">
                    <i className="fa-solid fa-lock"></i>
                    <div className="nm-ai-note-text">
                      <strong>Privacidade Zero-Knowledge:</strong> Processamento 100% no seu hardware (GPU/RAM). Suas memórias não saem do seu dispositivo.
                    </div>
                  </div>
                )}

                {/* Qualidade do modelo local */}
                {isLocalAiEnabled && (
                  <div className="nm-ai-quality-row">
                    <span className="nm-ai-quality-label">Qualidade da escrita:</span>
                    <div className="nm-ai-quality-options" role="radiogroup" aria-label="Qualidade da escrita">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={aiQuality === 'standard'}
                        className={`nm-ai-quality-btn ${aiQuality === 'standard' ? 'active' : ''}`}
                        onClick={() => handleChangeAiQuality('standard')}
                        disabled={isLocalAiLoading || isGeneratingAi}
                      >
                        Padrão <small>~1 GB · mais rápido</small>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={aiQuality === 'high'}
                        className={`nm-ai-quality-btn ${aiQuality === 'high' ? 'active' : ''}`}
                        onClick={() => handleChangeAiQuality('high')}
                        disabled={isLocalAiLoading || isGeneratingAi}
                      >
                        Alta qualidade <small>~2 GB · texto mais natural</small>
                      </button>
                    </div>
                  </div>
                )}

                {/* Barra de Progresso do Download do Modelo (Apenas na 1ª Inicialização) */}
                {isLocalAiLoading && (
                  <div className="nm-ai-download-progress-box">
                    <div className="nm-ai-progress-header">
                      <span>{localAiText || 'Carregando modelo de IA no navegador...'}</span>
                      <strong>{localAiProgress}%</strong>
                    </div>
                    <div className="nm-ai-progress-bar-bg">
                      <div
                        className="nm-ai-progress-bar-fill"
                        style={{ width: `${localAiProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                <div className="nm-ai-input-wrap">
                  <input
                    type="text"
                    className="nm-ai-input-field"
                    placeholder="Descreva o que você gostaria de dizer... Ex: Uma carta emocionante para minha filha no dia do casamento"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleGenerateSuggestion()}
                  />
                  <textarea
                    className="nm-ai-input-field nm-ai-details-field"
                    rows={2}
                    placeholder="Detalhes que só você sabe (opcional): apelidos, uma lembrança, um lugar, uma frase que a pessoa sempre diz..."
                    value={aiDetails}
                    onChange={(e) => setAiDetails(e.target.value)}
                  />
                </div>

                <div className="nm-ai-bottom-row">
                  <div className="nm-ai-chips-group">
                    <button
                      type="button"
                      className="nm-ai-chip"
                      onClick={() => handleChipClick('Carta de aniversário calorosa com lembranças queridas')}
                    >
                      Carta de aniversário
                    </button>
                    <button
                      type="button"
                      className="nm-ai-chip"
                      onClick={() => handleChipClick('Mensagem motivacional e de apoio para decisões difíceis')}
                    >
                      Mensagem motivacional
                    </button>
                    <button
                      type="button"
                      className="nm-ai-chip"
                      onClick={() => handleChipClick('Declaração de amor eterno e gratidão familiar')}
                    >
                      Declaração de amor
                    </button>
                  </div>

                  <button
                    type="button"
                    className="btn-gerar-sugestao"
                    onClick={handleGenerateSuggestion}
                    disabled={isGeneratingAi}
                  >
                    <i className={`fa-solid ${isGeneratingAi ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'}`}></i>
                    <span>{isGeneratingAi ? 'Gerando...' : 'Gerar Sugestão'}</span>
                  </button>
                </div>
              </section>

              {/* Campo: Título da Mensagem */}
              <div className="nm-form-group">
                <label className="nm-form-label" htmlFor="msg-title-input">
                  Título da Mensagem
                </label>
                <input
                  id="msg-title-input"
                  type="text"
                  className="nm-form-input"
                  placeholder="Ex: Carta para ler no seu casamento, Conselhos para a faculdade..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              {/* Campo: Conteúdo da Mensagem com RichTextEditor */}
              <div className="nm-form-group">
                <label className="nm-form-label" htmlFor="msg-content-input">
                  Conteúdo da Mensagem
                </label>
                <RichTextEditor
                  id="msg-content-input"
                  value={content}
                  onChange={setContent}
                  placeholder="Escreva aqui suas palavras mais carinhosas e importantes. Suas histórias e sentimentos serão preservados com segurança."
                  minHeight="220px"
                  saveStatus={saveStatus}
                  lastSavedAt={lastSavedAt}
                />
              </div>

              {/* Campo: Arquivos de Mídia (Opcional) */}
              <div className="nm-form-group">
                <div className="nm-media-label-header">
                  <label className="nm-form-label">Arquivos de Mídia (Opcional)</label>
                  <button
                    type="button"
                    className="nm-btn-vault-picker-action"
                    onClick={() => setIsVaultPickerOpen(true)}
                  >
                    <i className="fa-solid fa-shield-halved"></i>
                    <span>Selecionar do Cofre Seguro</span>
                    <span className="nm-vault-pill-tag">AES-256</span>
                  </button>
                </div>

                {/* Bloco de Mídias Anexadas do Cofre Criptografado */}
                {vaultAttachments.length > 0 && (
                  <div className="nm-vault-attached-section">
                    <div className="nm-vault-attached-header">
                      <span className="nm-vault-attached-label">
                        <i className="fa-solid fa-lock"></i> Mídias do Cofre Anexadas ({vaultAttachments.length})
                      </span>
                      <button
                        type="button"
                        className="nm-btn-add-more-vault"
                        onClick={() => setIsVaultPickerOpen(true)}
                      >
                        + Gerenciar seleção
                      </button>
                    </div>
                    <div className="nm-vault-attached-chips">
                      {vaultAttachments.map((item) => {
                        const type = (item.type || '').toLowerCase();
                        const isVideo = type === 'video';
                        const isAudio = type === 'audio';
                        return (
                          <div key={item.id} className="nm-vault-attached-chip">
                            <i className={isVideo ? 'fa-solid fa-video' : isAudio ? 'fa-solid fa-microphone-lines' : 'fa-regular fa-image'}></i>
                            <span className="nm-vault-chip-title" title={item.title || item.name}>
                              {item.title || item.name}
                            </span>
                            <span className="nm-vault-chip-badge">Cofre</span>
                            <button
                              type="button"
                              className="nm-btn-remove-vault-chip"
                              onClick={(e) => handleRemoveVaultAttachment(item.id, e)}
                              aria-label="Remover mídia do cofre"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div
                  className="nm-dropzone-box"
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    multiple
                    accept="image/*,video/*,audio/*"
                    onChange={handleFileUpload}
                  />
                  <div className="nm-upload-circle-icon">
                    <i className="fa-solid fa-cloud-arrow-up"></i>
                  </div>
                  <strong className="nm-dropzone-title">Arraste arquivos ou clique para enviar</strong>
                  <span className="nm-dropzone-subtitle">Suporta vídeos (MP4, MOV), áudios ou fotos até 500MB</span>

                  {/* Lista de Arquivos Anexados */}
                  {mediaFiles.length > 0 && (
                    <div className="nm-attached-files-list" onClick={(e) => e.stopPropagation()}>
                      {mediaFiles.map((file, idx) => (
                        <div key={idx} className="nm-attached-file-badge">
                          <i className="fa-solid fa-paperclip"></i>
                          <span className="nm-file-name">{file.name}</span>
                          <button
                            type="button"
                            className="nm-btn-remove-file"
                            onClick={(e) => handleRemoveFile(idx, e)}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* Passo 2: Configuração de Entrega */
            <div className="nm-delivery-step-content">
              <h2 className="nm-section-title">Como e quando esta mensagem deve ser entregue?</h2>
              <p className="nm-section-subtitle">
                Configure o momento e as condições de abertura para garantir a entrega segura a {recipientName}.
              </p>

              <div className="nm-delivery-options-grid">
                <div
                  className={`nm-deliv-card ${deliveryType === 'date' ? 'selected' : ''}`}
                  onClick={() => setDeliveryType('date')}
                >
                  <div className="nm-deliv-card-header">
                    <i className="fa-regular fa-calendar-check"></i>
                    <span className="nm-radio-circle">{deliveryType === 'date' && '✓'}</span>
                  </div>
                  <h3>Data Específica Programada</h3>
                  <p>A mensagem será desbloqueada rigorosamente na data comemorativa ou marco escolhido.</p>
                </div>

                <div
                  className={`nm-deliv-card ${deliveryType === 'posthumous' ? 'selected' : ''}`}
                  onClick={() => setDeliveryType('posthumous')}
                >
                  <div className="nm-deliv-card-header">
                    <i className="fa-solid fa-shield-heart"></i>
                    <span className="nm-radio-circle">{deliveryType === 'posthumous' && '✓'}</span>
                  </div>
                  <h3>Após Confirmação de Guardiões</h3>
                  <p>Liberação protocolada e validada através da sua rede de confiança (Life-Check Ethernity).</p>
                </div>
              </div>

              {deliveryType === 'date' && (
                <div className="nm-date-pickers-row">
                  <div className="nm-form-group" style={{ flex: 1 }}>
                    <label className="nm-form-label">Data de Abertura</label>
                    <input
                      type="date"
                      className="nm-form-input"
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                    />
                  </div>
                  <div className="nm-form-group" style={{ width: '160px' }}>
                    <label className="nm-form-label">Horário</label>
                    <input
                      type="time"
                      className="nm-form-input"
                      value={deliveryTime}
                      onChange={(e) => setDeliveryTime(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="nm-delivery-options-list">
                <label className="nm-checkbox-row">
                  <input
                    type="checkbox"
                    checked={emailNotification}
                    onChange={(e) => setEmailNotification(e.target.checked)}
                  />
                  <span>Enviar link de acesso criptografado por E-mail</span>
                </label>
                <label className="nm-checkbox-row">
                  <input
                    type="checkbox"
                    checked={whatsappNotification}
                    onChange={(e) => setWhatsappNotification(e.target.checked)}
                  />
                  <span>Notificar destinatário via WhatsApp quando chegar a data</span>
                </label>
                <label className="nm-checkbox-row">
                  <input
                    type="checkbox"
                    checked={guardianProtected}
                    onChange={(e) => setGuardianProtected(e.target.checked)}
                  />
                  <span>Proteger com validação do Guardião Responsável (Roberto Silva)</span>
                </label>
              </div>
            </div>
          )}

          {/* 5. Ações do Rodapé (Salvar como Rascunho / Salvar Mensagem) */}
          <footer className="nm-card-footer">
            {step === 2 && (
              <button
                type="button"
                className="nm-btn-back-step"
                onClick={() => setStep(1)}
              >
                ← Voltar para Edição
              </button>
            )}

            <div className="nm-footer-right-buttons">
              <button
                type="button"
                className="nm-btn-rascunho"
                onClick={handleSaveDraft}
              >
                Salvar como Rascunho
              </button>

              <button
                type="button"
                className="nm-btn-salvar"
                onClick={handleSaveMessage}
              >
                {step === 1 ? 'Continuar para Entrega' : 'Salvar Mensagem'}
              </button>
            </div>
          </footer>
        </main>
      </div>

      {/* Modal Seletor do Cofre Criptografado */}
      <VaultMediaPickerModal
        isOpen={isVaultPickerOpen}
        onClose={() => setIsVaultPickerOpen(false)}
        onSelect={handleSelectVaultItems}
        alreadySelectedIds={vaultAttachments.map((v) => v.id)}
      />
    </div>
  );
}
