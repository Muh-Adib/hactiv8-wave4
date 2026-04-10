import { GoogleGenAI } from '@google/genai';
const ai = new GoogleGenAI({});
const decl = { name: "get_weather", description: "Get weather", parameters: { type: "OBJECT", properties: { loc: { type: "STRING" } } } };
const contents = [
    { role: 'user', parts: [{ text: "what is weather in sf?" }] },
    { role: 'model', parts: [{ functionCall: { name: 'get_weather', args: { loc: 'sf' } } }] },
    { role: 'user', parts: [{ functionResponse: { name: 'get_weather', response: { temp: 72 } } }] }
];
ai.models.generateContent({ model: 'gemini-2.5-flash', contents, config: { tools: [{ functionDeclarations: [decl] }] } })
  .then(r => console.log('OK:', r.text))
  .catch(e => console.error('ERR:', e));
