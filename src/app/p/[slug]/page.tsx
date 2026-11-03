import { redirect } from 'next/navigation';

interface LegacyShowcaseProps {
  params: Promise<{ slug: string }>;
}

/**
 * Rota Legada /p/[slug]
 * Executa redirecionamento permanente HTTP 308 para a URL curta canônica /{slug} (Prompt 175/181).
 */
export default async function LegacyShowcaseRedirectPage({ params }: LegacyShowcaseProps) {
  const { slug } = await params;
  redirect(`/${slug}`);
}
