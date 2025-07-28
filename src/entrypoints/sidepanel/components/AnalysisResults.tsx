import React, { useState } from 'react';
import styles from '../styles/AnalysisResults.module.css';

interface AnalysisResult {
  provider: string;
  result: {
    credibility_score: number;
    credibility_summary: string;
    reasoning: string;
    evidence_sentences: Array<{
      quote: string;
      impact: string;
    }>;
    supporting_links: string[];
  };
}

interface AnalysisResultsProps {
  analysis: AnalysisResult[];
  selectedProvider: string;
  onProviderSelect: (provider: string) => void;
}

const calculateAverageScore = (results: AnalysisResult[]): number => {
  if (results.length === 0) return 0;
  const sum = results.reduce((acc, curr) => acc + curr.result.credibility_score, 0);
  return Math.round(sum / results.length);
};

const getScoreRange = (results: AnalysisResult[]): { min: number; max: number } => {
  if (results.length === 0) return { min: 0, max: 0 };
  const scores = results.map(r => r.result.credibility_score);
  return {
    min: Math.min(...scores),
    max: Math.max(...scores)
  };
};

// Collect unique evidence from all AIs
const getAllEvidence = (results: AnalysisResult[]) => {
  const evidenceMap = new Map<string, { impact: string; providers: string[] }>();
  
  results.forEach(result => {
    // Add null check for evidence_sentences
    if (result.result.evidence_sentences && Array.isArray(result.result.evidence_sentences)) {
      result.result.evidence_sentences.forEach(evidence => {
        const existing = evidenceMap.get(evidence.quote);
        if (existing) {
          existing.providers.push(result.provider);
        } else {
          evidenceMap.set(evidence.quote, {
            impact: evidence.impact,
            providers: [result.provider]
          });
        }
      });
    }
  });

  // Convert to array and sort by number of providers citing it
  return Array.from(evidenceMap.entries())
    .map(([quote, data]) => ({
      quote,
      impact: data.impact,
      providers: data.providers
    }))
    .sort((a, b) => b.providers.length - a.providers.length);
};

// Collect all unique supporting links
const getAllLinks = (results: AnalysisResult[]): string[] => {
  const uniqueLinks = new Set<string>();
  results.forEach(result => {
    // Add null check for supporting_links
    if (result.result.supporting_links && Array.isArray(result.result.supporting_links)) {
      result.result.supporting_links.forEach(link => uniqueLinks.add(link));
    }
  });
  return Array.from(uniqueLinks);
};

const getScoreCategory = (score: number) => {
  if (score >= 85) return { text: 'Highly Credible', class: styles.scoreHigh };
  if (score >= 70) return { text: 'Credible', class: styles.scoreMedium };
  if (score >= 50) return { text: 'Somewhat Credible', class: styles.scoreMediumLow };
  return { text: 'Low Credibility', class: styles.scoreLow };
};

// Get a balanced summary from all AI responses
const getBalancedSummary = (results: AnalysisResult[]): string => {
  // Use the response with score closest to average for base summary
  const avgScore = calculateAverageScore(results);
  const mainResponse = results.reduce((closest, current) => {
    const currentDiff = Math.abs(current.result.credibility_score - avgScore);
    const closestDiff = Math.abs(closest.result.credibility_score - avgScore);
    return currentDiff < closestDiff ? current : closest;
  }, results[0]);

  return mainResponse.result.credibility_summary;
};

export const AnalysisResults: React.FC<AnalysisResultsProps> = ({ 
  analysis
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [showAllEvidence, setShowAllEvidence] = useState(false);
  
  // Add safety check for analysis array
  if (!analysis || !Array.isArray(analysis) || analysis.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.errorState}>
          <p>No analysis results available.</p>
        </div>
      </div>
    );
  }
  
  const averageScore = calculateAverageScore(analysis);
  const scoreRange = getScoreRange(analysis);
  const allEvidence = getAllEvidence(analysis);
  const allLinks = getAllLinks(analysis);
  const scoreCategory = getScoreCategory(averageScore);
  
  const displayedEvidence = showAllEvidence ? allEvidence : allEvidence.slice(0, 3);

  return (
    <div className={styles.container}>

      {/* Main Score Section */}
      <div className={`${styles.scoreContainer} ${scoreCategory.class}`}>
        <div className={styles.scoreHeader}>
          <div className={styles.scoreMain}>
            <h2>Credibility</h2>
            <div className={styles.scoreCategory}>{scoreCategory.text}</div>
          </div>
          <div className={styles.scoreInfo}>
            <div className={styles.scoreDisplay}>
              <span className={styles.scoreValue}>{averageScore}</span>
              <span className={styles.scoreMax}>/100</span>
            </div>
            <span className={styles.scoreRange}>
              (range: {scoreRange.min}-{scoreRange.max})
            </span>
          </div>
        </div>
        <div className={styles.summaries}>
          {analysis.map((result, idx) => (
            <p key={idx} className={styles.summary}>
              <span className={styles.aiTag}>{result.provider}:</span> 
              {result.result.credibility_summary && result.result.credibility_summary.trim() ? 
                result.result.credibility_summary : 
                <span style={{fontStyle: 'italic', color: '#666'}}>No summary available</span>
              }
            </p>
          ))}
        </div>
      </div>

      {/* Key Evidence */}
      <div className={styles.section}>
        <h3>Key Evidence</h3>
        <ul className={styles.evidenceList}>
          {displayedEvidence.map((evidence, idx) => (
            <li key={idx} className={styles.evidenceItem}>
              <div className={styles.quote}>"{evidence.quote}"</div>
              <div className={styles.impact}>{evidence.impact}</div>
              <div className={styles.providers}>
                Cited by: {evidence.providers.join(', ')}
              </div>
            </li>
          ))}
        </ul>
        {allEvidence.length > 3 && (
          <button 
            className={styles.moreButton}
            onClick={() => setShowAllEvidence(!showAllEvidence)}
          >
            {showAllEvidence ? 'Show Less' : `Show ${allEvidence.length - 3} More`}
          </button>
        )}
      </div>

      {/* Supporting Links */}
      {allLinks.length > 0 && (
        <div className={styles.section}>
          <h3>Alternative Sources</h3>
          <ul className={styles.linkList}>
            {allLinks.map((link, idx) => (
              <li key={idx}>
                {link.startsWith('http') ? (
                  <a 
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      window.open(link, '_blank');
                    }}
                    className={styles.link}
                  >
                    {link}
                  </a>
                ) : (
                  <span className={styles.errorMessage}>
                    {link}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Detailed Analysis Toggle */}
      <button 
        className={styles.detailsToggle}
        onClick={() => setShowDetails(!showDetails)}
      >
        {showDetails ? 'Hide Detailed Analysis' : 'Show Detailed Analysis'}
      </button>

      {/* Detailed Analysis Section */}
      {showDetails && (
        <div className={styles.detailedAnalysis}>
          <h3>Individual AI Assessments</h3>
          {analysis.map((result, idx) => (
            <div key={idx} className={styles.aiResponse}>
              <div className={styles.aiHeader}>
                <span className={styles.aiName}>{result.provider}</span>
                <span className={styles.aiScore}>{result.result.credibility_score}/100</span>
              </div>
              <p className={styles.aiReasoning}>{result.result.reasoning}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}; 