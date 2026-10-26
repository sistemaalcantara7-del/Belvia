-- ==============================================================================
-- BELVIA SaaS - Migration Fase 3.2.2: Correção de Segurança da View de Recepção
-- Arquivo: 20261023000012_reception_view_security_definer.sql
--
-- Destaques & Correção:
-- 1. Na migration 000011, a VIEW 'reception_anamnesis_status' foi criada com 'security_invoker = true'.
--    Como a política RLS da tabela 'anamnesis_forms' bloqueia o perfil 'receptionist' de fazer SELECT direto,
--    a VIEW com security_invoker herdava o bloqueio da tabela de origem, retornando 0 registros para a recepção.
-- 2. Correção: A VIEW deve operar com SECURITY DEFINER (security_invoker = false) e filtrar internamente
--    pelo tenant ativo do usuário autenticado (auth.uid()), expondo estritamente as colunas administrativas
--    sem expor dados clínicos, de acordo com o princípio do menor privilégio (LGPD).
-- ==============================================================================

DROP VIEW IF EXISTS public.reception_anamnesis_status;

CREATE OR REPLACE VIEW public.reception_anamnesis_status
WITH (security_invoker = false)
AS
SELECT 
    f.id AS form_id,
    f.tenant_id,
    f.client_id,
    t.title AS template_title,
    t.category AS template_category,
    f.version,
    f.status,
    f.filled_at,
    (f.allergies IS NOT NULL AND TRIM(f.allergies) <> '') AS has_allergies_alert,
    f.created_at,
    f.updated_at
FROM public.anamnesis_forms f
JOIN public.anamnesis_templates t ON t.id = f.template_id
WHERE EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = f.tenant_id
      AND tu.user_id = auth.uid()
      AND tu.status = 'active'
);

-- Concessão de permissão de leitura para authenticated e service_role
GRANT SELECT ON public.reception_anamnesis_status TO authenticated, service_role;
