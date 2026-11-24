# Custom wallpaper for WhatsApp Desktop

Use **any image** as the chat background in WhatsApp Desktop for Windows—either globally for all chats or **per individual contact / group**. The official app only lets you choose from its built-in colors and patterns.

> Not affiliated with, endorsed by, or connected to WhatsApp or Meta in any way.

WhatsApp itself is **not modified**. Modern WhatsApp Desktop is WhatsApp Web running inside Microsoft's embedded Edge browser (WebView2). This mod is a tiny browser extension that the embedded browser is told to load.

## Features

- **Per-contact / per-group wallpapers:** Click the wallpaper icon in any chat's header inside WhatsApp to set or remove a wallpaper for that specific conversation.
- **Global default wallpaper:** Optionally set a fallback wallpaper for all other chats.
- **Installer or in-app UI:** Configure wallpapers directly inside WhatsApp without re-running the installer, or pass `-Contact` / `-Image` to `files/install.ps1`.

## Requirements

- Windows 10 or 11
- WhatsApp Desktop from the Microsoft Store
- A Windows account with administrator rights (asked for once, during install)

## Zero-Admin / Zero-Registry Option (Edge or Chrome App)

If you prefer **no administrator privileges and no registry changes at all**, you can run WhatsApp Web as a standalone desktop app (PWA) in Microsoft Edge or Google Chrome and load the extension directly:

1. Open `edge://extensions` (or `chrome://extensions`) and enable **Developer mode**.
2. Click **Load unpacked** and select the `files/extension` folder from this repository.
3. Open [web.whatsapp.com](https://web.whatsapp.com), click the **Install app** icon in the address bar (or browser menu → **Apps → Install this site as an app**).
4. Open any chat and click the **wallpaper icon** in the chat header to set per-contact or default wallpapers.

> **Why does the Microsoft Store app (`WhatsApp.Root.exe`) still require admin + a registry key?**
> Windows restricts `HKCU\Software\Policies\...` to administrators, and Microsoft Store (MSIX) apps cannot receive per-app command-line flags via a simple shortcut or process-only environment variable. The alternative `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` user environment variable still writes to `HKCU\Environment` in the registry and affects *all* WebView2 apps on your PC rather than just WhatsApp.

## Easy install (Microsoft Store WhatsApp Desktop)

1. Download or clone this repository.
2. **Right-click `Install.cmd` → Run as administrator** and click **Yes**.
3. Choose whether to set a **default wallpaper for all chats**, a **specific contact/group**, or **skip** and pick wallpapers directly inside WhatsApp.
4. WhatsApp restarts. Open any chat and click the **wallpaper icon** in the chat header to set or remove a wallpaper for that specific chat.

**Change or add another contact:** click the wallpaper icon inside any WhatsApp chat, or run `Install.cmd` again.
**Remove it:** right-click **`Uninstall.cmd`** → Run as administrator.

> **"Smart App Control blocked..."**: Windows 11's Smart App Control blocks unsigned scripts when you double-click them. Use right-click → **Run as administrator** as shown above. If it's still blocked, use the [manual install](#manual-install) below; it's just copying files and pasting one command.
>
> **"Windows protected your PC"**: click **More info → Run anyway**. Windows shows this for any script downloaded from the internet.
>
> Everything the scripts run is in this repo, so you can read it first.

## Manual install

If you'd rather not run a script:

1. Create the folder `%LOCALAPPDATA%\WhatsAppWallpaper` (paste that into the File Explorer address bar).
2. Copy `manifest.json` and `wallpaper.css` from [`files/extension`](files/extension) into it.
3. Copy your image into it and rename it to `wallpaper.jpg` (PNG and other formats work too, just keep that name).
4. Open PowerShell **as administrator** and run:
   ```powershell
   $k='HKCU:\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments'; New-Item $k -Force | Out-Null; New-ItemProperty $k -Name 'WhatsApp.Root.exe' -Value "--load-extension=`"$env:LOCALAPPDATA\WhatsAppWallpaper`"" -PropertyType String -Force
   ```
5. Fully quit WhatsApp (check the system tray) and open it again.

**Manual removal** (admin PowerShell), then delete the `%LOCALAPPDATA%\WhatsAppWallpaper` folder:
```powershell
Remove-ItemProperty 'HKCU:\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments' -Name 'WhatsApp.Root.exe'
```

## How it works

- WebView2 reads a per-app registry policy, `AdditionalBrowserArguments`, and adds those flags when it launches. The installer adds `--load-extension` for `WhatsApp.Root.exe` only, so no other app is affected.
- **Why admin?** Windows only lets administrators write under `HKCU\Software\Policies`. That registry write is the only thing that needs it.
- The extension ([`wallpaper.css`](files/extension/wallpaper.css) and [`wallpaper.js`](files/extension/wallpaper.js)) watches the active chat header on `web.whatsapp.com`, applies any contact-specific wallpaper (falling back to the default wallpaper if set), and adds a wallpaper picker button to the chat header.
- It only runs on `web.whatsapp.com`, only requests `storage` and `unlimitedStorage` permissions (to save your chosen images locally in the browser), and sends nothing over the network.
- No debugging ports, no patched files, nothing sent anywhere.

## Troubleshooting

- **Background didn't change:** a WhatsApp update may have renamed the part of the page the mod targets. The selectors are in [`wallpaper.css`](files/extension/wallpaper.css). Issues and pull requests are welcome.
- **Setting didn't apply:** if you're on a standard account and typed in a *different* admin account's password, the setting was saved for that account instead. Run the installer from an admin account.
- **It stopped working entirely:** Meta could turn off extension support in WhatsApp's embedded browser in a future update.

## License

[MIT](LICENSE)

---

<sub>Freshly baked by [Tweakery](https://github.com/Tweakery) 🥐</sub>
