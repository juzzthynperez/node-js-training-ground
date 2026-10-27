// src/services/auth.service.ts — registration and login.
//
// Rules this service owns (the envelope/handler stays out of them):
//   * register: hash with bcrypt (cost from config), duplicate email → P2002
//     → ConflictError/409 via the shared seam, role pinned MEMBER (see
//     auth.schemas.ts — the wire cannot set it).
//   * login: ONE failure answer for unknown email AND wrong password
//     ("Invalid email or password", 401) — separate messages would let an
//     attacker enumerate which emails have accounts. bcrypt.compare against
//     the stored hash does the timing-bearing work.
//   * token issuance: signToken with the config secret, 1h (dev).

import type { PrismaClient } from "../generated/prisma/client.ts";
import bcrypt from "bcrypt";
import type { AppConfig } from "../config.ts";
import { UnauthorizedError } from "../errors.ts";
import { signToken } from "../lib/jwt.ts";
import { mapPrismaError } from "../lib/prisma-errors.ts";
import type { AuthResult, AuthUser, LoginInput, RegisterInput } from "../schemas/auth.schemas.ts";

const INVALID_CREDENTIALS = "Invalid email or password";

export class AuthService {
  // Explicit fields, not constructor parameter properties: `erasableSyntaxOnly`
  // (carried from the program's tsconfig) forbids the `private readonly x`
  // shorthand because it emits state, not just types.
  private readonly prisma: PrismaClient;
  private readonly config: AppConfig;

  constructor(prisma: PrismaClient, config: AppConfig) {
    this.prisma = prisma;
    this.config = config;
  }

  private toAuthUser(user: { id: string; name: string; email: string; role: string }): AuthUser {
    // Constructed field-by-field: adding a column to the users table can
    // never accidentally start leaking it (no spread of the row).
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }

  async register(input: RegisterInput): Promise<AuthResult> {
    try {
      const user = await this.prisma.user.create({
        data: {
          name: input.name,
          email: input.email.toLowerCase(),
          passwordHash: await bcrypt.hash(input.password, this.config.bcryptRounds),
          role: "MEMBER", // pinned here — the register schema has no role field
        },
      });
      return {
        token: signToken({ sub: user.id, role: user.role }, this.config),
        user: this.toAuthUser(user),
      };
    } catch (err) {
      throw mapPrismaError(err, "Account with this email");
    }
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const email = input.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Unknown email and wrong password converge on the SAME answer: same
    // status (401), same code (UNAUTHORIZED), same message. No user
    // enumeration through this endpoint.
    if (user === null) {
      throw new UnauthorizedError(INVALID_CREDENTIALS);
    }
    const passwordOk = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedError(INVALID_CREDENTIALS);
    }
    return {
      token: signToken({ sub: user.id, role: user.role }, this.config),
      user: this.toAuthUser(user),
    };
  }
}
