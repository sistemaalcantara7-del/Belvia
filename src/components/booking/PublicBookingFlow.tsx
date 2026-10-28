'use client';

import React, { useState, useTransition } from 'react';
import {
  Calendar,
  Clock,
  User,
  Scissors,
  CheckCircle2,
  ChevronRight,
  ArrowLeft,
  Sparkles,
  MapPin,
  Phone,
  MessageCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import {
  PublicCatalogData,
  PublicService,
  PublicProfessional,
  PublicSlot,
  PublicBookingResult,
} from '@/types/publicBooking';
import {
  getPublicAvailableSlotsAction,
  createPublicBookingAction,
} from '@/lib/actions/publicBooking';
import { maskPhone } from '@/lib/utils/masks';
import { formatAppointmentDate, formatAppointmentTime } from '@/lib/utils/timezone';

interface PublicBookingFlowProps {
  catalog: PublicCatalogData;
}

type Step = 'service' | 'professional' | 'datetime' | 'details' | 'success';

export function PublicBookingFlow({ catalog }: PublicBookingFlowProps) {
  const { tenant, services, professionals } = catalog;

  const bookingSettings = tenant.settings?.booking_settings;
  const primaryColor = bookingSettings?.primary_color || '#C4837A';
  const logoUrl = bookingSettings?.logo_url;
  const coverUrl = bookingSettings?.cover_url;
  const businessName = bookingSettings?.business_name || tenant.name;
  const businessDescription = bookingSettings?.business_description;
  const businessAddress = bookingSettings?.address || tenant.settings?.address;
  const businessWhatsapp = bookingSettings?.whatsapp || tenant.settings?.whatsapp;
  const bookingNotice = bookingSettings?.booking_notice || tenant.settings?.booking_notice;

  // Estados da seleção
  const [step, setStep] = useState<Step>('service');
  const [selectedService, setSelectedService] = useState<PublicService | null>(null);
  const [selectedProfessional, setSelectedProfessional] = useState<PublicProfessional | null>(null);
  const [isAnyProfessional, setIsAnyProfessional] = useState(false);

  // Estados de data e slots
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [availableSlots, setAvailableSlots] = useState<PublicSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<PublicSlot | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);

  // Estados do formulário de dados do cliente
  const [clientName, setClientName] = useState('');
  const [clientWhatsapp, setClientWhatsapp] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientNotes, setClientNotes] = useState('');

  // Estados de submissão
  const [isPending, startTransition] = useTransition();
  const [bookingResult, setBookingResult] = useState<PublicBookingResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Filtra profissionais habilitados para o serviço selecionado
  const qualifiedProfessionals = professionals.filter((p) => {
    if (!selectedService) return true;
    return !p.service_ids || p.service_ids.length === 0 || p.service_ids.includes(selectedService.id);
  });

  // Dispara o carregamento de horários disponíveis
  const handleLoadSlots = (serviceId: string, profId: string | null, date: string) => {
    setLoadingSlots(true);
    setSlotError(null);
    setSelectedSlot(null);

    getPublicAvailableSlotsAction(tenant.id, serviceId, profId, date)
      .then((res) => {
        if (res.success && res.slots) {
          setAvailableSlots(res.slots);
          if (res.slots.length === 0) {
            setSlotError('Nenhum horário livre encontrado para esta data. Escolha outro dia.');
          }
        } else {
          setSlotError(res.error || 'Não foi possível carregar os horários.');
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Erro ao buscar horários';
        setSlotError('Falha ao verificar horários: ' + msg);
      })
      .finally(() => {
        setLoadingSlots(false);
      });
  };

  // Formatação de Moeda
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Gerador de datas sugeridas (próximos 7 dias)
  const getNextDays = () => {
    const days = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const iso = d.toISOString().split('T')[0];
      const weekday = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
      const dayNum = d.getDate();
      const month = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
      days.push({ iso, weekday, dayNum, month, isToday: i === 0 });
    }
    return days;
  };

  const handleConfirmBooking = () => {
    if (!selectedService || !selectedSlot) return;

    setSubmitError(null);
    startTransition(async () => {
      const chosenProfId = isAnyProfessional
        ? selectedSlot.professional_id
        : selectedProfessional?.id || selectedSlot.professional_id;

      const res = await createPublicBookingAction({
        tenantSlug: tenant.slug,
        serviceId: selectedService.id,
        professionalId: chosenProfId,
        date: selectedDate,
        time: selectedSlot.slot_time,
        clientName,
        clientWhatsapp,
        clientEmail: clientEmail || undefined,
        clientNotes: clientNotes || undefined,
      });

      if (res.success) {
        setBookingResult(res);
        setStep('success');
      } else {
        setSubmitError(res.message || 'Falha ao realizar agendamento.');
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#FDFAF8] flex flex-col font-sans text-[#2C1810]">
      {/* Banner de Capa (se configurado) */}
      {coverUrl && (
        <div className="w-full h-36 sm:h-48 relative overflow-hidden bg-[#2D1F27]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverUrl} alt="Capa" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        </div>
      )}

      {/* Cabeçalho do Estabelecimento */}
      <header className="bg-white border-b border-[#EAD9D3] sticky top-0 z-20 shadow-xs">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={businessName}
                className="w-12 h-12 rounded-2xl object-cover border border-[#EAD9D3] shadow-xs"
              />
            ) : (
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center font-serif font-bold text-xl shadow-xs text-white"
                style={{ backgroundColor: primaryColor }}
              >
                {businessName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-lg font-serif font-semibold text-[#2D1F27] leading-tight">
                {businessName}
              </h1>
              <p className="text-xs text-[#9B8985] flex items-center gap-1.5 mt-0.5">
                <Sparkles className="w-3.5 h-3.5" style={{ color: primaryColor }} />
                Agendamento Online Oficial
              </p>
            </div>
          </div>

          {/* Links e contatos rápidos */}
          {businessWhatsapp && (
            <a
              href={`https://wa.me/55${businessWhatsapp.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200 hover:bg-emerald-100 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              WhatsApp
            </a>
          )}
        </div>
      </header>

      {/* Descrição e Detalhes Comerciais (se configurados) */}
      {businessDescription && (
        <div className="bg-white border-b border-[#EAD9D3]/60 py-3 px-4">
          <div className="max-w-3xl mx-auto text-xs text-[#6B5A55] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="italic">&ldquo;{businessDescription}&rdquo;</p>
            {businessAddress && (
              <span className="flex items-center gap-1 text-[#9B8985] shrink-0 text-[11px]">
                <MapPin className="w-3.5 h-3.5 text-[#C4837A]" />
                {businessAddress}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-6 pb-24">
        {/* Aviso ou mensagem do estabelecimento */}
        {bookingNotice && step !== 'success' && (
          <div className="mb-6 p-3.5 rounded-xl bg-[#FAF6F3] border border-[#EAD9D3] text-xs text-[#6B5A55] flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: primaryColor }} />
            <div>
              <span className="font-semibold text-[#2C1810]">Aviso do Estabelecimento: </span>
              {bookingNotice}
            </div>
          </div>
        )}

        {/* Trilha de Etapas */}
        {step !== 'success' && (
          <div className="mb-6 flex items-center justify-between text-xs font-medium text-[#9B8985] border-b border-[#EAD9D3] pb-3">
            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  step === 'service'
                    ? 'bg-[#C4837A] text-white'
                    : 'bg-[#F2E0DC] text-[#A86B62]'
                }`}
              >
                1
              </span>
              <span className={step === 'service' ? 'text-[#2D1F27] font-semibold' : ''}>
                Serviço
              </span>
            </div>

            <ChevronRight className="w-4 h-4 text-[#EAD9D3]" />

            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  step === 'professional'
                    ? 'bg-[#C4837A] text-white'
                    : 'bg-[#F2E0DC] text-[#A86B62]'
                }`}
              >
                2
              </span>
              <span className={step === 'professional' ? 'text-[#2D1F27] font-semibold' : ''}>
                Profissional
              </span>
            </div>

            <ChevronRight className="w-4 h-4 text-[#EAD9D3]" />

            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  step === 'datetime'
                    ? 'bg-[#C4837A] text-white'
                    : 'bg-[#F2E0DC] text-[#A86B62]'
                }`}
              >
                3
              </span>
              <span className={step === 'datetime' ? 'text-[#2D1F27] font-semibold' : ''}>
                Data/Hora
              </span>
            </div>

            <ChevronRight className="w-4 h-4 text-[#EAD9D3]" />

            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  step === 'details'
                    ? 'bg-[#C4837A] text-white'
                    : 'bg-[#F2E0DC] text-[#A86B62]'
                }`}
              >
                4
              </span>
              <span className={step === 'details' ? 'text-[#2D1F27] font-semibold' : ''}>
                Seus Dados
              </span>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ETAPA 1: ESCOLHA DO SERVIÇO */}
        {/* ========================================================================= */}
        {step === 'service' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-serif font-bold text-[#2D1F27]">Selecione o Serviço</h2>
              <p className="text-xs text-[#9B8985]">
                Escolha o procedimento desejado para visualizar a disponibilidade.
              </p>
            </div>

            {services.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-2xl border border-[#EAD9D3]">
                <Scissors className="w-8 h-8 text-[#9B8985] mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium text-[#2D1F27]">
                  Nenhum serviço disponível no momento.
                </p>
                <p className="text-xs text-[#9B8985] mt-1">
                  Entre em contato diretamente com o estabelecimento.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {services.map((srv) => {
                  const isSelected = selectedService?.id === srv.id;
                  return (
                    <div
                      key={srv.id}
                      onClick={() => {
                        setSelectedService(srv);
                        setStep('professional');
                      }}
                      className={`p-4 rounded-2xl bg-white border cursor-pointer transition-all hover:border-[#C4837A] hover:shadow-xs flex flex-col justify-between ${
                        isSelected
                          ? 'border-[#C4837A] ring-2 ring-[#C4837A]/20 bg-[#FAF6F3]'
                          : 'border-[#EAD9D3]'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="text-xs uppercase tracking-wider font-semibold text-[#A86B62]">
                            {srv.category}
                          </span>
                          <span className="text-xs font-semibold text-[#2D1F27]">
                            {formatCurrency(srv.price)}
                          </span>
                        </div>
                        <h3 className="text-sm font-semibold text-[#2D1F27] line-clamp-1">
                          {srv.name}
                        </h3>
                        {srv.description && (
                          <p className="text-xs text-[#9B8985] mt-1 line-clamp-2">
                            {srv.description}
                          </p>
                        )}
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-[#F5EDE8] flex items-center justify-between text-xs text-[#9B8985]">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {srv.duration_minutes} min
                        </span>
                        <span className="text-[#C4837A] font-medium flex items-center gap-0.5">
                          Escolher <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* ETAPA 2: ESCOLHA DO PROFISSIONAL */}
        {/* ========================================================================= */}
        {step === 'professional' && selectedService && (
          <div className="space-y-4">
            <button
              onClick={() => setStep('service')}
              className="inline-flex items-center gap-1 text-xs text-[#A86B62] font-medium hover:underline"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Trocar de Serviço ({selectedService.name})
            </button>

            <div>
              <h2 className="text-lg font-serif font-bold text-[#2D1F27]">
                Escolha o Profissional
              </h2>
              <p className="text-xs text-[#9B8985]">
                Selecione o profissional de sua preferência ou clique em &quot;Qualquer profissional disponível&quot;.
              </p>
            </div>

            <div className="space-y-3">
              {/* Opção Rápida: Qualquer Profissional */}
              <div
                onClick={() => {
                  setIsAnyProfessional(true);
                  setSelectedProfessional(null);
                  setStep('datetime');
                  handleLoadSlots(selectedService.id, null, selectedDate);
                }}
                className={`p-4 rounded-2xl bg-white border cursor-pointer transition-all hover:border-[#C4837A] flex items-center justify-between ${
                  isAnyProfessional
                    ? 'border-[#C4837A] ring-2 ring-[#C4837A]/20 bg-[#FAF6F3]'
                    : 'border-[#EAD9D3]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#F2E0DC] text-[#A86B62] flex items-center justify-center font-bold text-sm">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[#2D1F27]">
                      Primeiro horário disponível
                    </h3>
                    <p className="text-xs text-[#9B8985]">
                      Qualquer profissional habilitado para {selectedService.name}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#C4837A]" />
              </div>

              {/* Lista de Profissionais Aptos */}
              {qualifiedProfessionals.map((prof) => {
                const isSelected = selectedProfessional?.id === prof.id && !isAnyProfessional;
                return (
                  <div
                    key={prof.id}
                    onClick={() => {
                      setIsAnyProfessional(false);
                      setSelectedProfessional(prof);
                      setStep('datetime');
                      handleLoadSlots(selectedService.id, prof.id, selectedDate);
                    }}
                    className={`p-4 rounded-2xl bg-white border cursor-pointer transition-all hover:border-[#C4837A] flex items-center justify-between ${
                      isSelected
                        ? 'border-[#C4837A] ring-2 ring-[#C4837A]/20 bg-[#FAF6F3]'
                        : 'border-[#EAD9D3]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#F5EDE8] text-[#2C1810] flex items-center justify-center font-semibold text-sm border border-[#EAD9D3]">
                        {prof.full_name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-[#2D1F27]">
                          {prof.full_name}
                        </h3>
                        <p className="text-xs text-[#A86B62] font-medium">{prof.specialty}</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#C4837A]" />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ETAPA 3: ESCOLHA DE DATA E HORÁRIO */}
        {/* ========================================================================= */}
        {step === 'datetime' && selectedService && (
          <div className="space-y-5">
            <button
              onClick={() => setStep('professional')}
              className="inline-flex items-center gap-1 text-xs text-[#A86B62] font-medium hover:underline"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar aos Profissionais
            </button>

            {/* Resumo da Seleção Atual */}
            <div className="p-3.5 rounded-xl bg-white border border-[#EAD9D3] flex items-center justify-between text-xs">
              <div>
                <span className="text-[#9B8985]">Serviço: </span>
                <span className="font-semibold text-[#2D1F27]">{selectedService.name}</span>
                <span className="text-[#9B8985] ml-2">({selectedService.duration_minutes} min)</span>
              </div>
              <div>
                <span className="text-[#9B8985]">Com: </span>
                <span className="font-semibold text-[#2D1F27]">
                  {isAnyProfessional ? 'Primeiro Disponível' : selectedProfessional?.full_name}
                </span>
              </div>
            </div>

            {/* Seletor de Datas Rápido */}
            <div>
              <label className="block text-xs font-semibold text-[#2D1F27] mb-2">
                Selecione o Dia
              </label>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                {getNextDays().map((day) => {
                  const isDaySelected = selectedDate === day.iso;
                  return (
                    <button
                      key={day.iso}
                      type="button"
                      onClick={() => {
                        setSelectedDate(day.iso);
                        if (selectedService) {
                          const profId = isAnyProfessional || !selectedProfessional ? null : selectedProfessional.id;
                          handleLoadSlots(selectedService.id, profId, day.iso);
                        }
                      }}
                      className={`flex-shrink-0 flex flex-col items-center justify-center w-16 py-3 rounded-2xl border text-center transition-all ${
                        isDaySelected
                          ? 'bg-[#C4837A] text-white border-[#C4837A] shadow-xs scale-102'
                          : 'bg-white text-[#2C1810] border-[#EAD9D3] hover:border-[#C4837A]'
                      }`}
                    >
                      <span className="text-[10px] uppercase font-bold tracking-wider opacity-80">
                        {day.weekday}
                      </span>
                      <span className="text-base font-bold my-0.5">{day.dayNum}</span>
                      <span className="text-[10px] capitalize opacity-80">{day.month}</span>
                    </button>
                  );
                })}
              </div>

              {/* Input de Data Customizada */}
              <div className="mt-2.5 flex items-center gap-2">
                <span className="text-xs text-[#9B8985]">Ou escolha outra data:</span>
                <input
                  type="date"
                  value={selectedDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => {
                    const newDate = e.target.value;
                    setSelectedDate(newDate);
                    if (selectedService && newDate) {
                      const profId = isAnyProfessional || !selectedProfessional ? null : selectedProfessional.id;
                      handleLoadSlots(selectedService.id, profId, newDate);
                    }
                  }}
                  className="px-2.5 py-1 text-xs rounded-lg border border-[#EAD9D3] bg-white focus:outline-hidden focus:border-[#C4837A]"
                />
              </div>
            </div>

            {/* Grade de Horários Livres */}
            <div>
              <label className="block text-xs font-semibold text-[#2D1F27] mb-2 flex items-center justify-between">
                <span>Horários Disponíveis</span>
                {loadingSlots && (
                  <span className="text-xs text-[#A86B62] flex items-center gap-1 font-normal">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verificando agenda...
                  </span>
                )}
              </label>

              {slotError && !loadingSlots && (
                <div className="p-6 text-center bg-white rounded-2xl border border-[#EAD9D3] text-xs text-[#9B8985]">
                  <Calendar className="w-6 h-6 mx-auto mb-2 opacity-40 text-[#A86B62]" />
                  {slotError}
                </div>
              )}

              {!loadingSlots && availableSlots.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                  {availableSlots.map((slot, idx) => {
                    const isSlotSelected =
                      selectedSlot?.slot_time === slot.slot_time &&
                      selectedSlot?.professional_id === slot.professional_id;

                    return (
                      <button
                        key={`${slot.slot_time}-${slot.professional_id}-${idx}`}
                        type="button"
                        onClick={() => {
                          setSelectedSlot(slot);
                          setStep('details');
                        }}
                        className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                          isSlotSelected
                            ? 'bg-[#2D1F27] text-white border-[#2D1F27] shadow-xs'
                            : 'bg-white text-[#2D1F27] border-[#EAD9D3] hover:border-[#C4837A] hover:bg-[#FAF6F3]'
                        }`}
                      >
                        <span className="text-sm font-bold block">{slot.slot_time}</span>
                        {isAnyProfessional && (
                          <span className="text-[10px] text-[#A86B62] block truncate mt-0.5">
                            {slot.professional_name.split(' ')[0]}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ETAPA 4: DADOS DO CLIENTE E CONFIRMAÇÃO */}
        {/* ========================================================================= */}
        {step === 'details' && selectedService && selectedSlot && (
          <div className="space-y-5">
            <button
              onClick={() => setStep('datetime')}
              className="inline-flex items-center gap-1 text-xs text-[#A86B62] font-medium hover:underline"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Trocar Data ou Horário
            </button>

            <div>
              <h2 className="text-lg font-serif font-bold text-[#2D1F27]">
                Confirmação do Agendamento
              </h2>
              <p className="text-xs text-[#9B8985]">
                Informe seus dados para finalizarmos sua reserva. Não é necessário criar senha.
              </p>
            </div>

            {/* Card de Resumo do Atendimento */}
            <div className="p-4 rounded-2xl bg-white border border-[#EAD9D3] space-y-3">
              <div className="flex items-start justify-between border-b border-[#F5EDE8] pb-3">
                <div>
                  <h3 className="text-sm font-bold text-[#2D1F27]">{selectedService.name}</h3>
                  <p className="text-xs text-[#9B8985] mt-0.5">
                    Profissional: {selectedSlot.professional_name}
                  </p>
                </div>
                <span className="text-base font-bold text-[#A86B62]">
                  {formatCurrency(selectedService.price)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex items-center gap-2 text-[#2D1F27]">
                  <Calendar className="w-4 h-4 text-[#C4837A]" />
                  <span>{formatAppointmentDate(`${selectedDate}T12:00:00Z`)}</span>
                </div>
                <div className="flex items-center gap-2 text-[#2D1F27]">
                  <Clock className="w-4 h-4 text-[#C4837A]" />
                  <span>
                    {selectedSlot.slot_time} ({selectedService.duration_minutes} min)
                  </span>
                </div>
              </div>
            </div>

            {/* Formulário de Identificação do Cliente */}
            <div className="p-5 rounded-2xl bg-white border border-[#EAD9D3] space-y-4">
              <h3 className="text-xs uppercase tracking-wider font-bold text-[#A86B62]">
                Dados do Cliente
              </h3>

              {submitError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{submitError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#2D1F27] mb-1">
                  Seu Nome Completo *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#9B8985] absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    placeholder="Ex: Maria da Silva"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 text-xs rounded-xl border border-[#EAD9D3] bg-[#FDFAF8] focus:outline-hidden focus:border-[#C4837A] focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#2D1F27] mb-1">
                  WhatsApp com DDD *
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-[#9B8985] absolute left-3 top-3" />
                  <input
                    type="tel"
                    required
                    placeholder="(11) 98765-4321"
                    value={clientWhatsapp}
                    onChange={(e) => setClientWhatsapp(maskPhone(e.target.value))}
                    className="w-full pl-9 pr-3 py-2.5 text-xs rounded-xl border border-[#EAD9D3] bg-[#FDFAF8] focus:outline-hidden focus:border-[#C4837A] focus:bg-white"
                  />
                </div>
                <p className="text-[11px] text-[#9B8985] mt-1">
                  Usado para confirmação e lembretes do seu horário.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#2D1F27] mb-1">
                  E-mail (opcional)
                </label>
                <input
                  type="email"
                  placeholder="seuemail@exemplo.com"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  className="w-full px-3 py-2.5 text-xs rounded-xl border border-[#EAD9D3] bg-[#FDFAF8] focus:outline-hidden focus:border-[#C4837A] focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#2D1F27] mb-1">
                  Observações ou Recomendações (opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Alguma alergia, preferência ou observação para a equipe?"
                  value={clientNotes}
                  onChange={(e) => setClientNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[#EAD9D3] bg-[#FDFAF8] focus:outline-hidden focus:border-[#C4837A] focus:bg-white resize-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  disabled={isPending || !clientName.trim() || clientWhatsapp.replace(/\D/g, '').length < 10}
                  onClick={handleConfirmBooking}
                  className="w-full py-3.5 px-4 rounded-xl bg-[#C4837A] hover:bg-[#A86B62] text-white text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xs flex items-center justify-center gap-2"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Garantindo sua vaga...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Confirmar Agendamento
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ETAPA 5: SUCESSO E RESUMO DO AGENDAMENTO */}
        {/* ========================================================================= */}
        {step === 'success' && bookingResult && (
          <div className="max-w-lg mx-auto text-center space-y-6 pt-6">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
            </div>

            <div>
              <h2 className="text-xl font-serif font-bold text-[#2D1F27]">
                Horário Reservado com Sucesso!
              </h2>
              <p className="text-xs text-[#9B8985] mt-1">
                Seu agendamento foi registrado com segurança na agenda da clínica.
              </p>
            </div>

            {/* Card com Detalhes da Reserva */}
            <div className="p-5 rounded-2xl bg-white border border-[#EAD9D3] text-left space-y-3.5 shadow-xs">
              <div className="border-b border-[#F5EDE8] pb-3">
                <span className="text-[10px] uppercase font-bold text-[#A86B62] tracking-wider">
                  Estabelecimento
                </span>
                <p className="text-sm font-bold text-[#2D1F27]">{bookingResult.tenantName}</p>
                {tenant.settings?.address && (
                  <p className="text-xs text-[#9B8985] flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3.5 h-3.5 text-[#C4837A]" />
                    {tenant.settings.address}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[#9B8985] block">Serviço:</span>
                  <span className="font-semibold text-[#2D1F27]">
                    {bookingResult.serviceName}
                  </span>
                </div>
                <div>
                  <span className="text-[#9B8985] block">Profissional:</span>
                  <span className="font-semibold text-[#2D1F27]">
                    {bookingResult.professionalName}
                  </span>
                </div>
                <div>
                  <span className="text-[#9B8985] block">Data:</span>
                  <span className="font-semibold text-[#2D1F27]">
                    {bookingResult.startTime && formatAppointmentDate(bookingResult.startTime)}
                  </span>
                </div>
                <div>
                  <span className="text-[#9B8985] block">Horário:</span>
                  <span className="font-semibold text-[#2D1F27]">
                    {bookingResult.startTime && formatAppointmentTime(bookingResult.startTime)}
                  </span>
                </div>
                <div>
                  <span className="text-[#9B8985] block">Cliente:</span>
                  <span className="font-semibold text-[#2D1F27]">
                    {bookingResult.clientName}
                  </span>
                </div>
                <div>
                  <span className="text-[#9B8985] block">Valor:</span>
                  <span className="font-bold text-[#A86B62]">
                    {bookingResult.price ? formatCurrency(bookingResult.price) : 'Consulte'}
                  </span>
                </div>
              </div>
            </div>

            {/* Ações pós-agendamento */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedService(null);
                  setSelectedProfessional(null);
                  setSelectedSlot(null);
                  setBookingResult(null);
                  setStep('service');
                }}
                className="py-3 px-5 rounded-xl border border-[#EAD9D3] bg-white hover:bg-[#FAF6F3] text-xs font-semibold text-[#2D1F27] transition-colors"
              >
                Fazer Outro Agendamento
              </button>

              {tenant.settings?.whatsapp && (
                <a
                  href={`https://wa.me/55${tenant.settings.whatsapp.replace(/\D/g, '')}?text=Olá,%20acabei%20de%20agendar%20um%20horário%20pelo%20site%20para%20${encodeURIComponent(
                    bookingResult.serviceName || 'um atendimento'
                  )}.`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-3 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                >
                  <MessageCircle className="w-4 h-4" />
                  Avisar Estabelecimento no WhatsApp
                </a>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Rodapé Minimalista */}
      <footer className="border-t border-[#EAD9D3] bg-white py-4 text-center text-xs text-[#9B8985]">
        <div className="max-w-3xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>{tenant.name} &bull; Agendamento Online</span>
          <span className="flex items-center gap-1 text-[11px]">
            Powered by <strong className="text-[#A86B62]">BELVIA</strong>
          </span>
        </div>
      </footer>
    </div>
  );
}
