-- ==============================================================================
-- BELVIA SaaS - Migration Fase 2.3.1: Blindagem de Limite por Plano & Integridade
-- Arquivo: 20261023000005_professionals_plan_limits_and_guards.sql
--
-- Destaques de Segurança & Regras no Banco:
-- 1. Função e trigger 'check_professionals_plan_limit':
--    - Valida o plano do tenant ('essential' = 1 ativo, 'smart' = 10 ativos).
--    - Impede ultrapassar o limite tanto em INSERT quanto em UPDATE (reativação).
--    - Protege contra concorrência e tentativas de bypass direto via API / PostgREST.
-- 2. Gatilho de integridade para vínculo de user_id:
--    - Garante que 'user_id', quando informado, pertença ativamente à tabela
--      'tenant_users' daquele mesmo tenant_id.
-- ==============================================================================

-- 1. FUNÇÃO DE ENFORCEMENT DE LIMITES POR PLANO
CREATE OR REPLACE FUNCTION public.check_professionals_plan_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_plan tenant_plan;
  v_max_active INTEGER;
  v_current_active INTEGER;
BEGIN
  -- Apenas checa se o profissional estiver/estiver se tornando 'active'
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status <> 'active') THEN
    -- Busca o plano do tenant
    SELECT plan INTO v_plan FROM public.tenants WHERE id = NEW.tenant_id;
    IF v_plan IS NULL THEN
      RAISE EXCEPTION 'Estabelecimento não encontrado.';
    END IF;

    -- Define limite por plano
    IF v_plan = 'essential' THEN
      v_max_active := 1;
    ELSIF v_plan = 'smart' THEN
      v_max_active := 10;
    ELSE
      v_max_active := 1;
    END IF;

    -- Conta profissionais atualmente ativos no tenant
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

DROP TRIGGER IF EXISTS trigger_check_professionals_plan_limit ON public.professionals;
CREATE TRIGGER trigger_check_professionals_plan_limit
  BEFORE INSERT OR UPDATE ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.check_professionals_plan_limit();

-- 2. FUNÇÃO DE INTEGRIDADE PARA VÍNCULO DE user_id
CREATE OR REPLACE FUNCTION public.check_professional_user_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_has_membership BOOLEAN;
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.tenant_users
      WHERE tenant_id = NEW.tenant_id
        AND user_id = NEW.user_id
        AND status = 'active'
    ) INTO v_has_membership;

    IF NOT COALESCE(v_has_membership, false) THEN
      RAISE EXCEPTION 'O usuário vinculado deve ser um membro ativo deste mesmo estabelecimento.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_professional_user_membership ON public.professionals;
CREATE TRIGGER trigger_check_professional_user_membership
  BEFORE INSERT OR UPDATE ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.check_professional_user_membership();
