# Logo Setup Instructions

## How to Add Your Custom Logo

Your NewsScan extension is now set up to display a logo next to the "NewsScan" text in the sidebar header.

### Current Setup
- **Logo file location**: `public/logo.png`
- **Logo size**: 24x24 pixels (automatically scaled)
- **Position**: Left side of the header, next to "NewsScan" text
- **Gap**: 8px spacing between logo and text

### To Replace the Logo

1. **Prepare your logo file**:
   - **Best format: SVG** (vector, scales perfectly, crisp at any size)
   - **High-quality PNG**: Export at 2x-3x size (48x48 or 72x72px) for better quality
   - **Avoid**: Low-resolution PNG exports from design tools like Canva
   - **Recommended size**: 24x24 pixels minimum (will be auto-scaled to 24x24px)

2. **Replace the logo file**:
   - Save your logo as `public/logo.png` (current format)
   - If using SVG/JPG, update the file extension in `src/entrypoints/content.ts` line 237:
     ```typescript
     logo.src = chrome.runtime.getURL('logo.svg'); // or 'logo.jpg'
     ```
   - Also update `wxt.config.ts` in the `web_accessible_resources` section to match your file extension

3. **Test the extension**:
   - Run `npm run dev` to test your changes
   - The logo will appear in the sidebar header next to "NewsScan"

### Logo Requirements
- **Size**: Any size (recommended 24x24 or larger for quality)
- **Format**: SVG preferred, PNG/JPG also supported
- **Colors**: Any colors that work well with your branding
- **Style**: Should complement the clean, modern design

### Better Logo Creation Options
If you want a higher quality logo than Canva provides:
1. **Use professional icon libraries**: 
   - Heroicons, Feather Icons, or Lucide Icons (free)
   - Iconify or Material Icons (free)
2. **Create SVG directly**: Use tools like Figma (free), Adobe Illustrator, or Inkscape (free)
3. **Hire a designer**: For a custom, professional logo
4. **Use AI tools**: Like Midjourney, DALL-E, or Adobe Firefly for logo generation

### Fallback Behavior
- If the logo fails to load, it will automatically hide and only show the "NewsScan" text
- The extension will continue to work normally without the logo

### Current Logo
The current logo is a blue gradient circle with a magnifying glass and "AI" text, representing the AI-powered news analysis functionality.

That's it! Just replace the file and your custom logo will appear in the extension header.
