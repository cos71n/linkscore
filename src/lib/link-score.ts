import { DomainData, LinkGapResult } from './dataforseo';

interface ClientMetrics {
  // Historical data
  authorityLinksStart: number;        // Links at campaign start
  authorityLinksNow: number;          // Current authority links
  authorityLinksGained: number;       // Links gained during campaign
  authorityLinksExpected: number;     // Expected based on spend
  
  // Campaign details
  monthlySpend: number;
  campaignMonths: number;
  totalInvestment: number;
  costPerLink: number;              // Total investment ÷ links gained
  
  // Market context
  linkVelocity: number;             // Links per month (gained ÷ months)
  authorityDomains?: number;        // For diversity bonus calculation
  recentLinksQuality?: number;      // Average DR of recent links
}

interface CompetitorMetrics {
  domain: string;
  authorityLinksStart: number;
  authorityLinksNow: number;
  authorityLinksGained: number;
  gapToClient: number;              // competitor_links - client_links
  linkVelocity: number;             // Links per month
}

interface LinkScoreResult {
  overall: number;                  // Final score out of 100
  breakdown: {
    competitivePosition: number;    // Out of 30 points
    performanceVsExpected: number;  // Out of 25 points
    velocityComparison: number;     // Out of 20 points
    marketShareGrowth: number;      // Out of 15 points
    costEfficiency: number;         // Out of 10 points
    modifiers: number;              // Bonus/penalty points
  };
  interpretation: {
    grade: string;                  // A+ to F
    label: string;                  // Exceptional, Excellent, etc.
    message: string;                // Detailed interpretation
    urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  };
}

interface RedFlag {
  type: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
  impact: string;
  recommendation: string;
}

interface LeadScore {
  priority: number; // 0-100 for sales urgency
  potential: number; // 0-100 for long-term value
  overall: number;
}

interface InvestmentData {
  monthlySpend: number;
  investmentMonths: number;
  totalInvestment: number;
  spendRange: string;
  durationRange: string;
}

interface PerformanceData {
  authorityLinksGained: number;
  expectedLinks: number;
  currentAuthorityLinks: number;
  costPerAuthorityLink: number;
  performance: number; // Percentage
  campaignStartDate: string;
  campaignDuration: number;
}

interface CompetitiveData {
  clientAuthorityLinks: number;
  averageCompetitorLinks: number;
  competitorsBehind: number;
  gapPercentage: number;
}

class LinkScoreCalculator {
  
  /**
   * Calculate comprehensive LinkScore using the new 100-point algorithm
   */
  calculateLinkScore(
    clientData: ClientMetrics,
    competitorData: CompetitorMetrics[]
  ): LinkScoreResult {
    
    // Core components (100 points total)
    const competitivePosition = this.calculateCompetitivePosition(
      clientData.authorityLinksNow, 
      competitorData
    );
    
    const performanceVsExpected = this.calculatePerformanceVsExpected(
      clientData.authorityLinksGained, 
      clientData.authorityLinksExpected
    );
    
    const velocityComparison = this.calculateVelocityComparison(
      clientData.linkVelocity, 
      competitorData
    );
    
    const marketShareGrowth = this.calculateMarketShareGrowth(
      clientData.authorityLinksStart,
      clientData.authorityLinksNow,
      competitorData
    );
    
    const costEfficiency = this.calculateCostEfficiency(
      clientData.costPerLink,
      clientData.monthlySpend
    );
    
    // Bonus/penalty modifiers
    const diversityBonus = this.calculateDiversityBonus(
      clientData.authorityDomains || 0, 
      clientData.authorityLinksNow
    );
    
    const qualityBonus = this.calculateQualityProgression(
      clientData.recentLinksQuality || 0
    );
    
    const gapPenalty = this.calculateGapPenalty(
      clientData.authorityLinksNow, 
      competitorData
    );
    
    const timePenalty = this.calculateTimePenalty(
      clientData.campaignMonths,
      clientData.authorityLinksGained / Math.max(1, clientData.authorityLinksExpected)
    );
    
    // Final score calculation
    const baseScore = competitivePosition + performanceVsExpected + 
                     velocityComparison + marketShareGrowth + costEfficiency;
                     
    const modifiers = diversityBonus + qualityBonus + gapPenalty + timePenalty;
    
    const finalScore = Math.max(1, Math.min(100, baseScore + modifiers));
    
    // Debug logging for comprehensive LinkScore calculation
    console.log('🔍 COMPREHENSIVE LINKSCORE CALCULATION:');
    console.log(`  Competitive Position: ${competitivePosition}/30`);
    console.log(`  Performance vs Expected: ${performanceVsExpected}/25`);
    console.log(`  Velocity Comparison: ${velocityComparison}/20`);
    console.log(`  Market Share Growth: ${marketShareGrowth}/15`);
    console.log(`  Cost Efficiency: ${costEfficiency}/10`);
    console.log(`  Modifiers: ${modifiers} (diversity: ${diversityBonus}, quality: ${qualityBonus}, gap: ${gapPenalty}, time: ${timePenalty})`);
    console.log(`  Base Score: ${baseScore}/100`);
    console.log(`  FINAL SCORE: ${finalScore}/100`);
    
    const breakdown = {
      competitivePosition,
      performanceVsExpected,
      velocityComparison,
      marketShareGrowth,
      costEfficiency,
      modifiers
    };
    
    const interpretation = this.interpretScore(finalScore);
    
    return {
      overall: Math.round(finalScore * 10) / 10,
      breakdown,
      interpretation
    };
  }

  /**
   * Component 1: Current Competitive Position (30 points)
   */
  private calculateCompetitivePosition(clientLinks: number, competitorData: CompetitorMetrics[]): number {
    if (competitorData.length === 0) return 15; // Neutral if no competitors
    
    const competitorAverage = competitorData.reduce((sum, comp) => 
      sum + comp.authorityLinksNow, 0) / competitorData.length;
    
    const competitiveRatio = clientLinks / competitorAverage;
    
    // Scoring scale
    if (competitiveRatio >= 1.0) return 30;    // At or above average
    if (competitiveRatio >= 0.8) return 25;    // 80-99% of average
    if (competitiveRatio >= 0.6) return 20;    // 60-79% of average
    if (competitiveRatio >= 0.4) return 15;    // 40-59% of average
    if (competitiveRatio >= 0.2) return 10;    // 20-39% of average
    return 5;                                  // Below 20% of average
  }

  /**
   * Component 2: Link Building Performance vs Expected (25 points)
   */
  private calculatePerformanceVsExpected(gained: number, expected: number): number {
    if (expected === 0) return 12; // Neutral if no expected baseline
    
    const performanceRatio = gained / expected;
    
    // Scoring scale with caps for over-performance
    if (performanceRatio >= 1.2) return 25;    // 120%+ performance
    if (performanceRatio >= 1.0) return 23;    // 100-119% performance
    if (performanceRatio >= 0.8) return 20;    // 80-99% performance
    if (performanceRatio >= 0.6) return 15;    // 60-79% performance
    if (performanceRatio >= 0.4) return 10;    // 40-59% performance
    if (performanceRatio >= 0.2) return 5;     // 20-39% performance
    return 1;                                  // Below 20% performance
  }

  /**
   * Component 3: Competitive Link Building Velocity (20 points)
   */
  private calculateVelocityComparison(clientVelocity: number, competitorData: CompetitorMetrics[]): number {
    if (competitorData.length === 0) return 10; // Neutral if no competitors
    
    const competitorVelocityAverage = competitorData.reduce((sum, comp) => 
      sum + comp.linkVelocity, 0) / competitorData.length;
    
    if (competitorVelocityAverage === 0) return 10; // Neutral if no competitor velocity data
    
    const velocityRatio = clientVelocity / competitorVelocityAverage;
    
    // Scoring scale
    if (velocityRatio >= 1.2) return 20;      // 120%+ of competitor velocity
    if (velocityRatio >= 1.0) return 18;      // 100-119% of competitor velocity
    if (velocityRatio >= 0.8) return 15;      // 80-99% of competitor velocity
    if (velocityRatio >= 0.6) return 12;      // 60-79% of competitor velocity
    if (velocityRatio >= 0.4) return 8;       // 40-59% of competitor velocity
    if (velocityRatio >= 0.2) return 4;       // 20-39% of competitor velocity
    return 1;                                 // Below 20% of competitor velocity
  }

  /**
   * Component 4: Market Share Growth/Decline (15 points)
   */
  private calculateMarketShareGrowth(
    clientStart: number, 
    clientNow: number, 
    competitorData: CompetitorMetrics[]
  ): number {
    if (competitorData.length === 0) return 8; // Neutral if no competitors
    
    // Calculate market share at start and now
    const totalLinksStart = clientStart + competitorData.reduce((sum, comp) => 
      sum + comp.authorityLinksStart, 0);
    const totalLinksNow = clientNow + competitorData.reduce((sum, comp) => 
      sum + comp.authorityLinksNow, 0);
    
    if (totalLinksStart === 0 || totalLinksNow === 0) return 8; // Neutral if no data
    
    const marketShareStart = clientStart / totalLinksStart;
    const marketShareNow = clientNow / totalLinksNow;
    const marketShareChange = marketShareNow - marketShareStart;
    
    // Scoring based on market share change
    if (marketShareChange >= 0.02) return 15;    // Gained 2%+ market share
    if (marketShareChange >= 0.01) return 13;    // Gained 1-2% market share
    if (marketShareChange >= 0.005) return 11;   // Gained 0.5-1% market share
    if (marketShareChange >= 0) return 8;        // Maintained market share
    if (marketShareChange >= -0.005) return 5;   // Lost <0.5% market share
    if (marketShareChange >= -0.01) return 3;    // Lost 0.5-1% market share
    return 1;                                    // Lost >1% market share
  }

  /**
   * Component 5: Cost Efficiency vs Market (10 points)
   */
  private calculateCostEfficiency(costPerLink: number, monthlySpend: number): number {
    // Expected cost per authority link based on spend
    const expectedCostPerLink = (monthlySpend / 1000) * 667; // $667 per $1k spend baseline
    
    if (costPerLink === 0 || expectedCostPerLink === 0) return 5; // Neutral if no cost data
    
    const efficiencyRatio = expectedCostPerLink / costPerLink;
    
    // Scoring scale
    if (efficiencyRatio >= 1.5) return 10;      // 50%+ better than expected
    if (efficiencyRatio >= 1.2) return 9;       // 20-49% better than expected
    if (efficiencyRatio >= 1.0) return 8;       // Meeting expected efficiency
    if (efficiencyRatio >= 0.8) return 6;       // 20% worse than expected
    if (efficiencyRatio >= 0.6) return 4;       // 40% worse than expected
    if (efficiencyRatio >= 0.4) return 2;       // 60% worse than expected
    return 1;                                   // >60% worse than expected
  }

  /**
   * Bonus: Authority Domain Diversity (0-3 points)
   */
  private calculateDiversityBonus(authorityDomains: number, authorityLinks: number): number {
    if (authorityDomains === 0 || authorityLinks === 0) return 0;
    
    const linkToDomainRatio = authorityLinks / authorityDomains;
    
    // Reward diverse link profiles (1-2 links per domain is ideal)
    if (linkToDomainRatio <= 2.0) return 3;     // Excellent diversity
    if (linkToDomainRatio <= 3.0) return 1;     // Good diversity
    return 0;                                   // Poor diversity
  }

  /**
   * Bonus: Link Quality Progression (0-3 points)
   */
  private calculateQualityProgression(recentLinksQuality: number): number {
    // Check if newer links have higher average domain rank
    if (recentLinksQuality >= 40) return 3;     // High-quality recent links
    if (recentLinksQuality >= 30) return 1;     // Medium-quality recent links
    return 0;                                   // Low-quality recent links
  }

  /**
   * Penalty: Competitive Gap (-5 to 0 points)
   */
  private calculateGapPenalty(clientLinks: number, competitorData: CompetitorMetrics[]): number {
    if (competitorData.length === 0) return 0;
    
    const averageGap = competitorData.reduce((sum, comp) => 
      sum + comp.gapToClient, 0) / competitorData.length;
    
    if (clientLinks === 0) return -5; // Maximum penalty if no links
    
    const gapRatio = averageGap / clientLinks;
    
    // Penalize massive gaps
    if (gapRatio >= 3.0) return -5;            // 3x+ behind competitors
    if (gapRatio >= 2.0) return -3;            // 2x+ behind competitors  
    if (gapRatio >= 1.5) return -1;            // 1.5x+ behind competitors
    return 0;                                  // Competitive position
  }

  /**
   * Penalty: Investment Time vs Performance (-5 to 0 points)
   */
  private calculateTimePenalty(monthsInvested: number, performanceRatio: number): number {
    // Penalize long campaigns with poor results
    if (monthsInvested >= 18 && performanceRatio < 0.3) return -5;
    if (monthsInvested >= 12 && performanceRatio < 0.4) return -3;
    if (monthsInvested >= 6 && performanceRatio < 0.3) return -2;
    return 0;
  }

  /**
   * Interpret the final score and provide contextual information
   */
  private interpretScore(score: number): LinkScoreResult['interpretation'] {
    if (score >= 90) {
      return {
        grade: 'A+',
        label: 'Exceptional',
        message: 'Outstanding performance - you\'re outperforming all competitors with exceptional ROI.',
        urgency: 'LOW'
      };
    } else if (score >= 80) {
      return {
        grade: 'A',
        label: 'Excellent',
        message: 'Excellent performance - strong competitive position with great value for investment.',
        urgency: 'LOW'
      };
    } else if (score >= 70) {
      return {
        grade: 'B',
        label: 'Good',
        message: 'Good performance - above average results with solid competitive positioning.',
        urgency: 'LOW'
      };
    } else if (score >= 60) {
      return {
        grade: 'C',
        label: 'Average',
        message: 'Average performance - meeting basic expectations but room for improvement.',
        urgency: 'MEDIUM'
      };
    } else if (score >= 50) {
      return {
        grade: 'D',
        label: 'Below Average',
        message: 'Below average performance - underperforming investment with competitive gaps.',
        urgency: 'MEDIUM'
      };
    } else if (score >= 40) {
      return {
        grade: 'D-',
        label: 'Poor',
        message: 'Poor performance - significant issues detected requiring immediate attention.',
        urgency: 'HIGH'
      };
    } else if (score >= 30) {
      return {
        grade: 'F+',
        label: 'Critical',
        message: 'Critical issues - major strategic problems requiring complete overhaul.',
        urgency: 'CRITICAL'
      };
    } else {
      return {
        grade: 'F',
        label: 'Failure',
        message: 'Complete failure - your SEO investment is not delivering any meaningful results.',
        urgency: 'CRITICAL'
      };
    }
  }

  // Legacy compatibility methods - adapt existing data to new format
  calculateLinkScoreLegacy(
    performanceData: PerformanceData,
    competitiveData: CompetitiveData,
    linkGapData: LinkGapResult[]
  ): LinkScoreResult {
    
    // Convert legacy data to new format
    const clientData: ClientMetrics = {
      authorityLinksStart: performanceData.currentAuthorityLinks - performanceData.authorityLinksGained,
      authorityLinksNow: performanceData.currentAuthorityLinks,
      authorityLinksGained: performanceData.authorityLinksGained,
      authorityLinksExpected: performanceData.expectedLinks,
      monthlySpend: 0, // Will be set by caller
      campaignMonths: performanceData.campaignDuration,
      totalInvestment: 0, // Will be set by caller
      costPerLink: performanceData.costPerAuthorityLink,
      linkVelocity: performanceData.authorityLinksGained / Math.max(1, performanceData.campaignDuration)
    };
    
    // Create simplified competitor data
    const competitorData: CompetitorMetrics[] = [];
    if (competitiveData.averageCompetitorLinks > 0) {
      // Create a representative competitor entry
      competitorData.push({
        domain: 'average_competitor',
        authorityLinksStart: Math.round(competitiveData.averageCompetitorLinks * 0.8), // Estimate
        authorityLinksNow: competitiveData.averageCompetitorLinks,
        authorityLinksGained: Math.round(competitiveData.averageCompetitorLinks * 0.2), // Estimate
        gapToClient: competitiveData.averageCompetitorLinks - competitiveData.clientAuthorityLinks,
        linkVelocity: Math.round(competitiveData.averageCompetitorLinks * 0.2) / Math.max(1, performanceData.campaignDuration)
      });
    }
    
    return this.calculateLinkScore(clientData, competitorData);
  }

  // Calculate expected authority links based on investment
  calculateExpectedLinks(monthlySpend: number, investmentMonths: number): number {
    // Industry benchmark: ~$667 per authority link
    const costPerLink = 667;
    const totalInvestment = monthlySpend * investmentMonths;
    const expectedLinksGained = Math.floor(totalInvestment / costPerLink);
    
    console.log(`Expected links calculation: $${monthlySpend}/month × ${investmentMonths} months = $${totalInvestment} ÷ $${costPerLink} = ${expectedLinksGained} expected links gained`);
    
    return expectedLinksGained;
  }

  // Calculate performance data from domain analysis
  async calculatePerformanceData(
    apiClient: any,
    domain: string,
    investmentData: InvestmentData
  ): Promise<PerformanceData> {
    
    // Expected links = how many they SHOULD have gained during investment period
    const expectedLinksGained = this.calculateExpectedLinks(
      investmentData.monthlySpend,
      investmentData.investmentMonths
    );
    
    // Calculate campaign start date
    const campaignStartDate = new Date();
    campaignStartDate.setMonth(campaignStartDate.getMonth() - investmentData.investmentMonths);
    const campaignStartDateStr = campaignStartDate.toISOString().replace('T', ' ').substring(0, 19) + ' +00:00';
    
    console.log(`Expected links calculation: $${investmentData.monthlySpend}/month × ${investmentData.investmentMonths} months = $${investmentData.totalInvestment} ÷ $667 = ${expectedLinksGained} expected links gained`);
    console.log(`Campaign period: ${campaignStartDate.toISOString().split('T')[0]} to ${new Date().toISOString().split('T')[0]}`);
    
    try {
      // Get authority links at campaign START and NOW using the new method
      const [startData, currentData] = await Promise.all([
        apiClient.getAuthorityLinksByDate(domain, campaignStartDateStr),
        apiClient.getAuthorityLinksByDate(domain) // No date filter = current
      ]);

      const authorityLinksAtStartCount = startData.authorityLinksCount;
      const currentAuthorityLinksCount = currentData.authorityLinksCount;
      const authorityLinksGained = Math.max(0, currentAuthorityLinksCount - authorityLinksAtStartCount);
      
      console.log(`Authority Links at START (${campaignStartDate.toISOString().split('T')[0]}): ${authorityLinksAtStartCount}`);
      console.log(`Authority Links NOW: ${currentAuthorityLinksCount}`);
      console.log(`Authority Links GAINED: ${authorityLinksGained}`);
      console.log(`Expected Links Gained: ${expectedLinksGained}`);
      
      // Calculate cost per link and performance percentage
      const costPerAuthorityLink = authorityLinksGained > 0 
        ? investmentData.totalInvestment / authorityLinksGained
        : investmentData.totalInvestment; // If 0 links gained, cost = total investment
        
      const performance = expectedLinksGained > 0 
        ? (authorityLinksGained / expectedLinksGained) * 100 
        : 0;
      
      return {
        authorityLinksGained,
        expectedLinks: expectedLinksGained,
        currentAuthorityLinks: currentAuthorityLinksCount,
        costPerAuthorityLink,
        performance,
        campaignStartDate: campaignStartDate.toISOString(),
        campaignDuration: investmentData.investmentMonths
      };
      
    } catch (error) {
      console.error('Error calculating performance data:', error);
      
      // Fallback calculation if API fails
      const costPerAuthorityLink = investmentData.totalInvestment / Math.max(1, expectedLinksGained);
      
      return {
        authorityLinksGained: 0,
        expectedLinks: expectedLinksGained,
        currentAuthorityLinks: 0,
        costPerAuthorityLink,
        performance: 0,
        campaignStartDate: campaignStartDate.toISOString(),
        campaignDuration: investmentData.investmentMonths
      };
    }
  }

  // Calculate competitive data from competitor analysis
  calculateCompetitiveData(
    clientLinks: DomainData[],
    competitorData: Record<string, DomainData[]>
  ): CompetitiveData {
    
    const clientAuthorityLinks = clientLinks.length;
    const competitorLinkCounts = Object.values(competitorData).map(links => links.length);
    const averageCompetitorLinks = competitorLinkCounts.length > 0 
      ? Math.round(competitorLinkCounts.reduce((sum, count) => sum + count, 0) / competitorLinkCounts.length)
      : 0;
    
    const competitorsBehind = competitorLinkCounts.filter(count => clientAuthorityLinks > count).length;
    const gapPercentage = averageCompetitorLinks > 0 
      ? Math.round(((averageCompetitorLinks - clientAuthorityLinks) / averageCompetitorLinks) * 100)
      : 0;
    
    return {
      clientAuthorityLinks,
      averageCompetitorLinks,
      competitorsBehind,
      gapPercentage
    };
  }

  // Detect red flags based on PRD criteria
  detectRedFlags(
    performanceData: PerformanceData,
    competitiveData: CompetitiveData,
    linkGapData: LinkGapResult[],
    investmentData: InvestmentData
  ): RedFlag[] {
    
    const redFlags: RedFlag[] = [];
    
    // Critical underperformance
    if (investmentData.investmentMonths >= 12 && performanceData.performance < 30) {
      redFlags.push({
        type: 'SEVERE_UNDERPERFORMANCE',
        severity: 'CRITICAL',
        message: `After ${investmentData.investmentMonths} months and $${investmentData.totalInvestment.toLocaleString()} invested, you've gained only ${performanceData.authorityLinksGained} authority links vs ${performanceData.expectedLinks} expected.`,
        impact: 'Your SEO investment is severely underperforming industry benchmarks.',
        recommendation: 'Immediate SEO strategy review required.'
      });
    }
    
    // Massive competitive gap
    if (competitiveData.gapPercentage > 70) {
      redFlags.push({
        type: 'MASSIVE_COMPETITIVE_GAP',
        severity: 'CRITICAL',
        message: `You have ${competitiveData.clientAuthorityLinks} authority links vs competitor average of ${competitiveData.averageCompetitorLinks}.`,
        impact: `You're ${competitiveData.gapPercentage}% behind your direct competitors.`,
        recommendation: 'Aggressive link building campaign needed to catch up.'
      });
    }
    
    // Poor cost efficiency
    if (performanceData.costPerAuthorityLink > 2000) {
      redFlags.push({
        type: 'POOR_COST_EFFICIENCY',
        severity: 'HIGH',
        message: `Each authority link costs $${Math.round(performanceData.costPerAuthorityLink)} vs expected ~$667.`,
        impact: 'You\'re paying 3x industry rates for link building.',
        recommendation: 'SEO provider efficiency review recommended.'
      });
    }
    
    // Excessive missed opportunities
    if (linkGapData.length > 100) {
      redFlags.push({
        type: 'EXCESSIVE_MISSED_OPPORTUNITIES',
        severity: 'HIGH',
        message: `${linkGapData.length} authority domains link to competitors but not you.`,
        impact: 'Significant untapped link building potential identified.',
        recommendation: 'Focus on competitor link gap analysis.'
      });
    }
    
    // Long investment with poor results
    if (investmentData.investmentMonths >= 18 && performanceData.performance < 50) {
      redFlags.push({
        type: 'WASTED_INVESTMENT',
        severity: 'CRITICAL',
        message: `${investmentData.investmentMonths} months invested with minimal progress.`,
        impact: 'Extended timeline suggests fundamental strategy issues.',
        recommendation: 'Complete SEO strategy overhaul needed.'
      });
    }
    
    // No authority links gained (catastrophic)
    if (investmentData.investmentMonths >= 6 && performanceData.authorityLinksGained === 0) {
      redFlags.push({
        type: 'ZERO_AUTHORITY_LINKS',
        severity: 'CRITICAL',
        message: `No authority links gained in ${investmentData.investmentMonths} months.`,
        impact: 'Complete SEO campaign failure detected.',
        recommendation: 'Immediate provider change recommended.'
      });
    }
    
    // High spend with poor results
    if (investmentData.monthlySpend >= 5000 && performanceData.performance < 40) {
      redFlags.push({
        type: 'HIGH_SPEND_POOR_PERFORMANCE',
        severity: 'CRITICAL',
        message: `$${investmentData.monthlySpend.toLocaleString()}/month with ${Math.round(performanceData.performance)}% performance.`,
        impact: 'Premium investment not delivering premium results.',
        recommendation: 'Provider accountability review needed.'
      });
    }
    
    return redFlags;
  }

  // Advanced lead scoring based on PRD formula
  calculateAdvancedLeadScore(
    linkScore: LinkScoreResult,
    investmentData: InvestmentData,
    competitiveData: CompetitiveData,
    redFlags: RedFlag[],
    location: string
  ): LeadScore {
    
    // Priority Score (0-100) - Sales urgency
    let priorityScore = 0;
    
    // Investment level urgency (30 points max)
    if (investmentData.monthlySpend >= 10000) priorityScore += 30;
    else if (investmentData.monthlySpend >= 5000) priorityScore += 25;
    else if (investmentData.monthlySpend >= 3000) priorityScore += 20;
    else if (investmentData.monthlySpend >= 2000) priorityScore += 15;
    else priorityScore += 10;
    
    // Performance crisis (40 points max)
    if (linkScore.overall <= 30) priorityScore += 40;
    else if (linkScore.overall <= 40) priorityScore += 30;
    else if (linkScore.overall <= 50) priorityScore += 20;
    else if (linkScore.overall <= 60) priorityScore += 10;
    
    // Time + money wasted (15 points max)
    if (investmentData.investmentMonths >= 18 && linkScore.overall <= 40) priorityScore += 15;
    else if (investmentData.investmentMonths >= 12 && linkScore.overall <= 50) priorityScore += 10;
    else if (investmentData.investmentMonths >= 6 && linkScore.overall <= 40) priorityScore += 8;
    
    // Critical red flags (15 points max)
    const criticalFlags = redFlags.filter(flag => flag.severity === 'CRITICAL');
    priorityScore += Math.min(criticalFlags.length * 5, 15);
    
    // Potential Score (0-100) - Long-term value
    let potentialScore = 0;
    
    // High spend = high potential (40 points max)
    if (investmentData.monthlySpend >= 10000) potentialScore += 40;
    else if (investmentData.monthlySpend >= 5000) potentialScore += 30;
    else if (investmentData.monthlySpend >= 3000) potentialScore += 20;
    else potentialScore += 10;
    
    // Business success indicators (30 points max)
    if (linkScore.overall >= 80) potentialScore += 30; // Successful business
    else if (linkScore.overall >= 60) potentialScore += 20; // Growing business
    else if (linkScore.overall >= 40) potentialScore += 10; // Potential business
    
    // Market position (20 points max)
    if (competitiveData.averageCompetitorLinks > 0) {
      const marketPosition = competitiveData.clientAuthorityLinks / competitiveData.averageCompetitorLinks;
      if (marketPosition >= 0.8) potentialScore += 20; // Market leader
      else if (marketPosition >= 0.5) potentialScore += 15; // Strong player
      else if (marketPosition >= 0.3) potentialScore += 10; // Challenger
      else potentialScore += 5; // Underdog
    }
    
    // Location value (10 points max)
    const highValueLocations = ['sydney', 'melbourne', 'brisbane', 'perth'];
    if (highValueLocations.includes(location)) potentialScore += 10;
    else potentialScore += 5;
    
    return {
      priority: Math.min(priorityScore, 100),
      potential: Math.min(potentialScore, 100),
      overall: Math.round((priorityScore + potentialScore) / 2)
    };
  }

  // Determine lead type based on scores
  getLeadType(leadScore: LeadScore, linkScore: LinkScoreResult): string {
    if (leadScore.priority >= 70) return 'PRIORITY';
    if (linkScore.overall >= 80) return 'POTENTIAL';
    return 'NURTURE';
  }

  // Determine urgency level
  getUrgency(linkScore: number, priorityScore: number): string {
    if (linkScore <= 40 || priorityScore >= 70) return 'HIGH';
    if (linkScore <= 60 || priorityScore >= 50) return 'MEDIUM';
    return 'LOW';
  }
}

export { LinkScoreCalculator };
export type {
  ClientMetrics,
  CompetitorMetrics,
  LinkScoreResult,
  PerformanceData,
  CompetitiveData,
  InvestmentData,
  RedFlag,
  LeadScore
}; 