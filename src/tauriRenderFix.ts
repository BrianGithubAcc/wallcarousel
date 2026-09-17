import {
  invoke,
} from '@tauri-apps/api/core'

import {
  getCurrentWindow,
} from '@tauri-apps/api/window'


function nextPaint(): Promise<void> {
  return new Promise(
    (resolve) => {
      requestAnimationFrame(
        () => {
          requestAnimationFrame(
            () => resolve(),
          )
        },
      )
    },
  )
}


/*
 * WebKitGTK on Wayland can occasionally leave the
 * transparent fullscreen WebView with a corrupted backing
 * surface.
 *
 * A native window-state transition after the page has
 * actually rendered forces WebKit/GTK to rebuild it.
 *
 * This intentionally mirrors the known fullscreen-toggle
 * workaround, but synchronises the toggles with real browser
 * paint frames instead of using an arbitrary timeout.
 */
export async function fixTauriRendering():
  Promise<void>
{
  const currentWindow = getCurrentWindow()

  try {
    /*
     * Wait until React has had a chance to commit and
     * WebKit has submitted real frames.
     */
    await nextPaint()

    /*
     * Overlay normally begins fullscreen, therefore this
     * first transition exits fullscreen.
     */
    await invoke(
      'toggle_render_fullscreen',
    )

    /*
     * Make sure Wayland/WebKit sees the intermediate state.
     */
    await nextPaint()

    /*
     * Restore the original fullscreen state.
     */
    await invoke(
      'toggle_render_fullscreen',
    )

    /*
     * Let ResizeObserver / Three.js consume the final
     * compositor dimensions before the next interaction.
     */
    await nextPaint()

    window.dispatchEvent(
      new Event('resize'),
    )

    console.info(
      `[wallcarousel] forced post-render WebKit redraw for ${currentWindow.label}`,
    )
  } catch (error) {
    console.error(
      '[wallcarousel] post-render redraw failed:',
      error,
    )
  }
}
