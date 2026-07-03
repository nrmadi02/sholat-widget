use crate::config::load_config;
use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink};
use std::fs::File;
use std::io::BufReader;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

static BEDUG_PATH: OnceLock<PathBuf> = OnceLock::new();

pub fn set_bedug_path(path: PathBuf) {
    let _ = BEDUG_PATH.set(path);
}

pub fn bedug_path() -> PathBuf {
    BEDUG_PATH.get().cloned().unwrap_or_else(|| {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("assets/sounds/bedug.mp3")
    })
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

    pub fn is_muted(&self) -> bool {
        *self.muted.lock().unwrap()
    }

    pub fn get_volume(&self) -> f32 {
        *self.volume.lock().unwrap()
    }

    pub fn play(&self, path: &PathBuf) -> Result<(), String> {
        if *self.muted.lock().unwrap() {
            return Ok(());
        }
        let file = File::open(path).map_err(|e| format!("audio file open: {}", e))?;
        let source =
            Decoder::new(BufReader::new(file)).map_err(|e| format!("audio decode: {}", e))?;

        let sink = Sink::try_new(&self.handle).map_err(|e| format!("sink: {}", e))?;
        let vol = *self.volume.lock().unwrap();
        sink.set_volume(vol);
        sink.append(source);
        sink.detach();
        Ok(())
    }

    pub fn play_bedug(&self) -> Result<(), String> {
        self.play(&bedug_path())
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
