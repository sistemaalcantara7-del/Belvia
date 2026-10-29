import Link from 'next/link';
import { Client } from '@/types/clients';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { maskPhone, maskCPFPartial, buildWhatsAppLink } from '@/lib/utils/masks';
import { X, MessageSquare, Phone, MapPin, FileText, CheckCircle2, XCircle, Edit2, History } from 'lucide-react';

interface ClientDetailModalProps {
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (client: Client) => void;
  canManage: boolean;
  tenantSlug?: string;
}

export function ClientDetailModal({
  client,
  isOpen,
  onClose,
  onEdit,
  canManage,
  tenantSlug,
}: ClientDetailModalProps) {
  if (!isOpen || !client) return null;

  const isActive = client.status === 'active';
  // Prioriza o WhatsApp; se não houver, tenta gerar link com o telefone alternativo
  const contactForWa = client.whatsapp || client.phone;
  const waLink = buildWhatsAppLink(contactForWa, `Olá, ${client.full_name}! Falamos da clínica.`);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
      <Card className="w-full sm:max-w-lg h-full sm:h-auto sm:max-h-[92vh] flex flex-col shadow-2xl relative rounded-none sm:rounded-2xl border-0 sm:border animate-in fade-in-0 zoom-in-95 overflow-hidden">
        {/* Cabeçalho Fixo */}
        <div className="p-4 sm:p-6 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0 flex items-start justify-between relative">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                }`}
              >
                {isActive ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                {isActive ? 'Cliente Ativo' : 'Cliente Inativo'}
              </span>
            </div>
            <CardTitle className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-zinc-50">
              {client.full_name}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm mt-0.5">
              Cadastrado em {new Date(client.created_at).toLocaleDateString('pt-BR')}
            </CardDescription>
          </div>
          <button
            onClick={onClose}
            type="button"
            aria-label="Fechar"
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo com Rolagem Interna */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Ações Rápidas de Contato */}
          <div className="flex flex-wrap gap-2 pt-1">
            {waLink && (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Conversar no WhatsApp
              </a>
            )}
            {(client.phone || client.whatsapp) && (
              <a
                href={`tel:${client.phone || client.whatsapp}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-800 dark:text-zinc-200 text-xs font-semibold transition-colors"
              >
                <Phone className="w-3.5 h-3.5" />
                Ligar
              </a>
            )}
          </div>

          {/* Dados Pessoais e Contatos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-zinc-50 dark:bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
            <div>
              <span className="text-zinc-500 font-medium block">WhatsApp:</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                {client.whatsapp ? maskPhone(client.whatsapp) : 'Não informado'}
              </span>
            </div>

            <div>
              <span className="text-zinc-500 font-medium block">Telefone alternativo:</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                {client.phone ? maskPhone(client.phone) : 'Não informado'}
              </span>
            </div>

            <div>
              <span className="text-zinc-500 font-medium block">E-mail:</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate block">
                {client.email || 'Não informado'}
              </span>
            </div>

            <div>
              <span className="text-zinc-500 font-medium block">Nascimento:</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                {client.birth_date
                  ? new Date(client.birth_date + 'T12:00:00').toLocaleDateString('pt-BR')
                  : 'Não informado'}
              </span>
            </div>

            <div>
              <span className="text-zinc-500 font-medium block">CPF (Protegido LGPD):</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 font-mono">
                {maskCPFPartial(client.cpf)}
              </span>
            </div>
          </div>

          {/* Endereço */}
          {client.address && (client.address.street || client.address.city) && (
            <div className="text-xs p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
              <span className="text-zinc-500 font-medium flex items-center gap-1 mb-1">
                <MapPin className="w-3.5 h-3.5 text-rose-500" />
                Endereço Cadastrado
              </span>
              <p className="text-zinc-700 dark:text-zinc-300">
                {[
                  client.address.street,
                  client.address.number,
                  client.address.neighborhood,
                  client.address.city,
                  client.address.state,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            </div>
          )}

          {/* Observações */}
          {client.notes && (
            <div className="text-xs p-3.5 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50">
              <span className="text-amber-800 dark:text-amber-300 font-semibold flex items-center gap-1 mb-1">
                <FileText className="w-3.5 h-3.5" />
                Observações Administrativas
              </span>
              <p className="text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                {client.notes}
              </p>
            </div>
          )}
        </div>

        {/* Rodapé Fixo */}
        <div className="p-4 sm:p-5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/80 shrink-0 flex items-center justify-between">
          <div>
            {tenantSlug ? (
              <Link
                href={`/${tenantSlug}/clientes/${client.id}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/60 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 transition-colors"
              >
                <History className="w-3.5 h-3.5" />
                Histórico 360º
              </Link>
            ) : (
              <span className="text-[11px] text-zinc-400">
                Atualizado: {new Date(client.updated_at).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
              Fechar
            </Button>
            {canManage && (
              <Button
                size="sm"
                onClick={() => {
                  onClose();
                  onEdit(client);
                }}
                className="text-xs bg-rose-600 hover:bg-rose-700 text-white"
              >
                <Edit2 className="w-3.5 h-3.5 mr-1" />
                Editar
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
