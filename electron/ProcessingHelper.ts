// ProcessingHelper.ts
import { BrowserWindow } from 'electron';
import { IProcessingHelperDeps } from './main';
import { ScreenshotHelper } from './ScreenshotHelper';
import { configHelper } from './ConfigHelper';
import { ProviderFactory, ProviderType } from './ProviderFactory';
import { BaseProvider, Message } from './providers/BaseProvider';
import { EXTRACT_SYSTEM_PROMPT, EXTRACT_USER_PROMPT, SOLUTION_SYSTEM_PROMPT, SOLUTION_USER_PROMPT, EXTRACT_TASK_PROMPT, CODE_REVIEW_PROMPT, SOLUTION_PROMPT, VISION_EXTRACT_PROMPT} from './prompts';
import * as axios from 'axios';
import { SmartTaskExtractor } from './smartExtractor';
import {ExtractedContent } from '../shared/types';

// Импортируем вынесенные функции
import { loadScreenshotsData } from './imageProcessor';
import { parseProblemInfoResponse, parseMultiTaskResponse } from './responseParser';
import { getLanguageFromWindow, waitForInitialization } from './rendererHelper';

interface AppConfig {
  apiProvider: string;
  apiKey: string;
  extractionModel: string;
  solutionModel: string;
  debuggingModel: string;
  ollamaBaseUrl?: string;
  baseUrl?: string;
  language?: string;
}

export class ProcessingHelper {
  private deps: IProcessingHelperDeps;
  private screenshotHelper: ScreenshotHelper;
  private provider: BaseProvider;
  private config: AppConfig;
  private currentProcessingAbortController: AbortController | null = null;
  private smartExtractor: SmartTaskExtractor;

  constructor(deps: IProcessingHelperDeps) {
    this.deps = deps;
    this.screenshotHelper = deps.getScreenshotHelper();
    this.config = configHelper.loadConfig() as AppConfig;
    this.initializeProvider();
     this.smartExtractor = new SmartTaskExtractor();

    configHelper.on('config-updated', (newConfig: AppConfig) => {
      this.config = newConfig;
      this.initializeProvider();
    });
  }

  private initializeProvider(): void {
    const providerConfig = {
      apiKey: this.config.apiKey || '',
      baseUrl: this.config.apiProvider === 'ollama' ? this.config.ollamaBaseUrl : this.config.baseUrl,
      defaultModels: {
        extraction: this.config.extractionModel,
        solution: this.config.solutionModel,
        debugging: this.config.debuggingModel,
      },
    };

    this.provider = ProviderFactory.createProvider(
      this.config.apiProvider as ProviderType,
      providerConfig
    );
  }

  private async validateApiKey(): Promise<boolean> {
    if (this.config.apiProvider === 'ollama') return true;
    try {
      return await this.provider.validateApiKey();
    } catch {
      return false;
    }
  }

  private async getLanguage(): Promise<string> {
    const mainWindow = this.deps.getMainWindow();
    return getLanguageFromWindow(mainWindow, this.config.language);
  }

  /*
   * ЗАКОММЕНТИРОВАНО: Этап извлечения текста отдельной моделью
   * Раскомментировать для возврата к двухэтапной обработке
   
  private async extractProblemInfo(
    screenshots: Array<{ path: string; data: string }>,
    signal: AbortSignal
  ): Promise<any> {
    const language = await this.getLanguage();
    const systemPrompt = EXTRACT_SYSTEM_PROMPT;
    const userPrompt = EXTRACT_USER_PROMPT(language);

    const content: any[] = [];
    for (const screenshot of screenshots) {
      content.push(this.provider.formatImageForProvider(screenshot.data));
    }

    const messages: Message[] = [
      { 
        role: 'system', 
        content: 'Ты ассистент, который точно описывает задачи по программированию. Будь конкретным и подробным. НА изображении распознай весь текст и просто передай его в свой ответ. В ответ только распознаный текст отдай и всё.' 
      },
       { role: 'user', content }
    ];

    const response = await this.provider.chat(messages, this.config.extractionModel, {
      temperature: 0.1,
      maxTokens: 4000,
    });

    console.log("Ответ:",response,"Содержимое ответа",response.content)
    return this.smartExtractor.parseExtraction(response.content);
  }
  */

  private handleProcessingError(error: any, errorEvent: string): void {
    const mainWindow = this.deps.getMainWindow();
    if (!mainWindow) return;

    let errorMessage = error.message || 'Unknown error';

    if (axios.isCancel(error)) {
      errorMessage = 'Processing was canceled by the user.';
    } else if (error?.response?.status === 401) {
      errorMessage = 'Invalid API key. Please check your settings.';
    } else if (error?.response?.status === 429) {
      errorMessage = 'API rate limit exceeded. Please try again later.';
    } else if (error?.response?.status === 500) {
      errorMessage = 'Server error. Please try again later.';
    }

    console.error('Processing error:', error);
    mainWindow.webContents.send(errorEvent, errorMessage);
    mainWindow.webContents.send('processing-status', {
      message: 'Error: ' + errorMessage,
      progress: 0,
      error: true,
    });
  }

  // ==================== Публичные методы ====================


  public cancelOngoingRequests(): void {
    let wasCancelled = false;

    if (this.currentProcessingAbortController) {
      this.currentProcessingAbortController.abort();
      this.currentProcessingAbortController = null;
      wasCancelled = true;
    }

    this.deps.setProblemInfo(null);

    const mainWindow = this.deps.getMainWindow();
    if (wasCancelled && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
    }
  }

  /**
   * Генерация ответа на основе извлеченного контента
   */
  private async generateResponse(
    extracted: ExtractedContent,
    signal: AbortSignal
  ): Promise<any> {
    
    // Обработка смешанных задач
    if (extracted.multipleTasks && extracted.multipleTasks.length > 0) {
      const solutions = await Promise.all(
        extracted.multipleTasks.map(task => this.solveSingleTask(task, signal))
      );
      return {
        type: 'multiple',
        tasks: solutions
      };
    }
    
    // Обработка одного задания
    return this.solveSingleTask(extracted, signal);
  }
  
  public async processScreenshots(): Promise<void> {
    this.cancelOngoingRequests();
    this.currentProcessingAbortController = new AbortController();
    const signal = this.currentProcessingAbortController.signal;
    
    try {
      const mainWindow = this.deps.getMainWindow();
      if (!mainWindow) return;
      
      const queue = this.screenshotHelper.getScreenshotQueue();
      if (queue.length === 0) {
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
        return;
      }
      
      if (!(await this.validateApiKey())) {
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.API_KEY_INVALID);
        return;
      }

      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.INITIAL_START);
      
      // Загружаем скриншоты
      const screenshots = await loadScreenshotsData(queue);
      
      /* 
       * ЗАКОММЕНТИРОВАНО: Старый двухэтапный процесс (извлечение + решение)
       * Раскомментировать для возврата:
       
      // Этап 1: Извлечение информации
      mainWindow.webContents.send('processing-status', {
        message: 'Анализирую содержимое скриншота...',
        progress: 20
      });
      
      const extracted = await this.extractProblemInfo(screenshots, signal);
      
      const problemInfo = {
        problem_statement: extracted.rawText,
        constraints: extracted.codingTask?.requirements?.join('\n') || '',
        example_input: '',
        example_output: '',
        _extracted: extracted,
        type: extracted.type
      };
      this.deps.setProblemInfo(problemInfo);
      
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.PROBLEM_EXTRACTED, {
        type: extracted.type,
        preview: extracted.rawText.substring(0, 200) + '...',
        fullText: extracted.rawText
      });
      
      // Этап 2: Генерация решения
      mainWindow.webContents.send('processing-status', {
        message: 'Генерирую решение...',
        progress: 50
      });
      
      const solution = await this.generateSolutionFromExtracted(extracted, signal);
      */
      
      // НОВЫЙ ПРОЦЕСС: Сразу решение с картинками (одна модель)
      mainWindow.webContents.send('processing-status', {
        message: 'Анализирую и решаю задачу...',
        progress: 30
      });
      
      const solution = await this.solveWithVision(screenshots, signal);
      
      mainWindow.webContents.send('processing-status', {
        message: 'Готово!',
        progress: 100
      });
      
      console.log('Sending solution:', {
        type: solution.type,
        hasCode: !!solution.code,
        codeLength: solution.code?.length
      });
      
      mainWindow.webContents.send(
        this.deps.PROCESSING_EVENTS.SOLUTION_SUCCESS,
        solution
      );
      
    } catch (error: any) {
      console.error('Process error:', error);
      this.handleProcessingError(error, this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR);
    } finally {
      this.currentProcessingAbortController = null;
    }
  }

  /**
   * НОВЫЙ МЕТОД: Решение задачи напрямую с изображениями (без предварительного извлечения текста)
   */
 private async solveWithVision(
  screenshots: Array<{ path: string; data: string }>,
  signal: AbortSignal
): Promise<any> {
  const language = await this.getLanguage();
  
  // Формируем контент: текст + изображения
  const content: any[] = [
    { 
      type: 'text', 
      text: `Проанализируй изображение с задачами по программированию и напиши решения для всех задач.

На изображении может быть несколько задач. Для каждой задачи:

1. Определи, что это за задача
2. Напиши решение на языке ${language === 'sql' ? 'SQL' : 'Java'}

Формат ответа для КАЖДОЙ задачи:
### Номер. Название задачи

**Подход:** Краткое объяснение подхода (2-3 предложения)

\`\`\`${language === 'sql' ? 'sql' : 'java'}
код решения
\`\`\`

**Временная сложность:** O(?)
**Пространственная сложность:** O(?)

Разделяй задачи пустой строкой.

Будь лаконичным, пиши только суть.` 
    }
  ];
  
  // Добавляем все скриншоты
  for (const screenshot of screenshots) {
    content.push(this.provider.formatImageForProvider(screenshot.data));
  }

  const messages: Message[] = [
    { 
      role: 'system', 
      content: 'Ты Senior Developer. Решаешь задачи по программированию с изображений. Отвечай кратко, профессионально, только суть. Если видишь несколько задач - реши каждую отдельно.' 
    },
    { role: 'user', content }
  ];

  const modelToUse = this.config.solutionModel;
  
  const response = await this.provider.chat(messages, modelToUse, {
    temperature: 0.1,
    maxTokens: 4000,
  });

  console.log("Vision response:", response.content);

  // Парсим ответ с поддержкой множественных задач
  return this.parseVisionSolution(response.content);
}
  /**
   * Парсит ответ от vision-запроса
   */
/**
 * Парсит ответ от vision-запроса с поддержкой множественных задач
 */
private parseVisionSolution(content: string): any {
  // Способ 1: Разделяем по заголовкам вида "### N." или "N." или "Задача N"
  const headerSplit = content.split(/(?=###?\s*\d+\.|Задача\s*\d+)/);
  
  // Способ 2: Если заголовков нет, пробуем разделить по блокам кода
  if (headerSplit.length <= 1) {
    // Ищем все блоки кода
    const codeBlocks = [...content.matchAll(/```(?:\w+)?\s*([\s\S]*?)```/g)];
    
    if (codeBlocks.length > 1) {
      // Несколько блоков кода - скорее всего несколько задач
      return this.parseByCodeBlocks(content, codeBlocks);
    }
  }
  
  // Способ 3: Если явного разделения нет, но контент большой - пробуем разделить логически
  if (headerSplit.length <= 1 && content.length > 500) {
    const logicalSplit = this.tryLogicalSplit(content);
    if (logicalSplit.length > 1) {
      const tasks = logicalSplit.map(block => this.parseSingleTask(block));
      return this.combineMultipleTasks(tasks, content);
    }
  }
  
  // Если headerSplit дал несколько частей
  if (headerSplit.length > 1) {
    const tasks = headerSplit
      .filter(block => block.trim().length > 0)
      .map(block => this.parseSingleTask(block));
    
    if (tasks.length > 1) {
      return this.combineMultipleTasks(tasks, content);
    }
  }
  
  // Одна задача
  return this.parseSingleTask(content);
}

/**
 * Парсинг по блокам кода (когда заголовков нет)
 */
private parseByCodeBlocks(content: string, codeBlocks: RegExpMatchArray[]): any {
  const tasks: any[] = [];
  let lastIndex = 0;
  
  for (let i = 0; i < codeBlocks.length; i++) {
    const block = codeBlocks[i];
    const blockIndex = block.index || 0;
    
    // Текст перед текущим блоком кода
    const textBeforeBlock = content.substring(lastIndex, blockIndex).trim();
    
    // Текст после блока кода (до следующего блока или конца)
    const nextBlockIndex = i < codeBlocks.length - 1 
      ? (codeBlocks[i + 1].index || content.length)
      : content.length;
    const textAfterBlock = content.substring(blockIndex + block[0].length, nextBlockIndex).trim();
    
    // Объединяем текст до и после для контекста задачи
    const taskContext = textBeforeBlock + (textBeforeBlock && textAfterBlock ? '\n' : '') + textAfterBlock;
    
    tasks.push({
      code: block[1].trim(),
      thoughts: taskContext ? [taskContext] : [],
      time_complexity: this.extractComplexity(taskContext),
      space_complexity: this.extractComplexity(taskContext, true),
      professional: true
    });
    
    lastIndex = nextBlockIndex;
  }
  
  return this.combineMultipleTasks(tasks, content);
}

/**
 * Пытается логически разделить контент на задачи
 */
private tryLogicalSplit(content: string): string[] {
  // Ищем разделители: пустые строки, горизонтальные линии, множественные переводы строк
  const splits = content.split(/\n\s*\n\s*\n/); // 3+ пустых строки
  
  if (splits.length > 1) {
    return splits;
  }
  
  // Разделяем по строкам с "---" или "***"
  const lineSplit = content.split(/\n[-*]{3,}\n/);
  if (lineSplit.length > 1) {
    return lineSplit;
  }
  
  return [content];
}

/**
 * Извлекает сложность из текста
 */
private extractComplexity(text: string, isSpace = false): string {
  const patterns = isSpace
    ? [/(?:пространственная сложность|space complexity)[:\s]*([^\n]+)/i]
    : [/(?:временная сложность|time complexity)[:\s]*([^\n]+)/i];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  
  // Пытаемся найти O-нотацию
  const oMatch = text.match(/O\([^)]+\)/g);
  if (oMatch && oMatch.length > (isSpace ? 1 : 0)) {
    const index = isSpace ? Math.min(1, oMatch.length - 1) : 0;
    return oMatch[index];
  }
  
  return isSpace ? 'O(1)' : 'O(n)';
}

/**
 * Объединяет несколько задач в один ответ
 */
private combineMultipleTasks(tasks: any[], rawContent: string): any {
  const combinedCode = tasks.map((t, i) => {
    const separator = i > 0 ? '\n\n' : '';
    return separator + (t.title ? `// ${t.title}\n` : `// Task ${i + 1}\n`) + t.code;
  }).join('');
  
  const combinedThoughts = tasks.flatMap(t => t.thoughts || []);
  const combinedTime = tasks.map(t => t.time_complexity).join(', ');
  const combinedSpace = tasks.map(t => t.space_complexity).join(', ');
  
  return {
    code: combinedCode,
    thoughts: combinedThoughts,
    time_complexity: combinedTime || 'O(n)',
    space_complexity: combinedSpace || 'O(1)',
    type: 'multiple',
    tasks: tasks,
    raw: rawContent
  };
}

/**
 * Парсит одну задачу из блока
 */
private parseSingleTask(block: string): any {
  // Ищем все блоки кода
  const codeMatches = [...block.matchAll(/```(?:\w+)?\s*([\s\S]*?)```/g)];
  const code = codeMatches.length > 0 
    ? codeMatches.map(m => m[1].trim()).join('\n\n')
    : block;
  
  // Извлекаем сложность
  const timeComplexity = this.extractComplexity(block);
  const spaceComplexity = this.extractComplexity(block, true);
  
  // Извлекаем мысли (всё до первого блока кода)
  const thoughtsMatch = block.match(/^([\s\S]*?)(?=```|$)/);
  const thoughts = thoughtsMatch 
    ? [thoughtsMatch[1].trim().replace(/^###?\s*\d*\.?\s*/, '')] // Убираем возможные заголовки
    : [];
  
  // Извлекаем название/номер задачи
  const titleMatch = block.match(/^###?\s*([^\n]+)/);
  const title = titleMatch ? titleMatch[1].trim() : '';
  
  return {
    code,
    thoughts,
    time_complexity: timeComplexity,
    space_complexity: spaceComplexity,
    title,
    professional: true
  };
}

  /**
   * Новый метод генерации решения из ExtractedContent
   * ЗАКОММЕНТИРОВАНО - не используется в одноэтапном режиме
   
  private async generateSolutionFromExtracted(
    extracted: ExtractedContent,
    signal: AbortSignal
  ): Promise<any> {
    const language = await this.getLanguage();
    const mainWindow = this.deps.getMainWindow();
    
    try {
      if (extracted.multipleTasks && extracted.multipleTasks.length > 0) {
        if (mainWindow) {
          mainWindow.webContents.send('processing-status', {
            message: `Генерирую решения для ${extracted.multipleTasks.length} задач...`,
            progress: 60
          });
        }
        
        const solutions = await Promise.all(
          extracted.multipleTasks.map((task, index) => 
            this.solveSingleTask(task, index, signal)
          )
        );
        
        const combinedCode = solutions.map(s => s.code).join('\n\n');
        const combinedThoughts = solutions.flatMap(s => s.thoughts || []);
        const combinedTime = solutions.map(s => s.time_complexity).filter(Boolean).join(', ');
        const combinedSpace = solutions.map(s => s.space_complexity).filter(Boolean).join(', ');
        
        return {
          code: combinedCode,
          thoughts: combinedThoughts,
          time_complexity: combinedTime || 'O(n)',
          space_complexity: combinedSpace || 'O(1)',
          type: 'multiple',
          tasks: solutions
        };
      }
      
      if (mainWindow) {
        mainWindow.webContents.send('processing-status', {
          message: 'Генерирую решение...',
          progress: 60
        });
      }
      
      return this.solveSingleTask(extracted, 0, signal);
    } catch (error) {
      console.error('Error in generateSolutionFromExtracted:', error);
      throw error;
    }
  }
  */
  
  /**
   * Решение одной задачи с форматированием под старый API
   * ЗАКОММЕНТИРОВАНО - не используется в одноэтапном режиме
   
  private async solveSingleTask(
    task: ExtractedContent,
    taskIndex: number,
    signal: AbortSignal
  ): Promise<any> {
    const language = task.type === 'sql_task' ? 'sql' : 'java';
    
    let prompt = '';
    if (task.type === 'code_review') {
      prompt = CODE_REVIEW_PROMPT(task.codeReview?.originalCode || task.rawText);
    } else {
      prompt = SOLUTION_PROMPT(task.rawText, language);
    }
    
    const messages: Message[] = [
      { 
        role: 'system', 
        content: 'Ты Senior Developer. Отвечай кратко, профессионально, только суть.' 
      },
      { role: 'user', content: prompt }
    ];
    
    const response = await this.provider.chat(messages, this.config.solutionModel, {
      temperature: 0.1,
      maxTokens: 2000,
    });
    
    return this.parseProfessionalResponse(response.content, task, taskIndex);
  }

  private parseProfessionalResponse(
    content: string,
    task: ExtractedContent,
    taskIndex: number
  ): any {
    const codeMatch = content.match(/```(?:\w+)?\s*([\s\S]*?)```/);
    const code = codeMatch ? codeMatch[1].trim() : content;
    
    const complexityLines = content.split('\n')
      .filter(line => line.includes('Сложность') || line.includes('O('))
      .slice(-2);
    
    const timeComplexity = complexityLines.find(l => 
      l.toLowerCase().includes('временная') || l.includes('time')
    ) || 'O(n)';
    
    const spaceComplexity = complexityLines.find(l => 
      l.toLowerCase().includes('пространственная') || l.includes('space')
    ) || 'O(1)';
    
    return {
      code,
      thoughts: [],
      time_complexity: timeComplexity,
      space_complexity: spaceComplexity,
      type: task.type,
      professional: true
    };
  }
  */

  /**
   * Парсит ответ в формат, ожидаемый фронтендом
   * ЗАКОММЕНТИРОВАНО - не используется в одноэтапном режиме
   
  private parseSolutionResponse(
    content: string,
    task: ExtractedContent,
    taskIndex: number
  ): any {
    const codeMatches = [...content.matchAll(/```(?:\w+)?\s*([\s\С]*?)```/g)];
    
    let code = '';
    if (codeMatches.length > 0) {
      code = codeMatches.map((match, i) => {
        if (task.multipleTasks) {
          return `// ========== Задача ${taskIndex + 1} ==========\n\n${match[1].trim()}`;
        }
        return match[1].trim();
      }).join('\n\n\n');
    } else {
      code = content;
    }
    
    const thoughtsMatch = content.match(/(?:объяснение|explanation|approach|подход)[:\s]*([^]*?)(?=код|code|```|$)/i);
    const thoughts = thoughtsMatch 
      ? [thoughtsMatch[1].trim()]
      : [`Решение для задачи типа ${task.type}`];
    
    const timeMatch = content.match(/(?:временная сложность|time complexity)[:\s]*([^\n]+)/i);
    const spaceMatch = content.match(/(?:пространственная сложность|space complexity)[:\s]*([^\n]+)/i);
    
    return {
      code,
      thoughts,
      time_complexity: timeMatch ? timeMatch[1].trim() : 'O(n)',
      space_complexity: spaceMatch ? spaceMatch[1].trim() : 'O(1)',
      type: task.type,
      raw: content
    };
  }
  */

  // Оставляем старый метод для обратной совместимости, но делаем его заглушкой
  private async generateSolutionsHelper(signal: AbortSignal): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    console.warn('generateSolutionsHelper is deprecated, using solveWithVision');
    return { success: false, error: 'Not available in single-step mode' };
  }
}