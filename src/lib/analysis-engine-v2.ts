// Simplified Analysis Engine v2 - Clean implementation using new DataForSEO client
import { DataForSEOClient, AuthorityDomain, HistoricalMetrics, LinkGap } from './dataforseo-v2';
import type { LinkScoreCalculator, LinkScoreResult } from './link-score';

interface AnalysisInput {
  domain: string;
  keywords: string[];
  location: string;
  monthlySpend: number;
  investmentMonths: number;
  campaignStartDate?: Date;
}

interface AnalysisResult {
  domain: string;
  analysisDate: Date;
  metrics: {
    currentAuthorityLinks: number;
    historicalAuthorityLinks: number;
    linkGrowth: number;
    linkGrowthRate: number;
  };
  competitors: CompetitorAnalysis[];
  linkGaps: LinkGap[];
  linkScore?: LinkScoreResult;
  totalCost: number;
  processingTime: number;
}

interface CompetitorAnalysis {
  domain: string;
  currentAuthorityLinks: number;
  historicalAuthorityLinks: number;
  linkGrowth: number;
  linkGrowthRate: number;
}

export class AnalysisEngineV2 {
  private dataforSeo: DataForSEOClient;
  private linkScoreCalculator?: LinkScoreCalculator;

  constructor(linkScoreCalculator?: LinkScoreCalculator) {
    this.dataforSeo = new DataForSEOClient();
    this.linkScoreCalculator = linkScoreCalculator;
  }

  async runAnalysis(input: AnalysisInput): Promise<AnalysisResult> {
    const startTime = Date.now();
    console.log(`🚀 Starting analysis for ${input.domain}`);
    
    // Reset cost counter
    this.dataforSeo.resetCost();
    
    try {
      // Calculate campaign start date if not provided
      const campaignStartDate = input.campaignStartDate || this.calculateCampaignStartDate(input.investmentMonths);
      const historicalDateStr = campaignStartDate.toISOString().split('T')[0];
      
      // Step 1: Analyze client domain
      console.log('\n📊 Step 1: Analyzing client domain...');
      const clientMetrics = await this.analyzeClientDomain(input.domain, historicalDateStr);
      
      // Step 2: Find and analyze competitors
      console.log('\n🎯 Step 2: Finding and analyzing competitors...');
      const competitors = await this.dataforSeo.findCompetitors(input.keywords, input.location);
      
      // Analyze ALL competitors to get their authority link counts
      console.log(`   Analyzing ${competitors.length} competitors to find top 5 by authority links...`);
      const allCompetitorAnalyses = await this.analyzeCompetitors(competitors, historicalDateStr);
      
      // Take only the top 5 competitors by authority links (already sorted by analyzeCompetitors)
      const topCompetitors = allCompetitorAnalyses.slice(0, 5);
      console.log(`   Top 5 competitors by authority links:`);
      topCompetitors.forEach((comp, i) => {
        console.log(`     ${i + 1}. ${comp.domain} - ${comp.currentAuthorityLinks} authority links`);
      });
      
      // Step 3: Find link gaps using only the top 5 competitors
      console.log('\n🔗 Step 3: Finding link gaps...');
      const topCompetitorDomains = topCompetitors.map(c => c.domain);
      const linkGaps = await this.dataforSeo.findLinkGaps(input.domain, topCompetitorDomains);
      
      // Step 4: Calculate link score if calculator is available
      let linkScore: LinkScoreResult | undefined;
      if (this.linkScoreCalculator) {
        console.log('\n📈 Step 4: Calculating link score...');
        linkScore = await this.calculateLinkScore(input, clientMetrics, topCompetitors);
      }
      
      // Calculate processing time
      const processingTime = Math.round((Date.now() - startTime) / 1000);
      
      const totalCost = this.dataforSeo.getTotalCost();
      console.log(`\n✅ Analysis complete in ${processingTime} seconds (cost: $${totalCost.toFixed(4)})`);
      
      return {
        domain: input.domain,
        analysisDate: new Date(),
        metrics: clientMetrics,
        competitors: topCompetitors,
        linkGaps: linkGaps.slice(0, 50), // Top 50 opportunities
        linkScore,
        totalCost,
        processingTime
      };
      
    } catch (error) {
      console.error('❌ Analysis failed:', error);
      throw error;
    }
  }

  private async analyzeClientDomain(domain: string, historicalDate: string): Promise<{
    currentAuthorityLinks: number;
    historicalAuthorityLinks: number;
    linkGrowth: number;
    linkGrowthRate: number;
  }> {
    // Get current authority links
    const currentLinks = await this.dataforSeo.getCurrentAuthorityDomains(domain);
    const currentCount = currentLinks.length;
    
    // Get historical authority links
    const historicalData = await this.dataforSeo.getHistoricalAuthorityDomains(domain, historicalDate);
    const historicalCount = historicalData.total_authority_domains;
    
    // Calculate growth metrics
    const linkGrowth = currentCount - historicalCount;
    const linkGrowthRate = historicalCount > 0 ? (linkGrowth / historicalCount) * 100 : 0;
    
    console.log(`   Client: ${currentCount} current, ${historicalCount} historical, ${linkGrowth} gained (${linkGrowthRate.toFixed(1)}% growth)`);
    
    return {
      currentAuthorityLinks: currentCount,
      historicalAuthorityLinks: historicalCount,
      linkGrowth,
      linkGrowthRate
    };
  }

  private async analyzeCompetitors(
    competitors: string[], 
    historicalDate: string
  ): Promise<CompetitorAnalysis[]> {
    const analyses: CompetitorAnalysis[] = [];
    
    for (const competitor of competitors) {
      try {
        console.log(`   Analyzing ${competitor}...`);
        
        // Get current authority links
        const currentLinks = await this.dataforSeo.getCurrentAuthorityDomains(competitor);
        const currentCount = currentLinks.length;
        
        // Get actual historical authority domains (not estimates!)
        const historicalData = await this.dataforSeo.getHistoricalAuthorityDomains(competitor, historicalDate);
        const historicalCount = historicalData.total_authority_domains;
        
        // Calculate growth
        const linkGrowth = currentCount - historicalCount;
        const linkGrowthRate = historicalCount > 0 ? (linkGrowth / historicalCount) * 100 : 0;
        
        analyses.push({
          domain: competitor,
          currentAuthorityLinks: currentCount,
          historicalAuthorityLinks: historicalCount,
          linkGrowth,
          linkGrowthRate
        });
        
        console.log(`     → ${currentCount} current, ${historicalCount} historical, ${linkGrowth} gained (${linkGrowthRate.toFixed(1)}% growth)`);
        
      } catch (error) {
        console.warn(`   Failed to analyze ${competitor}:`, error);
        // Continue with other competitors
      }
    }
    
    // Sort by current authority links (descending)
    return analyses.sort((a, b) => b.currentAuthorityLinks - a.currentAuthorityLinks);
  }

  private async calculateLinkScore(
    input: AnalysisInput,
    clientMetrics: any,
    competitorAnalyses: CompetitorAnalysis[]
  ): Promise<LinkScoreResult> {
    if (!this.linkScoreCalculator) {
      throw new Error('Link score calculator not available');
    }
    
    // Prepare metrics for link score calculation
    const clientMetricsForScore = {
      authorityLinksStart: clientMetrics.historicalAuthorityLinks,
      authorityLinksNow: clientMetrics.currentAuthorityLinks,
      authorityLinksGained: clientMetrics.linkGrowth,
      authorityLinksExpected: Math.floor((input.monthlySpend * input.investmentMonths) / 667), // Industry benchmark
      monthlySpend: input.monthlySpend,
      campaignMonths: input.investmentMonths,
      totalInvestment: input.monthlySpend * input.investmentMonths,
      costPerLink: clientMetrics.linkGrowth > 0 
        ? (input.monthlySpend * input.investmentMonths) / clientMetrics.linkGrowth 
        : 0,
      linkVelocity: clientMetrics.linkGrowth / input.investmentMonths
    };
    
    const competitorMetricsForScore = competitorAnalyses.map(comp => ({
      domain: comp.domain,
      authorityLinksStart: comp.historicalAuthorityLinks,
      authorityLinksNow: comp.currentAuthorityLinks,
      authorityLinksGained: comp.linkGrowth,
      gapToClient: comp.currentAuthorityLinks - clientMetrics.currentAuthorityLinks,
      linkVelocity: comp.linkGrowth / input.investmentMonths
    }));
    
    // Calculate performance data
    const performanceData = {
      currentAuthorityLinks: clientMetrics.currentAuthorityLinks,
      historicalAuthorityLinks: clientMetrics.historicalAuthorityLinks,
      linkGrowth: clientMetrics.linkGrowth,
      linkVelocity: clientMetrics.linkGrowth / input.investmentMonths,
      costPerLink: clientMetricsForScore.costPerLink,
      roi: 0 // Would need revenue data to calculate
    };
    
    // Calculate competitive data
    const avgCompetitorGrowth = competitorAnalyses.reduce((sum, comp) => sum + comp.linkGrowth, 0) / competitorAnalyses.length;
    const competitiveData = {
      marketShare: this.calculateMarketShare(clientMetrics.currentAuthorityLinks, competitorAnalyses),
      competitorAvgGrowth: avgCompetitorGrowth,
      relativePerformance: avgCompetitorGrowth > 0 ? clientMetrics.linkGrowth / avgCompetitorGrowth : 0,
      marketPosition: this.calculateMarketPosition(clientMetrics.currentAuthorityLinks, competitorAnalyses),
      topCompetitorGap: competitorAnalyses[0]?.currentAuthorityLinks - clientMetrics.currentAuthorityLinks || 0
    };
    
    // Calculate investment data
    const investmentData = {
      monthlySpend: input.monthlySpend,
      investmentMonths: input.investmentMonths,
      totalInvestment: input.monthlySpend * input.investmentMonths,
      spendRange: '', // Not provided in simplified version
      durationRange: '' // Not provided in simplified version
    };
    
    // Use the link score calculator
    return this.linkScoreCalculator.calculateLinkScore(
      clientMetricsForScore,
      competitorMetricsForScore
    );
  }

  private calculateCampaignStartDate(investmentMonths: number): Date {
    const date = new Date();
    date.setMonth(date.getMonth() - investmentMonths);
    return date;
  }

  private calculateMarketShare(clientLinks: number, competitors: CompetitorAnalysis[]): number {
    const totalMarketLinks = clientLinks + competitors.reduce((sum, comp) => sum + comp.currentAuthorityLinks, 0);
    return totalMarketLinks > 0 ? (clientLinks / totalMarketLinks) * 100 : 0;
  }

  private calculateMarketPosition(clientLinks: number, competitors: CompetitorAnalysis[]): number {
    const allDomains = [
      { links: clientLinks },
      ...competitors.map(c => ({ links: c.currentAuthorityLinks }))
    ].sort((a, b) => b.links - a.links);
    
    const position = allDomains.findIndex(d => d.links === clientLinks) + 1;
    return position;
  }
}

// Export for use in other files
export type { AnalysisInput, AnalysisResult, CompetitorAnalysis }; 