import { useParams, Link } from "wouter";
import { ArrowLeft, LayoutGrid } from "lucide-react";

/**
 * Generic stub handler for `/marketplace/<category>` routes.
 */
export default function MarketplaceCategory() {
  const params = useParams<{ category?: string }>();
  const category = params?.category ?? "all";

  return (
    <div className="p-6 max-w-6xl mx-auto" data-testid="marketplace-category">
      <Link
        href="/settings/marketplace"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        חזרה ל-Marketplace
      </Link>

      <div className="rounded-lg border border-border bg-card p-8">
        <div className="flex items-start gap-4">
          <div className="rounded-md bg-primary/10 p-3">
            <LayoutGrid className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold mb-1">Marketplace Category</h1>
            <p className="text-sm text-muted-foreground">
              Category: <code className="font-mono">{category}</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
