declare module "lunar-javascript" {
  interface Lunar {
    getYearInGanZhi(): string;
    getYearShengXiao(): string;
    getMonthInChinese(): string;
    getDayInChinese(): string;
    getJieQi(): string;
    getFestivals(): string[];
  }
  interface Solar {
    getLunar(): Lunar;
    getFestivals(): string[];
  }
  interface Holiday {
    getName(): string;
    isWork(): boolean;
  }
  export const Solar: { fromDate(d: Date): Solar; fromYmd(y: number, m: number, d: number): Solar };
  export const HolidayUtil: { getHoliday(y: number, m: number, d: number): Holiday | null };
}
