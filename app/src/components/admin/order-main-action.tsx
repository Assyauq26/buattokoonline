import Link from "next/link";
import { PreparePackageButton } from "./prepare-package-button";
import { CreateAwbButton } from "./create-awb-button";
import { AwbPrintButton } from "./awb-print-button";
import { PERMISSIONS } from "@/lib/auth/permissions";
export function OrderMainAction({
  orderId,
  action,
  label,
  permissions,
  official = true,
  caseId,
}: {
  orderId: string;
  action: string;
  label: string;
  permissions: string[];
  official?: boolean;
  caseId?: string;
}) {
  const has = (p: string) => permissions.includes(p),
    href = `/admin/orders/${orderId}`;
  if (action === "prepare" && has(PERMISSIONS.ORDER_UPDATE))
    return <PreparePackageButton orderId={orderId} />;
  if (
    action === "create" &&
    official &&
    has(PERMISSIONS.SHIPPING_CREATE) &&
    has(PERMISSIONS.SHIPPING_READ)
  )
    return <CreateAwbButton orderId={orderId} label={label} />;
  if (action === "print" && has(PERMISSIONS.SHIPPING_READ))
    return <AwbPrintButton orderId={orderId} primary />;
  return (
    <Link
      className={
        ["track", "history", "detail"].includes(action)
          ? "flow-secondary"
          : "flow-primary"
      }
      href={
        action === "verify"
          ? href + "/payment"
          : action === "case"
            ? href + "/resolution" + (caseId ? "?case=" + caseId : "")
            : href +
              (["track", "history", "create"].includes(action)
                ? "#order-shipping"
                : "")
      }
    >
      {label}
    </Link>
  );
}
