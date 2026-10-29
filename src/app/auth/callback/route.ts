import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

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
          return NextResponse.redirect(`${origin}/${typedMemberships[0].tenants.slug}`);
        }

        // Se não possui tenant ainda, cria utilizando os metadados preservados no momento do cadastro
        const clinicName = user.user_metadata?.clinic_name;
        const clinicSlug = user.user_metadata?.clinic_slug;
        const plan = user.user_metadata?.plan || 'essential';

        if (clinicName && clinicSlug) {
          const { error: rpcError } = await supabase.rpc('create_tenant_and_owner', {
            p_name: clinicName,
            p_slug: clinicSlug,
            p_plan: plan,
          });

          if (!rpcError) {
            return NextResponse.redirect(`${origin}/${clinicSlug}`);
          }
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Em caso de falha no token de confirmação, redireciona para a página de erro/login
  return NextResponse.redirect(`${origin}/login?error=email_confirmation_failed`);
}
