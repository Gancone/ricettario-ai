import { jsPDF } from "jspdf";
import type { Recipe } from "@/types/recipe";

function safeFileName(value: string) {
  return value.replace(/[<>:"/\\|?*]/g, "").trim().replace(/\s+/g, " ") || "ricetta";
}

async function imageAsDataUrl(url?: string) {
  if (!url) return "";
  try {
    const response = await fetch(`/api/image-proxy?url=${encodeURIComponent(url)}`);
    if (!response.ok) return "";
    const blob = await response.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}

export async function exportRecipePdf(recipe: Recipe) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = 18;

  const ensure = (needed = 12) => {
    if (y + needed > pageHeight - 18) {
      doc.addPage();
      y = 18;
    }
  };

  const image = await imageAsDataUrl(recipe.imageUrl);
  if (image) {
    try {
      const props = doc.getImageProperties(image);
      const maxH = 78;
      const ratio = props.width / props.height;
      let w = contentWidth;
      let h = w / ratio;
      if (h > maxH) {
        h = maxH;
        w = h * ratio;
      }
      const x = margin + (contentWidth - w) / 2;
      const format = image.startsWith("data:image/png") ? "PNG" : image.startsWith("data:image/webp") ? "WEBP" : "JPEG";
      doc.addImage(image, format, x, y, w, h, undefined, "FAST");
      y += h + 9;
    } catch {}
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  const title = doc.splitTextToSize(recipe.title, contentWidth);
  doc.text(title, margin, y);
  y += title.length * 9 + 3;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const meta = [
    recipe.category,
    recipe.totalTimeMinutes ? `${recipe.totalTimeMinutes} min` : "",
    recipe.servings ? `${recipe.servings} porzioni` : "",
    recipe.nutrition?.calories ? `${recipe.nutrition.calories} kcal/porzione` : ""
  ].filter(Boolean).join("  •  ");
  if (meta) {
    doc.text(meta, margin, y);
    y += 10;
  }

  const section = (label: string) => {
    ensure(18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(label, margin, y);
    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
  };

  section("Ingredienti");
  for (const ingredient of recipe.ingredients) {
    const lines = doc.splitTextToSize(`• ${ingredient}`, contentWidth);
    ensure(lines.length * 5.7 + 2);
    doc.text(lines, margin, y);
    y += lines.length * 5.7 + 1.5;
  }

  y += 4;
  section("Procedimento");
  recipe.steps.forEach((step, index) => {
    const lines = doc.splitTextToSize(`${index + 1}. ${step}`, contentWidth);
    ensure(lines.length * 5.7 + 3);
    doc.text(lines, margin, y);
    y += lines.length * 5.7 + 2.5;
  });

  if (recipe.nutrition) {
    y += 4;
    section("Valori nutrizionali");
    const n = recipe.nutrition;
    const values = [
      `Calorie: ${n.calories ?? "-"} kcal`,
      `Proteine: ${n.protein ?? "-"} g`,
      `Carboidrati: ${n.carbs ?? "-"} g`,
      `Grassi: ${n.fat ?? "-"} g`,
      `Zuccheri: ${n.sugars ?? "-"} g`,
      `Fibre: ${n.fiber ?? "-"} g`,
      `Sale: ${n.salt ?? "-"} g`
    ];
    ensure(28);
    doc.text(values.slice(0, 4), margin, y);
    doc.text(values.slice(4), margin + 82, y);
    y += 25;
    if (n.estimated) {
      doc.setFontSize(9);
      doc.text("Valori stimati per porzione.", margin, y);
      y += 7;
    }
  }

  if (recipe.notes) {
    y += 4;
    section("Note");
    const lines = doc.splitTextToSize(recipe.notes, contentWidth);
    ensure(lines.length * 5.5);
    doc.text(lines, margin, y);
    y += lines.length * 5.5;
  }

  if (recipe.sourceUrl) {
    y += 8;
    ensure(12);
    doc.setFontSize(8.5);
    doc.setTextColor(90);
    const source = doc.splitTextToSize(`Fonte: ${recipe.sourceUrl}`, contentWidth);
    doc.text(source, margin, y);
  }

  doc.save(`${safeFileName(recipe.title)}.pdf`);
}
