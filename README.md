# CodeInterviewAssist
[![en](https://img.shields.io/badge/lang-en-red.svg)](README.md)
[![ru](https://img.shields.io/badge/lang-ru-blue.svg)](README.ru.md)

This is a fork of [j4wg/interview-coder-withoupaywall-opensource](https://github.com/j4wg/interview-coder-withoupaywall-opensource) with the following improvements:

- **Extended Provider Support**: Easier provider architecture. Added Ollama and OpenRouter integrations.
- **Multi-Monitor Support**: Full support for 2K monitors and multi-display systems (captures primary display).
- **Screenshot Preprocessing**: Added preprocessing pipeline for screenshots to maintain functionality on dark backgrounds. Includes optimization opportunities for token savings and speed - cropping, grayscale, compression.
- **Code Refactoring**: Restructured ProcessingHelper into separate modules: prompts, image processing, response formatting.
- **Single Model Pipeline**: In the `one-model-for-all` branch, consolidated recognition and processing into one model. `qwen3.5:9b` shows excellent results.

### Hiding Terminal Window

To hide the terminal window, use [RBTray](https://github.com/benbuck/rbtray):

1. Launch RBTray
2. Focus the desired window
3. Press `Ctrl + Alt + Down Arrow` to minimize to system tray

## Free, Open-Source AI-Powered Interview Preparation Tool

This project provides a powerful alternative to premium coding interview platforms. It delivers the core functionality of paid interview preparation tools but in a free, open-source package. Using your own OpenAI API key, you get access to advanced features like AI-powered problem analysis, solution generation, and debugging assistance - all running locally on your machine.

### Why This Exists

The best coding interview tools are often behind expensive paywalls, making them inaccessible to many students and job seekers. This project provides the same powerful functionality without the cost barrier, letting you:

- Use your own API key (pay only for what you use)
- Run everything locally on your machine with complete privacy
- Make customizations to suit your specific needs
- Learn from and contribute to an open-source tool

### Customization Possibilities

The codebase is designed to be adaptable:

- **AI Models**: Though currently using OpenAI's models, you can modify the code to integrate with other providers like Claude, Deepseek, Llama, or any model with an API. All integration code is in `electron/ProcessingHelper.ts` and UI settings are in `src/components/Settings/SettingsDialog.tsx`.
- **Languages**: Add support for additional programming languages
- **Features**: Extend the functionality with new capabilities 
- **UI**: Customize the interface to your preferences

All it takes is modest JavaScript/TypeScript knowledge and understanding of the API you want to integrate.

## Features

- 🎯 99% Invisibility: Undetectable window that bypasses most screen capture methods
- 📸 Smart Screenshot Capture: Capture both question text and code separately for better analysis
- 🤖 AI-Powered Analysis: Automatically extracts and analyzes coding problems using GPT-4o
- 💡 Solution Generation: Get detailed explanations and solutions with time/space complexity analysis
- 🔧 Real-time Debugging: Debug your code with AI assistance and structured feedback
- 🎨 Advanced Window Management: Freely move, resize, change opacity, and zoom the window
- 🔄 Model Selection: Choose between GPT-4o and GPT-4o-mini for different processing stages
- 🔒 Privacy-Focused: Your API key and data never leave your computer except for OpenAI API calls

## Global Commands

The application uses unidentifiable global keyboard shortcuts that won't be detected by browsers or other applications:

- Toggle Window Visibility: [Control or Cmd + B]
- Move Window: [Control or Cmd + Arrow keys]
- Take Screenshot: [Control or Cmd + H]
- Delete Last Screenshot: [Control or Cmd + L]
- Process Screenshots: [Control or Cmd + Enter]
- Start New Problem: [Control or Cmd + R]
- Quit: [Control or Cmd + Q]
- Decrease Opacity: [Control or Cmd + []
- Increase Opacity: [Control or Cmd + ]]
- Zoom Out: [Control or Cmd + -]
- Reset Zoom: [Control or Cmd + 0]
- Zoom In: [Control or Cmd + =]

## Invisibility Compatibility

The application is invisible to:

- Zoom versions below 6.1.6 (inclusive)
- All browser-based screen recording software
- All versions of Discord
- Mac OS _screenshot_ functionality (Command + Shift + 3/4)

Note: The application is **NOT** invisible to:

- Zoom versions 6.1.6 and above
  - https://zoom.en.uptodown.com/mac/versions (link to downgrade Zoom if needed)
- Mac OS native screen _recording_ (Command + Shift + 5)

## Prerequisites

- Node.js (v16 or higher)
- npm or bun package manager
- OpenAI API Key
- Screen Recording Permission for Terminal/IDE
  - On macOS:
    1. Go to System Preferences > Security & Privacy > Privacy > Screen Recording
    2. Ensure that CodeInterviewAssist has screen recording permission enabled
    3. Restart CodeInterviewAssist after enabling permissions
  - On Windows:
    - No additional permissions needed
  - On Linux:
    - May require `xhost` access depending on your distribution

## Running the Application

### Quick Start

1. Clone the repository:

```bash
git clone https://github.com/Lanctole/interview-helper.git
cd interview-helper
```

2. Install dependencies:

```bash
npm install
```

3. **RECOMMENDED**: Clean any previous builds:

```bash
npm run clean
```

4. Run the appropriate script for your platform:

**For Windows:**
```bash
stealth-run.bat
```

**For macOS/Linux:**
```bash
# Make the script executable first
chmod +x stealth-run.sh
./stealth-run.sh
```

**IMPORTANT**: The application window will be invisible by default! Use Ctrl+B (or Cmd+B on Mac) to toggle visibility.

### Building Distributable Packages

To create installable packages for distribution:

**For macOS (DMG):**
```bash
# Using npm
npm run package-mac

# Or using yarn
yarn package-mac
```

**For Windows (Installer):**
```bash
# Using npm
npm run package-win

# Or using yarn
yarn package-win
```

The packaged applications will be available in the `release` directory.

**What the scripts do:**
- Create necessary directories for the application
- Clean previous builds to ensure a fresh start
- Build the application in production mode
- Launch the application in invisible mode

### Notes & Troubleshooting

- **Window Manager Compatibility**: Some window management tools (like Rectangle Pro on macOS) may interfere with the app's window movement. Consider disabling them temporarily.

- **API Usage**: Be mindful of your OpenAI API key's rate limits and credit usage. Vision API calls are more expensive than text-only calls.

- **LLM Customization**: You can easily customize the app to include LLMs like Claude, Deepseek, or Grok by modifying the API calls in `ProcessingHelper.ts` and related UI components.

- **Common Issues**:
  - Run `npm run clean` before starting the app for a fresh build
  - Use Ctrl+B/Cmd+B multiple times if the window doesn't appear
  - Adjust window opacity with Ctrl+[/]/Cmd+[/] if needed
  - For macOS: ensure script has execute permissions (`chmod +x stealth-run.sh`)

## Comparison with Paid Interview Tools

| Feature | Premium Tools (Paid) | CodeInterviewAssist (This Project) |
|---------|------------------------|----------------------------------------|
| Price | $60/month subscription | Free (only pay for your API usage) |
| Solution Generation | ✅ | ✅ |
| Debugging Assistance | ✅ | ✅ |
| Invisibility | ✅ | ✅ |
| Multi-language Support | ✅ | ✅ |
| Time/Space Complexity Analysis | ✅ | ✅ |
| Window Management | ✅ | ✅ |
| Auth System | Required | None (Simplified) |
| Payment Processing | Required | None (Use your own API key) |
| Privacy | Server-processed | 100% Local Processing |
| Customization | Limited | Full Source Code Access |
| Model Selection | Limited | Choice Between Models |

## Tech Stack

- Electron
- React
- TypeScript
- Vite
- Tailwind CSS
- Radix UI Components
- OpenAI API

## How It Works

1. **Initial Setup**
   - Launch the invisible window
   - Enter your OpenAI API key in the settings
   - Choose your preferred model for extraction, solution generation, and debugging

2. **Capturing Problem**
   - Use global shortcut [Control or Cmd + H] to take screenshots of code problems
   - Screenshots are automatically added to the queue of up to 2
   - If needed, remove the last screenshot with [Control or Cmd + L]

3. **Processing**
   - Press [Control or Cmd + Enter] to analyze the screenshots
   - AI extracts problem requirements from the screenshots using GPT-4 Vision API
   - The model generates an optimal solution based on the extracted information
   - All analysis is done using your personal OpenAI API key

4. **Solution & Debugging**
   - View the generated solutions with detailed explanations
   - Use debugging feature by taking more screenshots of error messages or code
   - Get structured analysis with identified issues, corrections, and optimizations
   - Toggle between solutions and queue views as needed

5. **Window Management**
   - Move window using [Control or Cmd + Arrow keys]
   - Toggle visibility with [Control or Cmd + B]
   - Adjust opacity with [Control or Cmd + [] and [Control or Cmd + ]]
   - Window remains invisible to specified screen sharing applications
   - Start a new problem using [Control or Cmd + R]

6. **Language Selection

   - Easily switch between programming languages with a single click
   - Use arrow keys for keyboard navigation through available languages
   - The system dynamically adapts to any languages added or removed from the codebase
   - Your language preference is saved between sessions

## Adding More AI Models

To add new models, simply extend the API integration in `electron/providers` and add the corresponding UI options in `src/components/Settings/SettingsDialog.tsx`. The modular design makes this straightforward without disrupting existing functionality.

## Configuration

- **OpenAI API Key**: Your personal API key is stored locally and only used for API calls to OpenAI, Gemini, OpenRouter, Ollama or esle providers
- **Model Selection**: You can choose between GPT-4o and GPT-4o-mini for each stage of processing:
  - Problem Extraction: Analyzes screenshots to understand the coding problem
  - Solution Generation: Creates optimized solutions with explanations
  - Debugging: Provides detailed analysis of errors and improvement suggestions
- **Language**: Select your preferred programming language for solutions
- **Window Controls**: Adjust opacity, position, and zoom level using keyboard shortcuts
- **All settings are stored locally** in your user data directory and persist between sessions

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).

## Support and Questions

If you have questions or need support, please open an issue on the GitHub repository.

---

> **Remember:** This is a community resource. If you find it valuable, consider contributing rather than just requesting features. The project grows through collective effort, not individual demands.
