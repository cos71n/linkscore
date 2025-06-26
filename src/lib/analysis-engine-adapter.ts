// Adapter to bridge old AnalysisEngine interface with new AnalysisEngineV2
import { AnalysisEngineV2 } from './analysis-engine-v2';
import { LinkScoreCalculator } from './link-score';
import { prisma } from './database';
import { validateAndSanitizeInput, UserInput } from './security/validation';
import { encryptEmail, hashPhone, decryptEmail } from './security/encryption';

// Re-export types from old engine for compatibility
export interface FormData extends UserInput {
  monthlySpend: number;
  investmentMonths: number;
  facebookClickId?: string; // For Facebook ads attribution (fbclid)
  facebookBrowserId?: string; // For Facebook browser tracking (fbp)
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
      userAgent,
      facebookClickId: formData.facebookClickId,
      facebookBrowserId: formData.facebookBrowserId
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
    
    // Add timeout wrapper for the entire analysis
    const ANALYSIS_TIMEOUT = 50000; // 50 seconds (Vercel function timeout is 60s)
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Analysis timeout after ${ANALYSIS_TIMEOUT/1000} seconds`));
      }, ANALYSIS_TIMEOUT);
    });
    
    try {
      // Race between analysis and timeout
      const result = await Promise.race([
        this.performAnalysisInternal(formData, request, existingAnalysisId, startTime),
        timeoutPromise
      ]);
      
      return result;
    } catch (error: any) {
      console.error('❌ Analysis failed or timed out:', error.message);
      
      // If we have an analysis ID, mark it as failed and try to trigger webhook
      if (existingAnalysisId) {
        await prisma.analysis.update({
          where: { id: existingAnalysisId },
          data: {
            status: 'failed',
            errorMessage: error.message || 'Analysis failed unexpectedly',
            completedAt: new Date(),
            linkScore: 0
          }
        });
        
        // Try to trigger webhook even on failure
        console.log('🚨 Attempting to trigger webhook after failure...');
        try {
          await this.triggerZapierWebhook(existingAnalysisId);
          console.log('✅ Webhook triggered after failure');
        } catch (webhookError: any) {
          console.error('❌ Webhook trigger failed:', webhookError.message);
        }
      }
      
      throw error;
    }
  }

  private async performAnalysisInternal(formData: FormData, request: Request, existingAnalysisId: string | undefined, startTime: number): Promise<AnalysisResult> {
    try {
      // Update status to processing
      if (existingAnalysisId) {
        console.log('📝 Updating analysis status to processing...');
        await prisma.analysis.update({
          where: { id: existingAnalysisId },
          data: { 
            status: 'processing'
          }
        });
      }
      
      // Set up progress callback to store updates in database
      this.engineV2.setProgressCallback(async (update) => {
        console.log('📊 Progress update:', update);
        
        if (existingAnalysisId) {
          try {
            // Store progress update in error_message field temporarily (since we don't have a dedicated progress field)
            await prisma.analysis.update({
              where: { id: existingAnalysisId },
              data: {
                errorMessage: JSON.stringify({
                  step: update.step,
                  message: update.message,
                  percentage: update.percentage,
                  personalized: update.personalized,
                  data: update.data,
                  timestamp: update.timestamp
                })
              }
            });
          } catch (error) {
            console.error('Failed to store progress update:', error);
          }
        }
      });
      
      // Calculate campaign start date
      const campaignStartDate = new Date();
      campaignStartDate.setMonth(campaignStartDate.getMonth() - formData.investmentMonths);
      
      // Run analysis using V2 engine
      console.log('🔧 Running V2 analysis engine...');
      let v2Result;
      let partialResults = false;
      
      try {
        v2Result = await this.engineV2.runAnalysis({
          domain: formData.domain,
          keywords: formData.keywords,
          location: formData.location,
          monthlySpend: formData.monthlySpend,
          investmentMonths: formData.investmentMonths,
          campaignStartDate
        });
        
        console.log('✅ V2 analysis completed successfully');
      } catch (v2Error: any) {
        console.error('⚠️ V2 analysis partially failed:', v2Error.message);
        console.error('Stack:', v2Error.stack);
        
        // Try to salvage partial results
        partialResults = true;
        
        // Create minimal result structure to ensure webhook still fires
        v2Result = {
          domain: formData.domain,
          analysisDate: new Date(),
          metrics: {
            currentAuthorityLinks: 0,
            historicalAuthorityLinks: 0,
            linkGrowth: 0,
            linkGrowthRate: 0
          },
          competitors: [],
          linkGaps: [],
          linkScore: {
            overall: 0,
            breakdown: {
              competitivePosition: 0,
              performanceVsExpected: 0,
              velocityComparison: 0,
              marketShareGrowth: 0,
              costEfficiency: 0,
              modifiers: 0
            },
            interpretation: {
              grade: 'F',
              label: 'Analysis Error',
              message: 'Analysis partially failed - limited data available',
              urgency: 'HIGH' as const
            },
            redFlags: ['Analysis did not complete successfully']
          },
          totalCost: 0,
          processingTime: Math.round((Date.now() - startTime) / 1000)
        };
      }
      
      // Convert V2 result to old format
      const result = this.convertV2Result(v2Result, existingAnalysisId || '', formData);
      
      // Update database with results (even partial ones)
      if (existingAnalysisId) {
        console.log('💾 Calling finalizeAnalysis to save results and trigger webhook...');
        try {
          await this.finalizeAnalysis(existingAnalysisId, result, v2Result.processingTime, partialResults);
          console.log('✅ finalizeAnalysis completed');
        } catch (finalizeError: any) {
          console.error('❌ finalizeAnalysis failed:', finalizeError.message);
          console.error('Stack:', finalizeError.stack);
          
          // Even if finalization fails, try to trigger webhook directly
          console.log('🚨 Attempting emergency webhook trigger...');
          try {
            await this.triggerZapierWebhook(existingAnalysisId);
            console.log('✅ Emergency webhook triggered');
          } catch (webhookError: any) {
            console.error('❌ Emergency webhook also failed:', webhookError.message);
          }
        }
      } else {
        console.log('⚠️ No existingAnalysisId, skipping finalizeAnalysis');
      }
      
      return result;
      
    } catch (error: any) {
      console.error('❌ Analysis failed:', error);
      console.error('Error stack:', error.stack);
      
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
    
    // If processing, try to parse progress from errorMessage field
    if (analysis.status === 'processing' && analysis.errorMessage) {
      try {
        const progressData = JSON.parse(analysis.errorMessage);
        return {
          status: analysis.status,
          progress: progressData.percentage || 0,
          message: progressData.message || 'Processing...',
          progressData: progressData
        };
      } catch (e) {
        // If parsing fails, return default progress
      }
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
  private convertV2Result(v2Result: any, analysisId: string, formData: FormData): AnalysisResult {
    // Calculate performance data
    const performanceData = {
      authorityLinksGained: v2Result.metrics.linkGrowth,
      expectedLinks: Math.floor((formData.monthlySpend * formData.investmentMonths) / 667),
      currentAuthorityLinks: v2Result.metrics.currentAuthorityLinks,
      costPerAuthorityLink: v2Result.metrics.linkGrowth > 0 
        ? (formData.monthlySpend * formData.investmentMonths) / v2Result.metrics.linkGrowth
        : 0,
      performance: 0,
      campaignStartDate: v2Result.campaignStartDate?.toISOString() || new Date().toISOString(),
      campaignDuration: formData.investmentMonths
    };
    
    // Calculate competitive data
    const competitiveData = {
      clientAuthorityLinks: v2Result.metrics.currentAuthorityLinks,
      averageCompetitorLinks: v2Result.competitors.reduce((sum: number, c: any) => sum + c.currentAuthorityLinks, 0) / Math.max(1, v2Result.competitors.length),
      competitorsBehind: v2Result.competitors.filter((c: any) => c.currentAuthorityLinks < v2Result.metrics.currentAuthorityLinks).length,
      gapPercentage: 0
    };
    
    // Calculate gap percentage
    if (competitiveData.averageCompetitorLinks > 0) {
      competitiveData.gapPercentage = Math.round(
        ((competitiveData.averageCompetitorLinks - competitiveData.clientAuthorityLinks) / competitiveData.averageCompetitorLinks) * 100
      );
    }
    
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

  private async finalizeAnalysis(analysisId: string, result: any, processingTime: number, partialResults: boolean = false) {
    console.log(`🎯 finalizeAnalysis called for ${analysisId} (partial: ${partialResults})`);
    const linkScore = result.linkScore?.overall || 0;
    
    console.log('💾 Updating analysis in database...');
    await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        status: partialResults ? 'partial' : 'completed',
        completedAt: new Date(),
        errorMessage: partialResults ? 'Analysis completed with limited data' : null,
        linkScore: Math.round(linkScore),
        performanceScore: Math.round(result.linkScore?.breakdown?.performanceVsExpected || 0),
        competitiveScore: Math.round(result.linkScore?.breakdown?.competitivePosition || 0),
        opportunityScore: result.linkGaps?.length || 0,
        velocityScore: Math.round(result.linkScore?.breakdown?.velocityComparison || 0),
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
    console.log('✅ Database update completed');

    // Trigger webhook notification
    console.log('🎯 About to trigger webhook notification...');
    try {
      await this.triggerZapierWebhook(analysisId);
      console.log('✅ triggerZapierWebhook completed');
    } catch (error: any) {
      console.error('❌ triggerZapierWebhook failed:', error);
      console.error('Error stack:', error.stack);
    }
  }

  private async triggerZapierWebhook(analysisId: string, maxRetries: number = 3) {
    console.log(`🚀 triggerZapierWebhook called for analysis ${analysisId}`);
    
    const zapierWebhookUrl = process.env.ZAPIER_WEBHOOK_URL;
    const crmWebhookUrl = process.env.CRM_WEBHOOK_URL;
    
    console.log('📋 Webhook configuration:', {
      hasZapierUrl: !!zapierWebhookUrl,
      hasCrmUrl: !!crmWebhookUrl,
      zapierUrlPrefix: zapierWebhookUrl?.substring(0, 50),
      crmUrlPrefix: crmWebhookUrl?.substring(0, 50)
    });
    
    // Log environment for debugging
    console.log('🌍 Environment:', {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
      BASE_URL: process.env.NEXT_PUBLIC_BASE_URL
    });
    
    if (!zapierWebhookUrl && !crmWebhookUrl) {
      console.log('❌ No webhook URLs configured - skipping webhook notification');
      console.log('💡 Set ZAPIER_WEBHOOK_URL in Vercel environment variables');
      return;
    }

    console.log(`🔗 Triggering webhook for analysis ${analysisId}`);
    
    // Get the analysis data to build the payload
    try {
      console.log('📊 Fetching analysis data from database...');
      const analysis = await prisma.analysis.findUnique({
        where: { id: analysisId },
        include: {
          user: true  // Include user data for webhook payload
        }
      });
      
      console.log('📊 Analysis data fetched:', {
        found: !!analysis,
        status: analysis?.status,
        hasUser: !!analysis?.user,
        linkScore: analysis?.linkScore
      });
      
      if (!analysis || analysis.status !== 'completed') {
        console.error('❌ Analysis not found or not completed:', {
          found: !!analysis,
          status: analysis?.status
        });
        return;
      }

      // Build the webhook payload directly
      console.log('🏗️ Building webhook payload...');
      const payload = await this.buildWebhookPayload(analysis);
      console.log('✅ Webhook payload built successfully');
      
      // Send to all configured webhooks
      const webhookUrls = [zapierWebhookUrl, crmWebhookUrl].filter(Boolean) as string[];
      console.log(`📮 Sending to ${webhookUrls.length} webhook(s)`);
      
      for (const webhookUrl of webhookUrls) {
        const isZapier = webhookUrl.includes('zapier.com') || webhookUrl.includes('hooks.zapier.com');
        console.log(`📤 Sending to ${isZapier ? 'Zapier' : 'CRM'}: ${webhookUrl.substring(0, 50)}...`);
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            console.log(`🔄 Attempt ${attempt}/${maxRetries}...`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            console.log('📡 Making fetch request to:', webhookUrl);
            console.log('📋 Request headers:', {
              'Content-Type': 'application/json',
              'User-Agent': 'LinkScore/1.0',
              'X-Webhook-Source': 'LinkScore',
              'X-Analysis-ID': analysisId,
              ...(isZapier && {
                'X-Zapier-Trigger': 'analysis_completed',
                'Accept': 'application/json'
              })
            });
            console.log('📦 Payload size:', JSON.stringify(payload).length, 'bytes');
            
            const response = await fetch(webhookUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'LinkScore/1.0',
                'X-Webhook-Source': 'LinkScore',
                'X-Analysis-ID': analysisId,
                ...(isZapier && {
                  'X-Zapier-Trigger': 'analysis_completed',
                  'Accept': 'application/json'
                })
              },
              body: JSON.stringify(payload),
              signal: controller.signal
            });

            clearTimeout(timeoutId);
            console.log(`📨 Response received: ${response.status} ${response.statusText}`);
            console.log('📋 Response headers:', Object.fromEntries(response.headers.entries()));

            if (response.ok) {
              const responseText = await response.text();
              console.log(`✅ Webhook delivered successfully to ${isZapier ? 'Zapier' : 'CRM'}`);
              console.log('📄 Response body:', responseText.substring(0, 200) + (responseText.length > 200 ? '...' : ''));
              await this.logWebhookEvent(analysisId, 'SUCCESS', `Delivered to ${isZapier ? 'Zapier' : 'CRM'} on attempt ${attempt}`);
              break; // Success, no need to retry
            } else {
              const errorText = await response.text().catch(() => 'Unknown error');
              console.warn(`⚠️ Webhook failed (attempt ${attempt}/${maxRetries})`);
              console.warn(`Status: ${response.status} ${response.statusText}`);
              console.warn(`Error body: ${errorText.substring(0, 500)}...`);
              
              if (attempt === maxRetries) {
                await this.logWebhookEvent(analysisId, 'FAILED', `Failed to ${isZapier ? 'Zapier' : 'CRM'} after ${maxRetries} attempts - Status: ${response.status}`);
              }
            }
          } catch (error: any) {
            console.error(`❌ Webhook error (attempt ${attempt}/${maxRetries}):`, error.message);
            console.error('Error type:', error.name);
            console.error('Error stack:', error.stack);
            
            if (error.name === 'AbortError') {
              console.error('Request timed out after 15 seconds');
            }
            
            if (attempt === maxRetries) {
              await this.logWebhookEvent(analysisId, 'ERROR', `Network error to ${isZapier ? 'Zapier' : 'CRM'}: ${error.message}`);
            }
          }

          // Wait before retry
          if (attempt < maxRetries) {
            const waitTime = Math.pow(2, attempt) * 1000;
            console.log(`⏳ Waiting ${waitTime}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }
      console.log('✅ Webhook processing completed');
    } catch (error: any) {
      console.error('❌ Failed to process webhook:', error);
      console.error('Error stack:', error.stack);
      await this.logWebhookEvent(analysisId, 'ERROR', `Failed to build payload: ${error.message}`);
    }
  }

  private async buildWebhookPayload(analysis: any) {
    console.log('🏗️ Starting to build webhook payload...');
    const calculator = new LinkScoreCalculator();
    
    // Safely decrypt email with error handling
    let decryptedEmail = 'error@decrypting.email';
    try {
      console.log('🔐 Attempting to decrypt email...');
      decryptedEmail = decryptEmail(analysis.user.emailEncrypted);
      console.log('✅ Email decrypted successfully');
    } catch (error: any) {
      console.error('❌ Failed to decrypt email:', error.message);
      console.error('Email encrypted value:', analysis.user.emailEncrypted?.substring(0, 50) + '...');
      // Continue with error email rather than failing the whole webhook
    }
    
    // Australian locations mapping
    const AUSTRALIAN_LOCATIONS: Record<string, any> = {
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

    const locationInfo = AUSTRALIAN_LOCATIONS[analysis.user.location] || AUSTRALIAN_LOCATIONS.australia_general;

    // Build link score result
    console.log('📊 Building link score result...');
    const linkScoreResult = {
      overall: analysis.linkScore,
      breakdown: {
        competitivePosition: analysis.competitiveScore || 0,
        performanceVsExpected: analysis.performanceScore || 0,
        velocityComparison: 0,
        marketShareGrowth: 0,
        costEfficiency: 0,
        modifiers: 0
      },
      interpretation: {
        grade: analysis.linkScore >= 70 ? 'B' : analysis.linkScore >= 50 ? 'D' : 'F',
        label: analysis.linkScore >= 70 ? 'Good' : analysis.linkScore >= 50 ? 'Below Average' : 'Poor',
        message: 'Analysis completed',
        urgency: (analysis.linkScore <= 40 ? 'HIGH' : analysis.linkScore <= 60 ? 'MEDIUM' : 'LOW') as 'HIGH' | 'MEDIUM' | 'LOW' | 'CRITICAL'
      }
    };

    const leadScores = {
      priority: analysis.priorityScore,
      potential: analysis.potentialScore,
      overall: Math.round((analysis.priorityScore + analysis.potentialScore) / 2)
    };

    console.log('🎯 Calculating lead type and urgency...');
    let leadType = 'Unknown';
    let urgency = 'MEDIUM';
    
    try {
      leadType = calculator.getLeadType(leadScores, linkScoreResult);
      urgency = calculator.getUrgency(analysis.linkScore, analysis.priorityScore);
    } catch (error: any) {
      console.error('❌ Error calculating lead type/urgency:', error.message);
    }

    console.log('📦 Building final payload structure...');
    const payload = {
      // Format timestamp as string that Google Sheets won't convert
      timestamp: new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ''),
      timestampISO: new Date().toISOString(), // Keep original for other systems
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
        email: decryptedEmail,
        company: analysis.user.companyName || '',
        location: analysis.user.location,
        locationName: locationInfo.name,
        marketValue: locationInfo.marketValue
      },
      
      // Facebook attribution data for CAPI/Zapier
      facebookAttribution: {
        fbclid: analysis.user.facebookClickId,          // Facebook Click ID (from ads)
        fbp: analysis.user.facebookBrowserId,           // Facebook Browser ID (from pixel)
        clientIpAddress: analysis.user.ipAddress,
        clientUserAgent: analysis.user.userAgent,
        hasAttribution: !!(analysis.user.facebookClickId || analysis.user.facebookBrowserId),
        // Event IDs for deduplication when using both Pixel + CAPI
        eventIds: {
          leadEventId: `${analysis.id}_${Date.now()}_lead`,
          completeEventId: `${analysis.id}_${Date.now()}_complete`,
          baseEventId: `${analysis.id}_${Date.now()}`
        }
      },
      
      campaign: {
        monthlySpend: analysis.monthlySpend,
        investmentMonths: analysis.investmentMonths,
        investmentMonthsString: String(analysis.investmentMonths), // String version
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
        salesNotes: this.generateSalesNotes(analysis, leadScores)
      },
      
      strategy: this.getResultStrategy(analysis.linkScore),
      
      metadata: {
        dataforseoCost: analysis.dataforseoCostUsd || 0,
        processingTime: analysis.processingTimeSeconds || 0,
        apiVersion: "v3",
        toolVersion: "1.0.0"
      }
    };
    
    console.log('✅ Payload built successfully');
    console.log('📊 Payload summary:', {
      analysisId: payload.analysis.id,
      domain: payload.user.domain,
      linkScore: payload.results.linkScore,
      email: payload.user.email.substring(0, 3) + '***'
    });
    
    return payload;
  }

  private generateSalesNotes(analysis: any, leadScores: any): string[] {
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

  private getResultStrategy(linkScore: number) {
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
    facebookClickId?: string;
    facebookBrowserId?: string;
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
        userAgent: userData.userAgent,
        facebookClickId: userData.facebookClickId,
        facebookBrowserId: userData.facebookBrowserId
      }
    });
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
} 