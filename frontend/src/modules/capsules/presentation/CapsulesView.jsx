import React, { useState, useEffect, useRef } from 'react';
import { useI18n } from '../../../core/i18n/presentation/useI18n.js';
import NewMessageView from '../../messages/presentation/NewMessageView.jsx';
import VoiceIdeationView from '../../messages/presentation/VoiceIdeationView.jsx';
import VideoIdeationView from '../../messages/presentation/VideoIdeationView.jsx';
import faceRecognitionService from '../../../core/services/faceRecognitionService.js';
import localAiService from '../../../core/services/localAiService.js';
import memoriesService from '../../memories/application/memoriesService.js';
import { SUBSCRIPTION_PLANS, getEffectiveUserPlan } from '../../subscription/domain/subscriptionModel.js';
import SelectPeopleGrid from '../../../core/components/SelectPeopleGrid.jsx';
import SpecialPersonFormCard from '../../../core/components/SpecialPersonFormCard.jsx';
import capsulesService, { DEFAULT_CAPSULES } from '../application/capsulesService.js';
import VoiceRecorderModal from '../../memories/presentation/VoiceRecorderModal.jsx';
import TalkingAvatarModal from './TalkingAvatarModal.jsx';
import './CapsulesView.css';



export const SAMPLE_FIXTURE_AVAILABLE_AUDIOS = [
  { id: 'aud-1', title: 'Palavras de Amor & Conselhos de Vida', duration: '04:15 min', date: 'Gravado ontem' },
  { id: 'aud-2', title: 'A História de Como Conheci Seu Pai', duration: '08:30 min', date: 'Gravado em 14/08/2026' },
  { id: 'aud-3', title: 'Instruções e Bênçãos de Família', duration: '03:45 min', date: 'Gravado em 02/09/2026' },
];

export const SAMPLE_FIXTURE_AVAILABLE_VIDEOS = [
  { id: 'vid-1', title: 'Mensagem em Vídeo: 18º Aniversário Especial', duration: '02:40 min', quality: '4K Ultra HD' },
  { id: 'vid-2', title: 'Passeio em Família e Memórias de Infância', duration: '12:15 min', quality: '1080p HD' },
];

export const SAMPLE_FIXTURE_AVAILABLE_ALBUMS = [
  { id: 'alb-1', title: 'Álbum Nossos Melhores Momentos (234 fotos)', count: '234 fotos sincronizadas' },
  { id: 'alb-2', title: 'Viagens Inesquecíveis & Natais', count: '98 fotos selecionadas' },
];

export const SAMPLE_FIXTURE_CURATION_PHOTOS = [
  {
    id: 'c-1',
    img: null,
    dateLabel: 'Julho 2018',
    photoNumber: 1,
    story: 'Férias de verão na praia. O seu primeiro contato com as ondas do mar e aquele abraço quentinho ao entardecer.',
    audioDuration: '0:35',
    emotions: ['Amor', 'Saudade'],
  },
];

const AVAILABLE_AUDIOS = [];
const AVAILABLE_VIDEOS = [];
const AVAILABLE_ALBUMS = [];
const CURATION_PHOTOS = [];

const EMOTIONS_LIST = ['Gratidão', 'Saudade', 'Alegria', 'Amor', 'Orgulho'];

export default function CapsulesView({ onNavigateTab, profile }) {
  const { t } = useI18n();
  const fileInputRef = useRef(null);
  const [capsules, setCapsules] = useState(() => capsulesService.getCapsules());
  const [viewMode, setViewMode] = useState(() => {
    try {
      const initial = sessionStorage.getItem('ethernity_capsules_initial_mode');
      if (initial) {
        sessionStorage.removeItem('ethernity_capsules_initial_mode');
        return initial;
      }
    } catch {}
    return 'list';
  }); // 'list' | 'select_people' | 'configure_person_details' | 'configure_details' | 'curate_capsule'
  const [detectedPeopleList, setDetectedPeopleList] = useState([]);
  const [totalPhotosAnalyzed, setTotalPhotosAnalyzed] = useState(0);
  const [isAnalyzingFaces, setIsAnalyzingFaces] = useState(false);
  const [selectedPeopleIds, setSelectedPeopleIds] = useState([]);
  const [activePersonIndex, setActivePersonIndex] = useState(0);
  const [toast, setToast] = useState(null);

  // Upload direto a partir da tela de Cápsulas
  const handleDirectUpload = (e) => {
    const rawFiles = Array.from(e.target.files || []);
    if (rawFiles.length === 0) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    const isInsideCapsule = Boolean(curatingCapsule?.id && (viewMode === 'detail' || viewMode === 'curate_capsule'));

    const newPhotos = [];
    let loaded = 0;

    // Se NÃO estiver dentro de uma cápsula (tela geral), prepara o fluxo de detecção facial
    if (!isInsideCapsule) {
      setIsAnalyzingFaces(true);
      setViewMode('select_people');
    }

    rawFiles.forEach((file, idx) => {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        newPhotos.push({
          id: `direct-upload-${Date.now()}-${idx}`,
          img: evt.target.result,
          title: file.name,
          dateLabel: 'Hoje',
          year: new Date().getFullYear(),
          selected: true,
          source: 'local',
        });
        loaded++;
        if (loaded === rawFiles.length) {
          // REGRA MANDATÓRIA: Se já estiver dentro de uma cápsula específica, NÃO identifica rostos!
          // Adiciona diretamente as fotos à cápsula em que o usuário já se encontra.
          if (isInsideCapsule) {
            const updatedPhotos = await capsulesService.addPhotosToCapsule(curatingCapsule.id, newPhotos);
            setCuratingCapsule((prev) => ({
              ...prev,
              photos: updatedPhotos,
              totalPhotos: updatedPhotos.length,
            }));
            memoriesService.addLocalPhotos(newPhotos);

            // Se estiver no estúdio de narração, aponta para a nova foto adicionada
            if (viewMode === 'curate_capsule') {
              const previousLength = (curatingCapsule.photos?.length || 0);
              setCurrentPhotoIdx(previousLength);
            }

            const recipientLabel = curatingCapsule.recipientName || 'desta cápsula';
            setToast(`📸 ${newPhotos.length} foto(s) adicionada(s) diretamente à cápsula de ${recipientLabel}!`);
            setTimeout(() => setToast(null), 4000);
            return;
          }

          // Fluxo de criação na listagem geral: identifica e agrupa rostos para novas cápsulas
          memoriesService.setActivePhotosForCapsules(newPhotos);
          memoriesService.addLocalPhotos(newPhotos);
          setTotalPhotosAnalyzed(newPhotos.length);
          try {
            const clusters = await faceRecognitionService.detectAndClusterPeople(newPhotos);
            if (Array.isArray(clusters) && clusters.length > 0) {
              setDetectedPeopleList(clusters);
              if (clusters.length === 1) setSelectedPeopleIds([clusters[0].id]);
              setToast(`✨ ${clusters.length} pessoa(s) identificada(s) com sucesso!`);
            } else {
              setDetectedPeopleList([]);
              setToast('⚠️ Nenhum rosto foi detectado na foto enviada. Envie uma foto com rosto visível.');
            }
          } catch (err) {
            console.warn('[CapsulesView] Erro na detecção direta:', err);
            setDetectedPeopleList([]);
          }
          setIsAnalyzingFaces(false);
          setTimeout(() => setToast(null), 4500);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Limite do Plano do Usuário Dinâmico (Ilimitado para Vagner/Infinity)
  const currentPlan = getEffectiveUserPlan(null, profile);
  const maxAllowedPeople = currentPlan.maxRecipients || 9999;

  // Form State para Configuração da Cápsula da pessoa ativa
  const [capsuleTitle, setCapsuleTitle] = useState('');
  const [selectedAudios, setSelectedAudios] = useState([]);
  const [selectedVideos, setSelectedVideos] = useState([]);
  const [selectedAlbums, setSelectedAlbums] = useState([]);
  const [letterContent, setLetterContent] = useState('');
  const [triggerType, setTriggerType] = useState('date');
  const [triggerDate, setTriggerDate] = useState('2032-10-12');

  // State para Curadoria / Narração da Cápsula Clicada
  const [curatingCapsule, setCuratingCapsule] = useState(null);
  const [currentPhotoIdx, setCurrentPhotoIdx] = useState(0);
  const [storyText, setStoryText] = useState('');
  const [selectedEmotions, setSelectedEmotions] = useState(['Gratidão', 'Alegria', 'Amor']);
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);
  const [isGeneratingAvatarVoice, setIsGeneratingAvatarVoice] = useState(false);
  const [isGeneratingStoryAi, setIsGeneratingStoryAi] = useState(false);
  const [isTalkingAvatarModalOpen, setIsTalkingAvatarModalOpen] = useState(false);
  const [isVoiceRecorderModalOpen, setIsVoiceRecorderModalOpen] = useState(false);
  const [currentVoiceAudioBlob, setCurrentVoiceAudioBlob] = useState(null);
  const [importedPhotosDraft, setImportedPhotosDraft] = useState([]);
  const [capsuleToDelete, setCapsuleToDelete] = useState(null);
  const [detailsDraft, setDetailsDraft] = useState(null);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isPlayingCapsuleVoice, setIsPlayingCapsuleVoice] = useState(false);
  const capsuleAudioRef = useRef(null);

  useEffect(() => {
    return () => {
      if (capsuleAudioRef.current) {
        capsuleAudioRef.current.pause();
        capsuleAudioRef.current = null;
      }
    };
  }, []);

  const handleTogglePlayCapsuleVoice = (audioItem) => {
    if (!audioItem || (!audioItem.url && !audioItem.audioBlob)) {
      setToast('Áudio ainda não gravado ou link indisponível.');
      return;
    }
    const audioSrc = audioItem.url || (audioItem.audioBlob ? URL.createObjectURL(audioItem.audioBlob) : null);
    if (!audioSrc) {
      setToast('Arquivo de áudio não encontrado.');
      return;
    }

    if (!capsuleAudioRef.current) {
      capsuleAudioRef.current = new Audio();
      capsuleAudioRef.current.onended = () => setIsPlayingCapsuleVoice(false);
      capsuleAudioRef.current.onerror = () => {
        setIsPlayingCapsuleVoice(false);
        setToast('Erro ao reproduzir o áudio.');
      };
    }

    if (isPlayingCapsuleVoice) {
      capsuleAudioRef.current.pause();
      setIsPlayingCapsuleVoice(false);
    } else {
      capsuleAudioRef.current.src = audioSrc;
      capsuleAudioRef.current.play().then(() => {
        setIsPlayingCapsuleVoice(true);
      }).catch((err) => {
        console.warn('Erro ao reproduzir áudio da cápsula:', err);
        setIsPlayingCapsuleVoice(false);
      });
    }
  };

  const handleSaveVoiceToCapsule = (savedAudio) => {
    if (!curatingCapsule?.id || !savedAudio) return;
    const updated = capsulesService.addCapsuleAudio(curatingCapsule.id, savedAudio);
    if (updated) {
      setCuratingCapsule(updated);
      setCapsules((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    }
    setToast('🎙️ Mensagem de voz gravada e vinculada à cápsula com sucesso!');
    setViewMode('detail');
  };

  const handleRequestDeleteCapsule = (cap) => {
    setCapsuleToDelete(cap);
  };

  const handleConfirmDeleteCapsule = async () => {
    if (!capsuleToDelete) return;
    const targetId = capsuleToDelete.id;
    const targetTitle = capsuleToDelete.title || 'Cápsula';

    await capsulesService.deleteCapsule(targetId);
    setCapsuleToDelete(null);

    // Se estava na tela de detalhes daquela cápsula, volta para a lista
    if (curatingCapsule?.id === targetId) {
      setViewMode('list');
      setCuratingCapsule(null);
    }

    setToast(`🗑️ ${targetTitle} e todo o seu conteúdo foram excluídos. As demais cápsulas permanecem intactas.`);
    setTimeout(() => setToast(null), 4500);
  };

  const handleConfirmDeleteItem = async () => {
    if (!itemToDelete) return;
    const { type, capsuleId, itemId, title } = itemToDelete;

    if (type === 'voice') {
      if (capsuleAudioRef.current) {
        capsuleAudioRef.current.pause();
        setIsPlayingCapsuleVoice(false);
      }
    }

    if (type === 'photo') {
      const updatedPhotos = await capsulesService.deleteCapsulePhoto(capsuleId, itemId);
      if (curatingCapsule?.id === capsuleId) {
        setCuratingCapsule((prev) => ({
          ...prev,
          photos: updatedPhotos,
          totalPhotos: updatedPhotos.length,
        }));
        if (currentPhotoIdx >= updatedPhotos.length) {
          setCurrentPhotoIdx(Math.max(0, updatedPhotos.length - 1));
        }
      }
      setToast(`🗑️ ${title || 'Foto'} excluída desta cápsula. As demais cápsulas permanecem 100% intactas.`);
    } else {
      const updatedCap = capsulesService.deleteCapsuleContentItem(capsuleId, type);
      if (curatingCapsule?.id === capsuleId && updatedCap) {
        setCuratingCapsule((prev) => ({
          ...prev,
          hasVoice: updatedCap.hasVoice,
          voiceAudio: updatedCap.voiceAudio,
          audios: updatedCap.audios,
          removedContentItems: updatedCap.removedContentItems || [],
        }));
      }
      setToast(`🗑️ ${title || 'Arquivo'} excluído desta cápsula. As demais cápsulas permanecem 100% intactas.`);
    }

    setItemToDelete(null);
    setTimeout(() => setToast(null), 4000);
  };

  const handleDeletePhoto = async (capsuleId, photoId) => {
    if (!capsuleId || !photoId) return;
    const updatedPhotos = await capsulesService.deleteCapsulePhoto(capsuleId, photoId);
    if (curatingCapsule?.id === capsuleId) {
      setCuratingCapsule((prev) => ({
        ...prev,
        photos: updatedPhotos,
        totalPhotos: updatedPhotos.length,
      }));
      if (currentPhotoIdx >= updatedPhotos.length) {
        setCurrentPhotoIdx(Math.max(0, updatedPhotos.length - 1));
      }
    }
    setToast('🗑️ Foto removida desta cápsula. As demais cápsulas permanecem intactas.');
    setTimeout(() => setToast(null), 3500);
  };

  // Carregar e clusterizar estritamente as fotos selecionadas/enviadas pelo usuário
  useEffect(() => {
    let isMounted = true;
    const analyzePhotos = async () => {
      try {
        let targetPhotos = memoriesService.getActivePhotosForCapsules();

        // 1. Tenta carregar as fotos ativas em memória
        if (!Array.isArray(targetPhotos) || targetPhotos.length === 0) {
          try {
            const activePhotosRaw = sessionStorage.getItem('ethernity_active_photos_for_capsules');
            if (activePhotosRaw) {
              const parsed = JSON.parse(activePhotosRaw);
              if (Array.isArray(parsed) && parsed.length > 0) {
                targetPhotos = parsed;
              }
            }
          } catch (e) {
            console.warn('[CapsulesView] Erro ao ler active photos do sessionStorage:', e);
          }
        }

        // 2. Se ainda não há fotos específicas selecionadas, verifica se há fotos selecionadas pelo usuário
        if (!targetPhotos || targetPhotos.length === 0) {
          const rawPhotos = await memoriesService.getPhotos();
          if (Array.isArray(rawPhotos) && rawPhotos.length > 0) {
            const selectedOnly = rawPhotos.filter((p) => p.selected);
            if (selectedOnly.length > 0) {
              targetPhotos = selectedOnly;
            }
          }
        }

        // 3. Se nenhuma foto foi enviada ou selecionada pelo usuário:
        if (!targetPhotos || targetPhotos.length === 0) {
          if (isMounted) {
            setTotalPhotosAnalyzed(0);
            setDetectedPeopleList([]);
            setIsAnalyzingFaces(false);
          }
          return;
        }

        if (isMounted) {
          setTotalPhotosAnalyzed(targetPhotos.length);
          setIsAnalyzingFaces(true);
        }

        // 4. Detecção facial real com SSD MobileNet e TinyFace
        const clusters = await faceRecognitionService.detectAndClusterPeople(targetPhotos);
        if (isMounted) {
          if (Array.isArray(clusters) && clusters.length > 0) {
            setDetectedPeopleList(clusters);
            // Se apenas 1 pessoa foi identificada, pré-seleciona para agilidade
            if (clusters.length === 1) {
              setSelectedPeopleIds([clusters[0].id]);
            }
          } else {
            // Nenhum rosto foi detectado nas fotos enviadas (ex: fotos de paisagens ou sem faces)
            setDetectedPeopleList([]);
          }
          setIsAnalyzingFaces(false);
        }
      } catch (err) {
        console.warn('[CapsulesView] Face detection init note:', err);
        if (isMounted) setIsAnalyzingFaces(false);
      }
    };

    analyzePhotos();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    try {
      const targetMode = sessionStorage.getItem('ethernity_capsules_initial_mode');
      if (targetMode) {
        setViewMode(targetMode);
        sessionStorage.removeItem('ethernity_capsules_initial_mode');
      }

      const selectedCapsuleRaw = sessionStorage.getItem('ethernity_selected_capsule');
      if (selectedCapsuleRaw) {
        const parsedCap = JSON.parse(selectedCapsuleRaw);
        if (parsedCap?.name) {
          setCuratingCapsule({
            title: `Cápsula para ${parsedCap.name}`,
            recipientName: parsedCap.name,
            relationship: parsedCap.relationship || 'Familiar',
            avatar: parsedCap.avatar || null,
            totalPhotos: parsedCap.photosCount || 0,
            narratedPhotos: parsedCap.memoriesCount || 0,
          });
          setViewMode('detail');
        }
        sessionStorage.removeItem('ethernity_selected_capsule');
      }

      const raw = sessionStorage.getItem('ethernity_capsule_draft_photos');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setImportedPhotosDraft(parsed);
          setToast(`📸 ${parsed.length} foto(s) do Google Fotos vinculada(s) à sua Cápsula!`);
          setTimeout(() => setToast(null), 5000);
        }
      }
    } catch (e) {
      console.warn('Capsule draft photos read note:', e);
    }
  }, []);

  // Sincronização e subscrição reativa com o capsulesService (garante que os cards padrão e criados sempre apareçam)
  useEffect(() => {
    capsulesService.fetchCapsulesFromApi().catch(() => {});

    const unsubscribe = capsulesService.subscribe((updated) => {
      if (Array.isArray(updated)) {
        setCapsules(updated);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (viewMode === 'list') {
      setCapsules(capsulesService.getCapsules());
    }
  }, [viewMode]);



  const selectedPeople = detectedPeopleList.filter((p) => selectedPeopleIds.includes(p.id));
  const currentPerson = selectedPeople[activePersonIndex] || selectedPeople[0];

  const handleStartCreate = () => {
    setSelectedPeopleIds([]);
    setViewMode('select_people');
  };

  // Toggle com validação do limite do plano contratado
  const togglePersonSelection = (id) => {
    setSelectedPeopleIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((pId) => pId !== id);
      }
      if (prev.length >= maxAllowedPeople) {
        setToast(`⚠️ Seu plano (${currentPlan.name}) permite até ${maxAllowedPeople} pessoas.`);
        setTimeout(() => setToast(null), 4000);
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleOpenEditDetails = () => {
    if (!curatingCapsule) return;
    setDetailsDraft({
      title: curatingCapsule.title || '',
      recipientName: curatingCapsule.recipientName || '',
      relationship: curatingCapsule.relationship || '',
      deliveryType: curatingCapsule.deliveryType === 'posthumous' ? 'posthumous' : 'date',
      date: curatingCapsule.scheduledDate ? String(curatingCapsule.scheduledDate).slice(0, 10) : '',
      error: '',
    });
  };

  const handleSaveDetails = (e) => {
    e.preventDefault();
    if (!detailsDraft || !curatingCapsule) return;
    const { title, recipientName, relationship, deliveryType, date } = detailsDraft;
    if (!recipientName.trim()) {
      setDetailsDraft((d) => ({ ...d, error: 'Informe o nome de quem vai receber a cápsula.' }));
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    if (deliveryType === 'date' && (!date || date <= today)) {
      setDetailsDraft((d) => ({ ...d, error: 'Escolha uma data de entrega no futuro.' }));
      return;
    }
    const scheduledDate = deliveryType === 'date' ? `${date}T12:00:00.000Z` : null;
    const saved = capsulesService.updateCapsuleDetails(curatingCapsule.id, {
      title,
      recipientName,
      relationship,
      deliveryType,
      scheduledDate,
    });
    if (!saved) {
      setDetailsDraft((d) => ({ ...d, error: 'Não foi possível salvar. Tente novamente.' }));
      return;
    }
    setCuratingCapsule((prev) => ({
      ...prev,
      title: saved.title,
      recipientName: recipientName.trim(),
      relationship: relationship.trim(),
      deliveryType,
      scheduledDate,
    }));
    setCapsules(capsulesService.getCapsules());
    setDetailsDraft(null);
    setToast('Detalhes da cápsula salvos.');
    setTimeout(() => setToast(null), 3000);
  };

  const handleOpenCapsule = async (cap) => {
    const rName = cap.recipient ? cap.recipient.split('(')[0].trim() : (profile?.name ? `Destinatário de ${profile.name}` : 'Meu Destinatário');
    const rRel = cap.recipient && cap.recipient.includes('(')
      ? cap.recipient.split('(')[1].replace(')', '').trim()
      : 'Família';

    // Recupera as fotos reais exclusivas desta cápsula
    let photos = await capsulesService.getCapsulePhotos(cap.id, cap);
    if (!Array.isArray(photos)) {
      photos = [];
    }

    setCuratingCapsule({
      id: cap.id,
      title: cap.title || `Cápsula para ${rName}`,
      recipientName: rName,
      relationship: rRel,
      avatar: cap.avatar || '',
      totalPhotos: photos.length,
      narratedPhotos: 0,
      photos: photos,
      removedContentItems: Array.isArray(cap.removedContentItems) ? cap.removedContentItems : [],
      quote: cap.description || cap.quote || 'Uma cápsula de amor e legado para o futuro.',
      hasVoice: cap.hasVoice,
      voiceAudio: cap.voiceAudio,
      audios: cap.audios,
      videos: cap.videos,
      calibrationAudio: cap.calibrationAudio,
      deliveryType: cap.deliveryType || 'date',
      scheduledDate: cap.scheduledDate || null,
    });
    setCurrentPhotoIdx(0);
    setStoryText(photos[0]?.story || '');
    setSelectedEmotions(photos[0]?.emotions || ['Gratidão', 'Alegria', 'Amor']);
    setViewMode('detail');
  };

  // Ao clicar em "Criar Cápsulas Selecionadas", abre o formulário da primeira pessoa
  const handleProceedToConfigure = () => {
    if (selectedPeopleIds.length === 0) {
      setToast('⚠️ Selecione pelo menos uma pessoa para criar a cápsula.');
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setActivePersonIndex(0);
    setViewMode('configure_person_details');
  };

  // Salva dados da pessoa atual e avança para a próxima ou conclui criação
  const handleSavePersonAndNext = (details) => {
    // Atualiza os dados da pessoa ativa
    const updatedPeople = [...detectedPeopleList];
    const currentP = selectedPeople[activePersonIndex];
    if (currentP) {
      const pIdx = updatedPeople.findIndex((p) => p.id === currentP.id);
      if (pIdx !== -1) {
        updatedPeople[pIdx] = {
          ...updatedPeople[pIdx],
          ...details,
        };
        setDetectedPeopleList(updatedPeople);
      }
    }

    // Se ainda houver pessoas pendentes no lote
    if (activePersonIndex < selectedPeople.length - 1) {
      const nextIndex = activePersonIndex + 1;
      setActivePersonIndex(nextIndex);
      const nextP = selectedPeople[nextIndex];
      setToast(`✨ Dados de ${details.name} salvos! Próxima pessoa: ${nextP.name || 'Pessoa ' + (nextIndex + 1)}`);
      setTimeout(() => setToast(null), 3500);
    } else {
      // Cria as cápsulas individuais para todas as pessoas preenchidas mantendo sempre as iniciais
      const activeUploadPhotos = memoriesService.getActivePhotosForCapsules() || [];
      const originalFallback = capsulesService.findOriginalUploadedPhotos();
      const newIndividualCapsules = selectedPeople.map((p, idx) => {
        const finalName = p.id === currentP?.id ? details.name : (p.name || 'Pessoa Especial');
        const finalRel = p.id === currentP?.id ? details.relationship : (p.relationship || 'Familiar');
        const personPhotos = (Array.isArray(p.photos) && p.photos.length > 0)
          ? p.photos
          : (activeUploadPhotos.length > 0 ? activeUploadPhotos : (originalFallback.length > 0 ? originalFallback : (p.avatar ? [{ id: `photo-${Date.now()}`, img: p.avatar, title: 'Foto de ' + finalName, dateLabel: 'Hoje' }] : [])));
        const photosLabel = `${personPhotos.length} ${personPhotos.length === 1 ? 'foto' : 'fotos'}`;
        return {
          id: `cap-auto-${Date.now()}-${idx}`,
          title: `Cápsula: Presente para ${finalName}`,
          recipient: `${finalName} (${finalRel})`,
          avatar: p.avatar,
          sealColor: idx % 2 === 0 ? '#F05A47' : '#7E57C2',
          personId: p.id,
          photosCount: photosLabel,
          photos: personPhotos,
        };
      });

      const updated = capsulesService.addCapsules(newIndividualCapsules);
      setCapsules(updated);
      memoriesService.setActivePhotosForCapsules([]);

      setToast(`✨ ${selectedPeople.length} cápsula(s) individual(is) criada(s) com sucesso! Acesse abaixo.`);
      setTimeout(() => setToast(null), 4500);
      setViewMode('list');
    }
  };

  // Pular a pessoa atual
  const handleSkipPerson = () => {
    if (activePersonIndex < selectedPeople.length - 1) {
      setActivePersonIndex((prev) => prev + 1);
    } else {
      memoriesService.setActivePhotosForCapsules([]);
      setCapsules(capsulesService.getCapsules());
      setViewMode('list');
    }
  };

  const currentPhotosList = curatingCapsule?.photos !== undefined
    ? curatingCapsule.photos
    : CURATION_PHOTOS;

  const activePhoto = (currentPhotosList && currentPhotosList.length > 0)
    ? (currentPhotosList[currentPhotoIdx] || currentPhotosList[0])
    : null;

  // Grava a história e as emoções da foto atual (aparelho + servidor)
  const persistCurrentStory = () => {
    if (!curatingCapsule?.id || !activePhoto?.id) return;
    const sameStory = (activePhoto.story || '') === storyText;
    const sameEmotions = JSON.stringify(activePhoto.emotions || []) === JSON.stringify(selectedEmotions || []);
    if (sameStory && sameEmotions) return;
    const photoId = activePhoto.id;
    setCuratingCapsule((prev) =>
      prev
        ? {
            ...prev,
            photos: (prev.photos || []).map((p) =>
              p.id === photoId ? { ...p, story: storyText, emotions: selectedEmotions } : p
            ),
          }
        : prev
    );
    capsulesService.updatePhotoStory(curatingCapsule.id, photoId, storyText, selectedEmotions).catch(() => {});
  };

  const handleSelectPhoto = (idx) => {
    if (!currentPhotosList || currentPhotosList.length === 0) return;
    persistCurrentStory();
    setCurrentPhotoIdx(idx);
    const photo = currentPhotosList[idx];
    setStoryText(photo?.story || '');
    setSelectedEmotions(photo?.emotions || ['Gratidão', 'Amor']);
    setIsPlayingVoice(false);
  };

  const handleNextPhoto = () => {
    if (!currentPhotosList || currentPhotosList.length === 0) return;
    const nextIdx = (currentPhotoIdx + 1) % currentPhotosList.length;
    handleSelectPhoto(nextIdx);
    setCuratingCapsule((prev) => ({
      ...prev,
      narratedPhotos: Math.min(prev.totalPhotos, (prev.narratedPhotos || 0) + 1),
    }));
    setToast(`Memória salva! Avançando para a foto ${nextIdx + 1} de ${currentPhotosList.length}...`);
    setTimeout(() => setToast(null), 3000);
  };

  const handlePrevPhoto = () => {
    if (!currentPhotosList || currentPhotosList.length === 0) return;
    const prevIdx = currentPhotoIdx > 0 ? currentPhotoIdx - 1 : currentPhotosList.length - 1;
    handleSelectPhoto(prevIdx);
  };

  const toggleEmotion = (emotion) => {
    setSelectedEmotions((prev) =>
      prev.includes(emotion) ? prev.filter((e) => e !== emotion) : [...prev, emotion]
    );
  };

  const handleGenerateAvatar = () => {
    setIsTalkingAvatarModalOpen(true);
  };

  const handleSuggestPhotoStory = async () => {
    if (isGeneratingStoryAi) return;
    setIsGeneratingStoryAi(true);
    try {
      const recipientClean = curatingCapsule?.recipient
        ? curatingCapsule.recipient.split('(')[0].trim()
        : '';
      const result = await localAiService.generatePhotoStory({
        photoTitle: activePhoto?.title || `Foto ${currentPhotoIdx + 1}`,
        dateLabel: activePhoto?.dateLabel || 'Hoje',
        emotions: selectedEmotions,
        recipientName: recipientClean,
        currentDraft: storyText,
      });
      if (result?.story) {
        setStoryText(result.story);
        setToast('✨ História deste momento sugerida com sucesso!');
        setTimeout(() => setToast(null), 3500);
      }
    } catch (err) {
      console.warn('[CapsulesView] Erro ao sugerir história da foto:', err);
    } finally {
      setIsGeneratingStoryAi(false);
    }
  };

  const handleSaveAvatarVideo = (videoItem) => {
    const updated = curatingCapsule?.id ? capsulesService.addCapsuleVideo(curatingCapsule.id, videoItem) : null;
    if (updated) {
      setCuratingCapsule((prev) => (prev ? { ...prev, videos: updated.videos } : prev));
      setToast('Vídeo do Avatar salvo nesta cápsula e enviado ao cofre.');
    } else {
      setToast('Abra uma cápsula para salvar o vídeo do avatar.');
    }
    setTimeout(() => setToast(null), 4000);
  };

  const handleSaveRecordedVoice = (savedAudio) => {
    if (savedAudio?.audioBlob) {
      setCurrentVoiceAudioBlob(savedAudio.audioBlob);
    }
    if (curatingCapsule?.id && savedAudio) {
      const updated = capsulesService.setCalibrationAudio(curatingCapsule.id, savedAudio);
      if (updated) {
        setCuratingCapsule((prev) => (prev ? { ...prev, calibrationAudio: updated.calibrationAudio } : prev));
      }
    }
    setToast('Áudio de narração e calibração salvo com sucesso!');
    setTimeout(() => setToast(null), 3500);
  };

  const handleSaveDraft = () => {
    persistCurrentStory();
    setToast(t('capsulesView.draftSavedToast'));
    setTimeout(() => setToast(null), 3500);
  };

  const toggleAudio = (id) => {
    setSelectedAudios((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleVideo = (id) => {
    setSelectedVideos((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleAlbum = (id) => {
    setSelectedAlbums((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSaveCurrentCapsule = () => {
    const newCap = {
      id: `cap-${Date.now()}`,
      title: capsuleTitle || `Cápsula para ${currentPerson?.name}`,
      recipient: `${currentPerson?.name} (${currentPerson?.relationship})`,
      avatar: currentPerson?.avatar,
      triggerLabel:
        triggerType === 'posthumous'
          ? 'Liberação Póstuma (Guardiões)'
          : triggerDate || 'Data Futura Agendada',
      contentsSummary: `${selectedAudios.length} Áudio(s) • ${selectedVideos.length} Vídeo(s) • ${selectedAlbums.length} Álbum(ns)`,
      sealColor: triggerType === 'posthumous' ? '#7E57C2' : '#F05A47',
      statusText: 'Cápsula Selada com Criptografia',
    };

    setCapsules((prev) => [newCap, ...prev]);

    if (activePersonIndex < selectedPeople.length - 1) {
      const nextIdx = activePersonIndex + 1;
      setActivePersonIndex(nextIdx);
      const nextPerson = selectedPeople[nextIdx];
      setCapsuleTitle(`Cápsula de Memórias para ${nextPerson?.name}`);
      setToast(`Cápsula de ${currentPerson?.name} salva! Configurando para ${nextPerson?.name}...`);
      setTimeout(() => setToast(null), 3000);
    } else {
      setViewMode('list');
      setToast(`${selectedPeople.length} cápsula(s) do tempo criadas e seladas com sucesso!`);
      setTimeout(() => setToast(null), 5000);
    }
  };


  return (
    <div className="capsules-screen-container fade-in">
      {/* Input invisível para upload direto de fotos na tela de cápsulas */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleDirectUpload}
      />
      {/* -------------------------------------------------------------
          MODO 1: LISTAGEM DE CÁPSULAS CRIADAS
         ------------------------------------------------------------- */}
      {viewMode === 'list' && (
        <>
          <div className="capsules-breadcrumb">
            <span className="breadcrumb-parent" onClick={() => onNavigateTab && onNavigateTab('vault')}>
              {t('nav.vault')}
            </span>
            <span className="breadcrumb-arrow">&gt;</span>
            <span className="breadcrumb-current">{t('capsulesView.title')}</span>
          </div>

          <div className="capsules-header-row">
            <div className="capsules-header-text">
              <h1 className="capsules-main-title">{t('capsulesView.title')}</h1>
              <p className="capsules-main-subtitle">
                {t('capsulesView.subtitle')}
              </p>
            </div>

            <button type="button" className="btn-create-capsule-primary" onClick={handleStartCreate}>
              <i className="fa-solid fa-plus"></i> {t('capsulesView.createBtn')}
            </button>
          </div>

          {toast && (
            <div className="capsules-toast-banner">
              <i className="fa-solid fa-circle-check"></i>
              <span>{toast}</span>
            </div>
          )}

          <div className="capsules-cards-grid">
            {capsules.length === 0 ? (
              <div className="capsules-empty-state-card">
                <div className="capsules-empty-icon-wrapper">
                  <i className="fa-solid fa-box-archive"></i>
                </div>
                <h3 className="capsules-empty-title">Nenhuma cápsula criada ainda</h3>
                <p className="capsules-empty-desc">
                  Guarde mensagens em áudio, fotos e vídeos para serem entregues no futuro ou em datas especiais.
                </p>
                <button type="button" className="btn-create-capsule-primary" onClick={handleStartCreate}>
                  <i className="fa-solid fa-plus"></i> Criar Minha Primeira Cápsula
                </button>
              </div>
            ) : (
              capsules.map((cap) => (
              <div
                key={cap.id}
                className="capsule-box-card clickable-capsule-card"
                onClick={() => handleOpenCapsule(cap)}
                title={t('capsulesView.openAndNarrate')}
              >
                <div className="capsule-card-topbar">
                  <div className="capsule-seal-icon" style={{ backgroundColor: cap.sealColor }}>
                    <i className="fa-solid fa-gift"></i>
                  </div>
                  <div className="capsule-topbar-actions">
                    <span className="capsule-type-pill">{t('capsulesView.title').toUpperCase()}</span>
                    <button
                      type="button"
                      className="btn-delete-capsule-card"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRequestDeleteCapsule(cap);
                      }}
                      title="Excluir cápsula"
                    >
                      <i className="fa-regular fa-trash-can"></i>
                    </button>
                  </div>
                </div>

                <div className="capsule-card-body">
                  <h3 className="capsule-card-title">{cap.title}</h3>
                  
                  <div className="capsule-guardian-recipient">
                    {cap.avatar ? (
                      <img src={cap.avatar} alt={cap.recipient} className="capsule-guardian-avatar" />
                    ) : (
                      <div className="capsule-guardian-avatar avatar-icon-placeholder" role="img" aria-label={cap.recipient}>
                        <i className="fa-solid fa-user" aria-hidden="true" />
                      </div>
                    )}
                    <div className="capsule-guardian-info">
                      <span className="guardian-role-label">{t('capsulesView.recipientLabel')}</span>
                      <strong className="guardian-name-val">{cap.recipient}</strong>
                    </div>
                  </div>

                  <div className="capsule-trigger-box">
                    <i className="fa-regular fa-clock"></i>
                    <span>{cap.triggerLabel}</span>
                  </div>

                  {cap.contentsSummary && (
                    <p className="capsule-contents-desc">
                      <i className="fa-solid fa-box-archive"></i> {cap.contentsSummary}
                    </p>
                  )}
                </div>

                <div className="capsule-card-footer">
                  <span className="capsule-encrypted-badge">
                    <i className="fa-solid fa-lock"></i> {cap.statusText}
                  </span>
                  <span className="capsule-open-hint">
                    {t('capsulesView.openAndNarrate')} <i className="fa-solid fa-arrow-right"></i>
                  </span>
                </div>
              </div>
            )))}
          </div>
        </>
      )}

      {/* -------------------------------------------------------------
          MODO 2: TELA "PESSOAS QUE IMPORTAM" (EXATO COMO O MOCKUP)
         ------------------------------------------------------------- */}
      {viewMode === 'select_people' && (
        <SelectPeopleGrid
          detectedPeopleList={detectedPeopleList}
          selectedPeopleIds={selectedPeopleIds}
          onToggleSelect={togglePersonSelection}
          totalPhotosAnalyzed={totalPhotosAnalyzed}
          isAnalyzing={isAnalyzingFaces}
          onUploadMore={() => fileInputRef.current?.click()}
          onSkip={() => setViewMode('list')}
          onProceed={handleProceedToConfigure}
          maxAllowed={maxAllowedPeople}
          planName={currentPlan.name}
        />
      )}

      {/* -------------------------------------------------------------
          MODO 2.5: QUEM É ESSA PESSOA ESPECIAL? (PASSO A PASSO POR PESSOA)
         ------------------------------------------------------------- */}
      {viewMode === 'configure_person_details' && (
        <SpecialPersonFormCard
          person={currentPerson}
          personIndex={activePersonIndex}
          totalPersons={selectedPeople.length}
          onBack={() => setViewMode('select_people')}
          onSaveAndNext={handleSavePersonAndNext}
          onSkip={handleSkipPerson}
        />
      )}

      {/* -------------------------------------------------------------
          MODO 3: CONFIGURAR DETALHES DA CÁPSULA PARA CADA PESSOA SELECIONADA
         ------------------------------------------------------------- */}
      {viewMode === 'configure_details' && (
        <div className="capsule-config-container fade-in">
          <div className="config-topbar">
            <button
              type="button"
              className="btn-back-shortcut"
              onClick={() => setViewMode('select_people')}
            >
              <i className="fa-solid fa-arrow-left"></i> {t('capsulesView.backToPeople')}
            </button>
            <span className="config-step-count">
              {t('capsulesView.configuringStep', { current: activePersonIndex + 1, total: selectedPeople.length, name: currentPerson?.name })}
            </span>
          </div>

          <div className="config-card">
            <div className="config-card-header">
              {currentPerson?.avatar ? (
                <img src={currentPerson.avatar} alt={currentPerson.name} className="config-avatar-img" />
              ) : (
                <div className="config-avatar-img avatar-icon-placeholder" role="img" aria-label={currentPerson?.name}>
                  <i className="fa-solid fa-user" aria-hidden="true" />
                </div>
              )}
              <div className="config-header-text">
                <h2>{t('capsulesView.specialCapsuleFor', { name: currentPerson?.name })}</h2>
                <span className="config-rel-badge">{t('capsulesView.guardianRecipient')} • {currentPerson?.relationship} ({currentPerson?.photosCount})</span>
              </div>
            </div>

            <div className="config-form-group">
              <label className="config-label">{t('capsulesView.capsuleTitleLabel')}</label>
              <input
                type="text"
                className="capsule-input-field"
                value={capsuleTitle}
                onChange={(e) => setCapsuleTitle(e.target.value)}
                placeholder={t('capsulesView.capsuleTitlePlaceholder')}
              />
            </div>

            {/* Mídias: Áudios */}
            <div className="config-form-group">
              <label className="config-label">{t('capsulesView.voiceMessagesLabel')}</label>
              <div className="media-selector-list">
                {AVAILABLE_AUDIOS.map((aud) => {
                  const isChecked = selectedAudios.includes(aud.id);
                  return (
                    <div
                      key={aud.id}
                      className={`media-select-row ${isChecked ? 'active' : ''}`}
                      onClick={() => toggleAudio(aud.id)}
                    >
                      <input type="checkbox" checked={isChecked} onChange={() => {}} />
                      <div className="media-icon-disc audio"><i className="fa-solid fa-microphone"></i></div>
                      <div className="media-details">
                        <strong>{aud.title}</strong>
                        <span>{aud.duration} • {aud.date}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mídias: Vídeos */}
            <div className="config-form-group">
              <label className="config-label">{t('capsulesView.videoMessagesLabel')}</label>
              <div className="media-selector-list">
                {AVAILABLE_VIDEOS.map((vid) => {
                  const isChecked = selectedVideos.includes(vid.id);
                  return (
                    <div
                      key={vid.id}
                      className={`media-select-row ${isChecked ? 'active' : ''}`}
                      onClick={() => toggleVideo(vid.id)}
                    >
                      <input type="checkbox" checked={isChecked} onChange={() => {}} />
                      <div className="media-icon-disc video"><i className="fa-solid fa-video"></i></div>
                      <div className="media-details">
                        <strong>{vid.title}</strong>
                        <span>{vid.duration} • {vid.quality}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mídias: Álbuns de Momentos */}
            <div className="config-form-group">
              <label className="config-label">{t('capsulesView.albumsLabel')}</label>
              <div className="media-selector-list">
                {AVAILABLE_ALBUMS.map((alb) => {
                  const isChecked = selectedAlbums.includes(alb.id);
                  return (
                    <div
                      key={alb.id}
                      className={`media-select-row ${isChecked ? 'active' : ''}`}
                      onClick={() => toggleAlbum(alb.id)}
                    >
                      <input type="checkbox" checked={isChecked} onChange={() => {}} />
                      <div className="media-icon-disc album"><i className="fa-solid fa-images"></i></div>
                      <div className="media-details">
                        <strong>{alb.title}</strong>
                        <span>{alb.count}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Carta ou Mensagem Escrita */}
            <div className="config-form-group">
              <label className="config-label">{t('capsulesView.letterLabel')}</label>
              <textarea
                rows="4"
                className="capsule-textarea"
                placeholder={t('capsulesView.letterPlaceholder', { name: currentPerson?.name })}
                value={letterContent}
                onChange={(e) => setLetterContent(e.target.value)}
              ></textarea>
            </div>

            {/* Regra de Liberação / Gatilho */}
            <div className="config-form-group">
              <label className="config-label">{t('capsulesView.releaseRuleLabel')}</label>
              <div className="trigger-toggle-row">
                <button
                  type="button"
                  className={`btn-trigger-opt ${triggerType === 'date' ? 'active' : ''}`}
                  onClick={() => setTriggerType('date')}
                >
                  <i className="fa-regular fa-calendar-check"></i> {t('capsulesView.futureDate')}
                </button>
                <button
                  type="button"
                  className={`btn-trigger-opt ${triggerType === 'posthumous' ? 'active' : ''}`}
                  onClick={() => setTriggerType('posthumous')}
                >
                  <i className="fa-solid fa-shield-heart"></i> {t('capsulesView.posthumousRelease')}
                </button>
              </div>
            </div>

            {triggerType === 'date' && (
              <div className="config-form-group">
                <label className="config-label">{t('capsulesView.targetDate')}</label>
                <input
                  type="date"
                  className="capsule-input-field"
                  value={triggerDate}
                  onChange={(e) => setTriggerDate(e.target.value)}
                />
              </div>
            )}

            <div className="config-footer">
              <button
                type="button"
                className="btn-skip-person"
                onClick={() => setViewMode('select_people')}
              >
                {t('capsulesView.backToSelection')}
              </button>
              <button
                type="button"
                className="btn-finish-capsule"
                onClick={handleSaveCurrentCapsule}
              >
                {activePersonIndex < selectedPeople.length - 1
                  ? t('capsulesView.saveAndNext')
                  : t('capsulesView.sealCapsule')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
          MODO: DETALHES DA CÁPSULA CRIADA
         ------------------------------------------------------------- */}
      {viewMode === 'detail' && curatingCapsule && (
        <div className="capsule-detail-wrap fade-in">
          <div className="detail-top-bar">
            <button
              type="button"
              className="btn-back-shortcut"
              onClick={() => setViewMode('list')}
            >
              <i className="fa-solid fa-arrow-left"></i> {t('capsulesView.backToCapsules')}
            </button>
          </div>

          {/* Header da Cápsula */}
          <div className="capsule-detail-header-card">
            <div className="cd-header-main">
              {curatingCapsule.avatar ? (
                <img src={curatingCapsule.avatar} alt="Avatar" className="cd-avatar" />
              ) : (
                <div className="cd-avatar cd-avatar-placeholder">
                  <i className="fa-solid fa-user"></i>
                </div>
              )}
              <div className="cd-header-info">
                <div className="cd-title-row">
                  <h2 className="cd-recipient-name">{curatingCapsule.recipientName}</h2>
                  <span className="cd-rel-badge">{curatingCapsule.relationship}</span>
                  <span className="cd-status-badge">{t('capsulesView.inProduction')}</span>
                  <button type="button" className="cd-btn-edit-details" onClick={handleOpenEditDetails}>
                    {t('capsulesView.editDetails')}
                  </button>
                  <button
                    type="button"
                    className="cd-btn-delete-capsule"
                    onClick={() => handleRequestDeleteCapsule(curatingCapsule)}
                    title="Excluir esta cápsula"
                  >
                    <i className="fa-regular fa-trash-can"></i> Excluir Cápsula
                  </button>
                </div>
                <p className="cd-quote">{curatingCapsule.quote || t('capsulesView.quoteGeneric', 'Uma mensagem de amor e legado para o futuro.')}</p>
              </div>
              <div className="cd-header-right">
                <a href="#" className="cd-view-all-link" onClick={(e) => { e.preventDefault(); setViewMode('list'); }}>
                  {t('capsulesView.viewAllCapsules')}
                </a>
              </div>
            </div>
          </div>

          {/* Botões de Ação Rapida */}
          <div className="cd-quick-actions">
            <button
              className="cd-quick-btn"
              type="button"
              onClick={() => {
                setCurrentPhotoIdx(0);
                setViewMode('curate_capsule');
              }}
            >
              <i className="fa-regular fa-images"></i> {curatingCapsule.photos?.length > 0 ? 'Ver / Narrar Álbum' : t('capsulesView.createAlbum')}
            </button>
            <button
              className="cd-quick-btn active-highlight"
              type="button"
              onClick={() => setViewMode('write_message')}
            >
              <i className="fa-solid fa-pen"></i> {t('capsulesView.writeMessage')}
            </button>
            <button
              className="cd-quick-btn"
              type="button"
              onClick={() => setViewMode('record_voice')}
            >
              <i className="fa-solid fa-microphone"></i> {t('capsulesView.recordVoice')}
            </button>
            <button
              className="cd-quick-btn"
              type="button"
              onClick={() => setViewMode('record_video')}
            >
              <i className="fa-solid fa-video"></i> {t('capsulesView.recordVideo')}
            </button>
          </div>

          {/* Conteúdo da Cápsula */}
          <div className="cd-content-section">
            <div className="cd-section-header">
              <h3>{t('capsulesView.contentsTitle')}</h3>
              {(() => {
                const hasAlbum = (curatingCapsule.photos?.length || 0) > 0;
                const hasVoice = Boolean(curatingCapsule.hasVoice || curatingCapsule.voiceAudio || (curatingCapsule.audios && curatingCapsule.audios.length > 0));
                const hasText = Boolean(curatingCapsule.letterContent || (curatingCapsule.messages && curatingCapsule.messages.length > 0));
                const count = (hasAlbum ? 1 : 0) + (hasVoice ? 1 : 0) + (hasText ? 1 : 0);
                return <span className="cd-items-count">{t('capsulesView.itemsCount', { count })}</span>;
              })()}
            </div>

            <div className="cd-items-list">
              {/* Álbum */}
              {curatingCapsule.photos && curatingCapsule.photos.length > 0 && (
                <div className="cd-item-row">
                  <div className="cd-item-icon bg-red-subtle">
                    <i className="fa-regular fa-images text-red"></i>
                  </div>
                  <div className="cd-item-details">
                    <h4>{t('capsulesView.photoAlbum')}</h4>
                    <p>
                      {curatingCapsule.photos.length} {curatingCapsule.photos.length === 1 ? 'foto' : 'fotos'} • {curatingCapsule.narratedPhotos || 0} narradas
                    </p>
                  </div>
                  <div className="cd-item-actions">
                    <button
                      className="cd-btn-link"
                      type="button"
                      onClick={() => {
                        setCurrentPhotoIdx(0);
                        setViewMode('curate_capsule');
                      }}
                    >
                      {t('capsulesView.view')}
                    </button>
                    <div
                      className="cd-btn-action-primary"
                      onClick={() => {
                        setCurrentPhotoIdx(0);
                        setViewMode('curate_capsule');
                      }}
                    >
                      <span>{t('capsulesView.continueNarrating')}</span>
                      <div className="cd-progress-bar">
                        <div
                          className="cd-progress-fill"
                          style={{
                            width: `${Math.max(15, Math.min(100, Math.round(((curatingCapsule.narratedPhotos || 0) / curatingCapsule.photos.length) * 100)))}%`
                          }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Voz Real */}
              {(curatingCapsule.hasVoice || curatingCapsule.voiceAudio || (curatingCapsule.audios && curatingCapsule.audios.length > 0)) && !curatingCapsule.removedContentItems?.includes('voice') && (
                <div className="cd-item-row">
                  <div className="cd-item-icon bg-red-subtle">
                    <i className="fa-solid fa-microphone text-red"></i>
                  </div>
                  <div className="cd-item-details">
                    <h4>{curatingCapsule.voiceAudio?.title || t('capsulesView.voiceMessage')}</h4>
                    <p>
                      {curatingCapsule.voiceAudio?.duration
                        ? `Depoimento gravado com a sua própria voz • ${curatingCapsule.voiceAudio.duration}`
                        : 'Depoimento gravado com a sua própria voz'}
                    </p>
                  </div>
                  <div className="cd-item-actions-right">
                    <button
                      type="button"
                      className="cd-play-pill"
                      onClick={() => handleTogglePlayCapsuleVoice(curatingCapsule.voiceAudio || curatingCapsule.audios?.[0])}
                      title={isPlayingCapsuleVoice ? 'Pausar áudio' : 'Ouvir mensagem de voz'}
                    >
                      <i className={`fa-solid ${isPlayingCapsuleVoice ? 'fa-circle-pause' : 'fa-circle-play'} text-red`}></i>
                      <span>{isPlayingCapsuleVoice ? 'Pausar' : 'Áudio Salvo'}</span>
                    </button>
                    <button
                      type="button"
                      className="btn-delete-content-row"
                      onClick={() => setItemToDelete({
                        type: 'voice',
                        capsuleId: curatingCapsule.id,
                        itemId: 'voice',
                        title: curatingCapsule.voiceAudio?.title || t('capsulesView.voiceMessage') || 'Mensagem de Voz',
                      })}
                      title="Excluir este arquivo de voz desta cápsula"
                    >
                      <i className="fa-regular fa-trash-can"></i>
                    </button>
                  </div>
                </div>
              )}

              {/* Texto Real */}
              {(curatingCapsule.letterContent || (curatingCapsule.messages && curatingCapsule.messages.length > 0)) && (
                <div className="cd-item-row">
                  <div className="cd-item-icon bg-gray-subtle">
                    <i className="fa-solid fa-file-lines text-gray"></i>
                  </div>
                  <div className="cd-item-details">
                    <h4>{t('capsulesView.textMessage')}</h4>
                    <p>Carta biográfica e mensagem personalizada</p>
                  </div>
                  <div className="cd-item-actions-right">
                    <span className="cd-draft-badge">{t('capsulesView.draftBadge')}</span>
                    <button
                      type="button"
                      className="btn-delete-content-row"
                      onClick={() => setItemToDelete({
                        type: 'text',
                        capsuleId: curatingCapsule.id,
                        itemId: 'text',
                        title: t('capsulesView.textMessage') || 'Carta em Texto',
                      })}
                      title="Excluir este arquivo de texto desta cápsula"
                    >
                      <i className="fa-regular fa-trash-can"></i>
                    </button>
                  </div>
                </div>
              )}

              {/* Se nenhum item foi adicionado ainda a esta cápsula */}
              {(!curatingCapsule.photos || curatingCapsule.photos.length === 0) &&
                !(curatingCapsule.hasVoice || curatingCapsule.voiceAudio || (curatingCapsule.audios && curatingCapsule.audios.length > 0)) &&
                !(curatingCapsule.letterContent || (curatingCapsule.messages && curatingCapsule.messages.length > 0)) && (
                  <div className="cd-empty-items-notice">
                    <i className="fa-solid fa-folder-open"></i>
                    <span>Nenhum arquivo adicionado ainda a esta cápsula. Use os botões acima para gravar voz, escrever uma carta, registrar um vídeo ou adicionar fotos.</span>
                  </div>
              )}
            </div>

            {/* Galeria de Fotos Reais da Cápsula (Fotos que foram feito o upload) */}
            {curatingCapsule.photos && curatingCapsule.photos.length > 0 ? (
              <div className="cd-capsule-photos-section">
                <div className="cd-capsule-photos-header">
                  <div className="cd-photos-title-group">
                    <h4 className="cd-photos-title">
                      <i className="fa-regular fa-images text-red"></i> Fotos Desta Cápsula ({curatingCapsule.photos.length})
                    </h4>
                    <span className="cd-photos-subtitle">
                      Fotos vinculadas e prontas para narração de memórias
                    </span>
                  </div>
                  <div className="cd-photos-actions-group">
                    <button
                      type="button"
                      className="btn-add-photos-capsule-shortcut"
                      onClick={() => fileInputRef.current?.click()}
                      title="Adicionar mais fotos diretamente a esta cápsula"
                    >
                      <i className="fa-solid fa-cloud-arrow-up"></i> Adicionar Fotos
                    </button>
                    <button
                      type="button"
                      className="btn-narrate-photos-shortcut"
                      onClick={() => {
                        setCurrentPhotoIdx(0);
                        setViewMode('curate_capsule');
                      }}
                    >
                      <i className="fa-solid fa-microphone"></i> Narrar Fotos
                    </button>
                  </div>
                </div>

                <div className="cd-capsule-photos-grid">
                  {curatingCapsule.photos.map((ph, idx) => (
                    <div
                      key={ph.id || idx}
                      className="cd-photo-card-item"
                      onClick={() => {
                        handleSelectPhoto(idx);
                        setViewMode('curate_capsule');
                      }}
                      title={`Clique para abrir e narrar o momento ${idx + 1}`}
                    >
                      <div className="cd-photo-card-img-wrap">
                        <img src={ph.img} alt={ph.title || `Foto ${idx + 1}`} className="cd-photo-card-img" />
                        <div className="cd-photo-badge-num">#{idx + 1}</div>
                        <button
                          type="button"
                          className="btn-delete-photo-item"
                          onClick={(e) => {
                            e.stopPropagation();
                            setItemToDelete({
                              type: 'photo',
                              capsuleId: curatingCapsule.id,
                              itemId: ph.id,
                              title: ph.title || `Foto #${idx + 1}`,
                            });
                          }}
                          title="Remover esta foto desta cápsula"
                        >
                          <i className="fa-regular fa-trash-can"></i>
                        </button>
                      </div>
                      <div className="cd-photo-card-meta">
                        <span className="cd-photo-date-label">{ph.dateLabel || 'Hoje'}</span>
                        <span className="cd-photo-narrate-action">
                          <i className="fa-solid fa-microphone"></i> Narrar
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="cd-capsule-photos-empty-box">
                <div className="cd-photos-empty-content">
                  <div className="cd-photos-empty-icon">
                    <i className="fa-regular fa-images"></i>
                  </div>
                  <div>
                    <h4>Nenhuma foto vinculada a esta cápsula</h4>
                    <p>Adicione fotos diretamente aqui sem acionar identificação de rostos.</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-add-photos-capsule-shortcut primary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <i className="fa-solid fa-cloud-arrow-up"></i> Adicionar Fotos
                </button>
              </div>
            )}

            <div className="cd-footer-banner">
              <i className="fa-regular fa-heart text-red"></i> {t('capsulesView.capsuleGrowing')}
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
          MODO 4: CURADORIA E NARRAÇÃO DA CÁPSULA (EXATO AO NOVO MOCKUP)
         ------------------------------------------------------------- */}
      {viewMode === 'curate_capsule' && (
        <div className="curation-screen-wrap fade-in">
          {/* Header Superior com Avatar, Título, Progresso e Voltar */}
          <div className="curation-top-header">
            <div className="curation-header-left">
              {curatingCapsule.avatar ? (
                <img
                  src={curatingCapsule.avatar}
                  alt={curatingCapsule.recipientName}
                  className="curation-recipient-avatar"
                />
              ) : (
                <div className="curation-recipient-avatar cd-avatar-placeholder">
                  <i className="fa-solid fa-user"></i>
                </div>
              )}
              <div className="curation-header-info">
                <div className="curation-title-row">
                  <h1 className="curation-main-title">{curatingCapsule.title}</h1>
                  <span className="curation-relationship-pill">{curatingCapsule.relationship}</span>
                </div>
                <div className="curation-progress-row">
                  <span className="curation-progress-label">
                    {t('capsulesView.progress')} <strong className="progress-highlight">{t('capsulesView.narratedPhotosCount', { narrated: curatingCapsule.narratedPhotos, total: curatingCapsule.totalPhotos })}</strong>
                  </span>
                  <div className="curation-progress-bar-track">
                    <div
                      className="curation-progress-bar-fill"
                      style={{ width: `${(curatingCapsule.narratedPhotos / curatingCapsule.totalPhotos) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="curation-header-right">
              <button
                type="button"
                className="btn-back-curation"
                onClick={() => setViewMode('detail')}
              >
                {t('capsulesView.backToCuration')}
              </button>
            </div>
          </div>

          <div className="curation-divider-line"></div>

          {/* Grid Principal com Foto à Esquerda e Narração à Direita */}
          {currentPhotosList.length === 0 ? (
            <div className="curation-empty-photos-box">
              <div className="curation-empty-icon-wrap">
                <i className="fa-regular fa-images"></i>
              </div>
              <h3 className="curation-empty-title">Nenhuma foto restante nesta cápsula</h3>
              <p className="curation-empty-desc">
                Todas as fotos individuais foram removidas desta cápsula.
                As demais cápsulas e seus respectivos arquivos permanecem 100% intactos e independentes.
              </p>
              <div className="curation-empty-actions">
                <button
                  type="button"
                  className="btn-curation-empty-upload"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <i className="fa-solid fa-cloud-arrow-up"></i> Adicionar Novas Fotos
                </button>
                <button
                  type="button"
                  className="btn-curation-empty-back"
                  onClick={() => setViewMode('detail')}
                >
                  Voltar aos Detalhes da Cápsula
                </button>
              </div>
            </div>
          ) : (
            <div className="curation-main-grid">
              {/* Coluna Esquerda: Foto Ativa em Destaque + Carrossel */}
              <div className="curation-left-col">
                <div className="curation-photo-display">
                  <div className="curation-photo-header-bar">
                    <span className="curation-photo-badge">
                      Foto {currentPhotoIdx + 1} de {currentPhotosList.length}
                    </span>
                    <button
                      type="button"
                      className="btn-curation-delete-photo"
                      onClick={() => setItemToDelete({
                        type: 'photo',
                        capsuleId: curatingCapsule.id,
                        itemId: activePhoto?.id,
                        title: activePhoto?.title || `Foto ${currentPhotoIdx + 1}`,
                      })}
                      title="Excluir esta foto desta cápsula"
                    >
                      <i className="fa-regular fa-trash-can"></i>
                      <span>Excluir Foto</span>
                    </button>
                  </div>
                  {activePhoto && (
                    <img
                      src={activePhoto.img}
                      alt={`Momento ${activePhoto.dateLabel || ''}`}
                      className="curation-featured-image"
                    />
                  )}
                </div>

                {/* Faixa de Fotos Selecionadas */}
                <div className="curation-thumbs-section">
                  <div className="curation-thumbs-header">
                    <h3 className="thumbs-title">{t('capsulesView.selectedPhotos')}</h3>
                    <div className="thumbs-nav-arrows">
                      <button
                        type="button"
                        className="btn-add-thumb-photo"
                        onClick={() => fileInputRef.current?.click()}
                        title="Adicionar mais fotos a esta cápsula"
                      >
                        <i className="fa-solid fa-plus"></i>
                      </button>
                      <button
                        type="button"
                        className="btn-thumb-arrow"
                        onClick={handlePrevPhoto}
                        title="Foto anterior"
                      >
                        <i className="fa-solid fa-chevron-left"></i>
                      </button>
                      <button
                        type="button"
                        className="btn-thumb-arrow"
                        onClick={handleNextPhoto}
                        title="Próxima foto"
                      >
                        <i className="fa-solid fa-chevron-right"></i>
                      </button>
                    </div>
                  </div>

                  <div className="curation-thumbs-strip">
                    {currentPhotosList.map((ph, idx) => {
                      const isActive = idx === currentPhotoIdx;
                      return (
                        <div
                          key={ph.id || idx}
                          className={`curation-thumb-box ${isActive ? 'active' : ''}`}
                          onClick={() => handleSelectPhoto(idx)}
                        >
                          <img src={ph.img} alt={`Foto ${idx + 1}`} className="thumb-mini-img" />
                          {isActive && (
                            <div className="thumb-active-check">
                              <i className="fa-solid fa-check"></i>
                            </div>
                          )}
                          <button
                            type="button"
                            className="btn-thumb-quick-delete"
                            onClick={(e) => {
                              e.stopPropagation();
                              setItemToDelete({
                                type: 'photo',
                                capsuleId: curatingCapsule.id,
                                itemId: ph.id,
                                title: ph.title || `Foto ${idx + 1}`,
                              });
                            }}
                            title={`Excluir foto ${idx + 1}`}
                          >
                            <i className="fa-solid fa-xmark"></i>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Coluna Direita: Formulário de Memória, Voz, Avatar e Emoções */}
              <div className="curation-right-col">
                <div className="curation-form-card">
                  <div className="moment-header-group">
                    <span className="moment-registered-tag">{t('capsulesView.momentRegisteredIn')}</span>
                    <h2 className="moment-date-heading">{activePhoto?.dateLabel || 'Hoje'}</h2>
                  </div>

                {/* Escreva a história deste momento */}
                <div className="curation-field-group">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label className="curation-field-label" style={{ marginBottom: 0 }}>{t('capsulesView.writeStory')}</label>
                    <button
                      type="button"
                      className="btn-open-recorder-pill"
                      onClick={handleSuggestPhotoStory}
                      disabled={isGeneratingStoryAi}
                      title="Gerar ou enriquecer a história desta foto com Inteligência Artificial"
                    >
                      <i className={`fa-solid ${isGeneratingStoryAi ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'}`}></i>{' '}
                      {isGeneratingStoryAi ? 'Gerando...' : 'Sugerir com IA'}
                    </button>
                  </div>
                  <textarea
                    rows="5"
                    className="curation-story-box"
                    value={storyText}
                    onChange={(e) => setStoryText(e.target.value)}
                    onBlur={persistCurrentStory}
                    placeholder={t('capsulesView.storyPlaceholder')}
                  ></textarea>
                </div>

                {/* Ou grave uma mensagem de voz */}
                <div className="curation-voice-section">
                  <div className="curation-voice-title-row">
                    <span className="voice-mic-circle">
                      <i className="fa-solid fa-microphone"></i>
                    </span>
                    <strong className="voice-section-title">{t('capsulesView.recordVoicePrompt')}</strong>
                    <button
                      type="button"
                      className="btn-open-recorder-pill"
                      onClick={() => setIsVoiceRecorderModalOpen(true)}
                      title="Gravar áudio ou Calibrar Voz Matriz com Teleprompter"
                    >
                      <i className="fa-solid fa-microphone-lines"></i> Gravar / Calibrar
                    </button>
                  </div>

                  <div className="curation-voice-player-bar">
                    <button
                      type="button"
                      className={`btn-voice-play ${isPlayingVoice ? 'playing' : ''}`}
                      onClick={() => setIsPlayingVoice(!isPlayingVoice)}
                      title={isPlayingVoice ? 'Pausar reprodução' : 'Ouvir mensagem de voz'}
                    >
                      <i className={`fa-solid ${isPlayingVoice ? 'fa-pause' : 'fa-play'}`}></i>
                    </button>

                    <div className="voice-waveform-visualizer">
                      {[10, 16, 22, 14, 28, 18, 12, 24, 30, 20, 16, 26, 14, 18, 22, 12, 20, 14, 10, 16].map((h, i) => (
                        <span
                          key={i}
                          className={`wave-bar ${isPlayingVoice ? 'animating' : ''}`}
                          style={{
                            height: `${h}px`,
                            animationDelay: `${i * 0.06}s`,
                          }}
                        ></span>
                      ))}
                    </div>

                    <span className="voice-duration-counter">{activePhoto.audioDuration}</span>
                  </div>
                </div>

                {/* Divisor "ou" */}
                <div className="curation-or-divider">
                  <div className="divider-line"></div>
                  <span className="divider-or-text">{t('capsulesView.orDivider')}</span>
                  <div className="divider-line"></div>
                </div>

                {/* Card Usar meu Avatar de Voz */}
                <div className="curation-avatar-box">
                  <div className="avatar-box-content">
                    <div className="avatar-mic-ring">
                      <i className="fa-solid fa-microphone-lines"></i>
                    </div>
                    <div className="avatar-box-texts">
                      <h4 className="avatar-box-title">{t('capsulesView.useVoiceAvatar')}</h4>
                      <p className="avatar-box-desc">
                        {t('capsulesView.useVoiceAvatarDesc')}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn-generate-avatar"
                    onClick={handleGenerateAvatar}
                    disabled={isGeneratingAvatarVoice}
                  >
                    <i className="fa-solid fa-microphone"></i>
                    {isGeneratingAvatarVoice ? t('capsulesView.generatingWithAvatar') : t('capsulesView.generateWithAvatar')}
                  </button>

                  <div className="avatar-premium-badge">
                    <i className="fa-solid fa-sparkles"></i>
                    <span>{t('capsulesView.premiumFeature')}</span>
                  </div>
                </div>

                {/* Como você se sente ao lembrar? */}
                <div className="curation-emotions-group">
                  <label className="emotions-title-label">{t('capsulesView.emotionsPrompt')}</label>
                  <div className="emotions-pills-row">
                    {EMOTIONS_LIST.map((emo) => {
                      const isSelected = selectedEmotions.includes(emo);
                      return (
                        <button
                          key={emo}
                          type="button"
                          className={`emotion-pill-btn ${isSelected ? 'selected' : ''}`}
                          onClick={() => toggleEmotion(emo)}
                        >
                          {emo}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Barra Flutuante de Ação no Rodapé */}
          {currentPhotosList.length > 0 && (
            <div className="curation-floating-action-bar">
              <button
                type="button"
                className="btn-save-draft"
                onClick={handleSaveDraft}
              >
                {t('capsulesView.saveDraft')}
              </button>

              <button
                type="button"
                className="btn-next-photo"
                onClick={handleNextPhoto}
              >
                {t('capsulesView.nextPhoto')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------------------
          MODO: CRIAR NOVA MENSAGEM / REDAÇÃO (EXATO AO NOVO MOCKUP)
         ------------------------------------------------------------- */}
      {viewMode === 'write_message' && (
        <NewMessageView
          capsuleId={curatingCapsule?.id}
          recipientName={curatingCapsule?.recipientName || profile?.name || 'Destinatário'}
          onNavigateTab={onNavigateTab}
          onBack={() => setViewMode('detail')}
        />
      )}

      {/* -------------------------------------------------------------
          MODO: PREPARAR MENSAGEM DE VOZ (EXATO AO NOVO MOCKUP)
         ------------------------------------------------------------- */}
      {viewMode === 'record_voice' && (
        <VoiceIdeationView
          capsuleId={curatingCapsule?.id}
          recipientName={curatingCapsule?.recipientName || profile?.name || 'Destinatário'}
          onNavigateTab={onNavigateTab}
          onBack={() => setViewMode('detail')}
          onSaveToCapsule={handleSaveVoiceToCapsule}
        />
      )}

      {/* -------------------------------------------------------------
          MODO: PREPARAR MENSAGEM DE VÍDEO (EXATO AO NOVO MOCKUP)
         ------------------------------------------------------------- */}
      {viewMode === 'record_video' && (
        <VideoIdeationView
          recipientName={curatingCapsule?.recipientName || 'Destinatário'}
          onNavigateTab={onNavigateTab}
          onBack={() => setViewMode('detail')}
          onSaveToCapsule={handleSaveAvatarVideo}
        />
      )}

      {/* -------------------------------------------------------------
          MODAL: EDITAR DETALHES E ENTREGA DA CÁPSULA
         ------------------------------------------------------------- */}
      {detailsDraft && (
        <div className="capsule-delete-modal-overlay" onClick={() => setDetailsDraft(null)}>
          <form
            className="capsule-delete-modal-box capsule-details-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveDetails}
          >
            <h3 className="capsule-delete-title">Detalhes da cápsula</h3>

            <label className="capsule-details-field">
              <span>Título</span>
              <input
                type="text"
                value={detailsDraft.title}
                onChange={(e) => setDetailsDraft((d) => ({ ...d, title: e.target.value, error: '' }))}
              />
            </label>

            <div className="capsule-details-row">
              <label className="capsule-details-field">
                <span>Destinatário</span>
                <input
                  type="text"
                  required
                  value={detailsDraft.recipientName}
                  onChange={(e) => setDetailsDraft((d) => ({ ...d, recipientName: e.target.value, error: '' }))}
                />
              </label>
              <label className="capsule-details-field">
                <span>Parentesco</span>
                <input
                  type="text"
                  value={detailsDraft.relationship}
                  onChange={(e) => setDetailsDraft((d) => ({ ...d, relationship: e.target.value, error: '' }))}
                />
              </label>
            </div>

            <fieldset className="capsule-details-delivery">
              <legend>Quando entregar</legend>
              <label className="capsule-details-radio">
                <input
                  type="radio"
                  name="capsule-delivery"
                  checked={detailsDraft.deliveryType === 'date'}
                  onChange={() => setDetailsDraft((d) => ({ ...d, deliveryType: 'date', error: '' }))}
                />
                Em uma data específica
              </label>
              {detailsDraft.deliveryType === 'date' && (
                <input
                  type="date"
                  className="capsule-details-date"
                  value={detailsDraft.date}
                  min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                  onChange={(e) => setDetailsDraft((d) => ({ ...d, date: e.target.value, error: '' }))}
                />
              )}
              <label className="capsule-details-radio">
                <input
                  type="radio"
                  name="capsule-delivery"
                  checked={detailsDraft.deliveryType === 'posthumous'}
                  onChange={() => setDetailsDraft((d) => ({ ...d, deliveryType: 'posthumous', error: '' }))}
                />
                Liberação póstuma, validada pelos guardiões
              </label>
            </fieldset>

            {detailsDraft.error && <p className="capsule-details-error" role="alert">{detailsDraft.error}</p>}

            <div className="capsule-delete-actions">
              <button type="button" className="btn-cancel-delete" onClick={() => setDetailsDraft(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn-confirm-delete capsule-details-save">
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* -------------------------------------------------------------
          MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE CÁPSULA (FULLSCREEN OVERLAY)
         ------------------------------------------------------------- */}
      {capsuleToDelete && (
        <div
          className="capsule-delete-modal-overlay"
          onClick={() => setCapsuleToDelete(null)}
        >
          <div
            className="capsule-delete-modal-box"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="capsule-delete-icon-warn">
              <i className="fa-solid fa-triangle-exclamation"></i>
            </div>
            <h3 className="capsule-delete-title">
              Excluir Cápsula?
            </h3>
            <p className="capsule-delete-desc">
              Tem certeza que deseja excluir a cápsula <strong>{capsuleToDelete.title}</strong>? Esta ação não pode ser desfeita.
            </p>
            <div className="capsule-delete-actions">
              <button
                type="button"
                className="btn-cancel-delete"
                onClick={() => setCapsuleToDelete(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-confirm-delete"
                onClick={handleConfirmDeleteCapsule}
              >
                <i className="fa-regular fa-trash-can"></i> Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
          MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE ITEM/FOTO
         ------------------------------------------------------------- */}
      {itemToDelete && (
        <div
          className="capsule-delete-modal-overlay"
          onClick={() => setItemToDelete(null)}
        >
          <div className="capsule-delete-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="capsule-delete-icon-warn">
              <i className="fa-regular fa-trash-can"></i>
            </div>
            <h3 className="capsule-delete-title">
              Excluir {itemToDelete.type === 'photo' ? 'Foto' : 'Arquivo'}?
            </h3>
            <p className="capsule-delete-desc">
              Tem certeza que deseja excluir <strong>{itemToDelete.title || (itemToDelete.type === 'photo' ? 'esta foto' : 'este arquivo')}</strong> de dentro desta cápsula?
            </p>
            <div className="capsule-delete-actions">
              <button
                type="button"
                className="btn-cancel-delete"
                onClick={() => setItemToDelete(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-confirm-delete"
                onClick={handleConfirmDeleteItem}
              >
                <i className="fa-regular fa-trash-can"></i> Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Estúdio de Avatar Falante Hiper-Realista em Vídeo */}
      <TalkingAvatarModal
        isOpen={isTalkingAvatarModalOpen}
        onClose={() => setIsTalkingAvatarModalOpen(false)}
        photoSrc={activePhoto?.img || curatingCapsule?.avatar || currentPerson?.avatar}
        allPhotos={currentPhotosList}
        voiceAudioBlob={currentVoiceAudioBlob}
        personName={curatingCapsule?.recipient || currentPerson?.name || 'Família'}
        capsuleId={curatingCapsule?.id}
        onSaveVideoToCapsule={handleSaveAvatarVideo}
      />

      {/* Modal de Gravação e Calibração de Voz Matriz */}
      <VoiceRecorderModal
        isOpen={isVoiceRecorderModalOpen}
        onClose={() => setIsVoiceRecorderModalOpen(false)}
        onSave={handleSaveRecordedVoice}
        defaultPersonName={curatingCapsule?.recipient || currentPerson?.name || 'Família'}
      />
    </div>
  );
}

