#[cfg(target_os = "linux")]
mod linux {
    use std::{
        ffi::OsString,
        io::ErrorKind,
        path::{Path, PathBuf},
        process::{Child, Command, Output, Stdio},
        sync::{Arc, Mutex},
        thread,
        time::{Duration, Instant},
    };

    /*
     * ============================================================
     * AWWW MANAGER
     * ============================================================
     *
     * This module owns all knowledge about:
     *
     * - locating awww
     * - locating awww-daemon
     * - checking the socket
     * - starting the daemon
     * - waiting for daemon readiness
     * - recovering after daemon failure
     * - setting a wallpaper
     *
     * The Tauri layer does not need to know how
     * AWWW works.
     */

    #[derive(Clone)]
    pub struct AwwwManager {
        inner: Arc<Mutex<AwwwState>>,
    }

    struct AwwwState {
        /*
         * Only populated when Wallcarousel itself
         * launched the daemon.
         *
         * If another service/Hyprland already
         * started AWWW, this remains None.
         */
        child: Option<Child>,
    }

    impl Default for AwwwManager {
        fn default() -> Self {
            Self::new()
        }
    }

    impl AwwwManager {
        pub fn new() -> Self {
            Self {
                inner: Arc::new(Mutex::new(AwwwState { child: None })),
            }
        }

        pub fn attach_app(&self, _app: tauri::AppHandle) {}

        /*
         * --------------------------------------------------------
         * PUBLIC API
         * --------------------------------------------------------
         */

        pub fn ensure_daemon(&self) -> Result<(), String> {
            /*
             * Fast path.
             *
             * `awww query` succeeding means a
             * working daemon/socket already exists.
             */
            if self.daemon_ready()? {
                return Ok(());
            }

            /*
             * Only one caller may attempt daemon
             * startup at a time.
             */
            let mut state = self
                .inner
                .lock()
                .map_err(|_| "AWWW manager lock was poisoned".to_string())?;

            /*
             * Another thread may have started it
             * while we were waiting for the lock.
             */
            if self.daemon_ready()? {
                return Ok(());
            }

            /*
             * If we previously started a child,
             * check whether it is still alive.
             */
            if let Some(child) = state.child.as_mut() {
                match child.try_wait() {
                    Ok(Some(_)) => {
                        /*
                         * It exited.
                         * Allow a fresh instance.
                         */
                        state.child = None;
                    }

                    Ok(None) => {
                        /*
                         * Process exists but perhaps
                         * its socket isn't ready yet.
                         */
                    }

                    Err(error) => {
                        state.child = None;

                        eprintln!("[awww] could not inspect daemon process: {error}");
                    }
                }
            }

            /*
             * No functioning daemon and no child
             * process owned by us: start one.
             */
            if state.child.is_none() {
                println!("[awww] daemon is not running; starting it");

                state.child = Some(self.spawn_daemon()?);
            }

            /*
             * AWWW may need a short period between
             * process creation and socket creation.
             */
            let timeout = Duration::from_secs(4);

            let interval = Duration::from_millis(100);

            let started = Instant::now();

            loop {
                if self.daemon_ready()? {
                    println!("[awww] daemon ready");

                    return Ok(());
                }

                /*
                 * Detect immediate daemon crashes
                 * instead of waiting for timeout.
                 */
                if let Some(child) = state.child.as_mut() {
                    match child.try_wait() {
                        Ok(Some(status)) => {
                            state.child = None;

                            return Err(format!(
                                "awww-daemon exited before its socket became ready: {status}"
                            ));
                        }

                        Ok(None) => {}

                        Err(error) => {
                            return Err(format!("Could not inspect awww-daemon: {error}"));
                        }
                    }
                }

                if started.elapsed() >= timeout {
                    return Err(
                        "awww-daemon started but its socket did not become ready within 4 seconds"
                            .to_string(),
                    );
                }

                thread::sleep(interval);
            }
        }

        pub fn set_wallpaper(&self, path: &Path) -> Result<(), String> {
            self.set_wallpaper_with_transition(path, &[])
        }

        pub fn set_wallpaper_with_transition(
            &self,
            path: &Path,
            transition_args: &[OsString],
        ) -> Result<(), String> {
            /*
             * This makes the setter self-healing.
             *
             * It does not assume the daemon that
             * existed at application startup is
             * still alive.
             */
            self.ensure_daemon()?;

            let mut args = vec![OsString::from("img"), path.as_os_str().to_os_string()];
            args.extend_from_slice(transition_args);

            let output = self.run_awww(&args)?;

            if output.status.success() {
                return Ok(());
            }

            /*
             * There is a small possible race:
             *
             * query succeeds
             * daemon dies
             * img is executed
             *
             * If that happened, restart once and
             * retry the wallpaper operation.
             */
            if !self.daemon_ready()? {
                eprintln!("[awww] daemon disappeared; restarting");

                self.clear_dead_child();

                self.ensure_daemon()?;

                let retry = self.run_awww(&args)?;

                if retry.status.success() {
                    return Ok(());
                }

                return Err(format!(
                    "awww failed after daemon restart: {}",
                    output_error(&retry,),
                ));
            }

            Err(format!("awww failed: {}", output_error(&output,),))
        }

        /*
         * --------------------------------------------------------
         * INTERNAL DAEMON MANAGEMENT
         * --------------------------------------------------------
         */

        fn daemon_ready(&self) -> Result<bool, String> {
            let args = vec![OsString::from("query")];

            let output = self.run_awww(&args)?;

            Ok(output.status.success())
        }

        fn spawn_daemon(&self) -> Result<Child, String> {
            let candidates = program_candidates("awww-daemon");

            for program in candidates {
                match Command::new(&program)
                    /*
                     * Do not attach the daemon to
                     * Tauri's stdout/stderr.
                     *
                     * In release builds there may not
                     * even be a terminal attached.
                     */
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                {
                    Ok(child) => {
                        println!("[awww] launched {}", program.display(),);

                        return Ok(child);
                    }

                    Err(error) if error.kind() == ErrorKind::NotFound => {
                        continue;
                    }

                    Err(error) => {
                        return Err(format!("Could not launch '{}': {error}", program.display(),));
                    }
                }
            }

            Err(
            "Could not find awww-daemon. Install AWWW or add it to the Wallcarousel runtime PATH."
                .to_string(),
        )
        }

        fn run_awww(&self, args: &[OsString]) -> Result<Output, String> {
            let candidates = program_candidates("awww");

            for program in candidates {
                match Command::new(&program).args(args).output() {
                    Ok(output) => {
                        return Ok(output);
                    }

                    Err(error) if error.kind() == ErrorKind::NotFound => {
                        continue;
                    }

                    Err(error) => {
                        return Err(format!(
                            "Could not execute '{}': {error}",
                            program.display(),
                        ));
                    }
                }
            }

            Err(
            "Could not find the 'awww' executable. Install AWWW or add it to the Wallcarousel runtime PATH."
                .to_string(),
        )
        }

        fn clear_dead_child(&self) {
            let Ok(mut state) = self.inner.lock() else {
                return;
            };

            let dead = match state.child.as_mut() {
                Some(child) => {
                    matches!(child.try_wait(), Ok(Some(_),))
                }

                None => false,
            };

            if dead {
                state.child = None;
            }
        }
    }

    /*
     * ============================================================
     * EXECUTABLE DISCOVERY
     * ============================================================
     *
     * Command::new("awww") uses PATH.
     *
     * The explicit paths below are useful for
     * NixOS GUI applications, where the PATH of
     * a desktop process can differ from the PATH
     * of an interactive shell.
     */

    fn program_candidates(name: &str) -> Vec<PathBuf> {
        let mut programs = Vec::new();

        /*
         * Normal PATH resolution.
         */
        programs.push(PathBuf::from(name));

        /*
         * User Nix profile.
         */
        if let Some(home) = std::env::var_os("HOME") {
            programs.push(
                PathBuf::from(&home)
                    .join(".nix-profile")
                    .join("bin")
                    .join(name),
            );

            programs.push(PathBuf::from(home).join(".local").join("bin").join(name));
        }

        /*
         * Home Manager / NixOS per-user profile.
         */
        if let Some(user) = std::env::var_os("USER") {
            programs.push(
                PathBuf::from("/etc/profiles/per-user")
                    .join(user)
                    .join("bin")
                    .join(name),
            );
        }

        /*
         * NixOS system profile.
         */
        programs.push(PathBuf::from("/run/current-system/sw/bin").join(name));

        programs
    }

    /*
     * ============================================================
     * ERROR FORMATTING
     * ============================================================
     */

    fn output_error(output: &Output) -> String {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();

        if !stderr.is_empty() {
            return stderr;
        }

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_owned();

        if !stdout.is_empty() {
            return stdout;
        }

        format!("exit status {}", output.status,)
    }
}

#[cfg(target_os = "linux")]
pub use linux::AwwwManager;

#[cfg(target_os = "macos")]
mod macos {
    use std::{
        ffi::OsString,
        io::Write,
        path::{Path, PathBuf},
        process::{Command, Stdio},
        sync::{Arc, Mutex},
    };

    /// Native macOS wallpaper control.
    ///
    /// macOS does not need a wallpaper daemon. System Events owns the
    /// desktop-picture setting for every desktop/Space, so the manager keeps
    /// the same small API as the Linux AWWW implementation while delegating
    /// the actual update to the platform.
    #[derive(Clone, Default)]
    pub struct AwwwManager {
        app: Arc<Mutex<Option<tauri::AppHandle>>>,
        current_path: Arc<Mutex<Option<PathBuf>>>,
    }

    impl AwwwManager {
        pub fn new() -> Self {
            Self::default()
        }

        pub fn attach_app(&self, app: tauri::AppHandle) {
            if let Ok(mut current) = self.app.lock() {
                *current = Some(app);
            }
        }

        pub fn ensure_daemon(&self) -> Result<(), String> {
            Ok(())
        }

        pub fn set_wallpaper(&self, path: &Path) -> Result<(), String> {
            self.set_wallpaper_with_transition(path, &[])
        }

        pub fn set_wallpaper_with_transition(
            &self,
            path: &Path,
            transition_args: &[OsString],
        ) -> Result<(), String> {
            let (effect, duration_seconds, fps) = transition_settings(transition_args);
            let app = self.app.lock().ok().and_then(|current| current.clone());
            let from_path = self
                .current_path
                .lock()
                .ok()
                .and_then(|current| current.clone());

            if let (Some(app), Some(from_path), Some(effect)) = (app, from_path, effect) {
                if effect != "none" {
                    crate::begin_wallpaper_transition(
                        &app,
                        &from_path,
                        path,
                        &effect,
                        duration_seconds,
                        fps,
                    )?;
                    return Ok(());
                }
            }

            self.set_wallpaper_immediate(path)
        }

        fn set_wallpaper_immediate(&self, path: &Path) -> Result<(), String> {
            let path = path
                .to_str()
                .ok_or_else(|| "Wallpaper path is not valid UTF-8".to_string())?;

            let script = format!(
                "tell application \"System Events\"\n  repeat with desktopPicture in every desktop\n    set picture of desktopPicture to POSIX file \"{}\"\n  end repeat\nend tell\n",
                escape_applescript_string(path)
            );

            let mut process = Command::new("/usr/bin/osascript")
                .arg("-")
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|error| format!("Could not launch osascript: {error}"))?;

            process
                .stdin
                .take()
                .ok_or_else(|| "Could not open osascript input".to_string())?
                .write_all(script.as_bytes())
                .map_err(|error| {
                    format!("Could not send wallpaper script to osascript: {error}")
                })?;

            let output = process
                .wait_with_output()
                .map_err(|error| format!("Could not wait for osascript: {error}"))?;

            if output.status.success() {
                if let Ok(mut current) = self.current_path.lock() {
                    *current = Some(PathBuf::from(path));
                }
                return Ok(());
            }

            let error = String::from_utf8_lossy(&output.stderr).trim().to_owned();
            if error.is_empty() {
                Err(format!("osascript failed: {}", output.status))
            } else {
                Err(format!("Could not set macOS wallpaper: {error}"))
            }
        }
    }

    fn transition_settings(args: &[OsString]) -> (Option<String>, f64, u16) {
        let mut effect = None;
        let mut duration_seconds = 2.0;
        let mut fps = 60;
        let mut index = 0;
        while index + 1 < args.len() {
            let key = args[index].to_string_lossy();
            let value = args[index + 1].to_string_lossy();
            match key.as_ref() {
                "--transition-type" => effect = Some(value.into_owned()),
                "--transition-duration" => {
                    duration_seconds = value.parse().unwrap_or(duration_seconds)
                }
                "--transition-fps" => fps = value.parse().unwrap_or(fps),
                _ => {}
            }
            index += 2;
        }
        (effect, duration_seconds, fps)
    }

    fn escape_applescript_string(value: &str) -> String {
        value
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
            .replace('\r', "\\r")
    }
}

#[cfg(target_os = "macos")]
pub use macos::AwwwManager;

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
mod unsupported {
    use std::path::Path;

    #[derive(Clone, Default)]
    pub struct AwwwManager;

    impl AwwwManager {
        pub fn new() -> Self {
            Self
        }

        pub fn attach_app(&self, _app: tauri::AppHandle) {}

        pub fn ensure_daemon(&self) -> Result<(), String> {
            Ok(())
        }

        pub fn set_wallpaper(&self, _path: &Path) -> Result<(), String> {
            Err("Wallpaper control is not supported on this platform".to_string())
        }

        pub fn set_wallpaper_with_transition(
            &self,
            _path: &Path,
            _transition_args: &[std::ffi::OsString],
        ) -> Result<(), String> {
            self.set_wallpaper(_path)
        }
    }
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
pub use unsupported::AwwwManager;
