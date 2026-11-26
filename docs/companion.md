# Game Time companion (Windows)

The LevelUp Life desktop app has game tracking built in: it recognises running games, counts playtime, shows daily
limits with reminders, and (optionally) syncs with the website so the same numbers appear on the website's **Game Time**
page.

**Plug and play.** There is nothing to set up after installing. The installer opens the app, tracking is already on,
games from the launchers are found and tracked straight away, and the app is set to start with Windows (in the tray).
A notification says "Game tracking is on". In the app there is no separate Game Time tab: live tracking (Now, Today,
Tracked games) is at the top of the **Gaming** tab, and its settings (limits, time zone, reminders, startup, website
sync, history) are in **Settings**. Tracked minutes also count in Gaming's weekly stats, Balance, badges and
challenges, and the Balance gaming limit is the same as the app's overall daily limit.

## How it fits together

```
 Windows PC                                               Website (Wix Headless, free plan)
 ┌──────────────────────────────────────────┐            ┌───────────────────────────────────┐
 │ LevelUp Life.exe (Electron)               │            │ web/ (the same pages)              │
 │  splash + auto-update (GitHub Releases)   │            │  Game Time page                    │
 │  tray: tracking on/paused, quit           │   HTTPS    │   reads/writes the member's own:   │
 │  companion/                               │ ─────────▶ │   GameSessions  (session pieces)   │
 │   processes.js  process list (least      │            │   CompanionDevices (check-ins)     │
 │                 access)                   │            │   CompanionConfig  (games, limits) │
 │   scanners.js   Steam/Epic/Xbox/GOG/…     │            │  permissions: insert = member,     │
 │   matcher.js    exe → game, exclusions    │            │  read/update/remove = item author  │
 │   tracker.js    sessions, gaps, warnings  │            └───────────────────────────────────┘
 │   sync.js       offline queue             │
 │   wix.js        browser sign-in (PKCE)    │
 │   service.js    check-ins, settings sync  │
 │  web/companion-core.js  days, overlap,    │  ◀── shared with the website
 │                         limits, warnings  │
 └──────────────────────────────────────────┘
```

* **Detection** reads the Windows process list (names, and paths with `PROCESS_QUERY_LIMITED_INFORMATION` only) and
  launcher files (Steam `libraryfolders.vdf` + `appmanifest_*.acf`, Epic `.item` manifests, Xbox `XboxGames` folders and
  `.GamingRoot`, GOG / EA / Ubisoft / Battle.net / Riot / Rockstar uninstall entries). Launchers, updaters, crash
  reporters and anti-cheat programs are excluded (`companion/matcher.js`).
* **Tracking** checks every 5 seconds. A session grows only while its game is seen. A gap longer than 30 seconds
  (sleep, hibernate, the app closed or crashed, a frozen PC, the clock moved back) ends the session where the game
  was last seen. Open sessions are saved every few seconds, so a crash loses at most one check.
* **Days** start at midnight in the chosen time zone (default: the PC's). Sessions that cross midnight are split.
  The overall limit counts overlapping games once (interval union).
* **Reminders** at 30, 10 and 0 minutes left, per game and overall, once each per day; thresholds bigger than the
  limit are skipped, and if several pass at once only the most urgent is shown. At the limit the app shows
  "Daily limit reached" and keeps counting overtime. Games are never closed or blocked.
* **Sync**: each session piece has an id `<session uuid>_<day>`, uploaded with Wix Data "bulk save" (an upsert), so
  repeats never double count. Uploads are queued on disk while offline and retried with back-off. Settings merge per
  game (newest edit wins; removals travel as markers). Install folders and full paths never leave the PC.
* **Sign-in** uses the site's existing online accounts: the app opens the Wix login page in the normal browser and
  receives a one-time code on `http://localhost:47321-47323/callback` (OAuth 2.0 + PKCE). The refresh token is stored
  encrypted with Electron `safeStorage` (Windows DPAPI). Disconnecting from the website sets a "disconnected" mark that
  the PC sees on its next check-in (about a minute); it then deletes its sign-in. (Wix offers no API to revoke a
  member's refresh token, so this is how disconnecting works.)

### Why these tools

| Need | Choice | Why |
|---|---|---|
| Desktop app | **Electron** (already used) + **electron-builder** NSIS | Reuses the website's code and design; free; per-user install, no admin |
| Process list | **koffi** (MIT) calling Toolhelp32 / `QueryFullProcessImageNameW` | No compiler or PowerShell needed; lowest access level |
| Auto-update | **electron-updater** + GitHub Releases | Free, standard, works with unsigned and signed builds |
| Backend | **Wix Data** collections (already used) | No server to run; member-only permissions |
| Tests | **node:test** + **Playwright** | Built in / already used; fake clock and process list |

## Develop

```bash
npm ci
npm start                  # the desktop app from source (window + tray + tracking)
npm test                   # lint + unit tests + browser suites
npm run test:unit          # fast: tracker, midnight, sleep, sync, overlap, reminders, scanners, Wix client
node tests/desktop/e2e.js  # the real desktop app with fake game processes and a fake website
```

On Linux, run the desktop test under a virtual display: `xvfb-run -a node tests/desktop/e2e.js`.

When running **from source only** (never in the installed app), these environment variables help with testing:
`LEVELUP_FAKE_PROCESSES` (a JSON file of pretend processes), `LEVELUP_WIX_API` (a fake API), `LEVELUP_USER_DATA`,
`LEVELUP_POLL_MS`, `LEVELUP_HEARTBEAT_MS`, `LEVELUP_OPEN_EXTERNAL_HOOK`.

The browser suites generate throwaway owner/admin keys for each run (`tests/web/harness.js`); the real keys are never
needed or stored in the repository.

## Build the installer

```bash
npm run dist
```

Works on Windows, and on Linux without Wine. Output in `dist/`: `LevelUp-Life-Setup-<version>.exe`, its `.blockmap`
and `latest.yml` (the update files). The installer is per-user (no admin rights), adds Start menu and desktop
shortcuts, and removes the old 1.0 entry from "Installed apps".

## Release (and auto-update)

1. Set the new `version` in `package.json` (for example `1.2.1`) and commit.
2. Tag and push: `git tag v1.2.1 && git push origin v1.2.1`.
3. The **Windows app** workflow tests everything, builds the installer and publishes a GitHub Release with the
   installer, `latest.yml`, the blockmap and a fixed-name copy `LevelUp-Life-Setup.exe`.
4. Installed apps check for updates on every start (splash screen with a loading bar) and every 6 hours; a new version
   downloads and installs itself, like Discord or Steam.

The repository must be **public** so that apps and visitors can download releases without signing in.

## The website's Download app button

The **Download app** button sits under the profile button in the website's top bar (it is hidden inside the desktop
app). It opens a panel with the Windows download, the SmartScreen explanation right next to it, and the "install as a
web app" option for phones and Macs. Where the installer is found is looked up at the moment someone opens the panel,
so no code change is needed when a release is published:

1. `web/downloads.json` on the website: if `windows.url` holds an `https://` address, that is used. This lets the
   installer live anywhere (a GitHub release, a file host, a CDN). Optional `version`, `size` (bytes) and `all`
   (a "All versions" page) are shown too.
2. Otherwise the latest GitHub release of the repository named in `downloads.json` (`github`) is read from the GitHub
   API, preferring the fixed-name asset `LevelUp-Life-Setup.exe`.
3. If neither has an installer, the panel says **"Coming soon"** instead of showing a broken link.

**Current download:** the installer is published as `LevelUp-Life-Setup.zip` in the site's Wix Media (Wix Media
accepts archives up to 4 GB but not .exe files), and `web/downloads.json` points at it. For a new version: upload the
new zip in Media (or with the Media API's generate-upload-url), then update `windows.url`, `version` and `size`.

### If GitHub isn't available

The desktop app checks GitHub Releases first and then the website's own update feed at
`<website>/updates/latest.yml`. To publish without GitHub: upload `LevelUp-Life-Setup-<version>.exe` anywhere with a
public `https://` address, put that address in `downloads.json` (`windows.url`), and publish `dist/latest.yml` as
`updates/latest.yml` on the website with its `url`/`path` changed to the same full address (the `sha512` must stay
the one electron-builder wrote).

## SmartScreen and code signing

The installer is not signed, so Windows SmartScreen shows **"Windows protected your PC"** until the download builds
reputation. Users click **More info → Run anyway** (the setup page explains this). Options to sign it:

* **Azure Trusted Signing** (Microsoft, about US$10/month): the cheapest managed option, but identity validation has
  so far only been open to organisations and individuals in certain countries. Check whether South Africa is
  supported before relying on it. electron-builder supports it via `win.azureSignOptions`.
* **An OV code-signing certificate** from a certificate authority (for example Sectigo, SSL.com or Certum), roughly
  US$70–400 a year. Since 2023 the key must live on a hardware token or a cloud signing service. Certum's open-source
  certificate is a lower-cost option for open-source projects.
* **SignPath Foundation**: free signing for qualifying open-source projects.

Signing makes SmartScreen warnings go away faster, and reputation still builds per certificate. To sign in CI, add
`WIN_CSC_LINK` (base64 `.pfx` or its URL) and `WIN_CSC_KEY_PASSWORD` as repository secrets; the workflow passes them to
electron-builder. Hardware-token and cloud-HSM certificates need their vendor's signing tool instead (see the
electron-builder "Code Signing" docs).

## Data and privacy (POPIA)

The privacy notice is section **4f** of the Privacy Terms page. In short: on the PC the app keeps games (with program
names and folders), sessions for 120 days, limits and settings, and the encrypted sign-in. Only if an online account is
connected does it send game names and program names, session times, limits, time zone, reminder setting, the PC's
name, the app version, whether tracking is on and what is playing. It never sends a list of other programs, folders,
screenshots, keystrokes or game accounts. Members can delete history (on the PC and online) and disconnect PCs from
the Game Time page. As the site owner you can see these collections in the Wix dashboard; that is stated in the notice.

## Known limits

* Not detectable: cloud gaming (Xbox Cloud Gaming, GeForce NOW), browser games, games on consoles or phones.
* Older Game Pass games in the protected `WindowsApps` folder, emulators and games from unlisted launchers need adding
  by hand ("Add a running program" or "Add game (.exe)").
* Some anti-cheat-protected games hide their path; matching then uses the program name.
* Start/stop are noticed within 5 seconds, so each session can be up to 5 seconds short, never long.
* Changing the time zone later re-labels days on the PC; pieces already uploaded keep their old day.
* Online accounts are needed for the website dashboard; local-only accounts track on the PC only.

## Manual test checklist (real Windows gaming PC)

Automated tests cover the logic with a fake clock, fake processes and a fake website, plus the real process reader on
the Windows CI runner. Please check these by hand:

- [ ] Website: the Download app button under the profile opens the panel with the download and the SmartScreen note.
- [ ] Download, install, and get past SmartScreen ("More info → Run anyway").
- [ ] Right after installing: the app opens, says "Game tracking is on", has no Game Time tab, and the Gaming tab shows
      your found games; Settings shows "Launch at Windows startup" switched on.
- [ ] On launch the splash shows the logo, name and a loading bar, then the app opens.
- [ ] After publishing a newer release, starting the app shows "Downloading update…", installs it and reopens.
- [ ] Gaming → "Find games again" lists your Steam, Epic, Xbox, GOG, EA, Ubisoft, Battle.net and Riot games.
- [ ] Start a Steam game and an Epic game: each shows as playing within ~5 seconds; the launchers do not.
- [ ] A game with anti-cheat (for example Fortnite, Valorant or Apex) is detected and the game is unaffected.
- [ ] An Xbox / Game Pass game is detected, or can be added with "Add a running program".
- [ ] "Add game (.exe)" and the + button (a second .exe) work for a game without a launcher.
- [ ] Set a 31-minute limit: reminders at 30, 10 and 0 minutes; "Daily limit reached" and overtime counting.
- [ ] Run two games at once: the overall total counts the overlap once.
- [ ] Put the PC to sleep for 10+ minutes with a game open: the sleep is not counted.
- [ ] End the app in Task Manager while playing, start it again: no extra time appears.
- [ ] Pull the network cable, play, reconnect: the website shows the sessions once (no doubles).
- [ ] Connect from the app: the browser opens the website's sign-in page, the app shows your email.
- [ ] Website Game Time page: "Companion connected", the game and session clock; close the app → "last seen".
- [ ] Change a limit on the website: the app shows it within about a minute.
- [ ] "Disconnect" on the website: the app shows "Disconnected from the website" within about a minute.
- [ ] Tray icon is always there while the app runs; Pause/Resume, "Launch at Windows startup" and Quit work.
- [ ] Restart Windows with "Launch at Windows startup" on: the app starts in the tray and says tracking is on.
- [ ] Switch the language in Settings: tray menu and notifications follow it.
- [ ] "Delete game history" clears the PC (and online, when connected).
