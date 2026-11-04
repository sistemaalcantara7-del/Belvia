export interface ClientImageCompressionOptions {
  maxWidth: number;
  maxHeight: number;
  quality?: number; // 0 a 1 (padrão 0.8)
  maxSizeBytes: number;
}

/**
 * Redimensiona e compacta uma imagem no navegador para WebP,
 * preservando proporções sem distorção.
 */
export async function compressImageInBrowser(
  file: File,
  options: ClientImageCompressionOptions
): Promise<File> {
  const { maxWidth, maxHeight, quality = 0.8, maxSizeBytes } = options;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Erro ao ler arquivo da imagem'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagem inválido ou corrompido'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calcula proporção para não exceder limites máximos
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Não foi possível obter contexto 2D para processamento'));
        }

        // Desenha imagem redimensionada
        ctx.drawImage(img, 0, 0, width, height);

        // Função iterativa para tentar manter abaixo do tamanho limite
        const currentQuality = quality;

        const tryExport = (q: number) => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                return reject(new Error('Falha ao converter imagem para WebP'));
              }

              // Se exceder o limite de tamanho e a qualidade ainda puder cair, reduz
              if (blob.size > maxSizeBytes && q > 0.4) {
                tryExport(q - 0.15);
              } else {
                const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || 'image';
                const compressedFile = new File([blob], `${baseName}.webp`, {
                  type: 'image/webp',
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              }
            },
            'image/webp',
            q
          );
        };

        tryExport(currentQuality);
      };

      img.src = e.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
}
