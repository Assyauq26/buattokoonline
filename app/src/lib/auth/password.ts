import bcrypt from "bcryptjs";

export async function hashPassword(plain: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

export async function verifyPassword(
  plain: string,
  hashed: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hashed);
}

// Public dummy cost-10 hash used only to equalize credential-check work.
export const DUMMY_PASSWORD_HASH = "$2a$10$/Wd7tnNmqH5h1b2JVxo27e/jMTAmaKIfSMDIywsZjSnQhVAneYDmm";
