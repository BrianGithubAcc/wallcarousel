mod awww;
#[cfg(target_os = "linux")]
mod overlay;
mod slideshow;

use awww::AwwwManager;

use std::fs;
use std::path::{Path, PathBuf};

use image::imageops::FilterType;
use sha2::{Digest, Sha256};
use tauri::{
    command,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "gif", "avif", "bmp", "svg"];

const THUMBNAIL_WIDTH: u32 = 480;
const THUMBNAIL_HEIGHT: u32 = 270;

fn is_image(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            IMAGE_EXTENSIONS
                .iter()
                .any(|allowed| ext.eq_ignore_ascii_case(allowed))
        })
        .unwrap_or(false)
}

fn scan_directory_recursive(directory: &Path, results: &mut Vec<String>) {
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();

        if path.is_dir() {
            scan_directory_recursive(&path, results);
        } else if path.is_file() && is_image(&path) {
            results.push(path.to_string_lossy().into_owned());
        }
    }
}

#[command]
async fn scan_wallpaper_directory(path: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let directory = PathBuf::from(&path);

        if !directory.exists() {
            return Err("Directory does not exist".to_string());
        }

        if !directory.is_dir() {
            return Err("Path is not a directory".to_string());
        }

        let mut results = Vec::new();

        scan_directory_recursive(&directory, &mut results);

        results.sort();

        Ok(results)
    })
    .await
    .map_err(|error| format!("Wallpaper scan worker failed: {error}"))?
}

fn thumbnail_filename(source: &Path) -> String {
    let mut hasher = Sha256::new();

    hasher.update(source.to_string_lossy().as_bytes());

    if let Ok(metadata) = fs::metadata(source) {
        hasher.update(metadata.len().to_le_bytes());

        if let Ok(modified) = metadata.modified() {
            if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                hasher.update(duration.as_secs().to_le_bytes());

                hasher.update(duration.subsec_nanos().to_le_bytes());
            }
        }
    }

    let hash = format!("{:x}", hasher.finalize());

    format!("{hash}.jpg")
}

fn thumbnail_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not determine app data directory: {error}"))?;

    let directory = app_data.join("thumbnails");

    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create thumbnail directory: {error}"))?;

    Ok(directory)
}

#[command]
async fn generate_thumbnail(app: AppHandle, path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || generate_thumbnail_blocking(&app, &path))
        .await
        .map_err(|error| format!("Thumbnail worker failed: {error}"))?
}

fn generate_thumbnail_blocking(app: &AppHandle, path: &str) -> Result<String, String> {
    let source = Path::new(path);

    if !source.exists() {
        return Err("Image does not exist".to_string());
    }

    if !source.is_file() {
        return Err("Image path is not a file".to_string());
    }

    /*
     * SVG is handled separately for now.
     */
    if source
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("svg"))
        .unwrap_or(false)
    {
        return Ok(source.to_string_lossy().into_owned());
    }

    let directory = thumbnail_directory(app)?;

    let filename = thumbnail_filename(source);

    let thumbnail = directory.join(filename);

    /*
     * Already cached.
     */
    if thumbnail.exists() {
        return Ok(thumbnail.to_string_lossy().into_owned());
    }

    /*
     * Expensive image decoding happens on
     * the blocking worker, NOT the UI thread.
     */
    let image = image::open(source)
        .map_err(|error| format!("Could not decode '{}': {error}", source.display()))?;

    let resized = image.resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, FilterType::Triangle);

    resized
        .save_with_format(&thumbnail, image::ImageFormat::Jpeg)
        .map_err(|error| {
            format!(
                "Could not save thumbnail '{}': {error}",
                thumbnail.display()
            )
        })?;

    Ok(thumbnail.to_string_lossy().into_owned())
}

const MAIN_LABEL: &str = "main";
const OVERLAY_LABEL: &str = "wallpaper-overlay";

/*
 * Create/show the normal configuration window.
 *
 * tauri.conf.json has create=false for "main",
 * therefore --background starts only the tray/backend.
 *
 * The WebView is constructed here, after the native
 * session and monitor scaling are fully established.
 */
fn show_main_window(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(MAIN_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();

        return Ok(());
    }

    let config = app.config();

    let window_config = config
        .app
        .windows
        .iter()
        .find(|window| window.label == MAIN_LABEL)
        .ok_or_else(|| format!("Could not find '{MAIN_LABEL}' window configuration"))?;

    let window = WebviewWindowBuilder::from_config(app, window_config)
        .map_err(|error| format!("Could not prepare main window: {error}"))?
        .build()
        .map_err(|error| format!("Could not create main window: {error}"))?;

    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();

    Ok(())
}

// On Linux layer surfaces are not workspace-owned application windows.
// Remapping the picker lets the compositor choose the currently active
// output. macOS and other platforms use a normal borderless overlay window.
fn show_overlay_window(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        window.hide().map_err(|error| error.to_string())?;
        window.show().map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    let layer_setup = overlay::prepare()?;

    let result =
        WebviewWindowBuilder::new(app, OVERLAY_LABEL, WebviewUrl::App("index.html".into()))
            .title("Wallpaper Carousel")
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .visible(false)
            .focused(true)
            .build();

    #[cfg(target_os = "linux")]
    let is_layer = layer_setup.finish();
    #[cfg(not(target_os = "linux"))]
    let is_layer = false;

    let window = result.map_err(|error| format!("Could not create wallpaper overlay: {error}"))?;
    if !is_layer {
        // X11 and platforms without layer-shell use a borderless overlay.
        if let Some(monitor) = window
            .current_monitor()
            .ok()
            .flatten()
            .or_else(|| window.primary_monitor().ok().flatten())
        {
            window
                .set_position(*monitor.position())
                .map_err(|error| error.to_string())?;
            window
                .set_size(*monitor.size())
                .map_err(|error| error.to_string())?;
        }
    }
    window.show().map_err(|error| error.to_string())?;
    if !is_layer {
        window.set_focus().map_err(|error| error.to_string())?;
    }
    Ok(())
}

/*
 * Public IPC command as well as the tray
 * action.
 *
 * This gives us an easy way to add a
 * keyboard shortcut later.
 */
#[command]
fn open_wallpaper_overlay(app: AppHandle) -> Result<(), String> {
    show_overlay_window(&app)
}

/*
 * Esc in the overlay calls this.
 */
#[command]
fn close_wallpaper_overlay(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        window
            .hide()
            .map_err(|error| format!("Could not close wallpaper overlay: {error}"))?;
    }

    Ok(())
}

/*
 * NixOS GUI applications do not always
 * inherit exactly the same PATH as an
 * interactive shell.
 *
 * Try normal PATH first, then common NixOS
 * locations.
 */
/*
 * Called when the user clicks a wallpaper.
 *
 * We pass the path as a Command argument,
 * NOT through a shell command string.
 *
 * Therefore filenames containing spaces,
 * quotes, etc. are handled normally.
 */
#[command]
async fn set_wallpaper(
    app: AppHandle,
    awww: tauri::State<'_, AwwwManager>,
    path: String,
) -> Result<(), String> {
    let wallpaper = PathBuf::from(path);

    if !wallpaper.exists() {
        return Err(format!("Wallpaper does not exist: {}", wallpaper.display(),));
    }

    if !wallpaper.is_file() {
        return Err(format!(
            "Wallpaper path is not a file: {}",
            wallpaper.display(),
        ));
    }

    if !is_image(&wallpaper) {
        return Err(format!(
            "Unsupported wallpaper image: {}",
            wallpaper.display(),
        ));
    }

    /*
     * Clone the backend service so the
     * blocking process calls do not execute
     * on Tauri's async command thread.
     */
    let manager = awww.inner().clone();

    let worker_path = wallpaper.clone();

    tauri::async_runtime::spawn_blocking(move || manager.set_wallpaper(&worker_path))
        .await
        .map_err(|error| format!("Wallpaper worker failed: {error}"))??;

    /*
     * Close only after the native wallpaper backend successfully
     * applies the image.
     */
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = window.hide();
    }

    Ok(())
}

/*
 * Work around a WebKitGTK/Wayland rendering corruption.
 *
 * This command intentionally performs only ONE fullscreen
 * transition. The frontend invokes it twice with actual
 * browser paint frames between the transitions.
 *
 * Doing this after React/WebKit has rendered forces GTK /
 * Wayland / WebKit's compositor to rebuild the window
 * backing surface.
 */
#[command]
fn toggle_render_fullscreen(window: tauri::WebviewWindow) -> Result<(), String> {
    if window.label() == OVERLAY_LABEL {
        return Ok(());
    }
    let fullscreen = window
        .is_fullscreen()
        .map_err(|error| format!("Could not read fullscreen state: {error}"))?;

    window
        .set_fullscreen(!fullscreen)
        .map_err(|error| format!("Could not change fullscreen state: {error}"))?;

    Ok(())
}

fn handle_launch(app: &AppHandle, args: &[String]) {
    /*
     * Overlay launch.
     */
    if args.iter().any(|arg| arg == "--overlay") {
        let handle = app.clone();

        let _ = app.run_on_main_thread(move || {
            if let Err(error) = show_overlay_window(&handle) {
                eprintln!("Could not open overlay: {error}");
            }
        });

        return;
    }

    /*
     * Background mode intentionally creates NO WebView.
     *
     * Tauri + tray + the wallpaper backend remain alive, but WebKit is
     * deferred until the user actually opens the UI.
     */
    if args.iter().any(|arg| arg == "--background") {
        if let Some(window) = app.get_webview_window(MAIN_LABEL) {
            let _ = window.hide();
        }

        return;
    }

    /*
     * Normal launch.
     *
     * This may be the initial process or a second launch
     * forwarded through tauri-plugin-single-instance.
     */
    let handle = app.clone();

    let _ = app.run_on_main_thread(move || {
        if let Err(error) = show_main_window(&handle) {
            eprintln!("Could not show main window: {error}");
        }
    });
}

#[cfg(target_os = "linux")]
fn force_valid_gtk_dpi() {
    use gtk::prelude::*;

    let Some(settings) = gtk::Settings::default() else {
        eprintln!("[wallcarousel] GtkSettings unavailable");
        return;
    };

    let before: i32 = settings.property("gtk-xft-dpi");

    eprintln!("[wallcarousel] gtk-xft-dpi before = {before}");

    if before <= 0 {
        settings.set_property("gtk-xft-dpi", 96 * 1024);
    }

    let after: i32 = settings.property("gtk-xft-dpi");

    eprintln!("[wallcarousel] gtk-xft-dpi after = {after}");

    settings.connect_notify_local(Some("gtk-xft-dpi"), |settings, _| {
        let dpi: i32 = settings.property("gtk-xft-dpi");

        if dpi <= 0 {
            eprintln!("[wallcarousel] gtk-xft-dpi became {dpi}; forcing 98304");

            settings.set_property("gtk-xft-dpi", 96 * 1024);
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            handle_launch(app, &args);
        }))
        .manage(AwwwManager::new())
        .plugin(tauri_plugin_dialog::init())
        /*
         * Keep the app alive as a tray utility.
         *
         * Closing the normal configuration
         * window hides it. Use the tray Quit
         * item to completely exit.
         */
        .on_window_event(|window, event| {
            if window.label() != MAIN_LABEL {
                return;
            }

            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();

                let _ = window.hide();
            }
        })
        .setup(|app| {
            app.manage(slideshow::Slideshow::new(
                app.state::<AwwwManager>().inner().clone(),
                app.path().app_config_dir()?.join("slideshow.json"),
            ));
            #[cfg(target_os = "linux")]
            force_valid_gtk_dpi();

            /*
             * Warm up the platform wallpaper backend in the background.
             *
             * On Linux this starts/checks AWWW. On macOS the backend is
             * intentionally a no-op until a wallpaper is selected.
             */
            let awww = app.state::<AwwwManager>().inner().clone();

            std::thread::spawn(move || {
                if let Err(error) = awww.ensure_daemon() {
                    eprintln!("[wallpaper] startup warm-up failed: {error}");
                }
            });

            let open_carousel = MenuItem::with_id(
                app,
                "open_carousel",
                "Open Wallpaper Carousel",
                true,
                None::<&str>,
            )?;

            let show_main =
                MenuItem::with_id(app, "show_main", "Show Wallcarousel", true, None::<&str>)?;

            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&open_carousel, &show_main, &quit])?;

            let mut tray_builder = TrayIconBuilder::with_id("wallcarousel-tray")
                .menu(&menu)
                .show_menu_on_left_click(true);

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            tray_builder
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open_carousel" => {
                        let handle = app.clone();

                        let _ = app.run_on_main_thread(move || {
                            if let Err(error) = show_overlay_window(&handle) {
                                eprintln!("Could not open overlay: {error}");
                            }
                        });
                    }

                    "show_main" => {
                        let handle = app.clone();

                        let _ = app.run_on_main_thread(move || {
                            if let Err(error) = show_main_window(&handle) {
                                eprintln!("Could not show main window: {error}");
                            }
                        });
                    }

                    "quit" => {
                        app.exit(0);
                    }

                    _ => {}
                })
                .build(app)?;

            handle_launch(app.handle(), &std::env::args().collect::<Vec<_>>());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            toggle_render_fullscreen,
            scan_wallpaper_directory,
            generate_thumbnail,
            open_wallpaper_overlay,
            close_wallpaper_overlay,
            set_wallpaper,
            slideshow::slideshow_status,
            slideshow::slideshow_control,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
