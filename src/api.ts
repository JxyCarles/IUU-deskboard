/** 是否运行在 Tauri 桌面壳里（npm run dev 直接开浏览器时为 false） */
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function call<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) throw new Error("该功能需要在桌面客户端中使用");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export async function openUrl(url: string) {
  if (!url) return;
  if (isTauri) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank");
  }
}

export async function currentWindow() {
  if (!isTauri) return null;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

export async function notify(title: string, body: string) {
  if (!isTauri) {
    if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body });
    return;
  }
  const n = await import("@tauri-apps/plugin-notification");
  let ok = await n.isPermissionGranted();
  if (!ok) ok = (await n.requestPermission()) === "granted";
  if (ok) n.sendNotification({ title, body });
}
