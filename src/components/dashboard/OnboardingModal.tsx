'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Building2,
  Users,
  Scissors,
  UserPlus,
  Globe,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
  Copy,
  Check,
  X,
  Loader2,
} from 'lucide-react';
import { OnboardingProgress, dismissOnboardingAction, markPublicPageSharedAction } from '@/lib/actions/onboarding';

interface OnboardingModalProps {
  tenantSlug: string;
  tenantName: string;
  isOwner: boolean;
  progress?: OnboardingProgress | null;
}

const DEFAULT_ONBOARDING_PROGRESS: OnboardingProgress = {
  hasConfiguredBusiness: false,
  hasProfessionals: false,
  hasServices: false,
  hasClients: false,
  hasSharedPublicPage: false,
  isDismissed: false,
  completedCount: 0,
  totalSteps: 5,
};

export function OnboardingModal({
  tenantSlug,
  tenantName,
  isOwner,
  progress: initialProgressProp,
}: OnboardingModalProps) {
  const router = useRouter();
  const initialProgress = initialProgressProp || DEFAULT_ONBOARDING_PROGRESS;
  const [progress, setProgress] = useState<OnboardingProgress>(initialProgress);
  // Abre automaticamente se for owner, não tiver sido dispensado e ainda faltar alguma etapa
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    return isOwner && !initialProgress.isDismissed && initialProgress.completedCount < initialProgress.totalSteps;
  });

  const [isPending, startTransition] = useTransition();
  const [copiedLink, setCopiedLink] = useState(false);

  // Link público real da vitrine do tenant
  const publicUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/p/${tenantSlug}`
    : `https://zelunia.com.br/p/${tenantSlug}`;

  // Se não for owner, não exibe o modal nem o gatilho de reabertura
  if (!isOwner) return null;

  const handleNavigate = (path: string) => {
    setIsOpen(false);
    router.push(path);
  };

  const handleDismiss = () => {
    startTransition(async () => {
      await dismissOnboardingAction(tenantSlug);
      setIsOpen(false);
      setProgress((prev) => ({ ...prev, isDismissed: true }));
    });
  };

  const handleCopyPublicLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);

      if (!progress.hasSharedPublicPage) {
        startTransition(async () => {
          await markPublicPageSharedAction(tenantSlug);
          setProgress((prev) => ({
            ...prev,
            hasSharedPublicPage: true,
            completedCount: prev.completedCount + 1,
          }));
        });
      }
    } catch {
      // Fallback simples
    }
  };

  const handleOpenPublicPage = () => {
    if (!progress.hasSharedPublicPage) {
      startTransition(async () => {
        await markPublicPageSharedAction(tenantSlug);
        setProgress((prev) => ({
          ...prev,
          hasSharedPublicPage: true,
          completedCount: prev.completedCount + 1,
        }));
      });
    }
    window.open(publicUrl, '_blank', 'noopener,noreferrer');
  };

  const percentComplete = Math.round((progress.completedCount / progress.totalSteps) * 100);

  const checklistItems = [
    {
      id: 'business',
      title: 'Configurar negócio e identidade',
      desc: 'Defina dados do espaço, contatos e logomarca para exibição na vitrine e relatórios.',
      href: `/${tenantSlug}/configuracoes?tab=booking`,
      btnText: 'Configurar Negócio',
      completed: progress.hasConfiguredBusiness,
      icon: Building2,
    },
    {
      id: 'professionals',
      title: 'Cadastrar equipe e profissionais',
      desc: 'Adicione os profissionais que realizam atendimentos no seu estabelecimento.',
      href: `/${tenantSlug}/profissionais`,
      btnText: 'Cadastrar Equipe',
      completed: progress.hasProfessionals,
      icon: Users,
    },
    {
      id: 'services',
      title: 'Cadastrar serviços e preços',
      desc: 'Monte seu catálogo oficial com procedimentos, tempos de duração e valores.',
      href: `/${tenantSlug}/servicos`,
      btnText: 'Cadastrar Serviços',
      completed: progress.hasServices,
      icon: Scissors,
    },
    {
      id: 'clients',
      title: 'Cadastrar primeiros clientes',
      desc: 'Registre sua base de clientes para facilitar agendamentos e prontuários.',
      href: `/${tenantSlug}/clientes`,
      btnText: 'Cadastrar Clientes',
      completed: progress.hasClients,
      icon: UserPlus,
    },
    {
      id: 'public_page',
      title: 'Conhecer e compartilhar página pública',
      desc: 'Sua vitrine online com catálogo e agendamento para compartilhar no WhatsApp e Instagram.',
      customAction: true,
      completed: progress.hasSharedPublicPage,
      icon: Globe,
    },
  ];

  return (
    <>
      {/* Botão de Reabertura Discreto na Dashboard (Caso o usuário queira consultar o checklist) */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-[#EADBCE] text-xs font-semibold text-[#665048] hover:text-[#2C1810] hover:border-[#B87070] shadow-2xs transition-all"
        title="Guia de primeiros passos"
      >
        <Sparkles className="w-3.5 h-3.5 text-[#B87070]" />
        <span>Primeiros Passos</span>
        <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#F2E0DC] text-[#B87070]">
          {progress.completedCount}/{progress.totalSteps}
        </span>
      </button>

      {/* Modal Overlay e Conteúdo */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-xl max-h-[92vh] flex flex-col rounded-3xl bg-[#FAF6F3] border border-[#EAD9D3] shadow-2xl overflow-hidden animate-in zoom-in-95">
            {/* Topo Elegante com Estilo ZELUNIA */}
            <div className="relative p-6 sm:p-7 bg-[#2D1F27] text-white shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#B87070]/30 border border-[#B87070]/40 text-[#F2E0DC] text-[11px] font-semibold mb-2.5">
                    <Sparkles className="w-3 h-3 text-[#E8D1CA]" />
                    <span>Primeiro Acesso ao Sistema</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-serif font-bold text-[#F2E0DC] tracking-tight">
                    Bem-vinda à ZELUNIA!
                  </h2>
                  <p className="text-xs sm:text-sm text-[#CDB8B0] mt-1 max-w-md">
                    Preparamos este roteiro com as 5 etapas essenciais para deixar a{' '}
                    <strong className="text-white">{tenantName}</strong> pronta para atender com excelência.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleDismiss}
                  disabled={isPending}
                  className="p-1.5 rounded-xl text-[#CDB8B0] hover:text-white hover:bg-white/10 transition-colors"
                  title="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Barra de Progresso Real */}
              <div className="mt-5 pt-4 border-t border-white/10">
                <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
                  <span className="text-[#E8D1CA]">Progresso de Configuração</span>
                  <span className="text-white font-bold">{progress.completedCount} de {progress.totalSteps} concluídas ({percentComplete}%)</span>
                </div>
                <div className="w-full h-2 rounded-full bg-black/40 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${percentComplete}%`,
                      backgroundColor: '#B87070',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Lista das 5 Etapas (Rolável) */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3">
              {checklistItems.map((item, index) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      item.completed
                        ? 'bg-emerald-50/70 border-emerald-200/80'
                        : 'bg-white border-[#EADBCE]/80 shadow-2xs hover:border-[#B87070]/60'
                    }`}
                  >
                    <div className="flex items-start gap-3.5">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold ${
                          item.completed
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-[#F5EDE8] text-[#B87070]'
                        }`}
                      >
                        {item.completed ? (
                          <Check className="w-4 h-4 stroke-[3]" />
                        ) : (
                          <span>{index + 1}</span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Icon className="w-3.5 h-3.5 text-[#B87070] shrink-0" />
                            <h3
                              className={`text-xs sm:text-sm font-bold ${
                                item.completed ? 'text-emerald-950 line-through opacity-80' : 'text-[#2C1810]'
                              }`}
                            >
                              {item.title}
                            </h3>
                          </div>
                          {item.completed && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full shrink-0">
                              <CheckCircle2 className="w-3 h-3" />
                              Concluído
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-[#7D6B65] mt-1 leading-relaxed">
                          {item.desc}
                        </p>

                        {/* Ações por etapa */}
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          {item.customAction ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={handleCopyPublicLink}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#EADBCE] bg-[#FAF6F3] hover:bg-[#F2E0DC] text-xs font-semibold text-[#2C1810] transition-colors"
                              >
                                {copiedLink ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Link Copiado!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5 text-[#B87070]" />
                                    <span>Copiar Link</span>
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={handleOpenPublicPage}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#B87070] hover:bg-[#A86B62] text-white text-xs font-semibold shadow-2xs transition-colors"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span>Abrir Minha Página</span>
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleNavigate(item.href || `/${tenantSlug}`)}
                              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                                item.completed
                                  ? 'border border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-50'
                                  : 'bg-[#B87070] hover:bg-[#A86B62] text-white shadow-2xs'
                              }`}
                            >
                              <span>{item.completed ? 'Revisar' : item.btnText}</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Rodapé com "Fazer Depois" e Finalização */}
            <div className="p-4 sm:p-5 border-t border-[#EADBCE] bg-white flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={handleDismiss}
                disabled={isPending}
                className="text-xs font-semibold text-[#8C7A74] hover:text-[#2C1810] px-2 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                Fazer depois
              </button>

              <button
                type="button"
                onClick={handleDismiss}
                disabled={isPending}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2D1F27] hover:bg-[#3D2A34] text-white text-xs sm:text-sm font-semibold shadow-sm transition-all"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>
                  {progress.completedCount === progress.totalSteps
                    ? 'Tudo Pronto! Acessar Dashboard'
                    : 'Entendido, ir para o Dashboard'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
