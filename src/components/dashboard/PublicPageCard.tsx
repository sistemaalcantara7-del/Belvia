'use client';

import React, { useState } from 'react';
import { Globe, Copy, Check } from 'lucide-react';

interface PublicPageCardProps {
  tenantSlug: string;
  tenantName?: string;
}

export function PublicPageCard({ tenantSlug, tenantName }: PublicPageCardProps) {
  const [copied, setCopied] = useState(false);

  const publicUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/${tenantSlug}`
    : `https://zelunia.com.br/${tenantSlug}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#EADBCE] shadow-xs relative overflow-hidden group hover:border-[#B87070]/60 transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Lado Esquerdo: Ícone + Título + URL Real */}
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#FCEFEB] text-[#B87070] flex items-center justify-center shrink-0 shadow-2xs">
            <Globe className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-[#1E1115] tracking-tight">
                Minha Página Pública & Vitrine Digital
              </h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                No Ar
              </span>
            </div>
            <p className="text-xs text-[#7D6B65] mt-0.5 truncate">
              {tenantName ? `${tenantName} — ` : ''}Link oficial para seus clientes agendarem: <strong className="text-[#2C1810] font-mono select-all">zelunia.com.br/{tenantSlug}</strong>
            </p>
          </div>
        </div>

        {/* Lado Direito: Apenas Ação de Copiar Link */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#EADBCE] bg-[#FAF6F3] hover:bg-[#F2E0DC] text-xs font-semibold text-[#1E1115] transition-all cursor-pointer shadow-2xs"
            title="Copiar endereço da página pública"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-600 animate-in zoom-in-50" />
                <span className="text-emerald-700 font-bold">Link Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-[#7D6B65]" />
                <span>Copiar Link</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
