import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicTenantCatalogAction } from '@/lib/actions/publicBooking';
import { PublicShowcaseView } from '@/components/booking/PublicShowcaseView';

export const dynamic = 'force-dynamic';

interface ShowcasePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ShowcasePageProps): Promise<Metadata> {
  const { slug } = await params;
  const res = await getPublicTenantCatalogAction(slug);

  if (!res.success || !res.data) {
    return {
      title: 'Página Pública | Zelunia',
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
    if (res.error?.includes('indisponível')) {
      return (
        <div className="min-h-screen bg-[#FAF5F3] flex items-center justify-center p-6 text-[#2C1810]">
          <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-[#EAD9D3] shadow-md text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-[#FAF0ED] text-[#C4837A] mx-auto flex items-center justify-center text-2xl font-serif">
              ✨
            </div>
            <h1 className="text-xl font-serif font-bold text-[#2C1810]">
              Página Temporariamente Indisponível
            </h1>
            <p className="text-xs sm:text-sm text-[#7D6B65] leading-relaxed">
              O agendamento online deste estabelecimento está em manutenção temporária. Por favor, retorne em breve ou entre em contato diretamente com o estabelecimento pelos canais habituais.
            </p>
          </div>
        </div>
      );
    }
    notFound();
  }

  return <PublicShowcaseView catalog={res.data} />;
}

