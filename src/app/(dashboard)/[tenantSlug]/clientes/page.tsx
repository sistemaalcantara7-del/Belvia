import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Client } from '@/types/clients';
import { ClientsManager } from '@/components/clients/ClientsManager';

interface ClientsPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export default async function ClientsPage({ params }: ClientsPageProps) {
  const { tenantSlug } = await params;

  // Validação estrita de contexto no servidor
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    redirect('/login');
  }

  const supabase = await createClient();

  // Consulta clientes vinculados unicamente a este estabelecimento
  const { data: clients, error } = await supabase
    .from('clients')
    .select('*')
    .eq('tenant_id', context.tenantId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Erro ao carregar clientes:', error.message);
  }

  const typedClients = (clients || []) as Client[];

  return (
    <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <ClientsManager
          initialClients={typedClients}
          tenantSlug={context.tenantSlug}
          tenantName={context.tenantName}
          userRole={context.role}
        />
      </div>
    </div>
  );
}
