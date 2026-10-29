import React from 'react';

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

/**
 * Renderizador leve de mensagens com suporte seguro a negrito (**texto**) e quebras de linha,
 * evitando a exibição crua de asteriscos sem necessidade de bibliotecas pesadas de Markdown.
 */
export function MarkdownMessage({ content, className = '' }: MarkdownMessageProps) {
  if (!content) return null;

  const lines = content.split('\n');

  return (
    <div className={`space-y-1.5 leading-relaxed ${className}`}>
      {lines.map((line, lineIdx) => {
        if (!line.trim()) {
          return <div key={lineIdx} className="h-2" />;
        }

        // Divide tokens por negrito (**...**)
        const parts: React.ReactNode[] = [];
        const regex = /\*\*(.*?)\*\*/g;
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(line)) !== null) {
          if (match.index > lastIndex) {
            parts.push(line.substring(lastIndex, match.index));
          }
          parts.push(
            <strong key={`${lineIdx}-${match.index}`} className="font-semibold text-inherit">
              {match[1]}
            </strong>
          );
          lastIndex = regex.lastIndex;
        }

        if (lastIndex < line.length) {
          parts.push(line.substring(lastIndex));
        }

        return (
          <p key={lineIdx} className="m-0 break-words">
            {parts}
          </p>
        );
      })}
    </div>
  );
}
