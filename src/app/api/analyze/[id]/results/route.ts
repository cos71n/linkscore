import { NextRequest, NextResponse } from 'next/server';
import { AnalysisEngine } from '@/lib/analysis-engine';
import { LinkScoreCalculator } from '@/lib/link-score';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: analysisId } = await params;
    
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

    const analysisEngine = new AnalysisEngine();
    const calculator = new LinkScoreCalculator();
    const analysis = await analysisEngine.getAnalysis(analysisId);
    
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

    // Prepare comprehensive results response
    const linkScoreResult = {
      overall: analysis.linkScore,
      performance: analysis.performanceScore,
      competitive: analysis.competitiveScore,
      opportunity: analysis.opportunityScore
    };

    const leadScores = {
      priority: analysis.priorityScore,
      potential: analysis.potentialScore,
      overall: Math.round((analysis.priorityScore + analysis.potentialScore) / 2)
    };

    // Determine result strategy based on LinkScore
    const getResultStrategy = (score: number) => {
      if (score <= 4) {
        return {
          type: 'CRISIS',
          headline: 'Your SEO Isn\'t Working',
          subheadline: 'Critical issues detected - immediate action required',
          cta: 'Get a Free Emergency SEO Audit',
          ctaColor: 'bg-red-600',
          urgency: 'HIGH',
          leadType: 'PRIORITY'
        };
      }
      
      if (score <= 6) {
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
      
      if (score >= 8) {
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
      
      // Score 6-8 (average)
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

    const strategy = getResultStrategy(analysis.linkScore);
    const leadType = calculator.getLeadType(leadScores, linkScoreResult);
    const urgency = calculator.getUrgency(analysis.linkScore, analysis.priorityScore);

    // Calculate investment summary
    const totalInvestment = analysis.monthlySpend * analysis.investmentMonths;
    const expectedLinks = calculator.calculateExpectedLinks(analysis.monthlySpend, analysis.investmentMonths);

    const results = {
      // Analysis metadata
      analysisId: analysis.id,
      completedAt: analysis.completedAt,
      processingTime: analysis.processingTimeSeconds,
      
      // User and campaign info
      user: {
        domain: analysis.user.domain,
        location: analysis.user.location,
        company: analysis.user.companyName
      },
      
      campaign: {
        monthlySpend: analysis.monthlySpend,
        investmentMonths: analysis.investmentMonths,
        totalInvestment,
        spendRange: analysis.spendRange,
        durationRange: analysis.durationRange,
        keywords: analysis.targetKeywords
      },
      
      // LinkScore results
      linkScore: linkScoreResult,
      
      // Key metrics
      metrics: {
        currentAuthorityLinks: analysis.currentAuthorityLinks,
        authorityLinksGained: analysis.authorityLinksGained,
        expectedLinks,
        competitorAverageLinks: analysis.competitorAverageLinks,
        linkGapsTotal: analysis.linkGapsTotal,
        linkGapsHighPriority: analysis.linkGapsHighPriority,
        costPerAuthorityLink: analysis.costPerAuthorityLink
      },
      
      // Competitive analysis
      competitive: {
        competitors: analysis.competitors,
        competitorAverageLinks: analysis.competitorAverageLinks,
        gapPercentage: analysis.competitorAverageLinks > 0 
          ? Math.round(((analysis.competitorAverageLinks - analysis.currentAuthorityLinks) / analysis.competitorAverageLinks) * 100)
          : 0,
        marketPosition: analysis.competitorAverageLinks > 0 
          ? Math.round((analysis.currentAuthorityLinks / analysis.competitorAverageLinks) * 100)
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
        grade: getPerformanceGrade(analysis.linkScore),
        summary: getPerformanceSummary(analysis, strategy.type),
        recommendations: getRecommendations(analysis, strategy.type)
      }
    };

    return NextResponse.json(results);

  } catch (error: any) {
    console.error('Results retrieval error:', error);
    
    if (error.message === 'Analysis not found') {
      return NextResponse.json(
        { error: 'Analysis not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to retrieve analysis results' },
      { status: 500 }
    );
  }
}

// Helper functions
function getPerformanceGrade(linkScore: number): string {
  if (linkScore >= 9) return 'A+';
  if (linkScore >= 8) return 'A';
  if (linkScore >= 7) return 'B+';
  if (linkScore >= 6) return 'B';
  if (linkScore >= 5) return 'C+';
  if (linkScore >= 4) return 'C';
  if (linkScore >= 3) return 'D';
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