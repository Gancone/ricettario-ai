export function variantImageUrl(url:string,kind:'thumb'|'medium'){if(!/-v7\.(png|jpg|webp)$/.test(url))return url;return url.replace(/-v7\.(png|jpg|webp)$/,`-v7.${kind}.webp`);}
