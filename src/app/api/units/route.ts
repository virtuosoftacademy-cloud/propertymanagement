export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { Property } from "@/models";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  withRoleAndDB,
  parsePaginationParams,
} from "@/lib/api-utils";
import { UserRole, PropertyStatus, PropertyType } from "@/types";
import { requirePermission } from "@/lib/auth/require-permission";
import { applyPropertyScope } from "@/lib/auth/property-scope";

export const GET = withRoleAndDB([UserRole.ADMIN, UserRole.MANAGER])(
  // `user` was previously discarded as `_user`; units are derived from
  // properties, so the caller's property scope has to reach the $match below.
  async (user, request: NextRequest) => {
    try {
      // Custom roles must hold this permission; built-in roles are
      // governed by the role list above.
      const denied = requirePermission(user, "property_view");
      if (denied) return denied;

      const { searchParams } = new URL(request.url);
      const { page, limit, sortBy, sortOrder, search } =
        parsePaginationParams(searchParams);

      const status    = searchParams.get("status")   || undefined;
      const unitType  = searchParams.get("unitType") || undefined;
      const type      = searchParams.get("type")     || undefined;
      const state     = searchParams.get("state")    || undefined;
      const city      = searchParams.get("city")     || undefined;

      const minRent = searchParams.get("minRent")
        ? parseFloat(searchParams.get("minRent") as string)
        : undefined;
      const maxRent = searchParams.get("maxRent")
        ? parseFloat(searchParams.get("maxRent") as string)
        : undefined;

      // ── Bedrooms: exact for 1–4, $gte for 5+ ─────────────────────────────
      const bedroomsRaw = searchParams.get("bedrooms");
      let bedroomsFilter: number | { $gte: number } | undefined;
      if (bedroomsRaw !== null && bedroomsRaw !== "") {
        const beds = parseInt(bedroomsRaw);
        if (!isNaN(beds)) {
          bedroomsFilter = beds >= 5 ? { $gte: 5 } : beds;
        }
      }

      // ── Bathrooms: exact for 1–3, $gte for 4+ ────────────────────────────
      const bathroomsRaw = searchParams.get("bathrooms");
      let bathroomsFilter: number | { $gte: number } | undefined;
      if (bathroomsRaw !== null && bathroomsRaw !== "") {
        const baths = parseInt(bathroomsRaw);
        if (!isNaN(baths)) {
          bathroomsFilter = baths >= 4 ? { $gte: 4 } : baths;
        }
      }

      // ── Property-level match ──────────────────────────────────────────────
      // NB: this is an aggregation, which never runs the model's pre(/^find/)
      // hook — hence the explicit deletedAt, and hence the scope must be merged
      // in by hand rather than relying on middleware.
      const match: any = { deletedAt: null };
      applyPropertyScope(match, user);

      if (type && Object.values(PropertyType).includes(type as any)) {
        match.type = type;
      }
      if (state) match["address.state"] = { $regex: state, $options: "i" };
      if (city)  match["address.city"]  = { $regex: city,  $options: "i" };

      // ── Unit-level match ──────────────────────────────────────────────────
      const unitMatch: any = {};

      if (status && Object.values(PropertyStatus).includes(status as any)) {
        unitMatch["units.status"] = status;
      }
      if (unitType)                   unitMatch["units.unitType"]  = unitType;
      if (bedroomsFilter  !== undefined) unitMatch["units.bedrooms"]  = bedroomsFilter;
      if (bathroomsFilter !== undefined) unitMatch["units.bathrooms"] = bathroomsFilter;

      if (minRent !== undefined || maxRent !== undefined) {
        unitMatch["units.rentAmount"] = {};
        if (minRent !== undefined) unitMatch["units.rentAmount"].$gte = minRent;
        if (maxRent !== undefined) unitMatch["units.rentAmount"].$lte = maxRent;
      }

      // ── Sort ──────────────────────────────────────────────────────────────
      const sortStage: any = {};
      const sortKey =
        sortBy === "rentAmount"    ? "units.rentAmount"    :
        sortBy === "squareFootage" ? "units.squareFootage" :
        sortBy === "unitNumber"    ? "units.unitNumber"    :
        sortBy === "status"        ? "units.status"        :
        sortBy === "name"          ? "name"                :
        "createdAt";
      sortStage[sortKey] = sortOrder === "asc" ? 1 : -1;

      // ── Search ────────────────────────────────────────────────────────────
      const searchOr = search
        ? [
            { name:               { $regex: search, $options: "i" } },
            { "units.unitNumber": { $regex: search, $options: "i" } },
          ]
        : undefined;

      // ── Base pipeline (shared by count + paginated queries) ───────────────
      const basePipeline: any[] = [{ $match: match }, { $unwind: "$units" }];

      if (searchOr)                           basePipeline.push({ $match: { $or: searchOr } });
      if (Object.keys(unitMatch).length > 0)  basePipeline.push({ $match: unitMatch });

      // ── Total units count ─────────────────────────────────────────────────
      const totalResult = await Property.aggregate([
        ...basePipeline,
        { $count: "total" },
      ]);
      const total = totalResult[0]?.total || 0;

      // ── Total unique properties count ─────────────────────────────────────
      const uniquePropertiesResult = await Property.aggregate([
        ...basePipeline,
        { $group: { _id: "$_id" } },
        { $count: "total" },
      ]);
      const totalProperties = uniquePropertiesResult[0]?.total || 0;

      // ── Paginated data ────────────────────────────────────────────────────
      const data = await Property.aggregate([
        ...basePipeline,
        { $sort: sortStage },
        { $skip: Math.max((page - 1) * limit, 0) },
        { $limit: limit },
        {
          $project: {
            _id:             1,
            name:            1,
            description:     1,
            type:            1,
            status:          1,
            address:         1,
            images:          1,
            unitId:          "$units._id",
            unitNumber:      "$units.unitNumber",
            unitType:        "$units.unitType",
            floor:           "$units.floor",
            bedrooms:        "$units.bedrooms",
            bathrooms:       "$units.bathrooms",
            squareFootage:   "$units.squareFootage",
            rentAmount:      "$units.rentAmount",
            securityDeposit: "$units.securityDeposit",
            unitStatus:      "$units.status",
            unitImages:      "$units.images",
            createdAt:       1,
            updatedAt:       1,
          },
        },
      ]);

      const pages = Math.ceil(total / limit) || 1;

      return createSuccessResponse(data, "Units retrieved", {
        page,
        limit,
        total,
        totalProperties,
        pages,
        hasNext: page < pages,
        hasPrev: page > 1,
      });
    } catch (error) {
      return handleApiError(error);
    }
  }
);