'use client';

import React from 'react';
import { PaymentOrder, PAYMENT_METHOD_LABELS } from '@/types/financial';
import { Appointment } from '@/types/appointments';
import { X, Printer, CheckCircle, Receipt, AlertCircle } from 'lucide-react';

interface PaymentReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: PaymentOrder;
  appointment: Appointment;
  tenantName: string;
}

export function PaymentReceiptModal({
  isOpen,
  onClose,
  order,
  appointment,
  tenantName,
}: PaymentReceiptModalProps) {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const formattedDate = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header - Não impresso */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 print:hidden">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-base">
                Comprovante de Pagamento
              </h3>
              <p className="text-xs text-zinc-500">Documento Não Fiscal</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo Imprimível do Recibo */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm print:p-0">
          {/* Alerta de Documento Não Fiscal */}
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300 print:border print:border-zinc-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              <strong>DOCUMENTO NÃO FISCAL:</strong> Este recibo tem finalidade exclusivamente operacional e comprobatória de quitação de atendimento.
            </span>
          </div>

          {/* Cabeçalho do Recibo */}
          <div className="border-b border-dashed border-zinc-200 dark:border-zinc-700 pb-4 text-center space-y-1">
            <h2 className="text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-100 uppercase">
              {tenantName}
            </h2>
            <p className="text-xs text-zinc-500">Comprovante de Recebimento de Serviços</p>
            <p className="text-[11px] text-zinc-400 font-mono">Emissão: {formattedDate}</p>
          </div>

          {/* Dados do Cliente e Procedimento */}
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-500">Cliente:</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {appointment.client?.full_name || 'Cliente'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-500">Serviço:</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {appointment.service?.name || 'Procedimento'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-500">Profissional:</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {appointment.professional?.full_name || 'Profissional'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-500">Ordem de Cobrança Nº:</span>
              <span className="font-mono text-zinc-700 dark:text-zinc-300">
                #{order.id.slice(0, 8).toUpperCase()}
              </span>
            </div>
          </div>

          {/* Resumo Financeiro */}
          <div className="bg-zinc-50 dark:bg-zinc-800/40 p-4 rounded-xl space-y-2 text-xs border border-zinc-200 dark:border-zinc-700/60">
            <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
              <span>Valor Bruto do Procedimento:</span>
              <span>R$ {Number(order.gross_amount).toFixed(2)}</span>
            </div>
            {Number(order.discount_amount) > 0 && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                <span>Desconto Concedido:</span>
                <span>- R$ {Number(order.discount_amount).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-zinc-900 dark:text-zinc-100 font-bold pt-1 border-t border-zinc-200 dark:border-zinc-700">
              <span>Total Líquido Devido:</span>
              <span>R$ {Number(order.net_amount).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold">
              <span>Total Efetivamente Pago:</span>
              <span>R$ {Number(order.paid_amount).toFixed(2)}</span>
            </div>
            {Number(order.balance_due) > 0 && (
              <div className="flex justify-between text-amber-600 dark:text-amber-400 font-bold pt-1 border-t border-dashed border-zinc-300 dark:border-zinc-700">
                <span>Saldo Pendente:</span>
                <span>R$ {Number(order.balance_due).toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Discriminação dos Pagamentos */}
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              Transações Realizadas ({order.transactions?.length || 0})
            </span>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800 text-xs border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden">
              {(order.transactions || []).map((t, idx) => (
                <div key={t.id || idx} className="p-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                    <div>
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                        {PAYMENT_METHOD_LABELS[t.method] || t.method}
                      </span>
                      <p className="text-[10px] text-zinc-400">
                        {new Date(t.paid_at).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                    R$ {Number(t.amount).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Rodapé do Recibo */}
          <div className="text-center pt-4 border-t border-dashed border-zinc-200 dark:border-zinc-700 space-y-1">
            <p className="text-[11px] text-zinc-500">Obrigado pela preferência!</p>
            <p className="text-[10px] text-zinc-400">ZELUNIA Clinic Management • Documento interno não fiscal</p>
          </div>
        </div>

        {/* Footer com Botões - Oculto na Impressão */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/20 print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 rounded-lg transition-opacity shadow-sm"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimir Comprovante
          </button>
        </div>
      </div>
    </div>
  );
}
