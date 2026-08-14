# Sistema de Qualidade Mallory (CQM)

Sistema de gestão da qualidade industrial da Mallory. Centraliza inspeções (montagem, injeção, recebimento, produto importado), não conformidades, cartões de qualidade, calibração de equipamentos, indicadores e administração de usuários.

- **Backend:** API REST em Python/Flask + MySQL
- **Frontend:** SPA em React 19 + Vite
- **Idioma:** interface e termos de domínio em português (pt-BR)
- **Produção:** frontend em `https://cqm.malloryapp.com.br`, backend hospedado em EasyPanel

---

## Índice

1. [Visão geral da arquitetura](#1-visão-geral-da-arquitetura)
2. [Estrutura de pastas](#2-estrutura-de-pastas)
3. [Pré-requisitos](#3-pré-requisitos)
4. [Como rodar (passo a passo)](#4-como-rodar-passo-a-passo)
5. [Variáveis de ambiente](#5-variáveis-de-ambiente)
6. [Backend — detalhes técnicos](#6-backend--detalhes-técnicos)
7. [Frontend — detalhes técnicos](#7-frontend--detalhes-técnicos)
8. [Autenticação e permissões](#8-autenticação-e-permissões)
9. [Banco de dados e migrações](#9-banco-de-dados-e-migrações)
10. [Referência da API](#10-referência-da-api)
11. [Manual de uso (por tela)](#11-manual-de-uso-por-tela)
12. [Deploy em produção](#12-deploy-em-produção)
13. [Testes](#13-testes)
14. [Pontos de atenção](#14-pontos-de-atenção)

---

## 1. Visão geral da arquitetura

```
┌─────────────────────┐        HTTPS/JSON        ┌──────────────────────┐
│   Frontend (React)  │  ───────────────────────▶ │   Backend (Flask)    │
│   Vite SPA          │   Bearer JWT em header    │   REST API /api/*    │
│   Chart.js, axios   │ ◀─────────────────────────│   SQLAlchemy + JWT   │
└─────────────────────┘                           └──────────┬───────────┘
                                                              │
                                                   ┌──────────▼───────────┐
                                                   │   MySQL (utf8mb4)    │
                                                   └──────────────────────┘
                                                              │
                                                   ┌──────────▼───────────┐
                                                   │ Cloudflare R2 (opc.) │
                                                   │ fotos/certificados   │
                                                   └──────────────────────┘
```

- O frontend fala **apenas** com a API `/api/*`. Em desenvolvimento, o Vite faz proxy de `/api` para `http://localhost:5000`.
- A API valida o **JWT** em cada requisição e aplica controle de acesso por **papel (role)** e por **permissão de módulo/ação**.
- Fotos de evidência e certificados podem ser armazenados no **Cloudflare R2** (opcional; se não configurado, ficam no banco como texto base64).

---

## 2. Estrutura de pastas

```
sistema-qualidade/
├── backend/                      # API Flask
│   ├── app/
│   │   ├── __init__.py           # App factory, health check, auto-schema, admin padrão
│   │   ├── config.py             # Configs Development / Production / Testing
│   │   ├── extensions.py         # db, migrate, limiter, jwt
│   │   ├── models/               # Modelos SQLAlchemy (tabelas)
│   │   ├── routes/               # Blueprints (endpoints da API)
│   │   ├── schemas/              # Validação Marshmallow (registro, cartão)
│   │   ├── services/             # r2_storage.py (upload Cloudflare R2)
│   │   └── utils/                # auth_decorators, permissions, senha, auditoria, responses
│   ├── tests/                    # Testes pytest
│   ├── run.py                    # Entry point de desenvolvimento
│   ├── wsgi.py                   # Entry point de produção (gunicorn)
│   ├── gunicorn.conf.py          # Configuração do gunicorn
│   ├── Dockerfile                # Imagem de produção
│   ├── requirements.txt          # Dependências
│   └── .env.example              # Modelo de variáveis de ambiente
│
├── frontend-react/               # SPA React
│   ├── src/
│   │   ├── main.jsx              # Bootstrap React
│   │   ├── App.jsx              # Rotas (react-router-dom)
│   │   ├── pages/                # Uma pasta por tela (.jsx + .css)
│   │   ├── components/           # ProtectedRoute, Sidebar, ThemeToggle, etc.
│   │   ├── context/             # AuthContext, ThemeContext
│   │   ├── config/permissions.js # Mapa rota→módulo (RBAC de UX)
│   │   ├── services/api.js       # Camada axios + APIs por módulo
│   │   ├── ui/                   # UI kit (Button, Card, Badge, ChartCard…)
│   │   └── styles/, hooks/, utils/
│   ├── vite.config.js            # Porta 5173, proxy /api
│   ├── package.json
│   └── .env.example
│
├── DOCUMENTACAO_PROJETO_MALLORY.txt  # Documentação funcional anterior (parcialmente defasada)
└── README.md                     # Este arquivo
```

---

## 3. Pré-requisitos

| Ferramenta | Versão recomendada | Uso |
|---|---|---|
| Python | 3.11+ | Backend |
| MySQL | 8.x (InnoDB, utf8mb4) | Banco de dados |
| Node.js | 20+ | Frontend |
| npm | 10+ | Gerenciador de pacotes do frontend |
| Redis | opcional | Rate limiting distribuído (padrão usa memória) |

---

## 4. Como rodar (passo a passo)

### 4.1. Banco de dados

1. Suba um MySQL local e crie o banco:
   ```sql
   CREATE DATABASE sistema_mallory CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
   > As tabelas são criadas automaticamente na primeira execução do backend (`db.create_all()`). Não é necessário rodar migrações manualmente.

### 4.2. Backend

```bash
cd backend
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# Linux/Mac:
# source .venv/bin/activate

pip install -r requirements.txt
```

1. Copie o arquivo de ambiente e ajuste as credenciais do banco:
   ```bash
   cp .env.example .env
   ```
   Edite `.env` preenchendo `SECRET_KEY`, `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`. Para gerar uma `SECRET_KEY` forte:
   ```bash
   python -c "import secrets; print(secrets.token_hex(32))"
   ```

2. Inicie a API:
   ```bash
   python run.py
   ```
   A API sobe em `http://localhost:5000`. Na primeira execução:
   - As tabelas são criadas.
   - Um usuário **admin** padrão é criado com uma **senha temporária forte** que é impressa **uma única vez no console**. Anote-a e faça login imediatamente para trocá-la.

3. Verifique a saúde da API:
   ```bash
   curl http://localhost:5000/api/health
   ```

### 4.3. Frontend

```bash
cd frontend-react
npm install
npm run dev
```

O app abre em `http://localhost:5173`. O Vite já faz proxy de `/api` para o backend em `:5000`, então não é preciso configurar `VITE_API_URL` em desenvolvimento.

4. Acesse `http://localhost:5173`, faça login com o usuário `admin` e a senha temporária impressa no console do backend.

---

## 5. Variáveis de ambiente

### Backend (`backend/.env`)

| Variável | Descrição |
|---|---|
| `SECRET_KEY` | Chave secreta do Flask. **Obrigatória** em produção. |
| `FLASK_ENV` | `development` ou `production`. Seleciona a classe de config. |
| `JWT_SECRET_KEY` | Chave de assinatura do JWT. Se vazia, usa `SECRET_KEY`. |
| `JWT_EXPIRES_HOURS` | Validade do token (padrão `12`). |
| `CORS_ORIGINS` | Origens permitidas, separadas por vírgula. Use `*` apenas em dev. |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | Conexão MySQL. |
| `REDIS_URL` | Store do rate limiting. Padrão `memory://`. |
| `LOG_LEVEL` | Nível de log (padrão `INFO`). |
| `R2_ACCOUNT_ID`, `R2_ENDPOINT_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` | Cloudflare R2 (opcional). Preenchidos → evidências/certificados vão para o R2. |

### Frontend (`frontend-react/.env`)

| Variável | Descrição |
|---|---|
| `VITE_API_URL` | URL base da API. Em dev pode ficar vazia (usa proxy `/api`). Em produção: URL completa da API. |

---

## 6. Backend — detalhes técnicos

### Stack

Flask 2.3 (app factory) · Flask-SQLAlchemy · Flask-Migrate · Flask-JWT-Extended · Flask-CORS · Flask-Limiter · Marshmallow · PyMySQL (MySQL) · gunicorn (produção) · boto3 (Cloudflare R2).

### Entry points

- `run.py` — desenvolvimento. Cria o app, roda `db.create_all()` + admin padrão, serve em `0.0.0.0:5000` com debug.
- `wsgi.py` — produção. `create_app('production')`, servido por gunicorn (`gunicorn.conf.py` → `wsgi:app`).

### App factory (`app/__init__.py`)

- `create_app()`: carrega config, inicializa extensões, registra blueprints, handlers de erro (400/404/500) e health check em `GET /api/health`. Grava logs em `logs/`.
- **Auto-cura de schema** (`garantir_schema_*`): no boot, executa `ALTER TABLE ... ADD COLUMN` para adicionar colunas novas a bancos já existentes (usuarios, registros_injecao, equipamentos, registros_inspecao, checklist_testes, fichas_nc). **É o mecanismo de facto de migração** deste projeto — ver [seção 9](#9-banco-de-dados-e-migrações).
- `criar_admin_padrao()`: popula o catálogo de permissões e cria o usuário `admin` com senha temporária forte.

### Configuração (`app/config.py`)

Classes `Development`, `Production`, `Testing` (selecionadas por `FLASK_ENV`). Definem segredo/validade do JWT, CORS, URI MySQL (`mysql+pymysql://...utf8mb4`), pool do SQLAlchemy, rate limit padrão (`120 por minuto`) e R2. `Testing` usa SQLite em memória.

### Camadas de apoio (`app/utils/`, `app/services/`)

- `auth_decorators.py` — `auth_required(*roles)`, `permission_required(modulo, acao)`, tratamento de preflight OPTIONS e bloqueio de token "somente redefinição de senha".
- `permissions.py` — catálogo de permissões (`PERMISSOES_CATALOGO`), matriz padrão por papel (`DEFAULT_MATRIX`), `effective_permissions(user)`, `set_user_permissions()`.
- `password_validation.py` — política de senha forte (8–128 caracteres, maiúscula/minúscula/dígito/especial) e geração de senha temporária.
- `audit.py` — `log_audit()` grava trilha de auditoria.
- `responses.py` — envelope padrão `{success, message, timestamp, data, errors}`.
- `services/r2_storage.py` — upload de fotos/certificados ao Cloudflare R2 (converte data-URL base64 em objeto armazenado). Ativo apenas com todas as variáveis R2 preenchidas.

---

## 7. Frontend — detalhes técnicos

### Stack

React 19 · Vite 7 · react-router-dom 7 · axios · Chart.js + react-chartjs-2 · Font Awesome. Testes com Vitest, lint com ESLint 9.

### Bootstrap e rotas

- Entrada: `index.html` → `src/main.jsx` (importa tokens/responsive/ui-kit CSS) → `src/App.jsx`.
- `App.jsx`: `BrowserRouter` dentro de `ThemeProvider` > `AuthProvider`. Rota pública `/login`; todo o resto é envolvido por `<ProtectedRoute>`.

### Camada de API (`src/services/api.js`)

- Instância única do axios, `baseURL = import.meta.env.VITE_API_URL || '/api'`, timeout 10s.
- **Interceptor de request** injeta o `Bearer` token do `sessionStorage`.
- **Interceptor de response** redireciona para `/login` em 401/422.
- Deduplicação de GETs (`dedupedGet`) e fallback para 404.
- Exporta objetos por módulo: `authAPI, usuariosAPI, registrosAPI, fichasAPI, resumoBloqueioAPI, injecaoAPI, recebimentoAPI, relatorioRecebimentoAPI, cartoesAPI, produtosAPI, defeitosAPI, q49API, dashboardAPI, healthAPI, tiposEquipamentoAPI, equipamentosAPI, calibracoesAPI`.

### Estado, contexto e componentes

- `context/AuthContext.jsx` — estado de auth em `sessionStorage`; `login`, `completeLegacyPasswordReset`, `register`, `verifyAdmin`, `logout`, `can(modulo, acao)`, `hasModulo`.
- `context/ThemeContext.jsx` — tema claro/escuro.
- `config/permissions.js` — RBAC de UX (mapa rota→módulo, rota padrão por papel). **Apenas experiência**; o servidor é a autoridade.
- `components/`: `ProtectedRoute` (portão de auth/permissão), `Sidebar` (navegação colapsável filtrada por papel), `ThemeToggle`, `PasswordRequirements`.
- `ui/` — UI kit reutilizável (`Button`, `Badge`, `Card`, `ChartCard`, `ColumnToggle`, `EmptyState`, `PageHeader`). Documentado em `frontend-react/UI_KIT.md`.

### Estilo

Design system em CSS custom-properties (sem framework CSS). `styles/tokens.css` (laranja Mallory `#ff6600`), `responsive.css`, `ui/theme/ui-kit.css`, CSS por página/componente, mais Font Awesome.

---

## 8. Autenticação e permissões

### Fluxo de login

1. Usuário envia **usuário + senha** para `POST /api/auth/login` (rate limit 10/min).
2. A API retorna um **JWT** (validade 12h) com claims de `role` e `usuario`. O frontend guarda em `sessionStorage`.
3. Cada requisição envia `Authorization: Bearer <token>`.

### Migração de PIN legado

Usuários antigos autenticavam por **PIN de 4 dígitos**. No primeiro login, o sistema força a migração para **senha forte**:
- Login com PIN legado retorna `must_reset_password` + token de curta duração.
- O usuário completa a troca em `POST /api/auth/redefinir-senha-legado`.
- A política de senha exige 8–128 caracteres com maiúscula, minúscula, dígito e caractere especial.

### Controle de acesso (RBAC em duas camadas)

- **Papéis (roles):** `admin`, `supervisor`, `inspetor`, `inspetor_injecao`, `consultor`.
- **Permissões por módulo/ação:** cada papel tem uma matriz padrão (`DEFAULT_MATRIX`), que pode ser sobrescrita **por usuário** na tela de Usuários.
- O backend é a autoridade: decorators `@auth_required()` e `@permission_required(modulo, acao)` protegem os endpoints. O RBAC do frontend (`config/permissions.js`) serve apenas para esconder menus/rotas.

---

## 9. Banco de dados e migrações

- **MySQL** (InnoDB, utf8mb4) em produção; **SQLite** em memória nos testes.
- As tabelas são criadas por `db.create_all()` no boot.
- **Não existe pasta `migrations/` (Alembic)** apesar de o Flask-Migrate estar instalado. A evolução do schema é feita **manualmente** pelas funções `garantir_schema_*` em `app/__init__.py`, que rodam `ALTER TABLE ... ADD COLUMN` no startup.

> **Importante:** ao adicionar uma coluna nova a um modelo, é preciso adicionar o `ALTER TABLE` correspondente em `garantir_schema_*`, senão bancos já existentes não recebem a coluna.

### Principais tabelas

| Modelo | Tabela | Descrição |
|---|---|---|
| `Usuario` | `usuarios` | Usuários, papéis, hash de senha (campo legado `pin_hash`), flags de reset |
| `RegistroInspecao` + `ChecklistTeste` | `registros_inspecao`, `checklist_testes` | Inspeção de montagem + checklist 1:N |
| `RegistroInjecao` | `registros_injecao` | Inspeção de injeção plástica (cotas, foto, avaliações C/NC/NA) |
| `FichaRecebimento`, `RelatorioRecebimento` | `fichas_recebimento`, `relatorios_recebimento` | Recebimento (tabelas aninhadas em JSON) |
| `Permissao`, `UsuarioPermissao` | `permissoes`, `usuario_permissoes` | Catálogo + concessões por usuário |
| `CartaoQualidade` | `cartoes_qualidade` | Cartões de qualidade |
| `Produto` | `tb_produtos` | Cadastro de produtos (somente leitura: código SAP, EAN/UPC, família, linha) |
| `Defeito` | `tb_defeito` | Lista de defeitos |
| `Auditoria` | `auditoria` | Trilha de auditoria (ação, antes/depois em JSON, usuário, IP) |
| `TipoEquipamento`, `Equipamento`, `Calibracao` | `tipos_equipamento`, `equipamentos`, `calibracoes` | Domínio de calibração |
| `Q49Registro` | `q49_registros` | Inspeção de produto importado (seções China/Decisão Brasil/Brasil) |
| `ResumoBloqueio` + `ResumoBloqueioLinha` | `resumos_bloqueio`, `resumo_bloqueio_linhas` | Resumo diário de bloqueio |
| `FichaNC` | `fichas_nc` | Ficha de não conformidade (5 porquês, custos, aprovações, evidência) |

---

## 10. Referência da API

Base: `/api`. Todos os endpoints (exceto `/auth/login`, `/auth/redefinir-senha-legado` e `/health`) exigem `Authorization: Bearer <token>`.

| Prefixo | Endpoints principais |
|---|---|
| `/api/health` | `GET` — saúde da API |
| `/api/auth` | `POST /login`, `POST /redefinir-senha-legado`, `GET /me`, `POST /register` (admin), `POST /verify-admin`, `GET /usuarios`, `DELETE /usuarios/<id>` |
| `/api/usuarios` | `GET /catalogo`, `GET/POST ''`, `GET/PUT/DELETE /<id>`, `PATCH /<id>/ativo` |
| `/api/registros` | CRUD de inspeção de montagem (`GET/POST ''`, `GET/PUT/DELETE /<id>`) + checklist |
| `/api/nao-conformidades` | CRUD de fichas NC (FNC) |
| `/api/inspecao-injecao` | CRUD de injeção + `GET /maquinas` + `GET /defeitos` |
| `/api/inspecao-recebimento` | CRUD da ficha de recebimento |
| `/api/relatorio-recebimento` | CRUD do relatório de entrada nacional |
| `/api/cartoes` | CRUD de cartões + `GET /stats` |
| `/api/produtos` | `GET ''`, `GET /<codigo>`, `GET /barcode/<ean>`, `GET /search` |
| `/api/defeitos` | `GET/POST ''`, `DELETE /<id>` (admin/supervisor) |
| `/api/dashboard` | `GET /stats`, `/builder-data`, `/ultimas-inspecoes`, `/inspecoes-por-linha`, `/inspecoes-injecao-por-maquina` |
| `/api/q49` | CRUD de inspeção de produto importado |
| `/api/equipamentos`, `/api/tipos-equipamento`, `/api/calibracoes` | CRUD; `GET /calibracoes/<id>/certificado`, `/calibracoes/stats`, `/calibracoes/alertas` |
| `/api/resumo-bloqueio` | `GET/PUT /<data_iso>` — resumo por data |

### Formato de resposta

```json
{
  "success": true,
  "message": "…",
  "timestamp": "2026-08-11T12:00:00Z",
  "data": { },
  "errors": null
}
```

---

## 11. Manual de uso (por tela)

> Rota base do app: `http://localhost:5173` (dev) ou `https://cqm.malloryapp.com.br` (produção). O menu lateral mostra apenas os módulos permitidos ao seu papel.

### Login (`/login`)
Informe **usuário** e **senha**. Se sua conta ainda usa PIN antigo, o sistema pede a criação de uma senha forte (a tela mostra os requisitos em tempo real). Admins podem criar novas contas a partir daqui (com verificação de admin).

### Dashboard (`/dashboard`)
Painel de indicadores de qualidade quase em tempo real: filtros de período, comparações, gráficos customizáveis (Chart.js) e tabela das últimas inspeções. Ponto de partida do sistema.

### Inspeção de Montagem (`/registros/montagem`)
Registro de inspeção de montagem com **checklist completo de testes** (corrente, potência, hipot, etiquetas, plugue, grafismos, embalagens, peças, montagem, visual). Permite busca por **código SAP** ou **código de barras** e impressão do cartão de qualidade. Registros reprovados podem originar uma ficha de não conformidade.

### Inspeção de Injeção (`/registros/injecao`)
Inspeção de injeção plástica: seleção de **máquina** e **molde**, preenchimento de **cotas críticas**, avaliações **C/NC/NA** e anexo de **foto** da peça.

### Inspeção de Recebimento (`/registros/recebimento`)
Ficha de inspeção de recebimento: **lotes**, **dimensões** e **resultados** em tabelas aninhadas.

### Relatório de Recebimento (`/registros/relatorio-recebimento`)
Relatório de entrada de matéria-prima nacional: tabela larga com colunas configuráveis (mostrar/ocultar colunas).

### Produto Importado / Q49 (`/registro/produto-importado`)
Inspeção de produto importado com seções de decisão **China / Decisão Brasil / Brasil**.

### Cartões de Qualidade (`/cartoes`)
Gestão de cartões de qualidade e estatísticas associadas.

### Fichas de Não Conformidade — FNC (`/fichas-nc/fnc`)
Formulário completo de não conformidade: **5 porquês** (análise de causa), ações, **custos**, aprovações e validação de eficácia, com foto de evidência.

### Resumo de Bloqueio (`/fichas-nc/resumo-bloqueio`)
Resumo diário de bloqueio por data, com linhas 1:N e evidências.

### Calibração (`/calibracao`)
Cadastro de **equipamentos**, **tipos de equipamento** e **calibrações**; consulta de **certificados** e **alertas** de vencimento; estatísticas de calibração.

### Indicadores (`/indicadores`)
Gráficos e indicadores adicionais consolidando os módulos de inspeção.

### Relatórios (`/relatorios`)
Relatórios e exportações entre módulos.

### Usuários (`/usuarios`)
Administração de usuários e **permissões por módulo/ação** (sobrescreve a matriz padrão do papel). Ativar/desativar contas.

---

## 12. Deploy em produção

### Backend

- Servido por **gunicorn**: `gunicorn --config gunicorn.conf.py wsgi:app` (workers = 2·CPU + 1).
- Containerizado via `backend/Dockerfile` (python:3.11-slim, usuário não-root, expõe a porta 5000).
- Hospedado em **EasyPanel** (conforme comentários de ambiente).
- Defina `FLASK_ENV=production` e todas as variáveis obrigatórias (`SECRET_KEY`, credenciais MySQL, `CORS_ORIGINS` restrito ao domínio do frontend).

### Frontend

- Build: `npm run build` → `frontend-react/dist/` (arquivos estáticos).
- `.env.production` define `VITE_API_URL` apontando para a API de produção.
- Publicado em `https://cqm.malloryapp.com.br`.

> Não há `docker-compose` nem pipeline de CI no repositório.

---

## 13. Testes

### Backend (pytest)

```bash
cd backend
pip install -r requirements-dev.txt
pytest
```
Testes em `backend/tests/` (`test_auth.py`, `test_password_validation.py`). A config de teste usa SQLite em memória.

### Frontend (Vitest)

```bash
cd frontend-react
npm test
```

---

## 14. Pontos de atenção

- **Migrações são manuais.** Toda coluna nova precisa de um `ALTER TABLE` correspondente em `garantir_schema_*` (`app/__init__.py`), pois o projeto não usa Alembic. Ver [seção 9](#9-banco-de-dados-e-migrações).
- **Documentação anterior defasada.** `DOCUMENTACAO_PROJETO_MALLORY.txt` ainda descreve a autenticação como "PIN de 4 dígitos". O código atual usa **senha forte** com migração automática do PIN legado.
- **Senha do admin padrão** é gerada e impressa **uma única vez** no console no primeiro boot. Se não for anotada, será necessário recriar/redefinir a conta.
- **Schema Marshmallow de injeção** (`app/schemas/injecao.py`) existe mas **não é exportado/usado** em `schemas/__init__.py`; a maioria das rotas valida manualmente.
- **`sessionStorage`** guarda o token: fechar a aba encerra a sessão (comportamento intencional).
- **RBAC do frontend é apenas UX.** A autoridade de acesso é sempre o backend.
