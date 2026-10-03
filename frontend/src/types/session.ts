export interface SessionData {
  id: string;
  container_id: string;
  adb_port: number;
  status: string;
  kiosk_enabled?: boolean;
  target_package?: string;
  target_activity?: string;
  recording?: boolean;
  recording_path?: string;
  created_at?: string;
  last_active_at?: string;
}
