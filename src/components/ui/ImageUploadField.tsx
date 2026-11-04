'use client';

import React, { useRef, useState } from 'react';
import Image from 'next/image';
import { UploadCloud, X, RefreshCw, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { compressImageInBrowser } from '@/lib/storage/imageClient';
import { uploadEntityImageAction, deleteEntityImageAction, EntityImageType } from '@/lib/actions/storage';

interface ImageUploadFieldProps {
  tenantSlug: string;
  entityType: EntityImageType;
  currentImageUrl?: string | null;
  onImageChanged: (url: string | null) => void;
  aspectRatioLabel?: string;
  maxDimensionsLabel?: string;
  label?: string;
}

export function ImageUploadField({
  tenantSlug,
  entityType,
  currentImageUrl,
  onImageChanged,
  aspectRatioLabel = '800×600',
  maxDimensionsLabel = 'Máx 300 KB em WebP',
  label,
}: ImageUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl || null);
  const [prevPropUrl, setPrevPropUrl] = useState<string | null | undefined>(currentImageUrl);

  if (currentImageUrl !== prevPropUrl) {
    setPrevPropUrl(currentImageUrl);
    setPreviewUrl(currentImageUrl || null);
  }
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isProfessional = entityType === 'professionals';
  const isPortfolio = entityType === 'portfolio';

  const defaultLabel =
    label ||
    (entityType === 'services'
      ? 'Foto / Imagem do Serviço'
      : entityType === 'professionals'
      ? 'Foto / Imagem do Profissional'
      : 'Foto do Trabalho / Portfólio');

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Limpa o input para permitir selecionar o mesmo arquivo novamente caso queira
    e.target.value = '';

    setErrorMessage(null);
    setIsProcessing(true);

    try {
      // 1. Compacta no cliente primeiro (economiza banda de upload e acelera tempo de resposta)
      let maxWidth = 800;
      let maxHeight = 600;
      let maxSizeBytes = 300 * 1024;

      if (isPortfolio) {
        maxWidth = 1200;
        maxHeight = 1200;
        maxSizeBytes = 350 * 1024;
      } else if (isProfessional) {
        maxWidth = 600;
        maxHeight = 600;
        maxSizeBytes = 200 * 1024;
      }

      const compressedFile = await compressImageInBrowser(file, {
        maxWidth,
        maxHeight,
        quality: 0.8,
        maxSizeBytes,
      });

      // 2. Cria FormData e envia para o servidor (Sharp + Supabase Storage)
      const formData = new FormData();
      formData.append('file', compressedFile);

      const res = await uploadEntityImageAction(tenantSlug, entityType, formData);

      if (!res.success || !res.publicUrl) {
        setErrorMessage(res.error || 'Falha ao enviar imagem.');
        setIsProcessing(false);
        return;
      }

      // Se havia uma imagem anterior diferente, programa remoção segura
      if (previewUrl && previewUrl !== res.publicUrl) {
        deleteEntityImageAction(tenantSlug, previewUrl).catch(() => {});
      }

      setPreviewUrl(res.publicUrl);
      onImageChanged(res.publicUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao processar imagem.';
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveImage = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!previewUrl) return;

    const oldUrl = previewUrl;
    setPreviewUrl(null);
    onImageChanged(null);
    setErrorMessage(null);

    try {
      await deleteEntityImageAction(tenantSlug, oldUrl);
    } catch {
      // Falha silenciosa na remoção de imagem antiga
    }
  };

  const handleTriggerSelect = () => {
    if (!isProcessing) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-[#2C1810] dark:text-zinc-200">
        {defaultLabel}
      </label>

      {errorMessage && (
        <div className="p-2.5 rounded-xl text-xs bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="ml-auto text-xs font-bold hover:underline"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Input oculto */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png, image/jpeg, image/jpg, image/webp"
        onChange={handleFileSelected}
        className="hidden"
        disabled={isProcessing}
      />

      {previewUrl ? (
        /* Estado com Prévia da Imagem em Miniatura Fixa Compacta (w-fit, não estica a largura inteira) */
        <div className="w-fit max-w-full flex flex-row items-center gap-4 p-3 rounded-2xl border border-[#EADBCE] dark:border-zinc-800 bg-[#FAF6F3] dark:bg-zinc-900/60 shadow-2xs">
          {/* Miniatura com dimensões estritas: 120x120 para Profissionais | 160x120 para Serviços/Portfólio */}
          <div
            style={
              isProfessional
                ? { width: '120px', height: '120px', minWidth: '120px', minHeight: '120px', maxWidth: '120px', maxHeight: '120px' }
                : { width: '160px', height: '120px', minWidth: '160px', minHeight: '120px', maxWidth: '160px', maxHeight: '120px' }
            }
            className={`relative shrink-0 overflow-hidden rounded-xl border border-[#EADBCE] dark:border-zinc-700 bg-[#F5EBE6] dark:bg-zinc-800 flex items-center justify-center ${
              isProfessional
                ? 'w-[120px] h-[120px] min-w-[120px] max-w-[120px]'
                : 'w-[160px] h-[120px] min-w-[160px] max-w-[160px]'
            }`}
          >
            <Image
              src={previewUrl}
              alt="Prévia da foto"
              fill
              unoptimized
              className="object-contain object-center p-1"
              sizes={isProfessional ? '120px' : '160px'}
            />

            {isProcessing && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white z-10">
                <Loader2 className="w-5 h-5 animate-spin text-[#B87070] mb-1" />
                <span className="text-[10px] font-medium">Enviando...</span>
              </div>
            )}
          </div>

          {/* Ações e Informações ao lado da miniatura */}
          <div className="flex flex-col justify-center space-y-2">
            <div>
              <p className="text-xs font-bold text-[#2C1810] dark:text-zinc-200">
                Foto carregada
              </p>
              <p className="text-[11px] text-[#7D6B65] dark:text-zinc-400 mt-0.5 whitespace-nowrap">
                {isProfessional ? '120×120 px' : '160×120 px'} • WebP
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={handleTriggerSelect}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-800 hover:bg-[#FAF0EC] dark:hover:bg-zinc-700 border border-[#EADBCE] dark:border-zinc-700 text-xs font-semibold text-[#2C1810] dark:text-zinc-200 shadow-2xs transition-all cursor-pointer"
                title="Substituir foto"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#B87070]" />
                <span>Substituir</span>
              </button>

              <button
                type="button"
                onClick={handleRemoveImage}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-800 hover:bg-red-50 dark:hover:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-xs font-semibold text-red-600 dark:text-red-400 shadow-2xs transition-all cursor-pointer"
                title="Excluir foto"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Área de Upload (Drag / Click) */
        <div
          onClick={handleTriggerSelect}
          className={`border-2 border-dashed border-[#EADBCE] hover:border-[#B87070] bg-[#FAF6F3]/60 hover:bg-[#FAF0EC]/40 rounded-2xl p-5 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2 ${
            isProcessing ? 'opacity-60 pointer-events-none' : ''
          }`}
        >
          <div className="w-10 h-10 rounded-full bg-[#FAF0EC] text-[#B87070] flex items-center justify-center shadow-2xs">
            {isProcessing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <UploadCloud className="w-5 h-5 stroke-[2]" />
            )}
          </div>

          <div>
            <span className="text-xs font-bold text-[#2C1810] block">
              {isProcessing ? 'Processando imagem...' : 'Clique para enviar uma foto'}
            </span>
            <span className="text-[11px] text-[#7D6B65] mt-0.5 block">
              PNG, JPG ou WebP (Recomendado: {aspectRatioLabel} px — {maxDimensionsLabel})
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
