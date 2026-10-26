/**
 * localAiService.js — Orquestrador de Inteligência Artificial 100% Local (Client-Side)
 *
 * Utiliza @mlc-ai/web-llm compilado via WebAssembly (C++/Rust) e WebGPU
 * para rodar modelos de linguagem diretamente na GPU/RAM do usuário com
 * Privacidade Zero-Knowledge e sem nenhum custo de servidor.
 */

const STORAGE_KEY_ENABLED = 'ethernity_local_ai_enabled';
const STORAGE_KEY_QUALITY = 'ethernity_local_ai_quality';
export const DEFAULT_MODEL = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';
export const HIGH_QUALITY_MODEL = 'Qwen2.5-3B-Instruct-q4f16_1-MLC';
export const FALLBACK_LITE_MODEL = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';

export const MODEL_QUALITIES = {
  standard: DEFAULT_MODEL,
  high: HIGH_QUALITY_MODEL,
};

// Amostragem calibrada: mais variedade de vocabulário e penalidade para palavras repetidas
export const GENERATION_PARAMS = {
  temperature: 0.85,
  top_p: 0.9,
  frequency_penalty: 0.35,
  presence_penalty: 0.3,
  max_tokens: 1400,
};

// Abaixo disso a carta é considerada incompleta e é reescrita
export const MIN_LETTER_WORDS = 250;

// Expressões que denunciam "texto de IA" ou de cartão pronto
export const CLICHE_PHRASES = [
  'eternizar',
  'eternizo',
  'transcende',
  'transcender',
  'jornada',
  'trajetória',
  'tesouro',
  'inestimável',
  'luz da minha vida',
  'vida luminosa',
  'sentimentos mais profundos',
  'com todo o meu amor para sempre',
  'com todo o meu carinho e afeto',
  'não conhece limites',
  'palavras não são suficientes',
  'repleto de realizações',
  'novo ciclo',
  'nesta caminhada',
];

// Formas de abrir a carta, sorteadas a cada geração
export const OPENING_ANGLES = [
  'comece por uma lembrança específica, como se a cena estivesse acontecendo agora',
  'comece com uma pergunta simples, do tipo que se faz numa conversa',
  'comece pelo presente: o que você está fazendo ou vendo enquanto escreve',
  'comece com uma pequena confissão, algo que você nunca disse em voz alta',
  'comece por um detalhe do jeito da pessoa (um hábito, uma mania, uma frase dela)',
  'comece direto pelo que você quer dizer, sem rodeios, numa frase curta',
];

export function countWords(text = '') {
  return text.replace(/T[IÍ]TULO:.*?(\n|$)/i, '').split(/\s+/).filter(Boolean).length;
}

// Menor é melhor: carta curta pesa mais que clichê; empate favorece a mais longa
function scoreLetter(text, allowedContext = '') {
  const words = countWords(text);
  return (words < MIN_LETTER_WORDS ? 1000 : 0) + findClichePhrases(text, allowedContext).length * 10 - Math.min(words, 600) / 100;
}

export function findClichePhrases(text = '', allowedContext = '') {
  const lower = text.toLowerCase();
  const allowedLower = (allowedContext || '').toLowerCase();
  return CLICHE_PHRASES.filter((phrase) => lower.includes(phrase) && !allowedLower.includes(phrase));
}

function escapeHtml(text = '') {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

const forName = (name, sep = ' para ') => (name ? `${sep}${name}` : '');

// Parágrafo de transição comum a todos os temas: por que a carta foi escrita
const REASON_PARAGRAPHS = [
  'Resolvi colocar isso no papel porque a gente vive correndo, e as coisas mais importantes acabam ficando para depois. Não queria que esta ficasse. Então sentei, desliguei o celular e comecei.',
  'Pensei bastante antes de começar. Apaguei umas três versões. No fim, decidi escrever do jeito que eu falaria se a gente estivesse lado a lado, sem pressa nenhuma.',
  'Talvez você leia isso daqui a muito tempo. Talvez amanhã. De qualquer jeito, quero que fique guardado o que eu sinto agora, do jeito que é, sem enfeite.',
];

// Variações do fallback sem IA. Cada carta sorteia uma peça de cada lista
// e segue a ordem: começo, motivo, meio (lembrança e significado), desejos e fim.
const FALLBACK_POOLS = {
  pet: {
    titles: [
      ({ name }) => `As patinhas que mudaram a casa${forName(name, ' — ')}`,
      ({ name }) => `Sobre o nosso bichinho${forName(name)}`,
    ],
    openings: [
      () => 'Ainda escuto o barulho das unhas no chão da cozinha quando alguém mexia no pacote de ração. Era só encostar no saco e ele aparecia do nada, com aquela cara de quem não come há uma semana. Toda vez a gente ria.',
      () => 'Tem gente que acha exagero sentir tanto por um bicho. Essa gente nunca foi recebida na porta como se tivesse passado um ano fora, quando na verdade só tinha ido na padaria. Eu fui, muitas vezes, e sei bem o que isso vale.',
    ],
    middles: [
      () => 'O sofá tinha um lado que era dele, e ninguém discutia. Os passeios eram curtos no papel e longos na prática, porque cada poste merecia uma investigação.',
      () => 'Ele não entendia nada do que eu dizia, e mesmo assim era quem mais me ouvia. Nos dias ruins, deitava perto sem pedir nada.',
    ],
    wishes: [
      () => 'Quero que você se lembre dele nos dias bons, não só na saudade. Das trapalhadas, do focinho gelado de manhã, do jeito que ele inclinava a cabeça quando ouvia o próprio nome. Essas coisas pequenas são as que ficam.',
      () => 'Se um dia aparecer outro bichinho na sua vida, abre a porta sem culpa. Amor de bicho não se substitui, se soma. E eu tenho certeza de que ele ia aprovar.',
    ],
    endings: [
      () => 'Quero que você guarde isso: a bagunça, os pelos na roupa preta, a alegria boba de todo dia. Foi bom demais, e foi nosso. Ninguém tira.',
      () => 'Se um dia bater saudade, lembra do rabo abanando lá na porta. Era assim que ele dizia tudo o que a gente leva uma carta inteira pra tentar dizer.',
    ],
    signoffs: ['Com saudade e muito carinho.', 'Um abraço apertado (e cheio de pelos).'],
  },
  weddingAnniversary: {
    titles: [
      ({ name }) => `Mais um ano ao seu lado${forName(name, ', ')}`,
      ({ name }) => `Nossa história até aqui${forName(name, ' — ')}`,
    ],
    openings: [
      () => 'Outro dia me peguei olhando você na cozinha, cantando errado uma música do rádio, com a colher de pau servindo de microfone. Você nem percebeu que eu estava ali. E eu pensei: eu escolheria tudo de novo.',
      () => 'Você lembra do nosso primeiro apartamento? O chuveiro que alternava entre gelado e fervendo, o sofá emprestado, a geladeira quase vazia. Faltava quase tudo, menos vontade de ficar junto.',
    ],
    middles: [
      () => 'A gente já brigou por bobagem, já riu de coisa séria e já atravessou fase difícil segurando a mão um do outro. Acho que casamento é isso: escolher a mesma pessoa em dias bons e em dias comuns.',
      () => 'O que eu mais gosto não são as datas especiais. É o café que você deixa pronto, a mensagem perguntando se cheguei bem, o jeito como você me olha quando eu falo demais.',
    ],
    wishes: [
      () => 'Pros próximos anos eu quero mais viagem sem roteiro, mais domingo sem despertador e mais conversa boba antes de dormir. Quero envelhecer discutindo com você pelo controle da TV e perdendo de propósito.',
      () => 'Quero continuar aprendendo você. Mesmo depois de tanto tempo, ainda tem coisa que me surpreende: uma opinião nova, uma história que eu nunca tinha ouvido, um jeito diferente de rir. E eu adoro isso.',
    ],
    endings: [
      () => 'Que venham os próximos anos, com menos pressa e mais tempo pra gente. Ainda quero cozinhar com você ouvindo aquela mesma música do rádio, cantada errado, do jeito que só você canta.',
      () => 'Obrigado por continuar aqui, todos esses anos, mesmo quando eu não facilitei. Ainda tenho muita coisa pra viver com você, e não pretendo ter pressa.',
    ],
    signoffs: ['Do jeito que a gente é, sempre.', 'Com amor, hoje e nos dias comuns.'],
  },
  birthday: {
    titles: [
      ({ name }) => `Feliz aniversário${forName(name, ', ')}`,
      ({ name }) => `Um ano a mais${forName(name, ' para ')}`,
    ],
    openings: [
      () => 'Hoje acordei pensando em você antes mesmo de abrir os olhos direito. Fiquei um tempo ali, olhando pro teto, fazendo as contas de quantos aniversários seus eu já tive a sorte de acompanhar. Foram muitos, e ainda parece pouco.',
      ({ isMale }) => `Quantos anos mesmo? Não importa. Pra mim você ainda tem aquele mesmo sorriso de quando era ${isMale ? 'pequeno' : 'pequena'} e roubava o último pedaço de bolo.`,
    ],
    middles: [
      () => 'Outro dia achei uma foto antiga sua, de bochecha suja de brigadeiro, olhando pra câmera como quem já sabia que ia aprontar. Passei um tempão olhando pra ela. Tem coisa que não muda, e ainda bem.',
      ({ isMale }) => (isMale
        ? 'Fico vendo a pessoa que você virou e sinto um orgulho que não cabe em mim. Você é teimoso do jeito certo, generoso sem perceber e engraçado quando menos espera.'
        : 'Fico vendo a pessoa que você virou e sinto um orgulho que não cabe em mim. Você é teimosa do jeito certo, generosa sem perceber e engraçada quando menos espera.'),
    ],
    wishes: [
      () => 'O que eu te desejo é que você tenha amigos que façam você rir até doer a barriga, um trabalho que faça sentido e dias tranquilos o bastante pra perceber que está tudo bem. Parece pouco, mas é quase tudo.',
      () => 'E quando o ano apertar, porque às vezes aperta, lembra que tem gente torcendo por você sem precisar de motivo. Eu sou uma delas, e não pretendo parar.',
    ],
    endings: [
      () => 'Aproveita o dia sem pressa, sem culpa e sem olhar o relógio. E come um pedaço de bolo a mais por minha conta; esse eu faço questão de pagar.',
      () => 'Que esse ano seja leve, do começo ao fim. Você merece isso mais do que imagina, e eu vou estar por perto pra lembrar sempre que você esquecer.',
    ],
    signoffs: ['Te amo. Parabéns!', 'Um beijo grande e feliz aniversário.'],
  },
  weddingDay: {
    titles: [
      ({ name }) => `Para ler no dia do seu casamento${forName(name, ', ')}`,
      ({ name }) => `O seu grande dia${forName(name, ', ')}`,
    ],
    openings: [
      () => 'Se você está lendo isso, provavelmente está de roupa de festa e com o coração acelerado. Respira. Vai dar tudo certo, e o que não der certo vai virar história boa pra contar daqui a vinte anos.',
      () => 'Eu sei que hoje vai passar rápido demais, entre abraços, fotos e gente que você não vê há anos. Por isso escrevi antes, com calma, pra você ler num cantinho quando der.',
    ],
    middles: [
      () => 'Ninguém ensina ninguém a viver a dois. A gente aprende errando, pedindo desculpa e tentando de novo. O segredo, se existe um, é não deixar de conversar.',
      () => 'Ainda lembro do dia em que você me contou que tinha conhecido alguém. Tentou disfarçar, falou como quem não quer nada, mas o sorriso entregou tudo antes de você terminar a frase. Eu soube ali.',
    ],
    wishes: [
      () => 'Quero que a casa de vocês tenha bagunça boa: amigos na mesa, música alta, cheiro de comida no domingo. E que nunca falte paciência pra recomeçar a conversa quando ela sair torta.',
      () => 'Desejo que vocês se escolham todos os dias, inclusive nos dias em que não for fácil. Principalmente nesses. É ali que o amor deixa de ser festa e vira casa.',
    ],
    endings: [
      ({ isMale }) => `Hoje eu vou chorar, já aviso. Na entrada, nos votos e provavelmente na hora do bolo. É de felicidade, de ver você tão ${isMale ? 'feliz e inteiro' : 'feliz e inteira'} nesse momento.`,
      () => 'Estou aqui para o que precisar, hoje e em todos os dias depois da festa. Pra comemorar, pra ouvir desabafo, pra levar um bolo quando a semana for difícil.',
    ],
    signoffs: ['Com todo o carinho, de quem te viu crescer.', 'Um abraço emocionado.'],
  },
  graduation: {
    titles: [
      ({ name }) => `Você conseguiu${forName(name, ', ')}`,
      ({ name }) => `Sobre a sua conquista${forName(name, ', ')}`,
    ],
    openings: [
      () => 'Lembro das noites em que a luz do seu quarto ficava acesa até tarde e eu fingia que não estava vendo. Às vezes eu deixava um café na porta e saía de fininho. Você nunca comentou, mas a xícara sempre voltava vazia.',
      () => 'Teve um momento em que você quase desistiu. Eu lembro da conversa, da voz cansada, da dúvida se valia a pena. Você também lembra. E mesmo assim continuou.',
    ],
    middles: [
      () => 'Ninguém fez isso por você. Foram muitas provas, muitos cafés e algumas lágrimas que só você sabe. Esse diploma tem o seu nome porque é seu.',
      () => 'Lembro do primeiro dia de aula, você fingindo que não estava com medo, com a mochila nova pesada demais pras costas. Olha só onde essa mochila te trouxe.',
    ],
    wishes: [
      () => 'Desejo que você encontre um trabalho que te desafie sem te apagar, e gente boa por perto pra dividir as vitórias e os tropeços. E que você nunca perca essa curiosidade que te trouxe até aqui.',
      () => 'Não precisa ter tudo planejado. Os melhores caminhos às vezes aparecem quando a gente já está andando. Confia no que você construiu até agora; é muita coisa.',
    ],
    endings: [
      () => 'Agora descansa um pouco antes do próximo passo. Dorme até tarde, vê os amigos, deixa o celular de lado. Você merece cada minuto disso.',
      () => 'Que orgulho eu sinto de você. E não é pouco, nem é só pelo diploma. É pela pessoa que você foi no caminho até ele.',
    ],
    signoffs: ['Com orgulho, sempre.', 'Parabéns. De verdade.'],
  },
  love: {
    titles: [
      ({ name }) => `O que eu nem sempre digo${forName(name, ', ')}`,
      ({ name }) => `Uma carta de amor${forName(name)}`,
    ],
    openings: [
      () => 'Eu nunca soube dizer essas coisas em voz alta. Na hora a voz some, eu faço uma piada e o momento passa. Então resolvi escrever, que assim não tem como fugir.',
      () => 'Você sabe aquele momento em que a gente está em silêncio, cada um no seu canto do sofá, e está tudo bem? Ninguém precisa falar nada. É ali que eu mais te amo.',
    ],
    middles: [
      () => 'Gosto do seu jeito de rir com o corpo todo, de como você perde a paciência com injustiça, de como lembra o nome de todo mundo. Gosto até das manias que me irritam.',
      () => 'Nem todo dia é fácil, e a gente sabe disso. Já teve porta batida, silêncio comprido e pedido de desculpa atrasado. Mas é com você que eu quero dividir os dias difíceis também, não só os bonitos.',
    ],
    wishes: [
      () => 'Quero continuar descobrindo você: as músicas novas, as opiniões que mudam, os planos malucos de domingo à noite. Quero estar perto pra ver tudo isso acontecer.',
      () => 'Quero que você nunca duvide disso, nem nos dias em que eu estiver de mau humor ou sem paciência. Nesses dias, principalmente, volta aqui e lê de novo.',
    ],
    endings: [
      () => 'Guarda essa carta pra quando eu esquecer de dizer, porque eu vou esquecer, a vida corre. Mas o que está escrito aqui continua valendo.',
      () => 'É isso. Eu podia escrever mais três páginas e ia acabar no mesmo lugar. Simples assim: eu te amo.',
    ],
    signoffs: ['De quem te ama, sempre.', 'Com amor.'],
  },
  comfort: {
    titles: [
      ({ name }) => `Para os dias difíceis${forName(name, ', ')}`,
      ({ name }) => `Estou aqui${forName(name, ', ')}`,
    ],
    openings: [
      () => 'Se hoje está pesado, não precisa fingir que não está. Não precisa sorrir pra ninguém, nem responder mensagem, nem explicar nada. Pode só ler isso aqui, devagar.',
      () => 'Eu sei que você não pediu conselho, e eu não vou te dar uma lista de coisas pra fazer. Então isso aqui é só companhia, como quem senta do lado e fica.',
    ],
    middles: [
      () => 'Lembro de outra fase difícil sua, anos atrás, quando parecia que nada ia se resolver. Você chorou, reclamou, quis largar tudo. E saiu do outro lado, mesmo achando que não ia conseguir. Não foi sorte. Foi você.',
      () => 'Não precisa resolver tudo hoje. Às vezes o passo do dia é só levantar, comer alguma coisa e mandar mensagem pra alguém. Amanhã é outro passo. Ninguém atravessa nada de uma vez, e quem diz que atravessou está mentindo.',
    ],
    wishes: [
      () => 'Quando der, faz alguma coisa pequena que te faça bem: uma caminhada, um banho demorado, aquela comida de infância. Cuidar de si também é um jeito de ter coragem.',
      () => 'E se precisar chorar, chora. Não é fraqueza. É só o corpo dizendo que você se importa. Depois a gente toma um café e conversa sobre qualquer outra coisa.',
    ],
    endings: [
      () => 'Me liga quando quiser. Ou não liga, só manda um emoji qualquer, que eu entendo. Eu vou estar aqui do mesmo jeito.',
      ({ isMale }) => `Vai passar. Talvez não tão rápido quanto você queria, mas vai. E até passar, você não está ${isMale ? 'sozinho' : 'sozinha'}.`,
    ],
    signoffs: ['Do seu lado, sempre.', 'Um abraço comprido.'],
  },
  gratitude: {
    titles: [
      ({ name }) => `Obrigado${forName(name, ', ')}`,
      ({ name }) => `Um agradecimento atrasado${forName(name, ' para ')}`,
    ],
    openings: [
      () => 'Tem um obrigado que eu estou devendo faz tempo. Daqueles que a gente vai adiando porque parece que precisa de uma ocasião especial. Resolvi que a ocasião é hoje.',
      () => 'Outro dia lembrei de uma coisa que você fez por mim e que você provavelmente nem lembra. Foi pequena pra você, eu sei. Pra mim mudou o rumo de um momento bem difícil.',
    ],
    middles: [
      () => 'Você apareceu quando eu precisei, sem fazer barulho e sem cobrar nada depois. Não fez discurso, não pediu explicação. Só estava lá. Isso diz muito sobre quem você é.',
      () => 'Muito do que eu sou hoje tem um pedaço seu: um conselho, uma bronca na hora certa, uma porta aberta quando todas as outras pareciam fechadas. Às vezes me pego repetindo frases suas sem perceber.',
    ],
    wishes: [
      () => 'Espero um dia conseguir retribuir à altura. Enquanto isso, quero que você saiba que muita coisa boa que eu faço hoje começou com você, de um jeito ou de outro.',
      () => 'Se alguém um dia te perguntar se você faz diferença na vida das pessoas, mostra esta carta. Eu assino embaixo.',
    ],
    endings: [
      () => 'Queria que você soubesse que eu percebi. Cada gesto, mesmo os que você achou que passaram batido. E que faz diferença, muita.',
      () => 'Fica registrado aqui, pra você ler quantas vezes quiser. Principalmente nos dias em que achar que não fez o bastante por alguém.',
    ],
    signoffs: ['Com gratidão de verdade.', 'Obrigado, de coração.'],
  },
  free: {
    titles: [
      ({ name, prompt }) => `${prompt ? prompt.charAt(0).toUpperCase() + prompt.slice(1) : 'Uma carta'}${forName(name, ' — ')}`,
      ({ name }) => `Umas palavras${forName(name)}`,
    ],
    openings: [
      ({ prompt }) => `Faz dias que penso em te escrever${prompt ? ` sobre isso: ${escapeHtml(prompt)}` : ''}. Comecei no celular, depois num papel, depois desisti e voltei. Acho que é assim mesmo com o que importa.`,
      () => 'Eu ensaiei essa carta várias vezes na cabeça, no banho, no trânsito, antes de dormir. Cada versão saía mais bonita que a outra. Agora vai do jeito que sair, que é o jeito mais honesto.',
    ],
    middles: [
      () => 'Não sei se vou acertar as palavras, mas sei o que sinto. E queria que ficasse escrito em algum lugar onde você pudesse voltar, numa tarde qualquer, e encontrar tudo do mesmo jeito.',
      () => 'Tem coisas que a gente só fala quando o tempo passa, ou quando já é tarde. Eu preferi não esperar. Você é importante pra mim, e isso merece ser dito com todas as letras.',
    ],
    wishes: [
      () => 'O que eu desejo pra você é simples: paz, gente boa por perto e tempo pra fazer o que gosta. O resto a gente vai resolvendo no caminho.',
      () => 'Quero que você saiba que pode contar comigo. Hoje, amanhã e depois. Não precisa nem pedir direito; eu entendo pela metade da frase.',
    ],
    endings: [
      () => 'Lê com calma, quantas vezes quiser. E depois me conta o que achou, nem que seja com uma frase só.',
      () => 'É isso. Tinha mais coisa, sempre tem, mas o principal está aqui. Obrigado por estar na minha vida.',
    ],
    signoffs: ['Com carinho.', 'Um abraço.'],
  },
};

class LocalAiService {
  constructor() {
    this.engine = null;
    this.isLoading = false;
    this.loadProgress = 0;
    this.loadText = '';
    this.listeners = new Set();
    this.webLlmModule = null;
    this.engineModel = null;
    this.lastAngle = null;
  }

  /**
   * Verifica se o navegador suporta WebGPU
   */
  isWebGpuSupported() {
    return typeof navigator !== 'undefined' && Boolean(navigator.gpu);
  }

  /**
   * Retorna se o usuário ativou o modo de IA Local
   */
  isLocalAiEnabled() {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY_ENABLED) === 'true';
  }

  /**
   * Define se a IA Local está ativa
   */
  setLocalAiEnabled(enabled) {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_ENABLED, enabled ? 'true' : 'false');
    this._notifyListeners({ enabled });
  }

  /**
   * Registra listener para atualizações de progresso e estado
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _notifyListeners(state = {}) {
    this.listeners.forEach((listener) => {
      try {
        listener({
          isLoading: this.isLoading,
          loadProgress: this.loadProgress,
          loadText: this.loadText,
          isReady: Boolean(this.engine),
          isEnabled: this.isLocalAiEnabled(),
          ...state,
        });
      } catch (err) {
        console.warn('[LocalAiService] Erro no listener:', err);
      }
    });
  }

  /**
   * Retorna a qualidade de modelo escolhida ('standard' | 'high')
   */
  getModelQuality() {
    if (typeof localStorage === 'undefined') return 'standard';
    const quality = localStorage.getItem(STORAGE_KEY_QUALITY);
    return MODEL_QUALITIES[quality] ? quality : 'standard';
  }

  /**
   * Troca a qualidade do modelo; o motor atual é descarregado e o novo é baixado na próxima geração
   */
  async setModelQuality(quality) {
    if (!MODEL_QUALITIES[quality] || typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_QUALITY, quality);
    if (this.engine && this.engineModel !== MODEL_QUALITIES[quality]) {
      await this.unloadEngine();
    }
    this._notifyListeners({ quality });
  }

  /**
   * Inicializa o motor Web-LLM sob demanda
   */
  async initEngine(modelName = MODEL_QUALITIES[this.getModelQuality()], onProgress = null) {
    if (this.engine) return this.engine;
    if (this.isLoading) return null;

    if (!this.isWebGpuSupported()) {
      throw new Error('Seu navegador não possui suporte a WebGPU para rodar IA local.');
    }

    this.isLoading = true;
    this.loadProgress = 0;
    this.loadText = 'Iniciando motor de IA local...';
    this._notifyListeners();

    try {
      if (!this.webLlmModule) {
        this.webLlmModule = await import('@mlc-ai/web-llm');
      }

      const { CreateMLCEngine } = this.webLlmModule;
      const progressCallback = (report) => {
        this.loadProgress = Math.min(100, Math.round((report.progress || 0) * 100));
        this.loadText = report.text || 'Carregando modelo na memória local...';
        if (onProgress) onProgress(this.loadProgress, this.loadText);
        this._notifyListeners();
      };

      try {
        this.engine = await CreateMLCEngine(modelName, {
          initProgressCallback: progressCallback,
        });
        this.engineModel = modelName;
      } catch (primaryErr) {
        if (modelName !== FALLBACK_LITE_MODEL) {
          console.warn(`[LocalAiService] Falha ao carregar ${modelName}, tentando modelo leve (${FALLBACK_LITE_MODEL}):`, primaryErr);
          this.loadText = 'Adaptando para modelo leve compatível com sua memória...';
          this._notifyListeners();
          this.engine = await CreateMLCEngine(FALLBACK_LITE_MODEL, {
            initProgressCallback: progressCallback,
          });
          this.engineModel = FALLBACK_LITE_MODEL;
        } else {
          throw primaryErr;
        }
      }

      this.isLoading = false;
      this.loadProgress = 100;
      this.loadText = 'IA Local pronta para uso!';
      this._notifyListeners();

      return this.engine;
    } catch (error) {
      this.isLoading = false;
      this.engine = null;
      this._notifyListeners({ error: error.message });
      throw error;
    }
  }

  /**
   * Gera uma sugestão de carta ou mensagem afetiva usando o motor local
   */
  async generateSuggestion({ prompt, details = '', recipientName = '', tone = 'afetuoso', onChunk = null }) {
    // 1. Se a IA Local estiver desativada ou não suportada, usa gerador determinístico inteligente
    if (!this.isLocalAiEnabled() || !this.isWebGpuSupported()) {
      return this._generateTemplateFallback(prompt, recipientName, tone, details);
    }

    // 2. Garante inicialização do motor
    if (!this.engine) {
      await this.initEngine();
    }

    const angle = this._pickOpeningAngle();
    const systemPrompt = this._buildSystemPrompt({ recipientName, tone, angle });
    const userPrompt = this._buildUserPrompt({ prompt, details, recipientName });
    const allowedContext = `${prompt || ''} ${details || ''}`;

    const handleStreamChunk = onChunk
      ? (delta, currentFullText) => {
          const parsedPreview = this._parseAiResponse(currentFullText, recipientName, prompt);
          onChunk(delta, currentFullText, parsedPreview);
        }
      : null;

    try {
      let fullText = await this._runCompletion(systemPrompt, userPrompt, handleStreamChunk);

      // 3. Revisão: se a carta ficou curta ou caiu em clichês (exceto termos pedidos pelo próprio autor), reescreve uma vez e fica com a melhor
      const hits = findClichePhrases(fullText, allowedContext);
      const words = countWords(fullText);
      if (hits.length > 0 || words < MIN_LETTER_WORDS) {
        const fixes = [];
        if (words < MIN_LETTER_WORDS) {
          fixes.push(`A versão anterior ficou curta demais (${words} palavras). Escreva a carta completa, com começo, meio e fim, em 5 a 7 parágrafos e pelo menos 350 palavras.`);
        }
        if (hits.length > 0) {
          fixes.push(`Não use nenhuma destas expressões: ${hits.map((h) => `"${h}"`).join(', ')}. Diga a mesma coisa com palavras simples e concretas.`);
        }
        const retryPrompt = `${userPrompt}\n\nIMPORTANTE: ${fixes.join(' ')}`;
        const retryText = await this._runCompletion(systemPrompt, retryPrompt, handleStreamChunk);
        if (scoreLetter(retryText, allowedContext) < scoreLetter(fullText, allowedContext)) {
          fullText = retryText;
        }
      }

      return this._parseAiResponse(fullText, recipientName, prompt);
    } catch (error) {
      console.warn('[LocalAiService] Erro na geração local, aplicando fallback:', error);
      return this._generateTemplateFallback(prompt, recipientName, tone, details);
    }
  }

  /**
   * Executa uma chamada ao motor com parâmetros calibrados contra repetição
   */
  async _runCompletion(systemPrompt, userPrompt, onChunk) {
    const response = await this.engine.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      ...GENERATION_PARAMS,
      stream: Boolean(onChunk),
    });

    let fullText = '';

    if (onChunk && response[Symbol.asyncIterator]) {
      for await (const chunk of response) {
        const delta = chunk.choices[0]?.delta?.content || '';
        fullText += delta;
        onChunk(delta, fullText);
      }
    } else {
      fullText = response.choices[0]?.message?.content || '';
    }

    return fullText;
  }

  /**
   * Sorteia a forma de abrir a carta, evitando repetir a última usada
   */
  _pickOpeningAngle() {
    const options = OPENING_ANGLES.filter((a) => a !== this.lastAngle);
    const angle = options[Math.floor(Math.random() * options.length)];
    this.lastAngle = angle;
    return angle;
  }

  /**
   * Prompt de sistema escrito como guia de estilo de um escritor
   */
  _buildSystemPrompt({ recipientName, tone, angle }) {
    const who = recipientName ? `chamada ${recipientName}` : 'que vai receber a carta';
    return `Você é um escritor brasileiro que ajuda pessoas comuns a escrever cartas pessoais para quem amam. Você escreve COMO a pessoa que envia, em primeira pessoa, para uma pessoa ${who}.

Como você escreve:
- Tom ${tone}, mas de conversa, como quem fala olhando nos olhos. Nada de discurso, sermão ou cartão de papelaria.
- Frases de tamanhos variados. Algumas bem curtas. Parágrafos curtos.
- Mostre em vez de dizer: um gesto, um lugar, uma cena, um cheiro, uma frase que a pessoa costuma falar. Um detalhe concreto vale mais que três adjetivos.
- Se o autor contou detalhes, use-os com naturalidade. Se faltar um detalhe importante, deixe um espaço entre colchetes para ele completar, por exemplo [o nome daquela praia], em vez de inventar.
- Pode ter humor leve e imperfeição; cartas reais não são perfeitas.
- Não use citações, provérbios nem frases de efeito. Não termine com uma lição de moral.
- Não comece com "Escrevo esta mensagem" nem com "Hoje celebramos".
- Evite totalmente estas palavras e expressões: ${CLICHE_PHRASES.join(', ')}.
- Português do Brasil.

Estrutura obrigatória de uma carta completa (5 a 7 parágrafos, entre 350 e 550 palavras, cada parágrafo com 3 a 6 frases):
1. Saudação com o nome da pessoa, sozinha na primeira linha.
2. Começo: um parágrafo que puxa o leitor para dentro da carta. ${angle.charAt(0).toUpperCase() + angle.slice(1)}.
3. Meio: de dois a quatro parágrafos que desenvolvem o tema, nesta ordem:
   - uma lembrança contada com detalhes (onde, quando, o que alguém disse ou fez);
   - o que essa pessoa significa para você e o que mudou na sua vida por causa dela;
   - o que você deseja ou aconselha para o futuro dela, de forma prática e pessoal.
4. Fim: um parágrafo de encerramento que retome algo do começo, e depois uma despedida curta e afetuosa.

Formato da resposta (sem markdown):
TITULO: [um título curto e simples, como a pessoa escreveria num envelope]
CONTEUDO:
[a carta completa, da saudação à despedida]`;
  }

  _buildUserPrompt({ prompt, details, recipientName }) {
    const target = recipientName ? ` para ${recipientName}` : '';
    let text = `Escreva uma carta${target} sobre: ${prompt}`;
    if (details && details.trim()) {
      text += `\n\nDetalhes reais que eu quero que apareçam: ${details.trim()}`;
    }
    return text;
  }

  /**
   * Parseia a resposta da IA para extrair Título e Conteúdo HTML estruturado
   */
  _parseAiResponse(text, recipientName, prompt) {
    let title = recipientName ? `Para ${recipientName}` : 'Uma carta para você';
    const cleanText = text.replace(/\*\*/g, '').replace(/^#+\s*/gm, '');
    let contentBody = cleanText;

    const titleMatch = cleanText.match(/T[IÍ]TULO:\s*(.+?)(?:\n|$)/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim().replace(/^["'[]|["'\]]$/g, '');
    }

    const contentMatch = cleanText.match(/CONTE[UÚ]DO:\s*([\s\S]+)/i);
    if (contentMatch && contentMatch[1]) {
      contentBody = contentMatch[1].trim();
    } else {
      contentBody = cleanText.replace(/T[IÍ]TULO:.*?\n/i, '').trim();
    }

    // Formata parágrafos em HTML para o editor
    const htmlContent = contentBody
      .split(/\n\n+/)
      .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
      .join('');

    return {
      title,
      content: htmlContent,
      source: 'local_ai',
    };
  }

  /**
   * Detecta gênero e relação provável a partir do nome ou relação informada
   */
  _detectGenderAndRole(recipientName, relationship = '') {
    const raw = `${recipientName || ''} ${relationship || ''}`.toLowerCase().trim();
    const firstWord = (recipientName || '')
      .trim()
      .split(/\s+/)[0]
      ?.toLowerCase()
      .replace(/[^a-záàâãéêíóôõúç]/gi, '') || '';

    // Exceções femininas que terminam em 'o' ou consoantes comuns em nomes masculinos
    const isExplicitFemale = /\b(ana|maria|mariana|julia|júlia|sofia|sophia|laura|beatriz|alice|helena|isabela|isabella|manuela|camila|amanda|bruna|carolina|letícia|leticia|larissa|fernanda|patrícia|patricia|gabriela|luísa|luisa|luiza|raquel|ester|rute|inês|ines|mirtes|socorro|consuelo|cleo|cléo|carmem|yasmin|iasmin|isis|ísis|liz|lis|maitê|maite|nicole|simone|ivone|denise|monique|jaqueline|viviane|tatiane|eliane|cristiane|regiane|adriana|juliana|fabiana|luciana|mariane|mãe|mae|mamãe|filha|irmã|irma|esposa|mulher|vó|vovó|tia|neta|madrinha|noiva|namorada)\b/i.test(raw);

    // Nomes ou termos masculinos evidentes
    const isMaleName = /\b(pedro|joão|joao|lucas|mateus|matheus|gabriel|felipe|bernardo|guilherme|rafael|enzo|leo|léo|leonardo|antonio|antônio|carlos|marcos|bruno|arthur|artur|davi|david|gustavo|miguel|henrique|rodrigo|marcelo|vagner|wagner|thiago|tiago|diego|diogo|andré|andre|fábio|fabio|caio|murilo|danilo|leandro|eduardo|ricardo|fernando|roberto|alberto|paulo|sérgio|sergio|júlio|julio|otávio|otavio|flávio|flavio|márcio|marcio|vinícius|vinicius|césar|cesar|vitor|victor|igor|heitor|joaquim|benjamim|samuel|daniel|emanuel|renan|luan|cauã|caua|ruan|alan|allan|ivan|jean|nathan|jonathan|cristian|anderson|jefferson|emerson|robson|nilson|wilson|edson|nelson|gilberto|humberto|renato|cristiano|adriano|luciano|juliano|fabiano|maurício|mauricio|patrício|patricio|rogério|rogerio|cláudio|claudio|sílvio|silvio|décio|decio|lúcio|lucio|celso|mauro|lauro|saulo|breno|bento|augusto|francisco|chico|zé|ze|josé|jose|alex|alexandre|raul|luiz|luís|luis|pai|filho|irmão|irmao|esposo|marido|vô|vovô|tio|neto|padrinho|noivo|namorado)\b/i.test(raw);

    // Heurística fonética para o primeiro nome em português (terminados em -o, -os, -im, -an, -or, -el) quando não for explicitamente feminino
    const hasMaleEnding = Boolean(
      firstWord &&
      !isExplicitFemale &&
      /(o|os|im|an|or|el|eu|au)$/.test(firstWord)
    );

    // Relações específicas
    const isSon = /\b(filho|filhote|menino)\b/i.test(raw);
    const isDaughter = /\b(filha|menina)\b/i.test(raw);
    const isFather = /\b(pai|papai|painho)\b/i.test(raw);
    const isMother = /\b(mãe|mae|mamãe)\b/i.test(raw);
    const isSpouseMale = /\b(esposo|marido|noivo|namorado)\b/i.test(raw);
    const isSpouseFemale = /\b(esposa|mulher|noiva|namorada)\b/i.test(raw);

    const isMale = !isExplicitFemale && (isMaleName || hasMaleEnding || isSon || isFather || isSpouseMale);

    return {
      isMale,
      dearPrefix: isMale ? 'Meu querido' : 'Minha querida',
      lovedWord: isMale ? 'amado' : 'amada',
      specialWord: isMale ? 'especial' : 'especial',
      role: isSon ? 'filho' : (isDaughter ? 'filha' : (isFather ? 'pai' : (isMother ? 'mãe' : (isSpouseMale ? 'esposo' : (isSpouseFemale ? 'esposa' : ''))))),
    };
  }

  /**
   * Gera um roteiro de vídeo estruturado com marcações de cena para teleprompter
   */
  async generateVideoScript({ prompt, details = '', recipientName = '', tone = 'afetuoso', onChunk = null }) {
    const cleanPrompt = (prompt || '').trim();
    const name = (recipientName || '').trim() || 'você';

    if (this.isLocalAiEnabled() && this.isWebGpuSupported()) {
      try {
        if (!this.engine) {
          await this.initEngine();
        }
        const systemPrompt = `Você é um diretor e roteirista brasileiro que ajuda pessoas comuns a gravar mensagens em vídeo para quem amam.
Escreva em primeira pessoa, com tom ${tone} e natural para ser lido num teleprompter olhando para a câmera.
Divida o roteiro em 3 cenas curtas usando exatamente marcadores entre colchetes como:
[Cena 1: Olhar acolhedor para a câmera, sorriso leve]
[Cena 2: Tom mais próximo e reflexivo]
[Cena 3: Sorriso aberto, gesto de carinho]
Evite totalmente estas expressões: ${CLICHE_PHRASES.join(', ')}.
Formato da resposta (sem markdown):
TITULO: [um título curto e humano para o vídeo]
CONTEUDO:
[o roteiro completo com as 3 cenas]`;

        const userPrompt = this._buildUserPrompt({ prompt: cleanPrompt, details, recipientName });
        const handleStream = onChunk
          ? (delta, currentFullText) => {
              const parsed = this._parseAiResponse(currentFullText, recipientName, cleanPrompt);
              const plainScript = parsed.content
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<\/p>/gi, '\n\n')
                .replace(/<[^>]+>/g, '')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .trim();
              onChunk(delta, currentFullText, { title: parsed.title, script: plainScript, source: 'local_ai' });
            }
          : null;

        const fullText = await this._runCompletion(systemPrompt, userPrompt, handleStream);
        const parsed = this._parseAiResponse(fullText, recipientName, cleanPrompt);
        const plainScript = parsed.content
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .trim();

        return {
          title: parsed.title,
          script: plainScript,
          source: 'local_ai',
        };
      } catch (err) {
        console.warn('[LocalAiService] Erro ao gerar roteiro de vídeo na IA local, aplicando fallback:', err);
      }
    }

    return this._generateVideoTemplateFallback(cleanPrompt, name, tone, details);
  }

  _generateVideoTemplateFallback(prompt, recipientName = '', tone = 'afetuoso', details = '') {
    const cleanPrompt = (prompt || '').trim();
    const name = (recipientName || '').trim();
    const { dearPrefix, isMale } = this._detectGenderAndRole(name);
    const theme = this._detectTheme(cleanPrompt.toLowerCase());
    const pool = FALLBACK_POOLS[theme];
    const ctx = { name, isMale, prompt: cleanPrompt };

    const greetingLine = name ? `${dearPrefix} ${name},` : 'Oi,';
    const opening = pick(pool.openings)(ctx);
    const middle = pick(pool.middles)(ctx);
    const wish = pick(pool.wishes)(ctx);
    const ending = pick(pool.endings)(ctx);
    const cleanDetails = (details || '').trim().replace(/([^.!?…])$/, '$1.');

    const scenes = [
      `[Cena 1: Plano médio, olhar tranquilo diretamente para a câmera e um sorriso espontâneo]\n${greetingLine} ${opening}`,
      `[Cena 2: Tom de conversa próxima, respirando com calma entre as frases]\n${middle}${cleanDetails ? ` E quero registrar aqui um detalhe que é só nosso: ${cleanDetails}` : ''}`,
      `[Cena 3: Olhar afetuoso para a lente, encerrando com serenidade]\n${wish}\n\n${ending} ${pick(pool.signoffs)}`,
    ];

    return {
      title: pick(pool.titles)(ctx),
      script: scenes.join('\n\n'),
      source: 'template_fallback',
    };
  }

  /**
   * Gera ou enriquece a história de uma foto dentro do estúdio de curadoria da cápsula
   */
  async generatePhotoStory({ photoTitle = '', dateLabel = '', emotions = [], recipientName = '', currentDraft = '' }) {
    const cleanDraft = (currentDraft || '').trim();
    const name = (recipientName || '').trim();
    const { isMale } = this._detectGenderAndRole(name);
    const emotionList = Array.isArray(emotions) && emotions.length > 0 ? emotions.join(', ').toLowerCase() : 'carinho e saudade boa';
    const whenText = dateLabel && dateLabel !== 'Hoje' ? `registrado em ${dateLabel}` : 'que guardei com tanto cuidado';

    if (this.isLocalAiEnabled() && this.isWebGpuSupported()) {
      try {
        if (!this.engine) {
          await this.initEngine();
        }
        const systemPrompt = `Você ajuda uma pessoa a narrar a história por trás de uma fotografia em um álbum de memórias familiares${name ? ` para ${name}` : ''}.
Escreva em primeira pessoa, em português do Brasil, em 1 ou 2 parágrafos curtos (60 a 130 palavras), com tom humano, simples e sensorial.
Evite totalmente clichês como: ${CLICHE_PHRASES.join(', ')}.
Responda apenas com o texto da lembrança, sem título e sem markdown.`;
        const userPrompt = `Conte a lembrança desta foto (${photoTitle || 'momento especial'}, ${whenText}). Sentimentos ao olhar para ela: ${emotionList}.${cleanDraft ? ` Detalhes reais anotados por mim: ${cleanDraft}` : ''}`;
        const text = await this._runCompletion(systemPrompt, userPrompt, null);
        const cleaned = text.replace(/^T[IÍ]TULO:.*?\n/i, '').replace(/^CONTE[UÚ]DO:\s*/i, '').trim();
        if (cleaned.length > 20) {
          return { story: cleaned, source: 'local_ai' };
        }
      } catch (err) {
        console.warn('[LocalAiService] Fallback em generatePhotoStory:', err);
      }
    }

    const introVariants = [
      `Toda vez que olho para este registro ${whenText}, a sensação de ${emotionList} volta na mesma hora.`,
      `Esta foto guarda um daqueles momentos simples ${whenText} que a gente só percebe o tamanho do valor quando o tempo passa.`,
      `Quando separei esta imagem ${whenText}${name ? ` para você, ${name},` : ''} senti uma mistura boa de ${emotionList}.`,
    ];

    const detailLine = cleanDraft
      ? `Lembro especialmente disto: ${cleanDraft.replace(/([^.!?…])$/, '$1.')}`
      : `Nem precisava de grandes planos naquele dia; o que fez diferença foi a nossa presença ali, do jeito que a gente era.`;

    const closingVariants = [
      name
        ? `Quis deixar essa memória escrita aqui para que você sempre saiba como era bom dividir esses dias com você.`
        : `Quis deixar essa memória escrita aqui para que nenhum detalhe desse dia se perca com o tempo.`,
      `Olhar para trás e encontrar esse instante me lembra do quanto fomos felizes nas coisas pequenas${isMale && name ? `, meu querido ${name}` : ''}.`,
    ];

    return {
      story: `${pick(introVariants)} ${detailLine}\n\n${pick(closingVariants)}`,
      source: 'template_fallback',
    };
  }

  /**
   * Fallback sem IA: monta a carta a partir de variações por tema, para não repetir o mesmo texto
   */
  _generateTemplateFallback(prompt, recipientName = '', tone = 'afetuoso', details = '') {
    const cleanPrompt = (prompt || '').trim();
    const lower = cleanPrompt.toLowerCase();
    const name = (recipientName || '').trim();
    const { dearPrefix, isMale } = this._detectGenderAndRole(name);

    const theme = this._detectTheme(lower);
    const pool = FALLBACK_POOLS[theme];
    const ctx = { name, isMale, prompt: cleanPrompt };

    const greeting = name ? `<p>${dearPrefix} <strong>${escapeHtml(name)}</strong>,</p>` : '<p>Oi,</p>';
    const middles = pool.middles.map((m) => m(ctx));
    const cleanDetails = escapeHtml((details || '').trim()).replace(/([^.!?…])$/, '$1.');

    const paragraphs = [pick(pool.openings)(ctx), pick(REASON_PARAGRAPHS), ...middles];
    if (cleanDetails) {
      paragraphs.push(`E tem uma coisa que eu não podia deixar de fora: ${cleanDetails}`);
    }
    paragraphs.push(pick(pool.wishes)(ctx), pick(pool.endings)(ctx));

    const body = [
      greeting,
      ...paragraphs.map((p) => `<p>${p}</p>`),
      `<p style="text-align: right;">${pick(pool.signoffs)}</p>`,
    ].join('');

    return {
      title: pick(pool.titles)(ctx),
      content: body,
      source: 'template_fallback',
    };
  }

  _detectTheme(lower) {
    if (/cachorr|\bdog\b|gat[oa]|\bpet\b|animal|bichinho/.test(lower)) return 'pet';
    if (lower.includes('casamento') && (/\d+\s*anos/.test(lower) || lower.includes('bodas') || lower.includes('anos'))) return 'weddingAnniversary';
    if (/anivers[aá]rio|anos de vida/.test(lower)) return 'birthday';
    if (/casamento|noiv[ao]/.test(lower)) return 'weddingDay';
    if (/formatura|faculdade|conquista|diploma|carreira/.test(lower)) return 'graduation';
    if (/declara[cç][aã]o|te amo|paix[aã]o|amor/.test(lower)) return 'love';
    if (/for[cç]a|apoio|dif[ií]cil|supera[cç][aã]o|motivacional/.test(lower)) return 'comfort';
    if (/gratid[aã]o|obrigad|agradec/.test(lower)) return 'gratitude';
    return 'free';
  }

  /**
   * Libera memória do motor de IA
   */
  async unloadEngine() {
    if (this.engine) {
      try {
        await this.engine.unload();
      } catch (err) {
        console.warn('[LocalAiService] Erro ao descarregar:', err);
      }
      this.engine = null;
    }
    this.engineModel = null;
    this.isLoading = false;
    this._notifyListeners({ isReady: false });
  }
}

export const localAiService = new LocalAiService();
export default localAiService;
