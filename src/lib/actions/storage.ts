'use server';

import sharp from 'sharp';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { assertActiveSubscription } from '@/lib/plans/entitlements';

export type EntityImageType = 'services' | 'professionals' | 'portfolio';

export interface UploadEntityImageResult {
  success: boolean;
  publicUrl?: string;
  error?: string;
}

const ENTITY_CONFIGS: Record<
  EntityImageType,
  {
    maxWidth: number;
    maxHeight: number;
    maxSizeBytes: number; // Bytes no servidor
    quality: number;
  }
> = {
  services: {
    maxWidth: 800,
    maxHeight: 600,
    maxSizeBytes: 300 * 1024, // 300 KB
    quality: 80,
  },
  professionals: {
    maxWidth: 600,
    maxHeight: 600,
    maxSizeBytes: 200 * 1024, // 200 KB
    quality: 80,
  },
  portfolio: {
    maxWidth: 1200,
    maxHeight: 1200,
    maxSizeBytes: 350 * 1024, // 350 KB
    quality: 80,
  },
};

const BUCKET_NAME = 'public-assets';

/**
 * Faz o processamento seguro no servidor (sharp), validação de dimensões e upload
 * para o Supabase Storage no caminho isolado: `{tenant_id}/{entityType}/{timestamp}_{random}.webp`
 */
export async function uploadEntityImageAction(
  tenantSlug: string,
  entityType: EntityImageType,
  formData: FormData
): Promise<UploadEntityImageResult> {
  try {
    const context = await getAuthenticatedTenantContext(tenantSlug);
    if (!context) {
      return { success: false, error: 'Acesso negado.' };
    }

    const subCheck = assertActiveSubscription(context);
    if (!subCheck.allowed) {
      return { success: false, error: subCheck.error };
    }

    if (!['owner', 'admin'].includes(context.role)) {
      return { success: false, error: 'Permissão negada para alterar imagens do catálogo.' };
    }

    const file = formData.get('file') as File | null;
    if (!file || !(file instanceof File) || file.size === 0) {
      return { success: false, error: 'Nenhum arquivo de imagem válido enviado.' };
    }

    // Limite prévio de arquivo de entrada (ex: máx 10 MB antes do processamento)
    if (file.size > 10 * 1024 * 1024) {
      return { success: false, error: 'Arquivo excede o tamanho máximo de 10 MB.' };
    }

    const arrayBuffer = await file.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    const config = ENTITY_CONFIGS[entityType];
    if (!config) {
      return { success: false, error: 'Tipo de entidade desconhecido para upload.' };
    }

    // Processamento estrito no servidor via Sharp
    // Redimensionamento proporcional (fit inside, sem corte desnecessário ou distorção)
    let processedBuffer: Buffer;
    try {
      processedBuffer = await sharp(inputBuffer)
        .rotate() // Trata orientação EXIF de celulares
        .resize({
          width: config.maxWidth,
          height: config.maxHeight,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: config.quality })
        .toBuffer();
    } catch {
      return { success: false, error: 'Formato de imagem inválido ou não suportado.' };
    }

    // Se o buffer processado ainda ultrapassar o teto máximo permitido da regra
    if (processedBuffer.length > config.maxSizeBytes) {
      // Tenta uma segunda passagem com qualidade menor para respeitar a restrição
      try {
        processedBuffer = await sharp(inputBuffer)
          .rotate()
          .resize({
            width: config.maxWidth,
            height: config.maxHeight,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality: 65 })
          .toBuffer();
      } catch {
        return { success: false, error: 'Não foi possível compactar a imagem nos limites especificados.' };
      }

      if (processedBuffer.length > config.maxSizeBytes) {
        return {
          success: false,
          error: `A imagem processada (${Math.round(processedBuffer.length / 1024)} KB) excede o limite máximo permitido de ${Math.round(config.maxSizeBytes / 1024)} KB.`,
        };
      }
    }

    const supabase = await createClient();

    // Cria o caminho estruturado por tenant_id: {tenant_id}/{entityType}/{timestamp}_{random}.webp
    const randomHex = Math.random().toString(36).substring(2, 10);
    const fileName = `${Date.now()}_${randomHex}.webp`;
    const filePath = `${context.tenantId}/${entityType}/${fileName}`;

    // Upload no Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, processedBuffer, {
        contentType: 'image/webp',
        cacheControl: '31536000', // 1 ano de cache
        upsert: false,
      });

    if (uploadError) {
      return { success: false, error: 'Falha ao armazenar arquivo no Storage: ' + uploadError.message };
    }

    // Obtém URL pública permanente
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    return {
      success: true,
      publicUrl: publicUrlData.publicUrl,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro interno ao realizar upload da imagem.';
    return { success: false, error: msg };
  }
}

/**
 * Remove imagem antiga do storage para evitar arquivos órfãos,
 * garantindo que a remoção seja estritamente dentro da pasta do tenant autenticado.
 */
export async function deleteEntityImageAction(
  tenantSlug: string,
  imageUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!imageUrl || !imageUrl.includes(BUCKET_NAME)) {
      return { success: true }; // Nada a remover do storage
    }

    const context = await getAuthenticatedTenantContext(tenantSlug);
    if (!context) {
      return { success: false, error: 'Acesso negado.' };
    }

    if (!['owner', 'admin'].includes(context.role)) {
      return { success: false, error: 'Permissão negada para excluir arquivos.' };
    }

    // Extrai o caminho relativo após /public-assets/
    const marker = `/${BUCKET_NAME}/`;
    const idx = imageUrl.indexOf(marker);
    if (idx === -1) {
      return { success: true };
    }

    const relativePath = imageUrl.substring(idx + marker.length).split('?')[0];

    // Validação de isolamento: o caminho DEVE começar com o tenantId deste usuário
    if (!relativePath.startsWith(`${context.tenantId}/`)) {
      return { success: false, error: 'Tentativa de remover arquivo de outro estabelecimento bloqueada por segurança.' };
    }

    const supabase = await createClient();
    const { error } = await supabase.storage.from(BUCKET_NAME).remove([relativePath]);

    if (error) {
      console.warn('Aviso: falha ao remover arquivo órfão do Storage:', error.message);
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao remover imagem.';
    return { success: false, error: msg };
  }
}
