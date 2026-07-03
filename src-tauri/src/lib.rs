mod api;
mod audio;
mod cache;
mod city;
mod config;
mod location;
pub mod models;
mod qibla;
mod scheduler;
mod time;

use audio::AudioPlayer;
use cache::CacheStore;
use config::{load_config, save_config, Config};
use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

#[tauri::command]
fn get_config() -> Config {
    load_config()
}

#[tauri::command]
fn save_settings(config: Config) -> Result<(), String> {
    save_config(&config).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_current_time() -> String {
    let cfg = load_config();
    let ts = time::TimeService::new(&cfg.timezone);
    ts.now_local().format("%H:%M:%S").to_string()
}

#[tauri::command]
fn get_qibla_bearing(lat: f64, lon: f64) -> f64 {
    qibla::qibla_bearing(lat, lon)
}

#[tauri::command]
fn complete_onboarding(config: Config) -> Result<(), String> {
    let mut cfg = config;
    cfg.onboarding_done = true;
    save_config(&cfg).map_err(|e| e.to_string())
}

#[tauri::command]
fn test_sound() -> Result<(), String> {
    let player = AudioPlayer::new();
    player.play_bedug()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let settings_item =
                MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&settings_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("Sholat Widget")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "settings" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                })
                .build(app)?;

            let cfg = load_config();
            if cfg.auto_launch {
                let _ = app.autolaunch().enable();
            }

            let time_service = Arc::new(time::TimeService::new(&cfg.timezone));
            let cache = Arc::new(CacheStore::new());

            let ts_clone = time_service.clone();
            let app_handle = app.handle().clone();
            let on_remind = Arc::new(move |kind: models::PrayerKind| {
                let _ = app_handle.emit("prayer-reminder", kind.label());
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
            get_qibla_bearing,
            complete_onboarding,
            test_sound,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}