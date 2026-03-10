/**
 * Option C: WebSocket for Real-time Boosts
 *
 * Use wss://api.dexscreener.com/token-boosts/latest/v1
 * No rate limiting on WebSocket connections
 * Get updates pushed in real-time
 */

import { WebSocket } from 'ws';
import { dexScreenerLimiter } from '../../src/utils/rate-limiter';

const WS_URL = 'wss://api.dexscreener.com/token-boosts/latest/v1';

interface BoostMessage {
  limit?: number;
  data?: Array<{
    url: string;
    chainId: string;
    tokenAddress: string;
    amount?: number;
    totalAmount?: number;
    icon?: string;
    header?: string;
    description?: string;
  }>;
}

class BoostsWebSocket {
  private ws: WebSocket | null = null;
  private messageHandlers: Set<(data: any) => void> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        console.log('  ✓ WebSocket connected');
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data.toString());
          this.messageHandlers.forEach((handler) => handler(data));
        } catch (error) {
          // Ignore parse errors for non-JSON messages
        }
      };

      this.ws.onerror = (error) => {
        console.error('  ✗ WebSocket error:', error);
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('  ! WebSocket closed');
        this.ws = null;

        // Auto-reconnect
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`  ! Reconnecting... (attempt ${this.reconnectAttempts})`);
          setTimeout(() => this.connect().catch(() => {}), 2000);
        }
      };
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnect
      this.ws.close();
      this.ws = null;
    }
  }

  onMessage(handler: (data: any) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Test: Connect to WebSocket and receive 5 updates
async function testOptionC() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Option C: WebSocket for Real-time Boosts                  ║');
  console.log('║   No rate limits, real-time updates                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const startTime = Date.now();
  const messages: any[] = [];
  let solanaCount = 0;

  return new Promise((resolve) => {
    const ws = new BoostsWebSocket();
    const timeout = setTimeout(() => {
      console.log('  ! Test timeout after 30 seconds');
      ws.disconnect();
      resolveResults();
    }, 30000);

    let messageCount = 0;
    const targetMessages = 5;

    const unsubscribe = ws.onMessage((data: BoostMessage) => {
      messageCount++;
      const elapsed = Date.now() - startTime;

      if (data.data && Array.isArray(data.data)) {
        const solanaBoosts = data.data.filter((b: any) => b.chainId === 'solana');
        solanaCount = Math.max(solanaCount, solanaBoosts.length);
        messages.push(data);

        console.log(`  📨 Message ${messageCount}/${targetMessages} (${solanaBoosts.length} Solana boosts) in ${elapsed}ms`);
      }

      if (messageCount >= targetMessages) {
        clearTimeout(timeout);
        ws.disconnect();
        resolveResults();
      }
    });

    function resolveResults() {
      unsubscribe();
      const elapsed = Date.now() - startTime;
      const stats = dexScreenerLimiter.getStats();

      console.log('\n─────────────────────────────────────────────────────────────');
      console.log('Results:');
      console.log(`  Messages received: ${messages.length}/5`);
      console.log(`  Solana boosts: ${solanaCount}`);
      console.log(`  Total time: ${elapsed}ms`);
      console.log(`  Avg time per message: ${(elapsed / messages.length).toFixed(0)}ms`);
      console.log(`  Rate limiter stats:`, stats);
      console.log('  Note: WebSocket bypasses rate limits entirely!');
      console.log('─────────────────────────────────────────────────────────────\n');

      resolve({
        option: 'C',
        success: messages.length >= targetMessages,
        messageCount: messages.length,
        avgTimeMs: elapsed / Math.max(messages.length, 1),
        solanaCount,
        stats,
      });
    }

    // Connect and start listening
    ws.connect().catch((error) => {
      clearTimeout(timeout);
      console.error('  ✗ Failed to connect:', error);
      resolve({
        option: 'C',
        success: false,
        messageCount: 0,
        avgTimeMs: 0,
        solanaCount: 0,
        error: error.message,
      });
    });
  });
}

export { testOptionC };
