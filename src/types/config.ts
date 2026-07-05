export interface AppConfig {
  onboarding_done: boolean;
  /** Set by backend on complete_onboarding; bump CURRENT_ONBOARDING_SCHEMA_VERSION in Rust when flow changes. */
  onboarding_schema_version?: number;
  location_mode: "Auto" | "ManualCity";
  city_id: string;
  city_name: string;
  timezone: string;
  last_lat_long: [number, number] | null;
  volume: number;
  muted: boolean;
  notifications_enabled: boolean;
  reminder_offset_minutes: number;
  auto_launch: boolean;
  last_update_check_at?: number | null;
  update_dismissed_version?: string | null;
}