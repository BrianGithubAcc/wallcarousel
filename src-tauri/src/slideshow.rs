use crate::awww::AwwwManager;
use serde::{Deserialize, Serialize};
use std::{
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const EFFECTS: &[&str] = &[
    "none", "fade", "left", "right", "top", "bottom", "wipe", "wave", "grow", "center", "any",
    "outer", "random",
];

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub playlist_id: Option<String>,
    pub paths: Vec<String>,
    pub interval_seconds: u64,
    pub shuffle: bool,
    pub transition: String,
    pub duration_seconds: f64,
    pub fps: u16,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            playlist_id: None,
            paths: vec![],
            interval_seconds: 300,
            shuffle: false,
            transition: "fade".into(),
            duration_seconds: 2.0,
            fps: 60,
        }
    }
}

impl Config {
    fn validate(&self) -> Result<(), String> {
        if !(5..=86400).contains(&self.interval_seconds) {
            return Err("Interval must be between 5 seconds and 24 hours.".into());
        }
        if !self.duration_seconds.is_finite()
            || !(0.1..=30.0).contains(&self.duration_seconds)
            || self.duration_seconds >= self.interval_seconds as f64
        {
            return Err(
                "Transition duration must be 0.1–30 seconds and shorter than the interval.".into(),
            );
        }
        if !(1..=255).contains(&self.fps) || !EFFECTS.contains(&self.transition.as_str()) {
            return Err("Invalid transition settings.".into());
        }
        if self
            .paths
            .iter()
            .any(|p| !Path::new(p).is_absolute() || !crate::is_image(Path::new(p)))
        {
            return Err("Choose supported images with absolute paths.".into());
        }
        Ok(())
    }
    fn args(&self) -> Vec<OsString> {
        [
            "--transition-type".into(),
            self.transition.clone(),
            "--transition-duration".into(),
            self.duration_seconds.to_string(),
            "--transition-fps".into(),
            self.fps.to_string(),
        ]
        .into_iter()
        .map(OsString::from)
        .collect()
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    config: Config,
    running: bool,
    current_path: Option<String>,
    error: Option<String>,
    remaining_seconds: Option<u64>,
}

struct State {
    config: Config,
    running: bool,
    current: Option<usize>,
    due: Option<Instant>,
    error: Option<String>,
    random: u64,
}

impl State {
    fn status(&self) -> Status {
        Status {
            config: self.config.clone(),
            running: self.running,
            current_path: self.current.and_then(|i| self.config.paths.get(i)).cloned(),
            error: self.error.clone(),
            remaining_seconds: self
                .due
                .map(|d| d.saturating_duration_since(Instant::now()).as_secs()),
        }
    }
    fn advance(&mut self, awww: &AwwwManager) -> Result<(), String> {
        let count = self.config.paths.len();
        if count == 0 {
            return Err("Add images to the selected source first.".into());
        }
        let mut next = next_index(self.current, count, self.config.shuffle, &mut self.random);
        // Skip deleted files, but stop if no usable wallpaper remains.
        for _ in 0..count {
            let path = Path::new(&self.config.paths[next]);
            if path.is_file() {
                awww.set_wallpaper_with_transition(path, &self.config.args())?;
                self.current = Some(next);
                self.error = None;
                self.due = self
                    .running
                    .then(|| Instant::now() + Duration::from_secs(self.config.interval_seconds));
                return Ok(());
            }
            next = (next + 1) % count;
        }
        Err("None of the slideshow images are available. Update the source and try again.".into())
    }
    fn fail(&mut self, error: String) {
        self.error = Some(error);
        self.running = false;
        self.due = None;
    }
}

fn next_index(current: Option<usize>, count: usize, shuffle: bool, random: &mut u64) -> usize {
    if !shuffle || count < 2 {
        return current.map_or(0, |i| (i + 1) % count);
    }
    *random ^= *random << 13;
    *random ^= *random >> 7;
    *random ^= *random << 17;
    match current {
        Some(i) => (i + 1 + (*random % (count - 1) as u64) as usize) % count,
        None => (*random % count as u64) as usize,
    }
}

#[derive(Clone)]
pub struct Slideshow {
    state: Arc<Mutex<State>>,
    awww: AwwwManager,
    file: PathBuf,
}

impl Slideshow {
    pub fn new(awww: AwwwManager, file: PathBuf) -> Self {
        let loaded = match fs::read(&file) {
            Ok(bytes) => serde_json::from_slice::<Config>(&bytes)
                .map_err(|e| e.to_string())
                .and_then(|c| {
                    c.validate()?;
                    Ok(c)
                }),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Config::default()),
            Err(e) => Err(e.to_string()),
        };
        let error = loaded
            .as_ref()
            .err()
            .map(|e| format!("Could not load slideshow settings: {e}"));
        let state = Arc::new(Mutex::new(State {
            config: loaded.unwrap_or_default(),
            running: false,
            current: None,
            due: None,
            error,
            random: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos() as u64
                | 1,
        }));
        // A weak reference lets the worker exit when its managed service is dropped.
        let weak = Arc::downgrade(&state);
        let worker_awww = awww.clone();
        thread::spawn(move || loop {
            thread::sleep(Duration::from_millis(250));
            let Some(shared) = weak.upgrade() else { break };
            let Ok(mut state) = shared.lock() else { break };
            if state.running && state.due.is_some_and(|due| Instant::now() >= due) {
                if let Err(error) = state.advance(&worker_awww) {
                    state.fail(error);
                }
            }
        });
        Self { state, awww, file }
    }
    fn status(&self) -> Result<Status, String> {
        Ok(self.state.lock().map_err(|e| e.to_string())?.status())
    }
    fn control(&self, action: &str, config: Option<Config>) -> Result<Status, String> {
        if !["save", "start", "pause", "next"].contains(&action) {
            return Err("Unknown slideshow action.".into());
        }
        let mut state = self.state.lock().map_err(|e| e.to_string())?;
        if let Some(config) = config {
            config.validate()?;
            if action != "save" && config.paths.is_empty() {
                return Err("Add images to the selected source first.".into());
            }
            fs::create_dir_all(self.file.parent().ok_or("Missing settings directory")?)
                .map_err(|e| e.to_string())?;
            let temporary = self.file.with_extension("json.tmp");
            fs::write(
                &temporary,
                serde_json::to_vec_pretty(&config).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
            fs::rename(temporary, &self.file).map_err(|e| e.to_string())?;
            if state.config.paths != config.paths {
                state.current = None;
            }
            state.config = config;
            state.error = None;
            if state.config.paths.is_empty() {
                state.running = false;
                state.due = None;
            }
            if state.running {
                state.due =
                    Some(Instant::now() + Duration::from_secs(state.config.interval_seconds));
            }
        }
        match action {
            "pause" => {
                state.running = false;
                state.due = None;
            }
            "start" | "next" => {
                if action == "start" {
                    state.running = true;
                }
                if let Err(error) = state.advance(&self.awww) {
                    state.fail(error);
                }
            }
            _ => {}
        }
        Ok(state.status())
    }
}

#[tauri::command]
pub async fn slideshow_status(slideshow: tauri::State<'_, Slideshow>) -> Result<Status, String> {
    let service = slideshow.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.status())
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn slideshow_control(
    slideshow: tauri::State<'_, Slideshow>,
    action: String,
    config: Option<Config>,
) -> Result<Status, String> {
    let service = slideshow.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.control(&action, config))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ordered_playback_wraps_and_shuffle_never_repeats() {
        let mut seed = 17;
        assert_eq!(next_index(None, 3, false, &mut seed), 0);
        assert_eq!(next_index(Some(2), 3, false, &mut seed), 0);
        let mut current = 0;
        for _ in 0..1000 {
            let next = next_index(Some(current), 5, true, &mut seed);
            assert!(next < 5 && next != current);
            current = next;
        }
        assert_eq!(next_index(Some(0), 1, true, &mut seed), 0);
    }
    #[test]
    fn rejects_invalid_timing_and_effects() {
        let mut config = Config::default();
        assert!(config.validate().is_ok());
        config.duration_seconds = f64::NAN;
        assert!(config.validate().is_err());
        config.duration_seconds = 5.0;
        config.interval_seconds = 5;
        assert!(config.validate().is_err());
        config.duration_seconds = 1.0;
        config.transition = "invalid".into();
        assert!(config.validate().is_err());
    }
    #[test]
    fn settings_persist_and_missing_files_pause_playback() {
        let directory = std::env::temp_dir().join(format!(
            "wallcarousel-slideshow-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let file = directory.join("slideshow.json");
        let service = Slideshow::new(AwwwManager::new(), file.clone());
        let mut config = Config::default();
        config.interval_seconds = 42;
        config.paths = vec![directory.join("missing.png").to_string_lossy().into_owned()];
        service.control("save", Some(config.clone())).unwrap();
        let restored = Slideshow::new(AwwwManager::new(), file);
        assert_eq!(restored.status().unwrap().config.interval_seconds, 42);
        assert!(!restored.status().unwrap().running);
        let status = service.control("start", None).unwrap();
        assert!(!status.running);
        assert!(status
            .error
            .unwrap()
            .contains("None of the slideshow images"));
        assert!(status.remaining_seconds.is_none());
        config.interval_seconds = 0;
        assert!(service.control("save", Some(config)).is_err());
        assert_eq!(service.status().unwrap().config.interval_seconds, 42);
        let status = service.control("pause", None).unwrap();
        assert!(!status.running && status.remaining_seconds.is_none());
        drop(restored);
        drop(service);
        fs::remove_dir_all(directory).unwrap();
    }
}
