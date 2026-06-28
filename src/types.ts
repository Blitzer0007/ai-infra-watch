export interface Milestone {
  id: string;
  stockSymbol: string;
  date: string;
  title: string;
  description: string;
  priceAtTime: number;
  status: 'done' | 'active' | 'planned';
}

export interface Contract {
  id: string;
  company: string;
  client: string;
  value: string; // e.g. "$27.0B"
  duration: string;
  hardware: string;
  details: string;
  status: string;
  statusLevel: 'high-verified' | 'low-rumour' | 'in-progress';
  dateSigned: string;
  geminiImpactSummary?: string;
}

export interface CongressTrade {
  id: string;
  politician: string;
  chamber: 'Senate' | 'House';
  stockSymbol: string;
  transactionType: 'buy' | 'sell';
  amountRange: string;
  date: string;
  stockPrice: number;
  geminiImpactSummary?: string;
}

export interface MacroRisk {
  id: string;
  category: string;
  title: string;
  impactRating: 'low' | 'medium' | 'high';
  description: string;
  dateUpdated: string;
  geminiImpactSummary?: string;
}

export interface WatchlistItem {
  symbol: string;
  name: string;
  alertPrice?: number;
  alertType?: 'above' | 'below';
  isAlertActive?: boolean;
}
