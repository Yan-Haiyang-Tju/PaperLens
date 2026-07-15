import * as Dialog from "@radix-ui/react-dialog";
import { Eye, ShieldCheck, X } from "lucide-react";
import type { ExplainSelectionRequest } from "../../types/ai";
import { requestContextPreview } from "../../services/ai/contextBuilder";

export function AiPrivacyDialog({ request, onConfirm, onCancel }: { request: ExplainSelectionRequest | null; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Dialog.Root open={Boolean(request)} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content ai-privacy-dialog">
          <header><div className="dialog-icon"><ShieldCheck size={20} /></div><div><Dialog.Title>发送前的隐私说明</Dialog.Title><Dialog.Description>只有你主动点击“AI 解释”时，PaperLens 才会发送下方论文上下文。</Dialog.Description></div><Dialog.Close asChild><button className="icon-button" type="button" aria-label="关闭"><X size={16} /></button></Dialog.Close></header>
          <div className="privacy-points"><span>不会发送 PDF 文件</span><span>不会发送本地文件路径</span><span>不会发送无关笔记</span></div>
          <details><summary><Eye size={14} />查看本次将发送的内容</summary><pre>{request ? requestContextPreview(request) : ""}</pre></details>
          <footer><button className="secondary-button" type="button" onClick={onCancel}>取消</button><button className="primary-button" type="button" onClick={onConfirm}>同意并解释</button></footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
