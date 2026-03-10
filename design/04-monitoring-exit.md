# 04. Monitoring & Exit Strategy

**Status:** Pending
**Last Updated:** 2025-03-10

---

## Overview

This document covers the real-time monitoring system and exit strategy implementation for both paper and live trading.

---

## Document Status

This design document is pending discussion. Topics to cover:

- [ ] WebSocket price monitoring architecture
- [ ] Trailing stop implementation details
- [ ] Partial exit logic (25% at +50%, 25% at +100%)
- [ ] Time-based exit (max 4 hours)
- [ ] Emergency exit conditions
- [ ] Dashboard/monitoring setup (Grafana or CLI)

---

## User-Confirmed Exit Parameters

| Parameter | Value | Source |
|-----------|-------|--------|
| Stop Loss | -40% | User confirmed |
| Trailing Stop | 15% after +100% | User confirmed |
| Max Hold Time | 4 hours | User confirmed |
| Partial Exits | 25% at +50%, 25% at +100% | Designed |

---

## Related Files

- Architecture: `design/01-architecture.md`
- Decimal Handling: `design/02-decimal-handling.md`
- Paper Trading: `design/03-paper-trading.md`
