// Lets the Copilot drive the receipt form that is ALREADY open on screen —
// review-then-save flow. The form registers a handler while it is in
// "create" mode; the Copilot never saves anything on its own, it only asks
// the open form to run the exact same Save/Generate handler the manager's
// own button uses (same validation, same dual-save path). No form open =
// nothing to act on.
export type ReceiptFormCommand =
  | { type: 'read' }
  | { type: 'edit'; amount?: number; note?: string }
  | { type: 'save' };
export interface BridgeResult { ok: boolean; message: string }
type Handler = (cmd: ReceiptFormCommand) => Promise<BridgeResult> | BridgeResult;

let handler: Handler | null = null;

export const copilotReceiptBridge = {
  register(h: Handler): () => void {
    handler = h;
    return () => { if (handler === h) handler = null; };
  },
  isOpen(): boolean {
    return handler !== null;
  },
  async run(cmd: ReceiptFormCommand): Promise<BridgeResult> {
    if (!handler) return { ok: false, message: "No receipt form is open — say e.g. \"Sara ki receipt banao\" first." };
    try { return await handler(cmd); }
    catch { return { ok: false, message: 'The receipt form could not process that.' }; }
  },
};
