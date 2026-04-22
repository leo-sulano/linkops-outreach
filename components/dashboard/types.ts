export interface Contact {
  id: string;
  domain: string;
  niche: string;
  priceFromBacklinker: number;
  email1: string;
  name1: string;
  email2?: string;
  name2?: string;
  email3?: string;
  name3?: string;
  status: 'pending' | 'confirmed' | 'no_deal' | 'negotiation' | 'follow_up';
  emailAccount: string;
  currency: string;
  standardPrice: number;
  gamblingPrice: number;
  negotiatedPrice?: number;
  acceptCasino: boolean;
  acceptBetting: boolean;
  sponsored: boolean;
  linkTerm: string;
  dateConfirmed?: string; // ISO date string
  notes: string;
  contentGuidelines: string;
  reply: 'yes' | 'no' | 'pending';
}

export interface DashboardStats {
  totalDomains: number;
  averagePrice: number;
  confirmedDeals: number;
  casinoFriendly: number;
}
