"use client";

import Image from "next/image";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import {
  Plus,
  ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { propertyService } from "@/lib/services/property.service";
import { UploadedImage } from "@/components/ui/image-upload";
import { ImageErrorBoundary } from "@/components/ui/error-boundary";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";

interface PropertyImageGalleryProps {
  images: string[];
  propertyName: string;
  canEdit: boolean;
  onImagesUpdate: (newImages: string[]) => void;
  propertyId: string;
}

const PropertyDocReport: React.FC<PropertyImageGalleryProps> = ({
  onImagesUpdate,
  propertyId,
}) => {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const { t } = useLocalizationContext();


  return (
    <ImageErrorBoundary>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t("compliance.form.Img.title") && "Property Compliance Document"}
            </h3>

          </div>

        </div>

        {/* Image Grid */}

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ImageIcon className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-400 mb-2 capitalize">
              {t("compliance.form.Img.title.placeholder") && "Upload compliance documents"}
            </h3>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t("properties.images.empty.addFirst") && "Add Image First"}
            </Button>
          </CardContent>
        </Card>

      </div>
    </ImageErrorBoundary>
  );
};

export default PropertyDocReport;
