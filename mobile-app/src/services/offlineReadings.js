import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { createReading } from './readings';

const STORAGE_KEY = 'nemexus.offlineReadings.v1';
const STORAGE_FILE = `${FileSystem.documentDirectory || FileSystem.cacheDirectory || ''}offline-readings.json`;

function createQueueId(payload) {
  return [
    payload.site_id || 'site',
    payload.slot_datetime || payload.reading_datetime || Date.now(),
    Math.random().toString(36).slice(2, 8),
  ].join(':');
}

function canUseWebStorage() {
  return Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage;
}

async function readRawQueue() {
  if (canUseWebStorage()) {
    return window.localStorage.getItem(STORAGE_KEY);
  }

  if (!STORAGE_FILE) {
    return null;
  }

  const info = await FileSystem.getInfoAsync(STORAGE_FILE);
  if (!info.exists) {
    return null;
  }

  return FileSystem.readAsStringAsync(STORAGE_FILE);
}

async function writeRawQueue(value) {
  if (canUseWebStorage()) {
    window.localStorage.setItem(STORAGE_KEY, value);
    return;
  }

  if (!STORAGE_FILE) {
    throw new Error('No writable device directory is available for offline readings.');
  }

  await FileSystem.writeAsStringAsync(STORAGE_FILE, value);
}

export async function listOfflineReadings() {
  try {
    const rawQueue = await readRawQueue();
    const parsed = rawQueue ? JSON.parse(rawQueue) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getOfflineReadingCount() {
  const queue = await listOfflineReadings();
  return queue.length;
}

export async function enqueueOfflineReading(payload, metadata = {}) {
  const queue = await listOfflineReadings();
  const duplicateIndex = queue.findIndex(
    (item) =>
      item?.payload?.site_id === payload.site_id &&
      item?.payload?.slot_datetime === payload.slot_datetime
  );

  if (duplicateIndex >= 0) {
    return {
      item: queue[duplicateIndex],
      duplicate: true,
    };
  }

  const nextItem = {
    id: createQueueId(payload),
    payload,
    metadata,
    queued_at: new Date().toISOString(),
    attempts: 0,
    last_error: '',
  };
  const nextQueue = [...queue, nextItem];

  await writeRawQueue(JSON.stringify(nextQueue));
  return {
    item: nextItem,
    duplicate: false,
  };
}

export function isLikelyOfflineError(error) {
  const message = String(error?.message || error || '').toLowerCase();

  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }

  return (
    message.includes('failed to fetch') ||
    message.includes('network request failed') ||
    message.includes('networkerror') ||
    message.includes('load failed') ||
    message.includes('fetch') ||
    message.includes('timeout') ||
    message.includes('offline')
  );
}

function isDuplicateReadingError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('duplicate') || message.includes('already exists');
}

export async function syncOfflineReadings() {
  const queue = await listOfflineReadings();
  const remaining = [];
  let synced = 0;
  let skipped = 0;
  let failed = 0;
  let lastError = '';

  for (const item of queue) {
    try {
      await createReading(item.payload);
      synced += 1;
    } catch (error) {
      if (isDuplicateReadingError(error)) {
        skipped += 1;
      } else {
        failed += 1;
        lastError = error.message || 'Failed to sync an offline reading.';
        remaining.push({
          ...item,
          attempts: (item.attempts || 0) + 1,
          last_error: lastError,
        });
      }
    }
  }

  await writeRawQueue(JSON.stringify(remaining));

  return {
    synced,
    skipped,
    failed,
    remaining: remaining.length,
    lastError,
  };
}
