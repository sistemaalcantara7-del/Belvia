'use client';

import React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Lock,
  Sparkles,
  ArrowUpRight,
  ShieldAlert,
  AlertCircle,
  X,
} from 'lucide-react';

export type ActionErrorType =
  | 'plan_limit'
  | 'permission'
  | 'subscription_suspended'
  | 'validation'
  | 'technical';

export interface ActionFeedbackProps {
  error: string | null;
  tenantSlug: string;
  onDismiss?: () => void;
  className?: string;
}

export function categorizeActionError(errorMessage: string | null): ActionErrorType {
  if (!errorMessage) return 'technical';
  const lower = errorMessage.toLowerCase();

  if (
    lower.includes('limite do seu plano') ||
    lower.includes('limite atingido') ||
    lower.includes('faça upgrade') ||
    lower.includes('upgrade para') ||
    lower.includes('plano essencial') ||
    lower.includes('plano inteligente') ||
    lower.includes('cota')
  ) {
    return 'plan_limit';
  }

  if (
    lower.includes('acesso negado') ||
    lower.includes('não autorizado') ||
    lower.includes('sem permissão') ||
    lower.includes('apenas administradores') ||
    lower.includes('não tem permissão')
  ) {
    return 'permission';
  }

  if (
    lower.includes('assinatura') &&
    (lower.includes('suspens') || lower.includes('atraso') || lower.includes('inadimpl') || lower.includes('expirada'))
  ) {
    return 'subscription_suspended';
  }

  if (
    lower.includes('obrigatório') ||
    lower.includes('inválid') ||
    lower.includes('deve ter') ||
    lower.includes('inconsistente') ||
    lower.includes('preencha') ||
    lower.includes('selecione')
  ) {
    return 'validation';
  }

  return 'technical';
}

export function ActionFeedbackAlert({
  error,
  tenantSlug,
  onDismiss,
  className = '',
}: ActionFeedbackProps) {
  if (!error) return null;

  const errorType = categorizeActionError(error);

  // 1. Limite de Plano
  if (errorType === 'plan_limit') {
    return (
      <div
        role="alert"
        className={`p-4 rounded-xl border border-amber-300 dark:border-amber-800/80 bg-amber-50/90 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in-50 duration-200 ${className}`}
      >
        <div className="flex items-start gap-3">
          <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5 sm:mt-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                Limite do Plano Atingido
              </span>
            </div>
            <p className="text-xs sm:text-sm text-amber-800/90 dark:text-amber-300/90 mt-0.5">
              {error}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0 pt-2 sm:pt-0">
          <Link
            href={`/${tenantSlug}/configuracoes`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors"
          >
            Conhecer Plano Inteligente
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Fechar alerta"
              className="p-1 rounded-md text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100 hover:bg-amber-200/50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // 2. Acesso Negado / Permissão
  if (errorType === 'permission') {
    return (
      <div
        role="alert"
        className={`p-3.5 rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/80 dark:bg-purple-950/30 text-purple-900 dark:text-purple-200 shadow-xs flex items-center justify-between gap-3 ${className}`}
      >
        <div className="flex items-center gap-2.5">
          <Lock className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
          <p className="text-xs sm:text-sm font-medium">{error}</p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Fechar alerta"
            className="p-1 rounded-md text-purple-700 hover:text-purple-900 dark:text-purple-300 dark:hover:text-purple-100 hover:bg-purple-200/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  // 3. Assinatura suspensa ou com pagamento pendente
  if (errorType === 'subscription_suspended') {
    return (
      <div
        role="alert"
        className={`p-4 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50/90 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${className}`}
      >
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">
              Assinatura Pendente ou Suspensa
            </span>
            <p className="text-xs sm:text-sm text-rose-800/90 dark:text-rose-300/90 mt-0.5">
              {error}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0 pt-2 sm:pt-0">
          <Link
            href={`/${tenantSlug}/configuracoes`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors"
          >
            Regularizar Assinatura
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Fechar alerta"
              className="p-1 rounded-md text-rose-700 hover:text-rose-900 dark:text-rose-300 hover:bg-rose-200/50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // 4. Erro de Validação ou Erro Técnico Genérico
  const isValidation = errorType === 'validation';
  return (
    <div
      role="alert"
      className={`p-3.5 rounded-xl border ${
        isValidation
          ? 'border-amber-200 bg-amber-50/70 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200'
          : 'border-red-200 bg-red-50/80 text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300'
      } flex items-center justify-between gap-3 text-xs sm:text-sm shadow-2xs ${className}`}
    >
      <div className="flex items-center gap-2.5">
        {isValidation ? (
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
        )}
        <span className="font-medium">{error}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fechar alerta"
          className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
