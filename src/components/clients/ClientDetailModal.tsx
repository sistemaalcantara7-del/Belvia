import Link from 'next/link';
import { Client } from '@/types/clients';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <Card className="w-full max-w-lg shadow-2xl relative my-8 animate-in fade-in-0 zoom-in-95">
        <button
          onClick={onClose}
          type="button"
          aria-label="Fechar"
          className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <CardHeader>
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
          <CardTitle className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
            {client.full_name}
          </CardTitle>
          <CardDescription>
            Cadastrado em {new Date(client.created_at).toLocaleDateString('pt-BR')}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
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

          {/* Rodapé com botão de edição e histórico 360 */}
          <div className="flex items-center justify-between pt-2">
            <div>
              {tenantSlug ? (
                <Link
                  href={`/${tenantSlug}/clientes/${client.id}`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/60 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 transition-colors"
                >
                  <History className="w-3.5 h-3.5" />
                  Abrir Histórico 360º
                </Link>
              ) : (
                <span className="text-[11px] text-zinc-400">
                  Atualizado: {new Date(client.updated_at).toLocaleDateString('pt-BR')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>
                Fechar
              </Button>
              {canManage && (
                <Button
                  size="sm"
                  onClick={() => {
                    onClose();
                    onEdit(client);
                  }}
                >
                  <Edit2 className="w-3.5 h-3.5 mr-1" />
                  Editar
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
