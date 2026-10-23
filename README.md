# BELVIA — Guia de Execução & Configuração

Plataforma SaaS multi-tenant para estética, beleza e bem-estar.

---

## 1. Requisitos de Ambiente

- **Node.js:** Versão 18.18+ ou 20+ LTS
- **Gerenciador de Pacotes:** `npm`
- **Conta no Supabase:** Projeto criado em [https://supabase.com](https://supabase.com)

---

## 2. Instalação & Execução Local

```bash
# 1. Instalar dependências (caso clonando em nova máquina)
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env.local
# Preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY

# 3. Executar o servidor de desenvolvimento
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000) no seu navegador.

---

## 3. Comandos Úteis

- `npm run dev`: Inicia o ambiente de desenvolvimento.
- `npm run build`: Compila a aplicação para produção (valida tipos e rotas estáticas).
- `npm run lint`: Executa a verificação estática de código com ESLint.
- `npx tsc --noEmit`: Checagem rigorosa de tipos TypeScript sem gerar artefatos.

---

## 4. Configuração do Supabase Cloud (Manual pelo Desenvolvedor)

Conforme as diretrizes de segurança, nenhuma migration é disparada automaticamente. Para homologar o banco de dados oficial:

1. Acesse o **SQL Editor** no painel do seu projeto Supabase Cloud.
2. Abra o arquivo [`supabase/migrations/20261023000001_initial_multitenant_schema.sql`](file:///c:/BACKUP/DESENVOLVIMENTO/Belvia/supabase/migrations/20261023000001_initial_multitenant_schema.sql).
3. Execute o script para criar os enums, tabelas (`tenants`, `profiles`, `tenant_users`), índices e as políticas de segurança RLS.
4. Copie a **URL do Projeto** e a **chave pública `anon`** (em *Project Settings -> API*) e cole no seu `.env.local`.
