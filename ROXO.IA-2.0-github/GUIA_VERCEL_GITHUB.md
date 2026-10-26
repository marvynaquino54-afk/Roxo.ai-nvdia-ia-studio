# 🚀 Guia Passo a Passo: Publicando o roxo.ia no GitHub e Vercel (plano gratuito)

Este guia foi escrito para quem **não tem experiência com programação**. Ele mostra como colocar a aplicação em um link público (exemplo: `https://seu-app.vercel.app`).

> **Antes de publicar, leia a seção “Checklist de segurança”.** A autenticação desta versão é local no navegador e **não é adequada para custodiar dinheiro real**.

---

## 📌 O que você precisa

1. Conta gratuita no **GitHub** — <https://github.com>
2. Conta gratuita na **Vercel** — <https://vercel.com>
3. (Opcional) chave gratuita do **Google Gemini** — <https://aistudio.google.com>
4. Projeto instalado e funcionando no seu computador (`npm install` e `npm run dev`)

---

## 1️⃣ Passo 1: Criar o repositório no GitHub

1. Acesse <https://github.com> e faça login.
2. Clique no ícone **`+`** (canto superior direito) → **“New repository”**.
3. Em **Repository name**, digite: `roxo-ia`.
4. Escolha **Private** (recomendado) ou **Public**.
5. Clique em **“Create repository”**.
6. Envie os arquivos do projeto.

### Como enviar os arquivos sem dor de cabeça

**Opção A — GitHub Desktop (mais fácil):**
1. Instale o **GitHub Desktop**.
2. Clique em **File → Add local repository** e escolha a pasta do projeto.
3. Escreva uma mensagem (ex.: `primeira versão`) e clique em **Commit to main**.
4. Clique em **Publish repository**.

**Opção B — upload pelo site:**
1. Na página do repositório, clique em **“uploading an existing file”**.
2. Arraste os arquivos e pastas do projeto.
3. **Não envie** as pastas `node_modules` e `dist`, nem o arquivo `.env`.
4. Clique em **“Commit changes”**.

> O `.gitignore` já ignora `node_modules/`, `dist/`, `.env*` e logs. Ainda assim, confira antes de enviar.

---

## 2️⃣ Passo 2: Publicar na Vercel

1. Acesse <https://vercel.com> e entre com **“Continue with GitHub”**.
2. Clique em **“Add New…” → “Project”**.
3. Encontre o repositório `roxo-ia` e clique em **“Import”**.
4. Na configuração:
   - **Framework Preset:** `Vite`
   - **Root Directory:** `./`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
5. Em **Environment Variables** (opcional, mas recomendado):
   - Nome: `GEMINI_API_KEY`
   - Valor: sua chave do Google AI Studio
   - Não é necessário adicionar `PORT`.
6. Clique em **“Deploy”**.
7. Aguarde cerca de 1 minuto. A Vercel mostrará o link público.
8. Se alterar o código depois, clique em **“Redeploy”** para publicar a nova versão.

### O que funciona na Vercel

| Recurso | Na Vercel |
|---|---|
| Interface, backtest, setups, gestão e diário | Sim (dados no navegador) |
| IA Gemini | Sim, com `GEMINI_API_KEY` configurada |
| Velas via Yahoo Finance | Sim, pela função serverless |
| Velas via Binance (cripto) | Sim, direto do navegador |
| Twelve Data com chave própria | Sim, direto do navegador |
| Ponte MT5 (`/api/market/mt5-ingest`) | **Não** — só no servidor local Express |

---

## 3️⃣ Passo 3: Acessar como administrador

1. Abra o site publicado.
2. Clique em **Entrar / Cadastrar**.
3. Digite:
   - **E-mail:** `admin@roxo.ia`
   - **Senha inicial:** `admin123456`
4. Clique em **Entrar**.
5. Vá para a aba **Painel Admin** e **troque a senha imediatamente**.

> O botão antigo “Preencher Login do Dono” foi removido por segurança. Digite os dados manualmente.

### ⚠️ Importante sobre a autenticação

- O login é **local no navegador** (localStorage). Não há servidor de contas.
- Se você abrir o site em outro computador ou navegador, **a conta e os dados não estarão lá**.
- Limpar os dados do navegador apaga contas, setups e diário.
- Não reutilize senhas de outros sites.
- Esta autenticação **não protege uma operação financeira real**. Para isso seria necessário um backend de autenticação, que não está incluído.

---

## 🔐 Checklist de segurança antes de publicar

- [ ] Troquei a senha do administrador (`admin123456`).
- [ ] Não enviei o arquivo `.env` para o GitHub.
- [ ] Configurei `GEMINI_API_KEY` na Vercel (se quiser IA).
- [ ] Se usei chave Gemini no navegador, sei que ela fica no localStorage.
- [ ] Entendi que os dados são locais e não há backup automático na nuvem.
- [ ] Não vou usar esta versão para custodiar dinheiro real.
- [ ] Se o projeto for público, revise se não há chaves ou dados pessoais no código.

---

## 💡 Perguntas frequentes

### Vou pagar algo para manter o site no ar?
Os planos gratuitos de GitHub e Vercel são suficientes para projetos pessoais. A Vercel pode ter limites de uso e de funções serverless; consulte as condições atuais no site.

### As estratégias e o diário continuam salvos ao fechar o navegador?
Sim, **no mesmo navegador e no mesmo dispositivo**. Não há sincronização em nuvem. Use o botão **Backup Dados JSON** na aba Conexão para guardar uma cópia — ele inclui chaves de API em texto puro, então mantenha o arquivo seguro.

### Funciona no celular?
A interface é responsiva. O envio de prints/fotos usa a câmera do dispositivo. A ponte MT5 local continua dependendo de um computador executando o script.

### A IA não está respondendo. O que fazer?
1. Confira se `GEMINI_API_KEY` está configurada na Vercel ou na aba Conexão.
2. Verifique se a chave está ativa no Google AI Studio.
3. Se a IA falhar, o sistema usa o **Motor Estatístico Local** e informa isso. Isso é esperado, não é um erro silencioso.

### O feed de velas caiu. O app inventa dados?
Não. Se todos os provedores falharem, aparece **“Feed Indisponível”** e o sinal é bloqueado.

### Posso usar a ponte MT5 na Vercel?
Não. O endpoint de ingestão MT5 guarda as velas na memória do servidor Express local. Na Vercel, use Twelve Data, Yahoo Finance ou Binance.

---

## 📚 Documentação relacionada

- [`README.md`](./README.md) — instalação, comandos, atalhos e limitações
- [`docs/REFERENCIA_TECNICA.md`](./docs/REFERENCIA_TECNICA.md) — endpoints, segurança e motores
- [`CHANGELOG.md`](./CHANGELOG.md) — o que mudou nesta versão
