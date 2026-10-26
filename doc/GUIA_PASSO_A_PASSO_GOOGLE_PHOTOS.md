# 📸 Guia Passo a Passo: Configuração do Google Fotos no Ethernity DMs

Este guia prático foi criado para orientar você, do zero ao login real, na configuração e ativação da integração oficial com o **Google Fotos** no **Ethernity DMs**.

---

## 📌 Sumário
1. [Conceito Essencial: De Quem é o Client ID?](#1-conceito-essencial-de-quem-é-o-client-id)

2. [Pré-requisitos Gratuitos](#2-pré-requisitos-gratuitos)

3. [Passo 1: Criar o Projeto no Google Cloud](#passo-1-criar-o-projeto-no-google-cloud)

4. [Passo 2: Ativar a Google Photos Library API](#passo-2-ativar-a-google-photos-library-api)

5. [Passo 3: Configurar a Tela de Permissão OAuth](#passo-3-configurar-a-tela-de-permissão-oauth)

6. [Passo 4: Criar o ID do Cliente OAuth (Client ID)](#passo-4-criar-o-id-do-cliente-oauth-client-id)

7. [Passo 5: Salvar o Client ID no Ethernity](#passo-5-salvar-o-client-id-no-ethernity)

8. [Passo 6: Fazer Login e Listar Suas Fotos Pessoais](#passo-6-fazer-login-e-listar-suas-fotos-pessoais)

9. [Solução de Dúvidas e Erros Comuns](#-solução-de-dúvidas-e-erros-comuns)

---

## 1. Conceito Essencial: De Quem é o Client ID?

* **O Client ID pertence à APLICAÇÃO (Ethernity)**: É o "RG" do seu aplicativo perante o Google. Você como criador/desenvolvedor só precisa criá-lo **uma única vez**.
* **O Usuário Final NÃO cria nada**: Qualquer pessoa que acessar o Ethernity apenas clica em **"Conectar Minha Conta Google"**, digita o seu e-mail do Gmail e senha, e autoriza. O usuário comum jamais precisará abrir o Google Cloud Console.

---

## 2. Pré-requisitos Gratuitos

* Uma conta Google pessoal (exemplo: `seuemail@gmail.com`).
* Um navegador web com o projeto Ethernity aberto (`http://localhost:5173`).
* **Custo**: **R$ 0,00**. Não é necessário cartão de crédito para criar projetos ou credenciais OAuth 2.0 de teste/desenvolvimento no Google Cloud.

---

## Passo 1: Criar o Projeto no Google Cloud

1. Acesse o **Google Cloud Console**:
   👉 **[https://console.cloud.google.com/](https://console.cloud.google.com/)**
2. Faça login com a sua conta Google (`@gmail.com`).
3. No topo da tela (ao lado da barra de pesquisa), clique no **seletor de projetos** (geralmente mostra o nome de um projeto ou *"Selecionar projeto"*).
4. Na janela que se abrir, clique no canto superior direito em **"Novo Projeto"** (*New Project*).
5. Preencha as informações:
   * **Nome do Projeto**: `Ethernity`
   * **Organização**: deixe em *"Nenhuma organização"*
6. Clique no botão azul **"Criar"**.
7. Aguarde alguns segundos até a notificação de projeto criado e certifique-se de que o projeto **Ethernity** está selecionado no topo.

---

## Passo 2: Ativar a Google Photos Library API

1. No menu lateral esquerdo (ícone ☰), clique em **APIs e Serviços** > **Biblioteca** (*APIs & Services > Library*).
2. Na barra de pesquisa central, digite:
   ```text
   Google Photos Library API
   ```
3. Nos resultados de pesquisa, clique em **Google Photos Library API**.
4. Clique no botão azul **"Ativar"** (*Enable*).
5. *(Opcional)* Se disponível, pesquise também por **Google Photos Picker API** e clique em **Ativar**.

---

## Passo 3: Configurar a Tela de Permissão OAuth

Antes de gerar o código, o Google precisa saber quais dados o app vai pedir e quem pode testar:

1. No menu lateral esquerdo, clique em **APIs e Serviços** > **Tela de permissão OAuth** (*OAuth consent screen*).
2. Em **Tipo de Usuário** (*User Type*), selecione:
   * **`Externo`** (*External*)
   * Clique em **Criar**.
3. **Passo 1 da tela — Informações do app**:
   * **Nome do app**: `Ethernity`
   * **E-mail para suporte do usuário**: selecione seu próprio e-mail Gmail.
   * **Dados de contato do desenvolvedor**: digite seu próprio e-mail Gmail.
   * Clique em **Salvar e Continuar**.
4. **Passo 2 da tela — Escopos** (*Scopes*):
   * Clique em **Adicionar ou remover escopos**.
   * Selecione:
     * `.../auth/userinfo.email`
     * `.../auth/userinfo.profile`
     * `openid`
   * Em *Adicionar escopos manualmente*, você também pode colar:
     ```text
     https://www.googleapis.com/auth/photoslibrary.readonly
     ```
   * Clique em **Atualizar** e depois em **Salvar e Continuar**.
5. **Passo 3 da tela — Usuários de Teste** (*Test Users*) — **MUITO IMPORTANTE**:
   > ⚠️ Enquanto o app não passar pela verificação pública do Google, apenas os e-mails cadastrados aqui conseguem fazer login.
   * Clique em **`+ Add Users`** (*Adicionar Usuários*).
   * Digite o seu **e-mail pessoal do Gmail** (ex: `vameri@gmail.com`).
   * Clique em **Salvar**.
   * Clique em **Salvar e Continuar**.
6. No resumo final, clique em **Voltar ao Painel**.

---

## Passo 4: Criar o ID do Cliente OAuth (Client ID)

Agora vamos gerar o código oficial:

1. No menu lateral esquerdo, clique em **APIs e Serviços** > **Credenciais** (*Credentials*).
2. No topo da página, clique em **`+ Criar Credenciais`** (*Create Credentials*) e escolha **`ID do cliente OAuth`** (*OAuth client ID*).
3. Preencha os campos exatamente como abaixo:
   * **Tipo de aplicativo**: selecione **`Aplicativo da Web`** (*Web application*).
   * **Nome**: `Ethernity Web`.
4. **Origens JavaScript autorizadas** (*Authorized JavaScript origins*):
   * Clique em **+ Adicionar URI** e digite:
     ```text
     http://localhost:5173
     ```
   * Clique em **+ Adicionar URI** novamente e adicione:
     ```text
     http://127.0.0.1:5173
     ```
   *(Quando for publicar para a internet no futuro, adicione também o seu domínio real, ex: `https://meuapp.com`).*
5. **URIs de redirecionamento autorizados** (*Authorized redirect URIs*):
   * Clique em **+ Adicionar URI** e digite:
     ```text
     http://localhost:5173
     ```
   * Clique em **+ Adicionar URI** e digite:
     ```text
     http://localhost:5173/auth/google/callback
     ```
6. Clique no botão azul **Criar**.
7. Uma janela pop-up chamada **"Cliente OAuth criado"** será exibida com o seu:
   * **ID do cliente** (*Client ID*).
   * Exemplo de formato:
     ```text
     123456789012-abcdefghijklmnopqrstuvwxyz123456.apps.googleusercontent.com
     ```
8. Clique no ícone de **Copiar** ao lado do ID do cliente.

---

## Passo 5: Salvar o Client ID no Ethernity

Você pode salvar o Client ID de duas maneiras:

### Opção A: Pela Interface do Ethernity (Imediato)
1. Com a aplicação aberta em `http://localhost:5173`, abra o modal do Google Fotos.
2. Clique no ícone de engrenagem **⚙️** no canto superior direito do modal.
3. Cole o código que você copiou no campo de texto.
4. Clique no botão **"Salvar"**.

### Opção B: No arquivo `.env` (Recomendado para Produção)
1. No seu editor de código, abra o arquivo:
   [`frontend/.env`](file:///Users/vagneribas/Documents/GitHub/ethernity/frontend/.env)
2. Cole o código na linha `VITE_GOOGLE_CLIENT_ID`:
   ```env
   VITE_GOOGLE_CLIENT_ID=123456789012-abcdefghijklmnopqrstuvwxyz123456.apps.googleusercontent.com
   VITE_API_URL=http://localhost:8000
   ```
3. Salve o arquivo. *(O Vite recarrega automaticamente).*

---

## Passo 6: Fazer Login e Listar Suas Fotos Pessoais

1. No Ethernity, clique no botão azul com o logo do Google: **"Conectar Minha Conta Google"**.
2. A janela oficial do Google será aberta:
   * Selecione a sua conta pessoal (ex: `vameri@gmail.com`).
   * Se aparecer a mensagem *"O Google não verificou este app"*, clique em **Avançado** (*Advanced*) e depois em **Acessar Ethernity (não seguro)**. *(Isso é padrão durante a fase de desenvolvimento)*.
   * Marque a caixinha permitindo acesso à biblioteca de fotos e clique em **Continuar**.
3. **Pronto!**
   * O modal exibirá seu **nome**, **foto de perfil real** e **e-mail**.
   * A galeria carregará as suas **fotos reais do Google Fotos**.
   * Você poderá navegar, filtrar por data, ampliar em tela cheia e selecionar quais deseja **importar para o Cofre Criptografado (AES-256)** ou anexar a uma **Cápsula do Tempo**.

---

## 🛠️ Solução de Dúvidas e Erros Comuns

### 1. `Erro 401: invalid_client / The OAuth client was not found`
* **Causa**: O código colado tem erro de digitação, espaços vazios no começo/fim, ou não foi criado no Google Cloud.
* **Solução**: Certifique-se de copiar o código inteiro do Google Cloud Console. Ele **obrigatoriamente** termina com `.apps.googleusercontent.com`. Aguarde também 1 minuto após criar a credencial para a sincronização global do Google.

### 2. `Erro 403: access_denied`
* **Causa**: O e-mail que você está usando para logar não foi colocado na lista de "Usuários de Teste".
* **Solução**: Vá em **APIs e Serviços > Tela de permissão OAuth > Usuários de Teste**, clique em **Adicionar Usuários** e insira o seu e-mail pessoal.

### 3. `Erro de Origem não permitida (redirect_uri_mismatch)`
* **Causa**: O endereço do navegador não bate com as origens cadastradas.
* **Solução**: Vá em **Credenciais > clique no seu Client ID** e confirme se em *Origens JavaScript autorizadas* consta exatamente `http://localhost:5173`.

### 4. `Pop-up bloqueado pelo navegador`
* **Causa**: O navegador bloqueou a abertura da janela do Google.
* **Solução**: Na barra de endereços do navegador (canto superior direito), clique no ícone de pop-up bloqueado e selecione *"Sempre permitir pop-ups de localhost:5173"*.
