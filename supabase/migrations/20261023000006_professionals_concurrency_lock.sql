-- ==============================================================================
-- BELVIA SaaS - Migration Fase 2.3.2: Concorrência Robusta & Lock Transacional
-- Arquivo: 20261023000006_professionals_concurrency_lock.sql
--
-- Destaques de Segurança & Anti-Race-Condition:
-- 1. 'pg_advisory_xact_lock(hashtext('prof_limit_' || NEW.tenant_id::text))':
--    - Adquirido ANTES de consultar o plano e ANTES de contar profissionais ativos.
--    - Garante serialização estrita para inserções e reativações no mesmo tenant.
--    - Escopo por tenant: requisições em clínicas distintas executam 100% paralelas.
--    - O lock é liberado automaticamente no COMMIT ou ROLLBACK da transação.
-- 2. Atualizações ordinárias (nome, especialidade, bio, etc.) que não alteram
--    o status para 'active' NÃO adquirem lock e NÃO sofrem penalidade de performance.
-- 3. 'SECURITY DEFINER' com 'SET search_path = public', impedindo hijacking de schema.
-- 4. Permissões de EXECUTE restritas a authenticated e service_role.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.check_professionals_plan_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan tenant_plan;
  v_max_active INTEGER;
  v_current_active INTEGER;
BEGIN
  -- Apenas checa e adquire lock se o profissional for/estiver se tornando 'active'
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status <> 'active') THEN
    -- 1. BLOQUEIO TRANSACIONAL EXCLUSIVO POR TENANT (Anti-Race Condition / Concorrência)
    -- Serializa operações concorrentes de profissionais do mesmo tenant sem travar outros estabelecimentos.
    PERFORM pg_advisory_xact_lock(hashtext('prof_limit_' || NEW.tenant_id::text));

    -- 2. Busca o plano do tenant
    SELECT plan INTO v_plan FROM public.tenants WHERE id = NEW.tenant_id;
    IF v_plan IS NULL THEN
      RAISE EXCEPTION 'Estabelecimento não encontrado.';
    END IF;

    -- 3. Define limite máximo por plano
    IF v_plan = 'essential' THEN
      v_max_active := 1;
    ELSIF v_plan = 'smart' THEN
      v_max_active := 10;
    ELSE
      v_max_active := 1;
    END IF;

    -- 4. Contagem atômica de profissionais ativos
    SELECT COUNT(*) INTO v_current_active
    FROM public.professionals
    WHERE tenant_id = NEW.tenant_id
      AND status = 'active'
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF v_current_active >= v_max_active THEN
      RAISE EXCEPTION 'Limite de profissionais ativos atingido para o plano % (máximo: %). Faça upgrade para adicionar mais profissionais.', v_plan, v_max_active;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Restrição de permissão de execução
REVOKE EXECUTE ON FUNCTION public.check_professionals_plan_limit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_professionals_plan_limit() TO authenticated, service_role;
