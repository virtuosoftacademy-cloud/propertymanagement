/**
 * PropertyPro - Public Branding API
 * Returns branding information (logo, company name) without authentication
 * Used for login page and other public-facing pages
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { DisplaySettings, User } from "@/models";
import { UserRole } from "@/types";

// Default branding values
const DEFAULT_BRANDING = {
  logoLight: "/images/logo-light.png",
  logoDark: "/images/logo-dark.png",
  favicon: "/favicon.ico",
  primaryColor: "#3B82F6",
  secondaryColor: "#64748B",
  companyName: "PropertyPro",
};

/**
 * GET /api/branding/public - Get public branding information
 * No authentication required - used for login page
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Find the admin user to get their display settings
    const admin = await User.findOne({
      role: UserRole.ADMIN,
      isActive: true,
    })
      .select("_id")
      .lean();

    if (!admin?._id) {
      // Return default branding if no admin found
      return NextResponse.json({
        success: true,
        data: DEFAULT_BRANDING,
      });
    }

    // Get admin's display settings
    const displaySettings = await DisplaySettings.findOne({
      userId: admin._id,
      isActive: true,
    }).lean();

    if (!displaySettings?.branding) {
      // Return default branding if no settings found
      return NextResponse.json({
        success: true,
        data: DEFAULT_BRANDING,
      });
    }

    // Return only the necessary branding information
    const branding = {
      logoLight: displaySettings.branding.logoLight || DEFAULT_BRANDING.logoLight,
      logoDark: displaySettings.branding.logoDark || DEFAULT_BRANDING.logoDark,
      favicon: displaySettings.branding.favicon || DEFAULT_BRANDING.favicon,
      primaryColor: displaySettings.branding.primaryColor || DEFAULT_BRANDING.primaryColor,
      secondaryColor: displaySettings.branding.secondaryColor || DEFAULT_BRANDING.secondaryColor,
      companyName: displaySettings.branding.companyName || DEFAULT_BRANDING.companyName,
    };

    return NextResponse.json({
      success: true,
      data: branding,
    });
  } catch (error) {
    console.error("Public branding API error:", error);
    // Return default branding on error
    return NextResponse.json({
      success: true,
      data: DEFAULT_BRANDING,
    });
  }
}
