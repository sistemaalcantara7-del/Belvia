'use client';

import React, { useState, useTransition } from 'react';
import {
  Globe,
  Palette,
  Share2,
  Copy,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Eye,
  Sliders,
  Sparkles,
  Smartphone,
  Save,
  Loader2,
  Check,
  Plus,
  Trash2,
  ImageIcon,
  Link2,
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

export function OnlineBookingCustomizer({
  tenantSlug,
  userRole,
  initialSettings,
  initialPortfolio = [],
  services,
  professionals,
}: OnlineBookingCustomizerProps) {
  const [currentSlug, setCurrentSlug] = useState(tenantSlug);
  const [slugInput, setSlugInput] = useState(tenantSlug);
  const [slugPending, startSlugTransition] = useTransition();
  const [slugFeedback, setSlugFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [settings, setSettings] = useState<OnlineBookingSettings>(initialSettings);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>(initialPortfolio);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'mobile' | 'desktop'>('mobile');

  // Novo item de portfólio modal/form
  const [newPhotoTitle, setNewPhotoTitle] = useState('');
  const [newPhotoUrl, setNewPhotoUrl] = useState('');
  const [newPhotoCategory, setNewPhotoCategory] = useState('Resultados');
  const [newPhotoDescription, setNewPhotoDescription] = useState('');
  const [photoPending, startPhotoTransition] = useTransition();

  const isOwnerOrAdmin = ['owner', 'admin'].includes(userRole);
  const shortUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/p/${currentSlug}`
    : `/p/${currentSlug}`;

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
    shortUrl
  )}`;

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

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

  const toggleServiceFilter = (serviceId: string) => {
    const current = settings.public_services_filter || [];
    const exists = current.includes(serviceId);
    const updated = exists ? current.filter((id) => id !== serviceId) : [...current, serviceId];
    setSettings({ ...settings, public_services_filter: updated });
  };

  const toggleProfessionalFilter = (profId: string) => {
    const current = settings.public_professionals_filter || [];
    const exists = current.includes(profId);
    const updated = exists ? current.filter((id) => id !== profId) : [...current, profId];
    setSettings({ ...settings, public_professionals_filter: updated });
  };

  return (
    <div className="space-y-6">
      {/* ── CARD DE URL CURTA & DIVULGAÇÃO ────────────────────────────────────── */}
      <div className="p-5 rounded-2xl bg-white border border-[#EADBCE] shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[#F5EDE8] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-[#B87070]" />
              <h2 className="text-sm font-bold text-[#1E1115]">
                Endereço Curto e Vitrine Digital
              </h2>
            </div>
            <p className="text-xs text-[#7D6B65] mt-0.5">
              Sua vitrine completa em <strong>zelunia.com.br/p/{currentSlug}</strong> e agendamento direto em <strong>/agendar/{currentSlug}</strong>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleCopyLink(shortUrl)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#EADBCE] bg-[#FAF6F3] hover:bg-[#F2E0DC] text-xs font-semibold text-[#1E1115] transition-colors"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Copiado!' : 'Copiar Vitrine'}</span>
            </button>

            <a
              href={`/p/${currentSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#B87070] hover:bg-[#A86B62] text-white text-xs font-semibold shadow-2xs transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Ver Vitrine</span>
            </a>
          </div>
        </div>

        {/* Formulário de Edição do Slug */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex-1 flex items-center rounded-xl border border-[#EADBCE] bg-[#FAF6F3] px-3 py-2 text-xs">
            <span className="text-[#9B8985] select-none font-medium">zelunia.com.br/p/</span>
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

      {/* Grid: Configurações & Pré-visualização Responsiva */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Coluna de Configurações (7 colunas) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card 1: Chave Geral e Regras de Antecedência */}
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

          {/* Card 2: Identidade Visual e Cores */}
          <div className="p-5 rounded-2xl bg-white border border-[#EADBCE] shadow-2xs space-y-4">
            <div className="flex items-center gap-2 border-b border-[#F5EDE8] pb-3">
              <Palette className="w-4 h-4 text-[#B87070]" />
              <h3 className="text-xs uppercase tracking-wider font-bold text-[#1E1115]">
                Identidade Visual e Cores
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#1E1115] mb-1">
                  Cor Principal da Sua Marca
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
                  URL da Logomarca (PNG/JPG)
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  disabled={!isOwnerOrAdmin}
                  value={settings.logo_url || ''}
                  onChange={(e) => setSettings({ ...settings, logo_url: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[#EADBCE] bg-[#FAF6F3] focus:bg-white focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1E1115] mb-1">
                URL da Foto de Capa / Fachada / Espaço
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

          {/* Card 3: Informações Comerciais e Redes Sociais */}
          <div className="p-5 rounded-2xl bg-white border border-[#EADBCE] shadow-2xs space-y-4">
            <div className="flex items-center gap-2 border-b border-[#F5EDE8] pb-3">
              <Globe className="w-4 h-4 text-[#B87070]" />
              <h3 className="text-xs uppercase tracking-wider font-bold text-[#1E1115]">
                Informações Comerciais e Redes Sociais
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#1E1115] mb-1">
                  Nome do Estabelecimento
                </label>
                <input
                  type="text"
                  placeholder="Ex: Clínica Belvia Estética"
                  disabled={!isOwnerOrAdmin}
                  value={settings.business_name || ''}
                  onChange={(e) => setSettings({ ...settings, business_name: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[#EADBCE] bg-[#FAF6F3] focus:bg-white focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1E1115] mb-1">
                  WhatsApp Oficial
                </label>
                <input
                  type="tel"
                  placeholder="Ex: 11987654321"
                  disabled={!isOwnerOrAdmin}
                  value={settings.whatsapp || ''}
                  onChange={(e) => setSettings({ ...settings, whatsapp: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[#EADBCE] bg-[#FAF6F3] focus:bg-white focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1E1115] mb-1">
                Apresentação Comercial / Sobre a Clínica
              </label>
              <textarea
                rows={2}
                placeholder="Ex: Cuidamos da sua autoestima com atendimento personalizado e tecnologias de ponta."
                disabled={!isOwnerOrAdmin}
                value={settings.business_description || ''}
                onChange={(e) => setSettings({ ...settings, business_description: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-[#EADBCE] bg-[#FAF6F3] focus:bg-white focus:outline-hidden resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#1E1115] mb-1">
                  Instagram (@ ou URL)
                </label>
                <input
                  type="text"
                  placeholder="Ex: @belviaestetica"
                  disabled={!isOwnerOrAdmin}
                  value={settings.instagram || ''}
                  onChange={(e) => setSettings({ ...settings, instagram: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[#EADBCE] bg-[#FAF6F3] focus:bg-white focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1E1115] mb-1">
                  Endereço Físico Completo
                </label>
                <input
                  type="text"
                  placeholder="Ex: Rua Oscar Freire, 1200 - São Paulo"
                  disabled={!isOwnerOrAdmin}
                  value={settings.address || ''}
                  onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[#EADBCE] bg-[#FAF6F3] focus:bg-white focus:outline-hidden"
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
              <div className="p-3.5 rounded-xl bg-[#FAF6F3] border border-[#EADBCE] space-y-3">
                <p className="text-xs font-bold text-[#1E1115]">Adicionar Foto de Resultado</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    placeholder="Título (ex: Micropigmentação Fio a Fio)"
                    value={newPhotoTitle}
                    onChange={(e) => setNewPhotoTitle(e.target.value)}
                    className="px-3 py-1.5 text-xs rounded-lg border border-[#EADBCE] bg-white focus:outline-hidden"
                  />
                  <input
                    type="url"
                    placeholder="URL da Imagem (https://...)"
                    value={newPhotoUrl}
                    onChange={(e) => setNewPhotoUrl(e.target.value)}
                    className="px-3 py-1.5 text-xs rounded-lg border border-[#EADBCE] bg-white focus:outline-hidden"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    placeholder="Categoria (ex: Cílios, Cabelo, Pele)"
                    value={newPhotoCategory}
                    onChange={(e) => setNewPhotoCategory(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-[#EADBCE] bg-white focus:outline-hidden"
                  />
                  <button
                    type="button"
                    disabled={photoPending || !newPhotoTitle || !newPhotoUrl}
                    onClick={handleAddPortfolioPhoto}
                    className="px-4 py-1.5 rounded-lg bg-[#B87070] text-white text-xs font-bold hover:bg-[#A86B62] disabled:opacity-40 transition-colors flex items-center gap-1 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar
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

          {/* Card 5: Serviços e Profissionais Públicos */}
          <div className="p-5 rounded-2xl bg-white border border-[#EADBCE] shadow-2xs space-y-4">
            <div className="flex items-center gap-2 border-b border-[#F5EDE8] pb-3">
              <Sparkles className="w-4 h-4 text-[#B87070]" />
              <h3 className="text-xs uppercase tracking-wider font-bold text-[#1E1115]">
                Serviços e Profissionais Disponíveis na Vitrine
              </h3>
            </div>

            <div>
              <p className="text-xs font-semibold text-[#1E1115] mb-2">Serviços Exibidos</p>
              <div className="max-h-36 overflow-y-auto space-y-1.5 p-2 rounded-xl bg-[#FAF6F3] border border-[#EADBCE]">
                {services.map((srv) => {
                  const isChecked = (settings.public_services_filter || []).includes(srv.id);
                  return (
                    <label
                      key={srv.id}
                      className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white cursor-pointer text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleServiceFilter(srv.id)}
                        className="rounded-sm border-[#EADBCE] text-[#B87070] focus:ring-[#B87070]"
                      />
                      <span className="font-medium text-[#1E1115]">{srv.name}</span>
                      <span className="text-[#7D6B65] text-[11px]">({srv.category})</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-[#1E1115] mb-2">Profissionais Exibidos</p>
              <div className="max-h-36 overflow-y-auto space-y-1.5 p-2 rounded-xl bg-[#FAF6F3] border border-[#EADBCE]">
                {professionals.map((prof) => {
                  const isChecked = (settings.public_professionals_filter || []).includes(prof.id);
                  return (
                    <label
                      key={prof.id}
                      className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white cursor-pointer text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleProfessionalFilter(prof.id)}
                        className="rounded-sm border-[#EADBCE] text-[#B87070] focus:ring-[#B87070]"
                      />
                      <span className="font-medium text-[#1E1115]">{prof.full_name}</span>
                      <span className="text-[#7D6B65] text-[11px]">({prof.specialty})</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Botão de Salvar */}
          {isOwnerOrAdmin && (
            <div className="flex justify-end">
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

        {/* Coluna de Divulgação & Pré-visualização (5 colunas) */}
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

          {/* Pré-visualização Responsiva */}
          <div className="p-5 rounded-2xl bg-white border border-[#EADBCE] shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-[#F5EDE8] pb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#1E1115]">
                <Eye className="w-4 h-4 text-[#B87070]" />
                <span>Pré-visualização da Vitrine</span>
              </div>
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#FAF6F3] border border-[#EADBCE]">
                <button
                  type="button"
                  onClick={() => setPreviewDevice('mobile')}
                  className={`p-1 rounded-md text-xs transition-colors ${
                    previewDevice === 'mobile'
                      ? 'bg-white shadow-2xs text-[#B87070]'
                      : 'text-[#7D6B65]'
                  }`}
                  title="Celular"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Mockup da Vitrine Digital */}
            <div
              className="mx-auto rounded-3xl border-4 border-[#2D1F27] bg-[#FDFAF8] overflow-hidden shadow-sm"
              style={{ maxWidth: previewDevice === 'mobile' ? '300px' : '100%' }}
            >
              {/* Capa */}
              <div className="h-20 w-full bg-[#2D1F27] relative overflow-hidden">
                {settings.cover_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={settings.cover_url} alt="Capa" className="w-full h-full object-cover opacity-60" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#2D1F27] to-transparent" />
                <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-bold shadow-xs"
                    style={{ backgroundColor: settings.primary_color || '#C4837A' }}
                  >
                    {(settings.business_name || 'B').slice(0, 1)}
                  </div>
                  <span className="text-white text-xs font-bold truncate max-w-[190px]">
                    {settings.business_name || 'Sua Clínica'}
                  </span>
                </div>
              </div>

              {/* Corpo Simulado */}
              <div className="p-3 space-y-2.5 text-[10px]">
                <div className="flex items-center gap-2">
                  <a
                    href={`/agendar/${currentSlug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-1.5 rounded-lg text-white text-center font-bold shadow-xs text-[10px]"
                    style={{ backgroundColor: settings.primary_color || '#C4837A' }}
                  >
                    Agendar Horário
                  </a>
                  {settings.whatsapp && (
                    <span className="px-2 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                      WhatsApp
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="font-bold text-[#2D1F27] block">Serviços em Destaque</span>
                  <div className="p-2 rounded-lg bg-white border border-[#EAD9D3] flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-[#2D1F27] block">Corte & Tratamento</span>
                      <span className="text-[#9B8985] text-[9px]">45 min • R$ 90,00</span>
                    </div>
                  </div>
                </div>

                {portfolio.length > 0 && (
                  <div className="space-y-1">
                    <span className="font-bold text-[#2D1F27] block">Galeria de Resultados</span>
                    <div className="grid grid-cols-3 gap-1">
                      {portfolio.slice(0, 3).map((p) => (
                        <div key={p.id} className="aspect-square rounded-md overflow-hidden bg-black/10">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.image_url} alt={p.title} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
