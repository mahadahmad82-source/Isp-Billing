
import { callGeminiWithFailover, GEMINI_FALLBACK_MODELS } from "../lib/geminiFailover";
import { AppSettings, Receipt } from "../types";
import { getMessageTemplate, renderTemplate } from "../utils/messageTemplates";

export const generateProfessionalMessage = async (
  userName: string,
  amount: number,
  expiryDate: string,
  type: 'RECEIPT' | 'REMINDER',
  settings: AppSettings
) => {
  const businessName = settings.businessName || "Ledgerzo";

  // Template priority: messageTemplates registry (Message Templates tab) > legacy
  // single-field settings.receiptTemplate/reminderTemplate > built-in default.
  const templateId = type === 'RECEIPT' ? 'receipt_ai' : 'expiry_reminder';
  const legacyTemplate = type === 'RECEIPT' ? settings.receiptTemplate : settings.reminderTemplate;
  const hasCustomTemplate = !!(settings.messageTemplates && settings.messageTemplates[templateId]) || !!legacyTemplate;
  const localTemplate = (settings.messageTemplates && settings.messageTemplates[templateId]?.text)
    || legacyTemplate
    || getMessageTemplate(settings, templateId).text;

  const parsedMessage = renderTemplate(localTemplate, { userName, amount, expiryDate, businessName });

  // If user has set a custom template (new registry or legacy field), we prioritize that
  if (hasCustomTemplate) return parsedMessage;

  try {
    const prompt = type === 'RECEIPT' 
      ? `Generate a professional SMS receipt for ${userName} who paid ${amount}. Expiry: ${expiryDate}. Business: ${businessName}. Keep it under 160 characters.`
      : `Generate a polite firm SMS reminder for ${userName}. Amount due: ${amount}. Expiry: ${expiryDate}. Business: ${businessName}. Keep it under 160 characters.`;

    const response = await callGeminiWithFailover({
      contents: prompt,
    }, ['gemini-1.5-flash', ...GEMINI_FALLBACK_MODELS]);

    // Access text property directly (not as a method)
    return response.text || parsedMessage;
  } catch (error) {
    console.warn("Gemini Failover exhausted or Offline Mode:", error);
    return parsedMessage;
  }
};

export const analyzeTrends = async (receipts: Receipt[]) => {
  const defaultAnalysis = "Local analysis: Payment collection is stable. Monitoring active subscribers.";
  
  if (receipts.length === 0) {
    return defaultAnalysis;
  }

  try {
    const summary = JSON.stringify(receipts.slice(-10));
    const response = await callGeminiWithFailover({
      contents: `Analyze these recent internet subscription payments and provide a 2-sentence summary of revenue trends: ${summary}`,
    }, ['gemini-1.5-flash', ...GEMINI_FALLBACK_MODELS]);
    // Access text property directly
    return response.text || defaultAnalysis;
  } catch (error) {
    console.error('[analyzeTrends] Failover exhausted:', error);
    return defaultAnalysis;
  }
};
