const { GoogleGenerativeAI } = require("@google/generative-ai");

// Replace with your actual key to test
const genAI = new GoogleGenerativeAI('AIzaSyB7Vr-4fvj5yZcQNGxhpxOKOmX83WJL8xc');

async function listModels() {
  try {
    // This fetches the list of all models your key can access
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${genAI.apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    
    console.log("--- YOUR SUPPORTED MODELS ---");
    data.models.forEach(m => {
      if (m.supportedGenerationMethods.includes("generateContent")) {
        console.log(`✅ ${m.name.replace('models/', '')}`);
      }
    });
  } catch (e) {
    console.error("Error fetching models:", e.message);
  }
}

listModels();