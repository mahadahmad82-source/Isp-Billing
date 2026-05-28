
import { GoogleGenAI } from "@google/genai";
import { AppSettings, Receipt } from "../types";

// parseTemplate helper for local fallback messaging
const parseTemplate = (template: string, data: { userName: string, amount: number, expiryDate: string, businessName: string }) => {
  return template
    .replace(/{userName}/g, data.userName)
    .replace(/{amount}/g, data.amount.toLocaleString())
    .replace(/{expiryDate}/g, data.expiryDate)
    .replace(/{businessName}/g, data.businessName);
};

export const generateProfessionalMessage = async (
  userName: string,
  amount: number,
  expiryDate: string,
  type: 'RECEIPT' | 'REMINDER',
  settings: AppSettings
) => {
  const businessName = settings.businessName || "Ledgerzo";
  
  let localTemplate = "";
  if (type === 'RECEIPT') {
    localTemplate = settings.receiptTemplate || "{businessName}: Payment received from {userName}. Amount: Rs. {amount}. Valid until: {expiryDate}. Thank you!";
  } else {
    localTemplate = settings.reminderTemplate || "{businessName} Reminder: Dear {userName}, your subscription (Rs. {amount}) expires on {expiryDate}. Please renew today.";
  }

  const parsedMessage = parseTemplate(localTemplate, { userName, amount, expiryDate, businessName });

  // If user has set a custom template, we prioritize that
  if (type === 'RECEIPT' && settings.receiptTemplate) return parsedMessage;
  if (type === 'REMINDER' && settings.reminderTemplate) return parsedMessage;

  // Use process.env.API_KEY directly to check if available
  if (!process.env.API_KEY) {
    return parsedMessage;
  }

  try {
    // Fix: Create a new GoogleGenAI instance right before making an API call to ensure it always uses the most up-to-date API key
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = type === 'RECEIPT' 
      ? `Generate a professional SMS receipt for ${userName} who paid ${amount}. Expiry: ${expiryDate}. Business: ${businessName}. Keep it under 160 characters.`
      : `Generate a polite firm SMS reminder for ${userName}. Amount due: ${amount}. Expiry: ${expiryDate}. Business: ${businessName}. Keep it under 160 characters.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    // Access text property directly (not as a method)
    return response.text || parsedMessage;
  } catch (error) {
    console.warn("Gemini Error or Offline Mode:", error);
    return parsedMessage;
  }
};

export const analyzeTrends = async (receipts: Receipt[]) => {
  const defaultAnalysis = "Local analysis: Payment collection is stable. Monitoring active subscribers.";
  
  if (receipts.length === 0 || !process.env.API_KEY) {
    return defaultAnalysis;
  }

  try {
    // Fix: Create a new GoogleGenAI instance right before making an API call to ensure it always uses the most up-to-date API key
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const summary = JSON.stringify(receipts.slice(-10));
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analyze these recent internet subscription payments and provide a 2-sentence summary of revenue trends: ${summary}`,
    });
    // Access text property directly
    return response.text || defaultAnalysis;
  } catch (error) {
    return defaultAnalysis;
  }
};
