import type { MetadataRoute } from "next";

const SITE_URL ="https://suite-customizer.blenspark.com/";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
      images: [
        `${SITE_URL}/coats/Coat-1.png`,
        `${SITE_URL}/coats/Coat-2.png`,
        `${SITE_URL}/coats/Coat-3.png`,
        `${SITE_URL}/coats/Coat-4.jpg`,
        `${SITE_URL}/coats/Coat-5.jpg`,
      ],
    },
  ];
}