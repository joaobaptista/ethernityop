/**
 * localAiService.test.js — Testes unitários para o serviço de IA Local (Web-LLM)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import localAiService, {
  DEFAULT_MODEL,
  HIGH_QUALITY_MODEL,
  FALLBACK_LITE_MODEL,
  GENERATION_PARAMS,
  findClichePhrases,
  countWords,
  MIN_LETTER_WORDS,
} from './localAiService.js';

describe('localAiService', () => {
  let storage = {};

  beforeEach(() => {
    storage = {};
    globalThis.localStorage = {
      getItem: vi.fn((key) => storage[key] || null),
      setItem: vi.fn((key, val) => {
        storage[key] = String(val);
      }),
      removeItem: vi.fn((key) => {
        delete storage[key];
      }),
      clear: vi.fn(() => {
        storage = {};
      }),
    };
    vi.restoreAllMocks();
  });

  it('permite ativar e desativar a IA local persistindo no localStorage', () => {
    expect(localAiService.isLocalAiEnabled()).toBe(false);

    localAiService.setLocalAiEnabled(true);
    expect(localAiService.isLocalAiEnabled()).toBe(true);

    localAiService.setLocalAiEnabled(false);
    expect(localAiService.isLocalAiEnabled()).toBe(false);
  });

  it('gera sugestão via template fallback com formatação HTML quando desativado', async () => {
    localAiService.setLocalAiEnabled(false);

    const result = await localAiService.generateSuggestion({
      prompt: 'Carta de Aniversário Especial',
      recipientName: 'Mariana Silva',
      tone: 'afetuoso',
    });

    expect(result.source).toBe('template_fallback');
    expect(result.title).toContain('Mariana Silva');
    expect(result.content).toContain('<p>');
    expect(result.content).toContain('Mariana Silva');
  });

  it('detecta gênero masculino para Pedro e gera concordância correta', async () => {
    localAiService.setLocalAiEnabled(false);

    const result = await localAiService.generateSuggestion({
      prompt: 'uma mensagem de 10 anos de casamento',
      recipientName: 'Pedro',
      tone: 'afetuoso',
    });

    expect(result.source).toBe('template_fallback');
    expect(result.content).toContain('Meu querido <strong>Pedro</strong>');
    expect(result.title).toContain('Pedro');
  });

  it('gera fallback para tema livre sem lançar erro e sem citações prontas', async () => {
    localAiService.setLocalAiEnabled(false);

    const result = await localAiService.generateSuggestion({
      prompt: 'conselhos para quando eu não estiver mais aqui',
      recipientName: 'Ana',
    });

    expect(result.source).toBe('template_fallback');
    expect(result.content).toContain('Minha querida <strong>Ana</strong>');
    expect(result.content).not.toContain('<blockquote>');
    expect(findClichePhrases(result.content)).toEqual([]);
  });

  it('inclui no fallback os detalhes informados, com HTML escapado', async () => {
    localAiService.setLocalAiEnabled(false);

    const result = await localAiService.generateSuggestion({
      prompt: 'Carta de aniversário',
      details: 'o apelido <Tatá> e a viagem para Paraty',
      recipientName: 'Ana',
    });

    expect(result.content).toContain('o apelido &lt;Tatá&gt; e a viagem para Paraty');
  });

  it('varia o texto do fallback entre gerações', () => {
    const outputs = new Set();
    for (let i = 0; i < 20; i += 1) {
      outputs.add(localAiService._generateTemplateFallback('declaração de amor', 'Ana').content);
    }
    expect(outputs.size).toBeGreaterThan(1);
  });

  it('persiste a qualidade do modelo e escolhe o modelo correspondente', async () => {
    expect(localAiService.getModelQuality()).toBe('standard');

    await localAiService.setModelQuality('high');
    expect(localAiService.getModelQuality()).toBe('high');

    await localAiService.setModelQuality('invalida');
    expect(localAiService.getModelQuality()).toBe('high');
    expect(HIGH_QUALITY_MODEL).not.toBe(DEFAULT_MODEL);
  });

  it('usa parâmetros anti-repetição e reescreve quando o texto cai em clichês', async () => {
    localAiService.setLocalAiEnabled(true);
    const originalGpu = globalThis.navigator?.gpu;
    Object.defineProperty(globalThis, 'navigator', { value: { gpu: {} }, configurable: true });

    const create = vi.fn()
      .mockResolvedValueOnce({ choices: [{ message: { content: 'TITULO: Para Ana\nCONTEUDO:\nQuero eternizar esta jornada.' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'TITULO: Para Ana\nCONTEUDO:\nLembra do café na varanda?\n\nTe amo.' } }] });
    localAiService.engine = { chat: { completions: { create } } };

    try {
      const result = await localAiService.generateSuggestion({ prompt: 'declaração', recipientName: 'Ana' });

      expect(create).toHaveBeenCalledTimes(2);
      expect(create.mock.calls[0][0]).toMatchObject(GENERATION_PARAMS);
      expect(create.mock.calls[1][0].messages[1].content).toContain('"eternizar"');
      expect(result.source).toBe('local_ai');
      expect(result.title).toBe('Para Ana');
      expect(result.content).toBe('<p>Lembra do café na varanda?</p><p>Te amo.</p>');
    } finally {
      localAiService.engine = null;
      Object.defineProperty(globalThis, 'navigator', { value: { gpu: originalGpu }, configurable: true });
    }
  });

  it('monta o fallback como carta completa, com começo, meio e fim', () => {
    const result = localAiService._generateTemplateFallback('Carta de aniversário', 'Ana');
    const paragraphs = result.content.match(/<p[ >]/g) || [];

    // saudação + começo + motivo + 2 de meio + desejo + fim + assinatura
    expect(paragraphs.length).toBe(8);
    expect(countWords(result.content.replace(/<[^>]+>/g, ' '))).toBeGreaterThan(150);
  });

  it('reescreve a carta da IA quando ela vem curta demais', async () => {
    localAiService.setLocalAiEnabled(true);
    const originalGpu = globalThis.navigator?.gpu;
    Object.defineProperty(globalThis, 'navigator', { value: { gpu: {} }, configurable: true });

    const longLetter = `Querida Ana,\n\n${'Lembro do café na varanda numa tarde de chuva. '.repeat(40)}\n\nCom amor.`;
    const create = vi.fn()
      .mockResolvedValueOnce({ choices: [{ message: { content: 'TITULO: Para Ana\nCONTEUDO:\nQuerida Ana, te amo.' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: `TITULO: Para Ana\nCONTEUDO:\n${longLetter}` } }] });
    localAiService.engine = { chat: { completions: { create } } };

    try {
      const result = await localAiService.generateSuggestion({ prompt: 'declaração', recipientName: 'Ana' });

      expect(create).toHaveBeenCalledTimes(2);
      expect(create.mock.calls[1][0].messages[1].content).toContain('curta demais');
      expect(countWords(longLetter)).toBeGreaterThan(MIN_LETTER_WORDS);
      expect(result.content).toContain('Com amor.');
    } finally {
      localAiService.engine = null;
      Object.defineProperty(globalThis, 'navigator', { value: { gpu: originalGpu }, configurable: true });
    }
  });

  it('detecta gênero corretamente por lista expandida e heurística fonética', () => {
    expect(localAiService._detectGenderAndRole('Vagner').isMale).toBe(true);
    expect(localAiService._detectGenderAndRole('Thiago').isMale).toBe(true);
    expect(localAiService._detectGenderAndRole('Fabiano').isMale).toBe(true);
    expect(localAiService._detectGenderAndRole('Socorro').isMale).toBe(false);
    expect(localAiService._detectGenderAndRole('Beatriz').isMale).toBe(false);
  });

  it('não penaliza expressões de clichê se o próprio autor as escreveu no prompt', () => {
    expect(findClichePhrases('Quero eternizar esta jornada.', '')).toEqual(['eternizar', 'jornada']);
    expect(findClichePhrases('Quero eternizar esta jornada.', 'sobre a nossa jornada')).toEqual(['eternizar']);
  });

  it('faz fallback automático para FALLBACK_LITE_MODEL quando o modelo principal falha no initEngine', async () => {
    const originalGpu = globalThis.navigator?.gpu;
    Object.defineProperty(globalThis, 'navigator', { value: { gpu: {} }, configurable: true });

    const mockEngine = { chat: { completions: { create: vi.fn() } }, unload: vi.fn() };
    const createMLCEngineMock = vi.fn()
      .mockRejectedValueOnce(new Error('VRAM insuficiente'))
      .mockResolvedValueOnce(mockEngine);

    localAiService.webLlmModule = { CreateMLCEngine: createMLCEngineMock };

    try {
      const engine = await localAiService.initEngine(HIGH_QUALITY_MODEL);
      expect(engine).toBe(mockEngine);
      expect(createMLCEngineMock).toHaveBeenCalledTimes(2);
      expect(createMLCEngineMock.mock.calls[0][0]).toBe(HIGH_QUALITY_MODEL);
      expect(createMLCEngineMock.mock.calls[1][0]).toBe(FALLBACK_LITE_MODEL);
      expect(localAiService.engineModel).toBe(FALLBACK_LITE_MODEL);
    } finally {
      localAiService.engine = null;
      localAiService.engineModel = null;
      localAiService.webLlmModule = null;
      Object.defineProperty(globalThis, 'navigator', { value: { gpu: originalGpu }, configurable: true });
    }
  });

  it('gera roteiro de vídeo estruturado em 3 cenas e livre de clichês', async () => {
    localAiService.setLocalAiEnabled(false);

    const videoResult = await localAiService.generateVideoScript({
      prompt: 'Conselhos de formatura',
      details: 'a mochila azul do primeiro dia',
      recipientName: 'Vagner',
    });

    expect(videoResult.source).toBe('template_fallback');
    expect(videoResult.title).toContain('Vagner');
    expect(videoResult.script).toContain('[Cena 1:');
    expect(videoResult.script).toContain('[Cena 2:');
    expect(videoResult.script).toContain('[Cena 3:');
    expect(videoResult.script).toContain('Meu querido Vagner');
    expect(videoResult.script).toContain('a mochila azul do primeiro dia');
    expect(findClichePhrases(videoResult.script)).toEqual([]);
  });

  it('gera história afetiva para foto de cápsula considerando data, emoções e rascunho', async () => {
    localAiService.setLocalAiEnabled(false);

    const storyResult = await localAiService.generatePhotoStory({
      photoTitle: 'Praia em família',
      dateLabel: 'Julho 2018',
      emotions: ['Alegria', 'Saudade'],
      recipientName: 'Pedro',
      currentDraft: 'o sorvete derretendo na mão',
    });

    expect(storyResult.source).toBe('template_fallback');
    expect(storyResult.story).toContain('Julho 2018');
    expect(storyResult.story).toContain('o sorvete derretendo na mão');
    expect(findClichePhrases(storyResult.story)).toEqual([]);
  });
});
