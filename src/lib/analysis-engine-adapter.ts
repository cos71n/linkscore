// Adapter to bridge old AnalysisEngine interface with new AnalysisEngineV2
import { AnalysisEngineV2 } from './analysis-engine-v2';
import { LinkScoreCalculator } from './link-score';
import { prisma } from './database';
import { validateAndSanitizeInput, UserInput } from './security/validation';
import { encryptEmail, hashPhone } from './security/encryption';

// Re-export types from old engine for compatibility
export interface FormData extends UserInput {
  monthlySpend: number;
  investmentMonths: number;
}

interface AnalysisResult {
  id: string;
  linkScore: any;
  performanceData: any;
  competitiveData: any;
  linkGaps: any[];
  redFlags: any[];
  leadScore: any;
  competitors: string[];
  competitorHistoricalData: Record<string, any>;
  processingTime: number;
  cost: number;
}

export class AnalysisEngine {
  private engineV2: AnalysisEngineV2;
  private linkScoreCalculator: LinkScoreCalculator;

  constructor() {
    console.log('🔧 Initializing AnalysisEngine Adapter (using V2)...');
    this.linkScoreCalculator = new LinkScoreCalculator();
    this.engineV2 = new AnalysisEngineV2(this.linkScoreCalculator);
    console.log('✅ AnalysisEngine Adapter initialized successfully');
  }

  async createPreliminaryAnalysis(formData: FormData, request: Request): Promise<{ analysisId: string; userId: string }> {
    console.log('📝 Creating preliminary analysis records...');
    
    // Extract IP address
    const ipAddress = this.extractIPAddress(request);
    const userAgent = request.headers.get('user-agent') || '';
    
    // Validate and sanitize input
    const sanitizedData = await validateAndSanitizeInput(formData, ipAddress);
    
    // Create user record
    const user = await this.createUser({
      email: sanitizedData.email,
      firstName: sanitizedData.firstName,
      phone: sanitizedData.phone,
      domain: sanitizedData.domain,
      company: sanitizedData.company,
      location: sanitizedData.location,
      ip: ipAddress,
      userAgent
    });
    
    // Calculate campaign start date
    const campaignStartDate = new Date();
    campaignStartDate.setMonth(campaignStartDate.getMonth() - formData.investmentMonths);
    
    // Create analysis record
    const analysis = await prisma.analysis.create({
      data: {
        userId: user.id,
        monthlySpend: formData.monthlySpend,
        investmentMonths: formData.investmentMonths,
        spendRange: formData.spendRange,
        durationRange: formData.durationRange,
        campaignStartDate,
        targetKeywords: formData.keywords,
        linkScore: 0,
        performanceScore: 0,
        competitiveScore: 0,
        opportunityScore: 0,
        priorityScore: 0,
        potentialScore: 0,
        status: 'processing'
      }
    });
    
    console.log('✅ Preliminary analysis created:', analysis.id);
    return { analysisId: analysis.id, userId: user.id };
  }

  async performAnalysis(formData: FormData, request: Request, existingAnalysisId?: string): Promise<AnalysisResult> {
    const startTime = Date.now();
    console.log('🚀 Starting analysis via V2 engine for:', existingAnalysisId);
    
    try {
      // Update status to processing
      if (existingAnalysisId) {
        await prisma.analysis.update({
          where: { id: existingAnalysisId },
          data: { 
            status: 'processing'
          }
        });
      }
      
      // Calculate campaign start date
      const campaignStartDate = new Date();
      campaignStartDate.setMonth(campaignStartDate.getMonth() - formData.investmentMonths);
      
      // Run analysis using V2 engine
      const v2Result = await this.engineV2.runAnalysis({
        domain: formData.domain,
        keywords: formData.keywords,
        location: formData.location,
        monthlySpend: formData.monthlySpend,
        investmentMonths: formData.investmentMonths,
        campaignStartDate
      });
      
      // Convert V2 result to old format
      const result = this.convertV2Result(v2Result, existingAnalysisId || '');
      
      // Update database with results
      if (existingAnalysisId) {
        await this.finalizeAnalysis(existingAnalysisId, result, v2Result.processingTime);
      }
      
      return result;
      
    } catch (error: any) {
      console.error('❌ Analysis failed:', error);
      
      // Update database with error
      if (existingAnalysisId) {
        await prisma.analysis.update({
          where: { id: existingAnalysisId },
          data: {
            status: 'failed',
            errorMessage: error.message || 'Analysis failed unexpectedly',
            completedAt: new Date()
          }
        });
      }
      
      throw error;
    }
  }

  async getAnalysisStatus(analysisId: string): Promise<{ status: string; progress?: number; message?: string; progressData?: any }> {
    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
      select: {
        status: true,
        completedAt: true,
        errorMessage: true
      }
    });
    
    if (!analysis) {
      throw new Error('Analysis not found');
    }
    
    // Calculate progress based on status
    let progress = 0;
    let message = 'Processing...';
    
    if (analysis.status === 'processing') {
      progress = 50;
      message = 'Analysis in progress...';
    } else if (analysis.status === 'completed') {
      progress = 100;
      message = 'Analysis complete';
    } else if (analysis.status === 'failed') {
      progress = 0;
      message = analysis.errorMessage || 'Analysis failed';
    }
    
    return {
      status: analysis.status,
      progress,
      message,
      progressData: undefined
    };
  }

  async getAnalysis(analysisId: string): Promise<any> {
    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
      include: {
        user: {
          select: {
            domain: true,
            location: true
          }
        }
      }
    });
    
    return analysis;
  }

  // Helper methods
  private convertV2Result(v2Result: any, analysisId: string): AnalysisResult {
    // Calculate performance data
    const performanceData = {
      authorityLinksGained: v2Result.metrics.linkGrowth,
      expectedLinks: Math.floor((v2Result.metrics.monthlySpend * v2Result.metrics.investmentMonths) / 667),
      currentAuthorityLinks: v2Result.metrics.currentAuthorityLinks,
      costPerAuthorityLink: v2Result.metrics.linkGrowth > 0 
        ? (v2Result.metrics.monthlySpend * v2Result.metrics.investmentMonths) / v2Result.metrics.linkGrowth
        : 0,
      performance: 0,
      campaignStartDate: v2Result.campaignStartDate?.toISOString() || new Date().toISOString(),
      campaignDuration: v2Result.metrics.investmentMonths
    };
    
    // Calculate competitive data
    const competitiveData = {
      clientAuthorityLinks: v2Result.metrics.currentAuthorityLinks,
      averageCompetitorLinks: v2Result.competitors.reduce((sum: number, c: any) => sum + c.currentAuthorityLinks, 0) / Math.max(1, v2Result.competitors.length),
      competitorsBehind: v2Result.competitors.filter((c: any) => c.currentAuthorityLinks < v2Result.metrics.currentAuthorityLinks).length,
      gapPercentage: 0
    };
    
    // Convert competitor historical data
    const competitorHistoricalData: Record<string, any> = {};
    v2Result.competitors.forEach((comp: any) => {
      competitorHistoricalData[comp.domain] = {
        current: comp.currentAuthorityLinks,
        historical: comp.historicalAuthorityLinks,
        gained: comp.linkGrowth
      };
    });
    
    // Extract red flags if available
    const redFlags = v2Result.linkScore?.redFlags || [];
    
    // Extract lead score if available
    const leadScore = v2Result.linkScore?.leadScore || {
      priority: 0,
      potential: 0,
      overall: 0
    };
    
    return {
      id: analysisId,
      linkScore: v2Result.linkScore || {},
      performanceData,
      competitiveData,
      linkGaps: v2Result.linkGaps || [],
      redFlags,
      leadScore,
      competitors: v2Result.competitors.map((c: any) => c.domain),
      competitorHistoricalData,
      processingTime: v2Result.processingTime,
      cost: v2Result.totalCost
    };
  }

  private async finalizeAnalysis(analysisId: string, result: any, processingTime: number) {
    const linkScore = result.linkScore?.overall || 0;
    
    await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        linkScore: Math.round(linkScore),
        performanceScore: Math.round(result.linkScore?.breakdown?.performanceVsExpected || 0),
        competitiveScore: Math.round(result.linkScore?.breakdown?.competitivePosition || 0),
        opportunityScore: result.linkGaps?.length || 0,
        priorityScore: result.leadScore?.priority || 0,
        potentialScore: result.leadScore?.potential || 0,
        currentAuthorityLinks: result.performanceData?.currentAuthorityLinks || 0,
        authorityLinksGained: result.performanceData?.authorityLinksGained || 0,
        expectedLinks: result.performanceData?.expectedLinks || 0,
        costPerAuthorityLink: result.performanceData?.costPerAuthorityLink || 0,
        competitorAverageLinks: result.competitiveData?.averageCompetitorLinks || 0,
        linkGapsTotal: result.linkGaps?.length || 0,
        linkGapsHighPriority: result.linkGaps?.filter((gap: any) => gap.rank >= 50).length || 0,
        competitors: result.competitors || [],
        historicalData: result.competitorHistoricalData || {},
        linkGapData: result.linkGaps?.slice(0, 10) || [],
        redFlags: result.redFlags || [],
        dataforseoCostUsd: result.cost || 0,
        processingTimeSeconds: processingTime
      }
    });
  }

  private extractIPAddress(request: Request): string {
    const possibleIPs = [
      request.headers.get('cf-connecting-ip'),
      request.headers.get('x-forwarded-for'),
      request.headers.get('x-real-ip'),
      request.headers.get('x-client-ip')
    ];
    
    for (const ip of possibleIPs) {
      if (ip) {
        const cleanIP = ip.split(',')[0].trim();
        if (this.isValidIP(cleanIP)) {
          return cleanIP;
        }
      }
    }
    
    return '127.0.0.1';
  }

  private isValidIP(ip: string): boolean {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
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
    const emailResult = await encryptEmail(userData.email);
    const hashedPhone = userData.phone ? await hashPhone(userData.phone) : null;
    
    const existingUser = await prisma.user.findFirst({
      where: { 
        emailHash: emailResult.hash,
        domain: userData.domain.toLowerCase()
      }
    });
    
    if (existingUser) {
      return existingUser;
    }
    
    return await prisma.user.create({
      data: {
        emailEncrypted: emailResult.encrypted,
        emailHash: emailResult.hash,
        firstName: userData.firstName,
        phoneHash: hashedPhone,
        domain: userData.domain.toLowerCase(),
        companyName: userData.company,
        location: userData.location,
        ipAddress: userData.ip,
        userAgent: userData.userAgent
      }
    });
  }
} 