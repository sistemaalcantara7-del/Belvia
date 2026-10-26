import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAnamnesisForms, getAnamnesisTemplates } from '@/lib/actions/anamnesis';
import { AnamnesisManager } from '@/components/anamnesis/AnamnesisManager';
import { Client } from '@/types/clients';
import { Professional } from '@/types/professionals';

export const dynamic = 'force-dynamic';

interface AnamnesisPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export default async function AnamnesisPage({ params }: AnamnesisPageProps) {
  const { tenantSlug } = await params;

  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    redirect('/login');
  }

  const supabase = await createClient();

  // Carrega em paralelo: fichas, modelos de anamnese, clientes e profissionais com minimização de dados
  const [formsRes, templatesRes, clientsData, profsData] = await Promise.all([
    getAnamnesisForms(tenantSlug),
    getAnamnesisTemplates(tenantSlug),
    supabase
      .from('clients')
      .select('id, full_name, whatsapp, birth_date, status')
      .eq('tenant_id', context.tenantId)
      .eq('status', 'active')
      .order('full_name', { ascending: true }),
    supabase
      .from('professionals')
      .select('id, full_name, specialty, status')
      .eq('tenant_id', context.tenantId)
      .eq('status', 'active')
      .order('full_name', { ascending: true }),
  ]);

  const initialForms = formsRes.data || [];
  const templates = templatesRes.data || [];
  const clients = (clientsData.data || []) as unknown as Client[];
  const professionals = (profsData.data || []) as unknown as Professional[];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <AnamnesisManager
        tenantSlug={tenantSlug}
        initialForms={initialForms}
        templates={templates}
        clients={clients}
        professionals={professionals}
        currentRole={context.role}
      />
    </div>
  );
}
