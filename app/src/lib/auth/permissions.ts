export const PERMISSIONS = {
  STORE_CUSTOMIZE_READ: "store.customize.read",
  STORE_CUSTOMIZE_UPDATE: "store.customize.update",
  STORE_CUSTOMIZE_PUBLISH: "store.customize.publish",
  PRODUCT_READ: "product.read",
  PRODUCT_CREATE: "product.create",
  PRODUCT_UPDATE: "product.update",
  PRODUCT_DELETE: "product.delete",
  INVENTORY_READ: "inventory.read",
  INVENTORY_ADJUST: "inventory.adjust",
  ORDER_READ: "order.read",
  ORDER_UPDATE: "order.update",
  ORDER_CANCEL: "order.cancel",
  PAYMENT_READ: "payment.read",
  PAYMENT_VERIFY: "payment.verify",
  SHIPPING_READ: "shipping.read",
  SHIPPING_CREATE: "shipping.create",
  SHIPPING_UPDATE: "shipping.update",
  CUSTOMER_READ: "customer.read",
  PROMOTION_CREATE: "promotion.create",
  PROMOTION_UPDATE: "promotion.update",
  BANK_MANAGE: "bank.manage",
  AUDIT_READ: "audit.read",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

/** Role -> permission keys. Admin manages this store. */
export const ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  Admin: ALL_PERMISSIONS,
  Manager: [
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.PRODUCT_CREATE,
    PERMISSIONS.PRODUCT_UPDATE,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_ADJUST,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_UPDATE,
    PERMISSIONS.PAYMENT_READ,
    PERMISSIONS.PAYMENT_VERIFY,
    PERMISSIONS.SHIPPING_READ,
    PERMISSIONS.SHIPPING_CREATE,
    PERMISSIONS.SHIPPING_UPDATE,
    PERMISSIONS.CUSTOMER_READ,
  ],
  CS: [
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.PAYMENT_READ,
    PERMISSIONS.SHIPPING_READ,
  ],
  Warehouse: [
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_ADJUST,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.SHIPPING_READ,
    PERMISSIONS.SHIPPING_CREATE,
    PERMISSIONS.SHIPPING_UPDATE,
  ],
  Marketing: [
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.PROMOTION_CREATE,
    PERMISSIONS.PROMOTION_UPDATE,
  ],
  Finance: [
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.PAYMENT_READ,
    PERMISSIONS.PAYMENT_VERIFY,
    PERMISSIONS.BANK_MANAGE,
  ],
  Customer: [],
};

export const ADMIN_ROLES = [
  "Admin",
  "Manager",
  "CS",
  "Warehouse",
  "Marketing",
  "Finance",
];
