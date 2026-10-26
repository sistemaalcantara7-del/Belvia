export type ServiceStatus = 'active' | 'inactive';

export interface Service {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  category: string;
  duration_minutes: number;
  break_minutes: number;
  price: number;
  status: ServiceStatus;
  created_at: string;
  updated_at: string;
}

export interface ServiceFormData {
  id?: string;
  name: string;
  description?: string;
  category: string;
  duration_minutes: number;
  break_minutes: number;
  price: number;
  status: ServiceStatus;
}

export const DEFAULT_SERVICE_CATEGORIES = [
  'Facial',
  'Corporal',
  'Cabelos',
  'Unhas & Manicure',
  'Massoterapia',
  'Sobrancelhas & Cílios',
  'Depilação',
  'Geral',
] as const;
