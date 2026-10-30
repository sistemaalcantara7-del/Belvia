'use server';

import { createClient as createAnonSupabaseClient } from '@supabase/supabase-js';
import {
  PublicCatalogData,
  PublicSlot,
  PublicBookingInput,
  PublicBookingResult,
} from '@/types/publicBooking';
import { localDateTimeToUtcIso } from '@/lib/utils/timezone';
import { sanitizeDigits } from '@/lib/utils/masks';

/**
 * Cria cliente público anon seguro sem expor tokens ou exigir autenticação
 */
function getPublicSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL ou chave pública não configurados no ambiente.');
  }

  return createAnonSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getServiceRoleSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Configurações do Supabase ausentes no servidor.');
  }

  return createAnonSupabaseClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Carrega catálogo público do estabelecimento (nome, serviços ativos, profissionais habilitados)
 */
export async function getPublicTenantCatalogAction(
  tenantSlug: string
): Promise<{ success: boolean; data?: PublicCatalogData; error?: string }> {
  try {
    const supabase = getPublicSupabase();

    // 1. Tenta via RPC dedicada de catálogo público
    const { data: rpcData, error: rpcErr } = await supabase.rpc('get_public_tenant_catalog', {
      p_slug: tenantSlug,
    });

    if (!rpcErr && rpcData && rpcData.success) {
      return {
        success: true,
        data: {
          tenant: rpcData.tenant,
          services: rpcData.services || [],
          professionals: rpcData.professionals || [],
          portfolio: rpcData.portfolio || [],
        },
      };
    }

    // 2. Fallback resiliente: caso a migration 31 ainda esteja pendente de execução manual
    const { data: tenant, error: tErr } = await supabase
      .from('tenants')
      .select('id, name, slug, plan, status, settings')
      .eq('slug', tenantSlug)
      .maybeSingle();

    if (tErr || !tenant) {
      return { success: false, error: 'Estabelecimento não encontrado.' };
    }

    if (tenant.status !== 'active') {
      return {
        success: false,
        error: 'Este estabelecimento está temporariamente indisponível para agendamento online.',
      };
    }

    const tenantSettings = (tenant.settings as Record<string, unknown>) || {};
    const bookingSettings = tenantSettings.booking_settings as
      | {
          enabled?: boolean;
          public_services_filter?: string[];
          public_professionals_filter?: string[];
        }
      | undefined;

    if (bookingSettings && bookingSettings.enabled === false) {
      return {
        success: false,
        error: 'O agendamento online está temporariamente desativado por este estabelecimento.',
      };
    }

    // Busca serviços ativos
    let srvQuery = supabase
      .from('services')
      .select('id, name, description, category, duration_minutes, break_minutes, price')
      .eq('tenant_id', tenant.id)
      .eq('status', 'active');

    if (
      bookingSettings?.public_services_filter &&
      bookingSettings.public_services_filter.length > 0
    ) {
      srvQuery = srvQuery.in('id', bookingSettings.public_services_filter);
    }

    const { data: services } = await srvQuery
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    // Busca profissionais ativos
    let profQuery = supabase
      .from('professionals')
      .select('id, full_name, specialty, bio, avatar_url, status')
      .eq('tenant_id', tenant.id)
      .eq('status', 'active');

    if (
      bookingSettings?.public_professionals_filter &&
      bookingSettings.public_professionals_filter.length > 0
    ) {
      profQuery = profQuery.in('id', bookingSettings.public_professionals_filter);
    }

    const { data: professionals } = await profQuery.order('full_name', { ascending: true });

    // Busca vínculos de profissionais e serviços

    // Busca vínculos de profissionais e serviços
    const { data: links } = await supabase
      .from('professional_services')
      .select('professional_id, service_id')
      .eq('tenant_id', tenant.id);

    const profList = (professionals || []).map((p) => {
      const srvIds = (links || [])
        .filter((l) => l.professional_id === p.id)
        .map((l) => l.service_id);
      return {
        id: p.id,
        full_name: p.full_name,
        specialty: p.specialty,
        bio: p.bio,
        avatar_url: p.avatar_url,
        service_ids: srvIds,
      };
    });

    // Busca itens de portfólio ativos
    const { data: portfolioItems } = await supabase
      .from('tenant_portfolio')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    return {
      success: true,
      data: {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          settings: tenant.settings as PublicCatalogData['tenant']['settings'],
        },
        services: services || [],
        professionals: profList,
        portfolio: portfolioItems || [],
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Falha ao carregar catálogo público.';
    return { success: false, error: msg };
  }
}

/**
 * Consulta horários disponíveis para agendamento público em determinada data
 */
export async function getPublicAvailableSlotsAction(
  tenantId: string,
  serviceId: string,
  professionalId: string | null,
  date: string
): Promise<{ success: boolean; slots?: PublicSlot[]; error?: string }> {
  try {
    const supabase = getPublicSupabase();

    // 1. Tenta invocar a RPC otimizada do PostgreSQL
    const { data: rpcSlots, error: rpcErr } = await supabase.rpc('get_public_available_slots', {
      p_tenant_id: tenantId,
      p_service_id: serviceId,
      p_professional_id: professionalId && professionalId !== 'any' ? professionalId : null,
      p_date: date,
    });

    if (!rpcErr && Array.isArray(rpcSlots)) {
      return {
        success: true,
        slots: rpcSlots.map((s) => ({
          slot_time: String(s.slot_time).slice(0, 5),
          professional_id: s.professional_id,
          professional_name: s.professional_name,
        })),
      };
    }

    // 2. Fallback de cálculo direto
    const { data: tenantData } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    const bookingSettings = (tenantData?.settings as Record<string, unknown>)?.booking_settings as
      | {
          enabled?: boolean;
          min_advance_hours?: number;
          max_future_days?: number;
          allowed_start_time?: string;
          allowed_end_time?: string;
        }
      | undefined;

    if (bookingSettings && bookingSettings.enabled === false) {
      return { success: false, error: 'Agendamento online desativado.' };
    }

    const minAdvanceHours = bookingSettings?.min_advance_hours ?? 1;
    const maxFutureDays = bookingSettings?.max_future_days ?? 30;
    const allowedStart = bookingSettings?.allowed_start_time || '07:00';
    const allowedEnd = bookingSettings?.allowed_end_time || '22:00';

    // Valida limite de dias futuros
    const nowTime = Date.now();
    const maxDateAllowed = new Date(nowTime + maxFutureDays * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    if (date > maxDateAllowed) {
      return {
        success: false,
        error: `Agendamentos são permitidos para no máximo ${maxFutureDays} dias no futuro.`,
      };
    }

    const { data: service } = await supabase
      .from('services')
      .select('id, duration_minutes, break_minutes')
      .eq('id', serviceId)
      .eq('tenant_id', tenantId)
      .single();

    if (!service) {
      return { success: false, error: 'Serviço não encontrado.' };
    }

    const totalMinutes = service.duration_minutes + (service.break_minutes || 0);

    // Converte dia da semana (0=Dom, 1=Seg, ..., 6=Sab)
    const targetDateObj = new Date(`${date}T12:00:00Z`);
    const dayOfWeek = targetDateObj.getDay();

    // Obtém profissionais habilitados
    let profQuery = supabase
      .from('professionals')
      .select('id, full_name, professional_services!inner(service_id)')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .eq('professional_services.service_id', serviceId);

    if (professionalId && professionalId !== 'any') {
      profQuery = profQuery.eq('id', professionalId);
    }

    const { data: profs } = await profQuery;
    if (!profs || profs.length === 0) {
      return { success: true, slots: [] };
    }

    const profIds = profs.map((p) => p.id);

    // Busca expediente dos profissionais para este dia da semana
    const { data: schedules } = await supabase
      .from('professional_schedules')
      .select('professional_id, start_time, end_time, break_start, break_end, is_active')
      .in('professional_id', profIds)
      .eq('day_of_week', dayOfWeek)
      .eq('is_active', true);

    if (!schedules || schedules.length === 0) {
      return { success: true, slots: [] };
    }

    // Limites de horário em UTC para consultas de bloqueio e agendamento
    const dayStartIso = localDateTimeToUtcIso(date, '00:00', 'America/Sao_Paulo');
    const dayEndIso = localDateTimeToUtcIso(date, '23:59', 'America/Sao_Paulo');

    // Busca agendamentos ocupados no dia
    const { data: existingAppts } = await supabase
      .from('appointments')
      .select('professional_id, start_time, end_time')
      .in('professional_id', profIds)
      .in('status', ['scheduled', 'confirmed', 'in_progress', 'completed'])
      .gte('start_time', dayStartIso)
      .lte('end_time', dayEndIso);

    // Busca bloqueios pontuais no dia
    const { data: timeBlocks } = await supabase
      .from('professional_time_blocks')
      .select('professional_id, start_time, end_time')
      .in('professional_id', profIds)
      .lt('start_time', dayEndIso)
      .gt('end_time', dayStartIso);

    const availableSlots: PublicSlot[] = [];
    const nowTimestamp = Date.now();

    for (const sched of schedules) {
      const prof = profs.find((p) => p.id === sched.professional_id);
      if (!prof) continue;

      const [startHour, startMin] = sched.start_time.split(':').map(Number);
      const [endHour, endMin] = sched.end_time.split(':').map(Number);

      let currentMinute = startHour * 60 + startMin;
      const endMinuteLimit = endHour * 60 + endMin;

      while (currentMinute + totalMinutes <= endMinuteLimit) {
        const slotHour = Math.floor(currentMinute / 60);
        const slotMin = currentMinute % 60;
        const timeStr = `${String(slotHour).padStart(2, '0')}:${String(slotMin).padStart(2, '0')}`;

        // Respeita faixa de horários permitidos
        if (timeStr < allowedStart || timeStr > allowedEnd) {
          currentMinute += 30;
          continue;
        }

        // Verifica almoço
        let inBreak = false;
        if (sched.break_start && sched.break_end) {
          const [bStartH, bStartM] = sched.break_start.split(':').map(Number);
          const [bEndH, bEndM] = sched.break_end.split(':').map(Number);
          const breakStartMinute = bStartH * 60 + bStartM;
          const breakEndMinute = bEndH * 60 + bEndM;

          if (currentMinute < breakEndMinute && currentMinute + totalMinutes > breakStartMinute) {
            inBreak = true;
          }
        }

        if (!inBreak) {
          const slotStartIso = localDateTimeToUtcIso(date, timeStr, 'America/Sao_Paulo');
          const slotEndIso = new Date(
            new Date(slotStartIso).getTime() + totalMinutes * 60 * 1000
          ).toISOString();

          // Não permitir horários passados e validar antecedência mínima
          const minAdvanceTimestamp = nowTimestamp + minAdvanceHours * 60 * 60 * 1000;
          if (new Date(slotStartIso).getTime() >= minAdvanceTimestamp) {
            // Verifica conflito de agendamento
            const hasApptConflict = (existingAppts || []).some(
              (a) =>
                a.professional_id === prof.id &&
                a.start_time < slotEndIso &&
                a.end_time > slotStartIso
            );

            // Verifica conflito de bloqueio
            const hasBlockConflict = (timeBlocks || []).some(
              (b) =>
                b.professional_id === prof.id &&
                b.start_time < slotEndIso &&
                b.end_time > slotStartIso
            );

            if (!hasApptConflict && !hasBlockConflict) {
              availableSlots.push({
                slot_time: timeStr,
                professional_id: prof.id,
                professional_name: prof.full_name,
              });
            }
          }
        }

        // Incrementa em blocos de 30 minutos
        currentMinute += 30;
      }
    }

    // Ordena os horários
    availableSlots.sort((a, b) => a.slot_time.localeCompare(b.slot_time));

    return { success: true, slots: availableSlots };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Falha ao consultar disponibilidade.';
    return { success: false, error: msg };
  }
}

/**
 * Criação de Agendamento Online Público com isolamento e validação atômica
 */
export async function createPublicBookingAction(
  input: PublicBookingInput
): Promise<PublicBookingResult> {
  try {
    const {
      tenantSlug,
      serviceId,
      professionalId,
      date,
      time,
      clientName,
      clientWhatsapp,
      clientEmail,
      clientNotes,
    } = input;

    // Sanitizações preliminares
    const cleanName = clientName?.trim();
    const cleanWhatsapp = sanitizeDigits(clientWhatsapp);

    if (!cleanName || cleanName.length < 3) {
      return {
        success: false,
        code: 'INVALID_NAME',
        message: 'Por favor, informe seu nome completo com pelo menos 3 caracteres.',
      };
    }

    if (!cleanWhatsapp || cleanWhatsapp.length < 10 || cleanWhatsapp.length > 11) {
      return {
        success: false,
        code: 'INVALID_WHATSAPP',
        message: 'Informe um WhatsApp válido com DDD (10 ou 11 dígitos numéricos).',
      };
    }

    if (!serviceId || !date || !time) {
      return {
        success: false,
        code: 'MISSING_DATA',
        message: 'Serviço, data e horário são obrigatórios.',
      };
    }

    const startIso = localDateTimeToUtcIso(date, time, 'America/Sao_Paulo');

    // 1. Tenta executar via RPC Atômica da Migration 31 (com cliente anon público)
    const publicClient = getPublicSupabase();
    const { data: rpcRes, error: rpcErr } = await publicClient.rpc('create_public_online_appointment', {
      p_tenant_slug: tenantSlug,
      p_service_id: serviceId,
      p_professional_id: professionalId,
      p_start_time: startIso,
      p_client_name: cleanName,
      p_client_whatsapp: cleanWhatsapp,
      p_client_email: clientEmail?.trim() || null,
      p_client_notes: clientNotes?.trim() || null,
      p_client_ip: 'online_public_web',
    });

    // Se a RPC foi executada com sucesso (ou retornou resposta de negócio estruturada)
    if (!rpcErr && rpcRes) {
      if (rpcRes.success) {
        return {
          success: true,
          appointmentId: rpcRes.appointment_id,
          tenantName: rpcRes.tenant_name,
          serviceName: rpcRes.service_name,
          professionalName: rpcRes.professional_name,
          startTime: rpcRes.start_time,
          endTime: rpcRes.end_time,
          price: rpcRes.price,
          clientName: rpcRes.client_name,
          clientWhatsapp: rpcRes.client_whatsapp,
          message: rpcRes.message,
          code: rpcRes.code,
        };
      }

      // Se a RPC retornou erro de negócio estruturado (ex: PAST_TIME, RATE_LIMITED, INVALID_SERVICE, CONFLICT)
      return {
        success: false,
        code: rpcRes.code || 'BOOKING_REJECTED',
        message: rpcRes.message || 'Horário indisponível ou já reservado.',
      };
    }

    if (rpcErr) {
      console.warn(`[Public Booking] RPC create_public_online_appointment não executada (${rpcErr.message}). Utilizando fallback seguro.`);
    }

    // 2. Se a RPC não estiver disponível ou falhou tecnicamente,
    // executa fallback direto seguro no servidor via service_role para contornar RLS pública
    const adminSupabase = getServiceRoleSupabase();
    const { data: tenant } = await adminSupabase
      .from('tenants')
      .select('id, name, status, settings')
      .eq('slug', tenantSlug)
      .single();

    if (!tenant || tenant.status !== 'active') {
      return { success: false, code: 'INVALID_TENANT', message: 'Estabelecimento indisponível no momento.' };
    }

    const bookingSettings = (tenant.settings as Record<string, unknown>)?.booking_settings as
      | {
          enabled?: boolean;
          min_advance_hours?: number;
          max_future_days?: number;
          allowed_start_time?: string;
          allowed_end_time?: string;
          public_services_filter?: string[];
          public_professionals_filter?: string[];
        }
      | undefined;

    if (bookingSettings && bookingSettings.enabled === false) {
      return {
        success: false,
        code: 'BOOKING_DISABLED',
        message: 'O agendamento online está temporariamente suspenso por este estabelecimento.',
      };
    }

    // Valida antecedência mínima
    const minAdvanceHours = bookingSettings?.min_advance_hours ?? 1;
    const nowTime = Date.now();
    if (new Date(startIso).getTime() < nowTime + minAdvanceHours * 60 * 60 * 1000) {
      return {
        success: false,
        code: 'MIN_ADVANCE_VIOLATION',
        message: `Antecedência mínima para agendamento: ${minAdvanceHours} hora(s).`,
      };
    }

    // Valida filtro de serviços
    if (
      bookingSettings?.public_services_filter &&
      bookingSettings.public_services_filter.length > 0 &&
      !bookingSettings.public_services_filter.includes(serviceId)
    ) {
      return {
        success: false,
        code: 'SERVICE_NOT_ALLOWED',
        message: 'Este serviço não está disponível para reserva online.',
      };
    }

    // Valida filtro de profissionais
    if (
      bookingSettings?.public_professionals_filter &&
      bookingSettings.public_professionals_filter.length > 0 &&
      !bookingSettings.public_professionals_filter.includes(professionalId)
    ) {
      return {
        success: false,
        code: 'PROFESSIONAL_NOT_ALLOWED',
        message: 'Este profissional não está disponível para reserva online.',
      };
    }

    // Obtém serviço
    const { data: service } = await adminSupabase
      .from('services')
      .select('id, name, price, duration_minutes, break_minutes')
      .eq('id', serviceId)
      .eq('tenant_id', tenant.id)
      .single();

    if (!service) {
      return { success: false, code: 'INVALID_SERVICE', message: 'Serviço não localizado.' };
    }

    const totalMinutes = service.duration_minutes + (service.break_minutes || 0);
    const endIso = new Date(new Date(startIso).getTime() + totalMinutes * 60 * 1000).toISOString();

    // Obtém ou cadastra o cliente via adminSupabase
    let clientId: string | null = null;
    const { data: existingClient } = await adminSupabase
      .from('clients')
      .select('id')
      .eq('tenant_id', tenant.id)
      .or(`whatsapp.eq.${cleanWhatsapp},phone.eq.${cleanWhatsapp}`)
      .limit(1)
      .maybeSingle();

    if (existingClient) {
      clientId = existingClient.id;
    } else {
      const { data: newClient, error: clientErr } = await adminSupabase
        .from('clients')
        .insert({
          tenant_id: tenant.id,
          full_name: cleanName,
          whatsapp: cleanWhatsapp,
          phone: cleanWhatsapp,
          email: clientEmail?.trim() || null,
          status: 'active',
          notes: 'Cadastrado via Agendamento Online Público',
        })
        .select('id')
        .single();

      if (clientErr || !newClient) {
        console.error('[Public Booking] Erro ao cadastrar cliente:', clientErr);
        return {
          success: false,
          code: 'CLIENT_CREATE_ERROR',
          message: 'Não foi possível registrar o cliente. Por favor, tente novamente.',
        };
      }
      clientId = newClient.id;
    }

    // Obtém nome do profissional
    const { data: prof } = await adminSupabase
      .from('professionals')
      .select('full_name')
      .eq('id', professionalId)
      .single();

    // Insere o agendamento oficial com verificação atômica de sobreposição
    const { data: newAppt, error: apptErr } = await adminSupabase
      .from('appointments')
      .insert({
        tenant_id: tenant.id,
        client_id: clientId,
        service_id: service.id,
        professional_id: professionalId,
        start_time: startIso,
        end_time: endIso,
        price: service.price,
        status: 'scheduled',
        notes: clientNotes?.trim() || 'Agendado pelo cliente via página pública.',
      })
      .select('id')
      .single();

    if (apptErr || !newAppt) {
      console.warn('[Public Booking] Erro na inserção do agendamento:', apptErr);
      const isConflict = apptErr?.message?.toLowerCase().includes('conflito') || apptErr?.code === '23P01';
      return {
        success: false,
        code: isConflict ? 'CONFLICT' : 'PERSISTENCE_ERROR',
        message: isConflict
          ? 'O horário selecionado já foi preenchido por outro agendamento. Por favor, escolha outro horário.'
          : (apptErr?.message || 'Falha ao gravar agendamento.'),
      };
    }

    return {
      success: true,
      appointmentId: newAppt.id,
      tenantName: tenant.name,
      serviceName: service.name,
      professionalName: prof?.full_name || 'Profissional',
      startTime: startIso,
      endTime: endIso,
      price: service.price,
      clientName: cleanName,
      clientWhatsapp: cleanWhatsapp,
      message: 'Agendamento confirmado com sucesso!',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Falha ao processar agendamento online.';
    return { success: false, message: msg };
  }
}
