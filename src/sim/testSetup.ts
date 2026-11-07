import { ECONOMY } from '../data/economy';

// Round 6 block 5: most sim tests start a day and expect arrivals straight away, so they run without the open grace
// window; src/sim/openGrace.test.ts puts the real value back to test it.
(ECONOMY as { openGraceSeconds: number }).openGraceSeconds = 0;
