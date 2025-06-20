import { NextRequest, NextResponse } from 'next/server';
import { AnalysisEngine } from '@/lib/analysis-engine';
import { LinkScoreCalculator } from '@/lib/link-score';

interface WebhookPayload {
  timestamp: string;
  source: string;
  version: string;
  analysis: {
    id: string;
    completedAt: string;
    processingTime: number;
    status: string;
  };
  user: {
    id: string;
    domain: string;
    company: string;
    location: string;
    locationName: string;
    marketValue: string;
  };
  campaign: {
    monthlySpend: number;
    investmentMonths: number;
    totalInvested: number;
    spendRange: string;
    durationRange: string;
    targetKeywords: string[];
  };
  results: {
    linkScore: number;
    performanceScore: number;
    competitiveScore: number;
    opportunityScore: number;
    currentAuthorityLinks: number;
    expectedLinks: number;
    authorityLinksGained: number;
    competitorAverageLinks: number;
    linkGapsTotal: number;
    linkGapsHighPriority: number;
    costPerAuthorityLink: number;
    redFlags: any[];
    redFlagCount: number;
    criticalFlags: number;
  };
  intelligence: {
    competitors: string[];
    competitorCount: number;
    marketPosition: number;
    linkGapOpportunities: any[];
  };
  leadScoring: {
    priorityScore: number;
    potentialScore: number;
    overallScore: number;
    leadType: string;
    urgency: string;
    salesNotes: string[];
  };
  strategy: {
    type: string;
    headline: string;
    cta: string;
    urgency: string;
  };
  metadata: {
    dataforseoCost: number;
    processingTime: number;
    apiVersion: string;
    toolVersion: string;
  };
}

// Australian locations mapping
const AUSTRALIAN_LOCATIONS = {
  "sydney": { code: 21167, name: "Sydney, NSW", population: "5.4M", marketValue: "HIGH" },
  "melbourne": { code: 21173, name: "Melbourne, VIC", population: "5.3M", marketValue: "HIGH" },
  "brisbane": { code: 21174, name: "Brisbane, QLD", population: "2.5M", marketValue: "HIGH" },
  "perth": { code: 21175, name: "Perth, WA", population: "2.1M", marketValue: "HIGH" },
  "adelaide": { code: 21176, name: "Adelaide, SA", population: "1.3M", marketValue: "MEDIUM" },
  "gold_coast": { code: 1011678, name: "Gold Coast, QLD", population: "750K", marketValue: "MEDIUM" },
  "newcastle": { code: 1011715, name: "Newcastle, NSW", population: "308K", marketValue: "MEDIUM" },
  "canberra": { code: 21177, name: "Canberra, ACT", population: "368K", marketValue: "MEDIUM" },
  "sunshine_coast": { code: 1011679, name: "Sunshine Coast, QLD", population: "350K", marketValue: "MEDIUM" },
  "wollongong": { code: 1011717, name: "Wollongong, NSW", population: "292K", marketValue: "MEDIUM" },
  "central_coast": { code: 1011716, name: "Central Coast, NSW", population: "340K", marketValue: "MEDIUM" },
  "australia_general": { code: 2036, name: "Australia", population: "Other", marketValue: "VARIABLE" }
};

export async function POST(request: NextRequest) {
  try {
    const { analysisId } = await request.json();
    
    if (!analysisId) {
      return NextResponse.json(
        { error: 'Analysis ID is required' },
        { status: 400 }
      );
    }

    // Get analysis data
    const analysisEngine = new AnalysisEngine();
    const calculator = new LinkScoreCalculator();
    const analysis = await analysisEngine.getAnalysis(analysisId);
    
    if (analysis.status !== 'completed') {
      return NextResponse.json(
        { error: 'Analysis not completed' },
        { status: 400 }
      );
    }

    // Build comprehensive webhook payload
    const locationInfo = AUSTRALIAN_LOCATIONS[analysis.user.location as keyof typeof AUSTRALIAN_LOCATIONS] || 
                        AUSTRALIAN_LOCATIONS.australia_general;

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

    const leadType = calculator.getLeadType(leadScores, linkScoreResult);
    const urgency = calculator.getUrgency(analysis.linkScore, analysis.priorityScore);

    // Generate sales notes
    const salesNotes = generateSalesNotes(analysis, leadScores);

    // Determine strategy
    const strategy = getResultStrategy(analysis.linkScore);

    const payload: WebhookPayload = {
      timestamp: new Date().toISOString(),
      source: "LinkScore",
      version: "1.0",
      
      analysis: {
        id: analysis.id,
        completedAt: analysis.completedAt?.toISOString() || new Date().toISOString(),
        processingTime: analysis.processingTimeSeconds || 0,
        status: analysis.status
      },
      
      user: {
        id: analysis.user.id,
        domain: analysis.user.domain,
        company: analysis.user.companyName || '',
        location: analysis.user.location,
        locationName: locationInfo.name,
        marketValue: locationInfo.marketValue
      },
      
      campaign: {
        monthlySpend: analysis.monthlySpend,
        investmentMonths: analysis.investmentMonths,
        totalInvested: analysis.monthlySpend * analysis.investmentMonths,
        spendRange: analysis.spendRange,
        durationRange: analysis.durationRange,
        targetKeywords: analysis.targetKeywords
      },
      
      results: {
        linkScore: analysis.linkScore,
        performanceScore: analysis.performanceScore,
        competitiveScore: analysis.competitiveScore,
        opportunityScore: analysis.opportunityScore,
        currentAuthorityLinks: analysis.currentAuthorityLinks || 0,
        expectedLinks: analysis.expectedLinks || 0,
        authorityLinksGained: analysis.authorityLinksGained || 0,
        competitorAverageLinks: analysis.competitorAverageLinks || 0,
        linkGapsTotal: analysis.linkGapsTotal || 0,
        linkGapsHighPriority: analysis.linkGapsHighPriority || 0,
        costPerAuthorityLink: analysis.costPerAuthorityLink || 0,
        redFlags: analysis.redFlags || [],
        redFlagCount: (analysis.redFlags || []).length,
        criticalFlags: (analysis.redFlags || []).filter((f: any) => f.severity === 'CRITICAL').length
      },
      
      intelligence: {
        competitors: analysis.competitors || [],
        competitorCount: (analysis.competitors || []).length,
        marketPosition: analysis.competitorAverageLinks > 0 && analysis.currentAuthorityLinks > 0
          ? Math.round((analysis.currentAuthorityLinks / analysis.competitorAverageLinks) * 100)
          : 0,
        linkGapOpportunities: (analysis.linkGapData || []).slice(0, 10)
      },
      
      leadScoring: {
        priorityScore: leadScores.priority,
        potentialScore: leadScores.potential,
        overallScore: leadScores.overall,
        leadType,
        urgency,
        salesNotes
      },
      
      strategy,
      
      metadata: {
        dataforseoCost: analysis.dataforseoCostUsd || 0,
        processingTime: analysis.processingTimeSeconds || 0,
        apiVersion: "v3",
        toolVersion: "1.0.0"
      }
    };

    // Send to configured webhook URL (if any)
    const webhookUrl = process.env.CRM_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'LinkScore/1.0',
            'X-Webhook-Source': 'LinkScore'
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          console.error('Webhook delivery failed:', response.status, response.statusText);
        } else {
          console.log('Webhook delivered successfully to CRM');
        }
      } catch (error) {
        console.error('Webhook delivery error:', error);
      }
    }

    // Return the payload for debugging/testing
    return NextResponse.json({
      success: true,
      message: 'Webhook payload generated',
      delivered: !!webhookUrl,
      payload
    });

  } catch (error: any) {
    console.error('Webhook generation error:', error);
    
    return NextResponse.json(
      { error: 'Failed to generate webhook payload' },
      { status: 500 }
    );
  }
}

// Helper functions
function generateSalesNotes(analysis: any, leadScores: any): string[] {
  const notes = [];
  
  if (analysis.linkScore <= 4) {
    notes.push(`URGENT: LinkScore ${analysis.linkScore}/10 after $${(analysis.monthlySpend * analysis.investmentMonths).toLocaleString()} invested`);
  }
  
  if (analysis.monthlySpend >= 5000) {
    notes.push(`High-value client: $${analysis.monthlySpend.toLocaleString()}/month budget`);
  }
  
  if (analysis.competitorAverageLinks > 0 && analysis.currentAuthorityLinks > 0) {
    if (analysis.competitorAverageLinks > analysis.currentAuthorityLinks * 2) {
      notes.push(`Massive competitive gap: ${analysis.competitorAverageLinks} vs ${analysis.currentAuthorityLinks} authority links`);
    }
  }
  
  if (analysis.investmentMonths >= 12 && analysis.linkScore <= 5) {
    notes.push(`Long-term underperformance: ${analysis.investmentMonths} months with poor results`);
  }
  
  const criticalFlags = (analysis.redFlags || []).filter((f: any) => f.severity === 'CRITICAL');
  if (criticalFlags.length > 0) {
    notes.push(`Critical issues: ${criticalFlags.map((f: any) => f.type).join(', ')}`);
  }
  
  return notes;
}

function getResultStrategy(linkScore: number) {
  if (linkScore <= 4) {
    return {
      type: 'CRISIS',
      headline: 'Your SEO Isn\'t Working',
      cta: 'Get a Free Emergency SEO Audit',
      urgency: 'HIGH'
    };
  }
  
  if (linkScore <= 6) {
    return {
      type: 'OPPORTUNITY',
      headline: 'Your SEO Has Potential',
      cta: 'Discover Your Biggest Link Building Opportunities',
      urgency: 'MEDIUM'
    };
  }
  
  if (linkScore >= 8) {
    return {
      type: 'SUCCESS',
      headline: 'Your SEO Is Working Well',
      cta: 'Book a Strategy Session to Analyze New Opportunities',
      urgency: 'LOW'
    };
  }
  
  return {
    type: 'OPTIMIZATION',
    headline: 'Your SEO Shows Promise',
    cta: 'Get a Personalized SEO Growth Plan',
    urgency: 'MEDIUM'
  };
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
} 