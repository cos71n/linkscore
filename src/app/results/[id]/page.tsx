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
    performance: string;
    competitive: string;
    opportunity: string;
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
    if (score >= 8) return 'text-green-600 bg-green-100';
    if (score >= 6) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getScoreLabel = (scoreStr: string) => {
    const score = parseFloat(scoreStr);
    if (score >= 8) return 'Excellent';
    if (score >= 6) return 'Good';
    if (score >= 4) return 'Fair';
    return 'Needs Improvement';
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

        {/* Main LinkScore */}
        <section className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            {/* Left Column - Score */}
            <div className="text-center lg:text-left">
              <div className={`w-32 h-32 rounded-full flex items-center justify-center mx-auto lg:mx-0 mb-6 ${getScoreColor(analysis.linkScore.overall)}`}>
                <span className="text-3xl font-bold">{analysis.linkScore.overall}</span>
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                Your LinkScore: {getScoreLabel(analysis.linkScore.overall)}
              </h2>
              <p className="text-gray-600">
                Your SEO link building performance over {analysis.campaign.investmentMonths} months with ${analysis.campaign.totalInvestment.toLocaleString()} invested.
              </p>
            </div>

            {/* Right Column - Video */}
            <div className="flex justify-center lg:justify-end">
              <div className="w-full max-w-md">
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
                <p className="text-sm text-gray-500 text-center mt-2">
                  How to interpret your results
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Authority Links Performance */}
        <section className="bg-white rounded-2xl shadow-lg p-8 mb-8">
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
                <span><strong>Domain traffic of 750 visits per month or more</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span><strong>Traffic coming from AU/US/UK/NZ/CA markets</strong></span>
              </li>
            </ul>
          </div>
        </section>

        {/* Competitors Table */}
        <section className="bg-white rounded-2xl shadow-lg p-4 sm:p-8 mb-8">
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
                        {gapVsYou > 0 ? `+${gapVsYou}` : gapVsYou} ahead
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {/* Opportunity Cost Commentary */}
          <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-bold">⚠</span>
                </div>
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-gray-900 mb-2">Opportunity Cost Analysis</h4>
                <p className="text-gray-700 text-sm mb-4">
                  While you expected to gain {analysis.metrics.expectedLinks} authority links from your ${analysis.campaign.totalInvestment.toLocaleString()} investment, 
                  your competitors have been more successful. They've gained an average of{' '}
                  {(() => {
                    const competitorStats = analysis.competitive.competitors
                      .map(competitor => analysis.historicalData?.[competitor])
                      .filter((comp): comp is NonNullable<typeof comp> => comp !== undefined);
                    return competitorStats.length > 0 
                      ? Math.round(competitorStats.reduce((sum, comp) => sum + comp.gained, 0) / competitorStats.length)
                      : 0;
                  })()} links each - more in line with typical SEO investment returns.
                </p>
                <p className="text-gray-700 text-sm font-medium">
                  Over a 12-month SEO campaign, you need to acquire approximately{' '}
                  {(() => {
                    const competitorStats = analysis.competitive.competitors
                      .map(competitor => analysis.historicalData?.[competitor])
                      .filter((comp): comp is NonNullable<typeof comp> => comp !== undefined);
                    const avgGapToYou = competitorStats.length > 0
                      ? Math.round(competitorStats.reduce((sum, comp) => sum + (comp.current - authorityLinksNow), 0) / competitorStats.length)
                      : 0;
                    return Math.max(0, avgGapToYou);
                  })()} authority links to close the competitive gap.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Red Flags Section */}
        {analysis.redFlags && analysis.redFlags.length > 0 && (
          <section className="bg-white rounded-2xl shadow-lg p-8 mb-8">
            <h3 className="text-2xl font-semibold text-gray-900 mb-6">⚠️ Issues Identified</h3>
            <div className="space-y-4">
              {analysis.redFlags.map((flag, index) => (
                <div key={index} className={`p-6 rounded-xl border-l-4 ${
                  flag.severity === 'CRITICAL' ? 'border-red-500 bg-red-50' :
                  flag.severity === 'HIGH' ? 'border-orange-500 bg-orange-50' :
                  'border-yellow-500 bg-yellow-50'
                }`}>
                  <div className="font-semibold text-gray-900 mb-2">{flag.impact}</div>
                  <div className="text-gray-700 mb-3">{flag.message}</div>
                  <div className="text-sm font-medium text-blue-600">{flag.recommendation}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* CTA Section */}
        <section className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl shadow-lg p-6 sm:p-8 text-white">
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