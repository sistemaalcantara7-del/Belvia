export interface ClientRetentionMetrics {
  newClientsCount: number;
  recurringClientsCount: number;
  activeClientsCount: number;
  inactiveClientsCount: number;
  returnRatePercentage: number;
  averageFrequencyPerClient: number;
  averageDaysSinceLastVisit: number;
}

export interface ClientInactivityItem {
  id: string;
  name: string;
  phone: string | null;
  lastVisitDate: string; // ISO ou YYYY-MM-DD
  daysSinceLastVisit: number;
  totalCompletedVisits: number;
  favoriteService?: string;
  inactivityTier: '30+' | '60+' | '90+';
}

export interface ClientMonthlyEvolutionItem {
  monthKey: string; // 'YYYY-MM'
  monthLabel: string; // 'Out/2026'
  newClients: number;
  recurringClients: number;
}
