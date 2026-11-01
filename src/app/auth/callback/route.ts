import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/resend';
import { emailWelcomeTemplate } from '@/lib/email/templates';
import { PLAN_CONFIGS } from '@/types/plans';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const searchParams = requestUrl.searchParams;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  // Garante que o redirecionamento final nunca caia em localhost se estiver em produção
  const isProd = process.env.NODE_ENV === 'production';
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const effectiveOrigin = isProd
    ? (configuredAppUrl && !configuredAppUrl.includes('localhost') ? configuredAppUrl.replace(/\/$/, '') : 'https://zelunia.com.br')
    : requestUrl.origin;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Usuário acabou de autenticar via confirmação de e-mail
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Verifica se já tem tenant criado
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
          return NextResponse.redirect(`${effectiveOrigin}/${typedMemberships[0].tenants.slug}`);
        }

        // Se não possui tenant ainda, cria utilizando os metadados preservados no momento do cadastro
        const clinicName = user.user_metadata?.clinic_name;
        const clinicSlug = user.user_metadata?.clinic_slug;
        const rawPlan = user.user_metadata?.plan;
        const plan = rawPlan === 'smart' ? 'smart' : 'essential';

        if (clinicName && clinicSlug) {
          const { error: rpcError } = await supabase.rpc('create_tenant_and_owner', {
            p_name: clinicName,
            p_slug: clinicSlug,
            p_plan: plan,
          });

          if (!rpcError) {
            // Dispara e-mail transacional de boas-vindas assincronamente via Resend (não bloqueia redirecionamento)
            const recipientEmail = user.email;
            if (recipientEmail) {
              const fullName = user.user_metadata?.full_name || clinicName;
              const planConfig = PLAN_CONFIGS[plan] || PLAN_CONFIGS.essential;
              const welcomeMail = emailWelcomeTemplate({
                name: fullName,
                clinicName,
                slug: clinicSlug,
                planName: planConfig.name,
                trialDays: 7,
              });

              // Executa o envio sem quebrar caso o Resend retorne aviso
              sendEmail({
                to: recipientEmail,
                subject: welcomeMail.subject,
                html: welcomeMail.html,
                tags: [{ name: 'category', value: 'welcome_onboarding' }],
              }).catch((e) => console.error('[Resend Welcome Error]', e));
            }

            return NextResponse.redirect(`${effectiveOrigin}/${clinicSlug}`);
          }
        }
      }

      return NextResponse.redirect(`${effectiveOrigin}${next}`);
    }
  }

  // Em caso de falha no token de confirmação, redireciona para a página de erro/login
  return NextResponse.redirect(`${effectiveOrigin}/login?error=email_confirmation_failed`);
}
