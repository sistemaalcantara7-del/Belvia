import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicTenantCatalogAction } from '@/lib/actions/publicBooking';
import { PublicBookingFlow } from '@/components/booking/PublicBookingFlow';

interface PageProps {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{
    serviceId?: string;
    professionalId?: string;
    date?: string;
    time?: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const res = await getPublicTenantCatalogAction(tenantSlug);

  if (!res.success || !res.data) {
    return {
      title: 'Agendamento Online | Belvia',
      description: 'Agende seu horário online com facilidade e rapidez.',
    };
  }

  const { tenant } = res.data;
  return {
    title: `Agendamento Online | ${tenant.name}`,
    description: `Agende seus serviços na ${tenant.name} de forma rápida e segura. Escolha o serviço, profissional e horário.`,
  };
}

export default async function PublicBookingPage({ params, searchParams }: PageProps) {
  const { tenantSlug } = await params;
  const { serviceId, professionalId, date, time } = await searchParams;
  const res = await getPublicTenantCatalogAction(tenantSlug);

  if (!res.success || !res.data) {
    if (res.error?.includes('indisponível')) {
      return (
        <div className="min-h-screen bg-[#FAF5F3] flex items-center justify-center p-6 text-[#2C1810]">
          <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-[#EAD9D3] shadow-md text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-[#FAF0ED] text-[#C4837A] mx-auto flex items-center justify-center text-2xl font-serif">
              ✨
            </div>
            <h1 className="text-xl font-serif font-bold text-[#2C1810]">
              Agendamento Online Temporariamente Indisponível
            </h1>
            <p className="text-xs sm:text-sm text-[#7D6B65] leading-relaxed">
              O agendamento online deste estabelecimento está temporariamente pausado. Por favor, retorne em breve ou entre em contato diretamente com a equipe do estabelecimento.
            </p>
          </div>
        </div>
      );
    }
    notFound();
  }

  return (
    <PublicBookingFlow
      catalog={res.data}
      initialServiceId={serviceId}
      initialProfessionalId={professionalId}
      initialDate={date}
      initialTime={time}
    />
  );
}
