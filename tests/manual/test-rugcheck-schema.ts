/**
 * Test RugCheck API with updated Zod schema
 */

import { RugCheckReportSchema } from '../../src/types';

async function testRugCheck() {
  const tokenAddress = 'DpxKNEi3XVeRByaGqYKvz2w6E2PhPgBAqdayLcQEpump';

  console.log(`Testing RugCheck API schema validation...`);
  console.log('');

  const response = await fetch(`https://api.rugcheck.xyz/v1/tokens/${tokenAddress}/report`);

  if (!response.ok) {
    console.error(`API returned ${response.status}`);
    return;
  }

  const data = await response.json();

  console.log('=== VALIDATING WITH ZOD SCHEMA ===');
  const result = RugCheckReportSchema.safeParse(data);

  if (result.success) {
    console.log('✅ Schema validation PASSED!');
    console.log('');
    console.log('Validated data:');
    console.log('  Token:', result.data.tokenMeta?.symbol);
    console.log('  Launchpad:', result.data.launchpad?.name ?? 'None');
    console.log('  Known Accounts:', Object.keys(result.data.knownAccounts ?? {}).length);
    console.log('  Score:', result.data.score);
    console.log('  Risks:', result.data.risks?.length ?? 0);
  } else {
    console.log('❌ Schema validation FAILED!');
    console.log('');
    console.log('Errors:', JSON.stringify(result.error.flatten(), null, 2));
  }
}

testRugCheck().catch(console.error);
