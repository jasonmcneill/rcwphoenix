/**
 * Returns the Date of U.S. Thanksgiving (fourth Thursday of November) for a given year.
 * @param {number} year
 * @returns {Date}
 */
function getThanksgivingDate(year) {
  // November 1 of the target year
  const novFirst = new Date(year, 10, 1);
  const dayOfWeek = novFirst.getDay(); // 0 = Sunday, 4 = Thursday

  // Days until the first Thursday of November
  const daysToFirstThursday = (4 - dayOfWeek + 7) % 7;

  // Fourth Thursday is 21 days (3 weeks) after the first Thursday
  const fourthThursdayDay = 1 + daysToFirstThursday + 21;
  return new Date(year, 10, fourthThursdayDay);
}

/**
 * Checks whether a given Date falls within the Sunday-to-Saturday week of U.S. Thanksgiving.
 * @param {Date} date
 * @returns {boolean}
 */
function isDuringThanksgivingWeek(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return false;
  }

  const thanksgiving = getThanksgivingDate(date.getFullYear());

  // Sunday of Thanksgiving week
  const weekStart = new Date(
    thanksgiving.getFullYear(),
    thanksgiving.getMonth(),
    thanksgiving.getDate() - thanksgiving.getDay(),
    0,
    0,
    0,
    0,
  );

  // Saturday of Thanksgiving week
  const weekEnd = new Date(
    weekStart.getFullYear(),
    weekStart.getMonth(),
    weekStart.getDate() + 6,
    23,
    59,
    59,
    999,
  );

  const normalizedDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
    0,
    0,
    0,
  );

  return normalizedDate >= weekStart && normalizedDate <= weekEnd;
}

/**
 * Extracts a Date from an element's `data-date`, `datetime`, or text content,
 * falling back to the current date if no parseable date is found.
 * @param {Element} el
 * @returns {Date}
 */
function extractElementDate(el) {
  const rawValue =
    el.getAttribute("data-date") ||
    el.getAttribute("datetime") ||
    el.textContent?.trim();

  if (rawValue) {
    // Handle ISO date strings (YYYY-MM-DD) in local time to avoid UTC off-by-one shifts
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawValue);
    if (isoMatch) {
      const year = Number(isoMatch[1]);
      const month = Number(isoMatch[2]) - 1;
      const day = Number(isoMatch[3]);
      return new Date(year, month, day);
    }

    const parsed = new Date(rawValue);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}

/**
 * Finds all elements with class "cancelledDuringThanksgivingWeek" and removes
 * the "hidden" attribute if their associated date falls during U.S. Thanksgiving week.
 */
function addThanksgivingHolidayNotice() {
  const elements = document.querySelectorAll(
    ".cancelledDuringThanksgivingWeek",
  );

  elements.forEach((el) => {
    const targetDate = extractElementDate(el);
    if (isDuringThanksgivingWeek(targetDate)) {
      el.removeAttribute("hidden");
    }
  });
}
