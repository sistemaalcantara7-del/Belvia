import { jsPDF } from 'jspdf';
import autoTable, { UserOptions } from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export interface ExportReportData {
  tenantName: string;
  startDate: string;
  endDate: string;
  professionalName?: string;
  serviceName?: string;
  activeTab: 'overview' | 'dre' | 'retention';
  accountingRegime: 'caixa' | 'competencia';
  metrics: {
    totalGrossReceived: number;
    totalRefunds: number;
    netReceived: number;
    totalCompletedCount: number;
    averageTicket: number;
    totalCommissionsPaid: number;
    totalCommissionsPending: number;
    totalExpensesPaidCash: number;
    totalExpensesIncurredCompetence: number;
    billedRevenueCompetence: number;
  };
  dailyEvolution: Array<{
    dateStr: string;
    label: string;
    received: number;
    refunded: number;
    net: number;
  }>;
  serviceDistribution: Array<{
    name: string;
    count: number;
    totalAmount: number;
  }>;
}

function formatBRL(val: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(val);
}

function formatDateBR(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/**
 * Exporta os dados financeiros e operacionais para PDF no formato A4 com a identidade visual ZELUNIA.
 */
export function exportReportToPDF(data: ExportReportData) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  // Header Decorativo ZELUNIA
  doc.setFillColor(30, 17, 21); // #1E1115
  doc.rect(0, 0, pageWidth, 24, 'F');

  // Faixa de destaque dourada/cobre
  doc.setFillColor(184, 112, 112); // #B87070
  doc.rect(0, 24, pageWidth, 1.5, 'F');

  // Título e Identificação no Cabeçalho
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('ZELUNIA — RELATÓRIO GERENCIAL', margin, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(234, 219, 206); // #EADBCE
  doc.text(
    `${data.tenantName} | Emitido em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`,
    margin,
    18
  );

  // Parâmetros de Filtro
  let currentY = 32;
  doc.setTextColor(30, 17, 21);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(
    data.activeTab === 'dre'
      ? `DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO (DRE GERENCIAL) — ${data.accountingRegime.toUpperCase()}`
      : 'VISÃO GERAL OPERACIONAL E FINANCEIRA',
    margin,
    currentY
  );

  currentY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(102, 83, 78); // #66534E
  const filterDesc = [
    `Período: ${formatDateBR(data.startDate)} até ${formatDateBR(data.endDate)}`,
    `Profissional: ${data.professionalName || 'Todos'}`,
    `Serviço: ${data.serviceName || 'Todos'}`,
  ].join('  |  ');
  doc.text(filterDesc, margin, currentY);

  currentY += 6;

  if (data.activeTab === 'overview') {
    // ── Resumo dos Indicadores Principais (Cards em Tabela) ──
    const summaryRows = [
      [
        'Receita Bruta Confirmada (Entradas)',
        formatBRL(data.metrics.totalGrossReceived),
        'Atendimentos Concluídos',
        String(data.metrics.totalCompletedCount),
      ],
      [
        'Estornos e Devoluções',
        `- ${formatBRL(data.metrics.totalRefunds)}`,
        'Ticket Médio Operacional',
        formatBRL(data.metrics.averageTicket),
      ],
      [
        'Receita Líquida Recebida',
        formatBRL(data.metrics.netReceived),
        'Comissões Pagas / Devidas',
        `${formatBRL(data.metrics.totalCommissionsPaid)} / ${formatBRL(data.metrics.totalCommissionsPending)}`,
      ],
    ];

    autoTable(doc, {
      startY: currentY,
      head: [['Indicador Financeiro', 'Valor', 'Indicador Operacional', 'Valor']],
      body: summaryRows,
      margin: { left: margin, right: margin },
      theme: 'grid',
      headStyles: {
        fillColor: [184, 112, 112],
        textColor: [255, 255, 255],
        fontSize: 8.5,
        fontStyle: 'bold',
        halign: 'left',
      },
      styles: {
        fontSize: 8,
        textColor: [30, 17, 21],
        cellPadding: 2.5,
      },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 55 },
        1: { halign: 'right', fontStyle: 'bold', textColor: [184, 112, 112], cellWidth: 35 },
        2: { fontStyle: 'bold', cellWidth: 55 },
        3: { halign: 'right', fontStyle: 'bold', cellWidth: 35 },
      },
    } as UserOptions);

    const afterSummary = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

    // ── Tabela de Distribuição por Serviço ──
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 17, 21);
    doc.text('Distribuição por Serviços Realizados', margin, afterSummary);

    const totalServiceCount = data.serviceDistribution.reduce((acc, s) => acc + s.count, 0);
    const serviceBody = data.serviceDistribution.length > 0
      ? data.serviceDistribution.map((s) => [
          s.name,
          String(s.count),
          totalServiceCount > 0 ? `${((s.count / totalServiceCount) * 100).toFixed(1)}%` : '0%',
          formatBRL(s.totalAmount),
        ])
      : [['Nenhum procedimento concluído no período', '-', '-', '-']];

    autoTable(doc, {
      startY: afterSummary + 3,
      head: [['Serviço', 'Qtd Realizada', 'Participação', 'Volume Total (R$)']],
      body: serviceBody,
      margin: { left: margin, right: margin },
      theme: 'striped',
      headStyles: {
        fillColor: [44, 24, 16], // #2C1810
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
      },
      styles: {
        fontSize: 8,
        cellPadding: 2,
      },
      columnStyles: {
        0: { cellWidth: 90 },
        1: { halign: 'center', cellWidth: 25 },
        2: { halign: 'center', cellWidth: 25 },
        3: { halign: 'right', fontStyle: 'bold', cellWidth: 40 },
      },
    } as UserOptions);

    const afterServices = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

    // ── Tabela de Evolução Financeira Diária ──
    if (afterServices < pageHeight - 40) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(30, 17, 21);
      doc.text('Evolução Diária de Entradas e Estornos', margin, afterServices);

      const evolutionBody = data.dailyEvolution.map((d) => [
        d.label,
        formatBRL(d.received),
        d.refunded > 0 ? `- ${formatBRL(d.refunded)}` : 'R$ 0,00',
        formatBRL(d.net),
      ]);

      autoTable(doc, {
        startY: afterServices + 3,
        head: [['Data', 'Entradas Brutas', 'Estornos/Devoluções', 'Resultado Líquido']],
        body: evolutionBody,
        margin: { left: margin, right: margin },
        theme: 'striped',
        headStyles: {
          fillColor: [102, 83, 78],
          textColor: [255, 255, 255],
          fontSize: 8,
          fontStyle: 'bold',
        },
        styles: {
          fontSize: 7.5,
          cellPadding: 1.8,
        },
        columnStyles: {
          0: { cellWidth: 45 },
          1: { halign: 'right', cellWidth: 45 },
          2: { halign: 'right', textColor: [211, 61, 41], cellWidth: 45 },
          3: { halign: 'right', fontStyle: 'bold', cellWidth: 45 },
        },
      } as UserOptions);
    }
  } else {
    // ── DRE Gerencial ──
    const isCaixa = data.accountingRegime === 'caixa';
    const grossRevenue = isCaixa ? data.metrics.totalGrossReceived : data.metrics.billedRevenueCompetence;
    const refunds = data.metrics.totalRefunds;
    const netRevenue = isCaixa ? data.metrics.netReceived : data.metrics.billedRevenueCompetence - refunds;
    const commissions = isCaixa
      ? data.metrics.totalCommissionsPaid
      : data.metrics.totalCommissionsPaid + data.metrics.totalCommissionsPending;
    const grossMargin = netRevenue - commissions;
    const expenses = isCaixa
      ? data.metrics.totalExpensesPaidCash
      : data.metrics.totalExpensesIncurredCompetence;
    const netOperatingResult = grossMargin - expenses;

    const dreRows = [
      [
        '(+) 1. Receita Bruta Operacional',
        isCaixa
          ? 'Total de pagamentos liquidados (dinheiro, pix, cartões)'
          : 'Faturamento bruto de procedimentos concluídos no período',
        formatBRL(grossRevenue),
      ],
      [
        '(-) 2. Deduções da Receita Bruta',
        'Estornos, cancelamentos compensatórios e devoluções confirmadas',
        `- ${formatBRL(refunds)}`,
      ],
      [
        '(=) 3. Receita Operacional Líquida',
        'Receita Bruta deduzida das devoluções do período',
        formatBRL(netRevenue),
      ],
      [
        '(-) 4. Custos Diretos de Serviços (Comissões)',
        isCaixa
          ? 'Comissões efetivamente pagas no período (status = paid)'
          : 'Comissões incorridas nos atendimentos do período (pagas + a pagar)',
        `- ${formatBRL(commissions)}`,
      ],
      [
        '(=) 5. Margem Operacional Bruta',
        'Receita Líquida deduzida das comissões operacionais',
        formatBRL(grossMargin),
      ],
      [
        '(-) 6. Despesas Operacionais (Contas a Pagar + Caixa)',
        isCaixa
          ? 'Despesas liquidadas no período via conta bancária ou gaveta de caixa'
          : 'Despesas incorridas com mês de competência no período',
        `- ${formatBRL(expenses)}`,
      ],
      [
        '(=) 7. Resultado Operacional Gerencial Apurado',
        isCaixa
          ? 'Sobra líquida de caixa após deduções, comissões pagas e despesas liquidadas'
          : 'Lucro/Resultado econômico da operação apurado por competência',
        formatBRL(netOperatingResult),
      ],
    ];

    autoTable(doc, {
      startY: currentY,
      head: [['Rubrica Contábil', 'Conceito / Detalhamento', 'Valor Apurado']],
      body: dreRows,
      margin: { left: margin, right: margin },
      theme: 'grid',
      headStyles: {
        fillColor: [30, 17, 21], // #1E1115
        textColor: [255, 255, 255],
        fontSize: 8.5,
        fontStyle: 'bold',
      },
      styles: {
        fontSize: 8,
        cellPadding: 3,
      },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 70 },
        1: { cellWidth: 75, textColor: [102, 83, 78] },
        2: { halign: 'right', fontStyle: 'bold', cellWidth: 35 },
      },
      didParseCell: (hookData) => {
        // Destaque de linhas totais/líquidas
        if (hookData.section === 'body') {
          const rowIndex = hookData.row.index;
          if (rowIndex === 2 || rowIndex === 4) {
            hookData.cell.styles.fillColor = [250, 245, 243]; // #FAF5F3
          } else if (rowIndex === 6) {
            hookData.cell.styles.fillColor = [250, 240, 236]; // #FAF0EC
            hookData.cell.styles.textColor = [184, 112, 112]; // #B87070
          }
        }
      },
    } as UserOptions);

    const afterDre = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

    // Nota de Rodapé de Integridade
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(125, 107, 101);
    doc.text(
      'Princípio Contábil da Não Estimativa: Indicadores sem fonte financeira estruturada no banco são reportados como indisponíveis. Valores calculados exclusivamente com base em dados reais liquidados no Supabase.',
      margin,
      afterDre,
      { maxWidth: pageWidth - margin * 2 }
    );
  }

  // Rodapé & Paginação em todas as páginas
  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(234, 219, 206);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(168, 148, 141);
    doc.text('ZELUNIA Gestão de Alta Performance — Documento Confidencial', margin, pageHeight - 7);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, pageHeight - 7, { align: 'right' });
  }

  const fileName = `ZELUNIA_${data.activeTab === 'dre' ? 'DRE' : 'Relatorio'}_${data.startDate}_${data.endDate}.pdf`;
  doc.save(fileName);
}

/**
 * Exporta os dados financeiros e operacionais para planilha Excel (.xlsx) com múltiplas abas formatadas.
 */
export function exportReportToExcel(data: ExportReportData) {
  const wb = XLSX.utils.book_new();

  // 1. ABA: DRE Gerencial
  const isCaixa = data.accountingRegime === 'caixa';
  const grossRevenue = isCaixa ? data.metrics.totalGrossReceived : data.metrics.billedRevenueCompetence;
  const refunds = data.metrics.totalRefunds;
  const netRevenue = isCaixa ? data.metrics.netReceived : data.metrics.billedRevenueCompetence - refunds;
  const commissions = isCaixa
    ? data.metrics.totalCommissionsPaid
    : data.metrics.totalCommissionsPaid + data.metrics.totalCommissionsPending;
  const grossMargin = netRevenue - commissions;
  const expenses = isCaixa
    ? data.metrics.totalExpensesPaidCash
    : data.metrics.totalExpensesIncurredCompetence;
  const netOperatingResult = grossMargin - expenses;

  const dreAoa = [
    ['ZELUNIA — DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO (DRE GERENCIAL)'],
    ['Estabelecimento:', data.tenantName],
    ['Período:', `${formatDateBR(data.startDate)} até ${formatDateBR(data.endDate)}`],
    ['Regime de Apuração:', isCaixa ? 'Regime de Caixa (Liquidação Efetiva)' : 'Regime de Competência (Faturamento Gerado)'],
    ['Data de Emissão:', new Date().toLocaleString('pt-BR')],
    [],
    ['Código', 'Rubrica Contábil', 'Conceito / Detalhamento', 'Valor (R$)'],
    ['1', '(+) 1. Receita Bruta Operacional', isCaixa ? 'Total de pagamentos liquidados (dinheiro, pix, cartões)' : 'Faturamento bruto de procedimentos concluídos', grossRevenue],
    ['2', '(-) 2. Deduções da Receita Bruta', 'Estornos e devoluções confirmadas', -refunds],
    ['3', '(=) 3. Receita Operacional Líquida', 'Receita Bruta deduzida das devoluções', netRevenue],
    ['4', '(-) 4. Custos Diretos de Serviços (Comissões)', isCaixa ? 'Comissões efetivamente pagas no período' : 'Comissões incorridas no período (pagas + devidas)', -commissions],
    ['5', '(=) 5. Margem Operacional Bruta', 'Receita Líquida deduzida das comissões operacionais', grossMargin],
    ['6', '(-) 6. Despesas Operacionais (Contas a Pagar + Caixa)', isCaixa ? 'Despesas pagas no período via banco ou gaveta' : 'Despesas incorridas com competência no período', -expenses],
    ['7', '(=) 7. Resultado Operacional Gerencial Apurado', isCaixa ? 'Sobra líquida de caixa após deduções, comissões e despesas' : 'Resultado econômico da operação apurado por competência', netOperatingResult],
    [],
    ['Nota:', 'Valores calculados com base em transações reais do Supabase, sem estimativas arbitrárias.'],
  ];

  const wsDre = XLSX.utils.aoa_to_sheet(dreAoa);
  wsDre['!cols'] = [{ wch: 8 }, { wch: 42 }, { wch: 55 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsDre, 'DRE Gerencial');

  // 2. ABA: Indicadores Operacionais
  const indicatorsAoa = [
    ['ZELUNIA — INDICADORES DA VISÃO GERAL'],
    ['Estabelecimento:', data.tenantName],
    ['Período:', `${formatDateBR(data.startDate)} até ${formatDateBR(data.endDate)}`],
    [],
    ['Indicador', 'Valor Numérico', 'Unidade / Formato'],
    ['Receita Bruta Confirmada (Entradas)', data.metrics.totalGrossReceived, 'R$'],
    ['Estornos e Devoluções', data.metrics.totalRefunds, 'R$'],
    ['Receita Líquida Recebida', data.metrics.netReceived, 'R$'],
    ['Atendimentos Concluídos', data.metrics.totalCompletedCount, 'Qtd'],
    ['Ticket Médio Operacional', data.metrics.averageTicket, 'R$'],
    ['Comissões Efetivamente Pagas', data.metrics.totalCommissionsPaid, 'R$'],
    ['Comissões Pendentes (Devidas)', data.metrics.totalCommissionsPending, 'R$'],
    ['Despesas Operacionais Pagas em Caixa', data.metrics.totalExpensesPaidCash, 'R$'],
    ['Despesas Incorridas na Competência', data.metrics.totalExpensesIncurredCompetence, 'R$'],
  ];

  const wsInd = XLSX.utils.aoa_to_sheet(indicatorsAoa);
  wsInd['!cols'] = [{ wch: 38 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsInd, 'Indicadores');

  // 3. ABA: Distribuição por Serviços
  const servicesAoa = [
    ['ZELUNIA — DISTRIBUIÇÃO POR SERVIÇOS REALIZADOS'],
    ['Período:', `${formatDateBR(data.startDate)} até ${formatDateBR(data.endDate)}`],
    [],
    ['Serviço', 'Quantidade Realizada', 'Percentual', 'Valor Total Contratado (R$)'],
  ];

  const totalServCount = data.serviceDistribution.reduce((acc, s) => acc + s.count, 0);
  data.serviceDistribution.forEach((s) => {
    servicesAoa.push([
      s.name,
      s.count as unknown as string,
      (totalServCount > 0 ? (s.count / totalServCount) * 100 : 0).toFixed(2) + '%',
      s.totalAmount as unknown as string,
    ]);
  });

  const wsServ = XLSX.utils.aoa_to_sheet(servicesAoa);
  wsServ['!cols'] = [{ wch: 35 }, { wch: 22 }, { wch: 15 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, wsServ, 'Serviços');

  // 4. ABA: Evolução Diária
  const evolutionAoa = [
    ['ZELUNIA — EVOLUÇÃO DIÁRIA DE ENTRADAS E ESTORNOS'],
    ['Período:', `${formatDateBR(data.startDate)} até ${formatDateBR(data.endDate)}`],
    [],
    ['Data', 'Entradas Brutas (R$)', 'Estornos / Devoluções (R$)', 'Resultado Líquido (R$)'],
  ];

  data.dailyEvolution.forEach((d) => {
    evolutionAoa.push([
      d.label,
      d.received as unknown as string,
      d.refunded as unknown as string,
      d.net as unknown as string,
    ]);
  });

  const wsEvol = XLSX.utils.aoa_to_sheet(evolutionAoa);
  wsEvol['!cols'] = [{ wch: 15 }, { wch: 22 }, { wch: 25 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsEvol, 'Evolução Diária');

  const fileName = `ZELUNIA_Financeiro_${data.startDate}_${data.endDate}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
