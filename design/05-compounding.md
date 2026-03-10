# 05. Position Compounding Logic

**Status:** Pending
**Last Updated:** 2025-03-10

---

## Overview

This document covers the compounding strategy for growing the trading capital.

---

## User Requirements

> "After tripling initial amount to 0.3 SOL, compound the 0.1 SOL base after every trade"

---

## Compounding Strategy

```
Initial State:
- Total SOL: 0.1
- Base SOL: 0.1
- Profit SOL: 0

After Trade 1 (Profit: +0.05 SOL):
- Total SOL: 0.15
- Base SOL: 0.1
- Profit SOL: 0.05

After Trade 2 (Profit: +0.1 SOL):
- Total SOL: 0.25
- Base SOL: 0.1
- Profit SOL: 0.15

After Trade 3 (Total: 0.3 SOL reached!):
- Total SOL: 0.3
- Base SOL: 0.15 (compounded!)
- Profit SOL: 0.15

Now trade with 0.15 SOL base...
```

---

## Document Status

This design document is pending discussion. Topics to cover:

- [ ] Exact compounding formula
- [ ] When to compound (at what total threshold)
- [ ] How to handle losses (reduce base?)
- [ ] Position sizing with larger base
- [ ] Risk management as capital grows

---

## Related Files

- Architecture: `design/01-architecture.md`
- Paper Trading: `design/03-paper-trading.md`
