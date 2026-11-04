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
}

export function ImageUploadField({
  tenantSlug,
  entityType,
  currentImageUrl,
  onImageChanged,
  aspectRatioLabel = '800×600',
  maxDimensionsLabel = 'Máx 300 KB em WebP',
}: ImageUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl || null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isSquare = entityType === 'professionals';

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Limpa o input para permitir selecionar o mesmo arquivo novamente caso queira
    e.target.value = '';

    setErrorMessage(null);
    setIsProcessing(true);

    try {
      // 1. Compacta no cliente primeiro (economiza banda de upload e acelera tempo de resposta)
      const isService = entityType === 'services';
      const compressedFile = await compressImageInBrowser(file, {
        maxWidth: isService ? 800 : 600,
        maxHeight: isService ? 600 : 600,
        quality: 0.8,
        maxSizeBytes: (isService ? 300 : 200) * 1024,
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
        Foto / Imagem {entityType === 'services' ? 'do Serviço' : 'do Profissional'}
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
        /* Estado com Prévia da Imagem */
        <div className="relative group rounded-2xl overflow-hidden border border-[#EADBCE] bg-[#FAF6F3] shadow-2xs">
          <div
            className={`relative w-full ${
              isSquare ? 'h-48 sm:h-52' : 'h-44 sm:h-48'
            } flex items-center justify-center bg-black/5`}
          >
            <Image
              src={previewUrl}
              alt="Prévia da foto"
              fill
              className="object-cover transition-transform group-hover:scale-[1.02]"
              sizes="(max-width: 768px) 100vw, 400px"
            />

            {/* Overlay com Ações */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleTriggerSelect}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/90 hover:bg-white text-xs font-semibold text-[#2C1810] shadow-md transition-all cursor-pointer"
                title="Substituir foto"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Substituir</span>
              </button>

              <button
                type="button"
                onClick={handleRemoveImage}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-semibold text-white shadow-md transition-all cursor-pointer"
                title="Remover foto"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remover</span>
              </button>
            </div>

            {isProcessing && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white z-10">
                <Loader2 className="w-6 h-6 animate-spin text-[#B87070] mb-1" />
                <span className="text-xs font-medium">Otimizando e enviando...</span>
              </div>
            )}
          </div>

          <div className="p-2.5 bg-white border-t border-[#EADBCE] flex items-center justify-between text-[11px] text-[#7D6B65]">
            <span>Formato: WebP otimizado</span>
            <button
              type="button"
              onClick={handleRemoveImage}
              className="text-red-600 hover:text-red-700 font-semibold hover:underline"
            >
              Excluir foto
            </button>
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
