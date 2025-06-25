'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface AnalysisResult {
  analysisId: string;
  completedAt: string;
  processingTime: number;
  user: {
    domain: string;
    location: string;
    company: string;
  };
  campaign: {
    monthlySpend: number;
    investmentMonths: number;
    totalInvestment: number;
    spendRange: string;
    durationRange: string;
    keywords: string[];
  };
  linkScore: {
    overall: string;
    breakdown: {
      competitivePosition: number; // Out of 30
      performanceVsExpected: number; // Out of 25
      velocityComparison: number; // Out of 20
      marketShareGrowth: number; // Out of 15
      costEfficiency: number; // Out of 10
      modifiers: number; // Bonus/penalty points
    };
    interpretation: {
      grade: string; // A+ to F
      label: string; // Exceptional, Excellent, etc.
      message: string; // Detailed interpretation
      urgency: string; // LOW, MEDIUM, HIGH, CRITICAL
    };
  };
  metrics: {
    currentAuthorityLinks: number;
    authorityLinksGained: number;
    expectedLinks: number;
    competitorAverageLinks: number;
    linkGapsTotal: number;
    linkGapsHighPriority: number;
    costPerAuthorityLink: string;
  };
  competitive: {
    competitors: string[];
    competitorAverageLinks: number;
    gapPercentage: number;
    marketPosition: number;
  };
  redFlags: Array<{
    type: string;
    impact: string;
    message: string;
    severity: string;
    recommendation: string;
  }>;
  performance: {
    grade: string;
    summary: string;
    recommendations: string[];
  };
  historicalData?: Record<string, { historical: number; current: number; gained: number }>;
}

export default function AnalysisResultsPage() {
  const params = useParams();
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [showFloatingMenu, setShowFloatingMenu] = useState(false);

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const response = await fetch(`/api/analyze/${params.id}/results`);
        
        if (response.status === 202) {
          // Analysis is still processing - redirect back to loading screen
          window.location.href = `/assess?id=${params.id}`;
          return;
        }
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch results');
        }
        
        const data = await response.json();
        
        // Double-check that we have all required data
        if (!data.metrics || !data.metrics.currentAuthorityLinks === undefined) {
          // Data is incomplete - wait a bit and try again
          setTimeout(() => {
            window.location.reload();
          }, 2000);
          return;
        }
        
        setAnalysis(data);
      } catch (err) {
        setError(`Failed to load analysis results: ${err instanceof Error ? err.message : 'Unknown error'}`);
        console.error('Error fetching analysis:', err);
      } finally {
        setLoading(false);
      }
    };

    if (params.id) {
      fetchResults();
    }
  }, [params.id]);

  // Handle scroll-based floating menu visibility
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      setShowFloatingMenu(scrollTop > 100); // Show menu after scrolling 100px down
    };

    // Add scroll event listener
    window.addEventListener('scroll', handleScroll);
    
    // Check initial scroll position
    handleScroll();

    // Cleanup
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your results...</p>
        </div>
      </main>
    );
  }

  if (error || !analysis) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Results Not Found</h1>
          <p className="text-gray-600 mb-6">{error || 'Analysis results could not be loaded'}</p>
          <a href="/" className="btn-primary">Run New Analysis</a>
        </div>
      </main>
    );
  }

  const getScoreColor = (scoreStr: string) => {
    const score = parseFloat(scoreStr);
    if (score >= 70) return 'text-green-600 bg-green-100 border-green-200';
    if (score >= 50) return 'text-yellow-600 bg-yellow-100 border-yellow-200';
    return 'text-red-600 bg-red-100 border-red-200';
  };

  const getScoreGrade = (scoreStr: string) => {
    const score = parseFloat(scoreStr);
    if (score >= 90) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    if (score >= 50) return 'D';
    if (score >= 40) return 'D-';
    if (score >= 30) return 'F+';
    return 'F';
  };

  const getScoreLabel = (scoreStr: string) => {
    const score = parseFloat(scoreStr);
    if (score >= 90) return 'Exceptional';
    if (score >= 80) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 60) return 'Average';
    if (score >= 50) return 'Below Average';
    if (score >= 40) return 'Poor';
    if (score >= 30) return 'Critical';
    return 'Failure';
  };

  const getUrgencyLevel = (scoreStr: string) => {
    const score = parseFloat(scoreStr);
    if (score < 40) return 'CRITICAL';
    if (score < 50) return 'HIGH';
    if (score < 70) return 'MEDIUM';
    return 'LOW';
  };

  const copyToClipboard = async () => {
    try {
      const url = window.location.href;
      await navigator.clipboard.writeText(url);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000); // Reset after 2 seconds
    } catch (err) {
      console.error('Failed to copy: ', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = window.location.href;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch (fallbackErr) {
        console.error('Fallback copy failed: ', fallbackErr);
      }
      document.body.removeChild(textArea);
    }
  };

  // Calculate authority links at start of campaign
  const authorityLinksAtStart = analysis.metrics.currentAuthorityLinks - analysis.metrics.authorityLinksGained;
  const authorityLinksNow = analysis.metrics.currentAuthorityLinks;
  const expectedLinks = analysis.metrics.expectedLinks;
  const difference = analysis.metrics.authorityLinksGained;

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            LinkScore Analysis Results
          </h1>
          <p className="text-gray-600">
            Analysis for {analysis.user.domain} • Completed {new Date(analysis.completedAt).toLocaleDateString()}
          </p>
        </header>

        {/* Floating Navigation Menu */}
        <div className={`fixed top-4 right-4 z-50 transition-all duration-300 ease-in-out ${
          showFloatingMenu ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
        }`}>
          <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-2">
            {/* Desktop Menu */}
            <div className="hidden sm:flex flex-col gap-1">
              <a href="#linkscore" className="px-3 py-2 text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-md transition-colors">
                📊 LinkScore
              </a>
              <a href="#authority-links" className="px-3 py-2 text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-md transition-colors">
                🔗 Authority Links
              </a>
              <a href="#competitors" className="px-3 py-2 text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-md transition-colors">
                🏆 Competitors
              </a>
              <a href="#resources" className="px-3 py-2 text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-md transition-colors">
                🎧 Resources
              </a>
              <a href="#audit" className="px-3 py-2 text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-md transition-colors">
                🔍 Audit
              </a>
              {/* Share Button with Dropdown */}
              <div className="relative">
                <button 
                  onClick={() => {
                    const dropdown = document.getElementById('share-dropdown');
                    dropdown?.classList.toggle('hidden');
                  }}
                  className="w-full px-3 py-2 text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-md transition-colors text-left"
                >
                  📋 Share Results
                </button>
                <div id="share-dropdown" className="hidden absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 p-3 min-w-[300px]">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">Share Your Results</h4>
                  <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-2 border border-gray-200">
                    <input
                      type="text"
                      value={typeof window !== 'undefined' ? window.location.href : ''}
                      readOnly
                      className="flex-1 bg-transparent text-xs text-gray-700 border-none outline-none font-mono"
                      placeholder="Loading URL..."
                    />
                    <button
                      onClick={copyToClipboard}
                      className={`flex-shrink-0 px-3 py-1 rounded-md font-medium text-xs transition-all duration-200 ${
                        copySuccess
                          ? 'bg-green-100 text-green-700 border border-green-200'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                      disabled={copySuccess}
                    >
                      {copySuccess ? (
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Copied!
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Copy
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Mobile Menu Button */}
            <div className="sm:hidden">
              <button 
                onClick={() => {
                  const menu = document.getElementById('mobile-nav-menu');
                  menu?.classList.toggle('hidden');
                }}
                className="p-2 text-gray-700 hover:bg-blue-50 rounded-md"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div id="mobile-nav-menu" className="hidden absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 min-w-[200px]">
                <a href="#linkscore" className="block px-3 py-2 text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-600">
                  📊 LinkScore
                </a>
                <a href="#authority-links" className="block px-3 py-2 text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-600">
                  🔗 Authority Links
                </a>
                <a href="#competitors" className="block px-3 py-2 text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-600">
                  🏆 Competitors
                </a>
                <a href="#resources" className="block px-3 py-2 text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-600">
                  🎧 Resources
                </a>
                <a href="#audit" className="block px-3 py-2 text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-600">
                  🔍 Audit
                </a>
                {/* Mobile Share Section */}
                <div className="border-t border-gray-200 p-3">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">📋 Share Results</h4>
                  <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-2 border border-gray-200">
                    <input
                      type="text"
                      value={typeof window !== 'undefined' ? window.location.href : ''}
                      readOnly
                      className="flex-1 bg-transparent text-xs text-gray-700 border-none outline-none font-mono"
                      placeholder="Loading URL..."
                    />
                    <button
                      onClick={copyToClipboard}
                      className={`flex-shrink-0 px-2 py-1 rounded text-xs font-medium transition-all duration-200 ${
                        copySuccess
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                      disabled={copySuccess}
                    >
                      {copySuccess ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Video Explainer - Moved to Top */}
        <section className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 mb-8">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">How to Interpret Your Results</h2>
            <p className="text-gray-600">Watch this quick explainer to understand your comprehensive LinkScore analysis</p>
          </div>
          <div className="flex justify-center">
            <div className="w-full max-w-2xl">
              <div className="aspect-video rounded-lg overflow-hidden shadow-lg">
                <iframe
                  width="100%"
                  height="100%"
                  src="https://www.youtube.com/embed/dQw4w9WgXcQ"
                  title="How to Interpret Your LinkScore Results"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="w-full h-full"
                ></iframe>
              </div>
            </div>
          </div>
        </section>

        {/* Comprehensive LinkScore Analysis */}
        <section id="linkscore" className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          {/* Critical Alert for Low Scores */}
          {parseFloat(analysis.linkScore.overall) < 40 && (
            <div className="mb-8 p-6 bg-red-50 border-l-4 border-red-500 rounded-r-xl">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-lg font-bold">⚠</span>
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-red-800 mb-2">CRITICAL: Immediate Action Required</h3>
                  <p className="text-red-700">
                    Your LinkScore indicates severe SEO performance issues that require immediate intervention. 
                    This level of underperformance suggests fundamental problems with your current strategy.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Left Column - Comprehensive Score Display */}
            <div>
              {/* Main Score Display */}
              <div className="text-center lg:text-left mb-8">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Your Overall LinkScore</h2>
                  <p className="text-gray-600 text-lg mb-4">
                    Professional SEO performance analysis based on 5 key metrics
                  </p>
                </div>
                
                <div className={`w-full max-w-sm mx-auto lg:mx-0 rounded-2xl border-4 p-8 text-center mb-6 ${getScoreColor(analysis.linkScore.overall)}`}>
                  <div className="mb-4">
                    <span className="text-6xl font-bold">{analysis.linkScore.overall}</span>
                    <span className="text-2xl font-semibold text-gray-600">/100</span>
                  </div>
                  <div className="mb-3">
                    <span className="text-2xl font-bold">{getScoreGrade(analysis.linkScore.overall)}</span>
                  </div>
                  <div className="text-lg font-semibold">
                    {getScoreLabel(analysis.linkScore.overall)}
                  </div>
                </div>


              </div>

              {/* Score Interpretation */}
              <div className="bg-gray-50 rounded-xl p-6 mb-6">
                <h4 className="font-semibold text-gray-900 mb-3">What This Score Means</h4>
                <p className="text-gray-700 text-sm leading-relaxed mb-4">
                  {parseFloat(analysis.linkScore.overall) >= 80 ? 
                    "Outstanding performance! You're outperforming most competitors with excellent ROI on your SEO investment." :
                  parseFloat(analysis.linkScore.overall) >= 60 ?
                    "Solid performance with room for improvement. Your SEO is working but could be optimized for better results." :
                  parseFloat(analysis.linkScore.overall) >= 40 ?
                    "Below average performance indicates significant issues with your current SEO strategy that need addressing." :
                    "Critical performance failure. Your SEO investment is not delivering results and requires immediate strategic overhaul."
                  }
                </p>
                
                {/* Score Range Reference */}
                <div className="text-xs text-gray-600 border-t border-gray-200 pt-3">
                  <strong>LinkScore Ranges:</strong>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>90-100: Exceptional (A+)</div>
                    <div>80-89: Excellent (A)</div>
                    <div>70-79: Good (B)</div>
                    <div>60-69: Average (C)</div>
                    <div>50-59: Below Average (D)</div>
                    <div>40-49: Poor (D-)</div>
                    <div>30-39: Critical (F+)</div>
                    <div>1-29: Failure (F)</div>
                  </div>
                </div>
              </div>

              {/* Key Campaign Stats */}
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <h4 className="font-semibold text-gray-900 mb-2">Campaign Summary</h4>
                <p className="text-gray-600 text-sm mb-4">
                  Based on {analysis.campaign.investmentMonths} months with ${analysis.campaign.totalInvestment.toLocaleString()} invested
                </p>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Links Gained:</span>
                    <span className="font-semibold">{analysis.metrics.authorityLinksGained} of {analysis.metrics.expectedLinks} expected</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Performance:</span>
                    <span className="font-semibold">
                      {analysis.metrics.expectedLinks > 0 ? Math.round((analysis.metrics.authorityLinksGained / analysis.metrics.expectedLinks) * 100) : 0}% of target
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Authority Link Cost:</span>
                    <span className="font-semibold">
                      {analysis.metrics.authorityLinksGained > 0 
                        ? `$${Math.round(analysis.campaign.totalInvestment / analysis.metrics.authorityLinksGained).toLocaleString()}`
                        : 'N/A'} per link
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Current Position:</span>
                    <span className="font-semibold">{analysis.metrics.currentAuthorityLinks} authority links</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">vs Competitors:</span>
                    <span className="font-semibold">{analysis.competitive.competitorAverageLinks} average</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Component Breakdown */}
            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-6">5 Component Analysis</h3>
              
                             {/* Component Bars with Detailed Explanations */}
               <div className="space-y-6">
                 {/* Competitive Position */}
                 <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                   <div className="flex justify-between items-start mb-3">
                     <div className="flex-1">
                       <h4 className="font-semibold text-gray-900 mb-1">Current Competitive Position</h4>
                       <p className="text-sm text-gray-700 mb-2">
                         <strong>What it measures:</strong> How many authority links you have compared to your direct competitors
                       </p>
                     </div>
                     <span className="text-lg font-bold text-blue-600 ml-4">{analysis.linkScore.breakdown.competitivePosition}/30</span>
                   </div>
                   <div className="w-full bg-gray-200 rounded-full h-4 mb-3">
                     <div 
                       className="bg-blue-500 h-4 rounded-full transition-all duration-500 flex items-center justify-end pr-2" 
                       style={{ width: `${(analysis.linkScore.breakdown.competitivePosition / 30) * 100}%` }}
                     >
                       <span className="text-xs text-white font-medium">
                         {Math.round((analysis.linkScore.breakdown.competitivePosition / 30) * 100)}%
                       </span>
                     </div>
                   </div>
                   <div className="grid grid-cols-2 gap-4 text-xs">
                     <div className="bg-green-50 p-2 rounded border-l-2 border-green-400">
                       <strong className="text-green-700">Good (25-30 pts):</strong>
                       <div className="text-green-600">80%+ of competitor average. You're a market leader with strong authority.</div>
                     </div>
                     <div className="bg-red-50 p-2 rounded border-l-2 border-red-400">
                       <strong className="text-red-700">Poor (1-15 pts):</strong>
                       <div className="text-red-600">Below 60% of competitors. Significant authority gap holding you back.</div>
                     </div>
                   </div>
                 </div>
 
                 {/* Performance vs Expected */}
                 <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                   <div className="flex justify-between items-start mb-3">
                     <div className="flex-1">
                       <h4 className="font-semibold text-gray-900 mb-1">Performance vs Expected ROI</h4>
                       <p className="text-sm text-gray-700 mb-2">
                         <strong>What it measures:</strong> Actual authority links gained vs expected based on your investment level
                       </p>
                     </div>
                     <span className="text-lg font-bold text-green-600 ml-4">{analysis.linkScore.breakdown.performanceVsExpected}/25</span>
                   </div>
                   <div className="w-full bg-gray-200 rounded-full h-4 mb-3">
                     <div 
                       className="bg-green-500 h-4 rounded-full transition-all duration-500 flex items-center justify-end pr-2" 
                       style={{ width: `${(analysis.linkScore.breakdown.performanceVsExpected / 25) * 100}%` }}
                     >
                       <span className="text-xs text-white font-medium">
                         {Math.round((analysis.linkScore.breakdown.performanceVsExpected / 25) * 100)}%
                       </span>
                     </div>
                   </div>
                   <div className="grid grid-cols-2 gap-4 text-xs">
                     <div className="bg-green-50 p-2 rounded border-l-2 border-green-400">
                       <strong className="text-green-700">Good (20-25 pts):</strong>
                       <div className="text-green-600">80%+ of expected links. Excellent ROI on your SEO investment.</div>
                     </div>
                     <div className="bg-red-50 p-2 rounded border-l-2 border-red-400">
                       <strong className="text-red-700">Poor (1-10 pts):</strong>
                       <div className="text-red-600">Below 40% of expected. Poor ROI - strategy review needed.</div>
                     </div>
                   </div>
                 </div>
 
                 {/* Competitive Velocity */}
                 <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                   <div className="flex justify-between items-start mb-3">
                     <div className="flex-1">
                       <h4 className="font-semibold text-gray-900 mb-1">Competitive Link Building Speed</h4>
                       <p className="text-sm text-gray-700 mb-2">
                         <strong>What it measures:</strong> How fast you gain authority links compared to competitor pace
                       </p>
                     </div>
                     <span className="text-lg font-bold text-purple-600 ml-4">{analysis.linkScore.breakdown.velocityComparison}/20</span>
                   </div>
                   <div className="w-full bg-gray-200 rounded-full h-4 mb-3">
                     <div 
                       className="bg-purple-500 h-4 rounded-full transition-all duration-500 flex items-center justify-end pr-2" 
                       style={{ width: `${(analysis.linkScore.breakdown.velocityComparison / 20) * 100}%` }}
                     >
                       <span className="text-xs text-white font-medium">
                         {Math.round((analysis.linkScore.breakdown.velocityComparison / 20) * 100)}%
                       </span>
                     </div>
                   </div>
                   <div className="grid grid-cols-2 gap-4 text-xs">
                     <div className="bg-green-50 p-2 rounded border-l-2 border-green-400">
                       <strong className="text-green-700">Good (15-20 pts):</strong>
                       <div className="text-green-600">80%+ of competitor speed. You're keeping pace or outpacing rivals.</div>
                     </div>
                     <div className="bg-red-50 p-2 rounded border-l-2 border-red-400">
                       <strong className="text-red-700">Poor (1-8 pts):</strong>
                       <div className="text-red-600">Below 40% of competitor speed. They're pulling ahead fast.</div>
                     </div>
                   </div>
                 </div>
 
                 {/* Market Share Growth */}
                 <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                   <div className="flex justify-between items-start mb-3">
                     <div className="flex-1">
                       <h4 className="font-semibold text-gray-900 mb-1">Market Share Movement</h4>
                       <p className="text-sm text-gray-700 mb-2">
                         <strong>What it measures:</strong> Whether you're gaining/losing market share vs the total competitive landscape
                       </p>
                     </div>
                     <span className="text-lg font-bold text-orange-600 ml-4">{analysis.linkScore.breakdown.marketShareGrowth}/15</span>
                   </div>
                   <div className="w-full bg-gray-200 rounded-full h-4 mb-3">
                     <div 
                       className="bg-orange-500 h-4 rounded-full transition-all duration-500 flex items-center justify-end pr-2" 
                       style={{ width: `${(analysis.linkScore.breakdown.marketShareGrowth / 15) * 100}%` }}
                     >
                       <span className="text-xs text-white font-medium">
                         {Math.round((analysis.linkScore.breakdown.marketShareGrowth / 15) * 100)}%
                       </span>
                     </div>
                   </div>
                   <div className="grid grid-cols-2 gap-4 text-xs">
                     <div className="bg-green-50 p-2 rounded border-l-2 border-green-400">
                       <strong className="text-green-700">Good (11-15 pts):</strong>
                       <div className="text-green-600">Growing market share. You're winning the competitive race.</div>
                     </div>
                     <div className="bg-red-50 p-2 rounded border-l-2 border-red-400">
                       <strong className="text-red-700">Poor (1-5 pts):</strong>
                       <div className="text-red-600">Losing market share. Competitors are winning the authority game.</div>
                     </div>
                   </div>
                 </div>
 
                 {/* Cost Efficiency */}
                 <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                   <div className="flex justify-between items-start mb-3">
                     <div className="flex-1">
                       <h4 className="font-semibold text-gray-900 mb-1">Cost Efficiency vs Benchmarks</h4>
                       <p className="text-sm text-gray-700 mb-2">
                         <strong>What it measures:</strong> Cost per authority link vs industry benchmarks (~$667 per link)
                       </p>
                     </div>
                     <span className="text-lg font-bold text-teal-600 ml-4">{analysis.linkScore.breakdown.costEfficiency}/10</span>
                   </div>
                   <div className="w-full bg-gray-200 rounded-full h-4 mb-3">
                     <div 
                       className="bg-teal-500 h-4 rounded-full transition-all duration-500 flex items-center justify-end pr-2" 
                       style={{ width: `${(analysis.linkScore.breakdown.costEfficiency / 10) * 100}%` }}
                     >
                       <span className="text-xs text-white font-medium">
                         {Math.round((analysis.linkScore.breakdown.costEfficiency / 10) * 100)}%
                       </span>
                     </div>
                   </div>
                   <div className="grid grid-cols-2 gap-4 text-xs">
                     <div className="bg-green-50 p-2 rounded border-l-2 border-green-400">
                       <strong className="text-green-700">Good (8-10 pts):</strong>
                       <div className="text-green-600">At or below $667 per link. Excellent value for your investment.</div>
                     </div>
                     <div className="bg-red-50 p-2 rounded border-l-2 border-red-400">
                       <strong className="text-red-700">Poor (1-4 pts):</strong>
                       <div className="text-red-600">Above $1,000+ per link. Overpaying significantly for results.</div>
                     </div>
                   </div>
                 </div>
               </div>
            </div>
          </div>

          {/* Specific Recommendations Based on Lowest Components */}
          <div className="mt-8 pt-8 border-t border-gray-200">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">Priority Recommendations</h4>
            <div className="grid md:grid-cols-2 gap-6">
                             {/* Identify lowest scoring components and provide specific recommendations */}
               {analysis.linkScore.breakdown.performanceVsExpected < 15 && (
                 <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                   <h5 className="font-semibold text-red-800 mb-2">🎯 Improve ROI Performance</h5>
                   <p className="text-red-700 text-sm">
                     Your actual results ({analysis.metrics.authorityLinksGained} links) vs expected ({analysis.metrics.expectedLinks} links) 
                     show poor ROI. Focus on higher-quality link prospects and improve outreach conversion rates.
                   </p>
                 </div>
               )}
               
               {analysis.linkScore.breakdown.competitivePosition < 15 && (
                 <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                   <h5 className="font-semibold text-orange-800 mb-2">⚡ Close Competitive Gap</h5>
                   <p className="text-orange-700 text-sm">
                     You have {analysis.metrics.currentAuthorityLinks} authority links vs competitor average of {analysis.competitive.competitorAverageLinks}. 
                     Aggressive link building needed to catch up to market leaders.
                   </p>
                 </div>
               )}

              {analysis.metrics.linkGapsTotal > 50 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <h5 className="font-semibold text-blue-800 mb-2">🔍 Target Link Opportunities</h5>
                  <p className="text-blue-700 text-sm">
                    {analysis.metrics.linkGapsTotal} domains link to competitors but not you. 
                    Focus on competitor link gap analysis for quick wins.
                  </p>
                </div>
              )}

              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <h5 className="font-semibold text-green-800 mb-2">📈 Next Steps</h5>
                <p className="text-green-700 text-sm">
                  {parseFloat(analysis.linkScore.overall) < 40 ? 
                    "Comprehensive strategy review needed. Focus on quick wins, address current shortcomings, and evaluate all aspects of your approach." :
                  parseFloat(analysis.linkScore.overall) < 60 ?
                    "Optimize current processes and target high-impact opportunities." :
                    "Maintain momentum and expand to new keywords/markets."
                  }
                </p>
              </div>

              {/* Free SEO Audit Call-out */}
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-4 text-white shadow-lg">
                <h5 className="font-semibold mb-2 flex items-center gap-2">
                  <span className="text-xl">🎯</span>
                  Get Free Comprehensive SEO Audit
                </h5>
                <p className="text-blue-100 text-sm mb-3">
                  Let our SEO experts audit your entire strategy - links, content, technical SEO, and AI visibility. 
                  Get a detailed roadmap with projected ROI.
                </p>
                <a 
                  href="https://www.theseoshow.co/do-your-seo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-white text-blue-600 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Get Free Audit →
                </a>
              </div>
            </div>
          </div>


        </section>

        {/* Authority Links Performance */}
        <section id="authority-links" className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          <h3 className="text-2xl font-semibold text-gray-900 mb-6">Authority Links Campaign Performance</h3>
          
          <div className="grid md:grid-cols-4 gap-6">
            <div className="text-center p-6 bg-blue-50 rounded-xl">
              <div className="text-3xl font-bold text-blue-600 mb-2">
                {authorityLinksAtStart}
              </div>
              <div className="text-sm font-medium text-gray-600">
                Authority Links at Start
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {analysis.campaign.investmentMonths} months ago
              </div>
            </div>

            <div className="text-center p-6 bg-green-50 rounded-xl">
              <div className="text-3xl font-bold text-green-600 mb-2">
                {authorityLinksNow}
              </div>
              <div className="text-sm font-medium text-gray-600">
                Authority Links Now
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Current total
              </div>
            </div>

            <div className="text-center p-6 bg-purple-50 rounded-xl">
              <div className="text-3xl font-bold text-purple-600 mb-2">
                {expectedLinks}
              </div>
              <div className="text-sm font-medium text-gray-600">
                Expected Authority Links
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Based on investment
              </div>
            </div>

            <div className="text-center p-6 bg-orange-50 rounded-xl">
              <div className={`text-3xl font-bold mb-2 ${difference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {difference >= 0 ? '+' : ''}{difference}
              </div>
              <div className="text-sm font-medium text-gray-600">
                Links Gained
              </div>
              <div className="text-xs text-gray-500 mt-1">
                vs Expected: {expectedLinks}
              </div>
            </div>
          </div>

          {/* Authority Link Cost Row */}
          <div className="mt-6 grid md:grid-cols-3 gap-6">
            <div className="md:col-span-3">
              <div className={`text-center p-6 rounded-xl ${
                analysis.metrics.authorityLinksGained > 0 
                  ? (analysis.campaign.totalInvestment / analysis.metrics.authorityLinksGained) <= 667 
                    ? 'bg-green-50' 
                    : (analysis.campaign.totalInvestment / analysis.metrics.authorityLinksGained) <= 1000 
                      ? 'bg-yellow-50' 
                      : 'bg-red-50'
                  : 'bg-gray-50'
              }`}>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <div>
                    <div className={`text-3xl font-bold mb-2 ${
                      analysis.metrics.authorityLinksGained > 0 
                        ? (analysis.campaign.totalInvestment / analysis.metrics.authorityLinksGained) <= 667 
                          ? 'text-green-600' 
                          : (analysis.campaign.totalInvestment / analysis.metrics.authorityLinksGained) <= 1000 
                            ? 'text-yellow-600' 
                            : 'text-red-600'
                        : 'text-gray-600'
                    }`}>
                      {analysis.metrics.authorityLinksGained > 0 
                        ? `$${Math.round(analysis.campaign.totalInvestment / analysis.metrics.authorityLinksGained).toLocaleString()}`
                        : 'N/A'}
                    </div>
                    <div className="text-sm font-medium text-gray-600">
                      Authority Link Cost
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Average price per link gained
                    </div>
                  </div>
                  
                  {analysis.metrics.authorityLinksGained > 0 && (
                    <div className="text-left text-sm">
                      <div className={`font-medium ${
                        (analysis.campaign.totalInvestment / analysis.metrics.authorityLinksGained) <= 667 
                          ? 'text-green-700' 
                          : (analysis.campaign.totalInvestment / analysis.metrics.authorityLinksGained) <= 1000 
                            ? 'text-yellow-700' 
                            : 'text-red-700'
                      }`}>
                        {(analysis.campaign.totalInvestment / analysis.metrics.authorityLinksGained) <= 667 
                          ? '✅ Excellent Value' 
                          : (analysis.campaign.totalInvestment / analysis.metrics.authorityLinksGained) <= 1000 
                            ? '⚠️ Average Value' 
                            : '❌ Poor Value'}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        Industry benchmark: ~$667 per link
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 p-6 bg-gray-50 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-gray-900">Campaign Summary</h4>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                difference >= expectedLinks ? 'bg-green-100 text-green-800' :
                difference >= expectedLinks * 0.7 ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}>
                {difference >= expectedLinks ? 'Exceeding Expectations' :
                 difference >= expectedLinks * 0.7 ? 'Meeting Expectations' :
                 'Below Expectations'}
              </span>
            </div>
            <p className="text-gray-600">
              Over {analysis.campaign.investmentMonths} months with ${analysis.campaign.monthlySpend.toLocaleString()}/month investment, 
              you've gained <strong>{difference} authority links</strong> vs the expected <strong>{expectedLinks} links</strong> 
              ({expectedLinks > 0 ? Math.round((difference / expectedLinks) * 100) : 0}% of target).
            </p>
          </div>

          {/* What is an Authority Link */}
          <div className="mt-8 p-6 bg-blue-50 border border-blue-200 rounded-xl">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">So what is an authority link?</h4>
            <p className="text-gray-700 mb-4">
              Not all links are created equal. We are analysing only authority links - quality domains that meet certain criteria. 
              These are the links that improve your rankings. Our authority link criteria are:
            </p>
            <ul className="space-y-2 text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span><strong>Domain Score of 20 or higher</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span><strong>Spam Score of 30% or lower</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span><strong>Domain traffic of 500 visits per month or more</strong></span>
              </li>
            </ul>
          </div>
        </section>

        {/* Competitors Table */}
        <section id="competitors" className="bg-white rounded-2xl shadow-lg p-4 sm:p-8 mb-8">
          <h3 className="text-2xl font-semibold text-gray-900 mb-6">Competitor Analysis</h3>
          
                     {/* Competitive Insights Callouts */}
           <div className="grid md:grid-cols-2 gap-6 mb-8">
             {(() => {
               // Calculate competitor averages
               const competitorStats = analysis.competitive.competitors
                 .map(competitor => analysis.historicalData?.[competitor])
                 .filter((comp): comp is NonNullable<typeof comp> => comp !== undefined);
               
               const avgCompetitorGain = competitorStats.length > 0 
                 ? Math.round(competitorStats.reduce((sum, comp) => sum + comp.gained, 0) / competitorStats.length)
                 : 0;
               
               const avgGapToYou = competitorStats.length > 0
                 ? Math.round(competitorStats.reduce((sum, comp) => sum + (comp.current - authorityLinksNow), 0) / competitorStats.length)
                 : 0;
              
              const linksNeededToCloseGap = Math.max(0, avgGapToYou);
              const costToCloseGap = linksNeededToCloseGap * 667; // Using the $667 per link from expected calculation
              
              return (
                <>
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-orange-600 mb-2">+{avgCompetitorGain}</div>
                      <div className="text-sm font-medium text-gray-600 mb-3">Average Links Gained by Competitors</div>
                      <div className="text-xs text-gray-500">
                        vs your +{difference} links gained
                      </div>
                    </div>
                  </div>

                  <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-red-600 mb-2">+{avgGapToYou}</div>
                      <div className="text-sm font-medium text-gray-600 mb-3">Average Gap to You</div>
                      <div className="text-xs text-gray-500">
                        links behind on average
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          
          
          {/* Mobile Card Layout */}
          <div className="block lg:hidden space-y-4">
            {/* Your Domain Card */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-4">
                <img 
                  src={`https://www.google.com/s2/favicons?domain=${analysis.user.domain}&sz=20`}
                  alt={`${analysis.user.domain} favicon`}
                  width="20"
                  height="20"
                  className="flex-shrink-0"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <span className="font-semibold text-blue-700 text-lg">{analysis.user.domain} (You)</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{authorityLinksAtStart}</div>
                  <div className="text-sm text-gray-600">Links at Start</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{authorityLinksNow}</div>
                  <div className="text-sm text-gray-600">Links Now</div>
                </div>
              </div>
              <div className="mt-4 text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 rounded-full">
                  <span className="text-blue-700 font-medium">+{difference} gained</span>
                </div>
              </div>
            </div>

            {/* Competitor Cards */}
            {analysis.competitive.competitors.map((competitor, index) => {
              const competitorData = analysis.historicalData?.[competitor];
              
              if (!competitorData) {
                return null;
              }
              
              const competitorLinksStart = competitorData.historical;
              const competitorLinksNow = competitorData.current;
              const competitorGain = competitorData.gained;
              const gapVsYou = competitorLinksNow - authorityLinksNow;
              
              return (
                <div key={index} className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3 mb-4">
                    <img 
                      src={`https://www.google.com/s2/favicons?domain=${competitor}&sz=20`}
                      alt={`${competitor} favicon`}
                      width="20"
                      height="20"
                      className="flex-shrink-0"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                    <span className="font-medium text-gray-900 text-lg">{competitor}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-700">{competitorLinksStart}</div>
                      <div className="text-sm text-gray-600">Links at Start</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-700">{competitorLinksNow}</div>
                      <div className="text-sm text-gray-600">Links Now</div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="text-center">
                      <div className="text-lg font-medium text-gray-700">+{competitorGain}</div>
                      <div className="text-xs text-gray-500">Their Gain</div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                      gapVsYou > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {gapVsYou > 0 ? `+${gapVsYou} ahead` : `${Math.abs(gapVsYou)} behind`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table Layout */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-4 px-4 font-semibold text-gray-900">Competitor</th>
                  <th className="text-center py-4 px-4 font-semibold text-gray-900">Links at Start</th>
                  <th className="text-center py-4 px-4 font-semibold text-gray-900">Links Now</th>
                  <th className="text-center py-4 px-4 font-semibold text-gray-900">Their Gain</th>
                  <th className="text-center py-4 px-4 font-semibold text-gray-900">Gap vs You</th>
                </tr>
              </thead>
              <tbody>
                {/* Your Domain Row */}
                <tr className="border-b bg-blue-50">
                  <td className="py-4 px-4 font-medium text-blue-700">
                    <div className="flex items-center gap-3">
                      <img 
                        src={`https://www.google.com/s2/favicons?domain=${analysis.user.domain}&sz=16`}
                        alt={`${analysis.user.domain} favicon`}
                        width="16"
                        height="16"
                        className="flex-shrink-0"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                      <span>{analysis.user.domain} (You)</span>
                    </div>
                  </td>
                  <td className="text-center py-4 px-4 font-medium text-blue-700">
                    {authorityLinksAtStart}
                  </td>
                  <td className="text-center py-4 px-4 font-medium text-blue-700">
                    {authorityLinksNow}
                  </td>
                  <td className="text-center py-4 px-4 font-medium text-blue-700">
                    +{difference}
                  </td>
                  <td className="text-center py-4 px-4 font-medium text-blue-700">
                    -
                  </td>
                </tr>
                
                {/* Competitor Rows */}
                {analysis.competitive.competitors.map((competitor, index) => {
                  const competitorData = analysis.historicalData?.[competitor];
                  
                  if (!competitorData) {
                    return null;
                  }
                  
                  const competitorLinksStart = competitorData.historical;
                  const competitorLinksNow = competitorData.current;
                  const competitorGain = competitorData.gained;
                  const gapVsYou = competitorLinksNow - authorityLinksNow;
                  
                  return (
                    <tr key={index} className="border-b hover:bg-gray-50">
                      <td className="py-4 px-4 text-gray-900">
                        <div className="flex items-center gap-3">
                          <img 
                            src={`https://www.google.com/s2/favicons?domain=${competitor}&sz=16`}
                            alt={`${competitor} favicon`}
                            width="16"
                            height="16"
                            className="flex-shrink-0"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                          <span>{competitor}</span>
                        </div>
                      </td>
                      <td className="text-center py-4 px-4 text-gray-700">
                        {competitorLinksStart}
                      </td>
                      <td className="text-center py-4 px-4 text-gray-700">
                        {competitorLinksNow}
                      </td>
                      <td className="text-center py-4 px-4 text-gray-700">
                        +{competitorGain}
                      </td>
                      <td className={`text-center py-4 px-4 font-medium ${
                        gapVsYou > 0 ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {gapVsYou > 0 ? `+${gapVsYou} ahead` : `${Math.abs(gapVsYou)} behind`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {/* Opportunity Cost Commentary */}
          {(() => {
            // Calculate performance ratio to determine styling
            const competitorStats = analysis.competitive.competitors
              .map(competitor => analysis.historicalData?.[competitor])
              .filter((comp): comp is NonNullable<typeof comp> => comp !== undefined);
            
            const avgCompetitorGain = competitorStats.length > 0 
              ? Math.round(competitorStats.reduce((sum, comp) => sum + comp.gained, 0) / competitorStats.length)
              : 0;
            
            const clientGain = analysis.metrics.authorityLinksGained;
            const performanceRatio = avgCompetitorGain > 0 ? clientGain / avgCompetitorGain : 0;
            
            let boxColorClass = 'bg-yellow-50 border-yellow-200'; // default
            
            if (performanceRatio >= 1.2) {
              boxColorClass = 'bg-green-50 border-green-200';
            } else if (performanceRatio >= 0.9) {
              boxColorClass = 'bg-blue-50 border-blue-200';
            } else if (performanceRatio >= 0.5) {
              boxColorClass = 'bg-yellow-50 border-yellow-200';
            } else {
              boxColorClass = 'bg-red-50 border-red-200';
            }
            
            return (
              <div className={`mt-6 ${boxColorClass} border rounded-xl p-6`}>
                <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                {(() => {
                  // Calculate performance ratio to determine icon
                  const competitorStats = analysis.competitive.competitors
                    .map(competitor => analysis.historicalData?.[competitor])
                    .filter((comp): comp is NonNullable<typeof comp> => comp !== undefined);
                  
                  const avgCompetitorGain = competitorStats.length > 0 
                    ? Math.round(competitorStats.reduce((sum, comp) => sum + comp.gained, 0) / competitorStats.length)
                    : 0;
                  
                  const clientGain = analysis.metrics.authorityLinksGained;
                  const performanceRatio = avgCompetitorGain > 0 ? clientGain / avgCompetitorGain : 0;
                  
                  if (performanceRatio >= 1.2) {
                    // Excellent performance - green
                    return (
                      <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm font-bold">✨</span>
                      </div>
                    );
                  } else if (performanceRatio >= 0.9) {
                    // Average performance - blue
                    return (
                      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm font-bold">💡</span>
                      </div>
                    );
                  } else if (performanceRatio >= 0.5) {
                    // Below average - yellow
                    return (
                      <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm font-bold">⚠️</span>
                      </div>
                    );
                  } else {
                    // Poor performance - red
                    return (
                      <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm font-bold">🚨</span>
                      </div>
                    );
                  }
                })()}
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-gray-900 mb-2">Opportunity Cost Analysis</h4>
                {(() => {
                  // Calculate average competitor gain
                  const competitorStats = analysis.competitive.competitors
                    .map(competitor => analysis.historicalData?.[competitor])
                    .filter((comp): comp is NonNullable<typeof comp> => comp !== undefined);
                  
                  const avgCompetitorGain = competitorStats.length > 0 
                    ? Math.round(competitorStats.reduce((sum, comp) => sum + comp.gained, 0) / competitorStats.length)
                    : 0;
                  
                  const clientGain = analysis.metrics.authorityLinksGained;
                  const expectedGain = analysis.metrics.expectedLinks;
                  const performanceRatio = clientGain / avgCompetitorGain;
                  
                  // Determine performance category
                  let performanceMessage = '';
                  let actionMessage = '';
                  
                  if (performanceRatio >= 1.2) {
                    // Client significantly outperformed competitors (20%+ better)
                    performanceMessage = `Excellent work! You gained ${clientGain} authority links from your ${analysis.campaign.durationRange} month investment of $${analysis.campaign.totalInvestment.toLocaleString()}, while your competitors averaged only ${avgCompetitorGain} links. You're outperforming the market by ${Math.round((performanceRatio - 1) * 100)}%.`;
                    
                    actionMessage = `Continue this momentum by investing in more advanced link building strategies to maintain your competitive edge. Your current approach is clearly working better than your competitors'.`;
                    
                  } else if (performanceRatio >= 0.9) {
                    // Client performed similarly to competitors (within 10%)
                    performanceMessage = `You gained ${clientGain} authority links from your ${analysis.campaign.durationRange} month investment of $${analysis.campaign.totalInvestment.toLocaleString()}, performing on par with your competitors who averaged ${avgCompetitorGain} links. This is typical market performance.`;
                    
                    actionMessage = `To gain a competitive advantage, you'll need to either increase your investment or improve your link building strategy. Consider targeting higher-quality opportunities that your competitors are missing.`;
                    
                  } else if (performanceRatio >= 0.5) {
                    // Client underperformed (10-50% worse)
                    performanceMessage = `Your competitors are accelerating their link acquisition. While you gained ${clientGain} authority links from your $${analysis.campaign.totalInvestment.toLocaleString()} investment, competitors averaged ${avgCompetitorGain} links - ${Math.round(((avgCompetitorGain / clientGain) - 1) * 100)}% more than your campaign achieved.`;
                    
                    actionMessage = `The competitive gap is widening. To reach market parity, you'll need approximately ${Math.max(0, Math.round(analysis.competitive.competitorAverageLinks - analysis.metrics.currentAuthorityLinks))} additional authority links. Consider reviewing your investment level or the volume of output from your current investment to match competitor velocity.`;
                    
                  } else {
                    // Client severely underperformed (50%+ worse)
                    performanceMessage = `Your competitors are significantly outpacing your link acquisition. You gained ${clientGain} authority links from your $${analysis.campaign.totalInvestment.toLocaleString()} investment, while competitors averaged ${avgCompetitorGain} links. This ${Math.round(((avgCompetitorGain / clientGain) - 1) * 100)}% difference shows the competitive gap is expanding rapidly.`;
                    
                    actionMessage = `The widening gap requires strategic review. Your competitors are building authority ${Math.round(avgCompetitorGain / clientGain)}x faster. To reach competitive parity, you need approximately ${Math.max(0, Math.round(analysis.competitive.competitorAverageLinks - analysis.metrics.currentAuthorityLinks))} additional authority links. Consider whether your current investment level aligns with your competitive goals, or if the volume and quality of output needs optimization.`;
                  }
                  
                  // Special case: If client gained 0 links
                  if (clientGain === 0 && avgCompetitorGain > 0) {
                    performanceMessage = `Your link building has stalled while competitors continue advancing. Despite investing $${analysis.campaign.totalInvestment.toLocaleString()} over ${analysis.campaign.durationRange} months, you gained no authority links, while competitors averaged ${avgCompetitorGain} links during the same period.`;
                    
                    actionMessage = `This complete lack of progress needs immediate attention. The competitive gap has grown by ${avgCompetitorGain} links while your authority remained static. A comprehensive review of your link building strategy, investment allocation, and execution quality is essential to restart growth.`;
                  }
                  
                  return (
                    <>
                      <p className="text-gray-700 text-sm mb-4">{performanceMessage}</p>
                      <p className="text-gray-700 text-sm font-medium">{actionMessage}</p>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
            );
          })()}
        </section>

        {/* Free Resources & Education */}
        <section id="resources" className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          <div className="text-center mb-8">
            <h3 className="text-2xl font-semibold text-gray-900 mb-4">🎧 Free SEO Education Resources</h3>
            <p className="text-gray-600 max-w-3xl mx-auto">
              Wondering why authority links matter? What makes a good link? How to tell if your agency is delivering results? 
              We've covered all these topics in-depth on <strong>The SEO Show</strong> - Australia's #1 SEO podcast. 
              Here are our most relevant episodes to help you understand and improve your link building strategy.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Fundamentals */}
            <div className="space-y-4">
              <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                📚 SEO Fundamentals
              </h4>
              
              <a 
                href="https://www.theseoshow.co/episode/002" 
                target="_blank" 
                rel="noopener noreferrer"
                className="block p-4 bg-blue-50 hover:bg-blue-100 rounded-xl border border-blue-200 transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    🎧
                  </div>
                  <div className="flex-1">
                    <h5 className="font-semibold text-blue-900 group-hover:text-blue-700 mb-1">
                      How Google Works & The 4 Pillars of SEO
                    </h5>
                    <p className="text-sm text-blue-700">
                      Essential foundation - understand why links are one of Google's core ranking factors
                    </p>
                  </div>
                </div>
              </a>

              <a 
                href="https://www.theseoshow.co/episode/006" 
                target="_blank" 
                rel="noopener noreferrer"
                className="block p-4 bg-green-50 hover:bg-green-100 rounded-xl border border-green-200 transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    🎧
                  </div>
                  <div className="flex-1">
                    <h5 className="font-semibold text-green-900 group-hover:text-green-700 mb-1">
                      The Authority Pillar - Links & Linkbuilding
                    </h5>
                    <p className="text-sm text-green-700">
                      Deep dive into why authority links are crucial for SEO success
                    </p>
                  </div>
                </div>
              </a>
            </div>

            {/* Link Quality & Strategy */}
            <div className="space-y-4">
              <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                🔗 Link Quality & Strategy
              </h4>
              
              <a 
                href="https://www.theseoshow.co/episode/044" 
                target="_blank" 
                rel="noopener noreferrer"
                className="block p-4 bg-purple-50 hover:bg-purple-100 rounded-xl border border-purple-200 transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    🎧
                  </div>
                  <div className="flex-1">
                    <h5 className="font-semibold text-purple-900 group-hover:text-purple-700 mb-1">
                      What Makes A Good Link?
                    </h5>
                    <p className="text-sm text-purple-700">
                      Learn our authority link criteria and how to identify high-quality opportunities
                    </p>
                  </div>
                </div>
              </a>

              <a 
                href="https://www.theseoshow.co/episode/079" 
                target="_blank" 
                rel="noopener noreferrer"
                className="block p-4 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    🎧
                  </div>
                  <div className="flex-1">
                    <h5 className="font-semibold text-red-900 group-hover:text-red-700 mb-1">
                      Link Building Mistakes
                    </h5>
                    <p className="text-sm text-red-700">
                      Avoid common pitfalls that waste budget and hurt your rankings
                    </p>
                  </div>
                </div>
              </a>

              <a 
                href="https://www.theseoshow.co/episode/026" 
                target="_blank" 
                rel="noopener noreferrer"
                className="block p-4 bg-orange-50 hover:bg-orange-100 rounded-xl border border-orange-200 transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    🎧
                  </div>
                  <div className="flex-1">
                    <h5 className="font-semibold text-orange-900 group-hover:text-orange-700 mb-1">
                      Should You Pay For Backlinks?
                    </h5>
                    <p className="text-sm text-orange-700">
                      The truth about paid links and legitimate link building investment
                    </p>
                  </div>
                </div>
              </a>
            </div>

            {/* Agency Management */}
            <div className="space-y-4 md:col-span-2">
              <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                🏢 Working with SEO Agencies
              </h4>
              
              <div className="grid md:grid-cols-2 gap-4">
                <a 
                  href="https://www.theseoshow.co/episode/057" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="block p-4 bg-teal-50 hover:bg-teal-100 rounded-xl border border-teal-200 transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-1">
                      🎧
                    </div>
                    <div className="flex-1">
                      <h5 className="font-semibold text-teal-900 group-hover:text-teal-700 mb-1">
                        Should You Use An Agency For Linkbuilding?
                      </h5>
                      <p className="text-sm text-teal-700">
                        When to hire specialists vs doing it in-house
                      </p>
                    </div>
                  </div>
                </a>

                <a 
                  href="https://www.theseoshow.co/episode/108" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="block p-4 bg-indigo-50 hover:bg-indigo-100 rounded-xl border border-indigo-200 transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-1">
                      🎧
                    </div>
                    <div className="flex-1">
                      <h5 className="font-semibold text-indigo-900 group-hover:text-indigo-700 mb-1">
                        How To Keep Your SEO Agency Honest
                      </h5>
                      <p className="text-sm text-indigo-700">
                        Essential questions to ask and red flags to watch for
                      </p>
                    </div>
                  </div>
                </a>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-200 text-center">
            <p className="text-gray-600 mb-4">
              Want more SEO insights? Subscribe to <strong>The SEO Show</strong> for weekly episodes covering all aspects of search engine optimization.
            </p>
            <a 
              href="https://www.theseoshow.co" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              🎧 Visit The SEO Show
            </a>
          </div>
        </section>

        {/* CTA Section */}
        <section id="audit" className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl shadow-lg p-6 sm:p-8 text-white">
          <div className="flex flex-col lg:flex-row items-center gap-6 lg:gap-8">
            {/* Left side - Image */}
            <div className="flex-shrink-0">
              <img 
                src="/seo-show-hosts.png" 
                alt="Michael and Arthur from The SEO Show" 
                className="w-32 h-32 sm:w-40 sm:h-40 lg:w-48 lg:h-48 rounded-2xl object-cover shadow-lg"
              />
            </div>
            
            {/* Right side - Content */}
            <div className="flex-1 text-center lg:text-left">
              <h3 className="text-2xl sm:text-3xl font-bold mb-4">
                Ready to Fix Your SEO Strategy?
              </h3>
              <p className="text-blue-100 mb-6 text-lg leading-relaxed">
                Get a <strong>free comprehensive SEO audit</strong> from Michael and Arthur, the guys behind Australia's top SEO podcast. 
                We'll deeply audit your links, content, AI visibility and more - then show you exactly how to improve with projected ROI.
              </p>
                             <div className="flex justify-center lg:justify-start">
                 <a 
                   href="https://www.theseoshow.co/do-your-seo"
                   target="_blank"
                   rel="noopener noreferrer"
                   className="bg-white text-blue-600 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 transition-colors inline-block text-center"
                 >
                   Get Free SEO Audit
                 </a>
               </div>
              <p className="text-blue-200 text-sm mt-4 italic">
                From the team behind The SEO Show - Australia's #1 SEO podcast
              </p>
                         </div>
           </div>
         </section>

         {/* Analysis Details */}
         <section className="bg-white rounded-2xl shadow-lg p-6 mb-8 mt-8">
           <h3 className="text-xl font-semibold text-gray-900 mb-4">Analysis Details</h3>
           <div className="grid md:grid-cols-2 gap-4 text-sm">
             <div className="flex justify-between">
               <span className="text-gray-600">Processing Time:</span>
               <span className="font-medium">{analysis.processingTime}s</span>
             </div>
             <div className="flex justify-between">
               <span className="text-gray-600">Campaign Duration:</span>
               <span className="font-medium">{analysis.campaign.investmentMonths} months</span>
             </div>
             <div className="flex justify-between">
               <span className="text-gray-600">Monthly Investment:</span>
               <span className="font-medium">${analysis.campaign.monthlySpend.toLocaleString()}</span>
             </div>
             <div className="flex justify-between">
               <span className="text-gray-600">Total Investment:</span>
               <span className="font-medium">${analysis.campaign.totalInvestment.toLocaleString()}</span>
             </div>
             <div className="flex justify-between">
               <span className="text-gray-600">Location:</span>
               <span className="font-medium capitalize">{analysis.user.location}</span>
             </div>
             <div className="flex justify-between">
               <span className="text-gray-600">Analysis ID:</span>
               <span className="font-mono text-xs">{analysis.analysisId}</span>
             </div>
           </div>
         </section>
       </div>
     </main>
   );
 } 