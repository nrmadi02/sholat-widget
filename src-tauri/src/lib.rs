mod api;
mod audio;
mod cache;
mod city;
mod config;
mod location;
mod logging;
pub mod models;
mod schedule;
mod scheduler;
mod time;
mod tray_position;
mod updater;

use cache::CacheStore;
use config::{load_config, save_config, Config, CURRENT_ONBOARDING_SCHEMA_VERSION};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::path::BaseDirectory;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, RunEvent, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use serde::Serialize;
use tauri_plugin_notification::NotificationExt;
use tray_position::{TrayRectState, update_from_tray_event};

#[derive(Debug, Clone, Serialize)]
pub struct ActiveReminder {
    pub prayer: String,
    pub prayer_hour: u32,
    pub prayer_min: u32,
    pub azan_playing: bool,
    pub azan_started_at_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReminderContext {
    pub prayer: String,
    pub seconds_until_prayer: i64,
    pub azan_playing: bool,
    pub azan_started_at_ms: Option<i64>,
}

struct ReminderState(Mutex<Option<ActiveReminder>>);
struct AzanPlaybackLocked(Mutex<bool>);
struct ExitGuard(AtomicBool);

const PRAYER_REMINDER_NOTIFICATION_ID: i32 = 1001;

fn set_active_reminder(app: &tauri::AppHandle, reminder: ActiveReminder) {
    if let Ok(mut state) = app.state::<ReminderState>().0.lock() {
        *state = Some(reminder);
    }
}

fn get_active_reminder(app: &tauri::AppHandle) -> Option<ActiveReminder> {
    app.state::<ReminderState>()
        .0
        .lock()
        .ok()
        .and_then(|s| s.clone())
}

fn is_azan_playback_locked(app: &tauri::AppHandle) -> bool {
    app.try_state::<AzanPlaybackLocked>()
        .map(|s| *s.0.lock().unwrap_or_else(|e| e.into_inner()))
        .unwrap_or(false)
}

fn set_azan_playback_locked(app: &tauri::AppHandle, locked: bool) {
    if let Some(state) = app.try_state::<AzanPlaybackLocked>() {
        *state.0.lock().unwrap_or_else(|e| e.into_inner()) = locked;
    }
}

fn dismiss_reminder_window(app: &tauri::AppHandle) -> Result<(), String> {
    if is_azan_playback_locked(app) {
        return Err("Tidak bisa menutup saat azan sedang diputar.".into());
    }

    if let Ok(mut state) = app.state::<ReminderState>().0.lock() {
        *state = None;
    }

    if let Some(win) = app.get_webview_window("reminder") {
        win.hide().map_err(|e| e.to_string())?;
    }

    let _ = app.emit("reminder-dismissed", ());
    Ok(())
}

fn mark_azan_stopped(app: &tauri::AppHandle) {
    set_azan_playback_locked(app, false);
    if let Ok(mut state) = app.state::<ReminderState>().0.lock() {
        if let Some(reminder) = state.as_mut() {
            reminder.azan_playing = false;
            reminder.azan_started_at_ms = None;
        }
    }
    let _ = app.emit("azan-stopped", ());
}

fn clear_reminder_session(app: &tauri::AppHandle) {
    audio::stop_preview();
    mark_azan_stopped(app);

    if let Ok(mut state) = app.state::<ReminderState>().0.lock() {
        *state = None;
    }

    if let Some(win) = app.get_webview_window("reminder") {
        let _ = win.hide();
    }

    let _ = app.emit("reminder-cleared", ());
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn show_reminder_window(app: &tauri::AppHandle, reminder: ActiveReminder) {
    set_active_reminder(app, reminder);
    if let Some(win) = app.get_webview_window("reminder") {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

fn hide_main_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }
}

fn show_tray_window(app: &tauri::AppHandle) -> Result<(), String> {
    hide_main_window(app);

    let win = app
        .get_webview_window("tray")
        .ok_or("tray window not found")?;
    tray_position::position_tray_window(app, &win)?;
    win.show().map_err(|e| e.to_string())?;
    win.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

fn toggle_tray_window(app: &tauri::AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("tray")
        .ok_or("tray window not found")?;
    if win.is_visible().map_err(|e| e.to_string())? {
        win.emit("tray-hide-requested", ())
            .map_err(|e| e.to_string())?;
    } else {
        show_tray_window(app)?;
    }
    Ok(())
}

#[tauri::command]
fn open_main_window(app: tauri::AppHandle) -> Result<(), String> {
    let cfg = load_config();
    if !cfg.onboarding_done {
        return Err("Selesaikan onboarding terlebih dahulu.".into());
    }

    let win = app
        .get_webview_window("main")
        .ok_or("main window not found")?;
    win.show().map_err(|e| e.to_string())?;
    win.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn hide_main_window_cmd(app: tauri::AppHandle) -> Result<(), String> {
    hide_main_window(&app);
    Ok(())
}

#[tauri::command]
fn hide_tray_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("tray") {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_config() -> Config {
    load_config()
}

#[tauri::command]
async fn save_settings(config: Config, app: tauri::AppHandle) -> Result<Config, String> {
    let old = load_config();
    save_config(&config).map_err(|e| e.to_string())?;

    if config.auto_launch != old.auto_launch {
        let autolaunch = app.autolaunch();
        if config.auto_launch {
            let _ = autolaunch.enable();
        } else {
            let _ = autolaunch.disable();
        }
    }

    let location_changed = old.location_mode != config.location_mode
        || old.city_id != config.city_id
        || old.city_name != config.city_name;

    if location_changed {
        if let Err(e) = location::sync_config_location().await {
            log::warn!("location sync failed: {e}");
        }
        let updated = load_config();
        if old.city_id != updated.city_id || old.timezone != updated.timezone {
            if let Err(e) = schedule::refresh_schedule(&CacheStore::new()).await {
                log::warn!("schedule refresh failed: {e}");
            }
        }
    }

    let saved = load_config();
    let _ = app.emit("config-updated", &saved);
    Ok(saved)
}

#[tauri::command]
fn get_current_time() -> String {
    let cfg = load_config();
    let ts = time::TimeService::new(&cfg.timezone);
    ts.now_local().format("%H:%M:%S").to_string()
}

#[tauri::command]
async fn complete_onboarding(config: Config, app: tauri::AppHandle) -> Result<Config, String> {
    let mut cfg = config;
    cfg.onboarding_done = true;
    cfg.onboarding_schema_version = CURRENT_ONBOARDING_SCHEMA_VERSION;
    save_config(&cfg).map_err(|e| e.to_string())?;
    if let Err(e) = location::sync_config_location().await {
        log::warn!("location sync failed during onboarding: {e}");
    }
    if let Err(e) = schedule::refresh_schedule(&CacheStore::new()).await {
        log::warn!("schedule refresh failed during onboarding: {e}");
    }
    let saved = load_config();
    let _ = app.emit("config-updated", &saved);
    Ok(saved)
}

#[tauri::command]
async fn get_today_schedule() -> Result<Option<models::JadwalEntry>, String> {
    let cfg = load_config();
    let ts = time::TimeService::new(&cfg.timezone);
    let today = ts.now_local().format("%Y-%m-%d").to_string();
    let cache = CacheStore::new();

    if schedule::needs_refresh(&cache, &cfg.city_id, &today) {
        schedule::refresh_schedule(&cache).await?;
    }

    Ok(cache.get_schedule_for_date(&today))
}

#[tauri::command]
fn get_azan_duration_ms() -> Result<u64, String> {
    audio::azan_duration_ms()
}

#[tauri::command]
fn test_sound(
    app: tauri::AppHandle,
    volume: Option<f32>,
    muted: Option<bool>,
) -> Result<(), String> {
    let cfg = load_config();
    let is_muted = muted.unwrap_or(cfg.muted);
    if let Err(e) = audio::start_preview(volume, Some(is_muted)) {
        log::warn!("test_sound gagal: {e}");
        return Err(e);
    }

    if !is_muted && get_active_reminder(&app).is_some() {
        set_azan_playback_locked(&app, true);
        if let Ok(mut state) = app.state::<ReminderState>().0.lock() {
            if let Some(reminder) = state.as_mut() {
                reminder.azan_playing = true;
                reminder.azan_started_at_ms = Some(now_ms());
            }
        }
    }

    Ok(())
}

#[tauri::command]
fn stop_test_sound(app: tauri::AppHandle) -> Result<(), String> {
    audio::stop_preview();
    mark_azan_stopped(&app);
    Ok(())
}

#[tauri::command]
fn get_pending_reminder(state: tauri::State<ReminderState>) -> Option<ActiveReminder> {
    state.0.lock().ok().and_then(|s| s.clone())
}

#[tauri::command]
fn get_reminder_context(app: tauri::AppHandle) -> Option<ReminderContext> {
    let active = get_active_reminder(&app)?;
    let cfg = load_config();
    let ts = time::TimeService::new(&cfg.timezone);
    let now = ts.now_local();
    let seconds = time::seconds_until_prayer(now, active.prayer_hour, active.prayer_min)?;
    Some(ReminderContext {
        prayer: active.prayer,
        seconds_until_prayer: seconds,
        azan_playing: active.azan_playing,
        azan_started_at_ms: active.azan_started_at_ms,
    })
}

#[tauri::command]
fn clear_reminder_session_cmd(app: tauri::AppHandle) {
    clear_reminder_session(&app);
}

#[tauri::command]
fn close_reminder_window(app: tauri::AppHandle) -> Result<(), String> {
    dismiss_reminder_window(&app)
}

#[tauri::command]
fn set_azan_playback_locked_cmd(app: tauri::AppHandle, locked: bool) {
    set_azan_playback_locked(&app, locked);
}

#[tauri::command]
fn open_notification_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.Notifications-Settings.extension")
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start ms-settings:notifications"])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err("Pengaturan notifikasi tidak tersedia di platform ini.".into())
    }
}

#[tauri::command]
async fn search_cities(query: String) -> Result<Vec<models::City>, String> {
    let api = api::ApiClient::new();
    api.search_cities(&query).await.map_err(|e| e.to_string())
}

fn focus_running_instance(app: &tauri::AppHandle) {
    let cfg = load_config();
    if cfg.onboarding_done {
        if let Some(main) = app.get_webview_window("main") {
            if main.is_visible().unwrap_or(false) {
                let _ = main.set_focus();
                return;
            }
        }
    }
    let _ = show_tray_window(app);
}

fn handle_close_request(window: &tauri::Window, api: &tauri::CloseRequestApi) {
    let _ = window.hide();
    api.prevent_close();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut app = tauri::Builder::default()
        .manage(ReminderState(Mutex::new(None)))
        .manage(AzanPlaybackLocked(Mutex::new(false)))
        .manage(ExitGuard(AtomicBool::new(false)))
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            focus_running_instance(app);
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(updater::PendingUpdate(Mutex::new(None)))
        .manage(TrayRectState(Mutex::new(None)))
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "reminder" {
                    let app = window.app_handle();
                    if is_azan_playback_locked(&app) {
                        api.prevent_close();
                        return;
                    }
                    let _ = dismiss_reminder_window(&app);
                    api.prevent_close();
                    return;
                }
                handle_close_request(window, api);
            }
        })
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let logger = std::sync::Arc::new(logging::Logger::new());
            logger.cleanup_old_logs();
            logger.info("Sholat Widget starting up");

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&settings_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("Sholat Widget")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.state::<ExitGuard>()
                            .0
                            .store(true, Ordering::SeqCst);
                        app.exit(0);
                    }
                    "settings" => {
                        let _ = show_tray_window(app);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    let app = tray.app_handle();
                    tauri_plugin_positioner::on_tray_event(app, &event);
                    if let Some(state) = app.try_state::<TrayRectState>() {
                        match event {
                            TrayIconEvent::Click { rect, .. }
                            | TrayIconEvent::Enter { rect, .. }
                            | TrayIconEvent::Leave { rect, .. }
                            | TrayIconEvent::Move { rect, .. } => {
                                update_from_tray_event(&state, &rect);
                            }
                            _ => {}
                        }
                    }
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        let _ = toggle_tray_window(&app);
                    }
                })
                .build(app)?;

            let azan = app
                .path()
                .resolve("sounds/azan.mp3", BaseDirectory::Resource)
                .unwrap_or_else(|_| {
                    std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                        .join("assets/sounds/azan.mp3")
                });
            audio::set_azan_path(azan);

            let cfg = load_config();
            if cfg.auto_launch {
                let _ = app.autolaunch().enable();
            }

            let time_service = Arc::new(time::TimeService::new(&cfg.timezone));
            let cache = Arc::new(CacheStore::new());

            if cfg.onboarding_done {
                tauri::async_runtime::spawn(async move {
                    let _ = location::sync_config_location().await;
                    let _ = schedule::refresh_schedule(&CacheStore::new()).await;
                });
            } else {
                let cache_boot = cache.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = schedule::refresh_schedule(&cache_boot).await;
                });
            }

            let ts_clone = time_service.clone();
            let app_handle = app.handle().clone();
            let remind_app = app_handle.clone();
            let on_remind = Arc::new(move |kind: models::PrayerKind, hour: u32, min: u32| {
                let cfg = load_config();
                let azan_playing = !cfg.muted;
                let azan_started_at_ms = azan_playing.then_some(now_ms());

                if azan_playing {
                    if let Err(e) = audio::start_preview(None, None) {
                        log::warn!("gagal memutar azan pengingat: {e}");
                    } else {
                        set_azan_playback_locked(&remind_app, true);
                    }
                }

                show_reminder_window(
                    &remind_app,
                    ActiveReminder {
                        prayer: kind.label().to_string(),
                        prayer_hour: hour,
                        prayer_min: min,
                        azan_playing,
                        azan_started_at_ms,
                    },
                );

                let body = format!("1 menit lagi waktu sholat {}", kind.label());
                if let Err(e) = remind_app
                    .notification()
                    .builder()
                    .id(PRAYER_REMINDER_NOTIFICATION_ID)
                    .title("Pengingat Sholat")
                    .body(&body)
                    .show()
                {
                    log::warn!("gagal kirim notifikasi: {e}");
                }

                let _ = remind_app.emit("prayer-reminder", kind.label());
            });

            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new().expect("scheduler runtime");
                rt.block_on(scheduler::run_scheduler(
                    ts_clone,
                    cache,
                    on_remind,
                ));
            });

            let ts_bg = time_service.clone();
            tauri::async_runtime::spawn(async move {
                let _ = ts_bg.sync_ntp().await;
                loop {
                    tokio::time::sleep(tokio::time::Duration::from_secs(3600)).await;
                    let _ = ts_bg.sync_ntp().await;
                }
            });

            updater::schedule_startup_check(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_settings,
            get_current_time,
            get_today_schedule,
            complete_onboarding,
            get_azan_duration_ms,
            test_sound,
            stop_test_sound,
            search_cities,
            open_main_window,
            hide_tray_window,
            hide_main_window_cmd,
            get_pending_reminder,
            get_reminder_context,
            clear_reminder_session_cmd,
            close_reminder_window,
            set_azan_playback_locked_cmd,
            open_notification_settings,
            updater::get_app_version,
            updater::check_update,
            updater::install_update,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);

    app.run(|app_handle, event| {
        if let RunEvent::ExitRequested { api, .. } = event {
            let allow = app_handle
                .try_state::<ExitGuard>()
                .map(|guard| guard.0.load(Ordering::SeqCst))
                .unwrap_or(false);
            if !allow {
                api.prevent_exit();
            }
        }
    });
}
