/**
 * PropertyPro - Units API Routes
 * Handle CRUD operations for property units
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Property } from "@/models";
import { UserRole } from "@/types";

// GET /api/properties/[id]/units - Get all units for a property
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    // Await params before using its properties
    const { id } = await params;

    // Verify property exists and user has access
    const property = await Property.findById(id);
    if (!property) {
      return NextResponse.json(
        { error: "Property not found" },
        { status: 404 }
      );
    }

    // Check if user has access to this property
    const userId = session.user.id;
    const userRole = session.user.role;

    // Single company architecture - Admin and Manager can access all units
    if (![UserRole.ADMIN, UserRole.MANAGER].includes(userRole as UserRole)) {
      // Tenants can only access units they are associated with
      // For now, we'll restrict tenant access to units
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get all units from the embedded units array
    const units = property.units || [];

    return NextResponse.json(units);
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/properties/[id]/units - Create a new unit
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    // Await params before using its properties
    const { id } = await params;

    // Verify property exists and user has access
    const property = await Property.findById(id);
    if (!property) {
      return NextResponse.json(
        { error: "Property not found" },
        { status: 404 }
      );
    }

    // Check if user has access to this property
    const userRole = session.user.role;

    // Single company architecture - Admin and Manager can create units for all properties
    if (![UserRole.ADMIN, UserRole.MANAGER].includes(userRole as UserRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify this is a multi-unit property
    if (!property.isMultiUnit) {
      return NextResponse.json(
        { error: "Cannot add units to single-unit property" },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Check if unit number already exists in the embedded units array
    const existingUnit = property.units.find(
      (unit: any) => unit.unitNumber === body.unitNumber
    );

    if (existingUnit) {
      return NextResponse.json(
        { error: "Unit number already exists for this property" },
        { status: 400 }
      );
    }

    // Create the unit data (no propertyId needed since it's embedded)
    const unitData = {
      ...body,
      // Handle parking data structure
      parking:
        body.parking ||
        (body.parkingIncluded !== undefined
          ? {
              included: body.parkingIncluded || false,
              spaces: body.parkingSpaces || 0,
              type: body.parkingType || "open",
              gated: body.parkingGated || false,
              assigned: body.parkingAssigned || false,
            }
          : { included: false }),
      // Handle utilities data structure
      utilities: body.utilities || {
        electricity: body.electricityIncluded ? "included" : UserRole.TENANT,
        water: body.waterIncluded ? "included" : UserRole.TENANT,
        gas: body.gasIncluded ? "included" : UserRole.TENANT,
        internet: body.internetIncluded ? "included" : UserRole.TENANT,
        heating: body.heatingIncluded ? "included" : UserRole.TENANT,
        cooling: body.coolingIncluded ? "included" : UserRole.TENANT,
        cable: UserRole.TENANT,
        trash: "included",
        sewer: "included",
      },
      // Handle appliances data structure
      appliances: body.appliances || {
        refrigerator: body.refrigerator || false,
        stove: body.stove || false,
        oven: body.oven || false,
        microwave: body.microwave || false,
        dishwasher: body.dishwasher || false,
        washer: body.washer || false,
        dryer: body.dryer || false,
      },
    };

    // Add the unit to the embedded units array
    property.units.push(unitData);

    // Update property metadata
    property.totalUnits = property.units.length;
    property.isMultiUnit = property.units.length > 1;

    await property.save();

    // Get the newly added unit (last one in the array)
    const newUnit = property.units[property.units.length - 1];

    // Trigger property status synchronization after unit creation
    let syncWarning: string | null = null;

    try {
      const { propertyStatusSynchronizer } = await import(
        "@/lib/services/property-status-sync.service"
      );

      await propertyStatusSynchronizer.syncPropertyStatus(id, {
        triggeredBy: `unit-creation:${newUnit._id}`,
        logChanges: true,
      });
    } catch (syncError) {
      const baseWarning =
        "Unit created but status synchronization could not be verified";
      syncWarning =
        syncError instanceof Error && syncError.message
          ? `${baseWarning}: ${syncError.message}`
          : baseWarning;
    }

    const responsePayload = NextResponse.json(newUnit, { status: 201 });
    if (syncWarning) {
      responsePayload.headers.set("x-propertypro-warning", syncWarning);
    }

    return responsePayload;
  } catch (error: any) {
    if (error.name === "ValidationError") {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
