import { UserRole } from "./index";
import { MongoClient } from "mongodb";
import type { Mongoose } from "mongoose";

// Global type for MongoDB client promise caching
declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
  var mongoose: {
    conn: Mongoose | null;
    promise: Promise<Mongoose> | null;
  };
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string;
      image?: string;
      firstName?: string;
      lastName?: string;
      /**
       * The RESOLVED base role. A custom role reports the role it inherits
       * from, so every existing `role === UserRole.X` check keeps working.
       */
      role: UserRole;
      /** What the user actually holds, e.g. "agent" — use this for display. */
      assignedRole?: string;
      isCustomRole?: boolean;
      /** The custom role's permission list; empty for built-in roles. */
      permissions?: string[];
      avatar?: string;
      bio?: string;
      location?: string;
      city?: string;
      website?: string;
      address?: string;
      phone?: string;
      isActive: boolean;
      createdAt?: Date;
    };
  }

  interface User {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    role: UserRole;
    avatar?: string;
    bio?: string;
    location?: string;
    city?: string;
    website?: string;
    address?: string;
    phone?: string;
    isActive: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    role: UserRole;
    isActive: boolean;
  }
}
