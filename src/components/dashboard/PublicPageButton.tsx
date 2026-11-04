'use client';

import React, { useState } from 'react';
import { Globe, Copy, Check, ExternalLink } from 'lucide-react';

interface PublicPageButtonProps {
  tenantSlug: string;
}

export function PublicPageButton({ tenantSlug }: PublicPageButtonProps) {
  const [copied, setCopied] = useState(false);

  const publicUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/p/${tenantSlug}`
    : `https://zelunia.com.br/p/${tenantSlug}`;

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="inline-flex items-stretch rounded-xl border border-[#EADBCE] bg-white shadow-2xs overflow-hidden group">
      {/* Botão de Abrir Link Real */}
      <a
        href={`/p/${tenantSlug}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-[#2C1810] hover:text-[#B87070] hover:bg-[#FAF6F3] transition-colors"
        title="Abrir vitrine e agendamento online público"
      >
        <Globe className="w-4 h-4 text-[#B87070]" />
        <span>Minha Página Pública</span>
        <ExternalLink className="w-3.5 h-3.5 text-[#A3928B] group-hover:text-[#B87070] transition-colors" />
      </a>

      {/* Botão de Copiar */}
      <button
        type="button"
        onClick={handleCopy}
        className="px-2.5 flex items-center justify-center border-l border-[#EADBCE] bg-[#FAF6F3] hover:bg-[#F2E0DC] text-[#4A3B36] transition-colors cursor-pointer"
        title="Copiar link da página pública"
      >
        {copied ? (
          <Check className="w-4 h-4 text-emerald-600 animate-in zoom-in-50" />
        ) : (
          <Copy className="w-4 h-4 text-[#7D6B65] group-hover:text-[#2C1810]" />
        )}
      </button>
    </div>
  );
}
