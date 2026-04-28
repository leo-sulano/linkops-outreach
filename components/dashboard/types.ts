export type PipelineStatus =
  | 'start_outreach'
  | 'outreach_sent'
  | 'send_followup'
  | 'response_received'
  | 'under_negotiation'
  | 'negotiated'
  | 'approved'
  | 'payment_sent'
  | 'live';

export interface Contact {
  id: string;
  domain: string;
  website: string;
  dr?: number;
  niche: string;
  contact: string;
  email: string;
  status: PipelineStatus;
  price?: number;
  tat?: string;
  linkType: string;
  publishDate?: string;
  liveUrl?: string;
  notes: string;
  contentGuideline?: string;
  outreachDate?: string;
  followupDate?: string;
  responseDate?: string;
  paymentStatus?: 'unpaid' | 'invoiced' | 'paid';
  senderEmail?: string;
  traffic?: number;
  topCountry?: string;
  market?: string;
  microNiche?: string;
  language?: string;
  acceptCasino?: boolean;
  acceptBetting?: boolean;
  linkInsert?: boolean;
  sponsored?: boolean;
  qaFailReason?: string;
  originalCurrency?: string;
  originalCost?: number;
}

export interface DashboardMetrics {
  totalOutreach: number;
  totalResponses: number;
  totalApproved: number;
  conversionRate: number;
}

export interface NavCounts {
  all: number;
  startOutreach: number;
  outreachSent: number;
  sendFollowup: number;
  responseReceived: number;
  underNegotiation: number;
  negotiated: number;
  approved: number;
  paymentSent: number;
  live: number;
}

export const STATUS_LABELS: Record<PipelineStatus, string> = {
  start_outreach: 'Start Outreach',
  outreach_sent: 'Outreach Sent',
  send_followup: 'Send Follow-up',
  response_received: 'Response Received',
  under_negotiation: 'Under Negotiation',
  negotiated: 'Negotiated',
  approved: 'Approved',
  payment_sent: 'Payment Sent',
  live: 'Live',
};

export const STATUS_COLORS: Record<PipelineStatus, string> = {
  start_outreach: 'bg-slate-500/10  text-slate-400  border border-slate-500/20',
  outreach_sent: 'bg-blue-500/10   text-blue-400   border border-blue-500/20',
  send_followup: 'bg-amber-500/10  text-amber-400  border border-amber-500/20',
  response_received: 'bg-cyan-500/10   text-cyan-400   border border-cyan-500/20',
  under_negotiation: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
  negotiated: 'bg-teal-500/10   text-teal-400   border border-teal-500/20',
  approved: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  payment_sent: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
  live: 'bg-green-500/10  text-green-400  border border-green-500/20',
};
