import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Upload } from 'lucide-react';

export default function ImageUploader({ images = [], onImagesChange }) {
    const [uploading, setUploading] = useState(false);

    const handleImageUpload = async (e) => {
        const files = Array.from(e.target.files);
        setUploading(true);

        try {
            for (const file of files) {
                const { file_url } = await fetch("/api/integrations/upload", { method: "POST" }).then(r => r.json());
                onImagesChange([...images, file_url]);
            }
        } finally {
            setUploading(false);
        }
    };

    const removeImage = (index) => {
        onImagesChange(images.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-3">
            <label className="block text-sm font-semibold">תמונות המוצר</label>
            <div className="grid grid-cols-4 gap-3">
                {images.map((img, idx) => (
                    <div key={idx} className="relative group">
                        <img 
                            src={img} 
                            alt={`Product ${idx}`}
                            className="w-full h-24 object-cover rounded-lg"
                        />
                        <button
                            onClick={() => removeImage(idx)}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>
            <label>
                <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={uploading}
                    className="hidden"
                />
                <Button 
                    type="button" 
                    variant="outline" 
                    className="w-full gap-2"
                    disabled={uploading}
                    onClick={(e) => e.currentTarget.parentElement.querySelector('input').click()}
                >
                    <Upload className="w-4 h-4" />
                    {uploading ? 'מעלה תמונות...' : 'העלה תמונות'}
                </Button>
            </label>
        </div>
    );
}