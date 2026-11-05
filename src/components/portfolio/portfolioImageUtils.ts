import React from 'react';

export interface PortfolioCrop {
  x?: number | null;
  y?: number | null;
  zoom?: number | null;
}

/**
 * Retorna as regras de estilo CSS estritamente idênticas para a fotografia do portfólio.
 *
 * Utiliza:
 * 1. transform-origin: `${posX}% ${posY}%`
 * 2. transform: scale(zoom)
 * 3. object-position: `${posX}% ${posY}%`
 *
 * Esta combinação garante que:
 * - O ponto focal escolhido pelo usuário (posX%, posY%) permaneça exatamente no mesmo
 *   lugar quando o zoom for aplicado ou quando a foto for enquadrada com object-cover.
 * - Tanto o editor (preview) quanto o painel administrativo e a vitrine pública aplicam
 *   EXATAMENTE os mesmos cálculos e propriedades CSS sobre a tag de imagem.
 */
export function getPortfolioImageStyle(crop?: PortfolioCrop | null): React.CSSProperties {
  const posX = typeof crop?.x === 'number' ? crop.x : 50;
  const posY = typeof crop?.y === 'number' ? crop.y : 50;
  const zoom = typeof crop?.zoom === 'number' && crop.zoom >= 1 ? crop.zoom : 1;

  return {
    objectPosition: `${posX}% ${posY}%`,
    transformOrigin: `${posX}% ${posY}%`,
    transform: zoom > 1 ? `scale(${zoom})` : undefined,
  };
}
