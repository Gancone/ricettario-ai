export function displayImageUrl(url?: string) {
  if (!url) return "";
  if (url.startsWith("data:image/")) return url;
  if (url.includes("/storage/v1/object/public/recipe-images/")) return url;
  if (/^https?:\/\//i.test(url)) return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  return url;
}
