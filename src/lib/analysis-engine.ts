import { prisma } from './database';
import { RobustAPIClient, DomainData, LinkGapResult, AUTHORITY_CRITERIA, AUSTRALIAN_LOCATIONS } from './dataforseo';
import { 
  LinkScoreCalculator, 
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

class AnalysisEngine {
  private apiClient: RobustAPIClient;
  private calculator: LinkScoreCalculator;

  constructor() {
    this.apiClient = new RobustAPIClient();
    this.calculator = new LinkScoreCalculator();
  }

  async performAnalysis(formData: FormData, request: Request, existingAnalysisId?: string): Promise<AnalysisResult> {
    const startTime = Date.now();
    let analysisId = existingAnalysisId;
    
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
      
      // Step 2: Create user and analysis records (if not already created)
      let userId: string;
      if (!analysisId) {
        const records = await this.createAnalysisRecords(completeData, request);
        userId = records.userId;
        analysisId = records.analysisId;
      } else {
        // Get user ID from existing analysis
        const analysis = await prisma.analysis.findUnique({
          where: { id: analysisId },
          select: { userId: true }
        });
        if (!analysis) {
          throw new Error('Analysis not found');
        }
        userId = analysis.userId;
      }
      
      // Step 3: Perform the analysis with progress tracking
      const result = await this.executeAnalysis(completeData, analysisId, userId);
      
      // Step 4: Calculate processing time and finalize
      const processingTime = Math.round((Date.now() - startTime) / 1000);
      await this.finalizeAnalysis(analysisId, result, processingTime);
      
      return {
        ...result,
        id: analysisId,
        processingTime
      };
      
    } catch (error) {
      console.error('Analysis failed:', error);
      
      if (analysisId) {
        await this.handleAnalysisError(analysisId, error, formData);
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

  // Check if analysis has been cancelled
  private async checkForCancellation(analysisId: string): Promise<boolean> {
    try {
      const analysis = await prisma.analysis.findUnique({
        where: { id: analysisId },
        select: { status: true }
      });
      
      if (analysis?.status === 'cancelled') {
        console.log(`Analysis ${analysisId} has been cancelled, stopping execution`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.warn('Failed to check cancellation status:', error);
      return false; // Continue analysis if we can't check status
    }
  }

  private async executeAnalysis(formData: FormData, analysisId: string, userId: string): Promise<Omit<AnalysisResult, 'id' | 'processingTime'>> {
    const progressCallback = (progress: AnalysisProgress) => {
      this.updateAnalysisProgress(analysisId, progress);
    };
    
    const locationName = AUSTRALIAN_LOCATIONS[formData.location as keyof typeof AUSTRALIAN_LOCATIONS]?.name || formData.location;
    
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
    
    // Check for cancellation before starting
    if (await this.checkForCancellation(analysisId)) {
      throw new Error('Analysis cancelled by user');
    }
    
    const competitors = await this.apiClient.getCompetitors(formData.keywords, formData.location);
    
    // Check for cancellation after competitor discovery
    if (await this.checkForCancellation(analysisId)) {
      throw new Error('Analysis cancelled by user');
    }
    
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
    
    // Check for cancellation before client analysis
    if (await this.checkForCancellation(analysisId)) {
      throw new Error('Analysis cancelled by user');
    }
    
    const clientLinks = await this.apiClient.getAuthorityReferringDomains(formData.domain);
    
    // Check for cancellation after client analysis
    if (await this.checkForCancellation(analysisId)) {
      throw new Error('Analysis cancelled by user');
    }
    
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
      // Check for cancellation before each competitor analysis
      if (await this.checkForCancellation(analysisId)) {
        throw new Error('Analysis cancelled by user');
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
        // Get current authority links for competitive analysis
        competitorData[competitor] = await this.apiClient.getAuthorityReferringDomains(competitor);
        
        // Check for cancellation between API calls
        if (await this.checkForCancellation(analysisId)) {
          throw new Error('Analysis cancelled by user');
        }
        
        // Get historical authority links data for comparison table
        const [currentData, historicalData] = await Promise.all([
          this.apiClient.getAuthorityLinksByDate(competitor), // Current
          this.apiClient.getAuthorityLinksByDate(competitor, campaignStartDateStr) // Historical
        ]);
        
        const currentCount = currentData.authorityLinksCount;
        const historicalCount = historicalData.authorityLinksCount;
        const gained = Math.max(0, currentCount - historicalCount);
        
        competitorHistoricalData[competitor] = {
          current: currentCount,
          historical: historicalCount,
          gained: gained
        };
        
        // Track performance for ranking
        competitorPerformance.push({
          competitor,
          gained,
          current: currentCount,
          historical: historicalCount
        });
        
        // Show competitor results
        progressCallback({ 
          step: 'competitor_result', 
          message: `${competitor}: ${currentCount} authority links (+${gained} gained over ${formData.investmentMonths} months)`, 
          percentage: progressPercent + 2,
          personalized: true,
          data: {
            competitors: [competitor],
            currentActivity: 'Competitor analysis complete',
            metrics: { 
              authorityLinks: currentCount,
              linksGained: gained,
              timeframe: formData.investmentMonths
            }
          }
        });
        
        console.log(`Competitor ${competitor}: ${historicalCount} → ${currentCount} = +${gained} authority links gained`);
        
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
    
    // Check for cancellation before link gap analysis
    if (await this.checkForCancellation(analysisId)) {
      throw new Error('Analysis cancelled by user');
    }
    
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
    
    // Check for cancellation before link gap analysis
    if (await this.checkForCancellation(analysisId)) {
      throw new Error('Analysis cancelled by user');
    }
    
    const linkGaps = await this.apiClient.findLinkGaps(formData.domain, topPerformers);
    
    // Check for cancellation after link gap analysis
    if (await this.checkForCancellation(analysisId)) {
      throw new Error('Analysis cancelled by user');
    }
    
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
    
    // Final cancellation check before scoring
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
    
    const performanceData = await this.calculator.calculatePerformanceData(this.apiClient, formData.domain, investmentData);
    const competitiveData = this.calculator.calculateCompetitiveData(clientLinks, topCompetitorData);
    const linkScore = this.calculator.calculateLinkScore(performanceData, competitiveData, linkGaps);
    const redFlags = this.calculator.detectRedFlags(performanceData, competitiveData, linkGaps, investmentData);
    const leadScore = this.calculator.calculateAdvancedLeadScore(linkScore, investmentData, competitiveData, redFlags, formData.location);
    
    progressCallback({ 
      step: 'scoring_complete', 
      message: `LinkScore calculated: ${linkScore.overall}/10 - Analysis complete!`, 
      percentage: 95,
      personalized: true,
      data: {
        currentActivity: 'Analysis complete',
        metrics: { 
          linkScore: linkScore.overall,
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
    await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        linkScore: result.linkScore.overall,
        performanceScore: result.linkScore.performance,
        competitiveScore: result.linkScore.competitive,
        opportunityScore: result.linkScore.opportunity,
        priorityScore: result.leadScore.priority,
        potentialScore: result.leadScore.potential,
        
        // Metrics
        authorityLinksGained: result.performanceData.authorityLinksGained,
        expectedLinks: result.performanceData.expectedLinks,
        currentAuthorityLinks: result.performanceData.currentAuthorityLinks,
        competitorAverageLinks: result.competitiveData.averageCompetitorLinks,
        linkGapsTotal: result.linkGaps.length,
        linkGapsHighPriority: result.linkGaps.filter(gap => gap.rank >= 50).length,
        costPerAuthorityLink: result.performanceData.costPerAuthorityLink,
        
        // JSON data
        competitors: result.competitors,
        linkGapData: result.linkGaps.slice(0, 50) as any, // Store top 50 opportunities
        redFlags: result.redFlags as any,
        historicalData: result.competitorHistoricalData,
        
        // Metadata
        processingTimeSeconds: processingTime,
        dataforseoCostUsd: result.cost,
        status: 'completed',
        completedAt: new Date()
      }
    });
  }

  private async updateAnalysisProgress(analysisId: string, progress: AnalysisProgress) {
    // Enhanced logging with personalized data
    console.log(`Analysis ${analysisId}: ${progress.message} (${progress.percentage}%)`);
    
    if (progress.data) {
      console.log(`  Data: ${JSON.stringify(progress.data, null, 2)}`);
    }
    
    // Store detailed progress in database for polling
    const progressData = {
      step: progress.step,
      percentage: progress.percentage,
      message: progress.message,
      personalized: progress.personalized || false,
      data: progress.data || null,
      timestamp: new Date().toISOString()
    };
    
    await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        status: progress.step,
        errorMessage: JSON.stringify(progressData) // Store full progress data in errorMessage temporarily
      }
    }).catch(err => {
      console.warn('Failed to update progress:', err);
    });
  }

  private async handleAnalysisError(analysisId: string, error: any, formData: FormData) {
    // Check if the error is due to cancellation
    if (error instanceof Error && error.message.includes('cancelled')) {
      console.log(`Analysis ${analysisId} was cancelled by user`);
      // Don't update status as it's already set to cancelled
      return;
    }
    
    const errorMessage = this.getUserFriendlyErrorMessage(error);
    
    await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        status: 'failed',
        errorMessage
      }
    });
    
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
    
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { emailHash }
    });
    
    if (existingUser) {
      return existingUser;
    }
    
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

  // Get analysis status for polling
  async getAnalysisStatus(analysisId: string): Promise<{ status: string; progress?: number; message?: string; progressData?: any }> {
    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
      select: { status: true, errorMessage: true }
    });
    
    if (!analysis) {
      throw new Error('Analysis not found');
    }
    
    // For completed or failed status, return straightforward response
    if (analysis.status === 'completed') {
      return {
        status: 'completed',
        message: 'Analysis complete'
      };
    }
    
    if (analysis.status === 'failed') {
      return {
        status: 'failed',
        message: analysis.errorMessage || 'Analysis failed'
      };
    }
    
    // For processing status, try to parse detailed progress data
    if (analysis.errorMessage) {
      try {
        const progressData = JSON.parse(analysis.errorMessage);
        return {
          status: 'processing',
          progress: progressData.percentage,
          message: progressData.message,
          progressData: progressData
        };
      } catch (e) {
        // If parsing fails, fall back to simple status
        console.warn('Failed to parse progress data:', e);
      }
    }
    
    // Legacy fallback for old status format
    const progressMatch = analysis.status.match(/(.+)_(\d+)%$/);
    if (progressMatch) {
      return {
        status: 'processing',
        progress: parseInt(progressMatch[2]),
        message: this.getProgressMessage(progressMatch[1])
      };
    }
    
    return {
      status: analysis.status || 'processing',
      message: 'Processing...'
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
}

export { AnalysisEngine };
export type { FormData, AnalysisResult, AnalysisProgress }; 