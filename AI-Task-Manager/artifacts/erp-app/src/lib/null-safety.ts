// J-03: Null Safety Utilities
export const NullSafe = {
  // Display numbers with default fallback
  number: (val: any, defaultVal: number = 0) => Number(val) || defaultVal,
  
  // Display currency with formatting
  currency: (val: any, defaultVal: string = "₪0.00") => {
    const num = Number(val);
    return isNaN(num) ? defaultVal : `₪${num.toLocaleString('he-IL', { minimumFractionDigits: 2 })}`;
  },
  
  // Display text with fallback
  text: (val: any, defaultVal: string = "—") => String(val || defaultVal).trim() || defaultVal,
  
  // Display date with Hebrew fallback
  date: (val: any, defaultVal: string = "לא הוגדר") => {
    if (!val) return defaultVal;
    try {
      return new Date(val).toLocaleDateString('he-IL');
    } catch {
      return defaultVal;
    }
  },
  
  // Display percentage
  percent: (val: any, defaultVal: string = "0%") => {
    const num = Number(val);
    return isNaN(num) ? defaultVal : `${num}%`;
  },
  
  // Display boolean as Hebrew
  boolean: (val: any, trueVal: string = "כן", falseVal: string = "לא") => {
    return val ? trueVal : falseVal;
  },
  
  // Display status with fallback
  status: (val: any, defaultVal: string = "לא הוגדר") => val || defaultVal,
};

// Helper for optional chaining with defaults
export const safe = <T>(val: T | null | undefined, defaultVal: T): T => val ?? defaultVal;
