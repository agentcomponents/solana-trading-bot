// Quick test to see if WebSocket receives any data
import WebSocket from 'ws';

const ws = new WebSocket('wss://api.dexscreener.com/token-boosts/latest/v1');

let messageCount = 0;
let solanaCount = 0;

ws.on('open', () => {
  console.log('✅ Connected to DexScreener WebSocket');
  setTimeout(() => {
    ws.close();
    console.log(`\nResults: ${messageCount} total messages, ${solanaCount} Solana tokens`);
  }, 30000);
});

ws.on('message', (data) => {
  messageCount++;
  try {
    const msg = JSON.parse(data.toString());
    if (msg.data && Array.isArray(msg.data)) {
      const solana = msg.data.filter(b => b.chainId === 'solana');
      if (solana.length > 0) {
        solanaCount++;
        console.log(`📩 Message ${messageCount}: ${solana.length} Solana token(s)`);
        solana.slice(0, 2).forEach(s => {
          console.log(`   - ${s.tokenAddress?.substring(0, 8)}...`);
        });
      }
    }
  } catch (e) {
    console.log(`⚠️  Parse error on message ${messageCount}`);
  }
});

ws.on('error', (err) => console.error('Error:', err.message));
