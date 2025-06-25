// Test file for DataForSEO Client v2
// Run with: npx tsx src/lib/test-dataforseo-v2.ts

import { DataForSEOClient } from './dataforseo-v2';

async function testDataForSEOClient() {
  console.log('🧪 Testing DataForSEO Client v2...\n');
  
  const client = new DataForSEOClient();
  
  // Test domain - using a well-known site with good backlink profile
  const testDomain = 'forbes.com';
  const testDate = '2024-10-01';
  const testKeywords = ['business news', 'forbes'];
  const testLocation = 'sydney';
  
  try {
    // Test 1: Get Current Authority Domains
    console.log('📋 Test 1: Getting current authority domains...');
    console.time('getCurrentAuthorityDomains');
    const authorityDomains = await client.getCurrentAuthorityDomains(testDomain);
    console.timeEnd('getCurrentAuthorityDomains');
    console.log(`✅ Found ${authorityDomains.length} authority domains`);
    console.log('Sample domains:', authorityDomains.slice(0, 3).map(d => ({
      domain: d.domain,
      rank: d.rank,
      spam_score: d.backlinks_spam_score,
      traffic: d.traffic
    })));
    console.log('\n');
    
    // Test 2: Get Historical Snapshot
    console.log('📋 Test 2: Getting historical snapshot...');
    console.time('getHistoricalSnapshot');
    const historicalData = await client.getHistoricalSnapshot(testDomain, testDate);
    console.timeEnd('getHistoricalSnapshot');
    console.log('✅ Historical data:', historicalData);
    console.log('\n');
    
    // Test 3: Find Competitors
    console.log('📋 Test 3: Finding competitors...');
    console.time('findCompetitors');
    const competitors = await client.findCompetitors(testKeywords, testLocation);
    console.timeEnd('findCompetitors');
    console.log(`✅ Found ${competitors.length} competitors:`, competitors);
    console.log('\n');
    
    // Test 4: Find Link Gaps (using found competitors)
    if (competitors.length > 0) {
      console.log('📋 Test 4: Finding link gaps...');
      console.time('findLinkGaps');
      const linkGaps = await client.findLinkGaps(testDomain, competitors.slice(0, 3));
      console.timeEnd('findLinkGaps');
      console.log(`✅ Found ${linkGaps.length} link gap opportunities`);
      console.log('Top gaps:', linkGaps.slice(0, 3).map(g => ({
        domain: g.domain,
        rank: g.rank,
        intersections: g.intersections
      })));
    }
    
    // Test 5: Find link gaps
    console.log('\n📋 Test 5: Finding link gaps...');
    console.time('findLinkGaps');
    const linkGaps = await client.findLinkGaps(testDomain, competitors);
    console.timeEnd('findLinkGaps');
    console.log(`✅ Found ${linkGaps.length} link gap opportunities`);
    if (linkGaps.length > 0) {
      console.log('Sample link gaps:', linkGaps.slice(0, 3));
    }
    
    // Test 6: Get historical authority domains with full filtering
    console.log('\n📋 Test 6: Getting historical authority domains with full filtering...');
    console.time('getHistoricalAuthorityDomains');
    const historicalAuthority = await client.getHistoricalAuthorityDomains(testDomain, testDate);
    console.timeEnd('getHistoricalAuthorityDomains');
    console.log(`✅ Found ${historicalAuthority.total_authority_domains} authority domains that existed on ${testDate}`);
    console.log(`   Total referring domains on that date: ${historicalAuthority.total_referring_domains}`);
    if (historicalAuthority.authority_domains.length > 0) {
      console.log('Sample historical authority domains:', historicalAuthority.authority_domains.slice(0, 3));
    } else {
      console.log('   (No domains found - this might be due to the 2000 domain limit or traffic filtering)');
    }
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  testDataForSEOClient();
}

export { testDataForSEOClient }; 