import { getDbClient } from '../src/db';
import { createPositionRepository } from '../src/db/repositories/positions';

const db = getDbClient();
const positionsRepo = createPositionRepository(db.getDb());
const all = positionsRepo.findAll();

// Get the most recent position
const latest = all[all.length - 1];

if (latest && latest.state !== 'CLOSED') {
  console.log('Token Address:', latest.tokenMint);
  console.log('State:', latest.state);
  console.log('');
  console.log('DexScreener Link:');
  console.log('https://dexscreener.com/solana/' + latest.tokenMint);
} else {
  console.log('No open position');
}
