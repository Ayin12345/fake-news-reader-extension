import { defineContentScript } from '#imports';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    // Content script - runs on web pages
    console.log('Content script loaded')

    //content script logic
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'GET_PAGE_CONTENT') {
        console.log('Processing content on:', window.location.href)
        
        // Check if page is ready
        if (document.readyState !== 'complete') {
          console.log('Page not ready, waiting...');
          // Wait for page to be ready
          window.addEventListener('load', () => {
            setTimeout(() => {
              processPageContent(sendResponse);
            }, 100);
          });
          return true;
        }
        
        // If page is ready, process immediately
        setTimeout(() => {
          processPageContent(sendResponse);
        }, 500); // Increased delay to allow dynamic content to load
        
        return true;
      }
    });
    
    function processPageContent(sendResponse: (response: any) => void) {
      try {
        // Try to find the correct article tag (avoid radio player articles)
        let articleTag = null;
        let bestArticle = null;
        let bestScore = 0;
        
        // First, try to find article tags and score them by content quality
        const allArticles = document.querySelectorAll('article');
        console.log('Found', allArticles.length, 'article tags on page');
        
        for (let i = 0; i < allArticles.length; i++) {
          const article = allArticles[i];
          const articleText = article.innerText || '';
          
          // Skip articles that are clearly not content
          const hasNonContent = 
            // Media players (radio, video, audio)
            articleText.includes('LIVE') ||
            articleText.includes('Resume') ||
            articleText.includes('Listen') ||
            articleText.includes('Play') ||
            articleText.includes('Pause') ||
            articleText.includes('Volume') ||
            articleText.includes('WAMU') ||
            articleText.includes('88.5') ||
            articleText.includes('HD 88.5') ||
            articleText.includes('OPEN') ||
            articleText.includes('TRANSCRIPT') ||
            // Social media/ads
            articleText.includes('Follow us') ||
            articleText.includes('Subscribe') ||
            articleText.includes('Newsletter') ||
            articleText.includes('Sign up') ||
            // Navigation/menu
            articleText.includes('Menu') ||
            articleText.includes('Navigation') ||
            articleText.includes('Search') ||
            // Or has media player elements
            article.querySelector('.play-initial, .audio-player, .radio-player, .video-player, .media-player, [class*="player"], [class*="audio"], [class*="video"], [class*="listen"], [class*="resume"]');
          
          if (hasNonContent) {
            console.log(`Article ${i}: SKIPPED (has non-content), text preview: ${articleText.substring(0, 100)}`);
            continue;
          }
          
          // Score the article based on content quality
          let score = 0;
          
          // Base score from text length (more content = better)
          score += Math.min(articleText.length / 10, 50); // Cap at 50 points
          
          // Bonus for having paragraphs (indicates structured content)
          const paragraphs = article.querySelectorAll('p');
          score += paragraphs.length * 5;
          
          // Bonus for having headings (indicates article structure)
          const headings = article.querySelectorAll('h1, h2, h3, h4, h5, h6');
          score += headings.length * 3;
          
          // Penalty for too many links (might be navigation)
          const links = article.querySelectorAll('a');
          if (links.length > 20) {
            score -= 20;
          }
          
          // Bonus for having article-specific classes
          if (article.className.includes('story') || article.className.includes('article') || 
              article.className.includes('content') || article.className.includes('post')) {
            score += 20;
          }
          
          // Bonus for having article-specific IDs
          if (article.id.includes('story') || article.id.includes('article') || 
              article.id.includes('content') || article.id.includes('post')) {
            score += 15;
          }
          
          // Count words in the article
          const wordCount = articleText.trim().split(/\s+/).filter(word => word.length > 0).length;
          
          console.log(`Article ${i}: score=${score}, words=${wordCount}, text preview: ${articleText.substring(0, 100)}`);
          
          // Only consider articles with substantial content (at least 50 words)
          if (score > bestScore && articleText.length > 100 && wordCount >= 50) {
            bestScore = score;
            bestArticle = article;
          }
        }
        
        if (bestArticle) {
          articleTag = bestArticle;
          console.log(`Selected best article with score ${bestScore}`);
          console.log('Selected article text preview:', bestArticle.innerText.substring(0, 200));
        } else {
          console.log('No suitable article found, will use fallback selectors');
        }
        
        // If no good article found, try other selectors
        if (!articleTag) {
          console.log('No suitable article found, trying alternative selectors...');
          
          // First try to find the main content area
          const mainContent = document.querySelector('main, [role="main"], .main-content, .content-main');
          if (mainContent) {
            console.log('Found main content area, using that');
            articleTag = mainContent;
          } else {
            const selectors = [
              '[role="main"]',
              'main',
              '.content',
              '.main-content',
              '.page-content',
              // Article content selectors
              '.article-content',
              '.story-content', 
              '.post-content',
              '.entry-content',
              '.article-body',
              '.story-body',
              '.post-body',
              '.entry-body',
              '.content-body',
              // Generic content containers
              '.content-wrapper',
              '.article-wrapper',
              '.story-wrapper',
              '.post-wrapper',
              // Common news site patterns
              '.article-text',
              '.story-text',
              '.post-text',
              '.entry-text'
            ];
          
            for (const selector of selectors) {
              articleTag = document.querySelector(selector);
              if (articleTag) {
                console.log('Found content using selector:', selector);
                break;
              }
            }
          }
        }
        
        if (!articleTag) {
          console.log('No article tag found, trying fallback selectors...');
          // Last resort - try to find any content container
          const fallbackSelectors = [
            'body',
            '#content',
            '.page-content',
            '.main-content'
          ];
          
          for (const selector of fallbackSelectors) {
            articleTag = document.querySelector(selector);
            if (articleTag) {
              console.log('Found content using fallback selector:', selector);
              break;
            }
          }
          
          if (!articleTag) {
            sendResponse({ error: "Unable to extract content from this page." });
            return;
          }
        }

        // 2. Extract content and count words/links
        const articleClone = articleTag.cloneNode(true) as HTMLElement;
        
        // Remove scripts, styles, and structured data first
        articleClone.querySelectorAll('script, style, noscript').forEach(el => el.remove());
        
        // Remove navigation, footer, and other non-content elements (more aggressive for Yahoo)
        const elementsToRemove = [
          'nav', 'header', 'footer', '.navigation', '.nav', '.menu',
          '.sidebar', '.related', '.share', '.social', '.breadcrumb',
          '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
          '.tags', '.categories', '.metadata', '.byline', '.author-info',
          '.related-terms', '.details', '.share-buttons',
          // Video and media elements (NPR specific)
          '.video-player', '.audio-player', '.media-player', 
          '.video-container', '.audio-container', '.media-container',
          '.player', '.livestream', '.live-player', '.video-embed',
          '[data-video]', '[data-audio]', '[data-player]',
          // Yahoo-specific elements
          '.advertisement', '.ad', '.ads', '.promo', '.trending',
          '.more-stories', '.recommended', '.newsletter', '.subscription',
          '.toolbar', '.comments', '.social-share',
          '.caas-carousel', '.caas-readmore', '.caas-attr-meta',
          // More aggressive cleanup
          '[data-module]', '.photo-credit',
          '.story-meta', '.story-byline', '.story-timestamp',
          // NPR specific cleanup
          '.audio-module', '.video-module', '.media-credit',
          '.listen-live', '.radio-player', '.wamu-player',
          '.resume-listening', '.audio-controls', '.player-controls',
          '[class*="player"]', '[class*="audio"]', '[class*="listening"]',
          '[id*="player"]', '[id*="audio"]', '[id*="radio"]'
        ];
        
        elementsToRemove.forEach(selector => {
          articleClone.querySelectorAll(selector).forEach(el => el.remove());
        });
        
        // Try to find the specific storytext content first (NPR specific)
        const storytextDiv = articleClone.querySelector('#storytext, .storytext, .story-text, .story-body, .article-body, .content-body, .story-content, .article-content, [class*="story"], [id*="story"]');
        let cleanContent = '';
        
        console.log('=== DETAILED DEBUG ===');
        console.log('Looking for storytext div...');
        console.log('storytextDiv found:', !!storytextDiv);
        
        // Debug: Check what elements are actually available
        console.log('All divs in article:', articleClone.querySelectorAll('div').length);
        console.log('All elements with "story" in class or id:');
        articleClone.querySelectorAll('[class*="story"], [id*="story"]').forEach((el, i) => {
          console.log(`  ${i}: ${el.tagName} id="${el.id}" class="${el.className}"`);
        });
        
        console.log('All elements with "text" in class or id:');
        articleClone.querySelectorAll('[class*="text"], [id*="text"]').forEach((el, i) => {
          console.log(`  ${i}: ${el.tagName} id="${el.id}" class="${el.className}"`);
        });
        
        // Debug: Check what's actually inside the article tag
        console.log('Article tag innerHTML length:', articleClone.innerHTML.length);
        console.log('Article tag innerText length:', (articleClone as HTMLElement).innerText.length);
        console.log('Article tag innerText preview:', (articleClone as HTMLElement).innerText.substring(0, 300));
        console.log('All direct children of article:', articleClone.children.length);
        Array.from(articleClone.children).forEach((child, i) => {
          console.log(`  Child ${i}: ${child.tagName} id="${child.id}" class="${child.className}"`);
        });
        
        if (storytextDiv) {
          console.log('storytextDiv tagName:', storytextDiv.tagName);
          console.log('storytextDiv id:', storytextDiv.id);
          console.log('storytextDiv classes:', storytextDiv.className);
          console.log('storytextDiv innerText preview:', (storytextDiv as HTMLElement).innerText.substring(0, 200));
        }
        
        if (storytextDiv) {
          console.log('Found storytext div, extracting from there');
          const storytextParagraphs = storytextDiv.querySelectorAll('p');
          console.log('Paragraphs in storytext:', storytextParagraphs.length);
          
          storytextParagraphs.forEach((p, index) => {
            const text = p.innerText.trim();
            console.log(`Paragraph ${index}:`, text.substring(0, 100));
            if (text.length > 20 && 
                !text.includes('Advertisement') && 
                text.split(' ').length > 3) {
              cleanContent += text + ' ';
              console.log(`✓ Added paragraph ${index} to content`);
            } else {
              console.log(`✗ Skipped paragraph ${index} (length: ${text.length}, words: ${text.split(' ').length})`);
            }
          });
        } else {
          console.log('No storytext div found, using fallback method');
          // Fallback to all paragraphs with more aggressive filtering
          const paragraphs = articleClone.querySelectorAll('p');
          console.log('Total paragraphs found in article:', paragraphs.length);
          if (paragraphs.length > 0) {
            paragraphs.forEach((p, index) => {
              const text = p.innerText.trim();
              console.log(`Fallback paragraph ${index}:`, text.substring(0, 100));
              // Improved content filtering
              if (text.length > 20 && 
                  !text.includes('Advertisement') && 
                  !text.includes('©') &&
                  !text.includes('Subscribe') &&
                  !text.includes('Follow us') &&
                  !text.includes('Live Radio') &&
                  !text.includes('ClosedDisplay') &&
                  !text.includes('LIVE') &&
                  !text.includes('ON AIR') &&
                  !text.includes('Listen Live') &&
                  !text.includes('WAMU') &&
                  !text.includes('88.5') &&
                  !text.includes('HD 88.5') &&
                  !text.includes('ListeningWAMU') &&
                  !text.includes('The Daily') &&
                  !text.includes('RESUME LISTENING') &&
                  !text.match(/^\s*\d+\s*$/) && // Skip lone numbers
                  !text.match(/^[A-Z\s]+$/) && // Skip all caps (likely headings/metadata)
                  !text.match(/^\d+\s*(SECONDS|MINUTES|HOURS)$/i) && // Skip time indicators
                  text.split(' ').length > 3) { // Must have at least 4 words
                cleanContent += text + ' ';
                console.log(`✓ Added fallback paragraph ${index} to content`);
              } else {
                console.log(`✗ Skipped fallback paragraph ${index} (length: ${text.length}, words: ${text.split(' ').length})`);
              }
            });
          }
        }
        
        // If still not enough content, try other text elements
        if (cleanContent.length < 200) {
          // Try div elements that might contain article text
          const textElements = articleClone.querySelectorAll('div, span');
          textElements.forEach(el => {
            const text = (el as HTMLElement).innerText.trim();
            if (text.length > 30 && 
                !text.includes('Advertisement') && 
                !text.includes('©') &&
                text.split(' ').length > 5) {
              // Only add if it's not already included
              if (!cleanContent.includes(text.substring(0, 50))) {
                cleanContent += text + ' ';
              }
            }
          });
        }

        // Final fallback
        if (cleanContent.length < 200) {
          cleanContent = articleClone.innerText || '';
        }
        
        // Count links for debugging purposes only
        const linkCount = articleClone.querySelectorAll('a').length;
        
        // Clean up excessive whitespace and line breaks
        let content = cleanContent
          .replace(/\s+/g, ' ')           
          .replace(/\n\s*\n/g, '\n')      
          .trim();
          
          
          const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
          
          console.log('=== CONTENT EXTRACTION DEBUG ===');
          console.log('Article tag found:', !!articleTag);
          console.log('Article tag selector used:', articleTag?.tagName || 'none');
          console.log('Storytext div found:', !!storytextDiv);
          console.log('Clean content length:', cleanContent.length);
          console.log('Final content length:', content.length);
          console.log('Word count:', wordCount, 'Link count:', linkCount);
          console.log('Content preview:', content.substring(0, 300) + '...');
          console.log('================================');
          
          // 3. Check word count constraints only
          if (wordCount < 100 || wordCount > 5000) {
            sendResponse({error: "Not a valid article: must have 100-5000 words. This article has " + wordCount + " words."});
            return;
          }

          // 4. If all checks pass, send the article info
          const pageContent = {
            title: document.title,
            content: content,
            url: window.location.href,
            wordCount: wordCount
          };
          sendResponse({ success: true, data: pageContent });
      } catch (error) {
        console.error('Content script error:', error);
        sendResponse({ error: "Failed to extract page content." });
      }
    }
  }
});