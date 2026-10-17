"use client";

import dynamic from "next/dynamic";

/** The OTP form reads the tab's pending challenge (sessionStorage), so it renders in the browser only. */
export const OtpVerifyClient = dynamic(() => import("./OtpVerify").then((m) => m.OtpVerify), {
  ssr: false,
  loading: () => <div className="min-h-64 py-6" />,
});
