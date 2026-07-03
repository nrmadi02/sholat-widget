use chrono::Local;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Logger {
    log_dir: PathBuf,
    _lock: Mutex<()>,
}

impl Logger {
    pub fn new() -> Self {
        let log_dir = crate::config::config_dir().join("logs");
        let _ = fs::create_dir_all(&log_dir);
        Logger {
            log_dir,
            _lock: Mutex::new(()),
        }
    }

    fn log_path(&self) -> PathBuf {
        let today = Local::now().format("%Y-%m-%d").to_string();
        self.log_dir.join(format!("app-{}.log", today))
    }

    pub fn log(&self, level: &str, msg: &str) {
        let _guard = self._lock.lock().unwrap();
        let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let line = format!("[{}] {} {}\n", timestamp, level, msg);
        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.log_path())
        {
            let _ = file.write_all(line.as_bytes());
        }
        if level == "ERROR" {
            eprint!("{}", line);
        }
    }

    pub fn info(&self, msg: &str) {
        self.log("INFO", msg);
    }

    pub fn warn(&self, msg: &str) {
        self.log("WARN", msg);
    }

    pub fn error(&self, msg: &str) {
        self.log("ERROR", msg);
    }

    /// Delete log files older than 7 days.
    pub fn cleanup_old_logs(&self) {
        if let Ok(entries) = fs::read_dir(&self.log_dir) {
            let cutoff = Local::now() - chrono::Duration::days(7);
            for entry in entries.flatten() {
                if let Ok(meta) = entry.metadata() {
                    if let Ok(modified) = meta.modified() {
                        let modified_dt: chrono::DateTime<Local> = modified.into();
                        if modified_dt < cutoff {
                            let _ = fs::remove_file(entry.path());
                        }
                    }
                }
            }
        }
    }
}