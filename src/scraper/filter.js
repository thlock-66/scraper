export function isWeekend(dateStr) {
  const day = new Date(dateStr + 'T00:00:00').getDay()
  return day === 0 || day === 6
}

export function filterSlots(slots, dateStr) {
  if (isWeekend(dateStr)) return slots
  return slots.filter(slot => slot.startTime >= '19:00')
}
