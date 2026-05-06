const SHIFT_BATCH_SLOT_MINUTES = [
  0, // 2400H / midnight
  7 * 60, // 0700H
  15 * 60, // 1500H
];

const DAY_MINUTES = 24 * 60;
const ENTRY_WINDOW_START_MINUTES_BEFORE_SHIFT = 60;
const ENTRY_WINDOW_END_MINUTES_BEFORE_SHIFT = 1;

export function minutesSinceMidnight(input) {
  const date = new Date(input);
  return date.getHours() * 60 + date.getMinutes();
}

export function formatShiftBatchSlotMinutes(minutes) {
  const normalizedMinutes = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;

  if (normalizedMinutes === 0) {
    return '2400H';
  }

  const hoursText = String(Math.floor(normalizedMinutes / 60)).padStart(2, '0');
  const minutesText = String(normalizedMinutes % 60).padStart(2, '0');
  return `${hoursText}${minutesText}H`;
}

export function formatShiftBatchWindowTime(minutes) {
  const normalizedMinutes = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const hours24 = Math.floor(normalizedMinutes / 60);
  const mins = normalizedMinutes % 60;
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;

  return `${hours12}:${String(mins).padStart(2, '0')} ${suffix}`;
}

export function nextShiftBatchSlotMinutes(input) {
  const currentMinutes = minutesSinceMidnight(input);
  return SHIFT_BATCH_SLOT_MINUTES.find((minutes) => minutes > currentMinutes) ?? DAY_MINUTES;
}

export function isShiftBatchEntryWindow(input) {
  const currentMinutes = minutesSinceMidnight(input);
  const minutesUntilNextShift = nextShiftBatchSlotMinutes(input) - currentMinutes;

  return (
    minutesUntilNextShift <= ENTRY_WINDOW_START_MINUTES_BEFORE_SHIFT &&
    minutesUntilNextShift >= ENTRY_WINDOW_END_MINUTES_BEFORE_SHIFT
  );
}

export function shiftNameForSlot(input) {
  const minutes = minutesSinceMidnight(input);

  if (minutes >= 7 * 60 && minutes < 15 * 60) {
    return 'A-Shift';
  }

  if (minutes >= 15 * 60 && minutes < 23 * 60) {
    return 'B-Shift';
  }

  return 'C-Shift';
}

export function nextShiftBatchEntryText(input) {
  const currentMinutes = minutesSinceMidnight(input);
  let nextBatchMinutes = nextShiftBatchSlotMinutes(input);
  const minutesUntilNextShift = nextBatchMinutes - currentMinutes;

  if (minutesUntilNextShift < ENTRY_WINDOW_END_MINUTES_BEFORE_SHIFT) {
    const followingBatch = SHIFT_BATCH_SLOT_MINUTES.find((minutes) => minutes > nextBatchMinutes);
    nextBatchMinutes = followingBatch ?? DAY_MINUTES + SHIFT_BATCH_SLOT_MINUTES[1];
  }

  const windowStart = nextBatchMinutes - ENTRY_WINDOW_START_MINUTES_BEFORE_SHIFT;
  const windowEnd = nextBatchMinutes - ENTRY_WINDOW_END_MINUTES_BEFORE_SHIFT;

  return `Available ${formatShiftBatchWindowTime(windowStart)} - ${formatShiftBatchWindowTime(windowEnd)}`;
}

export function nextShiftBatchEntryWindow24hText(input) {
  const currentMinutes = minutesSinceMidnight(input);
  let nextBatchMinutes = nextShiftBatchSlotMinutes(input);
  const minutesUntilNextShift = nextBatchMinutes - currentMinutes;

  if (minutesUntilNextShift < ENTRY_WINDOW_END_MINUTES_BEFORE_SHIFT) {
    const followingBatch = SHIFT_BATCH_SLOT_MINUTES.find((minutes) => minutes > nextBatchMinutes);
    nextBatchMinutes = followingBatch ?? DAY_MINUTES + SHIFT_BATCH_SLOT_MINUTES[1];
  }

  const windowStart = nextBatchMinutes - ENTRY_WINDOW_START_MINUTES_BEFORE_SHIFT;
  const windowEnd = nextBatchMinutes - ENTRY_WINDOW_END_MINUTES_BEFORE_SHIFT;

  return `${formatShiftBatchSlotMinutes(windowStart)}-${formatShiftBatchSlotMinutes(
    windowEnd
  )}`;
}

export function formatShiftBatchSlots() {
  return '6:00 AM - 6:59 AM, 2:00 PM - 2:59 PM, 11:00 PM - 11:59 PM';
}
