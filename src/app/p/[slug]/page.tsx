import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicTenantCatalogAction } from '@/lib/actions/publicBooking';
import { PublicShowcaseView } from '@/components/booking/PublicShowcaseView';

interface ShowcasePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ShowcasePageProps): Promise<Metadata> {
  const { slug } = await params;
  const res = await getPublicTenantCatalogAction(slug);

  if (!res.success || !res.data) {
    return {
      title: 'Página Pública | Belvia',
      description: 'Vitrine digital e agendamento online.',
    };
  }

  const { tenant } = res.data;
  const businessName = tenant.settings?.booking_settings?.business_name || tenant.name;
  const description =
    tenant.settings?.booking_settings?.business_description ||
    `Conheça os serviços, portfólio e reserve seu horário online em ${businessName}.`;

  return {
    title: `${businessName} | Vitrine Digital & Agendamento Online`,
    description,
    openGraph: {
      title: businessName,
      description,
      images: tenant.settings?.booking_settings?.cover_url
        ? [tenant.settings.booking_settings.cover_url]
        : undefined,
    },
  };
}

export default async function ShowcasePage({ params }: ShowcasePageProps) {
  const { slug } = await params;

  // Carrega os dados públicos do estabelecimento
  const res = await getPublicTenantCatalogAction(slug);

  if (!res.success || !res.data) {
    notFound();
  }

  return <PublicShowcaseView catalog={res.data} />;
}
