//! Configure the native GTK window before Tao/WebKit realize its surface.
use gtk::{glib::translate::ToGlibPtr, prelude::*};
use std::{cell::Cell, rc::Rc};

// The small stable GTK 3 layer-shell C API keeps the GTK version identical to
// Tauri's. The native library is supplied by the build environment.
extern "C" {
    fn gtk_layer_is_supported() -> i32;
    fn gtk_layer_init_for_window(window: *mut gtk::ffi::GtkWindow);
    fn gtk_layer_set_namespace(
        window: *mut gtk::ffi::GtkWindow,
        namespace: *const std::ffi::c_char,
    );
    fn gtk_layer_set_layer(window: *mut gtk::ffi::GtkWindow, layer: i32);
    fn gtk_layer_set_anchor(window: *mut gtk::ffi::GtkWindow, edge: i32, anchor: i32);
    fn gtk_layer_set_exclusive_zone(window: *mut gtk::ffi::GtkWindow, zone: i32);
    fn gtk_layer_set_keyboard_mode(window: *mut gtk::ffi::GtkWindow, mode: i32);
}

pub struct Setup {
    application: Option<gtk::Application>,
    signal: Option<gtk::glib::SignalHandlerId>,
    configured: Rc<Cell<bool>>,
}

impl Setup {
    pub fn finish(mut self) -> bool {
        self.disconnect();
        self.configured.get()
    }

    fn disconnect(&mut self) {
        if let (Some(app), Some(signal)) = (&self.application, self.signal.take()) {
            app.disconnect(signal);
        }
    }
}

impl Drop for Setup {
    fn drop(&mut self) {
        self.disconnect();
    }
}

pub fn prepare() -> Result<Setup, String> {
    let mut setup = Setup {
        application: None,
        signal: None,
        configured: Rc::new(Cell::new(false)),
    };
    // Called on GTK's main thread after initialization.
    if unsafe { gtk_layer_is_supported() } == 0 {
        return Ok(setup);
    }
    let application = gtk::gio::Application::default()
        .and_then(|app| app.downcast::<gtk::Application>().ok())
        .ok_or("Could not access GTK application for carousel layer")?;
    let configured = setup.configured.clone();
    // This handler exists only during the synchronous overlay build. GTK emits
    // window-added before Tao realizes the window; configuring it after build
    // would be too late to replace the Wayland surface role.
    setup.signal = Some(application.connect_window_added(move |_, window| {
        if configured.replace(true) {
            return;
        }
        let pointer = window.to_glib_none().0;
        // SAFETY: window is a live, unrealized GtkWindow on the main thread.
        // Enum values come from gtk-layer-shell.h: overlay=3, exclusive=1,
        // edges left/right/top/bottom=0..3. No monitor pins the old workspace.
        unsafe {
            gtk_layer_init_for_window(pointer);
            gtk_layer_set_namespace(pointer, b"wallcarousel\0".as_ptr().cast());
            gtk_layer_set_layer(pointer, 3);
            for edge in 0..4 {
                gtk_layer_set_anchor(pointer, edge, 1);
            }
            gtk_layer_set_exclusive_zone(pointer, -1);
            gtk_layer_set_keyboard_mode(pointer, 1);
        }
    }));
    setup.application = Some(application);
    Ok(setup)
}
