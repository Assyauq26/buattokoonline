import { z } from "zod";

export const registrationEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Email tidak valid")
  .max(254);
/** One contract for the service, REST endpoint and Server Action. */
export const registrationSchema = z
  .object({
    name: z.string().trim().min(2, "Nama minimal 2 karakter").max(120),
    email: registrationEmailSchema,
    phone: z.string().trim().min(8, "Nomor HP wajib diisi").max(40),
    password: z
      .string()
      .min(6, "Password minimal 6 karakter")
      .max(256)
      .refine(
        (value) => new TextEncoder().encode(value).length <= 72,
        "Password maksimal 72 byte.",
      ),
    confirmPassword: z
      .string()
      .min(1, "Konfirmasi password wajib diisi")
      .max(256),
    terms: z.literal(true, {
      error: () => ({ message: "Anda harus menyetujui syarat & ketentuan" }),
    }),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Konfirmasi password tidak sama.",
    path: ["confirmPassword"],
  });

export const registrationVerificationSchema = z.object({
  email: registrationEmailSchema,
  challengeId: z.string().uuid("Sesi pendaftaran tidak valid. Daftar kembali."),
  otp: z.string().regex(/^\d{6}$/, "Kode OTP harus berisi 6 angka."),
});

export const registrationResendSchema = registrationVerificationSchema.pick({
  email: true,
  challengeId: true,
});
