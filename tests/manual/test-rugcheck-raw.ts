/**
 * Test RugCheck API raw response to debug validation issues
 */

async function testRugCheck() {
  const tokenAddress = 'DpxKNEi3XVeRByaGqYKvz2w6E2PhPgBAqdayLcQEpump'; // SOS token from test

  console.log(`Testing RugCheck API for: ${tokenAddress}`);
  console.log('');

  const response = await fetch(`https://api.rugcheck.xyz/v1/tokens/${tokenAddress}/report`);

  if (!response.ok) {
    console.error(`API returned ${response.status}`);
    return;
  }

  const data = await response.json();

  console.log('=== RAW RESPONSE STRUCTURE ===');
  console.log('');

  // Check fields that were causing validation issues
  console.log('1. knownAccounts type:', typeof data.knownAccounts, Array.isArray(data.knownAccounts));
  console.log('   Value:', JSON.stringify(data.knownAccounts).slice(0, 200));

  console.log('');
  console.log('2. launchpad type:', typeof data.launchpad);
  console.log('   Value:', JSON.stringify(data.launchpad));

  console.log('');
  console.log('3. token_extensions type:', typeof data.token_extensions);
  console.log('   Value:', JSON.stringify(data.token_extensions).slice(0, 200));

  console.log('');
  console.log('4. verification type:', typeof data.verification);
  console.log('   Value:', JSON.stringify(data.verification).slice(0, 200));

  console.log('');
  console.log('5. fileMeta type:', typeof data.fileMeta);
  console.log('   Value:', JSON.stringify(data.fileMeta).slice(0, 200));

  console.log('');
  console.log('=== ALL TOP-LEVEL KEYS ===');
  console.log(Object.keys(data).sort());

  console.log('');
  console.log('=== FULL RESPONSE ===');
  console.log(JSON.stringify(data, null, 2));
}

testRugCheck().catch(console.error);
