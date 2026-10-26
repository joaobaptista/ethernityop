# AGENTS.md — Diretrizes de Governança para Agentes de IA

## 🔒 Imutabilidade Estrutural e Desenvolvimento Incremental

> **ATENÇÃO:** A arquitetura do projeto Ethernity está homologada e **CONGELADA**.  
> **Não altere estruturas do projeto** (pastas, organização modular, contratos de serviços ou reescrita de código base) a menos que o usuário solicite explicitamente com as palavras exatas.  
> **Todo o trabalho deve ser estritamente incremental.**

### Documento Oficial de Referência:
- [DOCUMENTACAO.md](DOCUMENTACAO.md) — documentação técnica única (arquitetura, cofre, IA local, segurança, deploy e pendências)

### Regras Mandatórias:
1. **Foto Original vs Avatar:** Dentro da cápsula, o estúdio de narração e os álbuns exibem SEMPRE a foto original completa em seu tamanho e proporção natural (`object-fit: contain;`). O avatar quadrado é reservado apenas a ícones circulares e badges.
2. **Persistência Híbrida:** Metadados no `localStorage`, fotos pesadas e mídias no `IndexedDB` através do [capsulesService.js](file:///Users/vagneribas/Documents/GitHub/ethernity/frontend/src/modules/capsules/application/capsulesService.js).
3. **Preservação e Unicidade das Cápsulas do Usuário:** As cápsulas criadas pelo usuário são preservadas permanentemente com persistência híbrida e isolamento total. A aplicação opera com dados 100% limpos e autênticos (zero dados mockados injetados por padrão), assegurando que o usuário inicie em ambiente virgem.
4. **Qualidade Automatizada:** Manter 100% de aprovação na suíte de testes (`npm run test:frontend`).
5. **Estanqueidade, Unicidade e Expurgo Definitivo:** Toda cápsula criada possui conteúdo estritamente único e estanque. Quando uma cápsula ou item é deletado, sua eliminação é definitiva (expurgo imediato de memórias, IndexedDB e chaves de rascunhos). É terminantemente proibido ressuscitar dados apagados ou importar/misturar fotos e rascunhos de outras cápsulas ou de timelines globais.
