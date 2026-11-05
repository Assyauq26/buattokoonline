/** Normalized internal shipping models — UI never sees provider-specific shapes. */
export interface ShippingRate {
  courier: string;
  service: string;
  cost: number;
  etd?: string;
  mode?: "manual" | "official";
  reference?: string;
  validUntil?: string;
}

export interface ShippingDestination {
  provinceCode: string; cityCode: string; districtCode: string; villageCode: string;
  province: string; city: string; district: string; village: string; postalCode: string;
}
export interface ShippingPackage {
  productId: string; quantity: number; weightGram: number;
  lengthMm?: number | null; widthMm?: number | null; heightMm?: number | null;
}
export interface ShippingInquiry {
  destination: ShippingDestination;
  weightGram: number;
  packages: ShippingPackage[];
}

export interface TrackingEvent {
  status: string;
  description: string;
  occurredAt: Date;
}

export interface ShippingProvider {
  readonly code: string;
  readonly capabilities: string[];
  getRates?(input: ShippingInquiry): Promise<ShippingRate[]>;
  createShipment?(input: unknown): Promise<{ trackingNumber: string }>;
  cancelShipment?(trackingNumber: string): Promise<void>;
  trackShipment?(trackingNumber: string): Promise<TrackingEvent[]>;
}
