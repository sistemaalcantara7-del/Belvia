import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Lista oficial de módulos administrativos do dashboard (/[tenantSlug]/[modulo])
const ADMIN_MODULES = [
  'agenda',
  'clientes',
  'servicos',
  'profissionais',
  'anamnese',
  'caixa',
  'comissoes',
  'relatorios',
  'configuracoes',
  'pdv',
  'portfolio',
  'assinar',
];

/**
 * Avalia se o caminho requisitado pertence ao painel administrativo privado.
 * Utiliza casamento exato de segmentos em vez de substring pura para evitar falsos positivos
 * como /agendar/[tenantSlug] sendo interceptado por /agenda.
 */
export function isDashboardAdminRoute(pathname: string): boolean {
  // Rotas explicitamente públicas nunca devem ser bloqueadas
  if (
    pathname.startsWith('/p/') ||
    pathname.startsWith('/agendar/') ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/esqueci-senha' ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/api/')
  ) {
    return false;
  }

  const segments = pathname.split('/').filter(Boolean);
  // Formato administrativo: /[tenantSlug]/[modulo] ou /[tenantSlug]/[modulo]/[subrota...]
  if (segments.length >= 2) {
    const moduleName = segments[1];
    return ADMIN_MODULES.includes(moduleName);
  }

  return false;
}

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

  // Redireciona usuários não autenticados que tentam acessar rotas administrativas protegidas
  if (!user && isDashboardAdminRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
