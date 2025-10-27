export async function fetchOpenAI(content: string, apiKey: string) {
    console.time('[AI] OpenAI request');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content }]
      })
    })
    console.timeEnd('[AI] OpenAI request');
    const data = await response.json();
    if (data.choices && data.choices[0] && data.choices[0].message.content) {
      return data.choices[0].message.content;
    } else {
      throw new Error(data.error?.message || 'No response from OpenAI');
    }
  }

async function fetchGeminiWithModel(content: string, apiKey: string, model: string) {
    console.time(`[AI] Gemini ${model} request`);
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: content
                }]
            }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 6000
            }
        })
    });
    console.timeEnd(`[AI] Gemini ${model} request`);

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini ${model} API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`Gemini ${model} API Response Data:`, JSON.stringify(data, null, 2));
    
    if (data.candidates && data.candidates[0]) {
        const candidate = data.candidates[0];
        
        // Check for different finish reasons
        if (candidate.finishReason === 'MAX_TOKENS') {
            throw new Error(`Gemini ${model} response was truncated due to token limit. Try reducing your input length.`);
        }
        
        if (candidate.finishReason === 'SAFETY') {
            throw new Error(`Gemini ${model} response was blocked due to safety filters.`);
        }
        
        // Check if we have content with parts
        if (candidate.content && candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text) {
            return candidate.content.parts[0].text;
        }
        
        // If no parts, check if there's text directly in content
        if (candidate.content && candidate.content.text) {
            return candidate.content.text;
        }
        
        throw new Error(`Gemini ${model} response incomplete. Finish reason: ${candidate.finishReason || 'unknown'}`);
    } else {
        console.error(`Gemini ${model} response structure:`, data);
        throw new Error(data.error?.message || `No candidates in Gemini ${model} response`);
    }
}

export async function fetchGemini(content: string, apiKey: string) {
    // Try Gemini 2.5 Flash first (faster, newer)
    try {
        console.log('[AI] Trying Gemini 2.5 Flash...');
        return await fetchGeminiWithModel(content, apiKey, 'gemini-2.5-flash');
    } catch (error) {
        console.warn('[AI] Gemini 2.5 Flash failed, trying backup model:', error);
        
        // Fallback to Gemini 1.5 Pro (more reliable, older)
        try {
            console.log('[AI] Trying Gemini 1.5 Pro as backup...');
            return await fetchGeminiWithModel(content, apiKey, 'gemini-2.5-flash-lite');
        } catch (backupError) {
            console.error('[AI] Both Gemini models failed:', backupError);
            // Throw a more user-friendly error message
            throw new Error('Analysis failed due to AI model limitations. Please try with a shorter article or try again later.');
        }
    }
}


