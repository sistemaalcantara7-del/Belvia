import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Se as variáveis ainda não estiverem configuradas no ambiente local, permite prosseguir sem quebrar
  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANTE: Não remover getClaims/getUser, necessário para atualizar a sessão
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Rotas protegidas específicas do painel administrativo
  const isDashboardRoute =
    pathname.includes('/agenda') ||
    pathname.includes('/clientes') ||
    pathname.includes('/servicos') ||
    pathname.includes('/profissionais') ||
    pathname.includes('/anamnese') ||
    pathname.includes('/caixa') ||
    pathname.includes('/comissoes') ||
    pathname.includes('/relatorios') ||
    pathname.includes('/configuracoes');

  // Redireciona usuários não autenticados que tentam acessar rotas protegidas
  if (!user && isDashboardRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
