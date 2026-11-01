'use client';

import React, { useState, useTransition } from 'react';
import {
  Share2,
  CheckCircle2,
  AlertCircle,
  Sliders,
  Save,
  Loader2,
  Plus,
  Trash2,
  ImageIcon,
  Upload,
  Building2,
} from 'lucide-react';
import { OnlineBookingSettings, PortfolioItem } from '@/types/publicBooking';
import { Service } from '@/types/services';
import { Professional } from '@/types/professionals';
import { saveOnlineBookingSettingsAction } from '@/lib/actions/bookingSettings';
import {
  updateTenantSlugAction,
  savePortfolioItemAction,
  deletePortfolioItemAction,
} from '@/lib/actions/portfolio';

interface OnlineBookingCustomizerProps {
  tenantSlug: string;
  userRole: string;
  initialSettings: OnlineBookingSettings;
  initialPortfolio?: PortfolioItem[];
  services: Service[];
  professionals: Professional[];
}

export function OnlineBookingCustomizer(props: OnlineBookingCustomizerProps) {
  const { tenantSlug, userRole, initialSettings, initialPortfolio = [] } = props;
  const [currentSlug, setCurrentSlug] = useState(tenantSlug);
  const [slugInput, setSlugInput] = useState(tenantSlug);
  const [slugPending, startSlugTransition] = useTransition();
  const [slugFeedback, setSlugFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [settings, setSettings] = useState<OnlineBookingSettings>(initialSettings);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>(initialPortfolio);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Novo item de portfólio modal/form
  const [newPhotoTitle, setNewPhotoTitle] = useState('');
  const [newPhotoUrl, setNewPhotoUrl] = useState('');
  const [newPhotoCategory, setNewPhotoCategory] = useState('Resultados');
  const [newPhotoDescription, setNewPhotoDescription] = useState('');
  const [photoPending, startPhotoTransition] = useTransition();
  const [isCompressing, setIsCompressing] = useState(false);

  const isOwnerOrAdmin = ['owner', 'admin'].includes(userRole);
  const shortUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/p/${currentSlug}`
    : `/p/${currentSlug}`;

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
    shortUrl
  )}`;

  const handleUpdateSlug = () => {
    if (!isOwnerOrAdmin || slugInput === currentSlug) return;
    setSlugFeedback(null);
    startSlugTransition(async () => {
      const res = await updateTenantSlugAction(currentSlug, slugInput);
      if (res.success && res.newSlug) {
        setCurrentSlug(res.newSlug);
        setSlugFeedback({
          type: 'success',
          message: `Endereço atualizado com sucesso para zelunia.com.br/p/${res.newSlug}`,
        });
      } else {
        setSlugFeedback({
          type: 'error',
          message: res.error || 'Falha ao atualizar endereço do estabelecimento.',
        });
      }
    });
  };

  const handleSaveSettings = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await saveOnlineBookingSettingsAction(currentSlug, settings);
      if (res.success && res.settings) {
        setSettings(res.settings);
        setFeedback({
          type: 'success',
          message: 'Configurações da vitrine e agendamento salvas com sucesso!',
        });
      } else {
        setFeedback({
          type: 'error',
          message: res.error || 'Falha ao salvar configurações.',
        });
      }
    });
  };

  /**
   * Compacta a imagem utilizando Canvas para reduzir drasticamente o tamanho (WebP/JPEG 80%, max 1280px)
   * Evita sobrecarga de banco de dados e conta Supabase mantendo alta nitidez visual.
   */
  const compressImage = (file: File, maxWidth = 1280, maxHeight = 1280, quality = 0.82): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          let { width, height } = img;
          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(event.target?.result as string);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          // Tenta webp primeiro, com fallback para jpeg
          let compressedDataUrl = canvas.toDataURL('image/webp', quality);
          if (!compressedDataUrl.startsWith('data:image/webp')) {
            compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          }
          resolve(compressedDataUrl);
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Selecione um arquivo de imagem válido (PNG, JPG, SVG ou WEBP).');
      return;
    }

    try {
      // Compacta o logo mantendo max 600px
      const compressed = await compressImage(file, 600, 600, 0.85);
      setSettings((prev) => ({ ...prev, logo_url: compressed }));
    } catch {
      // Fallback leitura direta
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (dataUrl) {
          setSettings((prev) => ({ ...prev, logo_url: dataUrl }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePortfolioFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Selecione um arquivo de imagem válido (PNG, JPG ou WEBP).');
      return;
    }

    try {
      setIsCompressing(true);
      // Reduz a imagem para max 1280px e 80% qualidade (reduz fotos de 5MB para ~120KB)
      const compressed = await compressImage(file, 1280, 1280, 0.80);
      setNewPhotoUrl(compressed);
    } catch (err) {
      console.error('Erro ao otimizar imagem do portfólio:', err);
      alert('Não foi possível processar a imagem. Tente outro arquivo.');
    } finally {
      setIsCompressing(false);
      // Limpa o input para permitir selecionar o mesmo arquivo novamente se desejar
      e.target.value = '';
    }
  };

  const handleAddPortfolioPhoto = () => {
    if (!newPhotoTitle || !newPhotoUrl) return;
    startPhotoTransition(async () => {
      const res = await savePortfolioItemAction(currentSlug, {
        title: newPhotoTitle,
        image_url: newPhotoUrl,
        category: newPhotoCategory,
        description: newPhotoDescription || undefined,
      });

      if (res.success && res.item) {
        setPortfolio([res.item, ...portfolio]);
        setNewPhotoTitle('');
        setNewPhotoUrl('');
        setNewPhotoDescription('');
      } else {
        alert(res.error || 'Falha ao adicionar foto ao portfólio.');
      }
    });
  };

  const handleDeletePortfolioPhoto = (id: string) => {
    if (!confirm('Deseja realmente remover esta foto da sua vitrine pública?')) return;
    startPhotoTransition(async () => {
      const res = await deletePortfolioItemAction(currentSlug, id);
      if (res.success) {
        setPortfolio(portfolio.filter((p) => p.id !== id));
      } else {
        alert(res.error || 'Falha ao excluir item.');
      }
    });
  };


  return (
    <div className="space-y-6">
      {/* ── 1. SEÇÃO PRINCIPAL NO TOPO: DADOS DO ESTABELECIMENTO ─────────────── */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#EADBCE] shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#F5EDE8] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#FAF0EC] text-[#B87070] flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#1E1115]">
                Dados do Estabelecimento
              </h2>
              <p className="text-xs text-[#7D6B65]">
                Informações institucionais, logomarca oficial e identidade visual que alimentam a vitrine pública e cabeçalhos de relatórios.
              </p>
            </div>
          </div>

          {isOwnerOrAdmin && (
            <button
              type="button"
              disabled={isPending}
              onClick={handleSaveSettings}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#B87070] hover:bg-[#A86B62] text-white text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 shadow-2xs self-start sm:self-auto shrink-0"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Salvar Dados</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Bloco de Logomarca com Upload e Pré-visualização */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 p-4 rounded-xl bg-[#FAF6F3] border border-[#EADBCE]">
          <div className="md:col-span-4 flex flex-col items-center justify-center text-center p-3 border-b md:border-b-0 md:border-r border-[#EADBCE]/80">
            <label className="block text-xs font-bold text-[#1E1115] mb-2">
              Logomarca Oficial
            </label>
            <div className="w-28 h-28 rounded-2xl border-2 border-dashed border-[#CDB8B0] bg-white flex items-center justify-center overflow-hidden p-2 shadow-2xs relative group">
              {settings.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={settings.logo_url}
                  alt="Logomarca"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-center p-2">
                  <ImageIcon className="w-8 h-8 text-[#A8948D] mx-auto mb-1" />
                  <span className="text-[10px] text-[#A8948D] font-medium block">Sem logo</span>
                </div>
              )}
            </div>
            {settings.logo_url && (
              <button
                type="button"
                disabled={!isOwnerOrAdmin}
                onClick={() => setSettings({ ...settings, logo_url: '' })}
                className="mt-2 text-[11px] text-red-600 hover:underline font-medium"
              >
                Remover logomarca
              </button>
            )}
          </div>

          <div className="md:col-span-8 flex flex-col justify-center space-y-3">
            <div>
              <span className="block text-xs font-semibold text-[#1E1115] mb-1">
                Upload de Imagem (PNG / JPG / WEBP)
              </span>
              <label
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#EADBCE] bg-white hover:bg-[#F2E0DC] text-xs font-bold text-[#1E1115] transition-colors cursor-pointer shadow-2xs ${
                  !isOwnerOrAdmin ? 'opacity-50 pointer-events-none' : ''
                }`}
              >
                <Upload className="w-4 h-4 text-[#B87070]" />
                <span>Escolher arquivo no computador</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={handleLogoUpload}
                  className="hidden"
                  disabled={!isOwnerOrAdmin}
                />
              </label>
              <p className="text-[11px] text-[#7D6B65] mt-1.5">
                Recomendado formato PNG transparente, até 2MB. A imagem será sincronizada automaticamente com seus relatórios e página pública.
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#7D6B65] mb-1">
                Ou informe a URL direta da imagem:
              </label>
              <input
                type="url"
                placeholder="https://..."
                disabled={!isOwnerOrAdmin}
                value={settings.logo_url || ''}
                onChange={(e) => setSettings({ ...settings, logo_url: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-[#EADBCE] bg-white focus:outline-hidden"
              />
            </div>
          </div>
        </div>

        {/* Nome Comercial e Dados Cadastrais */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#1E1115] mb-1">
              Nome Comercial do Estabelecimento
            </label>
            <input
              type="text"
              placeholder="Ex: Clínica Belvia Estética"
              disabled={!isOwnerOrAdmin}
              value={settings.business_name || ''}
              onChange={(e) => setSettings({ ...settings, business_name: e.target.value })}
              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-[#EADBCE] bg-[#FAF6F3] focus:bg-white focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1E1115] mb-1">
              WhatsApp Oficial de Atendimento
            </label>
            <input
              type="tel"
              placeholder="Ex: 11987654321"
              disabled={!isOwnerOrAdmin}
              value={settings.whatsapp || ''}
              onChange={(e) => setSettings({ ...settings, whatsapp: e.target.value })}
              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-[#EADBCE] bg-[#FAF6F3] focus:bg-white focus:outline-hidden"
            />
          </div>
        </div>

        {/* Apresentação e Redes Sociais */}
        <div>
          <label className="block text-xs font-semibold text-[#1E1115] mb-1">
            Apresentação Comercial / Sobre o Estabelecimento
          </label>
          <textarea
            rows={2}
            placeholder="Ex: Cuidamos da sua autoestima com atendimento personalizado e tecnologias de ponta."
            disabled={!isOwnerOrAdmin}
            value={settings.business_description || ''}
            onChange={(e) => setSettings({ ...settings, business_description: e.target.value })}
            className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-[#EADBCE] bg-[#FAF6F3] focus:bg-white focus:outline-hidden resize-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#1E1115] mb-1">
              Instagram (@ ou link)
            </label>
            <input
              type="text"
              placeholder="Ex: @belviaestetica"
              disabled={!isOwnerOrAdmin}
              value={settings.instagram || ''}
              onChange={(e) => setSettings({ ...settings, instagram: e.target.value })}
              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-[#EADBCE] bg-[#FAF6F3] focus:bg-white focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1E1115] mb-1">
              Endereço Físico Completo
            </label>
            <input
              type="text"
              placeholder="Ex: Rua Oscar Freire, 1200 - Jardins, São Paulo"
              disabled={!isOwnerOrAdmin}
              value={settings.address || ''}
              onChange={(e) => setSettings({ ...settings, address: e.target.value })}
              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-[#EADBCE] bg-[#FAF6F3] focus:bg-white focus:outline-hidden"
            />
          </div>
        </div>

        {/* Identidade Visual, Cores e Foto de Capa */}
        <div className="pt-2 border-t border-[#F5EDE8]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#1E1115] mb-1">
                Cor Principal da Marca
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  disabled={!isOwnerOrAdmin}
                  value={settings.primary_color || '#C4837A'}
                  onChange={(e) => setSettings({ ...settings, primary_color: e.target.value })}
                  className="w-10 h-9 p-0.5 rounded-lg border border-[#EADBCE] cursor-pointer"
                />
                <input
                  type="text"
                  disabled={!isOwnerOrAdmin}
                  value={settings.primary_color || '#C4837A'}
                  onChange={(e) => setSettings({ ...settings, primary_color: e.target.value })}
                  className="flex-1 px-3 py-2 text-xs rounded-xl border border-[#EADBCE] bg-[#FAF6F3] focus:bg-white focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1E1115] mb-1">
                URL da Foto de Capa / Fachada (Opcional)
              </label>
              <input
                type="url"
                placeholder="https://images.unsplash.com/..."
                disabled={!isOwnerOrAdmin}
                value={settings.cover_url || ''}
                onChange={(e) => setSettings({ ...settings, cover_url: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-[#EADBCE] bg-[#FAF6F3] focus:bg-white focus:outline-hidden"
              />
            </div>
          </div>
        </div>

        {/* Gerenciamento do Endereço Curto (Slug) Sem botões de cópia redundantes */}
        <div className="pt-2 border-t border-[#F5EDE8] flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex-1 flex items-center rounded-xl border border-[#EADBCE] bg-[#FAF6F3] px-3 py-2 text-xs">
            <span className="text-[#9B8985] select-none font-medium">Endereço público do estabelecimento: zelunia.com.br/p/</span>
            <input
              type="text"
              disabled={!isOwnerOrAdmin || slugPending}
              value={slugInput}
              onChange={(e) => setSlugInput(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
              placeholder="sua-clinica"
              className="flex-1 bg-transparent border-none text-xs font-bold text-[#1E1115] focus:outline-hidden px-1"
            />
          </div>

          {isOwnerOrAdmin && (
            <button
              type="button"
              disabled={slugPending || slugInput === currentSlug}
              onClick={handleUpdateSlug}
              className="px-4 py-2 rounded-xl bg-[#2D1F27] hover:bg-[#3D2A34] text-white text-xs font-semibold disabled:opacity-40 transition-colors shrink-0"
            >
              {slugPending ? 'Atualizando...' : 'Alterar Endereço'}
            </button>
          )}
        </div>

        {slugFeedback && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              slugFeedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {slugFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{slugFeedback.message}</span>
          </div>
        )}
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl text-xs flex items-start gap-2.5 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Grid: Configurações Técnicas de Agendamento & Pré-visualização Responsiva */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Coluna de Configurações Técnicas (7 colunas) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card: Chave Geral e Regras de Antecedência */}
          <div className="p-5 rounded-2xl bg-white border border-[#EADBCE] shadow-2xs space-y-4">
            <div className="flex items-center gap-2 border-b border-[#F5EDE8] pb-3">
              <Sliders className="w-4 h-4 text-[#B87070]" />
              <h3 className="text-xs uppercase tracking-wider font-bold text-[#1E1115]">
                Disponibilidade e Regras de Agendamento
              </h3>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-[#FAF6F3] border border-[#EADBCE]">
              <div>
                <p className="text-xs font-bold text-[#1E1115]">Permitir Agendamentos Online</p>
                <p className="text-[11px] text-[#7D6B65]">
                  Quando desativado, o link público exibe uma mensagem avisando a pausa temporária.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isOwnerOrAdmin}
                  checked={settings.enabled}
                  onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#B87070]" />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#1E1115] mb-1">
                  Antecedência Mínima (horas)
                </label>
                <input
                  type="number"
                  min="0"
                  max="48"
                  disabled={!isOwnerOrAdmin}
                  value={settings.min_advance_hours}
                  onChange={(e) =>
                    setSettings({ ...settings, min_advance_hours: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[#EADBCE] bg-[#FAF6F3] focus:bg-white focus:outline-hidden focus:border-[#B87070]"
                />
                <p className="text-[10px] text-[#7D6B65] mt-1">
                  Ex: 2h impede agendamentos com menos de 2 horas de aviso.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1E1115] mb-1">
                  Limite Máximo de Dias Futuros
                </label>
                <input
                  type="number"
                  min="1"
                  max="180"
                  disabled={!isOwnerOrAdmin}
                  value={settings.max_future_days}
                  onChange={(e) =>
                    setSettings({ ...settings, max_future_days: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[#EADBCE] bg-[#FAF6F3] focus:bg-white focus:outline-hidden focus:border-[#B87070]"
                />
                <p className="text-[10px] text-[#7D6B65] mt-1">
                  Ex: 30 dias permite agendar até 1 mês à frente.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#1E1115] mb-1">
                  Horário Inicial Permitido
                </label>
                <input
                  type="time"
                  disabled={!isOwnerOrAdmin}
                  value={settings.allowed_start_time}
                  onChange={(e) => setSettings({ ...settings, allowed_start_time: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[#EADBCE] bg-[#FAF6F3] focus:bg-white focus:outline-hidden focus:border-[#B87070]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1E1115] mb-1">
                  Horário Final Permitido
                </label>
                <input
                  type="time"
                  disabled={!isOwnerOrAdmin}
                  value={settings.allowed_end_time}
                  onChange={(e) => setSettings({ ...settings, allowed_end_time: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[#EADBCE] bg-[#FAF6F3] focus:bg-white focus:outline-hidden focus:border-[#B87070]"
                />
              </div>
            </div>
          </div>


          {/* Card 4: Gestão do Portfólio / Galeria de Fotos */}
          <div className="p-5 rounded-2xl bg-white border border-[#EADBCE] shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#F5EDE8] pb-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-[#B87070]" />
                <h3 className="text-xs uppercase tracking-wider font-bold text-[#1E1115]">
                  Portfólio / Galeria de Trabalhos
                </h3>
              </div>
              <span className="text-[11px] font-semibold text-[#7D6B65]">
                {portfolio.length} foto(s) na vitrine
              </span>
            </div>

            {/* Adicionar Foto */}
            {isOwnerOrAdmin && (
              <div className="p-4 rounded-xl bg-[#FAF6F3] border border-[#EADBCE] space-y-3.5">
                <p className="text-xs font-bold text-[#1E1115]">Adicionar Foto de Resultado</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#1E1115] mb-1">
                      Título do Trabalho
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Micropigmentação Fio a Fio"
                      value={newPhotoTitle}
                      onChange={(e) => setNewPhotoTitle(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-[#EADBCE] bg-white focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#1E1115] mb-1">
                      Categoria (opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Sobrancelhas, Cabelo, Pele"
                      value={newPhotoCategory}
                      onChange={(e) => setNewPhotoCategory(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-[#EADBCE] bg-white focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Seletor de Arquivo com Otimização Automática */}
                <div>
                  <label className="block text-[11px] font-semibold text-[#1E1115] mb-1.5">
                    Imagem do Resultado
                  </label>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <label
                      className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[#EADBCE] bg-white hover:bg-[#F2E0DC] text-xs font-bold text-[#1E1115] transition-all cursor-pointer shadow-2xs ${
                        isCompressing || photoPending ? 'opacity-60 pointer-events-none' : ''
                      }`}
                    >
                      {isCompressing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-[#B87070]" />
                          <span>Otimizando imagem...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 text-[#B87070]" />
                          <span>{newPhotoUrl ? 'Trocar Imagem' : 'Fazer Upload da Foto'}</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handlePortfolioFileUpload}
                        className="hidden"
                        disabled={isCompressing || photoPending}
                      />
                    </label>

                    {newPhotoUrl && (
                      <div className="flex items-center gap-2 p-1.5 pr-2.5 rounded-lg bg-white border border-[#EADBCE]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={newPhotoUrl}
                          alt="Prévia selecionada"
                          className="w-7 h-7 rounded object-cover border border-[#EADBCE]"
                        />
                        <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Foto pronta e otimizada
                        </span>
                        <button
                          type="button"
                          onClick={() => setNewPhotoUrl('')}
                          className="text-[10px] text-red-600 hover:underline ml-1 font-medium"
                        >
                          remover
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-[#7D6B65] mt-1.5">
                    O arquivo é comprimido e otimizado automaticamente no navegador antes de salvar, poupando espaço e acelerando o carregamento da sua vitrine.
                  </p>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    disabled={photoPending || isCompressing || !newPhotoTitle || !newPhotoUrl}
                    onClick={handleAddPortfolioPhoto}
                    className="px-5 py-2 rounded-xl bg-[#B87070] text-white text-xs font-bold hover:bg-[#A86B62] disabled:opacity-40 transition-all flex items-center gap-1.5 shadow-2xs"
                  >
                    {photoPending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Adicionando...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>Adicionar ao Portfólio</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Grid de Fotos Existentes */}
            {portfolio.length === 0 ? (
              <p className="text-xs text-[#9B8985] text-center py-4 italic">
                Nenhuma foto cadastrada no portfólio ainda.
              </p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                {portfolio.map((item) => (
                  <div
                    key={item.id}
                    className="group relative aspect-square rounded-xl overflow-hidden bg-black/5 border border-[#EADBCE]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-1.5">
                      {isOwnerOrAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDeletePortfolioPhoto(item.id)}
                          className="self-end p-1 rounded-md bg-red-600 text-white hover:bg-red-700"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                      <span className="text-[10px] text-white font-semibold truncate">
                        {item.title}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Botão de Salvar Alterações */}
          {isOwnerOrAdmin && (
            <div className="flex justify-end pt-2">
              <button
                type="button"
                disabled={isPending}
                onClick={handleSaveSettings}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#B87070] hover:bg-[#A86B62] text-white text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 shadow-2xs"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Salvar Alterações
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Coluna de Divulgação (5 colunas) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card de Divulgação com QR Code */}
          <div className="p-5 rounded-2xl bg-white border border-[#EADBCE] shadow-2xs text-center space-y-3">
            <h3 className="text-xs uppercase tracking-wider font-bold text-[#1E1115]">
              Divulgue sua Vitrine Digital
            </h3>
            <p className="text-xs text-[#7D6B65]">
              Seus clientes apontam a câmera para o QR Code e acessam fotos, catálogo de serviços e agendam na hora.
            </p>

            <div className="inline-block p-3 rounded-2xl bg-white border border-[#EADBCE] shadow-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrCodeUrl}
                alt="QR Code da Vitrine"
                className="w-36 h-36 mx-auto object-contain"
              />
            </div>

            <div className="pt-1">
              <a
                href={qrCodeUrl}
                download={`qrcode-vitrine-${currentSlug}.png`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-[#B87070] font-semibold hover:underline"
              >
                <Share2 className="w-3.5 h-3.5" />
                Baixar QR Code de Divulgação
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
