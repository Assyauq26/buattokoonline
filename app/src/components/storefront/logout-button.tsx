"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/modules/auth/auth.actions";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      onClick={() => start(() => logoutAction())}
      disabled={pending}
      data-testid="logout-btn"
    >
      <LogOut size={16} /> {pending ? "Keluar..." : "Keluar"}
    </Button>
  );
}
