# Chrome Extension Starter (CRXJS + React + TypeScript)

A minimal starter template for building Chrome extensions with React, TypeScript, and CRXJS.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start development:
```bash
npm run dev
```

3. Load extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

4. Build for production:
```bash
npm run build
```

## Project Structure

- `src/popup.tsx` - Extension popup UI
- `src/App.tsx` - Main React component
- `src/background.ts` - Background script (service worker)
- `src/content.tsx` - Content script (runs on web pages)
- `src/manifest.json` - Extension manifest

## Development

After running `npm run dev`, the extension will automatically reload when you make changes.

Happy coding! 🚀 



THINGS TO DO:
ADD AND COMMIT TO GITHUB
ADD MORE TYPES IN TYPESCRIPT
CHANGE TO WXT (THIS IS CURRENTLY OUTDATED)
SHOW WHY IT ISNT LOADING IN THE POPUP