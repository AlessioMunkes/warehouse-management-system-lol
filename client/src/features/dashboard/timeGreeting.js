// "Good morning" / "Good afternoon" / "Good evening" by the reader's
// clock — the greeting on every dashboard.
export const timeGreeting = (now = new Date()) => {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};
