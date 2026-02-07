import type { Metadata } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Props {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  try {
    const res = await fetch(`${API_URL}/api/v1/predictions/${id}/result`, {
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return {
        title: "FutureOS Prediction",
        description: "AI-powered future prediction engine",
      };
    }

    const data = await res.json();
    const query = data.query || "Prediction";
    const outcomes = data.outcomes || [];
    const description =
      outcomes.length > 0
        ? `${outcomes[0].name}: ${Math.round(outcomes[0].probability * 100)}% probability`
        : "AI-powered future prediction";

    return {
      title: `${query} - FutureOS Prediction`,
      description,
      openGraph: {
        title: `${query} - FutureOS Prediction`,
        description,
        type: "article",
        siteName: "FutureOS",
      },
      twitter: {
        card: "summary_large_image",
        title: `${query} - FutureOS Prediction`,
        description,
      },
    };
  } catch {
    return {
      title: "FutureOS Prediction",
      description: "AI-powered future prediction engine",
    };
  }
}

export default function ShareLayout({ children }: Props) {
  return <>{children}</>;
}
