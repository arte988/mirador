/**
 * Dose budget, a reference calculation and NOT a dosimeter.
 *
 * Rate: the Radiation Assessment Detector (RAD) on Curiosity measured a galactic cosmic ray dose equivalent on the
 * Mars surface of about 0.64 mSv per day (Hassler et al. 2014, Science 343, 1244797, ~300 sols near solar maximum;
 * the figure is quoted in Front. Nucl. Med. 2023, doi 10.3389/fnume.2023.1225034). It varies with the solar cycle
 * and with shielding. We apply it unchanged to time spent outside: no suit shielding correction and no solar
 * particle event (SEP), which can dominate a dose and must make the plan abort, not be "budgeted".
 */
export const MSL_RAD_SURFACE_MSV_PER_DAY = 0.64
export const DOSE_SOURCE = 'Hassler et al. 2014, Science 343:1244797 (MSL RAD)'
export const DOSE_DOI = 'https://doi.org/10.1126/science.1244797'

/** Reference GCR dose equivalent (mSv) for a time spent on the surface. */
export function evaDoseMsv(durationS: number, rateMsvPerDay = MSL_RAD_SURFACE_MSV_PER_DAY): number {
  return (Math.max(0, durationS) / 86400) * rateMsvPerDay
}

/** Share of the budget used (can exceed 1). Budget 0 or less counts as fully used. */
export function budgetShare(doseMsv: number, budgetMsv: number): number {
  return budgetMsv > 0 ? doseMsv / budgetMsv : Infinity
}
