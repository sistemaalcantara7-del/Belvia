import React, { useRef, useState, useEffect } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Move,
  Sparkles,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getPortfolioImageStyle } from './portfolioImageUtils';

export interface CropSettings {
  x: number; // Porcentagem de 0 a 100 (posição focal / deslocamento horizontal)
  y: number; // Porcentagem de 0 a 100 (posição focal / deslocamento vertical)
  zoom: number; // Escala de 1 a 3
}

interface ImageFocalCropEditorProps {
  imageUrl: string;
  initialCrop?: CropSettings | null;
  onChange: (crop: CropSettings) => void;
  label?: string;
}

export function ImageFocalCropEditor({
  imageUrl,
  initialCrop,
  onChange,
  label = 'Enquadramento da Fotografia (Proporção 4:5)',
}: ImageFocalCropEditorProps) {
  const [zoom, setZoom] = useState<number>(initialCrop?.zoom ?? 1);
  const [posX, setPosX] = useState<number>(initialCrop?.x ?? 50);
  const [posY, setPosY] = useState<number>(initialCrop?.y ?? 50);
  const [isDragging, setIsDragging] = useState(false);
  const [naturalAspect, setNaturalAspect] = useState<number | null>(null);

  // Sincronização segura quando a URL da imagem mudar
  const [prevImageUrl, setPrevImageUrl] = useState(imageUrl);
  if (imageUrl !== prevImageUrl) {
    setPrevImageUrl(imageUrl);
    setPosX(initialCrop?.x ?? 50);
    setPosY(initialCrop?.y ?? 50);
    setZoom(initialCrop?.zoom ?? 1);
  }

  // Detectar aspect ratio natural da imagem carregada
  useEffect(() => {
    if (!imageUrl) return;
    const img = new window.Image();
    img.src = imageUrl;
    img.onload = () => {
      if (img.naturalWidth && img.naturalHeight) {
        setNaturalAspect(img.naturalWidth / img.naturalHeight);
      }
    };
  }, [imageUrl]);

  const containerRef = useRef<HTMLDivElement>(null);
  const isPointerDownRef = useRef(false);
  const pointerStartRef = useRef<{
    clientX: number;
    clientY: number;
    startX: number;
    startY: number;
    rectWidth: number;
    rectHeight: number;
  }>({
    clientX: 0,
    clientY: 0,
    startX: 50,
    startY: 50,
    rectWidth: 260,
    rectHeight: 325,
  });

  const updateCrop = (newX: number, newY: number, newZoom: number) => {
    const clampedX = Math.min(100, Math.max(0, Math.round(newX * 10) / 10));
    const clampedY = Math.min(100, Math.max(0, Math.round(newY * 10) / 10));
    const clampedZoom = Math.min(3, Math.max(1, Math.round(newZoom * 100) / 100));

    setPosX(clampedX);
    setPosY(clampedY);
    setZoom(clampedZoom);
    onChange({ x: clampedX, y: clampedY, zoom: clampedZoom });
  };

  // Cálculo da folga disponível no eixo (overflow em relação ao container 4:5 = 0.8)
  // Para manter a imagem preenchendo a moldura sem bordas vazias:
  const targetAspect = 0.8; // 4/5
  const imageAspect = naturalAspect || 0.8;

  // roomX e roomY determinam a margem de arrasto real:
  // Se imageAspect > targetAspect (foto horizontal/larga), temos folga horizontal mesmo em zoom=1.
  // Se imageAspect < targetAspect (foto mais alta que 4:5), temos folga vertical mesmo em zoom=1.
  // Além disso, com zoom > 1, ganha-se (zoom - 1) de margem adicional em ambas as direções.
  const extraXFactor = imageAspect > targetAspect ? (imageAspect / targetAspect - 1) : 0;
  const extraYFactor = imageAspect < targetAspect ? (targetAspect / imageAspect - 1) : 0;
  const availableSpanX = (zoom - 1) + extraXFactor * zoom;
  const availableSpanY = (zoom - 1) + extraYFactor * zoom;

  // Sensibilidade do arrasto em pixels:
  // Se availableSpan for pequeno, o arrasto afeta diretamente a posição percentual proporcionalmente
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    isPointerDownRef.current = true;
    setIsDragging(true);

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignora falhas em navegadores que restringem setPointerCapture
    }

    const rect = containerRef.current?.getBoundingClientRect();
    pointerStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      startX: posX,
      startY: posY,
      rectWidth: rect?.width || 260,
      rectHeight: rect?.height || 325,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDownRef.current) return;

    const deltaPixelX = e.clientX - pointerStartRef.current.clientX;
    const deltaPixelY = e.clientY - pointerStartRef.current.clientY;

    // Converte delta de pixel para deslocamento percentual (invertido: arrastar para direita expõe o lado esquerdo)
    // O fator de sensibilidade garante resposta imediata ao toque/mouse
    const effectiveSpanX = Math.max(availableSpanX, 0.35);
    const effectiveSpanY = Math.max(availableSpanY, 0.35);

    const percentDeltaX = (deltaPixelX / (pointerStartRef.current.rectWidth * effectiveSpanX)) * 50;
    const percentDeltaY = (deltaPixelY / (pointerStartRef.current.rectHeight * effectiveSpanY)) * 50;

    const nextX = pointerStartRef.current.startX - percentDeltaX;
    const nextY = pointerStartRef.current.startY - percentDeltaY;

    updateCrop(nextX, nextY, zoom);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isPointerDownRef.current) {
      isPointerDownRef.current = false;
      setIsDragging(false);
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignora
      }
    }
  };

  const handleReset = () => {
    updateCrop(50, 50, 1);
  };

  const handleCenter = () => {
    updateCrop(50, 50, zoom);
  };

  const handleZoomChange = (newZoom: number) => {
    updateCrop(posX, posY, newZoom);
  };

  const handleNudge = (deltaX: number, deltaY: number) => {
    updateCrop(posX + deltaX, posY + deltaY, zoom);
  };

  return (
    <div className="space-y-3 bg-[#FAF6F3] dark:bg-zinc-900/60 p-4 rounded-2xl border border-[#EADBCE] dark:border-zinc-800">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#EADBCE]/60 dark:border-zinc-800 pb-2.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#2C1810] dark:text-zinc-200">
          <Move className="w-3.5 h-3.5 text-[#BD7165]" />
          <span>{label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCenter}
            className="h-7 text-[11px] px-2.5 bg-white dark:bg-zinc-800 border-[#EADBCE] hover:text-[#BD7165]"
          >
            Centralizar
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="h-7 text-[11px] px-2.5 bg-white dark:bg-zinc-800 border-[#EADBCE] hover:text-[#BD7165] gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Restaurar</span>
          </Button>
        </div>
      </div>

      <p className="text-[11px] text-[#7D6B65] dark:text-zinc-400">
        Clique e arraste a fotografia dentro da moldura para posicionar o foco (rosto, cabelo, unhas) e utilize o zoom para aproximar.
      </p>

      {/* Container de Prévia com Proporção Vertical 4:5 e Pointer Events */}
      <div className="flex flex-col items-center gap-2 py-1">
        <div
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ touchAction: 'none' }}
          className={`relative w-[240px] sm:w-[260px] aspect-[4/5] bg-[#FAF4F1] rounded-2xl overflow-hidden shadow-inner border-2 border-[#BD7165]/50 select-none ${
            isDragging ? 'cursor-grabbing ring-2 ring-[#BD7165]/40' : 'cursor-grab'
          }`}
          title="Clique e arraste em qualquer direção para ajustar o enquadramento"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Prévia de enquadramento"
            draggable={false}
            className="w-full h-full object-cover pointer-events-none transition-transform duration-75 ease-out"
            style={getPortfolioImageStyle({
              x: posX,
              y: posY,
              zoom,
            })}
          />

          {/* Guia de grade sutil para auxílio do enquadramento da regra dos terços */}
          <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-20 border border-white">
            <div className="border-r border-b border-white" />
            <div className="border-r border-b border-white" />
            <div className="border-b border-white" />
            <div className="border-r border-b border-white" />
            <div className="border-r border-b border-white" />
            <div className="border-b border-white" />
            <div className="border-r border-white" />
            <div className="border-r border-white" />
            <div />
          </div>

          {/* Badge de Prévia Proporção 4:5 e Posição */}
          <div className="absolute bottom-2 left-2 pointer-events-none">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-black/60 text-white backdrop-blur-xs">
              <Sparkles className="w-2.5 h-2.5 text-[#FDEEEA]" />
              <span>4:5 (X: {Math.round(posX)}%, Y: {Math.round(posY)}%)</span>
            </span>
          </div>
        </div>

        {/* Botões de Ajuste Fino / Teclado Acessível */}
        <div className="flex items-center gap-1 text-[11px] text-[#7D6B65]">
          <span className="text-[10px] uppercase font-bold mr-1">Ajuste fino:</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => handleNudge(-5, 0)}
            className="h-6 w-6 rounded-md hover:bg-[#EADBCE]/50"
            title="Mover para esquerda"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => handleNudge(0, -5)}
            className="h-6 w-6 rounded-md hover:bg-[#EADBCE]/50"
            title="Mover para cima"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => handleNudge(0, 5)}
            className="h-6 w-6 rounded-md hover:bg-[#EADBCE]/50"
            title="Mover para baixo"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => handleNudge(5, 0)}
            className="h-6 w-6 rounded-md hover:bg-[#EADBCE]/50"
            title="Mover para direita"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Controle Deslizante de Zoom */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between text-xs font-medium text-[#2C1810] dark:text-zinc-200">
          <span className="flex items-center gap-1 text-[11px] text-[#7D6B65]">
            <ZoomOut className="w-3.5 h-3.5" />
            <span>Nível de Zoom</span>
          </span>
          <span className="text-xs font-bold text-[#BD7165]">{zoom.toFixed(2)}x</span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="1"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
            className="w-full accent-[#BD7165] cursor-pointer"
          />
          <ZoomIn className="w-4 h-4 text-[#7D6B65] shrink-0" />
        </div>
      </div>
    </div>
  );
}
