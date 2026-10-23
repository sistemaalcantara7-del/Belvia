'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PlanType } from '@/types/tenant';

export interface AuthActionResponse {
  error?: string;
  success?: boolean;
  emailConfirmationRequired?: boolean;
  message?: string;
}

export async function loginAction(formData: FormData): Promise<AuthActionResponse> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'E-mail e senha são obrigatórios.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  // Verifica se o usuário autenticado já possui um estabelecimento criado
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: memberships } = await supabase
      .from('tenant_users')
      .select('tenant_id, tenants:tenant_id(slug)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1);

    interface MembershipRow {
      tenant_id: string;
      tenants: { slug: string } | null;
    }

    const typedMemberships = memberships as unknown as MembershipRow[];

    if (typedMemberships && typedMemberships.length > 0 && typedMemberships[0].tenants) {
      redirect(`/${typedMemberships[0].tenants.slug}/agenda`);
    }

    // Se o usuário logou mas ainda não tem tenant (ex: confirmou email recentemente),
    // verifica se os metadados contêm dados de onboarding pendente
    const pendingClinic = user.user_metadata?.clinic_name;
    const pendingSlug = user.user_metadata?.clinic_slug;
    const pendingPlan = user.user_metadata?.plan || 'essential';

    if (pendingClinic && pendingSlug) {
      const { error: rpcError } = await supabase.rpc('create_tenant_and_owner', {
        p_name: pendingClinic,
        p_slug: pendingSlug,
        p_plan: pendingPlan,
      });

      if (!rpcError) {
        redirect(`/${pendingSlug}/agenda`);
      }
    }
  }

  redirect('/');
}

export async function registerTenantAction(formData: FormData): Promise<AuthActionResponse> {
  const clinicName = formData.get('clinicName') as string;
  const fullName = formData.get('fullName') as string;
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const plan = (formData.get('plan') as PlanType) || 'essential';

  if (!clinicName || !fullName || !email || !password) {
    return { error: 'Todos os campos são obrigatórios.' };
  }

  // Gera slug canônico a partir do nome da clínica
  const slug = clinicName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') + '-' + Math.random().toString(36).substring(2, 6);

  const supabase = await createClient();

  // 1. Criar o usuário no Supabase Auth preservando dados do tenant nos metadados
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        clinic_name: clinicName,
        clinic_slug: slug,
        plan: plan,
      },
    },
  });

  if (authError || !authData.user) {
    return { error: authError?.message || 'Falha ao registrar usuário.' };
  }

  // Se a confirmação de e-mail estiver ativada no Supabase, a sessão ainda NÃO existe (session === null)
  if (!authData.session) {
    return {
      success: true,
      emailConfirmationRequired: true,
      message: 'Cadastro realizado com sucesso! Enviamos um link de confirmação para o seu e-mail. Ao confirmar, seu estabelecimento será ativado automaticamente.',
    };
  }

  // Se a confirmação de e-mail estiver desativada (login imediato), a sessão é válida e executamos a RPC
  const { error: rpcError } = await supabase.rpc('create_tenant_and_owner', {
    p_name: clinicName,
    p_slug: slug,
    p_plan: plan,
  });

  if (rpcError) {
    return { error: `Conta criada, mas ocorreu um erro ao registrar a clínica: ${rpcError.message}` };
  }

  redirect(`/${slug}/agenda`);
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
