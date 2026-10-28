export interface OnlineBookingSettings {
  enabled: boolean;
  min_advance_hours: number;
  max_future_days: number;
  allowed_start_time: string; // "08:00"
  allowed_end_time: string;   // "20:00"
  primary_color?: string;     // "#C4837A"
  secondary_color?: string;   // "#2D1F27"
  cover_url?: string;
  logo_url?: string;
  business_name?: string;
  business_description?: string;
  address?: string;
  city?: string;
  phone?: string;
  whatsapp?: string;
  instagram?: string;
  facebook?: string;
  website?: string;
  booking_notice?: string;
  public_services_filter?: string[];       // IDs dos serviços permitidos (vazio = todos)
  public_professionals_filter?: string[];  // IDs dos profissionais permitidos (vazio = todos)
}

export const DEFAULT_BOOKING_SETTINGS: OnlineBookingSettings = {
  enabled: true,
  min_advance_hours: 1,
  max_future_days: 30,
  allowed_start_time: '08:00',
  allowed_end_time: '20:00',
  primary_color: '#C4837A',
  secondary_color: '#2D1F27',
  cover_url: '',
  logo_url: '',
  business_name: '',
  business_description: '',
  address: '',
  city: '',
  phone: '',
  whatsapp: '',
  instagram: '',
  facebook: '',
  website: '',
  booking_notice: '',
  public_services_filter: [],
  public_professionals_filter: [],
};

export interface PortfolioItem {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  image_url: string;
  category: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PublicTenantInfo {
  id: string;
  name: string;
  slug: string;
  plan?: string;
  settings?: {
    booking_settings?: OnlineBookingSettings;
    business_name?: string;
    phone?: string;
    whatsapp?: string;
    address?: string;
    city?: string;
    instagram?: string;
    booking_notice?: string;
  };
}

export interface PublicService {
  id: string;
  name: string;
  description: string | null;
  category: string;
  duration_minutes: number;
  break_minutes: number;
  price: number;
}

export interface PublicProfessional {
  id: string;
  full_name: string;
  specialty: string;
  bio: string | null;
  avatar_url: string | null;
  service_ids: string[];
}

export interface PublicCatalogData {
  tenant: PublicTenantInfo;
  services: PublicService[];
  professionals: PublicProfessional[];
  portfolio?: PortfolioItem[];
}

export interface PublicSlot {
  slot_time: string; // "09:00:00" ou "09:00"
  professional_id: string;
  professional_name: string;
}

export interface PublicBookingInput {
  tenantSlug: string;
  serviceId: string;
  professionalId: string;
  date: string; // "YYYY-MM-DD"
  time: string; // "09:00"
  clientName: string;
  clientWhatsapp: string;
  clientEmail?: string;
  clientNotes?: string;
}

export interface PublicBookingResult {
  success: boolean;
  appointmentId?: string;
  tenantName?: string;
  serviceName?: string;
  professionalName?: string;
  startTime?: string;
  endTime?: string;
  price?: number;
  clientName?: string;
  clientWhatsapp?: string;
  message?: string;
  code?: string;
}
