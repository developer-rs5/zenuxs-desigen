use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Restore and focus the main window (macOS dock re-open).
#[cfg(target_os = "macos")]
pub fn show_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Window labels use the same character set Tauri itself accepts.
fn valid_window_label(label: &str) -> bool {
    !label.is_empty()
        && label.len() <= 64
        && label
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '/' | ':'))
}

/// Open a second editor window. Existing labels are focused instead of rebuilt.
#[tauri::command]
pub fn create_new_window<R: tauri::Runtime>(
    app: AppHandle<R>,
    label: String,
    title: String,
    url: String,
) -> Result<(), String> {
    if !valid_window_label(&label) {
        return Err(format!(
            "invalid window label \"{label}\": use up to 64 letters, digits, '-', '_', '/' or ':'"
        ));
    }

    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    let target_url = if url.starts_with("http://") || url.starts_with("https://") {
        let parsed = url
            .parse()
            .map_err(|error| format!("invalid window URL: {error}"))?;
        WebviewUrl::External(parsed)
    } else {
        WebviewUrl::App(url.into())
    };

    WebviewWindowBuilder::new(&app, &label, target_url)
        .title(&title)
        .inner_size(1280.0, 800.0)
        .resizable(true)
        .build()
        .map_err(|error| error.to_string())?;

    Ok(())
}
