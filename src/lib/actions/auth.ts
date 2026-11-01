'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PlanType } from '@/types/tenant';

export interface AuthActionResponse {
  error?: string;
  errorCode?: string;
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
    const errorMsg = error.message.toLowerCase();
    if (errorMsg.includes('email not confirmed') || errorMsg.includes('not confirmed')) {
      return {
        error: 'Confirme seu e-mail para continuar. Sua conta foi criada, mas é necessário confirmar o endereço para liberar o acesso.',
        errorCode: 'email_not_confirmed',
      };
    }

    if (errorMsg.includes('invalid login credentials') || errorMsg.includes('invalid credentials')) {
      return {
        error: 'E-mail ou senha incorretos. Verifique suas credenciais.',
        errorCode: 'invalid_credentials',
      };
    }

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
      redirect(`/${typedMemberships[0].tenants.slug}`);
    }

    // Se o usuário logou mas ainda não tem tenant (ex: confirmou email recentemente),
    // verifica se os metadados contêm dados de onboarding pendente
    const pendingClinic = user.user_metadata?.clinic_name;
    const pendingSlug = user.user_metadata?.clinic_slug;
    const rawPendingPlan = user.user_metadata?.plan;
    const pendingPlan: PlanType = rawPendingPlan === 'smart' ? 'smart' : 'essential';

    if (pendingClinic && pendingSlug) {
      const { error: rpcError } = await supabase.rpc('create_tenant_and_owner', {
        p_name: pendingClinic,
        p_slug: pendingSlug,
        p_plan: pendingPlan,
      });

      if (!rpcError) {
        redirect(`/${pendingSlug}`);
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
  // Validação estrita do plano no servidor para evitar manipulação pelo cliente
  const rawPlan = formData.get('plan') as string;
  const plan: PlanType = rawPlan === 'smart' ? 'smart' : 'essential';

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

  // Resolve a URL base canônica:
  // 1. Em produção, utiliza obrigatoriamente https://zelunia.com.br (ou NEXT_PUBLIC_APP_URL configurado)
  // 2. Em desenvolvimento local, utiliza NEXT_PUBLIC_APP_URL ou http://localhost:3000
  const isProd = process.env.NODE_ENV === 'production';
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const baseUrl = isProd
    ? (configuredAppUrl && !configuredAppUrl.includes('localhost') ? configuredAppUrl : 'https://zelunia.com.br')
    : (configuredAppUrl || 'http://localhost:3000');

  const emailRedirectTo = `${baseUrl.replace(/\/$/, '')}/auth/callback`;

  // 1. Criar o usuário no Supabase Auth preservando dados do tenant nos metadados e redirecionamento canônico
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
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
      message: 'Cadastro realizado com sucesso! Enviamos um link de confirmação para o seu e-mail. Ao confirmar, seu estabelecimento será ativado automaticamente com 7 dias de teste gratuito.',
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

  redirect(`/${slug}`);
}

/**
 * Solicita redefinição de senha utilizando o Supabase Auth com segurança criptográfica.
 * Utiliza a URL canônica para redirecionamento.
 */
export async function requestPasswordResetAction(email: string): Promise<AuthActionResponse> {
  if (!email || !email.includes('@')) {
    return { error: 'Informe um endereço de e-mail válido.' };
  }

  const supabase = await createClient();

  const isProd = process.env.NODE_ENV === 'production';
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const baseUrl = isProd
    ? (configuredAppUrl && !configuredAppUrl.includes('localhost') ? configuredAppUrl : 'https://zelunia.com.br')
    : (configuredAppUrl || 'http://localhost:3000');

  const redirectTo = `${baseUrl.replace(/\/$/, '')}/auth/callback?next=/redefinir-senha`;

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo,
  });

  if (error) {
    return { error: error.message };
  }

  return {
    success: true,
    message: 'Se o e-mail estiver cadastrado, você receberá um link seguro para redefinir sua senha.',
  };
}

/**
 * Reenvia o e-mail de confirmação de cadastro através do Supabase Auth.
 * Utiliza o fluxo oficial do Supabase com proteção e redirecionamento canônico.
 */
export async function resendConfirmationEmailAction(email: string): Promise<AuthActionResponse> {
  if (!email || !email.includes('@')) {
    return { error: 'Informe um endereço de e-mail válido.' };
  }

  const supabase = await createClient();

  const isProd = process.env.NODE_ENV === 'production';
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const baseUrl = isProd
    ? (configuredAppUrl && !configuredAppUrl.includes('localhost') ? configuredAppUrl : 'https://zelunia.com.br')
    : (configuredAppUrl || 'http://localhost:3000');

  const emailRedirectTo = `${baseUrl.replace(/\/$/, '')}/auth/callback`;

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.trim(),
    options: {
      emailRedirectTo,
    },
  });

  if (error) {
    const errorMsg = error.message.toLowerCase();
    // Protege contra rate limit informando tempo amigável
    if (errorMsg.includes('rate limit') || errorMsg.includes('too many requests')) {
      return {
        error: 'Muitas tentativas em pouco tempo. Aguarde alguns instantes antes de reenviar novamente.',
        errorCode: 'rate_limited',
      };
    }
    return { error: error.message };
  }

  return {
    success: true,
    message: 'Novo e-mail de confirmação enviado com sucesso! Verifique sua caixa de entrada e pasta de spam.',
  };
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
