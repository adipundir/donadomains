import { serve } from "inngest/next";
import { inngest } from "@/app/inngest/client";
import { scheduleDomainChecks, executeDomainCheck } from "@/app/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [scheduleDomainChecks, executeDomainCheck],
});
