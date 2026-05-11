function pad(value) {
  return String(value).padStart(2, '0');
}

export function formatTimestamp(date) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') +
    ' ' +
    [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join(':');
}

export function roundDownTo30MinSlot(input) {
  const date = new Date(input);
  const minutes = date.getMinutes();
  date.setSeconds(0, 0);
  date.setMinutes(minutes < 30 ? 0 : 30);
  return date;
}
