import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { redirect } from 'next/navigation';
import { Settings } from 'lucide-react';

interface ConfiguracoesPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export default async function ConfiguracoesPage({ params }: ConfiguracoesPageProps) {
  const { tenantSlug } = await params;

  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    redirect('/login');
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="w-6 h-6" style={{ color: 'var(--belvia-rose)' }} />
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--belvia-text)' }}>
          Configurações
        </h1>
      </div>
      <div
        className="rounded-xl p-8 text-center shadow-sm"
        style={{
          backgroundColor: 'var(--belvia-card)',
          border: '1px solid var(--belvia-border)',
        }}
      >
        <Settings className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--belvia-border)' }} />
        <p className="text-base font-medium" style={{ color: 'var(--belvia-muted)' }}>
          Configurações em desenvolvimento
        </p>
        <p className="text-sm mt-1" style={{ color: 'var(--belvia-border)' }}>
          Esta seção estará disponível em breve.
        </p>
      </div>
    </div>
  );
}
