import Link from 'next/link';
import { ShieldAlert, CreditCard, Check, ArrowRight, Lock } from 'lucide-react';
import { PlanType } from '@/types/tenant';
import { PLAN_CONFIGS } from '@/types/plans';

interface TrialExpiredViewProps {
  tenantSlug: string;
  tenantName: string;
  plan: PlanType;
  trialEndsAt?: string | null;
  canManage: boolean;
}

export function TrialExpiredView({
  tenantSlug,
  tenantName,
  plan,
  trialEndsAt,
  canManage,
}: TrialExpiredViewProps) {
  const currentPlan = PLAN_CONFIGS[plan] || PLAN_CONFIGS.essential;
  const isEssential = plan === 'essential';
  const alternativePlan = isEssential ? PLAN_CONFIGS.smart : PLAN_CONFIGS.essential;

  const formattedTrialDate = trialEndsAt
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(trialEndsAt))
    : 'recentemente';

  return (
    <div className="min-h-[82vh] flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-3xl bg-white rounded-3xl shadow-xl border border-[#EAD9D3] overflow-hidden">
        {/* Banner Superior com Destaque Elegante Terracota */}
        <div className="bg-gradient-to-r from-[#35272D] via-[#433139] to-[#35272D] text-white p-6 sm:p-8 text-center relative overflow-hidden">
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-xs flex items-center justify-center border border-white/20 mb-4 shadow-inner">
              <Lock className="w-8 h-8 text-[#E8D1CA]" />
            </div>

            <span className="text-[11px] font-bold tracking-widest uppercase px-3 py-1 rounded-full bg-[#B87070] text-white shadow-2xs mb-2">
              Período de Demonstração Finalizado
            </span>

            <h1 className="text-2xl sm:text-3xl font-serif font-normal text-[#FCF8F5]">
              Período gratuito encerrado
            </h1>

            <p className="text-xs sm:text-sm text-[#D8C4BC] max-w-xl mt-2 leading-relaxed">
              O período de testes de 7 dias do <strong className="text-white font-semibold">{tenantName}</strong> chegou ao fim em {formattedTrialDate}. Seus dados, histórico de clientes e agendamentos continuam 100% seguros e preservados.
            </p>
          </div>
        </div>

        {/* Corpo com Detalhes do Plano Escolhido e Opção de Regularização */}
        <div className="p-6 sm:p-10 space-y-8 bg-[#FAF6F4]/40">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Card do Plano Atual Contratado */}
            <div className="p-6 rounded-2xl bg-white border-2 border-[#C4837A] shadow-md flex flex-col justify-between relative">
              <div className="absolute -top-3 right-6 bg-[#C4837A] text-white text-[10px] font-bold tracking-wider uppercase px-3 py-0.5 rounded-full shadow-2xs">
                Seu Plano Selecionado
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-serif font-bold text-[#2C1810]">
                    Plano {currentPlan.name}
                  </h3>
                  <p className="text-xs text-[#7D6B65] mt-1">
                    {isEssential
                      ? 'Ideal para profissionais autônomos e estúdios'
                      : 'Equipe completa, recepção inteligente e comissões'}
                  </p>
                </div>

                <div className="pt-2">
                  <span className="text-3xl font-serif font-bold text-[#2C1810]">
                    R$ {currentPlan.priceMonthly.toFixed(2).replace('.', ',')}
                  </span>
                  <span className="text-xs text-[#9B8985]"> / mês</span>
                </div>

                <ul className="space-y-2.5 pt-2 text-xs text-[#5D4E48]">
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#C4837A] shrink-0" />
                    <span>
                      {currentPlan.limits.maxProfessionals === 1
                        ? '1 Profissional atendendo'
                        : `Até ${currentPlan.limits.maxProfessionals} profissionais na equipe`}
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#C4837A] shrink-0" />
                    <span>Agenda completa, histórico e controle financeiro</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#C4837A] shrink-0" />
                    <span>Fichas de anamnese personalizadas</span>
                  </li>
                  {!isEssential && (
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-[#C4837A] shrink-0" />
                      <span>Comissões automáticas e relatórios gerenciais</span>
                    </li>
                  )}
                </ul>
              </div>

              <div className="pt-6">
                {canManage ? (
                  <Link
                    href={`/${tenantSlug}/configuracoes?tab=subscription`}
                    className="w-full inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl text-sm font-semibold text-white transition-all shadow-sm hover:opacity-95"
                    style={{ backgroundColor: 'var(--belvia-rose)' }}
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Ativar Assinatura Agora</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                ) : (
                  <p className="text-xs text-center text-[#9B8985] p-2 bg-[#FAF0ED] rounded-xl">
                    Solicite ao proprietário ou administrador do estabelecimento a regularização da assinatura.
                  </p>
                )}
              </div>
            </div>

            {/* Comparativo / Opção Alternativa */}
            <div className="p-6 rounded-2xl bg-white border border-[#EAD9D3] shadow-xs flex flex-col justify-between">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-serif font-semibold text-[#2C1810]">
                    Ou migre para o Plano {alternativePlan.name}
                  </h3>
                  <p className="text-xs text-[#7D6B65] mt-1">
                    {alternativePlan.id === 'smart'
                      ? 'Desbloqueie múltiplos profissionais e automação avançada'
                      : 'Estrutura compacta e econômica para atendimento individual'}
                  </p>
                </div>

                <div className="pt-2">
                  <span className="text-2xl font-serif font-bold text-[#2C1810]">
                    R$ {alternativePlan.priceMonthly.toFixed(2).replace('.', ',')}
                  </span>
                  <span className="text-xs text-[#9B8985]"> / mês</span>
                </div>

                <p className="text-xs text-[#6B5A54] leading-relaxed pt-2">
                  Você pode alterar seu plano a qualquer momento diretamente na aba Minha Assinatura, escolhendo pagamento via Pix ou Cartão de Crédito com conciliação automática.
                </p>

                <div className="p-3.5 rounded-xl bg-[#FAF0ED]/60 border border-[#EAD9D3] text-[11px] text-[#7D6B65] space-y-1">
                  <div className="font-semibold text-[#2C1810] flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-[#C4837A]" />
                    <span>Seus dados continuam intactos</span>
                  </div>
                  <p>
                    Nenhum cliente, prontuário ou histórico é removido. Assim que o pagamento for confirmado, todas as ferramentas serão liberadas instantaneamente.
                  </p>
                </div>
              </div>

              <div className="pt-6">
                {canManage ? (
                  <Link
                    href={`/${tenantSlug}/configuracoes?tab=subscription`}
                    className="w-full inline-flex items-center justify-center py-2.5 px-4 rounded-xl text-xs font-semibold text-[#2C1810] bg-[#FAF6F3] border border-[#EAD9D3] hover:bg-white hover:border-[#C4837A] transition-all"
                  >
                    Ver detalhes de pagamento e planos
                  </Link>
                ) : null}
              </div>
            </div>
          </div>

          {/* Rodapé Informativo */}
          <div className="text-center pt-2 border-t border-[#EAD9D3]/70">
            <p className="text-[11px] text-[#9B8985]">
              Dúvidas sobre faturamento ou cobranças corporativas? Entre em contato com o suporte da plataforma ZELUNIA.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
