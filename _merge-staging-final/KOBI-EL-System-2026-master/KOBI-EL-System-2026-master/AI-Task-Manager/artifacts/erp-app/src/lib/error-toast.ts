import { useToast } from "@/hooks/use-toast";
import { getHebrewErrorMessage, formatErrorMessage } from "./hebrew-error-messages";

export function useErrorToast() {
  const { toast } = useToast();

  return {
    error: (errorCode: number | string | any, title: string = "שגיאה") => {
      const message = typeof errorCode === "object" 
        ? formatErrorMessage(errorCode)
        : getHebrewErrorMessage(errorCode);
      
      toast({
        variant: "destructive",
        title,
        description: message,
      });
    },
    
    apiError: (error: any, title: string = "שגיאה בשרת") => {
      const statusCode = error?.response?.status || error?.status || error?.code;
      const message = formatErrorMessage(error);
      
      toast({
        variant: "destructive",
        title,
        description: message,
      });
    },

    validationError: (fieldName: string) => {
      toast({
        variant: "destructive",
        title: "שגיאת תיקוף",
        description: `${fieldName}: ${getHebrewErrorMessage("REQUIRED_FIELD")}`,
      });
    }
  };
}
