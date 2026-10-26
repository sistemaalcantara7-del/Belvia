import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Appointment, ClientAnamnesisBadge } from '@/types/appointments';
import { Service } from '@/types/services';
import { Professional, ProfessionalTimeBlock } from '@/types/professionals';
import { Client } from '@/types/clients';
import { PaymentOrder } from '@/types/financial';
import { AgendaManager } from '@/components/agenda/AgendaManager';

interface AgendaPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export default async function AgendaPage({ params }: AgendaPageProps) {
  const { tenantSlug } = await params;

  // Validação estrita de contexto multi-tenant no servidor
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    redirect('/login');
  }

  const supabase = await createClient();

  // 1. Carregar agendamentos (RLS restringe automaticamente conforme o papel: owner/admin/recepção vê tudo; professional vê só os seus)
  const { data: appointmentsData, error: apptErr } = await supabase
    .from('appointments')
    .select(`
      id,
      tenant_id,
      client_id,
      service_id,
      professional_id,
      start_time,
      end_time,
      price,
      status,
      notes,
      checked_in_at,
      created_at,
      updated_at,
      client:client_id (
        id,
        full_name,
        whatsapp,
        phone
      ),
      service:service_id (
        id,
        name,
        duration_minutes,
        price
      ),
      professional:professional_id (
        id,
        full_name,
        specialty
      )
    `)
    .eq('tenant_id', context.tenantId)
    .order('start_time', { ascending: true });

  if (apptErr) {
    console.error('Erro ao buscar agendamentos:', apptErr.message);
  }

  // 2. Carregar Clientes para o seletor (apenas id, nome e whatsapp para manter menor privilégio)
  const { data: clientsData } = await supabase
    .from('clients')
    .select('id, full_name, whatsapp')
    .eq('tenant_id', context.tenantId)
    .eq('status', 'active')
    .order('full_name', { ascending: true });

  // 3. Carregar Serviços ativos para o seletor
  const { data: servicesData } = await supabase
    .from('services')
    .select('id, name, duration_minutes, break_minutes, price, status')
    .eq('tenant_id', context.tenantId)
    .eq('status', 'active')
    .order('name', { ascending: true });

  // 4. Carregar Profissionais ativos e seus serviços vinculados
  const { data: professionalsData } = await supabase
    .from('professionals')
    .select('id, full_name, specialty, status')
    .eq('tenant_id', context.tenantId)
    .eq('status', 'active')
    .order('full_name', { ascending: true });

  const profList: Professional[] = (professionalsData || []) as Professional[];

  if (profList.length > 0) {
    const profIds = profList.map((p) => p.id);
    const { data: srvLinks } = await supabase
      .from('professional_services')
      .select('professional_id, service_id')
      .in('professional_id', profIds)
      .eq('tenant_id', context.tenantId);

    profList.forEach((prof) => {
      prof.service_ids = (srvLinks || [])
        .filter((l) => l.professional_id === prof.id)
        .map((l) => l.service_id);
    });
  }

  // 5. Carregar Bloqueios Pontuais de Horário (RLS restringe automaticamente: gestão vê equipe, profissional vê os próprios)
  const { data: timeBlocksData, error: blockErr } = await supabase
    .from('professional_time_blocks')
    .select(`
      id,
      tenant_id,
      professional_id,
      start_time,
      end_time,
      reason,
      created_at,
      professional:professional_id (
        id,
        full_name,
        specialty
      )
    `)
    .eq('tenant_id', context.tenantId)
    .order('start_time', { ascending: true });

  if (blockErr) {
    console.error('Erro ao buscar bloqueios de horários:', blockErr.message);
  }

  // 6. Carregamento em lote (Batch anti-N+1) dos Metadados Administrativos de Anamnese dos Clientes
  // Respeita estritamente o menor privilégio: consulta VIEW reception_anamnesis_status ou anamnesis_forms_summary
  const apptsList = (appointmentsData || []) as unknown as Appointment[];
  const clientIds = Array.from(new Set(apptsList.map((a) => a.client_id).filter(Boolean)));
  const apptIds = apptsList.map((a) => a.id);

  // 6.1 Carregamento em lote das Ordens Financeiras para exibir status na Agenda
  const paymentOrdersByAppt = new Map<string, PaymentOrder>();
  if (apptIds.length > 0 && ['owner', 'admin', 'receptionist'].includes(context.role)) {
    const { data: ordersData } = await supabase
      .from('payment_orders')
      .select('*')
      .in('appointment_id', apptIds)
      .eq('tenant_id', context.tenantId);

    (ordersData || []).forEach((ord) => {
      if (ord.appointment_id) {
        paymentOrdersByAppt.set(ord.appointment_id, ord as PaymentOrder);
      }
    });
  }

  const anamnesisBadgesByClient = new Map<string, ClientAnamnesisBadge>();

  if (clientIds.length > 0) {
    // Para recepção e profissionais, consulta a VIEW autorizada por batch
    const viewName = context.role === 'receptionist' ? 'reception_anamnesis_status' : 'anamnesis_forms_summary';
    
    const { data: anamnesisSummaries } = await supabase
      .from(viewName)
      .select(`
        form_id:id,
        client_id,
        version,
        status,
        filled_at,
        has_allergies_alert
      `)
      .in('client_id', clientIds)
      .eq('tenant_id', context.tenantId)
      .order('filled_at', { ascending: false });

    // Mapeia o registro mais recente de cada cliente para calcular o indicador
    if (anamnesisSummaries && anamnesisSummaries.length > 0) {
      const now = new Date().getTime();
      const oneYearMs = 365 * 24 * 60 * 60 * 1000;

      for (const item of anamnesisSummaries) {
        const cId = item.client_id;
        if (!anamnesisBadgesByClient.has(cId)) {
          const filledTime = item.filled_at ? new Date(item.filled_at).getTime() : 0;
          const isExpired = filledTime > 0 && (now - filledTime > oneYearMs);
          const isCompleted = item.status === 'completed';

          let statusKey: ClientAnamnesisBadge['status'] = 'up_to_date';
          let label = 'Anamnese em dia';
          let badgeBg = 'bg-emerald-50 dark:bg-emerald-950/40';
          let badgeText = 'text-emerald-700 dark:text-emerald-300';
          let badgeBorder = 'border-emerald-200 dark:border-emerald-800';

          if (item.has_allergies_alert) {
            statusKey = 'risk_alert';
            label = 'Alerta de Triagem';
            badgeBg = 'bg-red-50 dark:bg-red-950/40';
            badgeText = 'text-red-700 dark:text-red-300';
            badgeBorder = 'border-red-200 dark:border-red-800';
          } else if (isExpired) {
            statusKey = 'expired';
            label = 'Ficha Expirada (+1 ano)';
            badgeBg = 'bg-amber-50 dark:bg-amber-950/40';
            badgeText = 'text-amber-700 dark:text-amber-300';
            badgeBorder = 'border-amber-200 dark:border-amber-800';
          } else if (!isCompleted) {
            statusKey = 'pending';
            label = 'Pendente de Conclusão';
            badgeBg = 'bg-zinc-100 dark:bg-zinc-800';
            badgeText = 'text-zinc-600 dark:text-zinc-400';
            badgeBorder = 'border-zinc-200 dark:border-zinc-700';
          }

          anamnesisBadgesByClient.set(cId, {
            formId: item.form_id,
            status: statusKey,
            label,
            badgeBg,
            badgeText,
            badgeBorder,
            hasAllergiesAlert: Boolean(item.has_allergies_alert),
            filledAt: item.filled_at,
            version: item.version,
          });
        }
      }
    }
  }

  // Acopla o badge de anamnese e a ordem de pagamento aos agendamentos
  const enrichedAppointments: Appointment[] = apptsList.map((appt) => {
    const badge = anamnesisBadgesByClient.get(appt.client_id) || {
      status: 'pending',
      label: 'Sem Anamnese',
      badgeBg: 'bg-zinc-100 dark:bg-zinc-800',
      badgeText: 'text-zinc-500 dark:text-zinc-400',
      badgeBorder: 'border-zinc-200 dark:border-zinc-700',
      hasAllergiesAlert: false,
    };

    return {
      ...appt,
      anamnesisBadge: badge,
      paymentOrder: paymentOrdersByAppt.get(appt.id) || null,
    };
  });

  return (
    <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <AgendaManager
          initialAppointments={enrichedAppointments}
          initialTimeBlocks={(timeBlocksData || []) as unknown as ProfessionalTimeBlock[]}
          clients={(clientsData || []) as Client[]}
          services={(servicesData || []) as Service[]}
          professionals={profList}
          tenantSlug={context.tenantSlug}
          tenantName={context.tenantName}
          userRole={context.role}
          timezone={context.timezone}
        />
      </div>
    </div>
  );
}
