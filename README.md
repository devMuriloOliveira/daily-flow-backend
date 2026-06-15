# DailyFlow — Backend

API REST responsável pela autenticação, persistência de tarefas, recorrências, conclusões por data e estatísticas do DailyFlow.

## Stack

- [Node.js](https://nodejs.org/)
- [Express](https://expressjs.com/) 5
- [Prisma](https://www.prisma.io/) ORM
- [JWT](https://github.com/auth0/node-jsonwebtoken) — autenticação stateless
- [bcrypt](https://github.com/kelektiv/node.bcrypt.js) — hash de senhas
- [CORS](https://github.com/expressjs/cors)
- Banco relacional **PostgreSQL** via Prisma 7 (`@prisma/adapter-pg` + driver `pg`)

## Banco de dados

O projeto utiliza **PostgreSQL** como banco principal, tanto em desenvolvimento quanto em produção. Recomenda-se [Neon](https://neon.tech/) (plano gratuito) para hospedar o banco na nuvem.

> **Nota:** o DailyFlow foi migrado de SQLite para PostgreSQL. Dados e usuários do banco local antigo **não são migrados automaticamente**. Após trocar o banco, faça **cadastro/login novamente** no frontend.

### Stack de persistência

| Componente | Uso |
|------------|-----|
| `prisma/schema.prisma` | Modelos `User`, `Task`, `TaskCompletion` (provider: `postgresql`) |
| `prisma.config.ts` | URL do banco via `DATABASE_URL` |
| `src/lib/prisma.js` | Prisma Client com adapter `@prisma/adapter-pg` |
| `pg` | Pool de conexões PostgreSQL |

No **Prisma 7**, o client exige um driver adapter. Não use `new PrismaClient()` sem adapter.

### Configurar o banco (Neon ou PostgreSQL local)

1. Crie um projeto/banco PostgreSQL (ex.: Neon).
2. Copie a **connection string** (formato `postgresql://...`).
3. Cole em `DATABASE_URL` no arquivo `.env`.
4. Aplique as migrations:

```bash
npx prisma generate
npx prisma migrate deploy
```

Exemplo de `.env`:

```env
DATABASE_URL="postgresql://usuario:senha@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require"
JWT_SECRET="sua-chave-secreta-local"
PORT=3333
```

### Modelos principais

- **User** — conta do usuário (autenticação)
- **Task** — definição da tarefa (recorrência, horários, prioridade, categoria)
- **TaskCompletion** — registro de conclusão por data (permite marcar tarefa recorrente como feita em um dia específico)

### Sessão após troca de banco

Tokens JWT antigos podem referenciar usuários que não existem no novo PostgreSQL. Nesse caso, a API retorna **401** (*Sessão inválida. Faça login novamente.*). Basta entrar de novo com uma conta válida no banco atual.

## Responsabilidades

- **Autenticação** — cadastro, login e emissão de token JWT
- **Proteção de rotas** — middleware que valida o token em rotas privadas
- **CRUD de tarefas** — criar, listar, editar, excluir e buscar por ID
- **Recorrência flexível** — suporte a:
  - tarefa única (`once`)
  - dias da semana com horários por dia (`week_days`)
  - ciclo flexível com dias ativos e descanso (`cycle`)
- **Conclusão por data** — modelo `TaskCompletion` registra conclusão por dia, sem alterar a definição da tarefa
- **Estatísticas** — total, concluídas, taxa de conclusão, gráfico semanal
- **Ofensiva (streak)** — sequência atual e melhor sequência de dias com tarefas concluídas
- **Agenda por data** — listagem de tarefas filtradas por data (`GET /tasks?date=YYYY-MM-DD`)

## Endpoints principais

### Usuários (`/users`)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/users/register` | Não | Cadastro |
| POST | `/users/login` | Não | Login (retorna JWT) |
| GET | `/users/me` | Sim | Dados do usuário logado |

### Tarefas (`/tasks`)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/tasks` | Sim | Criar tarefa |
| GET | `/tasks?date=` | Sim | Listar tarefas do dia |
| GET | `/tasks/statistics` | Sim | Estatísticas e streak |
| GET | `/tasks/:id` | Sim | Buscar tarefa |
| PUT | `/tasks/:id` | Sim | Atualizar tarefa |
| PATCH | `/tasks/:id/toggle` | Sim | Marcar/desmarcar conclusão na data |
| DELETE | `/tasks/:id` | Sim | Excluir tarefa |

## Pré-requisitos

- Node.js 18+
- npm

## Instalação

```bash
cd backend
npm install
```

## Configuração do ambiente

Copie o arquivo de exemplo e preencha os valores:

```bash
cp .env.example .env
```

Variáveis disponíveis:

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | Connection string PostgreSQL (`postgresql://...`) |
| `JWT_SECRET` | Chave secreta para assinar tokens JWT |
| `PORT` | Porta do servidor (opcional, padrão `3333`) |

Consulte a seção [Banco de dados](#banco-de-dados) para detalhes sobre Neon, migrations e Prisma 7.

Exemplo no `.env`:

```env
DATABASE_URL="postgresql://usuario:senha@host/neondb?sslmode=require"
JWT_SECRET="sua-chave-secreta-local"
PORT=3333
```

> Use um `JWT_SECRET` longo e aleatório em produção. Nunca commite o arquivo `.env`.

## Prisma — migrations e client

Gerar o Prisma Client após instalar dependências ou alterar o schema:

```bash
npx prisma generate
```

Aplicar migrations no banco:

```bash
npx prisma migrate deploy
```

Em desenvolvimento, para criar/aplicar novas migrations:

```bash
npx prisma migrate dev
```

Visualizar o banco (opcional):

```bash
npx prisma studio
```

## Executar em desenvolvimento

```bash
npm run dev
```

A API ficará disponível em `http://localhost:3333`.

Rota de health check: `GET /`

## Executar em produção

```bash
npx prisma generate
npx prisma migrate deploy
node src/server.js
```

Recomenda-se usar um process manager (PM2, Docker, Render, Railway, etc.) e definir `NODE_ENV=production`.

## Estrutura resumida

```
backend/
├── prisma/
│   ├── schema.prisma    # Modelos User, Task, TaskCompletion
│   └── migrations/      # Histórico de migrations
├── src/
│   ├── controllers/     # Lógica das rotas
│   ├── middlewares/     # Autenticação JWT
│   ├── routes/          # Definição de rotas
│   ├── lib/             # Cliente Prisma
│   └── server.js        # Entrada da aplicação
├── .env.example
└── prisma.config.ts     # Configuração Prisma 7
```

## Deploy

1. Configure `DATABASE_URL` (PostgreSQL/Neon) e `JWT_SECRET` no ambiente de produção.
2. Execute `npx prisma generate` e `npx prisma migrate deploy`.
3. Inicie o servidor com `node src/server.js`.
4. Libere CORS para o domínio do frontend em produção.

> Em serviços gratuitos (Render, Railway, Neon etc.), o banco ou a API podem “dormir” após inatividade. A primeira requisição pode demorar alguns segundos — comportamento esperado em planos free tier.
