# AI Prompts Configuration

## Overview
Your AI analysis prompts are now stored in `src/utils/prompts.ts` for easy customization.

## File Structure
- **`src/utils/prompts.ts`** - Contains the main analysis prompt and helper function
- **`ANALYSIS_PROMPT`** - The main prompt template used for analyzing articles
- **`buildAnalysisPrompt()`** - Function that builds the complete prompt with article data

## Customizing the Prompt

### Basic Customization
Edit the `ANALYSIS_PROMPT` constant in `src/utils/prompts.ts` to modify:
- Analysis instructions
- Output format requirements
- Critical rules and formatting guidelines
- Evidence extraction requirements

### Placeholders
The prompt uses these placeholders that get replaced with actual data:
- `{url}` - Article URL
- `{title}` - Article title  
- `{content}` - Article content
- Supporting links are automatically injected into the JSON structure

### Example Modifications

#### Change Analysis Focus
```typescript
export const ANALYSIS_PROMPT = `Analyze this news article for bias and factual accuracy...`;
```

#### Modify Output Format
```typescript
// Change the JSON structure in the prompt
{
  "bias_score": (1-100),
  "fact_check_rating": "true/false/mixed",
  "key_claims": [...],
  "sources": [...]
}
```

#### Add New Rules
```typescript
CRITICAL RULES:
1. REMOVE ALL TRAILING COMMAS
2. SPACING: Put exactly one space between each word
3. YOUR NEW RULE HERE
   - Specific instruction
   - Another instruction
```

## Usage
The prompt is automatically used by:
- `src/utils/analysisOperations.ts` (main analysis function)
- `src/entrypoints/sidepanel/App-old.tsx` (legacy app component)

No code changes needed - just edit the prompt and rebuild!

## Rebuilding
After making changes to the prompt:
```bash
npm run build
```

## Tips
- Keep the JSON structure consistent with your TypeScript types
- Test changes with different types of articles
- The prompt affects both OpenAI and Gemini responses
- Use clear, specific instructions for better AI responses
