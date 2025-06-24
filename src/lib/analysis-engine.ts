import { prisma } from './database';
import { RobustAPIClient, DomainData, LinkGapResult, AUTHORITY_CRITERIA, AUSTRALIAN_LOCATIONS } from './dataforseo';
import { 
  LinkScoreCalculator, 
  ClientMetrics,
  CompetitorMetrics,
  PerformanceData, 
  CompetitiveData, 
  InvestmentData, 
  LinkScoreResult, 
  RedFlag, 
  LeadScore 
} from './link-score';
import { validateAndSanitizeInput, logSecurityEvent, UserInput } from './security/validation';
import { encryptEmail, hashPhone } from './security/encryption';

interface FormData extends UserInput {
  monthlySpend: number;
  investmentMonths: number;
}

interface AnalysisResult {
  id: string;
  linkScore: LinkScoreResult;
  performanceData: PerformanceData;
  competitiveData: CompetitiveData;
  linkGaps: LinkGapResult[];
  redFlags: RedFlag[];
  leadScore: LeadScore;
  competitors: string[];
  competitorHistoricalData: Record<string, { 
    current: number, 
    historical: number, 
    gained: number 
  }>;
  processingTime: number;
  cost: number;
}

interface AnalysisProgress {
  step: string;
  message: string;
  percentage: number;
  personalized?: boolean;
  data?: {
    keywords?: string[];
    location?: string;
    competitors?: string[];
    domain?: string;
    currentActivity?: string;
    metrics?: Record<string, any>;
  };
}

interface ProgressTracker {
  analysisId: string;
  lastUpdate: Date;
  currentProgress: AnalysisProgress;
  isCancelled: boolean;
}

// In-memory progress storage to reduce database calls
const progressCache = new Map<string, ProgressTracker>();

class AnalysisEngine {
  private apiClient: RobustAPIClient;
  private calculator: LinkScoreCalculator;

  constructor() {
    console.log('🔧 Initializing AnalysisEngine...');
    this.apiClient = new RobustAPIClient();
    this.calculator = new LinkScoreCalculator();
    console.log('✅ AnalysisEngine initialized successfully');
  }

  private get shouldBypassCache(): boolean {
    const bypass = process.env.BYPASS_TRAFFIC_CACHE === 'true';
    if (bypass) {
      console.log('🔄 Traffic cache bypass enabled via BYPASS_TRAFFIC_CACHE environment variable');
    }
    return bypass;
  }

  async performAnalysis(formData: FormData, request: Request, existingAnalysisId?: string): Promise<AnalysisResult> {
    const startTime = Date.now();
    let analysisId = existingAnalysisId;
    
    // Add overall timeout to prevent infinite hanging
    const ANALYSIS_TIMEOUT = 5 * 60 * 1000; // 5 minutes timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Analysis timeout after ${ANALYSIS_TIMEOUT / 1000} seconds`));
      }, ANALYSIS_TIMEOUT);
    });
    
    try {
      console.log('🚀 performAnalysis started for analysis:', existingAnalysisId);
      console.log('📋 Form data keys:', Object.keys(formData));
      console.log('⏰ Analysis timeout set for', ANALYSIS_TIMEOUT / 1000, 'seconds');
      
      // Check critical environment variables
      console.log('🔍 Checking environment variables...');
      const hasDataForSEO = !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
      const hasDatabase = !!process.env.DATABASE_URL;
      console.log('📊 Environment check:', { 
        hasDataForSEO, 
        hasDatabase,
        nodeEnv: process.env.NODE_ENV 
      });
      
      if (!hasDataForSEO) {
        throw new Error('DataForSEO credentials not found in environment variables');
      }
      
      if (!hasDatabase) {
        throw new Error('Database URL not found in environment variables');
      }
      
      // Extract IP address from request with proper fallback
      console.log('🌐 Extracting IP address...');
      const ipAddress = this.extractIPAddress(request);
      console.log('✅ IP address extracted:', ipAddress);
      
      // Extract UserInput fields from FormData for validation
      console.log('📝 Creating user input object...');
      const userInput: UserInput = {
        domain: formData.domain,
        email: formData.email,
        firstName: formData.firstName,
        phone: formData.phone,
        company: formData.company,
        location: formData.location,
        spendRange: formData.spendRange,
        durationRange: formData.durationRange,
        keywords: formData.keywords
      };
      console.log('✅ User input object created');
      
      // Step 1: Validate and sanitize input
      console.log('🔒 Starting input validation and sanitization...');
      const sanitizedData = await validateAndSanitizeInput(userInput, ipAddress);
      console.log('✅ Input validation and sanitization complete');
      
      // Merge monthly spend and investment months into sanitized data
      console.log('🔧 Merging sanitized data with form data...');
      const completeData: FormData = {
        ...sanitizedData,
        monthlySpend: formData.monthlySpend,
        investmentMonths: formData.investmentMonths
      };
      console.log('✅ Data merge complete');
      
      // Step 2: Create user and analysis records (if not already created)
      let userId: string;
      if (!analysisId) {
        console.log('💾 Creating new analysis records...');
        const records = await this.createAnalysisRecords(completeData, request);
        userId = records.userId;
        analysisId = records.analysisId;
        console.log('✅ Analysis records created:', { userId, analysisId });
      } else {
        console.log('🔍 Using existing analysis, fetching user ID...');
        // Get user ID from existing analysis
        const analysis = await prisma.analysis.findUnique({
          where: { id: analysisId },
          select: { userId: true }
        });
        if (!analysis) {
          throw new Error('Analysis not found');
        }
        userId = analysis.userId;
        console.log('✅ User ID retrieved:', userId);
      }
      
      // Step 3: Perform the analysis with progress tracking (with timeout)
      console.log('⚡ Starting analysis execution...');
      
      // Update progress immediately to show the background process is running
      await this.updateAnalysisProgress(analysisId, {
        step: 'initialization',
        message: 'Background analysis process started successfully',
        percentage: 1,
        personalized: true,
        data: {
          currentActivity: 'Initializing analysis engine'
        }
      });
      
      const analysisPromise = this.executeAnalysis(completeData, analysisId, userId);
      const result = await Promise.race([analysisPromise, timeoutPromise]);
      console.log('✅ Analysis execution complete');
      
      // Step 4: Calculate processing time and finalize
      console.log('🏁 Finalizing analysis...');
      const processingTime = Math.round((Date.now() - startTime) / 1000);
      await this.finalizeAnalysis(analysisId, result, processingTime);
      console.log('✅ Analysis finalized in', processingTime, 'seconds');
      
      return {
        ...result,
        id: analysisId,
        processingTime
      };
      
    } catch (error: any) {
      console.error('❌ Analysis failed with error:', error.name, error.message);
      console.error('❌ Error stack:', error.stack);
      console.error('❌ Analysis ID at failure:', analysisId);
      
      if (analysisId) {
        console.log('🔧 Handling analysis error for ID:', analysisId);
        try {
          await this.handleAnalysisError(analysisId, error, formData);
          console.log('✅ Analysis error handled successfully');
        } catch (handleError) {
          console.error('❌ Failed to handle analysis error:', handleError);
          // Still try to update the analysis status to failed
          try {
            await prisma.analysis.update({
              where: { id: analysisId },
              data: {
                status: 'failed',
                errorMessage: error.message || 'Analysis failed unexpectedly'
              }
            });
            console.log('✅ Analysis status updated to failed as fallback');
          } catch (updateError) {
            console.error('❌ Failed to update analysis status:', updateError);
          }
        }
      }
      
      throw error;
    }
  }

  private extractIPAddress(request: Request): string {
    // Try various headers for IP address
    const possibleIPs = [
      request.headers.get('cf-connecting-ip'),
      request.headers.get('x-forwarded-for'),
      request.headers.get('x-real-ip'),
      request.headers.get('x-client-ip')
    ];
    
    for (const ip of possibleIPs) {
      if (ip) {
        // Handle comma-separated IPs (x-forwarded-for can have multiple)
        const cleanIP = ip.split(',')[0].trim();
        if (this.isValidIP(cleanIP)) {
          return cleanIP;
        }
      }
    }
    
    // Return localhost as fallback for development/testing
    return '127.0.0.1';
  }

  private isValidIP(ip: string): boolean {
    // Basic IP validation
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }

  private async createAnalysisRecords(formData: FormData, request: Request) {
    const ipAddress = this.extractIPAddress(request);
    const userAgent = request.headers.get('user-agent') || '';
    
    // Create user record
    const user = await this.createUser({
      email: formData.email,
      firstName: formData.firstName,
      phone: formData.phone,
      domain: formData.domain,
      company: formData.company,
      location: formData.location,
      ip: ipAddress,
      userAgent
    });
    
    // Create analysis record
    const investmentData: InvestmentData = {
      monthlySpend: formData.monthlySpend,
      investmentMonths: formData.investmentMonths,
      totalInvestment: formData.monthlySpend * formData.investmentMonths,
      spendRange: formData.spendRange,
      durationRange: formData.durationRange
    };
    
    const campaignStartDate = new Date();
    campaignStartDate.setMonth(campaignStartDate.getMonth() - formData.investmentMonths);
    
    const analysis = await prisma.analysis.create({
      data: {
        userId: user.id,
        monthlySpend: formData.monthlySpend,
        investmentMonths: formData.investmentMonths,
        spendRange: formData.spendRange,
        durationRange: formData.durationRange,
        campaignStartDate,
        targetKeywords: formData.keywords,
        linkScore: 0, // Will be updated
        performanceScore: 0,
        competitiveScore: 0,
        opportunityScore: 0,
        priorityScore: 0,
        potentialScore: 0,
        status: 'processing'
      }
    });
    
    return { userId: user.id, analysisId: analysis.id };
  }

  // Smart cancellation check with caching to reduce database calls
  private async checkForCancellation(analysisId: string, forceCheck: boolean = false): Promise<boolean> {
    try {
      // Check in-memory cache first (avoids database call)
      const cached = progressCache.get(analysisId);
      if (cached?.isCancelled) {
        console.log(`Analysis ${analysisId} has been cancelled (cached), stopping execution`);
        return true;
      }
      
      // Only check database at strategic points or if forced
      const now = new Date();
      const shouldCheckDB = forceCheck || 
        !cached || 
        (now.getTime() - cached.lastUpdate.getTime()) > 30000; // Check DB max every 30 seconds
      
      if (shouldCheckDB) {
        const analysis = await prisma.analysis.findUnique({
          where: { id: analysisId },
          select: { status: true }
        });
        
        if (analysis?.status === 'cancelled') {
          console.log(`Analysis ${analysisId} has been cancelled, stopping execution`);
          // Update cache
          if (cached) {
            cached.isCancelled = true;
          }
          return true;
        }
        
        // Update cache with fresh status
        if (cached) {
          cached.lastUpdate = now;
          cached.isCancelled = false;
        }
      }
      
      return false;
    } catch (error) {
      console.warn('Failed to check cancellation status:', error);
      return false; // Continue analysis if we can't check status
    }
  }

  private async executeAnalysis(formData: FormData, analysisId: string, userId: string): Promise<Omit<AnalysisResult, 'id' | 'processingTime'>> {
    console.log('🎯 executeAnalysis started for:', { analysisId, userId, domain: formData.domain });
    
    const progressCallback = (progress: AnalysisProgress) => {
      console.log('📊 Progress update:', progress);
      this.updateAnalysisProgress(analysisId, progress);
    };
    
    console.log('🗺️ Looking up location name for:', formData.location);
    const locationName = AUSTRALIAN_LOCATIONS[formData.location as keyof typeof AUSTRALIAN_LOCATIONS]?.name || formData.location;
    console.log('✅ Location name resolved:', locationName);
    
    // Step 1: Find competitors
    progressCallback({ 
      step: 'competitors', 
      message: `Searching for competitors using "${formData.keywords.join(', ')}" in ${locationName}...`, 
      percentage: 10,
      personalized: true,
      data: {
        keywords: formData.keywords,
        location: locationName,
        domain: formData.domain,
        currentActivity: 'Finding competitors in your market'
      }
    });
    
    // CHECKPOINT 1: Check for cancellation before starting major work
    if (await this.checkForCancellation(analysisId, true)) {
      throw new Error('Analysis cancelled by user');
    }
    
    let competitors: string[];
    try {
      competitors = await this.apiClient.getCompetitors(formData.keywords, formData.location, formData.domain);
    } catch (error: any) {
      console.warn('Competitor search failed, using fallback approach:', error.message);
      
      // Update progress to show fallback is being used
      progressCallback({ 
        step: 'competitors_fallback', 
        message: `Using fallback competitor data due to API timeout`, 
        percentage: 12,
        personalized: true,
        data: {
          keywords: formData.keywords,
          location: locationName,
          currentActivity: 'Using fallback competitor analysis'
        }
      });
      
      // Use smaller, more manageable Australian competitors as fallback (avoid massive domains)
      competitors = ['bunnings.com.au', 'officeworks.com.au', 'jbhifi.com.au', 'woolworths.com.au', 'coles.com.au'];
    }
    
    // Remove excessive cancellation check - keep analysis moving
    
    // Show competitors found
    progressCallback({ 
      step: 'competitors_found', 
      message: `Found ${competitors.length} competitors: ${competitors.slice(0, 3).join(', ')}${competitors.length > 3 ? ` and ${competitors.length - 3} more` : ''}`, 
      percentage: 15,
      personalized: true,
      data: {
        competitors: competitors.slice(0, 5), // Show first 5
        currentActivity: 'Selecting strongest competitors'
      }
    });
    
    // Step 2: Analyze client domain
    progressCallback({ 
      step: 'client_analysis', 
      message: `Analyzing ${formData.domain} authority links...`, 
      percentage: 25,
      personalized: true,
      data: {
        domain: formData.domain,
        currentActivity: 'Counting your authority backlinks'
      }
    });
    
        // CHECKPOINT 2: Check for cancellation before major API work (client analysis)
    if (await this.checkForCancellation(analysisId)) {
      throw new Error('Analysis cancelled by user');
    }

    const clientLinks = await this.apiClient.getAuthorityReferringDomains(formData.domain);
    
    progressCallback({ 
      step: 'client_analysis_complete', 
      message: `Found ${clientLinks.length} authority links for ${formData.domain}`, 
      percentage: 30,
      personalized: true,
      data: {
        domain: formData.domain,
        metrics: { authorityLinks: clientLinks.length },
        currentActivity: 'Authority links analysis complete'
      }
    });
    
    // Step 3: Analyze competitors (current + historical)
    const competitorData: Record<string, DomainData[]> = {};
    const competitorHistoricalData: Record<string, { 
      current: number, 
      historical: number, 
      gained: number 
    }> = {};
    
    // Calculate campaign start date for historical analysis
    const campaignStartDate = new Date();
    campaignStartDate.setMonth(campaignStartDate.getMonth() - formData.investmentMonths);
    const campaignStartDateStr = campaignStartDate.toISOString().replace('T', ' ').substring(0, 19) + ' +00:00';
    
    // Analyze ALL competitors found
    const competitorPerformance: Array<{
      competitor: string,
      gained: number,
      current: number,
      historical: number
    }> = [];
    
    let competitorIndex = 0;
    for (const competitor of competitors) {
      // CHECKPOINT 3: Only check cancellation every few competitors (reduce DB calls)
      if (competitorIndex === 0 || competitorIndex % 3 === 0) {
        if (await this.checkForCancellation(analysisId)) {
          throw new Error('Analysis cancelled by user');
        }
      }
      
      const progressPercent = 35 + (competitorIndex / competitors.length) * 25; // 35% to 60%
      
      progressCallback({ 
        step: 'competitor_analysis', 
        message: `Analyzing competitor ${competitorIndex + 1}/${competitors.length}: ${competitor}`, 
        percentage: progressPercent,
        personalized: true,
        data: {
          competitors: [competitor],
          currentActivity: `Counting authority links for ${competitor}`,
          metrics: { 
            competitorIndex: competitorIndex + 1, 
            totalCompetitors: competitors.length 
          }
        }
      });
      
      try {
        // Add individual timeout for each competitor analysis (30 seconds max)
        const competitorAnalysisPromise = this.analyzeCompetitorWithTimeout(competitor, campaignStartDateStr);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Competitor analysis timeout after 30 seconds for ${competitor}`));
          }, 30000);
        });
        
        const competitorResult = await Promise.race([competitorAnalysisPromise, timeoutPromise]);
        
        // Process the results
        competitorData[competitor] = competitorResult.domains;
        competitorHistoricalData[competitor] = {
          current: competitorResult.currentCount,
          historical: competitorResult.historicalCount,
          gained: competitorResult.gained
        };
        
        // Track performance for ranking
        competitorPerformance.push({
          competitor,
          gained: competitorResult.gained,
          current: competitorResult.currentCount,
          historical: competitorResult.historicalCount
        });
        
        // Show competitor results
        progressCallback({ 
          step: 'competitor_result', 
          message: `${competitor}: ${competitorResult.currentCount} authority links (+${competitorResult.gained} gained over ${formData.investmentMonths} months)`, 
          percentage: progressPercent + 2,
          personalized: true,
          data: {
            competitors: [competitor],
            currentActivity: 'Competitor analysis complete',
            metrics: { 
              authorityLinks: competitorResult.currentCount,
              linksGained: competitorResult.gained,
              timeframe: formData.investmentMonths
            }
          }
        });
        
        console.log(`Competitor ${competitor}: ${competitorResult.historicalCount} → ${competitorResult.currentCount} = +${competitorResult.gained} authority links gained`);
        
      } catch (error) {
        // Check if error is due to cancellation
        if (error instanceof Error && error.message.includes('cancelled')) {
          throw error;
        }
        
        console.warn(`Failed to analyze competitor: ${competitor}`, error);
        competitorData[competitor] = []; // Continue with empty data
        
        // Set fallback data to avoid display errors
        competitorHistoricalData[competitor] = {
          current: 0,
          historical: 0,
          gained: 0
        };
        
        // Still track for ranking (will be at bottom)
        competitorPerformance.push({
          competitor,
          gained: 0,
          current: 0,
          historical: 0
        });
      }
      
      competitorIndex++;
    }
    
    // Remove excessive cancellation check - keep analysis moving
    
    // Rank competitors by authority links gained (descending) and select top 5
    const topPerformers = competitorPerformance
      .sort((a, b) => b.gained - a.gained) // Sort by gained (highest first)
      .slice(0, 5) // Select top 5 performers
      .map(p => p.competitor);
    
    progressCallback({ 
      step: 'competitors_ranked', 
      message: `Top performers identified: ${topPerformers.slice(0, 3).join(', ')}`, 
      percentage: 65,
      personalized: true,
      data: {
        competitors: topPerformers,
        currentActivity: 'Selecting strongest competitors for comparison',
        metrics: { 
          topPerformersCount: topPerformers.length,
          totalAnalyzed: competitors.length
        }
      }
    });
    
    console.log(`🏆 Top 5 performing competitors by authority links gained:`);
    competitorPerformance
      .slice(0, 5)
      .forEach((comp, index) => {
        console.log(`  ${index + 1}. ${comp.competitor}: +${comp.gained} authority links gained`);
      });
    
    // Filter data to only include top performers
    const topCompetitorData: Record<string, DomainData[]> = {};
    const topCompetitorHistoricalData: Record<string, { 
      current: number, 
      historical: number, 
      gained: number 
    }> = {};
    
    for (const competitor of topPerformers) {
      topCompetitorData[competitor] = competitorData[competitor];
      topCompetitorHistoricalData[competitor] = competitorHistoricalData[competitor];
    }
    
    // Step 4: Find link gaps
    progressCallback({ 
      step: 'link_gaps', 
      message: `Finding high-authority domains linking to competitors but not ${formData.domain}...`, 
      percentage: 75,
      personalized: true,
      data: {
        domain: formData.domain,
        competitors: topPerformers.slice(0, 3),
        currentActivity: 'Discovering link opportunities'
      }
    });
    
    const linkGaps = await this.apiClient.findLinkGaps(formData.domain, topPerformers);
    
    progressCallback({ 
      step: 'link_gaps_found', 
      message: `Discovered ${linkGaps.length} link opportunities from high-authority domains`, 
      percentage: 80,
      personalized: true,
      data: {
        currentActivity: 'Link gap analysis complete',
        metrics: { 
          linkOpportunities: linkGaps.length,
          highPriorityOpportunities: linkGaps.filter(gap => gap.rank >= 50).length
        }
      }
    });
    
    // Step 5: Calculate all scores
    progressCallback({ 
      step: 'scoring', 
      message: 'Calculating your LinkScore based on performance vs competitors...', 
      percentage: 90,
      data: {
        currentActivity: 'Final score calculation'
      }
    });
    
    // CHECKPOINT 4: Final cancellation check before scoring (final stage)
    if (await this.checkForCancellation(analysisId)) {
      throw new Error('Analysis cancelled by user');
    }
    
    const investmentData: InvestmentData = {
      monthlySpend: formData.monthlySpend,
      investmentMonths: formData.investmentMonths,
      totalInvestment: formData.monthlySpend * formData.investmentMonths,
      spendRange: formData.spendRange,
      durationRange: formData.durationRange
    };
    
    const performanceData = await this.calculator.calculatePerformanceData(this.apiClient, formData.domain, investmentData, this.shouldBypassCache);
    const competitiveData = this.calculator.calculateCompetitiveData(clientLinks, topCompetitorData);
    
    // Convert data to new format for comprehensive LinkScore calculation
    const clientData: ClientMetrics = {
      authorityLinksStart: performanceData.currentAuthorityLinks - performanceData.authorityLinksGained,
      authorityLinksNow: performanceData.currentAuthorityLinks,
      authorityLinksGained: performanceData.authorityLinksGained,
      authorityLinksExpected: performanceData.expectedLinks,
      monthlySpend: formData.monthlySpend,
      campaignMonths: formData.investmentMonths,
      totalInvestment: investmentData.totalInvestment,
      costPerLink: performanceData.costPerAuthorityLink,
      linkVelocity: performanceData.authorityLinksGained / Math.max(1, performanceData.campaignDuration)
    };
    
    // Convert competitor data to new format
    const competitorMetrics: CompetitorMetrics[] = topPerformers.map(competitor => {
      const historicalData = topCompetitorHistoricalData[competitor];
      return {
        domain: competitor,
        authorityLinksStart: historicalData?.historical || 0,
        authorityLinksNow: historicalData?.current || 0,
        authorityLinksGained: historicalData?.gained || 0,
        gapToClient: (historicalData?.current || 0) - clientData.authorityLinksNow,
        linkVelocity: (historicalData?.gained || 0) / Math.max(1, formData.investmentMonths)
      };
    });
    
    // Calculate comprehensive LinkScore using new algorithm
    console.log('🎯 USING NEW COMPREHENSIVE ALGORITHM:');
    console.log('Client Data:', JSON.stringify(clientData, null, 2));
    console.log('Competitor Metrics:', JSON.stringify(competitorMetrics, null, 2));
    
    const linkScore = this.calculator.calculateLinkScore(clientData, competitorMetrics);
    
    console.log('✅ NEW ALGORITHM RESULT:', JSON.stringify(linkScore, null, 2));
    const redFlags = this.calculator.detectRedFlags(performanceData, competitiveData, linkGaps, investmentData);
    const leadScore = this.calculator.calculateAdvancedLeadScore(linkScore, investmentData, competitiveData, redFlags, formData.location);
    
    progressCallback({ 
      step: 'scoring_complete', 
      message: `LinkScore calculated: ${linkScore.overall}/100 (${linkScore.interpretation.grade}) - Analysis complete!`, 
      percentage: 95,
      personalized: true,
      data: {
        currentActivity: 'Analysis complete',
        metrics: { 
          linkScore: linkScore.overall,
          grade: linkScore.interpretation.grade,
          expectedLinks: performanceData.expectedLinks,
          actualLinks: performanceData.authorityLinksGained
        }
      }
    });
    
    // Estimate API cost (approximate)
    const apiCalls = 1 + competitors.length + 1; // client + competitors + link gaps
    const estimatedCost = apiCalls * 0.22; // $0.22 per call estimate
    
    return {
      linkScore,
      performanceData,
      competitiveData,
      linkGaps,
      redFlags,
      leadScore,
      competitors: topPerformers,
      competitorHistoricalData: topCompetitorHistoricalData,
      cost: estimatedCost
    };
  }

  private async finalizeAnalysis(analysisId: string, result: Omit<AnalysisResult, 'id' | 'processingTime'>, processingTime: number) {
    console.log(`🏁 Finalizing analysis ${analysisId} with raw SQL approach...`);
    
    // Use raw SQL to bypass prepared statement issues in Supabase connection pooler
    const retryAttempts = 3;
    let lastError: any;
    
    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        console.log(`📝 Attempt ${attempt}/${retryAttempts} to finalize analysis ${analysisId}`);
        
        // CRITICAL FIX: Properly serialize all JSON data for JSONB columns
        const competitorsJson = JSON.stringify(result.competitors);
        const linkGapDataJson = JSON.stringify(result.linkGaps.slice(0, 50)); // Store top 50 opportunities  
        const redFlagsJson = JSON.stringify(result.redFlags);
        const historicalDataJson = JSON.stringify(result.competitorHistoricalData);
        
        // Execute raw SQL update to bypass Prisma's prepared statements
        await prisma.$queryRawUnsafe(`
          UPDATE analyses SET
            link_score = $1,
            performance_score = $2,
            competitive_score = $3,
            opportunity_score = $4,
            priority_score = $5,
            potential_score = $6,
            authority_links_gained = $7,
            expected_links = $8,
            current_authority_links = $9,
            competitor_average_links = $10,
            link_gaps_total = $11,
            link_gaps_high_priority = $12,
            cost_per_authority_link = $13,
            competitors = $14::jsonb,
            link_gap_data = $15::jsonb,
            red_flags = $16::jsonb,
            historical_data = $17::jsonb,
            processing_time_seconds = $18,
            dataforseo_cost_usd = $19,
            status = $20,
            completed_at = $21
          WHERE id = $22::uuid
        `,
          result.linkScore.overall,                              // Overall LinkScore (number)
          result.linkScore.breakdown.performanceVsExpected,      // Performance component
          result.linkScore.breakdown.competitivePosition,        // Competitive component  
          result.linkScore.breakdown.velocityComparison,         // Velocity component
          result.leadScore.priority,                            // Priority score
          result.leadScore.potential,                           // Potential score
          result.performanceData.authorityLinksGained,          // Links gained
          result.performanceData.expectedLinks,                 // Expected links
          result.performanceData.currentAuthorityLinks,         // Current links
          result.competitiveData.averageCompetitorLinks,        // Competitor average
          result.linkGaps.length,                               // Total opportunities
          result.linkGaps.filter(gap => gap.rank >= 50).length, // High-priority opportunities
          result.performanceData.costPerAuthorityLink,          // Cost per link
          competitorsJson,      // Properly serialized JSON
          linkGapDataJson,      // Properly serialized JSON
          redFlagsJson,         // Properly serialized JSON
          historicalDataJson,   // Properly serialized JSON
          processingTime,
          result.cost,                                          // DataForSEO cost
          'completed',
          new Date(),
          analysisId
        );
        
        console.log(`✅ Analysis ${analysisId} finalized successfully on attempt ${attempt}`);
        break; // Success - exit retry loop
        
      } catch (error: any) {
        console.log(`❌ Finalization attempt ${attempt}/${retryAttempts} failed:`, error.message);
        lastError = error;
        
        if (attempt === retryAttempts) {
          console.log(`💥 All finalization attempts failed for analysis ${analysisId}`);
          throw error;
        }
        
        // Exponential backoff: 2s, 4s, 8s
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.log(`⏳ Retrying in ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }

    // Clear from memory cache since analysis is complete
    progressCache.delete(analysisId);
    console.log(`🗑️ Cleared progress cache for completed analysis ${analysisId}`);

    // Trigger webhook notification
    console.log('🎯 Triggering webhook notification...');
    await this.triggerZapierWebhook(analysisId);
  }

  private async triggerZapierWebhook(analysisId: string, maxRetries: number = 3) {
    const zapierWebhookUrl = process.env.ZAPIER_WEBHOOK_URL || process.env.CRM_WEBHOOK_URL;
    
    if (!zapierWebhookUrl) {
      console.log('No Zapier webhook URL configured - skipping webhook notification');
      return;
    }

    console.log(`🔗 Triggering Zapier webhook for analysis ${analysisId}`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Use AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3002'}/api/webhook`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'LinkScore/1.0',
            'X-Webhook-Source': 'LinkScore-AutoTrigger',
            'X-Analysis-ID': analysisId
          },
          body: JSON.stringify({
            analysisId,
            trigger: 'analysis_completed',
            timestamp: new Date().toISOString()
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const result = await response.json();
          console.log(`✅ Zapier webhook delivered successfully for analysis ${analysisId}`);
          console.log(`📊 Webhook payload sent - LinkScore: ${result.payload?.results?.linkScore}`);
          
          // Log webhook success for monitoring
          await this.logWebhookEvent(analysisId, 'SUCCESS', `Delivered on attempt ${attempt}`);
          return;
        } else {
          const errorText = await response.text().catch(() => 'Unknown error');
          console.warn(`⚠️ Zapier webhook failed (attempt ${attempt}/${maxRetries}) - Status: ${response.status}, Error: ${errorText}`);
          
          if (attempt === maxRetries) {
            await this.logWebhookEvent(analysisId, 'FAILED', `All ${maxRetries} attempts failed - Status: ${response.status}`);
          }
        }
      } catch (error: any) {
        console.error(`❌ Zapier webhook error (attempt ${attempt}/${maxRetries}):`, error.message);
        
        if (attempt === maxRetries) {
          await this.logWebhookEvent(analysisId, 'ERROR', `Network error after ${maxRetries} attempts: ${error.message}`);
        }
      }

      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s...
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  private async logWebhookEvent(analysisId: string, status: 'SUCCESS' | 'FAILED' | 'ERROR', details: string) {
    try {
      // Get current analysis to append webhook log
      const currentAnalysis = await prisma.analysis.findUnique({
        where: { id: analysisId },
        select: { errorMessage: true }
      });

      const webhookLog = `[WEBHOOK_${status}] ${details}`;
      const updatedErrorMessage = currentAnalysis?.errorMessage ? 
        `${currentAnalysis.errorMessage}\n${webhookLog}` : 
        webhookLog;

      await prisma.analysis.update({
        where: { id: analysisId },
        data: {
          errorMessage: updatedErrorMessage
        }
      });
      
      console.log(`📝 Webhook event logged for analysis ${analysisId}: ${status} - ${details}`);
    } catch (error) {
      console.warn(`Failed to log webhook event for analysis ${analysisId}:`, error);
    }
  }

  private async updateAnalysisProgress(analysisId: string, progress: AnalysisProgress) {
    // Enhanced logging with personalized data
    console.log(`📈 updateAnalysisProgress called for ${analysisId}`);
    console.log(`📊 Progress data:`, progress);
    console.log(`Analysis ${analysisId}: ${progress.message} (${progress.percentage}%)`);
    
    if (progress.data) {
      console.log(`  Data: ${JSON.stringify(progress.data, null, 2)}`);
    }
    
    // Store progress in memory cache
    const progressData = {
      step: progress.step,
      percentage: progress.percentage,
      message: progress.message,
      personalized: progress.personalized || false,
      data: progress.data || null,
      timestamp: new Date().toISOString()
    };
    
    // Update in-memory cache (always)
    progressCache.set(analysisId, {
      analysisId,
      lastUpdate: new Date(),
      currentProgress: {
        step: progress.step,
        message: progress.message,
        percentage: progress.percentage,
        personalized: progress.personalized,
        data: progress.data
      },
      isCancelled: false
    });
    
    // Write to database for major milestones AND competitor results (for bespoke UX)
    const shouldUpdateDB = progress.percentage === 0 || 
                          progress.percentage >= 100 ||
                          progress.percentage % 20 === 0 ||
                          ['completed', 'failed', 'cancelled'].includes(progress.step) ||
                          progress.step.includes('complete') ||
                          progress.step === 'competitor_result'; // Keep competitor results visible in UI
    
    if (shouldUpdateDB) {
      try {
        console.log('💾 Updating database with milestone progress...');
        
        // Use raw SQL to avoid prepared statement conflicts
        await prisma.$queryRawUnsafe(`
          UPDATE analyses SET
            status = $1,
            error_message = $2
          WHERE id = $3::uuid
        `,
          'processing', // Keep status as 'processing' for proper retrieval
          JSON.stringify(progressData), // Store full progress data in errorMessage temporarily
          analysisId
        );
        
        console.log('✅ Database milestone update successful');
      } catch (err) {
        console.error('❌ Failed to update analysis progress in database:', err);
        // Continue execution even if DB update fails - progress is still cached in memory
      }
    } else {
      console.log('📝 Progress cached in memory (skipping database write)');
    }
  }

  private async handleAnalysisError(analysisId: string, error: any, formData: FormData) {
    // Check if the error is due to cancellation
    if (error instanceof Error && error.message.includes('cancelled')) {
      console.log(`Analysis ${analysisId} was cancelled by user`);
      // Don't update status as it's already set to cancelled
      return;
    }
    
    console.log(`🔧 Handling analysis error for ID: ${analysisId}`);
    const errorMessage = this.getUserFriendlyErrorMessage(error);
    
    try {
      // Use raw SQL to avoid prepared statement conflicts
      await prisma.$queryRawUnsafe(`
        UPDATE analyses SET
          status = $1,
          error_message = $2
        WHERE id = $3::uuid
      `,
        'failed',
        errorMessage,
        analysisId
      );
      
      console.log('✅ Analysis error handled successfully');
    } catch (updateError) {
      console.error('❌ Failed to update analysis error status:', updateError);
      // Still continue with logging and cleanup
    }
    
    // Log error for monitoring - use a valid IP address or skip IP logging if unknown
    try {
      await logSecurityEvent({
        ipAddress: '127.0.0.1', // Use localhost IP as fallback instead of 'unknown'
        eventType: 'ANALYSIS_ERROR',
        severity: 'HIGH',
        details: {
          analysisId,
          error: error.message,
          domain: formData.domain,
          errorType: error.constructor.name
        }
      });
    } catch (logError) {
      console.warn('Failed to log security event:', logError);
    }
    
    // For critical errors, could send internal alerts here
    if (this.isCriticalError(error)) {
      console.error('CRITICAL ANALYSIS ERROR:', {
        analysisId,
        domain: formData.domain,
        error: error.message,
        stack: error.stack
      });
    }
  }

  private getUserFriendlyErrorMessage(error: any): string {
    if (error.name === 'APIError') {
      if (error.message.includes('timeout')) {
        return 'Analysis timed out due to high demand. We\'ll email you the results shortly.';
      }
      if (error.message.includes('rate limit')) {
        return 'Too many requests. Please try again in a few minutes.';
      }
      if (error.message.includes('domain not found')) {
        return 'Domain not found in our database. Please check the spelling or try a different domain.';
      }
    }
    
    if (error.name === 'ValidationError') {
      return error.message;
    }
    
    if (error.name === 'RateLimitError') {
      return 'Rate limit exceeded. Please try again later.';
    }
    
    return 'Analysis temporarily unavailable. We\'ve been notified and will resolve this shortly.';
  }

  private isCriticalError(error: any): boolean {
    return error.name === 'DatabaseError' || 
           error.message.includes('DataForSEO credentials') ||
           error.message.includes('Database connection');
  }

  private async createUser(userData: {
    email: string;
    firstName?: string;
    phone?: string;
    domain: string;
    company?: string;
    location: string;
    ip: string;
    userAgent: string;
  }) {
    const { encrypted: emailEncrypted, hash: emailHash } = encryptEmail(userData.email);
    const phoneHash = userData.phone ? hashPhone(userData.phone) : null;
    
    // FIX: Check if user already exists with BOTH email AND domain
    // This prevents domain mixing when the same email is used for different domains
    const existingUser = await prisma.user.findFirst({
      where: { 
        emailHash,
        domain: userData.domain  // ← CRITICAL FIX: Also check domain
      }
    });
    
    if (existingUser) {
      console.log(`✅ Found existing user for email + domain: ${userData.domain}`);
      return existingUser;
    }
    
    console.log(`🆕 Creating new user for: ${userData.domain}`);
    return await prisma.user.create({
      data: {
        emailEncrypted: emailEncrypted, // Already JSON stringified by encryptEmail
        emailHash,
        firstName: userData.firstName || '',
        phoneHash,
        domain: userData.domain,
        companyName: userData.company || '',
        location: userData.location,
        ipAddress: userData.ip,
        userAgent: userData.userAgent
      }
    });
  }

  // Get analysis by ID
  async getAnalysis(analysisId: string): Promise<any> {
    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
      include: {
        user: true
      }
    });
    
    if (!analysis) {
      throw new Error('Analysis not found');
    }
    
    return analysis;
  }

  // Get analysis status for polling with in-memory cache optimization
  async getAnalysisStatus(analysisId: string): Promise<{ status: string; progress?: number; message?: string; progressData?: any }> {
    // Check in-memory cache first (avoids database call for active analyses)
    const cached = progressCache.get(analysisId);
    if (cached) {
      console.log(`📊 Status check for ${analysisId}: using cached progress`);
      if (cached.isCancelled) {
        return {
          status: 'cancelled',
          message: 'Analysis was cancelled'
        };
      }
      
      // Return cached progress for processing analyses
      return {
        status: 'processing',
        progress: cached.currentProgress.percentage,
        message: cached.currentProgress.message,
        progressData: cached.currentProgress
      };
    }
    
    // Fall back to database for completed/failed analyses or when no cache
    // Use raw SQL to avoid prepared statement conflicts
    const analysisRows = await prisma.$queryRawUnsafe(`
      SELECT id, status, error_message 
      FROM analyses 
      WHERE id = $1::uuid
    `, analysisId) as any[];
    
    if (!analysisRows || analysisRows.length === 0) {
      throw new Error('Analysis not found');
    }
    
    const analysis = analysisRows[0];
    
    console.log(`📊 Status check for ${analysisId}: status=${analysis.status}, hasErrorMessage=${!!analysis.error_message}`);
    
    // For completed or failed status, return straightforward response
    if (analysis.status === 'completed') {
      // Clean up cache for completed analysis
      progressCache.delete(analysisId);
      return {
        status: 'completed',
        message: 'Analysis complete'
      };
    }
    
    if (analysis.status === 'failed') {
      // Clean up cache for failed analysis
      progressCache.delete(analysisId);
      return {
        status: 'failed',
        message: analysis.error_message || 'Analysis failed'
      };
    }
    
    if (analysis.status === 'cancelled') {
      // Clean up cache for cancelled analysis
      progressCache.delete(analysisId);
      return {
        status: 'cancelled',
        message: 'Analysis was cancelled'
      };
    }
    
    // For processing status, try to parse detailed progress data from database
    if (analysis.status === 'processing' && analysis.error_message) {
      try {
        const progressData = JSON.parse(analysis.error_message);
        console.log(`📈 Parsed progress data from database:`, progressData);
        return {
          status: 'processing',
          progress: progressData.percentage,
          message: progressData.message,
          progressData: progressData
        };
      } catch (e) {
        console.warn('Failed to parse progress data:', e, 'Raw errorMessage:', analysis.error_message);
        // Fall through to default processing message
      }
    }
    
    // Legacy fallback for old status format
    const progressMatch = analysis.status?.match(/(.+)_(\d+)%$/);
    if (progressMatch) {
      return {
        status: 'processing',
        progress: parseInt(progressMatch[2]),
        message: this.getProgressMessage(progressMatch[1])
      };
    }
    
    // Default fallback
    return {
      status: analysis.status || 'processing',
      message: analysis.status === 'processing' ? 'Starting analysis...' : 'Processing...'
    };
  }

  private getProgressMessage(step: string): string {
    const messages: Record<string, string> = {
      'competitors': 'Finding your competitors...',
      'client_analysis': 'Analyzing your domain...',
      'competitor_analysis': 'Comparing against competitors...',
      'link_gaps': 'Finding link opportunities...',
      'scoring': 'Calculating your LinkScore...'
    };
    
    return messages[step] || 'Processing...';
  }

  // Create preliminary analysis record and return ID immediately
  async createPreliminaryAnalysis(formData: FormData, request: Request): Promise<{ analysisId: string; userId: string }> {
    try {
      // Extract IP address from request with proper fallback
      const ipAddress = this.extractIPAddress(request);
      
      // Extract UserInput fields from FormData for validation
      const userInput: UserInput = {
        domain: formData.domain,
        email: formData.email,
        firstName: formData.firstName,
        phone: formData.phone,
        company: formData.company,
        location: formData.location,
        spendRange: formData.spendRange,
        durationRange: formData.durationRange,
        keywords: formData.keywords
      };
      
      // Step 1: Validate and sanitize input
      const sanitizedData = await validateAndSanitizeInput(userInput, ipAddress);
      
      // Merge monthly spend and investment months into sanitized data
      const completeData: FormData = {
        ...sanitizedData,
        monthlySpend: formData.monthlySpend,
        investmentMonths: formData.investmentMonths
      };
      
      // Step 2: Create user and analysis records
      const { userId, analysisId } = await this.createAnalysisRecords(completeData, request);
      
      return { analysisId, userId };
      
    } catch (error) {
      console.error('Failed to create preliminary analysis:', error);
      throw error;
    }
  }

  private async analyzeCompetitorWithTimeout(competitor: string, campaignStartDateStr: string): Promise<{
    domains: DomainData[];
    currentCount: number;
    historicalCount: number;
    gained: number;
  }> {
    // Get current authority links for competitive analysis
    const domains = await this.apiClient.getAuthorityReferringDomains(competitor);
    
    // Get historical authority links data for comparison table
    const [currentData, historicalData] = await Promise.all([
      this.apiClient.getAuthorityLinksByDate(competitor, undefined), // Current
      this.apiClient.getAuthorityLinksByDate(competitor, campaignStartDateStr) // Historical
    ]);
    
    const currentCount = currentData.authorityLinksCount;
    const historicalCount = historicalData.authorityLinksCount;
    const gained = Math.max(0, currentCount - historicalCount);
    
    return {
      domains,
      currentCount,
      historicalCount,
      gained
    };
  }
}

export { AnalysisEngine };
export type { FormData, AnalysisResult, AnalysisProgress }; 