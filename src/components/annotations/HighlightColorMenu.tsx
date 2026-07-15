import { Check } from "lucide-react";
import type { HighlightColor } from "../../types/annotation";

const colors: Array<{ id: HighlightColor; label: string }> = [
  { id: "yellow", label: "黄色" }, { id: "green", label: "绿色" }, { id: "blue", label: "蓝色" }, { id: "pink", label: "粉色" }, { id: "purple", label: "紫色" },
];

export function HighlightColorMenu({ value, onSelect }: { value: HighlightColor; onSelect: (color: HighlightColor) => void }) {
  return (
    <div className="highlight-color-menu" role="menu" aria-label="高亮颜色">
      {colors.map((color) => <button type="button" role="menuitemradio" aria-checked={value === color.id} aria-label={color.label} key={color.id} onClick={() => onSelect(color.id)}><i className={`highlight-swatch highlight-swatch--${color.id}`} />{value === color.id ? <Check size={12} /> : null}</button>)}
    </div>
  );
}
