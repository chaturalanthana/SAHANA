# Capacity note

Date: 31 October 2026.

`apps/api/test/capacity.test.ts` inserts 40 members in one society and checks that a page of 25 returns 25 rows with a total of 40. That is a pagination check.

A representative 100,000-member dataset was not loaded. No latency target from OD-07 was measured, and no capacity pass is claimed.
