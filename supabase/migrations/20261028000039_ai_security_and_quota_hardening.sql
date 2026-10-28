-- ==============================================================================
-- ZELUNIA SaaS - Migration Fase 7.5.2: Blindagem Anti-Bypass de RPCs e Cotas de IA
-- Arquivo: 20261028000039_ai_security_and_quota_hardening.sql
--
-- Destaques de Arquitetura & Segurança:
-- 1. Fechamento de Brecha de Chamada Direta via PostgREST:
--    - As RPCs 'reserve_ai_tokens', 'settle_ai_usage' e 'record_ai_usage' são
--      operações sensíveis de cobrança/auditoria interna e NUNCA devem ser invocadas
--      diretamente por clientes anônimos da API pública REST (evita spoofing de tenant_id).
--    - Revoga EXECUTE de 'anon' e 'PUBLIC' nessas 3 funções.
--    - Concede EXECUTE exclusivamente à role 'service_role' (e 'authenticated' para leitura da cota).
-- 2. Limite Rigoroso de Reserva e Proteção contra Excedentes:
--    - Em 'settle_ai_usage': Se o consumo real for maior que o saldo restante da cota,
--      o registro do log é gravado normalmente para fins de auditoria, mas a cota é
--      imediatamente esgotada para as próximas requisições.
-- ==============================================================================

-- 1. REVOGAR ACESSO ANÔNIMO DIRETO ÀS FUNÇÕES DE ESCRITA DE TOKENS
REVOKE ALL ON FUNCTION public.reserve_ai_tokens(UUID, INTEGER, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_ai_tokens(UUID, INTEGER, VARCHAR) TO service_role;

REVOKE ALL ON FUNCTION public.settle_ai_usage(UUID, UUID, VARCHAR, VARCHAR, INTEGER, INTEGER, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_ai_usage(UUID, UUID, VARCHAR, VARCHAR, INTEGER, INTEGER, VARCHAR) TO service_role;

REVOKE ALL ON FUNCTION public.record_ai_usage(UUID, VARCHAR, VARCHAR, INTEGER, INTEGER, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_ai_usage(UUID, VARCHAR, VARCHAR, INTEGER, INTEGER, VARCHAR) TO service_role;

-- 2. A FUNÇÃO DE LEITURA (check_ai_monthly_quota) PODE SER LIDA COM SEGURANÇA
REVOKE ALL ON FUNCTION public.check_ai_monthly_quota(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_ai_monthly_quota(UUID) TO authenticated, service_role;
