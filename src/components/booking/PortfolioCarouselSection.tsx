'use client';

import React, { useState, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Sparkles, Scissors, ArrowRight } from 'lucide-react';
import { PortfolioItem } from '@/types/publicBooking';

interface PortfolioCarouselSectionProps {
  portfolio: PortfolioItem[];
  tenantSlug: string;
}

export function PortfolioCarouselSection({
  portfolio,
  tenantSlug,
}: PortfolioCarouselSectionProps) {
  // Filtra estritamente itens ativos e com consentimento
  const validItems = portfolio.filter((item) => item.is_active && item.client_consent !== false);
  const total = validItems.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const handlePrev = useCallback(() => {
    if (total <= 1) return;
    setCurrentIndex((prev) => (prev === 0 ? total - 1 : prev - 1));
  }, [total]);

  const handleNext = useCallback(() => {
    if (total <= 1) return;
    setCurrentIndex((prev) => (prev === total - 1 ? 0 : prev + 1));
  }, [total]);

  // Se não houver itens autorizados, oculta completamente a seção (Requisito 6)
  if (total === 0) {
    return null;
  }

  // Suporte a swipe em telas touch/mobile (Requisito 5)
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

  const currentItem = validItems[currentIndex] || validItems[0];

  return (
    <section
      id="portfolio"
      className="w-full py-20 lg:py-24 border-t border-[#EAD9D3]/40 bg-[#FCF8F5]"
    >
      <div className="max-w-[1360px] mx-auto px-6 lg:px-10 space-y-10">
        {/* Cabeçalho da Seção */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <span className="text-[13px] font-semibold tracking-[5px] uppercase text-[#BD7165]">
              Portfólio de Resultados
            </span>
            <h2 className="font-serif text-3xl sm:text-5xl lg:text-[46px] font-normal text-[#211C1B] leading-tight tracking-tight">
              Transformações que inspiram confiança
            </h2>
            <p className="text-sm sm:text-base text-[#625D5A] leading-relaxed font-light">
              Conheça os resultados reais dos nossos procedimentos, realizados com técnica apurada e respeito à sua individualidade.
            </p>
          </div>

          {/* Controles de Navegação Desktop (Setas) */}
          {total > 1 && (
            <div className="flex items-center gap-3 self-start md:self-auto">
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Item anterior do portfólio"
                className="w-12 h-12 rounded-full border border-[#EADBCE] bg-white hover:bg-[#FAF0EC] text-[#211C1B] flex items-center justify-center transition-all shadow-2xs hover:scale-105 cursor-pointer active:scale-95"
              >
                <ChevronLeft className="w-5 h-5 text-[#BD7165]" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Próximo item do portfólio"
                className="w-12 h-12 rounded-full border border-[#EADBCE] bg-white hover:bg-[#FAF0EC] text-[#211C1B] flex items-center justify-center transition-all shadow-2xs hover:scale-105 cursor-pointer active:scale-95"
              >
                <ChevronRight className="w-5 h-5 text-[#BD7165]" />
              </button>
            </div>
          )}
        </div>

        {/* Card Principal do Carrossel (Moderno & Responsivo) */}
        <div
          className="relative bg-white rounded-3xl border border-[#EAD9D3]/70 shadow-xs overflow-hidden select-none"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 items-center">
            {/* Foto do Trabalho Otimizada (7 colunas no desktop / full no mobile) */}
            <div className="lg:col-span-7 relative w-full h-[320px] sm:h-[440px] lg:h-[500px] bg-[#F5EDE8] overflow-hidden">
              <Image
                key={currentItem.id}
                src={currentItem.image_url}
                alt={currentItem.title}
                fill
                unoptimized
                priority
                className="object-cover transition-transform duration-500 hover:scale-[1.02]"
                sizes="(max-width: 1024px) 100vw, 750px"
              />

              {/* Tag Flutuante de Categoria */}
              <div className="absolute top-4 left-4 z-10">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/90 text-[#BD7165] shadow-xs backdrop-blur-xs">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{currentItem.category || 'Procedimento'}</span>
                </span>
              </div>
            </div>

            {/* Informações e Detalhes do Procedimento (5 colunas) */}
            <div className="lg:col-span-5 p-6 sm:p-10 lg:p-12 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                {currentItem.service_name && (
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#BD7165] uppercase tracking-wider">
                    <Scissors className="w-3.5 h-3.5" />
                    <span>Serviço: {currentItem.service_name}</span>
                  </div>
                )}

                <h3 className="font-serif text-2xl sm:text-3xl lg:text-[32px] font-normal text-[#211C1B] leading-snug">
                  {currentItem.title}
                </h3>

                {currentItem.description && (
                  <p className="text-sm sm:text-base text-[#625D5A] leading-relaxed font-light">
                    &ldquo;{currentItem.description}&rdquo;
                  </p>
                )}
              </div>

              {/* Botão de Agendamento do Serviço Vinculado */}
              <div className="pt-2">
                <Link
                  href={
                    currentItem.service_id
                      ? `/agendar/${tenantSlug}?serviceId=${currentItem.service_id}`
                      : `/agendar/${tenantSlug}`
                  }
                  className="inline-flex items-center justify-center gap-2 px-6 h-[52px] rounded-xl text-sm font-semibold text-white transition-all shadow-xs hover:opacity-95"
                  style={{ backgroundColor: '#BD7165' }}
                >
                  <span>
                    {currentItem.service_name
                      ? `Agendar ${currentItem.service_name}`
                      : 'Agendar este procedimento'}
                  </span>
                  <ArrowRight className="w-4 h-4 stroke-[2]" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Indicadores de Paginação (Dots) */}
        {total > 1 && (
          <div className="flex items-center justify-center gap-2.5 pt-2">
            {validItems.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                aria-label={`Ir para o trabalho ${idx + 1}`}
                className={`transition-all rounded-full cursor-pointer ${
                  currentIndex === idx
                    ? 'w-8 h-2.5 bg-[#BD7165]'
                    : 'w-2.5 h-2.5 bg-[#EADBCE] hover:bg-[#BD7165]/50'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
