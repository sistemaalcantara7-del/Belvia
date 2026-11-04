
async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FinancialReportData } from '@/lib/actions/financialReports';

function formatCurrency(val: number): string {
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

const PERIOD_LABELS: Record<string, string> = {
  daily: 'Relatório Diário de Caixa & Movimentações',
  weekly: 'Relatório Semanal de Entradas & Saídas',
  monthly: 'Demonstrativo Mensal de Receitas & Despesas',
  yearly: 'Consolidado Anual com Projeção Histórica',
};

/**
 * Gera PDF em formato A4 Profissional com Timbre Oficial do Tenant.
 * - Logomarca (se houver) ou monograma tipográfico
 * - Nome/Razão Social e dados cadastrais (CNPJ, endereço, telefone/whatsapp)
 * - Tabelas estruturadas de Receitas, Despesas, Saldo Líquido e Formas de Pagamento
 * - Projeção Anual discriminando valores reais de estimados
 * - Não inventa dados ausentes (omite linhas de endereço/CNPJ se não preenchidas)
 */
export async function generateFinancialReportPDF(report: FinancialReportData) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  // ── 1. TOPO & TIMBRE INSTITUCIONAL DO TENANT ───────────────────────────
  // Faixa de cabeçalho
  doc.setFillColor(30, 17, 21); // #1E1115
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Linha dourada/cobre de assinatura ZELUNIA
  doc.setFillColor(184, 112, 112); // #B87070
  doc.rect(0, 28, pageWidth, 1.5, 'F');

  // Logomarca do Tenant no Cabeçalho (à direita)
  if (report.tenantDetails?.logo_url) {
    try {
      const logoBase64 = await fetchImageAsBase64(report.tenantDetails.logo_url);
      if (logoBase64) {
        // Insere logo no topo direito com fundo discreto
        doc.addImage(logoBase64, 'JPEG', pageWidth - margin - 22, 3, 22, 22);
      }
    } catch {
      // Ignora erro e mantém timbre textual
    }
  }

  // Nome do Estabelecimento (Timbre)
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(report.tenantName.toUpperCase(), margin, 12);

  // Dados Cadastrais disponíveis no Timbre (sem inventar dados)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(234, 219, 206); // #EADBCE

  const contactParts: string[] = [];
  if (report.tenantDetails?.cnpj) contactParts.push(`CNPJ: ${report.tenantDetails.cnpj}`);
  if (report.tenantDetails?.phone || report.tenantDetails?.whatsapp) {
    contactParts.push(`Tel: ${report.tenantDetails.whatsapp || report.tenantDetails.phone}`);
  }
  if (report.tenantDetails?.city) contactParts.push(report.tenantDetails.city);

  const contactLine = contactParts.length > 0 ? contactParts.join('  •  ') : 'Gestão Financeira Oficial';
  doc.text(contactLine, margin, 18);

  const addressLine = report.tenantDetails?.address ? `Endereço: ${report.tenantDetails.address}` : 'Sistema ZELUNIA SaaS';
  doc.text(addressLine, margin, 23);

  // ── 2. METADADOS DO DOCUMENTO ─────────────────────────────────────────
  let currentY = 36;

  doc.setTextColor(30, 17, 21);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  const title = PERIOD_LABELS[report.period] || 'Relatório Financeiro Gerencial';
  doc.text(title, margin, currentY);

  currentY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(102, 83, 78);
  doc.text(
    `Período de Apuração: ${formatDateBR(report.startDate)} até ${formatDateBR(report.endDate)}  |  Emissão: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`,
    margin,
    currentY
  );

  currentY += 6;

  // ── 3. QUADRO RESUMO DE INDICADORES PRINCIPAIS ─────────────────────────
  const summaryBody = [
    [
      'Receitas Efetivamente Recebidas',
      formatCurrency(report.metrics.totalRevenueReceived),
      'Pendências a Receber',
      formatCurrency(report.metrics.pendingRevenue),
    ],
    [
      'Despesas Operacionais Pagas',
      `- ${formatCurrency(report.metrics.totalExpensesPaid)}`,
      'Contas a Pagar Pendentes',
      formatCurrency(report.metrics.pendingExpenses),
    ],
    [
      'Saldo Líquido Operacional',
      formatCurrency(report.metrics.netCashFlow),
      'Estornos / Devoluções',
      `- ${formatCurrency(report.metrics.totalRefunds)}`,
    ],
    [
      'Suprimentos de Caixa (Informativo)',
      formatCurrency(report.metrics.totalSupplies),
      'Sangrias / Retiradas (Informativo)',
      `- ${formatCurrency(report.metrics.totalBleeds)}`,
    ],
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['Demonstrativo Principal', 'Valor Realizado', 'Contas em Aberto & Caixa', 'Valor']],
    body: summaryBody,
    margin: { left: margin, right: margin },
    theme: 'grid',
    headStyles: {
      fillColor: [184, 112, 112],
      textColor: [255, 255, 255],
      fontSize: 8.5,
      fontStyle: 'bold',
    },
    styles: {
      fontSize: 8,
      textColor: [30, 17, 21],
      cellPadding: 2.5,
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 60 },
      1: { halign: 'right', fontStyle: 'bold', textColor: [30, 17, 21] },
      2: { fontStyle: 'bold', cellWidth: 60 },
      3: { halign: 'right' },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentY = (doc as any).lastAutoTable.finalY + 8;

  // ── 4. DETALHAMENTO POR FORMAS DE PAGAMENTO ────────────────────────────
  if (report.methodsBreakdown.length > 0) {
    doc.setTextColor(30, 17, 21);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Distribuição por Meio de Pagamento', margin, currentY);

    currentY += 3;

    const methodsRows = report.methodsBreakdown.map((m) => [
      m.label,
      String(m.count),
      formatCurrency(m.amount),
      `${m.percentage.toFixed(1)}%`,
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Forma de Pagamento', 'Transações', 'Total Líquido', '% do Total']],
      body: methodsRows,
      margin: { left: margin, right: margin },
      theme: 'striped',
      headStyles: {
        fillColor: [45, 31, 39], // #2D1F27
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 2,
      },
      columnStyles: {
        0: { fontStyle: 'bold' },
        1: { halign: 'center' },
        2: { halign: 'right', fontStyle: 'bold' },
        3: { halign: 'right' },
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── 5. EVOLUÇÃO TEMPORAL (TIMELINE) ───────────────────────────────────
  if (report.timeline.length > 0) {
    if (currentY > pageHeight - 50) {
      doc.addPage();
      currentY = 20;
    }

    doc.setTextColor(30, 17, 21);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(
      report.period === 'yearly'
        ? 'Evolução Mensal Consolidada'
        : 'Evolução Cronológica de Movimentações',
      margin,
      currentY
    );

    currentY += 3;

    const timelineRows = report.timeline.map((t) => [
      t.label,
      formatCurrency(t.revenue),
      formatCurrency(t.expenses),
      formatCurrency(t.net),
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Período / Data', 'Receitas', 'Despesas', 'Saldo Líquido']],
      body: timelineRows,
      margin: { left: margin, right: margin },
      theme: 'striped',
      headStyles: {
        fillColor: [100, 75, 80],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 2,
      },
      columnStyles: {
        0: { fontStyle: 'bold' },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right', fontStyle: 'bold' },
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── 6. SEÇÃO DE PROJEÇÃO ANUAL (QUANDO DISPONÍVEL) ─────────────────────
  if (report.projection) {
    if (currentY > pageHeight - 45) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFillColor(250, 240, 236); // #FAF0EC
    doc.roundedRect(margin, currentY, pageWidth - margin * 2, 28, 2, 2, 'F');

    doc.setTextColor(184, 112, 112);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('PROJEÇÃO ANUAL ESTIMADA (HISTÓRICO REAL)', margin + 4, currentY + 6);

    doc.setTextColor(60, 45, 40);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(report.projection.description, margin + 4, currentY + 11, {
      maxWidth: pageWidth - margin * 2 - 8,
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const projLine = [
      `Receita Projetada: ${formatCurrency(report.projection.projectedAnnualRevenue)}`,
      `Despesas Projetadas: ${formatCurrency(report.projection.projectedAnnualExpenses)}`,
      `Resultado Projetado: ${formatCurrency(report.projection.projectedAnnualNet)}`,
    ].join('    |    ');
    doc.text(projLine, margin + 4, currentY + 23);

    currentY += 34;
  }

  // ── 7. RODAPÉ INSTITUCIONAL ────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(140, 122, 116);
    doc.text(
      `ZELUNIA Gestão para Clínicas e Salões  •  Página ${i} de ${pageCount}  •  Documento Gerado Eletronicamente`,
      margin,
      pageHeight - 8
    );
  }

  // Salva o arquivo PDF
  const cleanPeriod = report.period;
  const fileName = `relatorio-financeiro-${report.tenantName.toLowerCase().replace(/[^a-z0-9]/g, '_')}-${cleanPeriod}-${report.startDate}.pdf`;
  doc.save(fileName);
}
