import React, { useRef, useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Move, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface CropSettings {
  x: number; // Porcentagem de 0 a 100 (posição focal / deslocamento)
  y: number; // Porcentagem de 0 a 100
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

  // Sincronização segura sem setState em useEffect cascata
  const [prevImageUrl, setPrevImageUrl] = useState(imageUrl);
  if (imageUrl !== prevImageUrl) {
    setPrevImageUrl(imageUrl);
    setPosX(initialCrop?.x ?? 50);
    setPosY(initialCrop?.y ?? 50);
    setZoom(initialCrop?.zoom ?? 1);
  }

  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number; initialPosX: number; initialPosY: number }>({
    x: 0,
    y: 0,
    initialPosX: 50,
    initialPosY: 50,
  });

  const updateCrop = (newX: number, newY: number, newZoom: number) => {
    setPosX(newX);
    setPosY(newY);
    setZoom(newZoom);
    onChange({ x: newX, y: newY, zoom: newZoom });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialPosX: posX,
      initialPosY: posY,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    const deltaX = (e.clientX - dragStartRef.current.x) / (rect.width * zoom);
    const deltaY = (e.clientY - dragStartRef.current.y) / (rect.height * zoom);

    const newX = Math.min(100, Math.max(0, dragStartRef.current.initialPosX - deltaX * 100));
    const newY = Math.min(100, Math.max(0, dragStartRef.current.initialPosY - deltaY * 100));

    const roundedX = Math.round(newX * 10) / 10;
    const roundedY = Math.round(newY * 10) / 10;

    setPosX(roundedX);
    setPosY(roundedY);
    onChange({ x: roundedX, y: roundedY, zoom });
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  // Suporte a Touch em Celular e Tablets
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      isDraggingRef.current = true;
      dragStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        initialPosX: posX,
        initialPosY: posY,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current || !containerRef.current || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const rect = containerRef.current.getBoundingClientRect();

    const deltaX = (touch.clientX - dragStartRef.current.x) / (rect.width * zoom);
    const deltaY = (touch.clientY - dragStartRef.current.y) / (rect.height * zoom);

    const newX = Math.min(100, Math.max(0, dragStartRef.current.initialPosX - deltaX * 100));
    const newY = Math.min(100, Math.max(0, dragStartRef.current.initialPosY - deltaY * 100));

    const roundedX = Math.round(newX * 10) / 10;
    const roundedY = Math.round(newY * 10) / 10;

    setPosX(roundedX);
    setPosY(roundedY);
    onChange({ x: roundedX, y: roundedY, zoom });
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
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
        Arraste a imagem para posicionar o foco (rosto, cabelo, unhas) e utilize o zoom para eliminar áreas vazias indesejadas.
      </p>

      {/* Container de Prévia com Proporção Vertical 4:5 Fiel ao Card */}
      <div className="flex justify-center py-1">
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="relative w-[240px] sm:w-[260px] aspect-[4/5] bg-[#FAF4F1] rounded-2xl overflow-hidden shadow-inner border-2 border-[#BD7165]/40 cursor-grab active:cursor-grabbing select-none"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Prévia de enquadramento"
            draggable={false}
            className="w-full h-full object-cover pointer-events-none transition-transform duration-75 ease-out"
            style={{
              transform: `scale(${zoom})`,
              objectPosition: `${posX}% ${posY}%`,
            }}
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

          {/* Badge de Prévia Proporção 4:5 */}
          <div className="absolute bottom-2 left-2 pointer-events-none">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-black/60 text-white backdrop-blur-xs">
              <Sparkles className="w-2.5 h-2.5 text-[#FDEEEA]" />
              <span>Prévia 4:5 (Foco: {Math.round(posX)}%, {Math.round(posY)}%)</span>
            </span>
          </div>
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
