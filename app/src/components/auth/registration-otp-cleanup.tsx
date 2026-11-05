"use client";

import { useEffect } from "react";
import { REGISTRATION_OTP_STORAGE_KEY } from "@/modules/auth/registration-contract";

/** Clear an OTP challenge only after the server has confirmed an authenticated account. */
export function RegistrationOtpCleanup() {
  useEffect(() => {
    try {
      window.sessionStorage.removeItem(REGISTRATION_OTP_STORAGE_KEY);
    } catch {
      // Private browsing may disable storage.
    }
  }, []);
  return null;
}
