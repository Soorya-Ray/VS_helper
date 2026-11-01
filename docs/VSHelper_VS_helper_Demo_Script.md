# VS_helper demo recording script

Target length: about 7 minutes. Maximum allowed length: 10 minutes.

Use your own voice while recording the screen. A webcam photo or camera view is optional if your own audio narration is present. Do not show passwords, API keys or unrelated personal windows.

## Before recording

Double-click `Start-Local-Demo.cmd` in the working project folder. Wait for the local model warmup and for VS Code to open. Run **VS_helper: Test Provider Connection**. The provider must say **Ollama local**, with model **qwen2.5-coder:1.5b**. Close unrelated apps and notifications.

Keep the eight-slide presentation and VS Code ready. For the Python example, remove only the accepted return statement and leave the four spaces below the function signature. Keep the JavaScript and TypeScript demo bodies blank. Save before recording so there is no save-conflict dialog.

## 0:00 to 0:35  Introduction

Show the title slide.

“Hello, I am Soorya Prataap Ray, register number 24BAI1008. My project is VS_helper, a VS Code extension for local code completion. It uses Ollama and a code model running on the same computer. I will explain the main idea and then show the extension working in the editor.”

## 0:35 to 1:15  Problem and scope

Show the problem and scope slide.

“Many code completion tools use a cloud service. That means the code context may leave the computer, and the tool needs a connection to that service. The aim of this project is to provide a local option. The current version works with Python, JavaScript, TypeScript, JSX and TSX. It uses the code near the cursor in the active file. Full repository search is outside the current scope.”

## 1:15 to 2:00  Architecture

Show the architecture slide.

“First, VS Code gives the extension the document and cursor position. The extension selects a limited amount of surrounding code and builds a prompt. It sends the request to Ollama at 127.0.0.1 on port 11434. The local model returns a continuation. The extension cleans extra text and displays the result as ghost text. The developer still decides whether to insert it.”

“The extension has a typing delay and cancels requests that are no longer needed. It also rejects remote Ollama addresses and HTTP redirects.”

## 2:00 to 2:45  Show the provider

Switch to VS Code. Press F1 and run **VS_helper: Open Local AI Dashboard**. Click **Test connection**. Show the provider, local endpoint and model.

“This is the dashboard. The selected provider is Ollama local, and the model is qwen2.5-coder with 1.5 billion parameters. This demonstration does not use the Groq cloud API. The model has already been downloaded, and it is running on this computer.”

Click **Select model** to show the installed model, then press Escape without changing it.

## 2:45 to 3:45  Python completion

Open `01_python.py`. Put the cursor after the indentation below `def add(a, b):`. Click the sparkle icon in the editor toolbar, or use F1 and **VS_helper: Trigger Inline Suggestion**.

“Here I have a function signature and a comment asking for the sum of two numbers. I request a suggestion. The grey text is only a preview.”

Wait for the actual ghost text. Pause for two seconds so it is visible. Press Tab.

“Now I press Tab to accept it. The return statement becomes part of the file only after acceptance.”

If you accidentally dismiss it, trigger again. If generation is slow, keep the pause in the recording or trim only the waiting time without hiding the request and result.

## 3:45 to 4:45  JavaScript and TypeScript

Open `02_javascript.js`. Put the cursor in the blank body of `filterEven`. Request a suggestion, pause to show the grey text, then accept with Tab.

“The JavaScript example asks for even numbers from an array. The extension uses the existing function and the code after the cursor. It avoids inserting a second closing brace.”

Open `03_typescript.ts` and repeat inside `clamp`.

“The TypeScript example keeps a value between the given minimum and maximum. These are small examples used to demonstrate the completion workflow. Generated code still needs review.”

## 4:45 to 5:30  Controls and results

Return to the dashboard. Show the last completion time and the session counts. Disable completion, return to a blank demo location and run the trigger command. Show that it is disabled. Enable completion again.

“The dashboard provides controls to enable or disable completion, select a model and test the connection. It also shows the last completion time and the number of suggestions accepted during the session. The output log records timing information without storing the source code.”

## 5:30 to 6:15  Testing and challenges

Show the testing slide and then the challenges slide.

“The project has 43 passing unit tests. I also checked real local-model output for Python, JavaScript and TypeScript. The live editor test passed suggestion triggering and acceptance. These checks cover only a small set of tasks.”

“The main practical issues were interrupted model downloads, extra generated code and shortcut conflicts with other applications. The implementation uses verified model downloads, output cleanup and an editor toolbar action to handle these issues. Future work includes testing more coding tasks, comparing other local models and measuring the full editing delay.”

## 6:15 to 7:00  Source and closing

Show the public GitHub repository and README setup section.

“The public source repository contains the extension, tests, demo files, setup instructions and the presentation. A hosted app URL is not needed because this is a desktop VS Code extension. The main local workflow does not require an API key. This completes the demonstration of VS_helper. Thank you.”

Stop the recording. Play it once to check that your narration is audible and the actual grey suggestions are visible. Upload the video file directly to the Teams assignment.
