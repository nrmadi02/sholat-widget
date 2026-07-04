use std::sync::Mutex;

use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Rect, Runtime, WebviewWindow};
use tauri_plugin_positioner::{Position, WindowExt};

pub struct TrayRectState(pub Mutex<Option<(PhysicalPosition<f64>, PhysicalSize<f64>)>>);

pub fn update_from_tray_event(state: &TrayRectState, rect: &Rect) {
    let size = rect.size.to_physical(1.0);
    let position = rect.position.to_physical(1.0);
    if let Ok(mut guard) = state.0.lock() {
        *guard = Some((position, size));
    }
}

/// Pick a tray-relative position based on which monitor edge the tray icon sits on.
fn position_for_taskbar_edge(
    tray_pos: PhysicalPosition<f64>,
    tray_size: PhysicalSize<f64>,
    monitor_pos: PhysicalPosition<i32>,
    monitor_size: PhysicalSize<u32>,
) -> Position {
    let tx = tray_pos.x;
    let ty = tray_pos.y;
    let tw = tray_size.width;
    let th = tray_size.height;
    let mx = monitor_pos.x as f64;
    let my = monitor_pos.y as f64;
    let mw = monitor_size.width as f64;
    let mh = monitor_size.height as f64;

    let dist_top = ty - my;
    let dist_bottom = (my + mh) - (ty + th);
    let dist_left = tx - mx;
    let dist_right = (mx + mw) - (tx + tw);

    let min = dist_top.min(dist_bottom).min(dist_left).min(dist_right);

    if (min - dist_bottom).abs() < f64::EPSILON {
        // Taskbar at bottom — popup above the tray icon
        Position::TrayCenter
    } else if (min - dist_top).abs() < f64::EPSILON {
        // Taskbar at top (macOS menu bar, etc.) — popup below the tray icon
        Position::TrayBottomCenter
    } else if (min - dist_left).abs() < f64::EPSILON {
        // Taskbar on the left — popup to the right of the tray icon
        Position::TrayRight
    } else {
        // Taskbar on the right — popup to the left of the tray icon
        Position::TrayLeft
    }
}

fn fallback_position() -> Position {
    #[cfg(target_os = "macos")]
    {
        Position::TrayBottomCenter
    }
    #[cfg(not(target_os = "macos"))]
    {
        Position::TrayCenter
    }
}

pub fn position_tray_window<R: Runtime>(
    app: &AppHandle<R>,
    win: &WebviewWindow<R>,
) -> Result<(), String> {
    let tray_rect = app
        .try_state::<TrayRectState>()
        .and_then(|state| state.0.lock().ok().and_then(|guard| *guard));

    let position = if let Some((tray_pos, tray_size)) = tray_rect {
        if let Ok(Some(monitor)) = win.monitor_from_point(tray_pos.x, tray_pos.y) {
            position_for_taskbar_edge(
                tray_pos,
                tray_size,
                *monitor.position(),
                *monitor.size(),
            )
        } else {
            fallback_position()
        }
    } else {
        fallback_position()
    };

    win.as_ref()
        .window()
        .move_window_constrained(position)
        .map_err(|e| e.to_string())
}
