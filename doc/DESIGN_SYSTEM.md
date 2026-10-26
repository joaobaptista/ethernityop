# 🎨 Design System — Ethernity DMs
**Sistema de Legado Digital, Eternização de Memórias Vivas & Proteção Familiar**

---

## 1. 🎯 Propósito e Contexto do Produto

O **Ethernity DMs** é uma plataforma concebida para **proteger e eternizar legados, histórias familiares, mensagens de voz, vídeos e diretivas de vida**. A plataforma atua tanto durante a vida quanto após a partida física do indivíduo, permitindo:

1. **Conexão & Curadoria de Memórias**: Integração fluida com Google Photos, Apple iCloud e uploads manuais para preservar fotos e vídeos marcantes.
2. **Cofre Digital Criptografado**: Armazenamento com segurança militar de relatos de voz, vídeos, conselhos de vida e diretivas.
3. **Cápsulas do Tempo Programadas**: Entregas automáticas agendadas para marcos comemorativos (18 anos dos filhos, casamentos, aniversários) ou acionamento póstumo.
4. **Rede de Guardiões de Confiança**: Pessoas de máxima confiança com protocolo de dupla validação e checagem periódica de bem-estar (*Life-check*).
5. **Avatar & Eternização de Voz**: Preservação do timbre, entonação e expressividade vocal para perpetuar memórias e narrativas para as próximas gerações.
6. **Círculo Familiar em Tempo Real**: Chat e telemetria de cuidado familiar integrados via WebSockets (Socket.io).

---

## 2. 🧱 Pilares de Design e Filosofia Visual

1. **Estética Acolhedora & Humana (Warm Minimalist Elegance):**
   - Cores orgânicas inspiradas em calor e afeto: **Terracota Coral (`#EE5945`)**, **Bege Acolhedor (`#FAF7F2`)** e **Chocolate Escuro (`#2D1B18`)**.
   - Tipografia refinada: Títulos expressivos e corpo altamente legível em qualquer dispositivo.

2. **Tema Escuro Aconchegante (Warm Obsidian Dark Mode):**
   - Tons profundos de carvão quente (`#14110F`, `#1E1A17`) preservando a cor terracota e eliminando fadiga visual.

3. **Confiança e Transparência de Segurança:**
   - Badges de criptografia ponta a ponta e controle estrito de privacidade em destaque em todas as áreas de importação de memórias.

---

## 3. 🎨 Paleta de Cores e Tokens Duais (Light & Dark Mode)

| Categoria | Token CSS | Modo Claro (Light) | Modo Escuro (Dark) | Significado & Aplicação |
| :--- | :--- | :--- | :--- | :--- |
| **Primária (Terracota / Coral Vivo)** | `--color-primary` | `#EE5945` | `#EE5945` | Ações principais, botão ativo, destaques |
| | `--color-primary-light` | `#FFF5F3` | `rgba(238, 89, 69, 0.14)` | Fundo de itens ativos, badges |
| | `--color-primary-subtle` | `#FDECE9` | `rgba(238, 89, 69, 0.24)` | Bordas suaves e anéis de foco |
| | `--color-primary-dark` | `#C73E2C` | `#DE432E` | Textos em destaque e estados ativos |
| **Secundária (Tons Terrosos)** | `--color-secondary` | `#8C6D62` | `#B8ADA7` | Apoio, legendas e metadados |
| **Guardião & Alerta** | `--color-danger` | `#E53935` | `#F87171` | Alertas críticos e parada de gravação |
| **Segurança & Confirmação** | `--color-success` | `#2E7D32` | `#4ADE80` | Status verificado, criptografia ativa |
| **Superfícies & Canvas** | `--bg-canvas` | `#FAF7F2` | `#14110F` | Fundo principal da aplicação e sidebar |
| | `--bg-surface` | `#FFFFFF` | `#1E1A17` | Cartões, gavetas laterais e modais |
| | `--bg-surface-subtle` | `#F4EFEA` | `#292420` | Inputs, caixas de estúdio e divisores |
| | `--border-color` | `#EFECE6` | `#332D28` | Linhas delimitadoras sutis |
| **Tipografia** | `--text-main` | `#2D1B18` | `#FAF7F2` | Textos principais de alto contraste |
| | `--text-muted` | `#6B5E59` | `#B8ADA7` | Rótulos secundários e descrições |

## 4. Tipografia — Fraunces e Plus Jakarta Sans

A identidade tipográfica de Ethernity DMs / Presente Eterno utiliza **somente duas famílias para texto**. A fonte de ícones Font Awesome é um recurso de iconografia, não uma terceira família de texto.

| Família | Token | Pesos carregados | Aplicação |
| :--- | :--- | :--- | :--- |
| Fraunces | `--font-display` | 400, 600, 700 | Títulos editoriais, títulos de página, datas, marcos, nomes em destaque e marca |
| Plus Jakarta Sans | `--font-ui` | 400, 500, 600, 700, 800 | Corpo, navegação, botões, formulários, cards funcionais, badges e metadados |

Georgia, serif, system-ui e sans-serif são fallbacks para falhas de carregamento; não são fontes adicionais importadas. Não adicionar Inter, Playfair Display ou famílias monoespaçadas à interface.

### Carregamento e fonte de verdade

O carregamento único está em [frontend/index.html](../frontend/index.html), com preconnect para Google Fonts e `display=swap`. Não duplicar a importação com `@import`.

Os tokens estão em [frontend/src/index.css](../frontend/src/index.css). O [Tailwind](../frontend/tailwind.config.js) aponta `font-serif` para `--font-display` e `font-sans` / `font-mono` para `--font-ui`.

### Escala completa implementada

Cada token `--text-*` contém um shorthand CSS válido: peso, tamanho, entrelinha e família. Aplicar com `font: var(--text-body-md)`, por exemplo. O valor “auto” do briefing foi convertido em entrelinhas numéricas, pois `line-height: auto` não é válido em CSS.

```css
:root {
--font-display: 'Fraunces', Georgia, serif;
  --font-ui: 'Plus Jakarta Sans', system-ui, sans-serif;
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
  --font-weight-extrabold: 800;
  --text-display-xl: 600 72px/80px var(--font-display);
  --text-display-lg: 600 56px/64px var(--font-display);
  --text-display-md: 600 48px/56px var(--font-display);
  --text-display-sm: 600 40px/48px var(--font-display);
  --text-display-xs: 600 36px/44px var(--font-display);
  --text-heading-xl: 600 32px/1.25 var(--font-display);
  --text-heading-lg: 600 28px/1.25 var(--font-display);
  --text-heading-md: 700 28px/1.25 var(--font-display);
  --text-heading-sm: 600 24px/1.25 var(--font-display);
  --text-heading-xs: 600 22px/1.25 var(--font-display);
  --text-subtitle-lg: 600 20px/28px var(--font-display);
  --text-subtitle-md: 600 18px/1.3 var(--font-display);
  --text-subtitle-sm: 600 16px/1.3 var(--font-display);
  --text-title-hero: 800 80px/1.05 var(--font-ui);
  --text-title-xl: 800 72px/1.05 var(--font-ui);
  --text-title-lg: 800 56px/1.1 var(--font-ui);
  --text-title-md: 800 48px/1.2 var(--font-ui);
  --text-title-sm: 800 44px/1.2 var(--font-ui);
  --text-title-xs: 800 40px/1.2 var(--font-ui);
  --text-title-section: 800 36px/1.2 var(--font-ui);
  --text-title-card: 800 28px/1.2 var(--font-ui);
  --text-title-card-sm: 800 24px/1.2 var(--font-ui);
  --text-title-subsection: 800 22px/1.2 var(--font-ui);
  --text-title-feature: 800 20px/1.2 var(--font-ui);
  --text-title-sidebar: 800 18px/1.2 var(--font-ui);
  --text-body-xl: 400 22px/1.5 var(--font-ui);
  --text-body-lg: 400 18px/1.6 var(--font-ui);
  --text-body-md: 400 16px/1.6 var(--font-ui);
  --text-body-sm: 400 15px/1.6 var(--font-ui);
  --text-body-xs: 400 14px/22px var(--font-ui);
  --text-body-caption: 400 13px/1.5 var(--font-ui);
  --text-ui-nav: 500 14px/1.4 var(--font-ui);
  --text-ui-button-primary: 800 16px/1.4 var(--font-ui);
  --text-ui-button-default: 600 15px/1.4 var(--font-ui);
  --text-ui-button-bold: 700 16px/1.4 var(--font-ui);
  --text-ui-label: 600 14px/1.4 var(--font-ui);
  --text-ui-label-bold: 700 14px/1.4 var(--font-ui);
  --text-ui-value: 400 14px/1.5 var(--font-ui);
  --text-ui-tag: 700 13px/1.4 var(--font-ui);
  --text-ui-tag-semibold: 600 13px/1.4 var(--font-ui);
  --text-ui-small: 400 12px/1.5 var(--font-ui);
  --text-ui-small-bold: 700 12px/1.5 var(--font-ui);
  --text-ui-small-semibold: 600 12px/1.5 var(--font-ui);
  --text-ui-badge: 700 11px/1.4 var(--font-ui);
  --text-ui-micro: 700 10px/1.4 var(--font-ui);
}
```

### Escolha dos níveis

| Grupo de tokens | Uso |
| :--- | :--- |
| `display-xl` a `display-sm` | Heroes e seções editoriais de landing |
| `display-xs` | Títulos de página do app |
| `heading-xl` a `heading-xs` | Páginas internas, saudações, datas e anos da timeline |
| `subtitle-lg` a `subtitle-sm` | Nomes em destaque, marca da sidebar e seções editoriais de cards |
| `title-*` | Títulos funcionais fortes, pitch, preços, números, features e cards de UI |
| `body-*` | Parágrafos, introduções, descrições e legendas |
| `ui-*` | Navegação, CTAs, labels, valores, tags, badges e metadados |

A família padrão dos títulos HTML é Fraunces. Para títulos funcionais que exigem Plus Jakarta Sans, aplicar explicitamente o token `title-*` correspondente. Os tokens disponíveis não significam que todos os componentes já usam os mesmos tamanhos: estilos locais ainda preservam dimensões próprias.

O espaçamento entre letras não integra o shorthand `font`. Aplicar separadamente conforme o briefing:

| Nível | Letter spacing |
| :--- | :--- |
| `display-xl`, `display-lg` | -1.5px |
| `display-md` | -1px |
| `ui-tag` | 1.5px |
| `ui-small-bold` | 1px |
| `ui-badge` | 0.5px |

### Marca e componentes

[BrandWordmark.jsx](../frontend/src/core/components/BrandWordmark.jsx) renderiza o nome em Fraunces e “LEGADO DIGITAL” em Plus Jakarta Sans no login e no cabeçalho móvel. Texto HTML permite usar as fontes carregadas na página; um SVG externo em `<img>` não herda essas fontes.

Botões, inputs, selects e textareas usam a família de UI. Pop-ups do mapa, códigos de pagamento e diagnósticos também usam Plus Jakarta Sans. Manter tamanho legível, quebra de linhas e alinhamento numérico sem reintroduzir uma família monoespaçada.

### Migração e validação

Inter foi substituída por `var(--font-ui)`, mantendo o mapeamento dos pesos 400–800. Playfair Display foi substituída por `var(--font-display)`. As declarações monoespaçadas foram migradas para UI.

Ao alterar tipografia, verificar carregamento das duas famílias, títulos longos, formulários, logo, modais e navegação em desktop e mobile, incluindo os temas claro e escuro. Executar build, lint e testes do frontend; procurar referências às famílias antigas nos arquivos de aplicação.
