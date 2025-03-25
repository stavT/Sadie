# Meld Tech Mini

A minimal AI-powered meeting assistant for technical teams. This application records audio, transcribes it using OpenAI, analyzes for actionable items, and displays any detected tasks as tickets in a simple GUI.

## Features

1. **Audio Recording**: Records audio for 10 seconds when started
2. **Speech Recognition**: Uses OpenAI's Whisper model to transcribe the audio
3. **Task Detection**: Analyzes the transcription to identify actual actionable items
4. **GUI Interface**: Displays detected tasks as tickets with accept/decline buttons
5. **Meeting Report**: Prints a summary of accepted tickets to the console

## Prerequisites

- Node.js (v14 or higher recommended)
- An OpenAI API key
- SoX audio tool (install via `brew install sox` on macOS)

## Installation

1. Clone the repository or download the source code
2. Navigate to the project directory
3. Install dependencies:

```bash
npm install
```

4. Create a `.env` file in the project root directory with your OpenAI API key:

```
OPENAI_API_KEY=your_api_key_here
```

## API Key Support

This application works with both types of OpenAI API keys:

- **Standard API Keys**: Starting with `sk-...` (supports all features)
- **Project API Keys**: Starting with `sk-proj-...` (fully supported through direct API access)

## Usage

Start the application by running:

```bash
npm start
```

Or:

```bash
node index.js start
```

The application flow:
1. Records audio for 10 seconds
2. Transcribes the audio using OpenAI's Whisper model
3. Analyzes the transcription for actual actionable items
4. Only generates tickets if clear tasks were assigned
5. Displays any detected tickets in a GUI popup
6. Prints a report of accepted tickets to the console

## Intelligent Task Detection

The application only creates tickets when it detects actual task assignments in the conversation. If no clear tasks were discussed or no speech was detected, the app will notify you and exit gracefully.

## Technical Details

- Built with Node.js
- Uses OpenAI APIs for transcription and task analysis
- GUI built with the `blessed` terminal UI library
- Audio recording with `node-record-lpcm16` and SoX
- Supports direct API access for project keys 