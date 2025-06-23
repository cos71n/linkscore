import { NextRequest, NextResponse } from 'next/server';
import { AnalysisEngine } from '@/lib/analysis-engine';
import { LinkScoreCalculator } from '@/lib/link-score';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log('🔍 Results API called');
    const { id: analysisId } = await params;
    console.log('📋 Analysis ID:', analysisId);
    
    if (!analysisId) {
      return NextResponse.json(
        { error: 'Analysis ID is required' },
        { status: 400 }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(analysisId)) {
      return NextResponse.json(
        { error: 'Invalid analysis ID format' },
        { status: 400 }
      );
    }

    console.log('🔧 Initializing engines...');
    const analysisEngine = new AnalysisEngine();
    const calculator = new LinkScoreCalculator();
    
    console.log('📊 Fetching analysis from database...');
    const analysis = await analysisEngine.getAnalysis(analysisId);
    console.log('✅ Analysis retrieved:', { 
      id: analysis.id, 
      status: analysis.status, 
      linkScore: analysis.linkScore 
    });
    
    // Check if analysis is completed
    if (analysis.status !== 'completed') {
      return NextResponse.json(
        { 
          error: 'Analysis not completed',
          status: analysis.status,
          message: analysis.status === 'processing' 
            ? 'Analysis is still in progress'
            : 'Analysis failed or was cancelled'
        },
        { status: 202 } // Accepted but not ready
      );
    }

    // Calculate actual market share growth using competitor historical data
    const calculateMarketShareGrowth = () => {
      try {
        console.log('📈 Calculating market share growth...');
        const historicalData = analysis.historicalData || {};
        const competitors = analysis.competitors || [];
        
        if (competitors.length === 0) return 8; // Neutral if no competitors
      
      // Client data (with null safety)
      const currentLinks = analysis.currentAuthorityLinks || 0;
      const linksGained = analysis.authorityLinksGained || 0;
      const clientStart = currentLinks - linksGained;
      const clientNow = currentLinks;
      
      // Calculate total market at start and now
      let totalLinksStart = clientStart;
      let totalLinksNow = clientNow;
      
             competitors.forEach((competitor: string) => {
         const compData = historicalData[competitor];
         if (compData) {
           totalLinksStart += compData.historical;
           totalLinksNow += compData.current;
         }
       });
      
      if (totalLinksStart === 0 || totalLinksNow === 0) return 8;
      
      // Calculate market share change
      const marketShareStart = clientStart / totalLinksStart;
      const marketShareNow = clientNow / totalLinksNow;
      const marketShareChange = marketShareNow - marketShareStart;
      
      console.log(`📊 MARKET SHARE CALCULATION:`);
      console.log(`  Client Start: ${clientStart}, Now: ${clientNow}`);
      console.log(`  Market Start: ${totalLinksStart}, Now: ${totalLinksNow}`);
      console.log(`  Share Start: ${(marketShareStart * 100).toFixed(2)}%, Now: ${(marketShareNow * 100).toFixed(2)}%`);
      console.log(`  Change: ${(marketShareChange * 100).toFixed(2)}%`);
      
      // Scoring based on market share change
      if (marketShareChange >= 0.02) return 15;    // Gained 2%+ market share
      if (marketShareChange >= 0.01) return 13;    // Gained 1-2% market share
      if (marketShareChange >= 0.005) return 11;   // Gained 0.5-1% market share
      if (marketShareChange >= 0) return 8;        // Maintained market share
      if (marketShareChange >= -0.005) return 5;   // Lost <0.5% market share
      if (marketShareChange >= -0.01) return 3;    // Lost 0.5-1% market share
      return 1;                                    // Lost >1% market share
      } catch (error) {
        console.error('❌ Error calculating market share growth:', error);
        return 8; // Default neutral score
      }
    };

    // Calculate actual cost efficiency
    const calculateCostEfficiency = () => {
      try {
        console.log('💰 Calculating cost efficiency...');
        const expectedCostPerLink = (analysis.monthlySpend / 1000) * 667; // $667 per $1k spend baseline
        const actualCostPerLink = analysis.costPerAuthorityLink;
      
      // Handle null or undefined values properly
      if (!actualCostPerLink || actualCostPerLink === 0 || expectedCostPerLink === 0) {
        console.log('⚠️ Cost per link data unavailable, returning default score');
        return 5;
      }
      
      const efficiencyRatio = expectedCostPerLink / actualCostPerLink;
      
      console.log(`💰 COST EFFICIENCY CALCULATION:`);
      console.log(`  Expected: $${expectedCostPerLink.toFixed(0)} per link`);
      console.log(`  Actual: $${actualCostPerLink.toFixed(0)} per link`);
      console.log(`  Efficiency Ratio: ${efficiencyRatio.toFixed(2)}`);
      
      if (efficiencyRatio >= 1.5) return 10;      // 50%+ better than expected
      if (efficiencyRatio >= 1.2) return 9;       // 20-49% better than expected
      if (efficiencyRatio >= 1.0) return 8;       // Meeting expected efficiency
      if (efficiencyRatio >= 0.8) return 6;       // 20% worse than expected
      if (efficiencyRatio >= 0.6) return 4;       // 40% worse than expected
      if (efficiencyRatio >= 0.4) return 2;       // 60% worse than expected
      return 1;                                   // >60% worse than expected
      } catch (error) {
        console.error('❌ Error calculating cost efficiency:', error);
        return 5; // Default middle score
      }
    };

    // Prepare comprehensive results response with new 100-point scale and detailed breakdown
    console.log('🔧 Building results response...');
    const overallScore = analysis.linkScore || 0;
    const linkScoreResult = {
      overall: overallScore.toString(),
      breakdown: {
        competitivePosition: analysis.competitiveScore || 0, // Out of 30
        performanceVsExpected: analysis.performanceScore || 0, // Out of 25  
        velocityComparison: analysis.opportunityScore || 0, // Out of 20
        marketShareGrowth: calculateMarketShareGrowth(), // Out of 15 (now calculated!)
        costEfficiency: calculateCostEfficiency(), // Out of 10 (now calculated!)
        modifiers: 0 // Bonus/penalty points
      },
      interpretation: {
        grade: getPerformanceGrade(overallScore),
        label: overallScore >= 90 ? 'Exceptional' :
               overallScore >= 80 ? 'Excellent' :
               overallScore >= 70 ? 'Good' :
               overallScore >= 60 ? 'Average' :
               overallScore >= 50 ? 'Below Average' :
               overallScore >= 40 ? 'Poor' :
               overallScore >= 30 ? 'Critical' : 'Failure',
        message: overallScore >= 80 ? 
          "Outstanding performance - you're outperforming most competitors with excellent ROI." :
          overallScore >= 60 ?
          "Solid performance with room for improvement. Your SEO is working but could be optimized." :
          overallScore >= 40 ?
          "Below average performance indicates significant issues with your current SEO strategy." :
          "Critical performance failure. Your SEO investment requires immediate strategic overhaul.",
        urgency: overallScore <= 40 ? 'CRITICAL' :
                 overallScore <= 50 ? 'HIGH' :
                 overallScore <= 70 ? 'MEDIUM' : 'LOW'
      }
    };

    const leadScores = {
      priority: analysis.priorityScore || 0,
      potential: analysis.potentialScore || 0,
      overall: Math.round(((analysis.priorityScore || 0) + (analysis.potentialScore || 0)) / 2)
    };

    // Determine result strategy based on new 100-point LinkScore
    const getResultStrategy = (score: number) => {
      if (score <= 40) {
        return {
          type: 'CRISIS',
          headline: 'Your SEO Isn\'t Working',
          subheadline: 'Critical issues detected - immediate action required',
          cta: 'Get a Free Emergency SEO Audit',
          ctaColor: 'bg-red-600',
          urgency: 'CRITICAL',
          leadType: 'PRIORITY'
        };
      }
      
      if (score <= 60) {
        return {
          type: 'OPPORTUNITY',
          headline: 'Your SEO Has Potential',
          subheadline: 'Significant opportunities identified for improvement',
          cta: 'Discover Your Biggest Link Building Opportunities',
          ctaColor: 'bg-orange-500',
          urgency: 'MEDIUM',
          leadType: 'NURTURE'
        };
      }
      
      if (score >= 80) {
        return {
          type: 'SUCCESS',
          headline: 'Your SEO Is Working Well',
          subheadline: 'Let\'s expand your dominance to new markets',
          cta: 'Book a Strategy Session to Analyze New Opportunities',
          ctaColor: 'bg-green-600',
          urgency: 'LOW',
          leadType: 'POTENTIAL'
        };
      }
      
      // Score 60-80 (average/good)
      return {
        type: 'OPTIMIZATION',
        headline: 'Your SEO Shows Promise',
        subheadline: 'Good foundation with room for optimization',
        cta: 'Get a Personalized SEO Growth Plan',
        ctaColor: 'bg-blue-600',
        urgency: 'MEDIUM',
        leadType: 'NURTURE'
      };
    };

    const strategy = getResultStrategy(overallScore);
    
    // Determine lead type based on priority score and LinkScore
    const leadType = leadScores.priority >= 70 ? 'PRIORITY' : 
                     overallScore >= 80 ? 'POTENTIAL' : 'NURTURE';
    
    // Determine urgency based on LinkScore and priority score  
    const urgency = (overallScore <= 40 || leadScores.priority >= 70) ? 'HIGH' :
                    (overallScore <= 60 || leadScores.priority >= 50) ? 'MEDIUM' : 'LOW';

    // Calculate investment summary
    console.log('💰 Calculating investment summary...');
    const monthlySpend = analysis.monthlySpend || 0;
    const investmentMonths = analysis.investmentMonths || 0;
    const totalInvestment = monthlySpend * investmentMonths;
    console.log(`Expected links calculation: $${monthlySpend}/month × ${investmentMonths} months = $${totalInvestment} ÷ $667 = ${Math.round(totalInvestment / 667)} expected links gained`);
    const expectedLinks = calculator.calculateExpectedLinks(monthlySpend, investmentMonths);
    console.log('✅ Investment summary calculated');

    const results = {
      // Analysis metadata
      analysisId: analysis.id || analysisId,
      completedAt: analysis.completedAt || new Date(),
      processingTime: analysis.processingTimeSeconds || 0,
      
      // User and campaign info
      user: {
        domain: analysis.user?.domain || '',
        location: analysis.user?.location || '',
        company: analysis.user?.companyName || ''
      },
      
      campaign: {
        monthlySpend: monthlySpend,
        investmentMonths: investmentMonths,
        totalInvestment,
        spendRange: analysis.spendRange || '',
        durationRange: analysis.durationRange || '',
        keywords: analysis.targetKeywords || []
      },
      
      // LinkScore results
      linkScore: linkScoreResult,
      
      // Key metrics
      metrics: {
        currentAuthorityLinks: analysis.currentAuthorityLinks || 0,
        authorityLinksGained: analysis.authorityLinksGained || 0,
        expectedLinks,
        competitorAverageLinks: analysis.competitorAverageLinks || 0,
        linkGapsTotal: analysis.linkGapsTotal || 0,
        linkGapsHighPriority: analysis.linkGapsHighPriority || 0,
        costPerAuthorityLink: analysis.costPerAuthorityLink || 0
      },
      
      // Competitive analysis
      competitive: {
        competitors: analysis.competitors || [],
        competitorAverageLinks: analysis.competitorAverageLinks || 0,
        gapPercentage: (analysis.competitorAverageLinks || 0) > 0 
          ? Math.round(((analysis.competitorAverageLinks - (analysis.currentAuthorityLinks || 0)) / analysis.competitorAverageLinks) * 100)
          : 0,
        marketPosition: (analysis.competitorAverageLinks || 0) > 0 
          ? Math.round(((analysis.currentAuthorityLinks || 0) / analysis.competitorAverageLinks) * 100)
          : 100
      },
      
      // Red flags and opportunities
      redFlags: analysis.redFlags || [],
      linkOpportunities: (analysis.linkGapData || []).slice(0, 10), // Top 10 opportunities
      
      // Competitor historical data
      historicalData: analysis.historicalData || {},
      
      // Lead scoring
      leadScoring: {
        priority: leadScores.priority,
        potential: leadScores.potential,
        overall: leadScores.overall,
        leadType,
        urgency
      },
      
      // Result strategy for display
      strategy,
      
      // Performance summary
      performance: {
        grade: getPerformanceGrade(overallScore),
        summary: getPerformanceSummary(analysis, strategy.type),
        recommendations: getRecommendations(analysis, strategy.type)
      }
    };

    return NextResponse.json(results);

  } catch (error: any) {
    console.error('❌ Results retrieval error:', error);
    console.error('❌ Error stack:', error.stack);
    
    if (error.message === 'Analysis not found') {
      return NextResponse.json(
        { error: 'Analysis not found' },
        { status: 404 }
      );
    }
    
    // More specific error messages for debugging
    if (error.name === 'PrismaClientKnownRequestError') {
      console.error('❌ Database error:', error.code, error.message);
      return NextResponse.json(
        { error: 'Database error occurred' },
        { status: 500 }
      );
    }
    
    if (error.message?.includes('Cannot read properties')) {
      console.error('❌ Missing data error - analysis may be incomplete:', error.message);
      return NextResponse.json(
        { error: 'Analysis data incomplete' },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to retrieve analysis results',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

// Helper functions
function getPerformanceGrade(linkScore: number): string {
  if (linkScore >= 90) return 'A+';
  if (linkScore >= 80) return 'A';
  if (linkScore >= 70) return 'B+';
  if (linkScore >= 60) return 'B';
  if (linkScore >= 50) return 'C+';
  if (linkScore >= 40) return 'C';
  if (linkScore >= 30) return 'D';
  return 'F';
}

function getPerformanceSummary(analysis: any, strategyType: string): string {
  const totalInvestment = analysis.monthlySpend * analysis.investmentMonths;
  
  switch (strategyType) {
    case 'CRISIS':
      return `After ${analysis.investmentMonths} months and $${totalInvestment.toLocaleString()} invested, your SEO is significantly underperforming. Immediate intervention required.`;
    case 'OPPORTUNITY':
      return `Your SEO shows potential but needs optimization. With ${analysis.linkGapsTotal} link opportunities identified, there's room for substantial improvement.`;
    case 'SUCCESS':
      return `Your SEO is performing well with ${analysis.currentAuthorityLinks} authority links. You're outperforming most competitors in your market.`;
    default:
      return `Your SEO has a solid foundation with opportunities for growth. Strategic improvements could boost your LinkScore significantly.`;
  }
}

function getRecommendations(analysis: any, strategyType: string): string[] {
  const recommendations = [];
  
  if (strategyType === 'CRISIS') {
    recommendations.push('Conduct immediate SEO audit and provider review');
    recommendations.push('Focus on high-authority link acquisition');
    recommendations.push('Review and optimize link building strategy');
  } else if (strategyType === 'OPPORTUNITY') {
    recommendations.push('Target competitor link gaps for quick wins');
    recommendations.push('Increase link building velocity');
    recommendations.push('Improve content quality and outreach');
  } else if (strategyType === 'SUCCESS') {
    recommendations.push('Expand to new target keywords and markets');
    recommendations.push('Maintain current link building pace');
    recommendations.push('Focus on high-authority publications');
  } else {
    recommendations.push('Optimize current link building processes');
    recommendations.push('Target high-impact link opportunities');
    recommendations.push('Improve competitive positioning');
  }
  
  return recommendations;
}

// Handle unsupported methods
export async function POST() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
} 