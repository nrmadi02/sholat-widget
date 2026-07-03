export interface AppConfig {
  onboarding_done: boolean;
  location_mode: "Auto" | "ManualCity";
  city_id: string;
  city_name: string;
  timezone: string;
  last_lat_long: [number, number] | null;
  volume: number;
  muted: boolean;
  reminder_offset_minutes: number;
  auto_launch: boolean;
}