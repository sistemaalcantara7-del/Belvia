'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Calendar,
  Clock,
  MapPin,
  ArrowRight,
  Gem,
  Flower2,
  ShieldCheck,
  Heart,
  Phone,
  MessageCircle,
} from 'lucide-react';
import { PublicCatalogData, PublicProfessional } from '@/types/publicBooking';
import { AIChatWidget } from './AIChatWidget';

function InstagramIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
    </svg>
  );
}

function FacebookIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
    </svg>
  );
}

interface PublicShowcaseViewProps {
  catalog: PublicCatalogData;
}

export function PublicShowcaseView({ catalog }: PublicShowcaseViewProps) {
  const { tenant, services = [], professionals = [], portfolio = [] } = catalog;

  const bookingSettings = tenant.settings?.booking_settings;
  const businessName = bookingSettings?.business_name || tenant.name;
  const logoUrl = bookingSettings?.logo_url;
  const businessAddress = bookingSettings?.address || tenant.settings?.address;
  const businessCity = bookingSettings?.city || tenant.settings?.city;
  const businessWhatsapp = bookingSettings?.whatsapp || tenant.settings?.whatsapp;
  const businessPhone = bookingSettings?.phone || tenant.settings?.phone;
  const instagram = bookingSettings?.instagram;
  const facebook = bookingSettings?.facebook;
  const allowedStart = bookingSettings?.allowed_start_time || '08h';
  const allowedEnd = bookingSettings?.allowed_end_time || '20h';

  // Formatação de Moeda
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Imagens padrão de fallback para serviços caso o serviço não possua foto cadastrada
  const sampleServiceImages = [
    '/img/service_1.png',
    '/img/service_2.png',
    '/img/service_3.png',
    '/img/service_4.png',
  ];

  // Profissional em destaque (o primeiro ativo cadastrado)
  const featuredProf: PublicProfessional | undefined = professionals[0];

  // Galeria de imagens reais cadastradas pelo tenant
  const galleryItems = useMemo(() => {
    if (portfolio && portfolio.length > 0) {
      return portfolio.slice(0, 4);
    }
    return [];
  }, [portfolio]);

  return (
    <div
      className="min-h-screen flex flex-col font-sans selection:bg-[#EADBCE] selection:text-[#211C1B]"
      style={{ backgroundColor: '#FCF8F5', color: '#211C1B' }}
    >
      {/* ── 1. HEADER (ALTURA 100px DESKTOP / 76px MOBILE) ────────────────── */}
      <header
        className="w-full sticky top-0 z-40 border-b border-[#EAD9D3]/40 shadow-xs h-[76px] md:h-[100px] bg-[#FCF8F5]"
      >
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-10 h-full flex items-center justify-between">
          {/* Logo / Nome do Estabelecimento (à esquerda, max 155px mobile / 280px desktop) */}
          <div className="flex items-center min-w-0 max-w-[155px] sm:max-w-[220px] md:max-w-[280px]">
            <Link href={`/p/${tenant.slug}`} className="flex items-center gap-2.5 sm:gap-3 group">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt={businessName}
                  className="max-h-11 sm:max-h-14 md:max-h-16 w-auto object-contain transition-transform group-hover:scale-[1.02]"
                />
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center bg-[#F4E4E1] text-[#BD7165] shrink-0">
                    <Flower2 className="w-5 h-5 sm:w-6 sm:h-6 stroke-[1.5]" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-serif text-lg sm:text-2xl font-bold tracking-tight text-[#9F4039] leading-tight truncate">
                      {businessName}
                    </span>
                    <span className="text-[9px] sm:text-[10px] tracking-[0.15em] uppercase font-semibold text-[#625D5A] truncate">
                      Estética & Bem-Estar
                    </span>
                  </div>
                </div>
              )}
            </Link>
          </div>

          {/* Navegação Central: Início, Serviços, Profissionais, Sobre, Contato */}
          <nav className="hidden md:flex items-center gap-8 text-[15px] font-medium text-[#625D5A]">
            <Link
              href="#inicio"
              className="text-[#9F4039] font-semibold transition-colors hover:text-[#BD7165]"
            >
              Início
            </Link>
            <Link
              href="#servicos"
              className="hover:text-[#211C1B] transition-colors"
            >
              Serviços
            </Link>
            <Link
              href="#profissionais"
              className="hover:text-[#211C1B] transition-colors"
            >
              Profissionais
            </Link>
            <Link
              href="#sobre"
              className="hover:text-[#211C1B] transition-colors"
            >
              Sobre
            </Link>
            <Link
              href="#contato"
              className="hover:text-[#211C1B] transition-colors"
            >
              Contato
            </Link>
          </nav>

          {/* Botão Superior Direito: Agende seu horário (max 170px mobile, h: 42px / ~205x48px desktop) */}
          <div className="flex items-center shrink-0">
            <Link
              href={`/agendar/${tenant.slug}`}
              className="inline-flex items-center justify-center gap-1.5 sm:gap-2 px-3.5 sm:px-6 h-[42px] md:h-12 max-w-[170px] sm:max-w-none rounded-[12px] text-xs sm:text-sm font-medium text-white transition-all shadow-xs hover:opacity-95 active:scale-98"
              style={{ backgroundColor: '#BD7165' }}
            >
              <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2] shrink-0" />
              <span className="truncate">Agende seu horário</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ── 2. HERO SECTION ────────────────────────────────────────────────── */}
      {/* COMPOSIÇÃO MOBILE (até 767px): Vertical independente (Texto no topo + Foto abaixo) */}
      <section
        id="inicio"
        className="block md:hidden w-full overflow-hidden"
        style={{ backgroundColor: '#FCF8F5' }}
      >
        {/* A) Conteúdo Textual no Topo (fundo marfim sólido #FCF8F5) */}
        <div className="w-full px-5 pt-6 pb-7 space-y-0 text-left">
          {/* Eyebrow: 10px, letter-spacing 2px */}
          <div className="inline-block pb-3">
            <span className="text-[10px] font-semibold tracking-[2px] uppercase text-[#BD7165] font-sans">
              Estética • Beleza • Bem-estar
            </span>
          </div>

          {/* Título: 36px, line-height 1.08, largura 100%, serifado; destaque terracota */}
          <h1 className="font-serif text-[36px] leading-[1.08] tracking-tight font-normal w-full">
            <span className="block text-[#211C1B]">Mais que estética,</span>
            <span className="block text-[#BD7165] italic font-normal">
              um cuidado completo
            </span>
            <span className="block text-[#BD7165]">para você.</span>
          </h1>

          {/* Descrição: 15px, line-height 1.6; margem superior 20px */}
          <p className="text-[15px] text-[#625D5A] leading-[1.6] mt-5">
            Beleza, saúde e bem-estar em um só lugar. Profissionais qualificados, atendimento
            humanizado e um ambiente pensado para a sua melhor experiência.
          </p>

          {/* CTA: largura 100%, altura 54px; margem superior 24px */}
          <div className="mt-6">
            <Link
              href={`/agendar/${tenant.slug}`}
              className="inline-flex items-center justify-between px-6 h-[54px] w-full rounded-[12px] text-[15px] font-medium text-white transition-all shadow-md active:scale-98"
              style={{ backgroundColor: '#BD7165' }}
            >
              <div className="flex items-center gap-2.5">
                <Calendar className="w-4 h-4 stroke-[2]" />
                <span>Agende seu horário agora</span>
              </div>
              <ArrowRight className="w-4 h-4 stroke-[2]" />
            </Link>
          </div>
        </div>

        {/* B) Área Fotográfica Abaixo: Ocupando 100% da largura, altura 340px a 440px */}
        <div className="relative w-full h-[360px] min-[390px]:h-[390px] min-[430px]:h-[420px] overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center pointer-events-none"
            style={{
              backgroundImage: "url('/img/bg_hero01_mobile.png')",
              backgroundPosition: 'center 20%',
              backgroundRepeat: 'no-repeat',
            }}
          />
        </div>

        {/* Transição inferior orgânica suave no mobile */}
        <div className="relative w-full overflow-hidden leading-none z-10 -mt-1">
          <svg
            className="w-full h-6 fill-[#FCF8F5]"
            viewBox="0 0 1440 60"
            preserveAspectRatio="none"
          >
            <path d="M0,0 C320,50 720,60 1440,20 L1440,60 L0,60 Z" />
          </svg>
        </div>
      </section>

      {/* COMPOSIÇÃO DESKTOP (768px em diante): Layout Preservado Integralmente */}
      <section
        className="hidden md:block relative w-full overflow-hidden"
        style={{
          minHeight: '560px',
          backgroundColor: '#FCF8F5',
        }}
      >
        {/* Imagem de Fundo Oficial em Cover com transição inferior orgânica suave */}
        <div
          className="absolute inset-0 bg-cover bg-right lg:bg-center pointer-events-none"
          style={{
            backgroundImage: "url('/img/bg_hero01.png')",
            backgroundRepeat: 'no-repeat',
          }}
        />

        {/* Camada suave semi-transparente recuada para a esquerda */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#FCF8F5]/90 via-[#FCF8F5]/40 via-35% to-transparent pointer-events-none md:max-w-[45%] lg:max-w-[38%]" />

        <div className="relative max-w-[1360px] mx-auto px-6 lg:px-10 h-full min-h-[560px] lg:min-h-[660px] flex items-center">
          {/* Área Textual: alinhada à esquerda, largura max 610px */}
          <div className="w-full max-w-[610px] z-10 py-12 lg:py-16 space-y-5">
            {/* Eyebrow */}
            <div className="inline-block">
              <span className="text-[13px] sm:text-[14px] font-semibold tracking-[4px] uppercase text-[#BD7165] font-sans">
                Estética • Beleza • Bem-estar
              </span>
            </div>

            {/* Título Principal Serifado */}
            <h1 className="font-serif text-3xl sm:text-5xl lg:text-[62px] leading-[1.1] tracking-tight font-normal">
              <span className="block text-[#211C1B]">Mais que estética,</span>
              <span className="block text-[#BD7165] italic font-normal">
                um cuidado completo
              </span>
              <span className="block text-[#BD7165]">para você.</span>
            </h1>

            {/* Parágrafo de Apoio */}
            <p className="text-base sm:text-lg lg:text-[19px] text-[#625D5A] leading-[1.6] max-w-[490px] pt-1">
              Beleza, saúde e bem-estar em um só lugar. Profissionais qualificados, atendimento
              humanizado e um ambiente pensado para a sua melhor experiência.
            </p>

            {/* CTA Principal */}
            <div className="pt-2">
              <Link
                href={`/agendar/${tenant.slug}`}
                className="inline-flex items-center justify-between px-7 h-[58px] sm:h-[62px] w-full sm:w-[350px] rounded-[12px] text-base sm:text-[16px] font-medium text-white transition-all shadow-md hover:opacity-95 active:scale-98"
                style={{ backgroundColor: '#BD7165' }}
              >
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 stroke-[2]" />
                  <span>Agende seu horário agora</span>
                </div>
                <ArrowRight className="w-5 h-5 stroke-[2]" />
              </Link>
            </div>
          </div>
        </div>

        {/* Transição inferior orgânica suave */}
        <div className="relative w-full overflow-hidden leading-none z-10">
          <svg
            className="w-full h-8 sm:h-10 lg:h-12 fill-[#FCF8F5]"
            viewBox="0 0 1440 60"
            preserveAspectRatio="none"
          >
            <path d="M0,0 C320,50 720,60 1440,20 L1440,60 L0,60 Z" />
          </svg>
        </div>
      </section>

      {/* ── 3. BENEFÍCIOS ──────────────────────────────────────────────────── */}
      <section
        id="sobre"
        className="w-full py-9 md:py-12 lg:py-16 border-b border-[#EAD9D3]/40"
        style={{ backgroundColor: '#FCF8F5' }}
      >
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-10">
          {/* Grid 2 colunas no mobile (gap 16px), 4 colunas no desktop */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 lg:gap-8 items-start">
            {/* Benefício 1 */}
            <div className="flex flex-col items-center text-center space-y-2.5 sm:space-y-3">
              <div className="w-16 h-16 sm:w-[86px] sm:h-[86px] rounded-full flex items-center justify-center bg-[#F7ECE9] text-[#BD7165] border border-[#EAD9D3]/70">
                <Gem className="w-6 h-6 sm:w-8 sm:h-8 stroke-[1.5]" />
              </div>
              <p className="text-sm sm:text-base md:text-[18px] font-medium text-[#211C1B] leading-snug">
                Profissionais
                <br />
                qualificados
              </p>
            </div>

            {/* Benefício 2 */}
            <div className="flex flex-col items-center text-center space-y-2.5 sm:space-y-3">
              <div className="w-16 h-16 sm:w-[86px] sm:h-[86px] rounded-full flex items-center justify-center bg-[#F7ECE9] text-[#BD7165] border border-[#EAD9D3]/70">
                <Flower2 className="w-6 h-6 sm:w-8 sm:h-8 stroke-[1.5]" />
              </div>
              <p className="text-sm sm:text-base md:text-[18px] font-medium text-[#211C1B] leading-snug">
                Ambiente
                <br />
                acolhedor
              </p>
            </div>

            {/* Benefício 3 */}
            <div className="flex flex-col items-center text-center space-y-2.5 sm:space-y-3">
              <div className="w-16 h-16 sm:w-[86px] sm:h-[86px] rounded-full flex items-center justify-center bg-[#F7ECE9] text-[#BD7165] border border-[#EAD9D3]/70">
                <ShieldCheck className="w-6 h-6 sm:w-8 sm:h-8 stroke-[1.5]" />
              </div>
              <p className="text-sm sm:text-base md:text-[18px] font-medium text-[#211C1B] leading-snug">
                Atendimento
                <br />
                personalizado
              </p>
            </div>

            {/* Benefício 4 */}
            <div className="flex flex-col items-center text-center space-y-2.5 sm:space-y-3">
              <div className="w-16 h-16 sm:w-[86px] sm:h-[86px] rounded-full flex items-center justify-center bg-[#F7ECE9] text-[#BD7165] border border-[#EAD9D3]/70">
                <Heart className="w-6 h-6 sm:w-8 sm:h-8 stroke-[1.5]" />
              </div>
              <p className="text-sm sm:text-base md:text-[18px] font-medium text-[#211C1B] leading-snug">
                Beleza com
                <br />
                saúde e bem-estar
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. SERVIÇOS (SEÇÃO APROX. 760px) ─────────────────────────────────── */}
      <section
        id="servicos"
        className="w-full py-20 lg:py-24"
        style={{ backgroundColor: '#FCF8F5' }}
      >
        <div className="max-w-[1360px] mx-auto px-6 lg:px-10 space-y-12">
          {/* Cabeçalho Central */}
          <div className="text-center space-y-3">
            <span className="text-[13px] font-semibold tracking-[5px] uppercase text-[#BD7165]">
              Nossos Serviços
            </span>
            <h2 className="font-serif text-3xl sm:text-5xl lg:text-[54px] font-normal text-[#211C1B] tracking-tight">
              Cuidados para realçar a sua melhor versão
            </h2>
            <p className="text-sm sm:text-[18px] text-[#625D5A] max-w-xl mx-auto font-light">
              Escolha o serviço ideal e agende seu horário de forma rápida e prática.
            </p>
          </div>

          {/* Grid de Serviços reais do tenant */}
          {services.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {services.map((service, idx) => {
                const imgFallback = sampleServiceImages[idx % sampleServiceImages.length];
                return (
                  <div
                    key={service.id}
                    className="bg-white rounded-[18px] overflow-hidden border border-[#EAD9D3]/60 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    {/* Imagem do Serviço (210px altura cover) */}
                    <div className="relative w-full h-[210px] bg-[#F2E0DC] overflow-hidden">
                      <Image
                        src={imgFallback}
                        alt={service.name}
                        fill
                        className="object-cover transition-transform duration-300 hover:scale-105"
                      />
                    </div>

                    {/* Conteúdo Interno (padding 24px) */}
                    <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                      <div className="space-y-1">
                        <h3 className="font-semibold text-[20px] text-[#211C1B] leading-snug">
                          {service.name}
                        </h3>
                        <p className="text-[14px] text-[#625D5A]">
                          {service.category || 'Procedimento'}
                        </p>
                        <div className="flex items-center gap-1.5 text-[14px] text-[#625D5A] pt-1">
                          <Clock className="w-3.5 h-3.5 text-[#BD7165]" />
                          <span>{service.duration_minutes} min</span>
                        </div>
                      </div>

                      <div className="pt-2">
                        <span className="block font-serif text-[26px] font-bold text-[#BD7165]">
                          {formatCurrency(service.price)}
                        </span>
                      </div>

                      <div className="pt-2">
                        <Link
                          href={`/agendar/${tenant.slug}?serviceId=${service.id}`}
                          className="w-full inline-flex items-center justify-center h-[52px] rounded-[12px] text-sm font-semibold text-white transition-all shadow-xs hover:opacity-95"
                          style={{ backgroundColor: '#BD7165' }}
                        >
                          Agendar
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 px-6 rounded-2xl bg-white border border-[#EAD9D3]">
              <p className="text-sm text-[#625D5A]">
                Nenhum serviço disponível no momento para reserva online.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── 5. PROFISSIONAIS (SEÇÃO APROX. 540px) ────────────────────────────── */}
      <section
        id="profissionais"
        className="w-full py-20 lg:py-24 border-t border-[#EAD9D3]/40"
        style={{ backgroundColor: '#FCF8F5' }}
      >
        <div className="max-w-[1360px] mx-auto px-6 lg:px-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* Esquerda: 40% (5 colunas) */}
            <div className="lg:col-span-5 space-y-5">
              <span className="text-[13px] font-semibold tracking-[5px] uppercase text-[#BD7165]">
                Nossos Profissionais
              </span>
              <h2 className="font-serif text-3xl sm:text-5xl lg:text-[52px] font-normal text-[#211C1B] leading-tight tracking-tight">
                Especialistas
                <br />
                para cuidar de você
              </h2>
              <p className="text-base sm:text-[18px] text-[#625D5A] leading-relaxed max-w-md font-light">
                Nossa equipe está pronta para oferecer o melhor atendimento, com técnica,
                experiência e muito carinho.
              </p>
              <div className="pt-3">
                <Link
                  href={`/agendar/${tenant.slug}`}
                  className="inline-flex items-center justify-center gap-2 px-7 h-[56px] rounded-[12px] text-sm sm:text-base font-medium text-white transition-all shadow-xs hover:opacity-95"
                  style={{ backgroundColor: '#BD7165' }}
                >
                  <span>Agendar com nossa equipe</span>
                  <ArrowRight className="w-4 h-4 stroke-[2]" />
                </Link>
              </div>
            </div>

            {/* Direita: 60% (7 colunas) — Card Horizontal 740x380px */}
            <div className="lg:col-span-7">
              {featuredProf ? (
                <div className="bg-white rounded-[18px] border border-[#EAD9D3]/70 shadow-xs overflow-hidden flex flex-col sm:flex-row items-center">
                  {/* Foto do Profissional (285x380px) */}
                  <div className="relative w-full sm:w-[285px] h-[320px] sm:h-[380px] shrink-0 bg-[#F2E0DC]">
                    <Image
                      src={featuredProf.avatar_url || '/img/showcase_prof_default.png'}
                      alt={featuredProf.full_name}
                      fill
                      className="object-cover"
                    />
                  </div>

                  {/* Conteúdo à Direita (padding 36px) */}
                  <div className="p-6 sm:p-9 flex-1 space-y-3">
                    <h3 className="font-serif text-2xl sm:text-[28px] font-normal text-[#211C1B]">
                      {featuredProf.full_name}
                    </h3>
                    <p className="text-[16px] font-medium text-[#BD7165]">
                      {featuredProf.specialty || 'Especialista em Beleza & Estética'}
                    </p>
                    <p className="text-[15px] text-[#625D5A] leading-relaxed font-light">
                      {featuredProf.bio ||
                        'Especialista em procedimentos corporais e estéticos, com foco em relaxamento, saúde e bem-estar.'}
                    </p>

                    <div className="pt-4">
                      <Link
                        href={`/agendar/${tenant.slug}?professionalId=${featuredProf.id}`}
                        className="inline-flex items-center justify-center gap-2 px-6 h-[50px] rounded-[12px] text-sm font-medium border border-[#BD7165] text-[#BD7165] hover:bg-[#FAF0EC] transition-all"
                      >
                        <Calendar className="w-4 h-4" />
                        <span>Ver horários</span>
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white p-8 rounded-[18px] border border-[#EAD9D3] text-center">
                  <p className="text-sm text-[#625D5A]">
                    Equipe em preparação para agendamento online.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. GALERIA / NOSSO ESPAÇO (SEÇÃO APROX. 510px) ──────────────────── */}
      {galleryItems.length > 0 && (
        <section
          className="w-full py-20 lg:py-24 border-t border-[#EAD9D3]/40"
          style={{ backgroundColor: '#FCF8F5' }}
        >
          <div className="max-w-[1360px] mx-auto px-6 lg:px-10 space-y-12">
            <div className="text-center space-y-2">
              <span className="text-[13px] font-semibold tracking-[5px] uppercase text-[#BD7165]">
                Nosso Espaço
              </span>
              <h2 className="font-serif text-3xl sm:text-5xl font-normal text-[#211C1B]">
                Um ambiente pensado para o seu bem-estar
              </h2>
            </div>

            {/* Grid de 4 imagens */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {galleryItems.map((item) => (
                <div
                  key={item.id}
                  className="relative w-full h-[220px] sm:h-[265px] rounded-[14px] overflow-hidden shadow-2xs border border-[#EAD9D3]/60 group"
                >
                  <Image
                    src={item.image_url}
                    alt={item.title}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── 7. FAIXA DE CONTATO / AGENDAMENTO (ALTURA 260px) ────────────────── */}
      <section
        id="contato"
        className="relative w-full overflow-hidden text-white mt-auto"
        style={{
          backgroundColor: '#BF7569',
          minHeight: '220px',
        }}
      >
        {/* Background botânico suave de apoio */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30 pointer-events-none"
          style={{ backgroundImage: "url('/img/showcase_contact_bg.png')" }}
        />

        <div className="relative max-w-[1360px] mx-auto px-6 lg:px-16 py-12 lg:py-14 flex flex-col lg:flex-row items-center justify-between gap-8">
          {/* Bloco A: Endereço */}
          <div className="flex items-center gap-4 text-left">
            <div className="w-[56px] h-[56px] rounded-full flex items-center justify-center bg-white/20 border border-white/25 shrink-0">
              <MapPin className="w-6 h-6 stroke-[1.8]" />
            </div>
            <div>
              <span className="block text-[17px] font-medium leading-tight">
                Nosso Endereço
              </span>
              <span className="block text-[15px] opacity-90 font-light mt-0.5">
                {businessAddress || 'Endereço sob consulta'}
                {businessCity ? `, ${businessCity}` : ''}
              </span>
            </div>
          </div>

          {/* Bloco B: Horário de Atendimento */}
          <div className="flex items-center gap-4 text-left">
            <div className="w-[56px] h-[56px] rounded-full flex items-center justify-center bg-white/20 border border-white/25 shrink-0">
              <Clock className="w-6 h-6 stroke-[1.8]" />
            </div>
            <div>
              <span className="block text-[17px] font-medium leading-tight">
                Horário de Atendimento
              </span>
              <span className="block text-[15px] opacity-90 font-light mt-0.5">
                Segunda a Sábado • {allowedStart} às {allowedEnd}
              </span>
            </div>
          </div>

          {/* Bloco C: CTA Branco 'Agende seu horário' */}
          <div className="flex flex-col items-center">
            <Link
              href={`/agendar/${tenant.slug}`}
              className="inline-flex items-center justify-center gap-2.5 px-8 h-[60px] sm:h-[66px] w-full sm:w-[330px] rounded-[12px] text-base font-semibold transition-all shadow-md active:scale-98"
              style={{ backgroundColor: '#FFFFFF', color: '#BD7165' }}
            >
              <Calendar className="w-5 h-5 text-[#BD7165]" />
              <span>Agende seu horário</span>
            </Link>
            <span className="text-[13px] opacity-80 mt-2 font-light">
              É rápido, prático e seguro
            </span>
          </div>
        </div>
      </section>

      {/* ── 8. FOOTER (ALTURA APROX. 200px) ─────────────────────────────────── */}
      <footer
        className="w-full py-10 lg:py-12 border-t border-[#EAD9D3]/50"
        style={{ backgroundColor: '#FCF8F5' }}
      >
        <div className="max-w-[1360px] mx-auto px-6 lg:px-10 space-y-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            {/* Logo / Nome do Estabelecimento à esquerda */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-[#F4E4E1] text-[#BD7165]">
                <Flower2 className="w-5 h-5" />
              </div>
              <span className="font-serif font-bold text-xl text-[#9F4039]">
                {businessName}
              </span>
            </div>

            {/* Links Centrais */}
            <nav className="flex flex-wrap items-center justify-center gap-6 text-[14px] text-[#625D5A]">
              <Link href="#inicio" className="hover:text-[#211C1B] transition-colors">
                Início
              </Link>
              <Link href="#servicos" className="hover:text-[#211C1B] transition-colors">
                Serviços
              </Link>
              <Link href="#profissionais" className="hover:text-[#211C1B] transition-colors">
                Profissionais
              </Link>
              <Link href="#sobre" className="hover:text-[#211C1B] transition-colors">
                Sobre
              </Link>
              <Link href="#contato" className="hover:text-[#211C1B] transition-colors">
                Contato
              </Link>
            </nav>

            {/* Redes Sociais à direita (36x36px) */}
            <div className="flex items-center gap-3">
              {businessWhatsapp && (
                <a
                  href={`https://wa.me/55${businessWhatsapp.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-full flex items-center justify-center bg-white border border-[#EAD9D3] text-[#211C1B] hover:text-[#BD7165] hover:border-[#BD7165] transition-all shadow-2xs"
                  title="WhatsApp"
                >
                  <MessageCircle className="w-4 h-4" />
                </a>
              )}
              {instagram && (
                <a
                  href={
                    instagram.startsWith('http')
                      ? instagram
                      : `https://instagram.com/${instagram.replace('@', '')}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-full flex items-center justify-center bg-white border border-[#EAD9D3] text-[#211C1B] hover:text-[#BD7165] hover:border-[#BD7165] transition-all shadow-2xs"
                  title="Instagram"
                >
                  <InstagramIcon className="w-4 h-4" />
                </a>
              )}
              {facebook && (
                <a
                  href={facebook.startsWith('http') ? facebook : `https://facebook.com/${facebook}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-full flex items-center justify-center bg-white border border-[#EAD9D3] text-[#211C1B] hover:text-[#BD7165] hover:border-[#BD7165] transition-all shadow-2xs"
                  title="Facebook"
                >
                  <FacebookIcon className="w-4 h-4" />
                </a>
              )}
              {businessPhone && !businessWhatsapp && (
                <a
                  href={`tel:${businessPhone.replace(/\D/g, '')}`}
                  className="w-9 h-9 rounded-full flex items-center justify-center bg-white border border-[#EAD9D3] text-[#211C1B] hover:text-[#BD7165] transition-all shadow-2xs"
                  title="Telefone"
                >
                  <Phone className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>

          {/* Copyright Centralizado Abaixo */}
          <div className="pt-4 border-t border-[#EAD9D3]/40 text-center text-[13px] text-[#625D5A]">
            <p>
              © {new Date().getFullYear()} {businessName}. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>

      {/* ── 9. RECEPCIONISTA VIRTUAL COM IA (FLUTUANTE) ──────────────────────── */}
      <AIChatWidget catalog={catalog} />
    </div>
  );
}
