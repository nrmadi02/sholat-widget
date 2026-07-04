use crate::config::load_config;
use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink, Source};
use std::fs::File;
use std::io::BufReader;
use std::path::PathBuf;
use std::sync::mpsc::Sender;
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;

static AZAN_PATH: OnceLock<PathBuf> = OnceLock::new();
static PREVIEW_STOP_TX: OnceLock<Mutex<Option<Sender<()>>>> = OnceLock::new();

fn preview_stop_tx() -> &'static Mutex<Option<Sender<()>>> {
    PREVIEW_STOP_TX.get_or_init(|| Mutex::new(None))
}

pub fn set_azan_path(path: PathBuf) {
    let _ = AZAN_PATH.set(path);
}

pub fn azan_path() -> PathBuf {
    AZAN_PATH.get().cloned().unwrap_or_else(|| {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("assets/sounds/azan.mp3")
    })
}

pub fn stop_preview() {
    if let Some(tx) = preview_stop_tx().lock().unwrap().take() {
        let _ = tx.send(());
    }
}

pub fn start_preview(volume: Option<f32>, muted: Option<bool>) -> Result<(), String> {
    stop_preview();

    let cfg = load_config();
    let is_muted = muted.unwrap_or(cfg.muted);
    if is_muted {
        return Ok(());
    }

    let vol = volume.unwrap_or(cfg.volume).clamp(0.0, 1.0);
    let path = azan_path();
    let (stop_tx, stop_rx) = std::sync::mpsc::channel();

    thread::spawn(move || {
        let Ok((_stream, stream_handle)) = OutputStream::try_default() else {
            return;
        };
        let Ok(sink) = Sink::try_new(&stream_handle) else {
            return;
        };

        let Ok(file) = File::open(&path) else {
            return;
        };
        let Ok(source) = Decoder::new(BufReader::new(file)) else {
            return;
        };

        sink.set_volume(vol);
        sink.append(source);

        loop {
            if stop_rx.try_recv().is_ok() {
                sink.stop();
                break;
            }
            if sink.empty() {
                break;
            }
            thread::sleep(Duration::from_millis(50));
        }

        if let Ok(mut guard) = preview_stop_tx().lock() {
            if guard.is_some() {
                *guard = None;
            }
        }
    });

    *preview_stop_tx().lock().unwrap() = Some(stop_tx);
    Ok(())
}

pub fn azan_duration_ms() -> Result<u64, String> {
    let path = azan_path();
    let file = File::open(&path).map_err(|e| format!("audio file open: {}", e))?;
    let source =
        Decoder::new(BufReader::new(file)).map_err(|e| format!("audio decode: {}", e))?;
    Ok(source
        .total_duration()
        .map(|d| d.as_millis() as u64)
        .unwrap_or(3000))
}

pub struct AudioPlayer {
    _stream: OutputStream,
    handle: OutputStreamHandle,
    volume: Mutex<f32>,
    muted: Mutex<bool>,
}

impl AudioPlayer {
    pub fn new() -> Self {
        let (stream, handle) =
            OutputStream::try_default().expect("failed to open default audio output");
        AudioPlayer {
            _stream: stream,
            handle,
            volume: Mutex::new(0.7),
            muted: Mutex::new(false),
        }
    }

    pub fn from_config() -> Self {
        let cfg = load_config();
        let player = AudioPlayer::new();
        player.set_volume(cfg.volume);
        player.set_muted(cfg.muted);
        player
    }

    pub fn sync_from_config(&self) {
        let cfg = load_config();
        self.set_volume(cfg.volume);
        self.set_muted(cfg.muted);
    }

    pub fn set_volume(&self, vol: f32) {
        *self.volume.lock().unwrap() = vol.clamp(0.0, 1.0);
    }

    pub fn set_muted(&self, muted: bool) {
        *self.muted.lock().unwrap() = muted;
    }

    #[cfg(test)]
    pub fn is_muted(&self) -> bool {
        *self.muted.lock().unwrap()
    }

    #[cfg(test)]
    pub fn get_volume(&self) -> f32 {
        *self.volume.lock().unwrap()
    }

    pub fn play(&self, path: &PathBuf) -> Result<(), String> {
        self.play_with_options(path, None, None, false)
    }

    pub fn play_azan(&self) -> Result<(), String> {
        self.play_with_options(&azan_path(), None, None, false)
    }

    pub fn play_azan_with_options(
        &self,
        volume: Option<f32>,
        muted: Option<bool>,
    ) -> Result<(), String> {
        self.play_with_options(&azan_path(), volume, muted, false)
    }

    /// Blocks until playback finishes — use from a dedicated thread for test previews.
    pub fn play_azan_blocking(
        &self,
        volume: Option<f32>,
        muted: Option<bool>,
    ) -> Result<(), String> {
        self.play_with_options(&azan_path(), volume, muted, true)
    }

    fn play_with_options(
        &self,
        path: &PathBuf,
        volume: Option<f32>,
        muted: Option<bool>,
        blocking: bool,
    ) -> Result<(), String> {
        let is_muted = muted.unwrap_or_else(|| *self.muted.lock().unwrap());
        if is_muted {
            return Ok(());
        }
        let file = File::open(path).map_err(|e| format!("audio file open: {}", e))?;
        let source =
            Decoder::new(BufReader::new(file)).map_err(|e| format!("audio decode: {}", e))?;

        let sink = Sink::try_new(&self.handle).map_err(|e| format!("sink: {}", e))?;
        let vol = volume.unwrap_or_else(|| *self.volume.lock().unwrap());
        sink.set_volume(vol.clamp(0.0, 1.0));
        sink.append(source);
        if blocking {
            sink.sleep_until_end();
        } else {
            sink.detach();
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_volume_clamp() {
        let player = AudioPlayer::new();
        player.set_volume(1.5);
        assert_eq!(player.get_volume(), 1.0);
        player.set_volume(-0.5);
        assert_eq!(player.get_volume(), 0.0);
        player.set_volume(0.5);
        assert_eq!(player.get_volume(), 0.5);
    }

    #[test]
    fn test_mute_toggle() {
        let player = AudioPlayer::new();
        assert!(!player.is_muted());
        player.set_muted(true);
        assert!(player.is_muted());
    }

    #[test]
    fn test_play_when_muted_is_ok() {
        let player = AudioPlayer::new();
        player.set_muted(true);
        let result = player.play(&PathBuf::from("nonexistent.mp3"));
        assert!(result.is_ok());
    }
}
