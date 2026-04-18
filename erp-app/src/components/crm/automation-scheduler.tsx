import { useEffect } from "react";
import { runAllAutomations } from "./advanced-automations";

/**
 * Background Automation Scheduler
 * Runs advanced automations every 5 minutes
 */
export default function AutomationScheduler() {
  useEffect(() => {
    // Run immediately
    runAllAutomations();

    // Run every 5 minutes
    const interval = setInterval(() => {
      runAllAutomations();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return null;
}
