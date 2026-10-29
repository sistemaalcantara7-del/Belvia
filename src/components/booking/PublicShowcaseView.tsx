'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Calendar,
  Clock,
  Sparkles,
  MapPin,
  MessageCircle,
  Phone,
  Bot,
  Globe,
  ArrowRight,
  X,
  ChevronRight,
  ShieldCheck,
  Star,
  CheckCircle2,
  Heart,
  Share2,
} from 'lucide-react';
import { PublicCatalogData, PortfolioItem, PublicService } from '@/types/publicBooking';
import { AIChatWidget } from './AIChatWidget';

interface PublicShowcaseViewProps {
  catalog: PublicCatalogData;
}

export function PublicShowcaseView({ catalog }: PublicShowcaseViewProps) {
  const { tenant, services = [], professionals = [], portfolio = [] } = catalog;

  const bookingSettings = tenant.settings?.booking_settings;
  const primaryColor = bookingSettings?.primary_color || '#C4837A';
  const secondaryColor = bookingSettings?.secondary_color || '#2D1F27';
  const logoUrl = bookingSettings?.logo_url;
  const coverUrl = bookingSettings?.cover_url;
  const businessName = bookingSettings?.business_name || tenant.name;
  const businessDescription =
    bookingSettings?.business_description ||
    'Atendimento especializado, beleza e bem-estar com horário marcado e experiência exclusiva.';
  const businessAddress = bookingSettings?.address || tenant.settings?.address;
  const businessCity = bookingSettings?.city || tenant.settings?.city;
  const businessWhatsapp = bookingSettings?.whatsapp || tenant.settings?.whatsapp;
  const businessPhone = bookingSettings?.phone || tenant.settings?.phone;
  const instagram = bookingSettings?.instagram;
  const facebook = bookingSettings?.facebook;
  const website = bookingSettings?.website;
  const bookingNotice = bookingSettings?.booking_notice || tenant.settings?.booking_notice;
  const allowedStart = bookingSettings?.allowed_start_time || '08:00';
  const allowedEnd = bookingSettings?.allowed_end_time || '20:00';

  // Modal para foto ampliada do portfólio
  const [selectedPhoto, setSelectedPhoto] = useState<PortfolioItem | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');

  // Formatação de Moeda
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Categorias únicas de serviços
  const serviceCategories = useMemo(() => {
    const cats = Array.from(new Set(services.map((s) => s.category || 'Geral')));
    return cats;
  }, [services]);

  // Serviços filtrados por categoria
  const filteredServices = useMemo(() => {
    if (selectedCategory === 'Todos') return services;
    return services.filter((s) => (s.category || 'Geral') === selectedCategory);
  }, [services, selectedCategory]);

  // Lista de especialidades únicas para exibir no Hero
  const specialtyTags = useMemo(() => {
    const fromServices = Array.from(new Set(services.map((s) => s.category).filter(Boolean)));
    const fromProfs = Array.from(new Set(professionals.map((p) => p.specialty).filter(Boolean)));
    const combined = Array.from(new Set([...fromServices, ...fromProfs])).slice(0, 4);
    return combined;
  }, [services, professionals]);

  // Iniciais elegantes para avatar fallback
  const initials = businessName
    ? businessName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
    : 'ZL';

  const hasServices = services.length > 0;
  const hasProfessionals = professionals.length > 0;
  const hasPortfolio = portfolio.length > 0;
  const hasAnyPublicContent = hasServices || hasProfessionals || hasPortfolio;

  return (
    <div className="min-h-screen bg-[#FAF6F3] flex flex-col font-sans text-[#2C1810] selection:bg-[#EADBCE] selection:text-[#2C1810]">
      {/* ── 1. CABEÇALHO FROSTED GLASS TRANSLÚCIDO ──────────────────────────── */}
      <header className="sticky top-0 z-40 bg-[#FAF6F3]/85 backdrop-blur-md border-b border-[#EAD9D3]/70 transition-all">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-4">
          {/* Marca / Estabelecimento */}
          <Link href={`/p/${tenant.slug}`} className="flex items-center gap-3 group min-w-0">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={businessName}
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl object-cover border border-[#EAD9D3] shadow-xs group-hover:scale-105 transition-transform"
              />
            ) : (
              <div
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center font-serif font-bold text-base sm:text-lg text-white shadow-xs group-hover:scale-105 transition-transform"
                style={{ backgroundColor: primaryColor }}
              >
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <span className="block font-serif font-bold text-sm sm:text-base text-[#2C1810] truncate tracking-tight">
                {businessName}
              </span>
              <span className="block text-[11px] font-medium text-[#8C7A74] truncate">
                {businessCity || 'Clínica & Bem-Estar'}
              </span>
            </div>
          </Link>

          {/* Ações Topo */}
          <div className="flex items-center gap-2.5 shrink-0">
            {businessWhatsapp && (
              <a
                href={`https://wa.me/55${businessWhatsapp.replace(/\D/g, '')}?text=Olá,%20gostaria%20de%20informações%20sobre%20os%20serviços.`}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/80 hover:bg-emerald-100 transition-colors shadow-2xs"
                title="Conversar pelo WhatsApp"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span>WhatsApp</span>
              </a>
            )}

            <Link
              href={`/agendar/${tenant.slug}`}
              className="inline-flex items-center gap-1.5 px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white shadow-xs hover:opacity-95 hover:shadow-md transition-all active:scale-98"
              style={{ backgroundColor: primaryColor }}
            >
              <Calendar className="w-4 h-4" />
              <span>Agendar</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ── 2. HERO PRINCIPAL PREMIUM ────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#2E1F26] via-[#35252D] to-[#251820] text-white">
        {/* Imagem de Capa ou Textura de Fundo Refinada */}
        {coverUrl ? (
          <div className="absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverUrl}
              alt="Capa do Estabelecimento"
              className="w-full h-full object-cover opacity-30 sm:opacity-35"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#251820] via-[#2E1F26]/70 to-transparent" />
          </div>
        ) : (
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <div
              className="w-96 h-96 rounded-full blur-3xl absolute -top-20 -right-20"
              style={{ backgroundColor: primaryColor }}
            />
            <div className="w-80 h-80 rounded-full blur-3xl bg-[#B87070] absolute -bottom-20 -left-20" />
          </div>
        )}

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-20 lg:py-24">
          <div className="max-w-3xl space-y-5 text-center sm:text-left">
            {/* Badge de Destaque */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-medium text-[#F4DDD5] shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-[#F2C0B8]" />
              <span>Espaço Oficial de Atendimento & Beleza</span>
            </div>

            {/* Nome e Título */}
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-serif font-normal tracking-tight text-white leading-tight">
              {businessName}
            </h1>

            {/* Descrição Comercial */}
            <p className="text-sm sm:text-base text-[#EADBCE] leading-relaxed max-w-2xl font-light">
              {businessDescription}
            </p>

            {/* Especialidades / Tags */}
            {specialtyTags.length > 0 && (
              <div className="pt-1 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                {specialtyTags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 rounded-full text-xs font-medium bg-white/10 backdrop-blur-xs text-[#FAF0EC] border border-white/10"
                  >
                    • {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Localização e Horário */}
            <div className="pt-2 flex flex-col sm:flex-row items-center sm:items-center gap-3 sm:gap-6 text-xs text-[#DEC5BC]">
              {businessAddress && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-[#F2C0B8] shrink-0" />
                  <span>
                    {businessAddress}
                    {businessCity ? `, ${businessCity}` : ''}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#F2C0B8] shrink-0" />
                <span>
                  Segunda a Sábado • {allowedStart} às {allowedEnd}
                </span>
              </div>
            </div>

            {/* Ações de Conversão no Hero */}
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-3">
              <Link
                href={`/agendar/${tenant.slug}`}
                className="w-full sm:w-auto px-7 py-3.5 rounded-2xl text-white text-xs sm:text-sm font-bold uppercase tracking-wider shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                style={{ backgroundColor: primaryColor }}
              >
                <Calendar className="w-4 h-4" />
                <span>Agendar Horário Online</span>
                <ChevronRight className="w-4 h-4" />
              </Link>

              {businessWhatsapp && (
                <a
                  href={`https://wa.me/55${businessWhatsapp.replace(/\D/g, '')}?text=Olá,%20gostaria%20de%20informações%20sobre%20os%20serviços.`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-white/10 hover:bg-white/15 backdrop-blur-md text-white text-xs sm:text-sm font-semibold border border-white/20 transition-all flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4 text-emerald-300" />
                  <span>Falar no WhatsApp</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. AVISO COMERCIAL DISCRETO (SE CONFIGURADO) ───────────────────── */}
      {bookingNotice && (
        <aside className="bg-[#FAF0EC] border-b border-[#EADBCE] py-3 px-4">
          <div className="max-w-6xl mx-auto flex items-center justify-center gap-2.5 text-xs text-[#5C4540] text-center">
            <span className="font-bold text-[#2C1810] px-2 py-0.5 rounded bg-white/80 border border-[#EADBCE]">
              Aviso
            </span>
            <span>{bookingNotice}</span>
          </div>
        </aside>
      )}

      {/* ── 4. CORPO DA VITRINE COM ESTADOS VAZIOS INTELIGENTES ──────────────── */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-10 sm:py-16 space-y-16">
        {/* SEÇÃO 1: CATÁLOGO DE SERVIÇOS E TRATAMENTOS */}
        {hasServices && (
          <section id="servicos" className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#EAD9D3]/80 pb-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#A86B62]">
                  Cardápio de Procedimentos
                </span>
                <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[#2C1810] mt-0.5">
                  Serviços & Tratamentos
                </h2>
                <p className="text-xs sm:text-sm text-[#7D6B65] mt-1 font-light">
                  Selecione o procedimento desejado para agendar o seu momento com facilidade.
                </p>
              </div>

              <Link
                href={`/agendar/${tenant.slug}`}
                className="inline-flex items-center gap-1.5 text-xs font-bold hover:underline self-start sm:self-auto"
                style={{ color: primaryColor }}
              >
                <span>Ver todos na Agenda</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Pílulas de Filtro por Categoria */}
            {serviceCategories.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('Todos')}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
                    selectedCategory === 'Todos'
                      ? 'bg-[#2C1810] text-white shadow-2xs'
                      : 'bg-white text-[#7D6B65] border border-[#EAD9D3] hover:border-[#2C1810]'
                  }`}
                >
                  Todos ({services.length})
                </button>
                {serviceCategories.map((cat) => {
                  const count = services.filter((s) => (s.category || 'Geral') === cat).length;
                  const isCatSelected = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
                        isCatSelected
                          ? 'bg-[#2C1810] text-white shadow-2xs'
                          : 'bg-white text-[#7D6B65] border border-[#EAD9D3] hover:border-[#2C1810]'
                      }`}
                    >
                      {cat} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            {/* Grid de Cards de Serviços */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {filteredServices.map((srv) => (
                <article
                  key={srv.id}
                  className="group bg-white rounded-2xl border border-[#EADBCE] p-5 hover:border-[#C4837A] hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#FAF0EC] text-[#A86B62] border border-[#F2DDD5]">
                        {srv.category || 'Geral'}
                      </span>
                      <span className="text-base font-serif font-bold text-[#2C1810]">
                        {formatCurrency(srv.price)}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-[#2C1810] group-hover:text-[#A86B62] transition-colors">
                        {srv.name}
                      </h3>
                      {srv.description && (
                        <p className="text-xs text-[#7D6B65] mt-1.5 line-clamp-2 leading-relaxed font-light">
                          {srv.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 pt-3.5 border-t border-[#F5EDE8] flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-[#8C7A74]">
                      <Clock className="w-3.5 h-3.5 text-[#C4837A]" />
                      <span>{srv.duration_minutes} min</span>
                    </div>

                    <Link
                      href={`/agendar/${tenant.slug}?serviceId=${srv.id}`}
                      className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white transition-all shadow-2xs group-hover:shadow-xs hover:opacity-95"
                      style={{ backgroundColor: primaryColor }}
                    >
                      <span>Agendar</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* SEÇÃO 2: EQUIPE DE PROFISSIONAIS */}
        {hasProfessionals && (
          <section id="equipe" className="space-y-6">
            <div className="border-b border-[#EAD9D3]/80 pb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-[#A86B62]">
                Especialistas
              </span>
              <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[#2C1810] mt-0.5">
                Nossa Equipe
              </h2>
              <p className="text-xs sm:text-sm text-[#7D6B65] mt-1 font-light">
                Profissionais qualificados e apaixonados pelo cuidado individual de cada cliente.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {professionals.map((prof) => (
                <div
                  key={prof.id}
                  className="bg-white rounded-3xl border border-[#EADBCE] p-6 text-center flex flex-col items-center justify-between hover:border-[#C4837A] hover:shadow-md transition-all space-y-4"
                >
                  <div className="flex flex-col items-center space-y-3">
                    {prof.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={prof.avatar_url}
                        alt={prof.full_name}
                        className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-2 border-white shadow-sm ring-2 ring-[#EADBCE]"
                      />
                    ) : (
                      <div
                        className="w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center font-serif font-bold text-xl text-white shadow-sm ring-2 ring-[#EADBCE]"
                        style={{ backgroundColor: primaryColor }}
                      >
                        {prof.full_name
                          .split(' ')
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase()}
                      </div>
                    )}

                    <div className="space-y-1">
                      <h3 className="text-base font-bold text-[#2C1810]">{prof.full_name}</h3>
                      <p className="text-xs font-semibold text-[#A86B62]">{prof.specialty}</p>
                      {prof.bio && (
                        <p className="text-xs text-[#7D6B65] line-clamp-3 font-light leading-relaxed pt-1">
                          {prof.bio}
                        </p>
                      )}
                    </div>
                  </div>

                  <Link
                    href={`/agendar/${tenant.slug}?professionalId=${prof.id}`}
                    className="w-full py-2.5 rounded-xl border border-[#EADBCE] text-xs font-semibold text-[#2C1810] hover:bg-[#FAF0EC] hover:border-[#C4837A] hover:text-[#A86B62] transition-all flex items-center justify-center gap-1.5"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Ver Horários com {prof.full_name.split(' ')[0]}</span>
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* SEÇÃO 3: PORTFÓLIO / GALERIA DE TRANSFORMAÇÕES */}
        {hasPortfolio && (
          <section id="portfolio" className="space-y-6">
            <div className="border-b border-[#EAD9D3]/80 pb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-[#A86B62]">
                Resultados
              </span>
              <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[#2C1810] mt-0.5">
                Galeria de Trabalhos
              </h2>
              <p className="text-xs sm:text-sm text-[#7D6B65] mt-1 font-light">
                Inspire-se com os resultados e transformações realizados em nosso espaço.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
              {portfolio.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedPhoto(item)}
                  className="group relative aspect-square rounded-2xl overflow-hidden bg-[#2D1F27] cursor-pointer shadow-2xs border border-[#EAD9D3]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.image_url}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-end text-white text-xs">
                    <span className="font-bold truncate">{item.title}</span>
                    <span className="text-[10px] text-rose-200">{item.category}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ESTADO VAZIO ELEGANTE (CASO O ESTABELECIMENTO AINDA NÃO TENHA PUBLICADO ITENS) */}
        {!hasAnyPublicContent && (
          <section className="text-center py-12 px-6 rounded-3xl bg-white border border-[#EADBCE] shadow-xs space-y-4 max-w-xl mx-auto">
            <div
              className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-white shadow-xs"
              style={{ backgroundColor: primaryColor }}
            >
              <Calendar className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-xl font-serif font-bold text-[#2C1810]">
                Agendamento Online Disponível
              </h2>
              <p className="text-xs sm:text-sm text-[#7D6B65] font-light leading-relaxed">
                Estamos finalizando a apresentação dos nossos procedimentos neste espaço. Você já pode
                consultar datas e reservar seu atendimento diretamente pelo calendário.
              </p>
            </div>
            <div className="pt-2">
              <Link
                href={`/agendar/${tenant.slug}`}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-xs sm:text-sm font-bold uppercase tracking-wider text-white shadow-md hover:opacity-95 transition-all"
                style={{ backgroundColor: primaryColor }}
              >
                <span>Acessar Calendário de Horários</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </section>
        )}

        {/* SEÇÃO 4: CTA INSTITUCIONAL CONSOLIDADO & CONVITE AO CHAT */}
        <section className="rounded-3xl bg-gradient-to-br from-[#FDF8F5] via-[#F8EEEA] to-[#F1DFD9] border border-[#EADBCE] p-8 sm:p-12 shadow-xs flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-3 text-center md:text-left max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/70 border border-[#EADBCE] text-[11px] font-semibold text-[#A86B62]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Experiência & Praticidade</span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-serif font-bold text-[#2C1810] leading-tight">
              Pronta para viver o seu momento de cuidado em {businessName}?
            </h3>
            <p className="text-xs sm:text-sm text-[#7D6B65] font-light leading-relaxed">
              Reserve seu horário em segundos com confirmação imediata. Dúvidas sobre procedimentos?
              Utilize nossa Recepcionista Virtual no chat ao lado.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0 w-full sm:w-auto">
            <Link
              href={`/agendar/${tenant.slug}`}
              className="w-full sm:w-auto px-7 py-3.5 rounded-2xl text-white text-xs sm:text-sm font-bold uppercase tracking-wider shadow-md hover:shadow-lg transition-all text-center"
              style={{ backgroundColor: primaryColor }}
            >
              Agendar Meu Horário
            </Link>

            {businessWhatsapp && (
              <a
                href={`https://wa.me/55${businessWhatsapp.replace(/\D/g, '')}?text=Olá,%20gostaria%20de%20informações.`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-5 py-3.5 rounded-2xl bg-white border border-[#EADBCE] text-[#2C1810] text-xs sm:text-sm font-semibold hover:bg-[#FAF0EC] transition-colors text-center"
              >
                Falar Conosco
              </a>
            )}
          </div>
        </section>
      </main>

      {/* ── 5. MODAL DE FOTO DO PORTFÓLIO AMPLIAÇÃO ─────────────────────────── */}
      {selectedPhoto && (
        <div
          onClick={() => setSelectedPhoto(null)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 cursor-pointer animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-xl w-full bg-white rounded-3xl overflow-hidden shadow-2xl relative cursor-default"
          >
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedPhoto.image_url}
              alt={selectedPhoto.title}
              className="w-full max-h-[70vh] object-contain bg-[#1E1115]"
            />
            <div className="p-5 space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#A86B62]">
                {selectedPhoto.category}
              </span>
              <h3 className="text-base font-bold text-[#2C1810]">{selectedPhoto.title}</h3>
              {selectedPhoto.description && (
                <p className="text-xs text-[#7D6B65] font-light">{selectedPhoto.description}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 6. RODAPÉ REFINADO E INFORMAÇÕES DE CONTATO ────────────────────── */}
      <footer className="border-t border-[#EAD9D3] bg-white text-xs text-[#7D6B65] mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {/* Coluna 1: Dados do Estabelecimento */}
            <div className="space-y-2">
              <span className="font-serif font-bold text-base text-[#2C1810]">{businessName}</span>
              <p className="text-xs text-[#8C7A74] font-light leading-relaxed max-w-sm">
                {businessDescription}
              </p>
            </div>

            {/* Coluna 2: Localização e Atendimento */}
            <div className="space-y-2 text-xs">
              <span className="font-bold text-[#2C1810] uppercase tracking-wider text-[11px]">
                Atendimento
              </span>
              {businessAddress && (
                <p className="flex items-start gap-1.5 text-[#7D6B65]">
                  <MapPin className="w-3.5 h-3.5 text-[#C4837A] shrink-0 mt-0.5" />
                  <span>
                    {businessAddress}
                    {businessCity ? ` • ${businessCity}` : ''}
                  </span>
                </p>
              )}
              <p className="flex items-center gap-1.5 text-[#7D6B65]">
                <Clock className="w-3.5 h-3.5 text-[#C4837A] shrink-0" />
                <span>
                  Segunda a Sábado • {allowedStart} às {allowedEnd}
                </span>
              </p>
            </div>

            {/* Coluna 3: Contato & Redes */}
            <div className="space-y-2.5">
              <span className="font-bold text-[#2C1810] uppercase tracking-wider text-[11px]">
                Conecte-se
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {instagram && (
                  <a
                    href={
                      instagram.startsWith('http')
                        ? instagram
                        : `https://instagram.com/${instagram.replace('@', '')}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-full bg-[#FAF0EC] border border-[#EADBCE] text-[#A86B62] font-semibold text-xs hover:bg-[#F2DDD5] transition-colors"
                  >
                    Instagram
                  </a>
                )}
                {facebook && (
                  <a
                    href={facebook.startsWith('http') ? facebook : `https://facebook.com/${facebook}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-full bg-[#FAF0EC] border border-[#EADBCE] text-[#A86B62] font-semibold text-xs hover:bg-[#F2DDD5] transition-colors"
                  >
                    Facebook
                  </a>
                )}
                {website && (
                  <a
                    href={website.startsWith('http') ? website : `https://${website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-full bg-[#FAF0EC] border border-[#EADBCE] text-[#A86B62] font-semibold text-xs hover:bg-[#F2DDD5] transition-colors flex items-center gap-1"
                  >
                    <Globe className="w-3 h-3" />
                    <span>Site</span>
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-[#F2E5E0] flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-[#A3928B]">
            <p>© {new Date().getFullYear()} {businessName}. Todos os direitos reservados.</p>
            <p className="flex items-center gap-1">
              <span>Tecnologia & Gestão por</span>
              <strong className="text-[#8C5D55] font-semibold">ZELUNIA</strong>
            </p>
          </div>
        </div>
      </footer>

      {/* ── 7. WIDGET DE RECEPCIONISTA VIRTUAL FLUTUANTE ────────────────────── */}
      <AIChatWidget catalog={catalog} />
    </div>
  );
}
