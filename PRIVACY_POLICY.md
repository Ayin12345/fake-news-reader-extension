# NewsScan Privacy Policy

**Last Updated**: 11/27/2025

## Introduction

NewsScan ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and protect information when you use the NewsScan browser extension.

## Information We Collect

### Article Content
- **URLs**: We collect the URL of news articles you choose to analyze
- **Article Titles**: We collect article titles for analysis purposes
- **Article Content**: We collect the text content of articles you analyze

### How We Collect Information
- Information is collected only when you explicitly request an analysis by clicking the NewsScan extension icon
- We do not automatically collect information from pages you visit
- We only access the current active tab when you trigger an analysis

## How We Use Your Information

### AI Analysis
- Article content is sent to our secure backend server for AI-powered credibility analysis
- We use OpenAI and Google Gemini AI services to analyze article credibility
- Analysis results are cached locally in your browser to avoid redundant API calls

### Web Search Integration
- Article titles and URLs may be used to search for related articles and fact-checking sources via Google Custom Search API
- This helps provide supporting evidence for credibility assessments

### Data Storage
- Analysis results are stored locally in your browser using Chrome's storage API
- Cached analysis results help improve performance and reduce API usage
- You can clear this data at any time through Chrome's extension storage settings

## Third-Party Services

NewsScan uses the following third-party services:

### Backend Services
- **Our Backend Server**: Hosted on cloud infrastructure (Render/Railway/Fly.io)
  - Processes article content for AI analysis
  - Implements caching to reduce API costs
  - Does not store article content permanently

### AI Providers
- **OpenAI**: Used for article credibility analysis
  - See OpenAI's Privacy Policy: https://openai.com/policies/privacy-policy
- **Google Gemini**: Used for article credibility analysis
  - See Google's Privacy Policy: https://policies.google.com/privacy

### Search Services
- **Google Custom Search API**: Used to find related articles and fact-checking sources
  - See Google's Privacy Policy: https://policies.google.com/privacy

## Data Sharing

- We do not sell, trade, or rent your personal information
- Article content is shared only with:
  - Our backend server (for processing)
  - AI providers (OpenAI, Google Gemini) for analysis
  - Google Custom Search API for finding related articles
- We do not share article content with any other third parties

## Data Retention

### Local Storage
- Analysis results are cached locally in your browser
- Cached data persists until you:
  - Clear browser data
  - Uninstall the extension
  - Manually clear extension storage

### Backend Storage
- Article content is temporarily cached on our backend server using Redis
- Cache entries expire automatically after a set period
- We do not permanently store article content

## Your Rights

You have the right to:
- **Access**: Request information about what data we have collected
- **Delete**: Clear cached analysis data from your browser
- **Control**: Choose which articles to analyze (analysis is opt-in only)

### How to Delete Your Data
1. Open Chrome Settings → Extensions
2. Find NewsScan extension
3. Click "Details" → "Storage" → "Clear"
4. Or uninstall the extension to remove all local data

## Security

- We use HTTPS for all backend communications
- API keys are stored securely on our backend server (never exposed to your browser)
- We implement rate limiting to prevent abuse
- We follow security best practices for data handling

## Changes to This Privacy Policy

We may update this Privacy Policy from time to time. We will notify you of any changes by:
- Updating the "Last Updated" date at the top of this policy
- Posting a notice in the extension (for significant changes)

## Contact Us

If you have questions about this Privacy Policy, please contact us at:
- Email: yinaleksei@gmail.com
- GitHub: Ayin12345/fake-news-reader-extension

## Consent

By using NewsScan, you consent to this Privacy Policy.

---

**Note**: This extension is provided "as is" for informational purposes. AI-generated credibility scores are estimates and should not be the sole basis for determining article credibility. Always verify information from multiple sources.

