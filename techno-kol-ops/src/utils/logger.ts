const isProd = process.env.NODE_ENV === 'production';

export const log = (...args: any[]) => !isProd && console.log(...args);
export const warn = (...args: any[]) => console.warn(...args);
export const error = (...args: any[]) => console.error(...args);
