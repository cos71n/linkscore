import { DomainData, LinkGapResult } from './dataforseo';

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

interface InvestmentData {
  monthlySpend: number;
  investmentMonths: number;
  totalInvestment: number;
  spendRange: string;
  durationRange: string;
}

interface LinkScoreResult {
  overall: number;
  performance: number;
  competitive: number;
  opportunity: number;
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

class LinkScoreCalculator {
  
  // Calculate LinkScore using exact PRD formula
  calculateLinkScore(
    performanceData: PerformanceData,
    competitiveData: CompetitiveData,
    linkGapData: LinkGapResult[]
  ): LinkScoreResult {
    
    // Performance Score (40% weight)
    const performanceScore = this.calculatePerformanceScore(
      performanceData.authorityLinksGained,
      performanceData.expectedLinks
    );
    
    // Competitive Score (35% weight)
    const competitiveScore = this.calculateCompetitiveScore(
      competitiveData.clientAuthorityLinks,
      competitiveData.averageCompetitorLinks
    );
    
    // Opportunity Score (25% weight)
    const opportunityScore = this.calculateOpportunityScore(linkGapData.length);
    
    // Final weighted score
    const finalScore = (performanceScore * 0.40) + (competitiveScore * 0.35) + (opportunityScore * 0.25);
    
    return {
      overall: Math.round(finalScore * 10) / 10,
      performance: performanceScore,
      competitive: competitiveScore,
      opportunity: opportunityScore
    };
  }

  private calculatePerformanceScore(actual: number, expected: number): number {
    if (expected === 0) return 5; // Neutral score if no expected baseline
    
    const percentage = (actual / expected) * 100;
    if (percentage >= 80) return 10;
    if (percentage >= 60) return 8;
    if (percentage >= 40) return 6;
    if (percentage >= 20) return 4;
    return 2;
  }

  private calculateCompetitiveScore(clientLinks: number, competitorAverage: number): number {
    if (competitorAverage === 0) return 5; // Neutral if no competitors
    
    const ratio = clientLinks / competitorAverage;
    if (ratio >= 0.8) return 10;
    if (ratio >= 0.6) return 8;
    if (ratio >= 0.4) return 6;
    if (ratio >= 0.2) return 4;
    return 2;
  }

  private calculateOpportunityScore(totalGaps: number): number {
    // Inverse scoring - fewer gaps = better score
    if (totalGaps <= 10) return 10;
    if (totalGaps <= 25) return 8;
    if (totalGaps <= 50) return 6;
    if (totalGaps <= 100) return 4;
    return 2;
  }

  // Calculate expected authority links based on investment DURING the campaign period
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
    if (linkScore.overall <= 3) priorityScore += 40;
    else if (linkScore.overall <= 4) priorityScore += 30;
    else if (linkScore.overall <= 5) priorityScore += 20;
    else if (linkScore.overall <= 6) priorityScore += 10;
    
    // Time + money wasted (15 points max)
    if (investmentData.investmentMonths >= 18 && linkScore.overall <= 4) priorityScore += 15;
    else if (investmentData.investmentMonths >= 12 && linkScore.overall <= 5) priorityScore += 10;
    else if (investmentData.investmentMonths >= 6 && linkScore.overall <= 4) priorityScore += 8;
    
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
    if (linkScore.overall >= 8) potentialScore += 30; // Successful business
    else if (linkScore.overall >= 6) potentialScore += 20; // Growing business
    else if (linkScore.overall >= 4) potentialScore += 10; // Potential business
    
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
    if (linkScore.overall >= 8) return 'POTENTIAL';
    return 'NURTURE';
  }

  // Determine urgency level
  getUrgency(linkScore: number, priorityScore: number): string {
    if (linkScore <= 4 || priorityScore >= 70) return 'HIGH';
    if (linkScore <= 6 || priorityScore >= 50) return 'MEDIUM';
    return 'LOW';
  }
}

export { LinkScoreCalculator };
export type {
  PerformanceData,
  CompetitiveData,
  InvestmentData,
  LinkScoreResult,
  RedFlag,
  LeadScore
}; 