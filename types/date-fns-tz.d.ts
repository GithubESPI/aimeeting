declare module "date-fns-tz" {
    export function zonedTimeToUtc(
        date: Date | number | string,
        timeZone: string
    ): Date;
}
