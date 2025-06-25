// Test file for Analysis Engine v2
// Run with: npx tsx src/lib/test-analysis-engine-v2.ts

import { AnalysisEngineV2 } from './analysis-engine-v2';
import { LinkScoreCalculator } from './link-score';

async function testAnalysisEngine() {
  console.log('🧪 Testing Analysis Engine v2...\n');
  
  // Create instances
  const linkScoreCalculator = new LinkScoreCalculator();
  const analysisEngine = new AnalysisEngineV2(linkScoreCalculator);
  
  // Test input
  const testInput = {
    domain: 'example.com.au',
    keywords: ['melbourne plumber', 'plumbing services'],
    location: 'melbourne',
    monthlySpend: 5000,
    investmentMonths: 12,
    campaignStartDate: new Date('2023-12-01')
  };
  
  try {
    console.log('📊 Running analysis for:', testInput.domain);
    console.log('   Keywords:', testInput.keywords.join(', '));
    console.log('   Location:', testInput.location);
    console.log('   Investment: $' + testInput.monthlySpend + '/month for ' + testInput.investmentMonths + ' months');
    console.log('   Campaign start:', testInput.campaignStartDate.toISOString().split('T')[0]);
    console.log('');
    
    const result = await analysisEngine.runAnalysis(testInput);
    
    console.log('\n📈 ANALYSIS RESULTS:');
    console.log('=====================================\n');
    
    console.log('Domain Metrics:');
    console.log(`   Current authority links: ${result.metrics.currentAuthorityLinks}`);
    console.log(`   Historical authority links: ${result.metrics.historicalAuthorityLinks}`);
    console.log(`   Links gained: ${result.metrics.linkGrowth}`);
    console.log(`   Growth rate: ${result.metrics.linkGrowthRate.toFixed(1)}%`);
    
    console.log('\nTop Competitors:');
    result.competitors.forEach((comp, i) => {
      console.log(`   ${i + 1}. ${comp.domain}`);
      console.log(`      - Current: ${comp.currentAuthorityLinks} links`);
      console.log(`      - Growth: ${comp.linkGrowth} links (${comp.linkGrowthRate.toFixed(1)}%)`);
    });
    
    console.log('\nLink Gaps Found:', result.linkGaps.length);
    if (result.linkGaps.length > 0) {
      console.log('   Top 5 opportunities:');
      result.linkGaps.slice(0, 5).forEach((gap, i) => {
        console.log(`   ${i + 1}. ${gap.domain} (Rank: ${gap.rank})`);
      });
    }
    
    if (result.linkScore) {
      console.log('\nLinkScore Results:');
      console.log(`   Overall Score: ${result.linkScore.overall}/100 (${result.linkScore.interpretation.grade})`);
      console.log(`   Label: ${result.linkScore.interpretation.label}`);
      console.log(`   Message: ${result.linkScore.interpretation.message}`);
      console.log(`   Urgency: ${result.linkScore.interpretation.urgency}`);
      
      console.log('\n   Score Breakdown:');
      console.log(`   - Competitive Position: ${result.linkScore.breakdown.competitivePosition}/30`);
      console.log(`   - Performance vs Expected: ${result.linkScore.breakdown.performanceVsExpected}/25`);
      console.log(`   - Velocity Comparison: ${result.linkScore.breakdown.velocityComparison}/20`);
      console.log(`   - Market Share Growth: ${result.linkScore.breakdown.marketShareGrowth}/15`);
      console.log(`   - Cost Efficiency: ${result.linkScore.breakdown.costEfficiency}/10`);
      console.log(`   - Modifiers: ${result.linkScore.breakdown.modifiers}`);
    }
    
    console.log('\nAnalysis Summary:');
    console.log(`   Processing time: ${result.processingTime} seconds`);
    console.log(`   Total cost: $${result.totalCost.toFixed(4)}`);
    
  } catch (error) {
    console.error('❌ Analysis failed:', error);
  }
}

// Run the test
testAnalysisEngine(); 