-- ==============================================================================
-- BELVIA SaaS - Migration Fase: Upload de Imagens para Serviços e Profissionais
-- Arquivo: 20261104000044_services_and_professionals_image_upload.sql
--
-- Destaques:
-- 1. Adiciona coluna image_url em public.services (TEXT, nullable).
-- 2. Cria o bucket de storage público 'public-assets' caso ainda não exista.
-- 3. Habilita RLS no Supabase Storage para isolamento multi-tenant seguro:
--    - Leitura pública para assets públicos (vitrine e páginas online).
--    - Inserção/Atualização/Deleção restrita aos usuários autenticados do respectivo tenant.
-- ==============================================================================

-- 1. Adicionar image_url na tabela services (caso não exista)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'services' 
          AND column_name = 'image_url'
    ) THEN
        ALTER TABLE public.services ADD COLUMN image_url TEXT NULL;
    END IF;
END $$;

-- 2. Criar Bucket 'public-assets' em storage.buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'public-assets',
    'public-assets',
    true,
    5242880, -- 5 MB limite global máximo
    ARRAY['image/webp', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/webp', 'image/jpeg', 'image/png'];

-- 3. Políticas de Segurança (RLS) no Supabase Storage
-- Leitura pública de assets
DROP POLICY IF EXISTS "Public assets can be viewed by anyone" ON storage.objects;
CREATE POLICY "Public assets can be viewed by anyone"
ON storage.objects FOR SELECT
USING (bucket_id = 'public-assets');

-- Escrita restrita a membros autenticados do tenant:
-- O caminho do storage segue a convenção: {tenant_id}/services/... ou {tenant_id}/professionals/...
DROP POLICY IF EXISTS "Tenant users can upload their own public assets" ON storage.objects;
CREATE POLICY "Tenant users can upload their own public assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'public-assets'
    AND EXISTS (
        SELECT 1 FROM public.tenant_users tu
        WHERE tu.user_id = auth.uid()
          AND tu.tenant_id::text = (storage.foldername(name))[1]
          AND tu.role IN ('owner', 'admin')
    )
);

DROP POLICY IF EXISTS "Tenant users can update their own public assets" ON storage.objects;
CREATE POLICY "Tenant users can update their own public assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'public-assets'
    AND EXISTS (
        SELECT 1 FROM public.tenant_users tu
        WHERE tu.user_id = auth.uid()
          AND tu.tenant_id::text = (storage.foldername(name))[1]
          AND tu.role IN ('owner', 'admin')
    )
);

DROP POLICY IF EXISTS "Tenant users can delete their own public assets" ON storage.objects;
CREATE POLICY "Tenant users can delete their own public assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'public-assets'
    AND EXISTS (
        SELECT 1 FROM public.tenant_users tu
        WHERE tu.user_id = auth.uid()
          AND tu.tenant_id::text = (storage.foldername(name))[1]
          AND tu.role IN ('owner', 'admin')
    )
);
