'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Calendar,
  ArrowRight,
  X,
  Quote,
} from 'lucide-react';
import { PortfolioItem } from '@/types/publicBooking';

interface PortfolioCarouselSectionProps {
  portfolio: PortfolioItem[];
  tenantSlug: string;
}

export function PortfolioCarouselSection({
  portfolio,
  tenantSlug,
}: PortfolioCarouselSectionProps) {
  // Filtra estritamente itens ativos e com consentimento válido (LGPD)
  const validItems = portfolio.filter((item) => item.is_active && item.client_consent !== false);
  const total = validItems.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [selectedItemForModal, setSelectedItemForModal] = useState<PortfolioItem | null>(null);

  // Responsividade: determina quantos cards são visíveis por página / slide
  // Desktop >= 1200: 3 | Tablet 768-1199: 2 | Mobile < 768: 1
  const [visibleCount, setVisibleCount] = useState<number>(3);

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setVisibleCount(1);
      } else if (width < 1200) {
        setVisibleCount(2);
      } else {
        setVisibleCount(3);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Máximo índice de deslocamento
  const maxIndex = Math.max(0, total - visibleCount);

  // Navegação anterior / próximo com carrossel contínuo ou travado no total
  const handlePrev = () => {
    if (total <= 1) return;
    setCurrentIndex((prev) => (prev === 0 ? maxIndex : prev - 1));
  };

  const handleNext = () => {
    if (total <= 1) return;
    setCurrentIndex((prev) => (prev >= maxIndex ? 0 : prev + 1));
  };

  // Suporte a teclado acessível (Setas Esquerda / Direita)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      handlePrev();
    } else if (e.key === 'ArrowRight') {
      handleNext();
    }
  };

  // Suporte a swipe em telas touch/mobile
  const minSwipeDistance = 45;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      handleNext();
    } else if (isRightSwipe) {
      handlePrev();
    }
  };

  // Se não houver itens autorizados, oculta completamente a seção sem deixar espaço vazio
  if (total === 0) {
    return null;
  }

  // Cards visíveis no corte atual para a renderização responsiva
  // Para suporte fluido, calculamos os índices a exibir
  const getVisibleItems = () => {
    if (total <= visibleCount) {
      return validItems;
    }
    // Quando temos mais itens que visibleCount, pega fatia a partir de currentIndex
    const items: PortfolioItem[] = [];
    for (let i = 0; i < visibleCount; i++) {
      const idx = (currentIndex + i) % total;
      items.push(validItems[idx]);
    }
    return items;
  };

  const currentVisibleItems = getVisibleItems();

  return (
    <section
      id="portfolio"
      aria-label="Nosso Portfólio"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="relative w-full py-12 sm:py-14 border-t border-[#F0DDD7]/80 overflow-hidden select-none focus:outline-hidden scroll-mt-20 md:scroll-mt-28"
      style={{
        backgroundImage: "url('/img/bg_portfolio.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className="max-w-[1240px] mx-auto px-6 sm:px-8 flex flex-col items-center">
        {/* ── 1. CABEÇALHO ─────────────────────────────────────────── */}
        <div className="text-center space-y-2.5 max-w-3xl mb-8">
          {/* Eyebrow centralizado com traços finos decorativos */}
          <div className="flex items-center justify-center gap-3">
            <span className="w-8 h-[1px] bg-[#C56F63]/50 hidden sm:inline-block" />
            <span className="text-[12px] font-semibold tracking-[4px] uppercase text-[#C56F63]">
              NOSSO PORTFÓLIO
            </span>
            <span className="w-8 h-[1px] bg-[#C56F63]/50 hidden sm:inline-block" />
          </div>

          {/* Título com destaque terracota / elegante */}
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-[44px] font-normal text-[#271D20] leading-tight tracking-tight">
            Beleza que inspira, <span className="text-[#C56F63] italic">resultados que encantam</span>
          </h2>

          {/* Subtítulo */}
          <p className="text-sm sm:text-base text-[#77676A] leading-relaxed font-light max-w-2xl mx-auto">
            Conheça alguns dos trabalhos realizados com carinho e dedicação.
          </p>
        </div>

        {/* ── 2. CARROSSEL DE CARDS ─────────────────────────────────── */}
        <div
          className="relative w-full flex items-center justify-center"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Botão de Navegação Esquerda (Desktop/Tablet) */}
          {total > visibleCount && (
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Ver trabalhos anteriores"
              className="absolute -left-3 sm:-left-5 lg:-left-6 z-20 w-[42px] h-[42px] rounded-full bg-white border border-[#EAD5CF] text-[#C56F63] flex items-center justify-center shadow-md hover:bg-[#FAF2EF] hover:scale-105 active:scale-95 transition-all cursor-pointer focus:ring-2 focus:ring-[#C56F63]"
            >
              <ChevronLeft className="w-5 h-5 stroke-[2.2]" />
            </button>
          )}

          {/* Container Grid dos Cards */}
          <div
            className={`w-full grid gap-5 sm:gap-6 items-stretch justify-center transition-all duration-300 ${
              total === 1
                ? 'grid-cols-1 max-w-[380px]'
                : visibleCount === 1
                ? 'grid-cols-1 max-w-[380px]'
                : visibleCount === 2
                ? 'grid-cols-2 max-w-[780px]'
                : 'grid-cols-3 max-w-[1240px]'
            }`}
          >
            {currentVisibleItems.map((item, idx) => {
              // Destaque visual sutil ao card central em desktop (quando 3 itens visíveis)
              const isCenterCard = visibleCount === 3 && idx === 1;

              return (
                <div
                  key={`${item.id}-${idx}`}
                  onClick={() => setSelectedItemForModal(item)}
                  className={`group relative flex flex-col bg-white rounded-[18px] border border-[#F0DDD7] overflow-hidden shadow-xs hover:shadow-lg transition-all duration-300 cursor-pointer ${
                    isCenterCard ? 'ring-1 ring-[#C56F63]/30 shadow-sm' : ''
                  }`}
                  style={{
                    minHeight: '320px',
                  }}
                >
                  {/* Foto do Trabalho */}
                  <div className="relative w-full h-[195px] sm:h-[205px] bg-[#FAF2EF] overflow-hidden shrink-0">
                    <Image
                      src={item.image_url}
                      alt={item.title}
                      fill
                      unoptimized
                      priority={idx === 0}
                      className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035]"
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 380px"
                    />

                    {/* Badge "Resultado Real" no topo esquerdo (conforme mockup) */}
                    <div className="absolute top-3 left-3 z-10">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-[#BD7165]/90 text-white shadow-xs backdrop-blur-xs">
                        <Sparkles className="w-3 h-3 text-[#FDEEEA]" />
                        <span>Resultado Real</span>
                      </span>
                    </div>
                  </div>

                  {/* Informações Textuais Abaixo da Foto */}
                  <div className="p-4 sm:p-5 flex flex-col justify-between flex-1 space-y-2.5">
                    <div className="space-y-1.5">
                      {/* Título do Trabalho com ícone decorativo */}
                      <div className="flex items-start gap-2">
                        <h3 className="text-[17px] sm:text-[18px] font-semibold text-[#2D2023] leading-snug line-clamp-1 group-hover:text-[#C56F63] transition-colors">
                          {item.title}
                        </h3>
                      </div>

                      {/* Serviço Vinculado ou Categoria */}
                      {(item.service_name || item.category) && (
                        <p className="text-[12px] font-medium text-[#8B7476] line-clamp-1">
                          {item.service_name ? `Serviço: ${item.service_name}` : item.category}
                        </p>
                      )}

                      {/* Comentário / Descrição com aspas */}
                      {item.description && (
                        <p className="text-[13px] text-[#6F6265] leading-relaxed line-clamp-2 font-normal italic pt-0.5">
                          &ldquo;{item.description}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Botão de Navegação Direita (Desktop/Tablet) */}
          {total > visibleCount && (
            <button
              type="button"
              onClick={handleNext}
              aria-label="Ver próximos trabalhos"
              className="absolute -right-3 sm:-right-5 lg:-right-6 z-20 w-[42px] h-[42px] rounded-full bg-white border border-[#EAD5CF] text-[#C56F63] flex items-center justify-center shadow-md hover:bg-[#FAF2EF] hover:scale-105 active:scale-95 transition-all cursor-pointer focus:ring-2 focus:ring-[#C56F63]"
            >
              <ChevronRight className="w-5 h-5 stroke-[2.2]" />
            </button>
          )}
        </div>

        {/* ── 3. PAGINAÇÃO / INDICADORES (DOTS) ─────────────────────── */}
        {total > visibleCount && (
          <div className="flex items-center justify-center gap-2 pt-6">
            {Array.from({ length: total }).map((_, idx) => {
              const isActive = currentIndex === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  aria-label={`Ir para a foto ${idx + 1}`}
                  className={`transition-all duration-300 rounded-full cursor-pointer ${
                    isActive
                      ? 'w-[20px] h-[7px] bg-[#BF756A]'
                      : 'w-[7px] h-[7px] bg-[#EAD5CF] hover:bg-[#BF756A]/60'
                  }`}
                />
              );
            })}
          </div>
        )}

        {/* ── 4. BOTÃO CTA CENTRALIZADO: "AGENDAR MEU HORÁRIO" (MOCKUP) ── */}
        <div className="pt-7">
          <Link
            href={`/agendar/${tenantSlug}`}
            className="inline-flex items-center justify-center gap-2.5 px-7 h-[48px] rounded-full text-[14px] font-semibold text-white bg-[#BF756A] hover:bg-[#a8645a] transition-all shadow-md hover:shadow-lg active:scale-98"
          >
            <Calendar className="w-4 h-4 stroke-[2]" />
            <span>Agendar meu horário</span>
            <ArrowRight className="w-4 h-4 stroke-[2.2]" />
          </Link>
        </div>
      </div>

      {/* ── 5. MODAL DE VISUALIZAÇÃO COMPLETA DO TRABALHO ─────────────── */}
      {selectedItemForModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in-0 duration-200"
          onClick={() => setSelectedItemForModal(null)}
        >
          <div
            className="relative w-full max-w-lg bg-white rounded-2xl overflow-hidden shadow-2xl border border-[#F0DDD7] animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Botão Fechar */}
            <button
              type="button"
              onClick={() => setSelectedItemForModal(null)}
              aria-label="Fechar modal"
              className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-black/50 text-white hover:bg-black/70 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Imagem em Destaque */}
            <div className="relative w-full h-[280px] bg-[#FAF2EF]">
              <Image
                src={selectedItemForModal.image_url}
                alt={selectedItemForModal.title}
                fill
                unoptimized
                className="object-cover"
              />
            </div>

            {/* Conteúdo */}
            <div className="p-6 space-y-4">
              <div>
                <span className="text-[11px] font-semibold tracking-wider uppercase text-[#C56F63]">
                  {selectedItemForModal.category || 'Resultado Real'}
                </span>
                <h3 className="text-xl font-bold text-[#2D2023] mt-0.5">
                  {selectedItemForModal.title}
                </h3>
                {selectedItemForModal.service_name && (
                  <p className="text-xs text-[#8B7476] mt-1 font-medium">
                    Serviço vinculado: {selectedItemForModal.service_name}
                  </p>
                )}
              </div>

              {selectedItemForModal.description && (
                <div className="p-3.5 rounded-xl bg-[#FAF6F3] border border-[#F0DDD7] flex items-start gap-2.5">
                  <Quote className="w-4 h-4 text-[#C56F63] shrink-0 mt-0.5" />
                  <p className="text-xs sm:text-sm text-[#6F6265] leading-relaxed italic">
                    {selectedItemForModal.description}
                  </p>
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <Link
                  href={
                    selectedItemForModal.service_id
                      ? `/agendar/${tenantSlug}?serviceId=${selectedItemForModal.service_id}`
                      : `/agendar/${tenantSlug}`
                  }
                  className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl text-xs sm:text-sm font-semibold text-white bg-[#BF756A] hover:bg-[#a8645a] transition-all shadow-xs"
                >
                  <Calendar className="w-4 h-4" />
                  <span>
                    {selectedItemForModal.service_name
                      ? `Agendar ${selectedItemForModal.service_name}`
                      : 'Agendar este procedimento'}
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
