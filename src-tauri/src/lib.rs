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

use audio::AudioPlayer;
use cache::CacheStore;
use config::{load_config, save_config, Config};
use std::sync::{Arc, Mutex};
use tauri::path::BaseDirectory;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, RunEvent, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_notification::NotificationExt;
#[cfg(desktop)]
use tauri_plugin_positioner::{Position, WindowExt};

struct ReminderState(Mutex<Option<String>>);

fn show_reminder_window(app: &tauri::AppHandle, prayer: &str) {
    if let Ok(mut state) = app.state::<ReminderState>().0.lock() {
        *state = Some(prayer.to_string());
    }
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
    #[cfg(desktop)]
    {
        let _ = win
            .as_ref()
            .window()
            .move_window(Position::TrayBottomCenter);
    }
    win.show().map_err(|e| e.to_string())?;
    win.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

fn toggle_tray_window(app: &tauri::AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("tray")
        .ok_or("tray window not found")?;
    if win.is_visible().map_err(|e| e.to_string())? {
        win.hide().map_err(|e| e.to_string())?;
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

    if let Some(tray) = app.get_webview_window("tray") {
        let _ = tray.hide();
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
async fn complete_onboarding(config: Config) -> Result<Config, String> {
    let mut cfg = config;
    cfg.onboarding_done = true;
    save_config(&cfg).map_err(|e| e.to_string())?;
    if let Err(e) = location::sync_config_location().await {
        log::warn!("location sync failed during onboarding: {e}");
    }
    if let Err(e) = schedule::refresh_schedule(&CacheStore::new()).await {
        log::warn!("schedule refresh failed during onboarding: {e}");
    }
    Ok(load_config())
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
fn test_sound() -> Result<(), String> {
    AudioPlayer::from_config().play_bedug()
}

#[tauri::command]
fn get_pending_reminder(state: tauri::State<ReminderState>) -> Option<String> {
    state.0.lock().ok().and_then(|s| s.clone())
}

#[tauri::command]
fn close_reminder_window(app: tauri::AppHandle, state: tauri::State<ReminderState>) {
    if let Ok(mut s) = state.0.lock() {
        *s = None;
    }
    if let Some(win) = app.get_webview_window("reminder") {
        let _ = win.hide();
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
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            focus_running_instance(app);
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
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
                    "quit" => app.exit(0),
                    "settings" => {
                        let _ = show_tray_window(app);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);
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

            let bedug = app
                .path()
                .resolve("sounds/bedug.mp3", BaseDirectory::Resource)
                .unwrap_or_else(|_| {
                    std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                        .join("assets/sounds/bedug.mp3")
                });
            audio::set_bedug_path(bedug);

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
            let on_remind = Arc::new(move |kind: models::PrayerKind| {
                // Show standalone reminder window
                show_reminder_window(&app_handle, kind.label());

                // Native OS notification as fallback (screen off / lock screen)
                let body = format!("Sudah masuk waktu sholat {}", kind.label());
                if let Err(e) = app_handle
                    .notification()
                    .builder()
                    .title("Sholat Widget")
                    .body(&body)
                    .show()
                {
                    log::warn!("gagal kirim notifikasi: {e}");
                }
            });

            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new().expect("scheduler runtime");
                rt.block_on(scheduler::run_scheduler(ts_clone, cache, on_remind));
            });

            let ts_bg = time_service.clone();
            tauri::async_runtime::spawn(async move {
                let _ = ts_bg.sync_ntp().await;
                loop {
                    tokio::time::sleep(tokio::time::Duration::from_secs(3600)).await;
                    let _ = ts_bg.sync_ntp().await;
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_settings,
            get_current_time,
            get_today_schedule,
            complete_onboarding,
            test_sound,
            search_cities,
            open_main_window,
            hide_tray_window,
            hide_main_window_cmd,
            get_pending_reminder,
            close_reminder_window,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);

    app.run(|_app_handle, event| {
        if let RunEvent::ExitRequested { api, .. } = event {
            api.prevent_exit();
        }
    });
}
