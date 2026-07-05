import { invoke } from "@tauri-apps/api/core";
import {
  isPermissionGranted,
  registerActionTypes,
  removeActive,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

/** Satu notifikasi tray untuk seluruh siklus pengingat (countdown → pemutaran azan). */
export const PRAYER_REMINDER_NOTIFICATION_ID = 1001;

export type PrayerNotificationMode = "countdown" | "playing";

export async function ensureAzanNotificationActions(): Promise<void> {
  await registerActionTypes([
    {
      id: "azan-playback",
      actions: [{ id: "stop", title: "Stop" }],
    },
  ]);
}

export async function hasNotificationPermission(): Promise<boolean> {
  return isPermissionGranted();
}

export async function requestNotificationPermission(): Promise<boolean> {
  const state = await requestPermission();
  return state === "granted";
}

export async function updatePrayerNotification(
  prayer: string,
  mode: PrayerNotificationMode,
  progress = 0,
): Promise<void> {
  if (!(await hasNotificationPermission())) return;

  const body =
    mode === "countdown"
      ? `1 menit lagi waktu sholat ${prayer}`
      : `Memainkan azan — ${Math.round(progress)}%`;

  sendNotification({
    id: PRAYER_REMINDER_NOTIFICATION_ID,
    title: "Pengingat Sholat",
    body,
    actionTypeId: mode === "playing" ? "azan-playback" : undefined,
    autoCancel: false,
    ongoing: mode === "playing",
  });
}

export async function clearPrayerReminderNotification(): Promise<void> {
  try {
    await removeActive([{ id: PRAYER_REMINDER_NOTIFICATION_ID }]);
  } catch {
    // notification may already be dismissed
  }
}

/** @deprecated use clearPrayerReminderNotification */
export async function clearAllReminderNotifications(): Promise<void> {
  await clearPrayerReminderNotification();
}

/** @deprecated use clearPrayerReminderNotification */
export async function clearReminderNotification(): Promise<void> {
  await clearPrayerReminderNotification();
}

export async function syncNotificationsEnabled(
  enabled: boolean,
): Promise<boolean> {
  if (!enabled) return false;
  return hasNotificationPermission();
}

export async function openNotificationSettings(): Promise<void> {
  try {
    await invoke("open_notification_settings");
  } catch {
    // fallback: no-op on unsupported platforms
  }
}