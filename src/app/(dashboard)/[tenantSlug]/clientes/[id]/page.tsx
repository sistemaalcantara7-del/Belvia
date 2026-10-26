import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { redirect } from 'next/navigation';
import { getClient360HistoryAction } from '@/lib/actions/clients';
import { ClientHistory360View } from '@/components/clients/ClientHistory360View';
import Link from 'next/link';
import { ArrowLeft, AlertCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface Client360PageProps {
  params: Promise<{
    tenantSlug: string;
    id: string;
  }>;
}

export default async function Client360Page({ params }: Client360PageProps) {
  const { tenantSlug, id } = await params;

  // 1. Validação estrita do contexto do estabelecimento
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    redirect('/login');
  }

  // 2. Busca do Histórico 360º via agregador seguro
  const res = await getClient360HistoryAction(tenantSlug, id, {
    page: 1,
    pageSize: 15,
  });

  if (res.error || !res.data) {
    return (
      <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-4">
          <Link
            href={`/${tenantSlug}/clientes`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar para Clientes
          </Link>
          <div className="p-6 bg-white dark:bg-zinc-900 border border-rose-200 dark:border-rose-900/60 rounded-2xl shadow-xs text-center space-y-2">
            <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Não foi possível carregar o histórico 360º
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {res.error || 'Cliente não encontrado ou você não possui permissão para acessar este cadastro.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <ClientHistory360View
          initialData={res.data}
          tenantSlug={tenantSlug}
          tenantName={context.tenantName}
          userRole={context.role}
        />
      </div>
    </div>
  );
}
