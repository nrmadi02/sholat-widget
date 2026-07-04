use crate::config::{load_config, save_config};
use serde::Serialize;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{ipc::Channel, AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

const AUTO_CHECK_INTERVAL_SECS: i64 = 86_400;
const STARTUP_CHECK_DELAY_SECS: u64 = 5;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    pub notes: Option<String>,
    pub date: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum DownloadEvent {
    #[serde(rename_all = "camelCase")]
    Started {
        content_length: Option<u64>,
    },
    #[serde(rename_all = "camelCase")]
    Progress {
        chunk_length: usize,
    },
    Finished,
}

pub struct PendingUpdate(pub Mutex<Option<Update>>);

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn should_auto_check() -> bool {
    let cfg = load_config();
    match cfg.last_update_check_at {
        None => true,
        Some(ts) => now_unix().saturating_sub(ts) >= AUTO_CHECK_INTERVAL_SECS,
    }
}

fn record_check_timestamp() {
    let mut cfg = load_config();
    cfg.last_update_check_at = Some(now_unix());
    let _ = save_config(&cfg);
}

fn update_info_from(update: &Update) -> UpdateInfo {
    UpdateInfo {
        version: update.version.clone(),
        current_version: update.current_version.clone(),
        notes: update.body.clone(),
        date: update.date.map(|d| d.to_string()),
    }
}

async fn perform_check(
    app: &AppHandle,
    pending: &PendingUpdate,
) -> Result<Option<UpdateInfo>, String> {
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;

    record_check_timestamp();

    let info = update.as_ref().map(update_info_from);
    *pending.0.lock().map_err(|e| e.to_string())? = update;

    Ok(info)
}

#[tauri::command]
pub async fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub async fn check_update(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
    force: Option<bool>,
) -> Result<Option<UpdateInfo>, String> {
    if !force.unwrap_or(false) && !should_auto_check() {
        return Ok(None);
    }

    let info = perform_check(&app, &pending).await?;

    if let Some(ref meta) = info {
        let _ = app.emit("update-available", meta);
    }

    Ok(info)
}

#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
    on_event: Channel<DownloadEvent>,
) -> Result<(), String> {
    let update = pending
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .take()
        .ok_or_else(|| "Tidak ada pembaruan yang menunggu instalasi.".to_string())?;

    let mut started = false;
    update
        .download_and_install(
            |chunk_length, content_length| {
                if !started {
                    let _ = on_event.send(DownloadEvent::Started { content_length });
                    started = true;
                }
                let _ = on_event.send(DownloadEvent::Progress { chunk_length });
            },
            || {
                let _ = on_event.send(DownloadEvent::Finished);
            },
        )
        .await
        .map_err(|e| e.to_string())?;

    app.restart();
}

pub fn schedule_startup_check(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_secs(STARTUP_CHECK_DELAY_SECS)).await;

        if !should_auto_check() {
            return;
        }

        let pending = match app.try_state::<PendingUpdate>() {
            Some(s) => s,
            None => return,
        };

        match perform_check(&app, &pending).await {
            Ok(Some(info)) => {
                let _ = app.emit("update-available", &info);
            }
            Ok(None) => {}
            Err(e) => log::debug!("pemeriksaan update gagal (diam): {e}"),
        }
    });
}