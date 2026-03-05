import { BaseProvider, ProviderConfig, Message, ModelInfo, ProviderInfo } from './BaseProvider';

interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: { 
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export class OllamaProvider extends BaseProvider {
  private baseUrl: string;

  constructor(config: ProviderConfig) {
    super(config);
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
  }

  getName(): string {
    return 'Ollama';
  }

  async getAvailableModels(): Promise<ModelInfo[]> {
    return this.fetchModelsWithCache(async () => {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      const data = await response.json();
      return data.models.map((model: OllamaModel) => {
        const name = model.name;
        const supportsVision = name.includes('vision') || 
                               name.includes('llava') || 
                               name.includes('bakllava') || 
                               name.includes('ocr') || 
                               name.includes('vl')||
                               name.includes('VL');
        return {
          id: name,
          name: name,
          supportsVision,
          description: `Ollama model, size: ${(model.size / 1e9).toFixed(1)} GB`
        };
      });
    });
  }

  async supportsModelVision(modelId: string): Promise<boolean> {
    return modelId.includes('vision') || modelId.includes('llava') || modelId.includes('bakllava') || modelId.includes('ocr') || 
                               modelId.includes('vl')|| modelId.includes('V:');
  }

  supportsVision(): boolean {
    return true;
  }

  async validateApiKey(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }

 async chat(messages: Message[], model: string, options?: {
  temperature?: number;
  maxTokens?: number;
  keepAlive?: number | string;
}): Promise<any> {
  const ollamaMessages = [];

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      // Обычное текстовое сообщение
      ollamaMessages.push({
        role: msg.role,
        content: msg.content,
      });
    } else if (Array.isArray(msg.content)) {
      // Сообщение может содержать текст и изображения
      let text = '';
      const images: string[] = [];

      for (const part of msg.content) {
        if (part.type === 'text') {
          text += part.text + ' ';
        } else if (part.type === 'image_url') {
          // Извлекаем чистый base64 (без префикса data:image/...;base64,)
          const base64 = part.image_url.url.split(',')[1];
          if (base64) images.push(base64);
        } else if (part.type === 'image') {
          // Ваш формат для Ollama (type: "image", image: base64Image)
          images.push(part.image);
        }
      }

      ollamaMessages.push({
        role: msg.role,
        content: text.trim(),
        images: images.length > 0 ? images : undefined,
      });
    }
  }

  const requestBody: any = {
    model: model,
    messages: ollamaMessages,
    stream: false,
    options: {
      temperature: options?.temperature ?? 0.7,
      num_predict: options?.maxTokens ?? 16000,
    },
  };

   requestBody.keep_alive = 300;

  console.log(`[Ollama] Request to ${this.baseUrl}/api/chat with model ${model}`);
  console.log(`[Ollama] keep_alive = ${requestBody.keep_alive}`);
  const start = Date.now();
  const response = await fetch(`${this.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });
  const elapsed = Date.now() - start;
  console.log(`[Ollama] Response received in ${elapsed} ms`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Ollama] HTTP ${response.status}: ${errorText}`);
    throw new Error(`Ollama API error: ${response.status}`);
  }

  const data = await response.json();
  console.log(`[Ollama] Response content length: ${data.message?.content?.length || 0}`);
  return {
    content: data.message?.content || '',
    usage: undefined,
  };
}

  public formatImageForProvider(base64Image: string): any {
    return {
      type: "image",
      image: base64Image
    };
  }

   getProviderInfo(): ProviderInfo {
    return {
      name: "Ollama",
      color: "indigo",
      isFree: true,
      instructions: {
        signup: "https://ollama.com",
        apiKeys: null,
        description: "FREE & LOCAL - Run models locally. No API key needed, but requires Ollama installation"
      }
    };
  }
}