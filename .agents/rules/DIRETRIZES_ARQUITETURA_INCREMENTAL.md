# Regras de Arquitetura e Desenvolvimento Incremental (Ethernity DMs)

## REGRA DE OURO: ESTRUTURA CONGELADA
1. **NÃO MUDE A ESTRUTURA DO PROJETO A MENOS QUE SOLICITADO EXPLICITAMENTE PELO USUÁRIO.**
   - A estrutura de pastas, a arquitetura modular (`core/` e `modules/<contexto>/{domain, application, infrastructure, presentation}`) e as dependências base estão congeladas e consolidadas.
   - Qualquer desenvolvimento deve ser **estritamente incremental**, adicionando funcionalidades sem quebrar nem reescrever o que já existe.

## REGRAS DE IMPLEMENTAÇÃO E CONTRATOS FIXOS
2. **Separação Estrita de Avatar vs. Foto Original:**
   - `avatar`: Recorte quadrado 240x240 usado **apenas** para badges, ícones e círculos de perfil.
   - `photo.img`: Foto original completa enviada pelo usuário. Dentro da cápsula (curadoria e narração), a foto DEVE ser exibida em seu **tamanho e proporção original sem cortes** (`object-fit: contain` em container de galeria).
3. **Persistência Híbrida Anti-QuotaExceeded:**
   - Metadados leves no `localStorage` (`ethernity_user_capsules`).
   - Mídias pesadas (fotos originais, áudios) no `IndexedDB` (`Ethernity_Capsules_Media`) através de `capsulesService.setCapsulePhotos()` e `capsulesService.getCapsulePhotos()`.
   - NUNCA salvar arrays pesados de imagens base64 no `localStorage`.
4. **Preservação de Cápsulas:**
   - As cápsulas padrão (`cap-1` Mariana e `cap-2` Antônio) e quaisquer cápsulas criadas pelo usuário NUNCA devem ser apagadas ou sobrescritas por novas criações.
5. **Reconhecimento Facial:**
   - Fotos sem rostos humanos detectados não devem criar pessoas.
   - Proporção estrita de 1 cápsula para cada pessoa selecionada.
6. **Integridade de Testes:**
   - Toda alteração deve manter os 82 testes do frontend aprovados (`npm run test:frontend`).
