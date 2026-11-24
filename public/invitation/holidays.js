(() => {
  /**
   * Returns the Date of U.S. Thanksgiving (fourth Thursday of November) for a given year.
   * @param {number} year
   * @returns {Date}
   */
  function getThanksgivingDate(year) {
    const novFirst = new Date(year, 10, 1); // Month 10 = November
    const dayOfWeek = novFirst.getDay(); // 0 = Sunday, 4 = Thursday
    const daysToFirstThursday = (4 - dayOfWeek + 7) % 7;
    const fourthThursdayDay = 1 + daysToFirstThursday + 21;
    return new Date(year, 10, fourthThursdayDay);
  }

  /**
   * Checks whether `date` falls within the Sunday-to-Saturday week of Thanksgiving.
   * @param {Date} date
   * @returns {boolean}
   */
  function isDuringThanksgivingWeek(date) {
    const thanksgiving = getThanksgivingDate(date.getFullYear());

    const weekStart = new Date(
      thanksgiving.getFullYear(),
      thanksgiving.getMonth(),
      thanksgiving.getDate() - thanksgiving.getDay(), // Sunday
      0,
      0,
      0,
      0,
    );

    const weekEnd = new Date(
      weekStart.getFullYear(),
      weekStart.getMonth(),
      weekStart.getDate() + 6, // Saturday
      23,
      59,
      59,
      999,
    );

    return date >= weekStart && date <= weekEnd;
  }

  /**
   * Checks whether `date` falls between December 24 and December 26 (inclusive).
   * @param {Date} date
   * @returns {boolean}
   */
  function isDuringChristmasWeek(date) {
    const year = date.getFullYear();
    const start = new Date(year, 11, 24, 0, 0, 0, 0); // Month 11 = December
    const end = new Date(year, 11, 26, 23, 59, 59, 999);
    return date >= start && date <= end;
  }

  /**
   * Removes the "hidden" attribute from all elements matching `selector`.
   * @param {string} selector
   */
  function unhideElements(selector) {
    document.querySelectorAll(selector).forEach((el) => {
      el.removeAttribute("hidden");
    });
  }

  function init() {
    const now = new Date();

    if (isDuringThanksgivingWeek(now)) {
      unhideElements(".cancelledDuringThanksgivingWeek");
    }

    if (isDuringChristmasWeek(now)) {
      unhideElements(".cancelledDuringChristmasWeek");
    }
  }

  init();
})();
