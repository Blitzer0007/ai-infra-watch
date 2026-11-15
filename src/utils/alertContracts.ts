export type AlertSeverity = 'info' | 'medium' | 'high' | 'critical';
export type AlertEventType = 'price' | 'large-move' | 'catalyst';

export interface AlertEvent {
  id: string;
  type: AlertEventType;
  severity: AlertSeverity;
  symbol?: string;
  title: string;
  message: string;
  timestamp: number;
  value?: number;
  source?: string;
}

export const ALERT_EVENTS_KEY = 'aiw_alert_events_v1';
