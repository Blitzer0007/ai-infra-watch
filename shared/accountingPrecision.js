// Half of the stored holding's 8-decimal share unit. Never scale closure by
// position size: a small positive remainder still owns its recorded cost.
export const QUANTITY_EPSILON = 0.000000005;
