import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicTenantCatalogAction } from '@/lib/actions/publicBooking';
import { PublicBookingFlow } from '@/components/booking/PublicBookingFlow';

interface PageProps {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ serviceId?: string; professionalId?: string }>;
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
  const { serviceId, professionalId } = await searchParams;
  const res = await getPublicTenantCatalogAction(tenantSlug);

  if (!res.success || !res.data) {
    notFound();
  }

  return (
    <PublicBookingFlow
      catalog={res.data}
      initialServiceId={serviceId}
      initialProfessionalId={professionalId}
    />
  );
}
