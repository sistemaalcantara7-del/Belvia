'use client';

import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  Sparkles,
  MapPin,
  MessageCircle,
  Bot,
  Globe,
  ArrowRight,
  X,
} from 'lucide-react';
import { PublicCatalogData, PortfolioItem } from '@/types/publicBooking';
import Link from 'next/link';
import { AIChatWidget } from './AIChatWidget';

interface PublicShowcaseViewProps {
  catalog: PublicCatalogData;
}

export function PublicShowcaseView({ catalog }: PublicShowcaseViewProps) {
  const { tenant, services, professionals, portfolio = [] } = catalog;

  const bookingSettings = tenant.settings?.booking_settings;
  const primaryColor = bookingSettings?.primary_color || '#C4837A';
  const logoUrl = bookingSettings?.logo_url;
  const coverUrl = bookingSettings?.cover_url;
  const businessName = bookingSettings?.business_name || tenant.name;
  const businessDescription =
    bookingSettings?.business_description ||
    'Atendimento especializado, beleza e bem-estar com horário marcado.';
  const businessAddress = bookingSettings?.address || tenant.settings?.address;
  const businessWhatsapp = bookingSettings?.whatsapp || tenant.settings?.whatsapp;
  const instagram = bookingSettings?.instagram;
  const facebook = bookingSettings?.facebook;
  const website = bookingSettings?.website;
  const bookingNotice = bookingSettings?.booking_notice || tenant.settings?.booking_notice;

  // Modal para foto ampliada do portfólio
  const [selectedPhoto, setSelectedPhoto] = useState<PortfolioItem | null>(null);

  // Formatação de Moeda
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  return (
    <div className="min-h-screen bg-[#FDFAF8] flex flex-col font-sans text-[#2C1810]">
      {/* ── 1. TOPO & BANNER DE APRESENTAÇÃO ────────────────────────────────────── */}
      <section className="relative bg-[#2D1F27] text-white overflow-hidden">
        {coverUrl ? (
          <div className="absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverUrl} alt="Capa" className="w-full h-full object-cover opacity-35" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#2D1F27] via-[#2D1F27]/60 to-transparent" />
          </div>
        ) : (
          <div
            className="absolute inset-0 opacity-20"
            style={{ backgroundColor: primaryColor }}
          />
        )}

        <div className="relative max-w-4xl mx-auto px-4 py-12 sm:py-16 flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={businessName}
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl object-cover border-2 border-white/20 shadow-xl"
            />
          ) : (
            <div
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl flex items-center justify-center font-serif font-bold text-3xl shadow-xl text-white border-2 border-white/20"
              style={{ backgroundColor: primaryColor }}
            >
              {businessName.slice(0, 2).toUpperCase()}
            </div>
          )}

          <div className="flex-1 space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-xs text-xs font-semibold text-rose-200 border border-white/15">
              <Sparkles className="w-3.5 h-3.5" style={{ color: primaryColor }} />
              Vitrine Digital Oficial
            </div>

            <h1 className="text-2xl sm:text-4xl font-serif font-bold tracking-tight text-white">
              {businessName}
            </h1>

            <p className="text-xs sm:text-sm text-[#EAD9D3] max-w-2xl leading-relaxed">
              {businessDescription}
            </p>

            {businessAddress && (
              <p className="text-xs text-white/80 flex items-center justify-center sm:justify-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-rose-300 shrink-0" />
                {businessAddress}
              </p>
            )}

            {/* CTAs Principais */}
            <div className="pt-2 flex flex-wrap items-center justify-center sm:justify-start gap-3">
              <Link
                href={`/agendar/${tenant.slug}`}
                className="px-5 py-3 rounded-2xl text-white text-xs font-bold uppercase tracking-wider shadow-md hover:scale-102 transition-transform flex items-center gap-2"
                style={{ backgroundColor: primaryColor }}
              >
                <Calendar className="w-4 h-4" />
                Agendar Horário Online
              </Link>

              {businessWhatsapp && (
                <a
                  href={`https://wa.me/55${businessWhatsapp.replace(/\D/g, '')}?text=Olá,%20gostaria%20de%20informações%20sobre%20os%20serviços.`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-md flex items-center gap-2 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  Falar no WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. AVISO COMERCIAL (SE ATIVO) ───────────────────────────────────────── */}
      {bookingNotice && (
        <div className="bg-[#FAF6F3] border-b border-[#EAD9D3] py-2.5 px-4">
          <div className="max-w-4xl mx-auto text-xs text-[#6B5A55] flex items-center justify-center gap-2">
            <span className="font-semibold text-[#2C1810]">Aviso:</span>
            <span>{bookingNotice}</span>
          </div>
        </div>
      )}

      {/* ── 3. CORPO PRINCIPAL DA VITRINE ──────────────────────────────────────── */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-10 pb-20">
        {/* SEÇÃO 1: CATÁLOGO DE SERVIÇOS */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-serif font-bold text-[#2D1F27]">Serviços & Tratamentos</h2>
              <p className="text-xs text-[#9B8985]">
                Escolha o procedimento ideal e reserve seu horário com facilidade.
              </p>
            </div>
            <Link
              href={`/agendar/${tenant.slug}`}
              className="text-xs font-semibold hover:underline flex items-center gap-1"
              style={{ color: primaryColor }}
            >
              Ver todos <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {services.slice(0, 6).map((srv) => (
              <div
                key={srv.id}
                className="p-4 rounded-2xl bg-white border border-[#EAD9D3] hover:border-[#C4837A] hover:shadow-xs transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#A86B62]">
                      {srv.category}
                    </span>
                    <span className="font-bold text-[#2D1F27]">{formatCurrency(srv.price)}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-[#2D1F27]">{srv.name}</h3>
                  {srv.description && (
                    <p className="text-xs text-[#9B8985] mt-1 line-clamp-2">{srv.description}</p>
                  )}
                </div>

                <div className="mt-3 pt-2.5 border-t border-[#F5EDE8] flex items-center justify-between text-xs">
                  <span className="text-[#9B8985] flex items-center gap-1 text-[11px]">
                    <Clock className="w-3 h-3" />
                    {srv.duration_minutes} min
                  </span>
                  <Link
                    href={`/agendar/${tenant.slug}`}
                    className="font-bold text-xs hover:underline flex items-center gap-0.5"
                    style={{ color: primaryColor }}
                  >
                    Agendar <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SEÇÃO 2: PORTFÓLIO / GALERIA DE RESULTADOS */}
        {portfolio && portfolio.length > 0 && (
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-serif font-bold text-[#2D1F27]">Nosso Portfólio</h2>
              <p className="text-xs text-[#9B8985]">
                Conheça alguns dos nossos trabalhos e transformações recentes.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {portfolio.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedPhoto(item)}
                  className="group relative aspect-square rounded-2xl overflow-hidden bg-[#2D1F27] cursor-pointer shadow-xs border border-[#EAD9D3]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.image_url}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2.5 flex flex-col justify-end text-white text-xs">
                    <span className="font-bold truncate">{item.title}</span>
                    <span className="text-[10px] text-rose-200">{item.category}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* SEÇÃO 3: EQUIPE DE PROFISSIONAIS */}
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-serif font-bold text-[#2D1F27]">Nossa Equipe</h2>
            <p className="text-xs text-[#9B8985]">
              Profissionais capacitados e dedicados ao melhor atendimento.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {professionals.map((prof) => (
              <div
                key={prof.id}
                className="p-4 rounded-2xl bg-white border border-[#EAD9D3] text-center space-y-2 flex flex-col items-center shadow-2xs"
              >
                {prof.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={prof.avatar_url}
                    alt={prof.full_name}
                    className="w-16 h-16 rounded-full object-cover border border-[#EAD9D3]"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-[#FAF0EC] text-[#B87070] font-bold text-lg flex items-center justify-center border border-[#EADBCE]">
                    {prof.full_name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-bold text-[#2D1F27]">{prof.full_name}</h3>
                  <p className="text-xs font-semibold text-[#A86B62]">{prof.specialty}</p>
                  {prof.bio && (
                    <p className="text-[11px] text-[#9B8985] mt-1 line-clamp-2">{prof.bio}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SEÇÃO 4: ESPAÇO VISUAL PARA FUTURO CHAT IA (PREPARATÓRIO) */}
        <section className="p-6 rounded-3xl bg-gradient-to-br from-[#FAF0EC] to-white border border-[#EADBCE] shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white border border-[#EADBCE] text-[#B87070] flex items-center justify-center shadow-xs">
              <Bot className="w-6 h-6 stroke-[2]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-bold text-[#1E1115]">Atendimento Inteligente 24h</h3>
                <span className="px-2 py-0.2 rounded-full text-[9px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200">
                  Em Breve
                </span>
              </div>
              <p className="text-xs text-[#7D6B65] mt-0.5">
                Em breve você poderá tirar dúvidas sobre procedimentos e agendar horários via chat interativo com IA.
              </p>
            </div>
          </div>

          <Link
            href={`/agendar/${tenant.slug}`}
            className="shrink-0 px-4 py-2.5 rounded-xl bg-white border border-[#EADBCE] text-xs font-bold text-[#1E1115] hover:bg-[#FAF6F3] shadow-2xs transition-colors"
          >
            Agendar Agora
          </Link>
        </section>
      </main>

      {/* ── 4. MODAL DE FOTO DO PORTFÓLIO ────────────────────────────────────── */}
      {selectedPhoto && (
        <div
          onClick={() => setSelectedPhoto(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-xl w-full bg-white rounded-3xl overflow-hidden shadow-2xl relative cursor-default"
          >
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedPhoto.image_url}
              alt={selectedPhoto.title}
              className="w-full max-h-[70vh] object-contain bg-[#1E1115]"
            />
            <div className="p-4 space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#A86B62]">
                {selectedPhoto.category}
              </span>
              <h3 className="text-base font-bold text-[#2D1F27]">{selectedPhoto.title}</h3>
              {selectedPhoto.description && (
                <p className="text-xs text-[#7D6B65]">{selectedPhoto.description}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 5. RODAPÉ INSTITUCIONAL ───────────────────────────────────────────── */}
      <footer className="border-t border-[#EAD9D3] bg-white py-6 text-xs text-[#7D6B65]">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-bold text-[#2D1F27]">{businessName}</p>
            {businessAddress && <p className="text-[11px] text-[#9B8985] mt-0.5">{businessAddress}</p>}
          </div>

          {/* Redes Sociais */}
          <div className="flex items-center gap-3">
            {instagram && (
              <a
                href={instagram.startsWith('http') ? instagram : `https://instagram.com/${instagram.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 rounded-full bg-[#FAF6F3] border border-[#EAD9D3] text-[#A86B62] font-semibold text-[11px] hover:bg-[#F2E0DC] transition-colors"
                title="Instagram"
              >
                Instagram
              </a>
            )}
            {facebook && (
              <a
                href={facebook.startsWith('http') ? facebook : `https://facebook.com/${facebook}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 rounded-full bg-[#FAF6F3] border border-[#EAD9D3] text-[#A86B62] font-semibold text-[11px] hover:bg-[#F2E0DC] transition-colors"
                title="Facebook"
              >
                Facebook
              </a>
            )}
            {website && (
              <a
                href={website.startsWith('http') ? website : `https://${website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-full bg-[#FAF6F3] border border-[#EAD9D3] text-[#A86B62] flex items-center justify-center hover:bg-[#F2E0DC] transition-colors"
                title="Site Institucional"
              >
                <Globe className="w-4 h-4" />
              </a>
            )}
          </div>

          <div className="text-[11px] text-[#9B8985]">
            Powered by <strong className="text-[#A86B62]">BELVIA / ZELUNIA</strong>
          </div>
        </div>
      </footer>

      {/* ── 6. WIDGET DE RECEPCIONISTA VIRTUAL COM IA ───────────────────────────── */}
      <AIChatWidget catalog={catalog} />
    </div>
  );
}
