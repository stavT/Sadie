#!/usr/bin/env node

// Load environment variables
require('dotenv').config();

// Import required modules
const OpenAI = require('openai');
const recorder = require('node-record-lpcm16');
const fs = require('fs');
const path = require('path');
const blessed = require('blessed');
const { exec } = require('child_process');
const axios = require('axios');

// Initialize OpenAI client
// Support both regular API keys and project-based API keys
let openai;
try {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    // Add project configuration if using a project-based key
    ...(process.env.OPENAI_API_KEY.startsWith('sk-proj-') ? {
      defaultHeaders: {
        'OpenAI-Beta': 'babel:model-completions-v2',
      },
      defaultQuery: { project: 'babel' },
    } : {})
  });
} catch (error) {
  console.warn('Warning: Error initializing OpenAI client:', error.message);
  openai = null;
}

// Constants
const RECORDING_DURATION_MS = 10000; // 10 seconds
const AUDIO_FILE_PATH = path.join(__dirname, 'recording.wav');
const COMMAND = process.argv[2];

// Main function
async function main() {
  if (COMMAND !== 'start') {
    console.log('Usage: node index.js start');
    process.exit(1);
  }

  try {
    console.log('🎙️  Starting audio recording for 10 seconds...');
    const audioBuffer = await recordAudio();
    console.log('✅ Recording complete!');

    console.log('🔄 Processing audio...');
    let transcription = await processAudio(audioBuffer);
    
    if (!transcription) {
      console.log('No transcribable audio detected or transcription failed.');
      process.exit(0);
    }
    
    console.log('📝 Transcription:', transcription);

    console.log('🤖 Analyzing for actionable items...');
    const tickets = await generateTickets(transcription);
    
    if (!tickets || tickets.length === 0) {
      console.log('No actionable items detected in the conversation.');
      process.exit(0);
    }
    
    console.log('🎫 Generated tickets:');
    tickets.forEach((ticket, i) => console.log(`   ${i + 1}. ${ticket}`));

    console.log('📊 Displaying tickets in GUI...');
    const responses = await displayTicketsGUI(tickets);
    
    console.log('\n📋 Meeting Report:');
    const acceptedTickets = responses
      .filter(r => r.status === 'accepted')
      .map(r => r.ticket);
    
    if (acceptedTickets.length === 0) {
      console.log('No tickets were accepted.');
    } else {
      console.log('Accepted tickets:');
      acceptedTickets.forEach((ticket, i) => {
        console.log(`   ${i + 1}. ${ticket}`);
      });
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Record audio for a specified duration
async function recordAudio() {
  return new Promise((resolve, reject) => {
    console.log('Recording...');
    
    // Create a write stream for the audio file
    const file = fs.createWriteStream(AUDIO_FILE_PATH, { encoding: 'binary' });
    
    // Start recording
    const recording = recorder.record({
      sampleRate: 16000,
      channels: 1,
      audioType: 'wav'
    });
    
    // Pipe the audio data to the file
    recording.stream().pipe(file);
    
    // Stop recording after the specified duration
    setTimeout(() => {
      recording.stop();
      console.log('Recording stopped.');
      
      // Read the recorded file as a buffer
      fs.readFile(AUDIO_FILE_PATH, (err, data) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(data);
      });
    }, RECORDING_DURATION_MS);
  });
}

// Process audio and attempt to get a transcription
async function processAudio(audioBuffer) {
  // Check if we have a valid OpenAI client
  if (!openai) {
    console.log('OpenAI client not initialized, cannot transcribe audio.');
    return null;
  }

  const isProjectKey = process.env.OPENAI_API_KEY.startsWith('sk-proj-');
  
  try {
    let transcriptionText;
    
    if (isProjectKey) {
      // For project keys, try a direct API call using axios and FormData
      console.log('Using project key for transcription, attempting direct API access...');
      try {
        // Create a FormData object to send the audio file
        const FormData = require('form-data');
        const formData = new FormData();
        formData.append('file', fs.createReadStream(AUDIO_FILE_PATH));
        formData.append('model', 'whisper-1');
        
        // Make direct API call
        const result = await axios.post(
          'https://api.openai.com/v1/audio/transcriptions',
          formData,
          {
            headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              ...formData.getHeaders()
            }
          }
        );
        
        if (result.data && result.data.text) {
          transcriptionText = result.data.text;
        } else {
          throw new Error('Invalid response format from API');
        }
      } catch (axiosError) {
        console.warn('Direct API call for transcription failed:', axiosError.message);
        console.log('Attempting with standard client as fallback...');
        // Try with the standard client as fallback
        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(AUDIO_FILE_PATH),
          model: "whisper-1",
        });
        transcriptionText = transcription.text;
      }
    } else {
      // Standard API key case
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(AUDIO_FILE_PATH),
        model: "whisper-1",
      });
      transcriptionText = transcription.text;
    }
    
    // Check if we got a meaningful transcription
    if (!transcriptionText || transcriptionText.trim() === "") {
      console.log('No speech detected in the audio.');
      return null;
    }
    
    return transcriptionText;
  } catch (error) {
    console.warn('Failed to transcribe audio:', error.message);
    return null;
  }
}

// Generate tickets only if actionable items are detected
async function generateTickets(transcription) {
  if (!transcription) return [];
  
  const prompt = `
You are an AI assistant for technical teams. Analyze this meeting transcription and extract actionable tickets only if clear tasks were assigned.
Format each ticket as: "TO DO [Name]: Task description"
Identify names of people who were assigned tasks in the meeting.
If no clear tasks or assignments were detected, respond with "NO_TICKETS_NEEDED".

Meeting transcription:
${transcription}

Respond with just the tickets, one per line, or "NO_TICKETS_NEEDED" if no clear tasks were assigned.
`;

  try {
    // Check if we have a valid OpenAI client
    if (!openai) {
      console.log('OpenAI client not initialized, cannot generate tickets.');
      return [];
    }

    // Project keys might need special handling
    const isProjectKey = process.env.OPENAI_API_KEY.startsWith('sk-proj-');
    
    let response;
    if (isProjectKey) {
      // For project keys, we can try using axios directly to the API
      try {
        const result = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: "gpt-3.5-turbo",
            messages: [
              { role: "system", content: "You are a helpful assistant that creates actionable tickets from meeting transcriptions only when tasks are clearly assigned." },
              { role: "user", content: prompt }
            ],
            max_tokens: 200,
          },
          {
            headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );
        response = result.data;
      } catch (axiosError) {
        console.log('Direct API call failed, falling back to standard client');
        // If direct API call fails, try the standard client anyway
        response = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            { role: "system", content: "You are a helpful assistant that creates actionable tickets from meeting transcriptions only when tasks are clearly assigned." },
            { role: "user", content: prompt }
          ],
          max_tokens: 200,
        });
      }
    } else {
      // Standard API key case
      response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a helpful assistant that creates actionable tickets from meeting transcriptions only when tasks are clearly assigned." },
          { role: "user", content: prompt }
        ],
        max_tokens: 200,
      });
    }

    // Extract tickets from the response
    let content;
    if (isProjectKey && response.choices) {
      // Handle axios direct API response format
      content = response.choices[0].message.content.trim();
    } else {
      // Handle standard client response format
      content = response.choices[0].message.content.trim();
    }
    
    // If no tickets were needed, return empty array
    if (content === "NO_TICKETS_NEEDED") {
      return [];
    }
    
    return content.split('\n').filter(line => line.trim().startsWith('TO DO'));
  } catch (error) {
    console.error('Error analyzing conversation:', error.message);
    return [];
  }
}

// Display tickets in a GUI with accept/decline buttons
function displayTicketsGUI(tickets) {
  return new Promise((resolve) => {
    // Create a screen object
    const screen = blessed.screen({
      smartCSR: true,
      title: 'Meeting Tickets'
    });

    // Create a box for the title
    const title = blessed.box({
      top: 0,
      left: 'center',
      width: '90%',
      height: 3,
      content: '{center}Meeting Tickets{/center}',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        bg: 'blue',
        border: {
          fg: '#f0f0f0'
        }
      }
    });

    // Add the title to the screen
    screen.append(title);

    // Track responses for each ticket
    const responses = tickets.map(ticket => ({ 
      ticket, 
      status: 'pending' 
    }));

    // Create a box for each ticket with accept/decline buttons
    tickets.forEach((ticket, index) => {
      const ticketBox = blessed.box({
        top: 4 + index * 6,
        left: 'center',
        width: '90%',
        height: 5,
        content: ticket,
        tags: true,
        border: {
          type: 'line'
        },
        style: {
          border: {
            fg: '#f0f0f0'
          }
        }
      });

      const acceptButton = blessed.button({
        parent: ticketBox,
        bottom: 0,
        left: '25%',
        width: 10,
        height: 1,
        content: 'Accept',
        padding: {
          left: 1,
          right: 1
        },
        style: {
          bg: 'green',
          focus: {
            bg: 'brightGreen'
          },
          hover: {
            bg: 'brightGreen'
          }
        },
        mouse: true
      });

      const declineButton = blessed.button({
        parent: ticketBox,
        bottom: 0,
        right: '25%',
        width: 10,
        height: 1,
        content: 'Decline',
        padding: {
          left: 1,
          right: 1
        },
        style: {
          bg: 'red',
          focus: {
            bg: 'brightRed'
          },
          hover: {
            bg: 'brightRed'
          }
        },
        mouse: true
      });

      acceptButton.on('click', () => {
        console.log(`Accepted: ${ticket}`);
        responses[index].status = 'accepted';
        ticketBox.style.bg = 'green';
        ticketBox.style.fg = 'white';
        screen.render();
      });

      declineButton.on('click', () => {
        console.log(`Declined: ${ticket}`);
        responses[index].status = 'declined';
        ticketBox.style.bg = 'red';
        ticketBox.style.fg = 'white';
        screen.render();
      });

      screen.append(ticketBox);
    });

    // Create a close button
    const closeButton = blessed.button({
      bottom: 1,
      left: 'center',
      width: 12,
      height: 1,
      content: 'Close',
      padding: {
        left: 1,
        right: 1
      },
      style: {
        bg: 'blue',
        focus: {
          bg: 'brightBlue'
        },
        hover: {
          bg: 'brightBlue'
        }
      },
      mouse: true
    });

    closeButton.on('click', () => {
      screen.destroy();
      resolve(responses);
    });

    screen.append(closeButton);

    // Quit on Escape, q, or Control-C
    screen.key(['escape', 'q', 'C-c'], () => {
      screen.destroy();
      resolve(responses);
    });

    // Render the screen
    screen.render();
  });
}

// Run the main function
if (require.main === module) {
  main();
}

module.exports = { 
  recordAudio, 
  processAudio, 
  generateTickets, 
  displayTicketsGUI 
};
