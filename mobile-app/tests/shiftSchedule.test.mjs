import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(rootDir, 'src', 'utils', 'shiftSchedule.js');
const tempDir = await mkdtemp(path.join(tmpdir(), 'nemexus-shift-schedule-'));
const tempModulePath = path.join(tempDir, 'shiftSchedule.mjs');

try {
  await writeFile(tempModulePath, await readFile(sourcePath, 'utf8'));

  const {
    formatShiftBatchSlots,
    isShiftBatchEntryWindow,
    minutesSinceMidnight,
    nextShiftBatchEntryText,
    shiftNameForSlot,
  } = await import(pathToFileURL(tempModulePath).href);

  assert.equal(minutesSinceMidnight(new Date(2026, 0, 1, 15, 0)), 900);
  assert.equal(formatShiftBatchSlots(), '6:00 AM - 6:59 AM, 2:00 PM - 2:59 PM, 11:00 PM - 11:59 PM');

  assert.equal(isShiftBatchEntryWindow(new Date(2026, 0, 1, 6, 0)), true);
  assert.equal(isShiftBatchEntryWindow(new Date(2026, 0, 1, 6, 30)), true);
  assert.equal(isShiftBatchEntryWindow(new Date(2026, 0, 1, 6, 59)), true);
  assert.equal(isShiftBatchEntryWindow(new Date(2026, 0, 1, 14, 0)), true);
  assert.equal(isShiftBatchEntryWindow(new Date(2026, 0, 1, 14, 30)), true);
  assert.equal(isShiftBatchEntryWindow(new Date(2026, 0, 1, 14, 59)), true);
  assert.equal(isShiftBatchEntryWindow(new Date(2026, 0, 1, 23, 0)), true);
  assert.equal(isShiftBatchEntryWindow(new Date(2026, 0, 1, 23, 30)), true);
  assert.equal(isShiftBatchEntryWindow(new Date(2026, 0, 1, 23, 59)), true);

  assert.equal(isShiftBatchEntryWindow(new Date(2026, 0, 1, 0, 0)), false);
  assert.equal(isShiftBatchEntryWindow(new Date(2026, 0, 1, 5, 30)), false);
  assert.equal(isShiftBatchEntryWindow(new Date(2026, 0, 1, 7, 0)), false);
  assert.equal(isShiftBatchEntryWindow(new Date(2026, 0, 1, 13, 30)), false);
  assert.equal(isShiftBatchEntryWindow(new Date(2026, 0, 1, 15, 0)), false);
  assert.equal(isShiftBatchEntryWindow(new Date(2026, 0, 1, 22, 30)), false);

  assert.equal(
    nextShiftBatchEntryText(new Date(2026, 0, 1, 7, 0)),
    'Available 2:00 PM - 2:59 PM'
  );
  assert.equal(
    nextShiftBatchEntryText(new Date(2026, 0, 1, 15, 0)),
    'Available 11:00 PM - 11:59 PM'
  );
  assert.equal(shiftNameForSlot(new Date(2026, 0, 1, 7, 0)), 'A-Shift');
  assert.equal(shiftNameForSlot(new Date(2026, 0, 1, 15, 0)), 'B-Shift');
  assert.equal(shiftNameForSlot(new Date(2026, 0, 1, 23, 0)), 'C-Shift');
  assert.equal(shiftNameForSlot(new Date(2026, 0, 1, 1, 0)), 'C-Shift');

  console.log('shift schedule utility tests passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
