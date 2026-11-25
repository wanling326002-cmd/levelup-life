# LevelUp Life

Balance gaming, series and YouTube with learning (Web Design & App Development), focus and daily good deeds.
Local-first: all data stays on your device.

## Website
Open `web/index.html` in any browser, or upload the `web/` folder to any static host
(GitHub Pages, Netlify, Cloudflare Pages).

## Windows app and Game Time companion
Download the latest installer from the
[releases page](https://github.com/wanling326002-cmd/levelup-life/releases/latest) (per-user install, no admin
needed). The app updates itself on start, and its **Game Time** page tracks games automatically with daily limits
and reminders. See [docs/companion.md](docs/companion.md) for how it works, privacy, releasing, code signing and
the manual test checklist.

## Develop
```
npm ci
npm start          # run the desktop app from source
npm test           # lint, unit tests and browser tests
npm run dist       # build the Windows installer into dist/ (Windows, or Linux without Wine)
```
