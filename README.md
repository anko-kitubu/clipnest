# ClipNest

ClipNest is a Windows desktop app built with Electron + Vue.
It combines an image clipboard canvas and a simple task manager in one app.

## Features
- `Clipboard` tab
- Add image from OS clipboard with `Ctrl+V`
- Add image files by drag and drop
- Move and resize images on a white canvas
- Copy selected image back to OS clipboard
- Undo operations on the canvas
- Keep up to 50 images in memory (oldest removed first)
- Canvas state is kept while switching tabs (same app session)

- `Tasks` tab
- Add tasks
- Remove task immediately by checking it
- Tasks are persisted in localStorage

- `Always on top`
- Toggle from header switch
- State is persisted and restored on next launch

## Development
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

## Windows Installer
```bash
npm run dist:win
```

Generated artifacts:
- `release/ClipNest Setup <version>.exe`
- `release/win-unpacked/ClipNest.exe`
